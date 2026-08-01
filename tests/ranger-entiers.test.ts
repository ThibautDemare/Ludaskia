/* ============================================================
   Numération CE2 — « Je range les nombres » (#448) : ordonner une série
   d'entiers dans l'ordre croissant OU décroissant.
   ------------------------------------------------------------
   Attendus DÉRIVÉS de l'énoncé de l'issue et du programme 2025 (« Ordonner des
   nombres dans l'ordre croissant ou décroissant », quantités jusqu'à 10 000), pas
   de l'implémentation : le tri attendu est recalculé ici par comparaison
   numérique, et le SENS attendu est lu dans la consigne affichée à l'enfant. Un
   test qui recopierait la formule interne figerait un bug aussi bien qu'un
   comportement correct.

   Le tirage est aléatoire (via `rnd`/`choice`/`sample`, déroutables par
   `withSeed`) : les bornes dures sont éprouvées par ÉCHANTILLONNAGE large sur des
   graines reproductibles — un échec est donc rejouable, jamais « à relancer ».

   Trois blocs :
   1. la leçon elle-même (câblage catalogue, invariants du tirage, calibrage,
      correction, déterminisme) ;
   2. le helper de mélange PARTAGÉ extrait dans core/utils (#448) ;
   3. la NON-RÉGRESSION du rangement alphabétique (#108), qui partage désormais
      le type d'exercice, le widget et l'aide contextuelle.
   ============================================================ */
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { getLessonById, genLessonItem, isOrderingLesson } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import { nettoyerSaisieNombre } from '../src/core/nombres';
import { melangerDifferemment, withSeed } from '../src/core/utils';
import { AIDES, aideVue, marquerAideVue, texteTtsAide } from '../src/core/aide';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { bindTuileInteraction } from '../src/ui/tuile-interaction';
import type { TuileSpec } from '../src/ui/tuile-interaction';
import { VOCAB_LESSONS } from '../src/data/francais/vocabulaire';
import type { Exercise } from '../src/core/exercise';

const ID = 'num-ranger';
/* Plafond exigé par l'issue (programme CE2 : « quantités et nombres jusqu'à 10 000 »). */
const PLAFOND_CE2 = 10000;
/* Bornes de longueur de série annoncées par l'issue (« 4-5 nombres »). */
const MIN_TUILES = 4;
const MAX_TUILES = 5;

type Rangement = Extract<Exercise, { type: 'tuilesOrdre' }>;

function asRangement(ex: Exercise): Rangement {
	if (ex.type !== 'tuilesOrdre') throw new Error(`type attendu 'tuilesOrdre', reçu '${ex.type}'`);
	return ex;
}

const typeRanger = () => getLessonById(ID)!.exerciseType;
const tirer = (): Rangement => asRangement(typeRanger().generate());

/* Valeur numérique d'un libellé de tuile, via le nettoyage maison des séparateurs
   de milliers (`formatNombre` en introduirait un au-delà de 9 999) : la mesure du
   plafond ne doit pas dépendre de la mise en forme. */
const valeur = (label: string): number => Number(nettoyerSaisieNombre(label));

/* SENS annoncé par la consigne, lu comme l'enfant le lit — jamais dérivé du code.
   Reconnaît les deux vocabulaires possibles (« du plus petit au plus grand » ou
   « ordre croissant/décroissant ») pour rester robuste à une reformulation du
   pédagogue, tout en exigeant que le sens SOIT annoncé (critère de l'issue). */
function sensAnnonce(question: string): 'croissant' | 'decroissant' | null {
	const s = question.toLowerCase();
	if (s.includes('décroissant')) return 'decroissant';
	if (s.includes('croissant')) return 'croissant';
	const iPetit = s.indexOf('petit');
	const iGrand = s.indexOf('grand');
	if (iPetit < 0 || iGrand < 0) return null;
	return iPetit < iGrand ? 'croissant' : 'decroissant';
}

/* Multi-ensemble comparable (permutation) : tri lexicographique des libellés. */
const memeContenu = (a: string[], b: string[]) =>
	JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const memeSuite = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((x, i) => x === b[i]);

/* --- Prédicats de CALIBRAGE, exprimés en termes d'enfant (pas de profils internes) --- */

/* La seule lecture des LONGUEURS ne suffit pas à ranger : deux nombres au moins ont
   le même nombre de chiffres. */
const longueurInsuffisante = (labels: string[]): boolean => {
	const tailles = labels.map((l) => l.length);
	return new Set(tailles).size < tailles.length;
};

