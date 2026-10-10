/* ============================================================
   Séance partagée par lien (#734) — le PASSAGE d'un envoi par l'enfant
   (`src/core/partage/passage.ts`).

   Écrits AVANT l'implémentation, par un auteur distinct, depuis les critères de
   l'issue et le contrat commenté du module (stub qui lève « non implémenté »).
   Rouges tant que le module n'est pas écrit : c'est attendu.

   Critères tenus ici (versant logique) :
   - 1 / 37 : ce qui se joue en fiche, la dictée (refus `format`), ce qui n'existe
     plus au catalogue (refus `lecon`). Les runners « une question à la fois »
     (PR 4) sont gardés par `partage-runners-passage.test.ts` ;
   - 2 : le niveau des items, du titre et de la consigne vient de l'ENVOI, jamais
     du profil actif ;
   - 9 : « je ne sais pas » ressort comme tel, distinct d'un faux ou d'un vide ;
   - 11 : l'item rendu est celui de la fiche ordinaire, donc la même correction ;
   - 14 : chaque item du passage a sa leçon, son mode, un énoncé et un attendu
     lisibles (même forme que le journal d'erreurs), sa saisie et son statut ;
   - 15 / 23 / 24 : premier passage figé, +5 XP une seule fois par couple
     envoi × profil quel que soit le score, une entrée d'activité « partage » sans
     score ;
   - 16 : préparer et noter n'écrivent rien — abandonner ne consomme pas le passage ;
   - 26 : rien d'autre ne bouge dans le stockage ;
   - 39 : liste blanche du prénom ou pseudo, la même qu'au décodage du lien.

   Les attendus littéraux sont écrits à la main. Quand l'exigence est « même forme
   que le journal d'erreurs » ou « l'Item de la fiche ordinaire », la référence est
   la fonction qui fait foi pour le journal (`questionPourJournal`, `attendueItem`,
   `dispositionPosee`) ou la fiche (`genLessonItem`) : c'est l'exigence elle-même,
   pas l'implémentation testée.
   ============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	genLessonItem,
	getLessonById,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import { activiteParJourParType } from '../src/core/encadrant-stats';
import { attendueItem } from '../src/core/erreur-representation';
import { consignePourNiveau, type Exercise, type ExerciseMode } from '../src/core/exercise';
import { checkItemAnswer, dispositionPosee, type Item } from '../src/core/items';
import { labelLecon } from '../src/core/levels';
import { ACTIVITY_KEY, getXP, loadActivity, PALIERS_DEBUT_KEY, XP_KEY } from '../src/core/progress';
import {
	activeProfile,
	addProfile,
	getXPFor,
	initProfiles,
	setActiveProfile,
	setNiveauMatiere,
	setNiveauReference,
	touchActiveProfile,
} from '../src/core/profiles';
import {
	lsGet,
	lsGetItemRaw,
	lsKeysRaw,
	lsSet,
	lsSetRaw,
	PROFILES_KEY,
	setOnDataWrite,
} from '../src/core/storage';
import { questionPourJournal } from '../src/ui/erreur-capture';
import {
	figerResultat,
	noterReponse,
	nouvelleCapture,
	type Capture,
	type ItemCapture,
} from '../src/core/partage/capture';
import type { BlocEnvoi, Envoi } from '../src/core/partage/envoi';
import {
	decoderResultat,
	encoderResultat,
	type Resultat,
	type StatutReponse,
} from '../src/core/partage/resultat';
import { tirerExercices } from '../src/core/partage/tirage';
import {
	changerPseudo,
	MAX_PASSAGES_GARDES,
	PARTAGES_RECUS_KEY,
	passageTermine,
	premierPassage,
	preparerPassage,
	normaliserPseudo,
	pseudoParDefaut,
	pseudoValide,
	statutItem,
	terminerPremierPassage,
	type BlocPassage,
	type ChampCorrige,
} from '../src/core/partage/passage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Outils ---------- */

function lecon(id: string): LessonDef {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
}

/** Exercices tirés comme le ferait l'encadrant, avec une précondition sur leur type :
 *  si le catalogue change, le test le dit au lieu de tester autre chose en silence. */
function tirer(
	id: string,
	n: number,
	niveau: SchoolLevel,
	mode: ExerciseMode | undefined,
	type: Exercise['type'],
): Exercise[] {
	const exs = tirerExercices(lecon(id), n, niveau, mode);
	expect(exs.length, `${id} : aucun exercice tiré`).toBeGreaterThan(0);
	for (const ex of exs) expect(ex.type, `${id} (${mode ?? 'sans mode'}) : précondition`).toBe(type);
	return exs;
}

function bloc(id: string, exercices: Exercise[], mode?: ExerciseMode): BlocEnvoi {
	return mode === undefined ? { lecon: id, exercices } : { lecon: id, mode, exercices };
}

/** Identifiants de 12 caractères base64url, comme ceux du lien (`identifiant`). */
const ID_ENVOI = 'EnvoiTest001';
const ID_RESULTAT = 'ResultTest01';
const DATE_FIN = Date.UTC(2026, 9, 7, 14, 30, 0);

function envoiLecon(b: BlocEnvoi, niveau: SchoolLevel = 'ce2', id = ID_ENVOI): Envoi {
	return { id, libelle: 'Fiche du lundi', nature: 'lecon', niveau, blocs: [b] };
}

function envoiBilan(blocs: BlocEnvoi[], niveau: SchoolLevel = 'ce2', id = ID_ENVOI): Envoi {
	return {
		id,
		libelle: 'Bilan de la semaine',
		nature: 'bilan',
		variante: 'express',
		niveau,
		blocs,
	};
}

/** Blocs d'un envoi qui DOIT se jouer. Lève (donc échoue) sur un refus. */
function blocsDe(envoi: Envoi): BlocPassage[] {
	const p = preparerPassage(envoi);
	if (!p.ok) throw new Error(`envoi refusé (« ${p.raison} ») alors qu'il se joue en fiche`);
	return p.blocs;
}

/** L'Item que la fiche ou le bilan ordinaire construit de CET exercice : la leçon
 *  réelle, dont le générateur rend l'exercice figé. Pas valable pour le calcul mental
 *  hérité, dont la fiche ne passe pas par `generate` (traité à part). */
function itemFiche(lesson: LessonDef, ex: Exercise): Item {
	const figee: LessonDef = {
		...lesson,
		exerciseType: { ...lesson.exerciseType, generate: () => ex },
	};
	return genLessonItem(figee);
}

/** Énoncé tel que le journal d'erreurs l'écrit pour un item de fiche. */
function enonceJournal(item: Item): string {
	return questionPourJournal(item.text, !!item.figure?.balisage);
}

/* Capture fabriquée à la main (sans passer par `preparerPassage`) : les tests du
   premier passage ne dépendent pas de la préparation. Un item par statut ; `vide`
   n'est jamais noté. */
function capturePour(statuts: StatutReponse[], lecon = 'math-tables-addition'): Capture {
	const items: ItemCapture[] = statuts.map((_, i) => ({
		lecon,
		enonce: `${i + 2} + 5 = …`,
		attendue: String(i + 7),
	}));
	const capture = nouvelleCapture(items);
	statuts.forEach((statut, i) => {
		if (statut === 'vide') return;
		const saisie = statut === 'juste' ? String(i + 7) : statut === 'faux' ? '0' : '';
		noterReponse(capture, i, { statut, saisie });
	});
	return capture;
}

function terminer(
	envoi: Envoi,
	capture: Capture = capturePour(['juste', 'faux', 'jnsp']),
	o: { pseudo?: string; date?: number; id?: string } = {},
): Resultat {
	return terminerPremierPassage(envoi, capture, {
		pseudo: o.pseudo ?? 'Léa',
		date: o.date ?? DATE_FIN,
		id: o.id ?? ID_RESULTAT,
	});
}

/** Toutes les clés réelles du stockage et leur valeur brute. */
function instantane(): Map<string, string> {
	const m = new Map<string, string>();
	for (const k of lsKeysRaw()) m.set(k, lsGetItemRaw(k) ?? '');
	return m;
}

function clesModifiees(avant: Map<string, string>, apres: Map<string, string>): string[] {
	const cles = new Set<string>([...avant.keys(), ...apres.keys()]);
	return [...cles].filter((k) => avant.get(k) !== apres.get(k)).sort();
}

/** Méta des profils sans l'horodatage `updatedAt`, que toute écriture de donnée bumpe. */
function profilsSansHorodatage(brut: string | undefined): string {
	if (brut === undefined) return '';
	return JSON.stringify(JSON.parse(brut), (k, v: unknown) => (k === 'updatedAt' ? undefined : v));
}

