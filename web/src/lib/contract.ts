"use client";

import { waitSuccessful } from "./genlayer";

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

async function writeWithFees(client: any, write: Record<string, unknown>) {
  if (!client) throw new Error("Connect a wallet to send writes");
  if (!hasLiveContract()) {
    throw new Error("NO_CONTRACT");
  }
  const call = { address: CONTRACT_ADDRESS, ...write };
  const estimate = await client.estimateTransactionFeesForWrite(call);
  const txId = await client.writeContract({
    ...call,
    account: client.account,
    fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
  });
  await waitSuccessful(client, txId);
  return txId as string;
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

export const writes = {
  fundPool: (c: any, value: bigint) => writeWithFees(c, { functionName: "fund_pool", args: [], value }),
  postBond: (c: any, value: bigint) => writeWithFees(c, { functionName: "post_bond", args: [], value }),
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
    hopKind: string,
    value: bigint
  ) =>
    writeWithFees(c, {
      functionName: "create_job",
      args: [brief, payB, payC, premium, deadline, writer, publisher, hopKind],
      value,
    }),
  submit: (c: any, id: string, url: string, hash: string) => writeWithFees(c, { functionName: "submit", args: [id, url, hash] }),
  submitHop: (c: any, id: string, hop: string, url: string, hash: string) =>
    writeWithFees(c, { functionName: "submit_hop", args: [id, hop, url, hash] }),
  ack: (c: any, id: string, url: string) =>
    writeWithFees(c, { functionName: "ack_downstream", args: [id, url] }),
  adjudicate: (c: any, id: string) => writeWithFees(c, { functionName: "adjudicate", args: [id] }),
  cancel: (c: any, id: string) => writeWithFees(c, { functionName: "cancel", args: [id] }),
  withdraw: (c: any) => writeWithFees(c, { functionName: "withdraw", args: [] }),
};
