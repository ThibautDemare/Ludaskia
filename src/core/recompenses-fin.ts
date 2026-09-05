/* Récompenses d'un écran de fin : ce qui a été gagné pendant l'essai, et rien d'autre.

   Un écran de fin qui n'annonce rien ne casse rien de visible — les compteurs avancent,
   la CI reste verte, et l'enfant découvre son trophée des semaines plus tard dans la
   galerie, sans lien avec ce qu'il venait de faire. C'est exactement ce qui est arrivé à
   la révision espacée (#659), seul écran de fin à ne jamais avoir appelé
   `evaluateTrophies`. Le calcul est donc sorti ici, en logique pure : un écran de fin n'a
   plus à le refaire de mémoire, il l'appelle.

   Le calcul est destructif par nature : `evaluateTrophies` MARQUE les trophées qu'il
   renvoie, ils ne ressortiront jamais deux fois. C'est ce qui garantit qu'une récompense
   annoncée ici n'est pas re-annoncée par le rattrapage de `ui/render.ts` (#659, critère 5)
   — et, symétriquement, ce qui interdit d'appeler cette fonction « pour voir ».

   L'annonce elle-même reste côté rendu (`ui/effects.ts: announceRewards`). */
import { getXP, niveauDepuisXP } from './progress';
import { evaluateTrophies } from './rewards';
import { recompensesEntre, type Recompense } from './unlocks';

export type CelebEntry = { icon: string; text: string };

export interface RecompensesFin {
	/* Niveau atteint s'il vient d'être franchi, 0 sinon : c'est ce qu'attend `announceRewards`. */
	niveauGagne: number;
	/* Niveau courant après l'essai — à conserver comme `niveauAvant` du prochain écran de fin
	   d'une même session (le parcours d'orthographe en enchaîne plusieurs). */
	niveauApres: number;
	recompensesNiv: Recompense[];
	celeb: CelebEntry[];
}

/* `celebBase` : ce qu'on célèbre indépendamment des trophées (l'étoile « Liste prête ! » du
   parcours d'orthographe). Conservé EN TÊTE et jamais muté — une base à laquelle on aurait
   ajouté les trophées se re-célébrerait à l'écran de fin suivant. */
export function recompensesFin(niveauAvant: number, celebBase: CelebEntry[] = []): RecompensesFin {
	const nouveaux = evaluateTrophies();
	const celeb: CelebEntry[] = [
		...celebBase,
		...nouveaux.map((t) => ({ icon: t.icon, text: `Trophée : ${t.title}` })),
	];
	const niveauApres = niveauDepuisXP(getXP());
	return {
		niveauGagne: niveauApres > niveauAvant ? niveauApres : 0,
		niveauApres,
		recompensesNiv: recompensesEntre(niveauAvant, niveauApres),
		celeb,
	};
}
