/* ============================================================
   Étagère de jeux (#661) — le RUNNER du « mot caché » (Motus).

   Un jeu, pas une leçon : il ne corrige rien, ne note rien, n'alimente aucun
   compteur, et n'appelle JAMAIS `capterErreur` (critère 24). Une proposition
   fausse n'est pas une erreur d'enfant, c'est un coup joué — la remonter dans
   le journal de l'espace encadrant ferait passer un cadeau pour un contrôle.

   Ce module ne contient AUCUNE règle du jeu : le correcteur à trois états, le
   budget d'essais, le vivier curé et le tirage vivent dans
   `src/core/jeux/motus.ts`, testés sans DOM. Ici, seulement du rendu et des
   gestes. Le cadre commun (titre, bouton de retour, décompte du temps, plafond)
   vit dans `jeux-ecran.ts` : on ne le refait pas non plus.

   Trois décisions de rendu qui portent chacune un critère, et qu'il ne faut pas
   « simplifier » sans relire l'issue :

   - LE CLAVIER À L'ÉCRAN EST AUSSI LE RÉSUMÉ (critères 18 et 46). Une seule
     pièce fait les deux : on joue au doigt sans clavier physique, et chaque
     lettre y porte son meilleur statut connu, cumulé sur la partie. Les deux
     besoins pointent le même objet — les séparer obligerait l'enfant à regarder
     à deux endroits ce qui est une seule information. L'ordre est ALPHABÉTIQUE
     et non AZERTY : un CE2 n'est pas dactylo, il cherche une lettre comme dans
     l'alphabet, et c'est aussi ce que dit le critère 46 (« l'alphabet est
     affiché en résumé »).

   - LE MOT CORRECT EST LA DERNIÈRE CHOSE VUE (critères 34 et 35). Il s'affiche
     SOUS la grille, donc après les tentatives fautives, et il reste là jusqu'à
     ce que l'enfant demande un autre mot. Rien ne le recouvre, rien ne le
     chasse au bout de n secondes. C'est LA mesure qui empêche l'effet de
     récence de faire retenir la dernière tentative, souvent proche et fausse,
     comme la bonne graphie.

   - AUCUN COMPTE À REBOURS, aucune escalade (critères 12 et 17 du cadrage). Ni
     « il te reste 2 essais », ni rouge qui monte quand les lignes se
     remplissent. Les lignes vides disent déjà tout ce qu'il y a à dire, et
     elles le disent sans presser personne.
   ============================================================ */
import type { SchoolLevel } from '../core/catalog';
import { attribut, drapeau, html, joindre, VIDE, type SafeHtml } from '../core/html';
import { jeuParId } from '../core/jeux/catalogue';
import { enregistrerScore, meilleurScore } from '../core/jeux/etat';
import {
	budgetEssais,
	evaluerEssai,
	statutsCumules,
	tirerMot,
	vivierMots,
	type EtatLettre,
} from '../core/jeux/motus';
import { closestSupported } from '../core/levels';
import { niveauActifMatiere } from '../core/niveau-actif';
import { enregistrerJeu, type RunnerJeu } from './jeux-ecran';

const ID_JEU = 'motus';

type Issue = 'gagne' | 'perdu' | null;

interface Essai {
	/** La proposition, telle qu'elle a été saisie (minuscules, NFC). */
	mot: string;
	/** Un état par lettre PROPOSÉE — pas par case de la grille. */
	etats: EtatLettre[];
}

/* Le retour à trois états dit en toutes lettres, pour qui ne voit pas les
   couleurs. Le doublage VISUEL (forme, légende fixe) appartient à #663 : ce
   module se contente de porter l'information sur `data-etat`, pour que le lot
   suivant n'ait qu'à styler. Ce pendant non visuel, lui, n'a aucune raison
   d'attendre — il ne coûte qu'un attribut. */
const LIBELLE_ETAT: Record<EtatLettre, string> = {
	placee: 'bien placée',
	ailleurs: 'dans le mot, mais ailleurs',
	absente: 'pas dans le mot',
};

/* Une lettre, accents compris. Sert à filtrer la frappe physique : le jeu
   n'accepte pas les chiffres ni la ponctuation, non pas pour refuser une
   proposition (critère 29 l'interdit) mais parce qu'aucune case de la grille ne
   pourrait les recevoir. */
