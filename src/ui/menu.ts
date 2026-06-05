/* ============================================================
   Liste déroulante de profils (barre d'outils)
   ------------------------------------------------------------
   Extrait de l'ancien main.js : ces helpers sont utilisés par la
   navigation (closeProfileMenu dans setToolbar) et par le câblage
   d'événements de main.ts. Isolés ici pour éviter une dépendance
   circulaire lourde entre navigation et l'entrée.
   ============================================================ */
import { renderProfileMenu } from './render';

export function openProfileMenu(){ const el=document.getElementById('profileMenu'); if(!el) return; renderProfileMenu(); el.hidden=false; }
export function closeProfileMenu(){ const el=document.getElementById('profileMenu'); if(el) el.hidden=true; }
export function toggleProfileMenu(){ const el=document.getElementById('profileMenu'); if(!el) return; el.hidden?openProfileMenu():closeProfileMenu(); }
