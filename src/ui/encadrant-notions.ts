/* ============================================================
   Espace encadrant (#234, découpage #354/#534) — section « Notions par catégorie ».
   ------------------------------------------------------------
   Maîtrise des notions par catégorie (échelle type LSU) : couverture par matière,
   dépliage global par matière, et le détail d'une catégorie — une ligne par leçon
   (état, suivi, tendance, actions, frise d'états des 12 dernières semaines, #521).
   Possède l'état de vue du dépliage (`categoriesOuvertes`).

   Extrait d'`encadrant-progression.ts` (#534), qui reste l'ORCHESTRATEUR de l'onglet
   Suivi : il compose la section (`recapHTML`) et lui aiguille les événements
   (`progressionClick` → `notionsClick`, `progressionToggle` → `notionsToggle`), sur le
   modèle d'`encadrant-erreurs` / `encadrant-travail` / `encadrant-banque`. Les calculs
   (récap, échelle, frise) vivent dans `core/encadrant-stats` ; ici, le rendu et les
   handlers propres à la section.

   Ce que la section NE possède PAS, volontairement : `epingler` et `imprimer`, dont le
   markup apparaît sur ses lignes mais dont le geste est partagé mot pour mot avec
   « À revoir ensemble ». Les deux restent aiguillés par `progressionClick` (cf. le
   commentaire qui les y garde) ; seul leur markup commun, `boutonsImpression`, a rejoint
   `encadrant-commun`.
   ============================================================ */
import { enumererFr } from '../core/utils';
import { LEVEL_LABEL } from '../core/levels';
import { icon } from './icon';
import {
	libelleDerniereFois,
	type RecapProfil,
	type NiveauNotion,
	type TendanceNotion,
	type CelluleFrise,
	type FriseNotion,
} from '../core/encadrant-stats';
import {
	boutonsImpression,
	container,
	renderEspace,
	MOT_NIVEAU,
	ORDRE_NIVEAUX,
} from './encadrant-commun';
import { html, type SafeHtml, VIDE, joindre, drapeau } from '../core/html';

/* Catégories DÉPLIÉES de « Notions par catégorie », par `categoryId`. `renderEspace` réécrit
   tout le sous-arbre : sans cet état, n'importe quelle action de l'écran (épingler, changer la
   vue du graphe…) refermait toutes les catégories ouvertes — travers préexistant, devenu
   pénalisant avec la frise d'états (#521), dont l'usage même consiste à ouvrir plusieurs
   catégories puis à agir sur une leçon repérée dedans. Retenu comme `vueActivite` : état de
   VUE, jamais persisté (on revient replié à la prochaine ouverture de l'espace). */
const categoriesOuvertes = new Set<string>();

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
function tendanceHTML(t: TendanceNotion | null): SafeHtml {
	if (!t) return VIDE;
	const { glyphe, mot, titre } = TENDANCE[t];
	// `sr-only` : nomme l'info pour les lecteurs d'écran (« Tendance : … »), le glyphe restant décoratif.
	return html`<span class="enc-tendance enc-tendance-${t}" title="${titre}"><span class="enc-tendance-glyphe" aria-hidden="true">${glyphe}</span> <span class="sr-only">Tendance : </span>${mot}</span>`;
}