const LETTRE = /^[a-zà-öø-ÿœæ]$/;

const ALPHABET = [...'abcdefghijklmnopqrstuvwxyz'];

/** Le niveau scolaire sous lequel jouer : celui du français pour ce profil,
    ramené aux classes où le jeu existe.

    Le ramener n'est PAS un calibrage déguisé (le lot 1 n'en fait aucun, cf. le
    critère 14 amendé) : c'est une garde. Un profil CP ou CE1 dont l'étagère
    contiendrait ce jeu verrait un vivier VIDE — toutes les séries thématiques
    sont étiquetées `ce2` — et `tirerMot` n'aurait rien à tirer. */
function niveauDeJeu(): SchoolLevel {
	return closestSupported(jeuParId(ID_JEU)?.levels ?? [], niveauActifMatiere('francais'));
}

/** Les touches du clavier-résumé : l'alphabet, plus les lettres accentuées que
    le vivier contient RÉELLEMENT.

    Calculé sur le vivier ENTIER, jamais sur le mot en cours : la liste est donc
    la même à chaque partie et ne souffle rien. Et elle se met à jour toute
    seule quand #663 élargira le vivier — une lettre nouvelle apparaîtra sans
    qu'on ait à y penser, là où une liste écrite à la main aurait rendu certains
    mots impossibles à taper au doigt.

    Tri par collation française : `é` se range juste après `e`, `ç` après `c`.
    L'enfant cherche une lettre accentuée là où il cherche sa lettre de base,
    pas dans un appendice en fin d'alphabet. */
function lettresClavier(niveau: SchoolLevel): string[] {
	const lettres = new Set(ALPHABET);
	for (const mot of vivierMots(niveau)) for (const c of mot) lettres.add(c);
	return [...lettres].sort((a, b) => a.localeCompare(b, 'fr'));
}

/* La saisie et les mots du vivier doivent se comparer sur le même pied. Surtout
   PAS de suppression des diacritiques : ce serait l'inverse du critère 33. */
function normaliser(v: string): string {
	return v.trim().toLowerCase().normalize('NFC');
}

/* ---------- Fragments de rendu ---------- */

function caseVideHTML(): SafeHtml {
	return html`<span class="motus-case" aria-hidden="true"></span>`;
}

function caseHTML(lettre: string, etat: EtatLettre): SafeHtml {
	const maj = lettre.toUpperCase();
	return html`<span
		class="motus-case"
		data-etat="${etat}"
		role="img"
		aria-label="${maj + ', ' + LIBELLE_ETAT[etat]}"
		>${maj}</span
	>`;
}

/** Une ligne d'essai joué. Les cases manquantes (proposition plus COURTE que le
    mot caché — le jeu ne refuse jamais une saisie) restent vides pour que les
    colonnes de la grille ne se décalent pas. */
function ligneEssaiHTML(essai: Essai, largeur: number): SafeHtml {
	const lettres = [...essai.mot];
	const cases = lettres.map((l, i) => caseHTML(l, essai.etats[i] ?? 'absente'));
	for (let i = lettres.length; i < largeur; i++) cases.push(caseVideHTML());
	return html`<div class="motus-ligne">${joindre(cases)}</div>`;
}

/** Une ligne encore à jouer. `aria-hidden` : une rangée de cases vides n'a rien
    à dire à un lecteur d'écran, et il y en a jusqu'à six. */
function ligneVideHTML(largeur: number): SafeHtml {
	const cases: SafeHtml[] = [];
	for (let i = 0; i < largeur; i++) cases.push(caseVideHTML());
	return html`<div class="motus-ligne motus-ligne-vide" aria-hidden="true">
		${joindre(cases)}
	</div>`;
}

function toucheHTML(lettre: string, etat: EtatLettre | undefined, jouable: boolean): SafeHtml {
	const maj = lettre.toUpperCase();
	return html`<button
		type="button"
		class="motus-touche"
		data-lettre="${lettre}"
		${etat ? attribut('data-etat', etat) : VIDE}
		aria-label="${etat ? maj + ', ' + LIBELLE_ETAT[etat] : maj}"
		${jouable ? VIDE : drapeau('disabled')}
	>
		${maj}
	</button>`;
}

/* ---------- Le runner ---------- */

