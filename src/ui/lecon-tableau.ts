/* ============================================================
   Runner « tableau de conversion » (#394) — 2ᵉ mode des leçons de mesures,
   « une question à la fois ». L'enfant remplit une colonne d'unité par case
   (zéros de transit compris) via un PAVÉ de chiffres externe (jamais de clavier
   natif ouvert par case) : case active surlignée, avance automatique, navigation
   clavier ← →. Feedback immédiat, sans chrono ; à la fin, l'essai est enregistré
   via recordLessonRun → mêmes XP / étoiles / objectifs que la fiche en saisie
   (parité #69), comme les autres runners dédiés (cf. lecon-tuiles.ts).

   Rendu : réutilise le langage visuel des cellules posées (.posee-*) via des tokens
   partagés (bord, --paper, --ink, --ok/--ko) ; une colonne de transit (unité non
   étudiée au niveau) est signalée par un EN-TÊTE démoté + une case en POINTILLÉS
   (jamais grisée/opacifiée = code du champ désactivé). Accessibilité dys (avis
   specialiste-troubles-apprentissage) : nom d'unité en toutes lettres VISIBLE dans
   l'en-tête, ordre spatial grande→petite stable, légende courte permanente, aria-label
   par case en toutes lettres, aide illustrative rappelable. La virgule (paires décimales)
   est POSÉE par l'app en v1 (`virguleApres`) — un seul geste inédit à la fois.
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import type { Exercise, ExerciseMode, TableauColonne } from '../core/exercise';
import { commKey, escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import { bindConsigneTts } from './consigne-tts';
import { setToolbar, hideMenus, goHome, setCurrentMode, setCurrentLessonId } from './navigation';
import {
	leconProgressHTML,
	finishLeconRun,
	renderLeconResult,
	wireNext,
} from './lecon-runner-shared';
import { monterBoutonAide, maybeAutoAide } from './aide-exercice';

const NB_QUESTIONS = 8;

type Tableau = Extract<Exercise, { type: 'tableauConversion' }>;

/* Consigne VISIBLE (et lue par le TTS) : motive le zéro, pas seulement le geste
   (avis pedagogue-primaire). L'énoncé « 3 km = ? m » s'affiche en dessous. */
const CONSIGNE = "Écris un chiffre par case. Mets 0 quand il n'y a rien à compter dans une unité.";
/* Légende courte PERMANENTE sous le tableau (avis dys : rappel présent à chaque
   affichage, pas seulement au 1er lancement). */
const LEGENDE =
	'Les unités en petit ne sont pas encore vues en classe : tu peux quand même y écrire des 0.';

/* Une case saisissable = un chiffre attendu, rattachée à sa colonne. La colonne de tête
   à 2 chiffres se déploie en 2 cases (dizaine puis unité), regroupées visuellement (avis
   dys) mais gérées comme deux cases d'un chiffre → avance auto et pavé homogènes. */
interface Cellule {
	col: TableauColonne;
	attendu: string; // chiffre attendu ('0'..'9')
	aria: string; // libellé complet (« chiffre des mètres »)
	valeur: string; // saisie courante ('' ou un chiffre)
	rang?: 'dizaine' | 'unite'; // rang dans une tête à 2 chiffres (sinon absent)
}

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: Tableau[] = [];
let idx = 0;
let score = 0;
let cells: Cellule[] = [];
let active = 0;
let frozen = false; // après validation : plus de saisie
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

const pluriel = (nom: string) => `${nom}s`;

function genQuestions(l: LessonDef, m: ExerciseMode, n: number): Tableau[] {
	const out: Tableau[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode: m, level: niveauLecon(l) });
		if (ex.type !== 'tableauConversion') break; // ce runner n'a de sens que pour un tableau
		const key = commKey(ex.question);
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push(ex);
		misses = 0;
	}
	return out;
}

