/* ============================================================
   Intercalation (#446) — langue de la consigne, réponse attendue « en bande »
   et journal encadrant.
   ------------------------------------------------------------
   Angles laissés à découvert par `intercaler-ce2.test.ts` (qui couvre le tirage et la
   correction) :
   - le SEUIL DU PLURIEL : une consigne ne peut annoncer « plusieurs réponses possibles »
     que si l'intervalle OUVERT admet plus de deux valeurs. ]10 ; 13[ n'en contient que
     deux (11 et 12) → le pluriel y est impropre ; le seuil est donc un écart ≥ 4 ;
   - la COMPOSITION de la consigne affichée : l'annonce au pluriel en SAISIE, jamais en
     TUILES (une seule tuile est valide), et le trou de réponse qui survit à la
     recomposition ;
   - les helpers PURS de mise en forme de l'attendu (bande, repli sur la réponse unique) ;
   - `data-attendue` posé par renderItem, `data-answer` laissé INTACT (clé de correction
     de repli et point d'appui des specs e2e) ;
   - le JOURNAL d'erreurs (#391) : l'entrée doit porter la BANDE et non un nombre isolé,
     dans les DEUX modes, et aucune entrée ne doit être ignorée faute de leçon ou d'énoncé.

   On teste la RÈGLE, pas la chaîne : les messages de correction et le libellé des leçons
   sont en cours de relecture. D'où la détection d'une annonce au pluriel par le mot
   « plusieurs », et l'usage des seuls IDENTIFIANTS de leçon.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { getLessonById, genLessonItem } from '../src/core/catalog';
import {
	checkItemAnswer,
	createRenderContext,
	intervalleAPlusieursReponses,
	renderItem,
	type Item,
} from '../src/core/items';
import { attendueIntervalle, attendueItem } from '../src/core/erreur-representation';
import { ESPACE_FINE } from '../src/core/nombres';
import { capterErreur } from '../src/ui/erreur-capture';
import { chargerErreursFor, MAX_ERREURS } from '../src/core/erreurs-journal';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import type { Exercise } from '../src/core/exercise';

type Texte = Extract<Exercise, { type: 'text' }>;
type Tuiles = Extract<Exercise, { type: 'tuilesNombre' }>;

const INTERCALER = 'Place un nombre entre';
/* Annonce au PLURIEL dans la consigne. On cible le mot porteur de la règle, pas la
   formulation complète (« (plusieurs réponses possibles) »), qui peut être réécrite. */
const PLURIEL = /plusieurs/i;
const LECONS_CE2 = ['num-encadrer-intercaler', 'num-situer-10000'] as const;

/* Fraîcheur entre tests (pattern maison) : stockage vidé, hook d'écriture rebranché,
   profil par défaut recréé — le journal d'erreurs est écrit sur le profil actif. */
beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

function lecon(id: string) {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon ${id} absente du catalogue`);
	return l;
}

/* Bornes A, B lues dans l'énoncé AFFICHÉ. Aux plages CE2 (≤ 9 999) les nombres s'écrivent
   sans séparateur de milliers : lecture directe et exacte. */
function bornes(question: string): [number, number] {
	const m = question.match(/entre (\d+) et (\d+)/);
	if (!m) throw new Error(`énoncé d'intercalation inattendu : ${question}`);
	return [Number(m[1]), Number(m[2])];
}

function saisies(id: string, n: number): Texte[] {
	const type = lecon(id).exerciseType;
	const out: Texte[] = [];
	for (let i = 0; i < n; i++) {
		const ex = type.generate({ level: 'ce2' });
		if (ex.type === 'text') out.push(ex);
	}
	return out;
}

function tuilesGen(id: string, n: number): Tuiles[] {
	const type = lecon(id).exerciseType;
	const out: Tuiles[] = [];
	for (let i = 0; i < n; i++) {
		const ex = type.generate({ level: 'ce2', mode: 'tuiles' });
		if (ex.type === 'tuilesNombre') out.push(ex);
	}
	return out;
}

/* `n` items d'INTERCALATION réellement produits par le pipeline de l'appli (fiche, sprint,
   révision passent tous par genLessonItem). Lève plutôt que de rendre un test vide. */
