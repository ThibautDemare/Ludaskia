/* ============================================================
   Frise de COMPOSITION d'une liste de dictée (#545) — `friseComposition`
   (core/encadrant-stats.ts) et son branchement dans `listesOrthoProfil`.
   ------------------------------------------------------------
   Elle ne mesure pas la même chose que la frise d'ÉTATS des listes (#541, éprouvée dans
   `frise-liste-ortho.test.ts`) : l'état d'une liste ne connaît que trois valeurs et ne
   bouge qu'à deux moments, si bien qu'entre les deux des semaines de travail réel ne
   changent rien à l'écran. La composition, elle, doit bouger dès qu'UN mot monte d'une
   marche.

   Ce que ces tests dérivent de l'issue, et non du code :
   - même axe du temps que les frises d'états (critère 8) : 12 semaines CALENDAIRES, de la
     plus ancienne à la plus récente, l'état d'une colonne étant celui atteint à la FIN de
     sa semaine (borne exclue, comme un cap posé le lundi 00:00 ouvre la semaine suivante) ;
   - une colonne antérieure à la mise en service du datage est INCONNUE (`null`), jamais
     « rien n'était commencé » (critère 9) ; une semaine sans séance, après la borne, n'est
     PAS inconnue : elle reprend la précédente (critère 10) ;
   - la DERNIÈRE colonne est toujours connue, la répartition du jour se lisant sur les
     booléens du mot, qui n'ont jamais eu besoin de dates (critère 11) ;
   - la convention d'appartenance (critère 13) : la frise montre où en étaient, chaque
     semaine, les mots que la liste contient AUJOURD'HUI — donc un total constant d'une
     colonne à l'autre, et un mot ajouté hier au bas de l'escalier sur les colonnes
     anciennes.

   La grille de semaines est réécrite ici en jours de CALENDRIER (pas `lundiDecale`), et les
   colonnes attendues sont posées à la main en RUNS, comme dans `frise-liste-ortho.test.ts`.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsSetRaw, lsGetRaw } from '../src/core/storage';
import type { PaliersNotion } from '../src/core/progress';
import {
	friseComposition,
	friseNotion,
	friseListeOrtho,
	listesOrthoProfil,
	toggleRevoirFor,
	orthoRevoirId,
	type FriseComposition,
	type CelluleFrise,
} from '../src/core/encadrant-stats';
import { paliersComposition, type RangMot } from '../src/core/orthographe/etapes';
import { marquerAtelierFait, validerMode } from '../src/core/orthographe/runner';
import {
	journaliserPaliersOrtho,
	ORTHO_ETAPES_DEBUT_KEY,
	ORTHO_PALIERS_KEY,
	ORTHO_PALIERS_DEBUT_KEY,
} from '../src/core/orthographe/paliers';
import {
	loadOrtho,
	saveOrtho,
	createListe,
	updateListe,
	emptyOrthoState,
	addOrGetMot,
} from '../src/core/orthographe/store';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import { avancementLecon, motsAttendusLecon } from '../src/core/orthographe/progression';
import { ORDRE_NIVEAUX_ORTHO } from '../src/ui/encadrant-commun';
import type { MotOrtho, EtapeOrtho } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const NB_SEMAINES = 12;
const HEURE = 3_600_000;
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
/** Lundi 00:00 qui OUVRE la colonne `i` (0 = la plus ancienne, 11 = la semaine en cours). */
const lundiCellule = (i: number): number => joursApres(lundiDe(NOW), 7 * (i - (NB_SEMAINES - 1)));
/** Fin (exclue) de la colonne `i` = lundi qui ouvre la suivante. */
const finDe = (i: number): number => lundiCellule(i + 1);
/** Un instant dans la colonne `i` (mercredi 10 h par défaut). */
const dansSemaine = (i: number, jour = 2, heure = 10): number =>
	joursApres(lundiCellule(i), jour) + heure * HEURE;

/* ---------- Escalier, écrit à la main d'après l'issue ---------- */
const AVEC_VOIX: RangMot[] = ['neuf', 'atelier', 'tuiles', 'motCache', 'dictee'];
const SANS_VOIX: RangMot[] = ['neuf', 'atelier', 'tuiles', 'motCache'];

/** Colonne attendue, écrite par RANG : `col(SANS_VOIX, { neuf: 2, atelier: 1 })`. */
const col = (paliers: RangMot[], parRang: Partial<Record<RangMot, number>>): number[] =>
	paliers.map((p) => parRang[p] ?? 0);
