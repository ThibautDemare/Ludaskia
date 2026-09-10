/* ============================================================
   Journal du retard au moment de la correction (#691) — logique pure + persistance.
   ------------------------------------------------------------
   Ces tests sont écrits AVANT l'implémentation, depuis les critères de l'issue
   (le module `src/core/retard-journal.ts` n'existe pas encore : ils sont rouges,
   c'est attendu). Les attendus sont recalculés à la main depuis la sémantique de
   la révision espacée (#45) — REVISION_INTERVALLES = [1, 3, 7, 16, 35, 75] jours,
   `prochaineRevision = dernierTest + intervalle(palier)` — jamais recopiés d'une
   implémentation.

   Ce que couvre CE fichier : critères 1 (contenu d'une entrée), 2 (clé exportée /
   supprimée avec le profil), 3 (borne + éviction), 4 (tranches de retard relatif),
   5 (pureté du calcul des taux), 8 (rien de textuel), et la moitié BEHAVIOURALE du
   critère 7 (le moteur rend le même résultat, journal vide ou saturé).
   Les critères 6 et 9, et la moitié statique du 7, sont des propriétés de CÂBLAGE
   (qui écrit, qui lit, par quel chemin) : elles vivent dans
   `tests/retard-journal-gate.test.ts`.

   ── Bornes des tranches : d'où elles sortent (critère 4) ─────────────────────
   L'issue donne un exemple (« servi à l'heure, jusqu'à 2 fois l'intervalle,
   au-delà ») et laisse les bornes ouvertes. Retenu ici : trois tranches
   half-open sur le retard RELATIF r = retard / intervalle du palier —
   [0, 1[, [1, 2[, [2, +∞[.

   Pourquoi 1 comme première borne, et pas « r ≈ 0 » :
   l'échéance est horodatée à la MINUTE (`prochaineRevision = now + intervalle`),
   alors qu'un enfant révise une fois par jour, à une heure variable. Un enfant
   parfaitement régulier qui joue à 9 h après une séance de la veille à 18 h ne
   voit pas son élément « dû » (il ne l'est qu'à 18 h), et le retrouve le
   surlendemain matin : retard = 15 h sur un palier J+1, soit r ≈ 0,6. Une tranche
   « à l'heure » définie à r < 0,25 serait donc quasi vide sur les deux premiers
   paliers et ne mesurerait que l'heure de la séance, pas la planification. Sous
   r = 1, le délai réellement écoulé (intervalle + retard) reste inférieur au
   DOUBLE du délai prévu : c'est le bruit d'un rythme quotidien, pas un retard.
   Les trois tranches se lisent alors comme un doublement du délai réel : jusqu'à
   ×2 du prévu, de ×2 à ×3, au-delà de ×3.

   Convention half-open [min, max[ partout, y compris à 2 : chaque valeur tombe
   dans exactement une tranche, sans cas particulier de borne. r = 1 pile est donc
   « en retard » (un intervalle entier de retard n'est pas « à l'heure ») et r = 2
   pile bascule dans la dernière. NB pour l'implémentation : le libellé de la
   tranche du milieu doit dire « moins de 2 intervalles » et non « jusqu'à 2 fois
   l'intervalle » inclus, sans quoi il contredirait la borne.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	RETARD_KEY,
	MAX_RETARDS,
	TRANCHES_RETARD,
	retardRelatif,
	entreeRetard,
	ajouterRetard,
	journaliserRetard,
	chargerRetardsFor,
	trancheRetard,
	tauxParTranche,
	type RetardEntry,
	type TrancheRetard,
} from '../src/core/retard-journal';
import {
	initProfiles,
	activeProfile,
	addProfile,
	setActiveProfile,
	deleteProfile,
	exportProfiles,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { addXP, getXP } from '../src/core/progress';
import { selectDueGroups } from '../src/core/revision-select';
import { JOUR, PALIER_ACQUIS } from '../src/core/revision';
import type { EtatRevision } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Escalier RECALCULÉ à la main depuis #45 (1, 3, 7, 16, 35, 75 jours), pour ne pas
   dériver l'attendu de REVISION_INTERVALLES. Les tests croisent les deux plus bas. */
