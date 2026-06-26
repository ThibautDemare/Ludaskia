/* ============================================================
   Easter eggs (#331) : petites surprises à découvrir, VOLONTAIREMENT
   DÉCOUPLÉES de l'apprentissage — aucune XP / étoile / graine, aucun
   FOMO, rien ne se perd si on ne revient pas. La découverte EST la
   récompense.

   Module PUR (aucun accès DOM, testable comme unlocks.ts) :
   - un catalogue déclaratif d'eggs (familles « exploration » / « ambient » /
     « visible ») ;
   - l'album des trouvailles (ids persistés, idempotent) ;
   - la décision d'apparition de l'egg ambiant (plancher anti-malchance
     + plafond/cooldown), exprimée comme une fonction PURE testable.

   Le rendu et les déclencheurs (taps, luciole qui traverse) vivent dans
   ui/eggs.ts. La persistance passe par une clé DÉDIÉE `ludaskia_eggs`
   (préfixée par profil via lsGet/lsSet), DISJOINTE de l'XP, des étoiles
   et des trophées : les eggs ne polluent jamais l'économie de jeu.
   ============================================================ */
import { lsGet, lsSet } from './storage';

// 'exploration' : déclencheur CACHÉ à dénicher (taps, hotspot forêt).
// 'ambient'     : apparition rare qui passe d'elle-même (luciole).
// 'visible'     : déclencheur OUVERT et assumé, offert à la vue (icône cookie du
//                 pied de page, #336) — un clin d'œil public, pas un secret.
export type EggFamily = 'exploration' | 'ambient' | 'visible';

export interface EggDef {
	id: string;
	family: EggFamily;
	/** Emoji de la « scène » rangée dans l'album : décor expressif et coloré,
	 *  donc emoji (pas une icône fonctionnelle Phosphor — cf. ui/icon.ts). */
	emoji: string;
	/** Légende poétique de l'album (jamais un nom technique). */
	titre: string;
}

/* Catalogue v1 « cœur sûr » (#331). On NE révèle JAMAIS à l'enfant la liste des
   eggs non trouvés (pas de checklist, pas de cases vides) : ce catalogue sert
   uniquement à rendre l'album (trouvés seulement) et à nommer une trouvaille. */
export const EGGS: EggDef[] = [
	{ id: 'mascotte-rieuse', family: 'exploration', emoji: '🐤', titre: "L'oiseau rieur" },
	{ id: 'ecureuil-foret', family: 'exploration', emoji: '🐿️', titre: "L'écureuil curieux" },
	{ id: 'luciole', family: 'ambient', emoji: '✨', titre: 'La luciole du soir' },
	{ id: 'pluie-de-cookies', family: 'visible', emoji: '🍪', titre: 'La pluie de cookies' },
];

export function getEgg(id: string): EggDef | undefined {
	return EGGS.find((e) => e.id === id);
}

/* ---------- Album : trouvailles persistées (par profil) ---------- */
const EGG_KEY = 'ludaskia_eggs';

interface EggState {
	/** Ids des eggs déjà trouvés, dans l'ordre de découverte (album). */
	found: string[];
}

function loadState(): EggState {
	const raw = lsGet(EGG_KEY, null) as Partial<EggState> | null;
	const found = Array.isArray(raw?.found)
		? raw!.found.filter((x): x is string => typeof x === 'string')
		: [];
	return { found };
}

function saveState(s: EggState): void {
	lsSet(EGG_KEY, s);
}

/** Ids des eggs trouvés, dans l'ordre de découverte. Filtrés sur le catalogue
 *  courant : un id orphelin (egg retiré du catalogue) n'apparaît pas. */
export function foundEggIds(): string[] {
	const valides = new Set(EGGS.map((e) => e.id));
	return loadState().found.filter((id) => valides.has(id));
}

/** Défs des eggs trouvés, dans l'ordre de découverte (pour l'album). */
export function foundEggs(): EggDef[] {
	return foundEggIds()
		.map((id) => getEgg(id))
		.filter((e): e is EggDef => e != null);
}

export function hasFoundEgg(id: string): boolean {
	return loadState().found.includes(id);
}

/** Range un egg dans l'album. Idempotent. Renvoie `true` s'il s'agit d'une
 *  PREMIÈRE découverte (l'appelant peut alors marquer le moment / rafraîchir
 *  l'album), `false` si l'egg était déjà trouvé (simple replay) ou si l'id est
 *  inconnu. */
export function markEggFound(id: string): boolean {
	if (!getEgg(id)) return false;
	const s = loadState();
	if (s.found.includes(id)) return false;
	s.found = [...s.found, id];
	saveState(s);
	return true;
}

/* ---------- Apparition ambiante : plancher + plafond (PUR) ----------
   La luciole (egg ambiant) « passe parfois » sur un écran de repos. Pour ne
   JAMAIS frustrer (un enfant malchanceux finirait par ne jamais la croiser) ni
   saturer (la surprise s'éteint si elle revient sans cesse), la décision n'est
   PAS un tirage indépendant :
   - tant qu'on n'a pas revu AMBIENT_MIN_GAP écrans de repos depuis la dernière
     apparition → on ne montre pas (cooldown / plafond, anti-spam) ;
   - au-delà de AMBIENT_PITY écrans sans apparition → on force (plancher
     anti-malchance, « pas d'attente infinie ») ;
   - entre les deux → tirage à la probabilité AMBIENT_CHANCE.
   Valeurs volontairement conservatrices (la rareté préserve la surprise) ;
   calibrage affinable avec gamification-enfant (cf. #331). */
export const AMBIENT_MIN_GAP = 2;
export const AMBIENT_PITY = 8;
export const AMBIENT_CHANCE = 0.2;

/* Décision PURE. À partir du compteur d'écrans de repos vus depuis la dernière
   apparition (`ambientSince`) et d'un tirage `roll` ∈ [0, 1[ INJECTÉ par
   l'appelant (jamais Math.random ici → testable, et conforme à l'aléa seedable
   #41 : aucun appel direct à Math.random dans core), renvoie s'il faut montrer
   l'egg ambiant et le nouveau compteur (remis à 0 après une apparition). */
export function decideAmbient(ambientSince: number, roll: number): { show: boolean; next: number } {
	const v = ambientSince + 1;
	let show: boolean;
	if (v < AMBIENT_MIN_GAP) show = false;
	else if (v >= AMBIENT_PITY) show = true;
	else show = roll < AMBIENT_CHANCE;
	return { show, next: show ? 0 : v };
}