function itemsIntercalation(id: string, n: number): Item[] {
	const lesson = lecon(id);
	const out: Item[] = [];
	for (let i = 0; i < 20000 && out.length < n; i++) {
		const item = genLessonItem(lesson, 'ce2');
		if (item.text.startsWith(INTERCALER)) out.push(item);
	}
	if (out.length < n) throw new Error(`moins de ${n} intercalations tirées pour ${id}`);
	return out;
}

function exercicesTuilesIntercalation(id: string, n: number): Tuiles[] {
	const type = lecon(id).exerciseType;
	const out: Tuiles[] = [];
	for (let i = 0; i < 20000 && out.length < n; i++) {
		const ex = type.generate({ level: 'ce2', mode: 'tuiles' });
		if (ex.type === 'tuilesNombre' && ex.question.startsWith(INTERCALER)) out.push(ex);
	}
	if (out.length < n) throw new Error(`moins de ${n} intercalations en tuiles pour ${id}`);
	return out;
}

/* Le champ de réponse d'un rendu, relu via le DOM : prouve du même coup que la valeur
   d'attribut est bien FORMÉE (un guillemet non échappé casserait l'analyse). */
function champ(html: string): HTMLInputElement {
	const hote = document.createElement('div');
	hote.innerHTML = html;
	const inp = hote.querySelector<HTMLInputElement>('input.ans');
	if (!inp) throw new Error(`aucun champ de réponse dans le rendu : ${html}`);
	return inp;
}

const journal = () => chargerErreursFor(activeProfile().uuid);

describe('Seuil du pluriel — intervalleAPlusieursReponses (#446)', () => {
	/* Dérivation : ]min ; max[ contient exactement (max − min − 1) entiers. Une annonce au
	   PLURIEL suppose au moins TROIS valeurs possibles (deux, c'est « l'un ou l'autre » ;
	   une, c'est faux) → écart ≥ 4. */
	const entiersDedans = (min: number, max: number) => Math.max(0, max - min - 1);

	it('vrai exactement quand l’intervalle ouvert contient au moins trois entiers', () => {
		for (const base of [10, 396, 3987, 610000]) {
			for (let ecart = 1; ecart <= 12; ecart++) {
				const iv: [number, number] = [base, base + ecart];
				expect(intervalleAPlusieursReponses(iv)).toBe(entiersDedans(iv[0], iv[1]) >= 3);
			}
		}
	});

	it('bords nommés : 2 et 3 restent au singulier, 4 passe au pluriel', () => {
		expect(intervalleAPlusieursReponses([10, 12])).toBe(false); // une seule valeur : 11
		expect(intervalleAPlusieursReponses([10, 13])).toBe(false); // deux valeurs : 11 ou 12
		expect(intervalleAPlusieursReponses([10, 14])).toBe(true); // trois valeurs : 11, 12, 13
		expect(intervalleAPlusieursReponses([610000, 620000])).toBe(true); // grande bande CM1
	});
});

