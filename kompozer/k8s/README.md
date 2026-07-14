# KompozeR su Kubernetes (Minikube)

Deployment production-oriented dell'intero stack KompozeR su un cluster locale
Minikube. Copre build delle immagini, deploy, accesso e le due demo di sistemi
distribuiti richieste: **failover del replica set CAD** e **checkpoint/recovery**
della sessione collaborativa.

## Contenuto

| File | Ruolo |
| --- | --- |
| `00-namespace.yaml` | Namespace `kompozer` |
| `01-secrets.yaml` | Credenziali condivise (Mongo root, JWT) |
| `10-redis.yaml` | Redis (cache/eventi) |
| `11-mongo-databases.yaml` | Mongo single-node: auth, catalog, cart, notification, chat, order |
| `12-mongo-cad-rs.yaml` | Replica set CAD (StatefulSet 3 membri PSS) + Job di init |
| `20..27-*.yaml` | Microservizi backend |
| `30-api-gateway.yaml` | API Gateway (NodePort 30000) |
| `kustomization.yaml` | Aggrega tutte le risorse |

Il frontend non ha ancora un'immagine dedicata: eseguilo in locale con
`npm --prefix frontend run dev` puntandolo all'URL del gateway (vedi sotto).

## Prerequisiti

- [Minikube](https://minikube.sigs.k8s.io/) e `kubectl`
- Driver Docker per Minikube

```powershell
minikube start --driver=docker --memory=6144 --cpus=4
```

## 1) Build delle immagini nel Docker di Minikube

Le immagini vengono costruite direttamente nel demone Docker di Minikube
(`imagePullPolicy: Never`), evitando un registry esterno.

PowerShell (Windows):

```powershell
& minikube -p minikube docker-env --shell powershell | Invoke-Expression
cd kompozer
docker build -t kompozer/auth-service:latest        ./backend/authenticationService
docker build -t kompozer/catalog-service:latest     ./backend/catalogService
docker build -t kompozer/cart-service:latest        ./backend/cartService
docker build -t kompozer/order-service:latest       ./backend/orderService
docker build -t kompozer/cad-service:latest         ./backend/cadService
docker build -t kompozer/notification-service:latest ./backend/notificationService
docker build -t kompozer/chatbot-service:latest     ./backend/chatbotService
docker build -t kompozer/reporting-service:latest   ./backend/reportingService
docker build -t kompozer/api-gateway:latest         ./backend/apiGateway
```

Bash (Linux/macOS): sostituisci la prima riga con
`eval $(minikube docker-env)` e lascia invariati i `docker build`.

## 2) Deploy

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

## 3) Accesso

```powershell
minikube service api-gateway -n kompozer --url
```

Usa l'URL restituito come base API. Per il frontend locale:

```powershell
# imposta VITE_API_BASE_URL sull'URL del gateway, poi:
npm --prefix kompozer/frontend run dev
```

## 4) Demo DS — Failover del replica set CAD

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

## 5) Demo DS — Checkpoint & Recovery

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

## 6) Trade-off consistenza/disponibilità

Configurabile via env su `24-cad-service.yaml`:

- `CAD_WRITE_CONCERN=majority` (default): consistenza forte, richiede l'ack
  della maggioranza dei membri.
- `CAD_WRITE_CONCERN=1`: privilegia la disponibilità (ack dal solo primary).
- `CAD_READ_CONCERN` / `CAD_READ_PREFERENCE`: livello di lettura e instradamento.

Dopo la modifica:

```powershell
kubectl -n kompozer rollout restart deployment/cad-service
```

## 7) Teardown

```powershell
kubectl delete -k kompozer/k8s
# opzionale: rimuove anche i PVC
kubectl -n kompozer delete pvc --all
```
