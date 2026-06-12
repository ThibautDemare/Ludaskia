/* ============================================================
   Mode Orthographe — runner d'entraînement (couche UI).
   Boucle : on prend le prochain mot non maîtrisé, on rend l'activité
   qui lui correspond (atelier -> tuiles -> affiche/masque ; la dictée
   viendra avec le TTS), on enregistre le résultat, on enchaîne.
   Quand tous les mots sont maîtrisés -> bilan.
   - L'atelier est ici en version « légère » (regarder le mot) ; la
     version SVG (entourer les pièges) est une étape suivante.
   - La dictée n'est pas proposée tant que le TTS n'est pas branché.
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { loadOrtho, saveOrtho } from '../core/orthographe/store';
import { motsDeLecon } from '../core/orthographe/lessons';
import { genExerciseOrtho, ORTHO_MODE_OPTIONS } from '../core/orthographe/exercise';
import { checkAnswer } from '../core/exercise';
import {
	statutMot,
	prochaineActivite,
	marquerAtelierFait,
	validerMode,
	decouverteEnCours,
} from '../core/orthographe/runner';
import type { MotOrtho, OrthoState, ModeOrtho } from '../core/orthographe/types';
import { diffCorrect } from '../core/orthographe/diff';
import { addXP, getXP, niveauDepuisXP } from '../core/progress';
import { evaluateTrophies } from '../core/rewards';
import { ORTHO_CATEGORY_ID } from '../core/catalog';
import { goCategorie, goOrthoRevoir } from './navigation';
import { renderAtelier } from './ortho-atelier';
import { recompensesEntre } from '../core/unlocks';
import { showCelebration, showLevelUp } from './effects';
import { mascotteBulleHTML, encouragementMascotte } from './unlocks-view';
import { dicteeDisponible, dicter } from './tts';

const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'ô', 'î', 'ï', 'û', 'ù', 'œ', '-', "'"];
const SEANCE_MAX = 8; // activités par séance avant de proposer une pause (rythme CE2)

let st: OrthoState;
let mots: MotOrtho[];
let idx = 0;
let dispoDictee = false;
let niveauAvant = 0;
let actes = 0;
// Mode de la séance (#69) : null = parcours complet (atelier → modes → étoile) ;
// un mode = entraînement ciblé sur ce seul mode (ne valide pas, pas d'étoile).
let seanceMode: ModeOrtho | null = null;
// Mode choisi en attente, posé par l'écran de choix et consommé par startOrthoRun.
let pendingOrthoMode: ModeOrtho | null = null;
export const setPendingOrthoMode = (m: ModeOrtho | null) => {
	pendingOrthoMode = m;
};

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

export function startOrthoRun(lessonId: string): void {
	st = loadOrtho();
	mots = motsDeLecon(st, lessonId);
	saveOrtho(st); // persiste la matérialisation des mots prédéfinis
	dispoDictee = dicteeDisponible();
	seanceMode = pendingOrthoMode; // null → parcours complet
	pendingOrthoMode = null;
	idx = 0;
	niveauAvant = niveauDepuisXP(getXP());
	actes = 0;
	if (!mots.length) {
		goCategorie(ORTHO_CATEGORY_ID);
		return;
	}
	renderNext();
}

/* La découverte de la liste est-elle terminée (tous les mots vus à l'atelier) ?
   Sert à décider d'afficher l'écran de choix de mode (#69). */
export function orthoDiscoveryComplete(lessonId: string): boolean {
	const s = loadOrtho();
	const m = motsDeLecon(s, lessonId);
	return m.length > 0 && !decouverteEnCours(m);
}

/* Écran de choix du mode d'une liste (#69), proposé une fois la liste découverte :
   le parcours complet (conseillé, seul à donner l'étoile) ou un mode ciblé pour
   s'entraîner librement (sans étoile). Dérivé de ORTHO_MODE_OPTIONS. */
