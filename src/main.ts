/* ============================================================
   Point d'entrée (ES modules) : import des styles, initialisation
   dans l'ordre (hook d'écriture → profils → câblage DOM → route).
   ============================================================ */
import './styles/base.scss';
import './styles/themes.scss';
import './styles/toolbar.scss';
import './styles/home.scss';
import './styles/sheets.scss';
import './styles/gamification.scss';
import './styles/lessons.scss';
import './styles/profiles.scss';
import './styles/sprint.scss';
import './styles/revision.scss';
import './styles/modal.scss';
import './styles/reprise.scss';
import './styles/print.scss';
import './styles/bilan.scss';
import './styles/catalog.scss';
import './styles/francais.scss';
import './styles/orthographe.scss';

import { setOnDataWrite } from './core/storage';
import {
	initProfiles,
	touchActiveProfile,
	addProfile,
	renameProfile,
	setProfileEmoji,
	resetProfile,
	deleteProfile,
	setActiveProfile,
	exportProfiles,
	importProfiles,
} from './core/profiles';
import { renderProfiles, toggleEmojiPicker, closeEmojiPicker } from './ui/render';
import {
	applyPreferences,
	renderPreferences,
	setTheme,
	setAnimationsReduites,
} from './ui/preferences';
import {
	route,
	goHome,
	showProfiles,
	startSprint,
	startBilanCustom,
	startRevisionEspacee,
	startMatieres,
	goCategories,
	goCategorie,
	startLecon,
} from './ui/navigation';
import { ORTHO_CATEGORY_ID } from './core/catalog';
import { verify, printAll } from './ui/session';
import { captureResume } from './ui/resume';
import { isSprintRunning } from './ui/sprint';
import { isRevisionRunning } from './ui/revision';
import { hideCelebration, hideLevelUp } from './ui/effects';
import { openRecompenses, openTrophees, hideUnlockModals } from './ui/unlocks-view';
import { closeProfileMenu, toggleProfileMenu } from './ui/menu';
import { initTts } from './ui/tts';

// Quitter ces modes (non reprenables) perd la progression → on confirme (#63).
const quittingLosesProgress = () => isSprintRunning() || isRevisionRunning();

