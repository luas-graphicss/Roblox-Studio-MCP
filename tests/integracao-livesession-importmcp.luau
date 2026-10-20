local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")
local process = require("@lune/process")
local taskLib = require("@lune/task")

local Instance = roblox.Instance

local function loadRoot(path)
	local model = roblox.deserializeModel(fs.readFile(path))
	return model[1]
end

local live = loadRoot(process.args[1])
local imp = loadRoot(process.args[2])
local game = Instance.new("DataModel")

local function child(root, dotted)
	local current = root
	for name in string.gmatch(dotted, "[^%.]+") do
		current = current:FindFirstChild(name)
		assert(current, "nao achei " .. dotted)
	end
	return current
end

local cache = {}
local globalsExtra = {}
local requireModule
local function makeEnv(scriptInstance)
	local env = {
		script = scriptInstance,
		game = game,
		workspace = game:GetService("Workspace"),
		task = taskLib,
		require = function(target)
			return requireModule(target)
		end,
		Instance = Instance,
		Enum = roblox.Enum,
		Color3 = roblox.Color3,
		Vector3 = roblox.Vector3,
		Vector2 = roblox.Vector2,
		UDim = roblox.UDim,
		UDim2 = roblox.UDim2,
		CFrame = roblox.CFrame,
		BrickColor = roblox.BrickColor,
		NumberRange = roblox.NumberRange,
		NumberSequence = roblox.NumberSequence,
		NumberSequenceKeypoint = roblox.NumberSequenceKeypoint,
		ColorSequence = roblox.ColorSequence,
		ColorSequenceKeypoint = roblox.ColorSequenceKeypoint,
		Rect = roblox.Rect,
		Font = roblox.Font,
		PhysicalProperties = roblox.PhysicalProperties,
		Faces = roblox.Faces,
		Axes = roblox.Axes,
		Vector3int16 = roblox.Vector3int16,
		Vector2int16 = roblox.Vector2int16,
		TweenInfo = roblox.TweenInfo,
		typeof = typeof,
	}
	for key, value in globalsExtra do
		env[key] = value
	end
	return setmetatable(env, { __index = _G })
end
requireModule = function(target)
	if cache[target] ~= nil then
		return cache[target]
	end
	local fn = luau.load(target.Source, { debugName = target:GetFullName(), environment = makeEnv(target) })
	local result = fn()
	cache[target] = result
	return result
end

local passed = 0
local function test(name, fn)
	local ok, err = pcall(fn)
	if not ok then
		error(name .. ": " .. tostring(err), 0)
	end
	passed += 1
	print("  OK " .. name)
end

local Constants = requireModule(child(live, "Core.Constants"))
local ValueCodec = requireModule(child(live, "Journal.ValueCodec"))
local Journal = requireModule(child(live, "Journal.Journal"))
local Replay = requireModule(child(live, "Journal.Replay"))

test("Constants: ponte MCP, origem mcp e textos", function()
	assert(Constants.MCP_BRIDGE.FOLDER_NAME == "LiveSessionBridge")
	assert(Constants.ORIGINS.MCP == "mcp")
	assert(Constants.TEXTS.NOT_RUNNING == Constants.ERRORS.NOT_RUNNING)
	assert(Constants.GUI_SYNC.IGNORED_PROPERTIES.AbsoluteSize)
end)

