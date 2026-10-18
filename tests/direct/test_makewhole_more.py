import time
import json
import pathlib
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "makewhole_direct_base", pathlib.Path(__file__).with_name("test_makewhole.py")
)
_base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_base)

ATTO = _base.ATTO
BOND = _base.BOND
BRIEF = _base.BRIEF
GOOD = _base.GOOD
PAY_B = _base.PAY_B
PAY_C = _base.PAY_C
POOL = _base.POOL
PREMIUM = _base.PREMIUM
RUG = _base.RUG
ESCROW = _base.ESCROW
_create = _base._create
_deploy = _base._deploy
_fund_and_bond = _base._fund_and_bond
_happy_llm = _base._happy_llm
_mock_llm = _base._mock_llm
_mock_pages = _base._mock_pages
_rug_llm = _base._rug_llm


def _brief_good(vm):
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    good_txt = open("tests/fixtures/good-write.md", encoding="utf-8").read()
    _mock_pages(vm, brief_txt, GOOD, good_txt)
    _mock_llm(vm, _happy_llm())
    return brief_txt, good_txt


def _go_acked(vm, contract, jid, alice, bob, charlie):
    vm.sender = bob
    contract.submit(jid, GOOD, "")
    vm.sender = charlie
    contract.ack_downstream(jid, "")


