local realPrint=print
local time,queue,events,seq=0,{},{},0
local running=false
local function resumeThread(t,args)
 if coroutine.status(t)=='dead' then return end
 local result=table.pack(coroutine.resume(t,table.unpack(args or {},1,(args and args.n) or 0)))
 if not result[1] then error('scheduler: '..tostring(result[2]),0) end
 if coroutine.status(t)~='dead' then
  table.insert(queue,{thread=t,at=time+math.max(0.001,tonumber(result[2]) or 0.001),args=table.pack(tonumber(result[2]) or 0.001)})
 end
end
local taskMock={}
function taskMock.spawn(fn,...)
 local t=type(fn)=='thread' and fn or coroutine.create(fn);resumeThread(t,table.pack(...));return t
end
function taskMock.defer(fn,...)
 local t=type(fn)=='thread' and fn or coroutine.create(fn);table.insert(queue,{thread=t,at=time+0.001,args=table.pack(...)});return t
end
function taskMock.delay(seconds,fn,...)
 local t=type(fn)=='thread' and fn or coroutine.create(fn);table.insert(queue,{thread=t,at=time+seconds,args=table.pack(...)});return t
end
function taskMock.wait(seconds)return coroutine.yield(seconds or 0.02)end
function taskMock.cancel(t) if coroutine.status(t)~='dead' then assert(coroutine.close(t))end end
local function drive(fn)
 local done,result=false,nil
 taskMock.spawn(function()result=table.pack(pcall(fn));done=true end)
 local ticks=0
 while not done do
  assert(#queue>0,'scheduler sem tarefas; possivel deadlock')
  table.sort(queue,function(a,b)return a.at<b.at end)
  local event=table.remove(queue,1);time=event.at;resumeThread(event.thread,event.args)
  ticks=ticks+1;assert(ticks<100000,'scheduler excedeu o limite')
 end
 if not result[1] then error(result[2],0)end
 return table.unpack(result,2,result.n)
end
local function signal()
 local s={listeners={}}
 function s:Connect(fn)
  local conn={Connected=true}
  self.listeners[conn]=fn
  function conn:Disconnect()self.Connected=false;s.listeners[self]=nil end
  return conn
 end
 function s:fire(...)
  for conn,fn in pairs(self.listeners)do if conn.Connected then fn(...)end end
 end
 function s:count()local n=0;for _ in pairs(self.listeners)do n=n+1 end;return n end
 return s
end
local methods={}
local instanceMeta={}

local descendantAdded,descendantRemoving=signal(),signal()
local function emGame(obj)while obj do if obj.ClassName=='DataModel' then return true end;obj=obj.Parent end;return false end
local function avisarArvore(sig,obj)sig:fire(obj);for _,d in ipairs(obj:GetDescendants())do sig:fire(d)end end
function instanceMeta.__index(obj,key)
 if methods[key]then return methods[key]end
 if key=='Parent'then return obj._parent end
 if key=='Name'then return obj._name end
 if key=='ClassName'then return obj._class end
 if key=='Source'then return obj._source end
 for _,child in ipairs(obj._children)do if child.Name==key then return child end end
 return obj._props[key]
end
function instanceMeta.__newindex(obj,key,value)
 if key:sub(1,1)=='_'then rawset(obj,key,value);return end
 if key=='Parent'then
  if obj._parent and emGame(obj._parent) then avisarArvore(descendantRemoving,obj)end
  if obj._parent then for i,v in ipairs(obj._parent._children)do if v==obj then table.remove(obj._parent._children,i);break end end end
  rawset(obj,'_parent',value);if value then table.insert(value._children,obj)end
  if value and emGame(value) then avisarArvore(descendantAdded,obj)end
 elseif key=='Name'then rawset(obj,'_name',value)
 elseif key=='Source'then rawset(obj,'_source',value);rawset(obj,'_buffer',value)
 else obj._props[key]=value end
end
local instances={}
local function instance(class,name,parent)
 local x=setmetatable({_class=class,_name=name or class,_source='',_buffer='',_children={},_props={Archivable=true},_attrs={}},instanceMeta)
 table.insert(instances,x);if parent then x.Parent=parent end;return x
end
function methods:IsA(class)
 return self.ClassName==class or class=='Instance' or (class=='LuaSourceContainer' and (self.ClassName=='Script' or self.ClassName=='LocalScript' or self.ClassName=='ModuleScript')) or (class=='BasePart' and self.ClassName=='Part')
end
function methods:IsDescendantOf(parent)local p=self.Parent;while p do if p==parent then return true end;p=p.Parent end;return false end
function methods:GetChildren()local r={};for _,v in ipairs(self._children)do table.insert(r,v)end;return r end
function methods:GetDescendants()local r={};local function walk(v)for _,child in ipairs(v:GetChildren())do table.insert(r,child);walk(child)end end;walk(self);return r end
function methods:GetFullName()if self.Parent and self.Parent.ClassName~='DataModel'then return self.Parent:GetFullName()..'.'..self.Name end;return self.Name end
function methods:FindFirstChild(name)for _,v in ipairs(self._children)do if v.Name==name then return v end end end
function methods:Destroy()for _,v in ipairs(self:GetChildren())do v:Destroy()end;self.Parent=nil;self._destroyed=true end
function methods:Clone()
 local x=instance(self.ClassName,self.Name);x.Source=self.Source
 for k,v in pairs(self._props)do x[k]=v end
 for _,child in ipairs(self:GetChildren())do child:Clone().Parent=x end
 return x
end
function methods:GetAttributes()return self._attrs end
function methods:SetAttribute(key,value)self._attrs[key]=value end
function methods:GetAttribute(key)return self._attrs[key]end
local gameMock=instance('DataModel','TestPlace');gameMock.PlaceId=123
gameMock.DescendantAdded=descendantAdded;gameMock.DescendantRemoving=descendantRemoving
local services={}
local function service(name)local v=services[name];if not v then v=instance(name,name,gameMock);services[name]=v end;return v end
function methods:GetService(name)assert(self==gameMock);return service(name)end
local workspaceMock=service('Workspace');local sss=service('ServerScriptService')
local folder=instance('Folder','Folder',sss);local A=instance('ModuleScript','A',folder);A.Source='return 1'
local B=instance('ModuleScript','B',folder);B.Source='return 2'
local http=service('HttpService')
http.GenerateGUID=function()return '01234567-abcd-0000-0000-000000000000'end
http.JSONEncode=function(_,body)return body end;http.JSONDecode=function(_,body)return body end
http.RequestAsync=function(_,req)
 local body=req.Body
 if req.Url:match('/iniciar$')then
  local function ticket(id)
   local ev=events[id]
   return {ok=ev and not ev.ticketDenied,agent=ev and ev.agent,prazoMs=ev and math.max(0,(ev.deadline-time)*1000) or 0}
  end
  if body.reqIds then
   INICIAR_LOTES=(INICIAR_LOTES or 0)+1
   local tickets={};for _,id in ipairs(body.reqIds)do tickets[id]=ticket(id)end
   return {Success=true,Body={ok=true,tickets=tickets}}
  end
  return {Success=true,Body=ticket(body.reqId)}
 end
 if req.Url:match('/relay$')then
  table.insert(RELAY_POSTS,body)
  local comandos=RELAY_COMANDOS or {};RELAY_COMANDOS=nil
  return {Success=true,Body={ok=true,ctx=body.ctx,comandos=comandos}}
 end
 return {Success=true,Body={ok=true,events={},cancels={},controle={readGraceSeconds=8},esperaMs=1000}}
end
local editor=service('ScriptEditorService')
editor.GetEditorSource=function(_,scr)return scr._buffer end
local casEdit=nil
editor.UpdateSourceAsync=function(_,scr,callback)
 if casEdit then local f=casEdit;casEdit=nil;f(scr);taskMock.wait(0.01)end
 local result=callback(scr._buffer);if result~=nil then scr.Source=result end
end
local history=service('ChangeHistoryService');local recording=nil;local historyEnded={}
history.TryBeginRecording=function()assert(not recording,'historicos sobrepostos');seq=seq+1;recording='rec_'..seq;return recording end
history.FinishRecording=function(_,rec,op)assert(recording==rec,'gravacao desconhecida');historyEnded[#historyEnded+1]=op;recording=nil end
history.Undo=function()end;history.Redo=function()end
local logService=service('LogService');logService.MessageOut=signal();logService.GetLogHistory=function()return {}end
local selection=service('Selection');local selected={};selection.Get=function()return selected end;selection.Set=function(_,v)selected=v end
service('CollectionService').GetTags=function()return {}end
service('InsertService').LoadAsset=function()local pack=instance('Model','Package');instance('Part','Asset',pack);return pack end

local sim={running=false,edit=true,runMode=false,ended=nil,sessao=0,lastArgs=nil,travarApi=false}
local runService=service('RunService')
runService.IsEdit=function()return sim.edit end;runService.IsRunning=function()return sim.running end;runService.IsRunMode=function()return sim.runMode end
runService.IsServer=function()return false end;runService.IsClient=function()return false end
runService.Pause=function()sim.running=false end
local studioTest=service('StudioTestService')
studioTest.EditModeActive=true
runService.Run=function()sim.running=true;sim.edit=false;sim.runMode=true;studioTest.EditModeActive=false end
local function encerrarSim(valor)
 sim.running=false;sim.edit=true;sim.runMode=false;sim.ended=valor;sim.sessao=sim.sessao+1;studioTest.EditModeActive=true
end
runService.Stop=function()if not sim.edit then encerrarSim('stopped')end end
studioTest.ExecuteRunModeAsync=function(_,args)
 sim.lastArgs=args;runService:Run();local token=sim.sessao
 while sim.sessao==token or sim.travarApi do taskMock.wait(0.05)end
 return sim.ended
end
studioTest.ExecutePlayModeAsync=studioTest.ExecuteRunModeAsync
studioTest.EndTest=function(_,valor)encerrarSim(valor)end
studioTest.GetTestArgs=function()return sim.lastArgs end
studioTest.CanLeaveTest=function()return false end

RELAY_POSTS={}
local enumMock={FinishRecordingOperation={Commit='Commit',Cancel='Cancel'},MessageType={MessageOutput='output',MessageInfo='info',MessageWarning='warning',MessageError='error'}}
local function typeofMock(x)if getmetatable(x)==instanceMeta then return 'Instance'end;return type(x)end

local cpuPorChamada,cpu=0,0
local osMock=setmetatable({clock=function()cpu=cpu+cpuPorChamada;return time+cpu end},{__index=os})
local function simularCpu(segundosPorChamada)cpuPorChamada=segundosPorChamada or 0;if cpuPorChamada==0 then cpu=0 end end
local stringMock=setmetatable({split=function(text,separator)
 local result={};local start=1
 while true do local at=text:find(separator,start,true);if not at then table.insert(result,text:sub(start));break end;table.insert(result,text:sub(start,at-1));start=at+#separator end
 return result
end},{__index=string})
local mathMock=setmetatable({clamp=function(n,a,b)return math.max(a,math.min(b,n))end},{__index=math})
local env=setmetatable({game=gameMock,workspace=workspaceMock,task=taskMock,typeof=typeofMock,os=osMock,DateTime={now=function()return {UnixTimestampMillis=time*1000}end},string=stringMock,math=mathMock,Enum=enumMock,Instance={new=function(class)return instance(class)end},version=function()return 'simulated'end,plugin={SetSetting=function()end,GetSetting=function()return nil end}},{__index=_G})
env.getfenv=function()return env end

NATIVE_REQUIRE=function(x)return 'nativo'end
env.require=function(x)return NATIVE_REQUIRE(x)end
env.setfenv=function(fn,newEnv)
 for i=1,50 do local name=debug.getupvalue(fn,i);if not name then break end;if name=='_ENV'then debug.setupvalue(fn,i,newEnv);break end end
 return fn
end

env.loadstring=function(code,name)
 if LOADSTRING_HOOK then local fn,err=LOADSTRING_HOOK(code,name);if fn~=nil or err~=nil then return fn,err end end
 return load(code,name,'t',env)
end
env.print=function(...)local out={};for i=1,select('#',...)do out[i]=tostring(select(i,...))end;logService.MessageOut:fire(table.concat(out,'\t'),'Enum.MessageType.MessageOutput')end
env.warn=function(...)env.print(...)end
local file=assert(io.open('plugin/MCPStudioNotion.server.lua'));local source=file:read('*a');file:close()
source=assert(source:match('^(.-)%-%- ============================================================\n%-%- interface'))
source=source..[[
conectado=true;geracao=1;urlBase='https://worker.test/ponte/session1/token123'
return {execute=executarProtegido,prepare=prepararControle,control=controle,id=idDe,resolve=resolver,normalize=normalizar,actions=acoes,receive=receber,newControl=novoControle,cache=function()return cacheEventos end,running=function()return emExecucao end,pendingCleanups=limpezasPendentes,startRelay=function(...)return iniciarRelay(...)end,stopRelay=function()return pararRelay()end,testState=function()return estadoTeste()end,sweep=varrerOrfaos,executions=function()return execucoes end,buffer=function()return bufferRespostas end,frame=quadro}
]]
local pluginMock=assert(load(source,'=plugin-test','t',env))()
local function call(name,args,agent,opts)
 seq=seq+1;local ev={reqId='req_'..seq,tool=name,args=args or {},agent=agent or 'agent-A',generation=1,deadline=time+20,controle={readGraceSeconds=8}}
 for k,v in pairs(opts or {})do ev[k]=v end;events[ev.reqId]=ev
 return drive(function()return pluginMock.execute(ev)end),ev
end
local function denied(code,fn)
 local ok,e=pcall(fn);assert(not ok,'era para recusar');assert(type(e)=='table' and e.code==code,'codigo inesperado: '..tostring(type(e)=='table' and e.code or e));return e
end
local passed=0
local function test(name,fn)

 for k in pairs(pluginMock.control.locks)do pluginMock.control.locks[k]=nil end
 for k in pairs(pluginMock.control.agents)do pluginMock.control.agents[k]=nil end
 local ok,e=pcall(fn)
 if not ok then error(name..': '..tostring(type(e)=='table' and e.message or e),0)end
 assert(recording==nil,'historico nao encerrado')
 passed=passed+1;realPrint('  OK plugin: '..name)
end
test('bundle publica 34 ferramentas remotas (21 originais + studio_play + grep_scripts + outline_script + 4 ImportMCP + inspect_model + export_file + 4 Sessao Viva)',function()
 local n=0;for _ in pairs(pluginMock.actions)do n=n+1 end;assert(n==34,'esperava 34, ha '..n);assert(pluginMock.actions.livesession_status and pluginMock.actions.livesession_control and pluginMock.actions.livesession_verify and pluginMock.actions.livesession_journal);assert(pluginMock.actions.run_luau and pluginMock.actions.studio_play and pluginMock.actions.grep_scripts and pluginMock.actions.outline_script and pluginMock.actions.inspect_model and pluginMock.actions.import_asset and pluginMock.actions.export_file)
end)

test('export_file: sem target exige assetId; script sobe inteiro em um POST /arquivo binario e volta com url, content e revision',function()
 denied('TARGET_REQUIRED',function()call('export_file',{},'A')end)
 local r=call('export_file',{assetId=123},'A');assert(r.kind=='asset' and r.assets[1].assetId==123 and r.assets[1].uri=='rbxassetid://123')
 local posts={};local original=http.RequestAsync
 http.RequestAsync=function(self,req)
  if req.Url:match('/arquivo%?')then
   table.insert(posts,req)
   if req.Url:match('&fim=1')then return {Success=true,Body={ok=true,id='b_1',url='https://w/mcp/s/t/blob/b_1/'..(req.Url:match('nome=([^&]+)') or '?'),expiresInSeconds=1800}}end
   return {Success=true,Body={ok=true,uploadId='u_1'}}
  end
  return original(self,req)
 end
 local ok,e=pcall(function()
  local r2=call('export_file',{target=pluginMock.id(A),kind='script'},'A')
  assert(r2.kind=='script' and r2.fileName=='A.lua','fileName: '..tostring(r2.fileName));assert(r2.content=='return 1');assert(r2.url=='https://w/mcp/s/t/blob/b_1/A.lua',tostring(r2.url));assert(r2.bytes==8 and r2.lines==1);assert(r2.revision~=nil and r2.blobId=='b_1' and r2.expiresInSeconds==1800)
  assert(#posts==1,'esperava 1 POST, houve '..#posts);assert(posts[1].Headers['Content-Type']=='application/octet-stream' and posts[1].Body=='return 1',tostring(posts[1].Body))
  assert(posts[1].Url:match('nome=A%.lua') and posts[1].Url:match('len=8') and posts[1].Url:match('parte=1') and posts[1].Url:match('fim=1') and posts[1].Url:match('peer=') and not posts[1].Url:match('b64='),posts[1].Url)

  local r3=call('export_file',{target=pluginMock.id(A),inline=false},'A');assert(r3.kind=='script' and r3.content==nil)
  denied('NOT_SCRIPT',function()call('export_file',{target=pluginMock.id(folder),kind='script'},'A')end)
  denied('NO_ASSETS',function()call('export_file',{target=pluginMock.id(folder),kind='asset'},'A')end)
  denied('INVALID_KIND',function()call('export_file',{target=pluginMock.id(A),kind='zip'},'A')end)
  denied('PROTECTED_ROOT',function()call('export_file',{target='game'},'A')end)
 end)
 http.RequestAsync=original
 if not ok then error(e,0)end
end)
test('export_file kind=rbxm usa SerializationService:SerializeInstancesAsync (subarvore inteira; servico exporta os filhos) e nunca devolve content inline',function()
 local chamadas={};service('SerializationService').SerializeInstancesAsync=function(_,lista)table.insert(chamadas,lista);return '<roblox!fake'..#lista end
 local original=http.RequestAsync
 http.RequestAsync=function(self,req)
  if req.Url:match('/arquivo%?')then return {Success=true,Body={ok=true,id='b_2',url='https://w/mcp/s/t/blob/b_2/x.rbxm',expiresInSeconds=1800}}end
  return original(self,req)
 end
 local ok,e=pcall(function()
  local r=call('export_file',{target=pluginMock.id(folder)},'A')
  assert(r.kind=='rbxm' and r.fileName=='Folder.rbxm',tostring(r.fileName));assert(#chamadas==1 and #chamadas[1]==1 and chamadas[1][1]==folder,'serializa a propria pasta');assert(r.instances==1+#folder:GetDescendants());assert(r.content==nil and r.bytes==#('<roblox!fake1'))
  local r2=call('export_file',{target='game.ServerScriptService',kind='rbxm'},'A')
  assert(#chamadas==2 and #chamadas[2]==#sss:GetChildren() and r2.notes[1]:match('servico'),'servico exporta os filhos')

  local tentativas={}
  http.RequestAsync=function(self,req)
   if req.Url:match('/arquivo%?')then
    table.insert(tentativas,req)
    if not req.Url:match('b64=1')then return {Success=false,StatusCode=400,Body='{"ok":false,"erro":{"code":"BYTES_MISMATCH"}}'}end
    return {Success=true,Body={ok=true,id='b_3',url='https://w/mcp/s/t/blob/b_3/Folder.rbxm',expiresInSeconds=1800}}
   end
   return original(self,req)
  end
  local r3=call('export_file',{target=pluginMock.id(folder),kind='rbxm'},'A')
  assert(#tentativas==2 and tentativas[2].Url:match('b64=1') and tentativas[2].Body=='PHJvYmxveCFmYWtlMQ==',tostring(tentativas[2] and tentativas[2].Body));assert(r3.blobId=='b_3')
 end)
 http.RequestAsync=original;service('SerializationService').SerializeInstancesAsync=nil
 if not ok then error(e,0)end
end)

local Mod=instance('ModuleScript','Mod',folder);Mod.Source='return {versao=1}'
local Dep=instance('ModuleScript','Dep',folder);Dep.Source='return 10'
local Usa=instance('ModuleScript','Usa',folder);Usa.Source='local dep=require(script.Parent.Dep) return {total=dep+1}'
test('require fresco recompila o modulo a partir do editor a cada chamada (sem cache antigo)',function()
 local r1=call('run_luau',{code='return require(game.ServerScriptService.Folder.Mod).versao'},'A');assert(r1.returned[1]==1);assert(r1.freshRequire==true);assert(r1.freshModules[1]=='game.ServerScriptService.Folder.Mod',tostring(r1.freshModules[1]))
 call('get_script',{target=pluginMock.id(Mod)},'A');call('set_script',{target=pluginMock.id(Mod),source='return {versao=2}'},'A')
 local r2=call('run_luau',{code='return require(game.ServerScriptService.Folder.Mod).versao'},'A');assert(r2.returned[1]==2,'require devolveu versao antiga: '..tostring(r2.returned[1]))

 Mod._buffer='return {versao=3}'
 local r3=call('run_luau',{code='return require(game.ServerScriptService.Folder.Mod).versao'},'A');assert(r3.returned[1]==3);Mod.Source='return {versao=3}'
end)
test('require fresco segue modulos aninhados, memoiza dentro da chamada e detecta ciclo',function()
 local r=call('run_luau',{code='local a=require(game.ServerScriptService.Folder.Usa); local b=require(game.ServerScriptService.Folder.Usa); return a.total, a==b'},'A')
 assert(r.returned[1]==11 and r.returned[2]==true);assert(#r.freshModules==2)
 Dep.Source='return 20';local r2=call('run_luau',{code='return require(game.ServerScriptService.Folder.Usa).total'},'A');assert(r2.returned[1]==21,'modulo aninhado veio do cache: '..tostring(r2.returned[1]))
 local Ciclo=instance('ModuleScript','Ciclo',folder);Ciclo.Source='return require(script)'
 local ok,e=pcall(function()call('run_luau',{code='return require(game.ServerScriptService.Folder.Ciclo)'},'A')end);assert(not ok and string.find(tostring(e.message),'ciclico',1,true),tostring(e.message))
 local Nada=instance('ModuleScript','Nada',folder);Nada.Source='local x=1'
 ok,e=pcall(function()call('run_luau',{code='return require(game.ServerScriptService.Folder.Nada)'},'A')end);assert(not ok and string.find(tostring(e.message),'exatamente um valor',1,true))
end)
test('freshRequire=false e MCP.require(m,{fresh=false}) usam o require nativo',function()
 local r=call('run_luau',{code='return require(game.ServerScriptService.Folder.Mod)',freshRequire=false},'A');assert(r.returned[1]=='nativo' and r.freshRequire==false)
 local r2=call('run_luau',{code='return MCP.require(game.ServerScriptService.Folder.Mod,{fresh=false}), MCP.require(game.ServerScriptService.Folder.Mod).versao'},'A');assert(r2.returned[1]=='nativo' and r2.returned[2]==3)

 local r3=call('run_luau',{code='return require(123456)'},'A');assert(r3.returned[1]=='nativo' and #r3.freshModules==0)
end)
test('erro de sintaxe dentro do modulo aponta o caminho do modulo',function()
 local Ruim=instance('ModuleScript','Ruim',folder);Ruim.Source='return {'
 local ok,e=pcall(function()call('run_luau',{code='return require(game.ServerScriptService.Folder.Ruim)'},'A')end)
 assert(not ok and string.find(tostring(e.message),'game.ServerScriptService.Folder.Ruim',1,true),tostring(e.message))
end)

test('studio_play status/run/stop no editor via StudioTestService',function()
 local st=call('studio_play',{action='status'},'A');assert(st.active==false and st.api=='StudioTestService')
 local r=call('studio_play',{action='run'},'A');assert(r.active==true and r.mode=='run' and r.testId and r.agent=='A',tostring(r.testId))
 assert(sim.running and sim.lastArgs.testId==r.testId and sim.lastArgs.mcp==true)
 denied('TEST_ALREADY_RUNNING',function()call('studio_play',{action='play'},'A')end)
 local p=call('studio_play',{action='pause'},'A');assert(sim.running==false and p.action=='pause')
 call('studio_play',{action='resume'},'A');assert(sim.running==true)
 local s=call('studio_play',{action='stop'},'A');assert(s.active==false,'stop nao encerrou');assert(s.result=='mcp_stop' or s.result=='stopped',tostring(s.result));assert(s.stillSimulating==false)
 local st2=pluginMock.testState();assert(st2.active==false and st2.endedAt)
end)
test('studio_play recusa pause sem simulacao e valida action',function()
 denied('TEST_NOT_RUNNING',function()call('studio_play',{action='pause'},'A')end)
 denied('INVALID_ACTION',function()call('studio_play',{action='voar'},'A')end)
end)

test('studio_play: Stop pelo Studio (API sem retorno) e detectado e outro agente consegue iniciar de novo',function()
 sim.travarApi=true
 local r=call('studio_play',{action='run'},'A');assert(r.active==true and sim.running)

 local st=call('studio_play',{action='status'},'A');assert(st.active==true and st.editModeActive==false)

 encerrarSim('stopped')
 drive(function()taskMock.wait(0.5)end)
 local depois=call('studio_play',{action='status'},'B')
 assert(depois.active==false,'sessao ficou morta apos Stop pelo Studio');assert(depois.endedBy=='studio',tostring(depois.endedBy));assert(depois.result=='stopped_in_studio',tostring(depois.result));assert(depois.testId==r.testId)

 local relayState=pluginMock.testState();assert(relayState.active==false and relayState.endedAt)

 local r2=call('studio_play',{action='run'},'B');assert(r2.active==true and r2.testId~=r.testId and r2.agent=='B')

 sim.travarApi=false;drive(function()taskMock.wait(0.2)end)
 local st2=call('studio_play',{action='status'},'B');assert(st2.active==true and st2.testId==r2.testId,'retorno tardio da API mexeu na sessao nova')
 local s=call('studio_play',{action='stop'},'B');assert(s.active==false and s.stillSimulating==false)
end)
test('studio_play stop com API travada encerra a sessao do lado do MCP em vez de deixar fantasma',function()
 sim.travarApi=true
 local r=call('studio_play',{action='run'},'A');assert(r.active==true)
 local s=call('studio_play',{action='stop'},'A')
 assert(s.active==false,'stop deixou sessao ativa');assert(s.stillSimulating==false);assert(s.result=='mcp_stop',tostring(s.result));assert(sim.edit==true)
 sim.travarApi=false;drive(function()taskMock.wait(0.2)end)
 assert(pluginMock.testState().active==false)
end)
test('studio_play reset descarta estado preso sem tocar no Studio',function()
 local r=call('studio_play',{action='run'},'A');assert(r.active==true)
 local z=call('studio_play',{action='reset'},'B')
 assert(z.active==false and z.action=='reset');assert(z.discarded and z.discarded.testId==r.testId,'discarded ausente');assert(z.stillSimulating==true,'reset nao deve parar o Studio')

 local e=denied('TEST_ALREADY_RUNNING',function()call('studio_play',{action='run'},'B')end);assert(string.find(e.message,'usuario',1,true),e.message)
 encerrarSim('stopped');drive(function()taskMock.wait(0.2)end)
 assert(pluginMock.testState().active==false)
 local r2=call('studio_play',{action='run'},'B');assert(r2.active==true)
 call('studio_play',{action='stop'},'B');assert(pluginMock.testState().active==false)
end)

test('relay do editor retransmite logs com nivel, faz backfill e recebe comandos luau',function()
 RELAY_POSTS={}
 logService.GetLogHistory=function()return {{message='antigo',messageType='output',timestamp=time}}end
 pluginMock.startRelay('edit',true)
 drive(function()taskMock.wait(1)end)
 local primeiro=RELAY_POSTS[1];assert(primeiro,'relay nao postou');assert(primeiro.ctx=='edit' and primeiro.relayId and primeiro.teste,'corpo incompleto')
 local achou=false;for _,p in ipairs(RELAY_POSTS)do for _,l in ipairs(p.logs or {})do if l.message=='antigo' then achou=true end end end;assert(achou,'backfill nao enviado')
 RELAY_POSTS={}
 env.print('durante teste');env.warn('cuidado')
 drive(function()taskMock.wait(1)end)
 local niveis={}
 for _,p in ipairs(RELAY_POSTS)do for _,l in ipairs(p.logs or {})do niveis[l.message]=l.level end end
 assert(niveis['durante teste']=='output',tostring(niveis['durante teste']));assert(niveis['cuidado']=='output')

 RELAY_POSTS={};RELAY_COMANDOS={{id='cmd1',tipo='luau',code='return 40+2',timeoutMs=1000,agent='A'},{id='cmd2',tipo='ping'}}
 drive(function()taskMock.wait(8)end)
 local resultados={}
 for _,p in ipairs(RELAY_POSTS)do for _,r in ipairs(p.resultados or {})do resultados[r.id]=r end end
 assert(resultados.cmd1 and resultados.cmd1.ok and resultados.cmd1.resultado.returned[1]==42 and resultados.cmd1.resultado.context=='edit','comando luau nao executado')
 assert(resultados.cmd1.resultado.freshRequire==false,'relay deve usar require nativo por padrao')
 assert(resultados.cmd2 and resultados.cmd2.resultado.isEdit==true)
 pluginMock.stopRelay()
 logService.GetLogHistory=function()return {}end
 assert(logService.MessageOut:count()==0,'relay deixou conexao de log viva')
end)

test('relay reconcilia GetLogHistory: linhas que o MessageOut nao entregou chegam, as entregues nao duplicam e o comando backfill reenvia o fim do historico',function()
 RELAY_POSTS={}
 local historico={}
 logService.GetLogHistory=function()local c={};for i,l in ipairs(historico)do c[i]=l end;return c end
 pluginMock.startRelay('edit',false)
 drive(function()taskMock.wait(1.5)end)
 RELAY_POSTS={}

 table.insert(historico,{message='so no historico',messageType='output',timestamp=time})
 table.insert(historico,{message='erro do motor',messageType='error',timestamp=time})
 drive(function()taskMock.wait(2.5)end)
 local vistos={}
 for _,p in ipairs(RELAY_POSTS)do for _,l in ipairs(p.logs or {})do vistos[l.message]=(vistos[l.message] or 0)+1;vistos[l.message..'#level']=l.level end end
 assert(vistos['so no historico']==1,'linha do historico nao chegou: '..tostring(vistos['so no historico']));assert(vistos['erro do motor#level']=='error',tostring(vistos['erro do motor#level']))

 RELAY_POSTS={}
 env.print('via evento');table.insert(historico,{message='via evento',messageType='output',timestamp=time})
 drive(function()taskMock.wait(2.5)end)
 vistos={}
 for _,p in ipairs(RELAY_POSTS)do for _,l in ipairs(p.logs or {})do vistos[l.message]=(vistos[l.message] or 0)+1 end end
 assert(vistos['via evento']==1,'linha duplicada ou ausente: '..tostring(vistos['via evento']))

 RELAY_POSTS={};RELAY_COMANDOS={{id='bf1',tipo='backfill',limite=2}}
 drive(function()taskMock.wait(8)end)
 local resultado,reenviadas,flag=nil,{},nil
 for _,p in ipairs(RELAY_POSTS)do
  if p.backfill then flag=p.backfill end
  for _,r in ipairs(p.resultados or {})do if r.id=='bf1' then resultado=r end end
  for _,l in ipairs(p.logs or {})do table.insert(reenviadas,l.message)end
 end
 assert(resultado and resultado.ok and resultado.resultado.backfill==true and resultado.resultado.lines==2,'backfill nao respondeu: '..tostring(resultado and resultado.resultado and resultado.resultado.lines))
 assert(#reenviadas==2 and reenviadas[1]=='erro do motor' and reenviadas[2]=='via evento',table.concat(reenviadas,','))
 assert(flag==2,'corpo deveria marcar backfill=2: '..tostring(flag))

 RELAY_POSTS={}
 pluginMock.receive({boot='boot-A',events={},cancels={}},1);pluginMock.receive({boot='boot-B',events={},cancels={}},1)
 drive(function()taskMock.wait(3)end)
 local apos={}
 for _,p in ipairs(RELAY_POSTS)do for _,l in ipairs(p.logs or {})do table.insert(apos,l.message)end end
 assert(#apos==3 and apos[1]=='so no historico' and apos[3]=='via evento','troca de boot deveria reenviar o historico: '..table.concat(apos,','))
 pluginMock.stopRelay()
 logService.GetLogHistory=function()return {}end
 assert(logService.MessageOut:count()==0,'relay deixou conexao de log viva')
end)
test('relay: lote recusado com 4xx volta dividido, a linha culpada e descartada sozinha e as demais chegam uma vez',function()
 RELAY_POSTS={}
 local historico={}
 logService.GetLogHistory=function()local c={};for i,l in ipairs(historico)do c[i]=l end;return c end
 pluginMock.startRelay('edit',false)
 drive(function()taskMock.wait(1.5)end)
 RELAY_POSTS={}
 local original,recusas=http.RequestAsync,0
 http.RequestAsync=function(self,req)
  if req.Url:match('/relay$')then
   for _,l in ipairs(req.Body.logs or {})do
    if l.message=='veneno'then recusas=recusas+1;return {Success=false,StatusCode=413,Body='corpo grande demais'}end
   end
  end
  return original(self,req)
 end
 table.insert(historico,{message='antes',messageType='output',timestamp=time})
 table.insert(historico,{message='veneno',messageType='output',timestamp=time})
 table.insert(historico,{message='depois',messageType='output',timestamp=time})
 local ok,e=pcall(drive,function()taskMock.wait(15)end)
 http.RequestAsync=original
 pluginMock.stopRelay()
 logService.GetLogHistory=function()return {}end
 if not ok then error(e,0)end
 local vistos,descartados={},0
 for _,p in ipairs(RELAY_POSTS)do
  descartados=descartados+(tonumber(p.descartados)or 0)
  for _,l in ipairs(p.logs or {})do vistos[l.message]=(vistos[l.message]or 0)+1 end
 end
 assert(vistos.antes==1 and vistos.depois==1,'linhas boas deveriam chegar uma vez: antes='..tostring(vistos.antes)..' depois='..tostring(vistos.depois))
 assert(vistos.veneno==nil,'linha recusada nao pode constar como aceita')
 assert(recusas>=2,'o lote deveria ser recusado e depois dividido ate isolar a linha: '..recusas)
 assert(descartados>=1,'o Worker deveria ser avisado do descarte')
end)
test('get_script retorna source e revision com trava automatica',function()
 local r=call('get_script',{target='game.ServerScriptService.Folder.A'});assert(r.source=='return 1' and r.revision);assert(pluginMock.control:summary().locks==1)
end)
test('id/caminhos aliases convergem na mesma instancia',function()
 local id=pluginMock.id(A);assert(pluginMock.resolve(id)==A and pluginMock.resolve('ServerScriptService/Folder/A')==A)
 call('get_script',{target=id},'A');denied('LOCK_CONFLICT',function()call('set_script',{target='game.ServerScriptService.Folder.A',source='bad'},'B')end)
end)
test('leitores diferentes convivem e script independente e editavel',function()
 call('get_script',{target=pluginMock.id(A)},'A');call('get_script',{target=pluginMock.id(A)},'B')
 call('get_script',{target=pluginMock.id(B)},'B');call('set_script',{target=pluginMock.id(B),source='return 3'},'B');assert(B.Source=='return 3')
end)
test('Source direto exige leitura previa',function()
 denied('READ_REQUIRED',function()call('set_properties',{target=pluginMock.id(A),properties={Source='bad'}},'A')end)
end)
test('set_properties.Source nao burla leitor alheio',function()
 call('get_script',{target=pluginMock.id(A)},'A');denied('LOCK_CONFLICT',function()call('set_properties',{target=pluginMock.id(A),properties={Source='bad'}},'B')end)
end)
test('delete/move/rename ancestral nao burlam script protegido',function()
 call('get_script',{target=pluginMock.id(A)},'A')
 for _,spec in ipairs({{'delete_instance',{targets={pluginMock.id(folder)}}},{'move_instance',{target=pluginMock.id(folder),parent=pluginMock.id(workspaceMock)}},{'set_properties',{target=pluginMock.id(folder),properties={Name='Bad'}}},{'set_properties',{target=pluginMock.id(folder),properties={Parent=pluginMock.id(workspaceMock)}}}})do
  denied('LOCK_CONFLICT',function()call(spec[1],spec[2],'B')end)
 end
 assert(folder.Name=='Folder' and folder.Parent==sss and A.Parent==folder)
end)
test('multipla exclusao falha antes de apagar primeiro alvo',function()
 local free=instance('Part','Free',workspaceMock);call('get_script',{target=pluginMock.id(A)},'A')
 denied('LOCK_CONFLICT',function()call('delete_instance',{targets={pluginMock.id(free),pluginMock.id(A)}},'B')end);assert(free.Parent==workspaceMock)
end)
test('nao pode adquirir metade de reserva multipla',function()
 call('file_lock',{targets={pluginMock.id(A)},kind='write'},'A')
 denied('LOCK_CONFLICT',function()call('file_lock',{targets={pluginMock.id(B),pluginMock.id(A)},kind='write'},'B')end)
 assert(pluginMock.control:list('B',true).total==0)
end)
test('file_unlock nao libera reserva de outro agente',function()
 call('file_lock',{targets={pluginMock.id(A)}},'A');assert(call('file_unlock',{all=true},'B').released==0)
end)
test('fonte desatualizada apos edicao humana e barrada',function()
 call('get_script',{target=pluginMock.id(A)},'A');A.Source='return 10'
 denied('STALE_REVISION',function()call('set_script',{target=pluginMock.id(A),source='bad'},'A')end);assert(A.Source=='return 10')
end)
test('CAS do editor nao cai no fallback Source ao divergir',function()
 call('get_script',{target=pluginMock.id(A)},'A');casEdit=function(scr)scr.Source='return 11'end
 denied('STALE_REVISION',function()call('set_script',{target=pluginMock.id(A),source='bad'},'A')end);assert(A.Source=='return 11')
end)
test('edits e revision continuam funcionais',function()
 local r=call('get_script',{target=pluginMock.id(A)},'A')
 local w=call('set_script',{target=pluginMock.id(A),expectedRevision=r.revision,edits={{find='11',replace='12'}}},'A');assert(A.Source=='return 12' and w.revision~=r.revision)
end)
test('get_instance Source le buffer aberto do editor',function()
 A._buffer='return 13';local r=call('get_instance',{target=pluginMock.id(A),properties={'Source'}},'A');assert(r.properties.Source=='return 13' and r.revision);A.Source='return 13'
end)
test('run_luau nao e bloqueado por leitura, reserva nem escrita alheia',function()
 call('get_script',{target=pluginMock.id(A)},'A');call('file_lock',{targets={pluginMock.id(B)},kind='write'},'A')
 local r=call('run_luau',{code='return 1'},'B');assert(r.returned[1]==1 and r.lockScope=='none' and r.touchedLockedScripts==nil)
 assert(pluginMock.control:summary().locks==2,'run_luau nao deve criar nem remover travas')
end)
test('run_luau nao falha por revisao antiga de script lido antes',function()
 call('get_script',{target=pluginMock.id(A)},'A');drive(function()taskMock.wait(9)end)
 call('get_script',{target=pluginMock.id(A)},'B');call('set_script',{target=pluginMock.id(A),source='return 20'},'B');drive(function()taskMock.wait(9)end)
 local r=call('run_luau',{code='return 2'},'A');assert(r.returned[1]==2)
 A.Source='return 13'
end)
test('run_luau que edita script travado por outro e avisado, nao recusado',function()
 call('get_script',{target=pluginMock.id(A)},'A')
 local r=call('run_luau',{code='game.ServerScriptService.Folder.A.Source="return 77"; return true'},'B')
 assert(r.returned[1]==true and r.touchedLockedScripts and #r.touchedLockedScripts==1 and r.touchedLockedScripts[1].path=='game.ServerScriptService.Folder.A')
 assert(r.warnings and #r.warnings==1);assert(A.Source=='return 77')
 local found=false;for _,entry in ipairs(pluginMock.control:list('B',false).audit)do if entry.action=='run_luau-touched' then found=true end end;assert(found,'auditoria sem run_luau-touched')
 A.Source='return 13'
end)
test('run_luau livre faz testes, print e multiplos retornos nativos',function()
 local r=call('run_luau',{code='print("teste"); assert(game:GetService("ServerScriptService")); return 42, false, nil, {ok=true}'},'A')
 assert(r.returned[1]==42 and r.returned[2]==false and r.returned[3].type=='nil' and r.returned[4].ok and r.returnCount==4)
 assert(r.output[1].message=='teste' and r.controlled and r.lockScope=='none');assert(logService.MessageOut:count()==0)
end)
test('run_luau mantem Instance.new, properties e retorno de instancias',function()
 local r=call('run_luau',{code='local p=Instance.new("Part"); p.Name="NativePart"; p.Parent=workspace; return p'},'A')
 assert(workspaceMock:FindFirstChild('NativePart'));assert(r.returned[1]=='game.Workspace.NativePart')
end)
test('run_luau aguarda task.spawn, defer e delay antes de liberar',function()
 local r=call('run_luau',{code='task.spawn(function() task.wait(0.1); print("spawn") end); task.defer(function() print("defer") end); task.delay(0.2,function() print("delay") end); return true'},'A')
 assert(r.tasksSpawned==3 and #r.output==3 and r.ms>=199);assert(pluginMock.control:summary().locks==0)
end)
test('erro em task filha limpa log e historico',function()
 denied('LUAU_ERROR',function()call('run_luau',{code='task.defer(function() error("filha") end); return true'},'A')end)
 assert(logService.MessageOut:count()==0 and pluginMock.control:summary().locks==0 and historyEnded[#historyEnded]=='Cancel')
end)
test('erro principal de run_luau sempre desconecta captura de logs',function()
 denied('LUAU_ERROR',function()call('run_luau',{code='print("antes"); error("esperado")'},'A')end)
 assert(logService.MessageOut:count()==0 and pluginMock.control:summary().locks==0)
end)
test('erro de sintaxe nao vaza travas',function()
 local ok,e=pcall(function()call('run_luau',{code='local = invalid'},'A')end);assert(not ok);assert(pluginMock.control:summary().locks==0 and logService.MessageOut:count()==0)
end)
test('timeout cancela root e tasks cedendo ao scheduler',function()
 denied('EXECUTION_TIMEOUT',function()call('run_luau',{code='task.spawn(function() while true do task.wait(1) end end); while true do task.wait(1) end',timeoutMs=100},'A')end)
 assert(logService.MessageOut:count()==0 and pluginMock.control:summary().locks==0)
end)
test('task.delay nao escapa depois de timeout',function()
 denied('EXECUTION_TIMEOUT',function()call('run_luau',{code='task.delay(5,function() workspace.Name="ESCAPOU" end); return true',timeoutMs=100},'A')end)
 drive(function()taskMock.wait(6)end);assert(workspaceMock.Name=='Workspace')
end)
test('MCP.trackConnection desconecta sinais ao finalizar',function()
 env.TestSignal=signal();call('run_luau',{code='MCP.trackConnection(TestSignal:Connect(function() print("event") end)); return true'},'A');assert(env.TestSignal:count()==0)
end)
test('pedido expirado ou ticket negado nunca executa codigo',function()
 denied('REQUEST_EXPIRED',function()call('run_luau',{code='workspace.Name="BAD"'},'A',{deadline=time-1})end)
 denied('REQUEST_EXPIRED',function()call('run_luau',{code='workspace.Name="BAD"'},'A',{ticketDenied=true})end);assert(workspaceMock.Name=='Workspace')
end)
test('cancelamento em voo encerra execucao e libera exclusividade',function()
 seq=seq+1;local ev={reqId='req_'..seq,tool='run_luau',args={code='while true do task.wait(1)end'},agent='A',generation=1,deadline=time+10};events[ev.reqId]=ev
 taskMock.delay(.1,function()ev.cancelled=true end)
 denied('CANCELLED',function()drive(function()pluginMock.execute(ev)end)end);assert(pluginMock.control:summary().locks==0)
end)
test('undo_history usa trava global',function()
 call('file_lock',{targets={pluginMock.id(A)},kind='read'},'A');denied('LOCK_CONFLICT',function()call('undo_history',{},'B')end)
end)
test('criacao de irmao funciona sem destravar leitor de A',function()
 call('get_script',{target=pluginMock.id(A)},'A');local r=call('create_script',{parent=pluginMock.id(folder),name='Sibling',kind='ModuleScript',source='return 99'},'B');assert(r.id and r.revision)
end)
test('create_instance rejeita Parent oculto nas propriedades',function()
 denied('USE_PARENT_ARGUMENT',function()call('create_instance',{className='Part',properties={Parent=pluginMock.id(folder)}},'B')end)
end)
test('ferramentas desconhecidas sao fail-closed',function()
 denied('UNCLASSIFIED_TOOL',function()call('unknown_tool',{},'A')end)
end)
test('agent_close libera reservas e nao depende de equipes',function()
 call('file_lock',{targets={pluginMock.id(A)}},'A');assert(call('agent_close',{},'A').closed);assert(pluginMock.control:summary().locks==0)
end)
test('normalizacao de URL retira parametros de identidade do plugin',function()
 assert(pluginMock.normalize(' https://x.test/mcp/session1/token123?agent=A ')=='https://x.test/ponte/session1/token123')
end)
test('reconectar invalida tokens de revisao anteriores',function()
 local old=pluginMock.control:read('A',A,'old')
 local fresh=pluginMock.newControl()
 denied('STALE_REVISION',function()fresh:checkVersion('A',A,'changed',old,true)end)
end)
local function enqueue(tool,args,agent)
 seq=seq+1;local ev={reqId='req_'..seq,tool=tool,args=args or {},agent=agent or 'agent-A',prazoMs=20000,deadline=time+20};events[ev.reqId]=ev;return ev
end
test('run_luau demorado nao segura as demais chamadas (executor concorrente)',function()
 env.STARTS={}
 local slow=enqueue('run_luau',{code='table.insert(STARTS,{"slow",os.clock()}); task.wait(0.5); return true'},'A')
 local fast=enqueue('get_script',{target=pluginMock.id(B)},'B')
 local other=enqueue('run_luau',{code='table.insert(STARTS,{"other",os.clock()}); return true'},'C')
 pluginMock.receive({events={slow,fast,other}},1)
 drive(function()taskMock.wait(1)end)
 local cache=pluginMock.cache()
 for _,ev in ipairs({slow,fast,other})do assert(cache[ev.reqId] and cache[ev.reqId].acked,'resultado nao confirmado: '..ev.tool)end
 assert(#env.STARTS==2);assert(math.abs(env.STARTS[1][2]-env.STARTS[2][2])<0.5,'segundo run_luau esperou o primeiro terminar')
 assert(pluginMock.running()==0 and pluginMock.control:summary().locks==1)
 env.STARTS=nil
end)
test('escritas conflitantes continuam exclusivas mesmo em paralelo',function()
 local reader=enqueue('get_script',{target=pluginMock.id(A)},'A')
 local writer=enqueue('set_script',{target=pluginMock.id(A),source='bad'},'B')
 local outcomes={}
 http.RequestAsync=(function(original)return function(self,req)
  if req.Url:match('/resposta$')then for _,item in ipairs(req.Body.itens)do outcomes[item.reqId]=item end end
  return original(self,req)
 end end)(http.RequestAsync)
 pluginMock.receive({events={reader,writer}},1);drive(function()taskMock.wait(0.5)end)
 assert(outcomes[reader.reqId].ok==true);assert(outcomes[writer.reqId].ok==false and outcomes[writer.reqId].erro.code=='LOCK_CONFLICT');assert(A.Source~='bad')
end)
test('replay de evento confirmado nao reexecuta nem reenvia payload',function()
 env.RUNS={n=0}
 local ev=enqueue('run_luau',{code='RUNS.n=RUNS.n+1; return true'},'A')
 pluginMock.receive({events={ev}},1);drive(function()taskMock.wait(0.2)end)
 assert(env.RUNS.n==1 and pluginMock.cache()[ev.reqId].acked and pluginMock.cache()[ev.reqId].result==nil)
 pluginMock.receive({events={ev}},1);drive(function()taskMock.wait(0.2)end);assert(env.RUNS.n==1)
 env.RUNS=nil
end)
test('falha de limpeza retem so as travas daquele contexto e recupera depois',function()
 local calls=0
 local ok,e=pcall(function()call('run_luau',{code='MCP.trackConnection({Disconnect=function() error("nao consigo desconectar") end}); return true'},'A')end)
 assert(not ok and e.code=='CLEANUP_FAILED');assert(#pluginMock.pendingCleanups==1)

 local r=call('get_script',{target=pluginMock.id(B)},'B');assert(r.revision)

 for _,ctx in ipairs(pluginMock.pendingCleanups)do for i,fn in ipairs(ctx.cleanups)do ctx.cleanups[i]=function()end end end
 call('get_script',{target=pluginMock.id(B)},'B');assert(#pluginMock.pendingCleanups==0)
end)
test('watchdog preemptivo interrompe loop infinito SEM task.wait (nao congela o Studio)',function()
 simularCpu(0.001)
 local ok,e=pcall(function()call('run_luau',{code='local n=0 while true do n=n+1 end',timeoutMs=100},'A')end)
 simularCpu(0)
 assert(not ok and type(e)=='table' and (e.code=='EXECUTION_TIMEOUT' or e.code=='CANCELLED'),'loop infinito nao foi interrompido: '..tostring(type(e)=='table' and e.code or e))
 assert(pluginMock.running()==0 and pluginMock.control:summary().locks==0)
end)
test('watchdog cede o quadro em loops longos e devolve o resultado',function()
 simularCpu(0.0005)
 local r=call('run_luau',{code='local s=0 for i=1,5000 do s=s+i end return s'},'A')
 simularCpu(0)
 assert(r.returned[1]==12502500 and r.watchdog=='preemptivo',tostring(r.watchdog))
end)
test('instrumentacao nao altera strings, comentarios nem identificadores parecidos',function()
 local r=call('run_luau',{code=[[
  local todo, redo = "while true do end", 'repeat -- do'
  -- do repeat while
  --[==[ do ]==]
  local t = { undo = 1 }
  local s = [=[ do ]=]
  return todo .. redo .. s .. tostring(t.undo)
 ]]},'A')
 assert(r.returned[1]=='while true do endrepeat -- do do 1',tostring(r.returned[1]))
 assert(r.watchdog=='preemptivo')
end)
test('conexoes criadas por run_luau viram no-op ao terminar; MCP.keep preserva',function()
 env.Solto=signal();env.Mantido=signal();env.CONTADOR={solto=0,mantido=0}
 call('run_luau',{code='Solto:Connect(function() CONTADOR.solto=CONTADOR.solto+1 end); Mantido:Connect(MCP.keep(function() CONTADOR.mantido=CONTADOR.mantido+1 end)); return true'},'A')
 env.Solto:fire();env.Mantido:fire()
 assert(env.CONTADOR.solto==0,'callback solto continuou rodando apos o fim do run_luau')
 assert(env.CONTADOR.mantido==1,'MCP.keep deveria manter o callback vivo')
 env.Solto=nil;env.Mantido=nil;env.CONTADOR=nil
end)
test('tickets de inicio sao pedidos em lote por rodada do executor',function()
 INICIAR_LOTES=0
 local a=enqueue('get_script',{target=pluginMock.id(A)},'A')
 local b=enqueue('get_script',{target=pluginMock.id(B)},'B')
 local c=enqueue('run_luau',{code='return 1'},'C')
 pluginMock.receive({events={a,b,c}},1);drive(function()taskMock.wait(0.5)end)
 assert(INICIAR_LOTES==1,'esperava 1 POST /iniciar em lote, houve '..tostring(INICIAR_LOTES))
 for _,ev in ipairs({a,b,c})do assert(pluginMock.cache()[ev.reqId].acked,'sem confirmacao: '..ev.tool)end
end)

test('watchdog interrompe recursao infinita SEM loop (tick na entrada da funcao)',function()
 simularCpu(0.001)
 local ok,e=pcall(function()call('run_luau',{code='local function f(n) return f(n+1)+1 end return f(0)',timeoutMs=100},'A')end)
 simularCpu(0)
 assert(not ok and type(e)=='table' and (e.code=='EXECUTION_TIMEOUT' or e.code=='CANCELLED'),'recursao nao foi interrompida: '..tostring(type(e)=='table' and e.code or e))
 assert(pluginMock.running()==0)
end)
test('recursao profunda cede o quadro e devolve o resultado (nao e sempre abortada)',function()
 simularCpu(0.0005)
 local r=call('run_luau',{code='local function soma(n) if n==0 then return 0 end return n+soma(n-1) end return soma(150)'},'A')
 simularCpu(0)
 assert(r.returned[1]==11325,tostring(r.returned[1]));assert(r.watchdog=='preemptivo')
end)
test('anotacao de tipo de retorno nao quebra a instrumentacao',function()

 local r=call('run_luau',{code='local function f(a) return a*2 end local g = function(b) return b+1 end return f(g(1))'},'A')
 assert(r.returned[1]==4)
end)
test('run_luau sem pontos de yield e BLOQUEADO em vez de rodar sem protecao',function()

 LOADSTRING_HOOK=function(code)
  if code:find('__mcp_tick',1,true) then return nil,'simulado: instrumentado nao compila' end
 end
 env.RODOU=false
 local ok,e=pcall(function()call('run_luau',{code='for i=1,1 do RODOU=true end return 1'},'A')end)
 LOADSTRING_HOOK=nil
 assert(not ok and type(e)=='table' and e.code=='WATCHDOG_UNAVAILABLE','esperava WATCHDOG_UNAVAILABLE, veio '..tostring(type(e)=='table' and e.code or e))
 assert(env.RODOU==false,'codigo sem watchdog foi executado');assert(e.nothingExecuted==true)
 env.RODOU=nil
end)
test('trabalho pesado sem poder ceder o quadro e abortado com NO_YIELD_POINT',function()

 simularCpu(0.02)
 local ok,e=pcall(function()call('run_luau',{code='local t={} for i=1,50 do t[i]=51-i end table.sort(t,function(a,b) for _=1,50 do end return a<b end) return #t',timeoutMs=30000},'A')end)
 simularCpu(0)
 assert(not ok and type(e)=='table' and e.code=='NO_YIELD_POINT','esperava NO_YIELD_POINT, veio '..tostring(type(e)=='table' and e.code..': '..tostring(e.message) or e))
 assert(pluginMock.running()==0 and logService.MessageOut:count()==0)
end)
test('prints em excesso sao suprimidos e reportados',function()
 local r=call('run_luau',{code='for i=1,500 do print("linha",i) end return true'},'A')
 assert(r.outputSuppressed==200,tostring(r.outputSuppressed));assert(#r.output==200);assert(r.warnings and #r.warnings==1)
end)
test('tabelas gigantes retornadas sao truncadas na codificacao',function()
 local r=call('run_luau',{code='local t={} for i=1,5000 do t[i]=i end return t'},'A')
 assert(#r.returned[1]==2001,tostring(#r.returned[1]));assert(tostring(r.returned[1][2001]):find('omitidos',1,true))
end)
test('resultado acima do limite de bytes vira RESULT_TOO_LARGE em vez de envenenar a fila',function()
 local outcomes={}
 local originalEncode,originalRequest=http.JSONEncode,http.RequestAsync
 http.JSONEncode=function(_,body)
  if type(body)=='table' and body.reqId and body.resultado and body.resultado.returned and body.resultado.returned[1]==1 then return string.rep('x',800*1024)end
  return body
 end
 http.RequestAsync=function(self,req)
  if req.Url:match('/resposta$')then for _,item in ipairs(req.Body.itens)do outcomes[item.reqId]=item end end
  return originalRequest(self,req)
 end
 local grande=enqueue('run_luau',{code='return 1'},'A')
 local depois=enqueue('run_luau',{code='return 2'},'B')
 pluginMock.receive({events={grande,depois}},1);drive(function()taskMock.wait(0.5)end)
 http.JSONEncode=originalEncode;http.RequestAsync=originalRequest
 assert(outcomes[grande.reqId] and outcomes[grande.reqId].ok==false and outcomes[grande.reqId].erro.code=='RESULT_TOO_LARGE',tostring(outcomes[grande.reqId] and outcomes[grande.reqId].erro and outcomes[grande.reqId].erro.code))
 assert(outcomes[depois.reqId] and outcomes[depois.reqId].ok==true,'a resposta seguinte ficou presa atras do resultado grande')
 assert(#pluginMock.buffer()==0)
end)
test('resposta recusada com 4xx e substituida por erro leve e a fila segue',function()
 local originalRequest=http.RequestAsync
 local recusas,outcomes=0,{}
 http.RequestAsync=function(self,req)
  if req.Url:match('/resposta$')then
   for _,item in ipairs(req.Body.itens)do
    if item.ok==true and item.resultado and item.resultado.returned and item.resultado.returned[1]==7 then recusas=recusas+1;return {Success=false,StatusCode=400,Body='BODY_TOO_LARGE'}end
    outcomes[item.reqId]=item
   end
  end
  return originalRequest(self,req)
 end
 local ruim=enqueue('run_luau',{code='return 7'},'A')
 local bom=enqueue('run_luau',{code='return 8'},'B')
 pluginMock.receive({events={ruim,bom}},1);drive(function()taskMock.wait(1)end)
 http.RequestAsync=originalRequest
 assert(recusas>=1,'mock nao recusou')
 assert(outcomes[ruim.reqId] and outcomes[ruim.reqId].erro.code=='RESPONSE_REJECTED',tostring(outcomes[ruim.reqId] and outcomes[ruim.reqId].erro and outcomes[ruim.reqId].erro.code))
 assert(outcomes[bom.reqId] and outcomes[bom.reqId].ok==true,'resposta boa ficou presa')
 assert(#pluginMock.buffer()==0)
end)
test('supervisor finaliza execucao orfa (thread morta apos o prazo) e devolve o slot',function()

 seq=seq+1;local ev={reqId='req_'..seq,tool='run_luau',args={code='return 1'},agent='A',generation=1,deadline=time+1,prazoMs=1000};events[ev.reqId]=ev
 local execucoes=pluginMock.executions()
 local morta=coroutine.create(function()end);coroutine.resume(morta)
 execucoes[ev]=morta
 pluginMock.cache()[ev.reqId]={event=ev}
 local antes=pluginMock.running()

 assert(pluginMock.sweep()==0 and execucoes[ev]==morta)
 drive(function()taskMock.wait(5)end)
 local outcomes={}
 local originalRequest=http.RequestAsync
 http.RequestAsync=function(self,req)
  if req.Url:match('/resposta$')then for _,item in ipairs(req.Body.itens)do outcomes[item.reqId]=item end end
  return originalRequest(self,req)
 end
 assert(pluginMock.sweep()==1,'orfa nao foi varrida');drive(function()taskMock.wait(0.5)end)
 http.RequestAsync=originalRequest
 assert(execucoes[ev]==nil and pluginMock.running()==math.max(0,antes-1))
 assert(outcomes[ev.reqId] and outcomes[ev.reqId].erro.code=='EXECUTION_LOST',tostring(outcomes[ev.reqId] and outcomes[ev.reqId].erro and outcomes[ev.reqId].erro.code))
end)
test('varreduras do plugin (find_instances) respeitam o orcamento de quadro compartilhado',function()
 local raiz=instance('Folder','Muitos',workspaceMock)
 for i=1,300 do instance('Part','P'..i,raiz)end
 simularCpu(0.001)
 local yields=0
 local originalWait=taskMock.wait
 taskMock.wait=function(s)yields=yields+1;return originalWait(s)end
 local r=call('find_instances',{target=pluginMock.id(raiz),className='Part',limit=500},'A')
 taskMock.wait=originalWait
 simularCpu(0)
 assert(r.count==300);assert(yields>0,'varredura nao cedeu o quadro')
 raiz:Destroy()
end)
test('indice de scripts: busca nao varre o place de novo, acompanha scripts novos/removidos e pula CoreGui',function()
 local core=service('CoreGui');local interno=instance('ModuleScript','Interno',core);interno.Source='local agulhaIndice = 1'
 local r1=call('grep_scripts',{pattern='agulhaIndice'},'A')
 assert(r1.count==0,'CoreGui entrou na busca: '..tostring(r1.count))
 assert((r1.indexedScripts or 0)>=2,'indice vazio: '..tostring(r1.indexedScripts))
 local novo=instance('Script','Novo',sss);novo.Source='print("agulhaIndice")'
 local varridos=0;local original=methods.GetDescendants
 methods.GetDescendants=function(self)if self==folder or self==gameMock or self.Parent==gameMock then varridos=varridos+1 end;return original(self)end
 local ok,e=pcall(function()
  local r2=call('grep_scripts',{pattern='agulhaIndice'},'A')
  assert(r2.count==1 and r2.results[1].path:match('Novo$'),'script novo nao achado pelo indice')
  local r3=call('find_instances',{className='Script',query='Novo'},'A')
  assert(r3.count==1,'find_instances por classe de script nao usou o indice atualizado')
  assert(varridos==0,'busca varreu o place de novo ('..varridos..' GetDescendants)')
 end)
 methods.GetDescendants=original
 if not ok then error(e,0)end
 novo:Destroy()
 assert(call('grep_scripts',{pattern='agulhaIndice'},'A').count==0,'script removido continuou no indice')
 local r4=call('grep_scripts',{pattern='agulhaIndice',target='game.CoreGui'},'A')
 assert(r4.count==1,'alvo explicito fora do projeto deveria varrer direto: '..tostring(r4.count))
 interno:Destroy()
end)

test('Sessao Viva ausente: livesession_status responde installed=false e escritas seguem sem liveSession',function()
 local r=call('livesession_status',{},'A');assert(r.installed==false and r.state=='Missing','status sem ponte')
 denied('LIVESESSION_MISSING',function()call('livesession_verify',{targets={'game.ServerScriptService.Folder.A'}},'A')end)
 local scr=instance('Script','LiveA',sss);scr.Source='print(1)'
 call('get_script',{target='game.ServerScriptService.LiveA'},'A')
 local w=call('set_script',{target='game.ServerScriptService.LiveA',source='print(2)'},'A')
 assert(w.liveSession==nil,'nao deveria anexar liveSession sem a Sessao Viva')
end)
test('Sessao Viva rodando: set_script espera o hot reload, set_properties registra no journal, Play nativo e recusado',function()
 local core=service('CoreGui')
 local pasta=instance('Folder','LiveSessionBridge',core)
 pasta:SetAttribute('State','Running');pasta:SetAttribute('SessionId','ls-1');pasta:SetAttribute('Heartbeat',os.time());pasta:SetAttribute('Version','1.1.0')
 local chamadas={}
 local invoke=instance('BindableFunction','Invoke',pasta)
 invoke.Invoke=function(_,comando,args)
  table.insert(chamadas,{comando=comando,args=args})
  if comando=='await' or comando=='verify' then
   local results={}
   for i,alvo in ipairs(args.targets)do results[i]={instance=alvo,path=alvo:GetFullName(),className=alvo.ClassName,exists=true,live=true,synced=true,running={server=1,client=0},persist=true,reason='registrado no journal'}end
   return {state='Running',live=true,results=results,waitedMs=250,reloads=3,lastReload={seq=3,label=args.targets[1].Name,count=1,affected=1,swapped=1,elapsedMs=2,paths={args.targets[1]:GetFullName()}}}
  elseif comando=='record' then
   local item=args.items[1];return {state='Running',recorded=#item.properties+#item.attributes,failed={},skipped={}}
  elseif comando=='status' then
   return {state='Running',stateLabel='Rodando',running=true,live=true,engine='hosted',hotReload={reloads=3,pending=0,broken={{instance=sss,path='ServerScriptService',error='x'}}}}
  end
  return {state='Running'}
 end
 local scr=instance('Script','LiveB',sss);scr.Source='print(1)'
 call('get_script',{target='game.ServerScriptService.LiveB'},'A')
 local w=call('set_script',{target='game.ServerScriptService.LiveB',source='print(2)'},'A')
 assert(w.liveSession and w.liveSession.applied==true and w.liveSession.persisted==true,'liveSession ausente ou incompleto')
 assert(w.liveSession.items[1].path=='game.ServerScriptService.LiveB',tostring(w.liveSession.items[1].path))
 assert(type(w.liveSession.items[1].id)=='string' and w.liveSession.items[1].id:match('^i_'),'id do MCP')
 assert(w.liveSession.lastReload.paths[1]=='game.ServerScriptService.LiveB','paths com prefixo game.')
 local ultima=chamadas[#chamadas];assert(ultima.comando=='await' and ultima.args.targets[1]==scr and ultima.args.timeout>0,'await com o script editado')
 local part=instance('Part','P',workspaceMock)
 local p=call('set_properties',{target='game.Workspace.P',properties={Transparency=0.5},attributes={Vida=10}},'A')
 assert(p.liveSession and p.liveSession.recorded==2,'record: '..tostring(p.liveSession and p.liveSession.recorded))
 local reg;for _,c in ipairs(chamadas)do if c.comando=='record' then reg=c end end
 assert(reg.args.items[1].target==part and reg.args.items[1].properties[1]=='Transparency' and reg.args.items[1].attributes[1]=='Vida','itens do record')
 local semEspera=call('set_properties',{target='game.Workspace.P',properties={Transparency=0.2},liveWaitMs=0},'A')
 assert(semEspera.liveSession.recorded==1,'liveWaitMs=0 ainda registra no journal')
 local st=call('livesession_status',{},'A');assert(st.installed==true and st.state=='Running' and st.bridgeVersion=='1.1.0','status com ponte')
 assert(st.hotReload.broken[1].path=='game.ServerScriptService' and st.hotReload.broken[1].id~=nil,'traducao de instancias no status')
 assert(st.importmcp and st.importmcp.installed==false,'resumo do ImportMCP')
 assert(pluginMock.testState().liveSession.state=='Running','studio_play status/ola levam a Sessao Viva')
 denied('LIVESESSION_ACTIVE',function()call('studio_play',{action='play'},'A')end)
 local ver=call('livesession_verify',{targets={'game.ServerScriptService.LiveB'},waitMs=0},'A')
 assert(ver.summary.total==1 and ver.summary.live==1 and ver.summary.persist==1,'resumo do verify')
 assert(chamadas[#chamadas].comando=='verify','waitMs=0 usa verify sem espera')
 local ctl=call('livesession_control',{action='restart',targets={'game.ServerScriptService.LiveB'}},'A')
 assert(ctl.action=='restart' and chamadas[#chamadas].comando=='restart' and chamadas[#chamadas].args.targets[1]==scr,'restart')
 denied('PROPERTIES_REQUIRED',function()call('livesession_control',{action='record',targets={'game.Workspace.P'}},'A')end)
 denied('INVALID_ACTION',function()call('livesession_control',{action='explodir'},'A')end)
 local j=call('livesession_journal',{log='output',limit=5},'A');assert(chamadas[#chamadas].comando=='output' and chamadas[#chamadas].args.limit==5,'journal log=output')
 pasta:SetAttribute('Heartbeat',os.time()-60)
 denied('LIVESESSION_STALE',function()call('livesession_verify',{targets={'game.ServerScriptService.LiveB'}},'A')end)
 pasta:SetAttribute('State','Idle');pasta:SetAttribute('Heartbeat',os.time())
 local parado=call('set_script',{target='game.ServerScriptService.LiveB',source='print(3)'},'A')
 assert(parado.liveSession==nil,'sessao parada: sem bloco liveSession')
 pasta:Destroy()
end)
realPrint('PLUGIN SIMULADO: '
..passed..' testes aprovados')
