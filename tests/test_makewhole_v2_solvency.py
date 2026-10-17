import sys
import importlib.util
from datetime import datetime, timezone
from pathlib import Path
import pytest

from gltest.direct.sdk_loader import setup_sdk_paths

_contract_path = Path("contracts/makewhole.py").resolve()
setup_sdk_paths(_contract_path)

import genlayer as gl
from genlayer.types import Address, u256
from genlayer.storage._internal.generate import _storage_build, _BuilderCtx
import gltest.direct.vm as vm_mod

_spec = importlib.util.spec_from_file_location("makewhole_v2_solvency", _contract_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

Makewhole = _mod.Makewhole
MIN_DEADLINE_LEAD_TIME_SEC = _mod.MIN_DEADLINE_LEAD_TIME_SEC
SETTLEMENT_GRACE_PERIOD_SEC = _mod.SETTLEMENT_GRACE_PERIOD_SEC

ALICE = Address("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")  # Client
BOB = Address("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")    # Writer
CHARLIE = Address("0xcccccccccccccccccccccccccccccccccccccccc")# Publisher

BRIEF = "https://gist.githubusercontent.com/makewhole/fixtures/raw/brief.md"
DELIVERABLE = "https://gist.githubusercontent.com/makewhole/fixtures/raw/good-write.md"

PAY_B = u256(20 * 10**18)
PAY_C = u256(12 * 10**18)
PREMIUM = u256(3 * 10**18)
ESCROW = PAY_B + PAY_C + PREMIUM
BOND = u256(50 * 10**18)
POOL = u256(100 * 10**18)


class FakeMessage:
    def __init__(self, sender, value=u256(0)):
        self.sender_address = sender
        self.value = value


class MockContractProxy:
    def __init__(self, dest: Address, tracker):
        self.dest = dest
        self.tracker = tracker

    def emit_transfer(self, value=u256(0), on="finalized"):
        if self.tracker.fail_transfers.get(str(self.dest).lower(), False):
            raise RuntimeError("Transfer failed")
        val = int(value)
        k = str(self.dest).lower()
        self.tracker.received[k] = self.tracker.received.get(k, 0) + val
        self.tracker.balance -= val


class TransferTracker:
    def __init__(self):
        self.received = {}
        self.fail_transfers = {}
        self.balance = 0


def _setup_context(monkeypatch, current_time=1_700_000_000):
    tracker = TransferTracker()

    def mock_time():
        return datetime.fromtimestamp(current_time, tz=timezone.utc)

    monkeypatch.setattr(gl.vm, "get_timestamp", mock_time)

    def mock_get_contract_at(addr):
        return MockContractProxy(addr, tracker)

    monkeypatch.setattr(gl, "get_contract_at", mock_get_contract_at, raising=False)

    vm = vm_mod.VMContext()
    td = _storage_build(_BuilderCtx.empty(), Makewhole)
    slot = vm._storage.get_store_slot(b"\x00" * 32)
    contract = td.get(slot, 0)
    contract.__init__()

    # Wire native balance property to tracker.balance
    type(contract).balance = property(lambda self: u256(tracker.balance))

    return contract, tracker


def _set_caller(contract, tracker, sender: Address, value: u256 = u256(0)):
    gl.message = FakeMessage(sender=sender, value=value)
    tracker.balance += int(value)


def _fund_pool(contract, tracker, amount=POOL):
    _set_caller(contract, tracker, ALICE, amount)
    contract.fund_pool()


def _post_bond(contract, tracker, writer=BOB, amount=BOND):
    _set_caller(contract, tracker, writer, amount)
    contract.post_bond()


def _create_job(contract, tracker, client=ALICE, writer=BOB, publisher=CHARLIE, deadline=None, escrow=ESCROW):
    if deadline is None:
        deadline = u256(1_700_000_000 + 7200)
    _set_caller(contract, tracker, client, escrow)
    return contract.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, writer, publisher)


def _assert_conservation(contract, tracker):
    bals = contract.get_balances()
    calc_sum = bals["locked_bonds"] + bals["locked_jobs"] + bals["pool"] + bals["credits_total"]
    assert tracker.balance == calc_sum, f"Conservation failed: cash {tracker.balance} != ledger {calc_sum}"
    assert int(contract.balance) == calc_sum


