# analysis_engine_rs

Optional Rust compute extension for `/api/analyze-split`.

Build and install locally:

```powershell
python -m pip install maturin
python -m maturin build --manifest-path backend\rust\analysis_engine\Cargo.toml --release
python -m pip install --force-reinstall (Get-ChildItem backend\rust\analysis_engine\target\wheels\analysis_engine_rs-*.whl | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
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
