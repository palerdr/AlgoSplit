# Split.AI Data Flow: Session Processing

This document illustrates the complete data flow for a single training session
through the Split.AI stimulus calculation engine.

---

## Example Input

```python
Session: "Push Day 1"
Exercises: {
    "Bench Press": 4,
    "Incline DB Press": 3,
    "Lateral Raise": 3
}
```

---

## Stage 1: Exercise Classification

**File:** `movementMatching.py` -> `move_match()`

```
"Bench Press"
    |
    v
+-------------------------+
|   PATTERN MATCHER       |
|-------------------------|
| Tokenize: ["bench",     |
|            "press"]     |
|                         |
| Match Rules:            |
|   "bench" (35 pts)      |
|   "press" (25 pts)      |
|-------------------------|
| Winner: humeral_        |
|   adduction_compound    |
+-------------------------+
    |
    v
Movement(
    name="humeral_adduction_compound",
    targets={legacy...},
    unilateral=False
)
```

---

## Stage 2: Pattern Lookup

**File:** `granular_patterns.py` -> `get_pattern_muscle_targets()`

```
"humeral_adduction_compound"
    |
    v
+----------------------------------+
|   GRANULAR PATTERNS              |
|----------------------------------|
| prime: {                         |
|     "sternocostal": 0.70         |
| }                                |
| secondary: {                     |
|     "clavicular": 0.15,          |
|     "anterior_deltoid": 0.10    |
| }                                |
| tertiary: {                      |
|     "triceps_lateral_medial":    |
|          0.05                    |
| }                                |
| axial_load: 0.0                  |
+----------------------------------+
```

---

## Stage 3: Global Fatigue Initialization

**File:** `fatigue_modifiers.py` -> `GlobalFatigueState`

```
+----------------------------------+
|   SESSION START                  |
|----------------------------------|
| GlobalFatigueState {             |
|     axial_fatigue: 0.0           |
|     total_sets: 0                |
|     bilateral_compounds: 0       |
| }                                |
+----------------------------------+
```

---

## Stage 4: Per-Set Stimulus Calculation

**File:** `MainClasses.py` -> `MuscleRegion.apply_stimulus()`

For each set of "Bench Press" (4 sets):

```
SET 1: sternocostal (prime, weight=0.70)
    |
    +---> [1] RECOVERY CHECK
    |         hours_since_training: None (first session)
    |         penalty: 1.0 (no penalty)
    |
    +---> [2] BILATERAL MODIFIER
    |         is_bilateral: True
    |         modifier: 0.95 (5% reduction)
    |         0.70 × 0.95 = 0.665
    |
    +---> [3] LEVERAGE MATCHING
    |         muscle_leverage: M (sternocostal)
    |         resistance_profile: mid (bench press)
    |         multiplier: 1.0 (perfect match)
    |         0.665 × 1.0 = 0.665
    |
    +---> [4] LOCAL MULTIPLIER (Diminishing Returns)
    |         tier: prime
    |         set_this_session: 0
    |         marginal[0]: 1.00
    |         0.665 × 1.00 = 0.665
    |
    +---> [5] GLOBAL CNS FATIGUE
    |         global_sets: 1
    |         axial_fatigue: 0.0
    |         effective_sets: 1 + (0.0 × 2.5) = 1
    |         g(1) = 0.85 + 0.15 × e^(-0.06×1) = 0.991
    |         0.665 × 0.991 = 0.659
    |
    +---> FINAL STIMULUS: 0.659
          sternocostal.stimulus += 0.659
```

```
SET 2: sternocostal (prime, weight=0.70)
    |
    +---> [1] RECOVERY: 1.0
    +---> [2] BILATERAL: 0.70 × 0.95 = 0.665
    +---> [3] LEVERAGE: 0.665 × 1.0 = 0.665
    +---> [4] LOCAL (set 1): marginal[1] = 0.64
    |         0.665 × 0.64 = 0.426
    +---> [5] CNS (set 2): g(2) = 0.985
    |         0.426 × 0.985 = 0.419
    |
    +---> FINAL STIMULUS: 0.419
```

```
SET 3-4: Continue with decreasing marginals...
```

---

## Stage 5: Secondary/Tertiary Processing

Same exercise, different muscles, different tier penalties:

```
SET 1: anterior_deltoid (secondary, weight=0.10)
    |
    +---> [1-3] Same modifiers...
    |         0.10 × 0.95 × 1.0 = 0.095
    |
    +---> [4] LOCAL (secondary tier)
    |         beta = 0.55 (secondary tier softening)
    |         residuals: 0
    |         mk = marginal[0] = 1.00
    |         local_mult = 1.0 - 0.55 × (1.0 - 1.00) = 1.0
    |         0.095 × 1.0 = 0.095
    |
    +---> [5] CNS: 0.095 × 0.991 = 0.094
    |
    +---> FINAL STIMULUS: 0.094
          anterior_deltoid.stimulus += 0.094
```

