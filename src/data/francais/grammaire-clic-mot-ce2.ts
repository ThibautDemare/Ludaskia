/* ============================================================
   Grammaire — « Clique sur le mot » : les quatre natures du CE2 (#436).
   ------------------------------------------------------------
   Au CE2, on nomme les classes de mots EN BLOC, sans sous-catégorie : tous les noms,
   tous les déterminants, l'adjectif, le pronom personnel sujet. Trois de ces quatre
   leçons sont donc la variante CE2 d'une leçon aussi servie au CM1 (cf.
   `grammaire-clic-mot-cm1.ts` et l'option `ce2` de `clicMotType`).

   Chaque section porte ses garde-fous de CONSTRUCTION : c'est là que se joue la
   promesse « une seule réponse indiscutable », et ils sont plus stricts qu'au CM1
   puisqu'une cible plurielle doit être EXHAUSTIVE (rater un nom rendrait la phrase
   injouable). Ils lisent le vocabulaire partagé du moteur (`DET_SETS`, `PRON_SUJET`) :
   même liste de formes qu'au CM1, sinon un garde-fou accepterait ici ce que l'autre
   refuse là — cf. l'en-tête de `grammaire-clic-mot-moteur.ts`.
   ============================================================ */
import {
	DET_SETS,
	PRON_SUJET,
	enumererFr,
	phraseMots,
	tokeniser,
	type PhraseClicMot,
} from './grammaire-clic-mot-moteur';

/* ============================================================
   Leçons CE2 (#436) — nom, adjectif, déterminant, pronom personnel sujet.
   ------------------------------------------------------------
   Mêmes briques que les natures CM1 (même runner, même correction par égalité
   d'ensembles), mais des BANQUES et des CONSIGNES PROPRES AU CE2. Au CE2 on NOMME les
   classes de mots EN BLOC, sans les sous-catégoriser : ni article / possessif /
   démonstratif pour le déterminant, ni sujet / complément pour le pronom (ce sont des
   attendus CM1). Les banques CM1 restent intactes ; `generate` choisit la variante du
   niveau (patron de `clicVerbeType`).

   Cible PLURIELLE pour « nom » et « déterminant » (décision produit) : la consigne
   demande TOUS les noms / TOUS les déterminants de la phrase, et la réponse est
   l'ENSEMBLE de ces mots. Raison : au CE2 on ne peut pas exiger à la fois une cible
   UNIQUE et une position VARIÉE — varier la position suppose plusieurs groupes
   nominaux, donc plusieurs noms et plusieurs déterminants. Le runner corrige déjà un
   ensemble de mots non adjacents (cf. sujet composé « Paul … Léa »). « Adjectif » et
   « pronom personnel sujet » restent à cible UNIQUE.
   ============================================================ */

/* Énumération lisible des mots-cibles d'une explication (cible plurielle) :
   « chien » et « pomme » ; « la », « une » et « des ». Les mots sont CITÉS (guillemets),
   l'énumération elle-même est celle du cœur (`enumererFr`) — même règle que le libellé lu,
   donc aucune divergence possible entre l'explication et la réponse annoncée. */
function listeMots(mots: string[]): string {
	return enumererFr(mots.map((m) => `« ${m} »`));
}

/* Les déterminants du CE2, EN BLOC (articles + possessifs + démonstratifs) : la
   sous-catégorisation est un attendu CM1, on réutilise donc juste les ensembles du
   vocabulaire partagé (`DET_SETS`, moteur) pour ne pas tenir deux listes. */
const DET_CE2 = new Set<string>([
	...DET_SETS.article,
	...DET_SETS.possessif,
	...DET_SETS.demonstratif,
]);

/* Mots dont la présence ferait de la phrase un contre-exemple dans les banques CE2 à
   base de déterminants : partitifs/contractés (hors périmètre, comme au CM1), « leur »
   SINGULIER (homographe du pronom complément « je leur parle » — « leurs » reste, il
   n'a pas de pronom homographe), et les déterminants qui ne sont PAS nommés au CE2
   (indéfinis, numéraux) — s'ils étaient là, ils seraient des déterminants non ciblés,
   donc une réponse fausse enseignée. */
const DET_CE2_INTERDITS = new Set([
	'du',
	'au',
	'aux',
	'leur',
	'chaque',
	'quelques',
	'plusieurs',
	'certains',
	'certaines',
	'tout',
	'toute',
	'tous',
	'toutes',
	'quel',
	'quelle',
	'quels',
	'quelles',
	'deux',
	'trois',
	'quatre',
	'cinq',
	'six',
	'sept',
	'huit',
	'neuf',
	'dix',
]);

/* Formes d'être/avoir : « Ce sont… », « Ce n'est pas… » font de « ce » un PRONOM, pas
   un déterminant (interdit déjà acté au CM1). Garde-fou de construction. */
const ETRE_AVOIR_CE2 = new Set([
	'est',
	'sont',
	'était',
	'étaient',
	'sera',
	'seront',
	'a',
	'ont',
	'avait',
	'avaient',
]);

