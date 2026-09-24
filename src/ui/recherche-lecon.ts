/* ============================================================
   Recherche de leçon côté enfant (#718) — rendu, état de vue et handlers.
   ------------------------------------------------------------
   Vit sur l'écran des matières (`renderSubjects`, catalog-nav.ts) : un champ collé sous
   la barre, une région live pour le compte, un corps de résultats. La logique (quoi
   trouver, dans quel ordre) est pure et vit dans `core/recherche-lecon.ts` ; ici, le DOM.

   Partis pris :
   - le TEXTE TAPÉ vit en état de module, pas dans le DOM : l'écran des matières est
     re-rendu à chaque passage de route (retour d'une leçon), et l'enfant doit retrouver
     sa recherche pour essayer le résultat suivant (critère 12). Il est remis à zéro par
     la carte d'accueil « Une leçon à la fois » (`startMatieres`) et quand le profil actif
     change, jamais par un retour arrière. Aucune clé de stockage (critère 19) ;
   - à la frappe, SEUL le corps des résultats est re-rendu : recréer le champ lui ferait
     perdre focus et curseur à chaque lettre (critère 13) ;
   - la région live est mutée avec un DÉLAI : réécrite à chaque lettre, une synthèse
     vocale s'interromprait elle-même (même constat que le sélecteur adulte, #556) ;
   - sous `RECHERCHE_MIN` caractères, l'écran ne bouge pas (critère 2) ; sans résultat,
     un constat sobre, et les cartes de matière restent là (critère 11) ; avec des
     résultats, les cartes s'effacent pour ne pas mêler deux navigations sur un écran.
   ============================================================ */
import { CATEGORIES, ORTHO_CATEGORY_ID, SUBJECTS, getAllLessons } from '../core/catalog';
import { html, joindre, VIDE, type SafeHtml } from '../core/html';
import { niveauActifMatiere } from '../core/niveau-actif';
import { listOrthoLecons } from '../core/orthographe/lessons';
import { loadOrtho } from '../core/orthographe/store';
import { activeProfile } from '../core/profiles';
import {
	rechercherLecons,
	type DicteeRecherche,
	type GroupeLecons,
	type ResultatCategorie,
	type ResultatsRecherche,
	type SourceRecherche,
} from '../core/recherche-lecon';
import { catTint } from './cat-visuals';
import { icon } from './icon';
import { goCategorie, startLecon, startOrthoLecon } from './navigation';

/* Délai avant l'annonce du compte aux aides techniques (cf. en-tête). */
const DELAI_ANNONCE = 350;

/* ---------- État de vue (module) ---------- */
let requete = '';
let profilVu: string | undefined;
let annonceTimer: number | undefined;

/** Oublie le texte tapé. Appelé par la carte d'accueil « Une leçon à la fois » : arriver
    depuis l'accueil doit montrer les deux matières, pas une recherche d'il y a dix minutes. */
export function reinitialiserRecherche(): void {
	requete = '';
	window.clearTimeout(annonceTimer);
}

/* Changer de profil actif remet la recherche à plat : le niveau par matière, donc les
   résultats, ne sont plus les mêmes, et l'ancien texte n'appartenait pas à cet enfant. */
function surveillerProfil(): void {
	const uuid = activeProfile()?.uuid;
	if (uuid !== profilVu) {
		profilVu = uuid;
		reinitialiserRecherche();
	}
}

function sourceCourante(): SourceRecherche {
	return {
		lessons: getAllLessons(),
		niveau: niveauActifMatiere,
		// Dictées visibles au niveau actif du français (filtrage CUMULATIF, #243), comme
		// l'écran Orthographe.
		dictees: listOrthoLecons(loadOrtho(), niveauActifMatiere('francais')).map((l) => ({
			id: l.id,
			label: l.label,
		})),
	};
}

function resultats(): ResultatsRecherche {
	return rechercherLecons(requete, sourceCourante());
}

/* ---------- Rendu ---------- */
function categorieHTML(c: ResultatCategorie): SafeHtml {
	// Même pastille (icône + teinte cyclée) que la carte de catégorie de l'écran matière :
	// l'enfant reconnaît la catégorie qu'il a déjà vue, sans nouveau code visuel.
	const cats = CATEGORIES.filter((x) => x.subject === c.subject);
	const i = Math.max(
		0,
		cats.findIndex((x) => x.id === c.categoryId),
	);
	return html`<button type="button" class="rech-categorie" data-category="${c.categoryId}">
      <span class="cat-ico" style="background:${catTint(i)}">${icon(cats[i]?.icon ?? 'book-open')}</span>
      <span class="rech-cat-texte"><span class="rech-cat-titre">${c.label}</span><span class="rech-cat-sub">${c.subjectLabel} · toutes les leçons</span></span>
    </button>`;
}

function leconHTML(l: { id: string; label: string }): SafeHtml {
	return html`<button type="button" class="rech-lecon" data-id="${l.id}">${icon('book-open')}<span>${l.label}</span></button>`;
}

function groupeHTML(g: GroupeLecons): SafeHtml {
	// `h2` : l'écran des matières n'a qu'un `h1`, les groupes en sont les sous-titres directs.
	return html`<section class="rech-groupe">
      <h2 class="rech-groupe-titre">${g.subjectLabel} · ${g.label}</h2>
      <div class="rech-liste">${joindre(g.lecons.map(leconHTML))}</div>
    </section>`;
}

