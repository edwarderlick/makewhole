import { PageHero } from "@/components/PageHero";

export default function HowPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-24">
      <PageHero
        kicker="GUIDE"
        title="Walkthrough"
        lede="How to test the 3-hop pipeline locally using MetaMask."
      />

      <div className="space-y-12 text-on-surface">
        <section className="space-y-4">
          <h2 className="font-headline-md text-headline-md mt-2 border-b border-outline-variant pb-2">1. Setup</h2>
          <p className="font-body-md">
            Create three accounts in MetaMask:
            <br />• <strong>Account 1 = Client A</strong> (whoever clicks Create)
            <br />• <strong>Account 2 = Writer B</strong>
            <br />• <strong>Account 3 = Publisher C</strong>
          </p>
          <p className="font-body-md mt-2">
            State clearly: MetaMask total = escrow/bond + network fees. Unused fees refund.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-headline-md text-headline-md mt-2 border-b border-outline-variant pb-2">2. Create as Client A</h2>
          <p className="font-body-md">
            Connect as <strong>Account 1</strong> (Client A). Navigate to <code>/create</code>.
          </p>
          <ul className="list-disc pl-5 font-label-code text-sm space-y-2">
            <li>Brief URL: <code>https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/brief.md</code></li>
            <li>Writer B (0x): Paste Account 2's address (must differ from A)</li>
            <li>Publisher C (0x): Paste Account 3's address</li>
            <li>Set Pay B: 0.20 GEN, Pay C: 0.20 GEN, Premium: 0.05 GEN, Deadline: 15m.</li>
            <li>Click <strong>Escrow create_job</strong> and wait until you are routed to <code>/job/&#123;id&#125;</code>.</li>
            <li>Ensure the role chip says <strong>Connected as Client A</strong> and the state is <strong>OPEN</strong>.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="font-headline-md text-headline-md mt-2 border-b border-outline-variant pb-2">3. Bond & Submit as Writer B</h2>
          <p className="font-body-md">
            Switch your MetaMask to the <strong>EXACT Writer B hex</strong> (Account 2).
          </p>
          <ul className="list-disc pl-5 font-label-code text-sm space-y-2">
            <li>The role chip updates to <strong>Connected as Writer B</strong>.</li>
            <li>Click <strong>Bond</strong> (0.20 GEN minimum).</li>
            <li>Once BONDED, paste the full URL: <code>https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/rug-write.md</code></li>
            <li>Click <strong>Submit</strong>. State becomes IN_FLIGHT.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="font-headline-md text-headline-md mt-2 border-b border-outline-variant pb-2">4. Ack & Adjudicate</h2>
          <ul className="list-disc pl-5 font-label-code text-sm space-y-2">
            <li>Switch to Account 3 (Publisher C). Click <strong>Ack Downstream</strong>. State becomes ACKED.</li>
            <li>Switch back to Account 1 (Client A). Click <strong>Adjudicate</strong>.</li>
            <li>Because you submitted a rug, the state will settle to <strong>SETTLED_RUG</strong>!</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
