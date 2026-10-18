import { createRequire } from "node:module";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  validateConfirmAddress,
  calculateFundingDeficit,
  assertKeychainAccountCanBeCreated,
  executeRecovery,
  MAX_TARGET_DEPLOYER_BALANCE_GEN,
  MAX_TARGET_DEPLOYER_BALANCE_WEI,
  resolveReleaseConfig,
  DEFAULT_RELEASE,
  DEPLOYMENT_RELEASES,
} from "./deploy-helpers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const KEYCHAIN_SERVICE = "genlayer-cli";
export const DEPLOYER_ACCOUNT_NAME = "makewhole-deployer-v2";
export const DEPLOYER_KEYCHAIN_KEY = `account:${DEPLOYER_ACCOUNT_NAME}`;
export const FUNDER_ACCOUNT_NAME = "coverlock-submitter";
export const FUNDER_KEYCHAIN_KEY = `account:${FUNDER_ACCOUNT_NAME}`;
export const CANONICAL_RPC = "https://studio-dev.genlayer.com/api";
export const CANONICAL_CHAIN_ID = 61997;

/**
 * Dynamically resolves and loads keytar from GenLayer CLI or global npm locations
 * without copying secrets into repository files.
 */
export function resolveKeytar(customPath = null) {
  if (customPath) {
    const customReq = createRequire(join(customPath, "index.js"));
    return customReq(customPath);
  }
  const req = createRequire(import.meta.url);
  try {
    return req("keytar");
  } catch {}

  const candidatePaths = [];
  if (process.env.APPDATA) {
    candidatePaths.push(
      join(process.env.APPDATA, "npm", "node_modules", "genlayer", "node_modules", "keytar"),
      join(process.env.APPDATA, "npm", "node_modules", "@genlayer", "cli", "node_modules", "keytar"),
      join(process.env.APPDATA, "npm", "node_modules", "keytar")
    );
  }
  if (process.env.HOME) {
    candidatePaths.push(
      join(process.env.HOME, ".nvm", "versions", "node", process.version, "lib", "node_modules", "genlayer", "node_modules", "keytar"),
      "/usr/local/lib/node_modules/genlayer/node_modules/keytar",
      "/usr/lib/node_modules/genlayer/node_modules/keytar"
    );
  }

  for (const candidate of candidatePaths) {
    try {
      if (existsSync(candidate)) {
        const customReq = createRequire(join(candidate, "index.js"));
        return customReq(candidate);
      }
    } catch {}
  }

  throw new Error(
    "Could not locate 'keytar' module from GenLayer CLI installation. Ensure GenLayer CLI is installed."
  );
}

/**
 * Normalizes a hex private key string to 0x-prefixed 64-hex string.
 */
function normalizePrivateKey(rawKey) {
  if (!rawKey || typeof rawKey !== "string") {
    throw new Error("Invalid private key: string expected.");
  }
  const trimmed = rawKey.trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
    throw new Error("Invalid private key format in keychain: must be a 32-byte hexadecimal string.");
  }
  return withPrefix;
}

/**
 * Parses CLI arguments for deploy-keychain.mjs.
 */
export function parseKeychainArgs(args = process.argv.slice(2)) {
  let explicitMode = null;
  let confirmAddress = null;
  let confirmContractAddress = null;

  const MODE_FLAGS = new Set([
    "--prepare-account",
    "--fund",
    "--deploy",
    "--recover",
    "--preflight",
  ]);

  let rawRelease = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (MODE_FLAGS.has(arg)) {
      if (explicitMode !== null) {
        throw new Error(
          `Cannot combine mode flags. Mode '${explicitMode}' was already specified when encountering '${arg}'.`
        );
      }
      explicitMode = arg.replace(/^--/, "");
    } else if (arg === "--confirm-address") {
      i++;
      if (i >= args.length || !args[i]) {
        throw new Error("--confirm-address requires an address value.");
      }
      confirmAddress = args[i];
    } else if (arg.startsWith("--confirm-address=")) {
      confirmAddress = arg.slice("--confirm-address=".length);
    } else if (arg === "--confirm-contract-address") {
      i++;
      if (i >= args.length || !args[i]) {
        throw new Error("--confirm-contract-address requires an address value.");
      }
      confirmContractAddress = args[i];
    } else if (arg.startsWith("--confirm-contract-address=")) {
      confirmContractAddress = arg.slice("--confirm-contract-address=".length);
    } else if (arg === "--release") {
      if (rawRelease !== null) {
        throw new Error("Duplicate --release argument specified.");
      }
      i++;
      if (i >= args.length || !args[i] || args[i].startsWith("--")) {
        throw new Error("Missing value for --release argument.");
      }
      rawRelease = args[i];
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
      throw new Error(`Unknown argument '${arg}'.`);
    }
  }

  const mode = explicitMode || "preflight";
  const releaseConfig = resolveReleaseConfig(rawRelease || DEFAULT_RELEASE);

  return { mode, confirmAddress, confirmContractAddress, release: releaseConfig.release };
}

