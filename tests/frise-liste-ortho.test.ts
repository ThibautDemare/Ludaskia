/* ============================================================
   Frise d'états d'une LISTE de dictée (#541) — `friseListeOrtho` et son
   branchement dans `listesOrthoProfil` (core/encadrant-stats.ts).
   ------------------------------------------------------------
   Même fenêtre et même lecture des cellules que la frise d'une leçon (contrat éprouvé
   dans frise-etats.test.ts, dont ce fichier reprend la grille de semaines) : 12
   cellules de la plus ANCIENNE à la plus récente, semaines CALENDAIRES (lundi premier
   jour), état d'une cellule = état atteint à la FIN de sa semaine.

   La SPÉCIFICITÉ éprouvée ici, et c'est tout l'intérêt du fichier : l'échelle des
   listes ne compte que trois valeurs (« à renforcer » n'existe pas, l'acquisition d'un
   mot étant binaire — cf. orthographe/progression.ts). Une semaine SUIVIE antérieure au
   tampon « en cours » était donc forcément « à découvrir » : rien n'était commencé. Là
   où la frise d'une leçon doit rester dans le doute ('inconnu'), celle d'une liste
   affirme. Le doute ne subsiste qu'AVANT la borne de mise en service — laquelle est
   PROPRE à ce journal (ORTHO_PALIERS_DEBUT_KEY) et ne se déduit pas de celle des leçons.

   Ce que ces tests ne recopient PAS : la grille de semaines est une arithmétique de
   calendrier écrite ici (pas `lundiDecale`), les attendus sont posés en RUNS de cellules
   à la main, et le contraste avec une leçon est vérifié en confrontant les deux
   fonctions sur les MÊMES entrées.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { initProfiles, activeProfile, addProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsSetRaw } from '../src/core/storage';
import { PALIERS_DEBUT_KEY, type PaliersNotion } from '../src/core/progress';
import {
	friseListeOrtho,
	friseNotion,
	aChangeRecemment,
	debutSuiviPaliers,
	listesOrthoProfil,
	type CelluleFrise,
} from '../src/core/encadrant-stats';
import {
	journaliserPaliersOrtho,
	ORTHO_PALIERS_KEY,
	ORTHO_PALIERS_DEBUT_KEY,
} from '../src/core/orthographe/paliers';
import { loadOrtho, saveOrtho, createListe, updateListe } from '../src/core/orthographe/store';
import type { MotOrtho } from '../src/core/orthographe/types';
import type { NiveauNotion } from '../src/core/maitrise';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const NB_SEMAINES = 12; // largeur annoncée de la frise
const HEURE = 3_600_000;
const MINUTE = 60_000;

const NOW = new Date(2026, 7, 12, 15, 30).getTime(); // mercredi 12 août 2026, 15 h 30

/* ---------- Grille de semaines du TEST, en jours de CALENDRIER ---------- */
function lundiDe(ts: number): number {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // dimanche (0) → 6 jours en arrière
	return d.getTime();
}
function joursApres(ts: number, jours: number): number {
	const d = new Date(ts);
	d.setDate(d.getDate() + jours);
	return d.getTime();
}
function grille(now: number) {
	const lundiCellule = (i: number): number => joursApres(lundiDe(now), 7 * (i - (NB_SEMAINES - 1)));
	const finDe = (i: number): number => lundiCellule(i + 1);
	const dans = (i: number, jour = 2, heure = 10, minute = 0): number =>
		joursApres(lundiCellule(i), jour) + heure * HEURE + minute * MINUTE;
	return { lundiCellule, finDe, dans };
}
const { lundiCellule, finDe, dans: dansSemaine } = grille(NOW);

/* Rangée ATTENDUE, écrite en RUNS explicites : `rangee(['inconnu', 4], ['acquis', 8])`. */
function rangee(...runs: [CelluleFrise, number][]): CelluleFrise[] {
	const out = runs.flatMap(([etat, n]) => Array.from({ length: n }, (): CelluleFrise => etat));
	if (out.length !== NB_SEMAINES)
		throw new Error(`rangée de ${out.length} cellules au lieu de ${NB_SEMAINES}`);
	return out;
}

/* Échelle des LISTES : trois valeurs seulement (jamais 'non-acquis', cf. progression.ts). */
const ECHELLE_LISTE: NiveauNotion[] = ['a-decouvrir', 'en-cours', 'acquis'];
const RANG: Record<NiveauNotion, number> = {
	'a-decouvrir': 0,
	'non-acquis': 1,
	'en-cours': 2,
	acquis: 3,
};
const rang = (c: CelluleFrise): number => (c === 'inconnu' ? -1 : RANG[c]);

