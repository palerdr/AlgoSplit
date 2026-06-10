"""
Spreadsheet split import preview.

POST /api/splits/import/preview accepts raw cell grids (parsed client-side
from CSV/XLSX), infers the split structure via core.split_import, and returns
a SplitCreate-shaped payload plus per-exercise match triage. Unrecognized
exercises are reported for resolution — never rejected — the existing
POST /api/splits validation remains the backstop on save.
"""

from fastapi import APIRouter, Depends

from api.dependencies import AuthUser, get_current_user
from core.exerciseMatching import (
    move_match_with_overrides_detailed,
    preload_user_exercise_maps,
)
from core.split_import import infer_split
from schemas.imports import (
    ImportPreviewRequest,
    ImportPreviewResponse,
    ImportPreviewSplit,
    ImportedExerciseStatus,
)

router = APIRouter(prefix="/api/splits/import", tags=["imports"])


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    data: ImportPreviewRequest,
    current_user: AuthUser = Depends(get_current_user),
) -> ImportPreviewResponse:
    # One batch query for the user's custom exercises/overrides so matching
    # doesn't hit the database per cell.
    user_maps = preload_user_exercise_maps(current_user.id)

    def matcher(name: str):
        return move_match_with_overrides_detailed(
            name, user_id=current_user.id, user_maps=user_maps
        )

    preview = infer_split(
        [sheet.model_dump() for sheet in data.sheets],
        matcher=matcher,
    )

    split = None
    statuses = []
    if preview.sessions:
        split = ImportPreviewSplit(
            name=(data.split_name_hint or preview.sheet_name or "Imported Split").strip()
            or "Imported Split",
            sessions=[
                {
                    "name": session.name,
                    "day_number": session.day_number,
                    "exercises": [
                        {"name": ex.name, "sets": ex.sets, "unilateral": ex.unilateral}
                        for ex in session.exercises
                    ],
                }
                for session in preview.sessions
            ],
        )
        statuses = [
            ImportedExerciseStatus(
                session_index=si,
                exercise_index=ei,
                raw_name=ex.raw_name,
                status=ex.status,
                pattern=ex.pattern,
                score=ex.score,
            )
            for si, session in enumerate(preview.sessions)
            for ei, ex in enumerate(session.exercises)
        ]

    return ImportPreviewResponse(
        split=split,
        layout=preview.layout,
        confidence=preview.confidence,
        exercises=statuses,
        warnings=preview.warnings,
        sheet_name=preview.sheet_name,
        skipped_sheets=preview.skipped_sheets,
    )
