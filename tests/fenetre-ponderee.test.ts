/* ============================================================
   Fenêtre de performance récente PONDÉRÉE par les questions (#541).
   ------------------------------------------------------------
   Cible : core/maitrise.ts (essaisRecents, ajouterEssaiRecent, recentAvgPct,
   perfRecente, niveauNotion, tendanceNotion) et son écriture par
   `recordLessonStats` (core/progress.ts).

   Le contrat éprouvé, tel qu'il est annoncé :
   - la fenêtre se compte en QUESTIONS (une quarantaine), plus en essais : un essai
     pèse ce qu'il a réellement mesuré ;
   - la performance récente est `Σok / Σtotal` sur cette fenêtre, jamais une moyenne
     de pourcentages par essai ;
   - l'ancienne forme (`recentPct`, un % par essai) est CONVERTIE à la lecture — pas
     jetée — puis remplacée au prochain essai enregistré ;
   - l'état affiché ne descend à « à renforcer » qu'à partir d'un plancher
     d'échantillon, et la tendance se tait sous un nombre de questions — au total
     comme sur chacune de ses deux moitiés, coupées au plus près de la moitié.

   Ce que ces tests ne recopient PAS : les attendus sont recalculés ici en
   bonnes réponses sur questions posées (« 8 justes sur 9 questions = 89 % »), et les
   deux planchers sont éprouvés par ce qu'ils doivent PERMETTRE et INTERDIRE (une série
   complète de 6 questions ratée doit pouvoir dire « à renforcer », deux questions
   isolées non), pas par la valeur de la constante.

   Le BIAIS que tout ceci corrige, et qui sert de fil rouge : une leçon croisée en
   sprint peut sortir d'une session avec UNE question (cf. src/ui/sprint.ts). Sous la
   moyenne non pondérée de 5 essais, cette question valait une série complète de huit.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	FENETRE_QUESTIONS,
	MIN_QUESTIONS_ETAT_BAS,
	TENDANCE_MIN_QUESTIONS,
	TENDANCE_MIN_MOITIE,
	SEUIL_NON_ACQUIS,
	SEUIL_REVOIR,
	essaisRecents,
	ajouterEssaiRecent,
	questionsFenetre,
	lessonAvgPct,
	recentAvgPct,
	perfRecente,
	niveauNotion,
	tendanceNotion,
	estNotionSolide,
	type EssaiRecent,
	type LessonStat,
} from '../src/core/maitrise';
import { recordLessonStats, loadLessonStats, LESSON_STATS_KEY } from '../src/core/progress';
import { progressionProfil } from '../src/core/encadrant-stats';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsSet } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Fabriques de stats ---------- */

/** Un essai de la fenêtre : `ok` bonnes réponses sur `total` questions posées. */
const essai = (ok: number, total: number): EssaiRecent => ({ ok, total });
/** Une série complète de leçon (8 questions, taille des runners QCM) dont `ok` sont justes. */
const serie = (ok: number, total = 8): EssaiRecent => essai(ok, total);
/** Une question isolée croisée en sprint ou en révision espacée. */
const isolee = (ok: boolean): EssaiRecent => essai(ok ? 1 : 0, 1);

/** Stat dont la fenêtre est donnée sous la forme PONDÉRÉE ; les compteurs cumulés sont
    déduits de ces essais (leçon dont tout l'historique tient dans la fenêtre). */
function statFenetre(recents: EssaiRecent[]): LessonStat {
	const ok = recents.reduce((s, x) => s + x.ok, 0);
	const questions = recents.reduce((s, x) => s + x.total, 0);
	return {
		attempts: recents.length,
		correct: ok,
		questions,
		bestPct: 0,
		lastPct: 0,
		recents,
	};
}
/** Stat en ANCIENNE forme (un % par essai) : `parEssai` questions par essai, `essais`
    essais au compteur (par défaut ceux de la fenêtre). C'est de ces deux compteurs que
    la conversion doit déduire le poids d'un essai — la fenêtre, elle, n'en dit rien. */
function statLegacy(recentPct: number[], parEssai: number, essais = recentPct.length): LessonStat {
	return {
		attempts: essais,
		correct: 0, // sans objet : la fenêtre existe, donc aucun repli sur le cumul
		questions: essais * parEssai,
		bestPct: 0,
		lastPct: 0,
		recentPct,
	};
}
/** Donnée relue du STOCKAGE (JSON, non typée) : le cast est l'objet du test. */
const brut = <T>(v: unknown): T => v as T;

/* Tirage déterministe (LCG) : les invariants de bornage se cherchent sur des centaines
   de séquences, mais un test ne doit pas dépendre du hasard réel. */