/* Donnée relue du STOCKAGE (JSON, non typée) : le cast est l'objet du test. */
const brut = <T>(v: unknown): T => v as T;

/* ============================================================
   1. Rien à tracer
   ============================================================ */
describe('friseListeOrtho — rien à tracer', () => {
	it('liste jamais commencée (« à découvrir » + aucun cap) → null', () => {
		expect(friseListeOrtho(undefined, 'a-decouvrir', dansSemaine(2), NOW)).toBeNull();
		expect(friseListeOrtho({}, 'a-decouvrir', Infinity, NOW)).toBeNull();
	});

	it('caps non exploitables (chaîne, NaN, Infinity) → traités comme absents', () => {
		expect(
			friseListeOrtho(brut<PaliersNotion>({ enCours: '1700000000000' }), 'a-decouvrir', 0, NOW),
		).toBeNull();
		expect(friseListeOrtho({ enCours: NaN, acquis: Infinity }, 'a-decouvrir', 0, NOW)).toBeNull();
		// Sur une liste commencée, la valeur pourrie ne colore aucune cellule et ne se ré-expose pas.
		const f = friseListeOrtho({ enCours: NaN }, 'en-cours', dansSemaine(4), NOW)!;
		expect(f.enCoursDepuis).toBeNull();
		expect(f.semaines).toEqual(rangee(['inconnu', 4], ['en-cours', 8]));
	});

	it('cap daté sur une liste « à découvrir » (parent qui a vidé sa liste) → frise quand même', () => {
		// Le `null` se juge sur le journal TEL QU'IL EST STOCKÉ : un cap daté prouve que la liste a
		// été travaillée, la ligne garde donc sa frise. Ce que l'état courant décide, c'est
		// seulement ce que la frise a le droit d'affirmer (cf. le plafonnement, describe suivant) :
		// ici plus rien n'est daté, et les semaines suivies portent l'état du jour.
		const f = friseListeOrtho({ acquis: dansSemaine(6) }, 'a-decouvrir', dansSemaine(-6), NOW)!;
		expect(f).not.toBeNull();
		expect(f.semaines).toEqual(rangee(['a-decouvrir', 12]));
		expect(f.acquisDepuis).toBeNull();
	});
});

/* ============================================================
   1 bis. La frise ne lit AUCUN cap que l'état courant ne porte plus
   ------------------------------------------------------------
   Le journal est monotone, l'état d'une liste ne l'est pas — et il peut redescendre par
   les deux caps :
   - « acquis » perdu : le parent ajoute un mot à une liste acquise ; ou, sans aucun
     changement de donnée, la voix de synthèse (chargée en asynchrone, cf. ui/tts.ts)
     réapparaît et remet la dictée au rang des modes requis ;
   - « en cours » perdu : le parent retire de la liste les mots déjà commencés et ne
     laisse que des mots neufs — la liste retombe à « à découvrir ».
   Dans les deux cas la frise sous-dit plutôt que d'afficher, à côté du mot de la ligne,
   une cellule qui le contredit : un lecteur ne distingue pas « prétention forte
   démentie » de « signal de recul admis », il voit une contradiction. Écart DÉLIBÉRÉ
   avec `friseNotion` : l'« acquis » d'une leçon repose sur l'étoile, qui ne se retire
   jamais, et sa première rencontre ne s'annule pas — aucun de ses caps ne peut être
   démenti.
   ============================================================ */
