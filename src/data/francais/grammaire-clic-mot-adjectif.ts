/* ============================================================
   Grammaire — « Clique sur l'adjectif » au CM1 : épithète ou attribut (#528).
   ------------------------------------------------------------
   Module PROPRE à cette leçon, sur le modèle de `grammaire-clic-mot-verbe.ts`. Des six
   natures du CM1, l'adjectif est la seule à porter une fabrique à garde-fous
   (`adj`, `adjPaire`), des dérivations d'explication et un lexique d'interdits : près de
   quatre cents lignes, soit à elle seule la moitié de `grammaire-clic-mot-cm1.ts`. Les
   cinq autres natures y restent, leur fabrique tenant en dix lignes chacune.

   CE QUI EST DESCENDU DU MOTEUR AVEC ELLE : `FonctionAdj` et `VERBES_ETAT_FORMES`. Le
   moteur déclare porter le « vocabulaire grammatical PARTAGÉ entre classes », c'est-à-dire
   ce que DEUX banques lisent (`DET_SETS`, `PRON_*`, `ADJ_INTERDITS`, `radicalAdj`). Ces
   deux-là n'ont jamais servi qu'au CM1 : les y laisser affaiblissait une règle qui n'est
   utile que tant qu'elle reste vraie. `ADJ_INTERDITS` et `radicalAdj` restent là-bas, la
   banque CE2 les lit aussi.

   LA BANQUE CE2 DE L'ADJECTIF N'EST PAS ICI, et ce n'est pas un oubli : elle vit dans
   `grammaire-clic-mot-ce2.ts` avec les trois autres natures de sa classe. Les réunir ici
   se défend (c'est une même leçon de catalogue, servie à deux niveaux), mais le critère 14
   de #528 est GELÉ et dit « aucun diff dans `ADJ_CE2_ITEMS` ni `PHRASES_ADJ_CE2 » — un
   déplacement en est un. À rouvrir par un commentaire daté sur l'issue, pas en passant.
   ------------------------------------------------------------
   Au CE2, l'adjectif est une NATURE à reconnaître (« Clique sur l'adjectif »). Le CM1
   ajoute deux attendus que le CE2 n'a pas (programme §5.1) : « distinguer les notions de
   nature et de fonction » et « aborder la notion d'épithète ». La tâche change donc elle
   aussi : ce n'est plus « trouve l'adjectif » mais « trouve CELUI des deux adjectifs qui
   remplit la fonction demandée » — consigne et `cibleLabel` PAR ITEM, sur le patron déjà
   appliqué au déterminant (`det`) et au pronom (`pron`).

   POURQUOI NOMMER L'ATTRIBUT un an avant que les repères de progressivité ne le demandent
   (décision du mainteneur, 2026-10-08, après second avis du pédagogue) : une fonction ne
   s'aborde pas sans son contraire. Sans attribut en face, « épithète » ne désigne rien de
   plus que « adjectif », et la consigne CM1 redeviendrait unique — ce que la leçon CE2
   fait déjà. La banque CE2 contient d'ailleurs déjà des attributs, servis sous le seul nom
   d'« adjectif » : le CM1 ne fait que rendre explicite une distinction que l'enfant
   rencontre déjà. L'appli entraîne, elle n'évalue pas.

   STRUCTURE DE LA BANQUE : une phrase = DEUX items (un épithète, un attribut), chacun
   distracteur de l'autre. Aucune phrase à adjectif unique, pas même une : sans second
   adjectif, l'enfant clique le seul mot plausible et réussit sans lire la consigne.

   INTERDITS D'AMBIGUÏTÉ (avis `pedagogue-primaire`), qui s'ajoutent à ceux du CE2 :
   - attribut du COD hors banque (collège, et il se confond avec l'épithète) ;
   - verbes d'état employés : être, sembler, paraître, rester, devenir — `demeurer`
     écarté, et `paraître` seulement là où rien ne l'approche d'« apparaître » ;
   - emplois de « être » exclus comme introducteur : auxiliaire, locatif (« il est dans
     le jardin »), attribut NOMINAL (« il est médecin ») ; de même « rester » locatif ;
   - épithètes antéposées ET postposées, dans un groupe sujet comme dans un groupe
     complément, pour que l'enfant ne construise pas « épithète = début de phrase » ;
   - écartées : l'épithète détachée (apposition, débattue), l'adjectif séparé du nom par
     un complément du nom (rattachement ambigu), les adjectifs coordonnés portant sur
     plusieurs noms ;
   - lexique exclu en plus des participes passés du moteur : adjectifs verbaux en -ant,
     couleurs issues de noms (rose, marron, orange), adjectifs substantivés ou employés
     comme adverbes, comparatifs, mots à classe débattue (ordinaux, seul, autre, même,
     tout), « il fait chaud / beau ».

   POSITION NEUTRALISÉE : le dernier mot de la phrase est un épithète dans dix phrases et
   un attribut dans dix autres. « Clique sur le dernier mot » ne départage donc rien, et
   « l'adjectif collé au verbe » non plus — quatre phrases glissent un adverbe entre le
   verbe d'état et son attribut.

   SUJET EN TÊTE DE PHRASE, sans exception : l'explication d'un attribut NOMME le sujet et
   son verbe d'état (cf. `sujetDuVerbeEtat`), et elle les dérive de la phrase plutôt que de
   les faire déclarer à l'appel. La dérivation lit le groupe sujet comme « tout ce qui
   précède le verbe d'état » : un complément placé en tête (« Pendant la nuit, le couloir
   devient sombre ») lui ferait nommer n'importe quoi, donc elle le REFUSE à la
   construction — comme elle refuse un groupe qui n'est pas un groupe nominal simple
   (« Le chien aboie et semble content » : coordination, négation, clitique). C'est aussi
   pourquoi l'explication nomme le GROUPE sujet (« le petit chien ») et non son seul nom
   noyau : entre Dét + Adj + Nom et Dét + Nom + Adj, rien ne départage les deux lectures
   sans lexique d'adjectifs, et dix-neuf des trente phrases sont dans ce cas.

   CE QUE LA DÉRIVATION NE GARANTIT PAS, écrit ici pour ne pas être redécouvert : elle
   couvre les phrases à SUJET SIMPLE, et elle ne protège pas d'un SECOND ADJECTIF
   ANTÉPOSÉ. « Un vieux petit chien » lui fait nommer le nom « petit », qui est un
   adjectif — aucun des repères positionnels ne peut le voir, et le départager réclamerait
   le lexique d'adjectifs que ce module refuse de maintenir partout ailleurs. Les trente
   phrases n'empilent jamais deux épithètes antéposées (une par phrase, l'autre adjectif
   étant l'attribut), mais ce n'est pas le garde-fou qui l'interdit : c'est la forme de la
   banque. Une phrase future qui en aurait besoin devra DÉCLARER son nom à l'appel.

   TEST DE SUPPRESSION VALIDE SUR TOUTE LA BANQUE : effacer l'adjectif laisse la phrase
   debout s'il est épithète, et la casse s'il est attribut. C'est la manipulation de
   l'étayage CM1 (cf. `grammaire-clic-mot.ts`), et elle a dicté le choix du verbe d'état
   phrase par phrase : « être » et « rester » suivis d'un groupe prépositionnel se
   relisent en LOCATIF une fois l'attribut effacé (« Le jardin reste humide sous ces
   arbres » → « Le jardin reste sous ces arbres », qui tient debout). Ces deux verbes
   n'introduisent donc un attribut que là où il FERME la phrase.
   ============================================================ */
