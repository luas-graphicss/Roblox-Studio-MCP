return function(d)
 local FATIA_MAX=0.05
 local LIMITE_SEM_YIELD=0.5
 local LIMITE_IMPRESSOES=300
 local PALAVRAS_LOOP={['do']=true,['repeat']=true}
 local METODOS_CONEXAO={Connect=true,ConnectParallel=true,Once=true}

 local frame=d.frame
 if type(frame)~='table' or type(frame.exceeded)~='function' or type(frame.yield)~='function' then
  local inicio,orc=d.clock(),0.008
  frame={
   exceeded=function()return d.clock()-inicio>=orc end,
   yield=function()local dt=tonumber(d.task.wait()) or 0;orc=math.max(0.004,math.min(0.04,dt*0.3));inicio=d.clock();return dt end,
  }
 end
 local function fecharLongo(code,i,nivel)
  local fim=string.find(code,']'..string.rep('=',nivel)..']',i,true)
  return fim and fim+nivel+1 or #code
 end

 local function instrumentar(code)
  local out,i,n={},1,#code
  local pilha={}
  local ultimoSignificativo=''
  local aguardandoParams=false
  local function emitir(s)table.insert(out,s)end
  while i<=n do
   local c=string.sub(code,i,i)
   if c=='-' and string.sub(code,i+1,i+1)=='-' then
    local nivel=string.match(code,'^%-%-%[(=*)%[',i)
    local fim
    if nivel then fim=fecharLongo(code,i+3+#nivel,#nivel) else fim=(string.find(code,'\n',i,true) or n+1)-1 end
    emitir(string.sub(code,i,fim));i=fim+1
   elseif c=='"' or c=="'" or c=='`' then
    local j=i+1
    while j<=n do
     local ch=string.sub(code,j,j)
     if ch=='\\' then j=j+2
     elseif ch==c then break
     elseif ch=='\n' and c~='`' then break
     else j=j+1 end
    end
    emitir(string.sub(code,i,j));i=j+1;ultimoSignificativo='str';aguardandoParams=false
   elseif c=='[' and string.match(code,'^%[=*%[',i) then
    local nivel=#string.match(code,'^%[(=*)%[',i)
    local fim=fecharLongo(code,i+2+nivel,nivel)
    emitir(string.sub(code,i,fim));i=fim+1;ultimoSignificativo='str';aguardandoParams=false
   elseif string.match(c,'[%a_]') then
    local palavra=string.match(code,'^[%w_]+',i)
    local depois=i+#palavra
    if PALAVRAS_LOOP[palavra] and ultimoSignificativo~='.' and ultimoSignificativo~=':' then
     emitir(palavra..' __mcp_tick();')
    elseif METODOS_CONEXAO[palavra] and ultimoSignificativo==':' then
     local paren=string.match(code,'^%s*%(',depois)
     if paren then
      emitir(palavra..paren..'__mcp_cb(');depois=depois+#paren;table.insert(pilha,true)
     else emitir(palavra)end
    else
     emitir(palavra)
     if palavra=='function' and ultimoSignificativo~='.' and ultimoSignificativo~=':' then aguardandoParams=true end
    end
    i=depois;ultimoSignificativo=palavra
   elseif string.match(c,'%d') then
    local num=string.match(code,'^0[xX][%x_]+',i) or string.match(code,'^0[bB][01_]+',i) or string.match(code,'^[%d_]*%.?[%d_]*[eE][%+%-]?%d+',i) or string.match(code,'^[%d_]*%.?[%d_]+',i) or c
    emitir(num);i=i+#num;ultimoSignificativo='num';aguardandoParams=false
   elseif c=='(' then
    emitir(c)
    if aguardandoParams then table.insert(pilha,'fn');aguardandoParams=false else table.insert(pilha,false)end
    i=i+1;ultimoSignificativo=c
   elseif c==')' then
    local marcado=table.remove(pilha)
    if marcado=='fn' then

     local proximo=string.match(code,'^%s*(%S)',i+1)
     emitir(proximo==':' and ')' or ') __mcp_tick();')
    else emitir(marcado and '))' or ')')end
    i=i+1;ultimoSignificativo=c
   else
    emitir(c);i=i+1
    if not string.match(c,'%s') then ultimoSignificativo=c end
   end
  end
  if #pilha>0 then return nil end
  return table.concat(out)
 end
 return function(a,ctx)
  local code=tostring(a.code or '')
  if code=='' then error('informe code',0)end
  if type(d.compile)~='function' or type(d.setEnvironment)~='function' then error('Este Studio nao disponibiliza loadstring/setfenv para plugins. Confira permissoes/versao do Studio; o modo controlado nao desativa run_luau.',0)end
  local fn,syntax=d.compile(code,'=mcp-run-luau');if not fn then error('erro de sintaxe no codigo: '..tostring(syntax),0)end

  local instrumentado=instrumentar(code)
  if not instrumentado then error({code='WATCHDOG_UNAVAILABLE',message='run_luau bloqueado: nao consegui inserir pontos de yield neste codigo (parenteses desbalanceados fora de strings?). Sem watchdog preemptivo o codigo poderia congelar o Studio; simplifique a sintaxe e repita. Nada foi executado.',nothingExecuted=true},0)end
  local fnInst,erroInst=d.compile(instrumentado,'=mcp-run-luau')
  if not fnInst then error({code='WATCHDOG_UNAVAILABLE',message='run_luau bloqueado: o codigo compila, mas a versao com pontos de yield nao ('..tostring(erroInst)..'). Sem watchdog preemptivo o codigo poderia congelar o Studio. Evite construcoes incomuns (ex.: anotacoes de tipo complexas) e repita. Nada foi executado.',nothingExecuted=true},0)end
  fn=fnInst
  local watchdog='preemptivo'
  local threads,connections,output={},{},{}
  local firstError,cleaned,closed,spawned=nil,false,false,0
  local start=d.clock()
  local mantidos=setmetatable({},{__mode='k'})
  local ultimoYield,ultimaChecagem,passos,passada=start,start,0,8
  local impressoes,suprimidas=0,0
  local function encerrado()return closed or ctx.cancelled or ctx.done end
  local function abortar(motivo,codigo)
   error({code=codigo or (ctx.cancelled and 'CANCELLED' or 'EXECUTION_TIMEOUT'),message=motivo},0)
  end
  local function marcarYield()
   ultimoYield=d.clock();ultimaChecagem=ultimoYield;passos=0
  end
  local function tick()
   passos=passos+1
   if passos%passada~=0 then return end
   if encerrado() then abortar('run_luau interrompido pelo watchdog (prazo/cancelamento). O Studio nao foi travado; confira o estado antes de repetir.')end
   local agora=d.clock()
   local gasto=agora-ultimaChecagem;ultimaChecagem=agora

   if gasto>0.002 then passada=math.max(1,math.floor(passada/2))
   elseif gasto<0.0001 then passada=math.min(64,passada*2)end
   if ctx.deadline and agora>=ctx.deadline then ctx.cancelled=true;abortar('run_luau excedeu o prazo e foi interrompido pelo watchdog antes de travar o Studio.')end
   local semYield=agora-ultimoYield
   if frame.exceeded() or semYield>=FATIA_MAX then
    if coroutine.isyieldable() then
     frame.yield()
     marcarYield()
     if encerrado() then abortar('run_luau interrompido pelo watchdog apos ceder o quadro.')end
    elseif semYield>=LIMITE_SEM_YIELD then
     ctx.cancelled=true
     abortar('run_luau bloqueado: o codigo passou '..math.floor(semYield*1000)..'ms sem um ponto onde possa ceder o quadro (trabalho pesado dentro de table.sort, string.gsub com funcao ou metametodo?). Mova o trabalho para fora desse contexto ou reduza o volume. O Studio nao foi travado.','NO_YIELD_POINT')
    end
   end
  end
  local function envolverCallback(f)
   if type(f)~='function' or mantidos[f] then return f end
   return function(...)
    if encerrado() then return end
    marcarYield()
    return f(...)
   end
  end
  local function live(t)return coroutine.status(t)~='dead'end
  local function cancel(t)if live(t)then d.task.cancel(t)end end
  local function cleanup()
   closed=true;if cleaned then return end
   local failure=nil
   for t in pairs(threads)do local ok,e=pcall(cancel,t);if not ok then failure=tostring(e)end end
   for _,conn in ipairs(connections)do local ok,e=pcall(function()conn:Disconnect()end);if not ok then failure=tostring(e)end end
   if failure then error('Falha ao encerrar escopo Luau: '..failure,0)end
   cleaned=true
  end
  table.insert(ctx.cleanups,cleanup)
  table.insert(connections,d.log:Connect(function(message,kind)
   if not closed and #output<200 then table.insert(output,{message=tostring(message),type=tostring(kind):gsub('Enum.MessageType.Message','')})end
  end))
  local function child(callback,...)
   if encerrado() then error('Escopo run_luau encerrado.',0)end
   spawned=spawned+1;if spawned>512 then error('Limite de 512 tarefas filhas por chamada.',0)end
   local t
   if type(callback)=='thread' then t=callback
   elseif type(callback)=='function' then
    t=coroutine.create(function(...)local ok,e=pcall(callback,...);if not ok then firstError=firstError or tostring(type(e)=='table' and e.message or e)end end)
   else error('task espera funcao ou coroutine',0)end
   threads[t]=true;return t,table.pack(...)
  end
  local wrapped={}
  wrapped.spawn=function(callback,...)local t,args=child(callback,...);d.task.spawn(t,table.unpack(args,1,args.n));return t end
  wrapped.defer=function(callback,...)local t,args=child(callback,...);d.task.defer(t,table.unpack(args,1,args.n));return t end
  wrapped.delay=function(seconds,callback,...)local t,args=child(callback,...);d.task.delay(seconds,t,table.unpack(args,1,args.n));return t end
  wrapped.cancel=function(t)if not threads[t]then error('So cancele tarefas filhas desta chamada.',0)end;cancel(t);threads[t]=nil end
  wrapped.wait=function(...)local r=d.task.wait(...);marcarYield();return r end
  setmetatable(wrapped,{__index=d.task,__metatable='MCP task scope'})

  local function limitar(nativo)
   if type(nativo)~='function' then return nativo end
   return function(...)
    impressoes=impressoes+1
    if impressoes>LIMITE_IMPRESSOES then suprimidas=suprimidas+1;return end
    return nativo(...)
   end
  end
  local env=setmetatable({task=wrapped,spawn=wrapped.spawn,delay=wrapped.delay,wait=wrapped.wait,__mcp_tick=tick,__mcp_cb=envolverCallback,MCP={agent=ctx.agent,
   isCancelled=encerrado,
   checkpoint=function()if encerrado() then error('run_luau cancelado',0)end;return wrapped.wait()end,
   trackConnection=function(conn)if closed then error('Escopo encerrado',0)end;table.insert(connections,conn);return conn end,
   keep=function(f)if type(f)=='function' then mantidos[f]=true end;return f end,
  }},{__index=d.environment})
  env.print=limitar(d.environment and d.environment.print)
  env.warn=limitar(d.environment and d.environment.warn)

  local requireNativo=d.require or (d.environment and d.environment.require)
  local ehModulo=function(x)local ok,isa=pcall(function()return typeof(x)=='Instance' and x:IsA('ModuleScript')end);return ok and isa==true end
  local memo,carregando,modulosFrescos={},{},{}
  local function requireFresco(alvo)
   if not ehModulo(alvo)then
    if type(requireNativo)~='function' then error('require indisponivel neste ambiente',0)end
    return requireNativo(alvo)
   end
   local hit=memo[alvo];if hit then return hit.value end
   local caminho=d.path and d.path(alvo) or tostring(alvo)
   if carregando[alvo] then error('require ciclico detectado em '..caminho,0)end
   local okSrc,src=pcall(d.source,alvo);if not okSrc then error('nao consegui ler o codigo de '..caminho..': '..tostring(src),0)end

   local corpo=instrumentar(src)
   if not corpo then error({code='WATCHDOG_UNAVAILABLE',message='require fresco bloqueado: nao consegui inserir pontos de yield em '..caminho..'. Use MCP.require(m,{fresh=false}) para o require nativo se o modulo ja estiver validado.'},0)end
   local mfn,err=d.compile(corpo,'='..caminho)
   if not mfn then

    local okOrig,errOrig=d.compile(src,'='..caminho)
    if not okOrig then error('erro de sintaxe em '..caminho..': '..tostring(errOrig),0)end
    error({code='WATCHDOG_UNAVAILABLE',message='require fresco bloqueado: a versao com pontos de yield de '..caminho..' nao compila ('..tostring(err)..'). Use MCP.require(m,{fresh=false}) para o require nativo.'},0)
   end
   carregando[alvo]=true
   local menv=setmetatable({script=alvo,require=requireFresco},{__index=env})
   d.setEnvironment(mfn,menv)
   local okRun,valores=pcall(function()return table.pack(mfn())end)
   carregando[alvo]=nil
   if not okRun then error('erro ao executar '..caminho..': '..tostring(type(valores)=='table' and valores.message or valores),0)end
   if valores.n~=1 or valores[1]==nil then error('O modulo '..caminho..' nao retornou exatamente um valor (retornou '..tostring(valores.n)..'), como exige o require do Roblox',0)end
   memo[alvo]={value=valores[1]};table.insert(modulosFrescos,caminho)
   return valores[1]
  end
  local fresco
  if a.freshRequire~=nil then fresco=(a.freshRequire==true) else fresco=(d.freshDefault~=false) end
  if fresco and type(d.source)=='function' then env.require=requireFresco else fresco=false end
  env.MCP.require=function(alvo,opts)
   if type(opts)=='table' and opts.fresh==false then return requireNativo(alvo)end
   return requireFresco(alvo)
  end
  d.setEnvironment(fn,env)
  local ok,result=pcall(function()
   return d.history(tostring(a.undoLabel or 'MCP run_luau'),function()
    local values=table.pack(fn())
    while true do
     if firstError then error('erro em tarefa filha: '..firstError,0)end
     local pending=false;for t in pairs(threads)do if live(t)then pending=true else threads[t]=nil end end
     if not pending then break end;d.task.wait(.02)
    end
    local encoded={};for i=1,values.n do
     if values[i]==nil then encoded[i]={type='nil'}else encoded[i]=d.encode(values[i])end
    end
    local r={returned=encoded,returnCount=values.n,output=output,ms=math.floor((d.clock()-start)*1000),controlled=true,lockScope='none',tasksSpawned=spawned,watchdog=watchdog,freshRequire=fresco,freshModules=modulosFrescos}
    if suprimidas>0 then
     r.outputSuppressed=suprimidas
     r.warnings={'run_luau imprimiu '..impressoes..' linhas; apenas as primeiras '..LIMITE_IMPRESSOES..' foram enviadas ao Output para nao congelar o Studio. Agregue os dados e retorne-os em vez de imprimir linha a linha.'}
    end
    return r
   end)
  end)
  cleanup()
  if not ok then
   local codigo=type(result)=='table' and result.code or 'LUAU_ERROR'
   error({code=codigo,message=tostring(type(result)=='table' and result.message or result),nothingExecuted=false,output=output},0)
  end
  return result
 end
end