const MARCHES_MS = [1 * JOUR, 3 * JOUR, 7 * JOUR, 16 * JOUR, 35 * JOUR, 75 * JOUR];

const T0 = Date.UTC(2026, 8, 10, 9, 0, 0); // instant de référence des scénarios

/* État d'un élément au palier `palier`, dû à `echeance`. */
function etat(palier: number, echeance: number | null): EtatRevision {
	return {
		palier,
		prochaineRevision: echeance,
		reussites: palier,
		dernierTest: echeance == null ? null : echeance - (MARCHES_MS[palier] ?? 0),
	};
}

/* ---------- Critère 1 : le retard RELATIF, rapporté à l'intervalle du palier ---------- */
describe('retardRelatif — critère 1 : retard divisé par l’intervalle du palier', () => {
	it('vaut 0 pour un élément servi PILE à l’heure', () => {
		expect(retardRelatif(etat(0, T0), T0)).toBe(0);
	});

	it('vaut 1 pour un retard d’un intervalle entier au palier 0 (J+1 servi J+2)', () => {
		expect(retardRelatif(etat(0, T0), T0 + 1 * JOUR)).toBe(1);
	});

	it('divise par l’intervalle DU PALIER DE DÉPART, pas par le premier de l’escalier', () => {
		// Palier 2 → intervalle 7 jours (recalculé à la main). 14 jours de retard = 2 intervalles.
		expect(retardRelatif(etat(2, T0), T0 + 14 * JOUR)).toBe(2);
		// Le même retard absolu au palier 0 vaut 14 intervalles : c'est bien le palier qui pilote.
		expect(retardRelatif(etat(0, T0), T0 + 14 * JOUR)).toBe(14);
	});

	it('garde la fraction (12 h de retard sur J+1 = 0,5), sans arrondir au jour', () => {
		expect(retardRelatif(etat(0, T0), T0 + JOUR / 2)).toBeCloseTo(0.5, 10);
	});

	it('reproduit l’escalier complet : un retard d’un intervalle vaut 1 à chaque palier', () => {
		for (let p = 0; p < MARCHES_MS.length; p++) {
			expect(retardRelatif(etat(p, T0), T0 + MARCHES_MS[p])).toBe(1);
		}
	});

	it('ne renvoie JAMAIS de retard négatif : un élément servi en avance vaut 0', () => {
		// Le mode Révision ne sert que des éléments dus (`estDu`), mais un état importé
		// ou corrompu peut porter une échéance future. « Servi en avance » n'est pas un
		// retard : on plafonne à 0 plutôt que de stocker un nombre négatif qui polluerait
		// les taux et s'afficherait tel quel côté encadrant.
		expect(retardRelatif(etat(1, T0 + 5 * JOUR), T0)).toBe(0);
	});

	it('renvoie null quand le retard n’est pas calculable (pas d’échéance)', () => {
		expect(retardRelatif(etat(0, null), T0)).toBeNull(); // hors rotation (#641)
		expect(retardRelatif(null, T0)).toBeNull();
		expect(retardRelatif(undefined, T0)).toBeNull();
	});

	it('renvoie null pour un palier hors escalier (acquis, négatif, non entier)', () => {
		// Au palier ACQUIS l'élément est sorti de la rotation : aucun intervalle ne lui
		// est associé, donc aucun retard relatif n'a de sens. Idem pour un palier absurde
		// venu d'un import.
		expect(retardRelatif(etat(PALIER_ACQUIS, T0), T0 + JOUR)).toBeNull();
		expect(retardRelatif({ ...etat(0, T0), palier: -1 }, T0 + JOUR)).toBeNull();
		expect(retardRelatif({ ...etat(0, T0), palier: 1.5 }, T0 + JOUR)).toBeNull();
	});
});

