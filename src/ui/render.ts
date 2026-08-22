/* ============================================================
   Rendu de l'écran d'accueil et du sélecteur de leçons
   ============================================================ */
import { fmt, startOfDay } from '../core/utils';
import {
	activeProfile,
	loadProfilesMeta,
	PROFILE_EMOJIS,
	getXPFor,
	getRevisionPlafond,
} from '../core/profiles';
import { LESSONS } from '../core/lessons';
import { getAllLessons } from '../core/catalog';
import {
	loadRuns,
	cmpRun,
	runPct,
	starsEarned,
	starsEarnedAll,
	loadStars,
	loadLessonStats,
	lessonAvgPct,
	type LessonStat,
	startOfWeek,
	startOfMonth,
	countSince,
	countNewLessonsSince,
	loadLessonFirstSeen,
	getXP,
	progressionNiveau,
	niveauDepuisXP,
	loadLessonRevisions,
	loadLessonRevisionsBasNiveau,
	countDusSeance,
	todayStr,
} from '../core/progress';
import { lessonsNiveauActif, niveauActif } from '../core/niveau-actif';
import { LEVEL_LABEL } from '../core/levels';
import { compteurEtoilesHTML } from '../core/compteur-etoiles';
import { prochaineEcheance, aDesRevisions, effortRevisionAffiche } from '../core/revision-select';
import { JOUR } from '../core/revision';
import { titreDuNiveau, AVATARS_FORET } from '../core/unlocks';
import { loadOrtho } from '../core/orthographe/store';
import { getGoal, evaluateTrophies } from '../core/rewards';
import { sparkline } from './effects';
import { renderFavoris } from './bilan';
import { renderReprises } from './resume';
import { renderLeconDuJour } from './lecon-du-jour';
import { renderARevoir } from './a-revoir-card';
import { renderProgrammeCard } from './seance';
import { renderRewardNav, mascotteBulleHTML } from './unlocks-view';
import { onHomeShown } from './eggs';
import { icon, type IconName } from './icon';
import { html, VIDE, type SafeHtml, joindre } from '../core/html';

/* Niveau de réussite → couleur (rouge < 50, orange < 75, vert sinon) */
export const pctColor = (p: number) => (p < 50 ? '#c62828' : p < 75 ? '#ef6c00' : '#2e7d32');

/* Boutons fonctionnels au markup statique (toolbar + sauvegarde des profils) :
   leur libellé vit dans app.html, mais l'icône est injectée ici pour garder
   UNE seule source des SVG (cf. ui/icon.ts). Appelé une fois au câblage. */
export function paintStaticIcons() {
	const set = (id: string, fragment: SafeHtml) => {
		const el = document.getElementById(id);
		if (el) el.innerHTML = fragment.balisage;
	};
	set('btnVerify', html`${icon('check')} Vérifier`);
	set('btnHome', html`${icon('house')} Accueil`);
	set('btnGuide', html`${icon('question')} Guide`); // rejeu du guide de 1re visite (#330)
	set('btnPrint', html`${icon('printer')} Imprimer / PDF`);
	// Déclencheur du tiroir mobile (caché en desktop par CSS) : icône hamburger.
	set('toolbarBurger', icon('list'));
	set('btnExport', html`${icon('export')} Exporter les profils cochés`);
	set('btnImport', html`${icon('import')} Importer une sauvegarde`);
	set('encadrantAccessIco', icon('gear')); // accès à l'espace encadrant (#234)
	// Grosses icônes d'entrée des cartes d'accueil (mode = rôle fonctionnel).
	const setIco = (cardId: string, fragment: SafeHtml) => {
		const el = document.querySelector(`#${cardId} .ico`);
		if (el) el.innerHTML = fragment.balisage;
	};
	setIco('cardSprint', icon('run'));
	setIco('cardRevision', icon('repeat'));
	setIco('cardLecon', icon('book-open'));
	setIco('cardBilanCustom', icon('faders'));
}

