"""
Split Analysis API Routes

Endpoints for analyzing workout splits and parsing exercises using
the 29-region granular muscle model.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from collections import defaultdict
from datetime import date, datetime, time, timedelta
import threading
import time as _time
import sys
from pathlib import Path

# Add parent to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from schemas.models import (
    # Request models
    SplitRequest, ExerciseParseRequest, ExerciseInput, SessionInput,
    # Response models
    AnalysisResponse, MuscleStats, OptimizationSuggestion, SummaryStats,
    MuscleGroupSummary, ExerciseParseResponse, TieredTargets,
    MuscleRegionInfo, MuscleRegionsResponse,
    PatternInfo, PatternsResponse,
    # Breakdown models
    SetBreakdown, MuscleContribution, ExerciseBreakdown, SessionBreakdown,
)
from core.MainClasses import Split, MuscleRegion
from core.movementMatching import move_match
from core.muscle_regions import get_all_muscle_regions, get_parent_groups
from api.dependencies import get_current_user, AuthUser
from db.supabase import get_supabase_client_with_token
from core.granular_patterns import (
    GRANULAR_PATTERNS, get_pattern_muscle_targets,
    get_pattern_axial_load, get_pattern_resistance_profile
)

router = APIRouter()


# ============================================================================
# ANALYSIS CACHE
# ============================================================================
# The analyze-workouts result for a given (user, params) tuple is
# deterministic until that user logs, updates, or deletes a workout.
# We cache the serialised AnalysisResponse keyed by (user_id, params)
# with a 10-minute TTL.  Entries are also explicitly purged per-user
# when workout mutations occur (see `invalidate_analysis_cache`).

_ANALYSIS_CACHE_TTL_S = 10 * 60  # 10 minutes
_analysis_cache: dict[str, tuple[AnalysisResponse, float]] = {}
_analysis_cache_lock = threading.Lock()


def _analysis_cache_key(
    user_id: str,
    days: int,
    end_date: Optional[date],
    timezone_offset_minutes: int,
    stimulus_duration: int,
    maintenance_volume: int,
    dataset: str,
) -> str:
    return f"{user_id}:{days}:{end_date}:{timezone_offset_minutes}:{stimulus_duration}:{maintenance_volume}:{dataset}"


def invalidate_analysis_cache(user_id: str) -> None:
    """Purge all cached analysis entries for a given user.

    Call this from workout mutation endpoints (log, update, delete) so
    the next analyze-workouts request reflects the new state.
    """
    with _analysis_cache_lock:
        keys_to_remove = [k for k in _analysis_cache if k.startswith(f"{user_id}:")]
        for k in keys_to_remove:
            _analysis_cache.pop(k, None)


# ============================================================================
# ANALYSIS ENDPOINTS
# ============================================================================

@router.post("/analyze-split", response_model=AnalysisResponse)
async def analyze_split(request: SplitRequest):
    """
    Analyze a complete training split and return muscle stimulus breakdown.

    Uses the 29-region anatomical model with tiered stimulus
    (prime/secondary/tertiary movers).
    """
    try:
        # Convert request sessions to Split format
        # Now includes unilateral and resistance_profile as tuple: (sets, unilateral, resistance_profile)
        days = []
        for session in request.sessions:
            # Pass exercises as dict with tuple values for unilateral/resistance_profile support
            exercises_dict = {
                ex.name: (ex.sets, ex.unilateral, ex.resistance_profile)
                for ex in session.exercises
            }
            days.append((session.name, session.day, exercises_dict))

        # Create and simulate split
        split = Split(
            name=request.name,
            days=days,
            stimulus_duration=request.stimulus_duration,
            maintenance_volume=request.maintenance_volume,
            dataset=request.dataset,
            cycle_length=request.cycle_length
        )
        split.simulate_split(collect_breakdowns=request.include_breakdowns)

        return _build_response(split, request)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing split: {str(e)}")


@router.post("/analyze-workouts", response_model=AnalysisResponse)
async def analyze_workouts(
    days: int = Query(7, ge=1, le=90, description="Number of days to analyze"),
    end_date: Optional[date] = Query(None, description="Inclusive end date for the workout window"),
    timezone_offset_minutes: int = Query(0, ge=-840, le=840, description="Client local offset from UTC in minutes"),
    stimulus_duration: int = Query(48, ge=24, le=96, description="Stimulus duration in hours"),
    maintenance_volume: int = Query(3, ge=1, le=9, description="Maintenance volume sets"),
    dataset: str = Query("schoenfeld", description="Fatigue curve dataset"),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Analyze logged workouts using the 29-region muscle model.

    Fetches the user's workout history within the specified day window,
    converts it to Split format, and runs the stimulus engine.
    """
    try:
        # Check cache first
        cache_key = _analysis_cache_key(
            current_user.id, days, end_date, timezone_offset_minutes,
            stimulus_duration, maintenance_volume, dataset,
        )
        now_mono = _time.monotonic()
        with _analysis_cache_lock:
            cached = _analysis_cache.get(cache_key)
            if cached is not None:
                response, cached_at = cached
                if now_mono - cached_at < _ANALYSIS_CACHE_TTL_S:
                    return response

        supabase = get_supabase_client_with_token(current_user.access_token)
        effective_end_date = end_date or datetime.utcnow().date()
        window_start_date = effective_end_date - timedelta(days=days - 1)
        local_window_start = datetime.combine(window_start_date, time.min)
        local_window_end = datetime.combine(effective_end_date, time.max)
        offset_delta = timedelta(minutes=timezone_offset_minutes)
        window_start = local_window_start + offset_delta
        window_end = local_window_end + offset_delta

        # Fetch workout logs within the time window — only columns needed for analysis
        workouts_result = (
            supabase.table("workout_logs")
            .select("id, completed_at, session_name")
            .eq("user_id", current_user.id)
            .gte("completed_at", window_start.isoformat())
            .lte("completed_at", window_end.isoformat())
            .order("completed_at")
            .execute()
        )

        if not workouts_result.data:
            result = _empty_workout_analysis(days, stimulus_duration, maintenance_volume, dataset)
            with _analysis_cache_lock:
                _analysis_cache[cache_key] = (result, _time.monotonic())
            return result

        # Get only columns needed for analysis (exercise name + sets)
        workout_ids = [w["id"] for w in workouts_result.data]
        exercises_result = (
            supabase.table("workout_exercises")
            .select("workout_log_id, exercise_name, sets_completed, order_index")
            .in_("workout_log_id", workout_ids)
            .order("order_index")
            .execute()
        )

        result = _build_workout_analysis(
            workouts_result.data,
            exercises_result.data or [],
            days=days,
            stimulus_duration=stimulus_duration,
            maintenance_volume=maintenance_volume,
            dataset=dataset,
            now=window_end,
        )

        # Store in cache
        with _analysis_cache_lock:
            _analysis_cache[cache_key] = (result, _time.monotonic())

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing workouts: {str(e)}")


