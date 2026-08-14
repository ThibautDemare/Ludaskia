/* ============================================================
   Carte « à revoir » de l'accueil (#234) — couche UI.
   ------------------------------------------------------------
   Quand l'encadrant épingle des leçons à revoir (espace encadrant → file
   `ludaskia_revoir` du profil), une carte SUPPLÉMENTAIRE apparaît sur l'accueil
   de l'enfant, sur le même modèle que « leçon du jour » : clic = lancer la leçon,
   « voir une autre » fait défiler la liste en boucle. L'enfant n'a donc pas besoin
   d'être présent quand l'encadrant épingle.

   Une entrée épinglée est soit une leçon du catalogue (lancée par `startLecon`), soit
   une liste de dictée d'orthographe (lancée par `startOrthoLecon`, hash dédié) — cf.
   `RevoirEntry`. Le libellé/l'icône sont dérivés selon la nature de l'entrée.

   La carte est MASQUÉE tant que rien n'est à revoir, et s'auto-nettoie : on
   n'affiche que les leçons ENCORE faibles / listes non encore acquises (revoirActives)
   — une notion redevenue solide quitte la boucle. Le rendu déclenche en plus le
   nettoyage DUR de la file (purgeRevoirSolides, #465) : l'entrée redevenue solide est
   retirée pour de bon, elle ne reste pas listée côté encadrant. Listener posé une seule
   fois (élément persistant).

   Elle CÈDE le pas à « Ta prochaine leçon » (#516) : quand la tête de file est aussi la
   leçon du jour, elle propose plutôt une autre entrée épinglée, pour que l'accueil ne
   montre pas deux fois la même leçon. L'arbitrage est dans core/accueil-propositions.ts,
   et `renderARevoir` RENVOIE la leçon retenue pour que l'appelant (render.ts) la passe à
   l'autre carte, qui cède à son tour si celle-ci n'avait pas d'alternative.
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { SUBJECTS, CATEGORIES, ORTHO_CATEGORY_ID } from '../core/catalog';
import { revoirActives, purgeRevoirSolides, type RevoirEntry } from '../core/encadrant-stats';
import { choisirARevoir } from '../core/accueil-propositions';
import { leconDuJour } from '../core/lecon-du-jour';
import { activeProfile } from '../core/profiles';
import { icon } from './icon';
import { subjectTint, subjectIcon } from './cat-visuals';
import { startLecon, startOrthoLecon } from './navigation';
import { dicteeDisponible } from './tts';

/* Entrées « à revoir » actives (dispo TTS passée au core pour l'« acquis » d'une dictée). */
function actives(): RevoirEntry[] {
	return revoirActives(dicteeDisponible());
}

/* Entrée « à revoir » suivante dans la liste active (cyclique → ne bloque jamais). */
function suivante(apresId: string): RevoirEntry | null {
	const entrees = actives();
	if (entrees.length === 0) return null;
	const i = entrees.findIndex((e) => e.id === apresId);
	return i < 0 ? entrees[0] : entrees[(i + 1) % entrees.length];
}

/* Icône + sous-titre d'une entrée : matière/catégorie pour une leçon du catalogue ;
   « Français · Orthographe » (dictée) pour une liste. */
function visuel(entree: RevoirEntry): { tint: string; ico: string; sousTitre: string } {
	if (entree.kind === 'ortho') {
		const cat = CATEGORIES.find((c) => c.id === ORTHO_CATEGORY_ID);
		const subject = SUBJECTS.find((s) => s.id === 'francais');
		return {
			tint: subjectTint('francais'),
			ico: icon(cat?.icon ?? subjectIcon('francais')),
			sousTitre: `${escapeHTML(subject?.label ?? 'Français')} · ${escapeHTML(cat?.label ?? 'Orthographe')}`,
		};
	}
	const lesson = entree.lesson;
	const subject = SUBJECTS.find((s) => s.id === lesson.subject);
	const cat = CATEGORIES.find((c) => c.id === lesson.category);
	return {
		tint: subjectTint(lesson.subject),
		ico: icon(cat?.icon ?? subjectIcon(lesson.subject)),
		sousTitre: `${escapeHTML(subject?.label ?? '')}${cat ? ' · ' + escapeHTML(cat.label) : ''}`,
	};
}

