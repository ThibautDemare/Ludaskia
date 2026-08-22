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
import { enumererFr } from '../core/utils';
import { icon } from './icon';
import { type Profile } from '../core/profiles';
import { loadOrthoFor } from '../core/orthographe/store';
import { supprimerMotFor } from '../core/encadrant-stats';
import { banqueProfil, filtrerBanque, type EntreeBanque } from '../core/orthographe/banque';
import type { StatutMot } from '../core/orthographe/runner';
import type { NiveauNotion } from '../core/encadrant-stats';
import { dicteeDisponible } from './tts';
import {
	renderEspace,
	container,
	consulteUuid,
	onChangementProfilConsulte,
	MOT_NIVEAU,
	ORDRE_NIVEAUX_ORTHO,
} from './encadrant-commun';
import { uiConfirm } from './ui-modal';
import { html, type SafeHtml, VIDE, joindre } from '../core/html';

/* ---------- État de la section (module) ---------- */
/* Mots listés d'un coup, et pas de « Afficher les suivants ». Assez pour couvrir une banque
   ordinaire sans clic, assez peu pour ne pas noyer l'ordre de tabulation (avis a11y). */
const PAS_AFFICHAGE = 50;
/* Délai avant l'annonce du résumé aux aides techniques (cf. `annoncer`). */
const DELAI_ANNONCE = 350;

let vue: 'listes' | 'mots' = 'listes'; // volet affiché du bloc « Dictées »
let recherche = ''; // filtre texte libre (comparé sur forme normalisée)
let orphelinsSeuls = false; // filtre « plus dans aucune liste »
let limite = PAS_AFFICHAGE; // nombre de mots listés (« Afficher les suivants » l'augmente)
let annonceTimer: number | undefined;

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
		return e.leconPredefinie ? `Dictée proposée : ${e.leconPredefinie}` : 'Dans aucune liste';
	}
	const cites = noms
		.slice(0, MAX_LISTES_CITEES)
		.map((n) => `« ${n} »`)
		.join(', ');
	const reste = noms.length - MAX_LISTES_CITEES;
	return reste > 0 ? `${cites} +${reste}` : cites;
}

function ligneMot(e: EntreeBanque): SafeHtml {
	const niveau = NIVEAU_DE_STATUT[e.statut];
	// Le mot AFFICHÉ : la phrase de contexte pour une cible verbe (« mange » seul serait
	// ambigu entre je/il, et l'adulte ne saurait pas laquelle il supprime).
	const affiche = e.contexte ?? e.mot;
	const action = e.supprimable
		? html`<button type="button" class="enc-btn-sec enc-danger" data-act="banque-supprimer" data-mot="${e.id}" aria-label="Supprimer « ${affiche} »">${icon('trash')} Supprimer</button>`
		: // Pas de bouton désactivé (invisible aux lecteurs d'écran en navigation par contrôles) :
			// une mention textuelle dit POURQUOI, ce qu'un bouton grisé ne dirait pas.
			html`<span class="enc-banque-fige">Mot d'une dictée proposée par l'application</span>`;
	return html`<li class="enc-detail-item enc-banque-item">
      <span class="enc-detail-puce enc-key-${niveau}" aria-hidden="true"></span>
      <span class="enc-detail-main">
        <span class="enc-detail-lab">${affiche}</span>
        <span class="enc-detail-meta">${citationListes(e)}</span>
      </span>
      <span class="enc-detail-mot"><span class="sr-only">Niveau : </span>${MOT_NIVEAU[niveau]}</span>
      <span class="enc-actions">${action}</span>
    </li>`;
}

/* Compteur d'orphelins, cliquable : il ANNONCE le problème et POSE le filtre d'un geste
   (le parent arrive ici pour ça). Bascule, donc `aria-pressed`. Masqué dès qu'il n'y a plus
   d'orphelin — y compris filtre armé, `supprimer` le désarmant alors (sinon le bouton
   afficherait « 0 mot n'est plus dans aucune liste », ou disparaîtrait en laissant un filtre
   actif que plus rien ne permettrait de relâcher). Son libellé ne dépend PAS des filtres :
   la bascule ne fait donc jamais varier que `aria-pressed` et `.on`, mutés en place. */
function orphelinsHTML(entrees: EntreeBanque[]): SafeHtml {
	const n = entrees.filter((e) => e.orphelin).length;
	if (n === 0) return VIDE;
	const lab =
		n > 1 ? `${n} mots ne sont plus dans aucune liste` : `${n} mot n'est plus dans aucune liste`;
	return html`<button type="button" class="enc-btn-sec enc-banque-orphelins${orphelinsSeuls ? ' on' : ''}" data-act="banque-orphelins" aria-pressed="${String(orphelinsSeuls)}">${lab}</button>`;
}

