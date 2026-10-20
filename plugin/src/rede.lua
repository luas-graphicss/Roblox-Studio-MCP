local atualizarUi=function()end
local cacheEventos,ordemEventos={},{}
local execucoes,emExecucao={},0
local limpezasPendentes={}
local consumindoThread,enviandoThread=nil,nil
local MAX_PARALELO,MAX_CACHE,LOTE_RESPOSTAS=4,300,10
local COALESCER_RESPOSTAS=0.05
local LIMITE_ITEM_BYTES,LIMITE_LOTE_BYTES=700*1024,900*1024
local GRACA_ORFAO=3
local bytesDe=setmetatable({},{__mode='k'})
local function textoErro(e)return type(e)=='table' and tostring(e.message or e.code or 'erro de controle') or tostring(e)end
local function threadViva(t)return t~=nil and coroutine.status(t)~='dead' end
local function pedir(caminho,corpo,base,secret)
 base=base or urlBase;if secret==nil then secret=chave end
 local h={['Content-Type']='application/json',['Accept']='application/json'};if secret~=''then h.Authorization='Bearer '..secret end
 local ok,response=pcall(function()return HttpService:RequestAsync({Url=base..'/'..caminho,Method=corpo==nil and 'GET' or 'POST',Headers=h,Body=corpo~=nil and HttpService:JSONEncode(corpo) or nil})end)
 if not ok then return nil,tostring(response)end
 if not response.Success then return nil,'HTTP '..tostring(response.StatusCode)..' '..string.sub(tostring(response.Body),1,250)end
 local parsed,data=pcall(function()return HttpService:JSONDecode(response.Body)end)
 if not parsed then return nil,'Resposta ilegivel do Worker'end;return data,nil
end
local function identidade()
 local studio='';pcall(function()studio=tostring(version())end)
 local resumo=controle:summary();resumo.executing=emExecucao;resumo.pendingCleanups=#limpezasPendentes
 return {peer=peer,lugar=game.Name,placeId=game.PlaceId,versao=VERSAO,studio=studio,ferramentas=NOMES,controle=resumo,teste=estadoTeste()}
end

local function confirmar(lote)
 for _,item in ipairs(lote)do local cached=cacheEventos[item.reqId];if cached then cacheEventos[item.reqId]={acked=true}end end
end
local function erroDefinitivo(e)

 return type(e)=='string' and string.match(e,'^HTTP 4%d%d')~=nil
end

local function medirItem(item)
 local ok,json=pcall(function()return HttpService:JSONEncode(item)end)
 local tamanho=(ok and type(json)=='string') and #json or 0
 if not ok then
  item={reqId=item.reqId,ok=false,erro={code='RESULT_UNSERIALIZABLE',message='O resultado nao pode ser serializado em JSON ('..tostring(json)..'). Retorne tabelas simples, numeros e strings.',nothingExecuted=false}}
  tamanho=400
 elseif tamanho>LIMITE_ITEM_BYTES then
  item={reqId=item.reqId,ok=false,erro={code='RESULT_TOO_LARGE',message='O resultado tem '..math.floor(tamanho/1024)..'KB, acima do limite de '..math.floor(LIMITE_ITEM_BYTES/1024)..'KB por chamada. A execucao ACONTECEU no Studio; apenas o retorno foi descartado. Retorne menos dados (filtre, pagine, agregue) e repita so a leitura.',nothingExecuted=false,bytes=tamanho}}
  tamanho=600
 end
 bytesDe[item]=tamanho
 return item
end
local function retirarLote()
 local lote,bytes={},0
 while #lote<LOTE_RESPOSTAS and #bufferRespostas>0 do
  local proximo=bufferRespostas[1]
  local tamanho=bytesDe[proximo] or 0
  if #lote>0 and bytes+tamanho>LIMITE_LOTE_BYTES then break end
  table.insert(lote,table.remove(bufferRespostas,1));bytes=bytes+tamanho
 end
 return lote
end
local function devolverLote(lote)for i=#lote,1,-1 do table.insert(bufferRespostas,1,lote[i])end end

