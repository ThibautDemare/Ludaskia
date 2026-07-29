/* ============================================================
   Leçon du jour (#208) — logique pure, sans DOM.
   ------------------------------------------------------------
   « Le prochain pas que l'enfant devrait travailler », dérivé de l'ordre
   pédagogique (data/ordre-pedagogique.ts via core/ordre.ts) et de sa progression.

   Modèle (validé avec pedagogue-primaire) :
   - chaque matière a sa séquence ordonnée, prise à SON niveau actif
     (`niveauActifMatiere`) → gère nativement le niveau par matière (#225) ;
   - on ENTRELACE les matières en alternance 1:1 sur les leçons RESTANT à franchir
     (round-robin ; quand une matière n'a plus rien, on déroule l'autre) ;
   - le round-robin PART de la matière la MOINS AVANCÉE (leçons franchies + leçons
     mises de côté dans sa séquence), égalité tranchée par l'ordre du catalogue. Sans
     ce tri, la tête du fil restait toujours celle de la 1re matière du catalogue : la
     carte ne proposait jamais l'autre matière avant d'avoir épuisé les maths, et
     l'alternance n'existait que dans le fil, invisible pour l'enfant (#484) ;
   - « franchie » (#485) = étoilée AU NIVEAU ACTIF (`loadStars`, scopé par matière)
     OU réussie à `SEUIL_FRANCHIE` sur un essai complet en mode leçon
     (`loadLessonReports`, cf. report-lecon.ts). La MAÎTRISE durable reste portée par
     la révision espacée (core/revision.ts), pas par cet avancement ;
   - une leçon sur laquelle l'enfant BUTE est mise de côté quelques jours (report,
     #485) : elle sort du fil et y revient d'elle-même, pour qu'un mur ne gèle pas la
     progression sur tout le reste du programme.

   La leçon du jour avance par la MAÎTRISE, jamais par un calendrier. `leconSuivante`
   offre en plus un contournement immédiat (« voir une autre leçon »), utile dès le
   premier essai, avant que le report n'ait de quoi se déclencher.
   ============================================================ */
import { SUBJECTS, getLessonsBySubject } from './catalog';
import type { LessonDef, SubjectId } from './catalog';
import { niveauActifMatiere } from './niveau-actif';
import { loadStars, loadLessonReports } from './progress';
import { enReport, estFranchie, type EtatReport } from './report-lecon';

/* Nombre maximal de leçons mises de côté EN MÊME TEMPS dans une matière. Au-delà, la
   plus anciennement reportée revient dans le fil même si son délai court : sans ce
   plafond, l'enfant filerait loin dans une matière sur des bases fragiles, alors que
   les séquences (surtout en maths) enchaînent des prérequis durs (avis pédagogue). */
export const MAX_REPORTEES_MATIERE = 2;

/* Une leçon est « acquise » si elle a au moins une étoile au niveau actif. */
function estAcquise(stars: Record<string, number>, id: string): boolean {
	return (stars[id] ?? 0) > 0;
}

interface EtatMatiere {
	restantes: LessonDef[]; // à franchir, ordre pédagogique (reportées comprises)
	actives: LessonDef[]; // à franchir et proposables aujourd'hui (hors reportées)
	/** Ce dont la matière s'est « acquittée » pour l'instant = leçons franchies + leçons
	    mises de côté. Les reportées comptent (#485) : sinon la matière garderait la main
	    et proposerait aussitôt la leçon d'après, alors que tout l'intérêt du report est
	    d'aller travailler AILLEURS le temps que la notion repose — et les séquences de
	    maths enchaînent des prérequis durs qu'on ne veut pas escalader d'un coup. */
	avancement: number;
}

/* Avancement d'une matière à SON niveau actif : ce qu'il reste à franchir (dans
   l'ordre pédagogique), ce qui est proposable aujourd'hui, et combien est déjà
   franchi. Un seul parcours du catalogue.

   Les leçons mises de côté sortent du proposable, mais au plus MAX_REPORTEES_MATIERE
   à la fois : on ne masque que les plus RÉCEMMENT reportées, donc la plus ancienne
   rentre d'office quand une troisième s'ajoute. */
