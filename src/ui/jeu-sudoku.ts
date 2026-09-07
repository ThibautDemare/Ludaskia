/* ============================================================
   Sudoku (#666) — le RUNNER.

   Jeu-REFUGE : aucune compétence déclarée, aucune dépendance à la classe du
   profil (critère 20), rien qui alimente l'économie (critère 34), aucun appel à
   `capterErreur` (critère 33) — un jeu ne CORRIGE pas, donc il ne produit pas
   d'erreur à journaliser. Et **aucun score** (critère 29) : tout ce qui pourrait
   en faire office ici serait une mesure de vitesse ou un compte de coups, et le
   critère 28 écarte les deux. Effacer puis reposer est une stratégie de
   raisonnement légitime en sudoku ; la compter pousserait l'enfant à figer son
   premier placement par peur du compteur.

   Le moteur, le tirage et la persistance sont purs et vivent dans
   `core/jeux/` : ici, uniquement l'interface.

   ── Le geste, et pourquoi il est inversé (critères 10, 11) ──────────────────

   On pose en DEUX TEMPS : appui sur la case, puis appui sur la forme dans un
   bandeau situé HORS de la grille. C'est l'inverse de l'ordre des tuiles de
   numération, et c'est délibéré : dans un sudoku, la case cible est justement ce
   que l'enfant cherche, donc tenir une forme « en main » avant de savoir où la
   poser ajoute une charge de mémoire de travail gratuite. Et la palette est
   FIXE, jamais une bulle au point de contact : une palette qui surgit sous le
   doigt qui vient de la déclencher est masquée par ce doigt.

   ── Pas de gestion de clavier maison, et c'est un choix ─────────────────────

   Les cases et les formes sont de vrais `<button>` : la tabulation, l'entrée et
   la barre d'espace suffisent, sans un seul écouteur de touche. Le 2048 et le
   Motus, eux, écoutent `keydown` sur `document` et doivent se garder des champs
   de saisie qui ont le focus ; ce runner n'a pas ce problème parce qu'il n'a pas
   ce code.

   ── Les cases données sont sélectionnables, mais pas inscriptibles ───────────

   Un `<button>` qui ne fait rien est un bouton mort. Toucher une case donnée
   n'y écrit rien (`poser` le refuse de toute façon) mais allume sa ligne, sa
   colonne et sa région : c'est l'aide du critère 16, et elle a du sens
   précisément sur les cases dont l'enfant se sert pour déduire.
   ============================================================ */
import { attribut, brut, drapeau, html, joindre, VIDE, type SafeHtml } from '../core/html';
import { randFloat } from '../core/utils';
import {
	TAILLES,
	casesLiees,
	conflitsSudoku,
	estFixe,
	geometrieSudoku,
	grilleTerminee,
	poser,
	symbolesDe,
	tirerGrille,
	type Partie,
	type TailleSudoku,
} from '../core/jeux/sudoku';
import {
	dejaInitie,
	effacerPartie,
	marquerInitie,
	memoriserTaille,
	partieEnCours,
	sauverPartie,
	tailleChoisie,
} from '../core/jeux/sudoku-etat';
import { aidesJeuxActives } from '../core/profiles';
import { dicteeDisponible, dicterConsigne } from './tts';
import { enregistrerJeu, type RunnerJeu } from './jeux-ecran';

/* Les silhouettes, pleines et monochromes : elles suivent `currentColor`, donc
   nos tokens (critère 7 — jamais une teinte par forme, ce qui pénaliserait deux
   fois un enfant daltonien).

   Elles ne passent PAS par `ui/icon.ts` et c'est volontaire : cette fabrique
   n'expose que la graisse `bold`, donc des contours, là où une silhouette pleine
   se discrimine bien mieux à 35-40 px ; et son fichier de noms interdit
   explicitement de nommer une icône par son dessin, alors qu'une forme de
   sudoku n'a pas d'autre rôle que d'être ce dessin.

   Le sextuor lui-même est arbitré dans `core/jeux/sudoku.ts`, où la raison de
   chaque écart est écrite. Ici, une seule ligne par forme : en changer une reste
   une ligne. */
