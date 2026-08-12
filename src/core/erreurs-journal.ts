/* ============================================================
   Journal des erreurs par profil (#391) — logique pure + persistance.
   ------------------------------------------------------------
   Journalise localement CHAQUE erreur commise pendant un entraînement :
   la question posée, la réponse donnée, la réponse attendue, la leçon, le
   mode et l'horodatage. Objectif : permettre à l'encadrant (espace adulte)
   de voir précisément OÙ l'enfant bute, sans rester à côté pendant la
   session. Tout reste local (localStorage), en lecture seule côté encadrant.

   Écriture : depuis les runners, sur le profil ACTIF (clés préfixées via
   lsGet/lsSet), comme le reste de la progression.
   Lecture : par UUID (clé BRUTE `uuid + '/' + KEY`), SANS changer le profil
   actif — même invariant que l'espace encadrant (cf. encadrant-stats.ts,
   loadRevoirFor). La journalisation vit ici (core, sans DOM) ; l'affichage
   dans ui/encadrant-erreurs.ts.

   Rétention : on ne garde que les MAX_ERREURS entrées les plus récentes par
   profil (les plus anciennes sont purgées) pour ne pas faire grossir
   indéfiniment le localStorage.
   ============================================================ */
import { lsGet, lsSet, lsGetRaw } from './storage';
import { debutJourLocal } from './utils';

/* Clé de stockage (préfixée par le profil actif en écriture ; lue en brut par UUID). */
export const ERREURS_KEY = 'ludaskia_erreurs';

/* Nombre maximal d'entrées conservées PAR PROFIL. Au-delà, les plus anciennes
   sont purgées (le journal est un aperçu des erreurs RÉCENTES, pas une archive
   exhaustive). Volontairement borné pour rester léger en localStorage. */
export const MAX_ERREURS = 150;

/* Une erreur journalisée. `question`/`donnee`/`attendue` sont déjà des chaînes
   LISIBLES (formatées par le site de capture) : le journal ne connaît pas les
   items ni les exercices, il stocke du texte prêt à afficher. `lessonId` est
   l'id NU de la leçon (sans `@niveau`) → résolution du libellé via getLessonById. */
export interface ErreurEntry {
	ts: number; // horodatage (ms)
	lessonId: string; // id de leçon (nu), pour regrouper et retrouver le libellé
	mode: string; // mode d'entraînement ('lecon' | 'express' | 'complet' | 'sprint' | 'dictee'…)
	question: string; // énoncé posé (lisible)
	donnee: string; // réponse donnée par l'enfant
	attendue: string; // réponse attendue
	/* AUCUNE tentative (#467) : l'enfant a demandé à voir la réponse (« Je ne sais
	   pas, montre-moi ») ou validé à vide, au lieu de répondre. La répétition espacée
	   traite ce cas comme une réponse fausse, mais l'encadrant doit pouvoir distinguer
	   « raté après tentative » de « passé sans essayer ».
	   OPTIONNEL et écrit UNIQUEMENT quand il vaut `true` : les entrées déjà stockées
	   (sans le champ) restent valides, et le journal ne se charge pas d'un `false`
	   répété sur des centaines d'entrées. Absent ⇒ tentative faite. */
	sansTentative?: true;
}

/* Garde de forme : n'accepte qu'une entrée bien formée (défensif à la lecture
   d'un localStorage potentiellement corrompu / issu d'une autre version).
   `sansTentative` n'est PAS exigé (les entrées d'avant #467 n'en ont pas) : on ne
   valide son type que s'il est présent. */
function estErreurValide(e: unknown): e is ErreurEntry {
	if (!e || typeof e !== 'object') return false;
	const o = e as Record<string, unknown>;
	return (
		typeof o.ts === 'number' &&
		typeof o.lessonId === 'string' &&
		typeof o.mode === 'string' &&
		typeof o.question === 'string' &&
		typeof o.donnee === 'string' &&
		typeof o.attendue === 'string' &&
		(o.sansTentative === undefined || o.sansTentative === true)
	);
}

/* Ajoute une erreur en tête de liste (plus récente d'abord) et applique la
   rétention (on garde au plus `max` entrées). Pur (aucun accès stockage) —
   c'est le cœur testable de la journalisation. Ne mute pas `liste`. */
