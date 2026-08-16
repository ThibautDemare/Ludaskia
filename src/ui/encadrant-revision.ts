/* ============================================================
   Espace encadrant (#234, découpage #354) — RÉCAP du mode Révision (#423).
   ------------------------------------------------------------
   Donne à l'encadrant une vue de la file de répétition espacée (#45) : ce qui
   est en révision et, PAR ENTRÉE, où elle en est dans le flux (palier + prochaine
   échéance). Trois visualisations, avec une bascule (même pattern que le graphe
   d'activité) : « Par catégorie » (regroupement dépliable, façon « Notions par
   catégorie »), « Par urgence » (liste à plat, les plus en retard d'abord) et
   « Par palier » (#555 — les étages de l'escalier, du plus fragile au plus ancré).
   Les entrées ACQUISES restent affichées, marquées d'un badge. Les calculs vivent
   dans core/encadrant-stats (revisionProfil) ; ici, le rendu et la bascule.
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
	type PalierRevision,
} from '../core/encadrant-stats';
import { LEVEL_LABEL } from '../core/levels';
import { renderEspace, container } from './encadrant-commun';
import { segmentHTML } from './segment';

/* ---------- État de la section (module) ---------- */
type VueRevision = 'categorie' | 'urgence' | 'palier';
let vueRevision: VueRevision = 'categorie';

interface RenduEntree {
	catLabel?: string; // catégorie rappelée sur la ligne (vues à plat, sans en-tête de catégorie)
	palierDejaAffiche?: boolean; // porté par l'en-tête d'étage, à ne pas répéter (vue « Par palier »)
}

/* Une entrée de la file : libellé (+ catégorie en vue à plat) et, à droite, son état
   dans le flux — badge « acquis », ou palier courant + échéance relative. */