function prefixe(): string {
	return activeProfile().uuid + '/';
}

/* ============================================================
   preparerPassage — la dictée, et ce qui se joue en fiche
   ============================================================ */

describe('preparerPassage — dictée refusée, leçons jouées en fiche (critères 1, 11 et 37)', () => {
	it('une dictée ne se joue pas en fiche', () => {
		const dictee: Envoi = {
			id: ID_ENVOI,
			libelle: 'Dictee 4',
			nature: 'dictee',
			niveau: 'ce2',
			mots: [{ mot: 'école' }, { mot: 'arbre' }],
		};
		expect(preparerPassage(dictee)).toEqual({ ok: false, raison: 'format' });
	});

	it.each<[string, string, SchoolLevel, ExerciseMode | undefined, Exercise['type']]>([
		['numération en saisie (même leçon que les tuiles)', 'num-comparer', 'ce2', 'saisie', 'text'],
		['conversion en saisie (même leçon que le tableau)', 'mes-longueurs', 'ce2', 'saisie', 'text'],
		[
			'conjugaison en saisie (même leçon que le QCM)',
			'fr-conj-etre-present',
			'ce2',
			'saisie',
			'text',
		],
		['figure à nommer en saisie', 'geo-cm1-triangles', 'cm1', 'saisie', 'text'],
		['chiffres romains (champ romain)', 'num-chiffres-romains', 'cm1', 'ecrire', 'text'],
		['numération mono-mode', 'num-valeur-position', 'ce2', undefined, 'text'],
		[
			'opération posée (pas de runner : elle se pose dans la fiche)',
			'calc-addition-posee',
			'ce2',
			undefined,
			'posed',
		],
	])(
		'leçon « %s » → se joue, un item par exercice, l’Item de la fiche (critère 11)',
		(_cas, id, niveau, mode, type) => {
			const lesson = lecon(id);
			const exs = tirer(id, 4, niveau, mode, type);
			const p = preparerPassage(envoiLecon(bloc(id, exs, mode), niveau));
			expect(p.ok, `${id} (${mode ?? 'sans mode'}) se joue en fiche`).toBe(true);
			if (!p.ok) return;
			expect(p.blocs).toHaveLength(1);
			const [b] = p.blocs;
			expect(b.lecon, 'la leçon du catalogue').toBe(lesson);
			expect(b.items, 'un item par exercice, ni plus ni moins').toHaveLength(exs.length);
			exs.forEach((ex, i) => {
				expect(b.items[i].item, `item ${i} : celui que la fiche construit de cet exercice`).toEqual(
					itemFiche(lesson, ex),
				);
				expect(b.items[i].capture.lecon).toBe(id);
				expect(b.items[i].capture.mode, 'le mode du bloc, et lui seulement').toBe(mode);
			});
		},
	);
});

describe('preparerPassage — refus « lecon » : une leçon de l’envoi n’existe plus', () => {
	const EXERCICE: Exercise = { type: 'text', question: '7 + 8 = @', answer: '15' };

	it.each(['math-lecon-retiree', 'constructor', '__proto__'])(
		'leçon « %s » (envoi leçon) → lecon',
		(id) => {
			// « constructor » et « __proto__ » passent la liste blanche des identifiants de
			// leçon : un lien forgé peut les porter, et un objet indexé par id les « trouve ».
			expect(preparerPassage(envoiLecon(bloc(id, [EXERCICE])))).toEqual({
				ok: false,
				raison: 'lecon',
			});
		},
	);

	it('bilan dont un bloc AU MILIEU cite une leçon inconnue → refusé en entier, aucun bloc partiel', () => {
		const envoi = envoiBilan([
			bloc('num-valeur-position', [
				{ type: 'text', question: 'Dans 4572, quel est le chiffre des centaines ? @', answer: '5' },
			]),
			bloc('math-lecon-retiree', [EXERCICE]),
			bloc('math-tables-addition', [EXERCICE]),
		]);
		expect(preparerPassage(envoi)).toEqual({ ok: false, raison: 'lecon' });
	});
});

/* ============================================================
   preparerPassage — items, énoncés, attendus, titre, consigne
   ============================================================ */

describe('preparerPassage — capture : énoncé et attendu lisibles (critère 14)', () => {
	it('exercices écrits à la main : « @ » devient « … », l’attendu est la réponse, la leçon est celle du bloc', () => {
		const exs: Exercise[] = [
			{ type: 'text', question: 'Dans 4572, quel est le chiffre des centaines ? @', answer: '5' },
			{ type: 'text', question: '@ + 30 = 100', answer: '70' },
			{ type: 'text', question: 'Écris 4 unités et 5 dixièmes : @', answer: '4.5' },
		];
		const [b] = blocsDe(envoiLecon(bloc('num-valeur-position', exs)));
		expect(b.items.map((it) => it.capture)).toEqual([
			{
				lecon: 'num-valeur-position',
				enonce: 'Dans 4572, quel est le chiffre des centaines ? …',
				attendue: '5',
			},
			{ lecon: 'num-valeur-position', enonce: '… + 30 = 100', attendue: '70' },
			// Un parent lit « 4,5 », pas « 4.5 » : l'attendu est mis en forme à la française.
			{ lecon: 'num-valeur-position', enonce: 'Écris 4 unités et 5 dixièmes : …', attendue: '4,5' },
		]);
	});

	it('exercices tirés : énoncé et attendu ont la forme du journal d’erreurs, sans « @ »', () => {
		const exs = tirer('num-valeur-position', 8, 'ce2', undefined, 'text');
		const [b] = blocsDe(envoiLecon(bloc('num-valeur-position', exs)));
		for (const { item, capture } of b.items) {
			expect(capture.enonce, 'même forme que le journal').toBe(enonceJournal(item));
			expect(capture.enonce).not.toContain('@');
			expect(capture.enonce.length, 'un énoncé lisible n’est jamais vide').toBeGreaterThan(0);
			expect(capture.attendue, 'même attendu que le journal').toBe(attendueItem(item));
		}
	});

	it('le mode du bloc est reporté sur chaque capture', () => {
		const exs = tirer('fr-conj-etre-present', 5, 'ce2', 'saisie', 'text');
		const [b] = blocsDe(envoiLecon(bloc('fr-conj-etre-present', exs, 'saisie')));
		expect(b.items.map((it) => it.capture.mode)).toEqual(exs.map(() => 'saisie'));
	});

	it('un exercice à figure : l’énoncé signale le dessin, comme dans le journal', () => {
		const exs = tirer('donnees-tableau-lire', 3, 'cm1', undefined, 'text');
		const [b] = blocsDe(envoiLecon(bloc('donnees-tableau-lire', exs), 'cm1'));
		for (const { item, capture } of b.items) {
			expect(item.figure?.balisage, 'précondition : l’item porte une figure').toBeTruthy();
			expect(capture.enonce).toBe(questionPourJournal(item.text, true));
			expect(
				capture.enonce,
				'sans le marqueur, le parent lirait une question énigmatique',
			).not.toBe(questionPourJournal(item.text, false));
		}
	});

	it('titre = libellé de la leçon ; consigne = celle du type, sinon « Complète. » en maths', () => {
		const conj = lecon('fr-conj-etre-present');
		const consigneConj = consignePourNiveau(conj.exerciseType, 'ce2');
		expect(consigneConj, 'précondition : la conjugaison a sa consigne').toBeTruthy();
		const [bConj] = blocsDe(
			envoiLecon(
				bloc(
					'fr-conj-etre-present',
					tirer('fr-conj-etre-present', 2, 'ce2', 'saisie', 'text'),
					'saisie',
				),
			),
		);
		expect(bConj.titre).toBe(conj.label);
		expect(bConj.consigne).toBe(consigneConj);

		const num = lecon('num-valeur-position');
		expect(
			consignePourNiveau(num.exerciseType, 'ce2'),
			'précondition : pas de consigne de type',
		).toBeUndefined();
		const [bNum] = blocsDe(
			envoiLecon(
				bloc('num-valeur-position', tirer('num-valeur-position', 2, 'ce2', undefined, 'text')),
			),
		);
		expect(bNum.titre).toBe(num.label);
		expect(bNum.consigne).toBe('Complète.');
	});
});