/* ---------- Critère 4 : les tranches de retard relatif ---------- */
describe('trancheRetard — critère 4 : bornes des tranches', () => {
	/* Les trois identifiants attendus, dans l'ordre de lecture (du moins retardé au
	   plus retardé) : c'est ce gradient qui rend la question « le retard fait-il
	   échouer ? » lisible d'un coup d'œil. */
	const ORDRE: TrancheRetard[] = ['aHeure', 'retardModere', 'retardFort'];

	it('expose exactement trois tranches, ordonnées du moins retardé au plus retardé', () => {
		expect(TRANCHES_RETARD.map((t) => t.id)).toEqual(ORDRE);
	});

	it('classe « à l’heure » tout retard STRICTEMENT inférieur à un intervalle', () => {
		expect(trancheRetard(0)).toBe('aHeure');
		expect(trancheRetard(0.5)).toBe('aHeure');
		expect(trancheRetard(0.999)).toBe('aHeure');
	});

	it('bascule à 1 pile : un intervalle entier de retard n’est PAS « à l’heure »', () => {
		expect(trancheRetard(1)).toBe('retardModere');
	});

	it('bascule à 2 pile dans la dernière tranche (bornes half-open partout)', () => {
		expect(trancheRetard(1.999)).toBe('retardModere');
		expect(trancheRetard(2)).toBe('retardFort');
		expect(trancheRetard(9)).toBe('retardFort');
	});

	it('range un retard négatif (état importé incohérent) avec les « à l’heure »', () => {
		// Un élément servi en avance n'est pas en retard. `retardRelatif` plafonne déjà
		// à 0, mais la fonction de classement doit rester totale : une entrée négative
		// venue d'un stockage plus ancien ne doit pas tomber hors des tranches.
		expect(trancheRetard(-3)).toBe('aHeure');
	});

	it('couvre [0, +∞[ sans trou ni recouvrement (échantillonnage dense)', () => {
		for (let i = 0; i <= 600; i++) {
			const r = i / 100; // 0 → 6 par pas de 0,01
			const t = trancheRetard(r);
			expect(ORDRE).toContain(t);
			// Recalcul indépendant de la règle énoncée en tête de fichier.
			const attendu: TrancheRetard = r < 1 ? 'aHeure' : r < 2 ? 'retardModere' : 'retardFort';
			expect(t).toBe(attendu);
		}
	});

	it('les bornes déclarées collent au classement (pas de table décorative)', () => {
		// TRANCHES_RETARD sert à l'affichage encadrant : si ses bornes divergeaient de
		// `trancheRetard`, le parent lirait un libellé qui ne décrit pas ce qu'il compte.
		for (const t of TRANCHES_RETARD) {
			expect(trancheRetard(t.min)).toBe(t.id);
			const justeAvantMax = t.max === Infinity ? t.min + 1000 : t.max - 0.0001;
			expect(trancheRetard(justeAvantMax)).toBe(t.id);
			expect(t.label.trim().length).toBeGreaterThan(0);
		}
		expect(TRANCHES_RETARD[0].min).toBe(0);
		expect(TRANCHES_RETARD[TRANCHES_RETARD.length - 1].max).toBe(Infinity);
	});
});

