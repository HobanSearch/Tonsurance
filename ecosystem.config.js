/**
 * PM2 Ecosystem Configuration for Tonsurance Backend Services
 *
 * Usage:
 *   Start all services:    pm2 start ecosystem.config.js
 *   Stop all services:     pm2 stop ecosystem.config.js
 *   Restart all services:  pm2 restart ecosystem.config.js
 *   View logs:             pm2 logs
 *   Monitor:               pm2 monit
 *
 * Note: This is an alternative to the shell scripts for production-like management
 */

module.exports = {
  apps: [
    {
      name: 'tonsurance-api',
      script: 'dune',
      args: 'exec -- tonsurance-api-v2',
      cwd: './backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 8080,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080,
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_file: './logs/api-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'tonsurance-oracle-keeper',
      script: 'dune',
      args: 'exec -- pricing_oracle_keeper',
      cwd: './backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        UPDATE_INTERVAL: 60,
      },
      env_production: {
        NODE_ENV: 'production',
        UPDATE_INTERVAL: 60,
      },
      error_file: './logs/oracle-error.log',
      out_file: './logs/oracle-out.log',
      log_file: './logs/oracle-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],

  /**
   * Deployment configuration for PM2 deploy
   *
   * Usage:
   *   Setup:   pm2 deploy ecosystem.config.js production setup
   *   Deploy:  pm2 deploy ecosystem.config.js production
   *   Update:  pm2 deploy ecosystem.config.js production update
   */
  deploy: {
    production: {
      user: 'deploy',
      host: ['tonsurance.io'],
      ref: 'origin/main',
      repo: 'git@github.com:HobanSearch/Tonsurance.git',
      path: '/var/www/tonsurance',
      'post-deploy': 'cd backend && dune build && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production',
      },
    },
    staging: {
      user: 'deploy',
      host: ['staging.tonsurance.io'],
      ref: 'origin/develop',
      repo: 'git@github.com:HobanSearch/Tonsurance.git',
      path: '/var/www/tonsurance-staging',
      'post-deploy': 'cd backend && dune build && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging',
      },
    },
  },
};