/* La seule lecture du CHIFFRE DE TÊTE ne suffit pas non plus : deux nombres au moins
   ont même nombre de chiffres ET même chiffre de tête → il faut descendre au rang
   suivant. C'est la définition opérationnelle de « chiffres de tête proches ». */
const teteInsuffisante = (labels: string[]): boolean =>
	labels.some((a, i) => labels.slice(i + 1).some((b) => b.length === a.length && b[0] === a[0]));

/* La série FRANCHIT SERRÉ la barre ronde : un nombre juste en dessous (dizaine
   précédente) et un juste au-dessus. C'est là que « plus de chiffres = plus grand »
   doit primer sur la lecture chiffre à chiffre (« 8 > 1 donc 87 > 105 »). */
const franchit = (barre: 100 | 1000, valeurs: number[]): boolean =>
	valeurs.some((v) => v >= barre - 10 && v < barre) &&
	valeurs.some((v) => v >= barre && v < barre + 10);

describe('« Je range les nombres » — câblage catalogue (#448)', () => {
	it('leçon num-ranger : CE2-only, Numération, format « rangement d’une suite »', () => {
		const l = getLessonById(ID);
		expect(l).toBeDefined();
		expect(l!.subject).toBe('math');
		expect(l!.category).toBe('math-numeration');
		// CE2 uniquement : l'extension CM1 est explicitement hors périmètre de l'issue.
		expect(l!.levels).toEqual(['ce2']);
		// À plat dans la catégorie, pas rangée sous la rubrique CM1 « Nombres décimaux ».
		expect(l!.rubrique).toBeUndefined();
		// Étiquette de format → c'est elle qui aiguille vers le runner de rangement ET qui
		// écarte la leçon du sprint « une réponse à la fois » (ui/sprint.ts).
		expect(l!.exerciseType.exerciseKind).toBe('tuilesOrdre');
		expect(isOrderingLesson(l!)).toBe(true);
	});

	it('mono-mode « tuiles » : un seul moyen de répondre, donc parité triviale (#69)', () => {
		const modes = typeRanger().modes ?? [];
		expect(modes.map((m) => m.id)).toEqual(['tuiles']);
		expect(modes[0].label.trim().length).toBeGreaterThan(0);
	});
});

