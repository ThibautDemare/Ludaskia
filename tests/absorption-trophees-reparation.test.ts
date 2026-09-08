/* ============================================================
   #640 (lot de suite) + #660 — LES SAUTS DE MÉTRIQUE SONT ABSORBÉS À L'ACTIVATION DU PROFIL.

   LE DÉFAUT. La réparation des escaliers troués (`reparerEscalier`, appelée par
   `parseOrtho`, donc à TOUTE lecture) fait monter d'un coup des mots hérités au rang
   « maîtrisé ». Or les compteurs d'orthographe (`orthoMotsMaitrises`,
   `orthoListesMaitrisees`) sont recalculés à CHAQUE `evaluateTrophies()`, y compris à la
   fin de n'importe quelle leçon (`recordLessonRun`), où les nouveaux trophées sont
   CÉLÉBRÉS. Un enfant pouvait donc voir surgir « Nouveau trophée : Collectionneur de
   mots » à la fin d'un exercice de multiplication, sans avoir touché à l'orthographe.

   L'EXIGENCE ÉPROUVÉE ICI, dérivée de la décision du mainteneur (absorber le saut au
   moment où le profil devient actif, sans célébration) et non de l'implémentation :
   1. après l'activation, le prochain `evaluateTrophies()` ne rend plus rien de neuf —
      donc AUCUNE leçon ultérieure ne peut célébrer ces trophées ;
   2. le trophée est bel et bien ACQUIS et visible en galerie : on absorbe le moment, pas
      la récompense (l'enfant avait réellement prouvé ces mots) ;
   3. il est acquis pour LE profil qu'on active, pas pour celui qu'on quitte ;
   4. CONTRE-ÉPREUVE, sans laquelle rien n'est prouvé : un seuil franchi normalement,
      par du vrai travail APRÈS l'activation, est toujours rendu par `evaluateTrophies()`
      et toujours annoncé en fin de leçon. Le rattrapage ne rend pas le mécanisme muet.

   D'OÙ VIENNENT LES ATTENDUS. Les seuils ne sont jamais écrits en dur : ils sont lus dans
   la table `TROPHIES` (la donnée fait foi), par métrique et par plus petit palier — un
   seuil déplacé de 10 à 8 redimensionne la fixture au lieu de faire rougir le test. La
   taille de la banque semée se DÉDUIT du seuil.

   COMMENT L'ÉTAT HÉRITÉ EST POSÉ : par `lsSetRaw`, en JSON brut, comme le ferait un vrai
   localStorage écrit par une version d'avant #641 (même parti pris que
   `escalier-troue-migration.test.ts`). Aucun chemin d'écriture de l'appli n'est emprunté :
   un tel état n'est plus fabricable depuis #641.

   LE MÊME DÉFAUT, DEUXIÈME CAUSE (#660). Les deux familles adossées à la répétition
   espacée — mots ancrés (`orthoMotsAncres`) et notions ancrées (`notionsAncrees`, carte brute
   `ludaskia_lessonRevision`) — sont recalculées par le MÊME `evaluateTrophies()`, et leur
   premier palier est à 1. Or la répétition espacée existe depuis #45 : le jour où ces
   familles sortent, des profils réels ont DÉJÀ des éléments au sommet de l'escalier, et
   l'enfant verrait « Premier mot qui tient » surgir à la fin d'un exercice de
   multiplication. Un commentaire de `profiles.ts` affirme que le rattrapage de #640
   consomme ce retard-là aussi ; la section 3 est ce qui le vérifie. L'écart y est MESURÉ,
   pas supposé : son premier cas évalue l'état hérité SANS l'étape d'activation et montre
   qu'il rendrait bien deux trophées neufs — c'est ce retour non vide qu'une fin de leçon
   célébrerait. Les états « au sommet » sont dérivés des fonctions pures de `revision.ts`
   (PALIER_ACQUIS réussites), jamais écrits en dur.

   CE QU'ON N'ÉPROUVE PAS ICI : ni le nom ni l'emplacement de la fonction d'absorption —
   le contrat de surface est « après activation, plus rien de neuf à rendre ».
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { setOnDataWrite, lsSetRaw } from '../src/core/storage';
import {
	initProfiles,
	activeProfile,
	addProfile,
	setActiveProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import {
	ajouterMots,
	avancerMotRevision,
	loadOrtho,
	saveOrtho,
	ORTHO_KEY,
} from '../src/core/orthographe/store';
import { marquerAtelierFait, validerMode } from '../src/core/orthographe/runner';
import {
	TROPHIES,
	evaluateTrophies,
	gSnapshot,
	loadTrophies,
	trophiesVisibles,
} from '../src/core/rewards';
import type { Trophy } from '../src/core/rewards';
import { recordLessonRun } from '../src/core/lesson-run';
import { getAllLessons } from '../src/core/catalog';
import { JOUR, PALIER_ACQUIS, avancerEtat, estAcquis, etatNeuf } from '../src/core/revision';
import {
	LESSON_REVISION_KEY,
	avancerLessonRevision,
	loadLessonRevisions,
} from '../src/core/progress';
import type { EtatRevision, MotOrtho, OrthoState } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Les seuils, lus dans la table des trophées ---------- */

