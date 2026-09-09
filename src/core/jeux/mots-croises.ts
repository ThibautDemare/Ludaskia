/* ============================================================
   Mots croisés (#665) — le JEU : vivier, tirage, saisie lettre à lettre.

   Trois briques assemblées ici, et aucune n'est réécrite : le moteur générique
   (`grille-mots.ts`, qui ne connaît que la géométrie et le remplissage), les
   motifs (`../../data/jeux/motifs-mots-croises.ts`, qui ne sont que du dessin) et
   la banque de définitions (`../../data/francais/definitions.ts`). Ce qui
   appartient en propre à ce module, c'est le FRANÇAIS et la SAISIE : quels mots
   peuvent être demandés, et ce que devient la grille quand l'enfant y écrit une
   lettre.

   ── Pourquoi la saisie ne vit pas dans le moteur ────────────────────────────

   `Grille`, `poser`, `lettresEn` et `terminee` modélisent « un mot posé par
   emplacement », et une case peut y réclamer DEUX lettres quand deux mots posés
   se contredisent. C'est le bon modèle pour les mots casés, où l'enfant pose des
   mots entiers. Ici une case porte exactement UNE lettre — c'est l'arbitrage 2
   du cadrage, et c'est de là que vient le critère 24 : écrire dans une case
   partagée réévalue les DEUX mots qui la traversent, parce qu'il n'y a pas de
   place pour deux avis. Tordre le moteur pour l'y faire entrer aurait donné deux
   modèles à régler au lieu d'un.

   Le REMPLISSAGE, lui, est repris tel quel : trouver un jeu de mots qui tient
   dans un dessin ne demande aucune connaissance du français, et
   `choisirRemplissage` prend sa liste de mots en paramètre. C'est la promesse
   faite en #664, tenue sans changer une ligne du moteur.

   ── La solution est DANS la partie, contrairement aux mots casés ────────────

   Là-bas, l'exposer aurait donné un indice tout prêt. Ici le critère 25
   l'impose : « un mot complété est comparé à la solution, automatiquement ». Le
   modèle ne peut pas comparer à ce qu'il n'a pas. Que le DOM n'en laisse rien
   filtrer (critère 44) est une autre affaire, et c'est celle du runner.

   ── L'ACCENT : jamais jugé, affiché quand le MOT est trouvé ─────────────────

   Décision du mainteneur, et elle tient en trois temps qu'il ne faut pas
   mélanger.

   • **La comparaison ignore les accents** (`plierLettre`). Taper « é » demande un
     appui long sur un clavier Android — un geste fin, hors de propos pour un jeu
     qui ne travaille pas la frappe. Un enfant qui écrit ECOLE a trouvé le mot.
   • **Le modèle range la lettre TAPÉE**, telle quelle (`ecrire`, `lettreEn`).
   • **La forme accentuée s'affiche quand le MOT est juste**, et pas avant
     (`lettreAffichee`). Habiller la case dès que la LETTRE est bonne dirait à
     l'enfant, lettre par lettre, qu'il a raison — ce que le critère 26 refuse —
     et le dirait seulement sur les mots accentués, donc de façon partielle et
     indétectable. Une fois le mot trouvé, l'accent n'apprend plus rien de la
     justesse et ne laisse que l'exposition à la forme correcte, qui est le seul
     bénéfice de langue de ce jeu.

   Ce que ça pèse, mesuré sur la banque : 57 mots sur 231 portent un accent
   (â ç è é ê ô), et 123 grilles sur 200 en contiennent au moins un. Ni un cas
   limite, ni une élégance.

   Tout est pur : l'aléa est injecté, rien n'est lu ni écrit, et aucune fonction
   ne mute la partie qu'elle reçoit.
   ============================================================ */
import { DEFINITIONS } from '../../data/francais/definitions';
import { MOTIFS_MOTS_CROISES } from '../../data/jeux/motifs-mots-croises';
import { casesDe, choisirRemplissage, type Motif } from './grille-mots';

/** Une partie servie : le dessin, sa solution (un mot par emplacement, dans
    l'ordre du motif), et les lettres écrites par l'enfant.

    Les lettres sont indexées « ligne,colonne » et non par mot : c'est la CASE
    qui porte la lettre, une seule, quel que soit le nombre de mots qui la
    traversent. Toute la mécanique du critère 24 tient dans ce choix-là. */
