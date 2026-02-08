"""
Global Fatigue Modifier System

Implements systemic fatigue factors that affect workout capacity and stimulus:

1. Axial/Spinal Fatigue - Accumulated from deadlifts, squats, rows
   - Increases overall CNS fatigue across the session
   - Accumulated across a session based on movement axial load

2. Bilateral Penalty - Bilateral movements reduce motor unit recruitment
   - Due to bilateral deficit phenomenon
   - Unilateral movements get a boost instead

3. Session Capacity - Total systemic fatigue affecting subsequent sets
   - Combines CNS fatigue curve with compound movement accumulation

4. Consecutive Day Fatigue - Systemic recovery debt from training multiple days in a row
   - Training without rest days accumulates fatigue that reduces MUR capacity
   - Compounded by axial fatigue and bilateral compound volume
   - Mimics the reality that high-frequency programs without rest need lighter days
"""

from dataclasses import dataclass, field
from typing import Dict, Optional
import math


@dataclass
class GlobalFatigueState:
    """
    Tracks global fatigue accumulation across a session.

    This state object should be created at session start and updated
    as exercises are performed.
    """

    # Axial fatigue accumulator (0 to MAX_AXIAL_FATIGUE scale)
    axial_fatigue: float = 0.0

    # Total number of sets performed in session
    total_sets: int = 0

    # Number of bilateral compound movements performed
    bilateral_compounds: int = 0

    # Number of heavy axial-loading movements performed
    axial_movements: int = 0

    # Bilateral compound SETS (not just movements)
    bilateral_compound_sets: int = 0

    def reset(self) -> None:
        """Reset state for new session."""
        self.axial_fatigue = 0.0
        self.total_sets = 0
        self.bilateral_compounds = 0
        self.axial_movements = 0
        self.bilateral_compound_sets = 0

    def add_axial_fatigue(self, amount: float) -> None:
        """Add to accumulated axial fatigue."""
        self.axial_fatigue += amount

    def add_bilateral_compound(self, num_sets: int = 1) -> None:
        """Record a bilateral compound movement and its sets."""
        self.bilateral_compounds += 1
        self.bilateral_compound_sets += num_sets

    def add_sets(self, num_sets: int) -> None:
        """Add to total set count."""
        self.total_sets += num_sets


@dataclass
class ConsecutiveDayTracker:
    """
    Tracks fatigue accumulation across consecutive training days.

    This tracker should persist across sessions within a simulation
    to calculate the cumulative fatigue from training without rest.
    """

    # Number of consecutive training days (resets on rest day)
    consecutive_days: int = 0

    # Cumulative axial fatigue from previous consecutive sessions
    cumulative_axial_fatigue: float = 0.0

    # Cumulative bilateral compound sets from previous consecutive sessions
    cumulative_bilateral_sets: int = 0

    # Day number of last training session (to detect consecutive days)
    last_training_day: Optional[int] = None

    def record_session(
        self,
        day_number: int,
        session_axial_fatigue: float,
        session_bilateral_sets: int
    ) -> float:
        """
        Record a training session and return the consecutive day penalty.

        Call this BEFORE processing a session to get the penalty,
        then call again AFTER to update the tracker.

        Args:
            day_number: The day number (1-indexed) of this session
            session_axial_fatigue: Axial fatigue from THIS session (for post-update)
            session_bilateral_sets: Bilateral compound sets from THIS session

        Returns:
            Consecutive day multiplier for this session (0.25 to 1.0)
        """
        # Check if this is a consecutive day
        if self.last_training_day is not None:
            days_since_last = day_number - self.last_training_day
            if days_since_last == 1:
                # Consecutive day - accumulate
                self.consecutive_days += 1
            elif days_since_last > 1:
                # Had rest - reset
                self.consecutive_days = 1
                self.cumulative_axial_fatigue = 0.0
                self.cumulative_bilateral_sets = 0
            # days_since_last == 0 shouldn't happen (same day)
        else:
            # First session
            self.consecutive_days = 1

        # Calculate penalty BEFORE adding this session's fatigue
        penalty = calculate_consecutive_day_penalty(
            self.consecutive_days,
            self.cumulative_axial_fatigue,
            self.cumulative_bilateral_sets
        )

        # Update tracker with this session's contribution (for next session)
        self.cumulative_axial_fatigue += session_axial_fatigue
        self.cumulative_bilateral_sets += session_bilateral_sets
        self.last_training_day = day_number

        return penalty

    def reset(self) -> None:
        """Reset for new simulation."""
        self.consecutive_days = 0
        self.cumulative_axial_fatigue = 0.0
        self.cumulative_bilateral_sets = 0
        self.last_training_day = None

    def get_current_penalty(self) -> float:
        """Get penalty for current state without modifying tracker."""
        return calculate_consecutive_day_penalty(
            self.consecutive_days,
            self.cumulative_axial_fatigue,
            self.cumulative_bilateral_sets
        )


