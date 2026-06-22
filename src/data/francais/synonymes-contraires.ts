/* ============================================================
   Vocabulaire — Les contraires & Les mots de sens proche (#203).
   ------------------------------------------------------------
   Deux leçons QCM (3 options) :
   - « Les contraires » (antonymes) — à faire en premier : relation binaire
     franche (grand/petit, ouvrir/fermer…), consigne « Quel mot veut dire le
     contraire ? », picto « ↔ » ;
   - « Les mots de sens proche » (synonymes) — relations plus floues, consigne
     « Quel mot veut dire presque la même chose ? », picto « = ».

   Principes (cf. issue #203, avis pedagogue-primaire) :
   - le mot-cible est TOUJOURS en CONTEXTE, jamais isolé : il est en **gras**
     dans une phrase courte (~8 mots), rendue par enonceTexte (#199) ;
   - 3 options, UNE SEULE réponse défendable. Les distracteurs sont FRANCS :
     aucun quasi-synonyme de la réponse (piège injuste), et jamais un mot déjà
     présent dans la phrase (indice). Ils partagent le genre/nombre du mot-cible
     pour qu'on puisse les substituer naturellement ;
   - lexique COURANT CE2 (pas de registre soutenu, pas de CM1/CM2) ;
   - lecture vocale (#42) : comme le **gras** est invisible à l'oral, le texte
     lu NOMME le mot-cible (« Quel mot veut dire le contraire de « grand » ? … ») ;
   - champ `explication` reformulant avec le bon mot (« « grand » veut dire le
     contraire de « petit » »).

   Banque INTERNE étiquetée (comme classes-mots.ts / sens-figure.ts) : on
   n'étiquette pas les listes personnalisables du parent. Un builder commun
   transforme chaque entrée en item QCM { question, reponse, distracteurs,
   explication, consigne, picto, parle }.
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { choice, sample } from '../../core/utils';

/** Une entrée de banque : une phrase avec le mot-cible en **gras**, le bon mot
    (contraire ou sens proche selon la leçon) et deux distracteurs francs. */
export interface ItemSens {
	phrase: string; // contient exactement un **mot-cible**
	reponse: string;
	distracteurs: [string, string];
}