def _empty_workout_analysis(
    days: int,
    stimulus_duration: int,
    maintenance_volume: int,
    dataset: str,
) -> AnalysisResponse:
    """Return zeroed AnalysisResponse for an empty workout window."""
    return AnalysisResponse(
        split_name="Logged Workouts",
        cycle_length=days,
        stimulus_duration=stimulus_duration,
        maintenance_volume=maintenance_volume,
        dataset=dataset,
        muscles=[],
        group_summaries=[],
        suggestions=[],
        summary=SummaryStats(
            total_sets=0,
            muscles_trained=0,
            total_muscles=29,
            avg_net_stimulus=0.0,
            avg_sets_per_muscle=0.0,
        ),
    )


def _build_workout_analysis(
    workouts_data: list,
    exercises_data: list,
    days: int = 7,
    stimulus_duration: int = 48,
    maintenance_volume: int = 3,
    dataset: str = "schoenfeld",
    now: Optional[datetime] = None,
) -> AnalysisResponse:
    """Pure transform: workout + exercise rows → AnalysisResponse.

    Anchors day numbering to the rolling window [now - days + 1 .. now]
    so that stimulus correctly decays based on how many days ago each
    session was performed.
    """
    if now is None:
        now = datetime.utcnow()

    if not workouts_data:
        return _empty_workout_analysis(days, stimulus_duration, maintenance_volume, dataset)

    window_start_date = (now - timedelta(days=days - 1)).date()

    # Group exercises by workout_log_id
    exercises_by_workout: dict = defaultdict(list)
    for ex in exercises_data:
        exercises_by_workout[ex["workout_log_id"]].append(ex)

    split_days = []
    sessions_for_request = []

    for workout in workouts_data:
        workout_date = datetime.fromisoformat(
            workout["completed_at"].replace("Z", "+00:00")
        ).date()
        day_number = max(1, (workout_date - window_start_date).days + 1)

        # Accumulate sets for duplicate exercise names within the same workout
        exercises_dict: dict = {}
        for ex in exercises_by_workout.get(workout["id"], []):
            name = ex["exercise_name"]
            exercises_dict[name] = exercises_dict.get(name, 0) + ex["sets_completed"]

        exercise_inputs = [
            ExerciseInput(name=name, sets=sets)
            for name, sets in exercises_dict.items()
        ]

        session_name = workout.get("session_name", f"Day {day_number}")
        split_days.append((session_name, day_number, exercises_dict))
        sessions_for_request.append(SessionInput(
            name=session_name,
            day=min(day_number, 14),
            exercises=exercise_inputs if exercise_inputs else [ExerciseInput(name="Rest", sets=1)],
        ))

    if not split_days:
        return _empty_workout_analysis(days, stimulus_duration, maintenance_volume, dataset)

    # Always use the full rolling window as the cycle length so the
    # engine correctly models atrophy for the gap between sessions and now.
    effective_cycle = days

    split = Split(
        name="Logged Workouts",
        days=split_days,
        stimulus_duration=stimulus_duration,
        maintenance_volume=maintenance_volume,
        dataset=dataset,
        cycle_length=effective_cycle,
    )
    split.simulate_split(collect_breakdowns=False)

    synthetic_request = SplitRequest(
        name="Logged Workouts",
        sessions=sessions_for_request,
        cycle_length=min(effective_cycle, 14),
        stimulus_duration=stimulus_duration,
        maintenance_volume=maintenance_volume,
        dataset=dataset,
        include_breakdowns=False,
    )

    return _build_response(split, synthetic_request)


