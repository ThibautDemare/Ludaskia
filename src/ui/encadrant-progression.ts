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
	niveauProfilMatiere,
	echelleActivite,
	libelleDerniereFois,
	debutSemaine,
	orthoRevoirId,
	listesOrthoProfil,
	dicteesProposees,
	epingleesProfil,
	retraitsAutoProfil,
	type RecapProfil,
	type RecapListeOrtho,
	type DicteeProposee,
	type NiveauNotion,
	type TendanceNotion,
	type JourActivite,
	type FriseMatiere,
} from '../core/encadrant-stats';
import { getAllLessons, CATEGORIES, ORTHO_CATEGORY_ID } from '../core/catalog';
import { dicteeDisponible } from './tts';
import { printScope } from './session';
import { erreursHTML, erreursClick } from './encadrant-erreurs';
import { consulteUuid, renderEspace, container } from './encadrant-commun';
import { segmentHTML } from './segment';

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

/* Tendance récente d'une notion : glyphe + mot, formulés en ACTION et non en verdict
   (avis pédago : « à relancer », jamais « en baisse »). La couleur est un indice SECONDAIRE
   porté par le glyphe ; le mot reste en --ink (a11y, cf. enc-revoir-etat). Masquée si null. */
const TENDANCE: Record<TendanceNotion, { glyphe: string; mot: string; titre: string }> = {
	progresse: { glyphe: '↗', mot: 'en progrès', titre: 'En progrès sur les derniers essais' },
	stable: { glyphe: '→', mot: 'stable', titre: 'Stable sur les derniers essais' },
	'a-relancer': {
		glyphe: '↘',
		mot: 'à relancer',
		titre: 'Gagnerait à être retravaillée en ce moment',
	},
};
function tendanceHTML(t: TendanceNotion | null): string {
	if (!t) return '';
	const { glyphe, mot, titre } = TENDANCE[t];
	// `sr-only` : nomme l'info pour les lecteurs d'écran (« Tendance : … »), le glyphe restant décoratif.
	return `<span class="enc-tendance enc-tendance-${t}" title="${titre}"><span class="enc-tendance-glyphe" aria-hidden="true">${glyphe}</span> <span class="sr-only">Tendance : </span>${mot}</span>`;
}

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
      ${listesOrthoHTML(consulte)}
      ${erreursHTML(consulte, Date.now())}
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

	// Bascule Total / Par type (composant segment partagé, cf. ui/segment.ts).
	const bascule = segmentHTML({
		act: 'activite-mode',
		valAttr: 'mode',
		label: "Affichage du graphe d'activité",
		active: vueActivite,
		options: [
			{ val: 'total', label: 'Total' },
			{ val: 'type', label: 'Par type' },
		],
	});
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
	// Détail d'une catégorie : une ligne par leçon (puce d'état + libellé + suivi
	// « travaillée N fois · dernière fois … » + mot + actions : épingler/retirer +
	// imprimer une fiche + imprimer avec corrigé).
	const now = Date.now();
	const detail = (c: RecapProfil['parCategorie'][number]) =>
		c.lecons
			.map((l) => {
				const quand = libelleDerniereFois(l.derniereFois, now);
				const suivi =
					l.vues > 0
						? `travaillée ${l.vues} fois${quand ? ` · dernière fois ${quand}` : ''}`
						: 'pas encore travaillée';
				return `<li class="enc-detail-item">
          <span class="enc-detail-puce enc-key-${l.niveau}" aria-hidden="true"></span>
          <span class="enc-detail-main">
            <span class="enc-detail-lab">${escapeHTML(l.label)}</span>
            <span class="enc-detail-meta">${suivi}</span>
          </span>
          <span class="enc-detail-mot"><span class="sr-only">Niveau : </span>${MOT_NIVEAU[l.niveau]}</span>
          ${tendanceHTML(l.tendance)}
          <span class="enc-actions">
            <button type="button" class="enc-btn-sec${l.epingle ? ' on' : ''}" data-act="epingler" data-lesson="${l.lessonId}">${l.epingle ? 'Retirer' : 'Épingler'}</button>
            ${boutonsImpression(l.lessonId, l.label)}
          </span>
        </li>`;
			})
			.join('');
	const cats = recap.parCategorie
		.map(
			(c) => `<details class="enc-cat-d">
        <summary class="enc-cat-sum">
          <span class="enc-cat-lab">${escapeHTML(c.label)}</span>
          <span class="enc-cat-counts">${c.travaillees}/${c.total} travaillée${c.travaillees > 1 ? 's' : ''} · ${c.acquis} acquise${c.acquis > 1 ? 's' : ''}</span>
          <span class="enc-seg" aria-hidden="true">${ORDRE_NIVEAUX.map((n) => seg(n, valeur[n](c))).join('')}</span>
        </summary>
        <ul class="enc-detail">${detail(c)}</ul>
      </details>`,
		)
		.join('');
	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('star')} Notions par catégorie</h3>
      ${matieresHTML(recap)}
      ${frisesHTML(recap)}
      <p class="enc-legend">${legende}</p>
      <p class="enc-hint">C'est normal qu'il reste des notions « à découvrir » ou « à renforcer » : ce sont celles qui n'ont pas encore été beaucoup travaillées. Dépliez une catégorie pour voir le détail et épingler une leçon. Les leçons épinglées se retrouvent dans l'onglet Programme.</p>
      <div class="enc-cats">${cats}</div>
    </div>`;
}

/* Vue « couverture par matière » : combien de leçons ont déjà été abordées (et acquises)
   sur le total du niveau, matière par matière. Aide à ÉQUILIBRER l'entraînement entre
   matières. Factuel (dénombrement), sans note ni pourcentage. */
function matieresHTML(recap: RecapProfil): string {
	if (recap.parMatiere.length === 0) return '';
	const items = recap.parMatiere
		.map(
			(m) => `<li class="enc-mat-item">
        <span class="enc-mat-lab">${escapeHTML(m.label)}</span>
        <span class="enc-mat-counts">${m.travaillees}/${m.total} travaillée${m.travaillees > 1 ? 's' : ''} · ${m.acquis} acquise${m.acquis > 1 ? 's' : ''}</span>
      </li>`,
		)
		.join('');
	return `<h4 class="enc-sub-lab">Couverture par matière</h4>
      <ul class="enc-mat-list">${items}</ul>`;
}

/* Frise d'évolution par matière (#397) : petites frises hebdomadaires empilées (une par
   matière), hauteur = notions ayant franchi un cap cette semaine-là. Sans axe ni pourcentage :
   juste un compteur de notions au-dessus des barres non nulles (dénombrement, pas une note).
   Rendu volontairement plus léger que le graphe d'activité (capsules vertes, pas d'axe) pour
   ne pas être lue comme « le même graphe ». La semaine EN COURS (dernière colonne) est
   distinguée : partielle, donc non comparable à hauteur égale. Masquée tant qu'aucune matière
   n'a assez de recul ; amorce textuelle si l'entraînement a commencé mais pas encore assez. */
function frisesHTML(recap: RecapProfil): string {
	if (recap.frises.length === 0) {
		// Rien à tracer ; si l'enfant a déjà travaillé, on annonce que la vue viendra.
		return recap.parMatiere.some((m) => m.travaillees > 0)
			? `<h4 class="enc-sub-lab">Évolution récente</h4>
         <p class="enc-hint">L'évolution par matière apparaîtra ici après quelques semaines d'entraînement.</p>`
			: '';
	}
	// Échelle verticale COMMUNE aux matières (petits multiples comparables entre eux).
	const maxSem = Math.max(1, ...recap.frises.flatMap((f) => f.semaines));
	const lundiCourant = debutSemaine(Date.now());
	const frises = recap.frises.map((f) => friseMatiereHTML(f, maxSem, lundiCourant)).join('');
	const nbSemaines = recap.frises[0].semaines.length;
	// Synthèse VISIBLE (pas seulement dans les aria-label des colonnes) : donne le total par
	// matière d'un coup d'œil, sans devoir parcourir les 12 colonnes (a11y, cf. graphe d'activité).
	const synthese = recap.frises.map((f) => `${f.total} en ${f.label.toLowerCase()}`).join(', ');
	return `<h4 class="enc-sub-lab">Évolution récente</h4>
      <p class="enc-hint">Notions ayant franchi un cap sur les ${nbSemaines} dernières semaines : ${synthese}.</p>
      <div class="enc-evol">${frises}</div>
      <p class="enc-evol-cap" aria-hidden="true"><span>sur les ${nbSemaines} dernières semaines</span><span>cette semaine →</span></p>
      <p class="enc-hint">Chaque marche est une notion qui a franchi un cap (par exemple « en cours » → « acquis »). Une semaine plus calme ne veut pas dire une semaine sans travail : la progression n'est pas régulière.</p>`;
}

