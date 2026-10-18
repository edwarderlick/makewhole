import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_CONTRACT_ADDRESS = "0x9999999999999999999999999999999999999999";

import {
  resolveFinalizedRecipients,
  discoverFinalizedRecipients,
  buildFinalizedAllocations,
  optionsFromProfile,
  getQuote,
  isExactAddress,
  resolveJobLookup,
  ZERO_ADDRESS,
} from "../src/lib/contract.ts";
import { CALL_KEY_WILDCARD } from "genlayer-js";

const VALID_CLIENT = "0x1111111111111111111111111111111111111111";
const VALID_WRITER = "0x81b637d8fcd2c6dac659e6963113a1170de795e4";
const VALID_PUBLISHER = "0x3333333333333333333333333333333333333333";
const DEFAULT_MESSAGE_BUDGET = 30000000000000000n; // 0.03 GEN

const baseJob = {
  id: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  client: VALID_CLIENT,
  writer: VALID_WRITER,
  publisher: VALID_PUBLISHER,
  pay_b: 200000000000000000n,
  pay_c: 200000000000000000n,
  premium: 50000000000000000n,
  deadline: 1800000000n,
  state: "OPEN",
};

function createMockClient(jobFixture, options = {}) {
  let estimatedOptions = null;
  return {
    account: { address: options.account || VALID_WRITER },
    readContract: async ({ functionName, args }) => {
      if (options.readThrows) {
        throw new Error("RPC read error");
      }
      if (functionName === "get_job") {
        if (options.returnNullJob) return null;
        return typeof jobFixture === "function" ? jobFixture(args[0]) : jobFixture;
      }
      return null;
    },
    estimateTransactionFees: async (distOpts) => {
      estimatedOptions = distOpts;
      return {
        fees: {
          feeValue: 5000000000000000n,
          distribution: {
            totalMessageFees: 30000000000000000n,
            leaderTimeunitsAllocation: 100,
            validatorTimeunitsAllocation: 200,
          },
          messageAllocations: distOpts.messageAllocations,
        },
      };
    },
    getEstimatedOptions: () => estimatedOptions,
  };
}

test("contract-fees: unbond recipient and finalized flag", () => {
  const recs = resolveFinalizedRecipients("unbond", { account: VALID_WRITER });
  assert.deepStrictEqual(recs, [VALID_WRITER.toLowerCase()]);

  const allocs = buildFinalizedAllocations(recs, DEFAULT_MESSAGE_BUDGET);
  assert.strictEqual(allocs.length, 1);
  assert.strictEqual(allocs[0].recipient, VALID_WRITER.toLowerCase());
  assert.strictEqual(allocs[0].onAcceptance, false, "Internal transfer node must have onAcceptance=false");
  assert.strictEqual(allocs[0].messageType, 1, "Must be MessageType.Internal");
  assert.strictEqual(allocs[0].callKey, CALL_KEY_WILDCARD);
  assert.strictEqual(allocs[0].budget, DEFAULT_MESSAGE_BUDGET);
});

test("contract-fees: withdraw recipient and finalized flag", () => {
  const recs = resolveFinalizedRecipients("withdraw", { account: VALID_WRITER });
  assert.deepStrictEqual(recs, [VALID_WRITER.toLowerCase()]);

  const allocs = buildFinalizedAllocations(recs, DEFAULT_MESSAGE_BUDGET);
  assert.strictEqual(allocs.length, 1);
  assert.strictEqual(allocs[0].recipient, VALID_WRITER.toLowerCase());
  assert.strictEqual(allocs[0].onAcceptance, false, "Internal transfer node must have onAcceptance=false");
  assert.strictEqual(allocs[0].messageType, 1, "Must be MessageType.Internal");
  assert.strictEqual(allocs[0].callKey, CALL_KEY_WILDCARD);
  assert.strictEqual(allocs[0].budget, DEFAULT_MESSAGE_BUDGET);
});

test("contract-fees: cancel client recipient", () => {
  const recs = resolveFinalizedRecipients("cancel", { job: baseJob });
  assert.deepStrictEqual(recs, [VALID_CLIENT.toLowerCase()]);

  const allocs = buildFinalizedAllocations(recs, DEFAULT_MESSAGE_BUDGET);
  assert.strictEqual(allocs.length, 1);
  assert.strictEqual(allocs[0].recipient, VALID_CLIENT.toLowerCase());
  assert.strictEqual(allocs[0].onAcceptance, false);
  assert.strictEqual(allocs[0].budget, DEFAULT_MESSAGE_BUDGET);
});

