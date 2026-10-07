/* ============================================================
   Grammaire — « Nomme les mots du groupe » (#731, CM1).
   ------------------------------------------------------------
   Seconde des deux leçons du groupe nominal. La première (#716) fait DÉLIMITER le
   groupe ; celle-ci, le groupe étant donné, fait NOMMER chacun de ses mots — le verbe
   « nommer » du programme CM1 (§5.1 : « Repérer des groupes nominaux dans une phrase
   simple et nommer les différents éléments qui les constituent »).

   ── Pourquoi une leçon de plus, et pas un mode de la précédente ──────────────
   Les leçons existantes vont toutes de l'ÉTIQUETTE vers le MOT : « clique sur le
   déterminant », « clique sur l'adjectif », « clique sur le nom noyau ». C'est une
   tâche de RECHERCHE, et elle se réussit par élimination — j'enlève le verbe, j'enlève
   le nom, il reste celui-là — sans avoir jamais eu à produire le mot « adjectif » à
   propos de ce mot-là. Ici la tâche va du MOT vers l'ÉTIQUETTE, et elle est EXHAUSTIVE :
   tous les mots du groupe reçoivent la leur, aucun ne peut être sauté. L'arc entre les
   deux leçons est porté par l'ordre pédagogique (`ORDRE_LECONS`), pas par un second mode.

   ── Le format : l'appariement, et AUCUN intrus ──────────────────────────────
   Le geste « associer chaque mot à son étiquette » a son widget maison (#407, mutualisé
   #466) : deux colonnes reliées par des traits. La colonne de gauche porte les mots du
   groupe, celle de droite les trois étiquettes. UNE PAIRE PAR MOT, jamais d'intrus :
   sur « la lune », l'enfant ne doit pas avoir à écarter une étiquette « adjectif » en
   trop — ce serait une tâche de tri, et le nombre d'emplacements lui soufflerait déjà
   combien de mots le groupe contient (critères 2 et 3 de #731).
   Le widget mélange sa colonne de gauche ; c'est accepté (arbitrage mainteneur) :
   l'ordre des mots reste lisible dans le groupe affiché au-dessus, donc le réflexe que
   le piège Dét + Adj + Nom vise à prendre en défaut s'exerce quand même.

   ── Ce que la donnée doit porter, et pourquoi ────────────────────────────────
   Fabriquer les paires suppose de savoir QUEL mot est le nom et quel mot est l'adjectif.
   « la lune » se déduit du seul nombre de mots ; « le petit chien » et « un manteau
   chaud » non. Un lexique d'adjectifs serait une liste finie, donc faillible, et
   trancherait à l'exécution ce que l'auteur sait déjà en écrivant l'item. C'est donc le
   PATRON (`PatronGN`) qui porte le rôle de chaque mot, par sa position :
   DN = Dét + Nom, DNA = Dét + Nom + Adj, DAN = Dét + Adj + Nom. Il est désormais retenu
   dans `PhraseClicMot` (#731, note d'implémentation de l'issue) au lieu d'être jeté après
   le contrôle de longueur de `gn()` — addition d'un champ, aucun changement de
   comportement pour #716, dont la banque est ici réutilisée EN LECTURE SEULE.

   Corollaire : les garde-fous ci-dessous refusent À LA CONSTRUCTION ce qu'un test ne
   verrait qu'après coup (groupe en double, deux déterminants, déterminant élidé, mot
   répété, patron qui ne colle pas au nombre de mots).

   ── Ce que la banque s'interdit (critères négatifs de #731) ──────────────────
   - jamais la FONCTION d'un mot (épithète, sujet, complément) : seulement sa NATURE ;
   - jamais « nom noyau » : dans un groupe de 2 ou 3 mots il n'y a qu'un nom, et
     « noyau » n'a de sens que face à des noms concurrents ;
   - jamais le nom d'un patron montré à l'enfant : « Dét + Adj + Nom » est un outil
     d'auteur pour borner la notion, pas un objectif d'élève ;
   - jamais un mot HORS du groupe (le verbe, un adverbe de la phrase) : l'énoncé ne
     montre que le groupe, pas la phrase dont #716 l'avait extrait ;
   - mêmes interdits de banque que #716 : pas de complément du nom prépositionnel, pas
     de groupe emboîté, jamais deux épithètes pour un même nom, jamais d'adverbe
     modifiant l'adjectif.
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { choice } from '../../core/utils';
import { etayageRedige, type LessonInput } from '../_shared';
import { DET_SETS, type PatronGN, type PhraseClicMot } from './grammaire-clic-mot-moteur';
import { MOTS_ATTENDUS, PHRASES_GN } from './grammaire-groupe-nominal';

/** Les trois classes de mots que le programme CM1 fait nommer dans un groupe nominal. */
export type ClasseGN = 'determinant' | 'nom' | 'adjectif';

