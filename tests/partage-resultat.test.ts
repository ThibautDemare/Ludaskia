/* ============================================================
   Séance partagée par lien (#734) — le RÉSULTAT renvoyé par l'enfant.

   Écrits AVANT l'implémentation, depuis les critères de l'issue et les contrats
   commentés de `src/core/partage/*` (capture, resultat, liens) :
   - capture item par item : la première réponse notée fait foi, un index hors
     capture est refusé, un item jamais noté ressort « vide » ;
   - critère 14 : le résultat dit, pour CHAQUE item du passage, leçon, mode, énoncé,
     saisie, attendu et statut (juste, faux, je ne sais pas, sans réponse) ;
   - critère 31 : aucune donnée de profil autre que le pseudo saisi (liste exacte
     des champs, rien de l'envoi au-delà de id / libellé / niveau) ;
   - aller-retour encodage / décodage du résultat, refus `type` à contre-emploi ;
   - critères 18 et 33 : score « x sur y » en deux entiers, sans pourcentage ;
   - forme des liens `#envoi/<code>` et `#resultat/<code>` ;
   - identifiant aléatoire (base64url, 12 caractères) ;
   - (relecture qualité) « je ne sais pas » et « sans réponse » ne gardent aucune
     saisie ; les textes sont bornés (plafonds, contrôles et forçages bidi retirés)
     pour qu'un résultat de séance finie s'encode toujours.

   Les attendus sont écrits à la main, jamais recopiés d'une implémentation.
   ============================================================ */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	figerResultat,
	noterReponse,
	nouvelleCapture,
	type ItemCapture,
	type ReponseNotee,
} from '../src/core/partage/capture';
import { decoderEnvoi, encoderEnvoi, type Envoi } from '../src/core/partage/envoi';
import { fragmentLien, lireFragment, nouvelIdentifiant } from '../src/core/partage/liens';
import {
	decoderResultat,
	encoderResultat,
	LONGUEUR_MAX_ENONCE,
	LONGUEUR_MAX_REPONSE,
	score,
	type ReponseItem,
	type Resultat,
	type StatutReponse,
} from '../src/core/partage/resultat';

afterEach(() => {
	vi.restoreAllMocks();
});

/* ---------- Jeux de données ---------- */

/** Texte qui n'existe QUE dans les exercices de l'envoi : s'il ressort dans le
 *  résultat, c'est que les blocs de l'envoi y ont fui. */
const MARQUEUR_EXERCICE = 'MARQUEUR-EXERCICE-ENVOI';

const ENVOI_BILAN: Envoi = {
	id: 'EnvoiBilan01',
	libelle: 'Bilan de la semaine',
	nature: 'bilan',
	variante: 'express',
	niveau: 'cm1',
	blocs: [
		{
			lecon: 'math-tables-addition',
			exercices: [{ type: 'text', question: `${MARQUEUR_EXERCICE} 7 + 8`, answer: '15' }],
		},
		{
			lecon: 'fr-homophones-a',
			mode: 'qcm',
			exercices: [{ type: 'text', question: `${MARQUEUR_EXERCICE} a ou à`, answer: 'a' }],
		},
	],
};

const ENVOI_LECON: Envoi = {
	id: 'EnvoiLecon01',
	libelle: 'Tables',
	nature: 'lecon',
	niveau: 'ce2',
	blocs: [{ lecon: 'math-tables-addition', exercices: [] }],
};

/** Dictée tirée d'une liste personnalisée : PAS de niveau. */
const ENVOI_DICTEE_SANS_NIVEAU: Envoi = {
	id: 'EnvoiDict001',
	libelle: 'Dictee 3',
	nature: 'dictee',
	mots: [{ mot: 'arbre', commeDans: "l'arbre du jardin" }],
};

const ENVOI_DICTEE_CE2: Envoi = {
	id: 'EnvoiDict002',
	libelle: 'Dictee 4',
	nature: 'dictee',
	niveau: 'ce2',
	mots: [{ mot: 'école' }],
};

/** Cinq items déclarés par le runner (neufs à chaque appel : aucune capture ne
 *  partage le tableau d'une autre). L'item 0 n'a pas de mode. */
function itemsDeclares(): ItemCapture[] {
	return [
		{ lecon: 'math-tables-addition', enonce: '7 + 8 = ?', attendue: '15' },
		{ lecon: 'fr-homophones-a', mode: 'qcm', enonce: 'Il ___ un vélo. (a ou à)', attendue: 'a' },
		{
			lecon: 'fr-homophones-a',
			mode: 'qcm',
			enonce: "Elle va ___ l'école. (a ou à)",
			attendue: 'à',
		},
		{
			lecon: 'math-decimaux-ecrire',
			mode: 'saisie',
			enonce: 'Écris en chiffres : « trois unités et quatre dixièmes ».',
			attendue: '3,4',
		},
		{
			lecon: 'math-decimaux-ecrire',
			mode: 'saisie',
			enonce: 'Écris en chiffres : « deux unités et cinq centièmes ».',
			attendue: '2,05',
		},
	];
}

const DATE_FIN = Date.UTC(2026, 9, 7, 14, 30, 0);

function contexte(envoi: Envoi = ENVOI_BILAN) {
	return { envoi, pseudo: 'Léa', date: DATE_FIN, id: 'ResultatA1b2' };
}

/** Clés effectivement renseignées d'un objet, triées. Une clé à `undefined` ne
 *  transporte rien (et disparaît au JSON) : elle n'est pas une fuite. */
