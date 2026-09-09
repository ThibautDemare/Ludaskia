/* ============================================================
   Définitions « enfant » — une par mot (#665).
   ------------------------------------------------------------
   La banque de définitions des mots croisés : à chaque mot du vivier
   jouable, UNE phrase qui désigne la chose, lisible par un CE2.

   Ce que ces phrases respectent, et pourquoi :
   - UNE seule proposition, un seul verbe conjugué — deux idées reliées
     par « et » donnent deux pistes à suivre en même temps ;
   - les mots qui définissent sont plus SIMPLES que le mot défini —
     définir un mot rare par un autre mot rare ne rend rien accessible ;
   - la définition désigne LA CHOSE, jamais un rapport à un autre mot
     (« un endroit sans arbres au milieu de la forêt » nomme un lieu,
     « le contraire de grand » ne nomme rien) ;
   - trois patrons stables, pour que l'enfant reconnaisse le type de
     question : « Un/Une X qui… » (objet, fonction), « Le/La X de Y »
     (partie, lieu), « Ce qu'on ressent quand… » (émotion). Les verbes
     du vivier prennent la forme infinitive (« Sauter dans l'eau… ») ;
   - jamais de définition en creux (« ce qui n'est pas… ») ;
   - chaque phrase porte un trait qui lui est RÉSERVÉ, pas seulement une
     catégorie : sans ça, deux mots de même longueur se disputent la
     même réponse et l'enfant a raison quand le jeu lui dit non ;
   - douze mots au plus, une seule phrase.

   Les règles de forme sont tenues par `tests/definitions-gate.test.ts`
   (longueur, phrase unique, mot de la famille, méta-langue, indices de
   forme, ponctuation, têtes catégorielles, doublons, couverture du
   vivier). Le reste — la justesse, la clarté pour un enfant de huit ans
   — reste du ressort de la relecture pédagogique.

   Deux sources, une seule vérité :
   - les mots déjà définis dans « Le mot juste » (`CHAMPS`) sont DÉRIVÉS
     de cette banque, jamais recopiés. L'enfant croise les mêmes mots
     dans la leçon puis dans la grille : deux formulations pour un mot,
     ce serait deux choses à retenir là où il n'y en a qu'une, et deux
     endroits à corriger ;
   - les autres sont écrits ici.

   Les mots du vivier qui ne DÉSIGNENT rien (mots-outils, auxiliaires,
   interjection) n'ont pas de définition possible : ils sont listés dans
   `MOTS_SANS_DEFINITION`, avec la raison, plutôt que passés sous
   silence. Un oubli et un refus motivé se ressembleraient sinon trait
   pour trait.

   Pur, sans DOM, sans effet de bord à l'import.
   ============================================================ */
import { CHAMPS } from './champs-lexicaux';

/** Un mot et sa définition « enfant ». */
export interface Definition {
	/** Minuscules, NFC, lettres seulement — une case porte une lettre. */
	mot: string;
	/** UNE phrase, majuscule initiale, point final. */
	def: string;
}

/** Un mot du vivier qu'on renonce à définir, et pourquoi. */
export interface MotSansDefinition {
	mot: string;
	/** La raison, en clair : elle se relit à côté de ce qu'elle justifie. */
	raison: string;
}

/* Même filtre que le vivier des mots à caser : une case porte une lettre, donc
   ni espace, ni apostrophe, ni trait d'union (« sous-bois » sort ici). */
const FORME_JOUABLE = /^[a-zà-öø-ÿœæ]+$/;

/* Les définitions déjà relues de « Le mot juste », dérivées telles quelles.
   Toutes passent les règles de forme du gate (mesuré sur les 72). Les mots
   au-delà de la tranche jouable (« clairière », « émerveillement »…) sont
   gardés : la banque a le droit d'aller plus loin que le vivier du jour. */
const DEFINITIONS_CHAMPS: readonly Definition[] = CHAMPS.flatMap((champ) =>
	champ.mots
		.map((m) => ({ mot: m.mot.toLowerCase().normalize('NFC'), def: m.def }))
		.filter((d) => FORME_JOUABLE.test(d.mot)),
);

/* Les mots que « Le mot juste » ne couvre pas, définis ici. Rangés par
   longueur : c'est entre mots de MÊME longueur que deux définitions trop
   proches se disputent une réponse, donc c'est là que le voisinage se relit. */
