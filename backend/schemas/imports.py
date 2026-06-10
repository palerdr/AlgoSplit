"""
Pydantic schemas for spreadsheet split import.

The client parses CSV/XLSX files into raw 2D string grids (SheetJS) and posts
them to /api/splits/import/preview; the response is a SplitCreate-shaped
payload plus per-exercise match statuses for the review step.
"""

from typing import List, Optional

from pydantic import BaseModel, Field, model_validator


MAX_TOTAL_CELLS = 20_000
MAX_SHEETS = 20


class ImportSheet(BaseModel):
    """One worksheet from the uploaded file."""

    name: str = Field(default="", max_length=200, description="Sheet name")
    grid: List[List[Optional[str]]] = Field(..., description="Raw cell grid (rows of cells)")


class ImportPreviewRequest(BaseModel):
    """Grids extracted client-side from a CSV/XLSX file."""

    sheets: List[ImportSheet] = Field(..., min_items=1, max_items=MAX_SHEETS)
    split_name_hint: Optional[str] = Field(
        default=None, max_length=200, description="Suggested split name (e.g. the file name)"
    )

    @model_validator(mode="after")
    def _validate_size(self):
        total = sum(len(row) for sheet in self.sheets for row in sheet.grid)
        if total > MAX_TOTAL_CELLS:
            raise ValueError(f"Spreadsheet too large ({total} cells, max {MAX_TOTAL_CELLS})")
        return self


class ImportedExerciseStatus(BaseModel):
    """Match triage for one extracted exercise (drives the review UI)."""

    session_index: int = Field(..., description="Index into split.sessions")
    exercise_index: int = Field(..., description="Index into session.exercises")
    raw_name: str = Field(..., description="Cell text as it appeared in the sheet")
    status: str = Field(..., pattern="^(matched|ambiguous|unrecognized)$")
    pattern: Optional[str] = Field(default=None, description="Matched movement pattern")
    score: int = Field(default=0, description="Matcher confidence score")


class ImportPreviewExercise(BaseModel):
    name: str
    sets: int
    unilateral: bool = False


class ImportPreviewSession(BaseModel):
    name: str
    day_number: int
    exercises: List[ImportPreviewExercise]


class ImportPreviewSplit(BaseModel):
    """SplitCreate-shaped payload, ready to prefill the split builder."""

    name: str
    sessions: List[ImportPreviewSession]


class ImportPreviewResponse(BaseModel):
    split: Optional[ImportPreviewSplit] = Field(
        default=None, description="Inferred split, or null when no split was found"
    )
    layout: str = Field(..., description="Detected layout: long | wide | blocked | unknown")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Recognized fraction of exercises")
    exercises: List[ImportedExerciseStatus] = Field(default=[], description="Per-exercise match triage")
    warnings: List[str] = Field(default=[], description="Human-readable import warnings")
    sheet_name: Optional[str] = Field(default=None, description="Sheet the split was read from")
    skipped_sheets: List[str] = Field(default=[], description="Sheets that were not imported")
