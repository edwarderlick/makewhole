import glob
import re

for file in glob.glob("tests/direct/*.py"):
    with open(file, "r", encoding="utf-8") as f:
        code = f.read()

    old_create_body = '''    job_id = contract.create_job(brief, PAY_B, PAY_C, PREMIUM, 2000000000, writer, publisher, hop_kind)'''
    new_create_body = '''    job_id = contract.create_job(brief, PAY_B, PAY_C, PREMIUM, deadline, writer, publisher, hop_kind)'''
    code = code.replace(old_create_body, new_create_body)

    with open(file, "w", encoding="utf-8") as f:
        f.write(code)