/* ---------- Leçon CE2 « Clique sur les noms » (banque du nom noyau CM1 étendue) ----------
   Cible = TOUS les noms de la phrase. SIMPLIFICATION ASSUMÉE (avis pédagogue) : le nom
   PROPRE compte comme un nom au même titre que le nom commun — au CE2 la classe « nom »
   se nomme en bloc, la distinction commun/propre est une autre leçon. L'explication le
   dit explicitement quand la phrase en contient un.
   Garde-fous de construction :
   - au moins DEUX noms par phrase (sinon la consigne au pluriel serait mensongère) ;
   - chaque nom ciblé est introduit par un déterminant (ou est un nom propre) ;
   - RÉCIPROQUE (le vrai risque) : tout introducteur de la phrase est suivi d'un nom
     CIBLÉ — un nom oublié dans l'annotation lève à la construction ;
   - aucun mot élidé « l'… » / « d'… » (le tokeniseur soude l'article au nom : le mot
     cliquable ne serait plus le nom seul).
   Écarté volontairement : les participes passés substantivés et les noms sans
   déterminant (« en classe », « à vélo ») — le garde-fou ci-dessus les refuse. */
export const CONSIGNE_NOM_CE2 = 'Clique sur tous les noms de la phrase.';
export const CIBLE_NOM_CE2 = 'les noms';

/* Mots qui INTRODUISENT un nom : déterminants du CE2, contractés/partitif et
   « chaque ». Ils ne sont pas cliquables ici (seul le nom l'est) : la liste sert au
   garde-fou « aucun nom oublié », pas à la pédagogie de la leçon. */
const NOM_INTRODUCTEURS = new Set<string>([...DET_CE2, 'au', 'aux', 'du', 'chaque']);
/* Fenêtre de recherche du nom après son introducteur : « un très beau dessin » place le
   nom 3 mots plus loin. */
const FENETRE_NOM = 3;

/* Exportée (comme `phrase`/`phraseMots`/`det`/`pron`) pour tester DIRECTEMENT ses chemins
   `throw` : un garde-fou de construction qu'aucun test n'exécute ne protège rien. */
export function nomsCE2(texte: string, noms: string[]): PhraseClicMot {
	if (noms.length < 2) {
		throw new Error(
			`grammaire-clic-mot (noms CE2) : « ${texte} » doit contenir au moins deux noms ` +
				`(consigne au pluriel), ${noms.length} annoncé(s).`,
		);
	}
	const tokens = tokeniser(texte);
	for (const t of tokens) {
		if (/^[ld]'/iu.test(t)) {
			throw new Error(
				`grammaire-clic-mot (noms CE2) : « ${t} » est élidé dans « ${texte} » ` +
					`(l'article soudé au nom empêche de cliquer le nom seul).html`,
			);
		}
	}
	const cible = new Set<number>();
	// Positions attendues : mêmes règles que phraseMots (unicité vérifiée là-bas).
	tokens.forEach((t, i) => {
		if (noms.some((n) => n.toLowerCase() === t.toLowerCase())) cible.add(i);
	});
	for (const i of cible) {
		const propre = /^\p{Lu}/u.test(tokens[i]);
		const introduit = tokens
			.slice(Math.max(0, i - FENETRE_NOM), i)
			.some((t) => NOM_INTRODUCTEURS.has(t.toLowerCase()));
		if (!propre && !introduit) {
			throw new Error(
				`grammaire-clic-mot (noms CE2) : « ${tokens[i]} » n'est ni un nom propre ni introduit ` +
					`par un déterminant dans « ${texte} ».`,
			);
		}
	}
	tokens.forEach((t, j) => {
		if (!NOM_INTRODUCTEURS.has(t.toLowerCase())) return;
		const suivi = tokens.slice(j + 1, j + 1 + FENETRE_NOM).some((_, k) => cible.has(j + 1 + k));
		if (!suivi) {
			throw new Error(
				`grammaire-clic-mot (noms CE2) : « ${t} » n'introduit aucun nom CIBLÉ dans ` +
					`« ${texte} » (nom oublié dans l'annotation ?).`,
			);
		}
	});
	const ordonnes = [...cible].sort((a, b) => a - b).map((i) => tokens[i]);
	// Rappel « le nom propre est un nom » ACCORDÉ au nombre de noms propres cités : une
	// phrase peut en contenir deux (« Paul et Léa »), et un rappel figé au singulier
	// donnerait « Un nom propre (« Paul » et « Léa ») est un nom lui aussi ».
	const propres = ordonnes.filter((m) => /^\p{Lu}/u.test(m));
	const rappel = !propres.length
		? ''
		: propres.length === 1
			? ` Un nom propre (${listeMots(propres)}) est un nom lui aussi.`
			: ` Des noms propres (${listeMots(propres)}) sont des noms eux aussi.`;
	return phraseMots(texte, noms, {
		explication:
			`Les noms de la phrase sont ${listeMots(ordonnes)} : ils désignent une personne, ` +
			`un animal, une chose ou une idée.${rappel}`,
		consigne: CONSIGNE_NOM_CE2,
		cibleLabel: CIBLE_NOM_CE2,
		// L'explication énumère déjà les noms : la région live n'a pas à les redire (#436).
		explicationNommeCible: true,
	});
}

