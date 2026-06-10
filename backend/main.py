from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import os
import sys
from pathlib import Path
from time import perf_counter
from uuid import uuid4

# Add backend to path for imports
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

from api.security import AUTH_COOKIE_NAME
from core.rate_limit import RateLimitRule, RateLimiter
from db.supabase import get_supabase_client

# Initialize FastAPI app
app = FastAPI(
    title="AlgoSplit API",
    description="Workout split analysis and optimization API based on exercise science research",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

logger = logging.getLogger("algosplit.api")


@app.exception_handler(HTTPException)
async def safe_http_exception_handler(_: Request, exc: HTTPException):
    if exc.status_code >= 500:
        request_id = uuid4().hex
        logger.exception("HTTP %s [request_id=%s]", exc.status_code, request_id)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": "Internal server error", "request_id": request_id},
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    request_id = uuid4().hex
    logger.exception("Unhandled exception [request_id=%s]", request_id, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"

# Rule order matters; first match wins.
RATE_LIMIT_RULES = [
    RateLimitRule(prefixes=["/auth/login", "/auth/signup", "/auth/forgot-password", "/auth/reset-password"], limit=5, window=60, scope="ip"),
    RateLimitRule(
        prefixes=["/api/analyze-split", "/api/parse-exercise", "/api/analyze-workouts"],
        limit=200,
        window=60,
        scope="ip",
    ),
    RateLimitRule(prefixes=["/auth/"], limit=60, window=60, scope="ip"),
    RateLimitRule(prefixes=["/api/"], limit=120, window=60, scope="user_or_ip"),
]
RATE_LIMIT_REDIS_URL = os.getenv("RATE_LIMIT_REDIS_URL", os.getenv("REDIS_URL"))
RATE_LIMIT_MAX_BUCKETS = int(os.getenv("RATE_LIMIT_MAX_BUCKETS", "50000"))
RATE_LIMIT_CLEANUP_INTERVAL = int(os.getenv("RATE_LIMIT_CLEANUP_INTERVAL", "300"))

# Set TRUST_PROXY=true only when running behind a verified reverse proxy
# (e.g., Render, Railway, Vercel serverless functions, or your own nginx).
TRUST_PROXY = os.getenv("TRUST_PROXY", "false").lower() == "true"

rate_limiter = RateLimiter(
    RATE_LIMIT_RULES,
    enabled=RATE_LIMIT_ENABLED,
    trust_proxy=TRUST_PROXY,
    token_cookie_name=AUTH_COOKIE_NAME,
    redis_url=RATE_LIMIT_REDIS_URL,
    max_buckets=RATE_LIMIT_MAX_BUCKETS,
    cleanup_interval=RATE_LIMIT_CLEANUP_INTERVAL,
)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    limit_result = await rate_limiter.check(request)
    if limit_result and not limit_result.allowed:
        # Return JSONResponse directly instead of raising HTTPException
        # to avoid ExceptionGroup crashes in ASGI middleware stack
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded"},
            headers={
                "Retry-After": str(limit_result.retry_after),
                "X-RateLimit-Limit": str(limit_result.limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(limit_result.retry_after),
            },
        )

    response = await call_next(request)
    if limit_result:
        response.headers["X-RateLimit-Limit"] = str(limit_result.limit)
        response.headers["X-RateLimit-Remaining"] = str(limit_result.remaining)
        response.headers["X-RateLimit-Reset"] = str(limit_result.retry_after)
    return response


# ---------------------------------------------------------------------------
# Lightweight server timing for hot endpoints
# ---------------------------------------------------------------------------
_PERF_PREFIXES = (
    "/api/analyze-workouts",
    "/api/analyze-split",
    "/api/workouts/summaries",
    "/api/workouts/stats/summary",
    "/api/workouts",
    "/api/splits",
)

perf_logger = logging.getLogger("algosplit.perf")


@app.middleware("http")
async def perf_timing_middleware(request: Request, call_next):
    path = request.url.path
    if not any(path.startswith(p) for p in _PERF_PREFIXES):
        return await call_next(request)

    t0 = perf_counter()
    response = await call_next(request)
    elapsed_ms = (perf_counter() - t0) * 1000

    # Extract user id from the auth dependency result if available
    user_id = getattr(request.state, "user_id", None) or "anon"
    perf_logger.info(
        "[perf] %s %s %dms user=%s status=%s",
        request.method,
        path,
        int(elapsed_ms),
        user_id,
        response.status_code,
    )
    response.headers["Server-Timing"] = f"total;dur={elapsed_ms:.1f}"
    return response


# CORS middleware for frontend access
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

allowed_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8000",
    "http://localhost:8081",
]
if frontend_url not in allowed_origins:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
    expose_headers=["Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
)


@app.get("/")
def read_root():
    """Root endpoint with API information"""
    return {
        "name": "AlgoSplit API",
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
        "service": "AlgoSplit API",
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


@app.on_event("shutdown")
async def shutdown_event():
    await rate_limiter.close()


# Import API routes
from api import analysis_routes
from api.routes import (
    auth_router, splits_router, imports_router, workouts_router, overrides_router,
    custom_exercises_router, comparisons_router,
    programs_router, session_templates_router, program_sessions_router, program_diagnostics_router,
    periodization_router, meso_templates_router, bodyweight_router,
)

# Include routers
app.include_router(auth_router)  # Auth router (has its own /auth prefix)
app.include_router(splits_router)  # Splits router (has its own /api/splits prefix)
app.include_router(imports_router)  # Import preview router (has its own /api/splits/import prefix)
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
app.include_router(bodyweight_router)  # Bodyweight tracking router (has its own /api/bodyweight prefix)
app.include_router(analysis_routes.router, prefix="/api", tags=["analysis"])  # Analysis endpoints
