/* ============================================================
   Grammaire — « Clique sur le mot » : explication ↔ annonce de la réponse (#529).
   ------------------------------------------------------------
   CE QUE CE FICHIER GARDE (et pourquoi il existe)

   Après « Vérifier », le runner écrit dans une région live le verdict, puis
   l'explication rédigée de la leçon. Il y AJOUTE « La bonne réponse : … » — sauf si
   l'exercice porte `explicationNommeCible`, qui déclare que l'explication énonce
   DÉJÀ les mots-cibles. Deux façons de se tromper, aux conséquences opposées :

   - drapeau OUBLIÉ alors que l'explication cite la cible → l'enfant au lecteur
     d'écran entend DEUX FOIS la même énumération. C'est le défaut posé en #436 sur
     deux banques seulement et généralisé par #529 aux huit autres ;
   - drapeau POSÉ alors que l'explication ne cite pas la cible → la région live se
     TAIT sur la réponse. Plus grave : l'enfant n'a alors AUCUN canal pour
     l'apprendre (le surlignage vert de la phrase est purement visuel).

   Le défaut a survécu deux ans parce que rien ne reliait l'explication qu'on rédige
   au drapeau qu'on oublie. Ce fichier fait ce lien : la relation est vérifiée DANS
   LES DEUX SENS, pour toute leçon « clique sur le mot » du CATALOGUE — pas pour une
   liste de banques écrite à la main ici, qui reproduirait exactement l'oubli de #529
   (une banque neuve serait simplement absente de la liste).

   INDÉPENDANCE AUTEUR ≠ CODE. Les attendus ne sont pas relus du module :
   - le critère « l'explication nomme la cible » est dérivé de ce qu'ENTEND l'enfant,
     pas de la façon dont les explications sont fabriquées ;
   - la définition du MOT est ré-écrite ici (rien n'est importé du tokeniseur de la
     leçon), pour qu'un découpage trop laxiste côté données ne se valide pas lui-même.

   CE QUE « L'EXPLICATION CONTIENT LA CIBLE » VEUT DIRE ICI (arbitrages assumés) :
   1. MOT ENTIER, jamais sous-chaîne. « or » est dans « alors », « dort », « encore » ;
      « ni » est dans « niant » ; « et » est dans « cette ». Une sous-chaîne naïve
      déclarerait la cible nommée alors que l'enfant n'entend rien de tel, et le
      critère 1 exigerait alors un drapeau qui ferait TAIRE la réponse — soit
      exactement le défaut grave, introduit par le test censé l'éviter.
   2. INSENSIBLE À LA CASSE. Un mot-cible en tête de phrase est capitalisé dans les
      tokens (« Je », « Elle », « Paul ») alors que l'explication peut le citer tel
      qu'il se prononce ; un lecteur d'écran ne fait pas la différence.
   3. SENSIBLE AUX ACCENTS. « mangé » et « mange » sont deux mots français distincts,
      et le TTS les prononce différemment : les replier serait accepter une explication
      qui nomme un AUTRE mot que la réponse.
   4. L'ÉLISION NE COUPE PAS LE MOT : « c'est » est UN mot, pas « c' » + « est ». Sans
      quoi la prose « c'est une conjonction » suffirait à déclarer nommée la cible
      « est » (verbe être), qui est un vrai mot-cible de la leçon « verbe ».
   5. PAR OCCURRENCE (multi-ensemble). Une cible de deux mots identiques (« ni … ni »)
      n'est pas dite par une seule occurrence : l'enfant doit entendre la réponse
      ENTIÈRE. Même exigence pour les cibles en deux mots (« a mangé », passé composé)
      et les cibles éclatées (« Paul » … « Léa », sujet composé ; tous les noms d'une
      phrase), qui ne sont PAS la concaténation de leurs tokens dans l'explication.

   HORS PÉRIMÈTRE : le rendu de la région live et l'ordre des annonces (smoke
   Playwright, cf. `e2e/clic-mot-natures.spec.ts`). Ici, seule la DONNÉE est jugée.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getAllLessons, isClicMotLesson } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import { CLIC_MOT_LESSONS } from '../src/data/francais/grammaire-clic-mot';

/* ------------------------------------------------------------
   Découpage en MOTS — ré-écrit ici, exprès (cf. en-tête).
   Un mot = une suite de lettres/chiffres, l'élision et le trait d'union restant
   INTERNES au mot (« c'est », « l'action », « grand-mère », « aujourd'hui ») : c'est
   ce qu'un lecteur d'écran prononce d'un bloc. L'apostrophe typographique est acceptée
   au découpage — le projet impose la droite, mais ce tokeniseur n'a pas à être le juge
   de ce choix-là (un autre test s'en charge) ; il ne doit pas, lui, casser un mot en deux.
   ------------------------------------------------------------ */
