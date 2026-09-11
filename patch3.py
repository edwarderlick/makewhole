import re

with open("contracts/makewhole.py", "r", encoding="utf-8") as f:
    code = f.read()

# Update submit signatures and body
code = re.sub(
    r'def submit\(self, job_id: str, deliverable_url: str\) -> None:',
    r'def submit(self, job_id: str, deliverable_url: str, deliverable_hash: str) -> None:',
    code
)
code = re.sub(
    r'self\._do_submit\(job_id, deliverable_url\)',
    r'self._do_submit(job_id, deliverable_url, deliverable_hash)',
    code
)

code = re.sub(
    r'def submit_hop\(self, job_id: str, hop: str, url: str\) -> None:',
    r'def submit_hop(self, job_id: str, hop: str, url: str, deliverable_hash: str) -> None:',
    code
)
code = re.sub(
    r'self\._do_submit\(job_id, url\)',
    r'self._do_submit(job_id, url, deliverable_hash)',
    code
)

code = re.sub(
    r'def _do_submit\(self, job_id: str, deliverable_url: str\) -> None:',
    r'def _do_submit(self, job_id: str, deliverable_url: str, deliverable_hash: str) -> None:',
    code
)

# Update _do_submit body to save deliverable_hash
old_do_submit = '''        job.deliverable_url = url
        job.state = STATE_IN_FLIGHT
        self._put(job)'''
new_do_submit = '''        job.deliverable_url = url
        job.deliverable_hash = deliverable_hash
        job.state = STATE_IN_FLIGHT
        self._put(job)'''
code = code.replace(old_do_submit, new_do_submit)

with open("contracts/makewhole.py", "w", encoding="utf-8") as f:
    f.write(code)