def _build_response(split: Split, request: SplitRequest) -> AnalysisResponse:
    """Build analysis response from split simulation."""
    muscles_list = []
    muscle_data = []

    for muscle_name, muscle in split.muscles.items():
        if not isinstance(muscle, MuscleRegion):
            continue

        net_stim = muscle.net_weekly_stimulus()
        data = {
            'region_id': muscle.region_id,
            'display_name': muscle.display_name,
            'parent_group': muscle.parent_group,
            'net': net_stim,
            'stimulus': muscle.stimulus,
            'atrophy': muscle.atrophy,
            'sets': muscle.primary_sets,
            'prime_sets': muscle.prime_sets,
            'secondary_sets': muscle.secondary_sets,
            'tertiary_sets': muscle.tertiary_sets,
            'freq': muscle.weekly_frequency,
            'leverage': muscle.leverage,
            'damage_tier': muscle.damage_tier
        }
        muscle_data.append(data)

        muscles_list.append(MuscleStats(
            region_id=muscle.region_id,
            display_name=muscle.display_name,
            parent_group=muscle.parent_group,
            stimulus=muscle.stimulus,
            atrophy=muscle.atrophy,
            net_stimulus=net_stim,
            primary_sets=muscle.primary_sets,
            prime_sets=muscle.prime_sets,
            secondary_sets=muscle.secondary_sets,
            tertiary_sets=muscle.tertiary_sets,
            frequency=muscle.weekly_frequency,
            leverage=muscle.leverage,
            damage_tier=muscle.damage_tier
        ))

    # Sort by net stimulus
    muscle_data.sort(key=lambda x: x['net'], reverse=True)
    muscles_list.sort(key=lambda x: x.net_stimulus, reverse=True)

    # Build group summaries
    by_group = defaultdict(list)
    for data in muscle_data:
        by_group[data['parent_group']].append(data)

    group_summaries = []
    for group, items in sorted(by_group.items()):
        group_summaries.append(MuscleGroupSummary(
            group=group,
            total_net_stimulus=sum(d['net'] for d in items),
            total_sets=sum(d['sets'] for d in items),
            regions=[d['region_id'] for d in items]
        ))

    # Generate suggestions
    suggestions = _generate_suggestions(muscle_data, request.maintenance_volume)

    # Calculate summary
    total_sets = sum(data['sets'] for data in muscle_data)
    trained_muscles = sum(1 for data in muscle_data if data['stimulus'] > 0)
    avg_net = sum(data['net'] for data in muscle_data if data['stimulus'] > 0) / max(trained_muscles, 1)

    summary = SummaryStats(
        total_sets=total_sets,
        muscles_trained=trained_muscles,
        total_muscles=len(split.muscles),
        avg_net_stimulus=avg_net,
        avg_sets_per_muscle=total_sets / max(trained_muscles, 1),
        group_summaries=group_summaries
    )

    # Build session breakdowns only if requested (expensive operation)
    session_breakdowns = _build_session_breakdowns(split, request) if request.include_breakdowns else []

    return AnalysisResponse(
        split_name=request.name,
        cycle_length=split.cycle_length,
        stimulus_duration=request.stimulus_duration,
        maintenance_volume=request.maintenance_volume,
        dataset=request.dataset,
        muscles=muscles_list,
        group_summaries=group_summaries,
        suggestions=suggestions,
        summary=summary,
        session_breakdowns=session_breakdowns
    )