/** Rangée attendue en RUNS : `rangee(SANS_VOIX, [null, 4], [{ atelier: 2 }, 8])`. */
function rangee(
	paliers: RangMot[],
	...runs: [Partial<Record<RangMot, number>> | null, number][]
): (number[] | null)[] {
	const out = runs.flatMap(([c, n]) =>
		Array.from({ length: n }, () => (c === null ? null : col(paliers, c))),
	);
	if (out.length !== NB_SEMAINES)
		throw new Error(`rangée de ${out.length} colonnes au lieu de ${NB_SEMAINES}`);
	return out;
}

/* ---------- Fabrication de mots ---------- */
let compteur = 0;
function motVierge(): MotOrtho {
	return addOrGetMot(emptyOrthoState(), { mot: `mot${++compteur}` });
}
function franchir(m: MotOrtho, etape: EtapeOrtho, quand: number): void {
	if (etape === 'atelier') marquerAtelierFait(m, quand);
	else validerMode(m, etape, quand);
}
/** Mot dont les marches ont été franchies aux instants donnés (parcours réel, daté). */
function motProgresse(...etapes: [EtapeOrtho, number][]): MotOrtho {
	const m = motVierge();
	for (const [etape, quand] of etapes) franchir(m, etape, quand);
	return m;
}
/** Mot d'AVANT le datage : booléens posés, aucune date, et rien ne la reconstitue. */
function motAncien(...etapes: EtapeOrtho[]): MotOrtho {
	const m = motVierge();
	for (const etape of etapes) {
		if (etape === 'atelier') m.atelierFait = true;
		else m.validation[etape] = true;
	}
	return m;
}

const connues = (f: FriseComposition): number[][] =>
	f.semaines.filter((c): c is number[] => c !== null);
/** `repete('inconnu', 4)` — cellules d'une frise d'ÉTATS (critère 22). */
const repete = (cellule: CelluleFrise, n: number): CelluleFrise[] =>
	Array.from({ length: n }, () => cellule);

/* ============================================================
   0. Prémisses : la grille de semaines du TEST est la bonne
   ------------------------------------------------------------
   Les colonnes attendues plus bas sont posées à la main sur cette grille. Si elle est
   décalée d'un cran, tous les attendus le sont avec elle et la frise de composition serait
   jugée fausse pour une raison qui ne la concerne pas. On la confronte donc à une frise DÉJÀ
   LIVRÉE (celle des états de liste, #541), qui partage la même fenêtre et la même convention
   de temps — c'est ce que le critère 8 exige, « même axe du temps que la frise des leçons ».
   ============================================================ */
describe('prémisses de la grille du test', () => {
	it('les 12 frontières sont des lundis 00:00, la dernière colonne étant la semaine en cours', () => {
		for (let i = 0; i < NB_SEMAINES; i++) {
			const d = new Date(lundiCellule(i));
			expect([d.getDay(), d.getHours(), d.getMinutes()], `colonne ${i}`).toEqual([1, 0, 0]);
		}
		expect(lundiCellule(NB_SEMAINES - 1)).toBe(lundiDe(NOW));
	});

	it('un fait daté `dansSemaine(k)` couvre les colonnes k et suivantes (frise déjà livrée)', () => {
		for (const k of [0, 3, 7, 11]) {
			const f = friseListeOrtho({ enCours: dansSemaine(k) }, 'en-cours', dansSemaine(-9), NOW)!;
			expect(f.semaines.slice(0, k), `k=${k}`).toEqual(repete('a-decouvrir', k));
			expect(f.semaines.slice(k), `k=${k}`).toEqual(repete('en-cours', NB_SEMAINES - k));
		}
	});

	it('une borne `dansSemaine(k)` rend inconnues les k premières colonnes (frise déjà livrée)', () => {
		for (const k of [0, 3, 7]) {
			const f = friseListeOrtho({ enCours: dansSemaine(11) }, 'en-cours', dansSemaine(k), NOW)!;
			expect(f.semaines.slice(0, k), `k=${k}`).toEqual(repete('inconnu', k));
			expect(f.semaines[k], `k=${k}`).not.toBe('inconnu');
		}
		// Et la frontière : borne au dernier instant d'une semaine, puis au lundi qui suit.
		expect(
			friseListeOrtho({ enCours: dansSemaine(11) }, 'en-cours', finDe(4) - 1, NOW)!.semaines.slice(
				0,
				5,
			),
		).toEqual([...repete('inconnu', 4), 'a-decouvrir']);
		expect(
			friseListeOrtho({ enCours: dansSemaine(11) }, 'en-cours', finDe(4), NOW)!.semaines.slice(
				0,
				6,
			),
		).toEqual([...repete('inconnu', 5), 'a-decouvrir']);
	});
});