/* ---------- Banque : Les contraires (antonymes) ---------- */
export const CONTRAIRES: ItemSens[] = [
	{
		phrase: 'Le géant de l’histoire est très **grand**.',
		reponse: 'petit',
		distracteurs: ['rapide', 'joyeux'],
	},
	{
		phrase: 'Le chaton qui vient de naître est tout **petit**.',
		reponse: 'grand',
		distracteurs: ['gentil', 'rond'],
	},
	{
		phrase: 'Ce bol de soupe est encore trop **chaud**.',
		reponse: 'froid',
		distracteurs: ['salé', 'épais'],
	},
	{
		phrase: 'Dehors, le vent du matin est **froid**.',
		reponse: 'chaud',
		distracteurs: ['fort', 'léger'],
	},
	{
		phrase: 'Après la douche, le bébé est tout **propre**.',
		reponse: 'sale',
		distracteurs: ['mouillé', 'content'],
	},
	{
		phrase: 'Ses bottes pleines de boue sont vraiment **sales**.',
		reponse: 'propres',
		distracteurs: ['vieilles', 'lourdes'],
	},
	{
		phrase: 'La bouteille de jus est encore toute **pleine**.',
		reponse: 'vide',
		distracteurs: ['lourde', 'ronde'],
	},
	{
		phrase: 'Après la fête, le grand verre est **vide**.',
		reponse: 'plein',
		distracteurs: ['cassé', 'rond'],
	},
	{
		phrase: 'Le bébé de la voisine est encore très **jeune**.',
		reponse: 'vieux',
		distracteurs: ['sage', 'calme'],
	},
	{
		phrase: 'Le grand-père de Léa est déjà très **vieux**.',
		reponse: 'jeune',
		distracteurs: ['gentil', 'riche'],
	},
	{
		phrase: 'Le crayon que j’utilise est tout **mince**.',
		reponse: 'gros',
		distracteurs: ['long', 'rouge'],
	},
	{
		phrase: 'L’éléphant du cirque est un animal très **gros**.',
		reponse: 'mince',
		distracteurs: ['lent', 'gris'],
	},
	{
		phrase: 'Le gros rocher est vraiment trop **lourd**.',
		reponse: 'léger',
		distracteurs: ['dur', 'rond'],
	},
	{
		phrase: 'La plume de l’oiseau est toute **légère**.',
		reponse: 'lourde',
		distracteurs: ['douce', 'blanche'],
	},
	{
		phrase: 'L’ogre du conte est un homme très **fort**.',
		reponse: 'faible',
		distracteurs: ['grand', 'gentil'],
	},
	{
		phrase: 'La leçon d’aujourd’hui est vraiment **facile**.',
		reponse: 'difficile',
		distracteurs: ['longue', 'amusante'],
	},
	{
		phrase: 'Ce problème de maths est trop **difficile**.',
		reponse: 'facile',
		distracteurs: ['long', 'utile'],
	},
	{
		phrase: 'Pendant la nuit, le couloir est tout **sombre**.',
		reponse: 'clair',
		distracteurs: ['calme', 'froid'],
	},
	{
		phrase: 'En plein midi, le ciel d’été est **clair**.',
		reponse: 'sombre',
		distracteurs: ['bleu', 'haut'],
	},
	{
		phrase: 'Le loup du conte est vraiment très **méchant**.',
		reponse: 'gentil',
		distracteurs: ['grand', 'rapide'],
	},
	{
		phrase: 'Ma voisine est toujours très **gentille** avec moi.',
		reponse: 'méchante',
		distracteurs: ['petite', 'pressée'],
	},
	{
		phrase: 'L’escargot du jardin est un animal très **lent**.',
		reponse: 'rapide',
		distracteurs: ['petit', 'vert'],
	},
	{
		phrase: 'Le guépard de la savane est très **rapide**.',
		reponse: 'lent',
		distracteurs: ['grand', 'doux'],
	},
	{
		phrase: 'Le chevalier du château est très **courageux**.',
		reponse: 'peureux',
		distracteurs: ['poli', 'riche'],
	},
	{
		phrase: 'Ce petit garçon est toujours très **poli**.',
		reponse: 'impoli',
		distracteurs: ['grand', 'rapide'],
	},
	{
		phrase: 'Le bâton que j’ai trouvé est bien **droit**.',
		reponse: 'tordu',
		distracteurs: ['court', 'lisse'],
	},
	{
		phrase: 'La réponse que tu as donnée est **vraie**.',
		reponse: 'fausse',
		distracteurs: ['longue', 'simple'],
	},
	{
		phrase: 'L’histoire qu’il raconte est complètement **fausse**.',
		reponse: 'vraie',
		distracteurs: ['courte', 'drôle'],
	},
	{
		phrase: 'Le matin, j’aime **ouvrir** les volets de ma chambre.',
		reponse: 'fermer',
		distracteurs: ['laver', 'ranger'],
	},
	{
		phrase: 'Le soir, je vais **fermer** la porte du jardin.',
		reponse: 'ouvrir',
		distracteurs: ['pousser', 'peindre'],
	},
	{
		phrase: 'Avant de dormir, je dois **éteindre** la lampe.',
		reponse: 'allumer',
		distracteurs: ['casser', 'ranger'],
	},
	{
		phrase: 'Le soir, papa va **allumer** le feu de bois.',
		reponse: 'éteindre',
		distracteurs: ['porter', 'ouvrir'],
	},
	{
		phrase: 'Les alpinistes commencent à **monter** la montagne.',
		reponse: 'descendre',
		distracteurs: ['sauter', 'courir'],
	},
	{
		phrase: 'L’ascenseur de l’immeuble commence à **descendre**.',
		reponse: 'monter',
		distracteurs: ['tourner', 'ralentir'],
	},
	{
		phrase: 'Le train va bientôt **partir** de la gare.',
		reponse: 'arriver',
		distracteurs: ['rouler', 'klaxonner'],
	},
	{
		phrase: 'Les invités vont enfin **arriver** chez nous.',
		reponse: 'partir',
		distracteurs: ['manger', 'parler'],
	},
	{
		phrase: 'Le clown du cirque nous fait beaucoup **rire**.',
		reponse: 'pleurer',
		distracteurs: ['courir', 'manger'],
	},
	{
		phrase: 'Quand il tombe, le bébé se met à **pleurer**.',
		reponse: 'rire',
		distracteurs: ['dormir', 'marcher'],
	},
	{
		phrase: 'Le chat gris veut **entrer** dans la maison.',
		reponse: 'sortir',
		distracteurs: ['dormir', 'miauler'],
	},
	{
		phrase: 'Le soir, mon chien aime **sortir** dans le jardin.',
		reponse: 'entrer',
		distracteurs: ['aboyer', 'manger'],
	},
	{
		phrase: 'À la course de l’école, je veux **gagner**.',
		reponse: 'perdre',
		distracteurs: ['courir', 'sauter'],
	},
	{
		phrase: 'Personne n’aime **perdre** un match de foot.',
		reponse: 'gagner',
		distracteurs: ['jouer', 'regarder'],
	},
	{
		phrase: 'Il faut **pousser** très fort la lourde porte.',
		reponse: 'tirer',
		distracteurs: ['laver', 'peindre'],
	},
	{
		phrase: 'Le cheval doit **tirer** la grosse charrette.',
		reponse: 'pousser',
		distracteurs: ['manger', 'dormir'],
	},
	{
		phrase: 'Le maçon va **construire** une belle maison.',
		reponse: 'détruire',
		distracteurs: ['dessiner', 'laver'],
	},
	{
		phrase: 'À Noël, j’adore **donner** des cadeaux.',
		reponse: 'recevoir',
		distracteurs: ['cacher', 'casser'],
	},
	{
		phrase: 'Le marchand veut **vendre** toutes ses pommes.',
		reponse: 'acheter',
		distracteurs: ['laver', 'compter'],
	},
	{
		phrase: 'Maman va **acheter** du pain à la boulangerie.',
		reponse: 'vendre',
		distracteurs: ['manger', 'couper'],
	},
	{
		phrase: 'Au cinéma, le film va bientôt **commencer**.',
		reponse: 'finir',
		distracteurs: ['tomber', 'briller'],
	},
	{
		phrase: 'Le spectacle de l’école vient de **finir**.',
		reponse: 'commencer',
		distracteurs: ['tomber', 'briller'],
	},
	{
		phrase: 'Le camion s’arrête, puis se met à **reculer**.',
		reponse: 'avancer',
		distracteurs: ['tourner', 'klaxonner'],
	},
	{
		phrase: 'Au feu vert, la voiture commence à **avancer**.',
		reponse: 'reculer',
		distracteurs: ['tourner', 'klaxonner'],
	},
	{
		phrase: 'Mon meilleur ami dit **toujours** la vérité.',
		reponse: 'jamais',
		distracteurs: ['vite', 'bien'],
	},
	{
		phrase: 'Ce menteur ne dit **jamais** la vérité.',
		reponse: 'toujours',
		distracteurs: ['vite', 'fort'],
	},
	{
		phrase: 'Le grand garçon court vraiment très **vite**.',
		reponse: 'lentement',
		distracteurs: ['souvent', 'bien'],
	},
	{
		phrase: 'La tortue du jardin avance très **lentement**.',
		reponse: 'vite',
		distracteurs: ['souvent', 'gentiment'],
	},
	// ----- Ajouts #285 (variété) : antonymes francs, distracteurs hors de la phrase. -----
	{
		phrase: 'L’avion vole très **haut** dans le ciel.',
		reponse: 'bas',
		distracteurs: ['rond', 'bleu'],
	},
	{
		phrase: 'Le tiroir du meuble est tout en **bas**.',
		reponse: 'haut',
		distracteurs: ['rond', 'vert'],
	},
	{
		phrase: 'Le pain de la veille est devenu tout **dur**.',
		reponse: 'mou',
		distracteurs: ['rond', 'sucré'],
	},
	{
		phrase: 'Après la pluie, le sol est tout **mou**.',
		reponse: 'dur',
		distracteurs: ['vert', 'plat'],
	},
	{
		phrase: 'Le grand couloir est très **large**.',
		reponse: 'étroit',
		distracteurs: ['long', 'gris'],
	},
	{
		phrase: 'Le petit chemin du bois est **étroit**.',
		reponse: 'large',
		distracteurs: ['rond', 'vert'],
	},
	{
		phrase: 'Après la douche, mon chien est tout **mouillé**.',
		reponse: 'sec',
		distracteurs: ['petit', 'gris'],
	},
	{
		phrase: 'En été, le sol du jardin est **sec**.',
		reponse: 'mouillé',
		distracteurs: ['vert', 'dur'],
	},
	{
		phrase: 'Le gros dictionnaire est très **épais**.',
		reponse: 'fin',
		distracteurs: ['rond', 'léger'],
	},
	{
		phrase: 'Le trait de crayon est très **fin**.',
		reponse: 'épais',
		distracteurs: ['long', 'rouge'],
	},
	{
		phrase: 'Le chat veut rester **dehors**.',
		reponse: 'dedans',
		distracteurs: ['debout', 'vite'],
	},
	{
		phrase: 'Quand il pleut, on joue **dedans**.',
		reponse: 'dehors',
		distracteurs: ['debout', 'souvent'],
	},
	{
		phrase: 'Le jour de la fête, il est très **content**.',
		reponse: 'triste',
		distracteurs: ['poli', 'grand'],
	},
	{
		phrase: 'Après le départ de son ami, il est **triste**.',
		reponse: 'content',
		distracteurs: ['poli', 'rapide'],
	},
];

