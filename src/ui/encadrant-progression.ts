/* ============================================================
   Espace encadrant (#234, découpage #354/#534) — RÉCAP de progression.
   ------------------------------------------------------------
   Rendu de l'accompagnement (pas un bulletin) : chiffres-clés, graphe d'activité
   des 7 derniers jours avec bascule Total / Par type (#319), suivi des listes de
   dictée (frises de composition, #545), et file « À revoir ensemble » (leçons
   épinglées + suggestions automatiques). Possède l'état de bascule du graphe
   (`vueActivite`). Les calculs (recap, échelle) vivent dans core/encadrant-stats ;
   ici, le rendu et les handlers de la section (bascule, épinglage, impression).

   ORCHESTRATEUR de l'onglet Suivi : il COMPOSE les sections voisines
   (`encadrant-travail`, `encadrant-notions`, `encadrant-erreurs`, le volet « Mots »
   d'`encadrant-banque`) et leur AIGUILLE les événements de l'onglet, puisque
   l'orchestrateur de l'espace (`encadrant.ts`) ne les compose pas lui-même.
   Deux actions restent volontairement ICI plutôt que dans la section qui les affiche :
   `epingler` et `imprimer`, dont le markup apparaît à la fois sur les lignes de
   « Notions par catégorie » et sur celles de « À revoir ensemble ». Un second handler
   pour la même action renverrait le focus au premier bouton trouvé dans la page (les
   deux blocs coexistent), et `onImprimer` a besoin de `printScope`, que le module
   feuille `encadrant-commun` n'importe pas. Seul leur markup partagé,
   `boutonsImpression`, y a migré (#534).
   ============================================================ */
import { enumererFr } from '../core/utils';
import { labelLecon } from '../core/levels';
import { icon } from './icon';
import { listProfiles, activeProfile, type Profile } from '../core/profiles';
import {
	toggleRevoirFor,
	niveauProfilMatiere,
	echelleActivite,
	libelleDerniereFois,
	orthoRevoirId,
	listesOrthoProfil,
	dicteesProposees,
	epingleesProfil,
	type OrigineLecon,
	retraitsAutoProfil,
	type RetraitAuto,
	type RecapProfil,
	type RecapListeOrtho,
	type DicteeProposee,
	type NiveauNotion,
	type JourActivite,
	lundiDecale,
	type FriseComposition,
} from '../core/encadrant-stats';
import type { RangMot } from '../core/orthographe/etapes';
import { getAllLessons, CATEGORIES, ORTHO_CATEGORY_ID } from '../core/catalog';
import { BLOCAGES_SIGNAL_ADULTE } from '../core/report-lecon';
import { dicteeDisponible } from './tts';
import { printScope } from './session';
import { erreursHTML, erreursClick } from './encadrant-erreurs';
import { travailHTML, travailClick } from './encadrant-travail';
import { notionsHTML, notionsClick, notionsToggle } from './encadrant-notions';
import {
	badgeClasseOrigine,
	boutonsImpression,
	consulteUuid,
	renderEspace,
	container,
	MOT_NIVEAU,
	ORDRE_NIVEAUX_ORTHO,
} from './encadrant-commun';
import {
	banqueClick,
	banqueDuProfil,
	banqueInput,
	banqueMotsHTML,
	vueDictees,
} from './encadrant-banque';
import { enregistrerSelecteur, selecteurLeconHTML, type ActionLigne } from './selecteur-lecon';
import { segmentHTML } from './segment';
import { html, type SafeHtml, VIDE, joindre } from '../core/html';

/* ---------- État de la section (module) ---------- */
let vueActivite: 'total' | 'type' = 'total'; // graphe d'activité : « Total » ou « Par type » (#319)

/* L'échelle d'acquisition (mots + ordre) est partagée avec la banque de mots (#496) :
   elle vit dans encadrant-commun, module feuille commun aux deux sections. */

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
export function recapHTML(recap: RecapProfil, consulte: Profile): SafeHtml {
	return html`<section class="enc-section">
      <h2 class="enc-h2"><span aria-hidden="true">${consulte.emoji}</span> Progression de ${consulte.name}</h2>
      <p class="enc-frame">Voici où en est l'entraînement de ${consulte.name}, pour vous aider à l'accompagner.</p>
      ${chiffresHTML(recap)}
      ${activiteHTML(recap)}
      ${travailHTML(consulte)}
      ${notionsHTML(recap)}
      ${listesOrthoHTML(consulte, Date.now())}
      ${erreursHTML(consulte, Date.now())}
    </section>`;
}

