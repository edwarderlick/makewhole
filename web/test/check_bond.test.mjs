import test from "node:test";
import assert from "node:assert/strict";

import {
  validateCheckBondRequest,
  mapContractCheckBondResult,
  mapRpcReadError,
  isExactAddress,
  parseWeiAmount,
  parseRepAmount,
  ZERO_ADDRESS,
} from "../src/app/api/skill/check_bond/core.ts";

const VALID_CONTRACT = "0x04A81C6B4AC43Ee9cea73B203d9Ed9ca0b89F0EF";
const VALID_WRITER = "0x81b637d8fcd2c6dac659e6963113a1170de795e4";

test("isExactAddress: correctly validates 20-byte hex and rejects zero address", () => {
  assert.strictEqual(isExactAddress(VALID_CONTRACT), true);
  assert.strictEqual(isExactAddress(VALID_WRITER), true);
  assert.strictEqual(isExactAddress(VALID_WRITER.toUpperCase()), true);

  // Zero address
  assert.strictEqual(isExactAddress(ZERO_ADDRESS), false);
  assert.strictEqual(isExactAddress("0x0000000000000000000000000000000000000000"), false);

  // Invalid formats
  assert.strictEqual(isExactAddress(""), false);
  assert.strictEqual(isExactAddress("0x"), false);
  assert.strictEqual(isExactAddress("0x123"), false);
  assert.strictEqual(isExactAddress("0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"), false);
  assert.strictEqual(isExactAddress(VALID_CONTRACT + "00"), false); // 21 bytes
  assert.strictEqual(isExactAddress(VALID_CONTRACT.slice(0, -2)), false); // 19 bytes
  assert.strictEqual(isExactAddress(null), false);
  assert.strictEqual(isExactAddress(undefined), false);
});

test("parseWeiAmount: normalizes safe integers/bigints/strings to decimal string without overflow", () => {
  assert.strictEqual(parseWeiAmount(0), "0");
  assert.strictEqual(parseWeiAmount(1000), "1000");
  assert.strictEqual(parseWeiAmount(1000n), "1000");
  assert.strictEqual(parseWeiAmount("1000"), "1000");

  // Number.MAX_SAFE_INTEGER: accepted
  assert.strictEqual(parseWeiAmount(Number.MAX_SAFE_INTEGER), String(Number.MAX_SAFE_INTEGER));

  // Number.MAX_SAFE_INTEGER + 1: rejected
  assert.strictEqual(parseWeiAmount(Number.MAX_SAFE_INTEGER + 1), null);

  // A very large decimal string: accepted exactly
  const veryLargeDecimalStr = "500000000000000000000000000000000000000000000000";
  assert.strictEqual(parseWeiAmount(veryLargeDecimalStr), veryLargeDecimalStr);

  // A very large bigint: accepted exactly
  const veryLargeBigInt = 500000000000000000000000000000000000000000000000n;
  assert.strictEqual(parseWeiAmount(veryLargeBigInt), veryLargeDecimalStr);

  // Malformed and negative values
  assert.strictEqual(parseWeiAmount(-1), null);
  assert.strictEqual(parseWeiAmount("-1"), null);
  assert.strictEqual(parseWeiAmount(-100n), null);
  assert.strictEqual(parseWeiAmount(NaN), null);
  assert.strictEqual(parseWeiAmount(Infinity), null);
  assert.strictEqual(parseWeiAmount(-Infinity), null);
  assert.strictEqual(parseWeiAmount("abc"), null);
  assert.strictEqual(parseWeiAmount("12.34"), null);
  assert.strictEqual(parseWeiAmount(12.34), null);
  assert.strictEqual(parseWeiAmount(true), null);
  assert.strictEqual(parseWeiAmount(null), null);
  assert.strictEqual(parseWeiAmount(undefined), null);
});

test("validateCheckBondRequest: missing or whitespace job parameter returns 400", () => {
  const cases = [undefined, null, "", "   "];
  for (const emptyJob of cases) {
    const res = validateCheckBondRequest(VALID_CONTRACT, emptyJob);
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.failure.status, 400);
      assert.strictEqual(res.failure.body.bonded, false);
      assert.strictEqual(res.failure.body.error, "MISSING_JOB_ID");
      assert.strictEqual(res.failure.body.reason, "Missing job parameter");
    }
  }
});

