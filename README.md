# KompozeR

KompozeR e' un progetto accademico (ASW/DS) che estende un contesto e-commerce per la configurazione guidata di scaffalature modulari, con flussi realtime e architettura a microservizi.

Link dominio di riferimento: www.soluzionekompo.com

## Cosa include

- SPA frontend in Vue 3 con configuratore CAD, catalogo, carrello, notifiche e chatbot
- Backend a microservizi Node.js/Express con API Gateway
- Persistenza MongoDB separata per contesto
- Eventi asincroni Redis (pub/sub)
- Realtime via Socket.IO (notifiche e chatbot)
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
- `chatbotService`
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

## Chatbot con LLM

Il `chatbotService` genera le risposte tramite un LLM, mantenendo il **grounding sul catalogo** (approccio RAG): recupera i componenti pertinenti dal `catalogService` e l'eventuale contesto della configurazione CAD, poi lascia all'LLM la sola formulazione della risposta. Questo evita allucinazioni su prezzi e disponibilità.

**Provider e modello:**

- Provider: [Mistral AI](https://mistral.ai) (API chat-completions `/v1/chat/completions`)
- Modello di default: `mistral-small-latest` (economico, adatto a Q&A brevi)

**Configurazione (variabili d'ambiente):**

| Variabile | Obbligatoria | Default | Descrizione |
| --- | --- | --- | --- |
| `MISTRAL_API_KEY` | No | — | Chiave API Mistral. Se assente, il chatbot usa il fallback rule-based. |
| `MISTRAL_MODEL` | No | `mistral-small-latest` | Modello da usare. |
| `MISTRAL_BASE_URL` | No | `https://api.mistral.ai` | Base URL API (override per test/mock). |

In locale la chiave si passa via env; in Kubernetes è iniettata dal Secret `kompozer-secrets` (chiave `mistralApiKey`) — vedi [kompozer/k8s/README.md](kompozer/k8s/README.md). **Non committare la chiave in chiaro.**

**Resilienza (fallback robusto):**

- **Timeout** per richiesta: 15s.
- **Retry** automatico (max 2) con backoff sugli errori transitori (timeout, `5xx`, `429`); nessun retry sugli errori client (`4xx`, es. chiave non valida).
- **Guardrail**: la domanda utente e la risposta generata sono limitate a 2000 caratteri.
- **Fallback deterministico**: se la chiave manca o l'LLM fallisce, il servizio risponde con una risposta rule-based basata sul catalogo. Il flusso utente non viene mai bloccato da un errore LLM.

**Osservabilità:**

Ogni chiamata emette una riga di log strutturata, raccolta da Loki/Grafana:

```
[chatbot][llm] ok model=mistral-small-latest attempt=1 latencyMs=646 promptTokens=145 completionTokens=33 totalTokens=178
```

Sono tracciati esito, tentativi (retry), latenza e utilizzo token; gli errori sono loggati con `[chatbot][llm] error ...`.

**Costi e limiti:**

- Il costo dipende dai token consumati (prompt + completion) secondo il [pricing Mistral](https://mistral.ai/pricing); `mistral-small-latest` è la fascia a basso costo. L'utilizzo token è visibile nei log sopra.
- I **rate limit** dipendono dal piano dell'account Mistral (vedi [documentazione Mistral](https://docs.mistral.ai)). In caso di `429` il servizio ritenta e, se persiste, ricade sul fallback.

**SLA di risposta:**

- Latenza tipica osservata: ~0,5–1s per messaggio con `mistral-small-latest`.
- Limite massimo per tentativo: 15s (timeout); oltre tale soglia scatta il retry e infine il fallback, garantendo una risposta all'utente anche in caso di degrado del provider.

## Struttura Repository

- `kompozer/`: codice applicativo (frontend, backend, e2e, compose, script workspace)
- `observability/`: config Loki/Promtail/Grafana
- `ReportASW/`: relazione ASW in LaTeX
- `ReportDS/`: relazione DS in LaTeX
- `utilities/`: artefatti di analisi e documentazione tecnica
- `ASW/` e `DS/`: dispense, richieste progetto e materiale di supporto


## Stato del progetto

Il repository contiene sia componenti implementati sia materiale di progettazione (ASW/DS). Le funzionalita' runtime descritte in questo README fanno riferimento allo stato corrente del codice in `kompozer/`.