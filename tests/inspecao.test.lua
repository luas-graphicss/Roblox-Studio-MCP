local realPrint = print
local passed = 0
local function test(nome, fn)
	local ok, err = pcall(fn)
	if not ok then error(nome .. ': ' .. tostring(err), 0) end
	passed = passed + 1
	realPrint('  OK inspecao: ' .. nome)
end
local function near(a, b, eps) return math.abs(a - b) <= (eps or 0.011) end

local V = {}
V.__index = V
local function vec(x, y, z) return setmetatable({ X = x, Y = y, Z = z }, V) end
V.__add = function(a, b) return vec(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
V.__sub = function(a, b) return vec(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
V.__mul = function(a, b) if type(a) == 'number' then return vec(a * b.X, a * b.Y, a * b.Z) end; if type(b) == 'number' then return vec(a.X * b, a.Y * b, a.Z * b) end; return vec(a.X * b.X, a.Y * b.Y, a.Z * b.Z) end
V.__div = function(a, b) if type(b) == 'number' then return vec(a.X / b, a.Y / b, a.Z / b) end; return vec(a.X / b.X, a.Y / b.Y, a.Z / b.Z) end
local Vector3 = { new = function(x, y, z) return vec(x or 0, y or 0, z or 0) end }

local C = {}
C.__index = function(t, k)
	if k == 'Position' then return vec(t.p[1], t.p[2], t.p[3]) end
	if k == 'XVector' then return vec(t.m[1][1], t.m[2][1], t.m[3][1]) end
	if k == 'YVector' then return vec(t.m[1][2], t.m[2][2], t.m[3][2]) end
	if k == 'ZVector' then return vec(t.m[1][3], t.m[2][3], t.m[3][3]) end
	if k == 'Rotation' then return setmetatable({ p = { 0, 0, 0 }, m = t.m }, C) end
	return C[k]
end
local function cf(p, m) return setmetatable({ p = p, m = m }, C) end
local I = function() return { { 1, 0, 0 }, { 0, 1, 0 }, { 0, 0, 1 } } end
local function mmul(a, b) local r = {}; for i = 1, 3 do r[i] = {}; for j = 1, 3 do r[i][j] = a[i][1] * b[1][j] + a[i][2] * b[2][j] + a[i][3] * b[3][j] end end; return r end
local function mvec(m, v) return vec(m[1][1] * v.X + m[1][2] * v.Y + m[1][3] * v.Z, m[2][1] * v.X + m[2][2] * v.Y + m[2][3] * v.Z, m[3][1] * v.X + m[3][2] * v.Y + m[3][3] * v.Z) end
local function transp(m) return { { m[1][1], m[2][1], m[3][1] }, { m[1][2], m[2][2], m[3][2] }, { m[1][3], m[2][3], m[3][3] } } end
local CFrame = {}
CFrame.new = function(v, y, z) if type(v) == 'number' then return cf({ v, y, z }, I()) end; return cf({ v.X, v.Y, v.Z }, I()) end
CFrame.Angles = function(rx, ry, rz)
	local cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
	local Rx = { { 1, 0, 0 }, { 0, cx, -sx }, { 0, sx, cx } }
	local Ry = { { cy, 0, sy }, { 0, 1, 0 }, { -sy, 0, cy } }
	local Rz = { { cz, -sz, 0 }, { sz, cz, 0 }, { 0, 0, 1 } }
	return cf({ 0, 0, 0 }, mmul(Rx, mmul(Ry, Rz)))
end
C.__mul = function(a, b)
	if getmetatable(b) == V then return a:PointToWorldSpace(b) end
	local pos = a:PointToWorldSpace(b.Position)
	return cf({ pos.X, pos.Y, pos.Z }, mmul(a.m, b.m))
end
function C:PointToWorldSpace(v) local r = mvec(self.m, v); return vec(r.X + self.p[1], r.Y + self.p[2], r.Z + self.p[3]) end
function C:VectorToWorldSpace(v) return mvec(self.m, v) end
function C:PointToObjectSpace(v) return mvec(transp(self.m), v - self.Position) end
function C:VectorToObjectSpace(v) return mvec(transp(self.m), v) end
function C:Inverse() local t = transp(self.m); local p = mvec(t, self.Position); return cf({ -p.X, -p.Y, -p.Z }, t) end
function C:ToOrientation()

	local m = self.m
	local rx = math.asin(math.max(-1, math.min(1, -m[2][3])))
	local ry, rz
	if math.abs(m[2][3]) < 0.9999 then ry = math.atan(m[1][3], m[3][3]); rz = math.atan(m[2][1], m[2][2]) else ry = math.atan(-m[3][1], m[1][1]); rz = 0 end
	return rx, ry, rz
end

local Enum = setmetatable({}, { __index = function(_, k) return setmetatable({}, { __index = function(_, n) return { Name = n } end }) end })
local instMeta = {}
instMeta.__index = instMeta
local classes = {
	Model = { 'Model', 'PVInstance', 'Instance' }, Part = { 'Part', 'BasePart', 'PVInstance', 'Instance' },
	MeshPart = { 'MeshPart', 'BasePart', 'PVInstance', 'Instance' }, Folder = { 'Folder', 'Instance' },
	Script = { 'Script', 'LuaSourceContainer', 'Instance' }, Attachment = { 'Attachment', 'Instance' },
}
local function inst(class, name, props)
	local o = setmetatable({ ClassName = class, Name = name or class, _children = {}, Parent = nil }, instMeta)
	for k, v in pairs(props or {}) do o[k] = v end
	if classes[class][2] == 'BasePart' then
		o.Size = o.Size or vec(1, 1, 1); o.CFrame = o.CFrame or CFrame.new(vec(0, 0, 0))
		o.Position = o.CFrame.Position; o.Material = o.Material or { Name = 'Plastic' }; o.Color = o.Color or { R = 0.5, G = 0.5, B = 0.5 }
		if o.Transparency == nil then o.Transparency = 0 end; if o.Anchored == nil then o.Anchored = true end; if o.CanCollide == nil then o.CanCollide = true end
		if class == 'Part' then o.Shape = o.Shape or { Name = 'Block' } end
		if class == 'MeshPart' then o.MeshId = o.MeshId or ''; o.TextureID = o.TextureID or ''; o.MeshSize = o.MeshSize or o.Size end
	end
	return o
end
function instMeta:IsA(c) for _, x in ipairs(classes[self.ClassName]) do if x == c then return true end end; return false end
function instMeta:GetChildren() local r = {}; for _, c in ipairs(self._children) do r[#r + 1] = c end; return r end
function instMeta:GetDescendants() local r = {}; local function walk(v) for _, c in ipairs(v._children) do r[#r + 1] = c; walk(c) end end; walk(self); return r end
function instMeta:FindFirstChildWhichIsA(c) for _, ch in ipairs(self._children) do if ch:IsA(c) then return ch end end; return nil end
function instMeta:GetFullName() local parts = {}; local o = self; while o and o.Name ~= 'game' do table.insert(parts, 1, o.Name); o = o.Parent end; return table.concat(parts, '.') end
function instMeta:GetPivot() return self.CFrame or self.WorldPivot or CFrame.new(vec(0, 0, 0)) end
function instMeta:GetBoundingBox() return self.WorldPivot, self._bbSize or vec(0, 0, 0) end
local function add(parent, child) child.Parent = parent; table.insert(parent._children, child); return child end

local game = inst('Folder', 'game')
local workspace = add(game, inst('Folder', 'Workspace'))
game.GetService = function(_, name) return inst('Folder', name) end

local ids = 0
local env = setmetatable({
	game = game, Vector3 = Vector3, CFrame = CFrame, Enum = Enum, Content = { fromUri = function(u) return u end },
	acoes = {}, resolver = function(ref) return ref end, respirar = function() end, novoOrcamento = function() return {} end,
	idDe = function(i) if not i._id then ids = ids + 1; i._id = 'i_t_' .. ids end; return i._id end,
	caminhoDe = function(i) return i and ('game.' .. i:GetFullName()) or nil end,
	corHex = function(c) return string.format('#%02x%02x%02x', math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5)) end,
	math = setmetatable({ clamp = function(x, a, b) return math.max(a, math.min(b, x)) end }, { __index = math }),
}, { __index = _G })
env.resumo = function(i) return { id = env.idDe(i), name = i.Name, className = i.ClassName, path = env.caminhoDe(i) } end
local chunk = assert(loadfile('plugin/src/inspecao.lua', 't', env))
chunk()
local inspect = env.acoes.inspect_model
assert(inspect, 'acoes.inspect_model nao registrada')

local modelo = add(workspace, inst('Model', 'Casa'))
modelo.WorldPivot = CFrame.new(vec(10, 0, 0)) * CFrame.Angles(0, math.rad(90), 0)
modelo._bbSize = vec(8, 7, 4)
local piso = add(modelo, inst('Part', 'Piso', { Size = vec(8, 1, 4), CFrame = modelo.WorldPivot * CFrame.new(vec(0, 0.5, 0)), Material = { Name = 'Wood' }, Color = { R = 0.5, G = 0.3, B = 0.1 } }))
local torre = add(modelo, inst('Part', 'Torre', { Size = vec(2, 6, 2), CFrame = modelo.WorldPivot * CFrame.new(vec(3, 4, 0)), Anchored = false }))
local telhado = add(modelo, inst('MeshPart', 'Telhado', { Size = vec(2, 0.5, 2), CFrame = modelo.WorldPivot * CFrame.new(vec(3, 7.25, 0)), MeshId = 'rbxassetid://123' }))
add(torre, inst('Script', 'Porta'))
add(torre, inst('Attachment', 'Topo', { WorldCFrame = modelo.WorldPivot * CFrame.new(vec(3, 7, 0)) }))

test('caixa envolvente considera a rotacao de 90 graus (8 em X local vira 8 em Z no mundo)', function()
	local r = inspect({ target = modelo, projections = false, maxMeshes = 0 })
	assert(r.counts.parts == 3 and r.counts.scripts == 1 and r.counts.attachments == 1, 'contagens')
	assert(near(r.bounds.size[1], 4) and near(r.bounds.size[2], 7.5) and near(r.bounds.size[3], 8), 'size ' .. table.concat(r.bounds.size, ','))

	assert(near(r.bounds.min[3], -4) and near(r.bounds.max[3], 4), 'z ' .. r.bounds.min[3] .. '..' .. r.bounds.max[3])
	assert(near(r.bounds.min[1], 8) and near(r.bounds.max[1], 12), 'x ' .. r.bounds.min[1] .. '..' .. r.bounds.max[1])
	assert(r.pivot.position[1] == 10 and near(r.pivot.orientation[2], 90), 'pivo')
	assert(r.orientedBounds and near(r.orientedBounds.size[2], 7))
end)

test('pecas em espaco local voltam as coordenadas originais, maiores primeiro, com flags', function()
	local r = inspect({ target = modelo, projections = false, maxMeshes = 0 })
	assert(#r.parts == 3 and r.parts[1].name == 'Piso' and r.parts[2].name == 'Torre', 'ordem por volume: ' .. r.parts[1].name .. ',' .. r.parts[2].name)
	local t = r.parts[2]
	assert(near(t.pos[1], 3) and near(t.pos[2], 4) and near(t.pos[3], 0), 'torre local ' .. table.concat(t.pos, ','))
	assert(near(t.rot[2], 0), 'rotacao local zero')
	assert(t.anchored == false and t.canCollide == nil, 'flags')
	assert(r.parts[1].material == 'Wood' and r.parts[1].color == '#804d1a' and r.parts[1].shape == 'Block')
	assert(r.parts[3].meshId == 'rbxassetid://123' and r.parts[3].shape == 'Mesh')
	assert(r.scripts[1]:find('Casa.Torre.Porta', 1, true), 'script listado')
end)

test('espaco mundo devolve posicoes absolutas e rotacao herdada', function()
	local r = inspect({ target = modelo, space = 'world', projections = false, maxMeshes = 0 })
	local t = r.parts[2]
	assert(near(t.pos[1], 10) and near(t.pos[2], 4) and near(t.pos[3], -3), 'torre mundo ' .. table.concat(t.pos, ','))
	assert(near(t.rot[2], 90), 'rot mundo')
end)

test('mesh sem EditableMesh cai em indisponivel sem quebrar', function()
	local r = inspect({ target = modelo, projections = false })
	assert(r.meshes and #r.meshes == 1 and r.meshes[1].unavailable, 'mesh indisponivel')
	assert(r.meshes[1].meshId == 'rbxassetid://123')
end)

test('projecoes: grade com celula certa, topo mostra torre mais alta (9) que piso, frente/lado coerentes', function()
	local r = inspect({ target = modelo, detail = 'summary', resolution = 16, maxMeshes = 0 })
	assert(r.parts == nil, 'summary nao lista pecas')
	local p = r.projections
	assert(near(p.cell, 0.5), 'celula ' .. tostring(p.cell))
	local topo, frente, lado = p.views[1], p.views[2], p.views[3]
	assert(topo.name == 'topo' and topo.colAxis == 'X' and topo.lineAxis == 'Z' and #topo.rows == 16 and #topo.rows[1] == 8, 'topo ' .. #topo.rows .. 'x' .. #topo.rows[1])
	assert(topo.depth.axis == 'Y' and near(topo.depth.far, 1) and near(topo.depth.near, 7.5), 'profundidade topo ' .. topo.depth.far .. '..' .. topo.depth.near)

	local altos, baixos = 0, 0
	for l, row in ipairs(topo.rows) do for c = 1, #row do local ch = row:sub(c, c); if ch == '9' then altos = altos + 1; assert(l <= 4, 'digito 9 fora das linhas da torre: linha ' .. l) elseif ch ~= '.' then baixos = baixos + 1 end end end
	assert(altos == 16 and baixos == 112, 'topo altos=' .. altos .. ' baixos=' .. baixos)
	assert(frente.colAxis == 'X' and frente.lineAxis == 'Y' and #frente.rows == 15 and #frente.rows[1] == 8, 'frente ' .. #frente.rows .. 'x' .. #frente.rows[1])
	assert(frente.rows[15]:match('^%d%d%d%d%d%d%d%d$') and frente.rows[1]:match('^%.%.%d%d%d%d%.%.$'), 'frente: torre no topo (colunas centrais) e piso embaixo: ' .. frente.rows[1] .. ' / ' .. frente.rows[15])
	assert(lado.colAxis == 'Z' and lado.lineAxis == 'Y' and #lado.rows == 15 and #lado.rows[1] == 16, 'lado ' .. #lado.rows .. 'x' .. #lado.rows[1])
	assert(lado.rows[1]:match('^%.*%d%d%d%d%.*$') and select(2, lado.rows[1]:gsub('%d', '')) == 4, 'lado linha 1: ' .. lado.rows[1])
	assert(lado.rows[1]:sub(1, 4):match('%d%d%d%d'), 'torre no lado -Z (colunas iniciais): ' .. lado.rows[1])
	assert(select(2, lado.rows[15]:gsub('%d', '')) == 16, 'piso preenche a base no lado')
end)

test('detail=full inclui attachments relativos ao pivo; alvo sem pecas responde nota', function()
	local r = inspect({ target = modelo, detail = 'full', projections = false, maxMeshes = 0 })
	assert(r.attachments and #r.attachments == 1 and near(r.attachments[1].pos[1], 3) and near(r.attachments[1].pos[2], 7), 'attachment local')
	local vazio = add(workspace, inst('Folder', 'Vazio'))
	local r2 = inspect({ target = vazio })
	assert(r2.counts.parts == 0 and r2.note, 'nota para alvo vazio')
end)

test('maxParts corta as menores e informa quantas ficaram de fora', function()
	local r = inspect({ target = modelo, maxParts = 1, projections = false, maxMeshes = 0 })
	assert(#r.parts == 1 and r.parts[1].name == 'Piso' and r.partsTruncated == 2)
end)

realPrint('INSPECAO: ' .. passed .. ' testes aprovados')
