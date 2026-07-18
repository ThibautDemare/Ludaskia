/* ============================================================
   Grammaire — « Clique sur le verbe » (#259).
   ------------------------------------------------------------
   Nouvelle brique d'interaction « clique sur le mot » : l'enfant lit une phrase
   rendue MOT PAR MOT et sélectionne le(s) mot(s) répondant à la consigne. 1re
   leçon : le VERBE CONJUGUÉ.
   - Temps simples (présent / imparfait / futur) → cible = 1 mot.
   - Passé composé (auxiliaire + participe, CM1) → cible = 2 mots adjacents.

   Modèle de données : chaque phrase est AUTORÉE sous la forme (texte, verbe) puis
   `phrase()` la découpe en TOKENS (mots + ponctuation) et CALCULE l'ensemble des
   indices-cibles UNE FOIS À LA CONSTRUCTION de la banque. L'item généré porte ces
   indices STOCKÉS ; le runner (ui/lecon-clic-mot.ts) ne recalcule rien — il compare
   l'ensemble sélectionné à `cibleIndices` par égalité d'ensembles exacte.

   Garde-fous pédagogiques (relus ensuite par le rédacteur FR) :
   - UNE seule réponse indiscutable par phrase (jamais deux verbes conjugués, ni
     verbe pronominal, ni découpage discutable) → `phrase()` VÉRIFIE que la forme
     verbale apparaît exactement une fois (sinon erreur de construction) ;
   - position du verbe VARIÉE sur la banque (début en impératif, fin, milieu),
     longueur 6-10 mots, types déclaratif / interrogatif / impératif ;
   - CE2 : temps simples uniquement ; CM1 : les mêmes + passé composé, + sujet
     inversé (interrogative à inversion nominale, sans trait d'union) et complément
     circonstanciel en tête. Aucun temps non encore vu au niveau.
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts, ModeOption } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { choice } from '../../core/utils';
import type { LessonInput } from '../_shared';

/** Une phrase annotée prête à jouer. `tokens` = la phrase mot à mot (mots +
    ponctuation) ; `cibleIndices` = l'ensemble EXACT des indices formant le verbe
    conjugué (1 pour un temps simple, 2 pour le passé composé) ; `explication` =
    justification courte affichée après « Vérifier ». */
export interface PhraseClicMot {
	tokens: string[];
	cibleIndices: number[];
	explication: string;
}

/* Découpage : une suite de lettres/chiffres (avec apostrophe droite ou trait
   d'union internes : « l'oiseau », « grand-mère ») OU un signe de ponctuation
   isolé. L'apostrophe retenue est la DROITE (choix d'accessibilité clavier). */
const TOKEN_RE = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*|[.,;:!?…«»]/gu;
const PONCT_RE = /^[.,;:!?…«»]+$/u;
/* Ponctuation « haute » précédée d'une espace en typographie française. */
const PONCT_ESPACE_AVANT = new Set([';', ':', '!', '?']);

/** Un token est-il de la ponctuation (donc NON cliquable dans le runner) ? */
export function estPonctuation(token: string): boolean {
	return PONCT_RE.test(token);
}

/** Recompose la phrase lisible depuis ses tokens (colle la ponctuation au mot qui
    précède, espace française avant « ; : ! ? »). Sert au texte LU (TTS) et au repli
    non interactif (bilan/révision). */
export function joindrePhrase(tokens: string[]): string {
	let out = '';
	for (const t of tokens) {
		if (out === '') out = t;
		else if (estPonctuation(t)) out += (PONCT_ESPACE_AVANT.has(t) ? ' ' : '') + t;
		else out += ' ' + t;
	}
	return out;
}

function tokeniser(texte: string): string[] {
	return texte.match(TOKEN_RE) ?? [];
}

/* Toutes les positions de départ où la suite `motsVerbe` apparaît dans `tokens`
   (comparaison insensible à la casse — le verbe peut ouvrir la phrase en majuscule,
   ex. un impératif). Sert au garde-fou d'unicité. */
function positionsVerbe(tokens: string[], motsVerbe: string[]): number[] {
	const out: number[] = [];
	for (let i = 0; i + motsVerbe.length <= tokens.length; i++) {
		let ok = true;
		for (let k = 0; k < motsVerbe.length; k++) {
			if (tokens[i + k].toLowerCase() !== motsVerbe[k].toLowerCase()) {
				ok = false;
				break;
			}
		}
		if (ok) out.push(i);
	}
	return out;
}

/* Construit une phrase annotée depuis (texte, verbe). L'explication est dérivée du
   nombre de mots du verbe (1 → temps simple ; 2 → passé composé). Erreur de
   construction si le verbe ne se trouve PAS exactement une fois : garde-fou contre
   une cible ambiguë (deux occurrences) ou une faute de frappe (zéro). */
