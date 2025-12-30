"""
Exercise Parser - Intelligent keyword-based exercise classification and parsing.

This module provides:
1. Intelligent exercise classification using keywords from movement_patterns.py
2. Multi-format input parsing (3x Exercise, Exercise: 3, etc.)
3. Legacy hardcoded mappings as fallback
4. Fuzzy matching for typo tolerance
5. User correction learning system
6. Multi-week simulation utilities
"""

from typing import Dict, List, Tuple, Optional
import json
import os
from baseClasses import Session, Split
from movement_patterns import (
    MOVEMENT_PATTERNS, MUSCLE_KEYWORDS, MOVEMENT_KEYWORDS,
    UNILATERAL_INDICATORS, POSITION_MODIFIERS
)

# User corrections database (learns from user feedback)
USER_CORRECTIONS_FILE = 'user_corrections.json'
_user_corrections_cache = None

def load_user_corrections():
    """Load user corrections from JSON file."""
    global _user_corrections_cache
    if _user_corrections_cache is not None:
        return _user_corrections_cache

    if os.path.exists(USER_CORRECTIONS_FILE):
        try:
            with open(USER_CORRECTIONS_FILE, 'r') as f:
                _user_corrections_cache = json.load(f)
                return _user_corrections_cache
        except:
            pass

    _user_corrections_cache = {}
    return _user_corrections_cache

def save_user_correction(exercise_name, pattern):
    """Save a user correction to the database."""
    corrections = load_user_corrections()
    cleaned = exercise_name.lower().strip().replace('.', '').replace('-', ' ')
    corrections[cleaned] = pattern

    with open(USER_CORRECTIONS_FILE, 'w') as f:
        json.dump(corrections, f, indent=2)

    global _user_corrections_cache
    _user_corrections_cache = corrections


# ============================================================================
# LEGACY HARDCODED MAPPINGS (kept for backward compatibility and fallback)
# ============================================================================

EXERCISE_MAPPINGS = {
    # Chest
    'pl chest press': 'horizontal press',
    'chest press': 'horizontal press',
    'incline press': 'incline press',
    'p incline machine': 'incline press',
    'decline press': 'decline press',
    'cable fly': 'chest fly',
    'chest fly': 'chest fly',
    'upper chest fly': 'chest fly',  # Could also be incline press but fly is safer
    'pec deck': 'chest fly',
    'rv pec deck': 'shoulder transverse abduction',
    'reverse pec deck': 'shoulder transverse abduction',

    # Back
    'lat pulldown': 'vertical pull',
    'unilateral lat pulldown': 'unilateral vertical pull',
    'pull up': 'vertical pull',
    'pulldown': 'vertical pull',
    'panatta row': 'horizontal scapular pull',
    'pl lat row': 'horizontal saggital pull',
    'lat row': 'horizontal saggital pull',
    'unilateral lat row': 'unilateral horizontal saggital pull',
    'seated row': 'horizontal scapular pull',
    'cable row': 'horizontal scapular pull',
    't-bar row': 'horizontal scapular pull',
    'db row': 'unilateral horizontal saggital pull',
    'one arm row': 'unilateral horizontal saggital pull',
    'face pull': 'scapular retraction',
    'kelso shrug': 'scapular retraction',
    'scapular kelso shrug': 'scapular retraction',

    # Shoulders
    'pl shoulder press': 'vertical press',
    'shoulder press': 'vertical press',
    'overhead press': 'vertical press',
    'cable lateral': 'shoulder abduction',
    'a machine lateral': 'shoulder abduction',
    'machine lateral raise': 'shoulder abduction',
    'lateral raise': 'shoulder abduction',
    'side lateral': 'shoulder abduction',
    'rear delt fly': 'shoulder transverse abduction',

    # Arms
    'gl preacher': 'elbow flexion',
    'psa preacher': 'elbow flexion',
    'preacher curl': 'elbow flexion',
    'barbell curl': 'elbow flexion',
    'cable curl': 'elbow flexion',
    'bicep curl': 'elbow flexion',
    'unilateral bicep curl': 'unilateral elbow flexion',
    'db curl': 'unilateral elbow flexion',
    'hammer curl': 'unilateral elbow flexion',
    'reverse curl': 'wrist flexion',  # Targets brachioradialis/forearms
    'tricep extension': 'elbow extension',
    'overhead extension': 'elbow extension',
    'pushdown': 'elbow extension',
    'machine forearm': 'wrist flexion',
    'wrist curl': 'wrist flexion',

    # Legs
    'sa leg exst': 'unilateral knee extension',
    'sl leg exst': 'unilateral knee extension',
    'nt leg exst': 'knee extension',
    'leg extension': 'knee extension',
    'leg exstension': 'knee extension',  # Common typo
    'seated ham curl': 'knee flexion',
    'seated ham. curl': 'knee flexion',
    'lying ham curl': 'knee flexion',
    'hamstring curl': 'knee flexion',
    'leg curl': 'knee flexion',
    'squat': 'squat pattern',
    'leg press': 'squat pattern',
    'sl press': 'squat pattern',
    'hack squat': 'squat pattern',
    'bulgarian split squat': 'unilateral squat pattern',
    'lunge': 'lunge pattern',
    'rdl': 'hinge pattern',
    '45 hinge': 'hinge pattern',
    '45 hip hinge': 'hinge pattern',  # Variation
    'hip hinge': 'hinge pattern',
    'romanian deadlift': 'hinge pattern',
    'deadlift': 'hinge pattern',
    'calf raise': 'ankle plantarflexion',
    'calf press': 'ankle plantarflexion',
    'hip thrust': 'hip extension',

    # Core
    'back extension': 'spinal extension',
    'hyperextension': 'spinal extension',
    'machine crunch': 'spinal flexion',
    'crunch': 'spinal flexion',
    'ab crunch': 'spinal flexion',

    # Custom/Specific
    'carter exst': 'elbow extension',
    'carter extension': 'elbow extension',
}


