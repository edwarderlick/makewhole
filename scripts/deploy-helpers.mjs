import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync, renameSync, existsSync } from "node:fs";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ADDR_REGEX = /^0x[0-9a-fA-F]{40}$/;

export const TARGET_ENV_KEYS = [
  "NEXT_PUBLIC_CONTRACT_ADDRESS",
  "NEXT_PUBLIC_CHAIN_ID",
  "NEXT_PUBLIC_STUDIO_RPC",
  "NEXT_PUBLIC_STUDIO_EXPLORER",
  "GENLAYER_STUDIO_URL",
];

export const REQUIRED_V2_METHODS = [
  "list_ids",
  "get_economics",
  "get_bond",
  "get_reserved_bond",
  "get_available_bond",
  "check_bond",
  "get_settlement",
];

export const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export const CRITICAL_RELEASE_FILES = [
  "contracts/makewhole.py",
  "scripts/deploy.mjs",
  "scripts/deploy-helpers.mjs",
  "scripts/deploy-keychain.mjs",
  "package.json",
  "package-lock.json",
];

export const REQUIRED_ZERO_ECONOMICS = [
  "pool",
  "locked_bonds",
  "locked_jobs",
  "credits",
  "slash_count",
  "settled_ok",
  "settled_rug",
];

/**
 * Parses and strictly validates CLI arguments for scripts/deploy.mjs.
 * Only --dry-run, --execute, and --update-env are accepted.
 */
export function parseDeploymentArgs(argv) {
  const allowedFlags = new Set(["--dry-run", "--execute", "--update-env"]);
  for (const arg of argv) {
    if (!allowedFlags.has(arg)) {
      throw new Error(`Unknown argument '${arg}'. Allowed flags: --dry-run, --execute, --update-env.`);
    }
  }

  const hasDryRun = argv.includes("--dry-run");
  const hasExecute = argv.includes("--execute");
  const hasUpdateEnv = argv.includes("--update-env");

  if (hasDryRun && hasExecute) {
    throw new Error("Cannot combine --dry-run and --execute. Please choose one mode.");
  }

  if (hasUpdateEnv && !hasExecute) {
    throw new Error("--update-env can only be specified when --execute is active.");
  }

  return {
    mode: hasExecute ? "execute" : "dry-run",
    updateEnv: hasUpdateEnv,
  };
}

/**
 * Validates committed source state against working tree.
 */
export function checkReleaseSourceGate({ headCommit, committedCode, workingCode, porcelainStatus }) {
  const issues = [];

  if (!headCommit || typeof headCommit !== "string" || headCommit.trim().length === 0) {
    issues.push("HEAD commit could not be resolved.");
  }

  if (committedCode === null || committedCode === undefined) {
    issues.push("Committed contract (HEAD:contracts/makewhole.py) not found.");
  }

  const normalizeCode = (c) => (c || "").replace(/\r\n/g, "\n");
  const workingSha = createHash("sha256").update(normalizeCode(workingCode)).digest("hex");
  const committedSha =
    committedCode !== null && committedCode !== undefined
      ? createHash("sha256").update(normalizeCode(committedCode)).digest("hex")
      : "UNAVAILABLE";

  if (workingSha !== committedSha) {
    issues.push(`Working contract SHA-256 (${workingSha}) does not match committed HEAD SHA-256 (${committedSha}).`);
  }

  if (porcelainStatus && porcelainStatus.trim().length > 0) {
    issues.push(`Uncommitted changes detected in critical release files:\n${porcelainStatus.trim()}`);
  }

  return {
    passed: issues.length === 0,
    workingSha,
    committedSha,
    headCommit: headCommit || "UNAVAILABLE",
    issues,
  };
}

/**
 * Validates that an SDK fee quote is positive and structurally complete.
 * Fails closed without inventing fallbacks.
 */
export function validateFeeQuote(quote) {
  if (!quote || typeof quote !== "object") {
    throw new Error("Invalid fee quote: quote is not an object.");
  }

  const dist = quote.distribution;
  if (!dist || typeof dist !== "object") {
    throw new Error("Invalid fee quote: missing distribution object.");
  }

  if (
    dist.leaderTimeunitsAllocation === undefined ||
    dist.validatorTimeunitsAllocation === undefined ||
    dist.executionBudgetPerRound === undefined
  ) {
    throw new Error("Invalid fee quote: distribution missing required allocation fields.");
  }

  const rawFeeVal = quote.feeValue ?? quote.fee_value;
  if (rawFeeVal === undefined || rawFeeVal === null) {
    throw new Error("Invalid fee quote: missing feeValue.");
  }

  let feeValBigInt;
  try {
    feeValBigInt = BigInt(rawFeeVal);
  } catch {
    throw new Error("Invalid fee quote: feeValue is not a valid integer/bigint.");
  }

  if (feeValBigInt <= 0n) {
    throw new Error("Invalid fee quote: feeValue must be positive.");
  }

  return {
    feeValue: feeValBigInt,
    distribution: dist,
    messageAllocations: quote.messageAllocations,
  };
}

