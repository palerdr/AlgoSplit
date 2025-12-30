"""
Exercise Classification System - Maps exercises to general movement patterns

This module uses a multi-stage keyword matching system to classify exercises
into biomechanical movement patterns (e.g., "horizontal press", "vertical pull").
This approach avoids maintaining a massive exercise database while still providing
accurate muscle targeting.

Architecture:
1. Text normalization (lowercase, remove punctuation, extract keywords)
2. Unilateral detection (SA, single, one arm, etc.)
3. Multi-stage pattern matching:
   - Specific patterns first (incline press, upper chest fly)
   - General patterns second (horizontal press, vertical pull)
   - Muscle-specific isolation last (biceps → elbow flexion)
"""

import re


class Movement:
    def __init__(self, name, targets, resistance_profile=None, is_unilateral=False):
        self.name = name
        self.targets = targets
        self.resistance_profile = resistance_profile
        self.unilateral = is_unilateral


# Canonical movement patterns with muscle targets
CANON_PATTERNS = {
    # Pulling movements
    "sagittal pull": {
        "lats": 0.85,
        "rear_delt": 0.10,
        "biceps": 0.05
    },
    "transverse row": {
        "upper_back": 0.80,
        "rear_delt": 0.15,
        "biceps": 0.05
    },
    "scapular retraction": {
        "upper_back": 0.85,
        "rear_delt": 0.15
    },
    "vertical pull": {
        "lats": 0.80,
        "rear_delt": 0.15,
        "biceps": 0.05
    },

    # Pressing movements
    "horizontal press": {
        "pecs": 0.80,
        "front_delt": 0.10,
        "triceps": 0.10
    },
    "incline press": {
        "pecs": 0.75,
        "front_delt": 0.15,
        "triceps": 0.10
    },
    "decline press": {
        "pecs": 0.80,
        "front_delt": 0.10,
        "triceps": 0.10
    },
    "vertical press": {
        "front_delt": 0.60,
        "middle_delt": 0.30,
        "triceps": 0.10
    },

    # Fly movements
    "chest fly": {
        "pecs": 0.90,
        "front_delt": 0.10
    },
    "upper chest fly": {
        "pecs": 0.80,
        "front_delt": 0.20
    },

    # Shoulder isolation
    "shoulder flexion": {
        "front_delt": 1.0
    },
    "shoulder abduction": {
        "middle_delt": 1.0
    },
    "shoulder transverse abduction": {
        "rear_delt": 1.0
    },

    # Lower body compounds
    "squat": {
        "quads": 0.55,
        "glutes": 0.25,
        "adductors": 0.15,
        "hamstrings": 0.05
    },
    "hinge": {
        "hamstrings": 0.55,
        "glutes": 0.20,
        "erectors": 0.25
    },
    "lunge": {
        "quads": 0.55,
        "glutes": 0.25,
        "hamstrings": 0.20
    },

    # Isolation movements
    "elbow flexion": {
        "biceps": 1.0
    },
    "elbow extension": {
        "triceps": 1.0
    },
    "knee extension": {
        "quads": 1.0
    },
    "knee flexion": {
        "hamstrings": 1.0
    },
    "hip extension": {
        "glutes": 1.0
    },
    "spinal flexion": {
        "abs": 1.0
    },
    "spinal extension": {
        "erectors": 1.0
    },
    "ankle plantarflexion": {
        "calves": 1.0
    },
    "wrist flexion": {
        "forearms": 1.0
    },
}