/* Bouton de profil dans la barre d'outils (libellé = profil actif) + badge de niveau */
export function renderToolbarProfile() {
	const xpEl = document.getElementById('xpBadge');
	if (xpEl) {
		const xp = getXP();
		const pr = progressionNiveau(xp);
		const rang = titreDuNiveau(pr.niveau);
		const progressTitle = pr.max
			? `Niveau maximum atteint ! (${xp} XP)`
			: `${pr.xpDansNiveau} / ${pr.xpRequisPalier} XP vers le niveau ${pr.niveau + 1} (${xp} XP au total)`;
		xpEl.title = `Rang : ${rang.titre} — ${progressTitle}`;
		xpEl.innerHTML =
			html`<span class="lvl-num">${rang.icone} Niveau ${pr.niveau}</span><span class="lvl-bar"><span class="lvl-bar-fill" style="width:${pr.pct}%"></span></span>`.balisage;
	}
	const el = document.getElementById('toolbarProfile');
	if (!el) return;
	const p = activeProfile();
	if (!p) return;
	el.innerHTML = html`${p.emoji} ${p.name} <span class="btn-profile-caret">▾</span>`.balisage;
}

/* Carte « progression » de l'accueil : mascotte + rang + niveau + barre.
   Point d'ancrage central de la fierté. La mascotte est animée (entrée + repos
   doux) ici uniquement — écran de contemplation, pas de tâche urgente. */
export function renderProgression() {
	const el = document.getElementById('progression');
	if (!el) return;
	const pr = progressionNiveau(getXP());
	const rang = titreDuNiveau(pr.niveau);
	const sub = pr.max
		? 'Niveau maximum atteint !'
		: `${pr.xpDansNiveau} / ${pr.xpRequisPalier} XP vers le niveau ${pr.niveau + 1}`;
	// La mascotte porte seule le défi du jour (plus de carte dédiée) : invitation
	// tant qu'il reste à faire, félicitations une fois accompli.
	const g = getGoal();
	const bulle = g.done
		? `🎉 Bravo ! Tu as réussi ton défi du jour ! Reviens demain pour une nouvelle mission.`
		: `🎯 Effectue ton défi du jour : ${g.label}`;
	el.innerHTML = html`<div class="progress-card">
    ${mascotteBulleHTML(bulle, true)}
    <span class="progress-head">
      <span class="progress-rang"><span class="progress-rang-ico">${rang.icone}</span> ${rang.titre}</span>
      <span class="progress-lvl">Niveau ${pr.niveau}</span>
    </span>
    <span class="lvl-bar"><span class="lvl-bar-fill" style="width:${pr.pct}%"></span></span>
    <span class="progress-sub">${sub}</span>
  </div>`.balisage;
}
/* Menu déroulant : liste des profils (clic = bascule) + accès à la gestion */
export function renderProfileMenu() {
	const el = document.getElementById('profileMenu');
	if (!el) return;
	const m = loadProfilesMeta();
	if (!m) return;
	el.innerHTML = html`${joindre(
		m.list.map(
			(p) =>
				html`<button class="pm-item${p.uuid === m.active ? ' active' : ''}" data-uuid="${p.uuid}">${p.emoji} ${p.name}${p.uuid === m.active ? html` <span class="pm-check">${icon('check', { label: 'profil actif' })}</span>` : ''}</button>`,
		),
	)}${
		// « Mon espace » : l'enfant personnalise SON profil (avatar / thème / confort).
		// « Espace encadrants » : zone adulte (gestion des profils, suivi, réglages) —
		// gris + cadenas pour la décrocher visuellement et la rendre peu tentante.
		html`<button class="pm-item pm-mine" id="pmMine">${icon('palette')} Mon espace</button>`
	}${html`<button class="pm-item pm-manage" id="pmManage">${icon('lock')} Espace encadrants</button>`}`.balisage;
}
/* Profil dont la palette d'avatars est ouverte (null = aucune). Géré ici car
   l'écran de gestion se re-rend entièrement via renderProfiles(). */
let emojiPickerFor: string | null = null;
// Ouvre la palette d'un profil (ou la referme si on reclique le même). Renvoie
// le nouvel état ouvert pour permettre à l'appelant de re-rendre.
export function toggleEmojiPicker(uuid: string) {
	emojiPickerFor = emojiPickerFor === uuid ? null : uuid;
}
export function closeEmojiPicker() {
	emojiPickerFor = null;
}
/* Palette d'avatars : les 12 de base (toujours dispo) puis la gamme « forêt »
   débloquée par niveau. Les avatars verrouillés sont grisés avec « 🔒 Niv X ».
   `niveau` est celui du profil édité (pas forcément l'actif). */