describe('Réponse attendue « en bande » — attendueIntervalle / attendueItem (#446)', () => {
	it('nomme la bande de façon INDÉFINIE, avec les bornes de l’énoncé', () => {
		expect(attendueIntervalle([450, 465])).toBe('un nombre entre 450 et 465');
		// Écart 2 : une seule valeur passe, mais l'attendu reste la bande de l'énoncé (bornes
		// exclues telles qu'elles ont été affichées) — pas de cas particulier à maintenir.
		expect(attendueIntervalle([396, 398])).toBe('un nombre entre 396 et 398');
	});

	it('grandes bornes CM1 : mêmes séparateurs de milliers que l’énoncé', () => {
		const bande = attendueIntervalle([610000, 620000]);
		expect(bande).toBe(`un nombre entre 610${ESPACE_FINE}000 et 620${ESPACE_FINE}000`);
		// Jamais de virgule ni de point (séparateur décimal en français / écriture anglo-saxonne).
		expect(bande).not.toMatch(/[,.]/);
	});

	it('sans intervalle : repli sur la réponse unique, y compris un zéro', () => {
		expect(attendueItem({ answer: 457 })).toBe('457');
		// Bord : une réponse falsy (0) doit rester « 0 », pas devenir une chaîne vide — une
		// entrée de journal sans attendu ne dirait rien au parent.
		expect(attendueItem({ answer: 0 })).toBe('0');
		expect(attendueItem({ answer: '<' })).toBe('<');
	});

	it('avec intervalle : la bande, quel que soit l’exemple — un seul texte pour tous les modes', () => {
		// La fiche / le sprint / la révision passent par attendueItem, le runner de tuiles par
		// attendueIntervalle : le parent doit lire le MÊME libellé quel que soit le mode joué.
		const iv: [number, number] = [450, 465];
		for (const exemple of [451, 457, 464]) {
			expect(attendueItem({ answer: exemple, intervalle: iv })).toBe(attendueIntervalle(iv));
		}
	});

	it('sur un item réellement généré : les deux bornes, jamais l’exemple seul', () => {
		for (const item of itemsIntercalation('num-situer-10000', 30)) {
			const [a, b] = item.intervalle!;
			const bande = attendueItem(item);
			expect(bande).toContain(String(a));
			expect(bande).toContain(String(b));
			expect(bande).not.toBe(String(item.answer));
		}
	});
});

describe('Consigne affichée — annonce au pluriel en SAISIE seulement (#446)', () => {
	for (const id of LECONS_CE2) {
		it(`${id} : le pluriel n’apparaît qu’à partir d’un écart de 4`, () => {
			let intercalations = 0;
			let pluriels = 0;
			let ecart2 = 0;
			let ecart3 = 0;
			for (const e of saisies(id, 3000)) {
				const pluriel = PLURIEL.test(e.question);
				if (!e.question.startsWith(INTERCALER)) {
					// Comparer / encadrer : réponse unique, aucune annonce au pluriel ne doit fuiter.
					expect(pluriel).toBe(false);
					continue;
				}
				intercalations++;
				const [a, b] = bornes(e.question);
				expect(pluriel).toBe(b - a >= 4);
				if (pluriel) pluriels++;
				if (b - a === 2) ecart2++;
				if (b - a === 3) ecart3++;
				// Le trou de réponse survit à la recomposition de la consigne : un seul `@`, en fin
				// d'énoncé (sans lui, renderItem n'aurait plus où poser le champ).
				expect(e.question.split('@')).toHaveLength(2);
				expect(e.question.trimEnd().endsWith('@')).toBe(true);
			}
			expect(intercalations).toBeGreaterThan(300);
			expect(pluriels).toBeGreaterThan(0);
			// Les deux écarts qui doivent RESTER au singulier sont bien tirés : sans eux, le
			// « seulement » de la règle ne serait pas éprouvé.
			expect(ecart2).toBeGreaterThan(0);
			expect(ecart3).toBeGreaterThan(0);
		});

		it(`${id} : en tuiles, aucune annonce au pluriel, mais la bande est transmise`, () => {
			let vus = 0;
			let plusieursValeurs = 0;
			for (const e of tuilesGen(id, 2000)) {
				expect(PLURIEL.test(e.question)).toBe(false);
				if (!e.question.startsWith(INTERCALER)) continue;
				vus++;
				const [a, b] = bornes(e.question);
				// L'intervalle est tout de même transmis : c'est ce qui permet au runner de parler
				// au singulier indéfini après coup et de journaliser la bande pour le parent.
				expect(e.intervalle).toEqual([a, b]);
				if (b - a >= 4) plusieursValeurs++;
			}
			expect(vus).toBeGreaterThan(300);
			// … et le cas où le pluriel serait pourtant vrai est bien présent (test non vide).
			expect(plusieursValeurs).toBeGreaterThan(0);
		});
	}
});

