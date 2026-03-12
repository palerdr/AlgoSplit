"""
Granular Muscle Region Definitions

Defines 35 anatomical muscle regions organized into parent groups.
Each region has properties for leverage, damage tier, recovery, and training characteristics.
"""

from typing import Dict, List, Any
from dataclasses import dataclass, field


@dataclass
class MuscleRegionData:
    """Data class for muscle region properties"""
    display_name: str
    parent_group: str
    leverage: str  # 'S' (short), 'M' (medium), 'L' (long)
    damage_tier: str  # '+' (high damage), '0' (neutral), '-' (low damage)
    recovery_modifier: float = 1.0  # Multiplier for recovery time
    axial_fatigue_contributor: bool = False  # Contributes to spinal fatigue
    primary_actions: List[str] = field(default_factory=list)
    notes: str = ""


# Complete muscle hierarchy with 35 anatomical regions
MUSCLE_HIERARCHY: Dict[str, Dict[str, MuscleRegionData]] = {
    # ===== CHEST =====
    "chest": {
        "clavicular": MuscleRegionData(
            display_name="Upper Chest",
            parent_group="chest",
            leverage="M",
            damage_tier="-",
            recovery_modifier=1.0,
            primary_actions=["horizontal_adduction", "shoulder_flexion"],
            notes="Clavicular head of pectoralis major, biased by incline pressing and low-to-high fly patterns"
        ),
        "sternocostal": MuscleRegionData(
            display_name="Mid-Lower Chest",
            parent_group="chest",
            leverage="M",
            damage_tier="-",
            recovery_modifier=1.0,
            primary_actions=["horizontal_adduction"],
            notes="Sternocostal head of pectoralis major, dominant in flat and decline press patterns"
        ),
    },

    # ===== SHOULDERS =====
    "shoulders": {
        "anterior_deltoid": MuscleRegionData(
            display_name="Front Delt",
            parent_group="shoulders",
            leverage="L",
            damage_tier="0",
            recovery_modifier=1.0,
            primary_actions=["shoulder_flexion", "horizontal_adduction"],
            notes="Synergist with clavicular chest in pressing movements"
        ),
        "lateral_deltoid": MuscleRegionData(
            display_name="Side Delt",
            parent_group="shoulders",
            leverage="M",
            damage_tier="0",
            recovery_modifier=1.0,
            primary_actions=["shoulder_abduction"],
            notes="Primary target of lateral raise patterns"
        ),
        "posterior_deltoid": MuscleRegionData(
            display_name="Rear Delt",
            parent_group="shoulders",
            leverage="L",
            damage_tier="0",
            recovery_modifier=1.0,
            primary_actions=["shoulder_extension", "horizontal_abduction"],
            notes="Synergist with upper back in pulling movements"
        ),
    },

    # ===== BACK =====
    "back": {
        "trapezius": MuscleRegionData(
            display_name="Traps",
            parent_group="upper_back",
            leverage="L",
            damage_tier="0",
            recovery_modifier=1.0,
            primary_actions=["scapular_elevation", "scapular_retraction"],
            notes="Upper, middle, and lower fibers - rows, face pulls, shrug patterns"
        ),
        "rhomboids": MuscleRegionData(
            display_name="Rhomboids",
            parent_group="upper_back",
            leverage="L",
            damage_tier="0",
            recovery_modifier=1.0,
            primary_actions=["scapular_retraction"],
            notes="Deep to trapezius, active in rowing movements"
        ),
        "spinal_erectors": MuscleRegionData(
            display_name="Lower Back",
            parent_group="lower_back",
            leverage="S",
            damage_tier="+",
            recovery_modifier=1.2,
            axial_fatigue_contributor=True,
            primary_actions=["spinal_extension", "isometric_stabilization"],
            notes="Major axial fatigue contributor, requires careful volume management"
        ),
    },

    # ===== LATS =====
    "lats": {
        "thoracic_lats": MuscleRegionData(
            display_name="Upper Lats",
            parent_group="lats",
            leverage="S",
            damage_tier="0",
            recovery_modifier=1.0,
            primary_actions=["shoulder_adduction", "shoulder_extension"],
            notes="More active in vertical pulling (pulldowns, pull-ups)"
        ),
        "iliac_lats": MuscleRegionData(
            display_name="Lower Lats",
            parent_group="lats",
            leverage="S",
            damage_tier="0",
            recovery_modifier=1.0,
            primary_actions=["shoulder_extension"],
            notes="More active in rows and pullovers"
        ),
    },

    # ===== ARMS - ELBOW FLEXORS =====
    "elbow_flexors": {
        "biceps_brachii": MuscleRegionData(
            display_name="Biceps",
            parent_group="elbow_flexors",
            leverage="L",  # Strongest in lengthened position (incline curls)
            damage_tier="-",
            recovery_modifier=0.9,
            primary_actions=["elbow_flexion", "forearm_supination"],
            notes="Two-joint muscle, best leverage in lengthened/stretched position"
        ),
        "brachialis": MuscleRegionData(
            display_name="Brachialis",
            parent_group="elbow_flexors",
            leverage="S",  # Strongest at shortened/contracted position (ascending curls)
            damage_tier="-",
            recovery_modifier=0.9,
            primary_actions=["elbow_flexion"],
            notes="Single-joint elbow flexor, best leverage at peak contraction (ascending resistance)"
        ),
        "brachioradialis": MuscleRegionData(
            display_name="Brachioradialis",
            parent_group="elbow_flexors",
            leverage="S",  # Strongest at shortened/contracted position (ascending curls)
            damage_tier="+",
            recovery_modifier=1.1,
            primary_actions=["elbow_flexion"],
            notes="Biased in neutral/pronated grips, best leverage at peak contraction"
        ),
    },

    # ===== ARMS - TRICEPS =====
    "triceps": {
        "triceps_long_head": MuscleRegionData(
            display_name="Triceps Long Head",
            parent_group="triceps",
            leverage="S",
            damage_tier="-",
            recovery_modifier=0.9,
            primary_actions=["elbow_extension", "shoulder_extension"],
            notes="Two-joint muscle, biased in overhead and shoulder-extended positions"
        ),
        "triceps_lateral_medial": MuscleRegionData(
            display_name="Triceps Lateral/Medial",
            parent_group="triceps",
            leverage="S",
            damage_tier="-",
            recovery_modifier=0.9,
            primary_actions=["elbow_extension"],
            notes="Functionally synergistic in most pressing and extension patterns"
        ),
    },

    # ===== ARMS - FOREARMS (Wrist muscles) =====
    "forearms": {
        "wrist_flexors": MuscleRegionData(
            display_name="Wrist Flexors",
            parent_group="forearms",
            leverage="L",
            damage_tier="+",
            recovery_modifier=1.1,
            primary_actions=["wrist_flexion", "grip"],
            notes="Wrist curls, grip work"
        ),
        "wrist_extensors": MuscleRegionData(
            display_name="Wrist Extensors",
            parent_group="forearms",
            leverage="L",
            damage_tier="+",
            recovery_modifier=1.1,
            primary_actions=["wrist_extension", "grip_stabilization"],
            notes="Reverse wrist curls, stabilization during gripping"
        ),
    },

    # ===== GLUTES =====
    "glutes": {
        "glute_max": MuscleRegionData(
            display_name="Gluteus Maximus",
            parent_group="glutes",
            leverage="S",
            damage_tier="0",
            recovery_modifier=1.0,
            primary_actions=["hip_extension", "hip_external_rotation"],
            notes="Squats, hinges, hip thrusts - largest muscle in body"
        ),
        "glute_med_min": MuscleRegionData(
            display_name="Gluteus Medius/Minimus",
            parent_group="glutes",
            leverage="S",
            damage_tier="0",
            recovery_modifier=1.0,
            primary_actions=["hip_abduction", "pelvic_stability"],
            notes="Single-leg and lateral patterns, hip stability"
        ),
    },

    # ===== QUADS =====
    "quads": {
        "vasti": MuscleRegionData(
            display_name="Vastus Group",
            parent_group="quads",
            leverage="L",
            damage_tier="+",
            recovery_modifier=1.15,
            primary_actions=["knee_extension"],
            notes="Vastus lateralis, medialis, intermedius - single-joint knee extensors"
        ),
        "rectus_femoris": MuscleRegionData(
            display_name="Rectus Femoris",
            parent_group="quads",
            leverage="L",
            damage_tier="+",
            recovery_modifier=1.15,
            primary_actions=["knee_extension", "hip_flexion"],
            notes="Two-joint muscle, meaningfully biased in leg extensions"
        ),
    },

    # ===== HAMSTRINGS =====
    "hamstrings": {
        "hip_extensors": MuscleRegionData(
            display_name="Hamstrings (Proximal)",
            parent_group="hamstrings",
            leverage="L",
            damage_tier="-",
            recovery_modifier=1.0,
            primary_actions=["hip_extension"],
            notes="Proximal hamstrings (biceps femoris long head, semimembranosus) - RDLs, good mornings"
        ),
        "knee_flexors": MuscleRegionData(
            display_name="Hamstrings (Distal)",
            parent_group="hamstrings",
            leverage="L",
            damage_tier="-",
            recovery_modifier=1.0,
            primary_actions=["knee_flexion"],
            notes="Distal hamstrings - leg curl patterns"
        ),
    },

    # ===== CALVES =====
    "calves": {
        "gastrocnemius": MuscleRegionData(
            display_name="Gastrocnemius",
            parent_group="calves",
            leverage="L",
            damage_tier="+",
            recovery_modifier=1.1,
            primary_actions=["ankle_plantarflexion", "knee_flexion"],
            notes="Two-joint muscle, stretched with knee extended (standing calf raises)"
        ),
        "soleus": MuscleRegionData(
            display_name="Soleus",
            parent_group="calves",
            leverage="L",
            damage_tier="+",
            recovery_modifier=1.1,
            primary_actions=["ankle_plantarflexion"],
            notes="Single-joint, active with knee flexed (seated calf raises)"
        ),
    },

    # ===== ADDUCTORS =====
    "adductors": {
        "hip_adductors": MuscleRegionData(
            display_name="Hip Adductors",
            parent_group="adductors",
            leverage="L",
            damage_tier="0",
            recovery_modifier=1.0,
            primary_actions=["hip_adduction", "pelvic_stability"],
            notes="Deep squats and lateral patterns, Copenhagen planks"
        ),
    },

    # ===== CORE =====
    "core": {
        "anterior_core": MuscleRegionData(
            display_name="Abs",
            parent_group="abs",
            leverage="L",
            damage_tier="+",
            recovery_modifier=1.1,
            primary_actions=["trunk_flexion", "anti_extension"],
            notes="Rectus abdominis - crunches, leg raises, planks"
        ),
        "lateral_core": MuscleRegionData(
            display_name="Obliques",
            parent_group="abs",
            leverage="L",
            damage_tier="+",
            recovery_modifier=1.1,
            primary_actions=["trunk_rotation", "lateral_flexion", "anti_rotation"],
            notes="Internal and external obliques - rotational movements, Pallof press"
        ),
        "deep_core": MuscleRegionData(
            display_name="Transverse Abdominis",
            parent_group="abs",
            leverage="L",
            damage_tier="+",
            recovery_modifier=1.0,
            axial_fatigue_contributor=True,
            primary_actions=["intra_abdominal_pressure", "bracing"],
            notes="Deep stabilizer, contributes to axial fatigue through bracing in compounds"
        ),
    },
}


