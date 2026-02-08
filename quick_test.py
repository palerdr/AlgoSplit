#!/usr/bin/env python3
"""
Quick Test Script - Weight Troubleshooting Tool for Split.AI

Usage:
    python quick_test.py                    # Run all tests
    python quick_test.py --exercise "Bench Press" --sets 4
    python quick_test.py --pattern humeral_adduction_compound
    python quick_test.py --muscle sternocostal
    python quick_test.py --compare "Bench Press" "Incline DB Press"
    python quick_test.py --list-patterns
    python quick_test.py --list-muscles
"""

import sys
import argparse
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from backend.core.MainClasses import Split, Session, MuscleRegion, marginals as MARGINAL_VALUES
from backend.core.movementMatching import move_match
from backend.core.muscle_regions import get_all_muscle_regions, get_muscle_region

MUSCLE_REGIONS = get_all_muscle_regions()
from backend.core.stimulus_tiers import TIER_BETA_VALUES
from backend.core.fatigue_modifiers import (
    AXIAL_LOAD_VALUES, CNS_FLOOR, CNS_CEILING, CNS_DECAY_RATE,
    BILATERAL_PENALTY, GlobalFatigueState, calculate_cns_fatigue
)
from backend.core.granular_patterns import (
    GRANULAR_PATTERNS, get_pattern, get_pattern_muscle_targets,
    get_pattern_axial_load, get_pattern_resistance_profile
)


def print_header(text: str):
    """Print a formatted header."""
    print("\n" + "=" * 70)
    print(f" {text}")
    print("=" * 70)


def print_subheader(text: str):
    """Print a formatted subheader."""
    print("\n" + "-" * 50)
    print(f" {text}")
    print("-" * 50)


def test_exercise_detailed(exercise_name: str, num_sets: int = 3, show_per_set: bool = True):
    """
    Test a single exercise with detailed breakdown of all modifiers.
    """
    print_header(f"EXERCISE ANALYSIS: {exercise_name}")

    # Step 1: Pattern matching
    movement = move_match(exercise_name)
    if not movement:
        print(f"ERROR: Could not match exercise '{exercise_name}'")
        return

    pattern_key = movement.name.lower().replace(" ", "_").replace("-", "_")
    print(f"\nPattern Match: {movement.name}")
    print(f"Pattern Key: {pattern_key}")
    print(f"Unilateral: {movement.unilateral}")

    # Step 2: Get pattern details
    try:
        targets = get_pattern_muscle_targets(pattern_key)
        axial_load = get_pattern_axial_load(pattern_key)
        resistance_profile = get_pattern_resistance_profile(pattern_key)
    except KeyError as e:
        print(f"ERROR: Pattern not found in granular_patterns: {e}")
        print("Using legacy targets from movementMatching.py")
        targets = {"prime": movement.targets, "secondary": {}, "tertiary": {}, "quaternary": {}}
        axial_load = 0.0
        resistance_profile = "mid"

    print(f"\nResistance Profile: {resistance_profile}")
    print(f"Axial Load: {axial_load}")

    # Step 3: Show tiered targets
    print_subheader("MUSCLE TARGETS BY TIER")
    for tier in ["prime", "secondary", "tertiary", "quaternary"]:
        tier_targets = targets.get(tier, {})
        if tier_targets:
            beta = TIER_BETA_VALUES.get(tier, 1.0)
            print(f"\n{tier.upper()} (beta={beta}):")
            for muscle, weight in tier_targets.items():
                try:
                    region = get_muscle_region(muscle)
                    leverage = region.leverage
                    damage = region.damage_tier
                    print(f"  {muscle:25} weight={weight:.2f}  leverage={leverage}  damage={damage}")
                except:
                    print(f"  {muscle:25} weight={weight:.2f}")

    # Step 4: Simulate sets with detailed breakdown
    if show_per_set:
        print_subheader(f"PER-SET STIMULUS BREAKDOWN ({num_sets} sets)")

        # Initialize fatigue state
        fatigue_state = GlobalFatigueState()
        bilateral = not movement.unilateral

        # Get marginal curve
        marginals = MARGINAL_VALUES.get("average", MARGINAL_VALUES["schoenfeld"])

        for set_num in range(num_sets):
            print(f"\n--- SET {set_num + 1} ---")

            # CNS modifier
            cns_mod = calculate_cns_fatigue(fatigue_state.total_sets, fatigue_state.axial_fatigue)

            # Bilateral modifier
            bi_mod = (1.0 - BILATERAL_PENALTY) if bilateral else (1.0 + BILATERAL_PENALTY)

            print(f"  Global Sets: {fatigue_state.total_sets}")
            print(f"  Axial Fatigue: {fatigue_state.axial_fatigue:.3f}")
            print(f"  CNS Modifier: {cns_mod:.4f}")
            print(f"  Bilateral Modifier: {bi_mod:.2f} ({'bilateral' if bilateral else 'unilateral'})")

            # Per-muscle stimulus
            print(f"\n  Muscle Stimulus:")
            for tier in ["prime", "secondary", "tertiary"]:
                tier_targets = targets.get(tier, {})
                beta = TIER_BETA_VALUES.get(tier, 1.0)

                for muscle, base_weight in tier_targets.items():
                    # Local diminishing returns (simplified)
                    marginal_idx = min(set_num, len(marginals) - 1)
                    local_mult = 1.0 - beta * (1.0 - marginals[marginal_idx])

                    # Final stimulus
                    final = base_weight * bi_mod * local_mult * cns_mod

                    print(f"    {muscle:22} {tier:10} base={base_weight:.2f} "
                          f"local={local_mult:.3f} final={final:.4f}")

            # Update fatigue state
            fatigue_state.total_sets += 1
            fatigue_state.axial_fatigue += axial_load * 0.15  # Per-set axial accumulation


