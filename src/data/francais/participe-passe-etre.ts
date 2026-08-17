/* ============================================================
   Orthographe grammaticale — accord du participe passé avec « être » (#205).
   ------------------------------------------------------------
   SENSIBILISATION CE2 (notion consolidée au cycle 3) PLUS l'attendu de fin
   de CE2 : savoir passer au féminin pluriel (il/elle → elles). Format
   « transformation guidée + QCM 3 options » : on montre une phrase au
   masculin (ou féminin) singulier, on affiche le NOUVEAU sujet, et l'enfant
   choisit la forme accordée du participe parmi 3 VRAIES formes du même verbe.

   Module DISTINCT de la conjugaison « passé composé » (francais/conjugaison.ts)
   qu'il ne touche pas. On n'utilise QUE l'auxiliaire « être » — jamais « avoir »,
   jamais de mélange.

   Quatre patrons de transformation, du plus simple au plus exigeant :
     1. il → elle   (genre)          parti → partie     [ms → fs]
     2. il → ils    (nombre)         parti → partis     [ms → mp]
     3. elle → elles (nombre)        partie → parties   [fs → fp]
     4. il → elles  (genre + nombre) parti → parties    [ms → fp]
   Les patrons 3 et 4 visent le féminin pluriel (attendu de fin de CE2). Le
   patron 4 change les DEUX dimensions : c'est volontaire (cf. PR #205, qui
   amende la borne « une seule variable » de l'issue d'origine).

   UX (#205) :
   - terminaison surlignée dans chaque option via `choicesView` (#200) :
     « part<span class="term">ie</span> » — focalise l'œil sur la marque ;
   - sujet cible en gras dans la phrase (`**…**`, rendu par `enonceTexte`) ;
   - 3 options EMPILÉES verticalement (`choicesEmpilees`) — les formes sont
     quasi-homophones (allé/allée/allés), une rangée serait piégeuse au doigt ;
   - PAS de TTS (`parle: ''`) : les formes sont homophones, l'écouter donnerait
     un indice trompeur ou nul.
   La leçon est signalée « plus difficile » dans la navigation (catalogue).
   ============================================================ */
