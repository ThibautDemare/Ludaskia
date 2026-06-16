/* ============================================================
   Mode Révision (issue #45) : rejoue les éléments « dus » selon la
   répétition espacée, REGROUPÉS PAR CATÉGORIE (jamais en alternance
   inter-matières). Un élément à la fois ; chaque réponse met à jour
   l'état SR (et donne 1 XP si réussie). Pas de chrono, pas de record.
   Rendu selon la nature : maths = saisie, conjugaison = QCM,
   orthographe = mot caché (on regarde, puis on écrit).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { icon } from './icon';
import { getLessonById, genLessonItem } from '../core/catalog';
import { hasMode } from '../core/exercise';
import type { Item } from '../core/items';
import { checkItemAnswer, figureBlock, renderItem, TEXT_ANSWER_INPUT_ATTRS } from '../core/items';
import { loadOrtho, saveOrtho, avancerMotRevision } from '../core/orthographe/store';
import type { OrthoState } from '../core/orthographe/types';
import { loadLessonRevisions, avancerLessonRevision, addXP } from '../core/progress';
import { selectDueGroups } from '../core/revision-select';
import { setToolbar, hideMenus, goHome, setCurrentMode, setCurrentLessonId } from './navigation';

type RevItem = { groupLabel: string } & (
	| { kind: 'num'; lessonId: string; item: Item }
	| { kind: 'qcm'; lessonId: string; item: Item; choices: string[] }
	| { kind: 'word'; wordId: string; mot: string }
);

let items: RevItem[] = [];
let idx = 0;
let score = 0;
let ortho: OrthoState;
let active = false; // une révision est-elle EN COURS ? (garde-fou de sortie, #63)

// Exposé pour le garde-fou de sortie ; remis à zéro en quittant la vue.
export const isRevisionRunning = () => active;
export const revisionCleanup = () => {
	active = false;
};

export function runRevisionEspacee(): void {
	setCurrentMode('revision'); // non enregistré comme un bilan (pas de record)
	setCurrentLessonId(null);
	hideMenus();
	setToolbar({ verify: false, home: true, profile: false });
	ortho = loadOrtho();
	const groups = selectDueGroups(ortho, loadLessonRevisions(), Date.now());
	items = [];
	for (const g of groups) {
		for (const it of g.items) {
			if (it.kind === 'word') {
				const m = ortho.banque[it.id];
				if (m) items.push({ groupLabel: g.label, kind: 'word', wordId: it.id, mot: m.mot });
				continue;
			}
			const lesson = getLessonById(it.id);
			if (!lesson) continue;
			if (hasMode(lesson.exerciseType, 'qcm')) {
				const ex = lesson.exerciseType.generate('qcm');
				if (ex.type === 'qcm')
					items.push({
						groupLabel: g.label,
						kind: 'qcm',
						lessonId: it.id,
						item: { text: ex.question, answer: ex.answer, kind: 'text', figure: ex.figure },
						choices: ex.choices,
					});
			} else {
				items.push({
					groupLabel: g.label,
					kind: 'num',
					lessonId: it.id,
					item: genLessonItem(lesson),
				});
			}
		}
	}
	idx = 0;
	score = 0;
	active = false;
	const sheets = document.getElementById('sheets')!;
	if (!items.length) {
		sheets.innerHTML = `<div class="revision"><div class="rev-done">
      <div class="rev-done-big">👍</div>
      <div class="rev-done-lab">Rien à réviser pour l'instant !</div>
      <div class="rev-done-sub">Reviens un autre jour : les notions à entretenir réapparaîtront ici.</div>
      <div class="rev-actions"><button class="rev-btn" id="revHome">${icon('house')} Accueil</button></div>
    </div></div>`;
		document.getElementById('revHome')!.addEventListener('click', goHome);
		return;
	}
	active = true; // révision réellement en cours (au moins un élément à réviser)
	sheets.innerHTML = `<div class="revision">
    <div class="rev-hud">
      <span class="rev-prog" id="revProg"></span>
      <span class="rev-cat" id="revCat"></span>
    </div>
    <div class="rev-stage" id="revStage"></div>
  </div>`;
	renderCurrent();
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateHud() {
	const prog = document.getElementById('revProg');
	const cat = document.getElementById('revCat');
	if (prog) prog.textContent = `${idx + 1} / ${items.length}`;
	if (cat) cat.textContent = items[idx].groupLabel;
}

function renderCurrent() {
	updateHud();
	const it = items[idx];
	if (it.kind === 'qcm') renderQcm(it);
	else if (it.kind === 'word') renderWordLook(it);
	else if (it.item.kind === 'posed') renderPosed(it);
	else renderNum(it);
}

/* Révision d'une opération posée (#97) : la grille de cellules, validée d'un coup
   (toutes les cellules-résultat justes = réussi). */
