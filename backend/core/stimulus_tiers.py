"""
Stimulus Tier System

Defines how muscles receive stimulus based on their role in a movement:
- Prime movers: Full marginal curve penalty (main target muscles)
- Secondary movers: Moderate penalty (significant contributors)
- Tertiary movers: Light penalty (minor contributors)
- Quaternary movers: Minimal penalty (stabilizers/negligible contribution)
"""

from enum import Enum
from typing import Dict


class StimulusTier(str, Enum):
    """Stimulus tier classification for muscle involvement in a movement."""
    PRIME = "prime"           # Full marginal curve penalty
    SECONDARY = "secondary"   # Moderate penalty
    TERTIARY = "tertiary"     # Light penalty
    QUATERNARY = "quaternary" # Minimal/negligible penalty


# Beta values for residual_local_multiplier by tier
# Higher beta = more aggressive diminishing returns
TIER_BETA_VALUES: Dict[str, float] = {
    StimulusTier.PRIME: 1.0,      # Full diminishing returns curve
    StimulusTier.SECONDARY: 0.55,  # 60% of full diminishing returns
    StimulusTier.TERTIARY: 0.35,  # 35% of full diminishing returns
    StimulusTier.QUATERNARY: 0.15 # 15% of full diminishing returns (nearly flat)
}

# Threshold for counting as a "primary" set (for volume tracking purposes)
# Only PRIME tier movements count toward primary set volume
TIER_PRIMARY_THRESHOLD: Dict[str, float] = {
    StimulusTier.PRIME: 0.5,      # Counts as primary set
    StimulusTier.SECONDARY: 0.0,  # Does not count as primary
    StimulusTier.TERTIARY: 0.0,   # Does not count as primary
    StimulusTier.QUATERNARY: 0.0  # Does not count as primary
}

# Minimum stimulus weight to apply for a tier (filters out noise)
TIER_MINIMUM_WEIGHT: Dict[str, float] = {
    StimulusTier.PRIME: 0.0,      # Always apply
    StimulusTier.SECONDARY: 0.05, # Must be at least 5%
    StimulusTier.TERTIARY: 0.02,  # Must be at least 2%
    StimulusTier.QUATERNARY: 0.01 # Must be at least 1%
}


def get_tier_beta(tier: str) -> float:
    """
    Get the beta value for a stimulus tier.

    Args:
        tier: One of 'prime', 'secondary', 'tertiary', 'quaternary'

    Returns:
        Beta value for diminishing returns calculation (0.0 to 1.0)
    """
    if tier in TIER_BETA_VALUES:
        return TIER_BETA_VALUES[tier]
    # Handle enum or string input
    tier_str = str(tier).lower()
    for t, beta in TIER_BETA_VALUES.items():
        if tier_str == t.value or tier_str == t:
            return beta
    return 0.5  # Default fallback


def get_tier_priority(tier: str) -> int:
    """
    Get priority ordering for a tier (lower = higher priority).
    Used for sorting and display purposes.

    Args:
        tier: Tier name or StimulusTier enum

    Returns:
        Priority integer (0=prime, 1=secondary, etc.)
    """
    priority_map = {
        StimulusTier.PRIME: 0,
        StimulusTier.SECONDARY: 1,
        StimulusTier.TERTIARY: 2,
        StimulusTier.QUATERNARY: 3,
        "prime": 0,
        "secondary": 1,
        "tertiary": 2,
        "quaternary": 3,
    }
    return priority_map.get(tier, 99)


def is_primary_contribution(tier: str, weight: float) -> bool:
    """
    Determine if a tier/weight combination should count as a primary set.

    Args:
        tier: Stimulus tier
        weight: Stimulus weight (0.0 to 1.0)

    Returns:
        True if this should count as a primary set for volume tracking
    """
    threshold = TIER_PRIMARY_THRESHOLD.get(tier, 0.5)
    return weight >= threshold


def should_apply_stimulus(tier: str, weight: float) -> bool:
    """
    Determine if stimulus should be applied based on tier minimum thresholds.

    Args:
        tier: Stimulus tier
        weight: Stimulus weight (0.0 to 1.0)

    Returns:
        True if stimulus should be applied
    """
    minimum = TIER_MINIMUM_WEIGHT.get(tier, 0.0)
    return weight >= minimum


def calculate_effective_stimulus(
    base_stimulus: float,
    tier: str,
    set_count: int,
    marginal_curve: list,
    beta_override: float = None
) -> float:
    """
    Calculate effective stimulus for a muscle based on tier and set count.

    Uses a softened marginal curve for non-prime tiers:
    effective_marginal = 1.0 - beta * (1.0 - marginal[set_count])

    Args:
        base_stimulus: Raw stimulus value (muscle weight)
        tier: Stimulus tier
        set_count: Number of sets already performed for this muscle
        marginal_curve: List of marginal returns by set number
        beta_override: Optional override for beta value

    Returns:
        Effective stimulus after applying tier-based diminishing returns
    """
    beta = beta_override if beta_override is not None else get_tier_beta(tier)

    # Get marginal value for current set count
    if set_count < len(marginal_curve):
        marginal = marginal_curve[set_count]
    else:
        # Beyond curve, use last value with additional decay
        marginal = marginal_curve[-1] * (0.97 ** (set_count - len(marginal_curve) + 1))

    # Apply tier-based softening
    # At beta=1.0 (prime): uses full marginal curve
    # At beta=0.0: no diminishing returns (marginal always = 1.0)
    effective_marginal = 1.0 - beta * (1.0 - marginal)

    return base_stimulus * effective_marginal


# Display names for UI
TIER_DISPLAY_NAMES = {
    StimulusTier.PRIME: "Prime Mover",
    StimulusTier.SECONDARY: "Secondary Mover",
    StimulusTier.TERTIARY: "Tertiary Mover",
    StimulusTier.QUATERNARY: "Stabilizer",
}
