import { getPerfTraces, type PerfTraceEntry } from './perfTrace';

/**
 * Dev-only perf dashboard utilities.
 * Formats collected perf traces into readable tables and computes summary stats.
 */

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface PerfSummaryEntry {
  name: string;
  count: number;
  median: number;
  p95: number;
  max: number;
  min: number;
}

/**
 * Returns median/p95/max/min for each unique trace name.
 */
export function getPerfSummary(): PerfSummaryEntry[] {
  const traces = getPerfTraces();
  const grouped = new Map<string, number[]>();

  for (const t of traces) {
    const arr = grouped.get(t.name);
    if (arr) {
      arr.push(t.durationMs);
    } else {
      grouped.set(t.name, [t.durationMs]);
    }
  }

  const result: PerfSummaryEntry[] = [];
  for (const [name, durations] of grouped) {
    const sorted = durations.slice().sort((a, b) => a - b);
    result.push({
      name,
      count: sorted.length,
      median: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted[sorted.length - 1],
      min: sorted[0],
    });
  }

  return result.sort((a, b) => b.p95 - a.p95);
}

/**
 * Formats all collected perf traces as a readable table string.
 */
export function dumpPerfTraces(): string {
  const traces = getPerfTraces();
  if (traces.length === 0) return '(no perf traces collected)';

  const header = `${pad('Name', 32)} ${pad('Duration', 12)} ${pad('Time', 24)} Metadata`;
  const sep = '-'.repeat(header.length);
  const rows = traces.map((t: PerfTraceEntry) => {
    const meta = t.metadata ? JSON.stringify(t.metadata) : '';
    return `${pad(t.name, 32)} ${pad(t.durationMs.toFixed(1) + 'ms', 12)} ${pad(t.timestampIso, 24)} ${meta}`;
  });

  return [sep, header, sep, ...rows, sep].join('\n');
}

/**
 * Formats the summary as a readable table string.
 */
export function formatPerfSummary(): string {
  const summary = getPerfSummary();
  if (summary.length === 0) return '(no perf traces collected)';

  const header = `${pad('Name', 32)} ${pad('Count', 8)} ${pad('Median', 12)} ${pad('P95', 12)} ${pad('Max', 12)} ${pad('Min', 12)}`;
  const sep = '-'.repeat(header.length);
  const rows = summary.map((s) =>
    `${pad(s.name, 32)} ${pad(String(s.count), 8)} ${pad(s.median.toFixed(1) + 'ms', 12)} ${pad(s.p95.toFixed(1) + 'ms', 12)} ${pad(s.max.toFixed(1) + 'ms', 12)} ${pad(s.min.toFixed(1) + 'ms', 12)}`
  );

  return [sep, header, sep, ...rows, sep].join('\n');
}