test("ValueCodec: ida e volta dos tipos de VFX/UI", function()
	local samples = {
		roblox.ColorSequence.new({ roblox.ColorSequenceKeypoint.new(0, roblox.Color3.new(1, 0, 0)), roblox.ColorSequenceKeypoint.new(1, roblox.Color3.new(0, 0, 1)) }),
		roblox.NumberSequence.new({ roblox.NumberSequenceKeypoint.new(0, 1, 0.5), roblox.NumberSequenceKeypoint.new(1, 0, 0) }),
		roblox.Font.new("rbxasset://fonts/families/GothamSSm.json", roblox.Enum.FontWeight.Bold, roblox.Enum.FontStyle.Italic),
		roblox.PhysicalProperties.new(1, 0.3, 0.5, 1, 1),
		roblox.Vector3int16.new(1, 2, 3),
		roblox.Color3.new(0.1, 0.2, 0.3),
		roblox.UDim2.new(0.5, 10, 0, 40),
	}
	for _, value in samples do
		local encoded, err = ValueCodec.encode(value, function()
			return nil
		end)
		assert(encoded, "encode falhou para " .. typeof(value) .. ": " .. tostring(err))
		local decoded, decodeErr = ValueCodec.decode(encoded, function()
			return nil
		end)
		assert(decodeErr == nil, tostring(decodeErr))
		assert(typeof(decoded) == typeof(value), "tipo divergente " .. typeof(decoded))
		if typeof(value) ~= "Font" then
			assert(decoded == value, "valor divergente para " .. typeof(value) .. ": " .. tostring(decoded) .. " vs " .. tostring(value))
		else
			assert(decoded.Family == value.Family and decoded.Weight == value.Weight and decoded.Style == value.Style)
		end
	end
	local _, err = ValueCodec.encode(function() end, function() end)
	assert(err, "tipo desconhecido deve falhar")
end)