const MOT_RE = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

function motsDe(texte: string): string[] {
	return (texte.match(MOT_RE) ?? []).map((m) => m.toLowerCase());
}

/* Mots qui se trouvent DANS une citation « … » de l'explication. Sert au garde-fou
   anti-coïncidence (cf. le 3e test) : citer un mot entre guillemets est, en typographie
   française, la façon de le DÉSIGNER — le croiser au fil de la prose ne l'est pas. */
const CITATION_RE = /«([^»]*)»/gu;

function motsCites(explication: string): string[] {
	const out: string[] = [];
	for (const c of explication.matchAll(CITATION_RE)) out.push(...motsDe(c[1]));
	return out;
}

/* Mots de `attendus` que `disponibles` ne couvre pas, EN COMPTANT LES OCCURRENCES
   (deux « ni » attendus réclament deux « ni » disponibles). Renvoie la liste des
   manques pour que l'échec dise quoi corriger. */
function manquants(attendus: string[], disponibles: string[]): string[] {
	const stock = new Map<string, number>();
	for (const m of disponibles) stock.set(m, (stock.get(m) ?? 0) + 1);
	const out: string[] = [];
	for (const m of attendus) {
		const reste = stock.get(m) ?? 0;
		if (reste === 0) out.push(m);
		else stock.set(m, reste - 1);
	}
	return out;
}

/* ------------------------------------------------------------
   Échantillonnage — par le CATALOGUE, jamais par une liste de banques.
   Le tirage est aléatoire mais RENDU REPRODUCTIBLE par `withSeed` : une seule graine
   déroule tout le flux d'une (leçon, niveau), donc deux exécutions voient exactement
   les mêmes phrases. Un échec est rejouable tel quel.
   Le niveau NON TRANSMIS est échantillonné en plus des niveaux déclarés : c'est un
   chemin réel du moteur (repli sur le plus bas niveau supporté), et il sert la fiche
   imprimée comme la révision.
   ------------------------------------------------------------ */
const TIRAGES = 1200;
const GRAINE = 20529;
/* Part de l'échantillon après laquelle plus AUCUNE phrase inédite ne doit apparaître.
   Au-delà, l'échantillon ne couvre plus la banque et le test ne prouverait plus rien
   sur les phrases jamais tirées. */
const SEUIL_SATURATION = 0.7;

interface CasClicMot {
	lecon: string;
	niveau: string;
	phrase: string;
	/** Les tokens ciblés, dans l'ordre de la phrase (casse d'origine conservée). */
	motsCible: string[];
	explication: string;
	drapeau: boolean;
}

interface Couverture {
	cle: string;
	/** Rang du dernier tirage ayant révélé une phrase inédite. */
	rang: number;
	distincts: number;
}

interface Echantillon {
	lecons: LessonDef[];
	cas: CasClicMot[];
	typesVus: string[];
	couverture: Couverture[];
}

let cache: Echantillon | undefined;

function echantillon(): Echantillon {
	if (cache) return cache;
	const lecons = getAllLessons().filter(isClicMotLesson);
	const cas: CasClicMot[] = [];
	const types = new Set<string>();
	const couverture: Couverture[] = [];
	for (const lecon of lecons) {
		const niveaux: (SchoolLevel | undefined)[] = [...lecon.levels, undefined];
		for (const niveau of niveaux) {
			const vus = new Map<string, CasClicMot>();
			let rang = -1;
			withSeed(GRAINE, () => {
				for (let i = 0; i < TIRAGES; i++) {
					const ex = lecon.exerciseType.generate({ level: niveau });
					types.add(ex.type);
					if (ex.type !== 'clicMot') continue;
					const signature = JSON.stringify([
						ex.tokens,
						ex.cibleIndices,
						ex.explication,
						ex.explicationNommeCible === true,
					]);
					if (vus.has(signature)) continue;
					rang = i;
					vus.set(signature, {
						lecon: lecon.id,
						niveau: niveau ?? '(non transmis)',
						phrase: ex.tokens.join(' '),
						motsCible: ex.cibleIndices.map((k) => ex.tokens[k]),
						explication: ex.explication,
						drapeau: ex.explicationNommeCible === true,
					});
				}
			});
			cas.push(...vus.values());
			couverture.push({
				cle: `${lecon.id}@${niveau ?? '(non transmis)'}`,
				rang,
				distincts: vus.size,
			});
		}
	}
	cache = { lecons, cas, typesVus: [...types].sort(), couverture };
	return cache;
}

