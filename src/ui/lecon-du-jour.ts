/* ============================================================
   Carte « leçon du jour » de l'accueil (#208) — couche UI.
   ------------------------------------------------------------
   `#leconDuJour` est une CARTE de la rangée d'accès (`.cards`), sur le même modèle
   visuel que Sprint / Révision / … (pastille d'icône, titre, descriptif, CTA). Son
   contenu est DYNAMIQUE : la prochaine leçon à travailler (core/lecon-du-jour.ts).
   Cliquer la carte lance la leçon (startLecon → gère les modes). « Voir une autre
   leçon » contourne une leçon qui bloque (jamais de mur, cf. avis pédagogue). Quand
   tout est acquis, la carte félicite et mène à la révision (avancer vs entretenir).

   Elle cède à son tour (#516) quand la carte « À revoir » n'a pas pu éviter la leçon du
   jour (une seule entrée épinglée, et c'est elle) : `eviterId` la fait avancer d'un cran
   dans son fil. Arbitrage complet dans core/accueil-propositions.ts.

   Re-rendu à chaque affichage de l'accueil (renderHomeStats). Le clic est délégué
   sur l'élément PERSISTANT (#leconDuJour), posé une seule fois : pas d'accumulation
   de listeners malgré les re-rendus. L'état (leçon courante / mode) vit dans les
   data-attributs de l'élément ; le contournement est éphémère (revenir sur l'accueil
   ré-affiche la vraie leçon du jour).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { SUBJECTS, CATEGORIES, getLessonById, type LessonDef } from '../core/catalog';
import { sequenceLeconDuJour, leconSuivante } from '../core/lecon-du-jour';
import { varianteTourFait, TEXTE_ENTRETIEN_TOUR } from '../core/carte-tour-fait';
import { choisirProchaineLecon } from '../core/accueil-propositions';
import { labelLecon } from '../core/levels';
import { niveauLecon } from '../core/niveau-actif';
import { icon } from './icon';
import { subjectTint, subjectIcon } from './cat-visuals';
import { startLecon, startRevisionEspacee } from './navigation';

/* Rend la carte dans `el`. `cibleId` (optionnel) force l'affichage d'une leçon
   précise — utilisé par « Voir une autre leçon » pour avancer dans le fil. `eviterId`
   (#516) est la leçon déjà proposée par la carte « À revoir » : on avance d'un cran
   dans le fil pour ne pas la proposer deux fois (sans jamais vider la carte).

   `eviterId` est MÉMORISÉ sur l'élément (comme le reste de l'état de la carte) : le
   défilement, lui, repasse par `cibleId` et perdrait sinon l'évitement — le doublon
   réapparaîtrait au premier clic sur « Voir une autre leçon ». Un `eviterId` vide doit
   EFFACER la trace : l'élément est persistant d'un rendu à l'autre. */
export function renderLeconDuJour(
	el: HTMLElement | null,
	cibleId?: string,
	eviterId?: string | null,
): void {
	if (!el) return;
	// Rendu coordonné par l'accueil (pas de `cibleId`) : on pose la trace, ou on l'efface
	// s'il n'y a plus rien à éviter. Défilement : on la garde telle quelle.
	if (cibleId === undefined) {
		if (eviterId) el.dataset.eviter = eviterId;
		else delete el.dataset.eviter;
	}
	const seq = sequenceLeconDuJour();
	const lesson = cibleId ? getLessonById(cibleId) : choisirProchaineLecon(seq, eviterId ?? null);

	if (!lesson) {
		// Plus aucune leçon à travailler ici : TRACE calme + passerelle révision (#276). La
		// célébration, elle, est partie au moment où le tour s'est achevé (trophée `tour-<niveau>`
		// → modale + confettis, cf. core/rewards.ts) ; la carte n'a pas à la rejouer à chaque
		// visite. Aucune mise en scène non plus : le gabarit de la rangée `.cards` vit de sa
		// répétition, et une médaille ne rentre pas dans une pastille de 64 px.
		// Le texte VARIE (rotation sur le jour du mois, aucun état persisté) : un message
		// identique réaffiché pendant des mois s'apprend à ne plus être lu.
		el.dataset.mode = 'revision';
		delete el.dataset.lesson;
		const v = varianteTourFait(new Date(Date.now()).getDate());
		el.innerHTML = `
      <div class="ico" aria-hidden="true">${icon('star')}</div>
      <h2>${escapeHTML(v.titre)}</h2>
      <p>${escapeHTML(v.texte)} ${escapeHTML(TEXTE_ENTRETIEN_TOUR)}</p>
      <button type="button" class="go" aria-label="Réviser tes leçons">Réviser <span aria-hidden="true">→</span></button>`;
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
        <span class="lj-title">${escapeHTML(labelLecon(lesson, niveauLecon(lesson)))}</span>
        <span class="lj-sub">${sousTitre}</span>
      </p>
      <button type="button" class="go" aria-label="Ta prochaine leçon : c'est parti">C'est parti <span aria-hidden="true">→</span></button>
      ${autre}`;
	}

	// Listener posé UNE fois sur l'élément persistant (pas sur le contenu re-rendu).
	if (!el.dataset.wired) {
		el.addEventListener('click', onLeconCardClick);
		el.dataset.wired = '1';
	}
}

/* Leçon suivante du fil pour « Voir une autre leçon », en SAUTANT celle que la carte
   « À revoir » propose déjà (#516) : sans ce saut, le premier clic sur le bouton
   ramenait le doublon que l'accueil venait d'éviter. Le saut est abandonné s'il ne mène
   nulle part (elle est la seule autre leçon du fil) — mieux vaut re-proposer la même
   leçon des deux côtés qu'un bouton qui ne fait rien. */
function defilement(el: HTMLElement): LessonDef | null {
	const courante = el.dataset.lesson ?? '';
	const next = leconSuivante(courante);
	if (!next || next.id !== el.dataset.eviter) return next;
	const apres = leconSuivante(next.id);
	return apres && apres.id !== courante ? apres : next;
}

/* Clic sur la carte : « Voir une autre leçon » avance dans le fil (intercepté avant
   le lancement) ; sinon on lance la leçon (ou la révision si tout est acquis). */
function onLeconCardClick(e: Event): void {
	const el = e.currentTarget as HTMLElement;
	if ((e.target as HTMLElement).closest('[data-lj="autre"]')) {
		renderLeconDuJour(el, defilement(el)?.id);
		return;
	}
	if (el.dataset.mode === 'revision') startRevisionEspacee();
	else if (el.dataset.lesson) startLecon(el.dataset.lesson);
}
