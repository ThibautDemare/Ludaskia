/* ============================================================
   Révision espacée (issue #45) — brique générique de sélection.
   ------------------------------------------------------------
   La répétition espacée est une STRATÉGIE DE SÉLECTION (« quoi est
   dû aujourd'hui »), pas un format de session. On l'applique à des
   « éléments à réviser » de deux natures :
     - les MOTS d'orthographe (état porté par MotOrtho.revision) ;
     - les LEÇONS de maths / conjugaison (état porté par progress.ts).
   Le modèle d'état (EtatRevision) est partagé. La logique ici est
   PURE et testable : `now` (ms) est toujours passé en paramètre —
   jamais de Date.now() interne (cf. contrainte tests Vitest).

   Escalier d'intervalles adapté CE2 (pas de SM-2), inspiré des « boîtes »
   de Leitner : phase d'ancrage rapprochée AU DÉBUT (J+1, J+3) pour mordre
   sur la courbe de l'oubli quand la trace est fraîche, puis espacement
   progressif :
     entrée → J+1 → J+3 → ~1 sem → ~2 sem → ~1 mois → ~2-3 mois → acquis.
   Une réussite monte d'un cran ; un échec recule d'UN cran (pas à zéro).
   La phase rapprochée est sans pénalité : un élément non révisé à temps est
   simplement « en retard », jamais culpabilisant (cf. discussion #45).
   ============================================================ */
import type { EtatRevision } from './orthographe/types';

export const JOUR = 86_400_000;
/* Délai avant re-test selon le palier ATTEINT (index = palier). */
export const REVISION_INTERVALLES = [1 * JOUR, 3 * JOUR, 7 * JOUR, 16 * JOUR, 35 * JOUR, 75 * JOUR];
/* Palier « acquis » : sort de la rotation active (gardé pour la fierté). */
export const PALIER_ACQUIS = REVISION_INTERVALLES.length; // 6
/* Plafond d'éléments dus proposés en une session (par-dessus rien d'autre). Valeur
   PAR DÉFAUT : un profil sans réglage explicite révise 12 éléments (comportement
   historique, avant #439). */
export const REVISION_PLAFOND = 12;
/* Plafond réglable par profil (#439) : l'adulte ajuste la charge d'une session dans
   l'espace encadrant. Bornes « raisonnables » (pas de 0, pas de valeur démesurée) et
   paliers du menu déroulant — calés avec le pédagogue (attention CE2/CM1, charge
   d'une séance). Le fallback + le bornage se font À LA LECTURE (getRevisionPlafond,
   profiles.ts), jamais à l'écriture, pour rester robustes aux données importées.
   NB : les paliers bas (6, 8) sont sûrs car `selectionEquilibree` (revision-select.ts)
   adapte son budget de vidage au plafond — sans quoi une session courte pouvait affamer
   une source pourtant due (cf. commentaire de la fonction). */
export const REVISION_PLAFOND_MIN = 6;
export const REVISION_PLAFOND_MAX = 24;
/* Paliers proposés dans le menu (12 = défaut, doit rester dans la liste). Granularité
   fine sur les petites valeurs (l'écart 6→8 est sensible pour un enfant fatigable),
   plus large sur les grandes (moins perçu) ; 20/24 = usage intensif assumé (rattrapage). */
export const REVISION_PLAFOND_CHOIX: readonly number[] = [6, 8, 10, 12, 15, 20, 24];

/* Entretien du niveau INFÉRIEUR (#232) : une séance peut ressortir des notions d'un
   niveau plus bas encore en cours de consolidation (un CM1 qui entretient son CE2 — le
   programme du cycle 3 REPREND explicitement des compétences du cycle 2 : technique
   opératoire posée, faits numériques mémorisés, conjugaison d'être/avoir et du 1er groupe).

   Dose = un petit NOMBRE ABSOLU par palier de plafond, délibérément pas un pourcentage
   (avis pédagogue) : l'objet est « ne pas laisser tomber à zéro », pas « représenter le
   passé à proportion ». Une seule réussite repousse l'échéance de plusieurs semaines à
   plusieurs mois (cf. REVISION_INTERVALLES) — une dose minuscule suffit à entretenir, une
   dose qui grossit avec le plafond ne ferait que grignoter le temps du niveau actif. Et
   sur la séance la plus courte (6, celle qu'un adulte règle pour un enfant fatigable),
   l'entretien est carrément SUSPENDU : le coût du changement de registre y pèserait plus
   lourd que le bénéfice. Plafond → dose : < 8 → 0, 8-11 → 1, 12-19 → 2, ≥ 20 → 3.
   Le maximum de 3 est un plafond dur : au-delà on n'entretient plus, on refait du niveau
   inférieur. Ces éléments prennent des slots DANS le plafond, jamais en plus : la charge
   d'une séance ne change pas. */