/* Phrase d'état, seule source du compte affiché ET du cas « rien à montrer ». Vit dans une
   région live STABLE (cf. banqueMotsHTML) : la recréer à chaque frappe, comme le faisait la
   première version, empêche certaines aides techniques d'annoncer quoi que ce soit — et la
   branche vide, qui n'était pas live du tout, ne disait rien à personne. */
function texteResume(entrees: EntreeBanque[], filtres: EntreeBanque[]): string {
	// « Affichés » compte ce qui est RÉELLEMENT rendu, troncature comprise — et non le total
	// filtré, qui ferait dire « 52 mots affichés sur 52 » à une phrase annonçant justement
	// qu'il en manque. Un seul point de calcul pour le rendu initial et pour l'annonce.
	const affiches = Math.min(filtres.length, limite);
	if (affiches === 0) return 'Aucun mot ne correspond à cette recherche.';
	const s = affiches > 1 ? 's' : '';
	const base = `${affiches} mot${s} affiché${s} sur ${entrees.length}.`;
	return filtres.length > limite ? `${base} Les premiers seulement sont listés.` : base;
}

/* La liste seule. Tronquée à `limite` : plusieurs centaines de `<li>` porteurs d'un bouton
   obligeraient un utilisateur clavier ou en accès par contacteur à tous les traverser pour
   atteindre la section suivante (SC 2.4.1). La recherche ne suffit pas comme garde-fou —
   rien n'oblige à s'en servir avant de recevoir la liste entière. */
function listeHTML(filtres: EntreeBanque[]): SafeHtml {
	if (filtres.length === 0) return VIDE;
	const visibles = filtres.slice(0, limite);
	const reste = filtres.length - visibles.length;
	const suite = reste
		? html`<button type="button" class="enc-btn-sec enc-banque-plus" data-act="banque-plus">Afficher les ${Math.min(reste, PAS_AFFICHAGE)} mots suivants</button>`
		: VIDE;
	return html`<ul class="enc-detail enc-banque-list">${joindre(visibles.map(ligneMot))}</ul>${suite}`;
}

/** Volet « Mots » du bloc Dictées : barre d'outils (recherche + orphelins) puis liste. */
export function banqueMotsHTML(consulte: Profile, entrees: EntreeBanque[]): SafeHtml {
	const legende = joindre(
		ORDRE_NIVEAUX_ORTHO.map(
			(n) => html`<span class="enc-key enc-key-${n}">${MOT_NIVEAU[n]}</span>`,
		),
	);
	const filtres = filtrerBanque(entrees, { recherche, orphelinsSeuls });
	return html`<p class="enc-legend">${legende}</p>
    <p class="enc-hint">Tous les mots que ${consulte.name} révise, et la ou les listes où ils figurent. Un mot supprimé ici ne reviendra plus en révision.</p>
    <div class="enc-banque-outils">
      <label class="enc-banque-rech">
        <span class="sr-only">Rechercher un mot</span>
        <input type="search" class="enc-input" id="encBanqueRech" data-act="banque-recherche" placeholder="Rechercher un mot…" value="${recherche}" autocomplete="off" />
      </label>
      ${orphelinsHTML(entrees)}
    </div>
    <p class="enc-hint" id="encBanqueResume" role="status" aria-live="polite" tabindex="-1">${texteResume(entrees, filtres)}</p>
    <div id="encBanqueCorps">${listeHTML(filtres)}</div>`;
}

/* Re-rend la SEULE liste, en place : la recherche filtre à la frappe, et un re-rendu de
   l'espace détruirait le champ de saisie (focus et curseur perdus à chaque lettre). Le
   résumé est mis à jour par `textContent` — son nœud ne doit jamais être remplacé, sous
   peine de casser la région live. Le bouton « orphelins », lui, n'est pas retouché : son
   libellé ne dépend d'aucun filtre. */
function rafraichir(uuid: string): void {
	const el = container();
	const corps = el?.querySelector('#encBanqueCorps');
	if (!corps) return;
	const entrees = banqueDuProfil(uuid);
	const filtres = filtrerBanque(entrees, { recherche, orphelinsSeuls });
	corps.innerHTML = listeHTML(filtres).balisage;
	annoncer();
}

