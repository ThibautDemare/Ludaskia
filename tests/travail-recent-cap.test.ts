/* ============================================================
   « Travaillé récemment » — mention d'un cap tout juste franchi (#536).
   `capDansFenetre`, `capAnnoncable` et leur branchement dans `travailRecent`
   (core/encadrant-stats.ts).
   ------------------------------------------------------------
   Attendus dérivés de l'ISSUE et de son commentaire d'élargissement du 26 août 2026,
   pas de la mécanique interne. Ce que l'issue promet, critère par critère :

   1. La mention n'apparaît QUE pour un franchissement POSITIF survenu dans la fenêtre
      affichée. Les fenêtres réelles sont celles du sélecteur du bloc (`PERIODES_TRAVAIL`,
      ui/encadrant-travail.ts) : 1 jour (« Aujourd'hui »), 2 jours, 7 jours (« 1 semaine »).
   2. Les paliers arrivent en PARAMÈTRE explicite — donc aucun test d'ici n'a besoin de
      monter un profil en localStorage pour éprouver la mention (`travailRecentProfil`,
      lui, est couvert dans travail-recent.test.ts).
   3. La comparaison se fait entre des HORODATAGES et une fenêtre en JOURS calendaires,
      SANS passer par la frise, qui raisonne en semaines. C'est le critère à dents : le
      calendrier de référence est un DIMANCHE, donc la semaine calendaire en cours a
      commencé six jours plus tôt. Un « aujourd'hui » lu à la semaine annoncerait des
      progrès vieux de six jours, et ces tests-là le disent.
   4. La fonction de décision elle-même, y compris sur des entrées absentes, vides,
      incohérentes ou abîmées.
   6. AUCUN état bas ou intermédiaire ne sort d'ici : le seul vocabulaire possible est
      {null, 'en-cours', 'acquis'}, jamais 'a-decouvrir' ni 'non-acquis' ni 'inconnu'.
   7. AUCUNE redondance avec la frise (#521) : la mention est PONCTUELLE — une valeur
      scalaire, au plus UNE par ligne, et pas de rangée de cellules sur ces lignes.
   8. AUCUN pourcentage, aucune note.

   Bornes retenues, et pourquoi :
   - borne basse INCLUSIVE, comme celle qui décide de l'appartenance d'une cible à la
     fenêtre (`lastAt`, cf. travail-recent.test.ts) : une mention qui apparaîtrait un jour
     plus tard que la ligne qu'elle décore serait incompréhensible ;
   - pas de borne HAUTE : rien dans ce bloc ne recale un horodatage sur `now` (une stat
     datée de demain est listée telle quelle), et inventer ici une règle que la sélection
     n'applique pas ferait deux calendriers dans le même bloc ;
   - un horodatage n'est un horodatage que s'il est un nombre FINI. C'est le standard du
     module (cf. son garde `horodatage`, dont le commentaire dit qu'il « coûte une ligne ») :
     `Infinity` passerait un simple `>= seuil` et annoncerait un cap franchi hors du temps,
     et une chaîne NUMÉRIQUE (import bancal, sauvegarde éditée à la main) le passerait
     aussi, par coercition.

   CLÉS DES DEUX JOURNAUX — le piège de cet élargissement, et la raison d'un describe entier :
   ils ne s'indexent pas pareil. Celui des LISTES est indexé par l'id NU de la liste (ce que
   `listesOrthoProfil` lui passe pour la frise) ; celui des LEÇONS par la clé de STOCKAGE
   namespacée par la classe (`recordMonteesPalier` écrit `math-doubles@ce2`, et
   `progressionProfil` le relit sous cette forme). Or une ligne de « Travaillé récemment » ne
   porte que l'id NU de sa leçon, puisqu'elle est dédoublonnée par leçon : l'adresser avec cet
   id nu ne trouve rien sur des données réelles, et la mention ne sortirait pour AUCUNE leçon.

   PLAFONNEMENT PAR L'ÉTAT COURANT (`capAnnoncable`). Les journaux de paliers sont MONOTONES :
   ils ne datent que les montées, jamais les redescentes. Un cap peut donc être DÉMENTI par
   l'état d'aujourd'hui, et l'annoncer ferait dire à cette ligne « tout juste acquise » pendant
   que l'accordéon du même écran dit « à renforcer ». La règle dérivée, la même que celle que
   `friseListeOrtho` s'applique déjà : n'annoncer un cap que si l'état COURANT le porte encore
   — « acquis » exige un état acquis, « en cours » exige au moins « en cours », et un état
   « à renforcer » ou « à découvrir » ne porte plus rien.
   Conséquence à éprouver pour elle-même : le filtrage passe AVANT le choix du plus haut. Un
   « acquis » démenti ne doit pas emporter avec lui un « en cours » de la même fenêtre qui,
   lui, est encore vrai — sinon la ligne se taît là où elle avait quelque chose de juste à dire.

   Les horodatages sont construits avec `new Date(a, m, j, h, min)` (heure LOCALE) et la
   borne de fenêtre est recalculée ICI en jours de calendrier (`borne`), volontairement pas
   avec `debutJourLocal` : si l'une des deux arithmétiques dérive, les attendus ne
   coïncident plus.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	capDansFenetre,
	capAnnoncable,
	travailRecent,
	travailRecentProfil,
	type CapFranchi,
	type CibleTravaillee,
	type GroupeTravail,
	type SourcesCapFranchi,
} from '../src/core/encadrant-stats';
import { getAllLessons, type LessonDef, type SubjectId } from '../src/core/catalog';
import {
	ACTIVITY_KEY,
	LESSON_PALIERS_KEY,
	LESSON_STATS_KEY,
	STARS_KEY,
	type PaliersNotion,
} from '../src/core/progress';
import { setOnDataWrite, lsSetRaw } from '../src/core/storage';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { loadOrtho, saveOrtho, saveOrthoFor, createListe } from '../src/core/orthographe/store';
import { niveauListeOrtho } from '../src/core/orthographe/progression';
import { ORTHO_PALIERS_KEY } from '../src/core/orthographe/paliers';
import { niveauNotion, type LessonStat, type NiveauNotion } from '../src/core/maitrise';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import type { OrthoState } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Calendrier de référence ----------
   DIMANCHE 15 mars 2026, 10 h 30 (local), le même que travail-recent.test.ts. Le choix du
   dimanche est délibéré : la semaine CALENDAIRE en cours a commencé le lundi 9 mars, donc
   les fenêtres de 1 et 2 jours sont STRICTEMENT plus courtes qu'elle. Toute confusion
   jours/semaines se voit. */
const AUJ = (h: number, min = 0, s = 0, ms = 0) => new Date(2026, 2, 15, h, min, s, ms).getTime();
const HIER = (h: number, min = 0, s = 0, ms = 0) => new Date(2026, 2, 14, h, min, s, ms).getTime();
const AVANT_HIER = (h: number, min = 0) => new Date(2026, 2, 13, h, min, 0, 0).getTime();
const LUNDI_MEME_SEMAINE = (h: number, min = 0) => new Date(2026, 2, 9, h, min, 0, 0).getTime();
const MARDI_MEME_SEMAINE = (h: number, min = 0) => new Date(2026, 2, 10, h, min, 0, 0).getTime();
const SEMAINE_PRECEDENTE = (h: number, min = 0) => new Date(2026, 2, 4, h, min, 0, 0).getTime();
const NOW = AUJ(10, 30);
const HEURE = 3_600_000;

/* Les trois fenêtres RÉELLES du sélecteur (ui/encadrant-travail.ts). Écrites ici parce que
   `PERIODES_TRAVAIL` n'est pas exporté et que la section vit dans la couche UI ; le jour où
   une quatrième fenêtre apparaît, cette liste est le point à compléter. */
const FENETRES = [1, 2, 7] as const;

/* Borne basse de la fenêtre de `jours` jours : minuit LOCAL du (jours − 1)-ième jour avant
   `now`, aujourd'hui inclus. Arithmétique de calendrier écrite ici (cf. en-tête). */
