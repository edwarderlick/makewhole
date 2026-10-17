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

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isExactAddress(addr: unknown): addr is `0x${string}` {
  if (typeof addr !== "string") return false;
  const s = addr.trim().toLowerCase();
  if (s === ZERO_ADDRESS.toLowerCase()) return false;
  return /^0x[0-9a-f]{40}$/.test(s);
}

export function resolveJobLookup(rawId: string | null | undefined): { ok: true; id: string } | { ok: false; error: string } {
  if (!rawId || typeof rawId !== "string" || !rawId.trim() || rawId === "undefined") {
    return { ok: false, error: "Missing job" };
  }
  return { ok: true, id: rawId.trim() };
}

export function getContractAddress(): `0x${string}` {
  return ((process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || CONTRACT_ADDRESS || "").trim()) as `0x${string}`;
}

export function hasLiveContract(): boolean {
  return isExactAddress(getContractAddress());
}

export type Economics = {
  pool: bigint | string | number;
  locked_bonds: bigint | string | number;
  locked_jobs: bigint | string | number;
  credits: bigint | string | number;
  slash_count: number;
  settled_ok: number;
  settled_rug: number;
};

export const EMPTY_ECONOMICS: Economics = {
  pool: "0",
  locked_bonds: "0",
  locked_jobs: "0",
  credits: "0",
  slash_count: 0,
  settled_ok: 0,
  settled_rug: 0,
};

export type Balances = {
  pool: bigint | string | number;
  locked_bonds: bigint | string | number;
  locked_jobs: bigint | string | number;
  credits_total: bigint | string | number;
  contract_balance?: bigint | string | number;
};

export type BondStatus = {
  bonded: boolean;
  writer: string;
  state: string;
  bond: bigint | string;
  total_bond: bigint | string;
  reserved_bond: bigint | string;
  available_bond: bigint | string;
  job_reserved_bond: bigint | string;
  pay_c: bigint | string;
  rep: number;
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
  deliverable_hash: string;
  research_url?: string;
  publish_url: string;
  pay_b: bigint | string;
  pay_c: bigint | string;
  premium: bigint | string;
  deadline: bigint | string | number;
  state: JobState;
  fault: string;
  pay_downstream: boolean;
  slash_bps: number;
  reason: string;
  paid_c: bigint | string;
  slashed_b: bigint | string;
  reserved_bond: bigint | string;
  hop_kind?: string;
  bonded: boolean;
  writer_rep: number;
  writer_total_bond: bigint | string;
  writer_reserved_bond: bigint | string;
  writer_available_bond: bigint | string;
};

function jsonish(v: unknown) {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
}

function profileRow(functionName: string) {
  const profiles = feeProfiles as any;
  return profiles?.methods?.[functionName] || profiles?.[functionName];
}

