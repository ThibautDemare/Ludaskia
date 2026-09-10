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
import { icon } from './icon';
import type { Profile } from '../core/profiles';
import {
	revisionProfil,
	echelleRevisionLabels,
	type RecapRevision,
	type EntreeRevision,
	type GroupeRevision,
	type PalierRevision,
	tauxRetardProfil,
} from '../core/encadrant-stats';
import type { TauxTranche } from '../core/retard-journal';
import { LEVEL_LABEL } from '../core/levels';
import { renderEspace, container } from './encadrant-commun';
import { segmentHTML } from './segment';
import { html, type SafeHtml, VIDE, joindre } from '../core/html';

/* ---------- État de la section (module) ---------- */
type VueRevision = 'categorie' | 'urgence' | 'palier';
let vueRevision: VueRevision = 'categorie';

/* Lignes visibles avant repli dans les deux vues qui listent SANS accordéon (avis designer).
   Deux plafonds distincts parce que les deux listes n'ont pas la même portée : un étage est
   un sous-niveau parmi sept, la liste à plat est le corps entier de la vue. La vue « Par
   catégorie » n'en a pas besoin — ses <details> sont déjà repliés par défaut.
   Les compteurs affichés (synthèse du bloc, résumé d'étage) restent calculés sur les
   tableaux COMPLETS, jamais sur la tranche rendue : c'est la condition pour plafonner sans
   mentir sur ce que contient la file. */
const MAX_PAR_ETAGE = 6;
const MAX_URGENCE = 20;

interface RenduEntree {
	catLabel?: string; // catégorie rappelée sur la ligne (vues à plat, sans en-tête de catégorie)
	palierDejaAffiche?: boolean; // porté par l'en-tête d'étage, à ne pas répéter (vue « Par palier »)
}

/* Une entrée de la file : libellé (+ catégorie en vue à plat) et, à droite, son état
   dans le flux — badge « acquis », ou palier courant + échéance relative. */
function entreeHTML(e: EntreeRevision, o: RenduEntree = {}): SafeHtml {
	// En vue « Par palier », l'en-tête d'étage porte déjà le palier (et le mot « acquis ») :
	// le répéter sur chaque ligne du même étage n'ajouterait rien et alourdirait la liste —
	// même principe que la catégorie, jamais répétée sous son propre en-tête. Reste
	// l'échéance, seule information qui varie d'une ligne à l'autre à palier égal. Un état
	// vide n'émet pas de conteneur (une coquille à styler pour rien).
	const bouts: SafeHtml[] = [];
	/* Une entrée EN ATTENTE (#690) n'a pas de palier à annoncer : son compteur n'a pas
	   démarré. Sans ce cas, elle affichait « Palier : 1 jour » suivi d'une échéance VIDE,
	   donc une ligne quasi identique à une entrée réellement en rotation — le parent lisait
	   comme « en cours » ce qui n'a jamais commencé. Le libellé reprend celui des comptes,
	   plutôt que « en attente » nu qui connote l'imminence (cf. `syntheseRevision`).
	   Il remplace le palier MÊME quand l'en-tête d'étage l'a déjà affiché : c'est justement
	   là que la ligne contredisait son étage. */
	if (e.enAttente) {
		bouts.push(html`<span class="enc-rev-palier">En attente de rencontre</span>`);
	} else if (!o.palierDejaAffiche) {
		bouts.push(
			e.acquis
				? html`<span class="enc-rev-badge">${icon('check-circle')} acquis</span>`
				: html`<span class="enc-rev-palier">Palier : ${e.palierLabel}</span>`,
		);
	}
	// Une entrée en attente n'a pas d'échéance : émettre le conteneur produirait un span vide.
	if (!e.acquis && !e.enAttente) {
		bouts.push(html`<span class="enc-rev-echeance${e.du ? ' du' : ''}">${e.echeance}</span>`);
	}
	const etat = bouts.length ? html`<span class="enc-rev-etat">${bouts}</span>` : VIDE;
	// La catégorie n'est répétée qu'en vue à plat (en vue groupée, c'est l'en-tête).
	const cat = o.catLabel ? html`<span class="enc-rev-cat">${o.catLabel}</span>` : VIDE;
	// Notion entretenue depuis le niveau inférieur (#232) : on la NOMME, côté adulte
	// seulement. Sans ça, une leçon multi-niveaux apparaîtrait deux fois sous le même
	// libellé dans la même catégorie, et le parent ne saurait pas ce qui est entretenu.
	// Réutilise la pastille de catégorie (même rôle visuel, aucun style à ajouter) ; le
	// préfixe non visuel évite un « CE2 » énigmatique au lecteur d'écran.
	const niveau = e.niveauOrigine
		? html`<span class="enc-rev-cat"><span class="sr-only">Niveau d'origine : </span>${LEVEL_LABEL[e.niveauOrigine]}</span>`
		: VIDE;
	// Nomme la nature « mot » pour les lecteurs d'écran (un mot isolé serait ambigu).
	const natureSr = e.nature === 'mot' ? html`<span class="sr-only">Mot : </span>` : VIDE;
	return html`<li class="enc-rev-item${e.acquis ? ' acquis' : ''}">
      <span class="enc-rev-main">
        <span class="enc-rev-lab">${natureSr}${e.label}</span>
        ${niveau}${cat}
      </span>
      ${etat}
    </li>`;
}