function dicteesHTML(dictees: readonly DicteeRecherche[]): SafeHtml {
	if (!dictees.length) return VIDE;
	const fr = SUBJECTS.find((s) => s.id === 'francais')?.label ?? 'Français';
	const ortho = CATEGORIES.find((c) => c.id === ORTHO_CATEGORY_ID)?.label ?? 'Orthographe';
	return html`<section class="rech-groupe rech-dictees">
      <h2 class="rech-groupe-titre">${fr} · ${ortho} · Dictées de mots</h2>
      <div class="rech-liste">
        ${joindre(
					dictees.map(
						(d) =>
							html`<button type="button" class="rech-dictee" data-ortho="${d.id}">${icon('cards')}<span>${d.label}</span></button>`,
					),
				)}
      </div>
    </section>`;
}

function corpsHTML(res: ResultatsRecherche): SafeHtml {
	if (!res.active) return VIDE;
	if (res.total === 0) {
		return html`<p class="rech-vide">Aucune leçon ne s'appelle comme ça. Essaie un autre mot, ou choisis une matière juste en dessous.</p>`;
	}
	const categories = res.categories.length
		? html`<div class="rech-categories">${joindre(res.categories.map(categorieHTML))}</div>`
		: VIDE;
	return html`${categories}${joindre(res.groupes.map(groupeHTML))}${dicteesHTML(res.dictees)}`;
}

function texteResume(res: ResultatsRecherche): string {
	if (!res.active) return '';
	// Toujours un nombre, y compris « 0 » : un lecteur d'écran entend le même gabarit à
	// chaque frappe, et le message détaillé du corps (`.rech-vide`) dit le reste.
	return res.total > 1 ? `${res.total} résultats` : `${res.total} résultat`;
}

/** Le bloc de recherche (champ + résumé + corps), à placer AVANT les cartes de matière.
    Le corps et la visibilité des cartes sont posés par `brancherRecherche`, juste après. */
export function rechercheHTML(): SafeHtml {
	surveillerProfil();
	// Nom accessible = texte visible du placeholder (SC 2.5.3, « Label in Name ») : un enfant
	// en commande vocale dit ce qu'il lit, et ça doit suffire à atteindre le champ.
	return html`<div class="recherche-lecon" role="search">
      <label class="sr-only" for="rechercheLecon">Cherche une leçon</label>
      <div class="recherche-champ">
        ${icon('magnifying-glass')}
        <input type="search" id="rechercheLecon" placeholder="Cherche une leçon…" value="${requete}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" />
      </div>
      <p id="rechercheResume" class="recherche-resume" role="status" aria-live="polite"></p>
    </div>
    <div id="rechercheResultats" class="recherche-resultats"></div>`;
}

/* ---------- Handlers ---------- */
/** Branche le bloc rendu dans `root` (l'écran des matières) : état initial, frappe,
    clics sur les résultats. `root` doit contenir le bloc ET les `.nav-cards`. */
export function brancherRecherche(root: HTMLElement): void {
	const champ = root.querySelector<HTMLInputElement>('#rechercheLecon');
	const corps = root.querySelector<HTMLElement>('#rechercheResultats');
	const resume = root.querySelector<HTMLElement>('#rechercheResume');
	const cartes = root.querySelector<HTMLElement>('.nav-cards');
	if (!champ || !corps || !resume || !cartes) return;

	const appliquer = (res: ResultatsRecherche, differer: boolean): void => {
		corps.innerHTML = corpsHTML(res).balisage;
		corps.hidden = !res.active;
		// Les cartes s'effacent seulement quand il y a quelque chose à leur place ; sans
		// résultat, elles restent le chemin de repli (critère 11).
		cartes.hidden = res.active && res.total > 0;
		window.clearTimeout(annonceTimer);
		if (differer) {
			annonceTimer = window.setTimeout(() => {
				resume.textContent = texteResume(res);
			}, DELAI_ANNONCE);
		} else {
			resume.textContent = texteResume(res);
		}
	};

	// Retour sur l'écran avec une recherche en cours (critère 12) : tout est déjà là.
	appliquer(resultats(), false);

	// `input`, pas `change` : `change` n'arrive qu'au blur.
	champ.addEventListener('input', () => {
		requete = champ.value;
		appliquer(resultats(), true);
	});

	// Délégation : les résultats sont re-rendus à chaque lettre, un écouteur par bouton
	// se perdrait ; le conteneur, lui, survit.
	corps.addEventListener('click', (e: Event) => {
		const cible = e.target as HTMLElement;
		const lecon = cible.closest<HTMLElement>('.rech-lecon');
		if (lecon?.dataset.id) {
			startLecon(lecon.dataset.id);
			return;
		}
		const categorie = cible.closest<HTMLElement>('.rech-categorie');
		if (categorie?.dataset.category) {
			goCategorie(categorie.dataset.category);
			return;
		}
		const dictee = cible.closest<HTMLElement>('.rech-dictee');
		if (dictee?.dataset.ortho) startOrthoLecon(dictee.dataset.ortho);
	});
}