/**
 * Evaluates readiness of keychain operator preflight.
 * Pure function that determines readiness status, exit code, and blocker list.
 */
export function evaluateKeychainReadiness({
  accountExists,
  malformedKeyError = null,
  publicAddress = null,
  balanceLookupError = null,
  balanceWei = null,
  deficitInfo = null,
  dryRunRes = null,
}) {
  const blockers = [];

  if (!accountExists) {
    blockers.push(`Deployer account '${DEPLOYER_KEYCHAIN_KEY}' is absent from OS keychain.`);
  } else if (malformedKeyError) {
    blockers.push(`Deployer keychain entry is malformed: ${malformedKeyError.message}`);
  } else if (!publicAddress) {
    blockers.push("Failed to derive public address from deployer keychain account.");
  }

  if (accountExists && !malformedKeyError && publicAddress) {
    if (balanceLookupError) {
      blockers.push(`Balance lookup failed: ${balanceLookupError.message}`);
    } else if (balanceWei === null || balanceWei === undefined) {
      blockers.push("Deployer balance is unavailable.");
    } else if (deficitInfo?.needsFunding || balanceWei < MAX_TARGET_DEPLOYER_BALANCE_WEI) {
      const cur = balanceWei !== null ? balanceWei.toString() : "0";
      const def = deficitInfo ? deficitInfo.deficitWei.toString() : "unknown";
      blockers.push(
        `Deployer balance (${cur} wei) is below 1 GEN target (${MAX_TARGET_DEPLOYER_BALANCE_WEI.toString()} wei). Deficit: ${def} wei. Funding is required.`
      );
    }
  }

  if (!dryRunRes) {
    blockers.push("Ordinary deployment dry-run was not executed.");
  } else {
    if (dryRunRes.error) {
      blockers.push(`Ordinary deployment dry-run failed to start: ${dryRunRes.error.message || dryRunRes.error}`);
    } else if (dryRunRes.signal) {
      blockers.push(`Ordinary deployment dry-run was terminated by signal: ${dryRunRes.signal}`);
    } else if (dryRunRes.status === null || dryRunRes.status === undefined) {
      blockers.push("Ordinary deployment dry-run exit status is null or unavailable.");
    } else if (dryRunRes.status !== 0) {
      blockers.push(`Ordinary deployment dry-run exited with nonzero code ${dryRunRes.status}.`);
    }
  }

  const ready = blockers.length === 0;
  return {
    ready,
    readiness: ready ? "READY" : "BLOCKED",
    exitCode: ready ? 0 : 1,
    blockers,
  };
}

/**
 * Pure formatter for keychain preflight header and status.
 */
export function formatPreflightReport({
  accountExists,
  malformedKeyError = null,
  publicAddress = null,
  balanceWei = null,
  deficitInfo = null,
  rpcHost = "studio-dev.genlayer.com",
  release = DEFAULT_RELEASE,
}) {
  const releaseConfig = resolveReleaseConfig(release);
  const lines = [];
  lines.push("======================================================================");
  lines.push(`MAKEWHOLE ${releaseConfig.release.toUpperCase()} KEYCHAIN OPERATOR PREFLIGHT`);
  lines.push("======================================================================");
  lines.push(`Selected Release  : ${releaseConfig.release}`);
  lines.push(`Keychain Service  : ${KEYCHAIN_SERVICE}`);
  lines.push(`Account Entry     : ${DEPLOYER_KEYCHAIN_KEY}`);
  lines.push(`Account Exists    : ${accountExists ? "YES" : "NO"}`);

  if (!accountExists) {
    lines.push("\n[STATUS] Account preparation is required.");
    lines.push(`Deployer account '${DEPLOYER_ACCOUNT_NAME}' is not present in the OS keychain.`);
    lines.push("To generate and register a dedicated deployer key locally, run:");
    lines.push("  node scripts/deploy-keychain.mjs --prepare-account\n");
  } else if (malformedKeyError) {
    lines.push("\n[STATUS] Keychain entry is malformed.");
    lines.push(`Error: ${malformedKeyError.message}\n`);
  } else {
    lines.push(`Deployer Address  : ${publicAddress}`);
    lines.push(`RPC Host          : ${rpcHost}`);
    if (balanceWei !== null) {
      lines.push(`Current Balance   : ${balanceWei.toString()} wei`);
      if (deficitInfo) {
        lines.push(`Target Balance    : ${deficitInfo.targetWei.toString()} wei (1 GEN)`);
        if (deficitInfo.needsFunding) {
          lines.push(`Funding Status    : DEFICIT (${deficitInfo.deficitWei.toString()} wei needed)`);
        } else {
          lines.push("Funding Status    : SUFFICIENT (balance >= 1 GEN)");
        }
      }
    }
  }
  lines.push("----------------------------------------------------------------------");
  return lines.join("\n");
}

