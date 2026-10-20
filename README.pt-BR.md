# Roblox Studio MCP

[Read in English](README.md)

O Roblox Studio MCP conecta agentes de IA a um Roblox Studio aberto no seu computador. Ele tem duas partes. Uma é um Worker do Cloudflare que fala MCP e guarda cada sessão num Durable Object. A outra é um plugin do Studio chamado MCP Studio, que se conecta ao Worker e executa cada pedido dentro do Studio com permissão de plugin. Ele foi feito primeiro para ser usado com os agentes do Notion, mas funciona com qualquer cliente MCP, e agentes que só têm terminal podem abrir o endereço e receber um cliente de linha de comando pronto em Python ou Bash.

São cerca de quarenta ferramentas. O agente consegue ler a árvore do explorer, procurar e inspecionar instâncias, criar, alterar, mover, duplicar e apagar, ler e editar scripts com busca e resumo da estrutura para economizar contexto, rodar código Luau, controlar a seleção, buscar na Toolbox e inserir modelos, iniciar e parar o Play, ler os logs da saída e tirar print da janela do Studio. Ele também conversa com os meus outros plugins, o ImportMCP para importar imagens e modelos e o LiveSession para rodar o jogo no modo de edição.

Uma sessão aceita vários Studios abertos ao mesmo tempo, cada um com um apelido curto, e vários agentes podem trabalhar juntos, cada um com a sua identidade e com travas de arquivo para dois agentes não editarem o mesmo script ao mesmo tempo. As alterações ficam registradas no histórico de desfazer do Studio.

## Como usar

Você precisa do Node.js 20 ou mais novo e de uma conta no Cloudflare. Rode npm install e depois npm run deploy para publicar o Worker com o Wrangler. Com o endereço do seu Worker em mãos, rode npm run url -- https://seu-worker.workers.dev para gerar os seus endereços privados do MCP e da ponte. Trate esses endereços como senhas.

O plugin já compilado fica na pasta plugin com o nome MCPStudioNotion.rbxmx. Copie esse arquivo para a pasta de plugins do Studio, abra o plugin, cole o endereço do MCP e clique em Conectar. Depois adicione o mesmo endereço do MCP no seu cliente de IA.

Os prints no Windows usam o script de PowerShell da pasta captura, que captura a janela do Studio e envia para a sessão. Se você mudar o código do plugin, o npm run build gera o arquivo do plugin de novo, e o npm run test:all compila, confere e roda todos os testes, incluindo os de Lua.

## Tempo de desenvolvimento

O Roblox Studio MCP levou um mês para ser feito e está pronto para uso.