export const PHRASES_NOM_CE2: PhraseClicMot[] = [
	// Deux groupes nominaux : sujet + complément (le nom n'est jamais le 1er mot).
	nomsCE2('Le chien mange sa gamelle.', ['chien', 'gamelle']),
	nomsCE2('La fille dessine un bateau.', ['fille', 'bateau']),
	nomsCE2('Le boulanger prépare des croissants.', ['boulanger', 'croissants']),
	nomsCE2('Mon frère répare son vélo.', ['frère', 'vélo']),
	nomsCE2('La maîtresse écrit la date.', ['maîtresse', 'date']),
	nomsCE2('Le facteur apporte une lettre.', ['facteur', 'lettre']),
	nomsCE2('Le jardinier arrose les fleurs.', ['jardinier', 'fleurs']),
	nomsCE2('Ma sœur range ses affaires.', ['sœur', 'affaires']),
	nomsCE2('Le fermier nourrit ses poules.', ['fermier', 'poules']),
	nomsCE2('Le pêcheur attrape un poisson.', ['pêcheur', 'poisson']),
	nomsCE2('Le vent casse une branche.', ['vent', 'branche']),
	nomsCE2('La cuisinière prépare un gâteau.', ['cuisinière', 'gâteau']),
	nomsCE2('Le maçon construit une maison.', ['maçon', 'maison']),
	nomsCE2('Mon cousin cherche ses lunettes.', ['cousin', 'lunettes']),
	nomsCE2('Le peintre nettoie ses pinceaux.', ['peintre', 'pinceaux']),
	nomsCE2('La vendeuse compte les pièces.', ['vendeuse', 'pièces']),
	nomsCE2('Le chat griffe le fauteuil.', ['chat', 'fauteuil']),
	nomsCE2('Ma voisine promène son chien.', ['voisine', 'chien']),
	nomsCE2('Le vétérinaire soigne un lapin.', ['vétérinaire', 'lapin']),
	nomsCE2('Le berger surveille son troupeau.', ['berger', 'troupeau']),
	// Avec un adjectif : l'adjectif se glisse entre le déterminant et le nom (distracteur).
	nomsCE2('Le petit chat boit du lait.', ['chat', 'lait']),
	nomsCE2('La grande girafe mange des feuilles.', ['girafe', 'feuilles']),
	nomsCE2('Un gros nuage cache le soleil.', ['nuage', 'soleil']),
	nomsCE2('Le vieux pêcheur répare un filet.', ['pêcheur', 'filet']),
	nomsCE2('La jolie fleur parfume la chambre.', ['fleur', 'chambre']),
	nomsCE2('Le nouveau maître explique la leçon.', ['maître', 'leçon']),
	nomsCE2('Une abeille jaune butine les fleurs.', ['abeille', 'fleurs']),
	nomsCE2('Le grand arbre cache la lumière.', ['arbre', 'lumière']),
	nomsCE2('La petite souris grignote une croûte.', ['souris', 'croûte']),
	nomsCE2('Le chien noir garde la maison.', ['chien', 'maison']),
	nomsCE2('Le ciel est gris ce matin.', ['ciel', 'matin']),
	// Complément circonstanciel en tête : trois noms, aucun en position 1.
	nomsCE2('Dans la cour, les enfants jouent au ballon.', ['cour', 'enfants', 'ballon']),
	nomsCE2('Sur la table, un vase attend les fleurs.', ['table', 'vase', 'fleurs']),
	nomsCE2('Chaque matin, le coq réveille la ferme.', ['matin', 'coq', 'ferme']),
	nomsCE2('Pendant les vacances, ma famille visite un château.', [
		'vacances',
		'famille',
		'château',
	]),
	nomsCE2('Le soir, les étoiles brillent dans le ciel.', ['soir', 'étoiles', 'ciel']),
	nomsCE2('Derrière la maison, un chien creuse un trou.', ['maison', 'chien', 'trou']),
	nomsCE2('Au marché, le vendeur pèse les pommes.', ['marché', 'vendeur', 'pommes']),
	nomsCE2('Sous le lit, le chat cache une balle.', ['lit', 'chat', 'balle']),
	nomsCE2('Après la récréation, les élèves rangent leurs cahiers.', [
		'récréation',
		'élèves',
		'cahiers',
	]),
	nomsCE2('Devant le portail, une voiture attend le facteur.', ['portail', 'voiture', 'facteur']),
	// Noms propres (comptés comme noms) : en tête, au milieu, coordonnés.
	nomsCE2('Léa dessine un bateau.', ['Léa', 'bateau']),
	nomsCE2('Paul et Léa partagent un goûter.', ['Paul', 'Léa', 'goûter']),
	nomsCE2('Le chien de Julie aboie dans le jardin.', ['chien', 'Julie', 'jardin']),
	nomsCE2('Tom range ses jouets dans la boîte.', ['Tom', 'jouets', 'boîte']),
	nomsCE2('Emma apporte un cadeau à sa cousine.', ['Emma', 'cadeau', 'cousine']),
	nomsCE2('Lucas oublie son cartable dans la classe.', ['Lucas', 'cartable', 'classe']),
	nomsCE2('Ce matin, Marie promène le chien.', ['matin', 'Marie', 'chien']),
	nomsCE2('Nina et son frère préparent une surprise.', ['Nina', 'frère', 'surprise']),
	// Sujet pronom : les noms sont tous après le verbe.
	nomsCE2('Il range ses crayons dans une trousse.', ['crayons', 'trousse']),
	nomsCE2('Nous cherchons les clés de la voiture.', ['clés', 'voiture']),
	nomsCE2('Elle plante des tulipes dans le jardin.', ['tulipes', 'jardin']),
	nomsCE2('Tu portes un manteau et une écharpe.', ['manteau', 'écharpe']),
	nomsCE2('Vous écoutez une histoire dans la classe.', ['histoire', 'classe']),
	nomsCE2('Ils traversent la rue avec leurs parents.', ['rue', 'parents']),
];

