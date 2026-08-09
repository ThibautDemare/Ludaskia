/* ============================================================
   Journal des erreurs par profil (#391) — logique de journalisation.
   Couvre : ajout (plus récent d'abord, sans mutation), purge par rétention,
   écriture sur le profil actif + lecture par UUID, isolation entre profils,
   tolérance à un stockage corrompu.
   Puis (#476) le filtre de période du bloc encadrant : bornes exactes des
   fenêtres (jours calendaires locaux, borne basse incluse), période vide,
   pureté/ordre, et présélection de la période par défaut.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	ajouterErreur,
	journaliserErreur,
	chargerErreursFor,
	grouperErreursParLecon,
	filtrerErreursParPeriode,
	periodeParDefaut,
	PERIODES_REPLI,
	ERREURS_KEY,
	MAX_ERREURS,
	type ErreurEntry,
	type PeriodeErreurs,
} from '../src/core/erreurs-journal';
import { initProfiles, activeProfile, addProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { withSeed, rnd } from '../src/core/utils';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Petite fabrique d'entrée (ts explicite → tests déterministes). */
function err(over: Partial<ErreurEntry> = {}): Omit<ErreurEntry, 'ts'> & { ts: number } {
	return {
		ts: 1000,
		lessonId: 'math-complements',
		mode: 'lecon',
		question: '45 + 12 = …',
		donnee: '56',
		attendue: '57',
		...over,
	};
}

describe('ajouterErreur (pur : ordre + rétention)', () => {
	it('ajoute la nouvelle entrée EN TÊTE (plus récent d’abord)', () => {
		const a = err({ ts: 1 });
		const b = err({ ts: 2, donnee: 'x' });
		const liste = ajouterErreur(ajouterErreur([], a), b);
		expect(liste.map((e) => e.ts)).toEqual([2, 1]);
	});

	it('ne mute pas la liste d’origine', () => {
		const base: ErreurEntry[] = [err({ ts: 1 })];
		const copie = [...base];
		ajouterErreur(base, err({ ts: 2 }));
		expect(base).toEqual(copie);
	});

	it('purge au-delà de la rétention en gardant les plus récentes', () => {
		let liste: ErreurEntry[] = [];
		for (let i = 1; i <= 5; i++) liste = ajouterErreur(liste, err({ ts: i }), 3);
		expect(liste.map((e) => e.ts)).toEqual([5, 4, 3]); // 1 et 2 purgées
	});

	it('max = 0 → liste vide', () => {
		expect(ajouterErreur([], err(), 0)).toEqual([]);
	});
});

describe('journaliserErreur + chargerErreursFor (profil actif ↔ lecture par UUID)', () => {
	it('journalise sur le profil actif et se relit par son UUID', () => {
		const uuid = activeProfile().uuid;
		journaliserErreur(err({ question: 'Q1' }));
		journaliserErreur(err({ question: 'Q2' }));
		const journal = chargerErreursFor(uuid);
		expect(journal).toHaveLength(2);
		// Plus récent d’abord.
		expect(journal.map((e) => e.question)).toEqual(['Q2', 'Q1']);
		expect(journal[0]).toMatchObject({
			lessonId: 'math-complements',
			mode: 'lecon',
			attendue: '57',
		});
		expect(typeof journal[0].ts).toBe('number');
	});

	it('ignore une entrée sans leçon identifiée (rien à regrouper)', () => {
		const uuid = activeProfile().uuid;
		journaliserErreur(err({ lessonId: '' }));
		expect(chargerErreursFor(uuid)).toEqual([]);
	});

	it('applique la rétention MAX_ERREURS', () => {
		const uuid = activeProfile().uuid;
		for (let i = 0; i < MAX_ERREURS + 5; i++) journaliserErreur(err({ question: 'Q' + i }));
		const journal = chargerErreursFor(uuid);
		expect(journal).toHaveLength(MAX_ERREURS);
		// La toute dernière journalisée est en tête ; les 5 premières ont été purgées.
		expect(journal[0].question).toBe('Q' + (MAX_ERREURS + 4));
		expect(journal.some((e) => e.question === 'Q0')).toBe(false);
	});

	it('isole les journaux entre profils', () => {
		const p1 = activeProfile().uuid;
		journaliserErreur(err({ question: 'chez-p1' }));
		const p2 = addProfile('Deux'); // addProfile bascule le profil actif sur p2
		journaliserErreur(err({ question: 'chez-p2' }));

		expect(chargerErreursFor(p1).map((e) => e.question)).toEqual(['chez-p1']);
		expect(chargerErreursFor(p2.uuid).map((e) => e.question)).toEqual(['chez-p2']);

		// Consulter un profil ne bascule pas l’actif (invariant encadrant).
		expect(activeProfile().uuid).toBe(p2.uuid);
		chargerErreursFor(p1);
		expect(activeProfile().uuid).toBe(p2.uuid);
	});
});

