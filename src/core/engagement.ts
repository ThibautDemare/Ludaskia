/* ============================================================
   « Quelqu'un se sert-il vraiment de l'application ? » (#306)
   ------------------------------------------------------------
   Deux mécanismes ont besoin de cette réponse, et pour la même raison : ne rien
   imposer à un visiteur de passage.

   - le RÉCHAUFFEMENT du cache hors-ligne (§2) : télécharger 850 Ko de lexique à
     quelqu'un qui ouvre la page trente secondes et ne revient jamais est
     difficile à défendre sur un forfait mobile ;
   - le RAPPEL DE SAUVEGARDE (§7) : il ne s'affiche que s'il y a réellement
     quelque chose à perdre.

   ⚠ PIÈGE PRINCIPAL : ne PAS se baser sur l'existence d'un profil. `ludaskia_profiles`
   est écrit pendant l'accueil de premier lancement (prénom, avatar, choix de la
   classe) — il est donc présent chez exactement le visiteur qu'on veut exclure.
   Même remarque pour `ludaskia_tour_seen`, `ludaskia_parents_seen` et
   `ludaskia_eggs` : ce sont des traces du premier lancement, pas de l'engagement.

   Ce qu'on regarde, c'est une TRACE DE TRAVAIL, côté enfant (une réponse
   enregistrée) ou côté encadrant (une décision posée). On la cherche sur TOUS les
   profils : la maison est engagée dès qu'un de ses enfants l'est.

   Note sur le choix des clés côté enfant : `ludaskia_lessonStats` et
   `ludaskia_activity` plutôt que `ludaskia_xp` — un enfant qui se trompe partout a
   quand même travaillé, et il ne gagnerait aucun XP.
   ============================================================ */
import { lsGetRaw, lsKeysRaw } from './storage';
import { listProfiles } from './profiles';

/* Clés PAR PROFIL qui attestent d'un vrai usage. Une seule suffit.
   - `lessonStats` / `activity` : l'enfant a répondu, au moins une fois ;
   - `revoir` : l'adulte a épinglé une leçon à revoir ;
   - `seance` : l'adulte a composé un programme ;
   - `lessonVuAilleurs` : l'adulte a déclaré des leçons vues en classe ;
   - `ortho` : une liste de dictée a été créée. */
const CLES_PROFIL = [
	'ludaskia_lessonStats',
	'ludaskia_activity',
	'ludaskia_revoir',
	'ludaskia_seance',
	'ludaskia_lessonVuAilleurs',
	'ludaskia_ortho',
] as const;

/* Clé GLOBALE (non préfixée) : poser un code d'accès à l'espace encadrant est
   une décision d'adulte, pas une trace de premier lancement. */
const CLE_GLOBALE = 'ludaskia_encadrant_lock';

/* Une valeur stockée témoigne-t-elle de quelque chose ? Un tableau ou un objet
   VIDE ne compte pas : plusieurs de ces clés sont initialisées à vide par une
   simple visite (l'état d'orthographe, par exemple, s'écrit dès qu'on ouvre le
   mode, avant qu'aucune liste n'existe). */
function nonVide(v: unknown): boolean {
	if (v == null) return false;
	if (Array.isArray(v)) return v.length > 0;
	if (typeof v === 'object') return Object.values(v as object).some(nonVide);
	if (typeof v === 'string') return v.trim() !== '';
	if (typeof v === 'number') return true;
	return v !== false;
}

/* Le mode Orthographe écrit son état (banque + listes) dès qu'on l'ouvre : la
   présence de la clé ne prouve donc rien, seul son CONTENU compte. */
function orthoUtilise(v: unknown): boolean {
	if (!v || typeof v !== 'object') return false;
	const s = v as { listes?: unknown; banque?: unknown };
	return nonVide(s.listes) || nonVide(s.banque);
}

/* Un aménagement posé par l'adulte sur un profil (confort de lecture, lecture
   auto des consignes, sprint sans pression…) est une décision, donc un
   engagement. Les autres champs de profil (prénom, avatar, classe) viennent de
   l'accueil de premier lancement et ne comptent pas. */
function amenagementPose(prefs: unknown): boolean {
	return nonVide(prefs);
}

/** Quelqu'un s'est-il VRAIMENT servi de l'application, tous profils confondus ? */
export function engagementReel(): boolean {
	if (lsGetRaw(CLE_GLOBALE, null) != null) return true;
	let profils: { uuid: string; prefs?: unknown }[];
	try {
		profils = listProfiles();
	} catch {
		return false;
	}
	if (profils.some((p) => amenagementPose(p.prefs))) return true;
	// Lecture par UUID (et non via le profil actif) : l'engagement de la MAISON.
	// On tolère un préfixe hérité (profil d'avant les profils multiples, clé nue).
	const brutes = new Set(lsKeysRaw());
	const prefixes = ['', ...profils.map((p) => `${p.uuid}/`)];
	for (const prefixe of prefixes) {
		for (const cle of CLES_PROFIL) {
			const reelle = prefixe + cle;
			if (!brutes.has(reelle)) continue;
			const v = lsGetRaw(reelle, null);
			if (cle === 'ludaskia_ortho' ? orthoUtilise(v) : nonVide(v)) return true;
		}
	}
	return false;
}
