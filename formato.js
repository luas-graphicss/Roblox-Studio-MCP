const esc = (s) => String(s ?? '').replace(/\r?\n/g, '\\n');
const val = (v) => {
	if (v === null || v === undefined) return 'nil';
	if (typeof v === 'string') return JSON.stringify(v);
	if (typeof v !== 'object') return String(v);
	if (Array.isArray(v)) return v.length <= 6 && v.every((x) => typeof x !== 'object' || x === null) ? `[${v.map(val).join(', ')}]` : JSON.stringify(v);
	if (v.__type || v.type) {
		const t = v.__type || v.type, rest = { ...v }; delete rest.__type; delete rest.type;
		const keys = Object.keys(rest);
		if (keys.length && keys.every((k) => typeof rest[k] !== 'object' || rest[k] === null)) return `${t}(${keys.map((k) => `${k}=${val(rest[k])}`).join(', ')})`;
	}
	return JSON.stringify(v);
};
const ref = (o) => `${o.path || o.name || '?'} [${o.className || '?'}]${o.id ? ` ${o.id}` : ''}`;
const linhas = (arr) => arr.filter((l) => l !== null && l !== undefined && l !== '').join('\n');
const pad = (n, w) => String(n).padStart(w, ' ');
const vec = (v) => (Array.isArray(v) ? `(${v.join(',')})` : String(v ?? '?'));
const numerar = (texto, inicio = 1) => {
	const ls = String(texto).split('\n'), w = String(inicio + ls.length - 1).length;
	return ls.map((l, i) => `${pad(inicio + i, w)}| ${l}`).join('\n');
};

const rodando = (running) => (running && typeof running === 'object' ? Object.entries(running).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(',') : '');
const reloadLinha = (l) => (l ? `ultimo reload #${l.seq}: ${l.label} (${l.count ?? '?'} script(s)) affected=${l.affected} swapped=${l.swapped} ${l.elapsedMs}ms${l.restart ? ' [restart]' : ''}` : null);
const importLinha = (i) => {
	if (!i) return null;
	if (!i.installed) return 'ImportMCP: nao instalado neste place (ServerStorage.ImportMCP ausente)';
	return linhas([
		`ImportMCP: runtime v${i.runtimeVersion ?? '?'} | assets modo sessao materializados neste Studio: ${i.materialized ?? 0}/${i.sessionAssets ?? 0}${i.permanent ? ` | permanentes ${i.permanent}` : ''}${i.pendingMedia ? ` | midias pendentes ${i.pendingMedia}` : ''}${i.liveToken ? '' : ' | sem marca de materializacao (plugin ImportMCP 1.5.0+ nao carregado)'}`,
		...(i.notMaterialized || []).map((p) => `  nao materializado: ${p} (import_manage action=restore target=...)`),
	]);
};

function blocoLive(b) {
	if (!b || typeof b !== 'object') return null;
	const estado = b.applied === true ? 'APLICADO no playtest' : b.applied === false ? 'NAO APLICADO no playtest' : 'registrado';
	const out = [`## sessao viva ${b.state || ''}${b.sessionId ? ` (${b.sessionId})` : ''}: ${estado}${b.persisted === true ? ', persiste ao encerrar' : b.persisted === false ? ', NAO persiste (ver motivo)' : ''}${b.recorded ? `, ${b.recorded} propriedade(s) no journal` : ''}${b.waitedMs != null ? ` | ${b.waitedMs}ms` : ''}`];
	for (const i of b.items || []) {
		const run = rodando(i.running);
		out.push(`  ${i.path || i.id || '?'}: ${i.live ? 'live' : 'NAO live'}${run ? ` rodando[${run}]` : ''}${i.persist === false ? ` | NAO persiste${i.reason ? `: ${i.reason}` : ''}` : ''}${i.compileError ? ` | ERRO DE COMPILACAO: ${i.compileError}` : ''}${i.loadIssue ? ` | carga: ${i.loadIssue}` : ''}${!i.live && i.liveReason && !i.compileError ? ` | ${i.liveReason}` : ''}`);
	}
	if (b.lastReload) out.push(`  ${reloadLinha(b.lastReload)}`);
	for (const s of b.recordSkipped || []) out.push(`  journal ignorou ${s.path}: ${s.reason}`);
	for (const f of b.recordFailed || []) out.push(`  journal FALHOU ${f.path} ${f.property || f.attribute}: ${f.reason}`);
	if (b.note) out.push(`  ${b.note}`);
	if (b.skipped) out.push(`  ${b.skipped}`);
	if (b.error) out.push(`  AVISO: ${b.error}`);
	return linhas(out);
}

function arvore(no, nivel, out) {
	const filhos = no.childCount != null ? ` (${no.childCount}${no.hasMore ? '+' : ''})` : '';
	out.push(`${'  '.repeat(nivel)}${no.name} [${no.className}] ${no.id || ''}${filhos}`.trimEnd());
	for (const f of no.children || []) arvore(f, nivel + 1, out);
}

