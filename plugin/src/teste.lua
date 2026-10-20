do
local RunServiceTeste=game:GetService('RunService')
local StudioTestServiceTeste=nil
pcall(function()StudioTestServiceTeste=game:GetService('StudioTestService')end)
local teste={active=false}
local testeContador=0

local TESTE_INICIO_TIMEOUT_MS=30000
local function agoraMsTeste()return DateTime.now().UnixTimestampMillis end
local function simulando()
 local ok,rodando=pcall(function()return RunServiceTeste:IsRunning() or not RunServiceTeste:IsEdit()end)
 return ok and rodando==true
end

local function editorAtivo()
 local ok,v=pcall(function()return StudioTestServiceTeste and StudioTestServiceTeste.EditModeActive end)
 if ok and type(v)=='boolean' then return v end
 return nil
end

local function foraDoEditor()
 if simulando() then return true end
 local ed=editorAtivo()
 if ed~=nil then return not ed end
 if teste.mode=='run' then return false end
 return nil
end
local function encerrarTeste(result,err,motivo)
 if not teste.active then return end
 teste.active=false;teste.endedAt=agoraMsTeste()
 if result~=nil then teste.result=result end
 if err~=nil then teste.error=err end
 teste.endedBy=motivo
 acordarRelay()
end

local function reconciliarTeste(resultSeEncerrou,motivo)
 if not teste.active then return end
 local fora=foraDoEditor()
 if fora==true then teste.sawRunning=true;return end
 if fora==nil then return end
 local decorrido=agoraMsTeste()-(teste.startedAt or 0)
 if teste.sawRunning then
  encerrarTeste(resultSeEncerrou or 'stopped_in_studio',nil,motivo or 'studio')
 elseif decorrido>TESTE_INICIO_TIMEOUT_MS then
  encerrarTeste(nil,'TEST_START_TIMEOUT: o Studio nao saiu do editor em '..math.floor(TESTE_INICIO_TIMEOUT_MS/1000)..'s apos o pedido de '..tostring(teste.mode)..'.','timeout')
 end
end
estadoTeste=function()
 reconciliarTeste()
 local e={active=teste.active==true,mode=teste.mode,testId=teste.testId,startedAt=teste.startedAt,endedAt=teste.endedAt,endedBy=teste.endedBy,agent=teste.agent,players=teste.players,error=teste.error,api=StudioTestServiceTeste and 'StudioTestService' or 'RunService'}
 if teste.result~=nil then e.result=codificar(teste.result)end
 pcall(function()e.runService={isEdit=RunServiceTeste:IsEdit(),isRunMode=RunServiceTeste:IsRunMode(),isRunning=RunServiceTeste:IsRunning()}end)
 local ed=editorAtivo();if ed~=nil then e.editModeActive=ed end
 local okLive,resumoLive=pcall(live.resumo);if okLive and resumoLive~=nil then e.liveSession=resumoLive end
 return e
