# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies required for prisma client generation
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json ./
RUN npm install --legacy-peer-deps

FROM deps AS builder
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
