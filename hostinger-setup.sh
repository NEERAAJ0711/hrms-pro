#!/bin/bash
# =============================================================
# HRMS Pro — Hostinger VPS First-Time Setup Script
# Run this ONCE on your Hostinger VPS as root before deploying
# =============================================================

set -e

echo "======================================"
echo " HRMS Pro — Hostinger VPS Setup"
echo "======================================"

# ── 1. System Update ─────────────────────────────────────────
echo ""
echo "▶ [1/8] Updating system packages..."
apt-get update -y && apt-get upgrade -y

# ── 2. Node.js 20 ────────────────────────────────────────────
echo ""
echo "▶ [2/8] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v && npm -v

# ── 3. PostgreSQL 16 ─────────────────────────────────────────
echo ""
echo "▶ [3/8] Installing PostgreSQL 16..."
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

# Create database and user
DB_PASSWORD=$(openssl rand -hex 16)
sudo -u postgres psql << SQL
CREATE USER hrms_user WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE hrms_pro OWNER hrms_user;
GRANT ALL PRIVILEGES ON DATABASE hrms_pro TO hrms_user;
SQL

echo ""
echo "  ✅ PostgreSQL ready!"
echo "  DATABASE_URL=postgresql://hrms_user:$DB_PASSWORD@localhost:5432/hrms_pro"
echo "  ⚠️  SAVE this DATABASE_URL — you'll need it for GitHub Secrets!"

# ── 4. PM2 Process Manager ───────────────────────────────────
echo ""
echo "▶ [4/8] Installing PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root

# ── 5. Nginx ─────────────────────────────────────────────────
echo ""
echo "▶ [5/8] Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# ── 6. System libs for face recognition ──────────────────────
echo ""
echo "▶ [6/8] Installing system libraries (face recognition)..."
apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  python3 \
  python3-pip

# ── 7. App directory & logs ───────────────────────────────────
echo ""
echo "▶ [7/8] Creating app directories..."
mkdir -p /var/www/hrms-pro
mkdir -p /var/log/hrms-pro
mkdir -p /var/www/hrms-pro/uploads

# ── 8. Nginx configuration ───────────────────────────────────
echo ""
echo "▶ [8/8] Configuring Nginx..."

# Replace YOUR_DOMAIN with actual domain or VPS IP
cat > /etc/nginx/sites-available/hrms-pro << 'NGINX'
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_VPS_IP;

    client_max_body_size 20M;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    # Static assets with caching
    location /assets/ {
        alias /var/www/hrms-pro/dist/public/assets/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Uploaded files
    location /uploads/ {
        alias /var/www/hrms-pro/uploads/;
        expires 7d;
    }

    # API + everything else → Node.js
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/hrms-pro /etc/nginx/sites-enabled/hrms-pro
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── Environment file ─────────────────────────────────────────
echo ""
echo "▶ Creating environment file template..."
cat > /var/www/hrms-pro/.env << ENV
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://hrms_user:$DB_PASSWORD@localhost:5432/hrms_pro
SESSION_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
ENV

echo ""
echo "======================================"
echo " ✅ SETUP COMPLETE!"
echo "======================================"
echo ""
echo " Next steps:"
echo " 1. Add these secrets to GitHub → Settings → Secrets → Actions:"
echo "    HOSTINGER_HOST       = $(curl -s ifconfig.me)"
echo "    HOSTINGER_USERNAME   = root"
echo "    HOSTINGER_SSH_KEY    = (your VPS private SSH key)"
echo "    HOSTINGER_PORT       = 22"
echo "    DATABASE_URL         = postgresql://hrms_user:$DB_PASSWORD@localhost:5432/hrms_pro"
echo "    SESSION_SECRET       = (from /var/www/hrms-pro/.env)"
echo "    JWT_SECRET           = (from /var/www/hrms-pro/.env)"
echo ""
echo " 2. Update YOUR_DOMAIN_OR_VPS_IP in /etc/nginx/sites-available/hrms-pro"
echo ""
echo " 3. For SSL (HTTPS), run:"
echo "    apt install certbot python3-certbot-nginx"
echo "    certbot --nginx -d yourdomain.com"
echo ""
echo " 4. Push code to the main branch on GitHub to trigger auto-deploy!"
echo ""
