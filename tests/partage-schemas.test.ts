/* ============================================================
   Séance partagée par lien (#734) — schémas de décodage d'un lien HOSTILE.

   Traduit les critères d'acceptation de l'issue, écrits AVANT l'implémentation :
   - critère 39 : liste blanche au décodage (mot de dictée, prénom ou pseudo,
     libellé) ; tout écart fait refuser le lien ;
   - critère 40 : reconstruction champ par champ (clé `__proto__`, clé inconnue,
     paramètre de figure non fini ou absurde, mauvais type), objets acceptés de
     prototype `Object.prototype` ;
   - critère 31 : un résultat ne porte aucune donnée de profil hors du pseudo saisi ;
   - critère 30 (partie données) : un texte forgé dans un énoncé est CONSERVÉ tel
     quel au décodage ; c'est l'affichage qui l'échappe (couvert en e2e).

   Deux invariants de cohérence ajoutés au schéma en cours d'implémentation :
   - une grille de quadrillage (`quadrillage`, et chaque grille d'un
     `quadrillagePaire`) ne porte aucune case hors d'elle-même ;
   - un exercice `tuiles` porte chaque lettre du mot, autant de fois qu'il le
     faut (des lettres EN PLUS restent admises : un distracteur futur ne doit
     pas casser un lien déjà émis).

   Deux comportements ajoutés après relecture qualité :
   - l'ÉCRITURE est aussi stricte que la lecture : `encoderEnvoi` /
     `encoderResultat` rejettent une valeur hors schéma au lieu d'émettre un lien
     que le destinataire refuserait ; chaque cas a son témoin corrigé, qui
     s'encode et se relit à l'identique ;
   - le niveau d'un envoi est l'un des niveaux de `LEVEL_ORDER`, rien d'autre.

   Les liens hostiles sont forgés en TEXTE JSON via `encoderTexte` : une clé
   `__proto__` ou un nombre `1e999` ne survivent pas à un `JSON.stringify`.
   Tout refus attendu ici est un refus de schéma (raison `schema`) : le JSON est
   lisible, c'est son contenu qui est hors schéma.

   Chaque refus a son pendant accepté (envoi, dictée, résultat, horloge,
   quadrillage, fraction valides) : sans lui, un décodeur qui refuse tout
   passerait la moitié de ce fichier.
   ============================================================ */
import { describe, expect, it } from 'vitest';
import { encoderTexte, type Decodage } from '../src/core/partage/codec';
import {
	decoderEnvoi,
	encoderEnvoi,
	type BlocEnvoi,
	type Envoi,
	type MotDictee,
} from '../src/core/partage/envoi';
import {
	decoderResultat,
	encoderResultat,
	type ReponseItem,
	type Resultat,
} from '../src/core/partage/resultat';
import { RefusSchema } from '../src/core/partage/schema';
import { LEVEL_ORDER } from '../src/core/levels';
import type { Exercise } from '../src/core/exercise';

type Objet = Record<string, unknown>;

const ID_ENVOI = 'AbCdEfGhIj_-';
const ID_RESULTAT = 'ZyXwVuTsRq-_';

/** Fragment hostile classique : une clé `__proto__` propre, écrite dans le texte JSON. */
const PROTO = '"__proto__":{"pollue":true}';

const EX_TEXTE: Objet = { type: 'text', question: '3 + 4 = @', answer: '7' };

const RAPPEL: Objet = { id: ID_ENVOI, libelle: 'Dictee 3', niveau: 'ce2' };
const REPONSE: Objet = {
	lecon: 'math-tables-addition',
	enonce: '3 + 4 = …',
	saisie: '8',
	attendue: '7',
	statut: 'faux',
};

const j = (v: unknown): string => JSON.stringify(v);

/** Insère un fragment JSON BRUT (« "cle":valeur ») en tête d'un objet déjà sérialisé. */
function avecFragment(objetJson: string, fragment: string): string {
	if (!objetJson.startsWith('{'))
		throw new Error(`avecFragment : objet JSON attendu, reçu ${objetJson}`);
	return objetJson === '{}' ? `{${fragment}}` : `{${fragment},${objetJson.slice(1)}`;
}

/** Remplace un marqueur `"§…§"` par du JSON brut (sans motifs `$` de `replace`). */
function greffer(json: string, marqueur: string, brut: string): string {
	return json.replace(`"${marqueur}"`, () => brut);
}

interface OptionsEnvoi {
	libelle?: string;
	/** Exercices en JSON BRUT. Défaut : un `text` « 3 + 4 = @ ». */
	exercices?: string[];
	/** Champs ajoutés (ou remplacés) à la racine / dans le bloc. */
	racine?: Objet;
	bloc?: Objet;
	/** Fragments JSON BRUTS insérés en tête de la racine / du bloc. */
	brutRacine?: string;
	brutBloc?: string;
}

/** Envoi `lecon` (un seul bloc), sérialisé en texte JSON. */
function jsonEnvoiLecon(o: OptionsEnvoi = {}): string {
	const blocObjet = j({ lecon: 'math-tables-addition', exercices: ['§EX§'], ...o.bloc });
	const bloc = greffer(blocObjet, '§EX§', (o.exercices ?? [j(EX_TEXTE)]).join(','));
	const racineObjet = j({
		id: ID_ENVOI,
		libelle: o.libelle ?? 'Dictee 3',
		nature: 'lecon',
		niveau: 'ce2',
		blocs: ['§BLOC§'],
		...o.racine,
	});
	const racine = greffer(racineObjet, '§BLOC§', o.brutBloc ? avecFragment(bloc, o.brutBloc) : bloc);
	return o.brutRacine ? avecFragment(racine, o.brutRacine) : racine;
}

