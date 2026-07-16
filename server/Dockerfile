# Build context is the repository root (see docker-compose.yml)
FROM node:22-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm install

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# SQL bootstrap/migrations/seed (can be bind-mounted over in compose)
COPY db ./db

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