describe('« Je range les nombres » — invariants du tirage (échantillon large, #448)', () => {
	/* 40 graines × 100 tirages : les tirages s'enchaînent DANS une graine (le PRNG se
	   décorrèle), et les graines rendent chaque échec rejouable. */
	const GRAINES = 40;
	const PAR_GRAINE = 100;
	const TOTAL = GRAINES * PAR_GRAINE;

	it('tri exact dans le sens ANNONCÉ, valeurs distinctes, plafond et longueur tenus', () => {
		let croissants = 0;
		let decroissants = 0;
		for (let seed = 1; seed <= GRAINES; seed++) {
			withSeed(seed, () => {
				for (let i = 0; i < PAR_GRAINE; i++) {
					const ex = tirer();
					const où = `graine ${seed}, tirage ${i} : [${ex.ordre.join(' ; ')}]`;

					// Nature « nombres » : c'est elle qui accorde toute la formulation partagée.
					expect(ex.nature, où).toBe('nombres');

					// Longueur de série annoncée par l'issue (4 à 5 nombres).
					expect(ex.ordre.length, où).toBeGreaterThanOrEqual(MIN_TUILES);
					expect(ex.ordre.length, où).toBeLessThanOrEqual(MAX_TUILES);
					expect(ex.tuiles.length, où).toBe(ex.ordre.length);

					// Des ENTIERS écrits en chiffres, tous distincts, dans la plage CE2. Un
					// libellé à séparateur de milliers rendrait ambigu le repli texte (les
					// nombres y sont joints par « ; ») → il est exclu ici aussi.
					const valeurs = ex.ordre.map(valeur);
					for (const label of ex.ordre) expect(label, où).toMatch(/^\d+$/);
					for (const v of valeurs) {
						expect(Number.isInteger(v), où).toBe(true);
						expect(v, où).toBeGreaterThan(0);
						expect(v, où).toBeLessThanOrEqual(PLAFOND_CE2);
					}
					expect(new Set(valeurs).size, `${où} : valeur répétée`).toBe(valeurs.length);
					expect(new Set(ex.ordre).size, `${où} : libellé répété`).toBe(ex.ordre.length);

					// La consigne DIT le sens, et la suite attendue est exactement le tri
					// numérique dans ce sens (recalculé ici, pas relu dans le code).
					const sens = sensAnnonce(ex.question);
					expect(sens, `${où} : consigne « ${ex.question} » n'annonce aucun sens`).not.toBeNull();
					const attendu = [...valeurs].sort((a, b) => (sens === 'croissant' ? a - b : b - a));
					expect(valeurs, `${où} : suite non triée dans le sens annoncé (${sens})`).toEqual(
						attendu,
					);
					if (sens === 'croissant') croissants++;
					else decroissants++;

					// Les tuiles proposées sont bien la même série…
					expect(memeContenu(ex.tuiles, ex.ordre), `${où} : tuiles ≠ permutation de la suite`).toBe(
						true,
					);
					// …mais JAMAIS déjà dans l'ordre attendu : sinon l'exercice est gagné sans
					// rien déplacer. Vérifié pour les deux sens (le compteur ci-dessus prouve
					// que les deux sont bien passés par ici).
					expect(memeSuite(ex.tuiles, ex.ordre), `${où} : tuiles déjà rangées`).toBe(false);
				}
			});
		}
		// Les DEUX sens tombent effectivement (critère d'acceptation). Seuil très bas
		// devant un tirage équilibré : on éprouve la présence, pas une pondération.
		expect(croissants / TOTAL).toBeGreaterThan(0.2);
		expect(decroissants / TOTAL).toBeGreaterThan(0.2);
		expect(croissants + decroissants).toBe(TOTAL);
	});

	it('calibrage : ranger exige toujours plus que la longueur, et le plus souvent plus que le chiffre de tête', () => {
		let nbTete = 0;
		let total = 0;
		for (let seed = 101; seed <= 100 + GRAINES; seed++) {
			withSeed(seed, () => {
				for (let i = 0; i < PAR_GRAINE; i++) {
					const ex = tirer();
					total++;
					// BORNE DURE : jamais une série qui se range à la seule longueur des nombres
					// (toutes tailles distinctes) — ce serait un exercice de comptage de chiffres.
					expect(
						longueurInsuffisante(ex.ordre),
						`graine ${seed} : série rangeable à la seule longueur [${ex.ordre.join(' ; ')}]`,
					).toBe(true);
					if (teteInsuffisante(ex.ordre)) nbTete++;
				}
			});
		}
		/* Seuil justifié, pas ajusté sur la mesure : l'issue fait des « chiffres de tête
		   proches » la RÈGLE de calibrage (le profil « longueurs mêlées », qui se range à
		   vue, est annoncé minoritaire). La règle doit donc valoir pour la MAJORITÉ des
		   tirages → 50 %. On ne fige surtout pas la pondération exacte (30/20/20/20/10),
		   qui relève du pédagogue et peut bouger. */
		expect(nbTete / total).toBeGreaterThan(0.5);
	});

	it('cas charnière : 99/100 ET 999/1000 réellement représentés', () => {
		let cent = 0;
		let mille = 0;
		let total = 0;
		for (let seed = 201; seed <= 200 + GRAINES; seed++) {
			withSeed(seed, () => {
				for (let i = 0; i < PAR_GRAINE; i++) {
					const valeurs = tirer().ordre.map(valeur);
					total++;
					if (franchit(100, valeurs)) cent++;
					if (franchit(1000, valeurs)) mille++;
				}
			});
		}
		/* Seuils justifiés par l'USAGE, sans figer la pondération :
		   - une leçon fait 6 questions ; un franchissement présent dans 5 % des tirages
		     apparaît déjà dans ~26 % des séances → au-dessus du bruit, c'est bien « dans
		     la rotation » et non un accident. En dessous, l'enfant pourrait ne jamais
		     rencontrer le cas : critère de l'issue non tenu ;
		   - cumulés, les deux franchissements doivent tomber assez souvent pour qu'une
		     séance en contienne un le plus souvent : 15 % par tirage → ~62 % des séances
		     de 6 questions. Large marge sous le calibrage courant (~40 %), donc un
		     rééquilibrage pédagogique ne casse pas ce test. */
		expect(cent / total, 'charnière 99/100 sous-représentée').toBeGreaterThan(0.05);
		expect(mille / total, 'charnière 999/1000 sous-représentée').toBeGreaterThan(0.05);
		expect((cent + mille) / total).toBeGreaterThan(0.15);
	});
});

