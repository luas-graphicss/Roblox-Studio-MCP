import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{SessaoStudio,validar} from '../worker.js';
import {FERRAMENTAS,FERRAMENTAS_LOCAIS} from '../ferramentas.js';
const names=FERRAMENTAS.filter(f=>!FERRAMENTAS_LOCAIS.includes(f.name)).map(f=>f.name);
const mcp='/mcp/session1/token123',bridge='/ponte/session1/token123';
function setup(env={}){
 const store=new Map();const state={storage:{get:async k=>store.get(k),put:async values=>{for(const [k,v]of Object.entries(values))store.set(k,v)}},blockConcurrencyWhile:fn=>fn(),waitUntil(){}};

 const obj=new SessaoStudio(state,{ESPERA_POLL_MS:'1000',TEMPO_LIMITE_MS:'5000',LOGS_ESPERA_MS:'0',BACKFILL_ESPERA_MS:'150',...env});
 const req=(path,body,h={},method='POST')=>obj.fetch(new Request('https://test.local'+path,{method,headers:{'Content-Type':'application/json',...h},...(body===undefined?{}:{body:JSON.stringify(body)})}));
 const rpc=(name,args={},h={},id=1)=>req(mcp,{jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:{format:'json',...args}}},h);
 const hello=(peer='peer001',extra={})=>req(bridge+'/ola',{peer,versao:'2.0.0',controle:{version:1},ferramentas:names,...extra});
 const poll=(peer='peer001')=>req(bridge+'/poll',{peer,versao:'2.0.0',controle:{version:1},ferramentas:names,wait:1});
 const stop=()=>{for(const p of obj.pend.values()){clearTimeout(p.timer);p.resolve({ok:false,erro:'test cleanup'})}obj.pend.clear();obj.fila=[];for(const w of [...obj.pollers])obj.finalizarPoll(w,{events:[]})};
 return {obj,req,rpc,hello,poll,stop};
}
const json=async r=>r.json();
const value=r=>JSON.parse(r.result.content[0].text);
const wait=async(obj,n=1)=>{for(let i=0;i<100&&obj.fila.length<n;i++)await new Promise(r=>setTimeout(r,1));assert.ok(obj.fila.length>=n,'pedido nao entrou na fila')};
async function finish(s,promise,agent,tool='get_script'){
 await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.agent,agent);assert.equal(ev.tool,tool);
 assert.equal((await json(await s.req(bridge+'/iniciar',{peer:'peer001',reqId:ev.reqId}))).ok,true);
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{ok:true}}]});
 return {ev,result:await json(await promise)};
}
test('39 ferramentas: originais + coordenacao + play test/captura + grep/outline + ImportMCP + toolbox/inspect + studio_select + export_file + Sessao Viva',()=>{assert.equal(FERRAMENTAS.length,39);for(const n of ['livesession_status','livesession_control','livesession_verify','livesession_journal'])assert.ok(FERRAMENTAS.some(f=>f.name===n)&&!FERRAMENTAS_LOCAIS.includes(n));for(const n of ['set_script','create_script','set_properties','create_instance','insert_asset','import_asset','duplicate_instance','move_instance'])assert.equal(FERRAMENTAS.find(f=>f.name===n).inputSchema.properties.liveWaitMs?.type,'integer');assert.ok(FERRAMENTAS_LOCAIS.includes('studio_select'));assert.ok(FERRAMENTAS.some(f=>f.name==='export_file')&&!FERRAMENTAS_LOCAIS.includes('export_file'));for(const f of FERRAMENTAS)assert.equal(f.inputSchema.properties.place?.type,'string');for(const n of ['import_asset','import_upload','import_status','import_manage'])assert.ok(FERRAMENTAS.some(f=>f.name===n));for(const n of ['grep_scripts','outline_script'])assert.ok(FERRAMENTAS.some(f=>f.name===n));for(const n of ['run_luau','agent_open','agent_close','file_lock','file_unlock','file_locks','studio_play','studio_screenshot','get_logs'])assert.ok(FERRAMENTAS.some(f=>f.name===n));assert.ok(!FERRAMENTAS.some(f=>f.name.startsWith('team_')));assert.ok(FERRAMENTAS_LOCAIS.includes('get_logs')&&FERRAMENTAS_LOCAIS.includes('studio_screenshot'))});
test('todas as remotas aceitam identidade por chamada',()=>{for(const f of FERRAMENTAS.filter(f=>f.name!=='agent_open'))assert.ok(f.inputSchema.properties.agent)});
test('schemas rejeitam bypass e valores invalidos',()=>{const s=FERRAMENTAS.find(f=>f.name==='run_luau').inputSchema;for(const v of [{},{code:'return 1',force:true},{code:'return 1',readOnly:true},{code:'return 1',targets:[]},{code:'return 1',timeoutMs:99999},{code:'return 1',agent:'nome invalido'}])assert.ok(validar(s,v));assert.equal(validar(s,{code:'return 1',agent:'A'}),'')});
test('file_lock valida reserva multipla, TTL e tipo',()=>{const s=FERRAMENTAS.find(f=>f.name==='file_lock').inputSchema;for(const v of [{targets:[]},{targets:[3]},{targets:['A'],kind:'global'},{targets:['A'],seconds:0},[]])assert.ok(validar(s,v));assert.equal(validar(s,{targets:['A'],kind:'read',seconds:30}),'')});
test('initialize gera sessoes distintas apesar de mesmo clientInfo',async()=>{const s=setup();const msg={jsonrpc:'2.0',id:1,method:'initialize',params:{clientInfo:{name:'Notion'},protocolVersion:'2025-06-18'}};const a=await s.req(mcp,msg),b=await s.req(mcp,msg);assert.notEqual(a.headers.get('mcp-session-id'),b.headers.get('mcp-session-id'));assert.equal((await a.json()).result.serverInfo.version,'2.9.0')});
test('listagem e status funcionam offline',async()=>{const s=setup();const r=await json(await s.req(mcp,{jsonrpc:'2.0',id:1,method:'tools/list'}));assert.equal(r.result.tools.length,39);const st=value(await json(await s.rpc('studio_status')));assert.equal(st.studioOnline,false);assert.equal(st.controle.enabled,true);assert.equal(st.controle.runLuau,'free-validation');assert.equal(st.test.active,false);assert.equal(st.screenshot.helperOnline,false)});
test('catalogo descreve run_luau livre e sem trava global',()=>{const f=FERRAMENTAS.find(f=>f.name==='run_luau');assert.match(f.description,/Livre de travas/);assert.doesNotMatch(f.description,/GLOBAL/)});
test('agent_open cria identidades distintas na mesma conexao',async()=>{const s=setup(),h={'Mcp-Session-Id':'same'};const a=value(await json(await s.rpc('agent_open',{name:'builder'},h))),b=value(await json(await s.rpc('agent_open',{name:'builder'},h)));assert.notEqual(a.agent,b.agent)});
test('offline retorna isError sem deixar fila',async()=>{const s=setup();const r=await json(await s.rpc('run_luau',{code:'return 1',agent:'A'}));assert.equal(r.result.isError,true);assert.equal(value(r).nothingExecuted,true);assert.equal(s.obj.fila.length,0)});
test('plugin antigo e recusado',async()=>{const s=setup();assert.ok((await s.hello('peer001',{controle:undefined,versao:'1.0.0'})).status>=400);assert.equal(s.obj.pares.size,0)});

const dois=async(s)=>{await s.hello('peer001',{lugar:'Lobby',placeId:111});await s.hello('peer002',{lugar:'Arena',placeId:222})};
const evento=async(s,peer)=>{await wait(s.obj);return (await json(await s.poll(peer))).events[0]};
test('varios Studios conectam na mesma sessao e recebem alias estavel',async()=>{const s=setup();await dois(s);assert.equal(s.obj.paresOnline().length,2);const st=value(await json(await s.rpc('studio_status')));assert.equal(st.studiosOnline,2);assert.deepEqual(st.studios.map(x=>[x.alias,x.place,x.placeId]),[['s1','Lobby',111],['s2','Arena',222]]);const txt=text(await json(await s.rpc('studio_status',{format:'text'})));assert.match(txt,/2 Studios ONLINE/);assert.match(txt,/s1  place: Lobby/);assert.match(txt,/s2  place: Arena/)});
test('MAX_STUDIOS limita a sessao',async()=>{const s=setup();s.obj.env.MAX_STUDIOS='1';await s.hello();const r=await s.hello('peer002');assert.equal(r.status,409);assert.equal((await json(r)).erro.code,'TOO_MANY_STUDIOS')});
test('com varios Studios e sem place a chamada e recusada sem executar; com um so, e automatica',async()=>{const s=setup();await dois(s);const r=value(await json(await s.rpc('get_script',{target:'A',agent:'A'})));assert.equal(r.code,'PLACE_REQUIRED');assert.equal(r.nothingExecuted,true);assert.deepEqual(r.studios.map(x=>x.alias),['s1','s2']);assert.equal(s.obj.fila.length,0);await s.req(bridge+'/tchau',{peer:'peer002'});await finish(s,s.rpc('get_script',{target:'A',agent:'A'}),'A')});
test('place= por chamada aceita alias, nome e placeId, roteia ao Studio certo e nao vaza ao plugin',async()=>{const s=setup();await dois(s);
 let c=s.rpc('get_script',{target:'A',agent:'A',place:'s2'});let ev=await evento(s,'peer002');assert.equal(ev.tool,'get_script');assert.equal(ev.args.place,undefined);assert.equal(s.obj.fila.length,0);await s.req(bridge+'/resposta',{peer:'peer002',itens:[{reqId:ev.reqId,ok:true,resultado:{ok:true}}]});assert.equal(value(await json(await c)).place,'s2');
 c=s.rpc('get_script',{target:'A',agent:'A',place:'lobby'});ev=await evento(s,'peer001');await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{ok:true}}]});assert.equal(value(await json(await c)).place,'s1');
 c=s.rpc('get_script',{target:'A',agent:'A',place:'222'});ev=await evento(s,'peer002');await s.req(bridge+'/resposta',{peer:'peer002',itens:[{reqId:ev.reqId,ok:true,resultado:{ok:true}}]});assert.equal((await json(await c)).result.isError,undefined);

 c=s.rpc('get_script',{target:'A',agent:'A',place:'s1'});ev=await evento(s,'peer001');await s.req(bridge+'/resposta',{peer:'peer002',itens:[{reqId:ev.reqId,ok:true}]});assert.equal(s.obj.pend.size,1);await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:'ok'}]});await c});
