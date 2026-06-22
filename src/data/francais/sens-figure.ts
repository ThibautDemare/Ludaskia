/* ============================================================
   Vocabulaire — sens propre / sens figuré (#112).
   ------------------------------------------------------------
   QCM : une courte phrase + « Ici, « X » veut dire : ? » → 3 options.
   Une seule est correcte selon le contexte ; les deux sens (propre ET
   figuré) du mot sont toujours proposés, plus un distracteur plausible.

   Données structurées PAR MOT : chaque verbe porte ses 3 options fixes
   (propre / figuré / distracteur) ; seules les phrases varient (avec le
   sens employé). On garantit ainsi que les deux sens sont toujours dans
   les options, et on évite les clés erronées. Équilibre propre/figuré.
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { choice, sample } from '../../core/utils';

type Sens = 'propre' | 'figuré';

interface GroupeSens {
	propre: string; // sens propre (option)
	figure: string; // sens figuré (option)
	distracteur: string; // 3e option plausible mais fausse
	phrases: { phrase: string; mot: string; sens: Sens }[];
}

export const GROUPES_SENS: GroupeSens[] = [
	{
		propre: 'manger',
		figure: 'lire avec passion',
		distracteur: 'déchirer',
		phrases: [
			{ phrase: 'Le lion dévore sa proie.', mot: 'dévore', sens: 'propre' },
			{ phrase: 'Affamé, il dévore son sandwich.', mot: 'dévore', sens: 'propre' },
			{ phrase: 'Léa dévore son nouveau roman.', mot: 'dévore', sens: 'figuré' },
			{ phrase: 'Il dévore ses bandes dessinées.', mot: 'dévore', sens: 'figuré' },
		],
	},
	{
		propre: 'émettre de la lumière',
		figure: 'être très bon, réussir',
		distracteur: 'faire du bruit',
		phrases: [
			{ phrase: 'Les étoiles brillent dans le ciel.', mot: 'brillent', sens: 'propre' },
			{ phrase: 'Le soleil brille ce matin.', mot: 'brille', sens: 'propre' },
			{ phrase: 'Elle brille en mathématiques.', mot: 'brille', sens: 'figuré' },
			{ phrase: 'Cet élève brille par son intelligence.', mot: 'brille', sens: 'figuré' },
		],
	},
	{
		propre: 'devenir liquide',
		figure: 'se mettre à pleurer',
		distracteur: 'durcir',
		phrases: [
			{ phrase: 'La glace fond au soleil.', mot: 'fond', sens: 'propre' },
			{ phrase: 'Le beurre fond dans la poêle.', mot: 'fond', sens: 'propre' },
			{ phrase: 'Elle fond en larmes.', mot: 'fond', sens: 'figuré' },
			{ phrase: 'À cette nouvelle, il fond en larmes.', mot: 'fond', sens: 'figuré' },
		],
	},
	{
		propre: 'grignoter avec les dents',
		figure: 'tourmenter',
		distracteur: 'caresser',
		phrases: [
			{ phrase: 'Le chien ronge son os.', mot: 'ronge', sens: 'propre' },
			{ phrase: 'La souris ronge le carton.', mot: 'ronge', sens: 'propre' },
			{ phrase: 'Le souci le ronge.', mot: 'ronge', sens: 'figuré' },
			{ phrase: "L'inquiétude la ronge.", mot: 'ronge', sens: 'figuré' },
		],
	},
	{
		propre: 'être en feu',
		figure: 'avoir très envie',
		distracteur: 'mouiller',
		phrases: [
			{ phrase: 'Le feu brûle dans la cheminée.', mot: 'brûle', sens: 'propre' },
			{ phrase: 'Les bûches brûlent doucement.', mot: 'brûlent', sens: 'propre' },
			{ phrase: "Il brûle d'impatience.", mot: 'brûle', sens: 'figuré' },
			{ phrase: "Elle brûle d'envie de partir.", mot: 'brûle', sens: 'figuré' },
		],
	},
	{
		propre: "se déplacer dans l'eau",
		figure: 'ne rien comprendre',
		distracteur: 'courir vite',
		phrases: [
			{ phrase: 'Le poisson nage dans la rivière.', mot: 'nage', sens: 'propre' },
			{ phrase: 'Elle nage dans la piscine.', mot: 'nage', sens: 'propre' },
			{ phrase: 'En grammaire, je nage complètement.', mot: 'nage', sens: 'figuré' },
			{ phrase: 'Devant ce problème, il nage.', mot: 'nage', sens: 'figuré' },
		],
	},
	{
		propre: 'aller vers le haut',
		figure: 'augmenter',
		distracteur: 'tourner',
		phrases: [
			{ phrase: "Il monte l'escalier.", mot: 'monte', sens: 'propre' },
			{ phrase: 'Le chat monte sur le toit.', mot: 'monte', sens: 'propre' },
			{ phrase: 'Les prix montent.', mot: 'montent', sens: 'figuré' },
			{ phrase: 'La colère monte en lui.', mot: 'monte', sens: 'figuré' },
		],
	},
	{
		propre: 'exploser',
		figure: 'se manifester tout à coup',
		distracteur: 'se dégonfler',
		phrases: [
			{ phrase: 'Le ballon éclate avec un bruit sec.', mot: 'éclate', sens: 'propre' },
			{ phrase: 'Le pneu a éclaté sur la route.', mot: 'éclaté', sens: 'propre' },
			{ phrase: 'Les enfants éclatent de rire.', mot: 'éclatent', sens: 'figuré' },
			{ phrase: 'Sa joie éclate au grand jour.', mot: 'éclate', sens: 'figuré' },
		],
	},
	{
		propre: 'transformer en glace',
		figure: 'avoir très froid',
		distracteur: 'réchauffer',
		phrases: [
			{ phrase: "L'eau gèle en hiver.", mot: 'gèle', sens: 'propre' },
			{ phrase: 'Le lac a gelé cette nuit.', mot: 'gelé', sens: 'propre' },
			{ phrase: 'Ferme la fenêtre, je gèle !', mot: 'gèle', sens: 'figuré' },
			{ phrase: 'On gèle dehors ce matin.', mot: 'gèle', sens: 'figuré' },
		],
	},
	{
		propre: "monter en s'agrippant",
		figure: 'augmenter fortement',
		distracteur: 'glisser',
		phrases: [
			{ phrase: "Le singe grimpe à l'arbre.", mot: 'grimpe', sens: 'propre' },
			{ phrase: "Elle grimpe à l'échelle.", mot: 'grimpe', sens: 'propre' },
			{ phrase: 'Les prix grimpent en flèche.', mot: 'grimpent', sens: 'figuré' },
			{ phrase: 'La température grimpe vite.', mot: 'grimpe', sens: 'figuré' },
		],
	},
	{
		propre: 'saisir avec la main',
		figure: 'tomber malade',
		distracteur: 'jeter',
		phrases: [
			{ phrase: 'Il attrape le ballon.', mot: 'attrape', sens: 'propre' },
			{ phrase: 'Le chat attrape la souris.', mot: 'attrape', sens: 'propre' },
			{ phrase: 'Il a attrapé un gros rhume.', mot: 'attrapé', sens: 'figuré' },
			{ phrase: 'Couvre-toi ou tu vas attraper froid.', mot: 'attraper', sens: 'figuré' },
		],
	},
	{
		propre: 'éclater violemment',
		figure: 'se mettre très en colère',
		distracteur: 'rétrécir',
		phrases: [
			{ phrase: 'La bombe explose.', mot: 'explose', sens: 'propre' },
			{ phrase: 'Le pétard a explosé.', mot: 'explosé', sens: 'propre' },
			{ phrase: 'Le professeur explose de colère.', mot: 'explose', sens: 'figuré' },
			{ phrase: 'Il a explosé en entendant la nouvelle.', mot: 'explosé', sens: 'figuré' },
		],
	},
	{
		propre: 'faire descendre dans la gorge',
		figure: 'croire trop facilement',
		distracteur: 'recracher',
		phrases: [
			{ phrase: 'Il avale sa soupe.', mot: 'avale', sens: 'propre' },
			{ phrase: 'Avale ton médicament.', mot: 'Avale', sens: 'propre' },
			{ phrase: 'Il a avalé cette histoire sans broncher.', mot: 'avalé', sens: 'figuré' },
			{ phrase: "Elle avale tout ce qu'on lui raconte.", mot: 'avale', sens: 'figuré' },
		],
	},
	{
		propre: 'faire une chute',
		figure: 'changer d’état (devenir)',
		distracteur: "s'envoler",
		phrases: [
			{ phrase: 'Il tombe de vélo.', mot: 'tombe', sens: 'propre' },
			{ phrase: "La pomme tombe de l'arbre.", mot: 'tombe', sens: 'propre' },
			{ phrase: 'Elle est tombée malade.', mot: 'tombée', sens: 'figuré' },
			{ phrase: 'Il est tombé amoureux.', mot: 'tombé', sens: 'figuré' },
		],
	},
	{
		propre: 'se déplacer dans les airs',
		figure: 'passer très vite',
		distracteur: 'tomber',
		phrases: [
			{ phrase: "L'oiseau vole dans le ciel.", mot: 'vole', sens: 'propre' },
			{ phrase: "L'avion vole au-dessus des nuages.", mot: 'vole', sens: 'propre' },
			{ phrase: 'Pendant les vacances, le temps vole.', mot: 'vole', sens: 'figuré' },
			{ phrase: "L'après-midi a volé, déjà le soir !", mot: 'volé', sens: 'figuré' },
		],
	},
	{
		propre: "envoyer de l'air",
		figure: 'se reposer un instant',
		distracteur: 'crier',
		phrases: [
			{ phrase: 'Il souffle sur sa soupe chaude.', mot: 'souffle', sens: 'propre' },
			{ phrase: 'Le vent souffle fort.', mot: 'souffle', sens: 'propre' },
			{ phrase: 'Laisse-moi souffler un peu.', mot: 'souffler', sens: 'figuré' },
			{ phrase: "Après l'effort, on souffle cinq minutes.", mot: 'souffle', sens: 'figuré' },
		],
	},
	{
		propre: 'déplacer en appuyant',
		figure: 'encourager à faire',
		distracteur: 'soulever',
		phrases: [
			{ phrase: 'Il pousse la porte.', mot: 'pousse', sens: 'propre' },
			{ phrase: 'Elle pousse le chariot.', mot: 'pousse', sens: 'propre' },
			{ phrase: 'Ses parents le poussent à travailler.', mot: 'poussent', sens: 'figuré' },
			{ phrase: 'La curiosité me pousse à ouvrir la boîte.', mot: 'pousse', sens: 'figuré' },
		],
	},
	{
		propre: 'mesurer le poids',
		figure: 'être pénible à supporter',
		distracteur: 'mesurer la hauteur',
		phrases: [
			{ phrase: 'Le marchand pèse les pommes.', mot: 'pèse', sens: 'propre' },
			{ phrase: 'Je pèse mes bagages avant de partir.', mot: 'pèse', sens: 'propre' },
			{ phrase: 'La solitude lui pèse.', mot: 'pèse', sens: 'figuré' },
			{ phrase: 'Ce secret me pèse.', mot: 'pèse', sens: 'figuré' },
		],
	},
	// ----- Ajouts #285 (variété anti-répétition) : 8 verbes, sens propre/figuré CE2,
	// 2 phrases par sens (équilibre conservé). -----
	{
		propre: 'surveiller un lieu',
		figure: 'ne pas révéler (conserver)',
		distracteur: 'perdre',
		phrases: [
			{ phrase: 'Le chien garde la maison.', mot: 'garde', sens: 'propre' },
			{ phrase: 'Le berger garde ses moutons.', mot: 'garde', sens: 'propre' },
			{ phrase: 'Tu sais garder un secret.', mot: 'garder', sens: 'figuré' },
			{ phrase: 'Garde cette nouvelle pour toi.', mot: 'Garde', sens: 'figuré' },
		],
	},
	{
		propre: 'faire un bond',
		figure: "passer sans s'arrêter",
		distracteur: 'tomber',
		phrases: [
			{ phrase: 'Le kangourou saute très haut.', mot: 'saute', sens: 'propre' },
			{ phrase: 'Elle saute par-dessus la flaque.', mot: 'saute', sens: 'propre' },
			{ phrase: "J'ai sauté une ligne en lisant.", mot: 'sauté', sens: 'figuré' },
			{ phrase: 'Il a sauté le petit-déjeuner.', mot: 'sauté', sens: 'figuré' },
		],
	},
	{
		propre: 'trancher avec une lame',
		figure: 'interrompre',
		distracteur: 'coller',
		phrases: [
			{ phrase: 'Il coupe le pain.', mot: 'coupe', sens: 'propre' },
			{ phrase: 'Le coiffeur coupe les cheveux.', mot: 'coupe', sens: 'propre' },
			{ phrase: 'Ne coupe pas la parole.', mot: 'coupe', sens: 'figuré' },
			{ phrase: 'Elle me coupe quand je parle.', mot: 'coupe', sens: 'figuré' },
		],
	},
	{
		propre: 'percevoir une odeur',
		figure: 'deviner, pressentir',
		distracteur: 'toucher',
		phrases: [
			{ phrase: 'Je sens le parfum des roses.', mot: 'sens', sens: 'propre' },
			{ phrase: 'Le chien sent une piste.', mot: 'sent', sens: 'propre' },
			{ phrase: "Je sens qu'il va pleuvoir.", mot: 'sens', sens: 'figuré' },
			{ phrase: 'Elle sent un danger.', mot: 'sent', sens: 'figuré' },
		],
	},
	{
		propre: 'égarer un objet',
		figure: 'ne plus avoir (patience, courage)',
		distracteur: 'trouver',
		phrases: [
			{ phrase: "J'ai perdu ma gomme.", mot: 'perdu', sens: 'propre' },
			{ phrase: 'Il perd souvent ses clés.', mot: 'perd', sens: 'propre' },
			{ phrase: 'Ne perds pas patience.', mot: 'perds', sens: 'figuré' },
			{ phrase: 'Elle perd courage trop vite.', mot: 'perd', sens: 'figuré' },
		],
	},
	{
		propre: 'tenir et transporter',
		figure: 'apporter de la chance',
		distracteur: 'poser',
		phrases: [
			{ phrase: 'Il porte un gros sac.', mot: 'porte', sens: 'propre' },
			{ phrase: 'Elle porte le bébé.', mot: 'porte', sens: 'propre' },
			{ phrase: 'Ce trèfle porte chance.', mot: 'porte', sens: 'figuré' },
			{ phrase: 'On dit que le fer à cheval porte bonheur.', mot: 'porte', sens: 'figuré' },
		],
	},
	{
		propre: "aller d'un lieu à un autre",
		figure: "s'écouler (le temps)",
		distracteur: 'rester',
		phrases: [
			{ phrase: 'Le train passe sous le pont.', mot: 'passe', sens: 'propre' },
			{ phrase: 'Nous passons par la forêt.', mot: 'passons', sens: 'propre' },
			{ phrase: 'Les vacances passent trop vite.', mot: 'passent', sens: 'figuré' },
			{ phrase: 'Le temps passe doucement.', mot: 'passe', sens: 'figuré' },
		],
	},
	{
		propre: 'poursuivre pour attraper',
		figure: 'faire partir, éloigner',
		distracteur: 'nourrir',
		phrases: [
			{ phrase: 'Le lion chasse la gazelle.', mot: 'chasse', sens: 'propre' },
			{ phrase: 'Le chat chasse les souris.', mot: 'chasse', sens: 'propre' },
			{ phrase: 'Le vent chasse les nuages.', mot: 'chasse', sens: 'figuré' },
			{ phrase: 'Chasse cette mauvaise idée.', mot: 'Chasse', sens: 'figuré' },
		],
	},
];

const MODE_QCM: ModeOption[] = [
	{ id: 'qcm', label: 'Je choisis le bon sens', icon: 'check-circle', recommended: true },
];

export function sensFigureType(): ExerciseType {
	return {
		modes: MODE_QCM,
		generate(): Exercise {
			const g = choice(GROUPES_SENS);
			const ph = choice(g.phrases);
			const reponse = ph.sens === 'propre' ? g.propre : g.figure;
			return {
				type: 'qcm',
				question: `${ph.phrase} Ici, « ${ph.mot} » veut dire : @`,
				answer: reponse,
				choices: sample([g.propre, g.figure, g.distracteur], 3),
				explication: `Ici, « ${ph.mot} » est employé au sens ${ph.sens}.`,
				// Consigne d'action visible (#265) : cadre la tâche (choisir le sens du mot).
				// « Quel est le sens… » évite l'écho avec l'énoncé « … veut dire : @ ».
				consigne: 'Quel est le sens du mot dans cette phrase ?',
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

export interface SensFigureLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

export const SENS_FIGURE_LESSONS: SensFigureLessonDef[] = [
	{
		id: 'fr-vocab-sens',
		label: 'Sens propre / sens figuré',
		exerciseType: sensFigureType(),
	},
];
