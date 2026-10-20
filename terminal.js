import { FERRAMENTAS, MAPA_FERRAMENTAS, NOMES_FERRAMENTAS } from './ferramentas.js';

const tipo = (s) => {
	if (!s || typeof s !== 'object') return 'any';
	if (s.enum) return 'enum(' + s.enum.join('|') + ')';
	if (s.type === 'array') return `array<${tipo(s.items)}>`;
	if (s.anyOf || s.oneOf) return (s.anyOf || s.oneOf).map(tipo).join('|');
	return Array.isArray(s.type) ? s.type.join('|') : (s.type || 'any');
};

export function listarFerramentas() {
	const linhas = [];
	for (const f of FERRAMENTAS) {
		const req = (f.inputSchema.required || []).filter((n) => n !== 'agent');
		const opt = Object.keys(f.inputSchema.properties || {}).filter((n) => !req.includes(n) && n !== 'agent' && n !== 'format');
		const desc = (f.description || '').split('\n')[0].replace(/\s+/g, ' ');
		linhas.push(`${f.name}${req.length ? ' ' + req.map((n) => n + '=').join(' ') : ''}${opt.length ? '  [' + opt.join(' ') + ']' : ''}`);
		linhas.push(`    ${desc.length > 150 ? desc.slice(0, 147) + '...' : desc}`);
	}
	return linhas.join('\n');
}

export function descreverFerramenta(nome) {
	const f = MAPA_FERRAMENTAS.get(nome);
	if (!f) return null;
	const props = f.inputSchema.properties || {}, req = new Set(f.inputSchema.required || []);
	const linhas = [`## ${f.name} — ${f.title || ''}`, (f.description || '').trim(), ''];
	for (const [n, s] of Object.entries(props)) {
		if (n === 'agent') continue;
		const desc = (s.description || '').replace(/\s+/g, ' ').trim();
		linhas.push(` ${req.has(n) ? '*' : ' '} ${n}: ${tipo(s)}${s.default !== undefined ? ` [default=${JSON.stringify(s.default)}]` : ''}`);
		if (desc) linhas.push(`      ${desc}`);
		if (s.type === 'object' && s.properties) for (const [k, v] of Object.entries(s.properties)) linhas.push(`        .${k}: ${tipo(v)}${v.description ? ' — ' + v.description.replace(/\s+/g, ' ').trim() : ''}`);
		if (s.type === 'array' && s.items?.properties) for (const [k, v] of Object.entries(s.items.properties)) linhas.push(`        [].${k}: ${tipo(v)}${v.description ? ' — ' + v.description.replace(/\s+/g, ' ').trim() : ''}`);
	}
	linhas.push('', '(* = obrigatorio; agent e opcional: identidade vem do cabecalho X-Mcp-Agent / ?agent= / CLI)');
	return linhas.join('\n');
}

export function coagir(v) {
	if (typeof v !== 'string') return v;
	if (v === '') return '';
	if ('[{"'.includes(v[0])) { try { return JSON.parse(v); } catch { return v; } }
	const low = v.toLowerCase();
	if (low === 'true' || low === 'false') return low === 'true';
	if (low === 'null' || low === 'none') return null;
	if (/^-?\d+$/.test(v)) return Number(v);
	if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(v)) return Number(v);
	return v;
}

export function argumentosDeTexto(texto) {
	const out = {};
	const t = (texto || '').trim();
	if (!t) return out;
	if (t[0] === '{') return JSON.parse(t);
	const tokens = t.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
	for (const tok of tokens) {
		const m = tok.match(/^([A-Za-z_][\w.-]*)(:=|=)([\s\S]*)$/);
		if (!m) throw new Error(`argumento invalido '${tok}': use chave=valor, chave:=json ou um unico JSON`);
		let [, key, op, val] = m;
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
		const valor = op === ':=' ? JSON.parse(val) : coagir(val);
		const partes = key.split('.');
		let cur = out;
		for (const p of partes.slice(0, -1)) cur = cur[p] ??= {};
		cur[partes.at(-1)] = valor;
	}
	return out;
}