/* Déploie les colonnes de l'exercice en liste plate de cases (une par chiffre attendu). */
function buildCells(ex: Tableau): Cellule[] {
	const out: Cellule[] = [];
	for (const col of ex.colonnes) {
		const digits = col.chiffres.split('');
		digits.forEach((d, i) => {
			// Tête à 2 chiffres : on nomme le rang pour l'aria (« dizaines des mètres »).
			const rang = digits.length === 2 ? (i === 0 ? 'dizaine' : 'unite') : undefined;
			const aria = rang
				? `chiffre des ${rang === 'dizaine' ? 'dizaines' : 'unités'} de ${pluriel(col.nom)}`
				: `chiffre des ${pluriel(col.nom)}`;
			out.push({ col, attendu: d, aria, valeur: '', rang });
		});
	}
	return out;
}

export function runLeconTableau(lessonId: string, m: ExerciseMode): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	lesson = l;
	mode = m;
	questions = genQuestions(l, m, NB_QUESTIONS);
	if (!questions.length) {
		goHome();
		return;
	}
	idx = 0;
	score = 0;
	setCurrentMode('lecon');
	setCurrentLessonId(lessonId);
	hideMenus();
	setToolbar({ verify: false, home: true, profile: false });
	renderQuestion();
	maybeAutoAide('tableau'); // aide illustrative au 1er lancement (une fois par profil)
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Rendu d'une colonne : en-tête (symbole + nom complet visible) + ses cases, la virgule
   fixe étant insérée APRÈS la colonne cible (donnée `virguleApres`). Chaque case porte son
   index plat en `data-i` (repère e2e + rattachement à `cells`) et le chiffre attendu en
   `data-answer` (même convention que la grille posée : correction auditable + repère e2e). */
function colonneHTML(ex: Tableau, col: TableauColonne, colIndex: number, offset: number): string {
	const tCls = col.transit ? ' tc-col--transit' : '';
	const nb = col.chiffres.length;
	const cases = Array.from({ length: nb }, (_, k) => {
		const i = offset + k;
		return `<button type="button" class="tc-cell${col.transit ? ' tc-cell--transit' : ''}" data-i="${i}" data-answer="${escapeHTML(cells[i].attendu)}" aria-label="${escapeHTML(cells[i].aria)}"></button>`;
	}).join('');
	// Virgule fixe (posée par l'app en v1) : élément décoratif entre deux colonnes.
	const virgule =
		ex.virguleApres === colIndex ? `<span class="tc-virgule" aria-hidden="true">,</span>` : '';
	return `<div class="tc-col${tCls}">
      <div class="tc-head${col.transit ? ' tc-head--transit' : ''}">
        <span class="tc-sym">${escapeHTML(col.unite)}</span>
        <span class="tc-nom">${escapeHTML(pluriel(col.nom))}</span>
      </div>
      <div class="tc-col-cells">${cases}</div>
    </div>${virgule}`;
}

function renderQuestion(): void {
	const ex = questions[idx];
	cells = buildCells(ex);
	active = 0;
	frozen = false;
	// Colonnes → HTML, en suivant l'offset des cases plates (tête = 1 ou 2 cases).
	let offset = 0;
	const colonnes = ex.colonnes
		.map((col, colIndex) => {
			const html = colonneHTML(ex, col, colIndex, offset);
			offset += col.chiffres.length;
			return html;
		})
		.join('');
	const enonce = escapeHTML(ex.question).replace('@', '<span class="tc-trou">?</span>');
	// Repli du texte parlé aligné sur les autres runners (jamais chaîne vide) : `parle`
	// est toujours fourni ici, mais on retombe sur l'énoncé si un futur générateur l'omet.
	const ttsTexte = `${CONSIGNE} ${ex.parle ?? ex.question}`.trim();
	sheets().innerHTML = `
    <div class="sprint sprint-lecon tc-runner">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(lesson.label)}</span></div>
        <p class="tc-consigne"${ttsAttr(ttsTexte)}>${escapeHTML(CONSIGNE)}</p>
        <p class="tc-enonce">${enonce}</p>
        <div class="tc-wrap">
          <div class="tc-table" id="tcTable" role="group" aria-describedby="tcLegende" aria-label="Tableau de conversion">${colonnes}</div>
        </div>
        <p class="tc-legende" id="tcLegende">${escapeHTML(LEGENDE)}</p>
        ${paveHTML()}
        <button class="sprint-btn" id="tcVerif" disabled>Vérifier</button>
        <div class="sprint-correction" id="tcFeedback" hidden></div>
        <div class="sprint-actions" id="tcActions" hidden></div>
        <p class="sr-only" id="tcStatus" role="status" aria-live="polite" aria-atomic="true"></p>
      </div>
    </div>`;
	wireInteraction();
	paintAll();
	bindConsigneTts(sheets()); // bouton « Écouter » sur la consigne (#42)
	monterBoutonAide(sheets().querySelector('.sprint-stage'), 'tableau'); // bouton « ? » persistant
}