describe('chargerErreursFor (robustesse)', () => {
	it('profil inconnu → []', () => {
		expect(chargerErreursFor('inconnu')).toEqual([]);
	});

	it('tolère un stockage corrompu (non-tableau, entrées invalides)', () => {
		const uuid = activeProfile().uuid;
		localStorage.setItem(uuid + '/' + ERREURS_KEY, '"pas un tableau"');
		expect(chargerErreursFor(uuid)).toEqual([]);

		// Mélange d’entrées valides et invalides : ne garde que les valides.
		const valide = err({ ts: 9 });
		localStorage.setItem(
			uuid + '/' + ERREURS_KEY,
			JSON.stringify([valide, { ts: 'x' }, null, { lessonId: 'y' }]),
		);
		expect(chargerErreursFor(uuid)).toEqual([valide]);
	});
});

/* ============================================================
   #519 — Classement des groupes par VOLUME d'erreurs.
   ------------------------------------------------------------
   Spec éprouvée ici : le bloc encadrant répond à « sur quoi l'aider ? », donc la
   leçon la PLUS RATÉE passe en tête ; la récence ne sert plus qu'à départager
   deux leçons à égalité de volume (ordre déterministe). Le signal « récent »
   reste porté par le filtre de période (#476) appliqué AVANT le regroupement.
   ============================================================ */
