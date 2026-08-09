/* ============================================================
   Espace encadrant (#391) — section « Ce qui a été difficile récemment ».
   ------------------------------------------------------------
   Historique détaillé des erreurs du profil CONSULTÉ, en LECTURE SEULE, pour
   aider le parent à cibler son aide (question posée, réponse donnée, bonne
   réponse, leçon, mode, quand). Rendu (pas de logique de données ici) : la
   journalisation et le regroupement vivent dans core/erreurs-journal.ts.

   Parti pris (avis designer-ux-enfant) :
   - GROUPÉ PAR LEÇON, la PLUS RATÉE en tête (#519 : volume d'erreurs sur la période
     retenue, la récence ne départageant plus qu'à égalité) ; replié par défaut
     (<details>), pour ne pas dérouler un « mur de fautes » ;
   - pas de rouge en aplat : la BONNE réponse est mise en avant (positif), la
     réponse donnée reste neutre, jamais barrée ;
   - relié à « À revoir ensemble » : chaque leçon peut être épinglée d'ici (même
     `data-act="epingler"` → toggleRevoirFor, aiguillé par progressionClick) ;
   - filtrable par PÉRIODE (#476) : le « récemment » du titre est une vraie fenêtre de
     temps, choisie par l'encadrant (le filtrage lui-même est pur, côté core).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { icon } from './icon';
import { getLessonById } from '../core/catalog';
import type { Profile } from '../core/profiles';
import {
	chargerErreursFor,
	filtrerErreursParPeriode,
	grouperErreursParLecon,
	periodeParDefaut,
	type ErreurAffichee,
	type GroupeErreursLecon,
	type PeriodeErreurs,
} from '../core/erreurs-journal';
import { libelleDerniereFois, loadRevoirFor, orthoRevoirId } from '../core/encadrant-stats';
import { lsGetRaw } from '../core/storage';
import { ORTHO_KEY } from '../core/orthographe/store';
import { labelLeconOrtho } from '../core/orthographe/lessons';
import { container, renderEspace } from './encadrant-commun';
import { segmentHTML } from './segment';

/* Nombre d'erreurs (dédoublonnées) montrées par leçon avant le repli « + N plus
   anciennes » (avis designer : 3-5 max pour rester lisible). */
const MAX_PAR_LECON = 5;

/* ---------- État de la section (module) ---------- */
/* Période choisie par l'encadrant. `null` = pas encore choisie → défaut ADAPTATIF
   recalculé à chaque rendu (`periodeParDefaut`). Un choix explicite, lui, est conservé
   d'un profil consulté à l'autre (on compare deux enfants sur la même fenêtre). */
let periodeChoisie: PeriodeErreurs | null = null;

/* Les quatre choix, du plus serré au plus large. « Tout » = pas de borne (soit, en
   pratique, les MAX_ERREURS dernières erreurs conservées). */
const PERIODES: { id: PeriodeErreurs; label: string }[] = [
	{ id: 'jour', label: "Aujourd'hui" },
	{ id: 'deux-jours', label: '2 jours' },
	{ id: 'semaine', label: '1 semaine' },
	{ id: 'tout', label: 'Tout' },
];
const estPeriode = (v: string | undefined): v is PeriodeErreurs => PERIODES.some((p) => p.id === v);

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

/* Une entrée d'erreur : énoncé (primaire) + réponse attendue mise en avant (--ok) +
   réponse donnée (neutre) + ligne meta (mode · quand · « vu N fois »).
   « Réponse attendue » et non « La bonne réponse » (#446) : depuis l'intercalation, l'attendu
   peut être une BANDE (« un nombre entre 450 et 465 ») dont le « la » nierait la pluralité.
   Formulation neutre, symétrique de « Réponse donnée : » juste en dessous, et alignée sur le
   vocabulaire interne (`attendue`, `attendueItem`) — valable pour TOUTES les leçons. */