/** Le plus petit palier d'une famille de trophées à seuil. C'est LUI qui dimensionne la
    fixture : la banque semée porte juste de quoi le franchir, pas un nombre magique. */
function premierPalier(metrique: string): Trophy {
	const famille = TROPHIES.filter((t) => t.metric === metrique && typeof t.n === 'number');
	if (!famille.length) throw new Error(`aucun trophée à seuil sur la métrique ${metrique}`);
	return famille.reduce((a, b) => (a.n! <= b.n! ? a : b));
}
const TROPHEE_MOTS = () => premierPalier('orthoMotsMaitrises'); // « Collectionneur de mots » (10)
const TROPHEE_LISTE = () => premierPalier('orthoListesMaitrisees'); // « Première liste » (1)
const TROPHEE_ESSAI = () => premierPalier('totalRuns'); // « Premier pas » (1 bilan)
const TROPHEE_MOTS_ANCRES = () => premierPalier('orthoMotsAncres'); // #660, premier palier
const TROPHEE_NOTIONS = () => premierPalier('notionsAncrees'); // #660, premier palier

/** Les trophées que la réparation peut faire franchir : les deux seules familles dont la
    métrique dépend de `validation` (mots maîtrisés, listes maîtrisées). */
const familleOrtho = (): Trophy[] =>
	TROPHIES.filter((t) => t.metric === 'orthoMotsMaitrises' || t.metric === 'orthoListesMaitrisees');

/** Les deux familles adossées à la répétition espacée (#660), dont le retard hérité doit
    être absorbé par le même rattrapage. */
const famillesAncrees = (): Trophy[] =>
	TROPHIES.filter((t) => t.metric === 'orthoMotsAncres' || t.metric === 'notionsAncrees');

/* ---------- Banque HÉRITÉE (écrite avant #641) ---------- */

const MOTS = [
	'cheval',
	'oiseau',
	'maison',
	'bateau',
	'fenêtre',
	'montagne',
	'famille',
	'journée',
	'panier',
	'tortue',
	'chemin',
	'village',
	'bouteille',
	'lumière',
];

/** Un mot de banque tel qu'une version d'avant #641 a pu l'écrire.
    `troue` : le mot caché a été réussi (marche haute) sans que les tuiles soient validées.
    L'escalier a un trou ; la réparation le comble à la lecture, ce qui fait passer le mot
    au rang « maîtrisé » (mot caché ET tuiles). */
function motHerite(i: number, troue: boolean, now: number): MotOrtho {
	return {
		id: 'w' + String(i),
		mot: MOTS[i % MOTS.length],
		entourage: [],
		atelierFait: true,
		validation: { tuiles: false, motCache: troue, dictee: false },
		franchissements: troue
			? { atelier: now - 90 * JOUR, motCache: now - 60 * JOUR }
			: { atelier: now - 90 * JOUR },
		revision: {
			palier: 2,
			prochaineRevision: now + 3 * JOUR,
			reussites: 2,
			dernierTest: now - JOUR,
		},
		origine: 'liste',
	};
}

/** Écrit BRUTALEMENT la banque d'un profil : `troues` mots à escalier troué + `neufs` mots
    encore vierges, tous dans UNE liste (c'est elle que compte `orthoListesMaitrisees`). */
function semerBanqueHeritee(uuid: string, troues: number, neufs = 0): void {
	const now = Date.now();
	const banque: Record<string, MotOrtho> = {};
	const motIdParForme: Record<string, string> = {};
	for (let i = 0; i < troues + neufs; i++) {
		const m = motHerite(i, i < troues, now);
		banque[m.id] = m;
		motIdParForme[m.mot.toLowerCase()] = m.id;
	}
	const state: OrthoState = {
		banque,
		listes: [
			{
				id: 'L1',
				label: 'Semaine 1',
				motIds: Object.keys(banque),
				createdAt: now - 100 * JOUR,
				updatedAt: now - 100 * JOUR,
			},
		],
		motIdParForme,
	};
	lsSetRaw(uuid + '/' + ORTHO_KEY, JSON.stringify(state));
}

