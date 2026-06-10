"""
Regression suite for core/movementMatching.py.

Built from an audit corpus of realistic spreadsheet-style exercise strings
(equipment prefixes, abbreviations, plurals, embedded set notation, typos)
plus non-exercise strings that must NOT match (precision guard for the
spreadsheet-import column classifier, which scores columns by matcher
hit-rate).
"""

import pytest

from core.granular_patterns import GRANULAR_PATTERNS
from core.movementMatching import (
    MatchResult,
    _MATCHER,
    detect_unilateral,
    move_match,
    move_match_detailed,
)


# ---------------------------------------------------------------------------
# Recognition + correct-pattern cases: (name, expected_pattern)
# ---------------------------------------------------------------------------

CLEAN_CANONICAL = [
    ("Bench Press", "humeral_adduction_compound"),
    ("Incline Dumbbell Press", "clavicular_humeral_adduction_compound"),
    ("Squat", "squat_compound"),
    ("Deadlift", "hinge_compound"),
    ("Lat Pulldown", "sagittal_adduction_compound"),
    ("Barbell Row", "scapular_retraction_compound"),
    ("Overhead Press", "pronated_vertical_press_compound"),
    ("Lateral Raise", "shoulder_abduction_isolation"),
    ("Bicep Curl", "elbow_flexion_isolation"),
    ("Tricep Pushdown", "elbow_extension_isolation"),
    ("Leg Press", "squat_compound"),
    ("Leg Curl", "knee_flexion_isolation"),
    ("Leg Extension", "knee_extension_isolation"),
    ("Calf Raise", "ankle_plantarflexion_isolation"),
    ("Hip Thrust", "hip_extension_isolation"),
    ("Face Pull", "scapular_retraction_isolation"),
    ("Romanian Deadlift", "hinge_compound"),
    ("Pull Up", "sagittal_adduction_compound"),
    ("Crunch", "spinal_flexion"),
    ("Plank", "anti_extension"),
]

PLURALS = [
    ("Squats", "squat_compound"),
    ("Deadlifts", "hinge_compound"),
    ("Pull-Ups", "sagittal_adduction_compound"),
    ("Chin Ups", "sagittal_adduction_compound"),
    ("Push-Ups", "humeral_adduction_compound"),
    ("Weighted Pull-ups", "sagittal_adduction_compound"),
    ("Dips", "tricep_compound"),
    ("Weighted Dips", "tricep_compound"),
    ("Ring Dips", "tricep_compound"),
    ("Shrugs", "scapular_retraction_isolation"),
    ("Lunges", "lunge_compound"),
    ("Walking Lunges", "lunge_compound"),
    ("Step Ups", "lunge_compound"),
    ("Skullcrushers", "elbow_extension_isolation"),
    ("Diamond Pushups", "elbow_extension_isolation"),
    ("Good Mornings", "hinge_compound"),
    ("Russian Twists", "trunk_rotation"),
    ("Bicep curls", "elbow_flexion_isolation"),
    ("Lateral Raises", "shoulder_abduction_isolation"),
    ("Flyes", "humeral_adduction_isolation"),
    ("Bulgarians", "lunge_compound"),
]

EQUIPMENT_PREFIXES = [
    ("BB Bench Press", "humeral_adduction_compound"),
    ("DB Bench Press", "humeral_adduction_compound"),
    ("DB Shoulder Press", "pronated_vertical_press_compound"),
    ("BB Back Squat", "squat_compound"),
    ("Smith Machine Squat", "squat_compound"),
    ("SM Incline Press", "clavicular_humeral_adduction_compound"),
    ("Machine Chest Press", "humeral_adduction_compound"),
    ("Hammer Strength Row", "scapular_retraction_compound"),
    ("Cable Lateral Raise", "shoulder_abduction_isolation"),
    ("EZ Bar Curl", "elbow_flexion_isolation"),
    ("KB Goblet Squat", "squat_compound"),
    ("Trap Bar Deadlift", "hinge_compound"),
    ("V-Bar Pushdown", "elbow_extension_isolation"),
    ("Plate Loaded Row", "scapular_retraction_compound"),
]

