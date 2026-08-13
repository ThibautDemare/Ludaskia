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

   Et quand AUCUNE semaine n'est déductible, la frise n'est pas dessinée du tout (`null`,
   comme pour une leçon) : douze blocs creux côte à côte se liraient comme un défaut
   d'affichage. La ligne retombe alors sur sa puce d'état et son mot.

   D'où l'AMORÇAGE (`premieresSeancesDictee` + 5e paramètre) : le graphe d'activité garde
   des séances datées PAR LISTE, donnée déjà stockée qui prouve qu'à cette date la liste
   était commencée. Sans elle, un enfant qui fait des dictées depuis des mois n'aurait
   aucune frise avant sa prochaine séance. Ce que l'amorce ne fait pas : dater une
   ACQUISITION — rien dans le stockage ne le permet, donc une liste maîtrisée avant ce
   journal reste sans frise jusqu'à sa prochaine séance.

   Ce que ces tests ne recopient PAS : la grille de semaines est une arithmétique de
   calendrier écrite ici (pas `lundiDecale`), les attendus sont posés en RUNS de cellules
   à la main, et le contraste avec une leçon est vérifié en confrontant les deux
   fonctions sur les MÊMES entrées.
   ============================================================ */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { initProfiles, activeProfile, addProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsSetRaw, lsGet } from '../src/core/storage';
import {
	ACTIVITY_KEY,
	PALIERS_DEBUT_KEY,
	recordSessionActivity,
	type PaliersNotion,
} from '../src/core/progress';
import {
	friseListeOrtho,
	friseNotion,
	aChangeRecemment,
	debutSuiviPaliers,
	premieresSeancesDictee,
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

/* Geste daté à un instant FIGÉ : une vraie fin de séance lit l'horloge, or les attendus d'ici
   sont ancrés sur NOW (12 août 2026). Pattern de frise-etats.test.ts. */
function auMoment<T>(t: number, geste: () => T): T {
	const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
	try {
		return geste();
	} finally {
		spy.mockRestore();
	}
}

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

	it('ni borne ni cap → AUCUNE frise, et surtout jamais un état par défaut', () => {
		// Ce qui est proscrit, c'est une rangée PEINTE que rien n'affirme : douze cellules
		// « en cours » sur la seule foi de l'état du jour. Le silence est une réponse acceptable —
		// il n'affirme rien, la ligne garde sa puce et son mot. Et le cas n'est pas théorique :
		// c'est l'état de TOUTES les listes d'un profil existant le jour où ce journal arrive.
		const borne = debutSuiviPaliers(null, {}); // Infinity
		for (const niveau of ['en-cours', 'acquis'] as const)
			expect(friseListeOrtho({}, niveau, borne, NOW), niveau).toBeNull();
		// Elle apparaît le jour où UNE semaine se déduit : la borne posée par la 1re séance.
		expect(friseListeOrtho({}, 'en-cours', dansSemaine(11), NOW)!.semaines).toEqual(
			rangee(['inconnu', 11], ['en-cours', 1]),
		);
	});
});

/* ============================================================
   2 bis. premieresSeancesDictee — ce que le graphe d'activité sait dire
   ------------------------------------------------------------
   Le journal d'activité date chaque séance finalisée et porte une CIBLE quand la séance
   n'en a qu'une (`{k:'dictee', ref}`, #498). La plus ANCIENNE séance d'une liste est la
   seule date que le stockage possède sur son passé : ce qu'on en extrait doit donc être
   exactement ça — pas la dernière, pas une séance d'un autre type, pas une séance sans
   cible (le runner n'en pose pas quand la liste jouée est inconnue).
   ============================================================ */
