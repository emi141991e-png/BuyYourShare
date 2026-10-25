export function mountListingRemoval(container, groups, {api, reload}) {
  groups.forEach((group, index) => {
    const card = container.querySelector(`#groupInstructions${index}`)?.closest('article');
    if (!card) return;
    const feedback = document.createElement('p');
    feedback.setAttribute('role', 'status');
    card.append(feedback);
    if (group.listingRemovedAt) {
      feedback.textContent = 'Annuncio eliminato dalla ricerca. Puoi ancora gestire le partecipazioni, le chat e le ricevute.';
      let archive = container.querySelector('[data-removed-listings]');
      if (!archive) {
        archive = document.createElement('details');
        archive.dataset.removedListings = '';
        const summary = document.createElement('summary');
        summary.textContent = 'Annunci eliminati';
        archive.append(summary);
        card.before(archive);
      }
      archive.append(card);
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.textContent = 'Elimina annuncio';
    card.append(button);
    button.addEventListener('click', async () => {
      if (!window.confirm(`Eliminare l’annuncio «${group.customServiceName}»? Non sarà più visibile e non riceverai nuovi ingressi. Le partecipazioni già accettate, le chat e le ricevute restano disponibili. Non vengono annullati abbonamenti o pagamenti.`)) return;
      button.disabled = true;
      button.textContent = 'Eliminazione…';
      try {
        await api(`/api/groups/${encodeURIComponent(group.id)}/remove-listing`, {});
        feedback.textContent = 'Annuncio eliminato.';
        button.remove();
        await reload();
      } catch (error) {
        feedback.textContent = error.message || 'Non è stato possibile eliminare l’annuncio. Riprova.';
        button.disabled = false;
        button.textContent = 'Elimina annuncio';
      }
    });
  });
}
