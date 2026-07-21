"""
Spreadsheet split import — structure inference over raw cell grids.

The frontend parses CSV/XLSX files (SheetJS) into 2D string grids and posts
them here. This module infers the split structure without any file-format
concerns, supporting the three layouts real gym spreadsheets use:

- long:    one row per exercise, with optional session/day/sets columns
           (the analyze_csv.py CLI format is the 4-column special case)
- wide:    days as columns ("Monday | Tuesday | ..."), exercises listed
           beneath each day header
- blocked: section header rows ("PUSH DAY"), exercise rows beneath each

Column/row classification leans on the exercise matcher: exercise text has a
high move_match hit-rate while headers, day names, and numbers have ~zero
(enforced by the precision tests in test_movement_matching.py).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from core.movementMatching import MatchResult, Movement, move_match_detailed

# Optional user-aware matcher (custom exercises / overrides). Injected by the
# API layer; the default keeps this module usable without a database.
MatcherFn = Callable[[str], Tuple[Optional[Movement], MatchResult]]

MAX_DAYS = 14
DEFAULT_SETS = 3

# ---------------------------------------------------------------------------
# Cell classification
# ---------------------------------------------------------------------------

SET_NOTATION_RE = re.compile(r"^\s*(\d{1,2})\s*[x×]\s*[\d\-–—,./ ]*$", re.IGNORECASE)
SETS_WORD_RE = re.compile(r"^\s*(\d{1,2})\s*sets?\s*$", re.IGNORECASE)
BARE_INT_RE = re.compile(r"^\s*(\d{1,2})\s*$")
DAY_N_RE = re.compile(r"^\s*(?:day|d)\s*(\d{1,2})\s*$", re.IGNORECASE)
TRAILING_SETS_RE = re.compile(
    r"[\s:\-–]*\b(\d{1,2})\s*[x×]\s*[\d\-–—,./]*\s*$|[\s:\-–]*\((\d{1,2})\s*sets?\)\s*$",
    re.IGNORECASE,
)

WEEKDAYS: Dict[str, int] = {
    "monday": 1, "mon": 1,
    "tuesday": 2, "tue": 2, "tues": 2,
    "wednesday": 3, "wed": 3,
    "thursday": 4, "thu": 4, "thur": 4, "thurs": 4,
    "friday": 5, "fri": 5,
    "saturday": 6, "sat": 6,
    "sunday": 7, "sun": 7,
}

# Words that compose session headers ("Push", "Upper A", "Leg Day 2", ...)
SESSION_WORDS = {
    "push", "pull", "legs", "leg", "upper", "lower", "full", "body",
    "arms", "arm", "chest", "back", "shoulders", "shoulder", "torso",
    "limbs", "day", "a", "b", "c", "rest", "off", "workout", "session",
}

# Header-row keywords for long-format column mapping
HEADER_KEYWORDS = {
    "exercise": "exercise", "exercises": "exercise", "movement": "exercise",
    "lift": "exercise", "name": "exercise",
    "sets": "sets", "set": "sets",
    "day": "day",
    "session": "session", "workout": "session", "split": "session",
}
IGNORED_HEADER_KEYWORDS = {"reps", "rep", "weight", "load", "rpe", "rir", "rest", "notes", "tempo", "%", "kg", "lbs"}


def _clean(cell: Any) -> str:
    return str(cell).strip() if cell is not None else ""


def parse_sets_cell(text: str) -> Optional[int]:
    """Extract a set count from a dedicated cell ('4', '3x8', '3 sets')."""
    for regex in (SET_NOTATION_RE, SETS_WORD_RE, BARE_INT_RE):
        m = regex.match(text)
        if m:
            value = int(m.group(1))
            return value if 1 <= value <= 12 else None
    return None


def parse_day_cell(text: str) -> Optional[int]:
    """
    Extract a day number from a dedicated day column cell ('3', 'Day 12',
    'Monday'). Days have their own bounds (1-14, the longest cycle the
    product models) — distinct from set counts (1-12).
    """
    m = BARE_INT_RE.match(text)
    if m:
        value = int(m.group(1))
        return value if 1 <= value <= 14 else None
    header = parse_day_header(text)
    return header[0] if header else None


def split_embedded_sets(text: str) -> Tuple[str, Optional[int]]:
    """Split 'Bench Press 3x8' / 'Squat (5 sets)' into (name, sets)."""
    m = TRAILING_SETS_RE.search(text)
    if m and m.start() > 0:
        value = int(m.group(1) or m.group(2))
        if 1 <= value <= 12:
            return (text[: m.start()].strip(" -–:\t"), value)
    return (text, None)


def parse_day_header(text: str) -> Optional[Tuple[Optional[int], str]]:
    """
    Recognize a session/day header cell.

    Returns (day_number_or_None, display_name) or None when the cell is not
    header-like. Day number comes from weekday names or 'Day N'; PPL-style
    names ("Push A") return None for the day and get sequenced positionally.
    """
    cleaned = re.sub(r"[^a-z0-9\s]", " ", text.lower()).strip()
    if not cleaned or len(cleaned) > 30:
        return None

    if cleaned in WEEKDAYS:
        return (WEEKDAYS[cleaned], text.strip())

    m = DAY_N_RE.match(cleaned)
    if m:
        return (int(m.group(1)), text.strip())

    tokens = cleaned.split()
    has_word = any(not t.isdigit() for t in tokens)
    if tokens and has_word and all(t in SESSION_WORDS or t.isdigit() or t in WEEKDAYS for t in tokens):
        day = next((WEEKDAYS[t] for t in tokens if t in WEEKDAYS), None)
        if day is None:
            digits = [int(t) for t in tokens if t.isdigit()]
            day = digits[0] if digits and 1 <= digits[0] <= 14 else None
        return (day, text.strip())

    return None


def _is_rest_header(name: str) -> bool:
    cleaned = name.lower().strip()
    return cleaned in {"rest", "off", "rest day", "off day"}


# ---------------------------------------------------------------------------
# Result containers
# ---------------------------------------------------------------------------

@dataclass
class ImportedExercise:
    raw_name: str
    name: str
    sets: int
    unilateral: bool = False
    status: str = "unrecognized"  # matched | ambiguous | unrecognized
    pattern: Optional[str] = None
    score: int = 0


@dataclass
class ImportedSession:
    name: str
    day_number: int
    exercises: List[ImportedExercise] = field(default_factory=list)


@dataclass
class ImportParse:
    layout: str
    sessions: List[ImportedSession] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    @property
    def exercise_count(self) -> int:
        return sum(len(s.exercises) for s in self.sessions)

    def recognition_score(self) -> float:
        """Fraction of extracted exercises the matcher recognizes (weighted)."""
        total = self.exercise_count
        if total == 0:
            return 0.0
        weighted = sum(
            1.0 if ex.status == "matched" else 0.5 if ex.status == "ambiguous" else 0.0
            for s in self.sessions
            for ex in s.exercises
        )
        return weighted / total


@dataclass
class ImportPreview:
    layout: str
    confidence: float
    sessions: List[ImportedSession]
    warnings: List[str]
    sheet_name: Optional[str] = None
    skipped_sheets: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Grid utilities
# ---------------------------------------------------------------------------

def _normalize_grid(grid: List[List[Any]]) -> List[List[str]]:
    cleaned = [[_clean(cell) for cell in row] for row in grid]
    # Drop fully-empty rows/cols, pad ragged rows
    cleaned = [row for row in cleaned if any(row)]
    if not cleaned:
        return []
    width = max(len(row) for row in cleaned)
    cleaned = [row + [""] * (width - len(row)) for row in cleaned]
    keep_cols = [c for c in range(width) if any(row[c] for row in cleaned)]
    return [[row[c] for c in keep_cols] for row in cleaned]


_PROFILE_SAMPLE_LIMIT = 40


def _column_profile(grid: List[List[str]], col: int, matcher: MatcherFn) -> Dict[str, float]:
    """
    Classify a column by the fraction of exercise/set-like/header cells.
    Long columns are sampled evenly — the fractions converge quickly and
    running the matcher on every cell of a large sheet is the dominant cost.
    """
    cells = [row[col] for row in grid if row[col]]
    if not cells:
        return {"exercise": 0.0, "setlike": 0.0, "header": 0.0, "n": 0}
    if len(cells) > _PROFILE_SAMPLE_LIMIT:
        step = max(1, len(cells) // _PROFILE_SAMPLE_LIMIT)
        sampled = cells[::step][:_PROFILE_SAMPLE_LIMIT]
    else:
        sampled = cells
    n = len(sampled)
    exercise = sum(1 for c in sampled if matcher(split_embedded_sets(c)[0])[0] is not None)
    setlike = sum(1 for c in sampled if parse_sets_cell(c) is not None)
    header = sum(1 for c in sampled if parse_day_header(c) is not None)
    return {"exercise": exercise / n, "setlike": setlike / n, "header": header / n, "n": len(cells)}


def _classify_exercise(raw: str, sets: Optional[int], matcher: MatcherFn) -> ImportedExercise:
    name, embedded_sets = split_embedded_sets(raw)
    movement, result = matcher(name)
    if movement is None:
        status = "unrecognized"
    elif result.ambiguous or result.fuzzy_corrected:
        status = "ambiguous"
    else:
        status = "matched"
    return ImportedExercise(
        raw_name=raw,
        name=name,
        sets=sets if sets is not None else (embedded_sets or DEFAULT_SETS),
        unilateral=bool(movement.unilateral) if movement else False,
        status=status,
        pattern=movement.name if movement else None,
        score=result.score,
    )


# ---------------------------------------------------------------------------
# Layout parsers
# ---------------------------------------------------------------------------

def _parse_long(grid: List[List[str]], matcher: MatcherFn) -> Optional[ImportParse]:
    """One row per exercise; session/day/sets in sibling columns."""
    if not grid:
        return None
    width = len(grid[0])

    # Header-row column mapping when present
    col_roles: Dict[str, int] = {}
    body_start = 0
    first_row = [c.lower().strip() for c in grid[0]]
    header_hits = [HEADER_KEYWORDS.get(c) for c in first_row]
    if sum(1 for h in header_hits if h) >= 2 or (
        any(h for h in header_hits) and any(c in IGNORED_HEADER_KEYWORDS for c in first_row)
    ):
        for idx, role in enumerate(header_hits):
            if role and role not in col_roles:
                col_roles[role] = idx
        body_start = 1

    body = grid[body_start:]
    if not body:
        return None

    profiles = {c: _column_profile(body, c, matcher) for c in range(width)}

    if "exercise" not in col_roles:
        best = max(profiles, key=lambda c: profiles[c]["exercise"])
        if profiles[best]["exercise"] < 0.4 or profiles[best]["n"] < 2:
            return None
        col_roles["exercise"] = best
    ex_col = col_roles["exercise"]

    if "sets" not in col_roles:
        setlike_cols = [
            c for c in range(width)
            if c != ex_col and c not in col_roles.values() and profiles[c]["setlike"] >= 0.6
        ]
        if len(setlike_cols) == 1:
            col_roles["sets"] = setlike_cols[0]
        elif len(setlike_cols) >= 2:
            # Day | Exercise | Sets convention: day runs in non-decreasing
            # streaks; pick the most varied column as sets, streakiest as day.
            def streakiness(c: int) -> float:
                values = [row[c] for row in body if row[c]]
                if len(values) < 2:
                    return 0.0
                same = sum(1 for a, b in zip(values, values[1:]) if a == b)
                return same / (len(values) - 1)

            day_col = max(setlike_cols, key=streakiness)
            sets_candidates = [c for c in setlike_cols if c != day_col]
            col_roles["day"] = day_col
            col_roles["sets"] = max(sets_candidates, key=lambda c: profiles[c]["setlike"])

    if "session" not in col_roles:
        for c in range(width):
            if c in col_roles.values():
                continue
            prof = profiles[c]
            if prof["n"] >= 2 and prof["exercise"] < 0.3 and prof["setlike"] < 0.3 and prof["header"] >= 0.5:
                col_roles["session"] = c
                break

    sessions: List[ImportedSession] = []
    by_key: Dict[Tuple[str, int], ImportedSession] = {}
    warnings: List[str] = []
    current_day = 1
    unreadable_days = 0

    for row in body:
        raw = row[ex_col]
        if not raw or parse_day_header(raw):
            continue

        day: Optional[int] = None
        if "day" in col_roles:
            day_cell = row[col_roles["day"]]
            day = parse_day_cell(day_cell)
            if day is None and day_cell:
                unreadable_days += 1
        session_name = row[col_roles["session"]] if "session" in col_roles else ""
        if day is None and session_name:
            header = parse_day_header(session_name)
            if header and header[0]:
                day = header[0]
        if day is None:
            day = current_day
        current_day = day

        sets = parse_sets_cell(row[col_roles["sets"]]) if "sets" in col_roles else None
        key = (session_name or f"Day {day}", day)
        if key not in by_key:
            session = ImportedSession(name=key[0], day_number=day)
            by_key[key] = session
            sessions.append(session)
        by_key[key].exercises.append(_classify_exercise(raw, sets, matcher))

    if not sessions:
        return None
    if unreadable_days:
        warnings.append(
            f"{unreadable_days} day value(s) couldn't be read; those exercises "
            "were grouped with the previous session — double-check the preview."
        )
    return ImportParse(layout="long", sessions=sessions, warnings=warnings)


def _parse_wide(grid: List[List[str]], matcher: MatcherFn) -> Optional[ImportParse]:
    """Days as columns; exercises listed beneath each day header."""
    if not grid:
        return None
    width = len(grid[0])

    header_row_idx: Optional[int] = None
    day_cols: List[Tuple[int, Optional[int], str]] = []  # (col, day, name)
    for r in range(min(3, len(grid))):
        cols = []
        for c in range(width):
            header = parse_day_header(grid[r][c])
            if header:
                cols.append((c, header[0], header[1]))
        if len(cols) >= 2:
            header_row_idx = r
            day_cols = cols
            break
    if header_row_idx is None:
        return None

    sessions: List[ImportedSession] = []
    day_col_set = {c for c, _, _ in day_cols}
    for position, (col, day, name) in enumerate(day_cols):
        if _is_rest_header(name):
            continue
        day_number = day if day and day <= MAX_DAYS else position + 1
        session = ImportedSession(name=name, day_number=day_number)
        # Right-neighbor sets column: not a day column, mostly set-like
        sets_col: Optional[int] = None
        if col + 1 < width and col + 1 not in day_col_set:
            below = [grid[r][col + 1] for r in range(header_row_idx + 1, len(grid))]
            filled = [c for c in below if c]
            if filled and sum(1 for c in filled if parse_sets_cell(c)) / len(filled) >= 0.6:
                sets_col = col + 1

        for r in range(header_row_idx + 1, len(grid)):
            raw = grid[r][col]
            if not raw or parse_day_header(raw) or parse_sets_cell(raw):
                continue
            sets = parse_sets_cell(grid[r][sets_col]) if sets_col is not None else None
            session.exercises.append(_classify_exercise(raw, sets, matcher))
        if session.exercises:
            sessions.append(session)

    if not sessions:
        return None
    return ImportParse(layout="wide", sessions=sessions)


def _parse_blocked(grid: List[List[str]], matcher: MatcherFn) -> Optional[ImportParse]:
    """Section header rows ('PUSH DAY') with exercise rows beneath."""
    if not grid:
        return None
    width = len(grid[0])

    sessions: List[ImportedSession] = []
    current: Optional[ImportedSession] = None
    position = 0

    for row in grid:
        filled = [(c, cell) for c, cell in enumerate(row) if cell]
        if not filled:
            continue
        first_col, first_cell = filled[0]
        header = parse_day_header(first_cell)

        is_header_row = header is not None and len(filled) <= 2 and matcher(first_cell)[0] is None
        if is_header_row:
            if current and current.exercises:
                sessions.append(current)
            position += 1
            day, name = header
            if _is_rest_header(name):
                current = None
                continue
            current = ImportedSession(
                name=name,
                day_number=day if day and day <= MAX_DAYS else position,
            )
            continue

        if current is None:
            continue
        raw = first_cell
        sets = None
        for c in range(first_col + 1, width):
            sets = parse_sets_cell(row[c])
            if sets is not None:
                break
        if parse_sets_cell(raw) is None:
            current.exercises.append(_classify_exercise(raw, sets, matcher))

    if current and current.exercises:
        sessions.append(current)
    if not sessions:
        return None
    return ImportParse(layout="blocked", sessions=sessions)


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------

def _finalize(parse: ImportParse) -> ImportParse:
    """Clamp days to the schema's 1-7 range and cap session count."""
    if len(parse.sessions) > MAX_DAYS:
        dropped = parse.sessions[MAX_DAYS:]
        parse.sessions = parse.sessions[:MAX_DAYS]
        parse.warnings.append(
            f"Only the first {MAX_DAYS} sessions were imported "
            f"({len(dropped)} dropped — splits support up to a 7-day cycle)."
        )
    seen_invalid = False
    for index, session in enumerate(parse.sessions):
        if not (1 <= session.day_number <= MAX_DAYS):
            session.day_number = min(index + 1, MAX_DAYS)
            seen_invalid = True
    if seen_invalid:
        parse.warnings.append("Some day numbers were outside 1-7 and were re-sequenced.")
    return parse