/**
 * Preflight executor (Read-Only).
 * Checks keychain, derives public address, queries balance, runs dry-run, reports funding.
 * Fails closed with exitCode 1 if any condition is not met.
 * Never exposes the secret. Never signs or broadcasts.
 */
export async function executeKeychainPreflight({
  keytar,
  client = null,
  runDryRunFn = null,
  service = KEYCHAIN_SERVICE,
  deployerKey = DEPLOYER_KEYCHAIN_KEY,
  release = DEFAULT_RELEASE,
}) {
  const releaseConfig = resolveReleaseConfig(release);
  const rawKey = await keytar.getPassword(service, deployerKey);
  const accountExists = rawKey !== null && rawKey !== undefined && rawKey !== "";

  let publicAddress = null;
  let malformedKeyError = null;
  let balanceWei = null;
  let deficitInfo = null;
  let balanceLookupError = null;

  if (accountExists) {
    try {
      const normKey = normalizePrivateKey(rawKey);
      const account = privateKeyToAccount(normKey);
      publicAddress = account.address;
    } catch (e) {
      malformedKeyError = e;
    }

    if (publicAddress) {
      const rpcClient = client || createClient({
        chain: studioDevnet,
        endpoint: CANONICAL_RPC,
      });

      try {
        balanceWei = await rpcClient.getBalance({ address: publicAddress });
        deficitInfo = calculateFundingDeficit(balanceWei, MAX_TARGET_DEPLOYER_BALANCE_GEN);
      } catch (e) {
        balanceLookupError = e;
        console.warn(`[WARN] Could not query deployer balance: ${e.message}`);
      }
    }
  }

  const report = formatPreflightReport({
    accountExists,
    malformedKeyError,
    publicAddress,
    balanceWei,
    deficitInfo,
    release: releaseConfig.release,
  });
  console.log(report);

  // Run ordinary deployment dry-run for selected release
  console.log("\nExecuting ordinary deployment dry-run...\n");
  const deployScript = resolve(root, "scripts", "deploy.mjs");
  const dryRunArgs = [deployScript, "--dry-run", "--release", releaseConfig.release];

  let dryRunRes;
  if (runDryRunFn) {
    try {
      const fnRes = runDryRunFn(dryRunArgs);
      if (typeof fnRes === "number") {
        dryRunRes = { status: fnRes };
      } else if (fnRes && typeof fnRes === "object") {
        dryRunRes = fnRes;
      } else {
        dryRunRes = {
          status: null,
          error: new Error("runDryRunFn returned null or undefined result."),
        };
      }
    } catch (e) {
      dryRunRes = { status: null, error: e };
    }
  } else {
    dryRunRes = spawnSync(process.execPath, dryRunArgs, { stdio: "inherit" });
  }

  // Summary footer & readiness evaluation
  const readinessRes = evaluateKeychainReadiness({
    accountExists,
    malformedKeyError,
    publicAddress,
    balanceLookupError,
    balanceWei,
    deficitInfo,
    dryRunRes,
  });

  console.log("\n======================================================================");
  console.log(`KEYCHAIN OPERATOR READINESS SUMMARY (${releaseConfig.release.toUpperCase()})`);
  console.log("======================================================================");
  console.log(`Selected Release            : ${releaseConfig.release}`);
  console.log(`Keychain Operator Readiness : ${readinessRes.readiness}`);
  if (!readinessRes.ready) {
    console.log("Blockers:");
    readinessRes.blockers.forEach((b) => console.log(`  - ${b}`));
    console.log("\nDO NOT RUN deploy from keychain until every required readiness check passes.");
  } else {
    console.log("All keychain readiness criteria satisfied (account exists, funded >= 1 GEN, dry-run passed).");
  }
  console.log("======================================================================\n");

  return {
    release: releaseConfig.release,
    accountExists,
    publicAddress,
    balanceWei,
    deficitInfo,
    dryRunRes,
    dryRunArgs,
    readiness: readinessRes.readiness,
    ready: readinessRes.ready,
    exitCode: readinessRes.exitCode,
    blockers: readinessRes.blockers,
  };
}

