/* ============================================================
   Grammaire — classes de mots, articles, adverbes (#116).
   ------------------------------------------------------------
   QCM d'étiquetage, trois sous-types :
   - classe : « table » est un… ? → nom / verbe / adjectif ;
   - article : « ___ soleil » → le / la / les ;
   - adverbe : repérer l'adverbe dans une courte phrase.

   Étiquetage manuel d'une banque INTERNE à cette leçon (on n'étiquette
   PAS les listes personnalisables d'orthographe/conjugaison, pour ne pas
   alourdir la création de liste côté parent). Un builder unifie les trois
   types en items QCM { question, reponse, distracteurs, explication }.
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { choice, sample } from '../../core/utils';
import { MODE_QCM_CHECK } from '../_shared';
import type { LessonInput } from '../_shared';

type Classe = 'nom' | 'verbe' | 'adjectif';
type Article = 'le' | 'la' | 'les';

export interface ItemClasse {
	mot: string;
	classe: Classe;
}
export interface ItemArticle {
	mot: string;
	article: Article;
}
export interface ItemAdverbe {
	phrase: string;
	adverbe: string;
	distracteurs: [string, string]; // deux mots de la phrase (non adverbes)
}

export const CLASSES: ItemClasse[] = [
	{ mot: 'table', classe: 'nom' },
	{ mot: 'chat', classe: 'nom' },
	{ mot: 'maison', classe: 'nom' },
	{ mot: 'voiture', classe: 'nom' },
	{ mot: 'fleur', classe: 'nom' },
	{ mot: 'manger', classe: 'verbe' },
	{ mot: 'courir', classe: 'verbe' },
	{ mot: 'dormir', classe: 'verbe' },
	{ mot: 'chanter', classe: 'verbe' },
	{ mot: 'lire', classe: 'verbe' },
	{ mot: 'content', classe: 'adjectif' },
	{ mot: 'grand', classe: 'adjectif' },
	{ mot: 'joli', classe: 'adjectif' },
	{ mot: 'petit', classe: 'adjectif' },
	{ mot: 'rapide', classe: 'adjectif' },
	// ----- Ajouts #285 (variété anti-répétition) : mots CE2 sans ambiguïté de classe. -----
	{ mot: 'ballon', classe: 'nom' },
	{ mot: 'jardin', classe: 'nom' },
	{ mot: 'oiseau', classe: 'nom' },
	{ mot: 'gâteau', classe: 'nom' },
	{ mot: 'sauter', classe: 'verbe' },
	{ mot: 'jouer', classe: 'verbe' },
	{ mot: 'écrire', classe: 'verbe' },
	{ mot: 'gentil', classe: 'adjectif' },
	{ mot: 'lourd', classe: 'adjectif' },
	{ mot: 'méchant', classe: 'adjectif' },
];

export const ARTICLES: ItemArticle[] = [
	{ mot: 'soleil', article: 'le' },
	{ mot: 'chien', article: 'le' },
	{ mot: 'livre', article: 'le' },
	{ mot: 'ballon', article: 'le' },
	{ mot: 'lune', article: 'la' },
	{ mot: 'table', article: 'la' },
	{ mot: 'voiture', article: 'la' },
	{ mot: 'fleur', article: 'la' },
	{ mot: 'enfants', article: 'les' },
	{ mot: 'chats', article: 'les' },
	{ mot: 'livres', article: 'les' },
	{ mot: 'maisons', article: 'les' },
	// ----- Ajouts #285 : « le/la » jamais devant voyelle ni « h » (sinon élision « l' »). -----
	{ mot: 'gâteau', article: 'le' },
	{ mot: 'bureau', article: 'le' },
	{ mot: 'panier', article: 'le' },
	{ mot: 'vélo', article: 'le' },
	{ mot: 'jardin', article: 'le' },
	{ mot: 'montagne', article: 'la' },
	{ mot: 'banane', article: 'la' },
	{ mot: 'tortue', article: 'la' },
	{ mot: 'chaise', article: 'la' },
	{ mot: 'oiseaux', article: 'les' },
	{ mot: 'voitures', article: 'les' },
	{ mot: 'étoiles', article: 'les' },
	{ mot: 'ballons', article: 'les' },
];

export const ADVERBES: ItemAdverbe[] = [
	{ phrase: 'Le lapin court vite.', adverbe: 'vite', distracteurs: ['lapin', 'court'] },
	{ phrase: 'La fille chante bien.', adverbe: 'bien', distracteurs: ['fille', 'chante'] },
	{ phrase: 'Je mange souvent des fruits.', adverbe: 'souvent', distracteurs: ['fruits', 'mange'] },
	{ phrase: 'Le chien mange beaucoup.', adverbe: 'beaucoup', distracteurs: ['chien', 'mange'] },
	{
		phrase: 'Les vacances commencent demain.',
		adverbe: 'demain',
		distracteurs: ['vacances', 'commencent'],
	},
	{ phrase: 'Le bébé pleure trop.', adverbe: 'trop', distracteurs: ['bébé', 'pleure'] },
	{ phrase: 'Le sapin est très grand.', adverbe: 'très', distracteurs: ['sapin', 'grand'] },
	{
		phrase: "Le train arrive toujours à l'heure.",
		adverbe: 'toujours',
		distracteurs: ['train', 'arrive'],
	},
	{ phrase: 'Mon frère ne ment jamais.', adverbe: 'jamais', distracteurs: ['frère', 'ment'] },
	{
		phrase: 'La tortue avance lentement.',
		adverbe: 'lentement',
		distracteurs: ['tortue', 'avance'],
	},
	{ phrase: "L'élève écrit mal.", adverbe: 'mal', distracteurs: ['élève', 'écrit'] },
	{ phrase: 'Le bébé dort peu.', adverbe: 'peu', distracteurs: ['bébé', 'dort'] },
	// ----- Ajouts #285 : un SEUL adverbe par phrase (pas d'ambiguïté) ; distracteurs = mots de la phrase. -----
	{ phrase: 'Le chien attend dehors.', adverbe: 'dehors', distracteurs: ['chien', 'attend'] },
	{ phrase: 'Le bus arrive tard.', adverbe: 'tard', distracteurs: ['bus', 'arrive'] },
	{ phrase: 'Le coureur arrive enfin.', adverbe: 'enfin', distracteurs: ['coureur', 'arrive'] },
	{
		phrase: 'Tu ranges tes jouets maintenant.',
		adverbe: 'maintenant',
		distracteurs: ['ranges', 'jouets'],
	},
	{
		phrase: 'La maîtresse parle doucement.',
		adverbe: 'doucement',
		distracteurs: ['maîtresse', 'parle'],
	},
	{ phrase: 'Le chat dort encore.', adverbe: 'encore', distracteurs: ['chat', 'dort'] },
	{
		phrase: 'Les enfants jouent calmement.',
		adverbe: 'calmement',
		distracteurs: ['enfants', 'jouent'],
	},
	{ phrase: 'Tu peux poser ton sac ici.', adverbe: 'ici', distracteurs: ['poser', 'sac'] },
	{ phrase: 'Le train est arrivé tôt.', adverbe: 'tôt', distracteurs: ['train', 'arrivé'] },
	{ phrase: 'Le bébé crie fort.', adverbe: 'fort', distracteurs: ['bébé', 'crie'] },
	{ phrase: 'Le chien court loin.', adverbe: 'loin', distracteurs: ['chien', 'court'] },
	{
		phrase: 'On trouve des fleurs partout.',
		adverbe: 'partout',
		distracteurs: ['trouve', 'fleurs'],
	},
	{
		phrase: 'Le grand garçon répond gentiment.',
		adverbe: 'gentiment',
		distracteurs: ['garçon', 'répond'],
	},
];

/** Item QCM unifié. */
export interface ItemClasseQcm {
	type: 'classe' | 'article' | 'adverbe';
	question: string; // se termine par « @ » (emplacement du champ en repli texte)
	reponse: string;
	distracteurs: string[];
	explication: string;
	consigne?: string; // consigne d'action visible (#265) ; absente quand l'énoncé est déjà une question
	parle?: string; // texte lu si l'énoncé affiché est télégraphique (#42)
}