import {
	ADJ_INTERDITS,
	DET_TOUS,
	PRON_SUJET,
	estPonctuation,
	phraseMots,
	radicalAdj,
	type PhraseClicMot,
} from './grammaire-clic-mot-moteur';

/** Les deux fonctions de l'adjectif demandées au CM1 (#528) : « aborder la notion
    d'épithète » suppose son contraire, sans quoi « épithète » ne désignerait rien de plus
    que « adjectif ». L'attribut du COD reste hors périmètre (collège). */
export type FonctionAdj = 'epithete' | 'attribut';

/* Verbes d'ÉTAT qui introduisent un attribut du sujet, par FORME. Liste bornée aux verbes
   et aux temps retenus par le `pedagogue-primaire` pour #528 : être, sembler, paraître,
   rester, devenir — `demeurer` écarté (rare à l'oral d'un CM1), de même que la locution
   « avoir l'air » (deux mots, et « l'air » reste un nom par ailleurs). Sert aux garde-fous
   de CONSTRUCTION de la banque : un adjectif déclaré attribut sans verbe d'état devant lui
   est mal étiqueté, et enseignerait la confusion que la leçon veut lever. */
export const VERBES_ETAT_FORMES = new Set(
	(
		'suis es est sommes êtes sont étais était étions étiez étaient ' +
		'serai seras sera serons serez seront serait seraient soit soient ' +
		'semble sembles semblons semblez semblent semblait semblaient semblera sembleront ' +
		'parais paraît parait paraissons paraissez paraissent paraissait paraissaient ' +
		'paraîtra paraîtront ' +
		'reste restes restons restez restent restait restaient restera resteront ' +
		'deviens devient devenons devenez deviennent devenais devenait devenaient ' +
		'deviendra deviendront'
	).split(' '),
);

