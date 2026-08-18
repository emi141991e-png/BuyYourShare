/**
 * SubFlow - Modal & Form Manager
 * Gestisce l'apertura, precompilazione, preset e salvataggio/modifica
 */

import { PRESET_SERVICES } from '../config/presets.js';
import { addSubscription, updateSubscription, deleteSubscription } from '../storage/storageManager.js';

let activeEditingId = null;
let onSaveCallback = null;

export function initModal(onSave) {
  onSaveCallback = onSave;

  const modalOverlay = document.getElementById('subModal');
  const closeBtn = document.getElementById('closeModalBtn');
  const cancelBtn = document.getElementById('cancelModalBtn');
  const form = document.getElementById('subForm');
  const presetContainer = document.getElementById('presetsList');

  // Renderizza la griglia dei preset
  if (presetContainer) {
    presetContainer.innerHTML = PRESET_SERVICES.map(preset => `
      <div class="preset-item" data-id="${preset.id}">
        <div class="preset-logo" style="background-color: ${preset.brandColor}">
          ${preset.iconLetter}
        </div>
        <span class="preset-name">${preset.name}</span>
      </div>
    `).join('');

    // Click sui preset
    presetContainer.addEventListener('click', (e) => {
      const item = e.target.closest('.preset-item');
      if (!item) return;

      // Deseleziona altri
      presetContainer.querySelectorAll('.preset-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');

      const presetId = item.dataset.id;
      const preset = PRESET_SERVICES.find(p => p.id === presetId);
      if (preset) {
        document.getElementById('subName').value = preset.name;
        document.getElementById('subCategory').value = preset.category;
        document.getElementById('subCost').value = preset.defaultCost;
        document.getElementById('subCycle').value = preset.defaultCycle;
        document.getElementById('subBrandColor').value = preset.brandColor;
      }
    });
  }

  // Chiusura modale
  const closeModal = () => {
    modalOverlay.classList.remove('active');
    activeEditingId = null;
    form.reset();
    if (presetContainer) {
      presetContainer.querySelectorAll('.preset-item').forEach(el => el.classList.remove('selected'));
    }
  };

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Submit del Form
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('subName').value.trim();
    const category = document.getElementById('subCategory').value;
    const cost = parseFloat(document.getElementById('subCost').value);
    const billingCycle = document.getElementById('subCycle').value;
    const nextRenewalDate = document.getElementById('subRenewalDate').value;
    const brandColor = document.getElementById('subBrandColor').value || '#4f46e5';
    const notes = document.getElementById('subNotes')?.value || '';

    if (!name || isNaN(cost) || cost <= 0) {
      alert('Inserisci un nome valido e un importo maggiore di zero.');
      return;
    }

    const payload = {
      name,
      category,
      cost,
      billingCycle,
      nextRenewalDate,
      brandColor,
      notes
    };

    if (activeEditingId) {
      updateSubscription(activeEditingId, payload);
    } else {
      addSubscription(payload);
    }

    closeModal();
    if (onSaveCallback) onSaveCallback();
  });
}

/**
 * Apre il modale in modalità Aggiungi o Modifica
 */
export function openModal(subscriptionToEdit = null) {
  const modalOverlay = document.getElementById('subModal');
  const modalTitle = document.getElementById('modalTitle');
  const submitBtn = document.getElementById('saveSubBtn');
  const presetContainer = document.getElementById('presetsList');

  const nameInput = document.getElementById('subName');
  const catInput = document.getElementById('subCategory');
  const costInput = document.getElementById('subCost');
  const cycleInput = document.getElementById('subCycle');
  const dateInput = document.getElementById('subRenewalDate');
  const colorInput = document.getElementById('subBrandColor');
  const notesInput = document.getElementById('subNotes');

  if (presetContainer) {
    presetContainer.querySelectorAll('.preset-item').forEach(el => el.classList.remove('selected'));
  }

  if (subscriptionToEdit) {
    activeEditingId = subscriptionToEdit.id;
    modalTitle.textContent = 'Modifica Abbonamento';
    submitBtn.textContent = 'Aggiorna Modifiche';

    nameInput.value = subscriptionToEdit.name;
    catInput.value = subscriptionToEdit.category || 'Altro';
    costInput.value = subscriptionToEdit.cost;
    cycleInput.value = subscriptionToEdit.billingCycle || 'monthly';
    dateInput.value = subscriptionToEdit.nextRenewalDate || '';
    colorInput.value = subscriptionToEdit.brandColor || '#4f46e5';
    if (notesInput) notesInput.value = subscriptionToEdit.notes || '';
  } else {
    activeEditingId = null;
    modalTitle.textContent = 'Nuovo Abbonamento';
    submitBtn.textContent = 'Salva Abbonamento';

    nameInput.value = '';
    catInput.value = 'Streaming';
    costInput.value = '';
    cycleInput.value = 'monthly';

    // Suggerisci prossimo rinnovo tra 1 mese
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    dateInput.value = nextMonth.toISOString().split('T')[0];

    colorInput.value = '#4f46e5';
    if (notesInput) notesInput.value = '';
  }

  modalOverlay.classList.add('active');
  nameInput.focus();
}

/**
 * Conferma ed eliminazione
 */
export function handleDelete(id, name, onDeleted) {
  if (confirm(`Sei sicuro di voler eliminare l'abbonamento "${name}"?`)) {
    deleteSubscription(id);
    if (onDeleted) onDeleted();
  }
}
