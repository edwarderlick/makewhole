"""Optional demo publisher: check_bond preflight then ack + adjudicate."""

from __future__ import annotations

import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "skills", "makewhole-surety"))

from makewhole import ack_hop, adjudicate, check_bond  # noqa: E402


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: publish.py <job_id> <publish_url>")
        raise SystemExit(2)
    job_id, url = sys.argv[1], sys.argv[2]
    info = check_bond(job_id)
    if not info.get("bonded"):
        raise SystemExit(1)
    print(ack_hop(job_id, url))
    print(adjudicate(job_id))


if __name__ == "__main__":
    main()
