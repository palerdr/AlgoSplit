"""
User input processing for workout data entry.
"""

from exercise_parser import parse_exercise_name, parse_workout_list, calculate_adaptive_weeks
from baseClasses import Session, Split


def process_user_workout(user_input, default_sets=3):
    """
    Process user workout input into structured exercises.

    Supports multiple formats:
    1. Simple list (one exercise per line, uses default sets)
    2. Sets notation (e.g., "3x Bench Press")
    3. Mixed format

    Args:
        user_input: String with workout exercises (one per line)
        default_sets: Default number of sets if not specified

    Returns:
        List of {'pattern': str, 'sets': int, 'original_name': str} dicts

    Example:
        >>> workout = '''
        ... 3x Bench Press
        ... Lat Pulldown
        ... 4x Squat
        ... '''
        >>> process_user_workout(workout)
        [
            {'pattern': 'horizontal press', 'sets': 3, 'original_name': 'Bench Press'},
            {'pattern': 'vertical pull', 'sets': 3, 'original_name': 'Lat Pulldown'},
            {'pattern': 'squat pattern', 'sets': 4, 'original_name': 'Squat'}
        ]
    """
    exercises = []
    unparsed = []

    for line in user_input.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):  # Skip empty lines and comments
            continue

        # Parse sets notation (e.g., "3x Exercise Name")
        sets = default_sets
        exercise_name = line

        # Check for "NxM" format or "N x M" format
        parts = line.split(None, 1)  # Split on first whitespace
        if parts and 'x' in parts[0].lower():
            try:
                sets_str = parts[0].lower().replace('x', '').strip()
                sets = int(sets_str)
                exercise_name = parts[1] if len(parts) > 1 else parts[0]
            except (ValueError, IndexError):
                pass  # If parsing fails, use the whole line

        # Try to parse the exercise name into a movement pattern
        pattern = parse_exercise_name(exercise_name)

        if pattern:
            exercises.append({
                'pattern': pattern,
                'sets': sets,
                'original_name': exercise_name
            })
        else:
            unparsed.append(exercise_name)

    # Report unparsed exercises
    if unparsed:
        print(f"\nWARNING: Could not parse the following exercises:")
        for ex in unparsed:
            print(f"  - {ex}")
        print(f"\nYou may need to add these to the EXERCISE_MAPPINGS in exercise_parser.py")

    return exercises


def print_parsed_workout(exercises):
    """Print a formatted view of parsed workout."""
    print("\n" + "=" * 70)
    print("PARSED WORKOUT")
    print("=" * 70)
    print(f"{'Original Exercise':<30} {'Sets':<8} {'Movement Pattern':<30}")
    print("-" * 70)

    for ex in exercises:
        print(f"{ex['original_name']:<30} {ex['sets']:<8} {ex['pattern']:<30}")

    print("=" * 70 + "\n")


def interactive_workout_entry():
    """
    Interactive mode for entering workouts.

    Returns:
        List of exercises in standard format
    """
    print("\n" + "=" * 70)
    print("INTERACTIVE WORKOUT ENTRY")
    print("=" * 70)
    print("Enter exercises one per line.")
    print("Format: [Sets]x Exercise Name (e.g., '3x Bench Press')")
    print("If no sets specified, defaults to 3 sets")
    print("Type 'done' when finished, or 'help' for examples")
    print("=" * 70 + "\n")

    lines = []

    while True:
        line = input("Exercise (or 'done'): ").strip()

        if line.lower() == 'done':
            break
        elif line.lower() == 'help':
            print("\nExamples:")
            print("  3x Bench Press")
            print("  Lat Pulldown")
            print("  4x Squat")
            print("  2x DB Curl")
            print("")
            continue
        elif line:
            lines.append(line)

    workout_text = '\n'.join(lines)
    return process_user_workout(workout_text)


def save_workout_template(exercises, filename):
    """
    Save a workout template to a file for reuse.

    Args:
        exercises: List of exercise dicts
        filename: Path to save file
    """
    with open(filename, 'w') as f:
        f.write("# Workout Template\n")
        f.write("# Format: [Sets]x Exercise Name\n\n")

        for ex in exercises:
            f.write(f"{ex['sets']}x {ex['original_name']}\n")

    print(f"Workout template saved to: {filename}")


