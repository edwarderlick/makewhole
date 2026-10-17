import { createClient } from "genlayer-js";
import { studioDevnet, studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  parseDeploymentArgs,
  checkReleaseSourceGate,
  validateFeeQuote,
  validateDeployReceipt,
  validateFreshContractState,
  updateEnvContent,
  atomicWriteFile,
  evaluatePreflightReadiness,
  formatDeploymentPlan,
  getPreflightExitCode,
} from "./deploy-helpers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractFile = resolve(root, "contracts/makewhole.py");
const envLocal = resolve(root, "web/.env.local");
const deploymentsDir = resolve(root, "deployments");

const HISTORICAL_V1_CONTRACT = "0x04A81C6B4AC43Ee9cea73B203d9Ed9ca0b89F0EF";

const SUPPORTED_CHAINS = {
  61997: {
    name: "GenLayer Studio Next",
    chain: studioDevnet,
    defaultRpcUrl: "https://studio-next.genlayer.com/api",
    defaultExplorerUrl: "https://explorer-studio-dev.genlayer.com",
  },
  61999: {
    name: "GenLayer Studionet",
    chain: studionet,
    defaultRpcUrl: "https://studio.genlayer.com/api",
    defaultExplorerUrl: "https://explorer.genlayer.com",
  },
};

function getGitReleaseStatus() {
  let headCommit = null;
  try {
    headCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    headCommit = null;
  }

  let committedCode = null;
  try {
    committedCode = execFileSync("git", ["show", "HEAD:contracts/makewhole.py"], { cwd: root, encoding: "utf8" });
  } catch {
    committedCode = null;
  }

  let porcelainStatus = "";
  try {
    const criticalFiles = [
      "contracts/makewhole.py",
      "scripts/deploy.mjs",
      "scripts/deploy-helpers.mjs",
      "package.json",
      "package-lock.json",
    ];
    porcelainStatus = execFileSync("git", ["status", "--porcelain", "--", ...criticalFiles], {
      cwd: root,
      encoding: "utf8",
    });
  } catch {
    porcelainStatus = "ERROR: Failed to run git status";
  }

  return { headCommit, committedCode, porcelainStatus };
}

function getSdkVersion() {
  try {
    const pkgPath = resolve(root, "node_modules/genlayer-js/package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      return pkg.version || "unknown";
    }
  } catch {
    // fallback
  }
  return "2.0.0-rc.1";
}

function getViemVersion() {
  try {
    const pkgPath = resolve(root, "node_modules/viem/package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      return pkg.version || "unknown";
    }
  } catch {
    // fallback
  }
  return "unknown";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function probeRpcEndpoint(rpcUrl, expectedChainId, timeoutMs = 8000) {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
    }
    const data = await res.json();
    if (!data || typeof data !== "object" || data.error) {
      const errMsg = data?.error?.message || (typeof data?.error === "string" ? data.error : "Malformed JSON-RPC response");
      return { ok: false, error: `RPC error: ${errMsg}` };
    }
    const hexChainId = data?.result;
    if (typeof hexChainId !== "string" && typeof hexChainId !== "number") {
      return { ok: false, error: `Malformed chainId in RPC response: ${JSON.stringify(hexChainId)}` };
    }
    const decChainId = typeof hexChainId === "number"
      ? hexChainId
      : (typeof hexChainId === "string" && hexChainId.startsWith("0x") ? parseInt(hexChainId, 16) : parseInt(hexChainId, 10));
    if (!Number.isSafeInteger(decChainId) || decChainId <= 0) {
      return { ok: false, error: `Invalid chainId parsed from RPC response: ${hexChainId}` };
    }
    return {
      ok: true,
      hexChainId: typeof hexChainId === "string" ? hexChainId : `0x${hexChainId.toString(16)}`,
      decChainId,
      matches: decChainId === expectedChainId,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function probeRpcEndpointWithRetry(rpcUrl, expectedChainId, maxAttempts = 3, timeoutMs = 8000) {
  let lastResult = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      console.log(`[RETRY ${attempt}/${maxAttempts}] Retrying RPC identity probe to ${rpcUrl}...`);
    }
    const res = await probeRpcEndpoint(rpcUrl, expectedChainId, timeoutMs);
    lastResult = res;
    if (res.ok && res.matches) {
      return res;
    }
    if (attempt < maxAttempts) {
      await sleep(1000);
    }
  }
  return lastResult;
}

