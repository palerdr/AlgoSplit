"""
Main Classes for AlgoSplit Stimulus Engine

Core classes for simulating workout splits and calculating net weekly stimulus
using a granular 29-region anatomical muscle model.
"""

from collections import defaultdict
import numpy as np
from typing import Dict, List, Set, Optional, Any, Tuple

from .movementMatching import move_match
from .muscle_regions import get_all_muscle_regions, MuscleRegionData, LEGACY_MUSCLE_MAPPING
from .stimulus_tiers import (
    StimulusTier,
    TIER_BETA_VALUES,
    get_tier_beta,
)
from .fatigue_modifiers import (
    GlobalFatigueState,
    ConsecutiveDayTracker,
    get_bilateral_modifier,
    calculate_axial_contribution,
    is_bilateral_compound,
    calculate_cns_fatigue,
    calculate_consecutive_day_penalty,
)
from .granular_patterns import (
    get_pattern_muscle_targets,
    is_pattern_bilateral,
    get_pattern_axial_load,
    get_pattern_resistance_profile,
    GRANULAR_PATTERNS
)


# ============================================================================
# EMPIRICAL DATA CURVES (Schoenfeld & Pelland meta-analyses)
# ============================================================================

SCHOENFELD = [1.00, 1.39, 1.61, 1.77, 1.90, 2.00, 2.09, 2.16, 2.23]
PELLAND = [1.00, 1.89, 2.50, 3.07, 3.56, 4.00, 4.40, 4.78, 5.16]
AVG = [(PELLAND[i] + SCHOENFELD[i]) / 2 for i in range(0, 9)]

# Marginal gains per set (diminishing returns)
ds = [SCHOENFELD[0]] + [SCHOENFELD[i] - SCHOENFELD[i-1] for i in range(1, 9)]
dp = [PELLAND[0]] + [PELLAND[i] - PELLAND[i-1] for i in range(1, 9)]
da = [AVG[0]] + [AVG[i] - AVG[i-1] for i in range(1, 9)]

# Dataset selectors
cum = {
    'schoenfeld': SCHOENFELD,
    'pelland': PELLAND,
    'average': AVG
}

marginals = {
    'schoenfeld': ds,
    'pelland': dp,
    'average': da
}


# ============================================================================
# LEVERAGE (Resistance Profile Matching)
# ============================================================================
# Leverage describes the muscle's optimal force production position:
#   S (Short) = peak tension at shortened position
#   M (Mid)   = peak tension at mid-range
#   L (Long)  = peak tension at lengthened position
#
# Resistance profiles describe where the exercise is hardest:
#   ascending  = hardest at top (shortened muscle) - e.g., cable crossover high
#   mid        = hardest at mid-range             - e.g., most free weights
#   descending = hardest at bottom (lengthened)   - e.g., flyes, preacher curl
#
# When there's a mismatch, motor unit recruitment is suboptimal.
# Made symmetric: S↔descending and L↔ascending both penalized equally

LEVERAGE_MATCH_MULTIPLIERS = {
    # (muscle_leverage, exercise_profile): multiplier
    ('S', 'ascending'): 1.0,    # Perfect match - shortened muscle, hardest at top
    ('S', 'mid'): 0.85,
    ('S', 'descending'): 0.70,  # Worst mismatch

    ('M', 'ascending'): 0.85,
    ('M', 'mid'): 1.0,          # Perfect match
    ('M', 'descending'): 0.85,

    ('L', 'ascending'): 0.70,   # Worst mismatch
    ('L', 'mid'): 0.85,
    ('L', 'descending'): 1.0,   # Perfect match - lengthened muscle, hardest at bottom
}


def get_leverage_multiplier(muscle_leverage: str, resistance_profile: str) -> float:
    """
    Get motor unit recruitment multiplier based on leverage matching.

    Args:
        muscle_leverage: 'S', 'M', or 'L'
        resistance_profile: 'ascending', 'mid', or 'descending'

    Returns:
        Multiplier for stimulus (0.70 to 1.0)
    """
    return LEVERAGE_MATCH_MULTIPLIERS.get(
        (muscle_leverage, resistance_profile),
        0.85  # Default for unknown
    )