/* ============================================================
   1. Forme de la frise — critères 8 et 11
   ============================================================ */
describe('friseComposition — forme', () => {
	it('aucun mot attendu → pas de frise (rien à répartir)', () => {
		expect(friseComposition([], true, dansSemaine(2), NOW)).toBeNull();
	});

	it('RIEN DE COMMENCÉ → pas de frise, même avec des mots attendus', () => {
		// Un mot ne redescend jamais de l'escalier : si tous sont « neufs » aujourd'hui, ils
		// l'étaient toutes les semaines précédentes. Les douze colonnes vaudraient donc la même
		// chose, et diraient douze fois « aucun mot commencé » sous une ligne qui l'écrit déjà en
		// toutes lettres. Même refus qu'`aucuneSemaineConnue` pour les frises d'états.
		// Deux chemins RÉELS, et non un cas de figure : la dictée prédéfinie épinglée à l'avance
		// (aucun mot matérialisé en banque, donc tous `undefined`) et la liste dont le parent
		// vient de retirer les mots déjà travaillés.
		expect(
			friseComposition([undefined, undefined, undefined], false, dansSemaine(2), NOW),
		).toBeNull();
		expect(friseComposition([motVierge(), motVierge()], false, dansSemaine(2), NOW)).toBeNull();
		expect(friseComposition([motVierge(), undefined], true, dansSemaine(2), NOW)).toBeNull();
		// Ce n'est pas la BORNE qui décide : une liste jamais commencée se tait aussi quand le
		// datage tourne depuis longtemps, et quand il ne tourne pas encore.
		for (const borne of [Infinity, dansSemaine(-9), NOW])
			expect(friseComposition([motVierge()], false, borne, NOW), String(borne)).toBeNull();
	});

	it('… et elle APPARAÎT dès qu’un seul mot franchit sa première marche', () => {
		// L'effet voulu, et le seul qui distingue « on se tait » de « on ne sait rien faire » :
		// c'est ce test-là qui garde la décision, l'absence de frise ne prouvant rien toute seule.
		const mots = [motVierge(), motVierge()];
		expect(friseComposition(mots, false, dansSemaine(1), NOW)).toBeNull();
		franchir(mots[0], 'atelier', dansSemaine(9)); // une séance de découverte, et une seule
		const f = friseComposition(mots, false, dansSemaine(1), NOW)!;
		expect(f).not.toBeNull();
		expect(f.total).toBe(2);
		expect(f.semaines).toEqual(
			rangee(SANS_VOIX, [null, 1], [{ neuf: 2 }, 8], [{ neuf: 1, atelier: 1 }, 3]),
		);
		// Les colonnes ANTÉRIEURES au franchissement disent bien « tout était neuf » — ce que la
		// frise refusait d'afficher tant que c'était encore vrai aujourd'hui.
		expect(f.semaines[5]).toEqual(col(SANS_VOIX, { neuf: 2 }));
	});

	it('12 colonnes, de la plus ancienne à la plus récente, aux rangs de l’escalier', () => {
		const mots = [motProgresse(['atelier', dansSemaine(3)]), motVierge()];
		for (const dispo of [false, true]) {
			const f = friseComposition(mots, dispo, dansSemaine(1), NOW)!;
			expect(f.semaines, String(dispo)).toHaveLength(NB_SEMAINES);
			expect(f.paliers, String(dispo)).toEqual(paliersComposition(dispo));
			expect(f.total, String(dispo)).toBe(2);
		}
	});

	it('critère 11 : LE PREMIER JOUR, la répartition du jour est connue quand même', () => {
		// « la frise n'a que des cellules creuses (et n'est donc pas dessinée du tout) alors que la
		// répartition du jour est connue » = violation. Cette frise-là échappe donc à la règle
		// « aucune semaine connue → pas de frise » : la dernière colonne se lit sur les BOOLÉENS,
		// qui n'ont jamais eu besoin de dates.
		const mots = [motAncien('atelier'), motVierge()];
		const f = friseComposition(mots, false, Infinity, NOW)!;
		expect(f).not.toBeNull();
		expect(f.semaines).toEqual(rangee(SANS_VOIX, [null, 11], [{ neuf: 1, atelier: 1 }, 1]));
	});

	it('critère 13 : le total est CONSTANT d’une colonne à l’autre, et chaque colonne le somme', () => {
		// La frise ne prétend jamais connaître le nombre de mots que la liste avait il y a six
		// semaines : l'historique d'appartenance n'existe pas et n'est pas inventé.
		const mots = [
			motProgresse(['atelier', dansSemaine(2)], ['tuiles', dansSemaine(6)]),
			motProgresse(['atelier', dansSemaine(9)]),
			motVierge(),
			undefined, // mot attendu jamais matérialisé : il compte, au bas de l'escalier
		];
		const f = friseComposition(mots, true, dansSemaine(1), NOW)!;
		expect(f.total).toBe(4);
		for (const [i, colonne] of connues(f).entries())
			expect(
				colonne.reduce((a, b) => a + b, 0),
				`colonne connue ${i}`,
			).toBe(4);
	});
});

