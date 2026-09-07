/* ============================================================
   Mode Orthographe — les trois TÂCHES jouables (couche UI).

   Les tuiles (remettre les lettres dans l'ordre), le mot caché (regarder, cacher,
   écrire) et la dictée (écouter, écrire) vivaient dans `ortho-runner.ts` : elles
   écrivaient dans `sheets()` et lisaient l'état de module du parcours. La révision
   espacée, elle, en avait sa propre copie réduite au seul mot caché — elle servait
   donc la même tâche à tous les mots quel que soit leur rang, et n'en faisait monter
   aucun (#640).

   Ici, une tâche ne connaît que son MOT et son HÔTE. Ce qu'elle ne décide pas —
   quelle marche franchir, où va l'XP, ce qu'on journalise, ce qui suit une réussite —
   remonte à l'hôte par rappels. C'est ce qui permet de la monter dans la feuille du
   parcours (`#sheets`) comme dans la carte de révision (`#revStage`) sans que les deux
   chemins puissent re-diverger.

   Les identifiants DOM sont ceux du parcours, PARTOUT (`#bac .tuile[data-i]`,
   `#btnVerifTuiles`, `#btnCacher`, `#orthoInput`, `#btnVerifMot`, `#btnEcouter`) :
   deux jeux d'ids selon l'hôte reproduiraient exactement la divergence que ce lot
   corrige.

   PAS DE JOURNAL D'ERREURS ICI (#391), et ce n'est pas un oubli : `capterErreur` a
   besoin d'un `lessonId`, que seul l'hôte connaît (la liste travaillée pour le
   parcours, le groupe du mot pour la révision). Une entrée sans lui est IGNORÉE en
   silence. D'où `onEchec`, qui remonte la réponse donnée à qui sait la rattacher.
   ============================================================ */
import { insertAt, moveAt, removeAt } from '../core/utils';
import { genExerciseOrtho, messageRienDePose } from '../core/orthographe/exercise';
import { checkAnswer } from '../core/exercise';
import { TEXT_ANSWER_INPUT_ATTRS } from '../core/items';
import type { MotOrtho, ModeOrtho } from '../core/orthographe/types';
import { lettresMotHTML, dessinerEntourages, ajusterTailleMot } from './ortho-atelier';
import { dicter } from './tts';
import { icon } from './icon';
import { monterBoutonAide, maybeAutoAide } from './aide-exercice';
import { html, drapeau, type SafeHtml, joindre, VIDE } from '../core/html';

const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'ô', 'î', 'ï', 'û', 'ù', 'œ', '-', "'"];

/** Ce qu'une tâche demande à son hôte. Tout ce qui n'est pas le GESTE de l'enfant
    (assembler des lettres, cacher puis écrire, écouter puis écrire) est ici : la tâche
    ne sait ni ce qu'une réussite fait monter, ni où part l'XP, ni comment on enchaîne. */
