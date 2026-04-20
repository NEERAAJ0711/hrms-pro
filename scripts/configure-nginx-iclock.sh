#!/usr/bin/env bash
# configure-nginx-iclock.sh
# Patches the Nginx config on Hostinger so ZKTeco ADMS requests on port 80
# bypass the HTTPS redirect and proxy directly to the Node.js app.
# Safe to run multiple times — exits 0 immediately if already patched.

set -e

DOMAIN="hrms.tbjvisionconnect.com"

# Resolve app port — prefer the persisted port from a successful deploy,
# fall back to 8080 (the CloudPanel default for this VPS).
if [ -f "$HOME/.hrms-pro.port" ]; then
  APP_PORT=$(cat "$HOME/.hrms-pro.port" 2>/dev/null | tr -dc '0-9')
fi
APP_PORT="${APP_PORT:-8080}"
echo "▶ configure-nginx-iclock: app port = $APP_PORT"

# Find the Nginx config file that owns this domain.
CONF_FILE=$(nginx -T 2>/dev/null | grep -l "server_name" /dev/stdin || true)
CONF_FILE=$(nginx -T 2>/dev/null | grep -B5 "$DOMAIN" | grep "# configuration file" | head -1 | awk '{print $NF}' | tr -d ':')

if [ -z "$CONF_FILE" ] || [ ! -f "$CONF_FILE" ]; then
  # Fallback: search common locations
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

if [ -z "$CONF_FILE" ] || [ ! -f "$CONF_FILE" ]; then
  echo "⚠️  Could not find Nginx config for $DOMAIN — skipping Nginx patch"
  echo "   Manual fix: add this to the port-80 server block in your Nginx config:"
  echo "   location /iclock/ { proxy_pass http://localhost:${APP_PORT}; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; }"
  exit 0
fi

echo "▶ Found Nginx config: $CONF_FILE"

# Already patched?
if grep -q "location /iclock/" "$CONF_FILE"; then
  # Update the proxy_pass port in case the app port changed.
  sed -i "s|proxy_pass http://localhost:[0-9]*/iclock/\?;|proxy_pass http://localhost:${APP_PORT}/;|g" "$CONF_FILE" 2>/dev/null || true
  echo "✅ /iclock/ block already present — port updated to $APP_PORT if needed"
  nginx -t && systemctl reload nginx
  exit 0
fi

# Back up the original config.
cp "$CONF_FILE" "${CONF_FILE}.bak-$(date +%Y%m%d%H%M%S)"

# We need to insert the /iclock/ location block INSIDE the port-80 server block,
# BEFORE the "return 301" line.  Use Python for reliable multi-line editing.
python3 - "$CONF_FILE" "$APP_PORT" << 'PYEOF'
import sys, re

conf_path = sys.argv[1]
app_port  = sys.argv[2]

iclock_block = f"""
    # ZKTeco ADMS — must NOT redirect to HTTPS; device only speaks plain HTTP
    location /iclock/ {{
        proxy_pass http://localhost:{app_port}/iclock/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }}
"""

with open(conf_path, 'r') as f:
    content = f.read()

# Only touch the first server block that listens on port 80.
# Insert our location block just before the "return 301" line.
patched = re.sub(
    r'(listen\s+80\b[^}]*?)([ \t]*return\s+301\b)',
    lambda m: m.group(1) + iclock_block + m.group(2),
    content,
    count=1,
    flags=re.DOTALL
)

if patched == content:
    # Fallback: insert before any "return 301" in the file
    patched = content.replace('return 301', iclock_block + '    return 301', 1)

with open(conf_path, 'w') as f:
    f.write(patched)

print(f"✅ Patched {conf_path} with /iclock/ proxy_pass to port {app_port}")
PYEOF

echo "▶ Testing Nginx config..."
nginx -t

echo "▶ Reloading Nginx..."
systemctl reload nginx

echo "✅ Nginx patched and reloaded. ZKTeco ADMS will now work on port 80."
