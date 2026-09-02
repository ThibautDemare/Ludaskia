/* ============================================================
   Étayage (#490) — résolution GÉNÉRÉE d'un problème à étapes.
   ------------------------------------------------------------
   Auteur des tests distinct de l'auteur du code. Ce moteur est le seul à énoncer un
   CALCUL qu'il n'a pas fait : il recopie le `calcul` que le générateur a posé à côté de
   la réponse. Deux choses peuvent donc être fausses, et aucune ne se voit à la lecture du
   déroulé — un `calcul` inexact côté données, ou un `calcul` juste mal restitué. Les deux
   se prennent de la même façon : on relit l'égalité AFFICHÉE et on la vérifie.

   Comment l'attendu est dérivé, sans recopier le module :
   - l'égalité « a op b = r » est jugée en ARITHMÉTIQUE DÉCIMALE EXACTE (tout est ramené en
     centièmes entiers), parce que c'est ce que l'enfant lit : « 7,5 + 3,2 = 10,7 » est vrai
     même si les doubles correspondants ne s'additionnent pas exactement. Un test en
     flottant serait à la fois trop laxiste et faussement rouge ;
   - le résultat annoncé doit être la RÉPONSE ATTENDUE de la sous-question — celle que le
     runner corrige (`etapes[].answer`), pas une valeur recalculée par le déroulé ;
   - les opérandes doivent venir de quelque part que l'enfant peut voir : un nombre de
     l'ÉNONCÉ, ou la réponse d'une sous-question PRÉCÉDENTE. Un nombre qui ne vient ni de
     l'un ni de l'autre tomberait du ciel.

   Ce qui est éprouvé en plus :
   - le REFUS, sur les deux familles qui n'ont volontairement pas de `calcul` (division
     avec reste, durée décomposée en heures et minutes) : déroulé vide, pas de panneau —
     un déroulé y réciterait les réponses, ce que la révélation (#467) fait déjà ;
   - le CHAÎNAGE (`etapeSource`) : annoncé quand il a lieu, jamais autrement.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	cibleEtape,
	derouleProbleme,
	etapeSource,
	type ProblemeSpec,
} from '../src/core/etayage-probleme';
import { PAS_MAX, derouleMontrable } from '../src/core/etayage-deroule';
import { attenduEtapeTexte } from '../src/core/probleme-etapes';
import type { CalculEtape, Exercise, ProblemeEtape } from '../src/core/exercise';
import { getLessonById, type LessonDef, type SchoolLevel } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
};

/* ---------- Arithmétique décimale EXACTE ----------
   Toutes les valeurs de l'appli sont des k/100 (argent) ou des k/10 (mesures) : ramenées
   en centièmes entiers, elles se comparent sans le moindre artefact de flottant. C'est
   aussi la seule façon de juger ce que l'enfant LIT (« 7,5 + 3,2 = 10,7 »). */
const enCentiemes = (valeur: number): number => Math.round(valeur * 100);
const depuisTexte = (texte: string): number => enCentiemes(Number(texte.replace(',', '.')));

/** L'égalité « a op b = r » est-elle vraie, en décimal exact ? */
function egaliteVraie(op: CalculEtape['op'], a: number, b: number, r: number): boolean {
	const [A, B, R] = [a, b, r];
	if (op === '+') return A + B === R;
	if (op === '-') return A - B === R;
	if (op === 'x') return A * B === R * 100;
	return B !== 0 && A * 100 === R * B;
}

/* ---------- Spécification, telle que le runner la construit ----------
   `ui/lecon-probleme.ts` passe au panneau l'énoncé et les étapes de l'item raté : rien de
   plus, et surtout aucun exemple canonique (ces leçons n'en déclarent pas). */
function specDe(ex: Exercise): ProblemeSpec {
	if (ex.type !== 'probleme') throw new Error(`type ${ex.type} au lieu d'un problème`);
	return { enonce: ex.enonce, etapes: ex.etapes };
}