export interface OptionsTache {
	/** Élément dont la tâche remplace le contenu. */
	hote: HTMLElement;
	/** Classes du cadre. Le parcours pose sa feuille (`page ortho-run`) ; un hôte qui a
	    déjà sa carte (la révision) passe `ortho-run` seul, sinon la feuille s'empile sur
	    la carte (fond + ombre en double). */
	cadre?: string;
	/** Voix de synthèse disponible : commande les boutons « Écouter ». Une dictée n'est
	    servie que si elle est vraie — c'est à l'hôte de le garantir. */
	dispoDictee: boolean;
	/** Essais ratés tolérés avant la bascule sur la correction guidée (`onCorrection`).
	    Le parcours en laisse deux au mot caché et à la dictée, et n'escalade jamais sur
	    les tuiles (`Infinity`, les lettres y étant fournies) ; la révision n'en laisse
	    qu'un, tous formats confondus. */
	essaisAvantCorrection: number;
	/** Une réponse VIDE vaut-elle « je n'ai pas répondu » plutôt qu'un essai raté ? La
	    révision ne laissant qu'un essai, un clic malheureux sur « Vérifier » y brûlerait
	    l'item ; le parcours, lui, compte l'essai comme aujourd'hui. */
	ignorerReponseVide?: boolean;
	/** Bloc glissé sous le bouton de validation : le lien « Je ne sais pas, montre-moi »
	    (#467) de la révision. Rendu AVEC la zone de saisie du mot caché, donc invisible
	    tant que le mot est sous les yeux — il n'y a alors rien à demander. */
	decisionHTML?: SafeHtml;
	/** Câblage propre à l'hôte, une fois la tâche montée (le lien ci-dessus). */
	onMonte?: () => void;
	/** Réussite : à l'hôte de faire franchir la marche, de compter l'XP et d'enchaîner.
	    `fb` est la zone de retour de la tâche, où le parcours écrit « Bravo » et son
	    bouton « Continuer → » ; un hôte qui remplace tout l'écran peut l'ignorer. */
	onReussite: (mode: ModeOrtho, fb: HTMLElement) => void;
	/** Essai raté, avec la réponse donnée et son RANG (1 = premier). Le journal d'erreurs
	    ne retient que le premier essai ; la révision y enregistre aussi son verdict. */
	onEchec: (saisie: string, rang: number) => void;
	/** Bascule sur la correction guidée (atelier + diff) : à l'hôte de la rendre, le mot
	    étant à lui (entourages persistés) et l'enchaînement aussi. */
	onCorrection: (saisie: string) => void;
	/** La voix s'est tue en plein vol (#306 §5) : l'enfant écrirait sans avoir rien
	    entendu. Absent = la tâche ne fait rien de plus que renoncer à corriger. */
	onSilence?: () => void;
}

const cadreDe = (o: OptionsTache): string => o.cadre ?? 'page ortho-run';

/* ---------- Contexte d'une cible verbe (#261) ----------
   Une cible verbe porte `contexte` (pronom + complément) : on affiche la phrase à
   trou autour du slot interactif (le « trou » = la forme à écrire/assembler) et on
   lit la phrase complète en TTS. Un mot classique (`contexte` absent) est inchangé. */

/** Phrase à trou. `reveal` montre la forme (phase « affiché » du mot caché). */
export function contexteHTML(word: MotOrtho, reveal = false): SafeHtml {
	if (!word.contexte) return VIDE;
	const { avant, apres } = word.contexte;
	const creux = reveal
		? html`<span class="ortho-trou is-rempli">${word.mot}</span>`
		: html`<span class="ortho-trou"><span aria-hidden="true">______</span><span class="sr-only">le verbe à écrire</span></span>`;
	return html`<p class="ortho-contexte" lang="fr">${avant}${creux}${apres}</p>`;
}

/** Phrase complète lue par le TTS pour une cible verbe : « il mange une pomme ». */
function phraseVerbe(word: MotOrtho): string {
	const c = word.contexte!;
	return `${c.avant}${word.mot}${c.apres}`;
}

/** Écoute d'une cible : phrase complète pour un verbe (lève l'ambiguïté), sinon
    « mot. Comme dans : … » pour un mot classique. `onErreur` remonte le silence
    (voix absente ou énoncé en échec) à l'appelant — cf. `onSilence`. */
export function ecouterCible(word: MotOrtho, onErreur?: () => void): void {
	if (word.contexte) dicter(phraseVerbe(word), undefined, onErreur);
	else dicter(word.mot, word.commeDans, onErreur);
}

export function ecouterLabel(word: MotOrtho): string {
	return word.contexte ? 'Écouter la phrase' : 'Écouter le mot';
}

/** Bouton « Écouter » de l'atelier : on rend l'atelier audible comme les autres
    modes (découverte ET correction). Absent si aucune voix n'est dispo. Lit le mot
    (ou la phrase, pour un verbe) — le mot est affiché à l'atelier, rien n'est révélé. */
export function ecouteAtelier(
	word: MotOrtho,
	dispoDictee: boolean,
): { label: string; onClick: () => void } | undefined {
	if (!dispoDictee) return undefined;
	return { label: ecouterLabel(word), onClick: () => ecouterCible(word) };
}

/* Retrace des entourages du mot affiché en mode « afficher/cacher » au resize (#263).
   Module-level (un seul mot affiché à la fois) ; nettoyé dès qu'on cache le mot ou
   qu'on change d'activité, comme l'atelier/la relecture. */
