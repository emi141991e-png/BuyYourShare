# Checkout alternativo PayPal: solo sandbox

Il pulsante ufficiale JavaScript SDK usa vault=true, intent=subscription e valuta EUR.
Attivazione: P2P_PAYPAL_SDK_SANDBOX=true, esclusivamente con P2P_PAYPAL_MODE=sandbox.
Il server blocca il checkout SDK live anche se il flag è impostato. Nessuna modifica ai flussi Store o alla subscription live I-RH90T3DUC87S.

POST /api/p2p/subscription/sdk-start richiede autenticazione e riusa il servizio di creazione esistente, serializzato e idempotente. Piano e ruolo sono scelti dal server. Ritorna un ID solo per APPROVAL_PENDING. Una richiesta già pendente viene riutilizzata, non sostituita. Stati attivi o sospesi non creano duplicati.

onApprove non concede accesso né considera attendibile l'ID del browser: rilegge la subscription associata all'utente tramite il provider e richiede un pagamento verificato. onCancel non cancella contratti. Il collegamento di approvazione precedente resta disponibile come alternativa.

Verificare in sandbox: rendering pulsante, approvazione con conto personale di prova diverso dal venditore, callback e webhook, accesso dopo incasso, ripresa dopo chiusura checkout senza duplicati. Il successo sandbox non dimostra che il loop del conto live sia risolto. Nessuna promozione live prima del collaudo.

Riferimento: https://developer.paypal.com/sdk/js/v1/reference/#createsubscription
