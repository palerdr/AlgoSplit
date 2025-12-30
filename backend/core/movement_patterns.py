"""
Movement Pattern Database for Net Weekly Stimulus Model

Based on biomechanical joint actions rather than specific exercises.

This module contains:
1. MOVEMENT_PATTERNS - Biomechanical patterns and muscle stimulus distribution
2. Keyword databases for intelligent exercise classification
3. Helper functions for pattern lookup and validation

RULE: Every pattern delivers exactly 1.0 total stimulus per set
- Single-joint: 1.0 goes entirely to primary muscle
- Compound: 1.0 distributed across multiple muscles
- Patterns with 'unilateral' in name get 50% reduced global CNS fatigue penalty
"""


MOVEMENT_PATTERNS = {

    'elbow flexion': {
        'biceps': 1.0
    },
    'unilateral elbow flexion': {
        'biceps': 1.0
    },
    'elbow extension': {
        'triceps': 1.0
    },
    'unilateral elbow extension': {
        'triceps': 1.0
    },
    'wrist flexion': {
        'forearms': 1.0
    },
    'wrist extension': {
        'forearms': 1.0
    },

    'shoulder abduction': {
        'middle_delt': 1.0
    },
    'unilateral shoulder abduction': {
        'middle_delt': 1.0
    },
    'shoulder flexion': {
        'front_delt': 1.0
    },
    'shoulder transverse abduction': {
        'rear_delt': 1.0
    },
    'unilateral shoulder transverse abduction': {
        'rear_delt': 1.0
    },

    'knee extension': {
        'quads': 1.0
    },
    'unilateral knee extension': {
        'quads': 1.0
    },
    'knee flexion': {
        'hamstrings': 1.0
    },
    'unilateral knee flexion': {
        'hamstrings': 1.0
    },
    'ankle plantarflexion': {
        'calves': 1.0
    },
    'unilateral ankle plantarflexion': {
        'calves': 1.0
    },
    'hip extension': {
        'glutes': 1.0
    },
    'unilateral hip extension': {
        'glutes': 1.0
    },

    'spinal flexion': {
        'abs': 1.0
    },
    'spinal extension': {
        'erectors': 1.0
    },

    'horizontal press': {
        'pecs': 0.80,
        'front_delt': 0.10,
        'triceps': 0.10
    },
    'incline press': {
        'pecs': 0.75,
        'front_delt': 0.15,
        'triceps': 0.10,
    },
    'decline press': {
        'pecs': 0.55,
        'front_delt': 0.20,
        'triceps': 0.25
    },

    'vertical press': {
        'front_delt': 0.6,
        'middle_delt': 0.3,
        'rear_delt' : 0.05,
        'triceps': 0.05
    },

    'vertical pull': {
        'lats': 0.80,
        'rear_delt': 0.15,
        'biceps': 0.05
    },

    'unilateral vertical pull': {
        'lats': 0.8,
        'upper_back': 0.15,
        'biceps': 0.05
    },

    'horizontal scapular pull': {
        'upper_back': 0.80,
        'rear_delt': 0.15,
        'biceps': 0.05
    },
    'unilateral horizontal scapular pull': {
        'upper_back': 0.85,
        'rear_delt': 0.12,
        'biceps': 0.03
    },
    'horizontal saggital pull': {
        'lats': 0.75,
        'rear_delt': 0.2,
        'biceps': 0.05
    },
    'unilateral horizontal saggital pull': {
        'lats': 0.75,
        'rear_delt': 0.20,
        'biceps': 0.05
    },
    # Generic for backwards compatibility with legacy mappings
    'unilateral horizontal pull': {
        'upper_back': 0.70,
        'rear_delt': 0.25,
        'biceps': 0.05
    },

    'scapular retraction': {
        'upper_back': 0.90,
        'rear_delt': 0.10
    },
    
    'squat pattern': {
        'quads': 0.50,
        'glutes': 0.30,
        'adductors': 0.15,
        'hamstrings': 0.05
    },
    'unilateral squat pattern': {
        'quads': 0.50,
        'glutes': 0.30,
        'erectors': 0.15,
        'hamstrings': 0.05
    },
    'hinge pattern': {
        'hamstrings': 0.40,
        'glutes': 0.35,
        'erectors': 0.25
    },
    'unilateral hinge pattern': {
        'hamstrings': 0.40,
        'glutes': 0.35,
        'erectors': 0.25
    },
    'lunge pattern': {
        'quads': 0.45,
        'glutes': 0.35,
        'hamstrings': 0.20
    },
    'chest fly': {
        'pecs': 0.9,
        'front_delt': 0.1
    },
    'unilateral chest fly': {
        'pecs': 0.9,
        'front_delt': 0.1
    },
    'straight arm pullover': {
        'lats': 0.85,
        'rear_delt': 0.15
    },
    'dip': {
        'triceps': 0.70,
        'pecs': 0.15,
        'front_delt': 0.15
    },
}


