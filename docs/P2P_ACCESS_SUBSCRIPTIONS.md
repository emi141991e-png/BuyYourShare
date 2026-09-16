# Abbonamento di accesso P2P

## Confini e stato del rilascio

Il marketplace è `emi141991e-png/BuyYourShare`, servizio Express con SPA statica e archivio JSON persistente. `emi141991e-png/buyyourshare-platform` contiene soltanto pagina informativa e ponte SSO: non si aggiungono tabelle P2P al database Store.

Questa implementazione locale parte da `ca391e7`, copia disponibile del marketplace. Prima del rilascio confrontarla con HEAD GitHub e risolvere eventuali differenze. Nessuna chiamata live, nessuna credenziale o dato reale modificato. **Non pubblicare automaticamente questi commit.** Richiedono prima configurazione, riconciliazione legacy e prova sandbox descritti sotto; il branch non è un rilascio già attivato.

## Modello dati additivo

Non si riscrivono utenti o membership esistenti all'avvio. Le nuove collezioni sono create alla prima operazione:

| Collezione | Dati |
| --- | --- |
| `p2pSubscriptions` | Un record corrente per `userId`; ruolo P2P `MEMBER` o `GROUP_LEADER`, distinto dal ruolo amministrativo; `status`, `providerStatus`, `providerSubscriptionId`, `planId`, `customId`, `currentPeriodStart`, `currentPeriodEnd`, `nextBillingDate`, `lastPaymentAt`, `cancelAtPeriodEnd`, `canceledAt` |
| stesso record | Intento persistente `requestId`/`requestedAt`; revisione `pendingRole`, `pendingPlanId`, `revisionRequestId`; `cancelRequestId`; ID precedenti `retiredIds`; `approvalUrl` |
| `p2pWebhookEvents` | ID evento univoco, tipo, subscription ID, data elaborazione; nessun payload personale completo |
| `p2pJoinRequests` | Richiesta di posto, utente, gruppo, stato pending/confirmed/canceled, membership risultante |

Le nuove membership di gruppo hanno `paymentMethod=DIRECT`, `paidFeeCents=0`, `autoRenew=false`: la conferma del capogruppo registra un mese di partecipazione dopo il pagamento diretto. Non è una ricevuta PayPal o un incasso BYS. Le quote seguono la suddivisione in centesimi già presente; la fee legacy non viene aggiunta. I contatti del capogruppo sono visibili solo a richiedenti, partecipanti e proprietario, non nel catalogo.

Il repository salva JSON con rename atomico. Le operazioni di abbonamento/webhook e le conferme dei posti sono serializzate in-process. **Richiede una sola replica/processo e volume persistente**. Prima di scalare occorrono transazioni e vincoli univoci in un database condiviso; non usare più repliche con questo archivio.

## PayPal e configurazione

Si mantiene PayPal Subscriptions v1, già presente nel marketplace. Il nuovo adapter è separato perché il vecchio servizio crea piani per quote e gestisce cancellazioni che possono fallire senza errore. Il nuovo adapter usa le credenziali ambientali già configurate solo nello stesso ambiente PayPal, oppure variabili dedicate. Nessuna modifica a `PAYMENTS_MODE`, Store Orders v2, Store production, ORA, ONDA o Printful.

Variabili del **solo marketplace**, da configurare in ambiente di prova prima del rilascio:

```text
P2P_BILLING_ENABLED=true
P2P_PUBLIC_URL=https://host-del-marketplace
P2P_PAYPAL_MODE=sandbox
P2P_PAYPAL_MEMBER_PLAN_ID=P-...
P2P_PAYPAL_LEADER_PLAN_ID=P-...
P2P_PAYPAL_WEBHOOK_ID=WH-...
```

`P2P_PAYPAL_CLIENT_ID` e `P2P_PAYPAL_CLIENT_SECRET` sono opzionali quando `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` appartengono allo stesso ambiente. Se si seleziona sandbox mentre il vecchio ambiente è live, occorrono credenziali sandbox dedicate: il client non riutilizza quelle live. Nessun segreto va nel browser. Il safety lock esistente blocca le chiamate live finché `PAYPAL_SAFETY_LOCK` non è esplicitamente `false`; questo lavoro non ne modifica il valore.

