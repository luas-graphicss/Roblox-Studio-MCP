local RunServiceRelay=game:GetService('RunService')
local StudioTestServiceRelay=nil
pcall(function()StudioTestServiceRelay=game:GetService('StudioTestService')end)
local RELAY_ESPERA_COMANDOS_MS=5000
local RELAY_DEBOUNCE=0.3
local RELAY_INTERVALO_MIN=0.5
local RELAY_MAX_PENDENTES=3000
local RELAY_MAX_LOTE=200
local RELAY_MAX_MENSAGEM=20000
local relayAtivo=false
local relayGeracao=0
local relayId=string.sub(string.gsub(HttpService:GenerateGUID(false),'[{}-]',''),1,12)
local relayCtx='edit'
local relayLogs,relayResultados,relayDescartados={},{},0
local relayFlushAgendado,relayForcar=false,false
local relayUltimoEnvio=0
local relayConexaoLog=nil
local relayTestArgs=nil

local hist={n=0,last=nil,pend={},fila={},intervalo=1.0,ttl=15,loteMax=RELAY_MAX_LOTE,loteBytes=400*1024,falhas=0,reenvio=0,pedido=nil,ocupado=false,denovo=false}
local function agoraMsRelay()return DateTime.now().UnixTimestampMillis end
local NIVEL_LOG={}
pcall(function()
 NIVEL_LOG[Enum.MessageType.MessageOutput]='output';NIVEL_LOG[Enum.MessageType.MessageInfo]='info'
 NIVEL_LOG[Enum.MessageType.MessageWarning]='warning';NIVEL_LOG[Enum.MessageType.MessageError]='error'
end)
local function nivelDe(kind)
 local n=NIVEL_LOG[kind];if n then return n end
 local s=tostring(kind)
 if string.find(s,'Error',1,true)then return 'error'elseif string.find(s,'Warning',1,true)then return 'warning'elseif string.find(s,'Info',1,true)then return 'info'end
 return 'output'
end
local function relayCorpo(extra)
 local body={relayId=relayId,ctx=relayCtx,peer=peer,placeId=game.PlaceId,place=game.Name,versao=VERSAO}
 if relayTestArgs~=nil then
  body.testArgs=codificar(relayTestArgs)
  if type(relayTestArgs)=='table' and type(relayTestArgs.testId)=='string' then body.testId=relayTestArgs.testId end
 end
 if relayCtx=='edit' then body.teste=estadoTeste()end
 for k,v in pairs(extra or {})do body[k]=v end
 return body
end
local relayFlush,executarComandos,reconciliarHistorico
local relayFlushAgendadoEm=0
local function agendarFlush()
 if not relayAtivo then return end

 if relayFlushAgendado and os.clock()-relayFlushAgendadoEm<10 then return end
 relayFlushAgendado=true;relayFlushAgendadoEm=os.clock()
 local gen=relayGeracao
 local espera=math.max(RELAY_DEBOUNCE,RELAY_INTERVALO_MIN-(os.clock()-relayUltimoEnvio))
 task.delay(espera,function()
  relayFlushAgendado=false
  if gen==relayGeracao and relayAtivo then relayFlush(gen)end
 end)
end
local function chaveLog(level,message)return level..'\0'..message end
local function guardarLinha(t,level,message)
 if #relayLogs>=RELAY_MAX_PENDENTES then table.remove(relayLogs,1);relayDescartados=relayDescartados+1 end
 table.insert(relayLogs,{t=t,level=level,message=message})
end

local function empilharLog(message,kind,t)
 if not relayAtivo then return end
 local level=nivelDe(kind);local msg=string.sub(tostring(message),1,RELAY_MAX_MENSAGEM)
 guardarLinha(t or agoraMsRelay(),level,msg)
 local key=chaveLog(level,msg)
 hist.pend[key]=(hist.pend[key] or 0)+1
 table.insert(hist.fila,{key=key,t=os.clock()})
 if #hist.fila>RELAY_MAX_PENDENTES then
  local velha=table.remove(hist.fila,1);local c=hist.pend[velha.key]
  if c and c>1 then hist.pend[velha.key]=c-1 else hist.pend[velha.key]=nil end
 end
 agendarFlush()
