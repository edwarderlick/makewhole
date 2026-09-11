with open("contracts/makewhole.py", "r", encoding="utf-8") as f:
    code = f.read()

old_leader_fn = '''        def leader_fn() -> dict:
            return _evaluate_evidence(brief, deliverable)'''

new_leader_fn = '''        def leader_fn() -> dict:
            return _evaluate_evidence(brief, deliverable, job.deliverable_hash)'''

code = code.replace(old_leader_fn, new_leader_fn)

with open("contracts/makewhole.py", "w", encoding="utf-8") as f:
    f.write(code)
