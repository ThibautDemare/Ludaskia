/* ============================================================
   Espace encadrant (#234, découpage #354) — RÉCAP de progression.
   ------------------------------------------------------------
   Rendu de l'accompagnement (pas un bulletin) : chiffres-clés, graphe d'activité
   des 7 derniers jours avec bascule Total / Par type (#319), maîtrise des notions
   par catégorie (échelle type LSU), et file « À revoir ensemble » (leçons épinglées
   + suggestions automatiques). Possède l'état de bascule du graphe (`vueActivite`).
   Les calculs (recap, échelle) vivent dans core/encadrant-stats ; ici, le rendu et
   les handlers de la section (bascule, épinglage, impression).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { icon } from './icon';
import { listProfiles, activeProfile, type Profile } from '../core/profiles';
import {
	toggleRevoirFor,
	loadRevoirFor,
	niveauProfilMatiere,
	echelleActivite,
	type RecapProfil,
	type NiveauNotion,
	type JourActivite,
} from '../core/encadrant-stats';
import { getAllLessons, type LessonDef } from '../core/catalog';
import { printScope } from './session';
import { consulteUuid, renderEspace, container } from './encadrant-etat';

/* ---------- État de la section (module) ---------- */
let vueActivite: 'total' | 'type' = 'total'; // graphe d'activité : « Total » ou « Par type » (#319)

/* Mot affiché pour un niveau d'acquisition (échelle type LSU ; wording validé par
   pedagogue-primaire / redacteur-contenu-francais — la notion est qualifiée, pas l'enfant). */
const MOT_NIVEAU: Record<NiveauNotion, string> = {
	acquis: 'acquis',
	'en-cours': 'en cours',
	'non-acquis': 'à renforcer', // ≠ « à consolider » : éviter qu'il sonne plus avancé que « en cours » (avis pédago)
	'a-decouvrir': 'à découvrir',
};
// Ordre de PROGRESSION (croissant) pour la légende et les segments (avis pédago :
// l'échelle doit se lire comme une gradation, pas un ordre arbitraire).
const ORDRE_NIVEAUX: NiveauNotion[] = ['a-decouvrir', 'non-acquis', 'en-cours', 'acquis'];

/* Types de session du graphe d'activité (#319). Couleurs reprises des tokens
   sémantiques de l'app (cohérence : sprint = corail, bilan = violet, leçon = bleu).
   `mot` = singulier pour le détail inline ; `legende` = libellé de la légende. */
const TYPES_ACTIVITE: { k: keyof JourActivite; mot: string; legende: string; cls: string }[] = [
	{ k: 'lecon', mot: 'leçon', legende: 'Leçons', cls: 'enc-act-lecon' },
	{ k: 'revision', mot: 'révision', legende: 'Révisions', cls: 'enc-act-revision' },
	{ k: 'dictee', mot: 'dictée', legende: 'Dictées', cls: 'enc-act-dictee' },
	{ k: 'bilan', mot: 'bilan', legende: 'Bilans', cls: 'enc-act-bilan' },
	{ k: 'sprint', mot: 'sprint', legende: 'Sprints', cls: 'enc-act-sprint' },
];
// Sessions de l'ancien format (sans type) : segment neutre, affiché seulement si présent.
const TYPE_INCONNU = {
	k: 'inconnu' as const,
	mot: 'autre',
	legende: 'Autre',
	cls: 'enc-act-inconnu',
};
// Noms de jours (l'index = getDay()) pour les libellés accessibles des colonnes.
const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/* ---------- Récap de progression (accompagnement, pas un bulletin) ---------- */
export function recapHTML(recap: RecapProfil, consulte: Profile): string {
	return `<section class="enc-section">
      <h2 class="enc-h2"><span aria-hidden="true">${escapeHTML(consulte.emoji)}</span> Progression de ${escapeHTML(consulte.name)}</h2>
      <p class="enc-frame">Voici où en est l'entraînement de ${escapeHTML(consulte.name)}, pour vous aider à l'accompagner.</p>
      ${chiffresHTML(recap)}
      ${activiteHTML(recap)}
      ${maitriseHTML(recap)}
      ${aRevoirHTML(recap, consulte)}
    </section>`;
}

