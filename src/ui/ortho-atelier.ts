/* ============================================================
   Mode Orthographe — atelier du mot (couche UI, SVG).
   Le mot s'affiche en gros, aéré. L'enfant touche les lettres d'un
   piège puis « Entourer » : un rectangle arrondi pastel est tracé
   autour (couleur attribuée automatiquement, palette colorblind-safe
   Okabe-Ito). Plusieurs entourages, chevauchements permis ; toucher
   un entourage l'enlève. L'entourage est sauvegardé dans le mot.
   En contexte de correction, les lettres ratées (diff) sont soulignées.
   Voir docs/design-orthographe.md (§ Atelier du mot).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { lettresDuMot } from '../core/orthographe/exercise';
import type { Entourage, MotOrtho } from '../core/orthographe/types';

// Palette colorblind-safe (Okabe-Ito).
const PALETTE = ['#E69F00', '#56B4E9', '#009E73', '#0072B2', '#CC79A7', '#D55E00'];

interface AtelierOpts {
  onDone: () => void; // appelé au « Continuer » (après mise à jour de mot.entourage)
  diff?: boolean[]; // contexte correction : lettres (du mot) ratées à souligner
  consigne?: string;
}

let resizeHandler: (() => void) | null = null;
function cleanupResize(): void {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
}

export function renderAtelier(host: HTMLElement, mot: MotOrtho, opts: AtelierOpts): void {
  cleanupResize();
  const lettres = lettresDuMot(mot.mot);
  const entourages: Entourage[] = mot.entourage.map((e) => ({ ...e })); // copie modifiable
  let pending = new Set<number>();

  const consigne =
    opts.consigne ?? "Entoure les pièges : les endroits où on pourrait se tromper en l'écrivant.";

  host.innerHTML = `
    <div class="page ortho-run">
      <p class="ortho-run-consigne">${escapeHTML(consigne)}</p>
      <div class="atelier-stage">
        <div class="atelier-mot" id="atelierMot">${lettres
          .map(
            (l, i) =>
              `<span class="atelier-lettre" data-i="${i}"${opts.diff?.[i] ? ' data-diff="1"' : ''}>${escapeHTML(l)}</span>`,
          )
          .join('')}</div>
        <svg class="atelier-svg" id="atelierSvg"></svg>
      </div>
      <div class="atelier-actions">
        <button class="btn-primary" id="btnEntourer" disabled>✏️ Entourer</button>
        <span class="atelier-hint">Touche les lettres d'un piège, puis « Entourer ». Touche un cercle pour l'enlever.</span>
      </div>
      <div class="atelier-done"><button class="btn-primary" id="btnAtelierDone">Continuer →</button></div>
    </div>`;

  const motEl = host.querySelector('#atelierMot') as HTMLElement;
  const svg = host.querySelector('#atelierSvg') as unknown as SVGSVGElement;
  const btnEntourer = host.querySelector('#btnEntourer') as HTMLButtonElement;

  function redrawSvg(): void {
    if (!motEl.isConnected) return;
    const spans = [...motEl.querySelectorAll<HTMLElement>('.atelier-lettre')];
    const w = motEl.offsetWidth;
    const h = motEl.offsetHeight;
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const pad = 6;
    svg.innerHTML = entourages
      .map((e, idx) => {
        const a = spans[e.debut];
        const b = spans[e.fin];
        if (!a || !b) return '';
        const x = a.offsetLeft - pad;
        const y = a.offsetTop - pad;
        const rw = b.offsetLeft + b.offsetWidth - a.offsetLeft + pad * 2;
        const rh = a.offsetHeight + pad * 2;
        const col = PALETTE[e.couleur % PALETTE.length];
        return `<rect class="atelier-rect" data-idx="${idx}" x="${x}" y="${y}" width="${rw}" height="${rh}" rx="14" ry="16" fill="${col}" fill-opacity="0.22" stroke="${col}" stroke-width="2" />`;
      })
      .join('');
    svg.querySelectorAll<SVGRectElement>('.atelier-rect').forEach((r) =>
      r.addEventListener('click', () => {
        entourages.splice(Number(r.dataset.idx), 1);
        redrawSvg();
      }),
    );
  }

  function refreshPending(): void {
    motEl.querySelectorAll<HTMLElement>('.atelier-lettre').forEach((s) => {
      s.classList.toggle('sel', pending.has(Number(s.dataset.i)));
    });
    btnEntourer.disabled = pending.size === 0;
  }

  motEl.querySelectorAll<HTMLElement>('.atelier-lettre').forEach((s) =>
    s.addEventListener('click', () => {
      const i = Number(s.dataset.i);
      if (pending.has(i)) pending.delete(i);
      else pending.add(i);
      refreshPending();
    }),
  );

  btnEntourer.addEventListener('click', () => {
    if (!pending.size) return;
    const idxs = [...pending];
    entourages.push({
      debut: Math.min(...idxs),
      fin: Math.max(...idxs),
      couleur: entourages.length % PALETTE.length,
    });
    pending = new Set();
    refreshPending();
    redrawSvg();
  });

  host.querySelector('#btnAtelierDone')!.addEventListener('click', () => {
    mot.entourage = entourages;
    cleanupResize();
    opts.onDone();
  });

  redrawSvg();
  resizeHandler = () => redrawSvg();
  window.addEventListener('resize', resizeHandler);
}