def test_pattern(pattern_name: str):
    """Show detailed pattern information."""
    print_header(f"PATTERN: {pattern_name}")

    try:
        pattern = get_pattern(pattern_name)
    except KeyError:
        print(f"ERROR: Pattern '{pattern_name}' not found")
        print("\nAvailable patterns:")
        for key in sorted(GRANULAR_PATTERNS.keys())[:20]:
            print(f"  {key}")
        print("  ... (use --list-patterns for all)")
        return

    print(f"\nResistance Profile: {pattern.get('resistance_profile', 'mid')}")
    print(f"Axial Load: {pattern.get('axial_load', 0.0)}")
    print(f"Notes: {pattern.get('notes', 'N/A')}")

    print_subheader("MUSCLE WEIGHTS")
    total_weight = 0.0
    for tier in ["prime", "secondary", "tertiary", "quaternary"]:
        tier_data = pattern.get(tier, {})
        if tier_data:
            tier_total = sum(tier_data.values())
            total_weight += tier_total
            print(f"\n{tier.upper()} (total: {tier_total:.2f}):")
            for muscle, weight in tier_data.items():
                print(f"  {muscle:25} {weight:.2f}")

    print(f"\nTOTAL WEIGHT: {total_weight:.2f}")


def test_muscle(muscle_id: str):
    """Show detailed muscle region information."""
    print_header(f"MUSCLE REGION: {muscle_id}")

    try:
        region = get_muscle_region(muscle_id)
    except KeyError:
        print(f"ERROR: Muscle '{muscle_id}' not found")
        print("\nAvailable muscles:")
        for key in sorted(MUSCLE_REGIONS.keys())[:15]:
            print(f"  {key}")
        print("  ... (use --list-muscles for all)")
        return

    print(f"\nDisplay Name: {region.display_name}")
    print(f"Parent Group: {region.parent_group}")
    print(f"Leverage: {region.leverage}")
    print(f"Damage Tier: {region.damage_tier}")
    print(f"Recovery Modifier: {region.recovery_modifier}")
    print(f"Axial Fatigue Contributor: {region.axial_fatigue_contributor}")
    print(f"Notes: {region.notes}")

    # Find patterns that target this muscle
    print_subheader("PATTERNS TARGETING THIS MUSCLE")
    for pattern_name, pattern in GRANULAR_PATTERNS.items():
        for tier in ["prime", "secondary", "tertiary", "quaternary"]:
            if muscle_id in pattern.get(tier, {}):
                weight = pattern[tier][muscle_id]
                print(f"  {pattern_name:40} {tier:10} {weight:.2f}")


