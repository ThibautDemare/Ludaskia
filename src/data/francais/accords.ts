/* ============================================================
   Orthographe grammaticale — accords en nombre et en genre (#109).
   ------------------------------------------------------------
   Exercices de TRANSFORMATION (« Mets au pluriel : grand → @ »,
   « Mets au féminin : grand → @ »). La bonne réponse est la forme
   STOCKÉE (jamais une règle déduite) : on couvre ainsi aussi bien les
   transformations régulières (chat → chats, grand → grande) que les
   irrégulières (cheval → chevaux, beau → belle, œil → yeux).

   Deux leçons distinctes (avis pédagogique : ne jamais mélanger règle et
   exception tant que le régulier n'est pas stabilisé) :
   - « Pluriel et féminin — réguliers »   (+ s, + e)
   - « Pluriel et féminin — irréguliers » (-aux, -eaux, féminins spéciaux…)

   Réutilise le moteur deux-modes saisie/QCM de la conjugaison : les
   distracteurs du QCM sont de VRAIES formes (jamais une faute affichée,
   cf. risque d'ancrage). Repli QCM automatique pour les formes longues.

   La leçon des réguliers pioche AUSSI les mots de la banque du profil qui
   ont des formes renseignées (listes du parent, #109) : ils « remontent »
   ainsi dans les exercices.
   ============================================================ */
