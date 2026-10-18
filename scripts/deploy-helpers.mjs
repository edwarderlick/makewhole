import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync, renameSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

export const CANONICAL_CHAIN_ID = 61997;
export const CANONICAL_RPC = "https://studio-dev.genlayer.com/api";
export const CANONICAL_EXPLORER = "https://explorer-studio-dev.genlayer.com";
export const SDK_VERSION = "2.0.0-rc.1";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ADDR_REGEX = /^0x[0-9a-fA-F]{40}$/;

export const TARGET_ENV_KEYS = [
  "NEXT_PUBLIC_CONTRACT_ADDRESS",
  "NEXT_PUBLIC_CHAIN_ID",
  "NEXT_PUBLIC_STUDIO_RPC",
  "NEXT_PUBLIC_STUDIO_EXPLORER",
  "GENLAYER_STUDIO_URL",
];

export const DEFAULT_RELEASE = "v2";

export const DEPLOYMENT_RELEASES = Object.freeze({
  "v2": Object.freeze({
    release: "v2",
    version: "v2",
    receiptFilename: "makewhole-v2.json",
    pendingFilename: "makewhole-v2.pending.json",
  }),
  "v2.1": Object.freeze({
    release: "v2.1",
    version: "v2.1",
    receiptFilename: "makewhole-v2.1.json",
    pendingFilename: "makewhole-v2.1.pending.json",
  }),
});

export function resolveReleaseConfig(rawRelease) {
  if (rawRelease === undefined || rawRelease === null) {
    return DEPLOYMENT_RELEASES[DEFAULT_RELEASE];
  }
  if (typeof rawRelease !== "string") {
    throw new Error(`Invalid release: expected a string, got ${typeof rawRelease}.`);
  }
  const trimmed = rawRelease.trim();
  if (trimmed.length === 0) {
    throw new Error("Invalid release: release identifier cannot be empty.");
  }
  if (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    trimmed.startsWith(".") ||
    trimmed.includes(":")
  ) {
    throw new Error(`Invalid release '${rawRelease}': path traversal and absolute paths are prohibited.`);
  }
  const config = DEPLOYMENT_RELEASES[trimmed];
  if (!config) {
    throw new Error(
      `Unknown release '${rawRelease}'. Allowed releases: ${Object.keys(DEPLOYMENT_RELEASES).join(", ")}.`
    );
  }
  return config;
}

