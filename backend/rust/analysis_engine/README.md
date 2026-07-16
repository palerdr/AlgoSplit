# analysis_engine_rs

Rust compute extension for `/api/analyze-split`. It is a required member of
the backend uv workspace and is built by Maturin during `uv sync`.

Install the complete locked backend environment from the repository root:

```powershell
uv sync --project backend --frozen --all-groups
uv run --project backend python -c "import analysis_engine_rs"
```

Runtime defaults to the Python engine. Enable Rust with:

```powershell
$env:ANALYSIS_ENGINE = "rust"
$env:ANALYSIS_ENGINE_FALLBACK = "true"
```

For a parity-first rollout, run Python as the authority and compare a sampled
Rust result without returning it to the client:

```powershell
$env:ANALYSIS_ENGINE = "shadow"
$env:ANALYSIS_SHADOW_SAMPLE_RATE = "0.01"
```

The API emits `analysis_engine_event` log records with engine durations and a
safe response-difference path (never the request payload or user ID). After
shadow parity has been established, set `ANALYSIS_ENGINE=rust`; keeping a
non-zero `ANALYSIS_SHADOW_SAMPLE_RATE` continues sampled reverse comparisons.

Run the uncached heavy-split benchmark after building the extension:

```powershell
python backend\scripts\benchmark_analysis_engines.py --iterations 100
```
