/* ============================================================
   Mode Orthographe — logique pure des entourages de l'atelier du mot.
   Un entourage est une plage de lettres [debut, fin] (bornes incluses,
   index alignés sur lettresDuMot). L'atelier (couche UI, SVG) n'y
   ajoute que le geste et le tracé ; la règle de BASCULE vit ici pour
   être testable sans DOM (#462).
   Voir docs/design-orthographe.md (§ Atelier du mot).
   ============================================================ */
import type { Entourage } from './types';

/** Vrai si la plage [debut, fin] et l'entourage `e` ont au moins une lettre commune.
    Bornes normalisées : un glissé de droite à gauche donne le même résultat. */
export function recouvre(e: Entourage, debut: number, fin: number): boolean {
	return Math.min(debut, fin) <= e.fin && Math.max(debut, fin) >= e.debut;
}

/** Indices (dans `entourages`) des entourages recouverts par la plage [debut, fin]. */
export function entouragesRecouverts(
	entourages: readonly Entourage[],
	debut: number,
	fin: number,
): number[] {
	const lo = Math.min(debut, fin);
	const hi = Math.max(debut, fin);
	return entourages.reduce<number[]>((acc, e, i) => {
		if (recouvre(e, lo, hi)) acc.push(i);
		return acc;
	}, []);
}

/* Couleur du prochain entourage : première teinte LIBRE de la palette, pas
   `entourages.length` — après un retrait (bascule ou « effacer le dernier »),
   l'index de longueur retomberait sur une couleur déjà utilisée et deux
   entourages voisins deviendraient indistinguables. Palette saturée : on
   recycle par longueur. */
export function prochaineCouleur(entourages: readonly Entourage[], nbCouleurs: number): number {
	const prises = new Set(entourages.map((e) => e.couleur % nbCouleurs));
	for (let c = 0; c < nbCouleurs; c++) if (!prises.has(c)) return c;
	return entourages.length % nbCouleurs;
}

/* Bascule de la plage [debut, fin] : si elle recouvre des entourages existants, on
   les RETIRE (sans rien ajouter) ; sinon on ajoute l'entourage. Un second geste sur
   une lettre déjà entourée l'efface donc, au lieu d'empiler une superposition (#462).
   Renvoie un NOUVEAU tableau (les entourages conservés sont les mêmes objets). */
export function basculerEntourage(
	entourages: readonly Entourage[],
	debut: number,
	fin: number,
	nbCouleurs: number,
): Entourage[] {
	const lo = Math.min(debut, fin);
	const hi = Math.max(debut, fin);
	const recouverts = entouragesRecouverts(entourages, lo, hi);
	if (recouverts.length) {
		const aRetirer = new Set(recouverts);
		return entourages.filter((_, i) => !aRetirer.has(i));
	}
	return [...entourages, { debut: lo, fin: hi, couleur: prochaineCouleur(entourages, nbCouleurs) }];
}

/** Ce qu'une lettre subit du geste en cours : rien (absente de l'aperçu), entrer dans un
    nouvel entourage, disparaître avec l'entourage retiré, ou être seulement traversée. */
export type EtatApercu = 'ajout' | 'effacement' | 'neutre';

/* Aperçu du geste AVANT relâchement : `recouverts` = entourages que la bascule
   retirerait (à signaler sur leur tracé), `etats` = ce qui arrive à chaque lettre.
   Un geste d'effacement signale TOUT l'entourage condamné (pas seulement la lettre sous
   le doigt), et marque « neutre » les lettres seulement traversées : le surlignage sous
   le doigt reste continu, sans faire croire qu'il va leur arriver quelque chose. */
export function apercuGeste(
	entourages: readonly Entourage[],
	debut: number,
	fin: number,
): { recouverts: number[]; etats: Map<number, EtatApercu> } {
	const lo = Math.min(debut, fin);
	const hi = Math.max(debut, fin);
	const recouverts = entouragesRecouverts(entourages, lo, hi);
	const etats = new Map<number, EtatApercu>();
	for (let i = lo; i <= hi; i++) etats.set(i, recouverts.length ? 'neutre' : 'ajout');
	for (const k of recouverts) {
		for (let i = entourages[k].debut; i <= entourages[k].fin; i++) etats.set(i, 'effacement');
	}
	return { recouverts, etats };
}
