/* ============================================================
   Reprise des runners « une question à la fois » (#498).
   ------------------------------------------------------------
   La reprise historique (#63) photographie le DOM : elle ne marche que pour la
   fiche en saisie, dont l'état tient dans des champs remplis. Les runners, eux,
   gardent leur état en mémoire (questions tirées, index, score) et re-rendent
   l'écran à chaque question. Résultat : dix runners sans aucune reprise, où une
   leçon interrompue était perdue.

   On photographie donc l'ÉTAT LOGIQUE. Chaque runner déclare sa session au
   démarrage (`declarerSessionRunner`) en fournissant un accès à son état, et
   s'enregistre une fois pour toutes (`enregistrerRunner`) pour savoir se rejouer.
   Le reste — quand photographier, quand restaurer — est commun.

   MODULE FEUILLE, ET ÇA COMPTE. Il n'importe que du `core/` et un helper de
   visuels sans dépendance : aucun lien vers `navigation`, `resume` ou un runner.
   Les runners appellent `enregistrerRunner` AU NIVEAU DU MODULE, donc le registre
   doit être initialisé avant eux quel que soit le point d'entrée. Hébergé dans un
   module qui participe au cycle d'imports de l'UI (navigation ↔ runners ↔ resume),
   il se faisait dépasser par un runner à moitié initialisé : `ReferenceError:
   Cannot access 'registre' before initialization`, écran blanc au démarrage. Une
   feuille n'a personne devant elle. ⚠️ Ne pas y ajouter d'import applicatif.
   ============================================================ */
import { leconKey, removeResume, RESUME_VERSION } from '../core/resume';
import type { ResumeRunner } from '../core/resume';
import type { LessonDef } from '../core/catalog';
import { labelLecon } from '../core/levels';
import { niveauLecon } from '../core/niveau-actif';
import { subjectIcon } from './cat-visuals';
import { revivreFragments } from '../core/html';

/** Ce qu'un runner doit dire de lui-même pour devenir reprenable. La leçon est passée
    entière : libellé, icône et catégorie de la carte « À continuer » s'en déduisent ici,
    plutôt que d'être recopiés dans les dix runners. `etat` est relu au moment de la photo
    (et non copié à la déclaration) : c'est ce qui permet de capturer la progression réelle
    à l'instant où l'enfant quitte l'écran. */
export interface SessionRunner {
	runner: string; // nom stable, clé du registre de restauration
	lesson: LessonDef;
	exerciseMode: string | null; // mode retenu (#69) ; null pour un type mono-mode
	etat: () => { questions: unknown[]; idx: number; score: number };
}

let sessionCourante: SessionRunner | null = null;

/** Déclare le runner en cours : c'est lui que `captureResume` photographiera si l'enfant
    quitte l'écran. À appeler au démarrage, lancement neuf comme reprise. */
export function declarerSessionRunner(s: SessionRunner): void {
	sessionCourante = s;
}

/** L'enfant QUITTE l'écran du runner : plus de session en cours, mais l'instantané reste
    disponible pour « À continuer ».

    Sans cette clôture, l'état de module du runner (questions, index, score) survivait à la
    sortie d'écran et `captureResume`, qui interroge le runner en premier, rephotographiait
    indéfiniment une session morte : l'exercice suivant — une fiche en saisie, par exemple —
    n'était alors plus jamais sauvegardé, et la carte du runner périmé remontait en tête de
    liste à chaque capture. Appelée par `resetSessionUI`, juste après la photo. */
export function quitterSessionRunner(): void {
	sessionCourante = null;
}

/** Clôt la session ET efface la reprise stockée : l'essai est terminé, il n'y a plus rien
    à continuer. Idempotent. */
export function finirSessionRunner(): void {
	if (sessionCourante) removeResume(leconKey(sessionCourante.lesson.id));
	sessionCourante = null;
}

/** Instantané du runner en cours, ou `null` s'il n'y a rien qui vaille la peine d'être
    repris : aucun runner actif, ou pas une seule question validée — proposer « continue
    ta leçon » à la question 1 encombrerait la section « À continuer » sans rien
    épargner à l'enfant. Une session déjà à sa dernière question n'est pas non plus
    reprise : elle se termine en une réponse. */
export function snapshotRunner(now: number): ResumeRunner | null {
	if (!sessionCourante) return null;
	const s = sessionCourante;
	const { questions, idx, score } = s.etat();
	if (idx < 1 || idx >= questions.length) return null;
	return {
		kind: 'runner',
		key: leconKey(s.lesson.id),
		version: RESUME_VERSION,
		savedAt: now,
		mode: 'lecon',
		label: labelLecon(s.lesson, niveauLecon(s.lesson)),
		icon: subjectIcon(s.lesson.subject),
		categoryId: s.lesson.category,
		relaunch: { type: 'lecon', lessonId: s.lesson.id },
		total: questions.length,
		answered: idx,
		runner: s.runner,
		exerciseMode: s.exerciseMode,
		questions,
		idx,
		score,
	};
}

/* Registre des restaurateurs. Chaque runner s'y déclare au chargement de son module ;
   tous étant importés statiquement par la navigation, le registre est complet dès le
   démarrage de l'application. */
type RestaurerRunner = (snap: ResumeRunner) => void;
const registre = new Map<string, RestaurerRunner>();

/** Déclare comment rejouer ce runner. À appeler au niveau du module. */
export function enregistrerRunner(nom: string, restaurer: RestaurerRunner): void {
	registre.set(nom, restaurer);
}

/** Rejoue un instantané de runner. Renvoie `false` si le runner est inconnu — un
    instantané peut survivre à la disparition du runner qui l'a écrit (7 jours de TTL) ;
    à l'appelant de retomber proprement plutôt que de laisser un écran vide. */
export function restaurerRunner(snap: ResumeRunner): boolean {
	const restaurer = registre.get(snap.runner);
	if (!restaurer) return false;
	// L'instantané a fait un aller-retour JSON : les `SafeHtml` qu'il porte (la
	// `figure` d'une question, notamment) en sont revenus en objets nus, que le
	// gabarit refuse. On les reconstruit AVANT de rendre la main au runner, plutôt
	// que d'imposer la précaution aux dix restaurateurs. Cf. SafeHtml.toJSON.
	// Reconstruction EN PLACE : `Object.assign` remplace les enfants revivifiés sans
	// changer l'identité de l'instantané, que l'appelant tient déjà.
	restaurer(Object.assign(snap, revivreFragments(snap)));
	return true;
}
