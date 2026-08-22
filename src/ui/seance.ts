/* ============================================================
   Programme du jour (#440) — couche UI enfant.
   ------------------------------------------------------------
   « Programme du jour » (voix enfant) = la séance composée par l'encadrant
   (`core/seance.ts`). Deux surfaces :
   - la CARTE d'accueil (`renderProgrammeCard`, modèle « à revoir » / « leçon du
     jour ») : point d'entrée, masquée s'il n'y a pas de programme aujourd'hui ;
   - l'ÉCRAN dédié `#seance` (`renderSeance`) : les étapes restantes en tuiles
     (ordre libre), une jauge de pastilles, un bouton « Choisis pour moi », et un
     état « terminé » célébré. Une étape épuisée sort des propositions.

   Attribution : `rafraichirProgramme` (appelé par la navigation avant de rendre l'accueil
   et l'écran) crédite les étapes d'après les sessions RÉELLEMENT faites, lues dans le
   journal d'activité (#498) — que l'enfant soit passé par les tuiles du programme, par la
   carte « À revoir » de l'accueil ou par le catalogue. Le marqueur posé au lancement
   (`marquerEtapeLancee`) ne sert plus qu'à dater l'étape et à lever une ambiguïté. La
   complétion de TOUT le programme déclenche la récompense (modale + confettis + trophée),
   sans XP (chaque mode a déjà donné le sien) — cf. décisions #440.

   Contexte du jour (#464, enrichi #498) : le cœur ne lit pas seul la file « à revoir »
   (l'« acquis » d'une dictée dépend de la dispo du TTS, connue d'ici seulement). C'est donc
   CE module qui construit le `ContexteSeance` — les ids épinglés par nature, qui servent à
   l'applicabilité de l'étape ET à reconnaître la session qui la satisfait — et l'unique
   porte d'entrée de lecture de la séance côté UI (`vueProgramme`, navigation comprise).
   ============================================================ */
import { enumererFr, escapeHTML } from '../core/utils';
import { getLessonById, type SubjectId } from '../core/catalog';
import { labelLecon } from '../core/levels';
import { niveauLecon } from '../core/niveau-actif';
import { leconDuJour } from '../core/lecon-du-jour';
import { countDusSeance } from '../core/progress';
import { getRevisionPlafond } from '../core/profiles';
import { loadOrtho } from '../core/orthographe/store';
import { listOrthoLecons } from '../core/orthographe/lessons';
import { evaluateTrophies } from '../core/rewards';
import {
	revoirActives,
	orthoRevoirId,
	isOrthoRevoirId,
	orthoIdFromRevoir,
	type RevoirEntry,
} from '../core/encadrant-stats';
import {
	vueSeanceDuJour,
	marquerEtapeLancee,
	resoudreProgramme,
	ciblesEtape,
	ciblesValides,
	tirerCible,
	tirerParmi,
	SEANCE_MODE_INFOS,
	type ContexteSeance,
	type SeanceEtape,
	type VueEtape,
	type VueSeance,
} from '../core/seance';
import { icon } from './icon';
import { subjectIcon } from './cat-visuals';
import { startRevisionEspacee, startLecon, startOrthoLecon } from './navigation';
import { startDefaultSprint } from './sprint';
import { showCelebration } from './effects';
import { contenuRecap, type NotionRecap } from '../core/recap-notions';
import { notionLecon, notionsNotees } from './recap-seance';
import { dicteeDisponible } from './tts';

/* ---------- Cibles d'une étape « dictée » (#463) ---------- */
/* Ids des dictées actuellement proposables au profil actif (prédéfinies du niveau +
   listes du profil). Le filtrage des cibles valides et le tirage vivent dans
   core/seance.ts (ciblesValides / tirerCible), testables en déterministe. */
function dicteesDisponibles(): string[] {
	return listOrthoLecons(loadOrtho()).map((x) => x.id);
}

/* ---------- Cibles d'une étape « à revoir » (#464) ---------- */
/* Pool DYNAMIQUE de l'étape « à revoir » : les entrées épinglées par l'encadrant encore
   à travailler (revoirActives fait l'auto-nettoyage — une notion redevenue solide sort).
   On garde l'id de FILE (préfixé `ortho:` pour une dictée) : il porte la nature de
   l'entrée, ce qui suffit à la lancer et à l'attribuer sans re-résoudre le catalogue. */
