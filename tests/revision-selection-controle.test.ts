/* ============================================================
   #689 — LE CONTRÔLE DES ACQUIS EN SÉANCE : SÉLECTION ET COMPTES ANNONCÉS.

   Cette tranche complète `tests/revision-controle-acquis.test.ts` (état + escalier,
   déjà écrite, 21 tests rouges). Elle ne re-teste PAS `avancerEtat`, `echeanceControle`
   ni `estDuControle` isolément : ces trois-là sont éprouvés via leur EFFET sur
   `selectDueGroups` / `countDue` (revision-select.ts) et sur `revisionProfil`
   (encadrant-stats.ts), jamais appelés à part ici.

   TOUT ce fichier doit être ROUGE aujourd'hui : `selectDueGroups`/`countDue` ne
   connaissent pas encore le contrôle des acquis (un « acquis » reste hors rotation
   pour toujours dans le code actuel), et `RecapRevision` n'a pas encore de champ
   `enControle`.

   D'OÙ VIENNENT LES ATTENDUS — critères de l'issue #689, PAS l'implémentation :
     3. les acquis en contrôle sont servis EN DERNIER, seulement dans le reliquat de
        plafond non consommé par le niveau actif ET l'entretien du niveau inférieur
        (#232, qui garde la priorité — cf. `budgetEntretien`) ;
     4. à l'intérieur de ce reliquat, tri « le plus longtemps sans test réel
        d'abord », départage stable par id — LA MÊME clé que `collectBasNiveau` ;
     6. `countDue` compte le contrôle des acquis BORNÉ EXACTEMENT comme la sélection
        le bornera (invariant #478 « annoncé = proposé ») ; côté encadrant,
        `RecapRevision.enControle` distingue ce sous-compte sans casser la
        composition `total = enAttente + enRotation + acquises` ;
     9. (négatif) aucun acquis ne prend le slot d'un fragile ;
     10. (négatif) charge bornée et CALCULÉE : au stock maximal du contenu livré
        (466 mots + 264 paires leçon × niveau, cf. docs/architecture/gamification.md
        §Ancrage), un contrôle annuel coûte ~2 passages/jour, < 20 % d'une séance de 11 ;
     12. (négatif) le contrôle des acquis reste d'ampleur négligeable (peu d'XP en jeu),
        ce qui se déduit du 10 : peu d'éléments servis par séance.

   HYPOTHÈSE EXPLICITE, à confirmer côté implémentation (signalée dans le compte rendu) :
   pour que le stock max de 264 « paires leçon × niveau » soit un jour ATTEIGNABLE par
   `selectDueGroups` (qui ne voit, pour les leçons, que la vue niveau ACTIF via
   `lessonRevisions` — 183 leçons distinctes au plus — et le niveau INFÉRIEUR via `bas`),
   un acquis du niveau inférieur (`bas`) doit lui aussi pouvoir entrer en contrôle,
   symétriquement à l'entretien non-acquis (#232). Le test du critère 10 en dépend ; les
   autres tests de ce fichier n'utilisent que les mots et le niveau actif, sans cette
   hypothèse.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { JOUR, PALIER_ACQUIS, REVISION_PLAFOND_CHOIX, avancerEtat } from '../src/core/revision';
import {
	selectDueGroups,
	countDue,
	effortRevisionAffiche,
	type DueGroup,
	type DueItem,
	type LeconBasNiveau,
} from '../src/core/revision-select';
import { initProfiles, touchActiveProfile, activeProfile } from '../src/core/profiles';
import { setOnDataWrite, lsSetRaw } from '../src/core/storage';
import { getAllLessons, getLessonById } from '../src/core/catalog';
import { LESSON_REVISION_KEY } from '../src/core/progress';
import { ORTHO_KEY, emptyOrthoState } from '../src/core/orthographe/store';
import { revisionProfil, type RecapRevision } from '../src/core/encadrant-stats';
import type { EtatRevision, OrthoState, MotOrtho } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Instant de référence (ms), sur le modèle de `revision-bas-niveau.test.ts`. */
const T0 = 1_700_000_000_000;
/* « 365 jours », dérivé du critère 1 de l'issue — jamais de la constante du code
   (même parti pris que `revision-controle-acquis.test.ts`). */
