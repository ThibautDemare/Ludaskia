/* ============================================================
   Vocabulaire — familles de mots, préfixes, suffixes (#113).
   ------------------------------------------------------------
   QCM de RECONNAISSANCE (3 options), trois types équilibrés :
   - familles : « De la même famille que « dent » : ? » → un mot de la
     famille, un FAUX-AMI plausible (dentelle), un mot sans rapport ;
   - préfixes : « « refaire » veut dire : ? » → le bon sens + 2 sens faux ;
   - suffixes : idem (« chanteur » → celui qui chante).

   Données par type (banques rédigées + relues par l'agent pédagogue) ;
   un builder unifie tout en items QCM { question, reponse, distracteurs,
   explication }. Tirage uniforme sur l'ensemble → couverture équilibrée.
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { choice, sample } from '../../core/utils';

/** Famille de mots : un mot de la famille, un faux-ami, un mot sans rapport. */
export interface ItemFamille {
	mot: string;
	famille: string; // vraiment de la même famille
	fauxAmi: string; // ressemble mais autre famille (piège)
	autre: string; // sans rapport
	explication: string;
}

/** Préfixe / suffixe : décoder le sens d'un mot affixé. */
export interface ItemAffixe {
	mot: string;
	sens: string; // sens correct
	distracteurs: [string, string]; // 2 sens faux mais plausibles
	explication: string;
}

export const FAMILLES: ItemFamille[] = [
	{
		mot: 'dent',
		famille: 'dentiste',
		fauxAmi: 'dentelle',
		autre: 'table',
		explication:
			'« dentiste » vient de « dent ». « dentelle » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'terre',
		famille: 'terrain',
		fauxAmi: 'terrible',
		autre: 'vélo',
		explication:
			'« terrain » vient de « terre ». « terrible » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'lait',
		famille: 'laitier',
		fauxAmi: 'laine',
		autre: 'chaise',
		explication:
			'« laitier » vient de « lait ». « laine » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'fleur',
		famille: 'fleuriste',
		fauxAmi: 'fleuve',
		autre: 'camion',
		explication:
			'« fleuriste » vient de « fleur ». « fleuve » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'chat',
		famille: 'chaton',
		fauxAmi: 'château',
		autre: 'livre',
		explication:
			'« chaton » vient de « chat ». « château » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'jour',
		famille: 'journée',
		fauxAmi: 'jouet',
		autre: 'pomme',
		explication:
			'« journée » vient de « jour ». « jouet » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'mer',
		famille: 'marin',
		fauxAmi: 'merci',
		autre: 'crayon',
		explication:
			'« marin » vient de « mer ». « merci » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'fort',
		famille: 'fortifier',
		fauxAmi: 'forêt',
		autre: 'banane',
		explication:
			'« fortifier » vient de « fort ». « forêt » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'chant',
		famille: 'chanteur',
		fauxAmi: 'champ',
		autre: 'fenêtre',
		explication:
			'« chanteur » vient de « chant ». « champ » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'grand',
		famille: 'grandir',
		fauxAmi: 'grange',
		autre: 'voiture',
		explication:
			'« grandir » vient de « grand ». « grange » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'ami',
		famille: 'amitié',
		fauxAmi: 'amande',
		autre: 'montre',
		explication:
			'« amitié » vient de « ami ». « amande » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'glace',
		famille: 'glacier',
		fauxAmi: 'glissade',
		autre: 'ballon',
		explication:
			'« glacier » vient de « glace ». « glissade » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'montagne',
		famille: 'montagnard',
		fauxAmi: 'montre',
		autre: 'cahier',
		explication:
			'« montagnard » vient de « montagne ». « montre » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'fer',
		famille: 'ferraille',
		fauxAmi: 'ferme',
		autre: 'nuage',
		explication:
			'« ferraille » vient de « fer ». « ferme » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'livre',
		famille: 'librairie',
		fauxAmi: 'livreur',
		autre: 'poire',
		explication:
			'« librairie » vient de « livre ». « livreur » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'chaud',
		famille: 'chaleur',
		fauxAmi: 'chausson',
		autre: 'bateau',
		explication:
			'« chaleur » vient de « chaud ». « chausson » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'froid',
		famille: 'refroidir',
		fauxAmi: 'fromage',
		autre: 'étoile',
		explication:
			'« refroidir » vient de « froid ». « fromage » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'nuit',
		famille: 'minuit',
		fauxAmi: 'nuisible',
		autre: 'chapeau',
		explication:
			'« minuit » vient de « nuit ». « nuisible » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'pied',
		famille: 'piéton',
		fauxAmi: 'pieuvre',
		autre: 'tasse',
		explication:
			'« piéton » vient de « pied ». « pieuvre » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'jardin',
		famille: 'jardinier',
		fauxAmi: 'jarre',
		autre: 'horloge',
		explication:
			'« jardinier » vient de « jardin ». « jarre » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'soleil',
		famille: 'ensoleillé',
		fauxAmi: 'soulier',
		autre: 'clé',
		explication:
			'« ensoleillé » vient de « soleil ». « soulier » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'poule',
		famille: 'poulailler',
		fauxAmi: 'poulie',
		autre: 'miroir',
		explication:
			'« poulailler » vient de « poule ». « poulie » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'bois',
		famille: 'boiserie',
		fauxAmi: 'boisson',
		autre: 'valise',
		explication:
			'« boiserie » vient de « bois ». « boisson » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'poire',
		famille: 'poirier',
		fauxAmi: 'poireau',
		autre: 'tambour',
		explication:
			'« poirier » vient de « poire ». « poireau » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'long',
		famille: 'longueur',
		fauxAmi: 'langue',
		autre: 'oreille',
		explication:
			'« longueur » vient de « long ». « langue » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'pêche',
		famille: 'pêcheur',
		fauxAmi: 'péché',
		autre: 'rideau',
		explication:
			'« pêcheur » vient de « pêche ». « péché » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'sel',
		famille: 'saler',
		fauxAmi: 'selle',
		autre: 'bougie',
		explication:
			'« saler » vient de « sel ». « selle » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'pomme',
		famille: 'pommier',
		fauxAmi: 'pompe',
		autre: 'échelle',
		explication:
			'« pommier » vient de « pomme ». « pompe » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'feuille',
		famille: 'feuillage',
		fauxAmi: 'feutre',
		autre: 'tracteur',
		explication:
			'« feuillage » vient de « feuille ». « feutre » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'vent',
		famille: 'ventilateur',
		fauxAmi: 'vente',
		autre: 'savon',
		explication:
			'« ventilateur » vient de « vent ». « vente » lui ressemble mais n’est pas de la même famille.',
	},
];

