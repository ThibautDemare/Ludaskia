/* ============================================================
   Abstraction d'exercice : type générique + interface de génération/vérification.
   Utilisé par tous les types d'exercices (math, conjugaison, QCM, orthographe…).
   ============================================================ */
import { normalizeText } from './utils';
import type { IconName } from './icon-names';
import type { SchoolLevel } from './catalog';

/** Affichage riche d'un choix de QCM (#200) : un fragment HTML/SVG DE CONFIANCE
    (généré par l'app, jamais une saisie utilisateur) et son libellé parlé pour
    l'accessibilité (lu par le lecteur d'écran / le TTS, jamais le balisage). */
export interface ChoiceView {
	html: string;
	label: string;
}

/** Variante de PRÉSENTATION d'un QCM (#204), source unique du type (réutilisée par
    le runner et la révision). 'ponctuation' → trou en cadre pointillé + boutons-
    symboles. Petit enum fermé piloté par la donnée. */
export type QcmVariante = 'ponctuation';

/** Une sous-question d'un problème (#199) : son intitulé et sa réponse numérique. */
export interface ProblemeEtape {
	question: string; // ex. « Combien Léo a-t-il de billes maintenant ? »
	answer: number;
}

/** Lexique d'affichage du runner « problème » (#95). Permet à une leçon qui réutilise
    ce runner (ex. division avec reste) d'en adapter le vocabulaire sans toucher le
    runner. Défaut (si absent) = vocabulaire « problème » de #199. */
export interface ProbLexique {
	nom: string; // unité au singulier, capitalisée — progression « {nom} X / Y » (« Calcul »)
	nomPluriel: string; // unité au pluriel, minuscule — résultat « N {nomPluriel} réussis »
	badgeEtape?: boolean; // afficher le badge « Étape N » sur les sous-questions ? (défaut true)
}