const ROLE_CLASSE: Record<Classe, string> = {
	nom: 'c’est une chose, une personne ou un animal',
	verbe: 'c’est une action',
	adjectif: 'il décrit, il dit comment est quelque chose',
};

const itemsClasse = (): ItemClasseQcm[] =>
	CLASSES.map((c) => ({
		type: 'classe' as const,
		question: `« ${c.mot} » est un… : @`,
		reponse: c.classe,
		distracteurs: (['nom', 'verbe', 'adjectif'] as Classe[]).filter((x) => x !== c.classe),
		explication: `« ${c.mot} » est un ${c.classe} : ${ROLE_CLASSE[c.classe]}.`,
		// Énoncé télégraphique « … est un… : @ » → consigne d'action visible (#265).
		consigne: 'Est-ce un nom, un verbe ou un adjectif ?',
		parle: `À quelle classe appartient le mot « ${c.mot} » : un nom, un verbe ou un adjectif ?`,
	}));

const itemsArticle = (): ItemClasseQcm[] =>
	ARTICLES.map((a) => ({
		type: 'article' as const,
		question: `@ ${a.mot}`,
		reponse: a.article,
		distracteurs: (['le', 'la', 'les'] as Article[]).filter((x) => x !== a.article),
		explication: `On dit « ${a.article} ${a.mot} ».`,
		// Énoncé télégraphique « @ mot » → consigne d'action visible (#265).
		consigne: 'Quel petit mot va devant : le, la ou les ?',
		parle: `Quel petit mot va devant « ${a.mot} » : le, la ou les ?`,
	}));

const itemsAdverbe = (): ItemClasseQcm[] =>
	ADVERBES.map((a) => ({
		type: 'adverbe' as const,
		question: `Quel est l’adverbe ? « ${a.phrase} » : @`,
		reponse: a.adverbe,
		distracteurs: [...a.distracteurs],
		explication: `« ${a.adverbe} » est un adverbe : il dit comment, quand ou combien.`,
	}));

export const ITEMS_CLASSES: ItemClasseQcm[] = [
	...itemsClasse(),
	...itemsArticle(),
	...itemsAdverbe(),
];

const MODE_QCM: ModeOption[] = [MODE_QCM_CHECK];

export function classesMotsType(): ExerciseType {
	return {
		modes: MODE_QCM,
		generate(): Exercise {
			const it = choice(ITEMS_CLASSES);
			return {
				type: 'qcm',
				question: it.question,
				answer: it.reponse,
				choices: sample([it.reponse, ...it.distracteurs], 3),
				explication: it.explication,
				consigne: it.consigne, // visible si l'énoncé est télégraphique (#265) ; absente pour l'adverbe
				parle: it.parle,
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

export const CLASSES_LESSONS: LessonInput[] = [
	{
		id: 'fr-gram-classes',
		label: 'Classes de mots, articles, adverbes',
		exerciseType: classesMotsType(),
	},
];
