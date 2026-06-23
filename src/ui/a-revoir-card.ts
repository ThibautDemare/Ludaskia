/* ============================================================
   Carte « à revoir » de l'accueil (#234) — couche UI.
   ------------------------------------------------------------
   Quand l'encadrant épingle des leçons à revoir (espace encadrant → file
   `ludaskia_revoir` du profil), une carte SUPPLÉMENTAIRE apparaît sur l'accueil
   de l'enfant, sur le même modèle que « leçon du jour » : clic = lancer la leçon,
   « voir une autre » fait défiler la liste en boucle. L'enfant n'a donc pas besoin
   d'être présent quand l'encadrant épingle.

   La carte est MASQUÉE tant que rien n'est à revoir, et s'auto-nettoie : on
   n'affiche que les leçons ENCORE faibles (revoirActives) — une notion redevenue
   solide quitte la boucle. Listener posé une seule fois (élément persistant).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { SUBJECTS, CATEGORIES } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { revoirActives } from '../core/encadrant-stats';
import { icon } from './icon';
import { subjectTint, subjectIcon } from './cat-visuals';
import { startLecon } from './navigation';

/* Leçon « à revoir » suivante dans la liste active (cyclique → ne bloque jamais). */
function suivante(apresId: string): LessonDef | null {
	const lecons = revoirActives();
	if (lecons.length === 0) return null;
	const i = lecons.findIndex((l) => l.id === apresId);
	return i < 0 ? lecons[0] : lecons[(i + 1) % lecons.length];
}

/* Rend la carte dans `el`. `cibleId` force une leçon précise (« voir une autre »). */
export function renderARevoir(el: HTMLElement | null, cibleId?: string): void {
	if (!el) return;
	const lecons = revoirActives();
	// Rien à revoir → carte retirée (display:none, robuste face au `display` de .card).
	if (lecons.length === 0) {
		el.style.display = 'none';
		delete el.dataset.lesson;
		el.innerHTML = '';
		return;
	}
	el.style.display = '';
	const lesson = (cibleId && lecons.find((l) => l.id === cibleId)) || lecons[0];
	el.dataset.lesson = lesson.id;
	const subject = SUBJECTS.find((s) => s.id === lesson.subject);
	const cat = CATEGORIES.find((c) => c.id === lesson.category);
	const tint = subjectTint(lesson.subject);
	const ico = icon(cat?.icon ?? subjectIcon(lesson.subject));
	const sousTitre = `${escapeHTML(subject?.label ?? '')}${cat ? ' · ' + escapeHTML(cat.label) : ''}`;
	// « Voir une autre » n'a de sens que s'il reste plus d'une leçon à revoir.
	const autre =
		lecons.length > 1
			? `<button class="lj-autre" type="button" data-ar="autre">Voir une autre leçon</button>`
			: '';
	el.innerHTML = `
    <div class="ico" style="background:${tint}" aria-hidden="true">${ico}</div>
    <h2>À revoir</h2>
    <p>
      <span class="lj-title">${escapeHTML(lesson.label)}</span>
      <span class="lj-sub">${sousTitre}</span>
    </p>
    <span class="go">On y retourne <span aria-hidden="true">→</span></span>
    ${autre}`;

	if (!el.dataset.wired) {
		el.addEventListener('click', onARevoirClick);
		el.dataset.wired = '1';
	}
}

/* Clic : « voir une autre » avance dans la liste ; sinon lance la leçon courante. */
function onARevoirClick(e: Event): void {
	const el = e.currentTarget as HTMLElement;
	if ((e.target as HTMLElement).closest('[data-ar="autre"]')) {
		const next = suivante(el.dataset.lesson ?? '');
		renderARevoir(el, next ? next.id : undefined);
		return;
	}
	if (el.dataset.lesson) startLecon(el.dataset.lesson);
}