export function ajudaTerminal(base) {
	return `Roblox Studio MCP — acesso por terminal
URL: ${base}

Voce e um agente com terminal? Nao precisa de handshake MCP, sessao nem helper proprio.

OPCAO 1 — CLI pronto (recomendado, so precisa de python3):
  curl -fsSL ${base}/cli -o rbx && chmod +x rbx
  ./rbx status                         Studio conectado? qual place?
  ./rbx tools                          lista de ferramentas com parametros
  ./rbx schema get_script              parametros detalhados de uma ferramenta
  ./rbx call get_tree target=game.Workspace depth=2
  ./rbx call set_script target=game.ServerScriptService.Main edits:='[{"find":"a","replace":"b"}]'
  ./rbx grep "NomeDaFuncao"            atalho para grep_scripts
  ./rbx live                           Sessao Viva: playtest ativo? hot reload? journal? (livesession_status)
  ./rbx verify targets:='["game.ServerScriptService.Main"]'   o codigo entrou no playtest e persiste?
  ./rbx luau 'return #workspace:GetChildren()'
  ./rbx luau @arquivo.lua
  ./rbx import arvore.glb parent=game.Workspace scale=1 ground=true     importa 3D (GLB/glTF) direto do disco
  ./rbx import heroi.png as=ImageLabel parent=game.StarterGui.HUD       importa 2D (PNG/JPG)
  ./rbx import https://site/arquivo.glb parent=game.Workspace           o Studio baixa da URL
  ./rbx export game.Workspace.Casa -o casa.rbxm                         exporta instancia+subarvore (.rbxm real do Studio)
  ./rbx export game.ServerScriptService.Main -o Main.lua                script como arquivo; kind=obj para malhas; kind=asset baixa texturas/meshes originais
  (sem python: curl -fsSL ${base}/cli.sh -o rbx && chmod +x rbx — mesmos comandos)
  A identidade (agent) e criada e guardada automaticamente pelo CLI.

OPCAO 2 — curl direto (qualquer linguagem):
  curl -s ${base}/tools
  curl -s ${base}/tools/get_script
  curl -s -H 'X-Mcp-Agent: meu-agente' ${base}/call/studio_status
  curl -s -H 'X-Mcp-Agent: meu-agente' -d 'target=game.Workspace depth=2' ${base}/call/get_tree
  curl -s -H 'X-Mcp-Agent: meu-agente' -H 'Content-Type: application/json' -d '{"target":"game.ServerScriptService.Main"}' ${base}/call/get_script
  curl -s -H 'X-Mcp-Agent: meu-agente' --data-binary 'return 1+1' ${base}/luau
  Corpo: JSON ou "chave=valor chave2=valor2" (numeros/booleanos/JSON sao convertidos).
  Resposta: texto compacto; HTTP 200 = ok, 4xx = erro (texto comeca com "ERRO CODIGO:").
  Acrescente ?format=json para receber o objeto bruto.
  Use SEMPRE o mesmo X-Mcp-Agent (qualquer nome unico seu) em todas as chamadas.

VARIOS STUDIOS/PLACES NA MESMA URL:
  ./rbx status                         lista os Studios online com alias (s1, s2...), nome e placeId
  ./rbx place s2                       marca o place deste agente (studio_select); ./rbx place mostra; ./rbx place clear desmarca
  ./rbx --place s2 luau 'return 1'     ou RBX_PLACE=s2 / cabecalho X-Mcp-Place: s2 / ?place=s2 — vale so para a chamada
  Com um so Studio online nada disso e necessario. Com varios e sem marcacao a chamada e recusada (ERRO PLACE_REQUIRED, nada executado).

OPCAO 3 — cliente MCP padrao (Streamable HTTP): POST ${base} com JSON-RPC. SSE legado: ?transport=sse

IMPORTAR 2D/3D (PNG, JPG, GLB, glTF) para o place — ImportMCP, sem importador nativo nem publicar asset:
  curl -s -H 'X-Mcp-Agent: meu-agente' --data-binary @arvore.glb "${base}/import?parent=game.Workspace&name=Arvore&scale=1"
  curl -s -H 'X-Mcp-Agent: meu-agente' --data-binary @heroi.png "${base}/import?as=ImageLabel&parent=game.StarterGui"
  curl -s -H 'X-Mcp-Agent: meu-agente' -d 'url=https://site/modelo.glb parent=game.Workspace' ${base}/call/import_asset
  Parametros na query = os de import_asset (parent, as, name, position, rotation, scale, ground, properties={json}...).
  POST ${base}/upload guarda o arquivo (30 min) e devolve a URL <mcp>/blob/<id>/<nome> para usar em import_asset url= ou externals.
  Um .gltf com .bin/texturas separados: import_asset url=... externals:='[{"url":"..."},{"url":"..."}]'.
  Estado/fila/assets: /call/import_status; restaurar/remover: /call/import_manage. Exige ServerStorage.ImportMCP no place. GET ${base}/import mostra mais.

EXPORTAR do place para o seu ambiente (export_file, 2.8.2):
  curl -s -H 'X-Mcp-Agent: meu-agente' -d 'target=game.Workspace.Casa kind=rbxm' ${base}/call/export_file   -> url do .rbxm (SerializationService do Studio)
  curl -s -H 'X-Mcp-Agent: meu-agente' -d 'target=game.Workspace.Arvore kind=obj' ${base}/call/export_file  -> url do .obj (geometria via EditableMesh)
  curl -s -H 'X-Mcp-Agent: meu-agente' -d 'target=game.Workspace.Arvore kind=asset' ${base}/call/export_file -> ids + url dos assets originais (GET ${base}/asset/<id>)
  Depois: curl -fsSL -o casa.rbxm "<url devolvida>"  (expira em 30 min). Scripts (kind=script) ate 64 KB tambem voltam no proprio resultado.

Fluxo eficiente: studio_status -> grep_scripts -> outline_script -> get_script lineStart/lineEnd -> set_script edits -> run_luau para validar.
Ferramentas: ${NOMES_FERRAMENTAS.join(', ')}
`;
}

