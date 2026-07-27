/* ============================================================
   Reprise d'un exercice en cours (issue #63) — couche UI.
   ------------------------------------------------------------
   - capture() : lit l'état du DOM (#sheets) + le chrono et sauvegarde
     un instantané (core/resume) quand on quitte un exercice en cours ;
   - restore() : réinjecte un instantané (sans régénérer les calculs),
     chrono masqué (cf. décision UX : on n'exhibe pas un compteur déjà
     avancé) ;
   - renderReprises() : la section « À continuer » (accueil + catégorie),
     avec barre de progression visuelle, « Continuer » mis en avant et
     « Effacer » discret + confirmation ;
   - maybeRelaunch() : à la relance d'un exercice déjà commencé, propose
     « Continuer où tu en étais / Recommencer ».

   Le « contexte de reprise » (identité de l'exercice courant) est posé
   au lancement (runLecon / runBilanConfig / restore) et nettoyé à la fin
   (verify) ou en quittant vers un menu.
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { icon, iconOr } from './icon';
import { uiConfirm, toast } from './ui-modal';
import {
	loadResumes,
	getResume,
	removeResume,
	upsertResume,
	type ResumeSnapshot,
	type ResumeMode,
	type ResumeRelaunch,
} from '../core/resume';
import { createRenderContext, type Item } from '../core/items';
import { startChrono, getElapsed } from './chrono';
import {
	setCurrentMode,
	setCurrentLessonId,
	getSessionRecorded,
	setSessionRecorded,
	setSessionErreursLoggees,
	setToolbar,
	hideMenus,
	getRenderCtx,
	setRenderCtx,
} from './navigation';
import { setOrigineActivite } from './retour-activite';

const now = () => Date.now();
const MAX_CARDS = 3; // plafond d'affichage (le reste replié sous « voir tout »)

/* ---------- Contexte de l'exercice courant ---------- */
export interface ResumeCtx {
	key: string;
	mode: ResumeMode;
	label: string;
	icon: string;
	categoryId: string | null;
	relaunch: ResumeRelaunch;
}
let ctx: ResumeCtx | null = null;
export const setResumeCtx = (c: ResumeCtx) => {
	ctx = c;
};
export const clearResumeCtx = () => {
	ctx = null;
};

/* ---------- Capture (on quitte un exercice en cours) ---------- */
/* Sauvegarde silencieuse de l'état courant. Ne fait rien si aucun exercice
   reprenable n'est actif, s'il est déjà terminé, ou si rien n'a été saisi. */
export function captureResume(): void {
	if (!ctx || getSessionRecorded()) return;
	const sheets = document.getElementById('sheets');
	if (!sheets) return;
	const inputs = [...sheets.querySelectorAll<HTMLInputElement>('input.ans')];
	if (!inputs.length) return;
	const answers: Record<string, string> = {};
	let answered = 0;
	for (const inp of inputs) {
		if (inp.value.trim() !== '') {
			answers[inp.id] = inp.value;
			answered++;
		}
	}
	if (answered < 1) return; // rien de significatif à reprendre
	const active = document.activeElement as HTMLElement | null;
	const activeId = active && active.classList.contains('ans') ? active.id : null;
	upsertResume({
		key: ctx.key,
		version: 1,
		savedAt: now(),
		mode: ctx.mode,
		label: ctx.label,
		icon: ctx.icon,
		categoryId: ctx.categoryId,
		relaunch: ctx.relaunch,
		sheetsHTML: sheets.innerHTML,
		items: getRenderCtx().items,
		answers,
		activeId,
		elapsedMs: getElapsed(),
		total: inputs.length,
		answered,
	});
}

/* L'exercice est terminé (verify) ou explicitement abandonné : on oublie. */
export function finishResume(): void {
	if (ctx) removeResume(ctx.key);
	ctx = null;
}