/* ============================================================
   2. Ce qui est inconnu, et ce qui ne l'est pas — critères 9, 10, 23
   ============================================================ */
describe('friseComposition — colonnes inconnues', () => {
	it('critère 9 : les semaines d’avant la mise en service sont INCONNUES, pas vides', () => {
		const mots = [motProgresse(['atelier', dansSemaine(6)]), motVierge()];
		const f = friseComposition(mots, false, dansSemaine(3), NOW)!;
		expect(f.semaines).toEqual(
			rangee(SANS_VOIX, [null, 3], [{ neuf: 2 }, 3], [{ neuf: 1, atelier: 1 }, 6]),
		);
	});

	it('critère 9 : profil EXISTANT, liste déjà maîtrisée → ni douze pleines, ni douze vides', () => {
		// Le cas qui arrive le jour où le datage entre en service : rien n'est daté, la borne
		// n'est pas encore posée. Douze semaines pleines mentiraient (on ne sait pas quand),
		// douze semaines vides aussi (la liste EST maîtrisée aujourd'hui).
		const mots = [
			motAncien('atelier', 'tuiles', 'motCache'),
			motAncien('atelier', 'tuiles', 'motCache'),
		];
		const f = friseComposition(mots, false, Infinity, NOW)!;
		expect(f.semaines.slice(0, 11).every((c) => c === null)).toBe(true);
		expect(f.semaines[11]).toEqual(col(SANS_VOIX, { motCache: 2 }));
	});

	it('critère 23 : une étape franchie sans date est réputée franchie AVANT la borne', () => {
		// Rien n'est reconstitué : on ne devine pas la semaine où ces mots sont montés. Ils sont
		// à leur rang sur TOUTES les colonnes que la borne autorise, et sur aucune autre.
		const mots = [motAncien('atelier', 'tuiles'), motAncien('atelier'), motVierge()];
		const f = friseComposition(mots, false, dansSemaine(4), NOW)!;
		expect(f.semaines).toEqual(
			rangee(SANS_VOIX, [null, 4], [{ neuf: 1, atelier: 1, tuiles: 1 }, 8]),
		);
	});

	it('critère 10 : après la borne, plus AUCUN trou — une semaine de vacances n’est pas creuse', () => {
		const mots = [
			motProgresse(['atelier', dansSemaine(2)]),
			motProgresse(['atelier', dansSemaine(9)]),
		];
		const f = friseComposition(mots, true, dansSemaine(1), NOW)!;
		const premierConnu = f.semaines.findIndex((c) => c !== null);
		expect(premierConnu).toBeGreaterThanOrEqual(0);
		expect(f.semaines.slice(premierConnu)).not.toContain(null); // les `null` forment un préfixe
		// Et les semaines sans le moindre franchissement reprennent la précédente : sept colonnes
		// identiques entre le premier atelier et le second, aucune n'étant creuse.
		expect(f.semaines).toEqual(
			rangee(
				AVEC_VOIX,
				[null, 1],
				[{ neuf: 2 }, 1],
				[{ neuf: 1, atelier: 1 }, 7],
				[{ atelier: 2 }, 3],
			),
		);
	});

	it('la borne au dimanche 23:59 laisse la semaine connue ; au lundi 00:00, c’est la suivante', () => {
		const mots = [motAncien('atelier')];
		expect(friseComposition(mots, false, finDe(4) - 1, NOW)!.semaines).toEqual(
			rangee(SANS_VOIX, [null, 4], [{ atelier: 1 }, 8]),
		);
		expect(friseComposition(mots, false, finDe(4), NOW)!.semaines).toEqual(
			rangee(SANS_VOIX, [null, 5], [{ atelier: 1 }, 7]),
		);
	});

	it('borne ANTÉRIEURE à la fenêtre → aucune colonne inconnue du tout', () => {
		const mots = [motProgresse(['atelier', dansSemaine(-3)])];
		const f = friseComposition(mots, false, dansSemaine(-8), NOW)!;
		expect(f.semaines).not.toContain(null);
		expect(f.semaines).toEqual(rangee(SANS_VOIX, [{ atelier: 1 }, 12]));
	});
});

