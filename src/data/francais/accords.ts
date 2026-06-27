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
import type { Exercise, ExerciseType, ModeOption, GenerateOpts } from '../../core/exercise';
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
	// Ajouts #285 (variété) : adjectifs PARFAITEMENT réguliers (féminin + e, pluriel + s).
	{ mascSing: 'rond', femSing: 'ronde', mascPlur: 'ronds', femPlur: 'rondes' },
	{ mascSing: 'plat', femSing: 'plate', mascPlur: 'plats', femPlur: 'plates' },
	{ mascSing: 'dur', femSing: 'dure', mascPlur: 'durs', femPlur: 'dures' },
	{ mascSing: 'lourd', femSing: 'lourde', mascPlur: 'lourds', femPlur: 'lourdes' },
	{ mascSing: 'froid', femSing: 'froide', mascPlur: 'froids', femPlur: 'froides' },
	{ mascSing: 'haut', femSing: 'haute', mascPlur: 'hauts', femPlur: 'hautes' },
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

/* Mots variables CM1 (#243) : adjectifs à terminaisons plus subtiles (-er/-ère,
   -f/-ve, -et/-ète sans doublement, -eur/-euse & -teur/-trice, -al/-aux) et
   quelques noms à pluriel -aux (avec l'exception « festival/festivals » pour le
   piège). Banque plus exigeante que le CE2 ; elle NE MIXE PAS les mots fléchis du
   profil (réservés à la leçon des réguliers). Aucun mot déjà présent en CE2. */
