from collections import defaultdict
from movement_patterns import get_pattern_targets, is_unilateral_pattern


SCHOENFELD = [1.00, 1.39, 1.61, 1.77, 1.90, 2.00, 2.09, 2.16, 2.23]
PELLAND = [1.00, 1.89, 2.50, 3.07, 3.56, 4.00, 4.40, 4.78, 5.16]
AVG = [(PELLAND[i] + SCHOENFELD[i]) / 2 for i in range(0, 9)]

# Incremental (diminishing returns) versions
ds = [SCHOENFELD[0]] + [SCHOENFELD[i] - SCHOENFELD[i-1] for i in range(1, 9)]
dp = [PELLAND[0]]    + [PELLAND[i]    - PELLAND[i-1]    for i in range(1, 9)]
da = [AVG[0]]        + [AVG[i]        - AVG[i-1]        for i in range(1, 9)]

# Dataset selector
DATASETS = {
    'schoenfeld': ds,
    'pelland': dp,
    'average': da
}


def atrophy_mult(hours_since_training, dataset='average'):
    """
    Calculate absolute stimulus loss due to atrophy.

    Key principle: MPS (muscle protein synthesis) is elevated for ~48h post-training.
    During this window, NO atrophy occurs. After 48h, adaptations begin to decay.

    At 168h (7 days), the 3-set baseline is completely lost, meaning:
    - 3 sets once/week = maintenance (0 net growth)
    - More sets OR higher frequency = growth
    """
    dataset_values = DATASETS.get(dataset, DATASETS['average'])
    three_set_stimulus = sum(dataset_values[:3])  # First 3 sets = baseline

    # MPS elevation window: 0-48h = NO atrophy
    MPS_WINDOW = 48.0

    if hours_since_training <= MPS_WINDOW:
        return 0.0  # No atrophy during MPS elevation

    # After MPS window, decay begins
    # From 48h to 168h (120 hours of decay), lose 100% of baseline
    hours_in_decay = hours_since_training - MPS_WINDOW
    total_decay_period = 168.0 - MPS_WINDOW  # 120 hours

    # Atrophy progression (fraction of baseline lost)
    # Measured from START of decay period (hour 48)
    DECAY_FRACTIONS = [
        (0, 0.0),      # 48h: MPS just ended, no decay yet
        (24, 0.20),    # 72h (48+24): lost 20% of baseline
        (48, 0.42),    # 96h (48+48): lost 42%
        (72, 0.67),    # 120h (48+72): lost 67%
        (96, 0.85),    # 144h (48+96): lost 85%
        (120, 1.0)     # 168h (48+120): lost 100% of baseline
    ]

    # Find interpolation range
    for i, (decay_hours, fraction) in enumerate(DECAY_FRACTIONS):
        if hours_in_decay <= decay_hours:
            if i == 0:
                return 0.0
            else:
                # Interpolate between points
                prev_hours, prev_fraction = DECAY_FRACTIONS[i-1]
                ratio = (hours_in_decay - prev_hours) / (decay_hours - prev_hours)
                interpolated_fraction = prev_fraction + (fraction - prev_fraction) * ratio
                return three_set_stimulus * interpolated_fraction

    # Beyond 168h, continue losing at same rate
    hours_beyond = hours_in_decay - DECAY_FRACTIONS[-1][0]
    rate_per_hour = three_set_stimulus / total_decay_period
    return three_set_stimulus + (hours_beyond * rate_per_hour)


def systemic_fatigue_mult(global_set_number, is_unilateral=False):
    #unilateral exercises cause much less CNS fatigue
    penalty_rate = 0.00625 if is_unilateral else 0.0175

    # Apply reduction, minimum 0.3 multiplier (never completely worthless)
    reduction = penalty_rate * (global_set_number - 1)
    return max(0.3, 1.0 - reduction)


