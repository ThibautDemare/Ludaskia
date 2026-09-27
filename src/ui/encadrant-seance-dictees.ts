/* ============================================================
   Espace encadrant — étape « Une dictée » du programme du jour : la liste à cocher des
   dictées visées (#463) et son FILTRE à la frappe (#722).
   ------------------------------------------------------------
   Extrait de `encadrant-seance.ts` (relecture qualité #722 : un bloc autonome de plus dans
   un fichier qui dépassait 1 000 lignes). Ici : les groupes de dictées proposables, l'état
   du filtre, le rendu du corps de la liste et le handler de frappe. Le fieldset lui-même
   (légende, repère de comptage, refus) reste composé par `encadrant-seance.ts`.

   Le filtre : un texte par étape, en ÉTAT DE MODULE — l'espace recrée tout son DOM à la
   moindre action, sans lui le filtre tomberait à chaque case cochée. Même normalisation que
   la recherche (`cleRecherche`). Deux règles qui ne bougent pas : une case COCHÉE reste
   toujours visible et cochable (filtrer ne cache jamais une cible, et n'en décoche jamais
   une — critère 11), et un groupe sans case visible s'efface avec son titre.

   À la frappe, on RE-REND le seul corps de la liste avec la MÊME fonction que le rendu
   initial (`corpsDicteesHTML`), sans toucher au champ — même patron que `rafraichirCorps`
   du sélecteur (#556). Un second algorithme qui aurait basculé `hidden` en place sur le DOM
   aurait dû rester à jamais synchronisé avec le premier ; il n'y en a qu'un.
   ============================================================ */
import { type SchoolLevel } from '../core/catalog';
import { niveauProfilMatiere } from '../core/encadrant-stats';
import { html, type SafeHtml, joindre, drapeau } from '../core/html';
import { labelLeconOrtho, listOrthoLecons } from '../core/orthographe/lessons';
import { loadOrthoFor } from '../core/orthographe/store';
import { listProfiles } from '../core/profiles';
import { chargerSeancesFor, ciblesEtape } from '../core/seance';
import { cleRecherche } from '../core/utils';
import { consulteUuid, container, onChangementProfilConsulte } from './encadrant-commun';

/* Un groupe = un titre + ses cibles {id, label}. Les LEÇONS, elles, ne passent plus par
   une liste : elles sont choisies dans le sélecteur tous niveaux (#556). */
export interface Groupe {
	label: string;
	items: { id: string; label: string }[];
}

/* Listes d'orthographe proposables comme cible d'une étape « Une dictée » : dictées
   prédéfinies (au niveau du profil, cumulatif) puis listes propres au profil consulté. */
export function groupesDictee(uuid: string, niveauFr: SchoolLevel, nom: string): Groupe[] {
	const refs = listOrthoLecons(loadOrthoFor(uuid), niveauFr);
	const groupes: Groupe[] = [];
	const predef = refs
		.filter((r) => r.source === 'predefini')
		.map((r) => ({ id: r.id, label: r.label }));
	const listes = refs
		.filter((r) => r.source === 'liste')
		.map((r) => ({ id: r.id, label: r.label }));
	if (predef.length) groupes.push({ label: 'Dictées proposées', items: predef });
	if (listes.length) groupes.push({ label: `Listes de ${nom}`, items: listes });
	return groupes;
}

/* Groupes AFFICHÉS : les proposables, plus un groupe « Cibles actuelles (indisponibles) »
   pour toute cible cochée absente des groupes (liste supprimée, hors niveau) — elle doit
   rester décochable, jamais de sélection perdue en silence (#463). Pur. */
export function groupesAffiches(
	dictees: Groupe[],
	selected: readonly string[],
	resoudreLabel: (id: string) => string | null,
): { groupes: Groupe[]; orphelins: string[] } {
	const dispo = new Set(dictees.flatMap((g) => g.items.map((it) => it.id)));
	const orphelins = selected.filter((id) => !dispo.has(id));
	const groupes: Groupe[] = orphelins.length
		? [
				...dictees,
				{
					label: 'Cibles actuelles (indisponibles)',
					items: orphelins.map((id) => ({ id, label: resoudreLabel(id) ?? id })),
				},
			]
		: dictees;
	return { groupes, orphelins };
}

/* ---------- État du filtre (module) ---------- */
const filtresDictees = new Map<string, string>();
const cleFiltre = (uuid: string, defId: string, etapeId: string): string =>
	`${uuid}|${defId}|${etapeId}`;
onChangementProfilConsulte(() => filtresDictees.clear());

/** Texte du filtre d'une étape, pour le profil consulté (vide par défaut). */
export function filtreDictees(uuid: string, defId: string, etapeId: string): string {
	return filtresDictees.get(cleFiltre(uuid, defId, etapeId)) ?? '';
}

/** Une ligne de dictée est-elle visible sous ce filtre ? Cochée = toujours. Pur. */
export function dicteeVisible(label: string, cochee: boolean, filtre: string): boolean {
	const q = cleRecherche(filtre);
	return cochee || q === '' || cleRecherche(label).includes(q);
}

/** Nombre de lignes visibles sous un filtre, tous groupes confondus. Pur. */
export function nbVisibles(
	groupes: readonly Groupe[],
	selected: readonly string[],
	filtre: string,
): number {
	let n = 0;
	for (const g of groupes)
		for (const it of g.items) if (dicteeVisible(it.label, selected.includes(it.id), filtre)) n++;
	return n;
}

