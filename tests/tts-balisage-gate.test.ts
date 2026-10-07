/* ============================================================
   Gate — aucun repli ne dicte son BALISAGE à voix haute.
   ------------------------------------------------------------
   Un `Item.text` peut porter du balisage léger : « **…** » met une portion en gras,
   que `enonceTexte` (core/items.ts) traduit en `<strong>` À L'AFFICHAGE. Le texte LU,
   lui, part par un autre chemin — `texteItemParle` → `texteParle` (core/tts-text.ts) —
   qui nettoie les balises HTML, les entités et le trou `@`, mais PAS ces marqueurs-là :
   à l'instant où il est appelé, le gras n'a pas encore été posé. Un repli qui met du
   gras sans fournir de `parle` fait donc entendre à l'enfant la ponctuation du balisage,
   et la colle aussi dans l'`aria-label` de son champ de réponse (`nomChampReponse`).

   ── Pourquoi un gate, et pas une relecture ──────────────────────────────────
   Le défaut est MUET : rien ne casse, les tests passent, l'écran est correct. Il ne
   s'entend que sur l'appareil, par un enfant qui utilise le bouton « Écouter » — le
   public le moins susceptible de le signaler. Il a été introduit par une correction, et
   n'a été vu qu'en relecture (#731).
   La surface est plus large qu'il n'y paraît : mesuré à l'écriture de ce fichier, **16
   leçons** servent un énoncé en gras (les six familles de problèmes, la division
   euclidienne et son reste, les durées, les synonymes et contraires des deux niveaux,
   le participe passé avec « être », les deux appariements). Toutes s'en protègent
   aujourd'hui, de deux façons : un `parle` sans astérisques, ou `parle: ''` pour rester
   muet quand l'oral trahirait la réponse (homophones). La dix-septième qui oubliera doit
   rougir ici.

   ── La propriété tenue ──────────────────────────────────────────────────────
   Elle ne porte ni sur une branche d'`itemDepuisExercice`, ni sur la présence d'un champ
   `parle` : **ce que le moteur vocal reçoit ne contient aucun marqueur d'affichage.**
   Formulée ainsi, elle accepte les trois remèdes (un `parle` propre, un `parle` vide, un
   texte sans gras) sans en imposer aucun, et elle passe par la fonction que l'interface
   utilise vraiment (`texteItemParle`, point unique #630) au lieu de recopier la règle
   `parle ?? text`.

   ── Deux témoins tiennent le gate honnête ───────────────────────────────────
   Un marqueur n'est inscrit dans la table ci-dessous que s'il est à la fois INTERPRÉTÉ
   par le rendu et IGNORÉ par le nettoyage vocal : les deux sont vérifiés ici même, sur
   `enonceTexte` et `texteParle`. Si `texteParle` se mettait à retirer les astérisques,
   le second témoin échouerait en disant que ce gate ne garde plus rien — plutôt que de
   rester vert en ne protégeant plus de rien.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getAllLessons, genLessonItem, genLessonSession } from '../src/core/catalog';
import type { LessonDef } from '../src/core/catalog';
import { enonceTexte, texteItemParle, type Item } from '../src/core/items';
import { texteParle } from '../src/core/tts-text';
import { withSeed } from '../src/core/utils';

/* ============================================================
   1. Les marqueurs d'affichage.
   ============================================================ */
interface Marqueur {
	nom: string;
	/** Le détecte dans un texte. */
	motif: RegExp;
	/** Énoncé de démonstration qui le porte (sert aux deux témoins ci-dessous). */
	exemple: string;
}

const MARQUEURS: Marqueur[] = [
	{
		nom: 'gras « **…** » (core/items.ts, `enonceTexte`)',
		motif: /\*\*/,
		exemple: 'Il lui reste **combien** de billes ?',
	},
];

/** Marqueurs trouvés dans un texte (liste vide = rien à signaler). */
const marqueursDe = (texte: string): string[] =>
	MARQUEURS.filter((m) => m.motif.test(texte)).map((m) => m.nom);

