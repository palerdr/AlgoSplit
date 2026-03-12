/**
 * Dev-only tool registration.
 * Exposes perf utilities on globalThis so they can be called from the browser console.
 *
 * Usage (in browser devtools console):
 *   __dumpPerf()   — prints a table of all collected perf traces
 *   __perfSummary() — prints median/p95/max statistics per trace name
 */

if (__DEV__) {
  // Lazy-import to avoid bundling in production
  const { dumpPerfTraces, formatPerfSummary } = require('./perfDashboard');

  (globalThis as Record<string, unknown>).__dumpPerf = () => {
    const output = dumpPerfTraces();
    console.log(output);
    return output;
  };

  (globalThis as Record<string, unknown>).__perfSummary = () => {
    const output = formatPerfSummary();
    console.log(output);
    return output;
  };
}
