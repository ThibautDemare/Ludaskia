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

   Attribution : au lancement d'une étape on pose un marqueur (`marquerEtapeLancee`),
   consommé au retour par `rafraichirProgramme` (appelé par la navigation avant de
   rendre l'accueil et l'écran). La complétion de TOUT le programme déclenche la
   récompense (modale + confettis + trophée), sans XP (chaque mode a déjà donné le
   sien) — cf. décisions #440.
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { getLessonById, type SubjectId } from '../core/catalog';
import { leconDuJour } from '../core/lecon-du-jour';
import { countDue } from '../core/revision-select';
import { loadLessonRevisions } from '../core/progress';
import { loadOrtho } from '../core/orthographe/store';
import { listOrthoLecons } from '../core/orthographe/lessons';
import { evaluateTrophies } from '../core/rewards';
import {
	vueSeanceDuJour,
	marquerEtapeLancee,
	resoudrePending,
	ciblesEtape,
	SEANCE_MODE_INFOS,
	type SeanceEtape,
	type VueEtape,
} from '../core/seance';
import { icon } from './icon';
import { subjectIcon } from './cat-visuals';
import { startSprint, startRevisionEspacee, startLecon, startOrthoLecon } from './navigation';
import { showCelebration } from './effects';

/* ---------- Cibles d'une étape « dictée » (#463) ---------- */
/* Dictées du pool encore présentes dans le catalogue du profil actif. Une cible
   disparue (liste supprimée, hors niveau) est ignorée ; si aucune ne subsiste,
   l'étape devient inactive (cf. lancable). */
function ciblesDicteeValides(e: SeanceEtape): string[] {
	const dispo = listOrthoLecons(loadOrtho());
	return ciblesEtape(e).filter((id) => dispo.some((x) => x.id === id));
}
/* Tire une dictée valide au hasard dans le pool (undefined si pool vide/obsolète).
   1 cible ⇒ toujours la même (dictée figée) ; 2+ ⇒ une au hasard à chaque lancement. */
function tirerCibleDictee(e: SeanceEtape): string | undefined {
	const valides = ciblesDicteeValides(e);
	return valides.length ? valides[Math.floor(Math.random() * valides.length)] : undefined;
}

/* ---------- Visuels d'une étape ---------- */
function etapeVisuel(v: VueEtape): { ico: string; titre: string } {
	const e = v.etape;
	switch (e.kind) {
		case 'sprint':
			return { ico: icon('run'), titre: SEANCE_MODE_INFOS.sprint.label };
		case 'revision':
			return { ico: icon('clock-clockwise'), titre: 'Révision' };
		case 'leconDuJour':
			return { ico: icon('star'), titre: 'Leçon du jour' };
		case 'lecon': {
			const l = e.ref ? getLessonById(e.ref) : null;
			return {
				ico: icon(subjectIcon((l?.subject ?? 'math') as SubjectId)),
				titre: l?.label ?? 'Une leçon',
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
   (« encore 2 fois »), plus actionnable qu'une fraction à calculer (avis a11y). */
function repereCount(v: VueEtape): string {
	if (v.etape.count <= 1) return '';
	if (v.fait === 0) return `${v.etape.count} fois`;
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
			return countDue(loadOrtho(), loadLessonRevisions(), Date.now()) > 0
				? { ok: true }
				: { ok: false, raison: "Rien à réviser aujourd'hui" };
		case 'leconDuJour':
			return leconDuJour() ? { ok: true } : { ok: false, raison: 'Tout est déjà réussi' };
		case 'lecon':
			return e.ref && getLessonById(e.ref)
				? { ok: true }
				: { ok: false, raison: 'Leçon indisponible' };
		case 'dictee':
			return ciblesDicteeValides(e).length
				? { ok: true }
				: { ok: false, raison: 'Dictée indisponible' };
	}
}

/* Lance le mode d'une étape DEPUIS le programme : pose le marqueur d'attribution
   puis délègue au déclencheur du mode. Sans effet si l'étape est épuisée / non
   lançable (garde-fou contre un clic sur une tuile inactive). */
export function lancerEtapeProgramme(etapeId: string): void {
	const vue = vueSeanceDuJour(Date.now());
	const v = vue?.etapes.find((x) => x.etape.id === etapeId);
	if (!v || v.reste <= 0 || !lancable(v).ok) return;
	const e = v.etape;
	// Dictée : on TIRE la cible du pool AVANT de poser le marqueur, afin de la mémoriser
	// (métrique #463) et de la lancer. Les autres modes n'ont pas de cible tirée au lancement.
	const dicteeCible = e.kind === 'dictee' ? tirerCibleDictee(e) : undefined;
	marquerEtapeLancee(etapeId, Date.now(), dicteeCible);
	switch (e.kind) {
		case 'sprint':
			startSprint();
			break;
		case 'revision':
			startRevisionEspacee();
			break;
		case 'leconDuJour': {
			const l = leconDuJour();
			if (l) startLecon(l.id);
			break;
		}
		case 'lecon':
			if (e.ref) startLecon(e.ref);
			break;
		case 'dictee':
			if (dicteeCible) startOrthoLecon(dicteeCible);
			break;
	}
}

/* « Choisis pour moi » : pioche une étape restante LANÇABLE au hasard et la lance
   (lève le blocage d'initiation, avis specialiste-troubles-apprentissage). */
function lancerHasard(): void {
	const vue = vueSeanceDuJour(Date.now());
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
	const { ico, titre } = etapeVisuel(v);
	const l = lancable(v);
	const repere = repereCount(v);
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

function recapItemHTML(v: VueEtape): string {
	const { titre } = etapeVisuel(v);
	return `<li class="programme-recap-item">
    <span class="programme-recap-ico" aria-hidden="true">${icon('check-circle')}</span>
    <span>${escapeHTML(titre)}${
			v.etape.count > 1 ? ` <span class="programme-recap-x">×${v.etape.count}</span>` : ''
		}</span>
  </li>`;
}

/* ---------- Écran #seance ---------- */
export function renderSeance(el: HTMLElement): void {
	const vue = vueSeanceDuJour(Date.now());
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
      <ul class="programme-recap">${vue.etapes.map(recapItemHTML).join('')}</ul>`;
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
        <ul class="programme-recap">${faites.map(recapItemHTML).join('')}</ul>
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
/* Consomme un éventuel marqueur « étape en cours » au retour vers l'accueil / le
   programme, et célèbre si le programme ENTIER vient d'être terminé. Idempotent. */
export function rafraichirProgramme(): void {
	const res = resoudrePending(Date.now());
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
	const vue = vueSeanceDuJour(Date.now());
	if (!vue) {
		el.style.display = 'none';
		el.innerHTML = '';
		return;
	}
	el.style.display = '';
	if (vue.complete) {
		el.classList.add('programme-card--fini');
		el.innerHTML = `
      <div class="ico" aria-hidden="true">${icon('check-circle')}</div>
      <h2>Ton programme du jour</h2>
      <p>
        <span class="lj-title">Terminé, bravo !</span>
        <span class="lj-sub">Tu as fait tout ton programme.</span>
      </p>
      <span class="go">Revoir <span aria-hidden="true">→</span></span>`;
	} else {
		el.classList.remove('programme-card--fini');
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
      <span class="go">On y va <span aria-hidden="true">→</span></span>`;
	}
	if (!el.dataset.wired) {
		el.addEventListener('click', () => {
			location.hash = 'seance';
		});
		el.dataset.wired = '1';
	}
}
