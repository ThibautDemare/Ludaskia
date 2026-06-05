/* ============================================================
   Chronomètre de la barre d'outils
   ============================================================ */
import { fmt } from '../core/utils';

let timer = null,
  startTs = 0,
  elapsedMs = 0,
  running = false;
// Le mode sprint réutilise/réassigne le même handle d'intervalle : accesseurs dédiés.
export const getTimer = () => timer;
export const setTimer = (v) => {
  timer = v;
};
export function startChrono() {
  elapsedMs = 0;
  startTs = Date.now();
  running = true;
  const el = document.getElementById('chrono');
  el.classList.remove('hidden');
  el.textContent = '00:00';
  clearInterval(timer);
  timer = setInterval(() => {
    if (running) {
      el.textContent = fmt(Date.now() - startTs);
    }
  }, 250);
}
export function stopChrono() {
  if (!running) return elapsedMs;
  running = false;
  elapsedMs = Date.now() - startTs;
  clearInterval(timer);
  document.getElementById('chrono').textContent = fmt(elapsedMs);
  return elapsedMs;
}
export function resetChrono() {
  running = false;
  clearInterval(timer);
  elapsedMs = 0;
  const el = document.getElementById('chrono');
  el.classList.add('hidden');
  el.textContent = '00:00';
}