export function ajouterErreur(
	liste: ErreurEntry[],
	entry: ErreurEntry,
	max = MAX_ERREURS,
): ErreurEntry[] {
	return [entry, ...liste].slice(0, Math.max(0, max));
}

/* Journalise une erreur sur le profil ACTIF. `ts` est estampillé ici (Date.now)
   comme le reste de la progression (recordMonteesPalier…) ; la logique pure de
   rétention est déléguée à `ajouterErreur`. Une entrée sans leçon identifiée
   n'est pas journalisable (rien à regrouper / afficher) et est ignorée par les
   sites de capture en amont ; on la re-garde ici par sécurité. */
export function journaliserErreur(e: Omit<ErreurEntry, 'ts'>): void {
	if (!e.lessonId) return;
	const brut = lsGet(ERREURS_KEY, []);
	const liste = Array.isArray(brut) ? (brut.filter(estErreurValide) as ErreurEntry[]) : [];
	lsSet(ERREURS_KEY, ajouterErreur(liste, { ...e, ts: Date.now() }));
}

/* Journal d'un profil donné par UUID (consultation côté encadrant), le plus
   récent d'abord. Lecture BRUTE (clé `uuid + '/' + KEY`) : ne touche jamais le
   profil actif. Tolère un stockage corrompu (filtre les entrées invalides). */
export function chargerErreursFor(uuid: string): ErreurEntry[] {
	const v = lsGetRaw(uuid + '/' + ERREURS_KEY, []);
	return Array.isArray(v) ? (v.filter(estErreurValide) as ErreurEntry[]) : [];
}

/* ---------- Filtre de période (#476, pur) ----------
   Le bloc encadrant dit « récemment » : sans borne temporelle, il montrait en fait
   « les MAX_ERREURS dernières erreurs », qui peuvent remonter à des semaines pour un
   profil peu actif. On filtre donc sur `ts` AVANT le regroupement, pour que tous les
   compteurs (« N erreurs », « dernière fois », « vue N fois ») parlent de la période
   choisie. Les fenêtres sont des JOURS CALENDAIRES locaux (et non des 24 h glissantes),
   par cohérence avec le reste de l'espace encadrant (graphe d'activité,
   `libelleDerniereFois` : « aujourd'hui » = le même jour calendaire). */
export type PeriodeErreurs = 'jour' | 'deux-jours' | 'semaine' | 'tout';

/* Nombre de jours calendaires couverts, aujourd'hui INCLUS ('semaine' = 7 jours, comme
   le graphe d'activité). 'tout' n'a pas de borne : seule la rétention MAX_ERREURS joue. */
const JOURS_PERIODE: Record<Exclude<PeriodeErreurs, 'tout'>, number> = {
	jour: 1,
	'deux-jours': 2,
	semaine: 7,
};

/* Ordre de repli du choix par défaut : de la fenêtre la plus serrée à la plus large
   (cf. `periodeParDefaut`). Ne contient PAS 'tout' — le défaut reste « récent ». */
export const PERIODES_REPLI: readonly Exclude<PeriodeErreurs, 'tout'>[] = [
	'jour',
	'deux-jours',
	'semaine',
];

/* Horodatage à partir duquel une erreur tombe dans la période (borne INCLUSIVE).
   'tout' → aucune borne. */
function seuilPeriode(periode: PeriodeErreurs, now: number): number {
	if (periode === 'tout') return -Infinity;
	return debutJourLocal(now, JOURS_PERIODE[periode] - 1);
}

/* Erreurs de la période choisie, ordre d'origine préservé (plus récent d'abord).
   Ne mute pas `liste`. */
export function filtrerErreursParPeriode(
	liste: ErreurEntry[],
	periode: PeriodeErreurs,
	now: number,
): ErreurEntry[] {
	if (periode === 'tout') return liste.slice();
	const seuil = seuilPeriode(periode, now);
	return liste.filter((e) => e.ts >= seuil);
}