describe('grouperErreursParLecon (classement par volume + regroupement)', () => {
	it('met la leçon la PLUS ratée en tête, même si une autre a été ratée plus récemment', () => {
		// Cœur du changement : « geometrie » vient d'être ratée (ts le plus grand)
		// mais UNE seule fois ; « calcul » a coincé 3 fois plus tôt. C'est le volume
		// qui répond à la question du parent, donc « calcul » d'abord.
		const liste: ErreurEntry[] = [
			err({ ts: 900, lessonId: 'geometrie', question: 'Combien de côtés ?' }),
			err({ ts: 300, lessonId: 'calcul', question: '45 + 12 = …' }),
			err({ ts: 200, lessonId: 'calcul', question: '38 + 7 = …' }),
			err({ ts: 100, lessonId: 'calcul', question: '56 + 9 = …' }),
		];
		const g = grouperErreursParLecon(liste);
		expect(g.map((x) => x.lessonId)).toEqual(['calcul', 'geometrie']);
		expect(g.map((x) => x.total)).toEqual([3, 1]);
		// La récence reste exposée pour l'affichage — elle ne pilote plus le rang.
		expect(g[0].derniereFois).toBe(300);
		expect(g[1].derniereFois).toBe(900);
	});

	it('à volume ÉGAL, la leçon la plus récemment ratée passe devant', () => {
		// 2 erreurs chacune. « recente » est volontairement rencontrée APRÈS dans le
		// journal : le rang ne doit pas suivre l'ordre d'apparition.
		const liste: ErreurEntry[] = [
			err({ ts: 400, lessonId: 'ancienne', question: 'Q1' }),
			err({ ts: 100, lessonId: 'ancienne', question: 'Q2' }),
			err({ ts: 401, lessonId: 'recente', question: 'Q3' }),
			err({ ts: 50, lessonId: 'recente', question: 'Q4' }),
		];
		const g = grouperErreursParLecon(liste);
		expect(g.map((x) => x.lessonId)).toEqual(['recente', 'ancienne']);
		expect(g.map((x) => x.total)).toEqual([2, 2]);
	});

	it('classe sur les occurrences cumulées, pas sur le nombre de lignes affichées', () => {
		// Piège `total` ≠ `erreurs.length` : « ressassee » = UNE question ratée 3 fois
		// (1 ligne « vu 3 fois », 3 erreurs) ; « variee » = DEUX questions ratées une
		// fois (2 lignes, 2 erreurs). L'enfant a buté 3 fois sur la première → elle
		// passe devant, même si elle affiche moins de lignes et est plus ancienne.
		const liste: ErreurEntry[] = [
			err({ ts: 30, lessonId: 'variee', question: 'V1' }),
			err({ ts: 29, lessonId: 'variee', question: 'V2' }),
			err({ ts: 12, lessonId: 'ressassee', question: 'R', donnee: '7' }),
			err({ ts: 11, lessonId: 'ressassee', question: 'R', donnee: '7' }),
			err({ ts: 10, lessonId: 'ressassee', question: 'R', donnee: '7' }),
		];
		const g = grouperErreursParLecon(liste);
		expect(g.map((x) => x.lessonId)).toEqual(['ressassee', 'variee']);
		expect(g.map((x) => x.total)).toEqual([3, 2]);
		expect(g.map((x) => x.erreurs.length)).toEqual([1, 2]); // l'inverse de l'ordre retenu
		expect(g[0].erreurs[0].occurrences).toBe(3);
	});

	it('groupe par leçon et garde, à l’intérieur, le plus récent d’abord', () => {
		const liste: ErreurEntry[] = [
			err({ ts: 10, lessonId: 'a', question: 'Qa' }),
			err({ ts: 30, lessonId: 'b', question: 'Qb' }),
			err({ ts: 20, lessonId: 'a', question: 'Qa2' }),
		];
		const g = grouperErreursParLecon(liste);
		expect(g.map((x) => x.lessonId)).toEqual(['a', 'b']); // a : 2 erreurs, b : 1
		expect(g[0].total).toBe(2);
		expect(g[0].derniereFois).toBe(20);
		expect(g[0].erreurs.map((e) => e.question)).toEqual(['Qa2', 'Qa']);
	});

	it('dédoublonne la même erreur (question + réponse donnée) en « vu N fois »', () => {
		const liste: ErreurEntry[] = [
			err({ ts: 1, lessonId: 'a', question: 'Q', donnee: '56' }),
			err({ ts: 5, lessonId: 'a', question: 'Q', donnee: '56' }),
			err({ ts: 3, lessonId: 'a', question: 'Q', donnee: '58' }), // réponse différente → ligne distincte
		];
		const g = grouperErreursParLecon(liste);
		expect(g).toHaveLength(1);
		expect(g[0].total).toBe(3); // total = nombre d’erreurs brutes
		expect(g[0].erreurs).toHaveLength(2); // 2 lignes distinctes après dédoublonnage
		const parDonnee = Object.fromEntries(g[0].erreurs.map((e) => [e.donnee, e]));
		expect(parDonnee['56'].occurrences).toBe(2);
		expect(parDonnee['56'].ts).toBe(5); // garde l’horodatage le plus récent
		expect(parDonnee['58'].occurrences).toBe(1);
	});

	it('liste vide → []', () => {
		expect(grouperErreursParLecon([])).toEqual([]);
	});

	it('invariant sur 200 journaux tirés : totaux décroissants, récence en départage, rien de perdu', () => {
		// Peu de valeurs distinctes (leçons, ts, questions) → beaucoup d'égalités de
		// `total` et de doublons : c'est là que le classement et le dédoublonnage
		// peuvent se contredire, et ça ne se voit que sur un gros échantillon.
		withSeed(519, () => {
			for (let tirage = 0; tirage < 200; tirage++) {
				const liste: ErreurEntry[] = [];
				const nbLecons = rnd(1, 4);
				for (let i = rnd(1, 12); i > 0; i--) {
					liste.push(
						err({
							ts: rnd(1, 8) * 1000,
							lessonId: 'l' + rnd(1, nbLecons),
							question: 'Q' + rnd(1, 3),
							donnee: 'D' + rnd(1, 2),
						}),
					);
				}
				const g = grouperErreursParLecon(liste);

				// Classement : total décroissant, puis récence décroissante.
				for (let i = 1; i < g.length; i++) {
					expect(g[i - 1].total).toBeGreaterThanOrEqual(g[i].total);
					if (g[i - 1].total === g[i].total) {
						expect(g[i - 1].derniereFois).toBeGreaterThanOrEqual(g[i].derniereFois);
					}
				}
				// Le regroupement ne perd ni ne double aucune erreur.
				expect(g.reduce((s, x) => s + x.total, 0)).toBe(liste.length);
				expect(new Set(g.map((x) => x.lessonId)).size).toBe(g.length);
				for (const groupe of g) {
					expect(groupe.erreurs.reduce((s, e) => s + e.occurrences, 0)).toBe(groupe.total);
					expect(groupe.derniereFois).toBe(Math.max(...groupe.erreurs.map((e) => e.ts)));
					for (let i = 1; i < groupe.erreurs.length; i++) {
						expect(groupe.erreurs[i - 1].ts).toBeGreaterThanOrEqual(groupe.erreurs[i].ts);
					}
				}
			}
		});
	});
});