export function emojiPaletteHTML(current: string, niveau: number) {
	const dispo = (e: string) =>
		html`<button class="emoji-opt${e === current ? ' current' : ''}" data-act="set-emoji" data-emoji="${e}"${
			e === current ? ' aria-current="true"' : ''
		} title="${e === current ? 'Avatar actuel' : 'Choisir cet avatar'}">${e}</button>`;
	const base = joindre(PROFILE_EMOJIS.map(dispo));
	const foret = joindre(
		AVATARS_FORET.map((a) =>
			niveau >= a.niveau
				? dispo(a.emoji)
				: html`<span class="emoji-opt locked" title="Débloqué au niveau ${a.niveau}">${a.emoji}<span class="emoji-lock">${icon('lock')} ${a.niveau}</span></span>`,
		),
	);
	return html`<div class="emoji-palette" role="listbox" aria-label="Choisir un avatar">${base}${foret}</div>`;
}
/* Écran « Mon espace » (#234) : carte de SON profil uniquement (avatar + prénom).
   La gestion des AUTRES profils (créer / réinitialiser / supprimer / export) a migré
   dans l'espace encadrants — un enfant ne touche pas aux profils des autres. */
export function renderProfiles() {
	const el = document.getElementById('profileList');
	if (!el) return;
	const p = activeProfile();
	if (!p) return;
	if (emojiPickerFor && emojiPickerFor !== p.uuid) emojiPickerFor = null;
	el.innerHTML = html`
    <div class="profile-row active mine" data-uuid="${p.uuid}">
      <span class="profile-emoji">${p.emoji}</span>
      <span class="profile-name">${p.name}</span>
      <span class="profile-tools">
        <button data-act="emoji" title="Changer mon avatar"${p.uuid === emojiPickerFor ? ' aria-expanded="true"' : ''}>${icon('palette', { cls: 'ph-lg', label: 'Changer mon avatar' })}</button>
        <button data-act="rename" title="Changer mon prénom">${icon('pencil', { cls: 'ph-lg', label: 'Changer mon prénom' })}</button>
      </span>
      ${p.uuid === emojiPickerFor ? emojiPaletteHTML(p.emoji, niveauDepuisXP(getXPFor(p.uuid))) : ''}
    </div>`.balisage;
	renderToolbarProfile(); // garde le bouton de la barre synchronisé
}

/* Record de sprint (compté en nombre de bonnes réponses) */
function fillSprintRecord(elId: string) {
	const el = document.getElementById(elId);
	if (!el) return;
	const runs = loadRuns('sprint');
	if (!runs.length) {
		el.innerHTML = html`<span class="muted">Aucun sprint — à toi de jouer !</span>`.balisage;
		return;
	}
	el.innerHTML =
		html`🏅 Record : <strong>${[...runs].sort(cmpRun)[0].ok} bonnes réponses</strong>`.balisage;
}
/* Délai d'ici une échéance, en langage d'enfant (calé sur les jours calendaires). */
function quandRevision(echeance: number, now: number): string {
	const jours = Math.round((startOfDay(echeance) - startOfDay(now)) / JOUR);
	if (jours <= 0) return "plus tard aujourd'hui";
	if (jours === 1) return 'demain';
	return `dans ${jours} jours`;
}

/* Carte Révision : décompte des éléments dus, ou état « rien à réviser » tourné
   en réussite (la carte reste visible mais non actionnable, cf. avis UX/pédago).
   Au-delà d'une séance, on annonce l'EFFORT DU JOUR (ce que la séance proposera
   vraiment, plafond #439) et non le stock dû : une déclaration « déjà vu en classe »
   (#478) peut rendre des dizaines de leçons dues le même jour, et un compteur à
   trois chiffres qui ne descend pas malgré le travail est décourageant (avis
   pédagogue). En deçà du plafond, l'affichage est inchangé. */