import cercle from '@phosphor-icons/core/assets/fill/circle-fill.svg?raw';
import carre from '@phosphor-icons/core/assets/fill/square-fill.svg?raw';
import triangle from '@phosphor-icons/core/assets/fill/triangle-fill.svg?raw';
import etoile from '@phosphor-icons/core/assets/fill/star-fill.svg?raw';
import coeur from '@phosphor-icons/core/assets/fill/heart-fill.svg?raw';
import pentagone from '@phosphor-icons/core/assets/fill/pentagon-fill.svg?raw';

const SILHOUETTES: Record<string, string> = {
	cercle,
	carre,
	triangle,
	etoile,
	coeur,
	pentagone,
};

/** Le nom lu par un lecteur d'écran. Accentué, contrairement à l'identifiant. */
const NOMS: Record<string, string> = {
	cercle: 'rond',
	carre: 'carré',
	triangle: 'triangle',
	etoile: 'étoile',
	coeur: 'cœur',
	pentagone: 'pentagone',
};

/** La RÈGLE DU JEU, jamais « la consigne » : ce mot appartient au registre de
    l'exercice et contribue à faire lire le jeu comme du travail déguisé.

    Une seule phrase. À une fluence de lecture d'environ 90 mots par minute en
    CE2, un pavé de règles coûte cher avant même de jouer — et la toute première
    grille étant presque complète (critère 6), l'enfant apprend surtout la règle
    en posant sa première forme.

    Elle porte un VERBE conjugué. « Chaque forme une seule fois par ligne… » était
    grammaticalement valide, et elle faisait porter à un enfant qui découvre le jeu
    la reconstruction du verbe manquant, plus trois compléments en cascade :
    l'ellipse nominale allège l'écrit et alourdit la première lecture, l'inverse de
    ce qu'on cherche sur le texte qui explique la règle. Relevé par
    `redacteur-contenu-francais` le 2026-09-07.

    Et « bloc », pas « région » ni « carré » : le second est déjà pris par une des
    six formes. Le mot ne tient que parce que le bloc est visuellement ancré, ce
    qu'impose le critère 9. */
const REGLE = 'Chaque forme apparaît une seule fois par ligne, par colonne et par bloc.';

const nomDe = (symbole: string): string => NOMS[symbole] ?? symbole;

/* ---------- Le balisage ---------- */

function boutonTailleHTML(taille: TailleSudoku, courante: TailleSudoku): SafeHtml {
	return html`<button
		type="button"
		class="sudoku-taille"
		data-taille="${taille}"
		aria-pressed="${taille === courante ? 'true' : 'false'}"
		aria-label="Grille de taille ${taille} sur ${taille}"
	>
		${taille} × ${taille}
	</button>`;
}

/** Une case. `data-bord-r` / `data-bord-b` marquent les bords de RÉGION, que la
    feuille de style épaissit : la région est la moins intuitive des trois
    contraintes et la plus oubliée (critère 9), donc elle doit se voir et pas se
    déduire. Au 6×6 elle n'est en plus pas carrée, ce qui est un regroupement
    arbitraire dont même un adulte débutant se trompe. */
function caseHTML(p: Partie, index: number): SafeHtml {
	const geo = geometrieSudoku(p.taille);
	const x = index % geo.cotes;
	const y = Math.floor(index / geo.cotes);
	const bordDroit = (x + 1) % geo.regionLargeur === 0 && x + 1 < geo.cotes;
	const bordBas = (y + 1) % geo.regionHauteur === 0 && y + 1 < geo.cotes;
	const fixe = estFixe(p, index);
	return html`<button
		type="button"
		class="sudoku-case"
		data-index="${index}"
		data-valeur="0"
		${fixe ? attribut('data-fixe', '1') : VIDE}
		${bordDroit ? attribut('data-bord-r', '1') : VIDE}
		${bordBas ? attribut('data-bord-b', '1') : VIDE}
		aria-label="vide"
	></button>`;
}

