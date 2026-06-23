@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  web-search-mcp :: 1-Click Install
echo ============================================
echo.

:: ── 0. Check Node.js ──
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Download from https://nodejs.org/ and install Node.js 18+ before running this script.
    pause
    exit /b 1
)

:: ── 1. Clean old build artifacts and dependencies ──
echo [0/5] Cleaning old build artifacts...
if exist "node_modules\" rd /s /q "node_modules" 2>nul
if exist "dist\" rd /s /q "dist" 2>nul
if exist ".pnpm-store\" rd /s /q ".pnpm-store" 2>nul
if exist "package-lock.json" del /f /q "package-lock.json" 2>nul
echo       Old files removed.

:: ── 2. Ensure pnpm is available ──
where pnpm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [1/5] Installing pnpm@11.5.1...
    call npm install -g pnpm@11.5.1
    if %ERRORLEVEL% neq 0 goto :error
) else (
    echo [1/5] pnpm already installed.
)

:: ── 3. Install Node dependencies ──
echo [2/5] Installing dependencies...
call pnpm install --frozen-lockfile
if %ERRORLEVEL% neq 0 goto :error

:: ── 4. Install Playwright Chromium ──
echo [3/5] Installing Playwright Chromium...
call pnpx playwright install chromium
if %ERRORLEVEL% neq 0 goto :error

:: ── 5. Build TypeScript ──
echo [4/5] Building TypeScript...
call pnpm run build
if %ERRORLEVEL% neq 0 goto :error

echo.
echo ============================================
echo  INSTALL COMPLETE
echo ============================================
echo.
echo Run the server:
echo   node dist\index.js
echo.
echo Or configure in MCP client:
echo   {
echo     "mcpServers": {
echo       "web-search": {
echo         "command": "node",
echo         "args": ["%CD:\=\\%\\dist\\index.js"]
echo       }
echo     }
echo   }
echo.

pause
exit /b 0

:error
echo.
echo ============================================
echo  INSTALL FAILED
echo ============================================
echo Check the error messages above.
echo.
echo Troubleshooting:
echo   1. Ensure Node.js 18+ is installed: node --version
echo   2. Try running as Administrator
echo   3. Check your internet connection
echo.
pause
exit /b 1
