# syntax=docker/dockerfile:1

# ----------------------------------------------------------------------------
# Stage 1: dependencies (with dev deps for build)
# ----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# ----------------------------------------------------------------------------
# Stage 2: build
# ----------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# ----------------------------------------------------------------------------
# Stage 3: runtime (minimal, non-root)
# ----------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl dumb-init \
  && addgroup -g 1001 nodejs \
  && adduser -S -u 1001 -G nodejs nestjs

COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs
EXPOSE 3000

# Apply migrations on boot, then start. Migrations are idempotent (deploy).
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