function borne(now: number, jours: number): number {
	const d = new Date(now);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - (jours - 1));
	return d.getTime();
}

/* Valeur ABÎMÉE d'un journal : ni JSON, ni la sauvegarde d'un autre appareil, ni une horloge
   faussée ne respectent le type. Le cast EST l'objet du test. */
const abime = <T>(v: unknown): T => v as T;

/* ---------- Vocabulaire attendu ---------- */
const CAPS: readonly (CapFranchi | null)[] = ['en-cours', 'acquis', null];
/* Le bas de l'échelle d'états : rien de tout ça ne doit sortir d'ici (critère 6). */
const ETATS_BAS: readonly string[] = ['a-decouvrir', 'non-acquis', 'inconnu'];

/* ---------- Fabriques ---------- */
/* Stat de leçon minimale : seule `lastAt` décide de l'appartenance à la fenêtre. */
function stat(lastAt: number): LessonStat {
	return { attempts: 1, correct: 7, questions: 10, bestPct: 70, lastPct: 70, lastAt };
}
/* Stat FAIBLE : perf cumulée à 20 % sur 10 questions, donc « à renforcer » sur l'échelle de
   maîtrise (seuil 40 %, plancher d'échantillon 6 questions). Sert aux critères 6 et 3.c. */
function statFaible(lastAt: number): LessonStat {
	return { attempts: 2, correct: 2, questions: 10, bestPct: 20, lastPct: 20, lastAt };
}
const seanceLecon = (t: number, ref: string) => ({ t, k: 'lecon', ref });
const seanceDictee = (t: number, ref: string) => ({ t, k: 'dictee', ref });
/* Sources de la mention. Les étoiles et `dicteeDispo` ne servent QU'À établir l'état courant
   des cibles, donc à plafonner ; les tests qui portent sur la FENÊTRE les règlent de façon à
   ne rien plafonner (leçon étoilée, liste au plus haut), pour n'éprouver qu'une chose à la
   fois. Ceux qui portent sur le plafonnement les posent explicitement. */
const sources = (
	paliersLecons: Record<string, PaliersNotion> = {},
	paliersOrtho: Record<string, PaliersNotion> = {},
	etoiles: Record<string, number> = {},
	dicteeDispo = false,
): SourcesCapFranchi => ({ paliersLecons, paliersOrtho, etoiles, dicteeDispo });

const groupe = (res: GroupeTravail[], subject: SubjectId) => res.find((g) => g.subject === subject);
const cible = (res: GroupeTravail[], subject: SubjectId, id: string) =>
	(groupe(res, subject)?.cibles ?? []).find((c) => c.id === id);
const toutes = (res: GroupeTravail[]): CibleTravaillee[] => res.flatMap((g) => g.cibles);

function predefDeNiveau(niveau: 'ce2' | 'cm1') {
	const d = ORTHO_PREDEF.find((x) => x.niveau === niveau);
	if (!d) throw new Error('aucune dictée prédéfinie ' + niveau);
	return d;
}
function leconTelleQue(pred: (l: LessonDef) => boolean, quoi: string): LessonDef {
	const l = getAllLessons().find(pred);
	if (!l) throw new Error('aucune leçon ' + quoi);
	return l;
}
/* Leçon de maths distincte des « Doubles », pour tenir deux lignes à la fois. */
const autreLeconMaths = () =>
	leconTelleQue(
		(l) => l.subject === 'math' && l.id !== 'math-doubles',
		'de maths autre que les doubles',
	);

/* Clé du journal des paliers de LEÇON, telle que `recordMonteesPalier` l'écrit : la clé de
   STOCKAGE, namespacée par la classe sous laquelle la leçon a été jouée (`math-doubles@ce2`),
   exactement comme les stats et les étoiles. Le journal des LISTES, lui, est indexé par l'id
   NU de la liste (`friseListeOrtho` le lit ainsi dans `listesOrthoProfil`) : les deux
   familles n'ont donc PAS la même clé, ce qui est le piège de cet élargissement. */
const clePalierLecon = (lessonId: string, niveau = 'ce2') => `${lessonId}@${niveau}`;

/* Mention portée par UNE leçon du catalogue travaillée dans la fenêtre. `lastAt` par défaut ce
   matin : la ligne existe alors dans les trois fenêtres, et seul le journal varie. La leçon est
   ÉTOILÉE, donc son état courant est « acquis » et ne plafonne rien — ces tests-ci portent sur
   la fenêtre, le plafonnement a son propre describe. */
function capLecon(paliers: PaliersNotion, jours: number, lastAt = AUJ(9, 0)) {
	const res = travailRecent(
		{ 'math-doubles@ce2': stat(lastAt) },
		[seanceLecon(lastAt, 'math-doubles')],
		null,
		sources({ [clePalierLecon('math-doubles')]: paliers }, {}, { 'math-doubles@ce2': 1 }),
		jours,
		NOW,
	);
	return cible(res, 'math', 'math-doubles')!.capFranchi;
}

/* ---------- Listes de dictée à l'état COURANT voulu ----------
   L'état d'une liste se lit sur ses mots, pas sur un champ : c'est donc par les mots qu'un test
   le règle. Un mot « maîtrisé » a son atelier fait et TOUS ses modes validés, un mot « neuf »
   n'a rien — ces deux formes-là donnent le même état quelle que soit la dispo du TTS, ce qui
   isole le plafonnement de la question `dicteeDispo` (traitée à part). */
type EtatListe = 'a-decouvrir' | 'en-cours' | 'acquis';
function maitriser(ortho: OrthoState, motId: string, dictee = true): void {
	ortho.banque[motId].atelierFait = true;
	ortho.banque[motId].validation = { tuiles: true, motCache: true, dictee };
}
function listeAvecEtat(
	etat: EtatListe,
	label = 'Mots du lundi',
): { ortho: OrthoState; id: string } {
	const ortho = loadOrtho();
	const liste = createListe(ortho, label, [{ mot: 'chat' }, { mot: 'chien' }]);
	if (etat === 'acquis') liste.motIds.forEach((mid) => maitriser(ortho, mid));
	if (etat === 'en-cours') maitriser(ortho, liste.motIds[0]); // le second reste neuf
	saveOrtho(ortho);
	return { ortho, id: liste.id };
}
/* Mention portée par UNE liste travaillée dans la fenêtre. État courant « acquis » par défaut,
   pour la même raison que la leçon étoilée ci-dessus : ne rien plafonner. */
function capDictee(
	paliers: PaliersNotion,
	jours: number,
	etat: EtatListe = 'acquis',
	seance = AUJ(9, 0),
	dicteeDispo = false,
) {
	const { ortho, id } = listeAvecEtat(etat);
	const res = travailRecent(
		{},
		[seanceDictee(seance, id)],
		ortho,
		sources({}, { [id]: paliers }, {}, dicteeDispo),
		jours,
		NOW,
	);
	return cible(res, 'francais', id)!.capFranchi;
}

/* ============================================================
   1. capDansFenetre — la fonction de décision (critère 4)
   ============================================================ */
