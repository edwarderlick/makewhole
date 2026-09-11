import re

with open("contracts/makewhole.py", "r", encoding="utf-8") as f:
    code = f.read()

# Modify post_bond
old_post_bond = '''    @gl.public.write.payable
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
                job.state = STATE_BONDED
                self._put(job)'''

new_post_bond = '''    @gl.public.write.payable
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

code = code.replace(old_post_bond, new_post_bond)

# Modify create_job
old_create_job = '''    def create_job(
        self,
        brief_url: str,
        pay_b: u256,
        pay_c: u256,
        writer: Address,
        publisher: Address,
        hop_kind: str,
    ) -> str:'''

new_create_job = '''    def create_job(
        self,
        brief_url: str,
        pay_b: u256,
        pay_c: u256,
        premium_arg: u256,
        deadline: u256,
        writer: Address,
        publisher: Address,
        hop_kind: str,
    ) -> str:'''

code = code.replace(old_create_job, new_create_job)

old_create_job_body = '''        value = gl.message.value
        need = pay_b + pay_c
        if value < need:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} value too small for pay_b+pay_c")
        premium = value - need
        kind = str(hop_kind or "write")[:32]
        bonded = _map_get_u256(self.bonds, _addr_key(writer)) > u256(0)
        state = STATE_BONDED if bonded else STATE_OPEN
        job_id = self._new_id(brief, pay_b, pay_c)
        job = Job(
            id=job_id,
            client=client,
            writer=writer,
            publisher=publisher,
            brief_url=brief,
            deliverable_url="",
            research_url="",
            publish_url="",
            pay_b=pay_b,
            pay_c=pay_c,
            premium=premium,
            state=state,
            fault="",
            pay_downstream="false",
            slash_bps=u256(0),
            reason="",
            paid_c=u256(0),
            slashed_b=u256(0),
            hop_kind=kind,
        )'''

new_create_job_body = '''        value = gl.message.value
        need = pay_b + pay_c + premium_arg
        if value < need:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} escrow too small for pay_b+pay_c+premium")
        premium = premium_arg
        
        # Enforce deadline min/max
        dt_str = str(gl.message_raw.get("datetime", ""))
        try:
            current_time = int(datetime.fromisoformat(dt_str.replace("Z", "+00:00")).timestamp())
        except Exception:
            current_time = 0
            
        if current_time > 0:
            if deadline < current_time + 300:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} deadline too soon")
            if deadline > current_time + 86400:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} deadline too late")

        kind = str(hop_kind or "write")[:32]
        bonded = _map_get_u256(self.bonds, _addr_key(writer)) >= pay_c
        state = STATE_BONDED if bonded else STATE_OPEN
        job_id = self._new_id(brief, pay_b, pay_c)
        job = Job(
            id=job_id,
            client=client,
            writer=writer,
            publisher=publisher,
            brief_url=brief,
            deliverable_url="",
            deliverable_hash="",
            research_url="",
            publish_url="",
            pay_b=pay_b,
            pay_c=pay_c,
            premium=premium,
            deadline=deadline,
            state=state,
            fault="",
            pay_downstream="false",
            slash_bps=u256(0),
            reason="",
            paid_c=u256(0),
            slashed_b=u256(0),
            hop_kind=kind,
        )'''

code = code.replace(old_create_job_body, new_create_job_body)

with open("contracts/makewhole.py", "w", encoding="utf-8") as f:
    f.write(code)