end
local function falharTeste(code,message)error({code=code,message=message,nothingExecuted=true},0)end
acoes.studio_play=function(a)
 local action=string.lower(tostring(a.action or 'status'))
 if action=='status' then local e=estadoTeste();e.action='status';return e end
 if action=='reset' then

  local anterior=teste.active and {mode=teste.mode,testId=teste.testId,startedAt=teste.startedAt} or nil
  teste={active=false,endedAt=agoraMsTeste(),endedBy='reset'}
  acordarRelay()
  local e=estadoTeste();e.action='reset';e.discarded=anterior;e.stillSimulating=foraDoEditor()==true;return e
 end
 if action=='play' or action=='run' or action=='multiplayer' then

  if live.ativa() then falharTeste('LIVESESSION_ACTIVE','A Sessao Viva (LiveSession) esta rodando neste Studio e o playtest dela ja roda no editor com hot reload. Encerre-a (livesession_control action=stop) antes do Play nativo, ou valide pela propria Sessao Viva (livesession_verify, get_logs).')end
  reconciliarTeste()
  if teste.active then falharTeste('TEST_ALREADY_RUNNING','Ja existe uma sessao iniciada pelo MCP ('..tostring(teste.mode)..', '..tostring(teste.testId)..'). Use action=stop antes de iniciar outra; se o Studio ja esta no editor e o estado ficou preso, use action=reset.')end
  if foraDoEditor()==true then falharTeste('TEST_ALREADY_RUNNING','O Studio ja esta em simulacao (iniciada pelo usuario). Use action=stop ou pare pelo Studio antes de iniciar outra.')end
  if action~='run' and not StudioTestServiceTeste then falharTeste('TEST_API_UNAVAILABLE','Este Studio nao expoe StudioTestService; Play Solo e multiplayer por plugin exigem um Studio recente. Use action=run (RunService:Run, como F8).')end
  local players=math.clamp(math.floor(tonumber(a.players)or 2),1,8)
  testeContador=testeContador+1
  local id='t_'..peer..'_'..tostring(testeContador)
  local agente=contextoAtual and contextoAtual.agent or nil
  teste={active=true,mode=action,testId=id,startedAt=agoraMsTeste(),agent=agente,players=(action=='multiplayer') and players or nil}
  local args={mcp=true,testId=id,peer=peer,agent=agente,mode=action}
  task.spawn(function()
   local ok,res=pcall(function()
    if action=='run' then
     if StudioTestServiceTeste then return StudioTestServiceTeste:ExecuteRunModeAsync(args)end
     RunServiceTeste:Run();task.wait(0.5)
     while RunServiceTeste:IsRunning() or not RunServiceTeste:IsEdit() do task.wait(0.25)end
     return nil
    elseif action=='play' then return StudioTestServiceTeste:ExecutePlayModeAsync(args)
    else return StudioTestServiceTeste:ExecuteMultiplayerTestAsync(players,args)end
   end)

   if teste.testId==id and teste.active then
    if ok then encerrarTeste(res,nil,'api')else encerrarTeste(nil,tostring(type(res)=='table' and res.message or res),'api')end
   end
  end)

  for _=1,5 do task.wait();if not teste.active then break end end
  if not teste.active and teste.error then local msg=teste.error;teste={active=false};error({code='TEST_START_FAILED',message=msg,nothingExecuted=true},0)end
  acordarRelay()
  local e=estadoTeste();e.action=action;return e
 end
 if action=='stop' then
  local tentativas={}
  if StudioTestServiceTeste and not RunServiceTeste:IsEdit() then

   local ok,e=pcall(function()StudioTestServiceTeste:EndTest('mcp_stop')end)
   table.insert(tentativas,{api='StudioTestService.EndTest',ok=ok,error=(not ok) and tostring(e) or nil})
  end
  local ok,e=pcall(function()RunServiceTeste:Stop()end)
  table.insert(tentativas,{api='RunService.Stop',ok=ok,error=(not ok) and tostring(e) or nil})
  for _=1,10 do task.wait(0.1);reconciliarTeste('mcp_stop','stop');if not teste.active and foraDoEditor()~=true then break end end

  if teste.active and foraDoEditor()~=true then encerrarTeste('mcp_stop',nil,'stop')end
  acordarRelay()
  local st=estadoTeste();st.action='stop';st.attempts=tentativas;st.stillSimulating=foraDoEditor()==true;return st
 end
 if action=='pause' or action=='resume' then
  if not simulando() then falharTeste('TEST_NOT_RUNNING','Nenhuma simulacao neste DataModel. Em Play Solo o pause/resume e enviado ao servidor da sessao pelo Worker; em Run mode a simulacao precisa estar ativa.')end
  if action=='pause' then RunServiceTeste:Pause() else RunServiceTeste:Run() end
  task.wait()
  local st=estadoTeste();st.action=action;return st
 end
 falharTeste('INVALID_ACTION','action deve ser play, run, multiplayer, stop, pause, resume, status ou reset.')
end
end
