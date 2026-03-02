#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────
# OpenKick — Interactive Deployment Script for cyon.ch
# ─────────────────────────────────────────────────
# Builds the project locally and deploys via rsync/scp
# to a cyon.ch shared hosting account.
# ─────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   OpenKick — Deploy to cyon.ch               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── Collect all values upfront ───────────────────

read -rp "SSH user (e.g. salach): " SSH_USER
read -rp "SSH host (e.g. salach.cyon.ch or s056.cyon.net): " SSH_HOST
read -rp "Remote web root path (e.g. /home/salach/public_html/fluegelflitzer): " REMOTE_PATH
read -rp "Subdomain URL (e.g. https://fluegelflitzer.sala.ch): " SITE_URL
read -rp "Node.js port on cyon (e.g. 40001 — pick an unused high port): " NODE_PORT
read -rp "JWT secret for production: " JWT_SECRET
echo ""

# Optional: WAHA / WhatsApp config
read -rp "WAHA URL (leave empty to skip WhatsApp): " WAHA_URL
WAHA_PORT=""
WEBHOOK_URL=""
if [[ -n "$WAHA_URL" ]]; then
  read -rp "WAHA port: " WAHA_PORT
  read -rp "Webhook URL for WAHA (e.g. ${SITE_URL}/api/whatsapp/webhook): " WEBHOOK_URL
fi

# Optional: LLM / Email
read -rp "OpenAI API key (leave empty to skip): " OPENAI_API_KEY
read -rp "SMTP host for email (leave empty to skip): " SMTP_HOST
SMTP_PORT=""
SMTP_USER=""
SMTP_PASS=""
if [[ -n "$SMTP_HOST" ]]; then
  read -rp "SMTP port (e.g. 587): " SMTP_PORT
  read -rp "SMTP user: " SMTP_USER
  read -rsp "SMTP password: " SMTP_PASS
  echo ""
fi

read -rp "CORS origin (default: ${SITE_URL}): " CORS_ORIGIN
CORS_ORIGIN="${CORS_ORIGIN:-$SITE_URL}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SSH:        ${SSH_USER}@${SSH_HOST}"
echo "  Remote:     ${REMOTE_PATH}"
echo "  Site URL:   ${SITE_URL}"
echo "  Node port:  ${NODE_PORT}"
echo "  CORS:       ${CORS_ORIGIN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -rp "Proceed with deployment? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# ─── Step 1: Build frontend ──────────────────────

echo ""
echo "▶ Building frontend..."
cd "$PROJECT_DIR/web"
NEXT_PUBLIC_API_URL="${SITE_URL}" npm run build
echo "  ✓ Frontend built → web/out/"

# ─── Step 2: Build server ────────────────────────

echo ""
echo "▶ Building server..."
cd "$PROJECT_DIR/server"
npm run build
echo "  ✓ Server built → server/dist/"

# ─── Step 3: Generate production .env ─────────────

echo ""
echo "▶ Generating production .env..."
ENV_FILE="$PROJECT_DIR/server/.env.production"
cat > "$ENV_FILE" <<ENVEOF
PORT=${NODE_PORT}
DATABASE_PATH=./data/openkick.db
JWT_SECRET=${JWT_SECRET}
CORS_ORIGIN=${CORS_ORIGIN}
ENVEOF

if [[ -n "$WAHA_URL" ]]; then
  cat >> "$ENV_FILE" <<ENVEOF
WAHA_URL=${WAHA_URL}
WAHA_PORT=${WAHA_PORT}
WEBHOOK_URL=${WEBHOOK_URL}
ENVEOF
fi

if [[ -n "$OPENAI_API_KEY" ]]; then
  echo "OPENAI_API_KEY=${OPENAI_API_KEY}" >> "$ENV_FILE"
fi

if [[ -n "$SMTP_HOST" ]]; then
  cat >> "$ENV_FILE" <<ENVEOF
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
ENVEOF
fi

echo "  ✓ .env.production created"

# ─── Step 4: Create .htaccess for routing ─────────