# Pre-computed flat region map (built once at import time).
_ALL_REGIONS: Dict[str, MuscleRegionData] = {}
for _group, _regions in MUSCLE_HIERARCHY.items():
    for _region_id, _data in _regions.items():
        _ALL_REGIONS[_region_id] = _data


def get_all_muscle_regions() -> Dict[str, MuscleRegionData]:
    """
    Return flat dictionary of all muscle regions.
    Keys are region IDs (e.g., 'clavicular', 'sternocostal').
    """
    return _ALL_REGIONS


def get_muscle_region(region_id: str) -> MuscleRegionData:
    """Get a specific muscle region by ID."""
    all_regions = get_all_muscle_regions()
    if region_id not in all_regions:
        raise ValueError(f"Unknown muscle region: {region_id}")
    return all_regions[region_id]


def get_regions_by_parent_group(parent_group: str) -> Dict[str, MuscleRegionData]:
    """Get all muscle regions belonging to a parent group."""
    all_regions = get_all_muscle_regions()
    return {
        region_id: data
        for region_id, data in all_regions.items()
        if data.parent_group == parent_group
    }


def get_axial_fatigue_muscles() -> List[str]:
    """Get list of muscle region IDs that contribute to axial fatigue."""
    all_regions = get_all_muscle_regions()
    return [
        region_id
        for region_id, data in all_regions.items()
        if data.axial_fatigue_contributor
    ]