export function ajudaImportar(base) {
	return `Importar 2D/3D para o Roblox Studio (ImportMCP via MCP)

POST ${base}/import      arquivo binario no corpo (--data-binary @arquivo) OU multipart (-F file=@arquivo) OU JSON {"url":...,"parent":...}
                         + parametros de import_asset na query (?parent=game.Workspace&as=Model&name=X&scale=1&ground=true&properties={...})
                         -> guarda o arquivo no Worker, o Studio baixa e importa, o arquivo temporario e apagado. Resposta: caminho/id/classe.
POST ${base}/upload      so guarda o arquivo (30 min) e devolve id + url (<mcp>/blob/<id>/<nome>) para import_asset url= ou externals.
GET  ${base}/blob/<id>/<nome>   baixa o arquivo guardado; DELETE apaga.
Cabecalho X-Mcp-Agent: <seu-nome> obrigatorio (como nas outras chamadas). ?fileName= define o nome do arquivo quando o corpo e binario.

Exemplos:
  curl -s -H 'X-Mcp-Agent: eu' --data-binary @arvore.glb "${base}/import?parent=game.Workspace&name=Arvore"
  curl -s -H 'X-Mcp-Agent: eu' --data-binary @logo.png "${base}/import?as=Decal&parent=game.Workspace.Parede"
  curl -s -H 'X-Mcp-Agent: eu' -F file=@cena.gltf -F parent=game.Workspace "${base}/import"
  curl -s -H 'X-Mcp-Agent: eu' --data-binary @cena0.bin "${base}/upload?fileName=cena0.bin"   (depois: import_asset externals:='[{"url":"<url devolvida>"}]')
CLI: ./rbx import <arquivo|url> [k=v ...]   |   ./rbx upload <arquivo>
Formatos: PNG, JPG/JPEG, GLB, glTF (com Draco). Limite padrao 40 MiB por arquivo.
`;
}

