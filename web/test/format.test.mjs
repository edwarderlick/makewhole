import test from "node:test";
import assert from "node:assert/strict";

import { tryParseGen, parseGen, formatGen, ATTO, MAX_U256 } from "../src/lib/format.ts";

test("tryParseGen: accepts valid ordinary non-negative decimal strings", () => {
  assert.strictEqual(tryParseGen("0"), 0n);
  assert.strictEqual(tryParseGen("1"), 1n * ATTO);
  assert.strictEqual(tryParseGen("0.5"), 5n * (10n ** 17n));
  assert.strictEqual(tryParseGen("12.0001"), 12n * ATTO + 100000000000000n);
  assert.strictEqual(tryParseGen("100"), 100n * ATTO);
  assert.strictEqual(tryParseGen("0.000000000000000001"), 1n);
});

test("tryParseGen: accepts exact 18 fractional decimals", () => {
  const input18 = "0.123456789012345678";
  const expected18 = 123456789012345678n;
  assert.strictEqual(tryParseGen(input18), expected18);

  const input18WithWhole = "42.987654321098765432";
  const expectedWithWhole = 42n * ATTO + 987654321098765432n;
  assert.strictEqual(tryParseGen(input18WithWhole), expectedWithWhole);
});

test("tryParseGen: rejects 19 fractional decimals without silent truncation", () => {
  assert.strictEqual(tryParseGen("0.1234567890123456789"), null);
  assert.strictEqual(tryParseGen("1.0000000000000000001"), null);
  assert.strictEqual(tryParseGen("0.0000000000000000000"), null); // 19 zeros
});

test("tryParseGen: accepts surrounding whitespace", () => {
  assert.strictEqual(tryParseGen("  1.5  "), 15n * (10n ** 17n));
  assert.strictEqual(tryParseGen("\t0.25\n"), 25n * (10n ** 16n));
  assert.strictEqual(tryParseGen("  0  "), 0n);
});

test("tryParseGen: handles zero in various valid forms", () => {
  assert.strictEqual(tryParseGen("0"), 0n);
  assert.strictEqual(tryParseGen("0.0"), 0n);
  assert.strictEqual(tryParseGen("0.000000"), 0n);
  assert.strictEqual(tryParseGen("00"), 0n);
});

test("tryParseGen: rejects empty or whitespace-only inputs", () => {
  assert.strictEqual(tryParseGen(""), null);
  assert.strictEqual(tryParseGen("   "), null);
  assert.strictEqual(tryParseGen("\t\n"), null);
  assert.strictEqual(tryParseGen(null), null);
  assert.strictEqual(tryParseGen(undefined), null);
});

test("tryParseGen: rejects negative values and plus signs", () => {
  assert.strictEqual(tryParseGen("-1"), null);
  assert.strictEqual(tryParseGen("-0.5"), null);
  assert.strictEqual(tryParseGen("-0"), null);
  assert.strictEqual(tryParseGen("+1"), null);
  assert.strictEqual(tryParseGen("+0.5"), null);
});

test("tryParseGen: rejects scientific notation", () => {
  assert.strictEqual(tryParseGen("1e18"), null);
  assert.strictEqual(tryParseGen("1E18"), null);
  assert.strictEqual(tryParseGen("2.5e-4"), null);
  assert.strictEqual(tryParseGen("1e0"), null);
});

test("tryParseGen: rejects malformed multi-dot strings", () => {
  assert.strictEqual(tryParseGen("1.2.3"), null);
  assert.strictEqual(tryParseGen("1..5"), null);
  assert.strictEqual(tryParseGen(".."), null);
  assert.strictEqual(tryParseGen("."), null);
  assert.strictEqual(tryParseGen(".5"), null);
  assert.strictEqual(tryParseGen("5."), null);
});

test("tryParseGen: rejects non-numeric and special text", () => {
  assert.strictEqual(tryParseGen("NaN"), null);
  assert.strictEqual(tryParseGen("Infinity"), null);
  assert.strictEqual(tryParseGen("-Infinity"), null);
  assert.strictEqual(tryParseGen("0x10"), null);
  assert.strictEqual(tryParseGen("1,000"), null);
  assert.strictEqual(tryParseGen("1 000"), null);
  assert.strictEqual(tryParseGen("abc"), null);
  assert.strictEqual(tryParseGen("12a"), null);
});

test("tryParseGen: handles u256 bounds and rejects overflow", () => {
  // Max whole GEN that fits in u256
  const maxWhole = MAX_U256 / ATTO;
  const maxRem = MAX_U256 % ATTO;
  const maxGenStr = `${maxWhole.toString()}.${maxRem.toString().padStart(18, "0")}`;
  assert.strictEqual(tryParseGen(maxGenStr), MAX_U256);

  // Overflow by adding 1 wei to whole part
  const overflowWholeStr = (maxWhole + 1n).toString();
  assert.strictEqual(tryParseGen(overflowWholeStr), null);

  // Far beyond u256
  assert.strictEqual(tryParseGen("100000000000000000000000000000000000000000000000000000000000000000000"), null);
});

test("parseGen: returns parsed bigint on valid input and throws on invalid input", () => {
  assert.strictEqual(parseGen("1.25"), 125n * (10n ** 16n));
  assert.strictEqual(parseGen("0"), 0n);

  assert.throws(() => parseGen(""), /Invalid GEN amount/);
  assert.throws(() => parseGen("-1"), /Invalid GEN amount/);
  assert.throws(() => parseGen("1.2.3"), /Invalid GEN amount/);
  assert.throws(() => parseGen("1e18"), /Invalid GEN amount/);
  assert.throws(() => parseGen("0.1234567890123456789"), /Invalid GEN amount/);
});
