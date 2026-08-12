/* ============================================================
   Sous-questions d'un problème (#199 / #467) — logique PURE (sans DOM).
   ------------------------------------------------------------
   Un problème se corrige ÉTAPE PAR ÉTAPE : chaque case a sa propre réponse, donc son
   propre verdict. La règle de comparaison (virgule française tolérée, #255) vivait dans
   la correction DOM `corrigerEtapesProbleme` (ui/lecon-probleme.ts) ; elle en sort ici
   parce qu'un deuxième chemin en a besoin — « Je ne sais pas, montre-moi » (#467) doit
   savoir, case par case, si l'enfant avait écrit quelque chose et si c'était juste.

   La recopier dans ce second chemin aurait produit exactement le défaut qu'on corrige :
   un problème passé était journalisé « n'a pas essayé » sur TOUTES ses sous-questions,
   y compris celles que l'enfant avait remplies — et même remplies juste. Le journal est
   ce que le parent lit : il doit dire ce qui s'est passé, pas un raccourci commode.

   Trois issues par case, et une seule règle pour les trois écrans (leçon, révision, et
   les tests de logique qui n'ont pas de DOM).

   Ce qui est propre au PROBLÈME vit ici : la comparaison d'une saisie de case (virgule
   française) et l'affichage de la réponse attendue. Ce qui ne l'est pas — décider si une
   question passée laisse une entrée au journal et avec quel drapeau — vit dans
   `entreeTentativePassee` (core/erreur-representation.ts) : la droite graduée et le QCM
   multi appliquent la MÊME règle sur des faits différents, et l'avaient chacun recopiée.
   ============================================================ */
import type { ProblemeEtape } from './exercise';
import { entreeTentativePassee } from './erreur-representation';
import type { EntreeTentative } from './erreur-representation';

/** État d'une case de problème : jamais remplie, remplie juste, remplie faux. `vide` est
    un état à part entière et non un « faux » : ne pas essayer n'est pas se tromper. */
export type EtatEtape = 'vide' | 'juste' | 'faux';

/** Verdict d'UNE case. Virgule française tolérée (réponses décimales CM1, #255) : la
    réponse stockée reste numérique, l'enfant écrit « 4,5 » comme en classe.
    Le test du vide vient AVANT la comparaison, et pas seulement pour distinguer les
    états : `Number('')` vaut 0, donc une case laissée vide serait déclarée JUSTE sur une
    étape dont la réponse est 0. */
export function etatEtape(saisie: string, attendu: number): EtatEtape {
	const val = saisie.trim();
	if (val === '') return 'vide';
	return Number(val.replace(',', '.')) === attendu ? 'juste' : 'faux';
}

/** Raccourci du chemin de correction ordinaire, qui n'a que deux issues à peindre (✓/✗). */
export function etapeJuste(saisie: string, attendu: number): boolean {
	return etatEtape(saisie, attendu) === 'juste';
}

/** Réponse attendue d'une étape, écrite À LA FRANÇAISE (« 4,5 ») : elle s'affiche à côté
    de la case, qu'on corrige une erreur ou qu'on révèle une case passée. */
export function attenduEtapeTexte(attendu: number): string {
	return String(attendu).replace('.', ',');
}

/** Ce qu'une sous-question d'un problème PASSÉ laisse au journal encadrant (#391) : la
    sous-question, plus l'entrée décrite par la règle commune (`entreeTentativePassee`). */
export type EntreeEtapePassee = { etape: ProblemeEtape } & EntreeTentative;

/** Entrées de journal d'un problème passé, sous-question par sous-question. La règle des
    trois cas (vide / faux / juste) est celle de `entreeTentativePassee`
    (core/erreur-representation.ts), partagée avec les deux autres formats qui l'appliquent
    (droite graduée, QCM multi) ; ici on ne fait que traduire l'état d'une CASE en faits.
    `saisies` est indexé comme `etapes` ; une entrée manquante compte comme vide. */
export function entreesEtapesPassees(
	etapes: ProblemeEtape[],
	saisies: string[],
): EntreeEtapePassee[] {
	const out: EntreeEtapePassee[] = [];
	etapes.forEach((etape, i) => {
		const saisie = (saisies[i] ?? '').trim();
		const etat = etatEtape(saisie, etape.answer);
		const entree = entreeTentativePassee({
			tentee: etat !== 'vide',
			juste: etat === 'juste',
			donnee: saisie,
		});
		if (entree) out.push({ etape, ...entree });
	});
	return out;
}
