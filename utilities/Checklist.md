# KompozeR - Checklist Finale Esame

Obiettivo: chiudere il progetto in modo dimostrabile, con priorita su consegna esame e rischio tecnico sotto controllo.

Stato snapshot (aggiornato 2026-07-14, marcato solo su evidenze verificate):

- [x] Allineamento categoria INTELLIGENTE tra servizi principali (catalog + cad + frontend).
- [x] Test e2e mirati INTELLIGENTE (catalog + cad) verdi dopo rebuild container.
- [x] Predisposizione backend Step4 a famiglie logiche (STANDARD/KUBE/INTELLIGENTE) con gate esplicito.
- [ ] Implementazione logica costruttiva reale KUBE. (resolver lancia ancora CategoryLogicNotImplementedError)
- [x] Implementazione logica costruttiva reale INTELLIGENTE.
- [x] Logica STANDARD estesa per consentire i bridge tra colonne.
- [x] Chiusura Sprint 6 DS + hardening validazione sessioni collaborative.
- [x] Stack observability (Loki + Promtail + Grafana) integrato in docker-compose.dev.
- [x] Checkpoint/recovery collaborativo + replay eventi su stable storage (Mongo caddb).
- [x] mongo-cad Replica Set PSA con failover automatico e consistenza configurabile (CAD_WRITE_CONCERN/CAD_READ_CONCERN).
- [x] Manifest Kubernetes/Minikube + guida operativa (kompozer/k8s: replica set CAD via StatefulSet, frontend nginx + reverse-proxy /api, stack observability Loki/Promtail/Grafana, gateway NodePort, demo failover/recovery).
- [x] Integrazione chatbot con API LLM. (chatbot-service: adapter Mistral mistral-small-latest, RAG su catalogo, timeout/retry/guardrail, fallback rule-based, logging osservabilita, test mock provider; deploy live verificato + README aggiornato)

---

## 1) Criteri di completamento

Il progetto e considerato pronto quando tutti i punti seguenti sono veri.

- [ ] Requisiti ASW coperti da test ed evidenze.
- [ ] Requisiti DS previsti per Sprint 6 e Sprint 7 coperti da test ed evidenze.
- [ ] Logica costruttiva INTELLIGENTE implementata end-to-end (CAD + catalog + frontend + e2e).
- [x] Chatbot con integrazione LLM funzionante con fallback robusto.
- [ ] Demo completa eseguibile solo da UI e script ripetibili da README.
- [ ] Tracciabilita requisito -> componente -> test -> evidenza aggiornata.

---

## 2) Ordine esecutivo raccomandato

Ordine scelto per massimizzare probabilita di consegna nei tempi:

- [x] Sprint 5 (chiusura qualita ASW)
- [x] Sprint 6 (obiettivi DS principali)
- [ ] Logica costruttiva INTELLIGENTE
- [ ] Sprint 7 (resilienza DS e delivery finale)
- [x] Chatbot LLM (ultimo blocco, con fallback)

Nota: il chatbot LLM e intenzionalmente ultimo perche introduce rischio esterno (latency, costi, rate limit, qualita risposta).

---

## 3) Sprint 5 - Chiusura ASW

Obiettivo: chiudere definitivamente il perimetro ASW con test e UX minima da esame.

### Backlog Sprint 5

- [x] Eseguire e documentare suite e2e completa ASW (security + flussi utente/admin).
- [x] Eliminare regressioni note su auth/cart/cad/orders/notifications/reporting.
- [x] Chiudere rifiniture UX essenziali (loading, error state, empty state, responsive base).
- [x] Chiudere accessibilita minima (focus visibile, form label, alert role, aria-live).
- [x] Aggiornare matrice di tracciabilita per tutti i requisiti ASW.
- [x] Verifica mirata regressione category ripple (catalog/cad) su INTELLIGENTE.

Evidenza test Sprint 5 (2026-07-10):

- [x] Run 1: `npm.cmd --prefix e2e test` -> 8 suite verdi, 73/73 test verdi.
- [x] Run 2: `npm.cmd --prefix e2e test` -> 8 suite verdi, 73/73 test verdi.
- [x] Stabilita confermata su due run consecutive senza failure.

### Exit Criteria Sprint 5

- [x] e2e ASW completamente verde.
- [x] Nessun bug bloccante aperto su percorso demo.
- [x] Evidenze test archiviate.

---

## 4) Sprint 6 - DS Core

Obiettivo: implementare la parte DS centrale con concorrenza e causalita verificabile.

Stato avanzamento (2026-07-10):