local function tratarFalhaLote(lote,e)
 if not erroDefinitivo(e) then devolverLote(lote);return end
 if #lote>1 then
  for _,item in ipairs(lote)do bytesDe[item]=LIMITE_LOTE_BYTES end
  devolverLote(lote);return
 end
 local item=lote[1]
 if item and not item.rejeitado then
  local leve={reqId=item.reqId,ok=false,rejeitado=true,erro={code='RESPONSE_REJECTED',message='O Worker recusou a resposta original ('..tostring(e)..'); o resultado foi descartado. A execucao pode ter acontecido no Studio.',nothingExecuted=false}}
  bytesDe[leve]=500
  table.insert(bufferRespostas,1,leve)
 end
end
local function enviarRespostas()
 if threadViva(enviandoThread) then return end
 local generation,base,secret=geracao,urlBase,chave
 enviandoThread=task.spawn(function()

  task.wait(COALESCER_RESPOSTAS)
  while conectado and generation==geracao and #bufferRespostas>0 do
   local lote=retirarLote()
   local _,e=pedir('resposta',{peer=peer,itens=lote},base,secret)
   if generation~=geracao then break end
   if e then
    tratarFalhaLote(lote,e);ultimoErro=e

    if not erroDefinitivo(e) then break end
    task.wait(COALESCER_RESPOSTAS)
   else confirmar(lote)end
  end
 end)
end
local function limparContexto(ctx)
 local safe=true
 for i=#ctx.cleanups,1,-1 do
  local ok,e=pcall(ctx.cleanups[i])
  if ok then table.remove(ctx.cleanups,i)else safe=false;ultimoErro=textoErro(e)end
 end
 for rec in pairs(ctx.recordings)do
  local ok,e=pcall(function()ChangeHistoryService:FinishRecording(rec,Enum.FinishRecordingOperation.Cancel)end)
  if ok then ctx.recordings[rec]=nil else safe=false;ultimoErro=textoErro(e)end
 end
 return safe
end

local function tentarLimpezasPendentes()
 for i=#limpezasPendentes,1,-1 do
  local ctx=limpezasPendentes[i]
  if limparContexto(ctx)then (ctx.owner or controle):finish(ctx,false);table.remove(limpezasPendentes,i)end
 end
end
local function reterContexto(ctx)
 for _,pending in ipairs(limpezasPendentes)do if pending==ctx then return end end
 table.insert(limpezasPendentes,ctx)
end
local function eventoValido(ev)
 return conectado and ev.generation==geracao and not ev.cancelled and os.clock()<ev.deadline
end

local function pedirTickets(rodada)

 local lote={};for _,ev in ipairs(rodada)do if type(ev.ticket)~='table' then table.insert(lote,ev)end end
 if #lote==0 then return end
 local ids={};for _,ev in ipairs(lote)do table.insert(ids,ev.reqId)end
 local resposta,err
 if #ids==1 then resposta,err=pedir('iniciar',{peer=peer,reqId=ids[1]})
 else
  resposta,err=pedir('iniciar',{peer=peer,reqIds=ids})

  if resposta and type(resposta.tickets)~='table' and not err then
   for _,ev in ipairs(lote)do ev.ticket=nil end
   return
  end
 end
 for _,ev in ipairs(lote)do
  local ticket=nil
  if resposta then
   if type(resposta.tickets)=='table' then ticket=resposta.tickets[ev.reqId]
   elseif #ids==1 then ticket=resposta end
  end
  ev.ticket=ticket or {ok=false,erro=err or (resposta and resposta.erro) or 'Pedido nao autorizado para iniciar.'}
 end
