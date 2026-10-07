/* ============================================================
   Repli TEXTE du format « appariement » (fiche, bilan, impression).
   ------------------------------------------------------------
   Le geste de l'appariement — relier deux colonnes — n'existe que dans son runner
   (ui/lecon-appariement.ts). Partout ailleurs (fiche imprimée, bilan, sprint papier),
   la manche se replie en UNE question à champ unique, construite par le chemin
   PARTAGÉ `genLessonItem` → `itemDepuisExercice` (src/core/catalog.ts).

   ── L'exigence ───────────────────────────────────────────────────────────────
   Hors du widget, le mot de gauche est servi SEUL : ni les autres mots du groupe, ni
   la colonne de droite, ni rien de ce que l'enfant lisait au-dessus des deux colonnes.
   « Quel mot va avec « le » ? » n'a alors littéralement pas de réponse — « le » peut
   être un pronom, et rien ne dit qu'on parlait du groupe « le petit chien ». Même
   chose, en plus discret, pour « Familles de mots à relier » : « va avec » ne veut
   rien dire tant que la tâche n'est pas nommée (va avec par le sens ? par la rime ?).

   L'exigence tenue ici est donc : **la question posée reste répondable sans contexte
   extérieur, parce que l'énoncé de la manche la précède et porte ce qu'il faut.**
   Ce n'est pas la graphie du repli qui est verrouillée (aucune assertion ne reconstruit
   la phrase produite, et l'espacement est neutralisé) mais trois propriétés de ce qu'il
   contient : l'énoncé survit, il PRÉCÈDE le champ de réponse, et la question posée
   porte sur la MÊME paire que la réponse attendue.

   ── Pourquoi toutes les leçons d'appariement, et pas la seule #731 ───────────
   Ce repli est partagé. Le corriger pour « Nomme les mots du groupe » (#731) ne vaut
   que si l'autre leçon qui l'emprunte y survit : c'était la condition de l'arbitrage.
   L'inventaire est donc LU du catalogue (`isPairingLesson`), pas écrit à la main — une
   troisième leçon d'appariement sera couverte sans que personne y pense, ce qui est
   exactement ce qui a manqué ici.

   ── Ce que ce fichier NE refait PAS ──────────────────────────────────────────
   - `tests/groupe-nominal-nommer.test.ts` (§10) tient, pour #731 seulement, que CHAQUE
     mot du groupe reste lisible dans le repli — la moitié propre à cette leçon ;
   - `tests/logic.test.ts` tient, pour les familles, que la réponse stockée est bien un
     dérivé de la banque.
   Ici : la règle PARTAGÉE, et elle seule.

   ── Limite assumée ──────────────────────────────────────────────────────────
   « Répondable » reste, au fond, un jugement pédagogique. Ce qui se mécanise, et qui
   est ici tenu, c'est que le repli PORTE de quoi répondre (l'énoncé, au bon endroit) et
   qu'il corrige la paire qu'il pose. Qu'un énoncé donné suffise à un enfant de CM1
   relève du `pedagogue-primaire`, pas d'une assertion.

   ── Verrous verts, donc falsifiabilité démontrée ─────────────────────────────
   Les trois tests sont verts au moment où ils sont écrits (le repli est déjà corrigé).
   Le dernier bloc les joue donc sur des replis FABRIQUÉS à partir de manches réelles —
   dont la forme d'avant la correction — et exige qu'ils soient signalés. Aucune
   mutation n'est faite sur la donnée ni sur le code.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	getAllLessons,
	genLessonItem,
	isPairingLesson,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import type { Exercise } from '../src/core/exercise';
import type { Item } from '../src/core/items';

type Manche = Extract<Exercise, { type: 'appariement' }>;
type Paire = Manche['paires'][number];

/* Les deux leçons que l'arbitrage de #731 nomme : #731 a motivé la correction,
   « Familles de mots à relier » est celle qui ne devait pas en souffrir. Elles ne
   BORNENT pas le test (qui énumère le catalogue) : elles servent de plancher, pour
   qu'un inventaire devenu vide ou amputé ne laisse pas la suite verte. */
const LECONS_ATTENDUES = ['fr-vocab-familles-relier', 'fr-gram-gn-nommer'];

/* Le trou où l'enfant écrit sa réponse : marqueur STRUCTUREL de tout `Item.text`
   (`poserAuTrou`, core/items.ts), pas une graphie propre à ce repli. */
const TROU = '@';

/** Graphie neutralisée : seuls comptent les mots, pas l'espacement qui les sépare. */
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** `mot` figure-t-il dans `texte` en MOT ENTIER ? (« le » ne doit pas se trouver dans
    « leçon », ni « chant » dans « chanteur ».) */
