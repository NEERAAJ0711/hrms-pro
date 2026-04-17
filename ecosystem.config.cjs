module.exports = {
  apps: [
    {
      name: "hrms-pro",
      script: "dist/index.cjs",
      instances: "max",
      exec_mode: "cluster",
      node_args: "--max-old-space-size=512",
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      },
      watch: false,
      max_memory_restart: "500M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