const ADJ_LABEL: Record<FonctionAdj, string> = {
	epithete: "l'adjectif épithète",
	attribut: "l'adjectif attribut",
};
const ADJ_CONSIGNE: Record<FonctionAdj, string> = {
	epithete: "Clique sur l'adjectif épithète de la phrase.",
	attribut: "Clique sur l'adjectif attribut de la phrase.",
};
/* Les deux explications NOMMENT leur référent, elles ne le désignent pas en creux.
   « « étroit » fait partie du groupe du nom » laissait l'enfant chercher DE QUEL nom :
   sur les dix phrases qui portent deux noms, celui qui s'est trompé n'apprenait pas où
   regarder. Même défaut côté attribut, où ni le sujet ni le verbe d'état n'étaient dits,
   alors que ce sont exactement les deux mots à repérer pour trancher la fonction.

   Les trois référents sont DÉRIVÉS de la phrase (cf. `nomAccompagne` / `sujetDuVerbeEtat`
   plus bas), jamais déclarés à l'appel : `adj()` les localise déjà pour ses garde-fous
   (un épithète suit un déterminant ou un nom déterminé ; un attribut suit un verbe
   d'état). CONTREPARTIE, et elle n'est pas négociable : dès que la dérivation ne peut
   pas désigner le mot sans ambiguïté, `adj()` LÈVE. Une explication qui nomme le mauvais
   nom est pire que l'explication vague d'avant — elle enseigne une fausseté. */
function explicationEpithete(mot: string, nom: string): string {
	return `« ${mot} » accompagne le nom « ${nom} » : c'est un adjectif épithète.`;
}
function explicationAttribut(mot: string, sujet: string, verbe: string): string {
	return (
		`« ${mot} » est relié au sujet « ${sujet} » par le verbe d'état « ${verbe} » : ` +
		`c'est un adjectif attribut.`
	);
}

/* Formes refusées EN PLUS des interdits partagés du moteur (participes passés,
   nationalités). Elles ne sont pas fausses en grammaire : leur CLASSE se discute, ou leur
   forme porte déjà une autre notion — et un item dont la difficulté vient de là
   n'entraîne plus la FONCTION, seul objet de cette leçon. */