/**
 * Strictly validates a finalized transaction receipt from client.waitForTransactionReceipt.
 */
export function validateDeployReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") {
    throw new Error("Deployment receipt is missing or invalid.");
  }

  if (receipt.statusName !== "FINALIZED") {
    throw new Error(
      `Transaction status '${receipt.statusName}' is not FINALIZED. ACCEPTED or other non-final statuses are not permitted.`
    );
  }

  if (receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") {
    throw new Error(
      `Execution result '${receipt.txExecutionResultName}' is not FINISHED_WITH_RETURN. SUCCESS or other undocumented aliases are not permitted.`
    );
  }

  if (receipt.txDataDecoded?.type !== "deploy") {
    throw new Error(`Transaction decoded type '${receipt.txDataDecoded?.type}' is not 'deploy'.`);
  }

  const primaryAddress = receipt.txDataDecoded?.contractAddress;
  if (
    !primaryAddress ||
    typeof primaryAddress !== "string" ||
    !ADDR_REGEX.test(primaryAddress) ||
    primaryAddress.toLowerCase() === ZERO_ADDRESS
  ) {
    throw new Error(`Decoded contractAddress '${primaryAddress}' is not a valid nonzero 20-byte 0x address.`);
  }

  if (receipt.recipient) {
    if (typeof receipt.recipient !== "string" || receipt.recipient.toLowerCase() !== primaryAddress.toLowerCase()) {
      throw new Error(`Recipient '${receipt.recipient}' does not match decoded contractAddress '${primaryAddress}'.`);
    }
  }

  return primaryAddress;
}

/**
 * Validates that a fresh contract instance has the full v2 schema, zero jobs,
 * and zeroed economics accounting.
 */
export function validateFreshContractState({ schema, ids, economics }) {
  if (!schema || typeof schema !== "object" || !schema.methods) {
    throw new Error("Contract schema is missing or invalid.");
  }

  const availableMethods = new Set(Object.keys(schema.methods));
  for (const m of REQUIRED_V2_METHODS) {
    if (!availableMethods.has(m)) {
      throw new Error(`Contract schema missing required v2 method '${m}'.`);
    }
  }

  if (!Array.isArray(ids) || ids.length !== 0) {
    throw new Error(
      `Freshly deployed contract must have 0 jobs, found: ${Array.isArray(ids) ? ids.length : "invalid"}`
    );
  }

  if (!economics || typeof economics !== "object") {
    throw new Error("get_economics() did not return an object.");
  }

  for (const f of REQUIRED_ZERO_ECONOMICS) {
    const val = economics[f];
    if (val === undefined || val === null) {
      throw new Error(`get_economics() missing required field '${f}'.`);
    }
    const bn = BigInt(val);
    if (bn !== 0n) {
      throw new Error(`Freshly deployed contract get_economics().${f} must be 0, got ${val}`);
    }
  }

  return true;
}

/**
 * Surgically updates only the 5 target keys in an env file while preserving
 * comments, blank lines, ordering, and unrelated keys (including other NEXT_PUBLIC_* variables).
 */
export function updateEnvContent(existingContent, replacements) {
  const targetSet = new Set(TARGET_ENV_KEYS);
  const lines = existingContent ? existingContent.split(/\r?\n/) : [];
  const handledKeys = new Set();

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return line;
    }
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      return line;
    }
    const key = line.slice(0, eqIdx).trim();
    if (targetSet.has(key) && replacements[key] !== undefined) {
      handledKeys.add(key);
      return `${key}=${replacements[key]}`;
    }
    return line;
  });

  // Append any target keys that were not in the file
  for (const key of TARGET_ENV_KEYS) {
    if (!handledKeys.has(key) && replacements[key] !== undefined) {
      newLines.push(`${key}=${replacements[key]}`);
    }
  }

  return newLines.join("\n");
}

/**
 * Writes a file atomically via tempfile + renameSync.
 */
export function atomicWriteFile(filePath, content) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, filePath);
}

/**
 * Evaluates deployment preflight readiness based on 4 independent required gates:
 * 1. sourceGatePassed (committed source matches working copy and tree is clean)
 * 2. rpcProbePassed (target RPC reachable and responds to eth_chainId)
 * 3. rpcChainMatched (target RPC chain ID matches configured network chain ID)
 * 4. feeEstimatePassed (read-only fee estimation and quote validation succeeded)
 *
 * Historical v1 probe status is informational and does not block v2 deployment readiness.
 */