test("validateCheckBondRequest: unconfigured or zero-address contract returns 503", () => {
  const invalidAddrs = [undefined, null, "", "0x", "0x123", ZERO_ADDRESS, "not-an-address"];
  for (const badAddr of invalidAddrs) {
    const res = validateCheckBondRequest(badAddr, "0xjob123");
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.failure.status, 503);
      assert.strictEqual(res.failure.body.bonded, false);
      assert.strictEqual(res.failure.body.job_id, "0xjob123");
      assert.strictEqual(res.failure.body.error, "CONTRACT_NOT_CONFIGURED");
    }
  }
});

test("validateCheckBondRequest: valid inputs succeed", () => {
  const res = validateCheckBondRequest(VALID_CONTRACT, "0xjobabc");
  assert.strictEqual(res.ok, true);
  if (res.ok) {
    assert.strictEqual(res.jobId, "0xjobabc");
    assert.strictEqual(res.contractAddress, VALID_CONTRACT);
  }
});

test("mapRpcReadError: returns 503 without leaking raw messages or fake addresses", () => {
  const res = mapRpcReadError("0xjobabc");
  assert.strictEqual(res.status, 503);
  assert.strictEqual(res.body.bonded, false);
  assert.strictEqual(res.body.job_id, "0xjobabc");
  assert.strictEqual(res.body.error, "RPC_READ_FAILED");
  assert.strictEqual(res.body.reason, "Failed to read bond status from contract");
  assert.strictEqual(res.body.writer, undefined);
  assert.strictEqual(res.body.state, undefined);
});

test("mapContractCheckBondResult: valid bonded v2 response", () => {
  const payload = {
    bonded: true,
    bond: "1000",
    total_bond: "1000",
    reserved_bond: "300",
    available_bond: "700",
    job_reserved_bond: "300",
    pay_c: "300",
    rep: 10,
    state: "BONDED",
    writer: VALID_WRITER,
  };
  const outcome = mapContractCheckBondResult("0xjobabc", payload);
  assert.strictEqual(outcome.status, 200);
  assert.strictEqual(outcome.body.bonded, true);
  assert.strictEqual(outcome.body.job_id, "0xjobabc");
  assert.strictEqual(outcome.body.writer, VALID_WRITER);
  assert.strictEqual(outcome.body.state, "BONDED");
  assert.strictEqual(outcome.body.bond, "1000");
  assert.strictEqual(outcome.body.total_bond, "1000");
  assert.strictEqual(outcome.body.reserved_bond, "300");
  assert.strictEqual(outcome.body.available_bond, "700");
  assert.strictEqual(outcome.body.job_reserved_bond, "300");
  assert.strictEqual(outcome.body.pay_c, "300");
  assert.strictEqual(outcome.body.rep, 10);
});

test("mapContractCheckBondResult: valid unbonded response with zero job reservation", () => {
  const payload = {
    bonded: false,
    bond: "500",
    total_bond: "500",
    reserved_bond: "200",
    available_bond: "300",
    job_reserved_bond: "0",
    pay_c: "400",
    rep: 5,
    state: "OPEN",
    writer: VALID_WRITER,
  };
  const outcome = mapContractCheckBondResult("0xjobabc", payload);
  assert.strictEqual(outcome.status, 200);
  assert.strictEqual(outcome.body.bonded, false);
  assert.strictEqual(outcome.body.job_id, "0xjobabc");
  assert.strictEqual(outcome.body.error, "NOT_BONDED");
  assert.strictEqual(outcome.body.writer, VALID_WRITER);
  assert.strictEqual(outcome.body.state, "OPEN");
  assert.strictEqual(outcome.body.bond, "500");
  assert.strictEqual(outcome.body.total_bond, "500");
  assert.strictEqual(outcome.body.reserved_bond, "200");
  assert.strictEqual(outcome.body.available_bond, "300");
  assert.strictEqual(outcome.body.job_reserved_bond, "0");
  assert.strictEqual(outcome.body.pay_c, "400");
  assert.strictEqual(outcome.body.rep, 5);
});

