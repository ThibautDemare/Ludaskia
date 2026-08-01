/* ============================================================
   Espace encadrant (#234, découpage #354) — BANQUE DE MOTS (#496).
   ------------------------------------------------------------
   Second volet du bloc « Dictées » de l'onglet Suivi (bascule « Listes » / « Mots ») :
   la banque du profil consulté, mot par mot — où il vit (listes qui le référencent),
   où en est l'enfant, et la suppression DÉFINITIVE.

   Pourquoi cette vue : les listes ne contiennent pas les mots, elles les référencent.
   Supprimer une liste laisse donc ses mots en banque, où ils continuent de revenir en
   révision espacée sans que l'adulte ait le moindre moyen de les atteindre (et, depuis
   #489, sans même que leurs erreurs soient journalisées). D'où le filtre « plus dans
   aucune liste », motif d'ouverture n°1 de l'écran.

   Le premier geste IRRÉVERSIBLE de l'onglet Suivi vit ici : garde-fou = `uiConfirm`
   destructif nommant les listes amputées (#230), jamais un tap unique.

   Les calculs vivent dans core/orthographe/banque.ts (purs) ; ici, le rendu, l'état de
   vue (bascule, recherche, filtre) et les handlers. Écriture sur le profil CONSULTÉ par
   UUID (`saveOrthoFor` + `touchProfile`), jamais de bascule du profil actif.
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { icon } from './icon';
import { touchProfile, type Profile } from '../core/profiles';
import { loadOrthoFor, saveOrthoFor, supprimerMot } from '../core/orthographe/store';
import { banqueProfil, filtrerBanque, type EntreeBanque } from '../core/orthographe/banque';
import type { StatutMot } from '../core/orthographe/runner';
import type { NiveauNotion } from '../core/encadrant-stats';
import { dicteeDisponible } from './tts';
import {
	renderEspace,
	container,
	consulteUuid,
	MOT_NIVEAU,
	ORDRE_NIVEAUX_ORTHO,
} from './encadrant-commun';
import { uiConfirm } from './ui-modal';

/* ---------- État de la section (module) ---------- */
let vue: 'listes' | 'mots' = 'listes'; // volet affiché du bloc « Dictées »
let recherche = ''; // filtre texte libre (comparé sur forme normalisée)
let orphelinsSeuls = false; // filtre « plus dans aucune liste »

export function vueDictees(): 'listes' | 'mots' {
	return vue;
}

/* Nombre de listes nommées en clair sur une ligne. Empiler tous les noms rendrait la
   hauteur des lignes imprévisible au défilement sur une banque de plusieurs centaines
   d'entrées (avis designer) ; au-delà, le reste est compté (« Semaine 12 » +2). */
const MAX_LISTES_CITEES = 2;

/* Le statut par-mot du runner, projeté sur l'échelle d'acquisition à 3 niveaux commune
   à tout l'espace encadrant : pas de vocabulaire visuel neuf à apprendre. */
const NIVEAU_DE_STATUT: Record<StatutMot, NiveauNotion> = {
	nouveau: 'a-decouvrir',
	enCours: 'en-cours',
	maitrise: 'acquis',
};

/** La banque d'un profil (lecture par UUID, sans bascule du profil actif). */
export function banqueDuProfil(uuid: string): EntreeBanque[] {
	return banqueProfil(loadOrthoFor(uuid), dicteeDisponible());
}

/* Noms des listes d'un mot, en clair et tronqués. Jamais de zone vide pour un orphelin :
   une case vide se lit « pas chargé », alors que « Dans aucune liste » est l'information
   la plus utile de la ligne. */
function citationListes(e: EntreeBanque): string {
	const noms = [...e.listes, ...e.verbeListes].map((l) => l.label);
	if (noms.length === 0) {
		return e.leconPredefinie
			? `Dictée proposée : ${escapeHTML(e.leconPredefinie)}`
			: 'Dans aucune liste';
	}
	const cites = noms
		.slice(0, MAX_LISTES_CITEES)
		.map((n) => `« ${escapeHTML(n)} »`)
		.join(', ');
	const reste = noms.length - MAX_LISTES_CITEES;
	return reste > 0 ? `${cites} +${reste}` : cites;
}