# ============================================================================
# AXIAL FATIGUE CONFIGURATION
# ============================================================================

# Axial load contribution from movement patterns (0.0 to 1.0 scale)
# Higher values = more spinal loading and fatigue
AXIAL_LOAD_VALUES: Dict[str, float] = {
    # Maximum axial load
    "hinge": 1.0,               # Deadlifts - maximum spinal compression
    "hinge_compound": 1.0,
    "conventional_deadlift": 1.0,

    # High axial load
    "squat": 0.8,               # Back squats - high spinal compression
    "squat_compound": 0.8,
    "front_squat": 0.7,         # Front squats - slightly less
    "good_morning": 0.9,        # Good mornings - significant spinal load

    # Moderate axial load
    "transverse_row": 0.4,      # Barbell rows - moderate stabilization
    "scapular_retraction_compound": 0.4,
    "spinal_extension": 0.5,    # Back extensions
    "vertical_press": 0.3,      # Overhead pressing - some axial compression
    "vertical_press_compound": 0.3,
    "lunge": 0.3,               # Lunges - reduced by unilateral nature
    "lunge_compound": 0.3,
    "sagittal_adduction_compound": 0.2,

    # Low axial load
    "hip_extension": 0.2,       # Hip thrusts - minimal spinal load
    "hip_extension_isolation": 0.1,
    "horizontal_press": 0.1,    # Bench variations - mostly stable
    "humeral_adduction_compound": 0.1,

    # Default for unlisted patterns
    "default": 0.0
}

# Maximum axial fatigue before severe penalty
# Represents approximately 3-4 heavy compound movements worth of fatigue
MAX_AXIAL_FATIGUE: float = 3.0

# Floor for axial fatigue penalty (minimum multiplier)
AXIAL_FATIGUE_FLOOR: float = 0.7

# How much axial fatigue translates to CNS set-equivalents
# (e.g., 1.0 axial fatigue ~= 2.5 extra sets of CNS fatigue)
AXIAL_FATIGUE_CNS_EQUIV_SETS: float = 2.5


# ============================================================================
# BILATERAL/UNILATERAL CONFIGURATION
# ============================================================================

# Bilateral is the baseline (neutral) - no penalty
# Unilateral provides access to additional motor units that can't be recruited bilaterally
UNILATERAL_BONUS: float = 0.05  # 5% increase for unilateral movements


# ============================================================================
# SESSION CAPACITY CONFIGURATION
# ============================================================================

# Penalty per bilateral compound for session capacity
BILATERAL_COMPOUND_PENALTY: float = 0.02  # 2% per bilateral compound

# Maximum penalty from bilateral compound accumulation
MAX_BILATERAL_PENALTY: float = 0.15  # Cap at 15%

# CNS fatigue curve parameters (exponential decay)
CNS_FLOOR: float = 0.85      # Minimum CNS multiplier (at high set counts)
CNS_CEILING: float = 1.0     # Maximum CNS multiplier (fresh)
CNS_DECAY_RATE: float = 0.06 # Rate of decay per set


# ============================================================================
# CONSECUTIVE DAY FATIGUE CONFIGURATION
# ============================================================================
# Training multiple days in a row without rest accumulates systemic fatigue
# that cannot be fully recovered between sessions. This affects motor unit
# recruitment capacity (MUR) for the entire session.

# Base penalty per consecutive training day (after the first)
# Day 2: ~8%, Day 3: ~15%, Day 4: ~21%, etc. (with some diminishing)
CONSECUTIVE_DAY_BASE_RATE: float = 0.08

# Maximum base penalty from consecutive days alone (before modifiers)
CONSECUTIVE_DAY_BASE_CAP: float = 0.40

# How much cumulative axial fatigue worsens the penalty
# 1.0 cumulative axial fatigue adds ~12% to the penalty (this is the kicker)
CONSECUTIVE_AXIAL_MULTIPLIER: float = 0.12

# Maximum additional penalty from axial fatigue
CONSECUTIVE_AXIAL_CAP: float = 0.30

# How much cumulative bilateral compound sets worsen the penalty
# Each bilateral compound set from previous days adds 0.5% penalty
CONSECUTIVE_BILATERAL_RATE: float = 0.005

# Maximum additional penalty from bilateral compounds
CONSECUTIVE_BILATERAL_CAP: float = 0.15