describe('friseListeOrtho — la frise ne lit aucun cap démenti par l’état courant', () => {
	it('liste acquise que l’état démentit : ni cellule « acquis », ni date d’acquisition', () => {
		// Le seul cap du journal est un « acquis » (la liste avait été terminée d'un coup, donc
		// aucun « en cours » n'a jamais été tamponné) et l'enfant a de nouveau des mots à
		// travailler : c'est l'état du jour qui tient lieu d'état des semaines suivies.
		const f = friseListeOrtho({ acquis: dansSemaine(4) }, 'en-cours', dansSemaine(-6), NOW)!;
		expect(f.semaines).toEqual(rangee(['en-cours', 12]));
		expect(f.semaines).not.toContain('acquis');
		expect(f.acquisDepuis).toBeNull(); // « depuis quand la liste EST acquise » : elle ne l'est plus
		// Rien n'est daté : la ligne n'annonce donc aucun franchissement récent.
		expect(aChangeRecemment(f)).toBe(false);
	});

	it('le « en cours » daté est lu tant que l’état le porte — acquis compris', () => {
		// Seul le cap démenti se tait : celui que l'état atteint encore continue de porter sa
		// trajectoire, sinon la frise perdrait le début de l'histoire à chaque redescente.
		const journal = { enCours: dansSemaine(3), acquis: dansSemaine(8) };
		const redescendue = friseListeOrtho(journal, 'en-cours', dansSemaine(-6), NOW)!;
		expect(redescendue.semaines).toEqual(rangee(['a-decouvrir', 3], ['en-cours', 9]));
		expect(redescendue.enCoursDepuis).toBe(dansSemaine(3));
		expect(redescendue.acquisDepuis).toBeNull();
		// Et l'état haut lit bien les deux caps.
		const acquise = friseListeOrtho(journal, 'acquis', dansSemaine(-6), NOW)!;
		expect(acquise.semaines).toEqual(rangee(['a-decouvrir', 3], ['en-cours', 5], ['acquis', 4]));
	});

	it('liste commencée puis VIDÉE de ses mots commencés : douze semaines « à découvrir »', () => {
		// Le second chemin de redescente, celui qui touche le cap « en cours » : le parent retire
		// les mots travaillés et ne laisse que des mots neufs. La ligne dit « à découvrir » ; la
		// frise ne peut pas finir sur « en cours » juste à côté.
		const f = friseListeOrtho({ enCours: dansSemaine(6) }, 'a-decouvrir', dansSemaine(-6), NOW)!;
		expect(f).not.toBeNull(); // le cap stocké prouve le travail passé : la frise existe
		expect(f.semaines).toEqual(rangee(['a-decouvrir', 12]));
		expect(f.enCoursDepuis).toBeNull();
		expect(aChangeRecemment(f)).toBe(false); // plus rien de daté : aucun franchissement annoncé
	});

	it('BOUT EN BOUT : la liste vidée de ses mots commencés ne se contredit pas', () => {
		// Même chemin, mais par les vraies fonctions : la séance date le « en cours », puis le
		// parent réédite la liste en ne gardant que des mots neufs.
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien'], 1);
		journaliserPaliersOrtho(false, dansSemaine(4));
		expect(listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!.frise!.semaines).toEqual(
			rangee(['inconnu', 4], ['en-cours', 8]),
		);
		reediterListe(id, 'Semaine 1', ['avion', 'ours']); // les mots commencés sortent de la liste
		const ligne = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(ligne.niveau).toBe('a-decouvrir');
		expect(ligne.frise!.semaines).toEqual(rangee(['inconnu', 4], ['a-decouvrir', 8]));
		expect(ligne.frise!.enCoursDepuis).toBeNull();
	});

	it('le tampon n’est pas réécrit : l’acquis retrouvé rend sa date d’origine', () => {
		// Ce qui fait tenir le choix : la voix de synthèse peut manquer, revenir, remanquer. Si le
		// plafonnement effaçait le tampon, la date d'acquisition sauterait au gré de la
		// disponibilité de la voix — un « acquise le … » qui bouge tout seul.
		const journal = { acquis: dansSemaine(4) };
		expect(friseListeOrtho(journal, 'en-cours', dansSemaine(-6), NOW)!.acquisDepuis).toBeNull();
		expect(friseListeOrtho(journal, 'acquis', dansSemaine(-6), NOW)!.acquisDepuis).toBe(
			dansSemaine(4),
		);
		expect(journal).toEqual({ acquis: dansSemaine(4) }); // pur : le journal reçu est intact
	});

	it('ÉCART ASSUMÉ avec une leçon : mêmes entrées, la leçon garde son cap', () => {
		// Une leçon étoilée ne se désétoile pas : son « acquis » ne peut pas être démenti, donc
		// friseNotion n'a aucune raison de plafonner — et ne doit pas se mettre à le faire (la
		// frise d'une leçon montre le plus haut état ATTEINT, l'UI mettant le recul en regard).
		const journal = { acquis: dansSemaine(6) };
		const lecon = friseNotion(journal, undefined, 'en-cours', dansSemaine(-6), NOW)!;
		expect(lecon.acquisDepuis).toBe(dansSemaine(6));
		expect(lecon.semaines).toEqual(rangee(['inconnu', 6], ['acquis', 6]));
		const liste = friseListeOrtho(journal, 'en-cours', dansSemaine(-6), NOW)!;
		expect(liste.acquisDepuis).toBeNull();
		expect(liste.semaines).toEqual(rangee(['en-cours', 12]));
	});

	it('BOUT EN BOUT : la voix qui réapparaît ne fait pas mentir la ligne du parent', () => {
		// Le chemin réel : la liste est journalisée « acquise » sur un appareil sans voix, puis
		// l'espace encadrant est consulté avec la voix disponible — la dictée redevient un mode
		// requis, la liste repasse « en cours », et les deux canaux de la ligne (le mot et la
		// frise) doivent dire la même chose.
		const p = activeProfile();
		const id = creerListeMaitrisee('Semaine 1', ['chat']);
		journaliserPaliersOrtho(false, dansSemaine(5)); // séance sans voix : liste acquise
		const sansVoix = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(sansVoix.niveau).toBe('acquis');
		expect(sansVoix.frise!.semaines).toEqual(rangee(['inconnu', 5], ['acquis', 7]));
		const avecVoix = listesOrthoProfil(p, true, NOW).find((x) => x.id === id)!;
		expect(avecVoix.niveau).toBe('en-cours');
		expect(avecVoix.frise!.semaines).toEqual(rangee(['inconnu', 5], ['en-cours', 7]));
		expect(avecVoix.frise!.acquisDepuis).toBeNull();
	});
});

