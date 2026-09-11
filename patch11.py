import glob
import re

for file in glob.glob("tests/direct/*.py"):
    with open(file, "r", encoding="utf-8") as f:
        code = f.read()

    # Fix the missing deadline and premium args in _create signature
    old_sig = '''def _create(vm, contract, client, writer, publisher, brief=BRIEF, hop_kind="write"):'''
    new_sig = '''def _create(vm, contract, client, writer, publisher, brief=BRIEF, hop_kind="write", premium=PREMIUM, deadline=0):'''
    code = code.replace(old_sig, new_sig)

    old_body = '''    job_id = contract.create_job(brief, PAY_B, PAY_C, PREMIUM, deadline, writer, publisher, hop_kind)'''
    new_body = '''    job_id = contract.create_job(brief, PAY_B, PAY_C, premium, deadline or int(time.time() + 3600), writer, publisher, hop_kind)'''
    code = code.replace(old_body, new_body)
    
    with open(file, "w", encoding="utf-8") as f:
        f.write(code)
