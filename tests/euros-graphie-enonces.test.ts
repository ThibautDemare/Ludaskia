/* ============================================================
   Graphie des montants en euros dans les ÉNONCÉS générés (#542) — logique pure.
   ------------------------------------------------------------
   Ce fichier ne teste RIEN de nouveau : il fige le comportement ACTUEL des énoncés
   d'argent, pour que le refactoring de #542 (les deux copies de la règle monétaire —
   `fmtEuros` dans data/maths/monnaie.ts et `euros(centimes)` dans data/maths/problemes.ts
   — fondues dans une fonction unique) soit un refactoring à comportement CONSTANT. Rien
   ne le garde aujourd'hui : les deux copies peuvent être remplacées par une troisième
   règle sans qu'aucun test ne bronche.

   Il porte aussi les PRÉMISSES sur lesquelles s'appuie tests/euros-reveles.test.ts (le
   fichier des critères de #542). Une prémisse fausse rendrait ces critères intestables,
   d'où leur vérification séparée :
     - les énoncés d'argent n'écrivent QUE deux graphies (« 6 » et « 7,50 »), jamais
       « 7,5 » ni « 6,00 » ni « 7.50 » — c'est la règle du programme (docs/reference/
       programmes/ce2-maths.md § 2.4 : « 43,45 € + 68 € ») et donc l'attendu de la
       réponse RÉVÉLÉE, qui doit s'écrire comme l'énoncé qu'elle prolonge ;
     - aucune réponse de sous-question n'atteint le seuil de groupement des grands
       nombres (10 000), donc « écrit comme aujourd'hui » (critère 6) reste sans
       ambiguïté pour les réponses non monétaires ;
     - l'échantillon contient bien les cas qui font mal : un montant à centimes finissant
       par zéro (4,50 — le bug de #542), un montant entier, et une mesure au dixième.

   Attendus DÉRIVÉS de la règle du programme, pas de l'implémentation. Sans DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getAllLessons, getLessonById } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import type { Exercise } from '../src/core/exercise';

type ProbEx = Extract<Exercise, { type: 'probleme' }>;

/** Graphie d'un montant en euros au programme : partie entière seule (« 6 ») ou DEUX
    chiffres après la virgule (« 7,50 »). Interdit donc « 7,5 », « 6,00 », « 7.50 ». */
const MONTANT_EURO = /^\d+(?:,\d{2})?$/;

/** Les montants écrits devant un « € » dans un texte. */
function montantsEuro(texte: string): string[] {
	return [...texte.matchAll(/(\d+(?:[.,]\d+)?)\s*€/g)].map((m) => m[1]);
}

/** Nombre d'occurrences du symbole « € ». */
function nbEuro(texte: string): number {
	return [...texte].filter((c) => c === '€').length;
}

/* ------------------------------------------------------------------ */
/* Échantillons                                                        */
/* ------------------------------------------------------------------ */

const TIRAGES = 100;
const SEED = 542001;

interface Tire {
	id: string;
	ex: ProbEx;
}

/** Tous les problèmes tirés du catalogue, leçon par leçon et niveau par niveau. Une leçon
    qui produit AUSSI d'autres formats (division avec reste, durées) n'est pas abandonnée
    au premier tirage non-problème : on filtre tirage par tirage. */
function tirerProblemes(): Tire[] {
	const out: Tire[] = [];
	for (const lecon of getAllLessons()) {
		for (const level of lecon.levels) {
			withSeed(SEED, () => {
				for (let i = 0; i < TIRAGES; i++) {
					const ex = lecon.exerciseType.generate({ level });
					if (ex.type === 'probleme') out.push({ id: `${lecon.id}/${level}`, ex });
				}
			});
		}
	}
	return out;
}

const PROBLEMES = tirerProblemes();
const ARGENT = PROBLEMES.filter((t) => t.ex.enonce.includes('€'));
const HORS_ARGENT = PROBLEMES.filter((t) => !t.ex.enonce.includes('€'));

/** Réponses de toutes les sous-questions d'un échantillon. */
const reponses = (ech: Tire[]): { id: string; answer: number }[] =>
	ech.flatMap((t) => t.ex.etapes.map((e) => ({ id: t.id, answer: e.answer })));