export const REQUIRED_V2_METHODS = [
  "ack_downstream",
  "adjudicate",
  "cancel",
  "check_bond",
  "create_job",
  "expire",
  "fund_pool",
  "get_available_bond",
  "get_balances",
  "get_bond",
  "get_credit",
  "get_economics",
  "get_job",
  "get_job_ids",
  "get_pool",
  "get_rep",
  "get_reserved_bond",
  "get_settlement",
  "list_ids",
  "post_bond",
  "submit",
  "submit_hop",
  "unbond",
  "withdraw",
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
 * Only --dry-run, --execute, --update-env, and --release are accepted.
 */
export function parseDeploymentArgs(argv) {
  let mode = null;
  let updateEnv = false;
  let rawRelease = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      if (mode === "execute") {
        throw new Error("Cannot combine --dry-run and --execute. Please choose one mode.");
      }
      mode = "dry-run";
    } else if (arg === "--execute") {
      if (mode === "dry-run") {
        throw new Error("Cannot combine --dry-run and --execute. Please choose one mode.");
      }
      mode = "execute";
    } else if (arg === "--update-env") {
      updateEnv = true;
    } else if (arg === "--release") {
      if (rawRelease !== null) {
        throw new Error("Duplicate --release argument specified.");
      }
      i++;
      if (i >= argv.length || !argv[i] || argv[i].startsWith("--")) {
        throw new Error("Missing value for --release argument.");
      }
      rawRelease = argv[i];
    } else if (arg.startsWith("--release=")) {
      if (rawRelease !== null) {
        throw new Error("Duplicate --release argument specified.");
      }
      const val = arg.slice("--release=".length);
      if (!val) {
        throw new Error("Missing value for --release argument.");
      }
      rawRelease = val;
    } else {
      throw new Error(`Unknown argument '${arg}'. Allowed flags: --dry-run, --execute, --update-env, --release.`);
    }
  }

  if (updateEnv && mode !== "execute") {
    throw new Error("--update-env can only be specified when --execute is active.");
  }

  const releaseConfig = resolveReleaseConfig(rawRelease || DEFAULT_RELEASE);

  return {
    mode: mode || "dry-run",
    updateEnv,
    release: releaseConfig.release,
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
 * Canonical receipt-normalization layer that supports both camelCase and snake_case representations.
 * Validates strictly:
 * - status must be exactly FINALIZED (rejects non-final, numeric, or SUCCESS)
 * - execution result must be exactly FINISHED_WITH_RETURN
 * - conflicting aliases fail closed
 * - decoded type must be exactly 'deploy'
 * - contract address must be a valid nonzero 20-byte 0x address
 * - recipient, when provided, must match contract address
 */
/**
 * Canonical receipt-normalization layer that supports both camelCase and snake_case representations.
 * Validates strictly:
 * - status must be exactly FINALIZED (rejects non-final, numeric, or SUCCESS)
 * - execution result must be exactly FINISHED_WITH_RETURN
 * - conflicting aliases fail closed
 * - decoded type must be exactly 'deploy' (numeric wire type 1 maps to deploy; other numbers/strings rejected)
 * - contract address must be a valid nonzero 20-byte 0x address
 * - all contract address representations must agree (data vs decoded objects)
 * - recipient, when provided, must match contract address
 * - receipt hash, when present, must match expectedTxHash
 * - receipt sender, when present, must match expectedDeployer
 */
export function normalizeDeployReceipt(receipt, { expectedTxHash = null, expectedDeployer = null } = {}) {
  if (!receipt || typeof receipt !== "object") {
    throw new Error("Deployment receipt is missing or invalid.");
  }

  // 1. Status normalization and conflict detection
  const hasStatusName = receipt.statusName !== undefined && receipt.statusName !== null;
  const hasStatus_name = receipt.status_name !== undefined && receipt.status_name !== null;

  if (hasStatusName && hasStatus_name && receipt.statusName !== receipt.status_name) {
    throw new Error(
      `Conflicting status fields in receipt: statusName '${receipt.statusName}' vs status_name '${receipt.status_name}'.`
    );
  }

  const rawStatus = hasStatusName ? receipt.statusName : hasStatus_name ? receipt.status_name : undefined;

  if (typeof rawStatus !== "string" || rawStatus !== "FINALIZED") {
    throw new Error(
      `Transaction status '${rawStatus}' is not FINALIZED. ACCEPTED or other non-final statuses are not permitted.`
    );
  }

  // 2. Execution result normalization and conflict detection
  const hasTxExecName = receipt.txExecutionResultName !== undefined && receipt.txExecutionResultName !== null;
  const hasTxExec_name = receipt.tx_execution_result_name !== undefined && receipt.tx_execution_result_name !== null;
  const hasExecResult = typeof receipt.executionResult === "string";
  const hasExec_result = typeof receipt.execution_result === "string";

  const execNames = [];
  if (hasTxExecName) execNames.push({ key: "txExecutionResultName", val: receipt.txExecutionResultName });
  if (hasTxExec_name) execNames.push({ key: "tx_execution_result_name", val: receipt.tx_execution_result_name });
  if (hasExecResult) execNames.push({ key: "executionResult", val: receipt.executionResult });
  if (hasExec_result) execNames.push({ key: "execution_result", val: receipt.execution_result });

  for (let i = 1; i < execNames.length; i++) {
    if (execNames[i].val !== execNames[0].val) {
      throw new Error(
        `Conflicting execution result fields in receipt: ${execNames[0].key} '${execNames[0].val}' vs ${execNames[i].key} '${execNames[i].val}'.`
      );
    }
  }

  const rawExec = execNames.length > 0 ? execNames[0].val : undefined;

  if (typeof rawExec !== "string" || rawExec !== "FINISHED_WITH_RETURN") {
    throw new Error(
      `Execution result '${rawExec}' is not FINISHED_WITH_RETURN. SUCCESS or other undocumented aliases are not permitted.`
    );
  }

  // 3. Transaction hash verification
  const hashSources = [];
  if (receipt.hash) hashSources.push({ key: "hash", val: receipt.hash });
  if (receipt.transactionHash) hashSources.push({ key: "transactionHash", val: receipt.transactionHash });
  if (receipt.transaction_hash) hashSources.push({ key: "transaction_hash", val: receipt.transaction_hash });

  if (expectedTxHash && hashSources.length === 0) {
    throw new Error(`Receipt missing required transaction hash (expected '${expectedTxHash}').`);
  }

  for (let i = 1; i < hashSources.length; i++) {
    if (hashSources[i].val.toLowerCase() !== hashSources[0].val.toLowerCase()) {
      throw new Error(
        `Conflicting transaction hash fields in receipt: ${hashSources[0].key} '${hashSources[0].val}' vs ${hashSources[i].key} '${hashSources[i].val}'.`
      );
    }
  }

  const resolvedTxHash = hashSources.length > 0 ? hashSources[0].val : null;
  if (resolvedTxHash) {
    if (!TX_HASH_REGEX.test(resolvedTxHash)) {
      throw new Error(`Receipt transaction hash '${resolvedTxHash}' is not a valid 32-byte hex string.`);
    }
    if (expectedTxHash && resolvedTxHash.toLowerCase() !== expectedTxHash.toLowerCase()) {
      throw new Error(
        `Receipt transaction hash '${resolvedTxHash}' does not match expected '${expectedTxHash}'.`
      );
    }
  }

  // 4. Sender / from address verification
  const senderSources = [];
  if (receipt.sender) senderSources.push({ key: "sender", val: receipt.sender });
  if (receipt.from) senderSources.push({ key: "from", val: receipt.from });
  if (receipt.from_address) senderSources.push({ key: "from_address", val: receipt.from_address });

  if (expectedDeployer && senderSources.length === 0) {
    throw new Error(`Receipt missing required sender (expected deployer '${expectedDeployer}').`);
  }

  for (let i = 1; i < senderSources.length; i++) {
    if (senderSources[i].val.toLowerCase() !== senderSources[0].val.toLowerCase()) {
      throw new Error(
        `Conflicting sender fields in receipt: ${senderSources[0].key} '${senderSources[0].val}' vs ${senderSources[i].key} '${senderSources[i].val}'.`
      );
    }
  }

  const resolvedSender = senderSources.length > 0 ? senderSources[0].val : null;
  if (resolvedSender) {
    if (!ADDR_REGEX.test(resolvedSender) || resolvedSender.toLowerCase() === ZERO_ADDRESS) {
      throw new Error(`Receipt sender '${resolvedSender}' is not a valid nonzero 20-byte address.`);
    }
    if (expectedDeployer && resolvedSender.toLowerCase() !== expectedDeployer.toLowerCase()) {
      throw new Error(
        `Receipt sender '${resolvedSender}' does not match expected deployer '${expectedDeployer}'.`
      );
    }
  }

  // 5. Type normalization: wire type 1 maps to deploy, string 'deploy' maps to deploy.
  // Reject any other numbers/strings.
  if (receipt.type !== undefined) {
    if (typeof receipt.type === "number") {
      if (receipt.type !== 1) {
        throw new Error(`Transaction type '${receipt.type}' is not deploy (only wire type 1 or 'deploy' is permitted).`);
      }
    } else if (typeof receipt.type === "string") {
      if (receipt.type !== "deploy") {
        throw new Error(`Transaction type '${receipt.type}' is not deploy.`);
      }
    } else {
      throw new Error("Invalid top-level type in receipt.");
    }
  }

  // Check nested types in txDataDecoded, tx_data_decoded, data
  const checkNestedType = (obj, name) => {
    if (!obj || typeof obj !== "object") return;
    if (obj.type !== undefined) {
      if (typeof obj.type === "number") {
        if (obj.type !== 1) {
          throw new Error(`${name} type '${obj.type}' is not deploy (Transaction decoded type '${obj.type}' is not 'deploy').`);
        }
      } else if (typeof obj.type === "string") {
        if (obj.type !== "deploy") {
          throw new Error(`${name} type '${obj.type}' is not deploy (Transaction decoded type '${obj.type}' is not 'deploy').`);
        }
      } else {
        throw new Error(`Invalid type in ${name}.`);
      }
    }
  };

  checkNestedType(receipt.txDataDecoded, "txDataDecoded");
  checkNestedType(receipt.tx_data_decoded, "tx_data_decoded");
  checkNestedType(receipt.data, "data");

  // Require at least one representation indicating deploy
  const hasTypeIndicator =
    receipt.type === 1 ||
    receipt.type === "deploy" ||
    receipt.txDataDecoded?.type === "deploy" ||
    receipt.txDataDecoded?.type === 1 ||
    receipt.tx_data_decoded?.type === "deploy" ||
    receipt.tx_data_decoded?.type === 1 ||
    receipt.data?.type === "deploy" ||
    receipt.data?.type === 1;

  if (!hasTypeIndicator) {
    throw new Error("Transaction decoded type 'undefined' is not 'deploy'. Receipt missing valid deploy type indication.");
  }

  // 6. Collect and cross-validate all contract address representations
  const addrSources = [];
  if (receipt.contractAddress) addrSources.push({ key: "receipt.contractAddress", val: receipt.contractAddress });
  if (receipt.contract_address) addrSources.push({ key: "receipt.contract_address", val: receipt.contract_address });
  if (receipt.txDataDecoded?.contractAddress) {
    addrSources.push({ key: "txDataDecoded.contractAddress", val: receipt.txDataDecoded.contractAddress });
  }
  if (receipt.txDataDecoded?.contract_address) {
    addrSources.push({ key: "txDataDecoded.contract_address", val: receipt.txDataDecoded.contract_address });
  }
  if (receipt.tx_data_decoded?.contractAddress) {
    addrSources.push({ key: "tx_data_decoded.contractAddress", val: receipt.tx_data_decoded.contractAddress });
  }
  if (receipt.tx_data_decoded?.contract_address) {
    addrSources.push({ key: "tx_data_decoded.contract_address", val: receipt.tx_data_decoded.contract_address });
  }
  if (receipt.data?.contractAddress) {
    addrSources.push({ key: "data.contractAddress", val: receipt.data.contractAddress });
  }
  if (receipt.data?.contract_address) {
    addrSources.push({ key: "data.contract_address", val: receipt.data.contract_address });
  }

  if (addrSources.length === 0) {
    throw new Error("Deployment receipt is missing contract address across all representations.");
  }

  for (let i = 1; i < addrSources.length; i++) {
    if (addrSources[i].val.toLowerCase() !== addrSources[0].val.toLowerCase()) {
      throw new Error(
        `Conflicting contract address representations in receipt: ${addrSources[0].key} '${addrSources[0].val}' vs ${addrSources[i].key} '${addrSources[i].val}'.`
      );
    }
  }

  const primaryAddress = addrSources[0].val;
  if (!ADDR_REGEX.test(primaryAddress) || primaryAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`Decoded contractAddress '${primaryAddress}' is not a valid nonzero 20-byte 0x address.`);
  }

  // 7. Recipient verification when present
  if (receipt.recipient) {
    if (!ADDR_REGEX.test(receipt.recipient) || receipt.recipient.toLowerCase() === ZERO_ADDRESS) {
      throw new Error(`Recipient '${receipt.recipient}' is not a valid nonzero 20-byte address.`);
    }
    if (receipt.recipient.toLowerCase() !== primaryAddress.toLowerCase()) {
      throw new Error(`Recipient '${receipt.recipient}' does not match decoded contractAddress '${primaryAddress}'.`);
    }
  }

  return {
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    txDataDecoded: {
      type: "deploy",
      contractAddress: primaryAddress,
    },
    contractAddress: primaryAddress,
    recipient: receipt.recipient || primaryAddress,
    sender: resolvedSender,
    hash: resolvedTxHash,
  };
}