end
local function mesmaEntrada(a,b)return a~=nil and b~=nil and a.message==b.message and a.messageType==b.messageType and a.timestamp==b.timestamp end
local function posicionarHistorico(lista,limite)
 local n=#lista;local c=math.max(0,n-limite)
 hist.n=c;hist.last=c>0 and lista[c] or nil
end

local function passoHistorico()
 local ok,lista=pcall(function()return LogService:GetLogHistory()end)
 if not ok or type(lista)~='table' then return 0 end
 local reenviar=false
 if hist.pedido then local lim=hist.pedido;hist.pedido=nil;posicionarHistorico(lista,lim);reenviar=lim>0 end
 local n=#lista
 if n==0 then hist.n=0;hist.last=nil;return 0 end
 local inicio
 if hist.last==nil then inicio=1
 elseif hist.n>=1 and hist.n<=n and mesmaEntrada(lista[hist.n],hist.last) then inicio=hist.n+1
 else

  inicio=1
  for i=math.min(n,hist.n),1,-1 do if mesmaEntrada(lista[i],hist.last) then inicio=i+1;break end end
 end
 local agora=os.clock()
 while #hist.fila>0 and agora-hist.fila[1].t>hist.ttl do
  local velha=table.remove(hist.fila,1);local c=hist.pend[velha.key]
  if c and c>1 then hist.pend[velha.key]=c-1 else hist.pend[velha.key]=nil end
 end
 local novas=0;local orcamento=novoOrcamento()
 for i=inicio,n do
  respirar(orcamento)
  local l=lista[i];local level=nivelDe(l.messageType);local msg=string.sub(tostring(l.message),1,RELAY_MAX_MENSAGEM)
  local key=chaveLog(level,msg);local c=hist.pend[key]
  if c then
   if c>1 then hist.pend[key]=c-1 else hist.pend[key]=nil end
   for j=1,#hist.fila do if hist.fila[j].key==key then table.remove(hist.fila,j);break end end
  else
   local t=tonumber(l.timestamp);t=t and math.floor(t*1000) or agoraMsRelay()
   guardarLinha(t,level,msg);novas=novas+1
  end
 end
 hist.n=n;hist.last=lista[n]
 if reenviar then hist.reenvio=hist.reenvio+novas end
 return novas
end
reconciliarHistorico=function(forcarFlush)
 if not relayAtivo then return 0 end

 if hist.ocupado then hist.denovo=true;return 0 end
 hist.ocupado=true
 local total=0
 local ok,e=pcall(function()
  repeat hist.denovo=false;total=total+passoHistorico() until not hist.denovo and not hist.pedido
 end)
 hist.ocupado=false
 if not ok then ultimoErro='relay historico: '..tostring(e)end
 if total>0 or forcarFlush then agendarFlush()end
 return total
end
local function devolverLote(logs,resultados,descartados,reenvio)
 for i=#logs,1,-1 do table.insert(relayLogs,1,logs[i])end
 for _,r in ipairs(resultados)do table.insert(relayResultados,r)end
 relayDescartados=relayDescartados+descartados;hist.reenvio=hist.reenvio+reenvio