/* ---------- Banque : Les mots de sens proche (synonymes) ---------- */
export const SENS_PROCHE: ItemSens[] = [
	{
		phrase: 'Le jour de la fête, Léa est très **contente**.',
		reponse: 'joyeuse',
		distracteurs: ['fatiguée', 'rapide'],
	},
	{
		phrase: 'En ouvrant son cadeau, il est très **heureux**.',
		reponse: 'content',
		distracteurs: ['pressé', 'poli'],
	},
	{
		phrase: 'Après la mauvaise nouvelle, il est tout **triste**.',
		reponse: 'malheureux',
		distracteurs: ['content', 'rapide'],
	},
	{
		phrase: 'Le tableau accroché au mur est vraiment **beau**.',
		reponse: 'joli',
		distracteurs: ['grand', 'lourd'],
	},
	{
		phrase: 'La souris cachée sous l’armoire est toute **petite**.',
		reponse: 'minuscule',
		distracteurs: ['rapide', 'grise'],
	},
	{
		phrase: 'L’éléphant que nous avons vu est très **gros**.',
		reponse: 'énorme',
		distracteurs: ['lent', 'gris'],
	},
	{
		phrase: 'Le clown du cirque est vraiment très **drôle**.',
		reponse: 'amusant',
		distracteurs: ['méchant', 'grand'],
	},
	{
		phrase: 'Notre nouvelle voisine est très **gentille**.',
		reponse: 'aimable',
		distracteurs: ['petite', 'pressée'],
	},
	{
		phrase: 'Après tout ce sport, je suis vraiment **fatigué**.',
		reponse: 'épuisé',
		distracteurs: ['content', 'propre'],
	},
	{
		phrase: 'Quand le bébé dort, la maison est très **calme**.',
		reponse: 'tranquille',
		distracteurs: ['propre', 'grande'],
	},
	{
		phrase: 'Cette énigme du livre est vraiment **difficile**.',
		reponse: 'compliquée',
		distracteurs: ['longue', 'amusante'],
	},
	{
		phrase: 'Ce petit exercice de calcul est très **facile**.',
		reponse: 'simple',
		distracteurs: ['long', 'utile'],
	},
	{
		phrase: 'Le savant du laboratoire est très **intelligent**.',
		reponse: 'malin',
		distracteurs: ['grand', 'calme'],
	},
	{
		phrase: 'Au matin, le spectacle va **commencer**.',
		reponse: 'débuter',
		distracteurs: ['tomber', 'briller'],
	},
	{
		phrase: 'Le dessin animé vient juste de se **terminer**.',
		reponse: 'finir',
		distracteurs: ['tomber', 'durer'],
	},
	{
		phrase: 'Le gardien réussit à **attraper** le ballon.',
		reponse: 'saisir',
		distracteurs: ['lancer', 'laver'],
	},
	{
		phrase: 'Le berger aime **regarder** les étoiles la nuit.',
		reponse: 'observer',
		distracteurs: ['compter', 'dessiner'],
	},
	{
		phrase: 'Dans la cour, les enfants aiment **crier**.',
		reponse: 'hurler',
		distracteurs: ['courir', 'sauter'],
	},
	{
		phrase: 'En classe, il ne faut pas trop **bavarder**.',
		reponse: 'discuter',
		distracteurs: ['dormir', 'écrire'],
	},
	{
		phrase: 'Le joueur va **jeter** le ballon très loin.',
		reponse: 'lancer',
		distracteurs: ['attraper', 'gonfler'],
	},
	{
		phrase: 'Le maçon va **fabriquer** un mur de briques.',
		reponse: 'construire',
		distracteurs: ['peindre', 'casser'],
	},
	{
		phrase: 'Pour son anniversaire, je veux lui **offrir** un livre.',
		reponse: 'donner',
		distracteurs: ['cacher', 'vendre'],
	},
	{
		phrase: 'Le garagiste va **réparer** la vieille voiture.',
		reponse: 'arranger',
		distracteurs: ['laver', 'conduire'],
	},
	{
		phrase: 'Mon meilleur **copain** s’appelle Tom.',
		reponse: 'ami',
		distracteurs: ['élève', 'maître'],
	},
	{
		phrase: 'Le grand **bateau** quitte lentement le port.',
		reponse: 'navire',
		distracteurs: ['camion', 'avion'],
	},
	{
		phrase: 'Le facteur arrive toujours à **vélo**.',
		reponse: 'bicyclette',
		distracteurs: ['scooter', 'voiture'],
	},
	{
		phrase: 'Quand on est malade, le **docteur** nous soigne.',
		reponse: 'médecin',
		distracteurs: ['facteur', 'boulanger'],
	},
	{
		phrase: 'Le coureur du stade est très **rapide**.',
		reponse: 'vif',
		distracteurs: ['grand', 'fort'],
	},
	{
		phrase: 'Le géant de l’histoire est vraiment **grand**.',
		reponse: 'immense',
		distracteurs: ['gentil', 'lent'],
	},
	{
		phrase: 'Le château fort du village est très **vieux**.',
		reponse: 'ancien',
		distracteurs: ['grand', 'sombre'],
	},
	{
		phrase: 'Ce problème de calcul est vraiment très **dur**.',
		reponse: 'difficile',
		distracteurs: ['long', 'propre'],
	},
	{
		phrase: 'Le gâteau au chocolat de mamie est **bon**.',
		reponse: 'délicieux',
		distracteurs: ['chaud', 'mou'],
	},
	{
		phrase: 'La sorcière du conte est vraiment très **laide**.',
		reponse: 'moche',
		distracteurs: ['petite', 'verte'],
	},
	{
		phrase: 'Le renard de la forêt est un animal très **malin**.',
		reponse: 'rusé',
		distracteurs: ['grand', 'roux'],
	},
	{
		phrase: 'Le gros gâteau d’anniversaire est vraiment **énorme**.',
		reponse: 'géant',
		distracteurs: ['chaud', 'rond'],
	},
	{
		phrase: 'Le vieux monsieur marche très **doucement**.',
		reponse: 'lentement',
		distracteurs: ['souvent', 'bien'],
	},
	{
		phrase: 'Le sportif du club est vraiment très **musclé**.',
		reponse: 'fort',
		distracteurs: ['rapide', 'calme'],
	},
	{
		phrase: 'Le spectacle nous a bien fait **rigoler**.',
		reponse: 'rire',
		distracteurs: ['pleurer', 'dormir'],
	},
	{
		phrase: 'Le voleur du film s’enfuit très **vite**.',
		reponse: 'rapidement',
		distracteurs: ['souvent', 'bien'],
	},
	{
		phrase: 'Ce matin, maman est vraiment très **joyeuse**.',
		reponse: 'gaie',
		distracteurs: ['fatiguée', 'pressée'],
	},
	{
		phrase: 'Après la pluie, le banc est encore tout **humide**.',
		reponse: 'mouillé',
		distracteurs: ['chaud', 'propre'],
	},
	{
		phrase: 'Le bébé panda du zoo est vraiment **adorable**.',
		reponse: 'mignon',
		distracteurs: ['rapide', 'gris'],
	},
	{
		phrase: 'La tarte aux pommes de mamie est **délicieuse**.',
		reponse: 'bonne',
		distracteurs: ['chaude', 'ronde'],
	},
	{
		phrase: 'Mon papa conduit une belle **voiture**.',
		reponse: 'automobile',
		distracteurs: ['moto', 'maison'],
	},
	{
		phrase: 'Mon vélo de course est encore tout **neuf**.',
		reponse: 'nouveau',
		distracteurs: ['cassé', 'rouge'],
	},
	{
		phrase: 'Le grand-père raconte une belle **histoire**.',
		reponse: 'récit',
		distracteurs: ['chanson', 'leçon'],
	},
	{
		phrase: 'Le voilier blanc navigue sur la **mer**.',
		reponse: 'océan',
		distracteurs: ['rivière', 'montagne'],
	},
	{
		phrase: 'Le camion roule sur une longue **route**.',
		reponse: 'chemin',
		distracteurs: ['maison', 'rivière'],
	},
	{
		phrase: 'Le chat gris dort sur le grand **canapé**.',
		reponse: 'sofa',
		distracteurs: ['tapis', 'fauteuil'],
	},
	{
		phrase: 'En hiver, je mets un gros **pull**.',
		reponse: 'chandail',
		distracteurs: ['chapeau', 'short'],
	},
	{
		phrase: 'Le vieux loup affamé est tout **maigre**.',
		reponse: 'mince',
		distracteurs: ['gris', 'lent'],
	},
	// ----- Ajouts #285 (variété) : synonymes francs CE2 ; distracteurs hors de la phrase. -----
	{
		phrase: 'À la récré, le garçon est **content**.',
		reponse: 'joyeux',
		distracteurs: ['fatigué', 'poli'],
	},
	{
		phrase: 'Quand on le dérange, papa est **fâché**.',
		reponse: 'mécontent',
		distracteurs: ['fatigué', 'poli'],
	},
	{
		phrase: 'Le lièvre file **rapidement**.',
		reponse: 'vite',
		distracteurs: ['souvent', 'bien'],
	},
	{
		phrase: 'Le coucher de soleil est très **joli**.',
		reponse: 'beau',
		distracteurs: ['grand', 'lourd'],
	},
	{
		phrase: 'Le petit renard est très **rusé**.',
		reponse: 'malin',
		distracteurs: ['roux', 'grand'],
	},
	{
		phrase: 'Après l’orage, la mer est **tranquille**.',
		reponse: 'calme',
		distracteurs: ['propre', 'grande'],
	},
	{
		phrase: 'Le coureur du marathon est très **mince**.',
		reponse: 'maigre',
		distracteurs: ['grand', 'blond'],
	},
	{
		phrase: 'Le film va bientôt **finir**.',
		reponse: 'terminer',
		distracteurs: ['tomber', 'briller'],
	},
];