const ADJ_CM1_INTERDITS = new Set([
	// Couleurs issues de noms : classe et accord débattus.
	'rose',
	'roses',
	'marron',
	'marrons',
	'orange',
	'oranges',
	// Comparatifs : la forme porte déjà une autre notion.
	'meilleur',
	'meilleure',
	'meilleurs',
	'meilleures',
	'pire',
	'pires',
	// Classe débattue (déterminants pour les uns, adjectifs pour les autres) et ordinaux.
	'seul',
	'seule',
	'seuls',
	'seules',
	'autre',
	'autres',
	'même',
	'mêmes',
	'tout',
	'toute',
	'tous',
	'toutes',
	'premier',
	'première',
	'deuxième',
	'dernier',
	'dernière',
]);

/* Un adjectif verbal en -ant (« souriant », « méchant ») se confond avec le participe
   présent : même exclusion que les participes passés, mais par la FORME, la liste étant
   sans fin. Appliquée à la seule CIBLE — « pendant », « devant » et « maintenant » sont
   des mots-outils parfaitement admissibles dans la phrase. */
function estAdjectifVerbal(mot: string): boolean {
	return /ants?$|antes?$/u.test(mot.toLowerCase());
}

/* ---------- Dérivation des référents nommés par l'explication (#528) ----------
   Ce que ces deux fonctions renvoient part dans une phrase lue par l'enfant : elles
   refusent donc tout ce qu'elles ne savent pas lire, au lieu de rendre un à-peu-près. */

/* Mots-outils, à deux emplois. (1) Ils ne peuvent pas être le NOM d'un groupe nominal :
   sans cette liste, « Le très grand chien » ferait dériver le nom « très » — l'adjectif
   « grand » n'y suit pas un déterminant, mais le déterminant est bien deux rangs devant,
   et la lecture « épithète postposée » devient fausse sans que rien ne la contredise.
   (2) Ce sont les SEULS mots qu'on tolère entre un verbe d'état et son attribut
   (« semble très content ») : la tolérance était d'abord écrite « un mot quelconque », ce
   qui laissait passer « Elle devient reine heureuse » — « heureuse » y est épithète de
   « reine », et l'item aurait enseigné l'inverse de ce que la leçon veut lever. */
const ADJ_MOTS_OUTILS = new Set([
	'très',
	'plus',
	'moins',
	'assez',
	'trop',
	'si',
	'bien',
	'peu',
	'fort',
	'encore',
	'toujours',
	'jamais',
	'vraiment',
	'déjà',
	'aussi',
	'presque',
	'plutôt',
	'ne',
	'pas',
	'tout',
	'toute',
	'tous',
	'toutes',
]);

/* Mots qui ne peuvent PAS appartenir à un groupe SUJET simple ailleurs qu'en tête :
   la coordination (« et »), la négation (« ne », « n' ») et les pronoms clitiques, qui se
   glissent justement entre le sujet et son verbe. Sans eux, « Le chien aboie et semble
   content » faisait dériver le sujet « le chien aboie et » — le groupe s'ouvre bien sur un
   déterminant, et rien d'autre ne le contredisait.
   Collatéral ASSUMÉ : un déterminant répété à l'intérieur du groupe (« la maison de la
   forêt », complément du nom) est refusé lui aussi. Le complément du nom est déjà hors
   périmètre de la leçon (rattachement ambigu de l'adjectif, cf. l'en-tête de section). */
const ADJ_HORS_GROUPE_SUJET = new Set([
	'et',
	'ne',
	"n'",
	'me',
	"m'",
	'te',
	"t'",
	'se',
	"s'",
	'le',
	'la',
	'les',
	'lui',
	'leur',
	'y',
	'en',
]);

/* Un token peut-il être le NOM d'un groupe nominal ? Garde PERMISSIF par construction
   (on ne dispose d'aucun lexique de noms), donc volontairement fermé sur ce qu'on sait
   être autre chose : ponctuation, déterminant, verbe d'état, mot-outil. */