/* Bloc « Notions par catégorie » entier (composé par `recapHTML`). */
export function notionsHTML(recap: RecapProfil): SafeHtml {
	if (recap.parCategorie.length === 0) return VIDE;
	const legende = joindre(
		ORDRE_NIVEAUX.map((n) => html`<span class="enc-key enc-key-${n}">${MOT_NIVEAU[n]}</span>`),
	);
	const valeur: Record<NiveauNotion, (c: RecapProfil['parCategorie'][number]) => number> = {
		'a-decouvrir': (c) => c.aDecouvrir,
		'non-acquis': (c) => c.nonAcquis,
		'en-cours': (c) => c.enCours,
		acquis: (c) => c.acquis,
	};
	const seg = (n: NiveauNotion, v: number) =>
		v > 0
			? html`<span class="enc-seg-part enc-key-${n}" style="flex:${v}" title="${v} ${MOT_NIVEAU[n]}"></span>`
			: VIDE;
	// Détail d'une catégorie : une ligne par leçon (puce d'état + libellé + suivi
	// « travaillée N fois · dernière fois … · acquise le … » + mot + frise d'états + actions :
	// épingler/retirer + imprimer une fiche + imprimer avec corrigé).
	const now = Date.now();
	const detail = (c: RecapProfil['parCategorie'][number]) =>
		joindre(
			c.lecons.map((l) => {
				const quand = libelleDerniereFois(l.derniereFois, now);
				// Date du cap le PLUS HAUT franchi (#521) : la trajectoire complète est dans la
				// frise, la méta n'en retient que l'événement marquant, sinon la ligne s'allonge
				// sans rien apprendre (avis designer).
				const franchi =
					l.frise?.acquisDepuis != null
						? `acquise ${libelleDerniereFois(l.frise.acquisDepuis, now)}`
						: l.frise?.enCoursDepuis != null
							? `passée en cours ${libelleDerniereFois(l.frise.enCoursDepuis, now)}`
							: '';
				const suivi = [
					l.vues > 0 ? `travaillée ${l.vues} fois` : 'pas encore travaillée',
					l.vues > 0 && quand ? `dernière fois ${quand}` : '',
					franchi,
				]
					.filter(Boolean)
					.join(' · ');
				// Puce d'état OMISE quand la frise est là : sa dernière cellule dit déjà l'état, en
				// plus grand et avec la hauteur comme second indice — trois expressions de la même
				// chose sur une ligne, c'en était une de trop (avis designer). Le MOT, lui, reste :
				// c'est le canal qui ne dépend pas de la couleur (a11y).
				// CETTE PRÉMISSE N'EST VRAIE QUE DEPUIS le correctif « état du jour ». Avant, la dernière cellule portait le
				// plus haut rang ATTEINT, pas l'état du jour : la puce avait donc été retirée sur
				// une affirmation fausse, et une leçon retombée à « à renforcer » n'avait plus aucun
				// canal COULEUR disant son état réel — le mot le disait, mais l'œil balaie les
				// frises, pas les mots. Si la frise redevenait un jour purement historique, cette
				// puce serait à rétablir avec elle : c'est ce qui la remplace, pas ce qu'elle a
				// rendu inutile.
				// Omise, mais sa PLACE est gardée : sans ça le libellé de cette ligne démarre à la
				// marge, ~19 px à gauche de tous ses voisins, et la colonne des titres part en
				// dents de scie. Un vide plutôt qu'une pastille pâle : réserver la place n'est pas
				// réintroduire le signal qu'on vient d'enlever.
				const puce = l.frise
					? html`<span class="enc-detail-puce enc-detail-puce--reserve" aria-hidden="true"></span>`
					: html`<span class="enc-detail-puce enc-key-${l.niveau}" aria-hidden="true"></span>`;
				return html`<li class="enc-detail-item">
          ${puce}
          <span class="enc-detail-main">
            <span class="enc-detail-lab">${l.label}</span>
            <span class="enc-detail-meta">${suivi}</span>
          </span>
          <span class="enc-detail-mot"><span class="sr-only">Niveau : </span>${MOT_NIVEAU[l.niveau]}</span>
          ${tendanceHTML(l.tendance)}
          <span class="enc-actions">
            <button type="button" class="enc-btn-sec${l.epingle ? ' on' : ''}" data-act="epingler" data-lesson="${l.lessonId}">${l.epingle ? 'Retirer' : 'Épingler'}</button>
            ${boutonsImpression(l.lessonId, l.label)}
          </span>
          ${friseNotionHTML(l.frise, now)}
        </li>`;
			}),
		);
	// `data-subject` : cible du dépliage global par matière (cf. deplierHTML / handler).
	// `data-cat` : identifie la catégorie pour retenir son pli à travers un re-rendu.
	// `id` : référencé par l'`aria-controls` du bouton de dépliage, qui sinon ne serait relié
	// à rien programmatiquement.
	const cats = joindre(
		recap.parCategorie.map(
			(
				c,
			) => html`<details class="enc-cat-d" id="${idCategorie(c.categoryId)}" data-subject="${c.subject}" data-cat="${c.categoryId}"${categoriesOuvertes.has(c.categoryId) ? drapeau('open') : ''}>
        <summary class="enc-cat-sum">
          <span class="enc-cat-lab">${c.label}</span>
          <span class="enc-cat-counts">${c.travaillees}/${c.total} travaillée${c.travaillees > 1 ? 's' : ''} · ${c.acquis} acquise${c.acquis > 1 ? 's' : ''}</span>
          <span class="enc-seg" aria-hidden="true">${joindre(ORDRE_NIVEAUX.map((n) => seg(n, valeur[n](c))))}</span>
        </summary>
        <ul class="enc-detail">${detail(c)}</ul>
      </details>`,
		),
	);
	return html`<div class="enc-block">
      <h3 class="enc-h3">${icon('star')} Notions par catégorie</h3>
      ${matieresHTML(recap)}
      <p class="enc-legend">${legende}</p>
      <p class="enc-hint">C'est normal qu'il reste des notions « à découvrir » ou « à renforcer » : ce sont celles qui n'ont pas encore été beaucoup travaillées. Dépliez une catégorie pour voir le détail, épingler une leçon, et suivre son évolution sur les 12 dernières semaines. Dans chaque frise, la dernière colonne montre où en est la leçon aujourd'hui : elle peut redescendre d'un cran quand les dernières réponses ont été plus fragiles. Les leçons épinglées se retrouvent dans l'onglet Programme.</p>
      ${deplierHTML(recap)}
      <div class="enc-cats">${cats}</div>
    </div>`;
}

