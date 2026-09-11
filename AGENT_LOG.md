# MAKEWHOLE — AGENT LOG

## 2026-09-09 — Inventory

Workspace `D:\makewhole` contained **only Stitch exports**. No app, contract, tests, or git repo.

| Path | Role | Size |
|------|------|------|
| `autonomous_surety_architecture/DESIGN.md` | Design tokens, type, grid, chips | 12 KB |
| `makewhole_landing_marketing_home/` | Marketing home (`/`) | HTML 46 KB |
| `makewhole_how_makewhole_works/` | How it works (`/how`) | HTML 37 KB |
| `makewhole_surety_skill/` | Skill page (`/skill`) | HTML 40 KB |
| `makewhole_create_job/` | Create wizard (`/create`) | HTML 36 KB |
| `makewhole_live_pipeline_demo/` | Pipeline demo (`/pipeline`) | HTML 40 KB |
| `makewhole_browse_jobs/` | Browse ledger (`/browse`) | HTML 46 KB |
| `makewhole_job_detail/` | Job detail (`/job/[id]`) | HTML 37 KB |
| `makewhole_my_vault/` | Vault (`/vault`) | HTML 42 KB |
| `makewhole_economics/` | Economics (`/economics`) | HTML 36 KB |
| `makewhole_network_switch_edge_states/` | Wrong-network / empty / error chrome (not a route) | HTML 39 KB |
| `makewhole_shared_confirm_modals/` | Confirm modals (shared, not a route) | HTML 41 KB |
| `image.png_1` … `image.png_4` | Logo / mark references, not routes | PNG |

Originals copied into `stitch/` and left untouched.

### Stitch nodes removed / not wired (hard blockers)

- Job Detail: “Consensus Finality: 12 of 12 GenLayer validators signed…” — vote theater. Deleted.
- Job Detail: “Appeal this ruling (Native GenLayer dispute channel)” — no appeal product in v1. Hidden.
- Landing HTML comment `mimicking Arlen cadence` — stripped; never shipped.
- Pipeline: “TARGET: IPFS / ARWEAVE”, “EVM Contract: 0x6199…” — evidence is public HTTPS; contract is GenLayer IC on 61997. Replaced with HTTPS / Studio-dev copy.
- Create: `IPFS_MIRROR` chip — removed.
- Network edge: “Allowed: … Arweave, IPFS HTTPS gateway” — copy is public HTTPS only.
- Browse mock rows, “100.0%” solvency, fake BAL 4,820.50 GEN, fake job hashes — live views only; empty feed is correct.
- Footer dead links (Zero-Knowledge Verifiers, Agent Registry, Yield Telemetry) — remain as non-navigating labels or omitted.
- Landing “60s hop timeout” if present — marked non-protocol / removed (Makewhole has no clocks).

### Product decisions

1. **IDs:** SHA-256 hex (`0x` + 64 chars) of creator, origin, datetime, value, brief_url, pay_b, pay_c, contract address, and an internal `salt_nonce` uniqueness salt. Salt is never shown as `JOB-0001`.
2. **create_job extra args:** `writer` and `publisher` Addresses. Spec listed `(brief_url, pay_b, pay_c)` only; A/B/C cannot be recovered without them. Logged as necessary for the 3-party vault.
3. **Bonded rule:** `create_job` → `BONDED` if `bonds[writer] > 0`, else `OPEN`. `post_bond` from writer flips any of their `OPEN` jobs to `BONDED`.
4. **Adjudicate ready state:** `ACKED` only (not `IN_FLIGHT`). Anyone may call `adjudicate` once ACKED.
5. **Ack:** publisher `C` only.
6. **Submit:** writer `B` only, from `OPEN` or `BONDED`. Requires `bonds[B] >= pay_c`.
7. **Cancel:** client only, `OPEN`/`BONDED` before submit. Full escrow refund. Bond stays with B.
8. **unbond():** added (tiny). Allowed only if B has no jobs in OPEN/BONDED/IN_FLIGHT/ACKED/UNDETERMINED.
9. **Rug premium:** stays in the pool (underwriter earned it covering C). Unused `pay_b` refunds to A.
10. **Rep:** first `post_bond` seeds `rep=1` if zero so rug UI can show 1→0. Floor 0.
11. **Equivalence:** custom validator reruns fetch+LLM; compares `fault`, `pay_downstream`, `slash_bps` only.
12. **Fetch fail (404/403/empty/CAPTCHA/5xx):** stored as `UNDETERMINED`, no GEN movement.
13. **Payouts:** `gl.get_contract_at(addr).emit_transfer(value=..., on="finalized")`. On exception, credit `credits[addr]` for `withdraw()`.
14. **Network:** Studio-dev chain 61997 only. Never studionet 61999.
15. **Toolchain:** CLI `genlayer@0.40.0-rc.3`, `genlayer-js` v2 RC, `studioDevnet`.

