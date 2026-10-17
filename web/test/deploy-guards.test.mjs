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
} from "../../scripts/deploy-helpers.mjs";

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
    "NEXT_PUBLIC_STUDIO_RPC=https://studio-next.genlayer.com/api",
    "NEXT_PUBLIC_STUDIO_EXPLORER=https://explorer-studio-dev.genlayer.com",
    "GENLAYER_STUDIO_URL=https://studio-next.genlayer.com/api",
    "",
    "# Analytics & Telemetry",
    "NEXT_PUBLIC_ANALYTICS_ID=analytics_12345",
    "SECRET_API_GATEWAY=https://internal.gateway",
  ].join("\n");

  const replacements = {
    NEXT_PUBLIC_CONTRACT_ADDRESS: "0xNewV2ContractAddress99999999999999999999",
    NEXT_PUBLIC_CHAIN_ID: "61997",
    NEXT_PUBLIC_STUDIO_RPC: "https://studio-next.genlayer.com/api",
    NEXT_PUBLIC_STUDIO_EXPLORER: "https://explorer-studio-dev.genlayer.com",
    GENLAYER_STUDIO_URL: "https://studio-next.genlayer.com/api",
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