end
local function executarProtegido(ev)
 tentarLimpezasPendentes()
 if not eventoValido(ev) then falharControle('REQUEST_EXPIRED','Pedido expirado/cancelado antes de executar.')end
 local ticket,err=ev.ticket,nil
 if ticket==nil then ticket,err=pedir('iniciar',{peer=peer,reqId=ev.reqId})end
 if not ticket or ticket.ok~=true then falharControle('REQUEST_EXPIRED',err or (ticket and (type(ticket.erro)=='table' and ticket.erro.message or ticket.erro)) or 'Pedido nao autorizado para iniciar.')end
 if not conectado or ev.generation~=geracao or ev.cancelled then falharControle('CANCELLED','Conexao alterada antes de iniciar.')end
 if ticket.agent~=ev.agent or type(ev.agent)~='string' or ev.agent=='' then falharControle('AGENT_MISMATCH','Identidade do evento diverge do Worker.')end
 ev.deadline=math.min(ev.deadline,os.clock()+math.max(0,tonumber(ticket.prazoMs)or 0)/1000)
 if ev.tool=='run_luau'then ev.deadline=math.min(ev.deadline,os.clock()+math.clamp(tonumber(ev.args.timeoutMs)or 30000,100,40000)/1000)end
 if os.clock()>=ev.deadline then falharControle('REQUEST_EXPIRED','Nao sobrou prazo para executar.')end
 controle:configure(ev.controle)
 local plans=prepararControle(ev)
 local dono=controle
 local ctx=dono:begin(ev.agent,plans,ev.tool);ctx.owner=dono;ctx.deadline=ev.deadline
 ev.context=ctx
 local finished,packed,thread=false,nil,nil
 local anterior=contextoAtual
 contextoAtual=ctx
 local okStart,startError=pcall(function()
  verificarVersoes(ev)
  local depois=vigiarRunLuau(ev);ctx.afterRun=depois
  thread=task.spawn(function()packed=table.pack(pcall(acoes[ev.tool],ev.args));finished=true end)
 end)
 if contextoAtual==ctx then contextoAtual=anterior end
 if not okStart then packed={false,startError,n=2};finished=true end
 while not finished do
  if ev.cancelled or ev.generation~=geracao or not conectado or os.clock()>=ev.deadline then
   ctx.cancelled=true
   if thread and coroutine.status(thread)~='dead' then
    local alvo=thread
    table.insert(ctx.cleanups,function()if coroutine.status(alvo)~='dead' then task.cancel(alvo)end end)
   end
   packed={false,{code=ev.cancelled and 'CANCELLED' or 'EXECUTION_TIMEOUT',message='Execucao encerrada pelo prazo/cancelamento. Confira o estado antes de repetir.',nothingExecuted=false},n=2};finished=true
  else task.wait(.02)end
 end
 local success=packed and packed[1]==true
 if success then
  local ok,e=pcall(function()
   local result=packed[2]or{}
   contextoAtual=ctx;registrarVersoes(ev,result);contextoAtual=anterior
   if ctx.afterRun then pcall(ctx.afterRun,result)end

   pcall(live.aposEscrita,ev,result)
   packed[2]=result
  end)
  if not ok then success=false;packed={false,e,n=2}end
 elseif ctx.afterRun and type(packed[2])=='table' then pcall(ctx.afterRun,packed[2])end
 if contextoAtual==ctx then contextoAtual=anterior end
 if limparContexto(ctx)then dono:finish(ctx,success)
 else
  reterContexto(ctx)
  error({code='CLEANUP_FAILED',message='Falha ao encerrar esta execucao; suas travas ficam retidas e serao liberadas assim que a limpeza concluir. Outras chamadas continuam funcionando.',nothingExecuted=false},0)
 end
 if not success then error(packed and packed[2]or'erro desconhecido',0)end
 return packed[2]
end
local function executar(ev)
 local begin=os.clock();ultimaFerramenta=tostring(ev.tool or '?')
 local ok,res=pcall(executarProtegido,ev)
 local item={reqId=ev.reqId,ok=ok,ms=math.floor((os.clock()-begin)*1000)}
 if ok then item.resultado=res or{ok=true};contaOk=contaOk+1 else item.erro=res;ultimoErro=textoErro(res);contaErro=contaErro+1 end
 item=medirItem(item)
 local cached=cacheEventos[ev.reqId];if cached and not cached.acked then cached.result=item;cached.event=nil end
 if ev.generation==geracao then table.insert(bufferRespostas,item);enviarRespostas()end
 atualizarUi()
end
local consumir
local function concluirExecucao(ev)
 if execucoes[ev]then execucoes[ev]=nil;emExecucao=math.max(0,emExecucao-1)end
 task.defer(consumir)
end
local function lancar(ev)
 local t=task.spawn(function()
  local ok,e=pcall(executar,ev)
  if not ok then
   ultimoErro='Falha interna: '..textoErro(e)
   if ev.context and not ev.context.done then reterContexto(ev.context)end
   if ev.generation==geracao then table.insert(bufferRespostas,medirItem({reqId=ev.reqId,ok=false,erro=ultimoErro}));enviarRespostas()end
  end
  concluirExecucao(ev)
 end)

 if execucoes[ev] then execucoes[ev]=t end
