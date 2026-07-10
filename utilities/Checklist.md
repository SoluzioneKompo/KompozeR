# KompozeR - Checklist Finale Esame

Obiettivo: chiudere il progetto in modo dimostrabile, con priorita su consegna esame e rischio tecnico sotto controllo.

Stato snapshot (aggiornato ad oggi, marcato solo su evidenze verificate):

- [x] Allineamento categoria INTELLIGENTE tra servizi principali (catalog + cad + frontend).
- [x] Test e2e mirati INTELLIGENTE (catalog + cad) verdi dopo rebuild container.
- [x] Predisposizione backend Step4 a famiglie logiche (STANDARD/KUBE/INTELLIGENTE) con gate esplicito.
- [ ] Implementazione logica costruttiva reale KUBE.
- [ ] Implementazione logica costruttiva reale INTELLIGENTE.
- [ ] Chiusura Sprint 6 DS.
- [ ] Integrazione chatbot con API LLM.

---

## 1) Criteri di completamento

Il progetto e considerato pronto quando tutti i punti seguenti sono veri.

- [ ] Requisiti ASW coperti da test ed evidenze.
- [ ] Requisiti DS previsti per Sprint 6 e Sprint 7 coperti da test ed evidenze.
- [ ] Logica costruttiva KUBE e INTELLIGENTE implementata end-to-end (CAD + catalog + frontend + e2e).
- [ ] Chatbot con integrazione LLM funzionante con fallback robusto.
- [ ] Demo completa eseguibile solo da UI e script ripetibili da README.
- [ ] Tracciabilita requisito -> componente -> test -> evidenza aggiornata.

---

## 2) Ordine esecutivo raccomandato

Ordine scelto per massimizzare probabilita di consegna nei tempi:

- [x] Sprint 5 (chiusura qualita ASW)
- [ ] Sprint 6 (obiettivi DS principali)
- [ ] Logica costruttiva KUBE/INTELLIGENTE
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
- [ ] Slice 3 integrazione frontend CadView per presenza/sync realtime.

### Backlog Sprint 6

- [ ] Sessioni collaborative multiutente sulla stessa configurazione CAD.
- [ ] Broadcast incrementale operazioni via websocket/event bus.
- [ ] Causal ordering (strategia esplicita: Lamport o equivalente).
- [ ] Risoluzione conflitti concorrenti con regole deterministiche.
- [ ] Test concorrenza con convergenza stato finale.

### Exit Criteria Sprint 6

- [ ] Scenario multiutente ripetibile e dimostrabile in demo.
- [ ] Test di concorrenza verdi.
- [ ] Strategia causale documentata nella relazione.

---

## 5) Logica costruttiva KUBE e INTELLIGENTE

Obiettivo: trasformare il gate attuale in implementazione reale di regole costruttive.

### 5.1 Dominio e regole

- [ ] Definire regole KUBE (vincoli geometrici, compatibilita componenti, BOM).
- [ ] Definire regole INTELLIGENTE (vincoli aggiuntivi, eventuali componenti dedicati, BOM).
- [ ] Formalizzare invarianti di dominio e casi limite.

### 5.2 Backend CAD

- [ ] Implementare family resolver completo (STANDARD, KUBE, INTELLIGENTE).
- [ ] Implementare ListNextOptions per KUBE e INTELLIGENTE.
- [ ] Implementare UpdateDesign per KUBE e INTELLIGENTE.
- [ ] Rimuovere NotImplemented per categorie coperte.
- [x] Predisporre resolver per famiglie logiche e mapping errori espliciti per categorie non implementate.

### 5.3 Catalog e contratti

- [ ] Verificare disponibilita componenti coerenti per nuove logiche.
- [ ] Aggiornare seed e fixture per scenari KUBE/INTELLIGENTE.
- [ ] Validare payload/DTO tra catalog, cad, frontend.
- [x] Estendere enum categoria con INTELLIGENTE su catalog/cad/frontend.

### 5.4 Frontend

- [ ] Rendere disponibili i flussi UI per KUBE e INTELLIGENTE.
- [ ] Mostrare messaggi specifici di vincolo quando una scelta non e valida.
- [ ] Verificare completamento configurazione fino al carrello.

### 5.5 Test

- [ ] Unit test regole KUBE.
- [ ] Unit test regole INTELLIGENTE.
- [ ] e2e CAD + catalog per entrambe le categorie.
- [ ] Test regressione su TONDO/QUADRO.
- [x] e2e mirati INTELLIGENTE (catalog create/filter + cad next-options con errore previsto) verdi.

### Exit Criteria blocco logica costruttiva

- [ ] Nessun endpoint Step4 ritorna NotImplemented per KUBE/INTELLIGENTE.
- [ ] Finalize produce BOM coerente per tutte le categorie supportate.
- [ ] e2e target verdi.

---

## 6) Sprint 7 - DS Resilienza e Pacchetto Finale

Obiettivo: fault tolerance, deployment e chiusura formale della consegna.

### Backlog Sprint 7

- [ ] Checkpoint periodico stato collaborativo.
- [ ] Recovery da checkpoint + replay eventi.
- [ ] Replica DB/failover minimo dimostrabile.
- [ ] Manifest Kubernetes/Minikube e guida operativa.
- [ ] Rifinitura report finale e allineamento con demo.

### Exit Criteria Sprint 7

- [ ] Crash/restart con recupero consistente verificato.
- [ ] Failover testato almeno su scenario minimo.
- [ ] Pacchetto consegna completo e ripetibile.

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
- [ ] Gate B: Sprint 6 verde.
- [ ] Gate C: Logica costruttiva verde.
- [ ] Gate D: Sprint 7 verde.
- [ ] Gate E: Chatbot LLM verde (opzionale per estensione).