ABBREVIATIONS = [
    ("OHP", "pronated_vertical_press_compound"),
    ("RDL", "hinge_compound"),
    ("BSS", "lunge_compound"),
    ("SLDL", "hinge_compound"),
    ("CGBP", "tricep_compound"),
    ("DL", "hinge_compound"),
    ("BP", "humeral_adduction_compound"),
    ("GHR", "knee_flexion_isolation"),
    ("Lat Raises", "shoulder_abduction_isolation"),
    ("Hammies", "knee_flexion_isolation"),
    ("Tris", "elbow_extension_isolation"),
    ("Bis", "elbow_flexion_isolation"),
]

SET_NOTATION_IN_CELL = [
    ("Bench Press 3x8", "humeral_adduction_compound"),
    ("Squat - 5x5", "squat_compound"),
    ("Incline DB Press (3 sets)", "clavicular_humeral_adduction_compound"),
    ("RDL 3x8-10", "hinge_compound"),
    ("Lat Pulldown: 4x12", "sagittal_adduction_compound"),
    ("3x10 Leg Press", "squat_compound"),
    ("Curls 21s", "elbow_flexion_isolation"),
]

MODIFIERS_TEMPO_RPE = [
    ("Paused Bench Press", "humeral_adduction_compound"),
    ("Bench Press @ RPE 8", "humeral_adduction_compound"),
    ("Squat (high bar)", "squat_compound"),
    ("Tempo Squat 3-1-0", "squat_compound"),
    ("Bench Press (touch and go)", "humeral_adduction_compound"),
    ("Deficit Deadlift", "hinge_compound"),
    ("2ct Pause Squat", "squat_compound"),
    ("Incline press (slow eccentric)", "clavicular_humeral_adduction_compound"),
    ("Myo-reps Leg Extension", "knee_extension_isolation"),
    ("Drop set lateral raises", "shoulder_abduction_isolation"),
]

PROGRAM_PREFIXES = [
    ("A1: Bench Press", "humeral_adduction_compound"),
    ("B2. Seated Cable Row", "scapular_retraction_compound"),
    ("1. Squat", "squat_compound"),
    ("2) Romanian Deadlift", "hinge_compound"),
    ("W1D1 Bench", "humeral_adduction_compound"),
]

