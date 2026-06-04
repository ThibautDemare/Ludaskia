/* ---------- Téléchargement d'un objet en fichier JSON ---------- */
function downloadJSON(filename,obj){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* ---------- Liste déroulante de profils (barre d'outils) ---------- */
function openProfileMenu(){ const el=document.getElementById('profileMenu'); if(!el) return; renderProfileMenu(); el.hidden=false; }
function closeProfileMenu(){ const el=document.getElementById('profileMenu'); if(el) el.hidden=true; }
function toggleProfileMenu(){ const el=document.getElementById('profileMenu'); if(!el) return; el.hidden?openProfileMenu():closeProfileMenu(); }

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

  // Bouton profil de la barre : ouvre/ferme la liste déroulante
  document.getElementById('toolbarProfile').addEventListener('click',e=>{ e.stopPropagation(); toggleProfileMenu(); });
  // Menu déroulant : bascule de profil (clic = profil actif) ou accès à la gestion
  document.getElementById('profileMenu').addEventListener('click',e=>{
    const btn=e.target.closest('button'); if(!btn) return;
    closeProfileMenu();
    if(btn.id==='pmManage'){ showProfiles(); return; }
    if(btn.dataset.uuid){ setActiveProfile(btn.dataset.uuid); route(); } // re-rendu de la vue courante avec le nouveau profil
  });
  // Clic en dehors → ferme le menu
  document.addEventListener('click',e=>{ if(!e.target.closest('#profileDD')) closeProfileMenu(); });

  // Écran de gestion des profils (délégation)
  document.getElementById('profileList').addEventListener('click',e=>{
    const btn=e.target.closest('button'); if(!btn) return;
    if(btn.id==='profileAdd'){ const n=prompt('Prénom du nouveau profil :'); if(n&&n.trim()){ addProfile(n.trim()); renderProfiles(); } return; }
    const row=e.target.closest('.profile-row'); if(!row) return;
    const uuid=row.dataset.uuid;
    switch(btn.dataset.act){
      case 'pick':   setActiveProfile(uuid); goHome(); break;
      case 'rename': { const n=prompt('Nouveau prénom :'); if(n&&n.trim()){ renameProfile(uuid,n.trim()); renderProfiles(); } break; }
      case 'emoji':  cycleProfileEmoji(uuid); renderProfiles(); break;
      case 'reset':  if(confirm('Réinitialiser toute la progression de ce profil ? (irréversible)')){ resetProfile(uuid); renderProfiles(); } break;
      case 'delete': if(confirm('Supprimer ce profil et toute sa progression ?')){ deleteProfile(uuid); renderProfiles(); } break;
    }
  });

  // Export : profils cochés → fichier JSON
  document.getElementById('btnExport').addEventListener('click',()=>{
    const uuids=[...document.querySelectorAll('#profileList .profile-check:checked')].map(c=>c.dataset.uuid);
    if(!uuids.length){ alert('Coche au moins un profil à exporter.'); return; }
    const payload=exportProfiles(uuids);
    const d=new Date().toISOString().slice(0,10);
    const slug=s=>(s||'profil').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const name=uuids.length===1?slug(payload.profiles[0].name):`${uuids.length}-profils`;
    downloadJSON(`calcul-mental-${name}-${d}.json`,payload);
  });
  // Import : fusion par UUID (écrase si plus récent, ajoute si inconnu)
  document.getElementById('btnImport').addEventListener('click',()=>document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change',e=>{
    const file=e.target.files&&e.target.files[0];
    e.target.value=''; // autorise un futur ré-import du même fichier
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{
      let payload=null; try{payload=JSON.parse(reader.result);}catch(err){}
      const res=payload&&importProfiles(payload);
      if(!res){ alert('Fichier de sauvegarde non reconnu.'); return; }
      const parts=[];
      if(res.added) parts.push(`${res.added} ajouté${res.added>1?'s':''}`);
      if(res.updated) parts.push(`${res.updated} mis à jour`);
      if(res.skipped) parts.push(`${res.skipped} ignoré${res.skipped>1?'s':''} (déjà à jour)`);
      alert('Import terminé : '+(parts.join(', ')||'aucun profil')+'.');
      renderProfiles();
    };
    reader.readAsText(file);
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
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ hideCelebration(); closeProfileMenu(); } });

  // Précédent/Suivant du navigateur → on rejoue la vue correspondante
  window.addEventListener('hashchange',route);
  // Au chargement : on affiche la vue désignée par le hash (accueil par défaut)
  route();
});