/* ============================================================
   3. Le mouvement semaine par semaine — critères 8 et 10
   ============================================================ */
describe('friseComposition — la composition bouge d’une semaine à l’autre', () => {
	/* Quatre mots découverts la même semaine, puis un mot qui passe les tuiles toutes les
	   deux semaines : quatre franchissements dans quatre semaines distinctes. */
	const quatreMots = (): MotOrtho[] =>
		[4, 6, 8, 10].map((s) => motProgresse(['atelier', dansSemaine(2)], ['tuiles', dansSemaine(s)]));

	it('critère 8 : quatre semaines de franchissements ne donnent pas quatre colonnes identiques', () => {
		const f = friseComposition(quatreMots(), false, dansSemaine(1), NOW)!;
		expect(f.semaines).toEqual(
			rangee(
				SANS_VOIX,
				[null, 1],
				[{ neuf: 4 }, 1],
				[{ atelier: 4 }, 2],
				[{ atelier: 3, tuiles: 1 }, 2],
				[{ atelier: 2, tuiles: 2 }, 2],
				[{ atelier: 1, tuiles: 3 }, 2],
				[{ tuiles: 4 }, 2],
			),
		);
		// Formulation directe du critère : la rangée n'est pas plate.
		expect(new Set(connues(f).map((c) => c.join('-'))).size).toBeGreaterThanOrEqual(4);
	});

	it('un franchissement le MERCREDI colore sa semaine, pas la suivante', () => {
		const f = friseComposition(
			[motProgresse(['atelier', dansSemaine(5)])],
			false,
			dansSemaine(1),
			NOW,
		)!;
		expect(f.semaines).toEqual(rangee(SANS_VOIX, [null, 1], [{ neuf: 1 }, 4], [{ atelier: 1 }, 7]));
	});

	it('dimanche 23:59:59.999 → la semaine qui se termine ; lundi 00:00 → celle qui ouvre', () => {
		const borne = dansSemaine(1);
		const dimanche = friseComposition(
			[motProgresse(['atelier', finDe(5) - 1])],
			false,
			borne,
			NOW,
		)!;
		expect(dimanche.semaines).toEqual(
			rangee(SANS_VOIX, [null, 1], [{ neuf: 1 }, 4], [{ atelier: 1 }, 7]),
		);
		const lundi = friseComposition([motProgresse(['atelier', finDe(5)])], false, borne, NOW)!;
		expect(lundi.semaines).toEqual(
			rangee(SANS_VOIX, [null, 1], [{ neuf: 1 }, 5], [{ atelier: 1 }, 6]),
		);
	});

	it('FENÊTRE GLISSANTE : une semaine plus tard, chaque colonne a reculé d’un cran', () => {
		// Un off-by-one dans l'indexation ne se voit qu'ici.
		const mots = quatreMots();
		const borne = dansSemaine(0);
		const avant = friseComposition(mots, false, borne, NOW)!;
		const apres = friseComposition(mots, false, borne, joursApres(NOW, 7))!;
		// Prémisse : sans elle, deux rangées VIDES satisferaient l'égalité sans rien prouver.
		expect(new Set(connues(avant).map((c) => c.join('-'))).size).toBeGreaterThan(1);
		expect(apres.semaines.slice(0, NB_SEMAINES - 1)).toEqual(avant.semaines.slice(1));
	});

	it('INVARIANT : d’une colonne à la suivante, aucun mot ne redescend l’escalier', () => {
		// `validerMode` ne pose que `true` : le nombre de mots ayant ATTEINT un rang donné ne peut
		// que croître. (Une composition peut reculer visuellement quand le parent ajoute un mot —
		// mais alors le mot ajouté est neuf sur TOUTES les colonnes, y compris les anciennes.)
		const jeux: [MotOrtho[], boolean][] = [
			[quatreMots(), false],
			[quatreMots(), true],
			[
				[
					motAncien('atelier'),
					motProgresse(['atelier', dansSemaine(3)], ['tuiles', dansSemaine(7)]),
				],
				true,
			],
			[
				[
					motProgresse(
						['atelier', dansSemaine(1)],
						['tuiles', dansSemaine(4)],
						['motCache', dansSemaine(4)],
						['dictee', dansSemaine(10)],
					),
					motVierge(),
				],
				true,
			],
		];
		let comparaisons = 0;
		for (const [i, [mots, dispo]] of jeux.entries())
			for (const borne of [Infinity, dansSemaine(0), dansSemaine(5), dansSemaine(-9)]) {
				const f = friseComposition(mots, dispo, borne, NOW)!;
				const colonnes = connues(f);
				comparaisons += Math.max(0, colonnes.length - 1);
				for (let c = 1; c < colonnes.length; c++)
					for (let k = 0; k < f.paliers.length; k++) {
						const cumul = (x: number[]) => x.slice(k).reduce((a, b) => a + b, 0);
						expect(
							cumul(colonnes[c]),
							`jeu ${i} borne ${borne} — colonne ${c}, rang ${f.paliers[k]}`,
						).toBeGreaterThanOrEqual(cumul(colonnes[c - 1]));
					}
			}
		expect(comparaisons).toBeGreaterThan(100); // l'invariant n'est pas éprouvé sur du vide
	});

	it('critère 13 : un mot ajouté hier est « neuf » sur les colonnes ANCIENNES', () => {
		// « un mot ajouté hier apparaît autrement qu'au bas de l'escalier sur les colonnes
		// anciennes » = violation. La contrepartie assumée : la liste « grandit »
		// rétrospectivement, son total étant celui d'aujourd'hui.
		const anciens = [
			motProgresse(['atelier', dansSemaine(2)], ['tuiles', dansSemaine(3)]),
			motProgresse(['atelier', dansSemaine(2)], ['tuiles', dansSemaine(3)]),
		];
		const nouveau = motProgresse(['atelier', dansSemaine(11)]);
		const f = friseComposition([...anciens, nouveau], false, dansSemaine(1), NOW)!;
		expect(f.total).toBe(3);
		expect(f.semaines).toEqual(
			rangee(
				SANS_VOIX,
				[null, 1],
				[{ neuf: 3 }, 1],
				[{ neuf: 1, atelier: 2 }, 1],
				[{ neuf: 1, tuiles: 2 }, 8],
				[{ atelier: 1, tuiles: 2 }, 1],
			),
		);
		// Le mot ajouté est « neuf » sur TOUTES les colonnes anciennes, jamais ailleurs.
		expect(
			connues(f)
				.slice(0, -1)
				.every((c) => c[0] >= 1),
		).toBe(true);
	});
});