### Research sources

- Docs: Consensus v0.6 migration, value transfers, messages, transaction context, genlayer-js write+fees, networks.
- LicenseLock: payable escrow, `emit_transfer` via `gl.get_contract_at`, `run_nondet_unsafe`, CORS proxy `src/app/api/genlayer/route.ts`. **Did not copy** incrementing `claim-{n}` IDs.
- Provider-Court: `sender_address` (not `sender_account`), `emit_transfer(..., on="finalized")`, wallet chip / wrong-network patterns. **Did not copy** appeal engine.
- Agent-Reach: GitHub (`gh`) + docs via web fetch.

### Test / deploy notes

- Direct tests: **16 passed** (`py -3.12 -m pytest tests/direct/test_makewhole.py -v` from `D:\makewhole`). `gltest.config.yaml` must include `networks.default: localnet`.
- Fixtures hosted: gist `edwarderlick/2f257c8245678df54a30b4c319469f20` (`brief.md`, `good-write.md`, `rug-write.md`).
- Studio-dev `eth_chainId` = `0xf22d` (61997). Wallet add-chain uses that hex, not `0xf21d`.
- Faucet: `sim_fundAccount` is public on Studio-dev. Credits land only on the **EIP-55 checksum** `current_state.id`. Lowercase `0x9ce8…f0dd` stayed at 0 GEN while checksum `0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD` showed 500 GEN.
- Funded `coverlock-submitter` 500 GEN. CLI deploy without `--fees` reverts `FeeValueMustBeNonZero(1)` even with a balance. With `--fees` + `--fee-value 100000000000010352` the envelope is accepted/finalized.
- Deploy txs (all `FINISHED_WITH_ERROR`, result `invalid_contract runner malformed`):
  - Makewhole `1jb45aa8…`: `0xd7541bfcb0bd764ff40e81b0cf67e0b490d3758a296442df5139e560495953df` → would-be `0x0F1aB23F28E575d9A3FD16345Eff82a2a9de01B0`
  - Hello `py-genlayer:9b8kjyda…` + `# v0.3.0`: `0x461f1cf4be1e86747ac46a968cb32a57b43ea0030b694af19b1fe2cfce2a92d0`
  - Hello multiline `1zr6nqk…`: `0xfe19a98ae216523ce2f19e886b8ee313c686e92b6e383947be169792ed3b73fd`
- `gen_getContractSchemaForCode` loads `chain:0x0000…:d:q805cc3mbb7k055ay5hek4sg80r2s85yyftpzrpq7g50hy1cc45g` and errors the same way. Studio-dev GenVM v0.3.0-rc7 runner registry looks empty/malformed. **Not a Makewhole source bug** — official hello-world fails too.
- Redeploy after runners recover: `node scripts/deploy.mjs` (attaches v0.6 fees from `scripts/fees.json`). Then write address into `web/.env.local`.
- No git push. No GitHub remote created.