/* ============================================================
   #476 — Filtre de période du bloc « Ce qui a été difficile récemment ».
   ------------------------------------------------------------
   Spec éprouvée ici (dérivée de l'issue, pas de l'implémentation) :
   - fenêtres en JOURS CALENDAIRES LOCAUX, aujourd'hui inclus → 'jour' = depuis
     minuit aujourd'hui, 'deux-jours' = depuis minuit hier, 'semaine' = 7 jours
     (aujourd'hui + les 6 précédents), 'tout' = aucune borne ;
   - borne basse INCLUSIVE (minuit pile est dedans, 1 ms avant est dehors) ;
   - filtre pur : ni mutation, ni réordonnancement ;
   - `periodeParDefaut` = la fenêtre la plus SERRÉE non vide, repli sur 'semaine'.
   Les instants sont construits avec `new Date(a, m, j, h, min)` (composantes
   LOCALES, mois 0-based) comme ailleurs dans la suite (cf. seance.test.ts) : les
   attendus restent valides quel que soit le fuseau de la machine de test.
   ============================================================ */

/* Instant de référence : lundi 27 juillet 2026, 15 h 30 (heure locale). */
const NOW = new Date(2026, 6, 27, 15, 30, 0, 0).getTime();

/* Minuit LOCAL du jour J-`joursAvant`, dérivé du CALENDRIER (constructeur Date à
   composantes locales, qui normalise les jours négatifs) et non d'une soustraction
   en millisecondes : c'est la définition attendue de la borne. */
function minuitLocal(base: number, joursAvant = 0): number {
	const d = new Date(base);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() - joursAvant).getTime();
}

/* Un instant du jour J-`joursAvant`, à l'heure locale voulue. */
function jourA(base: number, joursAvant: number, h = 12, min = 0, s = 0, ms = 0): number {
	const d = new Date(base);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() - joursAvant, h, min, s, ms).getTime();
}

/* Premier jour couvert par chaque fenêtre, compté depuis aujourd'hui (J-0). */
const PREMIER_JOUR: ReadonlyArray<readonly [Exclude<PeriodeErreurs, 'tout'>, number]> = [
	['jour', 0], // aujourd'hui seul
	['deux-jours', 1], // aujourd'hui + la veille
	['semaine', 6], // aujourd'hui + les 6 précédents
];

const TOUTES_PERIODES: readonly PeriodeErreurs[] = ['jour', 'deux-jours', 'semaine', 'tout'];