function fillRevisionRecord(elId: string) {
	const el = document.getElementById(elId);
	if (!el) return;
	const ortho = loadOrtho();
	const revisions = loadLessonRevisions();
	// Entretien du niveau inférieur (#232) : compté dans ce qui est dû, et dans l'horizon
	// annoncé quand plus rien n'est dû — une échéance basse est redevenue un vrai rendez-vous.
	const bas = loadLessonRevisionsBasNiveau();
	const now = Date.now();
	const plafond = getRevisionPlafond();
	const n = countDusSeance(ortho, now, plafond);
	document.getElementById('cardRevision')?.classList.toggle('card-inactive', n === 0);
	if (n) {
		const { n: aFaire, plafonne } = effortRevisionAffiche(n, plafond);
		el.innerHTML = (
			plafonne
				? html`${icon('repeat')} <strong>${aFaire}</strong> à réviser aujourd'hui`
				: html`${icon('repeat')} <strong>${aFaire}</strong> à réviser`
		).balisage;
		return;
	}
	const echeance = prochaineEcheance(ortho, revisions, now, bas);
	if (echeance != null) {
		el.innerHTML =
			html`<span class="rev-ok">${icon('check-circle')} Bravo, tu es à jour !</span><span class="rev-next">Prochaine révision ${quandRevision(echeance, now)}.</span>`.balisage;
	} else if (aDesRevisions(ortho, revisions, bas)) {
		el.innerHTML =
			html`<span class="rev-ok">${icon('check-circle')} Bravo, tu as tout révisé !</span>`.balisage;
	} else {
		el.innerHTML =
			html`<span class="rev-empty">Tes révisions apparaîtront ici dès que tu auras travaillé quelques leçons.</span>`.balisage;
	}
}
export function sprintBoardHTML(): SafeHtml {
	const runs = loadRuns('sprint');
	if (!runs.length) return VIDE;
	const medals = ['🥇', '🥈', '🥉'];
	const top = [...runs].sort(cmpRun).slice(0, 3);
	const lis = joindre(
		top.map(
			(r, i) =>
				html`<li>${medals[i]} <strong>${r.ok}</strong> bonnes <span class="lb-mut">(${r.ok}/${r.count})</span></li>`,
		),
	);
	return html`<div class="lb">
    <h3>Sprint 5 min</h3>
    <ol class="podium">${lis}</ol>
    <p class="lb-count">${runs.length} sprint${runs.length > 1 ? 's' : ''}</p>
  </div>`;
}
/* Panneau de classement d'un mode (podium top-3 + progression) */
export function boardHTML(mode: string, label: string) {
	const runs = loadRuns(mode);
	if (!runs.length) return '';
	const medals = ['🥇', '🥈', '🥉'];
	const top = [...runs].sort(cmpRun).slice(0, 3);
	const lis = joindre(
		top.map(
			(r, i) => html`<li>${medals[i]} <strong>${r.ok}/${r.count}</strong> · ${fmt(r.ms)}</li>`,
		),
	);
	const reste = 3 - runs.length;
	const note =
		reste > 0
			? html`<p class="lb-note">Encore ${reste} essai${reste > 1 ? 's' : ''} pour débloquer les médailles.</p>`
			: VIDE;
	const spark =
		runs.length >= 2
			? html`<div class="spark-wrap"><span class="spark-lab">Progression (score %)</span>${sparkline(runs.map(runPct))}</div>`
			: VIDE;
	return html`<div class="lb">
    <h3>${label}</h3>
    <ol class="podium">${lis}</ol>
    ${note}${spark}
    <p class="lb-count">${runs.length} essai${runs.length > 1 ? 's' : ''} enregistré${runs.length > 1 ? 's' : ''}</p>
  </div>`;
}
/* Jour civil du dernier rendu de l'accueil. Tout ce que l'accueil annonce « du jour »
   (programme du jour, leçon du jour, révisions dues, objectifs) est daté de ce rendu :
   un accueil affiché la veille et jamais re-rendu MENT le lendemain — et l'enfant
   clique alors une carte qui renvoie à un programme qui n'existe plus (#517). */
let jourAccueil = '';

/* Re-rend l'accueil s'il est à l'écran et que le jour civil a changé depuis son rendu.
   Appelé au retour au premier plan (`visibilitychange`, main.ts) : une tablette dort
   toute la nuit et rouvre l'app le lendemain sans jamais recharger la page. Trois
   abstentions volontaires :
   - jour inchangé ⇒ rien n'a pu se périmer, et régénérer l'accueil à chaque réveil de
     tablette ferait retomber sur <body> le focus d'un enfant en train de naviguer au
     clavier, pour rien (avis relecteur a11y) ;
   - accueil masqué ⇒ une session ou un autre écran occupe la place, rien à faire ici
     (la prochaine navigation rendra un accueil frais) ;
   - accueil `inert` ⇒ une modale est ouverte (modal-a11y rend inertes les frères de
     l'overlay, et une modale ne masque PAS l'accueil) : re-rendre dessous détruirait
     le déclencheur que la modale a mémorisé pour restaurer le focus à sa fermeture. */