function phrase(texte: string, verbe: string): PhraseClicMot {
	const tokens = tokeniser(texte);
	const motsVerbe = tokeniser(verbe);
	const positions = positionsVerbe(tokens, motsVerbe);
	if (positions.length !== 1) {
		throw new Error(
			`grammaire-clic-mot : « ${verbe} » doit apparaître exactement une fois dans ` +
				`« ${texte} » (trouvé ${positions.length}×).`,
		);
	}
	const start = positions[0];
	const cibleIndices = motsVerbe.map((_, k) => start + k);
	const texteVerbe = cibleIndices.map((i) => tokens[i]).join(' ');
	const explication =
		cibleIndices.length > 1
			? `Le verbe conjugué est en deux mots : « ${texteVerbe} » (l'auxiliaire et le participe passé).`
			: `Le verbe, c'est le mot qui dit l'action ou l'état : ici « ${texteVerbe} ».`;
	return { tokens, cibleIndices, explication };
}

/* ---------- Banque CE2 : temps simples uniquement (cible = 1 mot) ----------
   Sujets variés (pronom, nom propre, GN simple), lexique CE2, position du verbe
   volontairement dispersée (impératif en tête, verbe en fin, etc.). */
export const PHRASES_CE2: PhraseClicMot[] = [
	// Présent
	phrase('Le chat dort tranquillement sur le canapé.', 'dort'),
	phrase('Les oiseaux chantent dans le grand jardin.', 'chantent'),
	phrase('Ma sœur dessine un joli bateau bleu.', 'dessine'),
	phrase('Le boulanger prépare de bons croissants chauds.', 'prépare'),
	phrase('Nous jouons au ballon dans la cour.', 'jouons'),
	phrase('Tu ranges tes affaires dans le tiroir.', 'ranges'),
	phrase('Le vent souffle très fort ce soir.', 'souffle'),
	phrase('Les élèves écoutent bien la maîtresse.', 'écoutent'),
	phrase('Papa lave la voiture devant la maison.', 'lave'),
	phrase('Le train arrive enfin à la gare.', 'arrive'),
	phrase('Mon petit frère pleure dans sa chambre.', 'pleure'),
	phrase('Le ciel est tout gris ce matin.', 'est'),
	phrase('La maîtresse écrit la date au tableau.', 'écrit'),
	phrase('Les poissons nagent dans le grand aquarium.', 'nagent'),
	phrase('Le facteur apporte une lettre très importante.', 'apporte'),
	phrase('Le chat du gardien miaule à la fenêtre.', 'miaule'),
	phrase('Le grand chien noir du voisin aboie.', 'aboie'),
	phrase('La petite fille aux cheveux blonds sourit.', 'sourit'),
	phrase('Chaque joueur de cette équipe court vite.', 'court'),
	// Imparfait
	phrase('Le petit garçon jouait dans le sable.', 'jouait'),
	phrase('Les enfants regardaient un beau film hier.', 'regardaient'),
	phrase('Grand-mère tricotait un pull bien chaud.', 'tricotait'),
	phrase('Le chien aboyait très fort hier soir.', 'aboyait'),
	phrase('Nous marchions vite vers la vieille école.', 'marchions'),
	phrase("Tu chantais une jolie chanson tout l'été.", 'chantais'),
	phrase('La rivière coulait au fond de la vallée.', 'coulait'),
	phrase('Le vieux marin racontait de belles histoires.', 'racontait'),
	// Futur
	phrase('Nous irons à la piscine demain matin.', 'irons'),
	phrase('Les grandes vacances commenceront dans deux jours.', 'commenceront'),
	phrase('Tu grandiras très vite cette année.', 'grandiras'),
	phrase('Le soleil brillera bientôt sur la plage.', 'brillera'),
	phrase('Mes amis viendront à mon anniversaire.', 'viendront'),
	phrase('Je finirai bientôt mon très beau dessin.', 'finirai'),
	phrase('Le fermier plantera des salades au printemps.', 'plantera'),
	phrase('Les feuilles tomberont bientôt des grands arbres.', 'tomberont'),
	// Impératif (verbe en tête)
	phrase('Range ta chambre avant le dîner.', 'Range'),
	phrase('Ferme doucement la porte du salon.', 'Ferme'),
	phrase('Écoute bien la consigne de la maîtresse.', 'Écoute'),
	phrase('Regarde ce magnifique château de sable.', 'Regarde'),
	phrase('Mange tes légumes avant le bon dessert.', 'Mange'),
	phrase("Prends ton manteau bleu dans l'armoire.", 'Prends'),
	phrase('Ouvre ton cahier à la bonne page.', 'Ouvre'),
	phrase('Ferme le robinet après le brossage des dents.', 'Ferme'),
	// Interrogative (intonation, ordre sujet-verbe)
	phrase('Tu pars en vacances la semaine prochaine ?', 'pars'),
	phrase('Vous aimez les fraises du jardin ?', 'aimez'),
	phrase('Le spectacle commence à quelle heure ?', 'commence'),
	phrase('Elle habite dans ce grand immeuble ?', 'habite'),
];