describe('preparerPassage — opération posée', () => {
	it('soustraction écrite à la main : item « posé », énoncé = l’opération, attendu = le résultat', () => {
		const ex: Exercise = { type: 'posed', op: '-', a: 503, b: 278 };
		const [b] = blocsDe(envoiLecon(bloc('calc-soustraction-posee', [ex])));
		const [{ item, capture }] = b.items;
		expect(item.kind).toBe('posed');
		expect(item.posed).toEqual({ op: '-', a: 503, b: 278 });
		expect(Number(item.answer)).toBe(225);
		// La grille n'a pas d'énoncé (texte vide) : le journal écrit l'OPÉRATION.
		expect(capture.enonce).toBe(dispositionPosee({ op: '-', a: 503, b: 278 }).operation);
		expect(capture.enonce).toContain('503');
		expect(capture.enonce).toContain('278');
		expect(capture.attendue).toBe('225');
	});

	it('addition et multiplication : « 347 + 285 » ; le signe de la multiplication est lisible', () => {
		const [bAdd] = blocsDe(
			envoiLecon(bloc('calc-addition-posee', [{ type: 'posed', op: '+', a: 347, b: 285 }])),
		);
		expect(bAdd.items[0].capture).toEqual({
			lecon: 'calc-addition-posee',
			enonce: '347 + 285',
			attendue: '632',
		});
		const [bMul] = blocsDe(
			envoiLecon(bloc('calc-multiplication-posee', [{ type: 'posed', op: 'x', a: 47, b: 23 }])),
		);
		expect(bMul.items[0].capture.enonce).toBe(
			dispositionPosee({ op: 'x', a: 47, b: 23 }).operation,
		);
		expect(bMul.items[0].capture.enonce, 'un parent ne lit pas « 47 x 23 »').not.toContain(' x ');
		expect(bMul.items[0].capture.attendue).toBe('1081');
	});

	it('opérations tirées : l’Item de la fiche, l’opération pour énoncé, le résultat pour attendu', () => {
		const lesson = lecon('calc-addition-posee');
		const exs = tirer('calc-addition-posee', 6, 'ce2', undefined, 'posed');
		const [b] = blocsDe(envoiLecon(bloc('calc-addition-posee', exs)));
		exs.forEach((ex, i) => {
			if (ex.type !== 'posed') throw new Error('précondition');
			const { item, capture } = b.items[i];
			expect(item).toEqual(itemFiche(lesson, ex));
			expect(capture.enonce).toBe(dispositionPosee(ex).operation);
			expect(capture.attendue).toBe(String(ex.a + ex.b));
		});
	});
});

describe('preparerPassage — intercalation : l’attendu décrit la BANDE', () => {
	it('« un nombre entre 450 et 465 » : bande dans l’item, bande dans l’attendu, correction par appartenance', () => {
		const ex: Exercise = {
			type: 'text',
			question: 'Écris un nombre entre 450 et 465 : @',
			answer: '457',
			intervalle: [450, 465],
		};
		const [b] = blocsDe(envoiLecon(bloc('num-encadrer-intercaler', [ex], 'saisie')));
		const [{ item, capture }] = b.items;
		expect(item.intervalle).toEqual([450, 465]);
		expect(capture.attendue, 'les deux bornes sont dites').toContain('450');
		expect(capture.attendue).toContain('465');
		expect(capture.attendue, '457 n’est qu’un exemple parmi quatorze réponses justes').not.toBe(
			'457',
		);
		expect(capture.attendue, 'même formulation que le journal').toBe(attendueItem(item));
		// Critère 11 : la correction de la fiche (bornes exclues).
		expect(checkItemAnswer(item, '451')).toBe(true);
		expect(checkItemAnswer(item, '464')).toBe(true);
		expect(checkItemAnswer(item, '450')).toBe(false);
		expect(checkItemAnswer(item, '465')).toBe(false);
	});
});

describe('preparerPassage — calcul mental hérité (moteur bilanQ)', () => {
	it('l’item est l’exercice FIGÉ dans le lien, pas un nouveau tirage', () => {
		const exs: Exercise[] = [
			{ type: 'text', question: '7 + 8 = @', answer: '15' },
			{ type: 'text', question: '2 + 9 = @', answer: '11' },
			{ type: 'text', question: '6 + 6 = @', answer: '12' },
		];
		const envoi = envoiLecon(bloc('math-tables-addition', exs));
		const [b] = blocsDe(envoi);
		expect(b.items.map((it) => it.item.text)).toEqual(['7 + 8 = @', '2 + 9 = @', '6 + 6 = @']);
		expect(b.items.map((it) => String(it.item.answer))).toEqual(['15', '11', '12']);
		expect(
			b.items.map((it) => it.item._lesson),
			'rattaché à sa leçon (journal)',
		).toEqual(exs.map(() => 'math-tables-addition'));
		expect(b.items.map((it) => it.capture)).toEqual([
			{ lecon: 'math-tables-addition', enonce: '7 + 8 = …', attendue: '15' },
			{ lecon: 'math-tables-addition', enonce: '2 + 9 = …', attendue: '11' },
			{ lecon: 'math-tables-addition', enonce: '6 + 6 = …', attendue: '12' },
		]);
		expect(b.titre).toBe(lecon('math-tables-addition').label);
		expect(b.consigne).toBe('Complète.');
		// Rejouer la préparation ne retire rien.
		expect(blocsDe(envoi)).toEqual([b]);
	});

	it('exercices tirés : chaque item reprend la question et la réponse figées', () => {
		const exs = tirer('math-tables-addition', 8, 'ce2', undefined, 'text');
		const [b] = blocsDe(envoiLecon(bloc('math-tables-addition', exs)));
		exs.forEach((ex, i) => {
			if (ex.type !== 'text') throw new Error('précondition');
			expect(b.items[i].item.text).toBe(ex.question);
			expect(String(b.items[i].item.answer)).toBe(ex.answer);
		});
	});

	it('critère 11 : mêmes verdicts que la fiche de calcul mental (correction numérique)', () => {
		const [b] = blocsDe(
			envoiLecon(
				bloc('math-tables-addition', [{ type: 'text', question: '7 + 8 = @', answer: '15' }]),
			),
		);
		// L'item que la fiche de calcul mental construit pour « 7 + 8 » (moteur bilanQ).
		const fiche: Item = { text: '7 + 8 = @', answer: 15 };
		const saisies = ['15', ' 15 ', '15,0', '15.0', '015', '14', 'quinze', ''];
		const verdictsFiche = saisies.map((s) => checkItemAnswer(fiche, s));
		expect(verdictsFiche, 'précondition : des saisies acceptées ET refusées').toContain(true);
		expect(verdictsFiche).toContain(false);
		expect(saisies.map((s) => checkItemAnswer(b.items[0].item, s))).toEqual(verdictsFiche);
	});
});

describe('preparerPassage — bilan : les exercices de runner retombent sur leur repli texte', () => {
	it('un bloc par bloc, dans l’ordre de l’ENVOI ; items alignés ; Item de la fiche ; mode et leçon par capture', () => {
		// Ordre volontairement différent de celui du catalogue, et une même leçon dans
		// deux blocs (deux modes) : ni tri ni fusion par leçon.
		const blocs: BlocEnvoi[] = [
			bloc(
				'fr-vocab-familles-relier',
				tirer('fr-vocab-familles-relier', 2, 'ce2', 'relier', 'appariement'),
				'relier',
			),
			bloc(
				'math-prob-composition',
				tirer('math-prob-composition', 2, 'ce2', undefined, 'probleme'),
			),
			bloc(
				'fr-conj-etre-present',
				tirer('fr-conj-etre-present', 2, 'ce2', 'saisie', 'text'),
				'saisie',
			),
			bloc('fr-gram-clic-verbe', tirer('fr-gram-clic-verbe', 2, 'ce2', 'clic', 'clicMot'), 'clic'),
			bloc('num-ranger', tirer('num-ranger', 2, 'ce2', 'tuiles', 'tuilesOrdre'), 'tuiles'),
			bloc('fr-homophones-a', tirer('fr-homophones-a', 2, 'ce2', 'qcm', 'qcm'), 'qcm'),
			bloc(
				'num-droite-entiers',
				tirer('num-droite-entiers', 2, 'ce2', 'placer', 'droiteGraduee'),
				'placer',
			),
			bloc(
				'fr-vocab-champs-tri',
				tirer('fr-vocab-champs-tri', 2, 'ce2', 'tri', 'tuilesTri'),
				'tri',
			),
			bloc('fr-conj-etre-present', tirer('fr-conj-etre-present', 2, 'ce2', 'qcm', 'qcm'), 'qcm'),
			bloc('calc-addition-posee', tirer('calc-addition-posee', 2, 'ce2', undefined, 'posed')),
		];
		const p = preparerPassage(envoiBilan(blocs));
		expect(p.ok, 'un bilan se joue en fiche, runners compris').toBe(true);
		if (!p.ok) return;
		expect(p.blocs.map((b) => b.lecon.id)).toEqual(blocs.map((b) => b.lecon));
		p.blocs.forEach((b, k) => {
			const source = blocs[k];
			expect(b.items, `${source.lecon} : items alignés sur les exercices`).toHaveLength(
				source.exercices.length,
			);
			source.exercices.forEach((ex, i) => {
				const { item, capture } = b.items[i];
				const libelle = `${source.lecon} (${source.mode ?? 'sans mode'}) item ${i}`;
				expect(item, `${libelle} : repli de la fiche`).toEqual(itemFiche(b.lecon, ex));
				expect(capture.lecon, libelle).toBe(source.lecon);
				expect(capture.mode, libelle).toBe(source.mode);
				if (ex.type === 'posed') {
					expect(capture.enonce, libelle).toBe(dispositionPosee(ex).operation);
					expect(capture.attendue, libelle).toBe(String(ex.a + ex.b));
				} else {
					expect(capture.enonce, libelle).toBe(enonceJournal(item));
					expect(capture.attendue, libelle).toBe(attendueItem(item));
				}
				expect(capture.enonce, libelle).not.toContain('@');
				expect(capture.enonce.length, `${libelle} : énoncé vide`).toBeGreaterThan(0);
			});
		});
	});

	it('consignes : celle du type au niveau, sinon « Complète. » (maths) ou « Écris la forme correcte. » (français)', () => {
		const clic = lecon('fr-gram-clic-verbe');
		const blocs = blocsDe(
			envoiBilan([
				bloc('fr-homophones-a', tirer('fr-homophones-a', 1, 'ce2', 'qcm', 'qcm'), 'qcm'),
				bloc(
					'math-prob-composition',
					tirer('math-prob-composition', 1, 'ce2', undefined, 'probleme'),
				),
				bloc(
					'fr-gram-clic-verbe',
					tirer('fr-gram-clic-verbe', 1, 'ce2', 'clic', 'clicMot'),
					'clic',
				),
			]),
		);
		expect(
			consignePourNiveau(lecon('fr-homophones-a').exerciseType, 'ce2'),
			'précondition',
		).toBeUndefined();
		expect(
			consignePourNiveau(lecon('math-prob-composition').exerciseType, 'ce2'),
			'précondition',
		).toBeUndefined();
		expect(blocs.map((b) => b.consigne)).toEqual([
			'Écris la forme correcte.',
			'Complète.',
			consignePourNiveau(clic.exerciseType, 'ce2'),
		]);
	});
});