function tirage(graine: number): () => number {
	let s = graine >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/* ============================================================
   1. essaisRecents — une seule forme en sortie, quelle que soit la donnée stockée
   ============================================================ */
describe('essaisRecents (forme pondérée à la lecture)', () => {
	it('aucune fenêtre (leçon neuve, donnée d’avant #234) → []', () => {
		expect(essaisRecents(undefined)).toEqual([]);
		expect(essaisRecents(statFenetre([]))).toEqual([]);
		expect(
			essaisRecents({ attempts: 2, correct: 8, questions: 16, bestPct: 50, lastPct: 50 }),
		).toEqual([]);
	});

	it('la forme pondérée est rendue telle quelle, et prime sur l’ancienne', () => {
		// Une stat portant les deux formes est un état de transition (jamais écrit par
		// l'appli) : la fenêtre qui fait foi est la nouvelle, sinon la conversion
		// ressusciterait des essais déjà remplacés.
		const s: LessonStat = { ...statLegacy([0, 0, 0], 8), recents: [serie(8), serie(7)] };
		expect(essaisRecents(s)).toEqual([serie(8), serie(7)]);
		expect(recentAvgPct(s)).toBe(94); // 15 justes sur 16 questions
	});

	it('valeur illisible en lieu et place de la fenêtre → traitée comme absente', () => {
		expect(essaisRecents(brut<LessonStat>({ ...statLegacy([50], 8), recents: null }))).toEqual([
			essai(4, 8),
		]);
		expect(essaisRecents(brut<LessonStat>({ ...statFenetre([]), recentPct: 'hier' }))).toEqual([]);
	});

	it('ancienne forme : chaque % redevient un couple, sur le nombre de questions par essai', () => {
		// 4 essais au compteur pour 40 questions = 10 questions par essai : 60 % de 10 = 6.
		expect(essaisRecents(statLegacy([60, 80], 10, 4))).toEqual([essai(6, 10), essai(8, 10)]);
		// L'estimation se lit sur TOUT l'historique, pas sur la seule fenêtre : 20 essais de 8.
		expect(essaisRecents(statLegacy([50, 100], 8, 20))).toEqual([essai(4, 8), essai(8, 8)]);
	});

	it('ancienne forme dégénérée : au moins une question par essai, jamais de division par zéro', () => {
		// Un essai enregistré a forcément posé une question ; une stat sans compteur cohérent
		// (import bancal, arrondi à 0) ne doit ni produire un essai de poids nul — invisible
		// dans une somme pondérée — ni un NaN qui contaminerait toute la moyenne.
		for (const s of [
			statLegacy([100, 0], 0, 4), // aucune question comptée
			statLegacy([100, 0], 8, 0), // aucun essai compté
			statLegacy([100, 0], 1, 40), // essais plus nombreux que les questions
		]) {
			const f = essaisRecents(s);
			expect(f, JSON.stringify(s)).toHaveLength(2);
			expect(f.every((x) => x.total >= 1 && Number.isFinite(x.ok))).toBe(true);
			expect(recentAvgPct(s)).toBe(50);
		}
	});
});

/* ============================================================
   2. Migration — le signal ne s'effondre pas au passage
   ============================================================ */
describe('migration de l’ancienne fenêtre (recentPct → essais pondérés)', () => {
	it('historique HOMOGÈNE : chaque essai est retrouvé À L’IDENTIQUE', () => {
		// Un % stocké vaut round(100 × ok / total) : tant que les essais d'une leçon ont la même
		// taille, l'estimation retrouve ce `total`, et l'arrondi est réversible (l'écart possible
		// sur `ok` vaut total/200 < 0,5 question). Donc AUCUNE perte pour la donnée réelle — c'est
		// ce qui autorise à convertir plutôt qu'à repartir de zéro.
		let cas = 0;
		for (let total = 1; total <= 20; total++) {
			for (let ok = 0; ok <= total; ok++) {
				const pct = Math.round((ok / total) * 100); // ce que l'appli avait écrit
				const s = statLegacy([pct, pct], total, 6);
				expect(essaisRecents(s), `${ok}/${total}`).toEqual([essai(ok, total), essai(ok, total)]);
				expect(recentAvgPct(s), `${ok}/${total}`).toBe(pct);
				cas++;
			}
		}
		expect(cas).toBeGreaterThan(200); // l'énumération n'est pas vide
	});

	it('historique HÉTÉROGÈNE : la moyenne reste dans l’épaisseur de l’arrondi', () => {
		// Séries de leçon et questions de sprint mêlées : l'estimation ne peut plus retrouver la
		// taille de chaque essai (elle vaut leur moyenne). L'approximation est assumée, mais elle
		// doit rester une approximation : la fenêtre convertie ne peut pas s'écarter de la moyenne
		// des % stockés de plus que l'arrondi ne le permet (0,5 question par essai, soit
		// 50/total points de %, plus l'arrondi final).
		const r = tirage(20260812);
		for (let n = 0; n < 400; n++) {
			const essais = 2 + Math.floor(r() * 4);
			const pcts = Array.from({ length: essais }, () => Math.floor(r() * 101));
			const parEssai = 1 + Math.floor(r() * 12);
			const s = statLegacy(pcts, parEssai, essais + Math.floor(r() * 20));
			const moyenneStockee = pcts.reduce((a, b) => a + b, 0) / pcts.length;
			const converti = recentAvgPct(s)!;
			const total = essaisRecents(s)[0].total;
			expect(converti, `${JSON.stringify(pcts)} × ${parEssai}q`).toBeLessThanOrEqual(
				moyenneStockee + 50 / total + 1,
			);
			expect(converti, `${JSON.stringify(pcts)} × ${parEssai}q`).toBeGreaterThanOrEqual(
				moyenneStockee - 50 / total - 1,
			);
			// Et l'ORDRE des essais est conservé : la fenêtre garde sa chronologie, dont dépend
			// la tendance.
			expect(essaisRecents(s).map((x) => x.ok)).toEqual(
				pcts.map((p) => Math.round((p / 100) * total)),
			);
		}
	});

	it('un profil migré retrouve la fenêtre qu’on écrirait AUJOURD’HUI pour le même parcours', () => {
		// Le risque de la migration, vu du parent : des niveaux qui basculent tous en même temps à
		// la mise à jour. On confronte donc deux chemins pour un MÊME parcours d'entraînement :
		// l'ancien (5 derniers % stockés, reconvertis) et le neuf (fenêtre construite essai par
		// essai). Sur des séries de 8 questions — la taille des runners QCM — les deux politiques
		// désignent les mêmes 5 essais (40 questions) : rien ne doit se perdre au passage.
		const parcours = [3, 5, 4, 6, 7, 8, 6, 8].map((ok) => serie(ok));
		let neuve: EssaiRecent[] = [];
		for (const e of parcours) neuve = ajouterEssaiRecent(neuve, e);
		expect(neuve).toHaveLength(5); // prémisse : 5 séries de 8 = la borne
		const ancienne = statLegacy(
			parcours.slice(-5).map((e) => Math.round((e.ok / e.total) * 100)),
			8,
			parcours.length,
		);
		expect(essaisRecents(ancienne)).toEqual(neuve);
		expect(recentAvgPct(ancienne)).toBe(recentAvgPct(statFenetre(neuve)));
		expect(niveauNotion(ancienne, false)).toBe(niveauNotion(statFenetre(neuve), false));
		expect(tendanceNotion(ancienne)).toBe(tendanceNotion(statFenetre(neuve)));
	});

	it('une fenêtre migrée plus large que la borne se resserre au prochain essai', () => {
		// Séries de 10 questions : les 5 % stockés en reconstituent 50, au-dessus de la borne.
		// L'excédent est transitoire — il ne doit pas s'installer, sinon le « récent » d'un profil
		// migré resterait durablement plus inerte que celui d'un profil neuf.
		const migre = statLegacy([50, 50, 50, 50, 50], 10);
		expect(questionsFenetre(migre)).toBe(50);
		lsSet(LESSON_STATS_KEY, { 'math-doubles@ce2': migre });
		recordLessonStats({ 'math-doubles': { ok: 10, total: 10 } });
		expect(questionsFenetre(loadLessonStats()['math-doubles'])).toBe(40);
	});
});

/* ============================================================
   3. ajouterEssaiRecent — bornage de la fenêtre EN QUESTIONS
   ============================================================ */
describe('ajouterEssaiRecent (bornage en questions)', () => {
	it('fenêtre vide → l’essai seul ; l’entrée n’est jamais mutée', () => {
		const fenetre: EssaiRecent[] = [serie(6)];
		const copie = JSON.parse(JSON.stringify(fenetre));
		expect(ajouterEssaiRecent([], serie(6))).toEqual([serie(6)]);
		const out = ajouterEssaiRecent(fenetre, isolee(true));
		expect(fenetre).toEqual(copie); // pure : la fenêtre reçue reste intacte
		expect(out).not.toBe(fenetre);
		expect(out[out.length - 1]).toEqual(isolee(true)); // le dernier essai est celui qu'on ajoute
	});

	it('la fenêtre couvre au moins 40 questions : 5 séries de 8 y tiennent, la 6e chasse la 1re', () => {
		let f: EssaiRecent[] = [];
		for (let i = 1; i <= 5; i++) f = ajouterEssaiRecent(f, serie(i));
		expect(f).toHaveLength(5);
		expect(f.reduce((s, x) => s + x.total, 0)).toBe(40); // 5 × 8 = pile la borne
		f = ajouterEssaiRecent(f, serie(6));
		expect(f).toEqual([serie(2), serie(3), serie(4), serie(5), serie(6)]);
		expect(f.reduce((s, x) => s + x.total, 0)).toBe(40); // toujours 40, jamais 32
	});

	it('40 questions isolées de sprint tiennent dans la fenêtre (elles ne valent pas 40 essais)', () => {
		let f: EssaiRecent[] = [];
		for (let i = 0; i < 45; i++) f = ajouterEssaiRecent(f, isolee(i % 2 === 0));
		expect(f.reduce((s, x) => s + x.total, 0)).toBe(40);
		expect(f).toHaveLength(40); // 40 essais d'une question : c'est bien la question qui borne
	});

	it('un essai plus gros que la borne n’est jamais retiré seul', () => {
		// Sinon la fenêtre pourrait se retrouver VIDE et la leçon perdre tout état récent.
		const gros = essai(30, 50);
		expect(ajouterEssaiRecent([], gros)).toEqual([gros]);
		// Il tient tant que 40 questions ne l'ont pas suivi…
		let f = ajouterEssaiRecent([], gros);
		for (let i = 0; i < 4; i++) f = ajouterEssaiRecent(f, serie(8)); // 32 questions après lui
		expect(f[0]).toEqual(gros);
		// …et sort dès que ce qui suit se suffit à lui-même.
		f = ajouterEssaiRecent(f, serie(8)); // 40 questions après lui
		expect(f).toEqual([serie(8), serie(8), serie(8), serie(8), serie(8)]);
	});

	it('INVARIANTS sur des centaines de séquences d’essais mêlés', () => {
		// Ce qui doit rester vrai quelle que soit l'alternance série / sprint / révision :
		// la fenêtre est un SUFFIXE de l'historique (rien ne se réordonne, rien ne se perd au
		// milieu), elle couvre au moins 40 questions dès qu'elles existent, et elle ne les
		// accumule pas sans fin (sans quoi le « récent » finirait par valoir le cumul).
		const TAILLES = [1, 1, 1, 2, 6, 8, 8, 10, 14]; // ce que les runners et le sprint produisent
		const r = tirage(541);
		for (let n = 0; n < 300; n++) {
			const historique: EssaiRecent[] = [];
			let f: EssaiRecent[] = [];
			const longueur = 1 + Math.floor(r() * 30);
			for (let i = 0; i < longueur; i++) {
				const total = TAILLES[Math.floor(r() * TAILLES.length)];
				const e = essai(Math.floor(r() * (total + 1)), total);
				historique.push(e);
				f = ajouterEssaiRecent(f, e);
				const etiquette = `graine 541, séquence ${n}, essai ${i}`;
				const cumul = f.reduce((s, x) => s + x.total, 0);
				const tout = historique.reduce((s, x) => s + x.total, 0);
				expect(f, etiquette).toEqual(historique.slice(historique.length - f.length));
				expect(f.length, etiquette).toBeGreaterThanOrEqual(1);
				expect(cumul, etiquette).toBeGreaterThanOrEqual(Math.min(FENETRE_QUESTIONS, tout));
				if (f.length > 1) expect(cumul - f[0].total, etiquette).toBeLessThan(FENETRE_QUESTIONS);
			}
		}
	});
});

/* ============================================================
   4. recentAvgPct / perfRecente — pondération et échantillon
   ============================================================ */
describe('recentAvgPct (bonnes réponses sur questions posées)', () => {
	it('LE BIAIS CORRIGÉ : une série parfaite + une question de sprint ratée = 89 %, pas 50 %', () => {
		// 8 justes sur 9 questions posées. La moyenne non pondérée des deux essais (100 % et 0 %)
		// annonçait 50 % : sous le seuil « à revoir », la leçon repartait dans la file de l'enfant.
		const s = statFenetre([serie(8), isolee(false)]);
		expect(recentAvgPct(s)).toBe(89);
		expect(estNotionSolide(false, recentAvgPct(s))).toBe(true);
		expect(89).toBeGreaterThanOrEqual(SEUIL_REVOIR); // prémisse du raisonnement ci-dessus
	});

	it('une question isolée ne pèse que 1/40 : dix séries parfaites ne s’effacent pas', () => {
		let f: EssaiRecent[] = [];
		for (let i = 0; i < 10; i++) f = ajouterEssaiRecent(f, serie(8));
		f = ajouterEssaiRecent(f, isolee(false));
		expect(recentAvgPct(statFenetre(f))).toBe(98); // 40 justes sur 41 questions
	});

	it('null sans fenêtre ; arrondi à l’entier', () => {
		expect(recentAvgPct(undefined)).toBeNull();
		expect(recentAvgPct(statFenetre([]))).toBeNull();
		expect(recentAvgPct(statFenetre([essai(2, 3)]))).toBe(67);
		expect(recentAvgPct(statFenetre([essai(0, 8), essai(0, 1)]))).toBe(0);
	});
});

describe('perfRecente (performance ET taille de l’échantillon)', () => {
	it('fenêtre présente : le % pondéré et les questions qui le portent', () => {
		expect(perfRecente(statFenetre([serie(6), isolee(true), isolee(false)]))).toEqual({
			pct: 70, // 7 justes sur 10 questions
			questions: 10,
		});
	});

	it('fenêtre vide (donnée d’avant #234) : repli sur le cumul, échantillon = tout l’historique', () => {
		expect(
			perfRecente({ attempts: 3, correct: 6, questions: 24, bestPct: 50, lastPct: 25 }),
		).toEqual({ pct: 25, questions: 24 });
	});

	it('jamais travaillée → null (et pas 0 %, qui se lirait comme un échec)', () => {
		expect(perfRecente(undefined)).toBeNull();
		expect(
			perfRecente({ attempts: 0, correct: 0, questions: 0, bestPct: 0, lastPct: 0 }),
		).toBeNull();
	});

	it('accord avec questionsFenetre, fenêtre bornée comprise', () => {
		let f: EssaiRecent[] = [];
		for (let i = 0; i < 12; i++) f = ajouterEssaiRecent(f, serie(4));
		const s = statFenetre(f);
		expect(questionsFenetre(s)).toBe(40);
		expect(perfRecente(s)).toEqual({ pct: 50, questions: 40 });
	});

	it('son `pct` dit EXACTEMENT « perf récente, sinon cumul » — sur toutes les formes de stat', () => {
		// L'espace encadrant lisait ce repli à la main en trois endroits (`recentAvgPct(s) ??
		// lessonAvgPct(s)`) ; il passe désormais par `perfRecente`. Le refactor n'a le droit de
		// rien changer : on confronte les deux écritures sur chaque forme de donnée, y compris
		// celles où l'une des deux sources est absente.
		const formes: (LessonStat | undefined)[] = [
			undefined,
			{ attempts: 0, correct: 0, questions: 0, bestPct: 0, lastPct: 0 }, // jamais travaillée
			{ attempts: 2, correct: 6, questions: 20, bestPct: 50, lastPct: 20 }, // d'avant #234
			{ attempts: 1, correct: 0, questions: 8, bestPct: 0, lastPct: 0 }, // cumul à 0 %
			statFenetre([serie(6), isolee(false)]),
			statFenetre([]), // fenêtre vide ET aucun cumul
			{ ...statFenetre([]), attempts: 3, correct: 9, questions: 30 }, // fenêtre vidée, cumul présent
			statLegacy([50, 80], 10, 4), // ancienne forme, convertie
		];
		for (const s of formes)
			expect(perfRecente(s)?.pct ?? null, JSON.stringify(s)).toBe(
				recentAvgPct(s) ?? lessonAvgPct(s),
			);
	});

	it('le repli du cumul arrive bien jusqu’à la ligne de l’espace encadrant', () => {
		// Seule sortie observable du refactor ci-dessus : `pctRecent`, lu par la vue du parent.
		// Stat d'avant la fenêtre glissante → c'est le cumul (8/10) qui doit s'afficher.
		const p = activeProfile();
		lsSet(LESSON_STATS_KEY, {
			'math-doubles@ce2': { attempts: 1, correct: 8, questions: 10, bestPct: 80, lastPct: 80 },
		});
		const lignes = progressionProfil(p, Date.now()).parCategorie.flatMap((c) => c.lecons);
		expect(lignes.find((l) => l.lessonId === 'math-doubles')!.pctRecent).toBe(80);
		// Et une leçon jamais travaillée n'affiche AUCUN pourcentage (pas un 0 % trompeur).
		expect(lignes.find((l) => l.lessonId === 'math-moities')!.pctRecent).toBeNull();
	});
});

/* ============================================================
   5. niveauNotion — plancher d'échantillon avant d'annoncer « à renforcer »
   ============================================================ */
describe('niveauNotion (plancher d’échantillon pour l’état BAS)', () => {
	it('une série complète COURTE ratée doit pouvoir dire « à renforcer »', () => {
		// La plus petite série de l'appli fait 6 questions (lecon-ordre, lecon-tri,
		// lecon-qcm-multi) : masquer une série complète cacherait une vraie difficulté.
		// C'est cette exigence qui borne le plancher par le haut, pas l'inverse.
		expect(MIN_QUESTIONS_ETAT_BAS).toBeLessThanOrEqual(6);
		expect(niveauNotion(statFenetre([essai(1, 6)]), false)).toBe('non-acquis'); // 17 %
	});

	it('deux questions isolées ratées ne suffisent PAS à l’annoncer', () => {
		// Le parent ne doit pas lire « à renforcer » sur la foi de deux items croisés en sprint.
		expect(MIN_QUESTIONS_ETAT_BAS).toBeGreaterThan(2);
		expect(niveauNotion(statFenetre([isolee(false), isolee(false)]), false)).toBe('en-cours');
	});

	it('le plancher regarde les QUESTIONS, pas les essais (cinq échecs isolés restent muets)', () => {
		const cinq = statFenetre([
			isolee(false),
			isolee(false),
			isolee(false),
			isolee(false),
			isolee(false),
		]);
		expect(questionsFenetre(cinq)).toBe(5);
		expect(niveauNotion(cinq, false)).toBe('en-cours');
		// La 6e question franchit le plancher : l'état se prononce enfin.
		expect(niveauNotion(statFenetre([...essaisRecents(cinq), isolee(false)]), false)).toBe(
			'non-acquis',
		);
	});

	it('LE BIAIS CORRIGÉ : une série moyenne puis une question ratée ne redescend plus d’un cran', () => {
		// 5 justes sur 8 (63 %) puis 0/1 en sprint = 5 justes sur 9 questions = 56 % : la leçon
		// reste « en cours ». La moyenne non pondérée des deux essais donnait 31 %, donc
		// « à renforcer » — puis « en cours » à l'essai suivant. Le parent lisait une régression
		// qui n'en était pas une.
		const s = statFenetre([serie(5), isolee(false)]);
		expect(recentAvgPct(s)).toBe(56);
		expect(56).toBeGreaterThanOrEqual(SEUIL_NON_ACQUIS);
		expect(niveauNotion(s, false)).toBe('en-cours');
	});

	it('mais une leçon réellement faible reste « à renforcer » (la pondération ne masque rien)', () => {
		expect(niveauNotion(statFenetre([serie(2), isolee(false)]), false)).toBe('non-acquis'); // 2/9
		expect(niveauNotion(statFenetre([serie(1), serie(3), serie(2)]), false)).toBe('non-acquis');
	});

	it('le verrou de l’étoile est inchangé : acquis même sur une fenêtre entièrement ratée', () => {
		let f: EssaiRecent[] = [];
		for (let i = 0; i < 5; i++) f = ajouterEssaiRecent(f, serie(0));
		expect(niveauNotion(statFenetre(f), true)).toBe('acquis');
		expect(niveauNotion(undefined, true)).toBe('acquis');
	});

	it('jamais travaillée → à découvrir, quel que soit le plancher', () => {
		expect(niveauNotion(undefined, false)).toBe('a-decouvrir');
		expect(
			niveauNotion({ attempts: 0, correct: 0, questions: 0, bestPct: 0, lastPct: 0 }, false),
		).toBe('a-decouvrir');
	});

	it('repli sur le cumul : l’échantillon est alors tout l’historique de la leçon', () => {
		// Donnée d'avant la fenêtre glissante : 1 juste sur 20 questions, c'est assez de matière.
		expect(
			niveauNotion({ attempts: 2, correct: 1, questions: 20, bestPct: 10, lastPct: 0 }, false),
		).toBe('non-acquis');
		// Mais un historique de 3 questions ne l'est pas, même à 0 % — le plancher s'applique
		// aussi au repli, sinon la prudence dépendrait de l'âge de la donnée.
		expect(
			niveauNotion({ attempts: 1, correct: 0, questions: 3, bestPct: 0, lastPct: 0 }, false),
		).toBe('en-cours');
	});

	it('« à revoir » reste plus réactif que le mot d’état (parti pris assumé)', () => {
		// Le plancher ne protège que l'état AFFICHÉ : la file de l'enfant, elle, a le droit de
		// réagir sur deux questions ratées (elle ne fait que proposer une révision).
		const deuxRatees = statFenetre([isolee(false), isolee(false)]);
		expect(niveauNotion(deuxRatees, false)).toBe('en-cours');
		expect(estNotionSolide(false, recentAvgPct(deuxRatees))).toBe(false);
	});
});

/* ============================================================
   6. tendanceNotion — moitiés comptées en questions
   ============================================================ */
describe('tendanceNotion (moitiés de QUESTIONS)', () => {
	it('silence sous 24 questions, signal dès qu’elles y sont (off-by-one de la borne)', () => {
		expect(tendanceNotion(undefined)).toBeNull();
		expect(TENDANCE_MIN_QUESTIONS).toBe(24);
		// Deux séries de 8 et une de 7 = 23 questions : rien ne se dit encore…
		expect(tendanceNotion(statFenetre([serie(8), serie(8), serie(0, 7)]))).toBeNull();
		// …la même chute sur 24 questions se dit (100 % puis 50 % sur la 2de moitié).
		expect(tendanceNotion(statFenetre([serie(8), serie(8), serie(0)]))).toBe('a-relancer');
	});

	it('un essai UNIQUE ne se compare à rien, même très gros', () => {
		expect(tendanceNotion(statFenetre([essai(4, 40)]))).toBeNull();
		expect(questionsFenetre(statFenetre([essai(4, 40)]))).toBeGreaterThan(TENDANCE_MIN_QUESTIONS);
	});

	it('progresse / stable / à relancer sur quatre séries de 8', () => {
		// Moitiés de 16 questions : 1re = essais 1-2, 2de = essais 3-4.
		expect(tendanceNotion(statFenetre([serie(4), serie(5), serie(7), serie(8)]))).toBe('progresse'); // 56 % → 94 %
		expect(tendanceNotion(statFenetre([serie(8), serie(7), serie(3), serie(2)]))).toBe(
			'a-relancer',
		); // 94 % → 31 %
		expect(tendanceNotion(statFenetre([serie(6), serie(7), serie(6), serie(7)]))).toBe('stable'); // 81 % → 81 %
		expect(tendanceNotion(statFenetre([serie(7), serie(7), serie(7), serie(6)]))).toBe('stable'); // −6 pts
	});

	it('LE BIAIS CORRIGÉ : une question isolée ratée ne renverse pas une tendance stable', () => {
		// Quatre séries à 6/8 puis une question ratée en sprint. Pondérée, la 2de moitié perd
		// 4 points : rien n'a bougé. Comptée en essais, cette question formait à elle seule un
		// tiers de la 2de moitié (75 % → 50 %) et allumait « à relancer » — une fausse alerte.
		const stable = statFenetre([serie(6), serie(6), serie(6), serie(6), isolee(false)]);
		expect(tendanceNotion(stable)).toBe('stable');
		// Le signal n'est pas muselé pour autant : huit questions isolées ratées, c'est un vrai
		// décrochage, et il se dit (2de moitié à 50 %).
		const decroche = statFenetre([
			serie(6),
			serie(6),
			serie(6),
			serie(6),
			...Array.from({ length: 8 }, () => isolee(false)),
		]);
		expect(tendanceNotion(decroche)).toBe('a-relancer');
	});

	it('un premier essai plus gros que la moitié forme la 1re moitié à lui seul', () => {
		// La 1re moitié n'est jamais vide : sinon sa performance partirait de 0 % et la tendance
		// dirait « progresse » dès qu'un gros essai ouvre la fenêtre — même après une chute
		// franche, comme ici (20/20 puis 5/16).
		const chute = statFenetre([essai(20, 20), serie(2), serie(3)]);
		expect(tendanceNotion(chute)).toBe('a-relancer');
		// Et le cas symétrique reste bien lu comme une progression.
		expect(tendanceNotion(statFenetre([essai(0, 20), serie(8), serie(8)]))).toBe('progresse');
	});

	it('la coupe tombe au plus PRÈS de la moitié, pas juste en dessous', () => {
		// Fenêtre [1, 15, 15] : couper après le 1er essai comparerait UNE question à trente, et la
		// direction se déciderait sur cette seule question isolée — le bruit même que ces seuils
		// existent pour taire. La coupe au plus près compare 16 questions à 15.
		// Ici les deux lectures s'opposent : 1/1 puis 3/15 puis 15/15.
		// Au plus près : (1+3)/16 = 25 % → 15/15 = 100 %, donc une progression franche.
		// Juste en dessous : 1/1 = 100 % → 18/30 = 60 %, donc « à relancer » — sur une question.
		expect(tendanceNotion(statFenetre([isolee(true), essai(3, 15), essai(15, 15)]))).toBe(
			'progresse',
		);
	});

	it('à écart égal, la coupe la plus PRÉCOCE gagne', () => {
		// Trois séries de 8 : couper après la 1re ou après la 2de s'écarte autant de la moitié
		// (8 et 16 questions contre 12). Le partage retenu est le premier, donc la 1re série
		// forme la référence — ce qui s'observe ici, les deux lectures s'opposant :
		// après la 1re → 100 % contre 8/16 = 50 % ; après la 2de → 8/16 = 50 % contre 100 %.
		expect(tendanceNotion(statFenetre([serie(8), serie(0), serie(8)]))).toBe('a-relancer');
	});

	it('une MOITIÉ trop maigre fait taire la tendance, même quand le total suffit', () => {
		// Le total peut atteindre les 24 questions sans que la comparaison ait un sens : une
		// question isolée puis une longue série n'offre aucun autre partage que 1 contre 30.
		expect(tendanceNotion(statFenetre([isolee(true), essai(9, 30)]))).toBeNull();
		expect(questionsFenetre(statFenetre([isolee(true), essai(9, 30)]))).toBeGreaterThanOrEqual(
			TENDANCE_MIN_QUESTIONS,
		);
		// Une moitié doit pouvoir se réduire à UNE série pleine (les runners en posent 6 à 8),
		// sinon la tendance se tairait sur des parcours normaux ; une question isolée, non.
		expect(TENDANCE_MIN_MOITIE).toBeLessThanOrEqual(8);
		expect(TENDANCE_MIN_MOITIE).toBeGreaterThan(1);
		// Borne exacte, dérivée du seuil : la plus petite moitié admise parle, une question de
		// moins se tait. Fenêtre à deux essais, donc un seul partage possible.
		const m = TENDANCE_MIN_MOITIE;
		expect(tendanceNotion(statFenetre([essai(m, m), essai(0, TENDANCE_MIN_QUESTIONS)]))).toBe(
			'a-relancer',
		);
		expect(
			tendanceNotion(statFenetre([essai(m - 1, m - 1), essai(0, TENDANCE_MIN_QUESTIONS)])),
		).toBeNull();
	});

	it('INVARIANTS sur des centaines de fenêtres PARFAITES : jamais de faux mouvement', () => {
		// Une fenêtre entièrement réussie ne progresse ni ne recule : tout verdict autre que
		// « stable » y trahirait une moitié vide ou mal mesurée (la comparaison partirait de 0 %).
		// Et un verdict ne s'énonce que sur assez de matière : au total, ET sur un partage dont
		// les deux moitiés atteignent le plancher — condition écrite ici par recherche de TOUS
		// les partages possibles, sans reprendre la façon dont le code choisit le sien.
		const TAILLES = [1, 1, 2, 6, 8, 10, 20, 30];
		const r = tirage(4321);
		let verdicts = 0;
		let silences = 0;
		for (let n = 0; n < 500; n++) {
			const parfaite: EssaiRecent[] = [];
			const longueur = 2 + Math.floor(r() * 6);
			for (let i = 0; i < longueur; i++) {
				const total = TAILLES[Math.floor(r() * TAILLES.length)];
				parfaite.push(essai(total, total));
			}
			const s = statFenetre(parfaite);
			const q = questionsFenetre(s);
			const t = tendanceNotion(s);
			const etiquette = parfaite.map((x) => x.total).join('+');
			// Un partage acceptable existe-t-il ?
			let partageable = false;
			let cumul = 0;
			for (let i = 0; i < parfaite.length - 1; i++) {
				cumul += parfaite[i].total;
				if (Math.min(cumul, q - cumul) >= TENDANCE_MIN_MOITIE) partageable = true;
			}
			expect(t === 'progresse' || t === 'a-relancer', etiquette).toBe(false);
			if (t === null) silences++;
			else {
				expect(q, etiquette).toBeGreaterThanOrEqual(TENDANCE_MIN_QUESTIONS);
				expect(partageable, etiquette).toBe(true);
				verdicts++;
			}
			if (q < TENDANCE_MIN_QUESTIONS || !partageable) expect(t, etiquette).toBeNull();
		}
		expect(verdicts).toBeGreaterThan(100); // les deux branches sont parcourues
		expect(silences).toBeGreaterThan(20);
	});
});

/* ============================================================
   7. recordLessonStats — écriture de la fenêtre, de bout en bout
   ============================================================ */
describe('recordLessonStats (écriture de la fenêtre)', () => {
	const STAT = () => loadLessonStats()['math-doubles'];

	it('écrit la forme pondérée et RETIRE l’ancienne (une seule source de vérité)', () => {
		recordLessonStats({ 'math-doubles': { ok: 6, total: 8 } });
		recordLessonStats({ 'math-doubles': { ok: 1, total: 1 } }); // une question en sprint
		expect(STAT().recents).toEqual([essai(6, 8), essai(1, 1)]);
		expect(STAT().recentPct).toBeUndefined();
		expect(STAT()).not.toHaveProperty('recentPct');
		expect(recentAvgPct(STAT())).toBe(78); // 7 justes sur 9 questions
	});

	it('borne à 40 questions, alors que les compteurs cumulés gardent tout', () => {
		for (let i = 0; i < 9; i++) recordLessonStats({ 'math-doubles': { ok: 8, total: 10 } });
		expect(questionsFenetre(STAT())).toBe(40); // 4 essais de 10 seulement
		expect(STAT().recents).toHaveLength(4);
		expect(STAT().attempts).toBe(9);
		expect(STAT().questions).toBe(90);
	});

	it('une stat ANCIENNE est convertie AVANT que l’essai en cours ne fausse l’estimation', () => {
		// Historique stocké : 4 essais, 48 questions → 12 questions par essai. Si la conversion
		// avait lieu APRÈS la mise à jour des compteurs, elle lirait 49/5 ≈ 10 et la fenêtre
		// migrée perdrait 8 questions — l'essai en cours (1 question) tirant l'estimation vers
		// sa propre taille.
		lsSet(LESSON_STATS_KEY, {
			'math-doubles@ce2': {
				attempts: 4,
				correct: 48,
				questions: 48,
				bestPct: 100,
				lastPct: 100,
				recentPct: [100, 100, 100, 100],
			},
		});
		recordLessonStats({ 'math-doubles': { ok: 0, total: 1 } }); // question ratée en sprint
		expect(STAT().attempts).toBe(5); // prémisse : l'historique a bien été retrouvé (clé @ce2)
		expect(STAT().recents).toEqual([
			essai(12, 12),
			essai(12, 12),
			essai(12, 12),
			essai(12, 12),
			essai(0, 1),
		]);
		expect(questionsFenetre(STAT())).toBe(49);
		// Et l'état affiché ne bascule pas : 48 justes sur 49 questions.
		expect(recentAvgPct(STAT())).toBe(98);
		expect(niveauNotion(STAT(), false)).toBe('en-cours');
	});

	it('une leçon croisée en sprint pour UNE question garde son état', () => {
		// Le scénario de production : leçon travaillée en série, puis rencontrée une seule fois
		// dans un sprint où l'enfant se trompe.
		recordLessonStats({ 'math-doubles': { ok: 8, total: 8 } });
		expect(niveauNotion(STAT(), false)).toBe('en-cours');
		expect(estNotionSolide(false, recentAvgPct(STAT()))).toBe(true);
		recordLessonStats({ 'math-doubles': { ok: 0, total: 1 } }, 'sprint');
		expect(recentAvgPct(STAT())).toBe(89);
		expect(niveauNotion(STAT(), false)).toBe('en-cours');
		expect(estNotionSolide(false, recentAvgPct(STAT()))).toBe(true); // pas re-proposée « à revoir »
	});

	it('les items de révision espacée alimentent la fenêtre sans la déformer', () => {
		// La révision rejoue ~un item par leçon (cf. src/ui/revision.ts) : c'est justement ce que
		// la fenêtre en questions permet d'injecter. Cinq séances ratées sur une leçon acquise
		// pèsent 5 questions sur 45, pas cinq essais sur cinq.
		for (let i = 0; i < 5; i++) recordLessonStats({ 'math-doubles': { ok: 8, total: 8 } });
		for (let i = 0; i < 5; i++)
			recordLessonStats({ 'math-doubles': { ok: 0, total: 1 } }, 'revision');
		expect(questionsFenetre(STAT())).toBe(45); // 5 séries + 5 items
		expect(recentAvgPct(STAT())).toBe(89);
		expect(niveauNotion(STAT(), false)).toBe('en-cours');
		// Le signal existe quand même : la leçon n'est plus « solide » (rappels différés ratés).
		expect(tendanceNotion(STAT())).toBe('a-relancer');
	});

	it('plusieurs leçons dans la même session : chaque fenêtre reçoit SON essai', () => {
		recordLessonStats(
			{ 'math-doubles': { ok: 8, total: 8 }, 'math-moities': { ok: 0, total: 1 } },
			'sprint',
		);
		const stats = loadLessonStats();
		expect(stats['math-doubles'].recents).toEqual([essai(8, 8)]);
		expect(stats['math-moities'].recents).toEqual([essai(0, 1)]);
	});

	it('une leçon sans question (total 0) n’entre pas dans la fenêtre', () => {
		recordLessonStats({ 'math-doubles': { ok: 0, total: 0 } });
		expect(STAT()).toBeUndefined();
		// Un essai à poids nul serait invisible dans une somme pondérée : il ne doit pas exister.
		recordLessonStats({ 'math-doubles': { ok: 4, total: 8 } });
		recordLessonStats({ 'math-doubles': { ok: 0, total: 0 } });
		expect(STAT().recents).toEqual([essai(4, 8)]);
		expect(STAT().attempts).toBe(1);
	});
});
