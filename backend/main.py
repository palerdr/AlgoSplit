from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
import os
import sys
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

from schemas.models import (
    SplitRequest, AnalysisResponse, MuscleStats, OptimizationSuggestion, SummaryStats,
    ExerciseParseRequest, ExerciseParseResponse
)
from db.supabase import get_supabase_client

# Initialize FastAPI app
app = FastAPI(
    title="Split.AI API",
    description="Workout split analysis and optimization API based on exercise science research",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware for frontend access
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

allowed_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8000",
]
if frontend_url not in allowed_origins:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization", "Content-Type"],
    expose_headers=["*"],
)


@app.get("/")
def read_root():
    """Root endpoint with API information"""
    return {
        "name": "Split.AI API",
        "version": "2.0.0",
        "description": "Workout split analysis and optimization with user authentication and database persistence",
        "endpoints": {
            "docs": "/docs",
            "health": "/health",
            "keepalive": "/keepalive",
            "auth": {
                "signup": "/auth/signup",
                "login": "/auth/login",
                "user": "/auth/user",
                "logout": "/auth/logout"
            },
            "splits": {
                "list": "/api/splits",
                "create": "/api/splits",
                "get": "/api/splits/{id}",
                "update": "/api/splits/{id}",
                "delete": "/api/splits/{id}",
                "analyze": "/api/splits/{id}/analyze"
            },
            "workouts": {
                "list": "/api/workouts",
                "log": "/api/workouts",
                "get": "/api/workouts/{id}",
                "stats": "/api/workouts/stats/summary",
                "delete": "/api/workouts/{id}"
            },
            "overrides": {
                "list": "/api/exercise-overrides",
                "create": "/api/exercise-overrides",
                "get": "/api/exercise-overrides/{id}",
                "update": "/api/exercise-overrides/{id}",
                "delete": "/api/exercise-overrides/{id}"
            },
            "custom_exercises": {
                "list": "/api/custom-exercises",
                "create": "/api/custom-exercises",
                "get": "/api/custom-exercises/{id}",
                "update": "/api/custom-exercises/{id}",
                "delete": "/api/custom-exercises/{id}"
            },
            "comparisons": {
                "list": "/api/comparisons",
                "create": "/api/comparisons",
                "get": "/api/comparisons/{id}",
                "update": "/api/comparisons/{id}",
                "delete": "/api/comparisons/{id}"
            },
            "programs": {
                "list": "/api/programs",
                "create": "/api/programs",
                "get": "/api/programs/{id}",
                "update": "/api/programs/{id}",
                "delete": "/api/programs/{id}"
            },
            "session_templates": {
                "list": "/api/session-templates",
                "create": "/api/session-templates",
                "from_session": "/api/session-templates/from-session",
                "get": "/api/session-templates/{id}",
                "delete": "/api/session-templates/{id}"
            },
            "program_sessions": {
                "list": "/api/programs/{id}/sessions",
                "schedule": "/api/programs/{id}/sessions",
                "batch": "/api/programs/{id}/sessions/batch",
                "update": "/api/programs/{id}/sessions/{session_id}",
                "delete": "/api/programs/{id}/sessions/{session_id}",
                "detach": "/api/programs/{id}/sessions/{session_id}/detach"
            },
            "program_diagnostics": {
                "run": "/api/programs/{id}/diagnostics"
            },
            "analysis": {
                "analyze_split": "/api/analyze-split",
                "parse_exercise": "/api/parse-exercise",
                "movement_patterns": "/api/movement-patterns"
            }
        }
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Split.AI API",
        "version": "1.0.0"
    }


@app.head("/keepalive")
@app.get("/keepalive")
def keepalive():
    """
    Keepalive endpoint that touches Supabase to prevent auto-pausing.
    Uses a tiny select on the splits table (limit 1).
    """
    try:
        client = get_supabase_client()
        result = client.table("splits").select("id").limit(1).execute()
        rows = len(result.data) if result.data else 0
        return {
            "status": "ok",
            "supabase": "reachable",
            "rows": rows
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Supabase keepalive failed: {exc}")


# Import API routes
from api import analysis_routes
from api.routes import (
    auth_router, splits_router, workouts_router, overrides_router,
    custom_exercises_router, comparisons_router,
    programs_router, session_templates_router, program_sessions_router, program_diagnostics_router,
    periodization_router, meso_templates_router,
)

# Include routers
app.include_router(auth_router)  # Auth router (has its own /auth prefix)
app.include_router(splits_router)  # Splits router (has its own /api/splits prefix)
app.include_router(workouts_router)  # Workouts router (has its own /api/workouts prefix)
app.include_router(overrides_router)  # Overrides router (has its own /api/exercise-overrides prefix)
app.include_router(custom_exercises_router)  # Custom exercises router (has its own /api/custom-exercises prefix)
app.include_router(comparisons_router)  # Comparisons router (has its own /api/comparisons prefix)
app.include_router(programs_router)  # Programs router (has its own /api/programs prefix)
app.include_router(session_templates_router)  # Session templates router (has its own /api/session-templates prefix)
app.include_router(program_sessions_router)  # Program sessions router (has its own /api/programs/{id}/sessions prefix)
app.include_router(program_diagnostics_router)  # Program diagnostics router (has its own /api/programs/{id}/diagnostics prefix)
app.include_router(periodization_router)  # Periodization router (has its own /api/programs/{id}/periodization prefix)
app.include_router(meso_templates_router)  # Meso templates router (has its own /api/meso-templates prefix)
app.include_router(analysis_routes.router, prefix="/api", tags=["analysis"])  # Analysis endpoints

