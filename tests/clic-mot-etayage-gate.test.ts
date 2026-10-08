/* ============================================================
   « Clique sur le mot » — ce que le panneau d'étayage promet DOIT rester vrai de sa
   banque (#528).
   ------------------------------------------------------------
   Deux défauts RÉELS, trouvés en relecture sur la tranche #528, et corrigés dans
   `src/data/francais/grammaire-clic-mot.ts`. La règle du projet veut que toute remontée
   retenue devienne un gate plutôt qu'une correction silencieuse : les voici.

   A. Le panneau CM1 de l'adjectif donne comme repère une LISTE FERMÉE de verbes d'état
      (« être, sembler, devenir, paraître, rester »). Une liste fermée n'est exacte que
      tant que la banque s'y tient : la première phrase à « avoir l'air » ou à
      « demeurer » rend le panneau incomplet, et rien ne le signale. Le gate dérive donc
      les verbes DE LA BANQUE et exige que chacun soit nommé dans le panneau.

   B. Un exemple cité dans un panneau ne doit emprunter aucun mot-RÉPONSE de la banque
      que ce panneau accompagne. La règle est écrite depuis #490 en tête de la section
      d'étayage de `grammaire-clic-mot.ts` — « un exemple emprunté ici servirait de
      réponse à un tirage futur » — mais aucun test ne la tenait. Le premier jet du
      panneau CM1 l'a enfreinte en illustrant par « Le vieux loup hurle » alors que la
      banque tire « Le vieux loup semble calme ce soir » en demandant justement
      « vieux » : le panneau d'aide donnait la réponse. Vérifier que la PHRASE n'est pas
      dans la banque ne suffit donc pas, la règle porte sur les MOTS — les deux moitiés
      sont vérifiées ici, la seconde pour couvrir la formulation littérale de l'issue.

   Le gate B vaut pour TOUTE la famille « clique sur le mot », à tous ses niveaux : les
   sept autres panneaux n'avaient jamais été regardés sous cet angle.

   CE QUI RESTE HORS DU GATE B, et pourquoi : les CLASSES FERMÉES énoncées en toutes
   lettres (les sept conjonctions de coordination, les neuf pronoms personnels sujets,
   les petits mots du déterminant). Ce sont des mots-réponses, et c'est assumé — c'est la
   notion elle-même, celle que l'école fait apprendre par cœur, pas un item de banque ;
   les taire rendrait le panneau creux (décision écrite en tête de la section d'étayage).
   D'où la frontière MÉCANIQUE retenue : seules les CITATIONS entre guillemets français
   « … » sont des exemples. Elle colle à la donnée — les panneaux qui énumèrent une
   classe fermée le font en texte courant, ceux qui montrent un cas le font entre
   guillemets — et elle a le mérite de se vérifier, là où « est-ce un exemple ? » serait
   du jugement.

   Indépendance auteur ≠ code : les deux attendus viennent de l'issue #528 (critère 8 et
   son commentaire du 2026-10-08) et de la règle de #490, pas d'une ligne de `src/`. Les
   détecteurs sont éprouvés ci-dessous sur un panneau FABRIQUÉ et une banque FABRIQUÉE
   portant exactement la violation annoncée — sans quoi deux gates verts d'emblée ne
   prouveraient rien.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getAllLessons, getLessonById, isClicMotLesson } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { etayagePour } from '../src/core/etayage';
import type { EtayageContenu } from '../src/core/etayage';
import { withSeed } from '../src/core/utils';
import {
	PHRASES_ADJ_CM1,
	estPonctuation,
	joindrePhrase,
	type PhraseClicMot,
} from '../src/data/francais/grammaire-clic-mot';
/* `tokeniser` est le SEUL symbole de ce fichier qui n'a pas de chemin par la façade : elle
   ré-exporte `estPonctuation` et `joindrePhrase`, pas lui. Il est donc importé du module
   interne, faute de mieux, et c'est le reliquat exact du défaut que ce lot répare ailleurs
   (cf. le compte rendu : à ajouter au bloc de ré-export du moteur). Le découper ici
   re-produirait la même fragilité au prochain remaniement. */