/* ============================================================
   2. La déduction propre aux listes
   ============================================================ */
describe('friseListeOrtho — les semaines suivies d’avant le premier cap', () => {
	it('avant le tampon « en cours », une semaine suivie valait « à découvrir »', () => {
		const f = friseListeOrtho({ enCours: dansSemaine(6) }, 'en-cours', dansSemaine(-6), NOW)!;
		expect(f.semaines).toEqual(rangee(['a-decouvrir', 6], ['en-cours', 6]));
		expect(f.semaines).not.toContain('inconnu'); // suivi de bout en bout : aucune ignorance
	});

	it('CONTRASTE avec une leçon : mêmes entrées, la leçon reste dans le doute', () => {
		// Une leçon dont le journal n'a vu qu'un cap peut avoir été travaillée sous les 40 %
		// avant : elle ne peut rien affirmer. Une liste, si — c'est ce qui justifie une fonction
		// à part plutôt qu'un appel à friseNotion.
		const paliers = { enCours: dansSemaine(6) };
		const borne = dansSemaine(-6);
		expect(friseNotion(paliers, undefined, 'en-cours', borne, NOW)!.semaines).toEqual(
			rangee(['inconnu', 6], ['en-cours', 6]),
		);
		expect(friseListeOrtho(paliers, 'en-cours', borne, NOW)!.semaines).toEqual(
			rangee(['a-decouvrir', 6], ['en-cours', 6]),
		);
	});

	it('les semaines d’AVANT la borne restent « inconnu », elles', () => {
		// Le creux existe donc toujours, mais il ne dit plus que « le journal ne tournait pas » —
		// jamais « on ne sait pas ce que l'enfant faisait alors qu'on l'observait ».
		const f = friseListeOrtho({ enCours: dansSemaine(6) }, 'en-cours', dansSemaine(3), NOW)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 3], ['a-decouvrir', 3], ['en-cours', 6]));
	});

	it('trajectoire complète : à découvrir, puis commencée, puis acquise', () => {
		const f = friseListeOrtho(
			{ enCours: dansSemaine(2), acquis: dansSemaine(8) },
			'acquis',
			dansSemaine(-6),
			NOW,
		)!;
		expect(f.semaines).toEqual(rangee(['a-decouvrir', 2], ['en-cours', 6], ['acquis', 4]));
		expect(f.enCoursDepuis).toBe(dansSemaine(2));
		expect(f.acquisDepuis).toBe(dansSemaine(8));
		expect(aChangeRecemment(f)).toBe(true);
	});

	it('liste acquise d’un coup : « à découvrir » jusqu’au tampon, sans « en cours » inventé', () => {
		const f = friseListeOrtho({ acquis: dansSemaine(5) }, 'acquis', dansSemaine(2), NOW)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 2], ['a-decouvrir', 3], ['acquis', 7]));
		expect(f.semaines).not.toContain('en-cours');
		expect(f.enCoursDepuis).toBeNull();
	});

	it('aucun cap daté : l’état courant tient depuis la borne (profil d’avant ce journal)', () => {
		// Une liste travaillée avant la mise en service : rien n'est monté sous l'œil du journal,
		// donc son état actuel est le seul qu'on puisse porter sur les semaines suivies.
		for (const niveau of ['en-cours', 'acquis'] as const) {
			const f = friseListeOrtho({}, niveau, dansSemaine(4), NOW)!;
			expect(f.semaines, niveau).toEqual(rangee(['inconnu', 4], [niveau, 8]));
			// Le passage du pointillé à la couleur ne date que le SUIVI : rien n'a bougé.
			expect(aChangeRecemment(f), niveau).toBe(false);
		}
	});

	it('ni borne ni cap → 12 cellules « inconnu », jamais un état par défaut', () => {
		const borne = debutSuiviPaliers(null, {}); // Infinity
		for (const niveau of ['en-cours', 'acquis'] as const)
			expect(friseListeOrtho({}, niveau, borne, NOW)!.semaines, niveau).toEqual(
				rangee(['inconnu', 12]),
			);
	});
});

