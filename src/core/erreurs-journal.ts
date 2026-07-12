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
}

/* Garde de forme : n'accepte qu'une entrée bien formée (défensif à la lecture
   d'un localStorage potentiellement corrompu / issu d'une autre version). */
function estErreurValide(e: unknown): e is ErreurEntry {
	if (!e || typeof e !== 'object') return false;
	const o = e as Record<string, unknown>;
	return (
		typeof o.ts === 'number' &&
		typeof o.lessonId === 'string' &&
		typeof o.mode === 'string' &&
		typeof o.question === 'string' &&
		typeof o.donnee === 'string' &&
		typeof o.attendue === 'string'
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

/* ---------- Regroupement pour l'affichage (pur) ----------
   L'espace encadrant montre les erreurs GROUPÉES PAR LEÇON, la leçon la plus
   récemment ratée en tête (décision designer #391 : c'est la question du parent,
   « sur quoi l'aider ? »). À l'intérieur d'une leçon, on DÉDOUBLONNE la même
   erreur (même question + même réponse donnée) répétée : une seule ligne « vu N
   fois » plutôt que N lignes identiques (les banques QCM se répètent). */
export interface ErreurAffichee {
	question: string;
	donnee: string;
	attendue: string;
	mode: string;
	ts: number; // horodatage de l'occurrence la plus récente
	occurrences: number; // nombre de fois cette même erreur (≥ 1)
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
			const cle = JSON.stringify([e.question, e.donnee]); // clé sans risque de collision de séparateur
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
	return groupes.sort((a, b) => b.derniereFois - a.derniereFois);
}