/* ---------- Leçon CE2 « Clique sur les déterminants » ----------
   Cible = TOUS les déterminants de la phrase, articles / possessifs / démonstratifs
   CONFONDUS (pas de sous-catégorie au CE2). Les indices sont DÉRIVÉS de la phrase
   (tout token de `DET_CE2`), pas annotés à la main : impossible d'en oublier un.
   Garde-fous : au moins deux déterminants ; aucun mot de `DET_CE2_INTERDITS` ; aucun
   mot élidé « l'… » (l'article n'y est plus cliquable) ; « ce » jamais suivi d'être ou
   d'avoir (ce serait le PRONOM « Ce sont… ») ; aucun article collé derrière un pronom
   sujet (« je le vois » : « le » y est un pronom complément, pas un déterminant). */
export const CONSIGNE_DET_CE2 = 'Clique sur tous les déterminants de la phrase.';
export const CIBLE_DET_CE2 = 'les déterminants';

/* Exportée pour tester DIRECTEMENT ses chemins `throw` (cf. `nomsCE2`). */
export function detsCE2(texte: string): PhraseClicMot {
	const tokens = tokeniser(texte);
	for (const t of tokens) {
		const b = t.toLowerCase();
		if (DET_CE2_INTERDITS.has(b)) {
			throw new Error(
				`grammaire-clic-mot (déterminants CE2) : « ${t} » est hors périmètre CE2 dans ` +
					`« ${texte} » (partitif/contracté, « leur » pronom ou déterminant non nommé au CE2).`,
			);
		}
		if (b.startsWith("l'")) {
			throw new Error(
				`grammaire-clic-mot (déterminants CE2) : « ${t} » est élidé dans « ${texte} » ` +
					`(l'article soudé au nom n'est plus cliquable).`,
			);
		}
	}
	const indices: number[] = [];
	tokens.forEach((t, i) => {
		if (DET_CE2.has(t.toLowerCase())) indices.push(i);
	});
	if (indices.length < 2) {
		throw new Error(
			`grammaire-clic-mot (déterminants CE2) : « ${texte} » doit contenir au moins deux ` +
				`déterminants (consigne au pluriel), ${indices.length} trouvé(s).`,
		);
	}
	for (const i of indices) {
		const suivant = (tokens[i + 1] ?? '').toLowerCase();
		if (tokens[i].toLowerCase() === 'ce' && ETRE_AVOIR_CE2.has(suivant)) {
			throw new Error(
				`grammaire-clic-mot (déterminants CE2) : « ce ${suivant} » dans « ${texte} » — ` +
					`« ce » y est un pronom, pas un déterminant.`,
			);
		}
		const precedent = (tokens[i - 1] ?? '').toLowerCase();
		if (PRON_SUJET.has(precedent)) {
			throw new Error(
				`grammaire-clic-mot (déterminants CE2) : « ${precedent} ${tokens[i]} » dans ` +
					`« ${texte} » — « ${tokens[i]} » y est un pronom complément, pas un déterminant.`,
			);
		}
	}
	const mots = indices.map((i) => tokens[i]);
	return phraseMots(texte, mots, {
		explication: `Les déterminants de la phrase sont ${listeMots(mots)} : chacun est placé devant un nom.`,
		consigne: CONSIGNE_DET_CE2,
		cibleLabel: CIBLE_DET_CE2,
		// L'explication énumère déjà les déterminants : pas de double annonce (#436).
		explicationNommeCible: true,
	});
}