describe('filtrerErreursParPeriode — bornes exactes des fenêtres', () => {
	for (const [periode, joursAvant] of PREMIER_JOUR) {
		it(`« ${periode} » : minuit local de J-${joursAvant} est DEDANS, 1 ms avant est DEHORS`, () => {
			const borne = minuitLocal(NOW, joursAvant);
			const liste: ErreurEntry[] = [err({ ts: borne }), err({ ts: borne - 1 })];
			expect(filtrerErreursParPeriode(liste, periode, NOW).map((e) => e.ts)).toEqual([borne]);
		});
	}

	it('« jour » ne garde que le jour calendaire courant', () => {
		const liste: ErreurEntry[] = [
			err({ ts: NOW }),
			err({ ts: jourA(NOW, 0, 0, 0) }), // aujourd'hui 00 h 00 (borne)
			err({ ts: jourA(NOW, 1, 23, 59, 59, 999) }), // hier, une ms avant minuit
		];
		expect(filtrerErreursParPeriode(liste, 'jour', NOW)).toHaveLength(2);
	});

	it('« semaine » couvre exactement 7 jours calendaires (J-0 … J-6), pas J-7', () => {
		const liste: ErreurEntry[] = [];
		for (let j = 0; j <= 7; j++) liste.push(err({ ts: jourA(NOW, j, 12) }));
		const gardes = filtrerErreursParPeriode(liste, 'semaine', NOW);
		expect(gardes).toHaveLength(7);
		expect(gardes.map((e) => new Date(e.ts).getDate())).toEqual([27, 26, 25, 24, 23, 22, 21]);
	});

	it('fenêtres emboîtées : jour ⊆ deux-jours ⊆ semaine ⊆ tout', () => {
		const liste: ErreurEntry[] = [0, 1, 3, 6, 7, 40].map((j) => err({ ts: jourA(NOW, j, 12) }));
		const tailles = TOUTES_PERIODES.map((p) => filtrerErreursParPeriode(liste, p, NOW).length);
		expect(tailles).toEqual([1, 2, 4, 6]);
	});

	it('« tout » : aucune borne basse (même une erreur de 1970 ou antérieure)', () => {
		const liste: ErreurEntry[] = [err({ ts: 0 }), err({ ts: -86_400_000 }), err({ ts: NOW })];
		expect(filtrerErreursParPeriode(liste, 'tout', NOW)).toHaveLength(3);
		expect(filtrerErreursParPeriode(liste, 'semaine', NOW)).toHaveLength(1);
	});
});

describe('filtrerErreursParPeriode — période vide', () => {
	it('journal vide → [] pour toutes les périodes', () => {
		for (const p of TOUTES_PERIODES) expect(filtrerErreursParPeriode([], p, NOW)).toEqual([]);
	});

	it('erreurs toutes antérieures à la fenêtre → [] (pas de repli implicite)', () => {
		const liste: ErreurEntry[] = [err({ ts: jourA(NOW, 3, 9) }), err({ ts: jourA(NOW, 5, 18) })];
		expect(filtrerErreursParPeriode(liste, 'jour', NOW)).toEqual([]);
		expect(filtrerErreursParPeriode(liste, 'deux-jours', NOW)).toEqual([]);
		expect(filtrerErreursParPeriode(liste, 'semaine', NOW)).toHaveLength(2);
	});

	it('une seule erreur, 1 ms trop tôt pour la semaine → fenêtre vide', () => {
		const liste: ErreurEntry[] = [err({ ts: minuitLocal(NOW, 6) - 1 })];
		expect(filtrerErreursParPeriode(liste, 'semaine', NOW)).toEqual([]);
		expect(filtrerErreursParPeriode(liste, 'tout', NOW)).toHaveLength(1);
	});
});