describe('Les marqueurs surveillés en sont bien', () => {
	it('le RENDU les interprète : ils deviennent du balisage, ils ne s’affichent pas', () => {
		for (const m of MARQUEURS) {
			const rendu = enonceTexte(m.exemple).balisage;
			expect(rendu, `${m.nom} : « ${m.exemple} » ne produit aucune balise`).toMatch(/<[a-z]+/);
			expect(
				m.motif.test(rendu),
				`${m.nom} : le marqueur survit à l'affichage — ce n'en est pas un`,
			).toBe(false);
		}
	});

	it('le NETTOYAGE VOCAL ne les retire pas : sans `parle`, la voix les reçoit', () => {
		for (const m of MARQUEURS) {
			expect(
				m.motif.test(texteParle(m.exemple)),
				`${m.nom} : texteParle le nettoie déjà — ce gate ne garde plus rien, il faut le retirer ou le revoir`,
			).toBe(true);
		}
	});

	it('le nettoyage vocal retire, lui, ce qu’il annonce retirer (témoin de non-régression)', () => {
		// Contre-témoins : si `texteParle` cessait de nettoyer ces formes-là, le gate
		// ci-dessous se mettrait à signaler des items parfaitement sains.
		expect(texteParle('Combien de <strong>billes</strong> ?')).not.toMatch(/[<>]/);
		expect(texteParle('3 + 4 = @'), 'le trou doit rester muet').not.toContain('@');
	});
});

/* ============================================================
   2. Le balayage : tout item que le catalogue sait produire.
   ------------------------------------------------------------
   `itemDepuisExercice` n'est pas exporté ; ses deux appelants publics le sont
   (`genLessonItem`, `genLessonSession`). On passe donc par eux, sur CHAQUE leçon,
   CHAQUE niveau déclaré et CHAQUE mode déclaré — un mode alternatif produit un autre
   `Exercise`, donc un autre repli (c'est le trou qu'avait déjà corrigé #410 sur le
   harnais d'invariants).
   ============================================================ */
const LECONS: LessonDef[] = getAllLessons();

/* Graines fixes plutôt qu'aléatoires : un échec doit se rejouer tel quel. Peu nombreuses
   par (leçon × niveau × mode), mais le produit balaie plusieurs milliers d'items — assez
   pour atteindre les branches de repli, qui ne dépendent pas du tirage. */
const GRAINES = [1, 2, 3, 5, 8, 13, 21, 34];

interface ItemVu {
	/** Leçon, niveau et mode : la MAILLE d'un message d'échec (la graine n'y entre pas,
	    sinon un seul oubli produirait des centaines de lignes identiques à un mot près). */
	ou: string;
	item: Item;
}

let cache: ItemVu[] | null = null;

function tousLesItems(): ItemVu[] {
	if (cache) return cache;
	const out: ItemVu[] = [];
	for (const lesson of LECONS) {
		for (const level of lesson.levels) {
			const modes = lesson.exerciseType.modes?.map((m) => m.id) ?? [undefined];
			for (const mode of modes) {
				const ou = `${lesson.id}@${level}/${mode ?? 'défaut'}`;
				for (const seed of GRAINES) {
					withSeed(seed, () => {
						out.push({ ou, item: genLessonItem(lesson, level, mode) });
						// Second appelant d'`itemDepuisExercice` : la génération par SESSION (#717).
						for (const item of genLessonSession(lesson, 3, level, mode) ?? []) {
							out.push({ ou, item });
						}
					});
				}
			}
		}
	}
	cache = out;
	return cache;
}

