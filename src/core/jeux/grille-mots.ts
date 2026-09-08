/* ============================================================
   Le MOTEUR DE GRILLE DE MOTS (#664), générique.

   Il ne connaît ni le français, ni le jeu qui l'emploie : ni vivier, ni taille
   de grille, ni stockage. C'est la condition posée par le cadrage pour que #665
   (mots croisés) le reprenne en ne changeant que la SOURCE des mots — un moteur
   qui aurait besoin d'un vrai mot pour fonctionner ne serait pas celui-là.

   Le REMPLISSAGE vit ici aussi, en bas de fichier, et c'est délibéré : trouver
   un jeu de mots qui tient dans un motif est un problème de géométrie et de
   longueurs, jamais de langue — le solveur ne LIT pas les mots, il compare des
   lettres et compte des cases. Il reçoit donc sa liste de mots en PARAMÈTRE, ce
   qui est très exactement la promesse faite à #665 : reprendre ce moteur en ne
   changeant que la SOURCE des mots, sans redupliquer un algorithme réglé à la
   main.

   Un motif décrit une géométrie : des emplacements horizontaux et verticaux. Les
   CROISEMENTS ne sont pas déclarés, ils se calculent — deux emplacements se
   croisent quand ils partagent une case. C'est ce qui permet d'écrire un motif à
   la main sans jamais tenir à jour une liste de croisements en parallèle, donc
   sans jamais la désynchroniser.

   ── Trois choix de contrat, et leur raison ──────────────────────────────────

   1. **Rien ne mute la grille reçue.** Le runner garde son état et le
      remplissage essaie puis revient en arrière : une fonction qui écrirait dans
      le tableau reçu corromprait l'un ou l'autre sans rien lever.
   2. **Ce qui n'a pas de sens est refusé EN SILENCE**, jamais par une exception :
      index hors motif, mot de la mauvaise longueur, emplacement occupé. Poser un
      mot de cinq lettres dans un emplacement de quatre n'est pas une erreur de
      l'enfant, c'est une impossibilité physique — et une exception y serait une
      panne pour lui.
   3. **Un emplacement occupé ne se remplace pas : il faut retirer d'abord.** Le
      moteur ne détient pas la liste des mots à placer (c'est le jeu qui la
      tient) ; une pose qui écraserait un mot posé le ferait disparaître de la
      grille SANS le rendre à la liste, et l'enfant le perdrait pour de bon.

   ── L'accent fait partie de la lettre, et NFC est la clé ────────────────────

   Deux mots qui se croisent doivent porter la MÊME lettre dans la case commune,
   accents compris : comparer sur la lettre nue ferait afficher, dans une case,
   une lettre fausse pour l'un des deux. Mais « é » s'écrit de deux façons — une
   seule unité (NFC) ou un « e » suivi d'un accent combinant (NFD) — et ce sont
   deux écritures de la même lettre. Tout passe donc par NFC avant d'être MESURÉ
   comme avant d'être COMPARÉ ; sans ça, `mot.length` refuserait le même mot une
   fois sur deux selon la façon dont il a été saisi dans les données.
   ============================================================ */

export type Sens = 'h' | 'v';

export interface Case {
	ligne: number;
	colonne: number;
}

/** Un emplacement : sa première case, sa longueur, son sens. */
export interface Emplacement {
	ligne: number;
	colonne: number;
	longueur: number;
	sens: Sens;
}

export interface Motif {
	/** Stable : c'est lui que la sauvegarde range pour retrouver la grille. */
	id: string;
	largeur: number;
	hauteur: number;
	emplacements: readonly Emplacement[];
}

/** Une case partagée par deux emplacements, avec la position de la lettre
    commune DANS CHACUN des deux mots. Toujours `a` < `b`, et une seule fois par
    couple : c'est ce qui permet de signaler un conflit SUR LES DEUX mots sans
    avoir à désigner lequel serait « le mauvais » — il n'y en a pas. */
export interface Croisement {
	a: number;
	b: number;
	indexA: number;
	indexB: number;
	ligne: number;
	colonne: number;
}

export interface Grille {
	motif: Motif;
	/** Un mot posé (ou `null`) par emplacement, dans l'ordre du motif. */
	poses: readonly (string | null)[];
}