/** Exercice `text` portant une figure, sous forme de RECETTE `{k:'figure', spec}`. */
function jsonExerciceFigure(specJson: string, brutRecette?: string): string {
	const recette = `{"k":"figure","spec":${specJson}}`;
	return greffer(
		j({ type: 'text', question: 'Observe la figure. @', answer: '3 h 15', figure: '§FIG§' }),
		'§FIG§',
		brutRecette ? avecFragment(recette, brutRecette) : recette,
	);
}

/** Envoi `dictee` à partir de mots déjà sérialisés (JSON BRUT). */
function jsonDicteeBrute(motsJson: string[], extra: Objet = {}): string {
	return greffer(
		j({ id: ID_ENVOI, libelle: 'Dictee 3', nature: 'dictee', mots: ['§MOTS§'], ...extra }),
		'§MOTS§',
		motsJson.join(','),
	);
}

const jsonDictee = (mots: string[], extra: Objet = {}): string =>
	jsonDicteeBrute(
		mots.map((mot) => j({ mot })),
		extra,
	);

interface OptionsResultat {
	pseudo?: string;
	libelleRappel?: string;
	racine?: Objet;
	rappel?: Objet;
	reponse?: Objet;
	brutRacine?: string;
	brutReponse?: string;
}

/** Résultat valide (une réponse fausse), sérialisé en texte JSON. */
function jsonResultat(o: OptionsResultat = {}): string {
	const reponse = j({ ...REPONSE, ...o.reponse });
	const racine = greffer(
		j({
			id: ID_RESULTAT,
			envoi: { ...RAPPEL, libelle: o.libelleRappel ?? RAPPEL.libelle, ...o.rappel },
			pseudo: o.pseudo ?? 'Léa',
			date: 1790000000000,
			reponses: ['§REPONSE§'],
			...o.racine,
		}),
		'§REPONSE§',
		o.brutReponse ? avecFragment(reponse, o.brutReponse) : reponse,
	);
	return o.brutRacine ? avecFragment(racine, o.brutRacine) : racine;
}

async function ouvrirEnvoi(json: string): Promise<Decodage<Envoi>> {
	return decoderEnvoi(await encoderTexte('envoi', json));
}

async function ouvrirResultat(json: string): Promise<Decodage<Resultat>> {
	return decoderResultat(await encoderTexte('resultat', json));
}

const verdict = <T>(d: Decodage<T>): string => (d.ok ? 'accepté' : `refusé (${d.raison})`);

/** Exige l'acceptation et rend la valeur décodée ; le message dit la raison du refus. */
function valeurAcceptee<T>(d: Decodage<T>, cas: string): T {
	expect(verdict(d), cas).toBe('accepté');
	if (!d.ok) throw new Error('inatteignable');
	return d.valeur;
}

function attendreRefusSchema<T>(d: Decodage<T>, cas: string): void {
	expect(verdict(d), cas).toBe('refusé (schema)');
}

function blocsDe(envoi: Envoi): BlocEnvoi[] {
	if (envoi.nature === 'dictee') throw new Error(`envoi de nature « dictee », blocs attendus`);
	return envoi.blocs;
}

function motsDe(envoi: Envoi): MotDictee[] {
	if (envoi.nature !== 'dictee')
		throw new Error(`envoi de nature « ${envoi.nature} », mots attendus`);
	return envoi.mots;
}

/** Mots tous distincts, faits de lettres seules (aa-ou, ab-ou… sans tiret). */
function motNumero(i: number): string {
	const lettres = 'abcdefghijklmnopqrstuvwxyz';
	return lettres.charAt(Math.floor(i / 26) % 26) + lettres.charAt(i % 26) + 'ou';
}

const PRENOMS_ACCEPTES = ['Léa', 'Lucas 2', 'Marie-Ève', 'CM1 groupe 3'];
const PRENOMS_REFUSES: { cas: string; valeur: string }[] = [
	{ cas: 'balise <img onerror>', valeur: '<img src=x onerror=alert(1)>' },
	{ cas: 'point d’exclamation (« Léa! »)', valeur: 'Léa!' },
	{ cas: 'guillemet droit (« a"b »)', valeur: 'a"b' },
	{ cas: 'chaîne vide', valeur: '' },
	{ cas: '300 caractères', valeur: 'a'.repeat(300) },
];

describe('#734 — socle : des liens valides sont acceptés', () => {
	it('un envoi « lecon » valide est accepté et rendu à l’identique', async () => {
		const envoi = valeurAcceptee(await ouvrirEnvoi(jsonEnvoiLecon()), 'envoi lecon valide');
		expect(envoi, 'envoi décodé ≠ envoi émis').toEqual({
			id: ID_ENVOI,
			libelle: 'Dictee 3',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [{ lecon: 'math-tables-addition', exercices: [EX_TEXTE] }],
		});
	});

	it('un résultat valide est accepté et rendu à l’identique', async () => {
		const resultat = valeurAcceptee(await ouvrirResultat(jsonResultat()), 'résultat valide');
		expect(resultat, 'résultat décodé ≠ résultat émis').toEqual({
			id: ID_RESULTAT,
			envoi: RAPPEL,
			pseudo: 'Léa',
			date: 1790000000000,
			reponses: [REPONSE],
		});
	});
});

