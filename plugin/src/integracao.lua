local function falharControle(code,message,extra)
 local e=extra or {};e.code=code;e.message=message;e.nothingExecuted=true;error(e,0)
end
local function resolverLista(refs)local out={};for _,ref in ipairs(refs or {})do table.insert(out,resolver(ref))end;return out end
local function prepararControle(ev)
 local a,tool,plans=ev.args or {},ev.tool,{}
 local function add(target,kind,recursive,keep)if target then table.insert(plans,{target=target,kind=kind,recursive=recursive==true,keepRead=keep==true})end end
 if a.target~=nil then a.target=resolver(a.target)end
 if a.parent~=nil then a.parent=resolver(a.parent)end
 if a.targets~=nil then a.targets=resolverLista(a.targets)end
 if tool=='get_tree' or tool=='find_instances' or tool=='grep_scripts' then add(a.target or game,'read',true)
 elseif tool=='inspect_model' then

  if not a.target then falharControle('TARGET_REQUIRED','Informe target (Model, BasePart ou pasta).')end;add(a.target,'read',true)
 elseif tool=='export_file' then

  if a.target~=nil then
   local scr=a.target:IsA('LuaSourceContainer') and (a.kind==nil or a.kind=='auto' or a.kind=='script')
   add(a.target,'read',not scr,scr)
  end
 elseif tool=='outline_script' then add(a.target,'read',false)
 elseif tool=='get_instance' or tool=='get_script' then add(a.target,'read',false,true)
 elseif tool=='set_script' then
  if not a.target or not a.target:IsA('LuaSourceContainer')then falharControle('NOT_SCRIPT','O alvo nao e script.')end;add(a.target,'write')
 elseif tool=='set_properties' then
  local props=a.properties or {};add(a.target,'write',props.Name~=nil or props.Parent~=nil)
  if props.Parent~=nil then
   props.Parent=resolver(props.Parent)
   if props.Parent==a.target or props.Parent:IsDescendantOf(a.target)then falharControle('PARENT_CYCLE','Novo pai criaria ciclo.')end
   add(a.target.Parent,'write');add(props.Parent,'write')
  end
  if props.Source~=nil and type(props.Source)~='string'then falharControle('INVALID_SOURCE','Source deve ser texto.')end
 elseif tool=='create_instance' or tool=='create_script' or tool=='insert_asset' then
  a.parent=a.parent or game:GetService(tool=='create_script' and 'ServerScriptService' or 'Workspace');add(a.parent,'write')
  if a.properties and a.properties.Parent~=nil then falharControle('USE_PARENT_ARGUMENT','Use parent, nao properties.Parent, em create_instance.')end
 elseif tool=='delete_instance' then
  if not a.targets or #a.targets==0 then falharControle('TARGET_REQUIRED','Informe targets.')end
  for _,target in ipairs(a.targets)do
   if target==game then falharControle('PROTECTED_ROOT','Nao e permitido apagar game.')end
   add(target,'write',true);add(target.Parent,'write')
  end
 elseif tool=='move_instance' then
  if a.parent==a.target or a.parent:IsDescendantOf(a.target)then falharControle('PARENT_CYCLE','Movimento criaria ciclo.')end
  add(a.target,'write',true);add(a.target.Parent,'write');add(a.parent,'write')
 elseif tool=='duplicate_instance' then
  a.parent=a.parent or a.target.Parent;add(a.target,'read',true);add(a.parent,'write')
 elseif tool=='run_luau' then

 elseif tool=='import_asset' then

  if a.target~=nil then add(a.target,'write')
  else
   if a.parent==nil then
    local as=tostring(a.as or '')
    if as=='ImageLabel' or as=='ImageButton' then a.parent=game:GetService('StarterGui')
    elseif as=='Decal' or as=='Texture' then falharControle('PARENT_REQUIRED','Decal/Texture precisam de parent (um BasePart).')
    else a.parent=game:GetService('Workspace')end
   end
   add(a.parent,'write')
  end
 elseif tool=='import_manage' then
  if a.action=='restore' or a.action=='remove' then
   if not a.target then falharControle('TARGET_REQUIRED','Informe target para '..tostring(a.action)..'.')end
   add(a.target,'write',true);if a.action=='remove' then add(a.target.Parent,'write')end
  elseif a.action=='restoreAll' then add(game,'write',true)
  end
 elseif tool=='livesession_status' or tool=='livesession_journal' or tool=='livesession_verify' or tool=='livesession_control' then

 elseif tool=='import_upload' or tool=='import_status' then

 elseif tool=='undo_history' then add(game,'write',true)
 elseif tool=='get_selection' then for _,target in ipairs(Selection:Get())do add(target,'read')end
 elseif tool=='set_selection' or tool=='get_logs' or tool=='file_lock' or tool=='file_unlock' or tool=='file_locks' or tool=='agent_close' or tool=='studio_play' then

 else falharControle('UNCLASSIFIED_TOOL','Ferramenta sem politica de controle: recusada.')end
 ev.args=a;return plans
