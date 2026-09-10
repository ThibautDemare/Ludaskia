/* ============================================================
   Mots croisés (#665) — le RUNNER.

   Jeu de COMPÉTENCE (retrouver un mot à partir de son sens), et pourtant : rien
   qui alimente l'économie — ni XP, ni médaille, ni objectif, ni record —, aucune
   lecture d'horloge, et AUCUN journal d'erreurs. C'est l'arbitrage 2 du cadrage,
   le même que pour le Motus, qui est lui aussi de type C : « ce sont des jeux ».
   Le piège est ici plus vif qu'ailleurs, parce que ce jeu CORRIGE vraiment
   quelque chose ; la règle du dépôt qui veut qu'un chemin de correction
   journalise ne vaut que pour les LEÇONS.

   Le moteur, le vivier, la saisie et la persistance sont purs et vivent dans
   `core/jeux/` ; ici, uniquement l'interface.

   ── Le geste : toucher une case, lire sa définition, écrire ─────────────────

   Pas de numérotation classique, et c'est tranché au cadrage : un chiffre
   minuscule dans une case de 50 px, à retrouver dans une liste séparée par sens,
   avec un vocabulaire « horizontal / vertical » qui entre en concurrence avec
   celui de la géométrie enseignée ailleurs. Toucher une case affiche la
   définition de son mot (critère 18) — l'enfant n'a rien à deviner, et rien à
   apparier de tête.

   Sur une case de CROISEMENT, le jeu ne choisit pas à sa place (critère 19) :
   les deux définitions s'affichent, chacune sur un bouton touchable. Pas de
   double appui, pas de bascule cachée. Le bouton retenu reste affiché, ce qui
   permet de passer d'un mot à l'autre sans re-toucher la case.

   **La définition du mot en cours reste lisible pendant toute la saisie**
   (critère 20) : le bandeau qui la porte est `position: sticky`. Une grille de
   sept lignes sort du champ de vision dès qu'on regarde le bas ; sans ce
   bandeau, l'enfant devrait remonter pour se rappeler ce qu'il cherche —
   exactement la charge de mémoire de travail que le format doit éviter.

   ── La saisie passe par le clavier de l'appareil ────────────────────────────

   Chaque case est un vrai champ d'une lettre : la lettre s'écrit DANS la case
   (critère 22), et le clavier qui l'alimente est celui du système — virtuel sur
   tablette, physique sur ordinateur. C'est la norme de toute l'application
   (leçons, sprint, révision) ; le seul écran qui affiche son propre clavier est
   le Motus, où les touches servent aussi de résumé des lettres essayées, ce qui
   n'a aucun sens dans une grille (une lettre peut être bien posée dans un mot et
   pas encore tapée dans l'autre — le statut vit sur la case, pas sur la touche).

   Le curseur avance à la prochaine case VIDE du mot, jamais sur une lettre déjà
   posée : il fait le tour du mot plutôt que de s'arrêter à la fin, pour que les
   trous laissés en route se comblent sans un geste de plus (`prochaineVide`, du
   côté pur). Ce tour de boucle est le seul moment où le curseur ne va pas là où
   l'enfant l'attend : il s'ANNONCE donc, sans quoi un enfant dont l'attention
   lâche entre deux lettres continuerait d'écrire à l'aveugle en croyant avancer.

   ── Le mot faux : automatique, jamais lettre à lettre ───────────────────────

   Un mot complété est comparé tout seul (critère 25) : pas de bouton
   « vérifier », donc pas d'enfant qui finit toute la grille fausse sans un
   signal. Mais rien ne se dit lettre par lettre (critère 26) — ce serait le
   Motus, et ça se lirait comme une correction.

   Registre `--warn`, doublé d'une trame de hachures, jamais `--ko` : `--ko` est
   réservé à une réponse corrigée et DÉFINITIVEMENT fausse, alors qu'ici le mot
   est encore à trouver. Et le signalement ne s'éteint jamais : ce n'est pas une
   aide, c'est l'état de la grille.
   ============================================================ */
import { attribut, drapeau, html, joindre, VIDE, type SafeHtml } from '../core/html';
import { randFloat } from '../core/utils';
import { casesDe, cleCase } from '../core/jeux/grille-mots';
import {
	definitionDe,
	ecrire,
	effacerCase,
	effacerMot,
	etatMot,
	lettreAffichee,
	motsSur,
	motsTrouves,
	partieGagnee,
	prochaineVide,
	tirerGrille,
	type EtatMot,
	type PartieMotsCroises,
} from '../core/jeux/mots-croises';
import { effacerPartie, partieEnCours, sauverPartie } from '../core/jeux/mots-croises-etat';
import { lectureConsigneAuto } from '../core/profiles';
import { dicteeDisponible, dicterConsigne } from './tts';
import { enregistrerJeu, type RunnerJeu } from './jeux-ecran';
import { bascule, capitale } from './jeux-dom';
import { uiConfirm } from './ui-modal';

