# v0.3.0
# { "Depends": "py-genlayer:9b8kjyda2ycxyq4ea6g4yfpnydxhd52gqba5rb8dw7krkh5mn9p0" }
from genlayer import *

class Hello(gl.Contract):
    name: str

    def __init__(self):
        self.name = "makewhole"

    @gl.public.view
    def greet(self) -> str:
        return self.name