/* Pavé de chiffres externe (façon pave-signes.ts) : gros boutons ≥ 56 px, aucune ouverture
   de clavier natif. 1–9, puis effacer + 0. (La virgule reste posée par l'app en v1 ; pour
   l'ouvrir plus tard, ajouter ici un bouton `data-pave="virgule"` — cf. #394.) */
function paveHTML(): string {
	const btn = (d: number) =>
		`<button type="button" class="tc-pave-btn" data-chiffre="${d}">${d}</button>`;
	const chiffres = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(btn).join('');
	return `<div class="tc-pave" role="group" aria-label="Pavé de chiffres">
      ${chiffres}
      <button type="button" class="tc-pave-btn tc-pave-back" data-pave="effacer" aria-label="Effacer">⌫</button>
      ${btn(0)}
    </div>`;
}

function wireInteraction(): void {
	const table = sheets().querySelector('#tcTable') as HTMLElement;
	// Tap sur une case : la rend active (sans ouvrir de clavier — ce sont des boutons).
	table.addEventListener('click', (e) => {
		if (frozen) return;
		const b = e.target instanceof Element ? e.target.closest('.tc-cell') : null;
		if (b instanceof HTMLButtonElement) setActive(Number(b.dataset.i));
	});
	// Focus sur une case (Tab clavier ou focus natif du clic) → synchronise l'état
	// « active » avec le focus DOM, pour que la frappe atterrisse dans la case focalisée.
	table.addEventListener('focusin', (e) => {
		if (frozen) return;
		const b = e.target instanceof Element ? e.target.closest('.tc-cell') : null;
		if (b instanceof HTMLButtonElement) setActive(Number(b.dataset.i));
	});
	// Pavé : chiffre → saisie + avance auto ; effacer → recule.
	sheets()
		.querySelector('.tc-pave')!
		.addEventListener('click', (e) => {
			if (frozen) return;
			const b = e.target instanceof Element ? e.target.closest('button') : null;
			if (!(b instanceof HTMLButtonElement)) return;
			if (b.dataset.chiffre !== undefined) saisir(b.dataset.chiffre);
			else if (b.dataset.pave === 'effacer') effacer();
			else return;
			// Après un tap, on ramène le focus sur la CASE active : Entrée y valide (au lieu de
			// ré-activer le bouton du pavé focalisé → ré-saisie silencieuse), et la frappe
			// physique continue d'atterrir dans la bonne case. Invisible au tactile (pas de
			// clavier natif, pas de défilement grâce à preventScroll).
			cellBtn(active)?.focus({ preventScroll: true });
		});
	const verif = sheets().querySelector('#tcVerif') as HTMLButtonElement;
	verif.addEventListener('click', () => verifier());
	// Clavier physique (l'inputmode ne s'applique pas ; les cases ne sont pas des champs
	// texte) : chiffres, effacement et navigation ← →. Retiré au re-rendu / à la sortie.
	detachKeys();
	keyHandler = (e: KeyboardEvent) => {
		if (frozen || !sheets().querySelector('#tcTable')) return;
		// Ne traiter QUE si le focus est dans le widget (une case ou le pavé) : sinon on
		// volerait chiffres / flèches / Entrée aux autres commandes de la page (toolbar
		// Accueil, bouton « Écouter », bouton « ? »… tous hors #sheets ou frères du tableau).
		const focus = document.activeElement;
		if (!(focus instanceof Element && focus.closest('.tc-cell, .tc-pave'))) return;
		// Ne pas détourner les raccourcis navigateur à modificateur (Ctrl+0 zoom, Cmd+1 onglet…).
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (/^[0-9]$/.test(e.key)) {
			saisir(e.key);
			e.preventDefault();
		} else if (e.key === 'Backspace') {
			effacer();
			e.preventDefault();
		} else if (e.key === 'ArrowRight') {
			setActive(Math.min(active + 1, cells.length - 1), estCaseFocus());
			e.preventDefault();
		} else if (e.key === 'ArrowLeft') {
			setActive(Math.max(active - 1, 0), estCaseFocus());
			e.preventDefault();
		} else if (e.key === 'Enter' && estCaseFocus() && !verif.disabled) {
			// Entrée ne valide que depuis une CASE (les boutons gardent leur Entrée natif).
			verifier();
			e.preventDefault();
		}
	};
	document.addEventListener('keydown', keyHandler);
}