export function renderOrthoModeChoice(host: HTMLElement, lessonId: string, label: string): void {
	const cibles = ORTHO_MODE_OPTIONS.filter((m) => m.id !== 'dictee' || dicteeDisponible());
	const go = (mode: ModeOrtho | null) => {
		setPendingOrthoMode(mode);
		location.hash = 'ortho-' + lessonId;
	};
	host.innerHTML = `<div class="mode-choice">
    <h2 class="mode-choice-title">Comment veux-tu t'entraîner ?</h2>
    <p class="mode-choice-lesson">${escapeHTML(label)}</p>
    <div class="mode-choice-list">
      <button class="mode-btn recommended" data-mode="">
        <span class="mode-btn-ico" aria-hidden="true">⭐</span>
        <span class="mode-btn-txt">
          <span class="mode-btn-label">Le parcours complet</span>
          <span class="mode-btn-badge">conseillé · donne l'étoile</span>
        </span>
      </button>
      ${cibles
				.map(
					(m) => `<button class="mode-btn" data-mode="${m.id}">
        <span class="mode-btn-ico" aria-hidden="true">${m.icon ?? '▶'}</span>
        <span class="mode-btn-txt">
          <span class="mode-btn-label">${escapeHTML(m.label)}</span>
          <span class="mode-btn-hint">pour t'entraîner</span>
        </span>
      </button>`,
				)
				.join('')}
    </div>
    <div class="mode-choice-etude">
      <p class="mode-choice-etude-sep">Ou pour réviser tranquillement</p>
      <button class="etude-btn" id="btnRevoir">
        <span class="mode-btn-ico" aria-hidden="true">📖</span>
        <span class="mode-btn-txt">
          <span class="mode-btn-label">Relire mes mots</span>
          <span class="mode-btn-hint">juste pour relire, sans points</span>
        </span>
      </button>
    </div>
  </div>`;
	host.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
		const m = btn.dataset.mode;
		btn.addEventListener('click', () => go(m ? (m as ModeOrtho) : null));
	});
	host.querySelector('#btnRevoir')!.addEventListener('click', () => goOrthoRevoir(lessonId));
}

/* Prochain mot à travailler, en parcourant cycliquement (on avance même si le
   mot n'a pas été validé, pour ne pas boucler sur le même).
   En phase de découverte (#69), on ne renvoie que des mots pas encore vus à
   l'atelier : toute la liste est découverte avant le moindre entraînement. */
function prochainNonMaitrise(): MotOrtho | null {
	// Mode ciblé : entraînement libre, on tourne sur tous les mots (jamais « fini »).
	if (seanceMode) {
		const m = mots[idx % mots.length];
		idx = (idx + 1) % mots.length;
		return m;
	}
	const enDecouverte = decouverteEnCours(mots);
	for (let k = 0; k < mots.length; k++) {
		const i = (idx + k) % mots.length;
		const aFaire = enDecouverte
			? !mots[i].atelierFait
			: statutMot(mots[i], dispoDictee) !== 'maitrise';
		if (aFaire) {
			idx = (i + 1) % mots.length;
			return mots[i];
		}
	}
	return null;
}

function renderNext(): void {
	const word = prochainNonMaitrise();
	if (!word) {
		renderBilan();
		return;
	}
	if (actes >= SEANCE_MAX) {
		renderPause();
		return;
	}
	actes++;
	// Mode ciblé : on impose ce mode ; sinon le parcours choisit l'activité due.
	const act = seanceMode ?? prochaineActivite(word, dispoDictee);
	if (act === 'atelier') {
		renderAtelier(sheets(), word, {
			onDone: () => {
				marquerAtelierFait(word);
				saveOrtho(st);
				renderNext();
			},
		});
	} else if (act === 'tuiles') renderTuiles(word);
	else if (act === 'dictee') renderDictee(word);
	else renderMotCache(word);
}