export interface PartieMotsCroises {
	motif: Motif;
	solution: readonly string[];
	/** Une entrée par case REMPLIE, en minuscules NFC. Une case vide n'a pas
	    d'entrée : `null` et « absent » diraient la même chose deux fois. */
	lettres: Readonly<Record<string, string>>;
}

/** Ce qu'un emplacement montre à l'enfant. `faux` n'est atteignable que sur un
    mot COMPLET : tant qu'il manque une case, le jeu ne dit rien (critère 26). */
export type EtatMot = 'vide' | 'en-cours' | 'juste' | 'faux';

/* Une case porte une lettre : ni espace, ni apostrophe, ni trait d'union. Même
   filtre que le vivier des mots casés et que la banque de définitions. */
const FORME_JOUABLE = /^[a-zà-öø-ÿœæ]+$/;

/** Une seule lettre, quelle qu'elle soit. Sert de garde-fou à l'entrée : un
    « ## », un chiffre ou une espace déborderait d'une case de 44 px, et rien au
    clavier ne permettrait ensuite de le corriger. */
const UNE_LETTRE = /^\p{L}$/u;

const nfc = (s: string): string => s.normalize('NFC');

const bas = (s: string): string => nfc(s).toLocaleLowerCase('fr');

/** La clé d'une case. Une chaîne et non un couple : c'est ce qui rend l'état
    sérialisable tel quel, donc relisible sans conversion (critère 38). */
export const cleCase = (ligne: number, colonne: number): string => `${ligne},${colonne}`;

/** La lettre, dépouillée de sa casse ET de son accent : c'est la forme sur
    laquelle le jeu COMPARE, jamais celle qu'il affiche. */
export const plierLettre = (lettre: string): string =>
	bas(lettre).normalize('NFD').replace(/\p{M}/gu, '');

/** Une seule lettre ? Exporté parce que la relecture du stockage en a besoin :
    la même règle doit border l'écriture et la restauration, sans quoi une valeur
    bricolée entrerait par la porte que la saisie ferme. */
export const estLettre = (x: unknown): x is string =>
	typeof x === 'string' && UNE_LETTRE.test(nfc(x));

/** Les lettres d'un mot, en NFC : une entrée par lettre perçue. */
export const lettresDe = (mot: string): string[] => [...nfc(mot)];

/* ---------- Le vivier et les définitions ---------- */

/* Calculés une fois : ils ne dépendent que de données statiques. */
let cacheVivier: string[] | null = null;
let cacheDefinitions: Map<string, string> | null = null;

function banque(): Map<string, string> {
	cacheDefinitions ??= new Map(DEFINITIONS.map((d) => [bas(d.mot), d.def]));
	return cacheDefinitions;
}

/** Tous les mots que le jeu peut DEMANDER : ceux de la banque de définitions, et
    eux seuls. C'est la règle qui distingue ce vivier de celui des mots casés — un
    mot sans définition donnerait un emplacement sans énoncé, que l'enfant devrait
    deviner sans rien lire.

    Les mots-outils et les interjections en sont absents d'eux-mêmes : ils sont
    déclarés indéfinissables dans `MOTS_SANS_DEFINITION`, donc sans entrée ici.

    Aucun filtre de LONGUEUR. Les mots de neuf lettres et plus n'entrent dans
    aucune grille de sept lignes, mais les écarter du vivier ne gagnerait rien
    (le solveur les range par longueur, personne ne les regarde) et ferait
    dépendre le vivier des motifs livrés — un dessin de plus, et il faudrait y
    repenser.

    Rend une COPIE : le tableau gardé en cache serait sinon corruptible par
    n'importe quel appelant, et la contamination toucherait toutes les grilles
    suivantes. */
export function vivierMotsCroises(): string[] {
	if (!cacheVivier) {
		const vus = new Set<string>();
		for (const d of DEFINITIONS) {
			const mot = bas(d.mot);
			if (FORME_JOUABLE.test(mot)) vus.add(mot);
		}
		cacheVivier = [...vus];
	}
	return [...cacheVivier];
}

/** La définition d'un mot, ou `undefined` s'il n'en a pas. Le silence, jamais une
    phrase de secours : un emplacement sans définition doit être IMPOSSIBLE à
    servir, pas discrètement muet. */
export function definitionDe(mot: string): string | undefined {
	return banque().get(bas(mot));
}

/* ---------- Le tirage ---------- */

