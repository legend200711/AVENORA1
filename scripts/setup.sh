#!/usr/bin/env bash
# ============================================================
# LEGEND UNIVERSE — Setup Script
# Installs dependencies, creates .env from example, and
# gives you the commands to run the project locally.
# ============================================================

set -e

RESET="\033[0m"
BOLD="\033[1m"
BLUE="\033[34m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"

info()    { echo -e "${BLUE}[LU]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[!]${RESET} $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }

# ── Check prerequisites ─────────────────────────────────────
command -v node >/dev/null 2>&1 || error "Node.js is required (v18+). Install from https://nodejs.org"
command -v npm  >/dev/null 2>&1 || error "npm is required. Install from https://nodejs.org"

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  error "Node.js 18+ required. Current: $(node --version)"
fi

success "Node.js $(node --version) detected"

# ── Determine script directory ───────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# ── Install backend dependencies ─────────────────────────────
info "Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install --silent
success "Backend dependencies installed"

# ── Create .env from .env.example if missing ─────────────────
if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  warn ".env created from .env.example"
  warn "IMPORTANT: Edit backend/.env and fill in your real values:"
  warn "  - JWT_SECRET (required — use a long random string)"
  warn "  - JWT_REFRESH_SECRET (required — different from JWT_SECRET)"
  warn "  - MONGODB_URI (optional — omit to run without database)"
  echo ""
else
  success ".env already exists — skipping"
fi

# ── Create upload directories ────────────────────────────────
mkdir -p "$BACKEND_DIR/uploads/gallery"
mkdir -p "$BACKEND_DIR/uploads/music"
mkdir -p "$BACKEND_DIR/uploads/videos"
mkdir -p "$BACKEND_DIR/uploads/avatars"
mkdir -p "$BACKEND_DIR/uploads/images"
success "Upload directories created"

# ── Done ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   LEGEND UNIVERSE — Setup Complete! 🌌   ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Start the backend:${RESET}"
echo -e "    cd backend && npm run dev"
echo ""
echo -e "  ${BOLD}Serve the frontend (any static server):${RESET}"
echo -e "    cd frontend && npx serve ."
echo -e "    # OR open frontend/index.html directly in your browser"
echo ""
echo -e "  ${BOLD}Backend API:${RESET}  http://localhost:3001"
echo -e "  ${BOLD}Health check:${RESET} http://localhost:3001/api/health"
echo ""
echo -e "  ${YELLOW}Remember to edit backend/.env with real JWT secrets before production!${RESET}"
echo ""