/* Synthèse chiffrée du bloc entier. Aucun segment NUL n'est affiché — même règle que
   `resumeGroupe` juste en dessous, qui l'appliquait déjà de son côté. La divergence entre
   les deux ne se voyait jamais avant #690 : à `total > 0`, `enRotation` ne pouvait valoir
   zéro que si tout était acquis. Depuis, le scénario même qui motive la fonctionnalité —
   cent leçons qu'on vient de déclarer — ouvrait la phrase sur « 0 entrée en révision »,
   donc sur un compte nul avant la seule information utile.
   `total === enAttente + enRotation + acquises` et l'appelant écarte déjà `total === 0` :
   la phrase n'est donc jamais réduite à son point final. Pure et exportée pour être tenue
   par un test (remontée `redacteur-contenu-francais`). */
export function syntheseRevision(recap: RecapRevision): string {
	const parts: string[] = [];
	if (recap.enRotation > 0) {
		parts.push(
			`${recap.enRotation} entrée${recap.enRotation > 1 ? 's' : ''} en révision` +
				(recap.dues > 0 ? `, dont ${recap.dues} à réviser` : ''),
		);
	}
	if (recap.acquises > 0) {
		parts.push(`${recap.acquises} déjà acquise${recap.acquises > 1 ? 's' : ''}`);
	}
	/* « en attente d'une première rencontre », et non « en attente » tout court : en français
	   courant, « en attente » connote l'imminence (« en attente de livraison »), alors qu'ici
	   l'élément peut attendre des semaines — le contresens exact que #690 doit éviter.
	   Nommer ce qu'on attend lève l'ambiguïté, et « rencontre » couvre d'un seul mot la leçon
	   travaillée comme l'atelier d'un mot, sans imposer d'accord de genre (un mot est
	   masculin, une leçon féminine). */
	if (recap.enAttente > 0) {
		parts.push(`${recap.enAttente} en attente d'une première rencontre`);
	}
	return parts.join(' · ') + '.';
}

/* Réussite par tranche de retard (#691) : la seule lecture qui répond à « le retard
   fait-il échouer ? ». Une tranche VIDE est omise plutôt que rendue « 0 % » — un taux nul
   dit que tout a été raté, l'absence de mesure ne dit rien. Rend '' quand rien n'a encore
   été mesuré, l'appelant n'affichant alors pas la ligne : un tableau de trois tirets, sur
   un profil neuf, ferait croire à un problème.
   Le pourcentage se met en forme ICI et pas dans le noyau : `tauxParTranche` rend une
   fraction, ce qui la garde comparable et testable sans dépendre d'un arrondi.
   L'effectif est NOMMÉ (« 54 rendez-vous ») et non laissé nu entre parenthèses : un
   nombre seul se devine à l'œil mais s'énonce sans unité au lecteur d'écran, et c'est
   ce que font déjà les seize autres comptes de l'espace encadrant. Le mot est répété à
   chaque tranche parce que chaque segment doit rester lisible seul (cf. #690). */
export function syntheseTauxRetard(taux: readonly TauxTranche[]): string {
	const parts = taux
		.filter((t) => t.taux != null)
		.map((t) => `${t.label} : ${Math.round((t.taux as number) * 100)} % (${t.total} rendez-vous)`);
	return parts.length ? parts.join(' · ') : '';
}

/* Résumé chiffré d'un groupe (dénombrement, jamais de pourcentage). Exportée pour la même
   raison que `syntheseRevision` : elle applique la même règle d'omission des segments nuls,
   et rien ne la tenait. */