function erreurLigneHTML(e: ErreurAffichee, now: number): string {
	const quand = libelleDerniereFois(e.ts, now);
	const meta = [modeLabel(e.mode), quand, e.occurrences > 1 ? `vue ${e.occurrences} fois` : '']
		.filter(Boolean)
		.join(' · ');
	return `<li class="enc-err-item">
      <p class="enc-err-q">${escapeHTML(e.question)}</p>
      <p class="enc-err-bonne"><span class="enc-err-lab">Réponse attendue :</span> ${escapeHTML(e.attendue)}</p>
      <p class="enc-err-donnee"><span class="enc-err-lab">Réponse donnée :</span> ${escapeHTML(e.donnee)}</p>
      <p class="enc-err-meta">${escapeHTML(meta)}</p>
    </li>`;
}

/* Erreurs au-delà de MAX_PAR_LECON : DÉPLIABLES, et non un simple compteur. Le compteur
   du résumé (« 12 erreurs ») les inclut ; les annoncer sans permettre de les lire donnait
   un écart inexplicable entre le total et la liste. Second niveau de <details> (imbriqué
   dans celui de la leçon) : replié par défaut, donc le « mur de fautes » reste évité, mais
   l'encadrant qui cherche une régularité peut tout voir. */
function anciennesHTML(anciennes: ErreurAffichee[], now: number, label: string): string {
	if (!anciennes.length) return '';
	const n = anciennes.length;
	const texte = `${n} erreur${n > 1 ? 's' : ''} plus ancienne${n > 1 ? 's' : ''}`;
	// Nom accessible enrichi de la LEÇON (le libellé visible reste court) : plusieurs groupes
	// peuvent dépasser MAX_PAR_LECON, et en navigation de bouton en bouton (raccourci NVDA/JAWS,
	// rotor VoiceOver) une série de « 3 erreurs plus anciennes » identiques serait sans repère.
	// Même parade que le bouton « Épingler » ci-dessous.
	return `<details class="enc-err-anciennes">
      <summary class="enc-err-anciennes-sum" aria-label="${escapeHTML(`${texte} pour « ${label} »`)}">${texte}</summary>
      <ul class="enc-err-list">${anciennes.map((e) => erreurLigneHTML(e, now)).join('')}</ul>
    </details>`;
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
	const anciennes = g.erreurs.slice(MAX_PAR_LECON);
	// Entrée « à revoir » : id du catalogue pour une leçon, id de dictée préfixé pour une
	// liste d'orthographe. On peut désormais épingler l'une comme l'autre ; l'action n'est
	// masquée que pour un id non résolu (ni leçon, ni liste connue).
	const entryId = lesson ? g.lessonId : labelOrtho ? orthoRevoirId(g.lessonId) : null;
	const epingle = entryId ? epinglees.has(entryId) : false;
	const actions = entryId
		? `<div class="enc-actions">
        <button type="button" class="enc-btn-sec${epingle ? ' on' : ''}" data-act="epingler" data-lesson="${entryId}" aria-label="${epingle ? 'Retirer' : 'Épingler'} « ${escapeHTML(label)} »">${epingle ? 'Retirer' : 'Épingler'}</button>
      </div>`
		: '';
	return `<details class="enc-err-lecon">
      <summary class="enc-err-sum">
        <span class="enc-err-lecon-lab">${escapeHTML(label)}</span>
        <span class="enc-err-count">${g.total} erreur${g.total > 1 ? 's' : ''}</span>
        ${quand ? `<span class="enc-err-quand">dernière fois ${quand}</span>` : ''}
      </summary>
      <ul class="enc-err-list">${visibles.map((e) => erreurLigneHTML(e, now)).join('')}</ul>
      ${anciennesHTML(anciennes, now, label)}
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

/* Résultat du filtre, en une phrase — sert de nom accessible au segment actif
   (cf. `periodesHTML`). */
function resumePeriode(groupes: GroupeErreursLecon[]): string {
	if (!groupes.length) return 'aucune erreur sur cette période';
	const erreurs = groupes.reduce((s, g) => s + g.total, 0);
	return `${groupes.length} leçon${groupes.length > 1 ? 's' : ''}, ${erreurs} erreur${erreurs > 1 ? 's' : ''}`;
}

/* Sélecteur de période (#476) — composant segment partagé de l'espace encadrant
   (cf. ui/segment.ts), en variante qui passe à la ligne : quatre libellés ne tiennent
   pas sur une ligne de smartphone.

   Le segment ACTIF porte un `aria-label` enrichi du résultat (« Aujourd'hui, 3 leçons,
   12 erreurs ») : changer de période change la liste en dessous SANS y déplacer le focus
   (SC 4.1.3), et le focus revient justement sur ce bouton après re-rendu — l'annonce est
   donc garantie, là où une région `aria-live` recréée par un `innerHTML` global ne serait
   annoncée que de façon inconstante selon le navigateur et l'aide technique. Le libellé
   visible reste le préfixe exact du nom accessible (SC 2.5.3). */
function periodesHTML(active: PeriodeErreurs, groupes: GroupeErreursLecon[]): string {
	return segmentHTML({
		act: 'erreurs-periode',
		valAttr: 'periode',
		label: 'Période des erreurs affichées',
		active,
		wrap: true,
		options: PERIODES.map((p) => ({
			val: p.id,
			label: p.label,
			ariaLabel: p.id === active ? `${p.label}, ${resumePeriode(groupes)}` : undefined,
		})),
	});
}

/* Bloc « Ce qui a été difficile récemment » du profil consulté (lecture seule).
   `now` injecté (l'appelant passe Date.now()) — cohérent avec le reste du récap.
   Le filtre de période s'applique AVANT le regroupement : les compteurs affichés
   décrivent la période choisie, pas tout l'historique — et c'est ce qui porte le
   « récemment » du titre depuis que le classement se fait au volume (#519), le
   texte d'aide annonçant désormais l'ordre réel (le plus d'erreurs d'abord). */
export function erreursHTML(consulte: Profile, now: number): string {
	const toutes = chargerErreursFor(consulte.uuid);
	const periode = periodeChoisie ?? periodeParDefaut(toutes, now);
	const groupes = grouperErreursParLecon(filtrerErreursParPeriode(toutes, periode, now));
	const epinglees = new Set(loadRevoirFor(consulte.uuid));
	const orthoListes = orthoListesFor(consulte.uuid);
	// Deux vides distincts : journal entièrement vide (rien à filtrer → pas de
	// sélecteur, message rassurant) vs période sans erreur alors qu'il en existe
	// ailleurs (on invite à élargir plutôt que de laisser croire qu'il n'y a rien).
	// Même idiome « Rien à signaler » dans les deux cas : c'est la 2e phrase qui
	// distingue, pas un changement de ton (relecture langue).
	const corps = groupes.length
		? `<div class="enc-err-lecons">${groupes.map((g) => groupeHTML(g, epinglees, orthoListes, now)).join('')}</div>`
		: toutes.length
			? `<p class="enc-hint enc-err-vide">Rien à signaler sur cette période. Élargissez-la pour voir les erreurs plus anciennes.</p>`
			: `<p class="enc-hint">Rien à signaler récemment.</p>`;
	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('clock-clockwise')} Ce qui a été difficile récemment</h3>
      <p class="enc-hint">Voici les leçons où ${escapeHTML(consulte.name)} a rencontré des difficultés, en commençant par celles qui comptent le plus d'erreurs. Dépliez une leçon pour voir le détail, ou épinglez-la pour qu'elle revienne sur l'accueil de ${escapeHTML(consulte.name)}.</p>
      ${toutes.length ? periodesHTML(periode, groupes) : ''}
      ${corps}
    </div>`;
}

/* ---------- Handler délégué (aiguillé par l'orchestrateur) ---------- */
export function erreursClick(act: string, el: HTMLElement): boolean {
	if (act !== 'erreurs-periode') return false;
	const p = el.dataset.periode;
	if (!estPeriode(p)) return true;
	periodeChoisie = p;
	renderEspace();
	// Le re-rendu recrée le DOM → on garde le focus clavier sur le bouton actif
	// (sélecteur porté par `data-act` : plusieurs segments coexistent dans la page).
	(container()?.querySelector('[data-act="erreurs-periode"].on') as HTMLElement | null)?.focus({
		preventScroll: true,
	});
	return true;
}
