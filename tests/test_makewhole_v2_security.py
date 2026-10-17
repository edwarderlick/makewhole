import sys
import importlib.util
from datetime import datetime, timezone
from pathlib import Path
import pytest

# Resolve the pinned contract SDK portably via gltest's sdk_loader
from gltest.direct.sdk_loader import setup_sdk_paths

_contract_path = Path("contracts/makewhole.py").resolve()
setup_sdk_paths(_contract_path)

import genlayer as gl
from genlayer.types import Address, u256
from genlayer.storage._internal.generate import _storage_build, _BuilderCtx
import gltest.direct.vm as vm_mod

# Load Makewhole contract dynamically
_spec = importlib.util.spec_from_file_location("makewhole_v2", _contract_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

Makewhole = _mod.Makewhole
MIN_DEADLINE_LEAD_TIME_SEC = _mod.MIN_DEADLINE_LEAD_TIME_SEC
_get_trusted_chain_time = _mod._get_trusted_chain_time

ALICE = Address("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
BOB = Address("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
CHARLIE = Address("0xcccccccccccccccccccccccccccccccccccccccc")

BRIEF = "https://gist.githubusercontent.com/makewhole/fixtures/raw/brief.md"
DELIVERABLE = "https://gist.githubusercontent.com/makewhole/fixtures/raw/good-write.md"
PAY_B = u256(20 * 10**18)
PAY_C = u256(12 * 10**18)
PREMIUM = u256(3 * 10**18)
ESCROW = u256(35 * 10**18)
BOND = u256(50 * 10**18)
POOL = u256(100 * 10**18)


class FakeMessage:
    def __init__(self, sender, value=u256(0)):
        self.sender_address = sender
        self.value = value


def _set_sender(sender, value=u256(0)):
    gl.message = FakeMessage(sender=sender, value=value)


def _make_contract():
    vm = vm_mod.VMContext()
    td = _storage_build(_BuilderCtx.empty(), Makewhole)
    slot = vm._storage.get_store_slot(b"\x00" * 32)
    instance = td.get(slot, 0)
    instance.__init__()
    return instance


def test_trusted_time_unavailable_fails_closed(monkeypatch):
    def _raise():
        raise RuntimeError("RPC timestamp unavailable")

    monkeypatch.setattr(gl.vm, "get_timestamp", _raise)
    with pytest.raises(gl.vm.UserError) as exc_info:
        _get_trusted_chain_time()
    assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)
    # Ensure underlying exception text is not leaked
    assert "RPC timestamp unavailable" not in str(exc_info.value)


def test_trusted_time_non_datetime_fails_closed(monkeypatch):
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: "2026-10-16T21:00:00Z")
    with pytest.raises(gl.vm.UserError) as exc_info:
        _get_trusted_chain_time()
    assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)


def test_trusted_time_naive_datetime_fails_closed(monkeypatch):
    # Naive datetime lacking timezone/UTC offset
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime(2026, 10, 16, 21, 0, 0))
    with pytest.raises(gl.vm.UserError) as exc_info:
        _get_trusted_chain_time()
    assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)


def test_trusted_time_non_positive_timestamp_fails_closed(monkeypatch):
    # Epoch zero
    monkeypatch.setattr(
        gl.vm,
        "get_timestamp",
        lambda: datetime(1970, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
    )
    with pytest.raises(gl.vm.UserError) as exc_info:
        _get_trusted_chain_time()
    assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)


def test_trusted_time_valid_parses_utc(monkeypatch):
    fixed_dt = datetime(2026, 10, 16, 21, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: fixed_dt)
    expected = int(fixed_dt.timestamp())
    assert _get_trusted_chain_time() == expected


def test_create_job_boundary_unavailable_time(monkeypatch):
    c = _make_contract()
    _set_sender(ALICE, value=ESCROW)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: None)
    with pytest.raises(gl.vm.UserError) as exc_info:
        c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, u256(2000000000), BOB, CHARLIE)
    assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)


def test_create_job_boundary_zero_deadline(monkeypatch):
    c = _make_contract()
    base_dt = datetime(2026, 10, 16, 21, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: base_dt)
    _set_sender(ALICE, value=ESCROW)
    with pytest.raises(gl.vm.UserError) as exc_info:
        c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, u256(0), BOB, CHARLIE)
    assert "[EXPECTED] deadline must be > 0" in str(exc_info.value)