def redistribute_leverage_weights(
    tiered_targets: Dict[str, Dict[str, float]],
    resistance_profile: str,
    muscles: Dict[str, 'MuscleRegion']
) -> Dict[str, Dict[str, float]]:
    """
    Redistribute stimulus weights based on leverage matching (TIER-AGNOSTIC).

    When muscles have poor leverage match, their "lost" stimulus is redistributed
    to muscles with better leverage for that profile, REGARDLESS of tier.
    This ensures total stimulus is conserved while flowing to the muscles
    that can best utilize it for the given resistance profile.

    Example: For a descending profile (hardest at stretch):
    - L (long) leverage muscles get 1.0x multiplier (perfect match)
    - S (short) leverage muscles get 0.70x multiplier (poor match)
    - The "lost" 30% from S muscles flows to L muscles across ALL tiers

    Args:
        tiered_targets: Original pattern targets by tier
        resistance_profile: 'ascending', 'mid', or 'descending'
        muscles: Dictionary of MuscleRegion objects (to get leverage info)

    Returns:
        Adjusted tiered_targets with redistributed weights (tier membership preserved)
    """
    # Step 1: Flatten all muscles across all tiers, tracking tier membership
    all_muscles = {}  # muscle_id -> {'tier': str, 'weight': float}
    for tier, targets in tiered_targets.items():
        for muscle_id, weight in targets.items():
            all_muscles[muscle_id] = {'tier': tier, 'weight': weight}

    if not all_muscles:
        return {tier: {} for tier in tiered_targets.keys()}

    # Step 2: Calculate leverage multipliers for ALL muscles globally
    raw_multipliers = {}
    for muscle_id in all_muscles.keys():
        muscle = muscles.get(muscle_id)
        if muscle:
            raw_multipliers[muscle_id] = get_leverage_multiplier(
                muscle.leverage, resistance_profile
            )
        else:
            raw_multipliers[muscle_id] = 0.85  # Default

    # Step 3: Calculate global total (sum of all weights across all tiers)
    total_original = sum(info['weight'] for info in all_muscles.values())
    if total_original == 0:
        return {tier: {} for tier in tiered_targets.keys()}

    # Step 4: Apply leverage multipliers globally
    weighted = {
        mid: info['weight'] * raw_multipliers[mid]
        for mid, info in all_muscles.items()
    }
    total_weighted = sum(weighted.values())

    if total_weighted == 0:
        return tiered_targets

    # Step 5: Normalize globally to preserve total stimulus across ALL tiers
    # The "lost" stimulus from poor-leverage muscles flows to good-leverage muscles
    # regardless of which tier they belong to
    scale = total_original / total_weighted
    adjusted_global = {
        mid: w * scale
        for mid, w in weighted.items()
    }

    # Step 6: Reassign adjusted weights back to their original tiers
    adjusted = {tier: {} for tier in tiered_targets.keys()}
    for muscle_id, info in all_muscles.items():
        tier = info['tier']
        adjusted[tier][muscle_id] = adjusted_global[muscle_id]

    return adjusted


# ============================================================================
# DAMAGE TIER (Volume Tolerance Guidelines)
# ============================================================================
# Damage tier is a SOFT RECOMMENDATION for volume/frequency programming:
#   + (High damage) = Can tolerate MORE volume and frequency (e.g., quads, erectors)
#   0 (Neutral)     = Standard volume recommendations
#   - (Low damage)  = Easily damaged, suggest LESS volume/frequency (e.g., biceps)
#
# This does NOT affect stimulus calculation - it's metadata for generating
# recommendations and suggestions. The actual muscle damage varies by individual
# fiber type composition.

# Volume recommendations by damage tier (multipliers of maintenance volume)
# These are relative to each muscle's baseline maintenance volume.
# "balanced" replaces the old "optimal" label.
DAMAGE_TIER_VOLUME_GUIDELINES = {
    '+': {'minimalistic': 1.0, 'balanced': 2.1, 'max': 3.2, 'balanced_min_sessions': 2},
    '0': {'minimalistic': 1.0, 'balanced': 2.0, 'max': 3.0, 'balanced_min_sessions': 2},
    '-': {'minimalistic': 1.0, 'balanced': 1.7, 'max': 2.6, 'balanced_min_sessions': 2},
}


def get_volume_guideline(
    damage_tier: str,
    maintenance_volume: Optional[int] = None
) -> dict:
    """
    Get volume guidelines based on damage tier (recommendation only).

    If maintenance_volume is provided, returns absolute set targets derived
    from the baseline. Otherwise returns relative multipliers.
    """
    guideline = DAMAGE_TIER_VOLUME_GUIDELINES.get(
        damage_tier, DAMAGE_TIER_VOLUME_GUIDELINES['0']
    ).copy()

    if maintenance_volume is None:
        return guideline

    baseline = max(1, maintenance_volume)
    return {
        'baseline': baseline,
        'minimalistic': int(round(baseline * guideline['minimalistic'])),
        'balanced': int(round(baseline * guideline['balanced'])),
        'max': int(round(baseline * guideline['max'])),
        'balanced_min_sessions': guideline.get('balanced_min_sessions', 2)
    }


def classify_volume_tier(
    weekly_sets: int,
    sessions_per_week: int,
    maintenance_volume: int,
    damage_tier: str
) -> str:
    """
    Classify weekly volume using baseline-relative guidelines and frequency.

    Example: 6 sets for a muscle with maintenance 3 can be "balanced" if
    spread across 2+ sessions, but remains "minimalistic" if done in 1 session.
    """
    guideline = get_volume_guideline(damage_tier, maintenance_volume)

    if weekly_sets < guideline['minimalistic']:
        return 'below_maintenance'

    if weekly_sets >= guideline['max']:
        return 'excessive'

    if (weekly_sets >= guideline['balanced'] and
            sessions_per_week >= guideline['balanced_min_sessions']):
        return 'balanced'

    return 'minimalistic'