# ============================================================================
# INTELLIGENT CLASSIFICATION FUNCTIONS
# ============================================================================

def detect_muscle_group(exercise_name: str) -> Optional[str]:
    """Detect explicit muscle group mentions in exercise name."""
    for keyword, muscle in MUSCLE_KEYWORDS.items():
        if keyword in exercise_name:
            return muscle
    return None


def detect_movement_type(exercise_name: str) -> Tuple[Optional[str], Optional[dict]]:
    """
    Detect the primary movement type in exercise name.
    Priority order: compound keywords before simple ones.
    """
    # Priority list: check compound/specific keywords first
    # Order matters! Check longer/more specific phrases first
    priority_keywords = [
        'hamstring curl', 'ham curl', 'lying leg curl', 'seated leg curl',
        'leg extension', 'leg curl', 'leg press',
        'pulldown', 'pull-down', 'pullup', 'pull-up', 'pull up',
        'pullover',  # Straight arm pullover - lats focused
        'calf raise', 'rdl', 'deadlift',
        'lateral raise', 'front raise', 'rear delt',
        'bulgarian split squat', 'split squat',
        'pec deck', 'reverse pec deck',
        'skullcrusher', 'skull crusher',
    ]

    # Check priority keywords first
    for keyword in priority_keywords:
        if keyword in exercise_name:
            # Map specific phrases to movement keywords
            keyword_map = {
                'hamstring curl': 'curl',
                'ham curl': 'curl',
                'lying leg curl': 'curl',
                'seated leg curl': 'curl',
                'leg extension': 'extension',
                'leg curl': 'curl',
                'leg press': 'squat',
                'pulldown': 'pull',
                'pull-down': 'pull',
                'pullup': 'pull',
                'pull-up': 'pull',
                'pull up': 'pull',
                'pullover': 'pullover',  # Straight arm pullover
                'calf raise': 'raise',
                'lateral raise': 'raise',
                'front raise': 'raise',
                'rear delt': 'fly',
                'bulgarian split squat': 'squat',
                'split squat': 'squat',
                'pec deck': 'deck',
                'reverse pec deck': 'deck',
                'skullcrusher': 'skullcrusher',
                'skull crusher': 'skullcrusher',
            }
            mapped = keyword_map.get(keyword, keyword)
            if mapped in MOVEMENT_KEYWORDS:
                return mapped, MOVEMENT_KEYWORDS[mapped]

    # Check standard keywords
    for keyword, config in MOVEMENT_KEYWORDS.items():
        if keyword in exercise_name:
            return keyword, config

    return None, None


