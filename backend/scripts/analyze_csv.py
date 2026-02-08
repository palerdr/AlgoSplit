#!/usr/bin/env python3
"""
CSV Split Analyzer - CLI tool for analyzing workout splits from CSV/Excel files.

Usage:
    python analyze_csv.py input.csv [--output report.txt] [--stimulus-duration 48] [--maintenance 4]

CSV Format (any of these work):
    Session,Day,Exercise,Sets
    Push,1,Bench Press,4
    Push,1,Incline DB Press,3
    Pull,2,Lat Pulldown,4
    ...

Or Excel-style with headers:
    Session Name | Day | Exercise Name | Sets
    Push         | 1   | Bench Press   | 4
"""

import sys
import csv
import argparse
import json
from pathlib import Path
from collections import defaultdict

# Add parent directories to path
script_dir = Path(__file__).parent
backend_dir = script_dir.parent
project_dir = backend_dir.parent
sys.path.insert(0, str(project_dir))
sys.path.insert(0, str(backend_dir))

from backend.core.MainClasses import Split, MuscleRegion
from backend.core.movementMatching import move_match
from backend.core.granular_patterns import (
    GRANULAR_PATTERNS, get_pattern_muscle_targets,
    get_pattern_resistance_profile
)


def parse_csv(filepath: str) -> list:
    """
    Parse CSV file into split format.

    Returns list of (session_name, day, {exercise: sets}) tuples.
    """
    sessions = defaultdict(lambda: {'day': None, 'exercises': {}})

    with open(filepath, 'r', encoding='utf-8-sig') as f:
        # Try to detect delimiter
        sample = f.read(1024)
        f.seek(0)

        if '\t' in sample:
            delimiter = '\t'
        elif ';' in sample:
            delimiter = ';'
        else:
            delimiter = ','

        reader = csv.reader(f, delimiter=delimiter)
        headers = None

        for row in reader:
            if not row or all(cell.strip() == '' for cell in row):
                continue

            # Skip header row
            if headers is None:
                # Check if this looks like a header
                first_cell = row[0].lower().strip()
                if any(h in first_cell for h in ['session', 'day', 'name', 'workout']):
                    headers = [h.lower().strip() for h in row]
                    continue
                else:
                    # No header, assume: Session, Day, Exercise, Sets
                    headers = ['session', 'day', 'exercise', 'sets']

            # Parse row
            if len(row) < 4:
                continue

            try:
                session_name = row[0].strip()
                day = int(row[1].strip())
                exercise = row[2].strip()
                sets = int(row[3].strip())

                if session_name and exercise:
                    sessions[session_name]['day'] = day
                    sessions[session_name]['exercises'][exercise] = sets
            except (ValueError, IndexError):
                continue

    # Convert to list format
    result = []
    for session_name, data in sessions.items():
        if data['day'] is not None and data['exercises']:
            result.append((session_name, data['day'], data['exercises']))

    # Sort by day
    result.sort(key=lambda x: x[1])
    return result


def verify_exercises(days: list) -> dict:
    """
    Verify exercise recognition and show pattern mappings.
    """
    results = {
        'recognized': [],
        'unrecognized': [],
        'patterns_used': set()
    }

    for session_name, day, exercises in days:
        for exercise_name, sets in exercises.items():
            movement = move_match(exercise_name)

            if movement:
                pattern_key = movement.name.lower().replace(" ", "_").replace("-", "_")

                try:
                    tiered = get_pattern_muscle_targets(pattern_key)
                    profile = get_pattern_resistance_profile(pattern_key)

                    results['recognized'].append({
                        'exercise': exercise_name,
                        'pattern': pattern_key,
                        'sets': sets,
                        'prime': list(tiered.get('prime', {}).keys()),
                        'resistance_profile': profile,
                        'unilateral': movement.unilateral
                    })
                    results['patterns_used'].add(pattern_key)
                except KeyError:
                    results['recognized'].append({
                        'exercise': exercise_name,
                        'pattern': pattern_key,
                        'sets': sets,
                        'prime': list(movement.targets.keys())[:3],
                        'resistance_profile': 'mid',
                        'unilateral': movement.unilateral,
                        'legacy': True
                    })
            else:
                results['unrecognized'].append({
                    'exercise': exercise_name,
                    'sets': sets
                })

    results['patterns_used'] = list(results['patterns_used'])
    return results


def analyze_split(days: list, stimulus_duration: int = 48,
                  maintenance_volume: int = 4, dataset: str = 'average') -> Split:
    """
    Analyze the split and return Split object.
    """
    split = Split(
        name="CSV Import",
        days=days,
        stimulus_duration=stimulus_duration,
        maintenance_volume=maintenance_volume,
        dataset=dataset
    )
    split.simulate_split()
    return split