/** La RÈGLE DU JEU, jamais « la consigne » : ce mot appartient au registre de
    l'exercice et fait lire le jeu comme du travail déguisé. */
const REGLE = 'Touche une case, lis la définition, puis écris le mot lettre par lettre.';

/** Ce que dit le bandeau tant qu'aucun mot n'est choisi. Une invitation au
    geste, pas un reproche : c'est l'état normal à l'ouverture. */
const INVITE = 'Touche une case de la grille pour lire la définition de son mot.';

/** Sur une case de croisement, tant que l'enfant n'a pas dit quel mot il écrit.
    Le jeu ne tranche pas pour lui (critère 19). */
const INVITE_CROISEMENT = 'Deux mots passent par cette case : touche celui que tu veux écrire.';

/** Un mot complété ne correspond pas à sa définition. Ni « faux », ni
    « erreur » : le mot est encore à trouver, et le jeu décrit un état au lieu de
    rendre un verdict. Pas de nombre non plus — il peut y en avoir un comme
    trois, et une phrase qui compte mal serait pire que muette. */
const MESSAGE_FAUX =
	'Un mot au moins ne correspond pas encore à sa définition : il est signalé dans la grille.';

/** Le curseur vient de repartir en arrière, sur un trou laissé en chemin. Une
    phrase courte, qui dit CE QUI EST ARRIVÉ et où l'on écrit maintenant : la
    case elle-même s'annonce toute seule en prenant le focus (sa ligne, sa
    colonne), ce qui manque est la RAISON du saut.

    Aucun mot d'interface ici — ni « curseur », ni « champ » : l'enfant n'a pas à
    connaître le vocabulaire du logiciel pour comprendre où il en est. */
const MESSAGE_RETOUR = 'Une case du mot était restée vide : tu écris là maintenant.';

/** Le tirage n'a rien trouvé. Théorique avec les motifs livrés (mesurés à 20
    remplissages sur 20 chacun), mais un garde-fou qui laisse l'écran vide ne
    garde rien : le squelette du plateau est déjà rendu quand le tirage échoue. */
const MESSAGE_PANNE =
	'Le jeu n’a pas réussi à préparer une grille. Tu n’y es pour rien : essaie encore.';

/** Le sens d'un emplacement, dit avec les mots du geste et non ceux de la
    géométrie. Le cadrage écarte « horizontal / vertical » : ce vocabulaire est
    enseigné ailleurs, sur des droites, et l'emprunter ici le brouillerait. */
const LIBELLE_SENS = { h: 'Le mot qui va vers la droite', v: 'Le mot qui descend' } as const;

const GLYPHE_SENS = { h: '→', v: '↓' } as const;

/* ---------- Le balisage ---------- */

/** Une case jouable est un CHAMP d'une lettre, pas un bouton : c'est ce qui fait
    apparaître le clavier du système au doigt, et ce qui permet à la lettre de
    s'écrire directement dans la case (critère 22).

    `inputmode` n'est pas forcé : le clavier par défaut porte les lettres, et
    imposer un mode plus étroit priverait l'enfant des touches accentuées de son
    appareil. Les cases hors mot ne sont ni champs ni cibles. */
function caseHTML(ligne: number, colonne: number, h: number | null, v: number | null): SafeHtml {
	if (h === null && v === null) {
		return html`<span class="mx-trou" aria-hidden="true"></span>`;
	}
	return html`<input
		type="text"
		class="mx-case"
		maxlength="1"
		autocomplete="off"
		autocapitalize="characters"
		autocorrect="off"
		spellcheck="false"
		data-ligne="${ligne}"
		data-colonne="${colonne}"
		${h === null ? VIDE : attribut('data-h', h)}
		${v === null ? VIDE : attribut('data-v', v)}
	/>`;
}

/** Un des deux mots d'une case de croisement. Le bouton porte la DÉFINITION
    entière, pas seulement le sens : c'est ce que le critère 19 demande
    (« les deux définitions sont proposées explicitement, chacune touchable »). */
function sensHTML(emplacement: number, sens: 'h' | 'v', definition: string): SafeHtml {
	return html`<button
		type="button"
		class="mx-sens"
		data-emplacement="${emplacement}"
		aria-pressed="false"
	>
		<span class="mx-sens-quoi">
			<span class="mx-sens-glyphe" aria-hidden="true">${GLYPHE_SENS[sens]}</span>
			${LIBELLE_SENS[sens]}
		</span>
		<span class="mx-sens-def">${definition}</span>
	</button>`;
}