def _generate_suggestions(muscle_data: List[dict], maintenance_volume: int) -> List[OptimizationSuggestion]:
    """Generate optimization suggestions from muscle data."""
    suggestions = []

    for data in muscle_data:
        name = data.get('display_name', data.get('region_id', 'Unknown'))
        net = data['net']
        sets = data['sets']
        freq = data['freq']
        atrophy = data['atrophy']
        stimulus = data['stimulus']

        # Under-stimulated
        if net < 1.0 and stimulus > 0:
            suggestions.append(OptimizationSuggestion(
                priority='HIGH',
                muscle=name,
                issue='Under-stimulated',
                suggestion=f"Net stimulus is only {net:.2f}. Consider adding 2-4 more sets or increasing frequency."
            ))
        elif net < 2.0 and stimulus > 0:
            suggestions.append(OptimizationSuggestion(
                priority='MEDIUM',
                muscle=name,
                issue='Low stimulus',
                suggestion=f"Net stimulus is {net:.2f}. Could benefit from 1-2 additional sets."
            ))

        # Untrained
        if sets == 0 and stimulus == 0:
            suggestions.append(OptimizationSuggestion(
                priority='HIGH',
                muscle=name,
                issue='Not trained',
                suggestion=f"No direct training. Add at least {maintenance_volume} sets per week."
            ))

        # Over-trained
        if sets > 12:
            suggestions.append(OptimizationSuggestion(
                priority='MEDIUM',
                muscle=name,
                issue='Excessive volume',
                suggestion=f"Weekly volume is {sets} sets. Consider reducing to 8-12 sets."
            ))

        # High atrophy ratio
        if stimulus > 0 and atrophy > 0:
            atrophy_ratio = atrophy / stimulus
            if atrophy_ratio > 0.4 and freq <= 1:
                suggestions.append(OptimizationSuggestion(
                    priority='HIGH',
                    muscle=name,
                    issue='High atrophy',
                    suggestion=f"Atrophy is {atrophy_ratio*100:.1f}% of stimulus. Increase frequency to 2x per week."
                ))

    return suggestions