/** Tire une grille : un motif, sa solution, et pas une lettre écrite.

    Lève quand AUCUN motif ne se remplit. C'est la lecture directe du critère 16
    — servir une grille sans solution laisserait l'enfant tourner en rond sans
    jamais comprendre pourquoi. Le cas est théorique avec les motifs livrés
    (mesurés à 20 remplissages sur 20 chacun) : c'est le garde-fou d'un dessin
    futur trop dense, et le runner l'ATTRAPE pour montrer un panneau plutôt que de
    laisser un jeu mort à l'écran.

    `mots` par défaut, c'est le vivier ; le paramètre existe pour rendre ce chemin
    d'échec atteignable sans toucher aux données. Pur : l'aléa est injecté. */
export function tirerGrille(
	r: () => number,
	mots: readonly string[] = vivierMotsCroises(),
): PartieMotsCroises {
	const trouve = choisirRemplissage(MOTIFS_MOTS_CROISES, mots, r);
	if (!trouve) {
		throw new Error(
			'Aucun motif de mots croisés ne se remplit : vivier trop pauvre, ou croisements trop denses.',
		);
	}
	return { motif: trouve.motif, solution: trouve.solution, lettres: {} };
}

/* ---------- La géométrie d'une case ---------- */

/** Les emplacements qui traversent cette case, avec le rang de la case DANS
    chacun d'eux. Vide sur une case hors mot — un trou du dessin, ou une
    coordonnée qui n'existe pas. */
export function motsSur(
	motif: Motif,
	ligne: number,
	colonne: number,
): { emplacement: number; rang: number }[] {
	const out: { emplacement: number; rang: number }[] = [];
	motif.emplacements.forEach((e, i) => {
		const rang = casesDe(e).findIndex((c) => c.ligne === ligne && c.colonne === colonne);
		if (rang >= 0) out.push({ emplacement: i, rang });
	});
	return out;
}

/* ---------- Lire et écrire ---------- */

/** La lettre posée dans cette case, ou `null` si elle est vide. C'est ce que
    l'ENFANT a tapé, jamais ce qu'on attendait de lui. */
export function lettreEn(p: PartieMotsCroises, ligne: number, colonne: number): string | null {
	return p.lettres[cleCase(ligne, colonne)] ?? null;
}

/** Écrit une lettre dans une case, et rend une NOUVELLE partie — la partie reçue
    n'est jamais modifiée, comme `poser` du moteur.

    Refusé EN SILENCE, et la partie rendue est alors la même : une case hors
    grille (défaut de rendu, pas faute de l'enfant), ou tout ce qui n'est pas une
    lettre unique. Une exception y serait une panne pour l'enfant.

    Écrire par-dessus une lettre déjà posée est en revanche ACCEPTÉ : c'est le
    geste de celui qui se corrige, et c'est aussi ce qui rend le critère 24
    atteignable — sans lui, aucun mot juste ne pourrait jamais être contredit. */
export function ecrire(
	p: PartieMotsCroises,
	ligne: number,
	colonne: number,
	lettre: string,
): PartieMotsCroises {
	if (motsSur(p.motif, ligne, colonne).length === 0) return p;
	if (!estLettre(lettre)) return p;
	/* La lettre TAPÉE, telle quelle — seule la casse est ramenée à celle du
	   vivier. Le modèle range ce que l'enfant a écrit, jamais ce qu'on attendait de
	   lui : y substituer la lettre de la solution habillerait la case de son accent
	   à l'instant où elle devient juste, donc lui dirait LETTRE PAR LETTRE qu'il a
	   raison (critère 26). L'accent, lui, s'affiche quand le MOT est trouvé — voir
	   `lettreAffichee`. */
	return { ...p, lettres: { ...p.lettres, [cleCase(ligne, colonne)]: bas(lettre) } };
}

/** Vide une case. Sans effet sur une case déjà vide ou hors grille. */
export function effacerCase(
	p: PartieMotsCroises,
	ligne: number,
	colonne: number,
): PartieMotsCroises {
	const k = cleCase(ligne, colonne);
	if (!(k in p.lettres)) return p;
	const lettres = { ...p.lettres };
	delete lettres[k];
	return { ...p, lettres };
}

/* ---------- L'état d'un mot ---------- */

/** L'état d'un emplacement, RECALCULÉ à chaque lecture depuis les lettres de la
    grille — jamais retenu.

    C'est tout le critère 24 : un mot juste doit redevenir faux quand l'enfant
    réécrit une de ses cases en travaillant sur le mot qui la croise, et
    redevenir juste quand la bonne lettre revient. Un état mémorisé au moment où
    le mot est complété passerait tous les autres contrôles et échouerait sur
    celui-là — sans rien lever, et sans que personne ne le voie. */
