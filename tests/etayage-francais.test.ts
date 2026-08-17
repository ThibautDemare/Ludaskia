/* ============================================================
   Étayage RÉDIGÉ de la notion (#490, PR 4) — le CONTENU FRANÇAIS.
   ------------------------------------------------------------
   Pendant, côté français, de `etayage-redige.test.ts` (qui garde les maths et la charte
   commune à toutes les entrées du catalogue). Ce fichier tient les trois propriétés que
   le contenu français revendique et qui, chacune, se casseraient SANS BRUIT :

   1. la COUVERTURE. Une leçon oubliée n'ouvre simplement pas de panneau — le trou est
      indiscernable d'un choix, jusqu'au jour où un enfant bute dessus. On le recense par
      CATÉGORIE, à chaque niveau ET dans chaque mode : le français a des leçons à deux
      modes (saisie / QCM sur les accords et les 52 conjugaisons) où une entrée réservée
      à un mode ne servirait que la moitié des enfants.

   2. la TÂCHE PAR NIVEAU. Quatre leçons « clique sur le mot » ne changent pas de
      DIFFICULTÉ d'un niveau à l'autre, elles changent de TRAVAIL : au CE2 on clique sur
      TOUS les noms / TOUS les déterminants d'une phrase, au CM1 sur le seul nom noyau ou
      sur la sous-catégorie demandée. Un panneau CE2 servi à un CM1 y décrit un autre
      exercice — et rien ne le signale à l'écran (un panneau s'ouvre, il est plein, il
      est faux). Les attendus sont dérivés de ce que la leçon TIRE à chaque niveau
      (graines fixes), jamais du texte de l'étayage. Le test vaut dans les deux sens :
      les leçons dont la tâche ne bouge PAS ne doivent pas, elles, se scoper par niveau.

   3. la BANQUE FERMÉE (critère de relecture du `pedagogue-primaire`). Un panneau qui
      cite un item réellement tirable ne donne pas « la réponse du jour » : il la donne à
      TOUS les tirages futurs de cet item. La contrainte est spécifique au français, où
      les banques sont écrites une à une et énumérables (13 verbes pour les QCM méta,
      ~100 phrases par paire d'homophones, une soixantaine de mots pour le m/b/p) — là où
      un générateur de maths retire des nombres neufs à chaque fois. Trois mesures
      mécanisables, toutes dérivées des TIRAGES et non du texte :
      - les ILLUSTRATIONS (ce que le panneau met entre guillemets ou entre parenthèses)
        d'un QCM méta ne sont pas des verbes du corpus ;
      - aucun panneau ne partage de séquence de quatre mots avec un énoncé tirable ;
      - dans le vocabulaire, aucune RÉPONSE tirable n'est écrite dans le panneau.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { etayagePour, type EtayageContenu } from '../src/core/etayage';
import { CATEGORIES, getAllLessons, getLessonById } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { defaultMode } from '../src/core/exercise';
import type { Exercise } from '../src/core/exercise';
import { withSeed } from '../src/core/utils';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { VERBS } from '../src/data/francais/conjugaison';
import { MBP_BANK, motComplet } from '../src/data/francais/mbp';

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

const LECONS_FR = (): LessonDef[] => getAllLessons().filter((l) => l.subject === 'francais');
const CATEGORIES_FR = CATEGORIES.filter((c) => c.subject === 'francais').map((c) => c.id);

/* Les modes réellement atteignables : ceux que la leçon déclare, plus « sans mode » (une
   leçon mono-mode se lance sans en choisir un). */
const modesDe = (l: LessonDef): (string | undefined)[] => [
	undefined,
	...(l.exerciseType.modes ?? []).map((m) => m.id),
];

const texteDe = (c: EtayageContenu): string =>
	[c.titre, c.regle ?? '', ...(c.etapes ?? [])].join(' ');

/* ============================================================
   1. COUVERTURE
   ============================================================ */
