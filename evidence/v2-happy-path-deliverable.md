# Makewhole v2 Technical Surety Report

## 1. Protocol Roles
The Makewhole v2 intelligent contract coordinates three distinct, mutually exclusive roles:
- Client A: Creates the job, defines the public brief, and funds the complete upfront escrow.
- Writer B: Posts collateral to the contract vault, accepts the task assignment, and submits the deliverable.
- Publisher C: Downstream participant responsible for downstream delivery or propagation, whose payout is backstopped by the contract.

## 2. Escrow Structure
Upon job creation, Client A escrows the required funding in full. The escrow amount consists of:
- pay_b: Allocated reward payable to Writer B upon successful completion.
- pay_c: Allocated compensation payable to Publisher C upon successful completion or writer default.
- premium: Contract surety fee retained by the contract pool.
The total escrow locked in the contract for the job equals exactly pay_b + pay_c + premium.

## 3. Collateral Model & Per-Job Invariant
Writer B collateral is managed through three distinct on-chain accounting values:
- Total Bond: The entire collateral deposited by Writer B in the contract vault.
- Reserved Bond: Collateral currently locked to back active bonded jobs for Writer B.
- Available Bond: Unreserved collateral (Total Bond - Reserved Bond) eligible to back new jobs or be withdrawn via unbond.

For every bonded job, the contract enforces the strict per-job invariant:
job_reserved_bond == pay_c
This ensures that the downstream compensation owed to Publisher C is fully reserved in Writer B collateral before the job transitions to active execution.

## 4. Settlement Outcomes & Economics
The contract settles jobs through one of three deterministic outcomes:

### SETTLED_OK
When Writer B fulfills the brief:
- Writer B receives pay_b.
- Publisher C receives pay_c.
- The job's reserved bond is released back to Writer B's available bond.
- The premium accrues to the contract pool.

### SETTLED_RUG
When Writer B faults or breaches the brief:
- Exactly the affected job's reserved pay_c is slashed from Writer B's collateral.
- Client A receives restitution of pay_b + pay_c.
- Publisher C receives pay_c from the slashed collateral.
- The premium accrues to the contract pool.
- Any unrelated available writer collateral remains isolated and unaffected.

### UNDETERMINED
When evidence retrieval fails, returns an unapproved status, or hash verification fails:
- No settlement payout or slashing occurs.
- The escrow and bond reservation remain protected within the contract pending subsequent adjudication retry or deadline expiry.

## 5. Conclusion
Through isolated collateral reservation and automated consensus-driven settlement, Makewhole v2 ensures robust downstream protection: Publisher C is guaranteed compensation through reserved collateral even in the event of upstream writer fault.
