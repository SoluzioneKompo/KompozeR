#!/usr/bin/env bash
# Generates a self-signed TLS cert/key pair for local development (Minikube
# and docker-compose both mount the same pair — see docker-compose.yml,
# docker-compose.dev.yml, and k8s/README.md).
#
# This is NOT for a real deployment. Once there's a real domain, replace this
# with a cert-manager + Let's Encrypt ClusterIssuer instead — as long as the
# resulting Secret keeps the same name/keys (tls.crt/tls.key), nothing in
# nginx.conf or the k8s manifests needs to change.
#
# Usage: ./generate-dev-tls.sh [extra-san ...]
#   Extra SANs (IPs or hostnames) can be passed for convenience, e.g. your
#   Minikube IP: ./generate-dev-tls.sh $(minikube ip)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$SCRIPT_DIR/../tls"
OUT_DIR="$(cd "$SCRIPT_DIR/../tls" && pwd)"

SAN="DNS:localhost,DNS:kompozer.local,IP:127.0.0.1"
for extra in "$@"; do
  if [[ "$extra" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    SAN="$SAN,IP:$extra"
  else
    SAN="$SAN,DNS:$extra"
  fi
done

openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout "$OUT_DIR/tls.key" -out "$OUT_DIR/tls.crt" \
  -subj "//CN=kompozer.local" \
  -addext "subjectAltName=$SAN"

echo "Generated $OUT_DIR/tls.crt and $OUT_DIR/tls.key (SAN: $SAN)"
echo
echo "docker-compose: already mounted, just restart the frontend container."
echo "Minikube: kubectl -n kompozer create secret tls kompozer-frontend-tls \\"
echo "  --cert=\"$OUT_DIR/tls.crt\" --key=\"$OUT_DIR/tls.key\" \\"
echo "  --dry-run=client -o yaml | kubectl apply -f -"
