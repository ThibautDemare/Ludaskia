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
import { labelLecon } from '../core/levels';
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
	niveauEpingle,
	retraitsAutoProfil,
	travailRecentProfil,
	type CibleTravaillee,
	type GroupeTravail,
	type RecapProfil,
	type RecapListeOrtho,
	type DicteeProposee,
	type NiveauNotion,
	type TendanceNotion,
	type JourActivite,
	type FriseMatiere,
} from '../core/encadrant-stats';
import { getAllLessons, CATEGORIES, ORTHO_CATEGORY_ID } from '../core/catalog';
import { BLOCAGES_SIGNAL_ADULTE } from '../core/report-lecon';
import { dicteeDisponible } from './tts';
import { printScope } from './session';
import { erreursHTML, erreursClick } from './encadrant-erreurs';
import {
	consulteUuid,
	renderEspace,
	container,
	MOT_NIVEAU,
	ORDRE_NIVEAUX,
	ORDRE_NIVEAUX_ORTHO,
} from './encadrant-commun';
import {
	banqueClick,
	banqueDuProfil,
	banqueInput,
	banqueMotsHTML,
	vueDictees,
} from './encadrant-banque';
import { segmentHTML } from './segment';

/* ---------- État de la section (module) ---------- */
let vueActivite: 'total' | 'type' = 'total'; // graphe d'activité : « Total » ou « Par type » (#319)

/* Fenêtre du bloc « Travaillé récemment » (#520), en JOURS calendaires. Défaut : 7 jours,
   la même fenêtre que le graphe d'activité juste au-dessus — deux périodes différentes sur
   le même écran obligeraient le lecteur à se demander pourquoi (avis designer). Pas de
   choix « Tout », qui reviendrait à lister le catalogue. */
let joursTravail = 7;
const PERIODES_TRAVAIL: { jours: number; label: string; phrase: string }[] = [
	{ jours: 1, label: "Aujourd'hui", phrase: "aujourd'hui" },
	{ jours: 2, label: '2 jours', phrase: 'sur les 2 derniers jours' },
	{ jours: 7, label: '1 semaine', phrase: 'sur les 7 derniers jours' },
];
const periodeTravail = () => PERIODES_TRAVAIL.find((p) => p.jours === joursTravail)!;
/* Lignes visibles par matière avant repli : au-delà, la liste devient un mur de texte dans
   un onglet déjà long (avis designer). Le reste est DÉPLIABLE et non résumé par un
   compteur — même parti pris que les erreurs plus anciennes (cf. encadrant-erreurs). */
const MAX_TRAVAIL_PAR_MATIERE = 6;

/* L'échelle d'acquisition (mots + ordre) est partagée avec la banque de mots (#496) :
   elle vit dans encadrant-commun, module feuille commun aux deux sections. */

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
      ${travailHTML(consulte)}
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

/* ---------- Bloc « Travaillé récemment » (#520) ----------
   Nomme DIRECTEMENT ce qui a été travaillé. L'information existait déjà (détail par leçon
   de l'accordéon « Notions par catégorie ») mais il fallait déplier catégorie par catégorie
   pour la reconstituer, et le graphe d'activité juste au-dessus compte des séances sans
   nommer une seule leçon.
   Groupé par MATIÈRE, chaque ligne portant sa CATÉGORIE : le libellé seul (« Décompo. de 60 »)
   ne dit pas à un parent s'il s'agit d'une notion de base ou avancée (avis pédago). Et aucun
   état d'acquisition par ligne — une notion tout juste abordée est normalement encore « à
   découvrir », un badge afficherait donc un niveau bas sur ce qu'il y a de plus récent (idem).
   Sélection, comptage et tri vivent dans core (`travailRecent`). */
