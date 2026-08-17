/* ============================================================
   Vocabulaire — familles de mots, préfixes, suffixes (#113, #244).
   ------------------------------------------------------------
   QCM de RECONNAISSANCE (3 options), trois types équilibrés :
   - familles : « De la même famille que « dent » : ? » → un mot de la
     famille, un FAUX-AMI plausible (dentelle), un mot sans rapport ;
   - préfixes : « « refaire » veut dire : ? » → le bon sens + 2 sens faux ;
   - suffixes : idem (« chanteur » → celui qui chante).

   Données par type (banques rédigées + relues par l'agent pédagogue) ;
   un builder unifie tout en items QCM { question, reponse, distracteurs,
   explication }. Le moteur `famillesType(items)` reçoit un POOL d'items
   (#244) : la leçon CE2 lui passe l'ensemble familles + préfixes + suffixes
   (ITEMS_FAMILLES) ; les leçons CM1 passent des sous-pools dédiés. Tirage
   uniforme sur le pool reçu → couverture équilibrée.
   ============================================================ */
import type { SchoolLevel } from '../../core/catalog';
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { choice, sample } from '../../core/utils';
import { etayageRedige, MODE_QCM_CHECK } from '../_shared';
import type { LessonInput } from '../_shared';

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

/* Banque de familles CE2, découpée en deux blocs pour la LISIBILITÉ de l'historique
   seulement : `FAMILLES_ORIGINE` = les 30 familles d'origine, `FAMILLES_COMPLEMENT` =
   les 24 ajoutées par le correctif anti-répétition de « Familles de mots à relier »
   (#452). Depuis le rééquilibrage (#453) les DEUX blocs alimentent TOUTES les leçons de
   familles (QCM combiné comme appariement) : plus aucun sous-ensemble n'est réservé à
   une leçon. L'équilibre ~⅓ familles / ⅓ préfixes / ⅓ suffixes du pool QCM combiné est
   désormais tenu par la TAILLE des banques (54 familles, 55 préfixes, 54 suffixes), pas
   par un découpage de la banque de familles. */