/* ---------- Téléchargement d'un objet en fichier JSON ---------- */
function downloadJSON(filename: string, obj: any) {
	const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============================================================
   Initialisation : câblage des événements au chargement
   ============================================================ */
function wireDOM() {
	document.getElementById('btnVerify')!.addEventListener('click', verify);
	// Accueil : la confirmation des modes NON reprenables (sprint, révision) est
	// gérée au niveau du hashchange (couvre aussi Précédent / édition d'URL), pour
	// ne pas demander deux fois. Les exercices grille sont sauvegardés en silence.
	document.getElementById('btnHome')!.addEventListener('click', goHome);
	document.getElementById('btnPrint')!.addEventListener('click', printAll);
	document.getElementById('cardLecon')!.addEventListener('click', startMatieres);
	document.getElementById('cardSprint')!.addEventListener('click', startSprint);
	document.getElementById('cardRevision')!.addEventListener('click', startRevisionEspacee);
	document.getElementById('cardBilanCustom')!.addEventListener('click', startBilanCustom);
	document.getElementById('backHome')!.addEventListener('click', goHome);
	document.getElementById('backHomeBilanCustom')!.addEventListener('click', goHome);
	document.getElementById('backHomeSprintConfig')!.addEventListener('click', goHome);
	// Navigation multi-matières : retours en arrière
	document.getElementById('backHomeMatieres')!.addEventListener('click', goHome);
	document.getElementById('backMatieres')!.addEventListener('click', startMatieres);
	document.getElementById('backCategorie')!.addEventListener('click', (e: any) => {
		const subject = e.currentTarget.dataset.subject;
		if (subject) goCategories(subject);
		else startMatieres();
	});
	document
		.getElementById('backOrthoListe')!
		.addEventListener('click', () => goCategorie(ORTHO_CATEGORY_ID));
	document.getElementById('backHomeProfils')!.addEventListener('click', goHome);

	// Bouton profil de la barre : ouvre/ferme la liste déroulante
	document.getElementById('toolbarProfile')!.addEventListener('click', (e) => {
		e.stopPropagation();
		toggleProfileMenu();
	});
	// Menu déroulant : bascule de profil (clic = profil actif) ou accès à la gestion
	document.getElementById('profileMenu')!.addEventListener('click', (e: any) => {
		const btn = e.target.closest('button');
		if (!btn) return;
		closeProfileMenu();
		if (btn.id === 'pmManage') {
			showProfiles();
			return;
		}
		if (btn.dataset.uuid) {
			setActiveProfile(btn.dataset.uuid);
			route();
		} // re-rendu de la vue courante avec le nouveau profil
	});
	// Clic en dehors → ferme le menu
	document.addEventListener('click', (e: any) => {
		if (!e.target.closest('#profileDD')) closeProfileMenu();
	});

	// Écran de gestion des profils (délégation)
	document.getElementById('profileList')!.addEventListener('click', (e: any) => {
		const btn = e.target.closest('button');
		if (!btn) return;
		if (btn.id === 'profileAdd') {
			const n = prompt('Prénom du nouveau profil :');
			if (n && n.trim()) {
				addProfile(n.trim());
				applyPreferences(); // nouveau profil actif → son thème (défaut)
				renderPreferences();
				renderProfiles();
			}
			return;
		}
		const row = e.target.closest('.profile-row');
		if (!row) return;
		const uuid = row.dataset.uuid;
		// Toute action autre que l'ouverture/choix d'avatar referme la palette.
		if (btn.dataset.act !== 'emoji' && btn.dataset.act !== 'set-emoji') closeEmojiPicker();
		switch (btn.dataset.act) {
			case 'pick':
				setActiveProfile(uuid);
				goHome();
				break;
			case 'rename': {
				const n = prompt('Nouveau prénom :');
				if (n && n.trim()) {
					renameProfile(uuid, n.trim());
					renderPreferences(); // le nom peut être celui du profil actif
					renderProfiles();
				}
				break;
			}
			case 'emoji':
				toggleEmojiPicker(uuid); // ouvre/replie la palette d'avatars
				renderProfiles();
				break;
			case 'set-emoji':
				setProfileEmoji(uuid, btn.dataset.emoji);
				closeEmojiPicker();
				renderProfiles();
				break;
			case 'reset':
				if (confirm('Réinitialiser toute la progression de ce profil ? (irréversible)')) {
					resetProfile(uuid);
					applyPreferences(); // l'XP repart à 0 → thème éventuellement réinitialisé
					renderPreferences();
					renderProfiles();
				}
				break;
			case 'delete':
				if (confirm('Supprimer ce profil et toute sa progression ?')) {
					deleteProfile(uuid);
					applyPreferences(); // l'actif peut avoir changé → son thème
					renderPreferences();
					renderProfiles();
				}
				break;
		}
	});

	// Export : profils cochés → fichier JSON
	document.getElementById('btnExport')!.addEventListener('click', () => {
		const uuids = [...document.querySelectorAll('#profileList .profile-check:checked')].map(
			(c: any) => c.dataset.uuid,
		);
		if (!uuids.length) {
			alert('Coche au moins un profil à exporter.');
			return;
		}
		const payload = exportProfiles(uuids)!;
		const d = new Date().toISOString().slice(0, 10);
		const slug = (s: string) =>
			(s || 'profil')
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
		const name = uuids.length === 1 ? slug(payload.profiles[0].name) : `${uuids.length}-profils`;
		downloadJSON(`ludaskia-${name}-${d}.json`, payload);
	});
	// Import : fusion par UUID (écrase si plus récent, ajoute si inconnu)
	document
		.getElementById('btnImport')!
		.addEventListener('click', () =>
			(document.getElementById('importFile') as HTMLInputElement).click(),
		);
	document.getElementById('importFile')!.addEventListener('change', (e: any) => {
		const file = e.target.files && e.target.files[0];
		e.target.value = ''; // autorise un futur ré-import du même fichier
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			let payload = null;
			try {
				payload = JSON.parse(reader.result as string);
			} catch (err) {}
			const res = payload && importProfiles(payload);
			if (!res) {
				alert('Fichier de sauvegarde non reconnu.');
				return;
			}
			const parts: string[] = [];
			if (res.added) parts.push(`${res.added} ajouté${res.added > 1 ? 's' : ''}`);
			if (res.updated) parts.push(`${res.updated} mis à jour`);
			if (res.skipped)
				parts.push(`${res.skipped} ignoré${res.skipped > 1 ? 's' : ''} (déjà à jour)`);
			alert('Import terminé : ' + (parts.join(', ') || 'aucun profil') + '.');
			applyPreferences(); // l'import peut changer le profil actif → son thème
			renderPreferences();
			renderProfiles();
		};
		reader.readAsText(file);
	});

	// Écran Profils : préférences du profil actif (thème de couleur + animations)
	const prefs = document.getElementById('preferences')!;
	prefs.addEventListener('click', (e: any) => {
		const btn = e.target.closest('[data-act="set-theme"]');
		if (!btn) return;
		setTheme(btn.dataset.theme);
		applyPreferences();
		renderPreferences();
	});
	prefs.addEventListener('change', (e: any) => {
		if (e.target.id === 'prefAnim') {
			setAnimationsReduites(e.target.checked);
			applyPreferences();
		}
	});

	// Accueil : barre « Récompenses » / « Trophées » (délégation, conteneur stable)
	document.getElementById('rewardNav')!.addEventListener('click', (e: any) => {
		const btn = e.target.closest('button');
		if (!btn) return;
		if (btn.dataset.act === 'open-recompenses') openRecompenses();
		else if (btn.dataset.act === 'open-trophees') openTrophees();
	});
	// Écran Profils : accès aux récompenses
	document.getElementById('btnRecompensesProfils')!.addEventListener('click', openRecompenses);
	// Fermeture des modales Récompenses / Trophées (croix, bouton, fond)
	['recompenses', 'trophees'].forEach((id) => {
		document.getElementById(id + 'Ok')!.addEventListener('click', hideUnlockModals);
		document.getElementById(id + 'Close')!.addEventListener('click', hideUnlockModals);
		document.getElementById(id)!.addEventListener('click', (e: any) => {
			if (e.target.id === id) hideUnlockModals();
		});
	});

	// Sélection d'une leçon dans la liste (délégation)
	document.getElementById('lessonList')!.addEventListener('click', (e: any) => {
		const btn = e.target.closest('.lesson-item');
		if (btn && btn.dataset.id) startLecon(btn.dataset.id);
	});

	// Modale de récompense : fermeture (bouton, croix, fond, Échap)
	document.getElementById('celebrateOk')!.addEventListener('click', hideCelebration);
	document.getElementById('celebrateClose')!.addEventListener('click', hideCelebration);
	document.getElementById('celebrate')!.addEventListener('click', (e: any) => {
		if (e.target.id === 'celebrate') hideCelebration();
	});

	// Modale de passage de niveau : mêmes fermetures (la fermeture enchaîne
	// éventuellement sur la modale de récompense, cf. showLevelUp).
	document.getElementById('levelupOk')!.addEventListener('click', hideLevelUp);
	document.getElementById('levelupClose')!.addEventListener('click', hideLevelUp);
	document.getElementById('levelup')!.addEventListener('click', (e: any) => {
		if (e.target.id === 'levelup') hideLevelUp();
	});

	document.addEventListener('keydown', (e: any) => {
		if (e.key === 'Escape') {
			hideCelebration();
			hideLevelUp();
			hideUnlockModals();
			closeProfileMenu();
		}
	});

	// Sauvegarde de l'exercice en cours quand l'app passe en arrière-plan ou se
	// ferme (onglet masqué, app quittée sur tablette) — le cas « interruption »
	// le plus fréquent pour un CE2 (#63).
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') captureResume();
	});
	window.addEventListener('pagehide', captureResume);
	// Sauvegarde débouncée à la saisie : couvre aussi une coupure brutale
	// (batterie) où pagehide ne se déclenche pas.
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	document.addEventListener('input', (e) => {
		const t = e.target as HTMLElement;
		if (t instanceof HTMLInputElement && t.classList.contains('ans')) {
			if (saveTimer) clearTimeout(saveTimer);
			saveTimer = setTimeout(captureResume, 800);
		}
	});

	// Modes NON reprenables (sprint, révision) : quitter perd la progression. On
	// confirme avant de tout changement de vue interne (Précédent/Suivant, Accueil,
	// édition du hash). Si l'enfant annule, on remet le hash précédent sans rejouer
	// la vue (le sprint continue). Les exercices grille passent sans confirmation
	// (sauvegardés automatiquement, #63).
	let revertingHash = false;
	window.addEventListener('hashchange', (e: HashChangeEvent) => {
		if (revertingHash) {
			revertingHash = false;
			return;
		}
		if (
			quittingLosesProgress() &&
			!confirm('Tu veux vraiment arrêter ? Tu perdras ta progression.')
		) {
			revertingHash = true;
			location.hash = new URL(e.oldURL).hash || '#accueil';
			return;
		}
		route();
	});
	// Fermeture d'onglet / rechargement / changement d'URL (barre d'adresse) :
	// mêmes modes non reprenables → invite native du navigateur. (Les exercices
	// grille sont déjà sauvegardés via visibilitychange/pagehide, donc pas d'invite.)
	window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
		if (quittingLosesProgress()) {
			e.preventDefault();
			e.returnValue = '';
		}
	});
	// Au chargement : on affiche la vue désignée par le hash (accueil par défaut)
	route();
}

// (1) hook d'écriture → (2) profils → (3) câblage DOM + route initiale.
setOnDataWrite(touchActiveProfile);
initProfiles();
applyPreferences(); // thème + animations du profil actif, dès avant le 1er rendu
initTts(); // précharge les voix de synthèse (dictée best-effort)
// Les scripts type="module" sont différés : si le DOM est déjà prêt, on câble
// immédiatement, sinon on attend DOMContentLoaded (parité avec l'ancien main.js).
if (document.readyState !== 'loading') wireDOM();
else document.addEventListener('DOMContentLoaded', wireDOM);