/** Le lancement SUIVANT de l'appli : la méta existe déjà, le profil (re)devient actif. */
const relancerLAppli = () => initProfiles();

/* ---------- Une leçon réelle, pour jouer la fin d'exercice ---------- */

function leconMaths() {
	const l = getAllLessons().find((x) => x.subject === 'math' && x.levels.includes('ce2'));
	if (!l) throw new Error('aucune leçon de maths CE2 au catalogue');
	return l;
}

/** Ce qu'un runner enregistre à la fin d'un essai de leçon sans faute. */
function finDeLecon(lessonId: string, ok = 10) {
	return recordLessonRun({
		mode: 'lecon',
		lessonId,
		ok,
		questionCount: ok,
		ms: 60_000,
		perLesson: { [lessonId]: { ok, total: ok } },
	});
}

/* ---------- États DÉJÀ AU SOMMET de la répétition espacée (#660) ---------- */

/** L'état d'un élément arrivé au sommet de l'escalier : le RÉSULTAT de `PALIER_ACQUIS`
    réussites, chacune à son échéance, dérivé des fonctions pures de `revision.ts`. Jamais un
    littéral `{ palier: 6 }` : si l'escalier change de hauteur, la fixture suit. */
function etatAncre(depart: number): EtatRevision {
	let e = etatNeuf(depart);
	let t = depart;
	for (let i = 0; i < PALIER_ACQUIS; i++) {
		t = e.prochaineRevision ?? t;
		e = avancerEtat(e, true, t);
	}
	return e;
}

/** Formes uniques au-delà de `MOTS` : deux mots de même forme ne sont pas une banque
    réaliste (l'appli dédup par forme normalisée), et feraient rétrécir la fixture. */
const formeUnique = (i: number): string =>
	MOTS[i % MOTS.length] + (i < MOTS.length ? '' : String(i));

/** Un mot hérité dont l'escalier de révision est au sommet, tel qu'un profil ouvert bien
    avant #660 le porte. AUCUNE marche de validation n'est cochée : `reparerEscalier` ne
    comble que SOUS une marche validée, donc `orthoMotsMaitrises` reste à zéro et seules les
    métriques de #660 bougent — ce qui isole ce qu'on éprouve du défaut de #640. */
function motAncreHerite(i: number, now: number): MotOrtho {
	const decouverte = now - 200 * JOUR; // l'escalier a eu le temps de monter (137 jours mini)
	return {
		id: 'anc' + String(i),
		mot: formeUnique(i),
		entourage: [],
		atelierFait: true,
		validation: { tuiles: false, motCache: false, dictee: false },
		franchissements: { atelier: decouverte },
		revision: etatAncre(decouverte),
		origine: 'liste',
	};
}

/** Écrit brutalement une banque de `n` mots déjà ancrés (JSON brut, comme un vrai
    localStorage d'avant la mise à jour). */
function semerMotsAncresHerites(uuid: string, n: number): void {
	const now = Date.now();
	const banque: Record<string, MotOrtho> = {};
	const motIdParForme: Record<string, string> = {};
	for (let i = 0; i < n; i++) {
		const m = motAncreHerite(i, now);
		banque[m.id] = m;
		motIdParForme[m.mot.toLowerCase()] = m.id;
	}
	const state: OrthoState = {
		banque,
		listes: [
			{
				id: 'L1',
				label: 'Semaine 1',
				motIds: Object.keys(banque),
				createdAt: now - 300 * JOUR,
				updatedAt: now - 300 * JOUR,
			},
		],
		motIdParForme,
	};
	lsSetRaw(uuid + '/' + ORTHO_KEY, JSON.stringify(state));
}

/** Écrit brutalement `n` paires leçon × niveau déjà ancrées dans la carte BRUTE des
    révisions de leçons — c'est elle que compte `notionsAncrees`, pas la vue scopée. */
function semerNotionsAncreesHeritees(uuid: string, n: number): string[] {
	const now = Date.now();
	const paires = getAllLessons()
		.flatMap((l) => l.levels.map((lv) => `${l.id}@${lv}`))
		.sort()
		.slice(0, n);
	expect(paires.length).toBe(n); // le catalogue doit avoir de quoi atteindre le seuil
	const carte: Record<string, EtatRevision> = {};
	for (const k of paires) carte[k] = etatAncre(now - 200 * JOUR);
	lsSetRaw(uuid + '/' + LESSON_REVISION_KEY, JSON.stringify(carte));
	return paires;
}

