/* ============================================================
   Fonctions PURES extraites des runners « écran dédié » pour la galerie
   visuelle (#419), testées côté logique (auteur ≠ auteur du code) :
     - buildCells(ex)            → src/ui/lecon-tableau.ts (cœur logique)
     - renderTableauBoardHTML    → src/ui/lecon-tableau.ts (markup pur)
     - renderProblemeBoardHTML   → src/ui/lecon-probleme.ts (markup pur)
   Attendus DÉRIVÉS du modèle de données (core/exercise.ts), jamais recopiés de
   l'implémentation : on construit des Exercise CONNUS (prédiction manuelle des
   cellules/markup) + un échantillon de leçons de mesures/problèmes réelles pour
   les invariants de masse. Le markup est parsé via le DOM happy-dom et éprouvé
   sur sa STRUCTURE (jamais la chaîne exacte, trop fragile).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { buildCells, renderTableauBoardHTML } from '../src/ui/lecon-tableau';
import type { Cellule } from '../src/ui/lecon-tableau';
import { renderProblemeBoardHTML } from '../src/ui/lecon-probleme';
import type { ProbQuestion } from '../src/ui/lecon-probleme';
import type { Exercise } from '../src/core/exercise';
import { MESURE_LESSONS } from '../src/data/maths/mesures';
import { PROBLEMES_LESSONS } from '../src/data/maths/problemes';
import type { SchoolLevel } from '../src/core/catalog';

type Tableau = Extract<Exercise, { type: 'tableauConversion' }>;

/** Parse un fragment HTML en nœud DOM interrogeable (happy-dom). */
function parse(html: string): HTMLElement {
	const root = document.createElement('div');
	root.innerHTML = html;
	return root;
}

/* ------------------------------------------------------------------ */
/* buildCells — cœur logique                                          */
/* ------------------------------------------------------------------ */
describe('buildCells — déploiement des colonnes en cellules', () => {
	it('conversion entière, tête 1 chiffre : une cellule par colonne, aria au pluriel, rang absent', () => {
		const ex: Tableau = {
			type: 'tableauConversion',
			question: 'Combien de cm ? @ cm',
			answer: '300',
			answerUnit: 'cm',
			colonnes: [
				{ unite: 'm', nom: 'mètre', transit: false, chiffres: '3' },
				{ unite: 'dm', nom: 'décimètre', transit: false, chiffres: '0' },
				{ unite: 'cm', nom: 'centimètre', transit: false, chiffres: '0' },
			],
		};
		// Contrat de type exporté : buildCells renvoie bien des Cellule[].
		const cells: Cellule[] = buildCells(ex);
		expect(cells.length).toBe(3);
		// Prédiction manuelle, cellule par cellule.
		expect(cells[0]).toMatchObject({ attendu: '3', aria: 'chiffre des mètres', valeur: '' });
		expect(cells[1]).toMatchObject({ attendu: '0', aria: 'chiffre des décimètres', valeur: '' });
		expect(cells[2]).toMatchObject({ attendu: '0', aria: 'chiffre des centimètres', valeur: '' });
		// Rang absent hors tête à 2 chiffres.
		expect(cells.every((c) => c.rang === undefined)).toBe(true);
		// La cellule pointe la MÊME colonne que l'exercice (pas une copie).
		expect(cells[0].col).toBe(ex.colonnes[0]);
		expect(cells[2].col).toBe(ex.colonnes[2]);
	});

	it('tête à 2 chiffres : 2 cellules (dizaine puis unité) avec aria de rang, zéros de transit inclus', () => {
		const ex: Tableau = {
			type: 'tableauConversion',
			question: 'Combien de m ? @ m',
			answer: '12000',
			answerUnit: 'm',
			colonnes: [
				{ unite: 'km', nom: 'kilomètre', transit: false, chiffres: '12' },
				{ unite: 'hm', nom: 'hectomètre', transit: true, chiffres: '0' },
				{ unite: 'dam', nom: 'décamètre', transit: true, chiffres: '0' },
				{ unite: 'm', nom: 'mètre', transit: false, chiffres: '0' },
			],
		};
		const cells = buildCells(ex);
		// 4 colonnes mais 5 cellules : la tête à 2 chiffres se déploie en 2 cases.
		expect(cells.length).toBe(5);
		expect(cells[0]).toMatchObject({
			attendu: '1',
			rang: 'dizaine',
			aria: 'chiffre des dizaines de kilomètres',
		});
		expect(cells[1]).toMatchObject({
			attendu: '2',
			rang: 'unite',
			aria: 'chiffre des unités de kilomètres',
		});
		// Les deux cases de tête partagent la colonne 0.
		expect(cells[0].col).toBe(ex.colonnes[0]);
		expect(cells[1].col).toBe(ex.colonnes[0]);
		// Colonnes de transit : zéros attendus, aria simple (pas de rang).
		expect(cells[2]).toMatchObject({
			attendu: '0',
			aria: 'chiffre des hectomètres',
			rang: undefined,
		});
		expect(cells[3]).toMatchObject({
			attendu: '0',
			aria: 'chiffre des décamètres',
			rang: undefined,
		});
		expect(cells[4]).toMatchObject({ attendu: '0', aria: 'chiffre des mètres', rang: undefined });
	});

	it('colonne à 1 chiffre valant 0 (transit) : cellule bien produite, valeur initiale vide', () => {
		const ex: Tableau = {
			type: 'tableauConversion',
			question: '@ g',
			answer: '5000',
			answerUnit: 'g',
			colonnes: [
				{ unite: 'kg', nom: 'kilogramme', transit: false, chiffres: '5' },
				{ unite: 'hg', nom: 'hectogramme', transit: true, chiffres: '0' },
				{ unite: 'dag', nom: 'décagramme', transit: true, chiffres: '0' },
				{ unite: 'g', nom: 'gramme', transit: false, chiffres: '0' },
			],
		};
		const cells = buildCells(ex);
		expect(cells.length).toBe(4);
		expect(cells.map((c) => c.attendu).join('')).toBe('5000');
		expect(cells.every((c) => c.valeur === '')).toBe(true);
	});
});

