/* ============================================================
   Justesse d'une réponse de WIDGET — la règle, en un seul endroit (#777).
   ------------------------------------------------------------
   Une même réponse se juge à deux moments : tout de suite, par le widget qui la reçoit
   (`juste()` / `verify()` de `ui/tuile-interaction.ts`, `ui/appariement.ts`,
   `ui/clic-mot-interaction.ts`, `ui/segment-mot-interaction.ts`, grille posée de
   `ui/revision.ts`), ou plus tard, sur la réponse collectée, par la correction différée du
   parcours de bilan (`corrigerQuestion`, `core/bilan-parcours.ts`). Deux copies de la règle
   finiraient par diverger, et un enfant serait jugé autrement selon l'écran : les deux
   côtés appellent donc ces prédicats, purs. La parité est tenue sur le catalogue par
   `tests/widgets-juste.test.ts`.

   Ces prédicats ne disent QUE juste ou faux. Ce qu'on montre d'une erreur (réponse donnée,
   bonne réponse) reste à la mise en forme (`core/erreur-representation.ts`).
   ============================================================ */

/** Tuile : la tuile posée est exactement la réponse (libellés exacts : signe ou nombre).
    Rien de posé n'est jamais juste. */
export function tuileJuste(posee: string | null, attendue: string): boolean {
	return posee !== null && posee === attendue;
}

/** Rangement : la rangée est COMPLÈTE et dans l'ordre. Un début juste ne suffit pas. */
export function ordreJuste(propose: readonly string[], ordre: readonly string[]): boolean {
	return propose.length === ordre.length && propose.every((mot, i) => mot === ordre[i]);
}

/** Tri en deux thèmes : chaque mot est rangé dans SON thème. Un mot laissé hors des thèmes
    rend le tri faux ; une entrée de `placement` qui n'est pas un mot de la question est
    ignorée. */
export function triJuste(
	mots: readonly { mot: string; cat: 0 | 1 }[],
	placement: Readonly<Record<string, 0 | 1>>,
): boolean {
	return mots.every((m) => placement[m.mot] === m.cat);
}

/** Appariement : chaque mot de gauche est relié à SA bonne droite (le premier lien qui le
    nomme fait foi ; pas de lien = faux).

    La règle n'exige PAS de bijection : les étiquettes (#731, « déterminant », « nom »…) se
    relient plusieurs fois, « chaque mot a sa bonne étiquette ». Le « un seul lien par mot de
    droite » que le widget impose pour les autres banques est un invariant de DONNÉE (des
    droites toutes distinctes), déjà gardé par les contrôles des banques ; la correction n'a
    pas à le revérifier. */
export function appariementJuste(
	paires: readonly { gauche: string; droite: string }[],
	liens: readonly { gauche: string; droite: string | null }[],
): boolean {
	return paires.every(
		(p) => (liens.find((l) => l.gauche === p.gauche)?.droite ?? null) === p.droite,
	);
}

/** Mots touchés (clic sur le mot, segment à deux bornes) : les mots choisis forment
    EXACTEMENT l'ensemble attendu. Les indices sont un ENSEMBLE (un doublon ne compte
    qu'une fois) et un indice hors de la phrase (`< 0` ou `≥ nbMots`) est ignoré — aucun
    widget n'en produit, mais une réponse relue (reprise) ne doit pas changer de verdict
    pour autant. */
export function motsChoisisJustes(
	choisis: readonly number[],
	cibles: readonly number[],
	nbMots: number,
): boolean {
	const retenus = new Set(choisis.filter((i) => i >= 0 && i < nbMots));
	const attendus = new Set(cibles);
	return retenus.size === attendus.size && [...retenus].every((i) => attendus.has(i));
}

/** Une case d'opération posée : un chiffre écrit, égal au chiffre attendu (comparés en
    nombres : « 07 » vaut 7). Une case vide n'est jamais juste. */
export function chiffrePoseJuste(saisi: string, attendu: string | number): boolean {
	const s = saisi.trim();
	return s !== '' && Number(s) === Number(attendu);
}

/** Grille d'opération posée : autant de cases que de chiffres à trouver, et TOUTES justes
    (produits partiels compris) — dans l'ordre de lecture de la grille. */
export function grillePoseeJuste(
	saisis: readonly string[],
	attendus: readonly (string | number)[],
): boolean {
	return (
		saisis.length === attendus.length && attendus.every((a, i) => chiffrePoseJuste(saisis[i], a))
	);
}