describe('couverture — aucune leçon de français ne reste sans explication', () => {
	it('catégorie par catégorie, à chaque niveau ET dans chaque mode', () => {
		/* Recensement plutôt qu'un total : l'échec doit nommer la catégorie ET les leçons
		   oubliées, pas afficher un nombre qui se « répare » en le changeant. Contrairement
		   au recensement des maths, on exige le panneau dans TOUS les modes déclarés et pas
		   seulement dans l'un d'eux : la conjugaison et les accords se jouent en saisie OU en
		   QCM, et c'est la même notion qui manque dans les deux cas. */
		const recensement = CATEGORIES_FR.map((categorie) => {
			const trous = LECONS_FR()
				.filter((l) => l.category === categorie)
				.flatMap((l) =>
					l.levels.flatMap((n) =>
						modesDe(l)
							.filter((m) => !etayagePour(l, n, m))
							.map((m) => `${l.id}/${n}/${m ?? '-'}`),
					),
				);
			return { categorie, trous };
		});
		expect(recensement).toEqual(CATEGORIES_FR.map((categorie) => ({ categorie, trous: [] })));
		// Garde-fou du recensement : une catégorie vidée (id renommé, import perdu) passerait
		// la boucle ci-dessus sans avoir rien vérifié. Bornes basses, pas des totaux exacts :
		// une leçon de plus n'a pas à faire rougir ce test, une catégorie évaporée si.
		for (const categorie of CATEGORIES_FR)
			expect(LECONS_FR().filter((l) => l.category === categorie).length, categorie).toBeGreaterThan(
				0,
			);
		expect(LECONS_FR().length).toBeGreaterThanOrEqual(90);
	});

	it('dans le mode où la leçon SE LANCE, sans exception', () => {
		/* `defaultMode` est le mode retenu quand l'enfant n'en choisit pas (ui/navigation.ts) :
		   reprise depuis la révision, lien direct, fil d'une série. Redondant avec le
		   recensement ci-dessus tant que TOUS les modes sont couverts — mais il nomme le mode
		   qui compte le jour où quelqu'un décidera de ne couvrir qu'une partie des modes. */
		const trous: string[] = [];
		for (const l of LECONS_FR()) {
			const mode = defaultMode(l.exerciseType);
			for (const niveau of l.levels)
				if (!etayagePour(l, niveau, mode)) trous.push(`${l.id}/${niveau}/${mode ?? '-'}`);
		}
		expect(trous.sort()).toEqual([]);
	});
});

/* ============================================================
   2. LA TÂCHE CHANGE DE NIVEAU — le panneau aussi
   ------------------------------------------------------------
   On lit d'abord ce que la leçon POSE à chaque niveau (tirages à graines fixes), puis on
   confronte le panneau à cette tâche. Deux mesures dérivées des tirages :
   - `cibleLabel` : le nom que la leçon donne à ce qu'elle demande (« les noms », « le nom
     noyau », « l'article »…) — il dit si la tâche est en bloc ou sous-catégorisée ;
   - le nombre de mots à cliquer — il dit si la cible est unique ou plurielle.
   ============================================================ */
const TIRAGES = 200;

function tirages(l: LessonDef, niveau: SchoolLevel): Exercise[] {
	return Array.from({ length: TIRAGES }, (_, i) =>
		withSeed(i + 1, () => l.exerciseType.generate({ level: niveau })),
	);
}

/* Ce qu'une leçon « clique sur le mot » demande à ce niveau : les noms de cible employés,
   et les tailles de cible observées. */
function tacheClicMot(id: string, niveau: SchoolLevel): { labels: string[]; tailles: number[] } {
	const labels = new Set<string>();
	const tailles = new Set<number>();
	for (const ex of tirages(lecon(id), niveau)) {
		if (ex.type !== 'clicMot') throw new Error(`${id}/${niveau} : ${ex.type} au lieu d'un clicMot`);
		labels.add(ex.cibleLabel ?? '(aucun)');
		tailles.add(ex.cibleIndices.length);
	}
	return { labels: [...labels].sort(), tailles: [...tailles].sort() };
}