function plateauHTML(): SafeHtml {
	return html`<div class="mx">
		<p class="mx-regle">${REGLE}</p>
		<button type="button" class="mx-ecouter" id="mxEcouterRegle" ${drapeau('hidden')}>
			🔊 Écouter la règle
		</button>
		<div class="mx-def" id="mxDef">
			<p class="mx-def-texte" id="mxDefTexte">${INVITE}</p>
			<button type="button" class="mx-def-ecoute" id="mxDefEcoute" ${drapeau('hidden')}>
				🔊 Écouter la définition
			</button>
			<div class="mx-choix" id="mxChoix" role="group" aria-label="Les deux mots de cette case" ${drapeau('hidden')}></div>
		</div>
		<p class="mx-progres" id="mxProgres"></p>
		<div class="mx-grille" id="mxGrille" role="group" aria-label="Grille de mots croisés"></div>
		<p class="mx-signal" id="mxSignal" ${drapeau('hidden')}>${MESSAGE_FAUX}</p>
		<div class="mx-actions" id="mxActions">
			<button type="button" class="mx-effacer" id="mxEffacer" ${drapeau('disabled')}>
				Effacer ce mot
			</button>
			<button type="button" class="mx-changer" id="mxChanger">Changer de grille</button>
		</div>
		<div class="mx-panne" id="mxPanne" ${drapeau('hidden')}>
			<p class="mx-panne-titre">Pas de grille cette fois.</p>
			<p class="mx-panne-texte">${MESSAGE_PANNE}</p>
			<button type="button" class="mx-reessayer" id="mxReessayer">Réessayer</button>
		</div>
		<div class="mx-fin" id="mxFin" ${drapeau('hidden')}>
			<p class="mx-fin-titre">Grille terminée !</p>
			<button type="button" class="mx-nouvelle" id="mxNouvelle">Nouvelle grille</button>
		</div>
		<p
			class="sr-only mx-annonce"
			id="mxAnnonce"
			role="status"
			aria-live="polite"
			aria-atomic="true"
		></p>
	</div>`;
}

/* ---------- Le runner ---------- */

