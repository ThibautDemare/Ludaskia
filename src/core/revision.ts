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

const JOUR = 86_400_000;
/* Délai avant re-test selon le palier ATTEINT (index = palier). */
export const REVISION_INTERVALLES = [1 * JOUR, 3 * JOUR, 7 * JOUR, 16 * JOUR, 35 * JOUR, 75 * JOUR];
/* Palier « acquis » : sort de la rotation active (gardé pour la fierté). */
export const PALIER_ACQUIS = REVISION_INTERVALLES.length; // 6
/* Plafond d'éléments dus proposés en une session (par-dessus rien d'autre). */
export const REVISION_PLAFOND = 12;

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
