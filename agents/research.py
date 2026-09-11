"""Optional demo worker: posts a public brief URL (gist or static host)."""

from __future__ import annotations

import os
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
BRIEF = ROOT / "tests" / "fixtures" / "brief.md"


def main() -> None:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        print("No GitHub token. Use the UI Replay gist path with a public HTTPS brief URL.")
        print(f"Local fixture: {BRIEF}")
        sys.exit(0)
    body = BRIEF.read_text(encoding="utf-8")
    req = urllib.request.Request(
        "https://api.github.com/gists",
        data=("{\"public\":true,\"files\":{\"brief.md\":{\"content\":%s}}}" % (repr(body),)).encode(),
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        print(resp.read().decode())


if __name__ == "__main__":
    main()