/** Ce que l'enfant LIT sur l'étiquette. Les termes nus du programme, sans article : ce
    sont les mots que le maître écrit sous chaque mot au tableau, ils tiennent sur un
    bouton tactile, et les trois se distinguent d'un coup d'œil. Ni « nom noyau »
    (critère 10) ni un nom de fonction (critère 13) n'y a sa place. */
export const ETIQUETTES: Record<ClasseGN, string> = {
	determinant: 'déterminant',
	nom: 'nom',
	adjectif: 'adjectif',
};

/** Rôle de chaque position, patron par patron. C'est ici, et nulle part ailleurs, que se
    décide quel mot est le nom : la table est la traduction littérale des trois modèles du
    programme (§5.1). */
const ROLES: Record<PatronGN, ClasseGN[]> = {
	DN: ['determinant', 'nom'],
	DNA: ['determinant', 'nom', 'adjectif'],
	DAN: ['determinant', 'adjectif', 'nom'],
};

/** Un groupe nominal prêt à faire étiqueter : ses mots dans l'ORDRE DE LECTURE (c'est
    cet ordre qui, avec le patron, donne le rôle de chacun) et son patron. */
export interface GroupeNomme {
	mots: string[];
	patron: PatronGN;
}

const DETERMINANTS = new Set<string>([
	...DET_SETS.article,
	...DET_SETS.possessif,
	...DET_SETS.demonstratif,
]);

const estDeterminant = (t: string): boolean => DETERMINANTS.has(t.toLowerCase());
const estElide = (t: string): boolean => t.toLowerCase().startsWith("l'");

/* Le groupe n'ouvre plus une phrase : « Mes vieilles chaussures » extrait de « Mes
   vieilles chaussures craquent encore. » se lit « mes vieilles chaussures ». La casse de
   la phrase d'origine n'a pas à voyager jusqu'ici. */
const minusculeInitiale = (mot: string): string => mot.charAt(0).toLowerCase() + mot.slice(1);

/** Chaque mot du groupe avec sa classe, dans l'ordre de lecture. Source UNIQUE du rôle
    d'un mot : le générateur de paires et le libellé du groupe en dépendent tous les deux,
    et une seconde dérivation du rôle finirait par en contredire la première. */
export function constituants(g: GroupeNomme): Array<{ mot: string; classe: ClasseGN }> {
	return g.mots.map((mot, i) => ({ mot, classe: ROLES[g.patron][i] }));
}

/** Le groupe tel qu'il s'affiche dans l'énoncé (« un grand tableau »). */
export const libelleGroupe = (g: GroupeNomme): string => g.mots.join(' ');

/* Garde-fous COMMUNS aux deux sources de la banque (reprises de #716 et lot neuf) : ils
   s'appliquent à l'ensemble des mots, d'où qu'ils viennent. */
