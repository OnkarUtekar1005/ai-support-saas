@echo off
REM ═══════════════════════════════════════════════
REM  AI Support + CRM SaaS — Windows Setup Script
REM ═══════════════════════════════════════════════

echo.
echo ===========================================
echo   AI Support + CRM SaaS — Setup Script
echo ===========================================
echo.

REM Check Node.js
echo [1/6] Checking prerequisites...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed. Install from https://nodejs.org
    exit /b 1
)
echo   Node.js: OK
echo   npm: OK

REM Check Docker
where docker >nul 2>nul
if %errorlevel% equ 0 (
    echo   Docker: OK
    set DOCKER_AVAILABLE=1
) else (
    echo   Docker: Not found - you need local PostgreSQL
    set DOCKER_AVAILABLE=0
)

REM Check .env
echo.
echo [2/6] Checking environment...
if not exist "server\.env" (
    echo   Creating server\.env from .env.example...
    copy server\.env.example server\.env >nul
    echo   IMPORTANT: Edit server\.env and add your GEMINI_API_KEY
) else (
    echo   server\.env exists - OK
)

REM Start PostgreSQL
echo.
echo [3/6] Starting PostgreSQL...
if "%DOCKER_AVAILABLE%"=="1" (
    echo   Starting PostgreSQL via Docker...
    docker-compose up postgres -d
    echo   Waiting for PostgreSQL to be ready...
    timeout /t 5 /nobreak >nul
    echo   PostgreSQL started
) else (
    echo   Skipping Docker — ensure PostgreSQL is running at localhost:5432
    echo   Database 'ai_support_saas' must exist
)

REM Install dependencies
echo.
echo [4/6] Installing dependencies...
echo   Installing root dependencies...
call npm install --silent 2>nul

echo   Installing server dependencies...
cd server
call npm install --silent 2>nul

echo   Installing client dependencies...
cd ..\client
call npm install --silent 2>nul

cd ..
echo   All dependencies installed

REM Database setup
echo.
echo [5/6] Setting up database...
cd server

echo   Generating Prisma client...
call npx prisma generate 2>nul

echo   Running migrations...
call npx prisma db push 2>nul

echo   Seeding sample data...
call npx prisma db seed

cd ..
echo   Database ready

REM Done
echo.
echo [6/6] Setup complete!
echo.
echo ===========================================
echo   READY TO RUN
echo ===========================================
echo.
echo   Start the application:
echo     npm run dev
echo.
echo   Then open:
echo     http://localhost:5173
echo.
echo   Login credentials:
echo     admin@acme.com  / admin123  (Admin)
echo     priya@acme.com  / agent123  (Agent)
echo     rahul@acme.com  / agent123  (Agent)
echo     viewer@acme.com / viewer123 (Viewer)
echo.
echo ===========================================
echo.
pause
