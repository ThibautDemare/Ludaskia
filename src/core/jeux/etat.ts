/* ============================================================
   Étagère de jeux (#661) — l'ÉTAT PERSISTÉ (critères 7, 17, 20, 23).

   Quatre clés, toutes préfixées `ludaskia_` : c'est ce que filtre `appKeys()`,
   donc ce qui fait entrer la donnée dans l'export de sauvegarde du parent ET la
   fait disparaître avec le profil supprimé. Une clé hors convention
   fonctionnerait quand même — et c'est bien le piège : elle survivrait au
   profil et manquerait à la sauvegarde, sans que rien ne le signale.

   Le préfixe de profil, lui, est posé par `lsGet`/`lsSet` : rien à faire ici,
   l'isolation entre frères et sœurs est acquise.

   Ce module ne touche NI l'XP, NI les étoiles, NI un trophée (critère 23). Un
   jeu ne rapporte rien à l'économie : c'est ce qui l'empêche de redevenir un
   exercice.
   ============================================================ */
import { lsGet, lsSet } from '../storage';
import { consommer, jourLocal, restantSecondes, type EtatPlafond } from './plafond';

export const CLE_POSSEDES = 'ludaskia_jeux_possedes';
export const CLE_PALIERS_ATTENTE = 'ludaskia_jeux_paliers_attente';
export const CLE_PLAFOND = 'ludaskia_jeux_plafond';
export const CLE_SCORES = 'ludaskia_jeux_scores';

/* Les lectures nettoient au lieu de faire confiance : ces clés passent par
   l'export/import de sauvegarde, donc une donnée bricolée à la main peut
   revenir. Le bornage à la LECTURE (et pas à l'écriture) est la convention du
   dépôt — cf. `getRevisionPlafond`.

   Ces helpers prennent la VALEUR LUE, jamais le nom de la clé : `lsGet` doit
   toujours voir une constante `CLE_*`, sinon `tests/cles-stockage-gate.test.ts`
   ne peut pas prouver le préfixe et exige une exception documentée. Une
   indirection ici ne gagnerait rien et coûterait une dérogation. */
function nettoyerIds(brut: unknown): string[] {
	if (!Array.isArray(brut)) return [];
	return brut.filter((x): x is string => typeof x === 'string' && x !== '');
}

/* ---------- Les jeux possédés ---------- */

/** Les jeux de l'étagère du profil actif, dans l'ordre où ils ont été choisis. */
export function jeuxPossedes(): string[] {
	return nettoyerIds(lsGet(CLE_POSSEDES, []));
}

/** Ajoute un jeu à l'étagère. Sans effet s'il y est déjà : l'étagère est UNE
    liste (critère 3), un doublon s'y verrait. */
export function ajouterJeu(id: string): void {
	const actuels = jeuxPossedes();
	if (actuels.includes(id)) return;
	lsSet(CLE_POSSEDES, [...actuels, id]);
}

/* ---------- Les paliers en attente de choix ---------- */

function rangsEnAttente(): number[] {
	const brut = lsGet(CLE_PALIERS_ATTENTE, []) as unknown;
	if (!Array.isArray(brut)) return [];
	return brut.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
}

/** Les rangs de palier franchis dont l'enfant n'a pas encore fait le choix. */
export function paliersEnAttente(): number[] {
	return rangsEnAttente();
}

/** Empile des paliers franchis, sans jamais écraser ce qui attendait déjà.

    Dédoublonne : deux franchissements du même rang (rechargement, donnée
    importée) n'ouvrent pas deux écrans de choix. C'est le corollaire du
    critère 7 côté état. */
export function empilerPaliers(rangs: number[]): void {
	if (!rangs.length) return;
	const actuels = rangsEnAttente();
	const ajouts = rangs.filter((r) => !actuels.includes(r));
	if (!ajouts.length) return;
	lsSet(CLE_PALIERS_ATTENTE, [...actuels, ...ajouts]);
}

/** Sort le prochain palier à traiter, dans l'ordre de franchissement.

    UN par appel, jamais la pile entière : deux écrans de choix simultanés sont
    le cas d'échec du critère 7. */
export function consommerPalier(): number | undefined {
	const actuels = rangsEnAttente();
	if (!actuels.length) return undefined;
	const [premier, ...reste] = actuels;
	lsSet(CLE_PALIERS_ATTENTE, reste);
	return premier;
}

/* ---------- Le meilleur score, LOCAL au jeu ---------- */

function tableScores(): Record<string, number> {
	const brut = lsGet(CLE_SCORES, {}) as unknown;
	if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return {};
	const table: Record<string, number> = {};
	for (const [id, v] of Object.entries(brut as Record<string, unknown>)) {
		if (typeof v === 'number' && Number.isFinite(v) && v > 0) table[id] = v;
	}
	return table;
}

/** Le record du profil à ce jeu. 0 avant la première partie.

    Volontairement PAS `recordRun`/`loadRuns` de `core/progress` : leur clé est
    namespacée par niveau scolaire, ce qui attacherait le score d'un jeu hors
    catalogue à la classe de l'enfant. Et ce score ne sort pas du jeu (critère
    17) : ni profil, ni espace encadrant, ni trophée, ni classement. */
export function meilleurScore(idJeu: string): number {
	return tableScores()[idJeu] ?? 0;
}

/** Retient le score s'il bat le record. Une partie ratée ne l'efface pas. */
export function enregistrerScore(idJeu: string, score: number): void {
	if (!Number.isFinite(score) || score <= 0) return;
	const table = tableScores();
	if (score <= (table[idJeu] ?? 0)) return;
	lsSet(CLE_SCORES, { ...table, [idJeu]: score });
}

/* ---------- Le temps de jeu du jour ---------- */

/* Ces trois fonctions sont la SEULE couche qui lise l'horloge et le stockage
   pour le plafond ; l'arithmétique, elle, est pure dans `./plafond` et testée
   là-bas. Séparation volontaire : sans elle, les bugs de bord de journée ne se
   voient qu'à minuit passé, chez l'enfant. */

function plafondEtat(): EtatPlafond | null {
	const brut = lsGet(CLE_PLAFOND, null) as unknown;
	if (!brut || typeof brut !== 'object') return null;
	const { jour, secondes } = brut as Partial<EtatPlafond>;
	if (typeof jour !== 'string' || typeof secondes !== 'number' || !Number.isFinite(secondes)) {
		return null;
	}
	return { jour, secondes };
}

/** Secondes encore jouables aujourd'hui, pour ce plafond réglé par l'encadrant. */
export function secondesRestantes(plafondMinutes: number): number {
	return restantSecondes(plafondEtat(), plafondMinutes, jourLocal());
}

/** Décompte du temps joué. Appelé à la SORTIE d'une partie, pas pendant : rien
    ne doit ressembler à un compte à rebours (critère 12). */
export function ajouterTempsJoue(secondes: number): void {
	if (!Number.isFinite(secondes) || secondes <= 0) return;
	lsSet(CLE_PLAFOND, consommer(plafondEtat(), Math.round(secondes), jourLocal()));
}