export function resumeGroupe(g: GroupeRevision): string {
	const parts: string[] = [];
	// « dont M à réviser » (et non un compte séparé) : les dues sont un SOUS-ENSEMBLE des
	// entrées en révision — les juxtaposer laisserait croire à des comptes disjoints.
	if (g.enRotation > 0) {
		parts.push(`${g.enRotation} en révision${g.dues > 0 ? `, dont ${g.dues} à réviser` : ''}`);
	}
	if (g.acquises > 0) parts.push(`${g.acquises} acquise${g.acquises > 1 ? 's' : ''}`);
	// Une catégorie entièrement en attente (#690) afficherait sinon une ligne VIDE, alors
	// qu'elle contient bien des entrées : le compte doit dire qu'elles n'ont pas démarré.
	// « de rencontre » et pas « en attente » nu, pour la raison dite au-dessus de
	// `syntheseRevision` : un résumé de catégorie se lit replié, sans la phrase de synthèse
	// à proximité, donc il doit rester non ambigu tout seul. Forme courte : la largeur est
	// comptée ici (cf. le passage en `wrap` de la bascule, plus bas).
	if (g.enAttente > 0) parts.push(`${g.enAttente} en attente de rencontre`);
	return parts.join(' · ');
}

/* Vue « Par catégorie » : un <details> dépliable par catégorie (clavier natif),
   réutilise le chrome de « Notions par catégorie » (.enc-cat-d / .enc-cat-sum). */
function vueCategorieHTML(recap: RecapRevision): SafeHtml {
	const cats = joindre(
		recap.groupes.map(
			(g) => html`<details class="enc-cat-d enc-rev-d">
        <summary class="enc-cat-sum">
          <span class="enc-cat-lab">${g.label}</span>
          <span class="enc-cat-counts">${resumeGroupe(g)}</span>
        </summary>
        <ul class="enc-detail enc-rev-list">${joindre(g.entrees.map((e) => entreeHTML(e)))}</ul>
      </details>`,
		),
	);
	return html`<div class="enc-cats">${cats}</div>`;
}

/* Libellé de catégorie par id : les vues à plat n'ont plus d'en-tête de groupe, elles
   rappellent donc la catégorie sur chaque ligne. Tout id rencontré est présent, `groupes`
   couvrant exactement les catégories qui ont au moins une entrée. */
function labelsCategories(recap: RecapRevision): Record<string, string> {
	const labels: Record<string, string> = {};
	for (const g of recap.groupes) labels[g.categoryId] = g.label;
	return labels;
}

/* Le reliquat d'une liste plafonnée, dans un <details> replié. On annonce un nombre ET on
   permet de le lire : annoncer des lignes sans donner le moyen d'y accéder crée un écart
   inexplicable (même parti pris que les leçons travaillées et les erreurs plus anciennes).
   Le libellé BASCULE une fois ouvert (« 12 autres » → « Voir moins ») : replier est déjà
   possible en recliquant le <summary>, mais rien ne le disait, et un libellé qui décrit
   encore l'action d'ouvrir sous une liste déjà ouverte se lit comme un cul-de-sac.
   La bascule est en CSS sur [open] (deux libellés dans le DOM, un seul rendu) plutôt qu'en
   JS : l'état d'un <details> n'a pas de « changement » à écouter côté rendu, et le nom
   accessible du bouton reste ainsi son texte visible dans les deux états.
   Le SECOND « Voir moins », en pied de liste, n'est pas un doublon décoratif : le reliquat
   peut faire plusieurs centaines de lignes (profil réel observé à 247), et le <summary>
   est alors hors écran depuis longtemps quand on finit de lire. Il n'existe que déplié
   (il est dans le <details>), donc il ne parasite pas l'état fermé. */
function repliHTML(cls: string, clsSum: string, texte: string, liste: SafeHtml) {
	return html`<details class="${cls}">
        <summary class="${clsSum}">
          <span class="enc-repli-plus">${texte}</span>
          <span class="enc-repli-moins">Voir moins</span>
        </summary>
        ${liste}
        <button type="button" class="enc-repli-fin" data-act="revision-replier">Voir moins</button>
      </details>`;
}

/* Libellé d'un repli : combien de lignes il cache, ET combien d'entrées DUES parmi elles.
   Les taire serait le seul vrai risque du plafonnement — un adulte qui voit « 12 autres »
   n'a aucune raison de supposer qu'il reste du travail en retard dessous. Le tri par urgence
   place les dues en tête, donc le cas n'arrive qu'au-delà du plafond de lignes dues ; c'est
   précisément le profil chargé que ce plafonnement vise (avis a11y). Même formulation que
   `resumeEtage`, pour que deux comptes lus l'un sous l'autre ne se contredisent pas. */
