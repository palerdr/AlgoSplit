/**
 * Dev-only parity checker for Python-to-TS analysis transform migration.
 *
 * Takes a server AnalysisResponse, runs the equivalent client-side
 * transforms, compares results, and logs mismatches.
 *
 * Usage (dev only):
 *   import { validateParity } from '../analysis/parity';
 *   if (__DEV__) validateParity(serverResponse);
 *
 * This module should NEVER be imported in production builds.
 * It exists solely to validate that TS transforms produce identical
 * output to the Python backend before migrating.
 */

import type {
  AnalysisResponse,
  MuscleGroupSummary,
  OptimizationSuggestion,
} from '../types/api.types';
import {
  computeGroupSummaries,
  computeSummaryStats,
  computeSuggestions,
  computeStimulusLevel,
} from './transforms';

// ── Configuration ───────────────────────────────────────────────

/** Tolerance for floating-point comparisons */
const EPSILON = 0.001;

/** Maximum mismatches to log before truncating (avoid log spam) */
const MAX_LOG_ENTRIES = 20;

// ── Types ───────────────────────────────────────────────────────

export interface ParityMismatch {
  transform: string;
  field: string;
  serverValue: unknown;
  clientValue: unknown;
  detail?: string;
}

export interface ParityResult {
  passed: boolean;
  mismatches: ParityMismatch[];
  transformsChecked: string[];
  timestamp: number;
}

// ── Helpers ─────────────────────────────────────────────────────

function floatEqual(a: number, b: number, eps = EPSILON): boolean {
  return Math.abs(a - b) <= eps;
}

function pushMismatch(
  mismatches: ParityMismatch[],
  transform: string,
  field: string,
  serverValue: unknown,
  clientValue: unknown,
  detail?: string,
): void {
  if (mismatches.length < MAX_LOG_ENTRIES) {
    mismatches.push({ transform, field, serverValue, clientValue, detail });
  }
}

// ── Group Summary Parity ────────────────────────────────────────

function checkGroupSummaries(
  server: MuscleGroupSummary[],
  response: AnalysisResponse,
  mismatches: ParityMismatch[],
): void {
  const client = computeGroupSummaries(response.muscles);

  // Build lookup by group name
  const serverByGroup = new Map<string, MuscleGroupSummary>();
  for (const g of server) serverByGroup.set(g.group, g);

  const clientByGroup = new Map<string, MuscleGroupSummary>();
  for (const g of client) clientByGroup.set(g.group, g);

  // Check for missing groups
  for (const group of serverByGroup.keys()) {
    if (!clientByGroup.has(group)) {
      pushMismatch(mismatches, 'groupSummaries', `missing_group`, group, null,
        `Server has group "${group}" but client does not`);
    }
  }
  for (const group of clientByGroup.keys()) {
    if (!serverByGroup.has(group)) {
      pushMismatch(mismatches, 'groupSummaries', `extra_group`, null, group,
        `Client produced group "${group}" not in server response`);
    }
  }

  // Compare matching groups
  for (const [group, serverGroup] of serverByGroup) {
    const clientGroup = clientByGroup.get(group);
    if (!clientGroup) continue;

    if (!floatEqual(serverGroup.total_net_stimulus, clientGroup.total_net_stimulus)) {
      pushMismatch(mismatches, 'groupSummaries', `${group}.total_net_stimulus`,
        serverGroup.total_net_stimulus, clientGroup.total_net_stimulus);
    }
    if (serverGroup.total_sets !== clientGroup.total_sets) {
      pushMismatch(mismatches, 'groupSummaries', `${group}.total_sets`,
        serverGroup.total_sets, clientGroup.total_sets);
    }

    // Check region membership
    const serverRegions = new Set(serverGroup.regions);
    const clientRegions = new Set(clientGroup.regions);
    for (const r of serverRegions) {
      if (!clientRegions.has(r)) {
        pushMismatch(mismatches, 'groupSummaries', `${group}.regions`,
          [...serverRegions], [...clientRegions],
          `Server has region "${r}" but client does not`);
        break; // One mismatch per group is enough
      }
    }
  }
}

// ── Summary Stats Parity ────────────────────────────────────────

function checkSummaryStats(
  response: AnalysisResponse,
  mismatches: ParityMismatch[],
): void {
  const server = response.summary;
  const client = computeSummaryStats(response.muscles);

  if (server.total_sets !== client.totalSets) {
    pushMismatch(mismatches, 'summaryStats', 'total_sets',
      server.total_sets, client.totalSets);
  }
  if (server.muscles_trained !== client.musclesTrained) {
    pushMismatch(mismatches, 'summaryStats', 'muscles_trained',
      server.muscles_trained, client.musclesTrained);
  }
  if (!floatEqual(server.avg_net_stimulus, client.avgNetStimulus)) {
    pushMismatch(mismatches, 'summaryStats', 'avg_net_stimulus',
      server.avg_net_stimulus, client.avgNetStimulus);
  }
  if (!floatEqual(server.avg_sets_per_muscle, client.avgSetsPerMuscle)) {
    pushMismatch(mismatches, 'summaryStats', 'avg_sets_per_muscle',
      server.avg_sets_per_muscle, client.avgSetsPerMuscle);
  }
}