/* ============================================================
   Critère 2 — le niveau vient de l'envoi
   ============================================================ */

describe('critère 2 : le niveau vient de l’ENVOI, jamais du profil actif', () => {
	function regleClasse(niveau: SchoolLevel): void {
		setNiveauReference(niveau);
		setNiveauMatiere('math', niveau);
		setNiveauMatiere('francais', niveau);
	}

	it('envoi CM1 joué sur un profil CE2 puis sur un profil CM1 : mêmes blocs, titre et consigne du CM1', () => {
		const noyau = lecon('fr-gram-clic-noyau');
		const titreCm1 = noyau.labelNiveau?.cm1;
		const titreCe2 = noyau.labelNiveau?.ce2;
		const consigneCm1 = consignePourNiveau(noyau.exerciseType, 'cm1');
		const consigneCe2 = consignePourNiveau(noyau.exerciseType, 'ce2');
		expect(titreCm1, 'précondition : libellé propre au CM1').toBeTruthy();
		expect(titreCm1).not.toBe(titreCe2);
		expect(consigneCm1, 'précondition : consigne propre au CM1').toBeTruthy();
		expect(consigneCm1).not.toBe(consigneCe2);

		const envoi = envoiBilan(
			[
				bloc(
					'fr-gram-clic-noyau',
					tirer('fr-gram-clic-noyau', 3, 'cm1', 'clic', 'clicMot'),
					'clic',
				),
				bloc('num-dec-position', tirer('num-dec-position', 3, 'cm1', undefined, 'text')),
				bloc('math-multiples-50', tirer('math-multiples-50', 3, 'cm1', undefined, 'text')),
			],
			'cm1',
		);

		regleClasse('ce2');
		const surCe2 = preparerPassage(envoi);
		addProfile('Enfant CM1');
		regleClasse('cm1');
		const surCm1 = preparerPassage(envoi);

		expect(surCe2, 'le profil ne change rien à la séance').toEqual(surCm1);
		expect(surCe2.ok).toBe(true);
		if (!surCe2.ok) return;
		expect(surCe2.blocs[0].titre).toBe(titreCm1);
		expect(surCe2.blocs[0].consigne).toBe(consigneCm1);
	});

	it('envoi CE2 joué sur un profil CM1 : titre et consigne du CE2', () => {
		const noyau = lecon('fr-gram-clic-noyau');
		regleClasse('cm1');
		const [b] = blocsDe(
			envoiBilan(
				[
					bloc(
						'fr-gram-clic-noyau',
						tirer('fr-gram-clic-noyau', 2, 'ce2', 'clic', 'clicMot'),
						'clic',
					),
				],
				'ce2',
			),
		);
		expect(b.titre).toBe(noyau.labelNiveau?.ce2);
		expect(b.titre).toBe(labelLecon(noyau, 'ce2'));
		expect(b.consigne).toBe(consignePourNiveau(noyau.exerciseType, 'ce2'));
	});
});

/* ============================================================
   statutItem
   ============================================================ */

describe('statutItem — un statut par item (critère 9)', () => {
	const juste = (saisie: string, pos?: number): ChampCorrige =>
		pos === undefined ? { saisie, correct: true } : { saisie, correct: true, pos };
	const faux = (saisie: string, pos?: number): ChampCorrige =>
		pos === undefined ? { saisie, correct: false } : { saisie, correct: false, pos };

	it('« je ne sais pas » l’emporte sur tout ce que contiennent les champs, saisie vide', () => {
		for (const champs of [
			[juste('15')],
			[faux('14')],
			[faux('')],
			[],
			[juste('2', 0), faux('', 1)],
		]) {
			expect(statutItem(champs, true), JSON.stringify(champs)).toEqual({
				statut: 'jnsp',
				saisie: '',
			});
		}
	});

	it('tous les champs vides → sans réponse', () => {
		expect(statutItem([faux('')], false)).toEqual({ statut: 'vide', saisie: '' });
		expect(statutItem([faux('', 0), faux('', 1), faux('', 2)], false)).toEqual({
			statut: 'vide',
			saisie: '',
		});
	});

	it('aucun champ du tout → sans réponse (rien n’a été donné)', () => {
		expect(statutItem([], false)).toEqual({ statut: 'vide', saisie: '' });
	});

	it('un champ : juste ou faux, avec la saisie telle quelle', () => {
		expect(statutItem([juste('15')], false)).toEqual({ statut: 'juste', saisie: '15' });
		expect(statutItem([faux('14')], false)).toEqual({ statut: 'faux', saisie: '14' });
		expect(statutItem([faux("l'ecole")], false)).toEqual({ statut: 'faux', saisie: "l'ecole" });
	});

	it('opération posée : chiffres réassemblés dans l’ordre de `pos`, pas dans l’ordre reçu', () => {
		// 503 − 278 = 225, cellules reçues dans le désordre.
		expect(statutItem([juste('5', 2), juste('2', 0), juste('2', 1)], false)).toEqual({
			statut: 'juste',
			saisie: '225',
		});
		expect(statutItem([juste('5', 2), juste('2', 0), faux('3', 1)], false)).toEqual({
			statut: 'faux',
			saisie: '235',
		});
	});

	it('opération posée incomplète : faux « (incomplet) », même si les chiffres posés sont justes', () => {
		expect(statutItem([juste('2', 0), faux('', 1), juste('5', 2)], false)).toEqual({
			statut: 'faux',
			saisie: '(incomplet)',
		});
		expect(statutItem([faux('', 0), faux('', 1), juste('5', 2)], false)).toEqual({
			statut: 'faux',
			saisie: '(incomplet)',
		});
	});
});

/* ============================================================
   passageTermine
   ============================================================ */

