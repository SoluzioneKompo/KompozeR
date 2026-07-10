# Sprint 5 - ASW Traceability Matrix

Scopo: mappare requisiti ASW a evidenze test reali, evidenziare gap e guidare implementazione Sprint 5.

Stati:
- Covered: requisito coperto con evidenze test adeguate.
- Partial: copertura presente ma incompleta o non robusta su edge/security.
- Missing: nessuna evidenza test diretta.

Priorita:
- P0: blocca chiusura Sprint 5.
- P1: importante per completezza e robustezza.

## Requirement -> Evidence

| Req ID | Tipo | Requisito sintetico | Evidenza test principale | Stato | Priorita | Gap da chiudere in Sprint 5 |
| --- | --- | --- | --- | --- | --- | --- |
| BR1 | Business | Vendita scaffalature personalizzabili semplificata | kompozer/e2e/__tests__/cad.integration.test.ts, kompozer/e2e/__tests__/cart.integration.test.ts | Covered | P1 | Nessuno bloccante |
| BR2 | Business | Valore tramite configuratore visuale + assistenza digitale | kompozer/e2e/__tests__/cad.integration.test.ts, kompozer/e2e/__tests__/chatbot.integration.test.ts | Partial | P1 | Ampliare chatbot su contesto multi-turn e robustezza |
| BR3 | Business | Ridurre errori acquisto (prezzo/disponibilita/compatibilita) | kompozer/e2e/__tests__/notifications.integration.test.ts, kompozer/e2e/__tests__/catalog.integration.test.ts, kompozer/e2e/__tests__/cad.integration.test.ts | Partial | P0 | Validazione runtime e2e completa eseguita (73/73 x2); restano edge UX/UI non coperti da test automatici |
| BR4 | Business | Allineamento catalogo-configurazioni-operazioni | kompozer/e2e/__tests__/notifications.integration.test.ts, kompozer/e2e/__tests__/order.integration.test.ts | Covered | P0 | Nessun bloccante runtime emerso nella full suite |
| BR5 | Business | Vista admin ordini e trend | kompozer/e2e/__tests__/order.integration.test.ts, kompozer/e2e/__tests__/reporting.integration.test.ts | Covered | P1 | Aggiungere filtri periodo edge per reporting |
| FR1 | Funzionale | Configuratore visuale per categoria selezionata | kompozer/e2e/__tests__/cad.integration.test.ts | Covered | P0 | Nessuno bloccante |
| FR2 | Funzionale | Aggiornamento anteprima configurazione | kompozer/backend/cadService/__tests__/useCases/cadCommands.test.ts, kompozer/e2e/__tests__/cad.integration.test.ts | Partial | P1 | Mancano smoke UI specifici su refresh anteprima |
| FR3 | Funzionale | Aggiornamento prezzo stimato durante configurazione | kompozer/backend/cadService/__tests__/domain/deriveBom.test.ts, kompozer/e2e/__tests__/cad.integration.test.ts | Partial | P1 | Mancano test UI prezzo live e regressioni UX |
| FR4 | Funzionale | Configurazione finalizzata aggiungibile al carrello | kompozer/e2e/__tests__/cad.integration.test.ts, kompozer/e2e/__tests__/cart.integration.test.ts | Covered | P0 | Nessuno bloccante |
| FR5 | Funzionale | Chatbot contestuale prezzi componenti | kompozer/e2e/__tests__/chatbot.integration.test.ts | Partial | P0 | Ownership isolation aggiunta; restano multi-turn avanzato ed error-path |
| FR6 | Funzionale | Salvataggio configurazione per utente autenticato | kompozer/e2e/__tests__/cad.integration.test.ts, kompozer/backend/cadService/__tests__/useCases/listConfigurations.test.ts | Partial | P1 | Aggiungere e2e esplicito lista configurazioni per utente |
| FR7 | Funzionale | Ripresa configurazioni salvate | kompozer/backend/cadService/__tests__/useCases/listConfigurations.test.ts, kompozer/frontend/src/views/ConfigurationsView.vue | Partial | P0 | Manca evidenza e2e dedicata user flow completo |
| FR8 | Funzionale | Notifica variazioni prezzo/disponibilita | kompozer/e2e/__tests__/notifications.integration.test.ts | Covered | P0 | Isolamento cross-user validato runtime |
| FR9 | Funzionale | Divieto mix categorie incompatibili | kompozer/backend/cadService/__tests__/useCases/cadCommands.test.ts | Covered | P0 | Nessuno bloccante |
| FR10 | Funzionale | Admin aggiorna catalogo (prezzo/disponibilita) | kompozer/e2e/__tests__/catalog.integration.test.ts | Covered | P0 | Nessuno bloccante |
| FR11 | Funzionale | Admin consulta ordini e reporting trend | kompozer/e2e/__tests__/order.integration.test.ts, kompozer/e2e/__tests__/reporting.integration.test.ts | Covered | P0 | Estendere reporting con validazioni date edge |
| NFR1 | Non Funzionale | Usabilita e chiarezza flusso | kompozer/frontend/src/views/*.vue + smoke desktop/mobile base (2026-07-10), test automatici assenti | Partial | P1 | Evolvere con smoke checklist piu granulare o test UI automatici |
| NFR2 | Non Funzionale | Feedback immediato azioni principali | frontend loading/error states + ToastHost, test automatici assenti | Partial | P1 | Standardizzare feedback e aggiungere smoke assert |
| NFR3 | Non Funzionale | Accessibilita base | role=alert + aria-live sulle viste core, labeling controlli principali, focus style globale, verifica minima 2026-07-10 | Covered | P0 | Nessun bloccante Sprint 5; migliorare con audit keyboard dedicato |
| NFR4 | Non Funzionale | Responsive desktop/mobile | rifinitura breakpoint applicata su header, cad, cart, catalog, configurations + smoke desktop/mobile base (2026-07-10) | Covered | P0 | Nessun bloccante Sprint 5; ampliare scenario mobile avanzato |
| NFR5 | Non Funzionale | Prestazioni percepite/realtime | copertura implicita e2e, no benchmark | Missing | P1 | Definire verifica minima tempi risposta percepita |
| NFR6 | Non Funzionale | Affidabilita notifiche realtime | kompozer/e2e/__tests__/notifications.integration.test.ts (poll/retry) | Partial | P1 | Aggiungere scenari multipli subscription e consistenza |
| NFR7 | Non Funzionale | Sicurezza ruoli endpoint admin | kompozer/e2e/__tests__/catalog.integration.test.ts, kompozer/e2e/__tests__/reporting.integration.test.ts | Covered | P0 | Validato su full suite e2e in doppia run consecutiva |
| NFR8 | Non Funzionale | Privacy/minimizzazione dati | e2e cross-user isolation in cad/orders/chatbot/notifications (runtime green) | Covered | P0 | Validato su full suite e2e in doppia run consecutiva |
| NFR9 | Non Funzionale | Manutenibilita/modularita | struttura microservizi + unit test diffusi | Covered | P1 | Nessuno bloccante |
| NFR10 | Non Funzionale | Sostenibilita scope essenziale | checklist sprint e priorita definite | Covered | P1 | Nessuno bloccante |

## Sprint 5 Backlog Derived From Matrix

### P0 - Security and Core Evidence
1. Estendere e2e RBAC e ownership isolation su:
   - kompozer/e2e/__tests__/cad.integration.test.ts [implementato, da validare runtime]
   - kompozer/e2e/__tests__/order.integration.test.ts [implementato, da validare runtime]
   - kompozer/e2e/__tests__/chatbot.integration.test.ts [implementato, da validare runtime]
   - kompozer/e2e/__tests__/notifications.integration.test.ts [implementato, da validare runtime]
   - kompozer/e2e/__tests__/reporting.integration.test.ts [implementato, da validare runtime]
2. Aggiungere e2e dedicato a FR7 (ripresa configurazioni utente salvate).
3. Rifinitura NFR frontend minima:
   - role=alert sugli errori principali
   - labeling accessibile su controlli core
   - review responsive su cad/cart/catalog/configurations/admin orders/reports

### P1 - Completeness and Robustness
1. Estendere chatbot multi-turn e scenari errore.
2. Rafforzare notifiche con multi-subscription e coerenza eventi consecutivi.
3. Definire smoke test UI guidati per usability/feedback.

## Definition of Done Sprint 5 (Traceability View)

- Nessun requisito P0 in stato Missing.
- Tutti i requisiti P0 almeno in stato Covered o Partial con task chiuso.
- E2E suite security-first verde.
- E2E full suite verde in 2 run consecutive (stabilita).
- Evidenze comandi test/build/e2e archiviate in utilities/sprint5-evidence.md.