def detect_modifiers(exercise_name: str) -> List[str]:
    """Detect position/angle modifiers in exercise name."""
    modifiers = []
    for keyword in POSITION_MODIFIERS.keys():
        if keyword in exercise_name:
            modifiers.append(keyword)
    return modifiers


def detect_unilateral(exercise_name: str) -> bool:
    """Check if exercise is unilateral (single-limb)."""
    return any(indicator in exercise_name for indicator in UNILATERAL_INDICATORS)


def resolve_pattern(
    movement_keyword: Optional[str],
    movement_config: Optional[dict],
    modifiers: List[str],
    detected_muscle: Optional[str],
    is_unilateral: bool,
    cleaned_name: str = ''
) -> Tuple[Optional[str], float]:
    """Resolve the final movement pattern based on detected features."""
    confidence = 0.0
    pattern = None

    # Case 1: No movement detected - try muscle-based classification
    if not movement_config:
        if detected_muscle:
            # Direct muscle mention - use simple isolation patterns
            muscle_to_pattern = {
                'biceps': 'elbow flexion',
                'triceps': 'elbow extension',
                'calves': 'ankle plantarflexion',
                'abs': 'spinal flexion',
                'erectors': 'spinal extension',
                'forearms': 'wrist flexion',
            }
            pattern = muscle_to_pattern.get(detected_muscle)
            confidence = 0.6 if pattern else 0.0

            # Add unilateral prefix if needed
            if pattern and is_unilateral and not pattern.startswith('unilateral'):
                unilateral_pattern = f'unilateral {pattern}'
                if unilateral_pattern in MOVEMENT_PATTERNS:
                    pattern = unilateral_pattern
                    confidence = min(confidence + 0.1, 1.0)

        return pattern, confidence

    # Case 2: Movement detected - check modifiers
    if 'modifiers' in movement_config and modifiers:
        for mod in modifiers:
            if mod in movement_config['modifiers']:
                pattern = movement_config['modifiers'][mod]
                confidence = 0.9
                break

    # Case 3: No modifier match - use default pattern
    if not pattern:
        pattern = movement_config.get('default')
        confidence = 0.7 if pattern else 0.0

    # Case 4: Add unilateral prefix if detected
    if pattern and is_unilateral and not pattern.startswith('unilateral'):
        unilateral_pattern = f'unilateral {pattern}'
        if unilateral_pattern in MOVEMENT_PATTERNS:
            pattern = unilateral_pattern
            confidence = min(confidence + 0.1, 1.0)

    return pattern, confidence


def classify_exercise(exercise_name: str) -> Dict:
    """
    Intelligently classify an exercise using keyword-based rules.

    Returns classification dictionary with pattern, confidence, etc.
    """
    # Clean the exercise name
    cleaned_name = exercise_name.lower().strip().replace('.', '').replace('/', ' ').replace('-', ' ')

    # Stage 1: Detect muscle group
    detected_muscle = detect_muscle_group(cleaned_name)

    # Stage 2: Detect movement type
    movement_keyword, movement_config = detect_movement_type(cleaned_name)

    # Stage 3: Detect modifiers
    modifiers = detect_modifiers(cleaned_name)

    # Add implicit modifiers for compound terms
    if 'shoulder press' in cleaned_name or 'overhead press' in cleaned_name:
        modifiers.append('shoulder')
    if 'hamstring' in cleaned_name or 'ham curl' in cleaned_name:
        modifiers.append('hamstring')
    if 'pulldown' in cleaned_name or 'pull down' in cleaned_name:
        modifiers.append('down')
    if 'pullup' in cleaned_name or 'pull up' in cleaned_name or 'chin up' in cleaned_name:
        modifiers.append('up')
    if 'leg extension' in cleaned_name:
        modifiers.append('leg')
    if 'leg curl' in cleaned_name and 'hamstring' not in cleaned_name and 'ham' not in cleaned_name:
        modifiers.append('leg')
    if 'calf raise' in cleaned_name:
        modifiers.append('calf')
    if 'lateral raise' in cleaned_name or 'side raise' in cleaned_name:
        modifiers.append('lateral')
    if 'front raise' in cleaned_name:
        modifiers.append('front')
    if 'rear delt' in cleaned_name or 'reverse fly' in cleaned_name or 'reverse pec deck' in cleaned_name:
        modifiers.append('rear')
    if 'pec deck' in cleaned_name:
        modifiers.append('pec')
    # Rows with "lat" are saggital (lats), otherwise scapular (upper back)
    if 'row' in cleaned_name and 'lat' in cleaned_name:
        modifiers.append('bent')  # bent row modifier -> horizontal saggital pull

    # Stage 4: Detect unilateral
    is_unilateral = detect_unilateral(cleaned_name)

    # Stage 5: Resolve pattern
    pattern, confidence = resolve_pattern(
        movement_keyword,
        movement_config,
        modifiers,
        detected_muscle,
        is_unilateral,
        cleaned_name
    )

    # Collect matched keywords
    matched_keywords = []
    if movement_keyword:
        matched_keywords.append(movement_keyword)
    matched_keywords.extend(modifiers)
    if is_unilateral:
        matched_keywords.extend([ind for ind in UNILATERAL_INDICATORS if ind in cleaned_name])

    return {
        'pattern': pattern,
        'confidence': confidence,
        'detected_muscle': detected_muscle,
        'is_unilateral': is_unilateral,
        'matched_keywords': matched_keywords,
        'original_name': exercise_name
    }