test("contract-fees: adjudicate three possible recipients", () => {
  const recs = resolveFinalizedRecipients("adjudicate", { job: baseJob });
  assert.deepStrictEqual(recs, [
    VALID_CLIENT.toLowerCase(),
    VALID_WRITER.toLowerCase(),
    VALID_PUBLISHER.toLowerCase(),
  ]);

  const allocs = buildFinalizedAllocations(recs, DEFAULT_MESSAGE_BUDGET);
  assert.strictEqual(allocs.length, 3);
  for (const node of allocs) {
    assert.strictEqual(node.onAcceptance, false, "Every adjudicate node must have onAcceptance=false");
    assert.strictEqual(node.messageType, 1);
    assert.strictEqual(node.callKey, CALL_KEY_WILDCARD);
    assert.ok(node.budget > 0n);
  }

  const sum = allocs.reduce((acc, n) => acc + n.budget, 0n);
  assert.strictEqual(sum, DEFAULT_MESSAGE_BUDGET);
});

test("contract-fees: each expire state's exact recipient set", () => {
  // 1. OPEN -> client
  const openRecs = resolveFinalizedRecipients("expire", { job: { ...baseJob, state: "OPEN" } });
  assert.deepStrictEqual(openRecs, [VALID_CLIENT.toLowerCase()]);

  // 2. BONDED -> client
  const bondedRecs = resolveFinalizedRecipients("expire", { job: { ...baseJob, state: "BONDED" } });
  assert.deepStrictEqual(bondedRecs, [VALID_CLIENT.toLowerCase()]);

  // 3. IN_FLIGHT -> writer and client (2 recipients)
  const inFlightRecs = resolveFinalizedRecipients("expire", { job: { ...baseJob, state: "IN_FLIGHT" } });
  assert.deepStrictEqual(inFlightRecs, [VALID_WRITER.toLowerCase(), VALID_CLIENT.toLowerCase()]);

  const inFlightAllocs = buildFinalizedAllocations(inFlightRecs, DEFAULT_MESSAGE_BUDGET);
  assert.strictEqual(inFlightAllocs.length, 2);
  assert.strictEqual(inFlightAllocs[0].recipient, VALID_WRITER.toLowerCase());
  assert.strictEqual(inFlightAllocs[1].recipient, VALID_CLIENT.toLowerCase());
  assert.strictEqual(inFlightAllocs[0].onAcceptance, false);
  assert.strictEqual(inFlightAllocs[1].onAcceptance, false);

  // 4. ACKED -> client
  const ackedRecs = resolveFinalizedRecipients("expire", { job: { ...baseJob, state: "ACKED" } });
  assert.deepStrictEqual(ackedRecs, [VALID_CLIENT.toLowerCase()]);

  // 5. UNDETERMINED -> client
  const undetRecs = resolveFinalizedRecipients("expire", { job: { ...baseJob, state: "UNDETERMINED" } });
  assert.deepStrictEqual(undetRecs, [VALID_CLIENT.toLowerCase()]);
});

test("contract-fees: no zero addresses", () => {
  // Reject zero address in unbond
  assert.throws(
    () => resolveFinalizedRecipients("unbond", { account: ZERO_ADDRESS }),
    /unbond fee allocation requires a valid connected writer address/
  );

  // Reject zero address in withdraw
  assert.throws(
    () => resolveFinalizedRecipients("withdraw", { account: ZERO_ADDRESS }),
    /withdraw fee allocation requires a valid connected payee address/
  );

  // Reject zero address in cancel
  assert.throws(
    () => resolveFinalizedRecipients("cancel", { job: { ...baseJob, client: ZERO_ADDRESS } }),
    /cancel fee allocation requires a valid job.client address/
  );

  // Reject zero address in adjudicate
  assert.throws(
    () => resolveFinalizedRecipients("adjudicate", { job: { ...baseJob, publisher: ZERO_ADDRESS } }),
    /adjudicate fee allocation requires a valid job.publisher address/
  );

  // Reject zero address in expire
  assert.throws(
    () => resolveFinalizedRecipients("expire", { job: { ...baseJob, state: "BONDED", client: ZERO_ADDRESS } }),
    /expire \(BONDED\) fee allocation requires a valid job.client address/
  );

  assert.throws(
    () => resolveFinalizedRecipients("expire", { job: { ...baseJob, state: "IN_FLIGHT", writer: ZERO_ADDRESS } }),
    /expire \(IN_FLIGHT\) fee allocation requires a valid job.writer address/
  );

  // buildFinalizedAllocations rejects zero address directly
  assert.throws(
    () => buildFinalizedAllocations([ZERO_ADDRESS], DEFAULT_MESSAGE_BUDGET),
    /Invalid recipient address.*Must be a valid nonzero 20-byte address/
  );

  assert.throws(
    () => buildFinalizedAllocations([VALID_CLIENT, ZERO_ADDRESS], DEFAULT_MESSAGE_BUDGET),
    /Invalid recipient address.*Must be a valid nonzero 20-byte address/
  );
});