function glypheHTML(symbole: string): SafeHtml {
	return html`<span class="sudoku-glyphe" aria-hidden="true"
		>${brut(SILHOUETTES[symbole] ?? '')}</span
	>`;
}

function symboleHTML(valeur: number, symbole: string): SafeHtml {
	return html`<button
		type="button"
		class="sudoku-symbole"
		data-valeur="${valeur}"
		aria-pressed="false"
		aria-label="${nomDe(symbole)}"
	>
		${glypheHTML(symbole)}
	</button>`;
}

function plateauHTML(taille: TailleSudoku): SafeHtml {
	return html`<div class="sudoku">
		<div class="sudoku-tailles" role="group" aria-label="Taille de la grille">
			${joindre(TAILLES.map((t) => boutonTailleHTML(t, taille)))}
		</div>
		<p class="sudoku-regle" id="sudokuRegle">${REGLE}</p>
		<button type="button" class="sudoku-ecouter" id="sudokuEcouterRegle" hidden>
			🔊 Écouter la règle
		</button>
		<div class="sudoku-jeu">
			<div
				class="sudoku-grille"
				id="sudokuGrille"
				data-cotes="${taille}"
				role="group"
				aria-label="Grille du sudoku"
			></div>
			<div
				class="sudoku-palette"
				id="sudokuPalette"
				role="group"
				aria-label="Formes à poser"
			></div>
		</div>
		<div class="sudoku-actions">
			<button type="button" class="sudoku-doux" id="sudokuRecommencer">
				Recommencer cette grille
			</button>
		</div>
		<div class="sudoku-fin" id="sudokuFin" ${drapeau('hidden')}>
			<p class="sudoku-fin-titre">Grille terminée !</p>
			<button type="button" class="sudoku-nouvelle" id="sudokuNouvelle">Nouvelle grille</button>
		</div>
		<p class="sr-only sudoku-annonce" id="sudokuAnnonce" role="status" aria-live="polite" aria-atomic="true"></p>
	</div>`;
}

/* ---------- Le runner ---------- */