const UN_AN = 365 * JOUR;

/* ---------- Fabriques d'états ---------- */
function etat(palier: number, prochaineRevision: number | null, dernierTest: number | null = null) {
	return { palier, prochaineRevision, reussites: palier, dernierTest } satisfies EtatRevision;
}
/* Fragile (non acquis), dû. */
const etatDu = (dernierTest: number | null = null) => etat(1, T0 - JOUR, dernierTest);
/* Acquis dont le CONTRÔLE tombe à `echeance` (forme NEUVE, #689 critère 1 : jamais
   `prochaineRevision: null`). `dernierTest` sert au tri du critère 4. */
function acquisControle(echeance: number, dernierTest: number | null = null): EtatRevision {
	return { palier: PALIER_ACQUIS, prochaineRevision: echeance, reussites: PALIER_ACQUIS, dernierTest };
}
/* Acquis d'AVANT #689 (critère 5) : `prochaineRevision: null`, échéance à déduire de
   `dernierTest + 365 jours` — construit à la main, comme dans la 1re tranche. */
function acquisAncienneForme(dernierTest: number | null): EtatRevision {
	return { palier: PALIER_ACQUIS, prochaineRevision: null, reussites: PALIER_ACQUIS, dernierTest };
}

/* Banque d'orthographe de n mots TOUS fragiles et dus (#641 : atelier fait). */
function motsDus(n: number): OrthoState {
	const banque: OrthoState['banque'] = {};
	for (let i = 0; i < n; i++) {
		const id = 'w' + i;
		banque[id] = {
			id,
			mot: 'mot' + i,
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: etat(0, T0 - 1000 - i),
			origine: 'liste',
		};
	}
	return { banque, listes: [], motIdParForme: {} };
}
const orthoVide = (): OrthoState => motsDus(0);

/* Leçons du niveau actif, FRAGILES et dues (`due` décroissant : la 1re est la plus en retard). */
function lecons(ids: string[], depart = 5000): Record<string, EtatRevision> {
	const out: Record<string, EtatRevision> = {};
	ids.forEach((id, i) => (out[id] = etat(0, T0 - depart + i * 100)));
	return out;
}

const basNiveau = (
	lessonId: string,
	e: EtatRevision = etatDu(),
	niveau: LeconBasNiveau['niveau'] = 'ce2',
): LeconBasNiveau => ({ lessonId, niveau, etat: e });

/* Séance à plat, dans l'ordre où l'enfant la parcourt. */
const aplati = (groups: DueGroup[]): DueItem[] => groups.flatMap((g) => g.items);
/* Un élément d'entretien du niveau inférieur (#232) porte toujours un `niveau`
   (impératif de génération, cf. `revision-bas-niveau.test.ts`) : c'est le seul signal
   disponible, dans `DueItem`, pour distinguer une leçon d'entretien d'une leçon de
   contrôle (les deux sont `kind: 'lesson'`, sans autre marqueur). */
const estEntretien = (it: DueItem): boolean => it.kind === 'lesson' && it.niveau !== undefined;

/* Réservoir de leçons réelles pour fabriquer du volume d'« acquis en contrôle », en
   excluant les quelques ids nommés explicitement ailleurs dans ce fichier (évite toute
   collision accidentelle entre un scénario écrit à la main et un lot généré en boucle). */
const RESERVES = new Set([
	'math-doubles',
	'math-moities',
	'math-complements',
	'math-tables-addition',
	'fr-conj-etre-present',
	'num-comparer',
]);
const LECONS_DISPONIBLES = getAllLessons()
	.map((l) => l.id)
	.filter((id) => !RESERVES.has(id));

/* n leçons acquises, contrôle dû, `dernierTest` décroissant (la 1re = la plus
   anciennement testée, donc la première servie par le tri du critère 4). */
function leconsAcquisesControle(n: number, echeanceBase: number): Record<string, EtatRevision> {
	if (n > LECONS_DISPONIBLES.length) {
		throw new Error(`catalogue insuffisant : ${LECONS_DISPONIBLES.length} leçons dispo, ${n} demandées`);
	}
	const out: Record<string, EtatRevision> = {};
	for (let i = 0; i < n; i++) {
		out[LECONS_DISPONIBLES[i]] = acquisControle(echeanceBase, T0 - (1000 - i) * JOUR);
	}
	return out;
}