function clesRenseignees(objet: object): string[] {
	return Object.entries(objet)
		.filter(([, valeur]) => valeur !== undefined)
		.map(([cle]) => cle)
		.sort();
}

/** Un item « vide » tel que l'encadrant doit le lire : énoncé et attendu déclarés,
 *  saisie vide. */
function itemVide(item: ItemCapture): ReponseItem {
	return { ...item, saisie: '', statut: 'vide' };
}

/* ---------- Capture item par item ---------- */

describe('capture item par item (#734)', () => {
	it('figerResultat rend un item par item déclaré, dans l’ordre des index, même noté dans le désordre', () => {
		const items = itemsDeclares();
		const capture = nouvelleCapture(items);
		// Ordre de notation volontairement mélangé.
		for (const index of [3, 0, 4, 2, 1]) {
			noterReponse(capture, index, { statut: 'faux', saisie: `saisie-${index}` });
		}
		const r = figerResultat(capture, contexte());
		expect(r.reponses, 'un item par item déclaré, ni plus ni moins').toHaveLength(items.length);
		expect(
			r.reponses.map((rep) => rep.enonce),
			'les réponses suivent l’ordre des index, pas l’ordre de notation',
		).toEqual(items.map((item) => item.enonce));
		expect(
			r.reponses.map((rep) => rep.saisie),
			'chaque saisie reste attachée à son item',
		).toEqual(['saisie-0', 'saisie-1', 'saisie-2', 'saisie-3', 'saisie-4']);
	});

	it('un item jamais noté ressort « vide », saisie vide, avec l’énoncé et l’attendu déclarés', () => {
		const items = itemsDeclares();
		const capture = nouvelleCapture(items);
		noterReponse(capture, 1, { statut: 'juste', saisie: 'a' });
		const r = figerResultat(capture, contexte());
		for (const index of [0, 2, 3, 4]) {
			expect(r.reponses[index], `item ${index} jamais noté : il doit ressortir vide`).toEqual(
				itemVide(items[index]!),
			);
		}
	});

	it('aucune réponse notée (passage abandonné) : tous les items ressortent « vide », aucun ne manque', () => {
		const items = itemsDeclares();
		const r = figerResultat(nouvelleCapture(items), contexte());
		expect(r.reponses, 'un passage vide liste quand même chaque item').toEqual(items.map(itemVide));
	});

	it('la première réponse notée fait foi : un second noterReponse rend false et ne change rien', () => {
		const items = itemsDeclares();
		const capture = nouvelleCapture(items);
		expect(
			noterReponse(capture, 2, { statut: 'faux', saisie: 'a' }),
			'première réponse : acceptée',
		).toBe(true);
		expect(
			noterReponse(capture, 2, { statut: 'juste', saisie: 'à', attendue: 'autre' }),
			'seconde réponse sur le même item : refusée',
		).toBe(false);
		expect(capture.reponses.size, 'une seule réponse notée').toBe(1);
		const r = figerResultat(capture, contexte());
		expect(r.reponses[2], 'la première réponse (fausse) reste celle du résultat').toEqual({
			lecon: 'fr-homophones-a',
			mode: 'qcm',
			enonce: "Elle va ___ l'école. (a ou à)",
			saisie: 'a',
			attendue: 'à',
			statut: 'faux',
		});
	});

	it('un « je ne sais pas » noté d’abord n’est pas réécrit par une bonne réponse donnée ensuite', () => {
		const capture = nouvelleCapture(itemsDeclares());
		expect(noterReponse(capture, 0, { statut: 'jnsp', saisie: '' })).toBe(true);
		expect(
			noterReponse(capture, 0, { statut: 'juste', saisie: '15' }),
			'une reprise après « je ne sais pas » ne compte pas',
		).toBe(false);
		const r = figerResultat(capture, contexte());
		expect(r.reponses[0]?.statut, 'le renoncement initial est ce que l’encadrant doit lire').toBe(
			'jnsp',
		);
		expect(r.reponses[0]?.saisie).toBe('');
	});

	it.each([
		['-1', -1],
		['la longueur (un après le dernier)', 5],
		['1.5 (non entier)', 1.5],
		['NaN', Number.NaN],
	])('index hors capture %s : false, et rien ne change', (_libelle, index) => {
		const items = itemsDeclares();
		expect(items).toHaveLength(5);
		const capture = nouvelleCapture(items);
		expect(
			noterReponse(capture, index, { statut: 'juste', saisie: '15' }),
			`l'index ${String(index)} n'est pas un item de la capture`,
		).toBe(false);
		expect(capture.reponses.size, 'aucune réponse ne doit avoir été enregistrée').toBe(0);
		const r = figerResultat(capture, contexte());
		expect(r.reponses, 'pas d’item ajouté, aucun item réécrit (1.5 n’est ni 1 ni 2)').toEqual(
			items.map(itemVide),
		);
		// Le refus n'abîme pas la capture : un index valide passe ensuite.
		expect(noterReponse(capture, 1, { statut: 'juste', saisie: 'a' })).toBe(true);
	});

	it('`attendue` passé à noterReponse remplace l’attendu déclaré ; sinon c’est l’attendu déclaré', () => {
		const capture = nouvelleCapture(itemsDeclares());
		noterReponse(capture, 3, { statut: 'faux', saisie: '3,04', attendue: '3,4 (et non 3,04)' });
		noterReponse(capture, 4, { statut: 'faux', saisie: '2,5' });
		const r = figerResultat(capture, contexte());
		expect(r.reponses[3]?.attendue, 'l’attendu fourni à la correction l’emporte').toBe(
			'3,4 (et non 3,04)',
		);
		expect(r.reponses[4]?.attendue, 'sans attendu fourni, l’attendu déclaré').toBe('2,05');
	});

	it('leçon, mode et énoncé viennent de l’item déclaré ; pseudo, date et id du contexte', () => {
		const items = itemsDeclares();
		const capture = nouvelleCapture(items);
		noterReponse(capture, 0, { statut: 'juste', saisie: '15' });
		noterReponse(capture, 1, { statut: 'juste', saisie: 'a' });
		const r = figerResultat(capture, contexte());
		expect(r.reponses[0]?.lecon).toBe('math-tables-addition');
		expect(r.reponses[0]?.mode, 'item déclaré sans mode : pas de mode inventé').toBeUndefined();
		expect(r.reponses[1]?.lecon).toBe('fr-homophones-a');
		expect(r.reponses[1]?.mode).toBe('qcm');
		expect(r.reponses[1]?.enonce).toBe('Il ___ un vélo. (a ou à)');
		expect(r.pseudo).toBe('Léa');
		expect(r.date).toBe(DATE_FIN);
		expect(r.id, 'l’identifiant du résultat est celui du contexte, pas celui de l’envoi').toBe(
			'ResultatA1b2',
		);
	});

	it.each<[string, Envoi, Resultat['envoi']]>([
		['bilan', ENVOI_BILAN, { id: 'EnvoiBilan01', libelle: 'Bilan de la semaine', niveau: 'cm1' }],
		['leçon', ENVOI_LECON, { id: 'EnvoiLecon01', libelle: 'Tables', niveau: 'ce2' }],
		[
			'dictée prédéfinie',
			ENVOI_DICTEE_CE2,
			{ id: 'EnvoiDict002', libelle: 'Dictee 4', niveau: 'ce2' },
		],
		[
			'dictée personnalisée (sans niveau)',
			ENVOI_DICTEE_SANS_NIVEAU,
			{ id: 'EnvoiDict001', libelle: 'Dictee 3' },
		],
	])(
		'envoi %s : le résultat rappelle {id, libelle, niveau} de l’envoi',
		(_nature, envoi, attendu) => {
			const r = figerResultat(nouvelleCapture(itemsDeclares()), contexte(envoi));
			expect(r.envoi, 'rappel de l’envoi joué').toEqual(attendu);
			expect(
				clesRenseignees(r.envoi),
				'rien d’autre de l’envoi que son identifiant, son libellé et son niveau éventuel',
			).toEqual(Object.keys(attendu).sort());
		},
	);
});

