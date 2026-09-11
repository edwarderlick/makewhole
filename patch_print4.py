with open("contracts/makewhole.py", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace('''    def fetch(url: str, label: str, return_raw: bool = False):
        try:
            res = gl.nondet.web.get(url)
        except Exception:
            if return_raw:
                return 500, "", b""
            return 500, ""''',
'''    def fetch(url: str, label: str, return_raw: bool = False):
        try:
            res = gl.nondet.web.get(url)
        except Exception as e:
            print("FETCH EXC:", e, url)
            if return_raw:
                return 500, "", b""
            return 500, ""''')

with open("contracts/makewhole.py", "w", encoding="utf-8") as f:
    f.write(code)