function aRevoirEntrees(): RevoirEntry[] {
	return revoirActives(dicteeDisponible());
}
function aRevoirPool(): string[] {
	return aRevoirEntrees().map((e) => (e.kind === 'ortho' ? orthoRevoirId(e.id) : e.id));
}

/* Contexte du jour passé à toutes les lectures de la séance (cf. en-tête). Les ids sont
   fournis par NATURE et sans préfixe de file (#498) : le cœur s'en sert pour reconnaître,
   dans le journal d'activité, qu'une épinglée vient d'être travaillée. */
function contexteProgramme(): ContexteSeance {
	const entrees = aRevoirEntrees();
	return {
		aRevoirLecons: entrees.filter((e) => e.kind === 'lecon').map((e) => e.id),
		aRevoirDictees: entrees.filter((e) => e.kind === 'ortho').map((e) => e.id),
	};
}

/** Vue du programme du jour, contexte inclus. Porte d'entrée UNIQUE côté UI (la
    navigation l'utilise aussi pour savoir s'il y a un programme aujourd'hui). */
export function vueProgramme(): VueSeance | null {
	return vueSeanceDuJour(Date.now(), contexteProgramme());
}

/* ---------- Visuels d'une étape ---------- */
/* `sous` : repère facultatif affiché SOUS le titre quand celui-ci nomme une cible précise
   (l'enfant voit ce qu'il va faire ET de quoi il s'agit) ; il cède la place au repère
   « combien de fois » quand l'étape est demandée plusieurs fois. */
function etapeVisuel(v: VueEtape): { ico: string; titre: string; sous?: string } {
	const e = v.etape;
	switch (e.kind) {
		case 'sprint':
			return { ico: icon('run'), titre: SEANCE_MODE_INFOS.sprint.label };
		case 'revision':
			return { ico: icon('clock-clockwise'), titre: 'Révision' };
		case 'aRevoir': {
			// Icône « marque-page » (épinglé), distincte des deux flèches circulaires déjà
			// prises par la révision. Une seule épinglée en jeu ⇒ on la NOMME, comme le fait
			// la carte d'accueil (avis pédagogue : à cet âge, ce qui compte est de voir ce
			// qu'on va faire, pas de comprendre qui a choisi). Plusieurs ⇒ titre générique,
			// la cible est tirée au lancement (même parti pris que le pool de dictées).
			const entrees = aRevoirEntrees();
			return entrees.length === 1
				? { ico: icon('bookmark'), titre: entrees[0].label, sous: 'À revoir' }
				: { ico: icon('bookmark'), titre: 'À revoir' };
		}
		case 'leconDuJour':
			return { ico: icon('star'), titre: 'Leçon du jour' };
		case 'lecon': {
			const l = e.ref ? getLessonById(e.ref) : null;
			return {
				ico: icon(subjectIcon((l?.subject ?? 'math') as SubjectId)),
				// Libellé résolu au niveau joué (#436) : la tuile nomme la leçon comme le fera
				// l'écran qui s'ouvrira au clic.
				titre: l ? labelLecon(l, niveauLecon(l)) : 'Une leçon',
			};
		}
		case 'dictee': {
			const cibles = ciblesEtape(e);
			if (cibles.length === 1) {
				const liste = listOrthoLecons(loadOrtho()).find((x) => x.id === cibles[0]);
				return { ico: icon('book-open'), titre: liste?.label ?? 'Une dictée' };
			}
			// Pool de plusieurs dictées : titre générique (la dictée est tirée au lancement).
			return { ico: icon('book-open'), titre: 'Une dictée' };
		}
	}
}

/* Repère « combien de fois » : rien si une seule fois, sinon le RESTE à faire
   (« encore 2 fois »), plus actionnable qu'une fraction à calculer (avis a11y). Lit
   `v.requis` (exigence assainie du jour) et non `etape.count` brut, qui peut être absent
   ou nul dans un programme importé — ce qui affichait « undefined fois ». */
function repereCount(v: VueEtape): string {
	if (v.requis <= 1) return '';
	if (v.fait === 0) return `${v.requis} fois`;
	return v.reste > 1 ? `encore ${v.reste} fois` : 'encore 1 fois';
}

/* Peut-on lancer cette étape maintenant ? (une révision sans rien de dû, une leçon
   du jour quand tout est acquis, une cible disparue → tuile inactive avec raison.) */