def compare_exercises(exercises: list):
    """Compare multiple exercises side by side."""
    print_header("EXERCISE COMPARISON")

    results = []
    for ex in exercises:
        movement = move_match(ex)
        if movement:
            pattern_key = movement.name.lower().replace(" ", "_").replace("-", "_")
            try:
                targets = get_pattern_muscle_targets(pattern_key)
                profile = get_pattern_resistance_profile(pattern_key)
                axial = get_pattern_axial_load(pattern_key)
            except:
                targets = {"prime": movement.targets}
                profile = "mid"
                axial = 0.0

            results.append({
                "name": ex,
                "pattern": pattern_key,
                "unilateral": movement.unilateral,
                "profile": profile,
                "axial": axial,
                "targets": targets
            })
        else:
            results.append({"name": ex, "error": "Not matched"})

    # Print comparison table
    print(f"\n{'Exercise':<25} {'Pattern':<35} {'Profile':<10} {'Axial':<6} {'Uni'}")
    print("-" * 90)
    for r in results:
        if "error" in r:
            print(f"{r['name']:<25} ERROR: {r['error']}")
        else:
            uni = "Yes" if r["unilateral"] else "No"
            print(f"{r['name']:<25} {r['pattern']:<35} {r['profile']:<10} {r['axial']:<6.2f} {uni}")

    # Compare prime targets
    print_subheader("PRIME TARGETS COMPARISON")
    all_primes = set()
    for r in results:
        if "targets" in r:
            all_primes.update(r["targets"].get("prime", {}).keys())

    print(f"\n{'Muscle':<25}", end="")
    for r in results:
        print(f"{r['name'][:15]:<17}", end="")
    print()
    print("-" * (25 + 17 * len(results)))

    for muscle in sorted(all_primes):
        print(f"{muscle:<25}", end="")
        for r in results:
            if "targets" in r:
                weight = r["targets"].get("prime", {}).get(muscle, 0.0)
                print(f"{weight:<17.2f}", end="")
            else:
                print(f"{'N/A':<17}", end="")
        print()


def list_patterns():
    """List all available patterns."""
    print_header("ALL PATTERNS")

    # Group by category
    categories = {}
    for name in sorted(GRANULAR_PATTERNS.keys()):
        # Determine category from name
        if "chest" in name or "humeral_adduction" in name:
            cat = "CHEST"
        elif "shoulder" in name or "vertical_press" in name:
            cat = "SHOULDERS"
        elif "pull" in name or "row" in name or "scapular" in name or "adduction" in name:
            cat = "BACK"
        elif "squat" in name or "lunge" in name:
            cat = "QUADS/GLUTES"
        elif "hinge" in name or "hip_extension" in name:
            cat = "POSTERIOR CHAIN"
        elif "knee" in name:
            cat = "LEGS (ISOLATION)"
        elif "elbow" in name or "wrist" in name:
            cat = "ARMS"
        elif "ankle" in name or "calf" in name:
            cat = "CALVES"
        elif "spinal" in name or "core" in name or "rotation" in name:
            cat = "CORE"
        else:
            cat = "OTHER"

        if cat not in categories:
            categories[cat] = []
        categories[cat].append(name)

    for cat in sorted(categories.keys()):
        print(f"\n{cat}:")
        for name in categories[cat]:
            pattern = GRANULAR_PATTERNS[name]
            primes = list(pattern.get("prime", {}).keys())
            print(f"  {name:<40} -> {', '.join(primes[:3])}")

    print(f"\nTotal patterns: {len(GRANULAR_PATTERNS)}")


