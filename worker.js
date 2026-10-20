import { FERRAMENTAS, INSTRUCOES, MAPA_FERRAMENTAS, NOMES_FERRAMENTAS, FERRAMENTAS_LOCAIS, VERSAO_CATALOGO } from './ferramentas.js';
import { renderizar, renderizarErro } from './formato.js';
import { ajudaTerminal, ajudaImportar, cliPython, cliBash, listarFerramentas, descreverFerramenta, argumentosDeTexto, coagir } from './terminal.js';
import { buscarToolbox, conteudoToolbox } from './toolbox.js';

export const VERSAO = '2.9.0';
const NOME_SERVIDOR = 'roblox-studio-mcp';
const NIVEIS_LOG = new Set(['output', 'info', 'warning', 'error']);
const ROTULO_NIVEL = { output: 'out ', info: 'info', warning: 'warn', error: 'err ' };
const clamp = (v, fallback, min, max) => { const n = Number(v); return Math.max(min, Math.min(max, v == null || !Number.isFinite(n) ? fallback : n)); };
const hora = (t) => { const d = new Date(t); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`; };
const base64ParaBytes = (b64) => { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const PROTOCOLOS = ['2025-06-18', '2025-03-26', '2024-11-05'];

function tipoDoAsset(bytes, contentType = '') {
	const ascii = (n) => String.fromCharCode(...bytes.subarray(0, Math.min(n, bytes.byteLength)));
	const cab = ascii(16);
	if (bytes.byteLength >= 4 && PNG_MAGIC.every((b, i) => bytes[i] === b)) return { tipo: 'image/png', ext: 'png' };
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { tipo: 'image/jpeg', ext: 'jpg' };
	if (cab.startsWith('<roblox!')) return { tipo: 'application/octet-stream', ext: 'rbxm' };
	if (cab.startsWith('<roblox') || /^\s*<\?xml/.test(cab)) return { tipo: 'application/xml; charset=utf-8', ext: 'rbxmx' };
	if (cab.startsWith('version ')) return { tipo: 'application/octet-stream', ext: 'mesh' };
	if (cab.startsWith('OggS')) return { tipo: 'audio/ogg', ext: 'ogg' };
	if (cab.startsWith('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return { tipo: 'audio/mpeg', ext: 'mp3' };
	if (cab.startsWith('RIFF')) return ascii(12).endsWith('WEBP') ? { tipo: 'image/webp', ext: 'webp' } : { tipo: 'audio/wav', ext: 'wav' };
	if (cab.startsWith('glTF')) return { tipo: 'model/gltf-binary', ext: 'glb' };
	if (cab.startsWith('KTX') || cab.startsWith('DDS ')) return { tipo: 'application/octet-stream', ext: cab.startsWith('DDS ') ? 'dds' : 'ktx' };
	const ct = String(contentType || '').split(';')[0].trim();
	if (ct && ct !== 'application/octet-stream') return { tipo: ct, ext: ct.split('/')[1]?.replace(/^x-/, '').slice(0, 8) || 'bin' };
	return { tipo: 'application/octet-stream', ext: 'bin' };
}
const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET,HEAD,POST,DELETE,OPTIONS',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version, Retry-After, X-Rbx-Mcp',
	'Access-Control-Max-Age': '86400',
};
const ignorar = () => {};
const uid = () => crypto.randomUUID();
const locais = new Set(FERRAMENTAS_LOCAIS);
const remotas = NOMES_FERRAMENTAS.filter((n) => !locais.has(n));
const headers = (extra = {}) => ({ ...CORS, 'X-Rbx-Mcp': VERSAO, ...extra });
const jres = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: headers({ 'Content-Type': 'application/json; charset=utf-8', ...extra }) });
const tres = (body, status = 200, extra = {}) => new Response(body, { status, headers: headers({ 'Content-Type': 'text/plain; charset=utf-8', ...extra }) });
const failure = (code, message, extra = {}) => ({ code, message, ...extra });
const idValido = (s) => /^[A-Za-z0-9_-]{6,80}$/.test(s || '');
const agentValido = (s) => typeof s === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/.test(s);
const AJUDA = `Roblox Studio MCP ${VERSAO} — ambiente controlado\n\nMCP:    https://<worker>/mcp/<sessao>/<token>       (GET mostra a ajuda de terminal; POST = Streamable HTTP)\nCLI:    curl -fsSL https://<worker>/mcp/<sessao>/<token>/cli -o rbx && chmod +x rbx && ./rbx status\nREST:   GET .../tools | POST .../call/<ferramenta> | POST .../luau   (cabecalhos X-Mcp-Agent: <seu-nome> e, com varios Studios, X-Mcp-Place: <alias|nome|placeId>)\nImport: POST .../import (arquivo PNG/JPG/GLB/glTF no corpo) | POST .../upload | GET .../blob/<id>/<nome>   (ImportMCP)\nExport: POST .../call/export_file (script .lua, .rbxm, .obj, assets) -> GET .../blob/<id>/<nome> | GET .../asset/<assetId> (asset original)\nPlugin: https://<worker>/ponte/<sessao>/<token>\n\nUma sessao = varios Studios/places (alias s1, s2...) e varios agentes; cada agente marca o seu place com studio_select ou passa place= por chamada. A URL e uma senha: quem a conhece tem permissao de plugin em todos os Studios conectados a ela.\nFerramentas: ${NOMES_FERRAMENTAS.join(', ')}`;

function autorizado(req, url, segredo) {
	const auth = req.headers.get('authorization') || '';
	return (auth.toLowerCase().startsWith('bearer ') && auth.slice(7).trim() === segredo)
		|| req.headers.get('x-rbx-chave') === segredo || url.searchParams.get('chave') === segredo;
}

export function validar(schema, value, path = 'arguments', depth = 0) {
	if (!schema || depth > 30) return depth > 30 ? `${path}: objeto profundo demais` : '';
	const type = schema.type;
	if (type === 'object') {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return `${path}: esperado objeto`;
		for (const name of schema.required || []) if (!Object.hasOwn(value, name)) return `${path}.${name}: obrigatorio`;
		for (const [name, v] of Object.entries(value)) {
			const sub = schema.properties?.[name];
			if (!sub && schema.additionalProperties === false) return `${path}.${name}: argumento desconhecido`;
			const error = sub && validar(sub, v, `${path}.${name}`, depth + 1);
			if (error) return error;
		}
	} else if (type === 'array') {
		if (!Array.isArray(value)) return `${path}: esperada lista`;
		if (schema.minItems != null && value.length < schema.minItems) return `${path}: lista vazia`;
		if (value.length > (schema.maxItems ?? 2000)) return `${path}: lista grande demais`;
		for (let i = 0; i < value.length; i++) { const e = validar(schema.items, value[i], `${path}[${i}]`, depth + 1); if (e) return e; }
	} else if (type === 'string') {
		if (typeof value !== 'string') return `${path}: esperado texto`;
		if (schema.minLength != null && value.length < schema.minLength) return `${path}: texto vazio`;
		if (value.length > (schema.maxLength ?? 1000000)) return `${path}: texto grande demais`;
		if (schema.pattern && !new RegExp(schema.pattern).test(value)) return `${path}: formato invalido`;
	} else if (type === 'integer' || type === 'number') {
		if (typeof value !== 'number' || !Number.isFinite(value) || (type === 'integer' && !Number.isInteger(value))) return `${path}: numero invalido`;
		if (schema.minimum != null && value < schema.minimum) return `${path}: abaixo do minimo`;
		if (schema.maximum != null && value > schema.maximum) return `${path}: acima do maximo`;
	} else if (type === 'boolean' && typeof value !== 'boolean') return `${path}: esperado booleano`;
	if (schema.enum && !schema.enum.includes(value)) return `${path}: opcao invalida`;
	return '';
}

export default {
	async fetch(req, env) {
		try {
			if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers() });
			const url = new URL(req.url), p = url.pathname.split('/').filter(Boolean);
			if (!p.length) return tres(AJUDA);
			if (['saude', 'health'].includes(p[0])) return tres('ok');
			if (p[0] === 'favicon.ico') return new Response(null, { status: 204, headers: headers() });
			if (p[0] === 'ferramentas' && p.length === 1) return jres({ versao: VERSAO, catalogo: VERSAO_CATALOGO, ferramentas: FERRAMENTAS });
			if (!['mcp', 'ponte'].includes(p[0]) || p.length < 3) return tres('Rota desconhecida\n' + AJUDA, 404);
			if (!idValido(p[1]) || !idValido(p[2])) return tres('sessao/token: use 6 a 80 caracteres A-Z a-z 0-9 _ -', 400);
			const segredo = String(env.SEGREDO || '').trim();
			if (segredo && !autorizado(req, url, segredo)) return jres({ error: 'Authorization: Bearer <SEGREDO> obrigatorio' }, 401);
			return await env.SESSOES.get(env.SESSOES.idFromName(p[1] + '/' + p[2])).fetch(req);
		} catch (e) { return jres({ error: String(e?.message || e) }, 500); }
	},
};

export class SessaoStudio {
	constructor(state, env) {
		this.state = state; this.env = env;
		this.fila = []; this.pend = new Map(); this.pollers = [];

		this.pares = new Map(); this.aliasSeq = 0; this.escolhas = new Map(); this.cancelamentos = new Map(); this.cids = new Map();
		this.cliente = '';
		this.stats = { chamadas: 0, ok: 0, erro: 0, expiradas: 0, recusadas: 0, canceladas: 0, desde: Date.now() };

		this.logs = []; this.logSeq = 0; this.logDropped = 0; this.logWaiters = [];

		this.relays = new Map(); this.comandosRelay = new Map(); this.pendRelay = new Map(); this.relayWaiters = [];

		this.testes = new Map();

		this.helperCaptura = null; this.pedidosCaptura = []; this.pendCaptura = new Map(); this.capturaWaiters = []; this.capturas = [];

		this.blobs = new Map();

		this.uploads = new Map();

		this.boot = uid().slice(0, 8);
		this.ready = state.blockConcurrencyWhile(async () => {
			const saved = await state.storage.get('pares');
			if (Array.isArray(saved)) for (const p of saved) if (p?.peer) this.pares.set(p.peer, { ...p, alias: p.alias || this.novoAlias(), ferramentas: Array.isArray(p.ferramentas) ? p.ferramentas : [] });
			this.aliasSeq = Math.max(this.aliasSeq, Number(await state.storage.get('aliasSeq')) || 0);
			const escolhas = await state.storage.get('escolhas');
			if (Array.isArray(escolhas)) for (const [agent, peer] of escolhas) if (typeof agent === 'string' && typeof peer === 'string') this.escolhas.set(agent, peer);
			Object.assign(this.stats, (await state.storage.get('stats')) || {});
			this.logSeq = Number(await state.storage.get('logSeq')) || 0;
		});
	}

	ingerirLogs(ctx, itens, peer = null) {
		const max = this.cfg('LOG_MAX', 5000, 200, 20000);
		let n = 0;
		for (const it of (Array.isArray(itens) ? itens.slice(0, 500) : [])) {
			if (!it || (typeof it.message !== 'string' && typeof it.message !== 'number')) continue;
			const t = Number(it.t);
			this.logs.push({ seq: ++this.logSeq, t: Number.isFinite(t) && t > 0 ? t : Date.now(), ctx, peer, level: NIVEIS_LOG.has(it.level) ? it.level : 'output', message: String(it.message).slice(0, 20000) });
			n++;
		}
		if (this.logs.length > max) { this.logDropped += this.logs.length - max; this.logs.splice(0, this.logs.length - max); }
		if (n) { const w = this.logWaiters; this.logWaiters = []; for (const acordar of w) acordar(); }
		return n;
	}
	marcador(message, level = 'info', peer = null) { this.ingerirLogs('mcp', [{ message, level, t: Date.now() }], peer); }
	aliasDe(peer) { return (peer && this.pares.get(peer)?.alias) || null; }

	rotuloLog(l) { const alias = this.pares.size > 1 ? this.aliasDe(l.peer) : null; return alias ? `${l.ctx}@${alias}` : l.ctx; }

