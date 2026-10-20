do

local SerializationServiceExp = nil
pcall(function() SerializationServiceExp = game:GetService("SerializationService") end)
local AssetServiceExp = game:GetService("AssetService")
local TAM_PEDACO = 512 * 1024
local INLINE_MAX = 64 * 1024
local CAMPOS_ASSET = { "MeshId", "TextureID", "TextureId", "Texture", "Image", "HoverImage", "PressedImage", "SoundId", "Video", "AnimationId", "ColorMap", "NormalMap", "MetalnessMap", "RoughnessMap", "SkyboxBk", "SkyboxDn", "SkyboxFt", "SkyboxLf", "SkyboxRt", "SkyboxUp", "SunTextureId", "MoonTextureId", "Decal" }

local function urlEncode(s)
	return (string.gsub(tostring(s), "[^%w%-_%.~]", function(c) return string.format("%%%02X", string.byte(c)) end))
end
local function nomeSeguro(nome, padrao)
	local s = tostring(nome or ""):gsub("[\\/:*?\"<>|%c]", "_"):gsub("^%s+", ""):gsub("%s+$", "")
	if s == "" then s = padrao end
	return string.sub(s, 1, 120)
end
local function pedirBinario(caminho, corpo)
	local h = { ["Content-Type"] = "application/octet-stream", ["Accept"] = "application/json" }
	if chave ~= "" then h.Authorization = "Bearer " .. chave end
	local ok, response = pcall(function()
		return HttpService:RequestAsync({ Url = urlBase .. "/" .. caminho, Method = "POST", Headers = h, Body = corpo })
	end)
	if not ok then return nil, tostring(response) end
	if not response.Success then return nil, "HTTP " .. tostring(response.StatusCode) .. " " .. string.sub(tostring(response.Body), 1, 250) end
	local parsed, data = pcall(function() return HttpService:JSONDecode(response.Body) end)
	if not parsed then return nil, "Resposta ilegivel do Worker" end
	return data, nil