test('seletor errado ou ambiguo e recusado sem executar',async()=>{const s=setup();await dois(s);await s.hello('peer003',{lugar:'Lobby2',placeId:333});assert.equal(value(await json(await s.rpc('get_script',{target:'A',agent:'A',place:'xyz'}))).code,'PLACE_NOT_FOUND');assert.equal(value(await json(await s.rpc('get_script',{target:'A',agent:'A',place:'lob'}))).code,'PLACE_AMBIGUOUS');assert.equal(s.obj.fila.length,0);

 const c=s.rpc('get_script',{target:'A',agent:'A',place:'Lobby'});const ev=await evento(s,'peer001');assert.equal(ev.tool,'get_script');await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{ok:true}}]});await c});
test('studio_select marca o place do agente; vale nas chamadas seguintes e por agente; place= prevalece',async()=>{const s=setup();await dois(s);
 const sel=value(await json(await s.rpc('studio_select',{agent:'A',place:'arena'})));assert.equal(sel.selected.alias,'s2');assert.equal(sel.studios.find(x=>x.alias==='s2').selected,true);
 let c=s.rpc('get_script',{target:'A',agent:'A'});let ev=await evento(s,'peer002');assert.equal(ev.agent,'A');await s.req(bridge+'/resposta',{peer:'peer002',itens:[{reqId:ev.reqId,ok:true,resultado:{ok:true}}]});await c;

 assert.equal(value(await json(await s.rpc('get_script',{target:'A',agent:'B'}))).code,'PLACE_REQUIRED');

 c=s.rpc('get_script',{target:'A',agent:'A',place:'s1'});ev=await evento(s,'peer001');await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{ok:true}}]});await c;
 const atual=value(await json(await s.rpc('studio_select',{agent:'A'})));assert.equal(atual.selected.alias,'s2');assert.equal(atual.selectedOnline,true);
 const st=value(await json(await s.rpc('studio_status',{agent:'A'})));assert.equal(st.selected.alias,'s2');assert.equal(st.studios.find(x=>x.alias==='s2').selected,true);

 assert.equal(value(await json(await s.rpc('studio_select',{agent:'A',clear:true}))).cleared,true);assert.equal(value(await json(await s.rpc('get_script',{target:'A',agent:'A'}))).code,'PLACE_REQUIRED')});
test('agent_open com place ja marca; texto orienta quando ha varios Studios',async()=>{const s=setup();await dois(s);const a=value(await json(await s.rpc('agent_open',{place:'s1'})));assert.equal(a.selected.alias,'s1');assert.equal(s.obj.escolhas.get(a.agent),'peer001');const t=text(await json(await s.rpc('agent_open',{format:'text'})));assert.match(t,/ATENCAO: 2 Studios online/);assert.match(t,/studio_select/)});
test('place marcado que desconecta da PLACE_OFFLINE (sem failover); reconexao do mesmo place herda alias e marcacao',async()=>{const s=setup();await dois(s);
 await s.rpc('studio_select',{agent:'A',place:'s2'});await s.req(bridge+'/tchau',{peer:'peer002'});
 const r=value(await json(await s.rpc('get_script',{target:'A',agent:'A'})));assert.equal(r.code,'PLACE_OFFLINE');assert.equal(r.nothingExecuted,true);assert.equal(s.obj.fila.length,0);
 assert.equal((await s.hello('peer003',{lugar:'Arena',placeId:222})).status,200);assert.equal(s.obj.pares.get('peer003').alias,'s2');assert.equal(s.obj.pares.has('peer002'),false);assert.equal(s.obj.escolhas.get('A'),'peer003');
 const c=s.rpc('get_script',{target:'A',agent:'A'});const ev=await evento(s,'peer003');await s.req(bridge+'/resposta',{peer:'peer003',itens:[{reqId:ev.reqId,ok:true,resultado:{ok:true}}]});await c});
test('tchau de um Studio cancela so os pedidos dele',async()=>{const s=setup();await dois(s);const c1=s.rpc('get_script',{target:'A',agent:'A',place:'s1'}),c2=s.rpc('get_script',{target:'A',agent:'B',place:'s2'});await wait(s.obj,2);await s.req(bridge+'/tchau',{peer:'peer001'});assert.equal(value(await json(await c1)).code,'STUDIO_DISCONNECTED');assert.equal(s.obj.pend.size,1);const ev=(await json(await s.poll('peer002'))).events[0];await s.req(bridge+'/resposta',{peer:'peer002',itens:[{reqId:ev.reqId,ok:true,resultado:'ok'}]});assert.equal((await json(await c2)).result.content[0].text,'ok')});
test('agent_close sem place libera em todos os Studios online e desmarca; com place so naquele',async()=>{const s=setup();await dois(s);await s.rpc('studio_select',{agent:'A',place:'s1'});
 const c=s.rpc('agent_close',{agent:'A'});await wait(s.obj,2);const e1=(await json(await s.poll('peer001'))).events[0],e2=(await json(await s.poll('peer002'))).events[0];assert.equal(e1.tool,'agent_close');assert.equal(e2.tool,'agent_close');
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:e1.reqId,ok:true,resultado:{agent:'A',released:2}}]});await s.req(bridge+'/resposta',{peer:'peer002',itens:[{reqId:e2.reqId,ok:true,resultado:{agent:'A',released:1}}]});
 const r=value(await json(await c));assert.equal(r.released,3);assert.deepEqual(r.studios.map(x=>x.alias),['s1','s2']);assert.equal(s.obj.escolhas.has('A'),false);
 const c2=s.rpc('agent_close',{agent:'B',place:'s2'});const e3=await evento(s,'peer002');assert.equal(s.obj.fila.length,0);await s.req(bridge+'/resposta',{peer:'peer002',itens:[{reqId:e3.reqId,ok:true,resultado:{agent:'B',released:0}}]});await c2});
test('logs sao etiquetados por place e get_logs filtra por place, marcacao ou all',async()=>{const s=setup();await dois(s);
 await s.req(bridge+'/relay',{relayId:'ed_1',ctx:'edit',peer:'peer001',placeId:111,place:'Lobby',wait:0,logs:[{message:'um'}]});
 await s.req(bridge+'/relay',{relayId:'ed_2',ctx:'edit',peer:'peer002',placeId:222,place:'Arena',wait:0,logs:[{message:'dois'}]});
 const s1=value(await json(await s.rpc('get_logs',{format:'json',place:'s1',context:'edit'})));assert.deepEqual(s1.logs.map(l=>[l.message,l.studio]),[['um','s1']]);assert.equal(s1.place,'s1');
 const todos=value(await json(await s.rpc('get_logs',{format:'json',context:'edit'})));assert.deepEqual(todos.logs.map(l=>l.message),['um','dois']);assert.equal(todos.place,'all');
 const txt=text(await json(await s.rpc('get_logs',{format:'text',context:'edit',place:'all'})));assert.match(txt,/\[edit@s1\] \[out \] um/);assert.match(txt,/\[edit@s2\] \[out \] dois/);
 await s.rpc('studio_select',{agent:'A',place:'s2'});const marcado=value(await json(await s.rpc('get_logs',{format:'json',agent:'A',context:'edit'})));assert.deepEqual(marcado.logs.map(l=>l.message),['dois']);
 const all=value(await json(await s.rpc('get_logs',{format:'json',agent:'A',context:'edit',place:'all'})));assert.equal(all.logs.length,2);

 const marc=value(await json(await s.rpc('get_logs',{format:'json',context:'mcp',place:'s1'})));assert.ok(marc.logs.every(l=>!l.studio||l.studio==='s1'))});
test('play test e relays sao por Studio: testArgs.peer associa o servidor e run_luau context=server vai ao relay certo',async()=>{const s=setup();await dois(s);
 await s.req(bridge+'/relay',{relayId:'srv1',ctx:'server',peer:'rnd1',placeId:111,place:'Lobby',wait:0,testId:'t1',testArgs:{mcp:true,testId:'t1',peer:'peer001'},logs:[{message:'srv lobby'}]});
 await s.req(bridge+'/relay',{relayId:'srv2',ctx:'server',peer:'rnd2',placeId:222,place:'Arena',wait:0,testId:'t2',testArgs:{mcp:true,testId:'t2',peer:'peer002'}});
 assert.equal(s.obj.relays.get('srv1').peer,'peer001');assert.equal(s.obj.relays.get('srv2').peer,'peer002');
 const st=value(await json(await s.rpc('studio_status')));assert.equal(st.studios[0].test.testId,'t1');assert.equal(st.studios[1].test.testId,'t2');assert.equal(st.relays.find(r=>r.studio==='s2').ctx,'server');
 const p1=value(await json(await s.rpc('studio_play',{action:'status',agent:'A',place:'s1'})));assert.equal(p1.testId,'t1');assert.equal(p1.place,'s1');
 const chamada=s.rpc('run_luau',{code:'return 1',context:'server',agent:'A',place:'s2'});
 const vazio=await json(await s.req(bridge+'/relay',{relayId:'srv1',ctx:'server',peer:'rnd1',placeId:111,wait:0,testId:'t1'}));assert.equal(vazio.comandos.length,0,'o comando nao vai ao servidor do outro place');
 const p=await json(await s.req(bridge+'/relay',{relayId:'srv2',ctx:'server',peer:'rnd2',placeId:222,wait:1500,testId:'t2'}));assert.equal(p.comandos.length,1);assert.equal(p.comandos[0].code,'return 1');assert.equal(p.studio,'s2');
 await s.req(bridge+'/relay',{relayId:'srv2',ctx:'server',peer:'rnd2',placeId:222,wait:0,testId:'t2',resultados:[{id:p.comandos[0].id,ok:true,resultado:{returned:[1]}}]});assert.deepEqual(value(await json(await chamada)).returned,[1]);

 await s.hello('peer004',{lugar:'Vazio',placeId:444});const off=value(await json(await s.rpc('run_luau',{code:'return 1',context:'server',agent:'A',place:'s3'})));assert.equal(off.code,'RELAY_OFFLINE');assert.match(off.message,/s3 \(Vazio\)/);

 const logs=value(await json(await s.rpc('get_logs',{format:'json',place:'s1',context:'server'})));assert.deepEqual(logs.logs.map(l=>l.message),['srv lobby'])});