	filtroLogs(a, peerFiltro = null) {
		const contem = a.contains ? String(a.contains).toLowerCase() : '';
		const since = Number.isInteger(a.since) ? a.since : null;
		return (l) => (since == null || l.seq > since)
			&& (!peerFiltro || !l.peer || l.peer === peerFiltro)
			&& (!a.level || a.level === 'all' || l.level === a.level)
			&& (!a.context || a.context === 'all' || l.ctx === a.context || (a.context === 'client' && l.ctx.startsWith('client')))
			&& (!contem || l.message.toLowerCase().includes(contem));
	}

	async pedirBackfill(peerFiltro, limite = 200) {
		const relays = this.relaysOnline(peerFiltro == null ? undefined : peerFiltro).filter((r) => r.ctx === 'edit');
		const timeoutMs = this.cfg('BACKFILL_ESPERA_MS', 4000, 100, 10000);
		if (!relays.length) return null;
		const rs = await Promise.all(relays.map((r) => this.comandoRelay(r, { tipo: 'backfill', limite }, timeoutMs)));
		return { asked: relays.length, answered: rs.filter((r) => r.ok).length, lines: rs.reduce((n, r) => n + (Number(r?.resultado?.lines) || 0), 0) };
	}
	async lerLogs(a = {}, peerFiltro = null, nota = null) {
		const limit = clamp(a.limit, 100, 1, 1000), since = Number.isInteger(a.since) ? a.since : null, passa = this.filtroLogs(a, peerFiltro);
		let sel = this.logs.filter(passa);
		const fim = Date.now() + clamp(a.waitMs, 0, 0, 25000);
		while (!sel.length && Date.now() < fim) {
			await new Promise((resolve) => { const timer = setTimeout(resolve, fim - Date.now()); this.logWaiters.push(() => { clearTimeout(timer); resolve(); }); });
			sel = this.logs.filter(passa);
		}
		const hasMore = sel.length > limit, out = since == null ? sel.slice(-limit) : sel.slice(0, limit);
		const nextSince = out.length ? out[out.length - 1].seq : (since != null ? Math.max(since, this.logSeq) : this.logSeq);
		const gap = since != null && this.logs.length > 0 && this.logs[0].seq > since + 1 && since < this.logSeq;
		const contexts = [...new Set(out.map((l) => this.rotuloLog(l)))];
		const teste = this.testeInfo(peerFiltro ?? this.peerPadraoStatus());
		const meta = { count: out.length, matched: sel.length, hasMore, nextSince, since, gap, dropped: this.logDropped, totalBuffered: this.logs.length, contexts, place: this.aliasDe(peerFiltro) || 'all', studioOnline: !!this.paresOnline().length, test: teste.active ? teste.mode : null, ...(nota || {}) };
		if (a.clear === true) { meta.cleared = this.logs.length; this.logs = []; }
		if (a.format === 'json') return { ...meta, logs: out.map((l) => ({ ...l, studio: this.aliasDe(l.peer) })) };
		const backfill = nota?.backfill ? ` | backfill: ${nota.backfill.answered ? `${nota.backfill.lines} linha(s) reenviadas pelo plugin` : 'pedido ao plugin, sem resposta a tempo (repita em instantes)'}` : '';
		const cab = `# logs: ${out.length} linha(s)${hasMore ? ' (ha mais; continue com since=nextSince)' : ''} | contexto=${a.context || 'all'} nivel=${a.level || 'all'}${a.contains ? ` contem="${a.contains}"` : ''}${this.pares.size > 1 ? ` place=${meta.place}` : ''} | since=${since ?? '-'} nextSince=${nextSince}${gap ? ' | ATENCAO: linhas anteriores ao cursor ja foram descartadas do buffer' : ''} | horario UTC | Studio ${meta.studioOnline ? 'online' : 'offline'}${meta.test ? ` | teste ${meta.test} ativo` : ''}${backfill}${meta.cleared != null ? ` | historico apagado (${meta.cleared})` : ''}`;
		const linhas = out.map((l) => `[${hora(l.t)}] [${this.rotuloLog(l)}] [${ROTULO_NIVEL[l.level] || l.level}] ${l.message}`);
		return { __texto: [cab, ...linhas].join('\n') };
	}

	relaysOnline(peer) {
		const janela = this.cfg('RELAY_JANELA_MS', 12000, 3000, 60000);
		return [...this.relays.values()].filter((r) => !r.encerrado && Date.now() - r.visto <= janela && (peer === undefined || (r.peer || null) === peer));
	}

	associarRelay(b) {
		if (b.ctx === 'edit') {
			if (typeof b.peer === 'string' && this.pares.has(b.peer)) return b.peer;
			const online = this.paresOnline(); return online.length === 1 ? online[0].peer : null;
		}
		const ta = b.testArgs;
		if (ta && typeof ta === 'object' && typeof ta.peer === 'string' && this.pares.has(ta.peer)) return ta.peer;
		const online = this.paresOnline(), pid = Number(b.placeId) || 0, nome = String(b.place || '');
		let c = online.filter((p) => p.placeId === pid);
		if (c.length > 1 && nome) { const n = c.filter((p) => p.lugar === nome); if (n.length) c = n; }
		if (c.length > 1) { const t = c.filter((p) => this.testeDe(p.peer).teste?.ativo); if (t.length) c = t; }
		if (!c.length && online.length === 1) c = online;
		return c.length ? c[0].peer : null;
	}
	registrarRelay(b) {
		if (typeof b.relayId !== 'string' || !/^[A-Za-z0-9_-]{4,80}$/.test(b.relayId)) throw failure('BAD_RELAY', 'relayId invalido.');
		const ctx = ['edit', 'server', 'client'].includes(b.ctx) ? b.ctx : 'client';
		let rel = this.relays.get(b.relayId);
		if (!rel) {
			const peer = this.associarRelay({ ...b, ctx });
			let rotulo = ctx;
			if (ctx === 'client') { const n = this.relaysOnline(peer).filter((r) => r.ctx === 'client' && r.relayId !== b.relayId).length; if (n) rotulo = 'client' + (n + 1); }
			rel = { relayId: b.relayId, ctx, rotulo, peer, entrou: Date.now() };
			this.relays.set(b.relayId, rel);
			if (ctx !== 'edit') {
				const T = this.testeDe(peer), testId = typeof b.testId === 'string' ? b.testId : null;

				const mesmaSessao = T.teste && (T.teste.testId === testId || (!testId && !T.teste.ativo && Date.now() - (T.teste.encerradoEm || 0) < 5000));
				if (!mesmaSessao && (!T.teste || !T.teste.ativo)) T.teste = { ativo: true, modo: 'manual', testId, iniciadoEm: Date.now(), origem: testId ? 'plugin' : 'manual', logsSince: this.logSeq };
				if (T.teste?.ativo) T.teste.viuRelay = true;

				else if (mesmaSessao) rel.encerrado = true;
				this.marcador(`relay ${rotulo} conectado (${String(b.place || '')} placeId=${Number(b.placeId) || 0}${testId ? ` teste=${testId}` : ' sessao iniciada manualmente'})`, 'info', peer);
			}
		} else if (!rel.peer) rel.peer = this.associarRelay({ ...b, ctx });
		rel.visto = Date.now(); rel.placeId = Number(b.placeId) || 0; rel.place = String(b.place || '').slice(0, 120); rel.testId = typeof b.testId === 'string' ? b.testId : rel.testId || null;
		for (const [id, r] of this.relays) if (Date.now() - r.visto > 10 * 60 * 1000) this.relays.delete(id);
		return rel;
	}
	comandoRelay(rel, comando, timeoutMs) {
		const id = uid(), cmd = { id, ...comando }, chave = rel.relayId;
		return new Promise((resolve) => {
			const timer = setTimeout(() => { this.pendRelay.delete(id); const fila = this.comandosRelay.get(chave); if (fila) this.comandosRelay.set(chave, fila.filter((c) => c.id !== id)); resolve({ ok: false, erro: failure('RELAY_TIMEOUT', `O DataModel ${rel.rotulo} nao respondeu em ${Math.round(timeoutMs / 1000)}s. A sessao pode ter encerrado; confira studio_play status.`, { executionUnknown: true }) }); }, timeoutMs);
			this.pendRelay.set(id, { resolve, timer, relayId: chave });
			const fila = this.comandosRelay.get(chave) || []; fila.push(cmd); this.comandosRelay.set(chave, fila);
			for (const w of [...this.relayWaiters]) if (w.relayId === chave) this.finalizarRelayWait(w, this.retirarComandos(chave));
		});
	}
	retirarComandos(relayId) { const fila = this.comandosRelay.get(relayId) || []; this.comandosRelay.set(relayId, []); return fila; }
	finalizarRelayWait(w, comandos) {
		const i = this.relayWaiters.indexOf(w); if (i >= 0) this.relayWaiters.splice(i, 1);
		clearTimeout(w.timer); w.signal?.removeEventListener('abort', w.abort); w.resolve(comandos);
	}
	absorverResultadosRelay(itens) {
		let n = 0;
		for (const it of (Array.isArray(itens) ? itens.slice(0, 100) : [])) {
			const p = this.pendRelay.get(it?.id); if (!p) continue;
			clearTimeout(p.timer); this.pendRelay.delete(it.id); p.resolve({ ok: it.ok !== false, resultado: it.resultado, erro: it.erro }); n++;
		}
		return n;
	}
	async rotaRelay(req, b) {
		const rel = this.registrarRelay(b);
		if (b.teste && typeof b.teste === 'object') this.atualizarTeste(b.teste, rel.peer);
		const aceitos = this.ingerirLogs(rel.rotulo, b.logs, rel.peer);
		if (Number(b.descartados) > 0) this.marcador(`relay ${rel.rotulo} descartou ${Number(b.descartados)} linha(s) por excesso local`, 'warning', rel.peer);
		if (Number(b.backfill) > 0) this.marcador(`relay ${rel.rotulo} reenviou ${Number(b.backfill)} linha(s) do historico do Output (backfill)`, 'info', rel.peer);
		this.absorverResultadosRelay(b.resultados);
		let comandos = this.retirarComandos(rel.relayId);
		const wait = clamp(b.wait, 0, 0, 8000);
		if (!comandos.length && wait > 0) {
			comandos = await new Promise((resolve) => {
				const w = { relayId: rel.relayId, resolve, timer: null, signal: req.signal, abort: null };
				w.abort = () => this.finalizarRelayWait(w, []);
				w.timer = setTimeout(w.abort, wait); this.relayWaiters.push(w);
				req.signal?.addEventListener('abort', w.abort, { once: true });
				if (req.signal?.aborted) w.abort();
			});
		}
		if (rel.ctx !== 'edit' && this.relays.get(rel.relayId)) this.relays.get(rel.relayId).visto = Date.now();
		return jres({ ok: true, ctx: rel.rotulo, aceitos, comandos, esperaMs: 5000, studio: this.aliasDe(rel.peer), boot: this.boot });
	}

	testeDe(peer) {
		const chave = peer || '_';
		let T = this.testes.get(chave);
		if (!T) { T = { teste: null, testeStudio: null }; this.testes.set(chave, T); }
		return T;
	}
	atualizarTeste(estado, peer = null) {
		const T = this.testeDe(peer);
		T.testeStudio = { ...estado, em: Date.now() };
		const id = typeof estado.testId === 'string' ? estado.testId : null;
		if (estado.active === true && id && (!T.teste || T.teste.testId !== id)) {
			T.teste = { ativo: true, modo: String(estado.mode || 'play'), testId: id, iniciadoEm: Number(estado.startedAt) || Date.now(), agente: estado.agent || null, origem: 'mcp', logsSince: this.logSeq };
			this.marcador(`teste ${T.teste.modo} iniciado (${id})${T.teste.agente ? ` por ${T.teste.agente}` : ''}`, 'info', peer);
		} else if (estado.active === true && id && T.teste.testId === id && T.teste.modo === 'manual') {

			T.teste.modo = String(estado.mode || 'play'); T.teste.agente = estado.agent || null; T.teste.origem = 'mcp';
		} else if (estado.active === false && T.teste?.ativo && (!id || T.teste.testId === id || T.teste.modo === 'manual')) {
			this.encerrarTeste(T, peer, { encerradoEm: Number(estado.endedAt) || Date.now(), resultado: estado.result, erro: estado.error || null, origem: estado.endedBy ? `plugin/${estado.endedBy}` : 'plugin' });
		}
	}
	encerrarTeste(T, peer, { encerradoEm = Date.now(), resultado, erro = null, origem = 'worker' } = {}) {
		const t = T.teste; if (!t?.ativo) return;
		t.ativo = false; t.encerradoEm = encerradoEm; t.resultado = resultado; t.erro = erro;
		this.marcador(`teste ${t.modo} encerrado (${t.testId || 'manual'}; ${origem})${erro ? ` com erro: ${erro}` : ''}${resultado !== undefined ? ` resultado=${JSON.stringify(resultado)}` : ''}`, erro ? 'error' : 'info', peer);

		for (const [rid, r] of this.relays) if (r.ctx !== 'edit' && (r.peer || null) === (peer || null)) { this.relays.delete(rid); for (const w of [...this.relayWaiters]) if (w.relayId === rid) this.finalizarRelayWait(w, []); }
	}

