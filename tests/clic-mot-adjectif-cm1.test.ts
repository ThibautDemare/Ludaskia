/* ============================================================
   « Clique sur l'adjectif » au CM1 — épithète ou attribut (#528).
   ------------------------------------------------------------
   Tests écrits À PARTIR DE L'ISSUE, AVANT la banque : chaque `it` nomme le critère
   d'acceptation qu'il traduit et le CAS D'ÉCHEC qu'il attrape. Tant que la famille
   n'expose pas `PHRASES_ADJ_CM1` / `CONSIGNE_ADJ_CM1` / `adj`, le fichier entier est rouge
   sur l'import : c'est le résultat attendu.

   Le module de vérité est la FAÇADE `grammaire-clic-mot`, et c'est elle qu'on nomme ici —
   pas le fichier qui héberge la banque aujourd'hui. La première rédaction pinnait
   `grammaire-clic-mot-cm1.ts` dans cette phrase et dans ses imports ; l'extraction de la
   section adjectif vers `grammaire-clic-mot-adjectif.ts` a rendu la phrase fausse et les
   imports cassés, pour un découpage que la façade est justement là pour absorber.

   Ce que l'issue demande nommément (critère 9) : que les critères 3, 4, 5 et 6 soient
   tenus ici, avec pour étalon « ajouter à la banque une phrase à un seul adjectif
   toujours en fin de phrase ne doit faire tomber aucun test » — situation à rendre
   IMPOSSIBLE. C'est le test « chaque item a un distracteur adjectif dans sa phrase »
   qui la rend impossible : une phrase à adjectif unique n'en offre aucun.

   Indépendance auteur ≠ code : les attendus sont dérivés de l'ISSUE et de la GRAMMAIRE
   (ce qu'est un épithète — adjectif du groupe nominal, collé au nom — et un attribut du
   sujet — introduit par un verbe d'état), jamais d'une ligne de `src/`. Les détecteurs
   vivent dans `tests/gardes-adjectif-cm1.ts` et sont éprouvés séparément, sur des
   banques fabriquées, par `tests/gardes-adjectif-cm1.test.ts` : eux sont VERTS dès
   aujourd'hui, donc leur falsifiabilité est démontrée et pas seulement raisonnée.

   Hors de ce fichier, et volontairement :
   - la cohérence `explication` ↔ `explicationNommeCible` — tenue pour TOUTES les leçons
     clic-mot, à tous leurs niveaux, par `clic-mot-annonce-cible.test.ts` (#529) ;
   - la présence de la leçon dans l'ordre pédagogique du CM1 — tenue par
     `ordre-pedagogique.test.ts` (« toute leçon figure dans l'ordre de chacun de ses
     niveaux ») ;
   - le RENDU et la variation de consigne d'un item à l'autre à l'écran (critère 10)
     → spec Playwright.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	PHRASES_ADJ_CM1,
	CONSIGNE_ADJ_CM1,
	PHRASES_ADJ_CE2,
	adj,
	joindrePhrase,
	type FonctionAdj,
	type PhraseClicMot,
} from '../src/data/francais/grammaire-clic-mot';
/* `CONSIGNE_ADJ_CE2` et `CIBLE_ADJ_CE2` n'ont PAS de chemin par la façade : elle les importe
   pour son propre usage sans les ré-exporter (la bande des `-ce2` ne sort que les banques et
   les fabriques). Ils viennent donc du module interne, faute de mieux — c'est le reliquat
   exact du défaut que ce lot répare partout ailleurs, signalé dans le compte rendu. */
import { CONSIGNE_ADJ_CE2, CIBLE_ADJ_CE2 } from '../src/data/francais/grammaire-clic-mot-ce2';
import { getAllLessons, getLessonById, isClicMotLesson } from '../src/core/catalog';
import type { LessonDef } from '../src/core/catalog';
import { consignePourNiveau } from '../src/core/exercise';
import { etayagePour } from '../src/core/etayage';
import { labelLecon } from '../src/core/levels';
import {
	adverbesMemeFamille,
	autresAdjectifs,
	colleApresDeterminant,
	colleApresVerbeEtat,
	fonctionCitee,
	fonctionDeclaree,
	indexCible,
	lexiqueAdjectifs,
	motsInterdits,
	pli,
	termineLaPhrase,
	texteDe,
	verbeEtatAvant,
	type FonctionAdjAttendue,
} from './gardes-adjectif-cm1';