export function etatMot(p: PartieMotsCroises, emplacement: number): EtatMot {
	const e = p.motif.emplacements[emplacement];
	if (!e) return 'vide';
	const posees = casesDe(e).map((c) => lettreEn(p, c.ligne, c.colonne));
	if (posees.every((l) => l === null)) return 'vide';
	if (posees.some((l) => l === null)) return 'en-cours';
	const attendues = lettresDe(p.solution[emplacement] ?? '');
	const juste = posees.every((l, k) => plierLettre(l ?? '') === plierLettre(attendues[k] ?? ''));
	return juste ? 'juste' : 'faux';
}

/** La lettre à MONTRER dans cette case — celle que l'enfant a tapée, sauf si un
    mot qui traverse la case est TROUVÉ : sa graphie prend alors le dessus, accent
    compris.

    C'est la deuxième moitié de la décision sur les accents, et le moment compte.
    L'accent apparaît quand le MOT est juste, jamais quand la lettre l'est : sinon
    la case s'habillerait à l'instant précis où l'enfant tape la bonne lettre, ce
    qui est un retour lettre par lettre (critère 26) — et un retour PARTIEL de
    surcroît, puisqu'il ne se produirait que sur les 57 mots accentués de la
    banque. Un signal qui ne se déclenche qu'une fois sur quatre, sans que
    personne puisse le savoir, est pire que pas de signal du tout.

    Une fois le mot trouvé, en revanche, l'enfant n'apprend plus rien de sa
    justesse : elle est déjà dite par le mot entier. Ne reste que l'exposition à
    la forme correcte, qui est le seul bénéfice de langue de ce jeu — et il serait
    perdu si la grille finissait en « ECOLE ».

    À un croisement, un seul des deux mots suffit à habiller la case : les deux
    réclament la même lettre (critère 16), donc il n'y a rien à arbitrer. */
export function lettreAffichee(
	p: PartieMotsCroises,
	ligne: number,
	colonne: number,
): string | null {
	const tapee = lettreEn(p, ligne, colonne);
	if (tapee === null) return null;
	for (const { emplacement, rang } of motsSur(p.motif, ligne, colonne)) {
		if (etatMot(p, emplacement) !== 'juste') continue;
		const attendue = lettresDe(p.solution[emplacement] ?? '')[rang];
		if (attendue !== undefined) return attendue;
	}
	return tapee;
}

/** Le mot est-il COMPLET, juste ou faux ? La question que se pose l'effacement :
    on ne détruit pas le travail d'un voisin qui, lui, est allé au bout. */
const estComplet = (p: PartieMotsCroises, i: number): boolean => {
	const etat = etatMot(p, i);
	return etat === 'juste' || etat === 'faux';
};

/** Efface un mot, et lui seul (critère 23).

    Les cases qu'un mot croisé DÉJÀ COMPLET occupe aussi sont conservées : les
    vider détruirait le travail d'un voisin que l'enfant n'a pas touché, et le
    critère 34 veut justement que les lettres des voisins restent visibles. La
    conséquence à connaître : un mot effacé qui croise deux mots complets ne
    revient pas « vide » mais « en cours », avec les lettres que ses voisins lui
    imposent. C'est l'état réel de la grille, pas un effacement raté. */
export function effacerMot(p: PartieMotsCroises, emplacement: number): PartieMotsCroises {
	const e = p.motif.emplacements[emplacement];
	if (!e) return p;
	const lettres = { ...p.lettres };
	for (const c of casesDe(e)) {
		const tenue = motsSur(p.motif, c.ligne, c.colonne).some(
			({ emplacement: j }) => j !== emplacement && estComplet(p, j),
		);
		if (!tenue) delete lettres[cleCase(c.ligne, c.colonne)];
	}
	return { ...p, lettres };
}

/** La partie est finie : tous les mots posés ET justes (critère 28). Une grille
    pleine et fausse est un état de jeu légitime, pas une fin. */
export function partieGagnee(p: PartieMotsCroises): boolean {
	return p.motif.emplacements.every((_e, i) => etatMot(p, i) === 'juste');
}

/** Combien de mots sont trouvés. La progression se lit EN MONTANT (critère 35) :
    ni temps écoulé, ni compte à rebours, ni fautes comptées. */
export function motsTrouves(p: PartieMotsCroises): number {
	return p.motif.emplacements.filter((_e, i) => etatMot(p, i) === 'juste').length;
}
