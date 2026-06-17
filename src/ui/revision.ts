/* ============================================================
   Mode Révision (issue #45) : rejoue les éléments « dus » selon la
   répétition espacée, REGROUPÉS PAR CATÉGORIE (jamais en alternance
   inter-matières). Un élément à la fois ; chaque réponse met à jour
   l'état SR (et donne 1 XP si réussie). Pas de chrono, pas de record.
   Rendu selon la nature : maths = saisie, conjugaison = QCM,
   orthographe = mot caché (on regarde, puis on écrit).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import { bindConsigneTts } from './consigne-tts';
import { icon } from './icon';
import { getLessonById, genLessonItem, answerEstNumerique } from '../core/catalog';
import { hasMode } from '../core/exercise';
import type { Item } from '../core/items';
import {
	checkItemAnswer,
	enonceTexte,
	figureBlock,
	renderItem,
	TEXT_ANSWER_INPUT_ATTRS,
} from '../core/items';
import { loadOrtho, saveOrtho, avancerMotRevision } from '../core/orthographe/store';
import type { OrthoState } from '../core/orthographe/types';
import { loadLessonRevisions, avancerLessonRevision, addXP, recordRun } from '../core/progress';
import { selectDueGroups } from '../core/revision-select';
import { setToolbar, hideMenus, goHome, setCurrentMode, setCurrentLessonId } from './navigation';

// `consigne` (#186) : libellé de la leçon, affiché au-dessus de l'exercice pour
// dire ce qu'on attend (le HUD ne montre que la catégorie). Absent pour les mots
// d'orthographe, qui portent déjà leur propre consigne.
type RevItem = { groupLabel: string; consigne?: string } & (
	| { kind: 'num'; lessonId: string; item: Item }
	| { kind: 'qcm'; lessonId: string; item: Item; choices: string[] }
	| { kind: 'word'; wordId: string; mot: string }
	// Interactions « tuiles » rejouées telles quelles en révision (#186), sans clavier.
	| {
			kind: 'tuile';
			lessonId: string;
			question: string;
			answer: string;
			tuiles: string[];
			parle?: string;
	  }
	| { kind: 'ordre'; lessonId: string; question: string; ordre: string[]; tuiles: string[] }
	| {
			kind: 'tri';
			lessonId: string;
			question: string;
			categories: [string, string];
			mots: { mot: string; cat: 0 | 1 }[];
	  }
);

let items: RevItem[] = [];
let idx = 0;
let score = 0;
let ortho: OrthoState;
let active = false; // une révision est-elle EN COURS ? (garde-fou de sortie, #63)
let startTs = 0; // début de la session (durée enregistrée à la fin, #178)

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
			const type = lesson.exerciseType;
			const consigne = lesson.label; // consigne affichée = libellé de la leçon (#186)
			// QCM (conjugaison, homophones, géométrie…) : inchangé.
			if (hasMode(type, 'qcm')) {
				const ex = type.generate('qcm');
				if (ex.type === 'qcm')
					items.push({
						groupLabel: g.label,
						consigne,
						kind: 'qcm',
						lessonId: it.id,
						item: {
							text: ex.question,
							answer: ex.answer,
							kind: 'text',
							figure: ex.figure,
							parle: ex.parle,
						},
						choices: ex.choices,
					});
				continue;
			}
			// Interactions « tuiles » natives, rejouées telles quelles en révision (#186) :
			// ranger une suite (ordre alpha) et ranger par thème (champs lexicaux).
			const ex = type.generate();
			if (ex.type === 'tuilesOrdre') {
				items.push({
					groupLabel: g.label,
					consigne,
					kind: 'ordre',
					lessonId: it.id,
					question: ex.question,
					ordre: ex.ordre,
					tuiles: ex.tuiles,
				});
				continue;
			}
			if (ex.type === 'tuilesTri') {
				items.push({
					groupLabel: g.label,
					consigne,
					kind: 'tri',
					lessonId: it.id,
					question: ex.question,
					categories: ex.categories,
					mots: ex.mots,
				});
				continue;
			}
			// Réponse non numérique (signe <, =, >) + mode tuiles disponible → on rejoue en
			// tuiles plutôt qu'en saisie : un signe n'est pas saisissable au clavier numérique
			// sur mobile (#186).
			if (ex.type === 'text' && !answerEstNumerique(String(ex.answer)) && hasMode(type, 'tuiles')) {
				const tex = type.generate('tuiles');
				if (tex.type === 'tuilesNombre') {
					items.push({
						groupLabel: g.label,
						consigne,
						kind: 'tuile',
						lessonId: it.id,
						question: tex.question,
						answer: tex.answer,
						tuiles: tex.tuiles,
						parle: tex.parle,
					});
					continue;
				}
			}
			// Repli saisie (num / texte / heure / posé) : genLessonItem gère figure, heure et
			// l'opération posée.
			items.push({
				groupLabel: g.label,
				consigne,
				kind: 'num',
				lessonId: it.id,
				item: genLessonItem(lesson),
			});
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
	startTs = Date.now();
	sheets.innerHTML = `<div class="revision">
    <div class="rev-hud">
      <span class="rev-prog" id="revProg"></span>
      <span class="rev-cat" id="revCat"></span>
    </div>
    <div class="rev-stage" id="revStage"></div>
  </div>`;
	bindEnter(); // une seule fois : #revStage persiste d'une question à l'autre
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
	else if (it.kind === 'tuile') renderTuile(it);
	else if (it.kind === 'ordre') renderOrdre(it);
	else if (it.kind === 'tri') renderTri(it);
	else if (it.item.kind === 'posed') renderPosed(it);
	else renderNum(it);
	bindConsigneTts(document.getElementById('revStage')!); // bouton « Écouter » (#42)
}

/* Consigne (#186) : libellé de la leçon, affiché au-dessus de l'exercice (le HUD
   ne montre que la catégorie). Vide pour les items sans consigne (mots). */
