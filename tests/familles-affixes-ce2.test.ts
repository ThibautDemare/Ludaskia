/* ============================================================
   Vocabulaire CE2 — banques « familles / préfixes / suffixes » agrandies et pool du
   QCM combiné rééquilibré (#453).
   ------------------------------------------------------------
   Contexte : les 54 familles CE2 ne profitaient qu'à la leçon « à relier » ; le pool du
   QCM combiné `fr-vocab-familles` restait délibérément sur un sous-ensemble de 30
   familles pour ne pas peser ~46 % du mélange. #453 agrandit préfixes et suffixes au
   même ordre de grandeur, puis verse TOUTES les familles au pool → ~⅓ / ⅓ / ⅓.

   Les attendus sont DÉRIVÉS de l'énoncé de #453 et du contrat de la leçon (QCM de
   reconnaissance : un mot interrogé, un sens/dérivé correct, deux leurres), pas de
   l'implémentation. Ce qui est déjà couvert ailleurs n'est PAS redupliqué :
   - QCM bien formé (3 choix distincts contenant la réponse) et générateur non figé →
     `catalogue-invariants.test.ts` (property-based sur tout le catalogue) ;
   - les 3 options de chaque item de banque sont distinctes et non vides →
     `logic.test.ts`, describe « vocabulaire — familles, préfixes, suffixes (#113) » ;
   - proportions du pool combiné (~⅓ par type) → bande d'équilibre du même describe de
     `logic.test.ts`, RESSERRÉE à ⅓ ± 5 points par #453 plutôt que dupliquée ici ;
   - structure du pool (pool = intégralité des trois banques, type par type) →
     `vocabulaire-cm1.test.ts`, describe « NON-régression CE2 » ;
   - unicité et disjonction des bases / dérivés de FAMILLES →
     `familles-appariement.test.ts`.

   Restent ici les angles morts : plancher de banque, unicité du mot interrogé dans les
   banques d'affixes (celles que #453 agrandit de 23 entrées chacune), les deux repères
   qui donnent la réponse sans connaissance (fuite du mot interrogé dans une option, et
   bonne réponse qui se détache par sa longueur), cohérence explication ↔ affixe, couverture
   EFFECTIVE du pool par la leçon (par tirage, à travers le catalogue) et déterminisme
   du tirage. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { withSeed } from '../src/core/utils';
import { getLessonById, genLessonItem } from '../src/core/catalog';
import {
	FAMILLES,
	PREFIXES,
	SUFFIXES,
	ITEMS_FAMILLES,
	type ItemAffixe,
} from '../src/data/francais/familles';

/* Plancher de banque de contenu retenu pour le projet (éviter la répétition ressentie) ;
   #453 vise ~54 entrées par banque. On ne fige PAS la taille exacte : un ajout
   pédagogique futur ne doit pas faire rougir ce test. */
const PLANCHER_BANQUE = 50;

/* Marge tolérée, en CARACTÈRES, entre la bonne réponse et le PLUS LONG de ses deux
   distracteurs (garde « option qui se détache visuellement », #453 relecture langue).
   MÉTRIQUE : caractères, et référence = le plus long distracteur.
   - vs la MOYENNE des trois options : mauvaise référence. Une réponse peut dépasser la
     moyenne de 10 caractères tout en égalant le plus long distracteur (deux options
     longues, une courte) — aucun repère exploitable ; et inversement.
   - vs le nombre de MOTS : trop grossier, mesuré sur les banques réelles — « sous-titre »
     a 0 mot d'écart pour +7 caractères, « survêtement » 1 mot d'écart pour +10 (le mot
     « par-dessus » pèse à lui seul), alors que « facilement » avant correction avait
     +2 mots pour +10 caractères. La largeur rendue sur un bouton de QCM suit les
     caractères, pas les mots.
   MARGE = 10, mesurée sur l'état corrigé des banques CE2 : maximum observé +10
   (« survêtement »), puis +9 (« surnom ») ; la banque de suffixes plafonne à +2. Elle
   rattrape 8 des 9 items corrigés par la relecture (de +11 à +28 : récitation, surligner,
   voleur, franchement, rêveur, soustraction, correction, sérieusement) ; « facilement »
   (+10 avant correction) tombe pile sur la marge, tout comme « survêtement » qui, lui,
   est resté — AUCUN seuil de longueur ne sépare ces deux-là. C'est donc un plancher
   contre les repères FLAGRANTS, pas une preuve d'absence de repère : le jugement fin
   reste à la relecture langue. Garde volontairement à sens UNIQUE (un distracteur bien
   plus long que la réponse n'est pas exploitable : l'heuristique « la plus longue »
   mène alors à une erreur). */
const MARGE_LONGUEUR = 10;