end

local function varrerOrfaos()
 local agora=os.clock()
 local perdidas=0
 for ev,t in pairs(execucoes)do
  local morta=(t==true) or not threadViva(t)
  if morta and agora>=ev.deadline+GRACA_ORFAO then
   execucoes[ev]=nil;emExecucao=math.max(0,emExecucao-1);perdidas=perdidas+1
   if ev.context and not ev.context.done then ev.context.cancelled=true;reterContexto(ev.context)end
   local cached=cacheEventos[ev.reqId]
   if ev.generation==geracao and not (cached and (cached.result or cached.acked)) then
    local item=medirItem({reqId=ev.reqId,ok=false,erro={code='EXECUTION_LOST',message='A execucao foi perdida (a thread morreu ou o Studio a encerrou num congelamento). O estado pode ter sido alterado; confira antes de repetir.',nothingExecuted=false,executionUnknown=true}})
    if cached then cached.result=item;cached.event=nil end
    table.insert(bufferRespostas,item)
   end
   contaErro=contaErro+1
  end
 end
 tentarLimpezasPendentes()
 if #bufferRespostas>0 then enviarRespostas()end
 if #filaLocal>0 then consumir()end
 atualizarUi()
 return perdidas
end
local function supervisionar(generation)
 while conectado and generation==geracao do
  task.wait(1)
  if not conectado or generation~=geracao then break end
  pcall(varrerOrfaos)
 end
end
consumir=function()
 if threadViva(consumindoThread) then return end
 if #filaLocal==0 or emExecucao>=MAX_PARALELO then atualizarUi();return end
 consumindoThread=task.spawn(function()
  while #filaLocal>0 and emExecucao<MAX_PARALELO do
   local rodada={}
   while #filaLocal>0 and emExecucao+#rodada<MAX_PARALELO do
    local ev=table.remove(filaLocal,1)
    if eventoValido(ev) then table.insert(rodada,ev)
    else

     execucoes[ev]=true;emExecucao=emExecucao+1;lancar(ev)
    end
   end
   if #rodada>0 then
    for _,ev in ipairs(rodada)do execucoes[ev]=true;emExecucao=emExecucao+1 end
    pedirTickets(rodada)
    for _,ev in ipairs(rodada)do lancar(ev)end
   end
   atualizarUi()
  end
 end)
end
local function podarCache()
 while #ordemEventos>MAX_CACHE do
  local id=ordemEventos[1];local cached=cacheEventos[id]
  if cached and cached.event and not cached.result then break end
  table.remove(ordemEventos,1);cacheEventos[id]=nil
 end
end

local bootWorker=nil
local function anotarSessao(resp)
 if type(resp)~='table' then return end
 pcall(function()
  if type(resp.alias)=='string' then script:SetAttribute('MCPAlias',resp.alias)end
  if tonumber(resp.studiosOnline) then script:SetAttribute('MCPStudios',tonumber(resp.studiosOnline))end
 end)
 if type(resp.boot)=='string' and resp.boot~='' then
  if bootWorker~=nil and bootWorker~=resp.boot then
   bootWorker=resp.boot
   pcall(reiniciarBackfillRelay,200)
  else bootWorker=resp.boot end
 end
end
local function receber(response,generation)
 anotarSessao(response)
 for _,id in ipairs(response.cancels or{})do local cached=cacheEventos[id];if cached and cached.event then cached.event.cancelled=true end end
 for _,ev in ipairs(response.events or{})do
  if type(ev.reqId)=='string'then
   local cached=cacheEventos[ev.reqId]
   if cached then if cached.result then table.insert(bufferRespostas,cached.result)end
   else
    ev.generation=generation;ev.args=ev.args or{};ev.deadline=os.clock()+math.max(0,tonumber(ev.prazoMs)or 0)/1000
    if type(ev.ticket)=='table' and (ev.ticket.ok~=true or ev.ticket.agent~=ev.agent) then ev.ticket=nil end
    cacheEventos[ev.reqId]={event=ev};table.insert(ordemEventos,ev.reqId);table.insert(filaLocal,ev)
   end
  end
 end
 podarCache()
 consumir();if #bufferRespostas>0 then enviarRespostas()end