# ============================================================================
# KEYWORD DATABASES FOR INTELLIGENT EXERCISE CLASSIFICATION
# ============================================================================

# Maps muscle keywords to canonical muscle names
MUSCLE_KEYWORDS = {
    'bicep': 'biceps',
    'biceps': 'biceps',
    'bi': 'biceps',
    'tricep': 'triceps',
    'triceps': 'triceps',
    'tri': 'triceps',
    'chest': 'pecs',
    'pec': 'pecs',
    'pecs': 'pecs',
    'pectoral': 'pecs',
    'lat': 'lats',
    'lats': 'lats',
    'latissimus': 'lats',
    'quad': 'quads',
    'quads': 'quads',
    'quadricep': 'quads',
    'hamstring': 'hamstrings',
    'hamstrings': 'hamstrings',
    'ham': 'hamstrings',
    'glute': 'glutes',
    'glutes': 'glutes',
    'gluteus': 'glutes',
    'calf': 'calves',
    'calves': 'calves',
    'gastrocnemius': 'calves',
    'delt': 'delts',
    'deltoid': 'delts',
    'shoulder': 'delts',
    'trap': 'upper_back',
    'traps': 'upper_back',
    'rhomboid': 'upper_back',
    'back': 'upper_back',
    'forearm': 'forearms',
    'forearms': 'forearms',
    'abs': 'abs',
    'abdominal': 'abs',
    'core': 'abs',
    'erector': 'erectors',
    'erectors': 'erectors',
    'lower back': 'erectors',
}

