#!/usr/bin/env bash
# configure-nginx-iclock.sh
# Patches Nginx on Hostinger so ZKTeco ADMS requests work on BOTH:
#   http://hrms.tbjvisionconnect.com/iclock/cdata  (domain, port 80)
#   http://31.97.207.109/iclock/cdata              (raw IP, port 80)
# Safe to run multiple times — idempotent.

set -e

DOMAIN="hrms.tbjvisionconnect.com"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Resolve app port — prefer persisted port, fall back to 8080 (CloudPanel default).
if [ -f "$HOME/.hrms-pro.port" ]; then
  APP_PORT=$(cat "$HOME/.hrms-pro.port" 2>/dev/null | tr -dc '0-9')
fi
APP_PORT="${APP_PORT:-8080}"
echo "▶ configure-nginx-iclock: app port = $APP_PORT"

# ──────────────────────────────────────────────────────────────────────────────
# Part 1: Patch the domain's port-80 server block (HTTPS redirect bypass)
# ──────────────────────────────────────────────────────────────────────────────
CONF_FILE=""
CONF_FILE=$(nginx -T 2>/dev/null | grep -B5 "$DOMAIN" | grep "# configuration file" | head -1 | awk '{print $NF}' | tr -d ':' || true)

if [ -z "$CONF_FILE" ] || [ ! -f "$CONF_FILE" ]; then
  for CANDIDATE in \
    "/etc/nginx/sites-enabled/${DOMAIN}.conf" \
    "/etc/nginx/sites-enabled/${DOMAIN}" \
    "/etc/nginx/conf.d/${DOMAIN}.conf" \
    "/etc/nginx/vhosts.d/${DOMAIN}.conf"; do
    if [ -f "$CANDIDATE" ]; then
      CONF_FILE="$CANDIDATE"
      break
    fi
  done
fi

if [ -n "$CONF_FILE" ] && [ -f "$CONF_FILE" ]; then
  echo "▶ Found domain Nginx config: $CONF_FILE"
  if grep -q "location /iclock/" "$CONF_FILE"; then
    sed -i "s|proxy_pass http://localhost:[0-9]*/iclock/\?;|proxy_pass http://localhost:${APP_PORT}/iclock/;|g" "$CONF_FILE" 2>/dev/null || true
    echo "✅ /iclock/ block already in domain config — port updated to $APP_PORT"
  else
    cp "$CONF_FILE" "${CONF_FILE}.bak-$(date +%Y%m%d%H%M%S)"
    python3 - "$CONF_FILE" "$APP_PORT" << 'PYEOF'
import sys, re

conf_path = sys.argv[1]
app_port  = sys.argv[2]

iclock_block = f"""
    # ZKTeco ADMS — must NOT redirect to HTTPS; device only speaks plain HTTP
    location /iclock/ {{
        proxy_pass         http://localhost:{app_port}/iclock/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }}
"""

with open(conf_path, 'r') as f:
    content = f.read()

patched = re.sub(
    r'(listen\s+80\b[^}]*?)([ \t]*return\s+301\b)',
    lambda m: m.group(1) + iclock_block + m.group(2),
    content, count=1, flags=re.DOTALL
)
if patched == content:
    patched = content.replace('return 301', iclock_block + '    return 301', 1)

with open(conf_path, 'w') as f:
    f.write(patched)

print(f"✅ Patched {conf_path} with /iclock/ proxy_pass to port {app_port}")
PYEOF
  fi
else
  echo "⚠️  Could not find domain Nginx config — skipping domain patch"
  echo "   Manual fix: add inside port-80 server block for ${DOMAIN}:"
  echo "   location /iclock/ { proxy_pass http://localhost:${APP_PORT}/iclock/; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; }"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Part 2: Install raw-IP server block so http://31.97.207.109/iclock/ works
# This is the block ZKTeco devices use when configured with an IP address.
# ──────────────────────────────────────────────────────────────────────────────
IP_CONF="/etc/nginx/conf.d/adms-ip.conf"

if [ -f "$IP_CONF" ]; then
  # Already installed — just update the port.
  sed -i "s|proxy_pass http://localhost:[0-9]*/iclock/\?;|proxy_pass http://localhost:${APP_PORT}/iclock/;|g" "$IP_CONF" 2>/dev/null || true
  echo "✅ Raw-IP /iclock/ block already installed — port updated to $APP_PORT"
else
  # Copy the template from the repo and replace the APP_PORT placeholder.
  TEMPLATE="${SCRIPT_DIR}/nginx-adms-ip.conf"
  if [ ! -f "$TEMPLATE" ]; then
    echo "⚠️  Template $TEMPLATE not found — writing inline"
    cat > "$IP_CONF" << NGINXEOF
server {
    listen 80;
    server_name 31.97.207.109 _;

    location /iclock/ {
        proxy_pass         http://localhost:${APP_PORT}/iclock/;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    location / {
        return 301 https://hrms.tbjvisionconnect.com\$request_uri;
    }
}
NGINXEOF
  else
    sed "s/APP_PORT/${APP_PORT}/g" "$TEMPLATE" > "$IP_CONF"
  fi
  echo "✅ Raw-IP ADMS config installed: $IP_CONF"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Reload Nginx
# ──────────────────────────────────────────────────────────────────────────────
echo "▶ Testing Nginx config..."
nginx -t

echo "▶ Reloading Nginx..."
systemctl reload nginx

echo ""
echo "✅ Done. ZKTeco ADMS endpoints are now reachable on:"
echo "   http://${DOMAIN}/iclock/cdata        (via domain)"
echo "   http://31.97.207.109/iclock/cdata    (via raw IP)"
echo "   http://31.97.207.109:8181/iclock/cdata (direct ADMS port, no Nginx)"