describe('« Je range les nombres » — correction (#448)', () => {
	const type = typeRanger();

	it('check() : accepte la suite écrite (espace, virgule ou point-virgule)', () => {
		for (let seed = 301; seed <= 320; seed++) {
			withSeed(seed, () => {
				const ex = tirer();
				expect(type.check(ex, ex.ordre.join(' '))).toBe(true);
				// Le repli texte AFFICHE les nombres séparés par « ; » : l'enfant qui recopie
				// cette forme doit être accepté.
				expect(type.check(ex, ex.ordre.join(' ; '))).toBe(true);
				expect(type.check(ex, ex.ordre.join(', '))).toBe(true);
				expect(type.check(ex, ex.ordre.join(';'))).toBe(true);
				expect(type.check(ex, `  ${ex.ordre.join('   ')}  `)).toBe(true); // espaces multiples
			});
		}
	});

	it('check() : refuse la suite INVERSÉE (piège du sens) et les permutations', () => {
		for (let seed = 401; seed <= 430; seed++) {
			withSeed(seed, () => {
				const ex = tirer();
				const inverse = [...ex.ordre].reverse();
				expect(memeSuite(inverse, ex.ordre)).toBe(false); // garde : la série a ≥ 4 valeurs
				expect(type.check(ex, inverse.join(' ')), 'suite inversée acceptée').toBe(false);

				// Permutation minimale : deux voisins échangés.
				const echange = [...ex.ordre];
				[echange[0], echange[1]] = [echange[1], echange[0]];
				expect(type.check(ex, echange.join(' ')), 'permutation acceptée').toBe(false);

				// Suite incomplète, suite avec un intrus, saisie vide, chiffres collés.
				expect(type.check(ex, ex.ordre.slice(0, -1).join(' '))).toBe(false);
				expect(type.check(ex, [...ex.ordre, '7'].join(' '))).toBe(false);
				expect(type.check(ex, '')).toBe(false);
				expect(type.check(ex, ex.ordre.join(''))).toBe(false);
			});
		}
	});

	it('genLessonItem : repli texte à séparateur « ; », JAMAIS la virgule (séparateur décimal)', () => {
		const lesson = getLessonById(ID)!;
		for (let seed = 501; seed <= 540; seed++) {
			withSeed(seed, () => {
				const it = genLessonItem(lesson, 'ce2');
				expect(it.kind).toBe('text');
				expect(it.text).toContain('@'); // emplacement du champ de saisie

				// En français la virgule est le séparateur DÉCIMAL : « 450, 405 » se lirait
				// comme un nombre à virgule. Aucune virgule ne doit apparaître dans la ligne.
				expect(it.text, `virgule dans « ${it.text} »`).not.toContain(',');

				// Les tuiles listées entre parenthèses sont bien la série attendue, mélangée.
				const liste = it.text.match(/\(([^)]*)\)/);
				expect(liste, `pas de liste de tuiles dans « ${it.text} »`).not.toBeNull();
				const tuiles = liste![1].split(' ; ');
				const attendue = String(it.answer).split(' ');
				expect(tuiles.length).toBe(attendue.length);
				expect(memeContenu(tuiles, attendue)).toBe(true);
				expect(memeSuite(tuiles, attendue), 'tuiles déjà rangées dans le repli texte').toBe(false);

				// Correction de scoring : la suite rangée passe, y compris écrite avec « ; » ;
				// la suite inversée et le désordre sont refusés.
				expect(checkItemAnswer(it, String(it.answer))).toBe(true);
				expect(checkItemAnswer(it, attendue.join(' ; '))).toBe(true);
				expect(checkItemAnswer(it, [...attendue].reverse().join(' '))).toBe(false);
				expect(checkItemAnswer(it, tuiles.join(' '))).toBe(false);
			});
		}
	});
});

describe('« Je range les nombres » — déterminisme du tirage (#448)', () => {
	const serie = () => {
		const ex = tirer();
		return `${ex.question}|${ex.tuiles.join(',')}|${ex.ordre.join(',')}`;
	};

	it('même graine ⇒ même suite de tirages (rejouable)', () => {
		for (const graine of [7, 1234, 20260801]) {
			const a = withSeed(graine, () => [serie(), serie(), serie(), serie(), serie()]);
			const b = withSeed(graine, () => [serie(), serie(), serie(), serie(), serie()]);
			expect(b).toEqual(a);
		}
	});

	it('garde anti-tautologie : la graine fait bien varier le tirage', () => {
		// Sans cette garde, le test précédent passerait aussi sur un générateur figé.
		const vus = new Set<string>();
		for (let graine = 1; graine <= 30; graine++) vus.add(withSeed(graine, serie));
		expect(vus.size).toBeGreaterThan(25);
	});
});

/* ============================================================
   Helper de mélange PARTAGÉ (core/utils, extrait par #448) — deux appelants :
   l'ordre alphabétique (#108) et l'ordre des nombres (#448). Son contrat n'est pas
   « mélanger » mais « mélanger DIFFÉREMMENT » : c'est lui qui garantit qu'aucun
   exercice de rangement n'arrive déjà résolu.
   ============================================================ */