function citeMot(texte: string, mot: string): boolean {
	const echappe = mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(?<![\\p{L}\\p{N}'-])${echappe}(?![\\p{L}\\p{N}'-])`, 'iu').test(texte);
}

/* ============================================================
   Les trois propriétés, en prédicats réutilisables : le bloc final les joue sur des
   replis fabriqués pour montrer qu'ils mordent.
   ============================================================ */

/** Raison pour laquelle l'énoncé de la manche ne survit pas au repli, ou `null`. */
function enonceAbsent(texte: string, ex: Manche): string | null {
	if (norm(texte).includes(norm(ex.question))) return null;
	return `l'énoncé « ${ex.question} » a disparu du repli « ${texte} » : la question posée perd ce qui la situe`;
}

/** Ce que le repli DEMANDE : la portion qui suit l'énoncé repris en tête, à condition
    qu'elle porte encore le champ de réponse. `null` si l'énoncé manque, ou s'il ne
    précède pas l'endroit où l'enfant répond (énoncé rejeté après la question, repli
    réduit à son seul énoncé…). */
function questionPosee(texte: string, ex: Manche): string | null {
	const t = norm(texte);
	const e = norm(ex.question);
	const i = t.indexOf(e);
	if (i < 0) return null;
	const apres = t.slice(i + e.length);
	return apres.includes(TROU) ? apres : null;
}

/** La paire sur laquelle porte la question posée : celle dont le mot de gauche y est
    cité. `null` si aucune ne l'est (la question ne dit pas sur quoi elle porte) ou si
    plusieurs le sont (elle en désigne plus d'une, donc aucune). */
function pairePosee(segment: string, ex: Manche): Paire | null {
	const cites = ex.paires.filter((p) => citeMot(segment, p.gauche));
	return cites.length === 1 ? cites[0] : null;
}

/** Raison pour laquelle le repli ne corrige pas la paire qu'il pose, ou `null`. */
function repliIncoherent(texte: string, reponse: string, ex: Manche): string | null {
	const segment = questionPosee(texte, ex);
	if (segment === null) return `aucune question posée après l'énoncé dans « ${texte} »`;
	const paire = pairePosee(segment, ex);
	if (paire === null) {
		return `« ${segment.trim()} » ne désigne pas un mot et un seul de la manche`;
	}
	if (reponse !== paire.droite) {
		return `on interroge « ${paire.gauche} » (réponse « ${paire.droite} ») mais la réponse stockée est « ${reponse} »`;
	}
	return null;
}

/* ============================================================
   Accès : chaque leçon d'appariement, et ses replis tirés sous graine.
   ============================================================ */
const LECONS_APPARIEMENT: LessonDef[] = getAllLessons().filter(isPairingLesson);

/* Assez de graines pour balayer plusieurs manches de chaque banque, sans en faire une
   énumération : ce fichier teste une RÈGLE de conversion, pas une composition. */
const GRAINES = Array.from({ length: 60 }, (_, k) => k + 1);

interface Repli {
	seed: number;
	ex: Manche;
	item: Item;
}

const cache = new Map<string, Repli[]>();

/** Les replis d'une leçon : la manche tirée et l'`Item` produit à partir d'elle, sous
    la MÊME graine (`genLessonItem` appelle `generate` une seule fois, donc les deux
    tirages coïncident — c'est ce qui permet de confronter un repli à sa manche). */
function replis(lesson: LessonDef): Repli[] {
	const cached = cache.get(lesson.id);
	if (cached) return cached;
	const niveau: SchoolLevel = lesson.levels[0];
	const out: Repli[] = GRAINES.map((seed) => {
		const ex = withSeed(seed, () => lesson.exerciseType.generate({ level: niveau }));
		if (ex.type !== 'appariement') {
			throw new Error(`${lesson.id}, graine ${seed} : format « ${ex.type} » au lieu d'appariement`);
		}
		return { seed, ex, item: withSeed(seed, () => genLessonItem(lesson, niveau)) };
	});
	cache.set(lesson.id, out);
	return out;
}

/** Nomme la leçon et la graine : un échec doit pouvoir s'ouvrir directement. */
const ou = (lesson: LessonDef, r: Repli): string => `${lesson.id} / graine ${r.seed}`;

/** Applique `regle` à tous les replis de toutes les leçons d'appariement, et rend la
    liste (dédoublonnée) des manquements. */
function manquements(regle: (lesson: LessonDef, r: Repli) => string | null): string[] {
	const out: string[] = [];
	for (const lesson of LECONS_APPARIEMENT) {
		for (const r of replis(lesson)) {
			const faute = regle(lesson, r);
			if (faute !== null) out.push(`${ou(lesson, r)} : ${faute}`);
		}
	}
	return [...new Set(out)];
}

