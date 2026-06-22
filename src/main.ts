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
import './styles/figures.scss';
import './styles/profiles.scss';
import './styles/sprint.scss';
import './styles/lecon-mode.scss';
import './styles/revision.scss';
import './styles/modal.scss';
import './styles/reprise.scss';
import './styles/print.scss';
import './styles/bilan.scss';
import './styles/catalog.scss';
import './styles/francais.scss';
import './styles/orthographe.scss';
import './styles/version-update.scss';
import './styles/foret.scss';
import './styles/accessibility.scss';

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
	setPref,
	setNiveauReference,
	setNiveauMatiere,
	listProfiles,
} from './core/profiles';
import { uiAlert, uiConfirm, uiPrompt } from './ui/ui-modal';
import type { SchoolLevel } from './core/catalog';
import {
	renderProfiles,
	toggleEmojiPicker,
	closeEmojiPicker,
	paintStaticIcons,
	syncExportButton,
} from './ui/render';
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
import { closeProfileMenu, toggleProfileMenu, toggleDrawer, closeDrawer } from './ui/menu';
import { initTts } from './ui/tts';
import { maybeShowClassChoice } from './ui/onboarding';
import { initVersionCheck } from './ui/version-check';
import { installVisiblePasswordReveal } from './ui/anti-suggestion';

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

/* Rend le focus à un bouton d'action d'une ligne profil après re-rendu (le
   déclencheur d'origine a été recréé par renderProfiles). Repli sur « Nouveau
   profil » si la ligne a disparu — jamais <body> (cf. #230). */
function focusRowAction(uuid: string, act: string): void {
	const target =
		document.querySelector<HTMLElement>(`.profile-row[data-uuid="${uuid}"] [data-act="${act}"]`) ??
		document.getElementById('profileAdd');
	target?.focus();
}

/* ============================================================
   Initialisation : câblage des événements au chargement
   ============================================================ */