def _build_session_breakdowns(split: Split, request: SplitRequest) -> List[SessionBreakdown]:
    """Transform session_stats exercise_breakdowns into SessionBreakdown models."""
    # The simulation may repeat sessions across multiple weeks.
    # Group by cycle-relative day and keep only the last occurrence (steady-state).
    cycle_hours = split.cycle_length * 24
    seen_sessions: dict = {}  # cycle_relative_time -> stats
    for stats in split.session_stats:
        if stats is None:
            continue
        breakdowns = stats.get('exercise_breakdowns')
        if not breakdowns:
            continue
        # Compute position within the cycle
        cycle_relative = stats.get('time', 0) % cycle_hours if cycle_hours > 0 else stats.get('time', 0)
        # Keep the latest occurrence (last simulated week = steady-state)
        seen_sessions[cycle_relative] = stats

    # Map request sessions by day for name lookup
    session_name_by_day = {}
    for s in request.sessions:
        session_name_by_day[s.day] = s.name

    result = []
    for time_key in sorted(seen_sessions.keys()):
        stats = seen_sessions[time_key]
        breakdowns = stats.get('exercise_breakdowns', [])

        # Determine session name and day number
        # The time is in hours; day number = floor(time / 24) + 1
        day_number = int(stats.get('time', 0) / 24) % split.cycle_length + 1
        session_name = session_name_by_day.get(day_number, f'Day {day_number}')

        exercises = []
        for ex_bd in breakdowns:
            contributions = []
            for muscle_id, mc_data in ex_bd.get('muscle_contributions', {}).items():
                sets_list = []
                for s in mc_data.get('sets', []):
                    sets_list.append(SetBreakdown(
                        set_number=s.get('set_number', 0),
                        weight=s.get('weight', 0.0),
                        recovery_multiplier=s.get('recovery_multiplier', 1.0),
                        bilateral_multiplier=s.get('bilateral_multiplier', 1.0),
                        local_multiplier=s.get('local_multiplier', 1.0),
                        global_multiplier=s.get('global_multiplier', 1.0),
                        consecutive_day_multiplier=s.get('consecutive_day_multiplier', 1.0),
                        final_stimulus=s.get('final_stimulus', 0.0),
                    ))
                contributions.append(MuscleContribution(
                    muscle_id=muscle_id,
                    display_name=mc_data.get('display_name', muscle_id),
                    tier=mc_data.get('tier', 'prime'),
                    base_weight=mc_data.get('base_weight', 0.0),
                    leverage_weight=mc_data.get('leverage_weight', 0.0),
                    sets=sets_list,
                    total_stimulus=mc_data.get('total_stimulus', 0.0),
                ))

            # Sort contributions: prime first, then by total_stimulus descending
            tier_order = {'prime': 0, 'secondary': 1, 'tertiary': 2, 'quaternary': 3}
            contributions.sort(key=lambda c: (tier_order.get(c.tier, 4), -c.total_stimulus))

            exercises.append(ExerciseBreakdown(
                name=ex_bd.get('name', ''),
                pattern=ex_bd.get('pattern', ''),
                sets=ex_bd.get('sets', 0),
                resistance_profile=ex_bd.get('resistance_profile', 'mid'),
                is_bilateral=ex_bd.get('is_bilateral', False),
                is_unilateral=ex_bd.get('is_unilateral', False),
                axial_load=ex_bd.get('axial_load', 0.0),
                muscle_contributions=contributions,
            ))

        result.append(SessionBreakdown(
            session_name=session_name,
            day_number=day_number,
            exercises=exercises,
            cumulative_sets=stats.get('total_sets', 0),
            cumulative_axial_fatigue=stats.get('axial_fatigue', 0.0),
            final_cns_multiplier=stats.get('final_cns_multiplier', 1.0),
            consecutive_days=stats.get('consecutive_days', 1),
            consecutive_day_penalty=stats.get('consecutive_day_penalty', 1.0),
        ))

    return result


# ============================================================================
# MUSCLE REGIONS ENDPOINT
# ============================================================================

