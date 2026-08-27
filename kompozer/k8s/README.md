# KompozeR su Kubernetes (Minikube)

Deployment production-oriented dell'intero stack KompozeR su un cluster locale
Minikube. Copre build delle immagini, deploy, accesso e le due demo di sistemi
distribuiti richieste: **failover del replica set CAD** e **checkpoint/recovery**
della sessione collaborativa.

## Contenuto

| File                               | Ruolo                                                             |
| ---------------------------------- | ----------------------------------------------------------------- |
| `00-namespace.yaml`              | Namespace`kompozer`                                             |
| `01-secrets.yaml`                | Credenziali condivise (Mongo root, JWT)                           |
| `10-redis.yaml`                  | Redis (cache/eventi)                                              |
| `11-mongo-databases.yaml`        | Mongo single-node: auth, catalog, cart, notification, chat, order |
| `12-mongo-cad-rs.yaml`           | Replica set CAD (StatefulSet 3 membri PSS) + Job di init          |
| `20..27-*.yaml`                  | Microservizi backend                                              |
| `30-api-gateway.yaml`            | API Gateway (NodePort 30000)                                      |
| `31-frontend.yaml`               | Frontend SPA (nginx, TLS) + reverse-proxy`/api` (NodePort 30080/30443) |
| `40-observability-loki.yaml`     | Loki (log storage)                                                |
| `41-observability-promtail.yaml` | Promtail DaemonSet (scrape log dei pod) + RBAC                    |
| `42-observability-grafana.yaml`  | Grafana (NodePort 30030)                                          |
| `kustomization.yaml`             | Aggrega tutte le risorse                                          |

Il frontend gira nel cluster come immagine nginx che serve la build statica e
fa da reverse-proxy verso l'API Gateway su `/api` (incluso l'upgrade WebSocket
per socket.io). È il punto d'ingresso principale dell'applicazione.

## Prerequisiti