/* ---------- Affiche / masque ---------- */
function renderMotCache(word: MotOrtho): void {
	const ex = genExerciseOrtho(word, 'motCache');
	let essais = 0;
	sheets().innerHTML = `
    <div class="page ortho-run">
      <p class="ortho-run-consigne">Regarde bien ce mot, puis cache-le et écris-le.</p>
      <div class="ortho-mot-affiche" id="motAffiche">${escapeHTML(word.mot)}</div>
      <button class="btn-primary" id="btnCacher">Cacher et écrire →</button>
      <div class="ortho-saisie" id="zoneSaisie" hidden>
        <input class="ortho-input" id="orthoInput" type="text" inputmode="text"
               autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
               aria-label="Écris le mot" />
        <div class="accent-kb" id="accentKb"></div>
        <button class="btn-primary" id="btnVerifMot">✓ Vérifier</button>
      </div>
      <div class="ortho-feedback" id="fb"></div>
    </div>`;
	const motAffiche = sheets().querySelector('#motAffiche') as HTMLElement;
	const btnCacher = sheets().querySelector('#btnCacher') as HTMLButtonElement;
	const zone = sheets().querySelector('#zoneSaisie') as HTMLElement;
	const input = sheets().querySelector('#orthoInput') as HTMLInputElement;
	const fb = sheets().querySelector('#fb') as HTMLElement;

	renderAccentKb(sheets().querySelector('#accentKb') as HTMLElement, input);

	btnCacher.addEventListener('click', () => {
		motAffiche.style.display = 'none';
		btnCacher.style.display = 'none';
		zone.hidden = false;
		input.focus();
	});

	const verifier = () => {
		if (checkAnswer(ex, input.value)) {
			reussiteMode(word, 'motCache');
			(sheets().querySelector('#btnVerifMot') as HTMLButtonElement).disabled = true;
			input.readOnly = true;
			reussite(fb, true);
		} else {
			essais++;
			if (essais < 2) {
				fb.innerHTML = `<span class="fb-ko">Presque ! Regarde bien et réessaie.</span>`;
				input.value = '';
				input.focus();
			} else {
				// 2e erreur : on bascule sur l'atelier de correction (diff sur le mot).
				const diff = diffCorrect(input.value, word.mot);
				renderAtelier(sheets(), word, {
					onDone: () => {
						saveOrtho(st);
						renderNext();
					},
					diff,
					consigne: "Regarde où tu t'es trompé, puis entoure le piège.",
				});
			}
		}
	};
	sheets().querySelector('#btnVerifMot')!.addEventListener('click', verifier);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') verifier();
	});
}

/* ---------- Dictée (TTS) ---------- */
function renderDictee(word: MotOrtho): void {
	const ex = genExerciseOrtho(word, 'dictee');
	let essais = 0;
	sheets().innerHTML = `
    <div class="page ortho-run">
      <p class="ortho-run-consigne">Écoute le mot, puis écris-le.</p>
      <button class="btn-primary ortho-ecouter" id="btnEcouter">🔊 Écouter</button>
      <div class="ortho-saisie">
        <input class="ortho-input" id="orthoInput" type="text" inputmode="text"
               autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
               aria-label="Écris le mot" />
        <div class="accent-kb" id="accentKb"></div>
        <button class="btn-primary" id="btnVerifMot">✓ Vérifier</button>
      </div>
      <div class="ortho-feedback" id="fb"></div>
    </div>`;
	const input = sheets().querySelector('#orthoInput') as HTMLInputElement;
	const fb = sheets().querySelector('#fb') as HTMLElement;
	renderAccentKb(sheets().querySelector('#accentKb') as HTMLElement, input);

	const ecouter = () => dicter(word.mot, word.commeDans);
	sheets().querySelector('#btnEcouter')!.addEventListener('click', ecouter);
	ecouter(); // tentative de lecture auto (peut être bloquée tant qu'il n'y a pas eu de geste)

	const verifier = () => {
		if (checkAnswer(ex, input.value)) {
			reussiteMode(word, 'dictee');
			(sheets().querySelector('#btnVerifMot') as HTMLButtonElement).disabled = true;
			input.readOnly = true;
			reussite(fb, true);
		} else {
			essais++;
			if (essais < 2) {
				fb.innerHTML = `<span class="fb-ko">Presque ! Réécoute et réessaie.</span>`;
				input.value = '';
				input.focus();
				ecouter();
			} else {
				const diff = diffCorrect(input.value, word.mot);
				renderAtelier(sheets(), word, {
					onDone: () => {
						saveOrtho(st);
						renderNext();
					},
					diff,
					consigne: "Regarde le mot et où tu t'es trompé, puis entoure le piège.",
				});
			}
		}
	};
	sheets().querySelector('#btnVerifMot')!.addEventListener('click', verifier);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') verifier();
	});
}