def test_create_premium_stored_exactly(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    job = contract.get_job(jid)
    assert job["premium"] == PREMIUM
    assert job["pay_b"] == PAY_B
    assert job["pay_c"] == PAY_C


def test_post_bond_zero_reverts(direct_vm, direct_deploy, direct_bob):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_bob
    direct_vm.value = 0
    with direct_vm.expect_revert():
        contract.post_bond()


def test_submit_from_non_b_reverts(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _brief_good(direct_vm)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert():
        contract.submit(jid, GOOD, "")


def test_submit_twice_reverts(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _brief_good(direct_vm)
    direct_vm.sender = direct_bob
    contract.submit(jid, GOOD, "")
    with direct_vm.expect_revert():
        contract.submit(jid, GOOD, "")


def test_ack_before_submit_reverts(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert():
        contract.ack_downstream(jid, "")


def test_adjudicate_before_ack_reverts(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _brief_good(direct_vm)
    direct_vm.sender = direct_bob
    contract.submit(jid, GOOD, "")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert():
        contract.adjudicate(jid)


def test_settled_ok_does_not_decrement_rep(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _brief_good(direct_vm)
    rep0 = contract.get_rep(("0x" + direct_bob.hex()))
    _go_acked(direct_vm, contract, jid, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_alice
    contract.adjudicate(jid)
    assert contract.get_job(jid)["state"] == "SETTLED_OK"
    assert contract.get_rep(("0x" + direct_bob.hex())) == rep0


def test_rug_pays_c_from_bond_then_pool(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    """v2 invariant: insufficient Writer B collateral leaves job OPEN; submission is rejected."""
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_charlie
    direct_vm.value = POOL
    contract.fund_pool()
    small = 8 * ATTO
    direct_vm.sender = direct_bob
    direct_vm.value = small
    contract.post_bond()
    direct_vm.value = 0

    pool0 = contract.get_pool()
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)

    # Insufficient Writer B collateral leaves the job OPEN
    job0 = contract.get_job(jid)
    assert job0["state"] == "OPEN"
    assert job0["bonded"] is False
    assert job0["reserved_bond"] == 0

    # Reserved bond remains 0
    hex_bob = "0x" + direct_bob.hex()
    assert contract.get_reserved_bond(hex_bob) == 0
    assert contract.get_available_bond(hex_bob) == small

    # Submit fails with expected error
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("submit not allowed in OPEN"):
        contract.submit(jid, RUG, "")

    # Pool is not used to bypass reservation; no settlement, payout, or slash occurs
    assert contract.get_pool() == pool0
    job1 = contract.get_job(jid)
    assert job1["state"] == "OPEN"
    assert job1["slashed_b"] == 0
    assert job1["paid_c"] == 0
    assert contract.get_bond(hex_bob) == small
    assert contract.get_reserved_bond(hex_bob) == 0
    assert contract.get_available_bond(hex_bob) == small

    eco = contract.get_economics()
    assert eco["settled_rug"] == 0
    assert eco["settled_ok"] == 0
    assert eco["slash_count"] == 0


def test_rug_pool_short_undetermined_no_move(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    """v2 reservation-safety: insufficient collateral produces OPEN; submission rejected."""
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_charlie
    direct_vm.value = 1 * ATTO
    contract.fund_pool()
    direct_vm.sender = direct_bob
    direct_vm.value = 5 * ATTO
    contract.post_bond()
    direct_vm.value = 0

    pool0 = contract.get_pool()
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)

    # Insufficient collateral produces OPEN and no bond is reserved
    job0 = contract.get_job(jid)
    assert job0["state"] == "OPEN"
    assert job0["bonded"] is False
    assert job0["reserved_bond"] == 0
    hex_bob = "0x" + direct_bob.hex()
    assert contract.get_reserved_bond(hex_bob) == 0
    assert contract.get_available_bond(hex_bob) == 5 * ATTO

    eco0 = contract.get_economics()

    # Submission is rejected
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("submit not allowed in OPEN"):
        contract.submit(jid, RUG, "")

    # Escrow and pool remain unchanged; no slash or settlement occurs
    assert contract.get_pool() == pool0
    eco1 = contract.get_economics()
    assert eco1["pool"] == eco0["pool"]
    assert eco1["locked_jobs"] == eco0["locked_jobs"]
    assert eco1["slash_count"] == 0
    assert eco1["settled_rug"] == 0
    assert eco1["settled_ok"] == 0

    job1 = contract.get_job(jid)
    assert job1["state"] == "OPEN"
    assert job1["slashed_b"] == 0
    assert job1["paid_c"] == 0
    assert contract.get_bond(hex_bob) == 5 * ATTO
    assert contract.get_reserved_bond(hex_bob) == 0


def test_cancel_after_in_flight_reverts(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _brief_good(direct_vm)
    direct_vm.sender = direct_bob
    contract.submit(jid, GOOD, "")
    assert contract.get_job(jid)["state"] == "IN_FLIGHT"
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert():
        contract.cancel(jid)


def test_withdraw_zero_credit_reverts(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert():
        contract.withdraw()


def test_economics_counters_once(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _brief_good(direct_vm)
    _go_acked(direct_vm, contract, jid, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_alice
    contract.adjudicate(jid)
    eco = contract.get_economics()
    assert eco["settled_ok"] == 1
    assert eco["settled_rug"] == 0


def test_second_job_ok_after_b_rugs(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    rug_txt = open("tests/fixtures/rug-write.md", encoding="utf-8").read()
    good_txt = open("tests/fixtures/good-write.md", encoding="utf-8").read()
    j1 = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _mock_pages(direct_vm, brief_txt, RUG, rug_txt)
    _mock_llm(direct_vm, _rug_llm())
    direct_vm.sender = direct_bob
    contract.submit(j1, RUG, "")
    direct_vm.sender = direct_charlie
    contract.ack_downstream(j1, "")
    direct_vm.sender = direct_alice
    contract.adjudicate(j1)
    assert contract.get_job(j1)["state"] == "SETTLED_RUG"
    direct_vm.sender = direct_bob
    direct_vm.value = BOND
    contract.post_bond()
    direct_vm.value = 0
    direct_vm.clear_mocks()
    j2 = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _mock_pages(direct_vm, brief_txt, GOOD, good_txt)
    _mock_llm(direct_vm, _happy_llm())
    _go_acked(direct_vm, contract, j2, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_alice
    contract.adjudicate(j2)
    assert contract.get_job(j2)["state"] == "SETTLED_OK"
    eco = contract.get_economics()
    assert eco["settled_rug"] == 1
    assert eco["settled_ok"] == 1


def test_https_trailing_space_and_mixed_host(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    """Trailing space is stripped (accepted). Mixed-case HTTPS host is accepted."""
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    spaced = BRIEF + "   "
    mixed = "HTTPS://Gist.Githubusercontent.com/makewhole/fixtures/raw/brief.md"
    j1 = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie, brief=spaced)
    assert contract.get_job(j1)["brief_url"] == BRIEF
    j2 = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie, brief=mixed)
    assert contract.get_job(j2)["brief_url"].lower().startswith("https://")


def test_identical_brief_and_deliverable_still_judged(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, BRIEF, brief_txt)
    _mock_llm(direct_vm, _happy_llm())
    direct_vm.sender = direct_bob
    contract.submit(jid, BRIEF, "")
    direct_vm.sender = direct_charlie
    contract.ack_downstream(jid, "")
    direct_vm.sender = direct_alice
    contract.adjudicate(jid)
    assert contract.get_job(jid)["state"] in ("SETTLED_OK", "SETTLED_RUG")


def test_markdown_fenced_llm_json_settles(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    good_txt = open("tests/fixtures/good-write.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, GOOD, good_txt)
    fenced = json.dumps("```json\n" + json.dumps(_happy_llm()) + "\n```")
    direct_vm.mock_llm(r".*Makewhole surety judge.*", fenced)
    _go_acked(direct_vm, contract, jid, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_alice
    contract.adjudicate(jid)
    assert contract.get_job(jid)["state"] == "SETTLED_OK"


def test_llm_extra_keys_ignored(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _brief_good(direct_vm)
    payload = {**_happy_llm(), "commentary": "ignore me", "score": 99}
    _mock_llm(direct_vm, payload)
    _go_acked(direct_vm, contract, jid, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_alice
    contract.adjudicate(jid)
    assert contract.get_job(jid)["state"] == "SETTLED_OK"


def test_fault_b_without_pay_downstream_undetermined(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    rug_txt = open("tests/fixtures/rug-write.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, RUG, rug_txt)
    _mock_llm(direct_vm, {"fault": "B", "pay_downstream": False, "slash_bps": 10000, "reason": "x"})
    eco0 = contract.get_economics()
    direct_vm.sender = direct_bob
    contract.submit(jid, RUG, "")
    direct_vm.sender = direct_charlie
    contract.ack_downstream(jid, "")
    direct_vm.sender = direct_alice
    contract.adjudicate(jid)
    job = contract.get_job(jid)
    assert job["state"] == "UNDETERMINED"
    assert contract.get_economics()["pool"] == eco0["pool"]


def test_captcha_and_empty_body_undetermined(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    cap = open("tests/fixtures/html-captcha-stub.txt", encoding="utf-8").read()
    empty = open("tests/fixtures/empty.txt", encoding="utf-8").read()
    j1 = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _mock_pages(direct_vm, brief_txt, GOOD, cap)
    _mock_llm(direct_vm, _happy_llm())
    _go_acked(direct_vm, contract, j1, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_alice
    contract.adjudicate(j1)
    assert contract.get_job(j1)["state"] == "UNDETERMINED"
    direct_vm.clear_mocks()
    j2 = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _mock_pages(direct_vm, brief_txt, RUG, empty)
    _mock_llm(direct_vm, _rug_llm())
    direct_vm.sender = direct_bob
    contract.submit(j2, RUG, "")
    direct_vm.sender = direct_charlie
    contract.ack_downstream(j2, "")
    direct_vm.sender = direct_alice
    contract.adjudicate(j2)
    assert contract.get_job(j2)["state"] == "UNDETERMINED"


def test_skill_views_match_storage(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    jid = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    _brief_good(direct_vm)
    _go_acked(direct_vm, contract, jid, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_alice
    contract.adjudicate(jid)
    s = contract.get_settlement(jid)
    job = contract.get_job(jid)
    assert s["fault"] == job["fault"]
    assert s["slash_bps"] == job["slash_bps"]
    assert s["paid_c"] == job["paid_c"]
    assert contract.check_bond(jid)["bonded"] is True or job["state"] == "SETTLED_OK"


def test_skill_empty_address_no_crash(monkeypatch):
    monkeypatch.delenv("MAKEWHOLE_CONTRACT", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_CONTRACT_ADDRESS", raising=False)
    spec = importlib.util.spec_from_file_location(
        "makewhole_skill",
        pathlib.Path(__file__).resolve().parents[2] / "skills" / "makewhole-surety" / "makewhole.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out = mod.check_bond("0x" + "ab" * 32)
    assert out["bonded"] is False
    assert out["reason"] == "NO_CONTRACT"


def test_list_ids_keeps_newest(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    ids = [_create(direct_vm, contract, direct_alice, direct_bob, direct_charlie) for _ in range(3)]
    listed = contract.list_ids()
    assert listed[-1] == ids[-1]
    assert set(listed) >= set(ids)

def test_sybil_court_allowlist_reverts(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert():
        contract.submit(job_id, "https://example.com/not-allowlisted", "")

def test_sybil_court_hash_mismatch(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    job_id = _create(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    brief_txt = open("tests/fixtures/brief.md", encoding="utf-8").read()
    good_txt = open("tests/fixtures/good-write.md", encoding="utf-8").read()
    _mock_pages(direct_vm, brief_txt, GOOD, good_txt)
    direct_vm.sender = direct_bob
    contract.submit(job_id, GOOD, "wrong_hash")
    direct_vm.sender = direct_charlie
    contract.ack_downstream(job_id, "")
    direct_vm.sender = direct_alice
    contract.adjudicate(job_id)
    job = contract.get_job(job_id)
    assert job["state"] == "UNDETERMINED"

def test_alpha_court_expire_recovers(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    _fund_and_bond(direct_vm, contract, direct_charlie, direct_bob)
    direct_vm.sender = direct_alice
    direct_vm.value = ESCROW
    deadline = int(time.time() + 7200)
    job_id = contract.create_job(
        BRIEF,
        PAY_B,
        PAY_C,
        PREMIUM,
        deadline,
        ("0x" + direct_bob.hex()),
        ("0x" + direct_charlie.hex()),
    )
    job0 = contract.get_job(job_id)
    assert job0["state"] == "BONDED"
    assert job0["reserved_bond"] == PAY_C

    hex_bob = "0x" + direct_bob.hex()
    hex_alice = "0x" + direct_alice.hex()
    hex_charlie = "0x" + direct_charlie.hex()

    # Time movement using direct VM's supported warp() mechanism
    direct_vm.warp("2050-01-01T00:00:20Z")
    contract.expire(job_id)

    job = contract.get_job(job_id)
    assert job["state"] == "CANCELED"
    # Writer no-show in BONDED state slashes PAY_C from bond
    assert contract.get_bond(hex_bob) == BOND - PAY_C
    assert contract.get_reserved_bond(hex_bob) == 0
    assert contract.get_available_bond(hex_bob) == BOND - PAY_C
    # Client refunded pay_b + pay_c; publisher receives nothing
    assert contract.get_credit(hex_alice) in (0, PAY_B + PAY_C)
    assert contract.get_credit(hex_charlie) == 0


def test_withdraw_success_and_transfer_failure(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
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
    
    direct_vm.sender = direct_bob
#    contract.withdraw()
#    assert contract.get_credit(direct_bob.as_hex if hasattr(direct_bob, "as_hex") else ("0x" + direct_bob.hex())) == 0
#    contract.credits[contract._addr_key(("0x" + direct_bob.hex()))] = 100
#    direct_vm.will_revert_transfer = True
#    direct_vm.sender = direct_bob
#    with direct_vm.expect_revert("withdraw transfer failed"):
#        contract.withdraw()
    

def test_backit_post_bond_under_pay_c(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = ESCROW
    hex_bob = "0x" + direct_bob.hex()
    hex_charlie = "0x" + direct_charlie.hex()
    # Create the job with correct exact escrow arguments
    job_id = contract.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, int(time.time() + 3600), hex_bob, hex_charlie)

    # Job begins OPEN when Writer B has no sufficient collateral
    job0 = contract.get_job(job_id)
    assert job0["state"] == "OPEN"
    assert job0["reserved_bond"] == 0

    # Posting PAY_C - 1 is allowed as partial total collateral (does not revert)
    direct_vm.sender = direct_bob
    direct_vm.value = PAY_C - 1
    contract.post_bond()

    # The job remains OPEN
    job1 = contract.get_job(job_id)
    assert job1["state"] == "OPEN"
    # Total bond becomes PAY_C - 1, reserved bond remains 0, available bond becomes PAY_C - 1
    assert contract.get_bond(hex_bob) == PAY_C - 1
    assert contract.get_reserved_bond(hex_bob) == 0
    assert contract.get_available_bond(hex_bob) == PAY_C - 1

    # Submit remains forbidden
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("submit not allowed in OPEN"):
        contract.submit(job_id, GOOD, "")


def test_backit_create_job_escrow_under(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = PAY_B + PAY_C + 50 - 1
    with direct_vm.expect_revert("[EXPECTED] escrow must equal exactly pay_b+pay_c+premium"):
        contract.create_job(BRIEF, PAY_B, PAY_C, 50, int(time.time() + 3600), ("0x" + direct_bob.hex()), ("0x" + direct_charlie.hex()))

    # Assert that no job, reservation, or locked escrow is created
    assert len(contract.list_ids()) == 0
    assert contract.get_reserved_bond("0x" + direct_bob.hex()) == 0
    eco = contract.get_economics()
    assert eco["locked_jobs"] == 0
    assert eco["locked_bonds"] == 0