describe('#734 critère 39 — liste blanche au décodage', () => {
	describe('mot de dictée : lettres (accents compris), apostrophe, trait d’union, espace', () => {
		it.each(['chat', "l'école", 'arc-en-ciel', 'tout à coup', 'œuf', 'Noël'])(
			'accepte le mot « %s » et le conserve tel quel',
			async (mot) => {
				const envoi = valeurAcceptee(await ouvrirEnvoi(jsonDictee([mot])), `mot « ${mot} »`);
				expect(motsDe(envoi)[0]?.mot, `le mot « ${mot} » a été retouché au décodage`).toBe(mot);
			},
		);

		it('accepte une dictée sans niveau (liste personnalisée) qui réunit ces six mots', async () => {
			const mots = ['chat', "l'école", 'arc-en-ciel', 'tout à coup', 'œuf', 'Noël'];
			const envoi = valeurAcceptee(
				await ouvrirEnvoi(jsonDictee(mots)),
				'dictée de six mots valides',
			);
			expect(
				motsDe(envoi).map((m) => m.mot),
				'mots décodés ≠ mots émis',
			).toEqual(mots);
		});

		it('accepte une dictée avec niveau et « commeDans »', async () => {
			const json = jsonDicteeBrute([j({ mot: 'chat', commeDans: 'le chat dort' })], {
				niveau: 'ce2',
			});
			const envoi = valeurAcceptee(await ouvrirEnvoi(json), 'dictée ce2 avec commeDans');
			expect(motsDe(envoi), 'mot décodé ≠ mot émis').toEqual([
				{ mot: 'chat', commeDans: 'le chat dort' },
			]);
		});

		it.each([
			{ cas: 'chevron (« a<b »)', mot: 'a<b' },
			{ cas: 'chiffre (« chat2 »)', mot: 'chat2' },
			{ cas: 'point-virgule (« chat; »)', mot: 'chat;' },
			{ cas: 'mot vide', mot: '' },
			{ cas: 'mot fait d’espaces', mot: '   ' },
			{ cas: 'mot de 200 lettres', mot: 'a'.repeat(200) },
		])('refuse le lien dont un mot porte : $cas', async ({ cas, mot }) => {
			// Le mot fautif est glissé APRÈS un mot valide : le refus ne doit pas dépendre
			// de sa position.
			attendreRefusSchema(await ouvrirEnvoi(jsonDictee(['chat', mot])), `mot de dictée : ${cas}`);
		});

		it('refuse une dictée de 500 mots, pourtant tous valides et distincts', async () => {
			const mots = Array.from({ length: 500 }, (_, i) => motNumero(i));
			expect(new Set(mots).size, 'générateur de mots du test : doublons').toBe(500);
			attendreRefusSchema(await ouvrirEnvoi(jsonDictee(mots)), 'dictée de 500 mots');
		});
	});

	describe('prénom ou pseudo (résultat) : en plus, les chiffres', () => {
		it.each(PRENOMS_ACCEPTES)(
			'accepte le pseudo « %s » et le conserve tel quel',
			async (pseudo) => {
				const resultat = valeurAcceptee(
					await ouvrirResultat(jsonResultat({ pseudo })),
					`pseudo « ${pseudo} »`,
				);
				expect(resultat.pseudo, `le pseudo « ${pseudo} » a été retouché au décodage`).toBe(pseudo);
			},
		);

		it.each(PRENOMS_REFUSES)('refuse le pseudo : $cas', async ({ cas, valeur }) => {
			attendreRefusSchema(
				await ouvrirResultat(jsonResultat({ pseudo: valeur })),
				`pseudo : ${cas}`,
			);
		});
	});

	describe('libellé (envoi) : en plus, les chiffres', () => {
		it.each(PRENOMS_ACCEPTES)(
			'accepte le libellé « %s » et le conserve tel quel',
			async (libelle) => {
				const envoi = valeurAcceptee(
					await ouvrirEnvoi(jsonEnvoiLecon({ libelle })),
					`libellé « ${libelle} »`,
				);
				expect(envoi.libelle, `le libellé « ${libelle} » a été retouché au décodage`).toBe(libelle);
			},
		);

		it.each(PRENOMS_REFUSES)('refuse le libellé : $cas', async ({ cas, valeur }) => {
			attendreRefusSchema(
				await ouvrirEnvoi(jsonEnvoiLecon({ libelle: valeur })),
				`libellé : ${cas}`,
			);
		});

		it('refuse un libellé forgé rappelé dans un RÉSULTAT (le lien de résultat se forge aussi)', async () => {
			attendreRefusSchema(
				await ouvrirResultat(jsonResultat({ libelleRappel: '<img src=x onerror=alert(1)>' })),
				'libellé forgé dans le rappel d’envoi d’un résultat',
			);
		});
	});
});