export function resolveFinalizedRecipients(
  functionName: string,
  context: { job?: Job | Record<string, any> | null; account?: string | null } = {}
): `0x${string}`[] {
  if (functionName === "unbond") {
    const acc = context.account;
    if (!acc || !isExactAddress(acc)) {
      throw new Error("unbond fee allocation requires a valid connected writer address");
    }
    return [acc.toLowerCase() as `0x${string}`];
  }

  if (functionName === "withdraw") {
    const acc = context.account;
    if (!acc || !isExactAddress(acc)) {
      throw new Error("withdraw fee allocation requires a valid connected payee address");
    }
    return [acc.toLowerCase() as `0x${string}`];
  }

  if (functionName === "cancel") {
    const job = context.job;
    if (!job) {
      throw new Error("cancel fee allocation requires job context");
    }
    const client = job.client;
    if (!client || !isExactAddress(client)) {
      throw new Error("cancel fee allocation requires a valid job.client address");
    }
    return [client.toLowerCase() as `0x${string}`];
  }

  if (functionName === "adjudicate") {
    const job = context.job;
    if (!job) {
      throw new Error("adjudicate fee allocation requires job context");
    }
    const client = job.client;
    const writer = job.writer;
    const publisher = job.publisher;
    if (!client || !isExactAddress(client)) {
      throw new Error("adjudicate fee allocation requires a valid job.client address");
    }
    if (!writer || !isExactAddress(writer)) {
      throw new Error("adjudicate fee allocation requires a valid job.writer address");
    }
    if (!publisher || !isExactAddress(publisher)) {
      throw new Error("adjudicate fee allocation requires a valid job.publisher address");
    }
    return [
      client.toLowerCase() as `0x${string}`,
      writer.toLowerCase() as `0x${string}`,
      publisher.toLowerCase() as `0x${string}`,
    ];
  }

  if (functionName === "expire") {
    const job = context.job;
    if (!job) {
      throw new Error("expire fee allocation requires job context");
    }
    const state = typeof job.state === "string" ? job.state.trim().toUpperCase() : "";
    if (state === "OPEN" || state === "BONDED" || state === "ACKED" || state === "UNDETERMINED") {
      const client = job.client;
      if (!client || !isExactAddress(client)) {
        throw new Error(`expire (${state}) fee allocation requires a valid job.client address`);
      }
      return [client.toLowerCase() as `0x${string}`];
    }

    if (state === "IN_FLIGHT") {
      const writer = job.writer;
      const client = job.client;
      if (!writer || !isExactAddress(writer)) {
        throw new Error("expire (IN_FLIGHT) fee allocation requires a valid job.writer address");
      }
      if (!client || !isExactAddress(client)) {
        throw new Error("expire (IN_FLIGHT) fee allocation requires a valid job.client address");
      }
      return [writer.toLowerCase() as `0x${string}`, client.toLowerCase() as `0x${string}`];
    }

    throw new Error(`Cannot resolve expire fee recipients: unknown or terminal job state "${job.state}"`);
  }

  return [];
}

export interface WriteRecipientContext {
  jobId?: string | null;
  job?: Job | Record<string, any> | null;
  account?: string | null;
}

export async function discoverFinalizedRecipients(
  client: any,
  functionName: string,
  context: WriteRecipientContext = {}
): Promise<`0x${string}`[]> {
  const isFinalizedTransferMethod =
    functionName === "unbond" ||
    functionName === "withdraw" ||
    functionName === "cancel" ||
    functionName === "adjudicate" ||
    functionName === "expire";

  if (!isFinalizedTransferMethod) {
    return [];
  }

  if (functionName === "cancel" || functionName === "adjudicate" || functionName === "expire") {
    let job = context.job;
    const jobId = context.jobId;
    if (!job) {
      if (!jobId || typeof jobId !== "string" || !jobId.trim()) {
        throw new Error(`${functionName} recipient discovery requires a valid jobId argument or job object`);
      }
      if (!client || !client.readContract) {
        throw new Error(`Client cannot read contract to discover recipients for ${functionName}`);
      }
      try {
        job = await client.readContract({
          address: getContractAddress(),
          functionName: "get_job",
          args: [jobId.trim()],
        });
      } catch (e: any) {
        throw new Error(`Failed to read job ${jobId} for ${functionName} recipient discovery: ${e?.message || e}`);
      }
    }
    if (!job) {
      throw new Error(`Job ${jobId || "context"} not found when discovering recipients for ${functionName}`);
    }
    const account = context.account || client?.account?.address;
    return resolveFinalizedRecipients(functionName, { job, account });
  }

  if (functionName === "unbond" || functionName === "withdraw") {
    const account = context.account || client?.account?.address;
    if (!account) {
      throw new Error(`Connected wallet address required to discover recipients for ${functionName}`);
    }
    return resolveFinalizedRecipients(functionName, { account });
  }

  return [];
}


export interface FinalizedAllocationNode {
  messageType: number;
  onAcceptance: boolean;
  recipient: `0x${string}`;
  callKey: string;
  budget: bigint;
  feeParams: string;
}