/* ============================================================
   3. Bornes de semaine (mêmes règles que la frise d'une leçon)
   ============================================================ */
describe('friseListeOrtho — bornes de semaine', () => {
	const BORNE = dansSemaine(-6); // journal en service bien avant la fenêtre

	it('12 cellules, la DERNIÈRE est la semaine en cours', () => {
		const f = friseListeOrtho({ acquis: dansSemaine(11) }, 'acquis', BORNE, NOW)!;
		expect(f.semaines).toHaveLength(NB_SEMAINES);
		expect(f.semaines).toEqual(rangee(['a-decouvrir', 11], ['acquis', 1]));
	});

	it('un cap franchi le MERCREDI colore la semaine qui le contient, pas la suivante', () => {
		const f = friseListeOrtho({ enCours: dansSemaine(4, 2, 14) }, 'en-cours', BORNE, NOW)!;
		expect(f.semaines).toEqual(rangee(['a-decouvrir', 4], ['en-cours', 8]));
	});

	it('dimanche 23:59:59.999 → la semaine qui se termine ; lundi 00:00 → celle qui ouvre', () => {
		expect(friseListeOrtho({ enCours: finDe(4) - 1 }, 'en-cours', BORNE, NOW)!.semaines).toEqual(
			rangee(['a-decouvrir', 4], ['en-cours', 8]),
		);
		expect(friseListeOrtho({ enCours: finDe(4) }, 'en-cours', BORNE, NOW)!.semaines).toEqual(
			rangee(['a-decouvrir', 5], ['en-cours', 7]),
		);
	});

	it('cap ANTÉRIEUR à la fenêtre → toute la rangée porte déjà l’état', () => {
		const f = friseListeOrtho({ acquis: dansSemaine(-4) }, 'acquis', BORNE, NOW)!;
		expect(f.semaines).toEqual(rangee(['acquis', 12]));
		expect(aChangeRecemment(f)).toBe(false); // rangée plate : « ça n'a pas bougé »
	});

	it('la première cellule ne distingue pas « tout début de fenêtre » et « avant »', () => {
		for (const t of [lundiCellule(0), lundiCellule(0) - 1])
			expect(friseListeOrtho({ acquis: t }, 'acquis', BORNE, NOW)!.semaines).toEqual(
				rangee(['acquis', 12]),
			);
	});

	it('FENÊTRE GLISSANTE : une semaine plus tard, chaque cellule a reculé d’un cran', () => {
		// L'état d'une cellule ne dépend que de la FIN de sa semaine : un off-by-one dans
		// l'indexation se voit ici et nulle part ailleurs.
		const journaux: [PaliersNotion, NiveauNotion][] = [
			[{}, 'en-cours'],
			[{ enCours: dansSemaine(4) }, 'en-cours'],
			[{ enCours: dansSemaine(2), acquis: dansSemaine(9) }, 'acquis'],
			[{ acquis: dansSemaine(11) }, 'acquis'],
			[{ enCours: dansSemaine(-2) }, 'en-cours'],
		];
		for (const [paliers, niveau] of journaux) {
			const borne = dansSemaine(1);
			const avant = friseListeOrtho(paliers, niveau, borne, NOW)!;
			const apres = friseListeOrtho(paliers, niveau, borne, joursApres(NOW, 7))!;
			expect(apres.semaines.slice(0, NB_SEMAINES - 1), JSON.stringify(paliers)).toEqual(
				avant.semaines.slice(1),
			);
		}
	});
});

/* ============================================================
   4. Invariants, sur tous les journaux (incohérents compris)
   ============================================================ */
const CAPS_EN_COURS = [
	null,
	dansSemaine(-3),
	finDe(2) - 1,
	finDe(2),
	dansSemaine(5),
	dansSemaine(11),
];
const CAPS_ACQUIS = [
	null,
	dansSemaine(-3),
	finDe(2),
	dansSemaine(6),
	dansSemaine(8),
	dansSemaine(11),
];
const BORNES = [Infinity, 0, dansSemaine(-8), lundiCellule(0), finDe(3), dansSemaine(2), NOW];

interface Cas {
	enCours: number | null;
	acquis: number | null;
	borne: number;
	niveau: NiveauNotion;
	etiquette: string;
}
function* tousLesCas(): Generator<Cas> {
	for (const enCours of CAPS_EN_COURS)
		for (const acquis of CAPS_ACQUIS)
			for (const borne of BORNES)
				for (const niveau of ECHELLE_LISTE)
					yield {
						enCours,
						acquis,
						borne,
						niveau,
						etiquette: `enCours=${enCours} acquis=${acquis} borne=${borne} niveau=${niveau}`,
					};
}
function frise(c: Cas) {
	const paliers: PaliersNotion = {};
	if (c.enCours !== null) paliers.enCours = c.enCours;
	if (c.acquis !== null) paliers.acquis = c.acquis;
	return friseListeOrtho(paliers, c.niveau, c.borne, NOW);
}