import type { ChoiceView, Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { choice, escapeHTML, sample } from '../../core/utils';
import { etayageRedige, MODE_QCM_POINT } from '../_shared';
import type { LessonInput } from '../_shared';

/** Genre × nombre du participe. */
export type Forme = 'ms' | 'fs' | 'mp' | 'fp';

/** Un verbe se conjuguant avec « être » : radical commun du participe + les
    quatre terminaisons STOCKÉES (jamais déduites — principe du projet). La forme
    complète est `base + terminaisons[forme]` (ex. « part » + « ie » = « partie »). */
export interface VerbeEtre {
	infinitif: string;
	base: string;
	terminaisons: Record<Forme, string>;
	// Complément fixe optionnel (avis pedagogue-primaire) : seuls les verbes qui
	// sonnent tronqués sans complément en reçoivent un (ex. « aller » → « à l'école »).
	// Court, invariable, sans autre marque d'accord ; identique source et cible (décor
	// stable). Les autres verbes restent en phrase nue (charge de lecture minimale).
	complement?: string;
}

/* Verbes de mouvement/état au participe passé avec « être ».
   #285 (variété) : +6 verbes (revenir, repartir, retomber, monter, descendre, rentrer).

   DOCTRINE AFFINÉE (avis pedagogue-primaire, #285). « monter / descendre / sortir »
   avaient été écartés en #205 car ils prennent aussi « avoir » au sens transitif
   (« il a monté la valise »). Mais ce piège n'existe que si l'enfant CHOISIT
   l'auxiliaire. ICI « être » est IMPOSÉ par l'énoncé et la phrase reste SANS COD
   (« Il est monté. ») : seul l'accord du participe avec le sujet est en jeu — donc
   monter/descendre/rentrer sont SÛRS dans cette leçon. On garde en revanche fermés :
   - « sortir / passer / retourner » : emploi transitif « avoir » + COD ultra-fréquent
     à l'oral enfantin (« il a sorti le chien »), trop proche de la confusion ;
   - « devenir » : attribut variable (devenu grand → devenue grande), qui casserait
     l'invariant « complément invariable, identique source/cible » ;
   - « mourir » : thème inadapté à une répétition décontextualisée pour un enfant.

   La famille graphique « -é » domine (1er groupe + naître) ; « -i » (partir/repartir)
   et « -u » (venir/revenir/descendre) apportent la variété graphique. */
export const VERBES: VerbeEtre[] = [
	{
		infinitif: 'aller',
		base: 'all',
		terminaisons: { ms: 'é', fs: 'ée', mp: 'és', fp: 'ées' },
		complement: "à l'école", // « Il est allé. » sonne tronqué → on ancre un lieu familier
	},
	{ infinitif: 'partir', base: 'part', terminaisons: { ms: 'i', fs: 'ie', mp: 'is', fp: 'ies' } },
	{ infinitif: 'venir', base: 'ven', terminaisons: { ms: 'u', fs: 'ue', mp: 'us', fp: 'ues' } },
	{ infinitif: 'tomber', base: 'tomb', terminaisons: { ms: 'é', fs: 'ée', mp: 'és', fp: 'ées' } },
	{ infinitif: 'arriver', base: 'arriv', terminaisons: { ms: 'é', fs: 'ée', mp: 'és', fp: 'ées' } },
	{ infinitif: 'rester', base: 'rest', terminaisons: { ms: 'é', fs: 'ée', mp: 'és', fp: 'ées' } },
	{ infinitif: 'entrer', base: 'entr', terminaisons: { ms: 'é', fs: 'ée', mp: 'és', fp: 'ées' } },
	{ infinitif: 'naître', base: 'n', terminaisons: { ms: 'é', fs: 'ée', mp: 'és', fp: 'ées' } },
	// ----- Ajouts #285 : verbes toujours « être », complets sans complément. -----
	{ infinitif: 'revenir', base: 'reven', terminaisons: { ms: 'u', fs: 'ue', mp: 'us', fp: 'ues' } },
	{
		infinitif: 'repartir',
		base: 'repart',
		terminaisons: { ms: 'i', fs: 'ie', mp: 'is', fp: 'ies' },
	},
	{
		infinitif: 'retomber',
		base: 'retomb',
		terminaisons: { ms: 'é', fs: 'ée', mp: 'és', fp: 'ées' },
	},
	{ infinitif: 'monter', base: 'mont', terminaisons: { ms: 'é', fs: 'ée', mp: 'és', fp: 'ées' } },
	{
		infinitif: 'descendre',
		base: 'descend',
		terminaisons: { ms: 'u', fs: 'ue', mp: 'us', fp: 'ues' },
	},
	{ infinitif: 'rentrer', base: 'rentr', terminaisons: { ms: 'é', fs: 'ée', mp: 'és', fp: 'ées' } },
];

/* Patron de transformation : sujet source (singulier) → sujet cible. `options`
   liste les 3 formes proposées (la bonne incluse) : la forme de référence et les
   deux formes « à une marque près » (vraies confusions, jamais de forme inventée). */
interface Patron {
	id: string;
	sujetSource: string;
	auxSource: string;
	formeSource: Forme;
	sujetCible: string;
	auxCible: string;
	formeCible: Forme;
	options: Forme[];
}

const PATRONS: Patron[] = [
	{
		id: 'il-elle',
		sujetSource: 'Il',
		auxSource: 'est',
		formeSource: 'ms',
		sujetCible: 'Elle',
		auxCible: 'est',
		formeCible: 'fs',
		options: ['ms', 'fs', 'mp'],
	},
	{
		id: 'il-ils',
		sujetSource: 'Il',
		auxSource: 'est',
		formeSource: 'ms',
		sujetCible: 'Ils',
		auxCible: 'sont',
		formeCible: 'mp',
		options: ['ms', 'fs', 'mp'],
	},
	{
		id: 'elle-elles',
		sujetSource: 'Elle',
		auxSource: 'est',
		formeSource: 'fs',
		sujetCible: 'Elles',
		auxCible: 'sont',
		formeCible: 'fp',
		options: ['fs', 'mp', 'fp'],
	},
	{
		id: 'il-elles',
		sujetSource: 'Il',
		auxSource: 'est',
		formeSource: 'ms',
		sujetCible: 'Elles',
		auxCible: 'sont',
		formeCible: 'fp',
		options: ['fs', 'mp', 'fp'],
	},
];

/** Forme complète du participe pour un verbe et un genre/nombre. */
export const forme = (v: VerbeEtre, f: Forme): string => v.base + v.terminaisons[f];

/* Affichage riche d'une option (#200) : radical + terminaison SURLIGNÉE. On
   échappe chaque morceau (les balises injectées sont sûres) ; le libellé parlé
   reste la forme nue (lecteur d'écran). */
function vue(v: VerbeEtre, f: Forme): ChoiceView {
	return {
		html: `${escapeHTML(v.base)}<span class="term">${escapeHTML(v.terminaisons[f])}</span>`,
		label: forme(v, f),
	};
}

/* Explication affichée après la réponse, adaptée au patron (genre / nombre /
   les deux pour le féminin pluriel issu du masculin). */
function explicationPour(p: Patron, reponse: string): string {
	const base = "Avec « être », le participe passé s'accorde avec le sujet.";
	const sujet = `« ${p.sujetCible} »`;
	if (p.formeCible === 'fs')
		return `${base} Le sujet ${sujet} est féminin : le participe prend un -e → « ${reponse} ».`;
	if (p.formeCible === 'mp')
		return `${base} Le sujet ${sujet} est au pluriel : le participe prend un -s → « ${reponse} ».`;
	if (p.id === 'elle-elles')
		return `${base} Le sujet ${sujet} est au pluriel : le participe prend un -s → « ${reponse} ».`;
	return `${base} Le sujet ${sujet} est féminin et pluriel : le participe prend un -e et un -s → « ${reponse} ».`;
}

/* Un item « transformation guidée » : phrase source au masculin/féminin singulier,
   nouveau sujet (en gras) et trou `@` à compléter au QCM. */
function genItem(): Exercise {
	const v = choice(VERBES);
	const p = choice(PATRONS);
	const reponse = forme(v, p.formeCible);
	// 3 vraies formes du MÊME verbe (la bonne + 2 confusions), mélangées.
	const propositions = sample(
		p.options.map((f) => ({ valeur: forme(v, f), vue: vue(v, f) })),
		p.options.length,
	);
	// Complément fixe éventuel (ex. « à l'école »), identique des deux côtés de la flèche.
	const c = v.complement ? ` ${v.complement}` : '';
	return {
		type: 'qcm',
		question: `${p.sujetSource} ${p.auxSource} ${forme(v, p.formeSource)}${c}. → **${p.sujetCible}** ${p.auxCible} @${c}`,
		answer: reponse,
		choices: propositions.map((o) => o.valeur),
		choicesView: propositions.map((o) => o.vue),
		choicesEmpilees: true,
		explication: explicationPour(p, reponse),
		// Consigne d'action visible (#265) : l'énoncé « … → **Elle** est @ » est muet sur la tâche.
		// « la bonne fin du mot » colle à la terminaison surlignée (.term) des options.
		consigne: 'Choisis la bonne fin du mot.',
		// PAS de TTS : allé/allée/allés sont homophones → l'oral trahirait ou n'aiderait pas.
		// `parle: ''` ⇒ ttsAttr('') ne greffe aucun bouton « Écouter » (consigne incluse).
		parle: '',
	};
}

const MODE_QCM: ModeOption[] = [{ ...MODE_QCM_POINT, label: 'Je choisis la bonne forme' }];

function participeType(): ExerciseType {
	return { modes: MODE_QCM, generate: genItem, check: (ex, input) => checkAnswer(ex, input) };
}

export interface ParticipeLessonDef extends LessonInput {
	rubrique: string;
}

/* Leçon unique, rubrique « Les accords » (à côté des accords pluriel/féminin #109). */
/* ---------- Étayage de la notion (#490) ----------
   La méthode est une PROCÉDURE en trois temps (trouver le donneur d'accord, lire son
   genre et son nombre, reporter la marque), et c'est bien elle qu'il faut donner : la
   décrire n'est pas résoudre l'exercice tant que le panneau ne l'applique pas à la
   phrase affichée. La leçon est signalée « plus difficile » au catalogue, d'où une
   étape 3 qui NOMME les deux marques plutôt que de les supposer connues. */
const ETAYAGE_PARTICIPE_ETRE = etayageRedige(
	'Accorder le participe passé avec être',
	"Avec « être », le participe passé s'accorde avec le sujet, comme un adjectif.",
	[
		'Trouve le sujet de la phrase.',
		'Demande-toi : masculin ou féminin ? un seul ou plusieurs ?',
		'Reporte la marque sur le participe : e pour le féminin, s pour le pluriel, les deux ensemble si besoin.',
	],
);

export const PARTICIPE_LESSONS: ParticipeLessonDef[] = [
	{
		id: 'fr-accords-participe-etre',
		label: 'Le participe passé avec être',
		rubrique: 'Les accords',
		exerciseType: participeType(),
		etayage: [ETAYAGE_PARTICIPE_ETRE],
	},
];
