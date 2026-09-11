# MAKEWHOLE

**On-chain surety vault so the next agent still gets paid.**

Makewhole is a 3-hop (Research → Write → Publish) surety vault on GenLayer. Client A escrows fees. Writer B posts a slashable GEN bond. If B rugs, the Intelligent Contract slashes B, refunds A’s unused write fee, and still pays Publisher C.

This is **not** a court, **not** Internet Court, **not** ERC-8183 escrow, **not** x402, **not** a P2P exchange. The contract is the only judge.

No Docker required. No private keys in the frontend.

## Current network status

Built for **Studio-dev 61997**. That host is **down** for Intelligent Contract compile/deploy (`invalid_contract runner malformed`). See [STUDIO_DEV_BLOCKED.md](STUDIO_DEV_BLOCKED.md).

| Network | Chain | RPC | Status |
|---------|-------|-----|--------|
| Studio-dev (product default) | 61997 `0xf22d` | `https://studio-dev.genlayer.com/api` | **Hello schema fails — runner malformed** |
| Studionet (labeled fallback only) | 61999 `0xf22f` | `https://studio.genlayer.com/api` | Hello schema works. Makewhole deploys **FINALIZED / UNKNOWN / NO_MAJORITY** — **no contract address** |

`NEXT_PUBLIC_CONTRACT_ADDRESS` is **empty**. That is legal. Localhost runs **demo mode**. Do not invent an address.

Explorer (studio-dev): https://explorer-studio-dev.genlayer.com  
Studionet explorer (if you ever get an address): https://explorer-studio.genlayer.com

## Methods

| Method | Kind | What it does |
|--------|------|----------------|
| `fund_pool()` | payable write | Underwriter adds GEN to the pool |
| `post_bond()` | payable write | Writer B locks slashable GEN (0 reverts) |
| `unbond()` | write | B withdraws unused bond if no open job |
| `create_job(brief_url, pay_b, pay_c, writer, publisher, hop_kind)` | payable write | A escrows `pay_b + pay_c + premium`. `hop_kind` is UI-only. Job id is SHA-256 |
| `submit` / `submit_hop` | write | B posts public HTTPS evidence |
| `ack_downstream` | write | C only, from IN_FLIGHT |
| `adjudicate` | write | Web + LLM → 3-field ruling → GEN moves. Ready state: **ACKED only** |
| `cancel` | write | Client only, OPEN/BONDED |
| `withdraw` | write | Pull credits if native EOA payout failed. Zero credit reverts |
| views | `get_job` `list_ids` `get_economics` `check_bond` `get_settlement` | Live storage |

## Economics

| Outcome | A | B | C | Pool |
|---------|---|---|---|------|
| **SETTLED_OK** (`fault=none`) | — | +pay_b | +pay_c | +premium. B rep unchanged |
| **SETTLED_RUG** (`fault=B`, `pay_downstream=true`, `slash_bps=10000`) | unused pay_b refunded | remaining bond slashed; rep − 1 (floor 0) | +pay_c from **bond first, pool second** | +premium + slash |
| **UNDETERMINED** | no GEN moves | | | |
| **CANCELED** | 100% escrow | bond stays | — | — |

If `fault=B` but `pay_downstream=false`: **UNDETERMINED**, no fourth product path.

If bond + pool cannot cover `pay_c` on a rug: **UNDETERMINED**, no GEN moved.

HTTPS URLs: trailing whitespace is stripped (accepted). Mixed-case `HTTPS://` hosts are accepted. Identical brief and deliverable URLs are still judged.

Equivalence compares **fault, pay_downstream, slash_bps only**. Markdown fences are stripped. Extra JSON keys are ignored.

## Public fixtures

Gist: https://gist.github.com/edwarderlick/2f257c8245678df54a30b4c319469f20

| File | Raw URL | Expected |
|------|---------|----------|
| brief.md | https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/brief.md | public HTTPS brief |
| good-write.md | https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/good-write.md | SETTLED_OK |
| rug-write.md | https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/rug-write.md | SETTLED_RUG, C still paid |

Local copies: `tests/fixtures/` (plus `empty.txt`, `html-captcha-stub.txt` for UNDETERMINED). Validators cannot read `D:\`.

## Demo in 15 minutes (localhost + MetaMask)

No Docker. No live contract required.

1. `cd web && npm run dev` → http://localhost:3000
2. Connect any EIP-1193 wallet. If the red banner shows, Switch Network to the chain in `.env` (default 61997).
3. `/` — hero + middle hop rug illustration.
4. `/how` — three fields; 8183 is a footnote only.
5. `/pipeline` — MODE **rug** → **Replay gist · DEMO** → SETTLED_RUG money line labeled `DEMO · NOT ON-CHAIN`.
6. Job detail — full reason + triad `B / true / 10000` + C still paid.
7. `/skill` — copy `check_bond` snippet. Empty address → `bonded: false`, `reason: NO_CONTRACT`.
8. `/vault` + `/economics` — honest zeros until an address is set.
9. `/browse` — empty feed is correct.

On-chain writes (fund / bond / create / …) open a confirm modal explaining the runner outage until `NEXT_PUBLIC_CONTRACT_ADDRESS` is set.

## Add a contract address later (one env var)

When Studio-dev can compile Hello (or you have a real Studionet address):

```
# web/.env.local
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=61997
NEXT_PUBLIC_STUDIO_RPC=https://studio-dev.genlayer.com/api
```

Restart `npm run dev`. Demo ledger hides. Live views take over. If the live net is Studionet, set `CHAIN_ID=61999` and the Studionet RPC; the banner will say so.

## Surety skill

```
skills/makewhole-surety/SKILL.md
skills/makewhole-surety/makewhole.py
skills/makewhole-surety/examples.md
```

Copy the folder. The skill **does not send GEN**.

```python
if not check_bond(job).bonded:
    raise SystemExit(1)
```

## Tests (no Docker)

```bash
genvm-lint check contracts/makewhole.py
pytest tests/direct -v
node scripts/smoke_fixtures.mjs
```

## Env

See `web/.env.example`. CORS proxy: `POST /api/genlayer` (works on Vercel serverless; no Docker).

## Vercel (human, after GitHub)

Do not deploy from this agent. Human pushes GitHub then Vercel. Checklist: [VERCEL.md](VERCEL.md).

1. Root Directory = web
2. Framework = Next.js
3. Env vars from web/.env.example
4. Do not put private keys in Vercel
5. After a real deploy, paste the address into NEXT_PUBLIC_CONTRACT_ADDRESS and redeploy

## Honest limitations

- Test GEN only. Studio-dev may reset; its runner registry is currently malformed.
- Evidence is public HTTPS only.
- No 8183 / x402 / 8004 / IPFS / keepers / multi-chain / appeal product.
- IC → EOA `emit_transfer` may fall back to credits + `withdraw()`.
- Bond may be `< pay_c`; rug payout uses pool as second source, or UNDETERMINED if both are short.