---

## Stage 6: Axial Fatigue Accumulation

When processing "Romanian Deadlift" (axial_load=1.0):

```
BEFORE RDL:
    axial_fatigue: 0.0

AXIAL CONTRIBUTION:
    pattern: hinge_compound
    axial_load: 1.0
    sets: 3
    contribution = 1.0 × 3 × 0.15 = 0.45

AFTER RDL:
    axial_fatigue: 0.45

EFFECT ON SUBSEQUENT SETS:
    effective_sets = global_sets + (0.45 × 2.5)
    e.g., if global_sets = 20
    effective_sets = 20 + 1.125 = 21.125
    g(21) = 0.85 + 0.15 × e^(-0.06×21) = 0.892
```

---

## Stage 7: Session Complete

After all exercises in session:

```
+----------------------------------+
|   SESSION STATISTICS             |
|----------------------------------|
| total_sets: 35                   |
| axial_fatigue: 0.75              |
| bilateral_compounds: 4           |
|                                  |
| muscles_trained: [               |
|   sternocostal, clavicular,      |
|   anterior_deltoid, lateral_     |
|   deltoid, triceps_long_head,    |
|   triceps_lateral_medial         |
| ]                                |
|                                  |
| stimulus_by_muscle: {            |
|   sternocostal: 4.21,            |
|   lateral_deltoid: 2.85,         |
|   anterior_deltoid: 1.42,        |
|   ...                            |
| }                                |
+----------------------------------+
```

---

## Stage 8: Weekly Simulation

**File:** `MainClasses.py` -> `Split.simulate_split()`

```
WEEK SIMULATION (168 hours)
    |
    +---> Session 1 (Hour 0: Push)
    |         Execute all exercises
    |         Update muscle.last_trained_time = 0
    |
    +---> Session 2 (Hour 24: Pull)
    |         Check recovery for each muscle
    |         Execute exercises
    |
    +---> Session 3 (Hour 48: Legs)
    |         ...
    |
    +---> ATROPHY CALCULATION
    |     For each muscle:
    |         if last_trained_time < 168:
    |             hours_since = 168 - last_trained_time
    |             if hours_since > stimulus_duration (48h):
    |                 hours_in_atrophy = hours_since - 48
    |                 atrophy_rate = cumulative[3] / (168 - 48)
    |                 atrophy += atrophy_rate × hours_in_atrophy
    |
    +---> NET WEEKLY STIMULUS
          For each muscle:
              net = stimulus - atrophy
```

---

## Stage 9: Final Output

```python
MuscleStats(
    region_id="sternocostal",
    display_name="Mid-Lower Chest",
    parent_group="chest",

    stimulus=5.82,       # Raw weekly stimulus
    atrophy=0.71,        # Weekly atrophy
    net_stimulus=5.11,   # NET = stimulus - atrophy

    primary_sets=14,     # Sets as prime mover
    prime_sets=14,
    secondary_sets=6,    # Received secondary stimulus from presses
    tertiary_sets=0,

    frequency=2,         # Trained 2x/week
    leverage="M",        # Mid-range optimal
    damage_tier="-"      # Low damage tolerance (soft rec)
)
```

---

## Complete Modifier Chain Summary

```
FINAL_STIMULUS = base_weight
    × recovery_penalty      [0.0 - 1.0]  if < stimulus_duration
    × bilateral_modifier    [1.0 baseline or 1.05 unilateral]
    × leverage_redistribution [tier weight is redistributed, not multiplied away]
    × local_multiplier      [tier-specific diminishing returns]
    × global_cns_fatigue    [0.85 - 1.0]
```

---

## Key Files Reference

| Stage | File | Function |
|-------|------|----------|
| Exercise Classification | `movementMatching.py` | `move_match()` |
| Pattern Lookup | `granular_patterns.py` | `get_pattern_muscle_targets()` |
| Fatigue State | `fatigue_modifiers.py` | `GlobalFatigueState` |
| Stimulus Application | `MainClasses.py` | `MuscleRegion.apply_stimulus()` |
| Session Execution | `MainClasses.py` | `Session.execute()` |
| Weekly Simulation | `MainClasses.py` | `Split.simulate_split()` |
| Atrophy Calculation | `MainClasses.py` | `MuscleRegion.apply_atrophy()` |