/* ============================================================
   Critère 3 — priorité stricte : fragiles puis entretien, contrôle seulement en dernier
   ============================================================ */
describe('critère 3 — les acquis en contrôle ne servent QUE le reliquat de plafond', () => {
	it('plafond exactement saturé par les fragiles : zéro reliquat, zéro acquis en contrôle', () => {
		const plafond = 6;
		const fragiles = motsDus(plafond);
		// Candidat au contrôle très en retard : s'il devait sortir, ce serait ici.
		const lessonRevisions = leconsAcquisesControle(1, T0 - 500 * JOUR);
		const items = aplati(selectDueGroups(fragiles, lessonRevisions, T0, plafond, []));
		expect(items.length).toBe(plafond);
		expect(items.every((it) => it.kind === 'word')).toBe(true);
		expect(countDue(fragiles, lessonRevisions, T0, plafond, [])).toBe(plafond);
	});

	it('reliquat de 1 : exactement un acquis entre, jamais plus, malgré 5 candidats', () => {
		const plafond = 7;
		const fragiles = motsDus(6);
		const lessonRevisions = leconsAcquisesControle(5, T0 - 100 * JOUR);
		const items = aplati(selectDueGroups(fragiles, lessonRevisions, T0, plafond, []));
		expect(items.length).toBe(plafond);
		expect(items.filter((it) => it.kind === 'lesson').length).toBe(1);
	});

	it('reliquat de 3 : exactement trois acquis entrent, malgré 10 candidats disponibles', () => {
		const plafond = 9;
		const fragiles = motsDus(6);
		const lessonRevisions = leconsAcquisesControle(10, T0 - 100 * JOUR);
		const items = aplati(selectDueGroups(fragiles, lessonRevisions, T0, plafond, []));
		expect(items.length).toBe(plafond);
		expect(items.filter((it) => it.kind === 'lesson').length).toBe(3);
	});

	it('l’entretien du niveau inférieur consomme SES slots avant le contrôle des acquis', () => {
		const plafond = 12; // plafondBasNiveau(12) = 2 (cf. revision.ts)
		const fragiles = motsDus(4); // 4 actifs dus → dose d'entretien pas bridée par le nb d'actifs
		const basStock = [
			basNiveau('math-doubles', etatDu(T0 - 90 * JOUR)),
			basNiveau('math-moities', etatDu(T0 - 80 * JOUR)),
			basNiveau('math-complements', etatDu(T0 - 70 * JOUR)), // au-delà de la dose (2) : écarté
		];
		const lessonRevisions = leconsAcquisesControle(10, T0 - 50 * JOUR);
		const items = aplati(selectDueGroups(fragiles, lessonRevisions, T0, plafond, basStock));
		expect(items.length).toBe(plafond); // 4 fragiles + 2 entretien + 6 contrôle = 12
		const entretien = items.filter(estEntretien);
		expect(entretien.length).toBe(2); // dose plafonnée, jamais 3
		const controle = items.filter((it) => it.kind === 'lesson' && it.niveau === undefined);
		expect(controle.length).toBe(6); // reliquat = 12 − 4 − 2
		const fragilesServis = items.filter((it) => it.kind === 'word');
		expect(fragilesServis.length).toBe(4);
	});
});

/* ============================================================
   Critère 4 — clé de tri du remplissage : identique à collectBasNiveau
   ============================================================ */
