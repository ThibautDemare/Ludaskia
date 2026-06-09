/* ============================================================
   Point d'entrée (ES modules) : import des styles, initialisation
   dans l'ordre (hook d'écriture → profils → câblage DOM → route).
   ============================================================ */
import './styles/base.scss';
import './styles/toolbar.scss';
import './styles/home.scss';
import './styles/sheets.scss';
import './styles/gamification.scss';
import './styles/lessons.scss';
import './styles/profiles.scss';
import './styles/sprint.scss';
import './styles/modal.scss';
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
  route,
  goHome,
  showProfiles,
  startSprint,
  startBilanCustom,
  startMatieres,
  goCategories,
  goCategorie,
  startLecon,
} from './ui/navigation';
import { ORTHO_CATEGORY_ID } from './core/catalog';
import { verify, printAll } from './ui/session';
import { hideCelebration, hideLevelUp } from './ui/effects';
import { closeProfileMenu, toggleProfileMenu } from './ui/menu';
import { initTts } from './ui/tts';

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
  document.getElementById('btnHome')!.addEventListener('click', goHome);
  document.getElementById('btnPrint')!.addEventListener('click', printAll);
  document.getElementById('cardLecon')!.addEventListener('click', startMatieres);
  document.getElementById('cardSprint')!.addEventListener('click', startSprint);
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
          renderProfiles();
        }
        break;
      case 'delete':
        if (confirm('Supprimer ce profil et toute sa progression ?')) {
          deleteProfile(uuid);
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
      renderProfiles();
    };
    reader.readAsText(file);
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
      closeProfileMenu();
    }
  });

  // Précédent/Suivant du navigateur → on rejoue la vue correspondante
  window.addEventListener('hashchange', route);
  // Au chargement : on affiche la vue désignée par le hash (accueil par défaut)
  route();
}

// (1) hook d'écriture → (2) profils → (3) câblage DOM + route initiale.
setOnDataWrite(touchActiveProfile);
initProfiles();
initTts(); // précharge les voix de synthèse (dictée best-effort)
// Les scripts type="module" sont différés : si le DOM est déjà prêt, on câble
// immédiatement, sinon on attend DOMContentLoaded (parité avec l'ancien main.js).
if (document.readyState !== 'loading') wireDOM();
else document.addEventListener('DOMContentLoaded', wireDOM);
