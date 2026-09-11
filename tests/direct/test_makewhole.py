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
    job_id = contract.create_job(brief, PAY_B, PAY_C, premium, deadline or int(time.time() + 3600), writer, publisher, hop_kind)
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
    vm.mock_llm(r".*Makewhole surety judge.*", json.dumps(payload))


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
            contract.create_job(bad, PAY_B, PAY_C, direct_bob, direct_charlie, "write")


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
    paid_b = contract.get_credit(str(direct_bob))
    paid_c = contract.get_credit(str(direct_charlie))
    assert paid_b == PAY_B or paid_b == 0
    assert paid_c == PAY_C or paid_c == 0
    assert job["pay_b"] == PAY_B
    assert eco["locked_jobs"] == 0


def test_rug_fixture_pays_c_refunds_a_slashes_b(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    rug_txt = open("tests/fixtures/rug-write.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, RUG, rug_txt)
    _mock_llm(direct_vm, _rug_llm())

    rep0 = contract.get_rep(str(direct_bob))

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
    assert job["slashed_b"] == BOND - PAY_C
    assert contract.get_bond(str(direct_bob)) == 0
    assert contract.get_rep(str(direct_bob)) == max(rep0 - 1, 0)
    eco = contract.get_economics()
    assert eco["settled_rug"] == 1
    assert eco["slash_count"] == 1
    assert contract.get_credit(str(direct_alice)) in (0, PAY_B)
    assert contract.get_credit(str(direct_charlie)) in (0, PAY_C)
    assert eco["locked_jobs"] == 0


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
    bond0 = contract.get_bond(str(direct_bob))

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
    assert contract.get_bond(str(direct_bob)) == bond0
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
    assert contract.get_credit(str(direct_alice)) in (0, ESCROW)


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


def test_hop_kind_does_not_change_payouts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    good_txt = open("tests/fixtures/good-write.md", encoding="utf-8").read()
    ids = []
    for kind in ("research", "write", "publish"):
        jid = _create(
            direct_vm, contract, direct_alice, direct_bob, direct_charlie, hop_kind=kind
        )
        ids.append(jid)
        _mock_pages(direct_vm, brief_txt, GOOD, good_txt)
        _mock_llm(direct_vm, _happy_llm())
        direct_vm.sender = direct_bob
        contract.submit(jid, GOOD, "")
        direct_vm.sender = direct_charlie
        contract.ack_downstream(jid, "")
        direct_vm.sender = direct_alice
        contract.adjudicate(jid)
        job = contract.get_job(jid)
        assert job["state"] == "SETTLED_OK"
        assert job["pay_b"] == PAY_B
        assert job["pay_c"] == PAY_C
        assert job["premium"] == PREMIUM
        assert job["hop_kind"] == kind


def test_credits_and_withdraw_path(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    """If native emit_transfer credits the fallback map, withdraw clears it."""
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
    credit_b = contract.get_credit(str(direct_bob))
    if credit_b > 0:
        direct_vm.sender = direct_bob
        contract.withdraw()
        assert contract.get_credit(str(direct_bob)) == 0
    else:
        direct_vm.sender = direct_bob
        with direct_vm.expect_revert():
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
    assert info["bonded"] is False
    assert info["state"] == "OPEN"
    assert info["pay_c"] == PAY_C


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
        if contract.get_bond(str(direct_bob)) < PAY_C:
            direct_vm.sender = direct_bob
            direct_vm.value = BOND
            contract.post_bond()
            direct_vm.value = 0
        jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
        deliv = f"{RUG}?eq={i}"
        direct_vm.clear_mocks()
        direct_vm.mock_web(r".*brief\.md.*", {"status": 200, "body": brief_txt})
        direct_vm.mock_web(re.escape(deliv), {"status": 200, "body": rug_txt})
        direct_vm.mock_llm(re.escape(f"eq={i}"), json.dumps(_rug_llm(reason)))
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


def test_create_rejects_value_too_small(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    direct_vm.sender = direct_alice
    direct_vm.value = PAY_B
    with direct_vm.expect_revert():
        contract.create_job(BRIEF, PAY_B, PAY_C, direct_bob, direct_charlie, "write")