const DEFINITIONS_ECRITES: readonly Definition[] = [
	/* ---------- 4 lettres ---------- */
	{ mot: 'bras', def: 'Le membre du corps entre l’épaule et la main.' },
	{ mot: 'chef', def: 'La personne qui commande un groupe.' },
	{ mot: 'cité', def: 'Une ville ancienne entourée de grands murs.' },
	{ mot: 'clan', def: 'Un groupe de familles qui vivent ensemble.' },
	{ mot: 'côte', def: 'La bande de terre le long de la mer.' },
	{ mot: 'dire', def: 'Faire savoir quelque chose en parlant.' },
	{ mot: 'film', def: 'Une histoire en images qu’on regarde au cinéma.' },
	{ mot: 'jour', def: 'Le temps où il fait clair dehors.' },
	{ mot: 'lire', def: 'Comprendre les mots écrits dans un livre.' },
	{ mot: 'nuit', def: 'Le moment sombre où tout le monde dort.' },
	{ mot: 'paix', def: 'Le calme quand la guerre est finie.' },
	{ mot: 'plan', def: 'Un dessin qui montre une ville vue du dessus.' },
	{ mot: 'raid', def: 'Une attaque très rapide, menée par surprise.' },
	{ mot: 'rôle', def: 'Le personnage joué par un acteur.' },
	{ mot: 'sage', def: 'Un enfant tranquille qui obéit sans faire de bêtises.' },
	{ mot: 'salé', def: 'Le gout du sel sur la langue.' },
	{ mot: 'seul', def: 'Sans personne d’autre à côté de soi.' },
	{ mot: 'sort', def: 'Un pouvoir magique jeté par une sorcière.' },
	{ mot: 'vite', def: 'À toute allure, en très peu de temps.' },
	{ mot: 'voir', def: 'Se servir de ses yeux pour regarder autour de soi.' },

	/* ---------- 5 lettres ---------- */
	{ mot: 'aider', def: 'Donner un coup de main à quelqu’un.' },
	{ mot: 'aimer', def: 'Avoir un grand sentiment d’amour pour quelqu’un.' },
	{ mot: 'carte', def: 'Un papier qui montre les pays et les mers.' },
	{ mot: 'femme', def: 'Une grande personne qui était une petite fille avant.' },
	{ mot: 'force', def: 'Ce qu’il faut dans les bras pour soulever une pierre.' },
	{ mot: 'forêt', def: 'Un grand espace couvert d’arbres.' },
	{ mot: 'geler', def: 'Devenir dur comme de la glace à cause du froid.' },
	{ mot: 'jeune', def: 'Un enfant ou un animal né depuis peu de temps.' },
	{ mot: 'lever', def: 'Faire monter quelque chose vers le haut.' },
	{ mot: 'leçon', def: 'Ce que le maitre apprend aux élèves en classe.' },
	{ mot: 'libre', def: 'Une personne qui décide elle-même de sa vie.' },
	{ mot: 'matin', def: 'Le début de la journée, juste après le réveil.' },
	{ mot: 'mener', def: 'Conduire un groupe vers un endroit.' },
	{ mot: 'nager', def: 'Se déplacer dans l’eau en bougeant les bras.' },
	{ mot: 'nuage', def: 'Une masse blanche qui flotte dans le ciel.' },
	{ mot: 'orage', def: 'Un gros nuage noir qui lance des éclairs.' },
	{ mot: 'petit', def: 'Un objet minuscule qu’on peut tenir dans la main.' },
	{ mot: 'porte', def: 'Le panneau qu’on pousse pour entrer dans une pièce.' },
	{ mot: 'queue', def: 'La partie longue derrière un chien ou un chat.' },
	{ mot: 'reine', def: 'La femme du roi, qui règne sur un pays.' },
	{ mot: 'route', def: 'Le chemin large où roulent les voitures.' },
	{ mot: 'sucré', def: 'Le gout du miel ou du gâteau sur la langue.' },
	{ mot: 'tenir', def: 'Garder quelque chose dans sa main sans le lâcher.' },
	{ mot: 'vivre', def: 'Rester en vie pendant des années.' },
	{ mot: 'voler', def: 'Avancer dans le ciel en battant des ailes.' },
	{ mot: 'école', def: 'Le bâtiment où les enfants apprennent à lire.' },

	/* ---------- 6 lettres ---------- */
	{ mot: 'acteur', def: 'La personne qui joue dans un film.' },
	{ mot: 'bassin', def: 'Un grand creux rempli d’eau, dans un jardin.' },
	{ mot: 'bateau', def: 'Un objet flottant à voile ou à moteur, sur l’eau.' },
	{ mot: 'bondir', def: 'Sauter d’un coup, comme un chat surpris.' },
	{ mot: 'bonnet', def: 'Le chapeau de laine qui tient chaud aux oreilles.' },
	{ mot: 'brasse', def: 'La façon de nager en écartant les deux bras.' },
	{ mot: 'cacher', def: 'Mettre un objet là où personne ne le trouvera.' },
	{ mot: 'cahier', def: 'Un paquet de feuilles où l’élève écrit.' },
	{ mot: 'cheval', def: 'Un animal à quatre pattes qu’on monte pour galoper.' },
	{ mot: 'cinéma', def: 'La grande salle où l’on regarde des films sur un écran.' },
	{ mot: 'course', def: 'Le jeu où l’on court pour arriver le premier.' },
	{ mot: 'crayon', def: 'Le bâton de bois avec une mine pour écrire.' },
	{ mot: 'dictée', def: 'L’exercice où le maitre lit un texte à écrire.' },
	{ mot: 'flotte', def: 'Les navires du roi, réunis tous ensemble sur la mer.' },
	{ mot: 'gouter', def: 'Le petit repas de l’après-midi, après l’école.' },
	{ mot: 'grande', def: 'Une femme ou une fille très haute.' },
	{ mot: 'griffe', def: 'L’ongle pointu du chat ou de l’aigle.' },
	{ mot: 'guider', def: 'Montrer le chemin à quelqu’un qui se perd.' },
	{ mot: 'gâteau', def: 'Une pâtisserie sucrée qu’on partage à un anniversaire.' },
	{ mot: 'lettre', def: 'Un papier écrit qu’on met dans une enveloppe.' },
	{ mot: 'légume', def: 'La plante du potager qu’on mange à table.' },
	{ mot: 'marché', def: 'L’endroit en plein air où l’on achète des légumes.' },
	{ mot: 'museau', def: 'Le bout du nez allongé du chien.' },
	{ mot: 'naitre', def: 'Sortir du ventre de sa maman, pour un bébé.' },
	{ mot: 'navire', def: 'Un très grand bateau qui traverse les océans.' },
	{ mot: 'oiseau', def: 'L’animal à plumes qui pond des œufs.' },
	{ mot: 'parier', def: 'Jouer de l’argent en devinant qui va gagner.' },
	{ mot: 'pauvre', def: 'Une personne qui manque d’argent pour vivre.' },
	{ mot: 'peuple', def: 'Tous les habitants d’un même pays.' },
	{ mot: 'pêcher', def: 'Attraper des poissons avec une ligne.' },
	{ mot: 'racine', def: 'La partie de la plante cachée sous la terre.' },
	{ mot: 'ranger', def: 'Remettre chaque objet à sa place.' },
	{ mot: 'rapide', def: 'Un train qui avance à toute vitesse.' },
	{ mot: 'ronger', def: 'Grignoter avec ses dents, comme une souris.' },
	{ mot: 'savoir', def: 'Avoir dans sa tête une chose qu’on a apprise.' },
	{ mot: 'siècle', def: 'Une durée de cent années.' },
	{ mot: 'soldat', def: 'L’homme qui se bat dans une armée.' },
	{ mot: 'talent', def: 'Le don de savoir très bien faire quelque chose.' },
	{ mot: 'voyage', def: 'Un long déplacement vers un pays lointain.' },
	{ mot: 'yaourt', def: 'Un petit pot de lait épaissi qu’on mange froid.' },
	{ mot: 'écrire', def: 'Tracer des mots sur une feuille avec un stylo.' },
	{ mot: 'épaule', def: 'L’articulation entre le bras et le corps.' },

	/* ---------- 7 lettres ---------- */
	{ mot: 'article', def: 'Le texte d’un journaliste dans un journal.' },
	{ mot: 'avancer', def: 'Aller vers l’avant, pas après pas.' },
	{ mot: 'briller', def: 'Envoyer une lumière vive, comme le soleil.' },
	{ mot: 'chameau', def: 'L’animal du désert avec deux bosses sur le dos.' },
	{ mot: 'charité', def: 'Le geste de donner aux personnes qui ont faim.' },
	{ mot: 'courage', def: 'La force d’aller vers le danger sans trembler.' },
	{ mot: 'cuisine', def: 'La pièce de la maison où l’on prépare les repas.' },
	{ mot: 'dessert', def: 'Ce qu’on mange à la fin du repas, souvent sucré.' },
	{ mot: 'devenir', def: 'Changer peu à peu pour être autre chose.' },
	{ mot: 'diriger', def: 'Commander tout un groupe de personnes.' },
	{ mot: 'esclave', def: 'Une personne obligée de travailler sans être payée.' },
	{ mot: 'famille', def: 'Les parents et les enfants qui vivent ensemble.' },
	{ mot: 'feuille', def: 'La partie verte et plate d’une branche d’arbre.' },
	{ mot: 'flotter', def: 'Rester à la surface de l’eau sans couler.' },
	{ mot: 'fromage', def: 'Un aliment fait avec du lait de vache.' },
	{ mot: 'fugitif', def: 'Un prisonnier en fuite que les gardes recherchent.' },
	{ mot: 'glisser', def: 'Avancer tout seul sur la glace, sans marcher.' },
	{ mot: 'grimper', def: 'Monter tout en haut d’un arbre.' },
	{ mot: 'loyauté', def: 'La qualité de celui qui reste fidèle à ses amis.' },
	{ mot: 'maillot', def: 'Le vêtement moulant du sportif ou du nageur.' },
	{ mot: 'mouillé', def: 'Un manteau plein d’eau après une grosse averse.' },
	{ mot: 'médecin', def: 'La personne qui soigne les malades.' },
	{ mot: 'piscine', def: 'Le bassin d’eau où l’on apprend à nager.' },
	{ mot: 'plonger', def: 'Sauter dans l’eau la tête la première.' },
	{ mot: 'rempart', def: 'Le grand mur qui protège un château.' },
	{ mot: 'rivière', def: 'L’eau douce qui coule dans la campagne jusqu’au fleuve.' },
	{ mot: 'sauvage', def: 'Un animal qui vit dans la nature, loin des hommes.' },
	{ mot: 'soigner', def: 'Donner des médicaments à un malade pour le guérir.' },
	{ mot: 'soudain', def: 'Un bruit qui arrive tout d’un coup, sans prévenir.' },
	{ mot: 'souffle', def: 'L’air qui sort de la bouche quand on respire.' },
	{ mot: 'sportif', def: 'Un coureur ou un nageur qui s’entraine souvent.' },
	{ mot: 'tableau', def: 'Le panneau noir où le maitre écrit à la craie.' },
	{ mot: 'tempête', def: 'Un vent très violent qui casse les branches.' },
	{ mot: 'trouver', def: 'Mettre la main sur ce qu’on cherchait.' },
	{ mot: 'veiller', def: 'Rester éveillé la nuit pour surveiller.' },
	{ mot: 'visiter', def: 'Aller voir un endroit ou une personne.' },
	{ mot: 'énergie', def: 'La pleine forme qui permet de courir sans fatigue.' },
	{ mot: 'étudier', def: 'Apprendre ses leçons pour bien connaitre un sujet.' },

	/* ---------- 8 lettres ---------- */
	{ mot: 'ancienne', def: 'Une chose très vieille, qui date d’autrefois.' },
	{ mot: 'assiette', def: 'Le plat rond et creux où l’on mange.' },
	{ mot: 'attendre', def: 'Rester quelque part jusqu’à ce que quelqu’un arrive.' },
	{ mot: 'attentif', def: 'Un élève qui écoute bien sans se laisser distraire.' },
	{ mot: 'bannière', def: 'Le grand drapeau qu’on porte devant une armée.' },
	{ mot: 'cartable', def: 'Le sac où l’écolier range ses cahiers.' },
	{ mot: 'cavalier', def: 'La personne assise sur le dos d’un cheval.' },
	{ mot: 'chaussée', def: 'La partie de la rue où roulent les voitures.' },
	{ mot: 'cuisiner', def: 'Faire cuire des aliments pour un bon repas.' },
	{ mot: 'défendre', def: 'Protéger quelqu’un qui est attaqué.' },
	{ mot: 'déguster', def: 'Manger lentement pour bien sentir le gout.' },
	{ mot: 'ensemble', def: 'Tous les uns avec les autres, au même endroit.' },
	{ mot: 'entendre', def: 'Recevoir un bruit par les oreilles.' },
	{ mot: 'glissant', def: 'Un sol trempé où l’on tombe facilement.' },
	{ mot: 'guerrier', def: 'Le combattant d’autrefois, armé d’une épée.' },
	{ mot: 'habitant', def: 'Quelqu’un qui vit dans un village ou une ville.' },
	{ mot: 'hérisson', def: 'L’animal couvert de piquants qui se roule en boule.' },
	{ mot: 'naviguer', def: 'Conduire un bateau sur la mer.' },
	{ mot: 'négocier', def: 'Discuter longtemps pour se mettre d’accord.' },
	{ mot: 'obstacle', def: 'Une barrière qui empêche de passer.' },
	{ mot: 'papillon', def: 'L’insecte aux grandes ailes colorées.' },
	{ mot: 'partager', def: 'Couper en parts pour donner à chacun.' },
	{ mot: 'personne', def: 'Un homme, une femme ou un enfant.' },
	{ mot: 'pleuvoir', def: 'Tomber du ciel en gouttes d’eau.' },
	{ mot: 'plongeon', def: 'Le saut du nageur depuis le bord de la piscine.' },
	{ mot: 'pluvieux', def: 'Un temps gris où la pluie tombe souvent.' },
	{ mot: 'protéger', def: 'Mettre à l’abri du danger.' },
	{ mot: 'préparer', def: 'Tout mettre en place avant de commencer.' },
	{ mot: 'respirer', def: 'Faire entrer l’air dans ses poumons.' },
	{ mot: 'réaliser', def: 'Faire pour de vrai ce qu’on avait imaginé.' },
	{ mot: 'seigneur', def: 'Le maitre du château, autrefois.' },
	{ mot: 'souffler', def: 'Envoyer de l’air par la bouche sur les bougies.' },
	{ mot: 'échapper', def: 'Partir en courant pour ne pas être attrapé.' },
	{ mot: 'écureuil', def: 'Le petit animal roux qui grimpe aux arbres.' },
];