test('play manual (sem testArgs.peer) associa o relay por placeId e nome',async()=>{const s=setup();await dois(s);await s.req(bridge+'/relay',{relayId:'srvm',ctx:'server',peer:'rndm',placeId:222,place:'Arena',wait:0});assert.equal(s.obj.relays.get('srvm').peer,'peer002');assert.equal(value(await json(await s.rpc('studio_play',{action:'status',agent:'A',place:'s2'}))).active,true);assert.equal(value(await json(await s.rpc('studio_play',{action:'status',agent:'A',place:'s1'}))).active,false)});
test('terminal: X-Mcp-Place e ?place= escolhem o Studio; sem eles da PLACE_REQUIRED 409',async()=>{const s=setup();await dois(s);
 let r=await raw(s,mcp+'/call/get_tree',{method:'POST',headers:{'X-Mcp-Agent':'t'},body:'target=game'});assert.equal(r.status,409);assert.match(await r.text(),/^ERRO PLACE_REQUIRED/);
 const c=raw(s,mcp+'/call/get_tree',{method:'POST',headers:{'X-Mcp-Agent':'t','X-Mcp-Place':'s2'},body:'target=game'});const ev=await evento(s,'peer002');assert.equal(ev.tool,'get_tree');assert.deepEqual(ev.args,{target:'game'});await s.req(bridge+'/resposta',{peer:'peer002',itens:[{reqId:ev.reqId,ok:true,resultado:{depth:1,nodes:1,tree:{name:'game',className:'DataModel',id:'i_0',childCount:0}}}]});assert.equal((await c).status,200);
 const c2=raw(s,mcp+'/luau?place=111',{method:'POST',headers:{'X-Mcp-Agent':'t'},body:'return 1'});const ev2=await evento(s,'peer001');assert.equal(ev2.tool,'run_luau');assert.equal(ev2.args.place,undefined);await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev2.reqId,ok:true,resultado:{returned:[1],returnCount:1,output:[],ms:1}}]});assert.equal((await c2).status,200);
 r=await raw(s,mcp+'/call/get_tree',{method:'POST',headers:{'X-Mcp-Agent':'t','X-Mcp-Place':'nada'},body:'target=game'});assert.equal(r.status,404);assert.match(await r.text(),/^ERRO PLACE_NOT_FOUND/);

 r=await raw(s,mcp+'/call/studio_select',{method:'POST',headers:{'X-Mcp-Agent':'t'},body:'place="Arena"'});assert.equal(r.status,200);assert.match(await r.text(),/marcado s2 \(Arena/);
 const c3=raw(s,mcp+'/call/get_selection',{method:'POST',headers:{'X-Mcp-Agent':'t'},body:''});const ev3=await evento(s,'peer002');assert.equal(ev3.tool,'get_selection');await s.req(bridge+'/resposta',{peer:'peer002',itens:[{reqId:ev3.reqId,ok:true,resultado:{count:0,items:[]}}]});await c3});
test('ola devolve alias e o plugin ve quantos Studios ha na sessao',async()=>{const s=setup();const a=await json(await s.hello('peer001',{lugar:'Lobby',placeId:111}));assert.equal(a.alias,'s1');assert.equal(a.studiosOnline,1);const b=await json(await s.hello('peer002',{lugar:'Arena',placeId:222}));assert.equal(b.alias,'s2');assert.equal(b.studiosOnline,2);assert.equal((await json(await s.hello('peer001',{lugar:'Lobby',placeId:111}))).alias,'s1')});
test('sem identidade nao ha dono anonimo compartilhado',async()=>{const s=setup();await s.hello();const r=await json(await s.rpc('get_script',{target:'A'}));assert.equal(value(r).code,'AGENT_REQUIRED');assert.equal(s.obj.fila.length,0)});
test('agent explicito vai em envelope nao adulteravel por arguments',async()=>{const s=setup();await s.hello();const c=s.rpc('get_script',{target:'A',agent:'agent-A'});const {ev}=await finish(s,c,'agent-A');assert.equal(ev.args.agent,undefined);assert.equal(typeof ev.reqId,'string');assert.ok(ev.prazoMs>0)});
test('Mcp-Session-Id identifica um unico agente automaticamente',async()=>{const s=setup();await s.hello();await finish(s,s.rpc('get_script',{target:'A'},{'Mcp-Session-Id':'own'}),'mcp:own')});
test('URL e cabecalho podem fixar agente',async()=>{const s=setup();await s.hello();await finish(s,s.req(mcp+'?agent=A',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_script',arguments:{format:'json',target:'A'}}}),'A');await finish(s,s.rpc('get_script',{target:'A'},{'X-Mcp-Agent':'B'}),'B')});
test('identidades divergentes sao recusadas',async()=>{const s=setup();await s.hello();const r=await json(await s.rpc('get_script',{target:'A',agent:'B'},{'X-Mcp-Agent':'A'}));assert.equal(value(r).code,'AGENT_MISMATCH');assert.equal(s.obj.fila.length,0)});
test('run_luau preserva codigo e recebe controle',async()=>{const s=setup();await s.hello();const code='local p=Instance.new("Part");p.Parent=workspace;return p';const {ev}=await finish(s,s.rpc('run_luau',{code,agent:'A',timeoutMs:1000}),'A','run_luau');assert.equal(ev.args.code,code);assert.equal(ev.controle.readGraceSeconds,8)});
test('batch entra em paralelo com identidades distintas',async()=>{const s=setup();await s.hello();const c=s.req(mcp,['A','B'].map((agent,id)=>({jsonrpc:'2.0',id,method:'tools/call',params:{name:'get_script',arguments:{format:'json',target:'Script'+agent,agent}}})));await wait(s.obj,2);const events=(await json(await s.poll())).events;assert.deepEqual(events.map(e=>e.agent),['A','B']);await s.req(bridge+'/resposta',{peer:'peer001',itens:events.map(e=>({reqId:e.reqId,ok:true,resultado:e.agent}))});assert.equal((await json(await c)).length,2)});
test('resposta de outro peer nao satisfaz pedido',async()=>{const s=setup();await s.hello();const c=s.rpc('get_script',{target:'A',agent:'A'});await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal((await s.req(bridge+'/resposta',{peer:'peer002',itens:[{reqId:ev.reqId,ok:true}]})).status,409);assert.equal(s.obj.pend.size,1);await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:'right'}]});assert.equal((await json(await c)).result.content[0].text,'right')});
test('erro estruturado do plugin chega intacto',async()=>{const s=setup();await s.hello();const c=s.rpc('set_script',{target:'A',source:'x',agent:'B'});await wait(s.obj);const ev=(await json(await s.poll())).events[0];await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:false,erro:{code:'LOCK_CONFLICT',message:'busy',retryAfterMs:8000}}]});const r=await json(await c);assert.equal(r.result.isError,true);assert.equal(value(r).retryAfterMs,8000)});
test('cancelamento invalida ticket e informa plugin',async()=>{const s=setup();await s.hello();const h={'Mcp-Session-Id':'one'};const c=s.rpc('run_luau',{code:'return 1',agent:'A'},h,22);await wait(s.obj);const ev=(await json(await s.poll())).events[0];await s.req(mcp,{jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:22}},h);assert.equal(value(await json(await c)).code,'CANCELLED');assert.equal((await json(await s.req(bridge+'/iniciar',{peer:'peer001',reqId:ev.reqId}))).ok,false);assert.deepEqual((await json(await s.poll())).cancels,[ev.reqId])});
test('cancelamento de outra sessao nao afeta pedido',async()=>{const s=setup();await s.hello();const c=s.rpc('get_script',{target:'A',agent:'A'},{'Mcp-Session-Id':'one'},7);await wait(s.obj);await s.req(mcp,{jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:7}},{'Mcp-Session-Id':'two'});assert.equal(s.obj.pend.size,1);await finish(s,c,'A')});
test('pedido vencido nao pode iniciar',async()=>{const s=setup();await s.hello();const c=s.rpc('get_script',{target:'A',agent:'A'});await wait(s.obj);const ev=(await json(await s.poll())).events[0];s.obj.pend.get(ev.reqId).ev.expiresAt=Date.now()-1;assert.equal((await json(await s.req(bridge+'/iniciar',{peer:'peer001',reqId:ev.reqId}))).ok,false);s.stop();await c});
test('reqIds nao colidem em objetos reiniciados',async()=>{const a=setup(),b=setup();await a.hello();await b.hello();const ca=a.rpc('get_script',{target:'A',agent:'A'}),cb=b.rpc('get_script',{target:'A',agent:'A'});await wait(a.obj);await wait(b.obj);assert.notEqual(a.obj.fila[0].reqId,b.obj.fila[0].reqId);a.stop();b.stop();await Promise.all([ca,cb])});
test('fila inclui pedidos ja entregues e evita crescimento ilimitado',async()=>{const s=setup();s.obj.env.FILA_MAX='2';await s.hello();const a=s.rpc('get_script',{target:'A',agent:'A'},{},1),b=s.rpc('get_script',{target:'B',agent:'B'},{},2);await wait(s.obj,2);await s.poll();assert.equal(value(await json(await s.rpc('get_script',{target:'C',agent:'C'}))).code,'QUEUE_FULL');s.stop();await Promise.all([a,b])});
test('tchau encerra pendencias e permite novo Studio',async()=>{const s=setup();await s.hello();const c=s.rpc('get_script',{target:'A',agent:'A'});await wait(s.obj);await s.req(bridge+'/tchau',{peer:'peer001'});assert.equal((await json(await c)).result.isError,true);assert.equal((await s.hello('peer002')).status,200)});
test('JSON malformado e lote vazio retornam erros de protocolo',async()=>{const s=setup();const r=await s.obj.fetch(new Request('https://test.local'+mcp,{method:'POST',body:'{bad'}));assert.equal((await r.json()).error.code,-32700);assert.equal((await json(await s.req(mcp,[]))).error.code,-32600)});
test('SSE preserva agent e autenticacao do endpoint',async()=>{const s=setup();const abort=new AbortController();const url=new URL('https://test.local'+mcp);url.searchParams.set('transport','sse');url.searchParams.set('agent','A');url.searchParams.set('chave','abc');const r=await s.obj.fetch(new Request(url,{signal:abort.signal}));const reader=r.body.getReader();const text=new TextDecoder().decode((await reader.read()).value);assert.match(text,/agent=A/);assert.match(text,/chave=abc/);abort.abort();await reader.cancel()});
test('roteador protege URL com SEGREDO opcional',async()=>{let count=0;const env={SEGREDO:'secret',SESSOES:{idFromName:x=>x,get:()=>({fetch:async()=>{count++;return new Response('ok')}})}};assert.equal((await worker.fetch(new Request('https://test.local'+mcp),env)).status,401);assert.equal((await worker.fetch(new Request('https://test.local'+mcp,{headers:{Authorization:'Bearer secret'}}),env)).status,200);assert.equal(count,1)});

