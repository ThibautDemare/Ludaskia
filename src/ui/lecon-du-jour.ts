/* ============================================================
   Bloc « leçon du jour » de l'accueil (#208) — couche UI.
   ------------------------------------------------------------
   Affiche le prochain pas à travailler (core/lecon-du-jour.ts) sous forme d'une
   carte cliquable qui lance la leçon (startLecon → gère les modes). Un bouton
   « Voir une autre leçon » contourne une leçon qui bloque (jamais de mur, cf.
   avis pedagogue) ; quand tout est acquis, on félicite et on invite vers la
   révision (le bloc reste DISTINCT de la carte Révision : avancer vs entretenir).

   Re-rendu à chaque affichage de l'accueil (renderHomeStats). Le contournement
   est éphémère : revenir sur l'accueil ré-affiche la vraie leçon du jour (on lit
   la cible courante dans le DOM via `cibleId`, pas d'état de module à réinitialiser).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { SUBJECTS, CATEGORIES, getLessonById } from '../core/catalog';
import { sequenceLeconDuJour, leconSuivante } from '../core/lecon-du-jour';
import { icon } from './icon';
import { subjectTint, subjectIcon } from './cat-visuals';
import { startLecon, startRevisionEspacee } from './navigation';

/* Rend le bloc dans `el`. `cibleId` (optionnel) force l'affichage d'une leçon
   précise — utilisé par « Voir une autre leçon » pour avancer dans le fil. */
export function renderLeconDuJour(el: HTMLElement | null, cibleId?: string): void {
	if (!el) return;
	const seq = sequenceLeconDuJour();
	const lesson = cibleId ? getLessonById(cibleId) : (seq[0] ?? null);

	// Tout le programme du niveau est acquis : félicitation + passerelle révision.
	if (!lesson) {
		el.innerHTML = `<section class="lecon-jour lj-done">
      <p class="lj-done-msg">🎉 Bravo&nbsp;! Tu as fait le tour des leçons de ta classe.</p>
      <button class="lj-revision" type="button" data-lj="revision">${icon('repeat')} Réviser ce que tu as appris</button>
    </section>`;
		el.style.display = '';
		el.querySelector('[data-lj="revision"]')?.addEventListener('click', () =>
			startRevisionEspacee(),
		);
		return;
	}

	const subject = SUBJECTS.find((s) => s.id === lesson.subject);
	const cat = CATEGORIES.find((c) => c.id === lesson.category);
	const tint = subjectTint(lesson.subject);
	// Repli sur l'icône de la matière si la catégorie n'en a pas (pas de pastille vide).
	const ico = icon(cat?.icon ?? subjectIcon(lesson.subject));
	const sousTitre = `${escapeHTML(subject?.label ?? '')}${cat ? ' · ' + escapeHTML(cat.label) : ''}`;
	// « Voir une autre leçon » n'a de sens que s'il reste plus d'une leçon à faire.
	const autre =
		seq.length > 1
			? `<button class="lj-autre" type="button" data-lj="autre">Voir une autre leçon</button>`
			: '';

	el.innerHTML = `<section class="lecon-jour">
    <h2 class="lj-head">On continue&nbsp;?</h2>
    <button class="lj-card" type="button" data-lj="go" data-lesson="${escapeHTML(lesson.id)}">
      <span class="lj-ico" style="background:${tint}" aria-hidden="true">${ico}</span>
      <span class="lj-texts">
        <span class="lj-cat">${sousTitre}</span>
        <span class="lj-title">${escapeHTML(lesson.label)}</span>
      </span>
      <span class="lj-go">C'est parti <span aria-hidden="true">→</span></span>
    </button>
    ${autre}
  </section>`;
	el.style.display = '';

	el.querySelector('[data-lj="go"]')?.addEventListener('click', () => startLecon(lesson.id));
	el.querySelector('[data-lj="autre"]')?.addEventListener('click', () => {
		const next = leconSuivante(lesson.id);
		renderLeconDuJour(el, next ? next.id : undefined);
	});
}
