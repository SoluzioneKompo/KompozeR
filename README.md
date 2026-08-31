# KompozeR

KompozeR e' un progetto accademico (ASW/DS) che estende un contesto e-commerce per la configurazione guidata di scaffalature modulari, con flussi realtime e architettura a microservizi.

Link dominio di riferimento: www.soluzionekompo.com

## Cosa include

- SPA frontend in Vue 3 con configuratore CAD, catalogo, carrello, notifiche
- Backend a microservizi Node.js/Express con API Gateway
- Persistenza MongoDB separata per contesto
- Eventi asincroni Redis (pub/sub)
- Realtime via Socket.IO (notifiche)
- Suite test backend + e2e

## Stack Tecnologico

- Frontend: Vue 3, TypeScript, Pinia, Vue Router, Vite
- Backend: Node.js, Express, TypeScript
- Database: MongoDB (istanze dedicate per servizio)
- Messaging: Redis
- Realtime: Socket.IO
- Orchestrazione locale: Docker Compose
- Testing: Jest, Supertest

## Architettura (runtime)

Servizi principali in `kompozer/backend`:

- `apiGateway`
- `authenticationService`
- `catalogService`
- `cadService`
- `cartService`
- `orderService`
- `notificationService`
- `reportingService`

## Quick Start (locale)

Prerequisiti:

- Docker + Docker Compose
- Node.js 20+ e npm

1. Avvia backend + infrastruttura

```bash
cd kompozer
docker compose -f docker-compose.dev.yml up --build
```

2. Avvia frontend (in un secondo terminale)

```bash
cd kompozer
npm run dev:frontend
```

3. Verifiche rapide

- Gateway: `http://localhost:3000/health`
- Frontend: `http://localhost:5173`
- **Osservabilità (Grafana + Loki):** `http://localhost:3010` — visualizza log aggregati di tutti i servizi (pre-configurato, accesso anonimo)

Per spegnere tutto:

```bash
cd kompozer
docker compose -f docker-compose.dev.yml down
```

Per pulizia completa volumi dati:

```bash
cd kompozer
docker compose -f docker-compose.dev.yml down -v
```

## Test

Dal workspace `kompozer`:

```bash
npm run test:backend
npm run test:e2e
```

Oppure baseline completa:

```bash
npm run test:baseline
```

## Osservabilità e Log Aggregation

Lo stack include **Grafana** + **Loki** + **Promtail** per centralizzare i log di tutti i servizi in tempo reale.

**Come usare:**

1. Alla startup di `docker compose up`, Loki raccoglie i log via Promtail (no configurazione richiesta).
2. Accedi a **Grafana**: `http://localhost:3010` (accesso anonimo già abilitato).
3. Vai in **Explore** > seleziona datasource **Loki** > scrivi query:
   - `{service="auth-service"}` — solo auth service
   - `{service=~"auth-service|catalog-service"}` — più servizi
   - `{service="auth-service"} |= "error"` — solo errori nel service

Vedi [observability/README.md](observability/README.md) per dettagli su query e troubleshooting.

## Struttura Repository

- `kompozer/`: codice applicativo (frontend, backend, e2e, compose, script workspace)
- `observability/`: config Loki/Promtail/Grafana
- `ReportASW/`: relazione ASW in LaTeX
- `ReportDS/`: relazione DS in LaTeX
- `utilities/`: artefatti di analisi e documentazione tecnica
- `ASW/` e `DS/`: dispense, richieste progetto e materiale di supporto

## Stato del progetto

Il repository contiene sia componenti implementati sia materiale di progettazione (ASW/DS). Le funzionalita' runtime descritte in questo README fanno riferimento allo stato corrente del codice in `kompozer/`.
