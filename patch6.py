import re

with open("contracts/makewhole.py", "r", encoding="utf-8") as f:
    code = f.read()

# Revert post_bond to original signature + the pay_c check
old_post_bond = '''    @gl.public.write.payable
    def post_bond(self, job_id: str) -> None:
        v = gl.message.value
        if v == u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} post_bond requires GEN")
        sender = gl.message.sender_address
        k = _addr_key(sender)
        prev = _map_get_u256(self.bonds, k)
        self.bonds[k] = prev + v
        self.locked_bonds = self.locked_bonds + v
        if _map_get_u256(self.rep, k) == u256(0):
            self.rep[k] = u256(1)
            
        if job_id not in self.jobs:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} unknown job")
        job = self.jobs[job_id]
        if job.state != STATE_OPEN or not _same(job.writer, sender):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} invalid job for post_bond")
        if self.bonds[k] < job.pay_c:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} bond must be >= pay_c")
        job.state = STATE_BONDED
        self._put(job)'''

new_post_bond = '''    @gl.public.write.payable
    def post_bond(self) -> None:
        v = gl.message.value
        if v == u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} post_bond requires GEN")
        sender = gl.message.sender_address
        k = _addr_key(sender)
        prev = _map_get_u256(self.bonds, k)
        self.bonds[k] = prev + v
        self.locked_bonds = self.locked_bonds + v
        if _map_get_u256(self.rep, k) == u256(0):
            self.rep[k] = u256(1)
        for jid in self.job_ids:
            job = self.jobs[jid]
            if job.state == STATE_OPEN and _same(job.writer, sender):
                if self.bonds[k] < job.pay_c:
                    raise gl.vm.UserError(f"{ERROR_EXPECTED} bond < pay_c")
                job.state = STATE_BONDED
                self._put(job)'''

code = code.replace(old_post_bond, new_post_bond)

with open("contracts/makewhole.py", "w", encoding="utf-8") as f:
    f.write(code)


with open("tests/direct/test_makewhole.py", "r", encoding="utf-8") as f:
    tcode = f.read()

# Fix _create to pass 6 args to create_job (brief, pay_b, pay_c, writer, pub, kind)
# Wait, I previously changed it to 8 args! Let's revert that and just pass premium=0, deadline=future
tcode = re.sub(
    r'return contract\.create_job\(BRIEF, pay_b, pay_c, str\(b\), str\(c\), "write"\)',
    r'return contract.create_job(BRIEF, pay_b, pay_c, 0, 2000000000, str(b), str(c), "write")',
    tcode
)
tcode = re.sub(
    r'return contract\.create_job\(BRIEF, pay_b, pay_c, premium, deadline, str\(b\), str\(c\), "write"\)',
    r'return contract.create_job(BRIEF, pay_b, pay_c, premium, deadline, str(b), str(c), "write")',
    tcode
)

with open("tests/direct/test_makewhole.py", "w", encoding="utf-8") as f:
    f.write(tcode)