def infer_sheet(grid: List[List[Any]], matcher: Optional[MatcherFn] = None) -> Optional[ImportParse]:
    """Infer the best-scoring layout parse for a single sheet grid."""
    matcher = matcher or move_match_detailed
    normalized = _normalize_grid(grid)
    if not normalized:
        return None

    candidates: List[ImportParse] = []
    for parser in (_parse_long, _parse_wide, _parse_blocked):
        try:
            parse = parser(normalized, matcher)
        except Exception:
            parse = None
        if parse and parse.exercise_count > 0:
            candidates.append(parse)
    if not candidates:
        return None

    # Most recognized exercises wins; a layout that also explains session
    # structure (e.g. blocked headers the long parser merely skips) breaks ties.
    def rank(p: ImportParse) -> Tuple[float, int, float]:
        return (p.recognition_score() * p.exercise_count, len(p.sessions), p.recognition_score())

    return _finalize(max(candidates, key=rank))


def infer_split(
    sheets: List[Dict[str, Any]],
    matcher: Optional[MatcherFn] = None,
) -> ImportPreview:
    """
    Infer a split from one or more sheets ({"name": str, "grid": [[...]]}).
    The best-scoring sheet wins; others are reported as skipped.
    """
    matcher = matcher or move_match_detailed
    parses: List[Tuple[str, ImportParse]] = []
    for sheet in sheets:
        parse = infer_sheet(sheet.get("grid") or [], matcher)
        if parse:
            parses.append((str(sheet.get("name") or ""), parse))

    if not parses:
        return ImportPreview(
            layout="unknown",
            confidence=0.0,
            sessions=[],
            warnings=["Could not find a workout split in this file. "
                      "Expected exercises with sets, organized by day."],
        )

    parses.sort(key=lambda item: item[1].recognition_score() * item[1].exercise_count, reverse=True)
    sheet_name, best = parses[0]
    skipped = [name for name, _ in parses[1:] if name]

    warnings = list(best.warnings)
    if skipped:
        warnings.append(
            f"Imported sheet '{sheet_name}'; other sheets were skipped: {', '.join(skipped)}."
        )

    confidence = best.recognition_score()
    if confidence < 0.5:
        warnings.append(
            "Less than half of the detected exercises were recognized — "
            "double-check the preview before saving."
        )

    return ImportPreview(
        layout=best.layout,
        confidence=round(confidence, 3),
        sessions=best.sessions,
        warnings=warnings,
        sheet_name=sheet_name or None,
        skipped_sheets=skipped,
    )
