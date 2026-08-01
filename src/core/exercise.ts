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

/** Colonne d'un tableau de conversion (#394). L'ordre des colonnes est TOUJOURS
    grande→petite unité (position spatiale stable d'un exercice à l'autre, avis
    specialiste-troubles-apprentissage : retrouver une colonne par sa place mémorisée
    plutôt que par le décodage d'une abréviation proche — dam/dm, hg/kg). */
export interface TableauColonne {
	unite: string; // symbole affiché (« km », « hm », « dam », « m »)
	nom: string; // nom complet singulier (« kilomètre ») — en-tête visible + aria-label
	transit: boolean; // unité non exercée au niveau : en-tête démoté + case pointillés, mais saisissable
	chiffres: string; // chiffre(s) attendu(s) dans la case : 1 caractère, sauf la colonne de tête (1-2)
	// La colonne de tête est TOUJOURS la première (index 0) — inutile de la marquer.
}

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

/** Nature des éléments d'un rangement de suite (`tuilesOrdre`, #448) : des mots
 *  (ordre alphabétique, #108) ou des nombres (ordre croissant/décroissant). Pilote
 *  la formulation partagée (consigne du widget, aide contextuelle, aria-labels) et
 *  le séparateur de liste — jamais la logique de correction. */
export type NatureOrdre = 'mots' | 'nombres';

/** Séparateur de LISTE d'une suite rangée écrite en texte, accordé à sa nature
 *  (#448) : le POINT-VIRGULE pour des nombres, la virgule pour des mots. En français
 *  la virgule est le séparateur DÉCIMAL — « 450, 405 » se lirait comme un nombre à
 *  virgule. Source UNIQUE, partagée par les DEUX endroits où une suite se lit hors du
 *  widget : le repli texte du catalogue (fiche/bilan, lu par l'enfant) et le journal
 *  d'erreurs (espace encadrant, lu par le parent). Les avoir divergents faisait dire
 *  au même contenu deux choses différentes selon l'écran. */
