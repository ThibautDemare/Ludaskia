/* ============================================================
   Rendu de l'écran d'accueil et du sélecteur de leçons
   ============================================================ */
import { escapeHTML, fmt } from '../core/utils';
import { activeProfile, loadProfilesMeta, PROFILE_EMOJIS, getXPFor } from '../core/profiles';
import { LESSONS } from '../core/lessons';
import { getAllLessons } from '../core/catalog';
import {
	loadRuns,
	cmpRun,
	runPct,
	starsEarned,
	loadStars,
	loadLessonStats,
	lessonAvgPct,
	startOfWeek,
	startOfMonth,
	countSince,
	countNewLessonsSince,
	loadLessonFirstSeen,
	getXP,
	progressionNiveau,
	niveauDepuisXP,
	loadLessonRevisions,
} from '../core/progress';
import { countDue, prochaineEcheance, aDesRevisions } from '../core/revision-select';
import { JOUR } from '../core/revision';
import { titreDuNiveau, AVATARS_FORET } from '../core/unlocks';
import { loadOrtho } from '../core/orthographe/store';
import { getGoal, evaluateTrophies } from '../core/rewards';
import { sparkline } from './effects';
import { renderFavoris } from './bilan';
import { renderReprises } from './resume';
import { renderRewardNav, mascotteBulleHTML } from './unlocks-view';
import { icon, type IconName } from './icon';

/* Niveau de réussite → couleur (rouge < 50, orange < 75, vert sinon) */
export const pctColor = (p: number) => (p < 50 ? '#c62828' : p < 75 ? '#ef6c00' : '#2e7d32');

/* Boutons fonctionnels au markup statique (toolbar + sauvegarde des profils) :
   leur libellé vit dans index.html, mais l'icône est injectée ici pour garder
   UNE seule source des SVG (cf. ui/icon.ts). Appelé une fois au câblage. */
