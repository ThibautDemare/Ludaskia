/* ============================================================
   Frise d'états par leçon (espace encadrant) — `debutSuiviPaliers`, `friseNotion`,
   `aChangeRecemment`, et leur branchement dans `progressionProfil`.
   ------------------------------------------------------------
   Le contrat éprouvé ici, tel qu'il est annoncé :
   - 12 cellules, de la plus ANCIENNE à la plus récente, la dernière = semaine EN COURS ;
     semaines CALENDAIRES (lundi premier jour), état d'une cellule = état atteint à la FIN
     de sa semaine (un cap franchi le mercredi colore la semaine qui le contient) ;
   - la DERNIÈRE cellule porte l'ÉTAT DU JOUR (correctif « état du jour ») : elle vaut EXACTEMENT l'état courant reçu
     en argument — plus bas que le plus haut rang atteint (perf récente retombée sous 40 %)
     comme plus haut que tout cap daté (étoile posée avant que le journal ne la tamponne). Les
     ONZE premières continuent de montrer le plus haut rang ATTEINT à la fin de leur semaine :
     ce préfixe reste croissant, la rangée entière ne l'est plus. Ce que ça corrige : le journal
     ne date que les MONTÉES, si bien qu'une leçon retombée gardait une frise bleue jusqu'à la
     dernière cellule pendant que le mot de la ligne disait « à renforcer » et que la barre de
     catégorie la comptait en orange — le parent qui balaie les frises ne voyait jamais la
     baisse. Corollaire à ne pas perdre : le forçage ne CRÉE aucune frise, la population des
     lignes sans frise est inchangée ;
   - `null` pour DEUX motifs distincts : la leçon n'a JAMAIS été travaillée (état courant
     « à découvrir » ET aucun franchissement daté), ou bien AUCUNE semaine n'est
     déductible — douze blocs creux n'apprennent rien et se lisent comme un défaut
     d'affichage, donc la frise n'est pas dessinée du tout et la ligne retombe sur sa puce
     d'état et son mot (même reproche qui avait fait abandonner le pointillé) ;
   - trois sources, et une hiérarchie stricte entre elles : la première rencontre ne vaut
     « à découvrir » que si elle est POSTÉRIEURE (ou égale) à la borne de suivi ; un cap daté
     impose son état à partir de sa semaine (« acquis » l'emporte) ; avant la borne, rien ne
     se déduit ('inconnu') ; après elle et avant tout cap, « à renforcer » ne s'affirme que
     si la leçon est entrée dans le suivi (sinon l'état courant, ou 'inconnu') ;
   - `debutSuiviPaliers` = le PLUS ANCIEN entre la borne stockée et tous les franchissements
     datés du profil : la borne n'arrive qu'à la première fin de session suivant sa mise en
     service, donc un cap plus ancien fait foi contre elle (il PROUVE que le journal
     tournait) ; `Infinity` si le profil ne fournit ni l'un ni l'autre ;
   - `aChangeRecemment` = deux états CONNUS distincts dans la rangée, ou bien un seul état
     connu précédé de pointillé À CONDITION qu'un cap soit daté (le passage du pointillé à la
     couleur est alors un franchissement, pas la simple entrée dans le suivi).

   ÉCRITURE, dans le dernier describe : une fin de session journalise ses paliers d'elle-même,
   report DIFFÉRÉ à la fin de la tâche (câblage et ordre éprouvés dans
   `paliers-cablage.test.ts`). Un test qui monte une vraie session la DATE donc (`auMoment`)
   et laisse tourner ce report (`finDeSession`) avant de lire ; ceux qui stampent une marche
   à la main (`recordMonteesPalier`, exporté pour ça) le font dans la même tâche, avant que la
   session ne reporte la sienne.

   Ce que ces tests ne recopient PAS :
   - les attendus des scénarios sont écrits à la main en RUNS de cellules (`rangee`), pas
     recalculés par un modèle qui redirait la cascade du code ;
   - la grille de semaines du test est une arithmétique de CALENDRIER écrite ici, pas
     `lundiDecale` ; si l'une des deux dérive, les attendus ne coïncident plus ;
   - les invariants (préfixe 'inconnu' contigu, aucune redescente AVANT la dernière cellule,
     dernière cellule = état du jour, uniformité, fenêtre glissante) sont éprouvés sur ~8 000
     journaux, INCOHÉRENTS compris, sans modèle.

   TROIS repères temporels, chacun un mercredi à 15 h 30 (heure locale) :
   - `NOW` = 12 août 2026, dont la fenêtre (25 mai → 16 août) ne contient aucun changement
     d'heure : le gros des attendus s'y lit sans réserve ;
   - `NOW_PRINTEMPS` = 13 mai 2026 et `NOW_AUTOMNE` = 11 novembre 2026, dont les fenêtres
     enjambent les bascules d'heure d'été européennes (29 mars / 25 octobre 2026). Dans un
     fuseau sans heure d'été (UTC, comme la CI), ces cas dégénèrent en cas nominaux — la
     prémisse qui le dit est un test à part, sauté sous ce fuseau.
   ============================================================ */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsSetRaw } from '../src/core/storage';
import {
	LESSON_PALIERS_KEY,
	LESSON_FIRST_SEEN_KEY,
	PALIERS_DEBUT_KEY,
	markLessonsFirstSeen,
	recordLessonResult,
	recordLessonStats,
	recordMonteesPalier,
	type PaliersNotion,
} from '../src/core/progress';
import {
	debutSuiviPaliers,
	friseNotion,
	aChangeRecemment,
	progressionProfil,
	niveauProfilMatiere,
	type CelluleFrise,
	type RecapMatiere,
	type RecapNotion,
	type RecapProfil,
} from '../src/core/encadrant-stats';
import type { NiveauNotion } from '../src/core/maitrise';
import type { SubjectId } from '../src/core/catalog';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const NB_SEMAINES = 12; // largeur annoncée de la frise
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

const NOW = new Date(2026, 7, 12, 15, 30).getTime(); // mercredi 12 août 2026, 15 h 30
const NOW_PRINTEMPS = new Date(2026, 4, 13, 15, 30).getTime(); // fenêtre à cheval sur le 29 mars
const NOW_AUTOMNE = new Date(2026, 10, 11, 15, 30).getTime(); // fenêtre à cheval sur le 25 octobre

/* ---------- Grille de semaines du TEST, en jours de CALENDRIER ----------
   Écrite ici plutôt qu'empruntée au code : c'est la définition « semaine calendaire locale,
   lundi premier jour » du contrat. Une soustraction de 7 × 86 400 000 ms donnerait autre
   chose de part et d'autre d'un changement d'heure — c'est précisément ce qu'on veut pouvoir
   opposer au code. */
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
	/* Lundi 00:00 de la semaine portée par la cellule `i` (0 = la plus ancienne de la frise,
	   11 = la semaine en cours) ; un index hors [0, 11] désigne une semaine hors fenêtre. */
	const lundiCellule = (i: number): number => joursApres(lundiDe(now), 7 * (i - (NB_SEMAINES - 1)));
	/* Fin (exclue) de la semaine de la cellule `i` : le lundi 00:00 de la suivante. */
	const finDe = (i: number): number => lundiCellule(i + 1);
	/* Instant SITUÉ dans la semaine de la cellule `i` (`jour` : 0 = lundi). */
	const dans = (i: number, jour = 2, heure = 10, minute = 0): number =>
		joursApres(lundiCellule(i), jour) + heure * HEURE + minute * MINUTE;
	return { lundiCellule, finDe, dans };
}
const { lundiCellule, finDe, dans: dansSemaine } = grille(NOW);

/* Rangée ATTENDUE, écrite en RUNS explicites : `rangee(['inconnu', 4], ['non-acquis', 8])`
   = 4 cellules 'inconnu' puis 8 'non-acquis'. Les scénarios posent leurs attendus ainsi,
   à la main, plutôt que par un modèle qui rejouerait la cascade du code. */
