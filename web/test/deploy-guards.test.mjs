import test from "node:test";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  parseDeploymentArgs,
  checkReleaseSourceGate,
  validateFeeQuote,
  validateDeployReceipt,
  normalizeDeployReceipt,
  validatePendingJournal,
  validateReceiptArtifact,
  validateRecoverySourceIntegrity,
  validateReceiptMatchesJournal,
  executeRecovery,
  validateFreshContractState,
  updateEnvContent,
  ZERO_ADDRESS,
  evaluatePreflightReadiness,
  formatDeploymentPlan,
  getPreflightExitCode,
  validateDeployerBalance,
  assertNoDeploymentCollisions,
  createPendingJournalIntent,
  markPendingJournalBroadcast,
  validateConfirmAddress,
  calculateFundingDeficit,
  assertKeychainAccountCanBeCreated,
  RECEIPT_FILENAME,
  PENDING_JOURNAL_FILENAME,
  MAX_TARGET_DEPLOYER_BALANCE_GEN,
  MAX_TARGET_DEPLOYER_BALANCE_WEI,
  CRITICAL_RELEASE_FILES,
  TX_HASH_REGEX,
  REQUIRED_V2_METHODS,
  resolveReleaseConfig,
  DEFAULT_RELEASE,
  DEPLOYMENT_RELEASES,
  CANONICAL_DEPLOYER_ADDRESS,
} from "../../scripts/deploy-helpers.mjs";
import { execSync } from "node:child_process";

import {
  parseKeychainArgs,
  formatPreflightReport,
  evaluateKeychainReadiness,
  executePrepareAccount,
  executeKeychainPreflight,
  executeFundDeployer,
  executeDeployFromKeychain,
  KEYCHAIN_SERVICE,
  DEPLOYER_KEYCHAIN_KEY,
  FUNDER_KEYCHAIN_KEY,
} from "../../scripts/deploy-keychain.mjs";

test("CLI argument parsing: default invocation with no arguments remains dry-run", () => {
  const result = parseDeploymentArgs([]);
  assert.deepStrictEqual(result, {
    mode: "dry-run",
    updateEnv: false,
    release: "v2",
  });
});

test("CLI argument parsing: explicit --dry-run produces dry-run mode", () => {
  const result = parseDeploymentArgs(["--dry-run"]);
  assert.deepStrictEqual(result, {
    mode: "dry-run",
    updateEnv: false,
    release: "v2",
  });
});

test("CLI argument parsing: explicit --execute produces execute mode", () => {
  const result = parseDeploymentArgs(["--execute"]);
  assert.deepStrictEqual(result, {
    mode: "execute",
    updateEnv: false,
    release: "v2",
  });
});

test("CLI argument parsing: --execute combined with --update-env is accepted", () => {
  const result = parseDeploymentArgs(["--execute", "--update-env"]);
  assert.deepStrictEqual(result, {
    mode: "execute",
    updateEnv: true,
    release: "v2",
  });
});

test("CLI argument parsing: omitted --release defaults to v2", () => {
  const result = parseDeploymentArgs([]);
  assert.strictEqual(result.release, "v2");
});

test("CLI argument parsing: explicit v2 selection (both space and equals)", () => {
  const space = parseDeploymentArgs(["--release", "v2"]);
  assert.strictEqual(space.release, "v2");
  const equals = parseDeploymentArgs(["--release=v2"]);
  assert.strictEqual(equals.release, "v2");
});

test("CLI argument parsing: explicit v2.1 selection (both space and equals)", () => {
  const space = parseDeploymentArgs(["--release", "v2.1"]);
  assert.strictEqual(space.release, "v2.1");
  const equals = parseDeploymentArgs(["--release=v2.1"]);
  assert.strictEqual(equals.release, "v2.1");
});

test("CLI argument parsing: unknown release rejection", () => {
  assert.throws(() => parseDeploymentArgs(["--release", "v3"]), /Unknown release 'v3'/);
  assert.throws(() => parseDeploymentArgs(["--release=v1"]), /Unknown release 'v1'/);
  assert.throws(() => parseDeploymentArgs(["--release", "v2.2"]), /Unknown release 'v2.2'/);
  assert.throws(() => parseDeploymentArgs(["--release", "latest"]), /Unknown release 'latest'/);
});

test("CLI argument parsing: duplicate --release rejection", () => {
  assert.throws(() => parseDeploymentArgs(["--release", "v2", "--release", "v2.1"]), /Duplicate --release argument/);
  assert.throws(() => parseDeploymentArgs(["--release=v2", "--release=v2.1"]), /Duplicate --release argument/);
  assert.throws(() => parseDeploymentArgs(["--release", "v2", "--release=v2"]), /Duplicate --release argument/);
});

test("CLI argument parsing: missing release value rejection", () => {
  assert.throws(() => parseDeploymentArgs(["--release"]), /Missing value for --release argument/);
  assert.throws(() => parseDeploymentArgs(["--release="]), /Missing value for --release argument/);
  assert.throws(() => parseDeploymentArgs(["--release", "--execute"]), /Missing value for --release argument/);
});

test("CLI argument parsing: traversal/absolute-path rejection", () => {
  assert.throws(() => parseDeploymentArgs(["--release", "../v2"]), /path traversal and absolute paths are prohibited/);
  assert.throws(() => parseDeploymentArgs(["--release", "/v2.1"]), /path traversal and absolute paths are prohibited/);
  assert.throws(() => parseDeploymentArgs(["--release=..\\v2.1"]), /path traversal and absolute paths are prohibited/);
  assert.throws(() => parseDeploymentArgs(["--release", "C:\\v2"]), /path traversal and absolute paths are prohibited/);
});

test("Keychain CLI parsing: --release handling and validation", () => {
  assert.strictEqual(parseKeychainArgs(["--preflight"]).release, "v2");
  assert.strictEqual(parseKeychainArgs(["--preflight", "--release", "v2.1"]).release, "v2.1");
  assert.strictEqual(parseKeychainArgs(["--preflight", "--release=v2.1"]).release, "v2.1");
  assert.strictEqual(parseKeychainArgs(["--preflight", "--release=v2"]).release, "v2");
  assert.throws(() => parseKeychainArgs(["--preflight", "--release", "v3"]), /Unknown release 'v3'/);
  assert.throws(() => parseKeychainArgs(["--preflight", "--release", "v2", "--release", "v2.1"]), /Duplicate --release argument/);
  assert.throws(() => parseKeychainArgs(["--preflight", "--release"]), /Missing value for --release argument/);
  assert.throws(() => parseKeychainArgs(["--preflight", "--release="]), /Missing value for --release argument/);
  assert.throws(() => parseKeychainArgs(["--preflight", "--release", "../v2"]), /path traversal and absolute paths are prohibited/);
});

test("CLI argument parsing: unknown arguments are strictly rejected with exit-worthy error", () => {
  assert.throws(() => parseDeploymentArgs(["--unknown-option"]), /Unknown argument '--unknown-option'/);
  assert.throws(() => parseDeploymentArgs(["deploy"]), /Unknown argument 'deploy'/);
  assert.throws(() => parseDeploymentArgs(["--allow-dirty"]), /Unknown argument '--allow-dirty'/);
  assert.throws(() => parseDeploymentArgs(["--execute", "--foo"]), /Unknown argument '--foo'/);
});

test("CLI argument parsing: mutually exclusive modes (--dry-run and --execute) are rejected", () => {
  assert.throws(() => parseDeploymentArgs(["--dry-run", "--execute"]), /Cannot combine --dry-run and --execute/);
  assert.throws(() => parseDeploymentArgs(["--execute", "--dry-run"]), /Cannot combine --dry-run and --execute/);
});

test("CLI argument parsing: --update-env without --execute is rejected", () => {
  assert.throws(() => parseDeploymentArgs(["--update-env"]), /--update-env can only be specified when --execute is active/);
  assert.throws(
    () => parseDeploymentArgs(["--dry-run", "--update-env"]),
    /--update-env can only be specified when --execute is active/
  );
});

test("Receipt validation: accepted receipt is strictly rejected as not finalized", () => {
  const receipt = {
    statusName: "ACCEPTED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    txDataDecoded: {
      type: "deploy",
      contractAddress: "0x1111111111111111111111111111111111111111",
    },
  };
  assert.throws(() => validateDeployReceipt(receipt), /status 'ACCEPTED' is not FINALIZED/);
});

test("Receipt validation: non-FINISHED_WITH_RETURN execution results (including SUCCESS) are rejected", () => {
  const receiptSuccess = {
    statusName: "FINALIZED",
    txExecutionResultName: "SUCCESS",
    txDataDecoded: {
      type: "deploy",
      contractAddress: "0x1111111111111111111111111111111111111111",
    },
  };
  assert.throws(() => validateDeployReceipt(receiptSuccess), /Execution result 'SUCCESS' is not FINISHED_WITH_RETURN/);

  const receiptRevert = {
    statusName: "FINALIZED",
    txExecutionResultName: "REVERTED",
    txDataDecoded: {
      type: "deploy",
      contractAddress: "0x1111111111111111111111111111111111111111",
    },
  };
  assert.throws(() => validateDeployReceipt(receiptRevert), /is not FINISHED_WITH_RETURN/);
});

test("Receipt validation: non-deploy decoded transaction type is rejected", () => {
  const receiptCall = {
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    txDataDecoded: {
      type: "call",
      contractAddress: "0x1111111111111111111111111111111111111111",
    },
  };
  assert.throws(() => validateDeployReceipt(receiptCall), /decoded type 'call' is not 'deploy'/);

  const receiptNoData = {
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
  };
  assert.throws(() => validateDeployReceipt(receiptNoData), /decoded type 'undefined' is not 'deploy'/);
});

test("Receipt validation: malformed and zero address are rejected", () => {
  const zeroAddrReceipt = {
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    txDataDecoded: {
      type: "deploy",
      contractAddress: ZERO_ADDRESS,
    },
  };
  assert.throws(() => validateDeployReceipt(zeroAddrReceipt), /not a valid nonzero 20-byte 0x address/);

  const malformedReceipt = {
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    txDataDecoded: {
      type: "deploy",
      contractAddress: "0xnot-a-valid-address",
    },
  };
  assert.throws(() => validateDeployReceipt(malformedReceipt), /not a valid nonzero 20-byte 0x address/);
});

test("Receipt validation: recipient/contractAddress mismatch is rejected", () => {
  const mismatchReceipt = {
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    recipient: "0x2222222222222222222222222222222222222222",
    txDataDecoded: {
      type: "deploy",
      contractAddress: "0x1111111111111111111111111111111111111111",
    },
  };
  assert.throws(() => validateDeployReceipt(mismatchReceipt), /Recipient '0x2222222222222222222222222222222222222222' does not match/);
});

test("Receipt validation: finalized successful deploy receipt is accepted", () => {
  const validReceipt = {
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    recipient: "0x1111111111111111111111111111111111111111",
    txDataDecoded: {
      type: "deploy",
      contractAddress: "0x1111111111111111111111111111111111111111",
    },
  };
  const addr = validateDeployReceipt(validReceipt);
  assert.strictEqual(addr, "0x1111111111111111111111111111111111111111");

  // Case-insensitive recipient match is accepted
  const mixedCaseReceipt = {
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    recipient: "0xAbCdEf1234567890123456789012345678901234",
    txDataDecoded: {
      type: "deploy",
      contractAddress: "0xabcdef1234567890123456789012345678901234",
    },
  };
  assert.strictEqual(validateDeployReceipt(mixedCaseReceipt), "0xabcdef1234567890123456789012345678901234");
});

test("Fee estimation validation: missing or invalid fee quotes fail closed without guessed fallback", () => {
  assert.throws(() => validateFeeQuote(null), /quote is not an object/);
  assert.throws(() => validateFeeQuote({}), /missing distribution object/);

  // Missing allocation fields
  assert.throws(
    () => validateFeeQuote({ distribution: {}, feeValue: 100n }),
    /distribution missing required allocation fields/
  );

  // Missing feeValue
  const dist = {
    leaderTimeunitsAllocation: 100n,
    validatorTimeunitsAllocation: 200n,
    executionBudgetPerRound: 25000000000000000n,
  };
  assert.throws(() => validateFeeQuote({ distribution: dist }), /missing feeValue/);

  // Zero feeValue
  assert.throws(() => validateFeeQuote({ distribution: dist, feeValue: 0n }), /feeValue must be positive/);
  assert.throws(() => validateFeeQuote({ distribution: dist, feeValue: "0" }), /feeValue must be positive/);

  // Negative feeValue
  assert.throws(() => validateFeeQuote({ distribution: dist, feeValue: -1n }), /feeValue must be positive/);

  // Valid fee quote
  const valid = validateFeeQuote({ distribution: dist, feeValue: 50000000000000000n });
  assert.strictEqual(valid.feeValue, 50000000000000000n);
  assert.deepStrictEqual(valid.distribution, dist);
});

test("Committed-source gate: SHA mismatch, uncommitted changes, or missing HEAD are blocked", () => {
  // SHA mismatch
  const shaMismatch = checkReleaseSourceGate({
    headCommit: "0123456789abcdef0123456789abcdef01234567",
    committedCode: "def foo(): return 1",
    workingCode: "def foo(): return 2",
    porcelainStatus: "",
  });
  assert.strictEqual(shaMismatch.passed, false);
  assert.match(shaMismatch.issues[0], /does not match committed HEAD SHA-256/);

  // Porcelain status dirty
  const dirty = checkReleaseSourceGate({
    headCommit: "0123456789abcdef0123456789abcdef01234567",
    committedCode: "def foo(): return 1",
    workingCode: "def foo(): return 1",
    porcelainStatus: " M contracts/makewhole.py\n",
  });
  assert.strictEqual(dirty.passed, false);
  assert.match(dirty.issues[0], /Uncommitted changes detected in critical release files/);

  // Missing committed code
  const missingCommitted = checkReleaseSourceGate({
    headCommit: "0123456789abcdef0123456789abcdef01234567",
    committedCode: null,
    workingCode: "def foo(): return 1",
    porcelainStatus: "",
  });
  assert.strictEqual(missingCommitted.passed, false);

  // Perfect match
  const clean = checkReleaseSourceGate({
    headCommit: "0123456789abcdef0123456789abcdef01234567",
    committedCode: "def foo(): return 1",
    workingCode: "def foo(): return 1",
    porcelainStatus: "",
  });
  assert.strictEqual(clean.passed, true);
  assert.strictEqual(clean.issues.length, 0);
  assert.strictEqual(clean.workingSha, clean.committedSha);

  // CRLF vs LF normalization match
  const crlfMatch = checkReleaseSourceGate({
    headCommit: "0123456789abcdef0123456789abcdef01234567",
    committedCode: "def foo():\n    return 1\n",
    workingCode: "def foo():\r\n    return 1\r\n",
    porcelainStatus: "",
  });
  assert.strictEqual(crlfMatch.passed, true);
  assert.strictEqual(crlfMatch.issues.length, 0);
  assert.strictEqual(crlfMatch.workingSha, crlfMatch.committedSha);
});

