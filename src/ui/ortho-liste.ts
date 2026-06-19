/* ============================================================
   Mode Orthographe — formulaire de création/édition d'une liste.
   Saisie en tableau dynamique : chaque ligne = un champ « mot » + un
   champ « comme dans… » + un panneau dépliable « accords » (facultatif :
   les 4 formes fléchies masc/fém × sing/plur, #109). Une ligne vide est
   toujours présente en bas (elle apparaît dès qu'on remplit la dernière).
   Un copier-coller multi-lignes éclate chaque ligne dans son propre champ.
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
import type { MotInput, FormesAccord } from '../core/orthographe/types';
import { goCategorie } from './navigation';
import { icon } from './icon';
import { uiAlert, uiConfirm } from './ui-modal';

interface RowData {
	mot: string;
	commeDans: string;
	formes?: FormesAccord;
}

/** Rend le formulaire dans `el`. listeId null = création ; sinon édition. */
export function renderOrthoListeForm(el: HTMLElement, listeId: string | null): void {
	const state = loadOrtho();
	const liste = listeId ? getListe(state, listeId) : undefined;
	const editing = !!liste;

	const initialRows: RowData[] = liste
		? motsDeListe(state, liste).map((mo) => ({
				mot: mo.mot,
				commeDans: mo.commeDans ?? '',
				formes: mo.formes,
			}))
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
      <p class="ortho-hint">Astuce : tu peux coller une liste de mots (un par ligne) dans la case « Mot ». Le bouton ✍️ d'une ligne ajoute, en option, le pluriel et le féminin (leçon « Les accords »).</p>
      <div class="ortho-form-actions">
        <button class="btn-primary" id="orthoSave">${icon('check')} Enregistrer</button>
        ${editing ? `<button class="ortho-del" id="orthoDelete">${icon('trash')} Supprimer la liste</button>` : ''}
      </div>
    </div>`;

	(el.querySelector('#orthoLabel') as HTMLInputElement).value = liste?.label ?? '';
	(el.querySelector('#orthoDate') as HTMLInputElement).value = liste?.dateControle ?? '';
	const rowsEl = el.querySelector('#orthoRows') as HTMLElement;

	function makeRow(data: RowData = { mot: '', commeDans: '' }): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className = 'ortho-row-wrap';

		const row = document.createElement('div');
		row.className = 'ortho-row';

		const inMot = document.createElement('input');
		inMot.className = 'ortho-mot';
		inMot.type = 'text';
		inMot.value = data.mot;
		inMot.setAttribute('aria-label', 'Mot');

		const inComme = document.createElement('input');
		inComme.className = 'ortho-comme';
		inComme.type = 'text';
		inComme.value = data.commeDans;
		inComme.placeholder = 'comme dans…';
		inComme.setAttribute('aria-label', 'Comme dans');

		const aFormes = !!(
			data.formes &&
			(data.formes.mascSing || data.formes.femSing || data.formes.mascPlur || data.formes.femPlur)
		);

		const toggle = document.createElement('button');
		toggle.className = 'ortho-formes-toggle' + (aFormes ? ' actif' : '');
		toggle.type = 'button';
		toggle.textContent = '✍️';
		toggle.title = 'Pluriel et féminin (facultatif)';
		toggle.setAttribute('aria-label', 'Ajouter le pluriel et le féminin');
		toggle.setAttribute('aria-expanded', aFormes ? 'true' : 'false');

		const del = document.createElement('button');
		del.className = 'ortho-row-del';
		del.type = 'button';
		del.textContent = '×';
		del.setAttribute('aria-label', 'Supprimer la ligne');

		row.append(inMot, inComme, toggle, del);

		// Panneau « accords » : 4 formes fléchies facultatives.
		const panel = document.createElement('div');
		panel.className = 'ortho-formes';
		panel.hidden = !aFormes;
		const mkForme = (cls: string, label: string, ph: string, val?: string) => {
			const f = document.createElement('label');
			f.className = 'ortho-forme';
			f.innerHTML = `<span>${label}</span>`;
			const inp = document.createElement('input');
			inp.className = cls;
			inp.type = 'text';
			inp.value = val ?? '';
			inp.placeholder = ph;
			inp.setAttribute('aria-label', label);
			f.appendChild(inp);
			return f;
		};
		panel.append(
			mkForme('ortho-f-ms', 'Masculin singulier', 'grand', data.formes?.mascSing),
			mkForme('ortho-f-fs', 'Féminin singulier', 'grande', data.formes?.femSing),
			mkForme('ortho-f-mp', 'Masculin pluriel', 'grands', data.formes?.mascPlur),
			mkForme('ortho-f-fp', 'Féminin pluriel', 'grandes', data.formes?.femPlur),
		);

		inMot.addEventListener('input', ensureTrailingBlank);
		inMot.addEventListener('paste', onPasteMot);
		toggle.addEventListener('click', () => {
			panel.hidden = !panel.hidden;
			toggle.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
		});
		del.addEventListener('click', () => {
			wrap.remove();
			ensureTrailingBlank();
		});

		wrap.append(row, panel);
		return wrap;
	}

	// Garantit qu'une (et une seule) ligne vide est présente en bas.
	function ensureTrailingBlank(): void {
		const rows = [...rowsEl.querySelectorAll('.ortho-row-wrap')];
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
		const wrap = target.closest('.ortho-row-wrap') as HTMLElement;
		target.value = lignes[0];
		let after: Element = wrap;
		for (const mot of lignes.slice(1)) {
			const r = makeRow({ mot, commeDans: '' });
			after.after(r);
			after = r;
		}
		ensureTrailingBlank();
	}

	initialRows.forEach((r) => rowsEl.appendChild(makeRow(r)));
	ensureTrailingBlank();

	el.querySelector('#orthoSave')!.addEventListener('click', async () => {
		const label =
			(el.querySelector('#orthoLabel') as HTMLInputElement).value.trim() || 'Liste de mots';
		const date = (el.querySelector('#orthoDate') as HTMLInputElement).value || undefined;
		const val = (row: Element, cls: string) =>
			(row.querySelector(cls) as HTMLInputElement | null)?.value.trim() ?? '';
		const mots: MotInput[] = [...rowsEl.querySelectorAll('.ortho-row-wrap')]
			.map((row) => {
				const formes: FormesAccord = {
					mascSing: val(row, '.ortho-f-ms') || undefined,
					femSing: val(row, '.ortho-f-fs') || undefined,
					mascPlur: val(row, '.ortho-f-mp') || undefined,
					femPlur: val(row, '.ortho-f-fp') || undefined,
				};
				const aFormes = formes.mascSing || formes.femSing || formes.mascPlur || formes.femPlur;
				return {
					mot: val(row, '.ortho-mot'),
					commeDans: val(row, '.ortho-comme') || undefined,
					formes: aFormes ? formes : undefined,
				};
			})
			.filter((r) => r.mot !== '');
		if (!mots.length) {
			await uiAlert({ title: 'Écris au moins un mot.', emoji: '✏️' });
			return;
		}
		const st = loadOrtho();
		if (editing && listeId) updateListe(st, listeId, label, mots, date);
		else createListe(st, label, mots, date);
		saveOrtho(st);
		goCategorie(ORTHO_CATEGORY_ID);
	});

	if (editing && listeId) {
		el.querySelector('#orthoDelete')!.addEventListener('click', async () => {
			const ok = await uiConfirm({
				title: 'Supprimer cette liste ?',
				message: 'Les mots resteront dans la banque.',
				confirmLabel: 'Supprimer',
				cancelLabel: 'Non, je garde',
				destructive: true,
				confirmIcon: 'trash',
				emoji: '🗑️',
			});
			if (!ok) return;
			const st = loadOrtho();
			deleteListe(st, listeId);
			saveOrtho(st);
			goCategorie(ORTHO_CATEGORY_ID);
		});
	}
}
