from fastapi import APIRouter, HTTPException
from typing import Dict, List
import sys
from pathlib import Path

# Add parent to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from schemas.models import (
    SplitRequest, AnalysisResponse, MuscleStats, OptimizationSuggestion, SummaryStats,
    ExerciseParseRequest, ExerciseParseResponse,
    MovementPattern, MovementPatternsResponse
)
from core.MainClasses import Split, Session
from core.movementMatching import move_match, CANON_PATTERNS

router = APIRouter()


@router.post("/analyze-split", response_model=AnalysisResponse)
async def analyze_split(request: SplitRequest):
    """
    Analyze a complete training split and return muscle stimulus breakdown with optimization suggestions.

    This endpoint takes a training split (multiple workout sessions over a week/cycle) and simulates
    the muscle stimulus, atrophy, and net weekly hypertrophy using research-backed fatigue curves.
    """
    try:
        # Convert request sessions to Split format
        days = []
        for session in request.sessions:
            # Convert exercises to dictionary format
            exercises_dict = {}
            for exercise in session.exercises:
                exercises_dict[exercise.name] = exercise.sets

            days.append((session.name, session.day, exercises_dict))

        #make a split out of the days and specified parameters for the NWSM
        split = Split(
            name=request.name,
            days=days,
            stimulus_duration=request.stimulus_duration,
            maintenance_volume=request.maintenance_volume,
            dataset=request.dataset
        )

        # Run the simulation
        split.simulate_split()

        # Extract muscle data
        muscles_list = []
        muscle_data = []

        for muscle_name, muscle in split.muscles.items():
            net_stim = muscle.net_weekly_stimulus()
            data = {
                'name': muscle_name,
                'muscle': muscle,
                'net': net_stim,
                'stimulus': muscle.stimulus,
                'atrophy': muscle.atrophy,
                'sets': muscle.primary_sets,
                'freq': len(muscle.session_times) if muscle.session_times else 0
            }
            muscle_data.append(data)

            muscles_list.append(MuscleStats(
                name=muscle_name,
                stimulus=muscle.stimulus,
                atrophy=muscle.atrophy,
                net_stimulus=net_stim,
                primary_sets=muscle.primary_sets,
                frequency=len(muscle.session_times) if muscle.session_times else 0,
                leverage=muscle.leverage,
                damage_tier=muscle.damage_tier
            ))

        # Sort by net stimulus
        muscle_data.sort(key=lambda x: x['net'], reverse=True)
        muscles_list.sort(key=lambda x: x.net_stimulus, reverse=True)

        # Generate optimization suggestions
        suggestions = []

        for data in muscle_data:
            muscle = data['muscle']
            name = data['name']
            net = data['net']
            sets = data['sets']
            freq = data['freq']
            atrophy = data['atrophy']
            stimulus = data['stimulus']

            # Under-stimulated muscles
            if net < 1.0 and sets > 0:
                suggestions.append(OptimizationSuggestion(
                    priority='HIGH',
                    muscle=name,
                    issue='Under-stimulated',
                    suggestion=f"Net stimulus is only {net:.2f}. Consider adding 2-4 more sets or increasing training frequency."
                ))
            elif net < 2.0 and sets > 0:
                suggestions.append(OptimizationSuggestion(
                    priority='MEDIUM',
                    muscle=name,
                    issue='Low stimulus',
                    suggestion=f"Net stimulus is {net:.2f}. Could benefit from 1-2 additional sets."
                ))

            # Untrained muscles
            if sets == 0:
                suggestions.append(OptimizationSuggestion(
                    priority='HIGH',
                    muscle=name,
                    issue='Not trained',
                    suggestion=f"No direct training. Add at least {request.maintenance_volume} sets per week."
                ))

            # Over-trained muscles
            if sets > 12:
                suggestions.append(OptimizationSuggestion(
                    priority='MEDIUM',
                    muscle=name,
                    issue='Excessive volume',
                    suggestion=f"Weekly volume is {sets} sets. Consider reducing to 8-12 sets for better recovery."
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
                elif atrophy_ratio > 0.3 and freq <= 1:
                    suggestions.append(OptimizationSuggestion(
                        priority='MEDIUM',
                        muscle=name,
                        issue='Suboptimal frequency',
                        suggestion=f"Training only {freq}x per week with {atrophy_ratio*100:.1f}% atrophy ratio. Consider 2x frequency."
                    ))

            # High frequency, low volume
            if freq >= 4 and sets < 8:
                suggestions.append(OptimizationSuggestion(
                    priority='LOW',
                    muscle=name,
                    issue='High frequency, low volume',
                    suggestion=f"Training {freq}x per week with only {sets} total sets. Could consolidate to 2-3 sessions."
                ))

            # Leverage considerations
            if muscle.leverage == "S" and sets > 0 and sets < request.maintenance_volume + 2:
                suggestions.append(OptimizationSuggestion(
                    priority='LOW',
                    muscle=name,
                    issue='Short leverage muscle',
                    suggestion=f"Short leverage muscles benefit from higher volumes. Current: {sets} sets."
                ))

            # High damage tier
            if muscle.damage_tier == "+" and sets > 10:
                suggestions.append(OptimizationSuggestion(
                    priority='LOW',
                    muscle=name,
                    issue='High damage + high volume',
                    suggestion=f"High damage tier muscle with {sets} sets. Monitor recovery closely."
                ))

        # Calculate summary statistics
        total_sets = sum(data['sets'] for data in muscle_data)
        trained_muscles = sum(1 for data in muscle_data if data['sets'] > 0)
        avg_net_stimulus = sum(data['net'] for data in muscle_data if data['sets'] > 0) / max(trained_muscles, 1)

        summary = SummaryStats(
            total_sets=total_sets,
            muscles_trained=trained_muscles,
            total_muscles=len(split.muscles),
            avg_net_stimulus=avg_net_stimulus,
            avg_sets_per_muscle=total_sets / max(trained_muscles, 1)
        )

        return AnalysisResponse(
            split_name=request.name,
            cycle_length=split.cycle_length,
            stimulus_duration=request.stimulus_duration,
            maintenance_volume=request.maintenance_volume,
            dataset=request.dataset,
            muscles=muscles_list,
            suggestions=suggestions,
            summary=summary
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing split: {str(e)}")


@router.post("/parse-exercise", response_model=ExerciseParseResponse)
async def parse_exercise(request: ExerciseParseRequest):
    """
    Parse and classify a single exercise text.

    Returns the recognized movement pattern and muscle targets.
    Useful for validating exercise names before submitting a full split analysis.
    """
    try:
        movement = move_match(request.text)

        if not movement:
            return ExerciseParseResponse(
                original_text=request.text,
                recognized=False,
                confidence="low"
            )

        return ExerciseParseResponse(
            original_text=request.text,
            recognized=True,
            pattern=movement.name,
            pattern_name=movement.name.title(),
            targets=movement.targets,
            unilateral=movement.unilateral,
            confidence="high" if movement.targets else "medium"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing exercise: {str(e)}")


@router.get("/movement-patterns", response_model=MovementPatternsResponse)
async def get_movement_patterns():
    """
    Get all available movement patterns and their muscle targets.

    Returns a complete list of recognized exercise patterns with their primary
    and secondary muscle targets. Useful for autocomplete and validation.
    """
    try:
        patterns = []

        for pattern_name, targets in CANON_PATTERNS.items():
            patterns.append(MovementPattern(
                name=pattern_name,
                display_name=pattern_name.replace("_", " ").title(),
                targets=targets,
                description=f"Primary: {max(targets, key=targets.get)}"
            ))

        # Sort alphabetically
        patterns.sort(key=lambda p: p.display_name)

        return MovementPatternsResponse(
            patterns=patterns,
            total_count=len(patterns)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching movement patterns: {str(e)}")
