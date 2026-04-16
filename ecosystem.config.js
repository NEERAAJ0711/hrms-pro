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
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      watch: false,
      max_memory_restart: "500M",
      error_file: "/var/log/hrms-pro/error.log",
      out_file: "/var/log/hrms-pro/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