/* ---------- Tuiles ---------- */
// Helpers purs sur l'ordre des lettres (`assembled`), testables sans DOM.
// Tous renvoient un NOUVEAU tableau (aucune mutation en place) et bornent leurs
// index — `assembled` reste la source de vérité de l'ordre (cf. #68).
export function insertAt(arr: number[], pos: number, value: number): number[] {
	const p = Math.max(0, Math.min(arr.length, pos));
	return [...arr.slice(0, p), value, ...arr.slice(p)];
}
export function removeAt(arr: number[], pos: number): number[] {
	if (pos < 0 || pos >= arr.length) return arr.slice();
	return [...arr.slice(0, pos), ...arr.slice(pos + 1)];
}
export function moveAt(arr: number[], from: number, to: number): number[] {
	if (from < 0 || from >= arr.length) return arr.slice();
	return insertAt(removeAt(arr, from), to, arr[from]);
}

// Au-delà de ce déplacement (px) un geste devient un glisser ; en dessous, c'est
// un tap. Volontairement élevé : un tap « propre » de CE2 dérive de 8-15 px.
const DRAG_THRESHOLD = 18;

function renderTuiles(word: MotOrtho): void {
	const ex = genExerciseOrtho(word, 'tuiles');
	const lettres = ex.type === 'tuiles' ? ex.lettres : [];
	let assembled: number[] = []; // indices dans `lettres`, dans l'ordre posé
	let caret = 0; // position d'insertion (0..assembled.length) ; défaut = fin du mot
	let sel: number | null = null; // tuile posée sélectionnée (exclusif avec le curseur)
	const label = (l: string) => (l === ' ' ? '␣' : escapeHTML(l));
	const glyph = (l: string) => (l === ' ' ? '␣' : l); // pour textContent (fantôme)

	sheets().innerHTML = `
    <div class="page ortho-run">
      <p class="ortho-run-consigne">Remets les lettres dans le bon ordre.
        <span class="ortho-run-astuce">Tape entre deux lettres pour choisir où écrire.</span></p>
      ${dispoDictee ? '<div><button class="btn-primary ortho-ecouter" id="btnEcouterTuiles">🔊 Écouter le mot</button></div>' : ''}
      <p class="tuiles-titre">Ton mot</p>
      <div class="tuiles-construction" id="construction"></div>
      <p class="tuiles-titre">Les lettres</p>
      <div class="tuiles-bac" id="bac"></div>
      <button class="btn-primary" id="btnVerifTuiles">✓ Vérifier</button>
      <div class="ortho-feedback" id="fb"></div>
    </div>`;
	const construction = sheets().querySelector('#construction') as HTMLElement;
	const bac = sheets().querySelector('#bac') as HTMLElement;
	const fb = sheets().querySelector('#fb') as HTMLElement;
	if (dispoDictee) {
		sheets()
			.querySelector('#btnEcouterTuiles')!
			.addEventListener('click', () => dicter(word.mot, word.commeDans));
	}

	// --- Rendu ---
	function slotHTML(pos: number): string {
		const actif = sel === null && caret === pos;
		return `<button type="button" class="tuile-slot${actif ? ' is-caret' : ''}" data-slot="${pos}" aria-label="Insérer ici"><span class="tuile-curseur"></span></button>`;
	}
	function poseHTML(posLettre: number): string {
		const i = assembled[posLettre];
		if (sel !== posLettre) {
			return `<button type="button" class="tuile tuile-pose" data-pos="${posLettre}">${label(lettres[i])}</button>`;
		}
		const auDebut = posLettre === 0;
		const aLaFin = posLettre === assembled.length - 1;
		return `
      <span class="tuile-cell sel">
        <span class="tuile-controls">
          <button type="button" class="tuile-fleche${auDebut ? ' is-disabled' : ''}" data-act="left" aria-label="Déplacer à gauche"${auDebut ? ' disabled' : ''}>◀</button>
          <button type="button" class="tuile-fleche${aLaFin ? ' is-disabled' : ''}" data-act="right" aria-label="Déplacer à droite"${aLaFin ? ' disabled' : ''}>▶</button>
          <button type="button" class="tuile-retirer" data-act="remove">↩ enlever</button>
        </span>
        <button type="button" class="tuile tuile-pose sel" data-pos="${posLettre}">${label(lettres[i])}</button>
      </span>`;
	}
	function redraw(): void {
		// Mot en construction : slot, tuile, slot, tuile, …, slot final.
		let html = slotHTML(0);
		for (let p = 0; p < assembled.length; p++) html += poseHTML(p) + slotHTML(p + 1);
		construction.innerHTML = html;
		construction.classList.toggle('vide', assembled.length === 0);
		// Bac : lettres encore disponibles (les posées restent là mais masquées).
		bac.innerHTML = lettres
			.map((l, i) =>
				assembled.includes(i)
					? `<button type="button" class="tuile tuile-used" disabled>${label(l)}</button>`
					: `<button type="button" class="tuile" data-i="${i}">${label(l)}</button>`,
			)
			.join('');
	}

	// --- Actions (taps : souris, clavier et tap tactile passent par le click) ---
	function insertLettre(i: number): void {
		assembled = insertAt(assembled, caret, i);
		caret += 1;
		sel = null;
		redraw();
	}
	function poseCaret(pos: number): void {
		caret = pos;
		sel = null;
		redraw();
	}
	function selectPose(pos: number): void {
		sel = sel === pos ? null : pos; // re-tap = désélection
		redraw();
	}
	function deplacer(dir: -1 | 1): void {
		if (sel === null) return;
		const to = sel + dir;
		if (to < 0 || to >= assembled.length) return;
		assembled = moveAt(assembled, sel, to);
		sel = to;
		redraw();
	}
	function retirer(): void {
		if (sel === null) return;
		assembled = removeAt(assembled, sel);
		sel = null;
		caret = Math.min(caret, assembled.length);
		redraw();
	}

	let justDragged = false; // neutralise le click synthétique qui suit un glisser
	construction.addEventListener('click', (e) => {
		if (justDragged) {
			justDragged = false;
			return;
		}
		const t = (e.target as HTMLElement).closest('button');
		if (!t) return;
		const act = t.dataset.act;
		if (act === 'left') deplacer(-1);
		else if (act === 'right') deplacer(1);
		else if (act === 'remove') retirer();
		else if (t.dataset.slot !== undefined) poseCaret(Number(t.dataset.slot));
		else if (t.dataset.pos !== undefined) selectPose(Number(t.dataset.pos));
	});
	bac.addEventListener('click', (e) => {
		if (justDragged) {
			justDragged = false;
			return;
		}
		const t = (e.target as HTMLElement).closest('.tuile') as HTMLElement | null;
		if (!t || t.dataset.i === undefined) return;
		insertLettre(Number(t.dataset.i));
	});

	// --- Couche glisser-déposer (raccourci « bonus », par-dessus les taps) ---
	type Source = { type: 'bac' | 'pose'; index: number; el: HTMLElement };
	let pending: { src: Source | null; x: number; y: number; pid: number } | null = null;
	let dragging = false;
	let ghost: HTMLElement | null = null;
	let dropSlot: number | null = null;

	function sourceFrom(target: HTMLElement): Source | null {
		const pose = target.closest('.tuile-pose') as HTMLElement | null;
		if (pose && pose.dataset.pos !== undefined)
			return { type: 'pose', index: Number(pose.dataset.pos), el: pose };
		const bacTile = target.closest('.tuiles-bac .tuile') as HTMLElement | null;
		if (bacTile && bacTile.dataset.i !== undefined && !bacTile.classList.contains('tuile-used'))
			return { type: 'bac', index: Number(bacTile.dataset.i), el: bacTile };
		return null;
	}
	const lettreDe = (src: Source) =>
		src.type === 'bac' ? lettres[src.index] : lettres[assembled[src.index]];
	const clearDrop = () =>
		construction
			.querySelectorAll('.tuile-slot.is-drop')
			.forEach((s) => s.classList.remove('is-drop'));
	function majDropSlot(x: number, y: number): void {
		const el = document.elementFromPoint(x, y) as HTMLElement | null;
		const slot = el?.closest('.tuile-slot') as HTMLElement | null;
		const pose = el?.closest('.tuile-pose') as HTMLElement | null;
		let p: number | null = null;
		if (slot && slot.dataset.slot !== undefined) p = Number(slot.dataset.slot);
		else if (pose && pose.dataset.pos !== undefined) {
			const r = pose.getBoundingClientRect();
			p = Number(pose.dataset.pos) + (x > r.left + r.width / 2 ? 1 : 0);
		}
		clearDrop();
		dropSlot = p;
		if (p !== null)
			construction.querySelector(`.tuile-slot[data-slot="${p}"]`)?.classList.add('is-drop');
	}
	function endDrag(): void {
		dragging = false;
		ghost?.remove();
		ghost = null;
		clearDrop();
		dropSlot = null;
		document.querySelectorAll('.tuile-source').forEach((s) => s.classList.remove('tuile-source'));
	}

	const onDown = (e: PointerEvent): void => {
		// Si un glisser précédent n'a pas été suivi d'un click (variable selon les
		// navigateurs tactiles), on purge le drapeau ici pour ne pas avaler ce tap.
		justDragged = false;
		pending = {
			src: sourceFrom(e.target as HTMLElement),
			x: e.clientX,
			y: e.clientY,
			pid: e.pointerId,
		};
	};
	const onMove = (e: PointerEvent): void => {
		if (!pending || pending.pid !== e.pointerId || !pending.src) return;
		if (!dragging) {
			if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < DRAG_THRESHOLD) return;
			dragging = true;
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			pending.src.el.classList.add('tuile-source');
			ghost = document.createElement('div');
			ghost.className = 'tuile-ghost';
			ghost.textContent = glyph(lettreDe(pending.src));
			document.body.appendChild(ghost);
		}
		e.preventDefault();
		if (ghost) {
			ghost.style.left = `${e.clientX}px`;
			ghost.style.top = `${e.clientY}px`;
		}
		majDropSlot(e.clientX, e.clientY);
	};
	const onUp = (e: PointerEvent): void => {
		if (!pending || pending.pid !== e.pointerId) return;
		if (dragging && pending.src && dropSlot !== null) {
			const src = pending.src;
			if (src.type === 'bac') {
				assembled = insertAt(assembled, dropSlot, src.index);
				caret = Math.min(dropSlot + 1, assembled.length);
			} else {
				assembled = moveAt(assembled, src.index, dropSlot > src.index ? dropSlot - 1 : dropSlot);
			}
			sel = null;
			justDragged = true; // le click qui suit le glisser ne doit pas re-déclencher un tap
			endDrag();
			redraw();
		} else if (dragging) {
			endDrag();
		}
		pending = null;
	};
	for (const zone of [construction, bac]) {
		zone.addEventListener('pointerdown', onDown);
		zone.addEventListener('pointermove', onMove);
		zone.addEventListener('pointerup', onUp);
		zone.addEventListener('pointercancel', onUp);
	}

	redraw();

	const verifier = (): void => {
		const built = assembled.map((i) => lettres[i]).join('');
		if (checkAnswer(ex, built)) {
			reussiteMode(word, 'tuiles');
			(sheets().querySelector('#btnVerifTuiles') as HTMLButtonElement).disabled = true;
			reussite(fb, true);
		} else {
			fb.innerHTML = `<span class="fb-ko">Pas tout à fait, réessaie.</span>`;
		}
	};
	sheets().querySelector('#btnVerifTuiles')!.addEventListener('click', verifier);
}