describe('capDansFenetre — critère 4 : entrées absentes, vides, incohérentes', () => {
	const SEUIL = LUNDI_MEME_SEMAINE(0, 0); // borne d'une fenêtre de 7 jours au 15 mars
	const DEDANS = MARDI_MEME_SEMAINE(10, 0);
	const DEHORS = SEMAINE_PRECEDENTE(10, 0);

	it('journal ABSENT (undefined) → null', () => {
		// Le cas ORDINAIRE : la cible n'a rien fait franchir, donc rien à annoncer.
		expect(capDansFenetre(undefined, SEUIL)).toBeNull();
	});

	it('journal VIDE ({}) → null', () => {
		expect(capDansFenetre({}, SEUIL)).toBeNull();
	});

	it('« en cours » seul, dans la fenêtre → « en-cours »', () => {
		expect(capDansFenetre({ enCours: DEDANS }, SEUIL)).toBe('en-cours');
	});

	it('« acquis » seul, dans la fenêtre → « acquis »', () => {
		expect(capDansFenetre({ acquis: DEDANS }, SEUIL)).toBe('acquis');
	});

	it('les DEUX dans la fenêtre → le plus HAUT gagne, et lui seul', () => {
		// « Commencée puis acquise » sur une seule ligne raconterait deux fois le même élan.
		expect(capDansFenetre({ enCours: DEDANS, acquis: DEDANS + HEURE }, SEUIL)).toBe('acquis');
		// L'ordre des clés de l'objet ne décide de rien.
		expect(capDansFenetre({ acquis: DEDANS + HEURE, enCours: DEDANS }, SEUIL)).toBe('acquis');
	});

	it('les DEUX hors fenêtre → null (rien n’a bougé pendant la période affichée)', () => {
		expect(capDansFenetre({ enCours: DEHORS, acquis: DEHORS + HEURE }, SEUIL)).toBeNull();
	});

	it('« acquis » dedans, « en cours » dehors → « acquis »', () => {
		// Le cas le plus courant d'une vraie acquisition : la notion avait démarré avant.
		expect(capDansFenetre({ enCours: DEHORS, acquis: DEDANS }, SEUIL)).toBe('acquis');
	});

	it('journal INCOHÉRENT (« acquis » plus ancien que « en cours ») → le cap franchi DANS la fenêtre', () => {
		// Forme que `recordMonteesPalier` ne produit pas (horloge faussée, import bancal). La
		// définition s'applique telle quelle — « le plus haut franchi DEPUIS le seuil » — plutôt
		// que d'inventer une règle de réparation : seul « en cours » a été franchi ici.
		expect(capDansFenetre({ acquis: DEHORS, enCours: DEDANS }, SEUIL)).toBe('en-cours');
	});

	it('un cap dans la fenêtre, l’autre explicitement undefined → celui qui existe', () => {
		expect(capDansFenetre({ enCours: DEDANS, acquis: undefined }, SEUIL)).toBe('en-cours');
		expect(capDansFenetre({ enCours: undefined, acquis: DEDANS }, SEUIL)).toBe('acquis');
	});
});

describe('capDansFenetre — critère 3 : bornes serrées', () => {
	const SEUIL = HIER(0, 0); // borne d'une fenêtre de 2 jours au 15 mars

	it('1 ms AVANT le seuil → null', () => {
		expect(capDansFenetre({ acquis: SEUIL - 1 }, SEUIL)).toBeNull();
		expect(capDansFenetre({ enCours: SEUIL - 1 }, SEUIL)).toBeNull();
	});

	it('EXACTEMENT sur le seuil → compté (borne basse INCLUSIVE, comme celle de la sélection)', () => {
		expect(capDansFenetre({ acquis: SEUIL }, SEUIL)).toBe('acquis');
		expect(capDansFenetre({ enCours: SEUIL }, SEUIL)).toBe('en-cours');
	});

	it('1 ms APRÈS le seuil → compté', () => {
		expect(capDansFenetre({ acquis: SEUIL + 1 }, SEUIL)).toBe('acquis');
	});

	it('la nuit d’un changement de jour se coupe à minuit, à la milliseconde', () => {
		// Fenêtre d'« aujourd'hui » : 23 h 59 min 59 s 999 la veille est dehors, minuit dedans.
		const minuit = borne(NOW, 1);
		expect(minuit).toBe(AUJ(0, 0, 0, 0)); // prémisse
		expect(capDansFenetre({ acquis: HIER(23, 59, 59, 999) }, minuit)).toBeNull();
		expect(capDansFenetre({ acquis: AUJ(0, 0, 0, 0) }, minuit)).toBe('acquis');
		expect(capDansFenetre({ acquis: AUJ(0, 0, 0, 1) }, minuit)).toBe('acquis');
	});
});

describe('capDansFenetre — critère 4 : valeurs abîmées', () => {
	const SEUIL = HIER(0, 0);

	/* Un horodatage doit être un nombre FINI. Ce que chaque valeur casserait sur un `>= seuil`
	   nu est écrit à côté : deux d'entre elles le PASSENT. */
	const ABIMEES: [string, unknown][] = [
		['NaN', Number.NaN],
		['Infinity (passe un >= nu : cap franchi hors du temps)', Number.POSITIVE_INFINITY],
		['-Infinity', Number.NEGATIVE_INFINITY],
		['null (ce que JSON écrit à la place d’un undefined)', null],
		['chaîne de date', '2026-03-14'],
		['chaîne NUMÉRIQUE (passe un >= nu par coercition)', String(HIER(0, 0) + 1000)],
		['booléen', true],
		['objet', { at: HIER(9, 0) }],
	];

	for (const [etiquette, v] of ABIMEES) {
		it(`« acquis » = ${etiquette} → ignoré, aucun cap annoncé`, () => {
			expect(capDansFenetre(abime<PaliersNotion>({ acquis: v }), SEUIL)).toBeNull();
		});
		it(`« en cours » = ${etiquette} → ignoré, aucun cap annoncé`, () => {
			expect(capDansFenetre(abime<PaliersNotion>({ enCours: v }), SEUIL)).toBeNull();
		});
	}

	it('un cap SAIN survit à côté d’un cap abîmé', () => {
		// Une entrée corrompue ne doit pas faire taire l'autre : le journal reste exploitable.
		expect(
			capDansFenetre(abime<PaliersNotion>({ acquis: 'demain', enCours: HIER(9, 0) }), SEUIL),
		).toBe('en-cours');
	});

	it('journal lui-même abîmé (null, tableau, chaîne, nombre) → null, sans lever', () => {
		for (const j of [null, [], 'acquis', 42])
			expect(capDansFenetre(abime<PaliersNotion | undefined>(j), SEUIL)).toBeNull();
	});
});

/* Énumération EXHAUSTIVE du produit (valeur de « en cours ») × (valeur de « acquis ») ×
   (fenêtre réelle), confrontée au contrat énoncé dans l'en-tête et non à l'implémentation :
   « acquis » si et seulement si `acquis` est un horodatage exploitable au moins égal au
   seuil, sinon « en-cours » sous la même condition sur `enCours`, sinon null. Les cas
   incohérents et abîmés sont DANS l'énumération : ils ne forment pas un régime à part. */
describe('capDansFenetre — invariants sur toute l’énumération', () => {
	const exploitable = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

	function casPossibles(seuil: number): { etiquette: string; v: unknown }[] {
		return [
			{ etiquette: 'absent', v: undefined },
			{ etiquette: 'seuil − 1 ms', v: seuil - 1 },
			{ etiquette: 'seuil pile', v: seuil },
			{ etiquette: 'seuil + 1 ms', v: seuil + 1 },
			{ etiquette: 'bien avant', v: seuil - 30 * 86400000 },
			{ etiquette: 'bien après', v: seuil + 6 * HEURE },
			{ etiquette: 'NaN', v: Number.NaN },
			{ etiquette: 'Infinity', v: Number.POSITIVE_INFINITY },
			{ etiquette: 'null', v: null },
			{ etiquette: 'chaîne numérique', v: String(seuil + 1000) },
		];
	}

	it('le résultat suit le contrat sur les 300 combinaisons, trois fenêtres comprises', () => {
		let vus = 0;
		let acquis = 0;
		let enCours = 0;
		for (const jours of FENETRES) {
			const seuil = borne(NOW, jours);
			for (const e of casPossibles(seuil))
				for (const a of casPossibles(seuil)) {
					const attendu: CapFranchi | null =
						exploitable(a.v) && a.v >= seuil
							? 'acquis'
							: exploitable(e.v) && e.v >= seuil
								? 'en-cours'
								: null;
					expect(
						capDansFenetre(abime<PaliersNotion>({ enCours: e.v, acquis: a.v }), seuil),
						`${jours} j — en cours : ${e.etiquette} / acquis : ${a.etiquette}`,
					).toBe(attendu);
					vus++;
					if (attendu === 'acquis') acquis++;
					if (attendu === 'en-cours') enCours++;
				}
		}
		expect(vus).toBe(300);
		// L'énumération parcourt bien les trois issues, sinon l'invariant tiendrait par du vide.
		expect(acquis).toBeGreaterThan(50);
		expect(enCours).toBeGreaterThan(20);
	});

	it('critère 6 : jamais autre chose que null, « en-cours » ou « acquis »', () => {
		for (const jours of FENETRES) {
			const seuil = borne(NOW, jours);
			for (const e of casPossibles(seuil))
				for (const a of casPossibles(seuil)) {
					const r = capDansFenetre(abime<PaliersNotion>({ enCours: e.v, acquis: a.v }), seuil);
					expect(CAPS, `${e.etiquette} / ${a.etiquette}`).toContain(r);
					expect(ETATS_BAS).not.toContain(r);
				}
		}
	});
});