function chiffresHTML(recap: RecapProfil): string {
	const stat = (num: number, lab: string) =>
		`<div class="enc-stat"><span class="enc-stat-num">${num}</span><span class="enc-stat-lab">${lab}</span></div>`;
	return `<div class="enc-stats">
      ${stat(recap.totalMaitrisees, `notion${recap.totalMaitrisees > 1 ? 's' : ''} maîtrisée${recap.totalMaitrisees > 1 ? 's' : ''}`)}
      ${recap.nouvellesRecentes > 0 ? stat(recap.nouvellesRecentes, `maîtrisée${recap.nouvellesRecentes > 1 ? 's' : ''} récemment`) : ''}
      ${stat(recap.aRevoir.length, 'à revoir ensemble')}
    </div>`;
}

/* Détail textuel de la répartition par type d'un jour (« 2 leçons, 1 sprint ») — a11y. */
function repartitionTexte(j: JourActivite): string {
	return [...TYPES_ACTIVITE, TYPE_INCONNU]
		.map((t) => {
			const c = j[t.k];
			return c ? `${c} ${t.mot}${c > 1 ? 's' : ''}` : '';
		})
		.filter(Boolean)
		.join(', ');
}

function activiteHTML(recap: RecapProfil): string {
	const jours = recap.activite7j;
	const total = jours.reduce((s, j) => s + j.total, 0);
	// Pas d'activité : pas de graphe ni de bascule (rien à comparer).
	if (total === 0) {
		return `<div class="enc-block">
      <h3 class="enc-h3">${icon('calendar')} Activité des 7 derniers jours</h3>
      <p class="enc-hint">Aucune session récente.</p>
    </div>`;
	}
	const parType = vueActivite === 'type';

	// Échelle Y « ronde » (calcul testé côté core). `pct` = hauteur d'une valeur en %
	// de la zone traçante : pour une colonne, la PILE occupe pct(total) et chaque
	// segment pct(sous-total) → la somme des segments = pct(total). Sommet `top` ≥ max.
	const { top, ticks } = echelleActivite(Math.max(...jours.map((j) => j.total)));
	const pct = (v: number) => (v / top) * 100;
	const axis = ticks
		.map((t) => `<span class="enc-axis-tick" style="bottom:${pct(t)}%">${t}</span>`)
		.join('');
	const gridlines = ticks
		.map((t) => `<span class="enc-gridline" style="bottom:${pct(t)}%"></span>`)
		.join('');

	// Libellés de jour, calculés une fois (initiale visible + nom complet pour l'a11y) ;
	// dernière colonne = aujourd'hui.
	const today = new Date();
	const infos = jours.map((_, i) => {
		const d = new Date(today);
		d.setDate(d.getDate() - (jours.length - 1 - i));
		const nom = i === jours.length - 1 ? "aujourd'hui" : NOMS_JOURS[d.getDay()];
		return { initiale: NOMS_JOURS[d.getDay()].charAt(0).toUpperCase(), nom };
	});

	const colonnes = jours
		.map((j, i) => {
			const detail = parType && j.total ? ` (${repartitionTexte(j)})` : '';
			const cap = infos[i].nom.charAt(0).toUpperCase() + infos[i].nom.slice(1);
			const aria = `${cap} : ${j.total} session${j.total > 1 ? 's' : ''}${detail}`;
			let barre: string;
			if (parType) {
				const segs = [...TYPES_ACTIVITE, TYPE_INCONNU]
					.map((t) => {
						const c = j[t.k];
						return c ? `<span class="enc-seg-bar ${t.cls}" style="height:${pct(c)}%"></span>` : '';
					})
					.join('');
				barre = `<div class="enc-bar-stack">${segs}</div>`;
			} else {
				barre = `<div class="enc-bar" style="height:${pct(j.total)}%"></div>`;
			}
			return `<div class="enc-bar-col" role="img" aria-label="${aria}" title="${aria}">${barre}</div>`;
		})
		.join('');
	const labs = infos.map((info) => `<span class="enc-bar-lab">${info.initiale}</span>`).join('');

	// Bascule Total / Par type (pattern bouton-segment, sélecteur stable pour l'e2e).
	const bascule = `<div class="enc-act-modes" role="group" aria-label="Affichage du graphe d'activité">
      <button type="button" class="enc-act-mode${parType ? '' : ' on'}" data-act="activite-mode" data-mode="total" aria-pressed="${!parType}">Total</button>
      <button type="button" class="enc-act-mode${parType ? ' on' : ''}" data-act="activite-mode" data-mode="type" aria-pressed="${parType}">Par type</button>
    </div>`;
	// Légende (mode « par type ») : « Autre » seulement si d'anciennes sessions non typées existent.
	const legendeTypes = [...TYPES_ACTIVITE, ...(jours.some((j) => j.inconnu) ? [TYPE_INCONNU] : [])];
	const legende = parType
		? `<p class="enc-legend">${legendeTypes
				.map((t) => `<span class="enc-key ${t.cls}">${t.legende}</span>`)
				.join('')}</p>`
		: '';
	// Synthèse : total de la semaine, + répartition globale par type (donne au lecteur
	// d'écran le même niveau d'info que la pile visuelle, sans parcourir les colonnes).
	const totalParType: JourActivite = jours.reduce(
		(acc, j) => ({
			total: acc.total + j.total,
			lecon: acc.lecon + j.lecon,
			bilan: acc.bilan + j.bilan,
			sprint: acc.sprint + j.sprint,
			revision: acc.revision + j.revision,
			dictee: acc.dictee + j.dictee,
			inconnu: acc.inconnu + j.inconnu,
		}),
		{ total: 0, lecon: 0, bilan: 0, sprint: 0, revision: 0, dictee: 0, inconnu: 0 },
	);
	const synthese = `${total} session${total > 1 ? 's' : ''} sur la semaine${
		parType ? ` — ${repartitionTexte(totalParType)}` : ''
	}.`;

	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('calendar')} Activité des 7 derniers jours</h3>
      ${bascule}
      ${legende}
      <div class="enc-chart">
        <div class="enc-chart-axis" aria-hidden="true">${axis}</div>
        <div class="enc-chart-main">
          <div class="enc-chart-plot">
            <div class="enc-gridlines" aria-hidden="true">${gridlines}</div>
            <div class="enc-bars">${colonnes}</div>
          </div>
          <div class="enc-bars-labs" aria-hidden="true">${labs}</div>
        </div>
      </div>
      <p class="enc-hint">${synthese}</p>
    </div>`;
}

function maitriseHTML(recap: RecapProfil): string {
	if (recap.parCategorie.length === 0) return '';
	const legende = ORDRE_NIVEAUX.map(
		(n) => `<span class="enc-key enc-key-${n}">${MOT_NIVEAU[n]}</span>`,
	).join('');
	const valeur: Record<NiveauNotion, (c: RecapProfil['parCategorie'][number]) => number> = {
		'a-decouvrir': (c) => c.aDecouvrir,
		'non-acquis': (c) => c.nonAcquis,
		'en-cours': (c) => c.enCours,
		acquis: (c) => c.acquis,
	};
	const seg = (n: NiveauNotion, v: number) =>
		v > 0
			? `<span class="enc-seg-part enc-key-${n}" style="flex:${v}" title="${v} ${MOT_NIVEAU[n]}"></span>`
			: '';
	// Détail d'une catégorie : une ligne par leçon (puce d'état + libellé + mot +
	// actions : épingler/retirer + imprimer une fiche + imprimer avec corrigé).
	const detail = (c: RecapProfil['parCategorie'][number]) =>
		c.lecons
			.map(
				(l) => `<li class="enc-detail-item">
          <span class="enc-detail-puce enc-key-${l.niveau}" aria-hidden="true"></span>
          <span class="enc-detail-lab">${escapeHTML(l.label)}</span>
          <span class="enc-detail-mot">${MOT_NIVEAU[l.niveau]}</span>
          <span class="enc-actions">
            <button type="button" class="enc-btn-sec${l.epingle ? ' on' : ''}" data-act="epingler" data-lesson="${l.lessonId}">${l.epingle ? 'Retirer' : 'Épingler'}</button>
            ${boutonsImpression(l.lessonId)}
          </span>
        </li>`,
			)
			.join('');
	const cats = recap.parCategorie
		.map(
			(c) => `<details class="enc-cat-d">
        <summary class="enc-cat-sum">
          <span class="enc-cat-lab">${escapeHTML(c.label)}</span>
          <span class="enc-cat-counts">${c.acquis}/${c.total} acquises</span>
          <span class="enc-seg" aria-hidden="true">${ORDRE_NIVEAUX.map((n) => seg(n, valeur[n](c))).join('')}</span>
        </summary>
        <ul class="enc-detail">${detail(c)}</ul>
      </details>`,
		)
		.join('');
	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('star')} Notions par catégorie</h3>
      <p class="enc-legend">${legende}</p>
      <p class="enc-hint">C'est normal qu'il reste des notions « à découvrir » ou « à renforcer » : ce sont celles qui n'ont pas encore été beaucoup travaillées. Dépliez une catégorie pour voir le détail et épingler une leçon.</p>
      <div class="enc-cats">${cats}</div>
    </div>`;
}

