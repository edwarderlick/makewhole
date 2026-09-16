"use client";

import {
  CALL_KEY_WILDCARD,
  MessageType,
  encodeInternalMessageFeeParams,
  deriveExternalMessageCallKey,
  encodeExternalMessageFeeParams,
} from "genlayer-js";
import { waitSuccessful } from "./genlayer";
import feeProfiles from "./fee-profile.json";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").trim() as `0x${string}`;

export function hasLiveContract(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(CONTRACT_ADDRESS);
}

export const EMPTY_ECONOMICS = {
  pool: 0,
  locked_bonds: 0,
  locked_jobs: 0,
  credits: 0,
  slash_count: 0,
  settled_ok: 0,
  settled_rug: 0,
};

export type JobState =
  | "OPEN"
  | "BONDED"
  | "IN_FLIGHT"
  | "ACKED"
  | "SETTLED_OK"
  | "SETTLED_RUG"
  | "CANCELED"
  | "UNDETERMINED";

export type Job = {
  id: string;
  client: string;
  writer: string;
  publisher: string;
  brief_url: string;
  deliverable_url: string;
  research_url: string;
  publish_url: string;
  pay_b: number | bigint;
  pay_c: number | bigint;
  premium: number | bigint;
  state: JobState;
  fault: string;
  pay_downstream: boolean;
  slash_bps: number;
  reason: string;
  paid_c: number | bigint;
  slashed_b: number | bigint;
  hop_kind: string;
  bonded: boolean;
  writer_rep: number;
};

function jsonish(v: unknown) {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
}

function profileRow(functionName: string) {
  const profiles = feeProfiles as any;
  return profiles?.methods?.[functionName] || profiles?.[functionName];
}

function completeAllocations(raw: any[] | undefined, recipients: string[], dist: Record<string, unknown>) {
  const leader = BigInt(String(dist.leaderTimeunitsAllocation ?? "200"));
  const validator = BigInt(String(dist.validatorTimeunitsAllocation ?? "300"));
  const feeParams = encodeInternalMessageFeeParams({
    leaderTimeunitsAllocation: leader,
    validatorTimeunitsAllocation: validator,
  });
  const stubs = Array.isArray(raw) && raw.length > 0 ? raw : recipients.map(() => ({}));
  const dests = recipients.length > 0 ? recipients : stubs.map(() => CONTRACT_ADDRESS);
  const count = Math.max(stubs.length, dests.length);
  const totalMessageFees = BigInt(String(dist.totalMessageFees ?? "0"));
  const perNodeBudget = count > 0 ? totalMessageFees / BigInt(count) : 0n;
  let remainingBudget = totalMessageFees;

  const nodes = [];
  for (let i = 0; i < count; i++) {
    const stub = stubs[i] || stubs[stubs.length - 1] || {};
    const destAddress = dests[i] || dests[dests.length - 1] || CONTRACT_ADDRESS;
    let nodeBudget = perNodeBudget;
    if (i === count - 1) {
      nodeBudget = remainingBudget;
    }
    remainingBudget -= nodeBudget;

    nodes.push({
      messageType: stub.messageType ?? MessageType.Internal,
      onAcceptance: stub.onAcceptance ?? true,
      recipient: destAddress,
      callKey: stub.callKey || CALL_KEY_WILDCARD,
      budget: nodeBudget,
      feeParams: stub.feeParams || feeParams,
    });
  }
  return nodes;
}