describe('critère 4 — tri du contrôle : le plus longtemps sans test réel, départage par id', () => {
	it('jamais testé passe devant un élément déjà testé récemment', () => {
		const plafond = 2; // 1 fragile + reliquat 1
		const fragiles = motsDus(1);
		const lessonRevisions = {
			'math-complements': acquisControle(T0 - 400 * JOUR, T0 - 10 * JOUR), // testé il y a 10 j
			'math-tables-addition': acquisControle(T0 - 400 * JOUR, null), // jamais testé
		};
		const items = aplati(selectDueGroups(fragiles, lessonRevisions, T0, plafond, []));
		const controle = items.filter((it) => it.kind === 'lesson').map((it) => it.id);
		expect(controle).toEqual(['math-tables-addition']);
	});

	it('le retard du contrôle ne départage PAS : un contrôle moins en retard mais délaissé passe d’abord', () => {
		const plafond = 2;
		const fragiles = motsDus(1);
		const lessonRevisions = {
			// Très en retard (300 j) mais testé hier.
			'math-complements': acquisControle(T0 - 300 * JOUR, T0 - JOUR),
			// À peine en retard, mais plus testé depuis 500 j.
			'math-tables-addition': acquisControle(T0 - 1000, T0 - 500 * JOUR),
		};
		const items = aplati(selectDueGroups(fragiles, lessonRevisions, T0, plafond, []));
		expect(items.filter((it) => it.kind === 'lesson').map((it) => it.id)).toEqual([
			'math-tables-addition',
		]);
	});

	it('à égalité de « jamais testé », départage par id — indépendant de l’ordre d’insertion des clés', () => {
		const plafond = 2; // 1 fragile + reliquat 1
		const fragiles = motsDus(1);
		const construireDansCetOrdre = (ordre: string[]): Record<string, EtatRevision> => {
			const source: Record<string, EtatRevision> = {
				'math-tables-addition': acquisControle(T0 - 400 * JOUR, null),
				'math-complements': acquisControle(T0 - 400 * JOUR, null),
			};
			const out: Record<string, EtatRevision> = {};
			for (const k of ordre) out[k] = source[k];
			return out;
		};
		const controleServi = (lr: Record<string, EtatRevision>) =>
			aplati(selectDueGroups(fragiles, lr, T0, plafond, []))
				.filter((it) => it.kind === 'lesson')
				.map((it) => it.id);
		// « math-complements » < « math-tables-addition » en ordre alphabétique.
		expect(controleServi(construireDansCetOrdre(['math-tables-addition', 'math-complements']))).toEqual(
			['math-complements'],
		);
		expect(controleServi(construireDansCetOrdre(['math-complements', 'math-tables-addition']))).toEqual(
			['math-complements'],
		);
	});

	it('ROTATION : deux séances consécutives ne resservent pas les mêmes acquis, d’autres attendaient plus longtemps', () => {
		const plafond = 2; // aucun fragile, aucun entretien → reliquat 2
		let lessonRevisions: Record<string, EtatRevision> = {
			a: acquisControle(T0 - 1, T0 - 400 * JOUR),
			b: acquisControle(T0 - 1, T0 - 300 * JOUR),
			c: acquisControle(T0 - 1, T0 - 200 * JOUR),
			d: acquisControle(T0 - 1, T0 - 100 * JOUR),
		};
		// Séance 1 : les deux plus anciennement testés.
		const seance1 = aplati(selectDueGroups(orthoVide(), lessonRevisions, T0, plafond, []));
		expect(seance1.map((it) => it.id)).toEqual(['a', 'b']);
		// Réponses réussies : leur échéance de contrôle est repoussée d'un an.
		for (const it of seance1) {
			lessonRevisions = { ...lessonRevisions, [it.id]: avancerEtat(lessonRevisions[it.id], true, T0) };
		}
		// Séance 2 (même instant) : a et b ne sont plus dus → ce sont c et d qui sortent,
		// PAS une répétition de a/b — c'est le stock qui tourne.
		const seance2 = aplati(selectDueGroups(orthoVide(), lessonRevisions, T0, plafond, []));
		expect(seance2.map((it) => it.id)).toEqual(['c', 'd']);
	});
});

/* ============================================================
   Critère 6 / #478 — « annoncé = proposé », contrôle des acquis compris
   ============================================================ */