test("Deployed contract verification: requires full v2 schema, 0 initial jobs, and zeroed economics", () => {
  const validSchema = makeFullV2MockSchema();

  const zeroEconomics = {
    pool: 0n,
    locked_bonds: "0",
    locked_jobs: 0,
    credits: 0n,
    slash_count: 0,
    settled_ok: 0,
    settled_rug: 0,
  };

  // Valid fresh contract
  assert.strictEqual(
    validateFreshContractState({
      schema: validSchema,
      ids: [],
      economics: zeroEconomics,
    }),
    true
  );

  // Missing schema method
  const incompleteSchema = makeFullV2MockSchema();
  delete incompleteSchema.methods.get_reserved_bond;
  assert.throws(
    () =>
      validateFreshContractState({
        schema: incompleteSchema,
        ids: [],
        economics: zeroEconomics,
      }),
    /missing required v2 method 'get_reserved_bond'/
  );

  // Non-empty jobs
  assert.throws(
    () =>
      validateFreshContractState({
        schema: validSchema,
        ids: ["0xjob1"],
        economics: zeroEconomics,
      }),
    /Freshly deployed contract must have 0 jobs/
  );

  // Non-zero economics
  assert.throws(
    () =>
      validateFreshContractState({
        schema: validSchema,
        ids: [],
        economics: { ...zeroEconomics, pool: 1000n },
      }),
    /get_economics\(\)\.pool must be 0/
  );
});

test("Environment update: replaces only target keys, preserves comments, blanks, ordering, and unrelated keys", () => {
  const existingEnv = [
    "# Makewhole Web Environment",
    "NEXT_PUBLIC_APP_TITLE=Makewhole Protocol",
    "NEXT_PUBLIC_UNRELATED_FEATURE=enabled",
    "",
    "# Contract Settings",
    "NEXT_PUBLIC_CONTRACT_ADDRESS=0x04A81C6B4AC43Ee9cea73B203d9Ed9ca0b89F0EF",
    "NEXT_PUBLIC_CHAIN_ID=61997",
    "NEXT_PUBLIC_STUDIO_RPC=https://studio-dev.genlayer.com/api",
    "NEXT_PUBLIC_STUDIO_EXPLORER=https://explorer-studio-dev.genlayer.com",
    "GENLAYER_STUDIO_URL=https://studio-dev.genlayer.com/api",
    "",
    "# Analytics & Telemetry",
    "NEXT_PUBLIC_ANALYTICS_ID=analytics_12345",
    "SECRET_API_GATEWAY=https://internal.gateway",
  ].join("\n");

  const replacements = {
    NEXT_PUBLIC_CONTRACT_ADDRESS: "0xNewV2ContractAddress99999999999999999999",
    NEXT_PUBLIC_CHAIN_ID: "61997",
    NEXT_PUBLIC_STUDIO_RPC: "https://studio-dev.genlayer.com/api",
    NEXT_PUBLIC_STUDIO_EXPLORER: "https://explorer-studio-dev.genlayer.com",
    GENLAYER_STUDIO_URL: "https://studio-dev.genlayer.com/api",
  };

  const updated = updateEnvContent(existingEnv, replacements);

  // Unrelated NEXT_PUBLIC_* variables MUST be preserved
  assert.match(updated, /NEXT_PUBLIC_APP_TITLE=Makewhole Protocol/);
  assert.match(updated, /NEXT_PUBLIC_UNRELATED_FEATURE=enabled/);
  assert.match(updated, /NEXT_PUBLIC_ANALYTICS_ID=analytics_12345/);
  assert.match(updated, /SECRET_API_GATEWAY=https:\/\/internal\.gateway/);

  // Comments and blanks preserved
  assert.match(updated, /# Makewhole Web Environment/);
  assert.match(updated, /# Contract Settings/);
  assert.match(updated, /# Analytics & Telemetry/);

  // Target contract address updated in-place
  assert.match(updated, /NEXT_PUBLIC_CONTRACT_ADDRESS=0xNewV2ContractAddress99999999999999999999/);
  assert.doesNotMatch(updated, /0x04A81C6B4AC43Ee9cea73B203d9Ed9ca0b89F0EF/);
});

test("Preflight readiness: all checks pass => READY", () => {
  const result = evaluatePreflightReadiness({
    sourceGatePassed: true,
    rpcProbePassed: true,
    rpcChainMatched: true,
    feeEstimatePassed: true,
  });
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.blockers.length, 0);
});

test("Preflight readiness: source gate failure => BLOCKED", () => {
  const result = evaluatePreflightReadiness({
    sourceGatePassed: false,
    rpcProbePassed: true,
    rpcChainMatched: true,
    feeEstimatePassed: true,
  });
  assert.strictEqual(result.ready, false);
  assert.strictEqual(result.blockers.length, 1);
  assert.match(result.blockers[0], /source gate/i);
});

test("Preflight readiness: RPC timeout/failure => BLOCKED", () => {
  const result = evaluatePreflightReadiness({
    sourceGatePassed: true,
    rpcProbePassed: false,
    rpcChainMatched: false,
    feeEstimatePassed: true,
  });
  assert.strictEqual(result.ready, false);
  assert.match(result.blockers.join(" "), /RPC probe failed or timed out/i);
});

test("Preflight readiness: chain mismatch => BLOCKED", () => {
  const result = evaluatePreflightReadiness({
    sourceGatePassed: true,
    rpcProbePassed: true,
    rpcChainMatched: false,
    feeEstimatePassed: true,
  });
  assert.strictEqual(result.ready, false);
  assert.strictEqual(result.blockers.length, 1);
  assert.match(result.blockers[0], /chain ID does not match/i);
});

test("Preflight readiness: fee estimation failure => BLOCKED", () => {
  const result = evaluatePreflightReadiness({
    sourceGatePassed: true,
    rpcProbePassed: true,
    rpcChainMatched: true,
    feeEstimatePassed: false,
  });
  assert.strictEqual(result.ready, false);
  assert.strictEqual(result.blockers.length, 1);
  assert.match(result.blockers[0], /fee estimation/i);
});

test("Preflight readiness: multiple failures produce all blocker reasons", () => {
  const result = evaluatePreflightReadiness({
    sourceGatePassed: false,
    rpcProbePassed: false,
    rpcChainMatched: false,
    feeEstimatePassed: false,
  });
  assert.strictEqual(result.ready, false);
  assert.strictEqual(result.blockers.length, 4);
  assert.match(result.blockers[0], /source gate/i);
  assert.match(result.blockers[1], /RPC probe/i);
  assert.match(result.blockers[2], /chain ID/i);
  assert.match(result.blockers[3], /fee estimation/i);
});

test("Preflight readiness: historical v1 status does not alter required readiness", () => {
  const v1Failed = evaluatePreflightReadiness({
    sourceGatePassed: true,
    rpcProbePassed: true,
    rpcChainMatched: true,
    feeEstimatePassed: true,
    historicalV1Passed: false,
  });
  assert.strictEqual(v1Failed.ready, true);
  assert.strictEqual(v1Failed.blockers.length, 0);

  const v1Passed = evaluatePreflightReadiness({
    sourceGatePassed: true,
    rpcProbePassed: true,
    rpcChainMatched: true,
    feeEstimatePassed: true,
    historicalV1Passed: true,
  });
  assert.strictEqual(v1Passed.ready, true);
  assert.strictEqual(v1Passed.blockers.length, 0);
});

test("Preflight plan & exit code: blocked readiness sets exit code 1, prints blockers, suppresses execute command", () => {
  const blocked = evaluatePreflightReadiness({
    sourceGatePassed: true,
    rpcProbePassed: false,
    rpcChainMatched: false,
    feeEstimatePassed: false,
  });
  assert.strictEqual(getPreflightExitCode(blocked), 1);

  const plan = formatDeploymentPlan({
    readiness: blocked,
    networkName: "GenLayer Studio-dev",
    chainId: 61997,
    rpcUrl: "https://studio-dev.genlayer.com/api",
    historicalV1Status: "UNREACHABLE (informational only)",
  });

  assert.match(plan, /Deployment Readiness: BLOCKED/);
  assert.match(plan, /DO NOT PROCEED with deployment until every required readiness check passes\./);
  assert.doesNotMatch(plan, /deploy:execute/);
  assert.doesNotMatch(plan, /GENLAYER_PRIVATE_KEY/);
  assert.match(plan, /Target network RPC probe failed or timed out\./);
  assert.match(plan, /Deployment transaction fee estimation failed/);
});

test("Preflight plan & exit code: ready status permits exit 0 and prints secure keychain command", () => {
  const ready = evaluatePreflightReadiness({
    sourceGatePassed: true,
    rpcProbePassed: true,
    rpcChainMatched: true,
    feeEstimatePassed: true,
  });
  assert.strictEqual(getPreflightExitCode(ready), 0);

  const plan = formatDeploymentPlan({
    readiness: ready,
    networkName: "GenLayer Studio-dev",
    chainId: 61997,
    rpcUrl: "https://studio-dev.genlayer.com/api",
    historicalV1Status: "REACHABLE: 22 methods, 12 jobs",
  });

  assert.match(plan, /Deployment Readiness: READY/);
  assert.match(plan, /node scripts\/deploy-keychain\.mjs --deploy --release v2 --confirm-address 0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf/);
  assert.doesNotMatch(plan, /GENLAYER_PRIVATE_KEY/);
  assert.doesNotMatch(plan, /deploy:execute/);
  assert.doesNotMatch(plan, /DO NOT PROCEED/);
});

// ============================================================================
// BALANCE GATE TESTS (scripts/deploy-helpers.mjs)
// ============================================================================

test("Balance validation: balance greater than fee => pass", () => {
  const res = validateDeployerBalance(500_000n, 200_000n);
  assert.strictEqual(res.sufficient, true);
  assert.strictEqual(res.balance, 500_000n);
  assert.strictEqual(res.feeValue, 200_000n);
  assert.strictEqual(res.remaining, 300_000n);
});

test("Balance validation: balance equal to fee => pass", () => {
  const res = validateDeployerBalance(250_000n, 250_000n);
  assert.strictEqual(res.sufficient, true);
  assert.strictEqual(res.balance, 250_000n);
  assert.strictEqual(res.feeValue, 250_000n);
  assert.strictEqual(res.remaining, 0n);
});

test("Balance validation: insufficient balance => fail", () => {
  assert.throws(
    () => validateDeployerBalance(100_000n, 300_000n),
    (err) => {
      assert.strictEqual(err.code, "INSUFFICIENT_BALANCE");
      assert.strictEqual(err.balance, 100_000n);
      assert.strictEqual(err.feeValue, 300_000n);
      assert.strictEqual(err.deficit, 200_000n);
      assert.match(err.message, /Insufficient deployer balance/);
      return true;
    }
  );
});

test("Balance validation: malformed balance or fee => fail", () => {
  assert.throws(() => validateDeployerBalance("not_a_number", 100n), /Invalid balance or feeValue/);
  assert.throws(() => validateDeployerBalance(100n, "not_a_number"), /Invalid balance or feeValue/);
  assert.throws(() => validateDeployerBalance(-10n, 100n), /negative amounts are not permitted/);
  assert.throws(() => validateDeployerBalance(100n, -5n), /negative amounts are not permitted/);
});

test("Balance validation: insufficient deployer balance blocks deployment", () => {
  // Simulates balance check before deployContract
  const feeValue = 150_000_000_000_000n;
  const balance = 50_000_000_000_000n;
  assert.throws(
    () => validateDeployerBalance(balance, feeValue),
    (err) => {
      assert.strictEqual(err.code, "INSUFFICIENT_BALANCE");
      assert.strictEqual(err.deficit, 100_000_000_000_000n);
      return true;
    }
  );
});

// ============================================================================
// PENDING JOURNAL & COLLISION TESTS
// ============================================================================

test("Pending journal: completed receipt blocks duplicate broadcast", () => {
  const fakeExistsSync = (filePath) => filePath.endsWith(RECEIPT_FILENAME);
  assert.throws(
    () => assertNoDeploymentCollisions({ deploymentsDir: "/fake/deployments", existsSyncFn: fakeExistsSync }),
    /already exists\. Execution refused to prevent duplicate deployment/
  );
});

test("Pending journal: pending journal blocks duplicate broadcast", () => {
  const fakeExistsSync = (filePath) => filePath.endsWith(PENDING_JOURNAL_FILENAME);
  assert.throws(
    () => assertNoDeploymentCollisions({ deploymentsDir: "/fake/deployments", existsSyncFn: fakeExistsSync }),
    /Pending deployment journal .* already exists\. An earlier deployment may be in flight or interrupted\. DO NOT REDEPLOY/
  );
});

test("Pending journal: post-broadcast failure preserves pending journal and records BROADCAST status", () => {
  const intent = createPendingJournalIntent({
    project: "makewhole",
    version: "v2",
    chainId: 61997,
    rpcHost: "studio-dev.genlayer.com",
    deployerAddress: "0x1111111111111111111111111111111111111111",
    sourceCommit: "b2a31b9d5450e8dd131ff792d66e5f8d88a63809",
    contractSourceSha256: "aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344",
  });

  assert.strictEqual(intent.status, "INTENT_CREATED");
  assert.strictEqual(intent.project, "makewhole");
  assert.strictEqual(intent.version, "v2");
  assert.strictEqual(intent.chainId, 61997);
  assert.strictEqual(intent.deployerAddress, "0x1111111111111111111111111111111111111111");

  const txHash = "0x9999888877776666555544443333222211110000aaaabbbbccccddddeeeeffff";
  const broadcastIntent = markPendingJournalBroadcast(intent, txHash);

  assert.strictEqual(broadcastIntent.status, "BROADCAST");
  assert.strictEqual(broadcastIntent.deploymentTxHash, txHash);
  assert.ok(broadcastIntent.broadcastAtUtc);

  // If receipt verification fails, the file is NOT removed and subsequent runs are blocked
  const fakeExistsSync = (filePath) => filePath.endsWith(PENDING_JOURNAL_FILENAME);
  assert.throws(
    () => assertNoDeploymentCollisions({ deploymentsDir: "/fake/deployments", existsSyncFn: fakeExistsSync }),
    /DO NOT REDEPLOY/
  );
});

// ============================================================================
// ADDRESS CONFIRMATION TESTS
// ============================================================================

test("Address confirmation: address confirmation match (exact and case-insensitive)", () => {
  const addrLower = "0x1111111111111111111111111111111111111111";
  const addrMixed = "0x1111111111111111111111111111111111111111";
  const addrUpper = "0x1111111111111111111111111111111111111111";
  assert.strictEqual(validateConfirmAddress(addrLower, addrLower), true);
  assert.strictEqual(validateConfirmAddress("0xAaBbCcDd00000000000000000000000000000001", "0xaabbccdd00000000000000000000000000000001"), true);
});

test("Address confirmation: address confirmation mismatch", () => {
  assert.throws(
    () => validateConfirmAddress("0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"),
    /Confirmation address mismatch/
  );
  assert.throws(
    () => validateConfirmAddress("not_an_address", "0x2222222222222222222222222222222222222222"),
    /Invalid confirmation address/
  );
});

// ============================================================================
// KEYCHAIN OPERATOR TESTS
// ============================================================================

test("Keychain operator: missing keychain account behavior", async () => {
  // Mock keytar where account does not exist
  const mockKeytar = {
    async getPassword(service, account) {
      return null;
    },
    async setPassword() {},
  };

  let dryRunInvoked = false;
  const preflightRes = await executeKeychainPreflight({
    keytar: mockKeytar,
    runDryRunFn: () => {
      dryRunInvoked = true;
      return { status: 0 };
    },
  });

  assert.strictEqual(preflightRes.accountExists, false);
  assert.strictEqual(preflightRes.publicAddress, null);
  assert.strictEqual(preflightRes.readiness, "BLOCKED");
  assert.strictEqual(preflightRes.ready, false);
  assert.strictEqual(preflightRes.exitCode, 1);
  assert.strictEqual(dryRunInvoked, true);

  // Future modes fail safely on missing account
  await assert.rejects(
    async () => executeDeployFromKeychain({
      keytar: mockKeytar,
      confirmAddress: "0x1111111111111111111111111111111111111111",
    }),
    /not found in OS keychain/
  );

  await assert.rejects(
    async () => executeFundDeployer({
      keytar: mockKeytar,
      confirmAddress: "0x1111111111111111111111111111111111111111",
    }),
    /not found in OS keychain/
  );
});

test("Keychain operator: existing account cannot be overwritten", async () => {
  assert.throws(
    () => assertKeychainAccountCanBeCreated("existing_secret_key"),
    /Keychain account already exists\. Refusing to overwrite/
  );

  const mockKeytar = {
    async getPassword(service, account) {
      return "existing_key";
    },
    async setPassword() {
      assert.fail("setPassword must never be called on existing account");
    },
  };

  await assert.rejects(
    async () => executePrepareAccount({ keytar: mockKeytar }),
    /Keychain account already exists/
  );
});

test("Keychain operator: funding deficit calculation", () => {
  // 0 balance => full 1 GEN deficit
  const deficit0 = calculateFundingDeficit(0n);
  assert.strictEqual(deficit0.targetWei, 1_000_000_000_000_000_000n);
  assert.strictEqual(deficit0.currentBalanceWei, 0n);
  assert.strictEqual(deficit0.deficitWei, 1_000_000_000_000_000_000n);
  assert.strictEqual(deficit0.needsFunding, true);

  // 0.4 GEN balance => 0.6 GEN deficit
  const cur4 = 400_000_000_000_000_000n;
  const deficit4 = calculateFundingDeficit(cur4);
  assert.strictEqual(deficit4.deficitWei, 600_000_000_000_000_000n);
  assert.strictEqual(deficit4.needsFunding, true);
});

test("Keychain operator: already-funded account produces zero transfer", async () => {
  // Balance >= 1 GEN
  const deficitSufficient = calculateFundingDeficit(1_000_000_000_000_000_000n);
  assert.strictEqual(deficitSufficient.deficitWei, 0n);
  assert.strictEqual(deficitSufficient.needsFunding, false);

  const deficitExcess = calculateFundingDeficit(2_500_000_000_000_000_000n);
  assert.strictEqual(deficitExcess.deficitWei, 0n);
  assert.strictEqual(deficitExcess.needsFunding, false);

  // Mock executeFundDeployer with funded account
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const funderKey = "0x2222222222222222222222222222222222222222222222222222222222222222";
  const mockKeytar = {
    async getPassword(service, key) {
      if (key === DEPLOYER_KEYCHAIN_KEY) return deployerKey;
      if (key === FUNDER_KEYCHAIN_KEY) return funderKey;
      return null;
    },
  };

  const mockClient = {
    async getBalance({ address }) {
      return 1_200_000_000_000_000_000n; // 1.2 GEN
    },
    async sendTransaction() {
      assert.fail("sendTransaction must not be called when already funded");
    },
  };

  const fundRes = await executeFundDeployer({
    keytar: mockKeytar,
    client: mockClient,
    confirmAddress: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A", // address for deployerKey
  });

  assert.strictEqual(fundRes.funded, false);
  assert.strictEqual(fundRes.reason, "ALREADY_SUFFICIENTLY_FUNDED");
  assert.strictEqual(fundRes.deficitWei, 0n);
});

test("Keychain operator: maximum target balance is exactly 1 GEN", () => {
  assert.strictEqual(MAX_TARGET_DEPLOYER_BALANCE_GEN, 1n);
  assert.strictEqual(MAX_TARGET_DEPLOYER_BALANCE_WEI, 1_000_000_000_000_000_000n);
});

test("Keychain operator: private key is absent from formatted output", () => {
  const secretKey = "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";
  const publicAddress = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

  const report = formatPreflightReport({
    accountExists: true,
    publicAddress,
    balanceWei: 500_000_000_000_000_000n,
    deficitInfo: calculateFundingDeficit(500_000_000_000_000_000n),
  });

  assert.doesNotMatch(report, new RegExp(secretKey));
  assert.doesNotMatch(report, new RegExp(secretKey.slice(2)));
  assert.match(report, new RegExp(publicAddress));
});

// ============================================================================
// KEYCHAIN FAIL-CLOSED CORRECTION TESTS
// ============================================================================

test("Pending journal: malformed/short broadcast tx hash rejected", () => {
  const intent = createPendingJournalIntent({
    project: "makewhole",
    version: "v2",
    chainId: 61997,
    rpcHost: "studio-dev.genlayer.com",
    deployerAddress: "0x1111111111111111111111111111111111111111",
    sourceCommit: "b2a31b9d5450e8dd131ff792d66e5f8d88a63809",
    contractSourceSha256: "aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344",
  });

  assert.throws(() => markPendingJournalBroadcast(intent, "0x"), /invalid transaction hash/);
  assert.throws(() => markPendingJournalBroadcast(intent, "0x1234"), /invalid transaction hash/);
  assert.throws(() => markPendingJournalBroadcast(intent, "not-a-hash"), /invalid transaction hash/);
  assert.throws(() => markPendingJournalBroadcast(intent, "0x" + "g".repeat(64)), /invalid transaction hash/);
  assert.throws(() => markPendingJournalBroadcast(intent, "0x" + "1".repeat(63)), /invalid transaction hash/);
  assert.throws(() => markPendingJournalBroadcast(intent, "0x" + "1".repeat(65)), /invalid transaction hash/);
});

test("Pending journal: exact 32-byte broadcast tx hash accepted", () => {
  const intent = createPendingJournalIntent({
    project: "makewhole",
    version: "v2",
    chainId: 61997,
    rpcHost: "studio-dev.genlayer.com",
    deployerAddress: "0x1111111111111111111111111111111111111111",
    sourceCommit: "b2a31b9d5450e8dd131ff792d66e5f8d88a63809",
    contractSourceSha256: "aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344",
  });

  const validLower = "0x" + "a".repeat(64);
  const resLower = markPendingJournalBroadcast(intent, validLower);
  assert.strictEqual(resLower.status, "BROADCAST");
  assert.strictEqual(resLower.deploymentTxHash, validLower);

  const validMixed = "0x" + "1a2B3c4D".repeat(8);
  const resMixed = markPendingJournalBroadcast(intent, validMixed);
  assert.strictEqual(resMixed.status, "BROADCAST");
  assert.strictEqual(resMixed.deploymentTxHash, validMixed);

  const validZero = "0x" + "0".repeat(64);
  const resZero = markPendingJournalBroadcast(intent, validZero);
  assert.strictEqual(resZero.status, "BROADCAST");
  assert.strictEqual(resZero.deploymentTxHash, validZero);
});

test("Source gate: dirty scripts/deploy-keychain.mjs blocks the release gate", () => {
  assert.ok(CRITICAL_RELEASE_FILES.includes("scripts/deploy-keychain.mjs"));

  // Modified
  const gateMod = checkReleaseSourceGate({
    headCommit: "0123456789abcdef0123456789abcdef01234567",
    committedCode: "def foo(): return 1",
    workingCode: "def foo(): return 1",
    porcelainStatus: " M scripts/deploy-keychain.mjs\n",
  });
  assert.strictEqual(gateMod.passed, false);
  assert.match(gateMod.issues[0], /Uncommitted changes detected in critical release files/);
  assert.match(gateMod.issues[0], /scripts\/deploy-keychain\.mjs/);

  // Untracked
  const gateUntracked = checkReleaseSourceGate({
    headCommit: "0123456789abcdef0123456789abcdef01234567",
    committedCode: "def foo(): return 1",
    workingCode: "def foo(): return 1",
    porcelainStatus: "?? scripts/deploy-keychain.mjs\n",
  });
  assert.strictEqual(gateUntracked.passed, false);

  // Deleted
  const gateDeleted = checkReleaseSourceGate({
    headCommit: "0123456789abcdef0123456789abcdef01234567",
    committedCode: "def foo(): return 1",
    workingCode: "def foo(): return 1",
    porcelainStatus: " D scripts/deploy-keychain.mjs\n",
  });
  assert.strictEqual(gateDeleted.passed, false);
});

test("Keychain operator: absent account => keychain readiness BLOCKED and exit 1", async () => {
  const mockKeytar = {
    async getPassword(service, account) {
      return null;
    },
    async setPassword() {},
  };

  const res = await executeKeychainPreflight({
    keytar: mockKeytar,
    runDryRunFn: () => ({ status: 0 }),
  });

  assert.strictEqual(res.accountExists, false);
  assert.strictEqual(res.readiness, "BLOCKED");
  assert.strictEqual(res.ready, false);
  assert.strictEqual(res.exitCode, 1);
  assert.ok(res.blockers.some((b) => b.includes("is absent from OS keychain")));
});

test("Keychain operator: balance lookup failure => BLOCKED and exit 1", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };

  const mockClient = {
    async getBalance() {
      throw new Error("RPC network timeout after 10000ms");
    },
  };

  const res = await executeKeychainPreflight({
    keytar: mockKeytar,
    client: mockClient,
    runDryRunFn: () => ({ status: 0 }),
  });

  assert.strictEqual(res.accountExists, true);
  assert.strictEqual(res.readiness, "BLOCKED");
  assert.strictEqual(res.ready, false);
  assert.strictEqual(res.exitCode, 1);
  assert.ok(res.blockers.some((b) => b.includes("Balance lookup failed")));
});

