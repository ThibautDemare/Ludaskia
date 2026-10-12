/* ============================================================
   Épingle de leçon de la file « à revoir », À UNE CLASSE (#573) — logique pure.
   ------------------------------------------------------------
   Une leçon peut exister dans deux classes sous deux formes différentes : « Clique sur le
   nom » au CE2, « Clique sur le nom noyau » au CM1. Épingler la leçon par son id nu, c'était
   la jouer dans la classe SUIVIE : un parent qui épinglait en voyant des erreurs sur le
   contenu CE2 obtenait la version CM1. L'épingle porte donc sa classe : `lessonId@niveau`,
   la même forme que les clés de progression (#225).

   Les ids NUS d'avant #573 restent lus, et joués au niveau suivi comme avant : une épingle
   est une intention vivante, la relire en CE2 changerait ce que l'enfant reçoit demain sans
   que personne l'ait demandé. (Asymétrie voulue avec le journal d'erreurs, où une entrée sans
   classe se lit en CE2 : une erreur est un fait daté.)

   Ce module ne lit pas le stockage : il dit comment lire et écrire une épingle, la file
   elle-même vit dans `encadrant-stats`. Une entrée de dictée (`ortho:…`) n'est jamais
   passée ici.
   ============================================================ */
import type { LessonDef, SchoolLevel } from './catalog';
import { LEVEL_ORDER, effectiveLevel } from './levels';

/** Id de file d'une leçon épinglée à une classe. */
export function revoirLeconId(lessonId: string, niveau: SchoolLevel): string {
	return `${lessonId}@${niveau}`;
}

/** Lecture d'un id de file de leçon : `niveau` vaut `null` pour un id nu (épingle d'avant
    #573) et pour un suffixe qui n'est pas une classe connue — la leçon se joue alors à la
    classe suivie plutôt que de disparaître de la file. */
export function lireRevoirLecon(entryId: string): {
	lessonId: string;
	niveau: SchoolLevel | null;
} {
	const i = entryId.lastIndexOf('@');
	if (i < 0) return { lessonId: entryId, niveau: null };
	const suffixe = entryId.slice(i + 1);
	return {
		lessonId: entryId.slice(0, i),
		niveau: (LEVEL_ORDER as string[]).includes(suffixe) ? (suffixe as SchoolLevel) : null,
	};
}

/** Classe où se joue, et se lit, une épingle de `lesson` : la classe épinglée (résolue sur
    les classes de la leçon, au cas où une mise à jour l'aurait retirée de celle-ci), sinon
    — id nu — la classe suivie `suivi`. */
export function niveauEntreeLecon(
	lesson: LessonDef,
	niveauEpingle: SchoolLevel | null,
	suivi: SchoolLevel,
): SchoolLevel {
	return effectiveLevel(lesson, niveauEpingle ?? suivi);
}

/** Id de `file` qui épingle `lesson` À la classe `niveau` (la classe suivie étant `suivi`),
    sinon `null`. L'id scopé exact passe devant un id nu qui se résoudrait au même niveau : si
    les deux coexistent, c'est le geste le plus récent et le plus précis. */
export function entreeEpinglee(
	file: Iterable<string>,
	lesson: LessonDef,
	niveau: SchoolLevel,
	suivi: SchoolLevel,
): string | null {
	let repli: string | null = null;
	for (const entryId of file) {
		const lue = lireRevoirLecon(entryId);
		if (lue.lessonId !== lesson.id) continue;
		if (niveauEntreeLecon(lesson, lue.niveau, suivi) !== niveau) continue;
		if (lue.niveau === niveau) return entryId;
		repli ??= entryId;
	}
	return repli;
}