/* ============================================================
   2. Les trois fenêtres réelles (critère 1)
   ============================================================ */
describe('travailRecent — critère 1 : la mention ne sort que d’un franchissement dans la fenêtre', () => {
	for (const jours of FENETRES) {
		it(`fenêtre de ${jours} j : un cap sur la borne est annoncé, 1 ms plus tôt ne l'est pas`, () => {
			const seuil = borne(NOW, jours);
			expect(capLecon({ acquis: seuil }, jours, seuil)).toBe('acquis');
			// Même leçon, même séance : seule la date du cap change.
			expect(capLecon({ acquis: seuil - 1 }, jours, seuil)).toBeNull();
		});

		it(`fenêtre de ${jours} j : un cap de ce matin est annoncé sur une leçon comme sur une dictée`, () => {
			expect(capLecon({ enCours: AUJ(8, 0) }, jours)).toBe('en-cours');
			expect(capDictee({ enCours: AUJ(8, 0) }, jours)).toBe('en-cours');
		});
	}

	it('aucun cap daté → aucune mention, quelle que soit la fenêtre', () => {
		for (const jours of FENETRES) {
			expect(capLecon({}, jours)).toBeNull();
			expect(capDictee({}, jours)).toBeNull();
		}
	});

	it('un cap ANCIEN reste muet même sur la plus large des trois fenêtres', () => {
		// 8 jours en arrière : dehors même pour « 1 semaine ». C'est bien un franchissement
		// positif, mais pas « pendant la fenêtre affichée ».
		const vieux = new Date(2026, 2, 7, 12, 0, 0, 0).getTime();
		for (const jours of FENETRES) {
			expect(capLecon({ acquis: vieux }, jours)).toBeNull();
			expect(capDictee({ acquis: vieux }, jours)).toBeNull();
		}
	});

	it('la mention ne fabrique pas de ligne : sans travail dans la fenêtre, rien à décorer', () => {
		// Un cap franchi ce matin sur une leçon dont la dernière session date de huit jours (cap
		// tamponné par un chemin qui ne date pas la leçon) ne doit pas la faire remonter ici.
		const res = travailRecent(
			{ 'math-doubles@ce2': stat(new Date(2026, 2, 7, 12, 0, 0, 0).getTime()) },
			[],
			null,
			sources(
				{ [clePalierLecon('math-doubles')]: { acquis: AUJ(9, 0) } },
				{},
				{
					'math-doubles@ce2': 1,
				},
			),
			7,
			NOW,
		);
		expect(res).toEqual([]);
	});
});

/* ============================================================
   3. Jours, PAS semaines (critère 3)
   ------------------------------------------------------------
   Le cœur de l'issue. `NOW` est un DIMANCHE : la semaine calendaire en cours a commencé six
   jours plus tôt, donc une lecture « à la semaine » (celle de la frise) déborde très
   largement les fenêtres de 1 et 2 jours.
   ============================================================ */
describe('travailRecent — critère 3 : fenêtre en JOURS, sans passer par la frise', () => {
	it('« Aujourd’hui » : un cap de lundi dernier est MUET, alors qu’il est dans la semaine en cours', () => {
		// Lu à la semaine, ce cap-là serait annoncé comme tout juste franchi alors qu'il a six
		// jours. C'est l'erreur que le critère 3 interdit.
		expect(capLecon({ acquis: LUNDI_MEME_SEMAINE(9, 0) }, 1)).toBeNull();
		expect(capLecon({ acquis: MARDI_MEME_SEMAINE(9, 0) }, 1)).toBeNull();
		expect(capDictee({ acquis: MARDI_MEME_SEMAINE(9, 0) }, 1)).toBeNull();
	});

	it('« Aujourd’hui » : un cap d’hier soir est MUET, bien qu’il soit dans la même semaine', () => {
		expect(capLecon({ enCours: HIER(21, 0) }, 1)).toBeNull();
		expect(capDictee({ enCours: HIER(21, 0) }, 1)).toBeNull();
	});

	it('« 2 jours » : hier est dedans, avant-hier dehors — la semaine ne s’en mêle pas', () => {
		expect(capLecon({ acquis: HIER(21, 0) }, 2)).toBe('acquis');
		expect(capLecon({ acquis: AVANT_HIER(23, 30) }, 2)).toBeNull();
	});

	it('« 1 semaine » = 7 jours glissants, pas la semaine calendaire', () => {
		// Le lundi de la semaine en cours est le 7e jour de la fenêtre : dedans. Le dimanche
		// d'avant (8 mars) n'y est pas, alors qu'il appartient à la SEMAINE précédente complète
		// — qu'une lecture hebdomadaire prendrait d'un bloc, du 2 au 8 mars.
		expect(capLecon({ acquis: LUNDI_MEME_SEMAINE(0, 0) }, 7)).toBe('acquis');
		expect(capLecon({ acquis: new Date(2026, 2, 8, 23, 30, 0, 0).getTime() }, 7)).toBeNull();
		expect(capLecon({ acquis: SEMAINE_PRECEDENTE(9, 0) }, 7)).toBeNull();
	});

	it('la coupure suit le jour LOCAL même en travers d’un changement d’heure', () => {
		// Lundi 30 mars 2026, lendemain du passage à l'heure d'été européenne : la veille n'a
		// duré que 23 h. Fenêtre de 2 jours → borne = 29 mars 00 h 00 LOCAL ; une soustraction
		// de 2 × 86 400 000 ms se tromperait d'une heure. (Sous un fuseau sans heure d'été,
		// comme la CI, le cas dégénère en cas nominal et reste vrai.)
		const lundi = new Date(2026, 2, 30, 9, 0, 0, 0).getTime();
		expect(borne(lundi, 2)).toBe(new Date(2026, 2, 29, 0, 0, 0, 0).getTime()); // prémisse
		const capA = (acquis: number) =>
			cible(
				travailRecent(
					{ 'math-doubles@ce2': stat(lundi - HEURE) },
					[],
					null,
					sources(
						{ [clePalierLecon('math-doubles')]: { acquis } },
						{},
						{
							'math-doubles@ce2': 1,
						},
					),
					2,
					lundi,
				),
				'math',
				'math-doubles',
			)!.capFranchi;
		expect(capA(new Date(2026, 2, 29, 0, 30, 0, 0).getTime())).toBe('acquis');
		expect(capA(new Date(2026, 2, 28, 23, 30, 0, 0).getTime())).toBeNull();
	});

	it('un même journal donne des réponses DIFFÉRENTES selon la fenêtre choisie', () => {
		// Preuve que la fenêtre est branchée sur `jours` et pas figée : le cap d'avant-hier
		// n'apparaît qu'à partir de « 1 semaine ».
		const p: PaliersNotion = { acquis: AVANT_HIER(10, 0) };
		expect(FENETRES.map((j) => capLecon(p, j))).toEqual([null, null, 'acquis']);
		expect(FENETRES.map((j) => capDictee(p, j))).toEqual([null, null, 'acquis']);
	});
});

/* ============================================================
   4. Deux journaux, deux familles (élargissement du 26 août 2026)
   ============================================================ */