/* ---------- Critère 14 ---------- */

describe('critère 14 : le résultat dit ce qui s’est passé sur chaque item', () => {
	it('libellé, id et niveau de l’envoi, pseudo, date, id propre, et pour chaque item leçon, mode, énoncé, saisie, attendu, statut', () => {
		const items = itemsDeclares();
		const capture = nouvelleCapture(items);
		noterReponse(capture, 0, { statut: 'juste', saisie: '15' });
		noterReponse(capture, 1, { statut: 'faux', saisie: 'à' });
		noterReponse(capture, 2, { statut: 'jnsp', saisie: '' });
		// item 3 laissé sans réponse
		noterReponse(capture, 4, { statut: 'juste', saisie: '2,05' });
		const r = figerResultat(capture, contexte());
		expect(r, 'résultat complet du passage').toEqual({
			id: 'ResultatA1b2',
			envoi: { id: 'EnvoiBilan01', libelle: 'Bilan de la semaine', niveau: 'cm1' },
			pseudo: 'Léa',
			date: DATE_FIN,
			reponses: [
				{
					lecon: 'math-tables-addition',
					enonce: '7 + 8 = ?',
					saisie: '15',
					attendue: '15',
					statut: 'juste',
				},
				{
					lecon: 'fr-homophones-a',
					mode: 'qcm',
					enonce: 'Il ___ un vélo. (a ou à)',
					saisie: 'à',
					attendue: 'a',
					statut: 'faux',
				},
				{
					lecon: 'fr-homophones-a',
					mode: 'qcm',
					enonce: "Elle va ___ l'école. (a ou à)",
					saisie: '',
					attendue: 'à',
					statut: 'jnsp',
				},
				{
					lecon: 'math-decimaux-ecrire',
					mode: 'saisie',
					enonce: 'Écris en chiffres : « trois unités et quatre dixièmes ».',
					saisie: '',
					attendue: '3,4',
					statut: 'vide',
				},
				{
					lecon: 'math-decimaux-ecrire',
					mode: 'saisie',
					enonce: 'Écris en chiffres : « deux unités et cinq centièmes ».',
					saisie: '2,05',
					attendue: '2,05',
					statut: 'juste',
				},
			],
		});
	});

	it.each<StatutReponse>(['juste', 'faux', 'jnsp', 'vide'])(
		'le statut « %s » noté ressort tel quel (jnsp n’est jamais rabattu sur faux)',
		(statut) => {
			const capture = nouvelleCapture(itemsDeclares());
			noterReponse(capture, 1, {
				statut,
				saisie: statut === 'juste' || statut === 'faux' ? 'a' : '',
			});
			const r = figerResultat(capture, contexte());
			expect(r.reponses[1]?.statut, `statut noté « ${statut} »`).toBe(statut);
		},
	);
});

/* ---------- Critère 31 ---------- */

