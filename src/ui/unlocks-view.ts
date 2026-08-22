/* ============================================================
   Vitrines de déblocages (issue #28, phase 3c) :
   - modale « Récompenses » : paliers de niveau (rangs, compagnon, avatars,
     thèmes) acquis ✓ / à venir 🔒 « Niveau X » ;
   - modale « Trophées » : la collection de trophées, sortie de l'inline.
   Plus la barre de navigation (deux boutons) de l'accueil.
   ============================================================ */
import { getXP, niveauDepuisXP } from '../core/progress';
import { RANGS, MASCOTTE, AVATARS_FORET, THEMES, mascotteDuNiveau } from '../core/unlocks';
import { loadTrophies, trophiesVisibles } from '../core/rewards';
import { icon } from './icon';
import { activateModal } from './modal-a11y';
import { html, type SafeHtml, joindre } from '../core/html';

/* ---------- Mascotte « accompagnante » : bulle de BD (phase 4) ----------
   Apparaît AUTOUR des exercices (jamais pendant un calcul chronométré) et sur
   l'accueil. `loop` n'est vrai que sur l'accueil (écran de contemplation) ; sur
   les écrans de résultats, entrée seule (mascotte-static), pas de boucle. */
const ENCOURAGEMENTS = [
	'Bravo pour tes efforts !',
	'Tu t’entraînes super bien !',
	'Continue, tu progresses !',
	'Joli travail !',
	'Bien joué !',
	'Quel bel entraînement !',
];
export function encouragementMascotte(): string {
	return ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
}
// Mascotte courante + bulle de BD disant `message`.
export function mascotteBulleHTML(message: string, loop = false): SafeHtml {
	const m = mascotteDuNiveau(niveauDepuisXP(getXP()));
	const cls = loop ? `mascotte mascotte--${m.forme}` : 'mascotte mascotte-static';
	return html`<div class="mascotte-scene">
    <span class="${cls}" aria-hidden="true">${m.emoji}</span>
    <span class="mascotte-bulle">${message}</span>
  </div>`;
}

// Une cellule de palier, calquée sur le rendu des trophées (.trophy on/off).
function tierCell(icone: string, titre: string, seuil: number, debloque: boolean) {
	return html`<div class="trophy ${debloque ? 'on' : 'off'}">
    <span class="trophy-ico">${debloque ? icone : icon('lock')}</span>
    <span class="trophy-title">${titre}</span>
    <span class="trophy-desc">${debloque ? 'Débloqué ✓' : 'Niveau ' + seuil}</span></div>`;
}

// Tous les paliers de niveau, groupés par catégorie, marqués selon le niveau courant.
function recompensesContentHTML(): SafeHtml {
	const niveau = niveauDepuisXP(getXP());
	const section = (titre: string, cells: SafeHtml) =>
		html`<h4 class="rewards-h">${titre}</h4><div class="trophy-grid">${cells}</div>`;
	const rangs = joindre(RANGS.map((r) => tierCell(r.icone, r.titre, r.seuil, niveau >= r.seuil)));
	const masc = joindre(
		MASCOTTE.map((m) => tierCell(m.emoji, 'Compagnon', m.seuil, niveau >= m.seuil)),
	);
	const avatars = joindre(
		AVATARS_FORET.map((a) => tierCell(a.emoji, 'Avatar', a.niveau, niveau >= a.niveau)),
	);
	const themes = joindre(
		THEMES.map((t) => tierCell(t.icone, t.label, t.niveau, niveau >= t.niveau)),
	);
	return html`<p class="rewards-sub">Niveau actuel : <strong>${niveau}</strong> · les paliers grisés se débloquent en montant de niveau.</p>
    ${section('Rangs', rangs)}
    ${section('Compagnon', masc)}
    ${section('Avatars', avatars)}
    ${section('Thèmes de couleur', themes)}`;
}

