import sys
import importlib.util
from datetime import datetime, timezone, tzinfo, timedelta
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
SETTLEMENT_GRACE_PERIOD_SEC = _mod.SETTLEMENT_GRACE_PERIOD_SEC
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


class MockDatetime(datetime):
    _current = None
    _raise_on_now = False

    @classmethod
    def now(cls, tz=None):
        if cls._raise_on_now:
            raise RuntimeError("Clock unavailable")
        val = cls._current
        if val is None:
            return None
        if not isinstance(val, datetime):
            return val
        if val.tzinfo is None or val.utcoffset() is None:
            return val
        if type(val) is BrokenTimestamp:
            return val
        if tz is not None:
            if val.tzinfo == tz and isinstance(val, cls):
                return val
            converted = val.astimezone(tz)
            return cls(converted.year, converted.month, converted.day, converted.hour, converted.minute, converted.second, converted.microsecond, tzinfo=converted.tzinfo)
        return val


class BrokenTz(tzinfo):
    def utcoffset(self, dt):
        return None

    def tzname(self, dt):
        return "BROKEN"

    def dst(self, dt):
        return None


class BrokenTimestamp(MockDatetime):
    def timestamp(self):
        raise OverflowError("Timestamp conversion failed")


_mod.datetime = MockDatetime


def _set_time(val):
    MockDatetime._raise_on_now = False
    if val is None:
        MockDatetime._current = None
    elif isinstance(val, (int, float)):
        MockDatetime._current = MockDatetime.fromtimestamp(val, tz=timezone.utc)
    elif isinstance(val, str):
        dt = datetime.fromisoformat(val.replace("Z", "+00:00").replace("z", "+00:00"))
        MockDatetime._current = MockDatetime(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second, dt.microsecond, tzinfo=dt.tzinfo)
    elif isinstance(val, datetime):
        if type(val) is BrokenTimestamp:
            MockDatetime._current = val
        elif type(val) is not MockDatetime:
            MockDatetime._current = MockDatetime(val.year, val.month, val.day, val.hour, val.minute, val.second, val.microsecond, tzinfo=val.tzinfo)
        else:
            MockDatetime._current = val
    else:
        MockDatetime._current = val


def _make_contract():
    vm = vm_mod.VMContext()
    td = _storage_build(_BuilderCtx.empty(), Makewhole)
    slot = vm._storage.get_store_slot(b"\x00" * 32)
    instance = td.get(slot, 0)
    instance.__init__()
    return instance


# ==============================================================================
# Transaction time parsing and failure isolation tests
# ==============================================================================

def test_trusted_chain_time_deterministic_aware_utc_datetime():
    _set_time(datetime(2026, 10, 18, 7, 0, 14, tzinfo=timezone.utc))
    assert _get_trusted_chain_time() == 1792306814
    _set_time("2026-10-18T07:00:14Z")
    assert _get_trusted_chain_time() == 1792306814
    _set_time("2026-10-18T07:00:14.123456+00:00")
    assert _get_trusted_chain_time() == 1792306814


def test_trusted_chain_time_aware_nonzero_timezone_offset():
    # Same instant across different timezone representations: 1792306814
    ist = timezone(timedelta(hours=5, minutes=30))
    edt = timezone(timedelta(hours=-4))
    cest = timezone(timedelta(hours=2))

    _set_time(datetime(2026, 10, 18, 12, 30, 14, tzinfo=ist))
    assert _get_trusted_chain_time() == 1792306814
    _set_time(datetime(2026, 10, 18, 3, 0, 14, tzinfo=edt))
    assert _get_trusted_chain_time() == 1792306814
    _set_time(datetime(2026, 10, 18, 9, 0, 14, tzinfo=cest))
    assert _get_trusted_chain_time() == 1792306814


def test_trusted_chain_time_clock_call_raises_fails_closed():
    MockDatetime._raise_on_now = True
    try:
        with pytest.raises(gl.vm.UserError) as exc_info:
            _get_trusted_chain_time()
        assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)
    finally:
        MockDatetime._raise_on_now = False


def test_trusted_chain_time_clock_returns_non_datetime_fails_closed():
    for val in [None, 1792306814, "2026-10-18T07:00:14Z", True, False, 123.456, [1792306814], {"time": 1792306814}]:
        MockDatetime._current = val
        with pytest.raises(gl.vm.UserError) as exc_info:
            _get_trusted_chain_time()
        assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)


def test_trusted_chain_time_timezone_naive_fails_closed():
    for dt_naive in [
        MockDatetime(2026, 10, 18, 7, 0, 14),
        MockDatetime(2026, 1, 1, 0, 0, 0),
        "2026-10-18T07:00:14",
    ]:
        _set_time(dt_naive)
        with pytest.raises(gl.vm.UserError) as exc_info:
            _get_trusted_chain_time()
        assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)


def test_trusted_chain_time_invalid_or_unavailable_offset_fails_closed():
    broken_tz_dt = MockDatetime(2026, 10, 18, 7, 0, 14, tzinfo=BrokenTz())
    _set_time(broken_tz_dt)
    with pytest.raises(gl.vm.UserError) as exc_info:
        _get_trusted_chain_time()
    assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)