describe('critère 31 : aucune donnée de profil autre que le pseudo saisi', () => {
	function resultatComplet(envoi: Envoi = ENVOI_BILAN): Resultat {
		const capture = nouvelleCapture(itemsDeclares());
		noterReponse(capture, 0, { statut: 'juste', saisie: '15' });
		noterReponse(capture, 1, { statut: 'faux', saisie: 'à' });
		noterReponse(capture, 2, { statut: 'jnsp', saisie: '' });
		return figerResultat(capture, contexte(envoi));
	}

	it('le résultat n’a que les champs id, envoi, pseudo, date, reponses', () => {
		expect(
			clesRenseignees(resultatComplet()),
			'tout champ en plus (uuid, historique, niveau du profil…) est une fuite',
		).toEqual(['date', 'envoi', 'id', 'pseudo', 'reponses']);
	});

	it('le rappel de l’envoi n’a que id et libelle (+ niveau s’il existe)', () => {
		expect(clesRenseignees(resultatComplet(ENVOI_BILAN).envoi)).toEqual([
			'id',
			'libelle',
			'niveau',
		]);
		expect(
			clesRenseignees(resultatComplet(ENVOI_DICTEE_SANS_NIVEAU).envoi),
			'dictée sans niveau : aucun niveau ne doit apparaître (surtout pas celui du profil)',
		).toEqual(['id', 'libelle']);
	});

	it('une réponse n’a que lecon, enonce, saisie, attendue, statut (+ mode s’il existe)', () => {
		const r = resultatComplet();
		expect(clesRenseignees(r.reponses[0]!), 'item sans mode').toEqual([
			'attendue',
			'enonce',
			'lecon',
			'saisie',
			'statut',
		]);
		for (const index of [1, 2, 3, 4]) {
			expect(clesRenseignees(r.reponses[index]!), `item ${index} (avec mode)`).toEqual([
				'attendue',
				'enonce',
				'lecon',
				'mode',
				'saisie',
				'statut',
			]);
		}
	});

	it('les blocs et exercices de l’envoi ne fuient pas dans le résultat', () => {
		const texte = JSON.stringify(resultatComplet());
		expect(
			texte,
			'le texte des exercices de l’envoi ne doit pas voyager dans le résultat',
		).not.toContain(MARQUEUR_EXERCICE);
		for (const cle of ['"blocs"', '"exercices"', '"nature"', '"variante"']) {
			expect(texte, `champ d’envoi ${cle} retrouvé dans le résultat`).not.toContain(cle);
		}
	});
});

/* ---------- Aller-retour du code ---------- */

describe('aller-retour du code de résultat', () => {
	function resultatPour(envoi: Envoi): Resultat {
		const capture = nouvelleCapture(itemsDeclares());
		noterReponse(capture, 0, { statut: 'juste', saisie: '15' });
		noterReponse(capture, 1, { statut: 'faux', saisie: 'à' });
		noterReponse(capture, 2, { statut: 'jnsp', saisie: '' });
		noterReponse(capture, 3, { statut: 'faux', saisie: "3,04 l'unité" });
		return figerResultat(capture, contexte(envoi));
	}

	it('decoderResultat(encoderResultat(r)) rend r intact (accents, « », apostrophe, quatre statuts)', async () => {
		const r = resultatPour(ENVOI_DICTEE_CE2);
		expect(r.pseudo).toBe('Léa');
		expect(r.envoi.libelle).toBe('Dictee 4');
		const decode = await decoderResultat(await encoderResultat(r));
		expect(decode, 'aller-retour sans perte').toEqual({ ok: true, valeur: r });
	});

	it('aller-retour d’un résultat de dictée sans niveau, libellé « Dictee 3 »', async () => {
		const r = resultatPour(ENVOI_DICTEE_SANS_NIVEAU);
		expect(r.envoi.libelle).toBe('Dictee 3');
		const decode = await decoderResultat(await encoderResultat(r));
		expect(decode, 'aller-retour sans perte, sans niveau inventé').toEqual({ ok: true, valeur: r });
	});

	it('un code de résultat ouvert comme un envoi est refusé pour son type', async () => {
		const code = await encoderResultat(resultatPour(ENVOI_BILAN));
		expect(await decoderEnvoi(code), 'un résultat n’est pas un envoi').toEqual({
			ok: false,
			raison: 'type',
		});
	});

	it('un code d’envoi ouvert comme un résultat est refusé pour son type', async () => {
		const code = await encoderEnvoi(ENVOI_DICTEE_SANS_NIVEAU);
		expect(await decoderResultat(code), 'un envoi n’est pas un résultat').toEqual({
			ok: false,
			raison: 'type',
		});
	});
});

/* ---------- Saisie d'un renoncement ---------- */

describe('« je ne sais pas » et « sans réponse » ne gardent jamais de saisie', () => {
	it.each<[StatutReponse, string]>([
		['juste', 'à'],
		['faux', 'à'],
		['jnsp', ''],
		['vide', ''],
	])(
		'statut « %s » noté avec la saisie « à » : la saisie ressort « %s »',
		(statut, saisieAttendue) => {
			const capture = nouvelleCapture(itemsDeclares());
			noterReponse(capture, 2, { statut, saisie: 'à' });
			const r = figerResultat(capture, contexte());
			expect(
				r.reponses[2]?.saisie,
				'seule une réponse DONNÉE (juste ou fausse) garde sa saisie : un brouillon abandonné ne se lit pas comme une réponse',
			).toBe(saisieAttendue);
			expect(r.reponses[2]?.statut).toBe(statut);
			expect(r.reponses[2]?.attendue, 'l’attendu reste dit, même après un renoncement').toBe('à');
		},
	);
});

