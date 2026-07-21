"""
Unit tests for core/split_import.py structure inference.

Fixtures mimic real-world gym spreadsheets in the three supported layouts,
including messy variants (embedded set notation, blank rows, plurals,
rest days, multi-sheet workbooks, non-split content).
"""

import pytest

from core.split_import import (
    infer_sheet,
    infer_split,
    parse_day_cell,
    parse_day_header,
    parse_sets_cell,
    split_embedded_sets,
)


# ---------------------------------------------------------------------------
# Cell-level parsers
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("text,expected", [
    ("3", 3),
    ("3x8", 3),
    ("4 x 10-12", 4),
    ("3x8,8,6", 3),
    ("5X5", 5),
    ("3 sets", 3),
    ("", None),
    ("Bench Press", None),
    ("99", None),       # out of plausible set range
    ("8-12", None),     # rep range, not sets
])
def test_parse_sets_cell(text, expected):
    assert parse_sets_cell(text) == expected


@pytest.mark.parametrize("text,name,sets", [
    ("Bench Press 3x8", "Bench Press", 3),
    ("Squat - 5x5", "Squat", 5),
    ("Incline DB Press (3 sets)", "Incline DB Press", 3),
    ("RDL 3x8-10", "RDL", 3),
    ("Bench Press", "Bench Press", None),
])
def test_split_embedded_sets(text, name, sets):
    assert split_embedded_sets(text) == (name, sets)


@pytest.mark.parametrize("text,day", [
    ("Monday", 1),
    ("WED", 3),
    ("Day 4", 4),
    ("day3", 3),
    ("Push Day", None),
    ("Upper A", None),
])
def test_parse_day_header_recognized(text, day):
    header = parse_day_header(text)
    assert header is not None
    assert header[0] == day


@pytest.mark.parametrize("text", ["Bench Press", "3x8", "", "Notes about my training"])
def test_parse_day_header_rejects(text):
    assert parse_day_header(text) is None


@pytest.mark.parametrize("text,expected", [
    ("1", 1),
    ("13", 13),       # days have their own 1-14 bound, unlike sets (1-12)
    ("14", 14),
    ("15", None),
    ("Day 12", 12),
    ("Friday", 5),
    ("Squat", None),
    ("", None),
])
def test_parse_day_cell(text, expected):
    assert parse_day_cell(text) == expected


# ---------------------------------------------------------------------------
# Long format
# ---------------------------------------------------------------------------

LONG_WITH_HEADER = [
    ["Session", "Day", "Exercise", "Sets"],
    ["Push", "1", "Bench Press", "4"],
    ["Push", "1", "Overhead Press", "3"],
    ["Pull", "2", "Barbell Row", "4"],
    ["Pull", "2", "Lat Pulldowns", "3"],
    ["Legs", "4", "Squats", "5"],
    ["Legs", "4", "Leg Curls", "3"],
]


def test_long_with_header():
    parse = infer_sheet(LONG_WITH_HEADER)
    assert parse is not None
    assert parse.layout == "long"
    assert [s.name for s in parse.sessions] == ["Push", "Pull", "Legs"]
    assert [s.day_number for s in parse.sessions] == [1, 2, 4]
    push = parse.sessions[0]
    assert [(e.name, e.sets) for e in push.exercises] == [("Bench Press", 4), ("Overhead Press", 3)]
    assert all(e.status == "matched" for e in push.exercises)


def test_long_without_header_exercise_and_sets_only():
    grid = [
        ["Bench Press", "4"],
        ["Incline DB Press", "3"],
        ["Cable Flyes", "3"],
        ["Tricep Pushdown", "3"],
    ]
    parse = infer_sheet(grid)
    assert parse is not None
    assert parse.layout == "long"
    assert len(parse.sessions) == 1
    assert [e.sets for e in parse.sessions[0].exercises] == [4, 3, 3, 3]


def test_long_with_reps_and_weight_columns_ignored():
    grid = [
        ["Day", "Exercise", "Sets", "Reps", "Weight"],
        ["1", "Squat", "5", "5", "315"],
        ["1", "Romanian Deadlift", "3", "8-10", "225"],
        ["2", "Bench Press", "4", "6", "245"],
    ]
    parse = infer_sheet(grid)
    assert parse is not None
    assert parse.layout == "long"
    assert len(parse.sessions) == 2
    assert parse.sessions[0].exercises[0].sets == 5
    assert parse.sessions[0].exercises[0].name == "Squat"


def test_long_sparse_high_days_not_silently_merged():
    # Day values 13/14 are valid and must form their own sessions.
    grid = [
        ["Day", "Exercise", "Sets"],
        ["1", "Squat", "5"],
        ["2", "Bench Press", "4"],
        ["13", "Deadlift", "3"],
        ["14", "Overhead Press", "3"],
    ]
    parse = infer_sheet(grid)
    assert parse is not None
    assert [len(s.exercises) for s in parse.sessions] == [1, 1, 1, 1]
    assert [e.name for e in parse.sessions[1].exercises] == ["Bench Press"]
    assert [s.day_number for s in parse.sessions] == [1, 2, 13, 14]


def test_long_unreadable_day_cell_warns():
    grid = [
        ["Day", "Exercise", "Sets"],
        ["1", "Squat", "5"],
        ["??", "Deadlift", "3"],
    ]
    parse = infer_sheet(grid)
    assert parse is not None
    # Falls back to the previous session, but says so.
    assert any("couldn't be read" in w for w in parse.warnings)