	studioNoEditor(s) {
		if (!s) return null;
		if (s.editModeActive === true) return true;
		if (s.editModeActive === false || s.runService?.isRunning === true || s.runService?.isEdit === false) return false;
		if (s.mode === 'run' && s.runService?.isEdit === true) return true;
		return null;
	}

	peerPadraoStatus() { const online = this.paresOnline(); return online.length === 1 ? online[0].peer : null; }
	testeInfo(peer = null) {
		const T = this.testeDe(peer);
		const relays = this.relaysOnline(peer).filter((r) => r.ctx !== 'edit').map((r) => ({ ctx: r.rotulo, place: r.place, placeId: r.placeId, testId: r.testId, secondsSinceContact: Math.round((Date.now() - r.visto) / 1000) }));
		const t = T.teste, s = T.testeStudio, sFresco = s && Date.now() - s.em < 120000 ? s : null;
		const noEditor = this.studioNoEditor(sFresco);
		const graca = this.cfg('TESTE_GRACA_MS', 15000, 3000, 120000);

		if (t?.ativo && !relays.length && Date.now() - t.iniciadoEm > graca && noEditor !== false) {
			if (noEditor === true) this.encerrarTeste(T, peer, { resultado: 'stopped_in_studio', origem: 'worker/editor' });
			else if (t.viuRelay) this.encerrarTeste(T, peer, { resultado: 'stopped_in_studio', origem: 'worker/relays da sessao sairam' });
			else if (t.modo === 'manual' && Date.now() - t.iniciadoEm > 20000 && sFresco?.active !== true) this.encerrarTeste(T, peer, { origem: 'worker/relays sem contato' });
		}

		const encerradaAqui = !!(t && !t.ativo && sFresco?.testId && t.testId === sFresco.testId);
		const ativoPlugin = !!(sFresco && (noEditor === false || (sFresco.active === true && noEditor !== true && !encerradaAqui)));
		const active = !!(t?.ativo) || ativoPlugin || relays.length > 0;
		return { active, place: this.aliasDe(peer), mode: t?.modo || (ativoPlugin ? (sFresco.runService?.isRunMode ? 'run' : 'play') : null), testId: t?.testId || null, startedAt: t?.iniciadoEm || null, endedAt: t?.ativo ? null : t?.encerradoEm || null, agent: t?.agente || null, result: t?.ativo ? undefined : t?.resultado, error: t?.ativo ? null : t?.erro || null, logsSince: t?.logsSince ?? null, relays, studio: sFresco ? { active: sFresco.active, mode: sFresco.mode, runService: sFresco.runService, editModeActive: sFresco.editModeActive, api: sFresco.api } : null, liveSession: sFresco?.liveSession && typeof sFresco.liveSession === 'object' ? sFresco.liveSession : null };
	}
	async esperar(condicao, ms, passo = 200) {
		const fim = Date.now() + ms;
		while (Date.now() < fim) { if (condicao()) return true; await new Promise((r) => setTimeout(r, Math.min(passo, Math.max(1, fim - Date.now())))); }
		return condicao();
	}
	async controlarTeste(args, actor, executarNoPlugin, peer = null) {
		const acao = args.action || 'status', waitMs = clamp(args.waitMs, acao === 'status' ? 0 : 10000, 0, 25000);
		const servidor = () => this.relaysOnline(peer).find((r) => r.ctx === 'server');
		const info$ = () => this.testeInfo(peer);
		const dica = (info) => info.active
			? `Leia os logs desta sessao com get_logs since=${info.logsSince ?? 0}${info.relays.length ? ' context=server (ou client)' : ''} e waitMs para acompanhar; run_luau context=server inspeciona o servidor; studio_play stop encerra.`
			: `Nenhuma sessao ativa. studio_play action=play inicia Play Solo; action=run inicia so o servidor no editor.`;
		if (acao === 'status') return { action: 'status', ...info$(), hint: dica(info$()) };
		if (acao === 'reset') {

			const T = this.testeDe(peer), anterior = T.teste?.ativo ? { mode: T.teste.modo, testId: T.teste.testId, startedAt: T.teste.iniciadoEm } : null;
			this.encerrarTeste(T, peer, { erro: 'sessao descartada por studio_play reset', origem: `reset por ${actor.agent}` });
			for (const [rid, r] of this.relays) if (r.ctx !== 'edit' && (r.peer || null) === (peer || null)) this.relays.delete(rid);
			const plugin = await executarNoPlugin();
			if (plugin?.ok && plugin.resultado) this.atualizarTeste(plugin.resultado, peer);
			const info = info$();
			return { action: 'reset', ...info, discarded: anterior, plugin: plugin?.ok ? plugin.resultado : undefined, pluginError: plugin?.ok ? undefined : plugin?.erro, hint: info.active ? 'O Studio ainda reporta simulacao em andamento; pare pelo Studio ou use studio_play stop.' : 'Estado limpo. studio_play action=play inicia uma nova sessao.' };
		}
		if ((acao === 'pause' || acao === 'resume') && servidor()) {
			const r = await this.comandoRelay(servidor(), { tipo: acao, agent: actor.agent }, Math.min(waitMs || 8000, 20000) + 2000);
			if (!r.ok) throw r.erro;
			return { action: acao, ...info$(), relayResult: r.resultado, hint: dica(info$()) };
		}
		if (acao === 'stop') {
			const infoAntes = info$();
			const promessas = [executarNoPlugin()];
			if (servidor()) promessas.push(this.comandoRelay(servidor(), { tipo: 'endTest', valor: 'mcp_stop', agent: actor.agent }, 8000));
			const [plugin, relay] = await Promise.all(promessas);
			if (!plugin?.ok) throw plugin?.erro || failure('STUDIO_ERROR', 'Erro desconhecido no Studio.');
			await this.esperar(() => !info$().active, waitMs, 250);
			const info = info$();
			this.marcador(`studio_play stop por ${actor.agent}: ${info.active ? 'sessao ainda ativa' : 'sessao encerrada'}`, 'info', peer);
			return { action: 'stop', ...info, stopped: !info.active, plugin: plugin.resultado, relayResult: relay?.resultado, relayError: relay && !relay.ok ? relay.erro : undefined, logsSinceBefore: infoAntes.logsSince, hint: info.active ? 'A sessao ainda aparece ativa; repita studio_play stop ou pare pelo Studio. Se for Play Solo iniciado manualmente, o encerramento depende do relay do servidor. Se o Studio ja esta no editor e o estado ficou preso, use studio_play action=reset.' : `Sessao encerrada. Confira get_logs since=${infoAntes.logsSince ?? 0} level=error para ver se algo quebrou.` };
		}
		const logsSince = this.logSeq;
		const plugin = await executarNoPlugin();
		if (!plugin?.ok) throw plugin?.erro || failure('STUDIO_ERROR', 'Erro desconhecido no Studio.');
		const estado = plugin.resultado || {};
		if (estado.testId && estado.active) this.atualizarTeste(estado, peer);
		const T = this.testeDe(peer);
		if (T.teste && T.teste.testId === estado.testId) T.teste.logsSince = Math.min(T.teste.logsSince ?? logsSince, logsSince);
		if (acao === 'play' || acao === 'multiplayer') await this.esperar(() => !!servidor() || !info$().active, waitMs, 250);
		const info = info$();
		const semRelay = (acao === 'play' || acao === 'multiplayer') && !servidor();
		return { action: acao, ...info, logsSince: info.logsSince ?? logsSince, plugin: estado, serverRelayConnected: !!servidor(), hint: semRelay ? `A sessao foi pedida ao Studio, mas o servidor ainda nao se apresentou em ${Math.round(waitMs / 1000)}s. O plugin precisa estar habilitado tambem durante o play test (plugins locais carregam no servidor/cliente automaticamente). Consulte studio_play status e get_logs since=${logsSince}.` : dica(info) };
	}

