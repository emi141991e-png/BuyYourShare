export function renderMarketplaceWelcome(container) {
  container.innerHTML = `<section class="p2p-access"><div class="billing-card" style="max-width:680px;margin:32px auto">
    <span class="billing-eyebrow">BENVENUTO NEL MARKETPLACE</span>
    <h1>Inizia dal tuo account BYS.</h1>
    <p>Usa il tuo account BuyYourShare per entrare nel marketplace: non serve creare una seconda password.</p>
    <ol style="line-height:1.7;padding-left:24px"><li><strong>Accedi o registrati su BYS.</strong> La registrazione è gratuita.</li><li><strong>Attiva l’accesso quando vuoi creare o partecipare.</strong> Scegli mensile a 0,99 €, trimestrale a 2,69 € o annuale a 9,90 €. Google Pay e Apple Pay, sui dispositivi compatibili, attivano il periodo scelto dopo la conferma del pagamento. Con bonifico serve la verifica dell’incasso da parte di BYS.</li><li><strong>Scegli il tuo gruppo.</strong> Le quote si pagano separatamente e direttamente al capogruppo.</li></ol>
    <a class="btn btn-primary" style="display:flex;margin:20px 0 12px" href="https://buyyourshare.it/api/auth/p2p">Accedi con BYS e continua →</a>
    <p>Non hai un account? <a href="https://buyyourshare.it/register?callbackUrl=%2Fapi%2Fauth%2Fp2p"  rel="noopener noreferrer">Registrati gratuitamente su BYS ↗</a>. Dopo la registrazione ti riporteremo automaticamente nel marketplace.</p>
    <a class="btn btn-secondary" href="#home">Esplora prima i gruppi</a>
    <details style="margin-top:24px"><summary>Hai già un vecchio account marketplace o sei amministratore?</summary><p>Puoi continuare a usare il tuo accesso esistente, senza perdere gruppi e pagamenti.</p><a href="#login-locale">Accedi con le credenziali del marketplace →</a></details>
    <p style="margin-top:24px"><a href="https://buyyourshare.it/">← Torna a BuyYourShare</a></p>
  </div></section>`;
}