/**
 * Account Preparation Mode (Local Only).
 * Generates fresh cryptographically secure private key iff entry does not exist.
 * Refuses to overwrite existing entry.
 * Never logs private key.
 */
export async function executePrepareAccount({
  keytar,
  service = KEYCHAIN_SERVICE,
  accountName = DEPLOYER_KEYCHAIN_KEY,
  generateKeyFn = generatePrivateKey,
}) {
  const existing = await keytar.getPassword(service, accountName);
  assertKeychainAccountCanBeCreated(existing);

  const freshKey = generateKeyFn();
  await keytar.setPassword(service, accountName, freshKey);
  const account = privateKeyToAccount(freshKey);

  return {
    success: true,
    service,
    account: accountName,
    publicAddress: account.address,
  };
}

/**
 * Guarded Future Funding Mode (Prepared in code, not executed in this task).
 * Transfers deficit to reach exactly 1 GEN from coverlock-submitter.
 */
export async function executeFundDeployer({
  keytar,
  confirmAddress,
  client = null,
  service = KEYCHAIN_SERVICE,
  deployerKey = DEPLOYER_KEYCHAIN_KEY,
  funderKey = FUNDER_KEYCHAIN_KEY,
  maxTargetGen = MAX_TARGET_DEPLOYER_BALANCE_GEN,
}) {
  if (!confirmAddress) {
    throw new Error("Missing required flag: --confirm-address 0x<address> must be specified.");
  }

  const rawDeployerKey = await keytar.getPassword(service, deployerKey);
  if (!rawDeployerKey) {
    throw new Error(`Deployer account '${deployerKey}' not found in OS keychain.`);
  }

  const normDeployerKey = normalizePrivateKey(rawDeployerKey);
  const deployerAccount = privateKeyToAccount(normDeployerKey);
  validateConfirmAddress(confirmAddress, deployerAccount.address);

  const rawFunderKey = await keytar.getPassword(service, funderKey);
  if (!rawFunderKey) {
    throw new Error(`Funder account '${funderKey}' not found in OS keychain.`);
  }

  const normFunderKey = normalizePrivateKey(rawFunderKey);
  const funderAccount = privateKeyToAccount(normFunderKey);

  const genClient = client || createClient({
    chain: studioDevnet,
    endpoint: CANONICAL_RPC,
    account: funderAccount,
  });

  const currentDeployerBalance = await genClient.getBalance({ address: deployerAccount.address });
  const deficitInfo = calculateFundingDeficit(currentDeployerBalance, maxTargetGen);

  if (!deficitInfo.needsFunding) {
    console.log(`[INFO] Deployer ${deployerAccount.address} already has sufficient balance: ${currentDeployerBalance.toString()} wei (>= 1 GEN).`);
    return {
      funded: false,
      reason: "ALREADY_SUFFICIENTLY_FUNDED",
      deployerAddress: deployerAccount.address,
      currentBalanceWei: currentDeployerBalance,
      targetWei: deficitInfo.targetWei,
      deficitWei: 0n,
    };
  }

  const funderBalance = await genClient.getBalance({ address: funderAccount.address });
  if (funderBalance < deficitInfo.deficitWei) {
    throw new Error(
      `Funder balance (${funderBalance.toString()} wei) is insufficient to fund deficit (${deficitInfo.deficitWei.toString()} wei).`
    );
  }

  console.log(`Transferring ${deficitInfo.deficitWei.toString()} wei from ${funderAccount.address} to ${deployerAccount.address}...`);
  const txHash = await genClient.sendTransaction({
    to: deployerAccount.address,
    value: deficitInfo.deficitWei,
  });

  console.log(`Funding transaction broadcasted: ${txHash}`);
  console.log("Waiting for transaction receipt (finalized)...");

  const receipt = await genClient.waitForTransactionReceipt({
    hash: txHash,
    waitUntil: "finalized",
    retries: 60,
  });

  const isFinalized = receipt?.statusName === "FINALIZED" || receipt?.status === "FINALIZED";
  if (!isFinalized) {
    throw new Error(`Funding transaction was not finalized: status '${receipt?.statusName || receipt?.status}'.`);
  }

  const execResult = receipt?.txExecutionResultName || receipt?.executionResult;
  if (execResult && execResult !== "FINISHED_WITH_RETURN" && execResult !== "SUCCESS") {
    throw new Error(
      `Funding transaction failed on-chain: execution result '${execResult}' (tx: ${txHash}).`
    );
  }

  const verifiedBalance = await genClient.getBalance({ address: deployerAccount.address });
  if (verifiedBalance < deficitInfo.targetWei) {
    const err = new Error(
      `Funding verification failed: resulting deployer balance (${verifiedBalance.toString()} wei) did not reach target (${deficitInfo.targetWei.toString()} wei). Deployer: ${deployerAccount.address}, Tx: ${txHash}.`
    );
    err.deployerAddress = deployerAccount.address;
    err.txHash = txHash;
    err.verifiedBalance = verifiedBalance;
    err.targetWei = deficitInfo.targetWei;
    throw err;
  }

  console.log(`[SUCCESS] Funding finalized. Resulting deployer balance: ${verifiedBalance.toString()} wei.`);

  return {
    funded: true,
    txHash,
    deployerAddress: deployerAccount.address,
    funderAddress: funderAccount.address,
    transferredWei: deficitInfo.deficitWei,
    verifiedBalanceWei: verifiedBalance,
  };
}