POPULAR_COVERAGE = [
    ("Front Squat", "squat_compound"),
    ("Goblet Squat", "squat_compound"),
    ("Box Squat", "squat_compound"),
    ("Zercher Squat", "squat_compound"),
    ("Sissy Squat", "knee_extension_isolation"),
    ("Spanish Squat", "knee_extension_isolation"),
    ("Pendulum Squat", "squat_compound"),
    ("Belt Squat", "squat_compound"),
    ("Reverse Lunge", "lunge_compound"),
    ("Pendlay Row", "scapular_retraction_compound"),
    ("Meadows Row", "scapular_retraction_compound"),
    ("Seal Row", "scapular_retraction_compound"),
    ("Chest Supported Row", "scapular_retraction_compound"),
    ("T-Bar Row", "scapular_retraction_compound"),
    ("Inverted Row", "scapular_retraction_compound"),
    ("High Row", "scapular_retraction_compound"),
    ("Low Row", "scapular_retraction_compound"),
    ("Single Arm Cable Row", "scapular_retraction_compound"),
    ("Upright Row", "scapular_retraction_compound"),
    ("Landmine Press", "pronated_vertical_press_compound"),
    ("Z Press", "pronated_vertical_press_compound"),
    ("Viking Press", "neutral_vertical_press_compound"),
    ("Pin Press", "humeral_adduction_compound"),
    ("Floor Press", "humeral_adduction_compound"),
    ("Larsen Press", "humeral_adduction_compound"),
    ("Spoto Press", "humeral_adduction_compound"),
    ("JM Press", "elbow_extension_isolation"),
    ("French Press", "elbow_extension_isolation"),
    ("Close Grip Bench", "tricep_compound"),
    ("Cable Crossover", "humeral_adduction_isolation"),
    ("Cable Fly", "humeral_adduction_isolation"),
    ("Pec Deck", "humeral_adduction_isolation"),
    ("Deficit Push Up", "humeral_adduction_compound"),
    ("Kettlebell Swing", "hinge_compound"),
    ("KB Swings", "hinge_compound"),
    ("Sumo Deadlift", "hinge_compound"),
    ("Snatch Grip Deadlift", "hinge_compound"),
    ("Stiff Leg Deadlift", "hinge_compound"),
    ("Single Leg RDL", "hinge_compound"),
    ("Hip Hinge", "hinge_compound"),
    ("Rack Pull", "hinge_compound"),
    ("Back Extension", "spinal_extension"),
    ("Reverse Hyperextension", "spinal_extension"),
    ("45 Degree Back Extension", "spinal_extension"),
    ("Cable Crunch", "spinal_flexion"),
    ("Decline Sit Up", "spinal_flexion"),
    ("Weighted Crunch Machine", "spinal_flexion"),
    ("Hanging Leg Raise", "leg_raise"),
    ("Ab Wheel Rollout", "anti_extension"),
    ("Pallof Press", "anti_rotation"),
    ("Seated Calf Raise", "ankle_plantarflexion_isolation"),
    ("Standing Calf Raise", "ankle_plantarflexion_isolation"),
    ("Donkey Calf Raise", "ankle_plantarflexion_isolation"),
    ("Nordic Ham Curl", "knee_flexion_isolation"),
    ("Glute Ham Raise", "knee_flexion_isolation"),
    ("Reverse Nordic", "knee_extension_isolation"),
    ("Hip Abduction Machine", "hip_abduction_isolation"),
    ("Adductor Machine", "hip_adduction_isolation"),
    ("Hip Adduction", "hip_adduction_isolation"),
    ("Copenhagen Plank", "hip_adduction_isolation"),
    ("Cable Pull Through", "hip_extension_isolation"),
    ("Glute Kickback", "hip_extension_isolation"),
    ("Box Step Up", "lunge_compound"),
    ("Bulgarian Split Squat", "lunge_compound"),
    ("Hack Squat", "squat_compound"),
    ("Rear Delt Fly", "shoulder_transverse_abduction_isolation"),
    ("Bayesian Curl", "elbow_flexion_isolation"),
    ("Incline DB Curl", "elbow_flexion_isolation"),
    ("Drag Curl", "elbow_flexion_isolation"),
    ("Zottman Curl", "elbow_flexion_isolation"),
    ("Cross Body Hammer Curl", "elbow_flexion_isolation"),
    ("Preacher Curl", "elbow_flexion_isolation"),
    ("Spider Curl", "elbow_flexion_isolation"),
    ("Reverse Curl", "pronated_elbow_flexion_isolation"),
    ("Overhead Cable Extension", "overhead_elbow_extension_isolation"),
    ("Wide Grip Lat Pulldown", "transverse_adduction_compound"),
    ("Neutral Grip Pulldown", "sagittal_adduction_compound"),
    ("Straight Arm Pulldown", "transverse_adduction_isolation"),
    ("Dumbbell Pullover", "transverse_adduction_isolation"),
    ("Machine Pullover", "transverse_adduction_isolation"),
    ("Farmer's Walk", "wrist_flexion_isolation"),
    ("Suitcase Carry", "wrist_flexion_isolation"),
    ("Behind The Back Wrist Curl", "wrist_flexion_isolation"),
    ("Seated DB Press", "pronated_vertical_press_compound"),
    ("Arnold Press", "pronated_vertical_press_compound"),
    ("Push Press", "pronated_vertical_press_compound"),
    ("Military Press", "pronated_vertical_press_compound"),
    ("Behind the Neck Press", "pronated_vertical_press_compound"),
    ("Machine Shoulder Press", "pronated_vertical_press_compound"),
    ("Egyptian Lateral Raise", "shoulder_abduction_isolation"),
    ("Front Plate Raise", "shoulder_flexion_isolation"),
    ("Assisted Pull Up Machine", "sagittal_adduction_compound"),
]

