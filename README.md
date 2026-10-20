# Roblox Studio MCP

[Leia em português](README.pt-BR.md)

Roblox Studio MCP connects AI agents to a Roblox Studio that is open on your computer. It has two parts. One is a Cloudflare Worker that speaks MCP and keeps each session in a Durable Object. The other is a Studio plugin called MCP Studio, which connects to the Worker and runs each request inside Studio with plugin permissions. It was first made to be used with Notion agents, but it works with any MCP client, and agents that only have a terminal can open the address and get a ready to use command line client in Python or Bash.

There are around forty tools. The agent can read the explorer tree, find and inspect instances, create, change, move, duplicate and delete them, read and edit scripts with search and a structure outline to save context, run Luau code, control the selection, search the Toolbox and insert models, start and stop Play, read the output logs and take screenshots of the Studio window. It also talks to my other plugins, ImportMCP for importing images and models and LiveSession for running the game in edit mode.

One session can hold several Studios open at the same time, each with a short alias, and several agents can work together, each with its own identity and with file locks so two agents do not edit the same script at once. Changes are recorded in the Studio undo history.

## How to use

You need Node.js 20 or newer and a Cloudflare account. Run npm install and then npm run deploy to publish the Worker with Wrangler. With the address of your Worker in hand, run npm run url -- https://your-worker.workers.dev to generate your private MCP and bridge addresses. Treat them like passwords.

The built plugin is already in the plugin folder as MCPStudioNotion.rbxmx. Copy it into the Studio plugins folder, open the plugin in Studio, paste the MCP address and click Connect. Then add the same MCP address to your AI client.

Screenshots on Windows use the PowerShell script in the captura folder, which captures the Studio window and sends it to the session. If you change the plugin source, npm run build generates the plugin file again, and npm run test:all builds, checks and runs every test, including the Lua ones.

## Development time

Roblox Studio MCP took one month to build and it is ready to use.
