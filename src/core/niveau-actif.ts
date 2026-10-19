/* ============================================================
   Niveau scolaire ACTIF (#225) — résolution au seam profil/catalogue.
   Compose le niveau du profil actif (référence + ajustement par matière)
   avec les niveaux présents au catalogue. Lit la méta de profil DIRECTEMENT
   depuis le stockage (pas via profiles.ts) pour rester indépendant : on évite
   un cycle progress → niveau-actif → profiles → progress (profiles.ts importe
   déjà progress.ts).
   ============================================================ */
import { lsGet, PROFILES_KEY } from './storage';
import { CATEGORIES, getAllLessons, getLessonById } from './catalog';
import type { LessonDef, SchoolLevel, SubjectId } from './catalog';
import { availableLevels, effectiveLevel, niveauDefautCatalogue } from './levels';

interface ProfilMeta {
	uuid: string;
	niveauReference?: SchoolLevel;
	niveauParMatiere?: Record<string, SchoolLevel>;
}

/* Profil actif lu directement dans la méta (undefined si aucun). */
function profilActif(): ProfilMeta | undefined {
	const meta = lsGet(PROFILES_KEY, null) as { list?: ProfilMeta[]; active?: string } | null;
	const list = meta?.list ?? [];
	return list.find((x) => x.uuid === meta?.active) ?? list[0];
}

/* Niveau de RÉFÉRENCE actif (classe du profil), sinon défaut catalogue.
   Sert aux contextes globaux (onboarding) ; le filtrage/génération passent par
   le niveau PAR MATIÈRE. */
export function niveauActif(): SchoolLevel {
	return profilActif()?.niveauReference ?? niveauDefautCatalogue(getAllLessons());
}

/* Niveau actif d'une MATIÈRE : ajustement par matière s'il existe, sinon la
   classe de référence, sinon défaut catalogue. */
export function niveauActifMatiere(subject: SubjectId): SchoolLevel {
	const p = profilActif();
	return (
		p?.niveauParMatiere?.[subject] ?? p?.niveauReference ?? niveauDefautCatalogue(getAllLessons())
	);
}

/* Faut-il demander à l'enfant de choisir sa classe ? Seulement si aucune classe
   n'est encore choisie ET qu'au moins deux niveaux ont du contenu (un seul niveau
   ⇒ aucun choix à faire, on reste silencieusement dessus). */
export function besoinChoixNiveau(): boolean {
	return (
		profilActif()?.niveauReference === undefined && availableLevels(getAllLessons()).length >= 2
	);
}

/* ---------- Niveau IMPOSÉ à une leçon (#573) ----------
   Une épingle posée sur la version CE2 d'une leçon qui existe aussi en CM1 se joue en CE2,
   même si la matière est suivie en CM1 : énoncés, consigne, libellé et stockage du résultat.
   Tout ce qui joue ou enregistre une leçon lit son niveau par `niveauLecon` ; imposer un
   niveau ici suffit donc à tout faire suivre, sans passer le niveau de fonction en fonction.

   Une seule leçon à la fois, et c'est le routeur (ui/navigation.ts) qui pose et lève : le
   niveau voyage dans le hash de la leçon, il vit le temps de ses écrans. État de module, à
   lever dans les tests. */
let impose: { lessonId: string; niveau: SchoolLevel } | null = null;

export function imposerNiveauLecon(lessonId: string, niveau: SchoolLevel): void {
	impose = { lessonId, niveau };
}
export function leverNiveauImpose(): void {
	impose = null;
}
/** Niveau imposé à cette leçon, résolu sur ses classes ; `null` si rien n'est imposé à elle. */
export function niveauImpose(lessonId: string): SchoolLevel | null {
	if (!impose || impose.lessonId !== lessonId) return null;
	const lesson = getLessonById(lessonId);
	return lesson ? effectiveLevel(lesson, impose.niveau) : impose.niveau;
}

/* ---------- Classe CHOISIE sur l'écran d'une catégorie (#772) ----------
   L'enfant fait passer toute la page d'une catégorie dans une autre classe que celle de sa
   matière : liste, étoiles, bilans, sprint, impression. Ce n'est PAS un réglage du profil :
   la classe suivie ne bouge pas, et tout ce qui la mesure (complétude, tour complet,
   leçon du jour, révision) continue de la lire par `niveauActifMatiere`.

   Ce qui se JOUE depuis la page, en revanche, se joue dans la classe choisie : `niveauLecon`
   la lit pour les leçons de SA catégorie, et le stockage suit (stats, étoiles, erreurs).
   Les records de bilan et de sprint vont dans le classement de cette classe (progress.ts).

   État de module, jamais persisté : un rechargement ramène à la classe du profil. C'est le
   routeur (ui/navigation.ts) qui le lève en quittant la catégorie et ce qui s'y lance. */
export interface ClasseChoisie {
	categoryId: string;
	niveau: SchoolLevel;
}
let choisie: ClasseChoisie | null = null;

function matiereDeCategorie(categoryId: string): SubjectId | undefined {
	return CATEGORIES.find((c) => c.id === categoryId)?.subject;
}

/** Pose la classe de l'écran d'une catégorie. Choisir la classe que la matière suit déjà
    revient à ne rien choisir : le choix est levé. */
export function choisirClasse(categoryId: string, niveau: SchoolLevel): void {
	const subject = matiereDeCategorie(categoryId);
	choisie = subject && niveau !== niveauActifMatiere(subject) ? { categoryId, niveau } : null;
}
export function leverClasseChoisie(): void {
	choisie = null;
}
export function classeChoisie(): ClasseChoisie | null {
	return choisie;
}
/** Classe dans laquelle s'affiche une catégorie : la classe choisie si elle vise CETTE
    catégorie, sinon la classe suivie par sa matière. */
export function classeDeCategorie(categoryId: string): SchoolLevel {
	if (choisie?.categoryId === categoryId) return choisie.niveau;
	return niveauActifMatiere(matiereDeCategorie(categoryId) ?? '');
}

/* Niveau effectif POUR UNE LEÇON : le niveau actif de SA MATIÈRE résolu sur les
   niveaux que la leçon supporte (repli/clamp via effectiveLevel). C'est ce qu'on
   passe à `generate`/`genLessonItem` au seam UI — une référence hors-filtre
   (favori, révision) est ainsi calibrée sans jamais être cassée. Un niveau IMPOSÉ à
   cette leçon (#573) passe devant tout ; la classe choisie sur l'écran de SA catégorie
   (#772) passe devant celle de la matière. */
export function niveauLecon(lesson: LessonDef): SchoolLevel {
	const demande =
		impose?.lessonId === lesson.id
			? impose.niveau
			: choisie?.categoryId === lesson.category
				? choisie.niveau
				: niveauActifMatiere(lesson.subject);
	return effectiveLevel(lesson, demande);
}

/* Leçons du NIVEAU ACTIF, par matière : chaque leçon est retenue si elle est
   disponible au niveau actif de SA matière. Périmètre de complétude et compteurs
   (« X / Y leçons réussies »), cohérent avec le catalogue filtré. */
export function lessonsNiveauActif(): LessonDef[] {
	return getAllLessons().filter((l) => l.levels.includes(niveauActifMatiere(l.subject)));
}
