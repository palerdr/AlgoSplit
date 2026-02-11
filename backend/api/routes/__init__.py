"""
API routes for Split.AI
"""

from .auth import router as auth_router
from .splits import router as splits_router
from .workouts import router as workouts_router
from .overrides import router as overrides_router
from .custom_exercises import router as custom_exercises_router
from .comparisons import router as comparisons_router
from .programs import router as programs_router
from .session_templates import router as session_templates_router
from .program_sessions import router as program_sessions_router
from .program_diagnostics import router as program_diagnostics_router
from .periodization import router as periodization_router
from .meso_templates import router as meso_templates_router
from .bodyweight import router as bodyweight_router

__all__ = [
    "auth_router",
    "splits_router",
    "workouts_router",
    "overrides_router",
    "custom_exercises_router",
    "comparisons_router",
    "programs_router",
    "session_templates_router",
    "program_sessions_router",
    "program_diagnostics_router",
    "periodization_router",
    "meso_templates_router",
    "bodyweight_router",
]
