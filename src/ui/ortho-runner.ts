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
import { escapeHTML, insertAt, moveAt, removeAt } from '../core/utils';
import { loadOrtho, saveOrtho, getListe } from '../core/orthographe/store';
import { materialiserVerbes } from '../core/orthographe/verbes';
import { motsDeLecon } from '../core/orthographe/lessons';
import { genExerciseOrtho, ORTHO_MODE_OPTIONS } from '../core/orthographe/exercise';
import { checkAnswer } from '../core/exercise';
import { TEXT_ANSWER_INPUT_ATTRS } from '../core/items';
import {
	statutMot,
	prochaineActivite,
	marquerAtelierFait,
	validerMode,
	decouverteEnCours,
	listeEtoilee,
} from '../core/orthographe/runner';
import type { MotOrtho, OrthoState, ModeOrtho } from '../core/orthographe/types';
import { diffCorrect } from '../core/orthographe/diff';
import { addXP, getXP, niveauDepuisXP, recordSessionActivity } from '../core/progress';
import { evaluateTrophies } from '../core/rewards';
import { ORTHO_CATEGORY_ID } from '../core/catalog';
import { goCategorie, goOrthoRevoir } from './navigation';
import {
	renderAtelier,
	lettresMotHTML,
	dessinerEntourages,
	ajusterTailleMot,
} from './ortho-atelier';
import { recompensesEntre } from '../core/unlocks';
import { announceRewards, showLevelUp } from './effects';
import { mascotteBulleHTML, encouragementMascotte } from './unlocks-view';
import { dicteeDisponible, dicter } from './tts';
import { icon, iconOr } from './icon';
import { monterBoutonAide, maybeAutoAide } from './aide-exercice';
import { capterErreur } from './erreur-capture';

const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'ô', 'î', 'ï', 'û', 'ù', 'œ', '-', "'"];
const SEANCE_MAX = 8; // activités par séance avant de proposer une pause (rythme CE2)

let st: OrthoState;
let mots: MotOrtho[];
let orthoLessonId = ''; // id de la liste travaillée (journal d'erreurs #391)
let idx = 0;
let dispoDictee = false;
let niveauAvant = 0;
let actes = 0;
// Mode de la séance (#69) : null = parcours complet (atelier → modes → étoile) ;
// un mode = entraînement ciblé sur ce seul mode (ne valide pas, pas d'étoile).
let seanceMode: ModeOrtho | null = null;
// Tour de révision : true quand le parcours complet est lancé sur une liste DÉJÀ
// entièrement maîtrisée. Au lieu d'un bilan vide (l'étoile est déjà gagnée), on
// repasse chaque mot une fois en mode d'entretien, puis on clôt par « Révision
// terminée » (pas la célébration « Liste prête ! » de première complétion).
let revisionRun = false;
// Une session d'orthographe a-t-elle déjà été journalisée dans le graphe d'activité
// encadrant (#319) ? Posée une seule fois par session (au 1er écran terminal atteint :
// pause, bilan ou révision terminée), pour ne pas re-compter les « Continuer encore ».
let orthoJournalisee = false;
// Mode choisi en attente, posé par l'écran de choix et consommé par startOrthoRun.
let pendingOrthoMode: ModeOrtho | null = null;
export const setPendingOrthoMode = (m: ModeOrtho | null) => {
	pendingOrthoMode = m;
};

// Retrace des entourages du mot affiché en mode « afficher/cacher » au resize (#263).
// Module-level (un seul mot affiché à la fois) ; nettoyé dès qu'on cache le mot ou
// qu'on change d'activité (début de renderNext), comme l'atelier/la relecture.
let motCacheResize: (() => void) | null = null;
function cleanupMotCacheResize(): void {
	if (motCacheResize) {
		window.removeEventListener('resize', motCacheResize);
		motCacheResize = null;
	}
}

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* ---------- Contexte d'une cible verbe (#261) ----------
   Une cible verbe porte `contexte` (pronom + complément) : on affiche la phrase à
   trou autour du slot interactif (le « trou » = la forme à écrire/assembler) et on
   lit la phrase complète en TTS. Un mot classique (`contexte` absent) est inchangé. */

/* Phrase à trou. `reveal` montre la forme (phase « affiché » du mot caché). */
function contexteHTML(word: MotOrtho, reveal = false): string {
	if (!word.contexte) return '';
	const { avant, apres } = word.contexte;
	const creux = reveal
		? `<span class="ortho-trou is-rempli">${escapeHTML(word.mot)}</span>`
		: `<span class="ortho-trou"><span aria-hidden="true">______</span><span class="sr-only">le verbe à écrire</span></span>`;
	return `<p class="ortho-contexte" lang="fr">${escapeHTML(avant)}${creux}${escapeHTML(apres)}</p>`;
}

