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
      <PageHero kicker="YIELD IS NOT A PRODUCT — LIVE get_economics" title="Economics" />
      {err && <p className="font-label-code text-label-code text-error mb-6">{err}</p>}
      <div className="grid md:grid-cols-3 gap-4">
        <Stat k="pool" v={formatGen(eco?.pool ?? 0)} />
        <Stat k="locked_bonds" v={formatGen(eco?.locked_bonds ?? 0)} />
        <Stat k="locked_jobs" v={formatGen(eco?.locked_jobs ?? 0)} />
        <Stat k="credits" v={formatGen(eco?.credits ?? 0)} />
        <Stat k="slash_count" v={String(eco?.slash_count ?? 0)} />
        <Stat k="settled_ok" v={String(eco?.settled_ok ?? 0)} />
        <Stat k="settled_rug" v={String(eco?.settled_rug ?? 0)} />
      </div>
      <div className="mt-8 border border-neutral-200 rounded-xl p-6 bg-white">
        <div className="font-label-status">PAYOUT TABLE</div>
        <table className="w-full mt-pad-md text-left font-body-sm">
          <thead>
            <tr className="font-label-code text-[11px]">
              <th className="py-pad-xs">State</th>
              <th>A</th>
              <th>B</th>
              <th>C</th>
              <th>Pool</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-pad-xs">SETTLED_OK</td>
              <td>—</td>
              <td>pay_b</td>
              <td>pay_c</td>
              <td>+premium</td>
            </tr>
            <tr>
              <td className="py-pad-xs">SETTLED_RUG</td>
              <td>+pay_b</td>
              <td>bond slashed</td>
              <td>pay_c (bond then pool)</td>
              <td>+premium + slash</td>
            </tr>
            <tr>
              <td className="py-pad-xs">UNDETERMINED</td>
              <td colSpan={4}>no GEN moves</td>
            </tr>
            <tr>
              <td className="py-pad-xs">CANCELED</td>
              <td>100% escrow</td>
              <td>bond stays</td>
              <td>—</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="font-label-code text-[11px] text-on-surface-variant">{k}</div>
      <div className="font-headline-md mt-pad-xs">{v}</div>
    </div>
  );
}
