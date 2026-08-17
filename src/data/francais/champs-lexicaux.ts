/* ============================================================
   Vocabulaire — champs lexicaux (#114).
   ------------------------------------------------------------
   Une banque de mots PRÉCIS ou RARES au CE2, organisée par CHAMP
   (thème) : météo, corps, cuisine, forêt, mer, école, ville,
   émotions, montagne, jardin. L'objectif est d'élargir le lexique,
   pas de réviser des mots déjà connus.

   Trois formats, sans aucune saisie libre (on teste la
   RECONNAISSANCE lexicale, pas l'orthographe — cf. issue #114) :
   - définition → mot (QCM 4 options) : « Une grosse pluie courte
     et soudaine. » → averse, parmi des mots du même champ ;
   - intrus (QCM 4 options) : « Quel mot n'appartient pas au thème
     "la mer" ? » → 3 mots du champ + 1 mot d'un autre champ ;
   - catégorisation en tuiles (`tuilesTri`) : ranger des mots
     FOURNIS dans deux thèmes — aucune orthographe à produire.

   Les deux QCM cohabitent dans une leçon (« Le mot juste »), le tri
   dans une leçon dédiée (runner d'écran `ui/lecon-tri.ts`). Toutes
   les définitions sont rédigées pour un CE2 et relues par l'agent
   pédagogue. Les mots sont stockés SANS article (tuiles homogènes) ;
   l'article éventuel vit dans la définition.
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { etayageRedige, MODE_QCM_CHECK } from '../_shared';
import type { LessonInput } from '../_shared';
import { choice, sample } from '../../core/utils';

export interface MotChamp {
	mot: string;
	def: string; // définition « enfant », précise et courte
	// Mot « transversal » : il peut raisonnablement appartenir à plusieurs champs
	// (relief, plante sauvage…). On le GARDE dans la banque et dans « définition →
	// mot » (distracteurs du même champ, aucune ambiguïté), mais on l'EXCLUT de
	// l'intrus et du tri, qui croisent deux champs (là, il serait injuste). On ne
	// retire jamais un mot de la banque : on le flague pour l'exercice concerné.
	ambigu?: boolean;
}
export interface Champ {
	id: string;
	nom: string; // libellé du thème, utilisé dans les consignes (« la météo »)
	mots: MotChamp[];
}

/* Banque par champ. Chaque champ a au moins 4 mots (nécessaire pour fabriquer
   un QCM « définition → mot » à 4 options avec des distracteurs du même thème),
   et au moins 3 mots NON ambigus (nécessaires à l'intrus et au tri). Un mot
   n'apparaît que dans un seul champ (testé) ; les mots qui pourraient relever de
   plusieurs thèmes sont marqués `ambigu` (exclus de l'intrus/tri seulement). */