export const PREFIXES: ItemAffixe[] = [
	{
		mot: 'refaire',
		sens: 'faire à nouveau',
		distracteurs: ['faire très bien', 'faire à moitié'],
		explication: 'Le préfixe « re- » veut dire « à nouveau » : refaire = faire à nouveau.',
	},
	{
		mot: 'relire',
		sens: 'lire à nouveau',
		distracteurs: ['lire très vite', 'lire à voix haute'],
		explication: 'Le préfixe « re- » veut dire « à nouveau » : relire = lire à nouveau.',
	},
	{
		mot: 'recommencer',
		sens: 'commencer à nouveau',
		distracteurs: ['commencer plus tard', 'commencer tout seul'],
		explication: 'Le préfixe « re- » veut dire « à nouveau » : recommencer = commencer à nouveau.',
	},
	{
		mot: 'redire',
		sens: 'dire à nouveau',
		distracteurs: ['dire tout bas', 'dire un secret'],
		explication: 'Le préfixe « re- » veut dire « à nouveau » : redire = dire à nouveau.',
	},
	{
		mot: 'rejouer',
		sens: 'jouer à nouveau',
		distracteurs: ['jouer en équipe', 'jouer pour gagner'],
		explication: 'Le préfixe « re- » veut dire « à nouveau » : rejouer = jouer à nouveau.',
	},
	{
		mot: 'réécrire',
		sens: 'écrire à nouveau',
		distracteurs: ['écrire en grand', 'écrire vite'],
		explication: 'Le préfixe « ré- » veut dire « à nouveau » : réécrire = écrire à nouveau.',
	},
	{
		mot: 'défaire',
		sens: 'faire le contraire',
		distracteurs: ['faire en double', 'faire à la fin'],
		explication: 'Le préfixe « dé- » indique le contraire : défaire = faire le contraire de faire.',
	},
	{
		mot: 'déplier',
		sens: 'le contraire de plier',
		distracteurs: ['plier en deux', 'plier avec soin'],
		explication: 'Le préfixe « dé- » indique le contraire : déplier = ouvrir ce qui est plié.',
	},
	{
		mot: 'démonter',
		sens: 'le contraire de monter',
		distracteurs: ['monter très haut', 'monter très vite'],
		explication: 'Le préfixe « dé- » indique le contraire : démonter = défaire ce qui est monté.',
	},
	{
		mot: 'déboucher',
		sens: 'le contraire de boucher',
		distracteurs: ['boucher un trou', 'boucher très fort'],
		explication: 'Le préfixe « dé- » indique le contraire : déboucher = enlever ce qui bouche.',
	},
	{
		mot: 'décoller',
		sens: 'le contraire de coller',
		distracteurs: ['coller très fort', 'coller deux fois'],
		explication: 'Le préfixe « dé- » indique le contraire : décoller = enlever ce qui est collé.',
	},
	{
		mot: 'désobéir',
		sens: 'le contraire d’obéir',
		distracteurs: ['obéir tout de suite', 'obéir en silence'],
		explication: 'Le préfixe « dés- » indique le contraire : désobéir = ne pas obéir.',
	},
	{
		mot: 'désordre',
		sens: 'le contraire de l’ordre',
		distracteurs: ['beaucoup d’ordre', 'un ordre donné'],
		explication: 'Le préfixe « dés- » indique le contraire : désordre = absence d’ordre.',
	},
	{
		mot: 'impossible',
		sens: 'pas possible',
		distracteurs: ['très possible', 'presque possible'],
		explication: 'Le préfixe « im- » veut dire « pas » : impossible = pas possible.',
	},
	{
		mot: 'impoli',
		sens: 'pas poli',
		distracteurs: ['très poli', 'poli parfois'],
		explication: 'Le préfixe « im- » veut dire « pas » : impoli = pas poli.',
	},
	{
		mot: 'immobile',
		sens: 'qui ne bouge pas',
		distracteurs: ['qui bouge vite', 'qui bouge un peu'],
		explication: 'Le préfixe « im- » veut dire « pas » : immobile = qui ne bouge pas.',
	},
	{
		mot: 'incorrect',
		sens: 'pas correct',
		distracteurs: ['très correct', 'à moitié correct'],
		explication: 'Le préfixe « in- » veut dire « pas » : incorrect = pas correct.',
	},
	{
		mot: 'invisible',
		sens: 'pas visible',
		distracteurs: ['bien visible', 'visible la nuit'],
		explication: 'Le préfixe « in- » veut dire « pas » : invisible = qu’on ne peut pas voir.',
	},
	{
		mot: 'incomplet',
		sens: 'pas complet',
		distracteurs: ['bien complet', 'complet deux fois'],
		explication: 'Le préfixe « in- » veut dire « pas » : incomplet = pas complet.',
	},
	{
		mot: 'injuste',
		sens: 'pas juste',
		distracteurs: ['très juste', 'juste un peu'],
		explication: 'Le préfixe « in- » veut dire « pas » : injuste = pas juste.',
	},
	{
		mot: 'prévenir',
		sens: 'avertir avant',
		distracteurs: ['aider après', 'punir d’abord'],
		explication:
			'Le préfixe « pré- » veut dire « avant » : prévenir = avertir avant que ça arrive.',
	},
	{
		mot: 'préhistoire',
		sens: 'l’époque avant l’histoire',
		distracteurs: ['une très longue histoire', 'la fin de l’histoire'],
		explication:
			'Le préfixe « pré- » veut dire « avant » : préhistoire = le temps avant l’écriture de l’histoire.',
	},
	{
		mot: 'prévoir',
		sens: 'voir à l’avance',
		distracteurs: ['voir très loin', 'voir très bien'],
		explication:
			'Le préfixe « pré- » veut dire « avant » : prévoir = imaginer avant ce qui va arriver.',
	},
	{
		mot: 'préchauffer',
		sens: 'chauffer avant',
		distracteurs: ['chauffer très fort', 'chauffer trop'],
		explication:
			'Le préfixe « pré- » veut dire « avant » : préchauffer = chauffer le four avant de cuire.',
	},
	{
		mot: 'survoler',
		sens: 'voler au-dessus',
		distracteurs: ['voler très vite', 'voler très bas'],
		explication:
			'Le préfixe « sur- » veut dire « au-dessus » : survoler = voler au-dessus de quelque chose.',
	},
	{
		mot: 'surchargé',
		sens: 'trop chargé',
		distracteurs: ['pas assez chargé', 'chargé avec soin'],
		explication: 'Le préfixe « sur- » veut dire « trop » : surchargé = chargé plus que la normale.',
	},
	{
		mot: 'surélever',
		sens: 'élever au-dessus',
		distracteurs: ['baisser un peu', 'élever doucement'],
		explication: 'Le préfixe « sur- » veut dire « au-dessus » : surélever = placer plus haut.',
	},
	{
		mot: 'survêtement',
		sens: 'un vêtement qu’on met par-dessus',
		distracteurs: ['un vêtement chaud', 'un vêtement de dessous'],
		explication:
			'Le préfixe « sur- » veut dire « au-dessus » : un survêtement se met par-dessus les autres vêtements.',
	},
	{
		mot: 'sous-marin',
		sens: 'sous la mer',
		distracteurs: ['sur la mer', 'au bord de la mer'],
		explication: 'Le préfixe « sous- » veut dire « en dessous » : sous-marin = qui va sous la mer.',
	},
	{
		mot: 'souterrain',
		sens: 'sous la terre',
		distracteurs: ['sur la terre', 'au bout de la terre'],
		explication:
			'Le préfixe « sous- » veut dire « en dessous » : souterrain = qui se trouve sous la terre.',
	},
	{
		mot: 'sous-titre',
		sens: 'texte sous l’image',
		distracteurs: ['un grand titre', 'un titre en haut'],
		explication:
			'Le préfixe « sous- » veut dire « en dessous » : sous-titre = texte écrit sous les images d’un film.',
	},
	{
		mot: 'sous-sol',
		sens: 'étage sous le sol',
		distracteurs: ['le toit de la maison', 'le jardin de la maison'],
		explication:
			'Le préfixe « sous- » veut dire « en dessous » : sous-sol = la partie de la maison sous le rez-de-chaussée.',
	},
];