function travailHTML(consulte: Profile): string {
	const { jours, phrase } = periodeTravail();
	const now = Date.now();
	const groupes = travailRecentProfil(consulte, jours, now);
	const total = groupes.reduce((s, g) => s + g.cibles.length, 0);
	const resume = resumeTravail(groupes, phrase);
	// Bascule de période : mêmes fenêtres que le filtre des erreurs, sans « Tout ».
	// L'option active porte le résultat du filtre dans son nom accessible (comme les
	// erreurs) : sinon, au clavier, on change de période sans savoir ce que ça donne.
	const bascule = segmentHTML({
		act: 'travail-periode',
		valAttr: 'jours',
		label: 'Période des leçons travaillées',
		active: String(jours),
		options: PERIODES_TRAVAIL.map((p) => ({
			val: String(p.jours),
			label: p.label,
			ariaLabel: p.jours === jours ? `${p.label}, ${resume.toLowerCase()}` : undefined,
		})),
	});
	const corps =
		total === 0
			? `<p class="enc-hint">${resume}.</p>`
			: `${groupes.map((g) => groupeTravailHTML(g, now)).join('')}
      <p class="enc-hint">${resume}.</p>`;
	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('check-square')} Travaillé récemment</h3>
      ${bascule}
      ${corps}
    </div>`;
}

/* Synthèse du bloc — UNE seule formulation, qui sert aussi de nom accessible à l'option de
   période active : deux textes séparés avaient divergé (l'écran disait « Aucune leçon
   travaillée » quand le lecteur d'écran entendait « 0 leçon travaillée »).
   Les dictées sont comptées À PART : elles figurent bien dans la liste, mais annoncer
   « 1 leçon travaillée » pour une dictée serait faux, et l'écran distingue soigneusement les
   deux partout ailleurs. Fenêtre vide : on parle du temps écoulé et non de l'effort de
   l'enfant, avec le mot déjà employé par le graphe d'activité juste au-dessus (« Aucune
   session ») — et jamais un « 0 » en tête de phrase. */
function resumeTravail(groupes: GroupeTravail[], phrase: string): string {
	const cibles = groupes.flatMap((g) => g.cibles);
	if (cibles.length === 0) return `Aucune session ${phrase}`;
	const dictees = cibles.filter((c) => c.kind === 'dictee').length;
	const lecons = cibles.length - dictees;
	const bouts = [
		lecons > 0 ? `${lecons} leçon${lecons > 1 ? 's' : ''}` : '',
		dictees > 0 ? `${dictees} dictée${dictees > 1 ? 's' : ''}` : '',
	].filter(Boolean);
	return `${bouts.join(' et ')} travaillée${cibles.length > 1 ? 's' : ''} ${phrase}`;
}

/* Une matière : son libellé, ses lignes, et le reste DÉPLIABLE au-delà de
   MAX_TRAVAIL_PAR_MATIERE (jamais un simple compteur : annoncer des lignes sans permettre
   de les lire crée un écart inexplicable, cf. les erreurs plus anciennes). */
function groupeTravailHTML(g: GroupeTravail, now: number): string {
	const visibles = g.cibles.slice(0, MAX_TRAVAIL_PAR_MATIERE);
	const reste = g.cibles.slice(MAX_TRAVAIL_PAR_MATIERE);
	const texte = `${reste.length} autre${reste.length > 1 ? 's' : ''}`;
	// Nom accessible enrichi de la matière : deux matières peuvent déborder, et une série
	// de « 3 autres » identiques serait sans repère en navigation au rotor.
	const repli = reste.length
		? `<details class="enc-trav-plus">
        <summary class="enc-trav-plus-sum" aria-label="${escapeHTML(`${texte} en ${g.label.toLowerCase()}`)}">${texte}</summary>
        <ul class="enc-trav-list">${reste.map((c) => ligneTravailHTML(c, now)).join('')}</ul>
      </details>`
		: '';
	return `<h4 class="enc-sub-lab">${escapeHTML(g.label)}</h4>
      <ul class="enc-trav-list">${visibles.map((c) => ligneTravailHTML(c, now)).join('')}</ul>
      ${repli}`;
}

/* Une ligne : libellé de la leçon (ou de la liste de dictée) + méta factuelle. Le compte
   est OMIS quand il est inconnu (leçon travaillée dans un bilan ou un sprint, qui ne
   référencent pas une cible unique) — mieux vaut une méta plus courte qu'un chiffre faux.
   « 2 fois » et non « travaillée 2 fois » : cette dernière formule est celle de l'accordéon
   « Notions par catégorie », où elle compte les séances DEPUIS TOUJOURS. Deux chiffres
   différents sous la même phrase, sur le même écran, se lisaient comme un bug (avis langue) ;
   l'ellipse réserve la formule longue au compte cumulé.
   Pas d'action sur la ligne : épingler et imprimer restent groupés dans l'accordéon, ce bloc
   est une lecture. */
function ligneTravailHTML(c: CibleTravaillee, now: number): string {
	const meta = [
		c.kind === 'dictee' ? 'Dictée' : c.contexte,
		c.seances === null ? '' : `${c.seances} fois`,
		libelleDerniereFois(c.derniereFois, now),
	]
		.filter(Boolean)
		.join(' · ');
	return `<li class="enc-trav-item">
      <span class="enc-trav-lab">${escapeHTML(c.label)}</span>
      <span class="enc-trav-meta">${escapeHTML(meta)}</span>
    </li>`;
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
/* Mots d'une dictée, consultables depuis l'espace encadrant (#441) : l'adulte doit pouvoir
   lire la liste sans lancer la dictée lui-même (préparer une aide, comparer à ce qui a été
   vu en classe). `<details>` natif plutôt que l'infobulle au survol du catalogue enfant
   (`.ortho-apercu`) : celle-ci est purement décorative (`aria-hidden`) et sans équivalent
   tactile fiable, alors qu'ici le contenu EST l'information cherchée (avis a11y). Le repli
   est SCOPÉ aux seuls mots — il n'englobe pas la ligne, sinon le bouton « Épingler », action
   principale et fréquente, sortirait de l'ordre de tabulation tant que le bloc est fermé.
   Le résumé porte un `aria-label` enrichi du libellé : une série de « Voir les mots »
   identiques serait sans repère en navigation au rotor (même parade que enc-err-anciennes).
   Les mots sont une VRAIE liste (annonce « liste, N éléments », relecture mot à mot), et
   jamais `aria-hidden`. Texte du résumé invariant : le compte est déjà dans la méta. */
function motsDicteeHTML(mots: readonly string[], label: string): string {
	if (!mots.length) return '';
	const items = mots.map((m) => `<li>${escapeHTML(m)}</li>`).join('');
	return `<details class="enc-mots">
      <summary aria-label="Voir les mots de « ${escapeHTML(label)} »">Voir les mots</summary>
      <ul class="enc-mots-list">${items}</ul>
    </details>`;
}

function ligneListeOrtho(l: RecapListeOrtho): string {
	const entryId = orthoRevoirId(l.id);
	// « en cours » regroupe « 1 mot commencé » et « 9/10 maîtrisés » : on accole le compte
	// factuel de mots maîtrisés pour restituer la nuance (avis pédago), jamais de %.
	const compte =
		l.niveau === 'en-cours'
			? `${l.maitrises}/${l.nbMots} mot${l.nbMots > 1 ? 's' : ''} maîtrisé${l.maitrises > 1 ? 's' : ''}`
			: `${l.nbMots} mot${l.nbMots > 1 ? 's' : ''}`;
	const meta = `${compte}${l.source === 'predefini' ? ' · dictée proposée' : ''}`;
	// Le repli des mots est le DERNIER enfant : il occupe toute la largeur (flex-basis 100 %),
	// donc l'ordre du DOM reste l'ordre visuel — et « Épingler » garde sa place dans la
	// tabulation, avant lui (a11y : ordre de focus = ordre de lecture).
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
      ${motsDicteeHTML(l.mots, l.label)}
    </li>`;
}
/* Une dictée « proposée » (prédéfinie non commencée, épinglable à l'avance) : rendue par
   `ligneRevoir`, le renderer de la famille .enc-revoir-item, et non plus par une copie
   manuelle qui perdait le badge de niveau (#441). Elle ressemble donc exactement aux
   autres cartes de son onglet. `etat: 'a-decouvrir'` est constant par construction (une
   proposée n'est jamais commencée) : ce n'est pas un discriminant entre les lignes, mais
   il reconduit le code couleur + mot déjà appris ailleurs (avis designer). Toujours
   « Épingler » (par construction elle n'est pas épinglée), et rien à imprimer. */
