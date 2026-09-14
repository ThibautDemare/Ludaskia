/* ============================================================
   Calcudoku (#667) — le RUNNER.

   Jeu de l'étagère : il ne corrige rien, ne note rien, n'alimente aucun
   compteur. Aucun chronomètre ni compte de coups (critère 46), aucun score
   (critère 47), aucun appel à `capterErreur` (critère 53) — un conflit de cage
   est transitoire et l'enfant le défait lui-même, ce n'est pas une erreur
   d'apprentissage à faire remonter au parent. Et rien ici ne lit la classe du
   profil (critère 3) : deux enfants de classes différentes voient le même jeu.

   Le moteur, le tirage et la persistance sont purs et vivent dans
   `core/jeux/` : ici, uniquement l'interface. Le runner ne RÉSOUT jamais la
   grille — pas de solveur, donc rien qui puisse souffler une case (critère 52) ;
   la fin de partie se lit sur `grilleTerminee`.

   ── Le geste, repris du sudoku (critères 18, 19) ────────────────────────────

   On pose en DEUX TEMPS : appui sur la case, puis appui sur le nombre dans un
   bandeau situé HORS de la grille. Jamais de glissé, et la palette est FIXE :
   une palette qui surgirait au point de contact serait masquée par le doigt qui
   vient de la déclencher. Effacer est un BOUTON explicite, ni double appui ni
   appui long, dont la fenêtre de temps est trop stricte à cet âge.

   ── La zone de phrase, pièce centrale du rendu (critères 16, 17) ────────────

   Le symbole d'une cage tient en deux caractères et ne s'explique pas de
   lui-même — « ↔ » moins que les autres. Une zone de texte TOUJOURS présente,
   sous la règle du jeu, dit l'objectif de la cage touchée en toutes lettres, et
   `PHRASE_DEFAUT` quand rien n'est sélectionné. Sa hauteur est figée par la
   feuille de style : une mise en page qui sauterait à chaque appui serait pire
   que le problème qu'elle corrige. Le jeu n'ayant qu'une seule taille, elle
   occupe la place que le sudoku donne à ses boutons de taille.

   ── Les cases données sont sélectionnables, mais pas inscriptibles ───────────

   Un `<button>` qui ne fait rien est un bouton mort. Toucher une case donnée n'y
   écrit rien (`poser` le refuse de toute façon) mais allume sa ligne, sa colonne
   et sa cage, et affiche l'objectif de celle-ci : c'est précisément sur ces
   cases-là que l'enfant s'appuie pour déduire.
   ============================================================ */
import { attribut, drapeau, html, joindre, VIDE, type SafeHtml } from '../core/html';
import { randFloat } from '../core/utils';
import {
	COTE,
	PHRASE_DEFAUT,
	cageDe,
	caseTutorielle,
	casesLiees,
	conflitsCalcudoku,
	estFixe,
	grilleTerminee,
	libelleCage,
	phraseCage,
	poser,
	tirerGrille,
	type Cage,
	type Partie,
} from '../core/jeux/calcudoku';
import {
	dejaInitie,
	effacerPartie,
	marquerInitie,
	partieEnCours,
	sauverPartie,
} from '../core/jeux/calcudoku-etat';
import { aidesJeuxActives } from '../core/profiles';
import { dicteeDisponible, dicterConsigne } from './tts';
import { enregistrerJeu, type RunnerJeu } from './jeux-ecran';
import { bascule } from './jeux-dom';

/** La RÈGLE DU JEU, jamais « la consigne » : ce mot appartient au registre de
    l'exercice et contribue à faire lire le jeu comme du travail déguisé.

    DEUX phrases courtes, chacune ouverte par un verbe conjugué, et non une seule
    à subordonnée : la contrainte de ligne-colonne et celle de cage sont de
    natures différentes, et les empiler faisait 21 mots d'un trait — à une
    fluence d'environ 90 mots par minute en CE2, cela coûte cher avant même de
    jouer. Le mot « cage » y est employé sans être défini, et c'est volontaire :
    la zone de phrase le définit en situation, dès le premier appui. */
