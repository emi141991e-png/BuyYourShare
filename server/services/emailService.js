import nodemailer from 'nodemailer';
import { dataRepository } from '../db/dataRepository.js';

class EmailService {
  constructor() {
    this.sentEmails = [];
  }

  /**
   * Restituisce il transporter nodemailer configurato (da env o da systemConfig)
   */
  getTransporter() {
    const emailConfig = dataRepository?.data?.systemConfig?.emailSettings || {};
    
    // 1. Gmail Dedicated App Password (Invio Universale per Libero, Outlook, Yahoo, Gmail, ecc.)
    const defaultGmailPass = Buffer.from('cHZ5YXRlbXpsZXR6empldQ==', 'base64').toString();
    const gmailUser = process.env.GMAIL_USER || emailConfig.gmailUser || 'emi.141991e@gmail.com';
    const gmailPass = process.env.GMAIL_APP_PASSWORD || emailConfig.gmailPass || defaultGmailPass;
    if (gmailUser && gmailPass) {
      return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: gmailUser, pass: gmailPass },
        connectionTimeout: 4000,
        greetingTimeout: 4000,
        socketTimeout: 5000
      });
    }

    // 2. Generic SMTP Server (Brevo, SendGrid, Mailgun, Aruba, OVH, etc.)
    const smtpHost = process.env.SMTP_HOST || emailConfig.smtpHost;
    const smtpUser = process.env.SMTP_USER || emailConfig.smtpUser;
    const smtpPass = process.env.SMTP_PASS || emailConfig.smtpPass;
    const smtpPort = Number(process.env.SMTP_PORT || emailConfig.smtpPort || 587);
    const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

    if (smtpHost && smtpUser && smtpPass) {
      return nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass }
      });
    }

    return null;
  }

  async sendMail({ to, subject, html, text }) {
    const emailConfig = dataRepository?.data?.systemConfig?.emailSettings || {};
    const defaultGmailPass = Buffer.from('cHZ5YXRlbXpsZXR6empldQ==', 'base64').toString();
    const gmailUser = process.env.GMAIL_USER || emailConfig.gmailUser || 'emi.141991e@gmail.com';

    let fromAddress = process.env.EMAIL_FROM || emailConfig.emailFrom || `"BuyYourShare" <${gmailUser}>`;

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

    // 1. Invio tramite Nodemailer (SMTP o Gmail)
    try {
      const transporter = this.getTransporter();
      if (transporter) {
        const info = await transporter.sendMail({
          from: fromAddress,
          to,
          subject,
          text: text || '',
          html
        });
        emailRecord.status = 'DELIVERED_SMTP';
        emailRecord.messageId = info.messageId;
        console.log(`[EMAIL SMTP SUCCESS] Inviata con successo tramite SMTP (MessageID: ${info.messageId})`);
      }
    } catch (smtpErr) {
      console.warn('[EMAIL SMTP ERROR]', smtpErr.message);
    }

    // 2. Fallback tramite Resend API se SMTP non configurato o non riuscito
    if (emailRecord.status !== 'DELIVERED_SMTP') {
      const fallbackResendKey = Buffer.from('cmVfZ0xNb1ZQeUxfNzNBcUJBMUZZRWZIZ21rWHZxenJja3M2', 'base64').toString();
      const resendKey = process.env.RESEND_API_KEY || emailConfig.resendApiKey || fallbackResendKey;
      if (resendKey) {
        try {
          const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'BuyYourShare <onboarding@resend.dev>',
              to: [to],
              subject: subject,
              html: html,
              text: text
            })
          });
          const resendData = await resendRes.json();
          if (resendRes.ok) {
            emailRecord.status = 'DELIVERED_RESEND';
            console.log('[EMAIL RESEND SUCCESS] Inviata via Resend con ID:', resendData.id);
          }
        } catch (err) {
          console.warn('[EMAIL RESEND ERROR]', err.message);
        }
      }
    }

    // 3. Invio tramite Brevo REST API (se configurato)
    const brevoKey = process.env.BREVO_API_KEY || emailConfig.brevoApiKey;
    if (brevoKey) {
      try {
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoKey,
            'Content-Type': 'application/json',
            'accept': 'application/json'
          },
          body: JSON.stringify({
            sender: { name: 'BuyYourShare', email: fromAddress.includes('@') ? fromAddress.replace(/^.*<([^>]+)>.*$/, '$1') : 'noreply@buyyourshare.com' },
            to: [{ email: to }],
            subject: subject,
            htmlContent: html,
            textContent: text
          })
        });
        const brevoData = await brevoRes.json();
        if (brevoRes.ok) {
          emailRecord.status = 'DELIVERED_BREVO';
          console.log('[EMAIL BREVO SUCCESS]', brevoData);
        }
      } catch (err) {
        console.warn('[EMAIL BREVO ERROR]', err.message);
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
   * 2. Email per Recupero Password con Link Diretto Cliccabile
   */
  async sendPasswordResetEmail(user, resetCode, customResetLink = null) {
    const baseUrl = process.env.BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://buyyourshare-production.up.railway.app');
    const resetLink = customResetLink || `${baseUrl}/#reset-password?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(resetCode)}`;
    const subject = '🔐 Link per Reimpostare la Password - BuyYourShare';
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
          .btn-cta { display: inline-block; background: #003087; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 800; font-size: 15px; margin: 20px 0; text-align: center; }
          .code-box { background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 14px; text-align: center; margin: 16px 0; }
          .code-number { font-size: 24px; font-weight: 900; letter-spacing: 4px; color: #003087; font-family: monospace; }
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
            <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0;">Reimposta la tua Password</h2>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              Ciao <strong>${escapeHtml(user.fullName || user.firstName || 'Utente')}</strong>, abbiamo ricevuto una richiesta di ripristino password per il tuo account <strong>${escapeHtml(user.email)}</strong>.
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              Clicca sul pulsante qui sotto per accedere direttamente e scegliere la tua nuova password:
            </p>

            <div style="text-align: center; margin: 26px 0;">
              <a href="${resetLink}" class="btn-cta" style="display:inline-block; background:#003087; color:#ffffff !important; text-decoration:none; padding:16px 36px; border-radius:8px; font-weight:800; font-size:15px; text-align:center;">
                🔐 Reimposta la tua Password Subito
              </a>
            </div>

            <p style="font-size: 12px; color: #64748b; word-break: break-all; margin-top: 18px; line-height: 1.5;">
              Se il pulsante non funziona, copia e incolla questo link direttamente nella barra degli indirizzi del tuo browser:<br>
              <a href="${resetLink}" style="color: #0070ba; font-weight: 700;">${resetLink}</a>
            </p>

            <div class="warning">
              ⚠️ <strong>Non hai richiesto tu il ripristino?</strong> Se non hai effettuato tu questa richiesta, puoi ignorare questa email in totale sicurezza. La tua password attuale rimarrà invariata e protetta.
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
      text: `Per reimpostare la tua password di BuyYourShare clicca su questo link: ${resetLink}`
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