function verifierGroupe(mots: string[], patron: PatronGN, ou: string): void {
	const attendus = MOTS_ATTENDUS[patron];
	if (mots.length !== attendus) {
		throw new Error(
			`gn-nommer : ${ou} fait ${mots.length} mot(s), le patron ${patron} en attend ${attendus}.`,
		);
	}
	if (new Set(mots.map((m) => m.toLowerCase())).size !== mots.length) {
		throw new Error(
			`gn-nommer : ${ou} répète un mot — les deux colonnes du widget s'indexent par le ` +
				"TEXTE, un doublon y rendrait l'appariement ambigu.",
		);
	}
	const tete = mots[0];
	if (estElide(tete)) {
		throw new Error(
			`gn-nommer : déterminant élidé « ${tete} » dans ${ou} — le groupe ne se découpe plus ` +
				"en mots étiquetables (l'enfant ne peut pas nommer le déterminant à part).",
		);
	}
	if (!estDeterminant(tete)) {
		throw new Error(
			`gn-nommer : « ${tete} » n'ouvre pas un groupe nominal du programme CM1 (il faut un ` +
				`article, un possessif ou un démonstratif) dans ${ou}.`,
		);
	}
	// Un second déterminant signale soit un groupe emboîté (critère 11), soit — bien plus
	// probable — un patron mal déclaré : c'est la faute que le rôle-par-position rendrait
	// silencieuse, puisqu'elle produirait une étiquette fausse sans rien casser.
	const autres = mots.slice(1).filter(estDeterminant);
	if (autres.length) {
		throw new Error(
			`gn-nommer : ${ou} contient un second déterminant (« ${autres.join(', ')} ») — groupe ` +
				'emboîté, ou patron mal déclaré.',
		);
	}
}

/** Construit un groupe du LOT NEUF, écrit tel qu'il se lit (« ce grand jardin »). */
export function gnMots(groupe: string, patron: PatronGN): GroupeNomme {
	const mots = groupe.trim().split(/\s+/).filter(Boolean);
	verifierGroupe(mots, patron, `« ${groupe} »`);
	return { mots, patron };
}

/** Extrait le groupe d'une phrase de « Repère le groupe nominal » (#716). Lecture SEULE :
    rien n'est écrit dans `PHRASES_GN`, et une phrase sans patron (donc hors banque du
    groupe nominal) est refusée au lieu d'être devinée. */
export function gnDepuisPhrase(p: PhraseClicMot): GroupeNomme {
	const mots = p.cibleIndices.map((i) => p.tokens[i]);
	const ou = `« ${mots.join(' ')} »`;
	if (!p.patron) {
		throw new Error(
			`gn-nommer : ${ou} vient d'une phrase sans patron — impossible de dire lequel de ses ` +
				"mots est le nom et lequel est l'adjectif.",
		);
	}
	const lus = [minusculeInitiale(mots[0]), ...mots.slice(1)];
	verifierGroupe(lus, p.patron, ou);
	return { mots: lus, patron: p.patron };
}

/* Identité d'un groupe : ses mots, en minuscules. Deux phrases de #716 ciblent le même
   groupe (« les oiseaux ») ; ici elles ne feraient qu'un seul et même item, tiré deux
   fois plus souvent que les autres. */
const cle = (g: GroupeNomme): string => g.mots.map((m) => m.toLowerCase()).join(' ');

/* Assemble la banque en refusant les doublons. Le garde-fou n'est pas cosmétique : un
   groupe du lot neuf qui redirait un groupe de #716 fausserait à la fois le tirage et la
   lecture de la composition (« ce que l'enfant retrouve » contre « ce qui est neuf »). */
function assembler(reprises: GroupeNomme[], neufs: GroupeNomme[]): GroupeNomme[] {
	const out: GroupeNomme[] = [];
	const vus = new Set<string>();
	for (const [rang, lot] of [reprises, neufs].entries()) {
		for (const g of lot) {
			const k = cle(g);
			if (vus.has(k)) {
				if (rang > 0) {
					throw new Error(
						`gn-nommer : « ${libelleGroupe(g)} » est déjà dans la banque — un groupe neuf qui ` +
							'redit une reprise de #716 sortirait deux fois plus souvent.',
					);
				}
				continue; // deux phrases de #716 pour un même groupe : un seul item
			}
			vus.add(k);
			out.push(g);
		}
	}
	return out;
}