/* ---------- Critères 1 et 8 : la forme d'une entrée ---------- */
describe('entreeRetard — critères 1 et 8 : ce qu’une entrée porte, et rien de plus', () => {
	/* Les SEULS champs autorisés. Critère 8 : « le journal porte des nombres et un
	   identifiant d'élément, il ne duplique pas les énoncés » — le journal d'erreurs
	   (#391) porte déjà la question, la réponse donnée et la réponse attendue. Une
	   entrée qui se remettrait à transporter du texte d'exercice ferait de ce journal
	   un second journal d'erreurs, avec les données nominatives que cela suppose. */
	const CHAMPS = ['ts', 'kind', 'id', 'palier', 'retardRelatif', 'reussi'];

	it('porte le palier de DÉPART, le retard relatif et le résultat (critère 1)', () => {
		// Palier 1 → intervalle 3 jours ; servi 6 jours après l'échéance → r = 2.
		const e = entreeRetard(
			{ kind: 'lecon', id: 'math-complements@ce2' },
			etat(1, T0),
			false,
			T0 + 6 * JOUR,
		);
		expect(e).not.toBeNull();
		expect(e?.palier).toBe(1);
		expect(e?.retardRelatif).toBe(2);
		expect(e?.reussi).toBe(false);
		expect(e?.kind).toBe('lecon');
		expect(e?.id).toBe('math-complements@ce2');
		expect(e?.ts).toBe(T0 + 6 * JOUR); // horodatée à l'instant de la CORRECTION
	});

	it('porte les champs exigés, et aucune valeur TEXTUELLE en plus (critère 8)', () => {
		// On ne fige pas la liste des champs (un futur drapeau booléen resterait
		// légitime) : on interdit le texte. Seuls les deux identifiants sont des chaînes.
		const e = entreeRetard({ kind: 'mot', id: 'w-42' }, etat(0, T0), true, T0 + JOUR);
		expect(e).not.toBeNull();
		const entrees = Object.entries(e as RetardEntry);
		for (const requis of CHAMPS) expect(entrees.map(([k]) => k)).toContain(requis);
		const textuels = entrees.filter(([, v]) => typeof v === 'string').map(([k]) => k);
		expect(textuels.sort()).toEqual(['id', 'kind']);
	});

	it('ne stocke que des nombres, un booléen et deux identifiants courts (critère 8)', () => {
		const e = entreeRetard(
			{ kind: 'mot', id: 'w-42' },
			etat(0, T0),
			true,
			T0 + JOUR,
		) as RetardEntry;
		expect(typeof e.ts).toBe('number');
		expect(typeof e.palier).toBe('number');
		expect(typeof e.retardRelatif).toBe('number');
		expect(typeof e.reussi).toBe('boolean');
		// `id` est un identifiant d'élément (id de mot en banque, id de leçon), jamais le
		// mot lui-même ni un énoncé : rien de ce que l'enfant a lu ou écrit.
		expect(typeof e.id).toBe('string');
		expect(['mot', 'lecon']).toContain(e.kind);
	});

	it('renvoie null quand le retard n’est pas calculable, plutôt qu’une entrée sans retard', () => {
		// Violation annoncée du critère 1 : « une entrée sans retard ». Mieux vaut pas
		// d'entrée qu'une entrée qui compterait dans les taux sans rien mesurer.
		expect(entreeRetard({ kind: 'mot', id: 'w-1' }, etat(0, null), true, T0)).toBeNull();
		expect(entreeRetard({ kind: 'mot', id: 'w-1' }, null, true, T0)).toBeNull();
		expect(entreeRetard({ kind: 'lecon', id: 'x' }, etat(PALIER_ACQUIS, T0), true, T0)).toBeNull();
	});

	it('renvoie null pour un élément sans identifiant (rien à regrouper)', () => {
		expect(entreeRetard({ kind: 'mot', id: '' }, etat(0, T0), true, T0)).toBeNull();
	});
});

/* ---------- Critère 3 : journal borné, éviction des plus anciennes ---------- */
describe('ajouterRetard — critère 3 : borne et éviction', () => {
	const ent = (ts: number): RetardEntry => ({
		ts,
		kind: 'lecon',
		id: 'l' + ts,
		palier: 0,
		retardRelatif: 0,
		reussi: true,
	});

	it('ajoute la nouvelle entrée EN TÊTE (plus récente d’abord)', () => {
		const liste = ajouterRetard(ajouterRetard([], ent(1)), ent(2));
		expect(liste.map((e) => e.ts)).toEqual([2, 1]);
	});

	it('ne mute pas la liste d’origine', () => {
		const base = [ent(1)];
		const copie = [...base];
		ajouterRetard(base, ent(2));
		expect(base).toEqual(copie);
	});

	it('évince les PLUS ANCIENNES au-delà de la borne', () => {
		let liste: RetardEntry[] = [];
		for (let i = 1; i <= 5; i++) liste = ajouterRetard(liste, ent(i), 3);
		expect(liste.map((e) => e.ts)).toEqual([5, 4, 3]);
	});

	it('la borne par défaut reste raisonnable pour du localStorage et pour la mesure', () => {
		// Dérivé de l'usage, pas de l'implémentation : une séance sert jusqu'à 24 éléments
		// (REVISION_PLAFOND_MAX), donc sous ~100 entrées le journal ne couvrirait que
		// quelques jours — trop peu pour comparer trois tranches. Au-delà de quelques
		// milliers, la charge entre dans l'export de sauvegarde du parent pour rien.
		expect(Number.isInteger(MAX_RETARDS)).toBe(true);
		expect(MAX_RETARDS).toBeGreaterThanOrEqual(100);
		expect(MAX_RETARDS).toBeLessThanOrEqual(2000);
	});
});

