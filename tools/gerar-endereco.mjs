import {randomBytes} from 'node:crypto';
const base=process.argv[2];
if(!base){console.error('Uso: npm run url -- https://SEU-WORKER.workers.dev');process.exit(1);}
const url=new URL(base);if(url.protocol!=='https:'){console.error('Use HTTPS.');process.exit(1);}
const session=randomBytes(9).toString('base64url'),token=randomBytes(24).toString('base64url');
console.log('Guarde em local privado: estas URLs sao credenciais de plugin.');
console.log('MCP:   '+url.origin+'/mcp/'+session+'/'+token);
console.log('Ponte: '+url.origin+'/ponte/'+session+'/'+token);
console.log('Use agent_open para cada agente; o plugin compartilha a mesma URL-base.');
