const CATEGORIAS = {
	models: { id: 10, rotulo: 'Model', insere: 'insert_asset assetId=<id> [parent] [position] (LoadAsset; scripts internos sao listados)' },
	audio: { id: 3, rotulo: 'Audio', insere: 'insert_asset assetId=<id> kind=audio parent=<onde> (cria Sound com SoundId)' },
	decals: { id: 13, rotulo: 'Decal', insere: 'insert_asset assetId=<id> kind=decal parent=<BasePart ou Gui> (Decal/Texture/ImageLabel)' },
	images: { id: 13, rotulo: 'Decal', insere: 'insert_asset assetId=<id> kind=decal parent=<BasePart ou Gui>' },
	meshes: { id: 40, rotulo: 'Mesh', insere: 'insert_asset assetId=<id> kind=mesh [parent] [position] (CreateMeshPartAsync)' },
	plugins: { id: 8, rotulo: 'Plugin', insere: 'plugins nao sao inseridos no place; instale pelo Studio' },
	videos: { id: 38, rotulo: 'Video', insere: 'insert_asset assetId=<id> kind=video parent=<Gui> (VideoFrame)' },
};
const TIPOS = { 1: 'Image', 2: 'TShirt', 3: 'Audio', 4: 'Mesh', 8: 'Hat', 10: 'Model', 11: 'Shirt', 12: 'Pants', 13: 'Decal', 24: 'Animation', 38: 'Plugin', 40: 'MeshPart', 62: 'Video', 63: 'Font' };
const TAMANHOS = { 150: '150x150', 420: '420x420' };

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function buscarJson(url, ms = 9000, tentativa = 0) {
	const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
	try {
		const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'roblox-studio-mcp/2.7 (+toolbox_search)' } });
		if (r.status === 429 && tentativa < 2) { clearTimeout(timer); await dormir(700 * (tentativa + 1)); return buscarJson(url, ms, tentativa + 1); }
		if (!r.ok) throw new Error(`HTTP ${r.status} em ${new URL(url).pathname}`);
		return await r.json();
	} finally { clearTimeout(timer); }
}
async function buscarBytes(url, ms = 9000, maxBytes = 1_500_000) {
	const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
	try {
		const r = await fetch(url, { signal: ctl.signal });
		if (!r.ok) return null;
		const buf = new Uint8Array(await r.arrayBuffer());
		if (buf.byteLength > maxBytes || buf.byteLength < 8) return null;
		let bin = ''; const passo = 0x8000;
		for (let i = 0; i < buf.length; i += passo) bin += String.fromCharCode.apply(null, buf.subarray(i, i + passo));
		const mime = (r.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
		return { b64: btoa(bin), bytes: buf.byteLength, mime: mime.startsWith('image/') ? mime : 'image/png' };
	} catch { return null; } finally { clearTimeout(timer); }
}

const compacto = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const dataCurta = (iso) => (iso ? String(iso).slice(0, 10) : null);

function normalizarDetalhe(d) {
	const a = d?.asset || {}, c = d?.creator || {}, v = d?.voting || {}, f = d?.fiatProduct || {}, p = d?.product || {};
	const tec = a.modelTechnicalDetails || {}, mesh = tec.objectMeshSummary || {}, inst = tec.instanceCounts || {};
	const robux = p?.price ?? p?.priceInRobux ?? null;
	const q = f.purchasePrice?.quantity;
	const usd = q && Number.isFinite(q.significand) ? Math.round(q.significand * Math.pow(10, q.exponent || 0) * 100) / 100 : null;
	const gratis = f.isFree === true || robux === 0 || (robux == null && f.isFree !== false && !(usd > 0));
	return {
		id: a.id, name: a.name || '', type: TIPOS[a.typeId] || `type${a.typeId}`, typeId: a.typeId,
		creator: c.name || '?', creatorId: c.id ?? null, creatorType: c.type === 2 ? 'Group' : 'User', verified: c.isVerifiedCreator === true,
		free: gratis, priceRobux: gratis ? 0 : robux, priceUsd: gratis ? 0 : usd, currency: gratis ? null : f.purchasePrice?.currencyCode || null,
		votes: v.voteCount ?? null, upVotePercent: v.showVotes === false ? null : v.upVotePercent ?? null,
		endorsed: a.isEndorsed === true,
		description: compacto(a.description, 160),
		created: dataCurta(a.createdUtc), updated: dataCurta(a.updatedUtc),
		duration: a.typeId === 3 ? a.duration ?? null : null,
		triangles: mesh.triangles ?? null, vertices: mesh.vertices ?? null,
		scripts: inst.script ?? (a.hasScripts ? '?' : 0), meshParts: inst.meshPart ?? null, decals: inst.decal ?? null, audios: inst.audio ?? null, animations: inst.animation ?? null, tools: inst.tool ?? null,
		hasScripts: a.hasScripts === true || (inst.script || 0) > 0,
		category: a.categoryPath || null, subTypes: Array.isArray(a.assetSubTypes) ? a.assetSubTypes : [],
	};
}

export async function buscarToolbox(args) {
	const categoria = CATEGORIAS[String(args.category || 'models').toLowerCase()] || CATEGORIAS.models;
	const limite = Math.max(1, Math.min(30, Math.floor(Number(args.limit) || 10)));
	const idsPedidos = Array.isArray(args.assetIds) ? args.assetIds.map((n) => Math.floor(Number(n))).filter((n) => n > 0).slice(0, 30) : [];
	if (!idsPedidos.length && !String(args.query || '').trim()) throw { code: 'INVALID_ARGUMENTS', message: 'Informe query (texto da busca) ou assetIds (lista de ids para detalhar).', nothingExecuted: true };

	let ids = idsPedidos, total = null, nextCursor = null, prevCursor = null, sugestoes = [], termo = String(args.query || '').trim();
	if (!ids.length) {
		const u = new URL(`https://apis.roblox.com/toolbox-service/v1/marketplace/${categoria.id}`);
		u.searchParams.set('keyword', termo); u.searchParams.set('limit', String(limite));
		if (args.cursor) u.searchParams.set('cursor', String(args.cursor));
		if (args.verifiedOnly === true) u.searchParams.set('includeOnlyVerifiedCreators', 'true');
		if (args.creatorId) u.searchParams.set('creatorTargetId', String(Math.floor(Number(args.creatorId))));
		let busca;
		try { busca = await buscarJson(u.toString()); } catch (e) { throw { code: 'TOOLBOX_UNAVAILABLE', message: `A Toolbox do Roblox nao respondeu: ${String(e?.message || e)}. Tente de novo em alguns segundos.`, nothingExecuted: true }; }
		ids = (busca.data || []).map((d) => d.id).filter(Boolean);
		total = busca.totalResults ?? null; nextCursor = busca.nextPageCursor || null; prevCursor = busca.previousPageCursor || null;
		sugestoes = busca.queryFacets?.availableFacets || [];
		if (busca.spellCheckerResult?.correctedQuery) sugestoes.unshift(`correcao: ${busca.spellCheckerResult.correctedQuery}`);
	}
	if (!ids.length) return { query: termo, category: categoria.rotulo, total: total ?? 0, count: 0, items: [], nextCursor, hint: 'Nenhum resultado. Tente outra palavra (em ingles costuma achar mais), outra categoria ou verifiedOnly=false.' };

	const querThumbs = args.thumbnails !== false && categoria.id !== 3 && categoria.id !== 8;
	const tamanho = TAMANHOS[Number(args.thumbnailSize)] || '150x150';
	const maxThumbs = Math.max(0, Math.min(20, Math.floor(Number(args.maxThumbnails ?? 10))));
	const [detalhes, thumbs] = await Promise.all([
		buscarJson(`https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=${ids.join(',')}`).catch(() => null),
		querThumbs && maxThumbs > 0 ? buscarJson(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids.slice(0, maxThumbs).join(',')}&size=${tamanho}&format=Png&returnPolicy=PlaceHolder`).catch(() => null) : null,
	]);
	const porId = new Map();
	for (const d of detalhes?.data || []) { const n = normalizarDetalhe(d); if (n.id) porId.set(n.id, n); }
	const items = ids.map((id) => porId.get(id) || { id, name: '(detalhes indisponiveis)', type: categoria.rotulo });

	const urlsThumb = new Map();
	for (const t of thumbs?.data || []) if (t.state === 'Completed' && t.imageUrl) urlsThumb.set(t.targetId, t.imageUrl);
	const imagens = await Promise.all(items.slice(0, maxThumbs).map(async (it) => {
		const u = urlsThumb.get(it.id); if (!u) return null;
		const img = await buscarBytes(u); return img ? { id: it.id, ...img } : null;
	}));
	const comImagem = imagens.filter(Boolean);
	for (const img of comImagem) { const it = items.find((x) => x.id === img.id); if (it) it.thumbnail = true; }
	const esperadas = querThumbs ? Math.min(maxThumbs, items.length) : 0;
	const aviso = esperadas > 0 && comImagem.length < esperadas ? (thumbs ? `${esperadas - comImagem.length} miniatura(s) nao vieram (servico de imagens limitou a rajada); repita com assetIds=[...] para busca-las.` : 'servico de miniaturas indisponivel no momento (429/timeout); repita em alguns segundos ou use assetIds.') : null;

	return {
		query: termo || null, category: categoria.rotulo, total, count: items.length, items, nextCursor, prevCursor,
		suggestions: sugestoes.slice(0, 10), insertHint: categoria.insere, thumbnailWarning: aviso,
		__imagens: comImagem,
	};
}

export function renderizarToolbox(r) {
	const out = [];
	const cab = r.query ? `# toolbox "${r.query}" (${r.category}): ${r.count} de ${r.total ?? '?'}` : `# toolbox detalhes (${r.category}): ${r.count} item(ns)`;
	out.push(cab + (r.nextCursor ? ` | proxima pagina: cursor=${r.nextCursor}` : ''));
	if (!r.items.length) { if (r.hint) out.push(r.hint); return out.join('\n'); }
	r.items.forEach((it, i) => {
		const partes = [`[${i + 1}] id=${it.id} "${compacto(it.name, 60)}"`, it.type];
		partes.push(`por ${it.creator}${it.verified ? ' (verificado)' : ''}${it.creatorType === 'Group' ? ' [grupo]' : ''}`);
		if (it.free) partes.push('gratis');
		else if (it.priceUsd != null && it.priceUsd > 0) partes.push(`PAGO ${it.currency || 'USD'} ${it.priceUsd.toFixed(2)}`);
		else if (it.priceRobux != null) partes.push(`PAGO R$${it.priceRobux}`);
		else if (it.free === false) partes.push('PAGO');
		if (it.upVotePercent != null && it.votes) partes.push(`${it.upVotePercent}% de ${it.votes} votos`);
		if (it.endorsed) partes.push('ENDOSSADO');
		if (it.duration != null) partes.push(`${it.duration}s`);
		if (it.triangles != null) partes.push(`${it.triangles} tris/${it.vertices} verts`);
		if (it.meshParts) partes.push(`${it.meshParts} MeshPart`);
		if (it.hasScripts) partes.push(`SCRIPTS=${it.scripts} (inspecione antes de confiar)`);
		if (it.animations) partes.push(`${it.animations} anim`);
		if (it.tools) partes.push(`${it.tools} Tool`);
		if (it.updated) partes.push(`atualizado ${it.updated}`);
		if (it.thumbnail) partes.push('miniatura abaixo');
		out.push(partes.join(' | '));
		if (it.description && it.description.toLowerCase() !== 'default' && it.description.toLowerCase() !== String(it.name).toLowerCase()) out.push(`    ${it.description}`);
	});
	if (r.suggestions?.length) out.push(`sugestoes: ${r.suggestions.join(', ')}`);
	if (r.thumbnailWarning) out.push(`aviso: ${r.thumbnailWarning}`);
	if (r.insertHint) out.push(`inserir: ${r.insertHint}`);
	return out.join('\n');
}

export function conteudoToolbox(r, formato) {
	const imagens = r.__imagens || []; delete r.__imagens;
	const blocos = [{ type: 'text', text: formato === 'json' ? JSON.stringify(r) : renderizarToolbox(r) }];
	for (const img of imagens) {
		const idx = r.items.findIndex((x) => x.id === img.id);
		blocos.push({ type: 'text', text: `[${idx + 1}] id=${img.id} ${compacto(r.items[idx]?.name, 60)}` });
		blocos.push({ type: 'image', data: img.b64, mimeType: img.mime || 'image/png' });
	}
	return { __conteudo: blocos };
}
