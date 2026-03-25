#!/bin/bash
# ═══════════════════════════════════════════════
#  AI Support + CRM SaaS — One-Click Setup
# ═══════════════════════════════════════════════

set -e

echo ""
echo "==========================================="
echo "  AI Support + CRM SaaS — Setup Script"
echo "==========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check prerequisites
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Install it from https://nodejs.org${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Node.js 18+ is required. Current: $(node -v)${NC}"
    exit 1
fi

echo -e "  Node.js: $(node -v) ${GREEN}OK${NC}"
echo -e "  npm: $(npm -v) ${GREEN}OK${NC}"

# Check if Docker is available for PostgreSQL
DOCKER_AVAILABLE=false
if command -v docker &> /dev/null; then
    DOCKER_AVAILABLE=true
    echo -e "  Docker: $(docker --version | cut -d' ' -f3 | tr -d ',') ${GREEN}OK${NC}"
else
    echo -e "  Docker: ${YELLOW}Not found (you'll need local PostgreSQL)${NC}"
fi

# Check .env
echo ""
echo -e "${YELLOW}[2/6] Checking environment...${NC}"

if [ ! -f server/.env ]; then
    echo "  Creating server/.env from .env.example..."
    cp server/.env.example server/.env
    echo -e "  ${YELLOW}IMPORTANT: Edit server/.env and add your GEMINI_API_KEY${NC}"
else
    echo -e "  server/.env exists ${GREEN}OK${NC}"
fi

# Start PostgreSQL
echo ""
echo -e "${YELLOW}[3/6] Starting PostgreSQL...${NC}"

if [ "$DOCKER_AVAILABLE" = true ]; then
    # Check if postgres container is already running
    if docker ps --format '{{.Names}}' | grep -q 'ai-support-saas.*postgres'; then
        echo -e "  PostgreSQL container already running ${GREEN}OK${NC}"
    else
        echo "  Starting PostgreSQL via Docker..."
        docker-compose up postgres -d
        echo "  Waiting for PostgreSQL to be ready..."
        sleep 3
        echo -e "  PostgreSQL started ${GREEN}OK${NC}"
    fi
else
    echo -e "  ${YELLOW}Skipping Docker — ensure PostgreSQL is running at localhost:5432${NC}"
    echo -e "  ${YELLOW}Database 'ai_support_saas' must exist${NC}"
fi

# Install dependencies
echo ""
echo -e "${YELLOW}[4/6] Installing dependencies...${NC}"

echo "  Installing root dependencies..."
npm install --silent 2>/dev/null

echo "  Installing server dependencies..."
cd server && npm install --silent 2>/dev/null

echo "  Installing client dependencies..."
cd ../client && npm install --silent 2>/dev/null

cd ..
echo -e "  All dependencies installed ${GREEN}OK${NC}"

# Database setup
echo ""
echo -e "${YELLOW}[5/6] Setting up database...${NC}"

cd server

echo "  Generating Prisma client..."
npx prisma generate 2>/dev/null

echo "  Running migrations..."
npx prisma migrate dev --name init --skip-generate 2>/dev/null || npx prisma db push 2>/dev/null

echo "  Seeding sample data..."
npx prisma db seed

cd ..
echo -e "  Database ready ${GREEN}OK${NC}"

# Done
echo ""
echo -e "${YELLOW}[6/6] Setup complete!${NC}"
echo ""
echo "==========================================="
echo -e "  ${GREEN}READY TO RUN${NC}"
echo "==========================================="
echo ""
echo "  Start the application:"
echo "    npm run dev"
echo ""
echo "  Then open:"
echo "    http://localhost:5173"
echo ""
echo "  Login credentials:"
echo "    admin@acme.com  / admin123  (Admin)"
echo "    priya@acme.com  / agent123  (Agent)"
echo "    rahul@acme.com  / agent123  (Agent)"
echo "    viewer@acme.com / viewer123 (Viewer)"
echo ""
echo "==========================================="
echo ""
