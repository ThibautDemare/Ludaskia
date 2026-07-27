/* ============================================================
   Leçons déclarées « vues en classe » (#478) — rencontrées HORS application.
   ------------------------------------------------------------
   Une leçon ne compte comme « rencontrée » que si elle a été jouée DANS l'appli
   (date de 1er passage, `LESSON_FIRST_SEEN_KEY`). Or l'enfant peut avoir vu la
   notion en classe : rattrapage à l'arrivée sur l'appli, ou notions traitées au
   fil de l'année après un changement de classe. Sans déclaration, le périmètre
   « ce que tu connais déjà » du sprint repioche indéfiniment dans le même petit
   pool, et la révision espacée ignore tout ce qui n'a jamais été joué.

   Carte DÉDIÉE, jamais `LESSON_FIRST_SEEN_KEY` : cette dernière a d'autres
   consommateurs qu'une déclaration en masse fausserait — l'objectif « découvre
   une nouvelle leçon » (`countNewLessonsSince`, `aLeconInedite`) et le récap
   encadrant « notions maîtrisées récemment ». L'union des deux cartes se fait
   UNIQUEMENT dans `sprint-scope.ts`.

   Namespacée par niveau (`lessonId@niveau`) comme les autres cartes de
   progression : une déclaration faite au CE2 ne déborde pas sur le CM1 (à la
   bascule de classe, le pool « seen » du CM1 repart quasi vide — correct, les
   notions CM1 n'ont pas encore été vues). Écrite depuis l'espace encadrant par
   UUID, donc SANS changer le profil actif (même invariant que `setPrefFor` /
   `loadRevoirFor`) : le niveau de chaque leçon vient du profil CONSULTÉ, il est
   passé par l'appelant et non déduit du niveau actif.
   ============================================================ */
import type { CategoryId, SchoolLevel, SubjectId } from './catalog';
import { CATEGORIES, getLessonsByCategory } from './catalog';
import { lsGet, lsGetRaw, lsSetRaw } from './storage';
import {
	scopeActif,
	enterLessonsRevisionFor,
	retirerRevisionsDeclareesFor,
	LESSON_FIRST_SEEN_KEY,
} from './progress';

export const VU_AILLEURS_KEY = 'ludaskia_lessonVuAilleurs';

/* Une leçon à déclarer, avec le niveau AUQUEL elle est déclarée (celui du profil
   consulté pour sa matière) : le couple forme la clé de stockage. */
export interface LeconNiveau {
	lessonId: string;
	niveau: SchoolLevel;
}

function cle(e: LeconNiveau): string {
	return `${e.lessonId}@${e.niveau}`;
}

/* Carte BRUTE (clés namespacées) d'un profil donné par UUID : lecture côté encadrant. */
export function loadVuAilleursFor(uuid: string): Record<string, true> {
	const v = lsGetRaw(uuid + '/' + VU_AILLEURS_KEY, {});
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, true>) : {};
}

/* La leçon est-elle déclarée « vue en classe » à ce niveau, dans une carte brute ? */
export function estVuAilleurs(carte: Record<string, true>, e: LeconNiveau): boolean {
	return carte[cle(e)] === true;
}

/* Vue { lessonId: true } du profil ACTIF, scopée au niveau actif de chaque matière —
   même contrat de lecture que `loadLessonFirstSeen`. Consommée par `sprint-scope`. */
export function loadVuAilleurs(): Record<string, true> {
	const raw = lsGet(VU_AILLEURS_KEY, {});
	return raw && typeof raw === 'object' && !Array.isArray(raw)
		? scopeActif(raw as Record<string, true>)
		: {};
}

/* Déclare (`vu`) ou annule la déclaration d'un ensemble de leçons pour un profil.
   Idempotent : seules les entrées qui CHANGENT réellement d'état propagent leur effet
   sur la révision espacée — décocher une leçon jamais déclarée ne doit pas toucher un
   état SR issu d'un vrai passage dans l'appli.
   Effet sur la révision espacée (#478) : entrée immédiate en rotation au comportement
   standard (1er re-test à J+1) ; à l'annulation, on ne retire que ce que la déclaration
   avait créé (cf. `retirerRevisionsDeclareesFor`). */