/* ============================================================
   4. Branchement dans listesOrthoProfil — critères 5, 6, 13
   ============================================================ */
function ecrire(uuid: string, key: string, valeur: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(valeur));
}
/** Liste du profil ACTIF. */
function creerListe(label: string, mots: string[]): string {
	const s = loadOrtho();
	const l = createListe(
		s,
		label,
		mots.map((mot) => ({ mot })),
	);
	saveOrtho(s);
	return l.id;
}
/** Fait franchir une marche aux `n` premiers mots de la liste, à l'instant donné. */
function seance(listeId: string, n: number, etape: EtapeOrtho, quand: number): void {
	const s = loadOrtho();
	const liste = s.listes.find((l) => l.id === listeId)!;
	liste.motIds.slice(0, n).forEach((id) => franchir(s.banque[id], etape, quand));
	saveOrtho(s);
}
const ligne = (listeId: string, dispo = false, now = NOW) =>
	listesOrthoProfil(activeProfile(), dispo, now).find((l) => l.id === listeId)!;

describe('listesOrthoProfil — la composition arrive sur la ligne de la liste', () => {
	it('la ligne porte la frise de composition, dernière colonne = la répartition du jour', () => {
		const id = creerListe('Semaine 1', ['chat', 'chien', 'avion']);
		seance(id, 2, 'atelier', dansSemaine(4));
		seance(id, 1, 'tuiles', dansSemaine(7));
		const l = ligne(id);
		expect(l.composition!.total).toBe(3);
		expect(l.composition!.semaines).toEqual(
			rangee(
				SANS_VOIX,
				[null, 4],
				[{ neuf: 1, atelier: 2 }, 3],
				[{ neuf: 1, atelier: 1, tuiles: 1 }, 5],
			),
		);
	});

	it('liste SANS mot attendu → pas de composition (rien à répartir)', () => {
		const id = creerListe('Vide', []);
		expect(ligne(id).nbMots).toBe(0);
		expect(ligne(id).composition).toBeNull();
	});

	it('dictée prédéfinie ÉPINGLÉE mais jamais commencée : une ligne, pas de composition', () => {
		// Le premier des deux chemins réels. L'adulte pousse une dictée AVANT que l'enfant ne la
		// rencontre : la ligne existe (c'est un suivi voulu), aucun de ses mots n'est en banque.
		// Douze colonnes « rien de commencé » n'ajouteraient rien au mot d'état de la ligne.
		const p = activeProfile();
		const predef = ORTHO_PREDEF[0];
		toggleRevoirFor(p.uuid, orthoRevoirId(predef.id));
		const l = ligne(predef.id);
		expect(l.epingle).toBe(true); // prémisse : sans l'épingle, la ligne n'existerait pas
		expect(l.niveau).toBe('a-decouvrir');
		expect(l.nbMots).toBeGreaterThan(0); // des mots ATTENDUS, simplement aucun matérialisé
		expect(l.composition).toBeNull();
	});

	it('liste VIDÉE de ses mots travaillés : la composition se tait, puis revient', () => {
		// Le second chemin réel, et celui qui montre que la règle porte sur l'état du JOUR et non
		// sur l'historique : la liste a eu une composition, le parent retire les mots commencés,
		// elle n'en a plus — puis elle en retrouve une dès qu'un mot restant franchit une marche.
		const id = creerListe('Semaine 1', ['chat', 'chien']);
		seance(id, 2, 'atelier', dansSemaine(4));
		expect(ligne(id).composition).not.toBeNull();
		const s = loadOrtho();
		expect(
			updateListe(
				s,
				id,
				'Semaine 1',
				['avion', 'ours'].map((mot) => ({ mot })),
			),
		).not.toBeNull();
		saveOrtho(s);
		expect(ligne(id).niveau).toBe('a-decouvrir');
		expect(ligne(id).composition).toBeNull();
		seance(id, 1, 'atelier', dansSemaine(10));
		expect(ligne(id).composition).not.toBeNull();
		expect(ligne(id).composition!.semaines[11]).toEqual(col(SANS_VOIX, { neuf: 1, atelier: 1 }));
	});

	it('critère 6 : la ligne bouge après une séance où AUCUN mot ne devient maîtrisé', () => {
		const id = creerListe('Semaine 1', ['chat', 'chien', 'avion', 'ours']);
		seance(id, 4, 'atelier', dansSemaine(6));
		const avant = ligne(id);
		seance(id, 3, 'tuiles', dansSemaine(9));
		const apres = ligne(id);
		// Ce que la ligne montrait déjà n'a pas bougé…
		expect(apres.niveau).toBe(avant.niveau);
		expect(apres.maitrises).toBe(avant.maitrises);
		// … la composition du jour, si.
		expect(avant.composition!.semaines[11]).toEqual(col(SANS_VOIX, { atelier: 4 }));
		expect(apres.composition!.semaines[11]).toEqual(col(SANS_VOIX, { atelier: 1, tuiles: 3 }));
	});

	it('critère 7 : la voix de synthèse change l’escalier de la ligne, pas la liste', () => {
		const id = creerListe('Semaine 1', ['chat']);
		seance(id, 1, 'atelier', dansSemaine(4));
		seance(id, 1, 'tuiles', dansSemaine(5));
		seance(id, 1, 'motCache', dansSemaine(6));
		expect(ligne(id, false).composition!.paliers).toEqual(SANS_VOIX);
		expect(ligne(id, false).composition!.semaines[11]).toEqual(col(SANS_VOIX, { motCache: 1 }));
		expect(ligne(id, false).niveau).toBe('acquis'); // le sommet coïncide avec « acquise »
		expect(ligne(id, true).composition!.paliers).toEqual(AVEC_VOIX);
		expect(ligne(id, true).composition!.semaines[11]).toEqual(col(AVEC_VOIX, { motCache: 1 }));
		expect(ligne(id, true).niveau).toBe('en-cours');
	});

	it('la composition porte sur la MÊME population que le compte de la ligne', () => {
		const id = creerListe('Semaine 1', ['chat', 'chien', 'avion']);
		seance(id, 1, 'atelier', dansSemaine(5));
		const l = ligne(id);
		expect(l.composition!.total).toBe(motsAttendusLecon(loadOrtho(), id).length);
		expect(l.composition!.total).toBe(avancementLecon(loadOrtho(), id, false).total);
	});

	it('la borne lue est celle du DATAGE, pas celle des paliers de liste', () => {
		// Les deux journaux n'ont pas la même ancienneté : reprendre la borne des paliers ferait
		// dire à la composition qu'elle connaît des semaines où aucune date de mot ne s'écrivait,
		// et elle y montrerait tous les mots au bas de l'escalier — l'affirmation fausse même que
		// la borne existe pour empêcher.
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat', 'chien']);
		seance(id, 1, 'atelier', dansSemaine(8)); // seule date connue du datage
		ecrire(p.uuid, ORTHO_PALIERS_KEY, { [id]: { enCours: dansSemaine(2) } });
		ecrire(p.uuid, ORTHO_PALIERS_DEBUT_KEY, dansSemaine(1)); // le journal des LISTES est ancien
		const l = ligne(id);
		expect(l.frise!.semaines[3]).not.toBe('inconnu'); // la frise d'états, elle, affirme
		expect(l.composition!.semaines.slice(0, 8).every((c) => c === null)).toBe(true);
		expect(l.composition!.semaines[8]).toEqual(col(SANS_VOIX, { neuf: 1, atelier: 1 }));
		// La borne PROPRE au datage, elle, éclaire aussitôt : ce qui change est la borne LUE.
		ecrire(p.uuid, ORTHO_ETAPES_DEBUT_KEY, dansSemaine(1));
		expect(ligne(id).composition!.semaines).toEqual(
			rangee(SANS_VOIX, [null, 1], [{ neuf: 2 }, 7], [{ neuf: 1, atelier: 1 }, 4]),
		);
	});

	it('BOUT EN BOUT : la fin de séance pose la borne, la ligne montre la composition', () => {
		const id = creerListe('Semaine 1', ['chat', 'chien']);
		seance(id, 2, 'atelier', dansSemaine(6));
		journaliserPaliersOrtho(false, dansSemaine(6));
		expect(ligne(id).composition!.semaines).toEqual(
			rangee(SANS_VOIX, [null, 6], [{ atelier: 2 }, 6]),
		);
	});
});

