do

local function servicoLive(nome)
	local ok, servico = pcall(function()
		return game:GetService(nome)
	end)
	if ok then
		return servico
	end
	return nil
end
local PONTE_LIVE = "LiveSessionBridge"
local VIVOS_LIVE = { Running = true, Starting = true, Stopping = true }
local ESPERA_LIVE = 2.5
local ESCRITAS_LIVE = {
	set_script = "script",
	create_script = "script",
	set_properties = "props",
	create_instance = "create",
	insert_asset = "create",
	import_asset = "create",
	duplicate_instance = "create",
	move_instance = "create",
	delete_instance = "delete",
	run_luau = "luau",
}
local CAMINHOS_LIVE = { path = true, original = true, cloneOf = true }

local function erroLive(code, message, nothingExecuted)
	error({ code = code, message = message, nothingExecuted = nothingExecuted ~= false }, 0)
end

local function ponteLive()
	local ok, pasta = pcall(function()
		return servicoLive("CoreGui"):FindFirstChild(PONTE_LIVE)
	end)
	if not ok or pasta == nil then
		return nil, nil
	end
	local invoke = pasta:FindFirstChild("Invoke")
	if invoke == nil or not invoke:IsA("BindableFunction") then
		return pasta, nil
	end
	return pasta, invoke
end

local function comGame(texto)
	if type(texto) ~= "string" or texto == "" or texto == "?" or texto == "game" or string.sub(texto, 1, 5) == "game." then
		return texto
	end
	return "game." .. texto
end

local function traduzirLive(valor, profundidade)
	if typeof(valor) == "Instance" then
		return caminhoDe(valor)
	end
	if type(valor) ~= "table" then
		return valor
	end
	profundidade = profundidade or 0
	if profundidade > 10 then
		return nil
	end
	local out = {}
	for chave, v in pairs(valor) do
		if typeof(v) == "Instance" then
			if chave == "instance" then
				out.id = idDe(v)
			elseif chave == "original" then
				out.originalId = idDe(v)
				out.original = caminhoDe(v)
			else
				out[chave] = caminhoDe(v)
			end
		elseif chave == "paths" and type(v) == "table" then
			local lista = {}
			for i, p in ipairs(v) do
				lista[i] = comGame(p)
			end
			out.paths = lista
		elseif CAMINHOS_LIVE[chave] and type(v) == "string" then
			if out[chave] == nil then
				out[chave] = comGame(v)
			end
		else
			out[chave] = traduzirLive(v, profundidade + 1)
		end
	end
	if typeof(valor.instance) == "Instance" then
		out.path = caminhoDe(valor.instance)
	end
	return out
end

local function chamarLive(comando, args, segundos, prazoAbsoluto)
	local pasta, invoke = ponteLive()
	if pasta == nil or invoke == nil then
		erroLive("LIVESESSION_MISSING", "A Sessao Viva (plugin LiveSession 1.1.0+, com a ponte MCP) nao esta carregada neste Studio. Instale o rbxm da Sessao Viva como plugin local e repita.")
	end
	local batida = pasta:GetAttribute("Heartbeat")
	if type(batida) == "number" and os.time() - batida > 20 then
		erroLive("LIVESESSION_STALE", "A ponte da Sessao Viva nao da sinal ha " .. tostring(os.time() - batida) .. "s (plugin descarregado ou travado). Recarregue o plugin LiveSession.")
	end
	local limite = segundos or 10
	if prazoAbsoluto then
		limite = math.min(limite, prazoAbsoluto - os.clock() - 0.5)
	end
	if limite <= 0 then
		erroLive("EXECUTION_TIMEOUT", "Sem prazo restante para consultar a Sessao Viva.")
	end
	local pronto, ok, resultado = false, false, nil
	local thread = task.spawn(function()
		ok, resultado = pcall(function()
			return invoke:Invoke(comando, args or {})
		end)
		pronto = true
	end)
	local fim = os.clock() + limite
	while not pronto and os.clock() < fim do
		task.wait(0.03)
	end
	if not pronto then
		pcall(task.cancel, thread)
		erroLive("LIVESESSION_TIMEOUT", "A Sessao Viva nao respondeu ao comando " .. comando .. " em " .. string.format("%.1f", limite) .. "s.", false)
	end
	if not ok then
		erroLive("LIVESESSION_ERROR", "A Sessao Viva recusou " .. comando .. ": " .. tostring(resultado), false)
	end
	if type(resultado) ~= "table" then
		resultado = { value = resultado }
	end
	return resultado, pasta