export function rafraichirAccueilSiJourChange(): void {
	const home = document.getElementById('home');
	if (!home || home.style.display === 'none' || home.hasAttribute('inert')) return;
	if (jourAccueil === todayStr()) return;
	renderHomeStats();
}

export function renderHomeStats() {
	jourAccueil = todayStr();
	// Le badge XP vit dans la barre d'outils ; la carte progression sur l'accueil.
	renderProgression();
	renderProgrammeCard(document.getElementById('cardProgramme')); // carte « programme du jour » (#440)
	// Les deux cartes « à faire » sont coordonnées (#516) : « à revoir » (#234) est rendue la
	// première et renvoie la leçon qu'elle a retenue, que « leçon du jour » (#208) évite à son
	// tour — sinon l'accueil pouvait proposer DEUX FOIS la même leçon (cf. accueil-propositions).
	const aRevoirLecon = renderARevoir(document.getElementById('aRevoir'));
	renderLeconDuJour(document.getElementById('leconDuJour'), undefined, aRevoirLecon);
	renderReprises(document.getElementById('reprises')); // « À continuer » (#63)
	const recL = document.getElementById('recLecon');
	if (recL) {
		// Le TEXTE est décidé par `core/compteur-etoiles.ts`, pur et testé (#559) : il vivait
		// ici, et deux défauts y étaient passés inaperçus faute de pouvoir être testés.
		recL.innerHTML = compteurEtoilesHTML({
			starsNiveau: starsEarned(), // étoiles du niveau actif
			totalNiveau: lessonsNiveauActif().length, // catalogue du niveau actif
			starsCumul: starsEarnedAll(), // cumul tous niveaux (ne baisse jamais)
			labelClasse: LEVEL_LABEL[niveauActif()],
		});
	}
	fillSprintRecord('recSprint');
	fillRevisionRecord('recRevision');
	renderObjectives();
	const boards = document.getElementById('boards');
	// Seul le sprint a un classement comparable (ensemble stable). Les bilans
	// express/complet varient d'un essai à l'autre → pas de podium (#35).
	if (boards) boards.innerHTML = sprintBoardHTML().balisage;
	evaluateTrophies(); // rattrape d'éventuels trophées acquis (sans célébration ici)
	renderRewardNav(); // boutons « Récompenses » / « Trophées » (ouvrent leurs modales)
	renderFavoris(document.getElementById('favoris'));
	onHomeShown(); // easter eggs (#331) : accès à l'album + tentative d'apparition ambiante
}

/* Objectifs de régularité (cadence saine, hebdomadaires).
   La pratique espacée prime : on encourage à revenir et à varier les activités
   (un peu de chrono, de l'entretien espacé, de la découverte), sans pression
   quotidienne. Cibles validées sur l'angle engagement CE2 (#178).
   `metric` choisit le compteur : 'runs' = essais d'un mode depuis le début de
   période (countSince) ; 'newLessons' = leçons travaillées pour la 1re fois. */
export const REGULARITY: {
	mode: string;
	icon: IconName;
	label: string;
	target: number;
	period: string;
	metric?: 'runs' | 'newLessons';
}[] = [
	{ mode: 'sprint', icon: 'run', label: 'Sprints', target: 2, period: 'week' },
	{ mode: 'revision-espacee', icon: 'repeat', label: 'Révisions', target: 3, period: 'week' },
	{
		mode: 'lecon',
		icon: 'book-open',
		label: 'Nouvelle leçon',
		target: 1,
		period: 'week',
		metric: 'newLessons',
	},
];
const PERIOD_LABEL: Record<string, string> = { week: 'cette semaine', month: 'ce mois-ci' };

/* Reste-t-il une leçon jamais travaillée à découvrir ? Sert à neutraliser
   l'objectif « nouvelle leçon » quand tout le catalogue est connu (sinon
   objectif fantôme, jamais cochable — dark pattern, cf. avis gamification #178). */
function aLeconInedite(): boolean {
	const vues = loadLessonFirstSeen();
	return getAllLessons().some((l) => vues[l.id] == null);
}

