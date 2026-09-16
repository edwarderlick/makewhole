"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { hasLiveContract, views, writes, type Job } from "@/lib/contract";
import { formatGen, parseGen, shortAddr, shortId } from "@/lib/format";
import { StatusChip } from "@/components/StatusChip";
import { TxButton } from "@/components/TxButton";
import { EvidenceLink } from "@/components/EvidenceLink";
import { LandingLoop } from "@/components/LandingLoop";
import { DEMO_MARK, FIXTURES, getDemoJob, runDemoReplay, type DemoJob } from "@/lib/demo";

export default function PipelinePage() {
  const { client, account } = useWallet();
  const live = hasLiveContract();
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<Job | DemoJob | null>(null);
  const [eco, setEco] = useState<any>(null);
  const [bondAmt, setBondAmt] = useState("50");
  const [poolAmt, setPoolAmt] = useState("100");
  const [deliv, setDeliv] = useState(FIXTURES.good);
  const [pub, setPub] = useState("");
  const [mode, setMode] = useState<"good" | "rug">("rug");
  const [spin, setSpin] = useState<string | null>(null);
  const demo = Boolean(job && (job as DemoJob).demo);
  const rug = mode === "rug" && (!job || job.state === "SETTLED_RUG" || !job.state.startsWith("SETTLED_OK"));

  async function refresh(id = jobId) {
    if (!id) {
      setJob(null);
      return;
    }
    setSpin("Reading public pages");
    try {
      const demoHit = !live ? getDemoJob(id) : null;
      if (demoHit) setJob(demoHit);
      else if (live) setJob(await views.getJob(client, id));
      else setJob(null);
      setEco(await views.getEconomics(client));
    } finally {
      setSpin(null);
    }
  }

  useEffect(() => {
    views.getEconomics(client).then(setEco).catch(() => {});
  }, [client]);




  const role =
    !account || !job
      ? null
      : account.toLowerCase() === job.client.toLowerCase()
        ? "A"
        : account.toLowerCase() === job.writer.toLowerCase()
          ? "B"
          : account.toLowerCase() === job.publisher.toLowerCase()
            ? "C"
            : "other";

  const hopBCracked = job ? job.state === "SETTLED_RUG" : mode === "rug";

  return (
    <div className="flex flex-col w-full">
      <section className="w-full bg-surface-container-lowest shadow-md">
        <div className="max-w-col-max-width mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-primary text-on-primary px-3 py-1 rounded font-label-code text-label-code tracking-wider uppercase flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-secondary-fixed animate-pulse" />
              <span>PIPELINE_ORCHESTRATOR</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-headline-sm text-primary">
                {job ? `Job ${shortId(job.id)}` : "No job loaded"}
              </span>
              {job ? <EvidenceLink href={job.brief_url} /> : null}
              {demo && (
                <span className="font-label-status text-label-status bg-secondary-container text-on-secondary-fixed px-2 py-0.5 chip-pulse">
                  {DEMO_MARK}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            {job ? <StatusChip state={job.state} /> : <span className="font-label-status text-label-status text-on-surface-variant">[ IDLE ]</span>}
            <span className="font-body-sm text-body-sm text-on-surface-variant hidden sm:inline">
              Studio Next · Chain 61997
            </span>
          </div>
        </div>
      </section>

      <section className="max-w-col-max-width mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 mb-6">
          <div>
            <div className="font-label-status text-label-status text-on-surface-variant uppercase tracking-widest mb-1">
              DAG_TOPOLOGY // 3-HOP MULTI-AGENT PIPELINE
            </div>
            <h1 className="font-headline-xl text-headline-xl text-primary tracking-tight">Non-Repudiation Surety Mesh</h1>
          </div>
          <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1 rounded">
            <span className="material-symbols-outlined text-[16px] text-secondary">verified_user</span>
            <span className="font-label-code text-label-code text-on-surface">Surety Protocol Guard: ACTIVE</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <label className="flex-1 min-w-[240px]">
            <span className="font-label-code text-label-code text-on-surface-variant">Job hash</span>
            <input
              className="w-full border border-outline-variant px-3 py-2 font-label-code text-label-code bg-white"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="0x…"
            />
          </label>
          <button className="px-4 py-2 bg-white border border-primary font-label-code text-label-code" onClick={() => refresh()}>
            Load
          </button>
        </div>
        {spin && <p className="mb-4 font-label-code text-label-code">{spin}</p>}

        <div className="mb-12">
          <LandingLoop pauseOn={rug ? "rug" : "ok"} />
        </div>

        <div className="relative w-full">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
            <HopCard
              n="01 // HOP_A"
              tag="CLIENT"
              status="[ COMPLETED / OK ]"
              statusLime
              title="RESEARCH"
              blurb="Autonomous market and structural research ingestion synthesizer."
              wallet={job?.client}
              extra={[["Execution", "research hop"], ["Consensus", "public HTTPS brief"]]}
              evidence={job?.brief_url || job?.research_url}
              footerL="STATE"
              footerR="SEALED"
            />
            <div
              className={`bg-surface-container-lowest rounded shadow-xl p-6 flex flex-col justify-between relative overflow-hidden ${hopBCracked ? "hop-cracked" : ""}`}
            >
              <div className="absolute inset-0 bg-tertiary-container/5 pointer-events-none" />
              <div>
                <div className="flex items-center justify-between pb-4 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="font-label-code text-label-code text-on-surface-variant font-bold">02 // HOP_B</span>
                    <span className="bg-error-container text-on-error-container px-2 py-0.5 rounded font-label-status text-label-status font-bold flex items-center gap-1 animate-pulse">
                      <span className="material-symbols-outlined text-[13px]">warning</span>
                      {hopBCracked ? "FAULT_DETECTED" : "WRITER"}
                    </span>
                  </div>
                  <span className="bg-primary text-on-primary font-label-status text-label-status px-2 py-0.5 rounded font-bold">
                    [ BONDED ]
                  </span>
                </div>
                <div className="mb-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-headline-md text-headline-md text-primary font-bold">WRITE</h2>
                    <div className="font-label-code text-label-code text-on-error-container bg-error-container px-2 py-0.5 rounded">
                      Slashable bond
                    </div>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Consensus editorial writer generating the compiled output artifact.
                  </p>
                </div>
                <div className="bg-surface-container p-3 rounded mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-label-status text-label-status text-on-surface uppercase font-bold">
                      Simulation Mode Override:
                    </span>
                    <span className="font-label-status text-label-status text-on-surface-variant">DEMO HOOK</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      className={`py-2 px-3 text-center rounded font-label-code text-label-code ${mode === "good" ? "bg-primary text-secondary-fixed font-bold" : "bg-surface-container-high text-on-surface-variant"}`}
                      onClick={() => {
                        setMode("good");
                        setDeliv(FIXTURES.good);
                      }}
                    >
                      Mode Good
                    </button>
                    <button
                      className={`py-2 px-3 text-center rounded font-label-code text-label-code ${mode === "rug" ? "bg-primary text-secondary-fixed font-bold" : "bg-surface-container-high text-on-surface-variant"}`}
                      onClick={() => {
                        setMode("rug");
                        setDeliv(FIXTURES.rug);
                      }}
                    >
                      Mode Rug {mode === "rug" ? "[Active]" : ""}
                    </button>
                  </div>
                  <p className="font-label-status text-label-status text-on-surface-variant mt-2 leading-tight">
                    Demo only — local gist replay. Not a live TVL number.
                  </p>
                </div>
                <div className="bg-surface-container-low p-4 rounded space-y-2 mb-4">
                  <Row k="Agent Wallet" v={shortAddr(job?.writer)} />
                  <Row k="Integrity" v={hopBCracked ? "SIGNATURE_CORRUPTED" : "PAYLOAD_VALID"} error={hopBCracked} />
                </div>
                <div className="space-y-1">
                  <span className="font-label-status text-label-status text-on-surface-variant uppercase">Deliverable Evidence</span>
                  <EvidenceLink href={job?.deliverable_url || deliv} />
                </div>
              </div>
              <div className="mt-6 pt-4 flex items-center justify-between font-label-status text-label-status">
                <span className="text-on-surface-variant">{hopBCracked ? "VERIFICATION: REJECTED" : "VERIFICATION: OK"}</span>
                <span className={hopBCracked ? "text-error font-bold" : "text-secondary font-bold"}>
                  {hopBCracked ? "SLASHDOWN IMMINENT" : "CLEAR"}
                </span>
              </div>
            </div>
            <HopCard
              n="03 // HOP_C"
              tag="DOWNSTREAM"
              status="[ ACKED / DOWNSTREAM ]"
              limeTag
              title="PUBLISH"
              blurb="Distribution publisher. Evidence is public HTTPS — not a private blob store."
              wallet={job?.publisher}
              extra={[
                ["Burned compute", job ? `${formatGen(job.pay_c)} GEN quote` : "pay_c"],
                ["Status", job?.state === "SETTLED_RUG" || job?.state === "SETTLED_OK" ? "Made whole" : "Awaiting verdict"],
              ]}
              evidence={job?.publish_url}
              footerL="TARGET: PUBLIC HTTPS"
              footerR="INSURED"
              limeGlow
              guarantee="Even if Write (Hop B) rugs, pay_c is routed from B’s bond first, then the pool."
            />
          </div>

          <div className="mt-6 bg-surface-container-lowest p-4 rounded shadow-lg relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-primary font-bold">
                  <span className="material-symbols-outlined">alt_route</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-label-code text-label-code text-primary font-bold uppercase tracking-wider">
                      BYPASS SURETY CONDUIT
                    </span>
                    <span className="bg-secondary-fixed text-on-secondary-fixed text-label-status font-label-status px-2 py-[1px] rounded font-bold animate-pulse">
                      {hopBCracked ? "STREAM ACTIVE" : "STANDBY"}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Direct routing around Hop B:{" "}
                    <span className="font-semibold text-on-surface">Vault pool → Publisher C</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="font-label-code text-label-code text-on-surface-variant">Surety Flow:</span>
                  <span className="font-label-code text-label-code text-primary font-bold">
                    {job ? `+${formatGen(job.pay_c)} GEN` : "pay_c"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-secondary-fixed animate-ping" />
                  <span className="font-label-status text-label-status text-secondary font-bold">NO STOPPAGES</span>
                </div>
              </div>
            </div>
            <div className="w-full mt-3 h-1.5 bg-surface-container rounded-full overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-secondary-fixed via-secondary to-secondary-fixed animate-pulse" />
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-col-max-width mx-auto px-4 sm:px-6 lg:px-8 pb-8 w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat k="POOL BALANCE" v={`${formatGen(eco?.pool ?? 0)} GEN`} n={live ? "live view" : "empty address · 0"} />
          <Stat k="LOCKED BONDS" v={`${formatGen(eco?.locked_bonds ?? 0)} GEN`} n="get_economics" />
          <Stat k="LOCKED JOBS" v={`${formatGen(eco?.locked_jobs ?? 0)} GEN`} n={job ? `pay_b ${formatGen(job.pay_b)} · pay_c ${formatGen(job.pay_c)}` : "no job"} />
          <Stat k="CREDITS" v={`${formatGen(eco?.credits ?? 0)} GEN`} n="withdraw() if native payout missed" />
        </div>
      </section>

      <section className="max-w-col-max-width mx-auto px-4 sm:px-6 lg:px-8 pb-16 w-full">
        <div className="bg-primary text-on-primary rounded shadow-xl p-8 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-secondary-container text-on-secondary-fixed px-2 py-0.5 rounded font-label-status text-label-status font-bold">
                  GENLAYER CONSENSUS ENGINE
                </span>
                <span className="bg-surface-container-highest text-on-surface px-2 py-0.5 rounded font-label-status text-label-status font-semibold">
                  {spin ? `[ ${spin.toUpperCase()} ]` : live ? "[ LIVE IC ]" : "[ DEMO · NOT ON-CHAIN ]"}
                </span>
              </div>
              <h2 className="font-headline-lg text-headline-lg text-on-primary font-bold tracking-tight">
                Deterministic Dispute Adjudication
              </h2>
              <p className="font-body-md text-body-md text-on-primary-container max-w-xl mt-2">
                The Intelligent Contract fetches public gist evidence and settles on three fields. Frontend agents do
                not decide fault and do not route funds.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
              {!live && (
                <button
                  className="bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-container px-8 py-3 rounded font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-2 shadow-lg"
                  onClick={async () => {
                    setSpin("Reading public pages");
                    const d = await runDemoReplay({ mode, account, deliverable: deliv, brief: FIXTURES.brief });
                    setJob(d);
                    setJobId(d.id);
                    setSpin(null);
                  }}
                >
                  Replay gist · DEMO
                </button>
              )}
              {live && job && job.state === "ACKED" && (
                <TxButton
                  label="ADJUDICATE"
                  onClick={async () => {
                    try {
                      const res = await writes.adjudicate(client, job.id);
                      setSpin("Waiting on consensus");
                      return res;
                    } finally {
                      await refresh();
                    }
                  }}
                />
              )}
            </div>
          </div>
          <div className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="font-label-status text-label-status text-on-primary-container uppercase tracking-widest">
                STATE RESOLUTION MATRIX (VERDICT TRIAD)
              </span>
              <span className="font-label-code text-label-code text-secondary-fixed-dim">
                IC {live ? "live" : "(undeployed)"}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <Verdict k="fault" v={job && job.state.includes("SETTLED") ? String(job.fault) : "-"} err={hopBCracked} />
              <Verdict k="pay_downstream" v={job && job.state.includes("SETTLED") ? String(job.pay_downstream) : "-"} />
              <Verdict k="slash_bps" v={job && job.state.includes("SETTLED") ? String(job.slash_bps) : "-"} />
            </div>
            <div className="bg-surface-container-lowest text-on-surface p-6 rounded shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <span className="font-label-status text-label-status text-on-surface-variant font-bold uppercase tracking-wider block">
                  ATOMIC RESOLUTION STATEMENT
                </span>
                <p className="font-body-lg text-body-lg text-primary font-semibold mt-1">
                  {job
                    ? job.state === "SETTLED_RUG"
                      ? `SETTLED_RUG · unused pay_b (${formatGen(job.pay_b)} GEN) refunds to A. C receives pay_c (${formatGen(job.pay_c)} GEN) from B’s bond first.`
                      : job.state === "SETTLED_OK"
                        ? `SETTLED_OK · B receives pay_b, C receives pay_c, premium stays in the pool.`
                        : `${job.state} · role ${role || "observer"}`
                    : rug
                      ? "Writer B slashed. Client A refunded unused write fee. Publisher C made whole from bond then pool."
                      : "Load a job or replay the gist to see the money line."}
                </p>
              </div>
              {job && (
                <Link href={`/job/${job.id}`} className="bg-secondary-container text-on-secondary-fixed font-label-code text-label-code px-3 py-1 rounded font-bold">
                  Open job ↗
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div className="border border-outline-variant p-6 space-y-3 bg-white rounded-xl">
            <div className="font-label-status text-label-status">MONEY RAIL</div>


          </div>
          <div className="border border-outline-variant p-6 space-y-3 bg-white rounded-xl">
            <div className="font-label-status text-label-status">REPLAY GIST</div>
            <Field label="Deliverable HTTPS" value={deliv} onChange={setDeliv} placeholder="public raw gist" />
            <Field label="Publish HTTPS" value={pub} onChange={setPub} />
            {live && job && (job.state === "OPEN" || job.state === "BONDED") && role === "B" && (
              <TxButton label="submit as B" onClick={() => writes.submit(client, job.id, deliv, "").then((t) => { refresh(); return t; })} />
            )}
            {live && job && job.state === "IN_FLIGHT" && role === "C" && (
              <TxButton label="ack as C" onClick={() => writes.ack(client, job.id).then((t) => { refresh(); return t; })} />
            )}
            {live && job && (job.state === "OPEN" || job.state === "BONDED") && role === "A" && (
              <TxButton label="cancel" variant="ghost" onClick={() => writes.cancel(client, job.id).then((t) => { refresh(); return t; })} />
            )}
            {live && job && job.state === "ACKED" && (
              <TxButton label="Retry adjudicate" onClick={() => writes.adjudicate(client, job.id).then((t) => { refresh(); return t; })} />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function HopCard({
  n,
  tag,
  status,
  statusLime,
  limeTag,
  title,
  blurb,
  wallet,
  extra,
  evidence,
  footerL,
  footerR,
  limeGlow,
  guarantee,
}: {
  n: string;
  tag: string;
  status: string;
  statusLime?: boolean;
  limeTag?: boolean;
  title: string;
  blurb: string;
  wallet?: string;
  extra: [string, string][];
  evidence?: string;
  footerL: string;
  footerR: string;
  limeGlow?: boolean;
  guarantee?: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded shadow-md p-6 flex flex-col justify-between relative overflow-hidden">
      {limeGlow && <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-secondary-fixed/20 pointer-events-none" />}
      <div>
        <div className="flex items-center justify-between pb-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="font-label-code text-label-code text-on-surface-variant font-bold">{n}</span>
            <span className={`${limeTag ? "bg-secondary-container text-on-secondary-fixed font-bold" : "bg-surface-container-high text-on-surface"} px-2 py-0.5 rounded font-label-status text-label-status`}>
              {tag}
            </span>
          </div>
          <span className={`${statusLime ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-surface-container-highest text-on-surface"} font-label-status text-label-status px-2 py-0.5 rounded font-bold`}>
            {status}
          </span>
        </div>
        <div className="mb-6">
          <h2 className="font-headline-md text-headline-md text-primary font-bold">{title}</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{blurb}</p>
        </div>
        <div className="bg-surface-container-low p-4 rounded space-y-2 mb-4">
          <Row k="Agent Wallet" v={shortAddr(wallet)} />
          {extra.map(([k, v]) => (
            <Row key={k} k={k} v={v} />
          ))}
        </div>
        <div className="space-y-1">
          <span className="font-label-status text-label-status text-on-surface-variant uppercase">Artifact</span>
          <EvidenceLink href={evidence} />
        </div>
        {guarantee && (
          <div className="bg-secondary-fixed/30 p-3 rounded mt-4">
            <div className="font-label-code text-label-code text-on-secondary-fixed font-bold">DOWNSTREAM MAKEWHOLE GUARANTEE</div>
            <p className="font-body-sm text-body-sm text-on-secondary-fixed mt-1">{guarantee}</p>
          </div>
        )}
      </div>
      <div className="mt-6 pt-4 flex items-center justify-between font-label-status text-label-status text-on-surface-variant">
        <span>{footerL}</span>
        <span className="text-secondary font-bold">{footerR}</span>
      </div>
    </div>
  );
}

function Row({ k, v, error }: { k: string; v: string; error?: boolean }) {
  return (
    <div className="flex justify-between items-center font-label-code text-label-code">
      <span className="text-on-surface-variant">{k}</span>
      <span className={error ? "text-error font-bold" : "text-primary font-semibold"}>{v}</span>
    </div>
  );
}

function Stat({ k, v, n }: { k: string; v: string; n: string }) {
  return (
    <div className="bg-surface-container-lowest p-4 rounded shadow-sm">
      <span className="font-label-status text-label-status text-on-surface-variant uppercase tracking-wider">{k}</span>
      <div className="font-headline-md text-headline-md text-primary font-bold mt-1">{v}</div>
      <span className="font-label-code text-label-code text-secondary font-semibold">{n}</span>
    </div>
  );
}

function Verdict({ k, v, err }: { k: string; v: string; err?: boolean }) {
  return (
    <div className="bg-primary-container p-4 rounded">
      <span className="font-label-status text-label-status text-on-primary-container">{k}</span>
      <div className={`font-label-code text-label-code font-bold text-[18px] mt-1 ${err ? "text-error" : "text-secondary-fixed"}`}>
        {v}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="font-label-code text-label-code text-on-surface-variant">{label}</span>
      <input
        className="w-full border border-outline-variant px-3 py-2 font-label-code text-label-code"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