function creerRunner(): RunnerJeu {
	let taille: TailleSudoku = 4;
	let partie: Partie | null = null;
	let caseChoisie: number | null = null;
	let symboleChoisi: number | null = null;
	let racine: HTMLElement | null = null;
	/* Défaut à `null`, donc `?.()` rend `undefined`, donc REFUS. Le contrat de
	   `RunnerJeu` l'exige : un runner qui oublierait de câbler ce rappel ne
	   vérifierait plus le plafond du jour, et cette panne-là est invisible — elle
	   ne lève rien et profite à l'enfant. Un bouton mort se voit, un plafond mort
	   non. */
	let avantNouvellePartie: (() => boolean) | null = null;

	const dans = <T extends HTMLElement>(sel: string): T | null =>
		racine ? racine.querySelector<T>(sel) : null;

	const annoncer = (texte: string): void => {
		const el = dans('#sudokuAnnonce');
		if (el) el.textContent = texte;
	};

	/** Reconstruit grille et palette. Appelé au montage et à chaque changement de
	    taille — jamais à chaque coup : `peindre` ne fait que déplacer des
	    attributs, ce qui préserve le focus de l'enfant. */
	const construire = (): void => {
		const p = partie;
		const grille = dans('#sudokuGrille');
		const palette = dans('#sudokuPalette');
		if (!p || !grille || !palette) return;
		grille.dataset.cotes = String(p.taille);
		grille.innerHTML = joindre(
			[...Array(p.taille * p.taille).keys()].map((i) => caseHTML(p, i)),
		).balisage;
		const formes = symbolesDe(p.taille);
		palette.innerHTML = html`${joindre(formes.map((s, k) => symboleHTML(k + 1, s)))}
			<button type="button" class="sudoku-effacer" id="sudokuEffacer">Effacer</button>`.balisage;
		for (const b of racine?.querySelectorAll<HTMLElement>('.sudoku-taille') ?? []) {
			b.setAttribute('aria-pressed', b.dataset.taille === String(p.taille) ? 'true' : 'false');
		}
	};

	/** Repeint l'état : valeurs, conflits, cases liées, panneau de fin.

	    Les aides des critères 13, 14 et 16 sont soumises à `aidesJeuxActives()`
	    (critère 21) : un surlignage permanent peut devenir lui-même un distracteur
	    pour un profil TDAH, et un enfant plus avancé peut vouloir jouer sans
	    filet. Le réglage ne fait que RETIRER l'aide, jamais l'imposer. */
	const peindre = (): void => {
		const p = partie;
		if (!p || !racine) return;
		const aides = aidesJeuxActives();
		/* Les conflits sont symétriques par construction : `conflitsSudoku` rend
		   TOUTES les cases en cause (critère 13). Marquer la seule dernière posée
		   désignerait laquelle est « la mauvaise », ce que le jeu ne sait pas. */
		const conflits = aides ? conflitsSudoku(p) : new Set<number>();
		const liees =
			aides && caseChoisie !== null ? casesLiees(p.taille, caseChoisie) : new Set<number>();
		const formes = symbolesDe(p.taille);

		for (const el of racine.querySelectorAll<HTMLElement>('.sudoku-case')) {
			const i = Number(el.dataset.index);
			const v = p.valeurs[i] ?? 0;
			el.dataset.valeur = String(v);
			el.innerHTML = html`${v === 0 ? VIDE : glypheHTML(formes[v - 1] ?? '')}`.balisage;
			el.setAttribute('aria-label', v === 0 ? 'vide' : nomDe(formes[v - 1] ?? ''));
			el.classList.toggle('sel', i === caseChoisie);
			if (conflits.has(i)) el.dataset.conflit = '1';
			else delete el.dataset.conflit;
			/* Deux mises en évidence distinctes : les cases contraintes par la
			   SÉLECTION, et les occurrences déjà posées du symbole choisi. Les deux
			   déchargent le repérage spatial sans toucher à la déduction. */
			const memeSymbole = aides && symboleChoisi !== null && v === symboleChoisi;
			if (liees.has(i)) el.dataset.lie = '1';
			else delete el.dataset.lie;
			if (memeSymbole) el.dataset.meme = '1';
			else delete el.dataset.meme;
		}
		for (const b of racine.querySelectorAll<HTMLElement>('.sudoku-symbole')) {
			b.setAttribute('aria-pressed', Number(b.dataset.valeur) === symboleChoisi ? 'true' : 'false');
		}
		const fin = dans('#sudokuFin');
		if (fin) fin.hidden = !grilleTerminee(p);
	};

	/** Charge la grille en cours de cette taille, ou en tire une neuve.

	    Le plafond n'est consulté que pour une grille NEUVE : reprendre n'est pas
	    commencer une partie, et l'écran ne s'ouvre de toute façon pas quand le
	    plafond est épuisé (`jeuOuvrable`). */
	const charger = (t: TailleSudoku): boolean => {
		const reprise = partieEnCours(t);
		if (reprise) {
			partie = reprise;
			taille = t;
			return true;
		}
		if (!avantNouvellePartie?.()) return false;
		/* Critère 6 : la toute première grille du profil est presque complète, et
		   une seule fois pour le profil entier. L'enfant y apprend la règle en
		   posant sa première forme, plutôt qu'en lisant trois contraintes d'un
		   coup. */
		const premiere = !dejaInitie();
		partie = tirerGrille(t, randFloat, premiere);
		taille = t;
		if (premiere) marquerInitie();
		sauverPartie(partie);
		return true;
	};

	const rendreEtat = (annonce: string): void => {
		construire();
		caseChoisie = null;
		symboleChoisi = null;
		peindre();
		annoncer(annonce);
	};

	const changerTaille = (t: TailleSudoku): void => {
		if (!partie || t === partie.taille) return;
		memoriserTaille(t);
		if (!charger(t)) return;
		/* « Grille de taille 4 sur 4 », et pas « Grille 4 sur 4 » : hors contexte, et
		   une annonce vocale est toujours hors contexte, « X sur X » évoque d'abord
		   un score scolaire avant une dimension. Le risque est aggravé précisément
		   parce que ce jeu revendique de ne rien noter — une annonce qui SONNE comme
		   une note contredit tout le dispositif. Relevé par
		   `redacteur-contenu-francais` le 2026-09-07. */
		rendreEtat(`Grille de taille ${t} sur ${t}.`);
	};

	/** Pose ou efface, puis sauve. La sauvegarde est à CHAQUE coup, pas à la
	    sortie : le plafond peut tomber et l'onglet peut se fermer, et avec un
	    plafond par défaut de dix minutes une grille 6×6 se joue en plusieurs
	    fois (critère 17). */
	const jouer = (valeur: number): void => {
		const p = partie;
		if (!p || caseChoisie === null || estFixe(p, caseChoisie)) return;
		partie = poser(p, caseChoisie, valeur);
		if (grilleTerminee(partie)) {
			/* Terminer LIBÈRE l'emplacement : la partie suivante repart d'une grille
			   neuve (critère 19). La fin est un panneau calme dans le plateau, sans
			   confettis ni modale : un jeu de l'étagère n'alimente aucune économie,
			   donc il n'emprunte pas le traitement d'une fin de leçon (critère 36). */
			effacerPartie(partie.taille);
			peindre();
			annoncer('Grille terminée.');
			dans<HTMLButtonElement>('#sudokuNouvelle')?.focus();
			return;
		}
		sauverPartie(partie);
		peindre();
	};

	/** Recommencer LA MÊME grille. Toujours disponible, jamais conditionné à une
	    détection de blocage (critère 12) : deviner informatiquement qu'une grille
	    est devenue insoluble coûte une résolution à chaque coup pour un gain flou,
	    et l'enfant n'a pas à démontrer qu'il est coincé pour avoir une porte de
	    sortie. Ce n'est pas une partie NEUVE, donc le plafond n'est pas consulté. */
	const recommencer = (): void => {
		const p = partie;
		if (!p) return;
		partie = { taille: p.taille, enonce: [...p.enonce], valeurs: [...p.enonce] };
		sauverPartie(partie);
		caseChoisie = null;
		symboleChoisi = null;
		peindre();
		annoncer('Grille remise à zéro.');
	};

	const nouvelleGrille = (): void => {
		if (!partie) return;
		effacerPartie(partie.taille);
		if (!charger(partie.taille)) return;
		rendreEtat('Nouvelle grille.');
		dans<HTMLButtonElement>('.sudoku-case:not([data-fixe])')?.focus();
	};

	const surClic = (e: MouseEvent): void => {
		const cible = e.target as HTMLElement | null;
		if (!cible || !partie) return;

		const bTaille = cible.closest<HTMLElement>('.sudoku-taille');
		if (bTaille) {
			const t = Number(bTaille.dataset.taille);
			if (TAILLES.some((x) => x === t)) changerTaille(t as TailleSudoku);
			return;
		}

		const bCase = cible.closest<HTMLElement>('.sudoku-case');
		if (bCase) {
			const i = Number(bCase.dataset.index);
			/* On sélectionne, on ne bascule PAS. Une bascule paraissait inoffensive
			   et rendait « Effacer » muet : après une pose la case reste choisie,
			   l'enfant la retouche pour dire « c'est celle-là que je veux effacer »,
			   et ce geste la désélectionnait. Le bouton ne faisait alors plus rien.
			   Désélectionner n'apporte rien à l'enfant de toute façon : la mise en
			   évidence est une aide, pas un mode dont il faudrait sortir. */
			caseChoisie = i;
			/* Toucher une case SÉLECTIONNE, et n'écrit jamais — même quand une forme
			   est déjà choisie. Le raccourci « une forme choisie se pose au premier
			   appui sur une case » était commode pour enchaîner, et il défaisait
			   l'aide du critère 16 : cette aide invite justement à toucher une case
			   pour REGARDER sa ligne, sa colonne et son bloc, or le même geste
			   écrivait. Un enfant qui explore la grille la remplissait sans le
			   vouloir. Le critère 10 décrit d'ailleurs l'ordre inverse : appui sur la
			   case, PUIS appui sur la forme. */
			peindre();
			return;
		}

		const bSymbole = cible.closest<HTMLElement>('.sudoku-symbole');
		if (bSymbole) {
			const v = Number(bSymbole.dataset.valeur);
			/* Une case est choisie : on POSE, toujours, sans jamais basculer. La
			   bascule cassait le cas le plus courant d'un sudoku — poser la MÊME
			   forme dans une deuxième case. Le deuxième appui sur la forme la
			   désélectionnait au lieu de l'écrire, et il ne se passait rien.

			   Sans case choisie, l'appui ne sert qu'à éclairer les occurrences déjà
			   posées de cette forme (critère 16) : là, la bascule a du sens, c'est
			   ainsi qu'on éteint la mise en évidence. */
			if (caseChoisie !== null) {
				symboleChoisi = v;
				jouer(v);
			} else {
				symboleChoisi = symboleChoisi === v ? null : v;
				peindre();
			}
			return;
		}

		/* Effacer est un BOUTON explicite : ni double appui, ni appui long, dont la
		   fenêtre de temps est trop stricte à cet âge (critère 11). */
		if (cible.closest('#sudokuEffacer')) {
			jouer(0);
			return;
		}
		if (cible.closest('#sudokuRecommencer')) {
			recommencer();
			return;
		}
		if (cible.closest('#sudokuNouvelle')) {
			nouvelleGrille();
			return;
		}
		/* La règle ne se lit QUE sur demande, même quand la lecture automatique des
		   consignes est activée (critère 23) : contrairement à un énoncé
		   d'exercice, elle ne change jamais d'une grille à l'autre. */
		if (cible.closest('#sudokuEcouterRegle')) dicterConsigne(REGLE);
	};

	return {
		monter(hote, demanderPartie) {
			avantNouvellePartie = demanderPartie;
			taille = tailleChoisie();
			hote.innerHTML = plateauHTML(taille).balisage;
			racine = hote.querySelector<HTMLElement>('.sudoku');
			racine?.addEventListener('click', surClic);
			const ecouter = dans('#sudokuEcouterRegle');
			if (ecouter && dicteeDisponible()) ecouter.hidden = false;
			if (!charger(taille)) return;
			rendreEtat(`Grille de taille ${taille} sur ${taille}.`);
		},
		demonter() {
			racine?.removeEventListener('click', surClic);
			/* Une grille abandonnée est déjà sauvée : `jouer` écrit à chaque coup, ce
			   qui la rend robuste au plafond qui tombe et à l'onglet qu'on ferme. */
			racine = null;
			partie = null;
			caseChoisie = null;
			symboleChoisi = null;
			avantNouvellePartie = null;
		},
	};
}

/* L'id est écrit EN CLAIR, pas rangé dans une constante : deux gates lisent ce
   fichier au motif « nom de la fonction, puis l'id entre apostrophes » pour le
   rattacher au catalogue et à sa spec Playwright, et une constante y passerait
   pour un id vide. Corollaire : ne pas écrire ce motif ailleurs dans le fichier,
   un commentaire qui le citerait serait lu le premier. */
enregistrerJeu('sudoku', creerRunner);
