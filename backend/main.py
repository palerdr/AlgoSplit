from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
import sys
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

from schemas.models import (
    SplitRequest, AnalysisResponse, MuscleStats, OptimizationSuggestion, SummaryStats,
    ExerciseParseRequest, ExerciseParseResponse,
    MovementPattern, MovementPatternsResponse
)

# Initialize FastAPI app
app = FastAPI(
    title="Split.AI API",
    description="Workout split analysis and optimization API based on exercise science research",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    """Root endpoint with API information"""
    return {
        "name": "Split.AI API",
        "version": "1.0.0",
        "description": "Workout split analysis and optimization",
        "endpoints": {
            "docs": "/docs",
            "health": "/health",
            "analyze_split": "/api/analyze-split",
            "parse_exercise": "/api/parse-exercise",
            "movement_patterns": "/api/movement-patterns"
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


# Import API routes
from api import routes

# Include routers
app.include_router(routes.router, prefix="/api", tags=["analysis"])