describe('travailRecent — chaque famille lit SON journal de paliers', () => {
	it('une ligne « lecon » lit paliers.lecons, une ligne « dictee » lit paliers.ortho', () => {
		const { ortho, id } = listeAvecEtat('acquis');
		const res = travailRecent(
			{ 'math-doubles@ce2': stat(HIER(17, 0)) },
			[seanceDictee(HIER(18, 0), id)],
			ortho,
			sources(
				{ [clePalierLecon('math-doubles')]: { enCours: HIER(16, 0) } },
				{ [id]: { acquis: HIER(16, 0) } },
			),
			7,
			NOW,
		);
		const lecon = cible(res, 'math', 'math-doubles')!;
		const dictee = cible(res, 'francais', id)!;
		expect(lecon.kind).toBe('lecon'); // prémisses : les deux familles sont bien là
		expect(dictee.kind).toBe('dictee');
		// La leçon n'est pas étoilée mais sa perf récente est bonne : état « en cours », qui porte
		// bien le cap « en cours » du journal. La liste, elle, est acquise et porte le sien.
		expect(lecon.capFranchi).toBe('en-cours');
		expect(dictee.capFranchi).toBe('acquis');
	});

	it('AUCUNE fuite entre les deux journaux, même intervertis', () => {
		// Journaux CROISÉS : chaque cap est écrit dans le FORMAT de sa famille, mais rangé dans le
		// journal de l'AUTRE. Les deux lignes doivent rester muettes. Une source unique (un seul
		// journal pour tout, ou le mauvais des deux) allumerait ici les deux mentions.
		// Les deux cibles sont au PLUS HAUT état (leçon étoilée, liste acquise) : sans ça le test
		// passerait par le plafonnement au lieu de passer par le bon journal, et ne prouverait rien.
		const { ortho, id } = listeAvecEtat('acquis');
		const res = travailRecent(
			{ 'math-doubles@ce2': stat(HIER(17, 0)) },
			[seanceDictee(HIER(18, 0), id)],
			ortho,
			sources(
				{ [id]: { acquis: HIER(16, 0) } }, // id de liste dans le journal des leçons
				{ [clePalierLecon('math-doubles')]: { acquis: HIER(16, 0) } }, // et l'inverse
				{ 'math-doubles@ce2': 1 },
			),
			7,
			NOW,
		);
		expect(cible(res, 'math', 'math-doubles')!.capFranchi).toBeNull();
		expect(cible(res, 'francais', id)!.capFranchi).toBeNull();
	});

	it('un journal vide d’un côté n’empêche pas l’autre de parler', () => {
		expect(capLecon({ acquis: HIER(16, 0) }, 7)).toBe('acquis'); // paliers.ortho vide
		expect(capDictee({ acquis: HIER(16, 0) }, 7)).toBe('acquis'); // paliers.lecons vide
	});

	/* LE point sur lequel l'élargissement peut échouer en silence : les deux journaux n'ont pas
	   la même clé. Celui des LISTES est indexé par l'id nu de la liste ; celui des LEÇONS par la
	   clé de STOCKAGE namespacée (`recordMonteesPalier` écrit `math-doubles@ce2`, et c'est ainsi
	   que `progressionProfil` le relit pour la frise). Une ligne de « Travaillé récemment »,
	   elle, ne porte que l'id NU (elle est dédoublonnée par leçon). Chercher le journal avec cet
	   id nu ne trouve donc RIEN sur des données réelles, et la mention ne sortirait jamais pour
	   aucune leçon — panne invisible, puisque « pas de cap franchi » est le cas ordinaire. */
	it('le journal des leçons est adressé par la CLÉ DE STOCKAGE, pas par l’id nu de la ligne', () => {
		const res = travailRecent(
			{ 'math-doubles@ce2': stat(AUJ(9, 0)) },
			[],
			null,
			sources({ 'math-doubles@ce2': { acquis: AUJ(8, 0) } }, {}, { 'math-doubles@ce2': 1 }),
			7,
			NOW,
		);
		expect(cible(res, 'math', 'math-doubles')!.capFranchi).toBe('acquis');
	});

	it('leçon travaillée sous DEUX classes : le cap franchi sous l’une ou l’autre est annoncé', () => {
		// Aucun filtre de niveau dans ce bloc, et une seule ligne par leçon : le cap franchi sous
		// la classe CE2 est un franchissement de CETTE notion, même si la dernière session date
		// du CM1. Prendre la clé d'une seule des deux (celle de la session la plus récente, par
		// exemple) rendrait la mention dépendante d'un détail que le lecteur ne voit pas.
		const deuxNiveaux = leconTelleQue(
			(l) => l.levels.includes('ce2') && l.levels.includes('cm1'),
			'portant CE2 et CM1',
		);
		const res = travailRecent(
			{ [deuxNiveaux.id + '@ce2']: stat(HIER(17, 0)), [deuxNiveaux.id + '@cm1']: stat(AUJ(9, 0)) },
			[],
			null,
			// Cap et étoile sur la MÊME clé (@ce2) : l'état qui plafonne un cap doit se lire là où
			// le cap est écrit. Rien sous @cm1, où la leçon reste « en cours ».
			sources(
				{ [deuxNiveaux.id + '@ce2']: { acquis: HIER(16, 0) } },
				{},
				{
					[deuxNiveaux.id + '@ce2']: 1,
				},
			),
			7,
			NOW,
		);
		const lignes = groupe(res, deuxNiveaux.subject)!.cibles.filter((c) => c.id === deuxNiveaux.id);
		expect(lignes).toHaveLength(1); // prémisse : une seule ligne pour les deux clés
		expect(lignes[0].capFranchi).toBe('acquis');
	});

	it('clé de stats HÉRITÉE sans niveau : son journal se lit sous la même clé nue', () => {
		// Corollaire de la règle précédente, énoncée dans la bonne direction : la clé du journal
		// est CELLE DES STATS, et non « l'id plus @niveau ». Les deux formulations coïncident sur
		// les données namespacées et divergent sur une clé héritée, que le bloc liste déjà (cf.
		// travail-recent.test.ts). Indexer par la clé de stats la couvre sans rien coûter ;
		// recomposer `id + '@' + niveauOfKey(clé)` produirait ici `math-doubles@`.
		const res = travailRecent(
			{ 'math-doubles': stat(AUJ(9, 0)) },
			[],
			null,
			// Pas d'étoile : la perf récente de 70 % suffit à porter un cap « en cours ».
			sources({ 'math-doubles': { enCours: AUJ(8, 0) } }),
			7,
			NOW,
		);
		expect(cible(res, 'math', 'math-doubles')!.capFranchi).toBe('en-cours');
	});

	it('une liste du parent (id opaque) porte sa mention comme une dictée prédéfinie', () => {
		const { ortho, id } = listeAvecEtat('en-cours');
		const predef = predefDeNiveau('ce2');
		const res = travailRecent(
			{},
			[seanceDictee(HIER(18, 0), id), seanceDictee(HIER(17, 0), predef.id)],
			ortho,
			sources({}, { [id]: { enCours: HIER(16, 0) }, [predef.id]: { enCours: HIER(16, 0) } }),
			7,
			NOW,
		);
		expect(cible(res, 'francais', id)!.capFranchi).toBe('en-cours');
		// Une prédéfinie jamais commencée est « à découvrir » : son cap est donc plafonné, et c'est
		// bien ce qu'on veut — le tampon existe, mais plus aucun mot n'est commencé.
		expect(cible(res, 'francais', predef.id)!.capFranchi).toBeNull();
	});
});

/* ============================================================
   5. Critères négatifs 6, 7, 8
   ============================================================ */
