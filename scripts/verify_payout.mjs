#!/usr/bin/env node
/**
 * Checks contract views, not UI text.
 * Usage: node scripts/verify_payout.mjs <job_id>
 */
import { createClient } from "genlayer-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv() {
  const p = resolve(root, "web/.env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const jobId = process.argv[2];
const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
if (!address) {
  console.error("NEXT_PUBLIC_CONTRACT_ADDRESS missing");
  process.exit(1);
}

const rpc = process.env.GENLAYER_STUDIO_URL || "https://studio-dev.genlayer.com/api";

async function main() {
  let chain;
  try {
    const chains = await import("genlayer-js/chains");
    chain = chains.studioDevnet || chains.studionet;
  } catch {
    chain = { id: 61997, rpcUrls: { default: { http: [rpc] } } };
  }
  const client = createClient({ chain, endpoint: rpc });
  const eco = await client.readContract({ address, functionName: "get_economics", args: [] });
  console.log("get_economics", eco);
  if (jobId) {
    const job = await client.readContract({ address, functionName: "get_job", args: [jobId] });
    const settle = await client.readContract({ address, functionName: "get_settlement", args: [jobId] });
    console.log("get_job.state", job.state);
    console.log("get_settlement", settle);
    if (!["SETTLED_OK", "SETTLED_RUG", "UNDETERMINED", "CANCELED", "ACKED", "IN_FLIGHT", "OPEN", "BONDED"].includes(job.state)) {
      process.exit(2);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