/* Une mini-frise (une matière) : libellé + rangée de colonnes hebdomadaires. Chaque colonne
   réserve toujours l'espace du compteur au-dessus (aligne les barres), puis la barre-capsule
   dont la hauteur est proportionnelle au max COMMUN. Colonne vide → amorce grise neutre
   (jamais un trou, jamais un « 0 »). `role="img"` + libellé daté, comme le graphe d'activité. */
function friseMatiereHTML(f: FriseMatiere, maxSem: number, lundiCourant: number): string {
	const n = f.semaines.length;
	const cols = f.semaines
		.map((c, i) => {
			const enCours = i === n - 1;
			const lundi = lundiCourant - (n - 1 - i) * 7 * 86400000;
			const quand = enCours
				? 'Cette semaine (en cours)'
				: `Semaine du ${new Date(lundi).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
			const combien =
				c > 0
					? `${c} notion${c > 1 ? 's' : ''} ${c > 1 ? 'ont' : 'a'} franchi un cap`
					: "aucune notion n'a franchi de cap";
			const aria = `${quand} : ${combien}`;
			const h = Math.round((c / maxSem) * 100);
			// `role="img"` + aria-label portent toute l'info → on masque le sous-arbre visuel
			// (compteur + plot) pour éviter une double annonce selon les couples navigateur/AT.
			return `<span class="enc-evol-col${enCours ? ' en-cours' : ''}${c > 0 ? ' has-value' : ''}" role="img" aria-label="${aria}" title="${aria}">
        <span class="enc-evol-num" aria-hidden="true">${c > 0 ? c : ''}</span>
        <span class="enc-evol-plot" aria-hidden="true"><span class="enc-evol-bar" style="height:${h}%"></span></span>
      </span>`;
		})
		.join('');
	// role="group" + aria-label : rattache les colonnes à leur matière pour une navigation
	// NON linéaire (saut de graphique en graphique) ; le libellé visuel devient décoratif.
	return `<div class="enc-evol-mat" role="group" aria-label="${escapeHTML(f.label)}">
      <span class="enc-evol-mat-lab" aria-hidden="true">${escapeHTML(f.label)}</span>
      <div class="enc-evol-bars">${cols}</div>
    </div>`;
}

/* ---------- Bloc « Listes de dictée » ----------
   Les dictées (store orthographe) ne sont pas des leçons du catalogue → suivies à part,
   sur la MÊME échelle d'acquisition, mais à 3 niveaux (pas de « à renforcer » : la
   validation d'un mode est binaire, il n'y a pas de perf récente en %). Chaque liste
   peut être épinglée (elle rejoint la file « à revoir » de l'enfant, comme une leçon).
   Les dictées PRÉDÉFINIES non commencées sont masquées (cf. listesOrthoProfil). */
const ORDRE_NIVEAUX_ORTHO: NiveauNotion[] = ['a-decouvrir', 'en-cours', 'acquis'];
function ligneListeOrtho(l: RecapListeOrtho): string {
	const entryId = orthoRevoirId(l.id);
	// « en cours » regroupe « 1 mot commencé » et « 9/10 maîtrisés » : on accole le compte
	// factuel de mots maîtrisés pour restituer la nuance (avis pédago), jamais de %.
	const compte =
		l.niveau === 'en-cours'
			? `${l.maitrises}/${l.nbMots} mot${l.nbMots > 1 ? 's' : ''} maîtrisé${l.maitrises > 1 ? 's' : ''}`
			: `${l.nbMots} mot${l.nbMots > 1 ? 's' : ''}`;
	const meta = `${compte}${l.source === 'predefini' ? ' · dictée proposée' : ''}`;
	return `<li class="enc-detail-item">
      <span class="enc-detail-puce enc-key-${l.niveau}" aria-hidden="true"></span>
      <span class="enc-detail-main">
        <span class="enc-detail-lab">${escapeHTML(l.label)}</span>
        <span class="enc-detail-meta">${meta}</span>
      </span>
      <span class="enc-detail-mot"><span class="sr-only">Niveau : </span>${MOT_NIVEAU[l.niveau]}</span>
      <span class="enc-actions">
        <button type="button" class="enc-btn-sec${l.epingle ? ' on' : ''}" data-act="epingler" data-lesson="${entryId}" aria-label="${l.epingle ? 'Retirer' : 'Épingler'} « ${escapeHTML(l.label)} »">${l.epingle ? 'Retirer' : 'Épingler'}</button>
      </span>
    </li>`;
}
/* Une dictée « proposée » (prédéfinie non commencée, épinglable à l'avance) : libellé +
   nombre de mots + Épingler. Toujours « Épingler » (par construction elle n'est pas épinglée). */
function ligneDicteeProposee(d: DicteeProposee): string {
	const entryId = orthoRevoirId(d.id);
	return `<li class="enc-revoir-item">
      <span class="enc-revoir-lab">${escapeHTML(d.label)}</span>
      <span class="enc-detail-meta">${d.nbMots} mot${d.nbMots > 1 ? 's' : ''}</span>
      <span class="enc-actions">
        <button type="button" class="enc-btn-sec" data-act="epingler" data-lesson="${entryId}" aria-label="Épingler « ${escapeHTML(d.label)} »">Épingler</button>
      </span>
    </li>`;
}
function listesOrthoHTML(consulte: Profile): string {
	const dispo = dicteeDisponible();
	const listes = listesOrthoProfil(consulte, dispo);
	const proposees = dicteesProposees(consulte, dispo);
	// Le suivi ne s'affiche que s'il y a des listes suivies OU des dictées à proposer
	// (dans ce dernier cas, on garde le renvoi vers l'onglet Programme).
	if (listes.length === 0 && proposees.length === 0) return '';
	const catOrtho = CATEGORIES.find((c) => c.id === ORTHO_CATEGORY_ID);
	const legende = ORDRE_NIVEAUX_ORTHO.map(
		(n) => `<span class="enc-key enc-key-${n}">${MOT_NIVEAU[n]}</span>`,
	).join('');
	// Suivi : listes du parent + prédéfinies commencées ou épinglées.
	const suivi = listes.length
		? `<ul class="enc-detail">${listes.map(ligneListeOrtho).join('')}</ul>`
		: `<p class="enc-hint">Aucune dictée commencée pour le moment.</p>`;
	// « À l'avance » (parcourir/épingler une dictée non commencée) est déplacé dans l'onglet
	// Programme (#459) : c'est un acte de préparation, pas d'observation. On laisse ici un
	// simple renvoi pour ne pas le faire disparaître silencieusement.
	const renvoi = proposees.length
		? `<p class="enc-hint">Proposer une dictée à l'avance ? Rendez-vous dans l'onglet <strong>Programme</strong>.</p>`
		: '';
	return `<div class="enc-block">
      <h3 class="enc-h3">${icon(catOrtho?.icon ?? 'book-open')} Listes de dictée</h3>
      <p class="enc-legend">${legende}</p>
      <p class="enc-hint">Les listes de dictée (mots invariables, thèmes, vos propres listes) et leur avancement. Épinglez-en une pour qu'elle revienne sur l'accueil de ${escapeHTML(consulte.name)}.</p>
      ${suivi}
      ${renvoi}
    </div>`;
}

/* Bloc « Proposer une dictée à l'avance » (onglet Programme, #459) : les dictées PRÉDÉFINIES
   non commencées, épinglables AVANT que l'enfant ne les rencontre (parité avec « épingler
   n'importe quelle leçon »). Extrait du suivi des dictées (autrefois replié sous « Listes de
   dictée ») car c'est un acte de préparation. Renvoie '' s'il n'y a rien à proposer. */
export function dicteesProposeesHTML(consulte: Profile): string {
	const proposees = dicteesProposees(consulte, dicteeDisponible());
	if (proposees.length === 0) return '';
	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('feather')} Proposer une dictée à l'avance</h3>
      <p class="enc-hint">Des dictées prêtes à l'emploi (mots invariables, nombres, thèmes). Épinglez-en une pour la proposer à ${escapeHTML(consulte.name)} avant qu'il ou elle ne la rencontre.</p>
      <ul class="enc-ortho-dispo-list">${proposees.map(ligneDicteeProposee).join('')}</ul>
    </div>`;
}

/* Boutons d'impression d'une leçon (au niveau du profil consulté) : fiche vierge +
   fiche avec corrigé (#41). Réutilisés par le détail des catégories ET « à revoir ».
   `label` ne sert QU'aux `aria-label` : l'onglet peut aligner une dizaine de « Fiche » /
   « Corrigé » identiques, indistinguables pour qui navigue par liste de contrôles (rotor
   VoiceOver, liste de formulaires NVDA) — le nom accessible doit porter la leçon (a11y). */
function boutonsImpression(lessonId: string, label: string): string {
	const nom = `« ${escapeHTML(label)} »`;
	return `<button type="button" class="enc-btn-sec" data-act="imprimer" data-lesson="${lessonId}" aria-label="Imprimer la fiche de ${nom}">${icon('printer')} Fiche</button>
      <button type="button" class="enc-btn-sec" data-act="imprimer" data-corrige="1" data-lesson="${lessonId}" aria-label="Imprimer la fiche avec corrigé de ${nom}">${icon('printer')} Corrigé</button>`;
}

/* Une ligne « à revoir » : libellé + état éventuel + actions (épingler/retirer + impression).
   `entryId` = id transmis au toggle/à l'impression (leçon = `LessonDef.id` ; liste de dictée =
   `orthoRevoirId(id)`). `etat` = état d'acquisition affiché (suggestions) ou absent (épinglées).
   `imprimable` = false pour une liste de dictée (pas de fiche à imprimer). */
function ligneRevoir(
	entryId: string,
	label: string,
	epingle: boolean,
	opts: { etat?: NiveauNotion; imprimable?: boolean; quand?: string } = {},
): string {
	const { etat, imprimable = true, quand } = opts;
	const badge = etat
		? `<span class="enc-revoir-etat enc-key-${etat}">${MOT_NIVEAU[etat]}</span>`
		: quand
			? `<span class="enc-revoir-quand">Retirée ${escapeHTML(quand)}</span>`
			: '';
	return `<li class="enc-revoir-item">
      <span class="enc-revoir-lab">${escapeHTML(label)}</span>
      ${badge}
      <span class="enc-actions">
        <button type="button" class="enc-btn-sec${epingle ? ' on' : ''}" data-act="epingler" data-lesson="${entryId}" aria-label="${epingle ? 'Retirer' : 'Épingler'} « ${escapeHTML(label)} »">${epingle ? 'Retirer' : 'Épingler'}</button>
        ${imprimable ? boutonsImpression(entryId, label) : ''}
      </span>
    </li>`;
}

export function aRevoirHTML(recap: RecapProfil, consulte: Profile): string {
	// La file a déjà été nettoyée (purgeRevoirSolides, appelé par l'orchestrateur AVANT le
	// calcul du récap, #465) : la liste de gestion ne peut donc plus contenir de « fantôme »
	// (notion redevenue solide, déjà invisible côté enfant).
	const now = Date.now();
	// Entrées actuellement épinglées (leçons du catalogue ET listes de dictée), résolues.
	const pinned = epingleesProfil(consulte);
	const epingleeIds = new Set(pinned.map((e) => e.id));
	// Suggestions AUTO : leçons « faiblardes » (perf récente < 70 %) non déjà épinglées (max 3).
	const suggestions = recap.aRevoir.filter((n) => !epingleeIds.has(n.lessonId)).slice(0, 3);
	// Trace des retraits automatiques (#465) : une épingle ne disparaît pas sans explication,
	// et se remet d'un clic (« Épingler » → l'entrée est alors conservée, cf. purgeRevoirSolides).
	const retraits = retraitsAutoProfil(consulte, now);

	const blocEpinglees = pinned.length
		? `<ul class="enc-revoir">${pinned
				.map((e) =>
					e.kind === 'ortho'
						? ligneRevoir(orthoRevoirId(e.id), e.label, true, { imprimable: false })
						: ligneRevoir(e.id, e.label, true),
				)
				.join('')}</ul>`
		: `<p class="enc-hint">Aucune leçon épinglée pour le moment.</p>`;
	const blocSuggestions = suggestions.length
		? `<h4 class="enc-sub-lab">Suggestions</h4>
       <p class="enc-hint">Leçons un peu fragiles, qui gagneraient à être revues :</p>
       <ul class="enc-revoir">${suggestions.map((n) => ligneRevoir(n.lessonId, n.label, false, { etat: n.niveau })).join('')}</ul>`
		: '';
	const blocRetraits = retraits.length
		? `<h4 class="enc-sub-lab">Retirées automatiquement</h4>
       <p class="enc-hint">Ces notions ont quitté la liste d'elles-mêmes : ${escapeHTML(consulte.name)} les maîtrise de nouveau. Épinglez-en une si vous voulez quand même y revenir.</p>
       <ul class="enc-revoir">${retraits
					.map((r) =>
						ligneRevoir(r.id, r.label, false, {
							imprimable: r.kind === 'lecon',
							quand: libelleDerniereFois(r.at, now),
						}),
					)
					.join('')}</ul>`
		: '';

	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('repeat')} À revoir ensemble</h3>
      <p class="enc-hint">Épinglez une leçon : elle apparaîtra sur l'accueil de ${escapeHTML(consulte.name)} pour qu'il ou elle y revienne. Pour épingler <strong>n'importe quelle leçon</strong> (même pas encore abordée), dépliez une catégorie dans l'onglet <strong>Suivi</strong>.</p>
      <h4 class="enc-sub-lab">Épinglées</h4>
      ${blocEpinglees}
      ${blocSuggestions}
      ${blocRetraits}
    </div>`;
}

/* ---------- Handlers délégués (aiguillés par l'orchestrateur) ---------- */
export function progressionClick(act: string, el: HTMLElement): boolean {
	// Le bloc « erreurs » est INSÉRÉ par cette section (cf. recapHTML) : ses actions
	// passent donc par ici, comme `epingler` — et non par un câblage frère dans
	// l'orchestrateur, qui ne le compose pas.
	if (erreursClick(act, el)) return true;
	switch (act) {
		case 'activite-mode':
			vueActivite = el.dataset.mode === 'type' ? 'type' : 'total';
			renderEspace();
			// Le re-rendu recrée le DOM → on garde le focus clavier sur le bouton actif.
			// Sélecteur SCOPÉ par `data-act` : trois segments `.enc-act-mode.on` coexistent
			// désormais dans l'onglet Suivi (activité, erreurs, révision).
			(container()?.querySelector('[data-act="activite-mode"].on') as HTMLElement | null)?.focus({
				preventScroll: true,
			});
			return true;
		case 'epingler': {
			const uuid = consulteUuid();
			const entryId = el.dataset.lesson;
			if (uuid && entryId) {
				toggleRevoirFor(uuid, entryId);
				renderEspace();
				// Le re-rendu recrée le DOM et la ligne CHANGE de sous-bloc (« Retirées
				// automatiquement » → « Épinglées », #465) : on ramène le focus sur le bouton de
				// la MÊME notion, sinon l'utilisateur clavier repart du début du document.
				container()
					?.querySelector<HTMLElement>(
						`[data-act="epingler"][data-lesson="${CSS.escape(entryId)}"]`,
					)
					?.focus({ preventScroll: true });
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