// `parle` (#42) : texte LU à voix haute par le bouton « Écouter », quand
// l'énoncé affiché est télégraphique/symbolique et ne se lit pas tel quel
// (ex. « pouvoir · présent — je @ » → « Conjugue le verbe pouvoir au présent,
// avec je. »). Optionnel : si absent, la lecture dérive de l'énoncé affiché
// (core/tts-text → texteParle). Ne doit JAMAIS contenir la réponse ni un indice.
export type Exercise =
	// `figure` (#88) : fragment SVG optionnel (moteur core/figures.ts) affiché
	// au-dessus de la question — horloge, plus tard rectangle coté, polygone…
	// `champHeure` (#88) : la réponse est une heure « H h MM » → saisie en 2 champs
	// [heures] h [minutes] (item `kind: 'heure'`), fusionnés avant correction.
	// `intervalle` (#240) : numération « intercaler » aux grandes plages (CM1) — la
	// réponse n'est plus une valeur unique mais TOUTE valeur strictement comprise
	// entre deux bornes [min, max] exclues (« un nombre entre 610 000 et 620 000 »).
	// `answer` reste une valeur valide (un exemple : révélation/correction, mode
	// tuiles). Absent (cas CE2) ⇒ correction par comparaison à `answer` (réponse
	// unique) : le comportement CE2 est INCHANGÉ.
	| {
			type: 'text';
			question: string;
			answer: string;
			answers?: string[];
			figure?: string;
			champHeure?: boolean;
			parle?: string;
			intervalle?: [number, number];
	  }
	// `explication` (#110) : justification pédagogique optionnelle affichée APRÈS
	// la réponse dans le runner QCM (ex. critère de substitution des homophones).
	// `choicesView` (#200) : affichage RICHE optionnel des choix (HTML/SVG de
	// confiance + libellé parlé), aligné par index sur `choices`. `choices` reste la
	// VALEUR comparée (clé de correction/déduplication) ; quand `choicesView` est
	// présent, le runner rend `html` (non échappé) avec `aria-label=label` au lieu du
	// texte brut. Sert p. ex. à écrire « 2/4 » en fraction empilée (barre horizontale)
	// ou, à terme, à proposer une figure SVG en choix.
	// `consigne`/`picto`/`ttsItems` (#203) : leçons « mots de sens proche / contraires ».
	// `consigne` est une question-consigne renforcée affichée en gras au-dessus de la
	// phrase (« Quel mot veut dire le contraire ? »), `picto` un symbole décoratif qui
	// la double sans en être l'unique indice (« = » sens proche, « ↔ » contraire) ;
	// `ttsItems` greffe un bouton « Écouter » sur le mot-cible et sur CHAQUE option
	// (lecture à la demande, jamais en rafale). Optionnels : les autres QCM ne les
	// fournissent pas et restent rendus à l'identique.
	// `choicesEmpilees` (#205) : disposition VERTICALE des options (le runner ajoute
	// `.sprint-choices--pile`). Pour des options quasi-homophones (allé/allée/allés),
	// une rangée serait piégeuse au doigt ; on les empile, en pleine largeur.
	// `variante` (#204) : indice de PRÉSENTATION lu par le runner QCM. 'ponctuation'
	// → trou final en cadre pointillé (pas un « ? »), boutons-symboles (gros glyphe
	// + mot), et réinjection du signe dans la phrase après la réponse. Absent = QCM
	// texte standard. Orthogonal à `choicesView` (le runner fabrique lui-même la vue
	// des symboles à partir de cette variante).
	| {
			type: 'qcm';
			question: string;
			answer: string;
			choices: string[];
			choicesView?: ChoiceView[];
			choicesEmpilees?: boolean;
			figure?: string;
			explication?: string;
			parle?: string;
			consigne?: string;
			picto?: string;
			ttsItems?: boolean;
			variante?: QcmVariante;
	  }
	// Numération (#98) — l'enfant déplace LA bonne tuile (signe ou nombre) parmi
	// des distracteurs vers l'emplacement `@` de la question. Réponse = `answer`.
	| { type: 'tuilesNombre'; question: string; answer: string; tuiles: string[]; parle?: string }
	// Vocabulaire (#108) — l'enfant range une SUITE de tuiles-mots dans l'ordre
	// alphabétique. `tuiles` = la suite mélangée affichée ; `ordre` = la bonne
	// suite triée (calculée, jamais codée en dur). Mono-mode (runner dédié).
	| { type: 'tuilesOrdre'; question: string; tuiles: string[]; ordre: string[]; parle?: string }
	// Vocabulaire (#114) — champs lexicaux : l'enfant range des tuiles-mots FOURNIES
	// dans deux thèmes (catégories). `mots` porte la catégorie correcte de chaque
	// tuile (0 ou 1) ; corrigé tuile par tuile par son runner (ui/lecon-tri.ts).
	| {
			type: 'tuilesTri';
			question: string;
			categories: [string, string];
			mots: { mot: string; cat: 0 | 1 }[];
			parle?: string;
	  }
	// Calcul posé (#97) — opération en colonnes ; le catalogue en fait un Item
	// `posed` (cellules-chiffres notées une à une). Pas de champ `answer` unique.
	| { type: 'posed'; op: '+' | '-' | 'x'; a: number; b: number }
	// Résolution de problèmes (#199) — énoncé textuel + 1 sous-question (problème
	// simple) ou 2 (deux étapes, « chunking » ; ou résultat + reste d'une division
	// par le sens, #95). Chaque étape a sa réponse numérique, corrigée indépendamment.
	// Runner dédié (ui/lecon-probleme.ts) ; `parle` = énoncé complet lu à voix haute
	// (jamais la réponse). `figure` (#95) = situation de départ optionnelle. Hors sprint.
	| { type: 'probleme'; enonce: string; etapes: ProblemeEtape[]; parle: string; figure?: string }
	// Orthographe — interactions réutilisables (vérifiées comme du texte) :
	| { type: 'motCache'; answer: string } // affiche/masque le mot puis saisie
	| { type: 'tuiles'; answer: string; lettres: string[] } // lettres mélangées à ordonner
	| { type: 'dictee'; answer: string; commeDans?: string }; // rien d'affiché, lu en TTS

/** Mode d'entraînement, pour les types d'exercices qui en proposent plusieurs. */
export type ExerciseMode = string;

/** Étiquette déclarative du format d'un `ExerciseType` (#348) pour les formats à
 *  runner d'écran dédié, incompatibles avec le sprint « une réponse à la fois » :
 *  opération posée (#97), rangement d'une suite (#108), tri par thème (#114),
 *  résolution de problèmes (#199). Sert à classer une leçon SANS appeler
 *  `generate()` (qui consomme l'aléatoire global). Absent = format standard
 *  (texte/QCM) éligible au sprint. Doit refléter le `type` que produit le
 *  `generate()` par défaut (sans mode) — invariant vérifié en test. */
