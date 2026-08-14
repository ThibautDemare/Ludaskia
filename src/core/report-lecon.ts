/* ============================================================
   Avancement et REPORT d'une leçon du jour (#485) — socle PUR, sans stockage.
   ------------------------------------------------------------
   Deux règles, validées avec `pedagogue-primaire`, pour qu'un enfant ne reste
   jamais bloqué derrière une leçon trop dure :

   1. AVANCEMENT ASSOUPLI. Une leçon fait avancer le fil de la leçon du jour dès
      qu'elle est « franchie » = étoilée OU réussie à au moins `SEUIL_FRANCHIE`
      sur un essai COMPLET en mode leçon. L'étoile, elle, ne change pas (100 %,
      jamais retirée, seule à déclencher récompenses et trophées) : exiger le
      sans-faute pour AVANCER bloquait indéfiniment un enfant à 8 ou 9 sur 10,
      alors que les repères officiels visent une consolidation de fin d'année, pas
      leçon par leçon. La maîtrise durable reste portée par la révision espacée.

   2. REPORT. Une leçon travaillée sans être franchie est écartée du fil quelques
      jours, puis y revient d'elle-même (rien de visible côté enfant : la carte
      propose simplement autre chose). L'escalade compte des JOURS où l'enfant a
      buté, pas des tentatives : retenter deux fois dans la même séance est sain.
      Le premier jour de blocage ne reporte rien.

   Le score de référence est écrit UNIQUEMENT depuis un essai en mode leçon
   (`meilleurPct`) : la fenêtre récente de `LessonStat` est alimentée aussi par le
   sprint, les bilans et la révision espacée, où une leçon peut ne peser qu'une seule
   question — deux questions de sprint réussies suffiraient à « franchir » une leçon
   jamais travaillée en série. Reste vrai depuis que la fenêtre est PONDÉRÉE (#541) :
   la pondération corrige le poids d'un item dans une performance moyenne, elle ne
   fait pas d'un item la preuve qu'une série complète est réussie.

   Module SANS dépendance applicative (même rôle de socle que maitrise.ts) : la
   persistance vit dans progress.ts, la sélection dans lecon-du-jour.ts, tous deux
   consommateurs de ce module. `now` est toujours passé par l'appelant.
   ============================================================ */
import { SEUIL_NON_ACQUIS, SEUIL_REVOIR } from './maitrise';
import { REVISION_INTERVALLES } from './revision';

/* Seuil d'AVANCEMENT : le même que « notion solide » (maitrise.ts), déjà le point de
   vérité qui désépingle la file « à revoir ». Un seul seuil de « plus besoin d'insister ». */
export const SEUIL_FRANCHIE = SEUIL_REVOIR;

/* Nombre de JOURS de blocage à partir duquel on reporte. 1 = pas de report : le
   premier échec est banal (distraction, découverte), retenter tout de suite est sain. */
export const JOURS_AVANT_REPORT = 2;

/* Cran maximal de l'escalier de délais : on plafonne sur REVISION_INTERVALLES[2].
   L'escalier de report REUTILISE celui de la révision espacée (1 j → 3 j → 7 j) : un
   seul modèle d'espacement dans l'appli, pas une échelle parallèle à maintenir. */
export const CRAN_REPORT_MAX = 2;

/* Nombre de BLOCAGES (= jours où l'enfant a buté, cf. `EtatReport.jours`) à partir duquel
   l'espace encadrant doit le signaler à l'adulte (suggestion « à revoir », jamais un
   épinglage d'office) : un mur qui revient demande une explication humaine, pas une
   répétition de plus. Le 1er blocage ne reportant rien, 3 blocages = 2e report — dans la
   fenêtre « 2e ou 3e report » validée avec le pédagogue. */
export const BLOCAGES_SIGNAL_ADULTE = 3;

/** État d'avancement d'une leçon vis-à-vis de la leçon du jour. Une entrée est créée
    au PREMIER essai en mode leçon et vit ensuite indéfiniment (structure bornée par le
    nombre de leçons, donc aucune rétention à gérer). */
export interface EtatReport {
	/** Nombre de JOURS distincts où l'enfant a buté sur cette leçon (jamais deux pour
	    un même jour civil : l'escalade mesure des jours, pas des tentatives). */
	jours: number;
	/** Dernier jour civil compté ('YYYY-MM-DD') — garde anti double-compte du jour. */
	dernierJour: string;
	/** Horodatage de l'essai qui a déclenché le report EN COURS (0 = pas de report).
	    Ordonne les reports « du plus anciennement mis de côté » (plafond par matière). */
	reporteLe: number;
	/** Horodatage du retour dans le fil (0 = pas de report en cours). */
	reprendreLe: number;
	/** Meilleur score (%) obtenu sur un essai COMPLET en mode leçon. Monotone, comme
	    l'étoile : ce que l'enfant a montré une fois ne se reperd pas. */
	meilleurPct: number;
}