function creerRunner(): RunnerJeu {
	const niveau = niveauDeJeu();
	const lettres = lettresClavier(niveau);

	let racine: HTMLElement | null = null;
	let vue: HTMLElement | null = null;
	let annonce: HTMLElement | null = null;
	/* Fourni par `jeux-ecran.ts`. Remis à un no-op au démontage : ce rappel peut
	   nous démonter nous-mêmes (fin par plafond), il ne doit pas rester joignable
	   après coup. */
	let avantNouvellePartie: () => boolean = () => true;
	let vivant = false;

	let mot = '';
	let budget = 0;
	let essais: Essai[] = [];
	let issue: Issue = null;
	/* Mots déjà sortis DANS CETTE SESSION : un mot perdu ne revient pas à chaud
	   (critère 36), ce qui transformerait le cadeau en épreuve de rattrapage.
	   `tirerMot` repart du vivier entier si tout est exclu. */
	let joues: string[] = [];
	/* Le score du critère 17 : « le plus grand nombre de mots trouvés d'affilée ».
	   La série court sur la session ; seul le RECORD est persisté, et il ne sort
	   jamais du jeu (ni profil, ni encadrant, ni trophée, ni classement). */
	let serie = 0;

	function champSaisie(): HTMLInputElement | null {
		return vue?.querySelector<HTMLInputElement>('#motusSaisie') ?? null;
	}

	function nouvellePartie(): void {
		mot = tirerMot(niveau, joues, Math.random);
		if (mot) joues.push(mot);
		budget = budgetEssais([...mot].length);
		essais = [];
		issue = null;
	}

	/* ---------- Rendu ---------- */

	function serieHTML(): SafeHtml {
		const record = meilleurScore(ID_JEU);
		/* Rien à afficher tant qu'il n'y a rien à raconter : un « Record : 0 » à
		   l'ouverture annoncerait un compteur à remplir là où on offre un jeu. */
		if (!serie && !record) return VIDE;
		return html`<p class="motus-serie">
			Mots trouvés d'affilée : ${serie}${record ? html` · Ton record : ${record}` : VIDE}
		</p>`;
	}

	/* Fin de partie. Le mot révélé est le point de mire : il vient juste sous les
	   tentatives (critère 35 — aucune tentative fautive ne reste visible sans le
	   mot correct après elle), et le bouton « un autre mot » est DERRIÈRE lui, si
	   bien qu'on ne peut pas continuer sans passer devant (critère 34). */
	function finHTML(): SafeHtml {
		if (!issue) return VIDE;
		return html`<div class="motus-fin" data-issue="${issue}">
			<p class="motus-fin-texte">
				${issue === 'gagne' ? 'Bravo ! Tu as trouvé :' : 'Le mot caché était :'}
			</p>
			<p class="motus-mot-revele">${mot.toUpperCase()}</p>
			<p class="motus-fin-note">Regarde-le bien.</p>
			<button type="button" class="motus-btn" id="motusSuivant">Un autre mot</button>
		</div>`;
	}

	function plateauHTML(): SafeHtml {
		const largeur = [...mot].length;
		const jouable = issue === null;
		const statuts = statutsCumules(essais);

		const lignes = essais.map((e) => ligneEssaiHTML(e, largeur));
		for (let i = essais.length; i < budget; i++) lignes.push(ligneVideHTML(largeur));

		return html`${serieHTML()}
			<p class="motus-consigne">Trouve le mot caché. Il a ${largeur} lettres.</p>
			<div class="motus-grille">${joindre(lignes)}</div>
			${finHTML()}
			<div class="motus-saisie-zone">
				<label class="motus-saisie-label" for="motusSaisie">Ton mot</label>
				<input
					type="text"
					id="motusSaisie"
					class="motus-saisie"
					inputmode="none"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					maxlength="${largeur}"
					${jouable ? VIDE : drapeau('disabled')}
				/>
				<div class="motus-actions">
					<button type="button" class="motus-btn motus-btn-doux" id="motusEffacer" ${
						jouable ? VIDE : drapeau('disabled')
					}>
						Effacer
					</button>
					<button type="button" class="motus-btn" id="motusValider" ${jouable ? VIDE : drapeau('disabled')}>
						Valider
					</button>
				</div>
			</div>
			<div class="motus-clavier" id="motusClavier">
				${joindre(lettres.map((l) => toucheHTML(l, statuts.get(l), jouable)))}
			</div>`;
	}

	/* Ce qu'un lecteur d'écran entend après un coup. La région vit HORS du
	   fragment re-rendu (cf. `monter`) : une région live recréée à chaque rendu
	   n'est pas annoncée de façon fiable, seule la mutation de son contenu l'est. */
	function texteAnnonce(): string {
		if (issue) {
			const debut = issue === 'gagne' ? 'Bravo, tu as trouvé.' : 'Partie terminée.';
			return `${debut} Le mot était ${mot.toUpperCase()}.`;
		}
		const dernier = essais[essais.length - 1];
		if (!dernier) return '';
		return [...dernier.mot]
			.map((l, i) => `${l.toUpperCase()} ${LIBELLE_ETAT[dernier.etats[i] ?? 'absente']}`)
			.join(', ');
	}

	function rendre(): void {
		if (!vue) return;
		vue.innerHTML = plateauHTML().balisage;
		if (annonce) annonce.textContent = texteAnnonce();
	}

	/* ---------- Gestes ---------- */

	function ajouterLettre(lettre: string): void {
		const champ = champSaisie();
		if (!champ || issue) return;
		/* La ligne a autant de cases que le mot : au-delà, il n'y a plus de case où
		   poser la lettre. Ce n'est pas le refus d'une proposition (critère 29) —
		   aucune suite de lettres n'est jugée, aucun message n'est affiché ; c'est
		   la largeur de la grille. */
		if ([...champ.value].length >= [...mot].length) return;
		champ.value += lettre;
	}

	function effacer(): void {
		const champ = champSaisie();
		if (!champ || issue) return;
		const restantes = [...champ.value];
		restantes.pop();
		champ.value = restantes.join('');
	}

	/** Joue la proposition courante. Toute suite de lettres passe et consomme un
	    essai (critère 29) : il n'existe aucun dictionnaire d'acceptation, « ZZZZZ »
	    est simplement tout gris. */
	function valider(): void {
		if (issue) return;
		const propose = normaliser(champSaisie()?.value ?? '');
		/* Champ vide : il n'y a rien à proposer. On ne consomme pas d'essai et on
		   ne dit rien — refuser suppose une proposition, il n'y en a pas. */
		if (!propose) return;
		essais.push({ mot: propose, etats: evaluerEssai(propose, mot) });
		if (propose === mot) {
			/* Gagné se lit sur les MOTS, jamais sur les couleurs : une proposition
			   plus courte que le mot caché peut être « tout bien placé » sans être
			   le mot (« forê » face à « forêt »). */
			issue = 'gagne';
			serie += 1;
			enregistrerScore(ID_JEU, serie);
		} else if (essais.length >= budget) {
			issue = 'perdu';
			serie = 0;
		}
		rendre();
	}

	/** Passe au mot suivant — et c'est ICI qu'on signale la fin de partie au cadre.

	    Pas au moment où la partie se termine, et c'est délibéré : `finPartie`
	    vérifie le plafond du jour et peut nous démonter séance tenante pour
	    ramener à l'étagère. Appelé à la révélation, il emporterait le mot correct
	    avant que l'enfant ait pu le lire — systématiquement à la dernière partie
	    de la journée, c'est-à-dire tous les jours. Le critère 34 dit l'inverse :
	    la révélation ne disparaît pas avant une action de l'enfant. Cette action,
	    la voici ; le temps de lecture est compté comme du temps de jeu, ce qu'il
	    est. Sortir par « Retour à mes jeux » décompte de toute façon le temps. */
	function motSuivant(): void {
		if (!issue) return;
		// `false` = plafond du jour épuisé ; le cadre a déjà ramené à l'étagère.
		if (!avantNouvellePartie() || !vivant) return;
		nouvellePartie();
		rendre();
	}

	function surClic(e: Event): void {
		const cible = e.target instanceof Element ? e.target : null;
		if (!cible) return;
		const touche = cible.closest<HTMLElement>('.motus-touche');
		if (touche?.dataset.lettre) {
			ajouterLettre(touche.dataset.lettre);
			return;
		}
		if (cible.closest('#motusEffacer')) effacer();
		else if (cible.closest('#motusValider')) valider();
		else if (cible.closest('#motusSuivant')) motSuivant();
	}

	/* Le champ reste éditable (donc utilisable au clavier physique, et remplissable
	   par une spec Playwright), mais `inputmode="none"` évite d'ouvrir le clavier
	   du système par-dessus le nôtre. On borne et on filtre ici ce qui y entre. */
	function surSaisie(e: Event): void {
		const champ = e.target;
		if (!(champ instanceof HTMLInputElement) || champ.id !== 'motusSaisie') return;
		const propre = [...normaliser(champ.value)]
			.filter((c) => LETTRE.test(c))
			.slice(0, [...mot].length)
			.join('');
		if (propre !== champ.value) champ.value = propre;
	}

	/* Clavier physique. Posé sur le PLATEAU, et pas sur le champ (il faudrait viser
	   la zone de saisie avant de pouvoir taper) ni sur le document.

	   Pas sur le document, et ce n'est pas un détail : `#btnHome` quitte l'écran
	   d'un jeu sans passer par `quitterJeu`, donc sans `demonter`. Un écouteur
	   global survivrait à ce départ et continuerait d'avaler les touches — Entrée
	   comprise — sur l'accueil et dans les leçons. Sur le plateau, le problème ne
	   se pose pas : une fois l'écran masqué, plus rien n'y a le focus. */
	function surTouche(e: KeyboardEvent): void {
		if (!vivant) return;
		const champ = champSaisie();
		if (!champ) return;
		const cible = e.target;
		/* Un bouton a le focus (le bandeau de retour, une touche à l'écran) : Entrée
		   et Espace lui appartiennent, on ne les lui vole pas. */
		if (cible instanceof HTMLElement && cible !== champ && cible.closest('button')) return;
		if (e.ctrlKey || e.altKey || e.metaKey) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			if (issue) motSuivant();
			else valider();
			return;
		}
		if (cible === champ) return; // le champ gère lui-même la frappe et l'effacement
		if (e.key === 'Backspace') {
			e.preventDefault();
			effacer();
			return;
		}
		if (LETTRE.test(e.key.toLowerCase())) {
			e.preventDefault();
			ajouterLettre(e.key.toLowerCase());
		}
	}

	return {
		monter(hote: HTMLElement, demanderPartie: () => boolean): void {
			racine = hote;
			avantNouvellePartie = demanderPartie;
			vivant = true;
			joues = [];
			serie = 0;
			/* Deux zones : la vue re-rendue à chaque coup, et une région live qui,
			   elle, ne bouge pas de place — seul son texte change. */
			hote.innerHTML = html`<div class="motus" id="motusVue"></div>
				<p class="sr-only" id="motusAnnonce" role="status" aria-live="polite"></p>`.balisage;
			vue = hote.querySelector<HTMLElement>('#motusVue');
			annonce = hote.querySelector<HTMLElement>('#motusAnnonce');
			nouvellePartie();
			rendre();
			hote.addEventListener('click', surClic);
			hote.addEventListener('input', surSaisie);
			hote.addEventListener('keydown', surTouche);
			/* Le plateau prend le focus pour que la frappe physique arrive quelque
			   part, sans focaliser le CHAMP : sur tablette, focaliser un champ risque
			   d'ouvrir le clavier du système par-dessus le nôtre. Un conteneur, lui,
			   n'en ouvre aucun. `preventScroll` parce que `showJeuView` fait défiler
			   la page juste après. */
			hote.tabIndex = -1;
			hote.focus({ preventScroll: true });
		},
		demonter(): void {
			vivant = false;
			racine?.removeEventListener('click', surClic);
			racine?.removeEventListener('input', surSaisie);
			racine?.removeEventListener('keydown', surTouche);
			racine = null;
			vue = null;
			annonce = null;
			avantNouvellePartie = () => true;
		},
	};
}

/* Enregistrement par EFFET D'IMPORT, comme le prévoit `jeux-ecran.ts` : c'est
   ce qui permet au cadre de ne connaître aucun jeu en particulier.

   L'id est écrit ICI en clair, et pas `ID_JEU`, alors que c'est la même chaîne :
   `tests/couverture-e2e-gate.test.ts` lit le fichier SOURCE pour rattacher ce
   runner à sa spec, et n'y cherche que le littéral. Passer la constante fait
   échouer le gate avec « ce runner n'est atteignable par aucune route ». */
enregistrerJeu('motus', creerRunner);