/* Dépliage GLOBAL par matière : ouvrir d'un coup toutes les catégories de maths ou de
   français, pour balayer les frises de plusieurs leçons sans cliquer catégorie par catégorie.
   Les catégories restent repliées à l'arrivée (on ne surcharge pas l'écran de quelqu'un venu
   voir autre chose) — c'est une commande, pas un réglage persistant. Une seule matière suivie
   → pas de bascule (elle n'aurait rien à trancher). */
function deplierHTML(recap: RecapProfil): SafeHtml {
	if (recap.parMatiere.length < 2) return VIDE;
	// Le libellé visuel n'est que le nom de la matière (la mention « Tout déplier » est portée
	// une fois pour le groupe) : le nom ACCESSIBLE doit donc être complet, et CONTENIR le
	// libellé visible (SC 2.5.3) — sans quoi un bouton annoncé « Mathématiques » ne dit pas ce
	// qu'il fait. Même parade que les boutons « Épingler » de la file à revoir.
	// `aria-controls` liste les catégories pilotées : le lien bouton → contenu n'existe sinon
	// que dans le code du handler.
	const btns = joindre(
		recap.parMatiere.map((m) => {
			const cats = recap.parCategorie.filter((c) => c.subject === m.subject);
			const controls = cats.map((c) => idCategorie(c.categoryId)).join(' ');
			// État à l'instant du rendu : le pli survivant au re-rendu, le bouton doit s'y accorder
			// (et son verbe avec, sinon « Tout déplier » resterait affiché alors que le clic replie).
			const tout = cats.length > 0 && cats.every((c) => categoriesOuvertes.has(c.categoryId));
			return html`<button type="button" class="enc-btn-sec${tout ? ' on' : ''}" data-act="deplier-matiere" data-subject="${m.subject}" aria-controls="${controls}" aria-expanded="${String(tout)}" aria-label="${`${tout ? 'Tout replier' : 'Tout déplier'} : ${m.label}`}" data-matiere="${m.label}">${m.label}</button>`;
		}),
	);
	return html`<div class="enc-deplier">
      <span class="enc-deplier-lab" aria-hidden="true">Tout déplier :</span>
      ${btns}
    </div>`;
}

const idCategorie = (categoryId: string) => `enc-cat-${categoryId}`;