describe('critère 6 / #478 — countDue et selectDueGroups s’accordent, contrôle compris', () => {
	it('LE test qui compte le plus : accord sur tous les plafonds réglables, fragiles + entretien + contrôle mélangés', () => {
		const fragiles = motsDus(3); // stock actif modeste : ne sature aucun plafond réglable (min 6)
		const lessonRevisions = {
			...lecons(['math-doubles']), // 1 leçon active fragile, due
			'math-complements': acquisControle(T0 - 100 * JOUR, T0 - 500 * JOUR), // contrôle en retard
			'math-tables-addition': acquisControle(T0 - 50 * JOUR, null), // contrôle, jamais testé
			'fr-conj-etre-present': acquisControle(T0 + 300 * JOUR), // acquis, contrôle PAS encore dû
		};
		const bas = [basNiveau('num-comparer', etatDu(T0 - 40 * JOUR))]; // entretien non-acquis, dû
		let auMoinsUnAcquisServi = false;
		for (const plafond of REVISION_PLAFOND_CHOIX) {
			const dus = countDue(fragiles, lessonRevisions, T0, plafond, bas);
			const groups = selectDueGroups(fragiles, lessonRevisions, T0, plafond, bas);
			const proposes = aplati(groups).length;
			expect(effortRevisionAffiche(dus, plafond).n, `plafond ${plafond}`).toBe(proposes);
			if (aplati(groups).some((it) => it.id === 'math-complements' || it.id === 'math-tables-addition')) {
				auMoinsUnAcquisServi = true;
			}
		}
		// Garde-fou anti-test-complaisant : sans cette ligne, l'accord ci-dessus serait vrai
		// même si le contrôle des acquis n'existait pas du tout (0 des deux côtés) — ce qui
		// est exactement le cas AUJOURD'HUI. Cette assertion force le test à être rouge tant
		// que le contrôle n'est pas implémenté : au plus grand plafond réglable (24), le
		// reliquat est largement suffisant pour que les deux acquis en contrôle sortent.
		expect(auMoinsUnAcquisServi).toBe(true);
	});

	it('sans aucun débordement : countDue égale EXACTEMENT le total servi, sans passer par le plafonnage d’affichage', () => {
		const plafond = 20; // large : rien ne sature ici
		const fragiles = motsDus(3);
		const lessonRevisions = {
			...lecons(['math-doubles']),
			'math-complements': acquisControle(T0 - 100 * JOUR),
			'math-tables-addition': acquisControle(T0 - 50 * JOUR),
		};
		const bas = [basNiveau('num-comparer', etatDu(T0 - 40 * JOUR))];
		const dus = countDue(fragiles, lessonRevisions, T0, plafond, bas);
		const groups = selectDueGroups(fragiles, lessonRevisions, T0, plafond, bas);
		const items = aplati(groups);
		expect(dus).toBe(items.length);
		// Les deux candidats au contrôle sont bien SERVIS (et donc bien COMPTÉS ci-dessus) :
		// sans cette ligne, l'égalité tiendrait aussi si les deux valaient 0 (état actuel).
		expect(items.some((it) => it.id === 'math-complements')).toBe(true);
		expect(items.some((it) => it.id === 'math-tables-addition')).toBe(true);
	});

	it('un contrôle PAS encore dû ne compte ni ne se propose, quel que soit le reliquat disponible', () => {
		const plafond = 24;
		const lessonRevisions = { 'math-doubles': acquisControle(T0 + JOUR) }; // dû demain
		expect(countDue(orthoVide(), lessonRevisions, T0, plafond, [])).toBe(0);
		expect(aplati(selectDueGroups(orthoVide(), lessonRevisions, T0, plafond, [])).length).toBe(0);
	});
});

/* ============================================================
   Critère 9 (négatif) — aucun acquis ne prend le slot d'un fragile
   ============================================================ */
describe('critère 9 (négatif) — aucun acquis ne prend le slot d’un élément fragile', () => {
	it('205 éléments non acquis dus : zéro acquis apparaît, quel que soit le plafond réglable', () => {
		const fragiles = motsDus(205);
		const lessonRevisions = leconsAcquisesControle(50, T0 - 300 * JOUR); // stock d'acquis largement dispo
		for (const plafond of REVISION_PLAFOND_CHOIX) {
			const items = aplati(selectDueGroups(fragiles, lessonRevisions, T0, plafond, []));
			expect(items.length, `plafond ${plafond}`).toBe(plafond); // séance pleine de fragiles
			expect(items.every((it) => it.kind === 'word'), `plafond ${plafond}`).toBe(true);
		}
	});
});

/* ============================================================
   Acquis d'ancienne forme : entrée dans le contrôle via le repli de lecture (critère 5)
   ------------------------------------------------------------
   Ici testé à travers la SÉLECTION (pas d'appel direct à `echeanceControle` : la 1re
   tranche s'en charge déjà en isolation).
   ============================================================ */
