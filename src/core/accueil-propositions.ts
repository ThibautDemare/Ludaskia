/* ============================================================
   Coordination des deux cartes « à faire » de l'accueil (#516) — logique pure.
   ------------------------------------------------------------
   L'accueil propose deux leçons : « À revoir » (file épinglée par l'encadrant,
   ui/a-revoir-card.ts) et « Ta prochaine leçon » (fil de l'avancement,
   ui/lecon-du-jour.ts). Rendues indépendamment, elles pouvaient proposer
   EXACTEMENT la même leçon — doublon STRUCTUREL et non rare : une entrée épinglée
   n'est montrée que si la notion est encore faible, donc non franchie, donc encore
   présente dans le fil, dont elle peut très bien être la tête. L'enfant voyait
   alors deux cartes identiques, et l'accueil gaspillait une de ses deux entrées.

   L'arbitrage (validé mainteneur) tient en deux règles, dans cet ordre :
   1. « À revoir » CÈDE la première : à collision, elle affiche la première autre
      entrée active. C'est elle qui a le plus de marge, ses entrées étant toutes
      des consignes de l'encadrant (aucune ne vaut mieux qu'une autre).
   2. Si elle ne PEUT pas céder (une seule entrée épinglée, et c'est la leçon du
      jour), c'est « Ta prochaine leçon » qui avance d'un cran dans son fil.
   Le doublon ne subsiste donc que si l'épingle est AUSSI la dernière leçon
   restante du programme : la carte du fil n'a alors rien d'autre à proposer, et
   basculer sur son état « Bravo, tu as fait le tour » serait faux.

   Les deux sélecteurs vivent ICI, et pas dans chacune des deux cartes, pour que
   l'arbitrage s'énonce en UN seul endroit : c'est précisément son éparpillement
   qui avait produit le doublon.
   ============================================================ */
import type { LessonDef } from './catalog';
import type { RevoirEntry } from './encadrant-stats';

/* Entrée que la carte « À revoir » doit afficher parmi `entrees` (déjà filtrées sur
   les actives, cf. `revoirActives`).

   - `cibleId` (bouton « Voir une autre leçon ») force une entrée précise et court-circuite
     tout : c'est un choix explicite de l'enfant, il ne se fait pas dédupliquer.
   - sinon on prend la première entrée qui n'est PAS la leçon du jour, et on retombe sur
     la tête de file s'il n'y a pas d'alternative (règle 1 ci-dessus).

   Seules les entrées `kind === 'lecon'` peuvent entrer en collision : une liste de dictée
   (`kind === 'ortho'`) n'est pas dans le catalogue, son id ne se compare pas à une leçon. */
export function choisirARevoir(
	entrees: RevoirEntry[],
	leconDuJourId: string | null,
	cibleId?: string,
): RevoirEntry | null {
	if (entrees.length === 0) return null;
	if (cibleId) {
		const forcee = entrees.find((e) => e.id === cibleId);
		if (forcee) return forcee;
	}
	if (!leconDuJourId) return entrees[0];
	return entrees.find((e) => !(e.kind === 'lecon' && e.id === leconDuJourId)) ?? entrees[0];
}

/* Leçon que la carte « Ta prochaine leçon » doit afficher, dans le fil `sequence`
   (cf. `sequenceLeconDuJour`), en ÉVITANT `eviterId` — la leçon que « À revoir »
   affiche finalement (règle 2 ci-dessus ; `null` quand il n'y a pas de collision
   possible, p. ex. carte masquée ou entrée de dictée).

   Repli sur la tête du fil quand tout le fil est à éviter : mieux vaut le doublon
   qu'une carte qui félicite l'enfant d'avoir « fait le tour » alors qu'il lui reste
   cette leçon à franchir. `null` seulement si le fil est vide (programme terminé). */
export function choisirProchaineLecon(
	sequence: LessonDef[],
	eviterId: string | null,
): LessonDef | null {
	if (sequence.length === 0) return null;
	if (!eviterId) return sequence[0];
	return sequence.find((l) => l.id !== eviterId) ?? sequence[0];
}
