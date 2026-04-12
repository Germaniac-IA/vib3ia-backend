@echo off
cd /d "%~dp0"
setlocal
set MINIMAX_API_KEY=
for /f "delims=" %%i in (..\..\minimaxapi.txt) do set MINIMAX_API_KEY=%%i
node vision_mcp.js %*