describe('acquis d’ancienne forme (`prochaineRevision: null`) dans la sélection', () => {
	it('dû via le repli (dernierTest + 365 jours dépassé) : entre dans le contrôle', () => {
		const lessonRevisions = { 'math-doubles': acquisAncienneForme(T0 - 400 * JOUR) };
		const items = aplati(selectDueGroups(orthoVide(), lessonRevisions, T0, 8, []));
		expect(items.map((it) => it.id)).toEqual(['math-doubles']);
		expect(countDue(orthoVide(), lessonRevisions, T0, 8, [])).toBe(1);
	});

	it('ancienne forme, mais échéance de repli PAS encore atteinte : n’entre pas', () => {
		const lessonRevisions = { 'math-doubles': acquisAncienneForme(T0 - 300 * JOUR) };
		expect(aplati(selectDueGroups(orthoVide(), lessonRevisions, T0, 8, [])).length).toBe(0);
		expect(countDue(orthoVide(), lessonRevisions, T0, 8, [])).toBe(0);
	});

	it('sans aucun dernierTest : aucune échéance déductible, jamais servi (pas de « 1970 » implicite)', () => {
		const lessonRevisions = { 'math-doubles': acquisAncienneForme(null) };
		expect(aplati(selectDueGroups(orthoVide(), lessonRevisions, T0, 8, [])).length).toBe(0);
		expect(countDue(orthoVide(), lessonRevisions, T0, 8, [])).toBe(0);
	});
});

/* ============================================================
   Leçon acquise orpheline (id absent du catalogue) : écartée partout
   ============================================================ */
describe('leçon acquise orpheline', () => {
	it('un id hors catalogue n’apparaît jamais, même très en retard sur son contrôle', () => {
		const id = 'lecon-supprimee-du-catalogue';
		expect(getLessonById(id)).toBeUndefined();
		const lessonRevisions = { [id]: acquisControle(T0 - 1000 * JOUR) };
		expect(aplati(selectDueGroups(orthoVide(), lessonRevisions, T0, 24, [])).length).toBe(0);
		expect(countDue(orthoVide(), lessonRevisions, T0, 24, [])).toBe(0);
	});
});

/* ============================================================
   Critères 10 et 12 (négatifs) — charge CALCULÉE au stock maximal livré
   ------------------------------------------------------------
   Stock maximal cité par le critère 10 et sourcé dans
   docs/architecture/gamification.md (§ Ancrage, ligne 162) : 466 mots distincts, 264
   paires leçon × niveau. Total 730.

   Construction : chaque élément reçoit une échéance de contrôle espacée de exactement
   UN_AN / 730 les unes des autres, réparties sur l'année à VENIR à partir de `now`. Sur
   730 éléments répartis uniformément sur 365 jours, l'écart entre deux échéances
   consécutives vaut 365/730 = 0,5 jour : il arrive donc EXACTEMENT 2 nouvelles échéances
   de contrôle par jour, en régime établi (dérivation indépendante du code, cf. compte
   rendu de la tâche).

   Simulation JOUR PAR JOUR : chaque jour, on sert ce qui est dû et on fait avancer son
   état (réussite), ce qui repousse son échéance d'un an — sans quoi la file grossirait
   indéfiniment au lieu de tourner (aucun rapport avec la réalité d'un contrôle annuel
   servi une fois par jour). Le plafond de séance (11, repris tel quel du critère 10) est
   très supérieur au débit journalier (~2) : rien ne s'accumule, tout est absorbé le jour
   même.
   ============================================================ */