export function cliPython(base) {
	return `#!/usr/bin/env python3
import json, os, sys, re, urllib.request, urllib.error, urllib.parse, uuid

BASE = os.environ.get("RBX_MCP_URL", ${JSON.stringify(base)}).rstrip("/")
AGENT_FILE = os.path.join(os.environ.get("HOME") or os.environ.get("USERPROFILE") or ".", ".rbx-mcp-agent")

def agente():
    a = os.environ.get("RBX_AGENT") or os.environ.get("MCP_AGENT")
    if a:
        return a
    try:
        a = open(AGENT_FILE).read().strip()
    except OSError:
        a = ""
    if not a:
        a = "cli_" + uuid.uuid4().hex[:10]
        try:
            open(AGENT_FILE, "w").write(a)
        except OSError:
            pass
    return a

PLACE = os.environ.get("RBX_PLACE", "")

def http(method, path, body=None, ctype="text/plain; charset=utf-8", fmt=None):
    url = BASE + path
    if fmt:
        url += ("&" if "?" in url else "?") + "format=" + fmt
    data = body.encode() if isinstance(body, str) else body
    headers = {"Content-Type": ctype, "X-Mcp-Agent": agente(), "Accept": "text/plain, application/json", "User-Agent": "rbx-cli/1.1"}
    if PLACE:
        headers["X-Mcp-Place"] = PLACE
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=float(os.environ.get("RBX_TIMEOUT", "180"))) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except urllib.error.URLError as e:
        return 0, "ERRO REDE: " + str(e.reason)

def saida(status, texto):
    sys.stdout.write(texto if texto.endswith("\\n") else texto + "\\n")
    return 0 if 200 <= status < 300 else 1

HELP = """rbx — Roblox Studio MCP via terminal (URL ja configurada)
  rbx status                          estado do Studio
  rbx tools                           ferramentas e parametros
  rbx schema <tool>                   detalhes de uma ferramenta
  rbx call <tool> [k=v k:=json | '{json}' | @args.json | -]
  rbx grep <texto> [k=v ...]          grep_scripts (target, regex=true, context=N, scriptName=)
  rbx outline <script>                outline_script
  rbx get <script> [lineStart= lineEnd=]   get_script
  rbx tree [target] [depth=N]         get_tree
  rbx luau '<codigo>' | @arq.lua | -  run_luau
  rbx logs [k=v ...]                  get_logs
  rbx import <arquivo|url> [k=v ...]  importa PNG/JPG/GLB/glTF para o place (import_asset via ImportMCP)
  rbx upload <arquivo>                guarda o arquivo no Worker e devolve a URL para import_asset url=/externals
  rbx export <target> [-o arquivo|pasta] [kind=script|rbxm|obj|asset] [k=v ...]
                                      exporta do place: script (.lua), instancia+subarvore (.rbxm real do Studio), malha (.obj) ou baixa os assets originais
  rbx agent                           mostra a identidade usada (RBX_AGENT sobrescreve)
  rbx place [alias|nome|placeId|clear] marca o Studio/place deste agente quando ha varios abertos (studio_select); sem argumento mostra
  --place <alias>                     so para esta chamada (ou RBX_PLACE=<alias>); prevalece sobre a marcacao
  --json                              resposta em JSON bruto
Exemplos:
  rbx call set_script target=game.ServerScriptService.Main edits:='[{"find":"a","replace":"b"}]'
  rbx call get_tree target=game.Workspace depth=2
  rbx import arvore.glb parent=game.Workspace scale=1 ground=true
  rbx import heroi.png as=ImageLabel parent=game.StarterGui.HUD properties:='{"Size":[0,200,0,200]}'
  rbx import https://site/modelo.glb parent=game.Workspace
  rbx export game.Workspace.Casa -o casa.rbxm
  rbx export game.Workspace.Arvore kind=asset -o texturas/
"""

def baixar(url, caminho=None, pasta="."):
    req = urllib.request.Request(url, headers={"X-Mcp-Agent": agente(), "User-Agent": "rbx-cli/1.1"})
    with urllib.request.urlopen(req, timeout=float(os.environ.get("RBX_TIMEOUT", "180"))) as r:
        if caminho is None:
            m = re.search(r'filename="?([^";]+)"?', r.headers.get("Content-Disposition") or "")
            caminho = os.path.join(pasta, m.group(1) if m else urllib.parse.unquote(url.rstrip("/").split("/")[-1].split("?")[0]) or "arquivo.bin")
        with open(caminho, "wb") as f:
            f.write(r.read())
    return caminho, os.path.getsize(caminho)

def exportar(rest, fmt):
    dest = None
    if "-o" in rest:
        i = rest.index("-o")
        if i + 1 >= len(rest): print("uso: rbx export <target> -o <arquivo|pasta>"); return 2
        dest = rest[i + 1]; del rest[i:i + 2]
    if not rest: print("uso: rbx export <target> [-o arquivo|pasta] [kind=script|rbxm|obj|asset] [k=v ...]"); return 2
    target, extra = rest[0], rest[1:]
    status, texto = http("POST", "/call/export_file", " ".join(["target=" + json.dumps(target), "inline=false"] + extra), fmt="json")
    if not 200 <= status < 300 or fmt == "json":
        return saida(status, texto)
    r = json.loads(texto)
    assets = r.get("assets") or []
    if r.get("url"):
        caminho = dest if dest and not os.path.isdir(dest) and os.path.splitext(dest)[1] else os.path.join(dest or ".", r.get("fileName") or "export.bin")
        if os.path.dirname(caminho): os.makedirs(os.path.dirname(caminho), exist_ok=True)
        caminho, n = baixar(r["url"], caminho)
        print("%s %s -> %s (%d bytes%s)" % (r.get("kind"), r.get("path") or target, caminho, n, (", %s instancias" % r["instances"]) if r.get("instances") else (", %s vertices" % r["mesh"]["vertices"]) if r.get("mesh") else ""))
        if assets:
            print("%d asset(s) originais referenciados (meshes/texturas); baixe com: rbx export %s kind=asset -o pasta/" % (len(assets), target))
        return 0
    if assets:
        pasta = dest or "."
        os.makedirs(pasta, exist_ok=True)
        falhas = 0
        for a in assets:
            if not a.get("url"): continue
            try:
                caminho, n = baixar(a["url"], None, pasta)
                print("asset %s %s%s -> %s (%d bytes)" % (a.get("assetId"), a.get("property") or "", (" " + a["path"]) if a.get("path") else "", caminho, n))
            except urllib.error.HTTPError as e:
                falhas += 1
                print("asset %s %s: HTTP %d %s" % (a.get("assetId"), a.get("property") or "", e.code, e.read().decode("utf-8", "replace").strip()[:160]))
        return 1 if falhas and falhas == len(assets) else 0
    return saida(status, texto)

def main(argv):
    global PLACE
    fmt = "json" if "--json" in argv else None
    argv = [a for a in argv if a != "--json"]
    if "--place" in argv:
        i = argv.index("--place")
        if i + 1 >= len(argv): print("uso: --place <alias|nome|placeId>"); return 2
        PLACE = argv[i + 1]; del argv[i:i + 2]
    if not argv or argv[0] in ("help", "-h", "--help"):
        print(HELP); return 0
    cmd, rest = argv[0], argv[1:]
    if cmd == "agent":
        print(agente()); return 0
    if cmd == "place":
        if rest and rest[0] == "clear":
            return saida(*http("POST", "/call/studio_select", "clear=true", fmt=fmt))
        return saida(*http("POST", "/call/studio_select", ("place=" + json.dumps(rest[0])) if rest else "", fmt=fmt))
    if cmd == "status":
        return saida(*http("GET", "/call/studio_status", fmt=fmt))
    if cmd == "tools":
        return saida(*http("GET", "/tools", fmt=fmt))
    if cmd == "schema":
        if not rest: print("uso: rbx schema <tool>"); return 2
        return saida(*http("GET", "/tools/" + rest[0]))
    if cmd == "luau":
        if not rest: print("uso: rbx luau '<codigo>' | @arquivo.lua | -"); return 2
        src = rest[0]
        code = sys.stdin.read() if src == "-" else open(src[1:]).read() if src.startswith("@") else src
        extra = " ".join(rest[1:])
        return saida(*http("POST", "/luau" + ("?" + extra.replace(" ", "&") if extra else ""), code, fmt=fmt))
    if cmd == "export":
        return exportar(list(rest), fmt)
    if cmd in ("import", "upload"):
        if not rest: print("uso: rbx import <arquivo|url> [k=v ...]   |   rbx upload <arquivo>"); return 2
        src, extra = rest[0], rest[1:]
        if cmd == "import" and re.match(r"^https?://", src):
            return saida(*http("POST", "/call/import_asset", " ".join(["url=" + json.dumps(src)] + extra), fmt=fmt))
        if not os.path.isfile(src): print("arquivo nao encontrado: " + src); return 2
        with open(src, "rb") as f:
            data = f.read()
        query = [("fileName", os.path.basename(src))]
        for a in extra:
            m = re.match(r"^([A-Za-z_][\\w.-]*)(:=|=)([\\s\\S]*)$", a)
            if not m: print("argumento invalido: " + a + " (use chave=valor ou chave:=json)"); return 2
            query.append((m.group(1), m.group(3)))
        return saida(*http("POST", "/" + cmd + "?" + urllib.parse.urlencode(query), data, "application/octet-stream", fmt))
    atalhos = {"grep": ("grep_scripts", "pattern"), "outline": ("outline_script", "target"), "get": ("get_script", "target"), "tree": ("get_tree", "target"), "logs": ("get_logs", None), "live": ("livesession_status", None), "verify": ("livesession_verify", None)}
    if cmd in atalhos:
        tool, chave = atalhos[cmd]
        args = list(rest)
        if chave and args and "=" not in args[0]:
            args[0] = chave + "=" + json.dumps(args[0])
        return saida(*http("POST", "/call/" + tool, " ".join(args), fmt=fmt))
    if cmd == "call":
        if not rest: print("uso: rbx call <tool> [args]"); return 2
        tool, args = rest[0], rest[1:]
        if len(args) == 1 and args[0] == "-":
            body, ctype = sys.stdin.read(), "application/json"
        elif len(args) == 1 and args[0].startswith("@"):
            body, ctype = open(args[0][1:]).read(), "application/json"
        elif len(args) == 1 and args[0].lstrip().startswith("{"):
            body, ctype = args[0], "application/json"
        else:
            body, ctype = " ".join(a if re.match(r"^[A-Za-z_][\\w.-]*(:=|=)", a) else json.dumps(a) for a in args), "text/plain; charset=utf-8"
        return saida(*http("POST", "/call/" + tool, body, ctype, fmt))
    print("comando desconhecido: " + cmd + "\\n" + HELP); return 2

if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        sys.exit(130)
`;
}

