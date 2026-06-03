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
  document.getElementById('backHome').addEventListener('click',goHome);
  document.getElementById('printLink').addEventListener('click',printAll);

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