/** Les lettres d'un mot, en NFC : une entrée par lettre PERÇUE. */
function lettresDe(mot: string): string[] {
	return [...mot.normalize('NFC')];
}

/** Les cases d'un emplacement, dans l'ordre de lecture du mot. */
export function casesDe(e: Emplacement): Case[] {
	const cases: Case[] = [];
	for (let k = 0; k < e.longueur; k++) {
		cases.push(
			e.sens === 'h'
				? { ligne: e.ligne, colonne: e.colonne + k }
				: { ligne: e.ligne + k, colonne: e.colonne },
		);
	}
	return cases;
}

/** Tous les croisements du motif, calculés depuis la seule géométrie. */
export function croisements(m: Motif): Croisement[] {
	const cases = m.emplacements.map(casesDe);
	const out: Croisement[] = [];
	for (let a = 0; a < cases.length; a++) {
		for (let b = a + 1; b < cases.length; b++) {
			for (let ia = 0; ia < cases[a].length; ia++) {
				for (let ib = 0; ib < cases[b].length; ib++) {
					if (
						cases[a][ia].ligne === cases[b][ib].ligne &&
						cases[a][ia].colonne === cases[b][ib].colonne
					) {
						out.push({
							a,
							b,
							indexA: ia,
							indexB: ib,
							ligne: cases[a][ia].ligne,
							colonne: cases[a][ia].colonne,
						});
					}
				}
			}
		}
	}
	return out;
}

export function grilleNeuve(m: Motif): Grille {
	return { motif: m, poses: m.emplacements.map(() => null) };
}

/** L'emplacement `index` du motif, ou `undefined` si l'index n'en désigne
    aucun — y compris pour un index négatif, décimal ou `NaN`. */
function emplacementDe(g: Grille, index: number): Emplacement | undefined {
	if (!Number.isInteger(index) || index < 0) return undefined;
	return g.motif.emplacements[index];
}

/** Pose `mot` à l'emplacement `emplacement`. Refuse en silence — et rend la
    grille inchangée — si l'index n'existe pas, si l'emplacement est déjà occupé
    ou si le mot n'a pas exactement la longueur voulue.

    Une pose qui CONTREDIT un mot déjà posé est en revanche acceptée : c'est
    l'arbitrage du cadrage (la pose invalide passe, le conflit se signale). */
export function poser(g: Grille, emplacement: number, mot: string): Grille {
	const e = emplacementDe(g, emplacement);
	if (!e || g.poses[emplacement] !== null) return g;
	const lettres = lettresDe(mot);
	if (lettres.length !== e.longueur) return g;
	const poses = [...g.poses];
	poses[emplacement] = lettres.join('');
	return { motif: g.motif, poses };
}

/** Libère un emplacement. Sans effet sur un emplacement vide ou inconnu. */
export function retirer(g: Grille, emplacement: number): Grille {
	const e = emplacementDe(g, emplacement);
	if (!e || g.poses[emplacement] === null) return g;
	const poses = [...g.poses];
	poses[emplacement] = null;
	return { motif: g.motif, poses };
}

/** Les emplacements LIBRES où ce mot entrerait, par sa seule longueur.

    Un emplacement où le mot entrerait EN CONFLIT y figure : filtrer ici les
    emplacements « qui marchent » transformerait la mise en évidence d'aide en
    solveur, et priverait l'enfant de l'essai-erreur qui EST la résolution. */
export function emplacementsCompatibles(g: Grille, mot: string): number[] {
	const longueur = lettresDe(mot).length;
	const out: number[] = [];
	g.motif.emplacements.forEach((e, i) => {
		if (g.poses[i] === null && e.longueur === longueur) out.push(i);
	});
	return out;
}

/** Les croisements dont les deux mots sont posés et ne portent pas la même
    lettre. Un croisement, jamais un emplacement : le moteur ne sait pas lequel
    des deux mots est en cause, et il n'a pas à le décider. */
export function conflits(g: Grille): Croisement[] {
	return croisements(g.motif).filter((c) => {
		const motA = g.poses[c.a];
		const motB = g.poses[c.b];
		if (motA === null || motB === null || motA === undefined || motB === undefined) return false;
		return lettresDe(motA)[c.indexA] !== lettresDe(motB)[c.indexB];
	});
}