def test_create_job_boundary_past_deadline(monkeypatch):
    c = _make_contract()
    base_dt = datetime(2026, 10, 16, 21, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: base_dt)
    now = int(base_dt.timestamp())
    _set_sender(ALICE, value=ESCROW)
    with pytest.raises(gl.vm.UserError) as exc_info:
        c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, u256(now - 1), BOB, CHARLIE)
    assert "[EXPECTED] deadline is in the past" in str(exc_info.value)


def test_create_job_boundary_one_second_below_minimum_lead_time(monkeypatch):
    c = _make_contract()
    base_dt = datetime(2026, 10, 16, 21, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: base_dt)
    now = int(base_dt.timestamp())
    _set_sender(ALICE, value=ESCROW)
    with pytest.raises(gl.vm.UserError) as exc_info:
        c.create_job(
            BRIEF,
            PAY_B,
            PAY_C,
            PREMIUM,
            u256(now + MIN_DEADLINE_LEAD_TIME_SEC - 1),
            BOB,
            CHARLIE,
        )
    assert f"[EXPECTED] deadline must be at least {MIN_DEADLINE_LEAD_TIME_SEC}s in future" in str(exc_info.value)


def test_create_job_boundary_exactly_minimum_lead_time(monkeypatch):
    c = _make_contract()
    base_dt = datetime(2026, 10, 16, 21, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: base_dt)
    now = int(base_dt.timestamp())
    _set_sender(ALICE, value=ESCROW)
    deadline = u256(now + MIN_DEADLINE_LEAD_TIME_SEC)
    job_id = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)
    assert job_id.startswith("0x")
    job = c.get_job(job_id)
    assert job["deadline"] == int(deadline)


def test_expire_boundary_unavailable_time(monkeypatch):
    c = _make_contract()
    base_dt = datetime(2026, 10, 16, 21, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: base_dt)
    now = int(base_dt.timestamp())
    _set_sender(ALICE, value=ESCROW)
    deadline = u256(now + 3600)
    job_id = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)

    # Time becomes unavailable when expire is called
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: None)
    with pytest.raises(gl.vm.UserError) as exc_info:
        c.expire(job_id)
    assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)
    # Ensure job state was untouched
    assert c.get_job(job_id)["state"] == "OPEN"


def test_expire_boundary_at_deadline_fails(monkeypatch):
    c = _make_contract()
    base_dt = datetime(2026, 10, 16, 21, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: base_dt)
    now = int(base_dt.timestamp())
    _set_sender(ALICE, value=ESCROW)
    deadline = u256(now + 3600)
    job_id = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)

    # Advance time to exactly deadline
    at_deadline_dt = datetime.fromtimestamp(int(deadline), tz=timezone.utc)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: at_deadline_dt)
    with pytest.raises(gl.vm.UserError) as exc_info:
        c.expire(job_id)
    assert "[EXPECTED] deadline not passed" in str(exc_info.value)
    assert c.get_job(job_id)["state"] == "OPEN"


def test_expire_boundary_one_second_after_deadline_succeeds(monkeypatch):
    c = _make_contract()
    base_dt = datetime(2026, 10, 16, 21, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: base_dt)
    now = int(base_dt.timestamp())
    _set_sender(ALICE, value=ESCROW)
    deadline = u256(now + 3600)
    job_id = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)

    # Advance time to deadline + 1 second
    after_deadline_dt = datetime.fromtimestamp(int(deadline) + 1, tz=timezone.utc)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: after_deadline_dt)
    c.expire(job_id)
    job = c.get_job(job_id)
    assert job["state"] == "CANCELED"


def test_submit_hop_regression_stores_url_and_hash(monkeypatch):
    c = _make_contract()
    base_dt = datetime(2026, 10, 16, 21, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: base_dt)
    now = int(base_dt.timestamp())

    # Bob posts bond
    _set_sender(BOB, value=BOND)
    c.post_bond()

    # Alice creates job
    _set_sender(ALICE, value=ESCROW)
    deadline = u256(now + 3600)
    job_id = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)
    assert c.get_job(job_id)["state"] == "BONDED"

    # Bob submits writer hop with deliverable_hash
    test_hash = "0x" + "a1b2c3d4" * 8
    _set_sender(BOB)
    # Must pass deliverable_hash without TypeError, storing both url and hash
    c.submit_hop(job_id, "write", DELIVERABLE, test_hash)

    job = c.get_job(job_id)
    assert job["state"] == "IN_FLIGHT"
    assert job["deliverable_url"] == DELIVERABLE
    assert job["deliverable_hash"] == test_hash