const REGLE =
	'Place les nombres de 1 à 4 une seule fois par ligne et par colonne. Respecte aussi l’objectif de chaque cage.';

/** Le refus d'un appui sur un nombre alors qu'aucune case n'est choisie. Il
    s'affiche dans la ZONE DE PHRASE, qui est visible : le dire seulement dans la
    zone `sr-only` laissait un enfant voyant, ou un utilisateur clavier sans
    lecteur d'écran, appuyer sans rien voir bouger — ce qui se lit comme une
    application cassée. */
const REFUS_SANS_CASE = 'Touche d’abord une case.';

/** Le panneau de panne (critère 7). `tirerGrille` rend `null` quand son budget
    d'essais est épuisé — l'événement est d'une probabilité dérisoire, mais une
    grille vide ou un écran figé serait sans issue pour l'enfant, qui n'a aucun
    moyen de comprendre ce qui vient de se passer. */
const PANNE_TITRE = 'La grille n’a pas pu être préparée.';
const PANNE_TEXTE = 'Ce n’est pas de ta faute. Touche le bouton pour réessayer.';

/* ---------- Le balisage ---------- */

/** L'étiquette du coin de la case-repère : `libelleCage` donne le nombre puis le
    symbole, même grammaire pour les trois opérations. Elle est en encre neutre
    et non dans la teinte de l'opération — le texte reste ainsi lisible partout,
    et la couleur porte le CONTOUR, en renfort du symbole et jamais seule. */
function etiquetteHTML(c: Cage): SafeHtml {
	return html`<span class="calcudoku-etiquette" aria-hidden="true">${libelleCage(c)}</span>`;
}

/** L'objectif de la cage EN MOTS, pour le libellé accessible d'une case.

    Jamais le glyphe : `libelleCage` rend « 3↔ », qui se prononce au mieux « 3 »
    et au pire « 3 flèche gauche droite ». Or le contour de cage, qu'un enfant
    voyant embrasse d'un coup d'œil, n'existe pas au lecteur d'écran : sans cet
    ajout, l'objectif ne s'obtient qu'en ACTIVANT chaque case une à une.

    Forme COURTE, et c'est la contrainte dimensionnante : ce fragment est relu à
    chacune des seize cases pendant un balayage, là où `phraseCage` est une
    phrase complète lue une seule fois, à la demande, dans la zone de phrase.
    Aucun identifiant de cage n'est ajouté : la ligne et la colonne, déjà dans le
    libellé, situent la case, et deux cages de même objectif ne se confondent pas
    puisqu'on ne les parcourt jamais qu'une case à la fois.

    L'ÉTENDUE est dite, elle, et ces trois mots ne sont pas négociables : « 7 »
    ne se répartit pas de la même façon sur deux cases ou sur quatre, et connaître
    l'objectif sans savoir sur combien de cases le répartir le rend inutilisable.
    C'est le complément du contour, que le voyant lit d'un regard. Reste un angle
    mort assumé : le libellé dit COMBIEN de cases, jamais LESQUELLES. Les nommer
    demanderait une liste de positions dans un fragment relu seize fois. Une cage
    faisant 2 à 4 cases (critère 10), le pluriel est toujours juste. */
function objectifParle(c: Cage): string {
	const etendue = `cage de ${c.cases.length} cases`;
	if (c.operation === 'somme') return `${etendue} : additionner pour ${c.objectif}`;
	if (c.operation === 'produit') return `${etendue} : multiplier pour ${c.objectif}`;
	return `${etendue} : différence de ${c.objectif}`;
}

/** Le libellé accessible d'une case, en un seul endroit : le balisage initial et
    le repeint doivent dire exactement la même chose. */
function libelleCase(p: Partie, index: number, valeur: number): string {
	const x = index % COTE;
	const y = Math.floor(index / COTE);
	const cage = cageDe(p, index);
	const contenu = valeur === 0 ? 'vide' : String(valeur);
	return `ligne ${y + 1}, colonne ${x + 1}, ${contenu}${cage ? `, ${objectifParle(cage)}` : ''}`;
}