const ID = 'fr-gram-clic-adj';

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	expect(l, `leçon ${id} absente du catalogue`).toBeDefined();
	return l!;
};

/* Signature d'un item TIRABLE : la phrase montrée + le(s) mot(s) attendu(s). Deux items
   d'une même phrase qui visent deux adjectifs différents sont bien deux items distincts. */
const cle = (p: { tokens: string[]; cibleIndices: number[] }): string =>
	`${joindrePhrase(p.tokens)} ##${p.cibleIndices.join(',')}`;

/* Items regroupés par PHRASE : c'est la maille du critère 3 (une phrase riche produit
   plusieurs items, un par fonction, chacun distracteur de l'autre). */
function parPhrase(banque: PhraseClicMot[]): Map<string, PhraseClicMot[]> {
	const m = new Map<string, PhraseClicMot[]>();
	for (const p of banque) {
		const k = texteDe(p);
		const l = m.get(k);
		if (l) l.push(p);
		else m.set(k, [p]);
	}
	return m;
}

const LEXIQUE = (): Set<string> => lexiqueAdjectifs(PHRASES_ADJ_CM1);

/* ============================================================
   0. Contrat d'API et garde anti-test-à-vide.
   ============================================================ */
describe('Adjectif CM1 — contrat de la banque (#528)', () => {
	/* Critère 1 — sans ce garde, une banque effondrée (ou un export disparu) rendrait
	   TOUS les tests suivants verts à vide : ils itèrent sur elle.
	   Cas d'échec : `PHRASES_ADJ_CM1` absente, vide, ou réduite à une poignée d'items. */
	it('critère 1 : la banque CM1 existe, non vide, faite de phrases annotées', () => {
		expect(Array.isArray(PHRASES_ADJ_CM1), 'PHRASES_ADJ_CM1 n’est pas un tableau').toBe(true);
		expect(PHRASES_ADJ_CM1.length).toBeGreaterThan(0);
		for (const p of PHRASES_ADJ_CM1) {
			expect(p.tokens.length, texteDe(p)).toBeGreaterThan(2);
			expect(p.cibleIndices.length, texteDe(p)).toBeGreaterThan(0);
		}
		expect(typeof CONSIGNE_ADJ_CM1).toBe('string');
		expect(CONSIGNE_ADJ_CM1.length).toBeGreaterThan(0);
	});

	/* Critère 2 — le type `FonctionAdj` est le discriminant de la tâche ; s'il admettait
	   autre chose (ou lui manquait une valeur), la banque pourrait déclarer une fonction
	   que la leçon ne sait pas nommer.
	   Cas d'échec : `FonctionAdj` renommé, élargi, ou réduit à une seule fonction. */
	it('critère 2 : FonctionAdj vaut exactement « epithete » | « attribut »', () => {
		const toutes: FonctionAdj[] = ['epithete', 'attribut'];
		const miroir: FonctionAdjAttendue[] = toutes;
		expect(miroir).toEqual(['epithete', 'attribut']);
	});

	/* Critère 2 — la fabrique par item doit ÉTIQUETER selon la fonction demandée : c'est
	   elle qui fait varier consigne et libellé d'un item à l'autre.
	   Cas d'échec : `adj()` ignore son 3ᵉ argument et pose partout le même libellé. */
	it('critère 2 : adj() étiquette l’item avec la fonction demandée, et elle seule', () => {
		const PHRASE = 'Le petit chien semble content.';
		const epithete = adj(PHRASE, 'petit', 'epithete');
		const attribut = adj(PHRASE, 'content', 'attribut');
		expect(fonctionDeclaree(epithete)).toBe('epithete');
		expect(fonctionDeclaree(attribut)).toBe('attribut');
		expect(epithete.tokens[indexCible(epithete)]).toBe('petit');
		expect(attribut.tokens[indexCible(attribut)]).toBe('content');
		expect(epithete.consigne, 'consigne d’item absente').toBeTruthy();
		expect(attribut.consigne).toBeTruthy();
		expect(epithete.consigne).not.toBe(attribut.consigne);
		expect(epithete.cibleLabel).not.toBe(attribut.cibleLabel);
	});
});