const FAMILLES_ORIGINE: ItemFamille[] = [
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

/* Familles ajoutées par le correctif anti-répétition (#452), versées au pool QCM combiné
   depuis le rééquilibrage (#453) — voir le commentaire du bloc précédent. */
const FAMILLES_COMPLEMENT: ItemFamille[] = [
	{
		mot: 'porte',
		famille: 'portail',
		fauxAmi: 'portrait',
		autre: 'valise',
		explication:
			'« portail » vient de « porte ». « portrait » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'main',
		famille: 'manette',
		fauxAmi: 'mairie',
		autre: 'guitare',
		explication:
			'« manette » vient de « main ». « mairie » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'dos',
		famille: 'dossier',
		fauxAmi: 'dose',
		autre: 'échelle',
		explication:
			'« dossier » vient de « dos ». « dose » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'tête',
		famille: 'têtu',
		fauxAmi: 'tétine',
		autre: 'vélo',
		explication:
			'« têtu » vient de « tête ». « tétine » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'mur',
		famille: 'muraille',
		fauxAmi: 'mûre',
		autre: 'stylo',
		explication:
			'« muraille » vient de « mur ». « mûre » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'toit',
		famille: 'toiture',
		fauxAmi: 'toilette',
		autre: 'ballon',
		explication:
			'« toiture » vient de « toit ». « toilette » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'arbre',
		famille: 'arbuste',
		fauxAmi: 'arbitre',
		autre: 'télévision',
		explication:
			'« arbuste » vient de « arbre ». « arbitre » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'pluie',
		famille: 'pluvieux',
		fauxAmi: 'plume',
		autre: 'ordinateur',
		explication:
			'« pluvieux » vient de « pluie ». « plume » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'roue',
		famille: 'roulette',
		fauxAmi: 'route',
		autre: 'lampe',
		explication:
			'« roulette » vient de « roue ». « route » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'jeu',
		famille: 'jouet',
		fauxAmi: 'jeune',
		autre: 'parapluie',
		explication:
			'« jouet » vient de « jeu ». « jeune » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'loup',
		famille: 'louveteau',
		fauxAmi: 'loupe',
		autre: 'fusée',
		explication:
			'« louveteau » vient de « loup ». « loupe » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'papier',
		famille: 'papeterie',
		fauxAmi: 'papillon',
		autre: 'piano',
		explication:
			'« papeterie » vient de « papier ». « papillon » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'cheval',
		famille: 'chevalier',
		fauxAmi: 'cheveu',
		autre: 'robot',
		explication:
			'« chevalier » vient de « cheval ». « cheveu » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'poisson',
		famille: 'poissonnerie',
		fauxAmi: 'poison',
		autre: 'journal',
		explication:
			'« poissonnerie » vient de « poisson ». « poison » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'gomme',
		famille: 'gommer',
		fauxAmi: 'pomme',
		autre: 'cartable',
		explication:
			'« gommer » vient de « gomme ». « pomme » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'chien',
		famille: 'chiot',
		fauxAmi: 'chignon',
		autre: 'trompette',
		explication:
			'« chiot » vient de « chien ». « chignon » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'ventre',
		famille: 'ventru',
		fauxAmi: 'ventouse',
		autre: 'perroquet',
		explication:
			'« ventru » vient de « ventre ». « ventouse » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'vitre',
		famille: 'vitrine',
		fauxAmi: 'vitesse',
		autre: 'banane',
		explication:
			'« vitrine » vient de « vitre ». « vitesse » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'nuage',
		famille: 'nuageux',
		fauxAmi: 'nuisible',
		autre: 'raquette',
		explication:
			'« nuageux » vient de « nuage ». « nuisible » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'photo',
		famille: 'photographe',
		fauxAmi: 'phoque',
		autre: 'radio',
		explication:
			'« photographe » vient de « photo ». « phoque » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'rue',
		famille: 'ruelle',
		fauxAmi: 'ruche',
		autre: 'réveil',
		explication:
			'« ruelle » vient de « rue ». « ruche » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'fromage',
		famille: 'fromagerie',
		fauxAmi: 'froid',
		autre: 'ceinture',
		explication:
			'« fromagerie » vient de « fromage ». « froid » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'sable',
		famille: 'sablier',
		fauxAmi: 'sabre',
		autre: 'écharpe',
		explication:
			'« sablier » vient de « sable ». « sabre » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'rose',
		famille: 'rosier',
		fauxAmi: 'rosée',
		autre: 'chapeau',
		explication:
			'« rosier » vient de « rose ». « rosée » lui ressemble mais n’est pas de la même famille.',
	},
];

/* Banque complète (54) : familles d'origine + complément. Unique source des familles CE2,
   pour la leçon à relier (`appariementType(FAMILLES)`) COMME pour le pool QCM (#453). */
export const FAMILLES: ItemFamille[] = [...FAMILLES_ORIGINE, ...FAMILLES_COMPLEMENT];

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
		mot: 'revoir',
		sens: 'voir à nouveau',
		distracteurs: ['voir de loin', 'voir en cachette'],
		explication: 'Le préfixe « re- » veut dire « à nouveau » : revoir = voir à nouveau.',
	},
	{
		mot: 'reprendre',
		sens: 'prendre à nouveau',
		distracteurs: ['prendre trop', 'prendre en photo'],
		explication: 'Le préfixe « re- » veut dire « à nouveau » : reprendre = prendre à nouveau.',
	},
	{
		mot: 'rebrancher',
		sens: 'brancher à nouveau',
		distracteurs: ['brancher très fort', 'brancher au mauvais endroit'],
		explication:
			'Le préfixe « re- » veut dire « à nouveau » : rebrancher = brancher à nouveau ce qu’on avait débranché.',
	},
	{
		mot: 'remonter',
		sens: 'monter à nouveau',
		distracteurs: ['monter très haut', 'descendre lentement'],
		explication: 'Le préfixe « re- » veut dire « à nouveau » : remonter = monter à nouveau.',
	},
	{
		mot: 'redescendre',
		sens: 'descendre à nouveau',
		distracteurs: ['descendre très vite', 'monter à nouveau'],
		explication: 'Le préfixe « re- » veut dire « à nouveau » : redescendre = descendre à nouveau.',
	},
	{
		mot: 'recharger',
		sens: 'charger à nouveau',
		distracteurs: ['charger très lourd', 'décharger complètement'],
		explication:
			'Le préfixe « re- » veut dire « à nouveau » : recharger = charger à nouveau ce qui était déchargé.',
	},
	{
		mot: 'défaire',
		sens: 'le contraire de faire',
		distracteurs: ['faire en double', 'faire à la fin'],
		explication:
			'Le préfixe « dé- » indique le contraire : défaire un nœud = le contraire de faire un nœud.',
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
		mot: 'déballer',
		sens: 'le contraire d’emballer',
		distracteurs: ['emballer avec soin', 'emballer deux fois'],
		explication: 'Le préfixe « dé- » indique le contraire : déballer = ouvrir ce qui est emballé.',
	},
	{
		mot: 'décharger',
		sens: 'le contraire de charger',
		distracteurs: ['charger très vite', 'recharger à fond'],
		explication: 'Le préfixe « dé- » indique le contraire : décharger = enlever ce qui est chargé.',
	},
	{
		mot: 'déchausser',
		sens: 'le contraire de chausser',
		distracteurs: ['chausser trop grand', 'chausser très vite'],
		explication: 'Le préfixe « dé- » indique le contraire : déchausser = enlever ses chaussures.',
	},
	{
		mot: 'décrocher',
		sens: 'le contraire d’accrocher',
		distracteurs: ['accrocher très haut', 'accrocher deux fois'],
		explication:
			'Le préfixe « dé- » indique le contraire : décrocher = enlever ce qui est accroché.',
	},
	{
		mot: 'dégonfler',
		sens: 'le contraire de gonfler',
		distracteurs: ['gonfler très fort', 'gonfler à moitié'],
		explication:
			'Le préfixe « dé- » indique le contraire : dégonfler = enlever l’air de ce qui est gonflé.',
	},
	{
		mot: 'démêler',
		sens: 'le contraire d’emmêler',
		distracteurs: ['mêler deux couleurs', 'emmêler très fort'],
		explication: 'Le préfixe « dé- » indique le contraire : démêler = séparer ce qui est emmêlé.',
	},
	{
		mot: 'débrancher',
		sens: 'le contraire de brancher',
		distracteurs: ['brancher très fort', 'rebrancher aussitôt'],
		explication:
			'Le préfixe « dé- » indique le contraire : débrancher = enlever la prise de ce qui est branché.',
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
		mot: 'impatient',
		sens: 'pas patient',
		distracteurs: ['très patient', 'patient parfois'],
		explication: 'Le préfixe « im- » veut dire « pas » : impatient = pas patient.',
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
		distracteurs: ['bien complet', 'presque complet'],
		explication: 'Le préfixe « in- » veut dire « pas » : incomplet = pas complet.',
	},
	{
		mot: 'injuste',
		sens: 'pas juste',
		distracteurs: ['très juste', 'un peu juste'],
		explication: 'Le préfixe « in- » veut dire « pas » : injuste = pas juste.',
	},
	{
		mot: 'inutile',
		sens: 'pas utile',
		distracteurs: ['très utile', 'utile parfois'],
		explication: 'Le préfixe « in- » veut dire « pas » : inutile = pas utile.',
	},
	{
		mot: 'incapable',
		sens: 'pas capable',
		distracteurs: ['très capable', 'capable une fois'],
		explication: 'Le préfixe « in- » veut dire « pas » : incapable = pas capable.',
	},
	{
		mot: 'inconnu',
		sens: 'pas connu',
		distracteurs: ['très connu', 'connu de tous'],
		explication: 'Le préfixe « in- » veut dire « pas » : inconnu = pas connu.',
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
		mot: 'prénom',
		sens: 'le nom placé avant le nom de famille',
		distracteurs: ['un autre nom donné par des amis', 'le nom de famille lui-même'],
		explication:
			'Le préfixe « pré- » veut dire « avant » : prénom = le nom placé avant le nom de famille.',
	},
	{
		mot: 'prédire',
		sens: 'dire à l’avance',
		distracteurs: ['dire deux fois', 'dire tout bas'],
		explication:
			'Le préfixe « pré- » veut dire « avant » : prédire = dire à l’avance ce qui va arriver.',
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
		mot: 'surnom',
		sens: 'un autre nom en plus du vrai',
		distracteurs: ['le nom de famille', 'le prénom inscrit à la mairie'],
		explication:
			'Le préfixe « sur- » veut dire « en plus » : un surnom s’ajoute au vrai nom d’une personne.',
	},
	{
		mot: 'surligner',
		sens: 'passer de la couleur sur un mot',
		distracteurs: ['écrire par-dessus un mot', 'effacer un mot de la phrase'],
		explication:
			'Le préfixe « sur- » veut dire « au-dessus » : surligner = passer de la couleur par-dessus un mot.',
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
		// « texte sous l'image » se confondait avec une légende de photo : le sens dit
		// maintenant le film, et les distracteurs sont de longueur comparable.
		sens: 'texte écrit sous les images d’un film',
		distracteurs: ['titre écrit en haut de la page', 'grand titre au début du livre'],
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
	{
		mot: 'sous-vêtement',
		sens: 'un vêtement qu’on met sous les autres',
		distracteurs: ['un vêtement qu’on met par-dessus', 'un vêtement d’hiver'],
		explication:
			'Le préfixe « sous- » veut dire « en dessous » : un sous-vêtement se met sous les autres vêtements, à l’inverse d’un survêtement.',
	},
	{
		mot: 'souligner',
		sens: 'tracer un trait sous un mot',
		distracteurs: ['tracer un trait au-dessus d’un mot', 'entourer un mot'],
		explication:
			'Le préfixe « sous- » veut dire « en dessous » : souligner = tracer un trait sous un mot, à l’inverse de surligner.',
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
		mot: 'voleur',
		sens: 'celui qui prend sans permission',
		distracteurs: ['celui qui trouve un objet perdu', 'celui qui vend des objets'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un voleur, c’est celui qui vole.',
	},
	{
		mot: 'rêveur',
		sens: 'celui qui imagine',
		distracteurs: ['celui qui court', 'celui qui chante'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un rêveur, c’est celui qui rêve.',
	},
	{
		mot: 'coureur',
		sens: 'celui qui court',
		distracteurs: ['celui qui saute', 'celui qui marche'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un coureur, c’est celui qui court.',
	},
	{
		mot: 'sauteur',
		sens: 'celui qui saute',
		distracteurs: ['celui qui court', 'celui qui grimpe'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un sauteur, c’est celui qui saute.',
	},
	{
		mot: 'grimpeur',
		sens: 'celui qui grimpe',
		distracteurs: ['celui qui descend', 'celui qui glisse'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un grimpeur, c’est celui qui grimpe.',
	},
	{
		mot: 'skieur',
		sens: 'celui qui skie',
		distracteurs: ['celui qui nage', 'celui qui patine'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un skieur, c’est celui qui skie.',
	},
	{
		mot: 'patineur',
		sens: 'celui qui patine',
		distracteurs: ['celui qui skie', 'celui qui court'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un patineur, c’est celui qui patine.',
	},
	{
		mot: 'acheteur',
		sens: 'celui qui achète',
		distracteurs: ['celui qui vend', 'celui qui fabrique'],
		explication:
			'Le suffixe « -eur » désigne celui qui fait l’action : un acheteur, c’est celui qui achète.',
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
		// La réponse ne reprend PAS « additionner » : sinon l'enfant apparie les lettres du
		// mot interrogé au lieu de décoder le suffixe (cf. garde anti-fuite des tests).
		sens: 'l’action d’ajouter',
		distracteurs: ['l’action de retirer', 'l’action de partager'],
		explication:
			'Le suffixe « -tion » désigne l’action : une addition, c’est l’action d’ajouter des nombres.',
	},
	{
		mot: 'multiplication',
		sens: 'l’action de multiplier',
		distracteurs: ['l’action de diviser', 'l’action de soustraire'],
		explication:
			'Le suffixe « -tion » désigne l’action : une multiplication, c’est l’action de multiplier.',
	},
	{
		mot: 'soustraction',
		sens: 'l’action d’enlever',
		distracteurs: ['l’action d’additionner', 'l’action de multiplier'],
		explication:
			'Le suffixe « -tion » désigne l’action : une soustraction, c’est l’action de soustraire, d’enlever.',
	},
	{
		mot: 'correction',
		sens: 'l’action de corriger',
		distracteurs: ['l’action de recopier', 'l’action d’effacer'],
		explication:
			'Le suffixe « -tion » désigne l’action : une correction, c’est l’action de corriger.',
	},
	{
		mot: 'récitation',
		sens: 'l’action de réciter',
		distracteurs: ['l’action de lire', 'l’action d’écouter'],
		explication:
			'Le suffixe « -tion » désigne l’action : une récitation, c’est l’action de réciter.',
	},
	{
		mot: 'division',
		sens: 'l’action de diviser',
		distracteurs: ['l’action de multiplier', 'l’action d’ajouter'],
		explication:
			'Le suffixe « -sion » désigne l’action : une division, c’est l’action de diviser, de partager.',
	},
	{
		mot: 'description',
		sens: 'l’action de décrire quelque chose',
		distracteurs: ['l’action de dessiner', 'l’action de raconter une histoire'],
		explication:
			'Le suffixe « -tion » désigne l’action : une description, c’est l’action de décrire.',
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
		mot: 'joyeusement',
		sens: 'd’une manière joyeuse',
		distracteurs: ['d’une manière triste', 'd’une manière calme'],
		explication:
			'Le suffixe « -ment » indique la manière : joyeusement, c’est d’une manière joyeuse.',
	},
	{
		mot: 'simplement',
		sens: 'd’une manière simple',
		distracteurs: ['d’une manière compliquée', 'd’une manière rapide'],
		explication:
			'Le suffixe « -ment » indique la manière : simplement, c’est d’une manière simple.',
	},
	{
		mot: 'facilement',
		sens: 'd’une manière facile',
		distracteurs: ['d’une manière difficile', 'd’une manière lente'],
		explication:
			'Le suffixe « -ment » indique la manière : facilement, c’est d’une manière facile.',
	},
	{
		mot: 'franchement',
		sens: 'd’une manière franche',
		distracteurs: ['d’une manière timide', 'd’une manière moqueuse'],
		explication:
			'Le suffixe « -ment » indique la manière : franchement, c’est d’une manière franche.',
	},
	{
		mot: 'sérieusement',
		sens: 'd’une manière sérieuse',
		distracteurs: ['d’une manière amusante', 'd’une manière rapide'],
		explication:
			'Le suffixe « -ment » indique la manière : sérieusement, c’est d’une manière sérieuse.',
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
		mot: 'réparable',
		sens: 'qu’on peut réparer',
		distracteurs: ['qu’on peut jeter', 'qu’on peut casser'],
		explication:
			'Le suffixe « -able » indique ce qui est possible : réparable, c’est qu’on peut réparer.',
	},
	{
		mot: 'gonflable',
		sens: 'qu’on peut gonfler',
		distracteurs: ['qu’on peut plier', 'qu’on peut laver'],
		explication:
			'Le suffixe « -able » indique ce qui est possible : gonflable, c’est qu’on peut gonfler, comme une piscine gonflable.',
	},
	{
		mot: 'recyclable',
		sens: 'qu’on peut recycler',
		distracteurs: ['qu’on peut manger', 'qu’on peut jeter n’importe où'],
		explication:
			'Le suffixe « -able » indique ce qui est possible : recyclable, c’est qu’on peut recycler.',
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
	{
		mot: 'clochette',
		sens: 'une petite cloche',
		distracteurs: ['une grande cloche', 'un petit tambour'],
		explication:
			'Le suffixe « -ette » indique que c’est petit : une clochette, c’est une petite cloche.',
	},
	{
		mot: 'mallette',
		sens: 'une petite malle',
		distracteurs: ['une grande valise', 'un grand sac à dos'],
		explication:
			'Le suffixe « -ette » indique que c’est petit : une mallette, c’est une petite malle.',
	},
];

/* ============================================================
   Banques CM1 (#244) — ADDITIVES : le CE2 ci-dessus est GELÉ.
   Familles CM1 = dérivations un cran moins transparentes (préfixe/changement de
   radical) ; affixes CM1 = nouveaux préfixes savants (anti-, trans-, bi-, tri-,
   inter-, télé-) et suffixes nominaux (-age, -eur qualité, -iste, -ier, -itude).
   Aucune réponse/cible ne duplique exactement un item CE2 du même type (vérifié
   par les tests). Quelques cibles (terre, chant) sont réutilisées du CE2 mais avec
   un dérivé DIFFÉRENT — relation distincte, donc admise.
   ============================================================ */
export const FAMILLES_CM1: ItemFamille[] = [
	{
		mot: 'signe',
		famille: 'signaler',
		fauxAmi: 'singe',
		autre: 'bouton',
		explication:
			'« signaler » vient de « signe ». « singe » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'corps',
		famille: 'corporel',
		fauxAmi: 'corbeau',
		autre: 'lampe',
		explication:
			'« corporel » vient de « corps ». « corbeau » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'bras',
		famille: 'embrasser',
		fauxAmi: 'brasse',
		autre: 'soleil',
		explication:
			'« embrasser » vient de « bras ». « brasse » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'droit',
		famille: 'droiture',
		fauxAmi: 'drôle',
		autre: 'tapis',
		explication:
			'« droiture » vient de « droit ». « drôle » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'peur',
		famille: 'apeuré',
		fauxAmi: 'peu',
		autre: 'torchon',
		explication:
			'« apeuré » vient de « peur ». « peu » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'bouche',
		famille: 'embouchure',
		fauxAmi: 'boucher',
		autre: 'jardin',
		explication:
			'« embouchure » vient de « bouche ». « boucher » lui ressemble mais n’est pas de la même famille.',
	},
	{
		// Cible « terre » réutilisée du CE2 (terre→terrain) mais avec un dérivé différent : OK.
		mot: 'terre',
		famille: 'terrasse',
		fauxAmi: 'terrible',
		autre: 'sucre',
		explication:
			'« terrasse » vient de « terre ». « terrible » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'vie',
		famille: 'vivant',
		fauxAmi: 'vide',
		autre: 'tunnel',
		explication:
			'« vivant » vient de « vie ». « vide » lui ressemble mais n’est pas de la même famille.',
	},
	{
		// Cible « chant » réutilisée du CE2 (chant→chanteur) mais avec un dérivé différent : OK.
		mot: 'chant',
		famille: 'enchanter',
		fauxAmi: 'champ',
		autre: 'fenêtre',
		explication:
			'« enchanter » vient de « chant ». « champ » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'âge',
		famille: 'âgé',
		fauxAmi: 'auge',
		autre: 'rideau',
		explication:
			'« âgé » vient de « âge ». « auge » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'nombre',
		famille: 'nombreux',
		fauxAmi: 'ombre',
		autre: 'tambour',
		explication:
			'« nombreux » vient de « nombre ». « ombre » lui ressemble mais n’est pas de la même famille.',
	},
	{
		mot: 'bond',
		famille: 'bondir',
		fauxAmi: 'blond',
		autre: 'guitare',
		explication:
			'« bondir » vient de « bond ». « blond » lui ressemble mais n’est pas de la même famille.',
	},
];

/* Préfixes CM1 (#244) : préfixes savants nouveaux (anti-, para-, trans-, bi-, tri-, inter-, télé-). */
export const PREFIXES_CM1: ItemAffixe[] = [
	{
		mot: 'antidouleur',
		sens: 'contre la douleur',
		distracteurs: ['à cause de la douleur', 'avec beaucoup de douleur'],
		explication: 'Le préfixe « anti- » veut dire « contre » : antidouleur = contre la douleur.',
	},
	{
		mot: 'antiglisse',
		sens: 'contre le glissement',
		distracteurs: ['pour glisser plus vite', 'à cause du glissement'],
		explication: 'Le préfixe « anti- » veut dire « contre » : antiglisse = qui empêche de glisser.',
	},
	{
		mot: 'antigel',
		sens: 'contre le gel',
		distracteurs: ['qui produit le gel', 'qui fond le gel'],
		explication: 'Le préfixe « anti- » veut dire « contre » : antigel = qui protège contre le gel.',
	},
	{
		mot: 'transporter',
		sens: 'porter d’un endroit à un autre',
		distracteurs: ['porter très lourd', 'poser quelque chose'],
		explication:
			'Le préfixe « trans- » veut dire « d’un côté à l’autre » : transporter = porter d’un endroit à un autre.',
	},
	{
		mot: 'transpercer',
		sens: 'percer de part en part',
		distracteurs: ['percer un petit trou', 'boucher un trou'],
		explication:
			'Le préfixe « trans- » veut dire « à travers » : transpercer = percer de part en part.',
	},
	{
		mot: 'bicolore',
		sens: 'qui a deux couleurs',
		distracteurs: ['qui a beaucoup de couleurs', 'qui n’a pas de couleur'],
		explication: 'Le préfixe « bi- » veut dire « deux » : bicolore = qui a deux couleurs.',
	},
	{
		mot: 'bilingue',
		sens: 'qui parle deux langues',
		distracteurs: ['qui ne parle pas', 'qui parle très bien'],
		explication: 'Le préfixe « bi- » veut dire « deux » : bilingue = qui parle deux langues.',
	},
	{
		mot: 'tricolore',
		sens: 'qui a trois couleurs',
		distracteurs: ['qui a deux couleurs', 'qui a beaucoup de couleurs'],
		explication: 'Le préfixe « tri- » veut dire « trois » : tricolore = qui a trois couleurs.',
	},
	{
		mot: 'international',
		sens: 'entre plusieurs pays',
		distracteurs: ['dans un seul pays', 'loin de tous les pays'],
		explication:
			'Le préfixe « inter- » veut dire « entre » : international = entre plusieurs pays.',
	},
	{
		mot: 'interclasse',
		sens: 'entre les classes',
		distracteurs: ['dans une seule classe', 'avant la classe'],
		explication:
			'Le préfixe « inter- » veut dire « entre » : interclasse = le temps entre les classes.',
	},
	{
		mot: 'parapluie',
		sens: 'qui protège de la pluie',
		distracteurs: ['qui apporte la pluie', 'qui aime la pluie'],
		explication:
			'Le préfixe « para- » veut dire « protège de » : un parapluie protège de la pluie.',
	},
	{
		mot: 'télécommande',
		sens: 'commande à distance',
		distracteurs: ['commande très rapide', 'commande difficile à utiliser'],
		explication:
			'Le préfixe « télé- » veut dire « à distance » : télécommande = commande à distance.',
	},
	{
		mot: 'téléphone',
		sens: 'appareil pour parler à distance',
		distracteurs: ['appareil pour écrire', 'appareil pour écouter de la musique'],
		explication:
			'Le préfixe « télé- » veut dire « à distance » : téléphone = appareil pour parler à distance.',
	},
];

/* Suffixes CM1 (#244) : suffixes nominaux (-age, -eur qualité, -iste, -ier/-er, -itude).
   Distracteurs des items « -eur » DISTINCTS des « celui qui … » de la banque CE2
   (où « -eur » = l'agent) : ici « -eur » nomme une QUALITÉ, pas une personne. */
export const SUFFIXES_CM1: ItemAffixe[] = [
	{
		mot: 'lavage',
		sens: 'l’action de laver',
		distracteurs: ['l’endroit pour se laver', 'ce qui sert à laver'],
		explication: 'Le suffixe « -age » indique l’action : le lavage, c’est l’action de laver.',
	},
	{
		mot: 'passage',
		sens: 'l’action de passer',
		distracteurs: ['l’endroit pour dormir', 'l’action de rester'],
		explication:
			'Le suffixe « -age » indique l’action ou l’endroit : le passage, c’est l’action de passer.',
	},
	{
		mot: 'bricolage',
		sens: 'l’action de bricoler',
		distracteurs: ['l’action de construire une grande maison', 'l’action de réparer une voiture'],
		explication: 'Le suffixe « -age » indique l’action : le bricolage, c’est l’action de bricoler.',
	},
	{
		mot: 'grandeur',
		sens: 'la qualité de ce qui est grand',
		distracteurs: ['celui qui est grand', 'l’action de grandir'],
		explication:
			'Le suffixe « -eur » désigne ici une qualité : la grandeur, c’est la qualité de ce qui est grand.',
	},
	{
		mot: 'douceur',
		sens: 'la qualité de ce qui est doux',
		distracteurs: ['celui qui est doux', 'l’action d’adoucir'],
		explication:
			'Le suffixe « -eur » désigne ici une qualité : la douceur, c’est la qualité de ce qui est doux.',
	},
	{
		mot: 'fraîcheur',
		sens: 'la qualité de ce qui est frais',
		distracteurs: ['l’action de refroidir', 'celui qui a froid'],
		explication:
			'Le suffixe « -eur » désigne ici une qualité : la fraîcheur, c’est la qualité de ce qui est frais.',
	},
	{
		mot: 'cycliste',
		sens: 'celui qui fait du vélo',
		distracteurs: ['celui qui conduit une moto', 'celui qui court à pied'],
		explication:
			'Le suffixe « -iste » désigne celui qui pratique : un cycliste, c’est celui qui fait du vélo.',
	},
	{
		mot: 'pianiste',
		sens: 'celui qui joue du piano',
		distracteurs: ['celui qui construit des pianos', 'celui qui vend des instruments'],
		explication:
			'Le suffixe « -iste » désigne celui qui pratique : un pianiste, c’est celui qui joue du piano.',
	},
	{
		mot: 'cerisier',
		sens: 'l’arbre qui donne des cerises',
		distracteurs: ['celui qui vend des cerises', 'un panier pour les cerises'],
		explication:
			'Le suffixe « -ier » désigne souvent l’arbre : un cerisier, c’est l’arbre qui donne des cerises.',
	},
	{
		mot: 'oranger',
		sens: 'l’arbre qui donne des oranges',
		distracteurs: ['celui qui vend des oranges', 'un jus d’orange'],
		explication:
			'Le suffixe « -er » désigne souvent l’arbre : un oranger, c’est l’arbre qui donne des oranges.',
	},
	{
		mot: 'solitude',
		sens: 'l’état d’être seul',
		distracteurs: ['l’action d’aider les autres', 'le fait d’avoir beaucoup d’amis'],
		explication: 'Le suffixe « -itude » indique un état : la solitude, c’est l’état d’être seul.',
	},
	{
		mot: 'exactitude',
		sens: 'la qualité de ce qui est exact',
		distracteurs: ['l’action de se tromper', 'le fait d’être en retard'],
		explication:
			'Le suffixe « -itude » indique ici une qualité : l’exactitude, c’est la qualité de ce qui est exact.',
	},
];

/** Item QCM unifié (3 options : 1 bonne + 2 distracteurs). */
export interface ItemVocabQcm {
	type: 'famille' | 'prefixe' | 'suffixe';
	question: string; // se termine par « : @ » (emplacement du champ en repli texte)
	reponse: string;
	distracteurs: string[];
	explication: string;
	consigne: string; // consigne d'action visible (#265) ; varie selon la tâche (famille vs sens)
}

const itemsFamille = (arr: ItemFamille[]): ItemVocabQcm[] =>
	arr.map((f) => ({
		type: 'famille' as const,
		question: `De la même famille que « ${f.mot} » : @`,
		reponse: f.famille,
		distracteurs: [f.fauxAmi, f.autre],
		explication: f.explication,
		consigne: 'Quel mot est de la même famille ?',
	}));

const itemsAffixe = (arr: ItemAffixe[], type: 'prefixe' | 'suffixe'): ItemVocabQcm[] =>
	arr.map((a) => ({
		type,
		question: `« ${a.mot} » veut dire : @`,
		reponse: a.sens,
		distracteurs: [...a.distracteurs],
		explication: a.explication,
		consigne: 'Que veut dire ce mot ?',
	}));

/* Sous-pool : familles CE2 seules (pour une leçon « familles » dédiée). Bâti sur la banque
   COMPLÈTE (54) depuis le rééquilibrage (#453) : avec 55 préfixes et 54 suffixes, le pool
   QCM combiné reste à ~⅓ par type tout en couvrant toutes les familles. */
export const ITEMS_FAMILLES_SEULES: ItemVocabQcm[] = itemsFamille(FAMILLES);
/* Sous-pool : préfixes + suffixes CE2 (pour une leçon « affixes » dédiée). */
export const ITEMS_AFFIXES: ItemVocabQcm[] = [
	...itemsAffixe(PREFIXES, 'prefixe'),
	...itemsAffixe(SUFFIXES, 'suffixe'),
];

/* Pool CE2 historique (leçon unique) : familles + préfixes + suffixes mélangés. */
export const ITEMS_FAMILLES: ItemVocabQcm[] = [...ITEMS_FAMILLES_SEULES, ...ITEMS_AFFIXES];

/* Pools CM1 (#244) : une leçon « familles » et une leçon « préfixes et suffixes ». */
export const ITEMS_FAMILLES_CM1: ItemVocabQcm[] = itemsFamille(FAMILLES_CM1);
export const ITEMS_AFFIXES_CM1: ItemVocabQcm[] = [
	...itemsAffixe(PREFIXES_CM1, 'prefixe'),
	...itemsAffixe(SUFFIXES_CM1, 'suffixe'),
];

const MODE_QCM: ModeOption[] = [MODE_QCM_CHECK];

/* Moteur QCM de reconnaissance : tire uniformément dans le POOL d'items reçu (#244). */
export function famillesType(items: ItemVocabQcm[]): ExerciseType {
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
				consigne: it.consigne, // consigne d'action visible (#265)
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

/* ---------- Appariement (#392) : relier chaque mot de base à un dérivé ----------
   Nouveau format d'interaction « relier des paires » (lignes de liaison), tiré par
   la leçon « Familles de mots » validée avec le pédagogue (programme CE2 §4.2 :
   « Trier et apparier des mots et leurs dérivés »). Réutilise la banque FAMILLES :
   la paire est base ↔ dérivé (dent ↔ dentiste), les décoys sont les faux-amis
   (dentelle) — ils ressemblent à une base présente sans en être la famille, ce
   qui relance la distinction base/faux-ami et neutralise la réussite par
   élimination sur la dernière paire. */

/** Paires (base ↔ dérivé) et décoys (faux-amis) affichés par manche. Bornés pour
    limiter la charge cognitive et tenir en deux colonnes côte à côte sur mobile. */
const NB_PAIRES_APPARIEMENT = 4;
const NB_INTRUS_APPARIEMENT = 2;

const CONSIGNE_APPARIEMENT = 'Relie chaque mot à un mot de sa famille.';

/* Mode unique (comme le tri de champs lexicaux) : lancement direct du runner dédié,
   pas d'écran de choix de mode (#69). */
const MODE_RELIER: ModeOption[] = [{ id: 'relier', label: 'Relier les mots', recommended: true }];

/* Construit UNE manche d'appariement à partir de familles DÉJÀ retenues (bases et
   dérivés supposés deux à deux distincts). Ajoute jusqu'à NB_INTRUS faux-amis en
   décoys, en écartant toute collision d'affichage (le widget indexe par le TEXTE du
   mot : un doublon fausserait l'appariement). Un faux-ami n'est jamais une famille
   correcte (par construction de la banque) → jamais une bonne réponse. Pur, sans DOM. */
function construireMancheAppariement(choisis: ItemFamille[]): Exercise {
	const affiches = new Set<string>();
	for (const f of choisis) {
		affiches.add(f.mot);
		affiches.add(f.famille);
	}
	const paires = choisis.map((f) => ({ gauche: f.mot, droite: f.famille }));
	const intrus: string[] = [];
	for (const f of choisis) {
		if (intrus.length >= NB_INTRUS_APPARIEMENT) break;
		if (!affiches.has(f.fauxAmi)) {
			intrus.push(f.fauxAmi);
			affiches.add(f.fauxAmi);
		}
	}
	return { type: 'appariement', question: CONSIGNE_APPARIEMENT, paires, intrus };
}

/* Tire une SESSION d'appariement SANS RÉPÉTITION inter-manches (correctif des
   répétitions de « Familles de mots à relier »). Produit `nbManches` manches, chacune
   de NB_PAIRES paires (base ↔ dérivé) + NB_INTRUS faux-amis en décoys.

   INVARIANT : tant que `source` contient au moins `nbManches × NB_PAIRES` familles
   DISTINCTES (par leur base `mot`), aucune base n'apparaît dans plus d'une manche — les
   familles sont tirées SANS REMISE dans une file mélangée. Banque plus petite (cas
   générique futur) : la file est rechargée (nouvelle passe mélangée) une fois épuisée,
   ce qui étale les réapparitions au plus tard (une famille n'est réutilisée qu'après
   avoir consommé toute la banque) — dégradation propre, jamais de plantage.

   Fonction PURE (tout l'aléa passe par `sample`), testable sans DOM : c'est la surface
   que le test d'invariant doit appeler directement. */
export function tirerSessionAppariement(source: ItemFamille[], nbManches: number): Exercise[] {
	const manches: Exercise[] = [];
	let file: ItemFamille[] = []; // familles restant à tirer sans remise sur la passe courante
	for (let m = 0; m < nbManches; m++) {
		const choisis: ItemFamille[] = [];
		const affiches = new Set<string>(); // bases + dérivés retenus DANS cette manche
		// Garde-fou anti-boucle : au pire on réinspecte toute la banque une fois de plus
		// par paire manquante (si des familles restantes collisionnent dans la manche).
		let budget = source.length + nbManches * NB_PAIRES_APPARIEMENT;
		while (choisis.length < NB_PAIRES_APPARIEMENT && budget-- > 0) {
			if (file.length === 0) file = sample(source, source.length);
			if (file.length === 0) break; // source vide : rien à tirer
			const f = file.shift()!;
			// Écarte toute collision d'affichage INTRA-manche (base = base/dérivé déjà posé,
			// deux dérivés identiques…) : elle rendrait l'appariement ambigu.
			if (affiches.has(f.mot) || affiches.has(f.famille)) continue;
			affiches.add(f.mot);
			affiches.add(f.famille);
			choisis.push(f);
		}
		if (choisis.length === 0) break; // plus rien à produire
		manches.push(construireMancheAppariement(choisis));
	}
	return manches;
}

/* Moteur d'appariement (#392). Chaque manche tire NB_PAIRES familles DISTINCTES
   (base ↔ dérivé) + NB_INTRUS faux-amis en décoys. Tous les mots affichés d'une
   même manche (gauche, droite, décoys) sont DISTINCTS (unicité vérifiée) → aucune
   correspondance ambiguë. `generateSession` tire une session ENTIÈRE sans répétition
   inter-manches (le runner l'emprunte en priorité) ; `generate` reste le tirage d'UNE
   manche (repli et révision). `exerciseKind: 'appariement'` classe la leçon comme
   format à runner dédié (hors sprint) ; corrigé lien par lien par le runner
   (ui/lecon-appariement.ts), donc `check` renvoie toujours false ici. */
export function appariementType(source: ItemFamille[]): ExerciseType {
	return {
		modes: MODE_RELIER,
		consigne: CONSIGNE_APPARIEMENT,
		exerciseKind: 'appariement',
		generate(): Exercise {
			const [manche] = tirerSessionAppariement(source, 1);
			// Repli défensif si la banque est vide (jamais le cas des banques réelles).
			return (
				manche ?? { type: 'appariement', question: CONSIGNE_APPARIEMENT, paires: [], intrus: [] }
			);
		},
		generateSession(count: number): Exercise[] {
			return tirerSessionAppariement(source, count);
		},
		check: () => false,
	};
}

export interface FamillesLessonDef extends LessonInput {
	levels: SchoolLevel[];
}

/* ---------- Étayage de la notion (#490) ----------
   Quatre leçons, trois notions : la FAMILLE (le morceau commun et son piège, le
   faux-ami), l'AFFIXE (ce que le morceau ajouté apporte au mot de base), et le geste
   propre à l'appariement (relier, donc chercher dans une colonne).

   Ce que les panneaux d'affixes ne font PAS : donner la table des préfixes et des
   suffixes. Le sens de « re- » ou de « -eur » est justement ce que la question demande,
   et la banque est fermée : la liste vaudrait corrigé. Ils donnent le geste (retrouver
   le mot de base, mesurer ce que l'ajout change), qui est ce qui manque à l'enfant
   bloqué — il connaît le mot de base, il ne pense pas à l'isoler.

   ⚠ Les CATÉGORIES de sens citées en exemple sont celles de la banque que la leçon sert
   VRAIMENT, pas celles du français en général : au CM1 (`PREFIXES_CM1`/`SUFFIXES_CM1`)
   ce sont le lieu, la distance, le nombre, l'action, l'état — la répétition (« re- ») et
   la négation, elles, ne vivent que dans la banque CE2. Citer les mauvaises enverrait
   l'enfant chercher un sens qui ne sortira jamais dans cette leçon. */
const ETAYAGE_FAMILLES_CE2 = etayageRedige(
	'Familles, préfixes et suffixes',
	"Les mots d'une même famille partagent un morceau commun, qui porte leur sens.",
	[
		'Cherche le morceau qui revient dans les mots proposés.',
		'Vérifie le sens : deux mots peuvent se ressembler par hasard sans être de la même famille.',
		"Quand un morceau est ajouté devant ou derrière, demande-toi ce qu'il change au mot de base.",
	],
);

const ETAYAGE_FAMILLES_RELIER = etayageRedige(
	"Relier les mots d'une même famille",
	'Deux mots de la même famille ont un morceau commun ET une idée commune.',
	[
		'Prends un mot de gauche et repère son morceau commun.',
		'Cherche à droite le mot construit sur ce même morceau.',
		'Avant de relier, vérifie que les deux parlent bien de la même chose.',
	],
);

const ETAYAGE_FAMILLES_CM1 = etayageRedige(
	'Les familles de mots',
	"Les mots d'une même famille sont construits sur le même mot de base.",
	[
		'Repère le mot de base caché dans chaque proposition.',
		"Vérifie que le sens suit : la famille, ce n'est pas seulement la ressemblance.",
		'Écarte les mots qui se ressemblent par hasard.',
	],
);

const ETAYAGE_AFFIXES_CM1 = etayageRedige(
	'Préfixes et suffixes',
	'Un préfixe se colle devant le mot, un suffixe derrière : chacun en change le sens.',
	[
		'Retrouve le mot de base, sans le morceau ajouté.',
		'Demande-toi ce que ce morceau apporte : un lieu, une distance, un nombre, une action, un état…',
		"Choisis le sens qui garde l'idée du mot de base.",
	],
);

export const FAMILLES_LESSONS: FamillesLessonDef[] = [
	{
		id: 'fr-vocab-familles',
		label: 'Familles, préfixes et suffixes',
		levels: ['ce2'],
		exerciseType: famillesType(ITEMS_FAMILLES),
		etayage: [ETAYAGE_FAMILLES_CE2],
	},
	{
		// Appariement (#392) : relier chaque mot de base à son dérivé. Nouvelle leçon
		// CE2 portant le format « lignes de liaison » ; s'ajoute à la leçon QCM
		// ci-dessus (elle ne la remplace pas). Réutilise la banque FAMILLES (base,
		// dérivé, faux-ami en décoy).
		id: 'fr-vocab-familles-relier',
		label: 'Familles de mots à relier',
		levels: ['ce2'],
		exerciseType: appariementType(FAMILLES),
		etayage: [ETAYAGE_FAMILLES_RELIER],
	},
	{
		id: 'fr-vocab-familles-cm1',
		label: 'Familles de mots (CM1)',
		levels: ['cm1'],
		exerciseType: famillesType(ITEMS_FAMILLES_CM1),
		etayage: [ETAYAGE_FAMILLES_CM1],
	},
	{
		id: 'fr-vocab-affixes-cm1',
		label: 'Préfixes et suffixes (CM1)',
		levels: ['cm1'],
		exerciseType: famillesType(ITEMS_AFFIXES_CM1),
		etayage: [ETAYAGE_AFFIXES_CM1],
	},
];