export const PHRASES_DET_CE2: PhraseClicMot[] = [
	// Deux déterminants : sujet + complément. Un déterminant OUVRE souvent la phrase :
	// la moitié de la banque commence donc par autre chose (mot d'introduction, verbe à
	// l'impératif, pronom sujet) pour que « le 1er mot » ne devienne pas une stratégie.
	detsCE2('Le chien mange sa gamelle.'),
	detsCE2("Aujourd'hui, la fille dessine un bateau."),
	detsCE2('Dans le garage, mon frère répare son vélo.'),
	detsCE2('Cette histoire raconte une aventure.'),
	detsCE2('Après la classe, ces enfants rangent leurs jouets.'),
	detsCE2('Ce matin, le facteur apporte une lettre.'),
	detsCE2('Depuis ce matin, ma sœur cherche ses lunettes.'),
	detsCE2('En hiver, ce garçon porte un manteau.'),
	detsCE2('En automne, les oiseaux quittent leurs nids.'),
	detsCE2('Souvent, notre équipe gagne le match.'),
	detsCE2('Votre chien aboie dans le jardin.'),
	detsCE2('Cet oiseau protège ses petits.'),
	detsCE2('Pour ton anniversaire, tes amis apportent des cadeaux.'),
	detsCE2('En été, nos cousins visitent cette ville.'),
	detsCE2('Le matin, le jardinier arrose les fleurs.'),
	detsCE2('Une abeille butine ces fleurs.'),
	detsCE2('Pour la fête, ta cousine prépare un gâteau.'),
	detsCE2('Mes parents rangent la cuisine.'),
	detsCE2('Après la récréation, le maître corrige nos cahiers.'),
	detsCE2('Cette dame promène son chien.'),
	detsCE2('Le petit chat boit son lait.'),
	detsCE2('La grande girafe mange des feuilles.'),
	detsCE2('Un gros nuage cache le soleil.'),
	detsCE2('À midi, ma voisine promène son chien.'),
	detsCE2('Cet acteur joue un rôle.'),
	detsCE2('Ces montagnes cachent le soleil.'),
	// Trois déterminants, complément circonstanciel en tête (aucun en position 1).
	detsCE2('Sur la table, un vase attend des fleurs.'),
	detsCE2('Dans le jardin, mes cousins plantent un arbre.'),
	detsCE2('Derrière la maison, ce chien creuse un trou.'),
	detsCE2('Pendant les vacances, ma famille visite un château.'),
	detsCE2('Ce matin, le coq réveille la ferme.'),
	detsCE2('Le soir, les étoiles brillent dans le ciel.'),
	detsCE2('Dans la classe, les élèves écoutent le maître.'),
	detsCE2('Sous le lit, mon chat cache une balle.'),
	detsCE2('Devant la porte, une voiture attend le facteur.'),
	detsCE2('Ce chien garde la maison de mes voisins.'),
	detsCE2('Mon cousin apporte ces bonbons à la fête.'),
	detsCE2('La vendeuse range les fruits dans une caisse.'),
	detsCE2('Le vent casse une branche de notre arbre.'),
	detsCE2('Cette fille montre son dessin à ses amies.'),
	detsCE2('Les pompiers éteignent le feu dans cette forêt.'),
	detsCE2('Notre maîtresse corrige ce cahier.'),
	// Impératif : la phrase ne commence pas par un déterminant.
	detsCE2('Range tes affaires dans ce tiroir.'),
	detsCE2('Ferme la porte de ta chambre.'),
	detsCE2('Regarde ce château et cette tour.'),
	detsCE2('Apporte mon cahier et une gomme.'),
	detsCE2('Écoute la chanson de ce chanteur.'),
	detsCE2('Prends ton manteau et tes bottes.'),
	// Sujet pronom : les déterminants sont tous après le verbe.
	detsCE2('Tu portes une écharpe et un bonnet.'),
	detsCE2('Nous cherchons les clés de la voiture.'),
	detsCE2('Elle plante des tulipes dans le jardin.'),
	detsCE2('Ils traversent la rue avec leurs parents.'),
	detsCE2('Vous écoutez une histoire dans la classe.'),
	detsCE2('Il range ses crayons dans une trousse.'),
];

/* ---------- Leçon CE2 « Clique sur l'adjectif » (leçon NEUVE) ----------
   Cible UNIQUE : l'adjectif est facultatif dans le groupe nominal, une phrase à un seul
   adjectif est donc naturelle. Positions variées : après le nom, avant le nom, attribut
   après « être ».
   Interdits d'ambiguïté (avis pédagogue) :
   - PARTICIPES PASSÉS à valeur adjectivale (« fatigué », « cassé », « fermé ») : trop
     proches d'un passé composé sans auxiliaire visible, piège classique au CE2 ;
   - formes NOM/ADJECTIF ambiguës (nationalités substantivées : « un Français ») ;
   - un adverbe en « -ment » du MÊME radical que l'adjectif visé (« lente » +
     « lentement ») ;
   - un DEUXIÈME adjectif dans la phrase (garde-fou : aucun autre mot de la phrase n'est
     une forme employée comme cible ailleurs dans la banque, ni un mot de même radical). */
export const CONSIGNE_ADJ_CE2 = "Clique sur l'adjectif de la phrase.";
export const CIBLE_ADJ_CE2 = "l'adjectif";

/* Garde-fou, pas une liste exhaustive : les formes qu'on refuse de voir apparaître dans
   cette banque (participes passés adjectivaux + nationalités substantivables). */
const ADJ_CE2_INTERDITS = new Set([
	'fatigué',
	'fatiguée',
	'fatigués',
	'fatiguées',
	'cassé',
	'cassée',
	'cassés',
	'cassées',
	'fermé',
	'fermée',
	'ouvert',
	'ouverte',
	'rempli',
	'remplie',
	'mouillé',
	'mouillée',
	'trempé',
	'trempée',
	'endormi',
	'endormie',
	'assis',
	'assise',
	'couché',
	'couchée',
	'allumé',
	'allumée',
	'éteint',
	'éteinte',
	'rangé',
	'rangée',
	'perdu',
	'perdue',
	'blessé',
	'blessée',
	'gelé',
	'gelée',
	'sucré',
	'sucrée',
	'salé',
	'salée',
	'coloré',
	'colorée',
	'doré',
	'dorée',
	'poli',
	'polie',
	'cuit',
	'cuite',
	'brûlé',
	'brûlée',
	'déchiré',
	'déchirée',
	'fané',
	'fanée',
	'français',
	'française',
	'anglais',
	'anglaise',
	'espagnol',
	'espagnole',
	'italien',
	'italienne',
	'chinois',
	'chinoise',
	'allemand',
	'allemande',
]);

/* Radical GROSSIER (minuscule, marque du pluriel puis du féminin retirées) : sert
   uniquement à repérer, dans une même phrase, deux mots de la même famille que
   l'adjectif visé (« grand » / « grande », « calme » / « calmement »). Heuristique
   assumée, pas une analyse morphologique. */