Servono due piani ACTIVE dello **stesso prodotto**, una sola fase REGULAR mensile illimitata, quantità non variabile, EUR 0.99 e 0.49, nessuna prova gratuita, setup fee o tassa aggiuntiva. La validazione server rifiuta prezzi e piani incompatibili. I JSON in `docs/p2p-paypal-plans.json` sono template senza credenziali; non creano risorse automaticamente. Configurare i tentativi di recupero pagamento nel provider; l'accesso rimane sospeso durante `past_due`.

## Endpoint e autorizzazioni

| Endpoint | Funzione |
| --- | --- |
| GET `/api/p2p/subscription` | Stato leggibile e disponibilità; sempre accessibile con login |
| POST `/api/p2p/subscription/start` | Ruolo MEMBER/GROUP_LEADER, prezzo dal server, creazione con intento e chiave idempotente persistenti |
| POST `/api/p2p/subscription/refresh` | Verifica server-to-server di stato, identità e piano; il ritorno dal browser non concede accesso |
| POST `/api/p2p/subscription/upgrade` | Revisione dello stesso ID verso il piano capogruppo |
| POST `/api/p2p/subscription/cancel` | Ferma rinnovi PayPal, conserva accesso al periodo già pagato |
| POST `/api/webhooks/p2p-paypal` | Verifica firma con PayPal e applicazione idempotente |
| POST `/api/p2p/groups/:id/request` | Richiesta di posto, nessun movimento di denaro |
| GET `/api/p2p/groups/:id/direct-payment` | Istruzioni private per pagamento al capogruppo |
| GET `/api/p2p/direct-memberships` | Richieste e partecipazioni proprie o dei gruppi gestiti |
| POST `/api/p2p/requests/:id/confirm` | Solo capogruppo, conferma esplicita ricezione diretta, un solo posto assegnato |
| POST `/api/p2p/requests/:id/cancel` | Richiedente o capogruppo annulla una richiesta pending |

Gruppi, membership, accessi, chat, ledger e notifiche richiedono sessione e abbonamento attivo non scaduto. Gli strumenti amministrativi rimangono protetti dal loro ruolo; non concedono al profilo un abbonamento gratuito. L'eliminazione account è bloccata finché il rinnovo BYS non è cancellato. Login, stato, refresh e cancellazione rimangono accessibili senza abbonamento attivo.

## Stati, rinnovi e cambio ruolo

- `pending`: approvazione o primo pagamento non confermato; funzioni bloccate.
- `active`: pagamento positivo in EUR e periodo verificato non scaduto. ACTIVE PayPal da solo non basta.
- `past_due`: pagamento fallito/scaduto; stato di tolleranza leggibile, gestione fatturazione disponibile, funzioni bloccate.
- `suspended`: sospensione provider; funzioni bloccate.
- `canceled`: periodo concluso dopo cancellazione o scadenza.
- `cancelAtPeriodEnd=true`: PayPal viene cancellato subito per evitare un altro addebito; l'accesso già pagato termina localmente alla fine del periodo. Non serve un cron per cancellare il provider. L'API distingue `providerStatus=CANCELLED` da accesso locale ancora attivo.

Un membro che sceglie Crea gruppo viene indirizzato al passaggio capogruppo. `/revise` restituisce il link di consenso PayPal; fino al consenso verificato rimangono ruolo e prezzo membro e la creazione del gruppo è bloccata. Dopo conferma si usa **lo stesso ID**, 0.49 dal prossimo ciclo, senza prorata, fee o seconda subscription. Nessun downgrade automatico se tutti i gruppi vengono chiusi. Un profilo che ha già gruppi parte come GROUP_LEADER. Anche un nuovo utente può scegliere il piano capogruppo per iniziare a crearli.

Un vecchio ID cancellato non viene sostituito finché rimane un periodo pagato; dopo scadenza si conserva in `retiredIds`. Una creazione con risposta persa riusa la stessa chiave, oppure è recuperata dal webhook e dal `custom_id` opaco. Dopo tre ore un intento ancora ambiguo richiede riconciliazione operativa: non viene mai generata automaticamente una nuova chiave rischiando un doppio abbonamento.

## Webhook

