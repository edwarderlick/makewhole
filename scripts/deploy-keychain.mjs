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
  MAX_TARGET_DEPLOYER_BALANCE_GEN,
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
  let mode = "preflight";
  let confirmAddress = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--prepare-account") {
      if (mode !== "preflight") throw new Error("Cannot combine mode flags. Specify only one mode.");
      mode = "prepare-account";
    } else if (arg === "--fund") {
      if (mode !== "preflight") throw new Error("Cannot combine mode flags. Specify only one mode.");
      mode = "fund";
    } else if (arg === "--deploy") {
      if (mode !== "preflight") throw new Error("Cannot combine mode flags. Specify only one mode.");
      mode = "deploy";
    } else if (arg === "--preflight") {
      if (mode !== "preflight") throw new Error("Cannot combine mode flags. Specify only one mode.");
      mode = "preflight";
    } else if (arg === "--confirm-address") {
      i++;
      if (i >= args.length || !args[i]) {
        throw new Error("--confirm-address requires an address value.");
      }
      confirmAddress = args[i];
    } else if (arg.startsWith("--confirm-address=")) {
      confirmAddress = arg.slice("--confirm-address=".length);
    } else {
      throw new Error(`Unknown argument '${arg}'.`);
    }
  }

  return { mode, confirmAddress };
}

/**
 * Pure formatter for keychain preflight header and status.
 */
export function formatPreflightReport({
  accountExists,
  publicAddress = null,
  balanceWei = null,
  deficitInfo = null,
  rpcHost = "studio-dev.genlayer.com",
}) {
  const lines = [];
  lines.push("======================================================================");
  lines.push("MAKEWHOLE v2 KEYCHAIN OPERATOR PREFLIGHT");
  lines.push("======================================================================");
  lines.push(`Keychain Service  : ${KEYCHAIN_SERVICE}`);
  lines.push(`Account Entry     : ${DEPLOYER_KEYCHAIN_KEY}`);
  lines.push(`Account Exists    : ${accountExists ? "YES" : "NO"}`);

  if (!accountExists) {
    lines.push("\n[STATUS] Account preparation is required.");
    lines.push(`Deployer account '${DEPLOYER_ACCOUNT_NAME}' is not present in the OS keychain.`);
    lines.push("To generate and register a dedicated deployer key locally, run:");
    lines.push("  node scripts/deploy-keychain.mjs --prepare-account\n");
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
 * Never exposes the secret. Never signs or broadcasts.
 */
export async function executeKeychainPreflight({
  keytar,
  client = null,
  runDryRunFn = null,
  service = KEYCHAIN_SERVICE,
  deployerKey = DEPLOYER_KEYCHAIN_KEY,
}) {
  const rawKey = await keytar.getPassword(service, deployerKey);
  const accountExists = rawKey !== null && rawKey !== undefined && rawKey !== "";

  let publicAddress = null;
  let balanceWei = null;
  let deficitInfo = null;

  if (accountExists) {
    const normKey = normalizePrivateKey(rawKey);
    const account = privateKeyToAccount(normKey);
    publicAddress = account.address;

    const rpcClient = client || createClient({
      chain: studioDevnet,
      endpoint: CANONICAL_RPC,
    });

    try {
      balanceWei = await rpcClient.getBalance({ address: publicAddress });
      deficitInfo = calculateFundingDeficit(balanceWei, MAX_TARGET_DEPLOYER_BALANCE_GEN);
    } catch (e) {
      console.warn(`[WARN] Could not query deployer balance: ${e.message}`);
    }
  }

  const report = formatPreflightReport({
    accountExists,
    publicAddress,
    balanceWei,
    deficitInfo,
  });
  console.log(report);

  // Run ordinary deployment dry-run
  console.log("\nExecuting ordinary deployment dry-run...\n");
  if (runDryRunFn) {
    runDryRunFn();
  } else {
    const deployScript = resolve(root, "scripts", "deploy.mjs");
    spawnSync(process.execPath, [deployScript, "--dry-run"], { stdio: "inherit" });
  }

  // Summary footer
  console.log("\n======================================================================");
  console.log("KEYCHAIN OPERATOR READINESS SUMMARY");
  console.log("======================================================================");
  if (!accountExists) {
    console.log("Deployer Account  : ABSENT (account:makewhole-deployer-v2)");
    console.log("Action Required   : Run 'node scripts/deploy-keychain.mjs --prepare-account'");
  } else {
    console.log(`Deployer Account  : ${publicAddress}`);
    if (balanceWei !== null && deficitInfo) {
      console.log(`Current Balance   : ${balanceWei.toString()} wei`);
      if (deficitInfo.needsFunding) {
        console.log(`Funding Required  : YES (Deficit: ${deficitInfo.deficitWei.toString()} wei to reach 1 GEN)`);
        console.log(`Action Required   : Review and run future funding mode when ready:`);
        console.log(`                    node scripts/deploy-keychain.mjs --fund --confirm-address ${publicAddress}`);
      } else {
        console.log("Funding Required  : NO (Deployer has sufficient balance >= 1 GEN)");
      }
    }
  }
  console.log("======================================================================\n");

  return {
    accountExists,
    publicAddress,
    balanceWei,
    deficitInfo,
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

  const verifiedBalance = await genClient.getBalance({ address: deployerAccount.address });
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
 */
export async function executeDeployFromKeychain({
  keytar,
  confirmAddress,
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
  if (balance <= 0n) {
    throw new Error(
      `Deployer account ${deployerAccount.address} has 0 balance. Account must be funded before deployment.`
    );
  }

  const deployScript = resolve(rootPath, "scripts", "deploy.mjs");
  const childEnv = {
    ...process.env,
    GENLAYER_PRIVATE_KEY: normDeployerKey,
    GENLAYER_CHAIN_ID: CANONICAL_CHAIN_ID.toString(),
    GENLAYER_RPC_URL: CANONICAL_RPC,
  };

  let childRes;
  try {
    childRes = spawnFn(process.execPath, [deployScript, "--execute", "--update-env"], {
      stdio: "inherit",
      env: childEnv,
    });
  } finally {
    delete childEnv.GENLAYER_PRIVATE_KEY;
  }

  return {
    deployerAddress: deployerAccount.address,
    exitCode: childRes?.status ?? 0,
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

  const { mode, confirmAddress } = parsed;

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
    console.log("MAKEWHOLE v2 KEYCHAIN OPERATOR: DEPLOY");
    console.log("======================================================================");
    try {
      const res = await executeDeployFromKeychain({ keytar, confirmAddress });
      process.exit(res.exitCode);
    } catch (e) {
      console.error(`Deployment Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  // Default mode: preflight
  try {
    await executeKeychainPreflight({ keytar });
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