describe('filtrerErreursParPeriode — jours calendaires, pas 24 h glissantes', () => {
	it('hier 23 h 50 est HORS « aujourd’hui », même consulté 20 minutes plus tard', () => {
		const nowNuit = new Date(2026, 6, 27, 0, 10).getTime();
		const liste: ErreurEntry[] = [err({ ts: new Date(2026, 6, 26, 23, 50).getTime() })];
		expect(filtrerErreursParPeriode(liste, 'jour', nowNuit)).toEqual([]);
		expect(filtrerErreursParPeriode(liste, 'deux-jours', nowNuit)).toHaveLength(1);
	});

	it('l’heure de consultation ne change pas le résultat (00 h 00 vs 23 h 59)', () => {
		const liste: ErreurEntry[] = [
			err({ ts: minuitLocal(NOW, 0) }),
			err({ ts: jourA(NOW, 1, 23, 59, 59, 999) }),
			err({ ts: jourA(NOW, 6, 8) }),
			err({ ts: jourA(NOW, 7, 8) }),
		];
		const tot = new Date(2026, 6, 27, 0, 0, 0, 0).getTime();
		const soir = new Date(2026, 6, 27, 23, 59, 59, 999).getTime();
		for (const p of TOUTES_PERIODES) {
			expect(filtrerErreursParPeriode(liste, p, tot)).toEqual(
				filtrerErreursParPeriode(liste, p, soir),
			);
		}
		// Et le contenu attendu ne dépend que du calendrier.
		expect(filtrerErreursParPeriode(liste, 'jour', soir)).toHaveLength(1);
		expect(filtrerErreursParPeriode(liste, 'deux-jours', soir)).toHaveLength(2);
		expect(filtrerErreursParPeriode(liste, 'semaine', soir)).toHaveLength(3);
	});

	it('traverse un changement de mois et d’année', () => {
		const nowJanvier = new Date(2026, 0, 1, 10, 0).getTime(); // 1er janvier 2026
		const liste: ErreurEntry[] = [
			err({ ts: new Date(2025, 11, 31, 18, 0).getTime() }), // 31 déc → dedans
			err({ ts: new Date(2025, 11, 26, 0, 0).getTime() }), // 26 déc, minuit = borne
			err({ ts: new Date(2025, 11, 25, 23, 59, 59, 999).getTime() }), // 1 ms trop tôt
		];
		expect(filtrerErreursParPeriode(liste, 'semaine', nowJanvier).map((e) => e.ts)).toEqual([
			liste[0].ts,
			liste[1].ts,
		]);
	});

	it('reste sur minuit local en travers d’un changement d’heure', () => {
		// Dimanche 29 mars 2026 : passage à l'heure d'été en Europe (02 h → 03 h).
		const nowDst = new Date(2026, 2, 29, 12, 0).getTime();
		const liste: ErreurEntry[] = [
			err({ ts: new Date(2026, 2, 28, 0, 0).getTime() }), // borne de « deux-jours »
			err({ ts: new Date(2026, 2, 27, 23, 59, 59, 999).getTime() }),
		];
		expect(filtrerErreursParPeriode(liste, 'deux-jours', nowDst).map((e) => e.ts)).toEqual([
			liste[0].ts,
		]);
		expect(filtrerErreursParPeriode(liste, 'jour', nowDst)).toEqual([]);
	});
});

describe('filtrerErreursParPeriode — pureté, ordre, horloge en avance', () => {
	it('ne mute pas la liste d’entrée et préserve l’ordre d’origine', () => {
		// Volontairement NON trié : le filtre ne doit pas réordonner.
		const liste: ErreurEntry[] = [
			err({ ts: jourA(NOW, 1, 9), question: 'B' }),
			err({ ts: jourA(NOW, 0, 8), question: 'A' }),
			err({ ts: jourA(NOW, 9, 9), question: 'vieux' }),
			err({ ts: jourA(NOW, 1, 20), question: 'C' }),
		];
		const copie = liste.map((e) => ({ ...e }));
		expect(filtrerErreursParPeriode(liste, 'deux-jours', NOW).map((e) => e.question)).toEqual([
			'B',
			'A',
			'C',
		]);
		expect(filtrerErreursParPeriode(liste, 'tout', NOW).map((e) => e.question)).toEqual([
			'B',
			'A',
			'vieux',
			'C',
		]);
		expect(liste).toEqual(copie);
	});

	it('le résultat est détachable : le trier ne touche pas le journal', () => {
		const liste: ErreurEntry[] = [err({ ts: 10, question: 'X' }), err({ ts: 99, question: 'Y' })];
		const res = filtrerErreursParPeriode(liste, 'tout', NOW);
		res.sort((a, b) => a.ts - b.ts);
		res.pop();
		expect(liste.map((e) => e.question)).toEqual(['X', 'Y']);
	});

	it('pas de borne haute : une erreur estampillée dans le futur reste visible', () => {
		// Horloge de l'appareil en avance / erreur enregistrée « plus tard aujourd'hui ».
		const liste: ErreurEntry[] = [err({ ts: jourA(NOW, 0, 23, 30) }), err({ ts: jourA(NOW, -2) })];
		expect(filtrerErreursParPeriode(liste, 'jour', NOW)).toHaveLength(2);
		expect(filtrerErreursParPeriode(liste, 'tout', NOW)).toHaveLength(2);
	});
});