/* ---------- Textes bornés : le lien d'une séance finie part toujours ---------- */

describe('textes bornés : le lien d’une séance finie part toujours', () => {
	/** Caractère(s) par point de code. Écrits ainsi plutôt qu'en littéral : aucun
	 *  caractère invisible (forçage bidi, espace insécable) ne se glisse dans ce fichier. */
	const car = (...codes: number[]): string => String.fromCodePoint(...codes);

	/** Contrôles qui SÉPARENT (tabulation, saut de ligne, tabulation verticale, saut de
	 *  page, retour chariot, NEL) : ils deviennent une espace, « 3<tab>4 » → « 3 4 ». */
	const SEPARATEURS = car(0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x85);
	/** Tous les contrôles : catégorie Unicode Cc (C0, DEL, C1). */
	const CONTROLES = Array.from({ length: 0x100 }, (_, i) => car(i))
		.filter((c) => /\p{Cc}/u.test(c))
		.join('');
	/** Les autres contrôles : retirés sans laisser d'espace. */
	const AUTRES_CONTROLES = [...CONTROLES].filter((c) => !SEPARATEURS.includes(c)).join('');
	/** Forçages bidirectionnels U+202A à U+202E et U+2066 à U+2069 : retirés. */
	const FORCAGES_BIDI = car(0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069);
	const RLO = car(0x202e);
	const NBSP = car(0xa0);
	const NNBSP = car(0x202f);
	const EMOJI = car(0x1f600);

	function gardeUnInterdit(s: string): boolean {
		return [...s].some((c) => /\p{Cc}/u.test(c) || FORCAGES_BIDI.includes(c));
	}

	/** Moitié d'emoji (surrogate UTF-16) privée de son autre moitié : un losange « ? » à l'écran. */
	function gardeUnDemiCaractere(s: string): boolean {
		for (let i = 0; i < s.length; i++) {
			const c = s.charCodeAt(i);
			if (c >= 0xdc00 && c <= 0xdfff) return true;
			if (c >= 0xd800 && c <= 0xdbff) {
				const suivant = s.charCodeAt(i + 1);
				if (!(suivant >= 0xdc00 && suivant <= 0xdfff)) return true;
				i++;
			}
		}
		return false;
	}

	const ENONCE_LONG = 'Écris le nombre « mille deux cent trente-quatre » en chiffres. '
		.repeat(40)
		.slice(0, 2000);
	const SAISIE_LONGUE = '3,4 '.repeat(150);
	const POLLUEE = `deux${car(0x09)}cent${car(0x0a)}trente${RLO}quatre`;

	function figer(items: ItemCapture[], notes: Array<[number, ReponseNotee]>): Resultat {
		const capture = nouvelleCapture(items);
		for (const [index, note] of notes) noterReponse(capture, index, note);
		return figerResultat(capture, contexte());
	}

	function saisieBornee(saisie: string): string {
		return figer(itemsDeclares(), [[0, { statut: 'faux', saisie }]]).reponses[0]!.saisie;
	}

	/** Le lien part-il ? Encodage puis décodage, sans lever. */
	async function partirait(r: Resultat): Promise<boolean> {
		try {
			return (await decoderResultat(await encoderResultat(r))).ok;
		} catch {
			return false;
		}
	}

	it('préconditions : textes au-dessus des plafonds, jeux de caractères au complet', () => {
		expect(ENONCE_LONG).toHaveLength(2000);
		expect(SAISIE_LONGUE).toHaveLength(600);
		expect(ENONCE_LONG.length, 'sinon le test d’énoncé ne borne rien').toBeGreaterThan(
			LONGUEUR_MAX_ENONCE,
		);
		expect(SAISIE_LONGUE.length, 'sinon le test de saisie ne borne rien').toBeGreaterThan(
			LONGUEUR_MAX_REPONSE,
		);
		expect(CONTROLES, '65 contrôles Cc entre U+0000 et U+00FF').toHaveLength(65);
		expect(AUTRES_CONTROLES, 'les 6 séparateurs sont bien des contrôles').toHaveLength(59);
		expect(EMOJI, 'un emoji tient sur deux unités UTF-16').toHaveLength(2);
	});

	it('énoncé de 2000 caractères : ramené pile à LONGUEUR_MAX_ENONCE, début conservé, « … » final', () => {
		const r = figer([{ lecon: 'math-numeration', enonce: ENONCE_LONG, attendue: '1234' }], []);
		const enonce = r.reponses[0]!.enonce;
		expect(enonce, 'le texte tronqué fait exactement le plafond').toHaveLength(LONGUEUR_MAX_ENONCE);
		expect(enonce.endsWith('…'), 'la coupe se voit').toBe(true);
		expect(enonce.slice(0, -1), 'c’est le DÉBUT de l’énoncé qui est gardé').toBe(
			ENONCE_LONG.slice(0, LONGUEUR_MAX_ENONCE - 1),
		);
	});

	it('saisie de 600 caractères, attendu trop long (déclaré ou fourni à la correction) : ramenés pile à LONGUEUR_MAX_REPONSE', () => {
		const attenduLong = 'quatre '.repeat(100);
		expect(attenduLong.length).toBeGreaterThan(LONGUEUR_MAX_REPONSE);
		const r = figer(
			[
				{ lecon: 'math-decimaux', enonce: 'item 0', attendue: attenduLong },
				{ lecon: 'math-decimaux', enonce: 'item 1', attendue: '3,4' },
			],
			[
				[0, { statut: 'faux', saisie: SAISIE_LONGUE }],
				[1, { statut: 'faux', saisie: '3,04', attendue: attenduLong }],
			],
		);
		const [r0, r1] = r.reponses;
		expect(r0!.saisie).toHaveLength(LONGUEUR_MAX_REPONSE);
		expect(r0!.saisie).toBe(SAISIE_LONGUE.slice(0, LONGUEUR_MAX_REPONSE - 1) + '…');
		expect(r0!.attendue, 'attendu déclaré trop long').toBe(
			attenduLong.slice(0, LONGUEUR_MAX_REPONSE - 1) + '…',
		);
		expect(r1!.attendue, 'attendu fourni à la correction, trop long').toBe(
			attenduLong.slice(0, LONGUEUR_MAX_REPONSE - 1) + '…',
		);
	});

	it('à la borne exacte, le texte reste intact ; un caractère de plus, et il est tronqué à la borne', () => {
		const pileReponse = 'é'.repeat(LONGUEUR_MAX_REPONSE);
		const pileEnonce = 'é'.repeat(LONGUEUR_MAX_ENONCE);
		const r = figer(
			[
				{ lecon: 'fr-accents', enonce: pileEnonce, attendue: pileReponse },
				{ lecon: 'fr-accents', enonce: pileEnonce + 'x', attendue: 'é' },
			],
			[
				[0, { statut: 'juste', saisie: pileReponse }],
				[1, { statut: 'faux', saisie: pileReponse + 'x' }],
			],
		);
		const [r0, r1] = r.reponses;
		expect(r0!.enonce, 'énoncé de LONGUEUR_MAX_ENONCE caractères : intact').toBe(pileEnonce);
		expect(r0!.saisie, 'saisie de LONGUEUR_MAX_REPONSE caractères : intacte').toBe(pileReponse);
		expect(r0!.attendue, 'attendu de LONGUEUR_MAX_REPONSE caractères : intact').toBe(pileReponse);
		expect(r1!.enonce, 'un caractère de trop : tronqué').toBe(
			'é'.repeat(LONGUEUR_MAX_ENONCE - 1) + '…',
		);
		expect(r1!.saisie, 'un caractère de trop : tronquée').toBe(
			'é'.repeat(LONGUEUR_MAX_REPONSE - 1) + '…',
		);
	});

	it.each<[string, string, string]>([
		['tabulation', '3 4', `3${car(0x09)}4`],
		['saut de ligne', 'a b', `a${car(0x0a)}b`],
		['tabulation verticale', 'a b', `a${car(0x0b)}b`],
		['saut de page', 'a b', `a${car(0x0c)}b`],
		['retour chariot', 'a b', `a${car(0x0d)}b`],
		['NEL (U+0085)', 'a b', `a${car(0x85)}b`],
		['U+0001', 'ab', `a${car(0x01)}b`],
		['DEL (U+007F)', 'ab', `a${car(0x7f)}b`],
		['U+202E (forçage droite-à-gauche)', 'ab', `a${RLO}b`],
		['U+2066 (isolat)', 'ab', `a${car(0x2066)}b`],
	])('%s dans la saisie : ressort « %s »', (_nom, attendu, saisie) => {
		expect(
			saisieBornee(saisie),
			'un séparateur devient une espace (sinon « 3<tab>4 » se lirait « 34 ») ; les autres sont retirés sans trace',
		).toBe(attendu);
	});

	it('tous les contrôles et forçages bidi : séparateurs → espace, le reste retiré, dans l’énoncé, la saisie et l’attendu', () => {
		const sale = `a${AUTRES_CONTROLES}b${FORCAGES_BIDI}c${SEPARATEURS}d`;
		const rep = figer(
			[{ lecon: 'fr-controles', enonce: sale, attendue: sale }],
			[[0, { statut: 'faux', saisie: sale }]],
		).reponses[0]!;
		for (const champ of ['enonce', 'saisie', 'attendue'] as const) {
			expect(gardeUnInterdit(rep[champ]), `${champ} : caractère interdit restant`).toBe(false);
			expect(
				rep[champ],
				`${champ} : 59 contrôles et 9 forçages retirés, 6 séparateurs → 6 espaces`,
			).toBe('abc' + ' '.repeat(6) + 'd');
		}
	});

	it('sous le plafond, un texte libre reste intact : espaces insécables U+00A0 et U+202F, « », <, accents', () => {
		const enonce = `Compare${NBSP}: 1${NNBSP}234 < 1${NNBSP}243, « vrai » ou « faux » ?`;
		const saisie = `l'école${NBSP}!`;
		const attendue = `1${NNBSP}234`;
		const rep = figer(
			[{ lecon: 'math-comparer', enonce, attendue }],
			[[0, { statut: 'faux', saisie }]],
		).reponses[0]!;
		expect(rep.enonce, 'énoncé sous le plafond : intact').toBe(enonce);
		expect(rep.saisie, 'saisie sous le plafond : intacte').toBe(saisie);
		expect(rep.attendue, 'attendu sous le plafond : intact').toBe(attendue);
	});

	it('on nettoie avant de tronquer : un texte qui ne dépasse qu’à cause d’un caractère retiré n’est pas coupé', () => {
		const saisie = 'x'.repeat(LONGUEUR_MAX_REPONSE - 1) + RLO + 'y';
		expect(saisie.length).toBe(LONGUEUR_MAX_REPONSE + 1);
		expect(saisieBornee(saisie), 'le « y » final est du contenu, pas un débordement').toBe(
			'x'.repeat(LONGUEUR_MAX_REPONSE - 1) + 'y',
		);
	});

	it.each<[string, () => string, () => string]>([
		[
			'à cheval sur la coupe : coupé AVANT, plafond moins un',
			() => 'a'.repeat(LONGUEUR_MAX_REPONSE - 2) + EMOJI + 'b'.repeat(10),
			() => 'a'.repeat(LONGUEUR_MAX_REPONSE - 2) + '…',
		],
		[
			'entier juste avant la coupe : gardé, pile au plafond',
			() => 'a'.repeat(LONGUEUR_MAX_REPONSE - 3) + EMOJI + 'b'.repeat(10),
			() => 'a'.repeat(LONGUEUR_MAX_REPONSE - 3) + EMOJI + '…',
		],
		[
			'juste après la coupe : écarté, pile au plafond',
			() => 'a'.repeat(LONGUEUR_MAX_REPONSE - 1) + EMOJI,
			() => 'a'.repeat(LONGUEUR_MAX_REPONSE - 1) + '…',
		],
	])('emoji %s', (_cas, saisie, attendu) => {
		const borne = saisieBornee(saisie());
		expect(
			gardeUnDemiCaractere(borne),
			'une moitié d’emoji s’afficherait en losange chez l’encadrant',
		).toBe(false);
		expect(
			[LONGUEUR_MAX_REPONSE, LONGUEUR_MAX_REPONSE - 1],
			'plafond, ou plafond moins un si la coupe tombait dans l’emoji',
		).toContain(borne.length);
		expect(borne).toBe(attendu());
	});

	it('critère : un résultat aux textes trop longs ou pollués S’ENCODE et se décode à l’identique', async () => {
		const sale = `a${AUTRES_CONTROLES}b${FORCAGES_BIDI}c${SEPARATEURS}d`;
		const r = figer(
			[
				{ lecon: 'math-numeration', enonce: ENONCE_LONG, attendue: '1234' },
				{ lecon: 'math-decimaux', mode: 'saisie', enonce: 'item 1', attendue: '3,4' },
				{ lecon: 'math-decimaux', enonce: sale, attendue: SAISIE_LONGUE },
				{ lecon: 'math-decimaux', enonce: 'item 3', attendue: '2,05' },
				{ lecon: 'math-decimaux', enonce: 'item 4', attendue: '2,05' },
			],
			[
				[0, { statut: 'faux', saisie: SAISIE_LONGUE }],
				[1, { statut: 'faux', saisie: POLLUEE }],
				[2, { statut: 'faux', saisie: sale, attendue: SAISIE_LONGUE + POLLUEE }],
				[3, { statut: 'jnsp', saisie: SAISIE_LONGUE + POLLUEE }],
				[4, { statut: 'faux', saisie: 'a'.repeat(LONGUEUR_MAX_REPONSE - 2) + EMOJI + 'b' }],
			],
		);
		expect(
			await decoderResultat(await encoderResultat(r)),
			'l’enfant a fini sa séance : son lien doit partir',
		).toEqual({ ok: true, valeur: r });
	});

	it.each<[string, Partial<ReponseItem>]>([
		['un énoncé trop long', { enonce: ENONCE_LONG }],
		['une saisie trop longue', { saisie: SAISIE_LONGUE }],
		['une saisie avec tabulation, saut de ligne et U+202E', { saisie: POLLUEE }],
	])(
		'témoin : %s, NON borné, ne passerait pas le lien (le bornage est bien ce qui le sauve)',
		async (_cas, champ) => {
			const brut: Resultat = {
				id: 'ResultatA1b2',
				envoi: { id: 'EnvoiBilan01', libelle: 'Bilan de la semaine', niveau: 'cm1' },
				pseudo: 'Léa',
				date: DATE_FIN,
				reponses: [
					{
						lecon: 'math-decimaux',
						enonce: 'item 0',
						saisie: '3,4',
						attendue: '3,4',
						statut: 'juste',
						...champ,
					},
				],
			};
			expect(
				await partirait(brut),
				'si ce texte brut passait, le test d’aller-retour ne prouverait rien',
			).toBe(false);
		},
	);
});