function peutEtreNom(mot: string): boolean {
	const b = mot.toLowerCase();
	if (!b || estPonctuation(b)) return false;
	return !DET_TOUS.has(b) && !VERBES_ETAT_FORMES.has(b) && !ADJ_MOTS_OUTILS.has(b);
}

/** Le NOM qu'un épithète accompagne. Deux positions, déjà départagées par le garde-fou
    de `adj()` : antéposé (« le petit chien », l'adjectif suit son déterminant → le nom
    est juste après) ou postposé (« un chemin étroit », le nom est juste avant et porte
    lui-même le déterminant). Lève si le mot dérivé ne peut pas être un nom.

    CE QU'IL RESTE HORS DE PORTÉE, et ça ne se rattrapera pas ici : DEUX adjectifs
    antéposés d'affilée. « Un vieux petit chien » fait dériver le nom « petit », qui est
    un adjectif — `peutEtreNom` ne peut pas le savoir, faute de lexique d'adjectifs, et
    c'est précisément la liste finie qu'on refuse de maintenir ailleurs dans ce module.
    La banque n'empile jamais deux épithètes antéposées (chaque phrase porte un épithète
    et un attribut), mais rien ne l'INTERDIT : si le cas devient nécessaire, il faudra
    déclarer le nom à l'appel plutôt que le dériver. Écrit ici pour que la garantie
    annoncée reste celle que le code tient. */
function nomAccompagne(texte: string, cible: string, tokens: string[], i: number): string {
	const antepose = DET_TOUS.has((tokens[i - 1] ?? '').toLowerCase());
	const nom = tokens[antepose ? i + 1 : i - 1] ?? '';
	if (!peutEtreNom(nom)) {
		throw new Error(
			`grammaire-clic-mot (adjectif CM1) : impossible de nommer le nom accompagné par ` +
				`« ${cible} » dans « ${texte} » (candidat : « ${nom || '—'} ») — l'explication ` +
				`désignerait un mot au hasard.`,
		);
	}
	return nom;
}

/** Le GROUPE SUJET relié à un attribut : tout ce qui précède le verbe d'état.
    Le groupe ENTIER, et non son seul nom noyau : dans « Le petit chien semble content »,
    le nom se déduirait du patron Dét + Adj + Nom ou Dét + Nom + Adj — deux lectures que
    rien ne départage sans lexique d'adjectifs, et c'est le cas de dix-neuf des trente
    phrases de la banque. Nommer le groupe est à la fois exact (le sujet EST le groupe)
    et dérivable sans deviner.
    Lève si la phrase ne commence pas par son sujet (complément en tête, détaché par une
    virgule), si le groupe est vide, s'il ne s'ouvre pas sur un déterminant, un pronom
    sujet ou un article élidé — un nom propre y perdrait sa majuscule —, ou s'il contient
    autre chose qu'un groupe nominal simple : un second verbe d'état, une coordination,
    une négation, un clitique (`ADJ_HORS_GROUPE_SUJET`). « Le chien aboie et semble
    content » tombe sur ce dernier cas : sans lui, le sujet nommé aurait été « le chien
    aboie et ». */
function sujetDuVerbeEtat(texte: string, tokens: string[], vi: number): string {
	const groupe = tokens.slice(0, vi);
	const premier = (groupe[0] ?? '').toLowerCase();
	const ouvreUnSujet = DET_TOUS.has(premier) || PRON_SUJET.has(premier) || premier.startsWith("l'");
	// Le premier token est déjà contraint par `ouvreUnSujet` : c'est à partir du second
	// qu'un « le » est forcément un clitique et plus un déterminant de tête.
	const coupe = groupe.some((t, k) => {
		if (estPonctuation(t)) return true;
		if (k === 0) return false;
		const b = t.toLowerCase();
		return VERBES_ETAT_FORMES.has(b) || ADJ_HORS_GROUPE_SUJET.has(b);
	});
	if (!groupe.length || !ouvreUnSujet || coupe) {
		throw new Error(
			`grammaire-clic-mot (adjectif CM1) : impossible de nommer le sujet du verbe d'état ` +
				`dans « ${texte} » (groupe lu : « ${groupe.join(' ') || '—'} ») — le sujet doit ` +
				`ouvrir la phrase, commencer par un déterminant ou un pronom, et ne contenir ` +
				`qu'un groupe nominal simple.`,
		);
	}
	// Minuscule initiale : le groupe est CITÉ au fil d'une phrase, pas en tête de la sienne.
	const texteSujet = groupe.join(' ');
	return texteSujet.charAt(0).toLowerCase() + texteSujet.slice(1);
}

