# HRMS Pro — Deployment Guide (Hostinger VPS)

## Architecture

```
GitHub (source code)
    │
    ▼
GitHub Actions (CI/CD pipeline)
    │  ├── CI: TypeScript check + build (every push)
    │  └── CD: Auto-deploy to Hostinger VPS (push to main)
    ▼
Hostinger VPS
    ├── Nginx (port 80/443 — reverse proxy)
    ├── Node.js / PM2 (port 5000 — app server)
    └── PostgreSQL 16 (database)
```

---

## Step 1 — First-Time Hostinger VPS Setup

SSH into your Hostinger VPS as root, then run the setup script:

```bash
# Upload setup script
scp hostinger-setup.sh root@YOUR_VPS_IP:/tmp/

# SSH into server and run it
ssh root@YOUR_VPS_IP
chmod +x /tmp/hostinger-setup.sh
bash /tmp/hostinger-setup.sh
```

The script automatically installs:
- Node.js 20
- PostgreSQL 16 (creates `hrms_pro` database)
- PM2 (process manager)
- Nginx (reverse proxy)
- System libraries for face recognition (cairo, pango, etc.)

At the end, it prints your `DATABASE_URL` — **save it**.

---

## Step 2 — Add GitHub Secrets

In your GitHub repo go to:
**Settings → Secrets and variables → Actions → New repository secret**

Add these secrets:

| Secret Name | Value |
|---|---|
| `HOSTINGER_HOST` | Your VPS IP address (e.g. `123.45.67.89`) |
| `HOSTINGER_USERNAME` | `root` (or your SSH user) |
| `HOSTINGER_SSH_KEY` | Your **private** SSH key (contents of `~/.ssh/id_rsa`) |
| `HOSTINGER_PORT` | `22` |
| `DATABASE_URL` | From the setup script output |
| `SESSION_SECRET` | Any 32+ char random string |
| `JWT_SECRET` | Any 32+ char random string |

### How to generate your SSH key pair:

```bash
# On your LOCAL machine
ssh-keygen -t rsa -b 4096 -C "hrms-deploy" -f ~/.ssh/hrms_deploy

# Copy PUBLIC key to your Hostinger VPS
ssh-copy-id -i ~/.ssh/hrms_deploy.pub root@YOUR_VPS_IP

# Add PRIVATE key to GitHub Secrets (HOSTINGER_SSH_KEY)
cat ~/.ssh/hrms_deploy
```

---

## Step 3 — Push GitHub Actions Workflows

The workflow files are in `.github/workflows/` in your project.
Push them to GitHub using Replit's Git panel (sidebar → Git icon):

1. Open the **Git** tab in Replit's left sidebar
2. You'll see `.github/workflows/ci.yml` and `deploy-hostinger.yml` as new files
3. Write commit message: `ci/cd: add GitHub Actions workflows`
4. Click **Commit & Push**

This triggers the CI pipeline immediately.

---

## Step 4 — Configure Nginx Domain

On your Hostinger VPS, update the Nginx config with your domain:

```bash
nano /etc/nginx/sites-available/hrms-pro
# Replace YOUR_DOMAIN_OR_VPS_IP with your actual domain or IP

nginx -t && systemctl reload nginx
```

### For HTTPS (SSL) with your domain:

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## Step 5 — Deploy

Every push to the `main` branch now auto-deploys:

```
git push origin main
    │
    ├── GitHub Actions runs CI (build + type check)
    │   └── If CI passes → triggers CD
    │
    └── CD SSHs into Hostinger VPS
        ├── Uploads build package
        ├── Installs production dependencies
        ├── Runs DB migrations
        └── PM2 reload (zero-downtime restart)
```

---

## Manual Deploy (Emergency)

To trigger a deploy without a code push:

1. Go to GitHub → Actions tab
2. Select **"CD — Deploy to Hostinger VPS"**
3. Click **"Run workflow"** → Enter reason → **Run**

---

## Monitoring on VPS

```bash
# View live logs
pm2 logs hrms-pro

# View app status
pm2 status

# Restart manually
pm2 reload hrms-pro

# View Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# View app error logs
tail -f /var/log/hrms-pro/error.log
```

---

## Environment Variables on VPS

All env vars are in `/var/www/hrms-pro/.env`

```bash
nano /var/www/hrms-pro/.env
```

After editing, restart the app:

```bash
pm2 reload hrms-pro
```

---

## Rollback

If a deployment breaks the app, rollback instantly:

```bash
# On Hostinger VPS — list backups
ls /var/www/hrms-pro-backup-*

# Restore a backup
cp -r /var/www/hrms-pro-backup-20240115120000/* /var/www/hrms-pro/
pm2 reload hrms-pro
```
