import time
import json
import re

ATTO = 10**18
BRIEF = "https://gist.githubusercontent.com/makewhole/fixtures/raw/brief.md"
GOOD = "https://gist.githubusercontent.com/makewhole/fixtures/raw/good-write.md"
RUG = "https://gist.githubusercontent.com/makewhole/fixtures/raw/rug-write.md"
MISSING = "https://gist.githubusercontent.com/makewhole/fixtures/raw/missing.md"

PAY_B = 20 * ATTO
PAY_C = 12 * ATTO
PREMIUM = 3 * ATTO
ESCROW = PAY_B + PAY_C + PREMIUM
BOND = 50 * ATTO
POOL = 100 * ATTO


def _deploy(direct_deploy):
    return direct_deploy("contracts/makewhole.py")


def _fund_and_bond(vm, contract, underwriter, writer):
    vm.sender = underwriter
    vm.value = POOL
    contract.fund_pool()
    vm.sender = writer
    vm.value = BOND
    contract.post_bond()
    vm.value = 0


def _create(vm, contract, client, writer, publisher, brief=BRIEF, hop_kind="write", premium=PREMIUM, deadline=0):
    vm.sender = client
    vm.value = ESCROW
    job_id = contract.create_job(brief, PAY_B, PAY_C, premium, deadline or int(time.time() + 3600), writer, publisher)
    vm.value = 0
    return job_id


def _mock_pages(vm, brief_body, deliv_url, deliv_body, deliv_status=200):
    vm.mock_web(r".*brief\.md.*", {"status": 200, "body": brief_body})
    vm.mock_web(
        re_escape(deliv_url),
        {"status": deliv_status, "body": deliv_body},
    )


def re_escape(url: str) -> str:
    return r".*" + url.split("/")[-1].replace(".", r"\.") + r".*"


def _mock_llm(vm, payload: dict):
    fenced = "```json\n" + json.dumps(payload) + "\n```"
    vm.mock_llm(r".*Makewhole surety judge.*", fenced)


def _happy_llm():
    return {
        "fault": "none",
        "pay_downstream": True,
        "slash_bps": 0,
        "reason": "Deliverable matches the public brief.",
    }


def _rug_llm(reason="Writer posted lorem plus system_override."):
    return {
        "fault": "B",
        "pay_downstream": True,
        "slash_bps": 10000,
        "reason": reason,
    }