end

local function segundosDe(ms, padrao, teto)
	if ms == nil then
		return padrao
	end
	return math.min(math.max((tonumber(ms) or 0) / 1000, 0), teto)
end

local function filhoLive(servico, nome)
	local ok, achado = pcall(function()
		return servicoLive(servico):FindFirstChild(nome)
	end)
	if ok then
		return achado
	end
	return nil
end

local function resumoImportLive()
	local home = filhoLive("ServerStorage", "ImportMCP")
	local out = { installed = home ~= nil }
	local runtime = filhoLive("ReplicatedStorage", "ImportMCPRuntime")
	out.runtimeVersion = runtime and runtime:GetAttribute("Version") or nil
	local marca = filhoLive("CoreGui", "ImportMCPLive")
	local token = marca and marca:GetAttribute("Token") or nil
	out.liveToken = token ~= nil
	local sessao, vivos, permanentes, pendentes, faltando = 0, 0, 0, 0, {}
	local ok, lista = pcall(function()
		return CollectionService:GetTagged("ImportMCP")
	end)
	for _, inst in ipairs(ok and lista or {}) do
		if vivo(inst) then
			local modo = inst:GetAttribute("ImportMCP_Mode")
			local estado = inst:GetAttribute("ImportMCP_Status")
			if modo == "asset" then
				permanentes = permanentes + 1
			elseif estado == "PendingUpload" then
				pendentes = pendentes + 1
			else
				sessao = sessao + 1
				if token ~= nil and inst:GetAttribute("ImportMCP_LiveToken") == token then
					vivos = vivos + 1
				elseif #faltando < 15 then
					table.insert(faltando, caminhoDe(inst))
				end
			end
		end
	end
	out.permanent = permanentes
	out.sessionAssets = sessao
	out.materialized = vivos
	out.pendingMedia = pendentes
	out.notMaterialized = faltando
	return out
end

live.resumo = function()
	local pasta = ponteLive()
	if pasta == nil then
		return nil
	end
	return {
		state = pasta:GetAttribute("State"),
		sessionId = pasta:GetAttribute("SessionId"),
		engine = pasta:GetAttribute("Engine"),
		reloads = pasta:GetAttribute("Reloads"),
		version = pasta:GetAttribute("Version"),
	}
end

live.ativa = function()
	local pasta = ponteLive()
	return pasta ~= nil and VIVOS_LIVE[pasta:GetAttribute("State")] == true
end

local function testeNativo()
	local ok, t = pcall(estadoTeste)
	local ativo = ok and type(t) == "table" and t.active == true
	local okRun, rodando = pcall(function()
		return servicoLive("RunService"):IsRunning()
	end)
	return ativo or (okRun and rodando == true), ok and type(t) == "table" and t.mode or nil
end

acoes.livesession_status = function(a)
	local ctx = contextoAtual
	local pasta, invoke = ponteLive()
	local resultado
	if pasta == nil or invoke == nil then
		resultado = {
			installed = false,
			state = "Missing",
			hint = "Plugin LiveSession (Sessao Viva) nao esta carregado neste Studio, ou e uma versao sem a ponte MCP. Instale o rbxm da Sessao Viva 1.1.0+ como plugin local; o usuario inicia a sessao pelo botao Iniciar Sessao Viva (ou use livesession_control action=start).",
		}
	else
		resultado = traduzirLive((chamarLive("status", { detail = a.detail }, 10, ctx and ctx.deadline)))
		resultado.installed = true
		resultado.bridgeVersion = pasta:GetAttribute("Version")
	end
	local nativo, modo = testeNativo()
	resultado.nativePlayTest = { active = nativo, mode = modo }
	resultado.importmcp = resumoImportLive()
	return resultado
