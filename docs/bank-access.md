# Accesso BYS tramite bonifico

Prezzo: EUR 0,99 per un mese di accesso. Coordinate fornite dal titolare e IBAN verificato formalmente (non prova di titolarita).

GET /api/p2p/bank restituisce coordinate, codice stabile e storico del solo utente. POST /api/p2p/bank/report registra una segnalazione senza concedere accesso.
GET /api/admin/bank-payments e POST /api/admin/bank-payments/report-by-code richiedono admin. POST /api/admin/bank-payments/:id/confirm richiede admin e riferimento univoco del movimento bancario; conferma idempotente, mai basata sulla sola dichiarazione utente.

Schema: p2pBankPayments conserva importo, codice, stato, amministratore, riferimento univoco bancario, timestamp e periodo. p2pSubscriptions aggiunge paymentMethod BANK e usa il gate di accesso esistente. Periodo aggiunto da max(ora, scadenza pagata), un mese di calendario. Scadenza applicata in ogni richiesta. Storico protetto da cancellazione utenti e reset legacy.

PayPal non terminale blocca il bonifico. L'utente deve chiudere la richiesta/rinnovo e riconciliarlo prima di pagare. Le identita PayPal cancellate vengono archiviate in retiredIds affinche webhook tardivi non modifichino l'accesso bancario. Il ritorno da BANK a PayPal richiede assistenza: non si avviano due flussi contemporanei.

Il bonifico periodico deve essere impostato dall'utente nella propria banca. Non e un mandato di addebito BYS. La verifica degli accrediti rimane manuale. Promemoria persistenti a tre giorni dalla scadenza e alla scadenza; push tramite pipeline esistente, solo dispositivi autorizzati. Nessuna garanzia di consegna del sistema operativo. Nessuna movimentazione delle quote dei gruppi.

Verifica: test servizio (concorrenza, doppioni, permessi, rollback, mesi corti, scadenza, webhook obsoleti, reminder), HTTP reale locale con DB isolato; suite P2P e build.