describe('friseListeOrtho — INVARIANTS sur tous les journaux', () => {
	it('null si et seulement si la liste n’a jamais été commencée', () => {
		let cas = 0;
		for (const c of tousLesCas()) {
			const jamais = c.niveau === 'a-decouvrir' && c.enCours === null && c.acquis === null;
			expect(frise(c) === null, c.etiquette).toBe(jamais);
			cas++;
		}
		expect(cas).toBeGreaterThan(700); // l'énumération n'a pas été vidée
	});

	it('AUCUNE cellule « à renforcer » : l’échelle des listes ne l’a pas', () => {
		// Le plancher d'une liste vient soit de son état courant (3 valeurs), soit de la
		// déduction « à découvrir » : un « à renforcer » ne pourrait venir que d'une fuite de
		// l'échelle des leçons, et le parent lirait un état que l'appli ne sait pas mesurer.
		for (const c of tousLesCas())
			expect(frise(c)?.semaines ?? [], c.etiquette).not.toContain('non-acquis');
	});

	it('« inconnu » forme un préfixe, et disparaît dès la borne de suivi', () => {
		// La différence de fond avec une leçon : passé la borne, une liste n'a plus de trou.
		for (const c of tousLesCas()) {
			const f = frise(c);
			if (f === null) continue;
			const premierConnu = f.semaines.findIndex((x) => x !== 'inconnu');
			const prefixe = premierConnu === -1 ? NB_SEMAINES : premierConnu;
			expect(f.semaines.slice(prefixe), c.etiquette).not.toContain('inconnu');
			for (let i = 0; i < NB_SEMAINES; i++)
				if (lundiCellule(i + 1) > c.borne)
					expect(f.semaines[i], `${c.etiquette} — cellule ${i} (suivie)`).not.toBe('inconnu');
		}
	});

	it('la frise ne redescend JAMAIS d’une cellule à la suivante', () => {
		for (const c of tousLesCas()) {
			const f = frise(c);
			if (f === null) continue;
			for (let i = 1; i < f.semaines.length; i++)
				expect(rang(f.semaines[i]), `${c.etiquette} — cellule ${i}`).toBeGreaterThanOrEqual(
					rang(f.semaines[i - 1]),
				);
		}
	});

	it('la dernière cellule ne descend jamais sous l’état courant de la ligne', () => {
		// Sinon la ligne annoncerait « acquise » en texte au-dessus d'une frise qui finit plus
		// bas. 'inconnu' est admis : il n'affirme rien. Restriction : quand l'état courant dépasse
		// le plus haut cap daté, la frise n'a AUCUNE date pour le porter et sous-dit
		// délibérément — cas réel depuis le plafonnement (liste journalisée « en cours » sur un
		// appareil équipé d'une voix, consultée depuis un appareil qui n'en a pas, donc acquise).
		let verifies = 0;
		for (const c of tousLesCas()) {
			const plusHaut: NiveauNotion | null =
				c.acquis !== null ? 'acquis' : c.enCours !== null ? 'en-cours' : null;
			if (plusHaut !== null && RANG[c.niveau] > RANG[plusHaut]) continue;
			const f = frise(c);
			if (f === null) continue;
			const derniere = f.semaines[NB_SEMAINES - 1];
			expect(
				derniere === 'inconnu' || rang(derniere) >= RANG[c.niveau],
				`${c.etiquette} — dernière cellule ${derniere}`,
			).toBe(true);
			verifies++;
		}
		expect(verifies).toBeGreaterThan(300);
	});

	it('les horodatages ré-exposés : AUCUN cap que l’état courant ne porte plus', () => {
		// L'UI date les caps avec ces deux valeurs, et chacune répond « depuis quand la liste EST
		// dans cet état » : elle se tait dès que l'état courant est retombé en dessous, sans quoi
		// la ligne afficherait « acquise le … » à côté d'un mot disant « en cours », ou
		// « commencée le … » à côté d'« à découvrir ». Une seule règle pour les deux caps : le
		// tampon se lit tant que l'état courant atteint AU MOINS le cap qu'il date.
		let plafonnes = 0;
		for (const c of tousLesCas()) {
			const f = frise(c);
			if (f === null) continue;
			const lu = (cap: number | null, etat: NiveauNotion) =>
				cap !== null && RANG[c.niveau] >= RANG[etat] ? cap : null;
			expect(f.enCoursDepuis, c.etiquette).toBe(lu(c.enCours, 'en-cours'));
			expect(f.acquisDepuis, c.etiquette).toBe(lu(c.acquis, 'acquis'));
			if (f.enCoursDepuis !== c.enCours || f.acquisDepuis !== c.acquis) plafonnes++;
		}
		expect(plafonnes).toBeGreaterThan(100); // le cas plafonné est bien parcouru
	});

	it('AUCUNE cellule au-dessus de l’état courant, quel que soit le journal', () => {
		// Corollaire visuel de la même règle, et l'invariant qui la résume : le mot de la ligne et
		// la dernière cellule sont côte à côte, un lecteur ne peut pas les voir se contredire —
		// peu importe que le cap démenti soit « acquis » (prétention forte) ou « en cours ». Une
		// cellule PLUS BASSE reste admise : c'est le passé, et 'inconnu' n'affirme rien.
		let hautes = 0;
		for (const c of tousLesCas()) {
			const f = frise(c);
			if (f === null) continue;
			for (const [i, cellule] of f.semaines.entries())
				expect(rang(cellule), `${c.etiquette} — cellule ${i} = ${cellule}`).toBeLessThanOrEqual(
					RANG[c.niveau],
				);
			// Non creux : la dernière cellule atteint effectivement l'état courant dès qu'une
			// donnée le porte (sinon l'invariant serait satisfait par une frise toujours vide).
			if (rang(f.semaines[NB_SEMAINES - 1]) === RANG[c.niveau]) hautes++;
		}
		expect(hautes).toBeGreaterThan(100);
	});
});