const panneau = (id: string, niveau: SchoolLevel): EtayageContenu => {
	const c = etayagePour(lecon(id), niveau, defaultMode(lecon(id).exerciseType));
	if (!c) throw new Error(`panneau attendu pour ${id}/${niveau}`);
	return c;
};

const texteBas = (id: string, niveau: SchoolLevel): string =>
	texteDe(panneau(id, niveau)).toLowerCase();

describe('« clique sur le mot » — chaque classe reçoit la méthode de SA tâche', () => {
	const DEUX_NIVEAUX = [
		'fr-gram-clic-verbe',
		'fr-gram-clic-det',
		'fr-gram-clic-pron',
		'fr-gram-clic-noyau',
	];

	it('les deux niveaux reçoivent bien deux contenus DISTINCTS', () => {
		for (const id of DEUX_NIVEAUX) {
			const ce2 = panneau(id, 'ce2');
			const cm1 = panneau(id, 'cm1');
			expect(cm1, id).not.toBe(ce2);
			expect(cm1, id).not.toEqual(ce2);
			// Les entrées sont scopées par NIVEAU : aucun mode ne doit court-circuiter ce choix
			// (le mode « clic » est le seul déclaré, et c'est celui du lancement direct).
			for (const mode of modesDe(lecon(id))) {
				expect(etayagePour(lecon(id), 'ce2', mode), `${id}/ce2/${mode ?? '-'}`).toBe(ce2);
				expect(etayagePour(lecon(id), 'cm1', mode), `${id}/cm1/${mode ?? '-'}`).toBe(cm1);
			}
		}
	});

	it('le VERBE : le CM1 seul tire une cible en DEUX mots, et son panneau le dit', () => {
		const ce2 = tacheClicMot('fr-gram-clic-verbe', 'ce2');
		const cm1 = tacheClicMot('fr-gram-clic-verbe', 'cm1');
		// La tâche observée : au CE2 un seul mot à cliquer, au CM1 parfois deux (passé composé).
		expect(ce2.tailles).toEqual([1]);
		expect(cm1.tailles).toEqual([1, 2]);
		// Donc le CM1 doit prévenir que le verbe peut être en deux mots — sans quoi un enfant
		// qui clique le seul participe est refusé sans comprendre pourquoi. Et le CE2 ne doit
		// PAS le dire : au CE2 la bonne réponse est toujours un mot unique, annoncer un
		// deuxième mot ne peut qu'égarer.
		expect(texteBas('fr-gram-clic-verbe', 'cm1')).toMatch(/deux mots/);
		expect(texteBas('fr-gram-clic-verbe', 'ce2')).not.toMatch(/deux mots/);
	});

	it('le DÉTERMINANT : tous au CE2 (cible plurielle), la sous-catégorie demandée au CM1', () => {
		const ce2 = tacheClicMot('fr-gram-clic-det', 'ce2');
		const cm1 = tacheClicMot('fr-gram-clic-det', 'cm1');
		// CE2 : une seule tâche, nommée en bloc, et des cibles de plusieurs mots.
		expect(ce2.labels).toEqual(['les déterminants']);
		expect(Math.max(...ce2.tailles)).toBeGreaterThan(1);
		// CM1 : trois tâches (les trois sous-catégories), un seul mot à chaque fois.
		expect(cm1.labels.length).toBe(3);
		expect(cm1.tailles).toEqual([1]);
		// Le panneau CE2 doit annoncer la pluralité (c'est l'erreur de la leçon : n'en cliquer
		// qu'un) ; le CM1 doit nommer les trois sous-catégories qu'il peut demander, sinon il
		// n'explique pas la question posée.
		expect(texteBas('fr-gram-clic-det', 'ce2')).toMatch(/plusieurs|tous|aucun/);
		const cm1Texte = texteBas('fr-gram-clic-det', 'cm1');
		for (const mot of ['article', 'possessif', 'démonstratif'])
			expect(cm1Texte, mot).toContain(mot);
		// Et le CE2 ne doit pas introduire ce vocabulaire de tri, qui n'est pas sa tâche.
		expect(texteBas('fr-gram-clic-det', 'ce2')).not.toMatch(/possessif|démonstratif/);
	});

	it('le PRONOM : le sujet seul au CE2, sujet CONTRE complément au CM1', () => {
		const ce2 = tacheClicMot('fr-gram-clic-pron', 'ce2');
		const cm1 = tacheClicMot('fr-gram-clic-pron', 'cm1');
		// CE2 : le seul pronom sujet. CM1 : les deux rôles, donc une distinction à faire.
		expect(ce2.labels).toEqual(['le pronom personnel sujet']);
		expect(cm1.labels.some((l) => /complément/.test(l))).toBe(true);
		expect(cm1.labels.some((l) => /sujet/.test(l))).toBe(true);
		// Le CM1 doit donc opposer les deux rôles ; le CE2, qui ne rencontre jamais de pronom
		// complément dans sa banque, ne doit pas l'évoquer.
		const cm1Texte = texteBas('fr-gram-clic-pron', 'cm1');
		expect(cm1Texte).toMatch(/sujet/);
		expect(cm1Texte).toMatch(/complément/);
		expect(texteBas('fr-gram-clic-pron', 'ce2')).not.toMatch(/complément/);
	});

	it('le NOM : tous les noms au CE2, le seul noyau au CM1 (et le mot « noyau » y reste)', () => {
		const ce2 = tacheClicMot('fr-gram-clic-noyau', 'ce2');
		const cm1 = tacheClicMot('fr-gram-clic-noyau', 'cm1');
		expect(ce2.labels).toEqual(['les noms']);
		expect(Math.max(...ce2.tailles)).toBeGreaterThan(1);
		expect(cm1.labels).toEqual(['le nom noyau']);
		expect(cm1.tailles).toEqual([1]);
		// « noyau » est du vocabulaire CM1 : le libellé de la leçon lui-même est par niveau
		// (#436, `labelNiveau`), donc le panneau CE2 ne peut pas l'employer — il dirait un mot
		// que l'enfant n'a vu nulle part. Le CM1, lui, doit le nommer : c'est sa cible.
		expect(texteBas('fr-gram-clic-noyau', 'cm1')).toMatch(/noyau/);
		expect(texteBas('fr-gram-clic-noyau', 'ce2')).not.toMatch(/noyau/);
		expect(texteBas('fr-gram-clic-noyau', 'ce2')).toMatch(/plusieurs|tous|aucun/);
	});

	it('les leçons dont la tâche NE bouge pas ne se scopent pas par niveau (et l’inverse)', () => {
		/* Le scope par niveau est le seul mécanisme qui sépare deux contenus (`etayagePour`) :
		   l'oublier là où il faut sert le contenu du CE2 à un CM1, et l'ajouter là où il ne
		   faut pas double le texte à maintenir pour rien. On dérive « la tâche bouge » des
		   TIRAGES : à graine égale, deux niveaux qui posent la même question produisent la
		   même signature d'item — les 52 conjugaisons, les trois QCM méta et « Quel type de
		   phrase ? » ignorent le niveau, les quatre « clique sur le mot » non. */
		const signature = (ex: Exercise): string =>
			ex.type === 'clicMot'
				? [ex.type, ex.tokens.join(' '), ex.cibleIndices.join(','), ex.cibleLabel].join('|')
				: JSON.stringify(ex);
		const memeTache = (l: LessonDef): boolean =>
			l.levels
				.map((n) => tirages(l, n).map(signature).join('\n'))
				.every((s, _, all) => s === all[0]);

		const biNiveaux = LECONS_FR().filter((l) => l.levels.length > 1);
		expect(biNiveaux.length).toBeGreaterThan(50); // les 52 conjugaisons au minimum
		const scopees = biNiveaux
			.filter((l) => (l.etayage ?? []).some((e) => e.niveau !== undefined))
			.map((l) => l.id);
		const tacheDifferente = biNiveaux.filter((l) => !memeTache(l)).map((l) => l.id);
		expect(scopees.sort()).toEqual(tacheDifferente.sort());
		expect(scopees.sort()).toEqual([...DEUX_NIVEAUX].sort());
	});
});

