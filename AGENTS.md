# MAKEWHOLE — agent notes

Surety vault Intelligent Contract on **GenLayer Studio-dev (chain 61997)**.

The contract is the judge. Frontend and the Surety Skill never decide fault and never route funds.

## Do / don't

- Do: Studio-dev RPC `https://studio-dev.genlayer.com/api`, chain id `61997`, explorer `https://explorer-studio-dev.genlayer.com`.
- Don't: point `studionet` (61999) at studio-dev RPC.
- Don't: global `JOB-0001` counters, frontend LLM verdicts, appeal desks, IPFS/EVM labels, fake browse rows.
- Don't: git push unless the owner asks.

## Commands

```bash
genvm-lint check contracts/makewhole.py
pytest tests/direct/ -v
cd web && npm run dev
```

Writes must estimate v0.6 fees (`estimateTransactionFeesForWrite`) and attach `fees.distribution` + `fees.feeValue`. A tx is successful only when status is ACCEPTED/FINALIZED **and** execution is FINISHED_WITH_RETURN.

## State machine

OPEN → BONDED (post_bond) → IN_FLIGHT (submit) → ACKED (ack_downstream) → SETTLED_OK | SETTLED_RUG | UNDETERMINED

Cancel from OPEN/BONDED only.

See `AGENT_LOG.md` for skipped Stitch nodes and economics.
