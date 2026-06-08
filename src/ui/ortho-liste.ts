/* ============================================================
   Mode Orthographe — formulaire de création/édition d'une liste.
   Saisie en tableau dynamique : chaque ligne = un champ « mot » + un
   champ « comme dans… ». Une ligne vide est toujours présente en bas
   (elle apparaît dès qu'on remplit la dernière). Un copier-coller
   multi-lignes éclate chaque ligne dans son propre champ « mot ».
   ============================================================ */
import { ORTHO_CATEGORY_ID } from '../core/catalog';
import {
  loadOrtho,
  saveOrtho,
  createListe,
  updateListe,
  deleteListe,
  getListe,
  motsDeListe,
} from '../core/orthographe/store';
import type { MotInput } from '../core/orthographe/types';
import { goCategorie } from './navigation';

/** Rend le formulaire dans `el`. listeId null = création ; sinon édition. */
export function renderOrthoListeForm(el: HTMLElement, listeId: string | null): void {
  const state = loadOrtho();
  const liste = listeId ? getListe(state, listeId) : undefined;
  const editing = !!liste;

  const initialRows = liste
    ? motsDeListe(state, liste).map((mo) => ({ mot: mo.mot, commeDans: mo.commeDans ?? '' }))
    : [];

  el.innerHTML = `
    <div class="ortho-form">
      <label class="ortho-field">
        <span>Nom de la liste</span>
        <input id="orthoLabel" type="text" placeholder="ex. Mots de la semaine" />
      </label>
      <label class="ortho-field">
        <span>Date du contrôle (facultatif)</span>
        <input id="orthoDate" type="date" />
      </label>
      <div class="ortho-rows-head"><span>Mot</span><span>Comme dans… (facultatif)</span><span></span></div>
      <div class="ortho-rows" id="orthoRows"></div>
      <p class="ortho-hint">Astuce : tu peux coller une liste de mots (un par ligne) dans la case « Mot ».</p>
      <div class="ortho-form-actions">
        <button class="btn-primary" id="orthoSave">💾 Enregistrer</button>
        ${editing ? '<button class="ortho-del" id="orthoDelete">🗑 Supprimer la liste</button>' : ''}
      </div>
    </div>`;

  (el.querySelector('#orthoLabel') as HTMLInputElement).value = liste?.label ?? '';
  (el.querySelector('#orthoDate') as HTMLInputElement).value = liste?.dateControle ?? '';
  const rowsEl = el.querySelector('#orthoRows') as HTMLElement;

  function makeRow(mot = '', commeDans = ''): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ortho-row';

    const inMot = document.createElement('input');
    inMot.className = 'ortho-mot';
    inMot.type = 'text';
    inMot.value = mot;
    inMot.setAttribute('aria-label', 'Mot');

    const inComme = document.createElement('input');
    inComme.className = 'ortho-comme';
    inComme.type = 'text';
    inComme.value = commeDans;
    inComme.placeholder = 'comme dans…';
    inComme.setAttribute('aria-label', 'Comme dans');

    const del = document.createElement('button');
    del.className = 'ortho-row-del';
    del.type = 'button';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Supprimer la ligne');

    inMot.addEventListener('input', ensureTrailingBlank);
    inMot.addEventListener('paste', onPasteMot);
    del.addEventListener('click', () => {
      row.remove();
      ensureTrailingBlank();
    });

    row.append(inMot, inComme, del);
    return row;
  }

  // Garantit qu'une (et une seule) ligne vide est présente en bas.
  function ensureTrailingBlank(): void {
    const rows = [...rowsEl.querySelectorAll('.ortho-row')];
    const last = rows[rows.length - 1] as HTMLElement | undefined;
    const lastMot = last ? (last.querySelector('.ortho-mot') as HTMLInputElement).value.trim() : '';
    if (!last || lastMot !== '') rowsEl.appendChild(makeRow());
  }

  // Collage multi-lignes : une ligne de texte → un champ « mot ».
  function onPasteMot(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData('text') ?? '';
    if (!/[\r\n]/.test(text)) return; // collage simple → comportement par défaut
    e.preventDefault();
    const lignes = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s !== '');
    if (!lignes.length) return;
    const target = e.target as HTMLInputElement;
    const row = target.closest('.ortho-row') as HTMLElement;
    target.value = lignes[0];
    let after: Element = row;
    for (const mot of lignes.slice(1)) {
      const r = makeRow(mot);
      after.after(r);
      after = r;
    }
    ensureTrailingBlank();
  }

  initialRows.forEach((r) => rowsEl.appendChild(makeRow(r.mot, r.commeDans)));
  ensureTrailingBlank();

  el.querySelector('#orthoSave')!.addEventListener('click', () => {
    const label =
      (el.querySelector('#orthoLabel') as HTMLInputElement).value.trim() || 'Liste de mots';
    const date = (el.querySelector('#orthoDate') as HTMLInputElement).value || undefined;
    const mots: MotInput[] = [...rowsEl.querySelectorAll('.ortho-row')]
      .map((row) => ({
        mot: (row.querySelector('.ortho-mot') as HTMLInputElement).value.trim(),
        comme: (row.querySelector('.ortho-comme') as HTMLInputElement).value.trim(),
      }))
      .filter((r) => r.mot !== '')
      .map((r) => ({ mot: r.mot, commeDans: r.comme || undefined }));
    if (!mots.length) {
      alert('Ajoute au moins un mot.');
      return;
    }
    const st = loadOrtho();
    if (editing && listeId) updateListe(st, listeId, label, mots, date);
    else createListe(st, label, mots, date);
    saveOrtho(st);
    goCategorie(ORTHO_CATEGORY_ID);
  });

  if (editing && listeId) {
    el.querySelector('#orthoDelete')!.addEventListener('click', () => {
      if (!confirm('Supprimer cette liste ? (les mots restent dans la banque)')) return;
      const st = loadOrtho();
      deleteListe(st, listeId);
      saveOrtho(st);
      goCategorie(ORTHO_CATEGORY_ID);
    });
  }
}