# ============================================================================
# INPUT PARSING FUNCTIONS
# ============================================================================

def parse_exercise_with_sets(line: str, default_sets: int = 3) -> Optional[Dict]:
    """
    Parse a line containing exercise name and set count.

    Supports formats: "3x Exercise", "Exercise: 3", "Exercise: 3x8-12", etc.
    """
    line = line.strip()
    if not line or line.startswith('#'):
        return None

    sets = default_sets
    exercise_name = line

    # Format 1: "3x Exercise" or "3 x Exercise"
    # Check if first token is a set notation like "3x" (not just contains 'x' like "Flex")
    first_token = line.split()[0] if line.split() else ''
    if first_token and ('x' in first_token or 'X' in first_token):
        # Verify it's actually a number followed by x (e.g., "3x", not "Flex")
        try:
            parts = line.split(None, 1)
            if len(parts) == 2:
                sets = int(parts[0].replace('x', '').replace('X', '').strip())
                exercise_name = parts[1]
        except ValueError:
            pass  # Not a valid set notation, fall through to colon check

    # Format 2: "Exercise: 3" or "Exercise: 3x8-12" or "Exercise: 3 sets"
    if ':' in line and exercise_name == line:  # Only if format 1 didn't match
        parts = line.split(':', 1)
        if len(parts) == 2:
            exercise_name = parts[0].strip()
            sets_part = parts[1].strip()

            try:
                # Extract just the number of sets
                first_token = sets_part.split()[0] if sets_part.split() else sets_part
                sets_str = first_token.replace('x', ' ').replace('sets', '').replace('set', '').strip().split()[0]
                sets = int(sets_str)
            except (ValueError, IndexError):
                pass

    return {
        'exercise_name': exercise_name,
        'sets': sets
    }


def parse_exercise_line(line: str, default_sets: int = 3) -> Optional[Dict]:
    """
    Complete pipeline: Parse line and classify exercise.

    Returns exercise dict with pattern, sets, confidence, etc.
    """
    # Step 1: Extract exercise name and sets
    parsed = parse_exercise_with_sets(line, default_sets)
    if not parsed:
        return None

    # Step 2: Classify the exercise (intelligent classification)
    classification = classify_exercise(parsed['exercise_name'])

    # Step 3: Fallback to legacy mappings if intelligent classification failed
    if not classification['pattern']:
        # Try legacy mappings
        pattern = parse_exercise_name(parsed['exercise_name'], use_intelligent=False)
        if not pattern:
            return None

        # Create a minimal classification result from legacy mapping
        classification = {
            'pattern': pattern,
            'original_name': parsed['exercise_name'],
            'confidence': 0.8,  # Legacy mappings are trusted
            'is_unilateral': 'unilateral' in pattern,
            'detected_muscle': None,
            'matched_keywords': ['legacy_mapping']
        }

    # Step 4: Combine results
    return {
        'pattern': classification['pattern'],
        'sets': parsed['sets'],
        'original_name': classification['original_name'],
        'confidence': classification['confidence'],
        'is_unilateral': classification['is_unilateral'],
        'detected_muscle': classification['detected_muscle'],
        'matched_keywords': classification['matched_keywords']
    }


