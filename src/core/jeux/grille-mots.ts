/* ============================================================
   Le MOTEUR DE GRILLE DE MOTS (#664), générique.

   Il ne connaît ni le français, ni le jeu qui l'emploie : ni vivier, ni taille
   de grille, ni stockage. C'est la condition posée par le cadrage pour que #665
   (mots croisés) le reprenne en ne changeant que la SOURCE des mots — un moteur
   qui aurait besoin d'un vrai mot pour fonctionner ne serait pas celui-là.

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