export function buildFinalizedAllocations(
  recipients: string[],
  totalMessageFees: bigint,
  leaderTimeunits: bigint = 100n,
  validatorTimeunits: bigint = 200n
): FinalizedAllocationNode[] {
  if (recipients.length === 0) {
    throw new Error("Cannot build finalized allocations without recipients");
  }

  for (const r of recipients) {
    if (!isExactAddress(r)) {
      throw new Error(`Invalid recipient address: "${r}". Must be a valid nonzero 20-byte address.`);
    }
  }

  const count = recipients.length;
  const perNodeBudget = totalMessageFees / BigInt(count);
  let remainingBudget = totalMessageFees;

  const feeParams = encodeInternalMessageFeeParams({
    leaderTimeunitsAllocation: leaderTimeunits,
    validatorTimeunitsAllocation: validatorTimeunits,
  });

  const nodes: FinalizedAllocationNode[] = [];
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const nodeBudget = isLast ? remainingBudget : perNodeBudget;
    remainingBudget -= nodeBudget;

    nodes.push({
      messageType: MessageType.Internal,
      onAcceptance: false,
      recipient: recipients[i].toLowerCase() as `0x${string}`,
      callKey: CALL_KEY_WILDCARD,
      budget: nodeBudget,
      feeParams,
    });
  }

  return nodes;
}