class PatternMatcher:
    """Multi-stage exercise pattern matching system"""

    def __init__(self):
        # Stage 1: Specific variations (must check first to avoid false positives)
        self.specific_patterns = [
            # LOWER BODY ISOLATION FIRST (to prevent "hamstring curl" from matching "curl" → biceps)
            (["leg", "extension"], [], "knee extension"),
            (["hamstring", "curl"], [], "knee flexion"),
            (["leg", "curl"], [], "knee flexion"),
            (["hip", "thrust"], [], "hip extension"),
            (["glute", "bridge"], [], "hip extension"),

            # ARM ISOLATION SECOND (to prevent "overhead extension" from matching "overhead press")
            (["tricep", "extension"], [], "elbow extension"),
            (["tricep", "pushdown"], [], "elbow extension"),
            (["overhead", "extension"], [], "elbow extension"),  # Overhead extension = triceps, NOT press
            (["skullcrusher"], [], "elbow extension"),
            (["skull", "crusher"], [], "elbow extension"),
            (["forearm", "curl"], [], "wrist flexion"),  # Forearm curl is wrist, not elbow
            (["wrist", "curl"], [], "wrist flexion"),

            # Biceps curls (AFTER leg curls!)
            (["curl"], [], "elbow flexion"),  # Any remaining curl is bicep work
            (["preacher"], [], "elbow flexion"),
            (["hammer"], [], "elbow flexion"),
            (["supination"], [], "elbow flexion"),

            # Chest variations
            (["upper", "fly"], [], "upper chest fly"),
            (["upper", "flye"], [], "upper chest fly"),
            (["incline", "fly"], [], "upper chest fly"),
            (["incline", "flye"], [], "upper chest fly"),
            (["incline", "press"], [], "incline press"),
            (["incline", "bench"], [], "incline press"),
            (["decline", "press"], [], "decline press"),
            (["decline", "bench"], [], "decline press"),

            # Shoulder isolation
            (["front", "raise"], [], "shoulder flexion"),
            (["lateral", "raise"], [], "shoulder abduction"),
            (["side", "raise"], [], "shoulder abduction"),
            (["rear", "delt"], [], "shoulder transverse abduction"),
            (["rear", "fly"], [], "shoulder transverse abduction"),
            (["reverse", "fly"], [], "shoulder transverse abduction"),
            (["reverse", "pec deck"], [], "shoulder transverse abduction"),

            # Back specific - shrugs need to be specific
            (["kelso", "shrug"], [], "scapular retraction"),
            (["face", "pull"], [], "scapular retraction"),
            (["pullover"], [], "sagittal pull"),
        ]

        # Stage 2: General movement patterns
        self.general_patterns = [
            # Pulling - check specific row types first
            (["lat", "row"], [], "sagittal pull"),  # Lat rows are sagittal
            (["pulldown"], [], "vertical pull"),
            (["pullup"], [], "vertical pull"),
            (["pull", "up"], [], "vertical pull"),  # "Pull up" as two words
            (["chinup"], [], "vertical pull"),
            (["chin", "up"], [], "vertical pull"),
            (["wide", "grip"], [], "vertical pull"),  # Wide grip typically means vertical pull
            (["row"], [], "transverse row"),  # Generic rows are transverse (after specific checks)
            (["shrug"], [], "scapular retraction"),

            # Pressing
            (["chest", "press"], [], "horizontal press"),
            (["chest", "machine"], [], "horizontal press"),
            (["bench"], [], "horizontal press"),
            (["overhead"], [], "vertical press"),
            (["shoulder", "press"], [], "vertical press"),
            (["military", "press"], [], "vertical press"),
            (["seated", "press"], [], "vertical press"),  # Seated press usually overhead
            (["standing", "press"], [], "vertical press"),
            (["pushup"], [], "horizontal press"),
            (["push", "up"], [], "horizontal press"),

            # Flies
            (["fly"], [], "chest fly"),
            (["flye"], [], "chest fly"),
            (["pec", "deck"], [], "chest fly"),

            # Lower body
            (["squat"], [], "squat"),
            (["leg", "press"], [], "squat"),
            (["hack"], [], "squat"),
            (["deadlift"], [], "hinge"),
            (["rdl"], [], "hinge"),
            (["romanian"], [], "hinge"),
            (["hinge"], [], "hinge"),
            (["lunge"], [], "lunge"),
            (["split", "squat"], [], "lunge"),
            (["bulgarian"], [], "lunge"),

            # Core
            (["crunch"], [], "spinal flexion"),
            (["ab"], [], "spinal flexion"),  # "Ab crunch" etc
            (["situp"], [], "spinal flexion"),
            (["leg", "raise"], [], "spinal flexion"),
            (["knee", "raise"], [], "spinal flexion"),
            (["back", "extension"], [], "spinal extension"),
            (["hyperextension"], [], "spinal extension"),
            (["rack", "pull"], [], "spinal extension"),

            # Calves
            (["calf"], [], "ankle plantarflexion"),
            (["raise"], ["calf"], "ankle plantarflexion"),  # "Calf raise"
        ]

        # Stage 3: Additional fallback patterns (moved arm isolation to Stage 1)
        self.additional_patterns = [
            # Forearms fallback
            (["forearm"], [], "wrist flexion"),
        ]

        # Stage 4: Muscle-only fallback (when exercise is just the muscle name)
        self.muscle_only = {
            "biceps": "elbow flexion",
            "bicep": "elbow flexion",
            "triceps": "elbow flexion",
            "tricep": "elbow extension",
            "calves": "ankle plantarflexion",
            "calf": "ankle plantarflexion",
            "abs": "spinal flexion",
            "erectors": "spinal extension",
            "forearm": "wrist flexion",
            "forearms": "wrist flexion",
        }

    def _normalize_text(self, text):
        """Normalize exercise name to lowercase alphanumeric with spaces"""
        # Convert to lowercase
        text = text.lower()
        # Remove special characters but keep spaces
        text = re.sub(r'[^a-z0-9\s]', ' ', text)
        # Collapse multiple spaces
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def _detect_unilateral(self, text):
        """Check if exercise is unilateral (single arm/leg)"""
        unilateral_keywords = [
            r'\bsa\b',           # SA (single arm)
            r'\bsl\b',           # SL (single leg)
            r'\bsingle\b',
            r'\bone arm\b',
            r'\bone leg\b',
            r'\bunilateral\b',
            r'\bdumbbell\b',     # DB exercises are typically unilateral
            r'\bdb\b',
        ]

        for pattern in unilateral_keywords:
            if re.search(pattern, text):
                return True
        return False

    def _match_pattern(self, text, required_keywords, optional_keywords):
        """
        Check if text matches pattern with required and optional keywords

        Args:
            text: Normalized exercise name
            required_keywords: All of these must be present
            optional_keywords: At least one of these should be present (or can be empty)

        Returns:
            True if pattern matches, False otherwise
        """
        # Check all required keywords are present
        for keyword in required_keywords:
            if keyword not in text:
                return False

        # If there are optional keywords, at least one must match
        if optional_keywords:
            found_optional = False
            for keyword in optional_keywords:
                if keyword in text:
                    found_optional = True
                    break
            if not found_optional:
                return False

        return True

    def classify(self, exercise_name):
        """
        Classify exercise into movement pattern

        Args:
            exercise_name: Raw exercise name (e.g., "SA Incline DB Press")

        Returns:
            tuple: (pattern_name, is_unilateral) or (None, False) if not recognized
        """
        normalized = self._normalize_text(exercise_name)
        is_unilateral = self._detect_unilateral(normalized)

        # Stage 1: Specific patterns (highest priority)
        for required, optional, pattern_name in self.specific_patterns:
            if self._match_pattern(normalized, required, optional):
                return (pattern_name, is_unilateral)

        # Stage 2: General patterns
        for required, optional, pattern_name in self.general_patterns:
            if self._match_pattern(normalized, required, optional):
                return (pattern_name, is_unilateral)

        # Stage 3: Additional fallback patterns
        for required, optional, pattern_name in self.additional_patterns:
            if self._match_pattern(normalized, required, optional):
                return (pattern_name, is_unilateral)

        # Stage 4: Muscle-only fallback
        for muscle_keyword, pattern_name in self.muscle_only.items():
            if muscle_keyword in normalized:
                return (pattern_name, is_unilateral)

        # Not recognized
        return (None, False)


# Global matcher instance
_MATCHER = PatternMatcher()


def move_match(exercise_name):
    """
    Main entry point: Match an exercise to a movement pattern

    Args:
        exercise_name: Raw exercise name string

    Returns:
        Movement object with pattern name, muscle targets, and unilateral flag
        or None if exercise not recognized
    """
    pattern_name, is_unilateral = _MATCHER.classify(exercise_name)

    if not pattern_name:
        return None

    targets = CANON_PATTERNS.get(pattern_name)
    if not targets:
        return None

    return Movement(pattern_name, targets, resistance_profile=None, is_unilateral=is_unilateral)


# Backwards compatibility - export pattern dict for API
def get_all_patterns():
    """Return all available movement patterns"""
    return CANON_PATTERNS.copy()