import { tokeniser } from '../src/data/francais/grammaire-clic-mot-moteur';
import {
	fonctionCitee,
	fonctionDeclaree,
	indexCible,
	pli,
	verbeEtatAvant,
} from './gardes-adjectif-cm1';

const ADJ = 'fr-gram-clic-adj';

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	expect(l, `leçon ${id} absente du catalogue`).toBeDefined();
	return l!;
};

const panneau = (id: string, niveau: SchoolLevel): EtayageContenu => {
	const c = etayagePour(lecon(id), niveau);
	expect(c, `aucun panneau d'étayage pour ${id}@${niveau}`).toBeDefined();
	return c!;
};

/* Tout le texte d'un panneau, titre compris. */
function texteDuPanneau(c: EtayageContenu): string {
	return [c.titre, c.regle ?? '', ...(c.etapes ?? [])].join(' ');
}

/* ============================================================
   Détecteurs.
   ============================================================ */

/** Un mot est-il NOMMÉ dans un texte ? Comparaison à accents repliés (« paraître » et
    « paraitre » nomment le même verbe) et bornée aux frontières de mot, pour qu'un lemme
    ne se croie pas nommé parce qu'il est enfoui dans un autre mot. Une locution (deux
    mots) se cherche telle quelle. */
function nomme(texte: string, mot: string): boolean {
	const cible = pli(mot);
	const dans = pli(texte);
	if (/[^\p{L}]/u.test(cible)) return dans.includes(cible);
	return new RegExp(`(^|[^\\p{L}])${cible}([^\\p{L}]|$)`, 'u').test(dans);
}

/** GATE A — les verbes d'état que la BANQUE emploie et que le PANNEAU ne nomme pas.
    Le lemme est dérivé de la banque (`verbeEtatAvant`, qui connaît des verbes d'état que
    la leçon n'emploie pas encore : « demeurer », « avoir l'air »), jamais lu dans le
    panneau — c'est tout l'intérêt : le panneau doit suivre la banque, pas l'inverse.
    Un attribut SANS verbe d'état devant lui est un défaut d'un autre ordre (étiquette
    fausse), déjà tenu par le critère 5 dans `clic-mot-adjectif-cm1.test.ts`. */
export function verbesEtatNonNommes(banque: PhraseClicMot[], c: EtayageContenu): string[] {
	const texte = texteDuPanneau(c);
	const manquants = new Set<string>();
	for (const p of banque) {
		if (fonctionDeclaree(p) !== 'attribut') continue;
		const lemme = verbeEtatAvant(p);
		if (lemme && !nomme(texte, lemme)) manquants.add(lemme);
	}
	return [...manquants].sort();
}

/** Les segments cités entre guillemets français dans un texte : la frontière mécanique
    retenue pour « exemple » (cf. en-tête). */
export function citations(texte: string): string[] {
	return [...texte.matchAll(/«([^»]*)»/gu)].map((m) => m[1].trim()).filter((s) => s.length > 0);
}

/** Les mots des exemples d'un panneau (ponctuation écartée). */
export function motsCites(c: EtayageContenu): string[] {
	return [c.titre, c.regle ?? '', ...(c.etapes ?? [])]
		.flatMap(citations)
		.flatMap(tokeniser)
		.filter((t) => !estPonctuation(t));
}

/** Ce qu'une banque attend comme RÉPONSES : les formes des mots ciblés (en minuscules)
    et les phrases entières, pour les deux moitiés du gate B. */
export interface ReponsesBanque {
	mots: Set<string>;
	phrases: Set<string>;
}