def load_workout_template(filename, default_sets=3):
    """
    Load a workout template from a file.

    Args:
        filename: Path to template file
        default_sets: Default sets if not specified

    Returns:
        List of exercise dicts
    """
    with open(filename, 'r') as f:
        workout_text = f.read()

    return process_user_workout(workout_text, default_sets)


def interactive_split_analysis():
    """
    Interactive mode for entering and analyzing a complete training split.

    Prompts user for:
    - Number of days in the split
    - Exercises for each day
    - Schedule type (weekly or custom cycle)

    Then runs simulation and outputs detailed analysis.
    """
    print("\n" + "=" * 80)
    print("SPLIT ANALYZER - Interactive Mode")
    print("=" * 80)
    print("This tool will help you analyze your training split.")
    print("You'll enter your workouts, and get a detailed weekly stimulus report.")
    print("=" * 80 + "\n")

    # Get split structure
    print("First, let's set up your split structure.\n")

    num_days = int(input("How many different workout days are in your split? (e.g., 4 for PPL+Legs): "))

    workouts = {}
    day_names = []

    print(f"\nGreat! Now enter the workouts for each of the {num_days} days.")
    print("For each day, you'll enter:")
    print("  1. A name for the day (e.g., 'Push', 'Pull', 'Legs', 'Upper', etc.)")
    print("  2. The exercises for that day")
    print("  3. Or type 'rest' if it's a rest day\n")

    # Collect workouts for each day
    for i in range(num_days):
        print("-" * 80)
        day_name = input(f"\nDay {i+1} name (e.g., 'Push', 'Pull', 'Rest'): ").strip()
        day_names.append(day_name)

        if day_name.lower() == 'rest':
            workouts[day_name] = None
            print(f"  -> Day {i+1} marked as REST")
            continue

        print(f"\nEnter exercises for {day_name}:")
        print("  Format: 'Exercise Name: Sets' or '3x Exercise Name'")
        print("  Example: 'Bench Press: 4' or '3x Lat Pulldown'")
        print("  Type 'done' when finished with this day")

        lines = []
        while True:
            line = input(f"  [{day_name}] Exercise (or 'done'): ").strip()
            if line.lower() == 'done':
                break
            elif line:
                lines.append(line)

        workout_text = '\n'.join(lines)
        workouts[day_name] = workout_text

        # Parse and show summary
        exercises = parse_workout_list(workout_text)
        print(f"  -> {len(exercises)} exercises, {sum(ex['sets'] for ex in exercises)} total sets")

    # Get schedule type
    print("\n" + "=" * 80)
    print("SCHEDULE TYPE")
    print("=" * 80)
    print("How do you repeat this split?")
    print("  1. Weekly (e.g., Mon=Day1, Tue=Day2, etc.)")
    print("  2. Custom cycle (e.g., 4 days on, 1 day off)")

    schedule_type = input("\nEnter 1 or 2: ").strip()

    if schedule_type == '1':
        # Weekly schedule
        print("\nWeekly schedule selected.")
        print("Assign each workout to a day of the week (or 'rest'):\n")

        days_of_week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        weekly_schedule = {}

        print("Available workouts:", ', '.join(day_names))
        print("Type the workout name or 'rest'\n")

        for day in days_of_week:
            while True:
                assigned = input(f"{day}: ").strip()
                if assigned.lower() == 'rest' or assigned in day_names:
                    weekly_schedule[day] = assigned
                    break
                else:
                    print(f"  Invalid. Choose from: {', '.join(day_names)} or 'rest'")

        # Create sessions for weekly schedule
        sessions = []
        current_time = 0

        for day in days_of_week:
            workout_name = weekly_schedule[day]
            if workout_name.lower() != 'rest' and workouts.get(workout_name):
                exercises = parse_workout_list(workouts[workout_name])
                sessions.append(Session(current_time, exercises))
            current_time += 24

        num_weeks = 1
        total_hours = 168

    else:
        # Custom cycle
        print("\nCustom cycle selected.")
        cycle_days = int(input("How many days in one complete cycle? (e.g., 5 for 4-on-1-off): "))

        print(f"\nDefine the {cycle_days}-day cycle:")
        print("For each day, specify which workout (or 'rest'):\n")
        print("Available workouts:", ', '.join(day_names))

        cycle_schedule = []
        for i in range(cycle_days):
            while True:
                assigned = input(f"Cycle Day {i+1}: ").strip()
                if assigned.lower() == 'rest' or assigned in day_names:
                    cycle_schedule.append(assigned)
                    break
                else:
                    print(f"  Invalid. Choose from: {', '.join(day_names)} or 'rest'")

        # Determine number of weeks to simulate using LCM(cycle_length, 7)
        num_weeks = calculate_adaptive_weeks(cycle_days)
        total_hours = num_weeks * 168

        print(f"\nAuto-calculated simulation length: {num_weeks} weeks")
        print(f"  (LCM of {cycle_days}-day cycle and 7-day week = {num_weeks * 7} days)")

        # Create sessions for custom cycle
        sessions = []
        current_time = 0

        while current_time < total_hours:
            for workout_name in cycle_schedule:
                if current_time >= total_hours:
                    break

                if workout_name.lower() != 'rest' and workouts.get(workout_name):
                    exercises = parse_workout_list(workouts[workout_name])
                    sessions.append(Session(current_time, exercises))

                current_time += 24

    # Run simulation
    print("\n" + "=" * 80)
    print(f"SIMULATING SPLIT ({num_weeks} weeks)")
    print("=" * 80)
    print(f"Total sessions: {len(sessions)}")
    print(f"Sessions per week (avg): {len(sessions) / num_weeks:.1f}")
    print("\nRunning simulation...\n")

    split = Split(sessions)
    split.simulate_week(dataset='average', week_duration_hours=total_hours)

    # Get results
    report = split.get_muscle_report()

    # Calculate weekly averages
    weekly_averages = {}
    for muscle_name, data in report.items():
        if data['total_sets'] > 0:
            weekly_averages[muscle_name] = {
                'primary_sets_per_week': data['primary_sets'] / num_weeks,
                'total_sets_per_week': data['total_sets'] / num_weeks,
                'sessions_per_week': data['sessions_trained'] / num_weeks,
                'net_stimulus_per_week': data['net_stimulus'] / num_weeks
            }

    # Print results
    print("=" * 80)
    print(f"ANALYSIS RESULTS (averaged over {num_weeks} weeks)")
    print("=" * 80)
    print(f"\n{'Muscle':<20} {'Primary':<10} {'Total':<10} {'Freq/wk':<10} {'Net Stim/wk':<15}")
    print("-" * 80)

    sorted_muscles = sorted(
        weekly_averages.items(),
        key=lambda x: x[1]['net_stimulus_per_week'],
        reverse=True
    )

    for muscle_name, data in sorted_muscles:
        print(f"{muscle_name:<20} {data['primary_sets_per_week']:<10.1f} "
              f"{data['total_sets_per_week']:<10.1f} "
              f"{data['sessions_per_week']:<10.1f} "
              f"{data['net_stimulus_per_week']:<15.2f}")

    # Muscle group breakdown
    print("\n" + "=" * 80)
    print("MUSCLE GROUP BREAKDOWN")
    print("=" * 80)

    muscle_groups = {
        'Chest': ['pecs'],
        'Back': ['lats', 'upper_back'],
        'Shoulders': ['front_delt', 'middle_delt', 'rear_delt'],
        'Arms': ['biceps', 'triceps', 'forearms'],
        'Legs': ['quads', 'hamstrings', 'glutes', 'calves'],
        'Core': ['abs', 'erectors']
    }

    for group_name, muscles in muscle_groups.items():
        total_primary = sum(weekly_averages.get(m, {}).get('primary_sets_per_week', 0) for m in muscles)
        total_sets = sum(weekly_averages.get(m, {}).get('total_sets_per_week', 0) for m in muscles)
        total_stim = sum(weekly_averages.get(m, {}).get('net_stimulus_per_week', 0) for m in muscles)

        if total_sets > 0:
            print(f"\n{group_name}:")
            print(f"  Primary sets/week: {total_primary:.1f}")
            print(f"  Total volume (incl. secondary): {total_sets:.1f}")
            print(f"  Total net stimulus/week: {total_stim:.2f}")

            for muscle in muscles:
                if muscle in weekly_averages:
                    data = weekly_averages[muscle]
                    print(f"    - {muscle}: {data['primary_sets_per_week']:.1f} primary, "
                          f"{data['total_sets_per_week']:.1f} total, "
                          f"{data['net_stimulus_per_week']:.2f} stim")

    # Recommendations
    print("\n" + "=" * 80)
    print("RECOMMENDATIONS")
    print("=" * 80)

    # Check for issues
    issues = []

    for muscle_name, data in weekly_averages.items():
        # Low frequency with decent volume
        if data['sessions_per_week'] < 2.0 and data['primary_sets_per_week'] >= 8:
            issues.append(f"[!] {muscle_name}: {data['primary_sets_per_week']:.1f} sets but only "
                         f"{data['sessions_per_week']:.1f}x/week. Consider splitting across more sessions.")

        # Very low stimulus despite training
        if data['net_stimulus_per_week'] < 0.5 and data['primary_sets_per_week'] > 0:
            issues.append(f"[!] {muscle_name}: Low stimulus ({data['net_stimulus_per_week']:.2f}) despite "
                         f"{data['primary_sets_per_week']:.1f} primary sets. Increase frequency.")

        # No primary work but getting stimulus
        if data['primary_sets_per_week'] == 0 and data['net_stimulus_per_week'] > 0.5:
            issues.append(f"[OK] {muscle_name}: {data['net_stimulus_per_week']:.2f} stimulus from secondary work only.")

    if issues:
        for issue in issues:
            print(issue)
    else:
        print("No major issues detected. Split looks balanced!")

    print("\n" + "=" * 80)
    print("ANALYSIS COMPLETE")
    print("=" * 80 + "\n")

    # Ask if user wants to save
    save = input("Save this analysis to a file? (y/n): ").strip().lower()
    if save == 'y':
        filename = input("Enter filename (e.g., 'my_split_analysis.txt'): ").strip()
        with open(filename, 'w') as f:
            f.write("SPLIT ANALYSIS REPORT\n")
            f.write("=" * 80 + "\n\n")
            f.write(f"Simulated over {num_weeks} weeks\n")
            f.write(f"Average sessions per week: {len(sessions) / num_weeks:.1f}\n\n")
            f.write("MUSCLE BREAKDOWN:\n")
            f.write("-" * 80 + "\n")
            f.write(f"{'Muscle':<20} {'Primary':<10} {'Total':<10} {'Freq/wk':<10} {'Net Stim/wk':<15}\n")
            f.write("-" * 80 + "\n")
            for muscle_name, data in sorted_muscles:
                f.write(f"{muscle_name:<20} {data['primary_sets_per_week']:<10.1f} "
                       f"{data['total_sets_per_week']:<10.1f} "
                       f"{data['sessions_per_week']:<10.1f} "
                       f"{data['net_stimulus_per_week']:<15.2f}\n")
        print(f"\nAnalysis saved to: {filename}\n")


# Example usage
if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("SPLIT.AI - Training Split Analyzer")
    print("=" * 80)
    print("\nChoose an option:")
    print("  1. Interactive Split Analysis (Full split analyzer)")
    print("  2. Quick Workout Parse (Test exercise parsing)")
    print()

    choice = input("Enter 1 or 2: ").strip()

    if choice == '1':
        # Run full interactive split analysis
        interactive_split_analysis()

    else:
        # Quick test mode
        print("\n" + "=" * 80)
        print("QUICK WORKOUT PARSE TEST")
        print("=" * 80)
        print("Enter exercises (one per line), then press Ctrl+D (Mac/Linux) or Ctrl+Z (Windows):")
        print()

        import sys
        lines = []
        try:
            while True:
                line = input()
                lines.append(line)
        except EOFError:
            pass

        test_workout = '\n'.join(lines)
        exercises = process_user_workout(test_workout, default_sets=3)
        print_parsed_workout(exercises)

        # Show summary
        print(f"\nTotal exercises: {len(exercises)}")
        print(f"Total sets per session: {sum(ex['sets'] for ex in exercises)}")