export const CHAMPS: Champ[] = [
	{
		id: 'meteo',
		nom: 'la météo',
		mots: [
			{ mot: 'averse', def: 'Une grosse pluie courte et soudaine.' },
			{ mot: 'bruine', def: 'Une pluie très fine, presque comme du brouillard.' },
			{ mot: 'rafale', def: 'Un coup de vent brusque et fort.' },
			{ mot: 'éclaircie', def: 'Un moment où le soleil revient entre les nuages.' },
			{ mot: 'verglas', def: 'Une fine couche de glace qui rend le sol glissant.' },
			{ mot: 'grêle', def: 'Des petites billes de glace qui tombent du ciel.' },
			{ mot: 'brume', def: 'Un léger brouillard qui empêche de bien voir au loin.' },
		],
	},
	{
		id: 'corps',
		nom: 'le corps',
		mots: [
			{ mot: 'poignet', def: "L'articulation entre la main et le bras." },
			{ mot: 'cheville', def: "L'articulation entre le pied et la jambe." },
			{ mot: 'coude', def: "L'articulation au milieu du bras." },
			{ mot: 'paume', def: "L'intérieur de la main." },
			{ mot: 'talon', def: "L'arrière du pied." },
			{ mot: 'nuque', def: "L'arrière du cou." },
			{ mot: 'mollet', def: "La partie bombée à l'arrière de la jambe, sous le genou." },
		],
	},
	{
		id: 'cuisine',
		nom: 'la cuisine',
		mots: [
			{ mot: 'louche', def: 'Une grande cuillère pour servir la soupe.' },
			{ mot: 'passoire', def: "Un récipient troué pour égoutter l'eau." },
			{ mot: 'fouet', def: 'Un ustensile pour battre les œufs ou la crème.' },
			{ mot: 'râpe', def: 'Un outil pour réduire le fromage en petits morceaux.' },
			{ mot: 'tablier', def: "Un vêtement qu'on met pour ne pas se salir en cuisinant." },
			{ mot: 'marmite', def: 'Une grande casserole haute pour faire la soupe.' },
			{ mot: 'saladier', def: 'Un grand bol pour préparer la salade.' },
		],
	},
	{
		id: 'foret',
		nom: 'la forêt',
		mots: [
			{ mot: 'clairière', def: 'Un endroit sans arbres au milieu de la forêt.' },
			{ mot: 'sous-bois', def: 'Les buissons et les plantes qui poussent sous les grands arbres.' },
			{ mot: 'lisière', def: 'Le bord de la forêt.' },
			{ mot: 'écorce', def: 'La peau dure qui recouvre le tronc des arbres.' },
			{ mot: 'brindille', def: 'Une toute petite branche fine et cassante.' },
			{ mot: 'taillis', def: 'Un groupe de petits arbres serrés les uns contre les autres.' },
			// Plantes/végétaux qui poussent aussi au jardin ou en montagne → ambigus.
			{
				mot: 'fougère',
				def: 'Une plante à grandes feuilles découpées qui pousse à l’ombre.',
				ambigu: true,
			},
			{ mot: 'mousse', def: 'Un tapis vert et doux sur les troncs et les pierres.', ambigu: true },
			{ mot: 'ronce', def: 'Une plante sauvage qui pique, couverte d’épines.', ambigu: true },
		],
	},
	{
		id: 'mer',
		nom: 'la mer',
		mots: [
			{ mot: 'marée', def: 'Le mouvement de la mer qui monte puis descend.' },
			{ mot: 'écume', def: 'La mousse blanche au bord des vagues.' },
			{ mot: 'algue', def: "Une plante qui pousse dans l'eau de mer." },
			// Relief de roche/caillou que l'on trouve aussi en montagne → ambigus.
			{ mot: 'falaise', def: 'Une grande paroi de roche au bord de la mer.', ambigu: true },
			{ mot: 'galet', def: 'Un caillou rond et lisse de la plage.', ambigu: true },
			{ mot: 'dune', def: 'Une colline de sable au bord de la mer.' },
			{ mot: 'coquillage', def: "La coquille dure d'un petit animal de mer." },
		],
	},
	{
		id: 'ecole',
		nom: "l'école",
		mots: [
			{ mot: 'pupitre', def: "La petite table de l'élève." },
			{ mot: 'ardoise', def: 'Une plaque sur laquelle on écrit puis on efface.' },
			{ mot: 'estrade', def: 'La petite scène surélevée où se tient le maître.' },
			{ mot: 'préau', def: "L'endroit couvert de la cour pour s'abriter de la pluie." },
			{ mot: 'récréation', def: 'Le moment de pause pour jouer entre les classes.' },
			{ mot: 'encrier', def: "Le petit pot qui contenait l'encre autrefois." },
			{ mot: 'trousse', def: 'Le petit étui où on range ses crayons.' },
		],
	},
	{
		id: 'ville',
		nom: 'la ville',
		mots: [
			{ mot: 'trottoir', def: 'Le bord de la rue réservé aux piétons.' },
			{ mot: 'carrefour', def: 'Un endroit où plusieurs rues se croisent.' },
			{ mot: 'ruelle', def: 'Une petite rue étroite.' },
			{ mot: 'impasse', def: 'Une rue sans issue, fermée au bout.' },
			{ mot: 'façade', def: "Le devant d'un bâtiment." },
			{ mot: 'boulevard', def: 'Une grande et large avenue.' },
			{ mot: 'réverbère', def: 'Le grand lampadaire qui éclaire la rue.' },
		],
	},
	{
		id: 'emotions',
		nom: 'les émotions',
		// Émotions « secondaires », plus subtiles : on évite joie/peur/colère, déjà
		// connues dès la maternelle (elles n'enrichissent pas le lexique CE2).
		mots: [
			{ mot: 'honte', def: "Ce qu'on ressent après avoir fait une bêtise devant les autres." },
			{ mot: 'fierté', def: "Ce qu'on ressent quand on a réussi quelque chose de difficile." },
			{ mot: 'jalousie', def: "Ce qu'on ressent quand on voudrait avoir ce qu'a un autre." },
			{ mot: 'soulagement', def: 'Le bien-être qu’on ressent quand une inquiétude disparaît.' },
			{ mot: 'déception', def: 'La tristesse quand ce qu’on espérait n’arrive pas.' },
			{ mot: 'inquiétude', def: 'Ce qu’on ressent quand on se fait du souci.' },
			{ mot: 'émerveillement', def: 'Le grand étonnement devant quelque chose de très beau.' },
		],
	},
	{
		id: 'montagne',
		nom: 'la montagne',
		mots: [
			{ mot: 'sommet', def: "Le point le plus haut d'une montagne." },
			{ mot: 'pente', def: 'Un terrain incliné qui monte ou qui descend.' },
			{ mot: 'vallée', def: "L'espace bas situé entre deux montagnes." },
			{ mot: 'glacier', def: 'Une énorme masse de glace en haute montagne.' },
			// Cours d'eau que l'on associe aussi à la forêt → ambigu.
			{ mot: 'torrent', def: "Un cours d'eau rapide qui dévale la montagne.", ambigu: true },
			{ mot: 'refuge', def: 'Une petite maison pour abriter les randonneurs.' },
			{ mot: 'ravin', def: 'Un creux étroit et profond entre deux pentes.' },
		],
	},
	{
		id: 'jardin',
		nom: 'le jardin',
		mots: [
			{ mot: 'arrosoir', def: 'Un récipient à bec pour arroser les plantes.' },
			{ mot: 'brouette', def: 'Une petite caisse à une roue pour transporter la terre.' },
			{ mot: 'râteau', def: 'Un outil à dents pour ramasser les feuilles.' },
			{ mot: 'bêche', def: 'Un outil pour retourner la terre.' },
			{ mot: 'sécateur', def: 'Une sorte de gros ciseaux pour couper les branches.' },
			{ mot: 'potager', def: 'Le coin du jardin où poussent les légumes.' },
			{ mot: 'serre', def: 'Un abri vitré où on protège les plantes du froid.' },
		],
	},
];