describe('renderItem — data-attendue sur le champ, data-answer intact (#446)', () => {
	it('item à intervalle : la bande en data-attendue, l’exemple en data-answer', () => {
		const inp = champ(
			renderItem(
				{
					text: 'Place un nombre entre 450 et 465 : @',
					answer: 457,
					kind: 'num',
					intervalle: [450, 465],
				},
				createRenderContext(),
			),
		);
		// data-answer INTACT : clé de correction de repli (scoring hors session) et ancrage e2e.
		expect(inp.dataset.answer).toBe('457');
		expect(inp.dataset.attendue).toBe('un nombre entre 450 et 465');
	});

	it('item sans intervalle : aucun attribut de bande', () => {
		const html = renderItem(
			{ text: 'La centaine juste avant 456 : @', answer: 400, kind: 'num' },
			createRenderContext(),
		);
		expect(html).not.toContain('data-attendue');
		expect(champ(html).dataset.answer).toBe('400');
	});

	it('grande bande CM1 : les séparateurs de milliers traversent l’attribut', () => {
		const inp = champ(
			renderItem(
				{
					text: 'Place un nombre entre 610 000 et 620 000 : @',
					answer: 615000,
					kind: 'num',
					intervalle: [610000, 620000],
				},
				createRenderContext(),
			),
		);
		expect(inp.dataset.attendue).toBe(
			`un nombre entre 610${ESPACE_FINE}000 et 620${ESPACE_FINE}000`,
		);
		expect(inp.classList.contains('ans-grand')).toBe(true); // réponse à ≥ 5 chiffres
	});

	it('valeur d’attribut échappée : guillemet et esperluette ne cassent pas le champ', () => {
		// Garde-fou du refactor : l'échappement des `data-*` est désormais partagé par
		// data-answer et data-attendue ; une valeur hostile doit toujours se relire à
		// l'identique (sinon l'attribut suivant serait avalé).
		const inp = champ(
			renderItem(
				{ text: 'Écris le mot : @', answer: 'a"b & c', kind: 'text' },
				createRenderContext(),
			),
		);
		expect(inp.dataset.answer).toBe('a"b & c');
	});

	it('item réellement généré : les deux attributs cohabitent, la clé de repli reste juste', () => {
		for (const item of itemsIntercalation('num-encadrer-intercaler', 20)) {
			const inp = champ(renderItem(item, createRenderContext()));
			const [a, b] = item.intervalle!;
			expect(inp.dataset.attendue).toContain(String(a));
			expect(inp.dataset.attendue).toContain(String(b));
			expect(inp.dataset.answer).toBe(String(item.answer));
			// La correction de repli par data-answer reste valide (l'exemple est dans la bande).
			expect(checkItemAnswer(item, inp.dataset.answer!)).toBe(true);
		}
	});

	it('toute intercalation générée est un item NUMÉRIQUE, donc porteuse de l’attribut', () => {
		// L'attribut n'est posé que sur le champ numérique. Un item d'intercalation classé
		// `text` (réponse non reconnue comme un nombre) perdrait silencieusement la bande à
		// l'écran, sans qu'aucun autre test ne le voie.
		for (const id of LECONS_CE2) {
			for (const item of itemsIntercalation(id, 40)) {
				expect(item.kind).toBe('num');
				expect(renderItem(item, createRenderContext())).toContain('data-attendue');
			}
		}
	});
});