export function completeAllocations(raw: any[] | undefined, recipients: string[], dist: Record<string, unknown>) {
  const leader = BigInt(String(dist.leaderTimeunitsAllocation ?? "100"));
  const validator = BigInt(String(dist.validatorTimeunitsAllocation ?? "200"));
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
      onAcceptance: stub.onAcceptance ?? false,
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

  const isFinalizedTransferMethod =
    functionName === "unbond" ||
    functionName === "withdraw" ||
    functionName === "cancel" ||
    functionName === "adjudicate" ||
    functionName === "expire";

  if (isFinalizedTransferMethod) {
    if (totalMessageFees <= 0n) {
      throw new Error(`${functionName} profile totalMessageFees must be > 0`);
    }
    if (recipients.length > 0) {
      distOptions.messageAllocations = buildFinalizedAllocations(
        recipients,
        totalMessageFees,
        BigInt(leader),
        BigInt(validator)
      );
    }
  } else if (Array.isArray(distOptions.messageAllocations) && distOptions.messageAllocations.length > 0) {
    distOptions.messageAllocations = completeAllocations(
      distOptions.messageAllocations as any[],
      recipients,
      distOptions
    );
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
  let recipients: string[] = [];

  const isFinalizedTransferMethod =
    fnName === "unbond" ||
    fnName === "withdraw" ||
    fnName === "cancel" ||
    fnName === "adjudicate" ||
    fnName === "expire";

  if (isFinalizedTransferMethod) {
    const jobId = write.args?.[0];
    recipients = await discoverFinalizedRecipients(client, fnName, {
      jobId: typeof jobId === "string" ? jobId : undefined,
      account: client.account?.address,
    });
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

  if (isFinalizedTransferMethod) {
    const budget = BigInt(distribution.totalMessageFees || 0);
    if (budget <= 0n) {
      throw new Error(`${fnName} requires totalMessageFees > 0 for finalized transfer emissions`);
    }

    const finalizedNodes = buildFinalizedAllocations(
      recipients,
      budget,
      BigInt(distribution.leaderTimeunitsAllocation || 100),
      BigInt(distribution.validatorTimeunitsAllocation || 200)
    );

    messageAllocations = finalizedNodes;

    let sum = 0n;
    for (const node of messageAllocations) {
      sum += BigInt(node.budget || 0);
      if (node.onAcceptance !== false) {
        throw new Error(`${fnName} allocation node must have onAcceptance=false`);
      }
      if (node.messageType !== MessageType.Internal) {
        throw new Error(`${fnName} allocation node must be MessageType.Internal`);
      }
      if (!isExactAddress(node.recipient)) {
        throw new Error(`${fnName} allocation node has invalid or zero recipient: ${node.recipient}`);
      }
    }

    if (sum !== budget) {
      throw new Error(`${fnName} allocation sum ${sum} !== budget ${budget}`);
    }
  }

  const call: Record<string, any> = { address: getContractAddress(), ...write };
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
    address: getContractAddress(),
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
    return readView(c, "get_economics", []) as Promise<Economics>;
  },
  getBalances: async (c: any) => {
    if (!hasLiveContract()) return { pool: "0", locked_bonds: "0", locked_jobs: "0", credits_total: "0" } as Balances;
    return readView(c, "get_balances", []) as Promise<Balances>;
  },
  getPool: async (c: any) => {
    if (!hasLiveContract()) return "0";
    return readView(c, "get_pool", []);
  },
  getBond: async (c: any, addr: string) => {
    if (!hasLiveContract()) return "0";
    return readView(c, "get_bond", [addr]);
  },
  getReservedBond: async (c: any, addr: string) => {
    if (!hasLiveContract()) return "0";
    return readView(c, "get_reserved_bond", [addr]);
  },
  getAvailableBond: async (c: any, addr: string) => {
    if (!hasLiveContract()) return "0";
    return readView(c, "get_available_bond", [addr]);
  },
  getRep: async (c: any, addr: string) => {
    if (!hasLiveContract()) return 0;
    return readView(c, "get_rep", [addr]);
  },
  getCredit: async (c: any, addr: string) => {
    if (!hasLiveContract()) return "0";
    return readView(c, "get_credit", [addr]);
  },
  checkBond: async (c: any, id: string) => {
    if (!hasLiveContract())
      return {
        bonded: false,
        reason: "NO_CONTRACT",
        pay_c: "0",
        rep: 0,
        state: "",
        bond: "0",
        total_bond: "0",
        reserved_bond: "0",
        available_bond: "0",
        job_reserved_bond: "0",
        writer: "",
      } as BondStatus;
    return readView(c, "check_bond", [id]) as Promise<BondStatus>;
  },
  getSettlement: async (c: any, id: string) => {
    if (!hasLiveContract()) return { fault: "", pay_downstream: false, slash_bps: 0, paid_c: "0", slashed_b: "0", reason: "NO_CONTRACT" };
    return readView(c, "get_settlement", [id]);
  },
};

export async function getQuote(
  client: any,
  fnName: string,
  context: WriteRecipientContext = {}
) {
  if (!client || !hasLiveContract()) return null;
  try {
    let recipients: string[] = [];
    const isFinalizedTransferMethod =
      fnName === "unbond" ||
      fnName === "withdraw" ||
      fnName === "cancel" ||
      fnName === "adjudicate" ||
      fnName === "expire";

    if (isFinalizedTransferMethod) {
      recipients = await discoverFinalizedRecipients(client, fnName, context);
      if (!recipients || recipients.length === 0) {
        throw new Error(`Recipient discovery returned no recipients for finalized method ${fnName}`);
      }
    } else {
      const fallback = context.account || client.account?.address;
      recipients = fallback && isExactAddress(fallback) ? [fallback.toLowerCase() as `0x${string}`] : [];
    }

    const distOptions = optionsFromProfile(fnName, recipients);
    const raw = await client.estimateTransactionFees(distOptions);
    return unwrapQuote(raw);
  } catch (e) {
    console.error("Quote failed", e);
    return null;
  }
}

export { waitSuccessful };

export const writes = {
  postBond: (c: any, value: bigint) =>
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
  ack: (c: any, id: string, publishUrl: string = "") =>
    writeWithFees(c, { functionName: "ack_downstream", args: [id, publishUrl] }),
  adjudicate: (c: any, id: string) => writeWithFees(c, { functionName: "adjudicate", args: [id] }),
  adjudicateAsync: async (client: any, id: string) => {
    const res = await writeWithFees(client, { functionName: "adjudicate", args: [id] });
    return res.hash;
  },
  expire: (c: any, id: string) => writeWithFees(c, { functionName: "expire", args: [id] }),
  cancel: (c: any, id: string) => writeWithFees(c, { functionName: "cancel", args: [id] }),
  withdraw: (c: any) => writeWithFees(c, { functionName: "withdraw", args: [] }),
};