const relay=(s,ctx,extra={})=>s.req(bridge+'/relay',{relayId:'relay_'+ctx,ctx,placeId:123,place:'TestPlace',wait:0,...extra});
const text=r=>r.result.content[0].text;
test('get_logs funciona offline, unifica contextos e entrega texto limpo com cursor',async()=>{
 const s=setup();
 await relay(s,'edit',{logs:[{t:1700000000000,level:'output',message:'ola do editor'},{t:1700000000500,level:'error',message:'Erro: quebrou\nStack Begin'}]});
 const r1=await json(await s.rpc('get_logs',{format:'text'}));
 assert.equal(r1.result.isError,undefined);
 const t=text(r1);assert.match(t,/^# logs: 2 linha\(s\)/);assert.match(t,/\[edit\] \[out \] ola do editor/);assert.match(t,/\[edit\] \[err \] Erro: quebrou\nStack Begin/);assert.match(t,/nextSince=2/);

 const j=value(await json(await s.rpc('get_logs',{format:'json',level:'error'})));assert.equal(j.count,1);assert.equal(j.logs[0].level,'error');assert.equal(j.logs[0].ctx,'edit');assert.equal(j.nextSince,2);

 const vazio=value(await json(await s.rpc('get_logs',{format:'json',since:2})));assert.equal(vazio.count,0);assert.equal(vazio.nextSince,2);
});
test('get_logs waitMs espera linha nova (tail) e context=client cobre client2',async()=>{
 const s=setup();
 const pendente=s.rpc('get_logs',{format:'json',since:0,waitMs:3000,context:'client'});
 await new Promise(r=>setTimeout(r,30));
 await relay(s,'server',{testId:'t_x',logs:[{level:'output',message:'servidor'}]});
 await relay(s,'client',{testId:'t_x',logs:[{level:'output',message:'cliente 1'}]});
 await s.req(bridge+'/relay',{relayId:'relay_client_b',ctx:'client',placeId:123,wait:0,testId:'t_x',logs:[{level:'warning',message:'cliente 2'}]});
 const r=value(await json(await pendente));assert.ok(r.count>=1);assert.ok(r.logs.every(l=>l.ctx.startsWith('client')));
 const todos=value(await json(await s.rpc('get_logs',{format:'json',context:'client',since:0})));assert.deepEqual(todos.logs.map(l=>l.ctx),['client','client2']);
 const st=value(await json(await s.rpc('studio_status')));assert.equal(st.test.active,true);assert.deepEqual(st.test.relays.map(r=>r.ctx).sort(),['client','client2','server']);assert.equal(st.test.testId,'t_x');
});
test('buffer de logs e circular e informa descarte',async()=>{
 const s=setup();s.obj.env.LOG_MAX='200';
 for(let i=0;i<3;i++)await relay(s,'edit',{logs:Array.from({length:100},(_,k)=>({level:'output',message:'linha '+(i*100+k)}))});
 const r=value(await json(await s.rpc('get_logs',{format:'json',limit:5})));assert.equal(r.totalBuffered,200);assert.equal(r.dropped,100);assert.equal(r.logs.at(-1).message,'linha 299');
 const gap=value(await json(await s.rpc('get_logs',{format:'json',since:10,limit:5})));assert.equal(gap.gap,true);assert.equal(gap.logs[0].message,'linha 100');assert.equal(gap.hasMore,true);
});
test('relay recebe comandos por long poll e devolve resultado ao run_luau context=server',async()=>{
 const s=setup();await s.hello();
 await relay(s,'server',{testId:'t_1'});
 const chamada=s.rpc('run_luau',{code:'return workspace.Name',context:'server',agent:'A'});
 const p=await json(await relay(s,'server',{testId:'t_1',wait:2000}));
 assert.equal(p.comandos.length,1);assert.equal(p.comandos[0].tipo,'luau');assert.equal(p.comandos[0].code,'return workspace.Name');assert.equal(p.comandos[0].agent,'A');
 await relay(s,'server',{testId:'t_1',resultados:[{id:p.comandos[0].id,ok:true,resultado:{returned:['Workspace'],context:'server'}}]});
 const r=value(await json(await chamada));assert.deepEqual(r.returned,['Workspace']);assert.equal(s.obj.fila.length,0,'nao deve ir para o editor');
});
test('run_luau context=server sem relay recusa sem executar; context=edit segue para o plugin',async()=>{
 const s=setup();await s.hello();
 const r=value(await json(await s.rpc('run_luau',{code:'return 1',context:'server',agent:'A'})));assert.equal(r.code,'RELAY_OFFLINE');assert.equal(r.nothingExecuted,true);
 const {ev}=await finish(s,s.rpc('run_luau',{code:'return 1',context:'edit',agent:'A'}),'A','run_luau');assert.equal(ev.args.context,'edit');
});
test('studio_play play: envia ao plugin, registra sessao, espera relay do servidor e devolve logsSince',async()=>{
 const s=setup();await s.hello();
 await relay(s,'edit',{logs:[{message:'antes'}]});
 const chamada=s.rpc('studio_play',{action:'play',agent:'A',waitMs:1500});
 await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.tool,'studio_play');assert.equal(ev.args.action,'play');assert.equal(ev.args.waitMs,undefined);
 await s.req(bridge+'/iniciar',{peer:'peer001',reqId:ev.reqId});
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{active:true,mode:'play',testId:'t_p1',startedAt:Date.now(),agent:'A',action:'play'}}]});
 await new Promise(r=>setTimeout(r,50));
 await relay(s,'server',{testId:'t_p1',logs:[{message:'servidor subiu'}]});
 const r=value(await json(await chamada));

 assert.equal(r.active,true);assert.equal(r.mode,'play');assert.equal(r.testId,'t_p1');assert.equal(r.serverRelayConnected,true);assert.equal(r.logsSince,2,'cursor aponta para antes da sessao');
 const logs=value(await json(await s.rpc('get_logs',{format:'json',since:r.logsSince})));assert.ok(logs.logs.some(l=>l.ctx==='mcp'&&/teste play iniciado/.test(l.message)));assert.ok(logs.logs.some(l=>l.ctx==='server'&&l.message==='servidor subiu'));

 const st=value(await json(await s.rpc('studio_play',{action:'status',agent:'A'})));assert.equal(st.active,true);

 const stop=s.rpc('studio_play',{action:'stop',agent:'A',waitMs:2000});
 const cmd=await json(await relay(s,'server',{testId:'t_p1',wait:2000}));assert.equal(cmd.comandos[0].tipo,'endTest');
 await wait(s.obj);const ev2=(await json(await s.poll())).events[0];assert.equal(ev2.args.action,'stop');
 await s.req(bridge+'/iniciar',{peer:'peer001',reqId:ev2.reqId});
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev2.reqId,ok:true,resultado:{active:true,mode:'play',testId:'t_p1',action:'stop'}}]});
 await relay(s,'server',{testId:'t_p1',resultados:[{id:cmd.comandos[0].id,ok:true,resultado:{ended:true}}]});
 await relay(s,'edit',{teste:{active:false,testId:'t_p1',mode:'play',endedAt:Date.now(),result:'mcp_stop'}});
 const fim=value(await json(await stop));assert.equal(fim.stopped,true);assert.equal(fim.active,false);assert.equal(fim.result,'mcp_stop');assert.deepEqual(fim.relayResult,{ended:true});
 const marcadores=value(await json(await s.rpc('get_logs',{format:'json',context:'mcp',since:0})));assert.ok(marcadores.logs.some(l=>/teste play encerrado/.test(l.message)));
});