function ligneMot(e: EntreeBanque): string {
	const niveau = NIVEAU_DE_STATUT[e.statut];
	// Le mot AFFICHÉ : la phrase de contexte pour une cible verbe (« mange » seul serait
	// ambigu entre je/il, et l'adulte ne saurait pas laquelle il supprime).
	const affiche = e.contexte ?? e.mot;
	const action = e.supprimable
		? `<button type="button" class="enc-btn-sec enc-danger" data-act="banque-supprimer" data-mot="${escapeHTML(e.id)}" aria-label="Supprimer « ${escapeHTML(affiche)} »">${icon('trash')} Supprimer</button>`
		: // Pas de bouton désactivé (invisible aux lecteurs d'écran en navigation par contrôles) :
			// une mention textuelle dit POURQUOI, ce qu'un bouton grisé ne dirait pas.
			`<span class="enc-hint enc-banque-fige">Mot d'une dictée de l'application</span>`;
	return `<li class="enc-detail-item enc-banque-item">
      <span class="enc-detail-puce enc-key-${niveau}" aria-hidden="true"></span>
      <span class="enc-detail-main">
        <span class="enc-detail-lab">${escapeHTML(affiche)}</span>
        <span class="enc-detail-meta">${citationListes(e)}</span>
      </span>
      <span class="enc-detail-mot"><span class="sr-only">Niveau : </span>${MOT_NIVEAU[niveau]}</span>
      <span class="enc-actions">${action}</span>
    </li>`;
}

/* Compteur d'orphelins, cliquable : il ANNONCE le problème et POSE le filtre d'un geste
   (le parent arrive ici pour ça). Bascule, donc `aria-pressed`. Masqué s'il n'y en a pas. */
function orphelinsHTML(entrees: EntreeBanque[]): string {
	const n = entrees.filter((e) => e.orphelin).length;
	if (n === 0 && !orphelinsSeuls) return '';
	const lab =
		n > 1 ? `${n} mots ne sont plus dans aucune liste` : `${n} mot n'est plus dans aucune liste`;
	return `<button type="button" class="enc-btn-sec enc-banque-orphelins${orphelinsSeuls ? ' on' : ''}" data-act="banque-orphelins" aria-pressed="${orphelinsSeuls}">${lab}</button>`;
}

/* Corps re-rendu SEUL à la frappe (cf. rafraichir) : résumé + liste. Le reste du bloc
   (champ de recherche compris) n'est pas retouché, sinon la saisie perdrait le focus. */
function corpsHTML(entrees: EntreeBanque[]): string {
	const filtres = filtrerBanque(entrees, { recherche, orphelinsSeuls });
	if (filtres.length === 0) {
		return `<p class="enc-hint" id="encBanqueVide">Aucun mot ne correspond à cette recherche.</p>`;
	}
	// `aria-live` sur le résumé : à la frappe, seule la liste change sous le champ ; sans
	// annonce, qui ne voit pas l'écran n'a aucun retour sur l'effet de sa saisie.
	const resume = `<p class="enc-hint" id="encBanqueResume" aria-live="polite">${filtres.length} mot${filtres.length > 1 ? 's' : ''} affiché${filtres.length > 1 ? 's' : ''} sur ${entrees.length}.</p>`;
	return `${resume}<ul class="enc-detail enc-banque-list">${filtres.map(ligneMot).join('')}</ul>`;
}

/** Volet « Mots » du bloc Dictées : barre d'outils (recherche + orphelins) puis liste. */
export function banqueMotsHTML(consulte: Profile, entrees: EntreeBanque[]): string {
	const legende = ORDRE_NIVEAUX_ORTHO.map(
		(n) => `<span class="enc-key enc-key-${n}">${MOT_NIVEAU[n]}</span>`,
	).join('');
	return `<p class="enc-legend">${legende}</p>
    <p class="enc-hint">Tous les mots que ${escapeHTML(consulte.name)} révise, et la ou les listes où ils figurent. Un mot supprimé ici ne reviendra plus en révision.</p>
    <div class="enc-banque-outils">
      <label class="enc-banque-rech">
        <span class="sr-only">Rechercher un mot</span>
        <input type="search" class="enc-input" id="encBanqueRech" data-act="banque-recherche" placeholder="Rechercher un mot…" value="${escapeHTML(recherche)}" autocomplete="off" />
      </label>
      ${orphelinsHTML(entrees)}
    </div>
    <div id="encBanqueCorps">${corpsHTML(entrees)}</div>`;
}

/* Re-rend le SEUL corps de la liste, en place : la recherche se fait à la frappe, un
   re-rendu de l'espace détruirait le champ (focus et curseur perdus à chaque lettre).
   Le bouton « orphelins » est mis à jour à part, pour la même raison. */
function rafraichir(uuid: string): void {
	const el = container();
	const corps = el?.querySelector('#encBanqueCorps');
	if (!corps) return;
	const entrees = banqueDuProfil(uuid);
	corps.innerHTML = corpsHTML(entrees);
	const bouton = el?.querySelector('.enc-banque-orphelins');
	if (bouton) bouton.outerHTML = orphelinsHTML(entrees);
}

/* ---------- Handlers délégués (aiguillés par la section qui compose le bloc) ---------- */

