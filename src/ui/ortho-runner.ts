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
import { genExerciseOrtho } from '../core/orthographe/exercise';
import { checkAnswer } from '../core/exercise';
import {
	statutMot,
	prochaineActivite,
	marquerAtelierFait,
	validerMode,
} from '../core/orthographe/runner';
import type { MotOrtho, OrthoState } from '../core/orthographe/types';
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

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

export function startOrthoRun(lessonId: string): void {
	st = loadOrtho();
	mots = motsDeLecon(st, lessonId);
	saveOrtho(st); // persiste la matérialisation des mots prédéfinis
	dispoDictee = dicteeDisponible();
	idx = 0;
	niveauAvant = niveauDepuisXP(getXP());
	actes = 0;
	if (!mots.length) {
		goCategorie(ORTHO_CATEGORY_ID);
		return;
	}
	renderNext();
}

/* Prochain mot non maîtrisé, en parcourant cycliquement (on avance même si
   le mot n'a pas été validé, pour ne pas boucler sur le même). */
function prochainNonMaitrise(): MotOrtho | null {
	for (let k = 0; k < mots.length; k++) {
		const i = (idx + k) % mots.length;
		if (statutMot(mots[i], dispoDictee) !== 'maitrise') {
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
	const act = prochaineActivite(word, dispoDictee);
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
			validerMode(word, 'motCache');
			saveOrtho(st);
			addXP(1);
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
			validerMode(word, 'dictee');
			saveOrtho(st);
			addXP(1);
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
				validerMode(word, 'tuiles');
				saveOrtho(st);
				addXP(1);
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
}

/* ---------- Helpers ---------- */
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