/* `categoryId` des catégories d'une matière, lus dans le DOM rendu (la seule liste disponible
   depuis un handler, qui n'a pas le récap sous la main). */
function catsDeLaMatiere(subject: string | undefined): string[] {
	if (!subject) return [];
	return [
		...(container()?.querySelectorAll<HTMLElement>(
			`.enc-cat-d[data-subject="${CSS.escape(subject)}"]`,
		) ?? []),
	]
		.map((d) => d.dataset.cat ?? '')
		.filter(Boolean);
}

/* Remet un bouton de dépliage en accord avec l'état RÉEL de ses catégories, SANS re-rendre.
   Indispensable parce qu'un `<details>` s'ouvre aussi par un clic direct sur son `<summary>`,
   sans passer par aucun handler : sans cette resynchronisation, le bouton resterait annoncé
   « replié » alors que l'adulte vient d'ouvrir deux catégories à la main (SC 4.1.2 — l'état
   exposé doit refléter l'état réel). Le verbe du nom accessible suit : quand tout est ouvert,
   le clic va REPLIER. Pas de re-rendu ici, il serait brutal à chaque pli manuel. */
function syncDeplier(subject: string): void {
	const btn = container()?.querySelector<HTMLElement>(
		`[data-act="deplier-matiere"][data-subject="${CSS.escape(subject)}"]`,
	);
	if (!btn) return;
	const cats = catsDeLaMatiere(subject);
	const tout = cats.length > 0 && cats.every((id) => categoriesOuvertes.has(id));
	btn.setAttribute('aria-expanded', String(tout));
	btn.classList.toggle('on', tout);
	btn.setAttribute(
		'aria-label',
		`${tout ? 'Tout replier' : 'Tout déplier'} : ${btn.dataset.matiere ?? ''}`,
	);
}

/* Vue « couverture par matière » : combien de leçons ont déjà été abordées (et acquises)
   sur le total du niveau, matière par matière. Aide à ÉQUILIBRER l'entraînement entre
   matières. Factuel (dénombrement), sans note ni pourcentage.
   Depuis #521, la ligne porte aussi le nombre de leçons ayant franchi un cap récemment : la
   frise d'états ayant rejoint les lignes de leçon, c'est la seule trace de « ça bouge » qui
   reste visible SANS déplier une catégorie. Un total, pas un palmarès : aucune leçon n'est
   nommée ni mise en avant ici. */
function matieresHTML(recap: RecapProfil): SafeHtml {
	if (recap.parMatiere.length === 0) return VIDE;
	const items = joindre(
		recap.parMatiere.map((m) => {
			const compteurs = [
				`${m.travaillees}/${m.total} travaillée${m.travaillees > 1 ? 's' : ''}`,
				`${m.acquis} acquise${m.acquis > 1 ? 's' : ''}`,
				m.changementsRecents > 0
					? `${m.changementsRecents} changement${m.changementsRecents > 1 ? 's' : ''} récent${m.changementsRecents > 1 ? 's' : ''}`
					: '',
			].filter(Boolean);
			return html`<li class="enc-mat-item">
        <span class="enc-mat-lab">${m.label}</span>
        <span class="enc-mat-counts">${compteurs.join(' · ')}</span>
      </li>`;
		}),
	);
	return html`<h4 class="enc-sub-lab">Couverture par matière</h4>
      <ul class="enc-mat-list">${items}</ul>
      ${etoilesNiveauHTML(recap)}`;
}

/* Étoiles cumulées PAR CLASSE (#556), sous la couverture par matière. Ne s'affiche qu'à
   partir de DEUX classes : sur une seule, la ligne répéterait le total sans rien apprendre.
   Elle existe pour une question précise — « quelle part du travail se fait hors de la classe
   suivie ? » —, à laquelle la couverture par matière, scopée à cette classe, ne peut pas
   répondre. Cumul DEPUIS TOUJOURS, comme le « trésor » de l'enfant : il ne baisse jamais,
   même après un changement de classe. Côté enfant, rien de tout ceci n'apparaît : le total
   reste unique et sans détail (avis gamification, #225). */
