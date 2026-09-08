/* ============================================================
   Mots casés (#664) — le RUNNER.

   Jeu-REFUGE : aucune compétence déclarée, aucune dépendance à la classe du
   profil, rien qui alimente l'économie (ni XP, ni médaille, ni objectif, ni
   record), et surtout AUCUN journal d'erreurs. Un jeu ne corrige pas une
   réponse d'enfant : il n'y a pas de bonne réponse à côté de laquelle il serait
   passé, seulement un conflit transitoire qu'il défera lui-même.

   Aucune lecture d'horloge non plus. Le temps joué se mesure dans l'écran
   (`jeux-ecran.ts`), pas ici : un enfant lent à cause du geste, et non de la
   réflexion, verrait sinon son obstacle moteur transformé en signal de pression.

   Le moteur, le vivier et la persistance sont purs et vivent dans `core/jeux/` ;
   ici, uniquement l'interface.

   ── Le geste : le mot d'abord, l'endroit ensuite ────────────────────────────

   Deux temps. Taper un mot de la liste le prend EN MAIN ; taper une case de la
   grille l'y pose. C'est l'inverse de l'ordre du sudoku, et pour une raison
   symétrique : dans un sudoku la case cible est ce que l'enfant cherche, alors
   qu'ici c'est le mot — la liste est le point de départ naturel, et l'endroit se
   déduit de la longueur.

   Rien ne se glisse et rien ne se tape au clavier : tout est un `<button>`
   réel, donc atteignable au doigt comme à la tabulation, sans un seul écouteur
   de touche.

   **Le mot en main reste lisible en permanence** (critère 15) : le bandeau qui
   l'affiche est `position: sticky`. Sur la grande grille, la liste sort de
   l'écran dès qu'on regarde le bas de la grille — sans ce bandeau, l'enfant
   devrait remonter pour se rappeler ce qu'il tient.

   ── Pourquoi taper une case ne peut jamais être ambigu ──────────────────────

   Une case de croisement appartient à DEUX mots. Y poser le mot en main
   demanderait donc d'arbitrer entre l'horizontal et le vertical… sauf que les
   motifs livrés ne font jamais se croiser deux emplacements de MÊME longueur.
   Un seul des deux peut accueillir le mot, l'autre n'est pas de la bonne taille.
   L'ambiguïté est écartée par la donnée, pas rattrapée par une règle que
   l'enfant devrait apprendre.

   Reste le RETRAIT, quand les deux mots d'un croisement sont posés : là, les
   deux sont candidats. On retire alors l'horizontal, et on l'ANNONCE — le mot
   revient dans la liste, donc le geste est réversible d'un appui. Chaque
   emplacement gardant au moins deux cases à lui, l'enfant a toujours un endroit
   non ambigu où viser.

   ── La pose fautive est acceptée, le conflit se signale ─────────────────────

   Registre `--warn` et une trame, jamais `--ko` (réservé à une réponse corrigée
   et définitivement fausse) : un conflit est transitoire et auto-corrigible. Il
   se signale SUR LES DEUX mots, parce que le jeu ne sait pas lequel est « le
   mauvais » — il n'y en a pas. Et il ne s'éteint JAMAIS, même quand l'encadrant
   coupe les aides visuelles : ce n'est pas une aide, c'est l'état de la grille.
   ============================================================ */
import { attribut, drapeau, html, joindre, VIDE, type SafeHtml } from '../core/html';
import { randFloat } from '../core/utils';
import {
	casesDe,
	complete,
	conflits,
	emplacementsCompatibles,
	lettresEn,
	poser,
	retirer,
	terminee,
} from '../core/jeux/grille-mots';
import { motsDisponibles, tirerGrille, type PartieMotsCases } from '../core/jeux/mots-cases';
import {
	effacerPartie,
	memoriserTaille,
	partieEnCours,
	sauverPartie,
	tailleChoisie,
} from '../core/jeux/mots-cases-etat';
import { TAILLES_MOTS_CASES, type TailleMotsCases } from '../data/jeux/motifs-mots-cases';
import { aidesJeuxActives } from '../core/profiles';
import { dicteeDisponible, dicterConsigne } from './tts';
import { enregistrerJeu, type RunnerJeu } from './jeux-ecran';

