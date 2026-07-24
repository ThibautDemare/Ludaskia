/* ============================================================
   Espace encadrant (#234, #440) — COMPOSITEUR du « programme du jour ».
   ------------------------------------------------------------
   Bloc de composition, côté ADULTE, du « programme du jour » d'un profil CONSULTÉ
   (par UUID, sans changer le profil actif — même parti pris que le reste de l'espace).
   La LOGIQUE PURE + le stockage vivent dans core/seance.ts (contrat figé) : ce module
   ne fait que le RENDU et l'aiguillage des interactions. Persistance IMMÉDIATE à chaque
   action (enregistrerSeancesFor puis re-rendu), comme les réglages.

   Vocabulaire à l'écran (décision mainteneur) : « programme » / « programme du jour »,
   jamais « séance » — le nom INTERNE des types/fonctions du cœur (SeanceDef, etc.) reste
   inchangé, seul le texte affiché dit « programme ».

   Ce qu'on compose : une liste d'ÉTAPES (modes existants), une récurrence (une date
   ponctuelle OU des jours de semaine), un nom facultatif. Garde-fou « une seule par
   jour » : on empêche une récurrence en conflit avec un autre programme du profil
   (recurrencesEnConflit) — message clair, jamais de blocage dur du volume.
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { icon } from './icon';
import type { IconName } from '../core/icon-names';
import { listProfiles, type Profile } from '../core/profiles';
import {
	SUBJECTS,
	CATEGORIES,
	getLessonsBySubject,
	getLessonById,
	type SchoolLevel,
} from '../core/catalog';
import { niveauProfilMatiere } from '../core/encadrant-stats';
import { listOrthoLecons, labelLeconOrtho } from '../core/orthographe/lessons';
import { loadOrthoFor } from '../core/orthographe/store';
import {
	SEANCE_MODE_INFOS,
	chargerSeancesFor,
	enregistrerSeancesFor,
	copierSeances,
	ciblesEtape,
	genEtapeId,
	genDefId,
	estimationDureeMin,
	recurrencesEnConflit,
	type SeanceDef,
	type SeanceEtape,
	type SeanceModeKind,
	type SeanceRecurrence,
} from '../core/seance';
import { uiConfirm, uiPrompt, toast } from './ui-modal';
import { consulteUuid, container, renderEspace } from './encadrant-commun';

/* ---------- État de la section (module) ---------- */
/* Message de conflit de récurrence, rattaché à un programme précis d'un profil précis
   (les identifiants `d1`, `d2`… se répètent d'un profil à l'autre) : affiché en `.enc-warn`
   dans la carte concernée, effacé à la première action réussie. */
let conflit: { uuid: string; defId: string; msg: string } | null = null;

/* Ordre d'affichage des modes dans le sélecteur « Ajouter une activité ». */
const MODES: SeanceModeKind[] = ['sprint', 'revision', 'leconDuJour', 'lecon', 'dictee'];
/* Icône par mode (redouble le libellé — jamais la couleur seule). */
const MODE_ICONE: Record<SeanceModeKind, IconName> = {
	sprint: 'timer',
	revision: 'clock-clockwise',
	leconDuJour: 'star',
	lecon: 'book-open',
	dictee: 'feather',
};
/* Paliers fixes du nombre de répétitions d'une étape (pas de saisie libre). */
const PALIERS = [1, 2, 3, 4, 5];
const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const JOURS_LONGS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/* ---------- Cibles sélectionnables (leçons / dictées) ----------
   Un groupe = un `<optgroup>` (libellé) + ses options {id, label}. */
interface Groupe {
	label: string;
	items: { id: string; label: string }[];
}

/* Leçons du catalogue proposables comme cible d'une étape « Une leçon précise »,
   filtrées AU NIVEAU du profil (par matière) et regroupées par catégorie — la même
   sélection, dans le même ordre pédagogique, que ce que l'enfant voit. */
function groupesLecon(consulte: Profile): Groupe[] {
	const groupes: Groupe[] = [];
	for (const sub of SUBJECTS) {
		const niveau = niveauProfilMatiere(consulte, sub.id);
		const parCat = new Map<string, Groupe>();
		for (const l of getLessonsBySubject(sub.id, niveau)) {
			let g = parCat.get(l.category);
			if (!g) {
				const cat = CATEGORIES.find((c) => c.id === l.category);
				g = { label: `${sub.label} · ${cat ? cat.label : l.category}`, items: [] };
				parCat.set(l.category, g);
			}
			g.items.push({ id: l.id, label: l.label });
		}
		for (const g of parCat.values()) if (g.items.length) groupes.push(g);
	}
	return groupes;
}