describe('melangerDifferemment (core/utils, #448)', () => {
	it('permutation de même contenu, entrée jamais mutée', () => {
		for (let graine = 1; graine <= 200; graine++) {
			withSeed(graine, () => {
				const src = ['95', '98', '102', '104'];
				const copie = [...src];
				const out = melangerDifferemment(src);
				expect(src).toEqual(copie); // pas de mutation en place
				expect(out.length).toBe(src.length);
				expect(memeContenu(out, src)).toBe(true);
			});
		}
	});

	it('éléments distincts ⇒ l’ordre DIFFÈRE toujours de l’entrée (le cœur du contrat)', () => {
		const cas = [
			['a', 'b'],
			['a', 'b', 'c'],
			['10', '20', '30', '40'],
			['1', '2', '3', '4', '5'],
		];
		for (let graine = 1; graine <= 300; graine++) {
			withSeed(graine, () => {
				for (const src of cas) {
					const out = melangerDifferemment(src);
					expect(memeSuite(out, src), `graine ${graine} : [${src.join(',')}] non mélangée`).toBe(
						false,
					);
				}
			});
		}
	});

	it('deux éléments distincts : un seul autre ordre possible ⇒ toujours l’échange', () => {
		for (let graine = 1; graine <= 100; graine++) {
			withSeed(graine, () => {
				expect(melangerDifferemment(['x', 'y'])).toEqual(['y', 'x']);
			});
		}
	});

	it('cas dégénérés : 0 ou 1 élément ⇒ copie rendue telle quelle (aucun autre ordre)', () => {
		const vide: string[] = [];
		const seul = ['unique'];
		expect(melangerDifferemment(vide)).toEqual([]);
		expect(melangerDifferemment(vide)).not.toBe(vide); // nouvelle instance
		expect(melangerDifferemment(seul)).toEqual(['unique']);
		expect(melangerDifferemment(seul)).not.toBe(seul);
	});

	it('cas dégénéré : éléments TOUS ÉGAUX ⇒ pas de boucle infinie, contenu préservé', () => {
		// Aucun mélange ne peut « différer » d'une suite d'éléments identiques : le
		// helper doit rendre la main (repli borné), pas tourner indéfiniment.
		for (let graine = 1; graine <= 50; graine++) {
			withSeed(graine, () => {
				const out = melangerDifferemment(['x', 'x', 'x']);
				expect(out).toEqual(['x', 'x', 'x']);
			});
		}
	});

	it('doublon PARTIEL : un autre ordre existe, il est trouvé', () => {
		for (let graine = 1; graine <= 100; graine++) {
			withSeed(graine, () => {
				const src = ['a', 'a', 'b'];
				const out = melangerDifferemment(src);
				expect(memeContenu(out, src)).toBe(true);
				expect(memeSuite(out, src), `graine ${graine} : mélange resté identique`).toBe(false);
			});
		}
	});

	it('déterminisme : même graine ⇒ même mélange', () => {
		const src = ['1', '2', '3', '4', '5'];
		const a = withSeed(99, () => melangerDifferemment(src));
		const b = withSeed(99, () => melangerDifferemment(src));
		expect(b).toEqual(a);
	});
});

/* ============================================================
   NON-RÉGRESSION du rangement alphabétique (#108) — c'est le risque principal de
   #448 : la leçon de vocabulaire partage désormais le type d'exercice
   (`nature` optionnelle), le widget de tuiles et l'aide contextuelle avec la leçon
   de nombres. Le `nature` absent DOIT rester le comportement historique « mots ».
   ============================================================ */
const IDS_ALPHA = ['fr-vocab-alpha-initiale', 'fr-vocab-alpha-deuxieme'];