@router.get("/muscle-regions", response_model=MuscleRegionsResponse)
async def get_muscle_regions():
    """
    Get all 29 anatomical muscle regions with their properties.

    Returns detailed information about each muscle region including:
    - Leverage type (optimal force position for MUR)
    - Damage tier (volume tolerance suggestion)
    - Recovery modifier
    - Whether it contributes to axial/spinal fatigue
    - Primary movement actions
    """
    try:
        regions = []
        all_regions = get_all_muscle_regions()

        for region_id, data in all_regions.items():
            regions.append(MuscleRegionInfo(
                region_id=region_id,
                display_name=data.display_name,
                parent_group=data.parent_group,
                leverage=data.leverage,
                damage_tier=data.damage_tier,
                recovery_modifier=data.recovery_modifier,
                axial_fatigue_contributor=data.axial_fatigue_contributor,
                primary_actions=data.primary_actions,
                notes=data.notes if data.notes else None
            ))

        # Sort by parent group then display name
        regions.sort(key=lambda r: (r.parent_group, r.display_name))

        return MuscleRegionsResponse(
            regions=regions,
            total_count=len(regions),
            parent_groups=sorted(get_parent_groups())
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching muscle regions: {str(e)}")


# ============================================================================
# EXERCISE PARSING ENDPOINT
# ============================================================================

@router.post("/parse-exercise", response_model=ExerciseParseResponse)
async def parse_exercise(request: ExerciseParseRequest):
    """
    Parse and classify a single exercise text.

    Returns tiered muscle targets (prime/secondary/tertiary movers),
    bilateral status, axial load, and resistance profile.
    """
    try:
        movement = move_match(request.text)

        if not movement:
            return ExerciseParseResponse(
                original_text=request.text,
                recognized=False,
                confidence="low"
            )

        pattern_key = movement.name.lower().replace(" ", "_").replace("-", "_")

        # Try to get granular pattern
        if pattern_key in GRANULAR_PATTERNS:
            tiered = get_pattern_muscle_targets(pattern_key)
            axial = get_pattern_axial_load(pattern_key)
            resistance = get_pattern_resistance_profile(pattern_key)
            bilateral = not movement.unilateral

            return ExerciseParseResponse(
                original_text=request.text,
                recognized=True,
                pattern=pattern_key,
                pattern_name=movement.name.title(),
                tiered_targets=TieredTargets(
                    prime=tiered.get('prime', {}),
                    secondary=tiered.get('secondary', {}),
                    tertiary=tiered.get('tertiary', {}),
                    quaternary=tiered.get('quaternary', {})
                ),
                bilateral=bilateral,
                unilateral=movement.unilateral,
                axial_load=axial,
                resistance_profile=resistance,
                confidence="high"
            )
        else:
            # Fall back to legacy format wrapped as tiered
            return ExerciseParseResponse(
                original_text=request.text,
                recognized=True,
                pattern=pattern_key,
                pattern_name=movement.name.title(),
                tiered_targets=TieredTargets(
                    prime={k: v for k, v in movement.targets.items() if v >= 0.5},
                    secondary={k: v for k, v in movement.targets.items() if 0.2 <= v < 0.5},
                    tertiary={k: v for k, v in movement.targets.items() if v < 0.2},
                    quaternary={}
                ),
                bilateral=not movement.unilateral,
                unilateral=movement.unilateral,
                axial_load=0.0,
                resistance_profile="mid",
                confidence="medium"
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing exercise: {str(e)}")


# ============================================================================
# MOVEMENT PATTERNS ENDPOINT
# ============================================================================

@router.get("/patterns", response_model=PatternsResponse)
async def get_patterns():
    """
    Get all movement patterns with tiered muscle targets.

    Each pattern shows:
    - Prime movers (full diminishing returns)
    - Secondary movers (60% penalty)
    - Tertiary movers (35% penalty)
    - Quaternary movers (15% penalty / stabilizers)
    - Bilateral status (affects motor unit recruitment)
    - Axial load (spinal fatigue contribution)
    - Resistance profile (ascending/mid/descending)
    """
    try:
        patterns = []

        for pattern_name, pattern_data in GRANULAR_PATTERNS.items():
            patterns.append(PatternInfo(
                name=pattern_name,
                display_name=pattern_name.replace("_", " ").title(),
                tiered_targets=TieredTargets(
                    prime=pattern_data.get('prime', {}),
                    secondary=pattern_data.get('secondary', {}),
                    tertiary=pattern_data.get('tertiary', {}),
                    quaternary=pattern_data.get('quaternary', {})
                ),
                bilateral=False,
                axial_load=pattern_data.get('axial_load', 0.0),
                resistance_profile=get_pattern_resistance_profile(pattern_name),
                notes=pattern_data.get('notes')
            ))

        patterns.sort(key=lambda p: p.display_name)

        return PatternsResponse(
            patterns=patterns,
            total_count=len(patterns)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching patterns: {str(e)}")