/* Numérateur du compteur « N/M » : les ids acquis QUI EXISTENT ENCORE parmi les visibles,
   et non la taille brute du stockage. Un id acquis puis disparu du catalogue de trophées —
   préfixe hérité d'une version antérieure, ou `cat-<catégorie>-N` d'une catégorie redevenue
   vide, `categoryTrophies` ne générant que les catégories peuplées — était sinon compté au
   numérateur sans exister au dénominateur, et l'enfant lisait « 45/44 trophées obtenus ».
   Le trou préexistait avec `TROPHIES.length` ; #276 a baissé le dénominateur d'une unité pour
   un profil de CE2, donc un seul id fantôme suffisait désormais à le faire déborder.
   (Remontée `auteur-tests-logique`.) */
function acquisVisibles(have: Set<string>, visibles: { id: string }[]): number {
	return visibles.filter((t) => have.has(t.id)).length;
}

// La grille de trophées (acquis / verrouillés), pour la modale dédiée.
function trophiesContentHTML(): SafeHtml {
	const have = new Set<string>(loadTrophies());
	// `trophiesVisibles` et non `TROPHIES` (#276) : un trophée de tour d'un niveau
	// au-dessus du sien ne doit pas s'afficher, même verrouillé.
	const visibles = trophiesVisibles();
	const cells = joindre(
		visibles.map((t) => {
			const on = have.has(t.id);
			return html`<div class="trophy ${on ? 'on' : 'off'}">
      <span class="trophy-ico">${on ? t.icon : icon('lock')}</span>
      <span class="trophy-title">${t.title}</span>
      <span class="trophy-desc">${t.desc}</span></div>`;
		}),
	);
	return html`<p class="rewards-sub"><strong>${acquisVisibles(have, visibles)}/${visibles.length}</strong> trophées obtenus.</p>
    <div class="trophy-grid">${cells}</div>`;
}

// Barre de l'accueil : deux boutons (ouvrent les modales) avec compteurs.
export function renderRewardNav() {
	const el = document.getElementById('rewardNav');
	if (!el) return;
	const niveau = niveauDepuisXP(getXP());
	const seuils = [
		...RANGS.map((r) => r.seuil),
		...MASCOTTE.map((m) => m.seuil),
		...AVATARS_FORET.map((a) => a.niveau),
		...THEMES.map((t) => t.niveau),
	];
	const acquis = seuils.filter((s) => niveau >= s).length;
	const trophiesVus = trophiesVisibles();
	const trophies = acquisVisibles(new Set<string>(loadTrophies()), trophiesVus);
	el.innerHTML =
		html`<button class="reward-btn" data-act="open-recompenses">🎁 Mes récompenses <span class="reward-count">${acquis}/${seuils.length}</span></button><button class="reward-btn" data-act="open-trophees">🏆 Mes trophées <span class="reward-count">${trophies}/${trophiesVus.length}</span></button>`.balisage;
}

// Une seule vitrine ouverte à la fois (Récompenses XOR Trophées) → un seul
// `release` partagé (focus-trap + inert + restauration du focus, #235).
let unlockRelease: (() => void) | null = null;
function fillAndShow(overlayId: string, contentId: string, fragment: SafeHtml) {
	const c = document.getElementById(contentId);
	if (c) c.innerHTML = fragment.balisage;
	const ov = document.getElementById(overlayId);
	if (!ov) return;
	ov.style.display = '';
	unlockRelease?.(); // garde : libère une éventuelle vitrine encore active
	// Focus initial sur l'action « Fermer » (`<id>Ok`), pas sur la croix.
	unlockRelease = activateModal(ov, {
		onEscape: hideUnlockModals,
		initialFocus: document.getElementById(overlayId + 'Ok'),
	});
}
export function openRecompenses() {
	fillAndShow('recompenses', 'recompensesContent', recompensesContentHTML());
}
export function openTrophees() {
	fillAndShow('trophees', 'tropheesContent', trophiesContentHTML());
}
export function hideUnlockModals() {
	unlockRelease?.();
	unlockRelease = null;
	for (const id of ['recompenses', 'trophees']) {
		const ov = document.getElementById(id);
		if (ov) ov.style.display = 'none';
	}
}