/* ---------- Les REPRISES : la banque de #716, en lecture seule ----------
   Reprise INTÉGRALE plutôt qu'une sélection : curater reviendrait à décider à la main
   quels groupes « méritent » de revenir, alors que ce qui compte pédagogiquement est que
   l'enfant RETROUVE ce qu'il vient de délimiter. 48 groupes distincts (49 phrases, dont
   deux visent « les oiseaux »), déjà relus au CE2-CM1 et déjà porteurs des trois
   sous-catégories de déterminant. */
export const GROUPES_REPRIS: GroupeNomme[] = PHRASES_GN.map(gnDepuisPhrase);

/* ---------- Le LOT NEUF ----------
   Il porte ce que la banque de #716 ne pouvait pas porter, parce qu'elle avait un autre
   but : le PIÈGE Dét + Adj + Nom en nombre, et des déterminants possessifs et
   démonstratifs en tête de ce piège.

   Pourquoi ce patron-là plutôt qu'un autre : c'est là que l'erreur se produit. L'enfant
   qui a retenu « le petit mot, puis le nom » étiquette comme nom le mot qui SUIT le
   déterminant — « grand » dans « un grand tableau ». Les deux autres patrons ne mettent
   jamais ce réflexe en défaut. Le rapport retenu (au moins autant de Dét + Adj + Nom que
   de Dét + Nom + Adj) vient du cadrage de #731 ; le `pedagogue-primaire` a dit
   « sur-échantillonner » sans fixer de proportion, et la réserve est écrite dans l'issue.

   Interdits tenus item par item, comme en #716 : aucune préposition (pas de complément
   du nom), jamais deux adjectifs pour un nom, jamais d'adverbe devant l'adjectif, jamais
   de déterminant élidé. Et aucun adjectif qui pourrait se lire comme un nom à cette
   place, ni l'inverse. */
const LOT_NEUF: GroupeNomme[] = [
	/* --- Dét + Adj + Nom : le piège, sur-échantillonné (18 items) --- */
	gnMots('ce grand jardin', 'DAN'),
	gnMots('cette petite maison', 'DAN'),
	gnMots('ces jeunes chatons', 'DAN'),
	gnMots('cet énorme camion', 'DAN'),
	gnMots('cette grosse valise', 'DAN'),
	gnMots('mon vieux cartable', 'DAN'),
	gnMots('ma nouvelle trousse', 'DAN'),
	gnMots('mes petites cousines', 'DAN'),
	gnMots('ses longues oreilles', 'DAN'),
	gnMots('ton joli dessin', 'DAN'),
	gnMots('notre vieille voiture', 'DAN'),
	gnMots('un gros nuage', 'DAN'),
	gnMots('une grande cour', 'DAN'),
	gnMots('une petite cuillère', 'DAN'),
	gnMots('un long couloir', 'DAN'),
	gnMots('le jeune facteur', 'DAN'),
	gnMots('le nouvel élève', 'DAN'),
	gnMots('les grands arbres', 'DAN'),

	/* --- Dét + Nom + Adj (6 items) --- */
	gnMots('un ballon rouge', 'DNA'),
	gnMots('ma chambre propre', 'DNA'),
	gnMots('ce livre neuf', 'DNA'),
	gnMots('des chaussettes sales', 'DNA'),
	gnMots('son écharpe douce', 'DNA'),
	gnMots('une route humide', 'DNA'),

	/* --- Dét + Nom (6 items) --- */
	gnMots('cette montagne', 'DN'),
	gnMots('ces cailloux', 'DN'),
	gnMots('nos voisins', 'DN'),
	gnMots('votre jardin', 'DN'),
	gnMots('un escalier', 'DN'),
	gnMots('les ciseaux', 'DN'),
];