/* ------------------------------------------------------------------ */
/* buildCells — invariants de masse sur les leçons de mesures réelles */
/* ------------------------------------------------------------------ */
const FAMILLES = ['mes-longueurs', 'mes-masses', 'mes-contenances'] as const;
const NIVEAUX: SchoolLevel[] = ['ce2', 'cm1'];
const mesureType = (id: string) => MESURE_LESSONS.find((l) => l.id === id)!.exerciseType;

function genTab(id: string, level: SchoolLevel, n: number): Tableau[] {
	const t = mesureType(id);
	const out: Tableau[] = [];
	for (let i = 0; i < n; i++) {
		const ex = t.generate({ mode: 'tableau', level });
		if (ex.type === 'tableauConversion') out.push(ex);
	}
	return out;
}

describe('buildCells — invariants sur un échantillon de mesures réelles', () => {
	it('nombre de cellules = somme des chiffres ; concaténation reconstruite ; valeurs vides ; 1 chiffre/case', () => {
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 150)) {
					const cells = buildCells(ex);
					const attendu = ex.colonnes.reduce((s, c) => s + c.chiffres.length, 0);
					expect(cells.length).toBe(attendu);
					// La suite des chiffres attendus = concaténation des chiffres des colonnes.
					expect(cells.map((c) => c.attendu).join('')).toBe(
						ex.colonnes.map((c) => c.chiffres).join(''),
					);
					for (const c of cells) {
						expect(/^[0-9]$/.test(c.attendu)).toBe(true); // exactement un chiffre
						expect(c.valeur).toBe(''); // aucune saisie pré-remplie
						expect(c.aria.length).toBeGreaterThan(0);
					}
				}
			}
		}
	});

	it('rang : présent UNIQUEMENT pour les cases de la tête à 2 chiffres, jamais ailleurs', () => {
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 150)) {
					const cells = buildCells(ex);
					const teteDeuxChiffres = ex.colonnes[0].chiffres.length === 2;
					const avecRang = cells.filter((c) => c.rang !== undefined);
					if (teteDeuxChiffres) {
						// Exactement les 2 premières cases, dans l'ordre dizaine → unité.
						expect(avecRang.length).toBe(2);
						expect(cells[0].rang).toBe('dizaine');
						expect(cells[1].rang).toBe('unite');
						expect(avecRang.every((c) => c.col === ex.colonnes[0])).toBe(true);
					} else {
						expect(avecRang.length).toBe(0);
					}
				}
			}
		}
	});

	it('chaque cellule référence bien l’une des colonnes de l’exercice (pas de colonne fantôme)', () => {
		for (const ex of genTab('mes-longueurs', 'cm1', 100)) {
			const cells = buildCells(ex);
			for (const c of cells) expect(ex.colonnes).toContain(c.col);
		}
	});
});