function etoilesNiveauHTML(recap: RecapProfil): SafeHtml {
	if (recap.etoilesParNiveau.length < 2) return VIDE;
	const parts = recap.etoilesParNiveau.map((e) => `${e.etoiles} en ${LEVEL_LABEL[e.niveau]}`);
	return html`<p class="enc-hint">Étoiles gagnées depuis toujours : ${enumererFr(parts)}.</p>`;
}

/* Mot de chaque cellule de frise, pour le libellé accessible. Il s'agit d'une PHRASE, pas
   d'une étiquette : le sujet implicite est la leçon, donc « acquise » s'y accorde, là où
   `MOT_NIVEAU.acquis` reste invariable pour ses usages en badge et en légende (avis langue).
   'inconnu' n'est pas un rang de l'échelle mais l'absence de donnée, d'où « statut inconnu »
   (choix du mainteneur, à l'usage) : ni « pas encore suivie », qui se confondait à l'oreille
   avec le « pas encore travaillée » de la méta et dit tout autre chose, ni « avant le suivi »,
   qui nommait la CAUSE de l'ignorance quand le lecteur veut d'abord savoir ce que la cellule
   vaut. C'est aussi le seul canal qui distingue encore ces semaines de « à découvrir », les
   deux partageant l'emplacement le plus bas de la frise (cf. encadrant.scss). */
const MOT_CELLULE: Record<CelluleFrise, string> = {
	inconnu: 'statut inconnu',
	'a-decouvrir': MOT_NIVEAU['a-decouvrir'],
	'non-acquis': MOT_NIVEAU['non-acquis'],
	'en-cours': MOT_NIVEAU['en-cours'],
	acquis: 'acquise',
};
/* Les segments SUIVANTS du récit sont des événements DATÉS quand une date existe : ils prennent
   alors la même tournure que la méta visible de la ligne (« passée en cours hier », « acquise le
   3 août »), sinon le récit dirait « puis en cours hier ». Seuls ces deux paliers sont datés par
   le journal ; « à renforcer » ouvre un segment sans date, et c'est voulu — il suit soit « à
   découvrir » (le début du travail, date affichée nulle part ailleurs sur la ligne), soit
   « statut inconnu », dont la frontière est l'entrée dans le suivi et non un progrès de
   l'enfant : la dater laisserait croire que quelque chose s'est passé ce jour-là.
   C'est donc le premier segment non initial et non daté du récit, ce que la relecture de langue
   signale comme lisible en lacune. Un « puis ENFIN acquise le 30 juillet » sur les récits à trois
   segments a été proposé pour recadrer les segments muets en cheminement ; écarté, parce que
   « enfin » félicite, et que cet écran s'abstient partout de juger la trajectoire de l'enfant. */
const EVENEMENT_CELLULE: Partial<Record<CelluleFrise, string>> = {
	'en-cours': 'passée en cours',
	acquis: 'acquise',
};

/* Frise d'états d'UNE leçon (#521), sur sa propre ligne pleine largeur sous le libellé :
   une cellule par semaine, couleur = état atteint, HAUTEUR = rang de l'état (second indice,
   la couleur ne portant jamais seule le sens). Remplace le compteur hebdomadaire par matière
   de #397, qui ne disait ni où l'enfant progresse ni où il stagne.
   Colonnes ÉLASTIQUES (`flex: 1`, barre plafonnée) et non à pas fixe : la frise s'adapte à la
   largeur disponible sans jamais déborder, y compris sur un téléphone étroit.
   Un seul `role="img"` pour toute la rangée, portant le récit des changements : douze cellules
   annoncées une à une seraient interminables, et rien n'y est focalisable. La méta de la ligne
   dit déjà, en texte visible, la date du cap le plus haut.
   Rien à tracer (leçon jamais travaillée) → rien du tout, pas de rangée vide ni de mention
   d'absence : ça ferait du bruit sur les lignes jamais travaillées, qui sont la majorité. */
