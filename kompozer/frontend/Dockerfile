FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src/ ./src/
RUN npm run build

FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# Fallback self-signed cert baked into the image so the container starts
# TLS-ready with zero setup. Real deployments should override /etc/nginx/tls
# with a bind-mounted (docker-compose) or Secret-mounted (k8s) cert instead —
# see kompozer/scripts/generate-dev-tls.sh and k8s/README.md.
RUN apk add --no-cache openssl \
  && mkdir -p /etc/nginx/tls \
  && openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
       -keyout /etc/nginx/tls/tls.key -out /etc/nginx/tls/tls.crt \
       -subj "/CN=kompozer.local" \
       -addext "subjectAltName=DNS:localhost,DNS:kompozer.local,IP:127.0.0.1" \
  && apk del openssl

EXPOSE 80 443
