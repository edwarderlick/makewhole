import re

with open("contracts/makewhole.py", "r", encoding="utf-8") as f:
    code = f.read()

old_withdraw = '''    @gl.public.write
    def withdraw(self) -> None:
        sender = gl.message.sender_address
        k = _addr_key(sender)
        amt = _map_get_u256(self.credits, k)
        if amt == u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} no credits")
        self.credits[k] = u256(0)
        self.credits_total = self.credits_total - amt
        try:
            gl.get_contract_at(sender).emit_transfer(value=amt, on="finalized")
        except Exception:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} withdraw transfer failed")'''

new_withdraw = '''    @gl.public.write
    def withdraw(self) -> None:
        sender = gl.message.sender_address
        k = _addr_key(sender)
        amt = _map_get_u256(self.credits, k)
        if amt == u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} no credits")
        self.credits[k] = u256(0)
        self.credits_total = self.credits_total - amt
        try:
            gl.get_contract_at(sender).emit_transfer(value=amt, on="finalized")
        except Exception:
            self.credits[k] = amt
            self.credits_total = self.credits_total + amt
            raise gl.vm.UserError(f"{ERROR_EXPECTED} withdraw transfer failed; credits restored")'''

code = code.replace(old_withdraw, new_withdraw)

# Add expire logic at the end
expire_code = '''
    @gl.public.write
    def expire(self, job_id: str) -> None:
        if job_id not in self.jobs:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} unknown job")
        job = self.jobs[job_id]
        if job.state in (STATE_SETTLED_OK, STATE_SETTLED_RUG, STATE_CANCELED):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} job already finished")
            
        dt_str = str(gl.message_raw.get("datetime", ""))
        try:
            current_time = int(datetime.fromisoformat(dt_str.replace("Z", "+00:00")).timestamp())
        except Exception:
            current_time = 0
            
        if current_time > 0 and current_time <= job.deadline:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} deadline not passed")
            
        # Time to expire.
        escrow = job.pay_b + job.pay_c + job.premium
        if job.state == STATE_OPEN:
            # Client refunded. Writer unaffected.
            self._pay(job.client, escrow)
            self.locked_jobs = self.locked_jobs - escrow
            job.state = STATE_CANCELED
            
        elif job.state == STATE_BONDED:
            # Writer rugged! Slash bond.
            wk = _addr_key(job.writer)
            bond = _map_get_u256(self.bonds, wk)
            pay_c = job.pay_c
            from_bond = pay_c if bond >= pay_c else bond
            from_pool = pay_c - from_bond
            remain_bond = bond - from_bond
            slashed = remain_bond
            
            self.bonds[wk] = u256(0)
            self.locked_bonds = self.locked_bonds - bond
            if from_pool > u256(0):
                self.pool = self.pool - from_pool
            self.pool = self.pool + slashed + job.premium
            self.locked_jobs = self.locked_jobs - escrow
            self.slash_count = self.slash_count + u256(1)
            
            rk = _map_get_u256(self.rep, wk)
            self.rep[wk] = rk - u256(1) if rk > u256(0) else u256(0)
            
            self._bump_active(job.writer, -1)
            self._pay(job.client, job.pay_b)
            self._pay(job.publisher, pay_c)
            
            job.paid_c = pay_c
            job.slashed_b = slashed
            job.state = STATE_CANCELED
            
        elif job.state == STATE_IN_FLIGHT:
            # Publisher rugged! Client didn't get publication. Writer did work.
            # Refund publisher's pay_c back to client. Give writer pay_b + their bond back.
            wk = _addr_key(job.writer)
            bond = _map_get_u256(self.bonds, wk)
            
            # Writer gets bond back
            self.bonds[wk] = u256(0)
            self.locked_bonds = self.locked_bonds - bond
            self._pay(job.writer, bond)
            
            self.pool = self.pool + job.premium
            self.locked_jobs = self.locked_jobs - escrow
            
            self._bump_active(job.writer, -1)
            self._pay(job.writer, job.pay_b)
            self._pay(job.client, job.pay_c)
            
            job.state = STATE_CANCELED
            
        elif job.state in (STATE_ACKED, STATE_UNDETERMINED):
            # Same as IN_FLIGHT, publisher rugged or adjudicator didn't finish.
            # If it's UNDETERMINED, no one wins, just refund everyone.
            wk = _addr_key(job.writer)
            bond = _map_get_u256(self.bonds, wk)
            
            self.bonds[wk] = u256(0)
            self.locked_bonds = self.locked_bonds - bond
            self._pay(job.writer, bond)
            
            self.locked_jobs = self.locked_jobs - escrow
            self._pay(job.client, escrow)
            
            if job.state == STATE_ACKED:
                self._bump_active(job.writer, -1)
                
            job.state = STATE_CANCELED

        self._put(job)
'''

code += expire_code

with open("contracts/makewhole.py", "w", encoding="utf-8") as f:
    f.write(code)
