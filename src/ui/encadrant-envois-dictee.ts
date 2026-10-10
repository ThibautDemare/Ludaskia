/* ============================================================
   Espace encadrant — onglet « Envois » (#734) : composer une DICTÉE à envoyer.
   ------------------------------------------------------------
   Extrait de `encadrant-envois.ts` (décision 13 de la doc : le fichier passait 800 lignes).
   Deux sources (critère 1) : une dictée prédéfinie, qui a son niveau, ou une liste
   personnalisée du profil consulté, qui n'en a pas. La liste entière part, dans son ordre :
   une dictée n'a rien à tirer.

   Un mot de liste que le lien refuse (« 1er », « M. ») est écarté et NOMMÉ avec le lien
   créé (`ecartes`) : le parent tape ce qu'il veut dans ses listes, le lien n'accepte que
   des lettres, l'apostrophe, le trait d'union et l'espace (critère 39).

   État de vue en module, comme le reste de l'onglet : l'espace recrée tout son DOM à
   chaque action.
   ============================================================ */
import { html, joindre, drapeau, VIDE, type SafeHtml } from '../core/html';
import { niveauProfilMatiere } from '../core/encadrant-stats';
import { LEVEL_LABEL, LEVEL_ORDER } from '../core/levels';
import { listOrthoLecons, type LeconOrthoRef } from '../core/orthographe/lessons';
import { loadOrthoFor } from '../core/orthographe/store';
import { composerDictee, libelleParDefaut, type Composition } from '../core/partage/composition';
import {
	dicteePredefinie,
	dicteesPredefinies,
	motsDicteeListe,
	type DicteePredefinie,
} from '../core/partage/dictees';
import type { SchoolLevel } from '../core/catalog';
import type { Profile } from '../core/profiles';
import { onChangementProfilConsulte } from './encadrant-commun';
import { segmentHTML } from './segment';
import { elisionDe } from '../core/utils';

type SourceDictee = 'predefinie' | 'liste';

interface EtatDictee {
	source: SourceDictee;
	/* Dictée ou liste retenue ; `null` : celle qu'on présélectionne. */
	predefinieId: string | null;
	listeId: string | null;
}

const etat: EtatDictee = { source: 'predefinie', predefinieId: null, listeId: null };

/* Les listes sont celles du profil consulté : en changer invalide la liste retenue. */
onChangementProfilConsulte(() => {
	etat.listeId = null;
});

/** Le choix dépend-il du profil consulté (une de ses listes) ? */
export const dicteeDuProfil = (): boolean => etat.source === 'liste';

/* ---------- Ce qu'on peut choisir ---------- */

interface ChoixDictee {
	/** Source de la dictée : id prédéfini ou UUID de la liste (où ses erreurs se rangeront). */
	lecon: string;
	titre: string;
	niveau?: SchoolLevel;
	/** Mots annoncés : ceux de la liste, cibles verbe comprises. */
	nbMots: number;
}

/* Les dictées prédéfinies sont des données de l'appli : converties une fois. */
let cache: DicteePredefinie[] | null = null;
function predefinies(): DicteePredefinie[] {
	cache ??= dicteesPredefinies();
	return cache;
}

/* La dictée prédéfinie retenue ; à défaut, la première du niveau de français suivi par le
   profil consulté, sinon la première. */
function choixPredefinie(consulte: Profile): ChoixDictee | null {
	const toutes = predefinies();
	const niveau = niveauProfilMatiere(consulte, 'francais');
	const d =
		toutes.find((x) => x.id === etat.predefinieId) ??
		toutes.find((x) => x.niveau === niveau) ??
		toutes[0];
	return d ? { lecon: d.id, titre: d.label, niveau: d.niveau, nbMots: d.mots.length } : null;
}

function listesDuProfil(consulte: Profile): LeconOrthoRef[] {
	return listOrthoLecons(loadOrthoFor(consulte.uuid)).filter((l) => l.source === 'liste');
}

function choixListe(consulte: Profile): ChoixDictee | null {
	const listes = listesDuProfil(consulte);
	const l = listes.find((x) => x.id === etat.listeId) ?? listes[0];
	return l ? { lecon: l.id, titre: l.label, nbMots: l.nbMots } : null;
}

function choix(consulte: Profile): ChoixDictee | null {
	return etat.source === 'predefinie' ? choixPredefinie(consulte) : choixListe(consulte);
}

/** Libellé présenté tant que l'encadrant n'a pas écrit le sien. */
export function libelleDictee(consulte: Profile): string {
	const c = choix(consulte);
	return c ? libelleParDefaut(c.titre) : '';
}

/** Ce qu'on dit quand rien n'est choisi. */
export function sansChoixDictee(consulte: Profile): string {
	return etat.source === 'liste'
		? `${consulte.name} n'a pas de liste de dictée.`
		: "Choisissez d'abord une dictée.";
}

/* ---------- Rendu ---------- */

const motsTexte = (n: number): string => `${n} mot${n > 1 ? 's' : ''}`;