function rangee(...runs: [CelluleFrise, number][]): CelluleFrise[] {
	const out = runs.flatMap(([etat, n]) => Array.from({ length: n }, (): CelluleFrise => etat));
	if (out.length !== NB_SEMAINES)
		throw new Error(`rangée de ${out.length} cellules au lieu de ${NB_SEMAINES}`);
	return out;
}

/* Échelle du contrat : 'a-decouvrir' < 'non-acquis' < 'en-cours' < 'acquis'. 'inconnu' est
   HORS échelle (absence de donnée) : il n'a de rang que pour être écarté. */
const ECHELLE: NiveauNotion[] = ['a-decouvrir', 'non-acquis', 'en-cours', 'acquis'];
const RANG: Record<NiveauNotion, number> = {
	'a-decouvrir': 0,
	'non-acquis': 1,
	'en-cours': 2,
	acquis: 3,
};
const rang = (c: CelluleFrise): number => (c === 'inconnu' ? -1 : RANG[c]);

/* Donnée relue du STOCKAGE (JSON, non typée) : le cast est l'objet même du test — on éprouve
   la tolérance des fonctions à une valeur hors du type. */
const brut = <T>(v: unknown): T => v as T;

describe('prémisses de la grille du test', () => {
	it('les 12 frontières sont des lundis 00:00, sur les trois repères temporels', () => {
		for (const [quoi, now] of [
			['fenêtre nominale', NOW],
			['fenêtre à cheval sur la bascule de printemps', NOW_PRINTEMPS],
			['fenêtre à cheval sur la bascule d’automne', NOW_AUTOMNE],
		] as const) {
			expect(new Date(now).getDay(), quoi).toBe(3); // les trois repères sont des mercredis
			const g = grille(now);
			for (let i = 0; i < NB_SEMAINES; i++) {
				const d = new Date(g.lundiCellule(i));
				expect([d.getDay(), d.getHours(), d.getMinutes()], `${quoi}, cellule ${i}`).toEqual([
					1, 0, 0,
				]);
			}
			expect(g.lundiCellule(NB_SEMAINES - 1), quoi).toBe(lundiDe(now)); // la dernière = en cours
		}
	});
});

describe('debutSuiviPaliers (borne de suivi du profil)', () => {
	const paliers = (m: Record<string, PaliersNotion>) => m;

	it('borne stockée seule (enfant qui débute, aucun cap franchi) → la borne', () => {
		expect(debutSuiviPaliers(dansSemaine(3), {})).toBe(dansSemaine(3));
	});

	it('borne stockée RÉCENTE contre franchissement ANCIEN → le franchissement gagne', () => {
		// Cas qui compte : la borne n'arrive qu'à la première fin de session suivant sa mise en
		// service, alors que le journal, lui, datait déjà des caps. Prendre la borne telle quelle
		// rendrait 'inconnu' des semaines déjà éclairées — l'historique s'effacerait à la
		// prochaine session de l'enfant.
		expect(
			debutSuiviPaliers(
				dansSemaine(10),
				paliers({
					'a@ce2': { enCours: dansSemaine(2), acquis: dansSemaine(7) },
					'b@ce2': { acquis: dansSemaine(-4) }, // le plus ancien de tous, hors fenêtre
				}),
			),
		).toBe(dansSemaine(-4));
	});

	it('borne stockée ANCIENNE contre franchissements récents → la borne gagne', () => {
		expect(
			debutSuiviPaliers(dansSemaine(1), paliers({ 'a@ce2': { enCours: dansSemaine(9) } })),
		).toBe(dansSemaine(1));
	});

	it('aucune borne stockée → le plus ancien franchissement, toutes leçons et deux caps confondus', () => {
		expect(
			debutSuiviPaliers(
				null,
				paliers({
					'a@ce2': { enCours: dansSemaine(5), acquis: dansSemaine(6) },
					'b@ce2': { enCours: dansSemaine(3) },
					'c@cm1': { acquis: dansSemaine(4) }, // autre niveau : la borne est celle du PROFIL
				}),
			),
		).toBe(dansSemaine(3));
	});

	it('ni borne ni franchissement → Infinity (aucune semaine déductible)', () => {
		expect(debutSuiviPaliers(null, {})).toBe(Infinity);
		expect(debutSuiviPaliers(undefined, brut(null))).toBe(Infinity); // journal illisible
		expect(debutSuiviPaliers(null, paliers({ 'a@ce2': {}, 'b@ce2': brut(null) }))).toBe(Infinity);
	});

	it('horodatage non exploitable (chaîne, objet, NaN, ±Infinity) → traité comme absent', () => {
		for (const v of ['1700000000000', {}, [], NaN, Infinity, -Infinity, true])
			expect(debutSuiviPaliers(brut(v), {}), String(v)).toBe(Infinity);
		// Idem à l'intérieur du journal : une valeur pourrie n'écrase pas une bonne.
		expect(
			debutSuiviPaliers(
				null,
				paliers({ 'a@ce2': brut({ enCours: 'hier', acquis: dansSemaine(6) }) }),
			),
		).toBe(dansSemaine(6));
	});

	it('l’epoch (0) est une borne VALIDE, pas une absence de borne', () => {
		// Piège du falsy : un `if (!borne)` la remplacerait par Infinity et rendrait toute la
		// frise 'inconnu'.
		expect(debutSuiviPaliers(0, {})).toBe(0);
		expect(debutSuiviPaliers(null, paliers({ 'a@ce2': { acquis: 0 } }))).toBe(0);
		expect(debutSuiviPaliers(dansSemaine(3), paliers({ 'a@ce2': { enCours: 0 } }))).toBe(0);
	});
});

describe('friseNotion — rien à tracer', () => {
	it('jamais travaillée (« à découvrir » + aucun cap daté) → null', () => {
		expect(friseNotion(undefined, undefined, 'a-decouvrir', dansSemaine(2), NOW)).toBeNull();
		expect(friseNotion({}, undefined, 'a-decouvrir', Infinity, NOW)).toBeNull();
		// Une première rencontre datée ne crée pas une trajectoire : sans stat, il n'y a rien.
		expect(friseNotion({}, dansSemaine(4), 'a-decouvrir', dansSemaine(2), NOW)).toBeNull();
	});

	it('cap daté sur une leçon « à découvrir » (journal incohérent) → frise quand même', () => {
		// Forme que l'appli ne produit pas (un cap suppose une stat), mais qui contient une
		// trajectoire : la taire perdrait la seule donnée datée disponible.
		const f = friseNotion(
			{ acquis: dansSemaine(6) },
			undefined,
			'a-decouvrir',
			dansSemaine(1),
			NOW,
		);
		expect(f).not.toBeNull();
		// La semaine EN COURS porte l'état du jour (correctif « état du jour »), fût-il celui d'une leçon qu'aucune
		// stat ne décrit : la rangée finit donc là où la ligne le dit, et le cap daté continue
		// de tenir les semaines passées.
		expect(f!.semaines).toEqual(rangee(['inconnu', 6], ['acquis', 5], ['a-decouvrir', 1]));
	});

	it('caps non exploitables (chaîne, null, NaN, Infinity) → traités comme absents', () => {
		const p = (v: unknown) => brut<PaliersNotion>(v);
		// Sur une leçon jamais travaillée, il ne reste rien à tracer…
		expect(
			friseNotion(p({ enCours: '1700000000000' }), undefined, 'a-decouvrir', 0, NOW),
		).toBeNull();
		expect(
			friseNotion({ enCours: NaN, acquis: Infinity }, undefined, 'a-decouvrir', 0, NOW),
		).toBeNull();
		// …et sur une leçon travaillée, la valeur pourrie ne colore aucune cellule.
		const f = friseNotion(p({ enCours: {} }), undefined, 'non-acquis', dansSemaine(4), NOW)!;
		expect(f.enCoursDepuis).toBeNull();
		expect(f.semaines).toEqual(rangee(['inconnu', 4], ['non-acquis', 8]));
		// Une valeur exploitable à côté d'une valeur pourrie continue de tracer.
		const g = friseNotion({ enCours: NaN, acquis: dansSemaine(6) }, undefined, 'acquis', 0, NOW)!;
		expect(g.enCoursDepuis).toBeNull();
		expect(g.acquisDepuis).toBe(dansSemaine(6));
		expect(g.semaines).toEqual(rangee(['inconnu', 6], ['acquis', 6]));
	});

	it('une première rencontre non exploitable laisse l’historique INCONNU', () => {
		const f = friseNotion(
			{ enCours: dansSemaine(6) },
			brut<number>('hier'),
			'en-cours',
			dansSemaine(1),
			NOW,
		)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 6], ['en-cours', 6]));
	});
});