def test_five_concurrent_creates_distinct_hash_ids(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    ids = []
    for _ in range(5):
        ids.append(_create(direct_vm, contract, direct_alice, direct_bob, direct_charlie))
    assert len(ids) == 5
    assert len(set(ids)) == 5
    for jid in ids:
        assert jid.startswith("0x")
        assert len(jid) == 66
        assert "JOB-" not in jid
        assert not jid.lstrip("0x").isdigit() or len(jid) == 66


def test_non_https_brief_reverts(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    direct_vm.sender = direct_alice
    direct_vm.value = ESCROW
    with direct_vm.expect_revert():
        contract.create_job(
            "http://example.com/brief.md", PAY_B, PAY_C, direct_bob, direct_charlie, "write"
        )


def test_javascript_localhost_empty_brief_revert(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    direct_vm.sender = direct_alice
    direct_vm.value = ESCROW
    for bad in ("javascript:alert(1)", "https://localhost/brief", "https://127.0.0.1/x", ""):
        with direct_vm.expect_revert():
            contract.create_job(bad, PAY_B, PAY_C, 0, int(time.time() + 3600), direct_bob, direct_charlie)


def test_happy_fixture_settled_ok_pays_b_and_c(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    good_txt = open("tests/fixtures/good-write.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, GOOD, good_txt)
    _mock_llm(direct_vm, _happy_llm())
    pool0 = contract.get_pool()

    direct_vm.sender = direct_bob
    contract.submit(job_id, GOOD, "")
    direct_vm.sender = direct_charlie
    contract.ack_downstream(job_id, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")
    direct_vm.mock_web(r".*pub\.md.*", {"status": 200, "body": "published"})
    direct_vm.sender = direct_alice
    contract.adjudicate(job_id)

    job = contract.get_job(job_id)
    print("REASON_FOR_FAILURE:", job["reason"])
    assert job["state"] == "SETTLED_OK"
    assert job["fault"] == "none"
    assert job["slash_bps"] == 0
    assert job["paid_c"] == PAY_C
    eco = contract.get_economics()
    assert eco["settled_ok"] == 1
    assert eco["pool"] == pool0 + PREMIUM
    paid_b = contract.get_credit(("0x" + direct_bob.hex()))
    paid_c = contract.get_credit(("0x" + direct_charlie.hex()))
    assert paid_b == PAY_B or paid_b == 0
    assert paid_c == PAY_C or paid_c == 0
    assert job["pay_b"] == PAY_B
    assert eco["locked_jobs"] == 0


def test_rug_fixture_pays_c_refunds_a_slashes_b(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)

    # Fund unrelated writer to verify their collateral is not slashed
    direct_dave = direct_accounts[3]
    direct_vm.sender = direct_dave
    direct_vm.value = BOND
    contract.post_bond()
    direct_vm.value = 0

    pool0 = contract.get_pool()
    rep0 = contract.get_rep(("0x" + direct_bob.hex()))

    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    rug_txt = open("tests/fixtures/rug-write.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, RUG, rug_txt)
    _mock_llm(direct_vm, _rug_llm())

    direct_vm.sender = direct_bob
    contract.submit(job_id, RUG, "")
    direct_vm.sender = direct_charlie
    contract.ack_downstream(job_id, "")
    direct_vm.sender = direct_alice
    contract.adjudicate(job_id)

    job = contract.get_job(job_id)
    assert job["state"] == "SETTLED_RUG"
    assert job["fault"] == "B"
    assert job["pay_downstream"] is True
    assert job["slash_bps"] == 10000
    assert job["paid_c"] == PAY_C
    assert job["slashed_b"] == PAY_C
    assert contract.get_bond(("0x" + direct_bob.hex())) == BOND - PAY_C
    assert contract.get_reserved_bond(("0x" + direct_bob.hex())) == 0
    assert contract.get_available_bond(("0x" + direct_bob.hex())) == BOND - PAY_C
    assert contract.get_rep(("0x" + direct_bob.hex())) == max(rep0 - 1, 0)

    # Unrelated writer collateral is untouched
    assert contract.get_bond(("0x" + direct_dave.hex())) == BOND
    assert contract.get_reserved_bond(("0x" + direct_dave.hex())) == 0
    assert contract.get_available_bond(("0x" + direct_dave.hex())) == BOND

    eco = contract.get_economics()
    assert eco["settled_rug"] == 1
    assert eco["slash_count"] == 1
    assert eco["locked_jobs"] == 0
    # Premium accrues to pool
    assert eco["pool"] == pool0 + PREMIUM
    # Client restitution is PAY_B + PAY_C; publisher receives PAY_C
    assert contract.get_credit(("0x" + direct_alice.hex())) in (0, PAY_B + PAY_C)
    assert contract.get_credit(("0x" + direct_charlie.hex())) in (0, PAY_C)

    # Conservation still holds
    total_in = pool0 + 2 * BOND + ESCROW
    assert eco["pool"] + eco["locked_bonds"] + eco["locked_jobs"] + eco["credits"] == total_in


def test_404_deliverable_undetermined_no_move(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, MISSING, "", deliv_status=404)
    _mock_llm(direct_vm, _happy_llm())
    eco0 = contract.get_economics()
    bond0 = contract.get_bond(("0x" + direct_bob.hex()))

    direct_vm.sender = direct_bob
    contract.submit(job_id, MISSING, "")
    direct_vm.sender = direct_charlie
    contract.ack_downstream(job_id, "")
    direct_vm.sender = direct_alice
    contract.adjudicate(job_id)

    job = contract.get_job(job_id)
    assert job["state"] == "UNDETERMINED"
    eco1 = contract.get_economics()
    assert eco1["pool"] == eco0["pool"]
    assert eco1["locked_jobs"] == eco0["locked_jobs"]
    assert contract.get_bond(("0x" + direct_bob.hex())) == bond0
    assert eco1["slash_count"] == 0


def test_cancel_open_refunds_escrow(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    assert contract.get_economics()["locked_jobs"] == ESCROW
    direct_vm.sender = direct_alice
    contract.cancel(job_id)
    job = contract.get_job(job_id)
    assert job["state"] == "CANCELED"
    assert contract.get_economics()["locked_jobs"] == 0
    assert contract.get_credit(("0x" + direct_alice.hex())) in (0, ESCROW)


def test_cancel_after_submit_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    good_txt = open("tests/fixtures/good-write.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, GOOD, good_txt)
    direct_vm.sender = direct_bob
    contract.submit(job_id, GOOD, "")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert():
        contract.cancel(job_id)


def test_adjudicate_twice_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    good_txt = open("tests/fixtures/good-write.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, GOOD, good_txt)
    _mock_llm(direct_vm, _happy_llm())
    direct_vm.sender = direct_bob
    contract.submit(job_id, GOOD, "")
    direct_vm.sender = direct_charlie
    contract.ack_downstream(job_id, "")
    direct_vm.sender = direct_alice
    contract.adjudicate(job_id)
    with direct_vm.expect_revert():
        contract.adjudicate(job_id)


def test_cancel_from_non_client_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert():
        contract.cancel(job_id)


def test_ack_from_non_c_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    good_txt = open("tests/fixtures/good-write.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, GOOD, good_txt)
    direct_vm.sender = direct_bob
    contract.submit(job_id, GOOD, "")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert():
        contract.ack_downstream(job_id, "")





def test_credits_and_withdraw_path(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, monkeypatch
):
    """If native emit_transfer fails, fallback credits map; withdraw clears it."""
    contract = _deploy(direct_deploy)
    import sys
    gl = sys.modules["genlayer"]

    tracker = {"fail": True, "received": {}}

    class MockProxy:
        def __init__(self, dest):
            self.dest = dest

        def emit_transfer(self, value=0, on="finalized"):
            if tracker["fail"]:
                raise RuntimeError("deliberate transfer failure")
            val = int(value)
            k = str(self.dest).lower()
            tracker["received"][k] = tracker["received"].get(k, 0) + val

    monkeypatch.setattr(gl, "get_contract_at", lambda addr: MockProxy(addr), raising=False)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    good_txt = open("tests/fixtures/good-write.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, GOOD, good_txt)
    _mock_llm(direct_vm, _happy_llm())
    direct_vm.sender = direct_bob
    contract.submit(job_id, GOOD, "")
    direct_vm.sender = direct_charlie
    contract.ack_downstream(job_id, "")
    direct_vm.sender = direct_alice
    contract.adjudicate(job_id)

    # Deliberate transfer failure causes fallback credit
    credit_b = contract.get_credit(("0x" + direct_bob.hex()))
    assert credit_b == PAY_B

    # Successful withdraw clears exactly that credit
    tracker["fail"] = False
    direct_vm.sender = direct_bob
    contract.withdraw()
    assert contract.get_credit(("0x" + direct_bob.hex())) == 0
    assert tracker["received"][("0x" + direct_bob.hex()).lower()] == PAY_B

    # Repeat withdraw with zero credit reverts
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("no credits"):
        contract.withdraw()


def test_check_bond_false_without_post_bond(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_charlie
    direct_vm.value = POOL
    contract.fund_pool()
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    info = contract.check_bond(job_id)
    assert info["state"] == "OPEN"
    assert info["bonded"] is False
    assert int(info["total_bond"]) == 0
    assert int(info["reserved_bond"]) == 0
    assert int(info["available_bond"]) == 0
    assert int(info["job_reserved_bond"]) == 0
    assert int(info["pay_c"]) == PAY_C


def test_equivalence_ignores_reason_text(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    rug_txt = open("tests/fixtures/rug-write.md", encoding="utf-8").read()
    reasons = [
        "Completely different prose about the rug.",
        "Another validator-written explanation, unrelated wording.",
    ]
    ids = []
    for i, reason in enumerate(reasons):
        if contract.get_bond(("0x" + direct_bob.hex())) < PAY_C:
            direct_vm.sender = direct_bob
            direct_vm.value = BOND
            contract.post_bond()
            direct_vm.value = 0
        jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
        deliv = f"{RUG}?eq={i}"
        direct_vm.clear_mocks()
        direct_vm.mock_web(r".*brief\.md.*", {"status": 200, "body": brief_txt})
        direct_vm.mock_web(re.escape(deliv), {"status": 200, "body": rug_txt})
        direct_vm.mock_llm(re.escape(f"eq={i}"), f"```json\n{json.dumps(_rug_llm(reason))}\n```")
        direct_vm.sender = direct_bob
        contract.submit(jid, deliv, "")
        direct_vm.sender = direct_charlie
        contract.ack_downstream(jid, "")
        direct_vm.sender = direct_alice
        contract.adjudicate(jid)
        job = contract.get_job(jid)
        assert job["state"] == "SETTLED_RUG"
        assert job["fault"] == "B"
        assert job["pay_downstream"] in (True, "true", "1", 1)
        assert int(job["slash_bps"]) == 10000
        ids.append(jid)
    assert len(set(ids)) == 2