/* ---------- Critères 2 et 3 : persistance par profil ---------- */
describe('journaliserRetard / chargerRetardsFor — critères 2 et 3 : persistance', () => {
	it('écrit sur le profil ACTIF et se relit par UUID', () => {
		const uuid = activeProfile().uuid;
		journaliserRetard({ kind: 'lecon', id: 'math-complements' }, etat(1, T0), false, T0 + 3 * JOUR);
		const j = chargerRetardsFor(uuid);
		expect(j).toHaveLength(1);
		expect(j[0].palier).toBe(1);
		expect(j[0].retardRelatif).toBe(1); // 3 jours de retard sur un intervalle de 3 jours
		expect(j[0].reussi).toBe(false);
	});

	it('journalise aussi les RÉUSSITES : sans elles, aucun taux n’est calculable', () => {
		// Piège classique du journal d'erreurs (#391), qui ne garde que les échecs :
		// ici la mesure est un TAUX, donc le dénominateur doit exister.
		const uuid = activeProfile().uuid;
		journaliserRetard({ kind: 'mot', id: 'w-1' }, etat(0, T0), true, T0 + JOUR);
		expect(chargerRetardsFor(uuid).map((e) => e.reussi)).toEqual([true]);
	});

	it('n’écrit rien quand le retard n’est pas calculable', () => {
		const uuid = activeProfile().uuid;
		journaliserRetard({ kind: 'mot', id: 'w-1' }, etat(0, null), true, T0);
		expect(chargerRetardsFor(uuid)).toEqual([]);
	});

	it('garde les plus RÉCENTES et purge au-delà de la borne (critère 3)', () => {
		const uuid = activeProfile().uuid;
		for (let i = 0; i < MAX_RETARDS + 5; i++) {
			journaliserRetard({ kind: 'lecon', id: 'l' + i }, etat(0, T0), true, T0 + i);
		}
		const j = chargerRetardsFor(uuid);
		expect(j).toHaveLength(MAX_RETARDS);
		expect(j[0].id).toBe('l' + (MAX_RETARDS + 4)); // la dernière écrite est en tête
		expect(j.some((e) => e.id === 'l0')).toBe(false); // la première a bien été évincée
	});

	it('n’écrit pas dans le journal d’un autre profil', () => {
		const p1 = activeProfile().uuid;
		const p2 = addProfile('Deux'); // bascule le profil actif
		journaliserRetard({ kind: 'mot', id: 'w-1' }, etat(0, T0), true, T0 + JOUR);
		expect(chargerRetardsFor(p2.uuid)).toHaveLength(1);
		expect(chargerRetardsFor(p1)).toEqual([]);
		setActiveProfile(p1);
		journaliserRetard({ kind: 'mot', id: 'w-2' }, etat(0, T0), false, T0 + JOUR);
		expect(chargerRetardsFor(p1)).toHaveLength(1);
		expect(chargerRetardsFor(p2.uuid)).toHaveLength(1);
	});

	it('tolère un stockage corrompu sans faire tomber la lecture', () => {
		const uuid = activeProfile().uuid;
		localStorage.setItem(uuid + '/' + RETARD_KEY, '{"pas":"un tableau"}');
		expect(chargerRetardsFor(uuid)).toEqual([]);
		localStorage.setItem(uuid + '/' + RETARD_KEY, '[{"ts":1},{"n’importe":"quoi"}]');
		expect(chargerRetardsFor(uuid)).toEqual([]); // entrées incomplètes filtrées
	});

	it('la clé entre dans l’export de sauvegarde du parent (critère 2)', () => {
		const uuid = activeProfile().uuid;
		journaliserRetard({ kind: 'lecon', id: 'math-complements' }, etat(0, T0), true, T0 + JOUR);
		expect(RETARD_KEY.startsWith('ludaskia_')).toBe(true);
		const dump = exportProfiles([uuid]);
		expect(dump?.profiles[0].data[RETARD_KEY]).toBeTruthy();
	});

	it('disparaît avec le profil supprimé (critère 2)', () => {
		const p2 = addProfile('Deux');
		journaliserRetard({ kind: 'lecon', id: 'math-complements' }, etat(0, T0), true, T0 + JOUR);
		expect(chargerRetardsFor(p2.uuid)).toHaveLength(1);
		deleteProfile(p2.uuid);
		expect(chargerRetardsFor(p2.uuid)).toEqual([]);
		const restes = Array.from({ length: localStorage.length }, (_, i) =>
			localStorage.key(i)!,
		).filter((k) => k.startsWith(p2.uuid + '/'));
		expect(restes).toEqual([]);
	});
});