Registrare `BILLING.SUBSCRIPTION.ACTIVATED`, `UPDATED`, `PAYMENT.FAILED`, `CANCELLED`, `SUSPENDED`, `EXPIRED`, `PAYMENT.SALE.COMPLETED` sull'endpoint dedicato. La verifica usa `verify-webhook-signature` con il webhook ID dedicato e tutti gli header PayPal. Gli eventi riletti non applicano due volte gli effetti. Il gestore legge la subscription corrente dal provider, verificando ID, custom ID e piano: eventi fuori ordine non riattivano uno stato vecchio. Un errore provider o di persistenza non registra l'evento come elaborato e restituisce errore ritentabile. ID sconosciuti restituiscono 503 per indagine, invece di confermare silenziosamente un incasso perso.

## Legacy e precondizioni di deploy

Le vecchie rotte checkout/connect restituiscono 410 e non chiamano incassi, transfer o payout. Le vecchie rotte webhook restituiscono 503: un evento di quota preesistente deve essere riconciliato, non distribuito automaticamente dal nuovo codice.

**Questo non cancella le subscription già esistenti su PayPal/Stripe.** Non basta disabilitare un endpoint per fermare un addebito ricorrente esterno. Prima del cutover è necessario un inventario verificato dei precedenti abbonamenti e la loro disattivazione/migrazione con gestione dei periodi pagati. `ready()` blocca il nuovo servizio se una membership conserva un ID ricorrente senza `legacyBillingEndedAt` verificato. Non aggiungere tale attestazione finché non è stata controllata la cessazione effettiva presso il provider. La migrazione autorizzata è descritta di seguito.

Rilascio consentito solo dopo: confronto con HEAD, build/test verdi, prova sandbox end-to-end con approvazione/revisione/cancellazione reali di sandbox e webhook, piani validati, nessun vecchio addebito ricorrente residuo, volume persistente e singola replica, Railway stabile. Se queste condizioni non sono verificabili, mantenere i commit locali e non pubblicare.

## Verifiche

`npm run test:p2p`, `npm run test:sso`, `npm run test:security`, `npm run build`. I test usano provider simulato e server HTTP locale con database temporaneo creato vuoto: mai il database incluso nel repository, credenziali reali o pagamenti live. La SPA statica ha un controllo sintattico di tutti i JS come build. La piattaforma Next separata usa il proprio `npm run build` e suite di regressione esistente.

Riferimento PayPal sul cambio piano: https://developer.paypal.com/subscriptions/tiers (stesso prodotto, consenso richiesto, nuovo prezzo dal ciclo successivo, niente prorata automatico).

## Ambiente Railway sandbox isolato

Solo in `test`, usare `railway.p2p-sandbox.json`. L'avvio dedicato richiede credenziali P2P sandbox e crea esclusivamente `/app/server/data/p2p-sandbox-20260916/database.json`, vuoto, senza utenti o dati copiati. La creazione esclusiva preserva il file ai riavvii; un file preesistente senza marcatore sandbox causa arresto. Il comando di produzione resta invariato. Non usare questo file di configurazione in produzione.

## Migrazione legacy autorizzata

`P2P_LEGACY_RECONCILE_IDS` abilita una riconciliazione di avvio con allowlist esplicita di ID PayPal. Prima va cessato il rinnovo presso PayPal. Il codice non cancella abbonamenti: verifica stato CANCELLED/EXPIRED, corrispondenza utente/gruppo e ultimo pagamento EUR positivo. ID Stripe o PayPal non autorizzati arrestano l'avvio prima di applicare modifiche.

Per i precedenti piani mensili viene preservato un mese dall'ultimo pagamento verificato. Prima del salvataggio viene creata una copia esclusiva `database.json.before-p2p-<timestamp>.bak` sul volume persistente. Le membership vengono convertite al pagamento diretto, senza rinnovo automatico della quota. Un credito di accesso P2P (`migrationCredit`) copre il periodo pagato residuo: nessuna nuova subscription viene creata prima della sua scadenza. Alla scadenza l'utente deve approvare il nuovo piano; non si riusa il consenso del vecchio abbonamento. Le subscription di accesso già presenti non sono sovrascritte. La riconciliazione è idempotente.