/** La RÈGLE DU JEU, jamais « la consigne » : ce mot appartient au registre de
    l'exercice et contribue à faire lire le jeu comme du travail déguisé. Une
    seule phrase, avec un verbe conjugué — l'ellipse nominale allège l'écrit et
    alourdit la première lecture, l'inverse de ce qu'on cherche sur le texte qui
    explique la règle. */
const REGLE = 'Choisis un mot dans la liste, puis touche la grille à l’endroit où il doit aller.';

/** La grille est pleine mais un croisement se contredit. Ni « faux », ni
    « erreur » : le jeu ne corrige rien, il décrit un état et montre où regarder.
    Pas de nombre non plus (« deux mots ») — il peut y avoir un désaccord comme
    quatre, et une phrase qui compte mal serait pire que muette. */
const MESSAGE_COINCE =
	'La grille est pleine, mais certaines lettres ne se rejoignent pas : regarde les cases marquées.';

const LIBELLE_TAILLE: Record<TailleMotsCases, string> = {
	petite: 'Petite grille',
	grande: 'Grande grille',
};

/** Les lettres d'un mot, en NFC : une entrée par lettre perçue. */
const lettresDe = (mot: string): string[] => [...mot.normalize('NFC')];

/** En capitales (critère 28) : dans une case isolée, sans appui sémantique,
    b/d/p/q se confondent bien plus que B/D/P/Q. Accents compris — c'est tout
    l'objet de la comparaison stricte des croisements. */
const capitale = (lettre: string): string => lettre.toLocaleUpperCase('fr');

const cle = (ligne: number, colonne: number): string => `${ligne},${colonne}`;

/** Pose ou retire un attribut d'état. Un attribut plutôt qu'une classe : c'est
    la convention du plateau du sudoku, et un sélecteur d'attribut se lit tout
    aussi bien dans la feuille de style comme dans une spec. */
function bascule(el: HTMLElement, nom: string, actif: boolean): void {
	if (actif) el.setAttribute(nom, '1');
	else el.removeAttribute(nom);
}

/* ---------- Le balisage ---------- */

function boutonTailleHTML(taille: TailleMotsCases, courante: TailleMotsCases): SafeHtml {
	return html`<button
		type="button"
		class="mc-taille"
		data-taille="${taille}"
		aria-pressed="${taille === courante ? 'true' : 'false'}"
	>
		${LIBELLE_TAILLE[taille]}
	</button>`;
}

/** Un mot de la liste, avec sa longueur EN CLAIR (critère 29) : sans elle,
    l'enfant compte les lettres à l'œil, une par une, à chaque essai.

    La liste n'est PAS groupée par longueur, et c'est un arbitrage : le
    regroupement rendrait la grille solvable par élimination de tas, sans
    regarder une seule lettre. Le nombre affiché donne le repère sans fabriquer
    les tas. */
function motHTML(mot: string, avecVoix: boolean): SafeHtml {
	const n = lettresDe(mot).length;
	return html`<div class="mc-item" data-mot="${mot}">
		<button
			type="button"
			class="mc-mot"
			data-mot="${mot}"
			aria-pressed="false"
			aria-label="${mot}, ${n} lettres"
		>
			<span class="mc-mot-texte">${mot}</span>
			<span class="mc-mot-nb" aria-hidden="true">${n}</span>
		</button>
		${
			avecVoix
				? html`<button
					type="button"
					class="mc-ecoute"
					data-ecoute="${mot}"
					aria-label="Écouter le mot ${mot}"
				>
					🔊
				</button>`
				: VIDE
		}
	</div>`;
}

function caseHTML(ligne: number, colonne: number, h: number | null, v: number | null): SafeHtml {
	if (h === null && v === null) {
		return html`<span class="mc-trou" aria-hidden="true"></span>`;
	}
	return html`<button
		type="button"
		class="mc-case"
		data-ligne="${ligne}"
		data-colonne="${colonne}"
		${h === null ? VIDE : attribut('data-h', h)}
		${v === null ? VIDE : attribut('data-v', v)}
	></button>`;
}

