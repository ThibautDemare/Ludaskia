/* ============================================================
   Grammaire — « Clique sur le verbe » (#259) : banques CE2 + CM1 et sa fabrique.
   ------------------------------------------------------------
   Seule leçon de la famille dont la banque CM1 CONTIENT celle du CE2 (`PHRASES_CM1` =
   `PHRASES_CE2` + les phrases au passé composé) : la notion est la même d'une classe à
   l'autre, seule la forme du verbe s'étend. D'où sa fabrique dédiée `clicVerbeType`,
   antérieure à la fabrique générique `clicMotType` du moteur — les deux suivent le même
   patron de résolution par niveau (`closestSupported`).
   Moteur, garde-fous et vocabulaire partagé : `grammaire-clic-mot-moteur.ts`.
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { choice } from '../../core/utils';
import { closestSupported } from '../../core/levels';
import {
	MODE_CLIC,
	itemClicMot,
	phrase,
	type PhraseClicMot,
	type VarianteClicMot,
} from './grammaire-clic-mot-moteur';

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

/* Fabrique de la leçon « verbe ». `generate` se branche sur `opts.level` (banque CE2
   ou CM1) et STOCKE l'ensemble cible ; `check` renvoie toujours false (le runner
   ui/lecon-clic-mot.ts corrige lui-même par égalité d'ensembles). La consigne de FICHE
   (#42) est exposée sous sa forme FONCTION (#436) : c'est la MÊME variante qui alimente
   l'exercice joué et la fiche imprimée, sinon le CM1 lisait la consigne CE2 sur sa fiche. */
export function clicVerbeType(): ExerciseType {
	const niveaux: SchoolLevel[] = ['ce2', 'cm1'];
	const variante = (level?: SchoolLevel): VarianteClicMot => {
		// Niveau résolu par le MÉCANISME DU MOTEUR (`closestSupported` : niveau demandé,
		// sinon plus haut supporté en-dessous, sinon clamp) et non par un `=== 'cm1'` ad hoc.
		// Sans ça, un niveau non déclaré (CM2) recevrait le contenu CE2 pendant que
		// `labelLecon`/`effectiveLevel` résoudraient, eux, vers le CM1 : titre d'un niveau
		// au-dessus d'un contenu de l'autre.
		const niveau = closestSupported(niveaux, level ?? niveaux[0]);
		return niveau === 'cm1'
			? { banque: PHRASES_CM1, consigne: CONSIGNE_CM1, cibleLabel: 'le verbe conjugué' }
			: { banque: PHRASES_CE2, consigne: CONSIGNE_CE2, cibleLabel: 'le verbe conjugué' };
	};
	return {
		modes: MODE_CLIC,
		consigne: (level) => variante(level).consigne,
		exerciseKind: 'clicMot',
		levels: niveaux,
		generate(opts?: GenerateOpts): Exercise {
			const v = variante(opts?.level);
			return itemClicMot(choice(v.banque), v.consigne, v.cibleLabel);
		},
		check: () => false,
	};
}
