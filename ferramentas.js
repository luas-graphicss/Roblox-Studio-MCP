export const VERSAO_CATALOGO = '2.9.0';

export const INSTRUCOES = [
	'Voce esta conectado a uma sessao do Roblox Studio pelo plugin "MCP Studio (Notion)". Tudo o que voce chamar aqui roda dentro do Studio aberto na maquina do usuario, com permissao de plugin.',
	'',
	'Como se localizar (do mais barato para o mais caro):',
	'- studio_status lista os Studios/places conectados nesta sessao (alias s1, s2..., nome, placeId, qual esta marcado para voce), se estao online e ha quanto tempo. Ele responde mesmo com tudo fechado; use quando algo parecer errado.',
	'',
	'Varios places na mesma URL (2.8.0):',
	'- A mesma sessao aceita varios Roblox Studio abertos ao mesmo tempo (places diferentes, ou o mesmo place em janelas diferentes). Cada um recebe um alias curto e estavel (s1, s2, ...) que aparece em studio_status e na janela do plugin.',
	'- Com UM Studio online nada muda: toda chamada vai para ele. Com DOIS ou mais, cada chamada precisa saber o destino: marque o seu place uma vez com studio_select place=<alias|nome|placeId> (fica valendo para o seu agent em todas as chamadas seguintes, inclusive get_logs e studio_play) ou passe place=... na propria chamada (vale so para ela e prevalece sobre a marcacao). agent_open aceita place para ja marcar ao abrir a identidade.',
	'- Sem marcacao e com mais de um Studio online a chamada e recusada com PLACE_REQUIRED (nada executado) listando as opcoes. PLACE_NOT_FOUND/PLACE_AMBIGUOUS indicam seletor errado; PLACE_OFFLINE indica que o place marcado desconectou (nao ha failover silencioso para outro place).',
	'- Travas, revisoes e ids de instancia sao POR Studio: um id lido em s1 nao vale em s2. Logs de varios places vem etiquetados [contexto@alias]; get_logs place=all mostra todos.',
	'- get_tree mostra a arvore do explorer a partir de um ponto. find_instances procura por nome ou classe. get_instance devolve as propriedades de uma instancia.',
	'- grep_scripts procura texto/padrao em todos os scripts de uma subarvore e devolve script:linha:trecho. outline_script devolve so a estrutura (funcoes, requires, locais) de um script. Fluxo eficiente: grep_scripts -> outline_script -> get_script com lineStart/lineEnd -> set_script com edits. Nao leia scripts inteiros para achar uma funcao.',
	'- Toda resposta vem em texto compacto por padrao; passe format=json quando precisar do objeto bruto. Erros comecam com "ERRO CODIGO:".',
	'',
	'Como apontar para uma instancia (parametro target/parent):',
	'- caminho: "game.Workspace.Plataforma.Piso" (o prefixo "game." e opcional) ou "Workspace/Plataforma/Piso";',
	'- id: devolvido por qualquer leitura (ex.: i_<plugin>_42). O id nao quebra quando a instancia e renomeada e e mais barato; prefira id em sequencias de edicao.',
	'',
	'Valores de propriedade sao convertidos automaticamente:',
	'- Vector3/Vector2: {"x":1,"y":2,"z":3} ou [1,2,3]; CFrame: {"position":[0,5,0],"orientation":[0,90,0]} (graus);',
	'- Color3: "#ff8800" ou [255,136,0] ou [1,0.5,0]; BrickColor: "Bright red";',
	'- UDim2: {"x":{"scale":0.5,"offset":0},"y":{"scale":0,"offset":40}} ou [0.5,0,0,40];',
	'- Enum: so o nome ("Neon", "SmoothPlastic") ou "Enum.Material.Neon";',
	'- referencia de instancia: caminho ou id.',
	'',
	'Ambiente controlado (sempre ativo; sem equipes):',
	'- Se varios agentes compartilham a conexao MCP, CADA um chama agent_open e usa seu agent em TODAS as chamadas. Nunca compartilhe a identidade. Sem agent explicito, o Mcp-Session-Id identifica um unico agente; o nome do cliente nao identifica pessoas/agentes.',
	'- get_script adquire leitura compartilhada automaticamente: outro agente pode ler, mas nao escrever. A trava dura a chamada mais 8s de graca por padrao (configuravel). get_instance protege a instancia lida; arvore/busca fazem leituras transitorias.',
	'- Escritas adquirem exclusividade antes de qualquer alteracao e liberam ao terminar, inclusive no erro. Nao ha espera oculta por trava: LOCK_CONFLICT informa donos e retryAfterMs. Nao contorne com outra ferramenta.',
	'- Antes de alterar Source, leia com get_script. O retorno traz revision. set_script e set_properties(Source) recusam versao antiga, inclusive se o usuario editou no editor. expectedRevision permite informar explicitamente a revisao lida.',
	'- Para pensar/editar por mais tempo que a graca, use file_lock com kind=read ou write e targets, renove antes de expirar e solte com file_unlock. Leitores podem conviver; a promocao para write exige que os outros leitores liberem. Em impasse, solte suas leituras e coordene uma nova tentativa.',
	'- file_unlock e agent_close liberam apenas travas do proprio agente. file_locks mostra ocupacao, prazos e auditoria; nenhum parametro force burla a protecao.',
	'- Renomear, mover ou apagar um ancestral protege a subarvore: nao pode apagar uma pasta contendo script que outro agente esta lendo. IDs permanecem os mesmos em renomeacoes e mudam ao reiniciar o plugin.',
	'- run_luau e LIVRE: nao adquire trava, nao e recusado por leituras/reservas de outros agentes nem por revisoes antigas, e nao bloqueia ninguem. Use-o para validar e testar sistemas a qualquer momento, quantas vezes precisar.',
	'- Em contrapartida, NAO edite Source de scripts por run_luau. Edicoes de codigo passam por set_script/set_properties(Source), que respeitam quem esta lendo. Se o codigo do run_luau alterar um script travado por outro agente, o resultado traz warnings e touchedLockedScripts e o fato fica na auditoria de file_locks.',
	'- Em run_luau, task.spawn/defer/delay e spawn/delay sao acompanhados: a chamada aguarda essas tarefas e as cancela no erro/prazo. Use MCP.trackConnection(conn) para registrar conexoes de sinais e remove-las ao sair. Nao deixe rotinas persistentes ou efeitos externos escaparem do escopo.',
	'- Anti-congelamento: o codigo do run_luau recebe pontos de yield automaticos em todo loop e em toda entrada de funcao, e todo o plugin divide um unico orcamento de CPU por quadro (~30% do quadro). Loops pesados e recursao cedem o quadro sozinhos e sao abortados no prazo (EXECUTION_TIMEOUT) sem travar o Studio. Codigo em que NAO e possivel inserir pontos de yield e RECUSADO (WATCHDOG_UNAVAILABLE, nada executado) em vez de rodar sem protecao; trabalho pesado dentro de table.sort/string.gsub com funcao/metametodos (onde nao da para ceder) e abortado com NO_YIELD_POINT. Chamadas nativas unicas muito caras (Clone de modelo gigante, GetDescendants de place enorme, table.create imenso) ainda nao podem ser interrompidas: divida o trabalho.',
	'- Retorne dados agregados, nao dumps: o resultado de uma chamada e limitado a ~700KB (RESULT_TOO_LARGE, a execucao ja aconteceu), tabelas sao truncadas em 2000 entradas e so as primeiras 300 linhas de print vao para o Output (outputSuppressed informa quantas foram suprimidas). Filtre/pagine no proprio codigo.',
	'- Este controle e cooperativo, nao uma sandbox contra codigo malicioso, outros plugins ou scripts do jogo.',
	'- Ao terminar uma tarefa, chame agent_close. Agentes trabalham em paralelo; o Studio executa ate 4 chamadas ao mesmo tempo (um run_luau demorado nao segura os outros) e as travas por instancia garantem que escritas nao se sobreponham. Uma sessao aceita varios Studios/places; veja "Varios places na mesma URL".',
	'',
	'Testar e validar de verdade (play test, logs e codigo dentro da sessao):',
	'- studio_play controla a simulacao: action=play (Play Solo, com personagem), run (so servidor, mesmo DataModel), multiplayer (players=N), stop, pause, resume, status, reset. O retorno traz logsSince: use get_logs com since=logsSince para ler SOMENTE o que a sessao produziu. Se alguem parou o teste pelo botao do Studio, status volta a active=false sozinho; se ainda assim aparecer TEST_ALREADY_RUNNING com o Studio no editor, use action=reset e inicie de novo.',
	'- get_logs devolve o Output do Studio unificado e inteiro: contexto edit (editor), server e client (DataModels da sessao de teste). Use context para filtrar, since=nextSince para paginar/acompanhar e waitMs (ate 25000) para esperar novas linhas em tempo real enquanto o teste roda. format=text (padrao) entrega linhas limpas [hora] [contexto] [nivel] mensagem; format=json entrega objetos.',
	'- O plugin reconcilia o historico real do Output (LogService:GetLogHistory) a cada segundo, nao depende so do evento MessageOut: o que aparece no Output do Studio chega ao get_logs em ~1s. Se o Worker nao tiver nenhuma linha do editor daquele Studio (reiniciou), get_logs pede ao plugin as ultimas linhas antes de responder (cabecalho "backfill"). Sem waitMs, uma leitura vazia com o Studio online espera ate 1s por linhas a caminho.',
	'- Fluxo recomendado: studio_play play -> get_logs since=logsSince waitMs=10000 (repita ate ver o que precisa) -> run_luau context=server para inspecionar estado real do servidor da sessao (ou context=client) -> studio_play stop -> get_logs since=logsSince level=error para conferir se nada quebrou.',
	'- run_luau context=server/client executa DENTRO da sessao de teste em andamento (exige studio_play play/multiplayer ativo); sem context, executa no editor. Alteracoes feitas dentro da sessao sao descartadas quando o teste para, como no Studio.',
	'- run_luau no editor usa require FRESCO por padrao (freshRequire=true): cada ModuleScript exigido e recompilado a partir do texto atual do editor, inclusive edicoes recem-feitas por set_script. Nao existe cache de require antigo entre chamadas; nao e necessario clonar modulos ou reiniciar o plugin para validar. O resultado lista freshModules. Use freshRequire=false ou MCP.require(mod,{fresh=false}) para o require nativo (cache do Studio).',
	'- studio_screenshot captura a janela do Roblox Studio (imagem PNG + URL) via o helper opcional de captura (captura/captura-studio.ps1, Windows). Sem o helper ligado a ferramenta responde CAPTURE_HELPER_OFFLINE com instrucoes; nenhuma API de plugin le pixels da janela.',
	'',
	'Toolbox e visao 3D (2.7.0):',
	'- toolbox_search pesquisa a Creator Store por categoria (models, audio, decals, meshes, plugins, videos) e devolve id, criador, votos, triangulos, se ha SCRIPTS dentro e a miniatura de cada resultado como imagem: olhe as miniaturas para escolher o que combina com a cena. Prefira criadores verificados/endossados e modelos sem scripts; se inserir um com scripts, leia-os (get_script) ou passe removeScripts=true.',
	'- insert_asset coloca o asset no place com o tipo certo: modelo (LoadAsset), audio (Sound), decal/imagem (Decal/Texture em BasePart, ImageLabel em Gui), mesh (MeshPart), video (VideoFrame). position=[x,y,z] posiciona o pivo. O retorno traz tamanho e posicao do que entrou e a lista de scripts internos.',
	'- inspect_model e a sua visao tridimensional: devolve pivo, caixa envolvente, cada peca com posicao/rotacao/tamanho relativos ao pivo, vertices/faces reais de MeshParts e tres projecoes (topo/frente/lado) em digitos 1..9 de profundidade. Use depois de inserir/importar um modelo, antes de posicionar coisas ao redor dele, ou para conferir se um build ficou como planejado. Em modelos grandes comece com detail=summary; maxVertices/maxFaces so para a malha crua.',
	'',
	'Importar imagens (2D) e modelos (3D) para o place — ImportMCP:',
	'- import_asset importa PNG/JPG (ImageLabel, ImageButton, Decal, Texture ou aplica em uma instancia existente com target) e GLB/glTF (Model ou MeshPart) SEM o importador nativo do Studio e sem publicar asset: o arquivo vira EditableImage/EditableMesh e fica persistido dentro do proprio objeto (pasta _ImportMCP), sobrevivendo a salvar/publicar/reabrir. Exige a pasta ServerStorage.ImportMCP no place (IMPORTMCP_MISSING avisa se faltar).',
	'- Fonte do arquivo (exatamente uma): url=https://... (o Studio baixa; mais barato para o agente), data=<base64 do arquivo inteiro> (ate ~1.2 MB), upload=<id> (arquivo enviado em pedacos por import_upload) ou text=<JSON de um .gltf>. Um .gltf com .bin/texturas separados recebe os arquivos em externals=[{name, url|data|upload}].',
	'- Agentes com terminal: POST <url do MCP>/import com o arquivo binario no corpo (curl --data-binary @arvore.glb "<mcp>/import?parent=game.Workspace&name=Arvore") importa em UMA chamada; o Worker guarda o arquivo temporariamente e o Studio baixa de <mcp>/blob/<id>. O CLI faz isso com ./rbx import arquivo.glb parent=game.Workspace.',
	'- Posicionamento 3D: position=[x,y,z], rotation=[gx,gy,gz] (graus), scale=N, center=true (pivo no centro), ground=true (base em y=0), collision=Default|Box|Hull|PreciseConvexDecomposition, anchored, canCollide, doubleSided. 2D: properties={Size=..., Position=..., AnchorPoint=...} aplica propriedades na instancia criada; maxSize limita a textura (16..1024).',
	'- import_status mostra versao, runtime, fila e progresso (id=<job> acompanha um upload/job; list=true lista os assets persistidos). import_manage restaura (restore/restoreAll) assets depois de reabrir o place, remove (remove) ou instala o runtime (install). O play test precisa estar parado para importar.',
	'',
	'Sessao Viva (LiveSession) + hot reload em tempo real (2.9.0):',
	'- O usuario pode iniciar a Sessao Viva (plugin LiveSession): o playtest roda NO PROPRIO editor, com jogador virtual, fisica e hot reload. Tudo o que voce escreve pelo MCP entra no jogo rodando na hora e a autoria fica no journal da sessao (persiste quando ela encerra; o resto do mundo volta ao estado do inicio).',
	'- livesession_status: a Sessao Viva esta instalada/rodando? motor (hosted ou compatibilidade), scripts rodando no servidor/cliente, reloads, ultimo reload, scripts com erro de compilacao ou que nao carregaram, journal (entradas por tipo/origem), edicoes que NAO vao persistir (clones em PlayerGui, scripts criados pelo jogo) e o estado dos assets do ImportMCP no playtest (materializados neste Studio ou nao).',
	'- Com a sessao rodando, set_script/create_script/set_properties/create_instance/insert_asset/import_asset/duplicate_instance/move_instance esperam o hot reload (liveWaitMs, padrao 2500) e devolvem liveSession: applied (codigo aplicado e rodando no playtest), persisted (fica ao encerrar), items com compileError/loadIssue/running e o lastReload. set_properties tambem registra as propriedades no journal (origem mcp) para sobreviverem a restauracao do mundo. Se applied=false, leia compileError/liveReason e corrija na hora.',
	'- livesession_verify targets=[...] confere scripts/instancias a qualquer momento (espera reloads pendentes por waitMs): live, persist + motivo, sincronizado com o editor, runners rodando em server/client. livesession_journal le o journal (kind/origin/since) ou, com log=output, a janela Output da Sessao Viva (auditoria de carga, "Nao carregou", APIs sem emulacao).',
	'- livesession_control: start/stop (o usuario pode precisar confirmar avisos no Studio; waitMs espera a troca de estado), restart targets=[scripts] reinicia scripts no playtest sem editar, record targets/properties/attributes registra no journal edicoes feitas por run_luau, resyncGui remonta a UI do jogador virtual. UI editada em StarterGui (MCP, Properties ou ImportMCP) aparece no PlayerGui do playtest em tempo real.',
	'- Edite sempre o ORIGINAL: scripts/UI em PlayerGui, Backpack e no personagem sao clones de StarterGui/StarterPack/StarterPlayer e somem ao encerrar (liveSession.persisted=false avisa). Logs dos scripts do playtest aparecem em get_logs context=edit. Enquanto a Sessao Viva roda, studio_play play/run e recusado (LIVESESSION_ACTIVE).',
	'- ImportMCP + Sessao Viva: import_asset funciona com a sessao rodando; o asset entra no mundo do playtest na hora (3D em Workspace, 2D em StarterGui espelhado para o PlayerGui) e persiste. Assets em modo sessao ja materializados no Studio nao sao reconstruidos de novo pelo runtime dentro do playtest.',
	'',
	'Exportar arquivos do place para o seu ambiente (2.8.2):',
	'- export_file target=<instancia> leva um arquivo do Studio para voce: kind=script (texto do script, .lua), kind=rbxm (QUALQUER instancia com toda a subarvore no formato real do Studio, gerado por SerializationService — abre em outro place/Studio, Rojo etc.), kind=obj (geometria de MeshPart/SpecialMesh como Wavefront OBJ com normais e UVs, lida pelo EditableMesh) e kind=asset (lista os assets originais referenciados: MeshId, TextureID, Texture, Image, SoundId... com URL de download). kind=auto escolhe pelo tipo da instancia. Um servico (ex.: game.ServerStorage) exporta seus filhos.',
	'- O arquivo sobe do Studio para o Worker e fica em url (<mcp>/blob/<id>/<nome>) por ~30 min: baixe com curl -fsSL -o nome "<url>" (ou o CLI: ./rbx export game.Workspace.Casa -o casa.rbxm). Textos ate 64 KB tambem voltam em content no proprio resultado. Cada item de assets traz url=<mcp>/asset/<id>, um proxy do assetdelivery da Roblox: funciona para assets publicos e do dono do place; assets privados de terceiros respondem 403.',
	'- Nao reconstrua .rbxm na mao nem exporte geometria por run_luau: export_file usa o serializador do proprio Studio e e a forma correta de levar modelos, scripts e malhas para fora.',
	'',
	'Regras de trabalho:',
	'- Escritas usam gravacao de historico quando o Studio oferece o servico; Ctrl+Z/undo_history revertem alteracoes capturadas. Efeitos externos, runtime e codigo nativo arbitrario nao sao uma transacao garantida.',
	'- Em scripts grandes prefira set_script com "edits" (troca pontual) em vez de reenviar o arquivo inteiro.',
	'- run_luau existe para o que nao tem ferramenta propria. Devolve o valor retornado e o que foi impresso.',
	'- Se a resposta disser que o Studio esta offline, nada foi executado: peca ao usuario para abrir o Studio e clicar em Conectar no plugin, e repita a mesma chamada.',
	'- Resultados muito grandes sao cortados no fim, com aviso. Use depth, limit e lineStart/lineEnd para pedir menos de cada vez.',
].join('\n');

