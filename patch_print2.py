with open("tests/direct/test_makewhole.py", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace('print("JOB:", job)\\n    assert job["state"] == "SETTLED_OK"', '    print("JOB:", job)\n    assert job["state"] == "SETTLED_OK"')

with open("tests/direct/test_makewhole.py", "w", encoding="utf-8") as f:
    f.write(code)