/* Tous les mots de la banque, à plat (utilitaire / tests). */
export const TOUS_LES_MOTS: string[] = CHAMPS.flatMap((c) => c.mots.map((m) => m.mot));

/* Mots NON ambigus d'un champ : ceux qu'on peut opposer à un autre champ sans
   risque (intrus, tri). Les mots `ambigu` restent dans la banque et servent au
   QCM « définition → mot », mais pas aux formats qui croisent deux champs. */
export function motsNets(champ: Champ): MotChamp[] {
	return champ.mots.filter((m) => !m.ambigu);
}

/* ---------- Format QCM « Le mot juste » : définition → mot + intrus ----------
   Une seule leçon mono-mode QCM, qui alterne aléatoirement les deux formats
   pour varier l'entraînement (le runner QCM tire NB_QUESTIONS questions
   distinctes). Quatre options à chaque fois. */

const NB_CHOIX = 4;

/* Définition → mot : la bonne réponse et ses distracteurs viennent du MÊME champ
   (on teste la précision : distinguer « averse » de « bruine », « rafale »…). */
function genDefinition(): Exercise {
	const champ = choice(CHAMPS);
	const [cible, ...reste] = sample(champ.mots, NB_CHOIX);
	const distracteurs = reste.map((m) => m.mot);
	return {
		type: 'qcm',
		question: `${cible.def} : @`,
		answer: cible.mot,
		choices: sample([cible.mot, ...distracteurs], NB_CHOIX),
		explication: `« ${cible.mot} » appartient au thème « ${champ.nom} ».`,
	};
}

/* Intrus : 3 mots d'un champ + 1 mot d'un autre champ (l'intrus = la réponse).
   Tous tirés parmi les mots NON ambigus → l'intrus ne peut pas plausiblement
   appartenir au champ visé, ni l'inverse. */