async function sessaoPlayAtiva(s,testId='t_dead'){
 const chamada=s.rpc('studio_play',{action:'play',agent:'A',waitMs:1500});
 await wait(s.obj);const ev=(await json(await s.poll())).events[0];
 await s.req(bridge+'/iniciar',{peer:'peer001',reqId:ev.reqId});
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{active:true,mode:'play',testId,startedAt:Date.now(),agent:'A',action:'play',editModeActive:false}}]});
 await new Promise(r=>setTimeout(r,50));
 await relay(s,'server',{testId,logs:[{message:'servidor subiu'}]});
 const r=value(await json(await chamada));assert.equal(r.active,true);assert.equal(r.serverRelayConnected,true);
 return r;
}
const status=async(s,agent='B')=>value(await json(await s.rpc('studio_play',{action:'status',agent})));
test('stop pelo Studio: plugin reporta active=false com endedBy=studio e o Worker encerra a sessao e solta os relays',async()=>{
 const s=setup();await s.hello();const r=await sessaoPlayAtiva(s);
 await relay(s,'edit',{teste:{active:false,testId:r.testId,mode:'play',endedAt:Date.now(),endedBy:'studio',result:'stopped_in_studio',editModeActive:true}});
 const st=await status(s);assert.equal(st.active,false);assert.equal(st.result,'stopped_in_studio');assert.equal(st.relays.length,0);

 await relay(s,'server',{testId:r.testId,logs:[{message:'ultimo log'}]});
 assert.equal((await status(s)).active,false,'relay atrasado reabriu a sessao');
 const marcadores=value(await json(await s.rpc('get_logs',{format:'json',context:'mcp',since:0})));assert.ok(marcadores.logs.some(l=>/encerrado .*plugin\/studio/.test(l.message)));
});
test('plugin antigo preso em active=true: Studio no editor sem relays encerra a sessao apos a graca e nao trava outro agente',async()=>{
 const s=setup();await s.hello();const r=await sessaoPlayAtiva(s);
 const T=s.obj.testeDe('peer001');T.teste.iniciadoEm=Date.now()-60000;

 s.obj.relays.delete('relay_server');
 await relay(s,'edit',{teste:{active:true,testId:r.testId,mode:'play',editModeActive:true,runService:{isEdit:true,isRunning:false,isRunMode:false}}});
 const st=await status(s);assert.equal(st.active,false,'sessao morta continuou ativa');assert.equal(st.result,'stopped_in_studio');assert.equal(st.testId,r.testId);

 const chamada=s.rpc('studio_play',{action:'play',agent:'B',waitMs:500});
 await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.args.action,'play');
 await s.req(bridge+'/iniciar',{peer:'peer001',reqId:ev.reqId});
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{active:true,mode:'play',testId:'t_new',startedAt:Date.now(),agent:'B',action:'play',editModeActive:false}}]});
 const r2=value(await json(await chamada));assert.equal(r2.active,true);assert.equal(r2.testId,'t_new');
 s.stop();
});
test('sessao sem sinal do editor: relays do server/client sairam ha mais que a graca -> encerrada',async()=>{
 const s=setup();await s.hello();const r=await sessaoPlayAtiva(s);
 const T=s.obj.testeDe('peer001');T.teste.iniciadoEm=Date.now()-60000;T.testeStudio=null;
 s.obj.relays.get('relay_server').visto=Date.now()-30000;
 const st=await status(s);assert.equal(st.active,false);assert.equal(st.testId,r.testId);assert.equal(st.result,'stopped_in_studio');

 const s2=setup();await s2.hello();const r2=await sessaoPlayAtiva(s2,'t_vivo');
 s2.obj.testeDe('peer001').teste.iniciadoEm=Date.now()-60000;s2.obj.relays.get('relay_server').visto=Date.now()-30000;
 await relay(s2,'edit',{teste:{active:true,testId:'t_vivo',mode:'play',editModeActive:false}});
 assert.equal((await status(s2)).active,true,'sessao viva foi encerrada indevidamente');
});
test('studio_play reset descarta a sessao no Worker e no plugin',async()=>{
 const s=setup();await s.hello();const r=await sessaoPlayAtiva(s);
 const chamada=s.rpc('studio_play',{action:'reset',agent:'B',waitMs:500});
 await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.tool,'studio_play');assert.equal(ev.args.action,'reset');
 await s.req(bridge+'/iniciar',{peer:'peer001',reqId:ev.reqId});
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{active:false,action:'reset',endedBy:'reset',editModeActive:true}}]});
 const z=value(await json(await chamada));assert.equal(z.action,'reset');assert.equal(z.active,false);assert.equal(z.discarded.testId,r.testId);assert.equal(z.relays.length,0);
 assert.equal((await status(s)).active,false);
});
test('studio_play pause com servidor online vai pelo relay, nao pelo editor',async()=>{
 const s=setup();await s.hello();await relay(s,'server',{testId:'t_2'});
 const chamada=s.rpc('studio_play',{action:'pause',agent:'A',waitMs:1000});
 const p=await json(await relay(s,'server',{testId:'t_2',wait:1500}));assert.equal(p.comandos[0].tipo,'pause');
 await relay(s,'server',{testId:'t_2',resultados:[{id:p.comandos[0].id,ok:true,resultado:{paused:true}}]});
 const r=value(await json(await chamada));assert.deepEqual(r.relayResult,{paused:true});assert.equal(s.obj.fila.length,0);
});
test('studio_screenshot sem helper responde CAPTURE_HELPER_OFFLINE; com helper devolve imagem e URL',async()=>{
 const s=setup();
 const off=await json(await s.rpc('studio_screenshot',{agent:'A'}));assert.equal(off.result.isError,true);assert.equal(value(off).code,'CAPTURE_HELPER_OFFLINE');
 const pollHelper=s.req(bridge+'/captura/poll',{helper:'helper01',nome:'PC-TESTE',so:'Windows',wait:3000});
 await new Promise(r=>setTimeout(r,20));
 const chamada=s.rpc('studio_screenshot',{agent:'A',waitMs:3000,maxWidth:800});
 const pedidos=(await json(await pollHelper)).pedidos;assert.equal(pedidos.length,1);assert.equal(pedidos[0].janela,'studio');assert.equal(pedidos[0].maxWidth,800);
 const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4,5,6,7,8]).toString('base64');
 assert.equal((await s.req(bridge+'/captura/enviar',{helper:'helper01',id:pedidos[0].id,png,largura:800,altura:450})).status,200);
 const r=await json(await chamada);assert.equal(r.result.isError,undefined);assert.equal(r.result.content[0].type,'image');assert.equal(r.result.content[0].mimeType,'image/png');assert.equal(r.result.content[0].data,png);
 const meta=JSON.parse(r.result.content[1].text);assert.equal(meta.width,800);assert.match(meta.url,new RegExp(mcp+'/captura/'+meta.id+'\\.png$'));
 const img=await s.obj.fetch(new Request('https://test.local'+mcp+'/captura/'+meta.id+'.png'));assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/png');assert.equal((await img.arrayBuffer()).byteLength,16);
 const st=value(await json(await s.rpc('studio_status')));assert.equal(st.screenshot.helperOnline,true);assert.equal(st.screenshot.recent.length,1);

 const c2=s.rpc('studio_screenshot',{agent:'A',waitMs:2000});const p2=(await json(await s.req(bridge+'/captura/poll',{helper:'helper01',wait:1000}))).pedidos;
 await s.req(bridge+'/captura/enviar',{helper:'helper01',id:p2[0].id,png:Buffer.from('nao e png').toString('base64')});
 assert.equal(value(await json(await c2)).code,'CAPTURE_FAILED');
});
test('iniciar em lote autoriza varios eventos com um POST e nega os desconhecidos',async()=>{const s=setup();await s.hello();const c=s.req(mcp,['A','B'].map((agent,id)=>({jsonrpc:'2.0',id,method:'tools/call',params:{name:'get_script',arguments:{format:'json',target:'Script'+agent,agent}}})));await wait(s.obj,2);const events=(await json(await s.poll())).events;const r=await json(await s.req(bridge+'/iniciar',{peer:'peer001',reqIds:[...events.map(e=>e.reqId),'inexistente']}));assert.equal(r.ok,true);for(const e of events){assert.equal(r.tickets[e.reqId].ok,true);assert.equal(r.tickets[e.reqId].agent,e.agent)}assert.equal(r.tickets.inexistente.ok,false);await s.req(bridge+'/resposta',{peer:'peer001',itens:events.map(e=>({reqId:e.reqId,ok:true,resultado:e.agent}))});assert.equal((await json(await c)).length,2)});

test('toda ferramenta aceita format e o padrao e texto legivel',async()=>{for(const f of FERRAMENTAS)assert.deepEqual(f.inputSchema.properties.format.enum,['text','json']);const s=setup();const r=await json(await s.req(mcp,{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'agent_open',arguments:{}}}));const t=r.result.content[0].text;assert.match(t,/^agent=a_/);assert.ok(!t.startsWith('{'))});
test('erros em texto comecam com ERRO CODIGO e preservam flags',async()=>{const s=setup();const r=await json(await s.req(mcp,{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_script',arguments:{target:'A',agent:'A'}}}));assert.equal(r.result.isError,true);assert.match(r.result.content[0].text,/^ERRO STUDIO_OFFLINE: .*nada executado/)});
test('format=json mantem o objeto bruto do erro',async()=>{const s=setup();const r=value(await json(await s.rpc('get_script',{target:'A',agent:'A'})));assert.equal(r.code,'STUDIO_OFFLINE');assert.equal(r.nothingExecuted,true)});
test('resultado do plugin e renderizado em texto por ferramenta; format nao chega ao plugin',async()=>{const s=setup();await s.hello();const c=s.req(mcp,{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_script',arguments:{target:'A',agent:'A'}}});await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.args.format,undefined);assert.equal(ev.args.agent,undefined);await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{path:'game.ServerScriptService.A',id:'i_1',className:'Script',lines:2,revision:'r1',lineStart:1,lineEnd:2,source:'local x = 1\nprint(x)'}}]});const t=(await json(await c)).result.content[0].text;assert.equal(t,'# game.ServerScriptService.A [Script] i_1 lines=2 revision=r1\n1| local x = 1\n2| print(x)')});
test('grep_scripts e outline_script sao encaminhados ao plugin e renderizados',async()=>{const s=setup();await s.hello();const c=s.req(mcp,{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'grep_scripts',arguments:{pattern:'foo',agent:'A'}}});await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.tool,'grep_scripts');await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{pattern:'foo',regex:false,scripts:3,matchedScripts:1,count:1,truncated:false,results:[{path:'game.SSS.M',id:'i_2',className:'ModuleScript',lines:10,matches:[{line:4,text:'local foo = 1'}]}]}}]});const t=(await json(await c)).result.content[0].text;assert.match(t,/^# "foo": 1 ocorrencia\(s\) em 1\/3 script\(s\)\n## game.SSS.M \[ModuleScript\] i_2 lines=10\n\s+4: local foo = 1$/)});
test('poll entrega ticket embutido valido e /iniciar continua funcionando para plugins antigos',async()=>{const s=setup();await s.hello();const c=s.rpc('get_script',{target:'A',agent:'A'});await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.ticket.ok,true);assert.equal(ev.ticket.agent,'A');assert.ok(ev.ticket.prazoMs>0);const r=await json(await s.req(bridge+'/iniciar',{peer:'peer001',reqId:ev.reqId}));assert.equal(r.ok,true);await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{ok:true}}]});assert.equal(value(await json(await c)).ok,true)});

const raw=(s,path,opts={})=>s.obj.fetch(new Request('https://test.local'+path,opts));
test('GET na URL do MCP mostra ajuda de terminal; POST continua sendo MCP',async()=>{const s=setup();const r=await raw(s,mcp,{method:'GET'});assert.equal(r.status,200);const t=await r.text();assert.match(t,/curl -fsSL https:\/\/test.local\/mcp\/session1\/token123\/cli -o rbx/);assert.match(t,/X-Mcp-Agent/);const m=await json(await s.req(mcp,{jsonrpc:'2.0',id:1,method:'ping'}));assert.deepEqual(m.result,{})});
test('GET ?transport=sse continua abrindo SSE',async()=>{const s=setup();const r=await raw(s,mcp+'?transport=sse',{method:'GET'});assert.equal(r.headers.get('content-type'),'text/event-stream');await r.body.cancel()});
test('/cli e /cli.sh entregam scripts com a URL embutida',async()=>{const s=setup();for(const [p,ini] of [['/cli','#!/usr/bin/env python3'],['/cli.sh','#!/usr/bin/env bash']]){const r=await raw(s,mcp+p,{method:'GET'});assert.equal(r.status,200);const t=await r.text();assert.ok(t.startsWith(ini));assert.ok(t.includes('https://test.local/mcp/session1/token123'))}});
test('/tools lista e /tools/<nome> detalha; desconhecida da 404',async()=>{const s=setup();let t=await(await raw(s,mcp+'/tools',{method:'GET'})).text();assert.match(t,/^Ferramentas \(39\)/);assert.match(t,/\ngrep_scripts pattern=  \[/);const r=await raw(s,mcp+'/tools/get_script',{method:'GET'});assert.equal(r.status,200);t=await r.text();assert.match(t,/^## get_script/);assert.match(t,/\* target:/);assert.ok(!t.includes(' agent:'));assert.equal((await raw(s,mcp+'/tools/nada',{method:'GET'})).status,404)});
test('/call sem identidade orienta; studio_status funciona sem identidade',async()=>{const s=setup();const r=await raw(s,mcp+'/call/get_tree',{method:'POST',body:'target=game'});assert.equal(r.status,400);assert.match(await r.text(),/^ERRO AGENT_REQUIRED: envie o cabecalho X-Mcp-Agent/);const ok=await raw(s,mcp+'/call/studio_status',{method:'GET'});assert.equal(ok.status,200);assert.match(await ok.text(),/^# roblox-studio-mcp 2\.9\.0 \| Studio OFFLINE/)});
test('/call aceita k=v, JSON e query; format nao vaza e erro offline da 503',async()=>{const s=setup();const h={'X-Mcp-Agent':'term1'};let r=await raw(s,mcp+'/call/get_script',{method:'POST',headers:h,body:'target=game.ServerScriptService.Main lineStart=2'});assert.equal(r.status,503);assert.match(await r.text(),/^ERRO STUDIO_OFFLINE: .*nada executado/);r=await raw(s,mcp+'/call/get_script?format=json',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:'{"target":"A"}'});assert.equal(r.status,503);assert.equal(JSON.parse(await r.text()).code,'STUDIO_OFFLINE');r=await raw(s,mcp+'/call/get_script',{method:'POST',headers:h,body:'lineStart=abc'});assert.equal(r.status,400);assert.match(await r.text(),/INVALID_ARGUMENTS/)});
test('/call encaminha ao plugin com args coagidos e devolve texto renderizado',async()=>{const s=setup();await s.hello();const c=raw(s,mcp+'/call/get_tree',{method:'POST',headers:{'X-Mcp-Agent':'term2'},body:'target=game.Workspace depth=2 limit=50'});await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.tool,'get_tree');assert.equal(ev.agent,'term2');assert.deepEqual(ev.args,{target:'game.Workspace',depth:2,limit:50});await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{depth:2,nodes:2,truncated:false,tree:{name:'Workspace',className:'Workspace',id:'i_1',path:'game.Workspace',childCount:1,children:[{name:'Piso',className:'Part',id:'i_2',childCount:0}]}}}]});const r=await c;assert.equal(r.status,200);assert.match(await r.text(),/^# game.Workspace/)});
test('/luau manda o corpo como code e aceita query extra',async()=>{const s=setup();await s.hello();const c=raw(s,mcp+'/luau?timeoutMs=5000',{method:'POST',headers:{'X-Mcp-Agent':'term3'},body:'return 1+1'});await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.tool,'run_luau');assert.equal(ev.args.code,'return 1+1');assert.equal(ev.args.timeoutMs,5000);assert.equal(ev.args.format,undefined);await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{returned:[2],returnCount:1,output:[],ms:1}}]});const r=await c;assert.equal(r.status,200);assert.match(await r.text(),/2/)});
test('identidade fixa no terminal ignora agent divergente no corpo',async()=>{const s=setup();const r=await raw(s,mcp+'/call/get_script',{method:'POST',headers:{'X-Mcp-Agent':'fixo'},body:'target=A agent=outro'});assert.equal(r.status,503)});