- [x] Slice 1 backend collaborativo CAD: sessioni in-memory con TTL + join/leave + snapshot + apply operation Lamport/LWW field-level.
- [x] Slice 2 realtime Socket.IO CAD via API Gateway.
- [x] Slice 3 integrazione frontend CadView per presenza/sync realtime.
- [x] Slice 3.1 hardening collaborativo: fallback owner via sessione attiva su endpoint CAD + ingresso esplicito Join sessione in CadView.
- [x] Slice 3.2 ACL persistente: owner + collaborators su configurazione con accesso read/write asincrono.
- [x] Slice 3.3 UX Join esplicito: eliminazione flusso query-link, solo join via Session ID esplicito (Avvia sessione / Join sessione / Copia Session ID).
- [x] Slice 3.4 Real-time corretto: fix status transitions in-memory (applyStatusTransition replica logica REST use cases), fix overwrite selected.value per mittente (filtra propri eventi socket via authStore.user.id). Test cadService 51/51 verdi post-fix.

### Backlog Sprint 6

- [x] Sessioni collaborative multiutente sulla stessa configurazione CAD.
- [x] Broadcast incrementale operazioni via websocket/event bus.
- [x] Causal ordering (strategia esplicita: Lamport + LWW field-level).
- [x] Risoluzione conflitti concorrenti con regole deterministiche (LWW actor-id tie-break).
- [x] Test concorrenza con convergenza stato finale.

### Exit Criteria Sprint 6

- [x] Scenario multiutente ripetibile e dimostrabile in demo.
- [x] Test di concorrenza verdi.

---

## 5) Logica costruttiva INTELLIGENTE

Obiettivo: trasformare il gate attuale in implementazione reale di regole costruttive.

### 5.1 Dominio e regole

- [x] Definire regole INTELLIGENTE (vincoli aggiuntivi, eventuali componenti dedicati, BOM).

### 5.2 Backend CAD

- [x] Implementare family resolver completo (STANDARD, INTELLIGENTE).
- [x] Implementare ListNextOptions per INTELLIGENTE.
- [x] Implementare UpdateDesign per INTELLIGENTE.
- [x] Rimuovere NotImplemented per categorie coperte.
- [x] Predisporre resolver per famiglie logiche e mapping errori espliciti per categorie non implementate.

### 5.3 Catalog e contratti

- [x] Verificare disponibilita componenti coerenti per nuove logiche. (audit contratti 2026-07-15: CATALOG-SEED-INTELLIGENTE espone bordo/intermezzo keyed by widthMm + piedino/montante/terminale richiesti da deriveBom INTELLIGENTE)
- [x] Aggiornare seed e fixture per scenario INTELLIGENTE.
- [x] Validare payload/DTO tra catalog, cad, frontend. (audit 2026-07-15: enum categoria + ComponentDto + ConfigurationDto + snapshot chatbot allineati; unica gap type-only chiusa: BomItem.componentType frontend esteso con RIPIANO_BORDO/RIPIANO_INTERMEDIO/MENSOLA)
- [x] Estendere enum categoria con INTELLIGENTE su catalog/cad/frontend.

### 5.4 Frontend

- [x] Rendere disponibili i flussi UI per INTELLIGENTE.
- [x] Mostrare messaggi specifici di vincolo quando una scelta non e valida.
- [x] Verificare completamento configurazione fino al carrello.

### 5.5 Test

- [x] Unit test regole INTELLIGENTE.
- [x] e2e CAD + catalog per entrambe le categorie.
- [x] Test regressione su TONDO/QUADRO.
- [x] e2e mirati INTELLIGENTE (catalog create/filter + cad next-options con errore previsto) verdi.

### Exit Criteria blocco logica costruttiva

- [x] Nessun endpoint Step4 ritorna NotImplemented per INTELLIGENTE.
- [x] Finalize produce BOM coerente per tutte le categorie supportate.
- [x] e2e target verdi.

---

## 6) Sprint 7 - DS Resilienza e Pacchetto Finale

Obiettivo: fault tolerance, deployment e chiusura formale della consegna.

### Backlog Sprint 7