def test_trusted_chain_time_timestamp_conversion_raises_fails_closed():
    broken_ts_dt = BrokenTimestamp.fromtimestamp(1792306814, tz=timezone.utc)
    _set_time(broken_ts_dt)
    with pytest.raises(gl.vm.UserError) as exc_info:
        _get_trusted_chain_time()
    assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)


def test_trusted_chain_time_zero_and_negative_timestamps_fail_closed():
    for val in [
        MockDatetime(1970, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
        MockDatetime(1969, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
        MockDatetime(1900, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
        "1970-01-01T00:00:00Z",
        "1969-12-31T23:59:59Z",
        0,
        -1,
    ]:
        _set_time(val)
        with pytest.raises(gl.vm.UserError) as exc_info:
            _get_trusted_chain_time()
        assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)


# ==============================================================================
# Job lifecycle time-boundary tests
# ==============================================================================

def test_create_job_boundary_unavailable_time():
    c = _make_contract()
    _set_sender(ALICE, value=ESCROW)
    _set_time(None)
    with pytest.raises(gl.vm.UserError) as exc_info:
        c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, u256(2000000000), BOB, CHARLIE)
    assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)


def test_create_job_boundary_zero_deadline():
    c = _make_contract()
    _set_time("2026-10-16T21:00:00Z")
    _set_sender(ALICE, value=ESCROW)
    with pytest.raises(gl.vm.UserError) as exc_info:
        c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, u256(0), BOB, CHARLIE)
    assert "[EXPECTED] deadline must be > 0" in str(exc_info.value)


def test_create_job_boundary_past_deadline():
    c = _make_contract()
    _set_time("2026-10-16T21:00:00Z")
    now = 1792184400
    _set_sender(ALICE, value=ESCROW)
    with pytest.raises(gl.vm.UserError) as exc_info:
        c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, u256(now - 1), BOB, CHARLIE)
    assert "[EXPECTED] deadline is in the past" in str(exc_info.value)


def test_create_job_boundary_one_second_below_minimum_lead_time():
    c = _make_contract()
    _set_time("2026-10-16T21:00:00Z")
    now = 1792184400
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


def test_create_job_boundary_exactly_minimum_lead_time():
    c = _make_contract()
    _set_time("2026-10-16T21:00:00Z")
    now = 1792184400
    _set_sender(ALICE, value=ESCROW)
    deadline = u256(now + MIN_DEADLINE_LEAD_TIME_SEC)
    job_id = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)
    assert job_id.startswith("0x")
    job = c.get_job(job_id)
    assert job["deadline"] == int(deadline)


def test_expire_boundary_unavailable_time():
    c = _make_contract()
    _set_time("2026-10-16T21:00:00Z")
    now = 1792184400
    _set_sender(ALICE, value=ESCROW)
    deadline = u256(now + 3600)
    job_id = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)

    # Time becomes unavailable when expire is called
    _set_time(None)
    with pytest.raises(gl.vm.UserError) as exc_info:
        c.expire(job_id)
    assert "[TRANSIENT] trusted chain time unavailable" in str(exc_info.value)
    # Ensure job state was untouched
    assert c.get_job(job_id)["state"] == "OPEN"


def test_expire_boundary_at_deadline_fails():
    c = _make_contract()
    _set_time("2026-10-16T21:00:00Z")
    now = 1792184400
    _set_sender(ALICE, value=ESCROW)
    deadline = u256(now + 3600)
    job_id = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)

    # Advance time to exactly deadline
    _set_time(int(deadline))
    with pytest.raises(gl.vm.UserError) as exc_info:
        c.expire(job_id)
    assert "[EXPECTED] deadline not passed" in str(exc_info.value)
    assert c.get_job(job_id)["state"] == "OPEN"


def test_expire_boundary_one_second_after_deadline_succeeds():
    c = _make_contract()
    _set_time("2026-10-16T21:00:00Z")
    now = 1792184400
    _set_sender(ALICE, value=ESCROW)
    deadline = u256(now + 3600)
    job_id = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)

    # Advance time to deadline + 1 second
    _set_time(int(deadline) + 1)
    c.expire(job_id)
    job = c.get_job(job_id)
    assert job["state"] == "CANCELED"