end
relayFlush=function(gen)
 if gen~=relayGeracao or not relayAtivo then return end

 reconciliarHistorico(false)
 if gen~=relayGeracao or not relayAtivo then return end
 if #relayLogs==0 and #relayResultados==0 and not relayForcar then return end
 relayForcar=false
 local logs,bytes={},0
 while #logs<hist.loteMax and #relayLogs>0 do
  local prox=relayLogs[1];local tam=#prox.message+64
  if #logs>0 and bytes+tam>hist.loteBytes then break end
  table.insert(logs,table.remove(relayLogs,1));bytes=bytes+tam
 end
 local resultados=relayResultados;relayResultados={}
 local descartados=relayDescartados;relayDescartados=0
 local reenvio=hist.reenvio;hist.reenvio=0
 relayUltimoEnvio=os.clock()
 local corpo=relayCorpo({logs=logs,resultados=resultados,descartados=descartados,wait=0})
 if reenvio>0 then corpo.backfill=reenvio end
 local resposta,err=pedir('relay',corpo)
 if gen~=relayGeracao then return end
 if err then
  hist.falhas=hist.falhas+1
  if relayCtx=='edit' then ultimoErro='relay: '..tostring(err)end
  local grande=#logs>1 and (bytes>64*1024 or erroDefinitivo(err))
  if grande then

   hist.loteMax=math.max(1,math.floor(#logs/2))
   devolverLote(logs,resultados,descartados,reenvio)
  elseif #logs==1 and (erroDefinitivo(err) or hist.falhas>=5) then

   local culpada=logs[1]
   devolverLote({},resultados,descartados+1,reenvio)
   if #culpada.message>2048 then guardarLinha(culpada.t,'warning','[mcp] linha de '..#culpada.message..' caracteres descartada pelo relay: '..string.sub(tostring(err),1,120))end
   hist.falhas=0
  else devolverLote(logs,resultados,descartados,reenvio)end
  task.delay(2,function()if gen==relayGeracao then relayForcar=true;agendarFlush()end end)
  return
 end
 hist.falhas=0
 if hist.loteMax<RELAY_MAX_LOTE then hist.loteMax=math.min(RELAY_MAX_LOTE,hist.loteMax*2)end
 anotarSessao(resposta)
 if type(resposta)=='table' and type(resposta.comandos)=='table' and #resposta.comandos>0 then executarComandos(resposta.comandos)end
 if #relayLogs>0 or #relayResultados>0 then agendarFlush()end
end
local executorRelay=nil
local function executarComando(cmd)
 local tipo=tostring(cmd.tipo or '')
 if tipo=='ping' then
  return {ctx=relayCtx,isServer=RunServiceRelay:IsServer(),isClient=RunServiceRelay:IsClient(),isRunMode=RunServiceRelay:IsRunMode(),isRunning=RunServiceRelay:IsRunning(),isEdit=RunServiceRelay:IsEdit(),place=game.Name,placeId=game.PlaceId,testArgs=codificar(relayTestArgs)}
 end
 if tipo=='backfill' then

  local n=reiniciarBackfillRelay(cmd.limite)
  return {backfill=true,lines=n,ctx=relayCtx}
 end
 if tipo=='endTest' then
  if not StudioTestServiceRelay then error({code='TEST_API_UNAVAILABLE',message='StudioTestService indisponivel neste Studio; pare pelo botao Stop.'},0)end
  if RunServiceRelay:IsServer() or RunServiceRelay:IsRunMode() then
   StudioTestServiceRelay:EndTest(cmd.valor~=nil and cmd.valor or 'mcp_stop');return {ended=true,ctx=relayCtx}
  end
  if StudioTestServiceRelay:CanLeaveTest() then StudioTestServiceRelay:LeaveTest();return {left=true,ctx=relayCtx}end
  error({code='WRONG_CONTEXT',message='EndTest so pode ser chamado no servidor da sessao.'},0)
 end
 if tipo=='pause' then RunServiceRelay:Pause();return {paused=true,ctx=relayCtx}end
 if tipo=='resume' then RunServiceRelay:Run();return {resumed=true,ctx=relayCtx}end
 if tipo=='luau' then
  if type(loadstring)~='function' or type(setfenv)~='function' then error({code='LUAU_UNAVAILABLE',message='loadstring/setfenv indisponiveis neste DataModel.'},0)end

  executorRelay=executorRelay or criarRunLuau({task=task,clock=os.clock,compile=loadstring,setEnvironment=setfenv,environment=getfenv(),log=LogService.MessageOut,encode=codificar,history=function(_,fn)return fn()end,require=require,source=fonteDe,path=caminhoDe,freshDefault=false,frame=quadroCompartilhado})
  local timeout=math.clamp(tonumber(cmd.timeoutMs)or 30000,100,40000)/1000
  local ctx={agent=cmd.agent,cleanups={},recordings={},deadline=os.clock()+timeout,cancelled=false,done=false}
  local ok,res=pcall(executorRelay,{code=cmd.code,freshRequire=cmd.freshRequire,undoLabel=cmd.undoLabel},ctx)
  ctx.done=true
  for i=#ctx.cleanups,1,-1 do pcall(ctx.cleanups[i])end
  if not ok then error(res,0)end
  res.context=relayCtx;return res
 end
 error({code='UNKNOWN_COMMAND',message='comando desconhecido: '..tipo},0)
end
executarComandos=function(comandos)
 for _,cmd in ipairs(comandos)do
  if type(cmd)=='table' and cmd.id~=nil then
   task.spawn(function()
    local ok,res=pcall(executarComando,cmd)
    local item={id=cmd.id,ok=ok}
    if ok then item.resultado=res or {ok=true}
    else item.erro=(type(res)=='table') and res or {code='RELAY_ERROR',message=tostring(res)}end
    table.insert(relayResultados,item);relayForcar=true;agendarFlush()
   end)
  end
 end
end
local function relayLacoComandos(gen)
 local backoff=1
 while relayAtivo and gen==relayGeracao do
  local resposta,err=pedir('relay',relayCorpo({wait=RELAY_ESPERA_COMANDOS_MS}))
  if not relayAtivo or gen~=relayGeracao then return end
  if err then task.wait(math.min(15,backoff));backoff=backoff*2
  else
   backoff=1
   anotarSessao(resposta)
   if type(resposta)=='table' and type(resposta.comandos)=='table' and #resposta.comandos>0 then executarComandos(resposta.comandos)end
   task.wait(0.05)
  end
 end
end

local function relayLacoHistorico(gen)
 while relayAtivo and gen==relayGeracao do
  task.wait(hist.intervalo)
  if not relayAtivo or gen~=relayGeracao then return end
  pcall(reconciliarHistorico,false)
 end
end
pararRelay=function()
 if not relayAtivo then return end
 relayAtivo=false;relayGeracao=relayGeracao+1
 if relayConexaoLog then pcall(function()relayConexaoLog:Disconnect()end);relayConexaoLog=nil end
 relayLogs={};relayResultados={};relayDescartados=0;relayFlushAgendado=false;relayForcar=false
 hist.pend={};hist.fila={};hist.reenvio=0;hist.pedido=nil;hist.ocupado=false;hist.denovo=false
end
iniciarRelay=function(ctx,backfill,testArgs)
 pararRelay()
 relayGeracao=relayGeracao+1;local gen=relayGeracao
 relayCtx=ctx;relayTestArgs=testArgs;relayAtivo=true
 hist.loteMax=RELAY_MAX_LOTE;hist.falhas=0

 hist.pedido=backfill and (ctx=='edit' and 200 or 500) or 0
 relayConexaoLog=LogService.MessageOut:Connect(function(message,kind)empilharLog(message,kind)end)
 task.spawn(relayLacoComandos,gen)
 task.spawn(relayLacoHistorico,gen)
 relayForcar=true
 reconciliarHistorico(true)
end

reiniciarBackfillRelay=function(limite)
 if not relayAtivo then return 0 end
 limite=math.clamp(math.floor(tonumber(limite) or 200),1,500)
 relayLogs={};hist.pend={};hist.fila={};hist.pedido=limite
 relayForcar=true
 return reconciliarHistorico(true)
end
acordarRelay=function()
 if relayAtivo then relayForcar=true;agendarFlush()end
end

if not RunServiceRelay:IsEdit() then
 local salvaUrl=plugin:GetSetting('mcpUrl')
 local salvaChave=plugin:GetSetting('mcpChave')
 local urlNormalizada=type(salvaUrl)=='string' and (normalizar(salvaUrl)) or ''
 if plugin:GetSetting('mcpAuto')==true and string.match(urlNormalizada,'^https?://[^/]+/ponte/[%w_-]+/[%w_-]+$') then
  urlBase=urlNormalizada
  chave=type(salvaChave)=='string' and salvaChave or ''
  conectado=true
  local ctx=RunServiceRelay:IsServer() and 'server' or 'client'
  local args=nil
  if StudioTestServiceRelay then pcall(function()args=StudioTestServiceRelay:GetTestArgs()end)end
  iniciarRelay(ctx,true,args)
 end
 return
end
