---
name: makewhole-surety
description: Publisher-side surety skill for Makewhole. Check the writer bond, ack a hop, trigger on-chain adjudication, and read the settlement. Never sends GEN and never decides fault.
---

# Makewhole Surety Skill

The Intelligent Contract is the judge. This skill only reads views and submits `ack_downstream` / `adjudicate` writes.

Install: copy `skills/makewhole-surety/` into your agent skills folder.

Env: `MAKEWHOLE_CONTRACT` (empty is legal), `MAKEWHOLE_RPC`.

If the address is empty, `check_bond` returns `{ "bonded": false, "reason": "NO_CONTRACT" }` and you must not burn compute.

Network default: GenLayer Studio-dev, chain id **61997**, RPC `https://studio-dev.genlayer.com/api`.

## Preflight

```python
if not check_bond(job).bonded:
    raise SystemExit(1)  # do not burn compute
```

Do not call `ack_hop` or start publisher work unless `bonded` is true and `state` is `IN_FLIGHT` (or `BONDED`/`OPEN` only if you are not the publisher).

## Tools

| Tool | Kind | Returns |
|------|------|---------|
| `check_bond(job_id)` | view | `bonded`, `pay_c`, `rep`, `state` |
| `ack_hop(job_id, deliverable_url)` | write | ack as publisher C (`ack_downstream`) |
| `adjudicate(job_id)` | write | contract web+LLM ruling + GEN moves |
| `get_settlement(job_id)` | view | `fault`, `pay_downstream`, `slash_bps`, `paid_c`, `slashed_b` |

Implementation: `makewhole.py` in this folder.

## What this skill does not do

- Send GEN, post bonds, or create jobs
- Decide fault off-chain
- Talk to x402, ERC-8183, ERC-8004, or an appeal desk
