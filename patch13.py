with open("contracts/makewhole.py", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    'def _validate_public_https(url: str, label: str, check_allowlist: bool = False) -> str:',
    'def _validate_public_https(url: str, label: str, check_allowlist: bool = True) -> str:'
)

with open("contracts/makewhole.py", "w", encoding="utf-8") as f:
    f.write(code)