function consigneHTML(it: RevItem): string {
	return it.consigne ? `<div class="rev-consigne">${escapeHTML(it.consigne)}</div>` : '';
}

/* Révision d'une opération posée (#97) : la grille de cellules, validée d'un coup
   (toutes les cellules-résultat justes = réussi). */
function renderPosed(it: Extract<RevItem, { kind: 'num' }>) {
	const stage = document.getElementById('revStage')!;
	stage.innerHTML = `${consigneHTML(it)}<div class="rev-q rev-posee">${renderItem(it.item)}</div>
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
	// Réponse non numérique (signe, nom de figure, heure « H h MM »…) → champ TEXTE
	// (clavier complet). `inputmode="numeric"` n'expose que les chiffres sur mobile,
	// d'où l'impossibilité de saisir un signe ou un mot en révision (#186).
	const texte = it.item.kind === 'text' || it.item.kind === 'heure';
	const champ = texte
		? `<input id="revInput" class="rev-input rev-input-text" ${TEXT_ANSWER_INPUT_ATTRS}>`
		: '<input id="revInput" class="rev-input" inputmode="numeric" autocomplete="off">';
	const q = enonceTexte(it.item.text).replace('@', champ);
	stage.innerHTML = `${consigneHTML(it)}${figureBlock(it.item.figure)}<div class="rev-q"${ttsAttr(it.item.parle ?? it.item.text)}>${q}</div>
    <div class="rev-actions"><button class="rev-btn" id="revValidate">Valider</button></div>`;
	document.getElementById('revValidate')!.addEventListener('click', () => {
		const inp = document.getElementById('revInput') as HTMLInputElement;
		if (inp.value.trim() === '') return inp.focus();
		grade(checkItemAnswer(it.item, inp.value), String(it.item.answer));
	});
	(document.getElementById('revInput') as HTMLInputElement).focus();
}

function renderQcm(it: Extract<RevItem, { kind: 'qcm' }>) {
	const stage = document.getElementById('revStage')!;
	const q = escapeHTML(it.item.text).replace('@', '<span class="rev-blank">?</span>');
	stage.innerHTML = `${consigneHTML(it)}${figureBlock(it.item.figure)}<div class="rev-q rev-q-qcm"${ttsAttr(it.item.parle ?? it.item.text)}>${q}</div>
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
	(document.getElementById('revInput') as HTMLInputElement).focus();
}

/* ---------- Interactions « tuiles » (#186) ----------
   Rendus « un item à la fois » alignés sur le moteur de révision (validation →
   grade), réutilisant les composants visuels et le tap/glisser des runners de
   leçon (ui/lecon-tuiles.ts, lecon-ordre.ts, lecon-tri.ts), sans leur boucle de
   session ni `recordLessonRun`. Tap fiable au doigt + glisser en appoint souris. */