test("contract-fees: exact budget-sum conservation across arbitrary allocations", () => {
  const budgets = [
    DEFAULT_MESSAGE_BUDGET, // 30000000000000000n
    100n,
    101n,
    1n,
    7n,
    1234567890123456789n,
  ];

  const recipientGroups = [
    [VALID_CLIENT],
    [VALID_WRITER, VALID_CLIENT],
    [VALID_CLIENT, VALID_WRITER, VALID_PUBLISHER],
    [VALID_CLIENT, VALID_WRITER, VALID_PUBLISHER, "0x4444444444444444444444444444444444444444"],
    [
      VALID_CLIENT,
      VALID_WRITER,
      VALID_PUBLISHER,
      "0x4444444444444444444444444444444444444444",
      "0x5555555555555555555555555555555555555555",
      "0x6666666666666666666666666666666666666666",
      "0x7777777777777777777777777777777777777777",
    ],
  ];

  for (const b of budgets) {
    for (const recs of recipientGroups) {
      const allocs = buildFinalizedAllocations(recs, b);
      const sum = allocs.reduce((acc, node) => acc + node.budget, 0n);
      assert.strictEqual(
        sum,
        b,
        `Conservation failure: sum ${sum} !== expected budget ${b} for ${recs.length} recipients`
      );
    }
  }
});

test("contract-fees: unknown or malformed job state fails closed", () => {
  const invalidStates = [
    "SETTLED_OK",
    "SETTLED_RUG",
    "CANCELED",
    "UNKNOWN_STATE",
    "FOOBAR",
    "",
    null,
    undefined,
  ];

  for (const st of invalidStates) {
    assert.throws(
      () => resolveFinalizedRecipients("expire", { job: { ...baseJob, state: st } }),
      /Cannot resolve expire fee recipients: unknown or terminal job state/
    );
  }

  // Missing job context
  assert.throws(
    () => resolveFinalizedRecipients("expire", { job: null }),
    /expire fee allocation requires job context/
  );

  assert.throws(
    () => resolveFinalizedRecipients("cancel", { job: null }),
    /cancel fee allocation requires job context/
  );

  assert.throws(
    () => resolveFinalizedRecipients("adjudicate", { job: null }),
    /adjudicate fee allocation requires job context/
  );
});

test("exact-ID: resolveJobLookup loads requested ID only without fallback or mutation", () => {
  const customId = "0x9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef";
  const res = resolveJobLookup(customId);
  assert.strictEqual(res.ok, true);
  if (res.ok) {
    assert.strictEqual(res.id, customId, "Must preserve requested job ID exactly");
  }

  // Never substitutes or normalizes to something else
  assert.strictEqual(resolveJobLookup("  0xabc123  ").ok && resolveJobLookup("  0xabc123  ").id, "0xabc123");

  // Rejects invalid/empty IDs
  assert.strictEqual(resolveJobLookup("").ok, false);
  assert.strictEqual(resolveJobLookup("   ").ok, false);
  assert.strictEqual(resolveJobLookup(null).ok, false);
  assert.strictEqual(resolveJobLookup(undefined).ok, false);
  assert.strictEqual(resolveJobLookup("undefined").ok, false);
});

// ============================================================================
// Parity Tests: Quote and Write recipient trees and finalized allocation flags
// ============================================================================

