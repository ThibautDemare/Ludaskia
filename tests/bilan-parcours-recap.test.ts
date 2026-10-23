/* ============================================================
   Parcours de bilan (#777) : récapitulatif, phrases à compteur, règle des 60 %,
   répartition des questions en parties et ordre des leçons.
   Logique pure de `src/core/bilan-parcours.ts`.

   Complète `bilan-parcours.test.ts` (verdict, découpage `planifierParties`, tirage,
   correction), sans le recopier. Attendus tirés de :
   - la spécification de rendu arrêtée, §6 (phrases exactes : « 1 réussite », « Tu as
     réussi 6 leçons sur 9. », « Tu as essayé 1 leçon. On la reprend. »…) ;
   - l'issue #777 : critère 10 (une question passée est une erreur, la règle actuelle des
     60 % de réponses s'applique), critère 13 (N = questions réellement posées, ordre
     Réussi → Presque → À retravailler, aucun pourcentage), critère 8 (ordre du catalogue,
     une leçon jamais coupée, une partie = une catégorie) ;
   - #772 : l'écran d'une catégorie s'affiche dans la classe CHOISIE, sinon dans celle
     que suit sa matière ; « l'ordre du catalogue » est celui de cet écran.

   La règle des 60 % est recalculée en arithmétique ENTIÈRE (5 × répondues ≥ 3 × N),
   jamais en recopiant la fonction. Les tirages aléatoires passent par `withSeed`.

   Hors de portée : le rendu (écrans A, B, C) et le crédit unique (N4), tenus par
   `e2e/bilan-parcours.spec.ts` et `e2e/bilan-parcours-suivi.spec.ts`.
   ============================================================ */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	assezDeReponses,
	leconsDuBilan,
	libellePartieSur,
	libellePartieTerminee,
	libelleQuestionSur,
	libelleReussites,
	libelleScore,
	libelleScoreLu,
	libelleSeuilNonAtteint,
	libelleTotalRecap,
	minimumReponses,
	PLAFOND_PARTIE,
	questionsDuBilan,
	repartirEnParties,
	syntheseParLecon,
	trierParVerdict,
	type BilanLecon,
	type VerdictLecon,
} from '../src/core/bilan-parcours';
import {
	CATEGORIES,
	getLessonById,
	getLessonsByCategory,
	type LessonDef,
} from '../src/core/catalog';
import type { QuestionRevision } from '../src/core/revision-question';
import { initProfiles, setNiveauReference, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { choisirClasse, leverClasseChoisie } from '../src/core/niveau-actif';
import { rnd, withSeed } from '../src/core/utils';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	leverClasseChoisie();
});
afterEach(() => leverClasseChoisie());

