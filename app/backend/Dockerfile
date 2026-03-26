# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json .
RUN npm install --production

# ── Stage 2: Run ───────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy deps from builder
COPY --from=builder /app/node_modules ./node_modules
COPY server.js .
COPY package.json .

# Non-root user for security
RUN addgroup -S bda && adduser -S bda -G bda
USER bda

EXPOSE 3000

CMD ["node", "server.js"]