function lancable(v: VueEtape): { ok: boolean; raison?: string } {
	const e = v.etape;
	switch (e.kind) {
		case 'sprint':
			return { ok: true };
		case 'revision':
			return countDusSeance(loadOrtho(), Date.now(), getRevisionPlafond()) > 0
				? { ok: true }
				: { ok: false, raison: "Rien à réviser aujourd'hui" };
		case 'aRevoir':
			// Garde-fou : une étape « à revoir » sans rien d'épinglé est déjà escamotée de la
			// vue (etapeApplicable, #464) — on ne passe ici qu'en cas de contexte désynchronisé.
			return aRevoirPool().length ? { ok: true } : { ok: false, raison: 'Rien à revoir' };
		case 'leconDuJour':
			return leconDuJour() ? { ok: true } : { ok: false, raison: 'Tout est déjà réussi' };
		case 'lecon':
			return e.ref && getLessonById(e.ref)
				? { ok: true }
				: { ok: false, raison: 'Leçon indisponible' };
		case 'dictee':
			return ciblesValides(e, dicteesDisponibles()).length
				? { ok: true }
				: { ok: false, raison: 'Dictée indisponible' };
	}
}

/* Tirage de la cible d'une étape à POOL, juste avant son lancement. Deux pools : les
   dictées CONFIGURÉES par l'encadrant (#463) et la file ÉPINGLÉE du jour (#464). Renvoie
   la cible, qui sert à la fois à lancer la bonne activité et à la mémoriser dans le marqueur
   (métrique). Les modes sans pool ne tirent rien. */
function tirageEtape(e: SeanceEtape): string | undefined {
	if (e.kind === 'dictee') return tirerCible(e, dicteesDisponibles());
	if (e.kind === 'aRevoir') return tirerParmi(aRevoirPool());
	return undefined;
}

/* Lance le mode d'une étape DEPUIS le programme : pose le marqueur d'attribution
   puis délègue au déclencheur du mode. Sans effet si l'étape est épuisée / non
   lançable (garde-fou contre un clic sur une tuile inactive). */
export function lancerEtapeProgramme(etapeId: string): void {
	const vue = vueProgramme();
	const v = vue?.etapes.find((x) => x.etape.id === etapeId);
	if (!v || v.reste <= 0 || !lancable(v).ok) return;
	const e = v.etape;
	// La cible d'une étape à pool est tirée AVANT de poser le marqueur, pour la mémoriser
	// (métrique) et la lancer. Le TIRAGE parle en ids de FILE (une épinglée peut être une
	// dictée, préfixée) car c'est ce qui dit quoi lancer ; le MARQUEUR, lui, mémorise l'id
	// BRUT, comme le journal d'activité. Sans ce dé-préfixage, l'archive des séances
	// mélangerait deux conventions d'id selon que l'étape a été créditée par le marqueur ou
	// par le journal, et un futur récap encadrant lirait des cibles incomparables.
	const cible = tirageEtape(e);
	marquerEtapeLancee(
		etapeId,
		Date.now(),
		cible && isOrthoRevoirId(cible) ? orthoIdFromRevoir(cible) : cible,
	);
	switch (e.kind) {
		case 'sprint':
			// Depuis le programme, l'enfant ne configure pas : lancement direct avec la
			// config par défaut (toutes les matières + périmètre adaptatif) plutôt que
			// l'écran de configuration.
			startDefaultSprint();
			break;
		case 'revision':
			startRevisionEspacee();
			break;
		// Leçons et dictées reçoivent l'origine « programme » (#461) : leur écran de fin
		// ramène ici, et non à la catégorie de la leçon. Sprint et révision finissent sur
		// l'accueil (comportement inchangé), qui re-rend la carte du programme.
		case 'leconDuJour': {
			const l = leconDuJour();
			if (l) startLecon(l.id, 'programme');
			break;
		}
		case 'lecon':
			if (e.ref) startLecon(e.ref, 'programme');
			break;
		case 'dictee':
			if (cible) startOrthoLecon(cible, 'programme');
			break;
		case 'aRevoir':
			// L'id de file porte la nature de l'entrée tirée : dictée (préfixe) ou leçon.
			if (cible && isOrthoRevoirId(cible)) startOrthoLecon(orthoIdFromRevoir(cible), 'programme');
			else if (cible) startLecon(cible, 'programme');
			break;
	}
}