/* ---------- Outils ---------- */

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon ${id} absente du catalogue`);
	return l;
};

/** Texte lu : toute suite d'espaces (insécables comprises) vaut une espace. La spec
    laisse l'espace avant « ! » à la convention du projet : on n'en fige pas la nature. */
const lu = (s: string): string => s.replace(/\s+/g, ' ').trim();

/* Une vraie question de révision ; seul son `lessonId` compte pour la synthèse et la
   répartition, qui ne lisent pas le contenu. */
const MODELE: QuestionRevision = withSeed(1, () =>
	questionsDuBilan(lecon('math-complements'), 1, 'ce2'),
)[0];
const q = (lessonId: string): QuestionRevision => ({ ...MODELE, lessonId });

/** Oracle du critère 13, du texte de l'issue, en arithmétique entière. */
function verdictAttendu(reussies: number, posees: number): VerdictLecon {
	if (posees <= 3) return reussies === posees ? 'reussi' : 'a-retravailler';
	if (5 * reussies >= 4 * posees) return 'reussi';
	if (2 * reussies < posees) return 'a-retravailler';
	return 'presque';
}

/** Oracle de la règle des 60 % (critère 10, « règle actuelle » de la fiche) : au moins
    60 % des questions ont une réponse, soit 5 × répondues ≥ 3 × N ; un bilan vide ne
    compte pas. */
const compteAttendu = (repondues: number, total: number): boolean =>
	total > 0 && 5 * repondues >= 3 * total;

const JUSTE = { reussi: true, repondue: true };
const FAUSSE = { reussi: false, repondue: true };
const PASSEE = { reussi: false, repondue: false };

/* ============================================================
   Phrases à compteur (spécification de rendu, §6)
   ============================================================ */

describe('Phrases à compteur du parcours (spec de rendu §6)', () => {
	it('réussites d’une partie : « Aucune réussite cette fois », « 1 réussite », « 2 réussites », « 7 réussites »', () => {
		expect(libelleReussites(0)).toBe('Aucune réussite cette fois');
		expect(libelleReussites(1)).toBe('1 réussite');
		expect(libelleReussites(2)).toBe('2 réussites');
		expect(libelleReussites(7)).toBe('7 réussites');
	});

	it('réussites, de 0 à 200 : jamais « 0 réussite », jamais « 1 réussites », le pluriel dès 2', () => {
		for (let n = 0; n <= 200; n++) {
			const t = libelleReussites(n);
			expect(t, `${n}`).not.toMatch(/\b0 réussite/);
			expect(t, `${n}`).not.toMatch(/\b1 réussites/);
			if (n >= 2) expect(t, `${n}`).toBe(`${n} réussites`);
		}
	});

	it('récapitulatif, une partie des leçons réussie : « Tu as réussi 6 leçons sur 9. », singulier à 1', () => {
		expect(lu(libelleTotalRecap(6, 9))).toBe('Tu as réussi 6 leçons sur 9.');
		expect(lu(libelleTotalRecap(1, 9))).toBe('Tu as réussi 1 leçon sur 9.');
		expect(lu(libelleTotalRecap(1, 2))).toBe('Tu as réussi 1 leçon sur 2.');
		expect(lu(libelleTotalRecap(2, 3))).toBe('Tu as réussi 2 leçons sur 3.');
	});

	it('récapitulatif, tout réussi (n sur n) : « Tu as réussi les 9 leçons. Bravo ! »', () => {
		expect(lu(libelleTotalRecap(9, 9))).toBe('Tu as réussi les 9 leçons. Bravo !');
		expect(lu(libelleTotalRecap(2, 2))).toBe('Tu as réussi les 2 leçons. Bravo !');
	});

	it('récapitulatif, tout réussi sur UNE leçon : ni « les 1 leçons » ni pluriel, et toujours « Bravo ! »', () => {
		// La spec ne donne que le cas « les 9 leçons » ; appliqué tel quel à N = 1 il
		// produirait « Tu as réussi les 1 leçons. ». Exigence : une phrase au singulier qui
		// félicite, quelle qu'en soit la tournure.
		const t = lu(libelleTotalRecap(1, 1));
		expect(t).toMatch(/^Tu as réussi /);
		expect(t).toMatch(/ Bravo !$/);
		expect(t).not.toMatch(/leçons/);
		expect(t).not.toMatch(/\bles 1\b/);
	});

	it('récapitulatif, aucune leçon réussie : on dit l’effort et la suite, au singulier pour une seule', () => {
		expect(lu(libelleTotalRecap(0, 9))).toBe('Tu as essayé 9 leçons. On les reprend une par une.');
		expect(lu(libelleTotalRecap(0, 2))).toBe('Tu as essayé 2 leçons. On les reprend une par une.');
		expect(lu(libelleTotalRecap(0, 1))).toBe('Tu as essayé 1 leçon. On la reprend.');
	});

	it('récapitulatif, toute la grille 0 ≤ r ≤ N ≤ 40 : accords, « Bravo » seulement si tout est réussi, aucun pourcentage', () => {
		const fautes: string[] = [];
		for (let total = 1; total <= 40; total++) {
			for (let r = 0; r <= total; r++) {
				const t = lu(libelleTotalRecap(r, total));
				const dit = (cond: boolean, defaut: string) => {
					if (cond) fautes.push(`(${r}, ${total}) « ${t} » : ${defaut}`);
				};
				dit(/%/.test(t), 'pourcentage');
				dit(/\b1 leçons\b/.test(t), '« 1 leçons »');
				dit(/\b0 leçon/.test(t), '« 0 leçon »');
				dit(/\bles 1\b/.test(t), '« les 1 »');
				dit(/\b([2-9]|\d{2,}) leçon\b/.test(t), 'singulier après 2 ou plus');
				dit(r === 0 && /réussi/.test(t), 'dit « réussi » sans aucune réussite');
				dit(/Bravo/.test(t) !== (r === total), '« Bravo » hors du cas « tout réussi »');
				if (r > 0 && r < total)
					dit(!t.includes(`${r} leçon`) || !t.includes(`sur ${total}`), 'r ou N manquant');
				if (!(r === total && total === 1)) dit(!t.includes(String(total)), 'N absent');
			}
		}
		expect(fautes).toEqual([]);
	});

	it('score d’une leçon : « 4 sur 5 » à l’œil, « 4 questions réussies sur 5 » à l’oreille, accordé', () => {
		expect(libelleScore(4, 5)).toBe('4 sur 5');
		expect(libelleScore(0, 3)).toBe('0 sur 3');
		expect(lu(libelleScoreLu(4, 5))).toBe('4 questions réussies sur 5');
		expect(lu(libelleScoreLu(5, 5))).toBe('5 questions réussies sur 5');
		expect(lu(libelleScoreLu(2, 5))).toBe('2 questions réussies sur 5');
		expect(lu(libelleScoreLu(1, 5))).toBe('1 question réussie sur 5');
		expect(lu(libelleScoreLu(1, 1))).toBe('1 question réussie sur 1');
		// Zéro : au singulier, jamais « 0 questions réussies ».
		const zero = lu(libelleScoreLu(0, 5));
		expect(zero).toMatch(/question réussie sur 5$/);
		expect(zero).not.toMatch(/questions|réussies/);
	});

	it('score, 0 ≤ r ≤ N ≤ 30 : la version lue dit le même score que la version vue', () => {
		for (let total = 1; total <= 30; total++) {
			for (let r = 0; r <= total; r++) {
				const vu = libelleScore(r, total);
				const entendu = lu(libelleScoreLu(r, total));
				expect(vu, `${r}/${total}`).toBe(`${r} sur ${total}`);
				expect(entendu, `${r}/${total}`).toMatch(new RegExp(` sur ${total}$`));
				if (r > 0) expect(entendu, `${r}/${total}`).toMatch(new RegExp(`^${r} question`));
				if (r >= 2) expect(entendu, `${r}/${total}`).toMatch(/questions réussies/);
			}
		}
	});

	it('en-tête et fin de partie : « Partie 2 sur 3 », « Question 4 sur 12 », « Partie 2 terminée »', () => {
		expect(libellePartieSur(2, 3)).toBe('Partie 2 sur 3');
		expect(libellePartieSur(1, 1)).toBe('Partie 1 sur 1');
		expect(libelleQuestionSur(4, 12)).toBe('Question 4 sur 12');
		expect(libelleQuestionSur(1, 1)).toBe('Question 1 sur 1');
		expect(libellePartieTerminee(2)).toBe('Partie 2 terminée');
	});

	it('seuil non atteint : le nombre de questions à donner (⌈60 % de N⌉), jamais un pourcentage, accordé', () => {
		expect(lu(libelleSeuilNonAtteint(1))).toContain('1 question sur 1');
		expect(lu(libelleSeuilNonAtteint(10))).toContain('6 questions sur 10');
		// Le cas réel de l'issue : 51 leçons × 3 questions.
		expect(lu(libelleSeuilNonAtteint(153))).toContain('92 questions sur 153');
		for (let total = 1; total <= 200; total++) {
			const t = lu(libelleSeuilNonAtteint(total));
			let min = 0;
			while (!compteAttendu(min, total)) min++;
			expect(t, `${total}`).not.toMatch(/%/);
			expect(t, `${total}`).toContain(`${min} question${min > 1 ? 's' : ''} sur ${total}`);
		}
	});
});

/* ============================================================
   Règle des 60 % de réponses (critère 10)
   ============================================================ */

describe('Règle des 60 % de réponses (critère 10)', () => {
	/* Bornes recalculées à la main : ⌈0,6 × N⌉. */
	const BORNES: [total: number, minimum: number][] = [
		[1, 1],
		[2, 2], // 1,2 → 2
		[3, 2], // 1,8 → 2
		[4, 3], // 2,4 → 3
		[5, 3],
		[10, 6],
		[12, 8], // 7,2 → 8
		[15, 9],
		[153, 92], // 91,8 → 92 : 91 réponses font 59,5 %
	];

	it.each(BORNES)('N = %i : %i réponses au moins, une de moins ne suffit pas', (total, min) => {
		expect(minimumReponses(total)).toBe(min);
		expect(assezDeReponses(min, total)).toBe(true);
		expect(assezDeReponses(min - 1, total)).toBe(false);
		expect(assezDeReponses(total, total)).toBe(true);
	});

	it('de 1 à 300 questions, toute quantité de réponses : compte ⇔ au moins 60 %', () => {
		const fautes: string[] = [];
		for (let total = 1; total <= 300; total++) {
			let min = 0;
			while (!compteAttendu(min, total)) min++;
			if (minimumReponses(total) !== min) fautes.push(`minimum(${total}) ≠ ${min}`);
			for (let r = 0; r <= total; r++)
				if (assezDeReponses(r, total) !== compteAttendu(r, total)) fautes.push(`${r}/${total}`);
		}
		expect(fautes).toEqual([]);
	});

	it('aucune réponse ne compte jamais, et un bilan vide non plus', () => {
		for (let total = 1; total <= 50; total++) expect(assezDeReponses(0, total)).toBe(false);
		expect(assezDeReponses(0, 0)).toBe(false);
	});
});

/* ============================================================
   Synthèse par leçon (critères 10 et 13)
   ============================================================ */

describe('Synthèse par leçon (syntheseParLecon)', () => {
	it('une ligne par leçon dans l’ordre de jeu, avec ses questions posées, répondues et réussies', () => {
		const questions = ['a', 'a', 'a', 'b', 'b'].map(q);
		const lignes = syntheseParLecon(questions, [JUSTE, FAUSSE, PASSEE, JUSTE, JUSTE]);
		expect(lignes).toEqual([
			// 3 questions, pas toutes justes : à retravailler (pas de « presque » sur 3 ou moins).
			{ lessonId: 'a', posees: 3, repondues: 2, reussies: 1, verdict: 'a-retravailler' },
			{ lessonId: 'b', posees: 2, repondues: 2, reussies: 2, verdict: 'reussi' },
		]);
	});

	it('une question passée compte dans N : 3 justes et 2 passées sur 5 font « Presque », pas « Réussi »', () => {
		// Sur les seules réponses données (3 sur 3), ce serait « Réussi » : le critère 13
		// compte les questions RÉELLEMENT POSÉES, et le critère 10 fait d'une question passée
		// une erreur.
		const [l] = syntheseParLecon(['a', 'a', 'a', 'a', 'a'].map(q), [
			JUSTE,
			PASSEE,
			JUSTE,
			PASSEE,
			JUSTE,
		]);
		expect(l).toEqual({ lessonId: 'a', posees: 5, repondues: 3, reussies: 3, verdict: 'presque' });
		const [l2] = syntheseParLecon(['a', 'a', 'a', 'a', 'a'].map(q), [
			JUSTE,
			JUSTE,
			PASSEE,
			PASSEE,
			PASSEE,
		]);
		expect(l2.verdict).toBe('a-retravailler'); // 2 sur 5, alors que 2 sur 2 répondues
	});

	it('une leçon revenue plus loin (a, b, a) reste UNE ligne, à la place de sa première apparition', () => {
		const lignes = syntheseParLecon(['a', 'b', 'a'].map(q), [JUSTE, FAUSSE, JUSTE]);
		expect(lignes.map((l) => [l.lessonId, l.posees, l.reussies])).toEqual([
			['a', 2, 2],
			['b', 1, 0],
		]);
	});

	it('aucune question, aucune ligne', () => {
		expect(syntheseParLecon([], [])).toEqual([]);
	});

	it('sur 300 bilans tirés au hasard : comptes recalculés et verdict du critère 13, ligne par ligne', () => {
		const ids = ['a', 'b', 'c', 'd'];
		const fautes: string[] = [];
		withSeed(77, () => {
			for (let n = 0; n < 300; n++) {
				const questions = Array.from({ length: rnd(1, 40) }, () => q(ids[rnd(0, 3)]));
				const resultats = questions.map(() => [JUSTE, FAUSSE, PASSEE][rnd(0, 2)]);
				const lignes = syntheseParLecon(questions, resultats);
				const vues = [...new Set(questions.map((x) => x.lessonId))];
				if (lignes.map((l) => l.lessonId).join() !== vues.join()) fautes.push(`ordre ${n}`);
				for (const l of lignes) {
					const rangs = questions.flatMap((x, i) => (x.lessonId === l.lessonId ? [i] : []));
					const posees = rangs.length;
					const repondues = rangs.filter((i) => resultats[i].repondue).length;
					const reussies = rangs.filter((i) => resultats[i].reussi).length;
					const attendu = {
						posees,
						repondues,
						reussies,
						verdict: verdictAttendu(reussies, posees),
					};
					const obtenu = {
						posees: l.posees,
						repondues: l.repondues,
						reussies: l.reussies,
						verdict: l.verdict,
					};
					if (JSON.stringify(obtenu) !== JSON.stringify(attendu))
						fautes.push(
							`${n}/${l.lessonId} : ${JSON.stringify(obtenu)} ≠ ${JSON.stringify(attendu)}`,
						);
				}
			}
		});
		expect(fautes).toEqual([]);
	});
});

/* ============================================================
   Ordre du récapitulatif (critère 13)
   ============================================================ */

describe('Ordre du récapitulatif (trierParVerdict)', () => {
	const ligne = (lessonId: string, verdict: VerdictLecon): BilanLecon => ({
		lessonId,
		posees: 1,
		repondues: 1,
		reussies: verdict === 'reussi' ? 1 : 0,
		verdict,
	});

	it('Réussi, puis Presque, puis À retravailler ; à verdict égal, l’ordre de jeu (pas l’alphabet)', () => {
		const jeu = [
			ligne('z', 'a-retravailler'),
			ligne('y', 'reussi'),
			ligne('c', 'presque'),
			ligne('m', 'reussi'),
			ligne('b', 'a-retravailler'),
			ligne('a', 'presque'),
		];
		expect(trierParVerdict(jeu).map((l) => l.lessonId)).toEqual(['y', 'm', 'c', 'a', 'z', 'b']);
	});

	it('sur 200 récapitulatifs tirés au hasard : regroupés par verdict, ordre de jeu gardé dans chaque groupe', () => {
		const verdicts: VerdictLecon[] = ['reussi', 'presque', 'a-retravailler'];
		withSeed(31, () => {
			for (let n = 0; n < 200; n++) {
				const jeu = Array.from({ length: rnd(0, 60) }, (_, i) =>
					ligne(`l${rnd(0, 999)}-${i}`, verdicts[rnd(0, 2)]),
				);
				const attendu = verdicts.flatMap((v) => jeu.filter((l) => l.verdict === v));
				expect(trierParVerdict(jeu)).toEqual(attendu);
			}
		});
	});
});

/* ============================================================
   Répartition de questions déjà tirées en parties (critère 8)
   ============================================================ */

/* Deux leçons d'une catégorie, une d'une autre : ids réels (la catégorie vient du
   catalogue). */
const NUMERATION = getLessonsByCategory('math-numeration', 'ce2').map((l) => l.id);
const GRAMMAIRE = getLessonsByCategory('fr-grammaire', 'ce2').map((l) => l.id);
const [N1, N2, N3] = NUMERATION;
const [G1, G2] = GRAMMAIRE;

/** Questions pour une suite de (leçon, nombre). Chacune porte son rang d'origine : deux
    questions ne sont jamais égales, donc une question perdue, dupliquée ou déplacée se
    voit à la comparaison (une copie fidèle, elle, reste égale). */
const serie = (...blocs: [string, number][]): QuestionRevision[] =>
	blocs
		.flatMap(([id, n]) => Array.from({ length: n }, () => id))
		.map((id, rang) => Object.assign(q(id), { rangTest: rang }));

/** Nombre MINIMAL de parties, recalculé par programmation dynamique sur les SÉRIES
    (questions consécutives d'une même leçon) : une partie = des séries consécutives d'une
    même catégorie, sous le plafond, ou une série seule plus grosse. */
function partiesMinimales(questions: readonly QuestionRevision[]): number {
	const series: { cat: string; n: number }[] = [];
	questions.forEach((x, i) => {
		if (i > 0 && questions[i - 1].lessonId === x.lessonId) series[series.length - 1].n++;
		else series.push({ cat: lecon(x.lessonId).category, n: 1 });
	});
	const best = [0];
	for (let j = 1; j <= series.length; j++) {
		best[j] = Infinity;
		let somme = 0;
		for (let i = j - 1; i >= 0; i--) {
			if (series[i].cat !== series[j - 1].cat) break;
			somme += series[i].n;
			if (i < j - 1 && somme > PLAFOND_PARTIE) break;
			best[j] = Math.min(best[j], best[i] + 1);
		}
	}
	return best[series.length];
}

describe('Répartition de questions tirées en parties (repartirEnParties)', () => {
	it('précondition : deux catégories distinctes, au moins trois leçons de numération', () => {
		expect(NUMERATION.length).toBeGreaterThanOrEqual(3);
		expect(GRAMMAIRE.length).toBeGreaterThanOrEqual(2);
	});

	it('rien à répartir : aucune partie', () => {
		expect(repartirEnParties([])).toEqual([]);
	});

	it('les parties mises bout à bout rendent les questions reçues, toutes, dans l’ordre', () => {
		const questions = serie([N1, 4], [N2, 6], [G1, 3], [N3, 2]);
		expect(repartirEnParties(questions).flatMap((p) => p.questions)).toEqual(questions);
	});

	it('chaque partie porte la catégorie de ses leçons ; une catégorie qui revient plus loin fait une nouvelle partie', () => {
		const parties = repartirEnParties(serie([N1, 2], [G1, 2], [N2, 2]));
		expect(parties.map((p) => p.categoryId)).toEqual([
			'math-numeration',
			'fr-grammaire',
			'math-numeration',
		]);
	});

	it('une série d’une leçon n’est jamais coupée, même au-delà de 15 questions', () => {
		const seule = repartirEnParties(serie([N1, 20]));
		expect(seule.map((p) => p.questions.length)).toEqual([20]);
		// 10 + 10 dépasse le plafond : deux parties, chacune une leçon entière.
		const deux = repartirEnParties(serie([N1, 10], [N2, 10]));
		expect(deux.map((p) => p.questions.map((x) => x.lessonId))).toEqual([
			Array(10).fill(N1),
			Array(10).fill(N2),
		]);
	});

	it('« Réviser mes erreurs » : 3 + 3 + 3 erreurs d’une catégorie tiennent en une seule partie', () => {
		const parties = repartirEnParties(serie([N1, 3], [N2, 3], [N3, 3]));
		expect(parties).toHaveLength(1);
		expect(parties[0].questions).toHaveLength(9);
	});

	it('une leçon revenue plus loin dans la même catégorie (a, b, a) : rien n’est réordonné ni fusionné', () => {
		const questions = serie([N1, 2], [N2, 2], [N1, 2]);
		const parties = repartirEnParties(questions);
		expect(parties).toHaveLength(1);
		expect(parties[0].questions.map((x) => x.lessonId)).toEqual([N1, N1, N2, N2, N1, N1]);
	});

	it('sur 400 suites tirées au hasard : ordre, catégories, séries entières, plafond, parties en nombre minimal', () => {
		const pool = [N1, N2, N3, G1, G2];
		const fautes: string[] = [];
		withSeed(2026, () => {
			for (let n = 0; n < 400; n++) {
				const blocs = Array.from({ length: rnd(1, 9) }, (): [string, number] => [
					pool[rnd(0, pool.length - 1)],
					rnd(1, 18),
				]);
				const questions = serie(...blocs);
				const parties = repartirEnParties(questions);
				const aPlat = parties.flatMap((p) => p.questions);
				if (JSON.stringify(aPlat) !== JSON.stringify(questions))
					fautes.push(`${n} : questions perdues, dupliquées ou réordonnées`);
				// Partie de chaque question, pour vérifier qu'une série n'est jamais coupée.
				const partieDe = parties.flatMap((p, k) => p.questions.map(() => k));
				questions.forEach((x, i) => {
					if (i > 0 && questions[i - 1].lessonId === x.lessonId && partieDe[i - 1] !== partieDe[i])
						fautes.push(`${n} : série de ${x.lessonId} coupée au rang ${i}`);
				});
				parties.forEach((p, k) => {
					if (p.questions.some((x) => lecon(x.lessonId).category !== p.categoryId))
						fautes.push(`${n} : partie ${k} mêle des catégories`);
					const seriesDeLaPartie = p.questions.filter(
						(x, i) => i === 0 || p.questions[i - 1].lessonId !== x.lessonId,
					).length;
					if (p.questions.length > PLAFOND_PARTIE && seriesDeLaPartie > 1)
						fautes.push(`${n} : partie ${k} de ${p.questions.length} à plusieurs séries`);
				});
				if (parties.length !== partiesMinimales(questions))
					fautes.push(`${n} : ${parties.length} parties, ${partiesMinimales(questions)} suffisent`);
			}
		});
		expect(fautes).toEqual([]);
	});
});

/* ============================================================
   Ordre des leçons du bilan (critère 8, classe choisie #772)
   ============================================================ */

/* Deux leçons de numération présentes au CE2 et au CM1, que les deux écrans affichent
   dans un ordre DIFFÉRENT : sans elles, rien ne distinguerait l'ordre d'une classe de
   l'ordre de l'autre. */
function paireInversee(): [string, string] {
	const ce2 = getLessonsByCategory('math-numeration', 'ce2').map((l) => l.id);
	const cm1 = getLessonsByCategory('math-numeration', 'cm1').map((l) => l.id);
	const communes = ce2.filter((id) => cm1.includes(id));
	for (const a of communes)
		for (const b of communes)
			if (ce2.indexOf(a) < ce2.indexOf(b) && cm1.indexOf(a) > cm1.indexOf(b)) return [a, b];
	throw new Error('aucune paire de numération ordonnée différemment au CE2 et au CM1');
}

/** Ordre de l'écran d'une catégorie dans une classe, restreint à `ids`. */
const ordreEcran = (cat: string, niveau: 'ce2' | 'cm1', ids: string[]): string[] =>
	getLessonsByCategory(cat, niveau)
		.map((l) => l.id)
		.filter((id) => ids.includes(id));

describe('Ordre des leçons du bilan (leconsDuBilan)', () => {
	it('précondition : la paire est dans un ordre au CE2, dans l’autre au CM1', () => {
		const [a, b] = paireInversee();
		expect(ordreEcran('math-numeration', 'ce2', [a, b])).toEqual([a, b]);
		expect(ordreEcran('math-numeration', 'cm1', [a, b])).toEqual([b, a]);
	});

	it('profil au CE2 : l’ordre de l’écran CE2, quel que soit l’ordre du favori', () => {
		const [a, b] = paireInversee();
		expect(leconsDuBilan([b, a]).map((l) => l.id)).toEqual([a, b]);
		expect(leconsDuBilan([a, b]).map((l) => l.id)).toEqual([a, b]);
	});

	it('profil au CM1 : l’ordre de l’écran CM1', () => {
		const [a, b] = paireInversee();
		setNiveauReference('cm1');
		expect(leconsDuBilan([a, b]).map((l) => l.id)).toEqual([b, a]);
	});

	it('classe CM1 choisie sur la numération (#772) : l’ordre de l’écran CM1, le profil restant au CE2', () => {
		const [a, b] = paireInversee();
		choisirClasse('math-numeration', 'cm1');
		expect(leconsDuBilan([a, b]).map((l) => l.id)).toEqual([b, a]);
	});

	it('classe choisie sur une AUTRE catégorie : la numération garde l’ordre de la classe suivie', () => {
		const [a, b] = paireInversee();
		choisirClasse('fr-grammaire', 'cm1');
		expect(leconsDuBilan([b, a]).map((l) => l.id)).toEqual([a, b]);
	});

	it('une leçon que l’écran de la classe ne montre pas reste dans le bilan, sans casser les catégories', () => {
		const [a, b] = paireInversee();
		const cm1 = getLessonsByCategory('math-numeration', 'cm1').map((l) => l.id);
		const ce2Seule = getLessonsByCategory('math-numeration', 'ce2').find(
			(l) => !cm1.includes(l.id),
		);
		expect(ce2Seule, 'précondition : une leçon de numération CE2 absente du CM1').toBeDefined();
		const fr = GRAMMAIRE[0];
		choisirClasse('math-numeration', 'cm1');
		const ids = leconsDuBilan([fr, ce2Seule!.id, a, b]).map((l) => l.id);
		expect([...ids].sort()).toEqual([fr, ce2Seule!.id, a, b].sort());
		// Les deux affichées gardent l'ordre de l'écran CM1.
		expect(ids.filter((id) => id === a || id === b)).toEqual([b, a]);
		// Catégories d'un seul tenant, dans l'ordre de CATEGORIES.
		const rangs = ids.map((id) => CATEGORIES.findIndex((c) => c.id === lecon(id).category));
		expect(
			rangs.every((r, i) => i === 0 || rangs[i - 1] <= r),
			JSON.stringify(ids),
		).toBe(true);
	});

	it('un id en double ne compte qu’une fois', () => {
		const [a, b] = paireInversee();
		expect(leconsDuBilan([a, b, a, a]).map((l) => l.id)).toEqual([a, b]);
	});
});
