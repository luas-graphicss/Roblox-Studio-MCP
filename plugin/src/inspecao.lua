do

local AssetService = game:GetService("AssetService")

local function r2(n) n = tonumber(n) or 0; if n ~= n or n == math.huge or n == -math.huge then return 0 end; return math.floor(n * 100 + 0.5) / 100 end
local function r1(n) n = tonumber(n) or 0; return math.floor(n * 10 + 0.5) / 10 end
local function v3(v) return { r2(v.X), r2(v.Y), r2(v.Z) } end
local function angulos(cf) local rx, ry, rz = cf:ToOrientation(); return { r1(math.deg(rx)), r1(math.deg(ry)), r1(math.deg(rz)) } end
local function ehParte(inst) local ok, isa = pcall(function() return inst:IsA("BasePart") end); return ok and isa == true end
local function ehPV(inst) local ok, isa = pcall(function() return inst:IsA("PVInstance") end); return ok and isa == true end

local function aabbDe(cf, size)
	local hx, hy, hz = size.X / 2, size.Y / 2, size.Z / 2
	local xv, yv, zv = cf.XVector, cf.YVector, cf.ZVector
	local ex = math.abs(xv.X) * hx + math.abs(yv.X) * hy + math.abs(zv.X) * hz
	local ey = math.abs(xv.Y) * hx + math.abs(yv.Y) * hy + math.abs(zv.Y) * hz
	local ez = math.abs(xv.Z) * hx + math.abs(yv.Z) * hy + math.abs(zv.Z) * hz
	local p = cf.Position
	return Vector3.new(p.X - ex, p.Y - ey, p.Z - ez), Vector3.new(p.X + ex, p.Y + ey, p.Z + ez)
end

local function formaDe(part)
	if part:IsA("MeshPart") then return "Mesh" end
	if part:IsA("UnionOperation") then return "Union" end
	if part:IsA("WedgePart") then return "Wedge" end
	if part:IsA("CornerWedgePart") then return "CornerWedge" end
	if part:IsA("TrussPart") then return "Truss" end
	if part:IsA("Part") then
		local ok, s = pcall(function() return part.Shape.Name end)
		if ok then return s end
	end
	return part.ClassName
end