/** L'état hérité complet de #660 : de quoi franchir le premier palier des DEUX familles,
    la taille se déduisant des seuils lus dans `TROPHIES`. */
function semerAncragesHerites(uuid: string): void {
	semerMotsAncresHerites(uuid, TROPHEE_MOTS_ANCRES().n!);
	semerNotionsAncreesHeritees(uuid, TROPHEE_NOTIONS().n!);
}

/* ---------- Le même sommet, mais atteint par du VRAI TRAVAIL (contre-épreuve) ---------- */

/** Un mot découvert à l'atelier puis réussi à chaque échéance, par les chemins du runner
    d'orthographe (aucune écriture brute ici : c'est le travail de l'enfant). */
function travaillerMotJusquAuSommet(forme: string, now: number): void {
	const etat = loadOrtho();
	const [id] = ajouterMots(etat, [{ mot: forme }], 'liste');
	marquerAtelierFait(etat.banque[id], now);
	let t = now;
	for (let i = 0; i < PALIER_ACQUIS; i++) {
		t = etat.banque[id].revision.prochaineRevision ?? t;
		avancerMotRevision(etat, id, true, t);
	}
	saveOrtho(etat);
	expect(estAcquis(loadOrtho().banque[id].revision)).toBe(true); // le sommet est bien atteint
}

/** Une notion menée au sommet par le hook réel de la séance de révision. */
function travaillerNotionJusquAuSommet(lessonId: string, now: number): void {
	let t = now;
	for (let i = 0; i < PALIER_ACQUIS; i++) {
		avancerLessonRevision(lessonId, true, t);
		t = loadLessonRevisions()[lessonId]?.prochaineRevision ?? t;
	}
	expect(estAcquis(loadLessonRevisions()[lessonId])).toBe(true);
}

/* ============================================================
   1. LE MOMENT EST ABSORBÉ
   ============================================================ */
describe('#640 — le saut de la réparation est absorbé quand le profil devient actif', () => {
	it('après l’activation, plus rien de neuf n’est à rendre', () => {
		const seuil = TROPHEE_MOTS().n!;
		semerBanqueHeritee(activeProfile().uuid, seuil);
		expect(loadTrophies()).toEqual([]); // prémisse : rien n’a encore été évalué

		relancerLAppli();

		// (i) le saut a bien eu lieu — sans lui, le test ne prouverait rien : les mots hérités
		// ne portaient AUCUNE marche « tuiles » en stockage, et pèsent pourtant le seuil une
		// fois relus.
		expect(gSnapshot().orthoMotsMaitrises).toBeGreaterThanOrEqual(seuil);
		// (ii) et il ne reste rien à célébrer : le prochain appel — celui de n’importe quelle
		// fin de leçon — ne rend plus rien.
		expect(evaluateTrophies()).toEqual([]);
	});

	it('la fin d’une leçon de maths ne célèbre aucun trophée d’orthographe', () => {
		// Le défaut tel que l’enfant le vivait : « Nouveau trophée : Collectionneur de mots »
		// au bout d’un exercice de multiplication, sans avoir touché à l’orthographe.
		semerBanqueHeritee(activeProfile().uuid, TROPHEE_MOTS().n!);
		relancerLAppli();

		const res = finDeLecon(leconMaths().id);

		const idsOrtho = new Set(familleOrtho().map((t) => t.id));
		expect(res.newTrophies.filter((t) => idsOrtho.has(t.id))).toEqual([]);
		// Rien de ce qui est ANNONCÉ à l’enfant ne nomme un trophée d’orthographe, quelle que
		// soit la phrase qui le porterait.
		const annonce = res.celeb.map((c) => c.text).join(' | ');
		for (const t of familleOrtho()) expect(annonce, t.title).not.toContain(t.title);
	});

	it('le trophée est ACQUIS et visible en galerie : on absorbe le moment, pas la récompense', () => {
		semerBanqueHeritee(activeProfile().uuid, TROPHEE_MOTS().n!);
		relancerLAppli();

		const acquis = new Set(loadTrophies());
		const visibles = trophiesVisibles();
		for (const t of [TROPHEE_MOTS(), TROPHEE_LISTE()]) {
			// L’enfant avait réellement prouvé ces mots : la reconnaissance lui reste due, elle
			// est simplement marquée sans moment.
			expect(acquis.has(t.id), `${t.title} acquis`).toBe(true);
			expect(
				visibles.some((v) => v.id === t.id),
				`${t.title} en galerie`,
			).toBe(true);
		}
	});

	it('c’est le profil ACTIVÉ qui reçoit le trophée, pas celui qu’on quitte', () => {
		// Le trophée est une donnée par profil : absorber avant que le préfixe ait basculé le
		// créditerait à l’enfant qui vient de rendre la place.
		const premier = activeProfile();
		const zoe = addProfile('Zoé'); // devient actif, banque vide
		semerBanqueHeritee(zoe.uuid, TROPHEE_MOTS().n!);
		setActiveProfile(premier.uuid);
		expect(loadTrophies()).toEqual([]); // prémisse : personne n’a encore rien

		setActiveProfile(zoe.uuid);
		expect(loadTrophies()).toContain(TROPHEE_MOTS().id);
		expect(evaluateTrophies()).toEqual([]); // et rien ne reste à célébrer côté Zoé

		setActiveProfile(premier.uuid);
		expect(loadTrophies()).not.toContain(TROPHEE_MOTS().id);
	});
});

