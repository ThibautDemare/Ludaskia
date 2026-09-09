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

   Un rendez-vous servi TRÈS en retard fait exception aux deux règles ci-dessus
   (#688) : voir `REVISION_RETARD_FACTEUR` et `avancerEtat` plus bas.
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

/* ---------- Borner l'ENTRÉE en rotation (#690) ----------
   Le gate hors rotation (#641, plus bas) empêche un élément d'arriver « dû » sans avoir
   jamais été rencontré, mais rien ne bornait le NOMBRE d'éléments démarrant leur cascade
   J+1 / J+3 la même semaine. Mesuré sur un profil réel au 8 septembre 2026 : 101 leçons
   déclarées « vues en classe » entrées ensemble, puis environ 11 mots découverts par
   semaine, pour une capacité d'absorption d'environ 8 par semaine au réglage maximal. Le
   profil n'est jamais sorti de la congestion qui a suivi.

   Le budget est DÉRIVÉ du plafond de séance, pas réglé à part : même principe que
   `plafondBasNiveau` ci-dessus, une dose plutôt qu'un curseur de plus dans l'espace
   encadrant, que personne ne saurait régler. Plafond → budget : 2 / 3 / 3 / 4 / 5 / 7 / 8
   sur les sept paliers de `REVISION_PLAFOND_CHOIX`.

   Le plancher de 2 tient même sur un plafond dégénéré (donnée importée) : le bornage de
   `getRevisionPlafond` se fait à la lecture, et un budget nul figerait la file pour
   toujours. */
export const REVISION_BUDGET_MIN = 2;
export function budgetEntreesRotation(plafond: number): number {
	if (!Number.isFinite(plafond)) return REVISION_BUDGET_MIN;
	return Math.max(REVISION_BUDGET_MIN, Math.round(plafond / 3));
}

/* Fenêtre du budget : 7 jours GLISSANTS, sans report du déficit d'une semaine sur
   l'autre. Reporter le dépassement rendrait le blocage cumulatif, et un élément différé
   pourrait alors ne jamais entrer. */
export const REVISION_FENETRE_ENTREES = 7 * JOUR;

/* Au-delà de cette attente, un élément différé passe devant les autres déclarations et
   ouvre le « slot réservé » (cf. `promouvoirEntreesEnAttente`, progress.ts) : au moins une
   entrée par fenêtre lui est garantie, même si les rencontres réelles ont déjà épuisé le
   budget. Sans ce plancher, un enfant qui découvre plus de mots par semaine que le budget
   bloquerait indéfiniment tout son stock déclaré — c'est le cas d'école mesuré (11 mots
   par semaine pour un budget de 8), et le budget n'aurait plus de borne annonçable.
   Le slot est un PLANCHER, jamais une allocation : il ne s'ouvre que si la fenêtre n'a rien
   laissé passer côté déclarations, donc la charge d'une semaine ne dépasse jamais
   `budget + 1`. */
export const REVISION_ATTENTE_MAX = 28 * JOUR;

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

/* ---------- Le rendez-vous servi TRÈS en retard (#688) ----------
   Quand la file de révision dépasse ce que l'enfant peut traiter, ses rendez-vous sont
   servis très en retard, et l'escalier traitait jusqu'ici un test tardif exactement comme
   un test à l'heure. Mesuré sur un profil réel au 8 septembre 2026 : retard médian de
   20,5 jours, soit DIX fois l'intervalle du palier, et 148 des 233 éléments en rotation
   bloqués aux paliers 0 et 1 (intervalles de 1 et 3 jours). Deux informations étaient
   jetées à chaque passage :
     - une réussite après 48 jours ne valait qu'un cran, alors que l'enfant venait de
       démontrer 48 jours de rétention : le mot revenait dans 3 jours ;
     - un échec après 48 jours coûtait un cran, comme un échec à l'heure. Or il est
       imputable au retard de la file, pas à l'enfant : un rappel qui arrive après la
       disparition de la trace ne mesure plus une compétence. L'élément redescendait et
       rechargeait le BAS de l'escalier, là où un élément coûte 25 à 75 fois plus cher
       qu'en haut — la congestion s'auto-entretenait.

   Le retard réel d'un passage, et lui seul, déclenche les deux correctifs. Donc aucun
   état ne change sans une correction (rien au chargement, aucune migration), et le
   mécanisme est totalement INERTE sur une file saine.

   SEUIL : le retard doit atteindre ce facteur fois l'intervalle du palier. En dessous, on
   est dans la variance ordinaire d'un calendrier de 3 séances par semaine, qui ne prouve
   rien sur la mémoire. */
export const REVISION_RETARD_FACTEUR = 2;

/* Plafond du saut de palier. Un crédit, même massif, ne mène jamais plus haut que le
   palier 3 : il reste alors au moins trois réussites à des rendez-vous RÉELS
   (16 + 35 + 75 jours) avant l'ancre. Le crédit ne peut donc pas ancrer à lui seul, et le
   trophée #660 continue de constater ce qui a TENU.

   Le second plafond du cadrage (« ni 3 crans d'un seul passage ») n'est pas codé : il est
   DOMINÉ partout par celui-ci. Depuis le palier 0 les deux donnent 3 ; à partir du palier
   1, le plafond de palier est strictement plus strict. En faire une branche serait du code
   mort.

   MAIS cette dominance tient à une coïncidence numérique (les deux valeurs valent 3), pas
   à une relation vérifiée : augmenter cette constante réactive le second plafond, qui
   n'existe alors nulle part dans le code pour le retenir. Le filet est côté test —
   `tests/revision-retard.test.ts` compare au littéral 3 et non à cette constante, donc un
   changement ici fait échouer le plafond du critère 2 — mais c'est cette ligne qui dit
   pourquoi le test tombe. */
export const REVISION_CREDIT_PALIER_MAX = 3;

/* Délai avant re-test du palier atteint (les paliers au-delà du dernier intervalle —
   l'acquis — n'en ont pas leur propre). */
function intervalleDe(palier: number): number {
	return REVISION_INTERVALLES[Math.min(palier, REVISION_INTERVALLES.length - 1)];
}

/* Le rendez-vous a-t-il été servi assez tard pour que le retard soit imputable à la FILE
   plutôt qu'à l'enfant ? Faux pour un élément qui n'a pas de rendez-vous du tout (hors
   rotation, acquis) : il n'y a alors aucun retard à constater. */
function serviTresEnRetard(e: EtatRevision, now: number): boolean {
	if (e.prochaineRevision == null) return false;
	return now - e.prochaineRevision >= REVISION_RETARD_FACTEUR * intervalleDe(e.palier);
}

/* Le plus HAUT palier dont l'intervalle a été tenu EN ENTIER pendant `ecoule` ; -1 si même
   le premier ne l'a pas été.

   C'est la lecture retenue (arbitrage du mainteneur) de « le palier correspondant au délai
   réellement écoulé » : 10 jours tenus démontrent le palier 2 (7 jours), pas le palier 3
   (16 jours). Le délai écoulé est une PREUVE de rétention ; créditer le palier suivant
   extrapolerait au-delà de la mesure, et ferait sauter DEUX crans à un élément servi
   6 jours en retard — exactement la variance qu'on vient de déclarer non probante.

   Conséquence, éprouvée par exploration dans `tests/revision-retard.test.ts` : le crédit
   ne raccourcit JAMAIS le chemin vers l'ancre, qui reste de 137 jours. L'escalier est
   sur-additif (7 > 1+3, 16 > 3+7, 35 > 7+16, 75 > 16+35), donc attendre assez longtemps
   pour se faire créditer un cran de plus coûte toujours plus de jours que de gagner ce
   cran en deux rendez-vous servis à l'heure. Le crédit rattrape une information jetée, il
   ne fabrique pas de progression. */
function palierDemontre(ecoule: number): number {
	let p = -1;
	for (let i = 0; i < REVISION_INTERVALLES.length; i++) {
		if (REVISION_INTERVALLES[i] <= ecoule) p = i;
	}
	return p;
}

function palierApresPassage(e: EtatRevision, reussi: boolean, now: number): number {
	const tardif = serviTresEnRetard(e, now);
	if (!reussi) {
		/* Échec très tardif : l'élément CONSERVE son palier au lieu de reculer, et son
		   échéance est simplement reposée à l'intervalle du palier conservé. Le non-débit ne
		   s'applique jamais à un échec servi à l'heure ou en retard modéré : celui-là recule
		   d'un cran comme avant, sans quoi une notion réellement fragile deviendrait
		   indétectable. */
		return tardif ? e.palier : Math.max(0, e.palier - 1);
	}
	const normal = Math.min(PALIER_ACQUIS, e.palier + 1);
	/* Aucun crédit sans mesure antérieure : une leçon déclarée « vue en classe » il y a
	   45 jours et réussie à son premier passage ne démontre aucune rétention — on ne sait
	   pas ce que ces 45 jours ont contenu. Une PREMIÈRE mesure n'est pas une mesure de
	   rétention. */
	if (!tardif || e.dernierTest == null) return normal;
	const credit = Math.min(REVISION_CREDIT_PALIER_MAX, palierDemontre(now - e.dernierTest));
	/* Le plafond borne le CRÉDIT, jamais l'avancement normal : un palier 3 réussi
	   tardivement monte au palier 4 comme avant, il ne stagne pas au plafond. */
	return Math.max(normal, credit);
}

/* Fait évoluer l'état après une réponse : réussite → +1 cran (jusqu'à acquis, qui sort de
   la rotation) ; échec → -1 cran (jamais en dessous de 0). Un rendez-vous servi très en
   retard fait exception aux deux règles (#688, cf. `palierApresPassage`). */
export function avancerEtat(e: EtatRevision, reussi: boolean, now: number): EtatRevision {
	const palier = palierApresPassage(e, reussi, now);
	const acquis = palier >= PALIER_ACQUIS;
	return {
		palier,
		prochaineRevision: acquis ? null : now + intervalleDe(palier),
		reussites: e.reussites + (reussi ? 1 : 0),
		dernierTest: now,
	};
}