function texteRepli(reste: EntreeRevision[]): string {
	const dues = reste.filter((e) => e.du).length;
	return (
		`${reste.length} autre${reste.length > 1 ? 's' : ''}` +
		(dues > 0 ? `, dont ${dues} à réviser` : '')
	);
}

/* Vue « Par urgence » : liste à plat, les plus en retard d'abord ; la catégorie est
   rappelée sur chaque ligne puisqu'il n'y a plus d'en-tête de groupe.
   Plafonnée : rien ne borne le nombre d'entrées d'un profil (une par leçon travaillée et
   par mot d'orthographe en rotation), et la liste devenait un mur au bout de quelques
   semaines d'usage. Le tri place déjà les plus en retard en tête, donc le plafond ne coupe
   que la queue la moins urgente. */
function vueUrgenceHTML(recap: RecapRevision): SafeHtml {
	const labels = labelsCategories(recap);
	const ligne = (e: EntreeRevision) => entreeHTML(e, { catLabel: labels[e.categoryId] });
	const liste = (es: EntreeRevision[]) =>
		html`<ul class="enc-rev-list enc-rev-flat">${joindre(es.map(ligne))}</ul>`;
	const reste = recap.parUrgence.slice(MAX_URGENCE);
	const repli = reste.length
		? repliHTML('enc-rev-plus', 'enc-rev-plus-sum', texteRepli(reste), liste(reste))
		: '';
	return html`${liste(recap.parUrgence.slice(0, MAX_URGENCE))}${repli}`;
}

/* Résumé chiffré d'un étage. Même unité que la synthèse du bloc (« entrée »), qui couvre
   à la fois les leçons et les mots d'orthographe. */
export function resumeEtage(p: PalierRevision): string {
	const n = `${p.entrees.length} entrée${p.entrees.length > 1 ? 's' : ''}`;
	/* Les entrées EN ATTENTE (#690) atterrissent toutes à l'étage 0 : leur palier vaut zéro,
	   comme celui d'un élément qui vient réellement d'entrer en rotation. Sans ce sous-compte,
	   l'étage annonce « 5 entrées » sous un en-tête « Palier : 1 jour » alors que trois n'ont
	   jamais démarré — exactement le contresens que l'issue supprime, réintroduit un cran plus
	   bas. Sous-compte et non compte disjoint, comme les dues : elles SONT dans les entrées. */
	const parts = [
		p.dues > 0 ? `${p.dues} à réviser` : '',
		p.enAttente > 0 ? `${p.enAttente} en attente de rencontre` : '',
	].filter(Boolean);
	return parts.length ? `${n}, dont ${parts.join(' et ')}` : n;
}

/* Vue « Par palier » (#555) : les étages de l'escalier, du plus fragile au plus ancré.
   En-têtes NON repliables (et non des <details> comme la vue par catégorie) : la question
   posée ici — « qu'est-ce qui stagne en bas, qu'est-ce qui est presque ancré ? » — est une
   lecture panoramique, que sept accordéons fermés cacheraient précisément (avis designer).
   Vrai <h3> : un lecteur d'écran saute d'un étage à l'autre par les titres, comme l'œil
   balaie les intertitres. Le compteur reste HORS du titre (le titre ne nomme que l'étage,
   sinon la navigation par titres annonce « Palier : 1 semaine 2 entrées, dont 1 à réviser »
   d'une traite) ; c'est le conteneur en ligne qui les tient côte à côte.
   Les étages vides ne sont pas rendus (revisionProfil les omet).
   Ce qui est plafonné, ce sont les LIGNES sous un étage, jamais l'étage lui-même : le
   panorama est porté par les sept couples <h3> + compteur, qui restent visibles sans
   interaction et comptent toujours la liste COMPLÈTE (cf. resumeEtage). Replier l'étage
   entier cacherait justement ce compteur ; plafonner la liste ne cache qu'un second niveau
   de détail. Les entrées étant triées par urgence, les lignes visibles sont les plus
   pressantes de l'étage. */
function vuePalierHTML(recap: RecapRevision): SafeHtml {
	const labels = labelsCategories(recap);
	return joindre(recap.parPalier.map((p) => etageHTML(p, labels)));
}

/* Un étage : son en-tête, ses lignes visibles, et le reliquat replié. Fonction nommée et non
   un callback dans le `.map()` ci-dessus, comme tous les autres rendus d'item du fichier et
   des blocs voisins (`groupeTravailHTML`, `groupeHTML` des erreurs). */