- [Minikube](https://minikube.sigs.k8s.io/) e `kubectl`
- Driver Docker per Minikube

```powershell
minikube start --driver=docker --memory=6144 --cpus=4
```

## 1) Build delle immagini nel Docker di Minikube

Le immagini vengono costruite direttamente nello store di Minikube
(`imagePullPolicy: Never`), evitando un registry esterno. Il metodo più
affidabile su Windows è `minikube image build` (non richiede `docker-env`):

```powershell
cd kompozer
minikube image build -t kompozer/auth-service:latest         ./backend/authenticationService
minikube image build -t kompozer/catalog-service:latest      ./backend/catalogService
minikube image build -t kompozer/cart-service:latest         ./backend/cartService
minikube image build -t kompozer/order-service:latest        ./backend/orderService
minikube image build -t kompozer/cad-service:latest          ./backend/cadService
minikube image build -t kompozer/notification-service:latest ./backend/notificationService
minikube image build -t kompozer/chatbot-service:latest      ./backend/chatbotService
minikube image build -t kompozer/reporting-service:latest    ./backend/reportingService
minikube image build -t kompozer/api-gateway:latest          ./backend/apiGateway
minikube image build -t kompozer/frontend:latest             ./frontend
```

Le immagini di Loki, Promtail, Grafana, Redis e MongoDB vengono scaricate
automaticamente dai registry pubblici al primo deploy.

## 2) Certificato TLS del frontend

Il frontend (nginx) termina TLS ed è l'unico punto d'ingresso pensato per
essere pubblico — il gateway resta HTTP semplice, raggiungibile solo per
debug diretto. Genera un certificato self-signed di sviluppo (lo stesso
usato anche da `docker-compose.yml`):

```bash
bash kompozer/scripts/generate-dev-tls.sh
```

Poi crealo come Secret nel cluster:

```powershell
kubectl -n kompozer create secret tls kompozer-frontend-tls `
  --cert=kompozer/tls/tls.crt --key=kompozer/tls/tls.key
```

Va rifatto solo se il certificato scade o cambi le SAN (es. per includere
l'IP di Minikube: `bash kompozer/scripts/generate-dev-tls.sh $(minikube ip)`,
poi ricrea il Secret con `kubectl ... --dry-run=client -o yaml | kubectl apply -f -`).

**Quando ci sarà un dominio reale**: sostituisci questo Secret con uno
gestito da [cert-manager](https://cert-manager.io/) + un `ClusterIssuer`
Let's Encrypt (richiede un Ingress controller, non presente oggi). Basta che
il Secret risultante si chiami `kompozer-frontend-tls` con le stesse chiavi
(`tls.crt`/`tls.key`, tipo `kubernetes.io/tls`) — `31-frontend.yaml` e
`nginx.conf` non cambiano.

## 3) Deploy

```powershell
kubectl apply -k kompozer/k8s
```

Attendi che tutto sia pronto:

```powershell
kubectl -n kompozer rollout status statefulset/mongo-cad
kubectl -n kompozer wait --for=condition=complete job/mongo-cad-init --timeout=180s
kubectl -n kompozer get pods
```

Il Job `mongo-cad-init` esegue `rs.initiate` una sola volta (idempotente).
`cad-service` potrebbe riavviarsi qualche volta finché il replica set non è
eletto: è atteso e si stabilizza da solo.

## 4) Accesso

Applicazione completa (SPA + API + WebSocket) via il frontend:

```powershell
minikube service frontend -n kompozer --url
```

Stampa sia l'URL `http://` (redirige a HTTPS) che `https://`. Il certificato
è self-signed: il browser avviserà, procedi comunque; con `curl` serve `-k`.

Altri endpoint utili:

```powershell
minikube service api-gateway -n kompozer --url   # API dirette (debug)
minikube service grafana -n kompozer --url       # Grafana (log Loki, Explore)
```

## 5) Demo DS — Failover del replica set CAD

Mostra l'elezione automatica di un nuovo primary.

```powershell
# Primary corrente
kubectl -n kompozer exec mongo-cad-0 -- mongosh --quiet --port 27017 --eval `
  "rs.status().members.map(m => m.name + ' => ' + m.stateStr).join('\n')"

# Elimina il pod primary (di norma mongo-cad-0)
kubectl -n kompozer delete pod mongo-cad-0

# Nuovo primary eletto tra i membri rimasti (query da un altro membro)
kubectl -n kompozer exec mongo-cad-1 -- mongosh --quiet --port 27017 --eval `
  "rs.status().members.map(m => m.name + ' => ' + m.stateStr).join('\n')"
```

Lo StatefulSet ricrea `mongo-cad-0`, che rientra come SECONDARY. Con 3 membri
data-bearing, `w:"majority"` resta disponibile anche con un membro giù.

## 6) Demo DS — Checkpoint & Recovery

Mostra il recupero dello stato collaborativo dopo un crash del servizio.

1. Avvia una sessione collaborativa dal frontend e applica qualche modifica.
2. Simula il crash del servizio:

   ```powershell
   kubectl -n kompozer delete pod -l app=cad-service
   ```
3. Al riavvio, `cad-service` esegue `recoverSessions()`: ricarica l'ultimo
   checkpoint da `caddb` e riapplica gli eventi loggati dopo il checkpoint,
   quindi emette `cad:collab:resync` ai client. Controlla i log:

   ```powershell
   kubectl -n kompozer logs -l app=cad-service --tail=50
   ```

   Cerca la riga `Recovered N collaborative session(s)`.

## 7) Trade-off consistenza/disponibilità

Configurabile via env su `24-cad-service.yaml`:

- `CAD_WRITE_CONCERN=majority` (default): consistenza forte, richiede l'ack
  della maggioranza dei membri.
- `CAD_WRITE_CONCERN=1`: privilegia la disponibilità (ack dal solo primary).
- `CAD_READ_CONCERN` / `CAD_READ_PREFERENCE`: livello di lettura e instradamento.

Dopo la modifica:

```powershell
kubectl -n kompozer rollout restart deployment/cad-service
```

## 8) Teardown

```powershell
kubectl delete -k kompozer/k8s
# opzionale: rimuove anche i PVC
kubectl -n kompozer delete pvc --all
```