/* Comparaison : amener LA bonne tuile (signe <, =, >) dans la case, sans clavier. */
function renderTuile(it: Extract<RevItem, { kind: 'tuile' }>) {
	const stage = document.getElementById('revStage')!;
	let placed: string | null = null;
	const enonce = escapeHTML(it.question).replace(
		'@',
		'<button type="button" class="ltui-slot" id="ltuiSlot" aria-label="Emplacement de la réponse"></button>',
	);
	stage.innerHTML = `${consigneHTML(it)}
    <p class="ltui-consigne">Amène la bonne tuile dans la case (tape-la ou glisse-la).</p>
    <div class="rev-q ltui-enonce"${ttsAttr(it.parle ?? it.question)}>${enonce}</div>
    <div class="ltui-bac" id="ltuiBac"></div>
    <div class="rev-actions"><button class="rev-btn" id="revValidate" disabled>Valider</button></div>`;
	const slot = document.getElementById('ltuiSlot') as HTMLElement;
	const bac = document.getElementById('ltuiBac') as HTMLElement;
	const verif = document.getElementById('revValidate') as HTMLButtonElement;
	function redraw() {
		slot.textContent = placed ?? '';
		slot.classList.toggle('rempli', placed !== null);
		bac.innerHTML = it.tuiles
			.map((t) => {
				const used = t === placed;
				return `<button type="button" class="tuile ltui-tuile${used ? ' tuile-used' : ''}" data-val="${escapeHTML(t)}"${used ? ' disabled' : ' draggable="true"'}>${escapeHTML(t)}</button>`;
			})
			.join('');
		bac.querySelectorAll<HTMLButtonElement>('.ltui-tuile').forEach((btn) => {
			const val = btn.dataset.val!;
			btn.addEventListener('click', () => {
				placed = val;
				redraw();
			});
			btn.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', val));
		});
		verif.disabled = placed === null;
	}
	slot.addEventListener('dragover', (e) => e.preventDefault());
	slot.addEventListener('drop', (e) => {
		e.preventDefault();
		const val = e.dataTransfer?.getData('text/plain');
		if (val) {
			placed = val;
			redraw();
		}
	});
	slot.addEventListener('click', () => {
		if (placed !== null) {
			placed = null;
			redraw();
		}
	});
	verif.addEventListener('click', () => {
		if (placed === null) return;
		grade(placed === it.answer, it.answer);
	});
	redraw();
}

/* Ordre alphabétique : ranger les tuiles-mots dans des cases numérotées. */
function renderOrdre(it: Extract<RevItem, { kind: 'ordre' }>) {
	const stage = document.getElementById('revStage')!;
	const placed: string[] = [];
	stage.innerHTML = `${consigneHTML(it)}
    <p class="rev-q lord-consigne"${ttsAttr(it.question)}>${escapeHTML(it.question)}</p>
    <div class="lord-seq" id="lordSeq"></div>
    <p class="ltui-consigne">Tape les mots dans l'ordre (ou glisse-les dans les cases).</p>
    <div class="ltui-bac" id="lordBac"></div>
    <div class="rev-actions"><button class="rev-btn" id="revValidate" disabled>Valider</button></div>`;
	const seq = document.getElementById('lordSeq') as HTMLElement;
	const bac = document.getElementById('lordBac') as HTMLElement;
	const verif = document.getElementById('revValidate') as HTMLButtonElement;
	function poser(val: string) {
		if (placed.length >= it.ordre.length || placed.includes(val)) return;
		placed.push(val);
		redraw();
	}
	function retirer(pos: number) {
		if (pos < 0 || pos >= placed.length) return;
		placed.splice(pos, 1);
		redraw();
	}
	function redraw() {
		seq.innerHTML = it.ordre
			.map((_, i) => {
				const mot = placed[i];
				const rempli = mot !== undefined;
				return `<button type="button" class="lord-cell${rempli ? ' rempli' : ''}" data-pos="${i}"${rempli ? '' : ' disabled'}><span class="lord-num" aria-hidden="true">${i + 1}</span><span class="lord-mot">${rempli ? escapeHTML(mot) : ''}</span></button>`;
			})
			.join('');
		seq.querySelectorAll<HTMLButtonElement>('.lord-cell.rempli').forEach((cell) => {
			cell.addEventListener('click', () => retirer(Number(cell.dataset.pos)));
		});
		bac.innerHTML = it.tuiles
			.map((t) => {
				const used = placed.includes(t);
				return `<button type="button" class="tuile lord-tuile${used ? ' tuile-used' : ''}" data-val="${escapeHTML(t)}"${used ? ' disabled' : ' draggable="true"'}>${escapeHTML(t)}</button>`;
			})
			.join('');
		bac.querySelectorAll<HTMLButtonElement>('.lord-tuile:not(.tuile-used)').forEach((btn) => {
			const val = btn.dataset.val!;
			btn.addEventListener('click', () => poser(val));
			btn.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', val));
		});
		verif.disabled = placed.length !== it.ordre.length;
	}
	seq.addEventListener('dragover', (e) => {
		if (placed.length < it.ordre.length) e.preventDefault();
	});
	seq.addEventListener('drop', (e) => {
		e.preventDefault();
		const val = e.dataTransfer?.getData('text/plain');
		if (val) poser(val);
	});
	verif.addEventListener('click', () => {
		if (placed.length !== it.ordre.length) return;
		grade(
			placed.every((mot, i) => mot === it.ordre[i]),
			it.ordre.join(' · '),
		);
	});
	redraw();
}

