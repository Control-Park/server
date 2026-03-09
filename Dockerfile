# ---- Build stage ----
FROM node:20-slim AS builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-slim AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci

ENV NODE_ENV=production

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

EXPOSE 9001

# Env vars should be injected at runtime via docker run -e or docker compose.
# If a .env file is mounted at /app/.env, dotenv will load it automatically.
CMD ["node", "dist/src/index.js"]