describe('Rangement alphabétique — le partage avec #448 ne change rien (#108)', () => {
	it('les exercices de mots ne portent AUCUNE nature (défaut historique)', () => {
		for (const def of VOCAB_LESSONS) {
			for (let graine = 1; graine <= 40; graine++) {
				withSeed(graine, () => {
					const ex = def.exerciseType.generate({ mode: 'tuiles' });
					// `nature` absente = « mots » : si un jour elle valait 'nombres', le widget
					// dirait « les nombres » à un enfant qui a des MOTS sous les yeux.
					expect(asRangement(ex).nature, `${def.id} @ graine ${graine}`).toBeUndefined();
				});
			}
		}
	});

	it('repli texte des mots : séparateur VIRGULE conservé (pas le « ; » des nombres)', () => {
		for (const id of IDS_ALPHA) {
			const lesson = getLessonById(id)!;
			for (let graine = 1; graine <= 20; graine++) {
				withSeed(graine, () => {
					const it = genLessonItem(lesson, 'ce2');
					const liste = it.text.match(/\(([^)]*)\)/);
					expect(liste, `${id} : pas de liste de tuiles`).not.toBeNull();
					expect(liste![1], `${id} : « ; » apparu dans une liste de MOTS`).not.toContain(';');
					const tuiles = liste![1].split(', ');
					const attendue = String(it.answer).split(' ');
					expect(tuiles.length).toBe(attendue.length);
					expect(memeContenu(tuiles, attendue)).toBe(true);
					// La forme « mot, mot, mot » reste acceptée (comportement #108).
					expect(checkItemAnswer(it, attendue.join(', '))).toBe(true);
					expect(checkItemAnswer(it, String(it.answer))).toBe(true);
				});
			}
		}
	});
});

