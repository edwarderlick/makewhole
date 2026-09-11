"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { views, writes } from "@/lib/contract";
import { formatGen, parseGen } from "@/lib/format";
import { TxButton } from "@/components/TxButton";
import { PageHero } from "@/components/PageHero";

export default function VaultPage() {
  const { client, account } = useWallet();
  const [eco, setEco] = useState<any>(null);
  const [bond, setBond] = useState<any>(0);
  const [credit, setCredit] = useState<any>(0);
  const [rep, setRep] = useState<any>(0);
  const [poolIn, setPoolIn] = useState("10");
  const [bondIn, setBondIn] = useState("50");

  async function load() {
    try {
      setEco(await views.getEconomics(client));
      if (account) {
        setBond(await views.getBond(client, account));
        setCredit(await views.getCredit(client, account));
        setRep(await views.getRep(client, account));
      }
    } catch {
      /* empty contract is fine */
    }
  }
  useEffect(() => {
    load();
  }, [client, account]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHero
        kicker="SEC_04 // VAULT_TELEMETRY"
        title="My vault"
        lede="Live views only. Connect a wallet to deposit, bond, or withdraw credits. Empty-address zeros are honest."
      />
      <div className="grid md:grid-cols-4 gap-4">
        <Card k="POOL" v={formatGen(eco?.pool ?? 0)} />
        <Card k="YOUR BOND" v={formatGen(bond)} />
        <Card k="YOUR CREDITS" v={formatGen(credit)} />
        <Card k="YOUR REP" v={String(rep ?? 0)} />
      </div>
      <div className="grid md:grid-cols-3 gap-6 mt-8">
        <div className="border border-neutral-200 rounded-xl p-6 bg-white space-y-3">
          <div className="font-label-status text-label-status">UNDERWRITE</div>
          <input className="w-full border border-neutral-200 rounded-md px-3 py-2 font-label-code text-label-code" value={poolIn} onChange={(e) => setPoolIn(e.target.value)} />
          <TxButton label="fund_pool" variant="lime" onClick={() => writes.fundPool(client, parseGen(poolIn)).then((t) => { load(); return t; })} />
        </div>
        <div className="border border-neutral-200 rounded-xl p-6 bg-white space-y-3">
          <div className="font-label-status text-label-status">WRITER BOND</div>
          <input className="w-full border border-neutral-200 rounded-md px-3 py-2 font-label-code text-label-code" value={bondIn} onChange={(e) => setBondIn(e.target.value)} />
          <TxButton label="post_bond" variant="lime" onClick={() => writes.postBond(client, parseGen(bondIn)).then((t) => { load(); return t; })} />
          <TxButton label="unbond" variant="ghost" onClick={() => writes.unbond(client).then((t) => { load(); return t; })} />
        </div>
        <div className="border border-neutral-200 rounded-xl p-6 bg-white space-y-3">
          <div className="font-label-status text-label-status">CREDITS</div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">If a native EOA payout could not complete, GEN lands here.</p>
          <TxButton label="withdraw" onClick={() => writes.withdraw(client).then((t) => { load(); return t; })} />
        </div>
      </div>
    </div>
  );
}

function Card({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="font-label-code text-label-code text-on-surface-variant">{k}</div>
      <div className="font-headline-md text-headline-md mt-1">{v}</div>
    </div>
  );
}
