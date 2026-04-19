module.exports = {
  apps: [
    {
      name: "ai-office",
      script: "npx",
      args: "next start -p 3100",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
    },
    {
      name: "ai-office-ws",
      script: "worker/ws-server.js",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
    },
    {
      name: "ai-office-telegram",
      script: "scripts/telegram-bot.js",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
    },
  ],
};
