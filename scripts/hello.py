# v0.3.0
# {
#   "Depends": "py-genlayer:1zr6nqk597d97kg0dyxg0shhrykx5v02zjgnyrajapy4wlqvfvwh"
# }

from genlayer import *

class Storage(gl.Contract):
    storage: str

    def __init__(self):
        self.storage = "ok"

    @gl.public.view
    def get_storage(self) -> str:
        return self.storage