/** Construit UN item « adjectif » du CM1, et REFUSE à la construction ce qu'il ne pourrait
    pas enseigner. Patron de `det()` : le garde-fou vérifie que la phrase satisfait bien la
    fonction DÉCLARÉE — une étiquette fausse enseignerait exactement la confusion que la
    leçon veut lever.

    Ce qu'il exige, selon la fonction :
    - `attribut` — un verbe d'état le précède immédiatement, ou à un adverbe près (« est
      très content ») ; et il ne suit pas un déterminant, sinon c'est un épithète ;
    - `epithete` — il appartient à un groupe nominal, c'est-à-dire qu'il suit un
      déterminant (antéposé : « le petit chien ») ou un nom lui-même déterminé (postposé :
      « un chemin étroit ») ; et il ne suit JAMAIS un verbe d'état.

    Ces mêmes repères servent une seconde fois : ils donnent le NOM, le SUJET et le VERBE
    D'ÉTAT que l'explication nomme (cf. `nomAccompagne` / `sujetDuVerbeEtat`). Une phrase
    dont ils ne se dérivent pas sans ambiguïté est donc refusée elle aussi — la leçon
    préfère ne pas accepter la phrase plutôt que lui coller une explication fausse.

    Exportée, comme `det` et `adjCE2`, pour que ses chemins `throw` soient exécutés par un
    test : un garde-fou que rien ne déclenche ne protège rien. */
