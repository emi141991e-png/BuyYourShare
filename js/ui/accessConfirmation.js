import { accessPlan, accessRemainingDays } from '../config/accessPlans.js';

export function showAccessConfirmation(subscription, next) {
  if (!subscription?.accessAllowed) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'bys-access-confirmation';
  dialog.setAttribute('aria-labelledby', 'bys-active-title');
  dialog.innerHTML = '<div class="bys-active-check" aria-hidden="true">✓</div><p>IL TUO ABBONAMENTO BYS È</p><h2 id="bys-active-title">ATTIVO</h2><p class="bys-active-description">Puoi ora partecipare ai gruppi e creare il tuo.</p><div class="bys-active-summary"><strong data-active-plan></strong><span data-active-expiry></span></div><button type="button" class="btn btn-primary" autofocus>Continua nel marketplace →</button>';
  const total = document.createElement('strong');
  total.className = 'bys-active-total';
  total.textContent = `${accessRemainingDays(subscription.currentPeriodEnd)} giorni residui totali`;
  dialog.querySelector('.bys-active-summary').prepend(total);
  dialog.querySelector('[data-active-plan]').textContent = 'Ultimo acquisto: piano ' + accessPlan(subscription.accessPlanCode || 'MONTHLY').label.toLowerCase();
  dialog.querySelector('[data-active-expiry]').textContent = 'Attivo fino al ' + new Date(subscription.currentPeriodEnd).toLocaleDateString('it-IT', {day:'numeric',month:'long',year:'numeric'});
  const explanation = document.createElement('small');
  explanation.textContent = 'Il totale comprende anche i giorni dei precedenti acquisti ancora disponibili.';
  dialog.querySelector('.bys-active-summary').append(explanation);
  dialog.querySelector('button').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { dialog.remove(); void next(); }, {once:true});
  document.body.append(dialog);
  dialog.showModal();
}