describe('Gate — aucun repli ne fait lire son balisage à voix haute', () => {
	it('le balayage atteint bien le catalogue (garde contre un gate à vide)', () => {
		expect(LECONS.length, 'catalogue vide').toBeGreaterThan(50);
		expect(
			tousLesItems().length,
			'aucun item produit : le gate ne regarderait rien',
		).toBeGreaterThan(1000);
	});

	it('le texte LU par le moteur vocal ne contient aucun marqueur d’affichage', () => {
		const fautes = new Set<string>();
		for (const { ou, item } of tousLesItems()) {
			for (const nom of marqueursDe(texteItemParle(item))) {
				fautes.add(
					`${ou} : ${nom} — « ${item.text} » est lu tel quel ; fournir un \`parle\` sans balisage (ou \`parle: ''\` pour rester muet)`,
				);
			}
		}
		expect([...fautes]).toEqual([]);
	});
});

/* ============================================================
   3. Le témoin : le gate mord.
   ------------------------------------------------------------
   Le code est déjà conforme, donc le test ci-dessus est vert et ne prouve rien tant
   qu'on n'a pas montré ce qui le casse. La mutation n'est pas inventée : on prend les
   items qui portent RÉELLEMENT du balisage dans leur texte — ceux que seul leur `parle`
   protège — et on leur retire ce `parle`. C'est exactement l'oubli qu'on veut attraper.
   ============================================================ */
describe('Le gate mord', () => {
	/** Items dont le TEXTE affiché porte un marqueur : les seuls que leur `parle` protège. */
	const protegesParLeurParle = (): ItemVu[] =>
		tousLesItems().filter(({ item }) => marqueursDe(item.text).length > 0);

	it('des items portent effectivement du balisage : la mutation a de quoi mordre', () => {
		const vus = protegesParLeurParle();
		expect(
			vus.length,
			'aucun item du catalogue ne porte de balisage : le gate est sans objet aujourd’hui (le dire, plutôt que de le laisser vert)',
		).toBeGreaterThan(0);
		// Plusieurs leçons, et pas une seule : un témoin adossé à un unique énoncé se
		// périmerait le jour où CETTE leçon change de forme, sans que le gate perde sa
		// raison d'être. (Mesuré à l'écriture : 16 leçons, des problèmes aux appariements
		// en passant par les synonymes et la division euclidienne.)
		const lecons = new Set(vus.map(({ item }) => item._lesson));
		expect(
			lecons.size,
			`balisage vu dans une seule leçon (${[...lecons].join(', ')})`,
		).toBeGreaterThan(1);
	});

	it('retirer le `parle` d’un item balisé le fait signaler — sur chacun d’eux', () => {
		const rates = new Set<string>();
		for (const { ou, item } of protegesParLeurParle()) {
			const sansParle: Item = { ...item, parle: undefined };
			if (marqueursDe(texteItemParle(sansParle)).length === 0) {
				rates.add(`${ou} : « ${item.text} » privé de son \`parle\` passerait inaperçu`);
			}
		}
		expect([...rates]).toEqual([]);
	});

	it('les trois remèdes en place passent, et seulement eux', () => {
		// Témoins SAINS : les trois formes effectivement utilisées dans le code.
		const texteBalise = 'Il lui reste **combien** de billes ?';
		const propre = (parle: string | undefined): Item => ({
			text: texteBalise,
			answer: '4',
			kind: 'text',
			parle,
		});
		expect(
			marqueursDe(texteItemParle(propre('Il lui reste combien de billes ?'))),
			'un `parle` sans balisage doit passer',
		).toEqual([]);
		expect(
			marqueursDe(texteItemParle(propre(''))),
			"`parle: ''` (leçon muette) doit passer",
		).toEqual([]);
		expect(
			marqueursDe(texteItemParle({ text: 'Combien de billes ?', answer: '4', kind: 'text' })),
			'un énoncé sans balisage doit passer',
		).toEqual([]);
		// Témoin FAUTIF : le même énoncé balisé, sans `parle`.
		expect(
			marqueursDe(texteItemParle(propre(undefined))),
			'un énoncé balisé sans `parle` doit être signalé',
		).not.toEqual([]);
		// Piège : un `parle` qui recopie le texte balisé ne règle rien.
		expect(
			marqueursDe(texteItemParle(propre(texteBalise))),
			'un `parle` qui recopie le balisage doit être signalé',
		).not.toEqual([]);
	});
});
