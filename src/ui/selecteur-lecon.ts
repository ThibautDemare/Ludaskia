/* ============================================================
   Espace encadrant (#556) — SÉLECTEUR de leçon, tous niveaux.
   ------------------------------------------------------------
   Composant partagé par les DEUX chemins où l'adulte désigne une leçon : la cible d'une
   activité du « programme du jour » (`encadrant-seance.ts`) et l'épinglage « à revoir »
   (`encadrant-progression.ts`). Un seul composant, deux actions de ligne : c'est la seule
   différence entre les deux usages.

   Il remplace le `<select>` filtré au niveau du profil, qui rendait une leçon d'une autre
   classe littéralement inatteignable. Ici, le niveau est un FILTRE (barre de jetons), pas
   une frontière : l'arbre couvre tout le catalogue.

   Parti pris de rendu :
   - arbre `matière → catégorie` en `<details>` natifs, REPLIÉ par défaut. Le chrome est
     celui de « Notions par catégorie » (`.enc-cat-d` / `.enc-cat-sum`) : même geste, même
     clavier natif, aucun pattern ARIA maison à inventer ;
   - l'état de vue (jeton actif, recherche, plis) vit en ÉTAT DE MODULE et non dans le DOM :
     l'espace encadrant recrée tout son DOM à la moindre action, il serait sinon remis à plat
     à chaque clic (même parti pris que `categoriesOuvertes` ou le volet « Mots ») ;
   - la recherche filtre À LA FRAPPE en ne remplaçant QUE le corps de l'arbre : un re-rendu
     complet de l'espace détruirait le champ de saisie, donc le focus et le curseur, à chaque
     lettre. Elle DÉPLIE d'office ce qui reste (une recherche dont les résultats sont cachés
     dans des groupes repliés ne servirait à rien).

   La logique — arbre, filtre, recherche, jetons — est pure et vit dans
   `core/catalogue-arbre.ts` ; ici, le rendu, l'état de vue et les handlers.
   ============================================================ */
import { escapeHTML } from '../core/utils';
import {
	FILTRE_DEFAUT,
	arbreCatalogue,
	compterLecons,
	jetonsNiveau,
	type FiltreNiveau,
	type LeconArbre,
	type MatiereArbre,
} from '../core/catalogue-arbre';
import type { SchoolLevel } from '../core/catalog';
import { LEVEL_ORDER } from '../core/levels';
import type { Profile } from '../core/profiles';
import { onChangementProfilConsulte, container, renderEspace } from './encadrant-commun';
import { segmentHTML } from './segment';

/* ---------- État de vue, par instance de sélecteur (module) ---------- */
interface EtatSelecteur {
	filtre: FiltreNiveau;
	recherche: string;
	ouverts: Set<string>; // clés de pli (« m:maths », « c:maths-numeration »)
}
const etats = new Map<string, EtatSelecteur>();

/* Délai avant l'annonce du résumé aux aides techniques : réécrire une région live à chaque
   lettre fait qu'une synthèse vocale s'interrompt elle-même (même constat que la banque de
   mots, #496/#527). Le texte est RECALCULÉ en retombant, jamais transporté depuis l'appel. */
const DELAI_ANNONCE = 350;
let annonceTimer: number | undefined;

function etat(id: string): EtatSelecteur {
	let e = etats.get(id);
	if (!e) {
		e = { filtre: FILTRE_DEFAUT, recherche: '', ouverts: new Set() };
		etats.set(id, e);
	}
	return e;
}

/** Oublie l'état d'un sélecteur (à sa fermeture) : le rouvrir doit repartir d'une vue
    neutre, et non d'une recherche posée trois jours plus tôt sur une autre leçon. */
export function oublierSelecteur(id: string): void {
	etats.delete(id);
	fournisseurs.delete(id);
	window.clearTimeout(annonceTimer);
}

/* Changer de profil consulté remet TOUS les sélecteurs à plat : un filtre « CE2 » hérité
   ferait passer une vue partielle du catalogue pour le catalogue entier du nouvel enfant,
   et « Sa classe » ne désigne plus la même classe. Enregistré une fois pour toutes plutôt
   qu'appelé sur chaque site de `setConsulteUuid` (cf. `onChangementProfilConsulte`). */
onChangementProfilConsulte(() => {
	etats.clear();
	window.clearTimeout(annonceTimer);
});

/* ---------- Contrat de rendu ---------- */
/** Ce que fait le bouton au bout d'une ligne. `act` est aiguillé par le CONSOMMATEUR
    (le sélecteur ne sait pas ce qu'on fait de la leçon choisie), `etat` lui donne son
    libellé et son état pressé — « Choisir » ici, « Épingler / Retirer » là. */
export interface ActionLigne {
	act: string;
	extra?: Record<string, string>; // data-* communs (def, etape…)
	etat: (lecon: LeconArbre) => { label: string; on: boolean };
}