TYPOS = [
    ("Benhc Press", "humeral_adduction_compound"),
    ("Sqaut", "squat_compound"),
    ("Lat Puldown", "sagittal_adduction_compound"),
    ("Dead lift", "hinge_compound"),
    ("Deadlfit", "hinge_compound"),
    ("Tricep extentions", "elbow_extension_isolation"),
    ("Lateral rasies", "shoulder_abduction_isolation"),
    ("Rumanian Deadlift", "hinge_compound"),
    ("Leg exstension", "knee_extension_isolation"),
]

ALL_RECOGNIZED = (
    CLEAN_CANONICAL
    + PLURALS
    + EQUIPMENT_PREFIXES
    + ABBREVIATIONS
    + SET_NOTATION_IN_CELL
    + MODIFIERS_TEMPO_RPE
    + PROGRAM_PREFIXES
    + POPULAR_COVERAGE
    + TYPOS
)


@pytest.mark.parametrize("name,expected", ALL_RECOGNIZED, ids=[n for n, _ in ALL_RECOGNIZED])
def test_recognized_exercise(name, expected):
    movement = move_match(name)
    assert movement is not None, f"{name!r} should be recognized"
    assert movement.name == expected


# ---------------------------------------------------------------------------
# Names with no suitable granular pattern: unmatched BY DESIGN — these are
# meant to fall through to the custom-exercise resolution path.
# ---------------------------------------------------------------------------

NO_PATTERN_EXISTS = [
    "Tibialis Raise",
    "Dead Hang",
    "Wrist Roller",
    "Cuban Press",
    "Powell Raise",
    "Lu Raises",
    "Cable Y Raise",
    "Carter Extension",
    "Power Clean",
]


@pytest.mark.parametrize("name", NO_PATTERN_EXISTS)
def test_unmatched_by_design(name):
    assert move_match(name) is None


# ---------------------------------------------------------------------------
# Precision guard: non-exercise strings from real spreadsheets must never
# match. The import column classifier depends on this staying at zero.
# ---------------------------------------------------------------------------

NON_EXERCISE = [
    "Push Day", "Pull Day", "Leg Day", "Rest", "Rest Day", "Cardio",
    "Warm up", "Warmup", "Cooldown", "Stretching", "Monday", "Tuesday",
    "Week 1", "Day 3", "Notes", "Sets", "Reps", "Weight", "RPE", "Tempo",
    "Volume", "Exercise", "Exercises", "Upper Body", "Lower Body", "Deload",
    "Superset", "10 min treadmill", "Foam rolling", "Mobility", "Off",
]


@pytest.mark.parametrize("text", NON_EXERCISE)
def test_non_exercise_strings_do_not_match(text):
    assert move_match(text) is None, f"{text!r} must not classify as an exercise"


# ---------------------------------------------------------------------------
# Rule sanity: every rule must be able to clear min_score, otherwise it is
# dead code (this previously affected hinge/ab/forearm rules).
# ---------------------------------------------------------------------------

def _all_rules():
    for stage_name, stage in (
        ("specific", _MATCHER.specific_rules),
        ("general", _MATCHER.general_rules),
        ("fallback", _MATCHER.fallback_rules),
    ):
        for rule in stage:
            yield stage_name, rule