const etape = (question: string, answer: number, calcul?: CalculEtape): ProblemeEtape =>
	calcul ? { question, answer, calcul } : { question, answer };

/* ============================================================
   1. LE FIL DE LA RÉSOLUTION
   ============================================================ */
describe('derouleProbleme — relire, puis une sous-question à la fois', () => {
	it('une seule sous-question : on relit, puis on calcule — sans la numéroter', () => {
		const d = derouleProbleme({
			enonce: 'Dans la boîte, il y a 12 billes rouges et 7 billes bleues.',
			etapes: [etape('Combien y a-t-il de billes en tout ?', 19, { op: '+', a: 12, b: 7 })],
		});
		expect(d.pas.length).toBe(2);
		// 1. Relire l'énoncé AVANT de calculer : le geste que saute l'enfant qui attrape les
		//    deux nombres au hasard.
		expect(d.pas[0].actifs).toEqual(['enonce']);
		expect(d.pas[0].ecritures).toBeUndefined();
		// 2. La sous-question, son calcul, et la réponse écrite à sa place.
		expect(d.pas[1].phrase).toContain('Combien y a-t-il de billes en tout ?');
		expect(d.pas[1].phrase).toContain('12 + 7 = 19');
		expect(d.pas[1].ecritures).toEqual([{ cible: cibleEtape(0), texte: '19' }]);
		expect(d.pas[1].actifs).toEqual([cibleEtape(0)]);
		// Une seule question : la numéroter (« Première question ») n'aurait aucun sens.
		expect(d.pas[1].phrase).not.toMatch(/question :/i);
	});

	it('deux sous-questions : elles sont numérotées, et la reprise du résultat est dite', () => {
		// 4 cahiers à 3 € payés avec un billet de 20 € : 4 × 3 = 12, puis 20 − 12 = 8. Le 12
		// de la seconde question EST le résultat de la première — c'est exactement ce qui se
		// perd dans un problème à deux étapes.
		const d = derouleProbleme({
			enonce: 'Léa achète 4 cahiers à 3 € chacun. Elle paie avec un billet de 20 €.',
			etapes: [
				etape('Combien coûtent les 4 cahiers ?', 12, { op: 'x', a: 4, b: 3 }),
				// `deB: 0` : le 12 est DÉCLARÉ comme venant de la 1re sous-question, il n'est pas
				// deviné par égalité de valeur (cf. le bloc « etapeSource » plus bas).
				etape('Combien lui rend-on ?', 8, { op: '-', a: 20, b: 12, deB: 0 }),
			],
		});
		expect(d.pas.length).toBe(3);
		expect(d.pas[1].phrase).toContain('Première question');
		expect(d.pas[1].phrase).toContain('4 × 3 = 12');
		expect(d.pas[2].phrase).toContain('Deuxième question');
		expect(d.pas[2].phrase).toContain('20 − 12 = 8');
		expect(d.pas[2].phrase).toContain('12');
		expect(d.pas[2].phrase).toMatch(/vient de la question d'avant/);
		expect(d.pas[2].ecritures).toEqual([{ cible: cibleEtape(1), texte: '8' }]);
	});

	it('aucune reprise à annoncer quand les deux nombres viennent de l’énoncé', () => {
		const d = derouleProbleme({
			enonce: 'Tom a 30 billes. Il en donne 8. Puis il achète 5 images.',
			etapes: [
				etape('Combien Tom a-t-il de billes ?', 22, { op: '-', a: 30, b: 8 }),
				etape("Combien Tom a-t-il d'images ?", 5, { op: '+', a: 0, b: 5 }),
			],
		});
		expect(d.pas[2].phrase).not.toMatch(/vient de la question/);
	});

	it('une sous-question SANS calcul donne sa réponse, sans inventer d’opération', () => {
		// Mélange volontaire : une étape calculable, une qui ne l'est pas. La seconde ne doit
		// énoncer aucune égalité — c'est tout l'intérêt du champ optionnel.
		const d = derouleProbleme({
			enonce: 'On range 17 jetons par paquets de 5. Chaque paquet coûte 2 €.',
			etapes: [
				etape('Combien de paquets complets ?', 3),
				etape('Combien coûtent-ils ?', 6, { op: 'x', a: 3, b: 2 }),
			],
		});
		expect(d.pas.length).toBe(3);
		expect(d.pas[1].phrase).toContain('3');
		expect(d.pas[1].phrase).not.toContain('=');
		expect(d.pas[1].phrase).not.toMatch(/[+×÷−]/);
		expect(d.pas[1].ecritures).toEqual([{ cible: cibleEtape(0), texte: '3' }]);
		// L'étape calculable, elle, garde son calcul.
		expect(d.pas[2].phrase).toContain('3 × 2 = 6');
	});

	it('les réponses décimales sont écrites à la française, virgule comprise', () => {
		const d = derouleProbleme({
			enonce: 'Zoé achète un cahier à 7,50 € et une gomme à 3,20 €.',
			etapes: [etape('Combien paie-t-elle en tout ?', 10.7, { op: '+', a: 7.5, b: 3.2 })],
		});
		expect(d.pas[1].phrase).toContain('7,5 + 3,2 = 10,7');
		// Aucun point DÉCIMAL (le point final de la phrase, lui, est légitime) : « 10.7 »
		// serait l'écriture anglo-saxonne, et le TTS la lirait « dix point sept ».
		expect(d.pas[1].phrase).not.toMatch(/\d\.\d/);
		expect(d.pas[1].ecritures).toEqual([{ cible: cibleEtape(0), texte: '10,7' }]);
	});

	it('le calcul est RECOPIÉ des données : rien ici ne le vérifie', () => {
		// Constat, et il commande tout le reste de ce fichier : le moteur n'a aucun garde-fou
		// arithmétique. Il affiche l'opération que le générateur a posée à côté de la réponse,
		// et prend le résultat DANS l'étape (ce qui évite de refaire un calcul décimal en
		// flottant, mais ne recoupe rien). Un `calcul` inexact côté données serait donc servi
		// tel quel, à un enfant qui vient d'échouer — d'où le balayage des vrais générateurs
		// plus bas, seule ligne de défense.
		const d = derouleProbleme({
			enonce: 'Énoncé de test.',
			etapes: [etape('Combien en tout ?', 19, { op: '+', a: 12, b: 8 })],
		});
		expect(d.pas[1].phrase).toContain('12 + 8 = 19'); // faux, et pourtant affiché
	});
});

/* ============================================================
   2. REFUS PROPRE
   ============================================================ */
describe('derouleProbleme — se taire plutôt que réciter les réponses', () => {
	it('aucune sous-question ne porte son calcul : déroulé vide', () => {
		const d = derouleProbleme({
			enonce: 'On partage 17 jetons en 5 paniers égaux.',
			etapes: [etape('Combien de jetons par panier ?', 3), etape('Combien en reste-t-il ?', 2)],
		});
		expect(d.pas).toEqual([]);
		expect(d.titre).toBe('');
		expect(derouleMontrable(d)).toBe(false);
	});

	it('un problème sans sous-question ne se déroule pas', () => {
		expect(derouleProbleme({ enonce: 'Rien à faire.', etapes: [] }).pas).toEqual([]);
	});
});

/* ============================================================
   3. LE CHAÎNAGE, ISOLÉ
   ============================================================ */
describe('etapeSource — d’où vient ce nombre ?', () => {
	/* La source est DÉCLARÉE par le générateur (`deA`/`deB`), plus déduite d'une égalité de
	   valeurs : la déduction annonçait un chaînage à la première coïncidence et manquait
	   celui d'un résultat réutilisé transformé. Ces tests éprouvent donc la lecture de la
	   déclaration, ET son refus des index qui n'ont pas de sens. */
	const chaine = (deB: number) => etape('q', 8, { op: '-', a: 20, b: 12, deB });

	it('lit l’étape déclarée comme source d’un opérande', () => {
		const etapes = [etape('q1', 12), chaine(0)];
		expect(etapeSource(etapes, 1)).toBe(0);
	});

	it('sans déclaration, aucun chaînage — même si la valeur coïncide', () => {
		// 12 est bien la réponse de la 1re sous-question, et l'opérande vaut 12 : l'ancienne
		// détection par égalité aurait annoncé une reprise qui n'existe pas.
		const etapes = [etape('q1', 12), etape('q2', 3, { op: ':', a: 36, b: 12 })];
		expect(etapeSource(etapes, 1)).toBe(-1);
	});

	it('ne regarde QUE vers l’arrière : un index à venir ou le sien sont ignorés', () => {
		expect(etapeSource([chaine(1), etape('q2', 12)], 0)).toBe(-1);
		expect(etapeSource([etape('q1', 12), chaine(1)], 1)).toBe(-1);
		expect(etapeSource([etape('q1', 12), chaine(-1)], 1)).toBe(-1);
	});

	it('une étape sans calcul, ou une liste vide, ne vient de nulle part', () => {
		expect(etapeSource([etape('q1', 12), etape('q2', 8)], 1)).toBe(-1);
		expect(etapeSource([], 0)).toBe(-1);
	});
});

/* ============================================================
   4. ÉCHANTILLON — les vrais problèmes des six leçons
   ============================================================ */
const LECONS_PROBLEME = [
	'math-prob-composition',
	'math-prob-transformation',
	'math-prob-multiplication',
	'math-prob-partage',
	'math-prob-comparaison',
	'math-prob-deux-etapes',
];

interface TireProbleme {
	ou: string;
	id: string;
	niveau: SchoolLevel;
	spec: ProblemeSpec;
}

function problemes(parCombinaison: number): TireProbleme[] {
	const out: TireProbleme[] = [];
	for (const id of LECONS_PROBLEME) {
		const l = lecon(id);
		for (const niveau of (l.levels ?? ['ce2']) as SchoolLevel[]) {
			for (let seed = 1; seed <= parCombinaison; seed++) {
				const ex = withSeed(seed, () => l.exerciseType.generate({ level: niveau }));
				out.push({ ou: `${id}/${niveau}/${seed}`, id, niveau, spec: specDe(ex) });
			}
		}
	}
	return out;
}

/* Les nombres LISIBLES dans l'énoncé, en centièmes (« 7,50 € » → 750, « 3 cahiers » → 300).
   Sert à vérifier qu'un opérande ne tombe pas du ciel. */
function nombresEnonce(enonce: string): Set<number> {
	const out = new Set<number>();
	for (const m of enonce.matchAll(/\d+(?:,\d+)?/g)) out.add(depuisTexte(m[0]));
	return out;
}

describe('INVARIANTS sur un large échantillon des vrais problèmes', () => {
	const tires = problemes(150);

	it('l’échantillon couvre les six leçons, les deux niveaux et les variantes décimales', () => {
		const parLecon = new Map<string, number>();
		for (const t of tires) parLecon.set(t.id, (parLecon.get(t.id) ?? 0) + 1);
		for (const id of LECONS_PROBLEME) expect(parLecon.get(id), id).toBeGreaterThan(0);
		expect(tires.some((t) => t.niveau === 'cm1')).toBe(true);
		// Les quatre structures ouvertes au CM1 tirent ~50 % de variantes décimales (argent,
		// mesures) : sans elles, l'essentiel du risque de virgule ne serait pas éprouvé.
		const decimaux = tires.filter((t) =>
			t.spec.etapes.some((e) => !Number.isInteger(e.answer) || !Number.isInteger(e.calcul?.a ?? 0)),
		);
		expect(decimaux.length).toBeGreaterThan(50);
		// Et l'échantillon a bien exploré les branches : chaque leçon a plusieurs formes
		// d'énoncé (recherche du tout / d'une partie, piège loyal / piège dur…).
		const formes = new Set(
			tires.map((t) =>
				t.spec.etapes
					.map((e) => e.question)
					.join(' | ')
					.replace(/\d+(?:,\d+)?/g, '#')
					.replace(/[A-ZÉÈÀ][a-zéèêàçï]+/g, 'X'),
			),
		);
		expect(formes.size).toBeGreaterThanOrEqual(20);
		// Deux étapes : la seule leçon qui en a, et elle en a toujours deux.
		const deux = tires.filter((t) => t.spec.etapes.length === 2);
		expect(deux.length).toBeGreaterThan(0);
		expect(new Set(deux.map((t) => t.id))).toEqual(new Set(['math-prob-deux-etapes']));
	});

	it('chaque leçon produit les opérations de SA structure, et pas d’autres', () => {
		// Preuve que l'échantillon a bien exploré les variantes de chaque leçon (chaque
		// opération correspond à des branches distinctes du générateur), et vérification de
		// fond : la structure d'un problème DIT son opération (parties/tout → + ou −,
		// groupes égaux → ×, partage → ÷). Une leçon « partager » qui sortirait un × aurait
		// un `calcul` faux, quoi qu'en dise l'égalité.
		const ops = new Map<string, Set<string>>();
		for (const t of tires)
			for (const e of t.spec.etapes)
				if (e.calcul) ops.set(t.id, (ops.get(t.id) ?? new Set()).add(e.calcul.op));
		const attendu: Record<string, string[]> = {
			'math-prob-composition': ['+', '-'], // le tout s'ajoute, une partie se retire
			'math-prob-transformation': ['+', '-'], // gagner / perdre, et remonter au début
			'math-prob-multiplication': ['x'], // groupes égaux
			'math-prob-partage': [':'], // parts égales et groupements
			'math-prob-comparaison': ['+', '-'], // « de plus » loyal ou piégé
			'math-prob-deux-etapes': ['x', '-'], // le coût, puis la monnaie rendue
		};
		for (const [id, signes] of Object.entries(attendu))
			expect([...(ops.get(id) ?? [])].sort(), id).toEqual([...signes].sort());
	});

	it('CHAQUE sous-question porte son calcul (sinon le panneau se tairait à tort)', () => {
		// Le refus de dérouler est réservé aux familles dont le calcul ne s'écrit pas en une
		// opération (division avec reste, durées) : dans ces six leçons-ci, un `calcul`
		// manquant serait un oubli, et il coûterait le panneau à l'enfant qui vient d'échouer.
		const sans: string[] = [];
		for (const t of tires)
			t.spec.etapes.forEach((e, i) => {
				if (!e.calcul) sans.push(`${t.ou} — étape ${i} : « ${e.question} »`);
			});
		expect({ nombre: sans.length, premieres: sans.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('toute égalité énoncée est VRAIE, et son résultat est la réponse attendue', () => {
		const fautes: string[] = [];
		for (const t of tires) {
			const d = derouleProbleme(t.spec);
			const faute = (raison: string) => fautes.push(`${t.ou} — ${raison}`);
			if (!derouleMontrable(d)) {
				faute(`déroulé non montrable (${d.pas.length} pas, plafond ${PAS_MAX})`);
				continue;
			}
			// Un pas d'ancrage + un pas par sous-question, dans l'ordre.
			if (d.pas.length !== t.spec.etapes.length + 1) faute(`${d.pas.length} pas`);
			t.spec.etapes.forEach((e, i) => {
				const pas = d.pas[i + 1];
				// L'unité de la sous-question est PASSÉE (#542) : sans elle, la réponse d'un
				// problème d'argent se relit « 4,5 » ici alors que l'étayage écrit « 4,50 » dans
				// la case, et le test signalerait une faute qui n'existe pas. L'attendu se
				// calcule donc comme l'enfant le lit, unité comprise.
				const attendu = attenduEtapeTexte(e.answer, e.unite);
				// La sous-question est citée telle quelle : l'enfant doit reconnaître SA question.
				if (!pas.phrase.includes(e.question)) faute(`étape ${i} : intitulé absent`);
				// La réponse écrite dans la case est celle que le runner corrige.
				if (
					JSON.stringify(pas.ecritures) !==
					JSON.stringify([{ cible: cibleEtape(i), texte: attendu }])
				)
					faute(`étape ${i} : écriture ${JSON.stringify(pas.ecritures)}`);
				if (!e.calcul) return;
				// L'égalité AFFICHÉE, relue et vérifiée en décimal exact.
				const lu = /Je calcule (-?[\d,]+) ([+−×÷]) (-?[\d,]+) = (-?[\d,]+)\./.exec(pas.phrase);
				if (!lu) {
					faute(`étape ${i} : aucune égalité lisible — « ${pas.phrase} »`);
					return;
				}
				const [, aTxt, signe, bTxt, rTxt] = lu;
				const op = ({ '+': '+', '−': '-', '×': 'x', '÷': ':' } as const)[
					signe as '+' | '−' | '×' | '÷'
				];
				const [a, b, r] = [depuisTexte(aTxt), depuisTexte(bTxt), depuisTexte(rTxt)];
				if (!egaliteVraie(op, a, b, r))
					faute(`étape ${i} : « ${aTxt} ${signe} ${bTxt} = ${rTxt} » est FAUX`);
				// Le résultat annoncé est la réponse attendue de la sous-question, pas autre chose.
				if (r !== enCentiemes(e.answer)) faute(`étape ${i} : résultat ${rTxt} ≠ ${attendu}`);
				// L'opération annoncée est celle des données (le signe de l'école).
				if (op !== e.calcul.op) faute(`étape ${i} : signe ${signe} pour ${e.calcul.op}`);
				// Et les opérandes affichés sont ceux du calcul.
				if (a !== enCentiemes(e.calcul.a) || b !== enCentiemes(e.calcul.b))
					faute(`étape ${i} : opérandes affichés ≠ opérandes du calcul`);
			});
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('aucun nombre ne tombe du ciel : chaque opérande vient de l’énoncé ou d’une réponse d’avant', () => {
		const fautes: string[] = [];
		for (const t of tires) {
			const dansEnonce = nombresEnonce(t.spec.enonce);
			t.spec.etapes.forEach((e, i) => {
				if (!e.calcul) return;
				const precedentes = t.spec.etapes.slice(0, i).map((p) => enCentiemes(p.answer));
				for (const valeur of [e.calcul.a, e.calcul.b]) {
					const v = enCentiemes(valeur);
					if (!dansEnonce.has(v) && !precedentes.includes(v))
						fautes.push(`${t.ou} — étape ${i} : ${valeur} n'est ni dans l'énoncé ni une réponse`);
				}
			});
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('la reprise du résultat précédent est annoncée quand elle a lieu, et jamais sinon', () => {
		const fautes: string[] = [];
		let annonces = 0;
		for (const t of tires) {
			const d = derouleProbleme(t.spec);
			if (!d.pas.length) continue;
			t.spec.etapes.forEach((e, i) => {
				const phrase = d.pas[i + 1].phrase;
				const dit = /vient de la question d'avant/.test(phrase);
				const precedentes = t.spec.etapes.slice(0, i).map((p) => p.answer);
				const reprend = !!e.calcul && [e.calcul.a, e.calcul.b].some((v) => precedentes.includes(v));
				if (dit !== reprend)
					fautes.push(`${t.ou} — étape ${i} : reprise ${dit ? 'annoncée à tort' : 'tue'}`);
				if (dit) {
					annonces++;
					// La valeur nommée est bien une réponse précédente, ÉCRITE COMME dans sa case
					// (#542) : la reprise cite le résultat de l'étape source, donc avec l'unité de
					// CETTE étape. Sans ça, le chaînage d'un problème d'argent à montants décimaux
					// ne serait pas reconnu ici (le chemin actuel, « deux étapes » CE2, est entier).
					const valeurs = t.spec.etapes
						.slice(0, i)
						.map((source) => attenduEtapeTexte(source.answer, source.unite));
					if (!valeurs.some((v) => phrase.includes(`Le ${v} vient`)))
						fautes.push(`${t.ou} — étape ${i} : la valeur nommée n'est pas une réponse d'avant`);
				}
			});
		}
		// Le chaînage EXISTE dans l'échantillon (sinon ce test ne prouverait rien) : la leçon
		// « deux étapes » réutilise toujours le coût calculé à la première question.
		expect(annonces).toBeGreaterThan(0);
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('« la question d’avant » reste exact : aucun problème de l’appli n’a trois étapes', () => {
		// La reprise se dit « la question d'avant », au singulier : elle désigne la
		// PRÉCÉDENTE. La détection, elle, remonte à n'importe quelle sous-question antérieure.
		// Tant qu'un problème n'a que deux étapes, les deux coïncident. Ce garde-fou tombera
		// le jour où un générateur en produira trois — il faudra alors nommer LAQUELLE.
		const maxi = Math.max(...tires.map((t) => t.spec.etapes.length));
		expect(maxi).toBeLessThanOrEqual(2);
	});
});

/* ============================================================
   5. LES FAMILLES QUI DOIVENT SE TAIRE
   ------------------------------------------------------------
   Division avec reste et durée écoulée passent par le MÊME runner et lui donnent le même
   `EtayageDemande`. Leur calcul ne s'écrit pas en une opération dont le résultat est la
   réponse (« 17 ÷ 5 » ne fait pas 3 ; une durée se lit en heures ET en minutes) : leurs
   étapes n'ont pas de `calcul`, et le déroulé doit rester vide. Un déroulé qui existerait
   ici réciterait deux réponses en les faisant passer pour une méthode.
   ============================================================ */
describe('les problèmes dont le calcul ne s’écrit pas en une opération', () => {
	const MUETS: { id: string; niveau: SchoolLevel }[] = [
		{ id: 'math-div-reste', niveau: 'ce2' },
		{ id: 'math-division-euclidienne', niveau: 'cm1' },
		{ id: 'mes-duree-ecoulee', niveau: 'cm1' },
	];

	it('leurs sous-questions n’ont pas de calcul, et le déroulé reste vide', () => {
		for (const { id, niveau } of MUETS) {
			const l = lecon(id);
			for (let seed = 1; seed <= 60; seed++) {
				const ex = withSeed(seed, () => l.exerciseType.generate({ level: niveau }));
				if (ex.type !== 'probleme') continue; // la variante QCM ne passe pas par ce moteur
				const spec = specDe(ex);
				const ou = `${id}/${seed}`;
				expect(spec.etapes.length, ou).toBe(2);
				expect(
					spec.etapes.some((e) => e.calcul),
					`${ou} : ${spec.etapes.map((e) => e.question).join(' / ')}`,
				).toBe(false);
				const d = derouleProbleme(spec);
				expect(d.pas, ou).toEqual([]);
				expect(derouleMontrable(d), ou).toBe(false);
			}
		}
	});

	it('ces leçons ne déclarent d’ailleurs aucun exemple d’étayage', () => {
		// Rien à montrer d'avance : leur panneau, s'il existe, n'ouvre qu'une règle.
		for (const { id } of MUETS) {
			const contenu = lecon(id).etayage;
			for (const entree of contenu ?? []) expect(entree.contenu.exemple, id).toBeUndefined();
		}
	});
});
