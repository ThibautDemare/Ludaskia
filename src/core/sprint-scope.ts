/* ============================================================
   Périmètre du sprint (#208, lot 2) — logique pure, sans DOM.
   ------------------------------------------------------------
   Le sprint propose deux périmètres :
   - `all`  : toutes les leçons éligibles du niveau (historique) ;
   - `seen` : uniquement les leçons **déjà rencontrées** par l'enfant.

   « Rencontrée » = travaillée au moins une fois, même ratée (date de 1er passage,
   `loadLessonFirstSeen`, déjà scopée au niveau actif) OU déclarée « vue en classe »
   par l'adulte (#478, `loadVuAilleurs`, carte dédiée et scopée de la même façon).
   On retient ce critère — et PAS « acquise » (étoile) — car le sprint
   **consolide/automatise** : on rejoue ce qu'on a déjà touché, y compris ce qui
   n'est pas encore solide (avis pédagogue). À distinguer de la « leçon du jour »
   qui, elle, avance sur « acquise ».

   Sert à protéger surtout le **début de CM1** : sans ce filtre, le sprint tomberait
   sur des notions pas encore abordées en classe.

   C'est le SEUL endroit où les deux cartes sont réunies : les autres consommateurs
   de la date de 1er passage (objectif « nouvelle leçon », récap « notions maîtrisées
   récemment ») doivent rester aveugles aux déclarations (cf. #478).
   ============================================================ */
import type { LessonDef } from './catalog';
import { loadLessonFirstSeen } from './progress';
import { loadVuAilleurs } from './vu-ailleurs';

export type SprintScope = 'all' | 'seen';

/* Carte des leçons rencontrées : { lessonId: valeur non nulle }. Les valeurs des deux
   sources diffèrent (horodatage / `true`) — seule la PRÉSENCE de la clé compte ici. */
export type CarteRencontrees = Record<string, unknown>;

/* Union « joué dans l'appli » ∪ « déclaré vu en classe », au niveau actif. */
export function loadRencontrees(): CarteRencontrees {
	return { ...loadLessonFirstSeen(), ...loadVuAilleurs() };
}

/* Une leçon est « rencontrée » si elle est présente dans cette union (niveau actif). */
export function estRencontree(id: string, vues: CarteRencontrees = loadRencontrees()): boolean {
	return vues[id] != null;
}

/* Restreint une liste de leçons selon le périmètre : `seen` ne garde que les
   leçons rencontrées ; `all` renvoie la liste inchangée. Préserve l'ordre d'entrée. */
export function appliquerScope<T extends LessonDef>(
	lessons: T[],
	scope: SprintScope,
	vues: CarteRencontrees = loadRencontrees(),
): T[] {
	return scope === 'seen' ? lessons.filter((l) => vues[l.id] != null) : lessons;
}

/* Périmètre par défaut (adaptatif) pour un pool éligible donné : « déjà vues »
   tant qu'il reste des leçons NON rencontrées (et qu'au moins une l'est) ; sinon
   « tout » (rien de rencontré → impossible ; tout rencontré → les deux périmètres
   sont identiques, autant rester sur « tout »). */
export function scopeParDefaut(
	eligibles: LessonDef[],
	vues: CarteRencontrees = loadRencontrees(),
): SprintScope {
	const rencontrees = eligibles.filter((l) => vues[l.id] != null).length;
	return rencontrees > 0 && rencontrees < eligibles.length ? 'seen' : 'all';
}

/* Le choix de périmètre a-t-il un sens à proposer pour ce pool ? Uniquement s'il y
   a un mélange de rencontré et de non-rencontré (sinon : un seul choix utile). */
export function perimetreChoisissable(
	eligibles: LessonDef[],
	vues: CarteRencontrees = loadRencontrees(),
): boolean {
	const rencontrees = eligibles.filter((l) => vues[l.id] != null).length;
	return rencontrees > 0 && rencontrees < eligibles.length;
}