export function optionsFromProfile(functionName: string, recipients: string[] = []) {
  const row = profileRow(functionName);
  const dist = row?.distribution;
  if (!dist || typeof dist !== "object") {
    throw new Error(`Fee profile missing for ${functionName}. No methods.${functionName} / ${functionName}.distribution`);
  }
  const distOptions: Record<string, unknown> = { ...dist };
  if (typeof distOptions.rotations === "string" || typeof distOptions.rotations === "number") {
    distOptions.rotations = [distOptions.rotations];
  } else if (!distOptions.rotations) {
    distOptions.rotations = [0n];
  }
  const leader = Number(distOptions.leaderTimeunitsAllocation);
  const validator = Number(distOptions.validatorTimeunitsAllocation);
  if (leader < 30 || leader > 600) {
    throw new Error(`Fee quote out of bounds (${leader} not in [30,600]) - profile is wrong`);
  }
  if (validator < 30 || validator > 600) {
    throw new Error(`Fee quote out of bounds (${validator} not in [30,600]) - profile is wrong`);
  }
  const totalMessageFees = BigInt(String(distOptions.totalMessageFees ?? "0"));
  if (functionName === "adjudicate" && totalMessageFees <= 0n) {
    throw new Error("adjudicate profile totalMessageFees must be > 0");
  }
  if (recipients.length === 0) {
    if (functionName === "adjudicate") {
      recipients = ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"];
    } else if (functionName === "cancel" || functionName === "withdraw") {
      recipients = ["0x0000000000000000000000000000000000000000"];
    }
  }
  const needsTree = functionName === "adjudicate" || functionName === "cancel" || functionName === "withdraw" || (Array.isArray(distOptions.messageAllocations) && distOptions.messageAllocations.length > 0) || (Array.isArray(dist?.messageAllocations) && dist.messageAllocations.length > 0);
  if (needsTree) {
    let baseAllocations = dist?.messageAllocations;
    if (functionName === "withdraw" && recipients.length > 0) {
      baseAllocations = [{
        messageType: MessageType.Internal,
        onAcceptance: false,
        callKey: CALL_KEY_WILDCARD,
        feeParams: encodeInternalMessageFeeParams({
          leaderTimeunitsAllocation: 100n,
          validatorTimeunitsAllocation: 200n
        }),
      }];
    }
    distOptions.messageAllocations = completeAllocations(baseAllocations, recipients, distOptions);
  }
  return distOptions;
}

function unwrapQuote(raw: any) {
  return raw?.fees ?? raw?.data?.fees ?? raw;
}