def test_long_unrecognized_exercise_flagged_not_dropped():
    grid = [
        ["Exercise", "Sets"],
        ["Bench Press", "4"],
        ["Flux Capacitor Press", "3"],
    ]
    parse = infer_sheet(grid)
    assert parse is not None
    statuses = [e.status for e in parse.sessions[0].exercises]
    assert statuses == ["matched", "unrecognized"]


# ---------------------------------------------------------------------------
# Wide format
# ---------------------------------------------------------------------------

WIDE_WEEKDAYS = [
    ["Monday", "Tuesday", "Thursday", "Friday"],
    ["Bench Press 4x8", "Deadlift 3x5", "Incline Press 4x10", "Squats 5x5"],
    ["Overhead Press 3x10", "Barbell Rows 4x8", "Cable Flyes 3x12", "Leg Press 4x10"],
    ["Tricep Pushdowns 3x12", "Lat Pulldowns 3x10", "", "Leg Curls 3x12"],
]


def test_wide_weekday_headers():
    parse = infer_sheet(WIDE_WEEKDAYS)
    assert parse is not None
    assert parse.layout == "wide"
    assert [s.day_number for s in parse.sessions] == [1, 2, 4, 5]
    monday = parse.sessions[0]
    assert [(e.name, e.sets) for e in monday.exercises] == [
        ("Bench Press", 4), ("Overhead Press", 3), ("Tricep Pushdowns", 3),
    ]


def test_wide_ppl_headers_with_sets_neighbor_columns():
    grid = [
        ["Push", "", "Pull", ""],
        ["Bench Press", "4", "Barbell Row", "4"],
        ["Overhead Press", "3", "Pull Ups", "3"],
    ]
    parse = infer_sheet(grid)
    assert parse is not None
    assert parse.layout == "wide"
    assert [s.name for s in parse.sessions] == ["Push", "Pull"]
    assert [e.sets for e in parse.sessions[0].exercises] == [4, 3]


def test_wide_rest_day_column_skipped():
    grid = [
        ["Day 1", "Day 2", "Rest"],
        ["Squat 5x5", "Bench Press 4x8", ""],
        ["Leg Press 3x10", "Chin Ups 3x8", ""],
    ]
    parse = infer_sheet(grid)
    assert parse is not None
    assert len(parse.sessions) == 2


# ---------------------------------------------------------------------------
# Blocked format
# ---------------------------------------------------------------------------

BLOCKED = [
    ["PUSH DAY"],
    ["Bench Press", "4"],
    ["Overhead Press", "3"],
    ["Lateral Raises", "4"],
    [""],
    ["PULL DAY"],
    ["Deadlift", "3"],
    ["Barbell Rows", "4"],
    [""],
    ["LEG DAY"],
    ["Squats", "5"],
    ["Leg Curls", "3"],
]


def test_blocked_sections():
    parse = infer_sheet(BLOCKED)
    assert parse is not None
    assert parse.layout == "blocked"
    assert [s.name for s in parse.sessions] == ["PUSH DAY", "PULL DAY", "LEG DAY"]
    assert [s.day_number for s in parse.sessions] == [1, 2, 3]
    assert [e.name for e in parse.sessions[1].exercises] == ["Deadlift", "Barbell Rows"]


def test_blocked_with_embedded_sets_and_rest_section():
    grid = [
        ["Upper"],
        ["Bench Press 3x8"],
        ["Rows 3x10"],
        ["Rest Day"],
        ["Lower"],
        ["Squats 4x6"],
        ["RDL 3x8"],
    ]
    parse = infer_sheet(grid)
    assert parse is not None
    assert parse.layout == "blocked"
    assert [s.name for s in parse.sessions] == ["Upper", "Lower"]
    assert parse.sessions[0].exercises[0].sets == 3


# ---------------------------------------------------------------------------
# infer_split: multi-sheet, warnings, failure modes
# ---------------------------------------------------------------------------

def test_multi_sheet_picks_best_and_reports_skipped():
    preview = infer_split([
        {"name": "Notes", "grid": [["My training journal"], ["Started in 2024"]]},
        {"name": "Program", "grid": LONG_WITH_HEADER},
    ])
    assert preview.sheet_name == "Program"
    assert preview.layout == "long"
    assert preview.confidence > 0.9
    assert len(preview.sessions) == 3


def test_non_split_content_returns_low_confidence_no_sessions():
    preview = infer_split([
        {"name": "Budget", "grid": [
            ["Item", "Cost"],
            ["Rent", "1200"],
            ["Groceries", "400"],
            ["Utilities", "150"],
        ]},
    ])
    assert preview.sessions == [] or preview.confidence < 0.5
    assert preview.warnings


def test_more_than_fourteen_sessions_clamped_with_warning():
    grid = [["Exercise", "Day", "Sets"]] + [
        [name, str(day), "3"]
        for day, name in enumerate(
            ["Bench Press", "Squat", "Deadlift", "Overhead Press",
             "Barbell Row", "Leg Press", "Lat Pulldown", "Incline Press",
             "Hip Thrust", "Leg Curl", "Leg Extension", "Calf Raise",
             "Cable Row", "Pull Up", "Lunge", "Face Pull"], start=1)
    ]
    preview = infer_split([{"name": "S1", "grid": grid}])
    assert len(preview.sessions) <= 14
    assert preview.warnings


def test_empty_input():
    preview = infer_split([{"name": "Empty", "grid": []}])
    assert preview.layout == "unknown"
    assert preview.confidence == 0.0
    assert preview.warnings