export function adj(texte: string, cible: string, fonction: FonctionAdj): PhraseClicMot {
	const forme = cible.toLowerCase();
	if (ADJ_INTERDITS.has(forme) || ADJ_CM1_INTERDITS.has(forme) || estAdjectifVerbal(forme)) {
		throw new Error(
			`grammaire-clic-mot (adjectif CM1) : « ${cible} » est un participe, un adjectif ` +
				`verbal ou une forme à classe débattue — la difficulté viendrait de sa forme, ` +
				`pas de sa fonction.`,
		);
	}
	// L'explication est posée EN DERNIER (`avec`, plus bas) : elle nomme un référent qu'il
	// faut d'abord localiser dans la phrase, donc après que `phraseMots` a trouvé la cible
	// et que les garde-fous de fonction ont tranché la position. Elle part vide ici, et
	// AUCUN chemin de retour ne la laisse telle quelle.
	const p = phraseMots(texte, [cible], {
		explication: '',
		consigne: ADJ_CONSIGNE[fonction],
		cibleLabel: ADJ_LABEL[fonction],
		explicationNommeCible: true, // les deux formulations citent le mot visé (#529)
	});
	const avec = (explication: string): PhraseClicMot => ({ ...p, explication });
	const i = p.cibleIndices[0];
	const rad = radicalAdj(cible);
	p.tokens.forEach((t, k) => {
		if (k === i) return;
		const b = t.toLowerCase();
		if (ADJ_INTERDITS.has(b)) {
			throw new Error(
				`grammaire-clic-mot (adjectif CM1) : « ${t} » (participe passé / forme ambiguë) ` +
					`ne doit pas apparaître dans « ${texte} ».`,
			);
		}
		if (b.endsWith('ment') && b.startsWith(rad)) {
			throw new Error(
				`grammaire-clic-mot (adjectif CM1) : « ${t} » est de la même famille que ` +
					`« ${cible} » dans « ${texte} » (confusion adjectif / adverbe).`,
			);
		}
	});
	const avant = (n: number): string => (p.tokens[i - n] ?? '').toLowerCase();
	const suitDeterminant = DET_TOUS.has(avant(1));
	const suitVerbeEtat = VERBES_ETAT_FORMES.has(avant(1));
	if (fonction === 'attribut') {
		if (suitDeterminant) {
			throw new Error(
				`grammaire-clic-mot (adjectif CM1) : « ${cible} » suit un déterminant dans ` +
					`« ${texte} » — c'est un épithète, pas un attribut.`,
			);
		}
		if (!suitVerbeEtat && !VERBES_ETAT_FORMES.has(avant(2))) {
			throw new Error(
				`grammaire-clic-mot (adjectif CM1) : aucun verbe d'état n'introduit « ${cible} » ` +
					`dans « ${texte} » — un attribut du sujet en réclame un.`,
			);
		}
		// Un seul mot peut s'intercaler entre le verbe d'état et son attribut, et seulement
		// s'il est un ADVERBE (« est très content »). La tolérance acceptait n'importe quoi :
		// « Elle devient reine heureuse » passait alors pour un attribut, quand « heureuse »
		// y est épithète de « reine ». L'item aurait enseigné exactement la confusion que la
		// leçon veut lever — d'où un refus, et non une correction silencieuse.
		if (!suitVerbeEtat && !ADJ_MOTS_OUTILS.has(avant(1))) {
			throw new Error(
				`grammaire-clic-mot (adjectif CM1) : « ${p.tokens[i - 1]} » s'intercale entre le ` +
					`verbe d'état et « ${cible} » dans « ${texte} » — seul un adverbe peut s'y ` +
					`glisser, sinon l'attribut n'est pas relié au sujet.`,
			);
		}
		// Le verbe est collé à l'attribut, ou à UN adverbe près : les deux conditions
		// ci-dessus viennent de trancher laquelle des deux places le porte.
		const vi = suitVerbeEtat ? i - 1 : i - 2;
		return avec(explicationAttribut(cible, sujetDuVerbeEtat(texte, p.tokens, vi), p.tokens[vi]));
	}
	if (suitVerbeEtat) {
		throw new Error(
			`grammaire-clic-mot (adjectif CM1) : « ${cible} » suit un verbe d'état dans ` +
				`« ${texte} » — c'est un attribut, pas un épithète.`,
		);
	}
	if (!suitDeterminant && !DET_TOUS.has(avant(2))) {
		throw new Error(
			`grammaire-clic-mot (adjectif CM1) : « ${cible} » n'appartient à aucun groupe nominal ` +
				`dans « ${texte} » — un épithète suit un déterminant ou le nom qu'il décrit.`,
		);
	}
	return avec(explicationEpithete(cible, nomAccompagne(texte, cible, p.tokens, i)));
}

/* Expanse une phrase en SES DEUX items. Exportée, comme `adj`, pour que son chemin `throw`
   soit exécuté par un test : la banque étant construite à l'import, un garde-fou enfermé
   dans le module ne peut être éprouvé que par une phrase fautive écrite en dur, c'est-à-dire
   jamais. C'est ici que tient la promesse « chacun
   distracteur de l'autre » : la PAIRE est la maille de construction, donc une phrase à
   adjectif unique ne peut pas entrer dans la banque par inadvertance. */
export function adjPaire(texte: string, epithete: string, attribut: string): PhraseClicMot[] {
	if (epithete.toLowerCase() === attribut.toLowerCase()) {
		throw new Error(
			`grammaire-clic-mot (adjectif CM1) : « ${texte} » vise deux fois « ${epithete} » — ` +
				`les deux items auraient la même réponse.`,
		);
	}
	return [adj(texte, epithete, 'epithete'), adj(texte, attribut, 'attribut')];
}