/* ============================================================
   1. La banque elle-même : taille, fonctions, distracteurs, positions, verbes.
   ============================================================ */
describe('Adjectif CM1 — ce que la banque doit contenir (#528)', () => {
	/* Critère 6 — « 50 à 100 items distincts tirables ». On compte en ITEMS (phrase +
	   cible), pas en phrases.
	   Cas d'échec : moins de 50 items distincts ; ou une banque gonflée par des doublons,
	   qui annoncerait 60 items pour 40 vrais (et biaiserait le tirage au passage). */
	it('critère 6 : 50 à 100 items distincts, sans doublon', () => {
		const distincts = new Set(PHRASES_ADJ_CM1.map(cle));
		expect(distincts.size, `${distincts.size} items distincts`).toBeGreaterThanOrEqual(50);
		expect(distincts.size).toBeLessThanOrEqual(100);
		expect(distincts.size, 'doublons dans la banque').toBe(PHRASES_ADJ_CM1.length);
	});

	/* Critère 2 — chaque item DÉCLARE sa fonction dans son libellé de cible, et ne vise
	   qu'un mot : deux mots attendus pour « l'adjectif épithète » rendrait la consigne
	   fausse.
	   Cas d'échec : un item sans libellé propre (il hériterait du libellé générique du
	   type, qui ne nomme aucune fonction) ; un item qui nomme les deux fonctions à la
	   fois ; un item à cible multiple. */
	it('critère 2 : chaque item déclare UNE fonction et vise UN seul mot', () => {
		for (const p of PHRASES_ADJ_CM1) {
			expect(fonctionDeclaree(p), `« ${texteDe(p)} » — cibleLabel : ${p.cibleLabel}`).toBeDefined();
			expect(p.cibleIndices.length, `« ${texteDe(p)} » vise plusieurs mots`).toBe(1);
		}
		const fonctions = new Set(PHRASES_ADJ_CM1.map(fonctionDeclaree));
		expect(fonctions, 'les deux fonctions ne sont pas servies').toEqual(
			new Set(['epithete', 'attribut']),
		);
	});

	/* Critère 2 — « la consigne et le libellé de cible varient d'un item à l'autre ».
	   Cas d'échec exact de l'issue : « une consigne CM1 unique du type clique sur
	   l'adjectif, qui ne demande jamais de choisir une fonction ». Également attrapé : une
	   consigne qui contredit le libellé de cible (copier-coller entre deux items). */
	it('critère 2 : la consigne de chaque item nomme sa fonction, et la banque en a plusieurs', () => {
		for (const p of PHRASES_ADJ_CM1) {
			const consigne = p.consigne ?? '';
			expect(consigne, `« ${texteDe(p)} » : consigne d’item absente`).toBeTruthy();
			expect(
				fonctionCitee(consigne),
				`« ${texteDe(p)} » : la consigne « ${consigne} » ne demande pas de fonction`,
			).toBe(fonctionDeclaree(p));
		}
		expect(new Set(PHRASES_ADJ_CM1.map((p) => p.consigne)).size).toBeGreaterThanOrEqual(2);
		expect(new Set(PHRASES_ADJ_CM1.map((p) => p.cibleLabel)).size).toBeGreaterThanOrEqual(2);
	});

	/* Critère 3 (et étalon du critère 9) — « chacun distracteur de l'autre » : tout item
	   doit offrir, DANS SA PHRASE, un autre adjectif à écarter.
	   Cas d'échec, mot pour mot celui du critère 9 : « ajouter à la banque une phrase à un
	   seul adjectif toujours en fin de phrase ne fait tomber aucun test ». Ici elle le fait
	   tomber — « La fleur est belle. » n'offre aucun distracteur, l'enfant n'a qu'un mot
	   cliquable plausible et réussit sans lire la consigne. */
	it('critère 3 : chaque item offre un AUTRE adjectif dans sa phrase (distracteur)', () => {
		const lexique = LEXIQUE();
		for (const p of PHRASES_ADJ_CM1) {
			const autres = autresAdjectifs(p, lexique);
			expect(
				autres.length,
				`« ${texteDe(p)} » (cible « ${p.tokens[indexCible(p)]} ») : aucun second adjectif`,
			).toBeGreaterThan(0);
		}
	});

	/* Critère 3 — « l'un épithète et l'autre attribut ». Deux items d'une même phrase qui
	   demandent la MÊME fonction rendent la consigne ambiguë : deux réponses justes.
	   Cas d'échec : « Le petit chien aime un gros os. » servie deux fois, chaque fois sous
	   « clique sur l'adjectif épithète ». */
	it('critère 3 : deux items d’une même phrase ne demandent jamais la même fonction', () => {
		for (const [phrase, items] of parPhrase(PHRASES_ADJ_CM1)) {
			const fonctions = items.map(fonctionDeclaree);
			expect(new Set(fonctions).size, `« ${phrase} » : ${fonctions.join(' + ')}`).toBe(
				items.length,
			);
			const cibles = items.map(indexCible);
			expect(new Set(cibles).size, `« ${phrase} » : deux items sur le même mot`).toBe(items.length);
		}
	});

	/* Critère 3 — non-ambiguïté vue depuis la phrase : un autre adjectif de la phrase qui
	   porte VISIBLEMENT la même fonction que la cible (collé à un déterminant pour un
	   épithète, collé à un verbe d'état pour un attribut) donne une seconde réponse juste.
	   Cas d'échec : « Le petit chien aime un gros os. » demandée sur « petit » — « gros »
	   est un épithète lui aussi. Le repère est positionnel et donc partiel (un épithète
	   coordonné « joyeux et content » échappe au détecteur), mais il attrape le cas
	   fréquent : deux groupes nominaux adjectivés dans la même phrase. */
	it('critère 3 : aucun autre adjectif de la phrase ne porte visiblement la même fonction', () => {
		const lexique = LEXIQUE();
		const parTexte = parPhrase(PHRASES_ADJ_CM1);
		for (const p of PHRASES_ADJ_CM1) {
			const fonction = fonctionDeclaree(p);
			const items = parTexte.get(texteDe(p)) ?? [];
			for (const autre of autresAdjectifs(p, lexique)) {
				const k = p.tokens.findIndex((t, i) => i !== indexCible(p) && t === autre);
				if (k < 0) continue;
				const faux: PhraseClicMot = { ...p, cibleIndices: [k] };
				const presumee: FonctionAdjAttendue | undefined = colleApresDeterminant(faux)
					? 'epithete'
					: colleApresVerbeEtat(faux)
						? 'attribut'
						: undefined;
				expect(
					presumee,
					`« ${texteDe(p)} » : « ${autre} » est un ${presumee} comme la cible ` +
						`« ${p.tokens[indexCible(p)]} » (items de la phrase : ${items.length})`,
				).not.toBe(fonction);
			}
		}
	});

	/* Critère 3 — la « partie » riche de la banque, mesurée. Le critère 6 pose ≥ 50 items
	   et le critère 3 interdit deux items de même fonction sur une phrase : une phrase
	   produit donc au plus 2 items, et 50 items réclament au moins 25 phrases. Un plancher
	   de 20 phrases à DEUX fonctions laisse de la marge aux phrases asymétriques tout en
	   refusant une banque faite de phrases à item unique.
	   Cas d'échec : 60 items répartis sur 60 phrases, chacune ne posant jamais le choix
	   entre deux fonctions. */
	it('critère 3 : au moins 20 phrases produisent les DEUX fonctions', () => {
		const riches = [...parPhrase(PHRASES_ADJ_CM1).values()].filter(
			(items) => new Set(items.map(fonctionDeclaree)).size === 2,
		);
		expect(riches.length, `${riches.length} phrases à deux fonctions`).toBeGreaterThanOrEqual(20);
	});

	/* Critère 4 — « pour CHACUNE des deux fonctions, au moins un item où l'adjectif termine
	   la phrase et un item où il ne la termine pas ».
	   Cas d'échec de l'issue : « tous les attributs sont en fin de phrase, donc clique sur
	   le dernier mot suffit à réussir sans lire ». Gate volontairement LITTÉRAL (un
	   contre-exemple suffit) : c'est ce que l'issue exige, et inventer un quota ici serait
	   poser ma règle à la place de la sienne. */
	it('critère 4 : chaque fonction connaît la fin de phrase ET une autre place', () => {
		for (const fonction of ['epithete', 'attribut'] as const) {
			const items = PHRASES_ADJ_CM1.filter((p) => fonctionDeclaree(p) === fonction);
			expect(items.length, `aucun item ${fonction}`).toBeGreaterThan(0);
			const finaux = items.filter(termineLaPhrase);
			const autres = items.filter((p) => !termineLaPhrase(p));
			expect(finaux.length, `aucun ${fonction} en fin de phrase`).toBeGreaterThan(0);
			expect(
				autres.length,
				`tous les ${fonction} sont en fin de phrase : « le dernier mot » suffit`,
			).toBeGreaterThan(0);
		}
	});

	/* Critère 5 — un attribut du sujet est introduit par un verbe d'état ; sans verbe
	   d'état identifiable, l'item est mal étiqueté (ce serait un épithète, ou un attribut
	   du COD, hors programme CM1).
	   Cas d'échec : « Le chien mange sa gamelle rouge. » servie sous « clique sur
	   l'adjectif attribut ». */
	it('critère 5 : chaque attribut est introduit par un verbe d’état', () => {
		const attributs = PHRASES_ADJ_CM1.filter((p) => fonctionDeclaree(p) === 'attribut');
		expect(attributs.length, 'aucun attribut dans la banque').toBeGreaterThan(0);
		for (const p of attributs) {
			expect(
				verbeEtatAvant(p),
				`« ${texteDe(p)} » : « ${p.tokens[indexCible(p)]} » n’a aucun verbe d’état devant lui`,
			).toBeDefined();
		}
	});

	/* Critère 5 — « les attributs ne suivent pas tous le verbe être : la banque emploie
	   aussi des verbes d'état comme sembler, paraître, rester, devenir ».
	   Cas d'échec de l'issue : « tous les attributs suivent est, donc après est suffit à
	   trancher ». Plancher à DEUX lemmes autres qu'être — le minimum qui rende vrai le
	   pluriel « des verbes d'état » de l'issue. */
	it('critère 5 : au moins deux verbes d’état autres que « être »', () => {
		const lemmes = new Set(
			PHRASES_ADJ_CM1.filter((p) => fonctionDeclaree(p) === 'attribut')
				.map(verbeEtatAvant)
				.filter((l): l is string => l !== undefined && l !== 'être'),
		);
		expect(
			lemmes.size,
			`verbes d’état hors « être » employés : ${[...lemmes].sort().join(', ') || 'aucun'}`,
		).toBeGreaterThanOrEqual(2);
	});

	/* Grammaire (dérivé du critère 2 : la fonction déclarée doit être la vraie) — un
	   épithète appartient au groupe nominal, il n'est jamais collé derrière un verbe
	   d'état ; un attribut n'est jamais collé derrière un déterminant.
	   Cas d'échec : « Le chien est content. » étiquetée épithète (ou l'inverse,
	   « Le petit chien dort. » étiquetée attribut) — une faute d'étiquette enseignerait
	   exactement la confusion que la leçon veut lever. */
	it('critère 2 : l’étiquette dit la vérité (épithète ≠ collé au verbe d’état)', () => {
		for (const p of PHRASES_ADJ_CM1) {
			const fonction = fonctionDeclaree(p);
			if (fonction === 'epithete') {
				expect(
					colleApresVerbeEtat(p),
					`« ${texteDe(p)} » : « ${p.tokens[indexCible(p)]} » suit un verbe d’état, ` +
						`ce n’est pas un épithète`,
				).toBe(false);
			} else {
				expect(
					colleApresDeterminant(p),
					`« ${texteDe(p)} » : « ${p.tokens[indexCible(p)]} » suit un déterminant, ` +
						`c’est un épithète, pas un attribut`,
				).toBe(false);
			}
		}
	});

	/* Critère 11 — « aucun item CM1 ne repose sur un participe passé à valeur adjectivale
	   (fatigué, cassé) », ciblé OU simple distracteur : présent dans la phrase, il rouvre
	   la confusion avec le passé composé.
	   Cas d'échec de l'issue : « La porte est cassée » dans la banque. */
	it('critère 11 : aucun participe passé adjectival ni forme nom/adjectif ambiguë', () => {
		for (const p of PHRASES_ADJ_CM1) {
			expect(motsInterdits(p), `« ${texteDe(p)} »`).toEqual([]);
		}
	});

	/* Critère 13 — garde-fou CE2 conservé au CM1.
	   Cas d'échec de l'issue : « lente » et « lentement » dans la même phrase — la
	   difficulté viendrait alors de la forme du mot, pas de sa fonction. */
	it('critère 13 : aucun adverbe en « -ment » de la famille de l’adjectif visé', () => {
		for (const p of PHRASES_ADJ_CM1) {
			expect(
				adverbesMemeFamille(p),
				`« ${texteDe(p)} » — cible « ${p.tokens[indexCible(p)]} »`,
			).toEqual([]);
		}
	});
});