describe('Widget de rangement partagé — la nature ne change QUE la formulation (#448)', () => {
	/* Consigne HISTORIQUE du widget (#108), verrouillée au caractère près : c'est
	   exactement la phrase que #448 ne devait pas altérer pour les mots. Apostrophe
	   droite (choix acté du projet pour l'accessibilité clavier). */
	const CONSIGNE_MOTS = "Tape les mots dans l'ordre (ou glisse-les dans les cases).";

	const ORDRE = ['7', '12', '30'];
	const TUILES = ['30', '7', '12'];
	/* Série de 4 tuiles pour les parcours au clavier (la vraie leçon en sert 4 ou 5) :
	   le bac est volontairement dans un ordre quelconque, pour que « la tuile suivante »
	   ne se confonde pas avec « la tuile suivante de la bonne suite ». */
	const ORDRE4 = ['1', '2', '3', '4'];
	const TUILES4 = ['3', '1', '4', '2'];

	function monter(nature?: 'mots' | 'nombres', ordre = ORDRE, tuiles = TUILES) {
		const root = document.createElement('div');
		root.innerHTML = '<div data-tuile-mount></div>';
		document.body.appendChild(root);
		const etats: boolean[] = [];
		const spec: TuileSpec = nature
			? { kind: 'ordre', question: 'Range.', ordre, tuiles, nature }
			: { kind: 'ordre', question: 'Range.', ordre, tuiles };
		const ctrl = bindTuileInteraction(root, spec, {
			variant: 'lecon',
			onState: (complete) => etats.push(complete),
		});
		return { root, ctrl, etats };
	}

	const consigne = (root: HTMLElement) => root.querySelector('.ltui-consigne')!.textContent;
	const arias = (root: HTMLElement) =>
		[...root.querySelectorAll<HTMLElement>('.lord-tuile')].map((b) => b.getAttribute('aria-label'));
	const cases = (root: HTMLElement) =>
		[...root.querySelectorAll<HTMLElement>('.lord-cell')].map((c) => ({
			mot: c.querySelector('.lord-mot')!.textContent,
			etat: c.classList.contains('correct') ? '✓' : c.classList.contains('wrong') ? '✗' : '',
		}));

	function taper(root: HTMLElement, val: string): void {
		const btn = [...root.querySelectorAll<HTMLButtonElement>('.lord-tuile')].find(
			(b) => b.dataset.val === val,
		);
		if (!btn) throw new Error(`tuile « ${val} » absente du bac`);
		btn.click();
	}

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('sans nature (ordre alphabétique) : consigne et aria-labels INCHANGÉS', () => {
		const { root } = monter();
		expect(consigne(root)).toBe(CONSIGNE_MOTS);
		expect(arias(root)).toEqual(['Ranger le mot 30', 'Ranger le mot 7', 'Ranger le mot 12']);
	});

	it('nature « mots » explicite : même formulation que sans nature', () => {
		const { root } = monter('mots');
		expect(consigne(root)).toBe(CONSIGNE_MOTS);
		expect(arias(root)).toEqual(['Ranger le mot 30', 'Ranger le mot 7', 'Ranger le mot 12']);
	});

	it('nature « nombres » : on parle de NOMBRES, jamais de mots', () => {
		const { root } = monter('nombres');
		const c = consigne(root)!;
		expect(c).toContain('les nombres');
		expect(c).not.toContain('les mots');
		for (const a of arias(root)) {
			expect(a).toContain('le nombre');
			expect(a).not.toContain('le mot');
		}
	});

	it('comportement IDENTIQUE mots/nombres : complétude, verdict, marques, réponse posée', () => {
		for (const suite of [ORDRE, [...ORDRE].reverse()] as const) {
			const attendu = memeSuite(suite, ORDRE);
			const mots = monter();
			const nombres = monter('nombres');
			for (const v of suite) {
				taper(mots.root, v);
				taper(nombres.root, v);
			}
			// Le bouton « Vérifier » s'active au même moment de part et d'autre.
			expect(nombres.etats).toEqual(mots.etats);
			expect(mots.etats[mots.etats.length - 1]).toBe(true);

			expect(mots.ctrl.verify()).toBe(attendu);
			expect(nombres.ctrl.verify()).toBe(attendu);
			// Marques ✓/✗ case par case identiques.
			expect(cases(nombres.root)).toEqual(cases(mots.root));
			// Réponse posée (journal d'erreurs #391) identique.
			expect(nombres.ctrl.reponse!()).toEqual(mots.ctrl.reponse!());
			expect(mots.ctrl.reponse!()).toEqual({ kind: 'ordre', propose: [...suite] });
			document.body.innerHTML = '';
		}
	});

	/* --- Persistance du focus au clavier ---
	   Le widget reconstruit `seq` ET `bac` par innerHTML à chaque interaction : sans
	   restauration, l'élément focalisé est détruit et le focus retombe sur <body>, donc
	   l'enfant au clavier retabule depuis le haut de la page à CHAQUE tuile (4 à 5 fois
	   par question) — alors que la compétence testée est d'ordonner, pas de tabuler.
	   Attendu dérivé du besoin : après chaque pose, le focus doit rester sur quelque
	   chose d'utile ; quand il n'y a plus rien à poser, sur le bac, d'où UNE tabulation
	   atteint « Vérifier ». */

	/* Identité de l'élément focalisé, résumée en une chaîne comparable. */
	const focusé = (): string => {
		const el = document.activeElement as HTMLElement | null;
		if (!el || el === document.body || el === document.documentElement) return '(body)';
		if (el.id) return `#${el.id}`;
		if (el.classList.contains('lord-tuile')) return `tuile[${el.dataset.val}]`;
		if (el.classList.contains('lord-cell')) return `case[${el.dataset.pos}]`;
		return `autre[${el.className}]`;
	};

	const tuilesDisponibles = (root: HTMLElement) =>
		[...root.querySelectorAll<HTMLButtonElement>('.lord-tuile')]
			.filter((b) => !b.classList.contains('tuile-used'))
			.map((b) => b.dataset.val);

	it('pose : le focus ne retombe JAMAIS sur <body> — toujours une tuile encore disponible', () => {
		// Éprouvé sur plusieurs ordres de pose, dont un qui commence par la dernière tuile
		// du bac (le balayage doit repartir du début plutôt que d'abandonner).
		for (const parcours of [
			['3', '1', '4', '2'],
			['2', '4', '1', '3'],
			['1', '2', '3', '4'],
		]) {
			const { root } = monter('nombres', ORDRE4, TUILES4);
			parcours.forEach((val, rang) => {
				taper(root, val);
				const dispo = tuilesDisponibles(root);
				const cible = focusé();
				expect(cible, `après « ${val} » (${rang + 1}/4)`).not.toBe('(body)');
				if (dispo.length) {
					// Une tuile reste à poser → le focus est sur l'une d'elles (jamais sur une
					// tuile déjà posée, qui est `disabled`).
					expect(dispo, `focus ${cible} hors des tuiles disponibles`).toContain(
						cible.replace(/^tuile\[|\]$/g, ''),
					);
				} else {
					// Rangée complète : repli sur le bac, d'où « Vérifier » est à une tabulation.
					expect(cible).toBe('#lordBac');
				}
			});
			document.body.innerHTML = '';
		}
	});

	it('pose : le focus avance dans le sens de lecture du bac (séquence nominale)', () => {
		const { root } = monter('nombres', ORDRE4, TUILES4);
		const suivi: string[] = [];
		for (const val of ['3', '1', '4', '2']) {
			taper(root, val);
			suivi.push(focusé());
		}
		// Bac = 3 · 1 · 4 · 2, jamais réordonné → après « 3 » vient « 1 », etc., puis le bac.
		expect(suivi).toEqual(['tuile[1]', 'tuile[4]', 'tuile[2]', '#lordBac']);
	});

	it('retrait : le focus revient sur la tuile relâchée, redevenue disponible', () => {
		const { root } = monter('nombres', ORDRE4, TUILES4);
		for (const val of ['1', '2', '3', '4']) taper(root, val);
		expect(focusé()).toBe('#lordBac');
		// L'enfant retire la tuile de la case 1 : c'est elle qu'il va vouloir replacer.
		const case1 = root.querySelector<HTMLButtonElement>('.lord-cell[data-pos="0"]')!;
		case1.click();
		expect(focusé()).toBe('tuile[1]');
		expect(tuilesDisponibles(root)).toEqual(['1']);
	});

	it('4 activations d’affilée posent 4 tuiles : aucune tabulation intermédiaire', () => {
		// Le geste clavier réel : Entrée active la tuile focalisée. On enchaîne donc sur
		// l'élément focalisé, sans jamais rechercher la tuile suivante « à la main » —
		// exactement ce qui serait impossible si le focus retombait sur <body>.
		const { root } = monter('nombres', ORDRE4, TUILES4);
		root.querySelector<HTMLButtonElement>('.lord-tuile')!.focus();
		for (let i = 0; i < 4; i++) {
			const actif = document.activeElement as HTMLButtonElement;
			expect(actif.classList.contains('lord-tuile'), `étape ${i + 1} : focus hors du bac`).toBe(
				true,
			);
			actif.click();
		}
		expect(cases(root).map((c) => c.mot)).toEqual(['3', '1', '4', '2']);
		expect(focusé()).toBe('#lordBac');
	});

	it('parité : la séquence de focus ne dépend QUE de l’interaction, jamais de la nature', () => {
		// Sans ça, le test de parité ci-dessus perdrait son sens : `nature` pourrait
		// changer le parcours clavier sans changer le verdict.
		const parcours = ['4', '3', '2', '1'];
		const suivre = (nature?: 'mots' | 'nombres'): string[] => {
			const { root } = monter(nature, ORDRE4, TUILES4);
			const out = parcours.map((val) => {
				taper(root, val);
				return focusé();
			});
			// Un retrait, pour couvrir aussi ce chemin.
			root.querySelector<HTMLButtonElement>('.lord-cell[data-pos="1"]')!.click();
			out.push(focusé());
			document.body.innerHTML = '';
			return out;
		};
		const mots = suivre();
		expect(suivre('mots')).toEqual(mots);
		expect(suivre('nombres')).toEqual(mots);
		expect(mots).not.toContain('(body)');
	});
});