class MuscleRegion:
    """
    Granular muscle region with tiered stimulus tracking.

    Tracks stimulus, atrophy, and set counts across prime/secondary/tertiary tiers.
    Applies leverage matching and damage tier modifiers.
    """

    def __init__(
        self,
        region_id: str,
        display_name: str,
        parent_group: str,
        leverage: str,
        damage_tier: str,
        recovery_modifier: float = 1.0,
        axial_fatigue_contributor: bool = False
    ):
        self.region_id = region_id
        self.name = region_id  # Alias for compatibility
        self.display_name = display_name
        self.parent_group = parent_group
        self.leverage = leverage
        self.damage_tier = damage_tier
        self.recovery_modifier = recovery_modifier
        self.axial_fatigue_contributor = axial_fatigue_contributor

        # Session tracking
        self.residuals = 0
        self.sets_this_session = 0
        self._last_breakdown: Optional[Dict[str, Any]] = None

        # Weekly tracking
        self.primary_sets = 0
        self.stimulus = 0.0
        self.atrophy = 0.0
        self.last_trained_time: Optional[float] = None
        self.last_session_time: Optional[float] = None
        self.session_times: Set[float] = set()
        self.weekly_frequency: float = 0.0  # Average sessions per week

        # Tiered set counters
        self.prime_sets = 0
        self.secondary_sets = 0
        self.tertiary_sets = 0
        self.quaternary_sets = 0

    def residual_local_multiplier(self, dataset: str, k: int, beta: float = 0.5) -> float:
        """
        Calculate softened marginal curve for non-prime movers.

        Args:
            dataset: Which empirical curve to use
            k: Set number (0-indexed)
            beta: Softening factor (0=no diminishing returns, 1=full curve)

        Returns:
            Multiplier for stimulus (0.0 to 1.0)
        """
        m = marginals[dataset]
        if k < 9:
            mk = m[k]
        else:
            # Beyond set 9, continue with very small decay
            mk = m[8] * (0.97 ** (k - 8))
        return 1.0 - beta * (1.0 - mk)

    def g(self, x: int, axial_fatigue: float = 0.0) -> float:
        """
        Global CNS fatigue function.
        Returns multiplier that decays from 1.0 to ~0.85 as sets accumulate.
        """
        return calculate_cns_fatigue(x, axial_fatigue=axial_fatigue)

    def apply_stimulus(
        self,
        stimulus_amount: float,
        tier: str,
        is_unilateral: bool,
        is_bilateral: bool,
        resistance_profile: str,
        hours_since_training: Optional[float],
        stimulus_duration: int,
        global_set_number: int,
        axial_fatigue: float,
        dataset: str,
        current_session_time: float,
        consecutive_day_penalty: float = 1.0,
        collect_breakdown: bool = True,
    ) -> float:
        """
        Apply tiered stimulus with all modifiers.

        Modifier chain:
        1. Recovery penalty (if training same muscle too soon)
        2. Bilateral/Unilateral modifier
        3. Local marginal curve (tier-specific diminishing returns)
        4. Global CNS fatigue (axial fatigue increases CNS fatigue)
        5. Consecutive day penalty (systemic fatigue from training multiple days in a row)

        Note: Leverage matching is handled via weight redistribution at the
        exercise level (redistribute_leverage_weights), not here. This ensures
        that "lost" stimulus from poor-leverage muscles flows to muscles with
        better leverage for the resistance profile.

        Returns:
            Actual stimulus applied
        """
        # 1. Recovery penalty (if different session and not fully recovered)
        recovery_ratio = 1.0
        if (hours_since_training is not None and
            hours_since_training < stimulus_duration and
            self.last_session_time != current_session_time):
            recovery_ratio = max(0.0, min(1.0, hours_since_training / float(stimulus_duration)))
            stimulus_amount *= recovery_ratio

        # 2. Bilateral/Unilateral modifier
        bilateral_mod = get_bilateral_modifier(is_bilateral, is_unilateral)
        stimulus_amount *= bilateral_mod

        # Note: Leverage matching handled via redistribute_leverage_weights()
        # Note: damage_tier is NOT applied as a multiplier - it's a soft recommendation
        # for volume/frequency programming, not a hard stimulus modifier.

        # 3. Get tier-specific beta for diminishing returns
        beta = get_tier_beta(tier)

        # 4. Calculate local multiplier based on tier
        if tier == StimulusTier.PRIME or tier == "prime":
            # Prime mover: full marginal curve
            if self.sets_this_session < 9:
                local_mult = marginals[dataset][self.sets_this_session]
            else:
                local_mult = marginals[dataset][8] * (0.97 ** (self.sets_this_session - 8))
            self.sets_this_session += 1
            self.prime_sets += 1
        else:
            # Secondary/tertiary/quaternary: softened curve
            local_mult = self.residual_local_multiplier(dataset, self.residuals, beta=beta)
            self.residuals += 1

            if tier == StimulusTier.SECONDARY or tier == "secondary":
                self.secondary_sets += 1
            elif tier == StimulusTier.TERTIARY or tier == "tertiary":
                self.tertiary_sets += 1
            else:
                self.quaternary_sets += 1

        # 5. Global CNS fatigue multiplier
        global_mult = self.g(global_set_number, axial_fatigue=axial_fatigue)

        # 6. Apply consecutive day penalty (systemic fatigue from training without rest)
        # This affects the entire session uniformly
        consecutive_mult = consecutive_day_penalty

        # 7. Calculate final stimulus
        final_stimulus = global_mult * local_mult * consecutive_mult * stimulus_amount
        self.stimulus += final_stimulus

        # Store breakdown only when requested.
        if collect_breakdown:
            self._last_breakdown = {
                'recovery_multiplier': recovery_ratio,
                'bilateral_multiplier': bilateral_mod,
                'local_multiplier': local_mult,
                'global_multiplier': global_mult,
                'consecutive_day_multiplier': consecutive_mult,
                'tier_beta': beta,
                'final_stimulus': final_stimulus,
            }
        else:
            self._last_breakdown = None

        # Track primary sets (only prime movers count)
        if tier == StimulusTier.PRIME or tier == "prime":
            self.primary_sets += 1

        return final_stimulus

    def apply_atrophy(
        self,
        hours_since_training: Optional[float],
        stimulus_duration: int,
        maintenance_volume: int,
        dataset: str
    ) -> None:
        """
        Apply atrophy based on time since last training.
        Atrophy only begins after the stimulus window expires.
        """
        if hours_since_training is None:
            return

        if hours_since_training > stimulus_duration:
            hours_in_atrophy = hours_since_training - stimulus_duration
            atrophy_period = 168 - stimulus_duration
            atrophy_rate = cum[dataset][maintenance_volume - 1] / atrophy_period
            self.atrophy += atrophy_rate * hours_in_atrophy

    def reset_session(self) -> None:
        """Reset per-session tracking variables."""
        self.residuals = 0
        self.sets_this_session = 0

    def reset_week(self) -> None:
        """Reset all tracking for a new week."""
        self.residuals = 0
        self.sets_this_session = 0
        self.primary_sets = 0
        self.prime_sets = 0
        self.secondary_sets = 0
        self.tertiary_sets = 0
        self.quaternary_sets = 0
        self.stimulus = 0.0
        self.atrophy = 0.0
        self.last_trained_time = None
        self.last_session_time = None
        self.session_times = set()

    def net_weekly_stimulus(self) -> float:
        """Calculate net weekly stimulus (stimulus minus atrophy)."""
        return self.stimulus - self.atrophy

    def get_stats(self) -> Dict[str, Any]:
        """Get muscle stats as dictionary."""
        return {
            'region_id': self.region_id,
            'display_name': self.display_name,
            'parent_group': self.parent_group,
            'stimulus': self.stimulus,
            'atrophy': self.atrophy,
            'net': self.net_weekly_stimulus(),
            'primary_sets': self.primary_sets,
            'prime_sets': self.prime_sets,
            'secondary_sets': self.secondary_sets,
            'tertiary_sets': self.tertiary_sets,
            'frequency': len(self.session_times),
            'leverage': self.leverage,
            'damage_tier': self.damage_tier
        }