/* Phrase complète lue par le TTS pour une cible verbe : « il mange une pomme ». */
function phraseVerbe(word: MotOrtho): string {
	const c = word.contexte!;
	return `${c.avant}${word.mot}${c.apres}`;
}

/* Écoute d'une cible : phrase complète pour un verbe (lève l'ambiguïté), sinon
   « mot. Comme dans : … » pour un mot classique. */
function ecouterCible(word: MotOrtho): void {
	if (word.contexte) dicter(phraseVerbe(word));
	else dicter(word.mot, word.commeDans);
}

function ecouterLabel(word: MotOrtho): string {
	return word.contexte ? 'Écouter la phrase' : 'Écouter le mot';
}

/* Bouton « Écouter » de l'atelier : on rend l'atelier audible comme les autres
   modes (découverte ET correction). Absent si aucune voix n'est dispo. Lit le mot
   (ou la phrase, pour un verbe) — le mot est affiché à l'atelier, rien n'est révélé. */
function ecouteAtelier(word: MotOrtho): { label: string; onClick: () => void } | undefined {
	if (!dispoDictee) return undefined;
	return { label: ecouterLabel(word), onClick: () => ecouterCible(word) };
}

/* Journal des erreurs (#391) : consigne le PREMIER essai raté d'un mot (mot caché,
   dictée ou tuiles), lisible côté encadrant. mode 'dictee' (le sous-mode importe peu
   au parent). Pour un verbe en contexte, l'énoncé montre la phrase à trou ; sinon un
   libellé générique (la bonne réponse — le mot — porte l'info). Appelé une seule fois
   par activité (garde chez l'appelant). */
function journalErreurOrtho(word: MotOrtho, saisie: string): void {
	if (!saisie.trim()) return; // saisie vide = non répondu → ignorée (parité avec la fiche)
	const c = word.contexte;
	capterErreur({
		text: c ? `${c.avant}…${c.apres}` : 'Mot à écrire sous la dictée',
		donnee: saisie,
		attendue: word.mot,
		lessonId: orthoLessonId,
		mode: 'dictee',
	});
}

export async function startOrthoRun(lessonId: string): Promise<void> {
	st = loadOrtho();
	orthoLessonId = lessonId;
	mots = motsDeLecon(st, lessonId);
	// Verbes de la liste (#261) : résolus via LEFFF (async) puis matérialisés en
	// cibles dictée/tuiles/mot-caché et concaténés aux mots classiques.
	const liste = getListe(st, lessonId);
	if (liste?.verbes?.length) {
		renderPreparation();
		const cibles = await materialiserVerbes(st, liste.verbes, Date.now());
		mots = [...mots, ...cibles];
	}
	saveOrtho(st); // persiste la matérialisation (mots prédéfinis + cibles verbe)
	dispoDictee = dicteeDisponible();
	seanceMode = pendingOrthoMode; // null → parcours complet
	pendingOrthoMode = null;
	idx = 0;
	niveauAvant = niveauDepuisXP(getXP());
	actes = 0;
	orthoJournalisee = false; // nouvelle session → re-journalisable une fois (#319)
	// Parcours complet sur une liste déjà acquise → tour de révision (sinon le bilan
	// tomberait tout de suite, sans rien proposer à travailler).
	revisionRun = !seanceMode && listeEtoilee(mots, dispoDictee);
	if (!mots.length) {
		goCategorie(ORTHO_CATEGORY_ID);
		return;
	}
	renderNext();
}

/* Écran d'attente bref pendant la résolution des formes verbales (chargement
   paresseux d'un shard). Évite un écran vide le temps de l'import dynamique. */
