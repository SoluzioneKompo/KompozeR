# Sprint 5 - Evidenze Comandi

Scopo: raccogliere output e stato dei comandi usati per validare la chiusura Sprint 5.

Legenda esito:
- PASS
- FAIL
- SKIPPED

## Run Log

| Data | Area | Comando | Esito | Note |
| --- | --- | --- | --- | --- |
| 2026-06-21 | Bootstrap Sprint 5 | Creazione matrice tracciabilita (utilities/traceability-matrix.md) | PASS | Baseline iniziale completata |
| 2026-06-21 | E2E Security-first | npm test -- --runInBand __tests__/order.integration.test.ts __tests__/cad.integration.test.ts __tests__/chatbot.integration.test.ts __tests__/reporting.integration.test.ts | FAIL | Ambiente non disponibile: gateway localhost:3000 non raggiungibile |
| 2026-06-21 | Env Check | node -e fetch('http://localhost:3000/health') | FAIL | Endpoint health non raggiungibile |
| 2026-06-21 | Type Safety E2E | node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit | PASS | Nuovi test e2e compilano correttamente |
| 2026-06-21 | E2E Security-first | Estesi test isolamento su notifications (list/read/subscription ownership) | PASS | Modificato notifications.integration.test.ts |
| 2026-06-21 | Type Safety E2E | node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit | PASS | Compilazione verde dopo patch notifications |
| 2026-06-21 | NFR Accessibility | Aggiunto role=alert aria-live=assertive sugli errori nelle viste core frontend | PASS | Aggiornate view utente/admin principali |
| 2026-06-21 | Frontend Build | npm run build | PASS | vue-tsc + vite build completati |
| 2026-06-21 | NFR Accessibility | Labeling controlli principali aggiunto (cart qty, catalog filters, cad controls, quick-create) | PASS | Migliorata accessibilita controlli core |
| 2026-06-21 | NFR Responsive | Rifiniti breakpoint su header/cad/cart/catalog/configurations | PASS | Migliorato comportamento tablet/mobile |
| 2026-06-21 | Frontend Build | npm run build | PASS | Build verde dopo rifinitura responsive+labeling |
| 2026-06-21 | Env Recovery | docker compose -f docker-compose.dev.yml up -d cad-service reporting-service api-gateway | PASS | Servizi runtime rialzati |
| 2026-06-21 | E2E Setup | Patch globalSetup auth-aware su /cad/health e /reports/health | PASS | Eliminati wait falsi su endpoint health protetti |
| 2026-06-21 | E2E Runtime | npm test -- --runInBand __tests__/order.integration.test.ts | PASS | 6/6 test verdi |
| 2026-06-21 | E2E Runtime | npm test -- --runInBand __tests__/chatbot.integration.test.ts | PASS | 2/2 test verdi |
| 2026-06-21 | E2E Runtime | npm test -- --runInBand __tests__/cad.integration.test.ts __tests__/reporting.integration.test.ts | FAIL | 13/14 verdi, fix asserzione stato design CAD |
| 2026-06-21 | E2E Runtime | npm test -- --runInBand __tests__/notifications.integration.test.ts | PASS | 15/15 verdi dopo stabilizzazione checkout/eventi availability |
| 2026-06-21 | E2E Runtime | npm test -- --runInBand __tests__/order.integration.test.ts __tests__/cad.integration.test.ts __tests__/chatbot.integration.test.ts __tests__/notifications.integration.test.ts __tests__/reporting.integration.test.ts | PASS | Security-first consolidato: 37/37 verdi |
| 2026-06-21 | E2E Stabilization | Fix cart.integration.test.ts con seed SKU reale da catalogo | PASS | Eliminata dipendenza da SKU fissa non catalogata |
| 2026-06-21 | E2E Runtime | npm test -- --runInBand __tests__/cart.integration.test.ts | PASS | 4/4 verdi dopo fix |
| 2026-06-21 | E2E Full Run | npm test -- --runInBand (run #1) | PASS | 8 suite, 69/69 test verdi |
| 2026-06-21 | E2E Full Run | npm test -- --runInBand (run #2) | PASS | 8 suite, 69/69 test verdi |
| 2026-07-10 | E2E Full Run | npm.cmd --prefix e2e test (run #1) | PASS | 8 suite, 73/73 test verdi |
| 2026-07-10 | E2E Full Run | npm.cmd --prefix e2e test (run #2) | PASS | 8 suite, 73/73 test verdi |
| 2026-07-10 | Frontend Build | npm.cmd --prefix frontend run build | PASS | vue-tsc + vite build completati |
| 2026-07-10 | Smoke UI Desktop | frontend preview + verifica navigazione guest/admin | PASS | Percorsi verificati: login/guest -> cad/cart/chatbot, login admin -> admin orders/admin catalog/admin reports |
| 2026-07-10 | Smoke UI Mobile Base | viewport 390x844 su preview frontend | PASS | Percorsi verificati: admin orders, admin catalog, chatbot |
| 2026-07-10 | Accessibility Minimum Check | verifica statica frontend (role=alert, aria-live, focus-visible) | PASS | Presenza confermata su viste core e stile focus globale |

## Checklist Evidenze Finali (da completare)

- [x] E2E security-first (auth/catalog/cad/order/notifications/chatbot/reporting)
- [x] E2E full sprint run stabile (2 run consecutivi)
- [x] Build frontend
- [ ] Smoke manuale desktop/mobile
- [x] Smoke manuale desktop (user path + admin path, nessun blocker)
- [x] Smoke manuale mobile (base)
- [x] Verifica accessibilita minima (focus visibile + form label + role alert/aria-live)
