"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { hasLiveContract, views, writes, type Job } from "@/lib/contract";
import { DEMO_MARK, getDemoJob, type DemoJob } from "@/lib/demo";
import { explorerTx, formatGen, shortAddr, shortId } from "@/lib/format";
import { StatusChip } from "@/components/StatusChip";
import { EvidenceLink } from "@/components/EvidenceLink";
import { TxButton } from "@/components/TxButton";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { client, account } = useWallet();
  const [job, setJob] = useState<Job | DemoJob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  async function load() {
    try {
      const demo = getDemoJob(String(id));
      if (demo && !hasLiveContract()) {
        setJob(demo);
        setErr(null);
        return;
      }
      setJob(await views.getJob(client, id));
      setErr(null);
    } catch (e: any) {
      const demo = getDemoJob(String(id));
      if (demo) {
        setJob(demo);
        setErr(null);
        return;
      }
      setErr(e?.message || "Not found");
    }
  }
  useEffect(() => {
    load();
  }, [client, id]);

  if (err) return <div className="max-w-col-max-width mx-auto px-pad-lg py-pad-xl font-label-code text-error">{err}</div>;
  if (!job) return <div className="max-w-col-max-width mx-auto px-pad-lg py-pad-xl font-label-code">Reading public pages…</div>;

  const me = account?.toLowerCase();
  const isA = me === job.client.toLowerCase();
  const isB = me === job.writer.toLowerCase();
  const isC = me === job.publisher.toLowerCase();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div>
        <div className="font-label-code text-[12px] text-on-surface-variant">JOB_DISPATCH_LEDGER / {shortId(job.id)}</div>
        <div className="flex flex-wrap items-center gap-pad-sm mt-pad-xs">
          <h1 className="font-headline-xl text-[40px]">Job {shortId(job.id)}</h1>
          <button className="p-pad-2xs bg-surface-container" onClick={() => navigator.clipboard.writeText(job.id)}>
            copy
          </button>
          <StatusChip state={job.state} />
          {(job as DemoJob).demo && (
            <span className="font-label-status text-[11px] bg-secondary-container px-pad-xs chip-pulse">{DEMO_MARK}</span>
          )}
        </div>
        <a className="font-label-code text-[12px] text-secondary" href={process.env.NEXT_PUBLIC_STUDIO_EXPLORER || "https://explorer-studio-dev.genlayer.com"} target="_blank" rel="noreferrer">
          View on GenLayer Explorer ↗
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-pad-sm">
        <Metric k="HOP LABEL" v={job.hop_kind} n="UI only" />
        <Metric k="PAY_B" v={`${formatGen(job.pay_b)} GEN`} n={job.state === "SETTLED_RUG" ? "REFUNDED TO CLIENT" : job.state === "SETTLED_OK" ? "PAID WRITER" : ""} />
        <Metric k="PAY_C" v={`${formatGen(job.pay_c)} GEN`} n={job.paid_c ? "SURETY DISBURSED" : ""} />
        <Metric k="PREMIUM" v={`${formatGen(job.premium)} GEN`} n="Pool on settle" />
        <Metric k="SLASHED_B" v={`${formatGen(job.slashed_b)} GEN`} n={`rep ${job.writer_rep}`} />
      </div>

      <div className="grid md:grid-cols-3 gap-pad-md">
        <Party title="A CLIENT" addr={job.client} url={job.brief_url} mark="brief" />
        <Party title="B WRITER" addr={job.writer} url={job.deliverable_url} mark="deliverable" />
        <Party title="C PUBLISHER" addr={job.publisher} url={job.publish_url} mark="publish" />
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant p-pad-lg">
        <div className="font-label-status">VERDICT TRIAD (equivalence fields only — not a vote count)</div>
        <div className="grid md:grid-cols-3 gap-pad-md mt-pad-md">
          <Metric k="fault" v={job.fault || "—"} />
          <Metric k="pay_downstream" v={String(job.pay_downstream)} />
          <Metric k="slash_bps" v={String(job.slash_bps)} />
        </div>
        <div className="mt-pad-md font-body-sm whitespace-pre-wrap">{job.reason || "No stored reason yet."}</div>
      </div>

      <div className="flex flex-wrap gap-pad-sm">
        {(job.state === "OPEN" || job.state === "BONDED") && isA && (
          <TxButton label="Cancel" variant="ghost" onClick={() => writes.cancel(client, job.id).then((t) => { load(); return t; })} />
        )}
        {(job.state === "OPEN" || job.state === "BONDED") && isB && (
          <>
            <input className="border px-pad-sm font-label-code text-[12px]" placeholder="https deliverable" value={url} onChange={(e) => setUrl(e.target.value)} />
            <TxButton label="Submit" onClick={() => writes.submit(client, job.id, url, "").then((t) => { load(); return t; })} />
          </>
        )}
        {job.state === "IN_FLIGHT" && isC && (
          <>
            <input className="border px-pad-sm font-label-code text-[12px]" placeholder="https publish (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
            <TxButton label="Ack" onClick={() => writes.ack(client, job.id, url).then((t) => { load(); return t; })} />
          </>
        )}
        {job.state === "ACKED" && (
          <TxButton label="Adjudicate" onClick={() => writes.adjudicate(client, job.id).then((t) => { load(); return t; })} />
        )}
        {job.state === "UNDETERMINED" && (
          <TxButton label="Retry adjudicate" onClick={() => writes.adjudicate(client, job.id).then((t) => { load(); return t; })} />
        )}
      </div>
    </div>
  );
}

function Metric({ k, v, n }: { k: string; v: string; n?: string }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant p-pad-md">
      <div className="font-label-code text-[11px] text-on-surface-variant">{k}</div>
      <div className="font-headline-sm mt-pad-xs">{v}</div>
      {n && <div className="font-label-code text-[11px] mt-pad-2xs">{n}</div>}
    </div>
  );
}

function Party({ title, addr, url, mark }: { title: string; addr: string; url: string; mark: string }) {
  return (
    <div className="border border-outline-variant p-pad-md bg-white">
      <div className="font-label-code text-[11px]">{title}</div>
      <div className="font-headline-sm mt-pad-xs">{shortAddr(addr)}</div>
      <div className="mt-pad-sm flex items-center gap-pad-xs">
        <EvidenceLink href={url} label={`PUBLIC EVIDENCE · ${mark}`} />
      </div>
    </div>
  );
}