import type { Exercise, ExerciseType, ExerciseMode, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { choice, sample } from '../../core/utils';
import type { FormesAccord } from '../../core/orthographe/types';
import { loadOrtho } from '../../core/orthographe/store';

export interface AccordLessonDef {
	id: string;
	label: string;
	rubrique: string;
	exerciseType: ExerciseType;
}

/* Mots variables réguliers : adjectifs (féminin + e, pluriel + s) et noms
   (pluriel + s, parfois féminin). */
const ACCORDS_REGULIERS: FormesAccord[] = [
	// Adjectifs réguliers (4 formes).
	{ mascSing: 'grand', femSing: 'grande', mascPlur: 'grands', femPlur: 'grandes' },
	{ mascSing: 'petit', femSing: 'petite', mascPlur: 'petits', femPlur: 'petites' },
	{ mascSing: 'vert', femSing: 'verte', mascPlur: 'verts', femPlur: 'vertes' },
	{ mascSing: 'joli', femSing: 'jolie', mascPlur: 'jolis', femPlur: 'jolies' },
	{ mascSing: 'fort', femSing: 'forte', mascPlur: 'forts', femPlur: 'fortes' },
	{ mascSing: 'lent', femSing: 'lente', mascPlur: 'lents', femPlur: 'lentes' },
	{ mascSing: 'bleu', femSing: 'bleue', mascPlur: 'bleus', femPlur: 'bleues' },
	{ mascSing: 'noir', femSing: 'noire', mascPlur: 'noirs', femPlur: 'noires' },
	// Noms réguliers avec masculin/féminin.
	{ mascSing: 'ami', femSing: 'amie', mascPlur: 'amis', femPlur: 'amies' },
	{ mascSing: 'voisin', femSing: 'voisine', mascPlur: 'voisins', femPlur: 'voisines' },
	{ mascSing: 'marchand', femSing: 'marchande', mascPlur: 'marchands', femPlur: 'marchandes' },
	{ mascSing: 'client', femSing: 'cliente', mascPlur: 'clients', femPlur: 'clientes' },
	// Noms réguliers, pluriel seul (+ s).
	{ mascSing: 'chien', mascPlur: 'chiens' },
	{ mascSing: 'fleur', mascPlur: 'fleurs' },
	{ mascSing: 'maison', mascPlur: 'maisons' },
];

/* Mots variables irréguliers : pluriels en -aux/-eaux/-eux, féminins spéciaux. */
const ACCORDS_IRREGULIERS: FormesAccord[] = [
	// Pluriels en -aux.
	{ mascSing: 'cheval', mascPlur: 'chevaux' },
	{ mascSing: 'animal', mascPlur: 'animaux' },
	{ mascSing: 'journal', mascPlur: 'journaux' },
	{ mascSing: 'hôpital', mascPlur: 'hôpitaux' },
	{ mascSing: 'bocal', mascPlur: 'bocaux' },
	// Pluriels en -eaux.
	{ mascSing: 'bateau', mascPlur: 'bateaux' },
	{ mascSing: 'gâteau', mascPlur: 'gâteaux' },
	{ mascSing: 'château', mascPlur: 'châteaux' },
	{ mascSing: 'oiseau', mascPlur: 'oiseaux' },
	{ mascSing: 'chapeau', mascPlur: 'chapeaux' },
	// Pluriels en -eux.
	{ mascSing: 'jeu', mascPlur: 'jeux' },
	{ mascSing: 'cheveu', mascPlur: 'cheveux' },
	// Pluriel très irrégulier.
	{ mascSing: 'œil', mascPlur: 'yeux' },
	// Adjectifs à féminin/pluriel irréguliers (4 formes).
	{ mascSing: 'beau', femSing: 'belle', mascPlur: 'beaux', femPlur: 'belles' },
	{ mascSing: 'nouveau', femSing: 'nouvelle', mascPlur: 'nouveaux', femPlur: 'nouvelles' },
	{ mascSing: 'doux', femSing: 'douce', mascPlur: 'doux', femPlur: 'douces' },
	{ mascSing: 'long', femSing: 'longue', mascPlur: 'longs', femPlur: 'longues' },
	{ mascSing: 'gros', femSing: 'grosse', mascPlur: 'gros', femPlur: 'grosses' },
	{ mascSing: 'heureux', femSing: 'heureuse', mascPlur: 'heureux', femPlur: 'heureuses' },
	// Adjectif long → exerce le repli QCM (forme cible > seuil).
	{
		mascSing: 'merveilleux',
		femSing: 'merveilleuse',
		mascPlur: 'merveilleux',
		femPlur: 'merveilleuses',
	},
];

/* Une transformation possible : consigne + forme de départ → forme cible. */
interface Transfo {
	consigne: string;
	source: string;
	answer: string;
}

/* Transformations disponibles pour un mot, d'après les formes renseignées.
   On écarte les transformations triviales (source === cible : ex. « gris » au
   pluriel reste « gris », « heureux » au pluriel reste « heureux »). */
export function transfosDisponibles(f: FormesAccord): Transfo[] {
	const out: Transfo[] = [];
	const push = (consigne: string, source?: string, answer?: string) => {
		if (source && answer && source !== answer) out.push({ consigne, source, answer });
	};
	push('Mets au pluriel', f.mascSing, f.mascPlur);
	push('Mets au pluriel', f.femSing, f.femPlur);
	push('Mets au féminin', f.mascSing, f.femSing);
	push('Mets au féminin', f.mascPlur, f.femPlur);
	return out;
}

/* Au-delà de cette longueur, la forme cible est pénible à taper sans faute de
   frappe : on bascule en QCM même en mode saisie (repli « mots longs », #109). */
const LONG_SEUIL = 9;
const QCM_CHOICES = 4;

const ACCORD_MODE_OPTIONS: ModeOption[] = [
	{ id: 'saisie', label: "J'écris la forme", icon: '✏️', recommended: true },
	{
		id: 'qcm',
		label: 'Je choisis la bonne réponse',
		hint: 'plus facile pour commencer',
		icon: '✅',
	},
];

const norm = (s: string) => s.normalize('NFC');

/* Toutes les formes connues d'un mot (pour les distracteurs : de VRAIES formes). */
const formesDe = (f: FormesAccord): string[] =>
	[f.mascSing, f.femSing, f.mascPlur, f.femPlur].filter((x): x is string => !!x);

/* Distracteurs d'un QCM : d'abord les autres formes du même mot (teste le bon
   accord), puis des formes d'autres mots du pool. Toutes de VRAIES formes
   correctement orthographiées (jamais une faute affichée). */
function distracteurs(mot: FormesAccord, answer: string, pool: FormesAccord[]): string[] {
	const seen = new Set<string>([norm(answer)]);
	const picked: string[] = [];
	const add = (f: string) => {
		const n = norm(f);
		if (!seen.has(n)) {
			seen.add(n);
			picked.push(f);
		}
	};
	formesDe(mot).forEach(add); // 1. autres formes du même mot
	for (const autre of sample(pool, pool.length)) {
		if (picked.length >= QCM_CHOICES - 1) break;
		formesDe(autre).forEach((f) => {
			if (picked.length < QCM_CHOICES - 1) add(f);
		});
	}
	return picked.slice(0, QCM_CHOICES - 1);
}

/* Mots de la banque du profil ayant des formes renseignées (listes du parent) :
   ils « remontent » dans les exercices d'accord. Robuste hors navigateur. */
function banqueFlechies(): FormesAccord[] {
	try {
		return Object.values(loadOrtho().banque)
			.map((m) => m.formes)
			.filter((f): f is FormesAccord => !!f);
	} catch {
		return [];
	}
}

/* Fabrique l'ExerciseType d'une leçon d'accords. `reguliers` : la leçon des
   réguliers complète son pool avec les mots fléchis de la banque du profil. */
function accordType(reguliers: boolean): ExerciseType {
	return {
		modes: ACCORD_MODE_OPTIONS,
		generate(mode?: ExerciseMode): Exercise {
			const base = reguliers ? [...ACCORDS_REGULIERS, ...banqueFlechies()] : ACCORDS_IRREGULIERS;
			// Toutes les transformations possibles (mot + transformation).
			const paires = base.flatMap((f) => transfosDisponibles(f).map((t) => ({ f, t })));
			const enQcm = mode === 'qcm';
			// Repli « mots longs » (#109) : en saisie, on écarte les formes cibles
			// longues (pénibles à taper sans faute de frappe) — elles ne sont
			// proposées qu'en QCM. Chaque mode reste ainsi STABLE en type d'exercice
			// (le routage du runner sonde generate(mode).type).
			const candidates = enQcm ? paires : paires.filter((p) => p.t.answer.length <= LONG_SEUIL);
			const { f: mot, t } = choice(candidates.length ? candidates : paires);
			const question = `${t.consigne} : ${t.source} → @`;
			if (enQcm) {
				const choices = sample([t.answer, ...distracteurs(mot, t.answer, base)], QCM_CHOICES);
				return { type: 'qcm', question, answer: t.answer, choices };
			}
			return { type: 'text', question, answer: t.answer };
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

const RUBRIQUE_ACCORDS = 'Les accords';

export const ACCORD_LESSONS: AccordLessonDef[] = [
	{
		id: 'fr-accords-reguliers',
		label: 'Pluriel et féminin — réguliers',
		rubrique: RUBRIQUE_ACCORDS,
		exerciseType: accordType(true),
	},
	{
		id: 'fr-accords-irreguliers',
		label: 'Pluriel et féminin — irréguliers',
		rubrique: RUBRIQUE_ACCORDS,
		exerciseType: accordType(false),
	},
];