function ligneDicteeProposee(d: DicteeProposee): string {
	return ligneRevoir(orthoRevoirId(d.id), d.label, false, {
		etat: 'a-decouvrir',
		imprimable: false,
		meta: `${d.nbMots} mot${d.nbMots > 1 ? 's' : ''}`,
		mots: d.mots,
	});
}
/* Volet « Listes » : suivi des listes du parent + prédéfinies commencées ou épinglées. */
function voletListesHTML(
	consulte: Profile,
	listes: RecapListeOrtho[],
	proposees: DicteeProposee[],
): string {
	const legende = ORDRE_NIVEAUX_ORTHO.map(
		(n) => `<span class="enc-key enc-key-${n}">${MOT_NIVEAU[n]}</span>`,
	).join('');
	const suivi = listes.length
		? `<ul class="enc-detail">${listes.map(ligneListeOrtho).join('')}</ul>`
		: `<p class="enc-hint">Aucune dictée commencée pour le moment.</p>`;
	// « À l'avance » (parcourir/épingler une dictée non commencée) est déplacé dans l'onglet
	// Programme (#459) : c'est un acte de préparation, pas d'observation. On laisse ici un
	// simple renvoi pour ne pas le faire disparaître silencieusement.
	const renvoi = proposees.length
		? `<p class="enc-hint">Proposer une dictée à l'avance ? Rendez-vous dans l'onglet <strong>Programme</strong>.</p>`
		: '';
	return `<p class="enc-legend">${legende}</p>
      <p class="enc-hint">Les listes de dictée (mots invariables, thèmes, vos propres listes) et leur avancement. Épinglez-en une pour qu'elle revienne sur l'accueil de ${escapeHTML(consulte.name)}.</p>
      ${suivi}
      ${renvoi}`;
}

