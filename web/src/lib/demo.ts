"use client";

import type { Job, JobState } from "./contract";
import { ATTO } from "./format";

const KEY = "makewhole.demo.jobs";

export const DEMO_MARK = "DEMO · NOT ON-CHAIN";

export const FIXTURES = {
  brief: "https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/brief.md",
  good: "https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/good-write.md",
  rug: "https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/rug-write.md",
};

const PAY_B = 20n * ATTO;
const PAY_C = 125n * (ATTO / 10n);
const PREMIUM = 25n * (ATTO / 10n);

export type DemoJob = Job & { demo: true };

async function shaId(material: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

function loadRaw(): DemoJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DemoJob[];
  } catch {
    return [];
  }
}

function saveRaw(jobs: DemoJob[]) {
  sessionStorage.setItem(KEY, JSON.stringify(jobs));
}

export function listDemoJobs(): DemoJob[] {
  return loadRaw();
}

export function getDemoJob(id: string): DemoJob | null {
  return loadRaw().find((j) => j.id.toLowerCase() === id.toLowerCase()) || null;
}

export async function runDemoReplay(opts: {
  mode: "good" | "rug";
  account: string | null;
  deliverable: string;
  brief?: string;
}): Promise<DemoJob> {
  const account = opts.account || "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const writer = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const publisher = "0xcccccccccccccccccccccccccccccccccccccccc";
  const brief = opts.brief || FIXTURES.brief;
  const deliv = opts.deliverable;
  const id = await shaId(`${account}|${brief}|${deliv}|${opts.mode}|${Date.now()}`);
  const rug = opts.mode === "rug";
  const job: DemoJob = {
    demo: true,
    id,
    client: account,
    writer,
    publisher,
    brief_url: brief,
    deliverable_url: deliv,
    research_url: brief,
    publish_url: "",
    pay_b: PAY_B,
    pay_c: PAY_C,
    premium: PREMIUM,
    state: (rug ? "SETTLED_RUG" : "SETTLED_OK") as JobState,
    fault: rug ? "B" : "none",
    pay_downstream: true,
    slash_bps: rug ? 10000 : 0,
    reason: rug
      ? "DEMO · Writer posted lorem plus system_override. Not a Studio-dev transaction. Publisher C is still paid from the bond, unused pay_b refunds to A, remainder slashed to the pool."
      : "DEMO · Deliverable matches the public brief. Not a Studio-dev transaction. B and C paid; premium stays in the pool.",
    paid_c: PAY_C,
    slashed_b: rug ? 50n * ATTO - PAY_C : 0n,
    hop_kind: "write",
    bonded: true,
    writer_rep: rug ? 0 : 1,
  };
  const next = [job, ...loadRaw()].slice(0, 24);
  saveRaw(next);
  return job;
}

export function clearDemoJobs() {
  sessionStorage.removeItem(KEY);
}

export const DEMO_MONEY = {
  pay_b: PAY_B,
  pay_c: PAY_C,
  premium: PREMIUM,
};