export interface OptionsSelecteur {
	/** Identifiant de l'instance : porte l'état de vue et rend les ids DOM uniques. */
	id: string;
	consulte: Profile;
	action: ActionLigne;
}

function cleMatiere(subject: string): string {
	return 'm:' + subject;
}
function cleCategorie(categoryId: string): string {
	return 'c:' + categoryId;
}

/* Un groupe est déplié s'il a été ouvert à la main OU si une recherche est en cours : dans
   ce dernier cas l'arbre ne contient plus que des résultats, les replier les cacherait. */
function ouvert(e: EtatSelecteur, cle: string): boolean {
	return e.recherche.trim() !== '' || e.ouverts.has(cle);
}

function compteLabel(n: number): string {
	return n > 1 ? `${n} leçons` : `${n} leçon`;
}

function ligneHTML(lecon: LeconArbre, action: ActionLigne): string {
	const { label, on } = action.etat(lecon);
	const extra = Object.entries(action.extra ?? {})
		.map(([k, v]) => ` data-${k}="${escapeHTML(v)}"`)
		.join('');
	// Le nom accessible reprend le libellé VISIBLE de la leçon (SC 2.5.3) : « Choisir » seul,
	// répété sur des dizaines de lignes, ne dirait rien en navigation par contrôles.
	return `<li class="enc-sel-item">
      <span class="enc-sel-lab">${escapeHTML(lecon.label)}</span>
      <button type="button" class="enc-btn-sec${on ? ' on' : ''}" data-act="${escapeHTML(action.act)}" data-lesson="${escapeHTML(lecon.id)}"${extra} aria-label="${escapeHTML(`${label} « ${lecon.label} »`)}">${escapeHTML(label)}</button>
    </li>`;
}

function categorieHTML(
	id: string,
	e: EtatSelecteur,
	cat: MatiereArbre['categories'][number],
	action: ActionLigne,
): string {
	const cle = cleCategorie(cat.categoryId);
	return `<details class="enc-cat-d enc-sel-d enc-sel-cat" data-sel="${escapeHTML(id)}" data-selcle="${escapeHTML(cle)}"${ouvert(e, cle) ? ' open' : ''}>
      <summary class="enc-cat-sum">
        <span class="enc-cat-lab">${escapeHTML(cat.label)}</span>
        <span class="enc-cat-counts">${compteLabel(cat.lecons.length)}</span>
      </summary>
      <ul class="enc-sel-list">${cat.lecons.map((l) => ligneHTML(l, action)).join('')}</ul>
    </details>`;
}

function matiereHTML(id: string, e: EtatSelecteur, m: MatiereArbre, action: ActionLigne): string {
	const cle = cleMatiere(m.subject);
	return `<details class="enc-cat-d enc-sel-d enc-sel-mat" data-sel="${escapeHTML(id)}" data-selcle="${escapeHTML(cle)}"${ouvert(e, cle) ? ' open' : ''}>
      <summary class="enc-cat-sum">
        <span class="enc-cat-lab">${escapeHTML(m.label)}</span>
        <span class="enc-cat-counts">${compteLabel(m.total)}</span>
      </summary>
      <div class="enc-sel-cats">${m.categories.map((c) => categorieHTML(id, e, c, action)).join('')}</div>
    </details>`;
}

/* L'arbre courant d'un sélecteur : filtre et recherche viennent de son état de vue. Un seul
   point de calcul pour le corps ET le résumé — les recalculer séparément les laisserait
   diverger le jour où l'un des deux oublierait un critère. */
function arbreCourant(id: string, consulte: Profile): MatiereArbre[] {
	const e = etat(id);
	return arbreCatalogue(consulte, { filtre: e.filtre, recherche: e.recherche });
}

/* Corps de l'arbre seul : c'est le nœud que la recherche remplace en place. */
function corpsHTML(id: string, arbre: readonly MatiereArbre[], action: ActionLigne): string {
	const e = etat(id);
	return arbre.map((m) => matiereHTML(id, e, m, action)).join('');
}

function texteResume(id: string, arbre: readonly MatiereArbre[]): string {
	const n = compterLecons(arbre);
	if (n === 0)
		return etat(id).recherche.trim() === ''
			? 'Aucune leçon dans cette classe.'
			: 'Aucune leçon ne correspond à cette recherche.';
	return `${compteLabel(n)} à choisir.`;
}