/* Bloc « Dictées » : deux volets sous une bascule (#496) — les LISTES (avancement,
   épinglage) et les MOTS (la banque, où l'adulte localise et supprime). Deux angles sur
   le même corpus, pas deux sections : c'est le même endroit où l'on vient regarder les
   dictées. Le volet « Listes » reste le défaut — la banque peut faire des centaines de
   lignes, elle ne s'affiche que si on la demande. Le rendu du volet « Mots » vit dans
   `encadrant-banque` (état de vue, recherche, suppression). */
function listesOrthoHTML(consulte: Profile): string {
	const dispo = dicteeDisponible();
	const listes = listesOrthoProfil(consulte, dispo);
	const proposees = dicteesProposees(consulte, dispo);
	const banque = banqueDuProfil(consulte.uuid);
	// Rien à montrer ni côté listes ni côté mots. La banque compte dans cette condition :
	// un parent qui a supprimé toutes ses listes garde des mots en révision, et c'est
	// PRÉCISÉMENT le cas où il a besoin d'y accéder (le bloc disparaîtrait sinon).
	if (listes.length === 0 && proposees.length === 0 && banque.length === 0) return '';
	const catOrtho = CATEGORIES.find((c) => c.id === ORTHO_CATEGORY_ID);
	// Pas de bascule tant que la banque est vide : un volet vide n'a rien à proposer.
	const bascule = banque.length
		? segmentHTML({
				act: 'dictees-vue',
				valAttr: 'vue',
				label: 'Affichage des dictées',
				active: vueDictees(),
				options: [
					{ val: 'listes', label: 'Listes' },
					{ val: 'mots', label: 'Mots' },
				],
			})
		: '';
	const corps =
		banque.length && vueDictees() === 'mots'
			? banqueMotsHTML(consulte, banque)
			: voletListesHTML(consulte, listes, proposees);
	return `<div class="enc-block">
      <h3 class="enc-h3">${icon(catOrtho?.icon ?? 'book-open')} Dictées</h3>
      ${bascule}
      ${corps}
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

/* Marqueur « ça bloque » d'une ligne « à revoir » (#492) : sans lui, l'adulte voyait la
   même carte pour une notion simplement fragile et pour un mur que l'enfant retrouve
   depuis plusieurs jours — or c'est le second cas qui appelle une explication humaine
   (avis pédagogue, #485). Il s'ajoute à l'état d'acquisition au lieu de le remplacer :
   les deux informations sont utiles (« où en est la notion » ≠ « ça coince »).

   Il apparaît AUSSI sur une ligne déjà épinglée : épingler fait passer la notion des
   suggestions aux épinglées, le signal ne doit pas disparaître au moment où l'adulte
   agit. Le nombre de jours n'est pas affiché (une donnée chiffrée sur un enfant se lit
   comme une note) : le `title` donne le détail, la puce dit le fait.

   Libellé « reste un point dur » et non « revient souvent » (avis rédacteur) : « revient »
   se lit aussi comme « revient souvent dans les exercices », lecture neutre qui annulait
   le signal. On qualifie la NOTION, jamais l'enfant. Pas d'icône : elle serait redondante
   avec le texte, et `repeat` — le seul picto qui aurait convenu — sert déjà de titre au
   bloc « À revoir ensemble » avec un autre sens (avis accessibilité). */
function signalBlocage(blocages: number): string {
	if (blocages < BLOCAGES_SIGNAL_ADULTE) return '';
	return `<span class="enc-revoir-signal" title="Revient depuis plusieurs jours sans être réussie">reste un point dur</span>`;
}

/* Jours de blocage par leçon, à plat depuis le récap (les suggestions comme les
   épinglées y puisent). Une liste de dictée n'a pas de compteur → absente de la carte. */
function blocagesParLecon(recap: RecapProfil): Map<string, number> {
	const out = new Map<string, number>();
	for (const cat of recap.parCategorie) {
		for (const n of cat.lecons) if (n.blocages > 0) out.set(n.lessonId, n.blocages);
	}
	return out;
}

/* Une ligne « à revoir » : libellé + état éventuel + actions (épingler/retirer + impression).
   `entryId` = id transmis au toggle/à l'impression (leçon = `LessonDef.id` ; liste de dictée =
   `orthoRevoirId(id)`). `etat` = état d'acquisition affiché.

   Les épinglées n'affichaient aucun état à l'origine, or l'adulte ne pouvait alors pas juger
   s'il fallait désépingler (#518). `horsNiveau` prend le relais quand il n'y a pas d'état à
   montrer : la cible a quitté le niveau suivi, donc l'épingle est inerte (`revoirActives`
   l'écarte, elle ne revient jamais sur l'accueil de l'enfant) — le motif le plus utile pour
   décider de la retirer. Il vient de `EpingleEntry`, PAS d'une absence d'`etat` : un état
   manquant sans `horsNiveau` est une incohérence de données, et on n'affiche alors rien plutôt
   qu'un motif faux. Une suggestion, elle, sort du récap : son état est là par construction.
   Les lignes « Retirées automatiquement » n'ont pas d'état : elles affichent `quand`.

   `imprimable` = false pour une liste de dictée (pas de fiche à imprimer).
   `blocages` = jours où l'enfant a buté sur la leçon dans la leçon du jour (#485) : au-delà du
   seuil, la ligne porte un marqueur EN PLUS de l'état (cf. `signalBlocage`).
   `meta` = ligne secondaire sous le libellé (dictées : « N mots ») ; `mots` = repli
   consultable des mots d'une dictée (#441). Les deux sont absents pour une leçon du
   catalogue, qui n'a ni l'un ni l'autre. */
function ligneRevoir(
	entryId: string,
	label: string,
	epingle: boolean,
	opts: {
		etat?: NiveauNotion;
		horsNiveau?: boolean;
		imprimable?: boolean;
		quand?: string;
		blocages?: number;
		meta?: string;
		mots?: readonly string[];
	} = {},
): string {
	const { etat, horsNiveau = false, imprimable = true, quand, blocages = 0, meta, mots } = opts;
	// `sr-only` « Niveau : » comme dans `ligneListeOrtho` (même échelle) : depuis que les
	// épinglées ET les suggestions portent le badge, une navigation à la voix enchaînerait des
	// « acquis » / « en cours » / « à renforcer » sans savoir de quoi ils parlent (avis a11y).
	const badge = etat
		? `<span class="enc-revoir-etat enc-key-${etat}"><span class="sr-only">Niveau : </span>${MOT_NIVEAU[etat]}</span>`
		: horsNiveau
			? `<span class="enc-revoir-hors" title="Pas au programme de la classe suivie : cette épingle ne revient pas sur l'accueil de l'enfant">hors du niveau suivi</span>`
			: quand
				? `<span class="enc-revoir-quand">Retirée ${escapeHTML(quand)}</span>`
				: '';
	return `<li class="enc-revoir-item">
      <span class="enc-revoir-main">
        <span class="enc-revoir-lab">${escapeHTML(label)}</span>
        ${meta ? `<span class="enc-detail-meta">${escapeHTML(meta)}</span>` : ''}
      </span>
      ${badge}${signalBlocage(blocages)}
      <span class="enc-actions">
        <button type="button" class="enc-btn-sec${epingle ? ' on' : ''}" data-act="epingler" data-lesson="${entryId}" aria-label="${epingle ? 'Retirer' : 'Épingler'} « ${escapeHTML(label)} »">${epingle ? 'Retirer' : 'Épingler'}</button>
        ${imprimable ? boutonsImpression(entryId, label) : ''}
      </span>
      ${mots ? motsDicteeHTML(mots, label) : ''}
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

	// Jours de blocage (#492) : sert aux DEUX blocs, épinglées comprises.
	const blocages = blocagesParLecon(recap);
	// État d'acquisition des épinglées (#518) — résolu par `niveauEpingle` (core, pur). Le suivi
	// des dictées n'est relu que si une liste est épinglée : sinon c'est un accès stockage pour rien.
	const listesOrtho = pinned.some((e) => e.kind === 'ortho')
		? listesOrthoProfil(consulte, dicteeDisponible())
		: [];
	const blocEpinglees = pinned.length
		? `<ul class="enc-revoir">${pinned
				.map((e) =>
					ligneRevoir(e.kind === 'ortho' ? orthoRevoirId(e.id) : e.id, e.label, true, {
						imprimable: e.kind !== 'ortho',
						blocages: blocages.get(e.id),
						etat: niveauEpingle(e, recap, listesOrtho) ?? undefined,
						horsNiveau: e.horsNiveau,
					}),
				)
				.join('')}</ul>`
		: `<p class="enc-hint">Aucune leçon épinglée pour le moment.</p>`;
	const blocSuggestions = suggestions.length
		? `<h4 class="enc-sub-lab">Suggestions</h4>
       <p class="enc-hint">Leçons qui gagneraient à être revues :</p>
       <ul class="enc-revoir">${suggestions
					.map((n) =>
						ligneRevoir(n.lessonId, n.label, false, { etat: n.niveau, blocages: n.blocages }),
					)
					.join('')}</ul>`
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
	// l'orchestrateur, qui ne le compose pas. Même raison pour le volet « Mots » du bloc
	// Dictées (#496), composé par `listesOrthoHTML`.
	if (erreursClick(act, el)) return true;
	if (banqueClick(act, el)) return true;
	switch (act) {
		case 'activite-mode':
			vueActivite = el.dataset.mode === 'type' ? 'type' : 'total';
			renderEspace();
			// Le re-rendu recrée le DOM → on garde le focus clavier sur le bouton actif.
			// Sélecteur SCOPÉ par `data-act` : quatre segments `.enc-act-mode.on` coexistent
			// désormais dans l'onglet Suivi (activité, travail récent, erreurs, révision).
			(container()?.querySelector('[data-act="activite-mode"].on') as HTMLElement | null)?.focus({
				preventScroll: true,
			});
			return true;
		case 'travail-periode': {
			const jours = Number(el.dataset.jours);
			if (PERIODES_TRAVAIL.some((p) => p.jours === jours)) joursTravail = jours;
			renderEspace();
			(container()?.querySelector('[data-act="travail-periode"].on') as HTMLElement | null)?.focus({
				preventScroll: true,
			});
			return true;
		}
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

/* Saisie au fil de la frappe (événement `input`) : seul le volet « Mots » du bloc Dictées
   en a besoin, et c'est cette section qui le compose — d'où l'aiguillage ici, comme pour
   les clics. Distinct de `change`, qui n'arrive qu'au blur. */
export function progressionInput(act: string, el: HTMLElement): boolean {
	return banqueInput(act, el);
}

function onImprimer(lessonId: string, corrige = false): void {
	const consulte = listProfiles().find((p) => p.uuid === consulteUuid()) ?? activeProfile();
	const lesson = getAllLessons().find((l) => l.id === lessonId);
	if (!consulte || !lesson) return;
	// Impression au niveau du profil CONSULTÉ, sans changer le profil/niveau actif.
	const level = niveauProfilMatiere(consulte, lesson.subject);
	printScope({
		title: labelLecon(lesson, level),
		lessonIds: [lessonId],
		kind: 'fiches',
		level,
		corrige,
	});
}