export function reponsesDe(banque: PhraseClicMot[]): ReponsesBanque {
	const mots = new Set<string>();
	const phrases = new Set<string>();
	for (const p of banque) {
		for (const i of p.cibleIndices) {
			const t = p.tokens[i];
			if (!t) continue;
			mots.add(t.toLowerCase());
			// Le radical rattrape la VARIANTE D'ACCORD : illustrer par « les grandes fleurs »
			// quand la banque demande « grands » donne la réponse tout autant, et une
			// comparaison de formes exactes ne le verrait pas. Heuristique grossière (marque
			// du pluriel puis du féminin retirées), bornée à trois lettres — « les » → « l »
			// ferait un détecteur fou.
			const rad = radical(t);
			if (rad.length >= 3) mots.add(rad);
		}
		phrases.add(joindrePhrase(p.tokens).toLowerCase());
	}
	return { mots, phrases };
}

/* Radical GROSSIER, écrit ici plutôt qu'importé de `src/` : c'est l'attendu du test, pas
   le reflet de l'heuristique applicative — si les deux divergeaient, c'est que l'une des
   deux a changé, et le test doit le dire. */
function radical(mot: string): string {
	let r = mot.toLowerCase();
	if (r.endsWith('s')) r = r.slice(0, -1);
	if (r.endsWith('e')) r = r.slice(0, -1);
	return r;
}

/** GATE B — les mots d'exemple du panneau qui sont AUSSI des mots-réponses de sa banque,
    à la variante d'accord près. Non vide = le panneau d'aide donne la réponse d'un tirage
    futur. */
export function exemplesQuiDonnentLaReponse(c: EtayageContenu, r: ReponsesBanque): string[] {
	const out = new Set<string>();
	for (const m of motsCites(c)) {
		const b = m.toLowerCase();
		const rad = radical(b);
		if (r.mots.has(b) || (rad.length >= 3 && r.mots.has(rad))) out.add(b);
	}
	return [...out].sort();
}

/** GATE B (seconde moitié, formulation littérale de l'issue) — les PHRASES d'exemple du
    panneau qui sont des phrases de la banque. */
export function phrasesEmpruntees(c: EtayageContenu, r: ReponsesBanque): string[] {
	const out: string[] = [];
	for (const texte of [c.titre, c.regle ?? '', ...(c.etapes ?? [])]) {
		for (const ex of citations(texte)) {
			const normalisee = joindrePhrase(tokeniser(ex)).toLowerCase();
			if (r.phrases.has(normalisee)) out.push(ex);
		}
	}
	return out;
}

/* ============================================================
   La banque RÉELLEMENT servie à un niveau, lue par l'entrée publique.
   ------------------------------------------------------------
   Échantillonnage plutôt qu'un import direct des constantes : c'est `generate({level})`
   qui décide quelle banque un enfant de cette classe reçoit, et c'est cette banque-là que
   son panneau ne doit pas trahir. Une table « leçon → banque → niveau » écrite ici
   finirait par mentir le jour où le branchement change. Tirage SOUS GRAINE (déterminisme),
   et SATURATION vérifiée : si les derniers milliers de tirages n'ont rien apporté de
   neuf, l'échantillon tient lieu de banque entière.
   ============================================================ */
const TIRAGES = 6000;
const QUEUE_SANS_NOUVEAUTE = 3000;

function banqueServie(def: LessonDef, niveau: SchoolLevel): PhraseClicMot[] {
	const vus = new Map<string, PhraseClicMot>();
	let dernierNouveau = -1;
	withSeed(20528, () => {
		for (let i = 0; i < TIRAGES; i++) {
			const ex = def.exerciseType.generate({ level: niveau });
			if (ex.type !== 'clicMot') throw new Error(`${def.id}@${niveau} : ${ex.type}`);
			const cle = `${ex.tokens.join(' ')} ##${ex.cibleIndices.join(',')}`;
			if (vus.has(cle)) continue;
			dernierNouveau = i;
			vus.set(cle, {
				tokens: [...ex.tokens],
				cibleIndices: [...ex.cibleIndices],
				explication: ex.explication,
				consigne: ex.consigne,
				cibleLabel: ex.cibleLabel,
			});
		}
	});
	expect(
		TIRAGES - dernierNouveau,
		`${def.id}@${niveau} : l'échantillon n'est pas saturé, il manque sans doute des items`,
	).toBeGreaterThanOrEqual(QUEUE_SANS_NOUVEAUTE);
	expect(vus.size, `${def.id}@${niveau} : banque quasi vide (${vus.size} items)`).toBeGreaterThan(
		10,
	);
	return [...vus.values()];
}

