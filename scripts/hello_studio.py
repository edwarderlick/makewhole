# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Hello(gl.Contract):
    name: str

    def __init__(self):
        self.name = "makewhole"

    @gl.public.view
    def greet(self) -> str:
        return self.name

    @gl.public.write
    def set_name(self, name: str) -> None:
        self.name = name
