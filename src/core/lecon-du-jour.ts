/* ============================================================
   Leçon du jour (#208) — logique pure, sans DOM.
   ------------------------------------------------------------
   « Le prochain pas que l'enfant devrait travailler », dérivé de l'ordre
   pédagogique (data/ordre-pedagogique.ts via core/ordre.ts) et de sa progression.

   Modèle (validé avec pedagogue-primaire) :
   - chaque matière a sa séquence ordonnée, prise à SON niveau actif
     (`niveauActifMatiere`) → gère nativement le niveau par matière (#225) ;
   - on ENTRELACE les matières en alternance 1:1 sur les leçons RESTANT à acquérir
     (round-robin ; quand une matière n'a plus rien, on déroule l'autre) ;
   - le round-robin PART de la matière la MOINS AVANCÉE (nombre de leçons déjà
     acquises dans sa séquence), égalité tranchée par l'ordre du catalogue. Sans ce
     tri, la tête du fil restait toujours celle de la 1re matière du catalogue : la
     carte ne proposait jamais l'autre matière avant d'avoir épuisé les maths, et
     l'alternance n'existait que dans le fil, invisible pour l'enfant (#484) ;
   - « acquise » = au moins une étoile AU NIVEAU ACTIF (`loadStars`, scopé par
     matière) : réussie une fois sans faute. La MAÎTRISE durable reste portée par
     la révision espacée (core/revision.ts), pas par cet avancement.

   La leçon du jour avance par la MAÎTRISE, jamais par un calendrier : elle ne
   change que lorsque la leçon courante est étoilée. `leconSuivante` offre un
   contournement (« voir une autre leçon ») pour ne JAMAIS rester bloqué sur un mur.
   ============================================================ */
import { SUBJECTS, getLessonsBySubject } from './catalog';
import type { LessonDef, SubjectId } from './catalog';
import { niveauActifMatiere } from './niveau-actif';
import { loadStars } from './progress';

/* Une leçon est « acquise » si elle a au moins une étoile au niveau actif. */
function estAcquise(stars: Record<string, number>, id: string): boolean {
	return (stars[id] ?? 0) > 0;
}

/* Avancement d'une matière à SON niveau actif : les leçons restant à acquérir (dans
   l'ordre pédagogique) et combien sont déjà acquises. Un seul parcours du catalogue. */
function etatMatiere(
	subject: SubjectId,
	stars: Record<string, number>,
): { restantes: LessonDef[]; acquises: number } {
	const lessons = getLessonsBySubject(subject, niveauActifMatiere(subject));
	const restantes = lessons.filter((l) => !estAcquise(stars, l.id));
	return { restantes, acquises: lessons.length - restantes.length };
}

/* Séquence entrelacée 1:1 des leçons restant à acquérir, toutes matières (round-robin).
   C'est le « fil » de la leçon du jour : sa tête est la leçon du jour, et `leconSuivante`
   y avance pour le contournement.

   Le round-robin part de la matière la MOINS AVANCÉE (#484) : c'est ce qui fait réellement
   ALTERNER la leçon proposée, puisque l'accueil n'affiche que la tête du fil. Chaque leçon
   franchie fait passer sa matière derrière l'autre ; à égalité, l'ordre du catalogue
   tranche (profil neuf → on démarre sur la 1re matière déclarée). */
export function sequenceLeconDuJour(stars: Record<string, number> = loadStars()): LessonDef[] {
	const files = SUBJECTS.map((s, i) => ({ i, ...etatMatiere(s.id, stars) }))
		.sort((a, b) => a.acquises - b.acquises || a.i - b.i)
		.map((m) => m.restantes);
	const out: LessonDef[] = [];
	const max = files.reduce((m, f) => Math.max(m, f.length), 0);
	for (let i = 0; i < max; i++) {
		for (const f of files) if (i < f.length) out.push(f[i]);
	}
	return out;
}

/* La leçon du jour = première leçon non acquise de la séquence entrelacée.
   `null` quand tout est acquis (programme du niveau terminé → l'accueil bascule
   l'invitation vers la révision). */
export function leconDuJour(stars: Record<string, number> = loadStars()): LessonDef | null {
	return sequenceLeconDuJour(stars)[0] ?? null;
}

/* Contournement « voir une autre leçon » : la leçon non acquise SUIVANTE dans le
   fil après `apresId` (cyclique → ne bloque jamais). Si `apresId` n'est plus dans
   le fil (vient d'être acquise) on repart de la tête. `null` si plus rien à acquérir. */
export function leconSuivante(
	apresId: string,
	stars: Record<string, number> = loadStars(),
): LessonDef | null {
	const seq = sequenceLeconDuJour(stars);
	if (seq.length === 0) return null;
	const i = seq.findIndex((l) => l.id === apresId);
	return i < 0 ? seq[0] : seq[(i + 1) % seq.length];
}