function entreeHTML(e: EntreeRevision, o: RenduEntree = {}): string {
	// En vue « Par palier », l'en-tête d'étage porte déjà le palier (et le mot « acquis ») :
	// le répéter sur chaque ligne du même étage n'ajouterait rien et alourdirait la liste —
	// même principe que la catégorie, jamais répétée sous son propre en-tête. Reste
	// l'échéance, seule information qui varie d'une ligne à l'autre à palier égal. Un état
	// vide n'émet pas de conteneur (une coquille à styler pour rien).
	const bouts: string[] = [];
	if (!o.palierDejaAffiche) {
		bouts.push(
			e.acquis
				? `<span class="enc-rev-badge">${icon('check-circle')} acquis</span>`
				: `<span class="enc-rev-palier">Palier : ${escapeHTML(e.palierLabel)}</span>`,
		);
	}
	if (!e.acquis) {
		bouts.push(
			`<span class="enc-rev-echeance${e.du ? ' du' : ''}">${escapeHTML(e.echeance)}</span>`,
		);
	}
	const etat = bouts.length ? `<span class="enc-rev-etat">${bouts.join('')}</span>` : '';
	// La catégorie n'est répétée qu'en vue à plat (en vue groupée, c'est l'en-tête).
	const cat = o.catLabel ? `<span class="enc-rev-cat">${escapeHTML(o.catLabel)}</span>` : '';
	// Notion entretenue depuis le niveau inférieur (#232) : on la NOMME, côté adulte
	// seulement. Sans ça, une leçon multi-niveaux apparaîtrait deux fois sous le même
	// libellé dans la même catégorie, et le parent ne saurait pas ce qui est entretenu.
	// Réutilise la pastille de catégorie (même rôle visuel, aucun style à ajouter) ; le
	// préfixe non visuel évite un « CE2 » énigmatique au lecteur d'écran.
	const niveau = e.niveauOrigine
		? `<span class="enc-rev-cat"><span class="sr-only">Niveau d'origine : </span>${escapeHTML(LEVEL_LABEL[e.niveauOrigine])}</span>`
		: '';
	// Nomme la nature « mot » pour les lecteurs d'écran (un mot isolé serait ambigu).
	const natureSr = e.nature === 'mot' ? '<span class="sr-only">Mot : </span>' : '';
	return `<li class="enc-rev-item${e.acquis ? ' acquis' : ''}">
      <span class="enc-rev-main">
        <span class="enc-rev-lab">${natureSr}${escapeHTML(e.label)}</span>
        ${niveau}${cat}
      </span>
      ${etat}
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

/* Libellé de catégorie par id : les vues à plat n'ont plus d'en-tête de groupe, elles
   rappellent donc la catégorie sur chaque ligne. Tout id rencontré est présent, `groupes`
   couvrant exactement les catégories qui ont au moins une entrée. */
function labelsCategories(recap: RecapRevision): Record<string, string> {
	const labels: Record<string, string> = {};
	for (const g of recap.groupes) labels[g.categoryId] = g.label;
	return labels;
}

/* Vue « Par urgence » : liste à plat, les plus en retard d'abord ; la catégorie est
   rappelée sur chaque ligne puisqu'il n'y a plus d'en-tête de groupe. */
function vueUrgenceHTML(recap: RecapRevision): string {
	const labels = labelsCategories(recap);
	return `<ul class="enc-rev-list enc-rev-flat">${recap.parUrgence
		.map((e) => entreeHTML(e, { catLabel: labels[e.categoryId] }))
		.join('')}</ul>`;
}

/* Résumé chiffré d'un étage. Même unité que la synthèse du bloc (« entrée »), qui couvre
   à la fois les leçons et les mots d'orthographe. */
function resumeEtage(p: PalierRevision): string {
	const n = `${p.entrees.length} entrée${p.entrees.length > 1 ? 's' : ''}`;
	return p.dues > 0 ? `${n}, dont ${p.dues} à réviser` : n;
}

/* Vue « Par palier » (#555) : les étages de l'escalier, du plus fragile au plus ancré.
   En-têtes NON repliables (et non des <details> comme la vue par catégorie) : la question
   posée ici — « qu'est-ce qui stagne en bas, qu'est-ce qui est presque ancré ? » — est une
   lecture panoramique, que sept accordéons fermés cacheraient précisément (avis designer).
   Vrai <h3> : un lecteur d'écran saute d'un étage à l'autre par les titres, comme l'œil
   balaie les intertitres. Le compteur reste HORS du titre (le titre ne nomme que l'étage,
   sinon la navigation par titres annonce « Palier : 1 semaine 2 entrées, dont 1 à réviser »
   d'une traite) ; c'est le conteneur en ligne qui les tient côte à côte.
   Les étages vides ne sont pas rendus (revisionProfil les omet). */
function vuePalierHTML(recap: RecapRevision): string {
	const labels = labelsCategories(recap);
	return recap.parPalier
		.map(
			(p) => `<section class="enc-rev-etage">
        <div class="enc-rev-etage-t">
          <h3 class="enc-rev-etage-lab">${p.acquis ? 'Acquis' : `Palier : ${escapeHTML(p.label)}`}</h3>
          <span class="enc-rev-etage-n">${resumeEtage(p)}</span>
        </div>
        <ul class="enc-rev-list enc-rev-etage-l">${p.entrees
					.map((e) => entreeHTML(e, { catLabel: labels[e.categoryId], palierDejaAffiche: true }))
					.join('')}</ul>
      </section>`,
		)
		.join('');
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
	// `wrap` depuis la 3e option (#555) : trois libellés de cette longueur ne tiennent pas
	// sur une ligne de smartphone (le filtre de période, pourtant plus court, avait déjà dû
	// passer en `wrap` à 4 options). Les raccourcir coûterait le nom accessible des radios,
	// qui EST leur texte visible — « Palier » seul serait ambigu à l'écoute.
	const bascule = segmentHTML({
		act: 'revision-mode',
		valAttr: 'mode',
		label: 'Affichage des révisions',
		active: vueRevision,
		wrap: true,
		options: [
			{ val: 'categorie', label: 'Par catégorie' },
			{ val: 'urgence', label: 'Par urgence' },
			{ val: 'palier', label: 'Par palier' },
		],
	});
	const synthese =
		`${recap.enRotation} entrée${recap.enRotation > 1 ? 's' : ''} en révision` +
		(recap.dues > 0 ? `, dont ${recap.dues} à réviser` : '') +
		(recap.acquises > 0
			? ` · ${recap.acquises} déjà acquise${recap.acquises > 1 ? 's' : ''}`
			: '') +
		'.';
	const corps =
		vueRevision === 'urgence'
			? vueUrgenceHTML(recap)
			: vueRevision === 'palier'
				? vuePalierHTML(recap)
				: vueCategorieHTML(recap);

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
	const mode = el.dataset.mode;
	vueRevision = mode === 'urgence' || mode === 'palier' ? mode : 'categorie';
	renderEspace();
	// Le re-rendu recrée le DOM → on garde le focus clavier sur le bouton actif.
	(container()?.querySelector('[data-act="revision-mode"].on') as HTMLElement | null)?.focus({
		preventScroll: true,
	});
	return true;
}