/* Ranger par thème (champs lexicaux) : tap en deux temps (mot puis thème) ou glisser. */
function renderTri(it: Extract<RevItem, { kind: 'tri' }>) {
	const stage = document.getElementById('revStage')!;
	const placed: Record<string, 0 | 1> = {};
	let selected: string | null = null;
	stage.innerHTML = `${consigneHTML(it)}
    <p class="rev-q lord-consigne"${ttsAttr(it.question)}>${escapeHTML(it.question)}</p>
    <p class="ltui-consigne">Tape un mot, puis tape son thème (ou glisse-le dans la colonne).</p>
    <div class="ltri-cols" id="ltriCols"></div>
    <div class="ltui-bac" id="ltriBac"></div>
    <div class="rev-actions"><button class="rev-btn" id="revValidate" disabled>Valider</button></div>`;
	const cols = document.getElementById('ltriCols') as HTMLElement;
	const bac = document.getElementById('ltriBac') as HTMLElement;
	const verif = document.getElementById('revValidate') as HTMLButtonElement;
	function motsDeColonne(col: 0 | 1): string[] {
		return it.mots.map((m) => m.mot).filter((mot) => placed[mot] === col);
	}
	function poser(val: string, col: 0 | 1) {
		if (placed[val] !== undefined) return;
		placed[val] = col;
		if (selected === val) selected = null;
		redraw();
	}
	function retirer(val: string) {
		if (placed[val] === undefined) return;
		delete placed[val];
		redraw();
	}
	function selectTuile(val: string) {
		if (placed[val] !== undefined) return;
		selected = selected === val ? null : val;
		redraw();
	}
	function redraw() {
		cols.innerHTML = ([0, 1] as const)
			.map((col) => {
				const tuiles = motsDeColonne(col)
					.map(
						(mot) =>
							`<button type="button" class="tuile ltri-posee" data-mot="${escapeHTML(mot)}">${escapeHTML(mot)}</button>`,
					)
					.join('');
				return `<div class="ltri-col" data-col="${col}"><div class="ltri-col-titre">${escapeHTML(it.categories[col])}</div><div class="ltri-zone" data-col="${col}">${tuiles}</div></div>`;
			})
			.join('');
		cols.querySelectorAll<HTMLElement>('.ltri-col').forEach((colEl) => {
			const col = Number(colEl.dataset.col) as 0 | 1;
			colEl.addEventListener('click', (e) => {
				const posee = (e.target as HTMLElement).closest('.ltri-posee') as HTMLElement | null;
				if (posee) {
					retirer(posee.dataset.mot!);
					return;
				}
				if (selected) poser(selected, col);
			});
			colEl.addEventListener('dragover', (e) => e.preventDefault());
			colEl.addEventListener('drop', (e) => {
				e.preventDefault();
				const val = e.dataTransfer?.getData('text/plain');
				if (val) poser(val, col);
			});
		});
		bac.innerHTML = it.mots
			.map((m) => {
				if (placed[m.mot] !== undefined) return '';
				const sel = selected === m.mot ? ' ltri-sel' : '';
				return `<button type="button" class="tuile lord-tuile ltri-tuile${sel}" data-mot="${escapeHTML(m.mot)}" draggable="true">${escapeHTML(m.mot)}</button>`;
			})
			.join('');
		bac.querySelectorAll<HTMLButtonElement>('.ltri-tuile').forEach((btn) => {
			const val = btn.dataset.mot!;
			btn.addEventListener('click', () => selectTuile(val));
			btn.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', val));
		});
		verif.disabled = Object.keys(placed).length !== it.mots.length;
	}
	verif.addEventListener('click', () => {
		if (Object.keys(placed).length !== it.mots.length) return;
		const bon = ([0, 1] as const)
			.map(
				(col) =>
					`${it.categories[col]} : ${it.mots
						.filter((m) => m.cat === col)
						.map((m) => m.mot)
						.join(', ')}`,
			)
			.join(' — ');
		grade(
			it.mots.every((m) => placed[m.mot] === m.cat),
			bon,
		);
	});
	redraw();
}

// Entrée enchaîne sur l'action principale visible : après une réponse, le bouton
// « Continuer / Terminer » (#revNext) ; sinon « Valider » (#revValidate). Posé une
// seule fois sur #revStage (persistant) : son preventDefault bloquerait sinon
// l'activation native de « Continuer » au clavier.
function bindEnter() {
	const stage = document.getElementById('revStage')!;
	stage.addEventListener('keydown', (e) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const btn = document.getElementById('revNext') ?? document.getElementById('revValidate');
		btn?.dispatchEvent(new Event('click'));
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
	// Une session de révision TERMINÉE compte comme une « révision » de la semaine
	// (objectif de régularité #178). Pas de classement ni de médaille : ce run
	// n'alimente aucun podium, il sert seulement au comptage via countSince.
	recordRun('revision-espacee', score, items.length, Date.now() - startTs);
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
