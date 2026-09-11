#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brief = readFileSync(resolve(root, "tests/fixtures/brief.md"), "utf8");
const good = readFileSync(resolve(root, "tests/fixtures/good-write.md"), "utf8");
const rug = readFileSync(resolve(root, "tests/fixtures/rug-write.md"), "utf8");

if (!brief.includes("surety vault")) {
  console.error("brief fixture missing product language");
  process.exit(1);
}
if (!good.includes("next agent still gets paid")) {
  console.error("good fixture incomplete");
  process.exit(1);
}
if (!rug.includes("system_override")) {
  console.error("rug fixture missing override marker");
  process.exit(1);
}
console.log("fixtures ok");
console.log("Host these as public HTTPS (gist raw). Validators cannot read localhost or D:\\.");
