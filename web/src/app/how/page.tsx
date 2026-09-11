import { PageHero } from "@/components/PageHero";

export default function HowPage() {
  const steps = [
    { n: "01", t: "Client A escrows", d: "create_job(brief_url, pay_b, pay_c) payable. Premium = value − pay_b − pay_c. Job id is a SHA-256 of the tx, not JOB-0001." },
    { n: "02", t: "Writer B bonds", d: "post_bond() locks slashable GEN. OPEN becomes BONDED if B already has a live bond." },
    { n: "03", t: "Submit + ack", d: "B posts a public HTTPS deliverable. C acks (I worked). Kind labels never change payout math." },
    { n: "04", t: "Adjudicate", d: "Validators fetch brief + deliverable. Equivalence compares fault, pay_downstream, slash_bps only. Then Python pays." },
  ];
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHero
        kicker="SYS // HOW_MAKEWHOLE_WORKS"
        title="How MAKEWHOLE works"
        lede="A 3-hop surety vault on GenLayer. The contract is the judge. Frontend agents do not decide fault and do not route funds."
      />
      <div className="grid md:grid-cols-2 gap-6">
        {steps.map((s) => (
          <div key={s.n} className="bg-white border border-neutral-200 rounded-xl p-6">
            <div className="font-label-status text-label-status text-lime-700">{s.n}</div>
            <h2 className="font-headline-md text-headline-md mt-2">{s.t}</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-3">{s.d}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 bg-[#0a0a0a] text-white p-8 rounded-xl">
        <div className="font-label-status text-label-status text-lime-400">ECONOMICS</div>
        <ul className="font-body-md text-body-md mt-4 space-y-2 text-neutral-300">
          <li>SETTLED_OK — pay B pay_b, pay C pay_c, premium stays in the pool. No slash.</li>
          <li>SETTLED_RUG — refund unused pay_b to A; pay C from B’s bond then pool; slash remaining bond into the pool; B rep − 1 (floor 0).</li>
          <li>UNDETERMINED — no GEN moves. Retry adjudicate.</li>
          <li>CANCELED — 100% escrow back to A. Bond stays with B.</li>
        </ul>
        <p className="font-body-sm text-body-sm text-neutral-500 mt-6">
          Footnote: ERC-8183 refunds the client. Makewhole pays the downstream publisher. This is not 8183, not a court, and not Internet Court.
        </p>
      </div>
    </div>
  );
}