test("mapContractCheckBondResult: arbitrary-precision amounts", () => {
  const total = "1000000000000000000000000000000000000000000000000";
  const reserved = "400000000000000000000000000000000000000000000000";
  const available = "600000000000000000000000000000000000000000000000";
  const jobRes = "400000000000000000000000000000000000000000000000";
  const payC = "400000000000000000000000000000000000000000000000";

  const payload = {
    bonded: true,
    bond: total,
    total_bond: total,
    reserved_bond: reserved,
    available_bond: available,
    job_reserved_bond: jobRes,
    pay_c: payC,
    rep: 0,
    state: "IN_FLIGHT",
    writer: VALID_WRITER,
  };
  const outcome = mapContractCheckBondResult("0xjobabc", payload);
  assert.strictEqual(outcome.status, 200);
  assert.strictEqual(outcome.body.bonded, true);
  assert.strictEqual(outcome.body.total_bond, total);
  assert.strictEqual(outcome.body.available_bond, available);
  assert.strictEqual(outcome.body.job_reserved_bond, jobRes);
});

test("mapContractCheckBondResult: bond != total_bond fails closed with 503", () => {
  const payload = {
    bonded: true,
    bond: "999",
    total_bond: "1000",
    reserved_bond: "300",
    available_bond: "700",
    job_reserved_bond: "300",
    pay_c: "300",
    rep: 0,
    state: "BONDED",
    writer: VALID_WRITER,
  };
  const outcome = mapContractCheckBondResult("0xjobabc", payload);
  assert.strictEqual(outcome.status, 503);
  assert.strictEqual(outcome.body.error, "INVALID_CONTRACT_RESPONSE");
});

test("mapContractCheckBondResult: reserved > total fails closed with 503", () => {
  const payload = {
    bonded: false,
    bond: "1000",
    total_bond: "1000",
    reserved_bond: "1200",
    available_bond: "0",
    job_reserved_bond: "0",
    pay_c: "300",
    rep: 0,
    state: "OPEN",
    writer: VALID_WRITER,
  };
  const outcome = mapContractCheckBondResult("0xjobabc", payload);
  assert.strictEqual(outcome.status, 503);
  assert.strictEqual(outcome.body.error, "INVALID_CONTRACT_RESPONSE");
});

test("mapContractCheckBondResult: incorrect available amount fails closed with 503", () => {
  const payload = {
    bonded: true,
    bond: "1000",
    total_bond: "1000",
    reserved_bond: "300",
    available_bond: "699", // should be 700
    job_reserved_bond: "300",
    pay_c: "300",
    rep: 0,
    state: "BONDED",
    writer: VALID_WRITER,
  };
  const outcome = mapContractCheckBondResult("0xjobabc", payload);
  assert.strictEqual(outcome.status, 503);
  assert.strictEqual(outcome.body.error, "INVALID_CONTRACT_RESPONSE");
});

test("mapContractCheckBondResult: job reservation > aggregate reservation fails closed with 503", () => {
  const payload = {
    bonded: false,
    bond: "1000",
    total_bond: "1000",
    reserved_bond: "300",
    available_bond: "700",
    job_reserved_bond: "400", // exceeds reserved_bond of 300
    pay_c: "300",
    rep: 0,
    state: "OPEN",
    writer: VALID_WRITER,
  };
  const outcome = mapContractCheckBondResult("0xjobabc", payload);
  assert.strictEqual(outcome.status, 503);
  assert.strictEqual(outcome.body.error, "INVALID_CONTRACT_RESPONSE");
});

test("mapContractCheckBondResult: bonded state outside approved active states fails closed with 503", () => {
  const unapprovedStates = ["OPEN", "SETTLED_OK", "SETTLED_RUG", "CANCELED", "RANDOM_STATE"];
  for (const st of unapprovedStates) {
    const payload = {
      bonded: true,
      bond: "1000",
      total_bond: "1000",
      reserved_bond: "300",
      available_bond: "700",
      job_reserved_bond: "300",
      pay_c: "300",
      rep: 0,
      state: st,
      writer: VALID_WRITER,
    };
    const outcome = mapContractCheckBondResult("0xjobabc", payload);
    assert.strictEqual(outcome.status, 503, `Expected 503 for state ${st}`);
    assert.strictEqual(outcome.body.error, "INVALID_CONTRACT_RESPONSE");
  }

  // Approved active states succeed when bonded == true
  const approvedStates = ["BONDED", "IN_FLIGHT", "ACKED", "UNDETERMINED"];
  for (const st of approvedStates) {
    const payload = {
      bonded: true,
      bond: "1000",
      total_bond: "1000",
      reserved_bond: "300",
      available_bond: "700",
      job_reserved_bond: "300",
      pay_c: "300",
      rep: 0,
      state: st,
      writer: VALID_WRITER,
    };
    const outcome = mapContractCheckBondResult("0xjobabc", payload);
    assert.strictEqual(outcome.status, 200, `Expected 200 for state ${st}`);
    assert.strictEqual(outcome.body.bonded, true);
  }
});