/* ============================================================
   1. L'inventaire regarde bien quelque chose.
   ============================================================ */
describe('Repli des appariements — inventaire', () => {
	it('toutes les leçons d’appariement du catalogue sont passées au crible, dont les deux concernées', () => {
		const ids = LECONS_APPARIEMENT.map((l) => l.id);
		for (const attendue of LECONS_ATTENDUES) {
			expect(
				ids,
				`${attendue} n'est plus comptée comme leçon d'appariement : le repli partagé ne serait plus éprouvé sur elle`,
			).toContain(attendue);
		}
		expect(
			ids.length,
			'inventaire vide ou amputé : les tests suivants passeraient en ne regardant rien',
		).toBeGreaterThanOrEqual(LECONS_ATTENDUES.length);
	});
});

/* ============================================================
   2. Les trois propriétés, sur les replis réellement servis.
   ============================================================ */
describe('Repli non interactif d’une manche d’appariement (fiche / bilan)', () => {
	it('reprend l’énoncé de la manche : la question garde ce qui la rend répondable', () => {
		expect(manquements((_l, r) => enonceAbsent(r.item.text, r.ex))).toEqual([]);
	});

	it('place l’énoncé AVANT le champ de réponse : on lit le contexte, puis on répond', () => {
		expect(
			manquements((_l, r) =>
				questionPosee(r.item.text, r.ex) === null
					? `rien ne suit l'énoncé jusqu'au champ de réponse dans « ${r.item.text} » — l'enfant répondrait avant d'avoir lu de quoi on parle`
					: null,
			),
		).toEqual([]);
	});

	it('la question posée et la réponse attendue portent sur la MÊME paire', () => {
		expect(
			manquements((_l, r) => repliIncoherent(r.item.text, String(r.item.answer), r.ex)),
			'la fiche corrigerait sur une autre paire que celle qu’elle pose',
		).toEqual([]);
	});
});

/* ============================================================
   3. Les verrous mordent.
   ------------------------------------------------------------
   Les trois tests ci-dessus sont verts : seule une mutation jouée pour de vrai dit
   qu'ils gardent quelque chose. Elle l'est ici, sur des replis FABRIQUÉS à partir de
   manches réelles.
   ============================================================ */
describe('Les verrous du repli mordent', () => {
	it('la forme d’avant la correction (question seule, énoncé jeté) est signalée', () => {
		expect(
			manquements((_l, r) => {
				// Exactement le repli servi jusqu'à #731.
				const avant = `Quel mot va avec « ${r.ex.paires[0].gauche} » ? ${TROU}`;
				if (enonceAbsent(avant, r.ex) === null) return 'énoncé jeté non détecté';
				if (questionPosee(avant, r.ex) !== null) return 'absence d’énoncé non détectée';
				return null;
			}),
		).toEqual([]);
	});

	it('un énoncé rejeté APRÈS le champ de réponse est signalé', () => {
		expect(
			manquements((_l, r) => {
				// L'énoncé est bien là — mais l'enfant a déjà répondu quand il le lit.
				const apres = `Quel mot va avec « ${r.ex.paires[0].gauche} » ? ${TROU} ${r.ex.question}`;
				if (enonceAbsent(apres, r.ex) !== null) {
					return 'témoin invalide : l’énoncé devrait être jugé présent';
				}
				if (questionPosee(apres, r.ex) !== null) return 'énoncé placé trop tard non détecté';
				return null;
			}),
		).toEqual([]);
	});

	it('une réponse décalée d’une paire est signalée', () => {
		expect(
			manquements((_l, r) => {
				const segment = questionPosee(r.item.text, r.ex);
				if (segment === null) return 'témoin invalide : repli illisible';
				const paire = pairePosee(segment, r.ex);
				if (paire === null) return 'témoin invalide : aucune paire désignée';
				// La réponse d'une AUTRE paire de la même manche : la fiche corrigerait à côté.
				const autre = r.ex.paires.find((p) => p.droite !== paire.droite);
				if (!autre) return 'témoin invalide : toutes les paires ont la même réponse';
				return repliIncoherent(r.item.text, autre.droite, r.ex) === null
					? 'réponse décalée non détectée'
					: null;
			}),
		).toEqual([]);
	});

	it('une question qui ne désigne aucun mot de la manche est signalée', () => {
		expect(
			manquements((_l, r) => {
				// L'énoncé est là, au bon endroit, mais la question ne dit pas sur quoi elle porte.
				const flou = `${r.ex.question} Quel mot va avec celui-ci ? ${TROU}`;
				return repliIncoherent(flou, String(r.item.answer), r.ex) === null
					? 'question sans cible non détectée'
					: null;
			}),
		).toEqual([]);
	});
});
