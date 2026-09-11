with open("tests/direct/test_makewhole.py", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace('    print("JOB:", job)\n    assert job["state"] == "SETTLED_OK"', '    assert job["state"] == "SETTLED_OK"')

with open("tests/direct/test_makewhole.py", "w", encoding="utf-8") as f:
    f.write(code)

with open("contracts/makewhole.py", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace('''    if d_status == 404 or b_status == 404:
        return _triad("none", False, 0, f"404 Not Found. No slash.", True)''',
'''    if d_status == 404 or b_status == 404:
        return _triad("none", False, 0, f"404 Not Found. No slash. (brief {b_status}, deliv {d_status})", True)''')

with open("contracts/makewhole.py", "w", encoding="utf-8") as f:
    f.write(code)