/* ------------------------------------------------------------------ */
/* renderTableauBoardHTML — markup pur                                */
/* ------------------------------------------------------------------ */
describe('renderTableauBoardHTML — structure du tableau', () => {
	it('une .tc-col par colonne, une .tc-cell par cellule, data-answer/aria alignés sur buildCells', () => {
		const ex: Tableau = {
			type: 'tableauConversion',
			question: 'Combien de m ? @ m',
			answer: '12000',
			answerUnit: 'm',
			colonnes: [
				{ unite: 'km', nom: 'kilomètre', transit: false, chiffres: '12' },
				{ unite: 'hm', nom: 'hectomètre', transit: true, chiffres: '0' },
				{ unite: 'dam', nom: 'décamètre', transit: true, chiffres: '0' },
				{ unite: 'm', nom: 'mètre', transit: false, chiffres: '0' },
			],
		};
		const cells = buildCells(ex);
		const root = parse(renderTableauBoardHTML(ex, cells));
		// 4 colonnes, mais 5 cases (tête à 2 chiffres).
		expect(root.querySelectorAll('.tc-col').length).toBe(4);
		const domCells = [...root.querySelectorAll<HTMLButtonElement>('.tc-cell')];
		expect(domCells.length).toBe(cells.length);
		expect(domCells.length).toBe(5);
		domCells.forEach((btn, i) => {
			expect(Number(btn.dataset.i)).toBe(i); // data-i séquentiel 0..n-1
			expect(btn.dataset.answer).toBe(cells[i].attendu); // correction auditable
			expect(btn.getAttribute('aria-label')).toBe(cells[i].aria);
		});
	});

	it('en-têtes : symbole = unité, nom au pluriel ; colonnes de transit marquées (col/head/cell)', () => {
		const ex: Tableau = {
			type: 'tableauConversion',
			question: '@ m',
			answer: '12000',
			answerUnit: 'm',
			colonnes: [
				{ unite: 'km', nom: 'kilomètre', transit: false, chiffres: '12' },
				{ unite: 'hm', nom: 'hectomètre', transit: true, chiffres: '0' },
				{ unite: 'dam', nom: 'décamètre', transit: true, chiffres: '0' },
				{ unite: 'm', nom: 'mètre', transit: false, chiffres: '0' },
			],
		};
		const root = parse(renderTableauBoardHTML(ex, buildCells(ex)));
		const cols = [...root.querySelectorAll('.tc-col')];
		expect(cols.length).toBe(4);
		cols.forEach((col, i) => {
			const def = ex.colonnes[i];
			expect(col.querySelector('.tc-sym')?.textContent).toBe(def.unite);
			expect(col.querySelector('.tc-nom')?.textContent).toBe(`${def.nom}s`);
			// Une colonne de transit porte la classe sur col + en-tête + toutes ses cases.
			expect(col.classList.contains('tc-col--transit')).toBe(def.transit);
			expect(col.querySelector('.tc-head')?.classList.contains('tc-head--transit')).toBe(
				def.transit,
			);
			col
				.querySelectorAll('.tc-cell')
				.forEach((cell) => expect(cell.classList.contains('tc-cell--transit')).toBe(def.transit));
		});
	});

	it('conversion entière : aucune virgule ; consigne + énoncé (@ → .tc-trou) + pavé 0-9 présents', () => {
		const ex: Tableau = {
			type: 'tableauConversion',
			question: '3 m = @ cm',
			answer: '300',
			answerUnit: 'cm',
			colonnes: [
				{ unite: 'm', nom: 'mètre', transit: false, chiffres: '3' },
				{ unite: 'dm', nom: 'décimètre', transit: false, chiffres: '0' },
				{ unite: 'cm', nom: 'centimètre', transit: false, chiffres: '0' },
			],
		};
		const root = parse(renderTableauBoardHTML(ex, buildCells(ex)));
		// Pas de virgule pour une conversion entière.
		expect(root.querySelector('.tc-virgule')).toBeNull();
		// Consigne présente, lue par le TTS (data-tts renseigné).
		const consigne = root.querySelector('.tc-consigne');
		expect(consigne).not.toBeNull();
		expect((consigne?.textContent ?? '').trim().length).toBeGreaterThan(0);
		expect(consigne?.getAttribute('data-tts')).toBeTruthy();
		// Énoncé : le « @ » devient le trou .tc-trou et disparaît du texte.
		const enonce = root.querySelector('.tc-enonce');
		expect(enonce?.querySelector('.tc-trou')?.textContent).toBe('?');
		expect(enonce?.textContent).not.toContain('@');
		// Pavé : un groupe, 10 chiffres (0-9) + un bouton effacer.
		expect(root.querySelectorAll('.tc-pave').length).toBe(1);
		expect(root.querySelectorAll('.tc-pave [data-chiffre]').length).toBe(10);
		expect(root.querySelectorAll('.tc-pave [data-pave="effacer"]').length).toBe(1);
	});

	it('conversion décimale : une virgule, posée juste après la colonne cible (answerUnit)', () => {
		const ex: Tableau = {
			type: 'tableauConversion',
			question: '35 dm = @ m',
			answer: '3,5',
			answerUnit: 'm',
			virguleApres: 0,
			colonnes: [
				{ unite: 'm', nom: 'mètre', transit: false, chiffres: '3' },
				{ unite: 'dm', nom: 'décimètre', transit: false, chiffres: '5' },
			],
		};
		const root = parse(renderTableauBoardHTML(ex, buildCells(ex)));
		const virgs = root.querySelectorAll('.tc-virgule');
		expect(virgs.length).toBe(1);
		// La virgule suit immédiatement la colonne cible.
		const cible = virgs[0].previousElementSibling;
		expect(cible?.classList.contains('tc-col')).toBe(true);
		expect(cible?.querySelector('.tc-sym')?.textContent).toBe(ex.answerUnit);
		// L'index de cette colonne = virguleApres.
		const cols = [...root.querySelectorAll('.tc-col')];
		expect(cols.indexOf(cible as Element)).toBe(ex.virguleApres);
	});

	it('cohérence board ↔ buildCells sur un échantillon de mesures réelles', () => {
		for (const id of FAMILLES) {
			for (const ex of genTab(id, 'cm1', 60)) {
				const cells = buildCells(ex);
				const root = parse(renderTableauBoardHTML(ex, cells));
				const domCells = [...root.querySelectorAll<HTMLButtonElement>('.tc-cell')];
				expect(domCells.length).toBe(cells.length);
				expect(root.querySelectorAll('.tc-col').length).toBe(ex.colonnes.length);
				expect(root.querySelectorAll('.tc-pave').length).toBe(1);
				domCells.forEach((btn, i) => expect(btn.dataset.answer).toBe(cells[i].attendu));
				// Virgule présente ssi la réponse est décimale (invariant de la donnée).
				expect(root.querySelectorAll('.tc-virgule').length).toBe(ex.answer.includes(',') ? 1 : 0);
			}
		}
	});
});