# Maps movement keywords to patterns with modifiers
MOVEMENT_KEYWORDS = {
    'press': {
        'default': 'horizontal press',
        'modifiers': {
            'incline': 'incline press',
            'decline': 'decline press',
            'overhead': 'vertical press',
            'shoulder': 'vertical press',
            'military': 'vertical press',
            'chest': 'horizontal press',
            'bench': 'horizontal press',
            'floor': 'horizontal press',
            'vertical': 'vertical press',
        }
    },
    'pull': {
        'default': 'horizontal scapular pull',
        'modifiers': {
            'down': 'vertical pull',
            'up': 'vertical pull',
            'lat': 'vertical pull',
            'row': 'horizontal scapular pull',
            'face': 'scapular retraction',
            'chin': 'vertical pull',
        }
    },
    'row': {
        'default': 'horizontal scapular pull',
        'modifiers': {
            'cable': 'horizontal scapular pull',
            'seated': 'horizontal scapular pull',
            'bent': 'horizontal saggital pull',
            'barbell': 'horizontal saggital pull',
            't-bar': 'horizontal scapular pull',
            'tbar': 'horizontal scapular pull',
            'pendlay': 'horizontal saggital pull',
        }
    },
    'curl': {
        'default': 'elbow flexion',
        'modifiers': {
            'leg': 'knee flexion',
            'ham': 'knee flexion',
            'hamstring': 'knee flexion',
            'wrist': 'wrist flexion',
            'bicep': 'elbow flexion',
            'preacher': 'elbow flexion',
            'concentration': 'elbow flexion',
            'hammer': 'elbow flexion',
            'lying': 'knee flexion',  # Lying leg curl
            'seated': 'knee flexion',  # Seated leg curl
        }
    },
    'extension': {
        'default': 'elbow extension',
        'modifiers': {
            'leg': 'knee extension',
            'knee': 'knee extension',
            'back': 'spinal extension',
            'hip': 'hip extension',
            'tricep': 'elbow extension',
            'overhead': 'elbow extension',
        }
    },
    'raise': {
        'default': 'shoulder abduction',
        'modifiers': {
            'lateral': 'shoulder abduction',
            'side': 'shoulder abduction',
            'front': 'shoulder flexion',
            'calf': 'ankle plantarflexion',
            'rear': 'shoulder transverse abduction',
        }
    },
    'fly': {
        'default': 'chest fly',
        'modifiers': {
            'chest': 'chest fly',
            'pec': 'chest fly',
            'rear': 'shoulder transverse abduction',
            'reverse': 'shoulder transverse abduction',
        }
    },
    'pec deck': {'default': 'chest fly'},
    'deck': {
        'default': 'chest fly',
        'modifiers': {
            'pec': 'chest fly',
            'reverse': 'shoulder transverse abduction',
            'rear': 'shoulder transverse abduction',
        }
    },
    'squat': {
        'default': 'squat pattern',
        'modifiers': {
            'bulgarian': 'unilateral squat pattern',
            'split': 'unilateral squat pattern',
            'pistol': 'unilateral squat pattern',
            'hack': 'squat pattern',
            'front': 'squat pattern',
            'goblet': 'squat pattern',
        }
    },
    'deadlift': {
        'default': 'hinge pattern',
        'modifiers': {
            'romanian': 'hinge pattern',
            'rdl': 'hinge pattern',
            'stiff': 'hinge pattern',
            'sumo': 'hinge pattern',
        }
    },
    'rdl': {'default': 'hinge pattern'},
    'lunge': {'default': 'lunge pattern'},
    'dip': {'default': 'dip'},
    'pushdown': {'default': 'elbow extension'},
    'pushup': {'default': 'horizontal press'},
    'push-up': {'default': 'horizontal press'},
    'crunch': {'default': 'spinal flexion'},
    'situp': {'default': 'spinal flexion'},
    'sit-up': {'default': 'spinal flexion'},
    'hyperextension': {'default': 'spinal extension'},
    'thrust': {
        'default': 'hip extension',
        'modifiers': {
            'hip': 'hip extension',
        }
    },
    'retraction': {'default': 'scapular retraction'},
    'shrug': {'default': 'scapular retraction'},
    'skullcrusher': {'default': 'elbow extension'},
    'skull crusher': {'default': 'elbow extension'},
    'pullover': {'default': 'straight arm pullover'},
}



# Equipment keywords that indicate unilateral exercises
UNILATERAL_INDICATORS = [
    'dumbbell', 'db', 'd.b.', 'dumbell',  # Common misspelling
    'single', 'one arm', 'single arm', 'sa', 's.a.',
    'bulgarian', 'pistol', 'unilateral',
    'one leg', 'single leg',
]

# Position/angle modifiers
POSITION_MODIFIERS = {
    'incline': 'incline',
    'decline': 'decline',
    'overhead': 'overhead',
    'seated': 'seated',
    'standing': 'standing',
    'lying': 'lying',
    'prone': 'prone',
    'supine': 'supine',
    'horizontal': 'horizontal',
    'vertical': 'vertical',
}



def get_pattern_targets(pattern_name):
    """
    Get the muscle targets and weights for a movement pattern.

    Args:
        pattern_name: Name of the movement pattern (case-insensitive)

    Returns:
        Dictionary of {muscle_name: weight} or None if pattern not found
    """
    pattern_name_lower = pattern_name.lower().strip()
    return MOVEMENT_PATTERNS.get(pattern_name_lower)


def is_unilateral_pattern(pattern_name):
    """
    Check if a pattern is unilateral (gets reduced CNS fatigue).

    Args:
        pattern_name: Name of the movement pattern

    Returns:
        Boolean: True if pattern contains 'unilateral'
    """
    return 'unilateral' in pattern_name.lower()