let motCacheResize: (() => void) | null = null;
export function nettoyerTaches(): void {
	if (motCacheResize) {
		window.removeEventListener('resize', motCacheResize);
		motCacheResize = null;
	}
}

/** Monte la tâche d'une marche de l'escalier. Un seul aiguillage, partagé : le
    parcours et la révision ne peuvent pas servir deux rendus différents pour la même
    marche. */
export function monterTacheOrtho(mode: ModeOrtho, word: MotOrtho, o: OptionsTache): void {
	if (mode === 'tuiles') renderTuiles(word, o);
	else if (mode === 'dictee') renderDictee(word, o);
	else renderMotCache(word, o);
}

/* ---------- Affiche / masque ---------- */
export function renderMotCache(word: MotOrtho, o: OptionsTache): void {
	const ex = genExerciseOrtho(word, 'motCache');
	const hote = o.hote;
	let essais = 0;
	hote.innerHTML = html`
    <div class="${cadreDe(o)}">
      <p class="ortho-run-consigne">${word.contexte ? 'Regarde bien le verbe, puis cache-le et écris-le.' : 'Regarde bien ce mot, puis cache-le et écris-le.'}</p>
      ${contexteHTML(word)}
      ${o.dispoDictee ? html`<div><button class="btn-primary ortho-ecouter" id="btnEcouterMot">${icon('speaker')} ${ecouterLabel(word)}</button></div>` : ''}
      <div class="atelier-stage" id="motStage">
        <div class="ortho-mot-affiche" id="motAffiche">${lettresMotHTML(word.mot)}</div>
        <svg class="atelier-svg" id="motSvg" aria-hidden="true"></svg>
      </div>
      <div><button class="btn-primary" id="btnCacher">Cacher et écrire →</button></div>
      <div class="ortho-saisie" id="zoneSaisie" hidden>
        <input class="ortho-input" id="orthoInput" ${TEXT_ANSWER_INPUT_ATTRS}
               aria-label="${word.contexte ? 'Écris le verbe' : 'Écris le mot'}"
               aria-describedby="fb" />
        <div class="accent-kb" id="accentKb"></div>
        <button class="btn-primary" id="btnVerifMot">✓ Vérifier</button>
        ${o.decisionHTML ?? VIDE}
      </div>
      <div class="ortho-feedback" id="fb"></div>
    </div>`.balisage;
	const motStage = hote.querySelector('#motStage') as HTMLElement;
	const motAffiche = hote.querySelector('#motAffiche') as HTMLElement;
	const motSvg = hote.querySelector('#motSvg') as unknown as SVGSVGElement;
	const btnCacher = hote.querySelector('#btnCacher') as HTMLButtonElement;
	const zone = hote.querySelector('#zoneSaisie') as HTMLElement;
	const input = hote.querySelector('#orthoInput') as HTMLInputElement;
	const fb = hote.querySelector('#fb') as HTMLElement;

	renderAccentKb(hote.querySelector('#accentKb') as HTMLElement, input);

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
	if (o.dispoDictee) {
		hote.querySelector('#btnEcouterMot')!.addEventListener('click', () => ecouterCible(word));
	}

	btnCacher.addEventListener('click', () => {
		nettoyerTaches(); // mot caché : plus d'entourages à retracer
		motStage.style.display = 'none';
		btnCacher.style.display = 'none';
		zone.hidden = false;
		input.focus();
	});

	const verifier = () => {
		if (o.ignorerReponseVide && input.value.trim() === '') return rienDePose(fb, input, word);
		if (checkAnswer(ex, input.value)) {
			// Réussite : « Vérifier » s'efface, seul « Continuer → » reste (pas deux boutons, #153).
			(hote.querySelector('#btnVerifMot') as HTMLButtonElement).hidden = true;
			input.readOnly = true;
			o.onReussite('motCache', fb);
		} else {
			essais++;
			o.onEchec(input.value, essais);
			if (essais < o.essaisAvantCorrection) {
				fb.innerHTML =
					html`<span class="fb-ko">Presque ! Regarde bien et réessaie.</span>`.balisage;
				input.value = '';
				input.focus();
			} else {
				// Dernier essai : on bascule sur la correction guidée (diff sur le mot). Le
				// retrace du mot affiché a déjà été coupé au clic « Cacher » (on n'arrive
				// ici qu'après), donc `motCacheResize` est déjà nul — rien à nettoyer.
				o.onCorrection(input.value);
			}
		}
	};
	hote.querySelector('#btnVerifMot')!.addEventListener('click', verifier);
	input.addEventListener('keydown', (e) => brancherEntree(e, verifier));
	o.onMonte?.();
}

