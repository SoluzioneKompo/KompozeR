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
- [x] Manifest Kubernetes/Minikube + guida operativa (kompozer/k8s: replica set CAD via StatefulSet, gateway NodePort, demo failover/recovery).
- [ ] Integrazione chatbot con API LLM. (SendSessionMessage ancora rule-based)

---

## 1) Criteri di completamento

Il progetto e considerato pronto quando tutti i punti seguenti sono veri.

- [ ] Requisiti ASW coperti da test ed evidenze.
- [ ] Requisiti DS previsti per Sprint 6 e Sprint 7 coperti da test ed evidenze.
- [ ] Logica costruttiva INTELLIGENTE implementata end-to-end (CAD + catalog + frontend + e2e).
- [ ] Chatbot con integrazione LLM funzionante con fallback robusto.
- [ ] Demo completa eseguibile solo da UI e script ripetibili da README.
- [ ] Tracciabilita requisito -> componente -> test -> evidenza aggiornata.

---

## 2) Ordine esecutivo raccomandato

Ordine scelto per massimizzare probabilita di consegna nei tempi:

- [x] Sprint 5 (chiusura qualita ASW)
- [x] Sprint 6 (obiettivi DS principali)
- [ ] Logica costruttiva INTELLIGENTE
- [ ] Sprint 7 (resilienza DS e delivery finale)
- [ ] Chatbot LLM (ultimo blocco, con fallback)

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
- [ ] Formalizzare invarianti di dominio e casi limite.

### 5.2 Backend CAD

- [x] Implementare family resolver completo (STANDARD, INTELLIGENTE).
- [x] Implementare ListNextOptions per INTELLIGENTE.
- [x] Implementare UpdateDesign per INTELLIGENTE.
- [x] Rimuovere NotImplemented per categorie coperte.
- [x] Predisporre resolver per famiglie logiche e mapping errori espliciti per categorie non implementate.

### 5.3 Catalog e contratti

- [ ] Verificare disponibilita componenti coerenti per nuove logiche.
- [x] Aggiornare seed e fixture per scenario INTELLIGENTE.
- [ ] Validare payload/DTO tra catalog, cad, frontend.
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
- [x] Manifest Kubernetes/Minikube e guida operativa. (kompozer/k8s: 00-30 + kustomization + README; replica set CAD via StatefulSet 3 membri PSS + Job rs.initiate)
- [x] Stack observability log-centric (Loki + Promtail + Grafana) su docker-compose.dev con datasource pre-provisioned.

### Exit Criteria Sprint 7

- [x] Crash/restart con recupero consistente verificato. (unit test collabCheckpointRecovery: convergenza checkpoint+replay, troncamento, cleanup, scarto checkpoint scaduti)
- [x] Failover testato almeno su scenario minimo. (Docker Compose: mongo-cad-1 stop -> mongo-cad-2 eletto PRIMARY, poi rientro come SECONDARY. Kubernetes/Minikube live: 19 pod Ready, replica set cadrs 1 PRIMARY + 2 SECONDARY; delete pod primary -> nuovo primary eletto con cad-service sempre disponibile; StatefulSet ricrea il pod che rientra e riacquisisce PRIMARY)
- [x] Pacchetto consegna completo e ripetibile. (docker-compose dev/prod + manifest Kubernetes kompozer/k8s con guida operativa, deploy live su Minikube validato)

---

## 7) Chatbot con API LLM (ultimo blocco)

Obiettivo: estendere il chatbot senza mettere a rischio la consegna principale.

### Backlog Chatbot LLM

- [ ] Definire provider LLM (modello, costi, limiti, policy).
- [ ] Integrare adapter LLM nel chatbot-service con timeout e retry.
- [ ] Implementare fallback locale rule-based quando provider non disponibile.
- [ ] Aggiungere sanitizzazione prompt e guardrail output.
- [ ] Introdurre logging osservabilita (latency, token usage, error rate).
- [ ] Aggiungere test integrazione con mock provider.

### Exit Criteria Chatbot LLM

- [ ] Chatbot non blocca il flusso utente in caso di errore LLM.
- [ ] SLA minimo rispettato per tempo di risposta.
- [ ] Costi e limiti documentati nel README.

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
- [ ] Gate E: Chatbot LLM verde (opzionale per estensione).