/**
 * Guarded Future Deployment Mode (Prepared in code, not executed in this task).
 * Spawns scripts/deploy.mjs --execute --update-env with key passed only via child env.
 * Purges secret immediately in finally block.
 * Fails closed if child process fails to spawn, terminates by signal, or exits nonzero.
 */
export async function executeDeployFromKeychain({
  keytar,
  confirmAddress,
  release = DEFAULT_RELEASE,
  client = null,
  service = KEYCHAIN_SERVICE,
  deployerKey = DEPLOYER_KEYCHAIN_KEY,
  rootPath = root,
  spawnFn = spawnSync,
}) {
  if (!confirmAddress) {
    throw new Error("Missing required flag: --confirm-address 0x<address> must be specified.");
  }

  const rawDeployerKey = await keytar.getPassword(service, deployerKey);
  if (!rawDeployerKey) {
    throw new Error(`Deployer account '${deployerKey}' not found in OS keychain.`);
  }

  const normDeployerKey = normalizePrivateKey(rawDeployerKey);
  const deployerAccount = privateKeyToAccount(normDeployerKey);
  validateConfirmAddress(confirmAddress, deployerAccount.address);

  const genClient = client || createClient({
    chain: studioDevnet,
    endpoint: CANONICAL_RPC,
  });

  const balance = await genClient.getBalance({ address: deployerAccount.address });
  const deficitInfo = calculateFundingDeficit(balance, MAX_TARGET_DEPLOYER_BALANCE_GEN);
  if (deficitInfo.needsFunding || balance < MAX_TARGET_DEPLOYER_BALANCE_WEI) {
    const err = new Error(
      `Deployer account ${deployerAccount.address} has insufficient balance (${balance.toString()} wei). Required target is 1 GEN (${MAX_TARGET_DEPLOYER_BALANCE_WEI.toString()} wei). Exact deficit: ${deficitInfo.deficitWei.toString()} wei. Account must be funded before deployment.`
    );
    err.currentBalanceWei = balance;
    err.requiredBalanceWei = MAX_TARGET_DEPLOYER_BALANCE_WEI;
    err.deficitWei = deficitInfo.deficitWei;
    throw err;
  }

  const releaseConfig = resolveReleaseConfig(release);
  const deployScript = resolve(rootPath, "scripts", "deploy.mjs");
  const childArgs = [deployScript, "--execute", "--update-env", "--release", releaseConfig.release];
  const childEnv = {
    ...process.env,
    GENLAYER_PRIVATE_KEY: normDeployerKey,
    GENLAYER_CHAIN_ID: CANONICAL_CHAIN_ID.toString(),
    GENLAYER_RPC_URL: CANONICAL_RPC,
  };

  let childRes;
  try {
    childRes = spawnFn(process.execPath, childArgs, {
      stdio: "inherit",
      env: childEnv,
    });
  } finally {
    delete childEnv.GENLAYER_PRIVATE_KEY;
  }

  if (childRes?.error) {
    throw new Error(`Deployment execution failed to spawn: ${childRes.error.message || childRes.error}`);
  }

  if (childRes?.signal) {
    throw new Error(`Deployment execution terminated by signal: ${childRes.signal}`);
  }

  if (childRes?.status === null || childRes?.status === undefined) {
    throw new Error("Deployment execution status is unavailable or null.");
  }

  if (childRes.status !== 0) {
    const err = new Error(`Deployment execution failed with exit code ${childRes.status}.`);
    err.exitCode = childRes.status;
    throw err;
  }

  return {
    deployerAddress: deployerAccount.address,
    exitCode: 0,
    release: releaseConfig.release,
    spawnArgs: childArgs,
  };
}