# ============================================================================
# MAIN API FUNCTIONS
# ============================================================================

def parse_exercise_name(exercise_name, use_intelligent=True, fuzzy_match=True):
    """
    Parse an exercise name into a movement pattern.

    Uses multi-tier classification system:
    1. User corrections (highest priority - user has corrected this before)
    2. Intelligent keyword matching
    3. Legacy hardcoded mappings
    4. Fuzzy matching for typos

    Args:
        exercise_name: String like "PL Chest Press" or "Lat Pulldown"
        use_intelligent: If True, use intelligent parser (default: True)
        fuzzy_match: If True, use fuzzy matching for typos (default: True)

    Returns:
        Movement pattern name or None if not found
    """
    cleaned = exercise_name.lower().strip().replace('.', '').replace('-', ' ')

    # Priority 1: Check user corrections first (user knows best!)
    user_corrections = load_user_corrections()
    if cleaned in user_corrections:
        return user_corrections[cleaned]

    # Priority 2: Try intelligent classification
    if use_intelligent:
        classification = classify_exercise(exercise_name)
        if classification['pattern'] and classification['confidence'] >= 0.5:
            return classification['pattern']

    # Priority 3: Legacy hardcoded mappings - exact match
    if cleaned in EXERCISE_MAPPINGS:
        return EXERCISE_MAPPINGS[cleaned]

    # Priority 4: Legacy partial matches
    for key, pattern in EXERCISE_MAPPINGS.items():
        if key in cleaned or cleaned in key:
            return pattern

    # Priority 5: Fuzzy matching for typos
    if fuzzy_match:
        from difflib import get_close_matches
        # Match with 80% similarity threshold
        matches = get_close_matches(cleaned, EXERCISE_MAPPINGS.keys(), n=1, cutoff=0.80)
        if matches:
            return EXERCISE_MAPPINGS[matches[0]]

    return None


def parse_workout_list(workout_text, default_sets=3, use_intelligent=True, min_confidence=0.5):
    """
    Parse a multi-line workout into exercises list.

    Supports multiple input formats:
    - "3x Bench Press"
    - "Bench Press: 3"
    - "Bench Press: 3x8-12"
    - "Bench Press" (uses default_sets)

    Args:
        workout_text: String with one exercise per line
        default_sets: Default number of sets if not specified
        use_intelligent: Use intelligent keyword-based parser (default: True)
        min_confidence: Minimum confidence for intelligent classification (default: 0.5)

    Returns:
        List of {'pattern': str, 'sets': int, 'original_name': str} dicts
    """
    exercises = []
    warnings = []

    # Use intelligent parser if enabled
    if use_intelligent:
        for line in workout_text.strip().split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue

            result = parse_exercise_line(line, default_sets)

            if not result:
                warnings.append(f"Could not parse: '{line}'")
                continue

            if result['confidence'] < min_confidence:
                warnings.append(
                    f"Low confidence ({result['confidence']:.2f}) for '{line}' "
                    f"-> {result['pattern']}"
                )

            exercises.append({
                'pattern': result['pattern'],
                'sets': result['sets'],
                'original_name': result.get('original_name', '')
            })

        # Print warnings if any
        if warnings:
            print("\nParsing Warnings:")
            for warning in warnings:
                print(f"  {warning}")

        return exercises

    # Legacy parsing (kept for backward compatibility)
    for line in workout_text.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue

        # Check if line starts with "3x" or "4x" format
        sets = default_sets
        exercise_name = line

        if line.split() and 'x' in line.split()[0]:
            parts = line.split(None, 1)
            if len(parts) == 2:
                try:
                    sets = int(parts[0].replace('x', ''))
                    exercise_name = parts[1]
                except ValueError:
                    pass

        # Parse the exercise name
        pattern = parse_exercise_name(exercise_name, use_intelligent=False)
        if pattern:
            exercises.append({
                'pattern': pattern,
                'sets': sets,
                'original_name': exercise_name
            })
        else:
            print(f"Warning: Could not parse exercise '{exercise_name}'")

    return exercises


