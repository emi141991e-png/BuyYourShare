# Marketplace: abbonamento BYS e quote manuali

Il catalogo e il dettaglio dei gruppi sono pubblici. Creazione e richiesta di un posto richiedono un abbonamento BYS attivo da 99 centesimi EUR/mese; rimangono invariati piani, credenziali e webhook PayPal dell'accesso. Nessun pagamento delle quote passa da BYS.

Il capogruppo indica email PayPal oppure IBAN con intestatario. L'IBAN è validato con checksum, ma non si certificano titolarità né capacità di ricevere fondi. I recapiti non compaiono nel catalogo pubblico; una copia è condivisa solo nella richiesta accettata, evitando cambi silenziosi dopo l'accordo.

## Ciclo della richiesta

`pending -> accepted -> reported -> confirmed`. L'accettazione riserva il posto per 48 ore. Una prenotazione non pagata scade; una dichiarazione di pagamento non scade automaticamente e richiede riconciliazione con il capogruppo. Solo il capogruppo può confermare un accredito. La conferma abilita un mese, con fine mese correttamente limitata a febbraio. Il rinnovo parte dalla scadenza precedente se anticipato, dalla conferma se tardivo. Una conferma ripetuta non estende nuovamente il periodo.

Le quote non sono incassi PayPal verificati da BYS: la UI esplicita chi dichiara e chi conferma. Per un bonifico periodico, il membro deve usare la propria banca. Non vengono creati ordini PayPal per le quote manuali. I vecchi nuovi ordini sono disabilitati; webhook e riconciliazione restano disponibili per la cronologia preesistente.

## Dati e API

Archivio JSON persistente, migrazione additiva: `groups.manualPaymentDestination`, `p2pManualRequests`, `p2pPrivateMessages`, `p2pManualConfirmations`. Membership con `paymentProvider: MANUAL`, `paymentMethod: DIRECT`, `autoRenew: false`. Nessun dato reale cancellato.

- GET `/api/groups` e `/api/groups/:id`: pubblici e privi di dati di pagamento e identità degli altri membri.
- POST `/api/groups`: abbonamento attivo, recapiti obbligatori.
- GET `/api/manual`: solo richieste proprie o dei gruppi propri.
- POST `/api/manual/groups/:id/request`: abbonamento attivo, posto disponibile.
- POST `/api/manual/:id/accept|report|confirm|cancel`: macchina a stati e controlli partecipante/capogruppo.
- GET/POST `/api/manual/:id/messages`: chat privata tra i due partecipanti, anche per chiarire pagamenti dopo scadenza dell'accesso BYS.

I messaggi sono testo, massimo 2000 caratteri, escapati nella UI. La chat aggiorna i messaggi ogni 10 secondi mentre è visibile. Nessun amministratore ottiene accesso tramite queste API.

## Promemoria

Il server controlla ogni minuto. Notifiche persistenti nel marketplace e messaggi di sistema nella chat: entro tre giorni dalla scadenza e alla scadenza. Chiave unica per richiesta/periodo/fase, recupero dopo riavvio, nessun duplicato. Non è web push a browser chiuso e non è email. Una quota scaduta viene mostrata come rinnovo in attesa; il posto non viene rivenduto finché non viene annullata la partecipazione. Cancellazione dell'abbonamento BYS distinta dalle quote.

Il servizio richiede una singola replica e volume persistente, come l'archivio attuale. Non scalare a più processi senza transazioni DB. I gruppi con storia manuale non vengono eliminati dal normale endpoint di cancellazione.

## Validazione

`npm run build`, `npm run test:p2p`, `npm run test:sso`, `npm run test:security`. Test su archivi temporanei: privacy, abbonamento obbligatorio alle azioni, slot concorrenti, conferma esclusiva del capogruppo, idempotenza, scadenza prenotazione e rinnovi. Nessun addebito live.
