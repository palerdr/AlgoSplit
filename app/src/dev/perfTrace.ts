type PerfMetadata = Record<string, string | number | boolean | null | undefined>;

export interface PerfTraceEntry {
  name: string;
  durationMs: number;
  timestampIso: string;
  metadata?: PerfMetadata;
}

const GLOBAL_KEY = '__ALGOSPLIT_PERF_TRACES__';
const MAX_TRACE_ENTRIES = 300;

function perfNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function getTraceStore(): PerfTraceEntry[] {
  const root = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: PerfTraceEntry[];
  };

  if (!root[GLOBAL_KEY]) {
    root[GLOBAL_KEY] = [];
  }

  return root[GLOBAL_KEY];
}

function publishTrace(entry: PerfTraceEntry): void {
  const store = getTraceStore();
  store.push(entry);
  if (store.length > MAX_TRACE_ENTRIES) {
    store.splice(0, store.length - MAX_TRACE_ENTRIES);
  }

  if (__DEV__) {
    const metadata = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
    console.info(`[perf] ${entry.name} ${entry.durationMs.toFixed(1)}ms${metadata}`);
  }
}

export function startPerfSpan(name: string, metadata?: PerfMetadata): (extraMetadata?: PerfMetadata) => void {
  const startedAt = perfNow();
  return (extraMetadata?: PerfMetadata) => {
    const durationMs = perfNow() - startedAt;
    publishTrace({
      name,
      durationMs,
      timestampIso: new Date().toISOString(),
      metadata: {
        ...metadata,
        ...extraMetadata,
      },
    });
  };
}

export async function traceAsync<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: PerfMetadata,
): Promise<T> {
  const end = startPerfSpan(name, metadata);
  try {
    return await fn();
  } finally {
    end();
  }
}

export function traceSync<T>(name: string, fn: () => T, metadata?: PerfMetadata): T {
  const end = startPerfSpan(name, metadata);
  try {
    return fn();
  } finally {
    end();
  }
}

export function getPerfTraces(): PerfTraceEntry[] {
  return [...getTraceStore()];
}

export function clearPerfTraces(): void {
  const store = getTraceStore();
  store.splice(0, store.length);
}