export function evaluatePreflightReadiness({
  sourceGatePassed = false,
  rpcProbePassed = false,
  rpcChainMatched = false,
  feeEstimatePassed = false,
  historicalV1Passed = true,
} = {}) {
  const blockers = [];

  if (!sourceGatePassed) {
    blockers.push("Release source gate check failed: working contract source does not match committed HEAD or repository is dirty.");
  }

  if (!rpcProbePassed) {
    blockers.push("Target network RPC probe failed or timed out.");
  }

  if (!rpcChainMatched) {
    blockers.push("Target network RPC chain ID does not match configured chain ID.");
  }

  if (!feeEstimatePassed) {
    blockers.push("Deployment transaction fee estimation failed or fee quote validation failed.");
  }

  return {
    ready: blockers.length === 0,
    blockers,
    historicalV1Passed: Boolean(historicalV1Passed),
  };
}

/**
 * Returns 0 if preflight readiness is READY, or 1 if BLOCKED.
 */
export function getPreflightExitCode(readiness) {
  return readiness && readiness.ready ? 0 : 1;
}

/**
 * Formats the final deployment plan banner for dry-run preflight.
 */
export function formatDeploymentPlan({
  readiness,
  networkName,
  chainId,
  rpcUrl,
  historicalV1Status,
}) {
  const lines = [];
  lines.push("\n----------------------------------------------------------------------");
  lines.push("DEPLOYMENT PLAN (READ-ONLY PREFLIGHT):");
  lines.push("1. Contract: Makewhole (v2 with 1:1 bond reservation and restitution economics)");
  lines.push(`2. Target Network: ${networkName} (${chainId})`);
  lines.push(`3. Target RPC: ${rpcUrl}`);
  lines.push("4. Status: READ-ONLY DRY-RUN COMPLETE. No contract was deployed.");
  lines.push("   No transaction was signed or submitted to any network.");
  if (historicalV1Status) {
    lines.push(`5. Historical v1 Status: ${historicalV1Status}`);
  }

  lines.push("");
  if (readiness && readiness.ready) {
    lines.push("Deployment Readiness: READY");
    lines.push("   To execute real deployment, an authorized operator must run:");
    lines.push("   GENLAYER_PRIVATE_KEY=0x... npm run deploy:execute [--update-env]");
  } else {
    lines.push("Deployment Readiness: BLOCKED");
    if (readiness && Array.isArray(readiness.blockers) && readiness.blockers.length > 0) {
      lines.push("   Blockers:");
      readiness.blockers.forEach((b) => lines.push(`   - ${b}`));
    }
    lines.push("");
    lines.push("   DO NOT RUN deploy:execute until every required readiness check passes.");
  }
  lines.push("----------------------------------------------------------------------\n");
  return lines.join("\n");
}

export const RECEIPT_FILENAME = "makewhole-v2.json";
export const PENDING_JOURNAL_FILENAME = "makewhole-v2.pending.json";
export const MAX_TARGET_DEPLOYER_BALANCE_GEN = 1n;
export const MAX_TARGET_DEPLOYER_BALANCE_WEI = 1_000_000_000_000_000_000n; // 1 GEN = 10^18 wei

/**
 * Validates that the deployer account balance is sufficient to cover the required deployment fee.
 * Expects balance and feeValue as bigint or non-negative decimal string/integers.
 */
export function validateDeployerBalance(balance, feeValue) {
  let bal;
  let fee;

  try {
    bal = typeof balance === "bigint" ? balance : BigInt(balance);
    fee = typeof feeValue === "bigint" ? feeValue : BigInt(feeValue);
  } catch {
    throw new Error("Invalid balance or feeValue: values must be valid integer amounts.");
  }

  if (bal < 0n || fee < 0n) {
    throw new Error("Invalid balance or feeValue: negative amounts are not permitted.");
  }

  if (bal < fee) {
    const deficit = fee - bal;
    const err = new Error(
      `Insufficient deployer balance: balance (${bal.toString()} wei) is less than required fee (${fee.toString()} wei). Deficit: ${deficit.toString()} wei.`
    );
    err.code = "INSUFFICIENT_BALANCE";
    err.balance = bal;
    err.feeValue = fee;
    err.deficit = deficit;
    throw err;
  }

  return {
    sufficient: true,
    balance: bal,
    feeValue: fee,
    remaining: bal - fee,
  };
}

/**
 * Validates that neither a final deployment receipt nor an interrupted pending journal exists.
 * Fails closed before any transaction is broadcast.
 */
