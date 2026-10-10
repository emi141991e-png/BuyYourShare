export function renderMarketplaceWelcome(container) {
  const candidate = new URLSearchParams(window.location.hash.split('?')[1] || '').get('next');
  const next = /^#gruppo-[a-zA-Z0-9-]+$/.test(candidate || '') ? candidate : '#home';
  const callback = '/api/auth/p2p?next=' + encodeURIComponent(next);
  const login = 'https://buyyourshare.it' + callback;
  const register = 'https://buyyourshare.it/register?callbackUrl=' + encodeURIComponent(callback);
  container.innerHTML = `<section class="p2p-access"><div class="billing-card" style="max-width:680px;margin:32px auto">
    <span class="billing-eyebrow">BENVENUTO SU BYS</span>
    <h1>Entra e trova il tuo gruppo.</h1>
    <p>Hai già un account BYS? Usa quello: ritroverai qui i tuoi gruppi e le tue conversazioni.</p>
    <ol style="line-height:1.7;padding-left:24px"><li><strong>Accedi o registrati su BYS.</strong> La registrazione è gratuita.</li><li><strong>Crea e gestisci i tuoi gruppi gratis. Attiva BYS per partecipare ai gruppi altrui.</strong> Scegli mensile a 0,99 €, trimestrale a 2,69 € o annuale a 9,90 €. Google Pay e Apple Pay, sui dispositivi compatibili, attivano il periodo scelto dopo la conferma del pagamento. Con bonifico serve la verifica dell’incasso da parte di BYS.</li><li><strong>Scegli il tuo gruppo.</strong> Le quote si pagano separatamente e direttamente al capogruppo.</li></ol>
    <a class="btn btn-primary" style="display:flex;margin:20px 0 12px" href="${login}">Accedi con BYS e continua →</a>
    <p>Non hai un account? <a href="${register}"  rel="noopener noreferrer">Registrati gratuitamente su BYS ↗</a>. Dopo la registrazione riprenderai da dove eri rimasto.</p>
    <a class="btn btn-secondary" href="#home">Esplora prima i gruppi</a>
    <details style="margin-top:24px"><summary>Hai già un vecchio account marketplace o sei amministratore?</summary><p>Puoi continuare a usare il tuo accesso esistente, senza perdere gruppi e pagamenti.</p><a href="#login-locale">Accedi con le credenziali del marketplace →</a></details>
    <p style="margin-top:24px"><a href="https://buyyourshare.it/">← Torna a BuyYourShare</a></p>
  </div></section>`;
}