test("Replay: entradas de atributo usam SetAttribute; propriedade continua igual", function()
	local part = Instance.new("Part")
	part.Name = "Alvo"
	local journal = Journal.new({ sessionId = "s", placeId = 1, startedAt = 0 })
	journal:append(Constants.ENTRY_KINDS.PROPERTY, { id = "ls:00001", path = "Workspace.Alvo", property = "Transparency", value = { t = "number", v = 0.25 }, origin = "mcp" })
	journal:append(Constants.ENTRY_KINDS.PROPERTY, { id = "ls:00001", path = "Workspace.Alvo", property = "Transparency", attribute = true, value = { t = "number", v = 7 }, origin = "mcp" })
	journal:append(Constants.ENTRY_KINDS.PROPERTY, { id = "ls:00001", path = "Workspace.Alvo", property = "Vida", attribute = true, value = { t = "number", v = 100 }, origin = "mcp" })
	local index = {
		resolve = function()
			return part
		end,
	}
	local report = Replay.apply(journal, index, nil)
	assert(math.abs(part.Transparency - 0.25) < 1e-6, "propriedade nao aplicada")
	assert(part:GetAttribute("Transparency") == 7, "atributo com mesmo nome da propriedade nao pode colidir")
	assert(part:GetAttribute("Vida") == 100, "atributo nao aplicado")
	assert(report.applied == 3 and #report.failed == 0, "relatorio " .. report.applied .. "/" .. #report.failed)
end)

cache[child(live, "Authoring.SourceWatcher")] = {
	readSource = function(instance)
		return instance.Source
	end,
}
local McpFacade = requireModule(child(live, "Integration.McpFacade"))
local Hash = requireModule(child(live, "Core.Hash"))

local function fakeSession()
	local session = {
		state = Constants.STATES.RUNNING,
		engine = "hosted",
		sessionId = "ls-test",
		startedAt = os.time() - 5,
		transitioning = false,
		journalChars = 10,
		mcpReloads = { { seq = 1, label = "Main", paths = { "ServerScriptService.Main" }, count = 1, affected = 1, swapped = 1, elapsedMs = 1.5, released = { connections = 0, threads = 0, instances = 0 } } },
		mcpApplied = {},
		loadIssues = {},
		cloneOrigins = {},
		cloneEdits = {},
		runtimeEdits = {},
		runtimeScripts = {},
		ambiguous = {},
		observedCount = 3,
		ids = {},
		emitted = {},
	}
	session.journal = Journal.new({ sessionId = "ls-test", placeId = 1, startedAt = 0 })
	session.stableId = {
		idOf = function(_, instance)
			return session.ids[instance]
		end,
	}
	session.hotReload = { pending = {}, lastSource = {}, broken = {}, count = 1, active = true, debounceSeconds = 0.25 }
	function session.hotReload:brokenScripts()
		local list = {}
		for instance, entry in self.broken do
			table.insert(list, { instance = instance, compileError = entry.compileError })
		end
		return list
	end
	session.host = {
		context = "server",
		running = {},
		runnersOf = function(_, instance)
			return { instance }
		end,
		shouldRun = function(_, instance)
			return instance.ClassName == "Script"
		end,
		isRunning = function(self, instance)
			return self.running[instance] == true
		end,
		runningCount = function(self)
			local n = 0
			for _ in self.running do
				n += 1
			end
			return n
		end,
	}
	session.clientHost = {
		context = "client",
		runnersOf = function()
			return {}
		end,
		shouldRun = function()
			return false
		end,
		isRunning = function()
			return false
		end,
		runningCount = function()
			return 0
		end,
	}
	session.hosts = { session.host, session.clientHost }
	session.channel = {
		isHostedInstance = function()
			return false
		end,
	}
	local outputEntries = {}
	session.deps = {
		output = {
			nextSeq = 3,
			count = function()
				return 0
			end,
			size = function()
				return #outputEntries
			end,
			all = function()
				return outputEntries
			end,
		},
	}
	outputEntries[1] = { seq = 1, kind = "info", time = "00:00:01", text = "UI · StarterGui.HUD atualizada" }
	outputEntries[2] = { seq = 2, kind = "error", time = "00:00:02", text = "Nao carregou · Workspace.X" }
	function session:isCompatibility()
		return self.engine == "compatibility"
	end
	function session:isTeamCreate()
		return false
	end
	function session:physicsText()
		return "60 Hz"
	end
	function session:isObserved()
		return true
	end
	function session:idFor(instance)
		if not self.ids[instance] then
			self.ids[instance] = "ls:" .. tostring(#self.journal.entries + 100)
		end
		return self.ids[instance]
	end
	function session:recordAuthoring(kind, entry)
		self.journal:append(kind, entry)
	end
	function session:emitMcp(kind, data)
		table.insert(self.emitted, { kind = kind, data = data })
	end
	return session
end

test("McpFacade.verifyOne: script editado e aplicado persiste; edicao pendente nao", function()
	local session = fakeSession()
	local scriptInstance = Instance.new("Script")
	scriptInstance.Name = "Main"
	scriptInstance.Source = "print(2)"
	scriptInstance.Parent = game:GetService("ServerScriptService")
	session.ids[scriptInstance] = "ls:00007"
	session.hotReload.lastSource[scriptInstance] = "print(2)"
	session.host.running[scriptInstance] = true
	session.journal:append(Constants.ENTRY_KINDS.SOURCE, { id = "ls:00007", path = "ServerScriptService.Main", afterHash = Hash.text("print(2)"), source = "print(2)", origin = "recording" })
	session.mcpApplied[scriptInstance] = os.clock()
	local result = McpFacade.verifyOne(session, scriptInstance)
	assert(result.exists and result.synced and result.journaled, "estado do script")
	assert(result.live == true, "deveria estar live: " .. tostring(result.liveReason))
	assert(result.persist == true and result.reason == Constants.TEXTS.MCP_REASON_JOURNALED, tostring(result.reason))
	assert(result.running.server == 1)
	scriptInstance.Source = "print(3)"
	local pending = McpFacade.verifyOne(session, scriptInstance)
	assert(pending.synced == false and pending.live == false and pending.persist == false, "pendente")
	session.hotReload.broken[scriptInstance] = { compileError = "Expected end" }
	local broken = McpFacade.verifyOne(session, scriptInstance)
	assert(broken.compileError == "Expected end" and broken.live == false)
end)

test("McpFacade.verifyOne: clone de StarterGui e instancia pre-existente", function()
	local session = fakeSession()
	local original = Instance.new("LocalScript")
	original.Name = "Hud"
	original.Parent = game:GetService("StarterGui")
	local clone = original:Clone()
	clone.Parent = game:GetService("CoreGui")
	session.cloneOrigins[clone] = original
	local cloneResult = McpFacade.verifyOne(session, clone)
	assert(cloneResult.persist == false and string.find(cloneResult.reason, "edite o original", 1, true), tostring(cloneResult.reason))
	local part = Instance.new("Part")
	part.Parent = game:GetService("Workspace")
	local partResult = McpFacade.verifyOne(session, part)
	assert(partResult.persist == true and partResult.reason == Constants.TEXTS.MCP_REASON_PREEXISTING)
	session.ids[part] = "ls:00042"
	session.journal:append(Constants.ENTRY_KINDS.CREATE, { id = "ls:00042", path = "Workspace.Part", className = "Part", name = "Part", origin = "recording" })
	assert(McpFacade.verifyOne(session, part).reason == Constants.TEXTS.MCP_REASON_CREATED)
	session.state = Constants.STATES.IDLE
	assert(McpFacade.verifyOne(session, part).reason == Constants.TEXTS.NOT_RUNNING)
end)

test("McpFacade.record: grava propriedades e atributos com origem mcp; journal filtra e pagina", function()
	local session = fakeSession()
	local part = Instance.new("Part")
	part.Parent = game:GetService("Workspace")
	part.Transparency = 0.5
	part:SetAttribute("Vida", 10)
	local summary = McpFacade.record(session, { items = { { target = part, properties = { "Transparency", "Color", "Source", "Parent" }, attributes = { "Vida", Constants.STABLE_ID_ATTRIBUTE } } } })
	assert(summary.recorded == 3, "esperava 3 (Transparency, Color, @Vida), veio " .. summary.recorded)
	assert(#summary.failed == 0)
	local entries = session.journal:entriesOfKind(Constants.ENTRY_KINDS.PROPERTY)
	assert(#entries == 3 and entries[1].origin == "mcp" and entries[3].attribute == true and entries[3].property == "Vida")
	assert(session.emitted[1].kind == Constants.MCP_BRIDGE.EVENTS.RECORD)
	local page = McpFacade.journal(session, { origin = "mcp", limit = 2 })
	assert(#page.entries == 2 and page.matched == 3 and page.entries[2].seq == 3, "ultimas 2")
	local after = McpFacade.journal(session, { since = 1, limit = 10, kind = "property" })
	assert(#after.entries == 2 and after.nextSince == 3)
	local out = McpFacade.output(session, { level = "error" })
	assert(#out.entries == 1 and out.entries[1].seq == 2)
	session.state = Constants.STATES.IDLE
	assert(McpFacade.record(session, { items = {} }).ok == false)
end)

test("McpFacade.status: resumo completo com sessao rodando", function()
	local session = fakeSession()
	local status = McpFacade.status(session, {})
	assert(status.running and status.live and status.sessionId == "ls-test")
	assert(status.hotReload.reloads == 1 and status.hotReload.last.label == "Main")
	assert(status.journal.entries == 0 and status.output.size == 2)
	session.state = Constants.STATES.IDLE
	local idle = McpFacade.status(session, {})
	assert(idle.live == false and idle.sessionId == nil and idle.hotReload == nil)
end)

local StarterGuiSync = requireModule(child(live, "Client.StarterGuiSync"))
test("StarterGuiSync: propriedade espelhada no clone sem remontar; estrutura nova remonta e lanca scripts", function()
	local starterGui = game:GetService("StarterGui")
	local hud = Instance.new("ScreenGui")
	hud.Name = "HUD"
	local frame = Instance.new("Frame")
	frame.Name = "Painel"
	frame.Parent = hud
	local label = Instance.new("TextLabel")
	label.Name = "Titulo"
	label.Text = "Antes"
	label.Parent = frame
	hud.Parent = starterGui
	local playerGui = Instance.new("Folder")
	playerGui.Name = "PlayerGui"
	local clone = hud:Clone()
	clone.Parent = playerGui
	local hosted = {}
	local tracker = {
		isHostedInstance = function(_, instance)
			return hosted[instance] == true
		end,
		addInstance = function() end,
	}

	local extra = Instance.new("Frame")
	extra.Name = "CriadoPeloJogo"
	extra.Parent = clone
	hosted[extra] = true
	local mount = { playerGui = playerGui, owner = { name = "VirtualPlayer" }, mounted = { { clone = clone, original = hud } } }
	local synced, launched = {}, {}
	local sync = StarterGuiSync.new({
		tracker = tracker,
		guiMount = mount,
		hosts = {},
		isRuntime = function()
			return false
		end,
		onScripts = function(pairs_)
			for _, pair in pairs_ do
				table.insert(launched, pair)
			end
		end,
		onSynced = function(original, mode)
			table.insert(synced, { original = original, mode = mode })
		end,
		onRemoved = function() end,
		onError = function(message)
			error(message)
		end,
	})
	sync.active = true
	sync.topOf[label] = hud
	label.Text = "Depois"
	sync:onProperty(label, "Text")
	sync:onProperty(label, "AbsoluteSize")
	sync:flush()
	assert(clone.Painel.Titulo.Text == "Depois", "texto nao espelhado: " .. clone.Painel.Titulo.Text)
	assert(mount.mounted[1].clone == clone, "espelho nao deveria remontar")
	assert(synced[1].mode == Constants.TEXTS.GUI_SYNC_MODE_MIRROR)
	label:SetAttribute("Cor", "azul")
	sync:onAttribute(label, "Cor")
	sync:onAttribute(label, Constants.STABLE_ID_ATTRIBUTE)
	sync:flush()
	assert(clone.Painel.Titulo:GetAttribute("Cor") == "azul", "atributo nao espelhado")
	local scriptInstance = Instance.new("LocalScript")
	scriptInstance.Name = "Controle"
	scriptInstance.Parent = hud
	sync.topOf[scriptInstance] = hud
	sync:job(hud).remount = true
	sync:flush()
	local newClone = mount.mounted[1].clone
	assert(newClone ~= clone and newClone.Parent == playerGui and clone.Parent == nil, "remontagem")
	assert(newClone:FindFirstChild("Controle") and newClone.Painel.Titulo.Text == "Depois")
	assert(#launched == 1 and launched[1].original == scriptInstance, "script do clone novo deve ser lancado")
	assert(synced[#synced].mode == Constants.TEXTS.GUI_SYNC_MODE_REMOUNT)
	hud.Parent = nil
	sync:job(hud).remount = true
	sync:flush()
	assert(#mount.mounted == 0 and newClone.Parent == nil, "remocao do topo")
end)

local liveSessionStub = {}
test("ImportMCP LiveToken + Loader.materialized: fora do Studio nada; dentro da Sessao Viva pula o que ja esta materializado", function()
	local runtime = child(imp, "Main.Modules.Runtime")
	local LiveToken = requireModule(runtime.LiveToken)
	local Limits = requireModule(runtime.Limits)
	assert(Limits.VERSION == 4, "runtime deve ser v4")
	assert(LiveToken.hosted() == false, "sem global LiveSession")

	assert(LiveToken.current(true) == nil)

	cache = {}
	globalsExtra.LiveSession = liveSessionStub
	local HostedToken = requireModule(runtime.LiveToken)
	assert(HostedToken.hosted() == true and HostedToken.studio() == true)
	local coreGui = game:GetService("CoreGui")
	assert(HostedToken.folder(true) == nil, "script hospedado nunca cria a pasta do token")
	local marker = Instance.new("Folder")
	marker.Name = HostedToken.FOLDER
	marker:SetAttribute("Token", "tok-1")
	marker.Parent = coreGui
	assert(HostedToken.current(false) == "tok-1")
	local image = Instance.new("ImageLabel")
	image:SetAttribute("ImportMCP_Kind", "Image")
	image:SetAttribute("ImportMCP_Property", "Image")
	local package = Instance.new("Folder")
	package.Name = Limits.PACKAGE
	package.Parent = image
	assert(HostedToken.isLive(image) == false)
	HostedToken.stamp(image)
	assert(image:GetAttribute(HostedToken.ATTRIBUTE) == "tok-1" and HostedToken.isLive(image))
	local Loader = requireModule(runtime.Loader)

	assert(Loader.materialized(image) == false)
	globalsExtra.LiveSession = nil
	cache = {}
end)

print(string.format("INTEGRACAO: %d testes aprovados", passed))