/* Boutons d'impression d'une leçon (au niveau du profil consulté) : fiche vierge +
   fiche avec corrigé (#41). Réutilisés par le détail des catégories ET « à revoir ». */
function boutonsImpression(lessonId: string): string {
	return `<button type="button" class="enc-btn-sec" data-act="imprimer" data-lesson="${lessonId}">${icon('printer')} Fiche</button>
      <button type="button" class="enc-btn-sec" data-act="imprimer" data-corrige="1" data-lesson="${lessonId}">${icon('printer')} Corrigé</button>`;
}

/* Une ligne de leçon « à revoir » : libellé + état éventuel + actions (épingler/retirer
   + impression). `etat` est l'état d'acquisition affiché (suggestions) ou absent (épinglées). */
function ligneRevoir(
	lessonId: string,
	label: string,
	epingle: boolean,
	etat?: NiveauNotion,
): string {
	const badge = etat
		? `<span class="enc-revoir-etat enc-key-${etat}">${MOT_NIVEAU[etat]}</span>`
		: '';
	return `<li class="enc-revoir-item">
      <span class="enc-revoir-lab">${escapeHTML(label)}</span>
      ${badge}
      <span class="enc-actions">
        <button type="button" class="enc-btn-sec${epingle ? ' on' : ''}" data-act="epingler" data-lesson="${lessonId}">${epingle ? 'Retirer' : 'Épingler'}</button>
        ${boutonsImpression(lessonId)}
      </span>
    </li>`;
}