const ACCORDS_CM1: FormesAccord[] = [
	// Adjectifs -er / -ère.
	{ mascSing: 'léger', femSing: 'légère', mascPlur: 'légers', femPlur: 'légères' },
	{ mascSing: 'premier', femSing: 'première', mascPlur: 'premiers', femPlur: 'premières' },
	{ mascSing: 'dernier', femSing: 'dernière', mascPlur: 'derniers', femPlur: 'dernières' },
	{ mascSing: 'entier', femSing: 'entière', mascPlur: 'entiers', femPlur: 'entières' },
	{ mascSing: 'fier', femSing: 'fière', mascPlur: 'fiers', femPlur: 'fières' },
	{ mascSing: 'étranger', femSing: 'étrangère', mascPlur: 'étrangers', femPlur: 'étrangères' },
	{ mascSing: 'régulier', femSing: 'régulière', mascPlur: 'réguliers', femPlur: 'régulières' },
	// Adjectifs -f / -ve.
	{ mascSing: 'actif', femSing: 'active', mascPlur: 'actifs', femPlur: 'actives' },
	{ mascSing: 'vif', femSing: 'vive', mascPlur: 'vifs', femPlur: 'vives' },
	{ mascSing: 'neuf', femSing: 'neuve', mascPlur: 'neufs', femPlur: 'neuves' },
	{ mascSing: 'bref', femSing: 'brève', mascPlur: 'brefs', femPlur: 'brèves' },
	{ mascSing: 'positif', femSing: 'positive', mascPlur: 'positifs', femPlur: 'positives' },
	{ mascSing: 'négatif', femSing: 'négative', mascPlur: 'négatifs', femPlur: 'négatives' },
	{ mascSing: 'attentif', femSing: 'attentive', mascPlur: 'attentifs', femPlur: 'attentives' },
	// Adjectifs -et / -ète (exceptions sans doublement du t).
	{ mascSing: 'secret', femSing: 'secrète', mascPlur: 'secrets', femPlur: 'secrètes' },
	{ mascSing: 'discret', femSing: 'discrète', mascPlur: 'discrets', femPlur: 'discrètes' },
	{ mascSing: 'inquiet', femSing: 'inquiète', mascPlur: 'inquiets', femPlur: 'inquiètes' },
	{ mascSing: 'complet', femSing: 'complète', mascPlur: 'complets', femPlur: 'complètes' },
	{ mascSing: 'incomplet', femSing: 'incomplète', mascPlur: 'incomplets', femPlur: 'incomplètes' },
	// Adjectifs -eur / -euse & -teur / -trice.
	{ mascSing: 'joueur', femSing: 'joueuse', mascPlur: 'joueurs', femPlur: 'joueuses' },
	{ mascSing: 'menteur', femSing: 'menteuse', mascPlur: 'menteurs', femPlur: 'menteuses' },
	{ mascSing: 'trompeur', femSing: 'trompeuse', mascPlur: 'trompeurs', femPlur: 'trompeuses' },
	{ mascSing: 'directeur', femSing: 'directrice', mascPlur: 'directeurs', femPlur: 'directrices' },
	{ mascSing: 'lecteur', femSing: 'lectrice', mascPlur: 'lecteurs', femPlur: 'lectrices' },
	{ mascSing: 'acteur', femSing: 'actrice', mascPlur: 'acteurs', femPlur: 'actrices' },
	// Adjectifs -al / -aux.
	{ mascSing: 'national', femSing: 'nationale', mascPlur: 'nationaux', femPlur: 'nationales' },
	{ mascSing: 'local', femSing: 'locale', mascPlur: 'locaux', femPlur: 'locales' },
	{ mascSing: 'spécial', femSing: 'spéciale', mascPlur: 'spéciaux', femPlur: 'spéciales' },
	{ mascSing: 'principal', femSing: 'principale', mascPlur: 'principaux', femPlur: 'principales' },
	{ mascSing: 'royal', femSing: 'royale', mascPlur: 'royaux', femPlur: 'royales' },
	{ mascSing: 'amical', femSing: 'amicale', mascPlur: 'amicaux', femPlur: 'amicales' },
	{ mascSing: 'légal', femSing: 'légale', mascPlur: 'légaux', femPlur: 'légales' },
	// Noms à pluriel -aux (pluriel seul).
	{ mascSing: 'général', mascPlur: 'généraux' },
	{ mascSing: 'végétal', mascPlur: 'végétaux' },
	{ mascSing: 'minéral', mascPlur: 'minéraux' },
	{ mascSing: 'canal', mascPlur: 'canaux' },
	// Exception : pluriel régulier en -s malgré la finale -al (le piège).
	{ mascSing: 'festival', mascPlur: 'festivals' },
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
	// Ajouts #285 (variété) : adjectifs à féminin/pluriel irréguliers, sans risque.
	{ mascSing: 'blanc', femSing: 'blanche', mascPlur: 'blancs', femPlur: 'blanches' },
	{ mascSing: 'frais', femSing: 'fraîche', mascPlur: 'frais', femPlur: 'fraîches' },
	{ mascSing: 'vieux', femSing: 'vieille', mascPlur: 'vieux', femPlur: 'vieilles' },
	{ mascSing: 'épais', femSing: 'épaisse', mascPlur: 'épais', femPlur: 'épaisses' },
	// (« gris » retiré : une fois les transformations triviales filtrées, il ne
	//  produirait que des transformations régulières — rien d'irrégulier à montrer.)
	// Noms à pluriel irrégulier supplémentaires (-eaux, -aux).
	{ mascSing: 'cadeau', mascPlur: 'cadeaux' },
	{ mascSing: 'manteau', mascPlur: 'manteaux' },
	{ mascSing: 'tableau', mascPlur: 'tableaux' },
	{ mascSing: 'métal', mascPlur: 'métaux' },
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
	{ id: 'saisie', label: "J'écris la forme", icon: 'pencil', recommended: true },
	{
		id: 'qcm',
		label: 'Je choisis la bonne réponse',
		hint: 'plus facile pour commencer',
		icon: 'check-circle',
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

/* Configuration d'une leçon d'accords (#243) : la banque de mots PRÉDÉFINIE de la
   leçon et, optionnellement, l'ajout des mots fléchis du profil (listes du parent).
   Seule la leçon des réguliers CE2 active `inclureFlechies` — les autres leçons
   (irréguliers, CM1) gardent une banque PRÉDÉFINIE pure, sans mots du profil. */
interface AccordConfig {
	banque: FormesAccord[];
	inclureFlechies?: boolean;
}

/* Fabrique l'ExerciseType d'une leçon d'accords à partir de sa banque. La leçon
   des réguliers complète son pool avec les mots fléchis de la banque du profil. */
function accordType(config: AccordConfig): ExerciseType {
	return {
		modes: ACCORD_MODE_OPTIONS,
		consigne: 'Écris chaque mot à la forme demandée.', // #42 : nomme la tâche
		generate(opts?: GenerateOpts): Exercise {
			const mode = opts?.mode;
			const base = config.inclureFlechies ? [...config.banque, ...banqueFlechies()] : config.banque;
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
		exerciseType: accordType({ banque: ACCORDS_REGULIERS, inclureFlechies: true }),
	},
	{
		id: 'fr-accords-irreguliers',
		label: 'Pluriel et féminin — irréguliers',
		rubrique: RUBRIQUE_ACCORDS,
		exerciseType: accordType({ banque: ACCORDS_IRREGULIERS }),
	},
];

/* Leçon CM1 (#243) : terminaisons d'adjectifs plus subtiles + noms à pluriel -aux,
   sur le MÊME moteur deux-modes que le CE2, mais sans mixer les mots fléchis du
   profil (banque prédéfinie pure). Déclarée à part pour la taguer levels:['cm1']
   au catalogue (les deux leçons ci-dessus restent CE2). */
export const ACCORD_CM1_LESSONS: AccordLessonDef[] = [
	{
		id: 'fr-accords-cm1',
		label: 'Pluriel et féminin — au CM1',
		rubrique: RUBRIQUE_ACCORDS,
		exerciseType: accordType({ banque: ACCORDS_CM1 }),
	},
];

/* Exposées pour les tests (vérifier le contenu des banques et l'invariant
   « CE2 inchangé »). Pas consommées par le catalogue (qui passe par ACCORD_LESSONS). */
export { ACCORDS_REGULIERS, ACCORDS_IRREGULIERS, ACCORDS_CM1 };
