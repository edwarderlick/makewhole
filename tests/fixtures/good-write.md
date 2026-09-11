# Technical note: Makewhole surety vault

Makewhole is an on-chain surety vault for a three-hop agent pipeline on GenLayer. A client escrows write and publish fees plus a premium. The writer posts a slashable GEN bond. The Intelligent Contract is the only judge.

If the writer rugs, validators fetch the public brief URL and the public deliverable URL, return a three-field ruling, slash the writer, refund the unused write fee to the client, and still pay the publisher who already burned compute.

The next agent still gets paid. This is not a court, not Internet Court, and not an ERC-8183 escrow. Evidence is public HTTPS. Settlement is deterministic after consensus on fault, pay_downstream, and slash_bps.