class Muscle:
    def __init__(self, name, leverage, damage, priority=None):
        """
        Initialize a muscle group.

        Args:
            name: Muscle name
            leverage: Best leverage position ("S"hort/"M"id/"L"ong)
            damage: Damage/recovery class ("+": easily damaged, "0": neutral, "-": not easily)
            priority: Optional training priority
        """
        self.name = name
        self.leverage = leverage
        self.damageClass = damage
        self.priority = priority

        # Session-level tracking
        self.sets_this_session = 0

        # Global Weekly tracking
        self.total_weekly_sets = 0  # All sets that touch this muscle
        self.primary_weekly_sets = 0  # Sets where muscle gets >= 0.5 stimulus (primary target)
        self.weekly_stimulus = 0.0
        self.last_trained_time = None  # Hours into the week

        # Track unique session times when this muscle was trained
        self.session_times = set()

    def apply_stim(self, stimulus_amount, global_set_number, dataset='average', is_unilateral=False):
        """
        Apply stimulus from a set to this muscle.

        Args:
            stimulus_amount: Base stimulus amount (from movement pattern weight)
            global_set_number: The set number in the overall session (for systemic fatigue)
            dataset: Which dataset to use ('schoenfeld', 'pelland', or 'average')
            is_unilateral: Whether this is a unilateral movement

        Returns:
            Float: Effective stimulus added
        """
        incremental_data = DATASETS.get(dataset, DATASETS['average'])

        # Determine per-muscle position 
        muscle_set_index = self.sets_this_session

        if muscle_set_index >= len(incremental_data):
            #calculates the marginal stimulus based on set index
            per_muscle_factor = 0.01
        else:
            per_muscle_factor = incremental_data[muscle_set_index]

        # Get systemic fatigue multiplier
        systemic_factor = systemic_fatigue_mult(global_set_number, is_unilateral)

        # Calculate effective stimulus
        # stimulus_amount is the weight from the movement pattern (e.g., 0.5 for pecs in horizontal press)
        effective_stimulus = stimulus_amount * per_muscle_factor * systemic_factor

        # Update tracking
        self.weekly_stimulus += effective_stimulus
        self.sets_this_session += 1
        self.total_weekly_sets += 1

        # Track primary sets (where this muscle is a primary target >= 50% stimulus)
        if stimulus_amount >= 0.5:
            self.primary_weekly_sets += 1

        return effective_stimulus

    def apply_atrophy(self, current_time, dataset='average'):
        """
        Apply time-based atrophy to accumulated stimulus.
        Uses ABSOLUTE atrophy (fixed amount, not percentage).

        Args:
            current_time: Current time in hours
            dataset: Which dataset to use for atrophy calculation
        """
        if self.last_trained_time is None:
            return

        hours_elapsed = current_time - self.last_trained_time
        absolute_stimulus_lost = atrophy_mult(hours_elapsed, dataset)

        # Reduce stimulus by absolute amount (can't go below 0)
        self.weekly_stimulus = max(0.0, self.weekly_stimulus - absolute_stimulus_lost)

    def reset_session(self):
        """Reset session-level counters."""
        self.sets_this_session = 0

    def reset_week(self):
        """Reset all weekly tracking."""
        self.sets_this_session = 0
        self.total_weekly_sets = 0
        self.primary_weekly_sets = 0
        self.weekly_stimulus = 0.0
        self.last_trained_time = None
        self.session_times = set()

    def get_net_weekly_stimulus(self):
        return self.weekly_stimulus

    def record_session(self, session_time):
        """Record that this muscle was trained at a specific session time."""
        self.session_times.add(session_time)