/* Listes d'orthographe proposables comme cible d'une étape « Une dictée » :
   dictées prédéfinies (au niveau du profil) puis listes propres au profil consulté. */
function groupesDictee(uuid: string, niveauFr: SchoolLevel, nom: string): Groupe[] {
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

/* Première cible disponible (défaut à la création d'une étape à référence). */
function premiereRef(groupes: Groupe[]): string | undefined {
	return groupes[0]?.items[0]?.id;
}

/* Options d'un sélecteur de cible. Si la cible stockée n'est plus dans la liste (leçon
   hors niveau, liste supprimée), on la préserve dans un groupe « Cible actuelle » avec son
   libellé résolu (ou l'identifiant), pour ne jamais afficher une sélection fausse. */
function optionsCibleHTML(
	groupes: Groupe[],
	selected: string | undefined,
	resoudreLabel: (id: string) => string | null,
): string {
	const present = !!selected && groupes.some((g) => g.items.some((it) => it.id === selected));
	const tete =
		selected && !present
			? `<optgroup label="Cible actuelle"><option value="${escapeHTML(selected)}" selected>${escapeHTML(
					resoudreLabel(selected) ?? selected,
				)}</option></optgroup>`
			: '';
	const corps = groupes
		.map(
			(g) =>
				`<optgroup label="${escapeHTML(g.label)}">${g.items
					.map(
						(it) =>
							`<option value="${escapeHTML(it.id)}"${it.id === selected ? ' selected' : ''}>${escapeHTML(
								it.label,
							)}</option>`,
					)
					.join('')}</optgroup>`,
		)
		.join('');
	return tete + corps;
}

/* Cases à cocher des dictées visées par une étape « Une dictée » (#463) : le pool
   `refs` (ou l'ancien `ref` unique, rétrocompat) présenté comme une liste à cocher.
   1 cochée ⇒ dictée figée (toujours la même) ; 2+ ⇒ une au hasard à chaque lancement.
   Une cible cochée absente des groupes (liste supprimée, hors niveau) est préservée dans
   un groupe « Cible actuelle » pour rester décochable (jamais de sélection perdue en silence). */
/* Texte d'aide sous la liste à cocher, selon le nombre de cibles cochées (#463). */
function hintDictees(n: number, totalDispo: number, hasOrphelins: boolean): string {
	if (totalDispo === 0 && !hasOrphelins)
		return "Pour l'instant, aucune dictée n'est disponible pour ce profil.";
	if (n === 0) return 'Choisissez au moins une dictée.';
	if (n === 1) return 'Une seule dictée : toujours celle-ci.';
	return `${n} dictées : une au hasard à chaque lancement.`;
}

function checkboxesDicteeHTML(
	def: SeanceDef,
	etape: SeanceEtape,
	dictees: Groupe[],
	resoudreLabel: (id: string) => string | null,
): string {
	const selected = ciblesEtape(etape);
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
	// Le repère est décrit par chaque case (aria-describedby) : comme le focus revient sur
	// la case cochée après re-rendu, le lecteur d'écran relit l'état à jour dans la même passe.
	const hintId = `dictee-hint-${def.id}-${etape.id}`;
	const corps = groupes
		.map((g) => {
			const cases = g.items
				.map((it) => {
					const on = selected.includes(it.id);
					return `<label class="enc-seance-dictee${on ? ' on' : ''}"><input type="checkbox" data-act="seance-dictee-toggle" data-def="${def.id}" data-etape="${etape.id}" data-ref="${escapeHTML(it.id)}" aria-describedby="${hintId}"${on ? ' checked' : ''} /><span>${escapeHTML(it.label)}</span></label>`;
				})
				.join('');
			// role="group" + aria-label expose le regroupement (le <p> visuel est masqué pour
			// éviter la double annonce), même brique que recurrenceHTML.
			return `<div class="enc-seance-dictees-groupe" role="group" aria-label="${escapeHTML(g.label)}"><p class="enc-seance-dictees-grp" aria-hidden="true">${escapeHTML(g.label)}</p>${cases}</div>`;
		})
		.join('');
	const totalDispo = dictees.reduce((s, g) => s + g.items.length, 0);
	const hint = hintDictees(selected.length, totalDispo, orphelins.length > 0);
	return `<fieldset class="enc-seance-dictees" data-def="${def.id}" data-etape="${etape.id}">
      <legend class="sr-only">Dictées visées (une ou plusieurs)</legend>
      ${corps}
      <p id="${hintId}" class="enc-seance-dictees-hint">${escapeHTML(hint)}</p>
    </fieldset>`;
}

/* ---------- Récurrence ---------- */
function estVide(rec: SeanceRecurrence): boolean {
	return rec.type === 'date' ? !rec.date : rec.jours.length === 0;
}

/* Premier autre programme du profil dont la récurrence se dispute un jour avec `rec`
   (garde-fou « un seul programme par jour »). Une récurrence vide (aucune date / aucun
   jour) ne s'applique jamais → jamais en conflit. */
function premierConflit(
	defs: SeanceDef[],
	defId: string,
	rec: SeanceRecurrence,
): SeanceDef | undefined {
	if (estVide(rec)) return undefined;
	return defs.find(
		(d) => d.id !== defId && !estVide(d.recurrence) && recurrencesEnConflit(rec, d.recurrence),
	);
}

/* Désignation d'un programme pour un message de conflit. Renvoie du texte BRUT (non
   échappé) : le message complet est échappé une seule fois à l'affichage (defHTML). */
function nomProgramme(def: SeanceDef): string {
	return def.nom ? `« ${def.nom} »` : 'Un autre programme';
}

function formatDate(d: string): string {
	if (!d) return "aucune date choisie pour l'instant";
	// 'T00:00' force l'heure locale (sinon 'YYYY-MM-DD' est interprété en UTC → décalage d'un jour).
	const dt = new Date(d + 'T00:00');
	if (Number.isNaN(dt.getTime())) return d;
	return dt.toLocaleDateString('fr-FR', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

function resumeRecurrence(rec: SeanceRecurrence): string {
	if (rec.type === 'date') {
		return rec.date
			? `Programmé pour le ${formatDate(rec.date)}.`
			: "Aucune date choisie pour l'instant.";
	}
	if (rec.jours.length === 0) return 'Choisissez au moins un jour de la semaine.';
	const jours = [...rec.jours].sort((a, b) => a - b).map((j) => JOURS_LONGS[j - 1]);
	return `Chaque semaine : ${jours.join(', ')}.`;
}

function recurrenceHTML(def: SeanceDef): string {
	const estDate = def.recurrence.type === 'date';
	const bascule = `<div class="enc-act-modes" role="group" aria-label="Quand proposer ce programme">
      <button type="button" class="enc-act-mode${estDate ? ' on' : ''}" data-act="seance-rec-type" data-def="${def.id}" data-type="date" aria-pressed="${estDate}">Une date</button>
      <button type="button" class="enc-act-mode${!estDate ? ' on' : ''}" data-act="seance-rec-type" data-def="${def.id}" data-type="hebdo" aria-pressed="${!estDate}">Chaque semaine</button>
    </div>`;
	let corps: string;
	if (def.recurrence.type === 'date') {
		corps = `<label class="enc-row enc-seance-date-row"><span>Date</span>
        <input type="date" class="enc-seance-date" data-act="seance-rec-date" data-def="${def.id}" value="${escapeHTML(def.recurrence.date)}" />
      </label>`;
	} else {
		const jours = def.recurrence.jours;
		corps = `<fieldset class="enc-seance-jours">
        <legend class="sr-only">Jours de la semaine</legend>
        ${JOURS_COURTS.map((lab, i) => {
					const jour = i + 1;
					const on = jours.includes(jour);
					return `<label class="enc-seance-jour${on ? ' on' : ''}"><input type="checkbox" aria-label="${JOURS_LONGS[i]}" data-act="seance-rec-jour" data-def="${def.id}" data-jour="${jour}"${on ? ' checked' : ''} /><span aria-hidden="true">${lab}</span></label>`;
				}).join('')}
      </fieldset>`;
	}
	return `<div class="enc-seance-rec">
      ${bascule}
      ${corps}
      <p class="enc-hint">${escapeHTML(resumeRecurrence(def.recurrence))}</p>
    </div>`;
}

/* ---------- Étapes ---------- */
function etapeHTML(
	def: SeanceDef,
	etape: SeanceEtape,
	consulte: Profile,
	lecons: Groupe[],
	dictees: Groupe[],
): string {
	const info = SEANCE_MODE_INFOS[etape.kind];
	let cibleInline = ''; // sélecteur compact sur la ligne (leçon)
	let cibleBloc = ''; // bloc pleine largeur sous la ligne (pool de dictées, #463)
	if (info.ref === 'lecon') {
		cibleInline = `<label class="enc-seance-cible"><span class="sr-only">Leçon visée</span>
        <select class="enc-select-niveau" data-act="seance-ref" data-def="${def.id}" data-etape="${etape.id}">${optionsCibleHTML(
					lecons,
					etape.ref,
					(id) => getLessonById(id)?.label ?? null,
				)}</select></label>`;
	} else if (info.ref === 'dictee') {
		cibleBloc = checkboxesDicteeHTML(def, etape, dictees, (id) =>
			labelLeconOrtho(id, loadOrthoFor(consulte.uuid).listes),
		);
	}
	const count = `<label class="enc-seance-count"><span class="sr-only">Nombre de fois</span>
      <select class="enc-select-niveau" data-act="seance-count" data-def="${def.id}" data-etape="${etape.id}">${PALIERS.map(
				(n) => `<option value="${n}"${n === etape.count ? ' selected' : ''}>× ${n}</option>`,
			).join('')}</select></label>`;
	return `<li class="enc-seance-etape">
      <span class="enc-seance-etape-mode">${icon(MODE_ICONE[etape.kind])} ${escapeHTML(info.label)}</span>
      ${cibleInline}
      ${count}
      <button type="button" class="enc-seance-etape-del" data-act="seance-etape-del" data-def="${def.id}" data-etape="${etape.id}" aria-label="Retirer cette activité">${icon('trash')}</button>
      ${cibleBloc}
    </li>`;
}

/* ---------- Une définition (carte) ---------- */
function defHTML(def: SeanceDef, consulte: Profile, lecons: Groupe[], dictees: Groupe[]): string {
	const nom = def.nom ? escapeHTML(def.nom) : 'Programme sans nom';
	const duree = estimationDureeMin(def);
	const nb = def.etapes.length;
	const warn =
		conflit && conflit.uuid === consulte.uuid && conflit.defId === def.id
			? `<p class="enc-warn" role="alert">${escapeHTML(conflit.msg)}</p>`
			: '';
	const etapes = nb
		? `<ul class="enc-seance-etapes">${def.etapes.map((e) => etapeHTML(def, e, consulte, lecons, dictees)).join('')}</ul>`
		: `<p class="enc-hint">Aucune activité pour l'instant : ajoutez-en une ci-dessous.</p>`;
	const ajout = `<label class="enc-seance-add-etape">
      <span class="sr-only">Ajouter une activité</span>
      <select class="enc-select-niveau" data-act="seance-etape-add" data-def="${def.id}">
        <option value="">+ Ajouter une activité…</option>
        ${MODES.map((k) => `<option value="${k}">${escapeHTML(SEANCE_MODE_INFOS[k].label)}</option>`).join('')}
      </select>
    </label>`;
	return `<div class="enc-block enc-seance-def">
      <div class="enc-seance-def-head">
        <span class="enc-seance-def-nom">${nom}</span>
        <span class="enc-seance-duree">${icon('timer')} ~${duree} min</span>
        <button type="button" class="enc-btn-sec" data-act="seance-rename" data-def="${def.id}">${icon('pencil')} Renommer</button>
        <button type="button" class="enc-btn-sec enc-danger" data-act="seance-del" data-def="${def.id}">${icon('trash')} Supprimer</button>
      </div>
      ${warn}
      <h3 class="enc-h3">${icon('calendar')} Quand ?</h3>
      ${recurrenceHTML(def)}
      <h3 class="enc-h3">${icon('list')} Activités</h3>
      ${etapes}
      ${ajout}
      <p class="enc-hint">${nb} activité${nb > 1 ? 's' : ''} · ~${duree} min. Repère : 2 à 3 activités, 10 à 15 min (rien n'est bloqué).</p>
    </div>`;
}

/* ---------- Copier vers un autre profil ---------- */
function copieHTML(consulte: Profile, aDesProgrammes: boolean): string {
	const autres = listProfiles().filter((p) => p.uuid !== consulte.uuid);
	if (autres.length === 0) return '';
	const opts = autres
		.map((p) => `<option value="${escapeHTML(p.uuid)}">${escapeHTML(p.name)}</option>`)
		.join('');
	return `<div class="enc-block enc-seance-copie">
      <h3 class="enc-h3">Copier ces programmes</h3>
      <p class="enc-hint">Copiez les programmes de ${escapeHTML(consulte.name)} vers un autre profil. Les programmes du profil choisi seront remplacés.</p>
      <div class="enc-actions">
        <select id="seanceCopyCible" class="enc-select-niveau" data-act="seance-copy-cible" aria-label="Profil de destination">${opts}</select>
        <button type="button" class="enc-btn-sec" data-act="seance-copy"${aDesProgrammes ? '' : ' disabled'}>Copier vers ce profil</button>
      </div>
      ${aDesProgrammes ? '' : '<p class="enc-hint">Composez au moins un programme avant de pouvoir le copier.</p>'}
    </div>`;
}

/* ---------- Bloc principal (composé par l'orchestrateur) ---------- */
export function seanceHTML(consulte: Profile): string {
	const defs = chargerSeancesFor(consulte.uuid);
	const lecons = groupesLecon(consulte);
	const dictees = groupesDictee(
		consulte.uuid,
		niveauProfilMatiere(consulte, 'francais'),
		consulte.name,
	);
	const titre = `<h2 class="enc-h2">${icon('calendar')} Programme du jour de ${escapeHTML(consulte.name)}</h2>`;
	const cartes = defs.length
		? defs.map((d) => defHTML(d, consulte, lecons, dictees)).join('')
		: `<p class="enc-hint">${escapeHTML(consulte.name)} n'a pas encore de programme du jour.</p>`;
	return `<section class="enc-section enc-seance-section">
      ${titre}
      <p class="enc-seance-frame">Composez pour ${escapeHTML(consulte.name)} un « programme du jour » : une petite liste d'activités qu'il ou elle retrouvera et fera dans l'ordre de son choix. Un seul programme s'applique par jour.</p>
      ${cartes}
      <button type="button" class="enc-btn-sec enc-seance-add" data-act="seance-add">${icon('plus')} Nouveau programme</button>
      ${copieHTML(consulte, defs.length > 0)}
    </section>`;
}

/* ---------- Plomberie interne ---------- */
function profilConsulte(): Profile | null {
	const uuid = consulteUuid();
	if (!uuid) return null;
	return listProfiles().find((p) => p.uuid === uuid) ?? null;
}

/* Re-rend l'espace puis rend le focus clavier à l'élément désigné (le re-rendu recrée
   tout le DOM ; sans ça, la navigation clavier repartirait du haut de la page). */
function rendre(refocusSel?: string, restoreScroll?: { sel: string; top: number }): void {
	renderEspace();
	const c = container();
	if (restoreScroll) {
		const sc = c?.querySelector(restoreScroll.sel) as HTMLElement | null;
		if (sc) sc.scrollTop = restoreScroll.top;
	}
	if (refocusSel)
		(c?.querySelector(refocusSel) as HTMLElement | null)?.focus({ preventScroll: true });
}

/* ---------- Handlers délégués (aiguillés par l'orchestrateur) ---------- */
export function seanceClick(act: string, el: HTMLElement): boolean {
	const consulte = profilConsulte();
	if (!consulte) return false;
	const uuid = consulte.uuid;
	switch (act) {
		case 'seance-add': {
			const defs = chargerSeancesFor(uuid);
			defs.push({ id: genDefId(defs), etapes: [], recurrence: { type: 'hebdo', jours: [] } });
			enregistrerSeancesFor(uuid, defs);
			conflit = null;
			rendre();
			return true;
		}
		case 'seance-del':
			onDel(consulte, el.dataset.def ?? '');
			return true;
		case 'seance-rename':
			onRename(consulte, el.dataset.def ?? '');
			return true;
		case 'seance-rec-type': {
			const type = el.dataset.type === 'date' ? 'date' : 'hebdo';
			const defs = chargerSeancesFor(uuid);
			const def = defs.find((d) => d.id === el.dataset.def);
			if (!def || def.recurrence.type === type) return true; // re-clic sur le type actif : rien à faire
			def.recurrence = type === 'date' ? { type: 'date', date: '' } : { type: 'hebdo', jours: [] };
			enregistrerSeancesFor(uuid, defs);
			conflit = null;
			rendre(`[data-act="seance-rec-type"][data-def="${def.id}"][data-type="${type}"]`);
			return true;
		}
		case 'seance-etape-del': {
			const defs = chargerSeancesFor(uuid);
			const def = defs.find((d) => d.id === el.dataset.def);
			if (!def) return true;
			def.etapes = def.etapes.filter((e) => e.id !== el.dataset.etape);
			enregistrerSeancesFor(uuid, defs);
			conflit = null;
			rendre();
			return true;
		}
		case 'seance-copy':
			onCopy(consulte);
			return true;
	}
	return false;
}

export function seanceChange(act: string, t: HTMLInputElement | HTMLSelectElement): boolean {
	if (act === 'seance-copy-cible') return true; // sélecteur de cible de copie : lu au clic « Copier »
	const consulte = profilConsulte();
	if (!consulte) return false;
	const uuid = consulte.uuid;
	const defId = t.dataset.def ?? '';
	switch (act) {
		case 'seance-etape-add': {
			const kind = t.value as SeanceModeKind;
			if (!MODES.includes(kind)) return true; // placeholder « + Ajouter… »
			const defs = chargerSeancesFor(uuid);
			const def = defs.find((d) => d.id === defId);
			if (!def) return true;
			const etape: SeanceEtape = { id: genEtapeId(def), kind, count: 1 };
			const ref = SEANCE_MODE_INFOS[kind].ref;
			if (ref === 'lecon') etape.ref = premiereRef(groupesLecon(consulte));
			else if (ref === 'dictee') {
				// Pool de dictées (#463) : par défaut la 1re dictée cochée (⇒ comportement figé).
				const first = premiereRef(
					groupesDictee(uuid, niveauProfilMatiere(consulte, 'francais'), consulte.name),
				);
				if (first) etape.refs = [first];
			}
			def.etapes.push(etape);
			enregistrerSeancesFor(uuid, defs);
			conflit = null;
			rendre(`select[data-act="seance-etape-add"][data-def="${defId}"]`);
			return true;
		}
		case 'seance-count': {
			const defs = chargerSeancesFor(uuid);
			const etape = defs.find((d) => d.id === defId)?.etapes.find((e) => e.id === t.dataset.etape);
			if (!etape) return true;
			etape.count = Math.min(5, Math.max(1, Number(t.value) || 1));
			enregistrerSeancesFor(uuid, defs);
			conflit = null;
			rendre(
				`select[data-act="seance-count"][data-def="${defId}"][data-etape="${t.dataset.etape}"]`,
			);
			return true;
		}
		case 'seance-ref': {
			const defs = chargerSeancesFor(uuid);
			const etape = defs.find((d) => d.id === defId)?.etapes.find((e) => e.id === t.dataset.etape);
			if (!etape) return true;
			etape.ref = t.value || undefined;
			enregistrerSeancesFor(uuid, defs);
			conflit = null;
			rendre(`select[data-act="seance-ref"][data-def="${defId}"][data-etape="${t.dataset.etape}"]`);
			return true;
		}
		case 'seance-dictee-toggle': {
			const defs = chargerSeancesFor(uuid);
			const etape = defs.find((d) => d.id === defId)?.etapes.find((e) => e.id === t.dataset.etape);
			if (!etape) return true;
			const ref = t.dataset.ref ?? '';
			const coche = (t as HTMLInputElement).checked;
			const actuels = ciblesEtape(etape);
			// On bascule sur le pool `refs` (le champ legacy `ref` unique n'a plus cours).
			etape.refs = coche ? [...new Set([...actuels, ref])] : actuels.filter((r) => r !== ref);
			delete etape.ref;
			enregistrerSeancesFor(uuid, defs);
			conflit = null;
			// Conserve le scroll de la liste (capée à 220px) : le re-rendu recrée le conteneur
			// (scrollTop=0) et le refocus est en preventScroll — sans ça, cocher une case du bas
			// enverrait le repère de focus hors du cadre visible.
			const scrollSel = `fieldset.enc-seance-dictees[data-def="${defId}"][data-etape="${t.dataset.etape}"]`;
			const top = (container()?.querySelector(scrollSel) as HTMLElement | null)?.scrollTop ?? 0;
			rendre(
				`input[data-act="seance-dictee-toggle"][data-def="${defId}"][data-etape="${t.dataset.etape}"][data-ref="${ref}"]`,
				{ sel: scrollSel, top },
			);
			return true;
		}
		case 'seance-rec-date': {
			const defs = chargerSeancesFor(uuid);
			const def = defs.find((d) => d.id === defId);
			if (!def) return true;
			const propose: SeanceRecurrence = { type: 'date', date: t.value };
			const autre = premierConflit(defs, def.id, propose);
			const sel = `input[data-act="seance-rec-date"][data-def="${defId}"]`;
			if (autre) {
				conflit = {
					uuid,
					defId: def.id,
					msg: `${nomProgramme(autre)} est déjà prévu à cette date. Choisissez-en une autre.`,
				};
				rendre(sel); // pas de persistance : le re-rendu remet la valeur stockée
				return true;
			}
			def.recurrence = propose;
			enregistrerSeancesFor(uuid, defs);
			conflit = null;
			rendre(sel);
			return true;
		}
		case 'seance-rec-jour': {
			const defs = chargerSeancesFor(uuid);
			const def = defs.find((d) => d.id === defId);
			if (!def) return true;
			const jour = Number(t.dataset.jour);
			const coche = (t as HTMLInputElement).checked;
			const actuels = def.recurrence.type === 'hebdo' ? def.recurrence.jours : [];
			const jours = coche
				? [...new Set([...actuels, jour])].sort((a, b) => a - b)
				: actuels.filter((j) => j !== jour);
			const propose: SeanceRecurrence = { type: 'hebdo', jours };
			const sel = `input[data-act="seance-rec-jour"][data-def="${defId}"][data-jour="${jour}"]`;
			const autre = coche ? premierConflit(defs, def.id, propose) : undefined;
			if (autre) {
				conflit = {
					uuid,
					defId: def.id,
					msg: `${nomProgramme(autre)} est déjà prévu ce jour-là. Choisissez un autre jour.`,
				};
				rendre(sel); // pas de persistance : le re-rendu décoche
				return true;
			}
			def.recurrence = propose;
			enregistrerSeancesFor(uuid, defs);
			conflit = null;
			rendre(sel);
			return true;
		}
	}
	return false;
}

/* ---------- Actions asynchrones (modales) ---------- */
function onDel(consulte: Profile, defId: string): void {
	const defs = chargerSeancesFor(consulte.uuid);
	const def = defs.find((d) => d.id === defId);
	if (!def) return;
	void uiConfirm({
		title: 'Supprimer ce programme ?',
		message: def.nom
			? `Le programme « ${def.nom} » sera définitivement supprimé.`
			: 'Ce programme sera définitivement supprimé.',
		confirmLabel: 'Supprimer',
		destructive: true,
		confirmIcon: 'trash',
	}).then((ok) => {
		if (!ok) return;
		const a = chargerSeancesFor(consulte.uuid).filter((d) => d.id !== defId);
		enregistrerSeancesFor(consulte.uuid, a);
		conflit = null;
		rendre();
	});
}

function onRename(consulte: Profile, defId: string): void {
	const def = chargerSeancesFor(consulte.uuid).find((d) => d.id === defId);
	if (!def) return;
	void uiPrompt({
		title: 'Nom du programme',
		message: 'Un nom vous aide à repérer ce programme (facultatif).',
		okLabel: 'Renommer',
		defaultValue: def.nom ?? '',
		placeholder: 'Ex. Programme du lundi',
		selectDefault: true,
	}).then((n) => {
		if (!n) return;
		const defs = chargerSeancesFor(consulte.uuid);
		const cible = defs.find((d) => d.id === defId);
		if (!cible) return;
		cible.nom = n;
		enregistrerSeancesFor(consulte.uuid, defs);
		conflit = null;
		rendre();
	});
}

function onCopy(consulte: Profile): void {
	const sel = container()?.querySelector('#seanceCopyCible') as HTMLSelectElement | null;
	const cibleUuid = sel?.value;
	if (!cibleUuid) return;
	const cible = listProfiles().find((p) => p.uuid === cibleUuid);
	const nomCible = cible?.name ?? 'ce profil';
	void uiConfirm({
		title: `Copier les programmes vers ${nomCible} ?`,
		message: `Les programmes du jour de ${nomCible} seront remplacés par ceux de ${consulte.name}.`,
		confirmLabel: 'Copier',
		destructive: true,
		confirmIcon: 'reset',
	}).then((ok) => {
		if (!ok) return;
		copierSeances(consulte.uuid, cibleUuid);
		toast(`Programmes copiés vers ${nomCible}.`);
	});
}