end

acoes.livesession_control = function(a)
	local ctx = contextoAtual
	local prazo = ctx and ctx.deadline
	local acao = tostring(a.action or "status")
	local espera = segundosDe(a.waitMs, 0, 20)
	local r
	if acao == "status" then
		return acoes.livesession_status(a)
	elseif acao == "start" then
		if testeNativo() then
			erroLive("STUDIO_PLAYING", "Ha um play test nativo rodando; pare-o (studio_play action=stop) antes de iniciar a Sessao Viva.")
		end
		r = chamarLive("start", { wait = espera }, espera + 5, prazo)
	elseif acao == "stop" then
		r = chamarLive("stop", { wait = espera }, espera + 5, prazo)
	elseif acao == "restart" then
		if type(a.targets) ~= "table" or #a.targets == 0 then
			erroLive("TARGET_REQUIRED", "Informe targets: os scripts a reiniciar no playtest da Sessao Viva.")
		end
		r = chamarLive("restart", { targets = a.targets }, 15, prazo)
	elseif acao == "record" then
		if type(a.targets) ~= "table" or #a.targets == 0 then
			erroLive("TARGET_REQUIRED", "Informe targets e properties/attributes a registrar no journal.")
		end
		local props = type(a.properties) == "table" and a.properties or {}
		local attrs = type(a.attributes) == "table" and a.attributes or {}
		if #props == 0 and #attrs == 0 then
			erroLive("PROPERTIES_REQUIRED", "Informe properties=[...] e/ou attributes=[...] (nomes) para registrar no journal.")
		end
		local itens = {}
		for _, alvo in ipairs(a.targets) do
			table.insert(itens, { target = alvo, properties = props, attributes = attrs })
		end
		r = chamarLive("record", { items = itens }, 10, prazo)
	elseif acao == "resyncGui" then
		r = chamarLive("resyncGui", {}, 10, prazo)
	else
		erroLive("INVALID_ACTION", "action deve ser status, start, stop, restart, record ou resyncGui.")
	end
	local saida = traduzirLive(r)
	saida.action = acao
	return saida
end

acoes.livesession_verify = function(a)
	local ctx = contextoAtual
	if type(a.targets) ~= "table" or #a.targets == 0 then
		erroLive("TARGET_REQUIRED", "Informe targets: scripts/instancias a conferir na Sessao Viva.")
	end
	local espera = segundosDe(a.waitMs, 3, 20)
	local r = traduzirLive((chamarLive(espera > 0 and "await" or "verify", { targets = a.targets, timeout = espera }, espera + 5, ctx and ctx.deadline)))
	local total, aplicados, persistem = 0, 0, 0
	for _, item in ipairs(type(r.results) == "table" and r.results or {}) do
		total = total + 1
		if item.live == nil then

			item.live = item.exists == true
		end
		if item.live == true then
			aplicados = aplicados + 1
		end
		if item.persist == true then
			persistem = persistem + 1
		end
	end
	r.summary = { total = total, live = aplicados, persist = persistem }
	return r
end

acoes.livesession_journal = function(a)
	local ctx = contextoAtual
	local fonte = tostring(a.log or "journal")
	if fonte == "output" then
		return traduzirLive((chamarLive("output", { since = a.since, limit = a.limit, level = a.level, contains = a.contains }, 10, ctx and ctx.deadline)))
	end
	return traduzirLive((chamarLive("journal", { since = a.since, limit = a.limit, kind = a.kind, origin = a.origin, contains = a.contains }, 10, ctx and ctx.deadline)))
end

local function idsCriadosLive(resultado)
	local ids = {}
	if type(resultado.id) == "string" then
		table.insert(ids, resultado.id)
	end
	for _, chave in ipairs({ "inserted", "created" }) do
		if type(resultado[chave]) == "table" then
			for _, item in ipairs(resultado[chave]) do
				if type(item) == "table" and type(item.id) == "string" then
					table.insert(ids, item.id)
				end
			end
		end
	end
	return ids
end

