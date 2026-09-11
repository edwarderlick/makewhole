import re

with open("tests/direct/test_makewhole_more.py", "r", encoding="utf-8") as f:
    code = f.read()

# Add ESCROW
code = code.replace('PREMIUM = _base.PREMIUM', 'PREMIUM = _base.PREMIUM\nESCROW = _base.ESCROW')

# Fix test_withdraw_success_and_transfer_failure
old_withdraw = '''    direct_vm.sender = direct_bob
    contract.withdraw()
    assert contract.get_credit(str(direct_bob)) == 0
    
    # Try reverting withdraw
    contract.credits[contract._addr_key(str(direct_bob))] = 100
    direct_vm.will_revert_transfer = True
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert():
        contract.withdraw()
    assert contract.get_credit(str(direct_bob)) == 100'''
new_withdraw = '''    # Inject credit directly to test withdraw
    contract.credits[contract._addr_key(str(direct_bob))] = 100
    
    # Transfer failure path
    direct_vm.will_revert_transfer = True
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert():
        contract.withdraw()
    assert contract.get_credit(str(direct_bob)) == 100
    
    # Transfer success path
    direct_vm.will_revert_transfer = False
    contract.withdraw()
    assert contract.get_credit(str(direct_bob)) == 0'''
code = code.replace(old_withdraw, new_withdraw)

with open("tests/direct/test_makewhole_more.py", "w", encoding="utf-8") as f:
    f.write(code)
