import re


class Movement:
    def __init__(self, name, targets, resistance_profile=None, is_unilateral=False):
        self.name = name
        self.targets = targets
        self.resistance_profile = resistance_profile
        self.unilateral = is_unilateral


CANON_PATTERNS = {
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
    "chest fly": {
        "pecs": 0.90,
        "front_delt": 0.10
    },
    "upper chest fly": {
        "pecs": 0.80,
        "front_delt": 0.20
    },
    "shoulder flexion": {
        "front_delt": 1.0
    },
    "shoulder transverse abduction": {
        "rear_delt": 1.0
    },
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
    "elbow flexion": {
        "biceps": 1.0
    },
    "elbow extension": {
        "triceps": 1.0
    },
    "shoulder abduction": {
        "middle_delt": 1.0
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
    "knee extension": {
        "quads": 1.0
    },
    "knee flexion": {
        "hamstrings": 1.0
    },
    "hip extension": {
        "glutes": 1.0
    },
    "wrist flexion": {
        "forearms": 1.0
    },
}


_RULES = [
    # Vertical pulls - pulldowns, pullups, chinups
    ("vertical pull", r"(pulldowns?|pull downs?|pullups?|pull ups?|chins?|chin ups?)"),

    # Sagittal pulls - pullovers and lat-focused rows
    ("sagittal pull", r"(pullovers?|lat rows?|low rows?)"),

    # Horizontal rows - most rowing variations
    ("transverse row", r"(t[- ]?bar rows?|landmine rows?|machine rows?|cable rows?|bent over rows?|barbell rows?|db rows?|dumbbell rows?|rows?)"),

    # Scapular retraction - face pulls, shrugs
    ("scapular retraction", r"(face pulls?|shrugs?|retractions?)"),

    # Incline press - upper chest emphasis
    ("incline press", r"(incline)"),

    # Decline press - lower chest emphasis
    ("decline press", r"(decline)"),

    # Vertical/overhead press - shoulders
    ("vertical press", r"(overhead|shoulder press|military press|ohp|seated press)"),

    # Horizontal press - bench and chest press variations
    ("horizontal press", r"(bench|chest press|pushups?|push ups?)"),

    # Upper chest fly
    ("upper chest fly", r"(upper chest fl|incline fl|upper pec fl)"),

    # Chest fly - pec deck and cable flies
    ("chest fly", r"(chest fl|pec deck|cable fl|flys?|flies)"),

    # Rear delt - reverse movements and rear delt isolation
    ("shoulder transverse abduction", r"(reverse pec deck|rear delt|reverse fl)"),

    # Front delt raises
    ("shoulder flexion", r"(front raise|front delt)"),

    # Squat pattern - squats, leg press, hack squat
    ("squat", r"(squats?|leg press|hack)"),

    # Hip hinge - deadlifts and RDLs
    ("hinge", r"(deadlifts?|rdls?|romanian|hinges?)"),

    # Lunge pattern
    ("lunge", r"(lunges?|split squats?|bulgarian)"),

    # Leg extensions - quad isolation (BEFORE general extension pattern)
    ("knee extension", r"(leg extensions?)"),

    # Leg curls - hamstring isolation (BEFORE general curl pattern)
    ("knee flexion", r"(leg curls?|hamstring curls?)"),

    ("elbow flexion", r"(curls?|hammers?|preacher)"),

    ("elbow extension", r"(extensions?|pressdowns?|pushdowns?|skullcrushers?|skull crushers?)"),

    # Lateral raises - side/middle delt
    ("shoulder abduction", r"(lateral|side raise)"),

    # Ab exercises
    ("spinal flexion", r"(crunchs?|situps?|sit ups?|leg raise|knee raise|hanging)"),

    # Lower back extensions
    ("spinal extension", r"(back extensions?|hyperextensions?)"),

    # Calf raises
    ("ankle plantarflexion", r"(calfs?|calf raise|calf press)"),

    ("hip extension", r"(hip thrusts?|glute bridge)"),

    ("wrist flexion", r"(forearms?|wrist curls?)"),
]


_UNILATERAL_HINT = re.compile(r"\b(single|one arm|one leg|one|unilateral|SA|SL)\b")

_MUSCLE_ONLY = {
    "biceps": "elbow flexion",
    "triceps": "elbow extension",
    "calves": "ankle plantarflexion",
    "abs": "spinal flexion",
    "erectors": "spinal extension",
    "forearm": "wrist flexion",
    "forearms": "wrist flexion",
}


def _clean_name(exercise_name):
    cleaned = re.sub(r"[^a-z0-9\s]", " ", exercise_name.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _detect_pattern(cleaned):
    for pattern, regex in _RULES:
        if re.search(regex, cleaned):
            return pattern
    for muscle_keyword, pattern in _MUSCLE_ONLY.items():
        if muscle_keyword in cleaned:
            return pattern
    return None


def move_match(exercise_name):
    cleaned = _clean_name(exercise_name)
    pattern_name = _detect_pattern(cleaned)
    if not pattern_name:
        return None

    targets = CANON_PATTERNS.get(pattern_name)
    if not targets:
        return None

    is_unilateral = bool(_UNILATERAL_HINT.search(cleaned))
    return Movement(pattern_name, targets, resistance_profile=None, is_unilateral=is_unilateral)