describe('premieresSeancesDictee (amorce tirée du graphe d’activité)', () => {
	it('la PLUS ANCIENNE séance de chaque liste, indépendamment de l’ordre du journal', () => {
		const m = premieresSeancesDictee([
			{ t: dansSemaine(8), k: 'dictee', ref: 'liste-a' },
			{ t: dansSemaine(3), k: 'dictee', ref: 'liste-a' }, // plus ancienne, écrite après
			{ t: dansSemaine(6), k: 'dictee', ref: 'liste-b' },
			{ t: dansSemaine(10), k: 'dictee', ref: 'liste-a' },
		]);
		expect(m.get('liste-a')).toBe(dansSemaine(3));
		expect(m.get('liste-b')).toBe(dansSemaine(6));
		expect(m.size).toBe(2);
	});

	it('les séances d’un AUTRE type n’amorcent personne, même avec une cible', () => {
		// La révision espacée rejoue des mots de plusieurs origines : son entrée ne porte aucune
		// cible (cf. progress.ts), mais une cible sur un autre type ne prouverait rien non plus de
		// ce qu'une LISTE a travaillé.
		const m = premieresSeancesDictee([
			{ t: dansSemaine(2), k: 'revision' },
			{ t: dansSemaine(2), k: 'revision', ref: 'liste-a' },
			{ t: dansSemaine(3), k: 'lecon', ref: 'liste-a' },
			{ t: dansSemaine(4), k: 'bilan' },
			{ t: dansSemaine(5), k: 'sprint' },
			{ t: dansSemaine(7), k: 'dictee', ref: 'liste-a' }, // la seule qui compte
		]);
		expect(m).toEqual(new Map([['liste-a', dansSemaine(7)]]));
	});

	it('une dictée SANS cible n’amorce personne (liste inconnue du runner)', () => {
		expect(premieresSeancesDictee([{ t: dansSemaine(4), k: 'dictee' }])).toEqual(new Map());
		expect(premieresSeancesDictee([{ t: dansSemaine(4), k: 'dictee', ref: '' }])).toEqual(
			new Map(),
		);
	});

	it('ANCIEN format (horodatages nus) et journal illisible → aucune amorce, aucune erreur', () => {
		// Le journal d'avant #319 ne stockait que des nombres : aucun type, aucune cible.
		expect(premieresSeancesDictee([dansSemaine(2), dansSemaine(5)])).toEqual(new Map());
		for (const brutJournal of [undefined, null, {}, 'nope', [null, 42, { k: 'dictee' }]])
			expect(premieresSeancesDictee(brutJournal), String(brutJournal)).toEqual(new Map());
	});

	it('journal réel, écrit par les vraies fonctions', () => {
		auMoment(dansSemaine(3), () => recordSessionActivity('dictee', 'liste-a'));
		auMoment(dansSemaine(6), () => recordSessionActivity('dictee', 'liste-a'));
		auMoment(dansSemaine(7), () => recordSessionActivity('revision')); // sans cible, par nature
		const m = premieresSeancesDictee(lsGet(ACTIVITY_KEY, []));
		expect(m).toEqual(new Map([['liste-a', dansSemaine(3)]]));
	});
});

/* ============================================================
   2 ter. Amorçage de la frise par la première séance datée
   ============================================================ */