/* ============================================================
   2. CONTRE-ÉPREUVE — le mécanisme n'est pas devenu muet
   ------------------------------------------------------------
   Sans cette section, la précédente serait satisfaite par un `evaluateTrophies` qui ne
   rendrait plus jamais rien : ce qu'on garde, c'est que le rattrapage absorbe le saut
   HÉRITÉ, et lui seul.
   ============================================================ */
describe('#640 — un seuil franchi par du vrai travail reste célébrable', () => {
	it('le mot que l’enfant travaille APRÈS l’activation fait rendre le trophée', () => {
		const seuil = TROPHEE_MOTS().n!;
		// Une marche de moins que le seuil : le saut hérité ne le franchit pas, et le dernier
		// mot de la liste attend encore d’être travaillé.
		semerBanqueHeritee(activeProfile().uuid, seuil - 1, 1);
		relancerLAppli();

		const acquis = loadTrophies();
		expect(acquis).not.toContain(TROPHEE_MOTS().id); // prémisse : rien n’est encore acquis…
		expect(acquis).not.toContain(TROPHEE_LISTE().id);
		expect(gSnapshot().orthoMotsMaitrises).toBe(seuil - 1);

		// … puis l’enfant réussit pour de bon le mot caché du dernier mot (ce que fait le
		// runner d’orthographe à chaque réussite).
		const etat = loadOrtho();
		validerMode(etat.banque['w' + String(seuil - 1)], 'motCache');
		saveOrtho(etat);

		const rendus = evaluateTrophies().map((t) => t.id);
		expect(rendus).toContain(TROPHEE_MOTS().id);
		expect(rendus).toContain(TROPHEE_LISTE().id);
	});

	it('la fin d’une leçon annonce toujours le trophée qu’elle vient de faire gagner', () => {
		// Même profil, même banque héritée absorbée : ce que l’enfant gagne MAINTENANT lui est
		// bien annoncé. C’est l’annonce elle-même qui doit rester vivante, pas seulement le
		// marquage.
		semerBanqueHeritee(activeProfile().uuid, TROPHEE_MOTS().n!);
		relancerLAppli();

		const t = TROPHEE_ESSAI(); // « Premier pas » : un premier bilan terminé
		expect(loadTrophies()).not.toContain(t.id); // prémisse : aucun bilan au compteur
		const res = recordLessonRun({
			mode: 'express',
			lessonId: null,
			ok: 8,
			questionCount: 10,
			ms: 60_000,
			perLesson: { [leconMaths().id]: { ok: 8, total: 10 } },
		});

		expect(res.newTrophies.map((x) => x.id)).toContain(t.id);
		expect(res.celeb.map((c) => c.text).join(' | ')).toContain(t.title);
	});
});

/* ============================================================
   3. #660 — LE MÊME RETARD, SUR LES DEUX FAMILLES ADOSSÉES À LA RÉPÉTITION ESPACÉE
   ------------------------------------------------------------
   La répétition espacée tourne depuis #45 : quand ces familles sortent, des profils réels
   ont déjà des mots et des notions au sommet de l'escalier. Le premier cas MESURE l'écart
   (ce que rendrait l'évaluation sans l'étape d'activation), les deux suivants disent ce qui
   doit en rester, le dernier est la contre-épreuve propre à ces familles.
   ============================================================ */
