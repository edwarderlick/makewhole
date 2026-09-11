# STUDIO-DEV BLOCKED

Date: 2026-09-10

Studio-dev (chain **61997**, RPC `https://studio-dev.genlayer.com/api`) cannot compile or deploy Intelligent Contracts. This is a **GenVM runner registry** failure, not a Makewhole product bug.

## Product file (untouched)

First 5 lines of `contracts/makewhole.py`:

```
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import hashlib
import json
import re
```

No `py-genlayer:test`, no `latest`, no line above the Depends comment.

## Toolchain (confirmed)

| Piece | Value |
|-------|--------|
| CLI | `genlayer 0.40.0-rc.3` |
| genlayer-js | `2.0.0-rc.1` (root + `web/`) |
| `genlayer network set studio-dev` | alias `studio-dev` |
| RPC | `https://studio-dev.genlayer.com/api` |
| chainId | `61997` (`0xf22d`) |
| consensusMain | `0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575` |

Do **not** point the studionet preset (61999) at this RPC.

## Hello via Studio-dev UI compile path

15-line Hello: `scripts/hello_studio.py` (same Depends hash as Makewhole).

Studio UI uses `sim_lintContract` then `gen_getContractSchemaForCode`.

| Call | Result |
|------|--------|
| `sim_lintContract` | empty / ok |
| `gen_getContractSchemaForCode` | **VM_ERROR `invalid_contract runner malformed`** |

GenVM log: `v0.3.0-rc7-x86_64-linux-release`, loads `chain:0x0000…:d:q805cc3mbb7k055ay5hek4sg80r2s85yyftpzrpq7g50hy1cc45g`, then malformed.

Optional Hello-only hash `py-genlayer:9b8kjyda2ycxyq4ea6g4yfpnydxhd52gqba5rb8dw7krkh5mn9p0` (`scripts/hello_studio_rc.py`): **same runner malformed**.

Paid deploys with Consensus v0.6 fee envelopes (`FeeValueMustBeNonZero` is solved; faucet `sim_fundAccount` works on EIP-55 checksum addresses) still finalize as `FINISHED_WITH_ERROR` with the same runner error.

## What this means

`NEXT_PUBLIC_CONTRACT_ADDRESS` stays empty. The frontend must not invent an address. Reads/writes that need the IC will fail until Studio-dev can schema a Hello.

Unblock check: paste `scripts/hello_studio.py` into https://studio-dev.genlayer.com and confirm methods appear. Then:

```
genlayer network set studio-dev
node scripts/deploy.mjs
```

## Fallback (labeled, not Studio-dev)

See `AGENT_LOG.md` for a **studionet 61999** Hello schema/deploy attempt. That is a different chain. Do not mix 61999 identity with the studio-dev RPC.