/* ---------- Dictée (TTS) ---------- */
export function renderDictee(word: MotOrtho, o: OptionsTache): void {
	const ex = genExerciseOrtho(word, 'dictee');
	const hote = o.hote;
	let essais = 0;
	hote.innerHTML = html`
    <div class="${cadreDe(o)}">
      <p class="ortho-run-consigne">${word.contexte ? 'Écoute la phrase, puis écris seulement le verbe.' : 'Écoute le mot, puis écris-le.'}</p>
      ${contexteHTML(word)}
      <button class="btn-primary ortho-ecouter" id="btnEcouter">${icon('speaker')} ${ecouterLabel(word)}</button>
      <div class="ortho-saisie">
        <input class="ortho-input" id="orthoInput" ${TEXT_ANSWER_INPUT_ATTRS}
               aria-label="${word.contexte ? 'Écris le verbe' : 'Écris le mot'}"
               aria-describedby="fb" />
        <div class="accent-kb" id="accentKb"></div>
        <button class="btn-primary" id="btnVerifMot">✓ Vérifier</button>
        ${o.decisionHTML ?? VIDE}
      </div>
      <div class="ortho-feedback" id="fb"></div>
    </div>`.balisage;
	const input = hote.querySelector('#orthoInput') as HTMLInputElement;
	const fb = hote.querySelector('#fb') as HTMLElement;
	renderAccentKb(hote.querySelector('#accentKb') as HTMLElement, input);

	// Filet de sécurité (#306 §5) : l'énoncé peut échouer alors que la voix semblait
	// utilisable (voix distante coupée en plein vol, moteur en panne). L'enfant se
	// retrouverait à écrire sans avoir rien entendu — et sa saisie au hasard finirait
	// dans le journal de l'espace encadrant. On coupe court : plus de correction ni de
	// journalisation, et l'hôte décide de la suite (`onSilence`).
	let muette = false;
	const surSilence = (): void => {
		if (muette) return;
		muette = true;
		o.onSilence?.();
	};
	const ecouter = () => ecouterCible(word, surSilence);
	hote.querySelector('#btnEcouter')!.addEventListener('click', ecouter);

	const verifier = () => {
		if (muette) return; // dictée silencieuse : on ne corrige ni ne journalise
		if (o.ignorerReponseVide && input.value.trim() === '') return rienDePose(fb, input, word);
		if (checkAnswer(ex, input.value)) {
			// Réussite : « Vérifier » s'efface, seul « Continuer → » reste (pas deux boutons, #153).
			(hote.querySelector('#btnVerifMot') as HTMLButtonElement).hidden = true;
			input.readOnly = true;
			o.onReussite('dictee', fb);
		} else {
			essais++;
			o.onEchec(input.value, essais);
			if (essais < o.essaisAvantCorrection) {
				fb.innerHTML = html`<span class="fb-ko">Presque ! Réécoute et réessaie.</span>`.balisage;
				input.value = '';
				input.focus();
				ecouter();
			} else {
				o.onCorrection(input.value);
			}
		}
	};
	hote.querySelector('#btnVerifMot')!.addEventListener('click', verifier);
	input.addEventListener('keydown', (e) => brancherEntree(e, verifier));
	o.onMonte?.();
	// Lecture auto EN DERNIER (peut être bloquée tant qu'il n'y a pas eu de geste).
	// Après le câblage, et pas avant : en cas d'échec, `onSilence` peut remplacer tout le
	// DOM de l'écran. Déclenchée plus haut, elle laisserait les `querySelector(...)!`
	// suivants chercher des éléments qui n'existent plus.
	ecouter();
}