/** Id du repère de comptage d'une étape (`aria-describedby` de chaque case). */
export const hintIdDictees = (defId: string, etapeId: string): string =>
	`dictee-hint-${defId}-${etapeId}`;

/* Délai avant une annonce aux aides techniques (même valeur que le sélecteur, #556) :
   réécrite à chaque lettre, une synthèse vocale s'interromprait elle-même. */
export const DELAI_ANNONCE = 350;
let annonceTimer: number | undefined;

/* ---------- Rendu ---------- */
/** Le champ de filtre et sa région live (relecture a11y #722, SC 4.1.3 : qui n'a pas la
    liste sous les yeux doit entendre combien de dictées restent, « 0 » compris). Distincte
    du repère de comptage, qui compte les cibles COCHÉES. */
export function champFiltreHTML(defId: string, etapeId: string, filtre: string): SafeHtml {
	return html`<div class="enc-seance-dictees-filtre">
      <label class="enc-sel-rech"><span class="sr-only">Filtrer les dictées</span><input type="search" class="enc-input" id="dictee-filtre-${defId}-${etapeId}" data-act="seance-dictee-filtre" data-def="${defId}" data-etape="${etapeId}" placeholder="Filtrer les dictées…" value="${filtre}" autocomplete="off" /></label>
      <p class="sr-only enc-seance-dictees-filtre-statut" role="status" aria-live="polite"></p>
    </div>`;
}

/** Les groupes et leurs cases, filtre appliqué — c'est le fragment que la frappe re-rend.
    Chaque case pointe le repère par `aria-describedby` : comme le focus revient sur la case
    cochée après re-rendu, le lecteur d'écran relit l'état à jour dans la même passe. */
export function corpsDicteesHTML(
	defId: string,
	etapeId: string,
	groupes: readonly Groupe[],
	selected: readonly string[],
	filtre: string,
): SafeHtml {
	const hintId = hintIdDictees(defId, etapeId);
	return joindre(
		groupes.map((g) => {
			let visibles = 0;
			const cases = joindre(
				g.items.map((it) => {
					const on = selected.includes(it.id);
					const visible = dicteeVisible(it.label, on, filtre);
					if (visible) visibles++;
					return html`<label class="enc-seance-dictee${on ? ' on' : ''}"${visible ? '' : drapeau('hidden')}><input type="checkbox" data-act="seance-dictee-toggle" data-def="${defId}" data-etape="${etapeId}" data-ref="${it.id}" aria-describedby="${hintId}"${on ? drapeau('checked') : ''} /><span>${it.label}</span></label>`;
				}),
			);
			// role="group" + aria-label expose le regroupement (le <p> visuel est masqué pour
			// éviter la double annonce), même brique que recurrenceHTML.
			return html`<div class="enc-seance-dictees-groupe" role="group" aria-label="${g.label}"${visibles ? '' : drapeau('hidden')}><p class="enc-seance-dictees-grp" aria-hidden="true">${g.label}</p>${cases}</div>`;
		}),
	);
}

/* ---------- Handler ---------- */
/** Frappe dans le filtre (`input`, pas `change`) : mémorise le texte, re-rend le seul corps
    de la liste (le champ, hors du corps, garde focus et curseur ; les cases repartent de la
    définition stockée, donc aucune ne change d'état), puis annonce le compte avec délai.
    Aiguillé par l'orchestrateur (`ui/encadrant.ts`). */
export function seanceInput(act: string, el: HTMLElement): boolean {
	if (act !== 'seance-dictee-filtre') return false;
	const uuid = consulteUuid();
	const defId = el.dataset.def ?? '';
	const etapeId = el.dataset.etape ?? '';
	if (!uuid || !defId || !etapeId) return true;
	const filtre = (el as HTMLInputElement).value;
	filtresDictees.set(cleFiltre(uuid, defId, etapeId), filtre);

	const consulte = listProfiles().find((p) => p.uuid === uuid);
	const etape = chargerSeancesFor(uuid)
		.find((d) => d.id === defId)
		?.etapes.find((e) => e.id === etapeId);
	const fieldset = el.closest<HTMLElement>('fieldset.enc-seance-dictees');
	const corps = fieldset?.querySelector<HTMLElement>('.enc-seance-dictees-corps');
	if (!consulte || !etape || !fieldset || !corps) return true;

	const selected = ciblesEtape(etape);
	const listes = loadOrthoFor(uuid).listes;
	const { groupes } = groupesAffiches(
		groupesDictee(uuid, niveauProfilMatiere(consulte, 'francais'), consulte.name),
		selected,
		(id) => labelLeconOrtho(id, listes),
	);
	corps.innerHTML = corpsDicteesHTML(defId, etapeId, groupes, selected, filtre).balisage;

	const total = nbVisibles(groupes, selected, filtre);
	const statut = fieldset.querySelector<HTMLElement>('.enc-seance-dictees-filtre-statut');
	window.clearTimeout(annonceTimer);
	annonceTimer = window.setTimeout(() => {
		if (statut && container()?.contains(statut))
			statut.textContent = total > 1 ? `${total} dictées affichées.` : `${total} dictée affichée.`;
	}, DELAI_ANNONCE);
	return true;
}
