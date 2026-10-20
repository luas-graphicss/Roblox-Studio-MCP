return function(deps)
	local c = {
		locks = {}, active = {}, agents = {}, audit = {}, sequence = 0,
		versions = setmetatable({}, { __mode = "k" }),
		config = { readGraceSeconds = 8, manualSeconds = 120, maxManualSeconds = 900, maxLocks = 2000, maxAgents = 256 },
	}
	local now = deps.clock
	local function fail(code, message, extra)
		local e = extra or {}
		e.code, e.message, e.nothingExecuted = code, message, true
		error(e, 0)
	end
	local function nextId(prefix)
		c.sequence = c.sequence + 1
		return prefix .. tostring(c.sequence)
	end
	local function describe(l)
		return {
			lockId = l.id, agent = l.agent, target = deps.id(l.target), path = deps.path(l.target),
			kind = l.kind, recursive = l.recursive == true, mode = l.mode,
			expiresInMs = l.untilAt and math.max(0, math.ceil((l.untilAt - now()) * 1000)) or nil,
			tool = l.tool, note = l.note,
		}
	end
	local function overlaps(a, b)
		return a.target == b.target
			or (a.recursive == true and deps.descendant(b.target, a.target))
			or (b.recursive == true and deps.descendant(a.target, b.target))
	end
	function c:log(action, agent, details)
		table.insert(self.audit, { action = action, agent = agent, atMs = deps.wallMs(), details = details })
		while #self.audit > 100 do table.remove(self.audit, 1) end
	end
	function c:configure(config)
		if type(config) ~= "table" then return end
		local bounds = { readGraceSeconds = { 1, 300 }, manualSeconds = { 5, 900 }, maxManualSeconds = { 5, 900 } }
		for key, range in pairs(bounds) do
			local n = tonumber(config[key])
			if n and n == n then self.config[key] = math.max(range[1], math.min(range[2], n)) end
		end
		self.config.manualSeconds = math.min(self.config.manualSeconds, self.config.maxManualSeconds)
	end
	function c:gc()
		local t = now()
		for id, l in pairs(self.locks) do
			local dead = not deps.alive(l.target)
			local orphan = l.mode == "active" and self.active[l.context] == nil

			if dead or orphan or (l.mode ~= "active" and l.untilAt <= t) then
				self.locks[id] = nil
			end
		end
		for agent, entry in pairs(self.agents) do
			if t - entry.lastSeen > 3600 then
				local busy = false
				for _, l in pairs(self.locks) do if l.agent == agent then busy = true; break end end
				if not busy then self.agents[agent] = nil end
			end
		end
	end
	function c:touch(agent)
		if type(agent) ~= "string" or agent == "" then
			fail("AGENT_REQUIRED", "Identidade ausente. Use agent_open e passe o agent devolvido em todas as chamadas.")
		end
		self:gc()
		local a = self.agents[agent]
		if not a then
			local n = 0
			for _ in pairs(self.agents) do n = n + 1 end
			if n >= self.config.maxAgents then fail("AGENT_LIMIT", "Limite de agentes ativos. Encerre agentes com agent_close.") end
			a = { reads = setmetatable({}, { __mode = "k" }) }
			self.agents[agent] = a
		end
		a.lastSeen = now()
		return a
	end
	function c:normalize(plans)
		local out = {}
		for _, p in ipairs(plans or {}) do
			if p.target == nil or not deps.alive(p.target) then fail("TARGET_GONE", "Uma instancia do pedido nao existe mais. Leia a arvore novamente.") end
			if p.kind ~= "read" and p.kind ~= "write" then fail("BAD_LOCK_KIND", "kind deve ser read ou write.") end
			local found = nil
			for _, old in ipairs(out) do if old.target == p.target then found = old; break end end
			if found then
				if p.kind == "write" then found.kind = "write" end
				found.recursive = found.recursive or p.recursive == true
				found.keepRead = found.keepRead or p.keepRead == true
			else
				table.insert(out, { target = p.target, kind = p.kind, recursive = p.recursive == true, keepRead = p.keepRead == true })
			end
		end
		return out
	end
	function c:preflight(agent, plans)
		self:touch(agent)
		local conflicts, seen, retry = {}, {}, 0
		local count = 0
		for _, l in pairs(self.locks) do
			count = count + 1
			if l.agent ~= agent then
				for _, p in ipairs(plans) do
					if (p.kind == "write" or l.kind == "write") and overlaps(p, l) and not seen[l.id] then
						seen[l.id] = true
						local d = describe(l)
						table.insert(conflicts, d)
						retry = math.max(retry, d.expiresInMs or 1000)
					end
				end
			end
		end
		if #conflicts > 0 then
			self:log("conflict", agent, { count = #conflicts, first = conflicts[1] })
			fail("LOCK_CONFLICT", "Chamada recusada INTEIRA antes de executar: outro agente esta lendo ou escrevendo um alvo. Consulte file_locks e tente depois; nao contorne com outra ferramenta.", { conflicts = conflicts, retryAfterMs = math.max(100, retry) })
		end
		if count + #plans > self.config.maxLocks then fail("LOCK_LIMIT", "Limite de travas atingido. Libere reservas e tente novamente.") end
	end
	function c:begin(agent, plans, tool)
		local normalized = self:normalize(plans)
		self:preflight(agent, normalized)
		local ctx = { id = nextId("ctx_"), agent = agent, plans = normalized, tool = tool, cleanups = {}, recordings = {}, done = false }
		self.active[ctx.id] = ctx
		for _, p in ipairs(normalized) do
			local id = nextId("lock_")
			self.locks[id] = { id = id, agent = agent, target = p.target, kind = p.kind, recursive = p.recursive, mode = "active", context = ctx.id, tool = tool }
		end
		self:log("begin", agent, { tool = tool, targets = #normalized })
		return ctx
	end
	function c:finish(ctx, success)
		if ctx.done then return end
		ctx.done = true
		self.active[ctx.id] = nil
		for id, l in pairs(self.locks) do
			if l.context == ctx.id then self.locks[id] = nil end
		end
		if success then

			for _, p in ipairs(ctx.plans) do
				if p.kind == "write" then
					for id, l in pairs(self.locks) do
						if l.agent == ctx.agent and l.mode == "grace" and overlaps(l, p) then self.locks[id] = nil end
					end
				end
			end
			for _, p in ipairs(ctx.plans) do
				if p.kind == "read" and p.keepRead and deps.alive(p.target) then
					local existing = nil
					for _, l in pairs(self.locks) do
						if l.agent == ctx.agent and l.mode == "grace" and l.target == p.target then existing = l; break end
					end
					local id = existing and existing.id or nextId("lock_")
					self.locks[id] = { id = id, agent = ctx.agent, target = p.target, recursive = p.recursive, kind = "read", mode = "grace", untilAt = now() + self.config.readGraceSeconds, tool = ctx.tool }
				end
			end
		end
		self:gc()
		self:log("finish", ctx.agent, { tool = ctx.tool, success = success })
	end
	function c:reserve(agent, plans, seconds, note)
		local normalized = self:normalize(plans)
		if #normalized == 0 then fail("TARGET_REQUIRED", "Informe ao menos um alvo em targets.") end
		local ttl = tonumber(seconds) or self.config.manualSeconds
		if ttl ~= ttl or ttl < 5 or ttl > self.config.maxManualSeconds then
			fail("BAD_TTL", "seconds deve estar entre 5 e " .. self.config.maxManualSeconds .. ".")
		end

		self:preflight(agent, normalized)
		local result = {}
		for _, p in ipairs(normalized) do
			for id, l in pairs(self.locks) do
				if l.agent == agent and l.target == p.target and l.mode == "manual" then self.locks[id] = nil end
			end
			local id = nextId("lock_")
			local l = { id = id, agent = agent, target = p.target, recursive = p.recursive, kind = p.kind, mode = "manual", untilAt = now() + ttl, note = note }
			self.locks[id] = l
			table.insert(result, describe(l))
		end
		self:log("reserve", agent, { count = #result, seconds = ttl })
		return { agent = agent, locks = result, seconds = ttl }
	end
	function c:release(agent, targets, all)
		self:touch(agent)
		if not all and #targets == 0 then fail("TARGET_REQUIRED", "Informe targets ou all=true para liberar somente suas proprias travas.") end
		local count = 0
		for id, l in pairs(self.locks) do
			local matches = all
			for _, target in ipairs(targets) do if target == l.target then matches = true end end
			if matches and l.agent == agent and l.mode ~= "active" then
				self.locks[id] = nil
				count = count + 1
			end
		end

		self:log("release", agent, { count = count })
		return { agent = agent, released = count }
	end
	function c:close(agent)
		local result = self:release(agent, {}, true)
		local busy = false
		for _, ctx in pairs(self.active) do if ctx.agent == agent and ctx.tool ~= "agent_close" then busy = true end end
		if not busy then self.agents[agent] = nil end
		result.closed = not busy
		return result
	end
	function c:list(agent, mine, offset, limit)
		self:gc()
		local all = {}
		for _, l in pairs(self.locks) do
			if not mine or l.agent == agent then table.insert(all, describe(l)) end
		end
		table.sort(all, function(a, b) return a.lockId < b.lockId end)
		local start = math.max(0, math.floor(tonumber(offset) or 0))
		local n = math.max(1, math.min(500, math.floor(tonumber(limit) or 100)))
		local result = {}
		for i = start + 1, math.min(#all, start + n) do table.insert(result, all[i]) end
		local audit = {}
		for i = math.max(1, #self.audit - 19), #self.audit do table.insert(audit, self.audit[i]) end
		return { agent = agent, locks = result, total = #all, nextOffset = start + n < #all and (start + n) or nil, readGraceSeconds = self.config.readGraceSeconds, audit = audit }
	end
	function c:version(target, source)
		local v = self.versions[target]
		if not v or v.source ~= source then
			v = { source = source, revision = deps.epoch .. ":" .. nextId("rev_") }
			self.versions[target] = v
		end
		return v.revision
	end
	function c:read(agent, target, source)
		local a = self:touch(agent)
		local rev = self:version(target, source)
		a.reads[target] = rev
		return rev
	end
	function c:checkVersion(agent, target, source, expected, required)
		local a = self:touch(agent)
		local current = self:version(target, source)
		local previous = expected or a.reads[target]
		if required and not previous then
			fail("READ_REQUIRED", "Leia o script com get_script antes de alterar Source (ou informe expectedRevision da leitura atual).", { target = deps.id(target), path = deps.path(target), currentRevision = current })
		end
		if previous and previous ~= current then
			self:log("stale-write", agent, { target = deps.id(target) })
			fail("STALE_REVISION", "O script mudou depois da sua leitura. Leia novamente com get_script e refaca a edicao sobre a versao atual.", { target = deps.id(target), path = deps.path(target), expectedRevision = previous, currentRevision = current })
		end
		return current
	end
	function c:checkObserved(agent, readSource, root)
		local a = self:touch(agent)
		for target in pairs(a.reads) do
			if deps.alive(target) and (not root or target == root or deps.descendant(target, root)) then
				self:checkVersion(agent, target, readSource(target), nil, false)
			end
		end
	end

	function c:foreign(agent)
		self:gc()
		local out, seen = {}, {}
		for _, l in pairs(self.locks) do
			if l.agent ~= agent and deps.alive(l.target) then
				local entry = seen[l.target]
				if entry then
					entry.recursive = entry.recursive or l.recursive == true
				else
					entry = { target = l.target, recursive = l.recursive == true, agent = l.agent }
					seen[l.target] = entry
					table.insert(out, entry)
				end
			end
		end
		return out
	end
	function c:summary()
		self:gc()
		local locks, agents, active = 0, 0, 0
		for _ in pairs(self.locks) do locks = locks + 1 end
		for _ in pairs(self.agents) do agents = agents + 1 end
		for _ in pairs(self.active) do active = active + 1 end
		return { version = 1, enabled = true, locks = locks, agents = agents, active = active, readGraceSeconds = self.config.readGraceSeconds, runLuau = "free" }
	end
	return c
end
