# KompozeR — Guida alla manutenzione

Questo file descrive la struttura del progetto, il ruolo di ogni file e cartella, e le convenzioni da seguire per aggiungere funzionalità o estendere il codice senza rompere l'architettura.

---

## Struttura root

```
kompozer/
├── .env.example          # Template variabili d'ambiente (non committare .env)
├── .gitignore            # File/cartelle esclusi da Git
├── docker-compose.yml    # Orchestrazione di tutti i container
├── howToMaintaine.md     # Questo file
├── backend/
│   ├── shared/           # Tipi TypeScript condivisi tra servizi
│   └── <servizio>/       # Un microservizio per cartella
└── frontend/             # SPA Vue 3
```

### File root

| File | Scopo |
|---|---|
| `.env.example` | Template con tutte le variabili d'ambiente necessarie. Copiare in `.env` e compilare con i valori reali. Non committare mai `.env`. |
| `.gitignore` | Esclude `node_modules/`, `dist/`, `.env`, e i log. |
| `docker-compose.yml` | Avvia l'intera infrastruttura: 1 Redis, 7 MongoDB (uno per servizio), 8 servizi backend, 1 frontend. Ogni servizio legge le variabili da `.env` tramite `env_file`. |

---

## Architettura generale

Il progetto segue una **Clean Architecture** (equivalente di Ports & Adapters / Hexagonal) adattata per TypeScript + Express. Ogni microservizio è indipendente e comunica con gli altri in due modi:

