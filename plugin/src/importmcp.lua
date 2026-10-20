do
local RunService = game:GetService("RunService")
local ServerStorage = game:GetService("ServerStorage")

local function erroImport(code, message, nothingExecuted)
	error({ code = code, message = message, nothingExecuted = nothingExecuted ~= false }, 0)
end

local function localizarApi()
	local home = ServerStorage:FindFirstChild("ImportMCP")
	local mod = home and home:FindFirstChild("MCP")
	if not (mod and mod:IsA("ModuleScript")) then
		local main = home and home:FindFirstChild("Main")
		local modules = main and main:FindFirstChild("Modules")
		mod = modules and modules:FindFirstChild("Api")
	end
	if not (mod and mod:IsA("ModuleScript")) then
		erroImport("IMPORTMCP_MISSING", "ImportMCP nao esta neste place: falta ServerStorage.ImportMCP.MCP (ModuleScript). Insira a pasta ImportMCP no ServerStorage (ou peca ao usuario) e repita a chamada.")
	end
	return mod
end

local function importApi()
	local mod = localizarApi()
	local ok, api = pcall(require, mod)
	if not ok or type(api) ~= "table" or type(api.execute) ~= "function" or type(api.status) ~= "function" then
		erroImport("IMPORTMCP_INCOMPATIBLE", "ServerStorage.ImportMCP.MCP nao devolveu a Api 1.1+ (execute/status/upload). Atualize o ImportMCP. Detalhe: " .. tostring(ok and "modulo sem execute()" or api))
	end
	return api
end

local function exigirEditMode()
	if RunService:IsRunning() then
		erroImport("STUDIO_PLAYING", "Pare o play test (studio_play action=stop) antes de importar ou restaurar assets.")
	end
end

local function desempacotar(result, code)
	if type(result) == "table" and result.ok == false then
		erroImport(code or "IMPORTMCP_ERROR", tostring(result.error or result.message or "falha no ImportMCP"), false)
	end
	return result
end

local function contarFontes(a)
	local n = 0
	for _, chave in ipairs({ "url", "data", "upload", "text" }) do
		if a[chave] ~= nil and a[chave] ~= "" then n = n + 1 end
	end
	return n
end

local function montarRequisicao(a)
	local target = {
		parent = a.target == nil and a.parent or nil,
		applyTo = a.target,
		class = a.target == nil and a.as or nil,
		property = a.property,
		maxSize = a.maxSize,
		properties = a.properties,
	}
	if a.rotation ~= nil then
		target.cframe = { position = a.position or { 0, 0, 0 }, orientation = a.rotation }
	else
		target.position = a.position
	end
	local options = {
		scale = a.scale,
		center = a.center,
		ground = a.ground,
		collision = a.collision,
		doubleSided = a.doubleSided,
		anchored = a.anchored,
		canCollide = a.canCollide,
	}
	return {
		name = a.name,
		fileName = a.fileName,
		kind = a.kind ~= "auto" and a.kind or nil,
		url = a.url,
		data = a.data,
		upload = a.upload,
		text = a.text,
		target = target,
		options = options,
		externals = a.externals,
		persist = a.persist,
	}
end

acoes.import_asset = function(a)
	exigirEditMode()
	local Api = importApi()
	if contarFontes(a) ~= 1 then
		erroImport("SOURCE_REQUIRED", "Informe exatamente UMA fonte: url=https://..., data=<base64>, upload=<id de import_upload> ou text=<JSON .gltf>.")
	end
	if a.target ~= nil and a.target:IsA("LuaSourceContainer") then
		erroImport("NOT_IMAGE_TARGET", "target deve ser uma instancia que aceite imagem (ImageLabel, Decal, MeshPart...), nao um script.")
	end
	local ctx = contextoAtual
	local function check()
		if ctx and ctx.deadline and os.clock() >= ctx.deadline then
			error({ code = "EXECUTION_TIMEOUT", message = "Prazo esgotado durante a importacao; arquivo grande demais para uma chamada. Reduza o arquivo ou use maxSize/scale menores." }, 0)
		end
		if ctx and ctx.cancelled then
			error({ code = "CANCELLED", message = "Importacao cancelada." }, 0)
		end
	end
	local request = montarRequisicao(a)
	local rotulo = tostring(a.name or a.fileName or a.upload or (a.url and a.url:gsub("[?#].*$", ""):match("([^/]+)$")) or "asset")
	local instance, report
	comHistorico("MCP importar " .. rotulo, function()
		instance, report = Api.execute(request, { source = "mcp", check = check })
	end)
	report = type(report) == "table" and report or {}
	report.ok = true
	report.instance = resumo(instance)
	report.id = report.instance.id
	report.path = report.instance.path
	report.className = report.instance.className
	if a.select ~= false then
		pcall(function() Selection:Set({ instance }) end)
	end
	return report
end

acoes.import_upload = function(a)
	local Api = importApi()
	local action = a.action or "append"
	if action == "begin" then
		return desempacotar(Api.upload.begin(a.id, { name = a.name, expectedBytes = a.expectedBytes }))
	end
	if action == "list" then
		return { uploads = Api.upload.list(a.state) }
	end
	if action == "clear" then
		return desempacotar(Api.upload.clear(a.keepUnfinished ~= false))
	end
	if a.id == nil or a.id == "" then
		erroImport("ID_REQUIRED", "Informe id (devolvido por action=begin).")
	end
	if action == "append" then
		if type(a.chunk) ~= "string" or #a.chunk == 0 then
			erroImport("CHUNK_REQUIRED", "Informe chunk (pedaco base64) em action=append.")
		end
		return desempacotar(Api.upload.append(a.id, a.chunk))
	end
	if action == "finish" then
		return desempacotar(Api.upload.finish(a.id))
	end
	if action == "cancel" then
		return desempacotar(Api.upload.cancel(a.id))
	end
	erroImport("INVALID_ACTION", "action deve ser begin, append, finish, cancel, list ou clear.")
end

acoes.import_status = function(a)
	local Api = importApi()
	if a.id ~= nil and a.id ~= "" then
		return desempacotar(Api.result(a.id), "JOB_NOT_FOUND")
	end
	local status = desempacotar(Api.status())
	status.api = Api.VERSION
	if a.list == true then
		status.assets = Api.list()
	end
	return status
end

acoes.import_manage = function(a)
	local Api = importApi()
	local action = a.action
	if action == "install" then
		return desempacotar(Api.install(a.force == true))
	end
	exigirEditMode()
	if action == "restoreAll" then
		return comHistorico("MCP ImportMCP restaurar tudo", function() return desempacotar(Api.restoreAll()) end)
	end
	if a.target == nil then
		erroImport("TARGET_REQUIRED", "Informe target para " .. tostring(action) .. ".")
	end
	if action == "restore" then
		return comHistorico("MCP ImportMCP restaurar " .. a.target.Name, function() return desempacotar(Api.restore(a.target)) end)
	end
	if action == "remove" then
		return comHistorico("MCP ImportMCP remover " .. a.target.Name, function() return desempacotar(Api.remove(a.target, a.keepInstance == true)) end)
	end
	erroImport("INVALID_ACTION", "action deve ser restore, restoreAll, remove ou install.")
end
end