/** Toute la banque : les définitions déjà relues de « Le mot juste », puis
    celles écrites pour le vivier des grilles. */
export const DEFINITIONS: readonly Definition[] = [...DEFINITIONS_CHAMPS, ...DEFINITIONS_ECRITES];

/** Les mots du vivier qu'on renonce à définir, et la raison de chacun.

    Tous relèvent du même cas : ce sont des mots-outils, des auxiliaires ou une
    interjection. Ils ne DÉSIGNENT rien, donc aucune phrase ne peut les faire
    deviner sans parler de grammaire — ce que la définition d'une grille ne fait
    jamais. La liste est FERMÉE : un mot du vivier qui n'y figure pas doit avoir
    sa définition, et le gate refuse le silence. */
export const MOTS_SANS_DEFINITION: readonly MotSansDefinition[] = [
	{ mot: 'avec', raison: 'Mot de liaison, il relie deux mots sans désigner aucune chose.' },
	{ mot: 'dans', raison: 'Petit mot qui situe dans un lieu, il ne nomme rien par lui-même.' },
	{ mot: 'près', raison: 'Petit mot qui indique une distance, il ne nomme aucune chose.' },
	{ mot: 'très', raison: 'Petit mot qui renforce un adjectif, il ne nomme aucune chose.' },
	{ mot: 'être', raison: 'Verbe auxiliaire, il sert à conjuguer et ne décrit aucune action.' },
	{ mot: 'après', raison: 'Petit mot qui situe dans le temps, il ne nomme aucune chose.' },
	{ mot: 'autre', raison: 'Mot qui renvoie à quelque chose sans jamais dire quoi.' },
	{ mot: 'chaque', raison: 'Mot qui compte un par un, il ne désigne aucune chose.' },
	{ mot: 'contre', raison: 'Mot de liaison qui marque une position ou une opposition.' },
	{ mot: 'malgré', raison: 'Mot de liaison qui oppose deux idées, sans nommer de chose.' },
	{ mot: 'dehors', raison: 'Mot qui montre un endroit vague, sans désigner de lieu précis.' },
	{ mot: 'parfois', raison: 'Mot qui dit à quelle fréquence, il ne nomme aucune chose.' },
	{ mot: 'pendant', raison: 'Mot de liaison qui situe dans la durée, sans nommer de chose.' },
	{ mot: 'souvent', raison: 'Mot qui dit combien de fois une chose revient, sans la nommer.' },
	{ mot: 'beaucoup', raison: 'Mot qui dit une quantité, il ne désigne aucune chose.' },
	{ mot: 'miam', raison: 'Interjection lancée devant un bon plat, elle ne désigne rien.' },
];