### 2026-09-10 — Studio-dev still blocked; labeled studionet fallback

Checklist run (no product rewrite).

1. First 5 lines of `contracts/makewhole.py` are the pinned Depends + blank + hashlib/json/re. First line is exactly `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.
2. CLI `0.40.0-rc.3`, genlayer-js `2.0.0-rc.1`. `genlayer network set studio-dev` → RPC `https://studio-dev.genlayer.com/api`, chain `61997`.
3. Studio-dev UI compile path (`gen_getContractSchemaForCode` on 15-line Hello `scripts/hello_studio.py`): **`invalid_contract runner malformed`**. Lint empty. Wrote `STUDIO_DEV_BLOCKED.md`. Stopped Makewhole deploy on 61997.
4. Optional Hello-only hash `9b8kjyda2ycxyq4ea6g4yfpnydxhd52gqba5rb8dw7krkh5mn9p0`: same runner malformed on Studio-dev.
5. **Labeled fallback — studionet 61999** (`https://studio.genlayer.com/api`, `eth_chainId` `0xf22f`). Same Hello **schema succeeds** (`greet` view, `set_name` write). Deploys:
   - no-fee `0x9d60f2d17dc1967d7567f7d2286a46b409480771ce4357c20da83e893202a5aa` → FINALIZED / UNDETERMINED / NO_MAJORITY (recipient consensusMain, no IC address)
   - with v0.6 fee envelope `0x3eb2e88275d8931e38de65328ecebd714037fc54a5a93aa7705f61f020677e0a` → same UNDETERMINED
   Studionet `sim_getFeeConfig` is `-32601` (gasless-era RPC). **Not mixed into the app.** `NEXT_PUBLIC_CONTRACT_ADDRESS` stays empty. App stays on 61997.
6. Restarted `npm run dev` in `web/`. No invented contract address.

### 2026-09-10 — Phase 2 empty-address ship

Probe:
- Studio-dev Hello schema: still `invalid_contract runner malformed`. Did not retry Makewhole on 61997.
- Studionet 61999 Makewhole deploys: `0xf844b783…` and fee retry `0x20e939e3…` both FINALIZED / UNKNOWN (NO_MAJORITY). **No address.** Empty-address mode is the success path for this phase.

App:
- Banner while address empty: `Studio-dev 61997 · runner registry down · demo mode · test GEN only`
- Pipeline Replay gist writes a sessionStorage ledger marked `DEMO · NOT ON-CHAIN`. Live writes open the shared confirm modal (no fake address).
- Skill `check_bond` with empty env → `{bonded:false, reason:NO_CONTRACT}`.
- Tests: **38 passed**. genvm-lint clean.
- `fault=B` + `pay_downstream=false` → UNDETERMINED. Bond may be `< pay_c`; pool covers or UNDETERMINED if both short.
- VERCEL.md written. No `vercel` run. No Docker. No git push.
- CLI switched back to studio-dev.

### 2026-09-10 � UI restore (Stitch visual, no product rewrite)

#### Diagnose (localhost unstyled)

1. `/` renders `web/src/app/page.tsx` via `web/src/app/layout.tsx`.
2. Layout imported `./globals.css` first. Fonts were next/font variables on `<html>` only � `body` had no `font-sans`, so a CSS miss fell back to browser serif.
3. `globals.css` had `@tailwind base/components/utilities` (Tailwind 3).
4. `tailwind.config.ts` content was `./src/**/*.{ts,tsx}`. Pages **did** have classNames (DESIGN.md tokens like `gap-pad-lg`, `font-headline-xl`). Not a dump of unclassed `<h1><p><a>`.
5. `postcss.config.mjs` pointed at tailwind + autoprefixer. `web/package.json` had tailwindcss 3.4.17.
6. **Root visual bug:** HTML linked `/_next/static/css/app/layout.css` (dev path) ? **404**. Production hashed CSS existed at `/_next/static/css/292ab64f�.css` and returned 200. Port 3000 was serving development flight HTML (`"b":"development"`) against a production `.next`. Nav smashed (`HowCreate JobPipeline�`), purple links, Times serif = CSS never applied.
7. Stitch source of truth: `stitch/makewhole_* /code.html`. Landing uses **standard** Tailwind (`space-x-8`, `max-w-7xl`, lime, dark footer `#0a0a0a`). Pipeline/app screens use DESIGN.md tokens (`gap-pad-lg`, `text-headline-xl`, `secondary-container`). CDN `cdn.tailwindcss.com` was **not** used in Next.