test("contract-fees: quote/write recipient parity for cancel", async () => {
  const client = createMockClient(baseJob);

  // 1. Write discovery
  const writeRecipients = await discoverFinalizedRecipients(client, "cancel", { jobId: baseJob.id });
  assert.deepStrictEqual(writeRecipients, [VALID_CLIENT.toLowerCase()]);

  // 2. Quote estimation
  const quote = await getQuote(client, "cancel", { jobId: baseJob.id });
  assert.ok(quote, "Quote must succeed for valid cancel job");
  const quoteOpts = client.getEstimatedOptions();
  assert.ok(quoteOpts, "estimateTransactionFees must have been called");
  const quoteRecipients = quoteOpts.messageAllocations.map((m) => m.recipient);

  // Parity
  assert.deepStrictEqual(quoteRecipients, writeRecipients, "Quote and write recipient trees must match exactly for cancel");
  assert.strictEqual(quoteOpts.messageAllocations[0].onAcceptance, false);
  assert.strictEqual(quoteOpts.messageAllocations[0].messageType, 1);
  assert.strictEqual(quoteOpts.messageAllocations[0].callKey, CALL_KEY_WILDCARD);
});

test("contract-fees: quote/write recipient parity for adjudicate", async () => {
  const client = createMockClient(baseJob);

  // 1. Write discovery
  const writeRecipients = await discoverFinalizedRecipients(client, "adjudicate", { jobId: baseJob.id });
  assert.deepStrictEqual(writeRecipients, [
    VALID_CLIENT.toLowerCase(),
    VALID_WRITER.toLowerCase(),
    VALID_PUBLISHER.toLowerCase(),
  ]);

  // 2. Quote estimation
  const quote = await getQuote(client, "adjudicate", { jobId: baseJob.id });
  assert.ok(quote, "Quote must succeed for valid adjudicate job");
  const quoteOpts = client.getEstimatedOptions();
  assert.ok(quoteOpts);
  const quoteRecipients = quoteOpts.messageAllocations.map((m) => m.recipient);

  // Parity: Must NOT be an approximate 1-recipient quote
  assert.deepStrictEqual(
    quoteRecipients,
    writeRecipients,
    "Quote and write recipient trees must match exactly for adjudicate (3 recipients)"
  );
  assert.strictEqual(quoteOpts.messageAllocations.length, 3);
  for (const alloc of quoteOpts.messageAllocations) {
    assert.strictEqual(alloc.onAcceptance, false, "Adjudicate quote allocations must have onAcceptance=false");
    assert.strictEqual(alloc.messageType, 1);
    assert.strictEqual(alloc.callKey, CALL_KEY_WILDCARD);
  }
});

test("contract-fees: quote/write recipient parity for every expire state", async () => {
  const states = [
    { state: "OPEN", expected: [VALID_CLIENT.toLowerCase()] },
    { state: "BONDED", expected: [VALID_CLIENT.toLowerCase()] },
    { state: "IN_FLIGHT", expected: [VALID_WRITER.toLowerCase(), VALID_CLIENT.toLowerCase()] },
    { state: "ACKED", expected: [VALID_CLIENT.toLowerCase()] },
    { state: "UNDETERMINED", expected: [VALID_CLIENT.toLowerCase()] },
  ];

  for (const { state, expected } of states) {
    const job = { ...baseJob, state };
    const client = createMockClient(job);

    const writeRecipients = await discoverFinalizedRecipients(client, "expire", { jobId: job.id });
    assert.deepStrictEqual(
      writeRecipients,
      expected,
      `Write recipient mismatch for expire state ${state}`
    );

    const quote = await getQuote(client, "expire", { jobId: job.id });
    assert.ok(quote, `Quote failed for expire state ${state}`);
    const quoteOpts = client.getEstimatedOptions();
    assert.ok(quoteOpts);
    const quoteRecipients = quoteOpts.messageAllocations.map((m) => m.recipient);

    assert.deepStrictEqual(
      quoteRecipients,
      writeRecipients,
      `Parity failure between quote and write for expire state ${state}`
    );

    for (const alloc of quoteOpts.messageAllocations) {
      assert.strictEqual(alloc.onAcceptance, false, `onAcceptance must be false for ${state}`);
      assert.strictEqual(alloc.messageType, 1);
      assert.strictEqual(alloc.callKey, CALL_KEY_WILDCARD);
    }
  }
});