function wireDOM() {
	// Boutons fonctionnels au markup statique (toolbar + sauvegarde profils) :
	// injecte leurs icônes Phosphor (les libellés sont déjà dans index.html).
	paintStaticIcons();
	// Champs de réponse texte « mot de passe visible » : démasquage auto dès l'insertion
	// (texte lisible sans réactiver les suggestions du clavier mobile). Voir #139.
	installVisiblePasswordReveal();
	document.getElementById('btnVerify')!.addEventListener('click', verify);
	// Accueil : la confirmation des modes NON reprenables (sprint, révision) est
	// gérée au niveau du hashchange (couvre aussi Précédent / édition d'URL), pour
	// ne pas demander deux fois. Les exercices grille sont sauvegardés en silence.
	document.getElementById('btnHome')!.addEventListener('click', goHome);
	document.getElementById('btnPrint')!.addEventListener('click', () => {
		closeDrawer(); // Imprimer ne change pas de vue : on referme le tiroir à la main
		printAll();
	});
	// Tiroir mobile : hamburger (ouvre/ferme) + voile (ferme au tap extérieur)
	document.getElementById('toolbarBurger')!.addEventListener('click', (e) => {
		e.stopPropagation();
		toggleDrawer();
	});
	document.getElementById('toolbarScrim')!.addEventListener('click', closeDrawer);
	document.getElementById('cardLecon')!.addEventListener('click', startMatieres);
	document.getElementById('cardSprint')!.addEventListener('click', startSprint);
	document.getElementById('cardRevision')!.addEventListener('click', startRevisionEspacee);
	document.getElementById('cardBilanCustom')!.addEventListener('click', startBilanCustom);
	document.getElementById('backHome')!.addEventListener('click', goHome);
	document.getElementById('backHomeBilanCustom')!.addEventListener('click', goHome);
	document.getElementById('backHomeSprintConfig')!.addEventListener('click', goHome);
	// Navigation multi-matières : retour « d'un cran » en haut de chaque vue de la
	// hiérarchie (matières ← accueil, catégories ← matières, catégorie ← catégories).
	document.getElementById('backHomeMatieresTop')!.addEventListener('click', goHome);
	document.getElementById('backMatieresTop')!.addEventListener('click', startMatieres);
	document.getElementById('backCategorieTop')!.addEventListener('click', (e: any) => {
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
	document.getElementById('profileList')!.addEventListener('click', async (e: any) => {
		const btn = e.target.closest('button');
		if (!btn) return;
		if (btn.id === 'profileAdd') {
			const n = await uiPrompt({
				title: 'Quel est ton prénom ?',
				okLabel: "C'est parti !",
				placeholder: 'Ton prénom',
				emoji: '🎒',
			});
			if (n) {
				addProfile(n); // uiPrompt renvoie une valeur déjà « trim »ée et non vide
				applyPreferences(); // nouveau profil actif → son thème (défaut)
				renderPreferences();
				renderProfiles();
				document.getElementById('profileAdd')?.focus(); // déclencheur recréé au re-rendu
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
				const courant = listProfiles().find((p) => p.uuid === uuid)?.name ?? '';
				const n = await uiPrompt({
					title: 'Quel est ton nouveau prénom ?',
					okLabel: 'Changer mon prénom',
					defaultValue: courant,
					selectDefault: true, // pré-rempli + sélectionné : on remplace d'un trait
					emoji: '✏️',
				});
				if (n) {
					renameProfile(uuid, n);
					renderPreferences(); // le nom peut être celui du profil actif
					renderProfiles();
					focusRowAction(uuid, 'rename');
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
			case 'reset': {
				const nom = listProfiles().find((p) => p.uuid === uuid)?.name ?? 'ce profil';
				const ok = await uiConfirm({
					title: `Effacer toute la progression de ${nom} ?`,
					message: 'Tout repartira de zéro. Tu ne pourras pas la récupérer.',
					confirmLabel: 'Tout effacer',
					cancelLabel: 'Non, je garde',
					destructive: true,
					confirmIcon: 'reset',
					emoji: '🧹',
				});
				if (ok) {
					resetProfile(uuid);
					applyPreferences(); // l'XP repart à 0 → thème éventuellement réinitialisé
					renderPreferences();
					renderProfiles();
					focusRowAction(uuid, 'reset');
				}
				break;
			}
			case 'delete': {
				const nom = listProfiles().find((p) => p.uuid === uuid)?.name ?? 'ce profil';
				const ok = await uiConfirm({
					title: `Supprimer le profil de ${nom} ?`,
					message: 'Le profil et toute sa progression seront effacés.',
					confirmLabel: 'Supprimer',
					cancelLabel: 'Non, je garde',
					destructive: true,
					confirmIcon: 'trash',
					emoji: '🗑️',
				});
				if (ok) {
					deleteProfile(uuid);
					applyPreferences(); // l'actif peut avoir changé → son thème
					renderPreferences();
					renderProfiles(); // resynchronise aussi le bouton « Exporter »
					document.getElementById('profileAdd')?.focus(); // la ligne a disparu → repli explicite
				}
				break;
			}
		}
	});

	// Export : profils cochés → fichier JSON. Le bouton est désactivé tant que rien
	// n'est coché (updateExportState) — plus d'alerte une fois cliqué (#230) ; ce
	// garde-fou couvre seulement le cas limite (aucun profil).
	document.getElementById('btnExport')!.addEventListener('click', () => {
		const uuids = [...document.querySelectorAll('#profileList .profile-check:checked')].map(
			(c: any) => c.dataset.uuid,
		);
		if (!uuids.length) return;
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
	// Cocher/décocher un profil → (dés)active le bouton « Exporter » (#230). Pas de
	// re-rendu (qui re-cocherait tout) : on synchronise seulement le bouton.
	document.getElementById('profileList')!.addEventListener('change', (e: any) => {
		if (e.target?.classList?.contains('profile-check')) syncExportButton();
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
		reader.onload = async () => {
			let payload = null;
			try {
				payload = JSON.parse(reader.result as string);
			} catch (err) {}
			const res = payload && importProfiles(payload);
			if (!res) {
				await uiAlert({
					title: 'Ce fichier ne peut pas être ouvert.',
					message: 'Essaie avec un autre fichier.',
					variant: 'error',
					emoji: '⚠️',
				});
				return;
			}
			// L'import peut changer le profil actif → on reflète l'écran AVANT le message.
			applyPreferences();
			renderPreferences();
			renderProfiles(); // resynchronise aussi le bouton « Exporter »
			const pluriel = (n: number) => (n > 1 ? 's' : '');
			const lignes: string[] = [];
			if (res.added)
				lignes.push(`${res.added} profil${pluriel(res.added)} ajouté${pluriel(res.added)}`);
			if (res.updated) lignes.push(`${res.updated} profil${pluriel(res.updated)} mis à jour`);
			if (res.skipped)
				lignes.push(
					`${res.skipped} profil${pluriel(res.skipped)} ignoré${pluriel(res.skipped)} (déjà à jour)`,
				);
			await uiAlert({
				title: "C'est fait !",
				message: lignes.join('\n') || 'Aucun profil à importer.',
				emoji: '✅',
			});
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
		} else if (e.target.id === 'prefConfort') {
			setPref('confortLecture', e.target.checked);
			applyPreferences();
		} else if (e.target.id === 'prefLectureAuto') {
			setPref('lectureConsigneAuto', e.target.checked);
		} else if (e.target.id === 'prefNiveauRef') {
			// Réglage parent (#225) : classe du profil → re-rendu (les compteurs et le
			// catalogue suivent à la prochaine navigation).
			setNiveauReference(e.target.value as SchoolLevel);
			renderPreferences();
		} else if (e.target.dataset.act === 'set-niveau-matiere') {
			// Ajustement par matière ; valeur vide = « comme la classe » (héritage).
			setNiveauMatiere(
				e.target.dataset.subject,
				(e.target.value || undefined) as SchoolLevel | undefined,
			);
			renderPreferences();
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
			// La fermeture Échap des modales (récompenses, trophées, levelup, célébration)
			// est désormais possédée par leur focus-trap (modal-a11y), qui consomme
			// l'événement en capture AVANT d'arriver ici. Restent les surcouches
			// non-modales : menu profil et tiroir mobile.
			closeProfileMenu();
			closeDrawer();
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
	const revenirAuHash = (hash: string) => {
		revertingHash = true;
		location.hash = hash;
	};
	window.addEventListener('hashchange', (e: HashChangeEvent) => {
		if (revertingHash) {
			revertingHash = false;
			return;
		}
		if (quittingLosesProgress()) {
			// Le hash a DÉJÀ changé (hashchange est post-fait) et la modale est
			// asynchrone : on diffère la navigation. Si l'enfant continue, on revient
			// au hash précédent (le sprint reprend) ; s'il arrête, on rejoue la vue.
			const precedent = new URL(e.oldURL).hash || '#accueil';
			void uiConfirm({
				title: 'Tu veux arrêter ?',
				message: 'Si tu arrêtes maintenant, cet exercice ne sera pas terminé.',
				confirmLabel: 'Oui, arrêter',
				cancelLabel: "Continuer l'exercice",
				emoji: '👋',
				// Si on continue, le focus revient au déclencheur ; sinon repli stable
				// (jamais <body>) car la vue change entièrement.
				restoreFocusTo: () => document.getElementById('btnHome'),
			}).then((arreter) => (arreter ? route() : revenirAuHash(precedent)));
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

	// Onboarding : si le profil n'a pas encore de classe et que plusieurs niveaux
	// ont du contenu, on demande la classe (re-rendu de la vue courante au choix).
	maybeShowClassChoice(route);

	// Bande décorative « forêt » de pied d'accueil : SVG pré-généré, inséré dans le
	// DOM (pour que l'animation « vent » respecte l'option « animations réduites »).
	const foretEl = document.getElementById('homeForet');
	if (foretEl) {
		fetch(`${import.meta.env.BASE_URL}foret-pied.svg`)
			.then((r) => (r.ok ? r.text() : ''))
			.then((svg) => {
				if (svg) foretEl.innerHTML = svg;
			})
			.catch(() => {}); // décoration non critique : on ignore l'échec
	}
}

// (1) hook d'écriture → (2) profils → (3) câblage DOM + route initiale.
setOnDataWrite(touchActiveProfile);
initProfiles();
applyPreferences(); // thème + animations du profil actif, dès avant le 1er rendu
initTts(); // précharge les voix de synthèse (dictée best-effort)
initVersionCheck(); // auto-actualisation : recharge l'onglet quand un nouveau déploiement est en ligne
// Les scripts type="module" sont différés : si le DOM est déjà prêt, on câble
// immédiatement, sinon on attend DOMContentLoaded (parité avec l'ancien main.js).
if (document.readyState !== 'loading') wireDOM();
else document.addEventListener('DOMContentLoaded', wireDOM);
