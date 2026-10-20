import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let src=fs.readFileSync(path.join(root,'plugin/src/plugin.template.lua'),'utf8');
for(const [key,file]of Object.entries({CONTROLE:'controle.lua',RUN_LUAU:'run-luau.lua',INTEGRACAO:'integracao.lua',INSPECAO:'inspecao.lua',IMPORTMCP:'importmcp.lua',LIVESESSION:'livesession.lua',TESTE:'teste.lua',EXPORTAR:'exportar.lua',REDE:'rede.lua',RELAY:'relay.lua'})){
 const marker=`__MCP_MODULE_${key}__()`;if(src.split(marker).length!==2)throw new Error('Marcador invalido: '+marker);
 src=src.replace(marker,()=>fs.readFileSync(path.join(root,'plugin/src',file),'utf8'));
}
if(src.includes('__MCP_MODULE_'))throw new Error('Bundle incompleto');
fs.writeFileSync(path.join(root,'plugin/MCPStudioNotion.server.lua'),src);
const body=src.replaceAll(']]>',']]]]><![CDATA[>');
const xml=`<?xml version="1.0" encoding="utf-8"?>
<roblox version="4"><External>null</External><External>nil</External><Item class="Script" referent="RBX0"><Properties><string name="Name">MCPStudioNotion</string><bool name="Disabled">false</bool><ProtectedString name="Source"><![CDATA[${body}]]></ProtectedString></Properties></Item></roblox>
`;
fs.writeFileSync(path.join(root,'plugin/MCPStudioNotion.rbxmx'),xml);
console.log('Plugin Lua e RBXMX gerados do mesmo fonte.');
