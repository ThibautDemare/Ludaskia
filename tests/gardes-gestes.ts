/* ============================================================
   Détecteur des GESTES D'ÉCRAN partagé par les gates d'impression (#777, critère 19).

   Module NON collecté par Vitest — son nom ne finit ni par `.test.ts` ni par `.spec.ts`,
   les deux seuls suffixes de l'`include` (forme maison, cf. `gardes-affixes.ts`).
   Il est ici parce que deux gates au moins cherchent les mêmes verbes sur des surfaces
   différentes : le texte de tout document imprimé (`impression-gate.test.ts`) et les
   libellés et consignes résolus pour le papier ou la forme écrite
   (`impression-libelles.test.ts`). Une liste de verbes recopiée dans deux fichiers finit
   par diverger : on y ajouterait un geste d'un côté, et l'autre gate resterait vert.

   Le détecteur est éprouvé sur des textes FABRIQUÉS dans `gardes-gestes.test.ts` : ce
   qu'il doit attraper, et ce qu'il ne doit PAS signaler (faux amis).
   ============================================================ */

/** Verbes de geste d'écran : radical canonique → ses variantes graphiques. Liste du
    critère 19 (clique, touche, tape, glisse, déplace, appuie, écoute), plus « relier » :
    le papier n'imprime jamais les deux colonnes d'un « relier », donc « Relie… » y est une
    consigne fausse. */
export const RADICAUX_GESTES: Readonly<Record<string, readonly string[]>> = {
	cliqu: ['cliqu'],
	touch: ['touch'],
	tap: ['tap'],
	gliss: ['gliss'],
	déplac: ['déplac', 'déplaç'],
	appui: ['appui', 'appuy'],
	écout: ['écout'],
	reli: ['reli'],
};

/** Variante graphique → radical canonique (« déplaç » → « déplac »). */
export const radicalCanonique: ReadonlyMap<string, string> = new Map(
	Object.entries(RADICAUX_GESTES).flatMap(([canon, variantes]) =>
		variantes.map((v) => [v, canon] as const),
	),
);

/* Ces verbes en mots entiers, avec leurs flexions courantes (présent, impératif,
   infinitif, participes) : « Clique », « touchez », « glisser », « écouté », « Reliez »…
   Les frontières sont des LETTRES (`\p{L}`), pas `\b`, qui ignore les accents :
   « écouteur », « étape », « tapis », « cliquetis », « relief », « tu relis » ne sont pas
   des gestes. Le groupe 1 capture la variante de radical. */
const MOTIF = `(?<!\\p{L})(${[...radicalCanonique.keys()].join('|')})(?:e|es|ent|er|ez|ons|ant|é|ée|és|ées)(?!\\p{L})`;

/** Expression GLOBALE : à parcourir avec `matchAll` (qui la clone), jamais avec `test` ni
    `exec`, dont l'état `lastIndex` ferait sauter un texte sur deux. */
export const GESTES = new RegExp(MOTIF, 'giu');

/** Le premier geste d'écran de `texte`, tel qu'il est écrit, ou `null`. */
export function premierGeste(texte: string): string | null {
	return new RegExp(MOTIF, 'iu').exec(texte)?.[0] ?? null;
}