/** La banque servie : les 48 groupes de #716 puis les 30 groupes neufs. */
export const GROUPES_GN_NOMMER: GroupeNomme[] = assembler(GROUPES_REPRIS, LOT_NEUF);

/* ---------- Énoncé, consigne, mode ---------- */

/* L'énoncé MONTRE le groupe entier, déjà délimité : c'est la moitié de la tâche que #716
   a déjà fait travailler, et la retirer ici reviendrait à redemander la frontière en même
   temps que les classes. Il ne montre PAS la phrase d'origine : l'enfant n'a aucun mot à
   étiqueter hors du groupe (critère 12), et un mot répété dans la phrase rendrait le
   groupe montré ambigu.

   La question énumère les trois réponses possibles, et c'est ce qui la rend lisible. Deux
   tournures plus courtes ont été écartées, chacune pour sa raison :
   - « à ce qu'il est » est FLOTTANT pour un enfant de cet âge (constat
     redacteur-contenu-francais) : il peut l'entendre comme « un mot », « masculin », « un
     petit mot ». Rien n'y dit qu'on parle de la classe grammaticale ;
   - « à sa nature » est le mot du programme, mais il est PRÉMATURÉ (avis
     pedagogue-primaire, `docs/reference/programmes/cm1-francais.md`) : le CM1 s'y
     « familiarise » seulement, et l'application ne l'introduit à l'enfant nulle part. Une
     consigne qui l'emploierait bloquerait sur elle-même, pas sur la notion.
   La forme retenue reprend celle qui tourne déjà dans `classes-mots.ts` (« Est-ce un nom,
   un verbe ou un adjectif ? ») : les réponses sont dans la question, donc rien à deviner. */
export const enonceGnNommer = (g: GroupeNomme): string =>
	`Relie chaque mot du groupe « ${libelleGroupe(g)} » : est-ce un déterminant, un nom ou un adjectif ?`;

/* Consigne de FICHE (#42) : elle décrit le geste et énumère les trois étiquettes possibles
   — qui sont à l'écran de toute façon. Ce qu'elle ne fait jamais : nommer UNE classe à
   chercher (« trouve l'adjectif »), ce qui serait la tâche inverse, déjà couverte par
   « Clique sur l'adjectif » et « Clique sur le nom noyau » (critère 1 de #731). */
export const CONSIGNE_GN_NOMMER =
	'Relie chaque mot du groupe : est-ce un déterminant, un nom ou un adjectif ?';

/* Mode unique (pas d'écran de choix), mais d'id PROPRE : le geste est bien celui de
   l'appariement, seulement l'id de mode est la MAILLE de `tests/couverture-e2e-gate.test.ts`.
   Servir celui de « Familles de mots à relier » (`relier`) ferait réputer cette leçon
   couverte par la spec d'une leçon de vocabulaire, et aucune spec ne serait réclamée pour
   celle-ci. Même raisonnement qu'au mode `segment` de #716. */
export const MODE_NOMMER: ModeOption[] = [
	{ id: 'nommer', label: 'Nomme chaque mot', recommended: true },
];

/** Une manche : un groupe, une paire par mot, AUCUN intrus (critère 3). L'ordre des paires
    suit la lecture du groupe ; c'est le widget qui mélange ses colonnes.

    `colonneDroite: 'etiquettes'` ne change rien à la correction : il dit au runner — et à
    la révision, qui monte le même widget — que la colonne de droite porte des étiquettes
    et non des mots, pour que la bulle d'aide décrive le geste réel (« touche l'étiquette
    de ce mot ») au lieu de celui de « Familles de mots à relier ». */
export function mancheGnNommer(g: GroupeNomme): Exercise {
	return {
		type: 'appariement',
		question: enonceGnNommer(g),
		paires: constituants(g).map(({ mot, classe }) => ({
			gauche: mot,
			droite: ETIQUETTES[classe],
		})),
		colonneDroite: 'etiquettes',
	};
}