end
local function laco(generation)
 local base,secret=urlBase,chave
 local tentativa=0
 while conectado and generation==geracao do
  local hello,e=pedir('ola',identidade(),base,secret)
  if hello and hello.ok==true then
   controle:configure(hello.controle);esperaMs=math.clamp(tonumber(hello.esperaMs)or 25000,1000,30000)
   anotarSessao(hello)

   iniciarRelay('edit',hello.backfill==true)
   break
  end
  if generation~=geracao then return end
  local motivo=e or (hello and (hello.erro and (type(hello.erro)=='table' and hello.erro.message or hello.erro)) or 'Worker recusou conexao')
  if erroDefinitivo(e) or tentativa>=60 then conectado=false;ultimoErro=tostring(motivo);atualizarUi();return end
  tentativa=tentativa+1;ultimoErro='reconectando ('..tentativa..'): '..tostring(motivo);atualizarUi()
  task.wait(math.min(30,2^math.min(tentativa,5)))
 end
 if not conectado or generation~=geracao then return end
 local backoff=1
 while conectado and generation==geracao do
  local body=identidade();body.wait=esperaMs
  local lote=nil
  if #bufferRespostas>0 then lote=retirarLote();body.itens=lote end
  local response,err=pedir('poll',body,base,secret)
  if not conectado or generation~=geracao then if lote then devolverLote(lote)end;break end
  if err then
   if lote then tratarFalhaLote(lote,err)end
   ultimoErro=err;atualizarUi();task.wait(math.min(15,backoff));backoff=backoff*2
  else
   if lote then confirmar(lote)end
   backoff=1;ultimoErro='';receber(response,generation);atualizarUi();task.wait(.05)
  end
 end
end
local function normalizar(txt)
 return tostring(txt or ''):gsub('%s+',''):gsub('[?#].*$',''):gsub('/+$',''):gsub('/estado$',''):gsub('/poll$',''):gsub('/mcp/','/ponte/')
end
local function cancelarTudo()
 for ev in pairs(execucoes)do ev.cancelled=true end
 for _,ev in ipairs(filaLocal)do ev.cancelled=true end
end
local function conectar(txt)
 local u=normalizar(txt)
 if not string.match(u,'^https?://[^/]+/ponte/[%w_-]+/[%w_-]+$')then ultimoErro='Cole https://.../mcp/SESSAO/TOKEN';atualizarUi();return false end
 if conectado then ultimoErro='Desconecte antes de reconectar.';atualizarUi();return false end

 cancelarTudo()

 peer=string.sub(HttpService:GenerateGUID(false):gsub('[{}-]',''),1,12)
 porId=setmetatable({},{__mode='v'});porInst=setmetatable({},{__mode='k'});proximoId=0
 filaLocal={};bufferRespostas={};cacheEventos={};ordemEventos={};controle=novoControle();bootWorker=nil
 urlBase=u;geracao=geracao+1;conectado=true;ultimoErro=''
 plugin:SetSetting('mcpUrl',u);plugin:SetSetting('mcpChave',chave);plugin:SetSetting('mcpAuto',true)
 local generation=geracao
 task.spawn(function()

  local quedas=0
  while conectado and generation==geracao do
   local ok,e=pcall(laco,generation)
   if not conectado or generation~=geracao then break end
   quedas=quedas+1
   ultimoErro=(ok and 'Laco encerrou; religando' or ('Laco caiu: '..textoErro(e)))..' ('..quedas..')';atualizarUi()
   task.wait(math.min(30,2*quedas))
  end
 end)

 task.spawn(function()
  while conectado and generation==geracao do
   pcall(supervisionar,generation)
   if conectado and generation==geracao then task.wait(2)end
  end
 end)
 atualizarUi();return true
end
local function desconectar()
 local base,secret,oldPeer=urlBase,chave,peer;conectado=false;geracao=geracao+1
 cancelarTudo();pararRelay()
 filaLocal={};bufferRespostas={}
 plugin:SetSetting('mcpAuto',false)
 if base~=''then task.spawn(function()pcall(pedir,'tchau',{peer=oldPeer},base,secret)end)end
 atualizarUi()
end