function renderPosed(it: Extract<RevItem, { kind: 'num' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = `<div class="rev-q rev-posee">${renderItem(it.item)}</div>
    <div class="rev-actions"><button class="rev-btn" id="revValidate">Valider</button></div>`;
	document.getElementById('revValidate')!.addEventListener('click', () => {
		const cells = [...stage.querySelectorAll<HTMLInputElement>('.posee-input')];
		const vide = cells.find((c) => c.value.trim() === '');
		if (vide) return vide.focus();
		const reussi = cells.every((c) => Number(c.value.trim()) === Number(c.dataset.answer));
		grade(reussi, String(it.item.answer));
	});
}

function renderNum(it: Extract<RevItem, { kind: 'num' }>) {
	const stage = document.getElementById('revStage')!;
	const q = escapeHTML(it.item.text).replace(
		'@',
		'<input id="revInput" class="rev-input" inputmode="numeric" autocomplete="off">',
	);
	stage.innerHTML = `${figureBlock(it.item.figure)}<div class="rev-q">${q}</div>
    <div class="rev-actions"><button class="rev-btn" id="revValidate">Valider</button></div>`;
	document.getElementById('revValidate')!.addEventListener('click', () => {
		const inp = document.getElementById('revInput') as HTMLInputElement;
		if (inp.value.trim() === '') return inp.focus();
		grade(checkItemAnswer(it.item, inp.value), String(it.item.answer));
	});
	bindEnter();
	(document.getElementById('revInput') as HTMLInputElement).focus();
}

function renderQcm(it: Extract<RevItem, { kind: 'qcm' }>) {
	const stage = document.getElementById('revStage')!;
	const q = escapeHTML(it.item.text).replace('@', '<span class="rev-blank">?</span>');
	stage.innerHTML = `${figureBlock(it.item.figure)}<div class="rev-q rev-q-qcm">${q}</div>
    <div class="rev-choices">${it.choices
			.map((c, i) => `<button class="rev-choice" data-i="${i}">${escapeHTML(c)}</button>`)
			.join('')}</div>`;
	stage.querySelectorAll<HTMLButtonElement>('.rev-choice').forEach((btn) => {
		btn.addEventListener('click', () =>
			grade(checkItemAnswer(it.item, it.choices[Number(btn.dataset.i)]), String(it.item.answer)),
		);
	});
}

/* Orthographe — phase 1 : on regarde le mot. */
function renderWordLook(it: Extract<RevItem, { kind: 'word' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = `<div class="rev-consigne">Regarde bien ce mot, puis écris-le sans le voir.</div>
    <div class="rev-word">${escapeHTML(it.mot)}</div>
    <div class="rev-actions"><button class="rev-btn" id="revHide">Cacher et écrire</button></div>`;
	document.getElementById('revHide')!.addEventListener('click', () => renderWordWrite(it));
}

/* Orthographe — phase 2 : on écrit le mot de mémoire. */
function renderWordWrite(it: Extract<RevItem, { kind: 'word' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = `<div class="rev-consigne">Écris le mot.</div>
    <div class="rev-q"><input id="revInput" class="rev-input rev-input-text" ${TEXT_ANSWER_INPUT_ATTRS}></div>
    <div class="rev-actions"><button class="rev-btn" id="revValidate">Valider</button></div>`;
	document.getElementById('revValidate')!.addEventListener('click', () => {
		const inp = document.getElementById('revInput') as HTMLInputElement;
		if (inp.value.trim() === '') return inp.focus();
		grade(checkItemAnswer({ text: '', answer: it.mot, kind: 'text' }, inp.value), it.mot);
	});
	bindEnter();
	(document.getElementById('revInput') as HTMLInputElement).focus();
}

function bindEnter() {
	const stage = document.getElementById('revStage')!;
	stage.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			document.getElementById('revValidate')?.dispatchEvent(new Event('click'));
		}
	});
}

/* Enregistre la réponse, met à jour l'état SR, puis enchaîne. */
function grade(reussi: boolean, correct: string) {
	const it = items[idx];
	const now = Date.now();
	if (it.kind === 'word') {
		avancerMotRevision(ortho, it.wordId, reussi, now);
		saveOrtho(ortho);
	} else {
		avancerLessonRevision(it.lessonId, reussi, now);
	}
	if (reussi) {
		score++;
		addXP(1);
	}
	const stage = document.getElementById('revStage')!;
	const verdict = reussi
		? `<div class="rev-feedback ok">✓ Bravo !</div>`
		: `<div class="rev-feedback ko">✗ La bonne réponse : <strong>${escapeHTML(correct)}</strong></div>`;
	stage.innerHTML = `${verdict}
    <div class="rev-actions"><button class="rev-btn" id="revNext">${idx + 1 < items.length ? 'Continuer ▶' : 'Terminer'}</button></div>`;
	document.getElementById('revNext')!.addEventListener('click', next);
	document.getElementById('revNext')!.focus();
}

function next() {
	idx++;
	if (idx >= items.length) return renderDone();
	renderCurrent();
}

function renderDone() {
	active = false; // terminée : plus rien à perdre, pas de confirmation de sortie
	const stage = document.getElementById('revStage')!;
	if (!stage) return;
	document.querySelector('.rev-hud')?.remove();
	stage.innerHTML = `<div class="rev-done">
    <div class="rev-done-big">${score}/${items.length}</div>
    <div class="rev-done-lab">révision terminée</div>
    <div class="rev-done-sub">Les notions réussies reviendront plus tard, les autres plus tôt.</div>
    <div class="rev-actions"><button class="rev-btn" id="revHome">${icon('house')} Accueil</button></div>
  </div>`;
	document.getElementById('revHome')!.addEventListener('click', goHome);
}