describe('passageTermine — au moins 60 % d’items répondus (critère 23)', () => {
	const statuts = (repondus: StatutReponse[], vides: number): StatutReponse[] => [
		...repondus,
		...Array.from({ length: vides }, (): StatutReponse => 'vide'),
	];

	it('aucun item : pas terminé', () => {
		expect(passageTermine([])).toBe(false);
	});

	it('3 sur 5 (pile 60 %) : terminé ; 2 sur 5 : pas terminé', () => {
		expect(passageTermine(statuts(['juste', 'faux', 'juste'], 2))).toBe(true);
		expect(passageTermine(statuts(['juste', 'faux'], 3))).toBe(false);
	});

	it('« je ne sais pas » compte comme répondu', () => {
		expect(passageTermine(statuts(['jnsp', 'jnsp', 'jnsp'], 2))).toBe(true);
		expect(passageTermine(['jnsp'])).toBe(true);
	});

	it('que des « sans réponse » : pas terminé', () => {
		expect(passageTermine(statuts([], 4))).toBe(false);
	});

	it('bornes : 5 sur 7 oui, 4 sur 7 non ; 119 sur 200 (59,5 %) non, 120 sur 200 oui', () => {
		const n = (k: number): StatutReponse[] =>
			Array.from({ length: k }, (): StatutReponse => 'faux');
		expect(passageTermine(statuts(n(5), 2))).toBe(true);
		expect(passageTermine(statuts(n(4), 3))).toBe(false);
		// 59,5 % arrondi ferait 60 % : un arrondi au pourcent près ferait passer à tort.
		expect(passageTermine(statuts(n(119), 81))).toBe(false);
		expect(passageTermine(statuts(n(120), 80))).toBe(true);
	});
});

/* ============================================================
   terminerPremierPassage / premierPassage
   ============================================================ */

describe('terminerPremierPassage — premier passage figé (critères 15, 23, 24)', () => {
	const ENVOI = envoiLecon(
		bloc('math-tables-addition', [{ type: 'text', question: '7 + 8 = @', answer: '15' }]),
	);

	it('premier appel : rend le résultat figé, le garde, +5 XP exactement, une entrée d’activité « partage »', () => {
		const capture = capturePour(['juste', 'faux', 'jnsp', 'vide']);
		const xpAvant = getXP();
		const activiteAvant = loadActivity().length;

		const r = terminer(ENVOI, capture);

		expect(r).toEqual(
			figerResultat(capture, { envoi: ENVOI, pseudo: 'Léa', date: DATE_FIN, id: ID_RESULTAT }),
		);
		expect(
			r.reponses.map((x) => x.statut),
			'critère 9 : jnsp et vide distincts de faux',
		).toEqual(['juste', 'faux', 'jnsp', 'vide']);
		expect(premierPassage(ENVOI.id), 'le passage est gardé').toEqual(r);
		expect(getXP() - xpAvant, 'critère 23 : +5, ni 0 ni le score').toBe(5);
		const activite = loadActivity();
		expect(activite).toHaveLength(activiteAvant + 1);
		expect(activite[activite.length - 1].k, 'critère 24 : reconnue comme « séance partagée »').toBe(
			'partage',
		);
	});

	it('critère 24 : l’entrée d’activité ne porte aucun score', () => {
		terminer(ENVOI, capturePour(['juste', 'juste', 'faux']));
		const brut: unknown = lsGet(ACTIVITY_KEY, []);
		expect(Array.isArray(brut)).toBe(true);
		if (!Array.isArray(brut)) return;
		const entree: unknown = brut[brut.length - 1];
		if (typeof entree !== 'object' || entree === null) throw new Error('entrée d’activité absente');
		const cles = Object.keys(entree).sort();
		for (const cle of cles)
			expect(
				['k', 'progressive', 'ref', 't'],
				`champ « ${cle} » dans l’entrée d’activité`,
			).toContain(cle);
		expect(cles).toContain('k');
		expect(cles).toContain('t');
	});

	it('+5 quel que soit le score : dix justes ne rapportent pas 10, tout faux ne rapporte pas 0', () => {
		const xp0 = getXP();
		terminer(
			envoiLecon(bloc('math-tables-addition', []), 'ce2', 'EnvoiJuste01'),
			capturePour(Array.from({ length: 10 }, (): StatutReponse => 'juste')),
		);
		expect(getXP() - xp0, 'dix bonnes réponses').toBe(5);
		const xp1 = getXP();
		terminer(
			envoiLecon(bloc('math-tables-addition', []), 'ce2', 'EnvoiFaux001'),
			capturePour(Array.from({ length: 10 }, (): StatutReponse => 'faux')),
		);
		expect(getXP() - xp1, 'dix erreurs').toBe(5);
	});

	it('second appel pour le même envoi : le premier résultat, inchangé ; ni XP ni activité', () => {
		const premier = terminer(ENVOI, capturePour(['faux', 'faux', 'vide']));
		const xp = getXP();
		const nbActivite = loadActivity().length;

		const second = terminer(ENVOI, capturePour(['juste', 'juste', 'juste']), {
			pseudo: 'Zoé',
			date: DATE_FIN + 60_000,
			id: 'ResultTest02',
		});

		expect(second, 'critère 15 : le premier passage reste celui qui compte').toEqual(premier);
		expect(premierPassage(ENVOI.id)).toEqual(premier);
		expect(getXP(), 'pas de second crédit').toBe(xp);
		expect(loadActivity(), 'pas de seconde entrée').toHaveLength(nbActivite);
	});

	it('deux envois distincts sur le même profil : deux passages, deux crédits', () => {
		const xp = getXP();
		const a = terminer(
			envoiLecon(bloc('math-tables-addition', []), 'ce2', 'EnvoiA000001'),
			capturePour(['juste']),
		);
		const b = terminer(
			envoiLecon(bloc('math-tables-addition', []), 'ce2', 'EnvoiB000001'),
			capturePour(['faux']),
			{
				id: 'ResultTest02',
			},
		);
		expect(getXP() - xp).toBe(10);
		expect(premierPassage('EnvoiA000001')).toEqual(a);
		expect(premierPassage('EnvoiB000001')).toEqual(b);
	});

	it('un autre profil est indépendant : son premier passage, son crédit ; celui de A intact', () => {
		const a = activeProfile().uuid;
		const resultatA = terminer(ENVOI, capturePour(['juste', 'faux']), { pseudo: 'Léa' });
		const xpA = getXPFor(a);

		const b = addProfile('Enfant B').uuid;
		expect(premierPassage(ENVOI.id), 'B n’a pas encore joué ce lien').toBeNull();
		const resultatB = terminer(ENVOI, capturePour(['vide', 'jnsp']), {
			pseudo: 'Tom',
			id: 'ResultTest02',
		});
		expect(resultatB.pseudo).toBe('Tom');
		expect(getXPFor(b), 'premier passage de B : +5').toBe(5);
		expect(getXPFor(a), 'A ne reçoit rien du passage de B').toBe(xpA);

		setActiveProfile(a);
		expect(premierPassage(ENVOI.id), 'le passage de A n’a pas été remplacé').toEqual(resultatA);
	});

	it('critère 16 : préparer et noter sans terminer n’écrit rien, le passage reste à faire', () => {
		const envoi = envoiLecon(
			bloc('num-valeur-position', [
				{ type: 'text', question: 'Dans 4572, quel est le chiffre des centaines ? @', answer: '5' },
				{ type: 'text', question: 'Dans 3081, quel est le chiffre des dizaines ? @', answer: '8' },
			]),
		);
		const avant = instantane();
		const [b] = blocsDe(envoi);
		const capture = nouvelleCapture(b.items.map((it) => it.capture));
		const s = statutItem([{ saisie: '5', correct: checkItemAnswer(b.items[0].item, '5') }], false);
		noterReponse(capture, 0, s);
		expect(passageTermine([s.statut, 'vide', 'vide']), 'abandon avant le seuil').toBe(false);
		expect(clesModifiees(avant, instantane()), 'rien n’est écrit avant la fin').toEqual([]);
		expect(
			premierPassage(envoi.id),
			'rouvrir le lien propose de jouer, pas de recopier',
		).toBeNull();
	});
});