/* ---------- Critères 18 et 33 : score ---------- */

describe('critères 18 et 33 : score « x sur y », sans pourcentage', () => {
	function resultatAvec(
		reponses: Array<Pick<ReponseItem, 'statut' | 'saisie' | 'attendue'>>,
	): Resultat {
		return {
			id: 'ResultatS001',
			envoi: { id: 'EnvoiS00001', libelle: 'Score' },
			pseudo: 'Léa',
			date: DATE_FIN,
			reponses: reponses.map((rep, i) => ({
				lecon: 'math-tables-addition',
				enonce: `item ${i}`,
				...rep,
			})),
		};
	}

	it('x = nombre de « juste », y = nombre total d’items ; faux, jnsp et vide ne comptent pas', () => {
		const s = score(
			resultatAvec([
				{ statut: 'juste', saisie: '15', attendue: '15' },
				{ statut: 'faux', saisie: '14', attendue: '15' },
				{ statut: 'jnsp', saisie: '', attendue: '15' },
				{ statut: 'vide', saisie: '', attendue: '15' },
				{ statut: 'juste', saisie: '12', attendue: '12' },
			]),
		);
		expect(s, '2 justes sur 5 items').toEqual({ justes: 2, total: 5 });
	});

	it('rend exactement deux entiers, ni pourcentage ni note', () => {
		const s = score(
			resultatAvec([
				{ statut: 'juste', saisie: '1', attendue: '1' },
				{ statut: 'faux', saisie: '2', attendue: '3' },
				{ statut: 'faux', saisie: '4', attendue: '5' },
			]),
		);
		expect(Object.keys(s).sort(), 'pas de champ pourcentage ou note').toEqual(['justes', 'total']);
		expect(Number.isInteger(s.justes) && Number.isInteger(s.total), '1 sur 3 : deux entiers').toBe(
			true,
		);
		expect(s).toEqual({ justes: 1, total: 3 });
	});

	it('se fie au statut, pas à une comparaison saisie / attendu (forme équivalente acceptée)', () => {
		const s = score(
			resultatAvec([
				{ statut: 'juste', saisie: '3,40', attendue: '3,4' },
				{ statut: 'juste', saisie: 'L’arbre', attendue: "l'arbre" },
			]),
		);
		expect(s, 'deux réponses jugées justes à la correction restent justes au score').toEqual({
			justes: 2,
			total: 2,
		});
	});

	it('bords : aucun item → 0 sur 0 ; que des renoncements → 0 sur n ; tout juste → n sur n', () => {
		expect(score(resultatAvec([])), 'résultat sans item').toEqual({ justes: 0, total: 0 });
		expect(
			score(
				resultatAvec([
					{ statut: 'jnsp', saisie: '', attendue: 'a' },
					{ statut: 'vide', saisie: '', attendue: 'b' },
					{ statut: 'jnsp', saisie: '', attendue: 'c' },
				]),
			),
			'jnsp et vide ne sont pas des réussites',
		).toEqual({ justes: 0, total: 3 });
		expect(
			score(
				resultatAvec([
					{ statut: 'juste', saisie: 'a', attendue: 'a' },
					{ statut: 'juste', saisie: 'b', attendue: 'b' },
				]),
			),
		).toEqual({ justes: 2, total: 2 });
	});
});