/** Une case. Une cage est un polyomino : les deux attributs de bord du sudoku ne
    suffisent pas, il en faut QUATRE pour fermer le contour de chaque côté. Le
    contour est le signal de cage — jamais un aplat de fond, qui se cumulerait
    avec la mise en évidence de la ligne et de la colonne et donnerait une
    troisième teinte imprévisible. */
function caseHTML(p: Partie, index: number): SafeHtml {
	const x = index % COTE;
	const y = Math.floor(index / COTE);
	const cage = cageDe(p, index);
	const memeCage = (voisine: number): boolean => !!cage && cage.cases.includes(voisine);
	const traitHaut = y === 0 || !memeCage(index - COTE);
	const traitBas = y === COTE - 1 || !memeCage(index + COTE);
	const traitGauche = x === 0 || !memeCage(index - 1);
	const traitDroit = x === COTE - 1 || !memeCage(index + 1);
	return html`<button
		type="button"
		class="calcudoku-case"
		data-index="${index}"
		data-valeur="0"
		${cage ? attribut('data-operation', cage.operation) : VIDE}
		${estFixe(p, index) ? attribut('data-fixe', '1') : VIDE}
		${traitHaut ? attribut('data-trait-h', '1') : VIDE}
		${traitDroit ? attribut('data-trait-d', '1') : VIDE}
		${traitBas ? attribut('data-trait-b', '1') : VIDE}
		${traitGauche ? attribut('data-trait-g', '1') : VIDE}
		aria-label="${libelleCase(p, index, p.valeurs[index] ?? 0)}"
	>
		${cage && cage.cases[0] === index ? etiquetteHTML(cage) : VIDE}
		<span class="calcudoku-valeur" aria-hidden="true"></span>
	</button>`;
}

function nombreHTML(valeur: number): SafeHtml {
	return html`<button
		type="button"
		class="calcudoku-nombre"
		data-valeur="${valeur}"
		aria-label="poser le nombre ${valeur}"
	>
		${valeur}
	</button>`;
}

function plateauHTML(): SafeHtml {
	return html`<div class="calcudoku">
		<p class="calcudoku-regle" id="calcudokuRegle">${REGLE}</p>
		<button type="button" class="calcudoku-ecouter" id="calcudokuEcouterRegle" ${drapeau('hidden')}>
			🔊 Écouter la règle
		</button>
		<p
			class="calcudoku-phrase"
			id="calcudokuPhrase"
			role="status"
			aria-live="polite"
			aria-atomic="true"
		>
			${PHRASE_DEFAUT}
		</p>
		<div class="calcudoku-jeu" id="calcudokuJeu">
			<div
				class="calcudoku-grille"
				id="calcudokuGrille"
				role="group"
				aria-label="Grille du calcudoku"
			></div>
			<div class="calcudoku-palette" id="calcudokuPalette" role="group" aria-label="Nombres à poser">
				${joindre([...Array(COTE).keys()].map((k) => nombreHTML(k + 1)))}
				<button type="button" class="calcudoku-effacer" id="calcudokuEffacer">Effacer</button>
			</div>
		</div>
		<div class="calcudoku-actions" id="calcudokuActions">
			<button type="button" class="calcudoku-doux" id="calcudokuRecommencer">
				Recommencer cette grille
			</button>
		</div>
		<div class="calcudoku-fin" id="calcudokuFin" ${drapeau('hidden')}>
			<p class="calcudoku-fin-titre">Grille terminée !</p>
			<button type="button" class="calcudoku-nouvelle" id="calcudokuNouvelle">Nouvelle grille</button>
		</div>
		<div class="calcudoku-panne" id="calcudokuPanne" ${drapeau('hidden')}>
			<p class="calcudoku-panne-titre">${PANNE_TITRE}</p>
			<p class="calcudoku-panne-texte">${PANNE_TEXTE}</p>
			<button type="button" class="calcudoku-nouvelle" id="calcudokuReessayer">Réessayer</button>
		</div>
		<p
			class="sr-only calcudoku-annonce"
			id="calcudokuAnnonce"
			role="status"
			aria-live="polite"
			aria-atomic="true"
		></p>
	</div>`;
}

