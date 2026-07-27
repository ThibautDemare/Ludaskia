/* ============================================================
   Espace encadrant (#234, découpage #354) — RÉCAP du mode Révision (#423).
   ------------------------------------------------------------
   Donne à l'encadrant une vue de la file de répétition espacée (#45) : ce qui
   est en révision et, PAR ENTRÉE, où elle en est dans le flux (palier + prochaine
   échéance). Deux visualisations, avec une bascule (même pattern que le graphe
   d'activité) : « Par catégorie » (regroupement dépliable, façon « Notions par
   catégorie ») et « Par urgence » (liste à plat, les plus en retard d'abord). Les
   entrées ACQUISES restent affichées, marquées d'un badge. Les calculs vivent dans
   core/encadrant-stats (revisionProfil) ; ici, le rendu et la bascule.
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { icon } from './icon';
import type { Profile } from '../core/profiles';
import {
	revisionProfil,
	echelleRevisionLabels,
	type RecapRevision,
	type EntreeRevision,
	type GroupeRevision,
} from '../core/encadrant-stats';
import { renderEspace, container } from './encadrant-commun';
import { segmentHTML } from './segment';

/* ---------- État de la section (module) ---------- */
let vueRevision: 'categorie' | 'urgence' = 'categorie'; // « Par catégorie » ou « Par urgence »

/* Une entrée de la file : libellé (+ catégorie en vue à plat) et, à droite, son état
   dans le flux — badge « acquis », ou palier courant + échéance relative. */
function entreeHTML(e: EntreeRevision, catLabel?: string): string {
	const etat = e.acquis
		? `<span class="enc-rev-badge">${icon('check-circle')} acquis</span>`
		: `<span class="enc-rev-palier">Palier : ${escapeHTML(e.palierLabel)}</span>
       <span class="enc-rev-echeance${e.du ? ' du' : ''}">${escapeHTML(e.echeance)}</span>`;
	// La catégorie n'est répétée qu'en vue à plat (en vue groupée, c'est l'en-tête).
	const cat = catLabel ? `<span class="enc-rev-cat">${escapeHTML(catLabel)}</span>` : '';
	// Nomme la nature « mot » pour les lecteurs d'écran (un mot isolé serait ambigu).
	const natureSr = e.nature === 'mot' ? '<span class="sr-only">Mot : </span>' : '';
	return `<li class="enc-rev-item${e.acquis ? ' acquis' : ''}">
      <span class="enc-rev-main">
        <span class="enc-rev-lab">${natureSr}${escapeHTML(e.label)}</span>
        ${cat}
      </span>
      <span class="enc-rev-etat">${etat}</span>
    </li>`;
}

/* Résumé chiffré d'un groupe (dénombrement, jamais de pourcentage). */
function resumeGroupe(g: GroupeRevision): string {
	const parts: string[] = [];
	// « dont M à réviser » (et non un compte séparé) : les dues sont un SOUS-ENSEMBLE des
	// entrées en révision — les juxtaposer laisserait croire à des comptes disjoints.
	if (g.enRotation > 0) {
		parts.push(`${g.enRotation} en révision${g.dues > 0 ? `, dont ${g.dues} à réviser` : ''}`);
	}
	if (g.acquises > 0) parts.push(`${g.acquises} acquise${g.acquises > 1 ? 's' : ''}`);
	return parts.join(' · ');
}

/* Vue « Par catégorie » : un <details> dépliable par catégorie (clavier natif),
   réutilise le chrome de « Notions par catégorie » (.enc-cat-d / .enc-cat-sum). */
function vueCategorieHTML(recap: RecapRevision): string {
	const cats = recap.groupes
		.map(
			(g) => `<details class="enc-cat-d enc-rev-d">
        <summary class="enc-cat-sum">
          <span class="enc-cat-lab">${escapeHTML(g.label)}</span>
          <span class="enc-cat-counts">${resumeGroupe(g)}</span>
        </summary>
        <ul class="enc-detail enc-rev-list">${g.entrees.map((e) => entreeHTML(e)).join('')}</ul>
      </details>`,
		)
		.join('');
	return `<div class="enc-cats">${cats}</div>`;
}

/* Vue « Par urgence » : liste à plat, les plus en retard d'abord ; la catégorie est
   rappelée sur chaque ligne puisqu'il n'y a plus d'en-tête de groupe. */
function vueUrgenceHTML(recap: RecapRevision): string {
	const labels: Record<string, string> = {};
	for (const g of recap.groupes) labels[g.categoryId] = g.label;
	return `<ul class="enc-rev-list enc-rev-flat">${recap.parUrgence
		.map((e) => entreeHTML(e, labels[e.categoryId]))
		.join('')}</ul>`;
}

/* ---------- Bloc principal (composé par l'orchestrateur, après le récap) ---------- */
export function revisionHTML(consulte: Profile, now: number): string {
	const recap = revisionProfil(consulte, now);
	const titre = `<h2 class="enc-h2">${icon('clock-clockwise')} Révisions de ${escapeHTML(consulte.name)}</h2>`;

	if (recap.total === 0) {
		return `<section class="enc-section enc-rev-section">
      ${titre}
      <p class="enc-rev-frame">Le mode Révision propose de revoir, à intervalles de plus en plus espacés, ce que ${escapeHTML(consulte.name)} a déjà travaillé.</p>
      <p class="enc-hint">Aucune révision n'est programmée pour l'instant : les révisions apparaîtront après les premières leçons et dictées.</p>
    </section>`;
	}

	// Séparateur « , » (et non « → ») : un lecteur d'écran annoncerait chaque flèche
	// (« flèche vers la droite ») ; la progression est déjà portée par « gravit cet escalier ».
	const escalier = echelleRevisionLabels().join(', ');
	const bascule = segmentHTML({
		act: 'revision-mode',
		valAttr: 'mode',
		label: 'Affichage des révisions',
		active: vueRevision,
		options: [
			{ val: 'categorie', label: 'Par catégorie' },
			{ val: 'urgence', label: 'Par urgence' },
		],
	});
	const synthese =
		`${recap.enRotation} entrée${recap.enRotation > 1 ? 's' : ''} en révision` +
		(recap.dues > 0 ? `, dont ${recap.dues} à réviser` : '') +
		(recap.acquises > 0
			? ` · ${recap.acquises} déjà acquise${recap.acquises > 1 ? 's' : ''}`
			: '') +
		'.';
	const corps = vueRevision === 'categorie' ? vueCategorieHTML(recap) : vueUrgenceHTML(recap);

	return `<section class="enc-section enc-rev-section">
      ${titre}
      <p class="enc-rev-frame">Le mode Révision propose de revoir, à intervalles de plus en plus espacés, ce que ${escapeHTML(consulte.name)} a déjà travaillé. Chaque entrée gravit cet escalier : ${escapeHTML(escalier)} ; plus le palier est haut, mieux la notion est ancrée.</p>
      <div class="enc-block">
        <p class="enc-hint">${synthese}</p>
        ${bascule}
        ${corps}
      </div>
    </section>`;
}

/* ---------- Handler délégué (aiguillé par l'orchestrateur) ---------- */
export function revisionClick(act: string, el: HTMLElement): boolean {
	if (act !== 'revision-mode') return false;
	vueRevision = el.dataset.mode === 'urgence' ? 'urgence' : 'categorie';
	renderEspace();
	// Le re-rendu recrée le DOM → on garde le focus clavier sur le bouton actif.
	(container()?.querySelector('[data-act="revision-mode"].on') as HTMLElement | null)?.focus({
		preventScroll: true,
	});
	return true;
}