test("Keychain operator: balance below 1 GEN => BLOCKED and exit 1", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };

  const mockClient = {
    async getBalance() {
      return 500_000_000_000_000_000n; // 0.5 GEN < 1 GEN
    },
  };

  const res = await executeKeychainPreflight({
    keytar: mockKeytar,
    client: mockClient,
    runDryRunFn: () => ({ status: 0 }),
  });

  assert.strictEqual(res.accountExists, true);
  assert.strictEqual(res.readiness, "BLOCKED");
  assert.strictEqual(res.ready, false);
  assert.strictEqual(res.exitCode, 1);
  assert.ok(res.blockers.some((b) => b.includes("is below 1 GEN target") && b.includes("Funding is required")));
});

test("Keychain operator: dry-run exit 1 => BLOCKED", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };

  const mockClient = {
    async getBalance() {
      return 2_000_000_000_000_000_000n; // 2 GEN >= 1 GEN
    },
  };

  const res = await executeKeychainPreflight({
    keytar: mockKeytar,
    client: mockClient,
    runDryRunFn: () => ({ status: 1 }),
  });

  assert.strictEqual(res.readiness, "BLOCKED");
  assert.strictEqual(res.ready, false);
  assert.strictEqual(res.exitCode, 1);
  assert.ok(res.blockers.some((b) => b.includes("Ordinary deployment dry-run exited with nonzero code 1")));
});

test("Keychain operator: dry-run spawn error => BLOCKED", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };

  const mockClient = {
    async getBalance() {
      return 2_000_000_000_000_000_000n;
    },
  };

  const res = await executeKeychainPreflight({
    keytar: mockKeytar,
    client: mockClient,
    runDryRunFn: () => ({ error: new Error("ENOENT: spawn node ENOENT"), status: null }),
  });

  assert.strictEqual(res.readiness, "BLOCKED");
  assert.strictEqual(res.ready, false);
  assert.strictEqual(res.exitCode, 1);
  assert.ok(res.blockers.some((b) => b.includes("Ordinary deployment dry-run failed to start")));
});

test("Keychain operator: dry-run signal termination => BLOCKED", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };

  const mockClient = {
    async getBalance() {
      return 2_000_000_000_000_000_000n;
    },
  };

  const res = await executeKeychainPreflight({
    keytar: mockKeytar,
    client: mockClient,
    runDryRunFn: () => ({ signal: "SIGKILL", status: null }),
  });

  assert.strictEqual(res.readiness, "BLOCKED");
  assert.strictEqual(res.ready, false);
  assert.strictEqual(res.exitCode, 1);
  assert.ok(res.blockers.some((b) => b.includes("terminated by signal: SIGKILL")));
});

test("Keychain operator: dry-run null status => BLOCKED", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };

  const mockClient = {
    async getBalance() {
      return 2_000_000_000_000_000_000n;
    },
  };

  // Explicit null status
  const resNull = await executeKeychainPreflight({
    keytar: mockKeytar,
    client: mockClient,
    runDryRunFn: () => ({ status: null }),
  });
  assert.strictEqual(resNull.readiness, "BLOCKED");
  assert.strictEqual(resNull.exitCode, 1);
  assert.ok(resNull.blockers.some((b) => b.includes("exit status is null or unavailable")));

  // Injected function returning undefined
  const resUndef = await executeKeychainPreflight({
    keytar: mockKeytar,
    client: mockClient,
    runDryRunFn: () => undefined,
  });
  assert.strictEqual(resUndef.readiness, "BLOCKED");
  assert.strictEqual(resUndef.exitCode, 1);
});

test("Keychain operator: fully funded account plus dry-run exit 0 => READY and exit 0", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };

  const mockClient = {
    async getBalance() {
      return 1_000_000_000_000_000_000n; // Exactly 1 GEN
    },
  };

  const res = await executeKeychainPreflight({
    keytar: mockKeytar,
    client: mockClient,
    runDryRunFn: () => ({ status: 0 }),
  });

  assert.strictEqual(res.accountExists, true);
  assert.strictEqual(res.readiness, "READY");
  assert.strictEqual(res.ready, true);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.blockers.length, 0);
});

test("Keychain operator: deployment spawn error cannot become exit 0", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };

  const mockClient = {
    async getBalance() {
      return 2_000_000_000_000_000_000n;
    },
  };

  await assert.rejects(
    async () => executeDeployFromKeychain({
      keytar: mockKeytar,
      client: mockClient,
      confirmAddress: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A",
      spawnFn: () => ({ error: new Error("spawnSync EACCES"), status: null }),
    }),
    /Deployment execution failed to spawn/
  );
});

test("Keychain operator: deployment null status cannot become exit 0", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };

  const mockClient = {
    async getBalance() {
      return 2_000_000_000_000_000_000n;
    },
  };

  await assert.rejects(
    async () => executeDeployFromKeychain({
      keytar: mockKeytar,
      client: mockClient,
      confirmAddress: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A",
      spawnFn: () => ({ status: null }),
    }),
    /Deployment execution status is unavailable or null/
  );

  await assert.rejects(
    async () => executeDeployFromKeychain({
      keytar: mockKeytar,
      client: mockClient,
      confirmAddress: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A",
      spawnFn: () => ({ status: undefined }),
    }),
    /Deployment execution status is unavailable or null/
  );
});