function plateauHTML(taille: TailleMotsCases): SafeHtml {
	return html`<div class="mc">
		<div class="mc-tailles" role="group" aria-label="Taille de la grille">
			${joindre(TAILLES_MOTS_CASES.map((t) => boutonTailleHTML(t, taille)))}
		</div>
		<p class="mc-regle">${REGLE}</p>
		<button type="button" class="mc-ecouter" id="mcEcouterRegle" ${drapeau('hidden')}>
			🔊 Écouter la règle
		</button>
		<p class="mc-main" id="mcMain"></p>
		<p class="mc-progres" id="mcProgres"></p>
		<div class="mc-grille" id="mcGrille" role="group" aria-label="Grille de mots"></div>
		<p class="mc-coince" id="mcCoince" ${drapeau('hidden')}>${MESSAGE_COINCE}</p>
		<div class="mc-liste" id="mcListe" role="group" aria-label="Mots à placer"></div>
		<div class="mc-fin" id="mcFin" ${drapeau('hidden')}>
			<p class="mc-fin-titre">Grille terminée !</p>
			<button type="button" class="mc-nouvelle" id="mcNouvelle">Nouvelle grille</button>
		</div>
		<p
			class="sr-only mc-annonce"
			id="mcAnnonce"
			role="status"
			aria-live="polite"
			aria-atomic="true"
		></p>
	</div>`;
}

/* ---------- Le runner ---------- */