describe('#734 critère 40 — reconstruction champ par champ', () => {
	const HORLOGE_3H15 = j({ kind: 'horloge', heures: 3, minutes: 15 });

	/** Liens portant une clé `__proto__` propre, à chaque étage du schéma. */
	const PROTO_PAR_ETAGE: { cas: string; ouvrir: () => Promise<Decodage<unknown>> }[] = [
		{
			cas: 'à la racine d’un envoi',
			ouvrir: () => ouvrirEnvoi(jsonEnvoiLecon({ brutRacine: PROTO })),
		},
		{ cas: 'dans un bloc', ouvrir: () => ouvrirEnvoi(jsonEnvoiLecon({ brutBloc: PROTO })) },
		{
			cas: 'dans un exercice',
			ouvrir: () => ouvrirEnvoi(jsonEnvoiLecon({ exercices: [avecFragment(j(EX_TEXTE), PROTO)] })),
		},
		{
			cas: 'dans une recette de figure',
			ouvrir: () =>
				ouvrirEnvoi(jsonEnvoiLecon({ exercices: [jsonExerciceFigure(HORLOGE_3H15, PROTO)] })),
		},
		{
			cas: 'dans une spec de figure',
			ouvrir: () =>
				ouvrirEnvoi(
					jsonEnvoiLecon({ exercices: [jsonExerciceFigure(avecFragment(HORLOGE_3H15, PROTO))] }),
				),
		},
		{
			cas: 'dans un mot de dictée',
			ouvrir: () => ouvrirEnvoi(jsonDicteeBrute([avecFragment(j({ mot: 'chat' }), PROTO)])),
		},
		{
			cas: 'à la racine d’un résultat',
			ouvrir: () => ouvrirResultat(jsonResultat({ brutRacine: PROTO })),
		},
		{
			cas: 'dans une réponse d’un résultat',
			ouvrir: () => ouvrirResultat(jsonResultat({ brutReponse: PROTO })),
		},
	];

	describe('clé « __proto__ » écrite dans le texte JSON', () => {
		it.each(PROTO_PAR_ETAGE)('refuse le lien : __proto__ $cas', async ({ cas, ouvrir }) => {
			attendreRefusSchema(await ouvrir(), `__proto__ ${cas}`);
		});

		it('aucun lien hostile ne pollue Object.prototype (__proto__ et constructor.prototype)', async () => {
			const constructeur = '"constructor":{"prototype":{"pollue":true}}';
			const ouvertures = [
				...PROTO_PAR_ETAGE.map((p) => p.ouvrir),
				() => ouvrirEnvoi(jsonEnvoiLecon({ brutRacine: constructeur })),
				() => ouvrirEnvoi(jsonEnvoiLecon({ exercices: [avecFragment(j(EX_TEXTE), constructeur)] })),
				() => ouvrirResultat(jsonResultat({ brutReponse: constructeur })),
			];
			try {
				for (const ouvrir of ouvertures) await ouvrir();
				expect('pollue' in {}, 'Object.prototype a reçu « pollue » d’un lien décodé').toBe(false);
			} finally {
				// Hygiène : si la pollution a eu lieu, ne pas la laisser fuir vers les autres tests.
				Reflect.deleteProperty(Object.prototype, 'pollue');
			}
		});
	});

	describe('clé inconnue : refusée, jamais ignorée en silence', () => {
		// `constructor`, `toString`, `hasOwnProperty` piègent un contrôle « cle in schema »
		// fait sur un objet ordinaire : elles y sont présentes par héritage.
		it.each([
			{ cas: '"extra" à la racine', json: () => jsonEnvoiLecon({ racine: { extra: 1 } }) },
			{ cas: '"extra" dans un bloc', json: () => jsonEnvoiLecon({ bloc: { extra: 1 } }) },
			{
				cas: '"extra" dans un exercice',
				json: () => jsonEnvoiLecon({ exercices: [j({ ...EX_TEXTE, extra: 1 })] }),
			},
			{
				cas: '"extra" dans une spec de figure',
				json: () =>
					jsonEnvoiLecon({
						exercices: [
							jsonExerciceFigure(j({ kind: 'horloge', heures: 3, minutes: 15, extra: 1 })),
						],
					}),
			},
			{
				cas: '"extra" dans une recette de figure',
				json: () => jsonEnvoiLecon({ exercices: [jsonExerciceFigure(HORLOGE_3H15, '"extra":1')] }),
			},
			{
				cas: '"extra" dans un mot de dictée',
				json: () => jsonDicteeBrute([j({ mot: 'chat', extra: 1 })]),
			},
			{ cas: '"toString" à la racine', json: () => jsonEnvoiLecon({ racine: { toString: 1 } }) },
			{
				cas: '"hasOwnProperty" dans un bloc',
				json: () => jsonEnvoiLecon({ bloc: { hasOwnProperty: 1 } }),
			},
			{
				cas: '"constructor" dans un exercice',
				json: () =>
					jsonEnvoiLecon({
						exercices: [avecFragment(j(EX_TEXTE), '"constructor":{"prototype":{"pollue":true}}')],
					}),
			},
		])('refuse le lien : $cas', async ({ cas, json }) => {
			attendreRefusSchema(await ouvrirEnvoi(json()), `clé inconnue : ${cas}`);
		});
	});

	describe('paramètres de figure : nombres finis et plausibles', () => {
		it('accepte une horloge plausible (3 h 15) et rebâtit sa figure', async () => {
			const envoi = valeurAcceptee(
				await ouvrirEnvoi(jsonEnvoiLecon({ exercices: [jsonExerciceFigure(HORLOGE_3H15)] })),
				'horloge 3 h 15',
			);
			const ex = blocsDe(envoi)[0]?.exercices[0];
			expect(ex?.type, 'exercice décodé').toBe('text');
			if (ex?.type !== 'text') return;
			expect(ex.answer, 'réponse retouchée').toBe('3 h 15');
			expect(ex.figure, 'la recette de figure n’a pas été rebâtie').toBeDefined();
		});

		it('accepte un quadrillage plausible (8 × 6, une case)', async () => {
			const spec = j({ kind: 'quadrillage', cols: 8, rows: 6, cells: [[1, 1]] });
			valeurAcceptee(
				await ouvrirEnvoi(jsonEnvoiLecon({ exercices: [jsonExerciceFigure(spec)] })),
				'quadrillage 8 × 6',
			);
		});

		it.each([
			{ cas: 'heures en chaîne "1e999"', spec: '{"kind":"horloge","heures":"1e999","minutes":15}' },
			{
				cas: 'heures = 1e999 écrit dans le JSON (Infinity)',
				spec: '{"kind":"horloge","heures":1e999,"minutes":15}',
			},
			{
				cas: 'minutes = -1e999 écrit dans le JSON (-Infinity)',
				spec: '{"kind":"horloge","heures":3,"minutes":-1e999}',
			},
			{ cas: 'minutes = 1000000', spec: '{"kind":"horloge","heures":3,"minutes":1000000}' },
			{ cas: 'heures = 3.5 (non entier)', spec: '{"kind":"horloge","heures":3.5,"minutes":15}' },
			{
				cas: 'quadrillage cols = 10000000',
				spec: '{"kind":"quadrillage","cols":10000000,"rows":6,"cells":[[1,1]]}',
			},
		])('refuse une figure : $cas', async ({ cas, spec }) => {
			attendreRefusSchema(
				await ouvrirEnvoi(jsonEnvoiLecon({ exercices: [jsonExerciceFigure(spec)] })),
				`figure : ${cas}`,
			);
		});

		describe('recette « fraction » d’un choix de QCM (choicesView[i].html)', () => {
			const qcm = (fractionUn: string): string =>
				greffer(
					j({
						type: 'qcm',
						question: 'Quelle fraction est coloriée ? @',
						answer: '1/2',
						choices: ['1/2', '1/3'],
						choicesView: [
							{ html: '§F1§', label: 'un demi' },
							{ html: { k: 'fraction', num: 1, den: 3 }, label: 'un tiers' },
						],
					}),
					'§F1§',
					fractionUn,
				);

			it('accepte une fraction 1/2 en recette', async () => {
				valeurAcceptee(
					await ouvrirEnvoi(
						jsonEnvoiLecon({ exercices: [qcm('{"k":"fraction","num":1,"den":2}')] }),
					),
					'QCM à choix fractionnaires',
				);
			});

			it('refuse une fraction dont le numérateur est 1e999 (Infinity)', async () => {
				attendreRefusSchema(
					await ouvrirEnvoi(
						jsonEnvoiLecon({ exercices: [qcm('{"k":"fraction","num":1e999,"den":2}')] }),
					),
					'recette fraction num = 1e999',
				);
			});
		});

		describe('grille de quadrillage : aucune case hors de SA propre grille', () => {
			type Case = [number, number];
			const grille = (cols: number, rows: number, cells: Case[]): Objet => ({ cols, rows, cells });
			const quad = (cols: number, rows: number, cells: Case[]): string =>
				j({ kind: 'quadrillage', ...grille(cols, rows, cells) });
			const paire = (a: Objet, b: Objet): string => j({ kind: 'quadrillagePaire', a, b });
			const ouvrirFigure = (spec: string): Promise<Decodage<Envoi>> =>
				ouvrirEnvoi(jsonEnvoiLecon({ exercices: [jsonExerciceFigure(spec)] }));

			// Grilles CARRÉES dans les cas de bord : l'ordre [colonne, ligne] ou
			// [ligne, colonne] d'une case n'y change rien, le test n'a pas à le présumer.
			it.each([
				{
					cas: 'quadrillage 3 × 3, première et dernière case',
					spec: quad(3, 3, [
						[0, 0],
						[2, 2],
					]),
				},
				{
					cas: 'paire 1 × 1 / 1 × 1, case [0,0] partout',
					spec: paire(grille(1, 1, [[0, 0]]), grille(1, 1, [[0, 0]])),
				},
				{
					cas: 'paire 2 × 2 / 5 × 5, [4,4] dans b (hors des bornes de a, mais dans les siennes)',
					spec: paire(grille(2, 2, [[1, 1]]), grille(5, 5, [[4, 4]])),
				},
			])('accepte : $cas', async ({ cas, spec }) => {
				valeurAcceptee(await ouvrirFigure(spec), `grille : ${cas}`);
			});

			it.each([
				{ cas: 'quadrillage 3 × 2, case [3,0]', spec: quad(3, 2, [[3, 0]]) },
				{
					cas: 'quadrillage 3 × 3, case [3,0] (un cran de trop)',
					spec: quad(3, 3, [
						[0, 0],
						[3, 0],
					]),
				},
				{
					cas: 'quadrillage 3 × 3, case [0,3] (un cran de trop)',
					spec: quad(3, 3, [
						[0, 0],
						[0, 3],
					]),
				},
				{ cas: 'quadrillage 3 × 3, case [-1,0]', spec: quad(3, 3, [[-1, 0]]) },
				{
					cas: 'paire : a 1 × 1 avec [29,29]',
					spec: paire(
						grille(1, 1, [
							[0, 0],
							[29, 29],
						]),
						grille(1, 1, [[0, 0]]),
					),
				},
				{
					cas: 'paire : b 1 × 1 avec [29,29]',
					spec: paire(
						grille(1, 1, [[0, 0]]),
						grille(1, 1, [
							[0, 0],
							[29, 29],
						]),
					),
				},
				{
					cas: 'paire : a 3 × 3 avec [3,0] (un cran de trop)',
					spec: paire(grille(3, 3, [[3, 0]]), grille(3, 3, [[0, 0]])),
				},
				// Chaque grille se juge sur SES bornes, pas sur celles de l'autre.
				{
					cas: 'paire : [3,3] dans b (2 × 2), pourtant dans les bornes de a (5 × 5)',
					spec: paire(grille(5, 5, [[0, 0]]), grille(2, 2, [[3, 3]])),
				},
				{
					cas: 'paire : [3,3] dans a (2 × 2), pourtant dans les bornes de b (5 × 5)',
					spec: paire(grille(2, 2, [[3, 3]]), grille(5, 5, [[0, 0]])),
				},
			])('refuse : $cas', async ({ cas, spec }) => {
				attendreRefusSchema(await ouvrirFigure(spec), `grille : ${cas}`);
			});
		});
	});

	describe('nombres non finis hors figures (même règle, au-delà de la lettre du critère)', () => {
		it('refuse un calcul posé dont un opérande est 1e999', async () => {
			attendreRefusSchema(
				await ouvrirEnvoi(
					jsonEnvoiLecon({ exercices: ['{"type":"posed","op":"+","a":1e999,"b":2}'] }),
				),
				'posed a = 1e999',
			);
		});

		it('refuse un résultat daté de 1e999', async () => {
			const json = jsonResultat().replace('"date":1790000000000', () => '"date":1e999');
			expect(json, 'remplacement de la date dans le test').toContain('"date":1e999');
			attendreRefusSchema(await ouvrirResultat(json), 'résultat date = 1e999');
		});
	});

	describe('mauvais type', () => {
		it('refuse un exercice « text » dont la réponse est un nombre', async () => {
			attendreRefusSchema(
				await ouvrirEnvoi(jsonEnvoiLecon({ exercices: [j({ ...EX_TEXTE, answer: 7 })] })),
				'answer numérique dans un text',
			);
		});

		it('refuse une réponse de résultat au statut hors liste', async () => {
			attendreRefusSchema(
				await ouvrirResultat(jsonResultat({ reponse: { statut: 'presque' } })),
				'statut « presque »',
			);
		});
	});

	describe('un objet accepté a pour prototype Object.prototype', () => {
		it('envoi : racine, bloc et exercice', async () => {
			const envoi = valeurAcceptee(await ouvrirEnvoi(jsonEnvoiLecon()), 'envoi valide');
			const bloc = blocsDe(envoi)[0];
			expect(Object.getPrototypeOf(envoi), 'prototype de la racine').toBe(Object.prototype);
			expect(Object.getPrototypeOf(bloc), 'prototype du bloc').toBe(Object.prototype);
			expect(Object.getPrototypeOf(bloc?.exercices[0]), 'prototype de l’exercice').toBe(
				Object.prototype,
			);
		});

		it('dictée : racine et mot', async () => {
			const envoi = valeurAcceptee(await ouvrirEnvoi(jsonDictee(['chat'])), 'dictée valide');
			expect(Object.getPrototypeOf(envoi), 'prototype de la racine').toBe(Object.prototype);
			expect(Object.getPrototypeOf(motsDe(envoi)[0]), 'prototype du mot').toBe(Object.prototype);
		});

		it('résultat : racine, rappel d’envoi et réponse', async () => {
			const resultat = valeurAcceptee(await ouvrirResultat(jsonResultat()), 'résultat valide');
			expect(Object.getPrototypeOf(resultat), 'prototype de la racine').toBe(Object.prototype);
			expect(Object.getPrototypeOf(resultat.envoi), 'prototype du rappel').toBe(Object.prototype);
			expect(Object.getPrototypeOf(resultat.reponses[0]), 'prototype de la réponse').toBe(
				Object.prototype,
			);
		});
	});
});