async function probeHistoricalContract(client, v1Address) {
  try {
    const schema = await client.getContractSchema(v1Address);
    const methodCount = Object.keys(schema?.methods || {}).length;
    let jobCount = 0;
    try {
      const ids = await client.readContract({
        address: v1Address,
        functionName: "list_ids",
        args: [],
      });
      if (Array.isArray(ids)) {
        jobCount = ids.length;
      }
    } catch {
      // non-fatal view
    }
    return { ok: true, methodCount, jobCount };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function probeHistoricalContractWithRetry(client, v1Address, maxAttempts = 2) {
  let lastResult = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      console.log(`[RETRY ${attempt}/${maxAttempts}] Retrying historical v1 probe (${v1Address})...`);
    }
    const res = await probeHistoricalContract(client, v1Address);
    lastResult = res;
    if (res.ok) {
      return res;
    }
    if (attempt < maxAttempts) {
      await sleep(1000);
    }
  }
  return lastResult;
}

async function verifyDeployedContract(client, address) {
  const schema = await client.getContractSchema(address);
  const ids = await client.readContract({
    address,
    functionName: "list_ids",
    args: [],
  });
  const economics = await client.readContract({
    address,
    functionName: "get_economics",
    args: [],
  });
  validateFreshContractState({ schema, ids, economics });
}