class Session:
    def __init__(self, time_hours, exercises):
        self.time_hours = float(time_hours)
        self.exercises = exercises if isinstance(exercises, list) else []

    def execute(self, muscles_dict, dataset='average'):
        """
        Execute this session, applying stimulus to all trained muscles.

        Args:
            muscles_dict: Dictionary of muscle_name -> Muscle objects
            dataset: Which dataset to use for calculations

        Returns:
            Dictionary with session statistics
        """
        global_set_counter = 0
        session_stats = {
            'time': self.time_hours,
            'total_sets': 0,
            'muscles_trained': set(),
            'stimulus_by_muscle': defaultdict(float),
            'exercises_performed': []
        }

        # Reset session counters for all muscles that will be trained
        muscles_to_train = set()
        for exercise in self.exercises:
            pattern_name = exercise.get('pattern')
            targets = get_pattern_targets(pattern_name)
            if targets:
                muscles_to_train.update(targets.keys())

        for muscle_name in muscles_to_train:
            if muscle_name in muscles_dict:
                muscles_dict[muscle_name].reset_session()

        # Execute each exercise
        for exercise in self.exercises:
            pattern_name = exercise.get('pattern')
            num_sets = exercise.get('sets', 0)

            # Get the movement pattern targets
            targets = get_pattern_targets(pattern_name)
            if not targets:
                print(f"Warning: Pattern '{pattern_name}' not found in database")
                continue

            # Check if unilateral
            is_unilateral = is_unilateral_pattern(pattern_name)

            exercise_stimulus = defaultdict(float)

            # Apply each set
            for set_num in range(num_sets):
                global_set_counter += 1

                # Apply stimulus to each target muscle
                for muscle_name, weight in targets.items():
                    if muscle_name not in muscles_dict:
                        print(f"Warning: Muscle '{muscle_name}' not found in muscles dictionary")
                        continue

                    muscle = muscles_dict[muscle_name]
                    stimulus = muscle.apply_stim(weight, global_set_counter, dataset, is_unilateral)
                    exercise_stimulus[muscle_name] += stimulus
                    session_stats['stimulus_by_muscle'][muscle_name] += stimulus
                    session_stats['muscles_trained'].add(muscle_name)

            # Update last trained time for all muscles in this exercise
            for muscle_name in targets.keys():
                if muscle_name in muscles_dict:
                    muscle = muscles_dict[muscle_name]
                    muscle.last_trained_time = self.time_hours
                    muscle.record_session(self.time_hours)

            # Record exercise in stats
            session_stats['exercises_performed'].append({
                'pattern': pattern_name,
                'sets': num_sets,
                'unilateral': is_unilateral,
                'stimulus_by_muscle': dict(exercise_stimulus)
            })

        session_stats['total_sets'] = global_set_counter
        session_stats['muscles_trained'] = list(session_stats['muscles_trained'])
        session_stats['stimulus_by_muscle'] = dict(session_stats['stimulus_by_muscle'])

        return session_stats


