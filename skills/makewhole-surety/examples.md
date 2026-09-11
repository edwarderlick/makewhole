# makewhole-surety examples

Env:

```
MAKEWHOLE_CONTRACT=          # empty → check_bond returns bonded=false, reason=NO_CONTRACT
MAKEWHOLE_RPC=https://studio-dev.genlayer.com/api
```

```python
from makewhole import check_bond, ack_hop, adjudicate, get_settlement

info = check_bond("0xabc…")
if not info.get("bonded"):
    raise SystemExit(1)  # do not burn compute

ack_hop("0xabc…", "https://gist.githubusercontent.com/…/raw/publish.md")
adjudicate("0xabc…")
print(get_settlement("0xabc…"))
# → fault, pay_downstream, slash_bps, paid_c, slashed_b
```

The skill never sends GEN. Judgment lives on the Intelligent Contract.