/* ---------- Liens ---------- */

describe('liens : #envoi/<code> et #resultat/<code>', () => {
	const CODE = 'AUWq3-_x9Zk0';

	it('fragmentLien produit « #envoi/ » ou « #resultat/ » suivi du code', () => {
		expect(fragmentLien('envoi', CODE)).toBe(`#envoi/${CODE}`);
		expect(fragmentLien('resultat', CODE)).toBe(`#resultat/${CODE}`);
	});

	it.each(['envoi', 'resultat'] as const)(
		'lireFragment relit ce que fragmentLien produit (%s)',
		(type) => {
			expect(lireFragment(fragmentLien(type, CODE)), 'aller-retour du fragment').toEqual({
				type,
				code: CODE,
			});
		},
	);

	it.each([
		['une route de leçon', '#lecon-math-tables-addition'],
		['une route encadrant', '#encadrant/suivi'],
		['un fragment vide', ''],
		['un « # » seul', '#'],
		['« #envoi » sans code', '#envoi'],
		['« #envoi/ » au code vide', '#envoi/'],
		['« #resultat/ » au code vide', '#resultat/'],
		['un préfixe voisin « #envois/ »', '#envois/abc'],
		['un préfixe voisin « #resultats/ »', '#resultats/abc'],
		['« #envoi » collé au code', '#envoiabc'],
	])('lireFragment rend null pour %s', (_libelle, hash) => {
		expect(lireFragment(hash), `« ${hash} » n’est pas un lien partagé`).toBeNull();
	});

	it('garde le code tel quel, même hors base64url : c’est au décodage de le juger', () => {
		expect(lireFragment('#envoi/abc$%25!é')).toEqual({ type: 'envoi', code: 'abc$%25!é' });
		expect(lireFragment('#resultat/=+/')).toEqual({ type: 'resultat', code: '=+/' });
	});
});