describe('periodeParDefaut — la fenêtre la plus serrée qui montre quelque chose', () => {
	it('PERIODES_REPLI va du plus serré au plus large et exclut « tout »', () => {
		expect([...PERIODES_REPLI]).toEqual(['jour', 'deux-jours', 'semaine']);
	});

	it('une erreur aujourd’hui (même à minuit pile) → « jour »', () => {
		expect(periodeParDefaut([err({ ts: minuitLocal(NOW, 0) })], NOW)).toBe('jour');
		expect(periodeParDefaut([err({ ts: NOW })], NOW)).toBe('jour');
	});

	it('rien aujourd’hui mais hier à 1 ms de minuit → « deux-jours »', () => {
		const liste: ErreurEntry[] = [
			err({ ts: minuitLocal(NOW, 0) - 1 }),
			err({ ts: jourA(NOW, 4, 10) }),
		];
		expect(periodeParDefaut(liste, NOW)).toBe('deux-jours');
	});

	it('rien depuis l’avant-veille → « semaine »', () => {
		expect(periodeParDefaut([err({ ts: jourA(NOW, 2, 17) })], NOW)).toBe('semaine');
		expect(periodeParDefaut([err({ ts: minuitLocal(NOW, 6) })], NOW)).toBe('semaine'); // dernier jour couvert
	});

	it('journal vide ou entièrement plus ancien qu’une semaine → « semaine », jamais « tout »', () => {
		expect(periodeParDefaut([], NOW)).toBe('semaine');
		const vieux: ErreurEntry[] = [
			err({ ts: minuitLocal(NOW, 6) - 1 }), // 1 ms trop tôt
			err({ ts: jourA(NOW, 30, 12) }),
		];
		expect(periodeParDefaut(vieux, NOW)).toBe('semaine');
		// Conséquence assumée : le bloc s'ouvre vide, à l'encadrant d'élargir.
		expect(filtrerErreursParPeriode(vieux, 'semaine', NOW)).toEqual([]);
	});

	it('c’est la PLUS RÉCENTE qui décide, pas la position dans la liste', () => {
		const liste: ErreurEntry[] = [
			err({ ts: jourA(NOW, 5, 9) }),
			err({ ts: jourA(NOW, 3, 9) }),
			err({ ts: jourA(NOW, 0, 7) }), // en queue de liste, mais d'aujourd'hui
		];
		expect(periodeParDefaut(liste, NOW)).toBe('jour');
	});

	it('invariant sur 300 journaux tirés : jamais « tout », rien de non vide plus serré', () => {
		withSeed(476, () => {
			for (let tirage = 0; tirage < 300; tirage++) {
				const liste: ErreurEntry[] = [];
				for (let i = rnd(0, 6); i > 0; i--) {
					liste.push(err({ ts: jourA(NOW, rnd(0, 10), rnd(0, 23), rnd(0, 59)) }));
				}
				const p = periodeParDefaut(liste, NOW);
				expect(p).not.toBe('tout');
				const rang = PERIODES_REPLI.findIndex((x) => x === p);
				expect(rang).toBeGreaterThanOrEqual(0);
				// Toute fenêtre strictement plus serrée est vide (sinon ce n'était pas la plus serrée).
				for (const plusSerre of PERIODES_REPLI.slice(0, rang)) {
					expect(filtrerErreursParPeriode(liste, plusSerre, NOW)).toEqual([]);
				}
				// La fenêtre retenue montre quelque chose, sauf repli légitime sur 'semaine'.
				if (filtrerErreursParPeriode(liste, p, NOW).length === 0) expect(p).toBe('semaine');
			}
		});
	});
});

