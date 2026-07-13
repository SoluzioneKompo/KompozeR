# Osservabilità: Grafana + Loki + Promtail

Stack di log aggregation che raccoglie automaticamente i log di tutti i servizi KompozeR in tempo reale.

## Componenti

- **Loki** (porta 3100 interno): database di log time-series per Grafana
- **Promtail**: agent che legge i log dai container Docker e li spinge a Loki
- **Grafana** (porta 3010): UI per query e visualizzazione log

## Come usarla

1. Avvia lo stack: `docker compose -f docker-compose.dev.yml up --build`
2. Accedi a Grafana: `http://localhost:3010` (accesso anonimo abilitato)
3. Clicca **Explore** (icona bussola in alto a destra)
4. Seleziona datasource **Loki**
5. Scrivi una query LogQL

## Query di esempio

| Descrizione | Query LogQL |
|---|---|
| Tutti i log | `{job="docker"}` |
| Solo auth-service | `{service="auth-service"}` |
| Più servizi | `{service=~"auth-service\|catalog-service"}` |
| Solo errori | `{job="docker"} \|= "error" or \|= "ERROR" or \|= "FATAL"` |
| Errori in auth | `{service="auth-service"} \|= "error"` |
| Log contenti "MongoDB" | `{job="docker"} \|= "MongoDB"` |
| Seed completati | `{job="docker"} \|= "[seed] completato"` |

## Configurazione

**File:**
- `loki-config.yml` — storage in-memory + filesystem (`/loki/chunks`)
- `promtail-config.yml` — scrape Docker socket, filtra su label `com.docker.compose.project=kompozer`
- `grafana/provisioning/datasources/loki.yml` — auto-provisioned Loki datasource

**Retention:** di default Loki mantiene i log per la session. Se vuoi persistenza su riavvio, i dati sono in volume `loki-data`.

## Troubleshooting

**I log non appaiono:**
- Controlla che Promtail sia healthy: `docker compose ps promtail`
- Verifica il Docker socket: `docker ps` funziona?
- Prova una query semplice in Grafana: `{job="docker"} | limit 10`

**Loki in crash:**
- Controlla file config: `docker compose logs loki | tail -50`
- Se il volume è corrotto: `docker compose down -v` (cancella dati) e riavvia

**Grafana non carica:**
- Porta 3010 libera? `netstat -ano | findstr :3010`
- Controlla log: `docker compose logs grafana | tail -20`

## Note di sviluppo

- Promtail legge direttamente dal Docker socket, **non serve modificare il codice** dei servizi
- Ogni container è automaticamente etichettato da Docker Compose con `service=<nome>`
- I log sono queryabili in **tempo reale**, con ritardo di ~1-2 secondi
- Loki non è un DB di analitiche pesante; adatto per troubleshooting locale e dev

## Per produzione

Questa configurazione è **dev-only** (in-memory, no auth, no remote storage). Per prod, vedi:
- [Loki docs - mode di deployment](https://grafana.com/docs/loki/latest/setup/install/docker/)
- [Promtail scrape configs avanzate](https://grafana.com/docs/loki/latest/send-data/promtail/configuration/)
