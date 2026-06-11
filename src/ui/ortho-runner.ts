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
import { goCategorie } from './navigation';
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
  </div>`;
	host.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
		const m = btn.dataset.mode;
		btn.addEventListener('click', () => go(m ? (m as ModeOrtho) : null));
	});
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
function renderTuiles(word: MotOrtho): void {
	const ex = genExerciseOrtho(word, 'tuiles');
	const lettres = ex.type === 'tuiles' ? ex.lettres : [];
	const assembled: number[] = []; // indices dans `lettres`
	const label = (l: string) => (l === ' ' ? '␣' : escapeHTML(l));

	sheets().innerHTML = `
    <div class="page ortho-run">
      <p class="ortho-run-consigne">Remets les lettres dans le bon ordre.</p>
      ${dispoDictee ? '<div><button class="btn-primary ortho-ecouter" id="btnEcouterTuiles">🔊 Écouter le mot</button></div>' : ''}
      <div class="tuiles-construction" id="construction"></div>
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

	function redraw(): void {
		bac.innerHTML = lettres
			.map((l, i) =>
				assembled.includes(i)
					? `<button class="tuile tuile-used" disabled>${label(l)}</button>`
					: `<button class="tuile" data-i="${i}">${label(l)}</button>`,
			)
			.join('');
		construction.innerHTML = assembled
			.map(
				(i, pos) =>
					`<button class="tuile tuile-pose" data-pos="${pos}">${label(lettres[i])}</button>`,
			)
			.join('');
		bac.querySelectorAll<HTMLButtonElement>('.tuile[data-i]').forEach((b) =>
			b.addEventListener('click', () => {
				assembled.push(Number(b.dataset.i));
				redraw();
			}),
		);
		construction.querySelectorAll<HTMLButtonElement>('.tuile-pose').forEach((b) =>
			b.addEventListener('click', () => {
				assembled.splice(Number(b.dataset.pos), 1);
				redraw();
			}),
		);
	}
	redraw();

	sheets()
		.querySelector('#btnVerifTuiles')!
		.addEventListener('click', () => {
			const built = assembled.map((i) => lettres[i]).join('');
			if (checkAnswer(ex, built)) {
				reussiteMode(word, 'tuiles');
				(sheets().querySelector('#btnVerifTuiles') as HTMLButtonElement).disabled = true;
				reussite(fb, true);
			} else {
				fb.innerHTML = `<span class="fb-ko">Pas tout à fait, réessaie.</span>`;
			}
		});
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