export function separateurSuite(nature?: NatureOrdre): string {
	return nature === 'nombres' ? ' ; ' : ', ';
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
	// QCM MULTI-SÉLECTION (#253) — « Coche TOUTES les propriétés qui s'appliquent ». On
	// montre une figure codée et EXACTEMENT 4 affirmations ; l'enfant coche celles qui
	// sont vraies. Correction TOUT-OU-RIEN par le runner dédié (ui/lecon-qcm-multi.ts) :
	// juste ⇔ toutes les bonnes cochées ET aucune mauvaise.
	// `propositions` : les 4 affirmations, dans un ordre STABLE (jamais réordonné à
	//   l'affichage — un enfant dyspraxique planifie ses appuis par position).
	// `correctes` : le sous-ensemble VRAI, CALCULÉ puis STOCKÉ à la génération (jamais
	//   recalculé au check), garanti non vide ET de taille < 4 (au moins une vraie et une
	//   fausse). Le runner compare l'ensemble coché à cette liste.
	// `figure` : figure SVG codée ; `parle` : consigne lue à voix haute.
	| {
			type: 'qcmMulti';
			question: string;
			propositions: string[];
			correctes: string[];
			figure?: string;
			parle?: string;
	  }
	// Numération (#98) — l'enfant déplace LA bonne tuile (signe ou nombre) parmi
	// des distracteurs vers l'emplacement `@` de la question. Réponse = `answer`.
	| { type: 'tuilesNombre'; question: string; answer: string; tuiles: string[]; parle?: string }
	// Vocabulaire (#108) — l'enfant range une SUITE de tuiles-mots dans l'ordre
	// alphabétique. `tuiles` = la suite mélangée affichée ; `ordre` = la bonne
	// suite triée (calculée, jamais codée en dur). Mono-mode (runner dédié).
	// `nature` (#448) dit CE QU'ON RANGE (des mots, ou des nombres — numération CE2
	// « je range ») : le widget, l'aide contextuelle et le repli texte du catalogue en
	// dérivent leur formulation et leur séparateur. Absent = 'mots' (comportement #108).
	| {
			type: 'tuilesOrdre';
			question: string;
			tuiles: string[];
			ordre: string[];
			nature?: NatureOrdre;
			parle?: string;
	  }
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
	// Vocabulaire (#392) — appariement : l'enfant RELIE chaque mot de la colonne
	// gauche à son correspondant de la colonne droite (familles de mots : mot de
	// base ↔ dérivé). `paires` porte les correspondances CORRECTES ; l'ordre des
	// deux colonnes est mélangé à l'affichage (jamais aligné). `intrus` = mots en
	// trop côté droite, sans correspondance (décoys, neutralise la réussite par
	// élimination). Corrigé par son runner (ui/lecon-appariement.ts), lien par lien.
	| {
			type: 'appariement';
			question: string;
			paires: { gauche: string; droite: string }[];
			intrus?: string[];
			parle?: string;
	  }
	// Grammaire (#259) — « Clique sur le mot » : l'enfant lit une phrase découpée en
	// TOKENS (mots + ponctuation) et SÉLECTIONNE le(s) mot(s) répondant à la consigne
	// (1re leçon : le verbe conjugué — 1 mot aux temps simples, 2 au passé composé :
	// auxiliaire + participe). `tokens` = la phrase mot à mot ; les tokens de
	// PONCTUATION (repérés par `estPonctuation`) ne sont pas cliquables. `cibleIndices`
	// = l'ensemble EXACT des indices attendus, STOCKÉ à la génération (jamais recalculé
	// au check ; le runner ui/lecon-clic-mot.ts compare par ÉGALITÉ D'ENSEMBLES). Hors
	// sprint. `consigne` = tâche visible + persistante ; `explication` = justification
	// courte affichée après « Vérifier » ; `parle` = phrase entière lue à voix haute.
	// `cibleLabel` (#437) NOMME la cible au singulier avec son article (« le verbe
	// conjugué », « l'article », « le nom noyau », « la conjonction de coordination »…) :
	// il alimente les aria-labels de correction du runner (« c'était ${cibleLabel} ») et
	// le repli non interactif du catalogue (« Recopie ${cibleLabel} : … »). Absent ⇒ repli
	// générique (« la bonne réponse »).
	| {
			type: 'clicMot';
			tokens: string[];
			cibleIndices: number[];
			consigne: string;
			explication: string;
			parle: string;
			cibleLabel?: string;
	  }
	// Droite graduée (#256) — l'enfant PLACE un repère sur la graduation qui correspond
	// à la valeur cible (numération grands nombres, nombres décimaux). Interaction : une
	// portion de droite graduée aimantée (chaque graduation = un choix), runner d'écran
	// dédié (ui/lecon-droite-graduee.ts) qui s'auto-corrige. `min`/`max`/`pas` fixent la
	// fenêtre et le pavage ; `graduations` = TOUTES les graduations sélectionnables (valeur
	// + libellé formaté, pour l'axe et les aria-labels) ; `bornes` = le sous-ensemble
	// NUMÉROTÉ (traits renforcés + libellé) ; `cible` = la valeur à placer (STOCKÉE, ∈
	// graduations), `cibleLabel` son libellé formaté. `consigne` = tâche persistante,
	// `explication` = justification après correction, `parle` = énoncé lu. Hors sprint. Le
	// `check()` renvoie false (le runner corrige par égalité `graduation choisie === cible`).
	| {
			type: 'droiteGraduee';
			min: number;
			max: number;
			pas: number;
			graduations: { valeur: number; label: string }[];
			bornes: { valeur: number; label: string }[];
			cible: number;
			cibleLabel: string;
			consigne: string;
			explication: string;
			parle: string;
	  }
	// Calcul posé (#97) — opération en colonnes ; le catalogue en fait un Item
	// `posed` (cellules-chiffres notées une à une). Pas de champ `answer` unique.
	| { type: 'posed'; op: '+' | '-' | 'x'; a: number; b: number }
	// Tableau de conversion (#394) — 2ᵉ mode des leçons de mesures : une colonne par
	// unité, l'enfant place un chiffre par case (zéros de transit compris) via un pavé
	// externe. Runner dédié (ui/lecon-tableau.ts), corrigé cellule par cellule comme
	// `posed` : pas de réponse texte unique. `question` porte l'énoncé (consigne / TTS,
	// même forme que la saisie) ; `answer` la valeur cible (révélation / filet). Les
	// colonnes vont TOUJOURS de la grande à la petite unité (ordre spatial stable, avis
	// dys). `virguleApres` = index de colonne après laquelle poser la virgule fixe
	// (absent = conversion entière) ; stocké même si la virgule reste posée par l'app en
	// v1, pour ouvrir une saisie de la virgule sans refonte (#394).
	| {
			type: 'tableauConversion';
			question: string;
			answer: string;
			answerUnit: string; // unité cible (celle du champ) — source unique, évite de re-parser `question`
			colonnes: TableauColonne[];
			virguleApres?: number;
			parle?: string;
	  }
	// Résolution de problèmes (#199) — énoncé textuel + 1 sous-question (problème
	// simple) ou 2 (deux étapes, « chunking » ; ou résultat + reste d'une division
	// par le sens, #95). Chaque étape a sa réponse numérique, corrigée indépendamment.
	// Runner dédié (ui/lecon-probleme.ts) ; `parle` = énoncé complet lu à voix haute
	// (jamais la réponse). `figure` (#95) = situation de départ optionnelle. Hors sprint.
	// `explication` (#252) = stratégie affichée APRÈS la réponse (ex. le « pont » d'un
	// calcul de durée avec retenue). Optionnelle : absente = feedback inchangé.
	| {
			type: 'probleme';
			enonce: string;
			etapes: ProblemeEtape[];
			parle: string;
			figure?: string;
			explication?: string;
	  }
	// Orthographe — interactions réutilisables (vérifiées comme du texte) :
	| { type: 'motCache'; answer: string } // affiche/masque le mot puis saisie
	| { type: 'tuiles'; answer: string; lettres: string[] } // lettres mélangées à ordonner
	| { type: 'dictee'; answer: string; commeDans?: string }; // rien d'affiché, lu en TTS

/** Mode d'entraînement, pour les types d'exercices qui en proposent plusieurs. */
export type ExerciseMode = string;

/** Étiquette déclarative du format d'un `ExerciseType` (#348) pour les formats à
 *  runner d'écran dédié, incompatibles avec le sprint « une réponse à la fois » :
 *  opération posée (#97), rangement d'une suite (#108), tri par thème (#114),
 *  résolution de problèmes (#199), appariement (#392), « clique sur le mot » (#259).
 *  Sert à classer une leçon
 *  SANS appeler `generate()` (qui consomme l'aléatoire global). Absent = format
 *  standard (texte/QCM) éligible au sprint. Doit refléter le `type` que produit
 *  le `generate()` par défaut (sans mode) — invariant vérifié en test. */
export type ExerciseKind =
	'posed' | 'tuilesOrdre' | 'tuilesTri' | 'probleme' | 'appariement' | 'clicMot' | 'droiteGraduee';

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
	/** Tire une SESSION ENTIÈRE d'exercices en un seul appel (correctif des répétitions
	 *  de « Familles de mots à relier »). Réservé aux formats à runner MULTI-MANCHES qui
	 *  veulent garantir une propriété GLOBALE de la session — ici : aucune répétition
	 *  inter-manches. `count` = nombre de manches souhaitées. Optionnel : absent ⇒ le
	 *  runner retombe sur des `generate()` indépendants (comportement historique). Quand
	 *  il est présent, la garantie de non-répétition est portée par la fabrique, pas par
	 *  le runner (qui reste agnostique de la banque). */
	generateSession?(count: number, opts?: GenerateOpts): Exercise[];
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
	// Le calcul posé (corrigé cellule par cellule), le rangement d'une suite (#108),
	// le tri par thème (#114), l'appariement (#392) et « clique sur le mot » (#259) —
	// corrigés par leur runner — n'ont pas de réponse texte unique : ils ne passent
	// jamais par cette vérification générique.
	if (
		exercise.type === 'posed' ||
		exercise.type === 'tuilesOrdre' ||
		exercise.type === 'tuilesTri' ||
		exercise.type === 'probleme' ||
		exercise.type === 'tableauConversion' ||
		exercise.type === 'appariement' ||
		exercise.type === 'clicMot' ||
		exercise.type === 'droiteGraduee' ||
		exercise.type === 'qcmMulti'
	)
		return false;
	const normalized = normalizeText(input);
	if (normalized === normalizeText(exercise.answer)) return true;
	if (exercise.type === 'text') {
		return (exercise.answers ?? []).some((a) => normalizeText(a) === normalized);
	}
	return false;
}
