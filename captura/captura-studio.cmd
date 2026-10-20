@echo off
setlocal

set "URL=%~1"
if "%URL%"=="" set /p URL=Cole a URL do MCP (https://.../mcp/SESSAO/TOKEN):
if "%URL%"=="" (
  echo URL nao informada.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0captura-studio.ps1" -Url "%URL%"
pause