Installing Tailwind harder would not have helped until CSS actually loaded. Custom `fontFamily.headline-xl` existed but **fontSize.headline-xl** did not, so Stitch `text-headline-xl` was a no-op even with CSS.

#### Fix

- Clean `web/.next`, `npm run build`, `npx next start -p 3000`.
- Probe: home 200, CSS `/_next/static/css/c06b1aeb9f5b1607.css` **200**, prod HTML (not development), `space-x-8` + dark footer + 3-hop bypass in markup. Compiled CSS 37 KB includes `space-x-8`, `bg-black`, `max-w-7xl`, `font-headline-xl`, `text-headline-xl`, `bg-secondary-container`.
- Ported Stitch landing (long page), shared Shell (nav `space-x-8`, black Connect wallet, 61997 chip, `#0a0a0a` footer), pipeline three-column + lime bypass. Other routes: same Shell + PageHero + card chrome.
- Empty-address banner, DEMO � NOT ON-CHAIN, verdict triad, public evidence, Connect wallet, chain 61997 kept. No 12-of-12, no appeal, no Arlen, no IPFS/Arweave/EVM contract, no fake 1,420 GEN as live TVL. No payout/tests/skill/deploy changes. No Docker / git push / vercel.

#### Files changed (frontend only)

- `web/tailwind.config.ts`
- `web/src/app/globals.css`
- `web/src/app/layout.tsx`
- `web/src/app/page.tsx`
- `web/src/app/pipeline/page.tsx`
- `web/src/app/how/page.tsx`
- `web/src/app/create/page.tsx`
- `web/src/app/browse/page.tsx`
- `web/src/app/vault/page.tsx`
- `web/src/app/economics/page.tsx`
- `web/src/app/skill/page.tsx`
- `web/src/app/job/[id]/page.tsx`
- `web/src/components/AppShell.tsx`
- `web/src/components/PageHero.tsx` (new)
- `web/src/components/ConfirmModal.tsx`
- `web/src/components/TxButton.tsx`
- `AGENT_LOG.md`

### 2026-09-10 � Wallet connect (EIP-6963 + defined chain params)

MetaMask `TypeError: Cannot read properties of undefined (reading 'origin')` came from `eth.request` with missing `params` and from grabbing a random `window.ethereum` when several extensions are installed. `genlayer-js` `studioDevnet` also sets `blockExplorers: undefined` � never pass that viem object into `wallet_addEthereumChain`.

Fix:
- Discover wallets via EIP-6963 (+ `ethereum.providers` fallback).
- Connect modal lists each wallet; pick one provider only.
- Every `provider.request` sends `params` (at least `[]`).
- Switch/add uses flattened Studio-dev params. `61997` hex is `0xf22d` (not `0xf21d`, which is 61981).
- Assert origin + rpc + chainId before add. Reject (4001) sets an error, does not crash.
- Empty contract address still uses the no-IC write modal.

Files:
- `web/src/lib/network.ts`
- `web/src/lib/wallet.tsx`
- `web/src/lib/genlayer.ts`
- `web/src/components/ConfirmModal.tsx`
- `web/src/components/AppShell.tsx`
- `AGENT_LOG.md`

`npm run build` passed. No deploy.