const GLB=new Uint8Array([0x67,0x6c,0x54,0x46,2,0,0,0,20,0,0,0,1,2,3,4,5,6,7,8]);
test('import_asset exige uma fonte e valida os argumentos no Worker',()=>{const s=FERRAMENTAS.find(f=>f.name==='import_asset').inputSchema;assert.equal(validar(s,{url:'https://x/a.glb',parent:'game.Workspace',position:[0,1,2],scale:2,externals:[{name:'a.bin',url:'https://x/a.bin'}]}),'');for(const v of [{url:'https://x',position:[1,2]},{url:'https://x',as:'Part'},{url:'https://x',kind:'video'},{url:'https://x',maxSize:8},{url:'https://x',force:true}])assert.ok(validar(s,v));assert.equal(FERRAMENTAS_LOCAIS.includes('import_asset'),false)});
test('GET /import mostra ajuda; POST sem arquivo nem url orienta; sem identidade recusa',async()=>{const s=setup();const g=await raw(s,mcp+'/import',{method:'GET'});assert.equal(g.status,200);assert.match(await g.text(),/--data-binary @arvore.glb/);const r=await raw(s,mcp+'/import?parent=game.Workspace',{method:'POST',headers:{'X-Mcp-Agent':'imp'},body:''});assert.equal(r.status,400);assert.match(await r.text(),/^ERRO SOURCE_REQUIRED/);const sem=await raw(s,mcp+'/import',{method:'POST',body:GLB});assert.equal(sem.status,400);assert.match(await sem.text(),/AGENT_REQUIRED/)});
test('/upload guarda o arquivo, /blob serve pelas duas URLs e DELETE apaga',async()=>{const s=setup();const r=await raw(s,mcp+'/upload?fileName=caixa.glb&format=json',{method:'POST',headers:{'X-Mcp-Agent':'imp','Content-Type':'application/octet-stream'},body:GLB});assert.equal(r.status,200);const info=await r.json();assert.equal(info.bytes,20);assert.equal(info.fileName,'caixa.glb');assert.match(info.url,new RegExp('^https://test.local'+mcp+'/blob/b_[0-9a-f-]+/caixa.glb$'));const g=await raw(s,new URL(info.url).pathname,{method:'GET'});assert.equal(g.status,200);assert.equal(g.headers.get('content-type'),'application/octet-stream');assert.match(g.headers.get('content-disposition'),/filename="caixa.glb"/);assert.deepEqual(new Uint8Array(await g.arrayBuffer()),GLB);const ponte=await raw(s,new URL(info.url).pathname.replace('/mcp/','/ponte/'),{method:'GET'});assert.equal(ponte.status,200);const d=await raw(s,new URL(info.url).pathname,{method:'DELETE'});assert.equal(d.status,200);assert.equal((await raw(s,new URL(info.url).pathname,{method:'GET'})).status,404);assert.equal(s.obj.blobs.size,0)});
test('/import binario vira blob, encaminha import_asset com url do blob e apaga o blob ao terminar',async()=>{
 const s=setup();await s.hello();
 const c=raw(s,mcp+'/import?parent=game.Workspace&name=Caixa&scale=2&ground=true&fileName=caixa.glb',{method:'POST',headers:{'X-Mcp-Agent':'imp','Content-Type':'model/gltf-binary'},body:GLB});
 await wait(s.obj);const ev=(await json(await s.poll())).events[0];
 assert.equal(ev.tool,'import_asset');assert.equal(ev.agent,'imp');assert.equal(ev.args.parent,'game.Workspace');assert.equal(ev.args.name,'Caixa');assert.equal(ev.args.scale,2);assert.equal(ev.args.ground,true);assert.equal(ev.args.fileName,'caixa.glb');assert.equal(ev.args.format,undefined);
 assert.match(ev.args.url,new RegExp('^https://test.local'+mcp+'/blob/b_[0-9a-f-]+/caixa.glb$'));
 assert.equal(s.obj.blobs.size,1);
 const baixado=await raw(s,new URL(ev.args.url).pathname,{method:'GET'});assert.equal(baixado.status,200);assert.equal((await baixado.arrayBuffer()).byteLength,20);
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{ok:true,kind:'Mesh',path:'game.Workspace.Caixa',id:'i_9',className:'Model',instance:{path:'game.Workspace.Caixa',id:'i_9',className:'Model',name:'Caixa'},triangles:12,vertices:24,groups:1,chunks:1,textures:0,size:{x:1,y:1,z:1},inputBytes:20,ms:40,persisted:true}}]});
 const r=await c;assert.equal(r.status,200);const t=await r.text();assert.match(t,/^importado game.Workspace.Caixa \[Model\] i_9 kind=Mesh bytes=20 ms=40/);assert.match(t,/mesh: 12 triangulos/);
 assert.equal(s.obj.blobs.size,0,'blob descartado apos a importacao');
});
test('/import multipart aceita campos e arquivo; JSON com url dispensa blob',async()=>{
 const s=setup();await s.hello();
 const form=new FormData();form.append('parent','game.StarterGui');form.append('as','ImageLabel');form.append('file',new Blob([GLB],{type:'image/png'}),'logo.png');
 const c=raw(s,mcp+'/import',{method:'POST',headers:{'X-Mcp-Agent':'imp'},body:form});
 await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.args.parent,'game.StarterGui');assert.equal(ev.args.as,'ImageLabel');assert.equal(ev.args.fileName,'logo.png');assert.match(ev.args.url,/\/blob\/b_.*\/logo.png$/);
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:false,erro:{code:'IMPORTMCP_MISSING',message:'falta ServerStorage.ImportMCP',nothingExecuted:true}}]});
 const r=await c;assert.equal(r.status,503);assert.match(await r.text(),/^ERRO IMPORTMCP_MISSING/);assert.equal(s.obj.blobs.size,0);
 const c2=raw(s,mcp+'/import',{method:'POST',headers:{'X-Mcp-Agent':'imp','Content-Type':'application/json'},body:JSON.stringify({url:'https://site/x.glb',parent:'game.Workspace'})});
 await wait(s.obj);const ev2=(await json(await s.poll())).events[0];assert.equal(ev2.args.url,'https://site/x.glb');assert.equal(s.obj.blobs.size,0);
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev2.reqId,ok:true,resultado:{ok:true}}]});assert.equal((await c2).status,200);
});
test('limite de upload e respeitado',async()=>{const s=setup();s.obj.env.MAX_UPLOAD_BYTES='65536';const r=await raw(s,mcp+'/upload',{method:'POST',headers:{'X-Mcp-Agent':'imp'},body:new Uint8Array(70000)});assert.equal(r.status,413);assert.match(await r.text(),/^ERRO BODY_TOO_LARGE/);assert.equal(s.obj.blobs.size,0)});
test('import_status e import_manage seguem para o plugin e sao renderizados',async()=>{const s=setup();await s.hello();const c=raw(s,mcp+'/call/import_status',{method:'POST',headers:{'X-Mcp-Agent':'imp'},body:'list=true'});await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.tool,'import_status');assert.equal(ev.args.list,true);await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{ok:true,version:'1.2.0',runtime:{installed:true,version:1,path:'ReplicatedStorage.ImportMCPRuntime',upToDate:true},uploads:0,queued:0,imports:2,workerAlive:false,playing:false,progress:{},limits:{maxBytes:50331648,maxTexture:1024,triangles:2000000,vertices:2000000},assets:[{path:'game.Workspace.Caixa',className:'Model',kind:'Mesh',bytes:1200}]}}]});const t=await(await c).text();assert.match(t,/^# ImportMCP 1\.2\.0 \| runtime v1/);assert.match(t,/assets persistidos: 2/);assert.match(t,/game.Workspace.Caixa \[Model\] kind=Mesh bytes=1200/)});

import {renderizar} from '../formato.js';
import {renderizarToolbox,conteudoToolbox} from '../toolbox.js';
test('toolbox_search e local (Worker), valida schema e exige query ou assetIds',async()=>{
 assert.ok(FERRAMENTAS_LOCAIS.includes('toolbox_search'));assert.ok(!FERRAMENTAS_LOCAIS.includes('inspect_model'));
 const s=FERRAMENTAS.find(f=>f.name==='toolbox_search').inputSchema;
 assert.equal(validar(s,{query:'tree',category:'models',limit:5,thumbnailSize:420}),'');
 for(const v of [{query:'x',category:'hats'},{query:'x',thumbnailSize:300},{query:'x',limit:0},{query:'x',force:true}])assert.ok(validar(s,v));
 const st=setup();const r=await json(await st.rpc('toolbox_search',{}));assert.equal(r.result.isError,true);assert.equal(value(r).code,'INVALID_ARGUMENTS');assert.equal(st.obj.fila.length,0);
});
test('toolbox: texto compacto + miniaturas como blocos de imagem legendados',()=>{
 const r={query:'oak',category:'Model',total:317,count:2,nextCursor:'abc',suggestions:['pine'],insertHint:'insert_asset',items:[{id:1,name:'oak tree',type:'Model',creator:'bear',verified:true,free:true,votes:10,upVotePercent:90,triangles:2880,vertices:2106,hasScripts:true,scripts:2,description:'default',thumbnail:true},{id:2,name:'oak 2',type:'Model',creator:'x',free:false,priceRobux:50,hasScripts:false,scripts:0}],__imagens:[{id:1,b64:'AAAA',mime:'image/png'}]};
 const txt=renderizarToolbox(r);assert.match(txt,/^# toolbox "oak" \(Model\): 2 de 317 \| proxima pagina: cursor=abc/);assert.match(txt,/\[1\] id=1 "oak tree" \| Model \| por bear \(verificado\) \| gratis \| 90% de 10 votos \| 2880 tris\/2106 verts \| SCRIPTS=2/);assert.match(txt,/\[2\] id=2 .*R\$50/);assert.match(txt,/sugestoes: pine/);
 const c=conteudoToolbox(r,'text').__conteudo;assert.equal(c.length,3);assert.equal(c[0].type,'text');assert.equal(c[1].text,'[1] id=1 oak tree');assert.deepEqual(c[2],{type:'image',data:'AAAA',mimeType:'image/png'});assert.equal(r.__imagens,undefined);
});
test('inspect_model: schema, trava no plugin e renderizacao das projecoes',async()=>{
 const s=FERRAMENTAS.find(f=>f.name==='inspect_model').inputSchema;
 assert.equal(validar(s,{target:'game.Workspace.Casa',detail:'full',maxVertices:100,resolution:16}),'');
 for(const v of [{detail:'parts'},{target:'x',detail:'all'},{target:'x',resolution:4},{target:'x',maxVertices:5000}])assert.ok(validar(s,v));
 const st=setup();await st.hello();const c=st.rpc('inspect_model',{target:'game.Workspace.Casa',agent:'A'});await wait(st.obj);const ev=(await json(await st.poll())).events[0];assert.equal(ev.tool,'inspect_model');assert.equal(ev.args.target,'game.Workspace.Casa');
 const res={id:'i_p_1',name:'Casa',className:'Model',path:'game.Workspace.Casa',counts:{parts:2,meshParts:1,scripts:1},pivot:{position:[0,5,0],orientation:[0,90,0]},bounds:{size:[4,6,4],center:[0,3,0],min:[-2,0,-2],max:[2,6,2]},space:'local',parts:[{id:'i_p_2',name:'Piso',className:'Part',shape:'Block',pos:[0,-2.5,0],rot:[0,0,0],size:[4,1,4],material:'Wood',color:'#8b5a2b'},{id:'i_p_3',name:'Telhado',className:'MeshPart',shape:'Mesh',pos:[0,2.5,0],rot:[0,0,0],size:[4,1,4],material:'Slate',color:'#333333',meshId:'rbxassetid://1',anchored:false}],meshes:[{part:'Telhado',meshId:'rbxassetid://1',vertices:8,faces:12,source:'EditableMesh (asset)',bounds:{size:[4,1,4],min:[-2,-0.5,-2],max:[2,0.5,2]},vertexSample:[[-2,-0.5,-2]],vertexSampleNote:'primeiros 1 de 8',faceSample:[[0,1,2]],faceSampleNote:'indices'}],scripts:['game.Workspace.Casa.Porta.Script [Script]'],projections:{cell:0.25,views:[{name:'topo',desc:'de cima',colAxis:'X',colRange:[-2,2],lineAxis:'Z',lineRange:[-2,2],depth:{axis:'Y',far:0,near:6},rows:['..99..','.9999.']}]}};
 await st.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:res}]});const r=await json(await c);assert.equal(r.result.isError,undefined);
 const txt=renderizar('inspect_model',res);assert.match(txt,/^# game.Workspace.Casa \[Model\] i_p_1 parts=2 meshes=1 SCRIPTS=1/);assert.match(txt,/pivot pos=\(0,5,0\) rot=\(0,90,0\)/);assert.match(txt,/Telhado \[Mesh\] pos=\(0,2.5,0\).*NAO ancorada mesh=rbxassetid:\/\/1/);assert.match(txt,/verts=8 faces=12/);assert.match(txt,/f \(indices\): 0-1-2/);assert.match(txt,/topo \(de cima\) X:-2..2 Z:-2..2 \| 1=Y0 9=Y6\n  ..99..\n  .9999./);
});
test('insert_asset aceita kind/position/removeScripts e renderiza a lista de scripts',()=>{
 const s=FERRAMENTAS.find(f=>f.name==='insert_asset').inputSchema;
 assert.equal(validar(s,{assetId:1,kind:'audio',parent:'game.SoundService',position:[0,1,0],removeScripts:true}),'');
 for(const v of [{assetId:1,kind:'hat'},{assetId:1,position:[1]},{assetId:1,as:'Frame'}])assert.ok(validar(s,v));
 const txt=renderizar('insert_asset',{inserted:[{name:'Tree',className:'Model',path:'game.Workspace.Tree',id:'i_1',position:[0,5,0],size:[4,12,4]}],count:1,assetId:99,assetType:'model',parts:7,scripts:['game.Workspace.Tree.Script [Script]'],scriptsRemoved:0});
 assert.match(txt,/^# 1 inserida\(s\) asset=99 tipo=model parts=7\n  game.Workspace.Tree \[Model\] i_1 pos=\(0,5,0\) size=\(4,12,4\)\n## ATENCAO: 1 script/);
});

test('2.8.2 ola/poll/relay carregam boot (identidade da instancia do Worker)',async()=>{const s=setup();
 const h=await json(await s.hello());assert.match(h.boot,/^[0-9a-f-]{8}$/);
 const p=await json(await s.poll());assert.equal(p.boot,h.boot);
 const r=await json(await s.req(bridge+'/relay',{relayId:'ed_boot',ctx:'edit',peer:'peer001',wait:0}));assert.equal(r.boot,h.boot)});
test('2.8.2 get_logs sem linha do editor pede backfill ao relay de edicao e responde com as linhas reenviadas',async()=>{const s=setup({BACKFILL_ESPERA_MS:'3000'});await s.hello();
 await s.req(bridge+'/relay',{relayId:'ed_bf',ctx:'edit',peer:'peer001',wait:0});
 assert.equal(s.obj.logs.some(l=>l.ctx==='edit'),false);
 const pollRelay=s.req(bridge+'/relay',{relayId:'ed_bf',ctx:'edit',peer:'peer001',wait:3000});
 const leitura=s.rpc('get_logs',{format:'json'});
 const cmds=(await json(await pollRelay)).comandos;assert.equal(cmds.length,1);assert.equal(cmds[0].tipo,'backfill');assert.equal(cmds[0].limite,200);
 await s.req(bridge+'/relay',{relayId:'ed_bf',ctx:'edit',peer:'peer001',wait:0,backfill:2,logs:[{message:'antiga 1'},{message:'antiga 2'}],resultados:[{id:cmds[0].id,ok:true,resultado:{backfill:true,lines:2}}]});
 const r=value(await json(await leitura));assert.deepEqual(r.logs.filter(l=>l.ctx==='edit').map(l=>l.message),['antiga 1','antiga 2']);assert.equal(r.backfill.lines,2);assert.equal(r.backfill.answered,1);
 assert.ok(r.logs.some(l=>l.ctx==='mcp'&&/backfill/.test(l.message)),'marcador do backfill');

 const p2=s.req(bridge+'/relay',{relayId:'ed_bf',ctx:'edit',peer:'peer001',wait:300});
 const r2=value(await json(await s.rpc('get_logs',{format:'json',context:'edit'})));assert.equal(r2.backfill,undefined);assert.equal((await json(await p2)).comandos.length,0);

 s.obj.logs=[];const p3=s.req(bridge+'/relay',{relayId:'ed_bf',ctx:'edit',peer:'peer001',wait:200});
 const s2=setup();await s2.hello();await s2.req(bridge+'/relay',{relayId:'ed_mudo',ctx:'edit',peer:'peer001',wait:0});
 const txt=text(await json(await s2.rpc('get_logs',{format:'text',context:'edit'})));assert.match(txt,/backfill: pedido ao plugin, sem resposta a tempo/);await p3});
test('2.8.2 leitura vazia sem waitMs espera o relay do editor ate LOGS_ESPERA_MS; waitMs=0 responde na hora',async()=>{const s=setup({LOGS_ESPERA_MS:'1500'});await s.hello();
 await s.req(bridge+'/relay',{relayId:'ed_w',ctx:'edit',peer:'peer001',wait:0,logs:[{message:'antes'}]});
 const t0=Date.now();const leitura=s.rpc('get_logs',{format:'json',since:s.obj.logSeq});
 setTimeout(()=>s.req(bridge+'/relay',{relayId:'ed_w',ctx:'edit',peer:'peer001',wait:0,logs:[{message:'depois'}]}),200);
 const r=value(await json(await leitura));assert.deepEqual(r.logs.map(l=>l.message),['depois']);assert.ok(Date.now()-t0<1400,'respondeu assim que a linha chegou');
 const r0=value(await json(await s.rpc('get_logs',{format:'json',since:s.obj.logSeq,waitMs:0})));assert.equal(r0.count,0)});
test('2.8.2 POST /arquivo monta o blob em pedacos (binario e base64) e devolve a URL do MCP',async()=>{const s=setup();await s.hello();
 const bin=(path,body)=>s.obj.fetch(new Request('https://test.local'+path,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body}));
 const a=new Uint8Array([0,1,2,255,254]),b=new TextEncoder().encode('fim');
 const p1=await json(await bin(bridge+'/arquivo?peer=peer001&nome=Casa.rbxm&tipo=application/octet-stream&parte=1&len=5',a));assert.equal(p1.ok,true);assert.match(p1.uploadId,/^u_/);
 const p2=await json(await bin(bridge+`/arquivo?peer=peer001&nome=Casa.rbxm&tipo=application/octet-stream&parte=2&len=3&id=${p1.uploadId}&fim=1`,b));
 assert.equal(p2.ok,true);assert.equal(p2.bytes,8);assert.equal(p2.fileName,'Casa.rbxm');assert.equal(p2.url,'https://test.local/mcp/session1/token123/blob/'+p2.id+'/Casa.rbxm');assert.equal(s.obj.uploads.size,0);
 const got=await s.obj.fetch(new Request(p2.url));assert.equal(got.status,200);assert.deepEqual([...new Uint8Array(await got.arrayBuffer())],[0,1,2,255,254,102,105,109]);
 const mm=await bin(bridge+'/arquivo?peer=peer001&nome=x.lua&tipo=text/x-lua&parte=1&len=99&fim=1',b);assert.equal(mm.status,400);assert.equal((await json(mm)).erro.code,'BYTES_MISMATCH');assert.equal(s.obj.uploads.size,0);
 const b64=await json(await bin(bridge+'/arquivo?peer=peer001&nome=x.lua&tipo=text/x-lua&parte=1&len=12&fim=1&b64=1',btoa('print(1)')));assert.equal(b64.ok,true);assert.equal(b64.bytes,8);
 const lua=await s.obj.fetch(new Request(b64.url));assert.equal(await lua.text(),'print(1)');assert.match(lua.headers.get('content-type'),/text\/x-lua/);
 assert.equal((await bin(bridge+'/arquivo?peer=zzz&parte=1',a)).status,409);
 const p3=await json(await bin(bridge+'/arquivo?peer=peer001&nome=y&parte=1&len=5',a));assert.equal((await bin(bridge+`/arquivo?peer=peer001&parte=3&id=${p3.uploadId}&len=3`,b)).status,400)});
