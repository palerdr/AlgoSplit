# Migration Lanes: Python-to-TypeScript Analysis Transforms

Concrete plan for migrating server-computed transforms to the client.
Each lane represents one discrete migration step with validation.

---

## Lane 1: Group Summary Derivation (Lowest Risk)

**What it is**: The server currently computes `group_summaries[]` by grouping
`MuscleStats` by `parent_group` and summing `net_stimulus` and `primary_sets`.
This is a pure aggregation over data the server already sends in `muscles[]`.

**Python code it replaces**: `analysis_routes.py:309-321` (`_build_response`)
```python
by_group = defaultdict(list)
for data in muscle_data:
    by_group[data['parent_group']].append(data)
group_summaries = []
for group, items in sorted(by_group.items()):
    group_summaries.append(MuscleGroupSummary(
        group=group,
        total_net_stimulus=sum(d['net'] for d in items),
        total_sets=sum(d['sets'] for d in items),
        regions=[d['region_id'] for d in items]
    ))
```

**TS code that implements it**: `app/src/analysis/transforms.ts:computeGroupSummaries()`

**Validation plan**:
1. Import `validateParity` in the analysis query hook (dev builds only)
2. Call `validateParity(response)` after every `/analyze-split` response
3. Confirm zero mismatches across 50+ real user splits
4. Parity checker specifically validates `groupSummaries` field-by-field

**Migration steps**:
1. **Phase A** (this PR): TS function exists, parity checker compares against server
2. **Phase B**: Client components consume `computeGroupSummaries()` instead of `response.group_summaries`
3. **Phase C**: Server stops computing `group_summaries` (returns empty array or omits field)
4. **Phase D**: Remove `group_summaries` from `AnalysisResponse` schema

**Rollback plan**: Revert Phase B/C. Client falls back to server-provided `group_summaries`.
Since the field stays in the response schema until Phase D, rollback is trivial.

**Risk**: Very low. The logic is a deterministic GROUP BY over immutable server data.
Only floating-point rounding could cause drift, and the parity checker has epsilon tolerance.

**Estimated payload savings**: ~200-400 bytes per response (negligible, but proves the pattern).

---

## Lane 2: Suggestion Generation (Medium Risk)

**What it is**: The server generates `OptimizationSuggestion[]` by applying
threshold checks to each muscle's `net_stimulus`, `primary_sets`, `frequency`,
`atrophy`, and `stimulus` values. This is pure threshold logic over data
already present in `muscles[]`.

**Python code it replaces**: `analysis_routes.py:357-414` (`_generate_suggestions`)
```python
for data in muscle_data:
    # Under-stimulated: net < 1.0 and stimulus > 0
    # Low stimulus: net < 2.0 and stimulus > 0
    # Untrained: sets == 0 and stimulus == 0
    # Excessive volume: sets > 12
    # High atrophy: atrophy/stimulus > 0.4 and freq <= 1
```

**TS code that implements it**: `app/src/analysis/transforms.ts:computeSuggestions()`

**Validation plan**:
1. Parity checker compares server `suggestions[]` against `computeSuggestions()` output
2. Compare by `(muscle, issue)` key pairs and priority levels
3. Suggestion text uses the same `.toFixed()` formatting to ensure string equality
4. Run against 50+ real splits; accept when zero priority/count mismatches

**Migration steps**:
1. **Phase A** (this PR): TS function exists, parity checker validates
2. **Phase B**: Client uses `computeSuggestions()` output, ignores `response.suggestions`
3. **Phase C**: Server stops computing suggestions (returns empty array)
4. **Phase D**: Remove `suggestions` from `AnalysisResponse` schema

**Rollback plan**: Revert Phase B/C. Client reads `response.suggestions` again.
The server keeps computing until Phase D, so rollback is zero-risk.

**Risk**: Medium. The suggestion text includes formatted numbers (`.toFixed(2)`,
`.toFixed(1)`). Python and JS floating-point formatting can differ in edge cases.
The parity checker compares by `(muscle, issue)` keys and priority, not exact text.

**Estimated payload savings**: ~500-2000 bytes per response depending on split.

---

## Lane 3 (Future): Summary Stats Derivation

**Python code**: `analysis_routes.py:327-338`
**TS code**: `app/src/analysis/transforms.ts:computeSummaryStats()`
**Risk**: Low. Same pattern as Lane 1 (pure aggregation).
**Blocked by**: Lane 1 parity validation completing successfully.

---

## Lane 4 (Future): Stimulus Level as Shared Constant

The `computeStimulusLevel` thresholds exist only in TS today. If the server
ever needs to return stimulus levels directly (e.g. for push notifications),
the thresholds should be extracted to a shared contract rather than duplicated.

**Action**: Define thresholds in `CONTRACT.md`, keep single source of truth in TS.

---

## Migration Sequencing

```
Lane 1 (Group Summaries)  ──> Lane 3 (Summary Stats)
  └── validates pattern        └── same pattern, lower value

Lane 2 (Suggestions)      ──> Lane 4 (Stimulus Levels)
  └── validates text parity    └── formalize shared constants
```

All lanes share the same rollback pattern: client falls back to reading
the server-provided field, which continues to be computed until the
corresponding Phase D removes it from the schema.