// CLI Dispatcher
async function main() {
  let parsed;
  try {
    parsed = parseKeychainArgs();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  const { mode, confirmAddress, confirmContractAddress, release } = parsed;

  if (mode === "recover") {
    console.log("======================================================================");
    console.log(`MAKEWHOLE ${release.toUpperCase()} KEYCHAIN OPERATOR: RECOVER DEPLOYMENT`);
    console.log("======================================================================");
    try {
      const res = await executeRecovery({ confirmAddress, confirmContractAddress, release });
      console.log(`\n[SUCCESS] Deployment successfully recovered.`);
      console.log(`Contract Address : ${res.contractAddress}`);
      console.log(`Transaction Hash : ${res.deploymentTxHash}`);
      console.log(`Receipt Artifact : ${res.receiptFile}`);
      console.log(`Environment      : web/.env.local updated`);
      console.log(`Pending Journal  : ${res.pendingJournalStatus || "removed"}`);
    } catch (e) {
      console.error(`\n[FAILURE] Recovery error: ${e.message}`);
      if (e.pendingDeletionFailed) {
        console.error("Receipt and environment were updated locally, but the pending journal could not be deleted.");
        console.error("The pending journal is preserved for an idempotent recovery rerun.");
      }
      console.error("DO NOT REDEPLOY.");
      process.exit(1);
    }
    return;
  }

  let keytar;
  try {
    keytar = resolveKeytar();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  if (mode === "prepare-account") {
    console.log("======================================================================");
    console.log("MAKEWHOLE v2 ACCOUNT PREPARATION (LOCAL ONLY)");
    console.log("======================================================================");
    try {
      const res = await executePrepareAccount({ keytar });
      console.log(`Registered Entry : ${res.account}`);
      console.log(`OS Service       : ${res.service}`);
      console.log(`Public Address   : ${res.publicAddress}`);
      console.log("\n[SUCCESS] Dedicated deployer account created successfully in OS keychain.");
      console.log("No network transaction performed. No funds transferred.");
      console.log("Next step: Run preflight to inspect balance and network readiness:");
      console.log("  npm run deploy:keychain:preflight");
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (mode === "fund") {
    console.log("======================================================================");
    console.log("MAKEWHOLE v2 KEYCHAIN OPERATOR: FUND DEPLOYER");
    console.log("======================================================================");
    try {
      await executeFundDeployer({ keytar, confirmAddress });
    } catch (e) {
      console.error(`Funding Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (mode === "deploy") {
    console.log("======================================================================");
    console.log(`MAKEWHOLE ${release.toUpperCase()} KEYCHAIN OPERATOR: DEPLOY`);
    console.log("======================================================================");
    try {
      const res = await executeDeployFromKeychain({ keytar, confirmAddress, release });
      process.exit(res.exitCode);
    } catch (e) {
      console.error(`Deployment Error: ${e.message}`);
      process.exit(e.exitCode !== undefined ? e.exitCode : 1);
    }
    return;
  }

  // Default mode: preflight
  try {
    const res = await executeKeychainPreflight({ keytar, release });
    process.exit(res.exitCode);
  } catch (e) {
    console.error(`Preflight Error: ${e.message}`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((e) => {
    console.error("Unhandled error:", e.message);
    process.exit(1);
  });
}