/* ---------- Restauration ---------- */
export function restoreResume(snap: ResumeSnapshot): void {
	hideMenus();
	// Une reprise se lance depuis une carte « À continuer » (accueil / catégorie) : c'est
	// un lancement CATALOGUE, même si l'exercice venait à l'origine du programme (#461).
	setOrigineActivite('catalogue');
	setCurrentMode(snap.mode);
	setCurrentLessonId(snap.relaunch.type === 'lecon' ? snap.relaunch.lessonId : null);
	// Réinjecte le rendu exact, puis recâble la table id de champ -> Item.
	const sheets = document.getElementById('sheets')!;
	sheets.innerHTML = snap.sheetsHTML;
	// Contexte de session reconstitué (#352) : items restaurés et compteur repositionné
	// APRÈS le plus grand id capturé, pour éviter toute collision si un futur rendu de
	// cette session (rare) mintait de nouveaux champs.
	setRenderCtx(
		createRenderContext({ items: { ...snap.items }, counter: maxInputId(snap.items) + 1 }),
	);
	// Réécrit les réponses saisies.
	for (const [id, val] of Object.entries(snap.answers)) {
		const inp = document.getElementById(id) as HTMLInputElement | null;
		if (inp) inp.value = val;
	}
	setSessionRecorded(false);
	setSessionErreursLoggees(false); // reprise = même essai relancé → re-journalisable une fois (#391)
	// Nettoyage d'un éventuel résidu de session (score / bandeau de résultat).
	const sc = document.getElementById('score');
	if (sc) {
		sc.classList.add('hidden');
		sc.textContent = '';
	}
	document.getElementById('resultBanner')?.remove();
	ctx = {
		key: snap.key,
		mode: snap.mode,
		label: snap.label,
		icon: snap.icon,
		categoryId: snap.categoryId,
		relaunch: snap.relaunch,
	};
	// Barre en mode exercice ; chrono repris MASQUÉ (on ne montre pas 01:23).
	setToolbar({ verify: true, home: true, profile: false, print: true });
	startChrono(snap.elapsedMs, false);
	// Curseur sur le calcul « courant » (ou le premier champ vide).
	const target =
		(snap.activeId && (document.getElementById(snap.activeId) as HTMLInputElement | null)) ||
		firstEmpty(sheets);
	if (target) target.focus({ preventScroll: true });
	toast("Te revoilà ! On reprend là où tu t'étais arrêté.");
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function maxInputId(items: Record<string, Item>): number {
	let max = -1;
	for (const id of Object.keys(items)) {
		const n = Number(id.replace(/^a/, ''));
		if (Number.isFinite(n) && n > max) max = n;
	}
	return max;
}
function firstEmpty(root: HTMLElement): HTMLInputElement | null {
	return [...root.querySelectorAll<HTMLInputElement>('input.ans')].find((i) => !i.value) ?? null;
}

/* ---------- Relance d'un exercice déjà commencé ---------- */
/* Si une reprise existe pour cette clé, propose « Continuer / Recommencer ».
   Sinon, lance directement l'exercice neuf. */
export function maybeRelaunch(key: string, label: string, startFresh: () => void): void {
	const snap = getResume(key, now());
	if (!snap) {
		startFresh();
		return;
	}
	openChoiceModal(
		label,
		() => restoreResume(snap),
		() => {
			removeResume(key);
			startFresh();
		},
	);
}

/* ---------- Rendu de la section « À continuer » ---------- */
function progressLabel(s: ResumeSnapshot): string {
	if (s.answered >= s.total) return 'Presque fini !';
	const ratio = s.total ? s.answered / s.total : 0;
	if (ratio < 0.34) return 'Tu viens de commencer';
	if (ratio < 0.67) return 'Tu es à la moitié';
	return 'Bientôt fini !';
}

function cardHTML(s: ResumeSnapshot): string {
	const pct = s.total ? Math.round((s.answered / s.total) * 100) : 0;
	return `<div class="reprise-card" data-key="${escapeHTML(s.key)}">
    <div class="reprise-ico" aria-hidden="true">${iconOr(s.icon)}</div>
    <div class="reprise-main">
      <div class="reprise-title">${escapeHTML(s.label)}</div>
      <div class="reprise-prog-lab">${progressLabel(s)} <span class="reprise-count">${s.answered}/${s.total}</span></div>
      <div class="lvl-bar reprise-bar"><div class="lvl-bar-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="reprise-actions">
      <button class="reprise-continue" data-act="continue" data-key="${escapeHTML(s.key)}">Continuer →</button>
      <button class="reprise-erase" data-act="erase" data-key="${escapeHTML(s.key)}" title="Effacer cet exercice" aria-label="Effacer : ${escapeHTML(s.label)}">${icon('trash')} Effacer</button>
    </div>
  </div>`;
}

/* Rend la section dans `el`. Si categoryId est fourni, on ne montre que les
   reprises de cette catégorie (écran de catégorie). Vide => section masquée. */
export function renderReprises(el: HTMLElement | null, categoryId?: string): void {
	if (!el) return;
	let list = loadResumes(now());
	if (categoryId) list = list.filter((s) => s.categoryId === categoryId);
	if (!list.length) {
		el.innerHTML = '';
		el.style.display = 'none';
		return;
	}
	el.style.display = '';
	const shown = list.slice(0, MAX_CARDS);
	const extra = list.length - shown.length;
	const expandable = extra > 0;
	el.innerHTML = `<div class="reprises-box">
    <h3 class="reprises-h">▶ À continuer</h3>
    <div class="reprises-list">${shown.map(cardHTML).join('')}${
			expandable
				? `<div class="reprises-more" hidden>${list.slice(MAX_CARDS).map(cardHTML).join('')}</div>`
				: ''
		}</div>
    ${expandable ? `<button class="reprises-toggle" data-act="toggle">+ ${extra} autre${extra > 1 ? 's' : ''} exercice${extra > 1 ? 's' : ''} à continuer</button>` : ''}
  </div>`;
	wireReprises(el, categoryId);
}

function wireReprises(el: HTMLElement, categoryId?: string): void {
	el.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
		const act = btn.dataset.act;
		if (act === 'toggle') {
			btn.addEventListener('click', () => {
				const more = el.querySelector<HTMLElement>('.reprises-more');
				if (more) more.hidden = false;
				btn.remove();
			});
		} else if (act === 'continue') {
			btn.addEventListener('click', () => {
				const snap = getResume(btn.dataset.key!, now());
				if (snap) restoreResume(snap);
				else renderReprises(el, categoryId); // disparue entre-temps : on rafraîchit
			});
		} else if (act === 'erase') {
			btn.addEventListener('click', () => {
				const snap = getResume(btn.dataset.key!, now());
				openEraseModal(snap ? snap.label : '', () => {
					removeResume(btn.dataset.key!);
					renderReprises(el, categoryId);
					// Carte (et son bouton déclencheur) supprimée au re-rendu → repli de
					// focus explicite, jamais sur <body> (a11y, #230).
					(
						el.querySelector<HTMLElement>('.reprise-continue') ??
						document.getElementById('toolbarProfile')
					)?.focus();
				});
			});
		}
	});
}