/**
 * Strictly validates a finalized transaction receipt and returns the contract address.
 */
export function validateDeployReceipt(receipt, options = {}) {
  const normalized = normalizeDeployReceipt(receipt, options);
  return normalized.contractAddress;
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
  collisionPassed = true,
  collisionBlocker = null,
} = {}) {
  const blockers = [];

  if (!sourceGatePassed) {
    blockers.push("Release source gate check failed: working contract source does not match committed HEAD or repository is dirty.");
  }

  if (!collisionPassed) {
    blockers.push(collisionBlocker || "Deployment artifact collision detected for selected release.");
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

export const CANONICAL_DEPLOYER_ADDRESS = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";

/**
 * Formats the final deployment plan banner for dry-run preflight.
 */
export function formatDeploymentPlan({
  readiness,
  networkName,
  chainId,
  rpcUrl,
  historicalV1Status,
  release = DEFAULT_RELEASE,
  confirmAddress = CANONICAL_DEPLOYER_ADDRESS,
}) {
  const config = resolveReleaseConfig(release);
  const lines = [];
  lines.push("\n----------------------------------------------------------------------");
  lines.push("DEPLOYMENT PLAN (READ-ONLY PREFLIGHT):");
  lines.push(`1. Contract: Makewhole (${config.release} with 1:1 bond reservation and restitution economics)`);
  lines.push(`2. Target Network: ${networkName} (${chainId})`);
  lines.push(`3. Target RPC: ${rpcUrl}`);
  lines.push(`4. Selected Release: ${config.release}`);
  lines.push("5. Status: READ-ONLY DRY-RUN COMPLETE. No contract was deployed.");
  lines.push("   No transaction was signed or submitted to any network.");
  if (historicalV1Status) {
    lines.push(`6. Historical v1 Status: ${historicalV1Status}`);
  }

  lines.push("");
  if (readiness && readiness.ready) {
    lines.push("Deployment Readiness: READY");
    lines.push("   To execute real deployment, an authorized operator must run:");
    lines.push(`   node scripts/deploy-keychain.mjs --deploy --release ${config.release} --confirm-address ${confirmAddress}`);
  } else {
    lines.push("Deployment Readiness: BLOCKED");
    if (readiness && Array.isArray(readiness.blockers) && readiness.blockers.length > 0) {
      lines.push("   Blockers:");
      readiness.blockers.forEach((b) => lines.push(`   - ${b}`));
    }
    lines.push("");
    lines.push("   DO NOT PROCEED with deployment until every required readiness check passes.");
  }
  lines.push("----------------------------------------------------------------------\n");
  return lines.join("\n");
}

export const RECEIPT_FILENAME = DEPLOYMENT_RELEASES.v2.receiptFilename;
export const PENDING_JOURNAL_FILENAME = DEPLOYMENT_RELEASES.v2.pendingFilename;
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
 * Validates that neither a final deployment receipt nor an interrupted pending journal exists for the selected release.
 * Fails closed before any transaction is broadcast.
 */
export function assertNoDeploymentCollisions({
  deploymentsDir,
  release = DEFAULT_RELEASE,
  existsSyncFn = existsSync,
}) {
  const config = resolveReleaseConfig(release);
  const receiptFile = resolve(deploymentsDir, config.receiptFilename);
  const pendingFile = resolve(deploymentsDir, config.pendingFilename);

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

  return { receiptFile, pendingFile, release: config.release };
}

/**
 * Creates the non-secret initial pending deployment intent object.
 */
export function createPendingJournalIntent({
  project = "makewhole",
  release = DEFAULT_RELEASE,
  version = null,
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
  const config = resolveReleaseConfig(version || release);
  return {
    project,
    version: config.version,
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

/**
 * Validates a pending deployment journal strictly.
 * Fails closed on any missing, malformed, or invalid fields.
 */
export function validatePendingJournal(journal, expectedRelease = null) {
  if (!journal || typeof journal !== "object") {
    throw new Error("Pending deployment journal is missing or not an object.");
  }
  const ALLOWED_JOURNAL_KEYS = new Set([
    "project",
    "version",
    "chainId",
    "rpcHost",
    "deployerAddress",
    "sourceCommit",
    "contractSourceSha256",
    "createdAtUtc",
    "status",
    "deploymentTxHash",
    "broadcastAtUtc",
  ]);
  for (const k of Object.keys(journal)) {
    if (!ALLOWED_JOURNAL_KEYS.has(k)) {
      throw new Error(`Unexpected field in pending deployment journal: '${k}'.`);
    }
  }

  if (journal.project !== "makewhole") {
    throw new Error(`Invalid journal project '${journal.project}', expected 'makewhole'.`);
  }
  if (!journal.version || typeof journal.version !== "string") {
    throw new Error(`Invalid journal version '${journal.version}'.`);
  }
  const journalConfig = DEPLOYMENT_RELEASES[journal.version];
  if (!journalConfig) {
    throw new Error(
      `Invalid journal version '${journal.version}', expected one of: ${Object.keys(DEPLOYMENT_RELEASES).join(", ")}.`
    );
  }
  if (expectedRelease !== null && expectedRelease !== undefined) {
    const expectedConfig = resolveReleaseConfig(expectedRelease);
    if (journal.version !== expectedConfig.version) {
      throw new Error(`Release mismatch: journal has version '${journal.version}', expected '${expectedConfig.version}'.`);
    }
  }
  if (journal.status !== "BROADCAST") {
    throw new Error(`Invalid journal status '${journal.status}', expected 'BROADCAST'.`);
  }
  const chainId = typeof journal.chainId === "bigint" ? Number(journal.chainId) : journal.chainId;
  if (chainId !== CANONICAL_CHAIN_ID) {
    throw new Error(`Invalid journal chainId ${journal.chainId}, expected ${CANONICAL_CHAIN_ID}.`);
  }
  if (journal.rpcHost !== "studio-dev.genlayer.com") {
    throw new Error(`Invalid journal rpcHost '${journal.rpcHost}', expected exact 'studio-dev.genlayer.com'.`);
  }
  if (!journal.deployerAddress || !ADDR_REGEX.test(journal.deployerAddress) || journal.deployerAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`Invalid journal deployerAddress '${journal.deployerAddress}'.`);
  }
  if (!journal.deploymentTxHash || !TX_HASH_REGEX.test(journal.deploymentTxHash)) {
    throw new Error(`Invalid journal deploymentTxHash '${journal.deploymentTxHash}'. Must be a 32-byte hex hash.`);
  }
  if (!journal.sourceCommit || typeof journal.sourceCommit !== "string" || !/^[0-9a-fA-F]{40}$/.test(journal.sourceCommit)) {
    throw new Error(`Invalid journal sourceCommit '${journal.sourceCommit}'.`);
  }
  if (
    !journal.contractSourceSha256 ||
    typeof journal.contractSourceSha256 !== "string" ||
    !/^[0-9a-fA-F]{64}$/.test(journal.contractSourceSha256)
  ) {
    throw new Error(`Invalid journal contractSourceSha256 '${journal.contractSourceSha256}'.`);
  }
  if (
    !journal.createdAtUtc ||
    typeof journal.createdAtUtc !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(journal.createdAtUtc) ||
    isNaN(Date.parse(journal.createdAtUtc))
  ) {
    throw new Error(`Invalid journal createdAtUtc '${journal.createdAtUtc}'. Must be a valid ISO-8601 UTC timestamp.`);
  }
  if (
    !journal.broadcastAtUtc ||
    typeof journal.broadcastAtUtc !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(journal.broadcastAtUtc) ||
    isNaN(Date.parse(journal.broadcastAtUtc))
  ) {
    throw new Error(`Invalid journal broadcastAtUtc '${journal.broadcastAtUtc}'. Must be a valid ISO-8601 UTC timestamp.`);
  }
  const createdMs = Date.parse(journal.createdAtUtc);
  const broadcastMs = Date.parse(journal.broadcastAtUtc);
  if (broadcastMs < createdMs) {
    throw new Error(
      `Invalid journal timestamps: broadcastAtUtc '${journal.broadcastAtUtc}' cannot be earlier than createdAtUtc '${journal.createdAtUtc}'.`
    );
  }
  return true;
}

/**
 * Validates a final receipt artifact strictly.
 */
export function validateReceiptArtifact(receipt, expectedRelease = null) {
  if (!receipt || typeof receipt !== "object") {
    throw new Error("Receipt artifact is missing or not an object.");
  }
  const ALLOWED_RECEIPT_KEYS = new Set([
    "project",
    "version",
    "chainId",
    "networkName",
    "rpcHost",
    "explorerBaseUrl",
    "deployerAddress",
    "contractAddress",
    "deploymentTxHash",
    "sourceCommit",
    "contractSourceSha256",
    "executionResult",
    "broadcastAtUtc",
    "recoveredAtUtc",
    "finalizedAtUtc",
    "sdkVersion",
  ]);
  for (const k of Object.keys(receipt)) {
    if (!ALLOWED_RECEIPT_KEYS.has(k)) {
      throw new Error(`Unexpected field in receipt artifact: '${k}'.`);
    }
  }

  if (receipt.project !== "makewhole") {
    throw new Error(`Invalid receipt project '${receipt.project}', expected 'makewhole'.`);
  }
  if (!receipt.version || typeof receipt.version !== "string") {
    throw new Error(`Invalid receipt version '${receipt.version}'.`);
  }
  const receiptConfig = DEPLOYMENT_RELEASES[receipt.version];
  if (!receiptConfig) {
    throw new Error(
      `Invalid receipt version '${receipt.version}', expected one of: ${Object.keys(DEPLOYMENT_RELEASES).join(", ")}.`
    );
  }
  if (expectedRelease !== null && expectedRelease !== undefined) {
    const expectedConfig = resolveReleaseConfig(expectedRelease);
    if (receipt.version !== expectedConfig.version) {
      throw new Error(`Invalid receipt version '${receipt.version}', expected '${expectedConfig.version}'.`);
    }
  }
  const chainId = typeof receipt.chainId === "bigint" ? Number(receipt.chainId) : receipt.chainId;
  if (chainId !== CANONICAL_CHAIN_ID) {
    throw new Error(`Invalid receipt chainId ${receipt.chainId}, expected ${CANONICAL_CHAIN_ID}.`);
  }
  if (receipt.networkName !== "GenLayer Studio-dev") {
    throw new Error(`Invalid receipt networkName '${receipt.networkName}', expected 'GenLayer Studio-dev'.`);
  }
  if (receipt.rpcHost !== "studio-dev.genlayer.com") {
    throw new Error(`Invalid receipt rpcHost '${receipt.rpcHost}', expected exact 'studio-dev.genlayer.com'.`);
  }
  if (receipt.explorerBaseUrl !== CANONICAL_EXPLORER) {
    throw new Error(`Invalid receipt explorerBaseUrl '${receipt.explorerBaseUrl}', expected '${CANONICAL_EXPLORER}'.`);
  }
  if (!receipt.deployerAddress || !ADDR_REGEX.test(receipt.deployerAddress) || receipt.deployerAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`Invalid receipt deployerAddress '${receipt.deployerAddress}'.`);
  }
  if (!receipt.contractAddress || !ADDR_REGEX.test(receipt.contractAddress) || receipt.contractAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`Invalid receipt contractAddress '${receipt.contractAddress}'.`);
  }
  if (!receipt.deploymentTxHash || !TX_HASH_REGEX.test(receipt.deploymentTxHash)) {
    throw new Error(`Invalid receipt deploymentTxHash '${receipt.deploymentTxHash}'.`);
  }
  if (!receipt.sourceCommit || typeof receipt.sourceCommit !== "string" || !/^[0-9a-fA-F]{40}$/.test(receipt.sourceCommit)) {
    throw new Error(`Invalid receipt sourceCommit '${receipt.sourceCommit}'.`);
  }
  if (!receipt.contractSourceSha256 || typeof receipt.contractSourceSha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(receipt.contractSourceSha256)) {
    throw new Error(`Invalid receipt contractSourceSha256 '${receipt.contractSourceSha256}'.`);
  }
  if (receipt.executionResult !== "FINISHED_WITH_RETURN") {
    throw new Error(`Invalid receipt executionResult '${receipt.executionResult}', expected 'FINISHED_WITH_RETURN'.`);
  }
  if (
    !receipt.broadcastAtUtc ||
    typeof receipt.broadcastAtUtc !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(receipt.broadcastAtUtc) ||
    isNaN(Date.parse(receipt.broadcastAtUtc))
  ) {
    throw new Error(`Invalid receipt broadcastAtUtc '${receipt.broadcastAtUtc}'. Must be a valid ISO-8601 UTC timestamp.`);
  }
  if (
    !receipt.recoveredAtUtc ||
    typeof receipt.recoveredAtUtc !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(receipt.recoveredAtUtc) ||
    isNaN(Date.parse(receipt.recoveredAtUtc))
  ) {
    throw new Error(`Invalid receipt recoveredAtUtc '${receipt.recoveredAtUtc}'. Must be a valid ISO-8601 UTC timestamp.`);
  }
  if (!receipt.sdkVersion || typeof receipt.sdkVersion !== "string" || receipt.sdkVersion.trim().length === 0) {
    throw new Error(`Invalid receipt sdkVersion '${receipt.sdkVersion}'. Must be a non-empty string.`);
  }
  if (receipt.finalizedAtUtc !== undefined) {
    if (
      typeof receipt.finalizedAtUtc !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(receipt.finalizedAtUtc) ||
      isNaN(Date.parse(receipt.finalizedAtUtc))
    ) {
      throw new Error(`Invalid receipt finalizedAtUtc '${receipt.finalizedAtUtc}'. Must be a valid ISO-8601 UTC timestamp.`);
    }
  }
  return true;
}

/**
 * Validates that an existing final receipt artifact matches the pending journal for idempotent recovery.
 */
export function validateReceiptMatchesJournal({ receipt, journal, confirmContractAddress = null, expectedRelease = null }) {
  validateReceiptArtifact(receipt, expectedRelease);
  validatePendingJournal(journal, expectedRelease);

  if (receipt.project !== journal.project) {
    throw new Error(`Project mismatch: receipt has '${receipt.project}', journal has '${journal.project}'.`);
  }
  if (receipt.version !== journal.version) {
    throw new Error(`Version mismatch: receipt has '${receipt.version}', journal has '${journal.version}'.`);
  }
  const rChain = typeof receipt.chainId === "bigint" ? Number(receipt.chainId) : receipt.chainId;
  const jChain = typeof journal.chainId === "bigint" ? Number(journal.chainId) : journal.chainId;
  if (rChain !== jChain) {
    throw new Error(`Chain ID mismatch: receipt has ${receipt.chainId}, journal has ${journal.chainId}.`);
  }
  if (receipt.rpcHost !== journal.rpcHost) {
    throw new Error(`RPC host mismatch: receipt has '${receipt.rpcHost}', journal has '${journal.rpcHost}'.`);
  }
  if (receipt.deployerAddress.toLowerCase() !== journal.deployerAddress.toLowerCase()) {
    throw new Error(`Deployer address mismatch: receipt has '${receipt.deployerAddress}', journal has '${journal.deployerAddress}'.`);
  }
  if (receipt.deploymentTxHash.toLowerCase() !== journal.deploymentTxHash.toLowerCase()) {
    throw new Error(`Transaction hash mismatch: receipt has '${receipt.deploymentTxHash}', journal has '${journal.deploymentTxHash}'.`);
  }
  if (receipt.sourceCommit.toLowerCase() !== journal.sourceCommit.toLowerCase()) {
    throw new Error(`Source commit mismatch: receipt has '${receipt.sourceCommit}', journal has '${journal.sourceCommit}'.`);
  }
  if (receipt.contractSourceSha256.toLowerCase() !== journal.contractSourceSha256.toLowerCase()) {
    throw new Error(`Contract hash mismatch: receipt has '${receipt.contractSourceSha256}', journal has '${journal.contractSourceSha256}'.`);
  }
  if (receipt.executionResult !== "FINISHED_WITH_RETURN") {
    throw new Error(`Execution result mismatch: receipt has '${receipt.executionResult}', expected 'FINISHED_WITH_RETURN'.`);
  }
  if (receipt.broadcastAtUtc !== journal.broadcastAtUtc) {
    throw new Error(`Broadcast timestamp mismatch: receipt has '${receipt.broadcastAtUtc}', journal has '${journal.broadcastAtUtc}'.`);
  }
  const broadcastMs = Date.parse(receipt.broadcastAtUtc);
  const recoveredMs = Date.parse(receipt.recoveredAtUtc);
  if (recoveredMs < broadcastMs) {
    throw new Error(`Receipt recoveredAtUtc '${receipt.recoveredAtUtc}' cannot be earlier than broadcastAtUtc '${receipt.broadcastAtUtc}'.`);
  }
  if (confirmContractAddress) {
    if (receipt.contractAddress.toLowerCase() !== confirmContractAddress.toLowerCase()) {
      throw new Error(`Confirmed contract address '${confirmContractAddress}' does not match receipt '${receipt.contractAddress}'.`);
    }
  }
  return true;
}

export function normalizeSource(c) {
  return (c || "").replace(/\r\n/g, "\n");
}

export function sha256Hex(content) {
  return createHash("sha256").update(normalizeSource(content)).digest("hex");
}

/**
 * Validates that the journal's source commit exists, is an ancestor of current HEAD,
 * that historical, HEAD, and working contract source hashes match the journal,
 * and that recovery-critical tracked files are clean.
 */
export function validateRecoverySourceIntegrity({
  rootPath = root,
  journal,
  execGitFn = null,
  criticalFiles = CRITICAL_RELEASE_FILES,
}) {
  const runGit = execGitFn || ((args, cwd) => execFileSync("git", args, { cwd: cwd || rootPath, encoding: "utf8" }));

  // 1. Require journal source commit to exist in git history
  try {
    runGit(["rev-parse", "--verify", `${journal.sourceCommit}^{commit}`], rootPath);
  } catch (e) {
    throw new Error(`Journal source commit '${journal.sourceCommit}' does not exist in git history.`);
  }

  // 2. Require journal source commit to be an ancestor of current HEAD
  try {
    runGit(["merge-base", "--is-ancestor", journal.sourceCommit, "HEAD"], rootPath);
  } catch (e) {
    throw new Error(
      `Journal source commit '${journal.sourceCommit}' is not an ancestor of current HEAD.`
    );
  }

  // 3. git show <journalCommit>:contracts/makewhole.py
  let historicalCode;
  try {
    historicalCode = runGit(["show", `${journal.sourceCommit}:contracts/makewhole.py`], rootPath);
  } catch (e) {
    throw new Error(
      `Failed to retrieve contract source from journal commit '${journal.sourceCommit}': ${e.message}`
    );
  }

  // 4. Hash historical contract source and require it to match the journal
  const histSha = sha256Hex(normalizeSource(historicalCode));
  if (histSha.toLowerCase() !== journal.contractSourceSha256.toLowerCase()) {
    throw new Error(
      `Historical contract source at '${journal.sourceCommit}' SHA-256 '${histSha}' does not match journal '${journal.contractSourceSha256}'.`
    );
  }

  // 5. Require contract source at current HEAD to have the same hash
  let headCode;
  try {
    headCode = runGit(["show", "HEAD:contracts/makewhole.py"], rootPath);
  } catch (e) {
    throw new Error(`Failed to retrieve contract source at HEAD: ${e.message}`);
  }
  const headSha = sha256Hex(normalizeSource(headCode));
  if (headSha.toLowerCase() !== journal.contractSourceSha256.toLowerCase()) {
    throw new Error(
      `Current HEAD contract source SHA-256 '${headSha}' does not match journal '${journal.contractSourceSha256}'.`
    );
  }

  // 6. Require working contract source to have the same hash
  const workingPath = resolve(rootPath, "contracts", "makewhole.py");
  if (!existsSync(workingPath)) {
    throw new Error(`Working contract source file not found at '${workingPath}'.`);
  }
  const workingCode = readFileSync(workingPath, "utf8");
  const workingSha = sha256Hex(normalizeSource(workingCode));
  if (workingSha.toLowerCase() !== journal.contractSourceSha256.toLowerCase()) {
    throw new Error(
      `Working contract source SHA-256 '${workingSha}' does not match journal '${journal.contractSourceSha256}'.`
    );
  }

  // 7. Require current recovery-critical tracked files to be clean when real recovery runs
  let porcelain = "";
  try {
    porcelain = runGit(["status", "--porcelain", "--", ...criticalFiles], rootPath).trim();
  } catch (e) {
    throw new Error(`Failed to check git status on critical files: ${e.message}`);
  }
  if (porcelain) {
    throw new Error(
      `Recovery requires critical tracked files to be clean. Uncommitted changes detected:\n${porcelain}`
    );
  }

  return {
    journalCommit: journal.sourceCommit,
    historicalSha: histSha,
    headSha,
    workingSha,
    passed: true,
  };
}

/**
 * Queries on-chain contract state and validates fresh schema, 0 jobs, and zeroed economics.
 */
export async function verifyDeployedContract(client, address) {
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
  return true;
}

/**
 * Gathers git status and committed source gate information.
 */
export function getGitReleaseStatus(rootPath = root) {
  let headCommit = null;
  try {
    headCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootPath, encoding: "utf8" }).trim();
  } catch {
    headCommit = null;
  }

  let committedCode = null;
  try {
    committedCode = execFileSync("git", ["show", "HEAD:contracts/makewhole.py"], { cwd: rootPath, encoding: "utf8" });
  } catch {
    committedCode = null;
  }

  let porcelainStatus = "";
  try {
    porcelainStatus = execFileSync("git", ["status", "--porcelain", "--", ...CRITICAL_RELEASE_FILES], {
      cwd: rootPath,
      encoding: "utf8",
    });
  } catch {
    porcelainStatus = "ERROR: Failed to run git status";
  }

  const workingPath = resolve(rootPath, "contracts", "makewhole.py");
  let workingCode = "";
  try {
    if (existsSync(workingPath)) {
      workingCode = readFileSync(workingPath, "utf8");
    }
  } catch {}

  const gate = checkReleaseSourceGate({
    headCommit,
    committedCode,
    workingCode,
    porcelainStatus,
  });

  return {
    headCommit: headCommit || "UNAVAILABLE",
    committedCode,
    workingCode,
    porcelainStatus,
    workingSha: gate.workingSha,
    committedSha: gate.committedSha,
    passed: gate.passed,
    issues: gate.issues,
  };
}

