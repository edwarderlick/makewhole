with open("tests/direct/test_makewhole.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'assert job["state"] == "SETTLED_OK"' in line and 'def test_happy_fixture_settled_ok_pays_b_and_c' in "".join(lines[max(0, i-40):i]):
        lines.insert(i, '    print("REASON_FOR_FAILURE:", job["reason"])\n')
        break

with open("tests/direct/test_makewhole.py", "w", encoding="utf-8") as f:
    f.writelines(lines)