function renderPreparation(): void {
	sheets().innerHTML = `
    <div class="page ortho-run ortho-bilan">
      <div class="ortho-bilan-emoji">⏳</div>
      <p>Un instant, je prépare tes mots…</p>
    </div>`;
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
        <span class="mode-btn-ico">${icon('star', { cls: 'ph-star' })}</span>
        <span class="mode-btn-txt">
          <span class="mode-btn-label">Le parcours complet</span>
          <span class="mode-btn-badge">conseillé · donne l'étoile</span>
        </span>
      </button>
      ${cibles
				.map(
					(m) => `<button class="mode-btn" data-mode="${m.id}">
        <span class="mode-btn-ico">${iconOr(m.icon)}</span>
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
        <span class="mode-btn-ico">${icon('book-open')}</span>
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
	// Tour de révision : liste déjà acquise → on repasse chaque mot UNE fois, dans
	// l'ordre, puis « fini » (pas de filtre de statut, ils sont tous maîtrisés ;
	// l'activité due sera un mode d'entretien aléatoire via prochaineActivite).
	if (revisionRun) return idx < mots.length ? mots[idx++] : null;
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
	cleanupMotCacheResize(); // on quitte un éventuel mot affiché : plus rien à retracer
	const word = prochainNonMaitrise();
	if (!word) {
		if (revisionRun) renderRevisionFin();
		else renderBilan();
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
			contexteHTML: contexteHTML(word),
			ecoute: ecouteAtelier(word),
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
      <p class="ortho-run-consigne">${word.contexte ? 'Regarde bien le verbe, puis cache-le et écris-le.' : 'Regarde bien ce mot, puis cache-le et écris-le.'}</p>
      ${contexteHTML(word)}
      ${dispoDictee ? `<div><button class="btn-primary ortho-ecouter" id="btnEcouterMot">${icon('speaker')} ${ecouterLabel(word)}</button></div>` : ''}
      <div class="atelier-stage" id="motStage">
        <div class="ortho-mot-affiche" id="motAffiche">${lettresMotHTML(word.mot)}</div>
        <svg class="atelier-svg" id="motSvg" aria-hidden="true"></svg>
      </div>
      <div><button class="btn-primary" id="btnCacher">Cacher et écrire →</button></div>
      <div class="ortho-saisie" id="zoneSaisie" hidden>
        <input class="ortho-input" id="orthoInput" ${TEXT_ANSWER_INPUT_ATTRS}
               aria-label="Écris le mot" />
        <div class="accent-kb" id="accentKb"></div>
        <button class="btn-primary" id="btnVerifMot">✓ Vérifier</button>
      </div>
      <div class="ortho-feedback" id="fb"></div>
    </div>`;
	const motStage = sheets().querySelector('#motStage') as HTMLElement;
	const motAffiche = sheets().querySelector('#motAffiche') as HTMLElement;
	const motSvg = sheets().querySelector('#motSvg') as unknown as SVGSVGElement;
	const btnCacher = sheets().querySelector('#btnCacher') as HTMLButtonElement;
	const zone = sheets().querySelector('#zoneSaisie') as HTMLElement;
	const input = sheets().querySelector('#orthoInput') as HTMLInputElement;
	const fb = sheets().querySelector('#fb') as HTMLElement;

	renderAccentKb(sheets().querySelector('#accentKb') as HTMLElement, input);

	// Rappel visuel des pièges (#263) : si l'enfant a entouré des lettres à l'atelier,
	// on les retrace ici en LECTURE SEULE (mêmes couleurs/rendu que l'atelier et la
	// relecture) tant que le mot est affiché. `ajusterTailleMot` garde un mot long dans
	// le cadre ; on retrace au resize (offsets dépendants de la mise en page) et une
	// fois les polices prêtes (premier rendu). Nettoyé dès qu'on cache le mot.
	const retracer = (): void => {
		ajusterTailleMot(motAffiche, motStage);
		if (word.entourage.length) dessinerEntourages(motAffiche, motSvg, word.entourage);
	};
	retracer();
	void document.fonts?.ready?.then(retracer);
	motCacheResize = retracer;
	window.addEventListener('resize', motCacheResize);

	// Écoute du mot (#150) : disponible avant ET après l'avoir caché (le bouton est
	// hors des éléments masqués) — entendre la prononciation aide à l'écrire.
	if (dispoDictee) {
		sheets()
			.querySelector('#btnEcouterMot')!
			.addEventListener('click', () => ecouterCible(word));
	}

	btnCacher.addEventListener('click', () => {
		cleanupMotCacheResize(); // mot caché : plus d'entourages à retracer
		motStage.style.display = 'none';
		btnCacher.style.display = 'none';
		zone.hidden = false;
		input.focus();
	});

	const verifier = () => {
		if (checkAnswer(ex, input.value)) {
			reussiteMode(word, 'motCache');
			// Réussite : « Vérifier » s'efface, seul « Continuer → » reste (pas deux boutons, #153).
			(sheets().querySelector('#btnVerifMot') as HTMLButtonElement).hidden = true;
			input.readOnly = true;
			reussite(fb, true);
		} else {
			if (essais === 0) journalErreurOrtho(word, input.value); // 1er essai raté
			essais++;
			if (essais < 2) {
				fb.innerHTML = `<span class="fb-ko">Presque ! Regarde bien et réessaie.</span>`;
				input.value = '';
				input.focus();
			} else {
				// 2e erreur : on bascule sur l'atelier de correction (diff sur le mot). Le
				// retrace du mot affiché a déjà été coupé au clic « Cacher » (on n'arrive
				// ici qu'après), donc `motCacheResize` est déjà nul — rien à nettoyer.
				const diff = diffCorrect(input.value, word.mot);
				renderAtelier(sheets(), word, {
					contexteHTML: contexteHTML(word),
					ecoute: ecouteAtelier(word),
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
      <p class="ortho-run-consigne">${word.contexte ? 'Écoute la phrase, puis écris seulement le verbe.' : 'Écoute le mot, puis écris-le.'}</p>
      ${contexteHTML(word)}
      <button class="btn-primary ortho-ecouter" id="btnEcouter">${icon('speaker')} ${ecouterLabel(word)}</button>
      <div class="ortho-saisie">
        <input class="ortho-input" id="orthoInput" ${TEXT_ANSWER_INPUT_ATTRS}
               aria-label="${word.contexte ? 'Écris le verbe' : 'Écris le mot'}" />
        <div class="accent-kb" id="accentKb"></div>
        <button class="btn-primary" id="btnVerifMot">✓ Vérifier</button>
      </div>
      <div class="ortho-feedback" id="fb"></div>
    </div>`;
	const input = sheets().querySelector('#orthoInput') as HTMLInputElement;
	const fb = sheets().querySelector('#fb') as HTMLElement;
	renderAccentKb(sheets().querySelector('#accentKb') as HTMLElement, input);

	const ecouter = () => ecouterCible(word);
	sheets().querySelector('#btnEcouter')!.addEventListener('click', ecouter);
	ecouter(); // tentative de lecture auto (peut être bloquée tant qu'il n'y a pas eu de geste)

	const verifier = () => {
		if (checkAnswer(ex, input.value)) {
			reussiteMode(word, 'dictee');
			// Réussite : « Vérifier » s'efface, seul « Continuer → » reste (pas deux boutons, #153).
			(sheets().querySelector('#btnVerifMot') as HTMLButtonElement).hidden = true;
			input.readOnly = true;
			reussite(fb, true);
		} else {
			if (essais === 0) journalErreurOrtho(word, input.value); // 1er essai raté
			essais++;
			if (essais < 2) {
				fb.innerHTML = `<span class="fb-ko">Presque ! Réécoute et réessaie.</span>`;
				input.value = '';
				input.focus();
				ecouter();
			} else {
				const diff = diffCorrect(input.value, word.mot);
				renderAtelier(sheets(), word, {
					contexteHTML: contexteHTML(word),
					ecoute: ecouteAtelier(word),
					onDone: () => {
						saveOrtho(st);
						renderNext();
					},
					diff,
					consigne: word.contexte
						? "Regarde le verbe et où tu t'es trompé, puis entoure le piège."
						: "Regarde le mot et où tu t'es trompé, puis entoure le piège.",
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
// Réordonnancement des tuiles : insertAt/removeAt/moveAt vivent désormais dans
// core/utils.ts (logique pure testable sans DOM, #374) et sont importés ci-dessus.

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
      <p class="ortho-run-consigne">${word.contexte ? 'Remets les lettres du verbe dans le bon ordre.' : 'Remets les lettres dans le bon ordre.'}
        <span class="ortho-run-astuce">Tape entre deux lettres pour choisir où écrire.</span></p>
      ${contexteHTML(word)}
      ${dispoDictee ? `<div><button class="btn-primary ortho-ecouter" id="btnEcouterTuiles">${icon('speaker')} ${ecouterLabel(word)}</button></div>` : ''}
      <p class="tuiles-titre">${word.contexte ? 'Le verbe' : 'Ton mot'}</p>
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
			.addEventListener('click', () => ecouterCible(word));
	}
	monterBoutonAide(sheets().querySelector('.ortho-run'), 'lettres'); // bouton « ? » persistant (#272)

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

	let erreurLoggee = false; // journal d'erreurs (#391) : une seule capture par mot
	const verifier = (): void => {
		const built = assembled.map((i) => lettres[i]).join('');
		if (checkAnswer(ex, built)) {
			reussiteMode(word, 'tuiles');
			// Réussite : « Vérifier » s'efface, seul « Continuer → » reste (pas deux boutons, #153).
			(sheets().querySelector('#btnVerifTuiles') as HTMLButtonElement).hidden = true;
			reussite(fb, true);
		} else {
			if (!erreurLoggee) {
				journalErreurOrtho(word, built); // 1er essai raté
				erreurLoggee = true;
			}
			fb.innerHTML = `<span class="fb-ko">Pas tout à fait, réessaie.</span>`;
		}
	};
	sheets().querySelector('#btnVerifTuiles')!.addEventListener('click', verifier);

	maybeAutoAide('lettres'); // bulle d'aide au 1er lancement (une fois par profil)
}

/* Journalise UNE session d'orthographe (#319) au 1er écran terminal atteint (bilan,
   révision terminée ou pause) ; le flag évite de re-compter un « Continuer encore ». */
function journalOrthoSession(): void {
	if (orthoJournalisee) return;
	orthoJournalisee = true;
	recordSessionActivity('dictee');
}

/* ---------- Bilan ---------- */
function renderBilan(): void {
	journalOrthoSession();
	const total = mots.length;
	sheets().innerHTML = `
    <div class="page ortho-run ortho-bilan">
      ${mascotteBulleHTML(encouragementMascotte())}
      <div class="ortho-bilan-emoji">🎉</div>
      <h2>Liste prête !</h2>
      <p>Tu as bien travaillé ${total > 1 ? `les <b>${total}</b> mots` : 'le mot'} de cette liste.</p>
      <button class="btn-primary" id="btnBilanRetour">Retour à l'orthographe</button>
    </div>`;
	sheets()
		.querySelector('#btnBilanRetour')!
		.addEventListener('click', () => goCategorie(ORTHO_CATEGORY_ID));

	// Récompenses : l'étoile « Liste prête », plus trophées éventuels + montée de niveau.
	annoncerRecompensesFin([{ icon: '🌟', text: 'Liste prête, bravo !' }]);
}

/* ---------- Fin d'un tour de révision (liste déjà maîtrisée) ----------
   La liste est déjà acquise : on NE rejoue PAS la célébration « Liste prête ! »
   (l'étoile est gagnée), mais un bilan de révision plus sobre. On annonce tout de
   même les récompenses légitimement gagnées pendant la révision (trophées, montée
   de niveau due à l'XP), sans la fausse étoile de première complétion. */
function renderRevisionFin(): void {
	journalOrthoSession();
	const total = mots.length;
	sheets().innerHTML = `
    <div class="page ortho-run ortho-bilan">
      ${mascotteBulleHTML(encouragementMascotte())}
      <div class="ortho-bilan-emoji">✅</div>
      <h2>Révision terminée !</h2>
      <p>Tu as révisé ${total > 1 ? `les <b>${total}</b> mots` : 'le mot'} de cette liste.</p>
      <button class="btn-primary" id="btnBilanRetour">Retour à l'orthographe</button>
    </div>`;
	sheets()
		.querySelector('#btnBilanRetour')!
		.addEventListener('click', () => goCategorie(ORTHO_CATEGORY_ID));
	annoncerRecompensesFin([]); // pas d'étoile : seulement trophées/niveau réellement gagnés
}

/* Annonce les récompenses obtenues en fin de parcours ou de révision : trophées
   nouvellement débloqués + éventuelle montée de niveau (modale + confettis). `celebBase`
   = entrées de célébration toujours montrées (l'étoile « Liste prête » du parcours
   complet) ; vide en révision, où l'on ne célèbre que ce qui a réellement été gagné. */
function annoncerRecompensesFin(celebBase: { icon: string; text: string }[]): void {
	const newTrophies = evaluateTrophies();
	const celeb = [
		...celebBase,
		...newTrophies.map((t) => ({ icon: t.icon, text: `Trophée : ${t.title}` })),
	];
	const niveauApres = niveauDepuisXP(getXP());
	const niveauGagne = niveauApres > niveauAvant ? niveauApres : 0;
	const recompensesNiv = recompensesEntre(niveauAvant, niveauApres);
	niveauAvant = niveauApres;
	announceRewards(niveauGagne, recompensesNiv, celeb);
}

/* ---------- Pause de séance (rythme adapté à un CE2) ---------- */
function renderPause(): void {
	journalOrthoSession();
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
	// Hors parcours de première complétion (mode ciblé ou révision), il n'y a pas de
	// bilan d'étoile → on célèbre à la pause les niveaux éventuellement gagnés.
	if (seanceMode || revisionRun) annoncerNiveauSiGagne();
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