describe('friseNotion — les cas qui ont changé', () => {
	it('« à renforcer » sans aucun franchissement : une frise, et non plus rien', () => {
		// Ces leçons-là — jamais passées au-dessus de 40 % — sont les plus fragiles, donc celles
		// qui intéressent le plus l'adulte ; elles n'avaient pas de frise du tout.
		const f = friseNotion({}, undefined, 'non-acquis', dansSemaine(4), NOW);
		expect(f).not.toBeNull();
		expect(f!.semaines).toEqual(rangee(['inconnu', 4], ['non-acquis', 8]));
		expect(f!.enCoursDepuis).toBeNull();
		expect(f!.acquisDepuis).toBeNull();
	});

	it('acquise sans aucun franchissement daté (étoile posée avant le journal)', () => {
		// Rien n'est monté sous l'œil du journal et l'étoile ne se retire pas : l'état courant
		// tient sur toute la période suivie.
		const f = friseNotion({}, undefined, 'acquis', dansSemaine(4), NOW)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 4], ['acquis', 8]));
		// Aucun cap daté : le passage du pointillé à la couleur ne fait que dater le SUIVI, pas
		// une réussite de l'enfant — le compteur reste éteint.
		expect(aChangeRecemment(f)).toBe(false);
	});

	it('découverte APRÈS la borne : « à découvrir », puis « à renforcer », puis ses caps', () => {
		// Trajectoire journalisée de bout en bout : c'est le seul cas où « à renforcer » peut
		// s'affirmer avant tout cap (la leçon était travaillée sous les 40 %).
		const f = friseNotion(
			{ enCours: dansSemaine(6), acquis: dansSemaine(9) },
			dansSemaine(3),
			'acquis',
			dansSemaine(1),
			NOW,
		)!;
		expect(f.semaines).toEqual(
			rangee(['a-decouvrir', 3], ['non-acquis', 3], ['en-cours', 3], ['acquis', 3]),
		);
		expect(f.semaines).not.toContain('inconnu'); // historique complet : aucune ignorance
	});

	it('profil sans borne ET sans franchissement → AUCUNE frise, jamais un état par défaut', () => {
		// Ce qui est proscrit, c'est une rangée PEINTE que rien n'affirme : douze cellules
		// « en cours » sur la seule foi de l'état du jour, alors qu'aucune semaine n'est
		// déductible. Le silence est une réponse acceptable à ça — il n'affirme rien, et la ligne
		// garde sa puce d'état et son mot ; une rangée peinte, non.
		const borne = debutSuiviPaliers(null, {}); // Infinity
		for (const niveau of ['non-acquis', 'en-cours', 'acquis'] as const) {
			expect(friseNotion({}, undefined, niveau, borne, NOW), niveau).toBeNull();
			expect(aChangeRecemment(friseNotion({}, undefined, niveau, borne, NOW)), niveau).toBe(false);
		}
		// Une première rencontre ne suffit pas à ouvrir le suivi : sans borne, elle ne prouve
		// pas que le journal tournait — et ne peint donc pas davantage la rangée.
		expect(friseNotion({}, dansSemaine(3), 'en-cours', borne, NOW)).toBeNull();
		// La frise apparaît le jour où UNE semaine se déduit : ici la borne posée par la première
		// fin de session, dans la semaine en cours.
		expect(friseNotion({}, undefined, 'en-cours', dansSemaine(11), NOW)!.semaines).toEqual(
			rangee(['inconnu', 11], ['en-cours', 1]),
		);
	});

	it('un cap daté ne colore PAS les semaines qui le précèdent quand la leçon est plus ancienne que le journal', () => {
		// Le tampon peut n'être que la première OBSERVATION d'un état déjà atteint (une leçon
		// étoilée en juin fait tamponner « acquis » à sa première session de juillet) : affirmer
		// « à renforcer » en amont déclarerait sous les 40 % une leçon peut-être maîtrisée.
		const f = friseNotion(
			{ acquis: dansSemaine(8) },
			dansSemaine(-3),
			'acquis',
			dansSemaine(1),
			NOW,
		)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 8], ['acquis', 4]));
		expect(f.semaines).not.toContain('non-acquis');
		expect(f.semaines).not.toContain('a-decouvrir');
	});
});

/* ============================================================
   L'état du jour est un FAIT, la dernière cellule le porte (correctif « état du jour »)
   ------------------------------------------------------------
   Le journal de paliers ne date que les MONTÉES : reconstruite à partir de lui seul, la
   rangée était strictement croissante et sa dernière cellule affirmait le plus haut rang
   atteint, jamais l'état d'aujourd'hui. Sur la même ligne, le mot d'état et la barre de
   catégorie, eux, viennent de `niveauNotion` : une leçon dont la perf récente est retombée
   sous 40 % se lisait donc « à renforcer » en texte, comptait en orange dans la barre, et
   gardait une frise bleue jusqu'au bout. La frise étant ce que l'adulte balaie en premier,
   la baisse n'était visible nulle part.
   Les attendus ci-dessous sont écrits à la main depuis ce contrat, pas relus du code.
   ============================================================ */