test("mapContractCheckBondResult: bonded=true with zero pay_c fails closed with 503", () => {
  const payload = {
    bonded: true,
    bond: "1000",
    total_bond: "1000",
    reserved_bond: "0",
    available_bond: "1000",
    job_reserved_bond: "0",
    pay_c: "0",
    rep: 0,
    state: "BONDED",
    writer: VALID_WRITER,
  };
  const outcome = mapContractCheckBondResult("0xjobabc", payload);
  assert.strictEqual(outcome.status, 503);
  assert.strictEqual(outcome.body.error, "INVALID_CONTRACT_RESPONSE");
});

test("mapContractCheckBondResult: bonded=true with job reservation != pay_c fails closed with 503", () => {
  const payload = {
    bonded: true,
    bond: "1000",
    total_bond: "1000",
    reserved_bond: "500",
    available_bond: "500",
    job_reserved_bond: "200", // != pay_c of 300
    pay_c: "300",
    rep: 0,
    state: "BONDED",
    writer: VALID_WRITER,
  };
  const outcome = mapContractCheckBondResult("0xjobabc", payload);
  assert.strictEqual(outcome.status, 503);
  assert.strictEqual(outcome.body.error, "INVALID_CONTRACT_RESPONSE");
});

test("mapContractCheckBondResult: malformed and unsafe-number values fail closed with 503", () => {
  const baseValid = {
    bonded: true,
    bond: "1000",
    total_bond: "1000",
    reserved_bond: "300",
    available_bond: "700",
    job_reserved_bond: "300",
    pay_c: "300",
    rep: 0,
    state: "BONDED",
    writer: VALID_WRITER,
  };

  const badVariants = [
    // Unsafe JS numbers
    { ...baseValid, bond: Number.MAX_SAFE_INTEGER + 1, total_bond: Number.MAX_SAFE_INTEGER + 1 },
    { ...baseValid, pay_c: Number.MAX_SAFE_INTEGER + 1 },
    { ...baseValid, reserved_bond: 1.5 },
    { ...baseValid, available_bond: NaN },
    { ...baseValid, job_reserved_bond: Infinity },
    // Negative numbers
    { ...baseValid, bond: -100, total_bond: -100 },
    // Malformed strings
    { ...baseValid, bond: "1000.5", total_bond: "1000.5" },
    { ...baseValid, reserved_bond: "0x123" },
    { ...baseValid, pay_c: "not-a-number" },
    // Missing required field
    { ...baseValid, available_bond: undefined },
    { ...baseValid, total_bond: undefined },
    { ...baseValid, job_reserved_bond: undefined },
  ];

  for (const bad of badVariants) {
    const outcome = mapContractCheckBondResult("0xjobabc", bad);
    assert.strictEqual(outcome.status, 503, `Expected 503 for variant: ${JSON.stringify(bad)}`);
    assert.strictEqual(outcome.body.error, "INVALID_CONTRACT_RESPONSE");
  }
});