describe('travailRecent — critères 6, 7, 8 : ce qui ne doit PAS sortir de ces lignes', () => {
	/* Jeu de lignes le plus large possible, croisé avec tous les journaux plausibles :
	   - une leçon ÉTOILÉE (état « acquis »), qui laisse passer les deux caps ;
	   - une leçon FAIBLE, non étoilée et sous les 40 % (état « à renforcer ») : celle que le
	     pédagogue veut voir non badgée, et qui doit rester muette QUEL QUE SOIT son journal ;
	   - une liste de dictée acquise, qui laisse passer les deux caps aussi.
	   Les trois états représentés font que l'invariant ne peut pas tenir par du silence. */
	function toutesLesLignes(paliers: PaliersNotion): CibleTravaillee[] {
		const { ortho, id } = listeAvecEtat('acquis');
		const faible = autreLeconMaths();
		return toutes(
			travailRecent(
				{ 'math-doubles@ce2': stat(HIER(17, 0)), [faible.id + '@ce2']: statFaible(HIER(16, 0)) },
				[seanceDictee(HIER(18, 0), id)],
				ortho,
				sources(
					{ [clePalierLecon('math-doubles')]: paliers, [clePalierLecon(faible.id)]: paliers },
					{ [id]: paliers },
					{ 'math-doubles@ce2': 1 },
				),
				7,
				NOW,
			),
		);
	}
	const LIGNE_FAIBLE = () => autreLeconMaths().id;
	const JOURNAUX_PLAUSIBLES: PaliersNotion[] = [
		{},
		{ enCours: HIER(9, 0) },
		{ acquis: HIER(9, 0) },
		{ enCours: HIER(9, 0), acquis: HIER(10, 0) },
		{ enCours: SEMAINE_PRECEDENTE(9, 0) },
		{ enCours: SEMAINE_PRECEDENTE(9, 0), acquis: HIER(9, 0) },
	];

	it('critère 6 : aucune ligne ne porte un état bas ou intermédiaire', () => {
		const vues = new Set<CapFranchi | null>();
		for (const p of JOURNAUX_PLAUSIBLES)
			for (const c of toutesLesLignes(p)) {
				expect(CAPS, `${c.id} / ${JSON.stringify(p)}`).toContain(c.capFranchi);
				expect(ETATS_BAS).not.toContain(c.capFranchi);
				vues.add(c.capFranchi);
			}
		// Les trois issues sont parcourues, sinon l'invariant tiendrait par du silence.
		expect([...vues].sort()).toEqual(['acquis', 'en-cours', null]);
	});

	it('critère 6 : la leçon FAIBLE reste muette sous TOUS les journaux (pas de « à renforcer » déguisé)', () => {
		// Une notion « à renforcer » ne porte plus aucun cap : même un « acquis » tamponné hier
		// n'est plus vrai d'elle. C'est le cœur de l'avis du pédagogue — rien de bas sur ces lignes,
		// et pas non plus un progrès démenti par l'état du jour.
		expect(niveauNotion(statFaible(HIER(16, 0)), false)).toBe('non-acquis'); // prémisse
		const faible = LIGNE_FAIBLE();
		for (const p of JOURNAUX_PLAUSIBLES) {
			const ligne = toutesLesLignes(p).find((c) => c.id === faible)!;
			expect(ligne.capFranchi, JSON.stringify(p)).toBeNull();
		}
	});

	it('critères 7 et 8 : une ligne n’a QUE ces sept champs — ni frise, ni pourcentage', () => {
		// Gate volontairement exhaustive : c'est par un champ ajouté « pour l'affichage » que la
		// frise ou un % reviendraient sur ces lignes. Un ajout légitime doit passer par ici.
		const attendu = ['capFranchi', 'contexte', 'derniereFois', 'id', 'kind', 'label', 'seances'];
		for (const c of toutesLesLignes({ acquis: HIER(9, 0) })) {
			expect(Object.keys(c).sort()).toEqual(attendu);
			expect(Object.keys(c).some((k) => /frise|semaine|pct|pourcent|note|score/i.test(k))).toBe(
				false,
			);
		}
	});

	it('critère 7 : la mention est PONCTUELLE — une valeur scalaire, au plus une par ligne', () => {
		// Pas une rangée de cellules, pas un couple (commencée, acquise) : la frise raconte la
		// trajectoire, cette ligne-ci ne dit qu'« il vient de se passer quelque chose ».
		for (const p of JOURNAUX_PLAUSIBLES)
			for (const c of toutesLesLignes(p)) {
				expect(Array.isArray(c.capFranchi)).toBe(false);
				expect(typeof c.capFranchi === 'string' || c.capFranchi === null).toBe(true);
			}
	});

	it('critère 8 : la mention ne transporte aucun chiffre', () => {
		// Le vocabulaire lui-même doit rester qualitatif : ni « acquis-80 », ni « 80 % », ni un
		// nombre déguisé en état.
		for (const p of JOURNAUX_PLAUSIBLES)
			for (const c of toutesLesLignes(p)) {
				expect(typeof c.capFranchi).not.toBe('number');
				if (c.capFranchi !== null) expect(c.capFranchi).not.toMatch(/[0-9%]/);
			}
	});
});

/* ============================================================
   6. capAnnoncable — le plafonnement par l'état COURANT
   ------------------------------------------------------------
   Règle dérivée (cf. en-tête) : n'annoncer un cap que si l'état d'aujourd'hui le porte encore.
   « acquis » exige un état acquis ; « en cours » exige au moins « en cours » ; « à renforcer »
   et « à découvrir » ne portent plus rien. Le filtrage passe AVANT le choix du plus haut.
   ============================================================ */
describe('capAnnoncable — un cap n’est annoncé que si l’état courant le porte encore', () => {
	const SEUIL = HIER(0, 0); // fenêtre de 2 jours au 15 mars
	const T = HIER(9, 0); // dans la fenêtre
	const AVANT = SEMAINE_PRECEDENTE(9, 0); // hors fenêtre

	const ETATS: NiveauNotion[] = ['a-decouvrir', 'non-acquis', 'en-cours', 'acquis'];

	it('LE cas qui compte : « acquis » démenti mais « en cours » encore vrai → « en-cours »', () => {
		// Les deux caps sont dans la fenêtre, l'état du jour est « en cours ». Plafonner APRÈS
		// avoir pris le plus haut rendrait `null` : la ligne se tairait alors qu'elle a un progrès
		// juste à annoncer, et le parent perdrait l'information pour la mauvaise raison.
		expect(capAnnoncable({ enCours: T, acquis: T + HEURE }, SEUIL, 'en-cours')).toBe('en-cours');
	});

	it('la même chose en « à renforcer » : les DEUX caps tombent, donc null', () => {
		expect(capAnnoncable({ enCours: T, acquis: T + HEURE }, SEUIL, 'non-acquis')).toBeNull();
		expect(capAnnoncable({ enCours: T, acquis: T + HEURE }, SEUIL, 'a-decouvrir')).toBeNull();
	});

	it('état « acquis » : rien n’est plafonné, le plus haut gagne comme avant', () => {
		expect(capAnnoncable({ enCours: T, acquis: T + HEURE }, SEUIL, 'acquis')).toBe('acquis');
		expect(capAnnoncable({ acquis: T }, SEUIL, 'acquis')).toBe('acquis');
		expect(capAnnoncable({ enCours: T }, SEUIL, 'acquis')).toBe('en-cours');
	});

	it('état « en cours » : le tampon « acquis » ne s’annonce pas, seul ou accompagné', () => {
		expect(capAnnoncable({ acquis: T }, SEUIL, 'en-cours')).toBeNull();
		expect(capAnnoncable({ enCours: T }, SEUIL, 'en-cours')).toBe('en-cours');
	});

	it('états bas : aucun journal ne produit de mention', () => {
		for (const etat of ['non-acquis', 'a-decouvrir'] as NiveauNotion[])
			for (const p of [{ enCours: T }, { acquis: T }, { enCours: T, acquis: T + HEURE }, {}])
				expect(capAnnoncable(p, SEUIL, etat), `${etat} / ${JSON.stringify(p)}`).toBeNull();
	});

	it('le plafonnement ne RATTRAPE pas un cap hors fenêtre', () => {
		// L'état courant autorise, mais la date ne suit pas : les deux conditions se cumulent, la
		// seconde ne remplace pas la première.
		expect(capAnnoncable({ acquis: AVANT }, SEUIL, 'acquis')).toBeNull();
		expect(capAnnoncable({ enCours: AVANT }, SEUIL, 'acquis')).toBeNull();
		// « acquis » démenti ET « en cours » hors fenêtre : rien à dire non plus.
		expect(capAnnoncable({ enCours: AVANT, acquis: T }, SEUIL, 'en-cours')).toBeNull();
	});

	it('journal absent ou vide → null quel que soit l’état', () => {
		for (const etat of ETATS) {
			expect(capAnnoncable(undefined, SEUIL, etat)).toBeNull();
			expect(capAnnoncable({}, SEUIL, etat)).toBeNull();
		}
	});

	it('valeurs abîmées : le plafonnement n’ouvre aucune porte que capDansFenetre fermait', () => {
		for (const v of [Number.NaN, Number.POSITIVE_INFINITY, null, String(HIER(9, 0)), true])
			for (const etat of ETATS) {
				expect(capAnnoncable(abime<PaliersNotion>({ acquis: v }), SEUIL, etat)).toBeNull();
				expect(capAnnoncable(abime<PaliersNotion>({ enCours: v }), SEUIL, etat)).toBeNull();
			}
	});

	/* Table complète : 4 états × 4 configurations de journal, toutes dans la fenêtre. Les attendus
	   sont posés à la main, ligne par ligne, depuis la règle énoncée en tête de section — pas
	   calculés par un modèle qui redirait la même cascade que le code. */
	it('les 16 combinaisons (état × journal) donnent bien ce que la règle annonce', () => {
		const table: [NiveauNotion, PaliersNotion, CapFranchi | null][] = [
			['a-decouvrir', {}, null],
			['a-decouvrir', { enCours: T }, null],
			['a-decouvrir', { acquis: T }, null],
			['a-decouvrir', { enCours: T, acquis: T + HEURE }, null],
			['non-acquis', {}, null],
			['non-acquis', { enCours: T }, null],
			['non-acquis', { acquis: T }, null],
			['non-acquis', { enCours: T, acquis: T + HEURE }, null],
			['en-cours', {}, null],
			['en-cours', { enCours: T }, 'en-cours'],
			['en-cours', { acquis: T }, null],
			['en-cours', { enCours: T, acquis: T + HEURE }, 'en-cours'],
			['acquis', {}, null],
			['acquis', { enCours: T }, 'en-cours'],
			['acquis', { acquis: T }, 'acquis'],
			['acquis', { enCours: T, acquis: T + HEURE }, 'acquis'],
		];
		for (const [etat, p, attendu] of table)
			expect(capAnnoncable(p, SEUIL, etat), `${etat} / ${JSON.stringify(p)}`).toBe(attendu);
	});

	it('critère 6 : la table entière ne produit que le vocabulaire autorisé', () => {
		for (const etat of ETATS)
			for (const p of [{}, { enCours: T }, { acquis: T }, { enCours: T, acquis: T + HEURE }]) {
				const r = capAnnoncable(p, SEUIL, etat);
				expect(CAPS).toContain(r);
				expect(ETATS_BAS).not.toContain(r);
			}
	});
});

