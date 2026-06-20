#!/usr/bin/env bash

  set -e

  # ── Decode secrets ────────────────────────────────────────────────
  ENV_FILE="$(mktemp)"
  chmod 600 "$ENV_FILE"
  trap 'rm -f "$ENV_PAYLOAD" "$ENV_FILE"' EXIT
  if [ ! -f "$ENV_PAYLOAD" ]; then
    echo "❌ Env payload missing at $ENV_PAYLOAD"; exit 1
  fi
  base64 -d "$ENV_PAYLOAD" > "$ENV_FILE"
  rm -f "$ENV_PAYLOAD"
  set -a; . "$ENV_FILE"; set +a
  rm -f "$ENV_FILE"
  trap - EXIT

  # ── Paths ────────────────────────────────────────────────────────
  # Deploy to $HOME/hrms-app — NOT htdocs/ which is owned by the
  # web server user and not writable by the SSH deploy user.
  # nginx proxies to port 8080 regardless of where files live.
  APP_DIR="$HOME/hrms-app"
  BACKUP_DIR="$HOME/hrms-app-backup-$(date +%Y%m%d%H%M%S)"

  echo "▶ Deploying as: $(whoami)"
  echo "▶ App directory: $APP_DIR"

  # ── Add nvm node to PATH early ────────────────────────────────────
  NVM_NODE=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)
  [ -n "$NVM_NODE" ] && export PATH="$HOME/.nvm/versions/node/$NVM_NODE/bin:$PATH"
  command -v npm || { echo "❌ npm not found — install Node.js first"; exit 1; }

  # ── Rescue node_modules from previous deploy ──────────────────────
  # @tensorflow/tfjs-node downloads a 344 MB native binary on first install.
  # Moving node_modules instead of re-extracting avoids ENOSPC errors.
  SAVED_NM=""
  if [ -d "$APP_DIR/node_modules" ]; then
    SAVED_NM="$HOME/hrms-nm-rescue-$(date +%s)"
    echo "▶ Saving node_modules → $SAVED_NM"
    mv "$APP_DIR/node_modules" "$SAVED_NM"
  fi

  # ── Purge old backups NOW to free disk before extract ─────────────
  ls -dt "$HOME"/hrms-app-backup-* 2>/dev/null | tail -n +2 | xargs rm -rf 2>/dev/null || true
  ls -dt "$HOME"/hrms-pro-backup-* 2>/dev/null | xargs rm -rf 2>/dev/null || true
  npm cache clean --force 2>/dev/null || true

  # ── Backup by moving the whole dir ───────────────────────────────
  if [ -d "$APP_DIR" ]; then
    mv "$APP_DIR" "$BACKUP_DIR"
    echo "▶ Backup moved to: $BACKUP_DIR"
  fi

  # ── Extract new build into a fresh directory ──────────────────────
  mkdir -p "$APP_DIR"
  tar -xzf "$DEPLOY_TAR" -C "$APP_DIR"
  rm -f "$DEPLOY_TAR"
  echo "▶ Build extracted to $APP_DIR"

  # ── Restore rescued node_modules ──────────────────────────────────
  if [ -n "$SAVED_NM" ] && [ -d "$SAVED_NM" ]; then
    echo "▶ Restoring node_modules from rescue copy"
    mv "$SAVED_NM" "$APP_DIR/node_modules"
  fi

  # ── Write .env ────────────────────────────────────────────────────
  {
    printf 'DATABASE_URL=%s\n'   "$DATABASE_URL"
    printf 'SESSION_SECRET=%s\n' "$SESSION_SECRET"
    printf 'JWT_SECRET=%s\n'     "$JWT_SECRET"
    printf 'NODE_ENV=production\n'
    printf 'PORT=8080\n'
    printf 'GIT_COMMIT=%s\n'     "${GIT_COMMIT:-unknown}"
    printf 'BUILD_TIME=%s\n'     "${BUILD_TIME:-unknown}"
  } > "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "▶ .env written"

  # ── Check disk space ──────────────────────────────────────────────
  AVAIL_KB=$(df -k "$HOME" | awk 'NR==2{print $4}')
  echo "▶ Disk available: $((AVAIL_KB/1024)) MB"
  if [ "$AVAIL_KB" -lt 262144 ]; then   # less than 256 MB
    echo "❌ Not enough disk space ($((AVAIL_KB/1024)) MB) even after cleanup. SSH in and free space."; exit 1
  fi

  # ── Install production dependencies ───────────────────────────────
  # Use npm install (not npm ci) so pre-existing packages are reused.
  # npm ci would wipe node_modules and re-download everything (→ ENOSPC).
  cd "$APP_DIR"
  npm install --omit=dev --prefer-offline 2>&1 | tail -20
  echo "▶ Dependencies installed"

  # ── Install Playwright Chromium browser ───────────────────────────
  # Required by EPFO/ESIC automation.
  # The deploy user has no sudo, so system library deps must be
  # pre-installed by root using:
  #   playwright install-deps chromium
  # (see queue-worker.ts error message for the exact command).
  npx playwright install chromium
  CHROMIUM_BIN=$(find "$HOME/.cache/ms-playwright" -type f -name "chrome" 2>/dev/null \
                 | sort -r | head -1 || true)
  if [ -n "$CHROMIUM_BIN" ] && [ -x "$CHROMIUM_BIN" ]; then
    # Remove stale entry, write fresh path
    sed -i '/^PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/d' "$APP_DIR/.env" 2>/dev/null || true
    printf 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=%s\n' "$CHROMIUM_BIN" >> "$APP_DIR/.env"
    echo "▶ Playwright Chromium at: $CHROMIUM_BIN"
    # Self-test: binary prints "Chromium X.Y.Z" on success
    CHROME_VER=$("$CHROMIUM_BIN" --version 2>&1 || true)
    if echo "$CHROME_VER" | grep -qiE "^Chromium |^Google Chrome "; then
      echo "▶ Binary OK: $CHROME_VER"
    else
      echo "⚠️  Binary cannot execute (missing system libs)."
      echo "    As root on the VPS run:"
      echo "    export PATH=\"\$HOME/.nvm/versions/node/\$(ls \$HOME/.nvm/versions/node | tail -1)/bin:\$PATH\""
      echo "    cd $APP_DIR && node_modules/.bin/playwright install-deps chromium"
      echo "    su - workeazy-hrms -c 'pm2 restart hrms-pro --update-env'"
    fi
  else
    echo "⚠️  Chromium binary not found after install"
    find "$HOME/.cache/ms-playwright" 2>/dev/null | head -20 || echo "(ms-playwright cache empty)"
  fi

  # ── Run database migrations ───────────────────────────────────────
  node scripts/run-migrations.cjs
  echo "▶ Migrations done"

  # ── Free port 8080 ────────────────────────────────────────────────
  # Kill any orphaned process holding 8080 (e.g. old node apps,
  # failed deploys, other PM2 instances from a different user).
  OLD_PID=$(ss -tlnp 2>/dev/null | grep ':8080 ' | grep -oP 'pid=\K[0-9]+' | head -1 || true)
  if [ -n "$OLD_PID" ]; then
    echo "▶ Killing process $OLD_PID on port 8080"
    kill -9 "$OLD_PID" 2>/dev/null || true
    sleep 2
  fi
  # Belt-and-suspenders: fuser if available
  fuser -k 8080/tcp 2>/dev/null || true

  # ── Restart with PM2 ──────────────────────────────────────────────
  command -v pm2 || npm install -g pm2
  pm2 delete hrms-pro 2>/dev/null || true
  sleep 2
  pm2 start ecosystem.config.cjs --update-env
  pm2 save
  echo "▶ PM2 restarted"

  # ── Health check ──────────────────────────────────────────────────
  sleep 5
  UP=0
  for i in $(seq 1 12); do
    if curl -fsS "http://127.0.0.1:8080/api/version" > /tmp/ver.json 2>/dev/null; then
      echo "✅ Server is up on port 8080:"
      cat /tmp/ver.json; echo
      UP=1; break
    fi
    echo "  waiting... ($i/12)"
    sleep 5
  done

  if [ "$UP" != "1" ]; then
    echo "❌ Server did not come up on port 8080 — PM2 logs:"
    pm2 logs hrms-pro --lines 50 --nostream || true
    exit 1
  fi

  # ── PM2 status ────────────────────────────────────────────────────
  echo "=== PM2 STATUS ==="
  pm2 list

  # ── Ensure nginx proxy_pass → port 8080 for tbjvisionconnect.com ──
  # Config lives at /etc/nginx/sites-enabled/hrms.workeazy.in.conf
  # (server_name tbjvisionconnect.com, proxies to 8080)
  DOMAIN="tbjvisionconnect.com"
  NGINX_CONF=$(grep -rl "$DOMAIN" /etc/nginx/sites-enabled /etc/nginx/sites-available 2>/dev/null \
               | grep -v "\.bak" | head -1 || true)

  if [ -n "$NGINX_CONF" ]; then
    echo "=== FOUND CONFIG: $NGINX_CONF ==="
    if ! grep -q "8080" "$NGINX_CONF"; then
      echo "▶ proxy_pass not pointing to 8080 — fixing..."
      cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%s)"
      sed -i 's|proxy_pass http://127\.0\.0\.1:[0-9]*/;|proxy_pass http://127.0.0.1:8080/;|g' "$NGINX_CONF"
      if nginx -t 2>&1; then
        systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
        echo "▶ nginx reloaded"
      else
        echo "❌ nginx config test failed — restoring backup"
        cp "${NGINX_CONF}.bak."* "$NGINX_CONF" 2>/dev/null || true
      fi
    else
      echo "▶ proxy_pass already points to 8080 — OK"
    fi
  else
    echo "⚠️  No nginx config found for $DOMAIN — check /etc/nginx/sites-enabled/ manually"
    ls /etc/nginx/sites-enabled/ 2>/dev/null || true
  fi

  # ── Clean old backups ─────────────────────────────────────────────
  ls -dt "$HOME"/hrms-pro-backup-* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true

  echo "✅ Deployment complete!"
