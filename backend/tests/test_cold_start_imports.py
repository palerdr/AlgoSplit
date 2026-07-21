import os
import subprocess
import sys
from pathlib import Path


def test_main_import_defers_numpy_and_rust_analysis_modules():
    backend_dir = Path(__file__).resolve().parents[1]
    environment = {
        **os.environ,
        "SUPABASE_URL": "http://localhost:54321",
        "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_test-key",
        "SUPABASE_JWT_SECRET": "test-jwt-secret",
        "RATE_LIMIT_ENABLED": "false",
    }
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import sys; import main; "
                "assert 'core.MainClasses' not in sys.modules; "
                "assert 'core.rust_analysis' not in sys.modules; "
                "assert 'analysis_engine_rs' not in sys.modules"
            ),
        ],
        cwd=backend_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
