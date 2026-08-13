/* ============================================================
   Journal daté des franchissements d'état des LISTES de dictée (#541).
   ------------------------------------------------------------
   Pendant, pour l'orthographe, du journal des paliers des leçons du catalogue
   (`LESSON_PALIERS_KEY`, progress.ts) : l'ÉTAT d'une liste était déjà connu
   (`avancementLecon`, progression.ts), mais rien ne datait le moment où elle est
   passée « en cours » puis « acquis ». D'où l'absence de frise d'évolution pour les
   dictées, alors que savoir à quel point une liste est acquise a le même intérêt
   pour un parent que pour une leçon.

   Même modèle MONOTONE que les leçons : on ne date que le PREMIER franchissement
   vers le haut, deux horodatages au plus par liste. Une liste qui repasse sous un
   cap (le parent ajoute des mots à une liste déjà acquise) ne re-loggue rien.

   ÉCHELLE À TROIS VALEURS (pas de « à renforcer », cf. progression.ts) : c'est ce
   qui permet à la frise d'une liste de déduire ses semaines anciennes, là où une
   leçon reste dans le doute (cf. friseListeOrtho, encadrant-stats.ts).
   ============================================================ */
import { lsGet, lsSet } from '../storage';
import type { PaliersNotion } from '../progress';
import { loadOrtho } from './store';
import { listOrthoLecons } from './lessons';
import { niveauListeOrtho } from './progression';

export const ORTHO_PALIERS_KEY = 'ludaskia_paliersOrtho';
/* MISE EN SERVICE du journal pour ce profil, sur le modèle de `PALIERS_DEBUT_KEY` : sans cette
   borne, un horodatage ABSENT est ambigu (« aucun cap franchi » ou « rien n'était journalisé »)
   et l'espace encadrant ne peut rien affirmer d'une semaine ancienne.

   Borne DISTINCTE de celle des leçons, et ce n'est pas un doublon par négligence : celle des
   leçons est posée par TOUTE session finalisée, dictée et révision comprises. La reprendre ici
   ferait dire à la frise d'une liste que ses semaines sont connues depuis une séance de maths,
   alors que le présent journal, plus récent, ne tournait pas encore — exactement la fausse
   affirmation que la borne existe pour empêcher. */
export const ORTHO_PALIERS_DEBUT_KEY = 'ludaskia_paliersOrthoDepuis';

/* Pose la borne si elle manque, jamais deux fois : ce qu'elle date, c'est le journal EN SERVICE,
   pas un franchissement. Donc APPELÉE MÊME quand la session ne franchit aucun cap. */
function marquerDebutSuiviOrtho(now: number): void {
	if (lsGet(ORTHO_PALIERS_DEBUT_KEY, null) == null) lsSet(ORTHO_PALIERS_DEBUT_KEY, now);
}

/* Enregistre les franchissements d'état des listes de dictée du profil ACTIF, à appeler à la fin
   de TOUTE session ayant pu faire progresser un mot : la dictée (ortho-runner) et la révision
   espacée (revision.ts), qui rejoue des mots elle aussi. Un mot appartenant à plusieurs listes,
   on réévalue TOUTES les listes et pas seulement celle jouée — sinon un mot travaillé en révision
   ferait franchir un cap à une liste sans jamais le dater.

   `dicteeDispo` (dispo du TTS) conditionne l'« acquis » d'un mot : on journalise donc l'état tel
   que l'enfant l'a VÉCU dans cette séance. Un appareil sans voix acquiert une liste plus tôt
   (moins de modes requis) — c'est déjà vrai de l'état affiché, la frise ne fait que le suivre.

   `now` daté par l'appelant (testable). */
export function journaliserPaliersOrtho(dicteeDispo: boolean, now: number): void {
	marquerDebutSuiviOrtho(now);
	const state = loadOrtho();
	const paliers = lsGet(ORTHO_PALIERS_KEY, {}) as Record<string, PaliersNotion>;
	// Toutes les listes, SANS filtre de niveau : une liste hors du niveau du profil n'est
	// simplement jamais travaillée, donc jamais tamponnée. Éviter le filtre garde ce journal
	// indépendant du profil courant (et donc testable sans en monter un).
	const refs = listOrthoLecons(state);
	let changed = false;
	for (const ref of refs) {
		const niveau = niveauListeOrtho(state, ref.id, dicteeDispo);
		const rec = paliers[ref.id] ?? {};
		if (niveau === 'acquis' && rec.acquis == null) {
			rec.acquis = now;
			paliers[ref.id] = rec;
			changed = true;
			// `rec.acquis == null` : sans cette garde, une liste DÉJÀ acquise qui redescend se
			// faisait tamponner un « en cours » POSTÉRIEUR à son « acquis » — journal incohérent,
			// et contraire au modèle monotone annoncé en tête de module. Deux chemins réels : le
			// parent ajoute un mot à une liste acquise, et surtout, sans aucun changement de
			// donnée, la voix de synthèse se charge en asynchrone (cf. ui/tts.ts) — `dicteeDispo`
			// passe de `false` à `true` en cours de session et remet la dictée au rang des modes
			// requis. Le journal des leçons a le même code sans en avoir besoin : leur « acquis »
			// repose sur l'étoile, qui ne se retire jamais. Copier le modèle a hérité du code sans
			// l'invariant qui le protégeait.
		} else if (niveau === 'en-cours' && rec.enCours == null && rec.acquis == null) {
			rec.enCours = now;
			paliers[ref.id] = rec;
			changed = true;
		}
		// « à découvrir » : rien commencé, pas un cap franchi → rien.
	}
	// Hygiène : une liste supprimée par le parent n'a plus d'historique à garder. Le journal des
	// leçons est borné par le catalogue ; celui-ci ne l'est par rien, un parent pouvant créer une
	// liste par semaine pendant des années.
	const connues = new Set(refs.map((r) => r.id));
	for (const id of Object.keys(paliers)) {
		if (!connues.has(id)) {
			delete paliers[id];
			changed = true;
		}
	}
	if (changed) lsSet(ORTHO_PALIERS_KEY, paliers);
}