export function declarerVuAilleursFor(
	uuid: string,
	entrees: LeconNiveau[],
	vu: boolean,
	now: number,
): void {
	const carte = loadVuAilleursFor(uuid);
	const changees: string[] = [];
	for (const e of entrees) {
		const k = cle(e);
		if (vu) {
			if (carte[k] === true) continue;
			carte[k] = true;
		} else {
			if (carte[k] == null) continue;
			delete carte[k];
		}
		changees.push(k);
	}
	if (changees.length === 0) return;
	lsSetRaw(uuid + '/' + VU_AILLEURS_KEY, JSON.stringify(carte));
	if (vu) enterLessonsRevisionFor(uuid, changees, now);
	else retirerRevisionsDeclareesFor(uuid, changees);
}

/* ---------- Modèle de l'écran de déclaration (espace encadrant) ----------
   Vue par CATÉGORIE du niveau d'un profil : ce que l'adulte coche. Logique pure
   (aucun DOM) et paramétrée par `niveauDe` — le niveau vient du profil CONSULTÉ,
   pas du profil actif — donc testable sans profil actif. */
export interface LeconDeclarable {
	lessonId: string;
	label: string;
	niveau: SchoolLevel;
	/** Déclarée « vue en classe » par l'adulte. */
	declaree: boolean;
	/** Déjà travaillée DANS l'appli (date de 1er passage) : rencontrée de toute façon,
	    la déclaration n'y ajouterait rien → case cochée mais non modifiable. */
	jouee: boolean;
}
export interface CategorieDeclarable {
	categoryId: CategoryId;
	label: string;
	subject: SubjectId;
	lecons: LeconDeclarable[];
	/** Leçons sur lesquelles la déclaration a un sens (pas encore jouées dans l'appli). */
	declarables: number;
	/** Parmi elles, celles effectivement déclarées. */
	declarees: number;
	/** Leçons rencontrées d'une façon ou d'une autre (jouées ∪ déclarées) : le compte
	    que l'adulte lit (« X sur Y »), aligné sur le périmètre « seen » du sprint. */
	rencontrees: number;
}

/* Catégories non vides au niveau du profil, avec leurs leçons et l'état de déclaration.
   Même parcours que le récap de progression (CATEGORIES × niveau de la matière), pour
   que l'adulte retrouve la structure qu'il connaît déjà. */
export function categoriesDeclarables(
	uuid: string,
	niveauDe: (subject: SubjectId) => SchoolLevel,
): CategorieDeclarable[] {
	const carte = loadVuAilleursFor(uuid);
	const firstSeen = lsGetRaw(uuid + '/' + LESSON_FIRST_SEEN_KEY, {}) as Record<string, number>;
	const out: CategorieDeclarable[] = [];
	for (const cat of CATEGORIES) {
		const niveau = niveauDe(cat.subject);
		const lecons = getLessonsByCategory(cat.id, niveau);
		if (lecons.length === 0) continue; // catégorie vide à ce niveau → pas affichée
		const rc: CategorieDeclarable = {
			categoryId: cat.id,
			label: cat.label,
			subject: cat.subject,
			lecons: [],
			declarables: 0,
			declarees: 0,
			rencontrees: 0,
		};
		for (const l of lecons) {
			const e = { lessonId: l.id, niveau };
			const jouee = firstSeen[`${l.id}@${niveau}`] != null;
			const declaree = estVuAilleurs(carte, e);
			rc.lecons.push({ lessonId: l.id, label: l.label, niveau, declaree, jouee });
			if (!jouee) {
				rc.declarables++;
				if (declaree) rc.declarees++;
			}
			if (jouee || declaree) rc.rencontrees++;
		}
		out.push(rc);
	}
	return out;
}
