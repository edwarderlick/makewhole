import glob
import re

for file in glob.glob("tests/direct/*.py"):
    with open(file, "r", encoding="utf-8") as f:
        code = f.read()
    
    # 1. Update _create helper in test files
    old_create_sig = '''def _create(direct_vm, contract, a, b, c):'''
    new_create_sig = '''def _create(direct_vm, contract, a, b, c, premium=0, deadline=2000000000):'''
    code = code.replace(old_create_sig, new_create_sig)
    
    old_create_call = '''    return contract.create_job(BRIEF, pay_b, pay_c, str(b), str(c), "write")'''
    new_create_call = '''    return contract.create_job(BRIEF, pay_b, pay_c, premium, deadline, str(b), str(c), "write")'''
    code = code.replace(old_create_call, new_create_call)
    
    # Also fix explicit calls if any
    # contract.submit(job_id, GOOD) -> contract.submit(job_id, GOOD, "")
    code = re.sub(
        r'contract\.submit\(([^,]+),\s*([^)]+)\)',
        r'contract.submit(\1, \2, "")',
        code
    )
    
    # contract.submit_hop(job_id, "write", GOOD) -> contract.submit_hop(job_id, "write", GOOD, "")
    code = re.sub(
        r'contract\.submit_hop\(([^,]+),\s*([^,]+),\s*([^)]+)\)',
        r'contract.submit_hop(\1, \2, \3, "")',
        code
    )

    with open(file, "w", encoding="utf-8") as f:
        f.write(code)