	helperCapturaOnline() { return !!(this.helperCaptura && Date.now() - this.helperCaptura.visto <= this.cfg('CAPTURA_JANELA_MS', 40000, 5000, 120000)); }
	async rotaCapturaPoll(req, b) {
		if (typeof b.helper !== 'string' || !/^[A-Za-z0-9_-]{4,80}$/.test(b.helper)) throw failure('BAD_HELPER', 'helper invalido.');
		this.helperCaptura = { id: b.helper, nome: String(b.nome || '').slice(0, 80), so: String(b.so || '').slice(0, 40), versao: String(b.versao || '').slice(0, 20), visto: Date.now() };
		let pedidos = this.pedidosCaptura.splice(0);
		const wait = clamp(b.wait, 0, 0, 25000);
		if (!pedidos.length && wait > 0) {
			pedidos = await new Promise((resolve) => {
				const w = { resolve, timer: null, signal: req.signal, abort: null };
				const fim = (lista) => { const i = this.capturaWaiters.indexOf(w); if (i >= 0) this.capturaWaiters.splice(i, 1); clearTimeout(w.timer); req.signal?.removeEventListener('abort', w.abort); resolve(lista); };
				w.fim = fim; w.abort = () => fim([]); w.timer = setTimeout(w.abort, wait); this.capturaWaiters.push(w);
				req.signal?.addEventListener('abort', w.abort, { once: true });
				if (req.signal?.aborted) w.abort();
			});
		}
		if (this.helperCaptura) this.helperCaptura.visto = Date.now();
		return jres({ ok: true, pedidos, esperaMs: 20000 });
	}
	rotaCapturaEnviar(b) {
		const p = this.pendCaptura.get(b.id);
		if (!p) return jres({ ok: false, erro: 'pedido desconhecido ou expirado' }, 404);
		clearTimeout(p.timer); this.pendCaptura.delete(b.id);
		if (b.erro) { p.resolve({ ok: false, erro: failure('CAPTURE_FAILED', String(b.erro).slice(0, 500)) }); return jres({ ok: true }); }
		if (typeof b.png !== 'string' || b.png.length < 16 || b.png.length > 9000000) { p.resolve({ ok: false, erro: failure('CAPTURE_FAILED', 'PNG ausente ou grande demais.') }); return jres({ ok: false }, 400); }
		let bytes; try { bytes = base64ParaBytes(b.png); } catch { p.resolve({ ok: false, erro: failure('CAPTURE_FAILED', 'base64 invalido.') }); return jres({ ok: false }, 400); }
		if (!PNG_MAGIC.every((v, i) => bytes[i] === v)) { p.resolve({ ok: false, erro: failure('CAPTURE_FAILED', 'O helper enviou algo que nao e PNG.') }); return jres({ ok: false }, 400); }
		const cap = { id: b.id, criadoEm: Date.now(), largura: Number(b.largura) || 0, altura: Number(b.altura) || 0, bytes: bytes.length, janela: String(b.janela || ''), png: b.png };
		this.capturas.push(cap); while (this.capturas.length > this.cfg('CAPTURA_MAX', 5, 1, 20)) this.capturas.shift();
		p.resolve({ ok: true, captura: cap });
		return jres({ ok: true });
	}
	async capturar(args, actor, url) {
		if (!this.helperCapturaOnline()) throw failure('CAPTURE_HELPER_OFFLINE', 'Nenhum helper de captura conectado a esta sessao. Nenhuma API de plugin le pixels da janela do Studio; na maquina do Studio execute captura/captura-studio.cmd (Windows) com a URL desta sessao e repita. As outras ferramentas nao dependem disso.', { nothingExecuted: true, helper: this.helperCaptura ? { nome: this.helperCaptura.nome, secondsSinceContact: Math.round((Date.now() - this.helperCaptura.visto) / 1000) } : null });
		const id = 'c_' + uid().slice(0, 8), waitMs = clamp(args.waitMs, 15000, 1000, 25000);
		const pedido = { id, janela: args.window === 'screen' ? 'screen' : 'studio', maxWidth: clamp(args.maxWidth, 1600, 320, 3840), agent: actor?.agent || null, criadoEm: Date.now() };
		const resultado = await new Promise((resolve) => {
			const timer = setTimeout(() => { this.pendCaptura.delete(id); this.pedidosCaptura = this.pedidosCaptura.filter((p) => p.id !== id); resolve({ ok: false, erro: failure('CAPTURE_TIMEOUT', `O helper nao devolveu a captura em ${Math.round(waitMs / 1000)}s. Confira se a janela do helper continua aberta na maquina do Studio.`) }); }, waitMs);
			this.pendCaptura.set(id, { resolve, timer });
			this.pedidosCaptura.push(pedido);
			const w = this.capturaWaiters.shift(); if (w) w.fim(this.pedidosCaptura.splice(0));
		});
		if (!resultado.ok) throw resultado.erro;
		const cap = resultado.captura, link = url ? `${url.origin}${url.pathname.replace(/\/+$/, '')}/captura/${cap.id}.png` : null;
		this.marcador(`captura ${cap.id} (${cap.largura}x${cap.altura}, ${cap.bytes} bytes) por ${actor?.agent || 'agente'}`);
		return { __conteudo: [{ type: 'image', data: cap.png, mimeType: 'image/png' }, { type: 'text', text: JSON.stringify({ id: cap.id, width: cap.largura, height: cap.altura, bytes: cap.bytes, window: cap.janela, url: link, helper: this.helperCaptura?.nome || null, capturedAt: new Date(cap.criadoEm).toISOString() }) }] };
	}
	servirCaptura(id) {
		const cap = this.capturas.find((c) => c.id === id);
		if (!cap) return tres('captura nao encontrada (o Worker guarda apenas as ultimas capturas em memoria)', 404);
		return new Response(base64ParaBytes(cap.png), { headers: headers({ 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' }) });
	}
	cfg(name, fallback, min, max) {
		const value = this.env?.[name]; const n = Number(value);
		return Math.max(min, Math.min(max, value == null || value === '' || !Number.isFinite(n) ? fallback : n));
	}
	controlConfig() {
		return { readGraceSeconds: this.cfg('TRAVA_LEITURA_GRACA_S', 8, 1, 300), manualSeconds: this.cfg('TRAVA_MANUAL_S', 120, 5, 900), maxManualSeconds: this.cfg('TRAVA_MAX_S', 900, 5, 900) };
	}
	salvar() {
		const promise = this.state.storage.put({ pares: [...this.pares.values()], aliasSeq: this.aliasSeq, escolhas: [...this.escolhas.entries()].slice(-500), stats: this.stats, logSeq: this.logSeq }).catch(ignorar);
		this.state.waitUntil?.(promise);
	}
	novoAlias() { return 's' + (++this.aliasSeq); }
	paresOnline() {
		const window = this.cfg('JANELA_PAR_MS', 90000, 5000, 300000);
		return [...this.pares.values()].filter((p) => Date.now() - p.visto <= window).sort((a, b) => a.alias.localeCompare(b.alias, undefined, { numeric: true }));
	}
	registrarPar(b) {
		if (!b || typeof b.peer !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(b.peer)) throw failure('BAD_PEER', 'Informe um peer valido.');
		if (Number(b.controle?.version) !== 1) throw failure('PLUGIN_UPDATE_REQUIRED', `Ambiente controlado exige o plugin ${VERSAO} ou compativel. Atualize Worker E plugin; operacoes nao foram liberadas.`);
		let par = this.pares.get(b.peer);
		const lugar = String(b.lugar || par?.lugar || '').slice(0, 120), placeId = Number(b.placeId || par?.placeId || 0);
		if (!par) {
			const janela = this.cfg('JANELA_PAR_MS', 90000, 5000, 300000);

			const antigo = [...this.pares.values()].find((p) => Date.now() - p.visto > janela && p.placeId === placeId && p.lugar === lugar);
			if (!antigo && this.paresOnline().length >= this.cfg('MAX_STUDIOS', 8, 1, 32)) throw failure('TOO_MANY_STUDIOS', `Esta sessao ja tem ${this.paresOnline().length} Studios conectados (MAX_STUDIOS). Feche um deles ou use outra sessao/token.`);
			let alias;
			if (antigo) {
				alias = antigo.alias; this.pares.delete(antigo.peer); this.testes.delete(antigo.peer);
				for (const [agent, peer] of this.escolhas) if (peer === antigo.peer) this.escolhas.set(agent, b.peer);
				for (const { ev } of [...this.pend.values()]) if (ev.peer === antigo.peer) this.cancelarEvento(ev, 'STUDIO_DISCONNECTED', 'Studio reconectou com outra identidade.');
				for (const l of this.logs) if (l.peer === antigo.peer) l.peer = b.peer;
				for (const r of this.relays.values()) if (r.peer === antigo.peer) r.peer = b.peer;
			} else alias = this.novoAlias();
			par = { peer: b.peer, alias, entrou: Date.now(), ferramentas: [] };
			this.pares.set(b.peer, par);
			this.marcador(`studio ${alias} conectado: ${lugar || '(sem nome)'} placeId=${placeId}${antigo ? ' (reconexao)' : ''}`, 'info', b.peer);

			for (const [peer, p] of this.pares) if (peer !== b.peer && Date.now() - p.visto > 24 * 3600 * 1000) { this.pares.delete(peer); this.testes.delete(peer); }
		}
		Object.assign(par, { lugar, placeId, versaoPlugin: String(b.versao || par.versaoPlugin || '').slice(0, 20), studio: String(b.studio || par.studio || '').slice(0, 40), ferramentas: Array.isArray(b.ferramentas) ? b.ferramentas.slice(0, 100) : par.ferramentas || [], controle: b.controle, visto: Date.now() });
		return par;
	}
	validarPeer(peer) { return typeof peer === 'string' && this.pares.has(peer); }

	resumoStudio(p) { return `${p.alias}=${p.lugar || '(sem nome)'}${p.placeId ? ` placeId=${p.placeId}` : ''}`; }
	listaStudios(lista) { return lista.map((p) => this.resumoStudio(p)).join('; ') || '(nenhum)'; }
	studioJson(p, agent = null) {
		return { alias: p.alias, peer: p.peer, place: p.lugar, placeId: p.placeId, versaoPlugin: p.versaoPlugin, studio: p.studio, segundosDesdeOContato: Math.round((Date.now() - p.visto) / 1000), ferramentasDoPlugin: p.ferramentas.length, ferramentasFaltando: remotas.filter((n) => !p.ferramentas.includes(n)), controle: p.controle, selected: !!agent && this.escolhas.get(agent) === p.peer, test: this.testeInfo(p.peer) };
	}

	encontrarStudio(seletor, lista = this.paresOnline()) {
		const s = String(seletor).trim(), sl = s.toLowerCase();
		if (!s) throw failure('PLACE_NOT_FOUND', 'Seletor de place vazio.', { nothingExecuted: true });
		let m = lista.filter((p) => p.alias.toLowerCase() === sl || p.peer === s);
		if (!m.length && /^\d+$/.test(s)) m = lista.filter((p) => String(p.placeId) === s);
		if (!m.length) m = lista.filter((p) => p.lugar.toLowerCase() === sl);
		if (!m.length) m = lista.filter((p) => p.lugar.toLowerCase().includes(sl));
		if (m.length === 1) return m[0];
		if (!m.length) throw failure('PLACE_NOT_FOUND', `Nenhum Studio conectado corresponde a "${s}". Online: ${this.listaStudios(lista)}. Use o alias (s1, s2...), o nome do place ou o placeId; studio_status lista tudo.`, { nothingExecuted: true, studios: lista.map((p) => this.studioJson(p)) });
		throw failure('PLACE_AMBIGUOUS', `"${s}" corresponde a mais de um Studio: ${this.listaStudios(m)}. Use o alias (s1, s2...) ou o peer.`, { nothingExecuted: true, studios: m.map((p) => this.studioJson(p)) });
	}

	resolverStudio(actor, args = {}, ctx = null) {
		const online = this.paresOnline();
		if (!online.length) throw failure('STUDIO_OFFLINE', `Nenhum Studio conectado. Abra o place correto e conecte o plugin ${VERSAO} com esta mesma URL.`, { nothingExecuted: true });
		const explicito = args.place != null && String(args.place).trim() !== '' ? String(args.place) : (ctx?.place || '');
		if (explicito) return this.encontrarStudio(explicito, online);
		const marcado = actor ? this.escolhas.get(actor.agent) : null;
		if (marcado) {
			const p = this.pares.get(marcado);
			if (p && online.includes(p)) return p;
			throw failure('PLACE_OFFLINE', `O place marcado para ${actor.agent} (${p ? this.resumoStudio(p) : marcado}) nao esta mais conectado. Online: ${this.listaStudios(online)}. Reconecte o plugin nele, troque com studio_select place=<alias> ou passe place= nesta chamada; nao ha failover automatico entre places.`, { nothingExecuted: true, studios: online.map((q) => this.studioJson(q)) });
		}
		if (online.length === 1) return online[0];
		throw failure('PLACE_REQUIRED', `Ha ${online.length} Studios conectados nesta sessao: ${this.listaStudios(online)}. Informe place=<alias|nome|placeId> nesta chamada ou marque o seu uma vez com studio_select place=<alias>${actor ? ` (vale para o agent ${actor.agent} daqui em diante)` : ''}.`, { nothingExecuted: true, studios: online.map((q) => this.studioJson(q)) });
	}

	studioImplicito(actor, args = {}, ctx = null) {
		const explicito = args.place != null && String(args.place).trim() !== '' ? String(args.place) : (ctx?.place || '');
		if (explicito.toLowerCase() === 'all') return null;
		if (explicito) return this.encontrarStudio(explicito, this.paresOnline());
		const marcado = actor ? this.pares.get(this.escolhas.get(actor.agent)) : null;
		if (marcado) return marcado;
		const online = this.paresOnline();
		return online.length === 1 ? online[0] : null;
	}
	selecionarStudio(actor, args) {
		const online = this.paresOnline();
		if (args.clear === true) { const havia = this.escolhas.get(actor.agent); this.escolhas.delete(actor.agent); return { agent: actor.agent, selected: null, cleared: !!havia, studios: online.map((p) => this.studioJson(p, actor.agent)), hint: online.length > 1 ? 'Sem marcacao: passe place= em cada chamada ou marque de novo com studio_select.' : 'Com um so Studio online a escolha e automatica.' }; }
		if (args.place != null && String(args.place).trim() !== '') {
			const p = this.encontrarStudio(String(args.place), online);
			this.escolhas.set(actor.agent, p.peer);
			this.marcador(`agente ${actor.agent} marcou o place ${p.alias} (${p.lugar})`, 'info', p.peer);
			return { agent: actor.agent, selected: this.studioJson(p, actor.agent), studios: online.map((q) => this.studioJson(q, actor.agent)), hint: `Chamadas de ${actor.agent} vao para ${p.alias} (${p.lugar}) ate studio_select clear=true ou outra marcacao; place= numa chamada prevalece so nela.` };
		}
		const atual = this.pares.get(this.escolhas.get(actor.agent));
		return { agent: actor.agent, selected: atual ? this.studioJson(atual, actor.agent) : null, selectedOnline: !!atual && online.includes(atual), studios: online.map((q) => this.studioJson(q, actor.agent)), hint: atual ? (online.includes(atual) ? `Marcado: ${atual.alias} (${atual.lugar}).` : `Marcado ${atual.alias} (${atual.lugar}), mas esta OFFLINE; troque com studio_select place=<alias>.`) : online.length > 1 ? `Nada marcado. Escolha com studio_select place=<alias>: ${this.listaStudios(online)}.` : online.length === 1 ? `Nada marcado; com um so Studio online (${online[0].alias}) a escolha e automatica.` : 'Nenhum Studio online.' };
	}
	estadoJson(agent = null, foco = null) {
		const peers = this.paresOnline();
		const escolhido = agent ? this.pares.get(this.escolhas.get(agent)) : null;
		const alvo = foco || (escolhido && peers.includes(escolhido) ? escolhido : null) || (peers.length === 1 ? peers[0] : null);
		return { servidor: NOME_SERVIDOR + ' ' + VERSAO, catalogo: VERSAO_CATALOGO, studioOnline: !!peers.length, studiosOnline: peers.length, agent,
			selected: escolhido ? { alias: escolhido.alias, place: escolhido.lugar, placeId: escolhido.placeId, online: peers.includes(escolhido) } : null,
			controle: { enabled: true, ...this.controlConfig(), enforcement: 'plugin', runLuau: 'free-validation', executor: 'concurrent-limited', multiPlace: true, identityHint: 'Agentes na mesma conexao devem usar agent_open e passar agent em cada chamada.', placeHint: peers.length > 1 ? 'Varios Studios online: passe place=<alias|nome|placeId> ou marque o seu com studio_select.' : 'Com um so Studio online a escolha do place e automatica.' },
			studios: peers.map((p) => this.studioJson(p, agent)),
			clienteMcp: this.cliente, filaEsperando: this.fila.length, emExecucao: this.pend.size, longPollsAbertos: this.pollers.length, ferramentas: NOMES_FERRAMENTAS.length, estatisticas: { ...this.stats },
			logs: { total: this.logs.length, seq: this.logSeq, dropped: this.logDropped, byContext: this.logs.reduce((acc, l) => { const k = this.rotuloLog(l); acc[k] = (acc[k] || 0) + 1; return acc; }, {}), hint: 'get_logs since=<nextSince> waitMs=10000 acompanha em tempo real; context=server/client filtra a sessao de teste; place=<alias> ou all escolhe o Studio.' },
			test: this.testeInfo(alvo ? alvo.peer : null),
			relays: this.relaysOnline().map((r) => ({ ctx: r.rotulo, studio: this.aliasDe(r.peer), place: r.place, placeId: r.placeId, testId: r.testId, secondsSinceContact: Math.round((Date.now() - r.visto) / 1000) })),
			screenshot: { helperOnline: this.helperCapturaOnline(), helper: this.helperCaptura ? { nome: this.helperCaptura.nome, so: this.helperCaptura.so, versao: this.helperCaptura.versao, secondsSinceContact: Math.round((Date.now() - this.helperCaptura.visto) / 1000) } : null, recent: this.capturas.map((c) => ({ id: c.id, width: c.largura, height: c.altura, bytes: c.bytes, capturedAt: new Date(c.criadoEm).toISOString() })), hint: this.helperCapturaOnline() ? 'studio_screenshot disponivel.' : 'Para studio_screenshot, rode captura/captura-studio.cmd na maquina do Studio com a URL desta sessao.' },
			dica: peers.length > 1 ? `Studios online: ${this.listaStudios(peers)}. ${escolhido && peers.includes(escolhido) ? `Suas chamadas vao para ${escolhido.alias}.` : 'Marque o seu com studio_select place=<alias> ou passe place= em cada chamada.'}` : peers.length ? 'Studio conectado; consulte file_locks para travas em tempo real e studio_play status para a sessao de teste.' : `Abra o place correto e conecte o plugin ${VERSAO} com esta mesma URL.` };
	}
	retirarDaFila(id) { this.fila = this.fila.filter((ev) => ev.reqId !== id); }
	cancelarEvento(ev, code, reason) {
		const p = this.pend.get(ev.reqId);
		if (!p) return false;
		this.pend.delete(ev.reqId); clearTimeout(p.timer); this.retirarDaFila(ev.reqId);
		if (ev.entregueA) {
			const set = this.cancelamentos.get(ev.entregueA) || new Set(); set.add(ev.reqId);
			this.cancelamentos.set(ev.entregueA, set);
		}
		const started = !!ev.iniciado;
		p.resolve({ ok: false, expirou: code === 'TIMEOUT', erro: failure(code, reason + (started ? ' A execucao pode ter alterado o Studio; confira antes de repetir.' : ' Nada foi iniciado.'), { nothingExecuted: !started, executionUnknown: started }) });
		this.bombear(); return true;
	}
	aguardar(tool, args, context, rpcId, peer) {
		const max = this.cfg('FILA_MAX', 200, 1, 1000);
		if (this.pend.size >= max) { this.stats.recusadas++; return Promise.resolve({ ok: false, erro: failure('QUEUE_FULL', 'Fila cheia. Espere e repita.', { nothingExecuted: true }) }); }
		if (!this.validarPeer(peer)) return Promise.resolve({ ok: false, erro: failure('STUDIO_OFFLINE', 'O Studio escolhido nao esta mais conectado.', { nothingExecuted: true }) });
		const timeout = this.cfg('TEMPO_LIMITE_MS', 45000, 5000, 55000);
		const ev = { reqId: uid(), tool, args, agent: context.agent, transport: context.transport, rpcId, peer, criado: Date.now(), expiresAt: Date.now() + timeout - 1500 };
		const promise = new Promise((resolve) => {
			const timer = setTimeout(() => { this.stats.expiradas++; this.cancelarEvento(ev, 'TIMEOUT', `Studio nao concluiu em ${timeout / 1000}s.`); }, timeout);
			this.pend.set(ev.reqId, { ev, resolve, timer });
		});
		this.fila.push(ev); this.bombear(); return promise;
	}
	retirarPara(peer) {
		const events = [];
		for (const ev of [...this.fila]) {
			if (events.length >= 16) break;
			if (ev.peer !== peer) continue;
			if (Date.now() >= ev.expiresAt) { this.cancelarEvento(ev, 'QUEUE_EXPIRED', 'Prazo expirou ainda na fila.'); continue; }
			this.retirarDaFila(ev.reqId); ev.entregueA = peer; ev.iniciado = true;

			const prazoMs = Math.max(0, ev.expiresAt - Date.now());
			events.push({ reqId: ev.reqId, tool: ev.tool, args: ev.args, agent: ev.agent, expiresAt: ev.expiresAt, prazoMs, controle: this.controlConfig(), ticket: { ok: true, prazoMs, agent: ev.agent } });
		}
		const cancels = [...(this.cancelamentos.get(peer) || [])]; this.cancelamentos.delete(peer);
		return { events, cancels };
	}
	bombear() {

		for (const w of [...this.pollers]) {
			if (!this.fila.some((e) => e.peer === w.peer) && !this.cancelamentos.get(w.peer)?.size) continue;
			this.finalizarPoll(w, this.retirarParaSemReentrada(w));
		}
	}
	retirarParaSemReentrada(w) {
		const index = this.pollers.indexOf(w); if (index >= 0) this.pollers.splice(index, 1);
		return this.retirarPara(w.peer);
	}
	finalizarPoll(w, result) {
		const index = this.pollers.indexOf(w); if (index >= 0) this.pollers.splice(index, 1);
		clearTimeout(w.timer); w.signal?.removeEventListener('abort', w.abort); w.resolve(result);
	}
	absorverRespostas(b) {
		if (!this.validarPeer(b.peer)) return 0;
		let n = 0;
		for (const it of (Array.isArray(b.itens) ? b.itens.slice(0, 200) : [])) {
			if (typeof it?.reqId !== 'string') continue;
			const p = this.pend.get(it.reqId);
			if (!p || p.ev.entregueA !== b.peer) continue;
			clearTimeout(p.timer); this.pend.delete(it.reqId); this.retirarDaFila(it.reqId);
			p.resolve({ ok: it.ok !== false, resultado: it.resultado, erro: it.erro, msDentroDoStudio: it.ms }); n++;
		}
		return n;
	}
	async corpoJson(req, max = 2000000) {
		const text = await req.text();
		if (text.length > max) throw failure('BODY_TOO_LARGE', 'Corpo muito grande. Divida a operacao.');
		return JSON.parse(text);
	}
	async fetch(req) {
		try { await this.ready; return await this.rotear(req); }
		catch (e) { return jres({ ok: false, erro: e?.code ? e : { message: String(e?.message || e) } }, e?.code ? 409 : 400); }
	}
	async rotear(req) {
		if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers() });
		const url = new URL(req.url), p = url.pathname.split('/').filter(Boolean);

		if (p[3] === 'captura' && p.length === 5 && ['GET', 'HEAD'].includes(req.method) && /^c_[A-Za-z0-9-]+\.png$/.test(p[4])) return this.servirCaptura(p[4].slice(0, -4));

		if (p[3] === 'blob' && p.length >= 5 && ['GET', 'HEAD', 'DELETE'].includes(req.method)) return this.rotaBlob(req, p[4]);

		if (p[3] === 'asset' && p.length === 5 && ['GET', 'HEAD'].includes(req.method)) return this.rotaAsset(req, p[4]);
		if (p[0] === 'mcp') return this.rotaMcp(req, url);
		const action = p[3] || 'estado';
		if (action === 'estado' && ['GET', 'HEAD'].includes(req.method)) return jres(this.estadoJson());
		if (req.method !== 'POST') return tres('Use POST', 405);

		if (action === 'arquivo') return this.rotaArquivo(req, url, p);
		if (action === 'captura') {
			const b = await this.corpoJson(req, 9500000);
			if (!b || typeof b !== 'object') return jres({ erro: 'Esperado objeto JSON' }, 400);
			if (p[4] === 'poll') return this.rotaCapturaPoll(req, b);
			if (p[4] === 'enviar') return this.rotaCapturaEnviar(b);
			return tres('Rota de captura desconhecida', 404);
		}
		const b = await this.corpoJson(req);
		if (!b || typeof b !== 'object' || Array.isArray(b)) return jres({ erro: 'Esperado objeto JSON' }, 400);

		if (action === 'relay') return this.rotaRelay(req, b);
		if (action === 'ola') {
			const par = this.registrarPar(b); this.salvar();
			if (b.teste && typeof b.teste === 'object') this.atualizarTeste(b.teste, par.peer);
			return jres({ ok: true, servidor: VERSAO, catalogo: VERSAO_CATALOGO, alias: par.alias, studiosOnline: this.paresOnline().length, controle: this.controlConfig(), esperaMs: this.cfg('ESPERA_POLL_MS', 25000, 1000, 30000), ferramentasFaltando: remotas.filter((n) => !par.ferramentas.includes(n)), ferramentasDesconhecidas: par.ferramentas.filter((n) => !remotas.includes(n)), filaEsperando: this.fila.filter((e) => e.peer === par.peer).length, backfill: !this.logs.some((l) => l.ctx === 'edit' && l.peer === par.peer), logSeq: this.logSeq, boot: this.boot });
		}
		if (action === 'poll') return this.rotaPoll(req, b);
		if (!this.validarPeer(b.peer)) return jres({ ok: false, erro: 'Peer desconhecido nesta sessao. Reconecte o plugin.' }, 409);
		if (action === 'resposta') return jres({ ok: true, aceitas: this.absorverRespostas(b) });
		if (action === 'iniciar') {
			const ticket = (reqId) => {
				const pending = this.pend.get(reqId), ev = pending?.ev;
				if (!ev || ev.entregueA !== b.peer || Date.now() >= ev.expiresAt) return { ok: false, code: 'REQUEST_EXPIRED', erro: 'Chamada cancelada ou expirada. Nao execute.' };
				ev.iniciado = true;
				return { ok: true, prazoMs: ev.expiresAt - Date.now(), agent: ev.agent };
			};

			if (Array.isArray(b.reqIds)) {
				const tickets = {};
				for (const id of b.reqIds.slice(0, 64)) if (typeof id === 'string') tickets[id] = ticket(id);
				return jres({ ok: true, tickets });
			}
			return jres(ticket(b.reqId));
		}
		if (action === 'tchau') {
			for (const { ev } of [...this.pend.values()]) if (ev.peer === b.peer) this.cancelarEvento(ev, 'STUDIO_DISCONNECTED', 'Studio desconectado.');

			const par = this.pares.get(b.peer);
			if (par) { par.visto = 0; this.marcador(`studio ${par.alias} desconectado: ${par.lugar}`, 'info', b.peer); }
			for (const [rid, r] of this.relays) if (r.peer === b.peer) this.relays.delete(rid);
			for (const w of [...this.pollers]) if (w.peer === b.peer) this.finalizarPoll(w, { events: [], cancels: [], fim: true });
			this.cancelamentos.delete(b.peer); this.salvar(); return jres({ ok: true });
		}
		return tres('Rota desconhecida da ponte', 404);
	}
	async rotaPoll(req, b) {
		const par = this.registrarPar(b); this.absorverRespostas(b);
		if (b.teste && typeof b.teste === 'object') this.atualizarTeste(b.teste, par.peer);
		const ttl = this.cfg('ESPERA_POLL_MS', 25000, 1000, 30000);
		const result = this.retirarPara(par.peer);
		const sessao = { alias: par.alias, studiosOnline: this.paresOnline().length, boot: this.boot };
		if (result.events.length || result.cancels.length) return jres({ ...result, ...sessao, esperaMs: ttl });
		for (const old of [...this.pollers]) if (old.peer === par.peer) this.finalizarPoll(old, { events: [], cancels: [] });
		const wait = Math.max(1, Math.min(ttl, Number(b.wait) || ttl));
		const output = await new Promise((resolve) => {
			const w = { peer: par.peer, resolve, timer: null, signal: req.signal, abort: null };
			w.abort = () => this.finalizarPoll(w, { events: [], cancels: [] });
			w.timer = setTimeout(w.abort, wait); this.pollers.push(w);
			req.signal?.addEventListener('abort', w.abort, { once: true });
			if (req.signal?.aborted) w.abort(); else this.bombear();
		});
		return jres({ ...output, alias: par.alias, studiosOnline: this.paresOnline().length, esperaMs: ttl, boot: this.boot });
	}
	context(req, url, session = '') {
		const head = req.headers.get('x-mcp-agent'), query = url.searchParams.get('agent');
		if (head && query && head !== query) throw failure('AGENT_MISMATCH', 'X-Mcp-Agent e ?agent= divergem.');
		const fixed = head || query || '';
		if (fixed && !agentValido(fixed)) throw failure('BAD_AGENT', 'Identidade invalida. Use A-Z a-z 0-9 _ . : - (ate 96 caracteres).');
		const sid = session || req.headers.get('mcp-session-id') || (url.searchParams.get('cid') ? 'sse:' + url.searchParams.get('cid') : '');
		if (sid && !/^[A-Za-z0-9_.:-]{1,128}$/.test(sid)) throw failure('BAD_SESSION', 'Mcp-Session-Id invalido.');

		const place = String(req.headers.get('x-mcp-place') || url.searchParams.get('place') || '').trim().slice(0, 160);
		return { fixed, session: sid, transport: fixed ? 'fixed:' + fixed : sid ? 'session:' + sid : '', url, place };
	}
	actor(ctx, args = {}) {
		if (ctx.fixed && args.agent && ctx.fixed !== args.agent) throw failure('AGENT_MISMATCH', 'agent diverge da identidade fixa da URL/cabecalho.');
		const id = args.agent || ctx.fixed || (ctx.session ? 'mcp:' + ctx.session : '');
		if (!id || (args.agent && !agentValido(args.agent))) throw failure('AGENT_REQUIRED', 'Chame agent_open e passe agent em todas as chamadas, ou use Mcp-Session-Id / ?agent=identidade-unica.');
		return { agent: id, transport: ctx.transport || 'agent:' + id };
	}
	conteudo(value, tool = null, formato = 'text') {
		const max = this.cfg('MAX_RESULTADO', 120000, 4000, 1000000);

		if (value && typeof value === 'object' && Array.isArray(value.__conteudo)) return value.__conteudo.map((c) => (c.type === 'text' && c.text.length > max ? { ...c, text: c.text.slice(0, max) + '\n[resultado cortado]' } : c));
		let text = value && typeof value === 'object' && typeof value.__texto === 'string' ? value.__texto : null;
		if (text == null && formato !== 'json' && tool) text = renderizar(tool, value);
		if (text == null) text = typeof value === 'string' ? value : JSON.stringify(value);
		if (text == null) text = '';
		if (text.length > max) text = text.slice(0, max) + '\n[resultado cortado; solicite menos linhas/propriedades/instancias]';
		return [{ type: 'text', text }];
	}
	okFerramenta(id, value, tool = null, formato = 'text') { return { jsonrpc: '2.0', id, result: { content: this.conteudo(value, tool, formato) } }; }
	erroFerramenta(id, error, formato = 'text') {
		const text = formato === 'json' ? (typeof error === 'string' ? error : JSON.stringify(error)) : renderizarErro(error);
		return { jsonrpc: '2.0', id, result: { content: this.conteudo(text), isError: true } };
	}
	async chamarFerramenta(msg, ctx) {
		const name = msg.params?.name, args = msg.params?.arguments ?? {};
		const spec = MAPA_FERRAMENTAS.get(name);
		if (!spec) return this.erroFerramenta(msg.id, failure('UNKNOWN_TOOL', 'Ferramenta desconhecida. Disponiveis: ' + NOMES_FERRAMENTAS.join(', ')));

		if (typeof args.place === 'number' && Number.isFinite(args.place)) args.place = String(args.place);
		const invalid = validar(spec.inputSchema, args);
		if (invalid) return this.erroFerramenta(msg.id, failure('INVALID_ARGUMENTS', invalid, { nothingExecuted: true }));
		const formato = args.format === 'json' ? 'json' : 'text';
		const ok = (value) => this.okFerramenta(msg.id, value, name, formato);
		this.stats.chamadas++;
		try {
			if (name === 'agent_open') {
				const agent = ctx.fixed || 'a_' + uid();
				let selected = null;
				const seletor = args.place != null && String(args.place).trim() !== '' ? String(args.place) : ctx.place;
				if (seletor) { const p = this.encontrarStudio(seletor); this.escolhas.set(agent, p.peer); selected = this.studioJson(p, agent); }
				const online = this.paresOnline();
				this.stats.ok++;
				return ok({ agent, name: args.name || agent, fixed: !!ctx.fixed, selected, studiosOnline: online.length, studios: online.map((p) => ({ alias: p.alias, place: p.lugar, placeId: p.placeId })), instructions: 'Use este agent em TODAS as suas chamadas, sem compartilhar com outro agente. Ao terminar use agent_close. Nao ha equipes.' + (online.length > 1 && !selected ? ` Ha ${online.length} Studios online: marque o seu com studio_select place=<alias> ou passe place= em cada chamada.` : '') });
			}
			if (name === 'studio_status') {
				let actor = null; try { actor = this.actor(ctx, args).agent; } catch {                                                 }
				const foco = args.place != null && String(args.place).trim() !== '' && String(args.place).toLowerCase() !== 'all' ? this.encontrarStudio(String(args.place)) : null;
				this.stats.ok++; return ok(this.estadoJson(actor, foco));
			}
			if (name === 'get_logs') {

				let actor = null; try { actor = this.actor(ctx, args); } catch {                                  }
				const studio = this.studioImplicito(actor, args, ctx);
				const peer = studio ? studio.peer : null;

				const nota = {};
				if (!this.logs.some((l) => l.ctx === 'edit' && (!peer || l.peer === peer))) { const b = await this.pedirBackfill(peer, Math.max(200, clamp(args.limit, 100, 1, 500))); if (b) nota.backfill = b; }
				const esperaImplicita = this.cfg('LOGS_ESPERA_MS', 1000, 0, 5000);
				const lidos = args.waitMs == null && esperaImplicita > 0 && this.relaysOnline(peer == null ? undefined : peer).some((r) => r.ctx === 'edit') ? { ...args, waitMs: esperaImplicita } : args;
				this.stats.ok++; return ok(await this.lerLogs(lidos, peer, Object.keys(nota).length ? nota : null));
			}
			if (name === 'studio_select') {
				const actor = this.actor(ctx, args);
				this.stats.ok++; return ok(this.selecionarStudio(actor, { ...args, place: args.place ?? (ctx.place || undefined) }));
			}
			if (name === 'studio_screenshot') {
				let actor = null; try { actor = this.actor(ctx, args); } catch {                                    }
				const r = await this.capturar(args, actor, ctx.url);
				this.stats.ok++; return ok(r);
			}
			if (name === 'toolbox_search') {

				const r = await buscarToolbox(args);
				this.stats.ok++; return ok(conteudoToolbox(r, formato));
			}
			const actor = this.actor(ctx, args);
			if (name === 'agent_close') {

				const explicito = args.place != null && String(args.place).trim() !== '' ? String(args.place) : ctx.place;
				const alvos = explicito ? [this.encontrarStudio(explicito)] : this.paresOnline();
				this.escolhas.delete(actor.agent);
				if (!alvos.length) throw failure('STUDIO_OFFLINE', 'Nenhum Studio conectado; a marcacao de place foi removida, mas nao havia travas a liberar.', { nothingExecuted: true });
				const forwarded = { ...args }; delete forwarded.agent; delete forwarded.format; delete forwarded.place;
				const rs = await Promise.all(alvos.map((p) => this.aguardar(name, forwarded, actor, msg.id, p.peer).then((r) => ({ p, r }))));
				const falhas = rs.filter((x) => !x.r?.ok);
				if (falhas.length === rs.length) throw falhas[0].r?.erro || failure('STUDIO_ERROR', 'Erro desconhecido no Studio.');
				this.stats.ok++;
				if (rs.length === 1) return ok(rs[0].r.resultado ?? { ok: true, agent: actor.agent });
				return ok({ agent: actor.agent, released: rs.reduce((n, x) => n + (Number(x.r?.resultado?.released) || 0), 0), studios: rs.map((x) => ({ alias: x.p.alias, place: x.p.lugar, ok: !!x.r?.ok, released: x.r?.resultado?.released ?? null, error: x.r?.ok ? undefined : x.r?.erro })) });
			}
			if (name === 'studio_play' && (args.action || 'status') === 'status') {

				const studio = this.studioImplicito(actor, args, ctx);
				this.stats.ok++; return ok(await this.controlarTeste(args, actor, null, studio ? studio.peer : null));
			}

			const studio = this.resolverStudio(actor, args, ctx);
			if (name === 'run_luau' && args.context && args.context !== 'edit') {

				const relay = this.relaysOnline(studio.peer).find((r) => r.rotulo === args.context);
				if (!relay) throw failure('RELAY_OFFLINE', `Nenhum DataModel "${args.context}" ativo no Studio ${studio.alias} (${studio.lugar}). Inicie com studio_play action=play (ou multiplayer) e aguarde serverRelayConnected=true; para o editor, omita context.`, { nothingExecuted: true, test: this.testeInfo(studio.peer) });
				const timeoutMs = clamp(args.timeoutMs, 30000, 100, 40000);
				const r = await this.comandoRelay(relay, { tipo: 'luau', code: args.code, timeoutMs, freshRequire: args.freshRequire, undoLabel: args.undoLabel, agent: actor.agent }, Math.min(timeoutMs + 5000, this.cfg('TEMPO_LIMITE_MS', 45000, 5000, 55000) - 1500));
				if (!r.ok) throw r.erro || failure('RELAY_ERROR', 'Erro desconhecido no DataModel de teste.');
				this.stats.ok++; return ok(r.resultado ?? { ok: true });
			}
			if (Number(studio.controle?.version) !== 1 || !studio.ferramentas.includes(name)) throw failure('PLUGIN_UPDATE_REQUIRED', `Atualize o plugin para ${VERSAO}; a ferramenta ${name} nao existe no plugin conectado em ${studio.alias} (${studio.lugar}).`, { nothingExecuted: true });
			const forwarded = { ...args }; delete forwarded.agent; delete forwarded.format; delete forwarded.place;
			if (name === 'studio_play') {
				delete forwarded.waitMs;
				const r = await this.controlarTeste(args, actor, () => this.aguardar(name, forwarded, actor, msg.id, studio.peer), studio.peer);
				this.stats.ok++; return ok(r);
			}
			const r = await this.aguardar(name, forwarded, actor, msg.id, studio.peer);
			if (!r?.ok) throw r?.erro || failure('STUDIO_ERROR', 'Erro desconhecido no Studio.');
			this.stats.ok++;
			const resultado = r.resultado ?? { ok: true };
			if (name === 'export_file' && resultado && typeof resultado === 'object') this.completarExport(resultado, ctx.url);

			if (formato === 'json' && this.pares.size > 1 && resultado && typeof resultado === 'object' && !Array.isArray(resultado) && !resultado.__conteudo && !resultado.__texto && resultado.place === undefined) resultado.place = studio.alias;
			return ok(resultado);
		} catch (e) { this.stats.erro++; return this.erroFerramenta(msg.id, e?.code || typeof e === 'string' ? e : String(e?.message || e), formato); }
	}
	async tratarMensagem(msg, ctx) {
		if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Requisicao invalida' } };
		if (msg.id === undefined) {
			if (msg.method === 'notifications/cancelled' && msg.params?.requestId != null) {
				const transport = ctx.transport || (agentValido(msg.params.agent) ? 'agent:' + msg.params.agent : '');
				if (transport) for (const { ev } of [...this.pend.values()]) if (ev.transport === transport && ev.rpcId === msg.params.requestId) {
					this.stats.canceladas++; this.cancelarEvento(ev, 'CANCELLED', 'Cancelada pelo cliente MCP.');
				}
			}
			return null;
		}
		if (msg.method === 'initialize') {
			this.cliente = String(msg.params?.clientInfo?.name || '').slice(0, 60);
			return { jsonrpc: '2.0', id: msg.id, result: { protocolVersion: PROTOCOLOS.includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: NOME_SERVIDOR, title: 'Roblox Studio — ambiente controlado', version: VERSAO }, instructions: INSTRUCOES } };
		}
		if (msg.method === 'tools/list') return { jsonrpc: '2.0', id: msg.id, result: { tools: FERRAMENTAS } };
		if (msg.method === 'tools/call') return this.chamarFerramenta(msg, ctx);
		const empty = { ping: {}, 'resources/list': { resources: [] }, 'resources/templates/list': { resourceTemplates: [] }, 'prompts/list': { prompts: [] }, 'completion/complete': { completion: { values: [], hasMore: false } }, 'logging/setLevel': {} };
		return Object.hasOwn(empty, msg.method) ? { jsonrpc: '2.0', id: msg.id, result: empty[msg.method] } : { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Metodo nao suportado: ' + msg.method } };
	}

	async rotaTerminal(req, url, p) {
		const base = `${url.origin}/${p.slice(0, 3).join('/')}`;
		const sub = p[3], nome = p[4];
		if (['GET', 'HEAD'].includes(req.method)) {
			if (!sub) return tres(ajudaTerminal(base));
			if (sub === 'cli') return tres(cliPython(base), 200, { 'Content-Disposition': 'inline; filename="rbx"' });
			if (sub === 'cli.sh') return tres(cliBash(base), 200, { 'Content-Disposition': 'inline; filename="rbx"' });
			if (sub === 'tools' && !nome) return tres(`Ferramentas (${FERRAMENTAS.length}) — detalhes: GET ${base}/tools/<nome>\n\n` + listarFerramentas());
			if (sub === 'tools') { const d = descreverFerramenta(nome); return d ? tres(d) : tres(`ERRO UNKNOWN_TOOL: ${nome} nao existe. Disponiveis: ${NOMES_FERRAMENTAS.join(', ')}`, 404); }
			if (sub === 'import' || sub === 'upload') return tres(ajudaImportar(base));
		}
		if (sub === 'import' || sub === 'upload') return this.rotaImportar(req, url, base, sub);
		if (sub !== 'call' && sub !== 'luau') return tres(`ERRO ROTA: use ${base}/tools, ${base}/call/<ferramenta>, ${base}/luau ou ${base}/import\n\n` + ajudaTerminal(base), 404);
		let ctx;
		try { ctx = this.context(req, url); } catch (e) { return tres(`ERRO ${e.code}: ${e.message}`, 400); }
		const querys = {};

		for (const [k, v] of url.searchParams) if (!['agent', 'format', 'chave', 'cid', 'transport', 'sse', 'place'].includes(k)) querys[k] = coagir(v);
		let args = {}, tool = sub === 'luau' ? 'run_luau' : nome;
		try {
			if (req.method === 'GET' || req.method === 'HEAD') args = querys;
			else if (req.method !== 'POST') return tres('ERRO METODO: use GET ou POST', 405);
			else {
				const ctype = (req.headers.get('content-type') || '').toLowerCase();
				const texto = await req.text();
				if (texto.length > this.cfg('MAX_CORPO_TERMINAL', 2000000, 10000, 20000000)) return tres('ERRO CORPO: corpo grande demais', 413);
				if (sub === 'luau') args = { ...querys, code: texto };
				else if (ctype.includes('application/json') || texto.trim().startsWith('{')) args = { ...querys, ...(texto.trim() ? JSON.parse(texto) : {}) };
				else if (ctype.includes('x-www-form-urlencoded') && !texto.includes(' ') && texto.includes('&')) { for (const [k, v] of new URLSearchParams(texto)) args[k] = coagir(v); args = { ...querys, ...args }; }
				else args = { ...querys, ...argumentosDeTexto(texto) };
			}
		} catch (e) { return tres(`ERRO ARGUMENTOS: ${String(e?.message || e)}`, 400); }
		if (!tool) return tres(`ERRO ROTA: informe a ferramenta: ${base}/call/<nome>`, 404);
		const accept = req.headers.get('accept') || '';
		const pedido = url.searchParams.get('format') || args.format || (accept.includes('application/json') && !accept.includes('text/plain') ? 'json' : 'text');
		args.format = pedido === 'json' ? 'json' : 'text';
		if (ctx.fixed) delete args.agent;
		if (!ctx.fixed && !args.agent && tool !== 'studio_status' && tool !== 'agent_open') {

			return tres('ERRO AGENT_REQUIRED: envie o cabecalho X-Mcp-Agent: <nome-unico-seu> (ou ?agent=) em todas as chamadas. O CLI (curl -fsSL ' + base + '/cli -o rbx) faz isso sozinho.', 400);
		}
		return this.executarTerminal(tool, args, ctx);
	}
	async executarTerminal(tool, args, ctx) {
		const msg = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } };
		const res = await this.chamarFerramenta(msg, ctx);
		this.salvar();
		const texto = (res.result?.content || []).map((c) => (c.type === 'text' ? c.text : `[${c.type} ${c.mimeType || ''}]`)).join('\n');
		if (!res.result?.isError) return tres(texto, 200);
		const code = /^ERRO ([A-Z_]+)/.exec(texto)?.[1] || (() => { try { return JSON.parse(texto).code; } catch { return ''; } })();
		const status = code === 'STUDIO_OFFLINE' || code === 'PLACE_OFFLINE' || code === 'PLUGIN_UPDATE_REQUIRED' || code === 'WORKER_UPDATE_REQUIRED' || code === 'CAPTURE_HELPER_OFFLINE' || code === 'IMPORTMCP_MISSING' ? 503 : code === 'UPLOAD_FAILED' || code === 'ASSET_UNAVAILABLE' ? 502 : code === 'LOCK_CONFLICT' || code === 'STUDIO_BUSY' || code === 'TOO_MANY_STUDIOS' || code === 'STUDIO_PLAYING' || code === 'PLACE_REQUIRED' || code === 'PLACE_AMBIGUOUS' ? 409 : code === 'REQUEST_EXPIRED' || code === 'TIMEOUT' || code === 'RELAY_TIMEOUT' || code === 'EXECUTION_TIMEOUT' ? 504 : code === 'UNKNOWN_TOOL' || code === 'PLACE_NOT_FOUND' ? 404 : code === 'BODY_TOO_LARGE' ? 413 : 400;
		return tres(texto, status);
	}

