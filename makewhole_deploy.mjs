#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const fees = readFileSync("scripts/fees.json", "utf8").trim();
const feeValue = "100000000000010352";

const deployArgs = [
  "deploy",
  "--contract", "contracts/makewhole.py",
  "--fees", fees,
  "--fee-value", feeValue
];

console.log("Running genlayer", deployArgs);
const r = spawnSync("genlayer.cmd", deployArgs, { stdio: "inherit", shell: false });
process.exit(r.status);