function aRevoirHTML(recap: RecapProfil, consulte: Profile): string {
	// Leçons actuellement épinglées par l'encadrant (file du profil consulté).
	const epinglees = new Set(loadRevoirFor(consulte.uuid));
	const pinned = [...epinglees]
		.map((id) => getAllLessons().find((l) => l.id === id))
		.filter((l): l is LessonDef => !!l);
	// Suggestions AUTO : leçons « faiblardes » (perf récente < 70 %) non déjà épinglées (max 3).
	const suggestions = recap.aRevoir.filter((n) => !epinglees.has(n.lessonId)).slice(0, 3);

	const blocEpinglees = pinned.length
		? `<ul class="enc-revoir">${pinned.map((l) => ligneRevoir(l.id, l.label, true)).join('')}</ul>`
		: `<p class="enc-hint">Aucune leçon épinglée pour le moment.</p>`;
	const blocSuggestions = suggestions.length
		? `<p class="enc-sub-lab">Suggestions</p>
       <p class="enc-hint">Leçons un peu fragiles, qui gagneraient à être revues :</p>
       <ul class="enc-revoir">${suggestions.map((n) => ligneRevoir(n.lessonId, n.label, false, n.niveau)).join('')}</ul>`
		: '';

	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('repeat')} À revoir ensemble</h3>
      <p class="enc-hint">Épinglez une leçon : elle apparaîtra sur l'accueil de ${escapeHTML(consulte.name)} pour qu'il y revienne. Pour épingler <strong>n'importe quelle leçon</strong> (même pas encore abordée), dépliez une catégorie ci-dessus.</p>
      <p class="enc-sub-lab">Épinglées</p>
      ${blocEpinglees}
      ${blocSuggestions}
    </div>`;
}

/* ---------- Handlers délégués (aiguillés par l'orchestrateur) ---------- */
export function progressionClick(act: string, el: HTMLElement): boolean {
	switch (act) {
		case 'activite-mode':
			vueActivite = el.dataset.mode === 'type' ? 'type' : 'total';
			renderEspace();
			// Le re-rendu recrée le DOM → on garde le focus clavier sur le bouton actif.
			(container()?.querySelector('.enc-act-mode.on') as HTMLElement | null)?.focus({
				preventScroll: true,
			});
			return true;
		case 'epingler': {
			const uuid = consulteUuid();
			if (uuid && el.dataset.lesson) {
				toggleRevoirFor(uuid, el.dataset.lesson);
				renderEspace();
			}
			return true;
		}
		case 'imprimer':
			if (el.dataset.lesson) onImprimer(el.dataset.lesson, el.dataset.corrige === '1');
			return true;
	}
	return false;
}

function onImprimer(lessonId: string, corrige = false): void {
	const consulte = listProfiles().find((p) => p.uuid === consulteUuid()) ?? activeProfile();
	const lesson = getAllLessons().find((l) => l.id === lessonId);
	if (!consulte || !lesson) return;
	// Impression au niveau du profil CONSULTÉ, sans changer le profil/niveau actif.
	const level = niveauProfilMatiere(consulte, lesson.subject);
	printScope({ title: lesson.label, lessonIds: [lessonId], kind: 'fiches', level, corrige });
}
