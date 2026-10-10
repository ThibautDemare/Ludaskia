/* ============================================================
   Tableau de conversion — VERDICT et LECTURE d'un tableau saisi. Logique pure.

   Sorti du runner (`ui/lecon-tableau.ts`) quand la séance partagée (#734) a dû noter
   un tableau SANS rien peindre : le jeu libre et la séance partagée jugent et relisent
   le même tableau avec ces fonctions, et elles se testent sans DOM. Un tableau saisi,
   c'est la liste des chiffres tapés, case par case, dans l'ordre des cases (une case par
   chiffre de tête de colonne, cf. `buildCells`), et la case suivie de la virgule posée
   par l'enfant (`null` si aucune, ou hors du mode `virgule`).
   ============================================================ */
import type { Exercise } from './exercise';
import { nombreTableauSaisi } from './erreur-representation';
import { formatReponseRevelee } from './nombres';
import { saisiesPourJournal, verdictsCases, type VerdictCase } from './tableau-verdict';
import { caseVirguleAttendue } from './tableau-virgule';

export type TableauConversion = Extract<Exercise, { type: 'tableauConversion' }>;

/** Unité de chaque case, dans l'ordre des cases : une tête de colonne à deux chiffres
 *  donne deux cases de la même unité. */
export function unitesDesCases(ex: TableauConversion): string[] {
	return ex.colonnes.flatMap((col) => col.chiffres.split('').map(() => col.unite));
}

/** Verdict du tableau saisi. Deux verdicts SÉPARÉS, et non un « faux » global : ce sont
 *  deux compétences distinctes du programme, la valeur positionnelle des chiffres d'un
 *  côté, la lecture du tableau dans l'unité demandée de l'autre (avis pedagogue-primaire).
 *  Un enfant qui voit sa série de cases justes repeinte en rouge pour une virgule conclut
 *  qu'il a tout raté (avis specialiste-troubles-apprentissage).
 *  Le verdict case par case vient de `verdictsCases` (#711 lot 5) : une case hors de la
 *  question est juste qu'elle soit vide ou à zéro, une case exigée laissée vide est fausse,
 *  et une case hors question portant autre chose qu'un zéro est fausse. */
export function jugerTableau(
	ex: TableauConversion,
	saisies: readonly string[],
	virguleCase: number | null,
): { verdicts: VerdictCase[]; chiffresOk: boolean; virguleOk: boolean } {
	const virguleOk = !ex.virguleLibre || virguleCase === caseVirguleAttendue(ex);
	const verdicts = verdictsCases(ex.colonnes, ex.uniteConnue, ex.answerUnit, [...saisies]);
	return { verdicts, chiffresOk: !verdicts.includes('faux'), virguleOk };
}

/** La réponse attendue, écrite comme dans les énoncés (#501) : « 20 000 mL », pas
 *  « 20000 mL ». Le résumé annoncé, lui, est recollé en aval par le point de passage des
 *  annonces (`ui/lecon-runner-shared.ts`) : un séparateur de milliers ne part jamais à
 *  l'oreille. */
export function attendueTableau(ex: TableauConversion): string {
	return `${formatReponseRevelee(ex.answer)} ${ex.answerUnit}`;
}

/** La réponse donnée, telle que le journal la relit : le nombre lu dans l'unité demandée,
 *  avec son unité. Un chiffre parasite dans une colonne de transit s'y voit donc.
 *  La virgule POSÉE prime sur l'unité demandée (#711 lot 4) : elle fait partie de la
 *  réponse. Sans ça, un enfant qui l'a mise un cran trop loin verrait sa réponse
 *  journalisée à la bonne valeur, et le parent lirait un tableau juste là où l'écran
 *  affichait un tableau faux. Hors du mode `virgule`, `virguleCase` reste `null` et la
 *  relecture est celle d'avant.
 *  Les cases vides ne se relisent pas toutes de la même façon (critère 34) :
 *  `saisiesPourJournal` porte la règle et sa raison. */
export function saisieTableau(
	ex: TableauConversion,
	saisies: readonly string[],
	virguleCase: number | null,
): string {
	const pourJournal = saisiesPourJournal(ex.colonnes, ex.uniteConnue, ex.answerUnit, [...saisies]);
	const unites = unitesDesCases(ex);
	const saisi = nombreTableauSaisi(
		unites.map((unite, i) => ({ unite, valeur: pourJournal[i] })),
		ex.answerUnit,
		virguleCase ?? undefined,
	);
	// Même graphie que l'attendue (« 20 000 mL ») : lues côte à côte, l'une groupée et
	// l'autre non, elles feraient croire à deux nombres différents.
	return `${formatReponseRevelee(saisi)} ${ex.answerUnit}`;
}