/* ---------- Bilan ---------- */
function renderBilan(): void {
	const total = mots.length;
	sheets().innerHTML = `
    <div class="page ortho-run ortho-bilan">
      ${mascotteBulleHTML(encouragementMascotte())}
      <div class="ortho-bilan-emoji">🎉</div>
      <h2>Liste prête !</h2>
      <p>Tu as bien travaillé les <b>${total}</b> mot${total > 1 ? 's' : ''} de cette liste.</p>
      <button class="btn-primary" id="btnBilanRetour">Retour à l'orthographe</button>
    </div>`;
	sheets()
		.querySelector('#btnBilanRetour')!
		.addEventListener('click', () => goCategorie(ORTHO_CATEGORY_ID));

	// Récompenses : trophées éventuels + montée de niveau, avec modale + confettis.
	const newTrophies = evaluateTrophies();
	const celeb = [
		{ icon: '🌟', text: 'Liste prête, bravo !' },
		...newTrophies.map((t) => ({ icon: t.icon, text: `Trophée : ${t.title}` })),
	];
	const niveauApres = niveauDepuisXP(getXP());
	const niveauGagne = niveauApres > niveauAvant ? niveauApres : 0;
	const recompensesNiv = recompensesEntre(niveauAvant, niveauApres);
	niveauAvant = niveauApres;
	if (niveauGagne) showLevelUp(niveauGagne, recompensesNiv, () => showCelebration(celeb));
	else showCelebration(celeb);
}

