/* ============================================================
   Popup de choix de classe (#225) — onboarding du niveau scolaire.
   S'affiche à la première utilisation d'un profil sans classe choisie,
   uniquement si plusieurs niveaux ont du contenu (sinon aucun choix utile).
   Choix FORCÉ : pas de croix ni de fermeture au fond — l'enfant choisit sa
   classe (réglage de CONTENU, jamais présenté comme un score ; vocabulaire
   neutre « CE2 / CM1 », jamais « plus facile »).
   ============================================================ */
import { besoinChoixNiveau } from '../core/niveau-actif';
import { availableLevels, LEVEL_LABEL } from '../core/levels';
import { getAllLessons } from '../core/catalog';
import type { SchoolLevel } from '../core/catalog';
import { setNiveauReference } from '../core/profiles';
import { activateModal } from './modal-a11y';

/* Affiche la popup si — et seulement si — un choix de classe est requis.
   `onChosen` est rappelé après le choix (re-rendu de la vue courante). */
export function maybeShowClassChoice(onChosen?: () => void): void {
	if (!besoinChoixNiveau()) return;
	showClassChoice(onChosen);
}

/* Construit et affiche la popup (overlay créé à la volée, retiré au choix). */
export function showClassChoice(onChosen?: () => void): void {
	const niveaux = availableLevels(getAllLessons());
	const overlay = document.createElement('div');
	overlay.className = 'modal-overlay';
	overlay.id = 'onboardingNiveau';
	overlay.innerHTML = `
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="onbNivTitle">
			<div class="modal-emoji" aria-hidden="true">🎒</div>
			<h2 class="modal-title" id="onbNivTitle">Tu es en quelle classe&nbsp;?</h2>
			<p class="onb-niv-sub">Choisis ta classe pour avoir les bons exercices.</p>
			<div class="onb-niv-choices">
				${niveaux
					.map(
						(lv) =>
							`<button class="onb-niv-btn" type="button" data-niveau="${lv}">${LEVEL_LABEL[lv]}</button>`,
					)
					.join('')}
			</div>
		</div>`;
	document.body.appendChild(overlay);
	// Choix FORCÉ : focus-trap + arrière-plan inerte, mais PAS de fermeture par Échap
	// ni au clic sur le fond (onEscape omis). Focus initial sur le 1er choix (#235).
	const release = activateModal(overlay, {
		initialFocus: overlay.querySelector<HTMLButtonElement>('.onb-niv-btn'),
	});
	overlay.querySelectorAll<HTMLButtonElement>('[data-niveau]').forEach((btn) => {
		btn.addEventListener('click', () => {
			release(); // libère l'arrière-plan inerte + restaure le focus
			setNiveauReference(btn.dataset.niveau as SchoolLevel);
			overlay.remove();
			onChosen?.();
		});
	});
}