describe('#734 — exercice « tuiles » : les lettres fournies permettent d’écrire le mot', () => {
	const ouvrirTuiles = (answer: string, lettres: string[]): Promise<Decodage<Envoi>> =>
		ouvrirEnvoi(jsonEnvoiLecon({ exercices: [j({ type: 'tuiles', answer, lettres })] }));

	it.each([
		{ cas: 'permutation exacte de « chat »', answer: 'chat', lettres: ['t', 'a', 'h', 'c'] },
		{
			cas: '« chat » avec une lettre en plus (distracteur)',
			answer: 'chat',
			lettres: ['c', 'h', 'a', 't', 'x'],
		},
		{
			cas: '« elle » avec ses deux l et ses deux e',
			answer: 'elle',
			lettres: ['l', 'e', 'l', 'e'],
		},
		{ cas: '« elle » avec un l en plus', answer: 'elle', lettres: ['e', 'l', 'l', 'e', 'l'] },
		{ cas: '« été » avec ses deux é', answer: 'été', lettres: ['é', 't', 'é'] },
	])('accepte : $cas, et le rend tel quel', async ({ cas, answer, lettres }) => {
		const envoi = valeurAcceptee(await ouvrirTuiles(answer, lettres), `tuiles : ${cas}`);
		expect(blocsDe(envoi)[0]?.exercices[0], 'exercice tuiles retouché au décodage').toEqual({
			type: 'tuiles',
			answer,
			lettres,
		});
	});

	it.each([
		{ cas: '« chat » sans son t', answer: 'chat', lettres: ['c', 'h', 'a'] },
		{ cas: '« elle » avec un seul l', answer: 'elle', lettres: ['e', 'l', 'e'] },
		{ cas: '« elle » avec un seul e', answer: 'elle', lettres: ['e', 'l', 'l'] },
		// Autant de tuiles que de lettres, mais pas les bonnes : un contrôle de
		// longueur seul l'accepterait.
		{
			cas: '« chat » : quatre tuiles, un a à la place du t',
			answer: 'chat',
			lettres: ['c', 'h', 'a', 'a'],
		},
		// L'accent fait la lettre : une tuile « e » n'écrit pas « é ».
		{ cas: '« été » avec des e sans accent', answer: 'été', lettres: ['e', 't', 'e'] },
	])('refuse : $cas', async ({ cas, answer, lettres }) => {
		attendreRefusSchema(await ouvrirTuiles(answer, lettres), `tuiles : ${cas}`);
	});
});