/* ============================================================
   5. Critères NÉGATIFS mécanisables — 19, 20, 22
   ============================================================ */
describe('ce que cette tranche ne doit PAS toucher', () => {
	it('critère 19 : l’échelle d’états des listes reste à TROIS valeurs', () => {
		expect(ORDRE_NIVEAUX_ORTHO).toEqual(['a-decouvrir', 'en-cours', 'acquis']);
		expect(ORDRE_NIVEAUX_ORTHO).not.toContain('non-acquis'); // pas de « à renforcer » ici
	});

	it('critère 19 : aucune ligne de liste ne sort de ces trois valeurs', () => {
		const id = creerListe('Semaine 1', ['chat', 'chien', 'avion']);
		for (const etape of ['atelier', 'tuiles', 'motCache', 'dictee'] as EtapeOrtho[]) {
			seance(id, 2, etape, dansSemaine(4));
			for (const dispo of [false, true])
				expect(ORDRE_NIVEAUX_ORTHO, `${etape} voix=${dispo}`).toContain(ligne(id, dispo).niveau);
		}
	});

	it('critère 20 : la méta datée survit à l’arrivée de la composition', () => {
		// « acquise le… », « passée en cours le… » viennent du journal `ludaskia_paliersOrtho`. La
		// composition s'ajoute à la ligne, elle ne remplace pas ces dates.
		expect(ORTHO_PALIERS_KEY).toBe('ludaskia_paliersOrtho');
		const p = activeProfile();
		const id = creerListe('Semaine 1', ['chat']);
		seance(id, 1, 'atelier', dansSemaine(4));
		journaliserPaliersOrtho(false, dansSemaine(4));
		seance(id, 1, 'tuiles', dansSemaine(6));
		seance(id, 1, 'motCache', dansSemaine(6));
		journaliserPaliersOrtho(false, dansSemaine(6));
		const l = ligne(id);
		expect(l.frise!.enCoursDepuis).toBe(dansSemaine(4));
		expect(l.frise!.acquisDepuis).toBe(dansSemaine(6));
		expect(l.composition).not.toBeNull(); // les deux cohabitent sur la même ligne
		const journal = lsGetRaw(p.uuid + '/' + ORTHO_PALIERS_KEY, {}) as Record<string, PaliersNotion>;
		expect(journal[id]).toEqual({ enCours: dansSemaine(4), acquis: dansSemaine(6) });
	});

	it('critère 22 : la frise d’ÉTATS des leçons est intacte, échelle à quatre valeurs comprise', () => {
		// Elle partage la cascade de cellules avec les frises de liste : un remaniement fait pour
		// la composition ne doit pas la déplacer. Le détail est éprouvé dans frise-etats.test.ts ;
		// ici, deux rangées témoins et le cran « à renforcer », qui n'existe que côté leçon.
		expect(
			friseNotion({ enCours: dansSemaine(6) }, undefined, 'en-cours', dansSemaine(-6), NOW)!
				.semaines,
		).toEqual([...repete('inconnu', 6), ...repete('en-cours', 6)]);
		const aRenforcer = friseNotion({}, undefined, 'non-acquis', dansSemaine(4), NOW)!;
		expect(aRenforcer.semaines).toEqual([...repete('inconnu', 4), ...repete('non-acquis', 8)]);
		// Et une cellule d'état ne devient pas `null` : l'inconnu s'y dit toujours 'inconnu'.
		expect(aRenforcer.semaines).not.toContain(null);
	});
});