export type ExerciseKind = 'posed' | 'tuilesOrdre' | 'tuilesTri' | 'probleme';

/** Options de génération (#225). Le niveau est résolu UNE fois en amont (seam
 *  UI/catalogue via `effectiveLevel`) puis passé ici ; une fabrique mono-niveau
 *  l'ignore → comportement identique. `mode` reste l'option historique. */
export interface GenerateOpts {
	mode?: ExerciseMode;
	level?: SchoolLevel;
}

/* Descripteur d'un mode présentable à l'enfant (écran de choix depuis une leçon).
   Les modes sont listés dans l'ordre d'affichage (du plus conseillé/accessible au
   plus exigeant) ; chaque écran dérive ses choix d'ici, jamais en dur. */
export interface ModeOption {
	id: ExerciseMode;
	label: string; // libellé à l'action, lisible par un CE2 (« J'écris le verbe »)
	hint?: string; // sous-ligne d'aide optionnelle (« plus facile pour commencer »)
	icon?: IconName; // pictogramme (icône Phosphor, rendu par ui/icon.ts)
	recommended?: boolean; // mode par défaut / conseillé (mis en avant, choisi si aucun)
}

export interface ExerciseType {
	/** Modes proposés, dans l'ordre d'affichage (optionnel ; un type mono-mode l'ignore). */
	modes?: ModeOption[];
	/** Consigne de la fiche en saisie (#42) : phrase qui NOMME la tâche, propre à ce
	 *  type d'exercice (ex. « Conjugue le verbe au temps demandé. »). Remplace le
	 *  générique « Écris la forme correcte. » quand elle est définie. */
	consigne?: string;
	/** Lexique d'affichage du runner « problème » (#95) — voir `ProbLexique`. */
	probLexique?: ProbLexique;
	/** Niveaux scolaires couverts (#225), renseigné par les combinateurs multi-niveaux
	 *  (`calibrated`, `bankByLevel`) : le catalogue en dérive `LessonDef.levels`. */
	levels?: SchoolLevel[];
	/** Format à runner dédié, hors sprint (#348) — voir `ExerciseKind`. Renseigné
	 *  par les fabriques concernées ; lu par les helpers de classification du
	 *  catalogue au lieu d'appeler `generate()`. Absent pour les formats standard. */
	exerciseKind?: ExerciseKind;
	generate(opts?: GenerateOpts): Exercise;
	check(exercise: Exercise, input: string): boolean;
}

/** Le type propose-t-il ce mode ? (remplace les `modes.includes(...)` codés en dur.) */
export function hasMode(type: ExerciseType, mode: ExerciseMode): boolean {
	return !!type.modes?.some((m) => m.id === mode);
}

/** Mode par défaut : le mode « recommended », sinon le premier listé, sinon aucun. */
export function defaultMode(type: ExerciseType): ExerciseMode | undefined {
	const ms = type.modes;
	if (!ms || ms.length === 0) return undefined;
	return (ms.find((m) => m.recommended) ?? ms[0]).id;
}

/* Vérification générique pour les exercices texte (hors math).
   Normalisation partagée (`normalizeText`) : trim + espaces internes réduits + NFC.
   Accents et apostrophes exigés. Couvre tous les types : comparaison à `answer`
   (+ variantes `answers` pour 'text'). */
export function checkAnswer(exercise: Exercise, input: string): boolean {
	// Le calcul posé (corrigé cellule par cellule), le rangement d'une suite (#108)
	// et le tri par thème (#114) — corrigés par leur runner — n'ont pas de réponse
	// texte unique : ils ne passent jamais par cette vérification générique.
	if (
		exercise.type === 'posed' ||
		exercise.type === 'tuilesOrdre' ||
		exercise.type === 'tuilesTri' ||
		exercise.type === 'probleme'
	)
		return false;
	const normalized = normalizeText(input);
	if (normalized === normalizeText(exercise.answer)) return true;
	if (exercise.type === 'text') {
		return (exercise.answers ?? []).some((a) => normalizeText(a) === normalized);
	}
	return false;
}