describe('Aide contextuelle — l’aide des mots intacte, celle des nombres accordée (#448)', () => {
	beforeEach(() => {
		localStorage.clear();
		setOnDataWrite(touchActiveProfile);
		initProfiles();
	});

	it('AIDES.ordre (mots) : contenu historique inchangé, aucune mention de « nombre »', () => {
		const a = AIDES.ordre;
		expect(a.titre).toBe('Comment ranger les mots ?');
		expect(a.etapes[0]).toBe('Touche le mot qui vient en premier.');
		expect(a.reparation).toBe("Tu t'es trompé ? Touche un mot rangé, il revient.");
		for (const phrase of [...a.etapes, a.reparation ?? '']) {
			expect(phrase).not.toContain('nombre');
		}
	});

	it('AIDES.ordreNombres : bien formée, parle de nombres et jamais de mots', () => {
		const a = AIDES.ordreNombres;
		expect(a.titre.trim().length).toBeGreaterThan(0);
		expect(a.etapes.length).toBeGreaterThan(0);
		expect(a.etapes.length).toBeLessThanOrEqual(3); // charge cognitive CE2
		expect(a.etapes.every((e) => e.trim().length > 0)).toBe(true);
		expect(a.reparation?.trim().length).toBeGreaterThan(0);
		const tout = [a.titre, ...a.etapes, a.reparation ?? ''].join(' ');
		expect(tout).toContain('nombre');
		// Le piège du copier-coller : une aide de nombres qui parlerait encore de « mot ».
		expect(tout).not.toMatch(/\bmot\b/);
		// Le TTS lit bien l'aide complète.
		const tts = texteTtsAide('ordreNombres');
		expect(tts).toContain(a.titre);
		expect(tts).toContain(a.etapes[0]);
		expect(tts).toContain(a.reparation!);
	});

	it('mémoire « déjà vue » séparée : voir l’aide des nombres ne masque pas celle des mots', () => {
		marquerAideVue('ordreNombres');
		expect(aideVue('ordreNombres')).toBe(true);
		// Sinon l'enfant qui a rangé des nombres n'aurait plus la bulle d'aide au premier
		// rangement alphabétique (et réciproquement).
		expect(aideVue('ordre')).toBe(false);
		marquerAideVue('ordre');
		expect(aideVue('ordre')).toBe(true);
		expect(aideVue('ordreNombres')).toBe(true);
	});
});
