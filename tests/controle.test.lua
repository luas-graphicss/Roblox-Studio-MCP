local factory=dofile('plugin/src/controle.lua')
local t,passed=0,0
local root={id='game'};local a,b
local folder={id='folder',parent=root}
a={id='A',parent=folder};b={id='B',parent=folder}
local function desc(x,p)local q=x.parent;while q do if q==p then return true end;q=q.parent end;return false end
local function new()return factory({clock=function()return t end,wallMs=function()return t*1000 end,epoch='test',id=function(x)return x.id end,path=function(x)return x.name or x.id end,alive=function(x)return not x.dead end,descendant=desc})end
local function p(x,k,recursive,keep)return {target=x,kind=k,recursive=recursive,keepRead=keep}end
local function denied(code,fn)local ok,e=pcall(fn);assert(not ok and type(e)=='table' and e.code==code,'erro inesperado: '..tostring(type(e)=='table' and e.code or e));return e end
local function test(name,fn)t=0;local ok,e=pcall(fn);if not ok then error(name..': '..tostring(type(e)=='table' and e.message or e),0)end;passed=passed+1;print('  OK controle: '..name)end
test('leitores compartilham',function()local c=new();c:begin('A',{p(a,'read')},'r');c:begin('B',{p(a,'read')},'r');assert(c:summary().active==2)end)
test('leitura bloqueia escritor alheio',function()local c=new();c:begin('A',{p(a,'read')},'r');local e=denied('LOCK_CONFLICT',function()c:begin('B',{p(a,'write')},'w')end);assert(e.nothingExecuted and e.conflicts[1].agent=='A')end)
test('escrita bloqueia outros leitores e escritores',function()local c=new();c:begin('A',{p(a,'write')},'w');for _,k in ipairs({'read','write'})do denied('LOCK_CONFLICT',function()c:begin('B',{p(a,k)},'x')end)end end)
test('scripts distintos nao conflitam',function()local c=new();c:begin('A',{p(a,'read')},'r');c:begin('B',{p(b,'write')},'w')end)
test('graca apos leitura dura 8 segundos',function()local c=new();local x=c:begin('A',{p(a,'read',false,true)},'r');c:finish(x,true);t=7;denied('LOCK_CONFLICT',function()c:begin('B',{p(a,'write')},'w')end);t=8.01;c:gc();assert(c:summary().locks==0)end)
test('erro de leitura nao deixa graca',function()local c=new();local x=c:begin('A',{p(a,'read',false,true)},'r');c:finish(x,false);assert(c:summary().locks==0)end)
test('automaticas liberam no sucesso e erro',function()for _,ok in ipairs({false,true})do local c=new();local x=c:begin('A',{p(a,'write')},'w');c:finish(x,ok);assert(c:summary().locks==0)end end)
test('operacao viva nao expira por TTL',function()local c=new();local x=c:begin('A',{p(a,'write')},'w');t=100000;c:gc();assert(c:summary().locks==1);denied('LOCK_CONFLICT',function()c:begin('B',{p(a,'write')},'w')end);c:finish(x,false);assert(c:summary().locks==0)end)
test('duas chamadas mesmo dono mantem referencias independentes',function()local c=new();local x=c:begin('A',{p(a,'write')},'w');local y=c:begin('A',{p(a,'write')},'w');c:finish(x,true);denied('LOCK_CONFLICT',function()c:begin('B',{p(a,'read')},'r')end);c:finish(y,true);assert(c:summary().locks==0)end)
test('upgrade exige liberar demais leitores',function()local c=new();c:reserve('A',{p(a,'read')},120);c:reserve('B',{p(a,'read')},120);denied('LOCK_CONFLICT',function()c:reserve('A',{p(a,'write')},120)end);c:release('B',{},true);c:reserve('A',{p(a,'write')},120);assert(c:list().locks[1].kind=='write')end)
test('reserva multipla atomica',function()local c=new();c:reserve('B',{p(b,'write')},120);denied('LOCK_CONFLICT',function()c:reserve('A',{p(a,'write'),p(b,'write')},120)end);assert(c:list('A',true).total==0)end)
test('release nao afeta outro dono nem operacao ativa',function()local c=new();c:reserve('A',{p(a,'write')},120);assert(c:release('B',{},true).released==0);local x=c:begin('A',{p(b,'write')},'w');assert(c:release('A',{},true).released==1);assert(c:summary().locks==1);c:finish(x,true)end)
test('reserva manual permanece apos escrita',function()local c=new();c:reserve('A',{p(a,'write')},120);local x=c:begin('A',{p(a,'write')},'w');c:finish(x,true);assert(c:list().locks[1].mode=='manual')end)
test('TTL expirado nao pode ser renovado roubando outro dono',function()local c=new();c:reserve('A',{p(a,'write')},5);t=6;c:reserve('B',{p(a,'write')},120);denied('LOCK_CONFLICT',function()c:reserve('A',{p(a,'write')},120)end)end)
test('TTL invalido rejeita antes de reservar',function()local c=new();for _,v in ipairs({0,4,901})do denied('BAD_TTL',function()c:reserve('A',{p(a,'write')},v)end)end;assert(c:summary().locks==0)end)
test('ancestral e reserva recursiva protegem descendentes',function()local c=new();c:reserve('A',{p(a,'read')},120);denied('LOCK_CONFLICT',function()c:begin('B',{p(folder,'write',true)},'delete')end);c:release('A',{},true);c:reserve('A',{p(folder,'write',true)},120);denied('LOCK_CONFLICT',function()c:begin('B',{p(b,'read')},'r')end)end)
test('criar irmao nao conflita com script lido',function()local c=new();c:reserve('A',{p(a,'read')},120);c:begin('B',{p(folder,'write',false)},'create')end)
test('undo_history global respeita todos os recursos',function()local c=new();c:reserve('A',{p(a,'read')},120);denied('LOCK_CONFLICT',function()c:begin('B',{p(root,'write',true)},'undo_history')end)end)
test('run_luau sem planos nunca conflita e nao cria travas',function()local c=new();c:reserve('A',{p(a,'read')},120);c:reserve('B',{p(b,'write')},120);local x=c:begin('C',{},'run_luau');c:finish(x,true);assert(c:summary().locks==2 and c:summary().runLuau=='free')end)
test('foreign lista so alvos de outros agentes, unindo recursividade',function()local c=new();c:reserve('A',{p(a,'read')},120);c:reserve('A',{p(folder,'read',true)},120);c:reserve('B',{p(a,'read')},120);c:reserve('B',{p(b,'read')},120)
 local f=c:foreign('B');assert(#f==2);local byId={};for _,e in ipairs(f)do byId[e.target.id]=e end;assert(byId.A and byId.folder and byId.folder.recursive and not byId.A.recursive and byId.B==nil)
 assert(#c:foreign('Z')==3)end)
test('Source exige leitura previa',function()local c=new();denied('READ_REQUIRED',function()c:checkVersion('A',a,'v1',nil,true)end)end)
test('unlock nao apaga marca stale',function()local c=new();c:read('A',a,'v1');c:release('A',{},true);denied('STALE_REVISION',function()c:checkVersion('A',a,'v2',nil,true)end)end)
test('expectedRevision e releitura controlam versao',function()local c=new();local rev=c:read('A',a,'v1');assert(c:checkVersion('B',a,'v1',rev,true)==rev);c:read('A',a,'v2');c:checkVersion('A',a,'v2',nil,true);denied('STALE_REVISION',function()c:checkVersion('A',a,'v2',rev,true)end)end)
test('revision independe de resolucao do relogio',function()local c=new();assert(c:version(a,'v1')~=c:version(a,'v2'))end)
test('agent_close libera e invalida leitura',function()local c=new();c:read('A',a,'v1');c:reserve('A',{p(a,'read')},120);assert(c:close('A').closed);denied('READ_REQUIRED',function()c:checkVersion('A',a,'v1',nil,true)end)end)
test('configuracao nao desativa protecao',function()local c=new();c:configure({readGraceSeconds=0,maxManualSeconds=10000});assert(c.config.readGraceSeconds==1 and c.config.maxManualSeconds==900)end)
test('renomear preserva identidade da trava',function()local c=new();c:reserve('A',{p(a,'write')},120);a.name='Renamed';assert(c:list().locks[1].target=='A' and c:list().locks[1].path=='Renamed');a.name=nil end)
test('alvo destruido remove reserva',function()local c=new();local x={id='X',parent=root};c:reserve('A',{p(x,'read')},120);x.dead=true;c:gc();assert(c:summary().locks==0)end)
print('CONTROLE: '..passed..' testes aprovados')