/* ------------------------------------------------------------------ */
/* renderProblemeBoardHTML — markup pur                               */
/* ------------------------------------------------------------------ */
describe('renderProblemeBoardHTML — structure du problème', () => {
	it('problème simple : un seul champ, data-answer = la réponse, énoncé présent, aucun badge d’étape', () => {
		const q: ProbQuestion = {
			enonce: 'Léo a 3 billes, il en gagne 4.',
			etapes: [{ question: 'Combien Léo a-t-il de billes ?', answer: 7 }],
			parle: 'Léo a 3 billes, il en gagne 4. Combien Léo a-t-il de billes ?',
		};
		const root = parse(renderProblemeBoardHTML(q));
		const inputs = [...root.querySelectorAll<HTMLInputElement>('.prob-input')];
		expect(inputs.length).toBe(1);
		expect(inputs[0].dataset.i).toBe('0');
		expect(inputs[0].dataset.answer).toBe('7');
		expect(root.querySelector('.prob-enonce')?.textContent).toBe(q.enonce);
		// Un seul champ ⇒ pas de badge « Étape N ».
		expect(root.querySelectorAll('.prob-num').length).toBe(0);
		// Pas de figure demandée ⇒ pas de bloc figure.
		expect(root.querySelector('.figure')).toBeNull();
		// Label relié à son champ (a11y).
		const label = root.querySelector('.prob-q');
		expect(label?.getAttribute('for')).toBe(inputs[0].id);
	});

	it('problème à 2 étapes (lex par défaut) : 2 champs, data-answer alignés, 2 badges « Étape 1/2 »', () => {
		const q: ProbQuestion = {
			enonce: 'Un jeu coûte 12 €. Anna paie avec un billet de 20 €.',
			etapes: [
				{ question: 'Combien coûte le jeu ?', answer: 12 },
				{ question: 'Combien lui rend-on ?', answer: 8 },
			],
			parle: 'peu importe',
		};
		const root = parse(renderProblemeBoardHTML(q));
		const inputs = [...root.querySelectorAll<HTMLInputElement>('.prob-input')];
		expect(inputs.length).toBe(2);
		expect(inputs.map((inp) => inp.dataset.i)).toEqual(['0', '1']);
		expect(inputs.map((inp) => inp.dataset.answer)).toEqual(['12', '8']);
		const badges = [...root.querySelectorAll('.prob-num')];
		expect(badges.length).toBe(2);
		expect(badges.map((b) => b.textContent)).toEqual(['Étape 1', 'Étape 2']);
	});

	it('lex.badgeEtape = false : deux étapes SANS badge (les champs restent)', () => {
		const q: ProbQuestion = {
			enonce: '18 bonbons partagés en paquets de 4.',
			etapes: [
				{ question: 'Combien de paquets ?', answer: 4 },
				{ question: 'Combien reste-t-il ?', answer: 2 },
			],
			parle: 'peu importe',
		};
		const root = parse(
			renderProblemeBoardHTML(q, { nom: 'Calcul', nomPluriel: 'calculs', badgeEtape: false }),
		);
		expect(root.querySelectorAll('.prob-input').length).toBe(2);
		expect(root.querySelectorAll('.prob-num').length).toBe(0);
	});

	it('figure fournie : bloc .figure présent, SVG de confiance NON échappé', () => {
		const q: ProbQuestion = {
			enonce: 'Regarde le schéma.',
			etapes: [{ question: 'Combien ?', answer: 5 }],
			parle: 'Regarde le schéma. Combien ?',
			figure: '<svg data-fig="oui"></svg>',
		};
		const root = parse(renderProblemeBoardHTML(q));
		const fig = root.querySelector('.figure');
		expect(fig).not.toBeNull();
		expect(fig?.querySelector('svg[data-fig="oui"]')).not.toBeNull();
	});

	it('échappement : un énoncé/une question contenant du balisage n’injecte aucun élément', () => {
		const q: ProbQuestion = {
			enonce: 'Réponse <b>cachée</b> dans 2 < 3 ?',
			etapes: [{ question: 'Combien font <i>2 + 3</i> ?', answer: 5 }],
			parle: 'peu importe',
		};
		const root = parse(renderProblemeBoardHTML(q));
		const enonce = root.querySelector('.prob-enonce');
		expect(enonce?.querySelector('b')).toBeNull(); // pas de balise injectée
		expect(enonce?.textContent).toBe(q.enonce); // texte restitué tel quel
		const label = root.querySelector('.prob-q');
		expect(label?.querySelector('i')).toBeNull();
		expect(label?.textContent).toBe(q.etapes[0].question);
	});
});

describe('renderProblemeBoardHTML — cohérence avec des problèmes générés', () => {
	it('pour chaque problème réel : un champ par étape, data-answer = String(etape.answer)', () => {
		for (const l of PROBLEMES_LESSONS) {
			const lex = l.exerciseType.probLexique;
			for (let i = 0; i < 40; i++) {
				const ex = l.exerciseType.generate();
				if (ex.type !== 'probleme') continue;
				const q: ProbQuestion = {
					enonce: ex.enonce,
					etapes: ex.etapes,
					parle: ex.parle,
					figure: ex.figure,
				};
				const root = parse(lex ? renderProblemeBoardHTML(q, lex) : renderProblemeBoardHTML(q));
				const inputs = [...root.querySelectorAll<HTMLInputElement>('.prob-input')];
				expect(inputs.length).toBe(ex.etapes.length);
				inputs.forEach((inp, k) => {
					expect(Number(inp.dataset.i)).toBe(k);
					expect(inp.dataset.answer).toBe(String(ex.etapes[k].answer));
				});
				expect(root.querySelector('.prob-enonce')?.textContent).toBe(ex.enonce);
			}
		}
	});
});