def test_no_dead_rules():
    for stage_name, rule in _all_rules():
        max_score = rule.weight + 3 * len(rule.required) + (2 if rule.any_of else 0)
        assert max_score >= _MATCHER.min_score, (
            f"[{stage_name}] rule {rule.required} -> {rule.pattern} can never "
            f"reach min_score ({max_score} < {_MATCHER.min_score})"
        )


def test_rule_tokens_are_singularization_fixed_points():
    # Input tokens are singularized before rule matching, so a required/any_of
    # token that singularization rewrites (e.g. "rows", "raises") makes the
    # rule unreachable. banned tokens are exempt: bans are safety nets and may
    # deliberately cover non-normalized forms reachable via fuzzy correction.
    for stage_name, rule in _all_rules():
        for token in (*rule.required, *rule.any_of):
            assert _MATCHER._singularize_token(token) == token, (
                f"[{stage_name}] rule token {token!r} (pattern {rule.pattern}) is not a "
                f"singularization fixed point — it can never appear in input tokens"
            )


def test_rule_patterns_exist_in_granular_patterns():
    # A typo'd pattern name would classify successfully and then silently
    # yield no Movement (move_match returns None for unknown patterns).
    for stage_name, rule in _all_rules():
        assert rule.pattern in GRANULAR_PATTERNS, (
            f"[{stage_name}] rule {rule.required} maps to unknown pattern {rule.pattern!r}"
        )
    for token, pattern in _MATCHER.muscle_only.items():
        assert pattern in GRANULAR_PATTERNS, (
            f"muscle_only[{token!r}] maps to unknown pattern {pattern!r}"
        )


# ---------------------------------------------------------------------------
# Detailed API: confidence signals for the import preview.
# ---------------------------------------------------------------------------

def test_detailed_exact_match_is_confident():
    movement, result = move_match_detailed("Bench Press")
    assert movement is not None
    assert isinstance(result, MatchResult)
    assert result.pattern == "humeral_adduction_compound"
    assert result.score >= _MATCHER.min_score
    assert result.fuzzy_corrected is False


def test_detailed_typo_match_is_flagged_fuzzy():
    movement, result = move_match_detailed("Benhc Press")
    assert movement is not None
    assert result.fuzzy_corrected is True


def test_detailed_unmatched():
    movement, result = move_match_detailed("Underwater Basket Weaving")
    assert movement is None
    assert result.pattern is None
    assert result.score == 0


def test_classify_tuple_shape_is_stable():
    # Legacy callers rely on the (pattern, is_unilateral) tuple.
    pattern, is_unilateral = _MATCHER.classify("Single Arm DB Row")
    assert pattern == "sagittal_adduction_compound" or pattern is not None
    assert is_unilateral is True


def test_unilateral_detection_preserved():
    movement = move_match("Single Leg Press")
    assert movement is not None
    assert movement.unilateral is True


def test_fuzzy_correction_repairs_unilateral_cue():
    # "singel legg press" only matches after fuzzy correction to
    # "single leg press"; the unilateral flag must come from the corrected
    # text, not the pre-correction text.
    movement, result = move_match_detailed("singel legg press")
    assert movement is not None
    assert result.fuzzy_corrected is True
    assert movement.unilateral is True


def test_fuzzy_skipped_for_long_cell_texts():
    # Sentence-length cells (notes columns) skip the per-token fuzzy pass.
    long_text = "this is a long note about how training went last week overall"
    movement, result = move_match_detailed(long_text)
    assert movement is None
    assert result.fuzzy_corrected is False


def test_detect_unilateral_uses_word_boundaries():
    assert detect_unilateral("One Arm Row") is True
    assert detect_unilateral("Single Leg RDL") is True
    # Substring false positives the old override-path check produced:
    assert detect_unilateral("Zone Training") is False
    assert detect_unilateral("Prone Hold") is False
    # Dumbbell work is bilateral by default:
    assert detect_unilateral("DB Bench Press") is False