def list_muscles():
    """List all muscle regions."""
    print_header("ALL MUSCLE REGIONS")

    # Group by parent
    by_parent = {}
    for muscle_id, data in MUSCLE_REGIONS.items():
        parent = data.parent_group
        if parent not in by_parent:
            by_parent[parent] = []
        by_parent[parent].append((muscle_id, data))

    for parent in sorted(by_parent.keys()):
        print(f"\n{parent.upper()}:")
        for muscle_id, data in by_parent[parent]:
            leverage = data.leverage
            damage = data.damage_tier
            display = data.display_name
            print(f"  {muscle_id:<25} {display:<20} L={leverage} D={damage}")

    print(f"\nTotal regions: {len(MUSCLE_REGIONS)}")


def run_quick_test():
    """Run a quick test with a sample split."""
    print_header("QUICK TEST - Sample Split Analysis")

    # Simple PPL split
    split = Split(
        name="Test PPL",
        days=[
            ("Push", 1, {
                "Bench Press": 3,
                "Incline DB Press": 3,
                "Lateral Raise": 3,
            }),
            ("Pull", 2, {
                "Lat Pulldown": 3,
                "Cable Row": 3,
                "Barbell Curl": 3,
            }),
            ("Legs", 3, {
                "Squat": 4,
                "Romanian Deadlift": 3,
                "Leg Curl": 3,
            }),
        ],
        stimulus_duration=48,
        maintenance_volume=4,
        dataset="average"
    )

    split.simulate_split()
    print(split.get_report())

    # Show key coefficients
    print_subheader("CURRENT COEFFICIENTS")
    print(f"\nTier Beta Values:")
    for tier, beta in TIER_BETA_VALUES.items():
        print(f"  {tier:<12} {beta}")

    print(f"\nCNS Fatigue:")
    print(f"  Floor: {CNS_FLOOR}")
    print(f"  Ceiling: {CNS_CEILING}")
    print(f"  Decay Rate: {CNS_DECAY_RATE}")

    print(f"\nBilateral Penalty: {BILATERAL_PENALTY * 100}%")

    print(f"\nAxial Load Values:")
    for pattern, load in sorted(AXIAL_LOAD_VALUES.items(), key=lambda x: -x[1])[:10]:
        print(f"  {pattern:<30} {load}")

    print(f"\nMarginal Curve (first 6 sets):")
    marginals = MARGINAL_VALUES.get("average", [])
    for i, m in enumerate(marginals[:6]):
        print(f"  Set {i+1}: {m:.2f}")


def main():
    parser = argparse.ArgumentParser(
        description="Split.AI Weight Troubleshooting Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument("--exercise", "-e", type=str,
                        help="Test specific exercise with detailed breakdown")
    parser.add_argument("--sets", "-s", type=int, default=3,
                        help="Number of sets for exercise test (default: 3)")
    parser.add_argument("--pattern", "-p", type=str,
                        help="Show pattern details")
    parser.add_argument("--muscle", "-m", type=str,
                        help="Show muscle region details")
    parser.add_argument("--compare", "-c", nargs="+",
                        help="Compare multiple exercises")
    parser.add_argument("--list-patterns", action="store_true",
                        help="List all patterns")
    parser.add_argument("--list-muscles", action="store_true",
                        help="List all muscle regions")

    args = parser.parse_args()

    if args.exercise:
        test_exercise_detailed(args.exercise, args.sets)
    elif args.pattern:
        test_pattern(args.pattern)
    elif args.muscle:
        test_muscle(args.muscle)
    elif args.compare:
        compare_exercises(args.compare)
    elif args.list_patterns:
        list_patterns()
    elif args.list_muscles:
        list_muscles()
    else:
        run_quick_test()


if __name__ == "__main__":
    main()
