# Quote P2P PayPal — implementazione in collaudo

Il modulo quote è distinto dagli abbonamenti di accesso BYS e dallo Store. Il destinatario di ogni ordine è il merchant ID PayPal verificato del capogruppo. Non viene impostata alcuna platform fee; disbursement_mode è INSTANT. Possono comunque applicarsi tariffe, verifiche e blocchi PayPal. Capture COMPLETED non significa disponibilità irrevocabile o protezione dalle contestazioni.

## Stato del rilascio

Codice e test automatici pronti per sandbox; collaudo PayPal end-to-end e abilitazione live ancora da completare. Non abilitare in produzione sulla sola base dei test simulati. L’app sandbox Platform Partner App è configurata con onboarding Mixed, PayPal Checkout standard, senza Expanded Checkout, platform fee o accredito ritardato. PayPal documenta l’idoneità dei conti personali in Italia per onboarding prima del pagamento. La verifica completa con un conto personale resta parte del collaudo. L'app live BYS-Platform esistente non mostra le capacità Multiparty. Serve approvazione PayPal prima della configurazione live.

## Configurazione separata

- P2P_QUOTA_ENABLED=true
- P2P_QUOTA_PAYPAL_MODE=sandbox oppure live
- P2P_QUOTA_PAYPAL_CLIENT_ID / P2P_QUOTA_PAYPAL_CLIENT_SECRET: app partner dedicata, nessun fallback a Store o Subscriptions
- P2P_QUOTA_PAYPAL_PARTNER_ID: merchant ID della piattaforma
- P2P_QUOTA_PAYPAL_BN_CODE: attribution ID dell'app partner
- P2P_QUOTA_PAYPAL_WEBHOOK_ID
- P2P_PUBLIC_URL: origine del marketplace
- Solo live: P2P_QUOTA_LIVE_APPROVED=true dopo verifica effettiva dell'approvazione PayPal; resta applicato PAYPAL_SAFETY_LOCK.

Non modificare PAYMENTS_MODE né le credenziali Store/Subscriptions.

## Schema JSON

p2pPayees: userId, email, trackingId, requestId, status, consentAt, merchantId, verifiedAt. Il browser non può assegnare merchantId o attestare l'abilitazione. Cambio destinatario e consenso revocato richiedono revisione, senza sostituzioni silenziose.

p2pQuotaPayments: id, requestId, userId, ownerId, groupId, slotNumber, merchantId, amountCents, createKey, captureKey, orderId, captureId, status, createdAt, captureAttemptAt, confirmedAt, membershipId, periodEnd, netAmount. La membership DIRECT ha paymentProvider PAYPAL, paypalCaptureId, zero paidFeeCents e autoRenew false.

p2pQuotaWebhookEvents: id, type, processedAt. Persistenza su volume, singolo processo/replica come il repository JSON esistente.

## Endpoint

- GET /api/p2p/payee
- POST /api/p2p/payee/connect {email, consent:true}
- POST /api/p2p/payee/refresh
- POST /api/p2p/groups/:id/request {slotNumber}
- POST /api/p2p/requests/:id/order
- GET /api/p2p/quota-payments
- POST /api/p2p/quota-payments/:id/refresh (il membro può completare la capture; il capogruppo può solo verificarla)
- POST /api/p2p/requests/:id/cancel: non cancella localmente pagamenti ancora potenzialmente incassabili
- POST /api/webhooks/p2p-quota-paypal, firma verificata da PayPal

Le vecchie istruzioni di pagamento e la conferma manuale rispondono 410. Creazione/pubblicazione gruppo richiedono destinatario PayPal verificato. L'email IBAN/libera non viene usata per incassare quote.

## Webhook da registrare sull'app partner

MERCHANT.ONBOARDING.COMPLETED; MERCHANT.PARTNER-CONSENT.REVOKED; PAYMENT.CAPTURE.COMPLETED; PAYMENT.CAPTURE.PENDING; PAYMENT.CAPTURE.DENIED; PAYMENT.CAPTURE.DECLINED; PAYMENT.CAPTURE.REFUNDED; PAYMENT.CAPTURE.REVERSED.

Per capture completata il server rilegge l'ordine e verifica ID, custom_id, destinatario, EUR, importo e capture. Eventi duplicati non creano membership multiple; refund/reversal sono terminali e non vengono annullati da eventi completed tardivi. Eventi capture sconosciuti o provider non ancora coerente rispondono con errore retryable invece di perdere l'evento.

## Prenotazione e casi ambigui

Un intento persistente viene scritto prima di chiamare PayPal e riserva il posto. Le chiamate successive riusano le stesse chiavi; dopo cinque ore una creazione/capture ambigua richiede riconciliazione anziché rischiare un secondo addebito oltre la finestra di idempotenza del provider. Il ritorno al sito o l'annullamento del browser non provano l'assenza di pagamento. Un operatore deve verificare questi casi con PayPal prima di liberare il posto; nessun timeout locale lo libera automaticamente.

Ogni quota copre un mese dalla data della capture, senza rinnovo automatico della quota. Il rinnovo mensile automatico riguarda soltanto l'abbonamento di accesso BYS. Un nuovo pagamento della quota richiede una nuova richiesta dopo la scadenza.

## Verifica

Test locali: flusso positivo idempotente; destinatario/importo/custom_id alterati; beneficiario non verificato; pending; timeout con chiavi persistenti e concorrenza sul posto; refund/reversal fuori ordine; autorizzazioni buyer/leader; blocco live senza approvazione; ordine PayPal diretto senza fee. HTTP: conferma manuale disabilitata e pubblicazione bloccata senza PayPal configurato. Restano necessari test end-to-end con conti sandbox distinti, verifica ricezione sul conto seller, firma webhook reale e ritorno browser.

Fonti: https://developer.paypal.com/platforms/seller-onboarding/before-payment e https://developer.paypal.com/platforms/checkout/standard/integrate