/** Nettoyage à la sortie du runner (quitter via Accueil sans passer par `finish`) : retire
    le listener clavier document-level. Branché dans resetSessionUI, comme sprintCleanup. */
export function leconTableauCleanup(): void {
	detachKeys();
}

function detachKeys(): void {
	if (keyHandler) document.removeEventListener('keydown', keyHandler);
	keyHandler = null;
}

const cellBtn = (i: number) => sheets().querySelector<HTMLButtonElement>(`.tc-cell[data-i="${i}"]`);

/* Région live (#tcStatus, `role=status`) : annonce la saisie au lecteur d'écran quand elle
   passe par le PAVÉ (le focus reste alors sur le pavé, `aria-current` sur la case ne serait
   pas lu). Même parade que le widget tuiles (#360 / SC 4.1.3). */
function announce(msg: string): void {
	const s = sheets().querySelector('#tcStatus');
	if (s) s.textContent = msg;
}

/* Une case a-t-elle actuellement le focus DOM ? (path clavier : la frappe et l'avance
   auto font alors suivre le focus ; path pavé/tactile : le focus reste sur le pavé.) */
const estCaseFocus = () =>
	document.activeElement instanceof HTMLElement &&
	document.activeElement.classList.contains('tc-cell');

/* Peint une case : chiffre saisi + états (active / correct / wrong). */
function paintCell(i: number): void {
	const b = cellBtn(i);
	if (!b) return;
	const c = cells[i];
	b.textContent = c.valeur;
	b.classList.toggle('tc-cell--active', !frozen && i === active);
	if (!frozen) b.classList.remove('correct', 'wrong');
	b.setAttribute('aria-current', !frozen && i === active ? 'true' : 'false');
}

function paintAll(): void {
	cells.forEach((_, i) => paintCell(i));
	refreshVerif();
}

/* Déplace la case active (surbrillance) ; `focus` = déplacer AUSSI le focus DOM (nav clavier
   sur les cases). Le focusin resynchronisera `active` — idempotent, pas de boucle. */
function setActive(i: number, focus = false): void {
	const prev = active;
	active = i;
	paintCell(prev);
	paintCell(active);
	if (focus) cellBtn(active)?.focus();
}

