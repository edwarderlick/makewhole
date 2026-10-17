import test from "node:test";
import assert from "node:assert/strict";

import {
  computeDeadline,
  validateJobRoles,
  validatePublicBriefUrl,
  isExactAddress,
  ZERO_ADDRESS,
  MIN_UI_DEADLINE_OFFSET_SECONDS,
  DEADLINE_PRESETS,
} from "../src/lib/create-preflight.ts";

const VALID_CLIENT = "0x1111111111111111111111111111111111111111";
const VALID_WRITER = "0x81b637d8fcd2c6dac659e6963113a1170de795e4";
const VALID_PUBLISHER = "0x3333333333333333333333333333333333333333";

// ============================================================================
// 1. Safe Deadline Calculation Tests
// ============================================================================

test("create-preflight: computeDeadline default produces now + 7200", () => {
  assert.strictEqual(MIN_UI_DEADLINE_OFFSET_SECONDS, 7200, "Minimum UI offset must be 7200s (2 hours)");

  const now = 1700000000;
  const deadline = computeDeadline(now, 7200);
  assert.strictEqual(deadline, 1700007200n);

  // Verify presets
  assert.ok(DEADLINE_PRESETS.length >= 2);
  assert.strictEqual(DEADLINE_PRESETS[0].offsetSeconds, 7200);
  assert.strictEqual(DEADLINE_PRESETS[0].label, "2 Hours (Minimum)");

  for (const preset of DEADLINE_PRESETS) {
    assert.ok(
      preset.offsetSeconds >= 7200,
      `Preset ${preset.label} offset ${preset.offsetSeconds}s must be >= 7200`
    );
    const dl = computeDeadline(now, preset.offsetSeconds);
    assert.strictEqual(dl, BigInt(now + preset.offsetSeconds));
  }
});

test("create-preflight: values below UI minimum are rejected", () => {
  const now = 1700000000;

  // 3600 (the old unsafe 1-hour preset) must be rejected
  assert.throws(
    () => computeDeadline(now, 3600),
    /Selected deadline offset \(3600s\) is below the minimum required UI safety margin of 7200s/
  );

  // 7199 (1 second below 2 hours) must be rejected
  assert.throws(
    () => computeDeadline(now, 7199),
    /below the minimum required UI safety margin of 7200s/
  );

  // 0 and negative values must be rejected
  assert.throws(() => computeDeadline(now, 0), /below the minimum required UI safety margin/);
  assert.throws(() => computeDeadline(now, -100), /below the minimum required UI safety margin/);
  assert.throws(() => computeDeadline(now, -7200), /below the minimum required UI safety margin/);
});

test("create-preflight: deadline calculation is integer-safe", () => {
  const now = 1700000000;

  // Non-integer offsets must be rejected
  assert.throws(() => computeDeadline(now, 7200.5), /selectedOffsetSeconds must be a safe integer/);
  assert.throws(() => computeDeadline(now, 86400.1), /selectedOffsetSeconds must be a safe integer/);

  // Non-integer now timestamps must be rejected
  assert.throws(() => computeDeadline(1700000000.5, 7200), /nowSeconds must be a positive safe integer/);
  assert.throws(() => computeDeadline(-1, 7200), /nowSeconds must be a positive safe integer/);
  assert.throws(() => computeDeadline(0, 7200), /nowSeconds must be a positive safe integer/);

  // Non-number values must be rejected
  assert.throws(() => computeDeadline(NaN, 7200), /nowSeconds must be a positive safe integer/);
  assert.throws(() => computeDeadline(Infinity, 7200), /nowSeconds must be a positive safe integer/);
  assert.throws(() => computeDeadline("1700000000", 7200), /nowSeconds must be a positive safe integer/);
  assert.throws(() => computeDeadline(now, NaN), /selectedOffsetSeconds must be a safe integer/);
  assert.throws(() => computeDeadline(now, Infinity), /selectedOffsetSeconds must be a safe integer/);

  // Safe large integer boundaries
  const maxSafe = Number.MAX_SAFE_INTEGER;
  const safeBase = maxSafe - 7200;
  const dl = computeDeadline(safeBase, 7200);
  assert.strictEqual(dl, BigInt(maxSafe));

  // Beyond safe integer rejected
  assert.throws(() => computeDeadline(maxSafe + 1, 7200), /nowSeconds must be a positive safe integer/);
});