/* ---------- Modales (déléguées au helper accessible ui/ui-modal) ---------- */
/* « Tu avais commencé ! » → Continuer (sûr, primaire, focus, ESC) / Recommencer.
   Le choix par défaut est de REPRENDRE : l'enfant a rouvert l'exercice qu'il
   faisait. */
function openChoiceModal(label: string, onContinue: () => void, onRestart: () => void): void {
	void uiConfirm({
		emoji: '🔁',
		title: 'Tu avais commencé !',
		message: label,
		confirmLabel: 'Recommencer du début',
		cancelLabel: "Continuer où j'en étais",
	}).then((recommencer) => (recommencer ? onRestart() : onContinue()));
}

/* Confirmation avant d'effacer une reprise (anti-effacement accidentel). Le choix
   sûr (« Non, je garde ») domine et reçoit le focus ; effacer est en danger bordé. */
function openEraseModal(label: string, onConfirm: () => void): void {
	void uiConfirm({
		emoji: '🗑️',
		title: 'Effacer cet exercice ?',
		message: `${label}\nTu repartiras de zéro.`,
		confirmLabel: 'Effacer',
		cancelLabel: 'Non, je garde',
		destructive: true,
		confirmIcon: 'trash',
	}).then((effacer) => {
		if (effacer) onConfirm();
	});
}