# Absolute floor for consecutive day multiplier (max 75% penalty)
CONSECUTIVE_DAY_FLOOR: float = 0.25


# ============================================================================
# FUNCTIONS
# ============================================================================

def get_axial_load(pattern_name: str) -> float:
    """
    Get the axial load value for a movement pattern.

    Args:
        pattern_name: The movement pattern (e.g., 'squat', 'hinge')

    Returns:
        Axial load value between 0.0 and 1.0
    """
    # Normalize pattern name
    normalized = pattern_name.lower().strip().replace("-", "_").replace(" ", "_")

    # Check for exact match
    if normalized in AXIAL_LOAD_VALUES:
        return AXIAL_LOAD_VALUES[normalized]

    # Check for partial matches
    for pattern, load in AXIAL_LOAD_VALUES.items():
        if pattern in normalized or normalized in pattern:
            return load

    return AXIAL_LOAD_VALUES["default"]


def calculate_axial_contribution(pattern_name: str, num_sets: int) -> float:
    """
    Calculate how much axial fatigue a movement contributes.

    Args:
        pattern_name: The movement pattern
        num_sets: Number of sets performed

    Returns:
        Axial fatigue contribution (cumulative value to add to state)
    """
    load = get_axial_load(pattern_name)

    # Scale factor: each set contributes proportionally to axial load
    # A full deadlift set (load=1.0) contributes 0.15 fatigue
    scale_factor = 0.15

    return load * num_sets * scale_factor


def get_axial_penalty(current_axial_fatigue: float) -> float:
    """
    Legacy axial penalty (no longer applied to motor unit recruitment).

    Kept for reference/tuning experiments. Prefer using axial fatigue
    to increase CNS fatigue via calculate_cns_fatigue.
    """
    if current_axial_fatigue <= 0:
        return 1.0

    # Exponential decay toward floor
    # At MAX_AXIAL_FATIGUE, penalty is approximately at floor
    fatigue_ratio = min(current_axial_fatigue / MAX_AXIAL_FATIGUE, 1.0)

    # Smooth exponential decay
    penalty = AXIAL_FATIGUE_FLOOR + (1.0 - AXIAL_FATIGUE_FLOOR) * math.exp(-2.0 * fatigue_ratio)

    return max(AXIAL_FATIGUE_FLOOR, min(1.0, penalty))


def get_bilateral_modifier(is_bilateral: bool, is_unilateral: bool) -> float:
    """
    Calculate motor unit recruitment modifier based on bilateral/unilateral.

    Bilateral is the baseline (neutral). Unilateral movements provide access
    to motor units that cannot be recruited in bilateral movements, giving
    a pure bonus.

    Args:
        is_bilateral: True if movement is explicitly bilateral
        is_unilateral: True if movement is explicitly unilateral

    Returns:
        Modifier value:
        - 1.05 for unilateral (5% boost - access to additional motor units)
        - 1.0 for bilateral or neutral (baseline)
    """
    if is_unilateral:
        return 1.0 + UNILATERAL_BONUS
    # Bilateral and neutral both return 1.0 (baseline)
    return 1.0


def calculate_cns_fatigue(global_set_number: int, axial_fatigue: float = 0.0) -> float:
    """
    Calculate CNS fatigue multiplier based on total sets in session.

    Uses exponential decay formula:
    g(x) = floor + (ceiling - floor) * exp(-rate * x)

    Args:
        global_set_number: Total sets performed so far in session
        axial_fatigue: Accumulated axial fatigue (set-equivalents applied)

    Returns:
        CNS multiplier between CNS_FLOOR (0.85) and CNS_CEILING (1.0)
    """
    effective_sets = global_set_number + (axial_fatigue * AXIAL_FATIGUE_CNS_EQUIV_SETS)
    decay = math.exp(-CNS_DECAY_RATE * effective_sets)
    return CNS_FLOOR + (CNS_CEILING - CNS_FLOOR) * decay


def calculate_bilateral_compound_penalty(bilateral_compounds: int) -> float:
    """
    Calculate penalty from accumulated bilateral compound movements.

    Each bilateral compound adds 2% penalty, capped at 15%.

    Args:
        bilateral_compounds: Number of bilateral compound movements performed

    Returns:
        Multiplier between (1 - MAX_BILATERAL_PENALTY) and 1.0
    """
    penalty = bilateral_compounds * BILATERAL_COMPOUND_PENALTY
    penalty = min(penalty, MAX_BILATERAL_PENALTY)
    return 1.0 - penalty