function saisir(d: string): void {
	const focusSuit = estCaseFocus();
	cells[active].valeur = d;
	const prev = active;
	if (active < cells.length - 1) active += 1; // avance automatique
	paintCell(prev);
	paintCell(active);
	if (focusSuit) cellBtn(active)?.focus();
	// Retour vocal (surtout path pavé, focus hors case) : ce qu'on vient d'écrire, où.
	announce(`${cells[prev].aria} : ${d}`);
	refreshVerif();
}

function effacer(): void {
	const focusSuit = estCaseFocus();
	if (cells[active].valeur !== '') {
		cells[active].valeur = '';
		paintCell(active);
		announce(`${cells[active].aria} effacé`);
	} else if (active > 0) {
		const prev = active;
		active -= 1;
		cells[active].valeur = '';
		paintCell(prev);
		paintCell(active);
		if (focusSuit) cellBtn(active)?.focus();
		announce(`${cells[active].aria} effacé`);
	}
	refreshVerif();
}

/* Validation bloquée tant qu'une case est vide (entraîne les zéros de transit) : « Vérifier »
   ne s'active que lorsque TOUTES les cases sont remplies (avis dys : pas de message d'erreur
   à re-balayer, l'avance auto amène déjà sur la case vide suivante). */
function refreshVerif(): void {
	const verif = sheets().querySelector('#tcVerif') as HTMLButtonElement | null;
	if (verif) verif.disabled = cells.some((c) => c.valeur === '');
}

function verifier(): void {
	if (frozen || cells.some((c) => c.valeur === '')) return;
	frozen = true;
	const ex = questions[idx];
	let correct = true;
	cells.forEach((c, i) => {
		const ok = c.valeur === c.attendu;
		correct = correct && ok;
		const b = cellBtn(i);
		if (b) {
			b.classList.remove('tc-cell--active');
			b.classList.add(ok ? 'correct' : 'wrong');
			b.setAttribute('aria-current', 'false');
			// Justesse exposée aux technologies d'assistance (le ✓/✗ CSS ::after ne l'est pas) :
			// la réponse est déjà révélée dans le feedback, donc `attendu` ne « fuite » rien.
			b.setAttribute('aria-invalid', String(!ok));
			b.setAttribute(
				'aria-label',
				ok ? `${c.aria}, correct` : `${c.aria}, incorrect, attendu ${c.attendu}`,
			);
		}
	});
	if (correct) score++;
	const verif = sheets().querySelector('#tcVerif') as HTMLButtonElement;
	verif.hidden = true; // un seul bouton à la fois (#153) : « Continuer ▶ » prend le relais
	// Feedback : motive le zéro de transit à l'erreur (pas seulement le geste). Accord
	// singulier/pluriel selon le nombre de colonnes de transit.
	const transit = ex.colonnes.filter((c) => c.transit);
	const explication =
		transit.length === 0
			? ''
			: transit.length === 1
				? ` Pense au 0 de l'unité intermédiaire (le ${transit[0].nom}) pour marquer le rang vide.`
				: ` Pense aux 0 des unités intermédiaires (${transit.map((c) => pluriel(c.nom)).join(', ')}) pour marquer les rangs vides.`;
	wireNext(
		sheets().querySelector('#tcActions') as HTMLElement,
		sheets().querySelector('#tcFeedback') as HTMLElement,
		{
			feedbackHTML: correct
				? `<span class="lqcm-ok">Bravo ! 🎉</span>`
				: `<span class="lqcm-ko">La bonne réponse était <strong>${escapeHTML(ex.answer)} ${escapeHTML(ex.answerUnit)}</strong>.${escapeHTML(explication)}</span>`,
			isLast: idx >= questions.length - 1,
			onNext: () => {
				idx++;
				if (idx >= questions.length) finish();
				else renderQuestion();
			},
		},
	);
}

function finish(): void {
	detachKeys();
	renderLeconResult({
		out: finishLeconRun(lesson.id, score, questions.length),
		score,
		total: questions.length,
		category: lesson.category,
		onAgain: () => runLeconTableau(lesson.id, mode),
	});
}
