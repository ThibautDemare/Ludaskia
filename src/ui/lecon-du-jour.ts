/* ============================================================
   Carte « leçon du jour » de l'accueil (#208) — couche UI.
   ------------------------------------------------------------
   `#leconDuJour` est une CARTE de la rangée d'accès (`.cards`), sur le même modèle
   visuel que Sprint / Révision / … (pastille d'icône, titre, descriptif, CTA). Son
   contenu est DYNAMIQUE : la prochaine leçon à travailler (core/lecon-du-jour.ts).
   Cliquer la carte lance la leçon (startLecon → gère les modes). « Voir une autre
   leçon » contourne une leçon qui bloque (jamais de mur, cf. avis pédagogue). Quand
   tout est acquis, la carte félicite et mène à la révision (avancer vs entretenir).

   Re-rendu à chaque affichage de l'accueil (renderHomeStats). Le clic est délégué
   sur l'élément PERSISTANT (#leconDuJour), posé une seule fois : pas d'accumulation
   de listeners malgré les re-rendus. L'état (leçon courante / mode) vit dans les
   data-attributs de l'élément ; le contournement est éphémère (revenir sur l'accueil
   ré-affiche la vraie leçon du jour).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { SUBJECTS, CATEGORIES, getLessonById } from '../core/catalog';
import { sequenceLeconDuJour, leconSuivante } from '../core/lecon-du-jour';
import { icon } from './icon';
import { subjectTint, subjectIcon } from './cat-visuals';
import { startLecon, startRevisionEspacee } from './navigation';

/* Rend la carte dans `el`. `cibleId` (optionnel) force l'affichage d'une leçon
   précise — utilisé par « Voir une autre leçon » pour avancer dans le fil. */
export function renderLeconDuJour(el: HTMLElement | null, cibleId?: string): void {
	if (!el) return;
	const seq = sequenceLeconDuJour();
	const lesson = cibleId ? getLessonById(cibleId) : (seq[0] ?? null);

	if (!lesson) {
		// Tout le programme du niveau est acquis : félicitation + passerelle révision.
		el.dataset.mode = 'revision';
		delete el.dataset.lesson;
		el.innerHTML = `
      <div class="ico" aria-hidden="true">${icon('star')}</div>
      <h2>Bravo&nbsp;!</h2>
      <p>Tu as fait le tour des leçons de ta classe.</p>
      <span class="go">Réviser <span aria-hidden="true">→</span></span>`;
	} else {
		el.dataset.mode = 'lesson';
		el.dataset.lesson = lesson.id;
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
		el.innerHTML = `
      <div class="ico" style="background:${tint}" aria-hidden="true">${ico}</div>
      <h2>Ta prochaine leçon</h2>
      <p>
        <span class="lj-title">${escapeHTML(lesson.label)}</span>
        <span class="lj-sub">${sousTitre}</span>
      </p>
      <span class="go">C'est parti <span aria-hidden="true">→</span></span>
      ${autre}`;
	}

	// Listener posé UNE fois sur l'élément persistant (pas sur le contenu re-rendu).
	if (!el.dataset.wired) {
		el.addEventListener('click', onLeconCardClick);
		el.dataset.wired = '1';
	}
}

/* Clic sur la carte : « Voir une autre leçon » avance dans le fil (intercepté avant
   le lancement) ; sinon on lance la leçon (ou la révision si tout est acquis). */
function onLeconCardClick(e: Event): void {
	const el = e.currentTarget as HTMLElement;
	if ((e.target as HTMLElement).closest('[data-lj="autre"]')) {
		const next = leconSuivante(el.dataset.lesson ?? '');
		renderLeconDuJour(el, next ? next.id : undefined);
		return;
	}
	if (el.dataset.mode === 'revision') startRevisionEspacee();
	else if (el.dataset.lesson) startLecon(el.dataset.lesson);
}