/* ------------------------------------------------------------------ */
/* L'échantillon prouve-t-il quelque chose ?                           */
/* ------------------------------------------------------------------ */
describe('#542 — l’échantillon contient les cas qui font mal', () => {
	it('des problèmes, et parmi eux des problèmes d’argent', () => {
		expect(PROBLEMES.length).toBeGreaterThan(200);
		expect(ARGENT.length).toBeGreaterThan(20);
		expect(HORS_ARGENT.length).toBeGreaterThan(20);
	});

	/* LE cas du bug : 4,50 € se stocke en 4.5, donc `String(4.5)` perd le zéro des
	   centièmes. Sans un tel montant dans l'échantillon, les invariants de #542 ne
	   prouveraient rien. */
	it('un montant d’argent à centimes finissant par zéro (4,50 → stocké 4.5)', () => {
		const cas = reponses(ARGENT).filter(
			({ answer }) => !Number.isInteger(answer) && Math.round(answer * 100) % 10 === 0,
		);
		expect(cas.length).toBeGreaterThan(5);
	});

	it('un montant d’argent à centimes NON multiples de 10 (4,05 / 4,25)', () => {
		const cas = reponses(ARGENT).filter(({ answer }) => Math.round(answer * 100) % 10 !== 0);
		expect(cas.length).toBeGreaterThan(5);
	});

	it('un montant d’argent ENTIER (qui doit s’écrire « 6 », jamais « 6,00 »)', () => {
		const cas = reponses(ARGENT).filter(({ answer }) => Number.isInteger(answer));
		expect(cas.length).toBeGreaterThan(5);
	});

	/* Le critère négatif de #542 a besoin d'une réponse décimale NON monétaire : une
	   mesure au dixième (« 3,5 m ») ne doit pas gagner de décimale. */
	it('une mesure au dixième hors argent (3,5 — une seule décimale, et ça doit rester)', () => {
		const cas = reponses(HORS_ARGENT).filter(
			({ answer }) => !Number.isInteger(answer) && Math.round(answer * 10) === answer * 10,
		);
		expect(cas.length).toBeGreaterThan(5);
	});

	/* Prémisse du critère 6 : « écrit comme aujourd'hui » = `String(n)` à virgule
	   française. Au-delà de 10 000, le formatage des réponses révélées GROUPE les
	   chiffres (espace fine insécable) — la formulation serait alors ambiguë. Aucune
	   réponse de problème n'y arrive : on le vérifie plutôt que de le supposer. */
	it('aucune réponse de sous-question n’atteint le seuil de groupement (10 000)', () => {
		for (const { id, answer } of reponses(PROBLEMES)) {
			expect(Math.abs(answer), id).toBeLessThan(10000);
		}
	});
});

/* ------------------------------------------------------------------ */
/* Comportement CONSTANT des énoncés de problème                       */
/* ------------------------------------------------------------------ */
describe('#542 — les énoncés de problème d’argent gardent leur graphie', () => {
	it('tout montant devant « € » s’écrit « 6 » ou « 7,50 » (jamais « 7,5 », « 6,00 », « 7.50 »)', () => {
		for (const { id, ex } of ARGENT) {
			for (const montant of montantsEuro(ex.enonce)) {
				expect(montant, `${id} : « ${ex.enonce} »`).toMatch(MONTANT_EURO);
			}
		}
	});

	/* Garde-fou du garde-fou : si un montant s'écrivait d'une façon que l'extraction ne
	   reconnaît pas (« 4 ,5 € »), la boucle ci-dessus n'aurait rien à contrôler. Dans un
	   énoncé de problème, chaque « € » suit un montant. */
	it('chaque « € » d’un énoncé est bien précédé d’un montant reconnaissable', () => {
		for (const { id, ex } of ARGENT) {
			expect(montantsEuro(ex.enonce).length, `${id} : « ${ex.enonce} »`).toBe(nbEuro(ex.enonce));
		}
	});

	it('les DEUX graphies apparaissent réellement (sinon la règle n’est pas éprouvée)', () => {
		const tous = ARGENT.flatMap((t) => montantsEuro(t.ex.enonce));
		expect(tous.some((m) => /^\d+$/.test(m))).toBe(true); // « 6 »
		expect(tous.some((m) => /^\d+,\d{2}$/.test(m))).toBe(true); // « 7,50 »
	});

	it('aucun point décimal ni séparateur exotique dans un énoncé d’argent', () => {
		for (const { id, ex } of ARGENT) {
			expect(ex.enonce, id).not.toMatch(/\d+\.\d/); // « 4.5 € »
			expect(ex.enonce, id).not.toMatch(/\d,\d(?!\d)/); // « 4,5 € » (une seule décimale)
			expect(ex.enonce, id).not.toMatch(/,\d{3}/); // « 4,500 »
		}
	});

	/* Un énoncé de MESURE n'est pas concerné par la règle monétaire : « 3,5 m » a bien
	   UNE décimale, et le refactoring ne doit pas la lui ajouter. */
	it('un énoncé hors argent garde ses mesures au dixième (« 3,5 m »)', () => {
		const dixiemes = HORS_ARGENT.filter((t) => /\d,\d(?!\d)/.test(t.ex.enonce));
		expect(dixiemes.length).toBeGreaterThan(5);
	});
});