def test_submit_and_ack_deadline_checks_use_transaction_time():
    c = _make_contract()
    t0 = 1792184400
    _set_time(t0)

    # Writer posts bond
    _set_sender(BOB, value=BOND)
    c.post_bond()

    # Client creates job
    _set_sender(ALICE, value=ESCROW)
    deadline = u256(t0 + 4000)
    job_id = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)
    assert c.get_job(job_id)["state"] == "BONDED"

    # Fast forward past deadline for submit
    _set_time(t0 + 4001)
    _set_sender(BOB)
    with pytest.raises(gl.vm.UserError) as excinfo:
        c.submit(job_id, DELIVERABLE, "0x123")
    assert "[EXPECTED] deadline passed" in str(excinfo.value)

    # Within deadline, submit succeeds
    _set_time(t0 + 2000)
    c.submit(job_id, DELIVERABLE, "0x123")
    assert c.get_job(job_id)["state"] == "IN_FLIGHT"

    # Fast forward past deadline for ack
    _set_time(t0 + 4001)
    _set_sender(CHARLIE)
    with pytest.raises(gl.vm.UserError) as excinfo:
        c.ack_downstream(job_id, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")
    assert "[EXPECTED] deadline passed" in str(excinfo.value)

    # Within deadline, ack succeeds
    _set_time(t0 + 3000)
    c.ack_downstream(job_id, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")
    assert c.get_job(job_id)["state"] == "ACKED"


def test_adjudication_grace_uses_transaction_time(monkeypatch):
    c = _make_contract()
    t0 = 1792184400
    dl_sec = t0 + 4000
    grace_threshold = dl_sec + SETTLEMENT_GRACE_PERIOD_SEC

    _set_time(t0)
    _set_sender(BOB, value=BOND)
    c.post_bond()
    _set_sender(ALICE, value=ESCROW)
    j1 = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, u256(dl_sec), BOB, CHARLIE)

    _set_sender(BOB)
    c.submit(j1, DELIVERABLE, "0x123")
    _set_sender(CHARLIE)
    c.ack_downstream(j1, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")
    assert c.get_job(j1)["state"] == "ACKED"

    # At exact grace threshold: expire is rejected, adjudication is permitted
    _set_time(grace_threshold)
    _set_sender(ALICE)
    with pytest.raises(gl.vm.UserError) as excinfo:
        c.expire(j1)
    assert "[EXPECTED] settlement grace period not passed" in str(excinfo.value)

    monkeypatch.setattr(gl.eq_principle, "strict_eq", lambda fn: {"fault": "none", "pay_downstream": True, "slash_bps": 0, "undetermined": False})
    c.adjudicate(j1)
    assert c.get_job(j1)["state"] == "SETTLED_OK"

    # Second job: past grace threshold + 1
    _set_time(t0)
    _set_sender(ALICE, value=ESCROW)
    j2 = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, u256(dl_sec), BOB, CHARLIE)
    _set_sender(BOB)
    c.submit(j2, DELIVERABLE, "0x456")
    _set_sender(CHARLIE)
    c.ack_downstream(j2, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md")

    _set_time(grace_threshold + 1)
    _set_sender(ALICE)
    with pytest.raises(gl.vm.UserError) as excinfo:
        c.adjudicate(j2)
    assert "[EXPECTED] settlement grace passed; expire required" in str(excinfo.value)

    # Expiry is allowed after grace threshold
    c.expire(j2)
    assert c.get_job(j2)["state"] == "CANCELED"


def test_submit_hop_regression_stores_url_and_hash():
    c = _make_contract()
    _set_time("2026-10-16T21:00:00Z")
    now = 1792184400

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
    c.submit_hop(job_id, "write", DELIVERABLE, test_hash)

    job = c.get_job(job_id)
    assert job["state"] == "IN_FLIGHT"
    assert job["deliverable_url"] == DELIVERABLE
    assert job["deliverable_hash"] == test_hash


def test_production_regression_validator_pinned_clock_without_get_timestamp_or_message_raw(monkeypatch):
    """
    Regression test for production transaction 0x692c41c10086402f8f5f00be342fb844a77e7a32312e1927f4c0da55055de763:
    In Studio-dev, gl.vm.get_timestamp is absent or raises, and gl.message_raw may also be absent.
    The validator-pinned datetime.now(timezone.utc) returns a valid transaction time.
    create_job must succeed and transition to OPEN or BONDED with correct bond reservation paths.
    """
    c = _make_contract()

    # Ensure get_timestamp is absent or raises on gl.vm
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda *a, **k: (_ for _ in ()).throw(AttributeError("no get_timestamp")), raising=False)

    # Ensure message_raw is absent
    if hasattr(gl, "message_raw"):
        monkeypatch.delattr(gl, "message_raw", raising=False)

    # Set validator-pinned transaction time
    _set_time("2026-10-18T07:00:14.000Z")
    now = 1792306814
    deadline = u256(now + 4000)

    # 1. Unbonded writer -> job enters OPEN
    _set_sender(ALICE, value=ESCROW)
    j1 = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)
    assert j1.startswith("0x")
    job1 = c.get_job(j1)
    assert job1["state"] == "OPEN"
    assert job1["bonded"] is False
    assert job1["reserved_bond"] == 0

    # 2. Bonded writer -> job enters BONDED
    _set_sender(BOB, value=BOND)
    c.post_bond()
    _set_sender(ALICE, value=ESCROW)
    j2 = c.create_job(BRIEF, PAY_B, PAY_C, PREMIUM, deadline, BOB, CHARLIE)
    assert j2.startswith("0x")
    job2 = c.get_job(j2)
    assert job2["state"] == "BONDED"
    assert job2["bonded"] is True
    assert job2["reserved_bond"] == int(PAY_C)
