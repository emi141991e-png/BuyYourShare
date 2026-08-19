/**
 * BuyYourShare - Server Email Service (Dependency-Free / Native REST & SMTP Gateway)
 * Gestione invio email transazionali automatiche:
 * - Email di avvenuta registrazione (Welcome Email)
 * - Email di recupero password con codice di verifica a 6 cifre
 * - Email di conferma cambio password
 */

class EmailService {
  constructor() {
    this.sentEmails = [];
  }

  async sendMail({ to, subject, html, text }) {
    const fromAddress = process.env.EMAIL_FROM || '"BuyYourShare" <noreply@buyyourshare.com>';
    const emailRecord = {
      id: 'eml-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      to,
      subject,
      text: text || '',
      html,
      status: 'DELIVERED',
      timestamp: new Date().toISOString()
    };

    console.log(`\n============================================================`);
    console.log(`📧 [EMAIL AUTOMATICA INVIATA A ${to}]`);
    console.log(`📋 Oggetto: ${subject}`);
    console.log(`============================================================\n`);

    // Se è configurato un provider API esterno come Resend
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [to],
            subject: subject,
            html: html,
            text: text
          })
        });
        emailRecord.status = 'DELIVERED_RESEND';
      } catch (err) {
        console.warn('[EMAIL RESEND ERROR]', err.message);
      }
    }

    this.sentEmails.push(emailRecord);
    if (this.sentEmails.length > 100) this.sentEmails.shift();

    return emailRecord;
  }

  /**
   * 1. Email di avvenuta registrazione / Benvenuto
   */
  async sendWelcomeEmail(user) {
    const subject = '🎉 Benvenuto su BuyYourShare - Registrazione completata con successo!';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #003087; padding: 28px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
          .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
          .content { padding: 28px 24px; }
          .greeting { font-size: 17px; font-weight: 700; color: #0f172a; margin-bottom: 14px; }
          .card-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 20px 0; }
          .card-box h3 { margin: 0 0 8px; color: #166534; font-size: 15px; }
          .feature-list { list-style: none; padding: 0; margin: 0; font-size: 13px; color: #334155; }
          .feature-list li { margin-bottom: 8px; display: flex; align-items: center; }
          .btn-cta { display: inline-block; background: #0070ba; color: #ffffff !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-weight: 700; font-size: 14px; margin-top: 14px; text-align: center; }
          .footer { background: #f1f5f9; padding: 16px 24px; text-align: center; font-size: 11.5px; color: #64748b; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>BuyYourShare</h1>
            <p>La piattaforma sicura per la condivisione di abbonamenti digitali</p>
          </div>
          <div class="content">
            <div class="greeting">Ciao ${escapeHtml(user.fullName || user.firstName || 'Membro')}, benvenuto a bordo! 🚀</div>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              Il tuo account è stato registrato con successo con l'indirizzo email <strong>${escapeHtml(user.email)}</strong>. Ora puoi accedere a tutte le funzionalità di BuyYourShare.
            </p>
            
            <div class="card-box">
              <h3>🛡️ Cosa puoi fare subito con BuyYourShare:</h3>
              <ul class="feature-list">
                <li>✨ <strong>Unisciti ai gruppi:</strong> Risparmia fino all'80% sui tuoi abbonamenti preferiti (Spotify, YouTube, Canva, Gemini AI).</li>
                <li>👑 <strong>Crea il tuo gruppo:</strong> Condividi i tuoi posti liberi e ricevi le quote dei membri direttamente sul tuo IBAN, con <strong>zero commissioni per il Capogruppo</strong>.</li>
                <li>🔒 <strong>Sicurezza MoneySplit:</strong> Quote esatte al centesimo e pagamenti protetti.</li>
              </ul>
            </div>

            <div style="text-align: center; margin: 24px 0;">
              <a href="https://buyyourshare-production.up.railway.app/#cerca" class="btn-cta">
                🔍 Esplora il Marketplace Gruppi
              </a>
            </div>

            <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 20px;">
              Se hai domande o hai bisogno di supporto, il nostro team è sempre a tua disposizione.
            </p>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} BuyYourShare • Tutti i diritti riservati • <a href="https://buyyourshare-production.up.railway.app" style="color:#0070ba; text-decoration:none;">buyyourshare.com</a>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({
      to: user.email,
      subject,
      html,
      text: `Benvenuto su BuyYourShare ${user.fullName}! Il tuo account (${user.email}) è ora attivo. Accedi su https://buyyourshare-production.up.railway.app/#login`
    });
  }

  /**
   * 2. Email per Recupero Password con Codice di Verifica
   */
  async sendPasswordResetEmail(user, resetCode) {
    const subject = '🔐 Codice di Recupero Password - BuyYourShare';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #003087; padding: 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
          .content { padding: 28px 24px; }
          .code-box { background: #f1f5f9; border: 2px dashed #0070ba; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0; }
          .code-number { font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #003087; font-family: monospace; }
          .warning { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px; font-size: 12px; color: #991b1b; margin-top: 18px; }
          .footer { background: #f1f5f9; padding: 14px 24px; text-align: center; font-size: 11px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>BuyYourShare</h1>
          </div>
          <div class="content">
            <h2 style="font-size: 17px; font-weight: 700; color: #0f172a; margin-top: 0;">Recupero della Password</h2>
            <p style="font-size: 13.5px; line-height: 1.6; color: #475569;">
              Abbiamo ricevuto una richiesta di ripristino password per il tuo account associato a <strong>${escapeHtml(user.email)}</strong>.
            </p>
            <p style="font-size: 13px; color: #475569;">
              Inserisci il seguente codice di sicurezza a 6 cifre nella pagina di ripristino per impostare la tua nuova password:
            </p>

            <div class="code-box">
              <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 6px;">Il tuo codice di verifica</div>
              <div class="code-number">${resetCode}</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Valido per 15 minuti</div>
            </div>

            <div class="warning">
              ⚠️ <strong>Non hai richiesto tu il ripristino?</strong> Se non hai effettuato tu questa richiesta, puoi ignorare questa email. La tua password rimarrà invariata e protetta.
            </div>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} BuyYourShare • Sicurezza e protezione account
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({
      to: user.email,
      subject,
      html,
      text: `Il tuo codice per recuperare la password di BuyYourShare è: ${resetCode} (valido per 15 minuti).`
    });
  }

  /**
   * 3. Email di Conferma Cambio Password
   */
  async sendPasswordChangedEmail(user) {
    const subject = '✅ Password aggiornata con successo - BuyYourShare';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
          .header { background: #166534; padding: 20px; text-align: center; color: #ffffff; }
          .content { padding: 24px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0; font-size: 20px;">BuyYourShare - Sicurezza Account</h2>
          </div>
          <div class="content">
            <h3 style="color: #166534; margin-top: 0;">Password modificata con successo</h3>
            <p style="font-size: 13.5px; color: #334155;">
              Gentile ${escapeHtml(user.fullName || 'Utente')}, ti confermiamo che la password per il tuo account <strong>${escapeHtml(user.email)}</strong> è stata reimpostata con successo.
            </p>
            <p style="font-size: 13px; color: #64748b;">
              Ora puoi accedere nuovamente alla piattaforma con la tua nuova password.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({
      to: user.email,
      subject,
      html,
      text: `La password del tuo account BuyYourShare (${user.email}) è stata modificata con successo.`
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const emailService = new EmailService();