# ==============================================================================
# 1. Exact escrow accepted
# ==============================================================================
def test_exact_escrow_accepted(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    job_id = _create_job(contract, tracker)
    assert job_id.startswith("0x")
    assert contract.locked_jobs == ESCROW
    _assert_conservation(contract, tracker)


# ==============================================================================
# 2. Underpayment rejected
# ==============================================================================
def test_escrow_underpayment_rejected(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    under_escrow = ESCROW - u256(1)
    with pytest.raises(gl.vm.UserError) as excinfo:
        _create_job(contract, tracker, escrow=under_escrow)
    assert "[EXPECTED] escrow must equal exactly pay_b+pay_c+premium" in str(excinfo.value)


# ==============================================================================
# 3. Overpayment rejected
# ==============================================================================
def test_escrow_overpayment_rejected(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    over_escrow = ESCROW + u256(1)
    with pytest.raises(gl.vm.UserError) as excinfo:
        _create_job(contract, tracker, escrow=over_escrow)
    assert "[EXPECTED] escrow must equal exactly pay_b+pay_c+premium" in str(excinfo.value)


# ==============================================================================
# 4. Two concurrent jobs cannot share one reservation
# ==============================================================================
def test_concurrent_jobs_cannot_share_reservation(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    _post_bond(contract, tracker, BOB, PAY_C)  # bond == exactly 1x pay_c

    j1 = _create_job(contract, tracker, writer=BOB)
    job1 = contract.get_job(j1)
    assert job1["state"] == "BONDED"
    assert job1["reserved_bond"] == int(PAY_C)
    assert contract.get_available_bond(str(BOB)) == 0

    j2 = _create_job(contract, tracker, writer=BOB)
    job2 = contract.get_job(j2)
    assert job2["state"] == "OPEN"
    assert job2["reserved_bond"] == 0
    assert contract.get_available_bond(str(BOB)) == 0

    assert contract.get_reserved_bond(str(BOB)) == int(PAY_C)
    _assert_conservation(contract, tracker)


# ==============================================================================
# 5. FIFO post_bond reserves only jobs fully covered
# ==============================================================================
def test_fifo_post_bond_reserves_only_fully_covered_jobs(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    # Writer starts with 0 bond
    j1 = _create_job(contract, tracker, writer=BOB)
    j2 = _create_job(contract, tracker, writer=BOB)
    j3 = _create_job(contract, tracker, writer=BOB)

    assert contract.get_job(j1)["state"] == "OPEN"
    assert contract.get_job(j2)["state"] == "OPEN"
    assert contract.get_job(j3)["state"] == "OPEN"

    # Writer posts enough bond for exactly 1.5 jobs (e.g. pay_c + pay_c // 2)
    deposit = PAY_C + u256(int(PAY_C) // 2)
    _post_bond(contract, tracker, BOB, deposit)

    assert contract.get_job(j1)["state"] == "BONDED"
    assert contract.get_job(j1)["reserved_bond"] == int(PAY_C)

    # Job 2 cannot be fully covered, so FIFO halts
    assert contract.get_job(j2)["state"] == "OPEN"
    assert contract.get_job(j2)["reserved_bond"] == 0
    assert contract.get_job(j3)["state"] == "OPEN"
    assert contract.get_job(j3)["reserved_bond"] == 0

    assert contract.get_reserved_bond(str(BOB)) == int(PAY_C)
    assert contract.get_available_bond(str(BOB)) == int(deposit - PAY_C)
    _assert_conservation(contract, tracker)


# ==============================================================================
# 6. Exact bond amount reserves one job
# ==============================================================================
def test_exact_bond_amount_reserves_one_job(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    j1 = _create_job(contract, tracker, writer=BOB)
    assert contract.get_job(j1)["state"] == "OPEN"

    _post_bond(contract, tracker, BOB, PAY_C)
    assert contract.get_job(j1)["state"] == "BONDED"
    assert contract.get_job(j1)["reserved_bond"] == int(PAY_C)
    assert contract.get_available_bond(str(BOB)) == 0
    _assert_conservation(contract, tracker)


# ==============================================================================
# 7. OPEN job cannot submit
# ==============================================================================
def test_open_job_cannot_submit(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    j1 = _create_job(contract, tracker, writer=BOB)
    assert contract.get_job(j1)["state"] == "OPEN"

    _set_caller(contract, tracker, BOB)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.submit(j1, DELIVERABLE, "hash123")
    assert "[EXPECTED] submit not allowed in OPEN" in str(excinfo.value)


# ==============================================================================
# 8. BONDED job with a valid reservation can submit
# ==============================================================================
def test_bonded_job_with_valid_reservation_can_submit(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    _post_bond(contract, tracker, BOB, PAY_C)
    j1 = _create_job(contract, tracker, writer=BOB)

    _set_caller(contract, tracker, BOB)
    contract.submit(j1, DELIVERABLE, "hash123")
    job = contract.get_job(j1)
    assert job["state"] == "IN_FLIGHT"
    assert job["deliverable_hash"] == "hash123"
    assert job["reserved_bond"] == int(PAY_C)
    _assert_conservation(contract, tracker)


# ==============================================================================
# 9. Submit after deadline is rejected
# ==============================================================================
def test_submit_after_deadline_rejected(monkeypatch):
    contract, tracker = _setup_context(monkeypatch, current_time=1_700_000_000)
    _post_bond(contract, tracker, BOB, PAY_C)
    dl = u256(1_700_000_000 + 4000)
    j1 = _create_job(contract, tracker, writer=BOB, deadline=dl)

    # Fast forward past deadline
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(1_700_000_000 + 5000, tz=timezone.utc))
    _set_caller(contract, tracker, BOB)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.submit(j1, DELIVERABLE, "hash123")
    assert "[EXPECTED] deadline passed" in str(excinfo.value)


# ==============================================================================
# 10. Acknowledge after deadline is rejected
# ==============================================================================
def test_ack_after_deadline_rejected(monkeypatch):
    contract, tracker = _setup_context(monkeypatch, current_time=1_700_000_000)
    _post_bond(contract, tracker, BOB, PAY_C)
    dl = u256(1_700_000_000 + 4000)
    j1 = _create_job(contract, tracker, writer=BOB, deadline=dl)

    _set_caller(contract, tracker, BOB)
    contract.submit(j1, DELIVERABLE, "hash123")

    # Fast forward past deadline
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(1_700_000_000 + 5000, tz=timezone.utc))
    _set_caller(contract, tracker, CHARLIE)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.ack_downstream(j1, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")
    assert "[EXPECTED] deadline passed" in str(excinfo.value)


# ==============================================================================
# 11. Unbond withdraws only available collateral during active jobs
# ==============================================================================
def test_unbond_withdraws_only_available_during_active_jobs(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    deposit = u256(30 * 10**18)
    _post_bond(contract, tracker, BOB, deposit)
    j1 = _create_job(contract, tracker, writer=BOB)

    # Bob has 30 total, 12 reserved, 18 available
    assert contract.get_available_bond(str(BOB)) == int(deposit - PAY_C)
    bob_key = str(BOB).lower()
    tracker.received[bob_key] = 0

    _set_caller(contract, tracker, BOB)
    contract.unbond()

    # Bob should have received exactly 18
    assert tracker.received[bob_key] == int(deposit - PAY_C)
    assert contract.get_bond(str(BOB)) == int(PAY_C)
    assert contract.get_reserved_bond(str(BOB)) == int(PAY_C)
    assert contract.get_available_bond(str(BOB)) == 0

    # Calling unbond again should revert
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.unbond()
    assert "[EXPECTED] no available bond to unbond" in str(excinfo.value)

    _assert_conservation(contract, tracker)


# ==============================================================================
# 12. Successful settlement releases only its reservation
# ==============================================================================
def test_successful_settlement_releases_only_its_reservation(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    _fund_pool(contract, tracker)
    deposit = u256(50 * 10**18)
    _post_bond(contract, tracker, BOB, deposit)
    j1 = _create_job(contract, tracker, writer=BOB)

    _set_caller(contract, tracker, BOB)
    contract.submit(j1, DELIVERABLE, "hash123")
    _set_caller(contract, tracker, CHARLIE)
    contract.ack_downstream(j1, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")

    # Mock strict_eq to return fault: none
    monkeypatch.setattr(gl.eq_principle, "strict_eq", lambda fn: {"fault": "none", "pay_downstream": True, "slash_bps": 0})

    _set_caller(contract, tracker, ALICE)
    contract.adjudicate(j1)

    job = contract.get_job(j1)
    assert job["state"] == "SETTLED_OK"
    assert job["reserved_bond"] == 0

    # Total bond unchanged, reserved released to available
    assert contract.get_bond(str(BOB)) == int(deposit)
    assert contract.get_reserved_bond(str(BOB)) == 0
    assert contract.get_available_bond(str(BOB)) == int(deposit)

    # Writer got pay_b, publisher got pay_c
    assert tracker.received[str(BOB).lower()] == int(PAY_B)
    assert tracker.received[str(CHARLIE).lower()] == int(PAY_C)
    _assert_conservation(contract, tracker)


# ==============================================================================
# 13. Rug settlement slashes only its job reservation
# ==============================================================================
def test_rug_settlement_slashes_only_job_reservation(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    _fund_pool(contract, tracker)
    deposit = u256(50 * 10**18)
    _post_bond(contract, tracker, BOB, deposit)
    j1 = _create_job(contract, tracker, writer=BOB)

    _set_caller(contract, tracker, BOB)
    contract.submit(j1, DELIVERABLE, "hash123")
    _set_caller(contract, tracker, CHARLIE)
    contract.ack_downstream(j1, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")

    # Mock strict_eq to return fault: B, pay_downstream: True
    monkeypatch.setattr(gl.eq_principle, "strict_eq", lambda fn: {"fault": "B", "pay_downstream": True, "slash_bps": 10000})

    alice_key = str(ALICE).lower()
    charlie_key = str(CHARLIE).lower()
    tracker.received[alice_key] = 0
    tracker.received[charlie_key] = 0

    _set_caller(contract, tracker, ALICE)
    contract.adjudicate(j1)

    job = contract.get_job(j1)
    assert job["state"] == "SETTLED_RUG"
    assert job["reserved_bond"] == 0
    assert job["slashed_b"] == int(PAY_C)
    assert job["paid_c"] == int(PAY_C)

    # Exactly pay_c slashed from total bond
    assert contract.get_bond(str(BOB)) == int(deposit - PAY_C)
    assert contract.get_reserved_bond(str(BOB)) == 0
    assert contract.get_available_bond(str(BOB)) == int(deposit - PAY_C)

    # Client receives pay_b + pay_c (restitution!)
    assert tracker.received[alice_key] == int(PAY_B + PAY_C)
    # Publisher receives pay_c from slashed bond
    assert tracker.received[charlie_key] == int(PAY_C)

    _assert_conservation(contract, tracker)


# ==============================================================================
# 14. Another concurrent job remains fully collateralized after a rug
# ==============================================================================
def test_concurrent_job_remains_fully_collateralized_after_rug(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    _fund_pool(contract, tracker)
    deposit = u256(30 * 10**18)
    _post_bond(contract, tracker, BOB, deposit)

    j1 = _create_job(contract, tracker, writer=BOB)
    j2 = _create_job(contract, tracker, writer=BOB)

    # Both jobs bonded
    assert contract.get_job(j1)["state"] == "BONDED"
    assert contract.get_job(j2)["state"] == "BONDED"

    # Settle job 1 as RUG
    _set_caller(contract, tracker, BOB)
    contract.submit(j1, DELIVERABLE, "hash1")
    _set_caller(contract, tracker, CHARLIE)
    contract.ack_downstream(j1, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")

    monkeypatch.setattr(gl.eq_principle, "strict_eq", lambda fn: {"fault": "B", "pay_downstream": True, "slash_bps": 10000})
    _set_caller(contract, tracker, ALICE)
    contract.adjudicate(j1)

    # Job 1 is RUG, Job 2 remains BONDED with 100% reserved bond intact
    job2 = contract.get_job(j2)
    assert job2["state"] == "BONDED"
    assert job2["reserved_bond"] == int(PAY_C)

    # Writer bond: 30 - 12 = 18 total. 12 reserved (for job 2). 6 available.
    assert contract.get_bond(str(BOB)) == int(deposit - PAY_C)
    assert contract.get_reserved_bond(str(BOB)) == int(PAY_C)
    assert contract.get_available_bond(str(BOB)) == int(deposit - 2 * PAY_C)

    _assert_conservation(contract, tracker)


# ==============================================================================
# 15. BONDED expiry does not pay an unacknowledged publisher
# ==============================================================================
def test_bonded_expiry_does_not_pay_unacknowledged_publisher(monkeypatch):
    contract, tracker = _setup_context(monkeypatch, current_time=1_700_000_000)
    _fund_pool(contract, tracker)
    deposit = u256(50 * 10**18)
    _post_bond(contract, tracker, BOB, deposit)
    dl = u256(1_700_000_000 + 4000)
    j1 = _create_job(contract, tracker, writer=BOB, deadline=dl)

    # Fast forward past deadline
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(1_700_000_000 + 5000, tz=timezone.utc))

    charlie_key = str(CHARLIE).lower()
    alice_key = str(ALICE).lower()
    tracker.received[charlie_key] = 0
    tracker.received[alice_key] = 0

    contract.expire(j1)
    job = contract.get_job(j1)
    assert job["state"] == "CANCELED"
    assert job["reserved_bond"] == 0

    # Publisher receives 0
    assert tracker.received[charlie_key] == 0
    # Client receives pay_b + pay_c
    assert tracker.received[alice_key] == int(PAY_B + PAY_C)
    # Bond slashed pay_c into pool
    assert contract.get_bond(str(BOB)) == int(deposit - PAY_C)

    _assert_conservation(contract, tracker)


# ==============================================================================
# 16. IN_FLIGHT expiry pays writer and refunds client pay_c
# ==============================================================================
def test_in_flight_expiry_pays_writer_and_refunds_client(monkeypatch):
    contract, tracker = _setup_context(monkeypatch, current_time=1_700_000_000)
    _fund_pool(contract, tracker)
    deposit = u256(50 * 10**18)
    _post_bond(contract, tracker, BOB, deposit)
    dl = u256(1_700_000_000 + 4000)
    j1 = _create_job(contract, tracker, writer=BOB, deadline=dl)

    _set_caller(contract, tracker, BOB)
    contract.submit(j1, DELIVERABLE, "hash123")

    # Fast forward past deadline without C acknowledging
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(1_700_000_000 + 5000, tz=timezone.utc))

    bob_key = str(BOB).lower()
    alice_key = str(ALICE).lower()
    tracker.received[bob_key] = 0
    tracker.received[alice_key] = 0

    contract.expire(j1)
    job = contract.get_job(j1)
    assert job["state"] == "CANCELED"
    assert job["reserved_bond"] == 0

    # Writer gets pay_b and bond untouched
    assert tracker.received[bob_key] == int(PAY_B)
    assert contract.get_bond(str(BOB)) == int(deposit)
    assert contract.get_reserved_bond(str(BOB)) == 0

    # Client gets refund of pay_c
    assert tracker.received[alice_key] == int(PAY_C)

    _assert_conservation(contract, tracker)


# ==============================================================================
# 17. ACKED/UNDETERMINED cannot expire during settlement grace
# ==============================================================================
def test_acked_undetermined_cannot_expire_during_settlement_grace(monkeypatch):
    contract, tracker = _setup_context(monkeypatch, current_time=1_700_000_000)
    _fund_pool(contract, tracker)
    _post_bond(contract, tracker, BOB, BOND)
    dl = u256(1_700_000_000 + 4000)
    j1 = _create_job(contract, tracker, writer=BOB, deadline=dl)

    _set_caller(contract, tracker, BOB)
    contract.submit(j1, DELIVERABLE, "hash123")
    _set_caller(contract, tracker, CHARLIE)
    contract.ack_downstream(j1, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")

    # Fast forward past deadline by 1 hour (less than 86400s grace)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(1_700_000_000 + 7600, tz=timezone.utc))

    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.expire(j1)
    assert "[EXPECTED] settlement grace period not passed" in str(excinfo.value)


# ==============================================================================
# 18. UNDETERMINED expiry after grace decrements writer_active
# ==============================================================================
def test_undetermined_expiry_after_grace_decrements_writer_active(monkeypatch):
    contract, tracker = _setup_context(monkeypatch, current_time=1_700_000_000)
    _fund_pool(contract, tracker)
    _post_bond(contract, tracker, BOB, BOND)
    dl = u256(1_700_000_000 + 4000)
    j1 = _create_job(contract, tracker, writer=BOB, deadline=dl)

    _set_caller(contract, tracker, BOB)
    contract.submit(j1, DELIVERABLE, "hash123")
    _set_caller(contract, tracker, CHARLIE)
    contract.ack_downstream(j1, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")

    # Settle to UNDETERMINED
    monkeypatch.setattr(gl.eq_principle, "strict_eq", lambda fn: {"undetermined": True})
    _set_caller(contract, tracker, ALICE)
    contract.adjudicate(j1)
    assert contract.get_job(j1)["state"] == "UNDETERMINED"
    assert int(contract.writer_active[str(BOB).lower()]) == 1

    # Fast forward past deadline + 86400s grace
    grace_passed = 1_700_000_000 + 4000 + SETTLEMENT_GRACE_PERIOD_SEC + 10
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(grace_passed, tz=timezone.utc))

    contract.expire(j1)
    assert contract.get_job(j1)["state"] == "CANCELED"
    assert int(contract.writer_active[str(BOB).lower()]) == 0
    assert contract.get_reserved_bond(str(BOB)) == 0

    _assert_conservation(contract, tracker)


# ==============================================================================
# 19. Repeated terminal operations are rejected
# ==============================================================================
def test_repeated_terminal_operations_rejected(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    _post_bond(contract, tracker, BOB, BOND)
    j1 = _create_job(contract, tracker, writer=BOB)

    _set_caller(contract, tracker, ALICE)
    contract.cancel(j1)
    assert contract.get_job(j1)["state"] == "CANCELED"

    # Second cancel reverts
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.cancel(j1)
    assert "[EXPECTED] job already finished" in str(excinfo.value)

    # Expiry on canceled job reverts
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.expire(j1)
    assert "[EXPECTED] job already finished" in str(excinfo.value)


# ==============================================================================
# 20. Conservation holds across all paths
# ==============================================================================
def test_conservation_holds_across_cancel_open(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    j1 = _create_job(contract, tracker, writer=BOB)
    _assert_conservation(contract, tracker)

    _set_caller(contract, tracker, ALICE)
    contract.cancel(j1)
    _assert_conservation(contract, tracker)


def test_conservation_holds_across_cancel_bonded(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    _post_bond(contract, tracker, BOB, BOND)
    j1 = _create_job(contract, tracker, writer=BOB)
    _assert_conservation(contract, tracker)

    _set_caller(contract, tracker, ALICE)
    contract.cancel(j1)
    _assert_conservation(contract, tracker)


def test_conservation_holds_across_expire_open(monkeypatch):
    contract, tracker = _setup_context(monkeypatch, current_time=1_700_000_000)
    dl = u256(1_700_000_000 + 4000)
    j1 = _create_job(contract, tracker, writer=BOB, deadline=dl)
    _assert_conservation(contract, tracker)

    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(1_700_000_000 + 5000, tz=timezone.utc))
    contract.expire(j1)
    _assert_conservation(contract, tracker)


# ==============================================================================
# 21. Failed transfers preserve conservation through credits_total
# ==============================================================================
def test_failed_transfers_preserve_conservation_through_credits(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    _post_bond(contract, tracker, BOB, BOND)
    j1 = _create_job(contract, tracker, writer=BOB)

    # Make transfer to ALICE fail during cancel
    tracker.fail_transfers[str(ALICE).lower()] = True

    _set_caller(contract, tracker, ALICE)
    contract.cancel(j1)

    # Transfer failed, so escrow is credited to ALICE
    assert contract.get_credit(str(ALICE)) == int(ESCROW)
    assert contract.credits_total == ESCROW

    # Conservation holds with credit!
    _assert_conservation(contract, tracker)

    # Now fix transfer and withdraw
    tracker.fail_transfers[str(ALICE).lower()] = False
    _set_caller(contract, tracker, ALICE)
    contract.withdraw()

    assert contract.get_credit(str(ALICE)) == 0
    assert contract.credits_total == 0
    assert tracker.received[str(ALICE).lower()] == int(ESCROW)

    # Conservation continues to hold!
    _assert_conservation(contract, tracker)


# ==============================================================================
# 22. Adversarial bonded views: corrupted reservation
# ==============================================================================
def test_adversarial_bonded_views_corrupted_reservation(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    _post_bond(contract, tracker, BOB, BOND)
    j1 = _create_job(contract, tracker, writer=BOB)

    # Initial state is healthy BONDED
    view = contract.get_job(j1)
    assert view["bonded"] is True
    check = contract.check_bond(j1)
    assert check["bonded"] is True

    # Case 1: total bond is sufficiently large, job.reserved_bond equals pay_c,
    # but aggregate reserved_bonds is zero
    contract.reserved_bonds[str(BOB).lower()] = u256(0)
    assert contract.bonds[str(BOB).lower()] >= contract.jobs[j1].pay_c
    assert contract.jobs[j1].reserved_bond == contract.jobs[j1].pay_c

    view = contract.get_job(j1)
    assert view["bonded"] is False
    check = contract.check_bond(j1)
    assert check["bonded"] is False

    # Case 2: aggregate reserved_bonds is smaller than the job reservation
    contract.reserved_bonds[str(BOB).lower()] = u256(int(PAY_C) - 1)
    view = contract.get_job(j1)
    assert view["bonded"] is False
    check = contract.check_bond(j1)
    assert check["bonded"] is False


# ==============================================================================
# 23. writer_active underflow fails closed
# ==============================================================================
def test_writer_active_underflow_fails_closed(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    _post_bond(contract, tracker, BOB, BOND)
    j1 = _create_job(contract, tracker, writer=BOB)
    assert int(contract.writer_active[str(BOB).lower()]) == 1

    # Directly corrupt writer_active to 0
    contract.writer_active[str(BOB).lower()] = u256(0)

    # Terminal transition (cancel) must fail instead of silently clamping to zero
    _set_caller(contract, tracker, ALICE)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.cancel(j1)
    assert "[EXPECTED] writer_active underflow" in str(excinfo.value)

    # Normal lifecycle continues to prove exactly one decrement per terminal transition
    contract.writer_active[str(BOB).lower()] = u256(1)
    contract.cancel(j1)
    assert int(contract.writer_active[str(BOB).lower()]) == 0


# ==============================================================================
# 24. Adjudication grace deadline exact boundary tests
# ==============================================================================
def test_adjudication_grace_exact_boundaries(monkeypatch):
    t0 = 1_700_000_000
    dl_sec = t0 + 4000
    grace_threshold = dl_sec + SETTLEMENT_GRACE_PERIOD_SEC

    contract, tracker = _setup_context(monkeypatch, current_time=t0)
    _post_bond(contract, tracker, BOB, BOND)
    j1 = _create_job(contract, tracker, writer=BOB, deadline=u256(dl_sec))

    _set_caller(contract, tracker, BOB)
    contract.submit(j1, DELIVERABLE, "")
    _set_caller(contract, tracker, CHARLIE)
    contract.ack_downstream(j1, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")
    assert contract.get_job(j1)["state"] == "ACKED"

    # Exact boundary 1: current_time == grace_threshold
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(grace_threshold, tz=timezone.utc))

    # Expiry at grace_threshold is rejected
    _set_caller(contract, tracker, ALICE)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.expire(j1)
    assert "[EXPECTED] settlement grace period not passed" in str(excinfo.value)

    # Adjudication at grace_threshold is allowed
    monkeypatch.setattr(gl.eq_principle, "strict_eq", lambda fn: {"fault": "none", "pay_downstream": True, "slash_bps": 0, "undetermined": False})
    contract.adjudicate(j1)
    assert contract.get_job(j1)["state"] == "SETTLED_OK"

    # Exact boundary 2: current_time == grace_threshold + 1
    # Create second job j2 in ACKED state
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(t0, tz=timezone.utc))
    j2 = _create_job(contract, tracker, writer=BOB, deadline=u256(dl_sec))
    _set_caller(contract, tracker, BOB)
    contract.submit(j2, DELIVERABLE, "")
    _set_caller(contract, tracker, CHARLIE)
    contract.ack_downstream(j2, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")
    assert contract.get_job(j2)["state"] == "ACKED"

    # Set time to 1 second after grace_threshold
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(grace_threshold + 1, tz=timezone.utc))

    # Adjudication 1 second after grace_threshold is rejected
    _set_caller(contract, tracker, ALICE)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.adjudicate(j2)
    assert "[EXPECTED] settlement grace passed; expire required" in str(excinfo.value)

    # Expiry 1 second after grace_threshold succeeds
    contract.expire(j2)
    assert contract.get_job(j2)["state"] == "CANCELED"


# ==============================================================================
# 25. withdraw accounting corruption, restore, and success
# ==============================================================================
def test_withdraw_accounting_corruption_and_recovery(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    credit_amt = u256(15 * 10**18)
    alice_key = str(ALICE).lower()

    contract.credits[alice_key] = credit_amt
    contract.credits_total = credit_amt

    # 1. Corrupted credits_total smaller than user credit fails without mutation
    contract.credits_total = u256(10 * 10**18)
    _set_caller(contract, tracker, ALICE)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.withdraw()
    assert "[EXPECTED] corrupted credits accounting: user credit exceeds credits_total" in str(excinfo.value)
    assert contract.credits[alice_key] == credit_amt
    assert contract.credits_total == u256(10 * 10**18)

    # Restore credits_total
    contract.credits_total = credit_amt

    # 2. Failed withdrawal restores exact original credit totals
    tracker.fail_transfers[alice_key] = True
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.withdraw()
    assert "[EXPECTED] withdraw transfer failed; credits restored" in str(excinfo.value)
    assert contract.credits[alice_key] == credit_amt
    assert contract.credits_total == credit_amt

    # 3. Successful withdrawal
    tracker.fail_transfers[alice_key] = False
    contract.withdraw()
    assert contract.credits[alice_key] == u256(0)
    assert contract.credits_total == u256(0)
    assert tracker.received[alice_key] == int(credit_amt)


# ==============================================================================
# 26. OPEN-state invariant corruption checks
# ==============================================================================
def test_open_state_invariant_corruption_checks(monkeypatch):
    t0 = 1_700_000_000
    dl_sec = t0 + 4000
    contract, tracker = _setup_context(monkeypatch, current_time=t0)
    j1 = _create_job(contract, tracker, writer=BOB, deadline=u256(dl_sec))
    assert contract.get_job(j1)["state"] == "OPEN"
    assert contract.jobs[j1].reserved_bond == u256(0)

    # Subtest 1: cancel OPEN job with reserved_bond > 0 reverts
    job_obj = contract.jobs[j1]
    job_obj.reserved_bond = u256(1)
    contract.jobs[j1] = job_obj

    _set_caller(contract, tracker, ALICE)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.cancel(j1)
    assert "[EXPECTED] corrupted OPEN job reservation: expected 0" in str(excinfo.value)

    # Subtest 2: expire OPEN job with reserved_bond > 0 reverts
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(dl_sec + 10, tz=timezone.utc))
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.expire(j1)
    assert "[EXPECTED] corrupted OPEN job reservation: expected 0" in str(excinfo.value)

    # Subtest 3: post_bond encountering OPEN job with reserved_bond > 0 reverts
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(t0, tz=timezone.utc))
    _set_caller(contract, tracker, BOB, BOND)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.post_bond()
    assert "[EXPECTED] corrupted OPEN job reservation: expected 0" in str(excinfo.value)


# ==============================================================================
# 27. Explicit aggregate-debit checks
# ==============================================================================
def test_explicit_aggregate_debit_checks(monkeypatch):
    contract, tracker = _setup_context(monkeypatch)
    _post_bond(contract, tracker, BOB, BOND)

    # 1. unbond: locked_bonds < available
    contract.locked_bonds = u256(10 * 10**18)  # Available is 50 ETH > 10 ETH
    _set_caller(contract, tracker, BOB)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.unbond()
    assert "[EXPECTED] corrupted aggregate accounting: locked_bonds < available" in str(excinfo.value)
    contract.locked_bonds = BOND

    # 2. cancel: locked_jobs < escrow
    j1 = _create_job(contract, tracker, writer=BOB)
    contract.locked_jobs = u256(10 * 10**18)  # ESCROW is 35 ETH > 10 ETH
    _set_caller(contract, tracker, ALICE)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.cancel(j1)
    assert "[EXPECTED] corrupted aggregate accounting: locked_jobs < escrow" in str(excinfo.value)


# ==============================================================================
# 28. Central active-reservation validator fails closed
# ==============================================================================
def test_central_active_reservation_validator_fail_closed(monkeypatch):
    t0 = 1_700_000_000
    dl_sec = t0 + 4000
    contract, tracker = _setup_context(monkeypatch, current_time=t0)
    _post_bond(contract, tracker, BOB, BOND)
    j1 = _create_job(contract, tracker, writer=BOB, deadline=u256(dl_sec))
    assert contract.get_job(j1)["state"] == "BONDED"

    # Corrupt job reservation on BONDED job
    job_obj = contract.jobs[j1]
    job_obj.reserved_bond = u256(0)
    contract.jobs[j1] = job_obj

    # 1. Submit from BONDED fails closed
    _set_caller(contract, tracker, BOB)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.submit(j1, DELIVERABLE, "")
    assert "[EXPECTED] corrupted bond reservation accounting" in str(excinfo.value)

    # 2. Cancel from BONDED fails closed
    _set_caller(contract, tracker, ALICE)
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.cancel(j1)
    assert "[EXPECTED] corrupted bond reservation accounting" in str(excinfo.value)

    # 3. Expiry from BONDED fails closed
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.fromtimestamp(dl_sec + 10, tz=timezone.utc))
    with pytest.raises(gl.vm.UserError) as excinfo:
        contract.expire(j1)
    assert "[EXPECTED] corrupted bond reservation accounting" in str(excinfo.value)
