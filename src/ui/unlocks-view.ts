/* ============================================================
   Vitrines de déblocages (issue #28, phase 3c) :
   - modale « Récompenses » : paliers de niveau (rangs, compagnon, avatars,
     thèmes) acquis ✓ / à venir 🔒 « Niveau X » ;
   - modale « Trophées » : la collection de trophées, sortie de l'inline.
   Plus la barre de navigation (deux boutons) de l'accueil.
   ============================================================ */
import { getXP, niveauDepuisXP } from '../core/progress';
import { RANGS, MASCOTTE, AVATARS_FORET, THEMES, mascotteDuNiveau } from '../core/unlocks';
import { TROPHIES, loadTrophies } from '../core/rewards';

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
export function mascotteBulleHTML(message: string, loop = false): string {
	const m = mascotteDuNiveau(niveauDepuisXP(getXP()));
	const cls = loop ? `mascotte mascotte--${m.forme}` : 'mascotte mascotte-static';
	return `<div class="mascotte-scene">
    <span class="${cls}" aria-hidden="true">${m.emoji}</span>
    <span class="mascotte-bulle">${message}</span>
  </div>`;
}

// Une cellule de palier, calquée sur le rendu des trophées (.trophy on/off).
function tierCell(icone: string, titre: string, seuil: number, debloque: boolean) {
	return `<div class="trophy ${debloque ? 'on' : 'off'}">
    <span class="trophy-ico">${debloque ? icone : '🔒'}</span>
    <span class="trophy-title">${titre}</span>
    <span class="trophy-desc">${debloque ? 'Débloqué ✓' : 'Niveau ' + seuil}</span></div>`;
}

// Tous les paliers de niveau, groupés par catégorie, marqués selon le niveau courant.
function recompensesContentHTML(): string {
	const niveau = niveauDepuisXP(getXP());
	const section = (titre: string, cells: string) =>
		`<h4 class="rewards-h">${titre}</h4><div class="trophy-grid">${cells}</div>`;
	const rangs = RANGS.map((r) => tierCell(r.icone, r.titre, r.seuil, niveau >= r.seuil)).join('');
	const masc = MASCOTTE.map((m) => tierCell(m.emoji, 'Compagnon', m.seuil, niveau >= m.seuil)).join(
		'',
	);
	const avatars = AVATARS_FORET.map((a) =>
		tierCell(a.emoji, 'Avatar', a.niveau, niveau >= a.niveau),
	).join('');
	const themes = THEMES.map((t) => tierCell(t.icone, t.label, t.niveau, niveau >= t.niveau)).join(
		'',
	);
	return `<p class="rewards-sub">Niveau actuel : <strong>${niveau}</strong> · les paliers grisés se débloquent en montant de niveau.</p>
    ${section('Rangs', rangs)}
    ${section('Compagnon', masc)}
    ${section('Avatars', avatars)}
    ${section('Thèmes de couleur', themes)}`;
}

// La grille de trophées (acquis / verrouillés), pour la modale dédiée.
function trophiesContentHTML(): string {
	const have = new Set(loadTrophies());
	const cells = TROPHIES.map((t) => {
		const on = have.has(t.id);
		return `<div class="trophy ${on ? 'on' : 'off'}">
      <span class="trophy-ico">${on ? t.icon : '🔒'}</span>
      <span class="trophy-title">${t.title}</span>
      <span class="trophy-desc">${t.desc}</span></div>`;
	}).join('');
	return `<p class="rewards-sub"><strong>${have.size}/${TROPHIES.length}</strong> trophées obtenus.</p>
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
	const trophies = new Set(loadTrophies()).size;
	el.innerHTML =
		`<button class="reward-btn" data-act="open-recompenses">🎁 Mes récompenses <span class="reward-count">${acquis}/${seuils.length}</span></button>` +
		`<button class="reward-btn" data-act="open-trophees">🏆 Mes trophées <span class="reward-count">${trophies}/${TROPHIES.length}</span></button>`;
}

function fillAndShow(overlayId: string, contentId: string, html: string) {
	const c = document.getElementById(contentId);
	if (c) c.innerHTML = html;
	const ov = document.getElementById(overlayId);
	if (ov) ov.style.display = '';
}
export function openRecompenses() {
	fillAndShow('recompenses', 'recompensesContent', recompensesContentHTML());
}
export function openTrophees() {
	fillAndShow('trophees', 'tropheesContent', trophiesContentHTML());
}
export function hideUnlockModals() {
	for (const id of ['recompenses', 'trophees']) {
		const ov = document.getElementById(id);
		if (ov) ov.style.display = 'none';
	}
}