/* ---------- Pause de séance (rythme adapté à un CE2) ---------- */
function renderPause(): void {
	sheets().innerHTML = `
    <div class="page ortho-run ortho-bilan">
      <div class="ortho-bilan-emoji">👏</div>
      <h2>Bonne séance !</h2>
      <p>Tu as bien travaillé. Tu peux continuer encore un peu ou revenir une autre fois.</p>
      <div class="ortho-pause-actions">
        <button class="btn-primary" id="btnContinuerSeance">Continuer encore un peu</button>
        <button class="atelier-undo" id="btnStopSeance">Revenir une autre fois</button>
      </div>
    </div>`;
	const b = sheets().querySelector('#btnContinuerSeance') as HTMLButtonElement;
	b.addEventListener('click', () => {
		actes = 0;
		renderNext();
	});
	sheets()
		.querySelector('#btnStopSeance')!
		.addEventListener('click', () => goCategorie(ORTHO_CATEGORY_ID));
	b.focus();
	// Mode ciblé : pas de bilan d'étoile → on célèbre les niveaux gagnés à la pause.
	if (seanceMode) annoncerNiveauSiGagne();
}

/* ---------- Helpers ---------- */
/* Réussite d'un mode : +1 XP, et — en parcours complet seulement — validation du
   mode (l'étoile ne se gagne qu'en faisant la suite ordonnée, pas un mode isolé). */