/** Le sélecteur complet : barre de jetons de niveau, recherche, puis l'arbre replié. */
export function selecteurLeconHTML(o: OptionsSelecteur): string {
	const { id, consulte, action } = o;
	const e = etat(id);
	const arbre = arbreCourant(id, consulte);
	const jetons = segmentHTML({
		act: 'sel-niveau',
		valAttr: 'niveau',
		label: 'Classe des leçons proposées',
		active: e.filtre,
		extra: { sel: id },
		wrap: true,
		options: jetonsNiveau(consulte).map((j) => ({ val: j.val, label: j.label })),
	});
	return `<div class="enc-sel" data-sel="${escapeHTML(id)}">
      <div class="enc-sel-outils">
        ${jetons}
        <label class="enc-sel-rech">
          <span class="sr-only">Rechercher une leçon</span>
          <input type="search" class="enc-input" id="sel-rech-${escapeHTML(id)}" data-act="sel-recherche" data-sel="${escapeHTML(id)}" placeholder="Rechercher une leçon…" value="${escapeHTML(e.recherche)}" autocomplete="off" />
        </label>
      </div>
      <p class="enc-hint enc-sel-resume" id="sel-resume-${escapeHTML(id)}" role="status" aria-live="polite">${escapeHTML(texteResume(id, arbre))}</p>
      <div class="enc-sel-corps" id="sel-corps-${escapeHTML(id)}">${corpsHTML(id, arbre, action)}</div>
    </div>`;
}

/* ---------- Handlers délégués (aiguillés par l'orchestrateur) ---------- */
/* Le sélecteur ne connaît pas ses consommateurs : ceux-ci lui redonnent, à chaque
   rafraîchissement partiel, de quoi re-rendre son corps (profil + action de ligne). */
type Fournisseur = () => { consulte: Profile; action: ActionLigne } | null;
const fournisseurs = new Map<string, Fournisseur>();

/** Déclare comment re-rendre le corps d'un sélecteur à la frappe. Appelé par le
    consommateur à CHAQUE rendu : l'action de ligne capture l'état courant (étape visée,
    file épinglée), qui change d'un rendu à l'autre. */
export function enregistrerSelecteur(id: string, f: Fournisseur): void {
	fournisseurs.set(id, f);
}

function rafraichirCorps(id: string): void {
	const f = fournisseurs.get(id)?.();
	const corps = container()?.querySelector(`#sel-corps-${CSS.escape(id)}`);
	if (!f || !corps) return;
	corps.innerHTML = corpsHTML(id, arbreCourant(id, f.consulte), f.action);
	annoncer(id);
}

/* L'annonce est DIFFÉRÉE, contrairement au filtrage visuel (cf. DELAI_ANNONCE). On écrit
   même quand le texte est déjà le bon : une région `role="status"` qui naît remplie n'est
   annoncée de façon fiable par aucun moteur, cette mutation tardive est la seule dont
   l'aide technique dispose (même constat que `encadrant-banque.ts`). */
function annoncer(id: string): void {
	window.clearTimeout(annonceTimer);
	annonceTimer = window.setTimeout(() => {
		const p = container()?.querySelector(`#sel-resume-${CSS.escape(id)}`);
		const f = fournisseurs.get(id)?.();
		if (p && f) p.textContent = texteResume(id, arbreCourant(id, f.consulte));
	}, DELAI_ANNONCE);
}

/** Frappe dans la recherche (`input`, pas `change` : `change` n'arrive qu'au blur). */
export function selecteurInput(act: string, el: HTMLElement): boolean {
	if (act !== 'sel-recherche') return false;
	const id = el.dataset.sel;
	if (!id) return true;
	etat(id).recherche = (el as HTMLInputElement).value;
	rafraichirCorps(id);
	return true;
}

export function selecteurClick(act: string, el: HTMLElement): boolean {
	if (act !== 'sel-niveau') return false;
	const id = el.dataset.sel;
	const val = el.dataset.niveau;
	if (!id || !val) return true;
	const e = etat(id);
	e.filtre = LEVEL_ORDER.includes(val as SchoolLevel) ? (val as SchoolLevel) : 'sa-classe';
	// Changer de classe change ce que l'arbre contient : les plis d'avant ne désignent plus
	// les mêmes groupes, et une catégorie vidée par le filtre resterait ouverte pour rien.
	e.ouverts.clear();
	renderEspace();
	// Le re-rendu recrée le DOM : on rend le focus au jeton coché (contrat radiogroup),
	// sans quoi la navigation clavier repartirait du haut de la page.
	container()
		?.querySelector<HTMLElement>(`[data-act="sel-niveau"][data-sel="${CSS.escape(id)}"].on`)
		?.focus({ preventScroll: true });
	return true;
}

/** Ouverture/fermeture d'un groupe (`toggle` natif, capté par l'orchestrateur). Renvoie
    `true` si l'élément appartient à un sélecteur, pour que la progression n'y touche pas. */
export function selecteurToggle(el: HTMLElement): boolean {
	const d = el.closest?.<HTMLDetailsElement>('.enc-sel-d');
	const id = d?.dataset.sel;
	const cle = d?.dataset.selcle;
	if (!d || !id || !cle) return false;
	if (d.open) etat(id).ouverts.add(cle);
	else etat(id).ouverts.delete(cle);
	return true;
}