class Split:
    def __init__(self, sessions):
        """
        Initialize a weekly training split.

        Args:
            sessions: List of Session objects
        """
        self.sessions = sorted(sessions, key=lambda s: s.time_hours)

        # Initialize predefined muscles
        self.muscles = {
            "pecs":                Muscle("pecs",             "M", "-"),
            "front_delt":          Muscle("front_delt",       "L", "0"),
            "middle_delt":         Muscle("middle_delt",      "M", "0"),
            "rear_delt":           Muscle("rear_delt",        "L", "0"),
            "upper_back":          Muscle("upper_back",       "L", "0"),
            "lats":                Muscle("lats",             "S", "0"),
            "quads":               Muscle("quads",            "L", "+"),
            "hamstrings":          Muscle("hamstrings",       "L", "-"),
            "calves":              Muscle("calves",           "L", "+"),
            "abs":                 Muscle("abs",              "L", "+"),
            "glutes":              Muscle("glutes",           "S", "0"),
            "erectors":            Muscle("erectors",         "S", "+"),
            "forearms":            Muscle("forearms",         "L", "+"),
            "biceps":              Muscle("biceps",           "L", "-"),
            "triceps":             Muscle("triceps",          "S", "-"),
            "adductors":           Muscle("adductors",        "L", "0")
        }

        self.session_stats = []

    def simulate_week(self, dataset='average', week_duration_hours=168):
        """
        Simulate the entire weekly training split with atrophy.

        Args:
            dataset: Which dataset to use ('schoenfeld', 'pelland', 'average')
            week_duration_hours: Total hours in the week (default 168 = 7 days)

        Returns:
            Dictionary with weekly statistics
        """
        # Reset all muscles
        for muscle in self.muscles.values():
            muscle.reset_week()

        self.session_stats = []

        # Execute each session chronologically
        for i, session in enumerate(self.sessions):
            # Apply atrophy to all muscles that have been trained before
            for muscle in self.muscles.values():
                if muscle.last_trained_time is not None:
                    muscle.apply_atrophy(session.time_hours, dataset)

            # Execute the session
            stats = session.execute(self.muscles, dataset)
            self.session_stats.append(stats)

        # Apply final atrophy from last session to end of week
        for muscle in self.muscles.values():
            if muscle.last_trained_time is not None:
                muscle.apply_atrophy(week_duration_hours, dataset)

        return self.get_weekly_stats()


    def get_muscle_report(self):
        """
        Get detailed per-muscle breakdown.

        Returns:
            Dictionary: {muscle_name: {sets, stimulus, sessions, ...}}
        """
        report = {}
        for name, muscle in self.muscles.items():
            report[name] = {
                'total_sets': muscle.total_weekly_sets,
                'primary_sets': muscle.primary_weekly_sets,
                'net_stimulus': muscle.get_net_weekly_stimulus(),
                'sessions_trained': len(muscle.session_times)
            }
        return report

    def get_weekly_stats(self):
        """
        Get comprehensive weekly statistics.

        Returns:
            Dictionary with total score, per-muscle breakdown, session stats
        """
        return {
            'muscle_breakdown': self.get_muscle_report(),
            'session_stats': self.session_stats,
            'total_sessions': len(self.sessions)
        }

    def suggest_optimizations(self):
        """Analyze the split and suggest optimizations."""
        suggestions = []
        report = self.get_muscle_report()

        for muscle_name, data in report.items():
            if data['total_sets'] == 0:
                continue

            # Negative stimulus
            if data['net_stimulus'] < 0:
                suggestions.append(
                    f"{muscle_name}: Negative stimulus ({data['net_stimulus']:.2f}). "
                    f"Add sets or train more frequently."
                )
            # Low stimulus despite training
            elif data['net_stimulus'] < 0.5:
                suggestions.append(
                    f"{muscle_name}: Low stimulus ({data['net_stimulus']:.2f}) from {data['total_sets']} sets. "
                    f"Spread across more sessions for better returns."
                )
            # Low frequency
            elif data['sessions_trained'] == 1 and data['total_sets'] <= 3:
                suggestions.append(
                    f"{muscle_name}: Only {data['total_sets']} sets in 1 session. "
                    f"Split across multiple sessions for higher stimulus."
                )

        # High session volume
        for i, stats in enumerate(self.session_stats):
            if stats['total_sets'] > 30:
                suggestions.append(
                    f"Session {i+1} (hour {stats['time']}): {stats['total_sets']} sets causes high CNS fatigue. "
                    f"Consider splitting into multiple sessions."
                )

        return suggestions

    def print_report(self):
        """Print a formatted report of the weekly split."""
        stats = self.get_weekly_stats()

        # Header
        print("\n" + "=" * 70)
        print("WEEKLY TRAINING SPLIT REPORT")
        print("=" * 70)
        print(f"Total Score: {stats['total_score']:.2f}")
        print(f"Total Sessions: {stats['total_sessions']}")

        # Muscle breakdown
        print("\n" + "-" * 70)
        print("MUSCLE BREAKDOWN")
        print("-" * 70)
        print(f"{'Muscle':<20} {'Sets':<8} {'Freq':<8} {'Net Stimulus':<15}")
        print("-" * 70)

        trained_muscles = {k: v for k, v in stats['muscle_breakdown'].items() if v['total_sets'] > 0}
        for muscle_name, data in sorted(trained_muscles.items(), key=lambda x: x[1]['net_stimulus'], reverse=True):
            print(f"{muscle_name:<20} {data['total_sets']:<8} "
                  f"{data['sessions_trained']:<8} {data['net_stimulus']:<15.2f}")

        # Session breakdown
        print("\n" + "-" * 70)
        print("SESSION BREAKDOWN")
        print("-" * 70)
        for i, sess in enumerate(stats['session_stats'], 1):
            print(f"\nSession {i} (Hour {sess['time']}):")
            print(f"  Sets: {sess['total_sets']}")
            print(f"  Muscles: {', '.join(sess['muscles_trained'])}")
            for ex in sess['exercises_performed']:
                uni = " [UNI]" if ex['unilateral'] else ""
                print(f"  {ex['sets']}x {ex['pattern']}{uni}")

        # Optimizations
        suggestions = self.suggest_optimizations()
        if suggestions:
            print("\n" + "=" * 70)
            print("OPTIMIZATION SUGGESTIONS")
            print("=" * 70)
            for i, msg in enumerate(suggestions, 1):
                print(f"{i}. {msg}")

        print("=" * 70 + "\n")