/* ---------- Critères 4 et 5 : le taux de réussite par tranche ---------- */
describe('tauxParTranche — critères 4 et 5 : calcul pur, par tranche', () => {
	/* Entrée minimale, paramétrée par le retard relatif et le résultat : c'est tout
	   ce dont le calcul a besoin. */
	const e = (rel: number, reussi: boolean, ts = 1): RetardEntry => ({
		ts,
		kind: 'lecon',
		id: 'l',
		palier: 0,
		retardRelatif: rel,
		reussi,
	});

	it('renvoie TOUJOURS les trois tranches, dans l’ordre, même sans aucune entrée', () => {
		// Cas dégénéré : un journal vide doit produire trois lignes « pas de données »,
		// pas un tableau vide que la vue encadrante rendrait en page blanche.
		const t = tauxParTranche([]);
		expect(t.map((x) => x.tranche)).toEqual(TRANCHES_RETARD.map((x) => x.id));
		expect(t.every((x) => x.total === 0 && x.reussites === 0)).toBe(true);
	});

	it('distingue « aucune donnée » de « 0 % de réussite » (taux null si total = 0)', () => {
		// La confusion serait grave à la lecture : un parent verrait « 0 % » sur une
		// tranche jamais rencontrée et conclurait à un échec total.
		expect(tauxParTranche([]).every((x) => x.taux === null)).toBe(true);
		const zeroPourCent = tauxParTranche([e(0, false)])[0];
		expect(zeroPourCent.total).toBe(1);
		expect(zeroPourCent.taux).toBe(0);
	});

	it('calcule le taux tranche par tranche (recalculé à la main)', () => {
		const t = tauxParTranche([
			e(0, true),
			e(0.5, true),
			e(0.9, false), // à l'heure : 2 réussites sur 3 → 2/3
			e(1, false),
			e(1.5, false), // retard modéré : 0 sur 2 → 0
			e(2, true),
			e(7, false),
			e(3, true), // retard fort : 2 sur 3 → 2/3
		]);
		expect(t.map((x) => [x.total, x.reussites])).toEqual([
			[3, 2],
			[2, 0],
			[3, 2],
		]);
		expect(t[0].taux).toBeCloseTo(2 / 3, 10);
		expect(t[1].taux).toBe(0);
		expect(t[2].taux).toBeCloseTo(2 / 3, 10);
	});

	it('laisse une tranche VIDE au milieu, sans la décaler ni la faire disparaître', () => {
		const t = tauxParTranche([e(0, true), e(5, false)]);
		expect(t.map((x) => x.total)).toEqual([1, 0, 1]);
		expect(t[1].taux).toBeNull();
		expect(t[1].tranche).toBe('retardModere');
	});

	it('ne fond PAS les tranches en un taux global (critère 4)', () => {
		// Deux corrections identiques en résultat mais servies très différemment : elles
		// ne doivent pas se retrouver dans le même seau. C'est précisément l'information
		// que le journal existe pour produire.
		const t = tauxParTranche([e(0, true), e(6, true)]);
		expect(t[0].total).toBe(1);
		expect(t[2].total).toBe(1);
		expect(t[1].total).toBe(0);
	});

	it('porte un libellé lisible par tranche, aligné sur TRANCHES_RETARD', () => {
		const t = tauxParTranche([]);
		expect(t.map((x) => x.label)).toEqual(TRANCHES_RETARD.map((x) => x.label));
	});

	it('est PUR : ne lit pas le stockage et ne mute pas son argument (critère 5)', () => {
		// Un journal bien rempli est posé côté profil actif : si le calcul allait le
		// chercher, le résultat cesserait de dépendre du seul argument — et l'espace
		// encadrant, qui lit un AUTRE profil par UUID, afficherait les chiffres du profil
		// actif.
		for (let i = 0; i < 5; i++) {
			journaliserRetard({ kind: 'lecon', id: 'l' + i }, etat(0, T0), false, T0 + 9 * JOUR);
		}
		expect(tauxParTranche([]).every((x) => x.total === 0)).toBe(true);

		const liste = [e(0, true), e(3, false)];
		const copie = JSON.parse(JSON.stringify(liste)) as RetardEntry[];
		const a = tauxParTranche(liste);
		const b = tauxParTranche(liste);
		expect(liste).toEqual(copie); // aucune mutation
		expect(b).toEqual(a); // déterministe
	});

	it('ignore une entrée dont le retard n’est pas un nombre exploitable', () => {
		// NaN passe le typage (`number`) mais n'appartient à aucune tranche : la compter
		// quelque part fausserait un taux, la compter partout le fausserait trois fois.
		const t = tauxParTranche([e(Number.NaN, false), e(0, true)]);
		expect(t.map((x) => x.total)).toEqual([1, 0, 0]);
		expect(t[0].taux).toBe(1);
	});

	it('range un retard négatif venu d’un état importé avec les « à l’heure »', () => {
		const t = tauxParTranche([e(-2, false)]);
		expect(t[0].total).toBe(1);
		expect(t.reduce((s, x) => s + x.total, 0)).toBe(1); // compté une seule fois
	});
});