function radicalAdj(mot: string): string {
	let r = mot.toLowerCase();
	if (r.endsWith('s')) r = r.slice(0, -1);
	if (r.endsWith('e')) r = r.slice(0, -1);
	return r;
}

/* Banque AUTORÉE (phrase, adjectif) : les FORMES employées comme cibles servent ensuite
   de détecteur de second adjectif, d'où la construction en deux temps. */
const ADJ_CE2_ITEMS: [string, string][] = [
	// Adjectif APRÈS le nom
	['Ma sœur porte une robe rouge.', 'rouge'],
	['Le chat noir dort sur le canapé.', 'noir'],
	['Nous suivons un chemin étroit.', 'étroit'],
	['Elle cueille une fleur blanche.', 'blanche'],
	['Le facteur apporte une lettre importante.', 'importante'],
	['Tu portes un manteau vert.', 'vert'],
	['Le boulanger vend des croissants chauds.', 'chauds'],
	['Léa raconte une histoire drôle.', 'drôle'],
	['Il escalade une montagne immense.', 'immense'],
	['Nous regardons un film amusant.', 'amusant'],
	['Le clown lance une balle jaune.', 'jaune'],
	['Ma cousine cherche un livre passionnant.', 'passionnant'],
	['Le jardinier plante un arbre fruitier.', 'fruitier'],
	// « mûre » est aussi un NOM (le fruit) : homographe nom/adjectif que cette banque
	// s'interdit ailleurs, remplacé par une couleur.
	['Tom mange une pomme verte.', 'verte'],
	['Le maître écrit une phrase courte.', 'courte'],
	['Elle traverse une rue calme.', 'calme'],
	['Papa lave la voiture bleue.', 'bleue'],
	['Le pêcheur attrape un poisson énorme.', 'énorme'],
	['Nina dessine un papillon minuscule.', 'minuscule'],
	['Le berger surveille un troupeau paisible.', 'paisible'],
	// Adjectif AVANT le nom
	['Le petit chien aboie bruyamment.', 'petit'],
	['La grande girafe mange des feuilles.', 'grande'],
	['Un gros nuage cache le soleil.', 'gros'],
	['Le vieux pêcheur répare son filet.', 'vieux'],
	['Ma jolie cousine chante une chanson.', 'jolie'],
	['Le jeune chat grimpe sur le mur.', 'jeune'],
	['Une belle fleur pousse dans le jardin.', 'belle'],
	['Le nouveau maître explique la leçon.', 'nouveau'],
	['Nous visitons un magnifique château.', 'magnifique'],
	['Elle raconte une longue histoire.', 'longue'],
	['Tu ranges une grosse valise.', 'grosse'],
	['Le brave pompier arrose les flammes.', 'brave'],
	['Un joyeux oiseau chante sur la branche.', 'joyeux'],
	['La douce musique berce le bébé.', 'douce'],
	['Le méchant loup effraie les moutons.', 'méchant'],
	// Adjectif ATTRIBUT (après « être »)
	['Le ciel est gris ce matin.', 'gris'],
	['Cette histoire est très amusante.', 'amusante'],
	["Mon cartable est lourd aujourd'hui.", 'lourd'],
	['La piscine est profonde.', 'profonde'],
	['Ces exercices sont faciles.', 'faciles'],
	["Le chemin est long jusqu'au village.", 'long'],
	['Les fraises sont délicieuses.', 'délicieuses'],
	['La salle est vide.', 'vide'],
	['Mon chien est très gentil.', 'gentil'],
	["La rivière est calme aujourd'hui.", 'calme'],
	['Ce garçon est timide.', 'timide'],
	['Les rues sont étroites dans ce village.', 'étroites'],
	['Le chocolat est chaud.', 'chaud'],
	['La nuit est sombre.', 'sombre'],
	['Ces chaussures sont neuves.', 'neuves'],
	['Le gâteau est délicieux.', 'délicieux'],
	['Cette chanson est jolie.', 'jolie'],
	['Mes chaussons sont propres.', 'propres'],
	['Le sac est léger.', 'léger'],
	['Cette route est dangereuse.', 'dangereuse'],
	// Complément circonstanciel en tête (adjectif loin du début)
	['Dans le jardin, une abeille curieuse butine.', 'curieuse'],
	['Sur la table, un vase fragile attend des fleurs.', 'fragile'],
	['Chaque matin, le coq bruyant réveille la ferme.', 'bruyant'],
	['Pendant les vacances, ma famille visite un joli village.', 'joli'],
	['Le soir, les étoiles brillantes éclairent le ciel.', 'brillantes'],
];

const ADJ_CE2_FORMES = new Set(ADJ_CE2_ITEMS.map(([, a]) => a.toLowerCase()));

/* Exportée pour tester DIRECTEMENT ses chemins `throw` (cf. `nomsCE2`). Lit le lexique
   d'adjectifs de la banque (`ADJ_CE2_FORMES`), d'où la construction en deux temps. */
