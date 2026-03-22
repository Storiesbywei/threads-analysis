FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY scripts/ ./scripts/
COPY db/ ./db/

CMD ["node", "scripts/sync-worker.mjs"]