/* ---- Valeurs construites en TypeScript, pour l'écriture (`encoderEnvoi` / `encoderResultat`). */

/** Seuls points de cast du fichier : une valeur volontairement hors schéma, que le
 *  type interdit justement (leçon à deux blocs, statut ou niveau inconnus). */
const forcerEnvoi = (v: unknown): Envoi => v as Envoi;
const forcerResultat = (v: unknown): Resultat => v as Resultat;

const exerciceNumero = (i: number): Exercise => ({
	type: 'text',
	question: `${i} + 1 = @`,
	answer: String(i + 1),
});

function blocDe(lecon: string, n: number, depart = 0): BlocEnvoi {
	return { lecon, exercices: Array.from({ length: n }, (_, i) => exerciceNumero(depart + i)) };
}

function envoiLeconTs(o: { libelle?: string; exercices?: number } = {}): Envoi {
	return {
		id: ID_ENVOI,
		libelle: o.libelle ?? 'Dictee 3',
		nature: 'lecon',
		niveau: 'ce2',
		blocs: [blocDe('math-tables-addition', o.exercices ?? 1)],
	};
}

/** Bilan de `total` items, répartis en blocs de 40 au plus (le plafond d'un bloc). */
function bilanTs(total: number): Envoi {
	const blocs: BlocEnvoi[] = [];
	for (let fait = 0; fait < total;) {
		const n = Math.min(40, total - fait);
		blocs.push(blocDe(`math-bloc-${blocs.length}`, n, fait));
		fait += n;
	}
	return {
		id: ID_ENVOI,
		libelle: 'Bilan',
		nature: 'bilan',
		variante: 'complet',
		niveau: 'ce2',
		blocs,
	};
}