- [x] Checkpoint periodico stato collaborativo. (Mongo caddb: collab_checkpoints + collab_events, interval CAD_CHECKPOINT_INTERVAL_MS default 10s)
- [x] Recovery da checkpoint + replay eventi. (recoverSessions all'avvio cadService + resync client via cad:collab:resync)
- [x] Replica DB/failover minimo dimostrabile. (mongo-cad Replica Set PSA cadrs: elezione nuovo primary allo stop + rientro nodo come secondary verificati)
- [x] Manifest Kubernetes/Minikube e guida operativa. (kompozer/k8s: 00-42 + kustomization + README; replica set CAD StatefulSet 3 PSS + Job rs.initiate, frontend nginx SPA+proxy, observability Loki/Promtail DaemonSet/Grafana; cluster autosufficiente)
- [x] Stack observability log-centric (Loki + Promtail + Grafana) su docker-compose.dev con datasource pre-provisioned.

### Exit Criteria Sprint 7

- [x] Crash/restart con recupero consistente verificato. (unit test collabCheckpointRecovery: convergenza checkpoint+replay, troncamento, cleanup, scarto checkpoint scaduti)
- [x] Failover testato almeno su scenario minimo. (Docker Compose: mongo-cad-1 stop -> mongo-cad-2 eletto PRIMARY, poi rientro come SECONDARY. Kubernetes/Minikube live: 19 pod Ready, replica set cadrs 1 PRIMARY + 2 SECONDARY; delete pod primary -> nuovo primary eletto con cad-service sempre disponibile; StatefulSet ricrea il pod che rientra e riacquisisce PRIMARY)
- [x] Pacchetto consegna completo e ripetibile. (docker-compose dev/prod + manifest Kubernetes kompozer/k8s con guida operativa, deploy live su Minikube validato)

---

## 7) Chatbot con API LLM (ultimo blocco)

Obiettivo: estendere il chatbot senza mettere a rischio la consegna principale.

### Backlog Chatbot LLM

- [x] Definire provider LLM (modello, costi, limiti, policy). (Mistral AI, mistral-small-latest; costi/limiti/SLA documentati nel README)
- [x] Integrare adapter LLM nel chatbot-service con timeout e retry. (timeout 15s, retry max 2 con backoff su timeout/5xx/429)
- [x] Implementare fallback locale rule-based quando provider non disponibile. (buildTemplateAnswer su catalogo quando chiave assente o LLM in errore)
- [x] Aggiungere sanitizzazione prompt e guardrail output. (cap domanda e risposta a 2000 caratteri)
- [x] Introdurre logging osservabilita (latency, token usage, error rate). (log [chatbot][llm] con latencyMs + prompt/completion/total tokens; errori su [chatbot][llm] error; raccolti da Loki/Grafana)
- [x] Aggiungere test integrazione con mock provider. (SendSessionMessage: path LLM + fallback su errore; suite 8/8 verde)

### Exit Criteria Chatbot LLM

- [x] Chatbot non blocca il flusso utente in caso di errore LLM. (fallback deterministico garantito)
- [x] SLA minimo rispettato per tempo di risposta. (latenza tipica ~0,5-1s; tetto 15s con retry+fallback, documentato nel README)
- [x] Costi e limiti documentati nel README. (sezione "Chatbot con LLM": provider/modello, token, rate limit, SLA)

---

## 8) Evidenze obbligatorie per l'esame

- [ ] Report test backend (per servizio) allegato.
- [ ] Report e2e completo allegato.
- [ ] Screenshot/clip demo user path e admin path.
- [ ] Screenshot/clip scenario DS concorrente.
- [ ] Screenshot/clip scenario recovery/failover.
- [ ] Matrice tracciabilita aggiornata.
- [ ] README finale con comandi run/test/demo.

---

## 9) Piano rapido settimanale (proposta)

- [ ] Settimana 1: Sprint 5 completo + evidenze ASW.
- [ ] Settimana 2: Sprint 6 completo + test concorrenza.
- [ ] Settimana 3: Logica costruttiva KUBE/INTELLIGENTE completa + e2e.
- [ ] Settimana 4: Sprint 7 + consegna finale.
- [ ] Buffer: Chatbot LLM (solo se settimane 1-4 sono verdi).

---

## 10) Regola di avanzamento (gates)

Si passa al blocco successivo solo se tutti i gate del blocco corrente sono verdi.

- [x] Gate A: Sprint 5 verde.
- [x] Gate B: Sprint 6 verde. (2026-07-13 — 63/63 test verdi, +12 concorrenza LWW)
- [x] Gate C: Logica costruttiva verde. (2026-07-13 — INTELLIGENTE end-to-end: catalog + cadService + frontend + e2e)
- [x] Gate D: Sprint 7 verde. (2026-07-14 — checkpoint/recovery + replica set/failover + manifest Kubernetes; deploy live su Minikube validato: 19 pod Ready, failover CAD dimostrato)
- [x] Gate E: Chatbot LLM verde (opzionale per estensione). (2026-07-15 — adapter Mistral + retry/guardrail/osservabilita + fallback + test mock 8/8; deploy live su Minikube verificato; README aggiornato)