function friseNotionHTML(f: FriseNotion | null, now: number): SafeHtml {
	if (!f) return VIDE;
	const n = f.semaines.length;
	// Récit par CHANGEMENT d'état, pas par semaine. Le premier segment n'est pas daté : c'est
	// l'état en début de fenêtre, dont le franchissement peut être bien plus ancien. Les
	// suivants sont datés par le franchissement LUI-MÊME (`libelleDerniereFois`, le formateur
	// de la méta visible), et non par le lundi de leur cellule : sinon un cap franchi un
	// mercredi produisait deux dates différentes pour le même fait, la méta annonçant le jour
	// exact et la frise le lundi de la semaine (avis a11y). Un segment « à renforcer » reste
	// volontairement muet (cf. EVENEMENT_CELLULE) : sa frontière n'est pas un cap franchi.
	const dateEtat = (etat: CelluleFrise) =>
		etat === 'acquis' ? f.acquisDepuis : etat === 'en-cours' ? f.enCoursDepuis : null;
	const segments = f.semaines
		.map((etat, i) => ({ etat, i }))
		.filter((s, i, tous) => i === 0 || s.etat !== tous[i - 1].etat)
		.map((s, k) => {
			const quand = k === 0 ? '' : libelleDerniereFois(dateEtat(s.etat), now);
			return quand
				? `${EVENEMENT_CELLULE[s.etat] ?? MOT_CELLULE[s.etat]} ${quand}`
				: MOT_CELLULE[s.etat];
		});
	const aria = `Évolution sur les ${n} dernières semaines : ${segments.join(', puis ')}.`;
	const cells = joindre(
		f.semaines.map((etat, i) => {
			// `enc-frise-courante` et non `en-cours` : cette dernière est déjà le nom de l'ÉTAT
			// « en cours », et une cellule peut porter les deux sens à la fois.
			const derniere = i === n - 1;
			return html`<span class="enc-frise-cell enc-frise-${etat}${derniere ? ' enc-frise-courante' : ''}"></span>`;
		}),
	);
	return html`<span class="enc-frise" role="img" aria-label="${aria}" title="${aria}">
      <span class="enc-frise-cells" aria-hidden="true">${cells}</span>
    </span>`;
}

/* ---------- Handlers de la section (aiguillés par `progressionClick`) ---------- */

/* Actions propres aux notions. Ne traite QUE `deplier-matiere` : `epingler` et `imprimer`,
   présents sur les lignes de leçon, sont partagés avec « À revoir ensemble » et restent
   chez l'orchestrateur (un second handler pour la même action y renverrait le focus au
   premier des deux boutons trouvés dans la page). */
export function notionsClick(act: string, el: HTMLElement): boolean {
	if (act !== 'deplier-matiere') return false;
	const subject = el.dataset.subject;
	const cats = catsDeLaMatiere(subject);
	if (!subject || !cats.length) return true;
	// Bascule : on referme seulement si TOUT est déjà ouvert, sinon on ouvre le reste.
	const ouvrir = !cats.every((id) => categoriesOuvertes.has(id));
	for (const id of cats) {
		if (ouvrir) categoriesOuvertes.add(id);
		else categoriesOuvertes.delete(id);
	}
	renderEspace();
	// Le re-rendu recrée le DOM → on rend le focus au bouton, comme les autres actions.
	container()
		?.querySelector<HTMLElement>(
			`[data-act="deplier-matiere"][data-subject="${CSS.escape(subject)}"]`,
		)
		?.focus({ preventScroll: true });
	return true;
}

/* Ouverture/fermeture d'un `<details>` de catégorie (événement natif `toggle`, capté par
   l'orchestrateur) : un clic sur un `<summary>` ne passe par AUCUN handler. On y retient le
   pli — pour qu'il survive au prochain re-rendu — puis on remet le bouton de dépliage global
   de cette matière en accord avec l'état réel. */
export function notionsToggle(el: HTMLElement): void {
	const d = el.closest?.<HTMLDetailsElement>('.enc-cat-d');
	const cat = d?.dataset.cat;
	if (!d || !cat) return;
	if (d.open) categoriesOuvertes.add(cat);
	else categoriesOuvertes.delete(cat);
	if (d.dataset.subject) syncDeplier(d.dataset.subject);
}