describe('critères 10 & 12 (négatifs) — charge journalière du contrôle au stock maximal', () => {
	const STOCK_MOTS = 466;
	const STOCK_PAIRES = 264;
	// Répartition des 264 paires entre la vue niveau ACTIF (`lessonRevisions`, un id =
	// une paire) et le niveau INFÉRIEUR (`bas`, où un même id peut porter une SECONDE
	// paire à un niveau distinct) — seule façon d'atteindre 264 avec 183 ids réels
	// distincts au catalogue (cf. l'hypothèse du en-tête de fichier).
	const LECONS_ACTIF = Math.min(getAllLessons().length, STOCK_PAIRES);
	const LECONS_BAS = STOCK_PAIRES - LECONS_ACTIF;
	const STOCK_TOTAL = STOCK_MOTS + STOCK_PAIRES; // 730
	const PAS = UN_AN / STOCK_TOTAL; // ≈ 0,5 jour : écart entre deux échéances consécutives
	const PLAFOND_ISSUE = 11; // littéral de l'issue #689 (critère 10), pas une constante du code

	// Garde-fou de construction : évite une collision silencieuse de clé si le catalogue
	// venait à rétrécir sous 2×264 leçons (aucun risque aujourd'hui, 183 disponibles).
	if (LECONS_BAS > LECONS_ACTIF) {
		throw new Error('catalogue trop petit pour ce test : réviser la fixture du critère 10');
	}

	function construireStockMax(now: number): {
		ortho: OrthoState;
		lessonRevisions: Record<string, EtatRevision>;
		bas: LeconBasNiveau[];
	} {
		let i = 0;
		const echeance = () => now + i++ * PAS;
		const ortho: OrthoState = emptyOrthoState();
		for (let w = 0; w < STOCK_MOTS; w++) {
			const id = 'ctrl-mot-' + w;
			ortho.banque[id] = {
				id,
				mot: 'mot' + w,
				entourage: [],
				atelierFait: true,
				validation: { motCache: false, tuiles: false, dictee: false },
				revision: acquisControle(echeance(), now - UN_AN),
				origine: 'liste',
			};
		}
		const idsActifs = getAllLessons()
			.slice(0, LECONS_ACTIF)
			.map((l) => l.id);
		const lessonRevisions: Record<string, EtatRevision> = {};
		for (const id of idsActifs) lessonRevisions[id] = acquisControle(echeance(), now - UN_AN);
		const bas: LeconBasNiveau[] = [];
		for (let b = 0; b < LECONS_BAS; b++) {
			bas.push({ lessonId: idsActifs[b], niveau: 'ce2', etat: acquisControle(echeance(), now - UN_AN) });
		}
		return { ortho, lessonRevisions, bas };
	}

	it('la fixture représente bien le stock maximal annoncé (466 mots + 264 paires = 730)', () => {
		const { ortho, lessonRevisions, bas } = construireStockMax(T0);
		expect(Object.keys(ortho.banque).length).toBe(STOCK_MOTS);
		expect(Object.keys(lessonRevisions).length + bas.length).toBe(STOCK_PAIRES);
	});

	it('en régime établi : ~2 éléments de contrôle servis par jour, moins de 20 % d’une séance de 11', () => {
		const { ortho, lessonRevisions, bas } = construireStockMax(T0);
		const NB_JOURS = 120;
		let total = 0;
		let max = 0;
		for (let d = 0; d < NB_JOURS; d++) {
			const t = T0 + d * JOUR;
			const groups = selectDueGroups(ortho, lessonRevisions, t, PLAFOND_ISSUE, bas);
			const servis = aplati(groups);
			// L'invariant #478 tient aussi sur cette fixture extrême.
			expect(countDue(ortho, lessonRevisions, t, PLAFOND_ISSUE, bas), `jour ${d}`).toBe(servis.length);
			total += servis.length;
			max = Math.max(max, servis.length);
			// Réponses réussies : repousse l'échéance d'un an, pour que la file TOURNE au lieu
			// de s'engorger (cf. en-tête du describe).
			for (const it of servis) {
				if (it.kind === 'word') {
					ortho.banque[it.id].revision = avancerEtat(ortho.banque[it.id].revision, true, t);
				} else if (it.niveau !== undefined) {
					const entree = bas.find((b) => b.lessonId === it.id);
					if (entree) entree.etat = avancerEtat(entree.etat, true, t);
				} else {
					lessonRevisions[it.id] = avancerEtat(lessonRevisions[it.id], true, t);
				}
			}
		}
		const moyenne = total / NB_JOURS;
		// Critère 10, littéralement : moins de 20 % d'une séance de 11 (2,2 éléments).
		expect(moyenne).toBeLessThan(0.2 * PLAFOND_ISSUE);
		// Dérivation indépendante (730 / 365 = 2,0 exactement) : bande large pour ne pas
		// coupler le test aux effets de bord du 1er/dernier jour de la fenêtre simulée.
		expect(moyenne).toBeGreaterThan(1);
		expect(moyenne).toBeLessThan(3);
		// Critère 12 : l'ampleur reste petite JOUR PAR JOUR, jamais une rafale qui
		// vaudrait une séance entière de contrôle (et donc un pic d'XP à faible effort).
		expect(max).toBeLessThanOrEqual(4);
	});
});