# ============================================================================
# SESSION CLASS
# ============================================================================

class Session:
    """Represents a single training session within a split."""

    def __init__(self, name: str, day: int, exercises: Dict[str, Any]):
        """
        Args:
            name: Session name
            day: Day number (1-indexed)
            exercises: Dict mapping exercise name to either:
                - int: just the number of sets
                - tuple of 2: (sets, unilateral_flag)
                - tuple of 3: (sets, unilateral_flag, resistance_profile_override)
        """
        self.name = name
        self.time = (day - 1) * 24  # Hours into the split/cycle
        # Normalize exercises to always have (sets, unilateral, resistance_profile) format
        self.exercises = {}
        self.exercise_unilateral = {}
        self.exercise_resistance_profile = {}  # Optional override
        for ex_name, value in exercises.items():
            if isinstance(value, tuple):
                self.exercises[ex_name] = value[0]  # sets
                self.exercise_unilateral[ex_name] = value[1] if len(value) > 1 else False
                self.exercise_resistance_profile[ex_name] = value[2] if len(value) > 2 else None
            else:
                self.exercises[ex_name] = value  # just sets
                self.exercise_unilateral[ex_name] = False
                self.exercise_resistance_profile[ex_name] = None

    def execute(
        self,
        muscles: Dict[str, MuscleRegion],
        stimulus_duration: int,
        dataset: str,
        fatigue_state: Optional[GlobalFatigueState] = None,
        consecutive_day_penalty: float = 1.0,
        collect_breakdowns: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """
        Execute session with granular muscle regions and tiered stimulus.

        Args:
            muscles: Dictionary of MuscleRegion objects
            stimulus_duration: Recovery window in hours
            dataset: Which empirical curve to use
            fatigue_state: Global fatigue state (created if None)
            consecutive_day_penalty: MUR penalty from training consecutive days (0.25-1.0)

        Returns:
            Session statistics dictionary or None if rest day
        """
        if self.name == "Rest" or not self.exercises:
            return None

        if fatigue_state is None:
            fatigue_state = GlobalFatigueState()

        global_sets = 0
        session_stats = {
            'time': self.time,
            'total_sets': 0,
            'muscles_trained': set(),
            'stimulus_by_muscle': defaultdict(float),
            'exercises_performed': [],
            'axial_fatigue': 0.0,
            'bilateral_compounds': 0,
            'consecutive_day_penalty': consecutive_day_penalty,
        }

        # Reset muscles at session start
        for muscle in muscles.values():
            muscle.reset_session()

        exercise_breakdowns = []

        # Process each exercise
        for exercise_name, sets in self.exercises.items():
            # Get explicit flags if provided
            force_unilateral = self.exercise_unilateral.get(exercise_name, False)
            resistance_override = self.exercise_resistance_profile.get(exercise_name)

            # Match exercise to pattern
            pattern_name, tiered_targets, is_bilateral, is_unilateral, axial_load, resistance_profile = \
                self._get_exercise_pattern(
                    exercise_name,
                    force_unilateral=force_unilateral,
                    resistance_profile_override=resistance_override
                )
            if pattern_name is None:
                continue

            # Save pre-leverage weights for breakdown comparison only when needed.
            pre_leverage_targets = (
                {tier: dict(targets) for tier, targets in tiered_targets.items()}
                if collect_breakdowns
                else {}
            )

            # Redistribute weights based on leverage matching
            # Lost stimulus from poor-leverage muscles flows to better-leverage muscles
            tiered_targets = redistribute_leverage_weights(
                tiered_targets, resistance_profile, muscles
            )

            # Build per-exercise breakdown
            exercise_bd: Optional[Dict[str, Any]] = None
            if collect_breakdowns:
                exercise_bd = {
                    'name': exercise_name,
                    'pattern': pattern_name,
                    'sets': sets,
                    'resistance_profile': resistance_profile,
                    'is_bilateral': is_bilateral,
                    'is_unilateral': is_unilateral,
                    'axial_load': axial_load,
                    'muscle_contributions': {},
                }

            # Update axial fatigue before processing sets
            if axial_load > 0:
                axial_contribution = calculate_axial_contribution(pattern_name, sets)
                fatigue_state.add_axial_fatigue(axial_contribution)

            # Track bilateral compounds
            if is_bilateral_compound(pattern_name, is_unilateral):
                fatigue_state.add_bilateral_compound(sets)

            # Process each set
            for set_num in range(sets):
                global_sets += 1
                fatigue_state.add_sets(1)

                # Apply stimulus to each muscle by tier
                for tier in ['prime', 'secondary', 'tertiary', 'quaternary']:
                    tier_targets = tiered_targets.get(tier, {})

                    for muscle_id, weight in tier_targets.items():
                        muscle = muscles.get(muscle_id)
                        if not muscle:
                            continue

                        hours_since = None
                        if muscle.last_trained_time is not None:
                            hours_since = self.time - muscle.last_trained_time

                        stimulus = muscle.apply_stimulus(
                            stimulus_amount=weight,
                            tier=tier,
                            is_unilateral=is_unilateral,
                            is_bilateral=is_bilateral,
                            resistance_profile=resistance_profile,
                            hours_since_training=hours_since,
                            stimulus_duration=stimulus_duration,
                            global_set_number=global_sets,
                            axial_fatigue=fatigue_state.axial_fatigue,
                            dataset=dataset,
                            current_session_time=self.time,
                            consecutive_day_penalty=consecutive_day_penalty,
                            collect_breakdown=collect_breakdowns,
                        )

                        session_stats['stimulus_by_muscle'][muscle_id] += stimulus
                        session_stats['muscles_trained'].add(muscle_id)

                        # Collect breakdown data
                        if collect_breakdowns and exercise_bd is not None and muscle._last_breakdown is not None:
                            bd = muscle._last_breakdown.copy()
                            bd['set_number'] = set_num + 1
                            bd['weight'] = weight

                            if muscle_id not in exercise_bd['muscle_contributions']:
                                base_weight = pre_leverage_targets.get(tier, {}).get(muscle_id, weight)
                                exercise_bd['muscle_contributions'][muscle_id] = {
                                    'display_name': muscle.display_name,
                                    'tier': tier,
                                    'base_weight': base_weight,
                                    'leverage_weight': weight,
                                    'sets': [],
                                    'total_stimulus': 0.0,
                                }
                            mc = exercise_bd['muscle_contributions'][muscle_id]
                            mc['sets'].append(bd)
                            mc['total_stimulus'] += bd['final_stimulus']

            # Frequency tracks direct/prime training, not secondary stimulus.
            for muscle_id in tiered_targets.get('prime', {}).keys():
                muscle = muscles.get(muscle_id)
                if muscle:
                    muscle.last_trained_time = self.time
                    muscle.last_session_time = self.time
                    muscle.session_times.add(self.time)

            # Record exercise
            session_stats['exercises_performed'].append({
                'name': exercise_name,
                'pattern': pattern_name,
                'sets': sets,
                'unilateral': is_unilateral,
                'bilateral': is_bilateral,
                'resistance_profile': resistance_profile,
                'tiered_targets': tiered_targets
            })

            if collect_breakdowns and exercise_bd is not None:
                exercise_breakdowns.append(exercise_bd)

        session_stats['total_sets'] = global_sets
        session_stats['muscles_trained'] = list(session_stats['muscles_trained'])
        session_stats['stimulus_by_muscle'] = dict(session_stats['stimulus_by_muscle'])
        session_stats['axial_fatigue'] = fatigue_state.axial_fatigue
        session_stats['bilateral_compounds'] = fatigue_state.bilateral_compounds
        session_stats['bilateral_compound_sets'] = fatigue_state.bilateral_compound_sets
        session_stats['exercise_breakdowns'] = exercise_breakdowns if collect_breakdowns else []
        session_stats['final_cns_multiplier'] = calculate_cns_fatigue(
            global_sets, axial_fatigue=fatigue_state.axial_fatigue
        )

        return session_stats

    def _get_exercise_pattern(
        self,
        exercise_name: str,
        force_unilateral: bool = False,
        resistance_profile_override: Optional[str] = None
    ) -> Tuple[
        Optional[str],  # pattern_name
        Dict[str, Dict[str, float]],  # tiered_targets
        bool,  # is_bilateral
        bool,  # is_unilateral
        float,  # axial_load
        str    # resistance_profile
    ]:
        """
        Get pattern info for an exercise.

        Args:
            exercise_name: Name of the exercise
            force_unilateral: Explicit unilateral flag from frontend
            resistance_profile_override: Optional override for resistance profile
                ('ascending', 'mid', 'descending')

        Returns tuple of (pattern_name, tiered_targets, is_bilateral, is_unilateral, axial_load, resistance_profile)
        """
        # First try legacy matcher to get pattern name
        pattern = move_match(exercise_name)
        if not pattern:
            return (None, {}, False, False, 0.0, resistance_profile_override or 'mid')

        # Normalize pattern name
        normalized = pattern.name.lower().replace(" ", "_").replace("-", "_")

        # Check if this pattern exists in granular patterns
        if normalized in GRANULAR_PATTERNS:
            pattern_name = normalized
        else:
            # Try partial match
            pattern_name = None
            for key in GRANULAR_PATTERNS.keys():
                if normalized in key or key in normalized:
                    pattern_name = key
                    break

        if pattern_name:
            # Use granular pattern
            tiered_targets = get_pattern_muscle_targets(pattern_name)
            is_bilateral = is_pattern_bilateral(pattern_name)
            axial_load = get_pattern_axial_load(pattern_name)
            # Use override if provided, otherwise use pattern default
            resistance_profile = resistance_profile_override or get_pattern_resistance_profile(pattern_name)
        else:
            # Fall back to converted legacy
            tiered_targets = self._legacy_to_tiered(pattern.targets)
            is_bilateral = not pattern.unilateral
            axial_load = 0.0
            resistance_profile = resistance_profile_override or 'mid'
            pattern_name = normalized

        # Unilateral: use explicit flag, name detection, or pattern detection
        is_unilateral = force_unilateral or self._is_unilateral(exercise_name) or pattern.unilateral

        # Mutual exclusivity: if unilateral is detected, override bilateral to False
        if is_unilateral:
            is_bilateral = False

        return (pattern_name, tiered_targets, is_bilateral, is_unilateral, axial_load, resistance_profile)

    def _is_unilateral(self, exercise_name: str) -> bool:
        """Check if exercise name indicates unilateral movement."""
        unilateral_terms = [
            'single', 'one arm', 'one-arm', 'one leg', 'one-leg',
            'unilateral', 'sa ', 'sl ', 'single arm', 'single leg',
            'alternating', '1-arm', '1-leg', '1 arm', '1 leg'
        ]
        name_lower = exercise_name.lower()
        return any(term in name_lower for term in unilateral_terms)

    def _legacy_to_tiered(self, targets: Dict[str, float]) -> Dict[str, Dict[str, float]]:
        """Convert legacy flat targets to tiered format."""
        tiered = {'prime': {}, 'secondary': {}, 'tertiary': {}, 'quaternary': {}}

        for muscle_name, weight in targets.items():
            # Map legacy muscle names to granular regions
            granular_regions = LEGACY_MUSCLE_MAPPING.get(muscle_name, [muscle_name])

            # Distribute weight across regions
            weight_per_region = weight / len(granular_regions)

            for region in granular_regions:
                if weight >= 0.5:
                    tiered['prime'][region] = weight_per_region
                elif weight >= 0.2:
                    tiered['secondary'][region] = weight_per_region
                elif weight >= 0.1:
                    tiered['tertiary'][region] = weight_per_region
                else:
                    tiered['quaternary'][region] = weight_per_region

        return tiered


# ============================================================================
# SPLIT CLASS
# ============================================================================

class Split:
    """
    Represents a workout split/cycle of arbitrary length.

    Simulates muscle stimulus and atrophy across multiple weeks to
    calculate steady-state net weekly stimulus per muscle region.
    """

    def __init__(
        self,
        name: str,
        days: List[Tuple[str, int, Dict[str, int]]],
        stimulus_duration: int,
        maintenance_volume: int,
        dataset: str,
        cycle_length: Optional[int] = None
    ):
        self.name = name
        self.stimulus_duration = stimulus_duration
        self.maintenance_volume = maintenance_volume
        self.dataset = dataset

        # Cycle length can be explicitly set, or defaults to max day number
        # e.g., Full Body every other day = cycle_length of 2 (train, rest, repeat)
        if cycle_length is not None:
            self.cycle_length = cycle_length
        else:
            self.cycle_length = max(day for _, day, _ in days) if days else 7

        # Create sessions from day tuples
        self.days = [Session(name, day, exercises) for name, day, exercises in days]

        # Initialize muscles
        self._init_muscles()
        self.session_stats = []

    def _init_muscles(self) -> None:
        """Initialize all 29 granular muscle regions."""
        self.muscles = {}
        all_regions = get_all_muscle_regions()

        for region_id, data in all_regions.items():
            self.muscles[region_id] = MuscleRegion(
                region_id=region_id,
                display_name=data.display_name,
                parent_group=data.parent_group,
                leverage=data.leverage,
                damage_tier=data.damage_tier,
                recovery_modifier=data.recovery_modifier,
                axial_fatigue_contributor=data.axial_fatigue_contributor
            )

    def simulate_split(self, collect_breakdowns: bool = True) -> None:
        """
        Execute all phases of atrophy and stimulus for the workout split.
        Handles arbitrary cycle lengths by normalizing across weeks.
        """
        if not self.days:
            return

        # Calculate simulation parameters
        weeks_to_sim = int(np.lcm(self.cycle_length, 7) / 7)
        total_days = weeks_to_sim * 7
        num_cycles = int(total_days / self.cycle_length)

        # Track weekly results
        weekly_results = {muscle_name: [] for muscle_name in self.muscles.keys()}

        # Global consecutive day tracker (persists across all weeks)
        consecutive_tracker = ConsecutiveDayTracker()

        # Simulate each week
        for week in range(weeks_to_sim):
            week_start_hour = week * 168

            # Reset muscles
            for muscle in self.muscles.values():
                muscle.reset_week()
                muscle.atrophy = 0

            # Create sessions for this week
            week_sessions = []
            for cycle in range(num_cycles):
                cycle_offset_hours = cycle * self.cycle_length * 24
                for session in self.days:
                    adjusted_time = session.time + cycle_offset_hours
                    if week_start_hour <= adjusted_time < week_start_hour + 168:
                        week_sessions.append((adjusted_time - week_start_hour, session))

            week_sessions.sort(key=lambda x: x[0])

            # Execute sessions with consecutive day tracking
            fatigue_state = GlobalFatigueState()

            for week_relative_time, session in week_sessions:
                # Calculate absolute day number (1-indexed) for consecutive day tracking
                absolute_day_number = int((week_start_hour + week_relative_time) / 24) + 1

                # Apply atrophy before session
                for muscle in self.muscles.values():
                    if muscle.last_trained_time is not None:
                        hours_since = week_relative_time - muscle.last_trained_time
                        muscle.apply_atrophy(hours_since, self.stimulus_duration,
                                            self.maintenance_volume, self.dataset)

                # Calculate consecutive day penalty BEFORE executing the session
                # First, determine if this is a consecutive day and get base penalty
                if consecutive_tracker.last_training_day is not None:
                    days_since_last = absolute_day_number - consecutive_tracker.last_training_day
                    if days_since_last == 1:
                        consecutive_tracker.consecutive_days += 1
                    elif days_since_last > 1:
                        consecutive_tracker.consecutive_days = 1
                        consecutive_tracker.cumulative_axial_fatigue = 0.0
                        consecutive_tracker.cumulative_bilateral_sets = 0
                else:
                    consecutive_tracker.consecutive_days = 1

                # Get penalty based on accumulated fatigue from previous consecutive days
                consecutive_penalty = calculate_consecutive_day_penalty(
                    consecutive_tracker.consecutive_days,
                    consecutive_tracker.cumulative_axial_fatigue,
                    consecutive_tracker.cumulative_bilateral_sets
                )

                # Execute session
                original_time = session.time
                session.time = week_relative_time

                fatigue_state.reset()
                stats = session.execute(
                    self.muscles, self.stimulus_duration, self.dataset, fatigue_state,
                    consecutive_day_penalty=consecutive_penalty,
                    collect_breakdowns=collect_breakdowns,
                )

                if stats:
                    stats['time'] = week_start_hour + week_relative_time
                    stats['week'] = week + 1
                    stats['consecutive_days'] = consecutive_tracker.consecutive_days
                    self.session_stats.append(stats)

                    # Update consecutive day tracker with THIS session's fatigue
                    consecutive_tracker.cumulative_axial_fatigue += stats.get('axial_fatigue', 0.0)
                    consecutive_tracker.cumulative_bilateral_sets += stats.get('bilateral_compound_sets', 0)
                    consecutive_tracker.last_training_day = absolute_day_number

                session.time = original_time

            # End of week atrophy
            for muscle_name, muscle in self.muscles.items():
                if muscle.last_trained_time is not None:
                    hours_until_end = 168 - muscle.last_trained_time
                    muscle.apply_atrophy(hours_until_end, self.stimulus_duration,
                                        self.maintenance_volume, self.dataset)

                weekly_results[muscle_name].append({
                    'week': week + 1,
                    'stimulus': muscle.stimulus,
                    'atrophy': muscle.atrophy,
                    'net': muscle.net_weekly_stimulus(),
                    'primary_sets': muscle.primary_sets,
                    'sessions': len(muscle.session_times)
                })

        # Average weekly values
        for muscle_name, muscle in self.muscles.items():
            weekly_data = weekly_results[muscle_name]
            if weekly_data:
                muscle.stimulus = sum(w['stimulus'] for w in weekly_data) / len(weekly_data)
                muscle.atrophy = sum(w['atrophy'] for w in weekly_data) / len(weekly_data)
                muscle.primary_sets = int(sum(w['primary_sets'] for w in weekly_data) / len(weekly_data))
                # Store average weekly frequency properly
                muscle.weekly_frequency = sum(w['sessions'] for w in weekly_data) / len(weekly_data)

    def get_report(self) -> str:
        """Generate detailed analysis report."""
        report = []
        report.append("=" * 80)
        report.append(f"SPLIT ANALYSIS REPORT: {self.name}")
        report.append("=" * 80)
        report.append(f"Cycle Length: {self.cycle_length} days")
        report.append(f"Stimulus Duration: {self.stimulus_duration} hours")
        report.append(f"Maintenance Volume: {self.maintenance_volume} sets")
        report.append(f"Dataset: {self.dataset}")
        report.append("")

        report.append("-" * 80)
        report.append("MUSCLE STIMULUS BREAKDOWN (Weekly Averages)")
        report.append("-" * 80)

        report.append(f"{'Region':<22} {'Group':<12} {'Stim':<8} {'Atrophy':<8} {'Net':<8} {'Sets':<6} {'Freq':<5}")
        report.append("-" * 80)

        # Collect and sort muscle data
        muscle_data = []
        for muscle_name, muscle in self.muscles.items():
            data = {
                'name': muscle_name,
                'muscle': muscle,
                'net': muscle.net_weekly_stimulus(),
                'stimulus': muscle.stimulus,
                'atrophy': muscle.atrophy,
                'sets': muscle.primary_sets,
                'freq': len(muscle.session_times) if muscle.session_times else 0,
                'display_name': muscle.display_name,
                'parent_group': muscle.parent_group
            }
            muscle_data.append(data)

        muscle_data.sort(key=lambda x: x['net'], reverse=True)

        for data in muscle_data:
            display = data.get('display_name', data['name'])
            group = data.get('parent_group', '')
            report.append(
                f"{display:<22} {group:<12} "
                f"{data['stimulus']:>6.2f}  {data['atrophy']:>6.2f}  "
                f"{data['net']:>6.2f}  {data['sets']:>4}  {data['freq']:>3}x"
            )

        report.append("")
        report.append("-" * 80)
        report.append("SUMMARY STATISTICS")
        report.append("-" * 80)

        total_sets = sum(data['sets'] for data in muscle_data)
        trained_muscles = sum(1 for data in muscle_data if data['sets'] > 0)
        avg_net = sum(data['net'] for data in muscle_data if data['sets'] > 0) / max(trained_muscles, 1)

        report.append(f"Total weekly sets: {total_sets}")
        report.append(f"Muscles trained: {trained_muscles}/{len(self.muscles)}")
        report.append(f"Average net stimulus: {avg_net:.2f}")

        # Group by parent
        by_group = defaultdict(list)
        for data in muscle_data:
            group = data.get('parent_group', 'other')
            by_group[group].append(data)

        report.append("")
        report.append("BY MUSCLE GROUP:")
        for group, items in sorted(by_group.items()):
            group_net = sum(d['net'] for d in items)
            group_sets = sum(d['sets'] for d in items)
            report.append(f"  {group}: {group_net:.2f} net, {group_sets} sets")

        report.append("")
        return "\n".join(report)

    def get_muscle_stats(self) -> List[Dict[str, Any]]:
        """Get list of muscle statistics for API responses."""
        stats = []
        for muscle_name, muscle in self.muscles.items():
            stats.append(muscle.get_stats())

        # Sort by net stimulus descending
        stats.sort(key=lambda x: x.get('net', 0), reverse=True)
        return stats