test("create-preflight: stale render time is not reused—click-time value is used", () => {
  const renderTime = 1700000000;
  const clickTime = 1700000045; // User takes 45 seconds to fill out form and click create

  const staleDeadline = computeDeadline(renderTime, 7200);
  const clickDeadline = computeDeadline(clickTime, 7200);

  assert.notStrictEqual(clickDeadline, staleDeadline);
  assert.strictEqual(clickDeadline - staleDeadline, 45n);
  assert.strictEqual(clickDeadline, BigInt(clickTime + 7200));
});

// ============================================================================
// 2. Address Validation Tests
// ============================================================================

test("create-preflight: address validation with isExactAddress", () => {
  // Valid addresses
  assert.strictEqual(isExactAddress(VALID_CLIENT), true);
  assert.strictEqual(isExactAddress(VALID_WRITER), true);
  assert.strictEqual(isExactAddress(VALID_PUBLISHER), true);
  assert.strictEqual(isExactAddress("0x" + "a".repeat(40)), true);
  assert.strictEqual(isExactAddress("0x" + "F".repeat(40)), true);

  // Zero address must be rejected
  assert.strictEqual(isExactAddress(ZERO_ADDRESS), false);
  assert.strictEqual(isExactAddress("0x0000000000000000000000000000000000000000"), false);

  // Malformed addresses
  assert.strictEqual(isExactAddress(""), false);
  assert.strictEqual(isExactAddress("0x123"), false);
  assert.strictEqual(isExactAddress("0x" + "1".repeat(39)), false);
  assert.strictEqual(isExactAddress("0x" + "1".repeat(41)), false);
  assert.strictEqual(isExactAddress("0x" + "g".repeat(40)), false);
  assert.strictEqual(isExactAddress("1".repeat(40)), false); // Missing 0x
  assert.strictEqual(isExactAddress(null), false);
  assert.strictEqual(isExactAddress(undefined), false);
  assert.strictEqual(isExactAddress(12345), false);
  assert.strictEqual(isExactAddress({}), false);
});

// ============================================================================
// 3. Pairwise Role Uniqueness Tests
// ============================================================================

