@echo off
cd /d "%~dp0"
setlocal

REM Cargar API key
set MINIMAX_API_KEY=
for /f "delims=" %%i in (..\..\minimaxapi.txt) do set MINIMAX_API_KEY=%%i

REM Si es enhanced mode
if "%~1"=="--enhanced" (
    python vision_enhanced.py %*
    exit /b
)

REM Modo original via MCP
node vision_mcp.js %*
