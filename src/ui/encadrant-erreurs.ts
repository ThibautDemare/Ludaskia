/* ============================================================
   Espace encadrant (#391) — section « Ce qui a été difficile récemment ».
   ------------------------------------------------------------
   Historique détaillé des erreurs du profil CONSULTÉ, en LECTURE SEULE, pour
   aider le parent à cibler son aide (question posée, réponse donnée, bonne
   réponse, leçon, mode, quand). Rendu (pas de logique de données ici) : la
   journalisation et le regroupement vivent dans core/erreurs-journal.ts.

   Parti pris (avis designer-ux-enfant) :
   - GROUPÉ PAR LEÇON, la plus récemment ratée en tête ; replié par défaut
     (<details>), pour ne pas dérouler un « mur de fautes » ;
   - pas de rouge en aplat : la BONNE réponse est mise en avant (positif), la
     réponse donnée reste neutre, jamais barrée ;
   - relié à « À revoir ensemble » : chaque leçon peut être épinglée d'ici (même
     `data-act="epingler"` → toggleRevoirFor, aiguillé par progressionClick).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { icon } from './icon';
import { getLessonById } from '../core/catalog';
import type { Profile } from '../core/profiles';
import {
	chargerErreursFor,
	grouperErreursParLecon,
	type ErreurAffichee,
	type GroupeErreursLecon,
} from '../core/erreurs-journal';
import { libelleDerniereFois, loadRevoirFor, orthoRevoirId } from '../core/encadrant-stats';
import { lsGetRaw } from '../core/storage';
import { ORTHO_KEY } from '../core/orthographe/store';
import { labelLeconOrtho } from '../core/orthographe/lessons';

/* Nombre d'erreurs (dédoublonnées) montrées par leçon avant le repli « + N plus
   anciennes » (avis designer : 3-5 max pour rester lisible). */
const MAX_PAR_LECON = 5;

/* Libellé lisible du mode d'entraînement pour la ligne meta (pas de jargon). */
const MODE_LABEL: Record<string, string> = {
	lecon: 'leçon',
	express: 'bilan express',
	complet: 'bilan complet',
	sprint: 'sprint',
	dictee: 'dictée',
	revision: 'révision',
};
const modeLabel = (m: string): string => MODE_LABEL[m] ?? m;

/* Une entrée d'erreur : énoncé (primaire) + bonne réponse mise en avant (--ok) +
   réponse donnée (neutre) + ligne meta (mode · quand · « vu N fois »). */
function erreurLigneHTML(e: ErreurAffichee, now: number): string {
	const quand = libelleDerniereFois(e.ts, now);
	const meta = [modeLabel(e.mode), quand, e.occurrences > 1 ? `vue ${e.occurrences} fois` : '']
		.filter(Boolean)
		.join(' · ');
	return `<li class="enc-err-item">
      <p class="enc-err-q">${escapeHTML(e.question)}</p>
      <p class="enc-err-bonne"><span class="enc-err-lab">La bonne réponse :</span> ${escapeHTML(e.attendue)}</p>
      <p class="enc-err-donnee"><span class="enc-err-lab">Réponse donnée :</span> ${escapeHTML(e.donnee)}</p>
      <p class="enc-err-meta">${escapeHTML(meta)}</p>
    </li>`;
}

/* Un groupe-leçon replié : résumé (libellé + compteur discret + dernière fois),
   les MAX_PAR_LECON erreurs les plus récentes, un repli « + N plus anciennes », et
   l'action « Épingler » (l'action est DANS le corps, jamais dans le <summary> :
   un bouton dans un summary basculerait le pli au clic). */
function groupeHTML(
	g: GroupeErreursLecon,
	epinglees: Set<string>,
	orthoListes: readonly { id: string; label: string }[],
	now: number,
): string {
	// Résolution du libellé : leçon du catalogue, sinon liste d'orthographe (prédéfinie
	// ou du profil consulté), sinon l'id brut en dernier recours.
	const lesson = getLessonById(g.lessonId);
	const labelOrtho = lesson ? null : labelLeconOrtho(g.lessonId, orthoListes);
	const label = lesson?.label ?? labelOrtho ?? g.lessonId;
	const quand = libelleDerniereFois(g.derniereFois, now);
	const visibles = g.erreurs.slice(0, MAX_PAR_LECON);
	const reste = g.erreurs.length - visibles.length;
	// Entrée « à revoir » : id du catalogue pour une leçon, id de dictée préfixé pour une
	// liste d'orthographe. On peut désormais épingler l'une comme l'autre ; l'action n'est
	// masquée que pour un id non résolu (ni leçon, ni liste connue).
	const entryId = lesson ? g.lessonId : labelOrtho ? orthoRevoirId(g.lessonId) : null;
	const epingle = entryId ? epinglees.has(entryId) : false;
	const actions = entryId
		? `<div class="enc-actions">
        <button type="button" class="enc-btn-sec${epingle ? ' on' : ''}" data-act="epingler" data-lesson="${entryId}">${epingle ? 'Retirer' : 'Épingler'}</button>
      </div>`
		: '';
	return `<details class="enc-err-lecon">
      <summary class="enc-err-sum">
        <span class="enc-err-lecon-lab">${escapeHTML(label)}</span>
        <span class="enc-err-count">${g.total} erreur${g.total > 1 ? 's' : ''}</span>
        ${quand ? `<span class="enc-err-quand">dernière fois ${quand}</span>` : ''}
      </summary>
      <ul class="enc-err-list">${visibles.map((e) => erreurLigneHTML(e, now)).join('')}</ul>
      ${
				reste > 0
					? `<p class="enc-hint enc-err-reste">+ ${reste} erreur${reste > 1 ? 's' : ''} plus ancienne${reste > 1 ? 's' : ''}</p>`
					: ''
			}
      ${actions}
    </details>`;
}

/* Listes d'orthographe du profil consulté (lecture BRUTE par UUID, comme le reste de
   l'espace encadrant) : sert à résoudre le libellé des erreurs de dictée, dont l'id
   n'est pas une leçon du catalogue. Défensif (stockage potentiellement absent/corrompu). */
function orthoListesFor(uuid: string): { id: string; label: string }[] {
	const raw = lsGetRaw(uuid + '/' + ORTHO_KEY, null) as { listes?: unknown } | null;
	const listes = raw && Array.isArray(raw.listes) ? raw.listes : [];
	return listes.filter(
		(l): l is { id: string; label: string } =>
			!!l && typeof l.id === 'string' && typeof l.label === 'string',
	);
}

/* Bloc « Ce qui a été difficile récemment » du profil consulté (lecture seule).
   `now` injecté (l'appelant passe Date.now()) — cohérent avec le reste du récap. */
export function erreursHTML(consulte: Profile, now: number): string {
	const groupes = grouperErreursParLecon(chargerErreursFor(consulte.uuid));
	const epinglees = new Set(loadRevoirFor(consulte.uuid));
	const orthoListes = orthoListesFor(consulte.uuid);
	const corps = groupes.length
		? `<div class="enc-err-lecons">${groupes.map((g) => groupeHTML(g, epinglees, orthoListes, now)).join('')}</div>`
		: `<p class="enc-hint">Rien à signaler récemment.</p>`;
	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('clock-clockwise')} Ce qui a été difficile récemment</h3>
      <p class="enc-hint">Voici les dernières questions qui ont posé des difficultés à ${escapeHTML(consulte.name)}, pour cibler votre aide. Dépliez une leçon pour voir le détail, ou épinglez-la pour qu'elle revienne sur l'accueil de ${escapeHTML(consulte.name)}.</p>
      ${corps}
    </div>`;
}
