import re

with open("tests/direct/test_makewhole.py", "r", encoding="utf-8") as f:
    tcode = f.read()

# Fix _create body
old_create_body = '''    job_id = contract.create_job(brief, PAY_B, PAY_C, writer, publisher, hop_kind)'''
new_create_body = '''    job_id = contract.create_job(brief, PAY_B, PAY_C, PREMIUM, 2000000000, writer, publisher, hop_kind)'''
tcode = tcode.replace(old_create_body, new_create_body)

# Fix test_sybil_court_allowlist_reverts and others in test_makewhole_more if they have create_job
with open("tests/direct/test_makewhole.py", "w", encoding="utf-8") as f:
    f.write(tcode)
