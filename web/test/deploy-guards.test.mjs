import test from "node:test";
import assert from "node:assert/strict";

import {
  parseDeploymentArgs,
  checkReleaseSourceGate,
  validateFeeQuote,
  validateDeployReceipt,
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
} from "../../scripts/deploy-helpers.mjs";

import {
  parseKeychainArgs,
  formatPreflightReport,
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
  });
});

test("CLI argument parsing: explicit --dry-run produces dry-run mode", () => {
  const result = parseDeploymentArgs(["--dry-run"]);
  assert.deepStrictEqual(result, {
    mode: "dry-run",
    updateEnv: false,
  });
});

test("CLI argument parsing: explicit --execute produces execute mode", () => {
  const result = parseDeploymentArgs(["--execute"]);
  assert.deepStrictEqual(result, {
    mode: "execute",
    updateEnv: false,
  });
});

test("CLI argument parsing: --execute combined with --update-env is accepted", () => {
  const result = parseDeploymentArgs(["--execute", "--update-env"]);
  assert.deepStrictEqual(result, {
    mode: "execute",
    updateEnv: true,
  });
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
  const validSchema = {
    methods: {
      list_ids: {},
      get_economics: {},
      get_bond: {},
      get_reserved_bond: {},
      get_available_bond: {},
      check_bond: {},
      get_settlement: {},
      fund_pool: {},
    },
  };

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
  const incompleteSchema = {
    methods: {
      list_ids: {},
      get_economics: {},
      // missing get_reserved_bond
      get_bond: {},
      get_available_bond: {},
      check_bond: {},
      get_settlement: {},
    },
  };
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
  assert.match(plan, /DO NOT RUN deploy:execute until every required readiness check passes\./);
  assert.doesNotMatch(plan, /npm run deploy:execute/);
  assert.match(plan, /Target network RPC probe failed or timed out\./);
  assert.match(plan, /Deployment transaction fee estimation failed/);
});

test("Preflight plan & exit code: ready status permits exit 0 and prints deployment command", () => {
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
  assert.match(plan, /GENLAYER_PRIVATE_KEY=0x\.\.\. npm run deploy:execute/);
  assert.doesNotMatch(plan, /DO NOT RUN deploy:execute/);
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
    runDryRunFn: () => { dryRunInvoked = true; },
  });

  assert.strictEqual(preflightRes.accountExists, false);
  assert.strictEqual(preflightRes.publicAddress, null);
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