function etatMatiere(
	subject: SubjectId,
	stars: Record<string, number>,
	reports: Record<string, EtatReport>,
	now: number,
): EtatMatiere {
	const lessons = getLessonsBySubject(subject, niveauActifMatiere(subject));
	const restantes = lessons.filter((l) => !estFranchie(reports[l.id], estAcquise(stars, l.id)));
	const masquees = new Set(
		restantes
			.filter((l) => enReport(reports[l.id], now))
			.sort((a, b) => (reports[b.id]?.reporteLe ?? 0) - (reports[a.id]?.reporteLe ?? 0))
			.slice(0, MAX_REPORTEES_MATIERE)
			.map((l) => l.id),
	);
	return {
		restantes,
		actives: restantes.filter((l) => !masquees.has(l.id)),
		avancement: lessons.length - restantes.length + masquees.size,
	};
}

/* Entrelacement 1:1 des files par matière (round-robin), files déjà ordonnées. */
function entrelacer(files: LessonDef[][]): LessonDef[] {
	const out: LessonDef[] = [];
	const max = files.reduce((m, f) => Math.max(m, f.length), 0);
	for (let i = 0; i < max; i++) {
		for (const f of files) if (i < f.length) out.push(f[i]);
	}
	return out;
}

/* Séquence entrelacée 1:1 des leçons restant à franchir, toutes matières (round-robin).
   C'est le « fil » de la leçon du jour : sa tête est la leçon du jour, et `leconSuivante`
   y avance pour le contournement.

   Le round-robin part de la matière la MOINS AVANCÉE (#484) : c'est ce qui fait réellement
   ALTERNER la leçon proposée, puisque l'accueil n'affiche que la tête du fil. Chaque leçon
   franchie fait passer sa matière derrière l'autre ; à égalité, l'ordre du catalogue
   tranche (profil neuf → on démarre sur la 1re matière déclarée).

   REPLI (#485) : si tout ce qui reste est mis de côté, on repropose quand même — la plus
   anciennement reportée d'abord. Un fil vide signifie « programme terminé » à l'accueil
   (félicitation + passerelle révision) : ce serait faux tant qu'il reste à franchir. */
export function sequenceLeconDuJour(
	stars: Record<string, number> = loadStars(),
	reports: Record<string, EtatReport> = loadLessonReports(),
	now: number = Date.now(),
): LessonDef[] {
	const etats = SUBJECTS.map((s, i) => ({ i, ...etatMatiere(s.id, stars, reports, now) })).sort(
		(a, b) => a.avancement - b.avancement || a.i - b.i,
	);
	const fil = entrelacer(etats.map((m) => m.actives));
	if (fil.length > 0) return fil;
	return entrelacer(etats.map((m) => m.restantes)).sort(
		(a, b) => (reports[a.id]?.reporteLe ?? 0) - (reports[b.id]?.reporteLe ?? 0),
	);
}

/* La leçon du jour = tête de la séquence. `null` seulement quand TOUT est franchi
   (programme du niveau terminé → l'accueil bascule l'invitation vers la révision). */
export function leconDuJour(
	stars: Record<string, number> = loadStars(),
	reports: Record<string, EtatReport> = loadLessonReports(),
	now: number = Date.now(),
): LessonDef | null {
	return sequenceLeconDuJour(stars, reports, now)[0] ?? null;
}

/* Contournement « voir une autre leçon » : la leçon SUIVANTE dans le fil après
   `apresId` (cyclique → ne bloque jamais). Si `apresId` n'est plus dans le fil (vient
   d'être franchie ou mise de côté) on repart de la tête. `null` si plus rien à franchir. */
export function leconSuivante(
	apresId: string,
	stars: Record<string, number> = loadStars(),
	reports: Record<string, EtatReport> = loadLessonReports(),
	now: number = Date.now(),
): LessonDef | null {
	const seq = sequenceLeconDuJour(stars, reports, now);
	if (seq.length === 0) return null;
	const i = seq.findIndex((l) => l.id === apresId);
	return i < 0 ? seq[0] : seq[(i + 1) % seq.length];
}