# ============================================================================
# MULTI-WEEK SIMULATION UTILITIES
# ============================================================================

def calculate_adaptive_weeks(cycle_length_days):
    """
    Calculate the minimum number of weeks needed to simulate a cycle cleanly.

    Uses LCM(cycle_length, 7) to ensure the cycle completes evenly.

    Args:
        cycle_length_days: Length of the training cycle in days

    Returns:
        Number of weeks to simulate

    Examples:
        - Weekly (7 days): LCM(7,7) = 7 days = 1 week
        - Every other day (2 days): LCM(2,7) = 14 days = 2 weeks
        - 4-on-1-off (5 days): LCM(5,7) = 35 days = 5 weeks
        - 3 days on, 1 off (4 days): LCM(4,7) = 28 days = 4 weeks
    """
    import math
    lcm = (cycle_length_days * 7) // math.gcd(cycle_length_days, 7)
    return lcm // 7


def simulate_multi_week(session_template, days_between_sessions=2, num_weeks=None, dataset='average'):
    """
    Simulate multiple weeks with a repeating session at fixed intervals.
    Useful for "every other day" schedules that don't fit cleanly in a week.

    Args:
        session_template: List of exercises [{'pattern': str, 'sets': int}, ...]
        days_between_sessions: Days between each session (2 = every other day)
        num_weeks: How many weeks to simulate (None = auto-calculate using LCM)
        dataset: Which dataset to use

    Returns:
        Dictionary with average weekly statistics
    """
    # Auto-calculate weeks if not specified
    if num_weeks is None:
        num_weeks = calculate_adaptive_weeks(days_between_sessions)

    hours_between = days_between_sessions * 24
    total_hours = num_weeks * 168

    # Generate sessions
    sessions = []
    current_time = 0

    while current_time < total_hours:
        sessions.append(Session(current_time, session_template))
        current_time += hours_between

    # Create and simulate the split
    split = Split(sessions)
    split.simulate_week(dataset=dataset, week_duration_hours=total_hours)

    # Get per-week averages
    report = split.get_muscle_report()

    weekly_averages = {}
    for muscle_name, data in report.items():
        if data['total_sets'] > 0:
            weekly_averages[muscle_name] = {
                'sets_per_week': data['total_sets'] / num_weeks,
                'sessions_per_week': data['sessions_trained'] / num_weeks,
                'net_stimulus_per_week': data['net_stimulus'] / num_weeks
            }

    return {
        'total_weeks_simulated': num_weeks,
        'total_sessions': len(sessions),
        'sessions_per_week': len(sessions) / num_weeks,
        'muscle_averages': weekly_averages,
        'raw_report': report
    }


def print_multi_week_report(results):
    """Print a formatted report for multi-week simulation."""
    print("\n" + "=" * 70)
    print("MULTI-WEEK SIMULATION REPORT")
    print("=" * 70)
    print(f"Weeks Simulated: {results['total_weeks_simulated']}")
    print(f"Total Sessions: {results['total_sessions']}")
    print(f"Sessions per Week: {results['sessions_per_week']:.1f}")

    print("\n" + "-" * 70)
    print("AVERAGE WEEKLY STIMULUS PER MUSCLE")
    print("-" * 70)
    print(f"{'Muscle':<20} {'Sets/wk':<10} {'Freq/wk':<10} {'Net Stim/wk':<15}")
    print("-" * 70)

    # Sort by net stimulus
    sorted_muscles = sorted(
        results['muscle_averages'].items(),
        key=lambda x: x[1]['net_stimulus_per_week'],
        reverse=True
    )

    for muscle_name, data in sorted_muscles:
        print(f"{muscle_name:<20} {data['sets_per_week']:<10.1f} "
              f"{data['sessions_per_week']:<10.1f} "
              f"{data['net_stimulus_per_week']:<15.2f}")

    print("=" * 70 + "\n")