test('2.8.2 export_file: assets ganham URL do proxy /asset, resultado traz dica e o texto compacto resume o arquivo',async()=>{const s=setup();await s.hello();
 const promise=s.rpc('export_file',{target:'game.Workspace.Arvore',kind:'asset',agent:'A'});
 await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.tool,'export_file');assert.equal(ev.args.kind,'asset');
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{kind:'asset',path:'game.Workspace.Arvore',className:'MeshPart',assets:[{assetId:123,property:'MeshId'},{assetId:456,property:'TextureID'}]}}]});
 const r=value(await json(await promise));assert.equal(r.assets[0].url,'https://test.local/mcp/session1/token123/asset/123');assert.equal(r.assets[1].url,'https://test.local/mcp/session1/token123/asset/456');assert.match(r.hint,/assets/);
 const t=renderizar('export_file',{kind:'rbxm',path:'game.Workspace.Casa',className:'Model',fileName:'Casa.rbxm',bytes:2048,instances:12,url:'https://x/blob/b_1/Casa.rbxm',expiresInSeconds:1800,hint:'curl ...',assets:[{assetId:9,property:'TextureID',className:'MeshPart',path:'game.Workspace.Casa.Telhado',url:'https://x/asset/9'}]});
 assert.match(t,/^# export rbxm game.Workspace.Casa \[Model\] file=Casa.rbxm bytes=2048 instances=12\nurl: https:\/\/x\/blob\/b_1\/Casa.rbxm \(expira em 1800s\)\n## assets \(1\)\n  9 TextureID \[MeshPart\] game.Workspace.Casa.Telhado\n    https:\/\/x\/asset\/9\ncurl .../);
 const script=renderizar('export_file',{kind:'script',path:'game.ServerScriptService.Main',className:'Script',fileName:'Main.server.lua',bytes:9,lines:1,revision:'r1',content:'print(1)\n',url:'https://x/blob/b_2/Main.server.lua'});assert.match(script,/lines=1 revision=r1/);assert.match(script,/## content \(9 chars\)\nprint\(1\)/);
 assert.equal((await s.obj.fetch(new Request('https://test.local'+mcp+'/asset/abc'))).status,400)});