/* Consigne par DÉFAUT du niveau (fiche imprimée, repli) : la tâche variant d'un item à
   l'autre, elle annonce le choix sans trancher — chaque item porte la sienne. */
export const CONSIGNE_ADJ_CM1 = "Clique sur l'adjectif demandé.";

export const PHRASES_ADJ_CM1: PhraseClicMot[] = [
	/* --- L'ATTRIBUT ferme la phrase (l'épithète est ailleurs) --- */
	...adjPaire('Le petit chien semble très content.', 'petit', 'content'),
	...adjPaire('Cette nouvelle maison est immense.', 'nouvelle', 'immense'),
	...adjPaire('Le jeune chat devient curieux.', 'jeune', 'curieux'),
	...adjPaire('La grande salle reste toujours vide.', 'grande', 'vide'),
	...adjPaire('Le nouveau maître paraît gentil.', 'nouveau', 'gentil'),
	...adjPaire('Les crayons neufs sont pointus.', 'neufs', 'pointus'),
	...adjPaire('Mon sac bleu est lourd.', 'bleu', 'lourd'),
	...adjPaire('Ce gros chien reste paisible.', 'gros', 'paisible'),
	...adjPaire('Cette chanteuse timide devient célèbre.', 'timide', 'célèbre'),
	...adjPaire('Ce livre ancien reste précieux.', 'ancien', 'précieux'),
	/* --- L'ÉPITHÈTE ferme la phrase, et elle vit dans un groupe COMPLÉMENT --- */
	...adjPaire('Le torrent devient rapide entre ces rochers lisses.', 'lisses', 'rapide'),
	...adjPaire('Le vent semble froid sur ce chemin étroit.', 'étroit', 'froid'),
	...adjPaire('Ces calculs semblent faciles pour un élève sérieux.', 'sérieux', 'faciles'),
	...adjPaire('Le gâteau paraît délicieux avec cette crème légère.', 'légère', 'délicieux'),
	...adjPaire('Mon frère semble très calme devant ce film triste.', 'triste', 'calme'),
	...adjPaire("L'eau paraît claire dans ce ruisseau tranquille.", 'tranquille', 'claire'),
	...adjPaire('Le couloir devient sombre derrière cette porte massive.', 'massive', 'sombre'),
	...adjPaire('Les nuages deviennent gris au-dessus de la plaine immense.', 'immense', 'gris'),
	...adjPaire('Ton histoire paraît drôle à ce public joyeux.', 'joyeux', 'drôle'),
	...adjPaire('Le jardin semble humide sous ces arbres épais.', 'épais', 'humide'),
	/* --- Aucun des deux ne ferme la phrase --- */
	...adjPaire('Le vieux loup semble nerveux ce soir.', 'vieux', 'nerveux'),
	...adjPaire("Cette longue route est difficile aujourd'hui.", 'longue', 'difficile'),
	...adjPaire('Mon cousin bavard devient sage à la maison.', 'bavard', 'sage'),
	...adjPaire("La vieille horloge semble silencieuse pendant l'orage.", 'vieille', 'silencieuse'),
	...adjPaire('Les jeunes arbres semblent immobiles sous la pluie.', 'jeunes', 'immobiles'),
	...adjPaire('Ce passage sombre devient dangereux pendant la nuit.', 'sombre', 'dangereux'),
	...adjPaire('Cette allée étroite est boueuse ce matin.', 'étroite', 'boueuse'),
	...adjPaire("Mes chaussures blanches sont propres aujourd'hui.", 'blanches', 'propres'),
	...adjPaire('Le grand chêne paraît encore solide malgré la tempête.', 'grand', 'solide'),
	...adjPaire('Cette jolie fleur semble fragile dans le vent.', 'jolie', 'fragile'),
];