test("Keychain operator: deployment nonzero status is preserved", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };

  const mockClient = {
    async getBalance() {
      return 2_000_000_000_000_000_000n;
    },
  };

  await assert.rejects(
    async () => executeDeployFromKeychain({
      keytar: mockKeytar,
      client: mockClient,
      confirmAddress: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A",
      spawnFn: () => ({ status: 7 }),
    }),
    (err) => {
      assert.strictEqual(err.exitCode, 7);
      assert.match(err.message, /failed with exit code 7/);
      return true;
    }
  );
});

test("Keychain operator: funding receipt followed by balance below target => failure", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const funderKey = "0x2222222222222222222222222222222222222222222222222222222222222222";
  const mockKeytar = {
    async getPassword(service, key) {
      if (key === DEPLOYER_KEYCHAIN_KEY) return deployerKey;
      if (key === FUNDER_KEYCHAIN_KEY) return funderKey;
      return null;
    },
  };

  let balanceCallCount = 0;
  const mockClient = {
    async getBalance({ address }) {
      balanceCallCount++;
      // First call: initial deployer balance = 0
      if (balanceCallCount === 1) return 0n;
      // Second call: funder balance = 5 GEN
      if (balanceCallCount === 2) return 5_000_000_000_000_000_000n;
      // Third call: re-read deployer balance after funding => only 0.5 GEN (below 1 GEN target)
      return 500_000_000_000_000_000n;
    },
    async sendTransaction() {
      return "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    },
    async waitForTransactionReceipt() {
      return {
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      };
    },
  };

  await assert.rejects(
    async () => executeFundDeployer({
      keytar: mockKeytar,
      client: mockClient,
      confirmAddress: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A",
    }),
    (err) => {
      assert.match(err.message, /Funding verification failed/);
      assert.strictEqual(err.deployerAddress, "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A");
      assert.strictEqual(err.txHash, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      assert.strictEqual(err.verifiedBalance, 500_000_000_000_000_000n);
      assert.strictEqual(err.targetWei, 1_000_000_000_000_000_000n);
      return true;
    }
  );
});

test("Keychain operator: funding balance at or above target => success", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const funderKey = "0x2222222222222222222222222222222222222222222222222222222222222222";
  const mockKeytar = {
    async getPassword(service, key) {
      if (key === DEPLOYER_KEYCHAIN_KEY) return deployerKey;
      if (key === FUNDER_KEYCHAIN_KEY) return funderKey;
      return null;
    },
  };

  let balanceCallCount = 0;
  const mockClient = {
    async getBalance({ address }) {
      balanceCallCount++;
      if (balanceCallCount === 1) return 0n; // initial
      if (balanceCallCount === 2) return 5_000_000_000_000_000_000n; // funder
      return 1_000_000_000_000_000_000n; // re-read => exactly 1 GEN target
    },
    async sendTransaction() {
      return "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    },
    async waitForTransactionReceipt() {
      return {
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      };
    },
  };

  const fundRes = await executeFundDeployer({
    keytar: mockKeytar,
    client: mockClient,
    confirmAddress: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A",
  });

  assert.strictEqual(fundRes.funded, true);
  assert.strictEqual(fundRes.verifiedBalanceWei, 1_000_000_000_000_000_000n);
  assert.strictEqual(fundRes.transferredWei, 1_000_000_000_000_000_000n);
});

test("Receipt normalization: valid camelCase receipt is accepted", () => {
  const receipt = {
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    recipient: "0xddE116CEb433732C56a9E8FDf50ddF12D741e745",
    txDataDecoded: {
      type: "deploy",
      contractAddress: "0xddE116CEb433732C56a9E8FDf50ddF12D741e745",
    },
  };
  const normalized = normalizeDeployReceipt(receipt);
  assert.strictEqual(normalized.contractAddress, "0xddE116CEb433732C56a9E8FDf50ddF12D741e745");
  assert.strictEqual(normalized.statusName, "FINALIZED");
  assert.strictEqual(normalized.txExecutionResultName, "FINISHED_WITH_RETURN");
  assert.strictEqual(validateDeployReceipt(receipt), "0xddE116CEb433732C56a9E8FDf50ddF12D741e745");
});

test("Receipt normalization: valid live snake_case receipt is accepted", () => {
  const receiptSnake = {
    status_name: "FINALIZED",
    tx_execution_result_name: "FINISHED_WITH_RETURN",
    recipient: "0xddE116CEb433732C56a9E8FDf50ddF12D741e745",
    tx_data_decoded: {
      type: "deploy",
      contract_address: "0xddE116CEb433732C56a9E8FDf50ddF12D741e745",
    },
  };
  const normalized = normalizeDeployReceipt(receiptSnake);
  assert.strictEqual(normalized.contractAddress, "0xddE116CEb433732C56a9E8FDf50ddF12D741e745");
  assert.strictEqual(validateDeployReceipt(receiptSnake), "0xddE116CEb433732C56a9E8FDf50ddF12D741e745");

  // Also verify live Studio-dev observed format with data.contract_address and numeric type: 1
  const liveObserved = {
    status_name: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    type: 1,
    recipient: "0xddE116CEb433732C56a9E8FDf50ddF12D741e745",
    data: {
      contract_address: "0xddE116CEb433732C56a9E8FDf50ddF12D741e745",
    },
  };
  assert.strictEqual(validateDeployReceipt(liveObserved), "0xddE116CEb433732C56a9E8FDf50ddF12D741e745");
});

test("Receipt normalization: conflicting camelCase/snake_case fields rejected", () => {
  // Conflicting status
  assert.throws(
    () =>
      normalizeDeployReceipt({
        statusName: "FINALIZED",
        status_name: "ACCEPTED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
      }),
    /Conflicting status fields in receipt/
  );

  // Conflicting execution result
  assert.throws(
    () =>
      normalizeDeployReceipt({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        tx_execution_result_name: "FAILED",
        txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
      }),
    /Conflicting execution result fields in receipt/
  );
});

test("Receipt normalization: conflicting contractAddress across data and decoded representations rejected", () => {
  // Conflicting contract address in decoded objects
  assert.throws(
    () =>
      normalizeDeployReceipt({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
        tx_data_decoded: { type: "deploy", contract_address: "0x2222222222222222222222222222222222222222" },
      }),
    /Conflicting contract address representations in receipt/
  );

  // Conflicting contract address between data and txDataDecoded
  assert.throws(
    () =>
      normalizeDeployReceipt({
        status_name: "FINALIZED",
        tx_execution_result_name: "FINISHED_WITH_RETURN",
        type: 1,
        data: { contract_address: "0x1111111111111111111111111111111111111111" },
        txDataDecoded: { type: "deploy", contractAddress: "0x2222222222222222222222222222222222222222" },
      }),
    /Conflicting contract address representations in receipt/
  );

  // Conflicting contract address between root and data
  assert.throws(
    () =>
      normalizeDeployReceipt({
        status_name: "FINALIZED",
        tx_execution_result_name: "FINISHED_WITH_RETURN",
        contractAddress: "0x1111111111111111111111111111111111111111",
        data: { contract_address: "0x2222222222222222222222222222222222222222" },
        type: 1,
      }),
    /Conflicting contract address representations in receipt/
  );
});

test("Receipt normalization: non-final status rejected", () => {
  // Numeric status 7 cannot substitute for FINALIZED string
  assert.throws(
    () =>
      normalizeDeployReceipt({
        status: 7,
        txExecutionResultName: "FINISHED_WITH_RETURN",
        txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
      }),
    /Transaction status 'undefined' is not FINALIZED/
  );

  // ACCEPTED status
  assert.throws(
    () =>
      normalizeDeployReceipt({
        status_name: "ACCEPTED",
        tx_execution_result_name: "FINISHED_WITH_RETURN",
        tx_data_decoded: { type: "deploy", contract_address: "0x1111111111111111111111111111111111111111" },
      }),
    /Transaction status 'ACCEPTED' is not FINALIZED/
  );
});

test("Receipt normalization: SUCCESS alias rejected", () => {
  assert.throws(
    () =>
      normalizeDeployReceipt({
        statusName: "FINALIZED",
        txExecutionResultName: "SUCCESS",
        txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
      }),
    /Execution result 'SUCCESS' is not FINISHED_WITH_RETURN/
  );

  assert.throws(
    () =>
      normalizeDeployReceipt({
        status_name: "FINALIZED",
        tx_execution_result_name: "SUCCESS",
        tx_data_decoded: { type: "deploy", contract_address: "0x1111111111111111111111111111111111111111" },
      }),
    /Execution result 'SUCCESS' is not FINISHED_WITH_RETURN/
  );
});

test("Receipt normalization: non-deploy transaction rejected (both numeric and string)", () => {
  assert.throws(
    () =>
      normalizeDeployReceipt({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        txDataDecoded: { type: "call", contractAddress: "0x1111111111111111111111111111111111111111" },
      }),
    /txDataDecoded type 'call' is not deploy/
  );

  assert.throws(
    () =>
      normalizeDeployReceipt({
        status_name: "FINALIZED",
        tx_execution_result_name: "FINISHED_WITH_RETURN",
        tx_data_decoded: { type: "transfer", contract_address: "0x1111111111111111111111111111111111111111" },
      }),
    /tx_data_decoded type 'transfer' is not deploy/
  );

  // Numeric type 2
  assert.throws(
    () =>
      normalizeDeployReceipt({
        status_name: "FINALIZED",
        tx_execution_result_name: "FINISHED_WITH_RETURN",
        type: 2,
        data: { contract_address: "0x1111111111111111111111111111111111111111" },
      }),
    /only wire type 1 or 'deploy' is permitted/
  );
});

test("Receipt normalization: malformed/zero/mismatched contract address rejected", () => {
  // Zero address
  assert.throws(
    () =>
      normalizeDeployReceipt({
        status_name: "FINALIZED",
        tx_execution_result_name: "FINISHED_WITH_RETURN",
        tx_data_decoded: { type: "deploy", contract_address: ZERO_ADDRESS },
      }),
    /not a valid nonzero 20-byte 0x address/
  );

  // Malformed address
  assert.throws(
    () =>
      normalizeDeployReceipt({
        status_name: "FINALIZED",
        tx_execution_result_name: "FINISHED_WITH_RETURN",
        tx_data_decoded: { type: "deploy", contract_address: "0xbad" },
      }),
    /not a valid nonzero 20-byte 0x address/
  );

  // Recipient mismatch
  assert.throws(
    () =>
      normalizeDeployReceipt({
        status_name: "FINALIZED",
        tx_execution_result_name: "FINISHED_WITH_RETURN",
        recipient: "0x2222222222222222222222222222222222222222",
        tx_data_decoded: { type: "deploy", contract_address: "0x1111111111111111111111111111111111111111" },
      }),
    /Recipient '0x2222222222222222222222222222222222222222' does not match/
  );
});

test("Receipt normalization: receipt transaction hash missing, malformed, or mismatched rejected", () => {
  const targetHash = "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908";
  const otherHash = "0x0000000000000000000000000000000000000000000000000000000000000001";

  // Missing hash when expectedTxHash is supplied
  assert.throws(
    () =>
      normalizeDeployReceipt(
        {
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
        },
        { expectedTxHash: targetHash }
      ),
    /Receipt missing required transaction hash/
  );

  // Conflicting hash fields
  assert.throws(
    () =>
      normalizeDeployReceipt({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        hash: targetHash,
        transaction_hash: otherHash,
        txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
      }),
    /Conflicting transaction hash fields in receipt/
  );

  // Malformed hash
  assert.throws(
    () =>
      normalizeDeployReceipt({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        hash: "0xnot-a-hash",
        txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
      }),
    /Receipt transaction hash '0xnot-a-hash' is not a valid 32-byte hex string/
  );

  // Mismatch with expected hash
  assert.throws(
    () =>
      normalizeDeployReceipt(
        {
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          hash: otherHash,
          txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
        },
        { expectedTxHash: targetHash }
      ),
    /does not match expected/
  );
});

test("Receipt normalization: receipt sender missing, malformed, or mismatched rejected", () => {
  const targetDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
  const otherDeployer = "0x1111111111111111111111111111111111111111";

  // Missing sender when expectedDeployer is supplied
  assert.throws(
    () =>
      normalizeDeployReceipt(
        {
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
        },
        { expectedDeployer: targetDeployer }
      ),
    /Receipt missing required sender/
  );

  // Conflicting sender fields
  assert.throws(
    () =>
      normalizeDeployReceipt({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        sender: targetDeployer,
        from_address: otherDeployer,
        txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
      }),
    /Conflicting sender fields in receipt/
  );

  // Malformed sender
  assert.throws(
    () =>
      normalizeDeployReceipt({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        from: "0xbad",
        txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
      }),
    /not a valid nonzero 20-byte address/
  );

  // Sender mismatch with expected
  assert.throws(
    () =>
      normalizeDeployReceipt(
        {
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          from: otherDeployer,
          txDataDecoded: { type: "deploy", contractAddress: "0x1111111111111111111111111111111111111111" },
        },
        { expectedDeployer: targetDeployer }
      ),
    /does not match expected deployer/
  );
});

test("Recovery: malformed pending journal rejected", () => {
  assert.throws(() => validatePendingJournal(null), /journal is missing or not an object/);
  assert.throws(() => validatePendingJournal({ project: "wrong" }), /Invalid journal project/);
  assert.throws(() => validatePendingJournal({ project: "makewhole", version: "v1" }), /Invalid journal version/);
  assert.throws(
    () => validatePendingJournal({ project: "makewhole", version: "v2", status: "INTENT" }),
    /Invalid journal status 'INTENT', expected 'BROADCAST'/
  );
  assert.throws(
    () =>
      validatePendingJournal({
        project: "makewhole",
        version: "v2",
        status: "BROADCAST",
        chainId: 1,
      }),
    /Invalid journal chainId/
  );
  assert.throws(
    () =>
      validatePendingJournal({
        project: "makewhole",
        version: "v2",
        status: "BROADCAST",
        chainId: 61997,
        rpcHost: "evil.com",
      }),
    /Invalid journal rpcHost/
  );
  assert.throws(
    () =>
      validatePendingJournal({
        project: "makewhole",
        version: "v2",
        status: "BROADCAST",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: "0xinvalid",
      }),
    /Invalid journal deployerAddress/
  );
  assert.throws(
    () =>
      validatePendingJournal({
        project: "makewhole",
        version: "v2",
        status: "BROADCAST",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
        deploymentTxHash: "0xshort",
      }),
    /Invalid journal deploymentTxHash/
  );
});

test("Recovery: unknown/unexpected fields in pending journal rejected", () => {
  assert.throws(
    () =>
      validatePendingJournal({
        project: "makewhole",
        version: "v2",
        status: "BROADCAST",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
        deploymentTxHash: "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908",
        sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
        contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
        createdAtUtc: "2026-10-17T17:30:12.025Z",
        broadcastAtUtc: "2026-10-17T17:30:14.669Z",
        unrecognizedEvilField: "forged",
      }),
    /Unexpected field in pending deployment journal: 'unrecognizedEvilField'/
  );
});

test("Recovery: non-exact RPC hostname rejected (substring matching rejected)", () => {
  const base = {
    project: "makewhole",
    version: "v2",
    status: "BROADCAST",
    chainId: 61997,
    deployerAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
    deploymentTxHash: "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908",
    sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
    contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
    createdAtUtc: "2026-10-17T17:30:12.025Z",
    broadcastAtUtc: "2026-10-17T17:30:14.669Z",
  };

  assert.throws(
    () => validatePendingJournal({ ...base, rpcHost: "attacker-studio-dev.genlayer.com" }),
    /expected exact 'studio-dev.genlayer.com'/
  );
  assert.throws(
    () => validatePendingJournal({ ...base, rpcHost: "studio-dev.genlayer.com.evil.org" }),
    /expected exact 'studio-dev.genlayer.com'/
  );
  assert.throws(
    () => validatePendingJournal({ ...base, rpcHost: "studio-dev.genlayer.com/path" }),
    /expected exact 'studio-dev.genlayer.com'/
  );

  assert.strictEqual(validatePendingJournal({ ...base, rpcHost: "studio-dev.genlayer.com" }), true);
});

test("Recovery: invalid createdAtUtc or broadcastAtUtc rejected", () => {
  const base = {
    project: "makewhole",
    version: "v2",
    status: "BROADCAST",
    chainId: 61997,
    rpcHost: "studio-dev.genlayer.com",
    deployerAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
    deploymentTxHash: "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908",
    sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
    contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
    createdAtUtc: "2026-10-17T17:30:12.025Z",
    broadcastAtUtc: "2026-10-17T17:30:14.669Z",
  };

  assert.throws(
    () => validatePendingJournal({ ...base, createdAtUtc: undefined }),
    /Invalid journal createdAtUtc/
  );
  assert.throws(
    () => validatePendingJournal({ ...base, createdAtUtc: "invalid-date" }),
    /Invalid journal createdAtUtc/
  );
  assert.throws(
    () => validatePendingJournal({ ...base, broadcastAtUtc: undefined }),
    /Invalid journal broadcastAtUtc/
  );
  assert.throws(
    () => validatePendingJournal({ ...base, broadcastAtUtc: "2026-99-99T99:99:99.999Z" }),
    /Invalid journal broadcastAtUtc/
  );
  assert.throws(
    () =>
      validatePendingJournal({
        ...base,
        createdAtUtc: "2026-10-17T17:30:15.000Z",
        broadcastAtUtc: "2026-10-17T17:30:14.000Z",
      }),
    /broadcastAtUtc '2026-10-17T17:30:14.000Z' cannot be earlier than createdAtUtc '2026-10-17T17:30:15.000Z'/
  );
});

test("Recovery: confirmation-address mismatch rejected", () => {
  const journal = {
    deployerAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
  };
  assert.throws(
    () => validateConfirmAddress("0x1111111111111111111111111111111111111111", journal.deployerAddress),
    /Confirmation address mismatch/
  );
  assert.strictEqual(
    validateConfirmAddress("0x5b8942987e95dfc3ea56f392e37011a86efb0baf", journal.deployerAddress),
    true
  );
});

test("Recovery: malformed receipt artifact rejected", () => {
  const baseValid = {
    project: "makewhole",
    version: "v2",
    chainId: 61997,
    networkName: "GenLayer Studio-dev",
    rpcHost: "studio-dev.genlayer.com",
    explorerBaseUrl: "https://explorer-studio-dev.genlayer.com",
    deployerAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
    contractAddress: "0xddE116CEb433732C56a9E8FDf50ddF12D741e745",
    deploymentTxHash: "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908",
    sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
    contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
    executionResult: "FINISHED_WITH_RETURN",
    broadcastAtUtc: "2026-10-17T17:30:14.669Z",
    recoveredAtUtc: "2026-10-17T17:30:20.000Z",
    sdkVersion: "2.0.0-rc.1",
  };

  assert.throws(() => validateReceiptArtifact(null), /Receipt artifact is missing/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, project: "wrong" }), /Invalid receipt project/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, version: "v1" }), /Invalid receipt version/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, chainId: 1 }), /Invalid receipt chainId/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, networkName: "wrong-network" }), /Invalid receipt networkName/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, rpcHost: "evil.com" }), /Invalid receipt rpcHost/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, explorerBaseUrl: "https://evil-explorer.com" }), /Invalid receipt explorerBaseUrl/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, deployerAddress: "0xinvalid" }), /Invalid receipt deployerAddress/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, contractAddress: "0xinvalid" }), /Invalid receipt contractAddress/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, deploymentTxHash: "0xshort" }), /Invalid receipt deploymentTxHash/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, sourceCommit: "0xshort" }), /Invalid receipt sourceCommit/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, contractSourceSha256: "0xshort" }), /Invalid receipt contractSourceSha256/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, executionResult: "SUCCESS" }), /Invalid receipt executionResult/);

  // Missing or malformed timestamps
  assert.throws(() => validateReceiptArtifact({ ...baseValid, broadcastAtUtc: undefined }), /Invalid receipt broadcastAtUtc/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, broadcastAtUtc: "not-a-date" }), /Invalid receipt broadcastAtUtc/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, recoveredAtUtc: undefined }), /Invalid receipt recoveredAtUtc/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, recoveredAtUtc: "2026-99-99" }), /Invalid receipt recoveredAtUtc/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, finalizedAtUtc: "invalid-finalized" }), /Invalid receipt finalizedAtUtc/);

  // Missing or empty sdkVersion
  assert.throws(() => validateReceiptArtifact({ ...baseValid, sdkVersion: undefined }), /Invalid receipt sdkVersion/);
  assert.throws(() => validateReceiptArtifact({ ...baseValid, sdkVersion: "   " }), /Invalid receipt sdkVersion/);

  assert.strictEqual(validateReceiptArtifact(baseValid), true);
});