export function cliBash(base) {
	return `#!/usr/bin/env bash
BASE="\${RBX_MCP_URL:-${base}}"
AGENT_FILE="\${HOME:-.}/.rbx-mcp-agent"
agente() {
  if [ -n "$RBX_AGENT" ]; then echo "$RBX_AGENT"; return; fi
  if [ -s "$AGENT_FILE" ]; then cat "$AGENT_FILE"; return; fi
  a="cli_$(head -c 16 /dev/urandom 2>/dev/null | od -An -tx1 | tr -d ' \\n' | cut -c1-10)"
  [ -z "$a" ] && a="cli_$$$(date +%s)"
  echo "$a" > "$AGENT_FILE" 2>/dev/null; echo "$a"
}
FMT=""; ARGS=(); PLACE="\${RBX_PLACE:-}"; PEGA_PLACE=""
for x in "$@"; do
  if [ -n "$PEGA_PLACE" ]; then PLACE="$x"; PEGA_PLACE=""
  elif [ "$x" = "--json" ]; then FMT="?format=json"
  elif [ "$x" = "--place" ]; then PEGA_PLACE=1
  else ARGS+=("$x"); fi
done
set -- "\${ARGS[@]}"
pede() { # metodo caminho [corpo] [content-type]
  local m="$1" p="$2" b="$3" ct="\${4:-text/plain; charset=utf-8}" code out
  out=$(curl -sS -X "$m" -H "X-Mcp-Agent: $(agente)" -H "X-Mcp-Place: $PLACE" -H "Content-Type: $ct" --data-binary "$b" -w '\\n%{http_code}' "$BASE$p$FMT")
  code="\${out##*$'\\n'}"; printf '%s\\n' "\${out%$'\\n'*}"
  [ "\${code:0:1}" = "2" ]
}
case "\${1:-help}" in
  help|-h|--help) cat <<EOF
rbx — Roblox Studio MCP via terminal (URL ja configurada)
  rbx status | tools | schema <tool> | agent
  rbx place [alias|nome|placeId|clear]   marca o Studio/place deste agente quando ha varios abertos; --place <alias> ou RBX_PLACE= so para a chamada
  rbx call <tool> [k=v k:=json | '{json}']
  rbx grep <texto> [k=v] | outline <script> | get <script> [lineStart= lineEnd=] | tree [target] [depth=N] | logs [k=v]
  rbx live [detail=full]   estado da Sessao Viva (playtest, hot reload, journal)  |  rbx verify targets:='["game.ServerScriptService.Main"]'
  rbx luau '<codigo>' | @arq.lua | -
  rbx import <arquivo|url> [k=v ...]   importa PNG/JPG/GLB/glTF (ImportMCP)  |  rbx upload <arquivo>
  rbx export <target> [-o arquivo|pasta] [kind=script|rbxm|obj|asset] [k=v ...]   exporta script/.rbxm/.obj ou baixa assets originais
  --json  resposta em JSON bruto
EOF
;;
  export) target="$2"; shift 2; dest=""
    if [ "\${1:-}" = "-o" ]; then dest="$2"; shift 2; fi
    out=$(curl -sS -X POST -H "X-Mcp-Agent: $(agente)" -H "X-Mcp-Place: $PLACE" -H "Content-Type: text/plain; charset=utf-8" --data-binary "target=\\"$target\\" inline=false $*" -w '\\n%{http_code}' "$BASE/call/export_file?format=json")
    code="\${out##*$'\\n'}"; body="\${out%$'\\n'*}"
    if [ "\${code:0:1}" != "2" ] || [ -n "$FMT" ]; then printf '%s\\n' "$body"; [ "\${code:0:1}" = "2" ]; exit $?; fi
    url=$(printf '%s' "$body" | grep -o '"url":"[^"]*/blob/[^"]*"' | head -1 | sed 's/^"url":"//; s/"$//')
    nome=$(printf '%s' "$body" | grep -o '"fileName":"[^"]*"' | head -1 | sed 's/^"fileName":"//; s/"$//')
    if [ -n "$url" ]; then
      [ -z "$dest" ] && dest="\${nome:-export.bin}"; [ -d "$dest" ] && dest="$dest/\${nome:-export.bin}"
      curl -fsS -H "X-Mcp-Agent: $(agente)" -o "$dest" "$url" && echo "$target -> $dest ($(wc -c < "$dest" | tr -d ' ') bytes)"
    else
      mkdir -p "\${dest:-.}"
      printf '%s\\n' "$body" | grep -o '"url":"[^"]*/asset/[^"]*"' | sed 's/^"url":"//; s/"$//' | while read -r u; do
        id=$(printf '%s' "$u" | sed 's#.*/asset/\\([0-9]*\\).*#\\1#')
        f=$(cd "\${dest:-.}" && curl -fsS -OJ -H "X-Mcp-Agent: $(agente)" -w '%{filename_effective}' "$u") && echo "asset $id -> \${dest:-.}/$f" || echo "asset $id: falhou (privado de terceiro?)"
      done
    fi ;;
  import|upload) cmd="$1"; src="$2"; shift 2
    if [ "$cmd" = import ] && [[ "$src" =~ ^https?:// ]]; then pede POST /call/import_asset "url=\\"$src\\" $*"; exit $?; fi
    [ -f "$src" ] || { echo "arquivo nao encontrado: $src"; exit 2; }
    q="fileName=$(printf '%s' "$(basename "$src")" | sed 's/ /%20/g; s/&/%26/g')"
    for kv in "$@"; do q="$q&$kv"; done
    [ -n "$FMT" ] && q="$q&format=json"
    out=$(curl -sS -X POST -H "X-Mcp-Agent: $(agente)" -H "Content-Type: application/octet-stream" --data-binary "@$src" -w '\\n%{http_code}' "$BASE/$cmd?$q")
    code="\${out##*$'\\n'}"; printf '%s\\n' "\${out%$'\\n'*}"
    [ "\${code:0:1}" = "2" ] ;;
  agent) agente ;;
  place) if [ "$2" = clear ]; then pede POST /call/studio_select "clear=true"; elif [ -n "$2" ]; then pede POST /call/studio_select "place=\\"$2\\""; else pede POST /call/studio_select ""; fi ;;
  status) pede GET /call/studio_status ;;
  tools) pede GET /tools ;;
  schema) pede GET "/tools/$2" ;;
  luau) shift; src="$1"; shift
    if [ "$src" = "-" ]; then code=$(cat); elif [ "\${src:0:1}" = "@" ]; then code=$(cat "\${src:1}"); else code="$src"; fi
    q=""; [ $# -gt 0 ] && q="?$(printf '%s&' "$@" | sed 's/&$//')"; [ -n "$FMT" ] && q="\${q:-?}\${q:+&}format=json" && FMT=""
    pede POST "/luau$q" "$code" ;;
  grep|outline|get|tree|logs|live|verify) cmd="$1"; shift
    case "$cmd" in grep) tool=grep_scripts; chave=pattern;; outline) tool=outline_script; chave=target;; get) tool=get_script; chave=target;; tree) tool=get_tree; chave=target;; logs) tool=get_logs; chave="";; live) tool=livesession_status; chave="";; verify) tool=livesession_verify; chave="";; esac
    if [ -n "$chave" ] && [ $# -gt 0 ] && [[ "$1" != *=* ]]; then v="$1"; shift; set -- "$chave=\\"$v\\"" "$@"; fi
    pede POST "/call/$tool" "$*" ;;
  call) tool="$2"; shift 2
    if [ $# -eq 1 ] && [ "$1" = "-" ]; then pede POST "/call/$tool" "$(cat)" application/json
    elif [ $# -eq 1 ] && [ "\${1:0:1}" = "@" ]; then pede POST "/call/$tool" "$(cat "\${1:1}")" application/json
    elif [ $# -eq 1 ] && [ "\${1:0:1}" = "{" ]; then pede POST "/call/$tool" "$1" application/json
    else pede POST "/call/$tool" "$*"; fi ;;
  *) echo "comando desconhecido: $1 (rbx help)"; exit 2 ;;
esac
`;
}