test("create-preflight: pairwise role uniqueness and field-specific errors", () => {
  // 1. All valid and distinct
  const validCheck = validateJobRoles(VALID_CLIENT, VALID_WRITER, VALID_PUBLISHER);
  assert.strictEqual(validCheck.valid, true);
  assert.deepStrictEqual(validCheck.errors, {});

  // 2. Malformed writer
  const malformedWriter = validateJobRoles(VALID_CLIENT, "0x1234", VALID_PUBLISHER);
  assert.strictEqual(malformedWriter.valid, false);
  assert.match(malformedWriter.errors.writer || "", /Writer must be a valid 20-byte hex address/);

  // 3. Malformed publisher
  const malformedPublisher = validateJobRoles(VALID_CLIENT, VALID_WRITER, "0xnothex");
  assert.strictEqual(malformedPublisher.valid, false);
  assert.match(malformedPublisher.errors.publisher || "", /Publisher must be a valid 20-byte hex address/);

  // 4. Zero address writer
  const zeroWriter = validateJobRoles(VALID_CLIENT, ZERO_ADDRESS, VALID_PUBLISHER);
  assert.strictEqual(zeroWriter.valid, false);
  assert.strictEqual(zeroWriter.errors.writer, "Writer cannot be the zero address");

  // 5. Zero address publisher
  const zeroPublisher = validateJobRoles(VALID_CLIENT, VALID_WRITER, ZERO_ADDRESS);
  assert.strictEqual(zeroPublisher.valid, false);
  assert.strictEqual(zeroPublisher.errors.publisher, "Publisher cannot be the zero address");

  // 6. Zero address client
  const zeroClient = validateJobRoles(ZERO_ADDRESS, VALID_WRITER, VALID_PUBLISHER);
  assert.strictEqual(zeroClient.valid, false);
  assert.strictEqual(zeroClient.errors.client, "Client cannot be the zero address");

  // 7. Missing client
  const missingClient = validateJobRoles(null, VALID_WRITER, VALID_PUBLISHER);
  assert.strictEqual(missingClient.valid, false);
  assert.strictEqual(missingClient.errors.client, "Client wallet not connected");

  // 8. Writer == Publisher (B == C)
  const writerEqualsPublisher = validateJobRoles(VALID_CLIENT, VALID_WRITER, VALID_WRITER);
  assert.strictEqual(writerEqualsPublisher.valid, false);
  assert.strictEqual(writerEqualsPublisher.errors.writer, "Writer and Publisher cannot be the same address");
  assert.strictEqual(writerEqualsPublisher.errors.publisher, "Writer and Publisher cannot be the same address");

  // 9. Client == Writer (A == B)
  const clientEqualsWriter = validateJobRoles(VALID_CLIENT, VALID_CLIENT, VALID_PUBLISHER);
  assert.strictEqual(clientEqualsWriter.valid, false);
  assert.strictEqual(clientEqualsWriter.errors.writer, "Connected Client and Writer cannot be the same address");

  // 10. Client == Publisher (A == C)
  const clientEqualsPublisher = validateJobRoles(VALID_CLIENT, VALID_WRITER, VALID_CLIENT);
  assert.strictEqual(clientEqualsPublisher.valid, false);
  assert.strictEqual(clientEqualsPublisher.errors.publisher, "Connected Client and Publisher cannot be the same address");

  // 11. Case-insensitivity check (e.g. UPPERCASE client == lowercase writer)
  const uppercaseClient = VALID_CLIENT.toUpperCase();
  const lowercaseWriter = VALID_CLIENT.toLowerCase();
  const caseCheck = validateJobRoles(uppercaseClient, lowercaseWriter, VALID_PUBLISHER);
  assert.strictEqual(caseCheck.valid, false);
  assert.strictEqual(caseCheck.errors.writer, "Connected Client and Writer cannot be the same address");

  // Case-insensitivity check between writer and publisher
  const caseCheckBC = validateJobRoles(VALID_CLIENT, VALID_WRITER.toUpperCase(), VALID_WRITER.toLowerCase());
  assert.strictEqual(caseCheckBC.valid, false);
  assert.strictEqual(caseCheckBC.errors.writer, "Writer and Publisher cannot be the same address");
  assert.strictEqual(caseCheckBC.errors.publisher, "Writer and Publisher cannot be the same address");
});

// ============================================================================
// 4. Public Brief URL Validation Tests
// ============================================================================

