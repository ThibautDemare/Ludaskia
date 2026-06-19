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
	overlay.querySelectorAll<HTMLButtonElement>('[data-niveau]').forEach((btn) => {
		btn.addEventListener('click', () => {
			setNiveauReference(btn.dataset.niveau as SchoolLevel);
			overlay.remove();
			onChosen?.();
		});
	});
	// Focus le premier choix (navigation clavier ; le choix est obligatoire).
	overlay.querySelector<HTMLButtonElement>('.onb-niv-btn')?.focus();
}