/** Une ligne d'échec lisible : où, quelle phrase, quelle cible, quel manque. */
function decrire(c: CasClicMot, detail: string): string {
	return `${c.lecon}@${c.niveau} — « ${c.phrase} » | cible : ${c.motsCible.join(' + ')} | ${detail} | explication : ${c.explication}`;
}

function cibleMinuscule(c: CasClicMot): string[] {
	return c.motsCible.map((m) => m.toLowerCase());
}

describe('Clique sur le mot — l’explication et l’annonce de la réponse (#529)', () => {
	/* ------------------------------------------------------------
	   Garde anti-test-à-vide. Sans elle, un sélecteur qui ne renvoie plus rien ferait
	   passer tous les tests suivants en vert : le pire des résultats, un gate silencieux.
	   ------------------------------------------------------------ */
	it('garde anti-vide : le catalogue sert bien toutes les leçons du moteur, et rien que des clicMot', () => {
		const e = echantillon();
		expect(
			CLIC_MOT_LESSONS.length,
			'la donnée ne déclare plus aucune leçon « clique sur le mot »',
		).toBeGreaterThan(0);
		expect(e.lecons.length, 'aucune leçon « clique sur le mot » dans le catalogue').toBeGreaterThan(
			0,
		);
		// Toute leçon DÉCLARÉE par la donnée doit être atteinte par la sélection du
		// catalogue : c'est ce qui interdit au test de couvrir « zéro leçon sur sept ».
		const servies = new Set(e.lecons.map((l) => l.id));
		const absentes = CLIC_MOT_LESSONS.filter((d) => !servies.has(d.id)).map((d) => d.id);
		expect(absentes, 'leçons déclarées par la donnée mais jamais servies par le catalogue').toEqual(
			[],
		);
		// Aucun item d'un autre format ne doit se glisser dans l'échantillon (sinon il
		// serait ignoré en silence et la couverture serait fantôme).
		expect(e.typesVus, 'le moteur a produit un exercice qui n’est pas un clicMot').toEqual([
			'clicMot',
		]);
		expect(e.cas.length, 'aucune phrase échantillonnée').toBeGreaterThan(CLIC_MOT_LESSONS.length);
		// Une explication vide désarme le drapeau côté runner : la réponse serait alors
		// annoncée quoi qu'il arrive, et les deux critères ci-dessous ne voudraient plus rien dire.
		const vides = e.cas
			.filter((c) => c.explication.trim() === '' || c.motsCible.length === 0)
			.map((c) => decrire(c, 'explication ou cible vide'));
		expect(vides).toEqual([]);
	});

	/* ------------------------------------------------------------
	   Sans saturation, « on a tiré beaucoup » ne veut pas dire « on a tout vu » : une
	   phrase jamais tirée n'est gardée par rien.
	   ------------------------------------------------------------ */
	it('échantillon saturé : chaque banque est parcourue en entier par le tirage', () => {
		const e = echantillon();
		const limite = Math.floor(TIRAGES * SEUIL_SATURATION);
		const insuffisants = e.couverture
			.filter((c) => c.distincts < 2 || c.rang >= limite)
			.map(
				(c) =>
					`${c.cle} : ${c.distincts} phrase(s) distincte(s), dernière inédite au tirage ${c.rang}/${TIRAGES} (limite ${limite}) — banque agrandie ? augmenter TIRAGES`,
			);
		expect(insuffisants).toEqual([]);
	});

	/* ------------------------------------------------------------
	   Critère 1 — le défaut de #529 : l'explication cite la cible, le drapeau manque.
	   ------------------------------------------------------------ */
	it('critère 1 : une explication qui NOMME déjà les mots-cibles doit porter explicationNommeCible', () => {
		const e = echantillon();
		const fautifs = e.cas
			.filter((c) => !c.drapeau)
			.filter((c) => manquants(cibleMinuscule(c), motsDe(c.explication)).length === 0)
			.map((c) =>
				decrire(
					c,
					'explication déjà complète, drapeau ABSENT → « La bonne réponse : … » répétera l’énumération',
				),
			);
		expect(
			fautifs,
			'double annonce : ces phrases nomment leur cible sans déclarer explicationNommeCible',
		).toEqual([]);
	});

	/* ------------------------------------------------------------
	   Critère 2 — le scénario grave : le drapeau fait taire l'annonce alors que
	   l'explication ne dit pas la réponse.
	   ------------------------------------------------------------ */
	it('critère 2 : explicationNommeCible n’est légitime que si l’explication dit VRAIMENT la réponse', () => {
		const e = echantillon();
		const fautifs = e.cas
			.filter((c) => c.drapeau)
			.map((c) => ({ c, manque: manquants(cibleMinuscule(c), motsDe(c.explication)) }))
			.filter((x) => x.manque.length > 0)
			.map((x) =>
				decrire(
					x.c,
					`drapeau posé mais mot(s) jamais prononcé(s) : ${x.manque.join(', ')} → la région live se TAIT sur la réponse`,
				),
			);
		expect(
			fautifs,
			'réponse muette : ces phrases suppriment l’annonce sans nommer la cible',
		).toEqual([]);
	});

	/* ------------------------------------------------------------
	   Garde-fou du critère 1 contre la COÏNCIDENCE. Un mot-cible peut apparaître dans
	   la prose fixe d'une explication sans y être désigné comme la réponse (« Le nom
	   noyau, c'est le nom principal du groupe … » contient « nom », « groupe »,
	   « mots »). Le critère 1 exigerait alors un drapeau qui rendrait l'annonce muette.
	   On vérifie donc que, partout où le drapeau est posé, la cible est CITÉE entre
	   guillemets — la marque typographique qui désigne un mot au lieu de l'employer.
	   ------------------------------------------------------------ */
	/* ------------------------------------------------------------
	   Preuve que le gate MORD (guard the guard). Un gate qui passerait aussi bien avec
	   qu'sans le drapeau ne garderait rien : on rejoue le critère 1 sur le corpus
	   RÉELLEMENT échantillonné, drapeau retiré, et on exige qu'il dénonce au moins une
	   phrase de CHAQUE (leçon, niveau). Autrement dit : retirer
	   `explicationNommeCible: true` de n'importe laquelle des fabriques de
	   `src/data/francais/grammaire-clic-mot.ts` rend le critère 1 rouge.
	   Volontairement « au moins une » et non « toutes » : une explication qui ne
	   nommerait pas sa cible resterait légitime (elle ne doit alors PAS porter le
	   drapeau) — ce test ne doit pas l'interdire par ricochet.
	   ------------------------------------------------------------ */
	it('le gate mord : drapeau retiré, le critère 1 dénonce chaque leçon du moteur', () => {
		const e = echantillon();
		const parLecon = new Map<string, number>();
		for (const c of e.cas) {
			const cle = `${c.lecon}@${c.niveau}`;
			const nomme = manquants(cibleMinuscule(c), motsDe(c.explication)).length === 0;
			parLecon.set(cle, (parLecon.get(cle) ?? 0) + (nomme ? 1 : 0));
		}
		const insensibles = [...parLecon.entries()]
			.filter(([, n]) => n === 0)
			.map(
				([cle]) =>
					`${cle} : aucune phrase ne nomme sa cible — retirer son drapeau ne ferait rien rougir`,
			);
		expect(insensibles).toEqual([]);
	});

	it('les mots-cibles sont CITÉS entre guillemets, pas croisés par hasard dans la prose', () => {
		const e = echantillon();
		const fautifs = e.cas
			.filter((c) => c.drapeau)
			.map((c) => ({ c, manque: manquants(cibleMinuscule(c), motsCites(c.explication)) }))
			.filter((x) => x.manque.length > 0)
			.map((x) =>
				decrire(
					x.c,
					`mot(s) présent(s) dans la prose mais jamais CITÉ(s) « … » : ${x.manque.join(', ')}`,
				),
			);
		expect(
			fautifs,
			'la cible doit être désignée (guillemets), sinon l’enfant l’entend passer sans savoir que c’est la réponse',
		).toEqual([]);
	});
});