/* Tirages d'échantillonnage. 4 000 tirages pour ~163 items : sous graine FIXE le
   résultat est déterministe, et même sous graine libre la probabilité qu'un item
   manque vaut ~163 × e^(−24,5) ≈ 4e−9 → aucun risque de flake. */
const NB_TIRAGES = 4000;
const GRAINE = 453;

const BANQUES_AFFIXES = [
	{ nom: 'PREFIXES', items: PREFIXES, role: 'préfixe' as const },
	{ nom: 'SUFFIXES', items: SUFFIXES, role: 'suffixe' as const },
];

const TOUS_AFFIXES: ItemAffixe[] = [...PREFIXES, ...SUFFIXES];

/* Affixe annoncé par l'explication : « Le préfixe « re- » … » / « Le suffixe « -eur » … ».
   Renvoie le rôle annoncé et l'affixe nu (sans le tiret de position). */
function affixeAnnonce(explication: string): { role: string; affixe: string } | null {
	const m = explication.match(/^Le (préfixe|suffixe)\s+«\s*-?([^»\s-]+)-?\s*»/);
	return m ? { role: m[1], affixe: m[2].toLowerCase() } : null;
}

/* Le mot porte-t-il le préfixe annoncé ? Tolérance d'ÉLISION pour les préfixes longs :
   « sous- » s'écrit « sou- » devant consonne (souterrain, souligner). Réservée aux
   préfixes de 4 lettres et plus, sinon la règle deviendrait vide de sens (« in- »
   accepterait tout mot commençant par « i »). */
function porteLePrefixe(mot: string, prefixe: string): boolean {
	return mot.startsWith(prefixe) || (prefixe.length >= 4 && mot.startsWith(prefixe.slice(0, -1)));
}

describe('Familles / affixes CE2 — taille et unicité des banques (#453)', () => {
	it('les trois banques du pool combiné atteignent le plancher de 50 items', () => {
		for (const [nom, banque] of [
			['FAMILLES', FAMILLES],
			['PREFIXES', PREFIXES],
			['SUFFIXES', SUFFIXES],
		] as const) {
			expect(banque.length, nom).toBeGreaterThanOrEqual(PLANCHER_BANQUE);
		}
	});

	it('le mot interrogé est unique dans chaque banque d’affixes, et entre préfixes et suffixes', () => {
		for (const { nom, items } of BANQUES_AFFIXES) {
			const mots = items.map((a) => a.mot);
			for (const mot of mots) {
				expect(mot.length, `${nom} : mot vide`).toBeGreaterThan(0);
				expect(mot, `${nom} : « ${mot} » a une espace de bord`).toBe(mot.trim());
			}
			const doublons = mots.filter((m, i) => mots.indexOf(m) !== i);
			expect(doublons, `${nom} : mots interrogés deux fois`).toEqual([]);
		}
		// Un même mot ne peut pas être interrogé une fois comme préfixé et une fois comme
		// suffixé : la question serait identique pour deux réponses différentes.
		const setPref = new Set(PREFIXES.map((a) => a.mot));
		const croises = SUFFIXES.map((a) => a.mot).filter((m) => setPref.has(m));
		expect(croises, 'mots présents dans les DEUX banques d’affixes').toEqual([]);
	});

	it('aucune question dupliquée dans le pool combiné (aucune banque versée deux fois)', () => {
		const questions = ITEMS_FAMILLES.map((it) => it.question);
		const doublons = questions.filter((q, i) => questions.indexOf(q) !== i);
		expect(doublons, 'questions présentes plus d’une fois dans le pool').toEqual([]);
	});
});