/* ---------- Tuiles ---------- */
// Réordonnancement des tuiles : insertAt/removeAt/moveAt vivent dans core/utils.ts
// (logique pure testable sans DOM, #374) et sont importés ci-dessus.

// Au-delà de ce déplacement (px) un geste devient un glisser ; en dessous, c'est
// un tap. Volontairement élevé : un tap « propre » de CE2 dérive de 8-15 px.
const DRAG_THRESHOLD = 18;

export function renderTuiles(word: MotOrtho, o: OptionsTache): void {
	const ex = genExerciseOrtho(word, 'tuiles');
	const hote = o.hote;
	const lettres = ex.type === 'tuiles' ? ex.lettres : [];
	let assembled: number[] = []; // indices dans `lettres`, dans l'ordre posé
	let caret = 0; // position d'insertion (0..assembled.length) ; défaut = fin du mot
	let sel: number | null = null; // tuile posée sélectionnée (exclusif avec le curseur)
	const label = (l: string) => (l === ' ' ? '␣' : l);
	const glyph = (l: string) => (l === ' ' ? '␣' : l); // pour textContent (fantôme)

	hote.innerHTML = html`
    <div class="${cadreDe(o)}">
      <p class="ortho-run-consigne">${word.contexte ? 'Remets les lettres du verbe dans le bon ordre.' : 'Remets les lettres dans le bon ordre.'}
        <span class="ortho-run-astuce">Tape entre deux lettres pour choisir où écrire.</span></p>
      ${contexteHTML(word)}
      ${o.dispoDictee ? html`<div><button class="btn-primary ortho-ecouter" id="btnEcouterTuiles">${icon('speaker')} ${ecouterLabel(word)}</button></div>` : ''}
      <p class="tuiles-titre">${word.contexte ? 'Le verbe' : 'Ton mot'}</p>
      <div class="tuiles-construction" id="construction"></div>
      <p class="tuiles-titre">Les lettres</p>
      <div class="tuiles-bac" id="bac"></div>
      <button class="btn-primary" id="btnVerifTuiles" aria-describedby="fb">✓ Vérifier</button>
      ${o.decisionHTML ?? VIDE}
      <div class="ortho-feedback" id="fb"></div>
    </div>`.balisage;
	const construction = hote.querySelector('#construction') as HTMLElement;
	const bac = hote.querySelector('#bac') as HTMLElement;
	const fb = hote.querySelector('#fb') as HTMLElement;
	if (o.dispoDictee) {
		hote.querySelector('#btnEcouterTuiles')!.addEventListener('click', () => ecouterCible(word));
	}
	monterBoutonAide(hote.querySelector('.ortho-run'), 'lettres'); // bouton « ? » persistant (#272)

	// --- Rendu ---
	function slotHTML(pos: number): SafeHtml {
		const actif = sel === null && caret === pos;
		return html`<button type="button" class="tuile-slot${actif ? ' is-caret' : ''}" data-slot="${pos}" aria-label="Insérer ici"><span class="tuile-curseur"></span></button>`;
	}
	function poseHTML(posLettre: number): SafeHtml {
		const i = assembled[posLettre];
		if (sel !== posLettre) {
			return html`<button type="button" class="tuile tuile-pose" data-pos="${posLettre}">${label(lettres[i])}</button>`;
		}
		const auDebut = posLettre === 0;
		const aLaFin = posLettre === assembled.length - 1;
		return html`
      <span class="tuile-cell sel">
        <span class="tuile-controls">
          <button type="button" class="tuile-fleche${auDebut ? ' is-disabled' : ''}" data-act="left" aria-label="Déplacer à gauche"${auDebut ? drapeau('disabled') : ''}>◀</button>
          <button type="button" class="tuile-fleche${aLaFin ? ' is-disabled' : ''}" data-act="right" aria-label="Déplacer à droite"${aLaFin ? drapeau('disabled') : ''}>▶</button>
          <button type="button" class="tuile-retirer" data-act="remove">↩ enlever</button>
        </span>
        <button type="button" class="tuile tuile-pose sel" data-pos="${posLettre}">${label(lettres[i])}</button>
      </span>`;
	}
	function redraw(): void {
		// Mot en construction : slot, tuile, slot, tuile, …, slot final.
		let contenu = slotHTML(0);
		for (let p = 0; p < assembled.length; p++)
			contenu = html`${contenu}${poseHTML(p)}${slotHTML(p + 1)}`;
		construction.innerHTML = contenu.balisage;
		construction.classList.toggle('vide', assembled.length === 0);
		// Bac : lettres encore disponibles (les posées restent là mais masquées).
		bac.innerHTML = joindre(
			lettres.map((l, i) =>
				assembled.includes(i)
					? html`<button type="button" class="tuile tuile-used" disabled>${label(l)}</button>`
					: html`<button type="button" class="tuile" data-i="${i}">${label(l)}</button>`,
			),
		).balisage;
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

	let essais = 0;
	const verifier = (): void => {
		const built = assembled.map((i) => lettres[i]).join('');
		if (checkAnswer(ex, built)) {
			// Réussite : « Vérifier » s'efface, seul « Continuer → » reste (pas deux boutons, #153).
			(hote.querySelector('#btnVerifTuiles') as HTMLButtonElement).hidden = true;
			o.onReussite('tuiles', fb);
		} else if (o.ignorerReponseVide && built === '') {
			// Rien de posé : l'enfant n'a pas répondu. On le lui dit sans consommer son essai —
			// là où l'hôte n'en laisse qu'un, un clic malheureux lui coûterait le mot.
			rienDePose(fb, hote.querySelector<HTMLElement>('#btnVerifTuiles'), word, true);
		} else {
			essais++;
			o.onEchec(built, essais);
			if (essais < o.essaisAvantCorrection) {
				fb.innerHTML = html`<span class="fb-ko">Pas tout à fait, réessaie.</span>`.balisage;
			} else {
				o.onCorrection(built);
			}
		}
	};
	hote.querySelector('#btnVerifTuiles')!.addEventListener('click', verifier);
	o.onMonte?.();

	maybeAutoAide('lettres'); // bulle d'aide au 1er lancement (une fois par profil)
}

/* ---------- Helpers ---------- */
/* « Vérifier » cliqué sans rien avoir posé : on le DIT, sans consommer l'essai. Le silence
   d'avant (`input.focus()` seul) laissait l'enfant sans explication — et un lecteur d'écran
   sans rien du tout, là où les tuiles annonçaient déjà quelque chose. Le message part dans
   `#fb`, région live, donc il s'entend autant qu'il se lit. */
function rienDePose(
	fb: HTMLElement,
	cible: HTMLElement | null,
	word: MotOrtho,
	tuiles = false,
): void {
	fb.innerHTML =
		html`<span class="fb-ko">${messageRienDePose(tuiles ? 'tuiles' : 'saisie', !!word.contexte)}</span>`.balisage;
	// Le focus revient sur ce qui porte `aria-describedby="fb"` : sans lui, le message reste
	// muet pour qui ne voit pas l'écran. Et PAS de région live ici — la carte de révision cède
	// la parole aux régions du widget quand il en a une, si bien que rendre `#fb` live rendait
	// son propre verdict inaudible (attrapé par les témoins de #640).
	cible?.focus();
}

/* Entrée valide la saisie. `stopPropagation` : la carte de révision détourne Entrée vers
   son bouton principal (cf. `bindEnter`, ui/revision.ts). Sans cette coupure, l'Entrée
   qui vient de valider remonterait jusqu'à elle et cliquerait le « Continuer ▶ » que le
   verdict vient d'afficher — l'enfant passerait à la question suivante sans l'avoir lu.
   Sans effet côté parcours : aucun ancêtre de `#sheets` n'écoute Entrée sur ce champ. */
function brancherEntree(e: KeyboardEvent, verifier: () => void): void {
	if (e.key !== 'Enter') return;
	e.preventDefault();
	e.stopPropagation();
	verifier();
}

function renderAccentKb(container: HTMLElement, input: HTMLInputElement): void {
	container.innerHTML = joindre(
		ACCENTS.map((c) => html`<button type="button" class="accent-key" data-c="${c}">${c}</button>`),
	).balisage;
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