echo ""
echo "▶ Generating .htaccess..."
HTACCESS_FILE="$PROJECT_DIR/web/out/.htaccess"
cat > "$HTACCESS_FILE" <<'HTEOF'
# OpenKick — Apache config for cyon.ch
# Proxy API requests to the Node.js backend
RewriteEngine On

# Proxy /api/* requests to the Node.js server
RewriteCond %{REQUEST_URI} ^/api/ [NC]
RewriteRule ^api/(.*)$ http://127.0.0.1:NODEPORT/api/$1 [P,L]

# SPA fallback: serve index.html for non-file routes
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]

# Security headers
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set X-XSS-Protection "1; mode=block"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

# Caching for static assets
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType font/woff2 "access plus 1 year"
</IfModule>
HTEOF

# Replace placeholder with actual port
sed -i '' "s/NODEPORT/${NODE_PORT}/g" "$HTACCESS_FILE"
echo "  ✓ .htaccess created with API proxy → port ${NODE_PORT}"

# ─── Step 5: Create Node.js startup script ────────

echo ""
echo "▶ Generating server startup script..."
STARTUP_FILE="$PROJECT_DIR/server/start.sh"
cat > "$STARTUP_FILE" <<STARTEOF
#!/usr/bin/env bash
# OpenKick server — production startup
cd "\$(dirname "\$0")"

# Load production env
export \$(grep -v '^#' .env.production | xargs)

# Ensure data directory exists
mkdir -p data

# Start Node.js server
exec node dist/index.js
STARTEOF
chmod +x "$STARTUP_FILE"
echo "  ✓ start.sh created"

# ─── Step 6: Deploy via rsync ─────────────────────

echo ""
echo "▶ Deploying frontend to ${SSH_HOST}:${REMOTE_PATH}/ ..."
rsync -avz --delete \
  --exclude='.DS_Store' \
  "$PROJECT_DIR/web/out/" \
  "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/"
echo "  ✓ Frontend deployed"

echo ""
echo "▶ Deploying server to ${SSH_HOST}:${REMOTE_PATH}/../openkick-server/ ..."
SERVER_REMOTE="${REMOTE_PATH}/../openkick-server"
ssh "${SSH_USER}@${SSH_HOST}" "mkdir -p ${SERVER_REMOTE}/data"

rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='src' \
  --exclude='.env' \
  --exclude='.env.example' \
  --exclude='data/*.db' \
  "$PROJECT_DIR/server/dist/" \
  "${SSH_USER}@${SSH_HOST}:${SERVER_REMOTE}/dist/"

rsync -avz \
  "$PROJECT_DIR/server/package.json" \
  "$PROJECT_DIR/server/package-lock.json" \
  "$PROJECT_DIR/server/start.sh" \
  "$ENV_FILE" \
  "${SSH_USER}@${SSH_HOST}:${SERVER_REMOTE}/"
echo "  ✓ Server deployed"

# ─── Step 7: Install deps & start on remote ───────

echo ""
echo "▶ Installing production dependencies on remote..."
ssh "${SSH_USER}@${SSH_HOST}" "cd ${SERVER_REMOTE} && npm install --omit=dev"
echo "  ✓ Dependencies installed"

echo ""
echo "▶ Starting server on remote..."
ssh "${SSH_USER}@${SSH_HOST}" "cd ${SERVER_REMOTE} && chmod +x start.sh && nohup ./start.sh > server.log 2>&1 &"
echo "  ✓ Server started on port ${NODE_PORT}"

# ─── Cleanup ──────────────────────────────────────

rm -f "$ENV_FILE"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Deployment complete!                        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Frontend: ${SITE_URL}"
echo "  API:      ${SITE_URL}/api/health"
echo ""
echo "  To check server logs:"
echo "    ssh ${SSH_USER}@${SSH_HOST} 'tail -f ${SERVER_REMOTE}/server.log'"
echo ""
echo "  To restart the server:"
echo "    ssh ${SSH_USER}@${SSH_HOST} 'cd ${SERVER_REMOTE} && pkill -f \"node dist/index.js\" ; nohup ./start.sh > server.log 2>&1 &'"
echo ""