/* Fabrique de la leçon. `exerciseKind: 'appariement'` la classe comme format à runner
   dédié (ui/lecon-appariement.ts, hors sprint) ; la correction se fait lien par lien dans
   ce runner — qui journalise aussi l'erreur pour l'espace encadrant (#391) —, donc `check`
   renvoie toujours false, comme pour les autres formats à widget. */
export function gnNommerType(banque: GroupeNomme[]): ExerciseType {
	return {
		modes: MODE_NOMMER,
		consigne: CONSIGNE_GN_NOMMER,
		exerciseKind: 'appariement',
		levels: ['cm1'],
		generate(): Exercise {
			return mancheGnNommer(choice(banque));
		},
		check: () => false,
	};
}

/* ---------- Étayage de la notion (#490) ----------
   Ce qui manque à l'enfant bloqué n'est pas la définition d'un adjectif : c'est l'ORDRE
   dans lequel attaquer un groupe. Les trois pas sont donc une méthode de LECTURE du
   groupe, du mot le plus sûr (le déterminant, qui l'ouvre toujours) au plus mobile
   (l'adjectif, qui se place des deux côtés du nom).

   Deux choses que le panneau refuse de faire :
   - donner un exemple de groupe. La banque est fermée et énumérable : un groupe cité
     serait le corrigé de tous ses tirages futurs, pas seulement du prochain.
   - dire « l'adjectif est après le nom ». C'est faux une fois sur deux ici, et c'est
     précisément le réflexe que la leçon veut défaire — le panneau le renforcerait. */
/* Deux corrections de fond sur ce panneau, toutes deux venues de la relecture, et qui
   méritent d'être lues avant d'y toucher :

   1. L'idée-force disait « chaque mot a son RÔLE ». Or « rôle » est exactement ce que la
      leçon s'interdit : un enfant l'entend comme la FONCTION (sujet, épithète), que le
      critère 13 proscrit ici. Et « nature », son remplaçant naturel, est prématuré au CM1
      (cf. le commentaire de l'énoncé). On nomme donc les trois classes sans jamais nommer
      la catégorie qui les réunit.
   2. L'étape 3 ouvrait sur « s'il reste un mot », c'est-à-dire par ÉLIMINATION — la façon
      même de réussir que l'en-tête de ce fichier reproche aux leçons sœurs. Le critère
      positif passe donc devant, et l'élimination derrière, comme filet. Un enfant qui
      hésite sur le nom placerait sinon l'adjectif « par reste », et l'erreur se
      propagerait sans aucun signal (avis pedagogue-primaire).

   L'impératif à chaque étape aligne ce panneau sur celui de #716, au lieu d'alterner
   déclaratif et impératif. */
const ETAYAGE_GN_NOMMER = etayageRedige(
	'Comment nommer les mots du groupe ?',
	'Dans un groupe nominal, il y a toujours un déterminant et un nom, et parfois un adjectif.',
	[
		"Trouve le déterminant : c'est toujours lui qui ouvre le groupe.",
		'Cherche de qui ou de quoi on parle : ce mot-là est le nom.',
		"Repère le mot qui dit comment est le nom : c'est l'adjectif, placé avant ou après le nom.",
	],
	'cm1',
);

export const GN_NOMMER_LESSONS: LessonInput[] = [
	{
		id: 'fr-gram-gn-nommer',
		label: 'Nomme les mots du groupe',
		/* Mots-clés ABSENTS du libellé affiché (règle #718) : des mots-clés qui le recopient
		   ne rendent rien trouvable de plus qu'une recherche sur le titre. Ce sont les
		   étiquettes elles-mêmes que l'enfant tapera (« adjectif », « déterminant »), et le
		   sigle qu'il emploie à l'oral (« GN »). */
		motsCles: ['déterminant', 'adjectif', 'nature des mots', 'GN', 'quel mot est un nom'],
		exerciseType: gnNommerType(GROUPES_GN_NOMMER),
		etayage: [ETAYAGE_GN_NOMMER],
	},
];