/* ============================================================
   2. Branchement catalogue : la bonne banque, à la bonne classe.
   ============================================================ */
describe('Adjectif CM1 — branchement par niveau (#528)', () => {
	/* Critère 1 — « servie aux deux classes avec une banque CM1 propre ».
	   Cas d'échec : la leçon reste `levels: ['ce2']` (le CM1 ne la voit pas), ou passe
	   `['cm1']` seul (le CE2 la perd). */
	it('critère 1 : la leçon est servie au CE2 ET au CM1', () => {
		const def = lecon(ID);
		expect(def.levels).toEqual(['ce2', 'cm1']);
		expect(isClicMotLesson(def)).toBe(true);
		expect(def.subject).toBe('francais');
		expect(def.category).toBe('fr-grammaire');
	});

	/* Critère 1 — « un CM1 tire une phrase de la banque CE2, ou un item CE2 change » est
	   l'échec déclaré. Échantillon de 300 tirages par niveau, des deux côtés.
	   Cas d'échec : la variante `ce2` oubliée dans `clicMotType` (le CE2 recevrait la
	   banque CM1 et lirait « épithète »), ou la banque CM1 branchée nulle part. */
	it('critère 1 : 300 tirages par niveau restent dans la banque de leur classe', () => {
		const type = lecon(ID).exerciseType;
		const cm1 = new Set(PHRASES_ADJ_CM1.map(cle));
		const ce2 = new Set(PHRASES_ADJ_CE2.map(cle));
		for (let i = 0; i < 300; i++) {
			const ex = type.generate({ level: 'cm1' });
			expect(ex.type).toBe('clicMot');
			if (ex.type !== 'clicMot') continue;
			expect(cm1.has(cle(ex)), `CM1 : item hors banque « ${joindrePhrase(ex.tokens)} »`).toBe(true);
		}
		for (let i = 0; i < 300; i++) {
			const ex = type.generate({ level: 'ce2' });
			if (ex.type !== 'clicMot') continue;
			expect(ce2.has(cle(ex)), `CE2 : item hors banque « ${joindrePhrase(ex.tokens)} »`).toBe(true);
		}
		// Niveau non transmis : on sert le CE2, jamais du contenu CM1 par défaut.
		for (let i = 0; i < 200; i++) {
			const ex = type.generate();
			if (ex.type !== 'clicMot') continue;
			expect(ce2.has(cle(ex)), 'repli sans niveau : item hors banque CE2').toBe(true);
		}
	});

	/* Critère 2 — la variation doit se voir à l'USAGE, pas seulement dans la donnée : un
	   enfant de CM1 qui enchaîne les items doit recevoir les deux questions.
	   Cas d'échec : la fabrique écrase la consigne de l'item par celle du type (cas déjà
	   vu dans la famille : `itemClicMot` prend `p.consigne ?? consigneDefaut` — un item
	   sans consigne propre repart silencieusement sur la consigne générique). */
	it('critère 2 : au tirage CM1, les deux fonctions et deux consignes sortent', () => {
		const type = lecon(ID).exerciseType;
		const fonctions = new Set<string>();
		const consignes = new Set<string>();
		for (let i = 0; i < 300; i++) {
			const ex = type.generate({ level: 'cm1' });
			if (ex.type !== 'clicMot') continue;
			consignes.add(ex.consigne);
			const f = fonctionCitee(ex.cibleLabel ?? '');
			if (f) fonctions.add(f);
		}
		expect(fonctions, 'une seule fonction sort au tirage CM1').toEqual(
			new Set(['epithete', 'attribut']),
		);
		expect(consignes.size, 'consigne unique au CM1').toBeGreaterThanOrEqual(2);
	});

	/* Critère 7 — « le libellé emploie le vocabulaire du programme CM1 sans l'imposer au
	   CE2 ; échec : un CE2 lit le mot épithète ». Balaie TOUT ce qu'un CE2 a sous les
	   yeux : titre de la leçon, consigne du niveau, consigne de repli sans niveau, items
	   tirés, et panneau d'étayage.
	   Cas d'échec : `labelNiveau` oublié (le titre CM1 s'affiche aussi au CE2), ou
	   l'étayage CM1 posé sans `niveau`, donc servi aux deux classes. */
	it('critère 7 : rien de ce qu’un CE2 lit ne contient « épithète » ni « attribut »', () => {
		const def = lecon(ID);
		const lus: string[] = [
			labelLecon(def, 'ce2'),
			consignePourNiveau(def.exerciseType, 'ce2') ?? '',
			consignePourNiveau(def.exerciseType) ?? '',
		];
		for (const p of PHRASES_ADJ_CE2) {
			lus.push(p.consigne ?? '', p.cibleLabel ?? '', p.explication, texteDe(p));
		}
		const etayage = etayagePour(def, 'ce2');
		expect(etayage, 'plus d’étayage au CE2').toBeDefined();
		lus.push(etayage?.titre ?? '', etayage?.regle ?? '', ...(etayage?.etapes ?? []));
		for (let i = 0; i < 200; i++) {
			const ex = def.exerciseType.generate({ level: 'ce2' });
			if (ex.type !== 'clicMot') continue;
			lus.push(ex.consigne, ex.cibleLabel ?? '', ex.explication);
		}
		for (const texte of lus) {
			expect(fonctionCitee(texte), `un CE2 lit : « ${texte} »`).toBeUndefined();
			expect(pli(texte).includes('epithete'), `un CE2 lit : « ${texte} »`).toBe(false);
			expect(pli(texte).includes('attribut'), `un CE2 lit : « ${texte} »`).toBe(false);
		}
		// Et le titre CM1 est distinct, puisqu'il doit dire la notion de sa classe.
		expect(labelLecon(def, 'ce2')).toBe("Clique sur l'adjectif");
		expect(labelLecon(def, 'cm1')).not.toBe(labelLecon(def, 'ce2'));
	});

	/* Critère 8 — « l'étayage CM1 donne le repère de la règle et non un repère de
	   position ». Mécanisable en deux moitiés : le panneau CM1 existe, il est propre au
	   niveau, et il nomme les deux fonctions (sans quoi il n'aide pas à CHOISIR) ; et il
	   ne renvoie pas à une place dans la phrase.
	   Cas d'échec de l'issue : « un étayage qui revient à dire regarde le dernier mot ».
	   Ce que ce test ne voit PAS : un étayage qui, sans employer ces mots, raconte quand
	   même une astuce de position — ça reste du jugement (→ relecture pédagogique). */
	it('critère 8 : l’étayage CM1 nomme les deux fonctions, sans repère de position', () => {
		const def = lecon(ID);
		const cm1 = etayagePour(def, 'cm1');
		expect(cm1, 'aucun étayage au CM1').toBeDefined();
		expect(cm1, 'le CM1 reçoit l’étayage du CE2').not.toEqual(etayagePour(def, 'ce2'));
		const texte = pli([cm1?.titre, cm1?.regle, ...(cm1?.etapes ?? [])].filter(Boolean).join(' '));
		expect(texte.includes('epithete'), 'l’étayage CM1 ne dit pas « épithète »').toBe(true);
		expect(texte.includes('attribut'), 'l’étayage CM1 ne dit pas « attribut »').toBe(true);
		for (const repere of ['dernier mot', 'premier mot', 'a la fin de la phrase']) {
			expect(texte.includes(repere), `repère de position dans l’étayage : « ${repere} »`).toBe(
				false,
			);
		}
	});
});