- **Sincrono (REST/HTTP):** per operazioni request-response (es. il gateway chiama l'auth service per verificare il token).
- **Asincrono (Redis Pub/Sub):** per eventi (es. il catalog service pubblica `catalog:price:changed` → il notification service lo consuma e notifica i client via Socket.io).

```
Vue SPA
  │
  ▼
api-gateway (porta 3000)  ←── verifica JWT su ogni richiesta
  │
  ├──► auth-service        (porta 3001)  MongoDB: authdb
  ├──► cad-service         (porta 3002)  MongoDB: caddb    + Redis
  ├──► cart-service        (porta 3003)  MongoDB: cartdb   + Redis
  ├──► catalog-service     (porta 3004)  MongoDB: catalogdb + Redis
  ├──► notification-service(porta 3006)  MongoDB: notificationdb + Redis
  └──► reporting-service   (porta 3007)  MongoDB: reportingdb

Redis Pub/Sub — canali eventi:
  catalog-service  ──► catalog:price:changed  ──► notification-service
  catalog-service  ──► catalog:stock:changed  ──► notification-service
  cad-service      ──► cad:config:finalized   ──► cart-service
```

---

## Struttura di un microservizio (standard)

Usata da: `authenticationService`, `cartService`, `catalogService`, `notificationService`, `reportingService`.

```
<servizio>/
└── src/
    ├── index.ts              # Entry point: istanzia le dipendenze e avvia il server
    ├── app.ts                # Factory Express: registra middleware e router
    ├── domain/               # Entità e tipi del dominio (zero dipendenze da framework)
    ├── useCases/             # Logica applicativa (dipende solo da domain/)
    └── adapters/
        ├── http/             # Express Router (driving adapter — riceve le richieste HTTP)
        ├── persistence/      # Repository Mongoose (driven adapter — scrive/legge su MongoDB)
        │   └── schemas/      # Schema Mongoose delle collezioni
        ├── httpClient/       # Client Axios verso altri servizi (driven adapter)
        ├── messaging/        # Redis Pub/Sub
        │   ├── publishers/   # Pubblica eventi su Redis (driven adapter)
        │   └── subscribers/  # Consuma eventi da Redis (driving adapter)
        └── websocket/        # Handler Socket.io (driving adapter per i messaggi in arrivo)
```

> Non tutti i servizi usano tutte le cartelle. Le cartelle non necessarie restano vuote (`.gitkeep`).

### Quali adapter usa ogni servizio

| Servizio | http | persistence | httpClient | msg/pub | msg/sub | websocket |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| apiGateway | ✓ | | ✓ | | | |
| authenticationService | ✓ | ✓ | | | | |
| cadService | ✓ | ✓ | | ✓ | | ✓ |
| cartService | ✓ | ✓ | ✓ | | ✓ | |
| catalogService | ✓ | ✓ | | ✓ | | |
| notificationService | ✓ | ✓ | | | ✓ | ✓ |
| reportingService | ✓ | ✓ | ✓ | | | |

### Struttura `apiGateway` (semplificata — nessun domain)

```
src/
├── index.ts
├── app.ts
├── routes/       # Definizione delle rotte e regole di proxy verso i servizi
├── middleware/   # JWT verify, rate limiter, CORS, error handler
└── adapters/
    └── httpClient/  # Client Axios per chiamate di aggregazione BFF
```

### Struttura `cadService` (estesa — CQRS + WebSocket)

Il `cadService` è l'unico con CQRS, richiesto dal requisito DS (causal ordering, checkpoint/recovery).

```
src/
├── index.ts
├── app.ts
├── domain/
├── useCases/
│   ├── write/    # ApplyOperation, CreateSession, FinalizeConfiguration
│   └── read/     # GetSnapshot, GetOperationsSince
└── adapters/
    ├── http/
    ├── websocket/          # Handler Socket.io per il collaborative editing
    ├── persistence/
    │   └── schemas/
    └── messaging/
        └── publishers/     # Pubblica cad:config:finalized su Redis
```

---

## `backend/shared/types/`

Contiene i tipi TypeScript condivisi tra più servizi. Importare con path relativo.

| File | Contenuto |
|---|---|
| `events.ts` | Payload degli eventi Redis (`PriceChangedEvent`, `StockChangedEvent`, `ConfigFinalizedEvent`) |
| `jwt.ts` | Interfaccia `JwtPayload` (condivisa tra `authenticationService` e `apiGateway`) |
| `api.ts` | Wrapper generico `ApiResponse<T>` per le risposte HTTP |

---

## `frontend/`

SPA in **Vue 3** con Composition API, **Pinia** per lo state management, **Vite** come bundler.

```
src/
├── main.ts               # Bootstrap Vue + Pinia + Router
├── App.vue               # Componente root
├── router/               # Definizione delle rotte (Vue Router)
├── store/                # Store Pinia (stato globale)
├── views/                # Componenti pagina (una per rotta)
├── components/
│   ├── configurator/     # Componenti del grid CAD
│   ├── catalog/          # Browsing prodotti
│   └── cart/             # Carrello
├── services/             # Client Axios verso l'api-gateway (uno per dominio)
├── composables/          # Composables Vue 3 (useSocket, useAuth, useNotifications)
├── types/                # Interfacce TypeScript lato frontend
└── assets/               # Immagini, font, icone
```

---

## Come aggiungere una funzionalità

### 1. Nuova rotta HTTP in un servizio esistente

1. **`domain/`** — se la funzionalità richiede nuove entità o tipi, aggiungerli qui.
2. **`useCases/`** — creare un nuovo file `NomeUseCase.ts`. Deve dipendere solo da `domain/`.
3. **`adapters/persistence/`** — se serve una nuova query MongoDB, aggiungerla al repository esistente (o creare un nuovo metodo nello schema).
4. **`adapters/http/`** — aggiungere il nuovo endpoint al Router Express esistente, chiamando il use case.
5. **`adapters/http/index.ts`** *(o equivalente)* — registrare il nuovo handler.

### 2. Nuovo evento Redis

1. **`backend/shared/types/events.ts`** — aggiungere il tipo del payload dell'evento.
2. **Servizio publisher** (`adapters/messaging/publishers/`) — creare o aggiornare il publisher.
3. **Servizio subscriber** (`adapters/messaging/subscribers/`) — creare il subscriber e il use case che gestisce l'evento.

### 3. Nuovo servizio

1. Creare la cartella in `backend/<nomeServizio>/` con la struttura standard.
2. Aggiungere il servizio e il suo MongoDB in `docker-compose.yml`.
3. Aggiungere la variabile `*_MONGO_URI` e la porta in `.env.example`.
4. Aggiungere il routing nel `apiGateway`.

---

## Convenzioni

| Cosa | Convenzione |
|---|---|
| File TypeScript | `camelCase.ts` |
| Componenti Vue | `PascalCase.vue` |
| Classi dominio | `PascalCase` (es. `CartItem`) |
| Interfacce/tipi | `PascalCase` con prefisso `I` per le porte (es. `ICartRepository`) |
| Canali Redis | `<servizio>:<evento>` in kebab-case (es. `catalog:price:changed`) |
| Variabili env | `UPPER_SNAKE_CASE` |
| Nessun framework nel `domain/` | Le entità non importano Express, Mongoose, ioredis o Socket.io |
| Un use case per file | Ogni file in `useCases/` esporta una sola classe o funzione |