function creerRunner(): RunnerJeu {
	let partie: PartieMotsCroises | null = null;
	/** L'emplacement dont la définition est affichée, s'il est décidé. */
	let motCourant: number | null = null;
	/** La dernière case touchée : c'est elle qui dit si un choix de sens est à
	    proposer, et c'est vers elle que le focus revient après le choix. */
	let caseTouchee: { ligne: number; colonne: number } | null = null;
	let racine: HTMLElement | null = null;
	/** Vrai pendant un déplacement de curseur décidé par le JEU : voir
	    `deplacerCurseur`. */
	let curseurAutomatique = false;
	/* Défaut à `null`, donc `?.()` rend `undefined`, donc REFUS. Le contrat de
	   `RunnerJeu` l'exige : un runner qui oublierait de câbler ce rappel ne
	   vérifierait plus le plafond du jour, et cette panne-là est invisible. */
	let avantNouvellePartie: (() => boolean) | null = null;

	const dans = <T extends HTMLElement>(sel: string): T | null =>
		racine ? racine.querySelector<T>(sel) : null;

	const annoncer = (texte: string): void => {
		const el = dans('#mxAnnonce');
		if (el) el.textContent = texte;
	};

	const etats = (p: PartieMotsCroises): EtatMot[] =>
		p.motif.emplacements.map((_e, i) => etatMot(p, i));

	const caseAt = (ligne: number, colonne: number): HTMLInputElement | null =>
		dans<HTMLInputElement>(`.mx-case[data-ligne="${ligne}"][data-colonne="${colonne}"]`);

	/** Reconstruit la grille. Appelé au montage et à chaque grille neuve — jamais
	    à chaque lettre : `peindre` ne fait que déplacer des valeurs et des
	    attributs, ce qui préserve le focus (donc le clavier ouvert). */
	const construire = (): void => {
		const p = partie;
		const grille = dans('#mxGrille');
		if (!p || !grille) return;
		const parCase = new Map<string, { h: number | null; v: number | null }>();
		p.motif.emplacements.forEach((e, i) => {
			for (const c of casesDe(e)) {
				const place = parCase.get(cleCase(c.ligne, c.colonne)) ?? { h: null, v: null };
				if (e.sens === 'h') place.h = i;
				else place.v = i;
				parCase.set(cleCase(c.ligne, c.colonne), place);
			}
		});
		const cases: SafeHtml[] = [];
		for (let ligne = 0; ligne < p.motif.hauteur; ligne++) {
			for (let colonne = 0; colonne < p.motif.largeur; colonne++) {
				const place = parCase.get(cleCase(ligne, colonne)) ?? { h: null, v: null };
				cases.push(caseHTML(ligne, colonne, place.h, place.v));
			}
		}
		grille.style.setProperty('--mx-colonnes', String(p.motif.largeur));
		grille.innerHTML = joindre(cases).balisage;
	};

	/** Ce que le bandeau affiche, au moment de sa dernière mesure. */
	let signatureBandeau = '';

	/** Pose la hauteur RÉELLE du bandeau collant sur la grille, pour que
	    `scroll-margin-top` empêche le défilement natif de glisser la case qui
	    prend le focus dessous. Une valeur fixe ne suffirait pas : le bandeau
	    grandit d'un choix de sens sur une case de croisement, et sa définition
	    s'enroule sur deux ou trois lignes selon le mot.

	    Mesurer force un calcul de mise en page, d'où la signature : on ne mesure
	    qu'aux changements de CONTENU du bandeau — au plus une fois par case
	    touchée, jamais à chaque lettre. */
	const mesurerBandeau = (signature: string): void => {
		if (signature === signatureBandeau) return;
		signatureBandeau = signature;
		const def = dans('#mxDef');
		const grille = dans('#mxGrille');
		if (!def || !grille) return;
		grille.style.setProperty('--mx-bandeau', `${String(def.offsetHeight)}px`);
	};

	/** Le bandeau : la définition du mot en cours, et le choix de sens quand la
	    case touchée en appelle un. */
	const peindreDefinition = (): void => {
		const p = partie;
		const texte = dans('#mxDefTexte');
		const choix = dans('#mxChoix');
		const ecoute = dans<HTMLButtonElement>('#mxDefEcoute');
		if (!p || !texte || !choix || !ecoute) return;

		const places = caseTouchee ? motsSur(p.motif, caseTouchee.ligne, caseTouchee.colonne) : [];
		const croisement = places.length > 1;
		choix.hidden = !croisement;
		if (croisement) {
			/* Rebâti seulement quand la case CHANGE, jamais à chaque lettre : ces
			   boutons sont reconstruits en `innerHTML`, et les refaire sous une
			   lecture d'écran en cours la couperait net. */
			const signature = places.map(({ emplacement }) => String(emplacement)).join('-');
			if (choix.dataset.pour !== signature) {
				choix.dataset.pour = signature;
				choix.innerHTML = joindre(
					places.map(({ emplacement }) =>
						sensHTML(
							emplacement,
							p.motif.emplacements[emplacement].sens,
							definitionDe(p.solution[emplacement]) ?? '',
						),
					),
				).balisage;
			}
			for (const bouton of choix.querySelectorAll<HTMLElement>('.mx-sens')) {
				const retenu = Number(bouton.dataset.emplacement) === motCourant;
				bouton.setAttribute('aria-pressed', retenu ? 'true' : 'false');
				/* La définition du bouton RETENU est masquée à l'œil : le bandeau
				   l'affiche déjà juste au-dessus, en plus grand, et la répéter allonge
				   d'autant le bandeau collant dans l'état où il est déjà le plus haut.
				   Celle de l'autre bouton reste visible — c'est elle qui permet de
				   basculer sans re-toucher la case.

				   `.sr-only` et non `display: none` : le texte sort de l'écran, pas de
				   l'arbre d'accessibilité. Un bouton dont le nom se réduirait à « Le mot
				   qui descend » ne dirait plus quel mot il désigne. */
				bouton.querySelector('.mx-sens-def')?.classList.toggle('sr-only', retenu);
			}
		}

		const definition = motCourant === null ? null : (definitionDe(p.solution[motCourant]) ?? null);
		texte.textContent = definition ?? (croisement ? INVITE_CROISEMENT : INVITE);
		bascule(texte, 'data-plein', definition !== null);
		/* Le bouton d'écoute n'existe que s'il y a une voix (critère 31) : affiché
		   sans voix disponible, il promettrait ce qu'il ne peut pas tenir. */
		ecoute.hidden = definition === null || !dicteeDisponible();
		mesurerBandeau(`${definition ?? ''}|${croisement ? (choix.dataset.pour ?? '') : ''}`);
	};

	/** Repeint l'état : lettres, mot en cours, mots faux, progression, fin. */
	const peindre = (): void => {
		const p = partie;
		if (!p || !racine) return;
		const parEtat = etats(p);
		const casesDuMot = new Set(
			motCourant === null
				? []
				: casesDe(p.motif.emplacements[motCourant]).map((c) => cleCase(c.ligne, c.colonne)),
		);
		const casesFausses = new Set(
			p.motif.emplacements.flatMap((e, i) =>
				parEtat[i] === 'faux' ? casesDe(e).map((c) => cleCase(c.ligne, c.colonne)) : [],
			),
		);
		const casesJustes = new Set(
			p.motif.emplacements.flatMap((e, i) =>
				parEtat[i] === 'juste' ? casesDe(e).map((c) => cleCase(c.ligne, c.colonne)) : [],
			),
		);

		for (const el of racine.querySelectorAll<HTMLInputElement>('.mx-case')) {
			const ligne = Number(el.dataset.ligne);
			const colonne = Number(el.dataset.colonne);
			/* La lettre MONTRÉE, pas celle qui est rangée : elles ne diffèrent que sur
			   un mot déjà trouvé, dont la graphie prend alors le dessus (accent
			   compris). Avant ça, la case rend exactement ce que l'enfant a tapé. */
			const lettre = lettreAffichee(p, ligne, colonne);
			const affichee = lettre === null ? '' : capitale(lettre);
			/* Écriture conditionnelle : réécrire la valeur d'un champ qui a le focus
			   replace le curseur, et sur certains claviers virtuels coupe la frappe
			   en cours. */
			if (el.value !== affichee) el.value = affichee;
			el.setAttribute(
				'aria-label',
				`Ligne ${String(ligne + 1)}, colonne ${String(colonne + 1)}, ${
					lettre === null ? 'case vide' : `lettre ${affichee}`
				}`,
			);
			const k = cleCase(ligne, colonne);
			bascule(el, 'data-courant', casesDuMot.has(k));
			bascule(el, 'data-faux', casesFausses.has(k));
			/* Sur une case partagée, FAUX l'emporte sur JUSTE : elle appartient à deux
			   mots, et celui qui ne va pas est le seul sur lequel il reste quelque
			   chose à faire. Peindre la case en « trouvé » y cacherait le signalement
			   à l'endroit précis où l'enfant doit regarder. Même arbitrage que le
			   conflit du sudoku, qui passe lui aussi devant les mises en évidence. */
			bascule(el, 'data-juste', casesJustes.has(k) && !casesFausses.has(k));
		}

		peindreDefinition();

		const effacer = dans<HTMLButtonElement>('#mxEffacer');
		if (effacer) effacer.disabled = motCourant === null;

		/* La progression se lit EN MONTANT, sans temps écoulé ni compte à rebours. */
		const total = p.motif.emplacements.length;
		const trouves = motsTrouves(p);
		const progres = dans('#mxProgres');
		if (progres) {
			progres.textContent = `${String(trouves)} mot${trouves > 1 ? 's' : ''} trouvé${
				trouves > 1 ? 's' : ''
			} sur ${String(total)}`;
		}

		const gagnee = partieGagnee(p);
		const signal = dans('#mxSignal');
		if (signal) signal.hidden = !parEtat.includes('faux');
		const fin = dans('#mxFin');
		if (fin) fin.hidden = !gagnee;
		/* La grille finie, les actions courantes s'effacent : « Effacer ce mot » n'a
		   plus d'objet, et « Changer de grille » ferait doublon avec le bouton du
		   panneau de fin — au mot près le même geste, puisque la confirmation saute
		   sur une grille gagnée. Deux boutons pour une seule action, c'est un choix
		   à faire là où il n'y en a pas. */
		const actions = dans('#mxActions');
		if (actions) actions.hidden = gagnee;
	};

	/** Remplace la partie, SAUVE, repeint. Un seul chemin d'écriture : la
	    sauvegarde suit le geste (chaque lettre posée, chaque effacement) et jamais
	    la sortie de page — sur mobile, l'onglet est souvent tué sans qu'aucun
	    événement de sortie ne parte. */
	const appliquer = (suivante: PartieMotsCroises): void => {
		partie = suivante;
		if (partieGagnee(suivante)) {
			/* Terminer LIBÈRE l'emplacement : la partie suivante repart d'une grille
			   neuve, et une grille finie ne se rouvre pas (critère 39). */
			effacerPartie();
		} else {
			sauverPartie(suivante);
		}
		peindre();
	};

	/** Ce que la nouvelle lettre a changé, à dire à voix haute. Sans ça, un enfant
	    qui suit le jeu au lecteur d'écran ne saurait jamais qu'il vient de trouver
	    un mot — ni qu'il vient d'en casser un autre en écrivant dans une case
	    partagée (critère 24).

	    Rend la phrase au lieu de l'annoncer : le déplacement du curseur a lui
	    aussi quelque chose à dire (voir `MESSAGE_RETOUR`), et deux appels
	    successifs à la région d'annonce en écraseraient un. Chaîne vide quand il
	    n'y a rien à signaler — on ne vide pas la région pour autant, la phrase
	    précédente n'a rien de faux. */
	const messageChangements = (avant: EtatMot[], apres: EtatMot[], p: PartieMotsCroises): string => {
		if (partieGagnee(p)) return 'Grille terminée.';
		const total = p.motif.emplacements.length;
		const trouves = motsTrouves(p);
		const nouveauJuste = apres.some((e, i) => e === 'juste' && avant[i] !== 'juste');
		const nouveauFaux = apres.some((e, i) => e === 'faux' && avant[i] !== 'faux');
		const trouve = `Mot trouvé, ${String(trouves)} sur ${String(total)}.`;
		if (nouveauJuste && nouveauFaux) return `${trouve} ${MESSAGE_FAUX}`;
		if (nouveauJuste) return trouve;
		if (nouveauFaux) return MESSAGE_FAUX;
		return '';
	};

	/** Le mot que la case touchée met en avant. Sur un croisement, AUCUN tant que
	    l'enfant n'a pas choisi — le jeu ne tranche pas à sa place (critère 19). */
	const choisirMot = (ligne: number, colonne: number): void => {
		const p = partie;
		if (!p) return;
		caseTouchee = { ligne, colonne };
		const places = motsSur(p.motif, ligne, colonne);
		if (places.length === 0) {
			motCourant = null;
			return;
		}
		if (places.some(({ emplacement }) => emplacement === motCourant)) return;
		motCourant = places.length === 1 ? places[0].emplacement : null;
	};

	/** Lit la définition tout haut quand l'encadrant a activé la lecture
	    automatique des consignes (critère 32). Rien ne se lit autrement : la
	    lecture part sinon d'un appui, toujours. */
	const lireSiDemande = (): void => {
		const p = partie;
		if (!p || motCourant === null || !lectureConsigneAuto() || !dicteeDisponible()) return;
		const definition = definitionDe(p.solution[motCourant]);
		if (definition) dicterConsigne(definition);
	};

	/** Amène le curseur sur une case SANS changer de mot : c'est le déplacement du
	    jeu (avance après une lettre, recul sur un retour arrière), pas un geste de
	    l'enfant. La case TOUCHÉE reste celle qu'il a touchée, donc le bandeau ne
	    bouge pas d'un pixel pendant qu'il écrit son mot — un choix de sens qui
	    apparaîtrait et disparaîtrait au passage de chaque croisement ferait sauter
	    la grille sous le doigt, et le critère 20 veut la définition STABLE. */
	const deplacerCurseur = (ligne: number, colonne: number): void => {
		curseurAutomatique = true;
		caseAt(ligne, colonne)?.focus();
		curseurAutomatique = false;
	};

	const surFocus = (e: FocusEvent): void => {
		const cible = (e.target as HTMLElement | null)?.closest<HTMLElement>('.mx-case');
		if (!cible || !partie) return;
		if (curseurAutomatique) {
			if (cible instanceof HTMLInputElement) cible.select();
			return;
		}
		const avant = motCourant;
		choisirMot(Number(cible.dataset.ligne), Number(cible.dataset.colonne));
		peindre();
		if (motCourant !== null && motCourant !== avant) lireSiDemande();
		/* Sélectionner le contenu fait que la frappe REMPLACE la lettre déjà posée :
		   sans ça, `maxlength="1"` bloque la saisie sur une case pleine, et l'enfant
		   devrait effacer tout son mot pour changer une lettre. */
		if (cible instanceof HTMLInputElement) cible.select();
	};

	const surSaisie = (e: Event): void => {
		const p = partie;
		const champ = e.target as HTMLInputElement | null;
		if (!p || !champ || !champ.classList.contains('mx-case')) return;
		const ligne = Number(champ.dataset.ligne);
		const colonne = Number(champ.dataset.colonne);
		const saisie = [...champ.value.normalize('NFC')];
		const derniere = saisie[saisie.length - 1] ?? '';

		if (derniere === '') {
			appliquer(effacerCase(p, ligne, colonne));
			return;
		}
		const avant = etats(p);
		const suivante = ecrire(p, ligne, colonne, derniere);
		if (suivante === p) {
			/* Refusé : ce n'était pas une lettre. Un appui refusé ne peut pas rester
			   MUET — l'enfant qui suit le jeu au lecteur d'écran taperait sans jamais
			   savoir pourquoi rien ne s'écrit. `peindre` remet la valeur du modèle. */
			peindre();
			annoncer('Seules les lettres s’écrivent dans la grille.');
			return;
		}
		appliquer(suivante);
		const message = messageChangements(avant, etats(suivante), suivante);
		if (partieGagnee(suivante)) {
			annoncer(message);
			dans<HTMLButtonElement>('#mxNouvelle')?.focus();
			return;
		}
		if (motCourant === null) {
			if (message) annoncer(message);
			return;
		}
		const cases = casesDe(suivante.motif.emplacements[motCourant]);
		const rang = cases.findIndex((c) => c.ligne === ligne && c.colonne === colonne);
		if (rang < 0) {
			if (message) annoncer(message);
			return;
		}
		const cible = prochaineVide(suivante, motCourant, rang);
		/* Le curseur est-il REPARTI EN ARRIÈRE ? C'est le seul moment où il ne va
		   pas là où l'enfant l'attend, et rien d'autre ne le lui dirait : le focus
		   se déplace en silence, l'anneau de la case suit sans commentaire, et la
		   case comblée est ailleurs dans le mot. Pour un enfant qui suit au lecteur
		   d'écran, ou dont l'attention lâche entre deux lettres, c'est exactement le
		   déplacement qu'on perd de vue. */
		const rangCible =
			cible === null
				? -1
				: cases.findIndex((c) => c.ligne === cible.ligne && c.colonne === cible.colonne);
		const retour = rangCible >= 0 && rangCible < rang ? MESSAGE_RETOUR : '';
		const dire = [message, retour].filter((t) => t !== '').join(' ');
		if (dire) annoncer(dire);
		if (cible) deplacerCurseur(cible.ligne, cible.colonne);
	};

	/** Retour arrière sur une case DÉJÀ vide : on recule d'une case et on l'efface.
	    Sur une case pleine, le navigateur vide le champ tout seul et `surSaisie`
	    s'en charge — intercepter les deux ici effacerait deux lettres d'un coup. */
	const surTouche = (e: KeyboardEvent): void => {
		const p = partie;
		const champ = e.target as HTMLInputElement | null;
		if (!p || !champ || !champ.classList.contains('mx-case')) return;
		if (e.key !== 'Backspace' || champ.value !== '' || motCourant === null) return;
		const ligne = Number(champ.dataset.ligne);
		const colonne = Number(champ.dataset.colonne);
		const cases = casesDe(p.motif.emplacements[motCourant]);
		const rang = cases.findIndex((c) => c.ligne === ligne && c.colonne === colonne);
		if (rang <= 0) return;
		e.preventDefault();
		const precedente = cases[rang - 1];
		appliquer(effacerCase(p, precedente.ligne, precedente.colonne));
		deplacerCurseur(precedente.ligne, precedente.colonne);
	};

	/** Efface le mot en cours, et lui seul (critère 23). Les lettres des cases
	    qu'un mot croisé déjà complet occupe aussi restent : on ne détruit pas le
	    travail d'un voisin que l'enfant n'a pas touché. */
	const effacerCourant = (): void => {
		const p = partie;
		if (!p || motCourant === null) return;
		appliquer(effacerMot(p, motCourant));
		annoncer('Mot effacé.');
		const depart = casesDe(p.motif.emplacements[motCourant])[0];
		deplacerCurseur(depart.ligne, depart.colonne);
	};

	/** Reprend la grille laissée en cours, ou en tire une neuve.

	    Le plafond n'est consulté que pour une grille NEUVE : reprendre n'est pas
	    commencer une partie, et l'écran ne s'ouvre de toute façon pas quand le
	    plafond est épuisé. C'est ce qui fait survivre la grille à son atteinte —
	    une grille de six définitions ne se finit pas en une session.

	    Trois issues et pas un booléen : le plafond referme l'écran tout seul, il
	    n'y a donc plus rien à dire ; la panne de tirage, elle, laisse l'écran
	    ouvert et doit se DIRE. Les confondre laisserait un jeu mort. */
	const charger = (): 'ok' | 'plafond' | 'panne' => {
		const reprise = partieEnCours();
		if (reprise) {
			partie = reprise;
			return 'ok';
		}
		if (!avantNouvellePartie?.()) return 'plafond';
		let neuve: PartieMotsCroises;
		try {
			neuve = tirerGrille(randFloat);
		} catch (erreur) {
			/* `tirerGrille` lève quand aucun motif ne se remplit : un défaut de
			   DONNÉES, jamais un aléa. On garde le message pour qui déboguera — un
			   `warn` et pas un `error`, l'enfant ayant déjà sa réponse à l'écran. */
			console.warn('[mots-croises] tirage impossible :', erreur);
			return 'panne';
		}
		partie = neuve;
		sauverPartie(neuve);
		return 'ok';
	};

	/** Vide le plateau et montre le panneau de panne : mieux vaut un écran qui dit
	    « pas de grille » qu'un écran qui fait semblant d'en avoir une. */
	const montrerPanne = (): void => {
		partie = null;
		motCourant = null;
		caseTouchee = null;
		const grille = dans('#mxGrille');
		if (grille) grille.innerHTML = '';
		const texte = dans('#mxDefTexte');
		if (texte) {
			texte.textContent = '';
			bascule(texte, 'data-plein', false);
		}
		const choix = dans<HTMLElement>('#mxChoix');
		if (choix) {
			choix.hidden = true;
			delete choix.dataset.pour;
			choix.innerHTML = '';
		}
		const ecoute = dans('#mxDefEcoute');
		if (ecoute) ecoute.hidden = true;
		const effacer = dans<HTMLButtonElement>('#mxEffacer');
		if (effacer) effacer.disabled = true;
		const progres = dans('#mxProgres');
		if (progres) progres.textContent = '';
		/* Les actions courantes disparaissent avec la grille : sans grille, « Effacer
		   ce mot » n'a plus d'objet et « Changer de grille » ferait le même geste que
		   le « Réessayer » du panneau, à trois centimètres de lui. */
		for (const id of ['#mxSignal', '#mxFin', '#mxActions']) {
			const el = dans(id);
			if (el) el.hidden = true;
		}
		const panne = dans('#mxPanne');
		if (panne) panne.hidden = false;
		annoncer(MESSAGE_PANNE);
	};

	/** Charge et rend `true` quand la partie est prête. Les deux échecs se traitent
	    ICI, une fois pour toutes, pour qu'aucun appelant n'en oublie un. */
	const preparer = (): boolean => {
		const issue = charger();
		if (issue === 'panne') montrerPanne();
		return issue === 'ok';
	};

	const rendreEtat = (annonce: string): void => {
		motCourant = null;
		caseTouchee = null;
		/* La signature du choix de sens est faite d'index d'emplacements : sur une
		   grille neuve du MÊME motif, elle se répéterait à l'identique alors que les
		   définitions ont changé. On l'oublie donc à chaque grille. */
		const choix = dans<HTMLElement>('#mxChoix');
		if (choix) delete choix.dataset.pour;
		const panne = dans('#mxPanne');
		if (panne) panne.hidden = true;
		construire();
		peindre();
		annoncer(annonce);
	};

	const nouvelleGrille = (): void => {
		effacerPartie();
		if (!preparer()) return;
		rendreEtat('Nouvelle grille.');
		dans<HTMLInputElement>('.mx-case')?.focus();
	};

	/** Changer de grille est TOUJOURS possible, sans que la grille ait à être finie
	    (critère 30) : l'enfant coincé sur une définition n'a pas à démontrer qu'il
	    est coincé pour avoir une porte de sortie.

	    La confirmation n'est pas cette démonstration : elle ne protège que du
	    geste involontaire, et seulement quand il y a quelque chose à perdre. Une
	    grille encore vierge change sans friction, et le choix sûr — garder la
	    grille — est celui qui reçoit le focus. */
	const changerGrille = (): void => {
		const p = partie;
		if (!p || Object.keys(p.lettres).length === 0 || partieGagnee(p)) {
			nouvelleGrille();
			return;
		}
		void uiConfirm({
			emoji: '🔁',
			title: 'Tu as une grille en cours !',
			message: 'Changer de grille effacera les lettres que tu as déjà écrites.',
			cancelLabel: 'Non, je garde ma grille',
			confirmLabel: 'Changer quand même',
			destructive: true,
		}).then((changer) => {
			if (changer) nouvelleGrille();
		});
	};

	const surClic = (e: MouseEvent): void => {
		const cible = e.target as HTMLElement | null;
		if (!cible) return;

		/* Les deux seuls boutons qui doivent répondre SANS partie : celui de la
		   panne est là précisément parce qu'il n'y en a pas, et la règle du jeu ne
		   dépend d'aucune grille. */
		if (cible.closest('#mxReessayer')) {
			nouvelleGrille();
			return;
		}
		/* La règle ne se lit QUE sur demande : contrairement à un énoncé
		   d'exercice, elle ne change jamais d'une grille à l'autre. */
		if (cible.closest('#mxEcouterRegle')) {
			dicterConsigne(REGLE);
			return;
		}
		/* Deux boutons, deux moments, deux libellés. « Nouvelle grille » n'apparaît
		   qu'à la fin, quand il n'y a plus rien à perdre : il sert sans rien
		   demander. « Changer de grille » reste là du début à la fin (critère 30) et
		   demande confirmation quand du travail est en jeu. */
		if (cible.closest('#mxNouvelle')) {
			nouvelleGrille();
			return;
		}
		if (cible.closest('#mxChanger')) {
			changerGrille();
			return;
		}

		const p = partie;
		if (!p) return;

		const bSens = cible.closest<HTMLElement>('.mx-sens');
		if (bSens) {
			motCourant = Number(bSens.dataset.emplacement);
			peindre();
			lireSiDemande();
			/* Retour sur la case touchée : c'est là que l'enfant a mis le doigt, et
			   c'est là que le clavier doit s'ouvrir. */
			if (caseTouchee) caseAt(caseTouchee.ligne, caseTouchee.colonne)?.focus();
			return;
		}

		if (cible.closest('#mxDefEcoute')) {
			const definition = motCourant === null ? '' : (definitionDe(p.solution[motCourant]) ?? '');
			if (definition) dicterConsigne(definition);
			return;
		}

		if (cible.closest('#mxEffacer')) effacerCourant();
	};

	return {
		monter(hote, demanderPartie) {
			avantNouvellePartie = demanderPartie;
			hote.innerHTML = plateauHTML().balisage;
			racine = hote.querySelector<HTMLElement>('.mx');
			racine?.addEventListener('click', surClic);
			racine?.addEventListener('focusin', surFocus);
			racine?.addEventListener('input', surSaisie);
			racine?.addEventListener('keydown', surTouche);
			const ecouter = dans('#mxEcouterRegle');
			if (ecouter && dicteeDisponible()) ecouter.hidden = false;
			if (!preparer()) return;
			rendreEtat('Grille prête.');
		},
		demonter() {
			racine?.removeEventListener('click', surClic);
			racine?.removeEventListener('focusin', surFocus);
			racine?.removeEventListener('input', surSaisie);
			racine?.removeEventListener('keydown', surTouche);
			/* Une grille abandonnée est déjà sauvée : chaque lettre écrite et chaque
			   effacement écrivent, ce qui la rend robuste au plafond qui tombe comme à
			   l'onglet qu'on ferme. */
			racine = null;
			partie = null;
			motCourant = null;
			caseTouchee = null;
			avantNouvellePartie = null;
		},
	};
}

/* L'id est écrit EN CLAIR, pas rangé dans une constante : deux gates lisent ce
   fichier au motif « nom de la fonction, puis l'id entre apostrophes » pour le
   rattacher au catalogue et à sa spec Playwright, et une constante y passerait
   pour un id vide. */
enregistrerJeu('mots-croises', creerRunner);