/* ============================================================
   5. Branchement dans listesOrthoProfil
   ============================================================ */
function ecrire(uuid: string, key: string, valeur: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(valeur));
}
function poserEntame(m: MotOrtho): void {
	m.atelierFait = true; // atelier fait, aucun mode validé → liste « en cours »
	m.validation = { tuiles: false, motCache: false, dictee: false };
}
/** Crée une liste dans le profil ACTIF ; `entames` = nombre de mots entamés. */
function creerListe(label: string, mots: string[], entames = 0): string {
	const s = loadOrtho();
	const l = createListe(
		s,
		label,
		mots.map((mot) => ({ mot })),
	);
	l.motIds.slice(0, entames).forEach((id) => poserEntame(s.banque[id]));
	saveOrtho(s);
	return l.id;
}
/** Le parent réédite sa liste depuis l'espace encadrant (même API que l'éditeur) : les mots
    qui n'y figurent plus sortent de la liste, leur état restant en banque. */
function reediterListe(listeId: string, label: string, mots: string[]): void {
	const s = loadOrtho();
	expect(
		updateListe(
			s,
			listeId,
			label,
			mots.map((mot) => ({ mot })),
		),
	).not.toBeNull();
	saveOrtho(s);
}
/** Liste dont tous les mots sont travaillés en tuiles + mot caché, SANS la dictée : acquise
    tant qu'aucune voix de synthèse n'est disponible, « en cours » dès qu'il y en a une. */
function creerListeMaitrisee(label: string, mots: string[]): string {
	const s = loadOrtho();
	const l = createListe(
		s,
		label,
		mots.map((mot) => ({ mot })),
	);
	l.motIds.forEach((id) => {
		s.banque[id].atelierFait = true;
		s.banque[id].validation = { tuiles: true, motCache: true, dictee: false };
	});
	saveOrtho(s);
	return l.id;
}