export const REVISION_BAS_NIVEAU_MAX = 3;
export function plafondBasNiveau(plafond: number): number {
	if (plafond < 8) return 0;
	if (plafond < 12) return 1;
	if (plafond < 20) return 2;
	return REVISION_BAS_NIVEAU_MAX;
}

/* Paramètres de la sélection équilibrée d'une session (algo dans
   `selectionEquilibree`, revision-select.ts) : une source surreprésentée — l'ortho,
   où chaque mot compte pour un élément — ne doit pas rafler toute la session. */
export const REVISION_SEUIL_SOURCE_VIDABLE = 4; // au-delà, une source est « grosse »
export const REVISION_MAX_VIDAGES_SOURCES = 2; // petites sources vidées d'un jet, max

/* État d'un élément PAS ENCORE en rotation (#641) : il existe, mais son compteur
   d'espacement n'a pas démarré. `prochaineRevision: null` au palier 0 — un état qu'aucun
   élément en rotation ne peut prendre (`avancerEtat` ne met `null` qu'au palier ACQUIS),
   donc lisible sans ambiguïté par `estHorsRotation`.

   Pourquoi : un mot d'orthographe ajouté par le parent entrait en rotation dès l'AJOUT,
   si bien qu'un mot jamais découvert à l'atelier arrivait « dû » le lendemain — et qu'une
   liste découverte trois semaines plus tard saturait la première séance de sa dette
   accumulée. Le compteur démarre donc à la première rencontre RÉELLE (`marquerAtelierFait`,
   orthographe/runner.ts). */
export function etatHorsRotation(): EtatRevision {
	return { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null };
}

/* L'élément n'a jamais commencé sa rotation. Distinct d'« acquis » (palier ACQUIS, sorti
   de la rotation par le haut) et distinct d'un état absent (données d'avant #45, que
   `backfillMotRevisions` rattrape). Un état manquant compte ici comme hors rotation :
   l'appelant a alors tout à poser. */
export function estHorsRotation(e: EtatRevision | undefined | null): boolean {
	return !e || (e.palier === 0 && e.prochaineRevision == null && e.dernierTest == null);
}

/* État d'un élément qui ENTRE en rotation (dès l'ajout / la 1re rencontre) :
   palier 0, premier re-test dès le lendemain (J+1) pour consolider à chaud. */
export function etatNeuf(now: number): EtatRevision {
	return {
		palier: 0,
		prochaineRevision: now + REVISION_INTERVALLES[0],
		reussites: 0,
		dernierTest: null,
	};
}

/* Un élément est « dû » s'il est en rotation, pas encore acquis, et que sa date
   de re-test est passée. */
export function estDu(e: EtatRevision | undefined | null, now: number): boolean {
	return (
		!!e && e.palier < PALIER_ACQUIS && e.prochaineRevision != null && e.prochaineRevision <= now
	);
}

export function estAcquis(e: EtatRevision | undefined | null): boolean {
	return !!e && e.palier >= PALIER_ACQUIS;
}

/* Fait évoluer l'état après une réponse : réussite → +1 cran (jusqu'à acquis,
   qui sort de la rotation) ; échec → -1 cran (jamais en dessous de 0). */
export function avancerEtat(e: EtatRevision, reussi: boolean, now: number): EtatRevision {
	const palier = reussi ? Math.min(PALIER_ACQUIS, e.palier + 1) : Math.max(0, e.palier - 1);
	const acquis = palier >= PALIER_ACQUIS;
	const delai = REVISION_INTERVALLES[Math.min(palier, REVISION_INTERVALLES.length - 1)];
	return {
		palier,
		prochaineRevision: acquis ? null : now + delai,
		reussites: e.reussites + (reussi ? 1 : 0),
		dernierTest: now,
	};
}
