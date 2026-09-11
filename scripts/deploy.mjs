#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = resolve(root, "contracts/makewhole.py");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: true });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  return r;
}

run("genlayer", ["network", "info"]);
console.log("--- setting studio-dev ---");
run("genlayer", ["network", "set", "studio-dev"]);
const feesPath = resolve(root, "scripts/fees.json");
const fees = existsSync(feesPath) ? readFileSync(feesPath, "utf8").trim() : "";
const feeValue = "100000000000010352";
const deployArgs = ["deploy", "--contract", contract];
if (fees) {
  deployArgs.push("--fees", fees, "--fee-value", feeValue);
}
const deployed = run("genlayer", deployArgs);
const blob = `${deployed.stdout || ""}\n${deployed.stderr || ""}`;
const match = blob.match(/0x[a-fA-F0-9]{40}/);
if (!match) {
  console.error("Could not parse contract address from deploy output.");
  process.exit(1);
}
const address = match[0];
console.log("Deployed", address);

const envLocal = resolve(root, "web/.env.local");
const lines = existsSync(envLocal) ? readFileSync(envLocal, "utf8").split(/\r?\n/) : [];
const next = [
  `NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`,
  "NEXT_PUBLIC_CHAIN_ID=61997",
  "NEXT_PUBLIC_STUDIO_RPC=https://studio-dev.genlayer.com/api",
  "NEXT_PUBLIC_STUDIO_EXPLORER=https://explorer-studio-dev.genlayer.com",
  "GENLAYER_STUDIO_URL=https://studio-dev.genlayer.com/api",
];
const kept = lines.filter((l) => l && !l.startsWith("NEXT_PUBLIC_") && !l.startsWith("GENLAYER_STUDIO_URL"));
writeFileSync(envLocal, [...next, ...kept, ""].join("\n"));
console.log("Wrote web/.env.local");