describe('critère 26 : un premier passage ne change que l’XP (+5), l’activité et les passages gardés', () => {
	it('instantané du stockage avant / après une séance complète', () => {
		// XP juste sous un palier de niveau : un calcul de niveau ou de trophée déclenché
		// par la séance se verrait dans le stockage.
		lsSet(XP_KEY, 10);
		const p = prefixe();
		const avant = instantane();

		const envoi = envoiBilan([
			bloc('num-valeur-position', [
				{ type: 'text', question: 'Dans 4572, quel est le chiffre des centaines ? @', answer: '5' },
			]),
			bloc('calc-addition-posee', [{ type: 'posed', op: '+', a: 347, b: 285 }]),
		]);
		const blocs = blocsDe(envoi);
		const items = blocs.flatMap((b) => b.items);
		const capture = nouvelleCapture(items.map((it) => it.capture));
		noterReponse(capture, 0, statutItem([{ saisie: '5', correct: true }], false));
		noterReponse(
			capture,
			1,
			statutItem(
				[
					{ saisie: '6', correct: true, pos: 0 },
					{ saisie: '3', correct: true, pos: 1 },
					{ saisie: '2', correct: true, pos: 2 },
				],
				false,
			),
		);
		terminer(envoi, capture);

		const apres = instantane();
		const permises = [
			p + XP_KEY,
			p + ACTIVITY_KEY,
			p + PARTAGES_RECUS_KEY,
			// Borne « journal des paliers en service », posée par toute session finalisée
			// (`recordActivity`) : n'écrit aucun palier ni aucune stat de leçon.
			p + PALIERS_DEBUT_KEY,
			// Méta des profils : seul `updatedAt` peut bouger (vérifié ci-dessous).
			PROFILES_KEY,
		];
		const modifiees = clesModifiees(avant, apres);
		for (const cle of modifiees)
			expect(permises, `clé modifiée hors périmètre : ${cle}`).toContain(cle);
		for (const cle of [p + XP_KEY, p + ACTIVITY_KEY, p + PARTAGES_RECUS_KEY])
			expect(modifiees, `${cle} aurait dû être écrite`).toContain(cle);
		expect(
			profilsSansHorodatage(apres.get(PROFILES_KEY)),
			'profils : rien d’autre que updatedAt',
		).toBe(profilsSansHorodatage(avant.get(PROFILES_KEY)));
		expect(getXP(), 'deux justes sur deux : +5, pas +2 ni +7').toBe(15);
	});

	it('rejouer le lien (second appel) ne change aucune donnée de progression', () => {
		const envoi = envoiLecon(bloc('math-tables-addition', []));
		terminer(envoi, capturePour(['juste']));
		const avant = instantane();
		terminer(envoi, capturePour(['juste', 'juste']), { id: 'ResultTest02' });
		const modifiees = clesModifiees(avant, instantane()).filter((k) => k !== PROFILES_KEY);
		expect(modifiees, 'un rejeu n’écrit rien').toEqual([]);
	});
});

describe('terminerPremierPassage — passage impossible à garder (stockage plein)', () => {
	const ENVOI = envoiLecon(bloc('math-tables-addition', []));

	/** Rétablit `setItem`. `vi.restoreAllMocks()` ne le fait PAS pour un espion posé sur le
	 *  Proxy de happy-dom (constaté : l'écriture restait refusée) — seul `mockRestore()` de
	 *  l'espion lui-même y parvient. */
	let retablir: (() => void) | null = null;

	afterEach(() => {
		retablir?.();
		retablir = null;
	});

	/** `setItem` lève pour la SEULE clé des passages gardés, comme un quota dépassé ;
	 *  toutes les autres écritures passent. `lsSet` avale l'erreur : rien ne remonte. */
	function refuserEcriturePassages(): { cle: string; refus: () => number } {
		const cle = prefixe() + PARTAGES_RECUS_KEY;
		// Sur l'INSTANCE, pas sur `Storage.prototype` : happy-dom lie les méthodes à
		// l'instance au premier accès, et un espion posé sur le prototype n'intercepte
		// alors rien (constaté : le test passait sans qu'aucune écriture soit refusée).
		const ecrire = localStorage.setItem.bind(localStorage);
		let refus = 0;
		const espion = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
			if (k === cle) {
				refus++;
				throw new DOMException('quota dépassé', 'QuotaExceededError');
			}
			ecrire(k, v);
		});
		retablir = () => espion.mockRestore();
		return { cle, refus: () => refus };
	}

	it('le résultat est rendu, mais ni XP ni activité ; un second appel ne crédite toujours rien', () => {
		const { cle, refus } = refuserEcriturePassages();
		const xp = getXP();
		const activite = lsGetItemRaw(prefixe() + ACTIVITY_KEY);
		const nbActivite = loadActivity().length;

		const capture = capturePour(['juste', 'faux']);
		const r = terminer(ENVOI, capture);

		expect(
			refus(),
			'précondition : l’écriture du passage a bien été tentée et refusée',
		).toBeGreaterThan(0);
		expect(lsGetItemRaw(cle), 'précondition : rien n’est gardé').toBeNull();
		expect(r, 'l’enfant a fini : son résultat lui est rendu').toEqual(
			figerResultat(capture, { envoi: ENVOI, pseudo: 'Léa', date: DATE_FIN, id: ID_RESULTAT }),
		);
		expect(getXP(), 'pas de crédit pour un passage qui ne sera pas reconnu au retour').toBe(xp);
		expect(loadActivity(), 'pas d’entrée d’activité').toHaveLength(nbActivite);
		expect(lsGetItemRaw(prefixe() + ACTIVITY_KEY), 'journal d’activité intact').toBe(activite);
		expect(premierPassage(ENVOI.id)).toBeNull();

		const capture2 = capturePour(['juste', 'juste']);
		const r2 = terminer(ENVOI, capture2, { id: 'ResultTest02' });
		expect(r2, 'second appel : rien n’était gardé, il fige ce passage-ci').toEqual(
			figerResultat(capture2, { envoi: ENVOI, pseudo: 'Léa', date: DATE_FIN, id: 'ResultTest02' }),
		);
		expect(getXP(), 'toujours aucun crédit tant que l’écriture échoue').toBe(xp);
		expect(loadActivity()).toHaveLength(nbActivite);
	});

	it('dès que l’écriture repasse, le premier passage gardé crédite enfin +5, une seule fois', () => {
		const { refus } = refuserEcriturePassages();
		const xp = getXP();
		terminer(ENVOI, capturePour(['faux']));
		expect(refus(), 'précondition : le premier essai a bien été refusé').toBeGreaterThan(0);
		expect(getXP(), 'précondition : sans crédit').toBe(xp);
		retablir?.();
		retablir = null;
		const refusAvant = refus();
		lsSet(PARTAGES_RECUS_KEY, {});
		expect(refus(), 'précondition : l’écriture repasse').toBe(refusAvant);

		const r = terminer(ENVOI, capturePour(['juste']), { id: 'ResultTest02' });
		expect(premierPassage(ENVOI.id)).toEqual(r);
		expect(getXP() - xp, 'le refus précédent n’a ni consommé ni doublé le crédit').toBe(5);
		terminer(ENVOI, capturePour(['juste']), { id: 'ResultTest03' });
		expect(getXP() - xp).toBe(5);
	});

	it('un passage déjà gardé reste rendu tel quel, même si le stockage est plein ensuite', () => {
		const premier = terminer(ENVOI, capturePour(['juste']));
		const xp = getXP();
		const { refus } = refuserEcriturePassages();
		// Précondition : l'espion est bien armé (une écriture directe est refusée, et
		// `lsSet` l'avale sans toucher à la valeur gardée).
		lsSet(PARTAGES_RECUS_KEY, {});
		expect(refus(), 'précondition : écriture refusée').toBe(1);
		expect(premierPassage(ENVOI.id)).toEqual(premier);

		expect(terminer(ENVOI, capturePour(['faux']), { id: 'ResultTest02' })).toEqual(premier);
		expect(getXP()).toBe(xp);
	});
});

describe('premierPassage — stockage absent ou corrompu', () => {
	const ENVOI = envoiLecon(bloc('math-tables-addition', []));

	function resultatValide(): Resultat {
		return figerResultat(capturePour(['juste', 'faux']), {
			envoi: ENVOI,
			pseudo: 'Léa',
			date: DATE_FIN,
			id: ID_RESULTAT,
		});
	}

	it('aucun passage : null ; un autre envoi joué : null pour celui-ci', () => {
		expect(premierPassage(ENVOI.id)).toBeNull();
		terminer(envoiLecon(bloc('math-tables-addition', []), 'ce2', 'EnvoiAutre01'));
		expect(premierPassage(ENVOI.id)).toBeNull();
	});

	it('identifiants « constructor » et « __proto__ » : null, même avec des passages gardés', () => {
		terminer(ENVOI);
		expect(premierPassage('constructor')).toBeNull();
		expect(premierPassage('__proto__')).toBeNull();
		expect(premierPassage('toString')).toBeNull();
	});

	it.each<[string, () => unknown]>([
		['une chaîne', () => 'du texte'],
		['un nombre', () => 42],
		['null', () => null],
		['un tableau', () => [resultatValide()]],
		['une entrée qui n’est pas un objet', () => ({ [ID_ENVOI]: 'pas un résultat' })],
		[
			'des réponses qui ne sont pas une liste',
			() => ({ [ID_ENVOI]: { ...resultatValide(), reponses: 'aucune' } }),
		],
		[
			'une date qui n’est pas un nombre',
			() => ({ [ID_ENVOI]: { ...resultatValide(), date: 'hier' } }),
		],
		[
			'un pseudo hors liste blanche (import de sauvegarde forgé)',
			() => ({ [ID_ENVOI]: { ...resultatValide(), pseudo: '<img src=x onerror=alert(1)>' } }),
		],
		[
			'un statut inconnu',
			() => ({
				[ID_ENVOI]: {
					...resultatValide(),
					reponses: [{ ...resultatValide().reponses[0], statut: 'presque' }],
				},
			}),
		],
	])(
		'stockage corrompu (%s) : null sans lever, et le lien redevient un premier passage',
		(_cas, valeur) => {
			lsSet(PARTAGES_RECUS_KEY, valeur());
			expect(() => premierPassage(ID_ENVOI)).not.toThrow();
			expect(premierPassage(ID_ENVOI)).toBeNull();
			expect(changerPseudo(ID_ENVOI, 'Zoé'), 'rien à renommer').toBeNull();
			// premierPassage dit « pas de passage » : l'écran propose de jouer, et la fin de
			// séance doit alors compter comme un premier passage.
			const xp = getXP();
			const r = terminer(ENVOI);
			expect(getXP() - xp).toBe(5);
			expect(premierPassage(ID_ENVOI)).toEqual(r);
		},
	);

	it('valeur brute qui n’est pas du JSON : null sans lever', () => {
		lsSetRaw(prefixe() + PARTAGES_RECUS_KEY, '{pas du json');
		expect(() => premierPassage(ID_ENVOI)).not.toThrow();
		expect(premierPassage(ID_ENVOI)).toBeNull();
	});
});