local function lerMesh(part, maxVerts, maxFaces, orcamento)
	local info = { part = part.Name, id = idDe(part) }
	local meshId, escala, malha, fonte = nil, Vector3.new(1, 1, 1), nil, nil
	if part:IsA("MeshPart") then
		meshId = part.MeshId
		local okC, conteudo = pcall(function() return part.MeshContent end)
		if okC and conteudo ~= nil then
			local okO, obj = pcall(function() return conteudo.SourceType == Enum.ContentSourceType.Object and conteudo.Object or nil end)
			if okO and obj ~= nil then malha = obj; fonte = "EditableMesh (objeto da propria peca)" end
		end
		local okS, ms = pcall(function() return part.MeshSize end)
		if okS and ms and ms.X > 0 and ms.Y > 0 and ms.Z > 0 then escala = Vector3.new(part.Size.X / ms.X, part.Size.Y / ms.Y, part.Size.Z / ms.Z) end
	else
		local sm = part:FindFirstChildWhichIsA("SpecialMesh")
		if sm and sm.MeshType == Enum.MeshType.FileMesh then meshId = sm.MeshId; escala = sm.Scale end
	end
	info.meshId = meshId ~= nil and meshId ~= "" and meshId or nil
	if info.meshId then
		local okT, tid = pcall(function() return part.TextureID end)
		if okT and tid ~= nil and tid ~= "" then info.textureId = tid end
	end
	local criado = false
	if malha == nil and info.meshId then
		local ok, em = pcall(function() return AssetService:CreateEditableMeshAsync(Content.fromUri(info.meshId)) end)
		if not ok or em == nil then
			local ok2, em2 = pcall(function() return AssetService:CreateEditableMeshAsync(info.meshId) end)
			if ok2 and em2 ~= nil then ok, em = true, em2 end
		end
		if ok and em ~= nil then malha = em; criado = true; fonte = "EditableMesh (asset)"
		else info.unavailable = "EditableMesh indisponivel: " .. tostring(em):sub(1, 140) .. " (mesh de terceiro ou sem permissao; use bounds/size)" end
	elseif malha == nil then
		info.unavailable = part:IsA("UnionOperation") and "Union nao expoe geometria" or "sem MeshId"
	end
	if malha == nil then return info, nil end
	local okV, ids = pcall(function() return malha:GetVertices() end)
	local okF, fids = pcall(function() return malha:GetFaces() end)
	if not okV or type(ids) ~= "table" then
		info.unavailable = "EditableMesh sem vertices legiveis"
		if criado then pcall(function() malha:Destroy() end) end
		return info, nil
	end
	info.source = fonte
	info.vertices = #ids
	info.faces = okF and type(fids) == "table" and #fids or nil
	local minX, minY, minZ, maxX, maxY, maxZ = math.huge, math.huge, math.huge, -math.huge, -math.huge, -math.huge
	local sx, sy, sz = 0, 0, 0
	local locais = {}
	local indice = {}
	for i, vid in ipairs(ids) do
		respirar(orcamento)
		local okP, p = pcall(function() return malha:GetPosition(vid) end)
		if okP and p ~= nil then
			local x, y, z = p.X * escala.X, p.Y * escala.Y, p.Z * escala.Z
			if x < minX then minX = x end; if y < minY then minY = y end; if z < minZ then minZ = z end
			if x > maxX then maxX = x end; if y > maxY then maxY = y end; if z > maxZ then maxZ = z end
			sx = sx + x; sy = sy + y; sz = sz + z
			locais[i] = Vector3.new(x, y, z)
			indice[vid] = i - 1
		end
	end
	local n = #locais
	if n > 0 then
		info.bounds = { min = { r2(minX), r2(minY), r2(minZ) }, max = { r2(maxX), r2(maxY), r2(maxZ) }, size = { r2(maxX - minX), r2(maxY - minY), r2(maxZ - minZ) } }
		info.centroid = { r2(sx / n), r2(sy / n), r2(sz / n) }
	end
	if maxVerts > 0 and n > 0 then
		local amostra = {}
		for i = 1, math.min(maxVerts, n) do amostra[i] = v3(locais[i]) end
		info.vertexSample = amostra
		info.vertexSampleNote = n > maxVerts and ("primeiros " .. maxVerts .. " de " .. n .. " vertices, espaco da peca (studs, origem no centro)") or ("todos os " .. n .. " vertices, espaco da peca (studs, origem no centro)")
	end
	if maxFaces > 0 and okF and type(fids) == "table" then
		local tri, lidas = {}, 0
		local teto = maxVerts > 0 and math.min(maxVerts, n) or n
		for _, fid in ipairs(fids) do
			respirar(orcamento)
			lidas = lidas + 1
			local okFV, vs = pcall(function() return malha:GetFaceVertices(fid) end)
			if okFV and type(vs) == "table" then
				local a, b, c = indice[vs[1]], indice[vs[2]], indice[vs[3]]
				if a ~= nil and b ~= nil and c ~= nil and a < teto and b < teto and c < teto then
					table.insert(tri, { a, b, c })
					if #tri >= maxFaces then break end
				end
			end
			if lidas >= 60000 then break end
		end
		info.faceSample = tri
		info.faceSampleNote = "indices em vertexSample (0-based)" .. (#tri < (info.faces or 0) and (", " .. #tri .. " de " .. tostring(info.faces)) or "")
	end
	return info, { malha = malha, criado = criado, locais = locais, escala = escala }
end

local VISTAS = {
	{ nome = "topo", desc = "de cima (-Y): col->+X lin->+Z; digito = altura Y", col = "X", lin = "Z", prof = "Y", sinal = 1 },
	{ nome = "frente", desc = "de +Z olhando -Z: col->+X lin->-Y; digito = proximidade em Z", col = "X", lin = "Y", prof = "Z", sinal = 1, invLin = true },
	{ nome = "lado", desc = "de -X olhando +X: col->+Z lin->-Y; digito = proximidade em -X", col = "Z", lin = "Y", prof = "X", sinal = -1, invLin = true },
}
local function comp(v, eixo) if eixo == "X" then return v.X elseif eixo == "Y" then return v.Y end; return v.Z end
local function vetorEixo(eixo, s) if eixo == "X" then return Vector3.new(s, 0, 0) elseif eixo == "Y" then return Vector3.new(0, s, 0) end; return Vector3.new(0, 0, s) end

local function projetar(caixas, nuvens, minG, maxG, resolucao, orcamento)
	local tam = maxG - minG
	local maior = math.max(tam.X, tam.Y, tam.Z, 0.01)
	local celula = maior / resolucao
	local saida = { cell = r2(celula), views = {} }
	for _, vista in ipairs(VISTAS) do
		local cols = math.max(1, math.min(resolucao, math.ceil(comp(tam, vista.col) / celula)))
		local lins = math.max(1, math.min(resolucao, math.ceil(comp(tam, vista.lin) / celula)))
		local grade = {}
		for l = 1, lins do grade[l] = {} end
		local profMin, profMax = math.huge, -math.huge
		local function pintar(cx, cy, profundidade)
			local c = math.floor((cx - comp(minG, vista.col)) / celula) + 1
			local l = math.floor((cy - comp(minG, vista.lin)) / celula) + 1
			if c < 1 then c = 1 elseif c > cols then c = cols end
			if l < 1 then l = 1 elseif l > lins then l = lins end
			if vista.invLin then l = lins - l + 1 end
			local atual = grade[l][c]
			if atual == nil or profundidade > atual then grade[l][c] = profundidade end
			if profundidade < profMin then profMin = profundidade end
			if profundidade > profMax then profMax = profundidade end
		end

		for _, nuvem in ipairs(nuvens) do
			local cf = nuvem.cf
			for _, p in ipairs(nuvem.pontos) do
				respirar(orcamento)
				local w = cf:PointToWorldSpace(p)
				pintar(comp(w, vista.col), comp(w, vista.lin), comp(w, vista.prof) * vista.sinal)
			end
		end

		if #caixas > 0 then
			local dir = vetorEixo(vista.prof, -vista.sinal)
			local longe = comp(vista.sinal > 0 and maxG or minG, vista.prof) + vista.sinal * (maior + 1)
			for l = 1, lins do
				for c = 1, cols do
					respirar(orcamento)
					local lr = vista.invLin and (lins - l + 1) or l
					local cx = comp(minG, vista.col) + (c - 0.5) * celula
					local cy = comp(minG, vista.lin) + (lr - 0.5) * celula
					local origem
					if vista.prof == "Y" then origem = Vector3.new(cx, longe, cy)
					elseif vista.prof == "Z" then origem = Vector3.new(cx, cy, longe)
					else origem = Vector3.new(longe, cy, cx) end
					local melhor = nil
					for _, cx3 in ipairs(caixas) do
						local o = cx3.cf:PointToObjectSpace(origem)
						local d = cx3.cf:VectorToObjectSpace(dir)
						local h = cx3.half
						local tmin, tmax, ok = -math.huge, math.huge, true
						for eixo = 1, 3 do
							local oe = eixo == 1 and o.X or eixo == 2 and o.Y or o.Z
							local de = eixo == 1 and d.X or eixo == 2 and d.Y or d.Z
							local he = eixo == 1 and h.X or eixo == 2 and h.Y or h.Z
							if math.abs(de) < 1e-9 then
								if math.abs(oe) > he then ok = false; break end
							else
								local t1, t2 = (-he - oe) / de, (he - oe) / de
								if t1 > t2 then t1, t2 = t2, t1 end
								if t1 > tmin then tmin = t1 end
								if t2 < tmax then tmax = t2 end
								if tmin > tmax then ok = false; break end
							end
						end
						if ok and tmax >= 0 then
							local t = math.max(tmin, 0)
							if melhor == nil or t < melhor then melhor = t end
						end
					end
					if melhor ~= nil then
						local hit = origem + dir * melhor
						pintar(cx, cy, comp(hit, vista.prof) * vista.sinal)
					end
				end
			end
		end
		local linhas = {}
		local faixa = profMax - profMin
		for l = 1, lins do
			local buf = {}
			for c = 1, cols do
				local p = grade[l][c]
				if p == nil then buf[c] = "."
				elseif faixa < 1e-6 then buf[c] = "9"
				else buf[c] = tostring(math.max(1, math.min(9, 1 + math.floor((p - profMin) / faixa * 8.999)))) end
			end
			linhas[l] = table.concat(buf)
		end
		table.insert(saida.views, {
			name = vista.nome, desc = vista.desc, rows = linhas,
			colAxis = vista.col, colRange = { r1(comp(minG, vista.col)), r1(comp(maxG, vista.col)) },
			lineAxis = vista.lin, lineRange = { r1(comp(minG, vista.lin)), r1(comp(maxG, vista.lin)) },

			depth = profMin ~= math.huge and { axis = vista.prof, far = r1(profMin * vista.sinal), near = r1(profMax * vista.sinal) } or nil,
		})
	end
	return saida
end

acoes.inspect_model = function(a)
	local alvo = resolver(a.target)
	local detalhe = tostring(a.detail or "parts")
	local maxParts = math.clamp(math.floor(tonumber(a.maxParts) or 150), 1, 1000)
	local maxMeshes = math.clamp(math.floor(tonumber(a.maxMeshes) or 8), 0, 40)
	local maxVerts = math.clamp(math.floor(tonumber(a.maxVertices) or 0), 0, 3000)
	local maxFaces = math.clamp(math.floor(tonumber(a.maxFaces) or 0), 0, 3000)
	local resolucao = math.clamp(math.floor(tonumber(a.resolution) or 24), 8, 48)
	local querProj = a.projections ~= false
	local espacoMundo = tostring(a.space or "local") == "world"
	local orcamento = novoOrcamento()

	local pecas = {}
	if ehParte(alvo) then table.insert(pecas, alvo) end
	for _, d in ipairs(alvo:GetDescendants()) do
		respirar(orcamento)
		if ehParte(d) then table.insert(pecas, d) end
	end
	local saida = resumo(alvo)
	saida.parentPath = caminhoDe(alvo.Parent)
	if #pecas == 0 then
		saida.counts = { parts = 0 }
		saida.note = "nenhuma BasePart dentro do alvo; nada para inspecionar geometricamente"
		return saida
	end

	local pivo
	if ehPV(alvo) then pivo = alvo:GetPivot() else pivo = nil end
	local minG, maxG = nil, nil
	local volumeDe = {}
	for _, p in ipairs(pecas) do
		local mn, mx = aabbDe(p.CFrame, p.Size)
		if minG == nil then minG, maxG = mn, mx
		else minG = Vector3.new(math.min(minG.X, mn.X), math.min(minG.Y, mn.Y), math.min(minG.Z, mn.Z)); maxG = Vector3.new(math.max(maxG.X, mx.X), math.max(maxG.Y, mx.Y), math.max(maxG.Z, mx.Z)) end
		volumeDe[p] = p.Size.X * p.Size.Y * p.Size.Z
	end
	if pivo == nil then pivo = CFrame.new((minG + maxG) / 2) end
	saida.pivot = { position = v3(pivo.Position), orientation = angulos(pivo) }
	saida.bounds = { min = v3(minG), max = v3(maxG), size = v3(maxG - minG), center = v3((minG + maxG) / 2) }
	if alvo:IsA("Model") then
		local okB, bcf, bsz = pcall(function() return alvo:GetBoundingBox() end)
		if okB then saida.orientedBounds = { position = v3(bcf.Position), orientation = angulos(bcf), size = v3(bsz) } end
		if alvo.PrimaryPart then saida.primaryPart = alvo.PrimaryPart.Name end
	end

	local cont = { parts = #pecas, meshParts = 0, unions = 0, attachments = 0, joints = 0, constraints = 0, scripts = 0, decals = 0, lights = 0, sounds = 0, particles = 0, models = 0 }
	local anexos, juntas, scripts, humanoide = {}, {}, {}, nil
	local todos = alvo:GetDescendants()
	for _, d in ipairs(todos) do
		respirar(orcamento)
		if d:IsA("MeshPart") then cont.meshParts = cont.meshParts + 1
		elseif d:IsA("UnionOperation") then cont.unions = cont.unions + 1 end
		if d:IsA("Attachment") then cont.attachments = cont.attachments + 1; if #anexos < 60 then table.insert(anexos, d) end
		elseif d:IsA("JointInstance") then cont.joints = cont.joints + 1; if #juntas < 80 then table.insert(juntas, d) end
		elseif d:IsA("Constraint") then cont.constraints = cont.constraints + 1
		elseif d:IsA("LuaSourceContainer") then cont.scripts = cont.scripts + 1; if #scripts < 40 then table.insert(scripts, caminhoDe(d) .. " [" .. d.ClassName .. "]") end
		elseif d:IsA("Decal") or d:IsA("Texture") then cont.decals = cont.decals + 1
		elseif d:IsA("Light") then cont.lights = cont.lights + 1
		elseif d:IsA("Sound") then cont.sounds = cont.sounds + 1
		elseif d:IsA("ParticleEmitter") or d:IsA("Beam") or d:IsA("Trail") then cont.particles = cont.particles + 1
		elseif d:IsA("Model") then cont.models = cont.models + 1
		elseif d:IsA("Humanoid") then humanoide = d end
	end
	saida.counts = cont
	if humanoide then
		local motores = {}
		for _, j in ipairs(juntas) do if j:IsA("Motor6D") then table.insert(motores, j.Name) end end
		local okR, rig = pcall(function() return humanoide.RigType.Name end)
		saida.rig = { rigType = okR and rig or "?", motors = motores, health = humanoide.MaxHealth, hipHeight = r2(humanoide.HipHeight) }
	end
	if cont.scripts > 0 then saida.scripts = scripts end

	table.sort(pecas, function(x, y) return volumeDe[x] > volumeDe[y] end)
	local inv = pivo:Inverse()
	local caixas, nuvens, meshes = {}, {}, {}
	local meshCandidatos = {}
	if detalhe ~= "summary" then
		local lista = {}
		for i, p in ipairs(pecas) do
			respirar(orcamento)
			if i > maxParts then saida.partsTruncated = #pecas - maxParts; break end
			local rel = inv * p.CFrame
			local cf = espacoMundo and p.CFrame or rel
			local item = {
				id = idDe(p), name = p.Name, className = p.ClassName, shape = formaDe(p),
				pos = v3(cf.Position), rot = angulos(cf), size = v3(p.Size),
				material = p.Material.Name, color = corHex(p.Color),
			}
			if p.Parent ~= alvo and p.Parent ~= nil then item.parent = p.Parent.Name end
			if p.Transparency > 0 then item.transparency = r2(p.Transparency) end
			if not p.Anchored then item.anchored = false end
			if not p.CanCollide then item.canCollide = false end
			if p:IsA("MeshPart") then
				if p.MeshId ~= "" then item.meshId = p.MeshId end
				if p.TextureID ~= "" then item.textureId = p.TextureID end
			else
				local sm = p:FindFirstChildWhichIsA("SpecialMesh")
				if sm then item.specialMesh = sm.MeshType.Name; if sm.MeshId ~= "" then item.meshId = sm.MeshId end end
			end
			table.insert(lista, item)
		end
		saida.parts = lista
		saida.space = espacoMundo and "world (posicoes absolutas)" or "local (pos/rot relativas ao pivo; mundo = pivo * local)"
	end
	for _, p in ipairs(pecas) do
		if (p:IsA("MeshPart") and p.MeshId ~= "") or (p:IsA("Part") and p:FindFirstChildWhichIsA("SpecialMesh") ~= nil) then
			if #meshCandidatos < maxMeshes then table.insert(meshCandidatos, p) end
		end
	end
	local comNuvem = {}
	if maxMeshes > 0 then
		for _, p in ipairs(meshCandidatos) do
			local info, dados = lerMesh(p, maxVerts, maxFaces, orcamento)
			table.insert(meshes, info)
			if dados ~= nil then
				if querProj and #dados.locais > 0 then
					local pontos = dados.locais
					if #pontos > 20000 then
						local passo, sub = math.ceil(#pontos / 20000), {}
						for i = 1, #pontos, passo do sub[#sub + 1] = pontos[i] end
						pontos = sub
					end
					table.insert(nuvens, { cf = p.CFrame, pontos = pontos })
					comNuvem[p] = true
				end
				if dados.criado then pcall(function() dados.malha:Destroy() end) end
			end
		end
		if #meshes > 0 then saida.meshes = meshes end
		local totalMesh = 0
		for _, p in ipairs(pecas) do if p:IsA("MeshPart") and p.MeshId ~= "" then totalMesh = totalMesh + 1 end end
		if totalMesh > #meshCandidatos then saida.meshesTruncated = totalMesh - #meshCandidatos end
	end
	if querProj then
		local limite = math.min(#pecas, 400)
		for i = 1, limite do
			local p = pecas[i]
			if not comNuvem[p] then table.insert(caixas, { cf = p.CFrame, half = p.Size / 2 }) end
		end
		saida.projections = projetar(caixas, nuvens, minG, maxG, resolucao, orcamento)
		if #pecas > limite then saida.projections.note = "projecao considerou as " .. limite .. " maiores pecas de " .. #pecas end
	end
	if detalhe == "full" then
		if #anexos > 0 then
			local lista = {}
			for _, at in ipairs(anexos) do
				local w = at.WorldCFrame
				local cf = espacoMundo and w or (inv * w)
				table.insert(lista, { name = at.Name, parent = at.Parent and at.Parent.Name or nil, pos = v3(cf.Position), rot = angulos(cf) })
			end
			saida.attachments = lista
		end
		if #juntas > 0 then
			local lista = {}
			for _, j in ipairs(juntas) do
				table.insert(lista, { name = j.Name, className = j.ClassName, part0 = j.Part0 and j.Part0.Name or nil, part1 = j.Part1 and j.Part1.Name or nil })
			end
			saida.joints = lista
		end
	end
	return saida
end
end