/** Tous les couples (leçon « clique sur le mot », niveau servi) du catalogue. */
function couples(): { def: LessonDef; niveau: SchoolLevel }[] {
	return getAllLessons()
		.filter(isClicMotLesson)
		.flatMap((def) => def.levels.map((niveau) => ({ def, niveau })));
}

/* ============================================================
   GATE A — le panneau nomme tous les verbes d'état de la banque.
   ============================================================ */
describe('Étayage CM1 de l’adjectif — la liste des verbes d’état suit la banque (#528)', () => {
	it('tout verbe d’état employé par la banque CM1 est nommé dans le panneau', () => {
		const manquants = verbesEtatNonNommes(PHRASES_ADJ_CM1, panneau(ADJ, 'cm1'));
		expect(
			manquants,
			`verbes d'état employés par la banque mais absents du panneau : ${manquants.join(', ')}`,
		).toEqual([]);
	});

	/* Ce gate est VERT au moment où il est écrit : sans la violation ci-dessous, il ne
	   prouverait rien. La banque factice porte exactement le cas d'échec annoncé — une
	   phrase à « avoir l'air », une phrase à « demeurer », deux verbes d'état que le
	   panneau ne nomme pas — construite à la main (la fabrique `adj()` les REFUSE, et
	   c'est heureux : c'est l'autre moitié de la protection, cf. `adj-fabrique-*`). */
	it('le gate MORD : une phrase à « avoir l’air » ou « demeurer » le fait rougir', () => {
		const faux = [
			attributFabrique("Mon frère a l'air content aujourd'hui.", 'content'),
			attributFabrique('Le vieux chêne demeure solide.', 'solide'),
			// Témoin : un verbe d'état DÉJÀ nommé ne doit PAS être signalé, sans quoi le
			// détecteur crierait sur n'importe quoi et le gate vert ne vaudrait rien.
			attributFabrique('Le petit chien semble très content.', 'content'),
		];
		expect(verbesEtatNonNommes(faux, panneau(ADJ, 'cm1'))).toEqual(["avoir l'air", 'demeurer']);
	});

	/* Second témoin, dans l'autre sens : un panneau qui AURAIT oublié un verbe réellement
	   employé par la vraie banque est signalé. Preuve que le détecteur lit bien le panneau
	   et pas seulement la banque. */
	it('le gate MORD aussi côté panneau : un verbe retiré du repère est signalé', () => {
		const ampute: EtayageContenu = {
			titre: 'Épithète ou attribut ?',
			regle: "L'épithète est dans le groupe du nom.",
			etapes: ["Cherche d'abord un verbe d'état : être, sembler, devenir."],
		};
		expect(verbesEtatNonNommes(PHRASES_ADJ_CM1, ampute)).toEqual(['paraître', 'rester']);
	});
});

/* ============================================================
   GATE B — aucun exemple d'étayage ne donne une réponse de sa banque.
   ============================================================ */