export function etatReportVierge(): EtatReport {
	return { jours: 0, dernierJour: '', reporteLe: 0, reprendreLe: 0, meilleurPct: 0 };
}

/* Lecture DÉFENSIVE d'une entrée stockée, champ par champ : le contenu peut venir d'un
   export importé ou d'une édition à la main. Un champ absent ou non numérique se
   propagerait sinon en NaN (`Math.max(undefined, 85)`), qui persiste en `null` et fait
   PERDRE un franchissement — l'état vierge ne couvre, lui, que l'entrée absente. */
function assainir(etat: EtatReport | undefined): EtatReport {
	const vierge = etatReportVierge();
	if (!etat) return vierge;
	const num = (v: unknown, defaut: number) =>
		typeof v === 'number' && Number.isFinite(v) ? v : defaut;
	return {
		jours: num(etat.jours, vierge.jours),
		dernierJour: typeof etat.dernierJour === 'string' ? etat.dernierJour : vierge.dernierJour,
		reporteLe: num(etat.reporteLe, vierge.reporteLe),
		reprendreLe: num(etat.reprendreLe, vierge.reprendreLe),
		meilleurPct: num(etat.meilleurPct, vierge.meilleurPct),
	};
}

/** Jour civil d'un instant ('YYYY-MM-DD', heure locale — même convention que
    `todayStr` / `dateStrDe`, redéfini ici pour garder ce socle sans dépendance). */
export function jourDe(now: number): string {
	const d = new Date(now);
	const p2 = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Délai de report (ms) après `jours` jours de blocage, sachant le score du dernier
    essai. 0 = aucun report. Un score très faible (< `SEUIL_NON_ACQUIS`) fait passer
    au cran SUIVANT : la notion n'est pas installée, la marteler tout de suite n'aide
    pas (elle continue par ailleurs de revenir via la révision espacée). */
export function delaiReport(jours: number, pct: number): number {
	if (jours < JOURS_AVANT_REPORT) return 0;
	const cran = jours - JOURS_AVANT_REPORT + (pct < SEUIL_NON_ACQUIS ? 1 : 0);
	return REVISION_INTERVALLES[Math.min(cran, CRAN_REPORT_MAX)];
}

/** La leçon fait-elle AVANCER le fil ? Étoilée, ou déjà réussie à `SEUIL_FRANCHIE`
    sur un essai complet en mode leçon. */
export function estFranchie(etat: EtatReport | undefined, etoilee: boolean): boolean {
	return etoilee || (etat?.meilleurPct ?? 0) >= SEUIL_FRANCHIE;
}

/** La leçon est-elle mise de côté à cet instant ? (Un report échu ne l'est plus.) */
export function enReport(etat: EtatReport | undefined, now: number): boolean {
	return !!etat && etat.reprendreLe > now;
}

/** État après un essai COMPLET en mode leçon (`pct` = % de bonnes réponses).
    - franchie (par le score ou par l'étoile) → plus rien à mettre de côté, on garde
      la mémoire du meilleur score et on REMET LE COMPTEUR DE BLOCAGES À ZÉRO ;
    - même jour civil qu'un blocage déjà compté → on n'escalade pas (retenter est sain),
      seul le meilleur score peut monter ;
    - nouveau jour de blocage → +1 jour et report selon l'escalier.
    Pure : renvoie un état neuf, n'écrit rien. */
export function apresEssaiLecon(
	etat: EtatReport | undefined,
	pct: number,
	now: number,
	etoilee = false,
): EtatReport {
	const base = assainir(etat);
	const meilleurPct = Math.max(base.meilleurPct, pct);
	if (estFranchie({ ...base, meilleurPct }, etoilee)) {
		// Compteur de blocages REMIS À ZÉRO au franchissement. Il décrit une difficulté
		// COURANTE, pas un passé : il commande l'escalier de report ET le signal à l'adulte
		// (`BLOCAGES_SIGNAL_ADULTE` → puce « reste un point dur » de l'espace encadrant). Cumulé
		// à vie, il rendait ce signal définitif — une notion butée trois fois en octobre puis
		// maîtrisée restait signalée « point dur » toute l'année, et le parent lisait un mur
		// jamais résolu là où il n'y avait plus qu'un souvenir. Plus l'appli servait longtemps,
		// moins le signal disait quelque chose (constat du `pedagogue-primaire`, #490).
		// `dernierJour` repart avec lui : le compteur qu'il protège du double-compte est neuf.
		return { ...base, jours: 0, dernierJour: '', meilleurPct, reporteLe: 0, reprendreLe: 0 };
	}
	const jour = jourDe(now);
	if (jour === base.dernierJour) return { ...base, meilleurPct };
	const jours = base.jours + 1;
	const delai = delaiReport(jours, pct);
	return {
		jours,
		dernierJour: jour,
		meilleurPct,
		reporteLe: delai > 0 ? now : 0,
		reprendreLe: delai > 0 ? now + delai : 0,
	};
}
