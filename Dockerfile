FROM node:22-slim AS builder
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx next build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/reports ./reports
RUN npm install --omit=dev node-cron better-sqlite3 bcryptjs discord.js node-telegram-bot-api && apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
CMD ["sh", "-c", "node scripts/init-db.js && node scripts/scheduler.js & sleep 2 && node server.js"]