/* ============================================================
   7. Le plafonnement sur les LIGNES — les redescentes réelles
   ------------------------------------------------------------
   Trois redescentes que le code cite, et qu'on rejoue ici de bout en bout : le parent ajoute un
   mot à une liste acquise, la voix de synthèse réapparaît, et la perf récente d'une leçon
   retombe sous les 40 %.
   ============================================================ */
describe('travailRecent — un cap DÉMENTI par l’état courant ne s’annonce pas', () => {
	/* Liste dont deux mots sont maîtrisés et un troisième jamais commencé : « en cours » quelle
	   que soit la dispo du TTS. C'est le parent qui ajoute un mot à une liste déjà acquise. */
	function listeAvecMotAjoute(): { ortho: OrthoState; id: string } {
		const ortho = loadOrtho();
		const liste = createListe(ortho, 'Mots du lundi', [
			{ mot: 'chat' },
			{ mot: 'chien' },
			{ mot: 'cheval' },
		]);
		liste.motIds.slice(0, 2).forEach((mid) => maitriser(ortho, mid));
		saveOrtho(ortho);
		return { ortho, id: liste.id };
	}
	const capListe = (ortho: OrthoState, id: string, p: PaliersNotion, dicteeDispo = false) =>
		cible(
			travailRecent(
				{},
				[seanceDictee(HIER(18, 0), id)],
				ortho,
				sources({}, { [id]: p }, {}, dicteeDispo),
				7,
				NOW,
			),
			'francais',
			id,
		)!.capFranchi;

	it('liste tamponnée « acquis » hier mais plus acquise aujourd’hui → aucune mention', () => {
		const { ortho, id } = listeAvecMotAjoute();
		// Prémisse : l'état courant contredit le tampon, et il le contredit quelle que soit la
		// voix de synthèse disponible.
		expect(niveauListeOrtho(ortho, id, false)).toBe('en-cours');
		expect(niveauListeOrtho(ortho, id, true)).toBe('en-cours');
		expect(capListe(ortho, id, { acquis: HIER(9, 0) })).toBeNull();
	});

	it('le cap « en cours » de la même liste, LUI, reste vrai et s’annonce', () => {
		// Contre-épreuve : le plafonnement ne doit pas éteindre les caps que l'état courant porte
		// encore, sinon la mention ne sortirait plus jamais. C'est le cas critique de
		// `capAnnoncable`, rejoué ici sur une vraie ligne.
		const { ortho, id } = listeAvecMotAjoute();
		expect(capListe(ortho, id, { enCours: HIER(9, 0), acquis: HIER(10, 0) })).toBe('en-cours');
	});

	it('liste vidée de ses mots commencés : même son « en cours » est démenti', () => {
		// L'autre redescente citée par le code : il ne reste que des mots neufs, la liste retombe
		// à « à découvrir ». Le tampon reste en place, mais plus rien ne le porte.
		const { ortho, id } = listeAvecEtat('a-decouvrir');
		expect(niveauListeOrtho(ortho, id, false)).toBe('a-decouvrir'); // prémisse
		expect(capListe(ortho, id, { enCours: HIER(9, 0), acquis: HIER(10, 0) })).toBeNull();
	});

	it('leçon tamponnée « en cours » mais retombée « à renforcer » → aucune mention', () => {
		const faible = autreLeconMaths();
		expect(niveauNotion(statFaible(HIER(16, 0)), false)).toBe('non-acquis'); // prémisse
		const res = travailRecent(
			{ [faible.id + '@ce2']: statFaible(HIER(16, 0)) },
			[],
			null,
			sources({ [clePalierLecon(faible.id)]: { enCours: HIER(9, 0) } }),
			7,
			NOW,
		);
		expect(cible(res, 'math', faible.id)!.capFranchi).toBeNull();
	});

	it('la MÊME leçon faible, mais ÉTOILÉE : son état est « acquis », donc rien n’est démenti', () => {
		// La nuance que les étoiles apportent, et sans laquelle la mention se tairait à tort :
		// l'étoile ne se retire jamais, donc une perf récente basse ne fait PAS redescendre une
		// leçon déjà acquise. Sans `etoiles` dans les sources, ce cas et le précédent seraient
		// indiscernables et l'un des deux serait faux.
		const faible = autreLeconMaths();
		expect(niveauNotion(statFaible(HIER(16, 0)), true)).toBe('acquis'); // prémisse
		const res = travailRecent(
			{ [faible.id + '@ce2']: statFaible(HIER(16, 0)) },
			[],
			null,
			sources(
				{ [clePalierLecon(faible.id)]: { enCours: HIER(9, 0) } },
				{},
				{
					[faible.id + '@ce2']: 1,
				},
			),
			7,
			NOW,
		);
		expect(cible(res, 'math', faible.id)!.capFranchi).toBe('en-cours');
	});
});

/* ============================================================
   8. `dicteeDispo` — le même journal, deux réponses
   ------------------------------------------------------------
   Le cas le plus retors de l'issue, et il n'est écrit nulle part ailleurs. L'« acquis » d'une
   liste dépend des modes REQUIS, et la dictée n'est requise que si une voix de synthèse est
   disponible (`modesRequis`). Une liste dont tous les mots ont validé tuiles et mot caché mais
   pas la dictée est donc acquise sur un appareil muet et « en cours » sur un appareil qui parle
   — sans qu'aucune donnée n'ait changé. Le plafonnement doit suivre ce basculement, sinon la
   mention contredit le mot d'état de l'onglet Suivi sur l'un des deux appareils.
   ============================================================ */