const R = {
	get_tree(r) {
		if (!r?.tree) return null;
		const out = [`# ${r.tree.path || r.tree.name} depth=${r.depth} nodes=${r.nodes}${r.truncated ? ' TRUNCADO (aumente limit ou reduza depth)' : ''}`];
		arvore(r.tree, 0, out);
		return linhas(out);
	},
	find_instances(r) {
		if (!Array.isArray(r?.results)) return null;
		return linhas([`# ${r.count} resultado(s), ${r.scanned} varridas${r.truncated ? ' TRUNCADO' : ''}`, ...r.results.map(ref)]);
	},
	get_instance(r) {
		if (!r?.className) return null;
		const out = [`# ${ref(r)}${r.parent ? ` parent=${r.parent}` : ''}`];
		for (const [k, v] of Object.entries(r.properties || {})) out.push(`${k} = ${k === 'Source' ? `<${String(v).length} chars; use get_script>` : val(v)}`);
		const attrs = Object.entries(r.attributes || {});
		if (attrs.length) { out.push('## attributes'); for (const [k, v] of attrs) out.push(`@${k} = ${val(v)}`); }
		if (r.tags?.length) out.push(`## tags: ${r.tags.join(', ')}`);
		if (r.script) out.push(`## script: ${r.script.lines} linhas, ${r.script.chars} chars${r.revision ? `, revision=${r.revision}` : ''}`);
		if (r.children) { out.push(`## children (${r.childCount ?? r.children.length})`); for (const c of r.children) out.push(`  ${ref(c)}`); }
		return linhas(out);
	},
	get_script(r) {
		if (typeof r?.source !== 'string') return null;
		const trecho = r.lineStart !== 1 || r.lineEnd !== r.lines ? ` L${r.lineStart}-${r.lineEnd}` : '';
		return `# ${ref(r)} lines=${r.lines}${trecho} revision=${r.revision}\n${numerar(r.source, r.lineStart || 1)}`;
	},
	set_script(r) { return r?.path ? `ok ${ref(r)} lines=${r.lines} chars=${r.chars} edits=${r.edits}${r.revision ? ` revision=${r.revision}` : ''}` : null; },
	create_script(r) { return r?.path ? `criado ${ref(r)}${r.revision ? ` revision=${r.revision}` : ''}` : null; },
	create_instance(r) { return r?.path ? linhas([`criado ${ref(r)} applied=[${(r.applied || []).join(', ')}]`, ...(r.failed || []).map((f) => `  FALHOU ${f.property || f.attribute}: ${f.error}`)]) : null; },
	set_properties(r) { return r?.path ? linhas([`ok ${ref(r)} applied=[${(r.applied || []).join(', ')}]${r.revision ? ` revision=${r.revision}` : ''}`, ...(r.failed || []).map((f) => `  FALHOU ${f.property || f.attribute}: ${f.error}`)]) : null; },
	move_instance(r) { return r?.path ? `movido ${ref(r)}` : null; },
	duplicate_instance(r) { return Array.isArray(r?.created) ? linhas([`# ${r.count} clone(s)`, ...r.created.map(ref)]) : null; },
	delete_instance(r) { return Array.isArray(r?.deleted) ? linhas([`# ${r.count} apagada(s)`, ...r.deleted]) : null; },
	insert_asset(r) {
		if (!Array.isArray(r?.inserted)) return null;
		const out = [`# ${r.count} inserida(s)${r.assetId ? ` asset=${r.assetId}` : ''}${r.assetType ? ` tipo=${r.assetType}` : ''}${r.parts != null ? ` parts=${r.parts}` : ''}`];
		for (const i of r.inserted) out.push(`  ${ref(i)}${i.position ? ` pos=${vec(i.position)}` : ''}${i.size ? ` size=${vec(i.size)}` : ''}`);
		if (r.scriptsRemoved) out.push(`scripts removidos: ${r.scriptsRemoved}`);
		if (r.scripts?.length) { out.push(`## ATENCAO: ${r.scripts.length} script(s) vieram dentro do asset — leia antes de confiar (get_script) ou reinsira com removeScripts=true`); for (const s of r.scripts) out.push(`  ${s}`); }
		return linhas(out);
	},
	inspect_model(r) {
		if (!r?.className || !r.counts) return null;
		const c = r.counts;
		const out = [`# ${ref(r)} parts=${c.parts}${c.meshParts ? ` meshes=${c.meshParts}` : ''}${c.unions ? ` unions=${c.unions}` : ''}${c.models ? ` models=${c.models}` : ''}${c.attachments ? ` attachments=${c.attachments}` : ''}${c.joints ? ` joints=${c.joints}` : ''}${c.constraints ? ` constraints=${c.constraints}` : ''}${c.scripts ? ` SCRIPTS=${c.scripts}` : ''}${c.lights ? ` lights=${c.lights}` : ''}${c.sounds ? ` sounds=${c.sounds}` : ''}${c.particles ? ` fx=${c.particles}` : ''}${c.decals ? ` decals=${c.decals}` : ''}`];
		if (r.note) { out.push(r.note); return linhas(out); }
		if (r.pivot) out.push(`pivot pos=${vec(r.pivot.position)} rot=${vec(r.pivot.orientation)}${r.primaryPart ? ` primary=${r.primaryPart}` : ''}`);
		if (r.bounds) out.push(`bounds size=${vec(r.bounds.size)} center=${vec(r.bounds.center)} min=${vec(r.bounds.min)} max=${vec(r.bounds.max)}`);
		if (r.orientedBounds) out.push(`orientedBounds pos=${vec(r.orientedBounds.position)} rot=${vec(r.orientedBounds.orientation)} size=${vec(r.orientedBounds.size)}`);
		if (r.rig) out.push(`rig ${r.rig.rigType} hp=${r.rig.health} hip=${r.rig.hipHeight} motors=[${(r.rig.motors || []).join(', ')}]`);
		if (Array.isArray(r.parts)) {
			out.push(`## parts (${r.parts.length}${r.partsTruncated ? `, +${r.partsTruncated} menores omitidas; aumente maxParts` : ''}) ${r.space || ''}`);
			for (const p of r.parts) {
				const extra = [];
				if (p.parent) extra.push(`em ${p.parent}`);
				if (p.transparency != null) extra.push(`alpha=${p.transparency}`);
				if (p.anchored === false) extra.push('NAO ancorada');
				if (p.canCollide === false) extra.push('sem colisao');
				if (p.meshId) extra.push(`mesh=${p.meshId}`);
				if (p.specialMesh) extra.push(`specialMesh=${p.specialMesh}`);
				if (p.textureId) extra.push(`tex=${p.textureId}`);
				out.push(`  ${p.name} [${p.shape}] pos=${vec(p.pos)} rot=${vec(p.rot)} size=${vec(p.size)} ${p.material} ${p.color}${extra.length ? ' ' + extra.join(' ') : ''} ${p.id}`);
			}
		}
		if (Array.isArray(r.meshes)) {
			out.push(`## meshes (${r.meshes.length}${r.meshesTruncated ? `, +${r.meshesTruncated} nao abertas; aumente maxMeshes` : ''})`);
			for (const m of r.meshes) {
				if (m.unavailable) { out.push(`  ${m.part}${m.meshId ? ` ${m.meshId}` : ''}: ${m.unavailable}`); continue; }
				out.push(`  ${m.part} ${m.meshId || ''} verts=${m.vertices} faces=${m.faces ?? '?'}${m.bounds ? ` size=${vec(m.bounds.size)} min=${vec(m.bounds.min)} max=${vec(m.bounds.max)}` : ''}${m.centroid ? ` centroid=${vec(m.centroid)}` : ''}${m.textureId ? ` tex=${m.textureId}` : ''} (${m.source})`);
				if (m.vertexSample?.length) out.push(`    v (${m.vertexSampleNote}): ${m.vertexSample.map(vec).join(' ')}`);
				if (m.faceSample?.length) out.push(`    f (${m.faceSampleNote}): ${m.faceSample.map((f) => f.join('-')).join(' ')}`);
			}
		}
		if (r.attachments?.length) { out.push(`## attachments (${r.attachments.length})`); for (const a of r.attachments) out.push(`  ${a.name}${a.parent ? ` em ${a.parent}` : ''} pos=${vec(a.pos)} rot=${vec(a.rot)}`); }
		if (r.joints?.length) { out.push(`## joints (${r.joints.length})`); for (const j of r.joints) out.push(`  ${j.name} [${j.className}] ${j.part0 || '?'} <-> ${j.part1 || '?'}`); }
		if (r.scripts?.length) { out.push(`## scripts (${r.scripts.length})`); for (const s of r.scripts) out.push(`  ${s}`); }
		if (r.projections?.views) {
			out.push(`## projecoes celula=${r.projections.cell} studs | digito 1..9 = mais longe..mais perto do observador (topo: mais baixo..mais alto), "." = vazio${r.projections.note ? ` | ${r.projections.note}` : ''}`);
			for (const v of r.projections.views) {
				out.push(`${v.name} (${v.desc}) ${v.colAxis}:${v.colRange[0]}..${v.colRange[1]} ${v.lineAxis}:${v.lineRange[0]}..${v.lineRange[1]}${v.depth ? ` | 1=${v.depth.axis}${v.depth.far} 9=${v.depth.axis}${v.depth.near}` : ''}`);
				for (const row of v.rows) out.push(`  ${row}`);
			}
		}
		return linhas(out);
	},
	import_asset(r) {
		if (!r?.path || !r.kind) return null;
		const inst = r.instance || r;
		const out = [`importado ${ref(inst)} kind=${r.kind}${r.format ? ` format=${r.format}` : ''} bytes=${r.inputBytes ?? '?'} ms=${r.ms ?? '?'}${r.persisted === false ? ' (nao persistido)' : ''}`];
		if (r.kind === 'Image') out.push(`imagem: ${r.width}x${r.height}${r.resized ? ` (reduzida de ${r.sourceWidth}x${r.sourceHeight})` : ''} property=${r.property}${r.created === false ? ' aplicada em instancia existente' : ''}`);
		else out.push(`mesh: ${r.triangles} triangulos, ${r.vertices} vertices, ${r.groups} grupo(s), ${r.chunks} chunk(s), ${r.textures ?? 0} textura(s)${r.size ? ` tamanho=${[r.size.x, r.size.y, r.size.z].map((n) => Number(n).toFixed(2)).join('x')}` : ''}${r.droppedTriangles ? ` descartados=${r.droppedTriangles}` : ''}${r.skippedPrimitives ? ` primitivasIgnoradas=${r.skippedPrimitives}` : ''}${r.payloadBytes ? ` persistido=${r.payloadBytes}B` : ''}`);
		if (Array.isArray(r.propertiesApplied) && r.propertiesApplied.length) out.push(`applied=[${r.propertiesApplied.join(', ')}]`);
		for (const f of r.propertiesFailed || []) out.push(`  FALHOU ${f.property || f.name || '?'}: ${f.error || f.message || JSON.stringify(f)}`);
		for (const n of r.notes || []) out.push(`nota: ${typeof n === 'string' ? n : JSON.stringify(n)}`);
		return linhas(out);
	},
	export_file(r) {
		if (!r || typeof r !== 'object' || !r.kind) return null;
		const out = [`# export ${r.kind}${r.path ? ` ${ref(r)}` : ''}${r.fileName ? ` file=${r.fileName}` : ''}${r.bytes != null ? ` bytes=${r.bytes}` : ''}${r.lines != null ? ` lines=${r.lines}` : ''}${r.instances != null ? ` instances=${r.instances}` : ''}${r.revision ? ` revision=${r.revision}` : ''}${r.ms != null ? ` ${r.ms}ms` : ''}`];
		if (r.mesh) out.push(`mesh: vertices=${r.mesh.vertices} faces=${r.mesh.faces} normals=${r.mesh.normals ?? 0} uvs=${r.mesh.uvs ?? 0}${r.mesh.meshId ? ` meshId=${r.mesh.meshId}` : ''}`);
		if (r.url) out.push(`url: ${r.url}${r.expiresInSeconds ? ` (expira em ${r.expiresInSeconds}s)` : ''}`);
		if (Array.isArray(r.assets) && r.assets.length) {
			out.push(`## assets (${r.assets.length})`);
			for (const a of r.assets) out.push(`  ${a.assetId} ${a.property || ''}${a.className ? ` [${a.className}]` : ''}${a.path ? ` ${a.path}` : ''}${a.url ? `\n    ${a.url}` : ''}`);
		}
		for (const n of r.notes || []) out.push(`nota: ${typeof n === 'string' ? n : JSON.stringify(n)}`);
		if (r.hint) out.push(r.hint);
		if (typeof r.content === 'string') out.push(`## content (${r.content.length} chars)`, r.content);
		return linhas(out);
	},
	import_upload(r) {
		if (!r || typeof r !== 'object') return null;
		if (Array.isArray(r.uploads)) return linhas([`# ${r.uploads.length} upload(s)`, ...r.uploads.map((u) => `  ${u.Id || u.id || u.Name || '?'} state=${u.State || u.state || '?'} chunks=${u.Chunks ?? u.chunks ?? '?'} chars=${u.Chars ?? u.chars ?? '?'}${u.FileName ? ` file=${u.FileName}` : ''}`)]);
		if (r.removed != null && r.id == null) return `${typeof r.removed === 'number' ? r.removed : r.removed ? 1 : 0} upload(s) removido(s)`;
		if (r.id == null && r.Id == null) return null;
		const id = r.id || r.Id;
		return `upload ${id}${r.State || r.state ? ` state=${r.State || r.state}` : ''}${r.Chunks != null ? ` chunks=${r.Chunks}` : ''}${r.Chars != null ? ` chars=${r.Chars}` : ''}${r.Bytes != null ? ` bytes=${r.Bytes}` : ''}${r.chunkHint ? `\n${r.chunkHint}` : ''}`;
	},
	import_status(r) {
		if (!r || typeof r !== 'object') return null;
		if (r.State) return linhas([`job ${r.Id || r.id || '?'} state=${r.State}${r.done ? ' (concluido)' : ''}${r.FileName ? ` file=${r.FileName}` : ''}`, r.Error ? `ERRO: ${r.Error}` : null, r.Result ? `resultado: ${typeof r.Result === 'string' ? r.Result : JSON.stringify(r.Result)}` : null]);
		if (!r.version) return null;
		const rt = r.runtime || {};
		const out = [`# ImportMCP ${r.version} | runtime ${rt.installed ? `v${rt.version}${rt.upToDate === false ? ' (DESATUALIZADO)' : ''} em ${rt.path}` : 'NAO instalado (import_manage action=install)'} | plugin ImportMCP ${r.workerAlive ? 'ativo' : 'inativo (fila queue nao processa)'}${r.playing ? ' | PLAY ATIVO: pare antes de importar' : ''}`];
		out.push(`uploads: ${r.uploads ?? 0} | fila: ${r.queued ?? 0} | assets persistidos: ${r.imports ?? 0}`);
		const p = r.progress;
		if (p && (p.active || p.stage || p.name)) out.push(`progresso: ${p.active ? 'ATIVO' : 'parado'}${p.name ? ` ${p.name}` : ''}${p.stage ? ` etapa=${p.stage}` : ''}${p.percent != null ? ` ${p.percent}%` : ''}`);
		const l = r.limits || {};
		out.push(`limites: arquivo ${Math.round((l.maxBytes || 0) / 1048576)} MiB, textura ${l.maxTexture}px, ${l.triangles} triangulos, ${l.vertices} vertices`);
		if (Array.isArray(r.assets)) { out.push(`## assets (${r.assets.length})`); for (const a of r.assets) out.push(`  ${a.path || a.Path || '?'} [${a.className || a.class || a.Class || '?'}] kind=${a.kind || a.Kind || '?'}${a.bytes != null || a.Bytes != null ? ` bytes=${a.bytes ?? a.Bytes}` : ''}${a.status || a.Status ? ` status=${a.status || a.Status}` : ''}`); }
		return linhas(out);
	},
	import_manage(r) {
		if (!r || typeof r !== 'object') return null;
		if (r.removed) return `removido ${r.removed}`;
		if (r.detached) return `persistencia removida de ${r.detached} (instancia mantida)`;
		if (r.runtime && r.installedNow != null) return `runtime ${r.installedNow ? 'instalado' : 'ja estava instalado'} em ${r.runtime} v${r.version}; inbox ${r.inbox}`;
		if (r.restored != null) return linhas([`restaurados ${r.restored}${r.failed ? `, falharam ${r.failed}` : ''}${r.skipped != null ? `, ignorados ${r.skipped}` : ''}`, ...(r.errors || []).map((e) => `  ERRO ${typeof e === 'string' ? e : JSON.stringify(e)}`)]);
		if (r.path && r.status) return `restaurado ${r.path} status=${r.status}`;
		return null;
	},
	get_selection(r) { return Array.isArray(r?.selection) ? linhas([`# ${r.count} selecionada(s)`, ...r.selection.map(ref)]) : null; },
	set_selection(r) { return r?.selected != null ? `selecionadas ${r.selected}` : null; },
	undo_history(r) { return r?.action ? `${r.action} ${r.steps}/${r.requested} passo(s)` : null; },
	grep_scripts(r) {
		if (!Array.isArray(r?.results)) return null;
		const out = [`# "${r.pattern}"${r.regex ? ' (padrao Lua)' : ''}: ${r.count} ocorrencia(s) em ${r.matchedScripts}/${r.scripts} script(s)${r.truncated ? ' TRUNCADO (use limit/target/scriptName)' : ''}`];
		for (const s of r.results) {
			out.push(`## ${ref(s)} lines=${s.lines}${s.truncated ? ' (mais ocorrencias; use maxPerScript)' : ''}`);
			for (const m of s.matches) {
				for (let i = 0; i < (m.before || []).length; i++) out.push(`  ${pad(m.line - m.before.length + i, 5)}  ${m.before[i]}`);
				out.push(`  ${pad(m.line, 5)}: ${m.text}`);
				for (let i = 0; i < (m.after || []).length; i++) out.push(`  ${pad(m.line + 1 + i, 5)}  ${m.after[i]}`);
			}
		}
		return linhas(out);
	},
	outline_script(r) {
		if (!Array.isArray(r?.functions)) return null;
		const out = [`# ${ref(r)} lines=${r.lines} chars=${r.chars}`];
		if (r.services?.length) out.push(`services: ${r.services.map((s) => `${s.name}=${s.service}`).join(', ')}`);
		if (r.requires?.length) { out.push('## requires'); for (const q of r.requires) out.push(`  ${pad(q.line, 5)} ${q.name} = require(${q.module})`); }
		out.push(`## outline (${r.functions.length})`);
		const w = String(r.lines).length;
		for (const f of r.functions) {
			const ind = ' '.repeat(Math.min(Math.floor((f.indent || 0) / (f.indent > 0 && f.indent % 4 === 0 ? 4 : 1)) * 2, 12));
			if (f.kind === 'require') continue;
			const corpo = f.kind === 'local' ? `local ${f.name}` : f.kind === 'return' ? `return ${f.name}` : `${f.kind} ${f.name}(${f.params || ''})`;
			out.push(`  ${pad(f.line, w)} ${ind}${corpo}`);
		}
		return linhas(out);
	},
	run_luau(r) {
		if (!r || typeof r !== 'object' || !('returned' in r || 'output' in r)) return null;
		const out = [];
		const ret = r.returned;
		if (r.returnCount > 0) {
			const vals = Array.isArray(ret) ? ret : [ret];
			for (const v of vals) out.push(typeof v === 'string' ? v : JSON.stringify(v, null, vals.length === 1 && v && typeof v === 'object' ? 1 : 0));
		} else out.push('(sem retorno)');
		if (r.output?.length) { out.push(`## output (${r.output.length}${r.outputSuppressed ? `, +${r.outputSuppressed} suprimidas` : ''})`); for (const l of r.output) out.push(typeof l === 'string' ? l : (l.level && l.level !== 'output' && l.level !== 'Print' ? `[${l.level}] ` : '') + (l.message ?? l.text ?? JSON.stringify(l))); }
		const meta = [`ms=${r.ms}`];
		if (r.tasksSpawned) meta.push(`tasks=${r.tasksSpawned}`);
		if (r.freshModules?.length) meta.push(`fresh=${r.freshModules.length}`);
		if (r.watchdog && typeof r.watchdog === 'object' && r.watchdog.yields) meta.push(`yields=${r.watchdog.yields}`);
		out.push(`-- ${meta.join(' ')}`);
		for (const w of r.warnings || []) out.push(`AVISO: ${w}`);
		if (r.touchedLockedScripts?.length) out.push(`TOCOU SCRIPTS TRAVADOS: ${r.touchedLockedScripts.map((t) => t.path || t).join(', ')}`);
		return linhas(out);
	},
	agent_open(r) {
		if (!r?.agent) return null;
		const out = [`agent=${r.agent}${r.fixed ? ' (fixo pela URL)' : ''}`];
		if (r.selected) out.push(`place marcado: ${r.selected.alias} (${r.selected.place})`);
		else if (r.studiosOnline > 1) out.push(`ATENCAO: ${r.studiosOnline} Studios online (${(r.studios || []).map((s) => `${s.alias}=${s.place}`).join(', ')}); marque o seu com studio_select place=<alias> ou passe place= em cada chamada.`);
		out.push('Passe agent em todas as chamadas; agent_close ao terminar.');
		return linhas(out);
	},
	studio_select(r) {
		if (!r?.agent) return null;
		const out = [`# studio_select agent=${r.agent}: ${r.selected ? `marcado ${r.selected.alias} (${r.selected.place}, placeId ${r.selected.placeId})${r.selectedOnline === false ? ' OFFLINE' : ''}` : r.cleared ? 'marcacao removida' : 'nada marcado'}`];
		for (const s of r.studios || []) out.push(`  ${s.selected ? '*' : ' '} ${s.alias}  ${s.place || '(sem nome)'}  placeId=${s.placeId}  contato=${s.segundosDesdeOContato}s${s.test?.active ? `  teste ${s.test.mode} ativo` : ''}`);
		if (r.hint) out.push(r.hint);
		return linhas(out);
	},
	agent_close(r) { return r?.agent ? `agent ${r.agent} encerrado; ${r.released ?? 0} trava(s) liberada(s)` : null; },
	file_lock(r) { return Array.isArray(r?.locks) ? linhas([`# ${r.locks.length} reserva(s) por ${r.agent}, ${r.seconds}s`, ...r.locks.map((l) => `  ${l.kind || l.mode || ''} ${l.path || l.id || ''}${l.recursive ? ' (recursivo)' : ''}`)]) : null; },
	file_unlock(r) { return r?.released != null ? `${r.released} trava(s) liberada(s)` : null; },
	file_locks(r) {
		if (!Array.isArray(r?.locks)) return null;
		const out = [`# ${r.total ?? r.locks.length} trava(s)${r.nextOffset ? ` (mais: offset=${r.nextOffset})` : ''} graca=${r.readGraceSeconds}s`];
		for (const l of r.locks) out.push(`  ${l.kind || l.mode || '?'} ${l.path || l.id || '?'} dono=${l.agent || l.owner || '?'}${l.recursive ? ' recursivo' : ''}${l.expiresIn != null ? ` expira=${l.expiresIn}s` : l.ttl != null ? ` ttl=${l.ttl}s` : ''}${l.active ? ' ATIVA' : ''}`);
		if (Array.isArray(r.audit) && r.audit.length) { out.push(`## auditoria (${r.audit.length})`); for (const a of r.audit.slice(-15)) out.push(`  ${typeof a === 'string' ? a : `${a.event || a.type || ''} ${a.agent || ''} ${a.path || a.tool || ''}`.trim()}`); }
		return linhas(out);
	},
	studio_status(r) {
		if (!r?.servidor) return null;
		const studios = r.studios || [], varios = studios.length > 1;
		const out = [`# ${r.servidor} | ${varios ? `${studios.length} Studios ONLINE` : `Studio ${r.studioOnline ? 'ONLINE' : 'OFFLINE'}`}${r.agent ? ` | agent=${r.agent}` : ''}${r.selected ? ` | place marcado=${r.selected.alias}${r.selected.online ? '' : ' (OFFLINE)'}` : ''}`];
		for (const s of studios) {
			const teste = s.test?.active ? ` | teste ${s.test.mode} ATIVO (${s.test.testId || 'manual'}) logsSince=${s.test.logsSince} relays=${(s.test.relays || []).map((x) => x.ctx).join(',') || '-'}` : '';
			out.push(`${varios ? `${s.selected ? '*' : ' '} ${s.alias}  ` : ''}place: ${s.place || '(sem nome)'} (${s.placeId}) plugin=${s.versaoPlugin} studio=${s.studio} contato=${s.segundosDesdeOContato}s atras${s.ferramentasFaltando?.length ? ` FALTAM: ${s.ferramentasFaltando.join(', ')}` : ''}${varios ? teste : ''}`);
			if (s.controle) out.push(`${varios ? '      ' : ''}travas: ${s.controle.locks ?? 0} | agentes: ${s.controle.agents ?? 0} | ativas: ${s.controle.active ?? 0} | executando: ${s.controle.executing ?? 0}`);
			const lv = s.test?.liveSession;
			if (lv) out.push(`${varios ? '      ' : ''}sessao viva: ${lv.state || '?'}${lv.sessionId ? ` (${lv.sessionId})` : ''}${lv.engine ? ` motor=${lv.engine}` : ''}${lv.reloads != null ? ` reloads=${lv.reloads}` : ''} (livesession_status)`);
		}
		const e = r.estatisticas || {};
		out.push(`fila: ${r.filaEsperando} esperando, ${r.emExecucao} em execucao, ${r.longPollsAbertos} poll(s) | chamadas ${e.chamadas} ok=${e.ok} erro=${e.erro} expiradas=${e.expiradas}`);
		out.push(`logs: ${r.logs?.total} no buffer, seq=${r.logs?.seq}${r.logs?.dropped ? `, ${r.logs.dropped} descartadas` : ''}`);
		if (!varios) { const t = r.test; out.push(t?.active ? `teste: ${t.mode} ATIVO (${t.testId || 'manual'}) logsSince=${t.logsSince} relays=${(t.relays || []).map((x) => x.ctx).join(',') || '-'}` : 'teste: inativo'); }
		out.push(`screenshot: helper ${r.screenshot?.helperOnline ? 'online' : 'offline'}`);
		if (r.dica) out.push(r.dica);
		return linhas(out);
	},
	livesession_status(r) {
		if (!r || typeof r !== 'object' || (!('installed' in r) && !r.state)) return null;
		if (r.installed === false) return linhas(['# Sessao Viva: NAO carregada neste Studio', r.hint, importLinha(r.importmcp)]);
		const out = [`# Sessao Viva ${r.version || ''} | ${r.stateLabel || r.state}${r.running ? ' | PLAYTEST ATIVO no editor' : ''} | motor=${r.engine || '?'}${r.compatibility ? ' (compatibilidade: sem hot reload granular)' : ''}${r.sessionId ? ` | sessao=${r.sessionId}` : ''}${r.uptimeSeconds != null ? ` | ${r.uptimeSeconds}s` : ''}`];
		if (r.live) {
			out.push(`fps=${r.fps ?? '?'} | fisica: ${r.physics ?? '?'} | scripts rodando: server=${r.scripts?.server ?? 0} client=${r.scripts?.client ?? 0}${r.observed != null ? ` | instancias observadas=${r.observed}` : ''}`);
			const h = r.hotReload;
			if (h) {
				out.push(`hot reload: ${h.active ? 'ATIVO' : 'parado'}${h.granular === false ? ' (sem granularidade)' : ''} | reloads=${h.reloads} pendentes=${h.pending} debounce=${h.debounceSeconds}s`);
				if (h.last) out.push(`  ${reloadLinha(h.last)}`);
				for (const b of h.broken || []) out.push(`  QUEBRADO ${b.path}: ${b.error}`);
			}
			const j = r.journal;
			if (j) out.push(`journal: ${j.entries} entrada(s), ${Math.round((j.chars || 0) / 1024)} KB${j.degraded ? ' DEGRADADO (settings do plugin)' : ''} | tipos ${Object.entries(j.byKind || {}).map(([k, n]) => `${k}=${n}`).join(' ') || '-'} | origens ${Object.entries(j.byOrigin || {}).map(([k, n]) => `${k}=${n}`).join(' ') || '-'}`);
			for (const i of r.loadIssues || []) out.push(`  NAO CARREGOU ${i.path}: ${i.issue}`);
			const u = r.unpersisted || {};
			for (const c of u.cloneEdits || []) out.push(`  NAO PERSISTE (clone) ${c.path} -> edite ${c.original}`);
			for (const c of u.runtimeEdits || []) out.push(`  NAO PERSISTE (criado pelo jogo) ${c.path}`);
			if (u.ambiguous) out.push(`  ${u.ambiguous} mudanca(s) ambigua(s) irao para a revisao ao encerrar`);
			if (r.client) out.push(`jogador virtual: ${r.client.active ? r.client.status : 'inativo'} | ScreenGuis montadas=${r.client.guiMounted}${r.client.guiSync ? ' | StarterGui espelhado em tempo real' : ''}`);
			if (r.output) out.push(`output da sessao: ${r.output.errors} erro(s), ${r.output.warnings} aviso(s) (livesession_journal log=output)`);
		}
		if (r.nativePlayTest?.active) out.push(`play test NATIVO ativo (${r.nativePlayTest.mode || '?'})`);
		out.push(importLinha(r.importmcp));
		return linhas(out);
	},
	livesession_control(r) {
		if (!r?.action) return null;
		if (r.action === 'status') return R.livesession_status(r);
		const out = [`# livesession_control ${r.action}: ${r.stateLabel || r.state || '?'}${r.requested === false ? ' (nada a fazer neste estado)' : ''}${r.waitingUser ? ' | aguardando confirmacao do usuario no Studio' : ''}${r.sessionId ? ` | sessao=${r.sessionId}` : ''}`];
		if (r.reason) out.push(`motivo: ${r.reason}`);
		if (r.restarted != null) out.push(`reiniciados: ${r.restarted}/${r.requested}`);
		for (const b of r.broken || []) out.push(`  QUEBRADO ${b.path}: ${b.error}`);
		if (r.lastReload) out.push(reloadLinha(r.lastReload));
		if (r.recorded != null) out.push(`registradas no journal: ${r.recorded}`);
		for (const s of r.skipped || []) out.push(`  ignorado ${s.path}: ${s.reason}`);
		for (const f of r.failed || []) out.push(`  FALHOU ${f.path} ${f.property || f.attribute}: ${f.reason}`);
		if (r.remounted != null) out.push(`UI remontada: ${r.remounted} ScreenGui(s)`);
		return linhas(out);
	},
	livesession_verify(r) {
		if (!Array.isArray(r?.results)) return null;
		const s = r.summary || {}, total = s.total ?? r.results.length;
		const out = [`# Sessao Viva ${r.stateLabel || r.state || '?'}: ${s.live ?? '?'}/${total} live, ${s.persist ?? '?'}/${total} persistem${r.waitedMs ? ` | esperou ${r.waitedMs}ms` : ''}${r.reloads != null ? ` | reloads=${r.reloads}` : ''}`];
		for (const i of r.results) {
			const run = rodando(i.running);
			out.push(`${i.path || '?'} [${i.className || '?'}]${i.id ? ` ${i.id}` : ''}: ${i.exists === false ? 'NAO EXISTE' : i.live ? 'live' : 'NAO live'}${run ? ` rodando[${run}]` : ''}${i.synced === false ? ' dessincronizado' : ''}${i.pending ? ' reload pendente' : ''} | ${i.persist ? 'persiste' : 'NAO persiste'}${i.reason ? `: ${i.reason}` : ''}`);
			if (i.compileError) out.push(`  ERRO DE COMPILACAO: ${i.compileError}`);
			if (i.loadIssue) out.push(`  carga: ${i.loadIssue}`);
			if (!i.live && i.liveReason && !i.compileError) out.push(`  ${i.liveReason}`);
		}
		if (r.lastReload) out.push(reloadLinha(r.lastReload));
		return linhas(out);
	},
	livesession_journal(r) {
		if (!Array.isArray(r?.entries)) return null;
		if (!('total' in r)) {
			const out = [`# Output da Sessao Viva: ${r.entries.length} linha(s) | erros=${r.errors ?? 0} avisos=${r.warnings ?? 0} | nextSince=${r.nextSince}`];
			for (const e of r.entries) out.push(`[${e.time}] [${e.kind}] ${e.text}`);
			return linhas(out);
		}
		const out = [`# journal da Sessao Viva${r.sessionId ? ` ${r.sessionId}` : ''}: ${r.entries.length}/${r.matched ?? 0} (total ${r.total}) | nextSince=${r.nextSince}${r.closed ? ' | FECHADO' : ''}${r.live === false ? ' | sessao parada' : ''}`];
		for (const e of r.entries) out.push(`#${e.seq} ${e.kind} ${e.path || e.id}${e.property ? `${e.attribute ? '@' : '.'}${e.property}` : ''}${e.className ? ` [${e.className}]` : ''} origem=${e.origin || '?'}${e.sourceLength != null ? ` ${e.sourceLength} chars` : ''}${e.value != null ? ` = ${e.value}` : ''}`);
		return linhas(out);
	},
	studio_play(r) {
		if (!r?.action) return null;
		const out = [`# studio_play ${r.action}: ${r.active ? `ATIVO (${r.mode})` : 'inativo'}${r.testId ? ` testId=${r.testId}` : ''}${r.logsSince != null ? ` logsSince=${r.logsSince}` : ''}${r.stopped != null ? ` stopped=${r.stopped}` : ''}`];
		if (r.relays?.length) out.push(`relays: ${r.relays.map((x) => `${x.ctx}(${x.secondsSinceContact}s)`).join(', ')}`);
		if (r.serverRelayConnected != null) out.push(`serverRelayConnected=${r.serverRelayConnected}`);
		if (r.error) out.push(`ERRO: ${r.error}`);
		if (r.result !== undefined) out.push(`resultado: ${JSON.stringify(r.result)}`);
		if (r.relayError) out.push(`relay: ${r.relayError.message || JSON.stringify(r.relayError)}`);
		if (r.hint) out.push(r.hint);
		return linhas(out);
	},
};