/* L'annonce est DIFFÉRÉE, contrairement au filtrage visuel : réécrire la région live à
   chaque lettre fait qu'une synthèse vocale s'interrompt elle-même avant d'avoir fini, et
   le dernier compte entendu peut n'être pas le bon. Le texte visible suit le même délai —
   il resterait sinon en désaccord avec la liste déjà filtrée sous les yeux.

   Le texte est RECALCULÉ au moment de retomber, et non transporté depuis l'appel (#527) :
   un re-rendu complet de l'espace peut survenir dans les 350 ms (une suppression confirmée,
   ou une action d'une autre section de l'onglet), et il réécrit le résumé lui-même. Une
   phrase calculée AVANT ce re-rendu retombait alors par-dessus, et la région live gardait
   pour de bon un compte contredisant la liste sous les yeux — plus rien ne la réécrivant.
   Recalculer rend l'écart impossible à exprimer, au lieu de compter sur chaque futur site
   de re-rendu pour penser à annuler le minuteur.

   On écrit même quand le texte affiché est DÉJÀ le bon, et c'est délibéré (avis a11y) : ce
   cas est précisément celui du re-rendu complet, qui a RECRÉÉ le nœud avec son texte dedans.
   Une région `role="status"` qui naît déjà remplie n'est annoncée par personne de façon
   fiable (cf. le même constat dans `encadrant-erreurs.ts`) ; cette écriture tardive est la
   seule MUTATION authentique dont l'aide technique dispose alors. Économiser la réécriture
   « puisque le texte est identique » troquait un silence probable contre un silence certain. */
function annoncer(): void {
	window.clearTimeout(annonceTimer);
	annonceTimer = window.setTimeout(() => {
		const p = container()?.querySelector('#encBanqueResume');
		const uuid = consulteUuid();
		if (!p || !uuid) return;
		const entrees = banqueDuProfil(uuid);
		p.textContent = texteResume(entrees, filtrerBanque(entrees, { recherche, orphelinsSeuls }));
	}, DELAI_ANNONCE);
}

/* ---------- Handlers délégués (aiguillés par la section qui compose le bloc) ---------- */

/** Frappe dans le champ de recherche (événement `input`, pas `change` : `change` n'arrive
    qu'au blur, ce qui ne filtrerait rien pendant la saisie). */
export function banqueInput(act: string, el: HTMLElement): boolean {
	if (act !== 'banque-recherche') return false;
	const uuid = consulteUuid();
	if (!uuid) return true;
	recherche = (el as HTMLInputElement).value;
	limite = PAS_AFFICHAGE; // nouvelle recherche → on repart du haut, pas d'un dépliage hérité
	rafraichir(uuid);
	return true;
}

