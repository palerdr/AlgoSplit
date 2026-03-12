# Analysis Pipeline Contract

Server-client boundary for the stimulus analysis pipeline.
Documents what the Python backend computes vs. what the TypeScript client derives.

## Server Response Shape (`AnalysisResponse`)

Returned by `POST /analyze-split` and `POST /analyze-workouts`.

```
AnalysisResponse {
  split_name: string              -- Echo of request name
  cycle_length: number            -- Days in one cycle (e.g. 7)
  stimulus_duration: number       -- Recovery window in hours (24-96)
  maintenance_volume: number      -- Baseline maintenance sets (1-9)
  dataset: 'schoenfeld'|'pelland'|'average' -- Empirical curve
  muscles: MuscleStats[]          -- Per-region stimulus data (sorted by net desc)
  group_summaries: MuscleGroupSummary[] -- Aggregated by parent_group
  suggestions: OptimizationSuggestion[] -- Server-generated recommendations
  summary: SummaryStats           -- Aggregate metrics
  session_breakdowns?: SessionBreakdown[] -- Optional per-exercise detail
}
```

### `MuscleStats` (per 29-region anatomical muscle)

| Field            | Type   | Semantic meaning |
|------------------|--------|------------------|
| `region_id`      | string | Canonical ID matching 3D model (e.g. `sternocostal`) |
| `display_name`   | string | Human-readable label (e.g. `Mid-Lower Chest`) |
| `parent_group`   | string | Muscle group (e.g. `chest`, `quads`, `lats`) |
| `stimulus`       | number | Raw weekly stimulus (before atrophy subtraction) |
| `atrophy`        | number | Estimated weekly atrophy from under-training |
| `net_stimulus`   | number | `stimulus - atrophy` -- the key metric |
| `primary_sets`   | number | Sets where this muscle was a prime mover |
| `prime_sets`     | number | Alias for primary_sets (prime tier) |
| `secondary_sets` | number | Sets as secondary mover |
| `tertiary_sets`  | number | Sets as tertiary mover |
| `frequency`      | number | Average weekly training sessions for this muscle |
| `leverage`       | `'S'`\|`'M'`\|`'L'` | Optimal force position (Short/Mid/Long) |
| `damage_tier`    | `'+'`\|`'0'`\|`'-'` | Volume tolerance recommendation |

### `MuscleGroupSummary`

| Field                | Type     | Semantic meaning |
|----------------------|----------|------------------|
| `group`              | string   | Parent group name |
| `total_net_stimulus` | number   | Sum of net_stimulus for all regions in group |
| `total_sets`         | number   | Sum of primary_sets for all regions in group |
| `regions`            | string[] | Region IDs belonging to this group |

### `SummaryStats`

| Field               | Type   | Semantic meaning |
|---------------------|--------|------------------|
| `total_sets`        | number | Sum of primary_sets across all muscles |
| `muscles_trained`   | number | Count of muscles with stimulus > 0 |
| `total_muscles`     | number | Total muscle regions (29) |
| `avg_net_stimulus`  | number | Mean net_stimulus of trained muscles |
| `avg_sets_per_muscle`| number | total_sets / muscles_trained |
| `group_summaries`   | MuscleGroupSummary[] | (optional duplicate for convenience) |

### `OptimizationSuggestion`

| Field      | Type   | Semantic meaning |
|------------|--------|------------------|
| `priority` | `'HIGH'`\|`'MEDIUM'`\|`'LOW'` | Urgency |
| `muscle`   | string | Display name of affected muscle |
| `issue`    | string | Problem category (e.g. "Under-stimulated") |
| `suggestion` | string | Actionable recommendation text |

### `SessionBreakdown` (when `include_breakdowns=true`)

| Field                      | Type   | Semantic meaning |
|----------------------------|--------|------------------|
| `session_name`             | string | Session display name |
| `day_number`               | number | Day within cycle |
| `exercises`                | ExerciseBreakdown[] | Per-exercise detail |
| `cumulative_sets`          | number | Total sets in this session |
| `cumulative_axial_fatigue` | number | Axial fatigue at session end |
| `final_cns_multiplier`     | number | CNS fatigue multiplier at session end |
| `consecutive_days`         | number | Consecutive training days count |
| `consecutive_day_penalty`  | number | MUR penalty from consecutive days |

## Client-Derived Transforms (what TS currently computes)

These transforms take the server `AnalysisResponse` and derive display data:

### 1. Stimulus Level Bucketing (`getStimulusLevel`)
- **Input**: `MuscleStats.net_stimulus` (number)
- **Output**: integer 0-7 (heat scale for 3D body model)
- **Logic**: Threshold-based bucketing:
  - `<= 0 -> 0`, `< 0.5 -> 1`, `< 1.0 -> 2`, `< 1.75 -> 3`,
  - `< 2.5 -> 4`, `< 3.25 -> 5`, `< 4.0 -> 6`, `>= 4.0 -> 7`
- **Location**: `app/src/lib/utils.ts:getStimulusLevel`
- **Consumers**: `analysisTransform.ts:musclesToStimulusLevels`, `regionColors.ts`, `buildBodyMeshes.ts`

### 2. Dashboard Dials (`computeDashboardDials`)
- **Input**: `AnalysisResponse`
- **Output**: `{ stimulus: 0-100, fatigue: 0-100, recovery: 0-100 }`
- **Logic**: Combines active-muscle average stimulus, workload density, coverage, and recovery reserve
- **Location**: `app/src/utils/analysisTransform.ts`

### 3. Insight Cards (`generateInsights`)
- **Input**: `AnalysisResponse`
- **Output**: Array of `{ title, description }` cards
- **Logic**: Derives muscle balance, volume, and top suggestion
- **Location**: `app/src/utils/analysisTransform.ts`

### 4. Region Color Mapping (`getRegionHex`)
- **Input**: `regionId`, `stimulusLevels` (Record<string, number>)
- **Output**: Hex color string
- **Logic**: Maps stimulus level 0-7 to heat palette with per-region variant
- **Location**: `app/src/components/3d/regionColors.ts`

## Server-Only Computations (KEEP SERVER)

These are computed by the Python engine and **must** remain server-side:

1. **Stimulus simulation** (`Split.simulate_split`) -- Multi-week simulation with diminishing returns curves
2. **Atrophy calculation** (`MuscleRegion.apply_atrophy`) -- Time-based decay
3. **Exercise-to-pattern matching** (`movementMatching.py`) -- NLP-like token matching with 500+ rules
4. **Fatigue modifiers** -- CNS fatigue, axial fatigue, consecutive day penalty
5. **Leverage redistribution** -- Cross-tier stimulus rebalancing based on resistance profiles
6. **Custom exercise resolution** (`exerciseMatching.py`) -- DB-backed user overrides

## Candidate Client-Side Transforms

These derive display-only data from the already-computed server response:

1. **Stimulus level bucketing** -- Pure threshold function (already client-side)
2. **Group summaries** -- `SUM(net_stimulus) GROUP BY parent_group` (server sends this, but client could derive)
3. **Dashboard dials** -- Already client-side
4. **Insight generation** -- Already client-side
5. **Suggestion generation** -- Currently server-side, but is pure threshold logic on muscle stats