export function renderObjectives() {
	const el = document.getElementById('objectives');
	if (!el) return;
	const rows = joindre(
		REGULARITY.flatMap((o) => {
			const since = o.period === 'week' ? startOfWeek() : startOfMonth();
			const n = o.metric === 'newLessons' ? countNewLessonsSince(since) : countSince(o.mode, since);
			const done = n >= o.target;
			// « Nouvelle leçon » non atteinte et plus aucune leçon inédite : on masque
			// l'objectif plutôt que d'afficher une cible impossible à cocher.
			if (o.metric === 'newLessons' && !done && !aLeconInedite()) return [];
			return [
				html`<div class="obj ${done ? 'done' : ''}">
      <span class="obj-ico">${icon(o.icon)}</span>
      <span class="obj-lab">${o.label}</span>
      <span class="obj-prog">${Math.min(n, o.target)}/${o.target} <span class="obj-per">${PERIOD_LABEL[o.period]}</span></span>
      <span class="obj-check">${done ? icon('check') : ''}</span>
    </div>`,
			];
		}),
	);
	el.innerHTML = html`<h3 class="obj-h">Mes objectifs</h3>${rows}`.balisage;
}

/* Carte d'une leçon (étoile + taux de réussite). Réutilisée par le sélecteur
   de leçons et par l'écran d'une catégorie (navigation multi-matières). */
export function lessonCardHTML(
	l: { id: string; num: number | string; title: string },
	stars: Record<string, number>,
	lstats: Record<string, LessonStat>,
	repere?: 'plus-difficile',
	badge?: string,
) {
	const c = stars[l.id] || 0;
	// Badge « déjà maîtrisée en CE2 » (#225) : la même leçon a été réussie sans faute
	// à un niveau inférieur. Reconnaissance d'un acquis (texte, ton « validé »), JAMAIS
	// une fausse étoile pleine — l'étoile de CE niveau se gagne à part.
	const prevBadge = badge
		? html`<span class="lz-prev" title="Déjà réussie sans faute en ${badge}">✓ ${badge}</span>`
		: VIDE;
	// Repère « plus difficile » (#205) : badge texte ambre (un défi, pas un échec) —
	// l'info passe par le LIBELLÉ, jamais la seule couleur.
	const repereBadge =
		repere === 'plus-difficile'
			? html`<span class="lz-level" title="Leçon plus difficile">plus dur</span>`
			: VIDE;
	const starBadge =
		c > 0
			? html`<span class="lz-star" title="${c} sans-faute${c > 1 ? 's' : ''}">⭐${c > 1 ? html`<small>×${c}</small>` : ''}</span>`
			: html`<span class="lz-star empty" title="Pas encore réussie sans faute">☆</span>`;
	const avg = lessonAvgPct(lstats[l.id]);
	let stat;
	if (avg == null) {
		stat = html`<span class="lz-stat lz-stat-empty">Pas encore travaillée</span>`;
	} else {
		const col = pctColor(avg);
		const flag = avg < 70 ? html`<span class="lz-flag">à revoir</span>` : VIDE;
		stat = html`<span class="lz-stat">
      <span class="lz-bar"><span class="lz-bar-fill" style="width:${avg}%;background:${col}"></span></span>
      <span class="lz-pct" style="color:${col}">${avg}%</span>${flag}</span>`;
	}
	return html`<button class="lesson-item" data-id="${l.id}">
    <span class="lz-num">${l.num}</span>
    <span class="lz-main"><span class="lz-titleline"><span class="lz-title">${l.title}</span>${repereBadge}${prevBadge}</span>${stat}</span>
    ${starBadge}</button>`;
}

/* Liste des 15 leçons avec étoiles + taux de réussite */
export function renderLessons() {
	const stars = loadStars();
	const lstats = loadLessonStats();
	const list = document.getElementById('lessonList');
	if (list) {
		list.innerHTML = joindre(LESSONS.map((l) => lessonCardHTML(l, stars, lstats))).balisage;
	}
	const sum = document.getElementById('starsSummary');
	if (sum) {
		const n = starsEarned();
		const total = lessonsNiveauActif().length;
		const weak = LESSONS.filter((l) => {
			const a = lessonAvgPct(lstats[l.id]);
			return a != null && a < 70;
		}).map((l) => l.num);
		sum.innerHTML = html`⭐ ${n} / ${total} leçons réussies sans faute${
			weak.length
				? html` · <span class="weak-hint">à revoir : leçons ${weak.join(', ')}</span>`
				: VIDE
		}`.balisage;
	}
}