/* « Choisis pour moi » : pioche une étape restante LANÇABLE au hasard et la lance
   (lève le blocage d'initiation, avis specialiste-troubles-apprentissage). */
function lancerHasard(): void {
	const vue = vueProgramme();
	if (!vue) return;
	const jouables = vue.restantes.filter((v) => lancable(v).ok);
	if (!jouables.length) return;
	const choix = jouables[Math.floor(Math.random() * jouables.length)];
	lancerEtapeProgramme(choix.etape.id);
}

/* ---------- Rendu des morceaux ---------- */
function pastillesHTML(total: number, fait: number): string {
	let s = '';
	for (let i = 0; i < total; i++) {
		s += `<span class="programme-pastille${i < fait ? ' faite' : ''}" aria-hidden="true">${
			i < fait ? icon('check') : ''
		}</span>`;
	}
	const lbl = `${fait} activité${fait > 1 ? 's' : ''} sur ${total} faite${fait > 1 ? 's' : ''}`;
	return `<div class="programme-pastilles" role="img" aria-label="${lbl}">${s}</div>`;
}

function tuileHTML(v: VueEtape): string {
	const { ico, titre, sous } = etapeVisuel(v);
	const l = lancable(v);
	const repere = repereCount(v) || sous || '';
	if (!l.ok) {
		// Div non focusable (pas un <button disabled> : on veut garder la RAISON dans le
		// flux de lecture). Pas d'aria-disabled — inerte sur un rôle générique (avis a11y).
		return `<div class="programme-tuile programme-tuile--inactive">
      <span class="programme-tuile-ico" aria-hidden="true">${ico}</span>
      <span class="programme-tuile-txt">
        <span class="programme-tuile-titre">${escapeHTML(titre)}</span>
        <span class="programme-tuile-hint">${escapeHTML(l.raison ?? '')}</span>
      </span>
    </div>`;
	}
	return `<button type="button" class="programme-tuile" data-act="lancer" data-etape="${escapeHTML(
		v.etape.id,
	)}">
    <span class="programme-tuile-ico" aria-hidden="true">${ico}</span>
    <span class="programme-tuile-txt">
      <span class="programme-tuile-titre">${escapeHTML(titre)}</span>
      ${repere ? `<span class="programme-tuile-hint">${escapeHTML(repere)}</span>` : ''}
    </span>
    <span class="programme-tuile-go" aria-hidden="true">→</span>
  </button>`;
}

/* Ce que l'étape a réellement fait travailler (#537), pour les étapes dont le TITRE reste
   générique : « Sprint 5 min » ne dit pas quelles leçons ont été tirées, « Révision » ni
   « Leçon du jour » non plus. Deux sources, aucune créée pour l'occasion :
   - les modes qui traversent PLUSIEURS notions (sprint, révision) sont lus dans la mémoire
     de la page (`notionsNotees`). Vide après un rechargement : l'étape retombe alors sur
     son titre seul, comme avant. Enrichi quand on peut, jamais faux ;
   - les modes à cible UNIQUE, tirée au lancement (leçon du jour, épinglée d'un pool, dictée
     d'un pool), sont lus dans les complétions du jour (`v.refs`), déjà enregistrées.
   Le titre n'est jamais répété : une étape qui se nomme déjà (une leçon précise, une dictée
   figée) n'est pas enrichie. Même décision que le récap de fin de séance sur ce qui est
   nommé — plafond et agrégation par catégorie compris (`contenuRecap`). */
function notionsEtape(v: VueEtape, titre: string, dictees: Map<string, string>): string[] {
	const notions: NotionRecap[] = [];
	if (v.etape.kind === 'sprint' || v.etape.kind === 'revision') {
		notions.push(...notionsNotees(v.etape.kind));
	} else {
		for (const ref of v.refs) {
			const n = notionLecon(ref);
			if (n) notions.push(n);
			else {
				const label = dictees.get(ref);
				// Une liste supprimée depuis n'est plus résoluble : on ne nomme jamais un id
				// brut à l'enfant, l'étape garde son titre seul.
				if (label) notions.push({ id: ref, label, categorie: 'Orthographe' });
			}
		}
	}
	const contenu = contenuRecap(notions);
	return contenu ? contenu.labels.filter((l) => l !== titre) : [];
}