test('livesession_*: vao para o plugin com agent e alvos; texto mostra live/persist e erros de compilacao',async()=>{const s=setup();await s.hello();
 const c=s.rpc('livesession_verify',{targets:['game.ServerScriptService.Main'],waitMs:1000,agent:'A',format:'text'});await wait(s.obj);const ev=(await json(await s.poll())).events[0];assert.equal(ev.tool,'livesession_verify');assert.deepEqual(ev.args.targets,['game.ServerScriptService.Main']);assert.equal(ev.args.waitMs,1000);
 await s.req(bridge+'/resposta',{peer:'peer001',itens:[{reqId:ev.reqId,ok:true,resultado:{state:'Running',stateLabel:'Rodando',live:true,waitedMs:300,reloads:4,summary:{total:2,live:1,persist:1},results:[{path:'game.ServerScriptService.Main',className:'Script',id:'i_x_1',exists:true,live:true,synced:true,running:{server:1,client:0},persist:true,reason:'registrado no journal: persiste ao encerrar'},{path:'game.StarterGui.HUD.LocalScript',className:'LocalScript',id:'i_x_2',exists:true,live:false,synced:true,compileError:'Expected end',persist:false,reason:'mudanca ainda nao processada pelo hot reload'}]}}]});
 const t=text(await json(await c));assert.match(t,/^# Sessao Viva Rodando: 1\/2 live, 1\/2 persistem \| esperou 300ms \| reloads=4/);assert.match(t,/Main \[Script\] i_x_1: live rodando\[server=1\] \| persiste/);assert.match(t,/ERRO DE COMPILACAO: Expected end/)});
test('escrita com Sessao Viva rodando anexa o bloco liveSession ao texto',()=>{
 const t=renderizar('set_script',{path:'game.ServerScriptService.Main',className:'Script',id:'i_x_1',lines:10,chars:200,edits:1,revision:'r2',liveSession:{state:'Running',sessionId:'ls-1',applied:true,persisted:true,waitedMs:280,items:[{path:'game.ServerScriptService.Main',live:true,persist:true,running:{server:1}}],lastReload:{seq:7,label:'Main',count:1,affected:1,swapped:1,elapsedMs:3.2}}});
 assert.match(t,/^ok game.ServerScriptService.Main/);assert.match(t,/## sessao viva Running \(ls-1\): APLICADO no playtest, persiste ao encerrar \| 280ms/);assert.match(t,/Main: live rodando\[server=1\]/);assert.match(t,/ultimo reload #7: Main \(1 script\(s\)\) affected=1 swapped=1 3.2ms/);
 const p=renderizar('set_properties',{path:'game.StarterGui.HUD.Frame',className:'Frame',applied:['Size'],liveSession:{state:'Running',applied:true,persisted:true,recorded:1}});assert.match(p,/1 propriedade\(s\) no journal/);
 const n=renderizar('livesession_status',{installed:false,state:'Missing',hint:'instale',importmcp:{installed:true,runtimeVersion:4,sessionAssets:3,materialized:2,notMaterialized:['game.Workspace.Arvore'],liveToken:true}});assert.match(n,/NAO carregada/);assert.match(n,/materializados neste Studio: 2\/3/);assert.match(n,/nao materializado: game.Workspace.Arvore/);
 const st=renderizar('livesession_status',{installed:true,state:'Running',stateLabel:'Rodando',running:true,live:true,engine:'hosted',version:'1.1.0',sessionId:'ls-1',uptimeSeconds:42,fps:60,physics:'60 Hz',scripts:{server:3,client:2},hotReload:{active:true,reloads:5,pending:0,debounceSeconds:0.25,broken:[{path:'Workspace.X',error:'oops'}],last:{seq:5,label:'Main',count:1,affected:1,swapped:1,elapsedMs:2}},journal:{entries:9,chars:2048,byKind:{source:4,create:3,property:2},byOrigin:{recording:6,mcp:3}},loadIssues:[],unpersisted:{cloneEdits:[{path:'CoreGui.__LiveSessionClient.Player1.PlayerGui.HUD.LocalScript',original:'game.StarterGui.HUD.LocalScript'}],runtimeEdits:[],ambiguous:0},client:{active:true,status:'Player1 vivo',guiMounted:2,guiSync:true},output:{errors:1,warnings:2},importmcp:{installed:false}});
 assert.match(st,/PLAYTEST ATIVO no editor \| motor=hosted \| sessao=ls-1 \| 42s/);assert.match(st,/scripts rodando: server=3 client=2/);assert.match(st,/QUEBRADO Workspace.X: oops/);assert.match(st,/origens recording=6 mcp=3/);assert.match(st,/NAO PERSISTE \(clone\)/);assert.match(st,/StarterGui espelhado em tempo real/)});
test('studio_status mostra a Sessao Viva reportada pelo plugin',async()=>{const s=setup();await s.hello('peer001',{teste:{active:false,liveSession:{state:'Running',sessionId:'ls-9',engine:'hosted',reloads:3}}});const t=text(await json(await s.rpc('studio_status',{format:'text'})));assert.match(t,/sessao viva: Running \(ls-9\) motor=hosted reloads=3/)});