/* ---------- Builder commun → item QCM ---------- */

/** Item QCM unifié (sérialisable, indépendant du rendu). */
export interface ItemSensQcm {
	question: string; // la phrase, mot-cible en **gras**
	reponse: string;
	distracteurs: string[];
	explication: string;
	consigne: string;
	picto: string;
	parle: string; // consigne (NOMMANT le mot-cible) + phrase « à plat » pour la lecture vocale
}

const RE_GRAS = /\*\*(.+?)\*\*/;

/** Mot-cible d'une phrase (le mot mis en **gras**). */
function cibleDe(phrase: string): string {
	return phrase.match(RE_GRAS)?.[1] ?? '';
}

/** Phrase « à plat » : on retire les marqueurs de gras pour la lecture vocale. */
function aPlat(phrase: string): string {
	return phrase.replace(/\*\*(.+?)\*\*/g, '$1');
}

const MODE_QCM: ModeOption[] = [
	{ id: 'qcm', label: 'Je choisis le bon mot', icon: 'check-circle', recommended: true },
];

interface SensConfig {
	consigne: string; // consigne AFFICHÉE (générique : le mot-cible est repéré par le gras)
	picto: string;
	explication: (cible: string, reponse: string) => string;
	// Consigne LUE : nomme le mot-cible, car le gras est invisible à l'oral (#42).
	parle: (cible: string, phrasePlate: string) => string;
}