def format_report(split: Split, verification: dict) -> str:
    """
    Format comprehensive analysis report.
    """
    lines = []

    # Header
    lines.append("=" * 80)
    lines.append("SPLIT.AI ANALYSIS REPORT")
    lines.append("=" * 80)
    lines.append("")

    # Exercise verification
    lines.append("-" * 80)
    lines.append("EXERCISE RECOGNITION")
    lines.append("-" * 80)

    for ex in verification['recognized']:
        status = "[OK]" if not ex.get('legacy') else "[LEGACY]"
        uni = " (unilateral)" if ex.get('unilateral') else ""
        lines.append(f"{status} {ex['exercise']:30} -> {ex['pattern']}{uni}")
        lines.append(f"       Prime: {', '.join(ex['prime'][:3])}")

    if verification['unrecognized']:
        lines.append("")
        lines.append("UNRECOGNIZED EXERCISES:")
        for ex in verification['unrecognized']:
            lines.append(f"  [!] {ex['exercise']} ({ex['sets']} sets)")

    lines.append("")
    lines.append(f"Patterns used: {len(verification['patterns_used'])}")
    lines.append(f"Recognized: {len(verification['recognized'])}")
    lines.append(f"Unrecognized: {len(verification['unrecognized'])}")

    # Split report
    lines.append("")
    lines.append(split.get_report())

    # Top muscles
    lines.append("-" * 80)
    lines.append("TOP 10 MUSCLES BY NET STIMULUS")
    lines.append("-" * 80)

    stats = split.get_muscle_stats()[:10]
    for i, s in enumerate(stats, 1):
        lines.append(
            f"{i:2}. {s['display_name']:22} ({s['parent_group']:12}) "
            f"Net: {s['net']:5.2f}  Prime: {s['prime_sets']:2}  Sec: {s['secondary_sets']:2}"
        )

    # Undertrained regions
    lines.append("")
    lines.append("-" * 80)
    lines.append("UNDERTRAINED REGIONS (< 2.0 net stimulus)")
    lines.append("-" * 80)

    undertrained = [s for s in split.get_muscle_stats() if s['net'] < 2.0 and s['prime_sets'] > 0]
    if undertrained:
        for s in undertrained[:10]:
            lines.append(f"  {s['display_name']:22} Net: {s['net']:5.2f}")
    else:
        lines.append("  None - all trained muscles have adequate stimulus!")

    # Untrained regions
    untrained = [s for s in split.get_muscle_stats() if s['prime_sets'] == 0 and s['stimulus'] == 0]
    if untrained:
        lines.append("")
        lines.append("UNTRAINED REGIONS:")
        for s in untrained:
            lines.append(f"  {s['display_name']} ({s['parent_group']})")

    lines.append("")
    lines.append("=" * 80)

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Analyze workout split from CSV file",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
CSV Format:
    Session,Day,Exercise,Sets
    Push,1,Bench Press,4
    Push,1,Overhead Press,3
    Pull,2,Lat Pulldown,4
    ...

Example:
    python analyze_csv.py my_split.csv
    python analyze_csv.py my_split.csv --stimulus-duration 36 --maintenance 3
    python analyze_csv.py my_split.csv --output report.txt --json
        """
    )

    parser.add_argument('input', help="Input CSV file path")
    parser.add_argument('--output', '-o', help="Output file (default: stdout)")
    parser.add_argument('--stimulus-duration', '-s', type=int, default=48,
                        help="Stimulus duration in hours (default: 48)")
    parser.add_argument('--maintenance', '-m', type=int, default=4,
                        help="Maintenance volume sets (default: 4)")
    parser.add_argument('--dataset', '-d', choices=['schoenfeld', 'pelland', 'average'],
                        default='average', help="Fatigue curve dataset (default: average)")
    parser.add_argument('--json', '-j', action='store_true',
                        help="Output JSON instead of text report")
    parser.add_argument('--verify-only', '-v', action='store_true',
                        help="Only verify exercise recognition, don't analyze")

    args = parser.parse_args()

    # Check input file
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Parse CSV
    print(f"Parsing {args.input}...", file=sys.stderr)
    days = parse_csv(args.input)

    if not days:
        print("Error: No valid sessions found in CSV", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(days)} sessions", file=sys.stderr)

    # Verify exercises
    verification = verify_exercises(days)

    if args.verify_only:
        if args.json:
            print(json.dumps(verification, indent=2))
        else:
            print("\nEXERCISE VERIFICATION")
            print("=" * 60)
            for ex in verification['recognized']:
                print(f"[OK] {ex['exercise']} -> {ex['pattern']}")
            for ex in verification['unrecognized']:
                print(f"[!]  {ex['exercise']} (unrecognized)")
        sys.exit(0)

    # Analyze split
    print("Analyzing split...", file=sys.stderr)
    split = analyze_split(
        days,
        stimulus_duration=args.stimulus_duration,
        maintenance_volume=args.maintenance,
        dataset=args.dataset
    )

    # Generate output
    if args.json:
        output = {
            'verification': verification,
            'analysis': {
                'split_name': split.name,
                'cycle_length': split.cycle_length,
                'stimulus_duration': args.stimulus_duration,
                'maintenance_volume': args.maintenance,
                'dataset': args.dataset,
                'muscles': split.get_muscle_stats()
            }
        }
        result = json.dumps(output, indent=2)
    else:
        result = format_report(split, verification)

    # Output
    if args.output:
        with open(args.output, 'w') as f:
            f.write(result)
        print(f"Report written to {args.output}", file=sys.stderr)
    else:
        print(result)


if __name__ == '__main__':
    main()