export function adjCE2(texte: string, adjectif: string): PhraseClicMot {
	const cible = adjectif.toLowerCase();
	if (ADJ_CE2_INTERDITS.has(cible)) {
		throw new Error(
			`grammaire-clic-mot (adjectif CE2) : « ${adjectif} » est un participe passé ou une ` +
				`forme nom/adjectif ambiguë — hors périmètre CE2.`,
		);
	}
	const p = phraseMots(texte, [adjectif], {
		explication: `« ${adjectif} » dit comment est le nom : c'est un adjectif.`,
		consigne: CONSIGNE_ADJ_CE2,
		cibleLabel: CIBLE_ADJ_CE2,
		explicationNommeCible: true, // #529
	});
	const rad = radicalAdj(adjectif);
	const cibleIdx = p.cibleIndices[0];
	p.tokens.forEach((t, k) => {
		if (k === cibleIdx) return;
		const b = t.toLowerCase();
		if (ADJ_CE2_INTERDITS.has(b)) {
			throw new Error(
				`grammaire-clic-mot (adjectif CE2) : « ${t} » (participe passé / forme ambiguë) ` +
					`ne doit pas apparaître dans « ${texte} ».`,
			);
		}
		if (ADJ_CE2_FORMES.has(b)) {
			throw new Error(
				`grammaire-clic-mot (adjectif CE2) : « ${texte} » contient un second adjectif ` +
					`(« ${t} ») — la cible ne serait plus unique.`,
			);
		}
		if (radicalAdj(b) === rad || (b.endsWith('ment') && b.startsWith(rad))) {
			throw new Error(
				`grammaire-clic-mot (adjectif CE2) : « ${t} » est de la même famille que ` +
					`« ${adjectif} » dans « ${texte} » (confusion adjectif / adverbe).`,
			);
		}
	});
	return p;
}

export const PHRASES_ADJ_CE2: PhraseClicMot[] = ADJ_CE2_ITEMS.map(([texte, a]) => adjCE2(texte, a));

/* ---------- Leçon CE2 « Clique sur le pronom personnel sujet » ----------
   Cible UNIQUE : je / tu / il / elle / on / nous / vous / ils / elles.
   Interdits d'ambiguïté (avis pédagogue) :
   - AUCUN pronom complément dans la phrase (« Il me regarde », « Elle lui parle ») : non
     enseigné au CE2, il ferait un distracteur illégitime ;
   - pas de « il » impersonnel (« il pleut », « il faut ») : ce « il » ne remplace personne ;
   - « on » avec modération, dans des phrases au sens limpide.
   Garde-fou : un SEUL pronom sujet cliquable par phrase, et c'est la cible. */
export const CONSIGNE_PRON_CE2 = 'Clique sur le pronom personnel sujet de la phrase.';
export const CIBLE_PRON_CE2 = 'le pronom personnel sujet';

/* Pronoms NON enseignés au CE2 dans ce cadre (compléments, toniques) : leur simple
   présence disqualifie la phrase. « leurs » (déterminant) reste autorisé. */
const PRON_CE2_INTERDITS = new Set(['me', 'te', 'se', 'lui', 'leur', 'moi', 'toi', 'eux', 'y']);
/* Verbes qui rendent « il » impersonnel. */
const VERBES_IMPERSONNELS = new Set([
	'pleut',
	'pleuvait',
	'neige',
	'neigeait',
	'faut',
	'fallait',
	'gèle',
	'fait',
	'fera',
	'ferait',
]);

/* Exportée pour tester DIRECTEMENT ses chemins `throw` (cf. `nomsCE2`). */
export function pronSujetCE2(texte: string, cible: string): PhraseClicMot {
	const cl = cible.toLowerCase();
	if (!PRON_SUJET.has(cl)) {
		throw new Error(
			`grammaire-clic-mot (pronom sujet CE2) : « ${cible} » n'est pas un pronom personnel sujet.`,
		);
	}
	const tokens = tokeniser(texte);
	for (const t of tokens) {
		if (PRON_CE2_INTERDITS.has(t.toLowerCase())) {
			throw new Error(
				`grammaire-clic-mot (pronom sujet CE2) : « ${t} » (pronom hors programme CE2) ` +
					`ne doit pas apparaître dans « ${texte} ».`,
			);
		}
	}
	const sujets = tokens.filter((t) => PRON_SUJET.has(t.toLowerCase()));
	if (sujets.length !== 1 || sujets[0].toLowerCase() !== cl) {
		throw new Error(
			`grammaire-clic-mot (pronom sujet CE2) : « ${texte} » doit contenir un seul pronom ` +
				`sujet (« ${cible} » ; trouvé ${sujets.length} : ${sujets.join(', ')}).`,
		);
	}
	const i = tokens.findIndex((t) => t.toLowerCase() === cl);
	const suivant = (tokens[i + 1] ?? '').toLowerCase();
	if (VERBES_IMPERSONNELS.has(suivant)) {
		throw new Error(
			`grammaire-clic-mot (pronom sujet CE2) : « ${cible} ${suivant} » dans « ${texte} » — ` +
				`ce « ${cible} » est impersonnel, il ne remplace personne.`,
		);
	}
	return phraseMots(texte, [cible], {
		explication: `« ${cible} » dit qui fait l'action : c'est un pronom personnel sujet.`,
		consigne: CONSIGNE_PRON_CE2,
		cibleLabel: CIBLE_PRON_CE2,
		explicationNommeCible: true, // #529
	});
}