describe('#660 — le retard des mots et notions déjà ancrés est absorbé lui aussi', () => {
	it('écart mesuré : sans l’étape d’activation, cet état hérité rendrait deux trophées neufs', () => {
		// Le monde SANS rattrapage : le même état, mais personne ne l’a consommé au moment où le
		// profil est devenu actif. C’est ce retour non vide qu’une fin de leçon célébrerait — et
		// c’est lui qui rend les deux cas suivants démonstratifs plutôt que tautologiques.
		semerAncragesHerites(activeProfile().uuid);

		const rendus = evaluateTrophies().map((t) => t.id);
		expect(rendus).toContain(TROPHEE_MOTS_ANCRES().id);
		expect(rendus).toContain(TROPHEE_NOTIONS().id);
	});

	it('après l’activation, ni le mot ni la notion déjà au sommet ne rendent plus rien de neuf', () => {
		semerAncragesHerites(activeProfile().uuid);
		expect(loadTrophies()).toEqual([]); // prémisse : rien n’a encore été évalué

		relancerLAppli();

		// (i) le retard existe bel et bien : les deux métriques pèsent leur seuil…
		const snap = gSnapshot();
		expect(snap.orthoMotsAncres).toBeGreaterThanOrEqual(TROPHEE_MOTS_ANCRES().n!);
		expect(snap.notionsAncrees).toBeGreaterThanOrEqual(TROPHEE_NOTIONS().n!);
		// (ii) … et il ne reste rien à célébrer : le prochain appel — celui de n’importe quelle
		// fin de leçon — ne rend plus rien.
		expect(evaluateTrophies()).toEqual([]);

		// Ce que l’enfant vit : une leçon de maths n’annonce aucun de ces paliers, quelle que
		// soit la phrase qui le porterait.
		const res = finDeLecon(leconMaths().id);
		const idsAncres = new Set(famillesAncrees().map((t) => t.id));
		expect(res.newTrophies.filter((t) => idsAncres.has(t.id))).toEqual([]);
		const annonce = res.celeb.map((c) => c.text).join(' | ');
		for (const t of famillesAncrees()) expect(annonce, t.title).not.toContain(t.title);
	});

	it('les deux trophées sont ACQUIS et visibles en galerie : on absorbe le moment, pas la récompense', () => {
		semerAncragesHerites(activeProfile().uuid);
		relancerLAppli();

		const acquis = new Set(loadTrophies());
		const visibles = trophiesVisibles();
		for (const t of [TROPHEE_MOTS_ANCRES(), TROPHEE_NOTIONS()]) {
			// L’enfant avait réellement tenu ces éléments dans le temps : la reconnaissance lui
			// reste due, elle est simplement marquée sans moment.
			expect(acquis.has(t.id), `${t.title} acquis`).toBe(true);
			expect(
				visibles.some((v) => v.id === t.id),
				`${t.title} en galerie`,
			).toBe(true);
		}
	});

	it('CONTRE-ÉPREUVE : un élément mené au sommet APRÈS l’activation est toujours rendu', () => {
		// Sans ce cas, un rattrapage qui rendrait `evaluateTrophies` définitivement muet sur ces
		// deux familles passerait les cas ci-dessus. Profil sans aucun ancrage hérité : le
		// premier palier des deux familles est encore à prendre, et c’est le travail du jour qui
		// va le franchir.
		relancerLAppli();
		expect(gSnapshot().orthoMotsAncres).toBe(0); // prémisse : rien n’est au sommet…
		expect(gSnapshot().notionsAncrees).toBe(0);
		expect(loadTrophies()).not.toContain(TROPHEE_MOTS_ANCRES().id);
		expect(loadTrophies()).not.toContain(TROPHEE_NOTIONS().id);

		const now = Date.now();
		for (let i = 0; i < TROPHEE_MOTS_ANCRES().n!; i++)
			travaillerMotJusquAuSommet(formeUnique(i), now);
		const lecons = getAllLessons()
			.filter((l) => l.levels.includes('ce2'))
			.slice(0, TROPHEE_NOTIONS().n!);
		expect(lecons.length).toBe(TROPHEE_NOTIONS().n!);
		for (const l of lecons) travaillerNotionJusquAuSommet(l.id, now);

		const rendus = evaluateTrophies().map((t) => t.id);
		expect(rendus).toContain(TROPHEE_MOTS_ANCRES().id);
		expect(rendus).toContain(TROPHEE_NOTIONS().id);
	});
});