describe('friseListeOrtho — amorçage par la première séance datée', () => {
	it('LE CAS RÉEL : des séances datées, aucun journal, aucune borne → une frise quand même', () => {
		// Profil existant le jour où ce journal arrive : rien n'est tamponné, aucune borne n'est
		// posée, donc aucune semaine ne serait déductible et la ligne n'aurait pas de frise. La
		// séance datée dit qu'à cette semaine-là la liste était commencée.
		const sansAmorce = friseListeOrtho({}, 'en-cours', Infinity, NOW);
		expect(sansAmorce).toBeNull(); // prémisse : sans l'amorce, rien à dessiner
		const f = friseListeOrtho({}, 'en-cours', Infinity, NOW, dansSemaine(4))!;
		expect(f.semaines).toEqual(rangee(['inconnu', 4], ['en-cours', 8]));
		// Avant la séance, la séance ne prouve rien : ces semaines restent « inconnu » et ne
		// deviennent PAS « à découvrir » — la liste a pu être travaillée bien avant.
		expect(f.semaines.slice(0, 4)).not.toContain('a-decouvrir');
		// La date de la séance est la meilleure réponse connue à « commencée quand ? ».
		expect(f.enCoursDepuis).toBe(dansSemaine(4));
		expect(f.acquisDepuis).toBeNull();
	});

	it('NON-RÉGRESSION : un tampon récent n’efface pas une amorce plus ancienne', () => {
		// La première séance jouée sur la nouvelle version pose la borne ET le tampon « en cours »
		// au MÊME instant : sans amorce, les semaines travaillées avant ne repassent donc pas
		// « à découvrir », elles restent creuses. Le recul provoqué par la mise à jour n'est pas un
		// faux état, c'est une histoire perdue — et c'est ce que l'amorce rend.
		const journal = { enCours: dansSemaine(9) };
		const sansAmorce = friseListeOrtho(journal, 'en-cours', dansSemaine(9), NOW)!;
		expect(sansAmorce.semaines).toEqual(rangee(['inconnu', 9], ['en-cours', 3]));
		const f = friseListeOrtho(journal, 'en-cours', dansSemaine(9), NOW, dansSemaine(2))!;
		expect(f.semaines).toEqual(rangee(['inconnu', 2], ['en-cours', 10]));
		expect(f.enCoursDepuis).toBe(dansSemaine(2));
	});

	it('un tampon PLUS ANCIEN que la séance reste le début de l’histoire', () => {
		// L'amorce ne sert que de repli : elle ne doit pas repousser un début déjà daté, sinon la
		// frise perdrait les semaines qui séparent le tampon de la première séance retrouvée.
		const f = friseListeOrtho(
			{ enCours: dansSemaine(2) },
			'en-cours',
			dansSemaine(2),
			NOW,
			dansSemaine(7),
		)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 2], ['en-cours', 10]));
		expect(f.enCoursDepuis).toBe(dansSemaine(2));
	});

	it('l’amorce fournit la phase « commencée » qu’un journal parti d’« acquis » n’a pas', () => {
		// Liste terminée d'un coup sur la nouvelle version (« acquis » tamponné, jamais
		// « en cours ») mais travaillée depuis des semaines : l'amorce raconte le début.
		const f = friseListeOrtho(
			{ acquis: dansSemaine(9) },
			'acquis',
			dansSemaine(9),
			NOW,
			dansSemaine(4),
		)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 4], ['en-cours', 5], ['acquis', 3]));
		expect(f.enCoursDepuis).toBe(dansSemaine(4));
		expect(f.acquisDepuis).toBe(dansSemaine(9));
	});

	it('une séance POSTÉRIEURE à l’acquis daté est écartée : pas de date qui remonte le temps', () => {
		// Chemin réel : un tour de révision espacée fait franchir « acquis » à la liste et le
		// tamponne (revision.ts journalise), mais son entrée d'activité ne réfère aucune cible —
		// aucun « en cours » n'est donc daté. La première dictée venue est alors POSTÉRIEURE à
		// l'acquisition : l'installer comme début rendrait le couple (commencée, acquise) non
		// monotone, la même donnée fausse en attente d'un lecteur que le journal s'interdit.
		const f = friseListeOrtho(
			{ acquis: dansSemaine(4) },
			'acquis',
			dansSemaine(4),
			NOW,
			dansSemaine(9),
		)!;
		expect(f.enCoursDepuis).toBeNull(); // l'amorce est écartée, pas repositionnée
		expect(f.acquisDepuis).toBe(dansSemaine(4));
		expect(f.semaines).toEqual(rangee(['inconnu', 4], ['acquis', 8]));
		expect(f.semaines).not.toContain('en-cours');
		// La même séance, ANTÉRIEURE à l'acquis, amorce bien (c'est le cas voisin).
		const amorcee = friseListeOrtho(
			{ acquis: dansSemaine(9) },
			'acquis',
			dansSemaine(9),
			NOW,
			dansSemaine(4),
		)!;
		expect(amorcee.enCoursDepuis).toBe(dansSemaine(4));
	});

	it('AUCUNE acquisition inventée : liste maîtrisée avant ce journal → pas de frise', () => {
		// Rien dans le stockage ne date une acquisition. Peindre « acquise » depuis la séance
		// choisirait une semaine au hasard ; amorcer « en cours » sous un mot disant « acquise »
		// ferait finir la rangée en dessous de l'état de la ligne. Donc on se tait, jusqu'à la
		// prochaine séance qui, elle, datera le cap pour de bon.
		expect(friseListeOrtho({}, 'acquis', Infinity, NOW, dansSemaine(4))).toBeNull();
		expect(friseListeOrtho(undefined, 'acquis', Infinity, NOW, dansSemaine(-5))).toBeNull();
	});

	it('liste jamais commencée : une séance datée ne la ressuscite pas', () => {
		// Le parent a vidé la liste de ses mots travaillés : elle est « à découvrir » aujourd'hui.
		// Une séance passée ne peut pas lui rendre une trajectoire que son état démentirait.
		expect(friseListeOrtho({}, 'a-decouvrir', Infinity, NOW, dansSemaine(4))).toBeNull();
		expect(
			friseListeOrtho(undefined, 'a-decouvrir', dansSemaine(2), NOW, dansSemaine(4)),
		).toBeNull();
	});

	it('l’amorce ne franchit pas le PLAFONNEMENT : un cap démenti reste muet', () => {
		// Liste commencée puis vidée (« en cours » tamponné, état retombé à « à découvrir ») : le
		// cap est plafonné, et l'amorce ne doit pas le rétablir par la bande.
		const f = friseListeOrtho(
			{ enCours: dansSemaine(6) },
			'a-decouvrir',
			dansSemaine(-6),
			NOW,
			dansSemaine(2),
		)!;
		expect(f.semaines).toEqual(rangee(['a-decouvrir', 12]));
		expect(f.enCoursDepuis).toBeNull();
	});

	it('une séance dans la semaine EN COURS amorce la dernière cellule seulement', () => {
		const f = friseListeOrtho({}, 'en-cours', Infinity, NOW, dansSemaine(11))!;
		expect(f.semaines).toEqual(rangee(['inconnu', 11], ['en-cours', 1]));
	});

	it('une séance ANTÉRIEURE à la fenêtre remplit toute la rangée', () => {
		const f = friseListeOrtho({}, 'en-cours', Infinity, NOW, dansSemaine(-5))!;
		expect(f.semaines).toEqual(rangee(['en-cours', 12]));
		expect(aChangeRecemment(f)).toBe(false); // rangée plate : rien n'a bougé sous les yeux
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
/* Première séance datée de la liste (amorce), la plus ancienne du graphe d'activité : absente,
   antérieure à la fenêtre, au milieu, et postérieure aux caps du journal. */
const SEANCES = [null, dansSemaine(-5), dansSemaine(3), dansSemaine(9)];

interface Cas {
	enCours: number | null;
	acquis: number | null;
	borne: number;
	niveau: NiveauNotion;
	seance: number | null;
	etiquette: string;
}
function* tousLesCas(): Generator<Cas> {
	for (const enCours of CAPS_EN_COURS)
		for (const acquis of CAPS_ACQUIS)
			for (const borne of BORNES)
				for (const niveau of ECHELLE_LISTE)
					for (const seance of SEANCES)
						yield {
							enCours,
							acquis,
							borne,
							niveau,
							seance,
							etiquette: `enCours=${enCours} acquis=${acquis} borne=${borne} niveau=${niveau} seance=${seance}`,
						};
}
function frise(c: Cas) {
	const paliers: PaliersNotion = {};
	if (c.enCours !== null) paliers.enCours = c.enCours;
	if (c.acquis !== null) paliers.acquis = c.acquis;
	return friseListeOrtho(paliers, c.niveau, c.borne, NOW, c.seance);
}
/* Ce que la frise DOIT lire, dérivé des deux règles du contrat — plafonnement par l'état courant,
   puis amorçage par la séance — et non de la cascade de cellules. Plusieurs invariants en ont
   besoin (la borne effective d'une ligne amorcée n'est plus celle du profil), d'où un seul endroit
   pour l'écrire. */
function lecture(c: Cas) {
	const capLu = (cap: number | null, etat: NiveauNotion) =>
		cap !== null && RANG[c.niveau] >= RANG[etat] ? cap : null;
	const acquis = capLu(c.acquis, 'acquis');
	const enCoursStocke = capLu(c.enCours, 'en-cours');
	// L'amorce ne vaut que si le sommet de la rangée atteindra l'état courant (jamais d'acquisition
	// datée par une séance), et seulement si elle est PLUS ANCIENNE que tout cap déjà daté —
	// `acquis` compris, sans quoi le couple (commencée, acquise) sortirait non monotone.
	const sommetAtteignable = c.niveau === 'en-cours' || (c.niveau === 'acquis' && acquis !== null);
	const plusAncienneQueTout =
		c.seance !== null &&
		(enCoursStocke === null || c.seance < enCoursStocke) &&
		(acquis === null || c.seance < acquis);
	const amorce = sommetAtteignable && plusAncienneQueTout ? c.seance : null;
	return { acquis, enCours: amorce ?? enCoursStocke, borne: amorce ?? c.borne, amorce };
}

describe('friseListeOrtho — INVARIANTS sur tous les journaux', () => {
	it('null pour DEUX motifs qu’on tient séparés : jamais commencée, ou rien de déductible', () => {
		// Prémisses de l'énumération, qui rendent le second motif calculable sans rejouer la
		// cascade du code : ni borne, ni cap, ni séance n'y est postérieur à aujourd'hui — une mise
		// en service à VENIR rendrait elle aussi toute la fenêtre inconnue.
		expect(BORNES.every((b) => b === Infinity || b <= NOW)).toBe(true);
		expect(
			[...CAPS_EN_COURS, ...CAPS_ACQUIS, ...SEANCES].every((t) => t === null || t <= NOW),
		).toBe(true);
		let cas = 0;
		let jamaisHorsPorteeDuSecond = 0;
		let muettes = 0;
		let amorcees = 0;
		for (const c of tousLesCas()) {
			// Motif 1 — jamais commencée : jugé sur le journal TEL QU'IL EST STOCKÉ, plafonnement et
			// amorce compris (un cap démenti par l'état courant prouve quand même le travail passé,
			// et une séance ne rend pas sa trajectoire à une liste que son état démentirait).
			const jamaisCommencee = c.niveau === 'a-decouvrir' && c.enCours === null && c.acquis === null;
			// Motif 2 — aucune semaine déductible : rien qui SITUE une semaine dans le suivi, ni
			// borne exploitable (Infinity), ni cap LU, ni amorce. Ce sont bien les caps lus : un cap
			// que l'état courant ne porte plus ne situe plus aucune semaine. D'où des listes qui
			// gardent une trace au journal sans qu'on puisse rien en déduire.
			const lu = lecture(c);
			const rienDeDeductible = lu.borne === Infinity && lu.enCours === null && lu.acquis === null;
			expect(frise(c) === null, c.etiquette).toBe(jamaisCommencee || rienDeDeductible);
			if (jamaisCommencee && !rienDeDeductible) jamaisHorsPorteeDuSecond++;
			if (rienDeDeductible && !jamaisCommencee) muettes++;
			if (lu.amorce !== null) amorcees++;
			cas++;
		}
		expect(cas).toBeGreaterThan(2000); // l'énumération n'a pas été vidée
		// Les deux motifs sont peuplés, et le PREMIER est éprouvé LÀ OÙ le second ne s'applique
		// pas : une régression qui cesserait de taire les listes jamais commencées ne pourrait pas
		// se cacher derrière « rien de déductible ».
		expect(jamaisHorsPorteeDuSecond).toBeGreaterThan(4);
		expect(muettes).toBeGreaterThan(1);
		expect(amorcees).toBeGreaterThan(100); // et l'amorce est bien exercée
	});

	it('une frise DESSINÉE porte toujours au moins une semaine connue', () => {
		// Formulation directe du nouveau contrat, sans prédicat à dériver : ce qui est refusé,
		// c'est la rangée entièrement creuse.
		for (const c of tousLesCas()) {
			const f = frise(c);
			if (f === null) continue;
			expect(
				f.semaines.some((x) => x !== 'inconnu'),
				c.etiquette,
			).toBe(true);
		}
	});

	it('AUCUNE cellule « à renforcer » : l’échelle des listes ne l’a pas', () => {
		// Le plancher d'une liste vient soit de son état courant (3 valeurs), soit de la
		// déduction « à découvrir » : un « à renforcer » ne pourrait venir que d'une fuite de
		// l'échelle des leçons, et le parent lirait un état que l'appli ne sait pas mesurer.
		for (const c of tousLesCas())
			expect(frise(c)?.semaines ?? [], c.etiquette).not.toContain('non-acquis');
	});

	it('« inconnu » forme un préfixe, et disparaît dès la borne de suivi', () => {
		// La différence de fond avec une leçon : passé la borne, une liste n'a plus de trou. La
		// borne d'une ligne AMORCÉE est celle de son amorce — avant la séance, la séance ne prouve
		// rien, et la borne du profil ne dit rien de cette liste-là.
		for (const c of tousLesCas()) {
			const f = frise(c);
			if (f === null) continue;
			const premierConnu = f.semaines.findIndex((x) => x !== 'inconnu');
			const prefixe = premierConnu === -1 ? NB_SEMAINES : premierConnu;
			expect(f.semaines.slice(prefixe), c.etiquette).not.toContain('inconnu');
			for (let i = 0; i < NB_SEMAINES; i++)
				if (lundiCellule(i + 1) > lecture(c).borne)
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
			const lu = lecture(c);
			const plusHaut: NiveauNotion | null =
				lu.acquis !== null ? 'acquis' : lu.enCours !== null ? 'en-cours' : null;
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

	it('les horodatages ré-exposés : aucun cap démenti, aucune date qui remonte le temps', () => {
		// L'UI date les caps avec ces deux valeurs, et chacune répond « depuis quand la liste EST
		// dans cet état » : elle se tait dès que l'état courant est retombé en dessous, sans quoi la
		// ligne afficherait « acquise le … » à côté d'un mot disant « en cours », ou « commencée
		// le … » à côté d'« à découvrir ». Et « commencée » peut venir de la SÉANCE plutôt que du
		// tampon, à une condition : être plus ancienne que TOUT cap déjà daté. Sinon le couple
		// (commencée, acquise) sortirait à l'envers — la donnée fausse en attente d'un lecteur, ce
		// que le journal lui-même s'interdit de produire. Aucune acquisition, elle, ne se date
		// jamais sur une séance : `acquisDepuis` ne vient QUE du journal.
		let plafonnes = 0;
		let amorces = 0;
		let ecartees = 0;
		for (const c of tousLesCas()) {
			const f = frise(c);
			if (f === null) continue;
			const lu = lecture(c);
			expect(f.enCoursDepuis, c.etiquette).toBe(lu.enCours);
			expect(f.acquisDepuis, c.etiquette).toBe(lu.acquis);
			expect([c.acquis, null], `${c.etiquette} — acquisDepuis`).toContain(f.acquisDepuis);
			// Ordre du couple ré-exposé, sur les journaux que l'appli sait produire (monotones) :
			// c'est là que l'amorce pourrait l'inverser, et elle ne doit pas. Les journaux
			// incohérents de l'énumération, eux, ressortent tels quels — ils ne viennent pas d'ici.
			const journalMonotone = c.enCours === null || c.acquis === null || c.enCours <= c.acquis;
			if (journalMonotone && f.enCoursDepuis !== null && f.acquisDepuis !== null)
				expect(f.enCoursDepuis, `${c.etiquette} — couple (commencée, acquise)`).toBeLessThanOrEqual(
					f.acquisDepuis,
				);
			if (lu.amorce !== null) {
				expect(f.enCoursDepuis, `${c.etiquette} — amorce`).toBe(c.seance);
				amorces++;
			} else {
				if (c.seance !== null) {
					// Amorce écartée : la date exposée reste celle du journal (ou rien).
					expect(f.enCoursDepuis, `${c.etiquette} — amorce écartée`).not.toBe(c.seance);
					ecartees++;
				}
				if (f.enCoursDepuis !== c.enCours || f.acquisDepuis !== c.acquis) plafonnes++;
			}
		}
		expect(plafonnes).toBeGreaterThan(100); // le cas plafonné est bien parcouru
		expect(amorces).toBeGreaterThan(100); // celui de l'amorce aussi
		expect(ecartees).toBeGreaterThan(100); // et celui de l'amorce ÉCARTÉE
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
		// affirmer des semaines pendant lesquelles ce journal-ci ne tournait pas encore. Rien
		// n'étant alors déductible, la ligne n'a pas de frise du tout.
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien'], 1);
		ecrire(p.uuid, PALIERS_DEBUT_KEY, dansSemaine(1)); // le suivi des leçons, lui, est ancien
		expect(listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!.frise).toBeNull();
		// La MÊME date, posée sur la borne PROPRE aux dictées, éclaire aussitôt la ligne : ce qui
		// change est bien la borne LUE, pas l'état de la liste ni la fenêtre.
		ecrire(p.uuid, ORTHO_PALIERS_DEBUT_KEY, dansSemaine(1));
		expect(listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!.frise!.semaines).toEqual(
			rangee(['inconnu', 1], ['en-cours', 11]),
		);
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

/* ============================================================
   6. Amorçage bout en bout — le profil d'avant ce journal
   ------------------------------------------------------------
   Les séances sont écrites par la vraie fonction (`recordSessionActivity('dictee', id)`, ce
   qu'appelle l'ortho-runner à la fin d'une dictée), à des instants figés. Ce que ces tests
   éprouvent, c'est le chemin complet : le graphe d'activité du profil consulté → l'amorce →
   la ligne que le parent lit.
   ============================================================ */
describe('listesOrthoProfil — amorçage par les séances déjà datées', () => {
	/** Séance de dictée sur une liste, telle que l'ortho-runner la journalise. */
	const seanceLe = (quand: number, listeId: string) =>
		auMoment(quand, () => recordSessionActivity('dictee', listeId));

	it('LE CAS RÉEL : des dictées passées, aucun journal de paliers → la frise apparaît', () => {
		// Profil existant le jour où ce journal arrive : l'enfant fait des dictées depuis des mois,
		// mais rien n'a jamais tamponné ses listes. Sans amorce la ligne n'aurait aucune frise
		// jusqu'à sa prochaine séance ; le graphe d'activité, lui, sait déjà quand elle a travaillé.
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien'], 1);
		expect(listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!.frise).toBeNull();
		seanceLe(dansSemaine(4), id);
		const r = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(r.frise!.semaines).toEqual(rangee(['inconnu', 4], ['en-cours', 8]));
		expect(r.frise!.enCoursDepuis).toBe(dansSemaine(4)); // « commencée » = la séance retrouvée
		expect(r.frise!.acquisDepuis).toBeNull();
		// La plus ANCIENNE séance fait l'amorce : en rejouer une n'avance pas le début.
		seanceLe(dansSemaine(10), id);
		expect(listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!.frise!.semaines).toEqual(
			rangee(['inconnu', 4], ['en-cours', 8]),
		);
	});

	it('NON-RÉGRESSION : la première séance sur la nouvelle version ne perd pas l’histoire', () => {
		// Elle pose la borne ET le tampon au même instant : sans amorce, tout ce qui précède
		// redeviendrait creux, et le parent verrait son historique rétrécir le jour de la mise à
		// jour. L'amorce garde le début connu.
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien'], 1);
		seanceLe(dansSemaine(2), id); // dictées d'avant ce journal
		seanceLe(dansSemaine(5), id);
		journaliserPaliersOrtho(false, dansSemaine(9)); // 1re séance journalisée : tampon + borne
		const r = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(r.frise!.semaines).toEqual(rangee(['inconnu', 2], ['en-cours', 10]));
		expect(r.frise!.enCoursDepuis).toBe(dansSemaine(2));
	});

	it('liste MAÎTRISÉE avant ce journal : aucune frise, et aucune acquisition inventée', () => {
		// Rien ne date son acquisition : ni le journal (vide), ni la séance (qui prouve seulement
		// qu'elle était commencée). La ligne se tait donc, puis la prochaine séance la date.
		const p = activeProfile();
		const id = creerListeMaitrisee('Semaine 1', ['chat']);
		seanceLe(dansSemaine(4), id);
		const avant = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(avant.niveau).toBe('acquis');
		expect(avant.frise).toBeNull();
		// Prochaine séance sur la nouvelle version : l'acquis est daté pour de bon, et l'amorce
		// fournit la phase « commencée » que le journal n'a jamais vue.
		journaliserPaliersOrtho(false, dansSemaine(9));
		const apres = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(apres.frise!.semaines).toEqual(rangee(['inconnu', 4], ['en-cours', 5], ['acquis', 3]));
		expect(apres.frise!.acquisDepuis).toBe(dansSemaine(9));
		expect(apres.frise!.enCoursDepuis).toBe(dansSemaine(4));
	});

	it('acquise en RÉVISION puis rejouée en dictée : la séance postérieure n’est pas le début', () => {
		// La chaîne complète du cas écarté : un tour de révision espacée fait franchir « acquis »
		// (il journalise les paliers) sans laisser de séance nominative dans le graphe d'activité ;
		// la dictée qui suit est donc plus récente que l'acquisition. La ligne doit rester muette
		// sur un « commencée », plutôt que de la dater après l'acquis.
		const p = activeProfile();
		const id = creerListeMaitrisee('Semaine 1', ['chat']);
		auMoment(dansSemaine(4), () => recordSessionActivity('revision')); // sans cible, par nature
		journaliserPaliersOrtho(false, dansSemaine(4)); // le tour de révision tamponne « acquis »
		seanceLe(dansSemaine(9), id); // première dictée nominative, bien après
		const r = listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!;
		expect(r.frise!.semaines).toEqual(rangee(['inconnu', 4], ['acquis', 8]));
		expect(r.frise!.acquisDepuis).toBe(dansSemaine(4));
		expect(r.frise!.enCoursDepuis).toBeNull();
	});

	it('travaillée SEULEMENT en révision espacée : aucune séance à son nom, donc aucune amorce', () => {
		// Un tour de révision rejoue des mots de plusieurs origines : il ne réfère aucune cible (cf.
		// progress.ts). L'amorce ne peut donc rien pour une liste dont les mots n'ont été revus que
		// là — c'est une limite du stockage, pas un oubli, et elle ne doit surtout pas se traduire
		// par une amorce arbitraire.
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien'], 1);
		auMoment(dansSemaine(3), () => recordSessionActivity('revision'));
		expect(listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!.frise).toBeNull();
		// Une vraie dictée, elle, l'amorce.
		seanceLe(dansSemaine(6), id);
		expect(listesOrthoProfil(p, false, NOW).find((x) => x.id === id)!.frise!.semaines).toEqual(
			rangee(['inconnu', 6], ['en-cours', 6]),
		);
	});

	it('l’amorce est nominative : la séance d’une AUTRE liste n’éclaire pas la voisine', () => {
		const p = activeProfile();
		const travaillee = creerListe('Travaillée', ['chat'], 1);
		const voisine = creerListe('Voisine', ['avion', 'ours'], 1);
		seanceLe(dansSemaine(4), travaillee);
		const lignes = listesOrthoProfil(p, false, NOW);
		expect(lignes.find((x) => x.id === travaillee)!.frise!.semaines).toEqual(
			rangee(['inconnu', 4], ['en-cours', 8]),
		);
		expect(lignes.find((x) => x.id === voisine)!.frise).toBeNull();
	});

	it('lecture par UUID : les séances lues sont celles du profil CONSULTÉ', () => {
		const a = activeProfile();
		const id = creerListe('Liste de A', ['chat', 'chien'], 1);
		seanceLe(dansSemaine(4), id);
		addProfile('Cadette'); // devient actif, graphe d'activité vierge
		expect(listesOrthoProfil(a, false, NOW).find((x) => x.id === id)!.frise!.semaines).toEqual(
			rangee(['inconnu', 4], ['en-cours', 8]),
		);
		expect(activeProfile().name).toBe('Cadette');
	});
});