/* ---------- Le runner ---------- */

/** Ce que rend un chargement : une grille prête, un refus du plafond (l'écran se
    referme de lui-même), ou une panne de tirage à afficher. */
type Chargement = 'grille' | 'refus' | 'panne';

function creerRunner(): RunnerJeu {
	let partie: Partie | null = null;
	let caseChoisie: number | null = null;
	let tutoriel = false;
	let racine: HTMLElement | null = null;
	/* Défaut à `null`, donc `?.()` rend `undefined`, donc REFUS. Un runner qui
	   oublierait de câbler ce rappel ne vérifierait plus le plafond du jour, et
	   cette panne-là est invisible : un bouton mort se voit, un plafond mort non. */
	let avantNouvellePartie: (() => boolean) | null = null;

	const dans = <T extends HTMLElement>(sel: string): T | null =>
		racine ? racine.querySelector<T>(sel) : null;

	const annoncer = (texte: string): void => {
		const el = dans('#calcudokuAnnonce');
		if (el) el.textContent = texte;
	};

	/** Construit les seize cases. Appelé au montage et à chaque grille neuve —
	    jamais à chaque coup : `peindre` ne fait que déplacer des attributs, ce qui
	    préserve le focus de l'enfant. */
	const construire = (): void => {
		const p = partie;
		const grille = dans('#calcudokuGrille');
		if (!p || !grille) return;
		grille.innerHTML = joindre([...Array(COTE * COTE).keys()].map((i) => caseHTML(p, i))).balisage;
	};

	/** Repeint l'état : valeurs, signalements, cases liées, cage touchée, phrase,
	    panneau de fin.

	    Les deux mises en évidence sont soumises à `aidesJeuxActives()`, comme chez
	    le sudoku : un surlignage permanent peut devenir lui-même un distracteur
	    pour un profil TDAH, et un enfant plus avancé peut vouloir jouer sans
	    filet. Le réglage ne fait que RETIRER l'aide, jamais l'imposer. Le contour
	    de cage et la phrase, eux, ne sont pas des aides : ce sont la règle du jeu,
	    et ils restent toujours là. */
	const peindre = (): void => {
		const p = partie;
		if (!p || !racine) return;
		const aides = aidesJeuxActives();
		/* Le signalement est symétrique par construction : `conflitsCalcudoku` rend
		   TOUTES les cases en cause. Marquer la seule dernière posée désignerait
		   laquelle est « la mauvaise », ce que le jeu ne sait pas. */
		const signales = aides ? conflitsCalcudoku(p) : new Set<number>();
		const liees = aides && caseChoisie !== null ? casesLiees(caseChoisie) : new Set<number>();
		const cageTouchee = caseChoisie === null ? undefined : cageDe(p, caseChoisie);

		for (const el of racine.querySelectorAll<HTMLElement>('.calcudoku-case')) {
			const i = Number(el.dataset.index);
			const v = p.valeurs[i] ?? 0;
			el.dataset.valeur = String(v);
			const valeur = el.querySelector<HTMLElement>('.calcudoku-valeur');
			if (valeur) valeur.textContent = v === 0 ? '' : String(v);
			el.setAttribute('aria-label', libelleCase(p, i, v));
			el.classList.toggle('sel', i === caseChoisie);
			bascule(el, 'data-conflit', signales.has(i));
			bascule(el, 'data-lie', liees.has(i));
			/* La cage entière se signale par le TRAIT, jamais par un second fond :
			   ses cases sont par construction aussi sur la ligne et la colonne de la
			   case touchée, donc deux fonds translucides s'empileraient. */
			bascule(el, 'data-cage-sel', cageTouchee?.cases.includes(i) === true);
		}

		const phrase = dans('#calcudokuPhrase');
		if (phrase) phrase.textContent = cageTouchee ? phraseCage(cageTouchee) : PHRASE_DEFAUT;
		const fin = dans('#calcudokuFin');
		if (fin) fin.hidden = !grilleTerminee(p);
	};

	/** Montre ou cache le panneau de panne, et avec lui tout le plateau : une
	    grille vide à côté d'un message de panne inviterait à jouer dans le vide. */
	const montrerPanne = (panne: boolean): void => {
		for (const [sel, cache] of [
			['#calcudokuPanne', !panne],
			['#calcudokuJeu', panne],
			['#calcudokuActions', panne],
		] as const) {
			const el = dans(sel);
			if (el) el.hidden = cache;
		}
	};

	/** Le tirage seul, sans repasser par le plafond. Sert aussi au bouton du
	    panneau de panne : le plafond a déjà été consulté et a accordé la partie,
	    or aucune grille n'a été servie — la redemander la ferait payer deux fois
	    pour rien. */
	const tirer = (): Chargement => {
		/* Critère 32 : la toute première grille du profil est un cas d'exemple, une
		   seule fois pour le profil entier. */
		const premiere = !dejaInitie();
		const p = tirerGrille(randFloat, premiere);
		if (!p) {
			partie = null;
			return 'panne';
		}
		partie = p;
		tutoriel = premiere;
		if (premiere) marquerInitie();
		sauverPartie(p);
		return 'grille';
	};

	/** Reprend la grille laissée en cours, ou en tire une neuve.

	    Le plafond n'est consulté que pour une grille NEUVE : reprendre n'est pas
	    commencer une partie, et l'écran ne s'ouvre de toute façon pas quand le
	    plafond est épuisé. */
	const charger = (): Chargement => {
		tutoriel = false;
		const reprise = partieEnCours();
		if (reprise) {
			partie = reprise;
			return 'grille';
		}
		if (!avantNouvellePartie?.()) return 'refus';
		return tirer();
	};

	/** Rend l'état complet après un changement de grille. */
	const rendreEtat = (annonce: string): void => {
		const p = partie;
		if (!p) return;
		montrerPanne(false);
		construire();
		/* Le choix de la case du tutoriel est PUR : il vit dans `core`, où Vitest
		   l'atteint (voir `caseTutorielle`). Son `null` veut dire « aucune case
		   libre », donc aucune présélection. */
		caseChoisie = tutoriel ? caseTutorielle(p) : null;
		peindre();
		annoncer(annonce);
	};

	/** Pose ou efface, puis sauve. La sauvegarde est à CHAQUE coup, pas à la
	    sortie : le plafond peut tomber et l'onglet peut se fermer. */
	const jouer = (valeur: number): void => {
		const p = partie;
		if (!p || caseChoisie === null || estFixe(p, caseChoisie)) return;
		partie = poser(p, caseChoisie, valeur);
		if (grilleTerminee(partie)) {
			/* Terminer LIBÈRE l'emplacement : la partie suivante repart d'une grille
			   neuve. La fin est un panneau calme dans le plateau, sans confettis ni
			   modale — un jeu de l'étagère n'alimente aucune économie, donc il
			   n'emprunte pas le traitement d'une fin de leçon. */
			effacerPartie();
			peindre();
			annoncer('Grille terminée.');
			dans<HTMLButtonElement>('#calcudokuNouvelle')?.focus();
			return;
		}
		sauverPartie(partie);
		peindre();
	};

	/** Recommencer LA MÊME grille. Toujours visible, jamais conditionné à une
	    détection de blocage : l'enfant n'a pas à démontrer qu'il est coincé pour
	    avoir une porte de sortie. Ce n'est pas une partie NEUVE, donc le plafond
	    n'est pas consulté. */
	const recommencer = (): void => {
		const p = partie;
		if (!p) return;
		partie = { cages: p.cages, enonce: [...p.enonce], valeurs: [...p.enonce] };
		sauverPartie(partie);
		caseChoisie = null;
		peindre();
		annoncer('Grille remise à zéro.');
	};

	const apresChargement = (etat: Chargement, annonce: string): void => {
		if (etat === 'panne') {
			montrerPanne(true);
			annoncer(PANNE_TITRE);
			dans<HTMLButtonElement>('#calcudokuReessayer')?.focus();
			return;
		}
		if (etat === 'refus') return;
		rendreEtat(annonce);
	};

	const nouvelleGrille = (): void => {
		effacerPartie();
		apresChargement(charger(), 'Nouvelle grille.');
		dans<HTMLButtonElement>('.calcudoku-case:not([data-fixe])')?.focus();
	};

	const surClic = (e: MouseEvent): void => {
		const cible = e.target as HTMLElement | null;
		if (!cible) return;

		if (cible.closest('#calcudokuReessayer')) {
			apresChargement(tirer(), 'Nouvelle grille.');
			return;
		}
		if (!partie) return;

		const bCase = cible.closest<HTMLElement>('.calcudoku-case');
		if (bCase) {
			/* On sélectionne, on ne bascule PAS : après une pose la case reste
			   choisie, et l'enfant la retouche justement pour dire « c'est celle-là
			   que je veux effacer ». Une bascule rendrait « Effacer » muet. */
			caseChoisie = Number(bCase.dataset.index);
			/* Toucher une case SÉLECTIONNE et n'écrit jamais : ce geste sert aussi à
			   REGARDER sa ligne, sa colonne et l'objectif de sa cage. Un enfant qui
			   explore la grille la remplirait sans le vouloir. */
			peindre();
			return;
		}

		const bNombre = cible.closest<HTMLElement>('.calcudoku-nombre');
		if (bNombre) {
			if (caseChoisie === null) {
				/* Le refus s'écrit dans la zone de phrase, VISIBLE, et pas seulement
				   dans l'annonce `sr-only`. Rien d'utile n'est écrasé : aucune case
				   n'est choisie, donc la zone n'affiche que `PHRASE_DEFAUT`, et le
				   prochain `peindre` la rétablit dès que l'enfant touche une case.
				   Elle porte `role="status"` et `aria-live`, donc le lecteur d'écran
				   l'entend aussi — doubler avec `annoncer` la ferait lire deux fois. */
				const zone = dans('#calcudokuPhrase');
				if (zone) zone.textContent = REFUS_SANS_CASE;
				return;
			}
			jouer(Number(bNombre.dataset.valeur));
			return;
		}

		/* Effacer est un BOUTON explicite : ni double appui, ni appui long. */
		if (cible.closest('#calcudokuEffacer')) {
			jouer(0);
			return;
		}
		if (cible.closest('#calcudokuRecommencer')) {
			recommencer();
			return;
		}
		if (cible.closest('#calcudokuNouvelle')) {
			nouvelleGrille();
			return;
		}
		/* La règle ne se lit QUE sur demande, même quand la lecture automatique des
		   consignes est activée : contrairement à un énoncé d'exercice, elle ne
		   change jamais d'une grille à l'autre. */
		if (cible.closest('#calcudokuEcouterRegle')) dicterConsigne(REGLE);
	};

	return {
		monter(hote, demanderPartie) {
			avantNouvellePartie = demanderPartie;
			hote.innerHTML = plateauHTML().balisage;
			racine = hote.querySelector<HTMLElement>('.calcudoku');
			racine?.addEventListener('click', surClic);
			const ecouter = dans('#calcudokuEcouterRegle');
			if (ecouter && dicteeDisponible()) ecouter.hidden = false;
			apresChargement(charger(), 'Grille de calcudoku.');
		},
		demonter() {
			racine?.removeEventListener('click', surClic);
			/* Une grille abandonnée est déjà sauvée : `jouer` écrit à chaque coup, ce
			   qui la rend robuste au plafond qui tombe et à l'onglet qu'on ferme. */
			racine = null;
			partie = null;
			caseChoisie = null;
			tutoriel = false;
			avantNouvellePartie = null;
		},
	};
}

/* L'id est écrit EN CLAIR, pas rangé dans une constante : deux gates lisent ce
   fichier au motif « nom de la fonction, puis l'id entre apostrophes » pour le
   rattacher au catalogue et à sa spec Playwright, et une constante y passerait
   pour un id vide. */
enregistrerJeu('calcudoku', creerRunner);