function alvo(descricao) {
	return {
		type: 'string',
		description: descricao + ' Aceita caminho (game.Workspace.Peca) ou id devolvido pelo plugin (i_<plugin>_42).',
	};
}

export const FERRAMENTAS = [
	{
		name: 'studio_status',
		title: 'Estado da sessao',
		description:
			'Diz se o Roblox Studio esta conectado a esta URL, qual place esta aberto, a versao do plugin e as estatisticas da sessao. Responde mesmo com o Studio fechado.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'get_tree',
		title: 'Arvore do explorer',
		description:
			'Lista a arvore de instancias a partir de um ponto (padrao: game). Cada no traz id, nome, classe e quantidade de filhos.',
		inputSchema: {
			type: 'object',
			properties: {
				target: alvo('Raiz da listagem; padrao game.'),
				depth: {
					type: 'integer',
					minimum: 1,
					maximum: 10,
					description: 'Niveis de filhos a percorrer. Padrao 2.',
				},
				limit: {
					type: 'integer',
					minimum: 1,
					maximum: 2000,
					description: 'Teto de nos devolvidos. Padrao 250.',
				},
				classes: {
					type: 'array',
					items: { type: 'string' },
					description: 'Se preenchido, so mostra nos dessas classes (e os ancestrais no caminho).',
				},
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'find_instances',
		title: 'Procurar instancias',
		description:
			'Procura instancias por nome e/ou classe dentro de uma subarvore. Devolve caminho, id e classe de cada resultado.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Texto procurado no nome.' },
				className: { type: 'string', description: 'Classe exata ou base (usa IsA).' },
				target: alvo('Onde procurar; padrao game.'),
				mode: {
					type: 'string',
					enum: ['contains', 'exact', 'pattern'],
					description: 'Como comparar o nome. pattern usa padrao Lua. Padrao contains.',
				},
				limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Padrao 50.' },
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'get_instance',
		title: 'Ler instancia',
		description:
			'Devolve as propriedades de uma instancia, seus atributos, tags e a lista de filhos diretos.',
		inputSchema: {
			type: 'object',
			properties: {
				target: alvo('Instancia a ler.'),
				properties: {
					type: 'array',
					items: { type: 'string' },
					description: 'Se preenchido, le so essas propriedades.',
				},
				includeChildren: { type: 'boolean', description: 'Listar filhos diretos. Padrao true.' },
			},
			required: ['target'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'create_instance',
		title: 'Criar instancia',
		description:
			'Cria uma instancia (Part, Folder, Model, ScreenGui, o que for) dentro de um pai, ja com propriedades aplicadas.',
		inputSchema: {
			type: 'object',
			properties: {
				className: { type: 'string', description: 'Classe, por exemplo Part, Folder, PointLight.' },
				parent: alvo('Pai da nova instancia; padrao game.Workspace.'),
				name: { type: 'string', description: 'Nome da nova instancia.' },
				properties: {
					type: 'object',
					description: 'Propriedades aplicadas logo apos criar.',
					additionalProperties: true,
				},
				select: { type: 'boolean', description: 'Selecionar no explorer depois de criar.' },
			},
			required: ['className'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	},
	{
		name: 'set_properties',
		title: 'Alterar propriedades',
		description:
			'Altera propriedades e atributos de uma instancia. Os valores sao convertidos para o tipo real da propriedade.',
		inputSchema: {
			type: 'object',
			properties: {
				target: alvo('Instancia a alterar.'),
				properties: { type: 'object', description: 'Mapa propriedade -> valor.', additionalProperties: true },
				attributes: { type: 'object', description: 'Mapa atributo -> valor.', additionalProperties: true },
			},
			required: ['target'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	},
	{
		name: 'delete_instance',
		title: 'Apagar instancias',
		description: 'Apaga uma ou mais instancias. Reversivel com Ctrl+Z no Studio ou com undo_history.',
		inputSchema: {
			type: 'object',
			properties: {
				targets: {
					type: 'array',
					items: { type: 'string' },
					description: 'Caminhos ou ids das instancias a apagar.',
				},
			},
			required: ['targets'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
	},
	{
		name: 'move_instance',
		title: 'Mover instancia',
		description: 'Troca o pai de uma instancia (reparent).',
		inputSchema: {
			type: 'object',
			properties: {
				target: alvo('Instancia a mover.'),
				parent: alvo('Novo pai.'),
			},
			required: ['target', 'parent'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	},
	{
		name: 'duplicate_instance',
		title: 'Duplicar instancia',
		description: 'Clona uma instancia (com os filhos) uma ou mais vezes.',
		inputSchema: {
			type: 'object',
			properties: {
				target: alvo('Instancia a clonar.'),
				parent: alvo('Pai dos clones; padrao o mesmo pai do original.'),
				name: { type: 'string', description: 'Nome do clone (o primeiro; os outros ganham sufixo).' },
				count: { type: 'integer', minimum: 1, maximum: 100, description: 'Quantos clones. Padrao 1.' },
			},
			required: ['target'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: false },
	},
	{
		name: 'get_script',
		title: 'Ler script',
		description:
			'Le o codigo de um Script, LocalScript ou ModuleScript. Devolve numeracao de linhas e permite ler so um trecho.',
		inputSchema: {
			type: 'object',
			properties: {
				target: alvo('Script a ler.'),
				lineStart: { type: 'integer', minimum: 1, description: 'Primeira linha (1-based).' },
				lineEnd: { type: 'integer', minimum: 1, description: 'Ultima linha.' },
			},
			required: ['target'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'grep_scripts',
		title: 'Procurar texto em scripts',
		description:
			'Procura um texto ou padrao Lua em TODOS os scripts de uma subarvore e devolve caminho, linha e trecho de cada ocorrencia, agrupados por script. Muito mais barato que ler script por script: use para localizar onde uma funcao/variavel/string e definida ou usada antes de abrir o arquivo com get_script. A partir de game procura nos servicos do projeto (pula CoreGui, CorePackages e outros internos do Studio; passe target para procurar neles). A primeira busca indexa os scripts do place; as seguintes nao varrem o place de novo.',
		inputSchema: {
			type: 'object',
			properties: {
				pattern: { type: 'string', minLength: 1, maxLength: 500, description: 'Texto procurado (literal por padrao).' },
				target: alvo('Raiz da busca (pasta, servico ou um script); padrao game.'),
				regex: { type: 'boolean', description: 'true: pattern e um padrao Lua (string.find). Padrao false (texto literal).' },
				caseSensitive: { type: 'boolean', description: 'Diferenciar maiusculas. Padrao false.' },
				context: { type: 'integer', minimum: 0, maximum: 5, description: 'Linhas de contexto antes/depois de cada ocorrencia. Padrao 0.' },
				scriptName: { type: 'string', maxLength: 100, description: 'So scripts cujo nome contenha este texto.' },
				limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'Teto total de ocorrencias. Padrao 100.' },
				maxPerScript: { type: 'integer', minimum: 1, maximum: 200, description: 'Teto de ocorrencias por script. Padrao 25.' },
			},
			required: ['pattern'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'outline_script',
		title: 'Estrutura de um script',
		description:
			'Devolve o esqueleto de um script sem o corpo: funcoes (nome, parametros, linha, aninhamento), requires, servicos e locais de nivel superior. Use antes de get_script para decidir quais linhas ler (lineStart/lineEnd) em arquivos grandes.',
		inputSchema: {
			type: 'object',
			properties: {
				target: alvo('Script a analisar.'),
				locals: { type: 'boolean', description: 'Incluir locais de nivel superior (local x = ...). Padrao true.' },
			},
			required: ['target'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'set_script',
		title: 'Escrever script',
		description:
			'Grava codigo em um script existente. Use source para trocar o arquivo inteiro ou edits para trocas pontuais (mais seguro em arquivos grandes).',
		inputSchema: {
			type: 'object',
			properties: {
				target: alvo('Script a alterar.'),
				source: { type: 'string', description: 'Codigo completo novo.' },
				edits: {
					type: 'array',
					description: 'Trocas literais aplicadas em ordem. Cada find precisa existir no arquivo.',
					items: {
						type: 'object',
						properties: {
							find: { type: 'string', description: 'Trecho exato a procurar.' },
							replace: { type: 'string', description: 'Trecho que entra no lugar.' },
							all: { type: 'boolean', description: 'Trocar todas as ocorrencias. Padrao false (exige unica).' },
						},
						required: ['find', 'replace'],
						additionalProperties: false,
					},
				},
			},
			required: ['target'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
	},
	{
		name: 'create_script',
		title: 'Criar script',
		description: 'Cria um Script, LocalScript ou ModuleScript com codigo inicial.',
		inputSchema: {
			type: 'object',
			properties: {
				parent: alvo('Onde criar; padrao game.ServerScriptService.'),
				name: { type: 'string', description: 'Nome do script.' },
				kind: {
					type: 'string',
					enum: ['Script', 'LocalScript', 'ModuleScript'],
					description: 'Tipo do script. Padrao Script.',
				},
				source: { type: 'string', description: 'Codigo inicial.' },
				runContext: {
					type: 'string',
					enum: ['Legacy', 'Server', 'Client'],
					description: 'RunContext para Script. Padrao Legacy.',
				},
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: false },
	},
	{
		name: 'run_luau',
		title: 'Executar Luau',
		description:
			'Executa codigo Luau dentro do Studio com permissao de plugin e devolve o valor retornado mais o que foi impresso. Use para o que nao tem ferramenta propria.',
		inputSchema: {
			type: 'object',
			properties: {
				code: { type: 'string', description: 'Codigo Luau. Pode usar return para devolver um valor.' },
				undoLabel: { type: 'string', description: 'Nome do ponto de desfazer criado. Padrao "run_luau".' },
			},
			required: ['code'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
	},
	{
		name: 'get_selection',
		title: 'Ler selecao',
		description: 'Devolve o que esta selecionado no explorer do Studio.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'set_selection',
		title: 'Selecionar',
		description: 'Seleciona instancias no explorer do Studio (util para mostrar ao usuario o que voce mexeu).',
		inputSchema: {
			type: 'object',
			properties: {
				targets: { type: 'array', items: { type: 'string' }, description: 'Caminhos ou ids.' },
			},
			required: ['targets'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	},
	{
		name: 'toolbox_search',
		title: 'Pesquisar na Toolbox (Creator Store)',
		description:
			'Pesquisa assets publicos na Toolbox do Roblox (modelos, audios, decals/imagens, meshes, plugins, videos) e devolve, para cada resultado, id, nome, criador (verificado?), gratis/preco, votos, triangulos/vertices, quantidade de scripts internos, duracao (audio) e a MINIATURA como imagem (models/decals/meshes/videos). Use os ids com insert_asset para colocar no place. Roda no Worker: funciona com o Studio offline. Pagine com cursor; assetIds detalha ids ja conhecidos (ex.: miniatura maior com thumbnailSize=420).',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', maxLength: 200, description: 'Texto da busca (ingles acha mais). Obrigatorio se assetIds estiver vazio.' },
				category: { type: 'string', enum: ['models', 'audio', 'decals', 'images', 'meshes', 'plugins', 'videos'], description: 'Categoria. Padrao models.' },
				limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Resultados por pagina. Padrao 10.' },
				cursor: { type: 'string', maxLength: 300, description: 'nextCursor da resposta anterior, para a proxima pagina.' },
				verifiedOnly: { type: 'boolean', description: 'So criadores verificados. Padrao false.' },
				creatorId: { type: 'integer', minimum: 1, description: 'Filtrar por id do criador (usuario ou grupo).' },
				assetIds: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 30, description: 'Em vez de buscar, detalha estes ids (com miniaturas).' },
				thumbnails: { type: 'boolean', description: 'Anexar miniaturas como imagens. Padrao true (audio e plugins nao tem miniatura util).' },
				thumbnailSize: { type: 'integer', enum: [150, 420], description: 'Lado da miniatura em pixels. Padrao 150; 420 para ver detalhes.' },
				maxThumbnails: { type: 'integer', minimum: 0, maximum: 20, description: 'Teto de imagens anexadas (os primeiros resultados). Padrao 10.' },
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
	},
	{
		name: 'insert_asset',
		title: 'Inserir asset da Toolbox',
		description:
			'Insere no place um asset do Roblox por id (ids vem de toolbox_search). Detecta o tipo: Model/pacote entra por LoadAsset; Audio vira Sound (SoundId); Decal/Image vira Decal ou Texture (parent BasePart) ou ImageLabel/ImageButton (parent Gui); Mesh vira MeshPart (CreateMeshPartAsync); Video vira VideoFrame. Devolve caminho, id, posicao e tamanho do que entrou, quantas BaseParts e a LISTA DE SCRIPTS que vieram dentro (modelos gratis podem trazer codigo malicioso: leia com get_script ou use removeScripts=true).',
		inputSchema: {
			type: 'object',
			properties: {
				assetId: { type: 'integer', description: 'Id numerico do asset.' },
				kind: { type: 'string', enum: ['auto', 'model', 'audio', 'decal', 'image', 'mesh', 'video'], description: 'Tipo do asset. Padrao auto (consulta o tipo no Roblox).' },
				parent: alvo('Onde inserir; padrao game.Workspace. Decal/Texture exigem BasePart; ImageLabel/VideoFrame exigem Gui.'),
				name: { type: 'string', description: 'Renomear o que for inserido.' },
				as: { type: 'string', enum: ['Decal', 'Texture', 'ImageLabel', 'ImageButton'], description: 'Somente imagens: classe criada. Padrao: Decal em BasePart, ImageLabel em Gui.' },
				position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Model/MeshPart: move o pivo para [x,y,z] em studs, mantendo a rotacao.' },
				removeScripts: { type: 'boolean', description: 'Apagar todos os Scripts/LocalScripts/ModuleScripts que vierem dentro. Padrao false (apenas lista).' },
				select: { type: 'boolean', description: 'Selecionar no explorer. Padrao false.' },
			},
			required: ['assetId'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	},
	{
		name: 'inspect_model',
		title: 'Inspecionar geometria 3D',
		description:
			'Visao tridimensional em texto de um Model, BasePart, MeshPart ou pasta: pivo, caixa envolvente (min/max/size/center), cada peca com posicao/rotacao/tamanho RELATIVOS ao pivo (ou mundo), forma, material, cor, meshId; contagens (pecas, meshes, unions, attachments, juntas, scripts, luzes); rig (Humanoid/Motor6D); vertices e faces REAIS de MeshParts via EditableMesh (contagem, bounds, centroide e amostra opcional de vertices/faces); e tres projecoes ortograficas (topo, frente, lado) em grade de digitos 1..9 = profundidade/altura, "." = vazio, para entender o volume sem imagem. Comece com detail=summary em modelos grandes; use maxVertices/maxFaces so quando precisar da malha crua.',
		inputSchema: {
			type: 'object',
			properties: {
				target: alvo('Model, BasePart, MeshPart ou pasta a inspecionar.'),
				detail: { type: 'string', enum: ['summary', 'parts', 'full'], description: 'summary: pivo/bounds/contagens/projecoes. parts (padrao): + lista de pecas. full: + attachments e juntas.' },
				space: { type: 'string', enum: ['local', 'world'], description: 'local (padrao): pos/rot das pecas relativas ao pivo do alvo. world: absolutas.' },
				maxParts: { type: 'integer', minimum: 1, maximum: 1000, description: 'Teto de pecas listadas (maiores primeiro). Padrao 150.' },
				maxMeshes: { type: 'integer', minimum: 0, maximum: 40, description: 'Quantas MeshParts abrir com EditableMesh (vertices/faces reais). Padrao 8; 0 desliga.' },
				maxVertices: { type: 'integer', minimum: 0, maximum: 3000, description: 'Amostra de vertices por mesh (primeiros N, espaco da peca em studs). Padrao 0 (so contagem/bounds).' },
				maxFaces: { type: 'integer', minimum: 0, maximum: 3000, description: 'Amostra de triangulos por mesh (indices em vertexSample). Padrao 0.' },
				projections: { type: 'boolean', description: 'Gerar as tres projecoes com profundidade. Padrao true.' },
				resolution: { type: 'integer', minimum: 8, maximum: 48, description: 'Colunas da grade das projecoes (celula = maior lado / resolution). Padrao 24.' },
			},
			required: ['target'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'import_asset',
		title: 'Importar imagem ou modelo (ImportMCP)',
		description:
			'Importa um arquivo PNG/JPG (2D) ou GLB/glTF (3D) para o place usando o ImportMCP (ServerStorage.ImportMCP), sem o importador nativo e sem publicar asset. Imagens viram ImageLabel/ImageButton (GUI), Decal/Texture (em um BasePart) ou sao aplicadas em uma instancia existente (target). Modelos viram Model (padrao) ou MeshPart. O arquivo original fica persistido dentro do objeto e e restaurado ao reabrir o place. Informe exatamente UMA fonte: url, data, upload ou text. Devolve caminho, id, classe, dimensoes/triangulos e tempo.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', maxLength: 4000, description: 'https://... de onde o Studio baixa o arquivo (inclui <mcp>/blob/<id>/<nome> devolvido por POST <mcp>/upload).' },
				data: { type: 'string', maxLength: 1600000, description: 'Arquivo inteiro em base64 (ate ~1.2 MB de arquivo). Acima disso use upload (import_upload) ou url.' },
				upload: { type: 'string', maxLength: 64, description: 'Id devolvido por import_upload action=begin e finalizado com action=finish.' },
				text: { type: 'string', maxLength: 1600000, description: 'Conteudo textual de um .gltf (JSON). Buffers e imagens externos vao em externals.' },
				name: { type: 'string', maxLength: 100, description: 'Nome da instancia criada. Padrao: nome do arquivo sem extensao.' },
				fileName: { type: 'string', maxLength: 120, description: 'Nome do arquivo com extensao (ajuda a detectar o formato quando a fonte nao tem nome, ex.: data/text).' },
				kind: { type: 'string', enum: ['auto', 'image', 'mesh'], description: 'Tipo do arquivo. Padrao auto (detecta pelos bytes/extensao).' },
				parent: alvo('Onde criar a instancia. Padrao: game.Workspace para 3D; Decal/Texture exigem um BasePart; ImageLabel/ImageButton usam game.StarterGui (dentro de um ScreenGui "ImportMCP" se o pai nao for GUI).'),
				as: {
					type: 'string',
					enum: ['ImageLabel', 'ImageButton', 'Decal', 'Texture', 'Model', 'MeshPart'],
					description: 'Classe criada. Padrao: ImageLabel para imagens, Model para modelos.',
				},
				target: alvo('Somente imagens: instancia EXISTENTE que recebe a imagem (ImageLabel, Decal, MeshPart.TextureContent etc.) em vez de criar uma nova. Ignora parent/as.'),
				property: { type: 'string', maxLength: 60, description: 'Com target: propriedade que recebe o conteudo (ex.: Image, Texture, TextureContent). Padrao: detectada pela classe.' },
				position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: '3D: posicao do pivo [x,y,z] em studs.' },
				rotation: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: '3D: orientacao [x,y,z] em graus.' },
				scale: { type: 'number', minimum: 0.0001, maximum: 10000, description: '3D: multiplicador de unidades do arquivo para studs. Padrao 1.' },
				center: { type: 'boolean', description: '3D: centraliza o modelo no pivo. Padrao true.' },
				ground: { type: 'boolean', description: '3D: coloca a base do modelo em y=0 do pivo. Padrao false.' },
				collision: { type: 'string', enum: ['Default', 'Box', 'Hull', 'PreciseConvexDecomposition'], description: '3D: fidelidade de colisao. Padrao Default.' },
				anchored: { type: 'boolean', description: '3D: Anchored nas partes. Padrao true.' },
				canCollide: { type: 'boolean', description: '3D: CanCollide nas partes. Padrao true.' },
				doubleSided: { type: 'boolean', description: '3D: renderiza os dois lados das faces. Padrao false.' },
				maxSize: { type: 'integer', minimum: 16, maximum: 1024, description: 'Imagens: lado maximo da textura em pixels (reduz mantendo proporcao). Padrao 1024.' },
				properties: { type: 'object', description: 'Propriedades aplicadas na instancia criada (Size, Position, AnchorPoint, Color, Transparency...; tabelas viram Vector3/UDim2/Color3).', additionalProperties: true },
				externals: {
					type: 'array',
					maxItems: 64,
					description: 'Arquivos referenciados por um .gltf (buffers .bin e imagens). Cada item tem exatamente uma fonte.',
					items: {
						type: 'object',
						properties: {
							name: { type: 'string', maxLength: 200, description: 'Nome do arquivo como aparece no .gltf (ex.: Box0.bin). Padrao: ultimo segmento da url.' },
							url: { type: 'string', maxLength: 4000 },
							data: { type: 'string', maxLength: 1600000, description: 'base64.' },
							upload: { type: 'string', maxLength: 64 },
						},
						additionalProperties: false,
					},
				},
				persist: { type: 'boolean', description: 'Guardar o arquivo original dentro do objeto para restaurar ao reabrir o place. Padrao true. false = so nesta sessao.' },
				select: { type: 'boolean', description: 'Selecionar a instancia no explorer ao terminar. Padrao true.' },
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
	},
	{
		name: 'import_upload',
		title: 'Enviar arquivo em pedacos (ImportMCP)',
		description:
			'Envia um arquivo grande para o Inbox do ImportMCP em pedacos base64, para depois importar com import_asset upload=<id>. Fluxo: action=begin (devolve id) -> action=append com chunk (ate 200000 caracteres por chamada, em ordem) -> action=finish -> import_asset upload=id. Agentes com terminal preferem POST <mcp>/import ou <mcp>/upload com o arquivo binario, que dispensa base64.',
		inputSchema: {
			type: 'object',
			properties: {
				action: { type: 'string', enum: ['begin', 'append', 'finish', 'cancel', 'list', 'clear'], description: 'Padrao append.' },
				id: { type: 'string', maxLength: 64, description: 'Id do upload (begin devolve; obrigatorio em append/finish/cancel).' },
				chunk: { type: 'string', maxLength: 400000, description: 'Pedaco base64 (append).' },
				name: { type: 'string', maxLength: 120, description: 'begin: nome do arquivo com extensao.' },
				expectedBytes: { type: 'integer', minimum: 1, description: 'begin: tamanho do arquivo original, para conferir em finish.' },
				state: { type: 'string', enum: ['uploading', 'ready', 'queued', 'running', 'done', 'failed'], description: 'list: filtrar por estado.' },
				keepUnfinished: { type: 'boolean', description: 'clear: manter uploads ainda em andamento. Padrao true.' },
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'import_status',
		title: 'Estado do ImportMCP',
		description:
			'Mostra versao e runtime do ImportMCP, uploads/fila, progresso da importacao em andamento e limites. id=<job> devolve o estado/resultado de um upload ou job. list=true lista os assets persistidos no place (caminho, tipo, tamanho).',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string', maxLength: 64, description: 'Id de upload/job para consultar.' },
				list: { type: 'boolean', description: 'Listar assets ImportMCP persistidos no place. Padrao false.' },
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'import_manage',
		title: 'Restaurar / remover assets (ImportMCP)',
		description:
			'restore reconstroi a imagem/mesh de um asset ImportMCP (target) a partir do arquivo persistido; restoreAll faz isso para todos os assets do place (util depois de reabrir o Studio sem o plugin ImportMCP); remove apaga o asset (keepInstance=true so desliga a persistencia e mantem a instancia); install instala/atualiza o runtime em ReplicatedStorage/ServerScriptService (force reinstala).',
		inputSchema: {
			type: 'object',
			properties: {
				action: { type: 'string', enum: ['restore', 'restoreAll', 'remove', 'install'], description: 'Obrigatorio.' },
				target: alvo('Asset ImportMCP (restore/remove).'),
				keepInstance: { type: 'boolean', description: 'remove: manter a instancia e so remover a persistencia. Padrao false.' },
				force: { type: 'boolean', description: 'install: reinstalar o runtime mesmo se atualizado. Padrao false.' },
			},
			required: ['action'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'export_file',
		title: 'Exportar arquivo do place (script, .rbxm, .obj, assets)',
		description:
			'Leva um arquivo do Studio para o ambiente do agente. kind=script: texto do script (.lua, com revision como get_script). kind=rbxm: a instancia e toda a subarvore no formato binario real do Studio (SerializationService), para abrir em outro place, Rojo ou ferramentas externas. kind=obj: geometria de MeshPart/SpecialMesh em Wavefront OBJ (vertices, normais, UVs, faces), em espaco da malha. kind=asset: ids e URLs dos assets originais (mesh, textura, imagem, audio, video) referenciados pela instancia e descendentes. auto (padrao) escolhe pelo tipo. O arquivo fica disponivel em url (<mcp>/blob/<id>/<nome>, ~30 min); textos ate 64 KB tambem voltam em content. Nao altera o place.',
		inputSchema: {
			type: 'object',
			properties: {
				target: alvo('Instancia a exportar (script, modelo, pasta, peca, servico...).'),
				kind: { type: 'string', enum: ['auto', 'script', 'rbxm', 'obj', 'asset'], description: 'Padrao auto: script para LuaSourceContainer, obj para MeshPart/SpecialMesh, asset para Decal/Texture/ImageLabel/Sound/Sky..., rbxm para o resto.' },
				assetId: { type: 'integer', minimum: 1, description: 'Sem target: apenas monta a URL de download deste asset (kind=asset).' },
				fileName: { type: 'string', maxLength: 120, description: 'Nome do arquivo gerado. Padrao: nome da instancia com a extensao do tipo.' },
				maxBytes: { type: 'integer', minimum: 1024, maximum: 40000000, description: 'Tamanho maximo do arquivo gerado. Padrao 20 MB (RESULT_TOO_LARGE acima disso).' },
				inline: { type: 'boolean', description: 'Devolver content inline para texto ate 64 KB (script/obj). Padrao true.' },
			},
			required: [],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'get_logs',
		title: 'Saida do Studio (unificada)',
		description:
			'Devolve o Output do Studio completo e unificado: editor (edit), servidor (server) e clientes (client) da sessao de teste, mais marcadores do MCP. Linhas inteiras, sem resumo. Suporta cursor (since/nextSince) e espera por novas linhas (waitMs) para acompanhar um play test em tempo real. Funciona mesmo com o Studio offline (historico recebido). O plugin reconcilia o historico real do Output a cada segundo; se o Worker nao tiver nenhuma linha do editor daquele Studio, pede as ultimas ao plugin antes de responder (backfill).',
		inputSchema: {
			type: 'object',
			properties: {
				limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'Quantas linhas. Padrao 100. Sem since devolve as ULTIMAS N; com since devolve as PRIMEIRAS N apos o cursor.' },
				level: {
					type: 'string',
					enum: ['all', 'output', 'info', 'warning', 'error'],
					description: 'Filtro por severidade. Padrao all.',
				},
				context: {
					type: 'string',
					enum: ['all', 'edit', 'server', 'client', 'mcp'],
					description: 'De qual DataModel: edit (editor/Run mode), server e client (sessao de play), mcp (marcadores de inicio/fim de teste e capturas). Padrao all.',
				},
				contains: { type: 'string', description: 'So linhas que contenham este texto (sem diferenciar maiusculas).' },
				since: { type: 'integer', minimum: 0, description: 'Cursor: so linhas com seq maior que este valor. Use o nextSince da resposta anterior ou o logsSince de studio_play.' },
				waitMs: { type: 'integer', minimum: 0, maximum: 25000, description: 'Se nao houver linha nova que passe nos filtros, espera ate este tempo por novas linhas antes de responder (tail em tempo real). Omitido: espera ate 1s quando o Studio esta online e nada chegou ainda; 0 responde na hora.' },
				format: { type: 'string', enum: ['text', 'json'], description: 'text (padrao): linhas limpas "[hh:mm:ss.mmm] [contexto] [nivel] mensagem" precedidas de um cabecalho com nextSince. json: objetos {seq,t,ctx,level,message}.' },
				clear: { type: 'boolean', description: 'Apaga o historico guardado no Worker depois de responder. Padrao false.' },
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'studio_play',
		title: 'Play test / Run / Stop',
		description:
				'Controla a simulacao do Studio para validar o sistema: play (Play Solo com personagem, via StudioTestService), run (so servidor, no mesmo DataModel do editor, como F8), multiplayer (players clientes), stop, pause, resume, status e reset. Devolve o estado da sessao, os relays conectados (server/client) e logsSince, o cursor para ler em get_logs apenas os logs produzidos pela sessao. Sessoes paradas pelo botao Stop do Studio (pelo usuario ou por outro agente) sao detectadas e encerradas automaticamente; reset descarta um estado que tenha ficado preso sem tocar no Studio.',
			inputSchema: {
				type: 'object',
				properties: {
					action: { type: 'string', enum: ['play', 'run', 'multiplayer', 'stop', 'pause', 'resume', 'status', 'reset'], description: 'Padrao status. reset: descarta a sessao registrada (Worker e plugin) quando o Studio ja voltou ao editor mas o estado ficou preso.' },
				players: { type: 'integer', minimum: 1, maximum: 8, description: 'Somente para multiplayer. Padrao 2.' },
				waitMs: { type: 'integer', minimum: 0, maximum: 25000, description: 'Quanto esperar o servidor da sessao se conectar (play/multiplayer) ou a sessao encerrar (stop) antes de responder. Padrao 10000.' },
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'studio_screenshot',
		title: 'Captura da janela do Studio',
		description:
			'Tira um print da janela do Roblox Studio (PNG) e devolve a imagem e uma URL para abrir. Requer o helper opcional de captura rodando na maquina do Studio (captura/captura-studio.ps1 com a URL da sessao). Sem o helper, responde CAPTURE_HELPER_OFFLINE sem alterar nada.',
		inputSchema: {
			type: 'object',
			properties: {
				window: { type: 'string', enum: ['studio', 'screen'], description: 'studio (padrao): so a janela do Roblox Studio. screen: tela inteira principal.' },
				maxWidth: { type: 'integer', minimum: 320, maximum: 3840, description: 'Reduz a imagem para no maximo esta largura, mantendo a proporcao. Padrao 1600.' },
				waitMs: { type: 'integer', minimum: 1000, maximum: 25000, description: 'Quanto esperar pela captura. Padrao 15000.' },
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'livesession_status',
		title: 'Sessao Viva: estado do playtest e do hot reload',
		description:
			'Estado da Sessao Viva (plugin LiveSession) neste Studio: instalada? rodando (playtest ativo no editor)? motor hosted/compatibilidade, uptime, FPS, fisica, scripts rodando no servidor/cliente, hot reload (reloads, pendentes, ultimo reload e historico, scripts quebrados), journal (entradas por tipo e origem, inclusive mcp), scripts que nao carregaram, edicoes que nao vao persistir (clones/runtime), jogador virtual e UI montada, contagem de erros do Output da sessao, e o estado dos assets do ImportMCP no playtest. Funciona com a sessao parada (installed/state).',
		inputSchema: {
			type: 'object',
			properties: {
				detail: { type: 'string', enum: ['summary', 'full'], description: 'full inclui o historico completo de reloads. Padrao summary.' },
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'livesession_control',
		title: 'Sessao Viva: iniciar, encerrar, reiniciar scripts, registrar autoria',
		description:
			'Comandos para a Sessao Viva: start (inicia o playtest no editor; avisos do Studio podem pedir confirmacao do usuario), stop (encerra: o mundo volta ao inicio e a autoria do journal permanece; a revisao de mudancas ambiguas pode pedir confirmacao), restart (reinicia scripts no playtest sem alterar o codigo: limpa o que criaram e executa de novo), record (registra no journal propriedades/atributos editados por run_luau, para persistirem ao encerrar), resyncGui (remonta a UI do jogador virtual a partir de StarterGui), status (igual a livesession_status).',
		inputSchema: {
			type: 'object',
			properties: {
				action: { type: 'string', enum: ['status', 'start', 'stop', 'restart', 'record', 'resyncGui'], description: 'Obrigatorio.' },
				targets: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string', minLength: 1 }, description: 'restart: scripts (caminho ou id). record: instancias editadas.' },
				properties: { type: 'array', maxItems: 100, items: { type: 'string', minLength: 1 }, description: 'record: nomes das propriedades a registrar (valor atual).' },
				attributes: { type: 'array', maxItems: 100, items: { type: 'string', minLength: 1 }, description: 'record: nomes dos atributos a registrar (valor atual).' },
				waitMs: { type: 'integer', minimum: 0, maximum: 20000, description: 'start/stop: quanto esperar a troca de estado antes de responder. Padrao 0.' },
			},
			required: ['action'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'livesession_verify',
		title: 'Sessao Viva: o codigo entrou no playtest e vai persistir?',
		description:
			'Para cada alvo: existe, live (script sincronizado com o editor, compilado e com runners rodando; instancia presente no mundo do playtest), persist (fica ao encerrar a sessao) com o motivo, synced/pending, compileError, loadIssue, runners e running por contexto (server/client), journaled, se e clone de StarterGui/StarterPack (edite o original) ou criado pelo jogo. Espera reloads pendentes por waitMs antes de responder.',
		inputSchema: {
			type: 'object',
			properties: {
				targets: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string', minLength: 1 }, description: 'Scripts/instancias por caminho ou id.' },
				waitMs: { type: 'integer', minimum: 0, maximum: 20000, description: 'Espera maxima por hot reloads pendentes desses scripts. Padrao 3000; 0 responde na hora.' },
			},
			required: ['targets'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'livesession_journal',
		title: 'Sessao Viva: journal de autoria e Output da sessao',
		description:
			'log=journal (padrao): entradas do journal da Sessao Viva (source/create/destroy/property, origem editor/recording/studio/mcp/collaborator, caminho, hashes, valor resumido), com cursor since/nextSince. log=output: a janela Output da Sessao Viva (auditoria de carga, scripts que nao carregaram, edicoes nao persistidas, APIs sem emulacao, sincronia de UI), filtravel por level.',
		inputSchema: {
			type: 'object',
			properties: {
				log: { type: 'string', enum: ['journal', 'output'], description: 'Padrao journal.' },
				since: { type: 'integer', minimum: 0, description: 'Cursor: so entradas com seq maior. Use nextSince da resposta anterior.' },
				limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Padrao 50 (journal) / 100 (output). Sem since devolve as ULTIMAS N.' },
				kind: { type: 'string', enum: ['all', 'source', 'create', 'destroy', 'property'], description: 'journal: filtro por tipo.' },
				origin: { type: 'string', description: 'journal: filtro por origem (editor, source, recording, studio, mcp, collaborator, review, selection).' },
				level: { type: 'string', enum: ['all', 'error', 'warn', 'info', 'print'], description: 'output: filtro por nivel.' },
				contains: { type: 'string', maxLength: 200, description: 'Filtro por trecho (caminho no journal, texto no output).' },
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'undo_history',
		title: 'Desfazer / refazer',
		description: 'Desfaz ou refaz alteracoes no Studio usando o historico do proprio editor.',
		inputSchema: {
			type: 'object',
			properties: {
				action: { type: 'string', enum: ['undo', 'redo'], description: 'Padrao undo.' },
				steps: { type: 'integer', minimum: 1, maximum: 25, description: 'Quantos passos. Padrao 1.' },
			},
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: true },
	},
];

const AGENT = { type: 'string', pattern: '^[A-Za-z0-9_.:-]{1,96}$', maxLength: 96, description: 'Sua identidade UNICA; obtenha com agent_open e reutilize em todas as chamadas da tarefa. Nunca use a de outro agente.' };
for (const tool of FERRAMENTAS) tool.inputSchema.properties.agent = { ...AGENT };
for (const name of ['set_script', 'set_properties']) {
	FERRAMENTAS.find((f) => f.name === name).inputSchema.properties.expectedRevision = {
		type: 'string', description: 'Revisao devolvida por get_script. Se omitida, usa a ultima leitura deste agente. A leitura previa de Source e obrigatoria.'
	};
}

for (const name of ['set_script', 'create_script', 'set_properties', 'create_instance', 'insert_asset', 'import_asset', 'duplicate_instance', 'move_instance']) {
	const tool = FERRAMENTAS.find((f) => f.name === name);
	tool.inputSchema.properties.liveWaitMs = {
		type: 'integer', minimum: 0, maximum: 20000,
		description: 'So com a Sessao Viva rodando: quanto esperar o hot reload aplicar antes de responder (liveSession.applied/persisted no resultado). Padrao 2500; 0 so registra no journal sem esperar.'
	};
	tool.description += ' Com a Sessao Viva rodando, o resultado traz liveSession (hot reload aplicado no playtest? persiste ao encerrar?).';
}
FERRAMENTAS.find((f) => f.name === 'studio_play').description += ' Recusado com LIVESESSION_ACTIVE enquanto a Sessao Viva (LiveSession) roda neste Studio: o playtest dela ja roda no editor com hot reload (livesession_status/livesession_verify).';
FERRAMENTAS.find((f) => f.name === 'run_luau').inputSchema.properties.timeoutMs = {
	type: 'integer', minimum: 100, maximum: 40000,
	description: 'Prazo cooperativo da execucao, incluindo tarefas filhas. Padrao 30000, sempre limitado ao prazo restante da chamada.'
};
FERRAMENTAS.find((f) => f.name === 'run_luau').inputSchema.properties.context = {
	type: 'string', enum: ['edit', 'server', 'client'],
	description: 'Onde executar. edit (padrao): editor. server/client: dentro do DataModel da sessao de teste iniciada por studio_play (play/multiplayer); util para inspecionar o estado real do jogo rodando. Exige a sessao ativa.'
};
FERRAMENTAS.find((f) => f.name === 'run_luau').inputSchema.properties.freshRequire = {
	type: 'boolean',
	description: 'true (padrao no editor): require(ModuleScript) recompila o modulo a partir do texto atual do editor a cada chamada, sem cache antigo, inclusive modulos aninhados. false: require nativo do Studio (cache). Dentro de server/client o padrao e false (o jogo ja carregou os modulos).'
};
FERRAMENTAS.find((f) => f.name === 'run_luau').description += ' Livre de travas: nunca e recusado por leituras, reservas ou revisoes de outros agentes, e roda em paralelo com outras chamadas. Nao use para editar Source (use set_script); scripts travados por outros que forem alterados aparecem em warnings/touchedLockedScripts. task.spawn/defer/delay sao acompanhados ate terminar ou cancelar. Watchdog preemptivo: loops e funcoes recebem pontos de yield automaticos e o codigo cede o quadro pelo orcamento compartilhado do plugin; codigo sem pontos de yield possiveis e recusado (WATCHDOG_UNAVAILABLE) e trabalho pesado onde nao da para ceder e abortado (NO_YIELD_POINT). Resultado limitado a ~700KB e 300 linhas de print: retorne dados agregados. require e FRESCO por padrao: modulos recem-editados sao validados sem cache (veja freshRequire/freshModules). Com context=server ou client roda dentro da sessao de play test ativa.';
FERRAMENTAS.find((f) => f.name === 'get_script').description += ' Cria trava automatica de leitura e devolve revision para edicao sem sobrescrever versoes antigas.';
FERRAMENTAS.find((f) => f.name === 'set_script').description += ' Exige leitura previa por este agente ou expectedRevision atual; respeita travas de outros agentes.';
const TARGETS = { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string', minLength: 1 }, description: 'Instancias/scripts/pastas, por caminho ou id. Todos os alvos sao validados antes de qualquer reserva.' };
FERRAMENTAS.push(
	{
		name: 'agent_open', title: 'Identidade de agente',
		description: 'Gera identidade unica para uma tarefa/agente. Nao cria equipe nem vincula um agente global a conexao; passe o agent retornado em CADA chamada. Funciona offline. Com place, ja marca o Studio/place padrao dessa identidade (como studio_select).',
		inputSchema: { type: 'object', properties: { name: { type: 'string', maxLength: 80, description: 'Rotulo opcional, ex.: construtor ou validador.' } }, additionalProperties: false },
		annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
	},
	{
		name: 'studio_select', title: 'Marcar o place deste agente',
		description: 'Marca qual Studio/place (quando ha varios abertos na mesma sessao) recebe as chamadas deste agent daqui em diante, para nao repetir place em cada chamada. Sem place devolve a marcacao atual e a lista de Studios online. clear=true desmarca. Roda no Worker (nao entra na fila do Studio) e nao cria trava.',
		inputSchema: { type: 'object', properties: { agent: { ...AGENT }, clear: { type: 'boolean', description: 'true: remove a marcacao deste agente (volta a exigir place quando houver mais de um Studio).' } }, additionalProperties: false },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
	},
	{
		name: 'agent_close', title: 'Encerrar agente',
		description: 'Libera reservas e sobras de leitura do proprio agente. Ao iniciar outra tarefa, use uma nova identidade. Nao cancela nem libera travas de uma operacao ativa.',
		inputSchema: { type: 'object', properties: { agent: { ...AGENT } }, additionalProperties: false },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
	},
	{
		name: 'file_lock', title: 'Reservar scripts ou instancias',
		description: 'Reserva manual atomica de todos os alvos, para manter a protecao ENTRE chamadas. read permite outros leitores; write exige exclusividade. Repetir renova a reserva. Nao substitui as travas automaticas.',
		inputSchema: { type: 'object', properties: { agent: { ...AGENT }, targets: TARGETS, kind: { type: 'string', enum: ['read','write'], description: 'Padrao write.' }, recursive: { type: 'boolean', description: 'Incluir descendentes. Padrao true.' }, seconds: { type: 'integer', minimum: 5, maximum: 900, description: 'TTL. Padrao 120; teto configurado no Worker.' }, note: { type: 'string', maxLength: 200, description: 'Motivo da reserva, sem segredos.' } }, required: ['targets'], additionalProperties: false },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
	},
	{
		name: 'file_unlock', title: 'Liberar suas travas',
		description: 'Libera apenas reservas manuais e sobras de leitura do proprio agente. Use targets ou all=true. Nao apaga a marca de versao lida e nao ha force.',
		inputSchema: { type: 'object', properties: { agent: { ...AGENT }, targets: TARGETS, all: { type: 'boolean', description: 'Liberar todas as SUAS travas nao ativas.' } }, additionalProperties: false },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
	},
	{
		name: 'file_locks', title: 'Ver travas e agentes',
		description: 'Lista donos, modos, caminhos, ids e prazos das travas no Studio. Inclui ultimos eventos de coordenacao, sem codigo-fonte. Travas de operacoes vivas nao expiram por TTL.',
		inputSchema: { type: 'object', properties: { agent: { ...AGENT }, mine: { type: 'boolean', description: 'Mostrar so as suas travas. Padrao false.' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 500 } }, additionalProperties: false },
		annotations: { readOnlyHint: true, openWorldHint: false }
	}
);

const FORMAT = { type: 'string', enum: ['text', 'json'], description: 'text (padrao): resposta compacta e legivel. json: objeto bruto completo.' };
for (const tool of FERRAMENTAS) if (!tool.inputSchema.properties.format) tool.inputSchema.properties.format = { ...FORMAT };

const PLACE = { type: 'string', maxLength: 160, description: 'Qual Studio/place recebe esta chamada quando ha varios abertos na mesma sessao: alias (s1, s2...), nome do place, placeId ou peer. Opcional com um so Studio online ou depois de studio_select. Em get_logs, "all" mostra todos os places.' };
for (const tool of FERRAMENTAS) if (!tool.inputSchema.properties.place) tool.inputSchema.properties.place = { ...PLACE };

export const NOMES_FERRAMENTAS = FERRAMENTAS.map((f) => f.name);
export const MAPA_FERRAMENTAS = new Map(FERRAMENTAS.map((f) => [f.name, f]));

export const FERRAMENTAS_LOCAIS = ['studio_status', 'agent_open', 'studio_select', 'get_logs', 'studio_screenshot', 'toolbox_search'];