/* ---------- Critère 7 : le journal ne nourrit AUCUN calcul ---------- */
describe('critère 7 — retirer le journal ne change ni le moteur ni une récompense', () => {
	/* Signal de violation annoncé par l'issue : « retirer le journal change le
	   comportement du moteur ou une récompense ». On mesure donc deux sorties du
	   moteur — la sélection des éléments dus et l'XP — d'abord journal VIDE, puis
	   journal SATURÉ d'échecs très en retard sur les leçons justement sélectionnées.
	   Le pendant statique (personne d'autre que l'espace encadrant ne LIT le journal)
	   est dans tests/retard-journal-gate.test.ts : les deux filets se rattrapent,
	   celui-ci couvrant le cas où l'écriture vit dans progress.ts (le module de l'XP),
	   que le filet statique ne peut alors plus interdire. */
	const ORTHO = { banque: {}, listes: [], motIdParForme: {} };
	const DUES: Record<string, EtatRevision> = {
		'math-doubles': etat(0, T0 - 30 * JOUR),
		'math-moities': etat(1, T0 - 30 * JOUR),
		'fr-conj-etre-present': etat(2, T0 - 30 * JOUR),
	};

	function mesuresMoteur() {
		addXP(3);
		return {
			xp: getXP(),
			selection: selectDueGroups(ORTHO, DUES, T0, 12)
				.map((g) => g.categoryId + ':' + g.items.length)
				.sort(),
		};
	}

	it('sélection des éléments dus et XP identiques, journal vide ou saturé', () => {
		const journalVide = mesuresMoteur();

		localStorage.clear();
		setOnDataWrite(touchActiveProfile);
		initProfiles();
		for (const id of Object.keys(DUES)) {
			for (let i = 0; i < 20; i++) {
				journaliserRetard({ kind: 'lecon', id }, DUES[id], false, T0 - i * 1000);
			}
		}
		expect(chargerRetardsFor(activeProfile().uuid).length).toBeGreaterThan(0);

		expect(mesuresMoteur()).toEqual(journalVide);
	});
});
