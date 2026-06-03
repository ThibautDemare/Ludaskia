/* ============================================================
   Chronomètre de la barre d'outils
   ============================================================ */
let timer=null, startTs=0, elapsedMs=0, running=false;
function startChrono(){
  elapsedMs=0; startTs=Date.now(); running=true;
  const el=document.getElementById('chrono');
  el.classList.remove('hidden'); el.textContent='00:00';
  clearInterval(timer);
  timer=setInterval(()=>{ if(running){el.textContent=fmt(Date.now()-startTs);} },250);
}
function stopChrono(){
  if(!running) return elapsedMs;
  running=false; elapsedMs=Date.now()-startTs; clearInterval(timer);
  document.getElementById('chrono').textContent=fmt(elapsedMs);
  return elapsedMs;
}
function resetChrono(){
  running=false; clearInterval(timer); elapsedMs=0;
  const el=document.getElementById('chrono'); el.classList.add('hidden'); el.textContent='00:00';
}