def calculate_session_capacity_modifier(
    global_set_number: int,
    bilateral_compounds: int,
    axial_fatigue: float = 0.0
) -> float:
    """
    Calculate overall session fatigue modifier.

    Combines:
    - CNS fatigue curve (total sets performed)
    - Bilateral compound accumulation penalty

    Args:
        global_set_number: Total sets performed so far in session
        bilateral_compounds: Number of bilateral compound movements
        axial_fatigue: Accumulated axial fatigue (set-equivalents applied)

    Returns:
        Combined multiplier between ~0.72 and 1.0
    """
    cns_modifier = calculate_cns_fatigue(global_set_number, axial_fatigue=axial_fatigue)
    bilateral_modifier = calculate_bilateral_compound_penalty(bilateral_compounds)

    return cns_modifier * bilateral_modifier


def is_bilateral_compound(pattern_name: str, is_unilateral: bool) -> bool:
    """
    Determine if a movement pattern is a bilateral compound.

    Args:
        pattern_name: Movement pattern name
        is_unilateral: Whether movement is explicitly unilateral

    Returns:
        True if movement is a bilateral compound exercise
    """
    if is_unilateral:
        return False

    compound_patterns = {
        "squat", "squat_compound",
        "hinge", "hinge_compound",
        "deadlift",
        "press", "vertical_press_compound",
        "humeral_adduction_compound",
        "row", "scapular_retraction_compound",
        "pull", "sagittal_adduction_compound",
        "lunge", "lunge_compound",
        "good_morning", "front_squat"
    }

    normalized = pattern_name.lower().strip()
    return any(p in normalized for p in compound_patterns)


def update_fatigue_state(
    state: GlobalFatigueState,
    pattern_name: str,
    num_sets: int,
    is_unilateral: bool
) -> None:
    """
    Update the global fatigue state after performing an exercise.

    Args:
        state: The GlobalFatigueState to update (modified in place)
        pattern_name: Movement pattern name
        num_sets: Number of sets performed
        is_unilateral: Whether movement is unilateral
    """
    # Add axial fatigue
    axial_contribution = calculate_axial_contribution(pattern_name, num_sets)
    if axial_contribution > 0:
        state.add_axial_fatigue(axial_contribution)
        state.axial_movements += 1

    # Track bilateral compounds
    if is_bilateral_compound(pattern_name, is_unilateral):
        state.add_bilateral_compound(num_sets)

    # Add to total sets
    state.add_sets(num_sets)


def calculate_consecutive_day_penalty(
    consecutive_days: int,
    cumulative_axial_fatigue: float,
    cumulative_bilateral_sets: int
) -> float:
    """
    Calculate motor unit recruitment penalty from training consecutive days.

    Training multiple days in a row without rest accumulates systemic fatigue
    that reduces the body's ability to recruit motor units effectively.
    Heavy axial loading (squats, deadlifts) and high bilateral compound volume
    compound this effect.

    Examples:
    - Day 2 after a light day: ~12% penalty
    - Day 3 after heavy squats+deads: ~35% penalty
    - Day 7 with heavy compounds all week: up to 75% penalty

    Args:
        consecutive_days: Number of consecutive training days (1 = first day, no penalty)
        cumulative_axial_fatigue: Total axial fatigue from previous consecutive sessions
        cumulative_bilateral_sets: Total bilateral compound sets from previous sessions

    Returns:
        Multiplier for motor unit recruitment (0.25 to 1.0)
    """
    if consecutive_days <= 1:
        return 1.0  # First training day or had rest - no penalty

    # Base penalty from consecutive days
    # Uses diminishing curve: day 2 = 8%, day 3 = 15%, day 4 = 21%, etc.
    days_factor = consecutive_days - 1
    base_penalty = CONSECUTIVE_DAY_BASE_RATE * days_factor * (1.0 - 0.06 * days_factor)
    base_penalty = min(base_penalty, CONSECUTIVE_DAY_BASE_CAP)

    # Axial fatigue modifier: heavy compounds from previous days compound fatigue
    # ~1.5 cumulative axial (one heavy squat+deadlift session) adds ~18%
    axial_penalty = min(
        cumulative_axial_fatigue * CONSECUTIVE_AXIAL_MULTIPLIER,
        CONSECUTIVE_AXIAL_CAP
    )

    # Bilateral compound volume modifier
    # 20 bilateral compound sets adds ~10%
    bilateral_penalty = min(
        cumulative_bilateral_sets * CONSECUTIVE_BILATERAL_RATE,
        CONSECUTIVE_BILATERAL_CAP
    )

    # Combined penalty
    total_penalty = base_penalty + axial_penalty + bilateral_penalty

    # Return multiplier (floor at 0.25 = 75% max penalty)
    return max(CONSECUTIVE_DAY_FLOOR, 1.0 - total_penalty)