describe('travailRecent — le plafonnement d’une dictée suit la dispo de la voix', () => {
	/* Tous les mots travaillés SAUF la dictée : c'est l'état d'une liste finie sur un appareil
	   sans voix de synthèse, exactement le cas que `friseListeOrtho` documente. */
	function listeSansDictee(): { ortho: OrthoState; id: string } {
		const ortho = loadOrtho();
		const liste = createListe(ortho, 'Mots du lundi', [{ mot: 'chat' }, { mot: 'chien' }]);
		liste.motIds.forEach((mid) => maitriser(ortho, mid, false)); // dictée NON validée
		saveOrtho(ortho);
		return { ortho, id: liste.id };
	}
	const capListe = (ortho: OrthoState, id: string, p: PaliersNotion, dicteeDispo: boolean) =>
		cible(
			travailRecent(
				{},
				[seanceDictee(HIER(18, 0), id)],
				ortho,
				sources({}, { [id]: p }, {}, dicteeDispo),
				7,
				NOW,
			),
			'francais',
			id,
		)!.capFranchi;

	it('prémisse : la même liste est « acquise » sans voix et « en cours » avec', () => {
		const { ortho, id } = listeSansDictee();
		expect(niveauListeOrtho(ortho, id, false)).toBe('acquis');
		expect(niveauListeOrtho(ortho, id, true)).toBe('en-cours');
	});

	it('tampon « acquis » seul : annoncé sans voix, TAIRE avec (la voix a remis un mode requis)', () => {
		const { ortho, id } = listeSansDictee();
		expect(capListe(ortho, id, { acquis: HIER(9, 0) }, false)).toBe('acquis');
		expect(capListe(ortho, id, { acquis: HIER(9, 0) }, true)).toBeNull();
	});

	it('tampons « en cours » ET « acquis » : « acquis » sans voix, « en-cours » avec', () => {
		// Le cas le plus complet : le même journal, la même liste, deux réponses selon un booléen
		// qui ne vient même pas du stockage. Et du bon côté : avec la voix, la ligne ne se tait pas
		// pour autant — elle retombe sur le cap que l'état porte encore.
		const { ortho, id } = listeSansDictee();
		const p: PaliersNotion = { enCours: HIER(8, 0), acquis: HIER(9, 0) };
		expect(capListe(ortho, id, p, false)).toBe('acquis');
		expect(capListe(ortho, id, p, true)).toBe('en-cours');
	});

	it('`dicteeDispo` ne touche PAS les lignes de leçon', () => {
		// Les deux familles partagent un seul jeu de sources : le booléen destiné aux listes ne doit
		// pas se glisser dans le plafonnement d'une leçon.
		const journal = { [clePalierLecon('math-doubles')]: { acquis: AUJ(8, 0) } };
		const etoiles = { 'math-doubles@ce2': 1 };
		for (const dicteeDispo of [false, true]) {
			const res = travailRecent(
				{ 'math-doubles@ce2': stat(AUJ(9, 0)) },
				[],
				null,
				sources(journal, {}, etoiles, dicteeDispo),
				7,
				NOW,
			);
			expect(cible(res, 'math', 'math-doubles')!.capFranchi, `dicteeDispo=${dicteeDispo}`).toBe(
				'acquis',
			);
		}
	});
});

/* ============================================================
   9. travailRecentProfil — les sources viennent bien du stockage du profil
   ------------------------------------------------------------
   Les quatre sources sont lues ici, pas dans la fonction pure (critère 2). Ce dernier describe
   vérifie qu'aucune ne manque au passage : un journal lu sous la mauvaise clé, ou les étoiles
   oubliées, se verrait par une mention absente — et « pas de cap franchi » étant le cas
   ordinaire, rien d'autre ne le signalerait.

   `dicteeDispo` est OBLIGATOIRE, sans valeur par défaut, et c'est le compilateur qui tient
   cette moitié-là : le seul défaut envisageable (`false`) est aussi le plus optimiste, puisque
   sans voix une liste compte un mode requis de moins et s'acquiert donc plus tôt. Un appelant
   qui l'omettrait annoncerait des acquisitions que l'appareil de l'enfant démentirait, en
   silence. Aucun test ne peut couvrir ça, mais un paramètre requis, oui — d'où les `false`
   explicites ci-dessous, y compris là où la valeur n'a aucune incidence sur l'attendu.
   ============================================================ */
describe('travailRecentProfil — les quatre sources sont lues sur le profil consulté', () => {
	const ecrire = (uuid: string, key: string, valeur: unknown) =>
		lsSetRaw(uuid + '/' + key, JSON.stringify(valeur));

	it('journal des leçons ET étoiles : la mention arrive sur la ligne', () => {
		const p = activeProfile();
		ecrire(p.uuid, LESSON_STATS_KEY, { 'math-doubles@ce2': stat(AUJ(9, 0)) });
		ecrire(p.uuid, LESSON_PALIERS_KEY, { 'math-doubles@ce2': { acquis: AUJ(8, 0) } });
		ecrire(p.uuid, STARS_KEY, { 'math-doubles@ce2': 1 });
		const res = travailRecentProfil(p, 7, NOW, false);
		expect(cible(res, 'math', 'math-doubles')!.capFranchi).toBe('acquis');
	});

	it('étoiles ABSENTES du stockage : le même tampon « acquis » est démenti par la perf', () => {
		// Contre-épreuve de la lecture des étoiles : sans étoile et à 20 % de perf récente, la leçon
		// est « à renforcer » et son tampon ne s'annonce plus.
		const p = activeProfile();
		ecrire(p.uuid, LESSON_STATS_KEY, { 'math-doubles@ce2': statFaible(AUJ(9, 0)) });
		ecrire(p.uuid, LESSON_PALIERS_KEY, { 'math-doubles@ce2': { acquis: AUJ(8, 0) } });
		const res = travailRecentProfil(p, 7, NOW, false);
		expect(cible(res, 'math', 'math-doubles')!.capFranchi).toBeNull();
	});

	it('journal des LISTES et `dicteeDispo` : le 4e paramètre arrive jusqu’au plafonnement', () => {
		const p = activeProfile();
		const ortho = loadOrtho();
		const liste = createListe(ortho, 'Mots du lundi', [{ mot: 'chat' }, { mot: 'chien' }]);
		liste.motIds.forEach((mid) => maitriser(ortho, mid, false)); // tout sauf la dictée
		saveOrthoFor(p.uuid, ortho);
		ecrire(p.uuid, ACTIVITY_KEY, [seanceDictee(AUJ(9, 0), liste.id)]);
		ecrire(p.uuid, ORTHO_PALIERS_KEY, { [liste.id]: { acquis: AUJ(8, 0) } });
		// Appareil SANS voix : la dictée n'est pas un mode requis, la liste est donc bel et bien
		// acquise, et sa mention doit passer. Ce n'est pas une tolérance mais l'usage courant d'un
		// appareil muet — la fermer « par prudence » priverait ces profils de toute mention.
		expect(cible(travailRecentProfil(p, 7, NOW, false), 'francais', liste.id)!.capFranchi).toBe(
			'acquis',
		);
		// Appareil qui parle → la dictée redevient requise → l'« acquis » est démenti. Même profil,
		// même stockage, même instant : seul le booléen change.
		expect(
			cible(travailRecentProfil(p, 7, NOW, true), 'francais', liste.id)!.capFranchi,
		).toBeNull();
	});

	it('profil sans aucun journal → aucune mention, et rien ne casse', () => {
		const p = activeProfile();
		ecrire(p.uuid, LESSON_STATS_KEY, { 'math-doubles@ce2': stat(AUJ(9, 0)) });
		ecrire(p.uuid, STARS_KEY, { 'math-doubles@ce2': 1 });
		expect(
			cible(travailRecentProfil(p, 7, NOW, false), 'math', 'math-doubles')!.capFranchi,
		).toBeNull();
	});
});