// ── Stimulus Level Parity ───────────────────────────────────────

function checkStimulusLevels(
  response: AnalysisResponse,
  mismatches: ParityMismatch[],
): void {
  // Stimulus level is client-only, so we just verify it's deterministic
  // by checking the function is consistent with known thresholds.
  const testCases: [number, number][] = [
    [-1, 0], [0, 0], [0.25, 1], [0.5, 2], [0.99, 2],
    [1.0, 3], [1.74, 3], [1.75, 4], [2.49, 4], [2.5, 5],
    [3.24, 5], [3.25, 6], [3.99, 6], [4.0, 7], [10.0, 7],
  ];

  for (const [input, expected] of testCases) {
    const actual = computeStimulusLevel(input);
    if (actual !== expected) {
      pushMismatch(mismatches, 'stimulusLevel', `threshold(${input})`,
        expected, actual, 'Stimulus level function inconsistency');
    }
  }
}

// ── Suggestion Parity ───────────────────────────────────────────

function checkSuggestions(
  response: AnalysisResponse,
  mismatches: ParityMismatch[],
): void {
  const serverSuggestions = response.suggestions;
  const clientSuggestions = computeSuggestions(
    response.muscles,
    response.maintenance_volume,
  );

  // Compare counts first
  if (serverSuggestions.length !== clientSuggestions.length) {
    pushMismatch(mismatches, 'suggestions', 'count',
      serverSuggestions.length, clientSuggestions.length,
      'Different number of suggestions generated');
  }

  // Build lookup: (muscle, issue) -> suggestion for detailed comparison
  const serverByKey = new Map<string, OptimizationSuggestion>();
  for (const s of serverSuggestions) {
    serverByKey.set(`${s.muscle}::${s.issue}`, s);
  }
  const clientByKey = new Map<string, OptimizationSuggestion>();
  for (const s of clientSuggestions) {
    clientByKey.set(`${s.muscle}::${s.issue}`, s);
  }

  // Check for missing/extra
  for (const key of serverByKey.keys()) {
    if (!clientByKey.has(key)) {
      pushMismatch(mismatches, 'suggestions', `missing: ${key}`,
        serverByKey.get(key), null,
        'Server suggestion not reproduced by client');
    }
  }
  for (const key of clientByKey.keys()) {
    if (!serverByKey.has(key)) {
      pushMismatch(mismatches, 'suggestions', `extra: ${key}`,
        null, clientByKey.get(key),
        'Client produced suggestion not in server response');
    }
  }

  // Compare matching suggestions
  for (const [key, serverSug] of serverByKey) {
    const clientSug = clientByKey.get(key);
    if (!clientSug) continue;

    if (serverSug.priority !== clientSug.priority) {
      pushMismatch(mismatches, 'suggestions', `${key}.priority`,
        serverSug.priority, clientSug.priority);
    }
  }
}

// ── Main Entry Point ────────────────────────────────────────────

/**
 * Run all parity checks against a server AnalysisResponse.
 *
 * @param response - The full AnalysisResponse from the server
 * @returns ParityResult with pass/fail and detailed mismatches
 */
export function checkParity(response: AnalysisResponse): ParityResult {
  const mismatches: ParityMismatch[] = [];
  const transformsChecked: string[] = [];

  // 1. Group summaries
  if (response.group_summaries && response.group_summaries.length > 0) {
    checkGroupSummaries(response.group_summaries, response, mismatches);
    transformsChecked.push('groupSummaries');
  }

  // 2. Summary stats
  if (response.summary) {
    checkSummaryStats(response, mismatches);
    transformsChecked.push('summaryStats');
  }

  // 3. Stimulus level self-check
  checkStimulusLevels(response, mismatches);
  transformsChecked.push('stimulusLevel');

  // 4. Suggestions
  if (response.suggestions && response.muscles && response.muscles.length > 0) {
    checkSuggestions(response, mismatches);
    transformsChecked.push('suggestions');
  }

  return {
    passed: mismatches.length === 0,
    mismatches,
    transformsChecked,
    timestamp: Date.now(),
  };
}

/**
 * Run parity checks and log results to console.
 * Intended for dev-time validation only.
 *
 * @param response - The full AnalysisResponse from the server
 */
export function validateParity(response: AnalysisResponse): void {
  const result = checkParity(response);

  if (result.passed) {
    console.log(
      `[Parity] PASS - All ${result.transformsChecked.length} transforms match server output`,
    );
    return;
  }

  console.warn(
    `[Parity] FAIL - ${result.mismatches.length} mismatch(es) in transforms: ${result.transformsChecked.join(', ')}`,
  );
  for (const m of result.mismatches) {
    console.warn(
      `  [${m.transform}] ${m.field}: server=${JSON.stringify(m.serverValue)} client=${JSON.stringify(m.clientValue)}${m.detail ? ` (${m.detail})` : ''}`,
    );
  }
}