test("create-preflight: public HTTPS brief validation", () => {
  // Valid URLs
  const validGist = "https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/brief.md";
  const r1 = validatePublicBriefUrl(validGist);
  assert.strictEqual(r1.ok, true);
  if (r1.ok) assert.strictEqual(r1.url, validGist);

  const validPublic = "https://example.com/spec/job-123.md?v=2#details";
  const r2 = validatePublicBriefUrl(validPublic);
  assert.strictEqual(r2.ok, true);

  // Reject non-HTTPS protocols
  const httpUrl = validatePublicBriefUrl("http://example.com/brief.md");
  assert.strictEqual(httpUrl.ok, false);
  assert.match(httpUrl.error, /Brief URL must use HTTPS/);

  const ftpUrl = validatePublicBriefUrl("ftp://example.com/brief.md");
  assert.strictEqual(ftpUrl.ok, false);
  assert.match(ftpUrl.error, /Brief URL must use HTTPS/);

  const ipfsUrl = validatePublicBriefUrl("ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
  assert.strictEqual(ipfsUrl.ok, false);

  // Reject malformed URLs
  assert.strictEqual(validatePublicBriefUrl("").ok, false);
  assert.strictEqual(validatePublicBriefUrl("not-a-url").ok, false);
  assert.strictEqual(validatePublicBriefUrl("https://").ok, false);

  // Reject embedded credentials
  const credsUrl = validatePublicBriefUrl("https://alice:secret123@example.com/brief.md");
  assert.strictEqual(credsUrl.ok, false);
  assert.match(credsUrl.error, /must not contain username or password credentials/);

  const credsOnlyUser = validatePublicBriefUrl("https://alice@example.com/brief.md");
  assert.strictEqual(credsOnlyUser.ok, false);
  assert.match(credsOnlyUser.error, /must not contain username or password credentials/);

  // Reject banned test fixture path
  const bannedFixture1 = validatePublicBriefUrl("https://gist.githubusercontent.com/makewhole/fixtures/brief.md");
  assert.strictEqual(bannedFixture1.ok, false);
  assert.match(bannedFixture1.error, /The makewhole\/fixtures test fixture path is banned/);

  const bannedFixture2 = validatePublicBriefUrl("https://raw.githubusercontent.com/repo/branch/makewhole/fixtures/doc.md");
  assert.strictEqual(bannedFixture2.ok, false);
  assert.match(bannedFixture2.error, /The makewhole\/fixtures test fixture path is banned/);
});

// ============================================================================
// 5. Private / Local URL Rejection Tests
// ============================================================================

test("create-preflight: private and local URL rejection", () => {
  // Reject localhost
  const localhost1 = validatePublicBriefUrl("https://localhost/brief.md");
  assert.strictEqual(localhost1.ok, false);
  assert.match(localhost1.error, /cannot point to localhost/);

  const localhost2 = validatePublicBriefUrl("https://sub.localhost:8443/brief.md");
  assert.strictEqual(localhost2.ok, false);
  assert.match(localhost2.error, /cannot point to localhost/);

  // Reject IPv4 loopback (127.0.0.0/8)
  const loopback1 = validatePublicBriefUrl("https://127.0.0.1/brief.md");
  assert.strictEqual(loopback1.ok, false);
  assert.match(loopback1.error, /loopback address/);

  const loopback2 = validatePublicBriefUrl("https://127.0.1.20:8080/brief.md");
  assert.strictEqual(loopback2.ok, false);
  assert.match(loopback2.error, /loopback address/);

  // Reject IPv6 loopback
  const ipv6Loopback = validatePublicBriefUrl("https://[::1]/brief.md");
  assert.strictEqual(ipv6Loopback.ok, false);
  assert.match(ipv6Loopback.error, /loopback address/);

  // Reject 10.0.0.0/8 private network
  const priv10 = validatePublicBriefUrl("https://10.0.1.5/brief.md");
  assert.strictEqual(priv10.ok, false);
  assert.match(priv10.error, /private network/);

  // Reject 172.16.0.0/12 private network
  const priv172_1 = validatePublicBriefUrl("https://172.16.0.1/brief.md");
  assert.strictEqual(priv172_1.ok, false);
  assert.match(priv172_1.error, /private network/);

  const priv172_2 = validatePublicBriefUrl("https://172.31.255.255/brief.md");
  assert.strictEqual(priv172_2.ok, false);
  assert.match(priv172_2.error, /private network/);

  // Reject 192.168.0.0/16 private network
  const priv192 = validatePublicBriefUrl("https://192.168.1.1/brief.md");
  assert.strictEqual(priv192.ok, false);
  assert.match(priv192.error, /private network/);

  // Reject 169.254.0.0/16 link-local network
  const linkLocal = validatePublicBriefUrl("https://169.254.1.1/brief.md");
  assert.strictEqual(linkLocal.ok, false);
  assert.match(linkLocal.error, /link-local network/);

  // Reject 0.0.0.0/8
  const zeroNet = validatePublicBriefUrl("https://0.0.0.0/brief.md");
  assert.strictEqual(zeroNet.ok, false);
  assert.match(zeroNet.error, /0\.0\.0\.0\/8 network/);

  // Reject unqualified single-label hosts
  const singleLabel = validatePublicBriefUrl("https://internal-server/brief.md");
  assert.strictEqual(singleLabel.ok, false);
  assert.match(singleLabel.error, /Public domain required/);
});