/** Frappe dans le champ de recherche (événement `input`, pas `change` : `change` n'arrive
    qu'au blur, ce qui ne filtrerait rien pendant la saisie). */
export function banqueInput(act: string, el: HTMLElement): boolean {
	if (act !== 'banque-recherche') return false;
	const uuid = consulteUuid();
	if (!uuid) return true;
	recherche = (el as HTMLInputElement).value;
	rafraichir(uuid);
	return true;
}

export function banqueClick(act: string, el: HTMLElement): boolean {
	const uuid = consulteUuid();
	if (act === 'dictees-vue') {
		vue = el.dataset.vue === 'mots' ? 'mots' : 'listes';
		// Changer de volet remet les filtres à plat : les retrouver posés au retour, sans les
		// avoir sous les yeux en arrivant, ferait passer une liste tronquée pour la banque entière.
		recherche = '';
		orphelinsSeuls = false;
		renderEspace();
		(container()?.querySelector('[data-act="dictees-vue"].on') as HTMLElement | null)?.focus({
			preventScroll: true,
		});
		return true;
	}
	if (act === 'banque-orphelins') {
		if (!uuid) return true;
		orphelinsSeuls = !orphelinsSeuls;
		rafraichir(uuid);
		// Le bouton a été remplacé (son libellé et son état changent) : le focus retomberait
		// sur <body> sans ça, en plein milieu d'une liste qu'on vient de filtrer.
		(container()?.querySelector('.enc-banque-orphelins') as HTMLElement | null)?.focus({
			preventScroll: true,
		});
		return true;
	}
	if (act === 'banque-supprimer') {
		if (uuid) void supprimer(uuid, el.dataset.mot ?? '');
		return true;
	}
	return false;
}

/* Message de confirmation : il doit permettre de DÉCIDER, donc nommer ce qui va être
   amputé (avis designer). Un mot peut vivre dans une liste que l'adulte ne regarde pas
   au même moment : sans ce rappel, il découvrirait la disparition plus tard, sans lien
   de cause à effet. */
function messageSuppression(e: EntreeBanque): string {
	const noms = e.listes.map((l) => `« ${l.label} »`);
	const phrases: string[] = [];
	if (noms.length === 1) phrases.push(`Il sera retiré de la liste ${noms[0]}.`);
	else if (noms.length > 1)
		phrases.push(
			`Il sera retiré des listes ${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}.`,
		);
	else phrases.push(`Ce mot ne figure dans aucune liste.`);
	phrases.push('Son suivi (atelier, réussites, révisions) sera perdu.');
	// Cible verbe encore portée par une liste : la suppression NE TIENT PAS, l'id étant
	// déterministe (materialiserVerbes la recrée au prochain lancement du parcours). On le
	// dit, et on nomme la liste où aller retirer ou reconfigurer le verbe (choix mainteneur :
	// on n'interdit pas le geste, on l'explique).
	if (e.verbeListes.length > 0) {
		const ou = e.verbeListes.map((l) => `« ${l.label} »`).join(', ');
		phrases.push(
			`Attention : cette forme vient d'un verbe conjugué de ${ou}. Elle reviendra au prochain lancement de cette dictée — pour l'enlever définitivement, retirez ou reconfigurez le verbe dans la liste.`,
		);
	}
	return phrases.join(' ');
}

async function supprimer(uuid: string, wordId: string): Promise<void> {
	if (!wordId) return;
	const entree = banqueDuProfil(uuid).find((e) => e.id === wordId);
	if (!entree || !entree.supprimable) return;
	const affiche = entree.contexte ?? entree.mot;
	const ok = await uiConfirm({
		title: `Supprimer « ${affiche} » ?`,
		message: messageSuppression(entree),
		confirmLabel: 'Supprimer',
		cancelLabel: 'Non, je garde',
		destructive: true,
		confirmIcon: 'trash',
		emoji: '🗑️',
	});
	if (!ok) return;
	// Relecture de l'état au moment d'écrire (et non de la projection ci-dessus) : l'enfant
	// peut avoir joué entre-temps sur un autre onglet, et on n'a pas à réécrire un état périmé.
	const state = loadOrthoFor(uuid);
	if (!supprimerMot(state, wordId)) return;
	saveOrthoFor(uuid, state);
	// Geste VOULU par l'adulte → on bumpe `updatedAt` (même règle que toggleRevoirFor) :
	// sans ça, un export fait depuis un autre appareil paraîtrait plus récent et la fusion
	// par récence ressusciterait le mot supprimé.
	touchProfile(uuid);
	// Re-rendu COMPLET (et non `rafraichir`) : le mot disparaît aussi du suivi des listes et
	// de « Révisions de … », rendus sur la même page — le laisser affiché ailleurs donnerait
	// une page qui se contredit.
	renderEspace();
}