describe('Étayage « clique sur le mot » — aucun exemple ne donne la réponse (#490, #528)', () => {
	const tous = couples();

	/* Plancher anti-test-à-vide : la famille compte huit leçons, dont cinq servies aux
	   deux classes. Un catalogue effondré rendrait le gate vert sans rien vérifier. */
	it('l’inventaire des panneaux à vérifier n’est pas vide', () => {
		expect(tous.length, `${tous.length} couples (leçon, niveau)`).toBeGreaterThanOrEqual(12);
		expect(tous.map((c) => c.def.id)).toContain(ADJ);
	});

	for (const { def, niveau } of tous) {
		it(`${def.id}@${niveau} : aucun mot d’exemple n’est une réponse de sa banque`, () => {
			const c = etayagePour(def, niveau);
			expect(c, `aucun panneau pour ${def.id}@${niveau}`).toBeDefined();
			const r = reponsesDe(banqueServie(def, niveau));
			const fuites = exemplesQuiDonnentLaReponse(c!, r);
			expect(
				fuites,
				`${def.id}@${niveau} : le panneau cite ${fuites.map((m) => `« ${m} »`).join(', ')}, ` +
					`qui est la réponse attendue d'au moins un item`,
			).toEqual([]);
			// Formulation littérale de l'issue : la phrase d'exemple n'appartient à aucun item.
			expect(phrasesEmpruntees(c!, r), `${def.id}@${niveau}`).toEqual([]);
		});
	}

	/* Preuve que le gate mord, sur la violation RÉELLE qui a été corrigée : le premier jet
	   du panneau CM1 illustrait par « Le vieux loup hurle », quand la banque tire « Le vieux
	   loup semble calme ce soir » en demandant « vieux ». La phrase, elle, n'était PAS dans
	   la banque — c'est précisément pourquoi une vérification au niveau de la phrase l'aurait
	   laissée passer, et pourquoi la règle porte sur les mots. */
	it('le gate MORD : le premier jet du panneau CM1 est signalé, sur le MOT', () => {
		const premierJet: EtayageContenu = {
			titre: 'Épithète ou attribut ?',
			regle: "L'épithète est dans le groupe du nom.",
			etapes: [
				"Efface l'adjectif et relis : « Le vieux loup hurle » tient encore debout.",
				"Si la phrase s'écroule, c'était un attribut.",
			],
		};
		const r = reponsesDe(PHRASES_ADJ_CM1);
		expect(exemplesQuiDonnentLaReponse(premierJet, r)).toEqual(['vieux']);
		// Et la moitié « phrase entière » ne l'aurait PAS vu : c'est l'angle mort documenté.
		expect(phrasesEmpruntees(premierJet, r)).toEqual([]);
	});

	/* Le même défaut, à une VARIANTE D'ACCORD près : « Les grandes fleurs » n'emprunte
	   aucune forme exacte de la banque, qui demande « grands » et « grande » — et pourtant
	   l'enfant qui lit le panneau a la réponse. C'est le cas qu'une comparaison de formes
	   exactes laisserait passer, d'où la comparaison par radical. */
	it('le gate MORD sur une variante d’accord (« grandes » pour « grands »)', () => {
		const variante: EtayageContenu = {
			titre: 'Épithète ou attribut ?',
			regle: "L'épithète est dans le groupe du nom : « Les grandes fleurs poussent ».",
		};
		const r = reponsesDe(PHRASES_ADJ_CM1);
		expect(exemplesQuiDonnentLaReponse(variante, r)).toEqual(['grandes']);
	});

	/* Témoin inverse : un exemple qui n'emprunte rien à la banque passe. Sans lui, un
	   détecteur qui signalerait tout rendrait le gate ci-dessus insignifiant. */
	it('le gate ne crie PAS sur un exemple étranger à la banque', () => {
		const r = reponsesDe(PHRASES_ADJ_CM1);
		expect(exemplesQuiDonnentLaReponse(panneau(ADJ, 'cm1'), r)).toEqual([]);
		expect(
			exemplesQuiDonnentLaReponse(
				{ titre: 'T', regle: 'R', etapes: ['Exemple : « Le pain devient dur ».'] },
				r,
			),
		).toEqual([]);
	});

	/* Critère 8, tel qu'AMENDÉ sur l'issue le 2026-10-08 : « l'étayage CM1 donne, en plus du
	   repère de règle, un exemple travaillé pour CHACUNE des deux fonctions ». Échec déclaré :
	   « un étayage qui énonce la règle sans jamais montrer un adjectif en situation ». La
	   raison est écrite dans le commentaire : la notion a un an d'avance sur le programme,
	   donc l'enfant ne peut pas s'appuyer sur ce qu'il a vu en classe — énoncer ne suffit pas.
	   Ce test est aussi ce qui empêche le gate B de devenir décoratif sur CETTE leçon : sans
	   exemple cité, il n'aurait plus rien à comparer. */
	it('critère 8 (amendé) : le panneau CM1 MONTRE un exemple pour chacune des deux fonctions', () => {
		const c = panneau(ADJ, 'cm1');
		const etapes = [c.regle ?? '', ...(c.etapes ?? [])];
		for (const fonction of ['epithete', 'attribut'] as const) {
			const porteuses = etapes.filter((e) => fonctionCitee(e) === fonction);
			expect(
				porteuses.length,
				`aucun passage du panneau ne traite « ${fonction} »`,
			).toBeGreaterThan(0);
			const montrees = porteuses.filter((e) => citations(e).length > 0);
			expect(
				montrees.length,
				`« ${fonction} » : règle énoncée, jamais montrée — aucun exemple cité`,
			).toBeGreaterThan(0);
			// Un exemple travaillé est une PHRASE, pas un mot isolé lâché entre guillemets.
			for (const e of montrees) {
				for (const ex of citations(e)) {
					expect(tokeniser(ex).length, `exemple trop court : « ${ex} »`).toBeGreaterThanOrEqual(3);
				}
			}
		}
	});

	/* Preuve que le test ci-dessus mord : un panneau qui ÉNONCE les deux règles sans rien
	   montrer — la rédaction la plus naturelle, et celle que l'amendement interdit. */
	it('le gate MORD : un panneau qui énonce sans montrer est signalé', () => {
		const sansExemple: EtayageContenu = {
			titre: 'Épithète ou attribut ?',
			regle:
				"L'épithète est dans le groupe du nom. L'attribut est relié au sujet par un verbe d'état.",
			etapes: [
				"Cherche d'abord un verbe d'état : être, sembler, devenir, paraître, rester.",
				"L'adjectif vient après ce verbe ? C'est l'attribut.",
				"L'adjectif est dans le groupe du nom ? C'est l'épithète.",
			],
		};
		const etapes = [sansExemple.regle ?? '', ...(sansExemple.etapes ?? [])];
		for (const fonction of ['epithete', 'attribut'] as const) {
			const porteuses = etapes.filter((e) => fonctionCitee(e) === fonction);
			expect(porteuses.length, fonction).toBeGreaterThan(0); // la règle EST énoncée…
			expect(porteuses.filter((e) => citations(e).length > 0)).toEqual([]); // …mais jamais montrée
		}
	});

	/* La frontière mécanique « exemple = entre guillemets » est elle-même testée : c'est
	   elle qui laisse passer les classes fermées énoncées en texte courant (les sept
	   conjonctions, les neuf pronoms sujets), exception assumée en tête de la section
	   d'étayage. Si `citations` ramassait tout le texte, le gate rougirait sur la
	   conjonction et le pronom sans qu'aucun panneau n'ait changé. */
	it('seules les citations entre guillemets comptent comme exemples', () => {
		expect(citations('Elles ne sont que sept : mais, ou, et, donc, or, ni, car.')).toEqual([]);
		expect(citations("Encadre le mot par « ne… pas » : ça ne marche qu'avec le verbe.")).toEqual([
			'ne… pas',
		]);
		expect(citations('« un » puis « deux »')).toEqual(['un', 'deux']);
		expect(motsCites({ titre: 'T', etapes: ['Dis « le chat noir ».'] })).toEqual([
			'le',
			'chat',
			'noir',
		]);
	});
});

/* Fabrique un item « attribut » À LA MAIN, hors de `adj()` : les verbes d'état que le
   gate A doit attraper sont justement ceux que la fabrique refuse. Le `cibleLabel` est
   celui que lit `fonctionDeclaree`. */
function attributFabrique(texte: string, cible: string): PhraseClicMot {
	const tokens = tokeniser(texte);
	const i = tokens.findIndex((t) => t.toLowerCase() === cible.toLowerCase());
	expect(i, `« ${cible} » introuvable dans « ${texte} »`).toBeGreaterThanOrEqual(0);
	const p: PhraseClicMot = {
		tokens,
		cibleIndices: [i],
		explication: `« ${cible} » est relié au sujet par un verbe d'état.`,
		cibleLabel: "l'adjectif attribut",
	};
	expect(indexCible(p)).toBe(i);
	return p;
}