/** Les lettres RÉCLAMÉES par les mots posés sur cette case : une seule quand ils
    s'accordent, deux quand ils se contredisent, aucune sur une case vide ou hors
    motif. C'est ce qui permet au rendu de montrer l'état de la grille plutôt que
    de choisir arbitrairement l'une des deux. */
export function lettresEn(g: Grille, ligne: number, colonne: number): string[] {
	const out: string[] = [];
	g.motif.emplacements.forEach((e, i) => {
		const mot = g.poses[i];
		if (mot === null || mot === undefined) return;
		const index = casesDe(e).findIndex((c) => c.ligne === ligne && c.colonne === colonne);
		if (index < 0) return;
		const lettre = lettresDe(mot)[index];
		if (lettre !== undefined && !out.includes(lettre)) out.push(lettre);
	});
	return out;
}

/** Tous les emplacements sont pourvus — sans rien dire de leur cohérence. */
export function complete(g: Grille): boolean {
	return g.poses.every((mot) => mot !== null);
}

/** La partie est finie : PLEINE et sans le moindre conflit. L'état « pleine mais
    fausse » est atteignable par construction (la pose contradictoire est
    acceptée), donc la fin de partie doit l'en distinguer. */
export function terminee(g: Grille): boolean {
	return complete(g) && conflits(g).length === 0;
}

/* ============================================================
   LE REMPLISSAGE — trouver un mot pour chaque emplacement.

   Générique lui aussi, et c'est tout l'intérêt : la liste de mots est un
   PARAMÈTRE. Le solveur ne sait pas d'où elle vient, n'en lit jamais le sens, et
   ne compare que des lettres et des longueurs.
   ============================================================ */

/** Fisher-Yates sur une COPIE, comme `core/jeux/tirage.ts` — un seul algorithme
    de mélange dans le dépôt, et c'est celui-là.

    Il a un temps été remplacé ici par un tri sur clé tirée, parce que
    Fisher-Yates fait reposer UNE position sur UN tirage : la dernière sur le tout
    premier appel. Avec les générateurs des tests, un LCG semé par de petits
    entiers dont la première sortie ne bougeait que de 0,236 à 0,314 sur les
    graines 1 à 200, un motif sur trois n'était jamais servi.

    C'était corriger l'étage du dessous. Le défaut était dans le générateur de
    TEST, pas dans le mélange, et il valait aussi pour `tirage.ts` — simplement
    son test était trop lâche pour le révéler. Le générateur est désormais corrigé
    à sa racine, et les deux modules mélangent de nouveau pareil.

    Le `Math.min` borne un générateur qui rendrait exactement 1 : sans lui,
    l'index sort du tableau et la permutation perd un élément en silence. */