function reussiteMode(word: MotOrtho, mode: ModeOrtho): void {
	if (!seanceMode) {
		validerMode(word, mode);
		saveOrtho(st);
	}
	addXP(1);
}

/* Annonce une éventuelle montée de niveau (modale + déblocages), puis met à jour
   le repère. Utilisé hors bilan (mode ciblé), où il n'y a pas d'écran de fin. */
function annoncerNiveauSiGagne(): void {
	const niveauApres = niveauDepuisXP(getXP());
	if (niveauApres > niveauAvant) {
		showLevelUp(niveauApres, recompensesEntre(niveauAvant, niveauApres));
		niveauAvant = niveauApres;
	}
}

function reussite(fb: HTMLElement, xpGagne = false): void {
	const xp = xpGagne ? ' <span class="fb-xp">+1 XP</span>' : '';
	fb.innerHTML = `<span class="fb-ok">Bravo ! 🎉</span>${xp} `;
	boutonContinuer(fb);
}

function boutonContinuer(fb: HTMLElement): void {
	const b = document.createElement('button');
	b.className = 'btn-primary';
	b.textContent = 'Continuer →';
	b.addEventListener('click', renderNext);
	fb.appendChild(b);
	b.focus(); // la touche Entrée enchaîne sur la suite
}

function renderAccentKb(container: HTMLElement, input: HTMLInputElement): void {
	container.innerHTML = ACCENTS.map(
		(c) => `<button type="button" class="accent-key" data-c="${c}">${c}</button>`,
	).join('');
	container
		.querySelectorAll<HTMLButtonElement>('.accent-key')
		.forEach((b) => b.addEventListener('click', () => insertAtCursor(input, b.dataset.c ?? '')));
}

function insertAtCursor(input: HTMLInputElement, text: string): void {
	const start = input.selectionStart ?? input.value.length;
	const end = input.selectionEnd ?? input.value.length;
	input.value = input.value.slice(0, start) + text + input.value.slice(end);
	const pos = start + text.length;
	input.setSelectionRange(pos, pos);
	input.focus();
}