test("parseRepAmount: strictly validates non-negative safe integers and rejects invalid formats", () => {
  // Valid safe integers
  assert.strictEqual(parseRepAmount(0), 0);
  assert.strictEqual(parseRepAmount(42), 42);
  assert.strictEqual(parseRepAmount(42n), 42);
  assert.strictEqual(parseRepAmount("42"), 42);
  assert.strictEqual(parseRepAmount("0"), 0);
  assert.strictEqual(parseRepAmount(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.strictEqual(parseRepAmount(BigInt(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
  assert.strictEqual(parseRepAmount(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);

  // Missing / null / undefined / boolean
  assert.strictEqual(parseRepAmount(undefined), null);
  assert.strictEqual(parseRepAmount(null), null);
  assert.strictEqual(parseRepAmount(true), null);
  assert.strictEqual(parseRepAmount(false), null);

  // Negative
  assert.strictEqual(parseRepAmount(-1), null);
  assert.strictEqual(parseRepAmount("-1"), null);
  assert.strictEqual(parseRepAmount(-1n), null);
  assert.strictEqual(parseRepAmount("-500"), null);

  // Fractional
  assert.strictEqual(parseRepAmount(1.5), null);
  assert.strictEqual(parseRepAmount("1.5"), null);
  assert.strictEqual(parseRepAmount(0.1), null);
  assert.strictEqual(parseRepAmount("0.1"), null);

  // Unsafe integers (> Number.MAX_SAFE_INTEGER)
  assert.strictEqual(parseRepAmount(Number.MAX_SAFE_INTEGER + 1), null);
  assert.strictEqual(parseRepAmount(BigInt(Number.MAX_SAFE_INTEGER) + 1n), null);
  assert.strictEqual(parseRepAmount(String(BigInt(Number.MAX_SAFE_INTEGER) + 1n)), null);
  assert.strictEqual(parseRepAmount("9007199254740992"), null);

  // Non-numeric strings
  assert.strictEqual(parseRepAmount("abc"), null);
  assert.strictEqual(parseRepAmount(""), null);
  assert.strictEqual(parseRepAmount("   "), null);
  assert.strictEqual(parseRepAmount("0x10"), null);
  assert.strictEqual(parseRepAmount(NaN), null);
  assert.strictEqual(parseRepAmount(Infinity), null);
});

test("mapContractCheckBondResult: missing, null, negative, fractional, and unsafe rep fail closed with 503", () => {
  const baseValid = {
    bonded: true,
    bond: "1000",
    total_bond: "1000",
    reserved_bond: "300",
    available_bond: "700",
    job_reserved_bond: "300",
    pay_c: "300",
    state: "BONDED",
    writer: VALID_WRITER,
  };

  const badRepCases = [
    { ...baseValid }, // missing rep entirely
    { ...baseValid, rep: undefined }, // undefined rep
    { ...baseValid, rep: null }, // null rep
    { ...baseValid, rep: -1 }, // negative number
    { ...baseValid, rep: "-1" }, // negative string
    { ...baseValid, rep: -5n }, // negative bigint
    { ...baseValid, rep: 1.5 }, // fractional number
    { ...baseValid, rep: "2.75" }, // fractional string
    { ...baseValid, rep: Number.MAX_SAFE_INTEGER + 1 }, // unsafe number
    { ...baseValid, rep: BigInt(Number.MAX_SAFE_INTEGER) + 1n }, // unsafe bigint
    { ...baseValid, rep: String(BigInt(Number.MAX_SAFE_INTEGER) + 1n) }, // unsafe string
    { ...baseValid, rep: "not-a-number" }, // invalid string
    { ...baseValid, rep: true }, // boolean
  ];

  for (const badCase of badRepCases) {
    const outcome = mapContractCheckBondResult("0xjobabc", badCase);
    assert.strictEqual(
      outcome.status,
      503,
      `Expected 503 for bad rep: ${String(badCase.rep)}`
    );
    assert.strictEqual(outcome.body.error, "INVALID_CONTRACT_RESPONSE");
  }
});

test("mapContractCheckBondResult: valid rep parses into non-negative safe integer", () => {
  const baseValid = {
    bonded: true,
    bond: "1000",
    total_bond: "1000",
    reserved_bond: "300",
    available_bond: "700",
    job_reserved_bond: "300",
    pay_c: "300",
    state: "BONDED",
    writer: VALID_WRITER,
  };

  // rep = 0
  const r0 = mapContractCheckBondResult("0xjobabc", { ...baseValid, rep: 0 });
  assert.strictEqual(r0.status, 200);
  assert.strictEqual(r0.body.rep, 0);

  // rep = string "15"
  const r15 = mapContractCheckBondResult("0xjobabc", { ...baseValid, rep: "15" });
  assert.strictEqual(r15.status, 200);
  assert.strictEqual(r15.body.rep, 15);

  // rep = bigint 100n
  const r100 = mapContractCheckBondResult("0xjobabc", { ...baseValid, rep: 100n });
  assert.strictEqual(r100.status, 200);
  assert.strictEqual(r100.body.rep, 100);

  // rep = Number.MAX_SAFE_INTEGER
  const rMax = mapContractCheckBondResult("0xjobabc", { ...baseValid, rep: Number.MAX_SAFE_INTEGER });
  assert.strictEqual(rMax.status, 200);
  assert.strictEqual(rMax.body.rep, Number.MAX_SAFE_INTEGER);
});
