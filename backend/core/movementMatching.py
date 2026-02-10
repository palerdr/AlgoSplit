"""
Exercise Classification System - Robust movement pattern matching

Goal
----
Map free-form exercise names (user-entered) to canonical movement patterns
defined in granular_patterns.py. The granular patterns contain the detailed
muscle targeting percentages used by the net weekly stimulus model.

----------------------------
- Plug in your storage for overrides: PatternMatcher.set_override_store(...)
- When move_match returns None (unknown) or you want user correction:
  save override normalized_name -> pattern into store
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple, Callable

from core.granular_patterns import (
    GRANULAR_PATTERNS,
    get_pattern,
    get_flat_muscle_targets,
    get_pattern_resistance_profile,
)


class Movement:
    def __init__(
        self,
        name,
        targets,
        resistance_profile=None,
        is_unilateral=False,
        tiered_targets=None,
        axial_load=None,
        is_custom=False,
    ):
        self.name = name
        self.targets = targets
        self.resistance_profile = resistance_profile
        self.unilateral = is_unilateral
        # Extended properties for custom exercises
        self.tiered_targets = tiered_targets  # Dict with prime/secondary/tertiary/quaternary keys
        self.axial_load = axial_load  # Float 0-1 for custom axial load
        self.is_custom = is_custom  # True if this is a user-defined custom exercise


# ---------------------------------------------
# Matching rules: token-based + scored matching
# ---------------------------------------------
@dataclass(frozen=True)
class Rule:
    """
    A matching rule for a canonical pattern.

    required: tokens that must ALL be present
    any_of: if non-empty, at least one token must be present
    banned: tokens that must NOT be present
    pattern: canonical pattern name
    weight: score bonus for this rule (more specific rules can have higher weight)

    Notes:
    - Use tokens, not substrings (e.g., "pull", "up" rather than "pullup"; but we
      also support alias expansion to handle "pullup" -> "pull up").
    """
    required: Tuple[str, ...]
    any_of: Tuple[str, ...]
    banned: Tuple[str, ...]
    pattern: str
    weight: int = 10


class PatternMatcher:
    """
    Robust movement pattern matcher with:
    - normalization + tokenization
    - alias expansion (pullup -> pull up, etc.)
    - rule stages with scoring
    - negative keywords (banned tokens)
    - modifiers for refining base pattern (incline/decline)
    - optional persistent overrides store

    Overrides store interface:
        - get(normalized: str) -> Optional[str]
        - set(normalized: str, pattern: str) -> None

    You can pass any object implementing these methods via set_override_store.
    """

    def __init__(self) -> None:
        # -------------------------
        # Token alias expansions
        # -------------------------
        # Converts joined tokens to separated tokens to improve matching.
        # We apply these BEFORE tokenization (string replacement on normalized text).
        self._phrase_aliases: List[Tuple[str, str]] = [
            ("pullup", "pull up"),
            ("chinup", "chin up"),
            ("pushup", "push up"),
            ("situp", "sit up"),
            ("latpulldown", "lat pulldown"),
            ("pulldown", "pull down"),
            ("stepup", "step up"),
            ("flye", "fly"),
            ("rdl", "romanian deadlift"),
            ("skullcrusher", "skull crusher"),
            ("hyperextension", "hyper extension"),
            ("goodmorning", "good morning"),
            ("ohp", "overhead press"),
            ("bss", "bulgarian split squat"),
            # Additional common variations
            ("pecdeck", "pec deck"),
            ("pecdec", "pec deck"),
            ("backext", "back extension"),
            ("romanchair", "back extension"),
            ("roman chair", "back extension"),
            ("ghd", "back extension"),
            ("45degree", "45 degree"),
            ("woodchop", "wood chop"),
            ("flutterkick", "flutter kick"),
            ("scissorkick", "scissor kick"),
            ("mountainclimber", "mountain climber"),
            # Directional cable phrases – order matters but token-set matching
            # is bag-of-words, so we convert to unique directional tokens.
            ("high to low", "htl"),
            ("low to high", "lth"),
        ]

        # -------------------------
        # Modifiers (refine patterns)
        # -------------------------
        # Joint-action patterns are intentionally compact; modifiers are conservative.
        self._incline_tokens = {"incline", "upper"}
        self._decline_tokens = {"decline"}
        self._overhead_tokens = {"overhead"}  # used for distinguishing press vs. extension

        # -------------------------
        # Rules: staged from specific -> general -> fallback
        # -------------------------
        # Specific rules should have higher weight. Banned tokens reduce false positives.
        self.specific_rules: List[Rule] = [
            # Lower-body isolation (protect against "curl" collisions)
            Rule(required=("leg", "extension"), any_of=(), banned=(), pattern="knee_extension_isolation", weight=60),
            Rule(required=("quad", "extension"), any_of=(), banned=(), pattern="knee_extension_isolation", weight=60),
            Rule(required=("hamstring", "curl"), any_of=(), banned=(), pattern="knee_flexion_isolation", weight=60),
            Rule(required=("leg", "curl"), any_of=(), banned=(), pattern="knee_flexion_isolation", weight=60),
            Rule(required=("nordic",), any_of=("curl", "hamstring"), banned=(), pattern="knee_flexion_isolation", weight=65),

            # Hip extension (glute-focused)
            Rule(required=("hip", "thrust"), any_of=(), banned=(), pattern="hip_extension_isolation", weight=60),
            Rule(required=("glute", "bridge"), any_of=(), banned=(), pattern="hip_extension_isolation", weight=60),
            Rule(required=("glute", "kickback"), any_of=(), banned=(), pattern="hip_extension_isolation", weight=60),
            Rule(required=("cable", "pull", "through"), any_of=(), banned=(), pattern="hip_extension_isolation", weight=60),
            Rule(required=("glute", "machine"), any_of=(), banned=(), pattern="hip_extension_isolation", weight=55),

            # Hip abduction/adduction
            Rule(required=("hip", "abduction"), any_of=(), banned=(), pattern="hip_abduction_isolation", weight=60),
            Rule(required=("abductor",), any_of=(), banned=(), pattern="hip_abduction_isolation", weight=55),
            Rule(required=("clamshell",), any_of=(), banned=(), pattern="hip_abduction_isolation", weight=55),
            Rule(required=("hip", "adduction"), any_of=(), banned=(), pattern="hip_adduction_isolation", weight=60),
            Rule(required=("adductor",), any_of=(), banned=(), pattern="hip_adduction_isolation", weight=55),

            # Close grip pressing (tricep-dominant compound)
            Rule(required=("close", "grip", "bench"), any_of=(), banned=(), pattern="tricep_compound", weight=70),
            Rule(required=("close", "grip", "press"), any_of=(), banned=(), pattern="tricep_compound", weight=70),
            Rule(required=("close", "bench"), any_of=(), banned=(), pattern="tricep_compound", weight=65),
            Rule(required=("close", "grip", "push", "up"), any_of=(), banned=(), pattern="tricep_compound", weight=70),
            Rule(required=("narrow", "grip", "bench"), any_of=(), banned=(), pattern="tricep_compound", weight=70),
            Rule(required=("narrow", "grip", "press"), any_of=(), banned=(), pattern="tricep_compound", weight=70),
            Rule(required=("narrow", "push", "up"), any_of=(), banned=(), pattern="tricep_compound", weight=65),

            # Triceps isolation (protect against overhead press)
            Rule(required=("tricep", "extension"), any_of=(), banned=(), pattern="elbow_extension_isolation", weight=60),
            Rule(required=("triceps", "extension"), any_of=(), banned=(), pattern="elbow_extension_isolation", weight=60),
            Rule(required=("tricep", "pushdown"), any_of=(), banned=(), pattern="elbow_extension_isolation", weight=60),
            Rule(required=("skull", "crusher"), any_of=(), banned=(), pattern="elbow_extension_isolation", weight=60),
            Rule(required=("tricep", "kickback"), any_of=(), banned=(), pattern="elbow_extension_isolation", weight=60),
            Rule(required=("rope", "pushdown"), any_of=(), banned=(), pattern="elbow_extension_isolation", weight=60),
            Rule(required=("french", "press"), any_of=(), banned=(), pattern="elbow_extension_isolation", weight=60),
            Rule(required=("tricep", "dip"), any_of=(), banned=(), pattern="elbow_extension_isolation", weight=60),
            Rule(required=("bench", "dip"), any_of=(), banned=(), pattern="elbow_extension_isolation", weight=60),
            Rule(required=("diamond", "push", "up"), any_of=(), banned=(), pattern="elbow_extension_isolation", weight=60),

            # Overhead tricep extension - different muscle emphasis
            Rule(required=("overhead", "extension"), any_of=(), banned=("press",), pattern="overhead_elbow_extension_isolation", weight=65),

            # Forearms (wrist) - protect against elbow curls
            Rule(required=("forearm", "curl"), any_of=(), banned=(), pattern="wrist_flexion_isolation", weight=60),
            Rule(required=("wrist", "curl"), any_of=(), banned=(), pattern="wrist_flexion_isolation", weight=60),
            Rule(required=("reverse", "wrist"), any_of=(), banned=(), pattern="wrist_extension_isolation", weight=60),
            Rule(required=("farmer",), any_of=("walk", "carry"), banned=(), pattern="wrist_flexion_isolation", weight=55),

            # Biceps curls (after leg curls)
            # Reverse curl - pronated grip, brachioradialis dominant
            Rule(required=("reverse", "curl"), any_of=(), banned=("leg", "hamstring", "wrist"), pattern="pronated_elbow_flexion_isolation", weight=65),
            Rule(required=("pronated", "curl"), any_of=(), banned=("leg", "hamstring"), pattern="pronated_elbow_flexion_isolation", weight=65),
            # Standard curls - supinated/neutral grip
            Rule(required=("preacher",), any_of=("curl",), banned=("leg", "hamstring"), pattern="elbow_flexion_isolation", weight=55),
            Rule(required=("hammer",), any_of=("curl",), banned=("leg", "hamstring"), pattern="elbow_flexion_isolation", weight=55),
            Rule(required=("spider",), any_of=("curl",), banned=(), pattern="elbow_flexion_isolation", weight=55),
            Rule(required=("concentration",), any_of=("curl",), banned=(), pattern="elbow_flexion_isolation", weight=55),
            Rule(required=("supination",), any_of=(), banned=(), pattern="elbow_flexion_isolation", weight=55),
            Rule(required=("curl",), any_of=(), banned=("leg", "hamstring", "wrist", "forearm", "nordic", "reverse", "pronated"), pattern="elbow_flexion_isolation", weight=50),

            # CHEST - INCLINE (clavicular/upper chest focus)
            Rule(required=("incline", "fly"), any_of=(), banned=(), pattern="clavicular_humeral_adduction_isolation", weight=70),
            Rule(required=("incline", "cable", "fly"), any_of=(), banned=(), pattern="clavicular_humeral_adduction_isolation", weight=70),
            Rule(required=("low", "cable", "fly"), any_of=(), banned=("high",), pattern="clavicular_humeral_adduction_isolation", weight=70),
            Rule(required=("lth", "fly"), any_of=(), banned=(), pattern="clavicular_humeral_adduction_isolation", weight=75),
            Rule(required=("incline", "press"), any_of=(), banned=(), pattern="clavicular_humeral_adduction_compound", weight=70),
            Rule(required=("incline", "bench"), any_of=(), banned=(), pattern="clavicular_humeral_adduction_compound", weight=70),
            Rule(required=("incline", "db"), any_of=("press",), banned=(), pattern="clavicular_humeral_adduction_compound", weight=70),
            Rule(required=("incline", "dumbbell"), any_of=("press",), banned=(), pattern="clavicular_humeral_adduction_compound", weight=70),
            Rule(required=("low", "incline"), any_of=("press", "bench"), banned=(), pattern="clavicular_humeral_adduction_compound", weight=70),
            Rule(required=("upper", "chest"), any_of=("press", "fly"), banned=(), pattern="clavicular_humeral_adduction_compound", weight=65),

            # CHEST - FLAT/DECLINE (sternocostal/mid-lower chest focus)
            Rule(required=("decline", "press"), any_of=(), banned=(), pattern="humeral_adduction_compound", weight=65),
            Rule(required=("decline", "bench"), any_of=(), banned=(), pattern="humeral_adduction_compound", weight=65),
            Rule(required=("decline", "fly"), any_of=(), banned=(), pattern="humeral_adduction_isolation", weight=65),
            Rule(required=("htl", "fly"), any_of=(), banned=(), pattern="humeral_adduction_isolation", weight=75),
            Rule(required=("high", "cable", "fly"), any_of=(), banned=("low",), pattern="humeral_adduction_isolation", weight=70),
            Rule(required=("crossover",), any_of=(), banned=("low",), pattern="humeral_adduction_isolation", weight=55),
            Rule(required=("pec", "fly"), any_of=(), banned=("incline", "upper"), pattern="humeral_adduction_isolation", weight=55),
            Rule(required=("dip",), any_of=("chest", "weighted"), banned=("bench", "tricep"), pattern="tricep_compound", weight=55),

            # Shoulder isolation
            Rule(required=("front", "raise"), any_of=(), banned=("calf",), pattern="shoulder_flexion_isolation", weight=60),
            Rule(required=("lateral", "raise"), any_of=(), banned=("calf",), pattern="shoulder_abduction_isolation", weight=60),
            Rule(required=("side", "raise"), any_of=(), banned=("calf",), pattern="shoulder_abduction_isolation", weight=60),
            Rule(required=("rear", "delt"), any_of=(), banned=(), pattern="shoulder_transverse_abduction_isolation", weight=60),
            Rule(required=("rear", "fly"), any_of=(), banned=(), pattern="shoulder_transverse_abduction_isolation", weight=60),
            Rule(required=("reverse", "fly"), any_of=(), banned=(), pattern="shoulder_transverse_abduction_isolation", weight=60),
            Rule(required=("reverse", "pec", "deck"), any_of=(), banned=(), pattern="shoulder_transverse_abduction_isolation", weight=65),

            # Back specifics
            Rule(required=("kelso", "shrug"), any_of=(), banned=(), pattern="scapular_retraction_isolation", weight=65),
            Rule(required=("face", "pull"), any_of=(), banned=(), pattern="scapular_retraction_isolation", weight=65),
            Rule(required=("pullover",), any_of=(), banned=("tricep", "triceps"), pattern="transverse_adduction_isolation", weight=60),
            Rule(required=("straight", "arm"), any_of=("pull", "pulldown"), banned=(), pattern="transverse_adduction_isolation", weight=65),
            # Wide grip pulls - transverse plane (higher weight to override generic pull rules)
            Rule(required=("wide", "pull", "up"), any_of=(), banned=(), pattern="transverse_adduction_compound", weight=65),
            Rule(required=("wide", "grip", "pull"), any_of=(), banned=(), pattern="transverse_adduction_compound", weight=65),
            Rule(required=("wide", "pulldown"), any_of=(), banned=(), pattern="transverse_adduction_compound", weight=65),
            Rule(required=("wide", "lat"), any_of=(), banned=(), pattern="transverse_adduction_compound", weight=65),

            # Core specifics
            Rule(required=("leg", "raise"), any_of=(), banned=("calf",), pattern="leg_raise", weight=60),
            Rule(required=("knee", "raise"), any_of=(), banned=(), pattern="leg_raise", weight=60),
            Rule(required=("hanging",), any_of=("raise", "leg", "knee"), banned=(), pattern="leg_raise", weight=60),
            Rule(required=("ab", "rollout"), any_of=(), banned=(), pattern="anti_extension", weight=60),
            Rule(required=("ab", "wheel"), any_of=(), banned=(), pattern="anti_extension", weight=60),
            Rule(required=("plank",), any_of=(), banned=(), pattern="anti_extension", weight=55),
            Rule(required=("dead", "bug"), any_of=(), banned=(), pattern="anti_extension", weight=55),
            Rule(required=("bird", "dog"), any_of=(), banned=(), pattern="anti_extension", weight=55),
            Rule(required=("pallof",), any_of=(), banned=(), pattern="anti_rotation", weight=55),
            Rule(required=("russian", "twist"), any_of=(), banned=(), pattern="trunk_rotation", weight=55),
            Rule(required=("wood", "chop"), any_of=(), banned=(), pattern="trunk_rotation", weight=55),
            Rule(required=("woodchop",), any_of=(), banned=(), pattern="trunk_rotation", weight=55),
            Rule(required=("cable", "rotation"), any_of=(), banned=(), pattern="trunk_rotation", weight=55),
            Rule(required=("bicycle", "crunch"), any_of=(), banned=(), pattern="trunk_rotation", weight=55),
            Rule(required=("oblique",), any_of=("crunch",), banned=(), pattern="trunk_rotation", weight=50),
            Rule(required=("side", "bend"), any_of=(), banned=(), pattern="lateral_flexion", weight=55),
            # Additional ab exercises
            Rule(required=("flutter", "kick"), any_of=(), banned=(), pattern="leg_raise", weight=55),
            Rule(required=("scissor", "kick"), any_of=(), banned=(), pattern="leg_raise", weight=55),
            Rule(required=("mountain", "climber"), any_of=(), banned=(), pattern="anti_extension", weight=50),
        ]

        self.general_rules: List[Rule] = [
            # Pulling - vertical (sagittal plane)
            Rule(required=("lat", "row"), any_of=(), banned=(), pattern="sagittal_adduction_compound", weight=45),
            Rule(required=("pull", "down"), any_of=(), banned=("press",), pattern="sagittal_adduction_compound", weight=45),
            Rule(required=("pull", "up"), any_of=(), banned=("press", "cable"), pattern="sagittal_adduction_compound", weight=45),
            Rule(required=("chin", "up"), any_of=(), banned=("press",), pattern="sagittal_adduction_compound", weight=45),

            # Rowing - scapular retraction focus
            Rule(required=("row",), any_of=(), banned=("bench", "press", "upright"), pattern="scapular_retraction_compound", weight=35),
            Rule(required=("upright", "row"), any_of=(), banned=(), pattern="scapular_retraction_compound", weight=45),
            Rule(required=("shrug",), any_of=(), banned=("kelso",), pattern="scapular_retraction_isolation", weight=35),

            # CHEST - Flat/Generic pressing (sternocostal)
            Rule(required=("bench",), any_of=(), banned=("row", "curl", "dip", "incline", "decline"), pattern="humeral_adduction_compound", weight=35),
            Rule(required=("chest", "press"), any_of=(), banned=("row", "incline"), pattern="humeral_adduction_compound", weight=40),
            Rule(required=("machine", "press"), any_of=("chest", "bench"), banned=("row", "incline"), pattern="humeral_adduction_compound", weight=35),
            Rule(required=("push", "up"), any_of=(), banned=("row", "diamond", "close", "incline"), pattern="humeral_adduction_compound", weight=35),
            Rule(required=("dip",), any_of=(), banned=("bench", "tricep"), pattern="tricep_compound", weight=35),

            # SHOULDERS - Overhead pressing (pronated grip by default)
            Rule(required=("shoulder", "press"), any_of=(), banned=("extension",), pattern="pronated_vertical_press_compound", weight=40),
            Rule(required=("military", "press"), any_of=(), banned=("extension",), pattern="pronated_vertical_press_compound", weight=45),
            Rule(required=("overhead", "press"), any_of=(), banned=("extension",), pattern="pronated_vertical_press_compound", weight=45),
            Rule(required=("seated", "press"), any_of=(), banned=("extension", "leg"), pattern="pronated_vertical_press_compound", weight=35),
            Rule(required=("standing", "press"), any_of=(), banned=("extension",), pattern="pronated_vertical_press_compound", weight=35),
            Rule(required=("arnold",), any_of=("press",), banned=(), pattern="pronated_vertical_press_compound", weight=45),
            Rule(required=("push", "press"), any_of=(), banned=(), pattern="pronated_vertical_press_compound", weight=45),
            Rule(required=("behind", "neck", "press"), any_of=(), banned=(), pattern="pronated_vertical_press_compound", weight=45),
            # Neutral grip pressing - different muscle targeting
            Rule(required=("neutral", "press"), any_of=(), banned=(), pattern="neutral_vertical_press_compound", weight=45),
            Rule(required=("hammer", "press"), any_of=("shoulder",), banned=(), pattern="neutral_vertical_press_compound", weight=45),

            # Flies (flat = sternocostal by default)
            Rule(required=("pec", "deck"), any_of=(), banned=("reverse",), pattern="humeral_adduction_isolation", weight=45),
            Rule(required=("pec", "dec"), any_of=(), banned=("reverse",), pattern="humeral_adduction_isolation", weight=43),
            Rule(required=("fly",), any_of=(), banned=("rear", "reverse", "incline", "low"), pattern="humeral_adduction_isolation", weight=35),

            # Lower body
            Rule(required=("squat",), any_of=(), banned=("split",), pattern="squat_compound", weight=40),
            Rule(required=("leg", "press"), any_of=(), banned=("calf",), pattern="squat_compound", weight=40),
            Rule(required=("hack",), any_of=(), banned=(), pattern="squat_compound", weight=35),

            Rule(required=("deadlift",), any_of=(), banned=(), pattern="hinge_compound", weight=40),
            Rule(required=("sumo", "deadlift"), any_of=(), banned=(), pattern="hinge_compound", weight=45),
            Rule(required=("romanian", "deadlift"), any_of=(), banned=(), pattern="hinge_compound", weight=45),
            Rule(required=("stiff", "leg"), any_of=(), banned=(), pattern="hinge_compound", weight=45),
            Rule(required=("good", "morning"), any_of=(), banned=(), pattern="hinge_compound", weight=45),
            Rule(required=("hinge",), any_of=(), banned=(), pattern="hinge_compound", weight=30),

            Rule(required=("lunge",), any_of=(), banned=(), pattern="lunge_compound", weight=40),
            Rule(required=("split", "squat"), any_of=(), banned=(), pattern="lunge_compound", weight=45),
            Rule(required=("bulgarian",), any_of=(), banned=(), pattern="lunge_compound", weight=45),
            Rule(required=("step", "up"), any_of=(), banned=(), pattern="lunge_compound", weight=45),

            # Core (avoid overly broad "ab" by requiring an additional hint)
            Rule(required=("crunch",), any_of=(), banned=("bicycle", "oblique"), pattern="spinal_flexion", weight=40),
            Rule(required=("sit", "up"), any_of=(), banned=(), pattern="spinal_flexion", weight=40),
            Rule(required=("v", "up"), any_of=(), banned=(), pattern="spinal_flexion", weight=40),
            Rule(required=("toe", "touch"), any_of=(), banned=(), pattern="spinal_flexion", weight=40),
            Rule(required=("ab",), any_of=("crunch", "wheel", "rollout"), banned=(), pattern="spinal_flexion", weight=25),
            Rule(required=("ab", "machine"), any_of=(), banned=(), pattern="spinal_flexion", weight=45),

            Rule(required=("back", "extension"), any_of=(), banned=(), pattern="spinal_extension", weight=40),
            Rule(required=("back", "ext"), any_of=(), banned=(), pattern="spinal_extension", weight=38),
            Rule(required=("hyper", "extension"), any_of=(), banned=(), pattern="spinal_extension", weight=35),
            Rule(required=("reverse", "hyper"), any_of=(), banned=(), pattern="spinal_extension", weight=45),
            Rule(required=("rack", "pull"), any_of=(), banned=(), pattern="hinge_compound", weight=35),

            # Calves
            Rule(required=("calf",), any_of=("raise", "raises", "press"), banned=(), pattern="ankle_plantarflexion_isolation", weight=40),
        ]

        self.fallback_rules: List[Rule] = [
            # Forearms fallback
            Rule(required=("forearm",), any_of=(), banned=(), pattern="wrist_flexion_isolation", weight=20),
            Rule(required=("forearms",), any_of=(), banned=(), pattern="wrist_flexion_isolation", weight=20),
        ]

        # Muscle-only fallback (when user types just muscle name)
        self.muscle_only: Dict[str, str] = {
            "biceps": "elbow_flexion_isolation",
            "bicep": "elbow_flexion_isolation",
            "triceps": "elbow_extension_isolation",
            "tricep": "elbow_extension_isolation",
            "calves": "ankle_plantarflexion_isolation",
            "calf": "ankle_plantarflexion_isolation",
            "abs": "spinal_flexion",
            "abdominals": "spinal_flexion",
            "erectors": "spinal_extension",
            "forearm": "wrist_flexion_isolation",
            "forearms": "wrist_flexion_isolation",
            "quads": "knee_extension_isolation",
            "hamstrings": "knee_flexion_isolation",
            "glutes": "hip_extension_isolation",
        }

        # Optional override store (for deployment)
        self._override_get: Optional[Callable[[str], Optional[str]]] = None
        self._override_set: Optional[Callable[[str, str], None]] = None

        # Minimum score threshold for accepting a classification
        self.min_score: int = 35

        # If top two scores are too close, treat as ambiguous
        self.ambiguity_margin: int = 8

    # -----------------------
    # Override store (optional)
    # -----------------------
    def set_override_store(
        self,
        get_fn: Callable[[str], Optional[str]],
        set_fn: Callable[[str, str], None],
    ) -> None:
        """
        Attach a persistent override store.

        Example:
            overrides = {}
            matcher.set_override_store(overrides.get, overrides.__setitem__)
        """
        self._override_get = get_fn
        self._override_set = set_fn

    def set_override(self, exercise_name: str, pattern_name: str) -> None:
        """
        Persist an override mapping from normalized exercise string to a pattern.
        This is intended for app UIs where the user corrects a match.
        """
        if self._override_set is None:
            return
        normalized = self._normalize_text(exercise_name)
        self._override_set(normalized, pattern_name)

    # -----------------------
    # Normalization utilities
    # -----------------------
    def _normalize_text(self, text: str) -> str:
        text = text.lower()
        # Keep alphanumerics and spaces, replace punctuation with spaces
        text = re.sub(r"[^a-z0-9\s]", " ", text)
        text = re.sub(r"\s+", " ", text).strip()

        # Apply phrase aliases (string-level) before tokenization
        for src, dst in self._phrase_aliases:
            # Replace whole-word occurrences where possible
            # Use word boundaries to avoid weird partial replacements
            text = re.sub(rf"\b{re.escape(src)}\b", dst, text)

        return text

    def _tokenize(self, normalized_text: str) -> List[str]:
        return normalized_text.split()

    def _token_set(self, normalized_text: str) -> Set[str]:
        return set(self._tokenize(normalized_text))

    # -----------------------
    # Unilateral detection
    # -----------------------
    def _detect_unilateral(self, normalized_text: str, tokens: Set[str]) -> bool:
        unilateral_patterns = [
            r"\bsa\b",               # single-arm abbreviation
            r"\bsl\b",               # single-leg abbreviation
            r"\bsingle\b",
            r"\bunilateral\b",
            r"\bone arm\b",
            r"\bone leg\b",
            r"\balternating\b",
        ]
        for p in unilateral_patterns:
            if re.search(p, normalized_text):
                return True

        # Token-level cues
        if "single" in tokens or "unilateral" in tokens or "alternating" in tokens:
            return True

        return False

    # -----------------------
    # Rule evaluation
    # -----------------------
    def _rule_matches(self, tokens: Set[str], rule: Rule) -> bool:
        if any(b in tokens for b in rule.banned):
            return False
        if not all(r in tokens for r in rule.required):
            return False
        if rule.any_of and not any(a in tokens for a in rule.any_of):
            return False
        return True

    def _score_rule(self, tokens: Set[str], rule: Rule) -> int:
        """
        Score a matching rule.
        Right now it's mostly based on rule.weight + a little specificity bonus.
        """
        if not self._rule_matches(tokens, rule):
            return 0

        # Specificity bonuses: more required tokens => higher confidence
        specificity_bonus = 3 * len(rule.required) + (2 if rule.any_of else 0)
        return rule.weight + specificity_bonus

    def _choose_best_pattern(self, tokens: Set[str]) -> Tuple[Optional[str], int, bool]:
        """
        Returns (pattern_name, best_score, is_ambiguous)

        Ambiguity logic:
        - if best_score < min_score: None
        - if runner_up is within ambiguity_margin: ambiguous True
        """
        scores: Dict[str, int] = {}

        # Evaluate all rules; take max score per pattern
        for stage in (self.specific_rules, self.general_rules, self.fallback_rules):
            for rule in stage:
                s = self._score_rule(tokens, rule)
                if s <= 0:
                    continue
                prev = scores.get(rule.pattern, 0)
                if s > prev:
                    scores[rule.pattern] = s

        if not scores:
            return (None, 0, False)

        # sort by score descending
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        best_pattern, best_score = ranked[0]
        runner_up_score = ranked[1][1] if len(ranked) > 1 else 0

        if best_score < self.min_score:
            return (None, best_score, False)

        is_ambiguous = (best_score - runner_up_score) < self.ambiguity_margin
        return (best_pattern, best_score, is_ambiguous)

    # -----------------------
    # Modifier refinement
    # -----------------------
    def _refine_with_modifiers(self, base_pattern: str, tokens: Set[str]) -> str:
        """
        Refine base patterns when modifiers are present.
        This is intentionally conservative to avoid overfitting.
        """
        # Keep minimal refinement to avoid overfitting
        return base_pattern

    # -----------------------
    # Public classification
    # -----------------------
    def classify(self, exercise_name: str) -> Tuple[Optional[str], bool]:
        """
        Classify an exercise into a movement pattern.

        Returns:
            (pattern_name, is_unilateral) or (None, False)
        """
        normalized = self._normalize_text(exercise_name)

        # 0) Overrides (deployment-ready)
        if self._override_get is not None:
            overridden = self._override_get(normalized)
            if overridden:
                tokens = self._token_set(normalized)
                is_uni = self._detect_unilateral(normalized, tokens)
                return (overridden, is_uni)

        tokens = self._token_set(normalized)
        is_unilateral = self._detect_unilateral(normalized, tokens)

        # 1) Rule-based selection with scoring
        base_pattern, score, ambiguous = self._choose_best_pattern(tokens)

        # 2) Muscle-only fallback if rules didn't classify
        if base_pattern is None:
            # Require that the token itself appears, not substring
            for muscle_token, pattern in self.muscle_only.items():
                if muscle_token in tokens:
                    return (pattern, is_unilateral)
            return (None, False)

        # 3) Refinement via modifiers
        refined = self._refine_with_modifiers(base_pattern, tokens)

        # 4) If ambiguous, you can decide whether to return None (to prompt user)
        # For now, we still return the best match to preserve "good enough" behavior.
        # In app UI, you might instead return None and ask user to select.
        # Example policy:
        #   if ambiguous: return (None, is_unilateral)
        _ = score  # keep available if you want to log/telemetry later
        _ = ambiguous

        return (refined, is_unilateral)


# Global matcher instance (same usage pattern as before)
_MATCHER = PatternMatcher()


# -----------------------------
# Public API (unchanged)
# -----------------------------
@lru_cache(maxsize=512)
def _classify_cached(exercise_name: str) -> Tuple[Optional[str], bool]:
    """Cached classification — avoids re-running regex rules for repeated exercise names."""
    return _MATCHER.classify(exercise_name)


def move_match(exercise_name: str) -> Optional[Movement]:
    """
    Main entry point: Match an exercise to a movement pattern.

    Args:
        exercise_name: Raw exercise name string

    Returns:
        Movement object with pattern name, muscle targets from granular_patterns,
        resistance profile, and unilateral flag. Returns None if not recognized.
    """
    pattern_name, is_unilateral = _classify_cached(exercise_name)

    if not pattern_name:
        return None

    # Verify pattern exists in granular_patterns
    if pattern_name not in GRANULAR_PATTERNS:
        return None

    # Get flattened targets for backward compatibility
    targets = get_flat_muscle_targets(pattern_name)
    resistance_profile = get_pattern_resistance_profile(pattern_name)

    return Movement(
        pattern_name,
        targets,
        resistance_profile=resistance_profile,
        is_unilateral=is_unilateral
    )


def get_all_patterns() -> Dict[str, Dict[str, float]]:
    """Return all available movement patterns with flattened targets."""
    return {
        name: get_flat_muscle_targets(name)
        for name in GRANULAR_PATTERNS.keys()
    }


# -----------------------------
# Optional: helper for app layer
# -----------------------------
def set_override_store(get_fn: Callable[[str], Optional[str]], set_fn: Callable[[str, str], None]) -> None:
    """
    Attach a persistent override store to the global matcher.
    Keeps your existing imports/usages while enabling deployment behavior.
    """
    _MATCHER.set_override_store(get_fn, set_fn)


def save_user_override(exercise_name: str, pattern_name: str) -> None:
    """
    Save an override mapping (normalized exercise string -> canonical pattern).
    No-op if no store is attached.
    """
    _MATCHER.set_override(exercise_name, pattern_name)