describe('Journal encadrant — la bande, dans les deux modes (#391/#446)', () => {
	it('saisie : l’entrée porte la bande, pas l’exemple révélé', () => {
		const [item] = itemsIntercalation('num-encadrer-intercaler', 1);
		const [a, b] = item.intervalle!;
		// Charge utile telle que la construisent session.verify / sprint / révision : l'énoncé
		// BRUT de l'item, la réponse donnée, l'attendu mis en forme par le cœur.
		capterErreur({
			text: item.text,
			donnee: String(a), // erreur typique : la borne recopiée (intervalle ouvert)
			attendue: attendueItem(item),
			lessonId: item._lesson ?? null,
			mode: 'lecon',
		});
		const entrees = journal();
		expect(entrees).toHaveLength(1);
		// Énoncé lisible hors de l'appli : le trou `@` devient « … ».
		expect(entrees[0].question).not.toContain('@');
		expect(entrees[0].question.startsWith(INTERCALER)).toBe(true);
		expect(entrees[0].donnee).toBe(String(a));
		expect(entrees[0].attendue).toContain(String(a));
		expect(entrees[0].attendue).toContain(String(b));
		// Le point du #446 : jamais un nombre isolé, qui ferait croire le parent son enfant
		// plus loin du but qu'il ne l'est.
		expect(entrees[0].attendue).not.toBe(String(item.answer));
	});

	it('tuiles : la bande aussi, avec la tuile posée en réponse donnée', () => {
		const [ex] = exercicesTuilesIntercalation('num-situer-10000', 1);
		const [a, b] = ex.intervalle!;
		const posee = ex.tuiles.find((t) => t !== ex.answer)!;
		capterErreur({
			text: ex.question,
			donnee: posee,
			attendue: attendueIntervalle(ex.intervalle!),
			lessonId: 'num-situer-10000',
			mode: 'lecon',
		});
		const entrees = journal();
		expect(entrees).toHaveLength(1);
		expect(entrees[0].donnee).toBe(posee);
		expect(entrees[0].attendue).toContain(String(a));
		expect(entrees[0].attendue).toContain(String(b));
		// Le mode tuiles ne montre qu'UNE tuile valide : le parent ne doit pas lire cette
		// tuile comme « la » réponse.
		expect(entrees[0].attendue).not.toBe(ex.answer);
	});

	it('un même intervalle donne le MÊME attendu enregistré, saisie ou tuiles', () => {
		const iv: [number, number] = [3987, 4002];
		const text = 'Place un nombre entre 3987 et 4002 : @';
		const commun = { text, lessonId: 'num-situer-10000', mode: 'lecon' };
		capterErreur({
			...commun,
			donnee: '3987',
			attendue: attendueItem({ answer: 3990, intervalle: iv }),
		});
		capterErreur({ ...commun, donnee: '4002', attendue: attendueIntervalle(iv) });
		const entrees = journal();
		expect(entrees).toHaveLength(2);
		expect(entrees[0].attendue).toBe(entrees[1].attendue);
	});

	it('pièges de capterErreur : sans leçon ou sans énoncé, rien n’est enregistré', () => {
		const [item] = itemsIntercalation('num-situer-10000', 1);
		const attendue = attendueItem(item);
		capterErreur({ text: item.text, donnee: '1', attendue, lessonId: null, mode: 'lecon' });
		capterErreur({ text: item.text, donnee: '1', attendue, lessonId: '', mode: 'lecon' });
		capterErreur({ text: '   ', donnee: '1', attendue, lessonId: item._lesson!, mode: 'lecon' });
		expect(journal()).toEqual([]);
	});

	it('aucune intercalation réelle n’est perdue, dans l’un ou l’autre mode', () => {
		const PAR_LOT = 15; // 4 lots (2 leçons × 2 modes) → 60 entrées, sous la rétention
		let attendues = 0;
		for (const id of LECONS_CE2) {
			for (const item of itemsIntercalation(id, PAR_LOT)) {
				capterErreur({
					text: item.text,
					donnee: '0',
					attendue: attendueItem(item),
					lessonId: item._lesson ?? null, // renseigné par genLessonItem ; absent ⇒ entrée ignorée
					mode: 'sprint',
				});
				attendues++;
				const [a, b] = item.intervalle!;
				expect(journal()).toHaveLength(attendues);
				expect(journal()[0].attendue).toContain(String(a));
				expect(journal()[0].attendue).toContain(String(b));
			}
			for (const ex of exercicesTuilesIntercalation(id, PAR_LOT)) {
				capterErreur({
					text: ex.question,
					donnee: ex.tuiles.find((t) => t !== ex.answer)!,
					attendue: attendueIntervalle(ex.intervalle!),
					lessonId: id,
					mode: 'lecon',
				});
				attendues++;
				const [a, b] = ex.intervalle!;
				expect(journal()).toHaveLength(attendues);
				expect(journal()[0].attendue).toContain(String(a));
				expect(journal()[0].attendue).toContain(String(b));
			}
		}
		expect(attendues).toBe(4 * PAR_LOT);
		expect(attendues).toBeLessThanOrEqual(MAX_ERREURS);
		// Les deux modes sont bien représentés dans le journal du profil.
		const modes = new Set(journal().map((e) => e.mode));
		expect([...modes].sort()).toEqual(['lecon', 'sprint']);
	});
});