end
local function verificarVersoes(ev)
 local a,tool=ev.args,ev.tool
 if tool=='set_script' or (tool=='set_properties' and a.properties and a.properties.Source~=nil)then
  controle:checkVersion(ev.agent,a.target,fonteDe(a.target),a.expectedRevision,true)
 elseif tool=='delete_instance' then for _,target in ipairs(a.targets)do controle:checkObserved(ev.agent,fonteDe,target)end
 elseif tool=='set_properties' or tool=='move_instance' then controle:checkObserved(ev.agent,fonteDe,a.target)
 elseif tool=='undo_history' then controle:checkObserved(ev.agent,fonteDe,nil)end
end
local function registrarVersoes(ev,result)
 local a,tool=ev.args,ev.tool
 if tool=='get_script'then return
 elseif tool=='get_instance' and a.target:IsA('LuaSourceContainer') and result.properties.Source~=nil then result.revision=controle:read(ev.agent,a.target,result.properties.Source)
 elseif tool=='set_script' or (tool=='set_properties' and a.properties and a.properties.Source~=nil)then result.revision=controle:read(ev.agent,a.target,fonteDe(a.target))
 elseif tool=='create_script' or (tool=='create_instance' and result.id and resolver(result.id):IsA('LuaSourceContainer'))then
  local target=resolver(result.id);result.revision=controle:read(ev.agent,target,fonteDe(target))
 end
end

local LIMITE_VIGIA=200
local function ehScript(inst)local ok,isa=pcall(function()return inst:IsA('LuaSourceContainer')end);return ok and isa==true end
local function vigiarRunLuau(ev)
 if ev.tool~='run_luau' then return nil end
 local antes,total={},0
 local function fotografar(inst)
  if total>=LIMITE_VIGIA or antes[inst]~=nil or not ehScript(inst)then return end
  local ok,src=pcall(fonteDe,inst);if ok then antes[inst]=src;total=total+1 end
 end
 for _,entry in ipairs(controle:foreign(ev.agent))do
  fotografar(entry.target)
  if entry.recursive and total<LIMITE_VIGIA then
   local ok,desc=pcall(function()return entry.target:GetDescendants()end)
   if ok then for _,inst in ipairs(desc)do if total>=LIMITE_VIGIA then break end;fotografar(inst)end end
  end
 end
 if total==0 then return nil end
 return function(result)
  local tocados={}
  for inst,src in pairs(antes)do
   if not vivo(inst)then table.insert(tocados,{target=idDe(inst),path=caminhoDe(inst),destroyed=true})
   else local ok,agora=pcall(fonteDe,inst);if ok and agora~=src then table.insert(tocados,{target=idDe(inst),path=caminhoDe(inst)})end end
  end
  if #tocados==0 or type(result)~='table' then return end
  result.touchedLockedScripts=tocados
  result.warnings=result.warnings or {}
  table.insert(result.warnings,'run_luau alterou/destruiu '..#tocados..' script(s) que outro agente esta lendo ou editando. Para editar codigo de forma coordenada use set_script; run_luau e para validar.')
  controle:log('run_luau-touched',ev.agent,{count=#tocados,first=tocados[1]})
 end
end
acoes.file_lock=function(a)
 local plans={};for _,target in ipairs(a.targets or {})do table.insert(plans,{target=target,kind=a.kind or 'write',recursive=a.recursive~=false})end
 return controle:reserve(contextoAtual.agent,plans,a.seconds,a.note)
end
acoes.file_unlock=function(a)return controle:release(contextoAtual.agent,a.targets or {},a.all==true)end
acoes.file_locks=function(a)return controle:list(contextoAtual.agent,a.mine==true,a.offset,a.limit)end
acoes.agent_close=function()return controle:close(contextoAtual.agent)end