describe('Familles / affixes CE2 — intégrité des items d’affixes (#453)', () => {
	it('aucune option ne reprend le mot interrogé (pas de fuite de la réponse)', () => {
		// Un item comme « gonflable » → « qu'on peut gonfler (comme une piscine gonflable) »
		// donne la réponse : le mot interrogé ne doit apparaître dans AUCUNE des 3 options
		// (dans la bonne réponse c'est un cadeau, dans un leurre c'est un aimant à erreur).
		// On liste TOUTES les violations d'un coup (diagnostic complet en un run).
		const fuites: string[] = [];
		for (const { nom, items } of BANQUES_AFFIXES) {
			for (const a of items) {
				const mot = a.mot.toLowerCase();
				for (const opt of [a.sens, ...a.distracteurs]) {
					if (opt.toLowerCase().includes(mot)) fuites.push(`${nom} : « ${a.mot} » → « ${opt} »`);
				}
			}
		}
		expect(fuites).toEqual([]);
	});

	it('la bonne réponse ne se détache pas par sa longueur (au plus 10 caractères de plus que le plus long distracteur)', () => {
		// Deuxième famille de repère gratuit, plus grossière que la fuite du mot interrogé :
		// « l'action de réciter un texte appris par cœur » contre « l'action de lire » et
		// « l'action d'écouter » se désigne toute seule. Choisir la plus longue ne demande
		// AUCUNE connaissance — même pas de savoir ce que l'affixe signifie.
		const repères: string[] = [];
		for (const { nom, items } of BANQUES_AFFIXES) {
			for (const a of items) {
				const plusLongDistracteur = Math.max(...a.distracteurs.map((d) => d.length));
				const écart = a.sens.length - plusLongDistracteur;
				if (écart > MARGE_LONGUEUR) {
					repères.push(
						`${nom} : « ${a.mot} » +${écart} car. — « ${a.sens} » vs [${a.distracteurs.join(' | ')}]`,
					);
				}
			}
		}
		expect(repères).toEqual([]);
	});

	it('l’explication annonce un affixe, du bon type et réellement porté par le mot', () => {
		const anomalies: string[] = [];
		for (const { nom, items, role } of BANQUES_AFFIXES) {
			for (const a of items) {
				const annonce = affixeAnnonce(a.explication);
				if (!annonce) {
					anomalies.push(`${nom} : « ${a.mot} » — aucun affixe annoncé (${a.explication})`);
					continue;
				}
				// Un item de préfixes ne peut pas expliquer un suffixe (copier-coller entre banques).
				if (annonce.role !== role) {
					anomalies.push(`${nom} : « ${a.mot} » — annoncé comme ${annonce.role}`);
					continue;
				}
				const mot = a.mot.toLowerCase();
				const porte =
					role === 'préfixe' ? porteLePrefixe(mot, annonce.affixe) : mot.endsWith(annonce.affixe);
				if (!porte) {
					anomalies.push(`${nom} : « ${a.mot} » ne porte pas le ${role} « ${annonce.affixe} »`);
				}
			}
		}
		expect(anomalies).toEqual([]);
	});

	it('l’explication cite le mot interrogé (elle explique bien CET item)', () => {
		// Garde anti-copier-coller : 46 entrées ajoutées d'un coup, une explication recopiée
		// d'un item voisin parlerait d'un autre mot que celui affiché.
		for (const a of TOUS_AFFIXES) {
			expect(
				a.explication.toLowerCase().includes(a.mot.toLowerCase()),
				`« ${a.mot} » : explication qui ne cite pas le mot → ${a.explication}`,
			).toBe(true);
		}
	});
});

describe('Familles / affixes CE2 — la leçon QCM couvre tout le pool (#453)', () => {
	const lecon = getLessonById('fr-vocab-familles')!;

	it('la leçon existe, est en CE2 et n’est branchée qu’aux trois banques CE2', () => {
		expect(lecon).toBeDefined();
		expect(lecon.levels).toEqual(['ce2']);
		expect(lecon.category).toBe('fr-vocabulaire');
	});

	it('chaque entrée des trois banques finit par être interrogée (aucune réservée à une autre leçon)', () => {
		// Cœur de #453 : plus aucun sous-ensemble n'est mis de côté. Vérifié par le TIRAGE,
		// à travers le point d'entrée du catalogue — c'est ce que l'enfant voit — et via les
		// bonnes réponses attendues, dérivées directement des banques.
		const attendues = new Set<string>([
			...FAMILLES.map((f) => f.famille),
			...PREFIXES.map((a) => a.sens),
			...SUFFIXES.map((a) => a.sens),
		]);
		const vues = new Set<string>();
		withSeed(GRAINE, () => {
			for (let i = 0; i < NB_TIRAGES; i++) vues.add(String(genLessonItem(lecon, 'ce2').answer));
		});
		const jamaisTirees = [...attendues].filter((a) => !vues.has(a));
		expect(jamaisTirees, `réponses jamais tirées en ${NB_TIRAGES} exercices`).toEqual([]);
		// … et réciproquement, rien d'autre que ces trois banques n'alimente la leçon CE2.
		const intruses = [...vues].filter((v) => !attendues.has(v));
		expect(intruses, 'réponses hors des trois banques CE2').toEqual([]);
	});

	it('déterminisme : à graine égale, le même exercice (énoncé, réponse, ordre des choix)', () => {
		const tirage = (seed: number): string =>
			withSeed(seed, () => {
				const it = genLessonItem(lecon, 'ce2');
				return JSON.stringify({ t: it.text, a: it.answer, c: it.choices });
			});
		const tirages = new Set<string>();
		for (let seed = 1; seed <= 40; seed++) {
			expect(tirage(seed), `graine ${seed} : tirage non reproductible`).toBe(tirage(seed));
			tirages.add(tirage(seed));
		}
		// Garde anti-tautologie : la graine fait bien varier le tirage (sinon l'égalité
		// ci-dessus serait vraie même avec un générateur figé).
		expect(tirages.size).toBeGreaterThan(1);
	});
});
