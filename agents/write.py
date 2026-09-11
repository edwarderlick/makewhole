"""Optional demo writer. MODE=good|rug selects the fixture body."""

from __future__ import annotations

import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODE = os.environ.get("MODE", "good")
PATH = ROOT / "tests" / "fixtures" / ("good-write.md" if MODE != "rug" else "rug-write.md")


def main() -> None:
    print(f"MODE={MODE}")
    print(PATH.read_text(encoding="utf-8"))
    print("Host this file as a public HTTPS URL, then call submit(job_id, url) as writer B.")
    sys.exit(0)


if __name__ == "__main__":
    main()