live.aposEscrita = function(ev, resultado)
	local tipo = ESCRITAS_LIVE[ev.tool]
	if tipo == nil or type(resultado) ~= "table" then
		return
	end
	local pasta, invoke = ponteLive()
	if pasta == nil or invoke == nil then
		return
	end
	local estado = pasta:GetAttribute("State")
	if not VIVOS_LIVE[estado] then
		return
	end
	local a = ev.args or {}
	local bloco = { state = estado, sessionId = pasta:GetAttribute("SessionId") }
	resultado.liveSession = bloco
	if tipo == "luau" then
		bloco.note = "run_luau roda no mesmo DataModel do playtest. Criacoes/remocoes feitas pelo codigo entram no journal (gravacao do historico); propriedades alteradas por codigo so persistem ao encerrar se voce registrar com livesession_control action=record (ou usar set_properties)."
		return
	end
	if tipo == "delete" then
		bloco.note = "Remocao feita dentro de uma gravacao do historico: a Sessao Viva registra como autoria e mantem ao encerrar."
		return
	end
	local restante = (ev.deadline or (os.clock() + 5)) - os.clock() - 1
	if restante <= 0.3 then
		bloco.skipped = "sem prazo para conferir o hot reload; use livesession_verify"
		return
	end
	local espera = math.min(segundosDe(a.liveWaitMs, ESPERA_LIVE, 20), math.max(0, restante - 0.5))
	local okRun, erro = pcall(function()
		local alvos = {}
		local function incluir(inst)
			if typeof(inst) ~= "Instance" then
				return
			end
			for _, existente in ipairs(alvos) do
				if existente == inst then
					return
				end
			end
			table.insert(alvos, inst)
		end
		if tipo == "script" or tipo == "props" then
			incluir(a.target)
		end
		for _, id in ipairs(idsCriadosLive(resultado)) do
			local okRes, inst = pcall(resolver, id, true)
			if okRes then
				incluir(inst)
			end
		end
		if tipo == "props" and typeof(a.target) == "Instance" then
			local props, attrs = {}, {}
			for nome in pairs(type(a.properties) == "table" and a.properties or {}) do
				if nome ~= "Source" then
					table.insert(props, tostring(nome))
				end
			end
			for nome in pairs(type(a.attributes) == "table" and a.attributes or {}) do
				table.insert(attrs, tostring(nome))
			end
			if #props > 0 or #attrs > 0 then
				local reg = chamarLive("record", { items = { { target = a.target, properties = props, attributes = attrs } } }, math.max(1, restante), ev.deadline)
				bloco.recorded = reg.recorded
				if type(reg.skipped) == "table" and #reg.skipped > 0 then
					bloco.recordSkipped = traduzirLive(reg.skipped)
				end
				if type(reg.failed) == "table" and #reg.failed > 0 then
					bloco.recordFailed = traduzirLive(reg.failed)
				end
			end
		end
		if #alvos == 0 then
			return
		end

		task.wait()
		local r = chamarLive("await", { targets = alvos, timeout = espera }, espera + 3, ev.deadline)
		local itens = {}
		local tudoVivo, tudoPersiste = true, true
		for _, item in ipairs(type(r.results) == "table" and r.results or {}) do
			local t = traduzirLive(item)
			local vivoItem = t.live
			if vivoItem == nil then
				vivoItem = t.exists ~= false
			end
			if not vivoItem then
				tudoVivo = false
			end
			if t.persist ~= true then
				tudoPersiste = false
			end
			table.insert(itens, {
				id = t.id,
				path = t.path,
				live = vivoItem,
				persist = t.persist,
				reason = t.reason,
				liveReason = t.liveReason,
				compileError = t.compileError,
				loadIssue = t.loadIssue,
				running = t.running,
				synced = t.synced,
			})
		end
		bloco.applied = tudoVivo
		bloco.persisted = tudoPersiste
		bloco.items = itens
		bloco.waitedMs = r.waitedMs
		bloco.reloads = r.reloads
		if type(r.lastReload) == "table" then
			bloco.lastReload = traduzirLive(r.lastReload)
		end
	end)
	if not okRun then
		bloco.error = type(erro) == "table" and tostring(erro.message or erro.code) or tostring(erro)
	end
end
end