function recapItemHTML(v: VueEtape, dictees: Map<string, string>): string {
	const { titre } = etapeVisuel(v);
	const notions = notionsEtape(v, titre, dictees);
	// Nommé DANS la même phrase, à la même taille, juste nuancé en gris : une seconde ligne
	// plus petite et grise sous un libellé, c'est la recette exacte des relevés de suivi de
	// l'espace encadrant, dont ce récap doit rester distinct (avis `designer-ux-enfant`).
	return `<li class="programme-recap-item">
    <span class="programme-recap-ico" aria-hidden="true">${icon('check-circle')}</span>
    <span>${escapeHTML(titre)}${
			v.requis > 1 ? ` <span class="programme-recap-x">×${v.requis}</span>` : ''
		}${
			notions.length
				? ` <span class="programme-recap-notions">· ${escapeHTML(enumererFr(notions))}</span>`
				: ''
		}</span>
  </li>`;
}

/* Liste de récap. La table des dictées est résolue UNE fois ici plutôt qu'à chaque ligne :
   `loadOrtho` lit le stockage, et une étape peut avoir plusieurs cibles. */
function recapListeHTML(vues: VueEtape[]): string {
	const dictees = new Map(listOrthoLecons(loadOrtho()).map((x) => [x.id, x.label]));
	return vues.map((v) => recapItemHTML(v, dictees)).join('');
}

/* ---------- Écran #seance ---------- */
export function renderSeance(el: HTMLElement): void {
	const vue = vueProgramme();
	if (!vue) {
		// Aucun programme aujourd'hui : la navigation redirige vers l'accueil.
		el.innerHTML = '';
		return;
	}
	const pastilles = pastillesHTML(vue.totalRequis, vue.totalFait);
	if (vue.complete) {
		el.innerHTML = `
      <button type="button" class="backlink-top" data-act="accueil">← Retour à l'accueil</button>
      <h1 class="big">Ton programme du jour</h1>
      <div class="programme-fini">
        <div class="programme-fini-emoji" aria-hidden="true">🎉</div>
        <p class="programme-fini-txt">Bravo, tu as fait tout ton programme du jour !</p>
        ${pastilles}
      </div>
      <ul class="programme-recap">${recapListeHTML(vue.etapes)}</ul>`;
		wire(el);
		return;
	}
	const intro =
		vue.totalFait === 0
			? `On t'a préparé un programme : ${vue.totalRequis} activité${
					vue.totalRequis > 1 ? 's' : ''
				}. Tu commences par laquelle ?`
			: "Continue quand tu veux, dans l'ordre que tu préfères.";
	const faites = vue.etapes.filter((v) => v.epuise);
	el.innerHTML = `
    <button type="button" class="backlink-top" data-act="accueil">← Retour à l'accueil</button>
    <h1 class="big">Ton programme du jour</h1>
    <p class="tagline">${intro}</p>
    <div class="programme-progress">
      ${pastilles}
      ${
				vue.totalFait > 0
					? `<p class="programme-progress-txt">Tu as fait ${vue.totalFait} activité${
							vue.totalFait > 1 ? 's' : ''
						} sur ${vue.totalRequis}.</p>`
					: ''
			}
    </div>
    <div class="programme-tuiles">${vue.restantes.map(tuileHTML).join('')}</div>
    ${
			vue.restantes.filter((v) => lancable(v).ok).length > 1
				? `<button type="button" class="programme-hasard" data-act="hasard"><span aria-hidden="true">🎲</span> Choisis pour moi</button>`
				: ''
		}
    ${
			faites.length
				? `<div class="programme-deja">
        <p class="programme-deja-titre">Déjà fait aujourd'hui</p>
        <ul class="programme-recap">${recapListeHTML(faites)}</ul>
      </div>`
				: ''
		}`;
	wire(el);
}

/* Listeners délégués (posés une seule fois sur le conteneur stable #seanceContent). */
function wire(el: HTMLElement): void {
	if (el.dataset.wired) return;
	el.addEventListener('click', (e: Event) => {
		const btn = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
		if (!btn) return;
		const act = btn.dataset.act;
		if (act === 'accueil') {
			location.hash = 'accueil';
		} else if (act === 'hasard') {
			lancerHasard();
		} else if (act === 'lancer' && btn.dataset.etape) {
			lancerEtapeProgramme(btn.dataset.etape);
		}
	});
	el.dataset.wired = '1';
}