/* ---------- Identifiant aléatoire ---------- */

describe('nouvelIdentifiant : 12 caractères base64url, aléatoires', () => {
	const BASE64URL_12 = /^[A-Za-z0-9_-]{12}$/;

	it('1000 appels : 1000 identifiants de 12 caractères [A-Za-z0-9_-], tous distincts', () => {
		const ids = Array.from({ length: 1000 }, () => nouvelIdentifiant());
		for (const id of ids)
			expect(id, `« ${id} » n’est pas du base64url de 12 caractères`).toMatch(BASE64URL_12);
		expect(new Set(ids).size, 'aucune collision sur 1000 tirages (72 bits)').toBe(1000);
	});

	it('chaque position varie : pas de remplissage constant qui réduirait l’aléa', () => {
		const ids = Array.from({ length: 1000 }, () => nouvelIdentifiant());
		for (let position = 0; position < 12; position++) {
			const valeurs = new Set(ids.map((id) => id[position]));
			// 1000 tirages uniformes sur 64 symboles en couvrent ~64 ; 40 laisse une marge énorme.
			expect(
				valeurs.size,
				`position ${position} : trop peu de valeurs distinctes`,
			).toBeGreaterThanOrEqual(40);
		}
	});

	it('ne dérive ni de l’horloge ni de Math.random : distincts même s’ils sont figés', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		vi.spyOn(Date, 'now').mockReturnValue(DATE_FIN);
		const ids = Array.from({ length: 100 }, () => nouvelIdentifiant());
		expect(new Set(ids).size, 'un identifiant prévisible permettrait de deviner un résultat').toBe(
			100,
		);
	});
});