describe('changerPseudo — l’enfant corrige son prénom après la séance', () => {
	const ENVOI = envoiLecon(bloc('math-tables-addition', []));

	it('remplace le pseudo, garde id, date, envoi et réponses ; le passage gardé suit', () => {
		const r = terminer(ENVOI, capturePour(['juste', 'jnsp']), { pseudo: 'Léa' });
		const xp = getXP();
		const nbActivite = loadActivity().length;

		const renomme = changerPseudo(ENVOI.id, 'Zoé');

		expect(renomme).toEqual({ ...r, pseudo: 'Zoé' });
		expect(premierPassage(ENVOI.id)).toEqual({ ...r, pseudo: 'Zoé' });
		expect(getXP(), 'renommer ne crédite rien').toBe(xp);
		expect(loadActivity()).toHaveLength(nbActivite);
	});

	it('aucun passage pour cet envoi : null, rien n’est écrit', () => {
		const avant = instantane();
		expect(changerPseudo(ENVOI.id, 'Zoé')).toBeNull();
		expect(clesModifiees(avant, instantane())).toEqual([]);
	});

	it.each(['', '<img src=x onerror=alert(1)>', 'a'.repeat(31), 'Léa!'])(
		'pseudo invalide « %s » : null, le pseudo gardé ne change pas',
		(pseudo) => {
			terminer(ENVOI, capturePour(['juste']), { pseudo: 'Léa' });
			expect(changerPseudo(ENVOI.id, pseudo)).toBeNull();
			expect(premierPassage(ENVOI.id)?.pseudo).toBe('Léa');
		},
	);

	it('un autre profil ne renomme pas le passage de A', () => {
		const a = activeProfile().uuid;
		terminer(ENVOI, capturePour(['juste']), { pseudo: 'Léa' });
		addProfile('Enfant B');
		expect(changerPseudo(ENVOI.id, 'Tom')).toBeNull();
		setActiveProfile(a);
		expect(premierPassage(ENVOI.id)?.pseudo).toBe('Léa');
	});
});

/* ============================================================
   Pseudo — critère 39
   ============================================================ */

describe('pseudoValide — liste blanche du critère 39', () => {
	/** Caractères désignés par leur code : aucun invisible écrit en clair dans ce fichier. */
	const car = (...codes: number[]): string => String.fromCodePoint(...codes);
	const RLO = car(0x202e);

	it.each([
		'Léa',
		'Jean-Marc',
		"N'Golo",
		'Marie Claire',
		'Élodie',
		'Chloé2',
		'CM1 B',
		'7',
		'Profil 1',
		'ç',
		'a'.repeat(30),
		'é'.repeat(30),
	])('accepté : « %s »', (s) => {
		expect(pseudoValide(s)).toBe(true);
	});

	it.each([
		['vide', ''],
		['une espace', ' '],
		['espace en tête', ' Léa'],
		['espace en fin', 'Léa '],
		['apostrophe seule', "'"],
		['trait d’union seul', '-'],
		['ni lettre ni chiffre', "' -"],
		['31 caractères', 'a'.repeat(31)],
		['point d’exclamation', 'Léa!'],
		['point', 'Léa.'],
		['tiret bas', 'Léa_2'],
		['balise', 'Léa<b>'],
		['image forgée', '<img src=x onerror=alert(1)>'],
		['emoji', 'Léa 🦄'],
		['esperluette', 'Tom & Léa'],
		['tabulation', 'Léa\tB'],
		['saut de ligne', 'Léa\nB'],
		['forçage bidi', `Léa${RLO}B`],
	])('refusé (%s)', (_cas, s) => {
		expect(pseudoValide(s)).toBe(false);
	});

	/** Le lien de résultat part-il avec ce pseudo ? Encodage puis décodage, sans lever. */
	async function lienPart(pseudo: string): Promise<boolean> {
		const r: Resultat = {
			id: ID_RESULTAT,
			envoi: { id: ID_ENVOI, libelle: 'Fiche du lundi', niveau: 'ce2' },
			pseudo,
			date: DATE_FIN,
			reponses: [],
		};
		try {
			return (await decoderResultat(await encoderResultat(r))).ok;
		} catch {
			return false;
		}
	}

	it('la même liste blanche que le décodage du lien : un pseudo accepté à l’écran fait toujours partir le lien', async () => {
		// Plus large que les cas ci-dessus : apostrophe typographique, espaces insécables,
		// chiffres non latins, marques combinantes, ligatures, pleine chasse.
		const echantillon = [
			'Léa',
			'Zoé',
			'Ève',
			'Œdipe',
			'Lætitia',
			`Le${car(0x301)}a`,
			'Léa  Zoé',
			`O${car(0x2019)}Neil`,
			"O'Neil",
			`Léa${car(0xa0)}B`,
			`Léa${car(0x202f)}B`,
			car(0x661, 0x662),
			`${car(0xff2c)}éa`,
			'Léa,Tom',
			'Léa/Tom',
			'Léa;Tom',
			'a'.repeat(30),
			'a'.repeat(31),
			'é'.repeat(30),
			'é'.repeat(31),
			'',
			' ',
			"'",
			'-',
			'7',
			'<img src=x onerror=alert(1)>',
			`Léa${RLO}B`,
			'Léa\tB',
			'🦄',
		];
		for (const s of echantillon) {
			expect(pseudoValide(s), `« ${s} » : l’écran et le lien doivent dire pareil`).toBe(
				await lienPart(s),
			);
		}
	});
});

/** Apostrophe typographique U+2019, celle des claviers mobiles. Désignée par son code :
 *  à l'œil, elle se confond avec l'apostrophe droite. */
const APOS_TYPO = String.fromCodePoint(0x2019);

describe('normaliserPseudo — ce que l’écran fait de la saisie avant de la valider', () => {
	it.each([
		['espaces autour', '  Léa  ', 'Léa'],
		['tabulation en fin', 'Zoé\t', 'Zoé'],
		['apostrophe typographique', `L${APOS_TYPO}éa`, "L'éa"],
		[
			'toutes les apostrophes, pas la première seule',
			`N${APOS_TYPO}Golo D${APOS_TYPO}Arc`,
			"N'Golo D'Arc",
		],
		['apostrophe en tête, après le trim', `  ${APOS_TYPO}Léa `, "'Léa"],
		['déjà propre : inchangé', "N'Golo", "N'Golo"],
	])('%s : « %s » → « %s »', (_cas, saisie, attendu) => {
		expect(normaliserPseudo(saisie)).toBe(attendu);
	});

	it('ne filtre rien d’autre : un caractère interdit reste là, c’est pseudoValide qui le refuse', () => {
		expect(normaliserPseudo(' Tom & Léa ')).toBe('Tom & Léa');
		expect(pseudoValide(normaliserPseudo(' Tom & Léa '))).toBe(false);
	});

	it('pseudoValide reste strict : l’apostrophe typographique n’est acceptée qu’après normalisation', () => {
		const saisie = `O${APOS_TYPO}Neil`;
		expect(pseudoValide(saisie), 'la normalisation est l’affaire de l’appelant').toBe(false);
		expect(pseudoValide(normaliserPseudo(saisie))).toBe(true);
	});
});