export function dicteeHTML(consulte: Profile): SafeHtml {
	const source = segmentHTML({
		act: 'envoi-dictee',
		valAttr: 'dictee',
		label: 'Quelle dictée ?',
		active: etat.source,
		options: [
			{ val: 'predefinie', label: 'Une dictée proposée' },
			{ val: 'liste', label: `Une liste ${elisionDe(consulte.name)}` },
		],
	});
	return html`<div class="enc-envoi-choix">
      ${source}
      ${etat.source === 'predefinie' ? predefinieHTML(consulte) : listeHTML(consulte)}
    </div>`;
}

function predefinieHTML(consulte: Profile): SafeHtml {
	const c = choixPredefinie(consulte);
	if (!c) return html`<p class="enc-hint">Aucune dictée n'est proposée.</p>`;
	const toutes = predefinies();
	const groupes = joindre(
		LEVEL_ORDER.map((n) => {
			const opts = toutes
				.filter((d) => d.niveau === n)
				.map(
					(d) =>
						html`<option value="${d.id}"${d.id === c.lecon ? drapeau('selected') : VIDE}>${d.label}</option>`,
				);
			return opts.length
				? html`<optgroup label="${LEVEL_LABEL[n]}">${joindre(opts)}</optgroup>`
				: VIDE;
		}),
	);
	return html`<label class="enc-envoi-label" for="envoiDicteePredefinie">Dictée</label>
      <select class="enc-select-niveau enc-envoi-select" id="envoiDicteePredefinie" data-act="envoi-dictee-predefinie">${groupes}</select>
      ${c.niveau ? html`<p class="enc-envoi-fixe">Niveau : <strong>${LEVEL_LABEL[c.niveau]}</strong></p>` : VIDE}
      <p class="enc-hint">${motsTexte(c.nbMots)}.</p>`;
}

function listeHTML(consulte: Profile): SafeHtml {
	const listes = listesDuProfil(consulte);
	const c = choixListe(consulte);
	if (!c || !listes.length)
		return html`<p class="enc-hint" id="envoiDicteeAucune">${consulte.name} n'a pas de liste de dictée. Les listes proposées sont celles du profil choisi en haut de la page.</p>`;
	const opts = joindre(
		listes.map(
			(l) =>
				html`<option value="${l.id}"${l.id === c.lecon ? drapeau('selected') : VIDE}>${l.label}</option>`,
		),
	);
	return html`<label class="enc-envoi-label" for="envoiDicteeListe">Listes ${elisionDe(consulte.name)}</label>
      <select class="enc-select-niveau enc-envoi-select" id="envoiDicteeListe" data-act="envoi-dictee-liste">${opts}</select>
      <p class="enc-hint">${motsTexte(c.nbMots)}.</p>`;
}

/* ---------- Composer ---------- */

export interface DicteeComposee {
	compo: Composition;
	titre: string;
	/** Mots de la liste que le lien refuse, écartés de l'envoi. */
	ecartes: string[];
}

/** Compose la dictée choisie. Asynchrone : les verbes d'une liste se conjuguent au moment
 *  de l'envoi (lexique chargé à la demande), comme au lancement du parcours de l'enfant.
 *  L'état d'orthographe est chargé pour l'occasion et jamais sauvegardé. */
export async function composerDicteeChoisie(
	consulte: Profile,
	libelle: string,
	id: string,
): Promise<DicteeComposee | null> {
	const c = choix(consulte);
	if (!c) return null;
	if (etat.source === 'predefinie') {
		const d = dicteePredefinie(c.lecon);
		if (!d) return null;
		const compo = composerDictee({ mots: d.mots, lecon: d.id, niveau: d.niveau, libelle, id });
		return { compo, titre: d.label, ecartes: [] };
	}
	const l = await motsDicteeListe(loadOrthoFor(consulte.uuid), c.lecon);
	if (!l) return null;
	const compo = composerDictee({ mots: l.mots, lecon: c.lecon, libelle, id });
	return { compo, titre: l.label, ecartes: l.ecartes };
}

/* ---------- Handlers ---------- */

/** `changer` applique la mise à jour, périme le lien affiché et re-rend (cf.
 *  `changerChoix` de l'onglet). */
type Changer = (maj: () => void, refocus: string) => void;

export function dicteeClick(act: string, el: HTMLElement, changer: Changer): boolean {
	if (act !== 'envoi-dictee') return false;
	const source: SourceDictee = el.dataset.dictee === 'liste' ? 'liste' : 'predefinie';
	changer(() => {
		etat.source = source;
	}, `[data-act="envoi-dictee"][data-dictee="${source}"]`);
	return true;
}

export function dicteeChange(
	act: string,
	t: HTMLSelectElement | HTMLInputElement,
	changer: Changer,
): boolean {
	if (act === 'envoi-dictee-predefinie') {
		changer(() => {
			etat.predefinieId = t.value;
		}, '#envoiDicteePredefinie');
		return true;
	}
	if (act === 'envoi-dictee-liste') {
		changer(() => {
			etat.listeId = t.value;
		}, '#envoiDicteeListe');
		return true;
	}
	return false;
}