async function main() {
  // 1. Strict CLI argument parsing
  let parsedArgs;
  try {
    parsedArgs = parseDeploymentArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`CLI Argument Error: ${err.message}`);
    process.exit(1);
  }

  const { mode, updateEnv } = parsedArgs;
  const isExecute = mode === "execute";
  const isDryRun = mode === "dry-run";

  // 2. Resolve Network & Chain Configuration
  const rawChainId = process.env.GENLAYER_CHAIN_ID || "61997";
  const chainId = parseInt(rawChainId, 10);
  const network = SUPPORTED_CHAINS[chainId];

  if (!network) {
    console.error(`Error: Unsupported GENLAYER_CHAIN_ID '${rawChainId}'.`);
    console.error(`Supported chain IDs: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`);
    process.exit(1);
  }

  const rpcUrl = process.env.GENLAYER_RPC_URL || network.defaultRpcUrl;
  const explorerUrl = process.env.GENLAYER_EXPLORER_URL || network.defaultExplorerUrl;

  // Enforce AGENTS.md rule: Don't point Studionet (61999) at studio-next RPC
  if (chainId === 61999 && rpcUrl.includes("studio-next")) {
    console.error("Error: Misconfigured network. Cannot point Studionet (chain 61999) at Studio Next RPC.");
    process.exit(1);
  }

  // 3. Inspect working contract source
  if (!existsSync(contractFile)) {
    console.error(`Error: Contract source not found at ${contractFile}`);
    process.exit(1);
  }
  const workingCode = readFileSync(contractFile, "utf8");

  // 4. Committed-source reproducibility check
  const gitStatus = getGitReleaseStatus();
  const gate = checkReleaseSourceGate({
    headCommit: gitStatus.headCommit,
    committedCode: gitStatus.committedCode,
    workingCode,
    porcelainStatus: gitStatus.porcelainStatus,
  });

  const sdkVersion = getSdkVersion();
  const viemVersion = getViemVersion();

  // Validate Private Key if executing
  let account = null;
  if (isExecute) {
    const rawKey = process.env.GENLAYER_PRIVATE_KEY;
    if (!rawKey) {
      console.error("Error: --execute requires the GENLAYER_PRIVATE_KEY environment variable.");
      console.error("No fallback key is permitted. Deployment aborted.");
      process.exit(1);
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(rawKey)) {
      console.error("Error: GENLAYER_PRIVATE_KEY is malformed (expected /^0x[0-9a-fA-F]{64}$/).");
      console.error("Never provide an insecure, short, or invalid key. Deployment aborted.");
      process.exit(1);
    }
    account = privateKeyToAccount(rawKey);
  } else if (process.env.GENLAYER_PRIVATE_KEY) {
    // Optional check in dry-run if configured
    if (/^0x[0-9a-fA-F]{64}$/.test(process.env.GENLAYER_PRIVATE_KEY)) {
      account = privateKeyToAccount(process.env.GENLAYER_PRIVATE_KEY);
    }
  }

  // DRY-RUN MODE
  if (isDryRun) {
    console.log("======================================================================");
    console.log("MAKEWHOLE v2 DEPLOYMENT PREFLIGHT (DRY-RUN)");
    console.log("======================================================================");
    console.log(`Execution Mode           : DRY-RUN (read-only, no write/deploy submitted)`);
    console.log(`Target Network           : ${network.name}`);
    console.log(`Chain ID                 : ${chainId}`);
    console.log(`RPC Endpoint             : ${rpcUrl}`);
    console.log(`Block Explorer           : ${explorerUrl}`);
    console.log(`Contract Source          : contracts/makewhole.py`);
    console.log(`Contract Code Size       : ${workingCode.length} bytes`);
    console.log(`Working Source SHA-256   : ${gate.workingSha}`);
    console.log(`Committed Source SHA-256 : ${gate.committedSha}`);
    console.log(`Source Commit            : ${gate.headCommit}`);
    console.log(`Release Source Gate      : ${gate.passed ? "PASS" : "BLOCKED"}`);
    console.log(`GenLayer SDK Version     : ${sdkVersion}`);
    console.log(`Viem Version             : ${viemVersion}`);
    if (account) {
      console.log(`Configured Deployer      : ${account.address}`);
    } else {
      console.log(`Configured Deployer      : [Not configured in environment - ordinary dry-run]`);
    }

    if (!gate.passed) {
      console.log("\n[RELEASE SOURCE GATE BLOCKED]");
      console.log("Real deployment is strictly prohibited until this release is committed:");
      gate.issues.forEach((issue) => console.log(`  - ${issue}`));
    }

    // Read-only RPC Probe (at most 3 attempts, bounded 8000ms timeout)
    console.log("\nProbing network connectivity...");
    const probeRes = await probeRpcEndpointWithRetry(rpcUrl, chainId, 3, 8000);
    const rpcProbePassed = Boolean(probeRes?.ok);
    const rpcChainMatched = Boolean(probeRes?.ok && probeRes?.matches);

    if (rpcProbePassed) {
      console.log(`[PASS] RPC probe to ${rpcUrl} succeeded.`);
      console.log(`       Reported chainId: ${probeRes.hexChainId} (${probeRes.decChainId})`);
      if (!rpcChainMatched) {
        console.error(`[FAIL] RPC chainId (${probeRes.decChainId}) does not match expected (${chainId})!`);
      }
    } else {
      console.error(`[FAIL] RPC probe to ${rpcUrl} failed: ${probeRes?.error || "Unknown error"}`);
    }

    // Historical v1 Contract Probe (at most 1 retry, informational / warning-only)
    let historicalV1Status = "SKIPPED";
    let v1ProbePassed = false;
    if (chainId === 61997) {
      console.log(`\nProbing historical v1 contract (${HISTORICAL_V1_CONTRACT})...`);
      const client = createClient({
        chain: network.chain,
        endpoint: rpcUrl,
      });
      const v1Probe = await probeHistoricalContractWithRetry(client, HISTORICAL_V1_CONTRACT, 2);
      if (v1Probe.ok) {
        v1ProbePassed = true;
        historicalV1Status = `REACHABLE: ${v1Probe.methodCount} methods, ${v1Probe.jobCount} jobs indexed`;
        console.log(`[PASS] Historical v1 contract reachable: ${v1Probe.methodCount} methods, ${v1Probe.jobCount} jobs indexed.`);
      } else {
        historicalV1Status = `UNREACHABLE (${v1Probe.error}) - informational only`;
        console.warn(`[WARN] Historical v1 contract probe failed: ${v1Probe.error}`);
      }
    }

    // Fee Estimation (Read-Only, at most 2 attempts)
    console.log("\nEstimating deployment transaction fees (read-only SDK call)...");
    const client = createClient({
      chain: network.chain,
      endpoint: rpcUrl,
    });
    const estParams = {
      code: workingCode,
      args: [],
      leaderOnly: false,
    };

    let feeEstimatePassed = false;
    let validatedFees = null;
    let feeEstimateError = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt > 1) {
        console.log(`[RETRY ${attempt}/2] Retrying fee estimation...`);
      }
      try {
        const raw = await client.estimateTransactionFees(estParams);
        const quoteData = raw?.fees ?? raw?.data?.fees ?? raw;
        validatedFees = validateFeeQuote(quoteData);
        feeEstimatePassed = true;
        break;
      } catch (e) {
        feeEstimateError = e.message;
        if (attempt < 2) {
          await sleep(1000);
        }
      }
    }

    if (feeEstimatePassed && validatedFees) {
      console.log("[PASS] Fee estimation succeeded.");
      console.log(`       Estimated Fee Value : ${validatedFees.feeValue.toString()} wei`);
      if (validatedFees.distribution) {
        const rotationsStr = Array.isArray(validatedFees.distribution.rotations)
          ? `[${validatedFees.distribution.rotations.map((r) => r.toString()).join(", ")}]`
          : String(validatedFees.distribution.rotations);
        console.log(`       Leader Allocation   : ${validatedFees.distribution.leaderTimeunitsAllocation}`);
        console.log(`       Validator Allocation: ${validatedFees.distribution.validatorTimeunitsAllocation}`);
        console.log(`       Rotations           : ${rotationsStr}`);
        console.log(`       Execution Budget    : ${validatedFees.distribution.executionBudgetPerRound}`);
      }
    } else {
      console.error(`[FAIL] Fee estimation failed: ${feeEstimateError}`);
    }

    // Evaluate overall readiness fail-closed across all required gates
    const readiness = evaluatePreflightReadiness({
      sourceGatePassed: gate.passed,
      rpcProbePassed,
      rpcChainMatched,
      feeEstimatePassed,
      historicalV1Passed: v1ProbePassed,
    });

    console.log(
      formatDeploymentPlan({
        readiness,
        networkName: network.name,
        chainId,
        rpcUrl,
        historicalV1Status,
      })
    );

    process.exitCode = getPreflightExitCode(readiness);
    return;
  }

  // EXECUTE MODE
  console.log("======================================================================");
  console.log("MAKEWHOLE v2 DEPLOYMENT EXECUTION");
  console.log("======================================================================");

  // 1. Release Source Gate Check
  if (!gate.passed) {
    console.error("Error: Release Source Gate BLOCKED. Cannot execute deployment:");
    gate.issues.forEach((issue) => console.error(`  - ${issue}`));
    console.error("Deployment aborted before broadcast.");
    process.exit(1);
  }

  // 2. Pre-broadcast receipt collision check
  const receiptFile = resolve(deploymentsDir, "makewhole-v2.json");
  if (existsSync(receiptFile)) {
    console.error(`Error: Deployment artifact ${receiptFile} already exists.`);
    console.error("Execution refused before broadcast to prevent overwriting existing receipt.");
    process.exit(1);
  }

  // 3. Enforce network identity via read-only eth_chainId probe
  console.log("Verifying network identity via read-only eth_chainId probe...");
  const probeRes = await probeRpcEndpoint(rpcUrl, chainId);
  if (!probeRes.ok) {
    console.error(`Error: RPC probe to ${rpcUrl} failed: ${probeRes.error}`);
    process.exit(1);
  }
  if (!probeRes.matches) {
    console.error(`Error: Chain ID mismatch. RPC returned ${probeRes.decChainId}, expected ${chainId}. Deployment aborted.`);
    process.exit(1);
  }

  // Print only chain ID, RPC hostname and deployer public address
  console.log(`Target Network   : ${network.name}`);
  console.log(`Chain ID         : ${chainId}`);
  console.log(`RPC Host         : ${new URL(rpcUrl).hostname}`);
  console.log(`Deployer Address : ${account.address}`);

  // Create client with authenticated deployer
  const client = createClient({
    chain: network.chain,
    account,
    endpoint: rpcUrl,
  });

  // 4. Fee estimation fail closed
  console.log("Estimating fees...");
  const estParams = {
    code: workingCode,
    args: [],
    leaderOnly: false,
  };

  let rawQuote;
  try {
    rawQuote = await client.estimateTransactionFees(estParams);
  } catch (e) {
    console.error("estimateTransactionFees failed:", e.message);
    process.exit(1);
  }

  const quoteData = rawQuote?.fees ?? rawQuote?.data?.fees ?? rawQuote;
  let validatedFees;
  try {
    validatedFees = validateFeeQuote(quoteData);
  } catch (e) {
    console.error("Fee estimation validation failed:", e.message);
    process.exit(1);
  }

  const feesObj = {
    distribution: validatedFees.distribution,
    feeValue: validatedFees.feeValue,
  };

  if (Array.isArray(validatedFees.messageAllocations) && validatedFees.messageAllocations.length > 0) {
    feesObj.messageAllocations = validatedFees.messageAllocations;
  }

  // 5. Broadcast deployment transaction
  console.log("Broadcasting deployment transaction...");
  const txHash = await client.deployContract({
    code: workingCode,
    args: [],
    leaderOnly: false,
    fees: feesObj,
  });

  console.log("Transaction broadcasted:", txHash);
  console.log("Waiting for transaction receipt (finalized)...");

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    waitUntil: "finalized",
    retries: 60,
  });

  // 6. Strict finalized receipt validation
  let contractAddress;
  try {
    contractAddress = validateDeployReceipt(receipt);
  } catch (e) {
    console.error("Receipt validation failed:", e.message);
    console.error("Receipt summary:", {
      status: receipt.statusName || receipt.status,
      executionResult: receipt.txExecutionResultName || receipt.executionResult,
      hash: txHash,
    });
    process.exit(1);
  }

  console.log(`\n[SUCCESS] Finalized contract deployed at address: ${contractAddress}`);
  console.log(`Deployment Tx: ${txHash}`);

  // 7. Verify deployed contract on-chain before recording success
  console.log("Verifying deployed contract on-chain before recording success...");
  try {
    await verifyDeployedContract(client, contractAddress);
    console.log("[PASS] Deployed contract verified: valid v2 schema, 0 initial jobs, all economics zeroed.");
  } catch (e) {
    console.error("Post-deployment contract verification failed:", e.message);
    console.error("Refusing to record receipt or update environment.");
    process.exit(1);
  }

  // 8. Atomic receipt creation
  const receiptArtifact = {
    project: "makewhole",
    version: "v2",
    chainId,
    networkName: network.name,
    rpcHost: new URL(rpcUrl).hostname,
    explorerBaseUrl: explorerUrl,
    contractAddress,
    deploymentTxHash: txHash,
    deployedAtUtc: new Date().toISOString(),
    sourceCommit: gitStatus.headCommit,
    contractSourceSha256: gate.workingSha,
    executionResult: receipt.txExecutionResultName,
    sdkVersion,
  };

  atomicWriteFile(receiptFile, JSON.stringify(receiptArtifact, null, 2) + "\n");
  console.log(`Wrote deployment receipt to: ${receiptFile}`);

  // 9. Surgical atomic environment update if requested
  if (updateEnv) {
    const existingEnv = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : "";
    const updatedEnv = updateEnvContent(existingEnv, {
      NEXT_PUBLIC_CONTRACT_ADDRESS: contractAddress,
      NEXT_PUBLIC_CHAIN_ID: chainId.toString(),
      NEXT_PUBLIC_STUDIO_RPC: rpcUrl,
      NEXT_PUBLIC_STUDIO_EXPLORER: explorerUrl,
      GENLAYER_STUDIO_URL: rpcUrl,
    });
    atomicWriteFile(envLocal, updatedEnv);
    console.log("Updated web/.env.local with new contract address.");
  } else {
    console.log("\n[INFO] --update-env was not passed. web/.env.local was NOT modified.");
    console.log("Suggested environment lines for manual update:");
    console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);
    console.log(`NEXT_PUBLIC_CHAIN_ID=${chainId}`);
    console.log(`NEXT_PUBLIC_STUDIO_RPC=${rpcUrl}`);
    console.log(`NEXT_PUBLIC_STUDIO_EXPLORER=${explorerUrl}`);
    console.log(`GENLAYER_STUDIO_URL=${rpcUrl}`);
  }
}

main().catch((err) => {
  console.error("Fatal deployment error:", err.message);
  process.exit(1);
});