def list_patterns_for_muscle(muscle_name, min_weight=0.3):
    """
    Find all movement patterns that target a specific muscle.

    Args:
        muscle_name: Name of the muscle
        min_weight: Minimum weight threshold

    Returns:
        List of (pattern_name, weight) tuples sorted by weight
    """
    patterns = []
    for pattern, targets in MOVEMENT_PATTERNS.items():
        if muscle_name in targets and targets[muscle_name] >= min_weight:
            patterns.append((pattern, targets[muscle_name]))

    return sorted(patterns, key=lambda x: x[1], reverse=True)


def list_all_patterns():
    """
    Get a sorted list of all available movement patterns.

    Returns:
        Sorted list of pattern names
    """
    return sorted(MOVEMENT_PATTERNS.keys())


def add_custom_pattern(pattern_name, muscle_weights):
    """
    Add a custom movement pattern to the database.

    Args:
        pattern_name: Name of the movement pattern
        muscle_weights: Dictionary of {muscle_name: weight}

    Raises:
        ValueError: If total stimulus doesn't equal 1.0

    Example:
        add_custom_pattern('my custom press', {'pecs': 0.5, 'triceps': 0.5})
    """
    total_stimulus = sum(muscle_weights.values())
    if abs(total_stimulus - 1.0) > 0.001:  # Small tolerance for floating point
        raise ValueError(f"Total stimulus ({total_stimulus:.3f}) must equal 1.0 for pattern '{pattern_name}'")

    MOVEMENT_PATTERNS[pattern_name.lower()] = muscle_weights



PATTERN_CATEGORIES = {
    'chest': ['horizontal press', 'incline press', 'decline press', 'chest fly', 'dip',
               'unilateral chest fly'],

    'back': ['vertical pull', 'horizontal pull', 'scapular retraction', 'straight arm pulldown',
             'unilateral vertical pull', 'unilateral horizontal pull'],

    'shoulders': ['vertical press', 'shoulder abduction', 'shoulder flexion',
                  'shoulder transverse abduction', 'scapular retraction',
                  'unilateral shoulder abduction', 'unilateral shoulder transverse abduction',
                  'unilateral vertical press'],

    'arms': ['elbow flexion', 'elbow extension', 'wrist flexion', 'wrist extension',
             'unilateral elbow flexion', 'unilateral elbow extension'],

    'legs': ['squat pattern', 'hinge pattern', 'lunge pattern', 'knee extension',
             'knee flexion', 'ankle plantarflexion', 'hip extension',
             'unilateral squat pattern', 'unilateral hinge pattern', 'unilateral knee flexion',
             'unilateral ankle plantarflexion', 'unilateral hip extension'],

    'core': ['spinal flexion', 'spinal extension']
}


def validate_pattern_database():
    """
    Validate that all patterns follow the rules:
    1. Total stimulus per pattern equals exactly 1.0
    2. All muscle names match known muscles

    Returns:
        List of validation errors (empty if all valid)
    """
    VALID_MUSCLES = {
        'pecs', 'front_delt', 'middle_delt', 'rear_delt', 'upper_back', 'lats',
        'quads', 'hamstrings', 'calves', 'abs', 'glutes', 'erectors',
        'forearms', 'biceps', 'triceps', 'adductors'
    }

    errors = []

    for pattern, targets in MOVEMENT_PATTERNS.items():
        # Check total stimulus equals 1.0
        total = sum(targets.values())
        if abs(total - 1.0) > 0.001:  # Small tolerance for floating point
            errors.append(f"Pattern '{pattern}' has total stimulus {total:.3f} (must equal 1.0)")

        # Check muscle names
        for muscle in targets.keys():
            if muscle not in VALID_MUSCLES:
                errors.append(f"Pattern '{pattern}' references unknown muscle '{muscle}'")

    return errors


# Run validation on import
_validation_errors = validate_pattern_database()
if _validation_errors:
    print("WARNING: Movement pattern database has validation errors:")
    for error in _validation_errors:
        print(f"  - {error}")
else:
    print(f"Movement pattern database validated: {len(MOVEMENT_PATTERNS)} patterns loaded.")
