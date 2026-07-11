"""Compare uncached Python and Rust analysis execution on a heavy split.

Run after installing the Maturin-built extension:
    python backend/scripts/benchmark_analysis_engines.py --iterations 100

This intentionally calls the internal analysis entry point without a user ID,
which bypasses the API cache and measures the engine path used by the API.
"""

from __future__ import annotations

import argparse
import os
import statistics
import sys
import time
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

# Importing the exercise matcher validates these settings even though the
# benchmark only uses built-in exercise patterns.
os.environ.setdefault("SUPABASE_URL", "https://benchmark.invalid")
os.environ.setdefault("SUPABASE_ANON_KEY", "benchmark-key")

from api.analysis_routes import _run_split_analysis  # noqa: E402
from schemas.models import ExerciseInput, SessionInput, SplitRequest  # noqa: E402


def _heavy_request() -> SplitRequest:
    return SplitRequest(
        name="Benchmark Heavy PPL",
        # A five-day cycle requires five simulated weeks to normalize against
        # a seven-day week, making this exercise the real compute hot path.
        cycle_length=5,
        stimulus_duration=48,
        maintenance_volume=3,
        dataset="average",
        include_breakdowns=True,
        sessions=[
            SessionInput(
                name="Push",
                day=1,
                exercises=[
                    ExerciseInput(name="Bench Press", sets=8),
                    ExerciseInput(name="Overhead Press", sets=6),
                    ExerciseInput(name="Lateral Raise", sets=8),
                ],
            ),
            SessionInput(
                name="Pull",
                day=2,
                exercises=[
                    ExerciseInput(name="Deadlift", sets=5),
                    ExerciseInput(name="Barbell Row", sets=8),
                    ExerciseInput(name="Pullups", sets=7),
                ],
            ),
            SessionInput(
                name="Legs",
                day=3,
                exercises=[
                    ExerciseInput(name="Squat", sets=8),
                    ExerciseInput(name="Romanian Deadlift", sets=6),
                    ExerciseInput(name="Leg Curl", sets=7),
                ],
            ),
            SessionInput(
                name="Upper",
                day=5,
                exercises=[
                    ExerciseInput(name="Single Arm Cable Row", sets=6),
                    ExerciseInput(name="Incline Bench Press", sets=7),
                    ExerciseInput(name="Lateral Raise", sets=6, unilateral=True),
                ],
            ),
        ],
    )


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, round((len(ordered) - 1) * percentile)))
    return ordered[index]


def _measure(engine: str, request: SplitRequest, iterations: int) -> list[float]:
    os.environ["ANALYSIS_ENGINE"] = engine
    os.environ["ANALYSIS_ENGINE_FALLBACK"] = "false"
    os.environ["ANALYSIS_SHADOW_SAMPLE_RATE"] = "0"

    # Warm module-level caches and JIT-free native loading before measuring.
    _run_split_analysis(request, user_id=None)
    samples = []
    for _ in range(iterations):
        start = time.perf_counter()
        _run_split_analysis(request, user_id=None)
        samples.append((time.perf_counter() - start) * 1000)
    return samples


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=100)
    args = parser.parse_args()
    if args.iterations < 5:
        parser.error("--iterations must be at least 5")

    request = _heavy_request()
    python_samples = _measure("python", request, args.iterations)
    rust_samples = _measure("rust", request, args.iterations)

    print("engine   mean_ms   p50_ms   p95_ms")
    for engine, samples in (("python", python_samples), ("rust", rust_samples)):
        print(
            f"{engine:<7} {statistics.mean(samples):>7.3f} "
            f"{_percentile(samples, 0.50):>8.3f} {_percentile(samples, 0.95):>8.3f}"
        )
    print(f"p95 speedup: {_percentile(python_samples, 0.95) / _percentile(rust_samples, 0.95):.2f}x")


if __name__ == "__main__":
    main()