export const SUFFIXES: ItemAffixe[] = [
	{
		mot: 'chanteur',
		sens: 'celui qui chante',
		distracteurs: ['celui qui écoute', 'celui qui danse'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un chanteur, c’est celui qui chante.',
	},
	{
		mot: 'nageur',
		sens: 'celui qui nage',
		distracteurs: ['celui qui court', 'celui qui plonge'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un nageur, c’est celui qui nage.',
	},
	{
		mot: 'danseuse',
		sens: 'celle qui danse',
		distracteurs: ['celle qui chante', 'celle qui dort'],
		explication:
			'Le suffixe « -euse » désigne celle qui fait l’action : une danseuse, c’est celle qui danse.',
	},
	{
		mot: 'coiffeur',
		sens: 'celui qui coiffe',
		distracteurs: ['celui qui lave', 'celui qui peint'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un coiffeur, c’est celui qui coiffe les cheveux.',
	},
	{
		mot: 'vendeuse',
		sens: 'celle qui vend',
		distracteurs: ['celle qui achète', 'celle qui range'],
		explication:
			'Le suffixe « -euse » désigne celle qui fait l’action : une vendeuse, c’est celle qui vend.',
	},
	{
		mot: 'joueur',
		sens: 'celui qui joue',
		distracteurs: ['celui qui gagne', 'celui qui regarde'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un joueur, c’est celui qui joue.',
	},
	{
		mot: 'chasseur',
		sens: 'celui qui chasse',
		distracteurs: ['celui qui pêche', 'celui qui marche'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un chasseur, c’est celui qui chasse.',
	},
	{
		mot: 'menteuse',
		sens: 'celle qui ment',
		distracteurs: ['celle qui rit', 'celle qui pleure'],
		explication:
			'Le suffixe « -euse » désigne celle qui fait l’action : une menteuse, c’est celle qui ment.',
	},
	{
		mot: 'natation',
		sens: 'l’action de nager',
		distracteurs: ['l’action de courir', 'l’action de sauter'],
		explication: 'Le suffixe « -tion » désigne l’action : la natation, c’est l’action de nager.',
	},
	{
		mot: 'punition',
		sens: 'l’action de punir',
		distracteurs: ['l’action de récompenser', 'l’action de pardonner'],
		explication: 'Le suffixe « -tion » désigne l’action : une punition, c’est l’action de punir.',
	},
	{
		mot: 'décoration',
		sens: 'l’action de décorer',
		distracteurs: ['l’action de salir', 'l’action de casser'],
		explication:
			'Le suffixe « -tion » désigne l’action : la décoration, c’est l’action de décorer.',
	},
	{
		mot: 'plantation',
		sens: 'l’action de planter',
		distracteurs: ['l’action de couper', 'l’action d’arroser'],
		explication:
			'Le suffixe « -tion » désigne l’action : une plantation, c’est l’action de planter.',
	},
	{
		mot: 'addition',
		sens: 'l’action d’additionner',
		distracteurs: ['l’action de retirer', 'l’action de partager'],
		explication:
			'Le suffixe « -tion » désigne l’action : une addition, c’est l’action d’ajouter des nombres.',
	},
	{
		mot: 'division',
		sens: 'l’action de diviser',
		distracteurs: ['l’action de multiplier', 'l’action d’ajouter'],
		explication:
			'Le suffixe « -sion » désigne l’action : une division, c’est l’action de diviser, de partager.',
	},
	{
		mot: 'lentement',
		sens: 'd’une manière lente',
		distracteurs: ['d’une manière rapide', 'd’une manière forte'],
		explication: 'Le suffixe « -ment » indique la manière : lentement, c’est d’une manière lente.',
	},
	{
		mot: 'doucement',
		sens: 'd’une manière douce',
		distracteurs: ['d’une manière brutale', 'd’une manière bruyante'],
		explication: 'Le suffixe « -ment » indique la manière : doucement, c’est d’une manière douce.',
	},
	{
		mot: 'rapidement',
		sens: 'd’une manière rapide',
		distracteurs: ['d’une manière lente', 'd’une manière calme'],
		explication:
			'Le suffixe « -ment » indique la manière : rapidement, c’est d’une manière rapide.',
	},
	{
		mot: 'calmement',
		sens: 'd’une manière calme',
		distracteurs: ['d’une manière énervée', 'd’une manière rapide'],
		explication: 'Le suffixe « -ment » indique la manière : calmement, c’est d’une manière calme.',
	},
	{
		mot: 'poliment',
		sens: 'd’une manière polie',
		distracteurs: ['d’une manière méchante', 'd’une manière triste'],
		explication: 'Le suffixe « -ment » indique la manière : poliment, c’est d’une manière polie.',
	},
	{
		mot: 'tristement',
		sens: 'd’une manière triste',
		distracteurs: ['d’une manière joyeuse', 'd’une manière forte'],
		explication:
			'Le suffixe « -ment » indique la manière : tristement, c’est d’une manière triste.',
	},
	{
		mot: 'fortement',
		sens: 'd’une manière forte',
		distracteurs: ['d’une manière faible', 'd’une manière douce'],
		explication: 'Le suffixe « -ment » indique la manière : fortement, c’est d’une manière forte.',
	},
	{
		mot: 'lavable',
		sens: 'qu’on peut laver',
		distracteurs: ['qu’on peut manger', 'qu’on peut casser'],
		explication:
			'Le suffixe « -able » indique ce qui est possible : lavable, c’est qu’on peut laver.',
	},
	{
		mot: 'mangeable',
		sens: 'qu’on peut manger',
		distracteurs: ['qu’on peut boire', 'qu’on peut laver'],
		explication:
			'Le suffixe « -able » indique ce qui est possible : mangeable, c’est qu’on peut manger.',
	},
	{
		mot: 'buvable',
		sens: 'qu’on peut boire',
		distracteurs: ['qu’on peut manger', 'qu’on peut verser'],
		explication:
			'Le suffixe « -able » indique ce qui est possible : buvable, c’est qu’on peut boire.',
	},
	{
		mot: 'pliable',
		sens: 'qu’on peut plier',
		distracteurs: ['qu’on peut couper', 'qu’on peut peindre'],
		explication:
			'Le suffixe « -able » indique ce qui est possible : pliable, c’est qu’on peut plier.',
	},
	{
		mot: 'cassable',
		sens: 'qu’on peut casser',
		distracteurs: ['qu’on peut réparer', 'qu’on peut ranger'],
		explication:
			'Le suffixe « -able » indique ce qui est possible : cassable, c’est qu’on peut casser.',
	},
	{
		mot: 'lisible',
		sens: 'qu’on peut lire',
		distracteurs: ['qu’on peut écrire', 'qu’on peut effacer'],
		explication:
			'Le suffixe « -ible » indique ce qui est possible : lisible, c’est qu’on peut lire facilement.',
	},
	{
		mot: 'fillette',
		sens: 'une petite fille',
		distracteurs: ['une grande fille', 'une vieille dame'],
		explication:
			'Le suffixe « -ette » indique que c’est petit : une fillette, c’est une petite fille.',
	},
	{
		mot: 'maisonnette',
		sens: 'une petite maison',
		distracteurs: ['une grande maison', 'un grand immeuble'],
		explication:
			'Le suffixe « -ette » indique que c’est petit : une maisonnette, c’est une petite maison.',
	},
	{
		mot: 'camionnette',
		sens: 'un petit camion',
		distracteurs: ['un grand camion', 'une grosse voiture'],
		explication:
			'Le suffixe « -ette » indique que c’est petit : une camionnette, c’est un petit camion.',
	},
	{
		mot: 'tartelette',
		sens: 'une petite tarte',
		distracteurs: ['une grosse tarte', 'un gros gâteau'],
		explication:
			'Le suffixe « -ette » indique que c’est petit : une tartelette, c’est une petite tarte.',
	},
];

/** Item QCM unifié (3 options : 1 bonne + 2 distracteurs). */
export interface ItemVocabQcm {
	type: 'famille' | 'prefixe' | 'suffixe';
	question: string; // se termine par « : @ » (emplacement du champ en repli texte)
	reponse: string;
	distracteurs: string[];
	explication: string;
}

const itemsFamille = (): ItemVocabQcm[] =>
	FAMILLES.map((f) => ({
		type: 'famille' as const,
		question: `De la même famille que « ${f.mot} » : @`,
		reponse: f.famille,
		distracteurs: [f.fauxAmi, f.autre],
		explication: f.explication,
	}));

const itemsAffixe = (arr: ItemAffixe[], type: 'prefixe' | 'suffixe'): ItemVocabQcm[] =>
	arr.map((a) => ({
		type,
		question: `« ${a.mot} » veut dire : @`,
		reponse: a.sens,
		distracteurs: [...a.distracteurs],
		explication: a.explication,
	}));

export const ITEMS_FAMILLES: ItemVocabQcm[] = [
	...itemsFamille(),
	...itemsAffixe(PREFIXES, 'prefixe'),
	...itemsAffixe(SUFFIXES, 'suffixe'),
];

const MODE_QCM: ModeOption[] = [
	{ id: 'qcm', label: 'Je choisis la bonne réponse', icon: '✅', recommended: true },
];

export function famillesType(): ExerciseType {
	return {
		modes: MODE_QCM,
		generate(): Exercise {
			const it = choice(ITEMS_FAMILLES);
			return {
				type: 'qcm',
				question: it.question,
				answer: it.reponse,
				choices: sample([it.reponse, ...it.distracteurs], 3),
				explication: it.explication,
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

export interface FamillesLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

export const FAMILLES_LESSONS: FamillesLessonDef[] = [
	{
		id: 'fr-vocab-familles',
		label: 'Familles, préfixes et suffixes',
		exerciseType: famillesType(),
	},
];