export function renderizar(tool, valor) {
	if (valor == null || typeof valor !== 'object') return null;
	const fn = R[tool];
	if (!fn) return null;
	try {
		const texto = fn(valor);
		if (texto != null && valor.liveSession && !tool.startsWith('livesession_')) {
			const extra = blocoLive(valor.liveSession);
			return extra ? `${texto}\n${extra}` : texto;
		}
		return texto;
	} catch { return null; }
}

export function renderizarErro(e) {
	if (typeof e === 'string') return `ERRO: ${e}`;
	if (!e || typeof e !== 'object') return `ERRO: ${String(e)}`;
	const { code, message, ...rest } = e;
	const flags = [];
	if (rest.nothingExecuted === true) { flags.push('nada executado'); delete rest.nothingExecuted; }
	else if (rest.nothingExecuted === false) delete rest.nothingExecuted;
	if (rest.executionUnknown) { flags.push('execucao incerta'); delete rest.executionUnknown; }
	if (rest.retryAfterMs != null) { flags.push(`retryAfterMs=${rest.retryAfterMs}`); delete rest.retryAfterMs; }
	const out = [`ERRO ${code || ''}: ${esc(message || '')}${flags.length ? ` (${flags.join('; ')})` : ''}`.replace(/^ERRO : /, 'ERRO: ')];
	if (Array.isArray(rest.output) && rest.output.length) { out.push(`## output (${rest.output.length})`); for (const l of rest.output) out.push(typeof l === 'string' ? l : (l.message ?? l.text ?? JSON.stringify(l))); delete rest.output; }
	if (Array.isArray(rest.owners) && rest.owners.length) { out.push(`donos: ${rest.owners.map((o) => typeof o === 'string' ? o : `${o.agent || '?'}(${o.kind || o.mode || ''} ${o.path || ''})`).join(', ')}`); delete rest.owners; }
	const sobra = Object.keys(rest);
	if (sobra.length) out.push(JSON.stringify(rest));
	return linhas(out);
}
