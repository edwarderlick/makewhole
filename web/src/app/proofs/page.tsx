"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { views, writes } from "@/lib/contract";
import { formatGen, shortAddr } from "@/lib/format";
import { TxButton } from "@/components/TxButton";
import { PageHero } from "@/components/PageHero";
import Link from "next/link";

export default function ProofsPage() {
  const { client, account } = useWallet();
  const [credit, setCredit] = useState<any>(0);
  const [rugs, setRugs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let live = true;
    async function load() {
    try {
      if (account) {
        setCredit(await views.getCredit(client, account));
      }
      
      
      const ids: string[] = await views.listIds(client);
      const jobs: any[] = [];
      for (const id of ids) {
        if (!live) break;
        try {
          jobs.push(await views.getJob(client, id));
        } catch {
          // skip
        }
      }
      
      const rugJobs = jobs.filter((j) => j && j.state === "SETTLED_RUG");
      // Just keep the last 5 for proof
      if (live) {
        setRugs(rugJobs.slice(-5).reverse());
        setLoading(false);
      }
    } catch {
      if (live) setLoading(false);
    }
  }
  load();
  return () => { live = false; };
  }, [client, account, refreshTick]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHero
        kicker="SEC_04 // PROOFS"
        title="Proofs & Vault"
        lede="Verifiable slashes and adjudications. If your agent is rugged, your bond pays out the downstream. Check your credits below."
      />

      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <div className="border border-neutral-200 rounded-xl p-6 bg-white space-y-3">
          <div className="font-label-status text-label-status">CREDITS</div>
          <div className="font-headline-md mt-1">{formatGen(credit)} GEN</div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            If a native EOA payout could not complete, GEN lands here.
          </p>
          <TxButton label="withdraw" onClick={() => writes.withdraw(client).then((t) => { setRefreshTick(r => r + 1); return t; })} />
        </div>
      </div>

      <div className="mt-12 space-y-4">
        <h3 className="font-bold tracking-widest uppercase mb-6 text-sm border-b border-gray-200 pb-2">Recent Settled Rugs</h3>
        {loading && <div className="text-xs font-mono text-gray-500 animate-pulse">Scanning chain...</div>}
        {!loading && rugs.length === 0 && <div className="text-xs font-mono text-gray-500">No SETTLED_RUG jobs found on this contract yet.</div>}
        
        {rugs.map((job) => (
          <div key={job.id} className="bg-white border border-red-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-red-100 pb-3 mb-4">
               <div className="flex items-center space-x-3">
                 <span className="font-mono text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                   SETTLED_RUG
                 </span>
                 <span className="font-mono text-xs text-gray-500">{job.id}</span>
               </div>
               <Link href={`/job/${job.id}`} className="text-[10px] uppercase font-bold tracking-wider hover:underline">
                 View Job ↗
               </Link>
            </div>
            
            <div className="grid grid-cols-3 gap-4 text-sm font-mono mb-4">
               <div>
                  <div className="text-[10px] text-gray-500 mb-1">FAULT</div>
                  <div className="font-bold text-red-600">Writer {job.fault}</div>
               </div>
               <div>
                  <div className="text-[10px] text-gray-500 mb-1">SLASHED BOND</div>
                  <div className="font-bold">{formatGen(job.slashed_b)} GEN</div>
               </div>
               <div>
                  <div className="text-[10px] text-gray-500 mb-1">PAID C</div>
                  <div className="font-bold text-lime-600">{formatGen(job.paid_c)} GEN</div>
               </div>
            </div>
            
            <div className="bg-gray-50 p-3 rounded text-[11px] font-mono text-gray-600 space-y-1">
               <div className="flex justify-between border-b border-gray-200 pb-1">
                 <span>Writer B slashed. Publisher C made whole.</span>
               </div>
               <div className="pt-1">
                 Adjudicate outcome: {job.reason}
               </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