describe('friseNotion — l’état du jour est un fait, la dernière cellule le porte', () => {
	const BORNE = dansSemaine(-6); // journal en service bien avant la fenêtre

	it('critère 1 : la leçon retombée finit sur « à renforcer », pas sur son plus haut cap', () => {
		// Le défaut, dans sa forme exacte : deux caps datés (donc onze cellules qui montent) et un
		// état du jour retombé sous les 40 %. La semaine EN COURS doit dire ce que dit la ligne.
		const f = friseNotion(
			{ enCours: dansSemaine(2), acquis: dansSemaine(5) },
			undefined,
			'non-acquis',
			BORNE,
			NOW,
		)!;
		expect(f.semaines).toEqual(
			rangee(['inconnu', 2], ['en-cours', 3], ['acquis', 6], ['non-acquis', 1]),
		);
		// Critère 6 : la méta datée de la ligne (« acquise le … ») ne bouge pas d'un pouce — c'est
		// une DATE de franchissement, pas un état, et l'effacer perdrait l'histoire.
		expect(f.enCoursDepuis).toBe(dansSemaine(2));
		expect(f.acquisDepuis).toBe(dansSemaine(5));
	});

	it('critère 1 : l’état du jour PLUS HAUT que tout cap daté est porté lui aussi', () => {
		// Le cas de bord symétrique, et celui qui distingue « la dernière cellule VAUT l'état du
		// jour » d'un simple plafonnement vers le bas : la leçon est étoilée alors que le journal
		// n'a jamais tamponné son « acquis » (étoile posée hors suivi, journal importé, session
		// d'un autre appareil). Rien ne date cette acquisition, mais elle est un fait du jour.
		const f = friseNotion({ enCours: dansSemaine(4) }, undefined, 'acquis', BORNE, NOW)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 4], ['en-cours', 7], ['acquis', 1]));
		expect(f.acquisDepuis).toBeNull(); // aucune date à afficher : la ligne ne l'invente pas
	});

	it('critère 3 : le passé ne se réécrit pas quand l’état du jour change', () => {
		// Ce que le forçage ne doit PAS faire : repeindre la trajectoire à l'image du présent.
		// Même journal, quatre états du jour ; les onze premières cellules sont les mêmes, seule
		// la dernière suit la ligne. Sinon une leçon qui redescend perdrait la trace de ce qu'elle
		// avait atteint, c'est-à-dire exactement ce que le parent doit voir en regard de la baisse.
		const journal = { enCours: dansSemaine(2), acquis: dansSemaine(5) };
		const passe = rangee(['inconnu', 2], ['en-cours', 3], ['acquis', 7]).slice(0, NB_SEMAINES - 1);
		for (const niveau of ECHELLE) {
			const f = friseNotion(journal, undefined, niveau, BORNE, NOW)!;
			expect(f.semaines.slice(0, NB_SEMAINES - 1), niveau).toEqual(passe);
			expect(f.semaines[NB_SEMAINES - 1], niveau).toBe(niveau);
		}
	});

	it('critère 4 : porter l’état du jour ne fait APPARAÎTRE aucune frise', () => {
		// Le forçage se lit sur une rangée déjà dessinée : il ne rattrape ni la leçon jamais
		// travaillée, ni celle dont aucune semaine n'est déductible. Sinon toutes les lignes d'un
		// profil sans borne de suivi se peupleraient d'une cellule solitaire — une affirmation
		// que rien ne fonde, sur la seule foi de l'état du jour.
		expect(friseNotion({}, undefined, 'a-decouvrir', dansSemaine(2), NOW)).toBeNull();
		expect(
			friseNotion({ acquis: NaN }, dansSemaine(4), 'a-decouvrir', dansSemaine(2), NOW),
		).toBeNull();
		for (const niveau of ['non-acquis', 'en-cours', 'acquis'] as const) {
			expect(friseNotion({}, undefined, niveau, Infinity, NOW), niveau).toBeNull();
			expect(friseNotion({}, dansSemaine(3), niveau, Infinity, NOW), niveau).toBeNull();
		}
	});

	it('critère 5 : la dernière cellule ne rouvre pas de creux au milieu de la rangée', () => {
		// Elle est toujours CONNUE — l'état du jour en est un, « à découvrir » compris : le
		// pointillé reste un préfixe et la hauteur ne dessine aucun trou entre deux semaines
		// colorées. Seule conséquence à assumer : 'a-decouvrir' peut désormais côtoyer un préfixe
		// 'inconnu' sur la DERNIÈRE cellule, sans que la rangée porte pour autant deux lectures du
		// passé (celle-là ne lit pas le passé).
		for (const niveau of ECHELLE) {
			const f = friseNotion({ acquis: dansSemaine(6) }, undefined, niveau, dansSemaine(1), NOW)!;
			expect(f.semaines[NB_SEMAINES - 1], niveau).not.toBe('inconnu');
			const premierConnu = f.semaines.findIndex((x) => x !== 'inconnu');
			expect(premierConnu, niveau).toBe(6);
			expect(f.semaines.slice(premierConnu), niveau).not.toContain('inconnu');
		}
	});
});

describe('friseNotion — bornes de semaine', () => {
	const BORNE = dansSemaine(-6); // journal en service bien avant la fenêtre

	it('12 cellules, la DERNIÈRE est la semaine en cours', () => {
		const f = friseNotion({ acquis: dansSemaine(11) }, undefined, 'acquis', BORNE, NOW)!;
		expect(f.semaines).toHaveLength(NB_SEMAINES);
		expect(f.semaines).toEqual(rangee(['inconnu', 11], ['acquis', 1]));
	});

	it('un cap franchi le MERCREDI colore la semaine qui le contient, pas la suivante', () => {
		const f = friseNotion({ enCours: dansSemaine(4, 2, 14) }, undefined, 'en-cours', BORNE, NOW)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 4], ['en-cours', 8]));
	});

	it('dimanche 23:59:59.999 → la semaine qui se termine ; lundi 00:00:00.000 → celle qui ouvre', () => {
		const dimancheSoir = friseNotion({ enCours: finDe(4) - 1 }, undefined, 'en-cours', BORNE, NOW)!;
		expect(dimancheSoir.semaines).toEqual(rangee(['inconnu', 4], ['en-cours', 8]));
		const lundiPile = friseNotion({ enCours: finDe(4) }, undefined, 'en-cours', BORNE, NOW)!;
		expect(lundiPile.semaines).toEqual(rangee(['inconnu', 5], ['en-cours', 7]));
	});

	it('cap ANTÉRIEUR à la fenêtre → toute la rangée porte déjà l’état', () => {
		const f = friseNotion({ enCours: dansSemaine(-4) }, undefined, 'en-cours', BORNE, NOW)!;
		expect(f.semaines).toEqual(rangee(['en-cours', 12]));
		expect(aChangeRecemment(f)).toBe(false); // frise plate : « ça n'a pas bougé »
	});

	it('la première cellule ne distingue pas « tout début de fenêtre » et « avant »', () => {
		// La fenêtre ne recule pas : à un millième de seconde près, la frise est la même. C'est
		// pour ça qu'un cap tombé dans la cellule 0 ne s'annonce pas comme un changement.
		for (const t of [lundiCellule(0), lundiCellule(0) - 1])
			expect(friseNotion({ acquis: t }, undefined, 'acquis', BORNE, NOW)!.semaines).toEqual(
				rangee(['acquis', 12]),
			);
	});

	it('la frontière rencontre / borne est la SEMAINE, pas la milliseconde', () => {
		// Ce que la borne sert à détecter, c'est l'existence de SEMAINES ENTIÈRES travaillées hors
		// suivi : deux horodatages d'une même semaine n'en délimitent aucune. La comparaison joue
		// donc à la semaine, granularité de la frise.
		const borne = dansSemaine(5, 3, 9); // mise en service : jeudi de la semaine 5
		const cap = { enCours: dansSemaine(8) };
		// Rencontrée le LUNDI de cette même semaine — donc AVANT la borne à la milliseconde près,
		// mais sans qu'aucune semaine complète ait échappé au journal.
		const memeSemaine = friseNotion(cap, dansSemaine(5, 0, 8), 'en-cours', borne, NOW)!;
		expect(memeSemaine.semaines).toEqual(
			rangee(['a-decouvrir', 5], ['non-acquis', 3], ['en-cours', 4]),
		);
		// Rencontrée le DIMANCHE précédent : la semaine 4 a bel et bien été travaillée hors suivi,
		// et son état — comme celui des précédentes — reste inconnu.
		const semaineAvant = friseNotion(cap, dansSemaine(4, 6, 20), 'en-cours', borne, NOW)!;
		expect(semaineAvant.semaines).toEqual(rangee(['inconnu', 8], ['en-cours', 4]));
		// Et cette rencontre-là ne vaut alors pas mieux que pas de date du tout (uniformité).
		expect(semaineAvant.semaines).toEqual(
			friseNotion(cap, undefined, 'en-cours', borne, NOW)!.semaines,
		);
	});

	it('profil TOUT NEUF : sa première session est dans le suivi, pas avant', () => {
		// Cas d'usage derrière la comparaison à la semaine. La 1re rencontre est datée au DÉBUT de
		// la leçon, la borne à la FIN de la session : quelques minutes d'écart, deux Date.now()
		// différents. À la milliseconde, les leçons de la toute première session d'un profil
		// passaient pour « antérieures au journal » et la frise n'affirmait rien (11 cellules
		// 'inconnu') alors qu'on sait pertinemment qu'elles n'étaient pas commencées : le profil
		// n'existait pas.
		const debutLecon = dansSemaine(11, 1, 17); // mardi 17 h, première leçon du profil
		const finSession = debutLecon + 12 * MINUTE; // borne posée à la fin de cette session
		const f = friseNotion({ enCours: finSession }, debutLecon, 'en-cours', finSession, NOW)!;
		expect(f.semaines).toEqual(rangee(['a-decouvrir', 11], ['en-cours', 1]));
		expect(f.semaines).not.toContain('inconnu');
	});
});