const CONFIG_CONTRAIRES: SensConfig = {
	consigne: 'Quel mot veut dire le contraire ?',
	picto: '↔',
	explication: (cible, reponse) => `« ${cible} » veut dire le contraire de « ${reponse} ».`,
	parle: (cible, phrase) => `Quel mot veut dire le contraire de « ${cible} » ? ${phrase}`,
};

const CONFIG_SENS_PROCHE: SensConfig = {
	consigne: 'Quel mot veut dire presque la même chose ?',
	picto: '=',
	explication: (cible, reponse) =>
		`« ${cible} » veut dire presque la même chose que « ${reponse} ».`,
	parle: (cible, phrase) => `Quel mot veut dire presque la même chose que « ${cible} » ? ${phrase}`,
};

/** Transforme une entrée de banque en item QCM (avec consigne + picto + parlé). */
function toQcm(it: ItemSens, cfg: SensConfig): ItemSensQcm {
	const cible = cibleDe(it.phrase);
	return {
		question: it.phrase,
		reponse: it.reponse,
		distracteurs: [...it.distracteurs],
		explication: cfg.explication(cible, it.reponse),
		consigne: cfg.consigne,
		picto: cfg.picto,
		parle: cfg.parle(cible, aPlat(it.phrase)),
	};
}