/* ---------- Résolution + récompense (appelée par la navigation) ---------- */
/* Attribue les sessions faites depuis le dernier passage et célèbre si le programme ENTIER
   vient d'être terminé. Idempotent. Une seule porte : `resoudreProgramme` acte aussi la
   complétion survenue SANS étape réalisée (le contexte a escamoté la dernière étape
   restante, épinglée retirée ou redevenue solide, #464), cas qui demandait auparavant un
   second appel de rattrapage. */
export function rafraichirProgramme(): void {
	const res = resoudreProgramme(Date.now(), contexteProgramme());
	if (res.justCompleted) {
		const nouveaux = evaluateTrophies(); // rattrape le trophée de programme (1/7/30)
		showCelebration([
			{ icon: '🎉', text: 'Bravo, tu as fait tout ton programme du jour !' },
			...nouveaux.map((t) => ({ icon: t.icon, text: `Trophée : ${t.title}` })),
		]);
	}
}

/* ---------- Carte d'accueil ---------- */
export function renderProgrammeCard(el: HTMLElement | null): void {
	if (!el) return;
	const vue = vueProgramme();
	if (!vue) {
		el.style.display = 'none';
		el.innerHTML = '';
		return;
	}
	el.style.display = '';
	if (vue.complete) {
		// Plus rien à faire aujourd'hui : la carte reste en place pour le repère spatial
		// mais devient un CONSTAT — ni pastille d'action, ni clic. Même règle que la carte
		// Révision quand rien n'est dû (`card-inactive`, cf. render.ts) : derrière, l'écran
		// #seance n'offrirait qu'un récapitulatif non actionnable, et on n'envoie pas
		// l'enfant sur un écran cul-de-sac. Retirer la pastille SANS retirer le clic serait
		// le pire des deux (une carte d'apparence inerte qui navigue quand même) : à cet
		// âge « pastille verte = bouton » est une règle apprise sur les six cartes (#517,
		// avis designer-ux-enfant, arbitrage du mainteneur). L'emoji festif est inline dans
		// le titre, pas dans la pastille d'icône (système monochrome commun aux six cartes).
		el.classList.add('programme-card--fini', 'card-inactive');
		el.innerHTML = `
      <div class="ico" aria-hidden="true">${icon('check-circle')}</div>
      <h2>Ton programme du jour</h2>
      <p>
        <span class="lj-title">Terminé, bravo ! <span aria-hidden="true">🎉</span></span>
        <span class="lj-sub">Tu as fait tout ton programme.</span>
      </p>`;
	} else {
		el.classList.remove('programme-card--fini', 'card-inactive');
		const reste = vue.totalRequis - vue.totalFait;
		el.innerHTML = `
      <div class="ico" aria-hidden="true">${icon('list')}</div>
      <h2>Ton programme du jour</h2>
      <p>
        <span class="lj-title">${reste} activité${reste > 1 ? 's' : ''} à faire</span>
        <span class="lj-sub">${vue.totalFait} sur ${vue.totalRequis} déjà fait${
					vue.totalFait > 1 ? 's' : ''
				}</span>
      </p>
      <button type="button" class="go" aria-label="Ton programme du jour : on y va">On y va <span aria-hidden="true">→</span></button>`;
	}
	if (!el.dataset.wired) {
		el.addEventListener('click', () => {
			// La carte peut avoir SURVÉCU à l'état qui l'a produite : l'accueil est rendu une
			// fois, et l'onglet peut rester ouvert des heures (tablette en veille, passage de
			// minuit, épinglée retirée entre-temps). On recalcule donc avant de naviguer.
			// Sans ce garde-fou, le clic posait `#seance`, d'où `showSeanceView` renvoyait
			// aussitôt à l'accueil faute de programme applicable : vu de l'écran, un clic sans
			// aucun effet (#517). Un programme fini est traité pareil — la carte est alors
			// inerte, mais elle a pu se terminer ailleurs depuis le rendu.
			const frais = vueProgramme();
			if (!frais || frais.complete) {
				renderProgrammeCard(el); // l'accueil se corrige, au lieu de ne rien faire
				return;
			}
			location.hash = 'seance';
		});
		el.dataset.wired = '1';
	}
}
