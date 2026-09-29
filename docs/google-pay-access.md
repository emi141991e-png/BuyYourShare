# Google Pay: accesso BYS per 30 giorni

Pagamento singolo 0,99 EUR con PayPal Orders v2, separato dai pagamenti Store e dalle quote dirette ai capigruppo. Nessun rinnovo automatico.

L'attivazione richiede un capture COMPLETED verificato dal server: ordine associato all'utente, custom_id, valuta, importo, fonte Google Pay e capture ID univoco. APPROVED o esito browser non attivano l'accesso. Durata esatta 30 x 24 ore dal capture; rinnovi anticipati aggiungono 30 giorni al periodo già pagato. La scadenza è verificata ad ogni richiesta protetta. Nessuna modifica retroattiva ai periodi bancari o PayPal ricorrenti esistenti.

GET /api/p2p/google-pay/config; POST /api/p2p/google-pay/orders; POST /api/p2p/google-pay/orders/:id/capture. Tutti autenticati. Intent e idempotency key persistiti prima dell'ordine; retry e riconciliazione server recuperano capture completati anche a browser chiuso. Un ordine pendente blocca il passaggio al bonifico per evitare duplicazioni. Ordini abbandonati/ambigui restano da riconciliare, non vengono sostituiti automaticamente.

Promemoria 3 giorni prima e alla scadenza nel centro notifiche e push sui dispositivi che hanno dato consenso. A scadenza cessano le funzioni riservate; il campo includedSupportAllowed espone l'idoneità all'assistenza inclusa. Conto, rinnovo e supporto pagamenti restano disponibili. Non esiste ancora una coda assistenza distinta che applichi quel campo: non bloccare il contatto generale. Le chat di quote già avviate restano consultabili per gestire pagamenti e contestazioni.

Attivazione sandbox: P2P_GOOGLE_PAY_ENABLED=true, con le credenziali P2P sandbox già configurate. Default disabilitato. Live richiede anche P2P_GOOGLE_PAY_LIVE_VERIFIED=true SOLO dopo onboarding PayPal Google Pay, prova completa in sandbox, verifica dominio e gestione rimborsi/storni verificata. La riconciliazione legge anche gli ordini confermati: un rimborso integrale dell’ultimo periodo Google Pay ripristina la scadenza precedente. Rimborsi parziali e modifiche con periodi successivi richiedono revisione amministrativa senza cancellare giorni di altri incassi. Non abilita né esegue rimborsi automatici. Storni e rilascio live richiedono ancora collaudo dedicato. Nessuna modifica a PAYMENTS_MODE o alle credenziali Store.

Guida: https://developer.paypal.com/v5/google-pay/integrate

## Verifica rilascio 29 settembre 2026

Google Pay risulta abilitato nell'app LIVE BYS-Platform; credenziali del servizio corrispondenti verificate senza modificarle. Il webhook P2P esistente conserva gli eventi subscription e riceve ora PAYMENT.CAPTURE.COMPLETED, PENDING, DENIED, REFUNDED e REVERSED. Dopo verifica della firma, il server rilegge l'ordine e applica i controlli di identità prima di concedere l'accesso. Gli eventi duplicati non aggiungono giorni. Uno storno richiede revisione notificata all'amministratore, senza cancellare periodi indipendenti. Il recupero periodico isola gli errori dei singoli ordini. Questi comportamenti sono coperti da test automatici; pagamento e rimborso integrale sono stati verificati in sandbox. Nessun pagamento reale eseguito durante il rilascio.

Sblocco Google Pay automatico, nessuna approvazione amministrativa ordinaria. Bonifico invariato con conferma amministrativa. Importo 0,99 EUR per 30 giorni, nuovo pagamento necessario alla scadenza. Le quote dei gruppi restano separate.
