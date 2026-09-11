import re

with open("contracts/makewhole.py", "r", encoding="utf-8") as f:
    code = f.read()

# Update _evaluate_evidence signature
code = re.sub(
    r'def _evaluate_evidence\(brief_url: str, deliverable_url: str\) -> dict:',
    r'def _evaluate_evidence(brief_url: str, deliverable_url: str, expected_hash: str) -> dict:',
    code
)

# Update fetch to return raw body for hashing
old_fetch = '''def _evaluate_evidence(brief_url: str, deliverable_url: str, expected_hash: str) -> dict:
    def fetch(url: str, label: str) -> tuple[int, str]:
        try:
            res = gl.nondet.web.get(url)
        except Exception:
            raise gl.vm.UserError(f"{ERROR_TRANSIENT} {label} network error")
        status = int(getattr(res, "status", 0) or 0)
        try:
            body = res.body.decode("utf-8", errors="replace")
        except Exception:
            body = str(getattr(res, "body", "") or "")
        if status >= 500 or status == 0:
            raise gl.vm.UserError(f"{ERROR_TRANSIENT} {label} status {status}")
        return status, body[:BODY_MAX]

    b_status, brief_body = fetch(brief_url, "brief")
    d_status, deliv_body = fetch(deliverable_url, "deliverable")'''

new_fetch = '''def _evaluate_evidence(brief_url: str, deliverable_url: str, expected_hash: str) -> dict:
    def fetch(url: str, label: str, return_raw: bool = False):
        try:
            res = gl.nondet.web.get(url)
        except Exception:
            if return_raw:
                return 500, "", b""
            return 500, ""
        status = int(getattr(res, "status", 0) or 0)
        raw_body = getattr(res, "body", b"")
        if isinstance(raw_body, str):
            raw_body = raw_body.encode("utf-8")
        try:
            body = raw_body.decode("utf-8", errors="replace")
        except Exception:
            body = str(raw_body)
        if status >= 500 or status == 0:
            if return_raw:
                return status, body[:BODY_MAX], raw_body
            return status, body[:BODY_MAX]
        if return_raw:
            return status, body[:BODY_MAX], raw_body
        return status, body[:BODY_MAX]

    b_status, brief_body = fetch(brief_url, "brief")
    d_status, deliv_body, raw_deliv_body = fetch(deliverable_url, "deliverable", return_raw=True)
    
    if d_status == 404 or b_status == 404:
        return _triad("none", False, 0, f"404 Not Found. No slash.", True)
        
    if expected_hash:
        actual = hashlib.sha256(raw_deliv_body).hexdigest()
        if actual != expected_hash:
            return _triad(
                "none",
                False,
                0,
                f"deliverable hash mismatch. Expected {expected_hash}, got {actual}. No slash.",
                True,
            )'''

code = code.replace(old_fetch, new_fetch)

# Update adjudicate to pass expected_hash
old_adj = '''        ev = _evaluate_evidence(job.brief_url, job.deliverable_url)'''
new_adj = '''        ev = _evaluate_evidence(job.brief_url, job.deliverable_url, job.deliverable_hash)'''
code = code.replace(old_adj, new_adj)

with open("contracts/makewhole.py", "w", encoding="utf-8") as f:
    f.write(code)