/* ============================================================
   Encadrant : RecapRevision.enControle (critère 6, versant parent)
   ============================================================ */
const H = 3_600_000;
function etatRevisionSimple(palier: number, prochaineRevision: number | null): EtatRevision {
	return { palier, prochaineRevision, reussites: palier, dernierTest: null };
}
function motOrtho(id: string, mot: string, revision: EtatRevision): MotOrtho {
	return {
		id,
		mot,
		entourage: [],
		atelierFait: false,
		validation: { motCache: false, tuiles: false, dictee: false },
		revision,
		origine: 'liste',
	};
}
function seed(uuid: string, key: string, value: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(value));
}

describe('encadrant-stats : RecapRevision.enControle (critère 6)', () => {
	const NOW = T0;

	it('compte les acquis dont l’échéance de contrôle est passée — forme neuve ET ancienne forme (repli)', () => {
		const p = activeProfile();
		seed(p.uuid, LESSON_REVISION_KEY, {
			'math-doubles@ce2': acquisControle(NOW - 5 * JOUR), // acquis, contrôle en retard
			'math-moities@ce2': acquisControle(NOW + 10 * JOUR), // acquis, contrôle pas encore dû
			'math-complements@ce2': acquisAncienneForme(NOW - UN_AN - 20 * JOUR), // ancienne forme, dû via repli
			'fr-conj-etre-present@ce2': etatRevisionSimple(1, NOW - H), // NON acquis, dû (fragile)
		});
		const ortho: OrthoState = {
			...emptyOrthoState(),
			banque: {
				w1: motOrtho('w1', 'chateau', acquisControle(NOW - JOUR)),
				w2: motOrtho('w2', 'abricot', acquisControle(NOW + 100 * JOUR)),
			},
		};
		seed(p.uuid, ORTHO_KEY, ortho);
		const recap: RecapRevision = revisionProfil(p, NOW);

		// 3 acquis en contrôle : math-doubles, math-complements (via le repli), w1.
		expect(recap.enControle).toBe(3);
		// Sous-ensemble d'`acquises`, jamais un 4e terme : la composition ne bouge pas.
		expect(recap.enControle).toBeLessThanOrEqual(recap.acquises);
		expect(recap.total).toBe(recap.enAttente + recap.enRotation + recap.acquises);
		// `dues` ne compte QUE les non-acquis (sinon le critère 6 est violé à sa source) :
		// seule fr-conj-etre-present, malgré 3 acquis eux aussi en retard sur leur contrôle.
		expect(recap.dues).toBe(1);
	});

	it('aucun acquis en contrôle : le champ vaut 0, sans casser la composition ni `acquises`', () => {
		const p = activeProfile();
		seed(p.uuid, LESSON_REVISION_KEY, {
			'math-doubles@ce2': acquisControle(NOW + 300 * JOUR), // acquis, contrôle loin devant
		});
		seed(p.uuid, ORTHO_KEY, emptyOrthoState());
		const recap: RecapRevision = revisionProfil(p, NOW);
		expect(recap.enControle).toBe(0);
		expect(recap.acquises).toBe(1);
		expect(recap.total).toBe(recap.enAttente + recap.enRotation + recap.acquises);
	});

	it('un acquis en contrôle ne fait PAS gonfler `dues` : la carte parent reste lisible (critère 6)', () => {
		const p = activeProfile();
		seed(p.uuid, LESSON_REVISION_KEY, {
			'math-doubles@ce2': acquisControle(NOW - 400 * JOUR), // très en retard sur son contrôle
		});
		seed(p.uuid, ORTHO_KEY, emptyOrthoState());
		const recap: RecapRevision = revisionProfil(p, NOW);
		expect(recap.enControle).toBe(1);
		expect(recap.dues).toBe(0); // pas un « dû » au sens fragile, même en retard
	});
});
