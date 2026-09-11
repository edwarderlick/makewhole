new_tests = """
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
    job_id = contract.create_job(BRIEF, PAY_B, PAY_C, 0, int(time.time() + 301), str(direct_bob), str(direct_charlie), "write")
    
    # fake time passage for expire
    direct_vm.message_raw = {"datetime": "2050-01-01T00:00:20Z"}
    contract.expire(job_id)
    job = contract.get_job(job_id)
    assert job["state"] == "CANCELED"

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
    contract.withdraw()
    assert contract.get_credit(str(direct_bob)) == 0
    
    # Try reverting withdraw
    contract.credits[contract._addr_key(str(direct_bob))] = 100
    direct_vm.will_revert_transfer = True
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert():
        contract.withdraw()
    assert contract.get_credit(str(direct_bob)) == 100

def test_backit_post_bond_under_pay_c(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = ESCROW
    job_id = contract.create_job(BRIEF, PAY_B, PAY_C, 0, int(time.time() + 3600), str(direct_bob), str(direct_charlie), "write")
    
    direct_vm.sender = direct_bob
    direct_vm.value = PAY_C - 1
    with direct_vm.expect_revert():
        contract.post_bond()
        
def test_backit_create_job_escrow_under(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = PAY_B + PAY_C + 50 - 1
    with direct_vm.expect_revert():
        contract.create_job(BRIEF, PAY_B, PAY_C, 50, int(time.time() + 3600), str(direct_bob), str(direct_charlie), "write")
"""

with open("tests/direct/test_makewhole_more.py", "a", encoding="utf-8") as f:
    f.write(new_tests)