function genIntrus(): Exercise {
	const [champ, autre] = sample(CHAMPS, 2);
	const membres = sample(motsNets(champ), NB_CHOIX - 1).map((m) => m.mot);
	const intrus = choice(motsNets(autre)).mot;
	return {
		type: 'qcm',
		question: `Quel mot n’appartient pas au thème « ${champ.nom} » ? : @`,
		answer: intrus,
		choices: sample([...membres, intrus], NB_CHOIX),
		explication: `« ${intrus} » n’est pas un mot du thème « ${champ.nom} », mais du thème « ${autre.nom} ».`,
	};
}

const MODE_QCM: ModeOption[] = [MODE_QCM_CHECK];

export function motJusteType(): ExerciseType {
	return {
		modes: MODE_QCM,
		generate(): Exercise {
			return choice([genDefinition, genIntrus])();
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

/* ---------- Format tuiles « Ranger par thème » (tuilesTri) ----------
   Deux champs tirés au sort, 3 mots de chacun, mélangés. L'enfant range chaque
   tuile dans le bon thème (aucune saisie). Runner d'écran : ui/lecon-tri.ts. */

const NB_PAR_THEME = 3;

const MODE_TRI: ModeOption[] = [
	{ id: 'tri', label: 'Je range chaque mot dans son thème', icon: 'cards', recommended: true },
];

export function triType(): ExerciseType {
	return {
		// Tri par thème (#114) : classé sans appeler generate() (#348), hors sprint.
		exerciseKind: 'tuilesTri',
		modes: MODE_TRI,
		generate(): Exercise {
			const [a, b] = sample(CHAMPS, 2);
			// Uniquement des mots non ambigus : chaque tuile appartient sans conteste
			// à un seul des deux thèmes affichés.
			const motsA = sample(motsNets(a), NB_PAR_THEME).map((m) => ({ mot: m.mot, cat: 0 as const }));
			const motsB = sample(motsNets(b), NB_PAR_THEME).map((m) => ({ mot: m.mot, cat: 1 as const }));
			return {
				type: 'tuilesTri',
				question: 'Range chaque mot dans le bon thème.',
				categories: [a.nom, b.nom],
				mots: sample([...motsA, ...motsB], NB_PAR_THEME * 2), // mélangé (ordre non révélateur)
			};
		},
		// Pas de réponse texte unique : corrigé tuile par tuile par le runner.
		check: () => false,
	};
}

/* ---------- Étayage de la notion (#490) ----------
   « Le mot juste » tire DEUX formes de question (définition → mot, et intrus) : son
   panneau leur consacre une étape chacune, sous la règle qui les réunit. « Ranger par
   thème » est un geste de tri, avec sa stratégie propre (placer d'abord ce dont on est
   sûr, ce qui réduit d'autant le champ des hésitations) : deux leçons, deux panneaux. */
const ETAYAGE_MOT_JUSTE = etayageRedige(
	'Trouver le mot juste',
	'Les mots qui parlent du même thème forment une famille de sens : un champ lexical.',
	[
		"Pour une définition, lis-la jusqu'au bout : chaque détail compte.",
		"Écarte les mots qui ne collent qu'à moitié.",
		"Pour l'intrus, cherche celui qui ne parle pas du même thème que les autres.",
	],
);

const ETAYAGE_TRI_THEME = etayageRedige(
	'Ranger les mots par thème',
	'Chaque mot va dans le thème dont il parle.',
	[
		'Lis les deux thèmes avant de déplacer un seul mot.',
		'Pour chaque mot, demande-toi de quoi il parle.',
		"Place d'abord ceux dont tu es sûr : les autres deviennent plus faciles.",
	],
);

export const CHAMPS_LESSONS: LessonInput[] = [
	{
		id: 'fr-vocab-champs-mots',
		label: 'Le mot juste',
		exerciseType: motJusteType(),
		etayage: [ETAYAGE_MOT_JUSTE],
	},
	{
		id: 'fr-vocab-champs-tri',
		label: 'Ranger par thème',
		exerciseType: triType(),
		etayage: [ETAYAGE_TRI_THEME],
	},
];