const dicteeTs = (mot: string): Envoi => ({
	id: ID_ENVOI,
	libelle: 'Dictee 3',
	nature: 'dictee',
	mots: [{ mot }],
});

const REPONSE_TS: ReponseItem = {
	lecon: 'math-tables-addition',
	enonce: '3 + 4 = …',
	saisie: '8',
	attendue: '7',
	statut: 'faux',
};

const resultatTs = (pseudo = 'Léa'): Resultat => ({
	id: ID_RESULTAT,
	envoi: { id: ID_ENVOI, libelle: 'Dictee 3', niveau: 'ce2' },
	pseudo,
	date: 1790000000000,
	reponses: [{ ...REPONSE_TS }],
});

describe('#734 — l’écriture est aussi stricte que la lecture', () => {
	const CAS_ENVOI: { cas: string; fautif: () => Envoi; corrige: () => Envoi }[] = [
		{
			cas: 'libellé « a<b » (témoin : « ab »)',
			fautif: () => envoiLeconTs({ libelle: 'a<b' }),
			corrige: () => envoiLeconTs({ libelle: 'ab' }),
		},
		{
			cas: 'libellé de 61 caractères (témoin : 60)',
			fautif: () => envoiLeconTs({ libelle: 'a'.repeat(61) }),
			corrige: () => envoiLeconTs({ libelle: 'a'.repeat(60) }),
		},
		{
			cas: 'bloc de 41 exercices (témoin : 40)',
			fautif: () => envoiLeconTs({ exercices: 41 }),
			corrige: () => envoiLeconTs({ exercices: 40 }),
		},
		{
			cas: 'bilan de 301 items sur 8 blocs (témoin : 300)',
			fautif: () => bilanTs(301),
			corrige: () => bilanTs(300),
		},
		{
			cas: 'leçon à deux blocs (témoin : un seul)',
			fautif: () =>
				forcerEnvoi({
					...envoiLeconTs(),
					blocs: [blocDe('math-tables-addition', 1), blocDe('math-tables-addition', 1, 1)],
				}),
			corrige: () => envoiLeconTs(),
		},
		{
			cas: 'dictée au mot « chat2 » (témoin : « chat »)',
			fautif: () => dicteeTs('chat2'),
			corrige: () => dicteeTs('chat'),
		},
	];

	const CAS_RESULTAT: { cas: string; fautif: () => Resultat; corrige: () => Resultat }[] = [
		{
			cas: 'pseudo « a<b » (témoin : « Léa »)',
			fautif: () => resultatTs('a<b'),
			corrige: () => resultatTs('Léa'),
		},
		{
			cas: 'statut « presque » (témoin : « faux »)',
			fautif: () =>
				forcerResultat({ ...resultatTs(), reponses: [{ ...REPONSE_TS, statut: 'presque' }] }),
			corrige: () => resultatTs(),
		},
	];

	it('le bilan fautif dépasse bien 300 items sans qu’aucun bloc dépasse 40 (garde du test)', () => {
		const bilan = bilanTs(301);
		if (bilan.nature !== 'bilan') throw new Error('bilan attendu');
		expect(bilan.blocs.reduce((s, b) => s + b.exercices.length, 0)).toBe(301);
		expect(Math.max(...bilan.blocs.map((b) => b.exercices.length))).toBeLessThanOrEqual(40);
	});

	it.each(CAS_ENVOI)('encoderEnvoi rejette : $cas', async ({ cas, fautif }) => {
		await expect(encoderEnvoi(fautif()), `envoi : ${cas}`).rejects.toBeInstanceOf(RefusSchema);
	});

	it.each(CAS_ENVOI)('témoin encodé puis relu à l’identique : $cas', async ({ cas, corrige }) => {
		const envoi = corrige();
		const relu = valeurAcceptee(
			await decoderEnvoi(await encoderEnvoi(envoi)),
			`envoi témoin : ${cas}`,
		);
		expect(relu, `envoi témoin relu ≠ émis : ${cas}`).toEqual(envoi);
	});

	it.each(CAS_RESULTAT)('encoderResultat rejette : $cas', async ({ cas, fautif }) => {
		await expect(encoderResultat(fautif()), `résultat : ${cas}`).rejects.toBeInstanceOf(
			RefusSchema,
		);
	});

	it.each(CAS_RESULTAT)(
		'témoin encodé puis relu à l’identique : $cas',
		async ({ cas, corrige }) => {
			const resultat = corrige();
			const relu = valeurAcceptee(
				await decoderResultat(await encoderResultat(resultat)),
				`résultat témoin : ${cas}`,
			);
			expect(relu, `résultat témoin relu ≠ émis : ${cas}`).toEqual(resultat);
		},
	);
});

