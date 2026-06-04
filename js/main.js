/* ============================================================
   Initialisation : câblage des événements au chargement
   ============================================================ */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btnVerify').addEventListener('click',verify);
  document.getElementById('btnHome').addEventListener('click',goHome);
  document.getElementById('btnPrint').addEventListener('click',printAll);
  document.getElementById('cardComplet').addEventListener('click',startComplet);
  document.getElementById('cardExpress').addEventListener('click',startExpress);
  document.getElementById('cardLecon').addEventListener('click',showLessons);
  document.getElementById('cardSprint').addEventListener('click',startSprint);
  document.getElementById('backHome').addEventListener('click',goHome);
  document.getElementById('backHomeProfils').addEventListener('click',goHome);
  document.getElementById('printLink').addEventListener('click',printAll);

  // Barre de profils (accueil) : bascule de profil + accès à la gestion
  document.getElementById('profileBar').addEventListener('click',e=>{
    const chip=e.target.closest('.profile-chip');
    if(chip){ setActiveProfile(chip.dataset.pid); showHomeView(); return; } // déjà sur l'accueil → re-rendu direct
    if(e.target.closest('#profileManage')) showProfiles();
  });
  // Écran de gestion des profils (délégation)
  document.getElementById('profileList').addEventListener('click',e=>{
    const btn=e.target.closest('button'); if(!btn) return;
    if(btn.id==='profileAdd'){ const n=prompt('Prénom du nouveau profil :'); if(n&&n.trim()){ addProfile(n.trim()); renderProfiles(); } return; }
    const row=e.target.closest('.profile-row'); if(!row) return;
    const id=row.dataset.pid;
    switch(btn.dataset.act){
      case 'pick':   setActiveProfile(id); goHome(); break;
      case 'rename': { const n=prompt('Nouveau prénom :'); if(n&&n.trim()){ renameProfile(id,n.trim()); renderProfiles(); } break; }
      case 'emoji':  cycleProfileEmoji(id); renderProfiles(); break;
      case 'reset':  if(confirm('Réinitialiser toute la progression de ce profil ? (irréversible)')){ resetProfile(id); renderProfiles(); } break;
      case 'delete': if(confirm('Supprimer ce profil et toute sa progression ?')){ deleteProfile(id); renderProfiles(); } break;
    }
  });

  // Sélection d'une leçon dans la liste (délégation)
  document.getElementById('lessonList').addEventListener('click',e=>{
    const btn=e.target.closest('.lesson-item');
    if(btn) startLecon(Number(btn.dataset.num));
  });

  // Modale de récompense : fermeture (bouton, croix, fond, Échap)
  document.getElementById('celebrateOk').addEventListener('click',hideCelebration);
  document.getElementById('celebrateClose').addEventListener('click',hideCelebration);
  document.getElementById('celebrate').addEventListener('click',e=>{ if(e.target.id==='celebrate') hideCelebration(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') hideCelebration(); });

  // Précédent/Suivant du navigateur → on rejoue la vue correspondante
  window.addEventListener('hashchange',route);
  // Au chargement : on affiche la vue désignée par le hash (accueil par défaut)
  route();
});