export function banqueClick(act: string, el: HTMLElement): boolean {
	const uuid = consulteUuid();
	if (act === 'dictees-vue') {
		vue = el.dataset.vue === 'mots' ? 'mots' : 'listes';
		// Changer de volet remet les filtres à plat : les retrouver posés au retour, sans les
		// avoir sous les yeux en arrivant, ferait passer une liste tronquée pour la banque entière.
		reinitialiserFiltres();
		renderEspace();
		(container()?.querySelector('[data-act="dictees-vue"].on') as HTMLElement | null)?.focus({
			preventScroll: true,
		});
		return true;
	}
	if (act === 'banque-orphelins') {
		if (!uuid) return true;
		orphelinsSeuls = !orphelinsSeuls;
		limite = PAS_AFFICHAGE;
		// Bouton MUTÉ en place, jamais remplacé : son libellé ne dépend pas des filtres, et
		// détruire le nœud qu'on vient d'activer obligerait à lui recourir après coup le focus
		// (rattrapage superflu, et peu fiable sur certaines aides techniques mobiles).
		el.setAttribute('aria-pressed', String(orphelinsSeuls));
		el.classList.toggle('on', orphelinsSeuls);
		rafraichir(uuid);
		return true;
	}
	if (act === 'banque-plus') {
		if (!uuid) return true;
		limite += PAS_AFFICHAGE;
		rafraichir(uuid);
		// Le bouton vient d'être détruit par le re-rendu de la liste : on donne le focus au
		// suivant s'il existe (on continue de dérouler), sinon au dernier bouton de la liste —
		// jamais de retour silencieux en tête de document. On prend le DERNIER bouton et non
		// celui de la dernière ligne : une ligne figée (mot d'une dictée proposée) n'en a pas,
		// et le repli tomberait dans le vide si elle terminait la liste.
		const el2 = container();
		const suite = el2?.querySelector<HTMLElement>('.enc-banque-plus');
		const boutons = el2?.querySelectorAll<HTMLElement>('.enc-banque-list button');
		const dernier = boutons?.length ? boutons[boutons.length - 1] : null;
		(suite ?? dernier ?? el2?.querySelector<HTMLElement>('#encBanqueRech'))?.focus({
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

/* Filtres et dépliage remis à zéro d'un bloc (changement de volet, de profil consulté…).
   L'annonce en vol est ANNULÉE au passage : une annonce programmée pour la vue qu'on quitte
   n'a rien à dire sur celle qui la remplace. Depuis #527 elle ne pourrait plus mentir (elle
   recalcule en retombant, cf. `annoncer`), mais la laisser courir ferait relire au parent un
   compte qu'il n'a pas demandé. */
function reinitialiserFiltres(): void {
	recherche = '';
	orphelinsSeuls = false;
	limite = PAS_AFFICHAGE;
	window.clearTimeout(annonceTimer);
}

/* Changer de profil consulté remet la vue à plat : recherche, filtre et dépliage décrivent
   l'enfant qu'on REGARDAIT. Hérités tels quels, ils feraient passer une liste tronquée pour
   la banque entière du nouveau — sans rien d'anormal à l'écran. Enregistré une fois pour
   toutes plutôt qu'appelé sur chacun des six sites de `setConsulteUuid`. */
onChangementProfilConsulte(reinitialiserFiltres);

/* Message de confirmation : il doit permettre de DÉCIDER, donc nommer ce qui va être
   amputé (avis designer). Un mot peut vivre dans une liste que l'adulte ne regarde pas
   au même moment : sans ce rappel, il découvrirait la disparition plus tard, sans lien
   de cause à effet. */
function messageSuppression(e: EntreeBanque): string {
	const noms = e.listes.map((l) => `« ${l.label} »`);
	const verbes = e.verbeListes.map((l) => `« ${l.label} »`);
	const phrases: string[] = [];
	if (noms.length === 1) phrases.push(`Il sera retiré de la liste ${noms[0]}.`);
	else if (noms.length > 1) phrases.push(`Il sera retiré des listes ${enumererFr(noms)}.`);
	// « Aucune liste » ne vaut que si aucun VERBE ne le porte non plus : l'annoncer alors que
	// la phrase suivante va nommer une liste porteuse se contredirait sous les yeux de
	// l'adulte, au moment précis où il décide d'une suppression définitive.
	else if (verbes.length === 0) phrases.push('Il ne figure dans aucune liste.');
	phrases.push('Son suivi (atelier, réussites, révisions) sera perdu.');
	// Cible verbe encore portée par une liste : la suppression NE TIENT PAS, l'id étant
	// déterministe (materialiserVerbes la recrée au prochain lancement du parcours). On le
	// dit, et on nomme les listes où aller retirer ou reconfigurer le verbe (choix mainteneur :
	// on n'interdit pas le geste, on l'explique).
	if (verbes.length > 0) {
		const plur = verbes.length > 1;
		phrases.push(
			`Attention : il vient d'un verbe conjugué ${plur ? 'des listes' : 'de la liste'} ${enumererFr(verbes)}. Il reviendra au prochain lancement de ${plur ? 'ces dictées' : 'cette dictée'} — pour l'enlever définitivement, retirez ou reconfigurez le verbe dans ${plur ? 'chacune de ces listes' : 'la liste'}.`,
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
	// Opération atomique côté core (relecture de l'état comprise, `updatedAt` bumpé) : la vue
	// n'a pas à recomposer la séquence ni à connaître les règles d'écriture par UUID.
	if (!supprimerMotFor(uuid, wordId)) return;
	// Dernier orphelin supprimé alors que le filtre était armé : le bouton qui le relâche
	// disparaît avec lui, ce qui laisserait une vue vide sans issue. On désarme.
	if (orphelinsSeuls && !banqueDuProfil(uuid).some((x) => x.orphelin)) orphelinsSeuls = false;
	// Re-rendu COMPLET (et non `rafraichir`) : le mot disparaît aussi du suivi des listes et
	// de « Révisions de … », rendus sur la même page — le laisser affiché ailleurs donnerait
	// une page qui se contredit.
	renderEspace();
	// La modale vient de rendre le focus au bouton « Supprimer » de la ligne (il existait
	// encore : `restoreFocusTo` n'aurait donc jamais été consulté), et le re-rendu vient de le
	// détruire — le navigateur rabat alors le focus sur `<body>`, le piège que `demarrerRunner`
	// évite déjà de la même manière (cf. `lecon-runner-shared.ts`). On le pose sur le résumé,
	// qui porte le nouveau compte : l'adulte au clavier garde son contexte, et c'est aussi ce
	// qui FAIT DIRE ce compte à un lecteur d'écran — la région live, recréée déjà remplie par
	// le re-rendu, n'est annoncée de façon fiable par aucun moteur (avis a11y). C'est le geste
	// IRRÉVERSIBLE de l'écran : il ne doit pas se conclure en silence.
	container()?.querySelector<HTMLElement>('#encBanqueResume')?.focus({ preventScroll: true });
}