test("Recovery: validateReceiptMatchesJournal compares all required fields and detects mismatches", () => {
  const journal = {
    project: "makewhole",
    version: "v2",
    chainId: 61997,
    rpcHost: "studio-dev.genlayer.com",
    deployerAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
    deploymentTxHash: "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908",
    sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
    contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
    createdAtUtc: "2026-10-17T17:30:12.025Z",
    broadcastAtUtc: "2026-10-17T17:30:14.669Z",
    status: "BROADCAST",
  };

  const validReceipt = {
    project: "makewhole",
    version: "v2",
    chainId: 61997,
    networkName: "GenLayer Studio-dev",
    rpcHost: "studio-dev.genlayer.com",
    explorerBaseUrl: "https://explorer-studio-dev.genlayer.com",
    deployerAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
    contractAddress: "0xddE116CEb433732C56a9E8FDf50ddF12D741e745",
    deploymentTxHash: "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908",
    sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
    contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
    executionResult: "FINISHED_WITH_RETURN",
    broadcastAtUtc: "2026-10-17T17:30:14.669Z",
    recoveredAtUtc: "2026-10-17T17:30:20.000Z",
    sdkVersion: "2.0.0-rc.1",
  };

  assert.strictEqual(validateReceiptMatchesJournal({ receipt: validReceipt, journal }), true);

  // Deployer mismatch
  assert.throws(
    () =>
      validateReceiptMatchesJournal({
        receipt: { ...validReceipt, deployerAddress: "0x1111111111111111111111111111111111111111" },
        journal,
      }),
    /Deployer address mismatch/
  );

  // Contract address mismatch when confirmContractAddress is passed
  assert.throws(
    () =>
      validateReceiptMatchesJournal({
        receipt: validReceipt,
        journal,
        confirmContractAddress: "0x2222222222222222222222222222222222222222",
      }),
    /Confirmed contract address .* does not match receipt/
  );

  // Source commit mismatch
  assert.throws(
    () =>
      validateReceiptMatchesJournal({
        receipt: { ...validReceipt, sourceCommit: "0000000000000000000000000000000000000000" },
        journal,
      }),
    /Source commit mismatch/
  );

  // Receipt/journal broadcast timestamp mismatch
  assert.throws(
    () =>
      validateReceiptMatchesJournal({
        receipt: { ...validReceipt, broadcastAtUtc: "2026-10-17T17:30:15.000Z" },
        journal,
      }),
    /Broadcast timestamp mismatch: receipt has '2026-10-17T17:30:15.000Z', journal has '2026-10-17T17:30:14.669Z'/
  );

  // Recovered timestamp earlier than broadcast timestamp
  assert.throws(
    () =>
      validateReceiptMatchesJournal({
        receipt: { ...validReceipt, recoveredAtUtc: "2026-10-17T17:30:10.000Z" },
        journal,
      }),
    /Receipt recoveredAtUtc '2026-10-17T17:30:10.000Z' cannot be earlier than broadcastAtUtc '2026-10-17T17:30:14.669Z'/
  );
});

test("Recovery: contract schema requires complete 24-method v2 interface", () => {
  assert.strictEqual(REQUIRED_V2_METHODS.length, 24);

  const validEconomics = {
    pool: 0,
    locked_bonds: 0,
    locked_jobs: 0,
    credits: 0,
    slash_count: 0,
    settled_ok: 0,
    settled_rug: 0,
  };

  // 1. Exactly the complete 24-method schema passes
  assert.strictEqual(
    validateFreshContractState({
      schema: makeFullV2MockSchema(),
      ids: [],
      economics: validEconomics,
    }),
    true
  );

  // 2. Schema containing only the previous 7-method subset fails
  const old7Subset = {
    methods: {
      list_ids: {},
      get_economics: {},
      get_bond: {},
      get_reserved_bond: {},
      get_available_bond: {},
      check_bond: {},
      get_settlement: {},
    },
  };
  assert.throws(
    () => validateFreshContractState({ schema: old7Subset, ids: [], economics: validEconomics }),
    /Contract schema missing required v2 method/
  );

  // 3. Omission of each required method fails
  for (const missingMethod of REQUIRED_V2_METHODS) {
    const incompleteMethods = {};
    for (const m of REQUIRED_V2_METHODS) {
      if (m !== missingMethod) {
        incompleteMethods[m] = {};
      }
    }
    assert.throws(
      () =>
        validateFreshContractState({
          schema: { methods: incompleteMethods },
          ids: [],
          economics: validEconomics,
        }),
      new RegExp(`Contract schema missing required v2 method '${missingMethod}'`)
    );
  }
});

