"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { views } from "@/lib/contract";
import { formatGen } from "@/lib/format";
import { PageHero } from "@/components/PageHero";

export default function EconomicsPage() {
  const { client } = useWallet();
  const [eco, setEco] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    views
      .getEconomics(client)
      .then(setEco)
      .catch((e) => setErr(e?.message || "read failed"));
  }, [client]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHero
        kicker="SURETY VAULT ECONOMICS — V2 RESTITUTION & RESERVATION MODEL"
        title="Protocol Economics"
        lede="Makewhole v2 enforces a strict per-job collateral reservation model. Every job entering BONDED holds 1:1 dedicated bond reservation equal to pay_c. In a writer rug, client A receives full restitution (pay_b + pay_c) from escrow, and publisher C is paid from the writer’s slashed reservation."
      />

      {err && <p className="font-label-code text-label-code text-error mb-6">{err}</p>}

      {/* Live Economics Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-10">
        <Stat k="pool" v={formatGen(eco?.pool ?? 0)} />
        <Stat k="locked_bonds" v={formatGen(eco?.locked_bonds ?? 0)} />
        <Stat k="locked_jobs" v={formatGen(eco?.locked_jobs ?? 0)} />
        <Stat k="credits" v={formatGen(eco?.credits ?? 0)} />
        <Stat k="slash_count" v={String(eco?.slash_count ?? 0)} />
        <Stat k="settled_ok" v={String(eco?.settled_ok ?? 0)} />
        <Stat k="settled_rug" v={String(eco?.settled_rug ?? 0)} />
      </div>

      {/* Payout Table */}
      <div className="border border-neutral-200 rounded-xl p-6 bg-white shadow-sm mb-10">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-200">
          <span className="font-label-status text-xs font-bold text-primary tracking-wider">
            COMPLETE SETTLEMENT & EXPIRY PAYOUT MATRIX
          </span>
          <span className="text-[11px] font-mono text-neutral-400">Escrow = pay_b + pay_c + premium</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body-sm text-xs">
            <thead>
              <tr className="font-label-code text-[11px] border-b border-neutral-200 text-neutral-500 uppercase">
                <th className="py-2.5 px-3">Lifecycle Outcome</th>
                <th className="py-2.5 px-3">Client A</th>
                <th className="py-2.5 px-3">Writer B</th>
                <th className="py-2.5 px-3">Publisher C</th>
                <th className="py-2.5 px-3">Protocol Pool</th>
                <th className="py-2.5 px-3">Collateral Accounting</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-mono">
              <tr className="hover:bg-neutral-50">
                <td className="py-3 px-3 font-bold text-lime-700">SETTLED_OK</td>
                <td className="py-3 px-3 text-neutral-500">—</td>
                <td className="py-3 px-3 text-primary font-bold">+pay_b</td>
                <td className="py-3 px-3 text-primary font-bold">+pay_c (escrow)</td>
                <td className="py-3 px-3 text-neutral-700">+premium</td>
                <td className="py-3 px-3 text-neutral-600 font-sans text-xs">Reservation released back to available bond.</td>
              </tr>
              <tr className="hover:bg-neutral-50">
                <td className="py-3 px-3 font-bold text-red-700">SETTLED_RUG</td>
                <td className="py-3 px-3 text-primary font-bold">+pay_b + pay_c (restitution)</td>
                <td className="py-3 px-3 text-error font-bold">-pay_c (slashed)</td>
                <td className="py-3 px-3 text-primary font-bold">+pay_c (from slashed bond)</td>
                <td className="py-3 px-3 text-neutral-700">+premium</td>
                <td className="py-3 px-3 text-neutral-600 font-sans text-xs">Affected job’s reservation slashed. Other bond remains safe.</td>
              </tr>
              <tr className="hover:bg-neutral-50">
                <td className="py-3 px-3 font-semibold text-neutral-800">OPEN expiry</td>
                <td className="py-3 px-3 text-primary font-bold">100% escrow refund</td>
                <td className="py-3 px-3 text-neutral-500">—</td>
                <td className="py-3 px-3 text-neutral-500">—</td>
                <td className="py-3 px-3 text-neutral-500">—</td>
                <td className="py-3 px-3 text-neutral-600 font-sans text-xs">No bond was reserved. Job cancelled cleanly.</td>
              </tr>
              <tr className="hover:bg-neutral-50">
                <td className="py-3 px-3 font-semibold text-neutral-800">BONDED expiry</td>
                <td className="py-3 px-3 text-primary font-bold">100% escrow refund</td>
                <td className="py-3 px-3 text-neutral-700">Reservation released</td>
                <td className="py-3 px-3 text-neutral-500">—</td>
                <td className="py-3 px-3 text-neutral-500">—</td>
                <td className="py-3 px-3 text-neutral-600 font-sans text-xs">Writer missed submission; deadline expired before submit.</td>
              </tr>
              <tr className="hover:bg-neutral-50">
                <td className="py-3 px-3 font-semibold text-neutral-800">IN_FLIGHT expiry</td>
                <td className="py-3 px-3 text-primary font-bold">100% escrow refund</td>
                <td className="py-3 px-3 text-error font-bold">-pay_c (slashed)</td>
                <td className="py-3 px-3 text-primary font-bold">+pay_c (from slashed bond)</td>
                <td className="py-3 px-3 text-neutral-500">—</td>
                <td className="py-3 px-3 text-neutral-600 font-sans text-xs">Downstream publisher compensated from slashed reservation.</td>
              </tr>
              <tr className="hover:bg-neutral-50">
                <td className="py-3 px-3 font-semibold text-neutral-800">ACKED/UNDETERMINED expiry</td>
                <td className="py-3 px-3 text-primary font-bold">100% escrow refund</td>
                <td className="py-3 px-3 text-neutral-700">Reservation released</td>
                <td className="py-3 px-3 text-neutral-500">—</td>
                <td className="py-3 px-3 text-neutral-500">—</td>
                <td className="py-3 px-3 text-neutral-600 font-sans text-xs">Expiry valid only after 24-hour settlement grace has passed.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Core V2 Economic Principles */}
      <div className="border border-neutral-200 rounded-xl p-8 bg-white shadow-sm space-y-6">
        <h2 className="font-headline-sm text-lg font-bold text-primary">
          Approved Makewhole v2 Economic Model
        </h2>
        <div className="grid md:grid-cols-2 gap-6 text-sm text-neutral-700">
          <div className="space-y-4">
            <div>
              <strong className="text-primary block mb-1">Exact Escrow Deposit</strong>
              Client escrow must equal exactly <code>pay_b + pay_c + premium</code>. There is no partial deposit or floating debt.
            </div>
            <div>
              <strong className="text-primary block mb-1">Exact Per-Job Reservation</strong>
              A job transitions from <code>OPEN</code> to <code>BONDED</code> only when writer B has sufficient available bond to reserve exactly <code>pay_c</code>. Undercollateralized jobs cannot become bonded.
            </div>
            <div>
              <strong className="text-primary block mb-1">Client Restitution on Rug</strong>
              In <code>SETTLED_RUG</code>, Client A receives full restitution of <code>pay_b + pay_c</code> from escrow. Publisher C receives <code>pay_c</code> directly from writer B’s slashed reservation.
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <strong className="text-primary block mb-1">Pool Independence</strong>
              The protocol pool receives non-refundable premiums on completion and rug settlements. The pool does not backstop or subsidize undercollateralized jobs.
            </div>
            <div>
              <strong className="text-primary block mb-1">Targeted Slashing & Unbonding</strong>
              Writers may unbond available collateral at any time without waiting for active jobs to finish. A rug slashes only the affected job’s reservation; untouched collateral remains intact.
            </div>
            <div>
              <strong className="text-primary block mb-1">24-Hour Settlement Grace Period</strong>
              In <code>ACKED</code> or <code>UNDETERMINED</code> states, validators or parties have 24 hours of settlement grace to reach consensus before expiry can refund escrow.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
      <div className="font-label-code text-[11px] text-neutral-500 uppercase tracking-wider">{k}</div>
      <div className="font-headline-md text-xl font-bold mt-1 text-primary">{v}</div>
    </div>
  );
}