function chiffresHTML(recap: RecapProfil): SafeHtml {
	const stat = (num: number, lab: string) =>
		html`<div class="enc-stat"><span class="enc-stat-num">${num}</span><span class="enc-stat-lab">${lab}</span></div>`;
	return html`<div class="enc-stats">
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

function activiteHTML(recap: RecapProfil): SafeHtml {
	const jours = recap.activite7j;
	const total = jours.reduce((s, j) => s + j.total, 0);
	// Pas d'activité : pas de graphe ni de bascule (rien à comparer).
	if (total === 0) {
		return html`<div class="enc-block">
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
	const axis = joindre(
		ticks.map((t) => html`<span class="enc-axis-tick" style="bottom:${pct(t)}%">${t}</span>`),
	);
	const gridlines = joindre(
		ticks.map((t) => html`<span class="enc-gridline" style="bottom:${pct(t)}%"></span>`),
	);

	// Libellés de jour, calculés une fois (initiale visible + nom complet pour l'a11y) ;
	// dernière colonne = aujourd'hui.
	const today = new Date();
	const infos = jours.map((_, i) => {
		const d = new Date(today);
		d.setDate(d.getDate() - (jours.length - 1 - i));
		const nom = i === jours.length - 1 ? "aujourd'hui" : NOMS_JOURS[d.getDay()];
		return { initiale: NOMS_JOURS[d.getDay()].charAt(0).toUpperCase(), nom };
	});

	const colonnes = joindre(
		jours.map((j, i) => {
			const detail = parType && j.total ? ` (${repartitionTexte(j)})` : '';
			const cap = infos[i].nom.charAt(0).toUpperCase() + infos[i].nom.slice(1);
			const aria = `${cap} : ${j.total} session${j.total > 1 ? 's' : ''}${detail}`;
			let barre: SafeHtml;
			if (parType) {
				const segs = joindre(
					[...TYPES_ACTIVITE, TYPE_INCONNU].map((t) => {
						const c = j[t.k];
						return c
							? html`<span class="enc-seg-bar ${t.cls}" style="height:${pct(c)}%"></span>`
							: VIDE;
					}),
				);
				barre = html`<div class="enc-bar-stack">${segs}</div>`;
			} else {
				barre = html`<div class="enc-bar" style="height:${pct(j.total)}%"></div>`;
			}
			return html`<div class="enc-bar-col" role="img" aria-label="${aria}" title="${aria}">${barre}</div>`;
		}),
	);
	const labs = joindre(
		infos.map((info) => html`<span class="enc-bar-lab">${info.initiale}</span>`),
	);

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
		? html`<p class="enc-legend">${joindre(
				legendeTypes.map((t) => html`<span class="enc-key ${t.cls}">${t.legende}</span>`),
			)}</p>`
		: VIDE;
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

	return html`<div class="enc-block">
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

/* ---------- Frise de COMPOSITION d'une liste de dictée (#545) ----------
   Ce que la frise d'états ne peut pas dire : entre « commencée » et « acquise », une liste
   passe des semaines sans que rien bouge à l'écran, alors que ses mots montent l'escalier.
   Ici on montre la RÉPARTITION des mots entre les étapes, qui change dès qu'un seul mot
   franchit une marche. Deux vues de la même donnée : la barre du JOUR sur la ligne, et les
   douze semaines dans un repli (le gabarit d'une ligne ne laisse pas la hauteur qu'il
   faudrait — un mot d'une liste de quinze y pèserait moins de deux pixels). */

/* Libellé d'un rang, au singulier puis au pluriel. Des PARTICIPES PASSÉS du geste mesuré,
   jamais une compétence : « réussi aux tuiles » est un fait que le journal peut prouver,
   « sait écrire » serait une affirmation sur l'enfant que rien dans la donnée ne soutient
   (avis langue). Le SOMMET échappe à cette table, cf. MOT_SOMMET. */
const MOT_RANG: Record<RangMot, [string, string]> = {
	neuf: ['pas encore commencé', 'pas encore commencés'],
	atelier: ['découvert', 'découverts'],
	tuiles: ['réussi aux tuiles', 'réussis aux tuiles'],
	motCache: ['réussi au mot caché', 'réussis au mot caché'],
	dictee: ['réussi à la dictée', 'réussis à la dictée'],
};
/* Le sommet ne prend pas le nom de son étape, et ce n'est pas un raccourci de rédaction :
   l'étape qui l'occupe CHANGE avec la voix de synthèse (la dictée avec, le mot caché sans),
   si bien que « réussi à la dictée » serait faux sur un appareil muet. « Maîtrisé » désigne
   exactement « tous les modes requis validés » — c'est sa définition dans design-orthographe.md,
   et c'est déjà le mot à l'écran, un peu plus haut dans la même carte, dans « 3/10 mots
   maîtrisés » (pas à un nombre de lignes fixe : entre les deux s'intercalent le badge d'état,
   le bouton d'épinglage, et la frise d'états quand la liste en a une). Lui
   donner ici un second nom aurait mis deux mots sur un seul fait, à quelques pixels d'écart. */
const MOT_SOMMET: [string, string] = ['maîtrisé', 'maîtrisés'];
/* Couleur par rang. Le sommet a sa propre classe (cf. encadrant.scss) : c'est la POSITION
   qui reste verte, pas une étape nommée — pour la même raison que MOT_SOMMET. */
const CLASSE_RANG: Record<RangMot, string> = {
	neuf: 'enc-compo-neuf',
	atelier: 'enc-compo-atelier',
	tuiles: 'enc-compo-tuiles',
	motCache: 'enc-compo-cache',
	dictee: 'enc-compo-cache',
};
/* Ces trois helpers prennent les PALIERS et non la frise : c'est ce qui permet à la légende du
   volet et aux segments des barres de se peindre et de se nommer par le même chemin. Les faire
   diverger serait le moyen le plus simple d'afficher une légende qui ne décrit plus ce qu'on
   voit. */
const estSommet = (paliers: readonly RangMot[], i: number) => i === paliers.length - 1;
const classeRang = (paliers: readonly RangMot[], i: number) =>
	estSommet(paliers, i) ? 'enc-compo-sommet' : CLASSE_RANG[paliers[i]];
const motRang = (paliers: readonly RangMot[], i: number, n: number) => {
	const [un, plusieurs] = estSommet(paliers, i) ? MOT_SOMMET : MOT_RANG[paliers[i]];
	return n > 1 ? plusieurs : un;
};
/* Une colonne dite en toutes lettres, rangs VIDES omis. Les omettre n'est pas de la place
   gagnée : « 0 mot réussi au mot caché » se lit comme un constat d'échec là où le fait est
   qu'aucun mot n'est encore arrivé jusque-là. */
function motsColonne(c: FriseComposition, col: readonly number[]): string[] {
	const items: string[] = [];
	for (const [i, n] of col.entries()) {
		if (n === 0) continue;
		// Le nom « mot » n'est posé QUE sur le premier item : le français le sous-entend ensuite
		// (« 10 mots pas encore commencés et 2 maîtrisés »), et le répéter cinq fois alourdirait
		// une ligne déjà dense. L'omettre partout, en revanche, donnait « 1 découvert et 1 réussi
		// aux tuiles », un participe sans sujet. Le poser ICI et non en `sr-only` sert aussi la
		// lecture à l'oreille : dans l'ordre du DOM, le badge d'état et le bouton d'épinglage
		// s'intercalent entre la méta (« 3/10 mots maîtrisés ») et cette phrase, si bien que
		// l'antécédent y serait déjà loin (avis langue).
		const sujet = items.length === 0 ? (n > 1 ? ' mots' : ' mot') : '';
		items.push(`${n}${sujet} ${motRang(c.paliers, i, n)}`);
	}
	return items;
}

/* Légende des étapes, pour le volet entier. Les paliers viennent d'une composition RÉELLEMENT
   affichée et non d'un appel à `dicteeDisponible()` : sans voix de synthèse l'escalier perd sa
   marche « dictée », et une légende qui la nommerait quand même annoncerait une couleur que
   les barres ne dessinent jamais. `VIDE` quand aucune liste n'a de composition — il n'y a alors
   rien à légender. */
function legendeEtapesHTML(listes: readonly RecapListeOrtho[]): SafeHtml {
	const paliers = listes.find((l) => l.composition)?.composition?.paliers;
	if (!paliers) return VIDE;
	const cles = joindre(
		paliers.map(
			(_, i) =>
				html`<span class="enc-key ${classeRang(paliers, i)}">${motRang(paliers, i, 1)}</span>`,
		),
	);
	return html`<p class="enc-legend"><span class="enc-legend-titre">Étapes des mots :</span>${cles}</p>`;
}

/* Répartition du JOUR, sur la ligne de la liste : une barre segmentée, et le détail en
   toutes lettres juste dessous. C'est le TEXTE qui porte l'information (la barre est donc
   décorative et masquée aux lecteurs d'écran, sans quoi le même fait serait annoncé deux
   fois) — et c'est ce texte qui change quand un mot monte d'une marche sans que personne ne
   devienne maîtrisé, ce que l'écran d'avant ne savait pas montrer. */
function compositionHTML(c: FriseComposition | null): SafeHtml {
	const jour = c?.semaines[c.semaines.length - 1];
	if (!c || !jour) return VIDE;
	const parts = joindre(
		jour.map((n, i) =>
			n > 0
				? html`<span class="enc-compo-part ${classeRang(c.paliers, i)}" style="flex:${n}"></span>`
				: VIDE,
		),
	);
	return html`<span class="enc-compo">
      <span class="enc-compo-bar" aria-hidden="true">${parts}</span>
      <span class="enc-compo-texte">${enumererFr(motsColonne(c, jour))}.</span>
    </span>`;
}

/* Une entrée du récap : son repère de temps (mis en gras au rendu) et la composition de cette
   semaine-là. `quoi` vide = l'entrée d'ouverture, qui ne compte que les semaines non suivies. */
interface EntreeRecit {
	quand: string;
	quoi: string;
}

/* Repère de temps d'une colonne. Une DATE et non un numéro d'ordre : « semaine 3 » ne dit pas
   si l'on compte depuis le début de la fenêtre ou depuis aujourd'hui, et ne correspond à aucune
   numérotation que le lecteur connaisse par ailleurs. Le lundi vient de `lundiDecale`, la même
   fonction qui découpe les colonnes — le libellé ne peut donc pas désigner une autre semaine
   que celle qu'il surmonte. */
const libelleSemaine = (i: number, total: number, now: number): string =>
	i === total - 1
		? 'Cette semaine'
		: 'Semaine du ' +
			new Date(lundiDecale(now, total - 1 - i)).toLocaleDateString('fr-FR', {
				day: 'numeric',
				month: 'long',
			});

/* Infobulle d'UNE colonne, au survol : sa semaine et sa composition, y compris quand la
   précédente était identique — c'est le complément du récap, qui déduplique justement ces
   semaines-là et n'en dit donc rien de nommé.
   Posée sur la COLONNE et non sur chaque segment : le `title` natif remonte au premier ancêtre
   qui en porte un, donc survoler n'importe quel segment donne la semaine entière, ce qui est
   l'information cherchée — un segment seul ne dirait qu'un rang.
   Un `title` est un confort de souris, sans équivalent tactile fiable (le même constat a fait
   écarter l'infobulle du catalogue enfant, cf. motsDicteeHTML) : il n'est acceptable ICI que
   parce qu'il ne porte rien d'exclusif. Tout ce qu'il dit est déjà dans le récap juste dessous,
   en texte, pour le doigt comme pour le lecteur d'écran. */
const titreColonne = (
	c: FriseComposition,
	i: number,
	col: readonly number[] | null,
	now: number,
): string => {
	const quand = libelleSemaine(i, c.semaines.length, now);
	return col ? `${quand} : ${enumererFr(motsColonne(c, col))}.` : `${quand} : statut inconnu.`;
};

/* Récap des douze semaines, une entrée par semaine où la composition CHANGE — pas les douze.
   Une composition ne bouge que les semaines où l'enfant a travaillé, donc énoncer chaque colonne
   reviendrait surtout à répéter la précédente.
   Une LISTE et non une phrase : la première version joignait tout par « , puis », ce qui donnait
   sur une liste active un pavé de plusieurs centaines de caractères où rien ne disait à quelle
   semaine appartenait quel dénombrement, et où l'oreille devait s'accrocher au seul mot « puis »
   au milieu d'une longue suite de virgules. Une vraie liste s'annonce « liste, N éléments » et
   se parcourt élément par élément.
   Les semaines de statut inconnu sont comptées ensemble en tête : elles forment toujours un
   préfixe (la borne de suivi est unique), et les énumérer n'apprendrait rien de plus que leur
   nombre. « statut inconnu » et non « sans donnée » : c'est le mot que la frise d'états emploie
   déjà pour cette même situation (`MOT_CELLULE.inconnu`, encadrant-notions), et deux mots pour un seul fait auraient
   laissé croire à deux faits. */
function entreesRecit(c: FriseComposition, now: number): EntreeRecit[] {
	const entrees: EntreeRecit[] = [];
	let precedente = '';
	let inconnues = 0;
	c.semaines.forEach((col, i) => {
		if (!col) {
			inconnues++;
			return;
		}
		const cle = col.join(',');
		if (cle === precedente) return;
		precedente = cle;
		entrees.push({
			quand: libelleSemaine(i, c.semaines.length, now),
			quoi: enumererFr(motsColonne(c, col)),
		});
	});
	if (inconnues)
		entrees.unshift({
			quand: `${inconnues} semaine${inconnues > 1 ? 's' : ''} de statut inconnu`,
			quoi: '',
		});
	return entrees;
}

/* Les douze semaines, dans un repli. Replié par DÉFAUT : un parent a facilement dix listes,
   et douze colonnes segmentées sous chacune rendraient l'écran illisible d'entrée (avis
   designer). Le résumé porte le libellé de la liste dans son `aria-label` : une série de
   « Voir les étapes… » identiques serait sans repère au rotor, même parade que le repli des
   mots juste en dessous. Le compte de semaines n'est PAS répété dans le résumé, même
   convention que « Voir les mots » : la constante vit dans le code, et le récit l'annonce une
   fois le repli ouvert. */
function friseCompositionHTML(c: FriseComposition | null, label: string, now: number): SafeHtml {
	if (!c) return VIDE;
	const cols = joindre(
		c.semaines.map((col, s) => {
			const infobulle = titreColonne(c, s, col, now);
			if (!col)
				return html`<span class="enc-compo-col enc-compo-col--inconnue" title="${infobulle}"></span>`;
			const segs = joindre(
				col.map((n, i) =>
					n > 0
						? html`<span class="enc-compo-seg ${classeRang(c.paliers, i)}" style="flex:${n}"></span>`
						: VIDE,
				),
			);
			return html`<span class="enc-compo-col" title="${infobulle}">${segs}</span>`;
		}),
	);
	// Le récit est du TEXTE VISIBLE, pas un `aria-label` : c'est ce qui distingue ce repli d'un
	// graphique décoré. Trois raisons convergentes (avis a11y) :
	// - un `aria-label` sur un `role="img"` n'est ni survolable au doigt ni atteignable au
	//   clavier (le conteneur n'est pas focalisable), donc il ne servait qu'au lecteur d'écran ;
	// - c'est la frontière la plus serrée de la palette (rang sous le sommet contre --ok, 1,24:1
	//   en Nuit) qui portait le plus d'information, et sur 40 px un filet d'1 px ne la donne pas ;
	// - le contenu d'un repli EST l'information cherchée, jamais un décor — c'est déjà le parti
	//   pris juste en dessous pour la liste des mots.
	// Les colonnes deviennent donc décoratives, et l'écran ne dit plus deux fois la même chose.
	return html`<details class="enc-compo-frise">
      <summary aria-label="Voir les étapes semaine par semaine de « ${label} »">Voir les étapes semaine par semaine</summary>
      <span class="enc-compo-cells" aria-hidden="true">${cols}</span>
      <ul class="enc-compo-recit">
        ${joindre(
					entreesRecit(c, now).map((e) =>
						e.quoi
							? html`<li><strong>${e.quand}</strong> : ${e.quoi}.</li>`
							: html`<li><strong>${e.quand}</strong>.</li>`,
					),
				)}
      </ul>
    </details>`;
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
function motsDicteeHTML(mots: readonly string[], label: string): SafeHtml {
	if (!mots.length) return VIDE;
	const items = joindre(mots.map((m) => html`<li>${m}</li>`));
	return html`<details class="enc-mots">
      <summary aria-label="Voir les mots de « ${label} »">Voir les mots</summary>
      <ul class="enc-mots-list">${items}</ul>
    </details>`;
}

function ligneListeOrtho(l: RecapListeOrtho, now: number): SafeHtml {
	const entryId = orthoRevoirId(l.id);
	// « en cours » regroupe « 1 mot commencé » et « 9/10 maîtrisés » : on accole le compte
	// factuel de mots maîtrisés pour restituer la nuance (avis pédago), jamais de %.
	const compte =
		l.niveau === 'en-cours'
			? `${l.maitrises}/${l.nbMots} mot${l.nbMots > 1 ? 's' : ''} maîtrisé${l.maitrises > 1 ? 's' : ''}`
			: `${l.nbMots} mot${l.nbMots > 1 ? 's' : ''}`;
	// Date du cap le PLUS HAUT franchi. `l.frise` n'est plus DESSINÉE sur une ligne de liste
	// depuis #545 (la frise de composition l'a remplacée) : elle ne survit que pour ces deux
	// dates, que rien d'autre ne porte. C'est le critère 20 de l'issue, et c'est pour ça que le
	// journal `ludaskia_paliersOrtho` reste alimenté alors que sa frise a disparu de l'écran.
	const franchi =
		l.frise?.acquisDepuis != null
			? `acquise ${libelleDerniereFois(l.frise.acquisDepuis, now)}`
			: l.frise?.enCoursDepuis != null
				? `commencée ${libelleDerniereFois(l.frise.enCoursDepuis, now)}`
				: '';
	const meta = [compte, l.source === 'predefini' ? 'dictée proposée' : '', franchi]
		.filter(Boolean)
		.join(' · ');
	// Puce d'état TOUJOURS colorée, contrairement à une ligne de leçon : là-bas elle est omise
	// parce que la dernière cellule de la frise d'états dit déjà le même état, en plus grand.
	// Ici cette frise n'existe plus (#545), et la composition qui l'a remplacée ne mesure PAS
	// l'état — elle ne peut donc pas en tenir lieu. La puce redevient le seul canal visuel de
	// l'état, avec le mot qui l'accompagne à droite.
	const puce = html`<span class="enc-detail-puce enc-key-${l.niveau}" aria-hidden="true"></span>`;
	// Le repli des mots est le DERNIER enfant : il occupe toute la largeur (flex-basis 100 %),
	// donc l'ordre du DOM reste l'ordre visuel — et « Épingler » garde sa place dans la
	// tabulation, avant lui (a11y : ordre de focus = ordre de lecture).
	return html`<li class="enc-detail-item">
      ${puce}
      <span class="enc-detail-main">
        <span class="enc-detail-lab">${l.label}</span>
        <span class="enc-detail-meta">${meta}</span>
      </span>
      <span class="enc-detail-mot"><span class="sr-only">Niveau : </span>${MOT_NIVEAU[l.niveau]}</span>
      <span class="enc-actions">
        <button type="button" class="enc-btn-sec${l.epingle ? ' on' : ''}" data-act="epingler" data-lesson="${entryId}" aria-label="${l.epingle ? 'Retirer' : 'Épingler'} « ${l.label} »">${l.epingle ? 'Retirer' : 'Épingler'}</button>
      </span>
      ${compositionHTML(l.composition)}
      ${friseCompositionHTML(l.composition, l.label, now)}
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
function ligneDicteeProposee(d: DicteeProposee): SafeHtml {
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
	now: number,
): SafeHtml {
	const legende = joindre(
		ORDRE_NIVEAUX_ORTHO.map(
			(n) => html`<span class="enc-key enc-key-${n}">${MOT_NIVEAU[n]}</span>`,
		),
	);
	const suivi = listes.length
		? html`<ul class="enc-detail">${joindre(listes.map((l) => ligneListeOrtho(l, now)))}</ul>`
		: html`<p class="enc-hint">Aucune dictée commencée pour le moment.</p>`;
	// « À l'avance » (parcourir/épingler une dictée non commencée) est déplacé dans l'onglet
	// Programme (#459) : c'est un acte de préparation, pas d'observation. On laisse ici un
	// simple renvoi pour ne pas le faire disparaître silencieusement.
	const renvoi = proposees.length
		? html`<p class="enc-hint">Proposer une dictée à l'avance ? Rendez-vous dans l'onglet <strong>Programme</strong>.</p>`
		: VIDE;
	return html`<p class="enc-legend"><span class="enc-legend-titre">État de la liste :</span>${legende}</p>
      ${legendeEtapesHTML(listes)}
      <p class="enc-hint">Les listes de dictée (mots invariables, thèmes, vos propres listes) et leur avancement. Épinglez-en une pour qu'elle revienne sur l'accueil de ${consulte.name}.</p>
      ${suivi}
      ${renvoi}`;
}

/* Bloc « Dictées » : deux volets sous une bascule (#496) — les LISTES (avancement,
   épinglage) et les MOTS (la banque, où l'adulte localise et supprime). Deux angles sur
   le même corpus, pas deux sections : c'est le même endroit où l'on vient regarder les
   dictées. Le volet « Listes » reste le défaut — la banque peut faire des centaines de
   lignes, elle ne s'affiche que si on la demande. Le rendu du volet « Mots » vit dans
   `encadrant-banque` (état de vue, recherche, suppression). */
function listesOrthoHTML(consulte: Profile, now: number): SafeHtml {
	const dispo = dicteeDisponible();
	const listes = listesOrthoProfil(consulte, dispo, now);
	const proposees = dicteesProposees(consulte, dispo);
	const banque = banqueDuProfil(consulte.uuid);
	// Rien à montrer ni côté listes ni côté mots. La banque compte dans cette condition :
	// un parent qui a supprimé toutes ses listes garde des mots en révision, et c'est
	// PRÉCISÉMENT le cas où il a besoin d'y accéder (le bloc disparaîtrait sinon).
	if (listes.length === 0 && proposees.length === 0 && banque.length === 0) return VIDE;
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
			: voletListesHTML(consulte, listes, proposees, now);
	return html`<div class="enc-block">
      <h3 class="enc-h3">${icon(catOrtho?.icon ?? 'book-open')} Dictées</h3>
      ${bascule}
      ${corps}
    </div>`;
}

/* Bloc « Proposer une dictée à l'avance » (onglet Programme, #459) : les dictées PRÉDÉFINIES
   non commencées, épinglables AVANT que l'enfant ne les rencontre (parité avec « épingler
   n'importe quelle leçon »). Extrait du suivi des dictées (autrefois replié sous « Listes de
   dictée ») car c'est un acte de préparation. Renvoie '' s'il n'y a rien à proposer. */
export function dicteesProposeesHTML(consulte: Profile): SafeHtml {
	const proposees = dicteesProposees(consulte, dicteeDisponible());
	if (proposees.length === 0) return VIDE;
	return html`<div class="enc-block">
      <h3 class="enc-h3">${icon('feather')} Proposer une dictée à l'avance</h3>
      <p class="enc-hint">Des dictées prêtes à l'emploi (mots invariables, nombres, thèmes). Épinglez-en une pour la proposer à ${consulte.name} avant qu'il ou elle ne la rencontre.</p>
      <ul class="enc-ortho-dispo-list">${joindre(proposees.map(ligneDicteeProposee))}</ul>
    </div>`;
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
function signalBlocage(blocages: number): SafeHtml {
	if (blocages < BLOCAGES_SIGNAL_ADULTE) return VIDE;
	return html`<span class="enc-revoir-signal" title="Revient depuis plusieurs jours sans être réussie">reste un point dur</span>`;
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
   s'il fallait désépingler (#518). Depuis #556, une épingle d'une AUTRE classe n'est plus
   inerte : elle revient bien sur l'accueil de l'enfant, et sa ligne l'affiche selon d'où elle
   vient (cf. `EtatEpingle`, résolu par le cœur) — état d'acquisition pour la classe suivie et
   pour une classe en dessous, compte-rendu FACTUEL (`essai`) pour une classe au-dessus, où un
   état d'acquisition mentirait dans les deux sens. `origine` porte le badge de classe.
   Une suggestion, elle, sort du récap : son état est là par construction. Les lignes
   « Retirées automatiquement » n'ont pas d'état : elles affichent `quand`.

   `imprimable` = false pour une liste de dictée (pas de fiche à imprimer).
   `blocages` = jours où l'enfant a buté sur la leçon dans la leçon du jour (#485) : au-delà du
   seuil, la ligne porte un marqueur EN PLUS de l'état (cf. `signalBlocage`).
   `meta` = ligne secondaire sous le libellé (dictées : « N mots ») ; `mots` = repli
   consultable des mots d'une dictée (#441). Les deux sont absents pour une leçon du
   catalogue, qui n'a ni l'un ni l'autre. */
/* Quand un retrait automatique a eu lieu, et POURQUOI (#571). Le motif est porté par la
   LIGNE et non plus par la phrase du bloc : celle-ci annonçait une maîtrise pour tout le
   monde, y compris pour une leçon d'une classe suivante réussie une seule fois — le verdict
   même que la ligne d'épingle refuse de prononcer sur une notion pas encore enseignée, deux
   blocs plus haut. Un motif ABSENT (trace d'avant #571) n'affiche que la date : on ne
   suppose pas une maîtrise dont on n'a pas gardé la trace.
   « de nouveau maîtrisée » qualifie la NOTION et non l'enfant, comme partout dans cet écran. */
function quandRetrait(r: RetraitAuto, now: number): string {
	const quand = libelleDerniereFois(r.at, now);
	if (r.motif === 'maitrise') return `${quand}, de nouveau maîtrisée`;
	if (r.motif === 'essai') return `${quand}, essai réussi`;
	return quand;
}

/* Infobulle du badge de classe d'origine, par sens de l'écart. Le badge ne dit que la classe :
   le SENS se lit déjà dans ce que la ligne affiche (état d'acquisition d'un côté, compte-rendu
   factuel de l'autre), et l'écrire se répéterait sur chaque épingle du cas courant. */
const INFOBULLE_ORIGINE: Record<Exclude<OrigineLecon['direction'], 'classe-suivie'>, string> = {
	// « pour cette classe-là », jamais « à ce niveau-là » : le badge d'état voisin porte déjà
	// un « Niveau : » non visuel, et une navigation à la voix enchaînerait les deux sens du
	// mot sur la même ligne (classe scolaire / cran d'acquisition).
	'en-dessous':
		"Leçon d'une classe précédente : épinglée volontairement, elle revient bien sur l'accueil de l'enfant, et son avancement se lit pour cette classe-là.",
	'au-dessus':
		"Leçon d'une classe suivante : on montre ce qui s'est passé le jour de l'essai, sans en tirer un niveau d'acquisition sur une notion pas encore travaillée en classe.",
};

/* Compte-rendu FACTUEL d'une leçon prise dans une classe suivante : ce qui s'est passé, sans
   jugement. Jamais essayée ⇒ on le dit avec les mots que l'écran emploie déjà ailleurs (« pas
   encore travaillée ») : « pas encore réussie » se lirait comme « tentée sans succès », ce qui
   serait faux — le cas le plus courant est celui d'une leçon qu'on vient d'épingler. Pas de
   date pour une dictée (le suivi d'orthographe ne date pas ses essais). */
function texteEssai(essai: { essaye: boolean; at: number | null; reussi: boolean }): string {
	if (!essai.essaye) return 'Pas encore travaillée';
	const quand = essai.at != null ? libelleDerniereFois(essai.at, Date.now()) : '';
	if (!quand) return essai.reussi ? 'Déjà réussie' : 'Déjà commencée';
	return essai.reussi ? `Réussie ${quand}` : `Essayée ${quand}`;
}

function ligneRevoir(
	entryId: string,
	label: string,
	epingle: boolean,
	opts: {
		etat?: NiveauNotion;
		essai?: { essaye: boolean; at: number | null; reussi: boolean };
		origine?: OrigineLecon | null;
		imprimable?: boolean;
		quand?: string;
		blocages?: number;
		meta?: string;
		mots?: readonly string[];
	} = {},
): SafeHtml {
	const { etat, essai, origine, imprimable = true, quand, blocages = 0, meta, mots } = opts;
	// `sr-only` « Niveau : » comme dans `ligneListeOrtho` (même échelle) : depuis que les
	// épinglées ET les suggestions portent le badge, une navigation à la voix enchaînerait des
	// « acquis » / « en cours » / « à renforcer » sans savoir de quoi ils parlent (avis a11y).
	const badge = etat
		? html`<span class="enc-revoir-etat enc-key-${etat}"><span class="sr-only">Niveau : </span>${MOT_NIVEAU[etat]}</span>`
		: essai
			? html`<span class="enc-revoir-essai">${texteEssai(essai)}</span>`
			: quand
				? html`<span class="enc-revoir-quand">Retirée ${quand}</span>`
				: VIDE;
	// Classe d'origine : seulement quand la leçon vient d'ailleurs que la classe suivie, et
	// AVANT l'état — on lit d'abord d'où vient la notion, puis où en est l'enfant dessus.
	const classe =
		origine && origine.direction !== 'classe-suivie'
			? badgeClasseOrigine(origine.niveau, INFOBULLE_ORIGINE[origine.direction])
			: '';
	return html`<li class="enc-revoir-item">
      <span class="enc-revoir-main">
        <span class="enc-revoir-lab">${label}</span>
        ${meta ? html`<span class="enc-detail-meta">${meta}</span>` : ''}
      </span>
      ${classe}${badge}${signalBlocage(blocages)}
      <span class="enc-actions">
        <button type="button" class="enc-btn-sec${epingle ? ' on' : ''}" data-act="epingler" data-lesson="${entryId}" aria-label="${epingle ? 'Retirer' : 'Épingler'} « ${label} »">${epingle ? 'Retirer' : 'Épingler'}</button>
        ${imprimable ? boutonsImpression(entryId, label) : ''}
      </span>
      ${mots ? motsDicteeHTML(mots, label) : ''}
    </li>`;
}

/* Sous-bloc « Épingler une leçon » (#556) : le MÊME sélecteur que le composeur du programme,
   avec « Épingler » pour action de ligne. Il ouvre à l'adulte tout le catalogue, y compris
   les classes que l'enfant ne suit pas — c'est ici qu'on va chercher la notion d'un niveau
   inférieur à consolider. Il COEXISTE avec l'épinglage inline de l'onglet Suivi, qui reste le
   geste naturel quand on vient de lire l'état d'une notion : les deux écrivent la même file. */
const ID_SELECTEUR_EPINGLE = 'revoir-epingler';

function epinglerHTML(consulte: Profile, epinglees: ReadonlySet<string>): SafeHtml {
	// `data-act` propre au sélecteur, alors que le geste est le même que `epingler` : une leçon
	// déjà épinglée porte DEUX boutons sur la page (sa ligne en haut, sa ligne dans l'arbre), et
	// un `data-act` commun renverrait le focus au premier des deux — donc en haut de bloc, à
	// chaque clic dans l'arbre.
	const action: ActionLigne = {
		act: 'epingler-selecteur',
		etat: (l) => ({ label: epinglees.has(l.id) ? 'Retirer' : 'Épingler', on: epinglees.has(l.id) }),
	};
	// Ré-enregistré à chaque rendu : l'action de ligne capture la file épinglée du moment,
	// et c'est elle que le sélecteur rejoue quand il re-rend son arbre à la frappe.
	enregistrerSelecteur(ID_SELECTEUR_EPINGLE, () => {
		const p = listProfiles().find((x) => x.uuid === consulteUuid());
		return p ? { consulte: p, action } : null;
	});
	return html`<h4 class="enc-sub-lab">Épingler une leçon</h4>
     <p class="enc-hint">Choisissez n'importe quelle leçon du catalogue, même pas encore abordée, même d'une autre classe que celle que suit ${consulte.name} : sa classe ne change pas, seule cette leçon est proposée.</p>
     ${selecteurLeconHTML({ id: ID_SELECTEUR_EPINGLE, consulte, action })}`;
}

export function aRevoirHTML(recap: RecapProfil, consulte: Profile): SafeHtml {
	// La file a déjà été nettoyée (purgeRevoirSolides, appelé par l'orchestrateur AVANT le
	// calcul du récap, #465) : la liste de gestion ne peut donc plus contenir de « fantôme »
	// (notion redevenue solide, déjà invisible côté enfant).
	const now = Date.now();
	// Entrées actuellement épinglées (leçons du catalogue ET listes de dictée), résolues.
	const pinned = epingleesProfil(consulte, dicteeDisponible());
	const epingleeIds = new Set(pinned.map((e) => e.id));
	// Suggestions AUTO : leçons « faiblardes » (perf récente < 70 %) non déjà épinglées (max 3).
	const suggestions = recap.aRevoir.filter((n) => !epingleeIds.has(n.lessonId)).slice(0, 3);
	// Trace des retraits automatiques (#465) : une épingle ne disparaît pas sans explication,
	// et se remet d'un clic (« Épingler » → l'entrée est alors conservée, cf. purgeRevoirSolides).
	const retraits = retraitsAutoProfil(consulte, now);

	// Jours de blocage (#492) : sert aux DEUX blocs, épinglées comprises.
	const blocages = blocagesParLecon(recap);
	const blocEpinglees = pinned.length
		? html`<ul class="enc-revoir">${joindre(
				pinned.map((e) =>
					ligneRevoir(e.kind === 'ortho' ? orthoRevoirId(e.id) : e.id, e.label, true, {
						imprimable: e.kind !== 'ortho',
						// Une leçon prise AU-DESSUS n'entre pas dans les compteurs de maîtrise ni dans
						// le signal « reste un point dur » (#492), qui supposent du contenu de la classe
						// suivie : `blocages` vient du récap scopé, il est donc vide pour elle par
						// construction, et son état est un compte-rendu factuel, jamais un cran.
						blocages: blocages.get(e.id),
						etat: e.etat.kind === 'acquisition' ? e.etat.niveau : undefined,
						essai: e.etat.kind === 'essai' ? e.etat : undefined,
						origine: e.origine,
					}),
				),
			)}</ul>`
		: html`<p class="enc-hint">Aucune leçon épinglée pour le moment.</p>`;
	const blocSuggestions = suggestions.length
		? html`<h4 class="enc-sub-lab">Suggestions</h4>
       <p class="enc-hint">Leçons qui gagneraient à être revues :</p>
       <ul class="enc-revoir">${joindre(
					suggestions.map((n) =>
						ligneRevoir(n.lessonId, n.label, false, { etat: n.niveau, blocages: n.blocages }),
					),
				)}</ul>`
		: VIDE;
	const blocRetraits = retraits.length
		? html`<h4 class="enc-sub-lab">Retirées automatiquement</h4>
       <p class="enc-hint">Ces notions ont quitté la liste d'elles-mêmes. Épinglez-en une si vous voulez quand même y revenir.</p>
       <ul class="enc-revoir">${joindre(
					retraits.map((r) =>
						ligneRevoir(r.id, r.label, false, {
							imprimable: r.kind === 'lecon',
							quand: quandRetrait(r, now),
						}),
					),
				)}</ul>`
		: VIDE;

	return html`<div class="enc-block">
      <h3 class="enc-h3">${icon('repeat')} À revoir ensemble</h3>
      <p class="enc-hint">Épinglez une leçon : elle apparaîtra sur l'accueil de ${consulte.name} pour qu'il ou elle y revienne.</p>
      <h4 class="enc-sub-lab">Épinglées</h4>
      ${blocEpinglees}
      ${blocSuggestions}
      ${blocRetraits}
      ${epinglerHTML(consulte, new Set(pinned.filter((e) => e.kind === 'lecon').map((e) => e.id)))}
    </div>`;
}

/* ---------- Handlers délégués (aiguillés par l'orchestrateur) ---------- */
export function progressionClick(act: string, el: HTMLElement): boolean {
	// Les blocs « erreurs » et « travaillé récemment » sont INSÉRÉS par cette section (cf.
	// recapHTML) : leurs actions passent donc par ici, comme `epingler` — et non par un
	// câblage frère dans l'orchestrateur, qui ne les compose pas. Même raison pour le volet
	// « Mots » du bloc Dictées (#496), composé par `listesOrthoHTML`.
	if (erreursClick(act, el)) return true;
	if (travailClick(act, el)) return true;
	if (banqueClick(act, el)) return true;
	if (notionsClick(act, el)) return true;
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
		case 'epingler-selecteur': {
			const uuid = consulteUuid();
			const entryId = el.dataset.lesson;
			if (uuid && entryId) {
				toggleRevoirFor(uuid, entryId);
				renderEspace();
				// Focus rendu au bouton de la MÊME leçon DANS l'arbre : la ligne existe aussi, une
				// fois épinglée, dans le bloc « Épinglées » juste au-dessus — y renvoyer ferait
				// perdre sa place dans l'arbre à qui en épingle plusieurs d'affilée.
				container()
					?.querySelector<HTMLElement>(
						`#sel-corps-${CSS.escape(ID_SELECTEUR_EPINGLE)} [data-act="epingler-selecteur"][data-lesson="${CSS.escape(entryId)}"]`,
					)
					?.focus({ preventScroll: true });
			}
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

/* Événement natif `toggle` d'un `<details>`, capté par l'orchestrateur. Le seul `<details>`
   de l'onglet est celui d'une catégorie de notions : l'aiguillage est donc immédiat. Il
   reste câblé ICI et non directement sur `encadrant-notions` pour que l'orchestrateur
   continue de parler à UNE section par onglet, comme pour les clics et la saisie. */
export function progressionToggle(el: HTMLElement): void {
	notionsToggle(el);
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
