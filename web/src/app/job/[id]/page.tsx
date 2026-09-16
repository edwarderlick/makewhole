"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { views, writes, getQuote } from "@/lib/contract";
import { formatGen, parseGen } from "@/lib/format";
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
  value = 0n 
}: { 
  label: string, 
  fnName: string, 
  onClick: () => Promise<any>, 
  onSuccess?: () => void,
  value?: bigint 
}) {
  const { client } = useWallet();
  const [quoteStr, setQuoteStr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!client) return;
    (async () => {
      try {
        const quote = await getQuote(client, fnName);
        const fee = quote?.feeValue ?? quote?.fee_value;
        if (active && quote && fee != null) {
          const valStr = value > 0n ? `${formatGen(value)} GEN` : "0 GEN";
          setQuoteStr(`${label}: ${valStr} + network fees ~${formatGen(fee)} GEN (refunded)`);
        }
      } catch(e) {}
    })();
    return () => { active = false; };
  }, [client, fnName, value]);

  return <TxButton label={quoteStr || label} onClick={onClick} onSuccess={onSuccess} />;
}

import React from "react";
import { ConsensusModal } from "@/components/ConsensusModal";
import { formatGlError } from "@/lib/formatError";

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = params instanceof Promise ? React.use(params) : params;
  const id = (unwrappedParams as any).id;
  const { client, account } = useWallet();
  const router = useRouter();

  const [job, setJob] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [credits, setCredits] = useState<bigint>(0n);

  const [deliverable, setDeliverable] = useState("https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/rug-write.md");
  const [bondVal, setBondVal] = useState("0.25");
  const [refresh, setRefresh] = useState(0);

  async function load() {
    setErr(null);
    if (!client) return;
    if (!id || id === "undefined") {
      setErr("Missing job");
      return;
    }
    
    let resolvedId = id as string;
    
    try {
      if (resolvedId.length === 66) {
        let ids: string[] = [];
        try {
          ids = (await views.listIds(client)) || [];
        } catch(e) {}
        
        if (ids.length > 0 && !ids.includes(resolvedId)) {
           resolvedId = ids[ids.length - 1];
           window.history.replaceState({}, "", `/job/${resolvedId}`);
        }
      }
    } catch(e) {}

    try {
      const j = await views.getJob(client, resolvedId);
      if (!j) throw new Error("Job not found");
      setJob(j);
      
      if (account) {
        const cred = await views.getCredit(client, account);
        setCredits(BigInt(cred || 0));
      }
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("Job not found") || msg.includes("UserError") || msg.includes("execution failed")) {
        setErr("Job not found");
      } else {
        setErr(msg || "Not found");
      }
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 border-b border-surface-variant pb-8">
        <div className="flex items-center gap-4 mb-2">
          <h1 className="font-headline-md text-3xl tracking-tight text-on-surface uppercase">Job {job.id.slice(0, 10)}...</h1>
          <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-label-status uppercase">
            {job.state}
          </span>
          <span className="bg-secondary-container text-on-secondary-fixed px-3 py-1 rounded-full text-xs font-label-status uppercase">
            Connected as {chipLabel}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <div className="bg-surface rounded-xl p-6 border border-surface-variant space-y-4 font-label-code text-sm">
            <h3 className="font-headline-sm text-on-surface uppercase mb-4 text-base">Roles</h3>
            <div className="grid grid-cols-[100px_1fr] gap-2 items-baseline">
              <span className="text-on-surface-variant">Client A:</span>
              <span className="truncate text-on-surface">{job.client}</span>
              <span className="text-on-surface-variant">Writer B:</span>
              <span className="truncate text-on-surface">{job.writer}</span>
              <span className="text-on-surface-variant">Publisher C:</span>
              <span className="truncate text-on-surface">{job.publisher}</span>
            </div>
            
            {isClient && job.state === "OPEN" && (
              <div className="mt-4 p-4 bg-error/10 text-error rounded-md text-[12px]">
                You are Client A (this wallet created the job). Switch MetaMask to Writer B {job.writer.slice(0,10)}... to post the bond.
              </div>
            )}
            
            <h3 className="font-headline-sm text-on-surface uppercase mb-4 mt-6 text-base">Escrow</h3>
            <div className="grid grid-cols-[100px_1fr] gap-2 items-baseline">
              <span className="text-on-surface-variant">pay_b:</span>
              <span className="text-on-surface">{formatGen(job.pay_b)} GEN</span>
              <span className="text-on-surface-variant">pay_c:</span>
              <span className="text-on-surface">{formatGen(job.pay_c)} GEN</span>
              <span className="text-on-surface-variant">premium:</span>
              <span className="text-on-surface">{formatGen(job.premium)} GEN</span>
            </div>

            <h3 className="font-headline-sm text-on-surface uppercase mb-4 mt-6 text-base">Outcome Triad</h3>
            <div className="grid grid-cols-[130px_1fr] gap-2 items-baseline">
              <span className="text-on-surface-variant">Fault:</span>
              <span className="text-on-surface">{job.fault || "none"}</span>
              <span className="text-on-surface-variant">Pay Downstream:</span>
              <span className="text-on-surface">{pdStr}</span>
              <span className="text-on-surface-variant">Slash BPS:</span>
              <span className="text-on-surface">{job.slash_bps?.toString() || "10000"}</span>
              <span className="text-on-surface-variant">Reason:</span>
              <span className="text-on-surface break-words">{job.reason || "-"}</span>
            </div>
          </div>
        </div>

        <div className="space-y-6 bg-white border border-neutral-200 rounded-xl p-6">
          <h3 className="font-headline-sm uppercase text-lg mb-6">Actions</h3>
          
          {(job.state === "OPEN" || job.state === "BONDED") && isClient && (
              <QuoteButton
                label="Cancel"
                fnName="cancel"
                onClick={async () => {
                  const res = await writes.cancel(client, job.id);
                  return res;
                }}
                onSuccess={() => setRefresh(r => r + 1)}
              />
          )}

          {job.state === "OPEN" && isWriter && (
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-label-code text-on-surface-variant mb-1">Bond Amount (GEN)</label>
                <input
                  suppressHydrationWarning
                  type="text"
                  className="w-full border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary font-label-code"
                  value={bondVal}
                  onChange={(e) => setBondVal(e.target.value)}
                />
              </div>
              <QuoteButton
                label="Bond"
                fnName="post_bond"
                value={parseGen(bondVal)}
                onClick={async () => {
                  const res = await writes.postBond(client, job.id, parseGen(bondVal));
                  return res;
                }}
                onSuccess={() => setRefresh(r => r + 1)}
              />
            </div>
          )}

          {job.state === "BONDED" && isWriter && (
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-label-code text-on-surface-variant mb-1">Deliverable URL (gist)</label>
                <input
                  suppressHydrationWarning
                  type="text"
                  className="w-full border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary font-label-code"
                  value={deliverable}
                  onChange={(e) => setDeliverable(e.target.value)}
                />
              </div>
              <QuoteButton
                label="Submit"
                fnName="submit"
                onClick={async () => {
                  const res = await writes.submit(client, job.id, deliverable, "");
                  return res;
                }}
                onSuccess={() => setRefresh(r => r + 1)}
              />
            </div>
          )}

          {job.state === "IN_FLIGHT" && isPublisher && (
            <QuoteButton
              label="Ack Downstream"
              fnName="ack_downstream"
              onClick={async () => {
                const res = await writes.ack(client, job.id);
                return res;
              }}
              onSuccess={() => setRefresh(r => r + 1)}
            />
          )}

          {(job.state === "ACKED") && (
            <div className="space-y-4">
              <QuoteButton
                label="Adjudicate"
                fnName="adjudicate"
                onClick={async () => {
                  const res = await writes.adjudicate(client, job.id);
                  return res;
                }}
                onSuccess={() => setRefresh(r => r + 1)}
              />
            </div>
          )}

          {job.state === "SETTLED_RUG" && (
            <div className="space-y-4 text-sm font-label-code">
              <h4 className="font-headline-sm text-lime-600 uppercase mb-2">Writer B slashed. Publisher C made whole.</h4>
              <ul className="list-disc pl-5 space-y-1 text-on-surface">
                <li>Fault B &middot; slash 100%</li>
                <li>Pay downstream: Yes &rarr; C receives pay_c ({formatGen(job.pay_c)} GEN)</li>
                <li>Client A: unused pay_b ({formatGen(job.pay_b)} GEN) refunded</li>
                <li>Premium stays with the pool</li>
                <li>Writer B: remaining bond slashed</li>
              </ul>

            </div>
          )}

          {job.state === "SETTLED_OK" && (
            <div className="space-y-4 text-sm font-label-code">
              <h4 className="font-headline-sm text-lime-600 uppercase mb-2">Settled OK</h4>
              <p className="text-on-surface">B and C paid, no slash.</p>
            </div>
          )}

          {job.state === "UNDETERMINED" && (
            <div className="space-y-4 text-sm font-label-code">
              <h4 className="font-headline-sm text-error uppercase mb-2">Undetermined</h4>
              <p className="text-on-surface">No GEN moved; expire/timeout if those methods exist.</p>
            </div>
          )}

          {job.state === "CANCELED" && (
            <div className="space-y-4 text-sm font-label-code">
              <h4 className="font-headline-sm text-error uppercase mb-2">Canceled</h4>
              <p className="text-on-surface">Job was canceled.</p>
            </div>
          )}

          {credits > 0n && (
            <div className="mt-6 pt-6 border-t border-surface-variant space-y-4">
              <p className="text-sm text-on-surface font-label-code">You have <strong>{formatGen(credits)} GEN</strong> in credits.</p>
              <QuoteButton
                label={`Withdraw ${formatGen(credits)} GEN`}
                fnName="withdraw"
                onClick={async () => {
                  const res = await writes.withdraw(client);
                  return res;
                }}
                onSuccess={() => setRefresh(r => r + 1)}
              />
            </div>
          )}

          {credits === 0n && job.state === "SETTLED_RUG" && isPublisher && (
            <div className="mt-6 pt-6 border-t border-surface-variant">
              <p className="text-sm text-on-surface font-label-code">
                pay_c paid on-chain (emit_transfer). Check wallet / <a href="/vault" className="text-primary underline">My Vault</a>.
              </p>
            </div>
          )}

          {credits === 0n && job.state === "SETTLED_RUG" && isClient && (
            <div className="mt-6 pt-6 border-t border-surface-variant">
              <p className="text-sm text-on-surface font-label-code">
                unused pay_b paid on-chain (emit_transfer). Check wallet / <a href="/vault" className="text-primary underline">My Vault</a>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
