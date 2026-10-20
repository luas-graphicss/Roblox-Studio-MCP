local VERSAO = "2.9.0"

local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local InsertService = game:GetService("InsertService")
local LogService = game:GetService("LogService")
local CollectionService = game:GetService("CollectionService")
local MarketplaceService = game:GetService("MarketplaceService")

local urlBase = ""
local chave = ""
local conectado = false
local esperaMs = 25000
local peer = string.gsub(HttpService:GenerateGUID(false), "[{}-]", "")
peer = string.sub(peer, 1, 12)

local filaLocal = {}
local bufferRespostas = {}
local enviando = false
local geracao = 0

local RunService = game:GetService("RunService")
local ORCAMENTO_MIN = 0.004
local ORCAMENTO_MAX = 0.04
local FRACAO_QUADRO = 0.3
local quadro = { inicio = os.clock(), seq = 0, dt = 1 / 60, orcamento = 0.006 }
local function ajustarOrcamento(dt)
	quadro.dt = dt
	quadro.orcamento = math.clamp(dt * FRACAO_QUADRO, ORCAMENTO_MIN, ORCAMENTO_MAX)
end
pcall(function()
	RunService.Heartbeat:Connect(function(dt)
		quadro.seq = quadro.seq + 1
		quadro.inicio = os.clock()
		ajustarOrcamento(tonumber(dt) or quadro.dt)
	end)
end)
local function quadroEstourado()
	return os.clock() - quadro.inicio >= quadro.orcamento
end

local function cederQuadro()
	local seq = quadro.seq
	local dt = task.wait()
	if quadro.seq == seq then
		quadro.inicio = os.clock()
		ajustarOrcamento(tonumber(dt) or quadro.dt)
	end
	return dt
end

local function novoOrcamento()
	return { passos = 0, passada = 8, checagem = os.clock() }
end
local function respirar(orcamento)
	orcamento.passos = orcamento.passos + 1
	if orcamento.passos % orcamento.passada ~= 0 then
		return
	end
	local agora = os.clock()
	local gasto = agora - orcamento.checagem
	orcamento.checagem = agora
	if gasto > quadro.orcamento / 4 then
		orcamento.passada = math.max(1, math.floor(orcamento.passada / 2))
	elseif gasto < quadro.orcamento / 64 then
		orcamento.passada = math.min(64, orcamento.passada * 2)
	end
	if quadroEstourado() and coroutine.isyieldable() then
		cederQuadro()
		orcamento.checagem = os.clock()
	end
end

local contaOk = 0
local contaErro = 0
local ultimaFerramenta = ""
local ultimoErro = ""

local porId = setmetatable({}, { __mode = "v" })
local porInst = setmetatable({}, { __mode = "k" })
local proximoId = 0

local function idDe(inst)
	if inst == nil then
		return nil
	end
	local id = porInst[inst]
	if id ~= nil then
		return id
	end
	proximoId = proximoId + 1
	id = "i_" .. peer .. "_" .. tostring(proximoId)
	porInst[inst] = id
	porId[id] = inst
	return id
end

local function caminhoDe(inst)
	if inst == nil then
		return nil
	end
	if inst == game then
		return "game"
	end
	local ok, nome = pcall(function()
		return inst:GetFullName()
	end)
	if ok and type(nome) == "string" and nome ~= "" then
		return "game." .. nome
	end
	return inst.Name
end

local function vivo(inst)
	if inst == nil then
		return false
	end
	if inst == game then
		return true
	end
	local ok, res = pcall(function()
		return inst:IsDescendantOf(game)
	end)
	return ok and res == true
end

local function resolver(ref, opcional)
	if ref == nil or ref == "" then
		if opcional then
			return nil
		end
		error("faltou informar o caminho ou o id da instancia", 0)
	end
	if typeof(ref) == "Instance" then
		return ref
	end
	local txt = tostring(ref)
	if string.match(txt, "^i_[%w_]+$") then
		local inst = porId[txt]
		if vivo(inst) then
			return inst
		end
		error("o id " .. txt .. " aponta para algo que nao existe mais no place; leia de novo com get_tree ou find_instances", 0)
	end
	txt = string.gsub(txt, "^%s+", "")
	txt = string.gsub(txt, "%s+$", "")
	txt = string.gsub(txt, "/", ".")
	txt = string.gsub(txt, "^%.+", "")
	txt = string.gsub(txt, "^[Gg]ame%.", "")
	if txt == "" or string.lower(txt) == "game" then
		return game
	end
	local atual = game
	for parte in string.gmatch(txt, "[^%.]+") do
		local prox = nil
		if atual == game then
			local okServico, servico = pcall(function()
				return game:GetService(parte)
			end)
			if okServico then
				prox = servico
			end
		end
		if prox == nil then
			prox = atual:FindFirstChild(parte)
		end
		if prox == nil then
			if opcional then
				return nil
			end
			error('nao achei "' .. parte .. '" dentro de ' .. tostring(caminhoDe(atual)) .. ' (referencia recebida: ' .. tostring(ref) .. ')', 0)
		end
		atual = prox
	end
	return atual
end

local criarControle = (function()
__MCP_MODULE_CONTROLE__()
end)()
local criarRunLuau = (function()
__MCP_MODULE_RUN_LUAU__()
end)()
local contextoAtual=nil

local estadoTeste=function()return nil end
local iniciarRelay,pararRelay,acordarRelay=function()end,function()end,function()end
local reiniciarBackfillRelay=function()return 0 end

local live={ativa=function()return false end,resumo=function()return nil end,aposEscrita=function()end}

local novoControle=(function()
 local controleGeracao=0
 return function()
  controleGeracao=controleGeracao+1
  return criarControle({clock=os.clock,wallMs=function()return DateTime.now().UnixTimestampMillis end,epoch=peer..":c"..tostring(controleGeracao),id=idDe,path=caminhoDe,alive=vivo,descendant=function(child,parent)return child:IsDescendantOf(parent)end})
 end
end)()
local controle=novoControle()

local LARGURA_MAX_TABELA = 2000

local function corHex(cor)
	local function bit(x)
		return math.floor(math.clamp(x, 0, 1) * 255 + 0.5)
	end
	return string.format("#%02x%02x%02x", bit(cor.R), bit(cor.G), bit(cor.B))
end