/* Rend la carte dans `el`. `cibleId` force une entrée précise (« voir une autre »).
   Renvoie l'id de la LEÇON affichée (`null` si carte masquée ou entrée de dictée) : c'est
   ce que « Ta prochaine leçon » doit éviter à son tour (#516). */
export function renderARevoir(el: HTMLElement | null, cibleId?: string): string | null {
	if (!el) return null;
	// Nettoyage DUR de la file avant lecture (#465) : l'accueil est le passage obligé après
	// chaque session, c'est donc ici que la file du profil actif se débarrasse des entrées
	// redevenues solides (l'affichage, lui, les filtrait déjà — cf. revoirActives).
	purgeRevoirSolides(activeProfile(), dicteeDisponible(), Date.now());
	const entrees = actives();
	// Rien à revoir → carte retirée (display:none, robuste face au `display` de .card).
	if (entrees.length === 0) {
		el.style.display = 'none';
		delete el.dataset.lesson;
		delete el.dataset.kind;
		el.innerHTML = '';
		return null;
	}
	el.style.display = '';
	// Déduplication avec « Ta prochaine leçon » (#516) : on évite la leçon du jour tant
	// qu'il reste une autre entrée épinglée à proposer (cf. core/accueil-propositions.ts).
	const entree = choisirARevoir(entrees, leconDuJour()?.id ?? null, cibleId) ?? entrees[0];
	el.dataset.lesson = entree.id;
	el.dataset.kind = entree.kind;
	const { tint, ico, sousTitre } = visuel(entree);
	// « Voir une autre » n'a de sens que s'il reste plus d'une entrée à revoir.
	const autre =
		entrees.length > 1
			? `<button class="lj-autre" type="button" data-ar="autre">Voir une autre leçon</button>`
			: '';
	el.innerHTML = `
    <div class="ico" style="background:${tint}" aria-hidden="true">${ico}</div>
    <h2>À revoir</h2>
    <p>
      <span class="lj-title">${escapeHTML(entree.label)}</span>
      <span class="lj-sub">${sousTitre}</span>
    </p>
    <button type="button" class="go" aria-label="À revoir : on y retourne">On y retourne <span aria-hidden="true">→</span></button>
    ${autre}`;

	if (!el.dataset.wired) {
		el.addEventListener('click', onARevoirClick);
		el.dataset.wired = '1';
	}
	return entree.kind === 'lecon' ? entree.id : null;
}

/* Clic : « voir une autre » avance dans la liste ; sinon lance l'entrée courante
   (leçon du catalogue OU liste de dictée, selon `kind`). */
function onARevoirClick(e: Event): void {
	const el = e.currentTarget as HTMLElement;
	if ((e.target as HTMLElement).closest('[data-ar="autre"]')) {
		const next = suivante(el.dataset.lesson ?? '');
		// Le défilement n'est PAS dédupliqué ici (#516), à la différence de celui de la carte
		// du fil : la file épinglée est COURTE et entièrement voulue par l'encadrant, donc en
		// faire le tour doit tout montrer, y compris l'entrée qui se trouve être la leçon du
		// jour. Le doublon peut réapparaître le temps d'un tour de boucle, sur action explicite
		// de l'enfant et réversible d'un clic ; l'accueil, lui, repart toujours dédupliqué.
		renderARevoir(el, next ? next.id : undefined);
		return;
	}
	const id = el.dataset.lesson;
	if (!id) return;
	if (el.dataset.kind === 'ortho') startOrthoLecon(id);
	else startLecon(id);
}