export const ITEMS_CONTRAIRES: ItemSensQcm[] = CONTRAIRES.map((it) => toQcm(it, CONFIG_CONTRAIRES));
export const ITEMS_SENS_PROCHE: ItemSensQcm[] = SENS_PROCHE.map((it) =>
	toQcm(it, CONFIG_SENS_PROCHE),
);

function sensType(items: ItemSensQcm[]): ExerciseType {
	return {
		modes: MODE_QCM,
		generate(): Exercise {
			const it = choice(items);
			return {
				type: 'qcm',
				question: it.question,
				answer: it.reponse,
				choices: sample([it.reponse, ...it.distracteurs], 3),
				explication: it.explication,
				consigne: it.consigne,
				picto: it.picto,
				ttsItems: true,
				parle: it.parle,
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

export interface SensLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

/* Ordre pédagogique (#203) : les contraires AVANT les mots de sens proche. */
export const SENS_LESSONS: SensLessonDef[] = [
	{
		id: 'fr-vocab-contraires',
		label: 'Les contraires',
		exerciseType: sensType(ITEMS_CONTRAIRES),
	},
	{
		id: 'fr-vocab-sens-proche',
		label: 'Les mots de sens proche',
		exerciseType: sensType(ITEMS_SENS_PROCHE),
	},
];