local function codificar(v, profundidade)
	profundidade = profundidade or 0
	local t = typeof(v)
	if t == "number" or t == "string" or t == "boolean" then
		if t == "number" and (v ~= v or v == math.huge or v == -math.huge) then
			return tostring(v)
		end
		return v
	end
	if t == "nil" then
		return nil
	end
	if t == "Vector3" then
		return { x = v.X, y = v.Y, z = v.Z }
	end
	if t == "Vector2" then
		return { x = v.X, y = v.Y }
	end
	if t == "Vector3int16" or t == "Vector2int16" then
		return { x = v.X, y = v.Y, z = (t == "Vector3int16") and v.Z or nil }
	end
	if t == "Color3" then
		return corHex(v)
	end
	if t == "BrickColor" then
		return v.Name
	end
	if t == "CFrame" then
		local rx, ry, rz = v:ToOrientation()
		return {
			position = { x = v.Position.X, y = v.Position.Y, z = v.Position.Z },
			orientation = { x = math.deg(rx), y = math.deg(ry), z = math.deg(rz) },
		}
	end
	if t == "UDim" then
		return { scale = v.Scale, offset = v.Offset }
	end
	if t == "UDim2" then
		return { x = { scale = v.X.Scale, offset = v.X.Offset }, y = { scale = v.Y.Scale, offset = v.Y.Offset } }
	end
	if t == "Rect" then
		return { min = { x = v.Min.X, y = v.Min.Y }, max = { x = v.Max.X, y = v.Max.Y } }
	end
	if t == "NumberRange" then
		return { min = v.Min, max = v.Max }
	end
	if t == "NumberSequence" then
		local saida = {}
		for _, k in ipairs(v.Keypoints) do
			table.insert(saida, { time = k.Time, value = k.Value, envelope = k.Envelope })
		end
		return saida
	end
	if t == "ColorSequence" then
		local saida = {}
		for _, k in ipairs(v.Keypoints) do
			table.insert(saida, { time = k.Time, value = corHex(k.Value) })
		end
		return saida
	end
	if t == "EnumItem" then
		return v.Name
	end
	if t == "Enum" or t == "Enums" then
		return tostring(v)
	end
	if t == "Font" then
		return { family = v.Family, weight = v.Weight.Name, style = v.Style.Name }
	end
	if t == "Instance" then
		return caminhoDe(v)
	end
	if t == "table" then
		if profundidade > 6 then
			return "[tabela profunda]"
		end

		local saida = {}
		local ehArray = #v > 0
		if ehArray then
			for i, item in ipairs(v) do
				if i > LARGURA_MAX_TABELA then
					table.insert(saida, "[... mais " .. (#v - LARGURA_MAX_TABELA) .. " itens omitidos; filtre ou pagine]")
					break
				end
				table.insert(saida, codificar(item, profundidade + 1))
			end
		else
			local n = 0
			for k, item in pairs(v) do
				n = n + 1
				if n > LARGURA_MAX_TABELA then
					saida["__truncated"] = "mais chaves omitidas; filtre ou pagine"
					break
				end
				local valor = codificar(item, profundidade + 1)
				if valor ~= nil then
					saida[tostring(k)] = valor
				end
			end
		end
		return saida
	end
	return tostring(v)
end

local function numeros(v)
	if type(v) ~= "table" then
		return nil
	end
	if #v > 0 then
		local saida = {}
		for i, n in ipairs(v) do
			saida[i] = tonumber(n) or 0
		end
		return saida
	end
	local x = v.x or v.X
	local y = v.y or v.Y
	local z = v.z or v.Z
	if x ~= nil or y ~= nil or z ~= nil then
		return { tonumber(x) or 0, tonumber(y) or 0, tonumber(z) or 0 }
	end
	return nil
end

local function paraCor(v)
	if typeof(v) == "Color3" then
		return v
	end
	if type(v) == "string" then
		local hex = string.gsub(v, "^#", "")
		if string.match(hex, "^%x%x%x%x%x%x$") then
			local r = tonumber(string.sub(hex, 1, 2), 16)
			local g = tonumber(string.sub(hex, 3, 4), 16)
			local b = tonumber(string.sub(hex, 5, 6), 16)
			return Color3.fromRGB(r, g, b)
		end
		local bc = BrickColor.new(v)
		if bc then
			return bc.Color
		end
		error('cor invalida: "' .. v .. '"; use "#ff8800" ou o nome de um BrickColor', 0)
	end
	local n = numeros(v)
	if n then
		if (n[1] or 0) > 1 or (n[2] or 0) > 1 or (n[3] or 0) > 1 then
			return Color3.fromRGB(n[1] or 0, n[2] or 0, n[3] or 0)
		end
		return Color3.new(n[1] or 0, n[2] or 0, n[3] or 0)
	end
	error("nao consegui ler a cor: use \"#ff8800\", [255,136,0] ou [1,0.5,0]", 0)
end

local function paraUDim(v)
	if typeof(v) == "UDim" then
		return v
	end
	if type(v) == "number" then
		return UDim.new(0, v)
	end
	if type(v) == "table" then
		if v.scale ~= nil or v.offset ~= nil or v.Scale ~= nil or v.Offset ~= nil then
			return UDim.new(tonumber(v.scale or v.Scale) or 0, tonumber(v.offset or v.Offset) or 0)
		end
		local n = numeros(v)
		if n then
			return UDim.new(n[1] or 0, n[2] or 0)
		end
	end
	error("formato de UDim invalido; use {scale=0.5, offset=10} ou [0.5,10]", 0)
end

local function paraUDim2(v)
	if typeof(v) == "UDim2" then
		return v
	end
	if type(v) == "table" then
		if v.x ~= nil and v.y ~= nil and type(v.x) == "table" then
			return UDim2.new(paraUDim(v.x), paraUDim(v.y))
		end
		if v.X ~= nil and v.Y ~= nil and type(v.X) == "table" then
			return UDim2.new(paraUDim(v.X), paraUDim(v.Y))
		end
		local n = numeros(v)
		if n and #n >= 4 then
			return UDim2.new(n[1], n[2], n[3], n[4])
		end
	end
	error("formato de UDim2 invalido; use [0.5,0,0,40] ou {x={scale=0.5,offset=0},y={scale=0,offset=40}}", 0)
end

local function paraCFrame(v)
	if typeof(v) == "CFrame" then
		return v
	end
	if type(v) == "table" then
		local pos = v.position or v.Position or v.pos
		local ori = v.orientation or v.Orientation or v.rotation or v.Rotation
		if pos ~= nil then
			local p = numeros(pos) or { 0, 0, 0 }
			local base = CFrame.new(p[1] or 0, p[2] or 0, p[3] or 0)
			if ori ~= nil then
				local o = numeros(ori) or { 0, 0, 0 }
				base = base * CFrame.fromOrientation(math.rad(o[1] or 0), math.rad(o[2] or 0), math.rad(o[3] or 0))
			end
			return base
		end
		local n = numeros(v)
		if n and #n >= 3 then
			local base = CFrame.new(n[1], n[2], n[3])
			if #n >= 6 then
				base = base * CFrame.fromOrientation(math.rad(n[4]), math.rad(n[5]), math.rad(n[6]))
			end
			return base
		end
	end
	error("formato de CFrame invalido; use {position=[0,5,0], orientation=[0,90,0]}", 0)
end

local function paraEnum(tipo, v)
	if typeof(v) == "EnumItem" then
		return v
	end
	local itens = tipo:GetEnumItems()
	if type(v) == "number" then
		for _, item in ipairs(itens) do
			if item.Value == v then
				return item
			end
		end
	end
	local txt = tostring(v)
	txt = string.match(txt, "([^%.]+)$") or txt
	for _, item in ipairs(itens) do
		if string.lower(item.Name) == string.lower(txt) then
			return item
		end
	end
	local nomes = {}
	for i, item in ipairs(itens) do
		if i <= 40 then
			table.insert(nomes, item.Name)
		end
	end
	error('valor invalido "' .. txt .. '" para ' .. tostring(tipo) .. '; validos: ' .. table.concat(nomes, ", "), 0)
end

local function converter(atual, v)
	local t = typeof(atual)
	if t == "number" then
		local n = tonumber(v)
		if n == nil then
			error("esperava um numero, recebi " .. typeof(v), 0)
		end
		return n
	end
	if t == "string" then
		return tostring(v)
	end
	if t == "boolean" then
		if type(v) == "boolean" then
			return v
		end
		local txt = string.lower(tostring(v))
		return txt == "true" or txt == "1" or txt == "yes" or txt == "sim"
	end
	if t == "Vector3" then
		if typeof(v) == "Vector3" then
			return v
		end
		local n = numeros(v)
		if n then
			return Vector3.new(n[1] or 0, n[2] or 0, n[3] or 0)
		end
		error("esperava Vector3: {x,y,z} ou [x,y,z]", 0)
	end
	if t == "Vector2" then
		if typeof(v) == "Vector2" then
			return v
		end
		local n = numeros(v)
		if n then
			return Vector2.new(n[1] or 0, n[2] or 0)
		end
		error("esperava Vector2: {x,y} ou [x,y]", 0)
	end
	if t == "Color3" then
		return paraCor(v)
	end
	if t == "BrickColor" then
		if typeof(v) == "BrickColor" then
			return v
		end
		local bc = BrickColor.new(tostring(v))
		if bc == nil then
			error('BrickColor invalido: "' .. tostring(v) .. '"', 0)
		end
		return bc
	end
	if t == "CFrame" then
		return paraCFrame(v)
	end
	if t == "UDim" then
		return paraUDim(v)
	end
	if t == "UDim2" then
		return paraUDim2(v)
	end
	if t == "NumberRange" then
		local n = numeros(v)
		if type(v) == "table" and (v.min ~= nil or v.max ~= nil) then
			return NumberRange.new(tonumber(v.min) or 0, tonumber(v.max) or tonumber(v.min) or 0)
		end
		if type(v) == "number" then
			return NumberRange.new(v, v)
		end
		if n and #n >= 2 then
			return NumberRange.new(n[1], n[2])
		end
		error("esperava NumberRange: {min,max}", 0)
	end
	if t == "EnumItem" then
		return paraEnum(atual.EnumType, v)
	end
	if t == "Instance" then
		if v == nil then
			return nil
		end
		return resolver(v)
	end
	if t == "nil" then
		if type(v) == "table" then
			local n = numeros(v)
			if n and #n == 3 then
				return Vector3.new(n[1], n[2], n[3])
			end
			if n and #n == 2 then
				return Vector2.new(n[1], n[2])
			end
		end
		return v
	end
	return v
end

local function comHistorico(nome,fn)
 local ctx=contextoAtual
 local rec=nil
 local okRec,value=pcall(function()return ChangeHistoryService:TryBeginRecording(nome,nome)end)
 if okRec then rec=value end
 if rec and ctx then ctx.recordings[rec]=true end
 local ok,result=pcall(fn)
 if rec then
  local ended,err=pcall(function()ChangeHistoryService:FinishRecording(rec,ok and Enum.FinishRecordingOperation.Commit or Enum.FinishRecordingOperation.Cancel)end)
  if ended and ctx then ctx.recordings[rec]=nil end
  if not ended then error('Falha ao encerrar historico: '..tostring(err),0)end
 end
 if not ok then error(result,0)end
 return result
end

local PROPS = {
	{ "Instance", { "Name", "ClassName", "Archivable" } },
	{ "BasePart", { "Position", "Size", "Orientation", "Anchored", "CanCollide", "CanTouch", "CanQuery", "Massless", "Color", "Material", "Transparency", "Reflectance", "CastShadow", "CollisionGroup" } },
	{ "Part", { "Shape" } },
	{ "MeshPart", { "MeshId", "TextureID", "DoubleSided" } },
	{ "SpecialMesh", { "MeshId", "TextureId", "Scale", "MeshType" } },
	{ "Model", { "PrimaryPart", "WorldPivot" } },
	{ "LuaSourceContainer", { "Enabled", "RunContext" } },
	{ "Light", { "Brightness", "Color", "Enabled", "Shadows", "Range", "Angle" } },
	{ "Sound", { "SoundId", "Volume", "Looped", "Playing", "PlaybackSpeed", "TimePosition", "RollOffMaxDistance" } },
	{ "Decal", { "Texture", "Color3", "Transparency", "Face" } },
	{ "GuiObject", { "Position", "Size", "AnchorPoint", "BackgroundColor3", "BackgroundTransparency", "BorderSizePixel", "Visible", "ZIndex", "Rotation", "ClipsDescendants" } },
	{ "TextLabel", { "Text", "TextColor3", "TextSize", "TextScaled", "TextWrapped", "TextXAlignment", "TextYAlignment", "RichText" } },
	{ "TextButton", { "Text", "TextColor3", "TextSize", "TextScaled", "AutoButtonColor" } },
	{ "TextBox", { "Text", "PlaceholderText", "TextColor3", "TextSize", "ClearTextOnFocus" } },
	{ "ImageLabel", { "Image", "ImageColor3", "ImageTransparency", "ScaleType" } },
	{ "ImageButton", { "Image", "ImageColor3", "ImageTransparency", "ScaleType" } },
	{ "ScrollingFrame", { "CanvasSize", "ScrollBarThickness", "AutomaticCanvasSize" } },
	{ "UIListLayout", { "FillDirection", "Padding", "SortOrder", "HorizontalAlignment", "VerticalAlignment" } },
	{ "UIPadding", { "PaddingTop", "PaddingBottom", "PaddingLeft", "PaddingRight" } },
	{ "UICorner", { "CornerRadius" } },
	{ "LayerCollector", { "Enabled", "ResetOnSpawn", "ZIndexBehavior" } },
	{ "BillboardGui", { "Adornee", "Size", "AlwaysOnTop", "StudsOffset", "MaxDistance" } },
	{ "SurfaceGui", { "Adornee", "Face", "AlwaysOnTop", "PixelsPerStud" } },
	{ "Attachment", { "Position", "Orientation", "Visible" } },
	{ "Constraint", { "Attachment0", "Attachment1", "Enabled" } },
	{ "Humanoid", { "Health", "MaxHealth", "WalkSpeed", "JumpPower", "JumpHeight", "HipHeight" } },
	{ "Camera", { "CFrame", "FieldOfView", "CameraType" } },
	{ "Lighting", { "Ambient", "Brightness", "ClockTime", "GeographicLatitude", "OutdoorAmbient", "FogEnd", "FogStart", "FogColor", "EnvironmentDiffuseScale", "ExposureCompensation" } },
	{ "Workspace", { "Gravity", "StreamingEnabled", "FallenPartsDestroyHeight" } },
	{ "ParticleEmitter", { "Rate", "Lifetime", "Speed", "Enabled", "Texture", "Color", "Size", "Transparency", "SpreadAngle" } },
	{ "Beam", { "Attachment0", "Attachment1", "Color", "Width0", "Width1", "Enabled", "Texture" } },
	{ "ProximityPrompt", { "ActionText", "ObjectText", "HoldDuration", "MaxActivationDistance", "Enabled" } },
	{ "Tool", { "RequiresHandle", "CanBeDropped", "Grip", "ToolTip" } },
	{ "Team", { "TeamColor", "AutoAssignable" } },
	{ "ValueBase", { "Value" } },
}

local function propsPara(inst)
	local lista = {}
	local vistos = {}
	for _, par in ipairs(PROPS) do
		local ok, isa = pcall(function()
			return inst:IsA(par[1])
		end)
		if ok and isa then
			for _, nome in ipairs(par[2]) do
				if not vistos[nome] then
					vistos[nome] = true
					table.insert(lista, nome)
				end
			end
		end
	end
	return lista
end

local function lerPropriedades(inst, nomes)
	local saida = {}
	for _, nome in ipairs(nomes) do
		local ok, valor = pcall(function()
			if nome == "Source" and inst:IsA("LuaSourceContainer") then return ScriptEditorService:GetEditorSource(inst) end
			return inst[nome]
		end)
		if ok then
			local cod = codificar(valor)
			if cod ~= nil then
				saida[nome] = cod
			end
		end
	end
	return saida
end

local function resumo(inst)
	return { id = idDe(inst), name = inst.Name, className = inst.ClassName, path = caminhoDe(inst) }
end

local function fonteDe(scr)
	local ok, txt = pcall(function()
		return ScriptEditorService:GetEditorSource(scr)
	end)
	if ok and type(txt) == "string" then
		return txt
	end
	local ok2, txt2 = pcall(function()
		return scr.Source
	end)
	if ok2 and type(txt2) == "string" then
		return txt2
	end
	error("nao consegui ler o codigo deste script", 0)
end

local function ehFonte(inst)
	local ok, isa = pcall(function()
		return inst:IsA("LuaSourceContainer")
	end)
	return ok and isa == true
end

local varredura = {
	internos = { CoreGui = true, CorePackages = true, RobloxPluginGuiService = true, PluginGuiService = true, PluginDebugService = true, StudioService = true, CoreScriptSyncService = true, RobloxReplicatedStorage = true, StudioData = true, GuiRoot = true, PluginPolicyService = true, ScriptEditorService = true },
	indice = nil, pronto = false, vivo = false, construtor = nil,
	lower = {}, bytesCache = 0, TETO_CACHE = 32 * 1024 * 1024, TETO_SCRIPT = 256 * 1024,
}

function varredura.raizes(raiz)
	if raiz ~= game then return { raiz } end
	local out = {}
	for _, svc in ipairs(game:GetChildren()) do
		if not varredura.internos[svc.ClassName] then table.insert(out, svc) end
	end
	return out
end

function varredura.cada(raiz, orcamento, fn)
	for _, r in ipairs(varredura.raizes(raiz)) do
		if raiz == game and fn(r) then return true end
		local okFilhos, filhos = pcall(r.GetChildren, r)
		for _, filho in ipairs(okFilhos and filhos or {}) do
			respirar(orcamento)
			if fn(filho) then return true end
			local ok, lista = pcall(filho.GetDescendants, filho)
			if ok then
				for _, inst in ipairs(lista) do
					respirar(orcamento)
					if fn(inst) then return true end
				end
			end
		end
	end
	return false
end
function varredura.dentroDoProjeto(inst)
	local topo = inst
	while topo.Parent ~= nil and topo.Parent ~= game do topo = topo.Parent end
	return topo.Parent == game and not varredura.internos[topo.ClassName]
end
function varredura.esquecer(inst)
	if varredura.indice ~= nil then varredura.indice[inst] = nil end
	local c = varredura.lower[inst]
	if c ~= nil then
		varredura.bytesCache = varredura.bytesCache - 2 * #c.fonte
		varredura.lower[inst] = nil
	end
end

varredura.vivo = pcall(function()
	game.DescendantAdded:Connect(function(inst)
		if varredura.indice ~= nil and ehFonte(inst) and varredura.dentroDoProjeto(inst) then varredura.indice[inst] = true end
	end)
	game.DescendantRemoving:Connect(varredura.esquecer)
end)

function varredura.scripts()
	if varredura.pronto and varredura.vivo then return varredura.indice end
	if varredura.construtor == nil or coroutine.status(varredura.construtor) == "dead" then
		varredura.pronto = false
		local idx = {}
		varredura.indice = idx
		varredura.construtor = task.spawn(function()
			local ok = pcall(varredura.cada, game, novoOrcamento(), function(inst)
				if ehFonte(inst) then idx[inst] = true end
			end)
			if ok and varredura.indice == idx then varredura.pronto = true end
		end)
	end
	while not varredura.pronto and coroutine.status(varredura.construtor) ~= "dead" do
		task.wait()
	end
	if not varredura.pronto then error("nao consegui indexar os scripts do place", 0) end
	return varredura.indice
end

function varredura.candidatos(raiz, orcamento, filtroNome)
	local function passaNome(inst)
		return filtroNome == nil or string.find(string.lower(inst.Name), filtroNome, 1, true) ~= nil
	end
	if ehFonte(raiz) then
		return passaNome(raiz) and { raiz } or {}, 1
	end
	local lista, chaves, total = {}, {}, 0
	local function aceitar(inst)
		total = total + 1
		if passaNome(inst) then
			table.insert(lista, inst)
			chaves[inst] = inst:GetFullName()
		end
	end
	if raiz ~= game and not varredura.dentroDoProjeto(raiz) then

		varredura.cada(raiz, orcamento, function(inst)
			if ehFonte(inst) then aceitar(inst) end
		end)
	else

		local todos = {}
		for inst in pairs(varredura.scripts()) do todos[#todos + 1] = inst end
		for _, inst in ipairs(todos) do
			respirar(orcamento)
			if not inst:IsDescendantOf(game) then
				varredura.esquecer(inst)
			elseif raiz == game or inst:IsDescendantOf(raiz) then
				aceitar(inst)
			end
		end
	end
	table.sort(lista, function(x, y) return chaves[x] < chaves[y] end)
	return lista, total
end

function varredura.minusculas(inst, fonte)
	local c = varredura.lower[inst]
	if c ~= nil then
		if c.fonte == fonte then return c.lower end
		varredura.bytesCache = varredura.bytesCache - 2 * #c.fonte
		varredura.lower[inst] = nil
	end
	local l = string.lower(fonte)
	if varredura.vivo and #fonte <= varredura.TETO_SCRIPT and varredura.bytesCache + 2 * #fonte <= varredura.TETO_CACHE then
		varredura.lower[inst] = { fonte = fonte, lower = l }
		varredura.bytesCache = varredura.bytesCache + 2 * #fonte
	end
	return l
end

local function gravarFonte(scr,novo,base)
 base=base or fonteDe(scr)
 local ctx=contextoAtual
 local conflict=false
 local ok,err=pcall(function()
  ScriptEditorService:UpdateSourceAsync(scr,function(current)
   if (ctx and (ctx.cancelled or ctx.done)) or current~=base then conflict=true;return nil end
   return novo
  end)
 end)
 if conflict then error({code='STALE_REVISION',message='O editor mudou durante a gravacao; releia. Nenhum fallback Source foi usado.',nothingExecuted=false},0)end
 if ok then return true end
 if ctx and (ctx.cancelled or ctx.done)then error('Gravacao cancelada',0)end

 if fonteDe(scr)~=base or scr.Source~=base then error('Editor/Source divergiu. Releia com get_script antes de editar.',0)end
 local saved,failed=pcall(function()scr.Source=novo end)
 if not saved then error('Falha ao gravar codigo: '..tostring(failed or err),0)end
 return true
end

local acoes = {}

acoes.get_tree = function(a)
	local raiz = a.target ~= nil and resolver(a.target) or game
	local prof = math.clamp(math.floor(tonumber(a.depth) or 2), 1, 10)
	local teto = math.clamp(math.floor(tonumber(a.limit) or 250), 1, 2000)
	local filtro = {}
	local temFiltro = false
	if type(a.classes) == "table" then
		for _, c in ipairs(a.classes) do
			filtro[string.lower(tostring(c))] = true
			temFiltro = true
		end
	end
	local total = 0
	local cortado = false
	local orcamento = novoOrcamento()
	local function montar(inst, nivel)
		if total >= teto then
			cortado = true
			return nil
		end
		respirar(orcamento)
		local no = resumo(inst)
		local filhos = inst:GetChildren()
		no.childCount = #filhos
		local lista = nil
		if nivel < prof then
			for _, f in ipairs(filhos) do
				local sub = montar(f, nivel + 1)
				if sub ~= nil then
					lista = lista or {}
					table.insert(lista, sub)
				end
				if total >= teto then
					cortado = true
					break
				end
			end
		elseif #filhos > 0 then
			no.hasMore = true
		end
		no.children = lista
		if temFiltro and not filtro[string.lower(inst.ClassName)] and lista == nil then
			return nil
		end
		total = total + 1
		return no
	end
	local arvore = montar(raiz, 0)
	return { tree = arvore, nodes = total, truncated = cortado, depth = prof }
end

acoes.find_instances = function(a)
	local raiz = a.target ~= nil and resolver(a.target) or game
	local teto = math.clamp(math.floor(tonumber(a.limit) or 50), 1, 500)
	local modo = tostring(a.mode or "contains")
	local alvoNome = a.query ~= nil and tostring(a.query) or nil
	local classe = a.className ~= nil and tostring(a.className) or nil
	if alvoNome == nil and classe == nil then
		error("informe query e/ou className", 0)
	end
	local alvoMinusculo = alvoNome ~= nil and string.lower(alvoNome) or nil
	local function combinaNome(nome)
		if alvoNome == nil then
			return true
		end
		if modo == "exact" then
			return nome == alvoNome
		end
		if modo == "pattern" then
			local ok, res = pcall(string.match, nome, alvoNome)
			return ok and res ~= nil
		end
		return string.find(string.lower(nome), alvoMinusculo, 1, true) ~= nil
	end
	local function combinaClasse(inst)
		if classe == nil then
			return true
		end
		local ok, isa = pcall(inst.IsA, inst, classe)
		return (ok and isa == true) or inst.ClassName == classe
	end
	local achados = {}
	local vistos = 0
	local cortado = false
	local orcamento = novoOrcamento()
	local inicio = os.clock()
	local function visitar(inst)
		vistos = vistos + 1
		if combinaClasse(inst) and combinaNome(inst.Name) then
			table.insert(achados, resumo(inst))
			if #achados >= teto then
				cortado = true
				return true
			end
		end
		return false
	end
	local CLASSES_SCRIPT = { Script = true, LocalScript = true, ModuleScript = true, LuaSourceContainer = true, BaseScript = true }
	if classe ~= nil and CLASSES_SCRIPT[classe] then

		for _, inst in ipairs((varredura.candidatos(raiz, orcamento))) do
			if visitar(inst) then break end
		end
	else
		varredura.cada(raiz, orcamento, visitar)
	end
	return { results = achados, count = #achados, scanned = vistos, truncated = cortado, ms = math.floor((os.clock() - inicio) * 1000) }
end

acoes.get_instance = function(a)
	local inst = resolver(a.target)
	local nomes = nil
	if type(a.properties) == "table" and #a.properties > 0 then
		nomes = {}
		for _, n in ipairs(a.properties) do
			table.insert(nomes, tostring(n))
		end
	else
		nomes = propsPara(inst)
	end
	local saida = resumo(inst)
	saida.parent = caminhoDe(inst.Parent)
	saida.properties = lerPropriedades(inst, nomes)
	local okAttr, attrs = pcall(function()
		return inst:GetAttributes()
	end)
	if okAttr and attrs ~= nil then
		saida.attributes = codificar(attrs)
	end
	local okTags, tags = pcall(function()
		return CollectionService:GetTags(inst)
	end)
	if okTags and tags ~= nil and #tags > 0 then
		saida.tags = tags
	end
	if a.includeChildren ~= false then
		local filhos = {}
		for i, f in ipairs(inst:GetChildren()) do
			if i <= 200 then
				table.insert(filhos, resumo(f))
			end
		end
		saida.children = filhos
		saida.childCount = #inst:GetChildren()
	end
	local okScript = pcall(function()
		return inst:IsA("LuaSourceContainer")
	end)
	if okScript and inst:IsA("LuaSourceContainer") then
		local ok, fonte = pcall(fonteDe, inst)
		if ok then
			local _, linhas = string.gsub(fonte, "\n", "")
			saida.script = { lines = linhas + 1, chars = #fonte, hint = "use get_script para ler o codigo" }
		end
	end
	return saida
end

local function aplicarPropriedades(inst,props,attrs)
 local aplicadas,falhas={},{}

 if type(props)=='table' and props.Source~=nil and inst:IsA('LuaSourceContainer')then
  gravarFonte(inst,props.Source);table.insert(aplicadas,'Source')
  local copy={};for k,v in pairs(props)do if k~='Source'then copy[k]=v end end;props=copy
 end
	if type(props) == "table" then
		for nome, valor in pairs(props) do
			local chaveProp = tostring(nome)
			local okLer, atual = pcall(function()
				return inst[chaveProp]
			end)
			local ok, erro = pcall(function()
				local convertido = converter(okLer and atual or nil, valor)
				inst[chaveProp] = convertido
			end)
			if ok then
				table.insert(aplicadas, chaveProp)
			else
				table.insert(falhas, { property = chaveProp, error = tostring(erro) })
			end
		end
	end
	if type(attrs) == "table" then
		for nome, valor in pairs(attrs) do
			local ok, erro = pcall(function()
				inst:SetAttribute(tostring(nome), valor)
			end)
			if ok then
				table.insert(aplicadas, "@" .. tostring(nome))
			else
				table.insert(falhas, { attribute = tostring(nome), error = tostring(erro) })
			end
		end
	end
	return aplicadas, falhas
end

acoes.create_instance = function(a)
	local classe = tostring(a.className or "")
	if classe == "" then
		error("informe className", 0)
	end
	local pai = a.parent ~= nil and resolver(a.parent) or game:GetService("Workspace")
	return comHistorico("MCP criar " .. classe, function()
		local okNovo, inst = pcall(function()
			return Instance.new(classe)
		end)
		if not okNovo then
			error('nao consigo criar "' .. classe .. '": classe invalida ou nao criavel por script (' .. tostring(inst) .. ')', 0)
		end
		if a.name ~= nil then
			inst.Name = tostring(a.name)
		end
		local aplicadas, falhas = aplicarPropriedades(inst, a.properties, nil)
		inst.Parent = pai
		if a.select == true then
			Selection:Set({ inst })
		end
		local saida = resumo(inst)
		saida.applied = aplicadas
		if #falhas > 0 then
			saida.failed = falhas
		end
		return saida
	end)
end

acoes.set_properties = function(a)
	local inst = resolver(a.target)
	return comHistorico("MCP alterar " .. inst.Name, function()
		local aplicadas, falhas = aplicarPropriedades(inst, a.properties, a.attributes)
		if #aplicadas == 0 and #falhas > 0 then
			error("nenhuma propriedade foi aplicada: " .. HttpService:JSONEncode(falhas), 0)
		end
		local saida = resumo(inst)
		saida.applied = aplicadas
		if #falhas > 0 then
			saida.failed = falhas
		end
		return saida
	end)
end

acoes.delete_instance = function(a)
	local alvos = a.targets
	if type(alvos) ~= "table" or #alvos == 0 then
		error("informe targets: uma lista de caminhos ou ids", 0)
	end
	return comHistorico("MCP apagar", function()
		local apagados = {}
		local orcamento = novoOrcamento()
		for _, ref in ipairs(alvos) do
			local inst = resolver(ref)
			if inst == game then
				error("nao vou apagar o game", 0)
			end
			table.insert(apagados, caminhoDe(inst))
			inst:Destroy()
			respirar(orcamento)
		end
		return { deleted = apagados, count = #apagados }
	end)
end

acoes.move_instance = function(a)
	local inst = resolver(a.target)
	local pai = resolver(a.parent)
	return comHistorico("MCP mover " .. inst.Name, function()
		inst.Parent = pai
		return resumo(inst)
	end)
end

acoes.duplicate_instance = function(a)
	local inst = resolver(a.target)
	local quantos = math.clamp(math.floor(tonumber(a.count) or 1), 1, 100)
	local pai = a.parent ~= nil and resolver(a.parent) or inst.Parent
	return comHistorico("MCP duplicar " .. inst.Name, function()
		local criados = {}
		local orcamento = novoOrcamento()
		for i = 1, quantos do
			local copia = inst:Clone()
			if a.name ~= nil then
				copia.Name = quantos == 1 and tostring(a.name) or (tostring(a.name) .. i)
			end
			copia.Parent = pai
			table.insert(criados, resumo(copia))
			respirar(orcamento)
		end
		return { created = criados, count = #criados }
	end)
end

acoes.get_script = function(a)
	local inst = resolver(a.target)
	if not inst:IsA("LuaSourceContainer") then
		error(caminhoDe(inst) .. " nao e um script (e " .. inst.ClassName .. ")", 0)
	end
	local fonte = fonteDe(inst)
	local revision = controle:read(contextoAtual.agent,inst,fonte)
	local linhas = string.split(fonte, "\n")
	local ini = math.max(1, math.floor(tonumber(a.lineStart) or 1))
	local fim = math.min(#linhas, math.floor(tonumber(a.lineEnd) or #linhas))
	local pedaco = {}
	for i = ini, fim do
		table.insert(pedaco, linhas[i])
	end
	return {
		path = caminhoDe(inst),
		id = idDe(inst),
		className = inst.ClassName,
		lines = #linhas,
		revision = revision,
		lineStart = ini,
		lineEnd = fim,
		source = table.concat(pedaco, "\n"),
	}
end

acoes.grep_scripts = function(a)
	local raiz = a.target ~= nil and resolver(a.target) or game
	local padrao = tostring(a.pattern or "")
	if padrao == "" then
		error("informe pattern", 0)
	end
	local regex = a.regex == true
	local sensivel = a.caseSensitive == true
	local ctxLinhas = math.clamp(math.floor(tonumber(a.context) or 0), 0, 5)
	local teto = math.clamp(math.floor(tonumber(a.limit) or 100), 1, 1000)
	local maxPorScript = math.clamp(math.floor(tonumber(a.maxPerScript) or 25), 1, 200)
	local filtroNome = a.scriptName ~= nil and string.lower(tostring(a.scriptName)) or nil
	local agulha = sensivel and padrao or string.lower(padrao)
	if regex then
		local ok, err = pcall(string.find, "", agulha)
		if not ok then
			error("pattern invalido: " .. tostring(err), 0)
		end
	end

	local function casa(alvo)
		if regex then
			local ok, s = pcall(string.find, alvo, agulha)
			return ok and s ~= nil
		end
		return string.find(alvo, agulha, 1, true) ~= nil
	end

	local prefiltro = not regex or string.find(padrao, "[%^%$]") == nil
	local inicio = os.clock()
	local orcamento = novoOrcamento()

	local lista, indexados = varredura.candidatos(raiz, orcamento, filtroNome)
	local porScript = {}
	local scripts, comMatch, total, cortado = 0, 0, 0, false
	for _, inst in ipairs(lista) do
		respirar(orcamento)
		if total >= teto then
			cortado = true
			break
		end
		do
			scripts = scripts + 1
			local ok, fonte = pcall(fonteDe, inst)
			local texto = ok and (sensivel and fonte or varredura.minusculas(inst, fonte)) or nil
			if ok and (not prefiltro or casa(texto)) then
				local linhas = string.split(fonte, "\n")
				local alvos = sensivel and linhas or string.split(texto, "\n")
				local aqui = 0
				local entrada = nil
				for i = 1, #linhas do
					if i % 64 == 0 then
						respirar(orcamento)
					end
					if casa(alvos[i]) then
						local linha = linhas[i]
						if entrada == nil then
							entrada = { path = caminhoDe(inst), id = idDe(inst), className = inst.ClassName, lines = #linhas, matches = {} }
							comMatch = comMatch + 1
							table.insert(porScript, entrada)
						end
						aqui = aqui + 1
						total = total + 1
						local m = { line = i, text = string.sub(linha, 1, 300) }
						if ctxLinhas > 0 then
							local antes, depois = {}, {}
							for j = math.max(1, i - ctxLinhas), i - 1 do
								table.insert(antes, string.sub(linhas[j], 1, 300))
							end
							for j = i + 1, math.min(#linhas, i + ctxLinhas) do
								table.insert(depois, string.sub(linhas[j], 1, 300))
							end
							m.before = antes
							m.after = depois
						end
						table.insert(entrada.matches, m)
						if aqui >= maxPorScript then
							entrada.truncated = true
							break
						end
						if total >= teto then
							cortado = true
							break
						end
					end
				end
			end
		end
	end
	return { pattern = padrao, regex = regex, scripts = scripts, indexedScripts = indexados, matchedScripts = comMatch, count = total, truncated = cortado, results = porScript, ms = math.floor((os.clock() - inicio) * 1000) }
end

local OUTLINE_PADROES = {
	{ "^(%s*)local%s+function%s+([%w_%.:]+)%s*%(([^)]*)%)", "local function" },
	{ "^(%s*)function%s+([%w_%.:]+)%s*%(([^)]*)%)", "function" },
	{ "^(%s*)local%s+([%w_]+)%s*=%s*function%s*%(([^)]*)%)", "local function" },
	{ "^(%s*)([%w_%.:%[%]\"']+)%s*=%s*function%s*%(([^)]*)%)", "function" },
}

acoes.outline_script = function(a)
	local inst = resolver(a.target)
	if not inst:IsA("LuaSourceContainer") then
		error(caminhoDe(inst) .. " nao e um script (e " .. inst.ClassName .. ")", 0)
	end
	local fonte = fonteDe(inst)
	local linhas = string.split(fonte, "\n")
	local itens, requires, services = {}, {}, {}
	local orcamento = novoOrcamento()
	local incluirLocais = a.locals ~= false
	for i, linha in ipairs(linhas) do
		if i % 64 == 0 then
			respirar(orcamento)
		end
		local achou = false
		for _, p in ipairs(OUTLINE_PADROES) do
			local indent, nome, params = string.match(linha, p[1])
			if nome ~= nil then
				table.insert(itens, { kind = p[2], name = nome, params = (string.gsub(params or "", "%s+", " ")), line = i, indent = #indent })
				achou = true
				break
			end
		end
		if not achou then
			local indent, nomes, modulo = string.match(linha, "^(%s*)local%s+([%w_,%s]-)%s*=%s*require%s*%(?%s*(.-)%s*%)?%s*$")
			if nomes ~= nil and modulo ~= nil and modulo ~= "" then
				local nomeLimpo = (string.gsub(nomes, "%s+", ""))
				table.insert(requires, { name = nomeLimpo, module = modulo, line = i })
				table.insert(itens, { kind = "require", name = nomeLimpo, params = modulo, line = i, indent = #indent })
				achou = true
			end
		end
		if not achou then
			local nome, servico = string.match(linha, "^%s*local%s+([%w_]+)%s*=%s*game:GetService%(%s*[\"']([%w_]+)[\"']%s*%)")
			if nome ~= nil then
				table.insert(services, { name = nome, service = servico, line = i })
				achou = true
			end
		end
		if not achou and incluirLocais then
			local nomes = string.match(linha, "^local%s+([%w_,%s]-)%s*=")
			if nomes ~= nil and not string.find(linha, "function", 1, true) then
				table.insert(itens, { kind = "local", name = (string.gsub(nomes, "%s+", "")), line = i, indent = 0 })
				achou = true
			end
		end
		if not achou then
			local ret = string.match(linha, "^return%s+(.+)$")
			if ret ~= nil then
				table.insert(itens, { kind = "return", name = string.sub(ret, 1, 120), line = i, indent = 0 })
			end
		end
	end
	return { path = caminhoDe(inst), id = idDe(inst), className = inst.ClassName, lines = #linhas, chars = #fonte, functions = itens, requires = requires, services = services }
end

acoes.set_script = function(a)
	local inst = resolver(a.target)
	if not inst:IsA("LuaSourceContainer") then
		error(caminhoDe(inst) .. " nao e um script (e " .. inst.ClassName .. ")", 0)
	end
	local atual = fonteDe(inst)
	local novo = nil
	local trocas = 0
	if type(a.edits) == "table" and #a.edits > 0 then
		novo = atual
		for i, ed in ipairs(a.edits) do
			local procura = tostring(ed.find or "")
			local troca = tostring(ed.replace or "")
			if procura == "" then
				error("edit " .. i .. ": find vazio", 0)
			end
			local quantas = 0
			local pos = 1
			while true do
				local s = string.find(novo, procura, pos, true)
				if s == nil then
					break
				end
				quantas = quantas + 1
				pos = s + #procura
			end
			if quantas == 0 then
				error("edit " .. i .. ': nao achei o trecho "' .. string.sub(procura, 1, 80) .. '" no script; leia com get_script antes de editar', 0)
			end
			if quantas > 1 and ed.all ~= true then
				error("edit " .. i .. ": o trecho aparece " .. quantas .. " vezes; use um trecho maior ou all=true", 0)
			end
			local inicio = string.find(novo, procura, 1, true)
			if ed.all == true then
				local partes = string.split(novo, procura)
				novo = table.concat(partes, troca)
				trocas = trocas + quantas
			else
				novo = string.sub(novo, 1, inicio - 1) .. troca .. string.sub(novo, inicio + #procura)
				trocas = trocas + 1
			end
		end
	elseif a.source ~= nil then
		novo = tostring(a.source)
	else
		error("informe source (codigo completo) ou edits (lista de trocas)", 0)
	end
	return comHistorico("MCP escrever " .. inst.Name, function()
		gravarFonte(inst, novo, atual)
		local _, linhas = string.gsub(novo, "\n", "")
		return { path = caminhoDe(inst), id = idDe(inst), lines = linhas + 1, chars = #novo, edits = trocas }
	end)
end

acoes.create_script = function(a)
	local tipo = tostring(a.kind or "Script")
	if tipo ~= "Script" and tipo ~= "LocalScript" and tipo ~= "ModuleScript" then
		error("kind deve ser Script, LocalScript ou ModuleScript", 0)
	end
	local pai = a.parent ~= nil and resolver(a.parent) or game:GetService("ServerScriptService")
	return comHistorico("MCP criar " .. tipo, function()
		local scr = Instance.new(tipo)
		scr.Name = tostring(a.name or tipo)
		if a.runContext ~= nil and tipo == "Script" then
			pcall(function()
				scr.RunContext = paraEnum(Enum.RunContext, a.runContext)
			end)
		end
		scr.Parent = pai
		if a.source ~= nil then
			gravarFonte(scr, tostring(a.source))
		end
		return resumo(scr)
	end)
end

local quadroCompartilhado={exceeded=quadroEstourado,yield=cederQuadro}
local executarLuau=criarRunLuau({task=task,clock=os.clock,compile=loadstring,setEnvironment=setfenv,environment=getfenv(),log=LogService.MessageOut,encode=codificar,history=comHistorico,require=require,source=fonteDe,path=caminhoDe,freshDefault=true,frame=quadroCompartilhado})
acoes.run_luau=function(a)return executarLuau(a,contextoAtual)end

acoes.get_selection = function()
	local itens = {}
	for _, inst in ipairs(Selection:Get()) do
		table.insert(itens, resumo(inst))
	end
	return { selection = itens, count = #itens }
end

acoes.set_selection = function(a)
	if type(a.targets) ~= "table" then
		error("informe targets: uma lista de caminhos ou ids", 0)
	end
	local itens = {}
	for _, ref in ipairs(a.targets) do
		table.insert(itens, resolver(ref))
	end
	Selection:Set(itens)
	return { selected = #itens }
end

local TIPOS_ASSET = { [1] = "decal", [13] = "decal", [3] = "audio", [4] = "mesh", [40] = "mesh", [62] = "video", [10] = "model" }
acoes.insert_asset = function(a)
	local id = math.floor(tonumber(a.assetId) or 0)
	if id <= 0 then
		error("informe assetId (numero)", 0)
	end
	local pai = a.parent ~= nil and resolver(a.parent) or game:GetService("Workspace")
	local tipo = string.lower(tostring(a.kind or "auto"))
	local uri = "rbxassetid://" .. id
	local tipoId = nil
	if tipo == "auto" or tipo == "image" then
		local okInfo, info = pcall(function()
			return MarketplaceService:GetProductInfo(id)
		end)
		if okInfo and type(info) == "table" then
			tipoId = tonumber(info.AssetTypeId)
		end
		if tipo == "auto" then
			tipo = TIPOS_ASSET[tipoId] or "model"
		else
			tipo = "decal"
		end
	end
	return comHistorico("MCP inserir asset " .. id, function()
		local criados = {}
		local function colocar(inst)
			if a.name ~= nil then
				inst.Name = tostring(a.name)
			end
			inst.Parent = pai
			table.insert(criados, inst)
		end
		if tipo == "audio" then
			local som = Instance.new("Sound")
			som.SoundId = uri
			som.Name = "Sound_" .. id
			colocar(som)
		elseif tipo == "decal" then
			local como = tostring(a.as or "")
			if como == "" then
				if pai:IsA("BasePart") then
					como = "Decal"
				elseif pai:IsA("GuiBase2d") or pai:IsA("LayerCollector") then
					como = "ImageLabel"
				else
					error("para imagem/decal o parent precisa ser um BasePart (vira Decal/Texture) ou uma Gui (vira ImageLabel/ImageButton); ou informe as=Decal|Texture|ImageLabel|ImageButton", 0)
				end
			end
			if como ~= "Decal" and como ~= "Texture" and como ~= "ImageLabel" and como ~= "ImageButton" then
				error("as invalido para imagem: use Decal, Texture, ImageLabel ou ImageButton", 0)
			end
			local inst = Instance.new(como)
			if como == "Decal" or como == "Texture" then
				inst.Texture = uri
			else
				inst.Image = uri
				inst.BackgroundTransparency = 1
				inst.Size = UDim2.fromOffset(200, 200)
			end
			colocar(inst)
		elseif tipo == "video" then
			local video = Instance.new("VideoFrame")
			video.Video = uri
			video.Size = UDim2.fromOffset(320, 180)
			colocar(video)
		elseif tipo == "mesh" then
			local okM, malha = pcall(function()
				return InsertService:CreateMeshPartAsync(Content.fromUri(uri), { CollisionFidelity = Enum.CollisionFidelity.Default, RenderFidelity = Enum.RenderFidelity.Automatic })
			end)
			if not okM or malha == nil then
				okM, malha = pcall(function()
					return InsertService:CreateMeshPartAsync(uri, Enum.CollisionFidelity.Default, Enum.RenderFidelity.Automatic)
				end)
			end
			if not okM or malha == nil then
				error("nao consegui criar MeshPart do mesh " .. id .. ": " .. tostring(malha), 0)
			end
			malha.Anchored = true
			if malha.Name == "" or malha.Name == "MeshPart" then
				malha.Name = "Mesh_" .. id
			end
			colocar(malha)
		else
			local ok, pacote = pcall(function()
				return InsertService:LoadAsset(id)
			end)
			if not ok then
				error("nao consegui carregar o asset " .. id .. ": " .. tostring(pacote) .. " (o asset precisa ser seu, publico ou gratis na Toolbox; para audio/decal/mesh informe kind)", 0)
			end
			for _, filho in ipairs(pacote:GetChildren()) do
				colocar(filho)
			end
			pacote:Destroy()
		end
		if type(a.position) == "table" then
			local p = Vector3.new(tonumber(a.position[1]) or 0, tonumber(a.position[2]) or 0, tonumber(a.position[3]) or 0)
			for _, inst in ipairs(criados) do
				if inst:IsA("PVInstance") then
					local atual = inst:GetPivot()
					inst:PivotTo(CFrame.new(p) * atual.Rotation)
				end
			end
		end
		local scripts, removidos, pecas = {}, 0, 0
		local orcamento = novoOrcamento()
		for _, inst in ipairs(criados) do
			local lista = inst:GetDescendants()
			table.insert(lista, 1, inst)
			for _, d in ipairs(lista) do
				respirar(orcamento)
				if d:IsA("LuaSourceContainer") then
					if a.removeScripts == true then
						d:Destroy()
						removidos = removidos + 1
					elseif #scripts < 60 then
						table.insert(scripts, caminhoDe(d) .. " [" .. d.ClassName .. "]")
					end
				elseif d:IsA("BasePart") then
					pecas = pecas + 1
				end
			end
		end
		local saida = {}
		for _, inst in ipairs(criados) do
			local item = resumo(inst)
			if inst:IsA("PVInstance") then
				local okB, cf, tam = pcall(function()
					if inst:IsA("Model") then
						return inst:GetBoundingBox()
					end
					return inst.CFrame, inst.Size
				end)
				if okB then
					item.position = { math.floor(cf.Position.X * 100 + 0.5) / 100, math.floor(cf.Position.Y * 100 + 0.5) / 100, math.floor(cf.Position.Z * 100 + 0.5) / 100 }
					item.size = { math.floor(tam.X * 100 + 0.5) / 100, math.floor(tam.Y * 100 + 0.5) / 100, math.floor(tam.Z * 100 + 0.5) / 100 }
				end
			end
			table.insert(saida, item)
		end
		if a.select == true then
			pcall(function()
				Selection:Set(criados)
			end)
		end
		return { inserted = saida, count = #saida, assetId = id, assetType = tipo, assetTypeId = tipoId, parts = pecas, scripts = scripts, scriptsRemoved = removidos }
	end)
end

acoes.get_logs = function(a)
	local teto = math.clamp(math.floor(tonumber(a.limit) or 60), 1, 500)
	local nivel = string.lower(tostring(a.level or "all"))
	local contem = a.contains ~= nil and string.lower(tostring(a.contains)) or nil
	local ok, historico = pcall(function()
		return LogService:GetLogHistory()
	end)
	if not ok then
		error("nao consegui ler a saida do Studio: " .. tostring(historico), 0)
	end
	local mapa = {
		[Enum.MessageType.MessageOutput] = "output",
		[Enum.MessageType.MessageInfo] = "info",
		[Enum.MessageType.MessageWarning] = "warning",
		[Enum.MessageType.MessageError] = "error",
	}
	local filtradas = {}
	local orcamento = novoOrcamento()
	for _, linha in ipairs(historico) do
		respirar(orcamento)
		local tipo = mapa[linha.messageType] or "output"
		local passa = nivel == "all" or nivel == tipo
		if passa and contem ~= nil then
			passa = string.find(string.lower(tostring(linha.message)), contem, 1, true) ~= nil
		end
		if passa then
			table.insert(filtradas, { message = linha.message, level = tipo, at = linha.timestamp })
		end
	end
	local saida = {}
	local ini = math.max(1, #filtradas - teto + 1)
	for i = ini, #filtradas do
		table.insert(saida, filtradas[i])
	end
	return { logs = saida, count = #saida, total = #filtradas }
end

acoes.undo_history = function(a)
	local acao = string.lower(tostring(a.action or "undo"))
	local passos = math.clamp(math.floor(tonumber(a.steps) or 1), 1, 25)
	local feitos = 0
	for _ = 1, passos do
		local ok = pcall(function()
			if acao == "redo" then
				ChangeHistoryService:Redo()
			else
				ChangeHistoryService:Undo()
			end
		end)
		if not ok then
			break
		end
		feitos = feitos + 1
	end
	return { action = acao, steps = feitos, requested = passos }
end

__MCP_MODULE_INTEGRACAO__()

__MCP_MODULE_INSPECAO__()

__MCP_MODULE_IMPORTMCP__()

__MCP_MODULE_LIVESESSION__()

__MCP_MODULE_TESTE__()

__MCP_MODULE_EXPORTAR__()

local NOMES = {}
for nome in pairs(acoes) do
	table.insert(NOMES, nome)
end
table.sort(NOMES)

__MCP_MODULE_REDE__()

__MCP_MODULE_RELAY__()

local FUNDO = Color3.fromRGB(46, 46, 46)
local CAMPO = Color3.fromRGB(30, 30, 30)
local TEXTO = Color3.fromRGB(235, 235, 235)
local FRACO = Color3.fromRGB(160, 160, 160)

local barra = plugin:CreateToolbar("MCP")
local botaoBarra = barra:CreateButton("MCP Studio", "Conectar o Studio ao seu Worker MCP", "")
botaoBarra.ClickableWhenViewportHidden = true

local info = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, false, true, 420, 280, 340, 240)
local janela = plugin:CreateDockWidgetPluginGui("MCPStudioNotion", info)
janela.Title = "MCP Studio (Notion)"
janela.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

local raiz = Instance.new("Frame")
raiz.Size = UDim2.fromScale(1, 1)
raiz.BackgroundColor3 = FUNDO
raiz.BorderSizePixel = 0
raiz.Parent = janela

local pad = Instance.new("UIPadding")
pad.PaddingTop = UDim.new(0, 10)
pad.PaddingBottom = UDim.new(0, 10)
pad.PaddingLeft = UDim.new(0, 10)
pad.PaddingRight = UDim.new(0, 10)
pad.Parent = raiz

local coluna = Instance.new("UIListLayout")
coluna.FillDirection = Enum.FillDirection.Vertical
coluna.Padding = UDim.new(0, 6)
coluna.SortOrder = Enum.SortOrder.LayoutOrder
coluna.Parent = raiz

local function rotulo(texto, ordem, cor, tamanho)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = UDim2.new(1, 0, 0, tamanho or 16)
	l.Font = Enum.Font.SourceSans
	l.TextSize = 14
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextYAlignment = Enum.TextYAlignment.Top
	l.TextColor3 = cor or TEXTO
	l.Text = texto
	l.TextWrapped = true
	l.LayoutOrder = ordem
	l.Parent = raiz
	return l
end

rotulo("URL do MCP (a mesma que voce colou no Notion)", 1, FRACO)

local caixaUrl = Instance.new("TextBox")
caixaUrl.Size = UDim2.new(1, 0, 0, 28)
caixaUrl.BackgroundColor3 = CAMPO
caixaUrl.BorderSizePixel = 0
caixaUrl.TextColor3 = TEXTO
caixaUrl.PlaceholderText = "https://seu-worker.workers.dev/mcp/sessao/token"
caixaUrl.Font = Enum.Font.Code
caixaUrl.TextSize = 13
caixaUrl.ClearTextOnFocus = false
caixaUrl.TextXAlignment = Enum.TextXAlignment.Left
caixaUrl.TextTruncate = Enum.TextTruncate.AtEnd
caixaUrl.Text = ""
caixaUrl.LayoutOrder = 2
caixaUrl.Parent = raiz

local padUrl = Instance.new("UIPadding")
padUrl.PaddingLeft = UDim.new(0, 6)
padUrl.PaddingRight = UDim.new(0, 6)
padUrl.Parent = caixaUrl

local linhaBotoes = Instance.new("Frame")
linhaBotoes.Size = UDim2.new(1, 0, 0, 30)
linhaBotoes.BackgroundTransparency = 1
linhaBotoes.LayoutOrder = 3
linhaBotoes.Parent = raiz

local linha = Instance.new("UIListLayout")
linha.FillDirection = Enum.FillDirection.Horizontal
linha.Padding = UDim.new(0, 6)
linha.VerticalAlignment = Enum.VerticalAlignment.Center
linha.Parent = linhaBotoes

local function botao(texto, largura, ordem)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(0, largura, 1, 0)
	b.BackgroundColor3 = Color3.fromRGB(0, 122, 204)
	b.BorderSizePixel = 0
	b.TextColor3 = Color3.new(1, 1, 1)
	b.Font = Enum.Font.SourceSansSemibold
	b.TextSize = 14
	b.Text = texto
	b.AutoButtonColor = true
	b.LayoutOrder = ordem
	b.Parent = linhaBotoes
	local canto = Instance.new("UICorner")
	canto.CornerRadius = UDim.new(0, 4)
	canto.Parent = b
	return b
end

local botaoConectar = botao("Conectar", 110, 1)
local botaoTeste = botao("Testar", 80, 2)
botaoTeste.BackgroundColor3 = Color3.fromRGB(70, 70, 70)

local pontoLinha = Instance.new("Frame")
pontoLinha.Size = UDim2.new(1, 0, 0, 18)
pontoLinha.BackgroundTransparency = 1
pontoLinha.LayoutOrder = 4
pontoLinha.Parent = raiz

local ponto = Instance.new("Frame")
ponto.Size = UDim2.fromOffset(10, 10)
ponto.Position = UDim2.fromOffset(0, 4)
ponto.BackgroundColor3 = Color3.fromRGB(150, 150, 150)
ponto.BorderSizePixel = 0
ponto.Parent = pontoLinha

local cantoPonto = Instance.new("UICorner")
cantoPonto.CornerRadius = UDim.new(1, 0)
cantoPonto.Parent = ponto

local labelStatus = Instance.new("TextLabel")
labelStatus.BackgroundTransparency = 1
labelStatus.Position = UDim2.fromOffset(18, 0)
labelStatus.Size = UDim2.new(1, -18, 1, 0)
labelStatus.Font = Enum.Font.SourceSansSemibold
labelStatus.TextSize = 14
labelStatus.TextXAlignment = Enum.TextXAlignment.Left
labelStatus.TextColor3 = TEXTO
labelStatus.Text = "desconectado"
labelStatus.Parent = pontoLinha

local detalhe = rotulo("", 5, FRACO, 60)
local rodape = rotulo("", 6, FRACO, 34)

atualizarUi = function()
	if conectado then
		ponto.BackgroundColor3 = ultimoErro ~= "" and Color3.fromRGB(230, 160, 40) or Color3.fromRGB(60, 200, 90)
		labelStatus.Text = ultimoErro ~= "" and "atencao" or "conectado"
		botaoConectar.Text = "Desconectar"
		botaoConectar.BackgroundColor3 = Color3.fromRGB(120, 60, 60)
	else
		ponto.BackgroundColor3 = Color3.fromRGB(150, 150, 150)
		labelStatus.Text = "desconectado"
		botaoConectar.Text = "Conectar"
		botaoConectar.BackgroundColor3 = Color3.fromRGB(0, 122, 204)
	end
	local alias, studios = "", 0
	pcall(function()
		alias = conectado and tostring(script:GetAttribute("MCPAlias") or "") or ""
		studios = conectado and (tonumber(script:GetAttribute("MCPStudios")) or 0) or 0
	end)
	local linhas = {
		"place: " .. game.Name .. (alias ~= "" and ("   alias " .. alias) or "") .. (studios > 1 and ("  (" .. studios .. " Studios nesta sessao)") or "") .. "   plugin " .. VERSAO .. "   sessao " .. peer,
		"chamadas: " .. contaOk .. " ok / " .. contaErro .. " com erro" .. (ultimaFerramenta ~= "" and ("   ultima: " .. ultimaFerramenta) or ""),
		"em execucao: " .. emExecucao .. "/" .. MAX_PARALELO .. "   fila: " .. #filaLocal .. (#limpezasPendentes > 0 and ("   limpezas pendentes: " .. #limpezasPendentes) or ""),
	}
	detalhe.Text = table.concat(linhas, "\n")
		local st = estadoTeste()
		local sessao = (st and st.active) and ("   teste: " .. tostring(st.mode) .. " ativo") or ""
		rodape.Text = ultimoErro ~= "" and ("aviso: " .. ultimoErro) or ("" .. #NOMES .. " ferramentas | logs unificados | play test" .. sessao)
end

botaoConectar.MouseButton1Click:Connect(function()
	if conectado then
		desconectar()
	else
		conectar(caixaUrl.Text)
	end
end)

botaoTeste.MouseButton1Click:Connect(function()
	local u = normalizar(caixaUrl.Text)
	if not string.find(u, "/ponte/", 1, true) then
		ultimoErro = "cole a URL completa antes de testar"
		atualizarUi()
		return
	end
	task.spawn(function()
		if conectado and u ~= urlBase then ultimoErro="Desconecte antes de testar outra URL";atualizarUi();return end
		local dados, erro = pedir("estado", nil,u,chave)
		if erro ~= nil then
			ultimoErro = erro
		else
			ultimoErro = ""
			local faltando = (dados.ferramentasFaltando ~= nil and #dados.ferramentasFaltando or 0)
			print("[MCP Studio] " .. tostring(dados.servidor) .. " respondeu; Studio online: " .. tostring(dados.studioOnline))
		end

		atualizarUi()
	end)
end)

caixaUrl.FocusLost:Connect(function(enter)
	plugin:SetSetting("mcpUrl", caixaUrl.Text)
	if enter and not conectado then
		conectar(caixaUrl.Text)
	end
end)

botaoBarra.Click:Connect(function()
	janela.Enabled = not janela.Enabled
end)

janela:GetPropertyChangedSignal("Enabled"):Connect(function()
	botaoBarra:SetActive(janela.Enabled)
end)

plugin.Unloading:Connect(function()
 conectado=false;geracao=geracao+1
 cancelarTudo();pararRelay()
 filaLocal={};bufferRespostas={}
end)

local salvaUrl = plugin:GetSetting("mcpUrl")
if type(salvaUrl) == "string" then
	caixaUrl.Text = salvaUrl
end
local salvaChave = plugin:GetSetting("mcpChave")
if chave == "" and type(salvaChave) == "string" then
	chave = salvaChave
end

atualizarUi()

if plugin:GetSetting("mcpAuto") == true and type(salvaUrl) == "string" and salvaUrl ~= "" then
	task.defer(function()
		conectar(salvaUrl)
	end)
end