describe('listesOrthoProfil — la frise arrive sur la ligne de la liste', () => {
	it('liste jamais commencée → frise absente (rien à tracer, pas une rangée vide)', () => {
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien']);
		ecrire(p.uuid, ORTHO_PALIERS_DEBUT_KEY, dansSemaine(2));
		const r = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(r.niveau).toBe('a-decouvrir');
		expect(r.frise).toBeNull();
	});

	it('liste commencée : la frise lit le journal ET la borne PROPRES aux dictées', () => {
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien'], 1);
		ecrire(p.uuid, ORTHO_PALIERS_KEY, { [id]: { enCours: dansSemaine(6) } });
		ecrire(p.uuid, ORTHO_PALIERS_DEBUT_KEY, dansSemaine(3));
		const r = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(r.frise!.semaines).toEqual(rangee(['inconnu', 3], ['a-decouvrir', 3], ['en-cours', 6]));
		expect(r.frise!.enCoursDepuis).toBe(dansSemaine(6));
		expect(r.frise).toEqual(
			friseListeOrtho({ enCours: dansSemaine(6) }, 'en-cours', dansSemaine(3), NOW),
		);
	});

	it('la borne des LEÇONS n’éclaire aucune semaine de dictée', () => {
		// Elle est posée par toute session finalisée, dictée comprise (#540) : s'en servir ferait
		// affirmer des semaines pendant lesquelles ce journal-ci ne tournait pas encore.
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien'], 1);
		ecrire(p.uuid, PALIERS_DEBUT_KEY, dansSemaine(1)); // le suivi des leçons, lui, est ancien
		const r = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(r.frise!.semaines).toEqual(rangee(['inconnu', 12]));
	});

	it('borne COMMUNE au profil : un cap ancien sur une liste éclaire les autres', () => {
		// Deux lignes voisines ne doivent pas s'afficher selon deux règles. Le cap ancien PROUVE
		// que le journal tournait, même si la borne stockée est arrivée plus tard.
		const p = activeProfile();
		const ancienne = creerListe('Ancienne', ['chat'], 1);
		const autre = creerListe('Autre', ['avion', 'chien'], 1);
		ecrire(p.uuid, ORTHO_PALIERS_KEY, { [ancienne]: { enCours: dansSemaine(-6) } });
		ecrire(p.uuid, ORTHO_PALIERS_DEBUT_KEY, dansSemaine(9)); // borne tardive
		const lignes = listesOrthoProfil(p, false, NOW);
		expect(lignes.find((x) => x.id === ancienne)!.frise!.semaines).toEqual(
			rangee(['en-cours', 12]),
		);
		// Sans la borne commune, cette liste-là serait « inconnue » jusqu'à la semaine 9.
		expect(lignes.find((x) => x.id === autre)!.frise!.semaines).toEqual(rangee(['en-cours', 12]));
	});

	it('`now` injecté : la fenêtre glisse avec lui', () => {
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien'], 1);
		ecrire(p.uuid, ORTHO_PALIERS_KEY, { [id]: { enCours: dansSemaine(6) } });
		ecrire(p.uuid, ORTHO_PALIERS_DEBUT_KEY, dansSemaine(-6));
		const avant = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!.frise!;
		const apres = listesOrthoProfil(p, false, joursApres(NOW, 7)).find((x) => x.id === id)!.frise!;
		expect(avant.semaines).toEqual(rangee(['a-decouvrir', 6], ['en-cours', 6]));
		expect(apres.semaines.slice(0, NB_SEMAINES - 1)).toEqual(avant.semaines.slice(1));
	});

	it('lecture par UUID : le profil consulté n’est pas l’actif, et rien ne bascule', () => {
		const a = activeProfile();
		const id = creerListe('Liste de A', ['chat', 'chien'], 1);
		ecrire(a.uuid, ORTHO_PALIERS_KEY, { [id]: { enCours: dansSemaine(6) } });
		ecrire(a.uuid, ORTHO_PALIERS_DEBUT_KEY, dansSemaine(-6));
		addProfile('Cadette'); // devient actif, journal vierge
		const r = listesOrthoProfil(a, false, NOW).find((x) => x.id === id)!;
		expect(r.frise!.semaines).toEqual(rangee(['a-decouvrir', 6], ['en-cours', 6]));
		expect(activeProfile().name).toBe('Cadette');
		expect(listesOrthoProfil(activeProfile(), false, NOW)).toEqual([]);
	});

	it('BOUT EN BOUT : la séance journalise, la ligne affiche la trajectoire', () => {
		// Le seul chemin qui compte pour le parent : une dictée finit, et la frise de la liste
		// existe. La séance pose sa borne et sa marche au même instant, donc les semaines
		// antérieures restent inconnues et celle de la séance porte déjà « commencée ».
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien'], 1);
		journaliserPaliersOrtho(false, dansSemaine(6));
		const r = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(r.frise!.semaines).toEqual(rangee(['inconnu', 6], ['en-cours', 6]));
		expect(r.frise!.enCoursDepuis).toBe(dansSemaine(6));
		expect(aChangeRecemment(r.frise)).toBe(true); // un cap franchi sous l'œil du journal
	});

	it('BOUT EN BOUT : une liste terminée porte sa marche « acquise » la semaine venue', () => {
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien'], 2); // les deux mots entamés
		journaliserPaliersOrtho(false, dansSemaine(4));
		const s = loadOrtho();
		s.listes
			.find((l) => l.id === id)!
			.motIds.forEach((mid) => {
				s.banque[mid].validation = { tuiles: true, motCache: true, dictee: true };
			});
		saveOrtho(s);
		journaliserPaliersOrtho(false, dansSemaine(9));
		const r = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(r.niveau).toBe('acquis');
		expect(r.frise!.semaines).toEqual(rangee(['inconnu', 4], ['en-cours', 5], ['acquis', 3]));
	});
});