/* ------------------------------------------------------------------ */
/* Comportement CONSTANT des énoncés des leçons « monnaie »            */
/* ------------------------------------------------------------------ */
describe('#542 — les énoncés des leçons « monnaie » gardent leur graphie', () => {
	const IDS = ['mes-monnaie-calcul', 'mes-monnaie-rendu'] as const;

	/** Questions tirées d'une leçon de monnaie, à tous ses niveaux. */
	function questionsMonnaie(id: string): { id: string; texte: string }[] {
		const lecon = getLessonById(id);
		expect(lecon, `leçon ${id} absente du catalogue`).toBeDefined();
		const out: { id: string; texte: string }[] = [];
		for (const level of lecon!.levels) {
			withSeed(SEED, () => {
				for (let i = 0; i < TIRAGES; i++) {
					const ex = lecon!.exerciseType.generate({ level });
					if ('question' in ex && typeof ex.question === 'string') {
						out.push({ id: `${id}/${level}`, texte: ex.question });
					}
				}
			});
		}
		return out;
	}

	for (const id of IDS) {
		it(`${id} : tout montant devant « € » s’écrit « 6 » ou « 1,50 »`, () => {
			const questions = questionsMonnaie(id);
			expect(questions.length).toBeGreaterThan(50);
			for (const q of questions) {
				for (const montant of montantsEuro(q.texte)) {
					expect(montant, `${q.id} : « ${q.texte} »`).toMatch(MONTANT_EURO);
				}
			}
		});
	}

	/* « Je rends la monnaie » est la seule leçon de monnaie à écrire des prix DÉCIMAUX,
	   et donc la SEULE utilisatrice de la règle monétaire à deux décimales côté monnaie —
	   c'est elle qui donne du sens au refactoring de #542. Le catalogue ne surface pas
	   encore son niveau CM1 (`levels` vaut `['ce2']`, cf. src/data/maths/monnaie.ts :
	   « le CM1 reste prêt derrière le paramètre level »), donc la boucle ci-dessus, qui
	   suit les niveaux ANNONCÉS, ne voit que des prix entiers. On appelle donc le niveau
	   CM1 explicitement : le code est vivant, il est ce que le refactoring touche, et
	   fondre la règle sans le garder reviendrait à refactorer à l'aveugle la seule
	   branche non triviale. */
	it('mes-monnaie-rendu au niveau CM1 : prix décimaux écrits « 1,50 », billets « 5 »', () => {
		const lecon = getLessonById('mes-monnaie-rendu');
		expect(lecon).toBeDefined();
		const montants: string[] = [];
		withSeed(SEED, () => {
			for (let i = 0; i < TIRAGES; i++) {
				const ex = lecon!.exerciseType.generate({ level: 'cm1' });
				if ('question' in ex && typeof ex.question === 'string') {
					montants.push(...montantsEuro(ex.question));
				}
			}
		});
		expect(montants.length).toBeGreaterThan(50);
		for (const m of montants) expect(m).toMatch(MONTANT_EURO);
		// Les deux graphies cohabitent : sinon la règle n'est pas éprouvée.
		expect(montants.some((m) => /^\d+$/.test(m))).toBe(true);
		expect(montants.some((m) => /^\d+,\d{2}$/.test(m))).toBe(true);
	});
});