/* ============================================================
   3. BANQUE FERMÉE — un panneau ne cite pas un item tirable
   ============================================================ */
const mots = (s: string): string[] =>
	s
		.toLowerCase()
		.replace(/[«»".,;:!?…()\-–—@]/g, ' ')
		.split(/\s+/)
		.filter(Boolean);

const ngrammes = (s: string, n: number): string[] => {
	const m = mots(s);
	return Array.from({ length: Math.max(0, m.length - n + 1) }, (_, i) =>
		m.slice(i, i + n).join(' '),
	);
};

/* `mot` apparaît-il comme MOT ENTIER ? Les bornes `\b` de JS ignorent les lettres
   accentuées (« être » collé dans « peut-être » passerait) : on encadre par « pas une
   lettre », en Unicode. */
const cite = (texte: string, mot: string): boolean =>
	new RegExp(`(^|[^\\p{L}])${mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(
		texte,
	);

/* La part de l'énoncé qui vient de la BANQUE (la phrase, les mots, les paires), sans le
   gabarit de consigne — ce qu'un panneau ne doit pas emprunter. */
function contenuTirable(ex: Exercise): string {
	switch (ex.type) {
		case 'clicMot':
			return ex.tokens.join(' ');
		case 'tuilesOrdre':
			return ex.tuiles.join(' ');
		case 'tuilesTri':
			return [...ex.categories, ...ex.mots.map((m) => m.mot)].join(' ');
		case 'appariement':
			return [...ex.paires.flatMap((p) => [p.gauche, p.droite]), ...(ex.intrus ?? [])].join(' ');
		default:
			return 'question' in ex ? ex.question : '';
	}
}

const reponses = (ex: Exercise): string[] => {
	const out: string[] = [];
	if ('answer' in ex && typeof ex.answer === 'string') out.push(ex.answer);
	if (ex.type === 'clicMot') for (const i of ex.cibleIndices) out.push(ex.tokens[i]);
	return out;
};

/* Ce qui est présent dans TOUS les tirages : le gabarit invariant d'une leçon (sa consigne
   recopiée dans l'énoncé, ses options fixes). Dérivé du comportement, pas d'une liste
   écrite à la main — ce qui est affiché à CHAQUE question ne peut rien révéler d'un item
   en particulier, puisque l'enfant l'a déjà sous les yeux. */
function partout(listes: string[][]): Set<string> {
	if (!listes.length) return new Set();
	let acc = new Set(listes[0]);
	for (const l of listes.slice(1)) {
		const vus = new Set(l);
		acc = new Set([...acc].filter((x) => vus.has(x)));
	}
	return acc;
}

const choix = (ex: Exercise): string[] => (ex.type === 'qcm' ? ex.choices : []);

/* Nombre d'énoncés DIFFÉRENTS au-delà duquel une séquence de mots appartient au GABARIT de
   la leçon et non à un item : une consigne recopiée dans l'énoncé (« De la même famille
   que … », « Range ces mots dans l'ordre alphabétique ») se retrouve dans des dizaines
   d'énoncés, alors qu'une phrase de banque n'apparaît que dans le sien. La marge couvre les
   banques qui réutilisent une phrase pour plusieurs items : « clique sur le déterminant »
   pose la même phrase pour ses trois sous-catégories, soit trois énoncés identiques au mot
   près. */
const GABARIT_MIN_ENONCES = 4;

/** Les séquences de `n` mots qui viennent de la BANQUE, et non du gabarit de la leçon.
    Compter les énoncés DISTINCTS (et non les tirages, ni « présent partout ») est ce qui
    rend la mesure indépendante du nombre de gabarits : `fr-vocab-familles` et
    `fr-gram-classes` en ont trois chacun et n'en tirent qu'un sur trois, si bien qu'aucune
    de leurs consignes n'est jamais présente dans TOUS les tirages. */
function sequencesDeBanque(enonces: Set<string>, n: number): Set<string> {
	const combien = new Map<string, number>();
	for (const e of enonces)
		for (const g of new Set(ngrammes(e, n))) combien.set(g, (combien.get(g) ?? 0) + 1);
	return new Set([...combien].filter(([, c]) => c < GABARIT_MIN_ENONCES).map(([g]) => g));
}

/* Ce que le panneau met en AVANT comme exemple : ce qu'il place entre guillemets ou entre
   parenthèses. C'est là, et seulement là, qu'un contenu CITE un mot de la langue — le
   reste est de la syntaxe courante (« avant d'être conjugué » parle de l'enfant, pas du
   verbe « être »). */
const illustrations = (texte: string): string[] =>
	[...texte.matchAll(/«([^»]*)»|\(([^)]*)\)/g)].map((m) => m[1] ?? m[2]);

describe('banque fermée — le panneau n’illustre jamais avec un item tirable', () => {
	it('les trois QCM « méta » de conjugaison illustrent avec des verbes HORS corpus', () => {
		/* Leur corpus est `VERBS` : treize infinitifs, fixes, et le groupe ou l'infinitif d'un
		   verbe ne change pas d'un tirage à l'autre. Nommer « venir » dans le panneau du
		   groupe, c'est répondre à la question « à quel groupe appartient venir ? » pour de
		   bon. Seule exception, DÉRIVÉE des tirages et non concédée à la main : un mot déjà
		   imprimé dans les options de CHAQUE question (« avoir » et « être » y sont, dans les
		   deux libellés fixes de « simple ou composé ») ne révèle rien que l'enfant n'ait
		   sous les yeux. */
		const INFINITIFS = VERBS.map((v) => v.infinitif);
		const fautes: string[] = [];
		for (const id of ['fr-conj-groupe', 'fr-conj-infinitif', 'fr-conj-simple-compose']) {
			const l = lecon(id);
			const exemples = new Set(illustrations(texteDe(panneau(id, 'ce2'))).flatMap(mots));
			const toujoursAffiches = partout(tirages(l, 'ce2').map((ex) => choix(ex).flatMap(mots)));
			for (const inf of INFINITIFS)
				if (exemples.has(inf) && !toujoursAffiches.has(inf))
					fautes.push(`${id} — illustre avec « ${inf} », qui est du corpus`);
		}
		expect(fautes).toEqual([]);
		// Sanity du dispositif : les panneaux illustrent bel et bien (sinon la boucle
		// ci-dessus passerait sur des ensembles vides).
		for (const id of ['fr-conj-groupe', 'fr-conj-infinitif', 'fr-conj-simple-compose'])
			expect(illustrations(texteDe(panneau(id, 'ce2'))).length, id).toBeGreaterThan(0);
	});

	it('aucun panneau ne partage quatre mots de suite avec un énoncé tirable', () => {
		/* La forme la plus grossière de la fuite : recopier une phrase de la banque (les ~100
		   phrases d'une paire d'homophones, les phrases annotées de « clique sur le mot », les
		   énoncés curatés des QCM de langue). Quatre mots consécutifs, c'est trop pour une
		   coïncidence de vocabulaire et assez peu pour attraper une demi-citation. */
		const fautes: string[] = [];
		for (const l of LECONS_FR()) {
			for (const niveau of l.levels) {
				const contenu = etayagePour(l, niveau, defaultMode(l.exerciseType));
				if (!contenu) continue;
				const duPanneau = new Set(ngrammes(texteDe(contenu), 4));
				if (!duPanneau.size) continue;
				const enonces = new Set(tirages(l, niveau).map(contenuTirable));
				for (const g of sequencesDeBanque(enonces, 4))
					if (duPanneau.has(g)) fautes.push(`${l.id}/${niveau} — « ${g} » vient de la banque`);
			}
		}
		expect([...new Set(fautes)]).toEqual([]);

		/* Le vert ci-dessus ne vaut que si la mesure attrape vraiment une recopie : un filtre
		   trop large classerait TOUT en « gabarit » et le test passerait à vide. On le vérifie
		   sur deux leçons aux banques opposées — une phrase d'homophone (banque de ~100
		   phrases, un énoncé chacune) et une phrase de « clique sur le mot » (réutilisée par
		   plusieurs items) : dans les deux cas, un panneau qui les citerait serait signalé. */
		for (const [id, niveau] of [
			['fr-homophones-a', 'ce2'],
			['fr-gram-clic-det', 'cm1'],
		] as [string, SchoolLevel][]) {
			const enonces = new Set(tirages(lecon(id), niveau).map(contenuTirable));
			const deBanque = sequencesDeBanque(enonces, 4);
			const citation = [...enonces][0];
			const attrapes = ngrammes(citation, 4).filter((g) => deBanque.has(g));
			expect(attrapes.length, `${id} — « ${citation} » passerait inaperçue`).toBeGreaterThan(0);
		}
	});

	it('en vocabulaire, aucune RÉPONSE tirable n’est écrite dans le panneau', () => {
		/* Là où la réponse est un mot du lexique (le contraire, le synonyme, le dérivé, le
		   sens d'un homonyme, le mot juste), l'écrire dans le panneau vaut corrigé permanent :
		   les banques comptent quelques dizaines d'items et reviennent.

		   Cadré au VOCABULAIRE à dessein. Ailleurs, la réponse EST la notion et se nomme
		   forcément : les sept conjonctions de coordination, les neuf pronoms personnels
		   sujets, les trois types de phrase ou les trois groupes de verbes sont des listes
		   fermées que l'école fait apprendre par cœur — un panneau qui les tairait serait
		   creux, et ce sont d'ailleurs les options affichées à chaque question. */
		const fautes: string[] = [];
		for (const l of LECONS_FR()) {
			if (l.category !== 'fr-vocabulaire') continue;
			for (const niveau of l.levels) {
				const contenu = etayagePour(l, niveau, defaultMode(l.exerciseType));
				if (!contenu) continue;
				const duPanneau = new Set(mots(texteDe(contenu)));
				const exs = tirages(l, niveau);
				const toujoursAffiches = partout(exs.map(choix));
				for (const ex of exs)
					for (const r of reponses(ex)) {
						if (toujoursAffiches.has(r)) continue;
						const m = mots(r);
						if (m.length && m.every((w) => duPanneau.has(w)))
							fautes.push(`${l.id}/${niveau} — « ${r} » est une réponse tirable`);
					}
			}
		}
		expect([...new Set(fautes)]).toEqual([]);
	});

	it('le panneau du m/b/p ne nomme aucun mot de sa banque, exceptions comprises', () => {
		/* Le panneau annonce « trois mots seulement font exception » sans les nommer, et c'est
		   le point : les exceptions sont SUR-PONDÉRÉES dans le tirage (poids 3), donc celles-là
		   plus que les autres reviendraient avec leur réponse déjà lue. On éprouve toute la
		   banque, pas seulement les trois — un mot régulier cité donnerait sa lettre autant
		   de fois qu'il sortira. */
		const texte = texteDe(panneau('fr-mbp', 'ce2'));
		const cites = MBP_BANK.map(motComplet).filter((m) => cite(texte, m));
		expect([...new Set(cites)]).toEqual([]);
		// La banque est bien celle qu'on croit (sinon le filtre tournerait à vide).
		expect(MBP_BANK.length).toBeGreaterThan(50);
		expect(MBP_BANK.filter((i) => i.type === 'exception').length).toBe(3);
	});
});
