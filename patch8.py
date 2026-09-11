import glob
import re

for file in glob.glob("tests/direct/*.py"):
    with open(file, "r", encoding="utf-8") as f:
        code = f.read()
    
    if "import time" not in code:
        code = "import time\n" + code

    old_create_sig = '''def _create(direct_vm, contract, a, b, c, premium=0, deadline=2000000000):'''
    new_create_sig = '''def _create(direct_vm, contract, a, b, c, premium=0, deadline=0):'''
    code = code.replace(old_create_sig, new_create_sig)
    
    old_create_call = '''    return contract.create_job(BRIEF, pay_b, pay_c, premium, deadline, str(b), str(c), "write")'''
    new_create_call = '''    return contract.create_job(BRIEF, pay_b, pay_c, premium, deadline or int(time.time() + 3600), str(b), str(c), "write")'''
    code = code.replace(old_create_call, new_create_call)

    with open(file, "w", encoding="utf-8") as f:
        f.write(code)