/* ============================================================
   3. Non-régression : le CE2 et les autres natures ne bougent pas.
   ============================================================ */
describe('Adjectif CM1 — ce qui ne doit PAS bouger (#528)', () => {
	/* Critère 14 — « la banque CE2 n'est pas modifiée ; échec : un diff dans
	   ADJ_CE2_ITEMS ou PHRASES_ADJ_CE2 ». Le compte EXACT est le gate : il attrape aussi
	   bien un item retiré qu'un item ajouté en passant. Une extension délibérée du CE2,
	   plus tard, devra donc mettre cette ligne à jour sciemment — c'est l'intention.
	   Cas d'échec : une phrase CE2 recyclée en CM1 et retouchée au passage (changement de
	   consigne, ajout d'un second adjectif), ou un item déplacé d'une banque à l'autre. */
	it('critère 14 : la banque CE2 est intacte (60 items, consigne et libellé d’origine)', () => {
		expect(PHRASES_ADJ_CE2.length, 'la banque CE2 a changé de taille').toBe(60);
		expect(CONSIGNE_ADJ_CE2).toBe("Clique sur l'adjectif de la phrase.");
		expect(CIBLE_ADJ_CE2).toBe("l'adjectif");
		for (const p of PHRASES_ADJ_CE2) {
			expect(p.consigne, `CE2 « ${texteDe(p)} »`).toBe(CONSIGNE_ADJ_CE2);
			expect(p.cibleLabel, `CE2 « ${texteDe(p)} »`).toBe(CIBLE_ADJ_CE2);
			expect(p.cibleIndices.length, `CE2 « ${texteDe(p)} »`).toBe(1);
			expect(fonctionDeclaree(p), `CE2 « ${texteDe(p)} » déclare une fonction`).toBeUndefined();
		}
		// Les deux banques ne partagent aucun item : une banque CM1 « propre » (critère 1).
		const ce2 = new Set(PHRASES_ADJ_CE2.map(cle));
		for (const p of PHRASES_ADJ_CM1) {
			expect(ce2.has(cle(p)), `item partagé avec le CE2 : « ${texteDe(p)} »`).toBe(false);
		}
	});

	/* Critère 15 — « aucune autre nature du moteur ne change de comportement ». La
	   contamination la plus probable d'une leçon à l'autre, dans cette famille, est le
	   vocabulaire : les natures partagent `clicMotType` et leurs banques vivent dans les
	   mêmes fichiers.
	   Cas d'échec : le libellé « l'adjectif épithète » posé par erreur sur un item du nom
	   noyau ou du groupe nominal (où l'adjectif est distracteur), ou une leçon CM1-seule
	   descendue au CE2 en passant. */
	it('critère 15 : les autres natures « clique sur le mot » ne parlent pas de fonction', () => {
		const autres = getAllLessons().filter((l) => isClicMotLesson(l) && l.id !== ID);
		expect(autres.length, 'plus aucune autre leçon clic-mot à vérifier').toBeGreaterThanOrEqual(6);
		for (const def of autres) {
			for (const niveau of def.levels) {
				for (let i = 0; i < 120; i++) {
					const ex = def.exerciseType.generate({ level: niveau });
					if (ex.type !== 'clicMot') continue;
					const lu = `${ex.consigne} | ${ex.cibleLabel ?? ''}`;
					expect(fonctionCitee(lu), `${def.id}@${niveau} : « ${lu} »`).toBeUndefined();
				}
			}
		}
		// Les niveaux servis par les autres natures sont ceux d'avant #528.
		expect(lecon('fr-gram-clic-det').levels).toEqual(['ce2', 'cm1']);
		expect(lecon('fr-gram-clic-noyau').levels).toEqual(['ce2', 'cm1']);
		expect(lecon('fr-gram-clic-pron').levels).toEqual(['ce2', 'cm1']);
		expect(lecon('fr-gram-clic-verbe').levels).toEqual(['ce2', 'cm1']);
		expect(lecon('fr-gram-clic-conj').levels).toEqual(['cm1']);
		expect(lecon('fr-gram-clic-sujet').levels).toEqual(['cm1']);
	});
});