describe('filtre + regroupement : les compteurs parlent de la période choisie', () => {
	it('« N erreurs » et « dernière fois » se recalculent sur la fenêtre', () => {
		const liste: ErreurEntry[] = [
			err({ ts: jourA(NOW, 0, 10), lessonId: 'a', question: 'Q1' }),
			err({ ts: jourA(NOW, 3, 10), lessonId: 'a', question: 'Q2' }),
			err({ ts: jourA(NOW, 3, 11), lessonId: 'b', question: 'Q3' }),
		];
		const duJour = grouperErreursParLecon(filtrerErreursParPeriode(liste, 'jour', NOW));
		expect(duJour.map((g) => g.lessonId)).toEqual(['a']); // la leçon b sort du cadre
		expect(duJour[0].total).toBe(1);
		expect(duJour[0].derniereFois).toBe(jourA(NOW, 0, 10));

		const deLaSemaine = grouperErreursParLecon(filtrerErreursParPeriode(liste, 'semaine', NOW));
		expect(deLaSemaine.map((g) => g.lessonId)).toEqual(['a', 'b']);
		expect(deLaSemaine[0].total).toBe(2);
	});

	it('le CLASSEMENT change avec la période : dominante sur la semaine, minoritaire aujourd’hui', () => {
		// #519 : c'est le filtre de période qui porte la récence, donc changer de
		// fenêtre doit rebattre l'ordre des leçons, pas seulement leurs compteurs.
		const liste: ErreurEntry[] = [
			// « calcul » : 3 erreurs, toutes d'aujourd'hui.
			err({ ts: jourA(NOW, 0, 11), lessonId: 'calcul', question: 'C1' }),
			err({ ts: jourA(NOW, 0, 10), lessonId: 'calcul', question: 'C2' }),
			err({ ts: jourA(NOW, 0, 9), lessonId: 'calcul', question: 'C3' }),
			// « grammaire » : 1 seule aujourd'hui, mais 5 sur la semaine.
			err({ ts: jourA(NOW, 0, 8), lessonId: 'grammaire', question: 'G1' }),
			err({ ts: jourA(NOW, 3, 17), lessonId: 'grammaire', question: 'G2' }),
			err({ ts: jourA(NOW, 3, 16), lessonId: 'grammaire', question: 'G3' }),
			err({ ts: jourA(NOW, 4, 15), lessonId: 'grammaire', question: 'G4' }),
			err({ ts: jourA(NOW, 6, 14), lessonId: 'grammaire', question: 'G5' }),
		];
		// « mesures » : le plus gros volume du journal, mais hors de la semaine.
		for (let i = 0; i < 8; i++) {
			liste.push(err({ ts: jourA(NOW, 40, 9, i), lessonId: 'mesures', question: 'M' + i }));
		}
		const classement = (p: PeriodeErreurs): [string, number][] =>
			grouperErreursParLecon(filtrerErreursParPeriode(liste, p, NOW)).map((g) => [
				g.lessonId,
				g.total,
			]);

		expect(classement('jour')).toEqual([
			['calcul', 3],
			['grammaire', 1],
		]);
		expect(classement('deux-jours')).toEqual([
			['calcul', 3],
			['grammaire', 1],
		]);
		// Sur la semaine, « grammaire » repasse devant : même journal, autre verdict.
		expect(classement('semaine')).toEqual([
			['grammaire', 5],
			['calcul', 3],
		]);
		// Sans borne, c'est le vieux gros volume qui domine.
		expect(classement('tout')).toEqual([
			['mesures', 8],
			['grammaire', 5],
			['calcul', 3],
		]);
	});
});