describe('pseudoParDefaut — le prénom du profil, normalisé, s’il est un pseudo valide', () => {
	it.each([
		['Profil 1', 'Profil 1'],
		['  Léa  ', 'Léa'],
		[`L${APOS_TYPO}éa`, "L'éa"],
		[` N${APOS_TYPO}Golo `, "N'Golo"],
		['Zoé\t', 'Zoé'],
		['Lou-Anne', 'Lou-Anne'],
		[' ' + 'a'.repeat(30) + ' ', 'a'.repeat(30)],
		['Léa 🦄', ''],
		['Tom & Léa', ''],
		['<b>Léa</b>', ''],
		['', ''],
		['   ', ''],
		['a'.repeat(31), ''],
	])('« %s » → « %s »', (nom, attendu) => {
		expect(pseudoParDefaut(nom)).toBe(attendu);
	});

	it('jamais un pseudo que l’écran refuserait : vide, ou valide', () => {
		for (const nom of [
			'Profil 1',
			' Léa',
			'Léa 🦄',
			'x'.repeat(40),
			"N'Golo",
			`O${APOS_TYPO}Neil`,
			'é'.repeat(31),
		]) {
			const p = pseudoParDefaut(nom);
			expect(p === '' || pseudoValide(p), `« ${nom} » → « ${p} »`).toBe(true);
		}
	});
});

/* ============================================================
   MAX_PASSAGES_GARDES
   ============================================================ */

describe('MAX_PASSAGES_GARDES — au-delà, le passage le plus ANCIEN (par date) est oublié', () => {
	const MINUTE = 60_000;
	const idEnvoi = (k: number): string => `EnvoiMax${String(k).padStart(4, '0')}`;
	/** Le k-ième envoi joué a la date « (k + D) mod MAX » minutes, D = un tiers du plafond :
	 *  le plus ancien par date est le (MAX − D)-ième joué, ni le premier ni le dernier.
	 *  Dérivé du plafond plutôt que d'un nombre fixe, pour survivre à son réglage. */
	const D = Math.ceil(MAX_PASSAGES_GARDES / 3);
	const decalage = (k: number): number => (k + D) % MAX_PASSAGES_GARDES;
	const vide = (id: string): Envoi => envoiLecon(bloc('math-tables-addition', []), 'ce2', id);

	function remplir(): number {
		for (let k = 0; k < MAX_PASSAGES_GARDES; k++)
			terminer(vide(idEnvoi(k)), capturePour(['juste']), { date: DATE_FIN + decalage(k) * MINUTE });
		const plusAncien = Array.from({ length: MAX_PASSAGES_GARDES }, (_, k) => k).find(
			(k) => decalage(k) === 0,
		);
		if (plusAncien === undefined) throw new Error('précondition');
		return plusAncien;
	}

	it('pile au plafond : tous les passages sont gardés', () => {
		remplir();
		for (let k = 0; k < MAX_PASSAGES_GARDES; k++)
			expect(premierPassage(idEnvoi(k)), `passage ${k}`).not.toBeNull();
	});

	it('un de plus : seul le plus ancien par date disparaît (pas le premier joué), et son lien redevient un premier passage', () => {
		const plusAncien = remplir();
		expect(plusAncien, 'précondition : le plus ancien n’est pas le premier joué').not.toBe(0);
		expect(plusAncien, 'précondition : ni le dernier joué').not.toBe(MAX_PASSAGES_GARDES - 1);

		const nouveau = 'EnvoiNeuf001';
		terminer(vide(nouveau), capturePour(['juste']), {
			date: DATE_FIN + 10 * MAX_PASSAGES_GARDES * MINUTE,
		});

		expect(premierPassage(nouveau), 'le dernier passage est gardé').not.toBeNull();
		expect(premierPassage(idEnvoi(plusAncien)), 'le plus ancien par date est oublié').toBeNull();
		for (let k = 0; k < MAX_PASSAGES_GARDES; k++)
			if (k !== plusAncien) expect(premierPassage(idEnvoi(k)), `passage ${k} gardé`).not.toBeNull();

		const xp = getXP();
		terminer(vide(idEnvoi(plusAncien)), capturePour(['faux']), {
			date: DATE_FIN + 11 * MAX_PASSAGES_GARDES * MINUTE,
		});
		expect(getXP() - xp, 'lien oublié rouvert : premier passage à nouveau').toBe(5);
	});
});

/* ============================================================
   Activité côté encadrant
   ============================================================ */

describe('activiteParJourParType — les séances partagées ont leur compteur', () => {
	const NOW = 1_700_000_000_000;

	it('compte les entrées « partage » dans `partage`, pas dans `inconnu`', () => {
		const jours = activiteParJourParType(
			[
				{ t: NOW, k: 'partage' },
				{ t: NOW, k: 'partage' },
				{ t: NOW, k: 'lecon' },
			],
			NOW,
		);
		expect(jours[jours.length - 1]).toMatchObject({ total: 3, partage: 2, lecon: 1, inconnu: 0 });
	});

	it('de bout en bout : un premier passage terminé apparaît comme séance partagée le jour même', () => {
		terminer(envoiLecon(bloc('math-tables-addition', [])));
		const brut: unknown = lsGet(ACTIVITY_KEY, []);
		const entrees = loadActivity();
		const derniere = entrees[entrees.length - 1];
		const jours = activiteParJourParType(brut, derniere.t);
		expect(jours[jours.length - 1]).toMatchObject({ total: 1, partage: 1, inconnu: 0 });
	});
});

/* ============================================================
   Parcours complet (critères 9, 11, 14, 23)
   ============================================================ */

describe('parcours : préparer, corriger, noter, terminer, renvoyer', () => {
	it('le résultat dit, item par item, juste / je ne sais pas / sans réponse / faux, et son lien part', async () => {
		const envoi = envoiBilan([
			bloc('num-valeur-position', [
				{ type: 'text', question: 'Dans 4572, quel est le chiffre des centaines ? @', answer: '5' },
				{ type: 'text', question: 'Dans 3081, quel est le chiffre des dizaines ? @', answer: '8' },
				{ type: 'text', question: 'Dans 9264, quel est le chiffre des unités ? @', answer: '4' },
			]),
			bloc('calc-addition-posee', [{ type: 'posed', op: '+', a: 347, b: 285 }]),
			bloc(
				'fr-conj-etre-present',
				[{ type: 'text', question: 'Nous @ en vacances.', answer: 'sommes' }],
				'saisie',
			),
		]);
		const items = blocsDe(envoi).flatMap((b) => b.items);
		expect(items).toHaveLength(5);
		const capture = nouvelleCapture(items.map((it) => it.capture));
		const champ = (i: number, saisie: string): ChampCorrige => ({
			saisie,
			correct: checkItemAnswer(items[i].item, saisie),
		});

		const notes = [
			statutItem([champ(0, '5')], false),
			// L'enfant avait commencé à écrire, puis a choisi « je ne sais pas ».
			statutItem([champ(1, '8')], true),
			statutItem([champ(2, '')], false),
			// 347 + 285 = 632 ; il pose 6, 2, 2 (cellules reçues dans le désordre).
			statutItem(
				[
					{ saisie: '2', correct: true, pos: 2 },
					{ saisie: '6', correct: true, pos: 0 },
					{ saisie: '2', correct: false, pos: 1 },
				],
				false,
			),
			statutItem([champ(4, 'sommes')], false),
		];
		notes.forEach((n, i) => noterReponse(capture, i, n));
		expect(passageTermine(notes.map((n) => n.statut)), '4 répondus sur 5').toBe(true);

		const xp = getXP();
		const r = terminer(envoi, capture);

		expect(r.reponses.map((x) => x.statut)).toEqual(['juste', 'jnsp', 'vide', 'faux', 'juste']);
		expect(r.reponses.map((x) => x.saisie)).toEqual(['5', '', '', '622', 'sommes']);
		expect(r.reponses.map((x) => x.attendue)).toEqual(['5', '8', '4', '632', 'sommes']);
		expect(r.reponses.map((x) => x.enonce)).toEqual([
			'Dans 4572, quel est le chiffre des centaines ? …',
			'Dans 3081, quel est le chiffre des dizaines ? …',
			'Dans 9264, quel est le chiffre des unités ? …',
			'347 + 285',
			'Nous … en vacances.',
		]);
		expect(r.reponses.map((x) => x.lecon)).toEqual([
			'num-valeur-position',
			'num-valeur-position',
			'num-valeur-position',
			'calc-addition-posee',
			'fr-conj-etre-present',
		]);
		expect(r.reponses.map((x) => x.mode)).toEqual([
			undefined,
			undefined,
			undefined,
			undefined,
			'saisie',
		]);
		expect(r.envoi).toEqual({ id: ID_ENVOI, libelle: 'Bilan de la semaine', niveau: 'ce2' });
		expect(getXP() - xp).toBe(5);
		expect(
			await decoderResultat(await encoderResultat(r)),
			'le lien de résultat de l’enfant part',
		).toEqual({
			ok: true,
			valeur: r,
		});
	});
});