async function writeWithFees(client: any, write: Record<string, any>) {
  if (!client) throw new Error("Connect a wallet to send writes");
  if (!hasLiveContract()) {
    throw new Error("NO_CONTRACT");
  }
  const fnName = String(write.functionName || "");
  const recipients: string[] = [];
  if (fnName === "adjudicate" && write.args?.[0] && client.readContract) {
    try {
      const job = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_job",
        args: [write.args[0]],
      });
      for (const addr of [job?.client, job?.publisher, job?.writer]) {
        if (addr && !recipients.includes(String(addr))) recipients.push(String(addr));
      }
    } catch {
      /* profile stubs still cover ≥2 emissions */
    }
  }
  if (fnName === "withdraw") {
    if (client.account?.address) {
      recipients.push(client.account.address);
    }
  }
  const estimateOptions = optionsFromProfile(fnName, recipients);
  if (!client.estimateTransactionFees) {
    throw new Error("Client has no estimateTransactionFees");
  }

  let raw: any;
  try {
    raw = await client.estimateTransactionFees(estimateOptions);
  } catch (e: any) {
    throw new Error(`Fee estimate threw for ${fnName}: ${e?.message || e}`);
  }

  try {
    console.log("[makewhole] RAW estimateTransactionFees", fnName, jsonish({
      typeof: typeof raw,
      keys: raw && typeof raw === "object" ? Object.keys(raw) : [],
      allocLen: raw?.messageAllocations?.length ?? raw?.fees?.messageAllocations?.length ?? 0,
      raw,
    }));
  } catch {
    console.log("[makewhole] RAW estimateTransactionFees (unserializable)", fnName, typeof raw, raw);
  }

  const quote = unwrapQuote(raw);
  const distribution = quote?.distribution;
  const feeValue = quote?.feeValue ?? quote?.fee_value;
  let messageAllocations = quote?.messageAllocations;
  if (!distribution || feeValue == null || feeValue === 0n || feeValue === 0 || feeValue === "0") {
    const keys = raw && typeof raw === "object" ? Object.keys(raw) : [];
    throw new Error(`Fee quote missing for ${fnName}. raw keys: ${keys.join(",") || "(none)"} typeof=${typeof raw}`);
  }
  if ((fnName === "withdraw" || fnName === "adjudicate") && Array.isArray(messageAllocations) && messageAllocations.length > 0) {
    let sum = 0n;
    const budget = BigInt(distribution.totalMessageFees || 0);
    for (const a of messageAllocations) sum += BigInt(a.budget || 0);

    if (sum !== budget) {
      if (budget > 0n) {
        console.warn(`[makewhole] ${fnName} missing or invalid tree (sum ${sum} !== budget ${budget}). Building fallback tree.`);
        messageAllocations = completeAllocations(messageAllocations, recipients, distribution as Record<string, unknown>);
        sum = 0n;
        for (const a of messageAllocations) sum += BigInt(a.budget || 0);
      }
    }

    const minPrimary = BigInt(distribution.executionBudgetPerRound || quote?.policy?.executionBudgetFloor || 0);
    const appealRounds = BigInt(distribution.appealRounds || 0);
    const required = minPrimary * (appealRounds + 1n);

    // Sum is the actual total on-acceptance budget for the tree
    const actual = sum;
    
    console.debug(`[makewhole] guard: minPrimary=${minPrimary}, appealRounds=${appealRounds}, required=${required}, actual=${actual}, sum=${sum}, feeValue=${feeValue}`, messageAllocations);

    if (budget > 0n && sum !== budget) {
      throw new Error(`${fnName} quote tree sum ${sum} !== budget ${budget} even after fallback!`);
    }

    if (actual < required && budget > 0n) {
      throw new Error(`AllocationLifecycleBudgetInsufficient: required ${required}, actual ${actual}. Please retry or raise message budget.`);
    }

    if (fnName === "withdraw") {
      const node = messageAllocations[0];
      console.debug("BEFORE MetaMask:", {
        callKey: node.callKey,
        recipient: node.recipient,
        messageType: node.messageType,
        onAcceptance: node.onAcceptance,
        feeParams: node.feeParams,
        budget: node.budget
      });

      if (node.messageType === 0) {
        throw new Error("withdraw emit is Internal PostMessage");
      }
      if (node.messageType !== MessageType.Internal) {
        throw new Error("Withdraw node must be Internal");
      }
      if (node.onAcceptance !== false) {
        throw new Error("Withdraw node must be finalized (onAcceptance false)");
      }
      if (node.callKey === "0x0000000000000000000000000000000000000000000000000000000000000000" || node.callKey === deriveExternalMessageCallKey("0x")) {
        throw new Error("Withdraw callKey cannot be 0x0... or deriveExternalMessageCallKey(*)");
      }
      if (node.recipient !== recipients[0]) {
        throw new Error("Withdraw node recipient must be the connected account");
      }
      if (budget !== 30000000000000000n) {
        throw new Error("totalMessageFees must be 30000000000000000n");
      }
    }
  }

  const call: Record<string, any> = { address: CONTRACT_ADDRESS, ...write };
  const val = BigInt(call.value || 0n);
  let fee = BigInt(feeValue);
  if (fee > 10000000000000000000n) {
    fee = 100000000000000000n;
  }
  
  const fees: any = { ...quote, feeValue: fee };
  if (messageAllocations !== undefined) {
    fees.messageAllocations = messageAllocations;
  } else {
    delete fees.messageAllocations;
  }

  console.log("[makewhole] writeContract fees keys", Object.keys(fees), "alloc", Array.isArray(fees.messageAllocations) ? (fees.messageAllocations as any[]).length : "undefined");

  const txId = await client.writeContract({
    ...call,
    account: client.account,
    value: val,
    fees,
  });
  if (!txId) {
    throw new Error(`writeContract returned no hash for ${fnName}`);
  }
  


  return { hash: txId as string };
}