describe('#734 — niveau d’un envoi : exactement les niveaux scolaires connus', () => {
	it('la liste des niveaux n’est pas vide (sinon le test suivant ne jouerait rien)', () => {
		expect(LEVEL_ORDER.length).toBeGreaterThan(0);
	});

	it.each(LEVEL_ORDER)(
		'accepte le niveau « %s », à la lecture comme à l’écriture',
		async (niveau) => {
			const lu = valeurAcceptee(
				await ouvrirEnvoi(jsonEnvoiLecon({ racine: { niveau } })),
				`niveau « ${niveau} » au décodage`,
			);
			expect(lu.niveau, 'niveau retouché au décodage').toBe(niveau);
			const envoi: Envoi = { ...envoiLeconTs(), niveau };
			await expect(encoderEnvoi(envoi), `niveau « ${niveau} » à l’écriture`).resolves.toEqual(
				expect.any(String),
			);
		},
	);

	it.each(['cm3', 'CE2', ''])(
		'refuse le niveau « %s », à la lecture comme à l’écriture',
		async (niveau) => {
			attendreRefusSchema(
				await ouvrirEnvoi(jsonEnvoiLecon({ racine: { niveau } })),
				`niveau « ${niveau} » au décodage`,
			);
			await expect(
				encoderEnvoi(forcerEnvoi({ ...envoiLeconTs(), niveau })),
				`niveau « ${niveau} » à l’écriture`,
			).rejects.toBeInstanceOf(RefusSchema);
		},
	);
});

describe('#734 critère 31 — un résultat ne porte aucune donnée de profil hors du pseudo', () => {
	const CLES_RESULTAT = ['id', 'envoi', 'pseudo', 'date', 'reponses'];
	const CLES_RAPPEL = ['id', 'libelle', 'niveau'];
	const CLES_REPONSE = ['lecon', 'mode', 'enonce', 'saisie', 'attendue', 'statut'];
	const horsSchema = (o: object, permises: string[]): string[] =>
		Reflect.ownKeys(o)
			.map(String)
			.filter((k) => !permises.includes(k));

	it('un résultat valide décodé ne porte que les champs du schéma, à chaque étage', async () => {
		const resultat = valeurAcceptee(await ouvrirResultat(jsonResultat()), 'résultat valide');
		expect(horsSchema(resultat, CLES_RESULTAT), 'champs hors schéma à la racine').toEqual([]);
		expect(horsSchema(resultat.envoi, CLES_RAPPEL), 'champs hors schéma dans le rappel').toEqual(
			[],
		);
		for (const r of resultat.reponses) {
			expect(horsSchema(r, CLES_REPONSE), 'champs hors schéma dans une réponse').toEqual([]);
		}
	});

	// `niveau` est légitime dans le rappel d'envoi, PAS à la racine : ce serait le
	// niveau du profil.
	it.each(['uuid', 'profil', 'xp', 'niveau', 'historique'])(
		'refuse un résultat portant « %s » à la racine',
		async (champ) => {
			attendreRefusSchema(
				await ouvrirResultat(jsonResultat({ racine: { [champ]: champ === 'xp' ? 1200 : 'x' } })),
				`champ de profil « ${champ} » à la racine`,
			);
		},
	);

	it.each(['uuid', 'profil', 'xp'])(
		'refuse un résultat portant « %s » dans une réponse',
		async (champ) => {
			attendreRefusSchema(
				await ouvrirResultat(jsonResultat({ reponse: { [champ]: champ === 'xp' ? 1200 : 'x' } })),
				`champ de profil « ${champ} » dans une réponse`,
			);
		},
	);

	it('refuse un résultat portant « uuid » dans le rappel d’envoi', async () => {
		attendreRefusSchema(
			await ouvrirResultat(jsonResultat({ rappel: { uuid: 'x' } })),
			'champ de profil « uuid » dans le rappel d’envoi',
		);
	});
});

describe('#734 critère 30 (données) — un texte forgé dans un énoncé est conservé tel quel', () => {
	it('garde intact un « <img onerror> » placé dans la question d’un exercice text', async () => {
		const question = '<img src=x onerror=alert(1)> @';
		const envoi = valeurAcceptee(
			await ouvrirEnvoi(jsonEnvoiLecon({ exercices: [j({ ...EX_TEXTE, question })] })),
			'question contenant une balise forgée',
		);
		const ex = blocsDe(envoi)[0]?.exercices[0];
		expect(ex?.type, 'exercice décodé').toBe('text');
		if (ex?.type !== 'text') return;
		expect(ex.question, 'la question a été retouchée en silence au décodage').toBe(question);
	});
});
