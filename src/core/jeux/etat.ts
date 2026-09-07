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
/* Les paliers DÉJÀ présentés automatiquement (#661, arbitrage du 2026-09-07).
   Sans cette clé, « ne plus reproposer » ne se distingue pas de « pas encore
   proposé » — et c'est justement cette distinction qui permet à un palier fermé
   de rester disponible sans revenir de lui-même. */
export const CLE_PALIERS_PROPOSES = 'ludaskia_jeux_paliers_proposes';

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

/** Y a-t-il quelque chose dans l'étagère : un jeu possédé, ou un choix dû ?

    SOURCE UNIQUE, et c'est tout l'intérêt. Cette condition était écrite deux
    fois — dans l'entrée de l'accueil et dans l'invitation de fin de séance — et
    les deux copies avaient déjà divergé une fois : l'invitation se taisait pour
    un enfant qui venait de refermer son premier écran de choix, alors que
    l'entrée s'affichait. La divergence est corrigée ; c'est la POSSIBILITÉ de
    divergence que cette fonction supprime, avant que le troisième consommateur
    ne l'écrive à son tour. Relevé par `auteur-tests-logique` le 2026-09-07. */
export function etagereNonVide(): boolean {
	return jeuxPossedes().length > 0 || paliersEnAttente().length > 0;
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

/* L'invariant tenu ICI, à la lecture : « déjà proposé » ⊆ « en attente ». Un
   rang proposé mais plus en attente est du bruit, et du bruit DÉFINITIF s'il
   subsiste — le palier re-franchi plus tard serait sauté par
   `prochainPalierAProposer` et ne s'ouvrirait plus jamais tout seul, sans
   qu'aucun chemin ne remette la clé d'aplomb.

   Le chemin normal ne produit pas cet état ; un import de sauvegarde bricolé,
   si. Même convention que `getRevisionPlafond` : on borne à la LECTURE, pas à
   l'écriture, ce qui reste robuste aux données qui reviennent de l'extérieur.
   Relevé par `auteur-tests-logique` le 2026-09-07. */
function rangsProposesBruts(): number[] {
	const brut = lsGet(CLE_PALIERS_PROPOSES, []) as unknown;
	if (!Array.isArray(brut)) return [];
	return brut.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
}

function rangsProposes(): number[] {
	const attente = new Set(rangsEnAttente());
	return rangsProposesBruts().filter((r) => attente.has(r));
}

/** Le prochain palier à PRÉSENTER automatiquement, ou `undefined`.

    C'est le premier palier en attente qui n'a pas déjà été présenté. Un palier
    que l'enfant a fermé sans choisir reste donc en attente — atteignable depuis
    sa liste de jeux — mais ne s'ouvre plus tout seul : on ne relance pas
    indéfiniment (arbitrage du 2026-09-07).

    UN par appel, jamais la pile entière : deux écrans de choix simultanés sont
    le cas d'échec du critère 7. */
export function prochainPalierAProposer(): number | undefined {
	const proposes = new Set(rangsProposes());
	return rangsEnAttente().find((r) => !proposes.has(r));
}

/** Note qu'un palier vient d'être présenté. À appeler à l'OUVERTURE de l'écran,
    pas à la fermeture : si l'enfant quitte l'app en cours de route, la modale ne
    doit pas le rattraper au démarrage suivant. */
export function marquerPalierPropose(rang: number): void {
	/* Lecture BRUTE, pas filtrée, et c'est délibéré : `rangsProposes()` ne garde
	   que les rangs encore en attente, donc marquer un palier avant de l'avoir
	   empilé aurait écrit une valeur que la lecture suivante aurait jetée. Le
	   marquage se serait évaporé en silence, et l'écran de choix se serait rouvert
	   tout seul — ce que l'arbitrage du 2026-09-07 interdit. Aucun chemin ne fait
	   ça aujourd'hui, mais rien ne l'empêchait. Relevé par
	   `auteur-tests-logique` le 2026-09-07. */
	const actuels = rangsProposesBruts();
	if (actuels.includes(rang)) return;
	lsSet(CLE_PALIERS_PROPOSES, [...actuels, rang]);
}

/** Consomme un palier précis : son choix vient d'être fait.

    Prend le rang en paramètre et non plus la tête de pile, parce que le choix
    peut désormais se faire depuis la liste de jeux, dans l'ordre que l'enfant
    veut. Rend `true` si le palier était bien en attente. */
export function consommerPalier(rang: number): boolean {
	const actuels = rangsEnAttente();
	if (!actuels.includes(rang)) return false;
	/* Lecture BRUTE ici aussi : le nettoyage doit voir le rang qu'on s'apprête à
	   retirer de l'attente. Avec la lecture filtrée, la condition ci-dessous
	   n'aurait jamais été vraie une fois l'attente mise à jour, et la clé stockée
	   aurait grossi indéfiniment. Défaut introduit puis rattrapé le 2026-09-07,
	   attrapé par un test qui lit le stockage sans passer par l'API. */
	const proposes = rangsProposesBruts();
	lsSet(
		CLE_PALIERS_ATTENTE,
		actuels.filter((r) => r !== rang),
	);
	if (proposes.includes(rang)) {
		lsSet(
			CLE_PALIERS_PROPOSES,
			proposes.filter((r) => r !== rang),
		);
	}
	return true;
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