def get_parent_groups() -> List[str]:
    """Get list of all unique parent groups."""
    return _PARENT_GROUPS


# Pre-computed at import time
_PARENT_GROUPS: List[str] = list(set(data.parent_group for data in _ALL_REGIONS.values()))

# Total count for validation
TOTAL_MUSCLE_REGIONS = len(_ALL_REGIONS)  # Should be 29

# Mapping from old coarse muscle names to new granular regions
LEGACY_MUSCLE_MAPPING = {
    "pecs": ["clavicular", "sternocostal"],
    "front_delt": ["anterior_deltoid"],
    "middle_delt": ["lateral_deltoid"],
    "rear_delt": ["posterior_deltoid"],
    "upper_back": ["trapezius", "rhomboids"],
    "lats": ["thoracic_lats", "iliac_lats"],
    "erectors": ["spinal_erectors"],
    "elbow_flexors": ["biceps_brachii", "brachialis", "brachioradialis"],
    "triceps": ["triceps_long_head", "triceps_lateral_medial"],
    "forearms": ["wrist_flexors", "wrist_extensors"],  # Wrist work only
    "glutes": ["glute_max", "glute_med_min"],
    "quads": ["vasti", "rectus_femoris"],
    "hamstrings": ["hip_extensors", "knee_flexors"],
    "calves": ["gastrocnemius", "soleus"],
    "adductors": ["hip_adductors"],
    "abs": ["anterior_core", "lateral_core", "deep_core"],
}