/**
 * Explicit recovery/resume mode for an already-broadcast pending deployment.
 * Never signs or broadcasts any transaction. Read-only against RPC.
 * Idempotent, crash-safe, and preserves pending journal on any error.
 */
export async function executeRecovery({
  confirmAddress,
  confirmContractAddress,
  release = DEFAULT_RELEASE,
  rootPath = root,
  client = null,
  execGitFn = null,
  sdkVersion = SDK_VERSION,
  unlinkFn = unlinkSync,
}) {
  if (!confirmAddress) {
    throw new Error("Missing required flag: --confirm-address 0x<address> must be specified.");
  }
  if (!confirmContractAddress) {
    throw new Error("Missing required flag: --confirm-contract-address 0x<address> must be specified.");
  }
  if (!ADDR_REGEX.test(confirmAddress) || confirmAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`Invalid confirmation deployer address '${confirmAddress}'.`);
  }
  if (!ADDR_REGEX.test(confirmContractAddress) || confirmContractAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`Invalid confirmation contract address '${confirmContractAddress}'.`);
  }

  const config = resolveReleaseConfig(release);
  const deploymentsDir = resolve(rootPath, "deployments");
  const pendingFile = resolve(deploymentsDir, config.pendingFilename);
  const receiptFile = resolve(deploymentsDir, config.receiptFilename);
  const envLocal = resolve(rootPath, "web", ".env.local");

  // Path A: Pending journal does NOT exist
  if (!existsSync(pendingFile)) {
    if (existsSync(receiptFile)) {
      let existingReceipt;
      try {
        existingReceipt = JSON.parse(readFileSync(receiptFile, "utf8"));
      } catch (e) {
        throw new Error(`Receipt file at '${receiptFile}' is malformed JSON: ${e.message}`);
      }
      validateReceiptArtifact(existingReceipt, config.release);

      if (confirmAddress.toLowerCase() !== existingReceipt.deployerAddress.toLowerCase()) {
        throw new Error(
          `Confirmation address '${confirmAddress}' does not match receipt deployer '${existingReceipt.deployerAddress}'.`
        );
      }
      if (confirmContractAddress.toLowerCase() !== existingReceipt.contractAddress.toLowerCase()) {
        throw new Error(
          `Confirmed contract address '${confirmContractAddress}' does not match receipt contract address '${existingReceipt.contractAddress}'.`
        );
      }

      // Verify on-chain (read-only)
      const genClient = client || createClient({
        chain: studioDevnet,
        endpoint: CANONICAL_RPC,
      });

      const onChainReceipt = await genClient.waitForTransactionReceipt({
        hash: existingReceipt.deploymentTxHash,
        waitUntil: "finalized",
        retries: 60,
      });
      const validatedOnChainAddr = validateDeployReceipt(onChainReceipt, {
        expectedTxHash: existingReceipt.deploymentTxHash,
        expectedDeployer: existingReceipt.deployerAddress,
      });
      if (validatedOnChainAddr.toLowerCase() !== existingReceipt.contractAddress.toLowerCase()) {
        throw new Error(
          `On-chain contract address '${validatedOnChainAddr}' does not match receipt '${existingReceipt.contractAddress}'.`
        );
      }

      await verifyDeployedContract(genClient, existingReceipt.contractAddress);

      // Verify environment synchronization
      const existingEnv = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : "";
      const updatedEnv = updateEnvContent(existingEnv, {
        NEXT_PUBLIC_CONTRACT_ADDRESS: existingReceipt.contractAddress,
        NEXT_PUBLIC_CHAIN_ID: existingReceipt.chainId.toString(),
        NEXT_PUBLIC_STUDIO_RPC: CANONICAL_RPC,
        NEXT_PUBLIC_STUDIO_EXPLORER: CANONICAL_EXPLORER,
        GENLAYER_STUDIO_URL: CANONICAL_RPC,
      });
      if (existingEnv !== updatedEnv) {
        atomicWriteFile(envLocal, updatedEnv);
      }

      return {
        recovered: true,
        alreadyCompleted: true,
        contractAddress: existingReceipt.contractAddress,
        deploymentTxHash: existingReceipt.deploymentTxHash,
        receiptFile,
        pendingJournalStatus: "absent",
      };
    }
    throw new Error(`No pending deployment journal found at '${pendingFile}'. Nothing to recover.`);
  }

  // Path B: Pending journal exists
  let rawJournal;
  try {
    rawJournal = JSON.parse(readFileSync(pendingFile, "utf8"));
  } catch (e) {
    console.error(`Pending journal at '${pendingFile}' is malformed JSON.`);
    console.error("DO NOT REDEPLOY.");
    throw new Error(`Failed to parse pending deployment journal: ${e.message}`);
  }

  try {
    validatePendingJournal(rawJournal, config.release);
  } catch (e) {
    console.error(`Pending journal validation failed: ${e.message}`);
    console.error(`Pending journal preserved at: ${pendingFile}`);
    console.error("DO NOT REDEPLOY.");
    throw e;
  }

  // Confirmation deployer address must match journal deployer
  if (confirmAddress.toLowerCase() !== rawJournal.deployerAddress.toLowerCase()) {
    const err = new Error(
      `Confirmation address '${confirmAddress}' does not match journal deployer '${rawJournal.deployerAddress}'.`
    );
    console.error(err.message);
    console.error(`Pending journal preserved at: ${pendingFile}`);
    console.error("DO NOT REDEPLOY.");
    throw err;
  }

  // Source integrity check
  try {
    validateRecoverySourceIntegrity({ rootPath, journal: rawJournal, execGitFn });
  } catch (e) {
    console.error(`Source integrity check failed: ${e.message}`);
    console.error(`Pending journal preserved at: ${pendingFile}`);
    console.error("DO NOT REDEPLOY.");
    throw e;
  }

  // Idempotency: both receiptFile and pendingFile exist
  if (existsSync(receiptFile)) {
    try {
      let existingReceipt;
      try {
        existingReceipt = JSON.parse(readFileSync(receiptFile, "utf8"));
      } catch (e) {
        throw new Error(`Existing receipt file is malformed JSON: ${e.message}`);
      }

      validateReceiptMatchesJournal({
        receipt: existingReceipt,
        journal: rawJournal,
        confirmContractAddress,
        expectedRelease: config.release,
      });

      const genClient = client || createClient({
        chain: studioDevnet,
        endpoint: CANONICAL_RPC,
      });

      const onChainReceipt = await genClient.waitForTransactionReceipt({
        hash: rawJournal.deploymentTxHash,
        waitUntil: "finalized",
        retries: 60,
      });
      const validatedOnChainAddr = validateDeployReceipt(onChainReceipt, {
        expectedTxHash: rawJournal.deploymentTxHash,
        expectedDeployer: rawJournal.deployerAddress,
      });
      if (validatedOnChainAddr.toLowerCase() !== existingReceipt.contractAddress.toLowerCase()) {
        throw new Error(
          `On-chain contract address '${validatedOnChainAddr}' does not match receipt '${existingReceipt.contractAddress}'.`
        );
      }

      await verifyDeployedContract(genClient, existingReceipt.contractAddress);

      const existingEnv = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : "";
      const updatedEnv = updateEnvContent(existingEnv, {
        NEXT_PUBLIC_CONTRACT_ADDRESS: existingReceipt.contractAddress,
        NEXT_PUBLIC_CHAIN_ID: rawJournal.chainId.toString(),
        NEXT_PUBLIC_STUDIO_RPC: CANONICAL_RPC,
        NEXT_PUBLIC_STUDIO_EXPLORER: CANONICAL_EXPLORER,
        GENLAYER_STUDIO_URL: CANONICAL_RPC,
      });
      atomicWriteFile(envLocal, updatedEnv);

      try {
        (unlinkFn || unlinkSync)(pendingFile);
      } catch (e) {
        const delErr = new Error(`Idempotent recovery verified receipt but failed to remove pending journal: ${e.message}`);
        delErr.pendingDeletionFailed = true;
        throw delErr;
      }

      console.log(`[IDEMPOTENT RECOVERY] Existing finalized receipt verified. Removed stale pending journal.`);
      return {
        recovered: true,
        idempotent: true,
        contractAddress: existingReceipt.contractAddress,
        deploymentTxHash: existingReceipt.deploymentTxHash,
        receiptFile,
        pendingJournalStatus: "removed",
      };
    } catch (e) {
      console.error(`Idempotent recovery failed: ${e.message}`);
      console.error(`Pending journal preserved at: ${pendingFile}`);
      console.error("DO NOT REDEPLOY.");
      throw e;
    }
  }

  // Normal Recovery: Query on-chain transaction
  const genClient = client || createClient({
    chain: studioDevnet,
    endpoint: CANONICAL_RPC,
  });

  let receipt;
  try {
    receipt = await genClient.waitForTransactionReceipt({
      hash: rawJournal.deploymentTxHash,
      waitUntil: "finalized",
      retries: 60,
    });
  } catch (e) {
    console.error(`Failed to retrieve transaction receipt for ${rawJournal.deploymentTxHash}: ${e.message}`);
    console.error(`Pending journal preserved at: ${pendingFile}`);
    console.error("DO NOT REDEPLOY.");
    throw e;
  }

  let contractAddress;
  try {
    contractAddress = validateDeployReceipt(receipt, {
      expectedTxHash: rawJournal.deploymentTxHash,
      expectedDeployer: rawJournal.deployerAddress,
    });
  } catch (e) {
    console.error(`Receipt validation failed: ${e.message}`);
    console.error(`Pending journal preserved at: ${pendingFile}`);
    console.error("DO NOT REDEPLOY.");
    throw e;
  }

  // Contract address confirmation check BEFORE ANY LOCAL WRITES!
  if (contractAddress.toLowerCase() !== confirmContractAddress.toLowerCase()) {
    const err = new Error(
      `Validated receipt contract address '${contractAddress}' does not match confirmed contract address '${confirmContractAddress}'.`
    );
    console.error(err.message);
    console.error(`Pending journal preserved at: ${pendingFile}`);
    console.error("DO NOT REDEPLOY.");
    throw err;
  }

  // Live on-chain schema & fresh zero-state check
  try {
    await verifyDeployedContract(genClient, contractAddress);
  } catch (e) {
    console.error(`On-chain contract verification failed: ${e.message}`);
    console.error(`Pending journal preserved at: ${pendingFile}`);
    console.error("DO NOT REDEPLOY.");
    throw e;
  }

  // 1. Atomically update web/.env.local
  try {
    const existingEnv = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : "";
    const updatedEnv = updateEnvContent(existingEnv, {
      NEXT_PUBLIC_CONTRACT_ADDRESS: contractAddress,
      NEXT_PUBLIC_CHAIN_ID: rawJournal.chainId.toString(),
      NEXT_PUBLIC_STUDIO_RPC: CANONICAL_RPC,
      NEXT_PUBLIC_STUDIO_EXPLORER: CANONICAL_EXPLORER,
      GENLAYER_STUDIO_URL: CANONICAL_RPC,
    });
    atomicWriteFile(envLocal, updatedEnv);
  } catch (e) {
    console.error(`Failed to update environment: ${e.message}`);
    console.error(`Pending journal preserved at: ${pendingFile}`);
    console.error("DO NOT REDEPLOY.");
    throw e;
  }

  // 2. Atomically write receipt artifact
  const receiptArtifact = {
    project: "makewhole",
    version: config.version,
    chainId: rawJournal.chainId,
    networkName: "GenLayer Studio-dev",
    rpcHost: rawJournal.rpcHost,
    explorerBaseUrl: CANONICAL_EXPLORER,
    deployerAddress: rawJournal.deployerAddress,
    contractAddress,
    deploymentTxHash: rawJournal.deploymentTxHash,
    sourceCommit: rawJournal.sourceCommit,
    contractSourceSha256: rawJournal.contractSourceSha256,
    executionResult: "FINISHED_WITH_RETURN",
    broadcastAtUtc: rawJournal.broadcastAtUtc,
    recoveredAtUtc: new Date().toISOString(),
    sdkVersion,
  };
  const candidateFinalized = receipt.finalizedAtUtc || receipt.finalized_at_utc;
  if (
    candidateFinalized &&
    typeof candidateFinalized === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(candidateFinalized) &&
    !isNaN(Date.parse(candidateFinalized))
  ) {
    receiptArtifact.finalizedAtUtc = candidateFinalized;
  }

  try {
    atomicWriteFile(receiptFile, JSON.stringify(receiptArtifact, null, 2) + "\n");
  } catch (e) {
    console.error(`Failed to write receipt artifact: ${e.message}`);
    console.error(`Pending journal preserved at: ${pendingFile}`);
    console.error("DO NOT REDEPLOY.");
    throw e;
  }

  // 3. Remove pending journal only after every step above succeeded
  try {
    if (existsSync(pendingFile)) {
      (unlinkFn || unlinkSync)(pendingFile);
    }
  } catch (e) {
    console.error(`Failed to remove pending journal: ${e.message}`);
    console.error(`Receipt artifact and environment were updated, but pending journal '${pendingFile}' could not be deleted.`);
    console.error("DO NOT REDEPLOY.");
    const err = new Error(`Recovery completed local writes but failed to delete pending journal: ${e.message}`);
    err.pendingDeletionFailed = true;
    throw err;
  }

  return {
    recovered: true,
    contractAddress,
    deploymentTxHash: rawJournal.deploymentTxHash,
    receiptFile,
    pendingJournalStatus: "removed",
  };
}