function etageHTML(p: PalierRevision, labels: Record<string, string>): SafeHtml {
	const liste = (es: EntreeRevision[]) =>
		html`<ul class="enc-rev-list enc-rev-etage-l">${joindre(
			es.map((e) => entreeHTML(e, { catLabel: labels[e.categoryId], palierDejaAffiche: true })),
		)}</ul>`;
	const reste = p.entrees.slice(MAX_PAR_ETAGE);
	const repli = reste.length
		? repliHTML('enc-rev-etage-plus', 'enc-rev-etage-plus-sum', texteRepli(reste), liste(reste))
		: '';
	// L'étage est une région NOMMÉE par son <h3> : les sept « 12 autres » de la vue sont
	// alors distingués par le titre annoncé à l'entrée dans la région, sans allonger un
	// libellé visible qui doit tenir sur une ligne de téléphone.
	const idT = `enc-rev-etage-lab-${p.palier}`;
	// Classe dédiée à l'étage sommital : c'est la seule frontière de l'escalier qui
	// change de couleur (cf. encadrant.scss), l'acquis n'étant pas un cran de plus.
	const acquis = p.acquis ? ' enc-rev-etage--acquis' : '';
	return html`<section class="enc-rev-etage${acquis}" aria-labelledby="${idT}">
        <div class="enc-rev-etage-t">
          <h3 class="enc-rev-etage-lab" id="${idT}">${p.acquis ? 'Acquis' : `Palier : ${p.label}`}</h3>
          <span class="enc-rev-etage-n">${resumeEtage(p)}</span>
        </div>
        ${liste(p.entrees.slice(0, MAX_PAR_ETAGE))}
        ${repli}
      </section>`;
}

/* ---------- Bloc principal (composé par l'orchestrateur, après le récap) ---------- */
export function revisionHTML(consulte: Profile, now: number): SafeHtml {
	const recap = revisionProfil(consulte, now);
	const titre = html`<h2 class="enc-h2">${icon('clock-clockwise')} Révisions de ${consulte.name}</h2>`;

	if (recap.total === 0) {
		return html`<section class="enc-section enc-rev-section">
      ${titre}
      <p class="enc-rev-frame">Le mode Révision propose de revoir, à intervalles de plus en plus espacés, ce que ${consulte.name} a déjà travaillé.</p>
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
	const synthese = syntheseRevision(recap);
	/* Réussite par tranche de retard (#691). Ligne OMISE tant que rien n'est mesuré : le
	   journal ne se remplit qu'au fil des corrections, et trois tirets sur un profil neuf
	   se liraient comme une panne. */
	const retards = syntheseTauxRetard(tauxRetardProfil(consulte));
	const corps =
		vueRevision === 'urgence'
			? vueUrgenceHTML(recap)
			: vueRevision === 'palier'
				? vuePalierHTML(recap)
				: vueCategorieHTML(recap);

	return html`<section class="enc-section enc-rev-section">
      ${titre}
      <p class="enc-rev-frame">Le mode Révision propose de revoir, à intervalles de plus en plus espacés, ce que ${consulte.name} a déjà travaillé. Chaque entrée gravit cet escalier : ${escalier} ; plus le palier est haut, mieux la notion est ancrée.</p>
      <div class="enc-block">
        <p class="enc-hint">${synthese}</p>
        ${
					retards
						? html`<p class="enc-hint">
								Réussite selon le retard du rendez-vous : ${retards}
							</p>`
						: VIDE
				}
        ${bascule}
        ${corps}
      </div>
    </section>`;
}

/* ---------- Handler délégué (aiguillé par l'orchestrateur) ---------- */
export function revisionClick(act: string, el: HTMLElement): boolean {
	// Repli depuis le PIED du reliquat : on referme le <details> englobant, puis on ramène
	// le curseur sur son <summary>. Deux raisons de le faire à la main. Le focus, d'abord :
	// le bouton qu'on vient d'activer disparaît avec le contenu replié, et un focus perdu
	// repart sur <body>, c'est-à-dire en haut de page pour la navigation clavier suivante.
	// Le défilement ensuite : replier plusieurs centaines de lignes fait remonter tout ce
	// qui suit, et sans ce recentrage l'adulte se retrouve à un endroit qu'il n'a pas
	// choisi. `focus()` sans `preventScroll` fait les deux d'un coup.
	// Pas de renderEspace() ici, contrairement à la bascule de vue : re-rendre l'espace
	// entier refermerait TOUS les autres replis et perdrait la position de lecture.
	if (act === 'revision-replier') {
		const bloc = el.closest('details');
		if (!bloc) return true;
		bloc.open = false;
		(bloc.querySelector('summary') as HTMLElement | null)?.focus();
		return true;
	}
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