export const PHRASES_PRON_CE2: PhraseClicMot[] = [
	// Les neuf pronoms, en tête de phrase.
	pronSujetCE2('Je range mes crayons dans la trousse.', 'Je'),
	pronSujetCE2('Tu colles une image dans ton cahier.', 'Tu'),
	pronSujetCE2('Il dessine un bateau sur son cahier.', 'Il'),
	pronSujetCE2('Elle arrose les fleurs du jardin.', 'Elle'),
	pronSujetCE2('Nous jouons au ballon dans la cour.', 'Nous'),
	pronSujetCE2('Vous écoutez la maîtresse.', 'Vous'),
	pronSujetCE2('Ils traversent la rue avec leurs parents.', 'Ils'),
	pronSujetCE2('Elles chantent une chanson joyeuse.', 'Elles'),
	pronSujetCE2('On range la classe avant la récréation.', 'On'),
	pronSujetCE2('Je cherche mes lunettes partout.', 'Je'),
	pronSujetCE2("Tu attends le bus devant l'école.", 'Tu'),
	pronSujetCE2('Il ferme la porte du garage.', 'Il'),
	pronSujetCE2('Elle prépare un gâteau au chocolat.', 'Elle'),
	pronSujetCE2('Nous plantons des tulipes dans le jardin.', 'Nous'),
	pronSujetCE2('Vous rangez vos affaires dans le placard.', 'Vous'),
	pronSujetCE2('Ils construisent une cabane dans la forêt.', 'Ils'),
	pronSujetCE2('Elles dessinent une belle maison.', 'Elles'),
	pronSujetCE2('On écoute une histoire avant la sieste.', 'On'),
	pronSujetCE2('Je porte mon cartable sur le dos.', 'Je'),
	pronSujetCE2('Tu mélanges la pâte avec une cuillère.', 'Tu'),
	pronSujetCE2('Il attrape le ballon avec ses mains.', 'Il'),
	pronSujetCE2('Elle recopie la phrase sans faute.', 'Elle'),
	pronSujetCE2('Nous partageons le gâteau en huit parts.', 'Nous'),
	pronSujetCE2('Vous chantez très fort dans la salle.', 'Vous'),
	pronSujetCE2('Ils gagnent le match contre notre équipe.', 'Ils'),
	pronSujetCE2('Elles rangent les livres sur les étagères.', 'Elles'),
	pronSujetCE2('On apporte des fruits pour le goûter.', 'On'),
	// Complément circonstanciel en tête : le pronom n'est plus le 1er mot.
	pronSujetCE2('Chaque matin, il promène son chien.', 'il'),
	pronSujetCE2('Le soir, elle lit une histoire.', 'elle'),
	pronSujetCE2('Pendant les vacances, nous visitons un château.', 'nous'),
	pronSujetCE2('Dans la cour, ils jouent au ballon.', 'ils'),
	pronSujetCE2('Demain, je finirai mon dessin.', 'je'),
	pronSujetCE2('Après le repas, tu ranges la table.', 'tu'),
	pronSujetCE2('Sur la plage, elles ramassent des coquillages.', 'elles'),
	pronSujetCE2('À la piscine, on nage longtemps.', 'on'),
	pronSujetCE2('Ce matin, vous arrivez en retard.', 'vous'),
	pronSujetCE2('Ce matin, je bois un chocolat chaud.', 'je'),
	pronSujetCE2('Dans le jardin, elle plante des salades.', 'elle'),
	pronSujetCE2('Le mercredi, nous allons à la piscine.', 'nous'),
	pronSujetCE2('Après la classe, ils rentrent à pied.', 'ils'),
	pronSujetCE2('Avant le dîner, tu mets la table.', 'tu'),
	pronSujetCE2('Le samedi, vous jouez au football.', 'vous'),
	pronSujetCE2('En hiver, elles portent un bonnet.', 'elles'),
	pronSujetCE2('Le dimanche, on visite nos grands-parents.', 'on'),
	pronSujetCE2('À midi, je mange à la cantine.', 'je'),
	// Deux propositions coordonnées : le pronom est au milieu de la phrase.
	pronSujetCE2('Le chien aboie et il court vers la porte.', 'il'),
	pronSujetCE2('La maîtresse explique et nous écoutons.', 'nous'),
	pronSujetCE2('Léa chante et elle danse.', 'elle'),
	pronSujetCE2('Papa cuisine pendant que je mets la table.', 'je'),
	pronSujetCE2('Les enfants rient et ils applaudissent.', 'ils'),
	pronSujetCE2('La cloche sonne et vous rentrez en classe.', 'vous'),
	pronSujetCE2('Le maître écrit et tu recopies la phrase.', 'tu'),
	pronSujetCE2('Tom range ses jouets et il ferme la boîte.', 'il'),
	pronSujetCE2('Mes cousins arrivent demain et ils apportent un cadeau.', 'ils'),
	pronSujetCE2('Le chat dort et il ronronne doucement.', 'il'),
	pronSujetCE2('Le maître pose une question et elles répondent.', 'elles'),
	pronSujetCE2('La pluie tombe et nous ouvrons les parapluies.', 'nous'),
	pronSujetCE2('Le four chauffe et tu attends le gâteau.', 'tu'),
	pronSujetCE2('Le spectacle commence et vous applaudissez très fort.', 'vous'),
	// Subordonnée en tête : le pronom sujet arrive après une proposition entière.
	pronSujetCE2('Quand la nuit tombe, je ferme les volets.', 'je'),
	pronSujetCE2('Dès que la récréation sonne, ils sortent dans la cour.', 'ils'),
	pronSujetCE2('Comme le bus est en retard, elle attend sur le trottoir.', 'elle'),
];