function creerRunner(): RunnerJeu {
	let taille: TailleMotsCases = 'petite';
	let partie: PartieMotsCases | null = null;
	let motEnMain: string | null = null;
	let racine: HTMLElement | null = null;
	/* Défaut à `null`, donc `?.()` rend `undefined`, donc REFUS. Le contrat de
	   `RunnerJeu` l'exige : un runner qui oublierait de câbler ce rappel ne
	   vérifierait plus le plafond du jour, et cette panne-là est invisible — elle
	   ne lève rien et profite à l'enfant. */
	let avantNouvellePartie: (() => boolean) | null = null;

	const dans = <T extends HTMLElement>(sel: string): T | null =>
		racine ? racine.querySelector<T>(sel) : null;

	const annoncer = (texte: string): void => {
		const el = dans('#mcAnnonce');
		if (el) el.textContent = texte;
	};

	/** Reconstruit la grille et la liste. Appelé au montage, au changement de
	    taille et à chaque grille neuve — jamais à chaque coup : `peindre` ne fait
	    que déplacer des attributs, ce qui préserve le focus de l'enfant. */
	const construire = (): void => {
		const p = partie;
		const grille = dans('#mcGrille');
		const liste = dans('#mcListe');
		if (!p || !grille || !liste) return;
		const parCase = new Map<string, { h: number | null; v: number | null }>();
		p.motif.emplacements.forEach((e, i) => {
			for (const c of casesDe(e)) {
				const place = parCase.get(cle(c.ligne, c.colonne)) ?? { h: null, v: null };
				if (e.sens === 'h') place.h = i;
				else place.v = i;
				parCase.set(cle(c.ligne, c.colonne), place);
			}
		});
		const cases: SafeHtml[] = [];
		for (let ligne = 0; ligne < p.motif.hauteur; ligne++) {
			for (let colonne = 0; colonne < p.motif.largeur; colonne++) {
				const place = parCase.get(cle(ligne, colonne)) ?? { h: null, v: null };
				cases.push(caseHTML(ligne, colonne, place.h, place.v));
			}
		}
		grille.style.setProperty('--mc-colonnes', String(p.motif.largeur));
		grille.dataset.taille = p.motif.taille;
		grille.innerHTML = joindre(cases).balisage;
		/* Les boutons d'écoute n'existent que s'il y a une voix (critère 26) :
		   affichés sans voix disponible, ils promettraient ce qu'ils ne peuvent
		   pas tenir. Et rien ne se lit tout seul — toute lecture part d'un appui. */
		const avecVoix = dicteeDisponible();
		liste.innerHTML = joindre(p.mots.map((mot) => motHTML(mot, avecVoix))).balisage;
	};

	/** Repeint l'état : lettres, conflits, mise en évidence, liste, progression.

	    La mise en évidence des emplacements compatibles est soumise à
	    `aidesJeuxActives()` : un surlignage permanent peut devenir lui-même un
	    distracteur, et un enfant plus avancé peut vouloir jouer sans filet. Le
	    SIGNALEMENT DE CONFLIT, lui, n'en dépend pas — ce n'est pas une aide. */
	const peindre = (): void => {
		const p = partie;
		if (!p || !racine) return;
		const aides = aidesJeuxActives();
		const enConflit = conflits(p.grille);
		const casesFautives = new Set(enConflit.map((c) => cle(c.ligne, c.colonne)));
		const motsFautifs = new Set(enConflit.flatMap((c) => [c.a, c.b]));
		const casesDesMotsFautifs = new Set(
			[...motsFautifs].flatMap((i) =>
				casesDe(p.motif.emplacements[i]).map((c) => cle(c.ligne, c.colonne)),
			),
		);
		const compatibles =
			aides && motEnMain !== null ? emplacementsCompatibles(p.grille, motEnMain) : [];
		const casesCibles = new Set(
			compatibles.flatMap((i) =>
				casesDe(p.motif.emplacements[i]).map((c) => cle(c.ligne, c.colonne)),
			),
		);

		for (const el of racine.querySelectorAll<HTMLElement>('.mc-case')) {
			const ligne = Number(el.dataset.ligne);
			const colonne = Number(el.dataset.colonne);
			const lettres = lettresEn(p.grille, ligne, colonne).map(capitale);
			el.textContent = lettres.join(' ');
			const ou = `ligne ${ligne + 1}, colonne ${colonne + 1}`;
			let etat = 'case vide';
			if (lettres.length === 1) etat = `lettre ${lettres[0]}`;
			else if (lettres.length > 1) etat = `deux lettres se contredisent, ${lettres.join(' et ')}`;
			el.setAttribute('aria-label', `${ou}, ${etat}`);
			bascule(el, 'data-double', lettres.length > 1);
			bascule(el, 'data-conflit', casesFautives.has(cle(ligne, colonne)));
			bascule(el, 'data-conflit-mot', casesDesMotsFautifs.has(cle(ligne, colonne)));
			bascule(el, 'data-cible', casesCibles.has(cle(ligne, colonne)));
		}

		const restants = new Set(motsDisponibles(p));
		for (const item of racine.querySelectorAll<HTMLElement>('.mc-item')) {
			item.hidden = !restants.has(item.dataset.mot ?? '');
		}
		for (const bouton of racine.querySelectorAll<HTMLElement>('.mc-mot')) {
			bouton.setAttribute('aria-pressed', bouton.dataset.mot === motEnMain ? 'true' : 'false');
		}

		const main = dans('#mcMain');
		if (main) {
			main.textContent =
				motEnMain === null
					? 'Choisis un mot dans la liste.'
					: `En main : ${motEnMain} (${lettresDe(motEnMain).length} lettres)`;
			bascule(main, 'data-plein', motEnMain !== null);
		}

		/* La progression se lit EN MONTANT, sans temps écoulé ni restant. */
		const total = p.mots.length;
		const places = total - restants.size;
		const progres = dans('#mcProgres');
		if (progres) {
			progres.textContent = `${places} mot${places > 1 ? 's' : ''} placé${places > 1 ? 's' : ''} sur ${total}`;
		}

		const fini = terminee(p.grille);
		const fin = dans('#mcFin');
		if (fin) fin.hidden = !fini;
		const coince = dans('#mcCoince');
		if (coince) coince.hidden = fini || !complete(p.grille);
	};

	/** Reprend la grille laissée en cours, ou en tire une neuve.

	    Le plafond n'est consulté que pour une grille NEUVE : reprendre n'est pas
	    commencer une partie, et l'écran ne s'ouvre de toute façon pas quand le
	    plafond est épuisé. C'est ce qui fait survivre la grille à l'atteinte du
	    plafond — sans quoi une grande grille, qui ne tient pas dans une session,
	    repartirait de zéro à chaque fois. */
	const charger = (t: TailleMotsCases): boolean => {
		const reprise = partieEnCours();
		if (reprise && reprise.motif.taille === t) {
			partie = reprise;
			taille = t;
			return true;
		}
		if (!avantNouvellePartie?.()) return false;
		partie = tirerGrille(t, randFloat);
		taille = t;
		sauverPartie(partie);
		return true;
	};

	const rendreEtat = (annonce: string): void => {
		motEnMain = null;
		construire();
		peindre();
		annoncer(annonce);
	};

	const changerTaille = (t: TailleMotsCases): void => {
		if (!partie || t === partie.motif.taille) return;
		/* Une seule grille en cours : changer de taille l'abandonne, et repasse
		   donc par le plafond du jour. C'est aussi ce qui interdit de contourner
		   le plafond en faisant l'aller-retour entre les deux tailles.

		   L'ordre compte, et la première version se trompait dessus : elle effaçait
		   la partie AVANT de demander l'autorisation. Le plafond qui tombe à cet
		   instant précis refermait alors l'écran sur une grille déjà détruite —
		   l'enfant perdait son travail sans avoir rien obtenu en échange. On ne
		   renonce à l'ancienne grille qu'une fois la nouvelle accordée : `charger`
		   ne reprend pas la partie sauvée, puisqu'elle n'est pas de cette taille. */
		if (!charger(t)) return;
		memoriserTaille(t);
		rendreEtat(`${LIBELLE_TAILLE[t]}.`);
	};

	/** Sauve à CHAQUE coup, jamais à la sortie : le plafond peut tomber et
	    l'onglet peut se fermer sans prévenir — sur mobile, il est même souvent tué
	    sans qu'aucun événement de sortie ne parte. */
	const enregistrer = (p: PartieMotsCases): void => {
		if (terminee(p.grille)) {
			/* Terminer LIBÈRE l'emplacement : la partie suivante repart d'une grille
			   neuve. La fin est un panneau calme dans le plateau — pas de confettis,
			   pas de modale : un jeu de l'étagère n'alimente aucune économie, donc il
			   n'emprunte pas le traitement d'une fin de leçon. */
			effacerPartie();
			return;
		}
		sauverPartie(p);
	};

	const poserMot = (el: HTMLElement): void => {
		const p = partie;
		if (!p || motEnMain === null) return;
		const compatibles = emplacementsCompatibles(p.grille, motEnMain);
		const vise = [el.dataset.h, el.dataset.v]
			.map((brut) => (brut === undefined ? null : Number(brut)))
			.find((i): i is number => i !== null && compatibles.includes(i));
		if (vise === undefined) return;
		const mot = motEnMain;
		partie = { ...p, grille: poser(p.grille, vise, mot) };
		motEnMain = null;
		enregistrer(partie);
		peindre();
		if (terminee(partie.grille)) {
			annoncer('Grille terminée.');
			dans<HTMLButtonElement>('#mcNouvelle')?.focus();
			return;
		}
		/* La grille pleine qui coince s'ANNONCE aussi : le panneau se voit à
		   l'écran, mais un enfant qui suit le jeu au lecteur d'écran n'aurait
		   sinon aucun moyen de savoir qu'il vient de la remplir sans la finir. */
		annoncer(
			complete(partie.grille) ? `Mot posé : ${mot}. ${MESSAGE_COINCE}` : `Mot posé : ${mot}.`,
		);
		const depart = casesDe(partie.motif.emplacements[vise])[0];
		dans<HTMLButtonElement>(
			`.mc-case[data-ligne="${depart.ligne}"][data-colonne="${depart.colonne}"]`,
		)?.focus();
	};

	/** Retire le mot qui occupe cette case et le rend à la liste. C'est
	    l'équivalent du bouton « Effacer » du sudoku, et pour la même raison :
	    l'essai-erreur EST la résolution, et un premier choix malheureux ne doit
	    jamais obliger à recommencer la grille. */
	const retirerMot = (el: HTMLElement): void => {
		const p = partie;
		if (!p) return;
		const vise = [el.dataset.h, el.dataset.v]
			.map((brut) => (brut === undefined ? null : Number(brut)))
			.find((i): i is number => i !== null && p.grille.poses[i] !== null);
		if (vise === undefined) return;
		const mot = p.grille.poses[vise] ?? '';
		partie = { ...p, grille: retirer(p.grille, vise) };
		enregistrer(partie);
		peindre();
		annoncer(`Mot retiré : ${mot}.`);
		dans<HTMLButtonElement>(`.mc-mot[data-mot="${mot}"]`)?.focus();
	};

	const nouvelleGrille = (): void => {
		effacerPartie();
		if (!charger(taille)) return;
		rendreEtat('Nouvelle grille.');
		dans<HTMLButtonElement>('.mc-mot')?.focus();
	};

	const surClic = (e: MouseEvent): void => {
		const cible = e.target as HTMLElement | null;
		if (!cible || !partie) return;

		const bTaille = cible.closest<HTMLElement>('.mc-taille');
		if (bTaille) {
			const t = TAILLES_MOTS_CASES.find((x) => x === bTaille.dataset.taille);
			if (t) changerTaille(t);
			return;
		}

		/* La lecture d'un mot est un bouton À PART, dans le mot lui-même : une
		   lecture globale de la liste obligerait à retenir huit mots d'affilée,
		   c'est-à-dire à recréer la surcharge qu'on voulait éviter. */
		const bEcoute = cible.closest<HTMLElement>('.mc-ecoute');
		if (bEcoute) {
			dicterConsigne(bEcoute.dataset.ecoute ?? '');
			return;
		}

		const bMot = cible.closest<HTMLElement>('.mc-mot');
		if (bMot) {
			const mot = bMot.dataset.mot ?? '';
			motEnMain = motEnMain === mot ? null : mot;
			peindre();
			return;
		}

		const bCase = cible.closest<HTMLElement>('.mc-case');
		if (bCase) {
			if (motEnMain === null) retirerMot(bCase);
			else poserMot(bCase);
			return;
		}

		if (cible.closest('#mcNouvelle')) {
			nouvelleGrille();
			return;
		}
		/* La règle ne se lit QUE sur demande : contrairement à un énoncé
		   d'exercice, elle ne change jamais d'une grille à l'autre. */
		if (cible.closest('#mcEcouterRegle')) dicterConsigne(REGLE);
	};

	return {
		monter(hote, demanderPartie) {
			avantNouvellePartie = demanderPartie;
			taille = tailleChoisie();
			hote.innerHTML = plateauHTML(taille).balisage;
			racine = hote.querySelector<HTMLElement>('.mc');
			racine?.addEventListener('click', surClic);
			const ecouter = dans('#mcEcouterRegle');
			if (ecouter && dicteeDisponible()) ecouter.hidden = false;
			if (!charger(taille)) return;
			rendreEtat(`${LIBELLE_TAILLE[taille]}.`);
		},
		demonter() {
			racine?.removeEventListener('click', surClic);
			/* Une grille abandonnée est déjà sauvée : chaque pose et chaque retrait
			   écrivent, ce qui la rend robuste au plafond qui tombe comme à l'onglet
			   qu'on ferme. */
			racine = null;
			partie = null;
			motEnMain = null;
			avantNouvellePartie = null;
		},
	};
}

/* L'id est écrit EN CLAIR, pas rangé dans une constante : deux gates lisent ce
   fichier au motif « nom de la fonction, puis l'id entre apostrophes » pour le
   rattacher au catalogue et à sa spec Playwright, et une constante y passerait
   pour un id vide. */
enregistrerJeu('mots-cases', creerRunner);