export function paintStaticIcons() {
	const set = (id: string, html: string) => {
		const el = document.getElementById(id);
		if (el) el.innerHTML = html;
	};
	set('btnVerify', `${icon('check')} Vérifier`);
	set('btnHome', `${icon('house')} Accueil`);
	set('btnPrint', `${icon('printer')} Imprimer / PDF`);
	// Déclencheur du tiroir mobile (caché en desktop par CSS) : icône hamburger.
	set('toolbarBurger', icon('list'));
	set('btnExport', `${icon('export')} Exporter les profils cochés`);
	set('btnImport', `${icon('import')} Importer une sauvegarde`);
	// Grosses icônes d'entrée des cartes d'accueil (mode = rôle fonctionnel).
	const setIco = (cardId: string, html: string) => {
		const el = document.querySelector(`#${cardId} .ico`);
		if (el) el.innerHTML = html;
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
			`<span class="lvl-num">${rang.icone} Niveau ${pr.niveau}</span>` +
			`<span class="lvl-bar"><span class="lvl-bar-fill" style="width:${pr.pct}%"></span></span>`;
	}
	const el = document.getElementById('toolbarProfile');
	if (!el) return;
	const p = activeProfile();
	if (!p) return;
	el.innerHTML = `${p.emoji} ${escapeHTML(p.name)} <span class="btn-profile-caret">▾</span>`;
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
	el.innerHTML = `<div class="progress-card">
    ${mascotteBulleHTML(bulle, true)}
    <span class="progress-head">
      <span class="progress-rang"><span class="progress-rang-ico">${rang.icone}</span> ${rang.titre}</span>
      <span class="progress-lvl">Niveau ${pr.niveau}</span>
    </span>
    <span class="lvl-bar"><span class="lvl-bar-fill" style="width:${pr.pct}%"></span></span>
    <span class="progress-sub">${sub}</span>
  </div>`;
}
/* Menu déroulant : liste des profils (clic = bascule) + accès à la gestion */
export function renderProfileMenu() {
	const el = document.getElementById('profileMenu');
	if (!el) return;
	const m = loadProfilesMeta();
	if (!m) return;
	el.innerHTML =
		m.list
			.map(
				(p) =>
					`<button class="pm-item${p.uuid === m.active ? ' active' : ''}" data-uuid="${p.uuid}">${p.emoji} ${escapeHTML(p.name)}${p.uuid === m.active ? ` <span class="pm-check">${icon('check', { label: 'profil actif' })}</span>` : ''}</button>`,
			)
			.join('') +
		`<button class="pm-item pm-manage" id="pmManage">${icon('gear')} Gérer les profils</button>`;
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
function emojiPaletteHTML(current: string, niveau: number) {
	const dispo = (e: string) =>
		`<button class="emoji-opt${e === current ? ' current' : ''}" data-act="set-emoji" data-emoji="${e}"${
			e === current ? ' aria-current="true"' : ''
		} title="${e === current ? 'Avatar actuel' : 'Choisir cet avatar'}">${e}</button>`;
	const base = PROFILE_EMOJIS.map(dispo).join('');
	const foret = AVATARS_FORET.map((a) =>
		niveau >= a.niveau
			? dispo(a.emoji)
			: `<span class="emoji-opt locked" title="Débloqué au niveau ${a.niveau}">${a.emoji}<span class="emoji-lock">${icon('lock')} ${a.niveau}</span></span>`,
	).join('');
	return `<div class="emoji-palette" role="listbox" aria-label="Choisir un avatar">${base}${foret}</div>`;
}
/* Écran de gestion des profils */
export function renderProfiles() {
	const el = document.getElementById('profileList');
	if (!el) return;
	const m = loadProfilesMeta();
	if (!m) return;
	if (emojiPickerFor && !m.list.some((p) => p.uuid === emojiPickerFor)) emojiPickerFor = null;
	el.innerHTML =
		m.list
			.map(
				(p) => `
    <div class="profile-row${p.uuid === m.active ? ' active' : ''}" data-uuid="${p.uuid}">
      <input type="checkbox" class="profile-check" data-uuid="${p.uuid}" checked title="Inclure dans l'export">
      <button class="profile-pick" data-act="pick" title="Choisir ce profil">
        <span class="profile-emoji">${p.emoji}</span>
        <span class="profile-name">${escapeHTML(p.name)}</span>
        ${p.uuid === m.active ? '<span class="profile-tag">actif</span>' : ''}
      </button>
      <span class="profile-tools">
        <button data-act="emoji" title="Changer l'avatar"${p.uuid === emojiPickerFor ? ' aria-expanded="true"' : ''}>${icon('palette', { cls: 'ph-lg', label: "Changer l'avatar" })}</button>
        <button data-act="rename" title="Renommer">${icon('pencil', { cls: 'ph-lg', label: 'Renommer' })}</button>
        <button data-act="reset" title="Réinitialiser la progression">${icon('reset', { cls: 'ph-lg', label: 'Réinitialiser la progression' })}</button>
        <button data-act="delete" title="Supprimer le profil"${m.list.length <= 1 ? ' disabled' : ''}>${icon('trash', { cls: 'ph-lg', label: 'Supprimer le profil' })}</button>
      </span>
      ${p.uuid === emojiPickerFor ? emojiPaletteHTML(p.emoji, niveauDepuisXP(getXPFor(p.uuid))) : ''}
    </div>`,
			)
			.join('') +
		`<button class="profile-add" id="profileAdd">${icon('plus')} Nouveau profil</button>`;
	renderToolbarProfile(); // garde le bouton de la barre synchronisé
}

/* Record de sprint (compté en nombre de bonnes réponses) */
function fillSprintRecord(elId: string) {
	const el = document.getElementById(elId);
	if (!el) return;
	const runs = loadRuns('sprint');
	if (!runs.length) {
		el.innerHTML = `<span class="muted">Aucun sprint — à toi de jouer !</span>`;
		return;
	}
	el.innerHTML = `🏅 Record : <strong>${[...runs].sort(cmpRun)[0].ok} bonnes réponses</strong>`;
}
/* Délai d'ici une échéance, en langage d'enfant (calé sur les jours calendaires). */
function quandRevision(echeance: number, now: number): string {
	const jour = (ts: number) => {
		const d = new Date(ts);
		d.setHours(0, 0, 0, 0);
		return d.getTime();
	};
	const jours = Math.round((jour(echeance) - jour(now)) / JOUR);
	if (jours <= 0) return "plus tard aujourd'hui";
	if (jours === 1) return 'demain';
	return `dans ${jours} jours`;
}

/* Carte Révision : décompte des éléments dus, ou état « rien à réviser » tourné
   en réussite (la carte reste visible mais non actionnable, cf. avis UX/pédago). */
function fillRevisionRecord(elId: string) {
	const el = document.getElementById(elId);
	if (!el) return;
	const ortho = loadOrtho();
	const revisions = loadLessonRevisions();
	const now = Date.now();
	const n = countDue(ortho, revisions, now);
	document.getElementById('cardRevision')?.classList.toggle('card-inactive', n === 0);
	if (n) {
		el.innerHTML = `${icon('repeat')} <strong>${n}</strong> à réviser`;
		return;
	}
	const echeance = prochaineEcheance(ortho, revisions, now);
	if (echeance != null) {
		el.innerHTML = `<span class="rev-ok">${icon('check-circle')} Bravo, tu es à jour !</span><span class="rev-next">Prochaine révision ${quandRevision(echeance, now)}.</span>`;
	} else if (aDesRevisions(ortho, revisions)) {
		el.innerHTML = `<span class="rev-ok">${icon('check-circle')} Bravo, tu as tout révisé !</span>`;
	} else {
		el.innerHTML = `<span class="rev-empty">Tes révisions apparaîtront ici dès que tu auras travaillé quelques leçons.</span>`;
	}
}
export function sprintBoardHTML() {
	const runs = loadRuns('sprint');
	if (!runs.length) return '';
	const medals = ['🥇', '🥈', '🥉'];
	const top = [...runs].sort(cmpRun).slice(0, 3);
	const lis = top
		.map(
			(r, i) =>
				`<li>${medals[i]} <strong>${r.ok}</strong> bonnes <span class="lb-mut">(${r.ok}/${r.count})</span></li>`,
		)
		.join('');
	return `<div class="lb">
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
	const lis = top
		.map((r, i) => `<li>${medals[i]} <strong>${r.ok}/${r.count}</strong> · ${fmt(r.ms)}</li>`)
		.join('');
	const reste = 3 - runs.length;
	const note =
		reste > 0
			? `<p class="lb-note">Encore ${reste} essai${reste > 1 ? 's' : ''} pour débloquer les médailles.</p>`
			: '';
	const spark =
		runs.length >= 2
			? `<div class="spark-wrap"><span class="spark-lab">Progression (score %)</span>${sparkline(runs.map(runPct))}</div>`
			: '';
	return `<div class="lb">
    <h3>${label}</h3>
    <ol class="podium">${lis}</ol>
    ${note}${spark}
    <p class="lb-count">${runs.length} essai${runs.length > 1 ? 's' : ''} enregistré${runs.length > 1 ? 's' : ''}</p>
  </div>`;
}
export function renderHomeStats() {
	// Le badge XP vit dans la barre d'outils ; la carte progression sur l'accueil.
	renderProgression();
	renderReprises(document.getElementById('reprises')); // « À continuer » (#63)
	const recL = document.getElementById('recLecon');
	if (recL) {
		const n = starsEarned();
		const total = getAllLessons().length;
		recL.innerHTML = `⭐ <strong>${n}/${total}</strong> leçon${n > 1 ? 's' : ''} réussie${n > 1 ? 's' : ''} sans faute`;
	}
	fillSprintRecord('recSprint');
	fillRevisionRecord('recRevision');
	renderObjectives();
	const boards = document.getElementById('boards');
	// Seul le sprint a un classement comparable (ensemble stable). Les bilans
	// express/complet varient d'un essai à l'autre → pas de podium (#35).
	if (boards) boards.innerHTML = sprintBoardHTML();
	evaluateTrophies(); // rattrape d'éventuels trophées acquis (sans célébration ici)
	renderRewardNav(); // boutons « Récompenses » / « Trophées » (ouvrent leurs modales)
	renderFavoris(document.getElementById('favoris'));
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
	const rows = REGULARITY.flatMap((o) => {
		const since = o.period === 'week' ? startOfWeek() : startOfMonth();
		const n = o.metric === 'newLessons' ? countNewLessonsSince(since) : countSince(o.mode, since);
		const done = n >= o.target;
		// « Nouvelle leçon » non atteinte et plus aucune leçon inédite : on masque
		// l'objectif plutôt que d'afficher une cible impossible à cocher.
		if (o.metric === 'newLessons' && !done && !aLeconInedite()) return [];
		return [
			`<div class="obj ${done ? 'done' : ''}">
      <span class="obj-ico">${icon(o.icon)}</span>
      <span class="obj-lab">${o.label}</span>
      <span class="obj-prog">${Math.min(n, o.target)}/${o.target} <span class="obj-per">${PERIOD_LABEL[o.period]}</span></span>
      <span class="obj-check">${done ? icon('check') : ''}</span>
    </div>`,
		];
	}).join('');
	el.innerHTML = `<h3 class="obj-h">Mes objectifs</h3>${rows}`;
}

/* Carte d'une leçon (étoile + taux de réussite). Réutilisée par le sélecteur
   de leçons et par l'écran d'une catégorie (navigation multi-matières). */
export function lessonCardHTML(
	l: { id: string; num: number | string; title: string },
	stars: Record<string, number>,
	lstats: Record<string, any>,
) {
	const c = stars[l.id] || 0;
	const starBadge =
		c > 0
			? `<span class="lz-star" title="${c} sans-faute${c > 1 ? 's' : ''}">⭐${c > 1 ? `<small>×${c}</small>` : ''}</span>`
			: `<span class="lz-star empty" title="Pas encore réussie sans faute">☆</span>`;
	const avg = lessonAvgPct(lstats[l.id]);
	let stat;
	if (avg == null) {
		stat = `<span class="lz-stat lz-stat-empty">Pas encore travaillée</span>`;
	} else {
		const col = pctColor(avg);
		const flag = avg < 70 ? `<span class="lz-flag">à revoir</span>` : '';
		stat = `<span class="lz-stat">
      <span class="lz-bar"><span class="lz-bar-fill" style="width:${avg}%;background:${col}"></span></span>
      <span class="lz-pct" style="color:${col}">${avg}%</span>${flag}</span>`;
	}
	return `<button class="lesson-item" data-id="${l.id}">
    <span class="lz-num">${l.num}</span>
    <span class="lz-main"><span class="lz-title">${l.title}</span>${stat}</span>
    ${starBadge}</button>`;
}

/* Liste des 15 leçons avec étoiles + taux de réussite */
export function renderLessons() {
	const stars = loadStars();
	const lstats = loadLessonStats();
	const list = document.getElementById('lessonList');
	if (list) {
		list.innerHTML = LESSONS.map((l) => lessonCardHTML(l, stars, lstats)).join('');
	}
	const sum = document.getElementById('starsSummary');
	if (sum) {
		const n = starsEarned();
		const total = getAllLessons().length;
		const weak = LESSONS.filter((l) => {
			const a = lessonAvgPct(lstats[l.id]);
			return a != null && a < 70;
		}).map((l) => l.num);
		sum.innerHTML =
			`⭐ ${n} / ${total} leçons réussies sans faute` +
			(weak.length ? ` · <span class="weak-hint">à revoir : leçons ${weak.join(', ')}</span>` : '');
	}
}