test("Recovery: source integrity accepts later clean descendant commit with identical contract code", () => {
  const mockDir = createHermeticMockDir(historicalV2Source);
  try {
    const journal = {
      sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
      contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
    };

    const mockExecGit = (args) => {
      const cmd = args.join(" ");
      if (cmd.includes("rev-parse --verify")) {
        return "903c08382c0b415ca7067d49085df3128736df25\n";
      }
      if (cmd.includes("merge-base --is-ancestor")) {
        return ""; // Exits 0: is ancestor!
      }
      if (cmd.includes("show 903c08382c0b415ca7067d49085df3128736df25:contracts/makewhole.py")) {
        return historicalV2Source;
      }
      if (cmd.includes("show HEAD:contracts/makewhole.py")) {
        return historicalV2Source;
      }
      if (cmd.includes("status --porcelain")) {
        return ""; // clean!
      }
      throw new Error(`Unhandled git command in mock: ${cmd}`);
    };

    const res = validateRecoverySourceIntegrity({
      rootPath: mockDir,
      journal,
      execGitFn: mockExecGit,
    });

    assert.strictEqual(res.passed, true);
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery: source integrity rejects non-ancestor journal commit", () => {
  const journal = {
    sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
    contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
  };

  const mockExecGit = (args) => {
    const cmd = args.join(" ");
    if (cmd.includes("rev-parse --verify")) {
      return "commit_ok\n";
    }
    if (cmd.includes("merge-base --is-ancestor")) {
      throw new Error("Command failed: git merge-base --is-ancestor (exit 1)");
    }
    return "";
  };

  assert.throws(
    () =>
      validateRecoverySourceIntegrity({
        rootPath: process.cwd(),
        journal,
        execGitFn: mockExecGit,
      }),
    /is not an ancestor of current HEAD/
  );
});

test("Recovery: source integrity rejects non-existent journal commit", () => {
  const journal = {
    sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
    contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
  };

  const mockExecGit = (args) => {
    const cmd = args.join(" ");
    if (cmd.includes("rev-parse --verify")) {
      throw new Error("fatal: Needed a single revision");
    }
    return "";
  };

  assert.throws(
    () =>
      validateRecoverySourceIntegrity({
        rootPath: process.cwd(),
        journal,
        execGitFn: mockExecGit,
      }),
    /does not exist in git history/
  );
});

test("Recovery: source integrity rejects modified historical, HEAD, or working contract code", () => {
  const mockDir = createHermeticMockDir(historicalV2Source);
  try {
    const journal = {
      sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
      contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
    };

    // Historical mismatch
    const mockHistMismatch = (args) => {
      const cmd = args.join(" ");
      if (cmd.includes("rev-parse --verify") || cmd.includes("merge-base --is-ancestor")) return "";
      if (cmd.includes("show 903c08382c0b415ca7067d49085df3128736df25:contracts/makewhole.py")) {
        return "# altered historical contract\n";
      }
      return "";
    };
    assert.throws(
      () =>
        validateRecoverySourceIntegrity({
          rootPath: mockDir,
          journal,
          execGitFn: mockHistMismatch,
        }),
      /Historical contract source .* does not match journal/
    );

    // HEAD mismatch
    const mockHeadMismatch = (args) => {
      const cmd = args.join(" ");
      if (cmd.includes("rev-parse --verify") || cmd.includes("merge-base --is-ancestor")) return "";
      if (cmd.includes("show 903c08382c0b415ca7067d49085df3128736df25:contracts/makewhole.py")) {
        return historicalV2Source;
      }
      if (cmd.includes("show HEAD:contracts/makewhole.py")) {
        return "# altered HEAD contract\n";
      }
      return "";
    };
    assert.throws(
      () =>
        validateRecoverySourceIntegrity({
          rootPath: mockDir,
          journal,
          execGitFn: mockHeadMismatch,
        }),
      /Current HEAD contract source .* does not match journal/
    );
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery: source integrity rejects dirty critical tracked files", () => {
  const mockDir = createHermeticMockDir(historicalV2Source);
  try {
    const journal = {
      sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
      contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
    };

    const mockDirtyGit = (args) => {
      const cmd = args.join(" ");
      if (cmd.includes("rev-parse --verify") || cmd.includes("merge-base --is-ancestor")) return "";
      if (cmd.includes("show 903c08382c0b415ca7067d49085df3128736df25:contracts/makewhole.py")) {
        return historicalV2Source;
      }
      if (cmd.includes("show HEAD:contracts/makewhole.py")) {
        return historicalV2Source;
      }
      if (cmd.includes("status --porcelain")) {
        return " M scripts/deploy-helpers.mjs\n";
      }
      return "";
    };

    assert.throws(
      () =>
        validateRecoverySourceIntegrity({
          rootPath: mockDir,
          journal,
          execGitFn: mockDirtyGit,
        }),
      /Recovery requires critical tracked files to be clean/
    );
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery CLI: parses --confirm-address and --confirm-contract-address (both space and equals)", () => {
  const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
  const testContract = "0xddE116CEb433732C56a9E8FDf50ddF12D741e745";

  // Space syntax
  const parsedSpace = parseKeychainArgs([
    "--recover",
    "--confirm-address",
    testDeployer,
    "--confirm-contract-address",
    testContract,
  ]);
  assert.strictEqual(parsedSpace.mode, "recover");
  assert.strictEqual(parsedSpace.confirmAddress, testDeployer);
  assert.strictEqual(parsedSpace.confirmContractAddress, testContract);

  // Equals syntax
  const parsedEquals = parseKeychainArgs([
    "--recover",
    `--confirm-address=${testDeployer}`,
    `--confirm-contract-address=${testContract}`,
  ]);
  assert.strictEqual(parsedEquals.mode, "recover");
  assert.strictEqual(parsedEquals.confirmAddress, testDeployer);
  assert.strictEqual(parsedEquals.confirmContractAddress, testContract);
});

test("Recovery CLI: mode flags exclusivity is order-independent and rejects combinations/duplicates", () => {
  // Combinations in both orders
  assert.throws(() => parseKeychainArgs(["--preflight", "--recover"]), /Cannot combine mode flags/);
  assert.throws(() => parseKeychainArgs(["--recover", "--preflight"]), /Cannot combine mode flags/);
  assert.throws(() => parseKeychainArgs(["--fund", "--recover"]), /Cannot combine mode flags/);
  assert.throws(() => parseKeychainArgs(["--recover", "--fund"]), /Cannot combine mode flags/);
  assert.throws(() => parseKeychainArgs(["--deploy", "--recover"]), /Cannot combine mode flags/);
  assert.throws(() => parseKeychainArgs(["--recover", "--deploy"]), /Cannot combine mode flags/);
  assert.throws(() => parseKeychainArgs(["--prepare-account", "--recover"]), /Cannot combine mode flags/);
  assert.throws(() => parseKeychainArgs(["--recover", "--prepare-account"]), /Cannot combine mode flags/);

  // Duplicates
  assert.throws(() => parseKeychainArgs(["--recover", "--recover"]), /Cannot combine mode flags/);
  assert.throws(() => parseKeychainArgs(["--preflight", "--preflight"]), /Cannot combine mode flags/);
  assert.throws(() => parseKeychainArgs(["--deploy", "--deploy"]), /Cannot combine mode flags/);
  assert.throws(() => parseKeychainArgs(["--fund", "--fund"]), /Cannot combine mode flags/);
});

const repoRoot = existsSync(resolve(process.cwd(), "contracts"))
  ? process.cwd()
  : resolve(process.cwd(), "..");

const baselineScratchEntries = new Set(
  existsSync(resolve(repoRoot, "scratch"))
    ? readdirSync(resolve(repoRoot, "scratch"))
    : []
);

const historicalV2Source = (() => {
  try {
    return execSync("git show 903c08382c0b415ca7067d49085df3128736df25:contracts/makewhole.py", {
      cwd: repoRoot,
      encoding: "utf8",
    });
  } catch {
    return readFileSync(resolve(repoRoot, "contracts", "makewhole.py"), "utf8");
  }
})();

// Helper for hermetic tests that creates a uniquely generated directory under os.tmpdir()
function createHermeticMockDir(customSource = historicalV2Source) {
  const dir = mkdtempSync(join(tmpdir(), "makewhole-rec-test-"));
  mkdirSync(resolve(dir, "deployments"), { recursive: true });
  mkdirSync(resolve(dir, "web"), { recursive: true });
  mkdirSync(resolve(dir, "contracts"), { recursive: true });

  const contractSource = customSource !== null
    ? customSource
    : readFileSync(resolve(repoRoot, "contracts", "makewhole.py"), "utf8");
  writeFileSync(resolve(dir, "contracts", "makewhole.py"), contractSource);

  return dir;
}

function makeMockGit(contractSource = historicalV2Source) {
  return (args) => {
    if (args && args[0] === "status") return "";
    return contractSource;
  };
}

function makeFullV2MockSchema() {
  const methods = {};
  for (const m of REQUIRED_V2_METHODS) {
    methods[m] = {};
  }
  return { methods };
}

test("Recovery: requires both confirm-address and confirm-contract-address", async () => {
  const mockDir = createHermeticMockDir();
  try {
    await assert.rejects(
      async () => executeRecovery({ confirmAddress: null, confirmContractAddress: "0x1111111111111111111111111111111111111111", rootPath: mockDir }),
      /--confirm-address 0x<address> must be specified/
    );
    await assert.rejects(
      async () => executeRecovery({ confirmAddress: "0x1111111111111111111111111111111111111111", confirmContractAddress: null, rootPath: mockDir }),
      /--confirm-contract-address 0x<address> must be specified/
    );
    await assert.rejects(
      async () => executeRecovery({ confirmAddress: "0xbad", confirmContractAddress: "0x1111111111111111111111111111111111111111", rootPath: mockDir }),
      /Invalid confirmation deployer address/
    );
    await assert.rejects(
      async () => executeRecovery({ confirmAddress: "0x1111111111111111111111111111111111111111", confirmContractAddress: "0xbad", rootPath: mockDir }),
      /Invalid confirmation contract address/
    );
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery: contract address mismatch rejected BEFORE any local writes", async () => {
  const mockDir = createHermeticMockDir();
  try {
    const testTxHash = "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908";
    const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
    const actualContract = "0xddE116CEb433732C56a9E8FDf50ddF12D741e745";
    const wrongContract = "0x1111111111111111111111111111111111111111";

    const pendingPath = resolve(mockDir, "deployments", "makewhole-v2.pending.json");
    const receiptPath = resolve(mockDir, "deployments", "makewhole-v2.json");
    const envPath = resolve(mockDir, "web", ".env.local");

    writeFileSync(
      pendingPath,
      JSON.stringify({
        project: "makewhole",
        version: "v2",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
        contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
        status: "BROADCAST",
        deploymentTxHash: testTxHash,
        createdAtUtc: "2026-10-17T17:30:12.025Z",
        broadcastAtUtc: "2026-10-17T17:30:14.669Z",
      })
    );
    writeFileSync(envPath, "NEXT_PUBLIC_CONTRACT_ADDRESS=0xold\n");

    const mockClient = {
      async waitForTransactionReceipt() {
        return {
          status_name: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          recipient: actualContract,
          sender: testDeployer,
          hash: testTxHash,
          type: 1,
          data: { contract_address: actualContract },
        };
      },
    };

    const contractSource = historicalV2Source;

    await assert.rejects(
      async () =>
        executeRecovery({
          confirmAddress: testDeployer,
          confirmContractAddress: wrongContract,
          rootPath: mockDir,
          client: mockClient,
          execGitFn: makeMockGit(contractSource),
        }),
      /does not match confirmed contract address/
    );

    // Assert: NO final receipt was written
    assert.strictEqual(existsSync(receiptPath), false);
    // Assert: env was NOT modified
    assert.strictEqual(readFileSync(envPath, "utf8"), "NEXT_PUBLIC_CONTRACT_ADDRESS=0xold\n");
    // Assert: pending journal was PRESERVED
    assert.strictEqual(existsSync(pendingPath), true);
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery: reads only the recorded transaction hash and never calls signing/deployment methods", async () => {
  const mockDir = createHermeticMockDir();
  try {
    const testTxHash = "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908";
    const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
    const testContract = "0xddE116CEb433732C56a9E8FDf50ddF12D741e745";

    writeFileSync(
      resolve(mockDir, "deployments", "makewhole-v2.pending.json"),
      JSON.stringify({
        project: "makewhole",
        version: "v2",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
        contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
        status: "BROADCAST",
        deploymentTxHash: testTxHash,
        createdAtUtc: "2026-10-17T17:30:12.025Z",
        broadcastAtUtc: "2026-10-17T17:30:14.669Z",
      })
    );
    writeFileSync(resolve(mockDir, "web", ".env.local"), "NEXT_PUBLIC_CONTRACT_ADDRESS=0xold\n");

    let waitedHash = null;
    let deployContractCalled = false;
    let sendTransactionCalled = false;

    const mockClient = {
      async waitForTransactionReceipt({ hash }) {
        waitedHash = hash;
        return {
          status_name: "FINALIZED",
          tx_execution_result_name: "FINISHED_WITH_RETURN",
          recipient: testContract,
          sender: testDeployer,
          hash: testTxHash,
          tx_data_decoded: {
            type: "deploy",
            contract_address: testContract,
          },
        };
      },
      async getContractSchema() {
        return makeFullV2MockSchema();
      },
      async readContract({ functionName }) {
        if (functionName === "list_ids") return [];
        if (functionName === "get_economics") {
          return { pool: 0, locked_bonds: 0, locked_jobs: 0, credits: 0, slash_count: 0, settled_ok: 0, settled_rug: 0 };
        }
        return null;
      },
      async deployContract() {
        deployContractCalled = true;
      },
      async sendTransaction() {
        sendTransactionCalled = true;
      },
    };

    const contractSource = historicalV2Source;

    const res = await executeRecovery({
      confirmAddress: testDeployer,
      confirmContractAddress: testContract,
      rootPath: mockDir,
      client: mockClient,
      execGitFn: makeMockGit(contractSource),
    });

    assert.strictEqual(res.recovered, true);
    assert.strictEqual(waitedHash, testTxHash);
    assert.strictEqual(deployContractCalled, false);
    assert.strictEqual(sendTransactionCalled, false);
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery: failed recovery preserves the pending journal and prints DO NOT REDEPLOY", async () => {
  const mockDir = createHermeticMockDir();
  try {
    const pendingPath = resolve(mockDir, "deployments", "makewhole-v2.pending.json");
    const journalContent = JSON.stringify({
      project: "makewhole",
      version: "v2",
      chainId: 61997,
      rpcHost: "studio-dev.genlayer.com",
      deployerAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
      sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
      contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
      status: "BROADCAST",
      deploymentTxHash: "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908",
      createdAtUtc: "2026-10-17T17:30:12.025Z",
      broadcastAtUtc: "2026-10-17T17:30:14.669Z",
    });
    writeFileSync(pendingPath, journalContent);

    const mockFailingClient = {
      async waitForTransactionReceipt() {
        throw new Error("RPC network timeout");
      },
    };

    const contractSource = historicalV2Source;

    await assert.rejects(
      async () =>
        executeRecovery({
          confirmAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
          confirmContractAddress: "0xddE116CEb433732C56a9E8FDf50ddF12D741e745",
          rootPath: mockDir,
          client: mockFailingClient,
          execGitFn: makeMockGit(contractSource),
        }),
      /RPC network timeout/
    );

    assert.strictEqual(existsSync(pendingPath), true);
    assert.strictEqual(readFileSync(pendingPath, "utf8"), journalContent);
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery: pending deletion failure fails closed, preserves journal, and reports error", async () => {
  const mockDir = createHermeticMockDir();
  try {
    const pendingPath = resolve(mockDir, "deployments", "makewhole-v2.pending.json");
    const testTxHash = "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908";
    const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
    const testContract = "0xddE116CEb433732C56a9E8FDf50ddF12D741e745";

    writeFileSync(
      pendingPath,
      JSON.stringify({
        project: "makewhole",
        version: "v2",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
        contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
        status: "BROADCAST",
        deploymentTxHash: testTxHash,
        createdAtUtc: "2026-10-17T17:30:12.025Z",
        broadcastAtUtc: "2026-10-17T17:30:14.669Z",
      })
    );

    const mockClient = {
      async waitForTransactionReceipt() {
        return {
          status_name: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          recipient: testContract,
          sender: testDeployer,
          hash: testTxHash,
          type: 1,
          data: { contract_address: testContract },
        };
      },
      async getContractSchema() {
        return makeFullV2MockSchema();
      },
      async readContract({ functionName }) {
        if (functionName === "list_ids") return [];
        if (functionName === "get_economics") {
          return { pool: 0, locked_bonds: 0, locked_jobs: 0, credits: 0, slash_count: 0, settled_ok: 0, settled_rug: 0 };
        }
        return null;
      },
    };

    const contractSource = historicalV2Source;

    await assert.rejects(
      async () =>
        executeRecovery({
          confirmAddress: testDeployer,
          confirmContractAddress: testContract,
          rootPath: mockDir,
          client: mockClient,
          execGitFn: makeMockGit(contractSource),
          unlinkFn: () => {
            throw new Error("EPERM: operation not permitted");
          },
        }),
      (err) => {
        assert.strictEqual(err.pendingDeletionFailed, true);
        assert.match(err.message, /failed to delete pending journal/);
        return true;
      }
    );

    assert.strictEqual(existsSync(pendingPath), true);
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery: successful mocked recovery updates environment and receipt with broadcastAtUtc before deleting pending", async () => {
  const mockDir = createHermeticMockDir();
  try {
    const pendingPath = resolve(mockDir, "deployments", "makewhole-v2.pending.json");
    const receiptPath = resolve(mockDir, "deployments", "makewhole-v2.json");
    const envPath = resolve(mockDir, "web", ".env.local");

    const testTxHash = "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908";
    const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
    const testContract = "0xddE116CEb433732C56a9E8FDf50ddF12D741e745";

    writeFileSync(
      pendingPath,
      JSON.stringify({
        project: "makewhole",
        version: "v2",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
        contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
        status: "BROADCAST",
        deploymentTxHash: testTxHash,
        createdAtUtc: "2026-10-17T17:30:12.025Z",
        broadcastAtUtc: "2026-10-17T17:30:14.669Z",
      })
    );
    writeFileSync(envPath, "NEXT_PUBLIC_CONTRACT_ADDRESS=0xold\n");

    const mockClient = {
      async waitForTransactionReceipt() {
        return {
          status_name: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          recipient: testContract,
          sender: testDeployer,
          hash: testTxHash,
          data: {
            contract_address: testContract,
          },
          type: 1,
        };
      },
      async getContractSchema() {
        return makeFullV2MockSchema();
      },
      async readContract({ functionName }) {
        if (functionName === "list_ids") return [];
        if (functionName === "get_economics") {
          return { pool: 0, locked_bonds: 0, locked_jobs: 0, credits: 0, slash_count: 0, settled_ok: 0, settled_rug: 0 };
        }
        return null;
      },
    };

    const contractSource = historicalV2Source;

    const res = await executeRecovery({
      confirmAddress: testDeployer,
      confirmContractAddress: testContract,
      rootPath: mockDir,
      client: mockClient,
      execGitFn: makeMockGit(contractSource),
    });

    assert.strictEqual(res.recovered, true);
    assert.strictEqual(res.contractAddress, testContract);
    assert.strictEqual(res.pendingJournalStatus, "removed");

    assert.strictEqual(existsSync(receiptPath), true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    assert.strictEqual(receipt.contractAddress, testContract);
    assert.strictEqual(receipt.deploymentTxHash, testTxHash);
    assert.strictEqual(receipt.broadcastAtUtc, "2026-10-17T17:30:14.669Z");
    assert.strictEqual(typeof receipt.recoveredAtUtc, "string");
    assert.strictEqual(receipt.deployedAtUtc, undefined); // NOT labeled as deployment time!

    const envContent = readFileSync(envPath, "utf8");
    assert.match(envContent, new RegExp(`NEXT_PUBLIC_CONTRACT_ADDRESS=${testContract}`));

    assert.strictEqual(existsSync(pendingPath), false);
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery: idempotent completion after a partial local write verifies on-chain and removes stale journal", async () => {
  const mockDir = createHermeticMockDir();
  try {
    const pendingPath = resolve(mockDir, "deployments", "makewhole-v2.pending.json");
    const receiptPath = resolve(mockDir, "deployments", "makewhole-v2.json");
    const envPath = resolve(mockDir, "web", ".env.local");

    const testTxHash = "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908";
    const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
    const testContract = "0xddE116CEb433732C56a9E8FDf50ddF12D741e745";

    writeFileSync(
      pendingPath,
      JSON.stringify({
        project: "makewhole",
        version: "v2",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
        contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
        status: "BROADCAST",
        deploymentTxHash: testTxHash,
        createdAtUtc: "2026-10-17T17:30:12.025Z",
        broadcastAtUtc: "2026-10-17T17:30:14.669Z",
      })
    );

    writeFileSync(
      receiptPath,
      JSON.stringify({
        project: "makewhole",
        version: "v2",
        chainId: 61997,
        networkName: "GenLayer Studio-dev",
        rpcHost: "studio-dev.genlayer.com",
        explorerBaseUrl: "https://explorer-studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        contractAddress: testContract,
        deploymentTxHash: testTxHash,
        sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
        contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
        executionResult: "FINISHED_WITH_RETURN",
        broadcastAtUtc: "2026-10-17T17:30:14.669Z",
        recoveredAtUtc: "2026-10-17T18:00:00.000Z",
        sdkVersion: "2.0.0-rc.1",
      })
    );

    writeFileSync(envPath, "NEXT_PUBLIC_CONTRACT_ADDRESS=0xold\n");

    const mockClient = {
      async waitForTransactionReceipt() {
        return {
          status_name: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          recipient: testContract,
          sender: testDeployer,
          hash: testTxHash,
          type: 1,
          data: { contract_address: testContract },
        };
      },
      async getContractSchema() {
        return makeFullV2MockSchema();
      },
      async readContract({ functionName }) {
        if (functionName === "list_ids") return [];
        if (functionName === "get_economics") {
          return { pool: 0, locked_bonds: 0, locked_jobs: 0, credits: 0, slash_count: 0, settled_ok: 0, settled_rug: 0 };
        }
        return null;
      },
    };

    const contractSource = historicalV2Source;

    const res = await executeRecovery({
      confirmAddress: testDeployer,
      confirmContractAddress: testContract,
      rootPath: mockDir,
      client: mockClient,
      execGitFn: makeMockGit(contractSource),
    });

    assert.strictEqual(res.recovered, true);
    assert.strictEqual(res.idempotent, true);
    assert.strictEqual(existsSync(pendingPath), false);
    assert.strictEqual(existsSync(receiptPath), true);
    const envContent = readFileSync(envPath, "utf8");
    assert.match(envContent, new RegExp(`NEXT_PUBLIC_CONTRACT_ADDRESS=${testContract}`));
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery: receipt-only path cannot self-confirm; requires confirmation flags and verifies on-chain", async () => {
  const mockDir = createHermeticMockDir();
  try {
    const receiptPath = resolve(mockDir, "deployments", "makewhole-v2.json");
    const envPath = resolve(mockDir, "web", ".env.local");

    const testTxHash = "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908";
    const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
    const testContract = "0xddE116CEb433732C56a9E8FDf50ddF12D741e745";

    writeFileSync(
      receiptPath,
      JSON.stringify({
        project: "makewhole",
        version: "v2",
        chainId: 61997,
        networkName: "GenLayer Studio-dev",
        rpcHost: "studio-dev.genlayer.com",
        explorerBaseUrl: "https://explorer-studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        contractAddress: testContract,
        deploymentTxHash: testTxHash,
        sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
        contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
        executionResult: "FINISHED_WITH_RETURN",
        broadcastAtUtc: "2026-10-17T17:30:14.669Z",
        recoveredAtUtc: "2026-10-17T18:00:00.000Z",
        sdkVersion: "2.0.0-rc.1",
      })
    );
    writeFileSync(envPath, "NEXT_PUBLIC_CONTRACT_ADDRESS=0xold\n");

    const mockClient = {
      async waitForTransactionReceipt() {
        return {
          status_name: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          recipient: testContract,
          sender: testDeployer,
          hash: testTxHash,
          type: 1,
          data: { contract_address: testContract },
        };
      },
      async getContractSchema() {
        return makeFullV2MockSchema();
      },
      async readContract({ functionName }) {
        if (functionName === "list_ids") return [];
        if (functionName === "get_economics") {
          return { pool: 0, locked_bonds: 0, locked_jobs: 0, credits: 0, slash_count: 0, settled_ok: 0, settled_rug: 0 };
        }
        return null;
      },
    };

    // Mismatched confirm deployer
    await assert.rejects(
      async () =>
        executeRecovery({
          confirmAddress: "0x1111111111111111111111111111111111111111",
          confirmContractAddress: testContract,
          rootPath: mockDir,
          client: mockClient,
        }),
      /does not match receipt deployer/
    );

    // Mismatched confirm contract
    await assert.rejects(
      async () =>
        executeRecovery({
          confirmAddress: testDeployer,
          confirmContractAddress: "0x1111111111111111111111111111111111111111",
          rootPath: mockDir,
          client: mockClient,
        }),
      /does not match receipt contract address/
    );

    // Valid confirmations succeed and return alreadyCompleted
    const res = await executeRecovery({
      confirmAddress: testDeployer,
      confirmContractAddress: testContract,
      rootPath: mockDir,
      client: mockClient,
    });

    assert.strictEqual(res.recovered, true);
    assert.strictEqual(res.alreadyCompleted, true);
    assert.strictEqual(res.pendingJournalStatus, "absent");
    const envContent = readFileSync(envPath, "utf8");
    assert.match(envContent, new RegExp(`NEXT_PUBLIC_CONTRACT_ADDRESS=${testContract}`));
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery: local forged receipt rejected by on-chain verification in receipt-only and idempotent paths", async () => {
  const mockDir = createHermeticMockDir();
  try {
    const receiptPath = resolve(mockDir, "deployments", "makewhole-v2.json");

    const testTxHash = "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908";
    const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
    const forgedContract = "0x9999999999999999999999999999999999999999";
    const realContract = "0xddE116CEb433732C56a9E8FDf50ddF12D741e745";

    // Forged receipt claiming contract address is 0x9999...
    writeFileSync(
      receiptPath,
      JSON.stringify({
        project: "makewhole",
        version: "v2",
        chainId: 61997,
        networkName: "GenLayer Studio-dev",
        rpcHost: "studio-dev.genlayer.com",
        explorerBaseUrl: "https://explorer-studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        contractAddress: forgedContract,
        deploymentTxHash: testTxHash,
        sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
        contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
        executionResult: "FINISHED_WITH_RETURN",
        broadcastAtUtc: "2026-10-17T17:30:14.669Z",
        recoveredAtUtc: "2026-10-17T18:00:00.000Z",
        sdkVersion: "2.0.0-rc.1",
      })
    );

    // Live RPC actually deployed realContract
    const mockClient = {
      async waitForTransactionReceipt() {
        return {
          status_name: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          recipient: realContract,
          sender: testDeployer,
          hash: testTxHash,
          type: 1,
          data: { contract_address: realContract },
        };
      },
    };

    await assert.rejects(
      async () =>
        executeRecovery({
          confirmAddress: testDeployer,
          confirmContractAddress: forgedContract,
          rootPath: mockDir,
          client: mockClient,
        }),
      /does not match receipt/
    );
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Release Registry: metadata isolation and immutability", () => {
  assert.strictEqual(DEFAULT_RELEASE, "v2");
  assert.strictEqual(DEPLOYMENT_RELEASES.v2.version, "v2");
  assert.strictEqual(DEPLOYMENT_RELEASES.v2.receiptFilename, "makewhole-v2.json");
  assert.strictEqual(DEPLOYMENT_RELEASES.v2.pendingFilename, "makewhole-v2.pending.json");

  assert.strictEqual(DEPLOYMENT_RELEASES["v2.1"].version, "v2.1");
  assert.strictEqual(DEPLOYMENT_RELEASES["v2.1"].receiptFilename, "makewhole-v2.1.json");
  assert.strictEqual(DEPLOYMENT_RELEASES["v2.1"].pendingFilename, "makewhole-v2.1.pending.json");

  assert.throws(() => {
    DEPLOYMENT_RELEASES.v2.version = "v3";
  });
  assert.throws(() => {
    DEPLOYMENT_RELEASES["v2.1"].version = "v3";
  });
});

test("Release Registry: fixed paths cannot escape deployments directory", () => {
  for (const rel of ["v2", "v2.1"]) {
    const config = resolveReleaseConfig(rel);
    assert.strictEqual(config.receiptFilename.includes("/"), false);
    assert.strictEqual(config.receiptFilename.includes("\\"), false);
    assert.strictEqual(config.receiptFilename.includes(".."), false);
    assert.strictEqual(config.pendingFilename.includes("/"), false);
    assert.strictEqual(config.pendingFilename.includes("\\"), false);
    assert.strictEqual(config.pendingFilename.includes(".."), false);
  }
});

test("Collision Guard: v2 receipt blocks v2 deployment", () => {
  const mockDir = createHermeticMockDir();
  try {
    writeFileSync(resolve(mockDir, "deployments", "makewhole-v2.json"), "{}");
    assert.throws(
      () => assertNoDeploymentCollisions({ deploymentsDir: resolve(mockDir, "deployments"), release: "v2" }),
      /makewhole-v2.json already exists/
    );
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Collision Guard: v2 receipt does NOT block v2.1 deployment or dry-run", () => {
  const mockDir = createHermeticMockDir();
  try {
    writeFileSync(resolve(mockDir, "deployments", "makewhole-v2.json"), "{}");
    const result = assertNoDeploymentCollisions({ deploymentsDir: resolve(mockDir, "deployments"), release: "v2.1" });
    assert.strictEqual(result.release, "v2.1");
    assert.strictEqual(result.receiptFile, resolve(mockDir, "deployments", "makewhole-v2.1.json"));
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Collision Guard: v2.1 receipt blocks v2.1 deployment", () => {
  const mockDir = createHermeticMockDir();
  try {
    writeFileSync(resolve(mockDir, "deployments", "makewhole-v2.1.json"), "{}");
    assert.throws(
      () => assertNoDeploymentCollisions({ deploymentsDir: resolve(mockDir, "deployments"), release: "v2.1" }),
      /makewhole-v2.1.json already exists/
    );
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Collision Guard: v2.1 pending journal blocks a second deployment", () => {
  const mockDir = createHermeticMockDir();
  try {
    writeFileSync(resolve(mockDir, "deployments", "makewhole-v2.1.pending.json"), "{}");
    assert.throws(
      () => assertNoDeploymentCollisions({ deploymentsDir: resolve(mockDir, "deployments"), release: "v2.1" }),
      /makewhole-v2.1.pending.json already exists/
    );
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Validation: cross-release receipt/version mismatch rejection", () => {
  const baseValidV2 = {
    project: "makewhole",
    version: "v2",
    chainId: 61997,
    networkName: "GenLayer Studio-dev",
    rpcHost: "studio-dev.genlayer.com",
    explorerBaseUrl: "https://explorer-studio-dev.genlayer.com",
    deployerAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
    contractAddress: "0xddE116CEb433732C56a9E8FDf50ddF12D741e745",
    deploymentTxHash: "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908",
    sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
    contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
    executionResult: "FINISHED_WITH_RETURN",
    broadcastAtUtc: "2026-10-17T17:30:14.669Z",
    recoveredAtUtc: "2026-10-17T18:00:00.000Z",
    sdkVersion: "2.0.0-rc.1",
  };

  // v2 receipt cannot validate as v2.1
  assert.throws(
    () => validateReceiptArtifact(baseValidV2, "v2.1"),
    /Invalid receipt version 'v2', expected 'v2.1'/
  );

  // v2.1 receipt cannot validate as v2
  const baseValidV21 = { ...baseValidV2, version: "v2.1" };
  assert.throws(
    () => validateReceiptArtifact(baseValidV21, "v2"),
    /Invalid receipt version 'v2.1', expected 'v2'/
  );

  // v2.1 receipt validates as v2.1
  assert.strictEqual(validateReceiptArtifact(baseValidV21, "v2.1"), true);
});

test("Validation: cross-release pending journal mismatch rejection", () => {
  const baseJournal = {
    project: "makewhole",
    version: "v2",
    chainId: 61997,
    rpcHost: "studio-dev.genlayer.com",
    deployerAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
    sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
    contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
    createdAtUtc: "2026-10-17T17:30:12.025Z",
    broadcastAtUtc: "2026-10-17T17:30:14.669Z",
    status: "BROADCAST",
    deploymentTxHash: "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908",
  };

  // v2 journal cannot validate as v2.1
  assert.throws(
    () => validatePendingJournal(baseJournal, "v2.1"),
    /Release mismatch: journal has version 'v2', expected 'v2.1'/
  );

  // v2.1 journal cannot validate as v2
  const baseJournalV21 = { ...baseJournal, version: "v2.1" };
  assert.throws(
    () => validatePendingJournal(baseJournalV21, "v2"),
    /Release mismatch: journal has version 'v2.1', expected 'v2'/
  );

  // v2.1 journal validates as v2.1
  assert.strictEqual(validatePendingJournal(baseJournalV21, "v2.1"), true);
});

test("Recovery Isolation: v2 recovery cannot consume v2.1 pending journal", async () => {
  const mockDir = createHermeticMockDir();
  try {
    const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
    const testContract = "0xddE116CEb433732C56a9E8FDf50ddF12D741e745";

    // Place only v2.1 journal
    writeFileSync(
      resolve(mockDir, "deployments", "makewhole-v2.1.pending.json"),
      JSON.stringify({
        project: "makewhole",
        version: "v2.1",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        sourceCommit: "ae32a87e996798ed56d8046a4df4bc2fb34e0634",
        contractSourceSha256: "b6fc29958cc2efa5cb340fcfb2b4b932f72841ba1dcc27937609583b6ac6f1b1",
        createdAtUtc: "2026-10-18T12:00:00.000Z",
        broadcastAtUtc: "2026-10-18T12:00:02.000Z",
        status: "BROADCAST",
        deploymentTxHash: "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908",
      })
    );

    // v2 recovery must fail because makewhole-v2.pending.json is missing
    await assert.rejects(
      async () =>
        executeRecovery({
          confirmAddress: testDeployer,
          confirmContractAddress: testContract,
          release: "v2",
          rootPath: mockDir,
        }),
      /No pending deployment journal found at '.*makewhole-v2\.pending\.json'/
    );

    // Assert v2.1 journal was untouched
    assert.strictEqual(existsSync(resolve(mockDir, "deployments", "makewhole-v2.1.pending.json")), true);
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery Isolation: v2.1 recovery cannot consume v2 pending journal", async () => {
  const mockDir = createHermeticMockDir();
  try {
    const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
    const testContract = "0xddE116CEb433732C56a9E8FDf50ddF12D741e745";

    // Place only v2 journal
    writeFileSync(
      resolve(mockDir, "deployments", "makewhole-v2.pending.json"),
      JSON.stringify({
        project: "makewhole",
        version: "v2",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        sourceCommit: "903c08382c0b415ca7067d49085df3128736df25",
        contractSourceSha256: "0014fa3813dd4465ca73698d9835afc91c4c3e8b04ceed74851ec47bfd75ad45",
        createdAtUtc: "2026-10-17T17:30:12.025Z",
        broadcastAtUtc: "2026-10-17T17:30:14.669Z",
        status: "BROADCAST",
        deploymentTxHash: "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908",
      })
    );

    // v2.1 recovery must fail because makewhole-v2.1.pending.json is missing
    await assert.rejects(
      async () =>
        executeRecovery({
          confirmAddress: testDeployer,
          confirmContractAddress: testContract,
          release: "v2.1",
          rootPath: mockDir,
        }),
      /No pending deployment journal found at '.*makewhole-v2\.1\.pending\.json'/
    );

    // Assert v2 journal was untouched
    assert.strictEqual(existsSync(resolve(mockDir, "deployments", "makewhole-v2.pending.json")), true);
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Recovery Isolation: v2.1 recovery never deletes another release's pending journal", async () => {
  const currentContractSource = readFileSync(resolve(process.cwd(), "contracts", "makewhole.py"), "utf8");
  const mockDir = createHermeticMockDir(currentContractSource);
  try {
    const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
    const testContract = "0x2222222222222222222222222222222222222222";
    const testTxHash = "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908";

    // Place both v2 and v2.1 pending journals
    const v2JournalPath = resolve(mockDir, "deployments", "makewhole-v2.pending.json");
    const v21JournalPath = resolve(mockDir, "deployments", "makewhole-v2.1.pending.json");

    writeFileSync(v2JournalPath, JSON.stringify({ project: "makewhole", version: "v2" }));
    writeFileSync(
      v21JournalPath,
      JSON.stringify({
        project: "makewhole",
        version: "v2.1",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        sourceCommit: "ae32a87e996798ed56d8046a4df4bc2fb34e0634",
        contractSourceSha256: "b6fc29958cc2efa5cb340fcfb2b4b932f72841ba1dcc27937609583b6ac6f1b1",
        createdAtUtc: "2026-10-18T12:00:00.000Z",
        broadcastAtUtc: "2026-10-18T12:00:02.000Z",
        status: "BROADCAST",
        deploymentTxHash: testTxHash,
      })
    );
    writeFileSync(resolve(mockDir, "web", ".env.local"), "NEXT_PUBLIC_CONTRACT_ADDRESS=0xold\n");

    const mockClient = {
      async waitForTransactionReceipt() {
        return {
          status_name: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          recipient: testContract,
          sender: testDeployer,
          hash: testTxHash,
          type: 1,
          data: { contract_address: testContract },
        };
      },
      async getContractSchema() {
        return makeFullV2MockSchema();
      },
      async readContract({ functionName }) {
        if (functionName === "list_ids") return [];
        if (functionName === "get_economics") {
          return { pool: 0, locked_bonds: 0, locked_jobs: 0, credits: 0, slash_count: 0, settled_ok: 0, settled_rug: 0 };
        }
        return null;
      },
    };

    const mockGit = (args) => {
      const cmd = args.join(" ");
      if (cmd.includes("status --porcelain")) return "";
      return currentContractSource;
    };

    const recResult = await executeRecovery({
      confirmAddress: testDeployer,
      confirmContractAddress: testContract,
      release: "v2.1",
      rootPath: mockDir,
      client: mockClient,
      execGitFn: mockGit,
    });

    assert.strictEqual(recResult.recovered, true);
    assert.strictEqual(recResult.contractAddress, testContract);
    // v2.1 pending journal was removed
    assert.strictEqual(existsSync(v21JournalPath), false);
    // v2 pending journal remains PRESERVED
    assert.strictEqual(existsSync(v2JournalPath), true);
    // v2.1 final receipt exists
    const v21Receipt = JSON.parse(readFileSync(resolve(mockDir, "deployments", "makewhole-v2.1.json"), "utf8"));
    assert.strictEqual(v21Receipt.version, "v2.1");
    // web/.env.local was updated with v2.1 contract
    assert.match(readFileSync(resolve(mockDir, "web", ".env.local"), "utf8"), new RegExp(testContract));
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Dry-run Safety: dry-run preflight does not mutate artifacts or environment", () => {
  const mockDir = createHermeticMockDir();
  try {
    const envBefore = "NEXT_PUBLIC_CONTRACT_ADDRESS=0xoriginal\n";
    writeFileSync(resolve(mockDir, "web", ".env.local"), envBefore);
    const filesBefore = readdirSync(resolve(mockDir, "deployments"));

    const readiness = evaluatePreflightReadiness({
      sourceGatePassed: true,
      rpcProbePassed: true,
      rpcChainMatched: true,
      feeEstimatePassed: true,
      collisionPassed: true,
    });

    formatDeploymentPlan({
      readiness,
      networkName: "GenLayer Studio-dev",
      chainId: 61997,
      rpcUrl: "https://studio-dev.genlayer.com/api",
      historicalV1Status: "REACHABLE",
      release: "v2.1",
    });

    const envAfter = readFileSync(resolve(mockDir, "web", ".env.local"), "utf8");
    const filesAfter = readdirSync(resolve(mockDir, "deployments"));

    assert.strictEqual(envAfter, envBefore);
    assert.deepStrictEqual(filesAfter, filesBefore);
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

// ============================================================================
// KEYCHAIN RELEASE PROPAGATION & BALANCE HARDENING TESTS
// ============================================================================

test("Keychain parser: defaults to v2 when --release is omitted", () => {
  assert.strictEqual(parseKeychainArgs([]).release, "v2");
  assert.strictEqual(parseKeychainArgs(["--preflight"]).release, "v2");
});

test("Keychain parser: accepts both v2.1 release syntaxes", () => {
  assert.strictEqual(parseKeychainArgs(["--preflight", "--release", "v2.1"]).release, "v2.1");
  assert.strictEqual(parseKeychainArgs(["--preflight", "--release=v2.1"]).release, "v2.1");
});

test("Keychain preflight: propagates release v2.1 to dry-run execution", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };
  const mockClient = {
    async getBalance() {
      return 2_000_000_000_000_000_000n;
    },
  };

  let capturedArgs = null;
  const res = await executeKeychainPreflight({
    keytar: mockKeytar,
    client: mockClient,
    release: "v2.1",
    runDryRunFn: (args) => {
      capturedArgs = args;
      return { status: 0 };
    },
  });

  assert.strictEqual(res.release, "v2.1");
  assert.ok(Array.isArray(capturedArgs));
  assert.strictEqual(capturedArgs.includes("--release"), true);
  assert.strictEqual(capturedArgs.includes("v2.1"), true);
  assert.strictEqual(res.dryRunArgs.includes("v2.1"), true);
});

test("Keychain deployment: propagates release v2.1 to spawned deploy.mjs child arguments", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };
  const mockClient = {
    async getBalance() {
      return 2_000_000_000_000_000_000n;
    },
  };

  let capturedSpawnArgs = null;
  const res = await executeDeployFromKeychain({
    keytar: mockKeytar,
    client: mockClient,
    confirmAddress: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A",
    release: "v2.1",
    spawnFn: (file, args) => {
      capturedSpawnArgs = args;
      return { status: 0 };
    },
  });

  assert.strictEqual(res.release, "v2.1");
  assert.ok(Array.isArray(capturedSpawnArgs));
  assert.strictEqual(capturedSpawnArgs.includes("--release"), true);
  assert.strictEqual(capturedSpawnArgs.includes("v2.1"), true);
  assert.strictEqual(res.spawnArgs.includes("v2.1"), true);
});

test("Keychain recovery: v2.1 recovery remains release-scoped and handles matching journal", async () => {
  const currentContractSource = readFileSync(resolve(process.cwd(), "contracts", "makewhole.py"), "utf8");
  const mockDir = createHermeticMockDir(currentContractSource);
  try {
    const testDeployer = "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf";
    const testContract = "0x3333333333333333333333333333333333333333";
    const testTxHash = "0xab2da5a199cf0c70b9edf78b3f57fcfba12f4eaf0af2d5195ead26ee120c2908";

    // Write v2.1 journal
    writeFileSync(
      resolve(mockDir, "deployments", "makewhole-v2.1.pending.json"),
      JSON.stringify({
        project: "makewhole",
        version: "v2.1",
        chainId: 61997,
        rpcHost: "studio-dev.genlayer.com",
        deployerAddress: testDeployer,
        sourceCommit: "ae32a87e996798ed56d8046a4df4bc2fb34e0634",
        contractSourceSha256: "b6fc29958cc2efa5cb340fcfb2b4b932f72841ba1dcc27937609583b6ac6f1b1",
        status: "BROADCAST",
        deploymentTxHash: testTxHash,
        createdAtUtc: "2026-10-18T10:00:00.000Z",
        broadcastAtUtc: "2026-10-18T10:00:05.000Z",
      })
    );

    // Also place dummy v2 journal
    writeFileSync(
      resolve(mockDir, "deployments", "makewhole-v2.pending.json"),
      JSON.stringify({ project: "makewhole", version: "v2" })
    );

    const mockClient = {
      async waitForTransactionReceipt() {
        return {
          status_name: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          recipient: testContract,
          sender: testDeployer,
          hash: testTxHash,
          type: 1,
          data: { contract_address: testContract },
        };
      },
      async getContractSchema() {
        return makeFullV2MockSchema();
      },
      async readContract({ functionName }) {
        if (functionName === "list_ids") return [];
        if (functionName === "get_economics") {
          return { pool: 0, locked_bonds: 0, locked_jobs: 0, credits: 0, slash_count: 0, settled_ok: 0, settled_rug: 0 };
        }
        return null;
      },
    };

    const res = await executeRecovery({
      confirmAddress: testDeployer,
      confirmContractAddress: testContract,
      release: "v2.1",
      rootPath: mockDir,
      client: mockClient,
      execGitFn: makeMockGit(currentContractSource),
    });

    assert.strictEqual(res.recovered, true);
    assert.strictEqual(res.contractAddress, testContract);
    assert.strictEqual(existsSync(resolve(mockDir, "deployments", "makewhole-v2.1.pending.json")), false);
    assert.strictEqual(existsSync(resolve(mockDir, "deployments", "makewhole-v2.1.json")), true);
    assert.strictEqual(existsSync(resolve(mockDir, "deployments", "makewhole-v2.pending.json")), true);
  } finally {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

test("Keychain dispatcher: formatPreflightReport reflects release v2.1", () => {
  const report = formatPreflightReport({
    accountExists: true,
    publicAddress: "0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf",
    release: "v2.1",
  });
  assert.match(report, /MAKEWHOLE V2\.1 KEYCHAIN OPERATOR PREFLIGHT/);
  assert.match(report, /Selected Release\s+:\s+v2\.1/);
  assert.doesNotMatch(report, /MAKEWHOLE v2 /);
});

test("READY plan: contains secure keychain deployment command, --release v2.1, and required confirm address", () => {
  const ready = evaluatePreflightReadiness({
    sourceGatePassed: true,
    rpcProbePassed: true,
    rpcChainMatched: true,
    feeEstimatePassed: true,
    collisionPassed: true,
  });

  const plan = formatDeploymentPlan({
    readiness: ready,
    networkName: "GenLayer Studio-dev",
    chainId: 61997,
    rpcUrl: "https://studio-dev.genlayer.com/api",
    historicalV1Status: "REACHABLE",
    release: "v2.1",
    confirmAddress: CANONICAL_DEPLOYER_ADDRESS,
  });

  assert.match(plan, /Deployment Readiness: READY/);
  assert.match(plan, /node scripts\/deploy-keychain\.mjs --deploy --release v2\.1 --confirm-address 0x5B8942987E95Dfc3EA56F392e37011a86EFB0baf/);
  assert.doesNotMatch(plan, /GENLAYER_PRIVATE_KEY/);
  assert.doesNotMatch(plan, /deploy:execute/);
});

test("Ordinary dry-run: ignores dummy GENLAYER_PRIVATE_KEY and loads no signer", () => {
  const deployScript = resolve(process.cwd(), "scripts", "deploy.mjs");
  const dummyKey = "0x" + "a".repeat(64);
  const out = execSync(`node "${deployScript}" --dry-run --release v2.1`, {
    env: { ...process.env, GENLAYER_PRIVATE_KEY: dummyKey },
    encoding: "utf8",
  });

  assert.match(out, /Configured Deployer\s+:\s+\[No signer loaded - dry-run operates without credentials\]/);
  assert.doesNotMatch(out, new RegExp(dummyKey));
});

test("Keychain deployment: balance below 1 GEN fails closed before spawning", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };
  const mockClient = {
    async getBalance() {
      // 0.5 GEN (below 1 GEN)
      return 500_000_000_000_000_000n;
    },
  };

  let spawnCalled = false;
  await assert.rejects(
    async () =>
      executeDeployFromKeychain({
        keytar: mockKeytar,
        client: mockClient,
        confirmAddress: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A",
        release: "v2.1",
        spawnFn: () => {
          spawnCalled = true;
          return { status: 0 };
        },
      }),
    /insufficient balance.*Required target is 1 GEN.*Exact deficit: 500000000000000000 wei/
  );
  assert.strictEqual(spawnCalled, false);
});

test("Keychain deployment: balance exactly 1 GEN may reach mocked spawn step", async () => {
  const deployerKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockKeytar = {
    async getPassword(service, account) {
      return deployerKey;
    },
  };
  const mockClient = {
    async getBalance() {
      // Exactly 1 GEN
      return 1_000_000_000_000_000_000n;
    },
  };

  let spawnCalled = false;
  const res = await executeDeployFromKeychain({
    keytar: mockKeytar,
    client: mockClient,
    confirmAddress: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A",
    release: "v2.1",
    spawnFn: (file, args) => {
      spawnCalled = true;
      return { status: 0 };
    },
  });

  assert.strictEqual(spawnCalled, true);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.release, "v2.1");
});

test("Hermeticity check: no test files or directories created in repository scratch/", () => {
  const scratchDir = resolve(process.cwd(), "scratch");
  if (existsSync(scratchDir)) {
    const entries = readdirSync(scratchDir);
    for (const e of entries) {
      assert.strictEqual(
        baselineScratchEntries.has(e),
        true,
        `Found new test artifact created in repository scratch: ${e}`
      );
    }
  }
});