/* Période présélectionnée à l'ouverture : la PLUS SERRÉE qui contient au moins une
   erreur ('aujourd'hui', sinon 2 jours, sinon 1 semaine). Décision produit #476 :
   répondre d'abord à « sur quoi a-t-il buté aujourd'hui ? », sans faire tomber le
   parent sur un bloc vide quand la dernière séance date de l'avant-veille. Journal
   vide ou entièrement plus ancien qu'une semaine → 'semaine' (l'encadrant élargit
   lui-même à « Tout »). */
export function periodeParDefaut(liste: ErreurEntry[], now: number): PeriodeErreurs {
	for (const p of PERIODES_REPLI) {
		const seuil = seuilPeriode(p, now);
		if (liste.some((e) => e.ts >= seuil)) return p;
	}
	return PERIODES_REPLI[PERIODES_REPLI.length - 1];
}

/* ---------- Regroupement pour l'affichage (pur) ----------
   L'espace encadrant montre les erreurs GROUPÉES PAR LEÇON, la leçon la PLUS RATÉE
   en tête (#519). Le tri était antéchronologique à l'origine (décision designer
   #391), mais l'usage réel a montré qu'une leçon ratée une seule fois passait
   devant celle qui coince vraiment : c'est le VOLUME qui répond à la question du
   parent, « sur quoi l'aider ? ». À `total` égal, la plus récemment ratée départage
   — ordre déterministe (donc testable) et le signal de récence n'est pas perdu.
   La récence, elle, reste portée par le FILTRE DE PÉRIODE (#476) appliqué AVANT le
   regroupement : `total` ne compte que la fenêtre choisie, donc le classement se
   recalcule à chaque changement de période. À l'intérieur d'une leçon, on
   DÉDOUBLONNE la même erreur (même question + même réponse donnée) répétée : une
   seule ligne « vu N fois » plutôt que N lignes identiques (les banques QCM se
   répètent), les plus récentes d'abord. `sansTentative` (#467) entre dans la clé de
   dédoublonnage : un item PASSÉ et le même item RATÉ ne sont pas la même chose pour
   le parent, les fusionner en « vu 2 fois » lui mentirait. */
export interface ErreurAffichee {
	question: string;
	donnee: string;
	attendue: string;
	mode: string;
	ts: number; // horodatage de l'occurrence la plus récente
	occurrences: number; // nombre de fois cette même erreur (≥ 1)
	sansTentative?: true; // item passé sans essayer (cf. ErreurEntry)
}
export interface GroupeErreursLecon {
	lessonId: string;
	total: number; // nombre total d'erreurs de la leçon (occurrences cumulées)
	derniereFois: number; // horodatage de l'erreur la plus récente de la leçon
	erreurs: ErreurAffichee[]; // dédoublonnées, plus récent d'abord
}

export function grouperErreursParLecon(liste: ErreurEntry[]): GroupeErreursLecon[] {
	const parLecon = new Map<string, ErreurEntry[]>();
	for (const e of liste) {
		const bucket = parLecon.get(e.lessonId);
		if (bucket) bucket.push(e);
		else parLecon.set(e.lessonId, [e]);
	}
	const groupes: GroupeErreursLecon[] = [];
	for (const [lessonId, entries] of parLecon) {
		const parCle = new Map<string, ErreurAffichee>();
		for (const e of entries) {
			// Clé sans risque de collision de séparateur. Le marqueur est NORMALISÉ en
			// booléen : une entrée sans le champ et une entrée `sansTentative: true`
			// doivent former deux lignes distinctes, mais deux entrées passées la même.
			const cle = JSON.stringify([e.question, e.donnee, e.sansTentative === true]);
			const existe = parCle.get(cle);
			if (existe) {
				existe.occurrences++;
				if (e.ts > existe.ts) existe.ts = e.ts;
			} else {
				parCle.set(cle, {
					question: e.question,
					donnee: e.donnee,
					attendue: e.attendue,
					mode: e.mode,
					ts: e.ts,
					occurrences: 1,
					sansTentative: e.sansTentative,
				});
			}
		}
		const erreurs = [...parCle.values()].sort((a, b) => b.ts - a.ts);
		groupes.push({
			lessonId,
			total: entries.length,
			derniereFois: Math.max(...entries.map((e) => e.ts)),
			erreurs,
		});
	}
	return groupes.sort((a, b) => b.total - a.total || b.derniereFois - a.derniereFois);
}