/* Une grille en millisecondes fixes (7 × 86 400 000 ms) dérive-t-elle d'une heure sur cette
   fenêtre, sous le fuseau de la machine ? Si oui, les deux cas ci-dessous MORDENT (une telle
   grille les fait échouer). Sous un fuseau sans heure d'été (UTC, comme la CI), ils
   dégénèrent en cas nominaux. */
function deriveEnMsFixes(now: number, i: number): boolean {
	return grille(now).lundiCellule(i) !== lundiDe(now) - 7 * (NB_SEMAINES - 1 - i) * JOUR;
}
const BASCULE_VISIBLE = deriveEnMsFixes(NOW_PRINTEMPS, 2) || deriveEnMsFixes(NOW_AUTOMNE, 7);

describe('friseNotion — la grille tient à travers un changement d’heure', () => {
	it.skipIf(!BASCULE_VISIBLE)(
		'prémisse : sous ce fuseau, une grille en ms fixes se tromperait bien d’une heure',
		() => {
			expect(deriveEnMsFixes(NOW_PRINTEMPS, 2)).toBe(true); // frontière repoussée à dimanche 23:00
			expect(deriveEnMsFixes(NOW_AUTOMNE, 7)).toBe(true); // frontière repoussée à lundi 01:00
		},
	);

	it('printemps : un cap le dimanche à 23 h 30 reste dans SA semaine', () => {
		const g = grille(NOW_PRINTEMPS);
		const f = friseNotion(
			{ enCours: g.dans(2, 6, 23, 30) },
			undefined,
			'en-cours',
			g.dans(-6),
			NOW_PRINTEMPS,
		)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 2], ['en-cours', 10]));
	});

	it('automne : un cap le lundi à 00 h 30 n’est pas rattaché à la semaine précédente', () => {
		const g = grille(NOW_AUTOMNE);
		const f = friseNotion(
			{ enCours: g.dans(7, 0, 0, 30) },
			undefined,
			'en-cours',
			g.dans(-6),
			NOW_AUTOMNE,
		)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 7], ['en-cours', 5]));
	});
});

/* ---------- Invariants, sur des milliers de journaux (incohérents compris) ---------- */

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
/* `finDe(1)` (lundi 00:00 de la semaine 2) et `dansSemaine(2, 0)` encadrent la borne
   `dansSemaine(2)` DANS SA SEMAINE : c'est la frontière hebdomadaire du contrat, celle où un
   retour à la comparaison à la milliseconde se verrait. */
const RENCONTRES = [
	null,
	dansSemaine(-5),
	lundiCellule(0),
	finDe(1),
	finDe(3),
	dansSemaine(3),
	dansSemaine(11),
];
const BORNES = [
	Infinity,
	0,
	dansSemaine(-8),
	lundiCellule(0),
	finDe(3),
	dansSemaine(2),
	dansSemaine(7),
	NOW,
];

interface Cas {
	enCours: number | null;
	acquis: number | null;
	rencontre: number | null;
	borne: number;
	niveau: NiveauNotion;
	etiquette: string;
}
function* tousLesCas(): Generator<Cas> {
	for (const enCours of CAPS_EN_COURS)
		for (const acquis of CAPS_ACQUIS)
			for (const rencontre of RENCONTRES)
				for (const borne of BORNES)
					for (const niveau of ECHELLE)
						yield {
							enCours,
							acquis,
							rencontre,
							borne,
							niveau,
							etiquette: `enCours=${enCours} acquis=${acquis} rencontre=${rencontre} borne=${borne} niveau=${niveau}`,
						};
}
function frise(c: Cas) {
	const paliers: PaliersNotion = {};
	if (c.enCours !== null) paliers.enCours = c.enCours;
	if (c.acquis !== null) paliers.acquis = c.acquis;
	return friseNotion(paliers, c.rencontre ?? undefined, c.niveau, c.borne, NOW);
}

