import ctypes as C
from ctypes.util import find_library
from pathlib import Path
import os
import sys
os.chdir(Path(__file__).resolve().parents[1])
name=os.environ.get('LUA_LIBRARY') or find_library('lua-5.4') or find_library('lua5.4') or (os.path.exists('/usr/lib64/liblua-5.4.so') and '/usr/lib64/liblua-5.4.so')
if not name:sys.exit('liblua 5.4 ausente. Instale-a/defina LUA_LIBRARY. Testes Lua NAO executados.')
lua=C.CDLL(name)
lua.luaL_newstate.restype=C.c_void_p
lua.luaL_openlibs.argtypes=[C.c_void_p]
lua.luaL_loadfilex.argtypes=[C.c_void_p,C.c_char_p,C.c_char_p];lua.luaL_loadfilex.restype=C.c_int
lua.lua_pcallk.argtypes=[C.c_void_p,C.c_int,C.c_int,C.c_int,C.c_ssize_t,C.c_void_p];lua.lua_pcallk.restype=C.c_int
lua.lua_tolstring.argtypes=[C.c_void_p,C.c_int,C.POINTER(C.c_size_t)];lua.lua_tolstring.restype=C.c_char_p
lua.lua_close.argtypes=[C.c_void_p]
def run(path,execute=True):
    state=lua.luaL_newstate();lua.luaL_openlibs(state)
    try:
        code=lua.luaL_loadfilex(state,str(path).encode(),None)
        if code==0 and execute:code=lua.lua_pcallk(state,0,0,0,0,None)
        if code:
            text=lua.lua_tolstring(state,-1,None)
            raise RuntimeError((text or b'(erro nao textual)').decode(errors='replace'))
    finally:lua.lua_close(state)
for path in ['plugin/MCPStudioNotion.server.lua','plugin/src/controle.lua','plugin/src/run-luau.lua','plugin/src/inspecao.lua']:run(path,False)
print('Sintaxe do subconjunto Lua 5.4: OK; nao substitui compilacao Luau/Studio.',flush=True)
if Path('tests/controle.test.lua').exists():run('tests/controle.test.lua')
run('tests/plugin.test.lua')
if Path('tests/inspecao.test.lua').exists():run('tests/inspecao.test.lua')
