"""
Granular Movement Patterns

Joint-action driven patterns with compound/isolation distinctions.
These are intended to be a compact, canonical set that most exercises map to.
Unilateral/bilateral is inferred from the exercise name, not stored here.
"""

from typing import Dict, Any


# Type alias for pattern definition
PatternDef = Dict[str, Any]


GRANULAR_PATTERNS: Dict[str, PatternDef] = {
    # =========================================================================
    # CHEST - HUMERAL ADDUCTION
    # =========================================================================
    "humeral_adduction_compound": {
        "prime": {
            "sternocostal": 0.70,
        },
        "secondary": {
            "clavicular": 0.15,
            "anterior_deltoid": 0.10,
        },
        "tertiary": {
            "triceps_lateral_medial": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Compound horizontal presses (bench, machine press)"
    },
    "clavicular_humeral_adduction_compound": {
        "prime": {
            "clavicular": 0.55,
        },
        "secondary": {
            "sternocostal": 0.20,
            "anterior_deltoid": 0.20,
        },
        "tertiary": {
            "triceps_lateral_medial": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Incline Compound horizontal presses (bench, machine press)"
    },
    "humeral_adduction_isolation": {
        "prime": {
            "sternocostal": 0.80,
        },
        "secondary": {
            "clavicular": 0.10,
            "anterior_deltoid": 0.10,  # Grouped with clavicular for leverage redistribution
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "resistance_profile": "descending",
        "notes": "Isolation flyes/crossovers - descending (stretch-focused) by default"
    },
    "clavicular_humeral_adduction_isolation": {
        "prime": {
            "clavicular": 0.70,
        },
        "secondary": {
            "anterior_deltoid": 0.20,
            "sternocostal": 0.10,
        },
        "tertiary": {

        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Isolation flyes/crossovers"
    },


    # =========================================================================
    # SHOULDERS
    # =========================================================================
    "pronated_vertical_press_compound": {
        "prime": {
            "anterior_deltoid": 0.45,
            "lateral_deltoid": 0.35,
        },
        "secondary": {
            "clavicular": 0.10,
            "triceps_lateral_medial": 0.10
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.3,
        "notes": "Overhead press variations"
    },
    "neutral_vertical_press_compound": {
        "prime": {
            "anterior_deltoid": 0.65,
            "clavicular": 0.25,
        },
        "secondary": {
            "lateral_deltoid": 0.05,
            "triceps_lateral_medial": 0.05
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.3,
        "notes": "Overhead press variations"
    },
    "shoulder_flexion_isolation": {
        "prime": {
            "anterior_deltoid": 0.90,
        },
        "secondary": {
            "clavicular": 0.10,
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Front raises"
    },
    "shoulder_abduction_isolation": {
        "prime": {
            "lateral_deltoid": 0.85,
        },
        "secondary": {
            "anterior_deltoid": 0.05,
            "posterior_deltoid": 0.05,
            "trapezius": 0.05,
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Lateral raises"
    },
    "shoulder_transverse_abduction_isolation": {
        "prime": {
            "posterior_deltoid": 0.80,
        },
        "secondary": {
            "trapezius": 0.10,
        },
        "tertiary": {
            "rhomboids": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Rear delt fly, reverse pec deck"
    },

    # =========================================================================
    # BACK - PULLING
    # =========================================================================
    "transverse_adduction_compound": {
        "prime": {
            "iliac_lats": 0.70,
        },
        "secondary": {
            "trapezius": 0.05,
            "rhomboids": 0.05,
            "posterior_deltoid": 0.15,
        },
        "tertiary": {
            "biceps_brachii": 0.05,
            "brachialis": 0.03,
            "brachioradialis": 0.02,
        },
        "quaternary": {},
        "axial_load": 0.2,
        "notes": "Wide grip Lat-focused pulls (pulldowns, pull-ups, lat rows)"
    },
    "transverse_adduction_isolation": {
        "prime": {
            "iliac_lats": 0.80,
        },
        "secondary": {
            "posterior_deltoid": 0.10,
        },
        "tertiary": {
            "triceps_long_head": 0.05,
            "sternocostal": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Side of body lat focused pulls (Pullovers, straight-arm pulldowns)"
    },
    "sagittal_adduction_compound": {
        "prime": {
            "thoracic_lats": 0.70,
        },
        "secondary": {
            "trapezius": 0.05,
            "rhomboids": 0.05,
            "posterior_deltoid": 0.15,
        },
        "tertiary": {
            "biceps_brachii": 0.05,
            "brachialis": 0.03,
            "brachioradialis": 0.02,
        },
        "quaternary": {},
        "axial_load": 0.2,
        "notes": "Lat-focused pulls (pulldowns, pull-ups, lat rows)"
    },
    "sagittal_adduction_isolation": {
        "prime": {
            "thoracic_lats": 0.80,
        },
        "secondary": {
            "posterior_deltoid": 0.10,
        },
        "tertiary": {
            "triceps_long_head": 0.05,
            "sternocostal": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Pullovers, straight-arm pulldowns"
    },
    "scapular_retraction_compound": {
        "prime": {
            "trapezius": 0.50,
            "rhomboids": 0.20,
        },
        "secondary": {
            "thoracic_lats": 0.05,
            "posterior_deltoid": 0.10,
        },
        "tertiary": {
            "biceps_brachii": 0.05,
            "brachialis": 0.03,
            "brachioradialis": 0.02,
        },
        "quaternary": {},
        "axial_load": 0.4,
        "notes": "Rows (cable, chest-supported, barbell)"
    },
    "scapular_retraction_isolation": {
        "prime": {
            "trapezius": 0.60,
            "rhomboids": 0.30,
        },
        "secondary": {
            "posterior_deltoid": 0.10,
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.1,
        "notes": "Shrugs, face pulls, scapular squeezes"
    },
    

    # =========================================================================
    # LOWER BODY - COMPOUNDS
    # =========================================================================
    "squat_compound": {
        "prime": {
            "vasti": 0.35,
            "rectus_femoris": 0.15,
            "glute_max": 0.25,
        },
        "secondary": {
            "hip_adductors": 0.10,
            "hip_extensors": 0.05,
        },
        "tertiary": {
            "spinal_erectors": 0.05,
            "deep_core": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.8,
        "notes": "Squats, leg press, hack squat"
    },
    "hinge_compound": {
        "prime": {
            "hip_extensors": 0.35,
            "glute_max": 0.25,
            "spinal_erectors": 0.20,
        },
        "secondary": {
            "thoracic_lats": 0.05,
            "iliac_lats": 0.05,
            "trapezius": 0.05,
        },
        "tertiary": {
            "deep_core": 0.05,
        },
        "quaternary": {},
        "axial_load": 1.0,
        "notes": "Deadlifts, RDLs, good mornings"
    },
    "lunge_compound": {
        "prime": {
            "vasti": 0.30,
            "rectus_femoris": 0.15,
            "glute_max": 0.25,
        },
        "secondary": {
            "hip_extensors": 0.15,
            "glute_med_min": 0.05,
        },
        "tertiary": {
            "hip_adductors": 0.05,
            "deep_core": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.3,
        "notes": "Lunges, split squats, step ups"
    },

    # =========================================================================
    # LOWER BODY - ISOLATION
    # =========================================================================
    "knee_extension_isolation": {
        "prime": {
            "vasti": 0.20,
            "rectus_femoris": 0.80,
        },
        "secondary": {},
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Leg extensions"
    },
    "knee_flexion_isolation": {
        "prime": {
            "knee_flexors": 0.65,
            "hip_extensors": 0.20,
        },
        "secondary": {
            "gastrocnemius": 0.15,
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Leg curl variations"
    },
    "hip_extension_isolation": {
        "prime": {
            "glute_max": 0.80,
        },
        "secondary": {
            "hip_extensors": 0.15,
        },
        "tertiary": {
            "spinal_erectors": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.1,
        "notes": "Hip thrusts, glute bridges, kickbacks"
    },
    "hip_abduction_isolation": {
        "prime": {
            "glute_med_min": 0.85,
        },
        "secondary": {
            "glute_max": 0.10,
        },
        "tertiary": {
            "hip_adductors": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Hip abduction machine, side lying abductions"
    },
    "hip_adduction_isolation": {
        "prime": {
            "hip_adductors": 0.90,
        },
        "secondary": {
            "glute_max": 0.05,
        },
        "tertiary": {
            "hip_extensors": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Hip adduction machine, Copenhagen planks"
    },
    "ankle_plantarflexion_isolation": {
        "prime": {
            "gastrocnemius": 0.55,
            "soleus": 0.45,
        },
        "secondary": {},
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.1,
        "notes": "Calf raises (standing/seated)"
    },

    # =========================================================================
    # ARMS / FOREARMS
    # =========================================================================
    "elbow_flexion_isolation": {
        "prime": {
            "biceps_brachii": 0.85,
            "brachialis": 0.10,
        },
        "secondary": {
            "brachioradialis": 0.05,
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Curls (supinated/neutral)"
    },
    "pronated_elbow_flexion_isolation": {
        "prime": {
            "brachioradialis": 0.55,
            "brachialis": 0.25,
            "biceps_brachii": 0.15,  # In same tier for leverage redistribution
        },
        "secondary": {
            "wrist_extensors": 0.05,
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Reverse curls (pronated grip) - all flexors in prime for leverage redistribution"
    },
    # =========================================================================
    # TRICEP-DOMINANT COMPOUNDS
    # =========================================================================
    "tricep_compound": {
        "prime": {
            "triceps_lateral_medial": 0.50,
        },
        "secondary": {
            "triceps_long_head": 0.15,
            "sternocostal": 0.20,
        },
        "tertiary": {
            "anterior_deltoid": 0.10,
            "clavicular": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Close grip bench press, weighted dips - tricep dominant compound pressing with chest involvement"
    },

    "elbow_extension_isolation": {
        "prime": {
            "triceps_long_head": 0.70,
            "triceps_lateral_medial": 0.30,
        },
        "secondary": {},
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Pushdowns, extensions, skull crushers"
    },
    "overhead_elbow_extension_isolation": {
        "prime": {
            "triceps_lateral_medial": 0.85,
        },
        "secondary": {"triceps_long_head": 0.15,},
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Pushdowns, extensions, skull crushers"
    },
    "wrist_flexion_isolation": {
        "prime": {
            "wrist_flexors": 0.90,
        },
        "secondary": {
            "brachioradialis": 0.10,
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Wrist curls"
    },
    "wrist_extension_isolation": {
        "prime": {
            "wrist_extensors": 0.90,
        },
        "secondary": {
            "brachioradialis": 0.10,
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Reverse wrist curls"
    },

    # =========================================================================
    # CORE
    # =========================================================================
    "spinal_flexion": {
        "prime": {
            "anterior_core": 0.75,
        },
        "secondary": {
            "lateral_core": 0.15,
        },
        "tertiary": {
            "rectus_femoris": 0.10,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Crunches, sit-ups, cable crunches"
    },
    "leg_raise": {
        "prime": {
            "anterior_core": 0.60,
            "rectus_femoris": 0.25,
        },
        "secondary": {
            "lateral_core": 0.10,
        },
        "tertiary": {
            "hip_adductors": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Hanging leg raises, lying leg raises"
    },
    "anti_extension": {
        "prime": {
            "anterior_core": 0.70,
            "deep_core": 0.20,
        },
        "secondary": {
            "lateral_core": 0.10,
        },
        "tertiary": {},
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Planks, ab wheel rollouts"
    },
    "spinal_extension": {
        "prime": {
            "spinal_erectors": 0.85,
        },
        "secondary": {
            "glute_max": 0.10,
        },
        "tertiary": {
            "hip_extensors": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.5,
        "notes": "Back extensions, reverse hypers"
    },
    "trunk_rotation": {
        "prime": {
            "lateral_core": 0.85,
        },
        "secondary": {
            "anterior_core": 0.10,
        },
        "tertiary": {
            "deep_core": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Russian twists, cable rotations, woodchops"
    },
    "anti_rotation": {
        "prime": {
            "lateral_core": 0.60,
            "deep_core": 0.25,
        },
        "secondary": {
            "anterior_core": 0.10,
        },
        "tertiary": {
            "glute_med_min": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Pallof press, single arm carries"
    },
    "lateral_flexion": {
        "prime": {
            "lateral_core": 0.85,
        },
        "secondary": {
            "spinal_erectors": 0.10,
        },
        "tertiary": {
            "deep_core": 0.05,
        },
        "quaternary": {},
        "axial_load": 0.0,
        "notes": "Side bends"
    },
}


def get_pattern(pattern_name: str) -> PatternDef:
    """
    Get a pattern definition by name.

    Args:
        pattern_name: Pattern name (case-insensitive, underscores/spaces normalized)

    Returns:
        Pattern definition dict

    Raises:
        KeyError: If pattern not found
    """
    normalized = pattern_name.lower().strip().replace(" ", "_").replace("-", "_")

    if normalized in GRANULAR_PATTERNS:
        return GRANULAR_PATTERNS[normalized]

    # Try partial match
    for key, pattern in GRANULAR_PATTERNS.items():
        if normalized in key or key in normalized:
            return pattern

    raise KeyError(f"Pattern not found: {pattern_name}")


def get_all_patterns() -> Dict[str, PatternDef]:
    """Return all pattern definitions."""
    return GRANULAR_PATTERNS.copy()


def get_pattern_muscle_targets(pattern_name: str) -> Dict[str, Dict[str, float]]:
    """
    Get muscle targets organized by tier for a pattern.

    Returns dict like:
    {
        "prime": {"sternocostal": 0.70},
        "secondary": {"clavicular": 0.15, ...},
        ...
    }
    """
    pattern = get_pattern(pattern_name)
    return {
        "prime": pattern.get("prime", {}),
        "secondary": pattern.get("secondary", {}),
        "tertiary": pattern.get("tertiary", {}),
        "quaternary": pattern.get("quaternary", {}),
    }


def get_flat_muscle_targets(pattern_name: str) -> Dict[str, float]:
    """
    Get flattened muscle targets (all tiers combined) for a pattern.
    Useful for backwards compatibility with old system.
    """
    targets = get_pattern_muscle_targets(pattern_name)
    flat = {}
    for tier_targets in targets.values():
        flat.update(tier_targets)
    return flat


def get_pattern_axial_load(pattern_name: str) -> float:
    """Get axial load value for a pattern."""
    try:
        pattern = get_pattern(pattern_name)
        return pattern.get("axial_load", 0.0)
    except KeyError:
        return 0.0


# Default resistance profiles by pattern type
# Used when not explicitly set in the pattern definition
DEFAULT_RESISTANCE_PROFILES = {
    # Descending (lengthened-biased) - flyes, rear delt, lateral raises
    "humeral_adduction_isolation": "descending",
    "shoulder_transverse_abduction_isolation": "descending",
    "shoulder_abduction_isolation": "descending",
    "shoulder_flexion_isolation": "descending",
}


def get_pattern_resistance_profile(pattern_name: str) -> str:
    """
    Get resistance profile for a pattern.

    Resistance profiles describe where the exercise is hardest:
      - 'ascending'  = hardest at top (shortened muscle position)
      - 'mid'        = hardest at mid-range (most free weight exercises)
      - 'descending' = hardest at bottom (lengthened muscle position)

    This affects motor unit recruitment based on leverage matching.
    """
    normalized = pattern_name.lower().strip().replace(" ", "_").replace("-", "_")

    try:
        pattern = get_pattern(pattern_name)
        # Check if explicitly set in pattern
        if "resistance_profile" in pattern:
            return pattern["resistance_profile"]
    except KeyError:
        pass

    # Check defaults
    if normalized in DEFAULT_RESISTANCE_PROFILES:
        return DEFAULT_RESISTANCE_PROFILES[normalized]

    # Default to mid-range (most free weight exercises)
    return "mid"


def is_pattern_bilateral(pattern_name: str) -> bool:
    """
    Check if a pattern is typically performed bilaterally.

    Note: Actual bilateral/unilateral status is inferred from the exercise name
    (e.g., "Single Arm" makes it unilateral). This function returns the default
    assumption for the pattern.

    Compound patterns default to bilateral (squats, presses, rows).
    Isolation patterns can go either way but default to bilateral.
    """
    normalized = pattern_name.lower().strip().replace(" ", "_").replace("-", "_")

    try:
        pattern = get_pattern(pattern_name)
        # Check if explicitly set in pattern
        if "bilateral" in pattern:
            return pattern["bilateral"]
    except KeyError:
        pass

    # Patterns that are inherently unilateral by convention
    unilateral_patterns = {
        'trunk_rotation',
        'anti_rotation',
        'lateral_flexion',
    }

    if normalized in unilateral_patterns:
        return False

    # Default: compound patterns and most isolation movements are bilateral
    return True