/* ---------- Banque CM1 : temps simples (revus) + passé composé + structures
   plus riches ----------
   La banque CM1 REPREND les phrases CE2 (temps simples, tous revus au CM1) et y
   AJOUTE : le passé composé (cible = 2 mots : auxiliaire + participe), l'inversion
   nominale du sujet (interrogative sans trait d'union) et le complément
   circonstanciel en tête (verbe rejeté plus loin). */
const CM1_EXTRAS: PhraseClicMot[] = [
	// Passé composé — cible = 2 mots (auxiliaire + participe, adjacents)
	phrase('Léa a mangé une pomme bien mûre.', 'a mangé'),
	phrase('Les enfants ont fini tous leurs devoirs.', 'ont fini'),
	phrase('Le chat a attrapé une petite souris grise.', 'a attrapé'),
	phrase('Nous avons visité un très beau château fort.', 'avons visité'),
	phrase('Tu as trouvé la bonne réponse tout seul.', 'as trouvé'),
	phrase('Elle est partie très tôt ce matin.', 'est partie'),
	phrase("Mon grand frère est tombé dans l'escalier.", 'est tombé'),
	phrase('Les oiseaux sont revenus au début du printemps.', 'sont revenus'),
	phrase('Le maître a expliqué la nouvelle leçon.', 'a expliqué'),
	phrase('Paul et Léa ont gagné le grand match.', 'ont gagné'),
	phrase('Le vent a cassé une grosse branche.', 'a cassé'),
	phrase('La cuisinière a préparé un très bon gâteau.', 'a préparé'),
	phrase('Les pompiers ont éteint le grand feu.', 'ont éteint'),
	// Interrogative à inversion nominale du sujet (verbe en position 1, sans trait d'union)
	phrase('Que mange le petit lapin gris ?', 'mange'),
	phrase('Où va ce train de marchandises ?', 'va'),
	phrase('Quand part le bus pour la ville ?', 'part'),
	phrase('Comment vont les enfants ce matin ?', 'vont'),
	phrase('Que dessine cette petite fille ?', 'dessine'),
	// Complément circonstanciel en tête (verbe rejeté plus loin dans la phrase)
	phrase('Chaque matin, le chat boit du lait.', 'boit'),
	phrase('Pendant les vacances, nous visiterons Paris.', 'visiterons'),
	phrase('Le soir, les étoiles brillent dans le ciel.', 'brillent'),
	phrase('Autrefois, les chevaliers portaient une lourde armure.', 'portaient'),
	phrase('Dès le matin, le coq chante très fort.', 'chante'),
	// Sujets plus étoffés (verbe au milieu / en fin)
	phrase("Les joueurs de l'équipe adverse courent très vite.", 'courent'),
	phrase('Mon oncle et ma tante habitent à Lyon.', 'habitent'),
	phrase('La lumière du vieux phare guidait les bateaux.', 'guidait'),
	phrase('Le champion de la course franchit la ligne.', 'franchit'),
];

export const PHRASES_CM1: PhraseClicMot[] = [...PHRASES_CE2, ...CM1_EXTRAS];

/* Consignes PERSISTANTES (affichées pendant toute la recherche). Au CM1, un
   micro-indice signale que le verbe peut être en plusieurs mots (passé composé). */
const CONSIGNE_CE2 = 'Clique sur le verbe conjugué de la phrase.';
const CONSIGNE_CM1 =
	'Clique sur le verbe conjugué. Au passé composé, il est en deux mots (exemple : a mangé) : clique sur les deux !';

/* Mode unique (comme l'appariement / le tri) : lancement direct du runner dédié,
   pas d'écran de choix de mode (#69). */
const MODE_CLIC: ModeOption[] = [{ id: 'clic', label: 'Clique sur le verbe', recommended: true }];

/* Fabrique de l'ExerciseType. `generate` se branche sur `opts.level` (banque CE2
   ou CM1) et STOCKE l'ensemble cible ; `check` renvoie toujours false (le runner
   ui/lecon-clic-mot.ts corrige lui-même par égalité d'ensembles). */
export function clicVerbeType(): ExerciseType {
	return {
		modes: MODE_CLIC,
		consigne: CONSIGNE_CE2,
		exerciseKind: 'clicMot',
		levels: ['ce2', 'cm1'],
		generate(opts?: GenerateOpts): Exercise {
			const niveau: SchoolLevel = opts?.level === 'cm1' ? 'cm1' : 'ce2';
			const banque = niveau === 'cm1' ? PHRASES_CM1 : PHRASES_CE2;
			const p = choice(banque);
			return {
				type: 'clicMot',
				tokens: [...p.tokens],
				cibleIndices: [...p.cibleIndices],
				consigne: niveau === 'cm1' ? CONSIGNE_CM1 : CONSIGNE_CE2,
				explication: p.explication,
				parle: joindrePhrase(p.tokens),
			};
		},
		check: () => false,
	};
}

export const CLIC_MOT_LESSONS: LessonInput[] = [
	{ id: 'fr-gram-clic-verbe', label: 'Clique sur le verbe', exerciseType: clicVerbeType() },
];