	blobPurgar() {
		const ttl = this.cfg('BLOB_TTL_MS', 1800000, 60000, 86400000);
		for (const [id, b] of this.blobs) if (Date.now() - b.criado > ttl) this.blobs.delete(id);
	}
	blobGuardar(bytes, nome, tipo) {
		this.blobPurgar();
		const max = this.cfg('MAX_UPLOAD_BYTES', 40 * 1024 * 1024, 65536, 95 * 1024 * 1024);
		if (bytes.byteLength > max) throw failure('BODY_TOO_LARGE', `Arquivo de ${bytes.byteLength} bytes passa do limite de ${Math.round(max / 1048576)} MiB (MAX_UPLOAD_BYTES). Reduza texturas/geometria ou publique em uma URL e use import_asset url=.`, { nothingExecuted: true });
		let total = 0; for (const b of this.blobs.values()) total += b.bytes.byteLength;
		if (total + bytes.byteLength > this.cfg('BLOB_TOTAL_MAX', 96 * 1024 * 1024, 1048576, 110 * 1024 * 1024)) throw failure('BLOB_STORAGE_FULL', 'Muitos arquivos temporarios aguardando importacao. Importe ou apague (DELETE <mcp>/blob/<id>) os anteriores e repita.', { nothingExecuted: true });
		const seguro = String(nome || 'arquivo.bin').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120) || 'arquivo.bin';
		const blob = { id: 'b_' + uid(), bytes, nome: seguro, tipo: String(tipo || 'application/octet-stream').split(';')[0] || 'application/octet-stream', criado: Date.now() };
		this.blobs.set(blob.id, blob);
		return blob;
	}
	blobUrl(base, blob) {

		const segredo = String(this.env?.SEGREDO || '').trim();
		return `${base}/blob/${blob.id}/${encodeURIComponent(blob.nome)}${segredo ? `?chave=${encodeURIComponent(segredo)}` : ''}`;
	}

	async rotaArquivo(req, url, p) {
		const q = url.searchParams, peer = q.get('peer');
		if (!this.validarPeer(peer)) return jres({ ok: false, erro: failure('BAD_PEER', 'Peer desconhecido nesta sessao. Reconecte o plugin.') }, 409);
		for (const [id, u] of this.uploads) if (Date.now() - u.visto > 5 * 60 * 1000) this.uploads.delete(id);
		const bruto = new Uint8Array(await req.arrayBuffer());
		const len = Number(q.get('len'));
		if (Number.isFinite(len) && len > 0 && len !== bruto.byteLength) return jres({ ok: false, erro: failure('BYTES_MISMATCH', `o Worker recebeu ${bruto.byteLength} bytes; o Studio enviou ${len}.`) }, 400);
		let dados = bruto;
		if (q.get('b64') === '1') { try { dados = base64ParaBytes(new TextDecoder().decode(bruto).replace(/\s+/g, '')); } catch { return jres({ ok: false, erro: failure('BAD_BASE64', 'pedaco base64 invalido.') }, 400); } }
		const max = this.cfg('MAX_UPLOAD_BYTES', 40 * 1024 * 1024, 65536, 95 * 1024 * 1024);
		const parte = clamp(q.get('parte'), 1, 1, 100000), id = q.get('id');
		let up;
		if (id) {
			up = this.uploads.get(id);
			if (!up || up.peer !== peer) return jres({ ok: false, erro: failure('UPLOAD_NOT_FOUND', 'upload desconhecido ou expirado; recomece do pedaco 1.') }, 404);
		} else {
			if (parte !== 1) return jres({ ok: false, erro: failure('BAD_PART', 'o primeiro pedaco deve ser parte=1 sem id.') }, 400);
			up = { id: 'u_' + uid(), peer, nome: q.get('nome') || 'arquivo.bin', tipo: q.get('tipo') || 'application/octet-stream', partes: [], bytes: 0, proxima: 1, visto: Date.now() };
			this.uploads.set(up.id, up);
		}
		if (parte !== up.proxima) return jres({ ok: false, erro: failure('BAD_PART', `esperava o pedaco ${up.proxima}, veio ${parte}.`) }, 400);
		if (up.bytes + dados.byteLength > max) { this.uploads.delete(up.id); return jres({ ok: false, erro: failure('BODY_TOO_LARGE', `o arquivo passou de ${Math.round(max / 1048576)} MiB (MAX_UPLOAD_BYTES).`) }, 413); }
		up.partes.push(dados); up.bytes += dados.byteLength; up.proxima++; up.visto = Date.now();
		if (q.get('fim') !== '1') return jres({ ok: true, uploadId: up.id, parte, bytes: up.bytes });
		this.uploads.delete(up.id);
		const todos = new Uint8Array(up.bytes); let pos = 0;
		for (const b of up.partes) { todos.set(b, pos); pos += b.byteLength; }
		let blob;
		try { blob = this.blobGuardar(todos, up.nome, up.tipo); } catch (e) { return jres({ ok: false, erro: e }, e.code === 'BODY_TOO_LARGE' ? 413 : 409); }
		const base = `${url.origin}/mcp/${p[1]}/${p[2]}`;
		return jres({ ok: true, id: blob.id, url: this.blobUrl(base, blob), fileName: blob.nome, bytes: blob.bytes.byteLength, expiresInSeconds: Math.round(this.cfg('BLOB_TTL_MS', 1800000, 60000, 86400000) / 1000) });
	}

	async rotaAsset(req, id) {
		if (!/^\d{1,20}$/.test(id)) return tres('ERRO BAD_ASSET: id numerico esperado em /asset/<id>', 400);
		const baixar = async (assetId) => {
			const r = await fetch(`https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`, { headers: { 'User-Agent': 'Roblox/WinInet', Accept: '*/*' }, redirect: 'follow' });
			if (!r.ok) { const corpo = (await r.text()).slice(0, 200); throw failure('ASSET_UNAVAILABLE', `assetdelivery respondeu ${r.status} para o asset ${assetId}${corpo ? `: ${corpo}` : ''}. Assets privados de terceiros nao podem ser baixados.`, { status: r.status }); }
			return { bytes: new Uint8Array(await r.arrayBuffer()), contentType: r.headers.get('content-type') || '' };
		};
		let baixado;
		try {
			baixado = await baixar(id);
			const cab = String.fromCharCode(...baixado.bytes.subarray(0, 8));
			if (cab.startsWith('<roblox') && !cab.startsWith('<roblox!') && baixado.bytes.byteLength < 65536) {
				const xml = new TextDecoder().decode(baixado.bytes);
				const alvo = /class="Decal"[\s\S]*?<url>[^<]*[?&]id=(\d+)<\/url>/.exec(xml)?.[1];
				if (alvo && alvo !== id) baixado = await baixar(alvo);
			}
		} catch (e) { return tres(`ERRO ${e?.code || 'ASSET_FETCH'}: ${e?.message || String(e)}`, e?.status === 403 || e?.status === 404 ? e.status : 502); }
		const { tipo, ext } = tipoDoAsset(baixado.bytes, baixado.contentType);
		return new Response(req.method === 'HEAD' ? null : baixado.bytes, { status: 200, headers: headers({ 'Content-Type': tipo, 'Content-Length': String(baixado.bytes.byteLength), 'Content-Disposition': `attachment; filename="asset_${id}.${ext}"`, 'Cache-Control': 'private, max-age=600' }) });
	}

	completarExport(resultado, url) {
		const base = url ? `${url.origin}/${url.pathname.split('/').filter(Boolean).slice(0, 3).join('/')}` : null;
		const segredo = String(this.env?.SEGREDO || '').trim(), sufixo = segredo ? `?chave=${encodeURIComponent(segredo)}` : '';
		if (Array.isArray(resultado.assets)) for (const a of resultado.assets) if (a && Number(a.assetId) > 0 && base) a.url = `${base}/asset/${Math.floor(Number(a.assetId))}${sufixo}`;
		const temAssets = Array.isArray(resultado.assets) && resultado.assets.length > 0;
		if (resultado.url) resultado.hint = `curl -fsSL -o "${resultado.fileName || 'arquivo'}" "${resultado.url}" baixa o arquivo (expira em ${resultado.expiresInSeconds ?? 1800}s)${temAssets ? '; cada item de assets tem url para baixar o asset original.' : '.'}`;
		else if (temAssets) resultado.hint = 'Baixe cada asset original pela url em assets (curl -fsSL -o nome "<url>"); assets privados de terceiros respondem 403.';
	}
	rotaBlob(req, id) {
		this.blobPurgar();
		const blob = this.blobs.get(id);
		if (!blob) return tres('ERRO BLOB_NOT_FOUND: arquivo temporario nao existe ou expirou. Envie de novo com POST <mcp>/upload.', 404);
		if (req.method === 'DELETE') { this.blobs.delete(id); return jres({ ok: true, removed: id }); }
		const h = headers({ 'Content-Type': blob.tipo, 'Content-Length': String(blob.bytes.byteLength), 'Content-Disposition': `attachment; filename="${blob.nome.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(blob.nome)}`, 'Cache-Control': 'no-store' });
		return new Response(req.method === 'HEAD' ? null : blob.bytes, { status: 200, headers: h });
	}

	async rotaImportar(req, url, base, sub) {
		if (req.method !== 'POST') return tres('ERRO METODO: use POST (GET mostra a ajuda)', 405);
		let ctx;
		try { ctx = this.context(req, url); } catch (e) { return tres(`ERRO ${e.code}: ${e.message}`, 400); }
		if (!ctx.fixed) return tres('ERRO AGENT_REQUIRED: envie o cabecalho X-Mcp-Agent: <nome-unico-seu> (ou ?agent=). O CLI (curl -fsSL ' + base + '/cli -o rbx) faz isso sozinho.', 400);
		const args = {};
		for (const [k, v] of url.searchParams) if (!['agent', 'format', 'chave', 'cid', 'transport', 'sse'].includes(k)) args[k] = coagir(v);
		const ctype = (req.headers.get('content-type') || '').toLowerCase();
		let bytes = null, nomeArquivo = args.fileName;
		try {
			if (ctype.includes('multipart/form-data')) {
				const form = await req.formData();
				for (const [k, v] of form) {
					if (typeof v === 'string') args[k] = coagir(v);
					else { bytes = new Uint8Array(await v.arrayBuffer()); nomeArquivo = nomeArquivo || v.name; }
				}
			} else if (ctype.includes('application/json')) {
				Object.assign(args, JSON.parse(await req.text() || '{}'));
			} else {
				const corpo = new Uint8Array(await req.arrayBuffer());
				if (corpo.byteLength) bytes = corpo;
				const cd = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(req.headers.get('content-disposition') || '');
				nomeArquivo = nomeArquivo || (cd && decodeURIComponent(cd[1]));
			}
		} catch (e) { return tres(`ERRO ARGUMENTOS: ${String(e?.message || e)}`, 400); }
		delete args.fileName;
		const formato = url.searchParams.get('format') || args.format || ((req.headers.get('accept') || '').includes('application/json') ? 'json' : 'text');
		delete args.format; delete args.agent; delete args.keepBlob;
		const manterBlob = coagir(url.searchParams.get('keepBlob')) === true;
		let blob = null;
		if (bytes && bytes.byteLength) {
			try { blob = this.blobGuardar(bytes, nomeArquivo || args.name && `${args.name}.bin` || 'arquivo.bin', ctype); }
			catch (e) { return tres(renderizarErro(e), e.code === 'BODY_TOO_LARGE' ? 413 : 409); }
			if (sub === 'upload') {
				const info = { ok: true, id: blob.id, url: this.blobUrl(base, blob), fileName: blob.nome, bytes: blob.bytes.byteLength, expiresInSeconds: Math.round(this.cfg('BLOB_TTL_MS', 1800000, 60000, 86400000) / 1000), hint: `import_asset url=${this.blobUrl(base, blob)} (ou em externals). DELETE ${base}/blob/${blob.id} apaga.` };
				return formato === 'json' ? jres(info) : tres(`upload ${info.id} bytes=${info.bytes} file=${info.fileName} expira=${info.expiresInSeconds}s\nurl: ${info.url}\n${info.hint}`);
			}
			args.url = this.blobUrl(base, blob);
			args.fileName = blob.nome;
		} else if (sub === 'upload') {
			return tres('ERRO CORPO: envie o arquivo no corpo (curl --data-binary @arquivo) ou multipart (-F file=@arquivo).', 400);
		} else if (!args.url && !args.data && !args.upload && !args.text) {
			return tres(`ERRO SOURCE_REQUIRED: envie o arquivo no corpo (--data-binary @arquivo), multipart (-F file=@arquivo) ou JSON/query com url=.\n\n${ajudaImportar(base)}`, 400);
		}
		args.format = formato === 'json' ? 'json' : 'text';
		try { return await this.executarTerminal('import_asset', args, ctx); }
		finally { if (blob && !manterBlob) this.blobs.delete(blob.id); }
	}
	async rotaMcp(req, url) {
		const p = url.pathname.split('/').filter(Boolean);
		if (p.length > 3 || (req.method === 'GET' && !url.searchParams.get('transport') && url.searchParams.get('sse') !== '1')) return this.rotaTerminal(req, url, p);
		if (['GET', 'HEAD'].includes(req.method)) {
			if (req.method === 'GET' && (url.searchParams.get('transport') === 'sse' || url.searchParams.get('sse') === '1')) return this.mcpSse(req, url);
			return tres('Use POST para Streamable HTTP; SSE legado: ?transport=sse', 405, { Allow: 'POST, DELETE, OPTIONS' });
		}
		if (req.method === 'DELETE') {
			const ctx = this.context(req, url);
			if (ctx.transport) for (const { ev } of [...this.pend.values()]) if (ev.transport === ctx.transport) this.cancelarEvento(ev, 'SESSION_CLOSED', 'Transporte encerrado pelo cliente.');
			return new Response(null, { status: 204, headers: headers() });
		}
		if (req.method !== 'POST') return tres('Use POST', 405);
		let body;
		try { body = await this.corpoJson(req); } catch { return jres({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalido ou corpo grande demais' } }, 400); }
		const batch = Array.isArray(body) ? body : [body];
		if (!batch.length || batch.length > 100) return jres({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Lote deve ter 1 a 100 mensagens' } }, 400);
		const init = batch.some((m) => m?.method === 'initialize' && m.id !== undefined);
		const session = init ? (req.headers.get('mcp-session-id') || uid()) : '';
		let ctx;
		try { ctx = this.context(req, url, session); } catch (e) { return jres({ jsonrpc: '2.0', id: null, error: { code: -32602, message: e.message } }, 400); }

		const output = (await Promise.all(batch.map((m) => this.tratarMensagem(m, ctx)))).filter(Boolean);
		this.salvar();
		const extra = ctx.session && !ctx.session.startsWith('sse:') ? { 'Mcp-Session-Id': ctx.session } : {};
		if (url.searchParams.get('transport') === 'sse' && url.searchParams.get('cid')) {
			const write = this.cids.get(url.searchParams.get('cid'));
			if (!write) return tres('Stream SSE encerrado; reconecte.', 404);
			for (const message of output) write('message', JSON.stringify(message));
			return tres('Accepted', 202, extra);
		}
		if (!output.length) return new Response(null, { status: 202, headers: headers(extra) });
		return jres(Array.isArray(body) ? output : output[0], 200, extra);
	}
	mcpSse(req, url) {
		const cid = uid(), stream = new TransformStream(), writer = stream.writable.getWriter(), encoder = new TextEncoder();
		let timer = null, dead = false;
		const close = () => { if (dead) return; dead = true; clearInterval(timer); this.cids.delete(cid); req.signal?.removeEventListener('abort', close); writer.close().catch(ignorar); };
		const write = (event, data) => { if (!dead) writer.write(encoder.encode(`event: ${event}\ndata: ${data}\n\n`)).catch(close); };
		this.cids.set(cid, write);
		const endpoint = new URL(url); endpoint.searchParams.set('transport', 'sse'); endpoint.searchParams.set('cid', cid); endpoint.searchParams.delete('sse');
		write('endpoint', endpoint.toString());
		timer = setInterval(() => writer.write(encoder.encode(': ping\n\n')).catch(close), 20000);
		req.signal?.addEventListener('abort', close, { once: true });
		return new Response(stream.readable, { headers: headers({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' }) });
	}
}