test("contract-fees: finalized flags remain false in both quote and write paths", async () => {
  const methods = [
    { fn: "cancel", context: { jobId: baseJob.id } },
    { fn: "adjudicate", context: { jobId: baseJob.id } },
    { fn: "expire", context: { jobId: baseJob.id } },
    { fn: "unbond", context: { account: VALID_WRITER } },
    { fn: "withdraw", context: { account: VALID_WRITER } },
  ];

  for (const { fn, context } of methods) {
    const client = createMockClient(baseJob, { account: VALID_WRITER });
    const quote = await getQuote(client, fn, context);
    assert.ok(quote, `getQuote failed for ${fn}`);

    const quoteOpts = client.getEstimatedOptions();
    assert.ok(quoteOpts.messageAllocations.length > 0);
    for (const alloc of quoteOpts.messageAllocations) {
      assert.strictEqual(alloc.onAcceptance, false, `Quote path onAcceptance must be false for ${fn}`);
    }

    const recs = await discoverFinalizedRecipients(client, fn, context);
    const writeAllocs = buildFinalizedAllocations(recs, DEFAULT_MESSAGE_BUDGET);
    for (const alloc of writeAllocs) {
      assert.strictEqual(alloc.onAcceptance, false, `Write path onAcceptance must be false for ${fn}`);
    }
  }
});

test("contract-fees: malformed job lookup fails closed without fallback", async () => {
  // 1. RPC read throws
  const throwingClient = createMockClient(baseJob, { readThrows: true });
  await assert.rejects(
    () => discoverFinalizedRecipients(throwingClient, "adjudicate", { jobId: baseJob.id }),
    /Failed to read job/
  );
  const quoteFromThrow = await getQuote(throwingClient, "adjudicate", { jobId: baseJob.id });
  assert.strictEqual(quoteFromThrow, null, "getQuote must fail closed and return null on RPC error");

  // 2. Job not found (returns null)
  const nullJobClient = createMockClient(baseJob, { returnNullJob: true });
  await assert.rejects(
    () => discoverFinalizedRecipients(nullJobClient, "cancel", { jobId: baseJob.id }),
    /Job .* not found/
  );
  const quoteFromNull = await getQuote(nullJobClient, "cancel", { jobId: baseJob.id });
  assert.strictEqual(quoteFromNull, null, "getQuote must fail closed and return null if job not found");

  // 3. Missing or whitespace jobId
  const client = createMockClient(baseJob);
  await assert.rejects(
    () => discoverFinalizedRecipients(client, "expire", { jobId: "  " }),
    /requires a valid jobId argument or job object/
  );
  const quoteMissingId = await getQuote(client, "expire", { jobId: "  " });
  assert.strictEqual(quoteMissingId, null, "getQuote must return null for missing jobId");
});

test("contract-fees: no zero-address fallback in quote or write discovery", async () => {
  const clientWithZeroJob = (badJob) => createMockClient(badJob);

  // Adjudicate with zero-address writer
  const badJobWriterZero = { ...baseJob, writer: ZERO_ADDRESS };
  const c1 = clientWithZeroJob(badJobWriterZero);
  await assert.rejects(
    () => discoverFinalizedRecipients(c1, "adjudicate", { jobId: baseJob.id }),
    /adjudicate fee allocation requires a valid job\.writer address/
  );
  const q1 = await getQuote(c1, "adjudicate", { jobId: baseJob.id });
  assert.strictEqual(q1, null, "Must not fall back to zero address or approximate quote");

  // Cancel with zero-address client
  const badJobClientZero = { ...baseJob, client: ZERO_ADDRESS };
  const c2 = clientWithZeroJob(badJobClientZero);
  await assert.rejects(
    () => discoverFinalizedRecipients(c2, "cancel", { jobId: baseJob.id }),
    /cancel fee allocation requires a valid job\.client address/
  );
  const q2 = await getQuote(c2, "cancel", { jobId: baseJob.id });
  assert.strictEqual(q2, null);

  // Expire IN_FLIGHT with zero-address writer
  const badJobInFlightZero = { ...baseJob, state: "IN_FLIGHT", writer: ZERO_ADDRESS };
  const c3 = clientWithZeroJob(badJobInFlightZero);
  await assert.rejects(
    () => discoverFinalizedRecipients(c3, "expire", { jobId: baseJob.id }),
    /expire \(IN_FLIGHT\) fee allocation requires a valid job\.writer address/
  );
  const q3 = await getQuote(c3, "expire", { jobId: baseJob.id });
  assert.strictEqual(q3, null);

  // Unbond with zero-address account
  const c4 = createMockClient(baseJob, { account: ZERO_ADDRESS });
  await assert.rejects(
    () => discoverFinalizedRecipients(c4, "unbond", { account: ZERO_ADDRESS }),
    /unbond fee allocation requires a valid connected writer address/
  );
  const q4 = await getQuote(c4, "unbond", { account: ZERO_ADDRESS });
  assert.strictEqual(q4, null);
});