export function melanger<T>(items: readonly T[], r: () => number): T[] {
	const a = [...items];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.min(i, Math.floor(r() * (i + 1)));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Nombre de placements essayés avant d'abandonner un motif. C'est un garde-fou,
    pas un réglage de performance : il existe pour qu'un dessin trop dense se
    solde par « on essaie un autre motif » et jamais par un onglet figé. */
export const BUDGET_NOEUDS = 30000;

/** Les passes de `choisirRemplissage`, à budget CROISSANT. On desserre plutôt
    que de partir large : le cas normal reste instantané, et le cas tordu reste
    borné au lieu de virer à la recherche exhaustive. */
export const BUDGETS: readonly number[] = [BUDGET_NOEUDS, BUDGET_NOEUDS * 8, BUDGET_NOEUDS * 64];

/** Un mot de `mots` par emplacement de `motif`, dans l'ordre des emplacements —
    ou `null` si ce tirage n'y arrive pas dans le budget imparti. Aucun mot n'y
    figure deux fois et tous les croisements s'accordent : c'est ce placement qui
    prouve qu'une grille servie est résoluble. Pur, l'aléa étant injecté.

    Une recherche naïve sur ce problème ne termine pas. Deux réglages suffisent à
    le rendre trivial :

    • **l'ordre**, choisir à chaque étape l'emplacement qui a le MOINS de mots
      encore possibles — c'est ce qui fait échouer tôt les impasses, au lieu de
      les découvrir après avoir posé cinq mots ;
    • **le budget**, un nombre de nœuds maximal avec abandon propre.

    Quelle densité de croisements passe, et avec quel budget, ne se décide pas
    ici : cela dépend du vivier fourni autant que du dessin, donc de l'appelant.
    C'est lui qui mesure, et lui qui documente ce qu'il a mesuré. */
export function remplirMotif(
	motif: Motif,
	mots: readonly string[],
	r: () => number,
	budget: number = BUDGET_NOEUDS,
): string[] | null {
	const n = motif.emplacements.length;
	const parEmplacement: Croisement[][] = motif.emplacements.map(() => []);
	for (const c of croisements(motif)) {
		parEmplacement[c.a].push(c);
		parEmplacement[c.b].push(c);
	}

	/* Les mots sont mélangés UNE fois puis rangés par longueur : c'est ce mélange
	   qui fait varier les grilles d'un tirage à l'autre, et le seul endroit où
	   l'aléa entre. La recherche, elle, est déterministe. */
	const parLongueur = new Map<number, string[][]>();
	for (const mot of melanger(mots, r)) {
		const lettres = lettresDe(mot);
		const liste = parLongueur.get(lettres.length);
		if (liste) liste.push(lettres);
		else parLongueur.set(lettres.length, [lettres]);
	}
	const candidats = motif.emplacements.map((e) => parLongueur.get(e.longueur) ?? []);

	const poses: (string[] | null)[] = motif.emplacements.map(() => null);
	const pris = new Set<string>();
	let restant = budget;

	/** Le mot tient-il compte des lettres déjà fixées par les croisements ? */
	const accepte = (i: number, mot: string[]): boolean => {
		for (const c of parEmplacement[i]) {
			const voisin = poses[c.a === i ? c.b : c.a];
			if (!voisin) continue;
			if (mot[c.a === i ? c.indexA : c.indexB] !== voisin[c.a === i ? c.indexB : c.indexA]) {
				return false;
			}
		}
		return true;
	};

	const chercher = (): boolean => {
		if (restant-- <= 0) return false;
		/* L'emplacement le PLUS CONTRAINT d'abord : celui qui a le moins de mots
		   encore possibles. C'est ce qui fait échouer tôt les impasses, au lieu de
		   les découvrir après avoir posé cinq mots. */
		let cible = -1;
		let choix: string[][] | null = null;
		for (let i = 0; i < n; i++) {
			if (poses[i]) continue;
			const possibles = candidats[i].filter((mot) => !pris.has(mot.join('')) && accepte(i, mot));
			if (!choix || possibles.length < choix.length) {
				cible = i;
				choix = possibles;
				if (possibles.length === 0) break;
			}
		}
		if (cible < 0 || !choix) return true;
		for (const mot of choix) {
			const forme = mot.join('');
			poses[cible] = mot;
			pris.add(forme);
			if (chercher()) return true;
			poses[cible] = null;
			pris.delete(forme);
			if (restant <= 0) return false;
		}
		return false;
	};

	if (!chercher()) return null;
	return poses.map((mot) => (mot ?? []).join(''));
}

/** Le motif retenu, et le mot de chacun de ses emplacements. Le TYPE du motif
    est conservé : un appelant qui range ses propres champs dessus (une taille,
    un thème, des définitions) les retrouve sans conversion. */
export interface Remplissage<T extends Motif = Motif> {
	motif: T;
	solution: string[];
}

/** Le premier motif de `motifs` qui se remplit avec `mots`, essayé à budget
    croissant (`budgets`).

    Rend `null` quand AUCUN n'y arrive, même à la dernière passe : le moteur ne
    lève rien, c'est l'appelant qui sait quoi en dire à celui qui attend une
    grille. Rendre `null` plutôt que jeter est aussi ce qui rend ce chemin
    d'échec ATTEIGNABLE d'un test — il suffit d'une liste de mots qui ne peut pas
    remplir, ou d'un budget d'une poignée de nœuds.

    Chaque passe remélange les motifs, et chaque tentative remélange les mots :
    c'est le seul endroit où l'aléa entre. */
export function choisirRemplissage<T extends Motif>(
	motifs: readonly T[],
	mots: readonly string[],
	r: () => number,
	budgets: readonly number[] = BUDGETS,
): Remplissage<T> | null {
	for (const budget of budgets) {
		for (const motif of melanger(motifs, r)) {
			const solution = remplirMotif(motif, mots, r, budget);
			if (solution) return { motif, solution };
		}
	}
	return null;
}