export async function readView(client: any, functionName: string, args: unknown[] = []) {
  if (!hasLiveContract()) {
    throw new Error("NO_CONTRACT");
  }
  const c = client;
  if (!c) throw new Error("Client unavailable");
  return c.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  });
}

export const views = {
  getJob: (c: any, id: string) => readView(c, "get_job", [id]) as Promise<Job>,
  listIds: async (c: any) => {
    if (!hasLiveContract()) return [] as string[];
    return (await readView(c, "list_ids", [])) as string[];
  },
  getEconomics: async (c: any) => {
    if (!hasLiveContract()) return EMPTY_ECONOMICS;
    return readView(c, "get_economics", []);
  },
  getBalances: async (c: any) => {
    if (!hasLiveContract()) return { pool: 0, locked_bonds: 0, locked_jobs: 0, credits_total: 0 };
    return readView(c, "get_balances", []);
  },
  getPool: async (c: any) => {
    if (!hasLiveContract()) return 0;
    return readView(c, "get_pool", []);
  },
  getBond: async (c: any, addr: string) => {
    if (!hasLiveContract()) return 0;
    return readView(c, "get_bond", [addr]);
  },
  getRep: async (c: any, addr: string) => {
    if (!hasLiveContract()) return 0;
    return readView(c, "get_rep", [addr]);
  },
  getCredit: async (c: any, addr: string) => {
    if (!hasLiveContract()) return 0;
    return readView(c, "get_credit", [addr]);
  },
  checkBond: async (c: any, id: string) => {
    if (!hasLiveContract()) return { bonded: false, reason: "NO_CONTRACT", pay_c: 0, rep: 0, state: "" };
    return readView(c, "check_bond", [id]);
  },
  getSettlement: async (c: any, id: string) => {
    if (!hasLiveContract()) return { fault: "", pay_downstream: false, slash_bps: 0, paid_c: 0, slashed_b: 0, reason: "NO_CONTRACT" };
    return readView(c, "get_settlement", [id]);
  },
};

export async function getQuote(client: any, fnName: string) {
  if (!client || !hasLiveContract()) return null;
  try {
    const distOptions = optionsFromProfile(fnName, client.account?.address ? [client.account.address] : []);
    const raw = await client.estimateTransactionFees(distOptions);
    return unwrapQuote(raw);
  } catch (e) {
    console.error("Quote failed", e);
    return null;
  }
}

export { waitSuccessful };

export const writes = {

  postBond: (c: any, jobId: string, value: bigint) =>
    writeWithFees(c, { functionName: "post_bond", args: [], value }),
  unbond: (c: any) => writeWithFees(c, { functionName: "unbond", args: [] }),
  createJob: (
    c: any,
    brief: string,
    payB: bigint,
    payC: bigint,
    premium: bigint,
    deadline: bigint,
    writer: string,
    publisher: string,
    value: bigint
  ) =>
    writeWithFees(c, {
      functionName: "create_job",
      args: [brief, payB, payC, premium, deadline, writer, publisher],
      value,
    }),
  submit: (c: any, id: string, url: string, hash: string) => writeWithFees(c, { functionName: "submit", args: [id, url, hash] }),
  submitHop: (c: any, id: string, hop: string, url: string, hash: string) =>
    writeWithFees(c, { functionName: "submit_hop", args: [id, hop, url, hash] }),
  ack: (c: any, id: string) =>
    writeWithFees(c, { functionName: "ack_downstream", args: [id, ""] }),
  adjudicate: (c: any, id: string) => writeWithFees(c, { functionName: "adjudicate", args: [id] }),
  adjudicateAsync: async (client: any, id: string) => {
    const res = await writeWithFees(client, { functionName: "adjudicate", args: [id] });
    return res.hash;
  },
  cancel: (c: any, id: string) => writeWithFees(c, { functionName: "cancel", args: [id] }),
  withdraw: (c: any) => writeWithFees(c, { functionName: "withdraw", args: [] }),
};
