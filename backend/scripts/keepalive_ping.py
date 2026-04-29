"""
Periodic keepalive ping for the backend.

Set KEEPALIVE_URL to your deployed backend (e.g., https://api.example.com/keepalive)
Defaults to http://localhost:8000/keepalive
"""

import os
import sys
import urllib.request
import urllib.error


def main() -> int:
    url = os.getenv("KEEPALIVE_URL", "https://algosplit.onrender.com/keepalive")
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            print(f"keepalive: {resp.status} {url}")
        return 0
    except urllib.error.HTTPError as exc:
        print(f"keepalive failed: {exc.code} {exc.reason}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"keepalive error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
