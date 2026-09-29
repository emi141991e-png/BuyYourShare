# Accesso BYS tramite bonifico

Prezzo: EUR 0,99 per un mese di accesso. Coordinate fornite dal titolare e IBAN verificato formalmente (non prova di titolarita).

GET /api/p2p/bank restituisce coordinate, codice stabile e storico del solo utente. POST /api/p2p/bank/report registra una segnalazione senza concedere accesso.
GET /api/admin/bank-payments e POST /api/admin/bank-payments/report-by-code richiedono admin. POST /api/admin/bank-payments/:id/confirm richiede admin e riferimento univoco del movimento bancario; conferma idempotente, mai basata sulla sola dichiarazione utente.

Schema: p2pBankPayments conserva importo, codice, stato, amministratore, riferimento univoco bancario, timestamp e periodo. p2pSubscriptions aggiunge paymentMethod BANK e usa il gate di accesso esistente. Periodo aggiunto da max(ora, scadenza pagata), un mese di calendario. Scadenza applicata in ogni richiesta. Storico protetto da cancellazione utenti e reset legacy.

PayPal non terminale blocca il bonifico. L'utente deve chiudere la richiesta/rinnovo e riconciliarlo prima di pagare. Le identita PayPal cancellate vengono archiviate in retiredIds affinche webhook tardivi non modifichino l'accesso bancario. Il ritorno da BANK a PayPal richiede assistenza: non si avviano due flussi contemporanei.

Il bonifico periodico deve essere impostato dall'utente nella propria banca. Non e un mandato di addebito BYS. La verifica degli accrediti rimane manuale. Promemoria persistenti a tre giorni dalla scadenza e alla scadenza; push tramite pipeline esistente, solo dispositivi autorizzati. Nessuna garanzia di consegna del sistema operativo. Nessuna movimentazione delle quote dei gruppi.

Verifica: test servizio (concorrenza, doppioni, permessi, rollback, mesi corti, scadenza, webhook obsoleti, reminder), HTTP reale locale con DB isolato; suite P2P e build.

## Aggiornamento: PayPal temporaneamente nascosto
P2P_PAYPAL_CHECKOUT_ENABLED deve essere esplicitamente true per mostrare e avviare nuovi checkout. Default false: interfaccia propone il bonifico, nessun link di approvazione restituito all'utente. Webhook e gestione delle sottoscrizioni esistenti rimangono funzionanti. Non cambiare PAYMENTS_MODE.
Le richieste APPROVAL_PENDING vengono conservate e non impediscono la segnalazione e conferma del bonifico; lo stato PayPal viene letto nuovamente prima delle due operazioni. Sottoscrizioni attive o anomalie richiedono verifica per evitare sovrapposizioni.
Il bonifico mantiene l'identita PayPal pending. Un successivo evento aggiorna solo lo stato osservato del provider, registra il webhook e segnala all'admin un'eventuale sovrapposizione; non modifica il periodo bancario. Un vecchio link gia aperto potrebbe ancora essere approvato su PayPal: nasconderlo sul sito non lo revoca. Nessuna cancellazione o rimborso automatico.
La riattivazione futura del checkout richiede collaudo e scelta esplicita del gestore; gli utenti gia passati a BANK continuano a richiedere assistenza per il cambio metodo.
