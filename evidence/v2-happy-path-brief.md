# Makewhole v2 Verification Brief: Technical Surety Specifications

## Objective
Provide an exact technical report titled "Makewhole v2 Technical Surety Report" documenting the operational and economic specifications of the Makewhole v2 intelligent contract.

## Required Sections and Specifications
The deliverable must be titled exactly "Makewhole v2 Technical Surety Report" and must cover:

1. Protocol Roles:
   - Detail the distinct roles of Client A (job creator and funder), Writer B (bonded task executor), and Publisher C (downstream recipient and publisher).

2. Escrow Structure:
   - Explain the upfront escrow deposited by Client A upon job creation, consisting of pay_b + pay_c + premium.

3. Collateral Model & Per-Job Invariant:
   - Explain the three collateral metrics tracked for Writer B: total bond, reserved bond, and available bond.
   - Explain the explicit per-job invariant enforced by the contract: job_reserved_bond == pay_c.

4. Settlement Outcomes & Economics:
   - SETTLED_OK: Explain the payouts when the deliverable fulfills the brief (Writer B receives pay_b, Publisher C receives pay_c, the job's reserved bond is released, and premium accrues to the contract pool).
   - SETTLED_RUG: Explain the restitution and slashing rules when Writer B faults (exactly the affected job's reserved pay_c is slashed, Client A receives restitution of pay_b + pay_c, Publisher C receives pay_c from the slashed collateral, premium accrues to the contract pool, and unrelated available writer collateral remains isolated).
   - UNDETERMINED: Explain the fail-closed behavior when evidence is unavailable, malformed, or ambiguous (no settlement payout or slashing occurs, and escrow and reservation remain protected pending retry or expiry).

5. Conclusion:
   - Provide a concise conclusion explaining how the protocol ensures downstream protection for Publisher C.