describe('friseNotion — INVARIANTS sur tous les journaux, incohérents compris', () => {
	it('null pour DEUX motifs qu’on tient séparés : jamais travaillée, ou rien de déductible', () => {
		// Prémisses de l'énumération, qui rendent le second motif calculable sans rejouer la
		// cascade du code : aucune borne ni aucun cap n'y est postérieur à aujourd'hui — une mise
		// en service à VENIR rendrait elle aussi toute la fenêtre inconnue.
		expect(BORNES.every((b) => b === Infinity || b <= NOW)).toBe(true);
		expect([...CAPS_EN_COURS, ...CAPS_ACQUIS].every((t) => t === null || t <= NOW)).toBe(true);
		let cas = 0;
		let jamaisHorsPorteeDuSecond = 0;
		let muettes = 0;
		for (const c of tousLesCas()) {
			const jamaisTravaillee =
				c.niveau === 'a-decouvrir' && c.enCours === null && c.acquis === null;
			// Aucune des sources ne situe une semaine dans le suivi : ni borne exploitable
			// (Infinity = « aucune semaine déductible »), ni cap daté — et la date de 1re
			// rencontre, seule, ne prouve pas que le journal tournait.
			const rienDeDeductible = c.borne === Infinity && c.enCours === null && c.acquis === null;
			expect(frise(c) === null, c.etiquette).toBe(jamaisTravaillee || rienDeDeductible);
			if (jamaisTravaillee && !rienDeDeductible) jamaisHorsPorteeDuSecond++;
			if (rienDeDeductible && !jamaisTravaillee) muettes++;
			cas++;
		}
		expect(cas).toBeGreaterThan(5000); // l'énumération n'a pas été vidée
		// Les deux motifs sont peuplés, et surtout le PREMIER est éprouvé LÀ OÙ le second ne
		// s'applique pas : une régression qui cesserait de taire les leçons jamais travaillées ne
		// pourrait pas se cacher derrière « rien de déductible ».
		expect(jamaisHorsPorteeDuSecond).toBeGreaterThan(40); // 7 rencontres × 7 bornes exploitables
		expect(muettes).toBeGreaterThan(10);
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

	it('les cellules « inconnu » forment toujours un préfixe, jamais mêlé à « à découvrir »', () => {
		// Une cellule sans rang au MILIEU de la rangée dessinerait un creux, que la hauteur
		// ferait lire comme une régression ; deux lectures du passé sur la même rangée
		// ('inconnu' = on ne sait pas / « à découvrir » = pas encore commencée) seraient
		// illisibles. On cherche ici un journal, même absurde, qui casse l'un ou l'autre.
		// AJUSTÉ (correctif « état du jour ») : la seconde règle ne porte plus que sur les cellules du PASSÉ. La
		// dernière porte l'état du jour, qui peut valoir « à découvrir » (leçon dont plus aucune
		// stat ne parle) derrière un préfixe 'inconnu' — ce n'est pas une seconde lecture du
		// passé, c'est un fait d'aujourd'hui. Le préfixe, lui, reste contigu sur les douze.
		for (const c of tousLesCas()) {
			const f = frise(c);
			if (f === null) continue;
			const premierConnu = f.semaines.findIndex((x) => x !== 'inconnu');
			const prefixe = premierConnu === -1 ? NB_SEMAINES : premierConnu;
			expect(f.semaines.slice(prefixe), c.etiquette).not.toContain('inconnu');
			if (prefixe > 0)
				expect(f.semaines.slice(0, NB_SEMAINES - 1), c.etiquette).not.toContain('a-decouvrir');
		}
	});

	it('le PASSÉ ne redescend jamais : les onze premières cellules sont croissantes', () => {
		// RÉÉCRIT (correctif « état du jour »). L'invariant portait sur les DOUZE cellules — la frise se reconstruisant
		// d'un journal qui ne date que les montées, elle ne pouvait que croître. C'était vrai, et
		// c'était le défaut : la dernière cellule ne pouvait donc pas dire une baisse. Ce qui
		// reste vrai et doit le rester, c'est le PRÉFIXE : les semaines passées portent le plus
		// haut rang atteint à leur terme, donc aucun creux entre deux cellules colorées.
		let reculs = 0;
		for (const c of tousLesCas()) {
			const f = frise(c);
			if (f === null) continue;
			for (let i = 1; i < NB_SEMAINES - 1; i++)
				expect(rang(f.semaines[i]), `${c.etiquette} — cellule ${i}`).toBeGreaterThanOrEqual(
					rang(f.semaines[i - 1]),
				);
			if (rang(f.semaines[NB_SEMAINES - 1]) < rang(f.semaines[NB_SEMAINES - 2])) reculs++;
		}
		// Et l'assouplissement n'est pas gratuit : sur ces journaux, des centaines de rangées
		// décrochent bel et bien à la dernière cellule. Sans ce compte, un code qui garderait la
		// vieille monotonie passerait le test réécrit sans rien corriger.
		expect(reculs).toBeGreaterThan(1000);
	});

	it('la dernière cellule EST l’état du jour de la ligne, exactement', () => {
		// RÉÉCRIT (correctif « état du jour »). L'ancienne version disait « ne descend jamais SOUS l'état courant » et
		// tolérait explicitement qu'elle le DÉPASSE : c'est par là que passait le défaut, une
		// leçon retombée sous 40 % gardant sa cellule « acquis ». Elle excluait en outre les cas
		// où l'état du jour dépasse le plus haut cap daté — l'autre moitié du contrat, désormais
		// exigée elle aussi : rien ne date cette montée, mais elle est un fait.
		// Aucune exclusion ici, donc, et pas de tolérance pour 'inconnu' : une frise DESSINÉE a
		// toujours au moins une semaine connue, et sa dernière cellule est cet état-là.
		let plusBas = 0;
		let plusHaut = 0;
		for (const c of tousLesCas()) {
			const f = frise(c);
			if (f === null) continue;
			expect(f.semaines[NB_SEMAINES - 1], `${c.etiquette} — dernière cellule`).toBe(c.niveau);
			const avant = rang(f.semaines[NB_SEMAINES - 2]);
			if (avant > RANG[c.niveau]) plusBas++;
			if (avant < RANG[c.niveau]) plusHaut++;
		}
		// Les DEUX sens sont parcourus : sans ça, l'égalité pourrait n'être éprouvée que là où
		// elle allait déjà de soi (le plancher de la frise vaut l'état courant quand rien n'est
		// daté), et la moitié « l'état du jour monte » du contrat resterait sans témoin.
		expect(plusBas).toBeGreaterThan(1000);
		expect(plusHaut).toBeGreaterThan(500);
	});

	it('aChangeRecemment : deux états connus, ou un seul sorti du pointillé grâce à un cap', () => {
		// Second modèle, écrit autrement que la fonction : « deux états distincts » se compte sur
		// l'ensemble des cellules parlantes, et « précédé de pointillé » se lit « la queue est plus
		// courte que la rangée ». L'existence d'un cap est prise sur les ENTRÉES du cas, pas sur la
		// frise renvoyée.
		// AJUSTÉ (correctif « état du jour ») : le modèle comparait la PREMIÈRE cellule parlante à la DERNIÈRE, raccourci
		// que la monotonie autorisait. Elle a sauté avec le forçage de la dernière cellule, et une
		// rangée qui monte puis redescend au même rang (« en cours », « acquis », puis de nouveau
		// « en cours » aujourd'hui) commence comme elle finit tout en ayant bel et bien bougé — le
		// raccourci l'aurait déclarée immobile.
		let allumes = 0;
		let retours = 0;
		for (const c of tousLesCas()) {
			const f = frise(c);
			const parlantes = (f?.semaines ?? []).filter((x) => x !== 'inconnu');
			const capDate = c.enCours !== null || c.acquis !== null;
			const attendu =
				new Set(parlantes).size > 1 ||
				(parlantes.length > 0 && parlantes.length < NB_SEMAINES && capDate);
			expect(aChangeRecemment(f), c.etiquette).toBe(attendu);
			if (attendu) allumes++;
			if (parlantes.length > 0 && parlantes[0] === parlantes[parlantes.length - 1])
				retours += new Set(parlantes).size > 1 ? 1 : 0;
		}
		expect(allumes).toBeGreaterThan(500); // les deux branches sont bien parcourues
		expect(retours).toBeGreaterThan(100); // et le cas « revenue à son point de départ » existe
	});

	it('les horodatages sont ré-exposés tels quels (l’UI date les caps avec)', () => {
		for (const c of tousLesCas()) {
			const f = frise(c);
			if (f === null) continue;
			expect(f.enCoursDepuis, c.etiquette).toBe(c.enCours);
			expect(f.acquisDepuis, c.etiquette).toBe(c.acquis);
		}
	});

	it('UNIFORMITÉ : une rencontre d’une semaine STRICTEMENT antérieure à la borne ne change RIEN', () => {
		// Le défaut corrigé : deux leçons travaillées la même semaine, l'une datée par #178,
		// l'autre non, s'affichaient selon deux règles — départagées par la version de l'appli au
		// moment du premier passage, critère invisible pour le lecteur. Dès qu'une semaine
		// entière a été travaillée hors suivi, la date de première rencontre ne doit plus rien
		// pouvoir changer : la frise n'a aucune raison de départager ces deux leçons.
		let compares = 0;
		for (const enCours of CAPS_EN_COURS)
			for (const acquis of CAPS_ACQUIS)
				for (const borne of BORNES)
					for (const niveau of ECHELLE) {
						const base: Omit<Cas, 'rencontre' | 'etiquette'> = { enCours, acquis, borne, niveau };
						const sans = frise({ ...base, rencontre: null, etiquette: '' });
						for (const rencontre of RENCONTRES) {
							// Semaine de la rencontre >= semaine de la borne : la leçon est dans le suivi,
							// sa date PARLE et doit au contraire changer la lecture — hors sujet ici.
							if (rencontre === null || lundiDe(rencontre) >= lundiDe(borne)) continue;
							const avec = frise({ ...base, rencontre, etiquette: '' });
							expect(
								avec,
								`enCours=${enCours} acquis=${acquis} borne=${borne} niveau=${niveau} rencontre=${rencontre}`,
							).toEqual(sans);
							compares++;
						}
					}
		expect(compares).toBeGreaterThan(500);
	});

	it('FENÊTRE GLISSANTE : une semaine plus tard, chaque cellule a reculé d’un cran', () => {
		// L'état d'une cellule ne dépend que de la FIN de sa semaine : la frise de la semaine
		// suivante doit donc être la même rangée décalée. Un off-by-one dans l'indexation des
		// semaines se voit ici et nulle part ailleurs.
		// AJUSTÉ (correctif « état du jour ») : la comparaison exclut les DEUX cellules « semaine en cours » (la dernière
		// d'`avant`, la dernière d'`apres`). Celle d'`avant` ne raconte plus sa semaine mais l'état
		// du JOUR : la confronter à la même semaine vue de la semaine suivante, où elle n'est plus
		// qu'une semaine passée reconstruite du journal, comparerait deux choses différentes. Le
		// dernier journal ci-dessous est là pour ça — sans lui, l'exclusion serait indolore.
		for (const maintenant of [NOW, NOW_PRINTEMPS, NOW_AUTOMNE]) {
			const g = grille(maintenant);
			const journaux: [PaliersNotion, NiveauNotion][] = [
				[{}, 'non-acquis'],
				[{ enCours: g.dans(4) }, 'en-cours'],
				[{ enCours: g.dans(2), acquis: g.dans(9) }, 'acquis'],
				[{ acquis: g.dans(11) }, 'acquis'],
				[{ enCours: g.dans(-2) }, 'en-cours'],
				[{ enCours: g.dans(2), acquis: g.dans(5) }, 'non-acquis'], // retombée sous les 40 %
			];
			for (const [paliers, niveau] of journaux)
				for (const rencontre of [undefined, g.dans(3)]) {
					const etiquette = `${new Date(maintenant).toDateString()} ${JSON.stringify(paliers)} rencontre=${rencontre}`;
					const borne = g.dans(1);
					const avant = friseNotion(paliers, rencontre, niveau, borne, maintenant)!;
					const apres = friseNotion(paliers, rencontre, niveau, borne, joursApres(maintenant, 7))!;
					expect(apres.semaines.slice(0, NB_SEMAINES - 2), etiquette).toEqual(
						avant.semaines.slice(1, NB_SEMAINES - 1),
					);
				}
		}
	});
});

describe('aChangeRecemment (compteur « N changements récents » par matière)', () => {
	it('pas de frise → false', () => {
		expect(aChangeRecemment(null)).toBe(false);
	});

	it('l’entrée dans le SUIVI n’est pas un changement de l’enfant', () => {
		// Sinon le compteur s'allumerait sur toutes les leçons travaillées du profil, alors que
		// ce qui a changé est le journal, pas l'enfant.
		const f = friseNotion({}, undefined, 'en-cours', dansSemaine(5), NOW)!;
		expect(f.semaines).toEqual(rangee(['inconnu', 5], ['en-cours', 7]));
		expect(aChangeRecemment(f)).toBe(false);
	});

	it('deux rangées IDENTIQUES, réponses opposées : seul un cap daté fait le changement', () => {
		// C'est toute la subtilité de la règle, et sa limite : le compteur ne se déduit PAS des
		// seules cellules. Deux frises au dessin rigoureusement identique — pointillé puis un seul
		// état — s'annoncent différemment selon que le passage à la couleur a été produit par un
		// franchissement (visible, on le compte) ou par l'entrée dans le suivi (rien n'a bougé).
		const parCap = friseNotion(
			{ enCours: dansSemaine(5) },
			undefined,
			'en-cours',
			dansSemaine(-4),
			NOW,
		)!;
		const parLaBorne = friseNotion({}, undefined, 'en-cours', dansSemaine(5), NOW)!;
		const dessin = rangee(['inconnu', 5], ['en-cours', 7]);
		expect(parCap.semaines).toEqual(dessin);
		expect(parLaBorne.semaines).toEqual(dessin);
		expect(aChangeRecemment(parCap)).toBe(true);
		expect(aChangeRecemment(parLaBorne)).toBe(false);
	});

	it('deux états visibles → true, même si le plus ancien est hors fenêtre', () => {
		const f = friseNotion(
			{ enCours: dansSemaine(-8), acquis: dansSemaine(5) },
			undefined,
			'acquis',
			dansSemaine(-9),
			NOW,
		)!;
		expect(f.semaines).toEqual(rangee(['en-cours', 5], ['acquis', 7]));
		expect(aChangeRecemment(f)).toBe(true);
	});

	it('cap tombé dans la cellule 0 → éteint : la rangée est plate, le parent ne verrait rien', () => {
		// Leçon suivie de bout en bout (rencontrée après la borne) : la cellule 0 porte déjà
		// l'état atteint à la FIN de sa semaine, donc un cap qui y tombe ne se voit pas…
		const suivie = (cap: number) =>
			friseNotion({ acquis: cap }, dansSemaine(-1), 'acquis', dansSemaine(-2), NOW)!;
		const dedans = suivie(dansSemaine(0));
		expect(dedans.semaines).toEqual(rangee(['acquis', 12]));
		expect(aChangeRecemment(dedans)).toBe(false);
		// …alors qu'une semaine plus tard, la marche est visible.
		const apres = suivie(dansSemaine(1));
		expect(apres.semaines).toEqual(rangee(['non-acquis', 1], ['acquis', 11]));
		expect(aChangeRecemment(apres)).toBe(true);
	});

	it('journal INCOHÉRENT (« acquis » ancien sous un « en cours » récent) → éteint', () => {
		// « acquis » tient sur toute la rangée : elle est plate, il n'y a rien à annoncer.
		const f = friseNotion(
			{ enCours: dansSemaine(9), acquis: dansSemaine(-2) },
			undefined,
			'acquis',
			dansSemaine(-4),
			NOW,
		)!;
		expect(f.semaines).toEqual(rangee(['acquis', 12]));
		expect(aChangeRecemment(f)).toBe(false);
	});

	it('premier cap d’une leçon plus ancienne que le journal → allumé, quelle que soit sa semaine', () => {
		// Sur ces leçons (toutes celles d'un profil antérieur à la borne), les cellules qui
		// précèdent le premier cap valent 'inconnu' : la rangée ne montre qu'un seul état. C'est
		// pourtant le changement le plus évident qui soit — pointillé, puis couleur. L'écarter
		// mettrait le compteur à 0 sur un profil où plusieurs leçons viennent de franchir un cap.
		for (const semaine of [1, 5, 10, 11]) {
			const f = friseNotion(
				{ enCours: dansSemaine(semaine) },
				undefined,
				'en-cours',
				dansSemaine(-4),
				NOW,
			)!;
			expect(f.semaines, `semaine ${semaine}`).toEqual(
				rangee(['inconnu', semaine], ['en-cours', NB_SEMAINES - semaine]),
			);
			expect(aChangeRecemment(f), `semaine ${semaine}`).toBe(true);
		}
		// Mais un cap ANTÉRIEUR à toute la fenêtre ne laisse aucun pointillé : rangée pleine d'un
		// seul état, rien n'a bougé pendant les 12 semaines.
		const vieux = friseNotion(
			{ enCours: dansSemaine(-2) },
			undefined,
			'en-cours',
			dansSemaine(-4),
			NOW,
		)!;
		expect(vieux.semaines).toEqual(rangee(['en-cours', 12]));
		expect(aChangeRecemment(vieux)).toBe(false);
	});

	it('rencontrée après la borne, sans aucun cap → allumé (deux états connus)', () => {
		// « à découvrir » puis « à renforcer » : la leçon est entrée dans le paysage du parent.
		const f = friseNotion({}, dansSemaine(8), 'non-acquis', dansSemaine(2), NOW)!;
		expect(f.semaines).toEqual(rangee(['a-decouvrir', 8], ['non-acquis', 4]));
		expect(aChangeRecemment(f)).toBe(true);
	});
});

/* ---------- Branchement dans progressionProfil (lecture par UUID) ---------- */

function ecrire(uuid: string, key: string, valeur: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(valeur));
}
function notion(recap: RecapProfil, lessonId: string): RecapNotion {
	const n = recap.parCategorie.flatMap((c) => c.lecons).find((l) => l.lessonId === lessonId);
	if (!n) throw new Error('leçon absente du récap : ' + lessonId);
	return n;
}
function matiere(recap: RecapProfil, subject: SubjectId): RecapMatiere {
	const m = recap.parMatiere.find((x) => x.subject === subject);
	if (!m) throw new Error('matière absente du récap : ' + subject);
	return m;
}
function frisesTracees(recap: RecapProfil): string[] {
	return recap.parCategorie
		.flatMap((c) => c.lecons)
		.filter((l) => l.frise !== null)
		.map((l) => l.lessonId);
}
/* Session datée à un instant FIGÉ : une vraie fin de session lit l'horloge, or les attendus
   d'ici sont ancrés sur NOW (12 août 2026). */
function auMoment<T>(t: number, geste: () => T): T {
	const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
	try {
		return geste();
	} finally {
		spy.mockRestore();
	}
}
/* Fin de la tâche courante : laisse tourner le report de franchissements de la session. */
const finDeSession = (): Promise<void> => Promise.resolve();

describe('progressionProfil — branchement de la frise', () => {
	/* Deux leçons de maths du catalogue, stockées `@ce2` pour un profil par défaut. */
	const A = 'math-doubles';
	const B = 'math-moities';
	/* `recordLessonStats` date la 1re rencontre à l'horloge RÉELLE (Date.now()) : sans la fixer
	   d'abord, les attendus dépendraient du jour où l'on lance les tests. On la pose donc
	   explicitement, comme l'aurait fait l'appli le jour du premier passage. */
	const rencontreeLe = (lessonId: string, t: number) => markLessonsFirstSeen([lessonId], t);

	it('prémisse : le profil par défaut lit bien les clés @ce2', () => {
		expect(niveauProfilMatiere(activeProfile(), 'math')).toBe('ce2');
	});

	it('session qui ne franchit rien : sa borne ouvre le suivi à sa semaine, et rien avant', async () => {
		// Une fin de session pose la borne d'elle-même, même sans franchir de palier : à 20 % la
		// leçon reste « à renforcer », mais le suivi démarre, et la frise l'affirme à partir de
		// cette semaine-là. Les semaines antérieures, elles, restent 'inconnu' — et la date de 1re
		// rencontre, plus ancienne d'une semaine ENTIÈRE, ne les rattrape pas (uniformité : une
		// semaine travaillée hors suivi ne se déduit pas). Les autres leçons n'ont pas de frise.
		const p = activeProfile();
		rencontreeLe(A, dansSemaine(3)); // travaillée avant la mise en service du journal
		auMoment(dansSemaine(6), () => recordLessonStats({ [A]: { ok: 2, total: 10 } }));
		await finDeSession(); // c'est le report de la session qui pose la borne
		const recap = progressionProfil(p, NOW);
		expect(frisesTracees(recap)).toEqual([A]);
		expect(notion(recap, A).niveau).toBe('non-acquis');
		expect(notion(recap, A).frise!.semaines).toEqual(rangee(['inconnu', 6], ['non-acquis', 6]));
		expect(recap.parMatiere.every((m) => m.changementsRecents === 0)).toBe(true);
		expect(recap.parMatiere.length).toBeGreaterThan(0); // l'assertion n'est pas creuse
	});

	it('journal écrit par les vraies fonctions : même frise que l’appel direct', () => {
		const p = activeProfile();
		rencontreeLe(A, dansSemaine(1)); // travaillée avant la mise en service du journal
		recordLessonStats({ [A]: { ok: 8, total: 10 } }); // 80 % → « en cours »
		recordMonteesPalier([A], dansSemaine(4)); // mise en service + 1re marche
		recordLessonResult(A, true); // étoile → « acquis »
		recordMonteesPalier([A], dansSemaine(9)); // 2de marche
		const recap = progressionProfil(p, NOW);
		expect(notion(recap, A).frise!.semaines).toEqual(
			rangee(['inconnu', 4], ['en-cours', 5], ['acquis', 3]),
		);
		expect(notion(recap, A).frise).toEqual(
			friseNotion(
				{ enCours: dansSemaine(4), acquis: dansSemaine(9) },
				dansSemaine(1),
				'acquis',
				dansSemaine(4),
				NOW,
			),
		);
		expect(matiere(recap, 'math').changementsRecents).toBe(1); // une leçon, deux caps = 1
		expect(matiere(recap, 'francais').changementsRecents).toBe(0);
	});

	it('la borne est celle du PROFIL : un cap ancien sur une leçon éclaire les autres', () => {
		const p = activeProfile();
		// Leçon A : un cap daté bien avant la borne stockée (profil qui journalisait déjà).
		ecrire(p.uuid, LESSON_PALIERS_KEY, { [A + '@ce2']: { acquis: dansSemaine(-6) } });
		// Leçon B : travaillée de longue date, jamais montée — sa fin de session pose la borne
		// (tardive) à la semaine 10.
		rencontreeLe(B, dansSemaine(-9));
		recordLessonStats({ [B]: { ok: 2, total: 10 } });
		recordMonteesPalier([B], dansSemaine(10));
		const recap = progressionProfil(p, NOW);
		// Si la borne stockée l'emportait, B serait 'inconnu' jusqu'à la semaine 10 : l'historique
		// déjà visible s'effacerait à la première session de l'enfant.
		expect(notion(recap, B).frise!.semaines).toEqual(rangee(['non-acquis', 12]));
		// Et A, dont le cap précède la fenêtre, la porte sur toutes ses semaines PASSÉES (état
		// courant « à découvrir » faute de stats : la trajectoire datée est tracée quand même,
		// et la semaine en cours dit l'état du jour comme sur n'importe quelle ligne).
		expect(notion(recap, A).niveau).toBe('a-decouvrir');
		expect(notion(recap, A).frise!.semaines).toEqual(rangee(['acquis', 11], ['a-decouvrir', 1]));
	});

	it('deux leçons au même journal ne se départagent pas sur la date de 1re rencontre', () => {
		const p = activeProfile();
		recordLessonStats({ [A]: { ok: 8, total: 10 }, [B]: { ok: 8, total: 10 } });
		// Situation historique du stockage : #178 a daté A, B est passée avant lui et n'a pas de
		// date du tout. C'est la seule différence entre les deux leçons.
		ecrire(p.uuid, LESSON_FIRST_SEEN_KEY, { [A + '@ce2']: dansSemaine(1) });
		recordMonteesPalier([], dansSemaine(6)); // mise en service, sans franchissement
		recordMonteesPalier([A, B], dansSemaine(8)); // les deux passent « en cours » ensemble
		const recap = progressionProfil(p, NOW);
		const attendue = rangee(['inconnu', 8], ['en-cours', 4]);
		expect(notion(recap, A).frise!.semaines).toEqual(attendue);
		expect(notion(recap, B).frise!.semaines).toEqual(attendue);
		// Les deux ont franchi leur cap dans la fenêtre : le compteur les voit toutes les deux,
		// et surtout ne les départage pas non plus.
		expect(matiere(recap, 'math').changementsRecents).toBe(2);
	});

	it('paire de migration : la clé legacy ne fabrique pas d’état, elle peut seulement reculer la borne', () => {
		const p = activeProfile();
		ecrire(p.uuid, LESSON_PALIERS_KEY, {
			[A]: { acquis: dansSemaine(-20) }, // clé LEGACY (sans niveau), jamais écrite par l'appli
			[A + '@ce2']: { acquis: dansSemaine(9) },
		});
		rencontreeLe(B, dansSemaine(-25)); // travaillée de longue date, aucun cap
		recordLessonStats({ [B]: { ok: 2, total: 10 } });
		const recap = progressionProfil(p, NOW);
		// A ne lit QUE son entrée namespacée : son « acquis » date de la semaine 9. (La dernière
		// cellule porte l'état du jour, « à découvrir » faute de stats sur A — cf. finaliserFrise.)
		expect(notion(recap, A).niveau).toBe('a-decouvrir');
		expect(notion(recap, A).frise!.semaines).toEqual(
			rangee(['inconnu', 9], ['acquis', 2], ['a-decouvrir', 1]),
		);
		// La clé legacy compte en revanche pour la borne du profil (elle prouve que le journal
		// tournait) : B est donc suivie sur toute la fenêtre, et non 'inconnu' jusqu'à la semaine 9.
		expect(notion(recap, B).frise!.semaines).toEqual(rangee(['non-acquis', 12]));
	});

	it('scoping par niveau : un palier @cm1 n’ouvre aucune frise pour un profil CE2', () => {
		const p = activeProfile();
		ecrire(p.uuid, LESSON_PALIERS_KEY, { [A + '@cm1']: { acquis: dansSemaine(6) } });
		const recap = progressionProfil(p, NOW);
		expect(frisesTracees(recap)).toEqual([]);
		expect(matiere(recap, 'math').changementsRecents).toBe(0);
	});

	it('journal illisible / leçon disparue du catalogue → aucune frise, aucun plantage', () => {
		const p = activeProfile();
		ecrire(p.uuid, LESSON_PALIERS_KEY, {
			[A + '@ce2']: { enCours: 'la semaine dernière' }, // valeur hors type
			'lecon-supprimee@ce2': { acquis: dansSemaine(4) },
		});
		ecrire(p.uuid, LESSON_FIRST_SEEN_KEY, { [A + '@ce2']: 'jeudi' });
		ecrire(p.uuid, PALIERS_DEBUT_KEY, 'depuis toujours');
		const recap = progressionProfil(p, NOW);
		expect(frisesTracees(recap)).toEqual([]);
		expect(matiere(recap, 'math').changementsRecents).toBe(0);
	});
});
