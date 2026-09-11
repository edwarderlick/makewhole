"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { views, type Job, type JobState } from "@/lib/contract";
import { formatGen, shortId } from "@/lib/format";
import { StatusChip } from "@/components/StatusChip";
import { PageHero } from "@/components/PageHero";

const FILTERS: Array<JobState | "ALL"> = ["ALL", "OPEN", "BONDED", "IN_FLIGHT", "ACKED", "SETTLED_OK", "SETTLED_RUG", "CANCELED", "UNDETERMINED"];

export default function BrowsePage() {
  const { client } = useWallet();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      try {
        if (!process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
          setJobs([]);
          setErr(null);
          return;
        }
        const ids: string[] = (await views.listIds(client)) || [];
        const rows: Job[] = [];
        for (const id of ids.slice().reverse()) {
          try {
            rows.push(await views.getJob(client, id));
          } catch {
            /* skip */
          }
        }
        if (live) {
          setJobs(rows);
          setErr(null);
        }
      } catch (e: any) {
        if (live) setErr(e?.message || "Read failed");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [client]);

  const shown = jobs.filter((j) => (filter === "ALL" || j.state === filter) && (!q || j.id.toLowerCase().includes(q.toLowerCase()) || j.writer.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHero
        kicker="SYS_REGISTRY // CH_61997"
        title="Surety Pipeline Ledger"
        lede="Live list_ids + get_job. Empty feed is correct. No fabricated rows."
      />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 font-label-code text-label-code rounded-md ${filter === f ? "bg-black text-white" : "bg-white border border-neutral-200"}`}
          >
            {f} <span className="text-[10px]">{f === "ALL" ? jobs.length : jobs.filter((j) => j.state === f).length}</span>
          </button>
        ))}
      </div>
      <input
        className="mt-4 w-full border border-neutral-200 rounded-md px-3 py-2 font-label-code text-label-code"
        placeholder="SEARCH_BY_JOB_HASH [0x...] OR AGENT_ADDR..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {loading && <p className="mt-6 font-label-code text-label-code">Reading public pages…</p>}
      {err && <p className="mt-6 font-label-code text-label-code text-error">{err}</p>}
      {!loading && shown.length === 0 && (
        <div className="mt-8 p-8 bg-white border border-dashed border-neutral-300 rounded-xl font-body-md text-on-surface-variant">
          No on-chain jobs. Empty feed is correct. Use Pipeline → Replay gist for a DEMO · NOT ON-CHAIN rug.
        </div>
      )}
      <div className="mt-6 divide-y border border-neutral-200 bg-white rounded-xl overflow-hidden">
        {shown.map((j) => (
          <Link key={j.id} href={`/job/${j.id}`} className="flex flex-col md:flex-row md:items-center justify-between gap-pad-sm p-pad-md hover:bg-surface-container-low">
            <div>
              <div className="font-label-code text-[12px]">{shortId(j.id)}</div>
              <div className="font-body-sm text-on-surface-variant truncate max-w-xl">{j.brief_url}</div>
            </div>
            <div className="flex items-center gap-pad-md">
              <span className="font-label-code text-[12px]">{formatGen(j.pay_b)} + {formatGen(j.pay_c)} GEN</span>
              <StatusChip state={j.state} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