end
local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local function base64(s)
	local out, orcamento = {}, novoOrcamento()
	for i = 1, #s, 3 do
		respirar(orcamento)
		local a, b, c = string.byte(s, i, i + 2)
		local n = a * 65536 + (b or 0) * 256 + (c or 0)
		local c1, c2, c3, c4 = math.floor(n / 262144) % 64, math.floor(n / 4096) % 64, math.floor(n / 64) % 64, n % 64
		out[#out + 1] = string.sub(B64, c1 + 1, c1 + 1) .. string.sub(B64, c2 + 1, c2 + 1) .. (b and string.sub(B64, c3 + 1, c3 + 1) or "=") .. (c and string.sub(B64, c4 + 1, c4 + 1) or "=")
	end
	return table.concat(out)
end
local function falharExport(code, message, extra)
	local e = extra or {}
	e.code, e.message = code, message
	if e.nothingExecuted == nil then e.nothingExecuted = true end
	error(e, 0)
end
local function conferirPrazo(ctx)
	if ctx and ctx.cancelled then falharExport("CANCELLED", "exportacao cancelada.", { nothingExecuted = false }) end
	if ctx and ctx.deadline and os.clock() >= ctx.deadline then falharExport("EXECUTION_TIMEOUT", "o prazo da chamada acabou durante o envio do arquivo; arquivos maiores levam mais pedacos. Tente de novo ou exporte uma parte menor.", { nothingExecuted = false }) end
end

local function enviarArquivo(nome, tipo, dados, ctx, usarB64)
	local total = #dados
	local tam = usarB64 and math.floor(TAM_PEDACO * 3 / 4 / 3) * 3 or TAM_PEDACO
	local uploadId, parte, pos = nil, 0, 1
	while true do
		parte = parte + 1
		local fim = pos + tam > total
		local pedaco = string.sub(dados, pos, math.min(total, pos + tam - 1))
		pos = pos + tam
		local corpo = usarB64 and base64(pedaco) or pedaco
		local q = "arquivo?peer=" .. peer .. "&nome=" .. urlEncode(nome) .. "&tipo=" .. urlEncode(tipo) .. "&parte=" .. parte .. "&len=" .. #corpo .. (usarB64 and "&b64=1" or "") .. (uploadId and ("&id=" .. uploadId) or "") .. (fim and "&fim=1" or "")
		local resp, err = pedirBinario(q, corpo)
		if err then
			if not usarB64 and uploadId == nil and (string.find(err, "BYTES_MISMATCH", 1, true) or string.match(err, "^HTTP 400")) then
				return enviarArquivo(nome, tipo, dados, ctx, true)
			end
			if string.match(err, "^HTTP 404") then
				falharExport("WORKER_UPDATE_REQUIRED", "o Worker nao conhece a rota /arquivo: faca o redeploy do Worker 2.8.2 (npx wrangler deploy) e repita.", { nothingExecuted = false })
			end
			falharExport("UPLOAD_FAILED", "nao consegui enviar o arquivo ao Worker: " .. err, { nothingExecuted = false })
		end
		if type(resp) ~= "table" or resp.ok ~= true then
			local motivo = type(resp) == "table" and (type(resp.erro) == "table" and resp.erro.message or resp.erro) or "resposta inesperada"
			falharExport("UPLOAD_FAILED", "o Worker recusou o arquivo: " .. tostring(motivo), { nothingExecuted = false })
		end
		if fim then return resp end
		uploadId = resp.uploadId or uploadId
		if not uploadId then falharExport("UPLOAD_FAILED", "o Worker nao devolveu uploadId.", { nothingExecuted = false }) end
		conferirPrazo(ctx)
		task.wait()
	end
end
local function idDeConteudo(v)
	if typeof(v) == "Content" then
		local ok, uri = pcall(function() return v.Uri end)
		v = ok and uri or nil
	end
	if type(v) ~= "string" or v == "" then return nil, nil end
	local id = string.match(v, "^rbxassetid://(%d+)") or string.match(v, "[?&]id=(%d+)") or string.match(v, "^rbxasset://(%d+)")
	return tonumber(id), v
end

local function assetsDe(inst, recursivo, teto)
	local lista, vistos, n = {}, {}, 0
	local function colher(obj)
		for _, campo in ipairs(CAMPOS_ASSET) do
			local ok, v = pcall(function() return obj[campo] end)
			if ok and v ~= nil then
				local id, uri = idDeConteudo(v)
				if id and not vistos[id] then
					vistos[id] = true
					table.insert(lista, { assetId = id, uri = uri, property = campo, path = caminhoDe(obj), className = obj.ClassName })
				end
			end
		end
	end
	colher(inst)
	if recursivo then
		local orcamento = novoOrcamento()
		for _, d in ipairs(inst:GetDescendants()) do
			respirar(orcamento)
			n = n + 1
			if n > teto then break end
			colher(d)
		end
	end
	return lista
end
local function f6(x) return string.format("%.6g", x) end

local function exportarObj(part, maxBytes, ctx)
	local meshId, malha, criado, escala = nil, nil, false, nil
	if part:IsA("MeshPart") then
		meshId = part.MeshId
		local okC, conteudo = pcall(function() return part.MeshContent end)
		if okC and conteudo ~= nil then
			local okO, obj = pcall(function() return conteudo.SourceType == Enum.ContentSourceType.Object and conteudo.Object or nil end)
			if okO and obj ~= nil then malha = obj end
		end
		pcall(function()
			local ms = part.MeshSize
			if ms and ms.X > 0 and ms.Y > 0 and ms.Z > 0 then escala = { f6(part.Size.X / ms.X), f6(part.Size.Y / ms.Y), f6(part.Size.Z / ms.Z) } end
		end)
	elseif part:IsA("SpecialMesh") then
		if part.MeshType == Enum.MeshType.FileMesh then meshId = part.MeshId end
		pcall(function() escala = { f6(part.Scale.X), f6(part.Scale.Y), f6(part.Scale.Z) } end)
	elseif part:IsA("BasePart") then
		local sm = part:FindFirstChildWhichIsA("SpecialMesh")
		if sm and sm.MeshType == Enum.MeshType.FileMesh then
			meshId = sm.MeshId
			pcall(function() escala = { f6(sm.Scale.X), f6(sm.Scale.Y), f6(sm.Scale.Z) } end)
		end
	end
	if malha == nil then
		if meshId == nil or meshId == "" then falharExport("NO_MESH", caminhoDe(part) .. " nao tem malha exportavel (MeshPart com MeshId, Part com SpecialMesh FileMesh ou SpecialMesh). Para o arquivo do Studio use kind=rbxm.") end
		local ok, em = pcall(function() return AssetServiceExp:CreateEditableMeshAsync(Content.fromUri(meshId)) end)
		if not ok or em == nil then
			local ok2, em2 = pcall(function() return AssetServiceExp:CreateEditableMeshAsync(meshId) end)
			if ok2 and em2 ~= nil then ok, em = true, em2 end
		end
		if not ok or em == nil then
			falharExport("MESH_UNAVAILABLE", "EditableMesh indisponivel para " .. tostring(meshId) .. ": " .. string.sub(tostring(em), 1, 160) .. ". Mesh de terceiro ou sem permissao de leitura; baixe o asset original pela URL em assets (kind=asset).", { meshId = meshId })
		end
		malha, criado = em, true
	end
	local out = {}
	local okV, ids = pcall(function() return malha:GetVertices() end)
	local okF, fids = pcall(function() return malha:GetFaces() end)
	if not okV or type(ids) ~= "table" or not okF or type(fids) ~= "table" then
		if criado then pcall(function() malha:Destroy() end) end
		falharExport("MESH_UNAVAILABLE", "EditableMesh sem vertices/faces legiveis.")
	end
	local orcamento = novoOrcamento()
	local bytes = 0
	local function linha(s)
		out[#out + 1] = s
		bytes = bytes + #s + 1
		if bytes > maxBytes then
			if criado then pcall(function() malha:Destroy() end) end
			falharExport("RESULT_TOO_LARGE", "o OBJ passou de " .. math.floor(maxBytes / 1024) .. " KB (maxBytes); malha com " .. #ids .. " vertices. Aumente maxBytes ou baixe o asset original.", { vertices = #ids, faces = #fids })
		end
	end
	linha("# exportado pelo MCP Studio a partir de " .. caminhoDe(part))
	linha("# meshId " .. tostring(meshId or "(EditableMesh da propria peca)") .. (escala and (" | escala da peca (Size/MeshSize ou SpecialMesh.Scale): " .. table.concat(escala, " ")) or ""))
	linha("# coordenadas em espaco da malha (studs, sem escala da peca); vt com V invertido (origem inferior esquerda do OBJ)")
	linha("o " .. nomeSeguro(part.Name, "mesh"):gsub("%s+", "_"))
	local idx = {}
	for i, vid in ipairs(ids) do
		respirar(orcamento)
		local okP, p = pcall(function() return malha:GetPosition(vid) end)
		if okP and p ~= nil then
			idx[vid] = i
			linha("v " .. f6(p.X) .. " " .. f6(p.Y) .. " " .. f6(p.Z))
		end
	end
	local nidx, uidx, normais, uvs = {}, {}, 0, 0
	pcall(function()
		for i, nid in ipairs(malha:GetNormals()) do
			respirar(orcamento)
			local nv = malha:GetNormal(nid)
			nidx[nid] = i
			normais = normais + 1
			linha("vn " .. f6(nv.X) .. " " .. f6(nv.Y) .. " " .. f6(nv.Z))
		end
	end)
	pcall(function()
		for i, uid in ipairs(malha:GetUVs()) do
			respirar(orcamento)
			local uv = malha:GetUV(uid)
			uidx[uid] = i
			uvs = uvs + 1
			linha("vt " .. f6(uv.X) .. " " .. f6(1 - uv.Y))
		end
	end)
	local faces = 0
	for _, fid in ipairs(fids) do
		respirar(orcamento)
		local okFV, vs = pcall(function() return malha:GetFaceVertices(fid) end)
		if okFV and type(vs) == "table" and #vs >= 3 then
			local ns = nil
			if normais > 0 then local okN, r = pcall(function() return malha:GetFaceNormals(fid) end); if okN and type(r) == "table" then ns = r end end
			local us = nil
			if uvs > 0 then local okU, r = pcall(function() return malha:GetFaceUVs(fid) end); if okU and type(r) == "table" then us = r end end
			local partes = {}
			for k = 1, #vs do
				local vi = idx[vs[k]]
				if vi == nil then partes = nil; break end
				local ti = us and uidx[us[k]] or nil
				local ni = ns and nidx[ns[k]] or nil
				if ni then partes[k] = vi .. "/" .. (ti or "") .. "/" .. ni
				elseif ti then partes[k] = vi .. "/" .. ti
				else partes[k] = tostring(vi) end
			end
			if partes then
				faces = faces + 1
				linha("f " .. table.concat(partes, " "))
			end
		end
	end
	if criado then pcall(function() malha:Destroy() end) end
	conferirPrazo(ctx)
	return table.concat(out, "\n") .. "\n", { vertices = #ids, faces = faces, normals = normais, uvs = uvs, meshId = meshId }
end
local function bytesDoBuffer(buf)
	if type(buf) == "string" then return buf end
	if typeof(buf) == "buffer" and type(buffer) == "table" then return buffer.tostring(buf) end
	falharExport("SERIALIZE_FAILED", "SerializeInstancesAsync devolveu um valor inesperado (" .. typeof(buf) .. ").")
end
acoes.export_file = function(a)
	local ctx = contextoAtual
	local inicio = os.clock()
	local tipo = string.lower(tostring(a.kind or "auto"))
	local maxBytes = math.clamp(math.floor(tonumber(a.maxBytes) or 20000000), 1024, 40000000)
	local inline = a.inline ~= false
	local alvo = a.target ~= nil and resolver(a.target) or nil
	if alvo == nil then
		local id = math.floor(tonumber(a.assetId) or 0)
		if id <= 0 then falharExport("TARGET_REQUIRED", "informe target (instancia do place) ou assetId (numero do asset).") end
		return { kind = "asset", assets = { { assetId = id, uri = "rbxassetid://" .. id } }, notes = { "sem target: apenas o asset original, baixado pelo Worker" }, ms = 0 }
	end
	if alvo == game then falharExport("PROTECTED_ROOT", "exporte um servico, pasta, modelo ou instancia; nao o game inteiro.") end
	local saida = resumo(alvo)
	saida.notes = {}
	local assets = assetsDe(alvo, tipo ~= "script", 2000)
	if tipo == "auto" then
		if alvo:IsA("LuaSourceContainer") then tipo = "script"
		elseif alvo:IsA("MeshPart") or alvo:IsA("SpecialMesh") or (alvo:IsA("BasePart") and alvo:FindFirstChildWhichIsA("SpecialMesh") ~= nil) then tipo = "obj"
		elseif #assets > 0 and (alvo:IsA("Decal") or alvo:IsA("Texture") or alvo:IsA("ImageLabel") or alvo:IsA("ImageButton") or alvo:IsA("Sound") or alvo:IsA("VideoFrame") or alvo:IsA("Sky") or alvo:IsA("Animation") or alvo:IsA("SurfaceAppearance")) then tipo = "asset"
		else tipo = "rbxm" end
	end
	saida.kind = tipo
	if #assets > 0 then
		saida.assets = {}
		for i, item in ipairs(assets) do
			if i > 100 then table.insert(saida.notes, (#assets - 100) .. " asset(s) a mais omitidos; use kind=asset em uma subarvore menor"); break end
			saida.assets[i] = item
		end
	end
	local dados, nome, mime = nil, nil, nil
	if tipo == "script" then
		if not alvo:IsA("LuaSourceContainer") then falharExport("NOT_SCRIPT", caminhoDe(alvo) .. " nao e um script (e " .. alvo.ClassName .. "); use kind=rbxm para o arquivo do Studio.") end
		dados = fonteDe(alvo)
		local sufixo = ".lua"
		if alvo.ClassName == "LocalScript" then sufixo = ".client.lua" elseif alvo.ClassName == "Script" then sufixo = ".server.lua" end
		nome = nomeSeguro(a.fileName, alvo.Name .. sufixo)
		mime = "text/x-lua; charset=utf-8"
		local _, quebras = string.gsub(dados, "\n", "")
		saida.lines = quebras + 1
		if ctx and ctx.agent then saida.revision = controle:read(ctx.agent, alvo, dados) end
	elseif tipo == "obj" then
		local info
		dados, info = exportarObj(alvo, maxBytes, ctx)
		nome = nomeSeguro(a.fileName, alvo.Name .. ".obj")
		mime = "model/obj"
		saida.mesh = info
	elseif tipo == "rbxm" then
		if not SerializationServiceExp then falharExport("SERIALIZATION_UNAVAILABLE", "este Studio nao expoe SerializationService (exige Studio de 2025 em diante); atualize o Studio ou exporte scripts com kind=script.") end
		local instancias = { alvo }
		if alvo.Parent == game then
			instancias = alvo:GetChildren()
			if #instancias == 0 then falharExport("EMPTY_SERVICE", caminhoDe(alvo) .. " nao tem filhos para exportar.") end
			table.insert(saida.notes, "servico: exportados os " .. #instancias .. " filhos de " .. caminhoDe(alvo))
		end
		local okS, buf = pcall(function() return SerializationServiceExp:SerializeInstancesAsync(instancias) end)
		if not okS then falharExport("SERIALIZE_FAILED", "SerializeInstancesAsync falhou: " .. string.sub(tostring(buf), 1, 300)) end
		dados = bytesDoBuffer(buf)
		nome = nomeSeguro(a.fileName, alvo.Name .. ".rbxm")
		mime = "application/octet-stream"
		local n = 0
		for _, inst in ipairs(instancias) do n = n + 1 + #inst:GetDescendants() end
		saida.instances = n
	elseif tipo == "asset" then
		if #assets == 0 then falharExport("NO_ASSETS", caminhoDe(alvo) .. " nao referencia nenhum asset (MeshId/TextureID/Texture/Image/SoundId...). Use kind=rbxm para o arquivo do Studio.") end
		saida.ms = math.floor((os.clock() - inicio) * 1000)
		return saida
	else
		falharExport("INVALID_KIND", "kind deve ser auto, script, rbxm, obj ou asset.")
	end
	if #dados > maxBytes then falharExport("RESULT_TOO_LARGE", "o arquivo tem " .. math.floor(#dados / 1024) .. " KB, acima de maxBytes (" .. math.floor(maxBytes / 1024) .. " KB). Aumente maxBytes (ate 40 MB) ou exporte uma parte menor.", { bytes = #dados }) end
	conferirPrazo(ctx)
	saida.bytes = #dados
	saida.fileName = nome
	local resp = enviarArquivo(nome, mime, dados, ctx, false)
	saida.url = resp.url
	saida.blobId = resp.id
	saida.expiresInSeconds = resp.expiresInSeconds
	if inline and tipo ~= "rbxm" and #dados <= INLINE_MAX then saida.content = dados end
	saida.ms = math.floor((os.clock() - inicio) * 1000)
	return saida
end
end
