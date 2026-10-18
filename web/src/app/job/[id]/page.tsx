"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { views, writes, getQuote, resolveJobLookup } from "@/lib/contract";
import { formatGen, tryParseGen, shortAddr } from "@/lib/format";
import { TxButton } from "@/components/TxButton";

function getAddress(addr: string) {
  if (!addr) return "";
  return addr.toLowerCase();
}

function QuoteButton({ 
  label, 
  fnName, 
  onClick, 
  onSuccess,
  value = 0n,
  variant = "primary",
  disabled = false,
  jobId,
}: { 
  label: string;
  fnName: string;
  onClick: () => Promise<any>;
  onSuccess?: () => void;
  value?: bigint;
  variant?: "primary" | "lime" | "ghost" | "danger";
  disabled?: boolean;
  jobId?: string;
}) {
  const { client, account } = useWallet();
  const [quoteStr, setQuoteStr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!client) return;
    (async () => {
      try {
        const quote = await getQuote(client, fnName, { jobId, account });
        const fee = quote?.feeValue ?? quote?.fee_value;
        if (active && quote && fee != null) {
          const valStr = value > 0n ? `${formatGen(value)} GEN` : "0 GEN";
          setQuoteStr(`${label}: ${valStr} + network fees ~${formatGen(fee)} GEN (refunded)`);
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [client, fnName, value, label, jobId, account]);

  return (
    <TxButton
      label={quoteStr || label}
      variant={variant}
      disabled={disabled}
      onClick={onClick}
      onSuccess={onSuccess}
    />
  );
}

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = params instanceof Promise ? React.use(params) : params;
  const id = (unwrappedParams as any).id;
  const { client, account } = useWallet();
  const router = useRouter();

  const [job, setJob] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [credits, setCredits] = useState<bigint>(0n);

  const [deliverable, setDeliverable] = useState("https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/rug-write.md");
  const [deliverableHash, setDeliverableHash] = useState("");
  const [pubUrl, setPubUrl] = useState("");
  const [bondVal, setBondVal] = useState("0.25");
  const [refresh, setRefresh] = useState(0);

  async function load() {
    setErr(null);
    if (!client) return;
    const lookup = resolveJobLookup(id);
    if (!lookup.ok) {
      setErr(lookup.error);
      return;
    }
    const requestedId = lookup.id;

    try {
      const j = await views.getJob(client, requestedId);
      if (!j) {
        setErr("Job not found");
        return;
      }
      setJob(j);

      // Default bondVal for OPEN job to shortfall if shortfall > 0
      if (j.state === "OPEN") {
        try {
          const payCBig = BigInt(j.pay_c ?? 0);
          const availBig = BigInt(j.writer_available_bond ?? 0);
          const shortfallBig = payCBig > availBig ? payCBig - availBig : 0n;
          if (shortfallBig > 0n) {
            setBondVal(formatGen(shortfallBig, 4));
          }
        } catch {}
      }

      if (j.publish_url) {
        setPubUrl(j.publish_url);
      }
      if (j.deliverable_hash) {
        setDeliverableHash(j.deliverable_hash);
      }
      
      if (account) {
        const cred = await views.getCredit(client, account);
        setCredits(BigInt(cred || 0));
      }
    } catch {
      setErr("Job not found");
    }
  }

  useEffect(() => {
    load();
  }, [client, id, refresh]);

  if (err) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-2xl text-error mb-4 font-headline-sm">{err}</h1>
        <button onClick={() => router.push("/")} className="text-primary underline">Go Home</button>
      </div>
    );
  }

  if (!job) {
    return <div className="max-w-7xl mx-auto px-4 py-12 font-label-code">Loading Job...</div>;
  }

  const isClient = account && getAddress(account) === getAddress(job.client);
  const isWriter = account && getAddress(account) === getAddress(job.writer);
  const isPublisher = account && getAddress(account) === getAddress(job.publisher);
  
  let chipLabel = "Viewer";
  if (isClient) chipLabel = "Client A";
  else if (isWriter) chipLabel = "Writer B";
  else if (isPublisher) chipLabel = "Publisher C";

  let pdStr = "No";
  if (job.pay_downstream === true) pdStr = "Yes";
  else if (job.pay_downstream === false) pdStr = "No";
  else if (job.fault === "B") pdStr = "Yes";

  const payCBig = BigInt(job.pay_c ?? 0);
  const writerAvailBig = BigInt(job.writer_available_bond ?? 0);
  const shortfallBig = payCBig > writerAvailBig ? payCBig - writerAvailBig : 0n;

  const parsedBond = tryParseGen(bondVal);
  const isBondValid = parsedBond !== null && parsedBond > 0n;
  const bondError = parsedBond === null
    ? "Invalid GEN amount. Enter a positive decimal number."
    : parsedBond <= 0n
    ? "Bond amount must be greater than zero."
    : null;

  const deadlineSec = Number(job.deadline || 0);
  const graceSec = deadlineSec + 86400; // 24-hour settlement grace
  const nowSec = Math.floor(Date.now() / 1000);

  const isActiveState = [
    "OPEN",
    "BONDED",
    "IN_FLIGHT",
    "ACKED",
    "UNDETERMINED",
  ].includes(job.state);

  const isGraceState = job.state === "ACKED" || job.state === "UNDETERMINED";
  const deadlineDateStr = deadlineSec > 0 ? new Date(deadlineSec * 1000).toLocaleString() : "—";
  const graceDateStr = deadlineSec > 0 ? new Date(graceSec * 1000).toLocaleString() : "—";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 border-b border-surface-variant pb-8">
        <div className="flex flex-wrap items-center gap-4 mb-2">
          <h1 className="font-headline-md text-3xl tracking-tight text-on-surface uppercase">
            Job {job.id.slice(0, 10)}...
          </h1>
          <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-label-status uppercase font-bold">
            {job.state}
          </span>
          <span className="bg-secondary-container text-on-secondary-fixed px-3 py-1 rounded-full text-xs font-label-status uppercase">
            Connected as {chipLabel}
          </span>
          {job.bonded ? (
            <span className="bg-lime-100 text-lime-800 border border-lime-300 px-3 py-1 rounded-full text-xs font-label-status uppercase">
              Fully Collateralized
            </span>
          ) : (
            <span className="bg-amber-100 text-amber-800 border border-amber-300 px-3 py-1 rounded-full text-xs font-label-status uppercase">
              Undercollateralized
            </span>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          {/* Roles & Escrow */}
          <div className="bg-surface rounded-xl p-6 border border-surface-variant space-y-4 font-label-code text-sm">
            <h3 className="font-headline-sm text-on-surface uppercase mb-4 text-base">Roles</h3>
            <div className="grid grid-cols-[110px_1fr] gap-2 items-baseline">
              <span className="text-on-surface-variant">Client A:</span>
              <span className="truncate text-on-surface font-mono">{job.client}</span>
              <span className="text-on-surface-variant">Writer B:</span>
              <span className="truncate text-on-surface font-mono">{job.writer}</span>
              <span className="text-on-surface-variant">Publisher C:</span>
              <span className="truncate text-on-surface font-mono">{job.publisher}</span>
            </div>
            
            {isClient && job.state === "OPEN" && (
              <div className="mt-4 p-4 bg-amber-50 text-amber-900 border border-amber-300 rounded-md text-[12px]">
                You are Client A. Switch MetaMask to Writer B ({shortAddr(job.writer)}) to post the required bond reservation.
              </div>
            )}
            
            <h3 className="font-headline-sm text-on-surface uppercase mb-4 mt-6 text-base">Escrow</h3>
            <div className="grid grid-cols-[110px_1fr] gap-2 items-baseline">
              <span className="text-on-surface-variant">pay_b:</span>
              <span className="text-on-surface font-bold">{formatGen(job.pay_b)} GEN</span>
              <span className="text-on-surface-variant">pay_c:</span>
              <span className="text-on-surface font-bold">{formatGen(job.pay_c)} GEN</span>
              <span className="text-on-surface-variant">premium:</span>
              <span className="text-on-surface">{formatGen(job.premium)} GEN</span>
            </div>

            {/* Collateral Reservation Section */}
            <h3 className="font-headline-sm text-on-surface uppercase mb-4 mt-6 text-base">
              Collateral Reservation
            </h3>
            <div className="grid grid-cols-[160px_1fr] gap-2 items-baseline">
              <span className="text-on-surface-variant">Job reservation:</span>
              <span className="text-on-surface font-bold text-amber-700 font-mono">
                {formatGen(job.reserved_bond)} GEN
              </span>
              <span className="text-on-surface-variant">Required pay_c:</span>
              <span className="text-on-surface font-mono">
                {formatGen(job.pay_c)} GEN
              </span>
              <span className="text-on-surface-variant">Writer total bond:</span>
              <span className="text-on-surface font-mono">
                {formatGen(job.writer_total_bond)} GEN
              </span>
              <span className="text-on-surface-variant">Writer aggregate reserved:</span>
              <span className="text-on-surface font-mono">
                {formatGen(job.writer_reserved_bond)} GEN
              </span>
              <span className="text-on-surface-variant">Writer available bond:</span>
              <span className="text-on-surface font-mono font-bold text-lime-700">
                {formatGen(job.writer_available_bond)} GEN
              </span>
              <span className="text-on-surface-variant">Collateralized status:</span>
              <span className="text-on-surface font-semibold">
                {job.bonded ? "Fully Collateralized (1:1 reservation)" : "Unbonded (Insufficient available bond)"}
              </span>
              {job.state === "OPEN" && (
                <>
                  <span className="text-on-surface-variant">Shortfall to bond:</span>
                  <span className="text-error font-bold font-mono">
                    {formatGen(shortfallBig)} GEN {shortfallBig === 0n ? "(0 shortfall — posting any bond will trigger reservation)" : "needed"}
                  </span>
                </>
              )}
            </div>

            {/* Deadline and Grace Period */}
            <h3 className="font-headline-sm text-on-surface uppercase mb-4 mt-6 text-base">
              Timing & Deadlines
            </h3>
            <div className="grid grid-cols-[160px_1fr] gap-2 items-baseline">
              <span className="text-on-surface-variant">Job Deadline:</span>
              <span className="text-on-surface font-mono">{deadlineDateStr} ({deadlineSec}s)</span>
              {isGraceState && (
                <>
                  <span className="text-on-surface-variant">24h Grace Deadline:</span>
                  <span className="text-on-surface font-mono font-bold text-amber-700">
                    {graceDateStr} ({graceSec}s)
                  </span>
                </>
              )}
            </div>
            <div className="text-[11px] text-neutral-500 font-mono mt-1">
              * Guidance text: Browser time ({new Date(nowSec * 1000).toLocaleTimeString()}) is advisory. Trusted chain-time on GenLayer Studio Next is authoritative for all deadlines.
            </div>

            {/* Outcome Triad */}
            <h3 className="font-headline-sm text-on-surface uppercase mb-4 mt-6 text-base">Outcome Triad</h3>
            <div className="grid grid-cols-[130px_1fr] gap-2 items-baseline">
              <span className="text-on-surface-variant">Fault:</span>
              <span className="text-on-surface">{job.fault || "none"}</span>
              <span className="text-on-surface-variant">Pay Downstream:</span>
              <span className="text-on-surface">{pdStr}</span>
              <span className="text-on-surface-variant">Slash BPS:</span>
              <span className="text-on-surface">{job.slash_bps?.toString() || "0"}</span>
              <span className="text-on-surface-variant">Reason:</span>
              <span className="text-on-surface break-words">{job.reason || "-"}</span>
            </div>
          </div>
        </div>

        {/* Actions & Outcomes Column */}
        <div className="space-y-6 bg-white border border-neutral-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-headline-sm uppercase text-lg mb-6">Actions</h3>
          
          {/* Cancel Action (OPEN or BONDED) */}
          {(job.state === "OPEN" || job.state === "BONDED") && isClient && (
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-3">
              <div className="text-xs font-semibold uppercase text-neutral-600">Client Cancellation</div>
              <p className="text-xs text-neutral-600">
                Cancel this job before execution. Full escrow (pay_b + pay_c + premium) will be refunded to Client A. Any reserved bond will be released back to Writer B.
              </p>
              <QuoteButton
                label="Cancel Job"
                fnName="cancel"
                jobId={job.id}
                variant="danger"
                onClick={async () => writes.cancel(client, job.id)}
                onSuccess={() => setRefresh(r => r + 1)}
              />
            </div>
          )}

          {/* Writer B Post Bond (OPEN) */}
          {job.state === "OPEN" && isWriter && (
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-4">
              <div>
                <span className="font-label-status text-xs font-bold text-primary block mb-1">
                  WRITER B: POST BOND
                </span>
                <p className="text-xs text-neutral-600 mb-3">
                  Post bond into your collateral vault. If available bond covers pay_c ({formatGen(job.pay_c)} GEN), this job will immediately transition to <strong>BONDED</strong>.
                </p>
                <label className="block text-[12px] font-label-code text-on-surface-variant mb-1">
                  Bond Amount to Post (GEN)
                </label>
                <input
                  suppressHydrationWarning
                  type="text"
                  className="w-full border border-neutral-300 rounded px-3 py-2 text-sm outline-none focus:border-primary font-label-code"
                  value={bondVal}
                  onChange={(e) => setBondVal(e.target.value)}
                />
                {bondError && (
                  <p className="text-[11px] text-error font-mono mt-1">
                    {bondError}
                  </p>
                )}
                {!bondError && shortfallBig > 0n && (
                  <p className="text-[11px] text-amber-700 font-mono mt-1">
                    Current shortfall: {formatGen(shortfallBig)} GEN. Defaulted input covers this shortfall.
                  </p>
                )}
              </div>
              <QuoteButton
                label={`Post ${bondVal} GEN Bond`}
                fnName="post_bond"
                value={isBondValid ? parsedBond! : 0n}
                disabled={!isBondValid}
                onClick={async () => {
                  if (!isBondValid || !parsedBond) throw new Error("Invalid bond amount");
                  return writes.postBond(client, parsedBond);
                }}
                onSuccess={() => setRefresh(r => r + 1)}
              />
            </div>
          )}

          {/* Writer B Submit Deliverable (BONDED) */}
          {job.state === "BONDED" && isWriter && (
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-4">
              <span className="font-label-status text-xs font-bold text-primary block">
                WRITER B: SUBMIT DELIVERABLE
              </span>
              <div>
                <label className="block text-[12px] font-label-code text-on-surface-variant mb-1">
                  Deliverable URL (HTTPS)
                </label>
                <input
                  suppressHydrationWarning
                  type="text"
                  className="w-full border border-neutral-300 rounded px-3 py-2 text-sm outline-none focus:border-primary font-label-code"
                  value={deliverable}
                  onChange={(e) => setDeliverable(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[12px] font-label-code text-on-surface-variant mb-1">
                  Deliverable Hash (SHA-256 hex or digest)
                </label>
                <input
                  suppressHydrationWarning
                  type="text"
                  placeholder="Optional SHA-256 hash of deliverable"
                  className="w-full border border-neutral-300 rounded px-3 py-2 text-sm outline-none focus:border-primary font-label-code"
                  value={deliverableHash}
                  onChange={(e) => setDeliverableHash(e.target.value)}
                />
              </div>
              <QuoteButton
                label="Submit Deliverable"
                fnName="submit"
                onClick={async () => writes.submit(client, job.id, deliverable, deliverableHash)}
                onSuccess={() => setRefresh(r => r + 1)}
              />
            </div>
          )}

          {/* Publisher C Ack Downstream (IN_FLIGHT) */}
          {job.state === "IN_FLIGHT" && isPublisher && (
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-4">
              <span className="font-label-status text-xs font-bold text-primary block">
                PUBLISHER C: ACKNOWLEDGE & PUBLISH
              </span>
              <p className="text-xs text-neutral-600">
                Acknowledge receipt of the deliverable from Writer B and optionally provide the public publication URL.
              </p>
              <div>
                <label className="block text-[12px] font-label-code text-on-surface-variant mb-1">
                  Publication URL (Optional HTTPS)
                </label>
                <input
                  suppressHydrationWarning
                  type="text"
                  placeholder="https://gist.githubusercontent.com/... (optional)"
                  className="w-full border border-neutral-300 rounded px-3 py-2 text-sm outline-none focus:border-primary font-label-code"
                  value={pubUrl}
                  onChange={(e) => setPubUrl(e.target.value)}
                />
              </div>
              <QuoteButton
                label="Ack Downstream"
                fnName="ack_downstream"
                onClick={async () => writes.ack(client, job.id, pubUrl)}
                onSuccess={() => setRefresh(r => r + 1)}
              />
            </div>
          )}

          {/* Adjudication (ACKED or UNDETERMINED) */}
          {(job.state === "ACKED" || job.state === "UNDETERMINED") && (
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-3">
              <div className="text-xs font-semibold uppercase text-primary">
                {job.state === "UNDETERMINED" ? "Retry Adjudication" : "Consensus Adjudication"}
              </div>
              <p className="text-xs text-neutral-600">
                Trigger decentralized LLM validator consensus on GenLayer Studio Next. Validators inspect brief and deliverable evidence to determine fault.
              </p>
              <QuoteButton
                label={job.state === "UNDETERMINED" ? "Retry Adjudication" : "Adjudicate"}
                fnName="adjudicate"
                jobId={job.id}
                variant="lime"
                onClick={async () => writes.adjudicate(client, job.id)}
                onSuccess={() => setRefresh(r => r + 1)}
              />
            </div>
          )}

          {/* Expire Action (Active States) */}
          {isActiveState && (
            <div className="p-4 bg-amber-50/60 rounded-lg border border-amber-200 space-y-3">
              <div className="text-xs font-semibold uppercase text-amber-900">
                Contract Expiry / Timeout
              </div>
              <p className="text-xs text-amber-800">
                {isGraceState ? (
                  <>
                    For {job.state} jobs, expiry requires the 24-hour settlement grace period to pass (
                    <code>{graceDateStr}</code>). Chain time enforces this check authoritative.
                  </>
                ) : (
                  <>
                    For {job.state} jobs, expiry requires the job deadline to pass (
                    <code>{deadlineDateStr}</code>). Chain time enforces this check authoritative.
                  </>
                )}
              </p>
              <QuoteButton
                label="Expire Job"
                fnName="expire"
                jobId={job.id}
                variant="ghost"
                onClick={async () => writes.expire(client, job.id)}
                onSuccess={() => setRefresh(r => r + 1)}
              />
            </div>
          )}

          {/* Settlement Outcome Displays */}
          {job.state === "SETTLED_RUG" && (
            <div className="space-y-4 text-sm font-label-code p-4 bg-lime-50 rounded-lg border border-lime-300">
              <h4 className="font-headline-sm text-lime-800 uppercase font-bold text-base">
                Settled Rug: Restitution Executed
              </h4>
              <ul className="list-disc pl-5 space-y-1.5 text-neutral-800 text-xs">
                <li>Client receives pay_b + pay_c restitution from escrow.</li>
                <li>Publisher receives pay_c from the affected job’s slashed reservation.</li>
                <li>Writer loses exactly that job reservation ({formatGen(job.pay_c)} GEN).</li>
                <li>Writer’s other bond and reservations remain untouched.</li>
                <li>Premium moves to pool.</li>
              </ul>
            </div>
          )}

          {job.state === "SETTLED_OK" && (
            <div className="space-y-4 text-sm font-label-code p-4 bg-lime-50 rounded-lg border border-lime-300">
              <h4 className="font-headline-sm text-lime-800 uppercase font-bold text-base">
                Settled OK: Successful Pipeline
              </h4>
              <ul className="list-disc pl-5 space-y-1.5 text-neutral-800 text-xs">
                <li>Writer receives pay_b ({formatGen(job.pay_b)} GEN).</li>
                <li>Publisher receives pay_c ({formatGen(job.pay_c)} GEN) from escrow.</li>
                <li>Writer’s job reservation is released back to available bond.</li>
                <li>Premium moves to pool.</li>
              </ul>
            </div>
          )}

          {job.state === "UNDETERMINED" && (
            <div className="space-y-4 text-sm font-label-code p-4 bg-amber-50 rounded-lg border border-amber-300">
              <h4 className="font-headline-sm text-amber-900 uppercase font-bold text-base">
                Undetermined: Settlement Grace Active
              </h4>
              <ul className="list-disc pl-5 space-y-1.5 text-neutral-800 text-xs">
                <li>Funds and reservation remain locked in the contract.</li>
                <li>Adjudication may be retried during the 24-hour grace period.</li>
                <li>After grace ({graceDateStr}), expire refunds full escrow and releases reservation.</li>
              </ul>
            </div>
          )}

          {job.state === "CANCELED" && (
            <div className="space-y-4 text-sm font-label-code p-4 bg-neutral-100 rounded-lg border border-neutral-300">
              <h4 className="font-headline-sm text-neutral-800 uppercase font-bold text-base">
                Job Canceled / Expired
              </h4>
              <p className="text-xs text-neutral-600">
                Reason: <strong>{job.reason || "Canceled before submission or expired."}</strong>
              </p>
            </div>
          )}

          {/* Pull-Payment Credits Notification */}
          {credits > 0n && (
            <div className="mt-6 pt-6 border-t border-neutral-200 space-y-4">
              <p className="text-sm text-on-surface font-label-code">
                You have <strong>{formatGen(credits)} GEN</strong> in credits.
              </p>
              <QuoteButton
                label={`Withdraw ${formatGen(credits)} GEN`}
                fnName="withdraw"
                onClick={async () => writes.withdraw(client)}
                onSuccess={() => setRefresh(r => r + 1)}
              />
            </div>
          )}

          {credits === 0n && job.state === "SETTLED_RUG" && isPublisher && (
            <div className="mt-6 pt-6 border-t border-neutral-200">
              <p className="text-xs text-on-surface font-label-code">
                pay_c paid on-chain (emit_transfer). Check wallet / <a href="/vault" className="text-primary underline">Collateral Vault</a>.
              </p>
            </div>
          )}

          {credits === 0n && job.state === "SETTLED_RUG" && isClient && (
            <div className="mt-6 pt-6 border-t border-neutral-200">
              <p className="text-xs text-on-surface font-label-code">
                Restitution (pay_b + pay_c) paid on-chain (emit_transfer). Check wallet / <a href="/vault" className="text-primary underline">Collateral Vault</a>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
