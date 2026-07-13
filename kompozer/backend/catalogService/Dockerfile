# syntax=docker/dockerfile:1
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY CATALOG-SEED-TONDO.json ./
COPY CATALOG-SEED-QUADRO.json ./
COPY CATALOG-SEED-INTELLIGENTE.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY CATALOG-SEED-TONDO.json ./
COPY CATALOG-SEED-QUADRO.json ./
COPY CATALOG-SEED-INTELLIGENTE.json ./
EXPOSE 3002
CMD ["sh", "-c", "node dist/seed.js && node dist/index.js"]
