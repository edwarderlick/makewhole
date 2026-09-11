"""Makewhole surety tools. Judgment and GEN movement live on the Intelligent Contract."""

from __future__ import annotations

import json
import os
import sys
from typing import Any

DEFAULT_RPC = "https://studio-dev.genlayer.com/api"
DEFAULT_CHAIN = 61997


def _contract() -> str | None:
    addr = (os.environ.get("MAKEWHOLE_CONTRACT") or os.environ.get("NEXT_PUBLIC_CONTRACT_ADDRESS") or "").strip()
    return addr or None


def _client():
    from genlayer_py import create_client
    from genlayer_py.chains import localnet

    rpc = os.environ.get("MAKEWHOLE_RPC", DEFAULT_RPC)
    try:
        from genlayer_py.chains import studio_devnet  # type: ignore

        chain = studio_devnet
    except Exception:
        chain = localnet
    return create_client(rpc_url=rpc, chain=chain)


def check_bond(job_id: str) -> dict[str, Any]:
    addr = _contract()
    if not addr:
        return {"bonded": False, "reason": "NO_CONTRACT", "pay_c": 0, "rep": 0, "state": ""}
    client = _client()
    result = client.read_contract(
        address=addr,
        function_name="check_bond",
        args=[job_id],
    )
    if not result.get("bonded"):
        print("check_bond: bonded=false — do not burn compute", file=sys.stderr)
    return result


def ack_hop(job_id: str, deliverable_url: str) -> Any:
    bond = check_bond(job_id)
    if not bond.get("bonded"):
        raise SystemExit(1)
    addr = _contract()
    if not addr:
        raise SystemExit(1)
    client = _client()
    return client.write_contract(
        address=addr,
        function_name="ack_downstream",
        args=[job_id, deliverable_url],
    )


def adjudicate(job_id: str) -> Any:
    bond = check_bond(job_id)
    if not bond.get("bonded") and bond.get("state") not in ("ACKED", "IN_FLIGHT"):
        raise SystemExit(1)
    addr = _contract()
    if not addr:
        raise SystemExit(1)
    client = _client()
    return client.write_contract(
        address=addr,
        function_name="adjudicate",
        args=[job_id],
    )


def get_settlement(job_id: str) -> dict[str, Any]:
    addr = _contract()
    if not addr:
        return {"fault": "", "pay_downstream": False, "slash_bps": 0, "paid_c": 0, "slashed_b": 0, "reason": "NO_CONTRACT"}
    client = _client()
    return client.read_contract(
        address=addr,
        function_name="get_settlement",
        args=[job_id],
    )


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    if cmd == "check_bond":
        print(json.dumps(check_bond(sys.argv[2]), indent=2, default=str))
    elif cmd == "ack_hop":
        print(json.dumps(ack_hop(sys.argv[2], sys.argv[3]), indent=2, default=str))
    elif cmd == "adjudicate":
        print(json.dumps(adjudicate(sys.argv[2]), indent=2, default=str))
    elif cmd == "get_settlement":
        print(json.dumps(get_settlement(sys.argv[2]), indent=2, default=str))
    else:
        print("usage: makewhole.py check_bond|ack_hop|adjudicate|get_settlement ...")