export function assertNoDeploymentCollisions({ deploymentsDir, existsSyncFn = existsSync }) {
  const receiptFile = resolve(deploymentsDir, RECEIPT_FILENAME);
  const pendingFile = resolve(deploymentsDir, PENDING_JOURNAL_FILENAME);

  if (existsSyncFn(receiptFile)) {
    throw new Error(
      `Deployment artifact ${receiptFile} already exists. Execution refused to prevent duplicate deployment.`
    );
  }

  if (existsSyncFn(pendingFile)) {
    throw new Error(
      `Pending deployment journal ${pendingFile} already exists. An earlier deployment may be in flight or interrupted. DO NOT REDEPLOY. Inspect or resume the pending transaction first.`
    );
  }

  return { receiptFile, pendingFile };
}

/**
 * Creates the non-secret initial pending deployment intent object.
 */
export function createPendingJournalIntent({
  project = "makewhole",
  version = "v2",
  chainId,
  rpcHost,
  deployerAddress,
  sourceCommit,
  contractSourceSha256,
  createdAtUtc = new Date().toISOString(),
}) {
  if (!chainId || !rpcHost || !deployerAddress || !sourceCommit || !contractSourceSha256) {
    throw new Error("Missing required fields for pending journal intent.");
  }
  return {
    project,
    version,
    chainId,
    rpcHost,
    deployerAddress,
    sourceCommit,
    contractSourceSha256,
    createdAtUtc,
    status: "INTENT_CREATED",
  };
}

/**
 * Updates a pending intent to BROADCAST status with the deployment transaction hash.
 */
export function markPendingJournalBroadcast(pendingIntent, deploymentTxHash, broadcastAtUtc = new Date().toISOString()) {
  if (!pendingIntent || typeof pendingIntent !== "object") {
    throw new Error("Invalid pendingIntent: object required.");
  }
  if (pendingIntent.status !== "INTENT_CREATED") {
    throw new Error(`Cannot transition to BROADCAST from status '${pendingIntent.status}'.`);
  }
  if (!deploymentTxHash || typeof deploymentTxHash !== "string" || !TX_HASH_REGEX.test(deploymentTxHash)) {
    throw new Error(
      `Cannot transition to BROADCAST: invalid transaction hash '${deploymentTxHash}'. Must be an exact 32-byte 0x-prefixed hex string.`
    );
  }
  return {
    ...pendingIntent,
    status: "BROADCAST",
    deploymentTxHash,
    broadcastAtUtc,
  };
}

/**
 * Validates confirmation address against derived address.
 * Comparison is case-insensitive.
 */
export function validateConfirmAddress(confirmedAddr, derivedAddr) {
  if (!confirmedAddr || typeof confirmedAddr !== "string" || !ADDR_REGEX.test(confirmedAddr)) {
    throw new Error(`Invalid confirmation address '${confirmedAddr}'. Must be a valid 20-byte 0x address.`);
  }
  if (!derivedAddr || typeof derivedAddr !== "string" || !ADDR_REGEX.test(derivedAddr)) {
    throw new Error(`Invalid derived address '${derivedAddr}'.`);
  }
  if (confirmedAddr.toLowerCase() !== derivedAddr.toLowerCase()) {
    throw new Error(
      `Confirmation address mismatch: confirmed '${confirmedAddr}' does not equal derived '${derivedAddr}'.`
    );
  }
  return true;
}

/**
 * Calculates funding deficit to reach maxTargetGen (default 1 GEN).
 */
export function calculateFundingDeficit(currentBalanceWei, maxTargetGen = MAX_TARGET_DEPLOYER_BALANCE_GEN) {
  let cur;
  try {
    cur = typeof currentBalanceWei === "bigint" ? currentBalanceWei : BigInt(currentBalanceWei);
  } catch {
    throw new Error("Invalid currentBalanceWei: value must be a valid integer amount.");
  }

  if (cur < 0n) {
    throw new Error("Invalid currentBalanceWei: negative amounts are not permitted.");
  }

  const targetWei = BigInt(maxTargetGen) * 1_000_000_000_000_000_000n;
  if (cur >= targetWei) {
    return {
      targetWei,
      currentBalanceWei: cur,
      deficitWei: 0n,
      needsFunding: false,
    };
  }

  return {
    targetWei,
    currentBalanceWei: cur,
    deficitWei: targetWei - cur,
    needsFunding: true,
  };
}

/**
 * Ensures a keychain account can be created without overwriting an existing one.
 */
export function assertKeychainAccountCanBeCreated(existingPassword) {
  if (existingPassword !== null && existingPassword !== undefined && existingPassword !== "") {
    throw new Error("Keychain account already exists. Refusing to overwrite existing account.");
  }
  return true;
}
