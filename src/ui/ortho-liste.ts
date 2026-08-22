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
	supprimerMot,
} from '../core/orthographe/store';
import { motsDevenusOrphelins } from '../core/orthographe/banque';
import type { MotInput, FormesAccord, VerbeConfig } from '../core/orthographe/types';
import {
	lookupConjugatedForms,
	type VerbTense,
	type FormesConjuguees,
} from '../data/francais/verbs-lookup';
import { PRONOUNS, displayPronoun } from '../data/francais/conjugaison';
import { TEMPS_LABEL, libellePronoms } from '../core/orthographe/verbes';
import { goCategorie } from './navigation';
import { dicteeDisponible } from './tts';
import { icon } from './icon';
import { uiAlert, uiConfirm } from './ui-modal';
import { enumererFr } from '../core/utils';
import { html, joindre, drapeau } from '../core/html';

interface RowData {
	mot: string;
	commeDans: string;
	formes?: FormesAccord;
	verbe?: VerbeConfig; // ligne verbe (#261) : pronoms/temps/complément préréglés
}

/* Temps proposés pour un verbe (#261). v1 : le présent seul ; la rangée de chips
   est prête à en accueillir d'autres (futur, imparfait…) sans refonte. Les libellés
   viennent de core (TEMPS_LABEL) : ce formulaire et les aperçus de mots décrivent le
   même objet, ils ne doivent pas en donner deux vocabulaires (#441). */
const TEMPS_OPTIONS: { id: VerbTense; label: string }[] = (['present'] as VerbTense[]).map(
	(id) => ({ id, label: TEMPS_LABEL[id] }),
);

/* Aperçu : jusqu'à 2 phrases générées pour les pronoms cochés (forme réelle LEFFF). */
function apercuPhrases(forms: FormesConjuguees, pronoms: number[], complement: string): string {
	const apres = complement.trim() ? ' ' + complement.trim() : '';
	return pronoms
		.slice(0, 2)
		.map((p) => `${displayPronoun(p, forms[p])}${forms[p]}${apres}`)
		.join(' · ');
}

/* Résumé compact d'un verbe configuré : « manger · je, tu, il · présent ». Même
   vocabulaire de pronoms et de temps que l'aperçu des mots (core/orthographe/verbes),
   seule la mise en forme diffère (ce formulaire sépare en « · », l'aperçu parenthèse). */
function resumeVerbe(infinitif: string, pronoms: number[], temps: VerbTense[]): string {
	const tps = temps.map((t) => TEMPS_LABEL[t]).join(', ');
	return `${infinitif || 'verbe'} · ${libellePronoms(pronoms)} · ${tps}`;
}

/* Mots cités en clair dans la confirmation ; au-delà, on compte (une modale ne doit pas
   devenir une liste à faire défiler). */
const MAX_MOTS_CITES = 8;

/* Après l'enregistrement d'une liste : les mots qu'on vient d'en retirer et que plus
   AUCUNE liste ne référence désormais deviennent invisibles pour l'adulte alors qu'ils
   restent en rotation de révision (#496). On propose donc de les supprimer pour de bon,
   en UNE fois — et non ligne à ligne au moment du retrait, où le formulaire n'est pas
   encore enregistré et où le mot peut encore être remis. Ne rien proposer est un choix
   valable : le corpus de l'année a du sens (l'orthographe est cumulative, avis pédago),
   d'où le libellé de refus explicite. Les mots d'une dictée livrée avec l'appli sont
   écartés par `motsDevenusOrphelins` (les supprimer ne tiendrait pas). */
async function proposerSuppressionOrphelins(candidats: string[]): Promise<void> {
	if (candidats.length === 0) return;
	const orphelins = motsDevenusOrphelins(loadOrtho(), candidats, dicteeDisponible());
	if (orphelins.length === 0) return;
	const noms = orphelins.map((e) => `« ${e.contexte ?? e.mot} »`);
	const reste = noms.length - MAX_MOTS_CITES;
	const liste =
		reste > 0
			? `${noms.slice(0, MAX_MOTS_CITES).join(', ')} et ${reste} autre${reste > 1 ? 's' : ''}`
			: enumererFr(noms);
	const plur = noms.length > 1;
	const ok = await uiConfirm({
		title: plur ? 'Supprimer aussi ces mots ?' : 'Supprimer aussi ce mot ?',
		message: `${liste} ${plur ? 'ne sont' : "n'est"} plus dans aucune liste. Sans suppression, ${plur ? 'ils continueront' : 'il continuera'} de revenir en révision.`,
		confirmLabel: plur ? 'Supprimer ces mots' : 'Supprimer ce mot',
		// « Non, je garde » : invariable, et c'est le libellé de refus employé partout ailleurs
		// dans l'appli (y compris par la suppression de liste, quelques lignes plus bas).
		cancelLabel: 'Non, je garde',
		destructive: true,
		confirmIcon: 'trash',
		emoji: '🗑️',
	});
	if (!ok) return;
	// Relecture au moment d'écrire : la projection ci-dessus a pu être calculée il y a
	// plusieurs secondes (le temps de la modale).
	const st = loadOrtho();
	for (const e of orphelins) supprimerMot(st, e.id);
	saveOrtho(st);
}

/** Rend le formulaire dans `el`. listeId null = création ; sinon édition. */
export function renderOrthoListeForm(el: HTMLElement, listeId: string | null): void {
	const state = loadOrtho();
	const liste = listeId ? getListe(state, listeId) : undefined;
	const editing = !!liste;

	const initialRows: RowData[] = liste
		? [
				...motsDeListe(state, liste).map((mo) => ({
					mot: mo.mot,
					commeDans: mo.commeDans ?? '',
					formes: mo.formes,
				})),
				...(liste.verbes ?? []).map((v) => ({ mot: v.infinitif, commeDans: '', verbe: v })),
			]
		: [];

	el.innerHTML = html`
    <div class="ortho-form">
      <label class="ortho-field">
        <span>Nom de la liste</span>
        <input id="orthoLabel" type="text" placeholder="ex. Mots de la semaine" />
      </label>
      <label class="ortho-field">
        <span>Date du contrôle (facultatif)</span>
        <input id="orthoDate" type="date" />
      </label>
      <div class="ortho-rows-head"><span>Mot ou verbe</span><span>Comme dans… (facultatif)</span><span></span></div>
      <div class="ortho-rows" id="orthoRows"></div>
      <p class="ortho-hint">Astuce : tu peux coller une liste de mots (un par ligne) dans la case « Mot ». Le bouton ✍️ d'une ligne ajoute, en option, le pluriel et le féminin (leçon « Les accords »). Si tu saisis un <b>verbe</b>, l'application te proposera de régler sa conjugaison (pronoms, temps, complément) pour le travailler dans une phrase.</p>
      <div class="ortho-form-actions">
        <button class="btn-primary" id="orthoSave">${icon('check')} Enregistrer</button>
        ${editing ? html`<button class="ortho-del" id="orthoDelete">${icon('trash')} Supprimer la liste</button>` : ''}
      </div>
    </div>`.balisage;

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
		inMot.setAttribute('aria-label', 'Mot ou verbe');

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
		toggle.className = 'ortho-formes-toggle' + (aFormes ? drapeau('actif') : '');
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
			f.innerHTML = html`<span>${label}</span>`.balisage;
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

		// ----- Verbe (#261) : détection + panneau de paramétrage -----
		let mode: 'mot' | 'verbe' = data.verbe ? 'verbe' : 'mot';
		let formesPresent: FormesConjuguees | null = null;

		// Barre « ce mot est un verbe ? » (mode mot, non bloquante).
		const suggest = document.createElement('button');
		suggest.type = 'button';
		suggest.className = 'ortho-verbe-suggest';
		suggest.hidden = true;

		// Barre-résumé repliable (mode verbe) : « manger · je, tu, il · présent ».
		const resumeBtn = document.createElement('button');
		resumeBtn.type = 'button';
		resumeBtn.className = 'ortho-verbe-resume';
		resumeBtn.hidden = true;
		resumeBtn.setAttribute('aria-expanded', 'false');

		const pronomsSel = new Set<number>(data.verbe ? data.verbe.pronoms : [0, 1, 2, 3, 4, 5]);
		const tempsSel = new Set<VerbTense>(data.verbe ? data.verbe.temps : ['present']);
		const verbePanel = document.createElement('div');
		verbePanel.className = 'ortho-verbe';
		verbePanel.hidden = true;
		verbePanel.innerHTML = html`
      <div class="ortho-verbe-grp">
        <span class="ortho-verbe-grp-label">Pronoms à entraîner</span>
        <div class="ortho-chips" role="group" aria-label="Pronoms à entraîner">
          ${joindre(
						PRONOUNS.map(
							(lbl, i) =>
								html`<button type="button" class="ortho-chip ortho-chip-pronom${pronomsSel.has(i) ? ' actif' : ''}" data-p="${i}" aria-pressed="${String(pronomsSel.has(i))}">${lbl}</button>`,
						),
					)}
        </div>
      </div>
      <div class="ortho-verbe-grp">
        <span class="ortho-verbe-grp-label">Temps</span>
        <div class="ortho-chips" role="group" aria-label="Temps">
          ${joindre(
						TEMPS_OPTIONS.map(
							(t) =>
								html`<button type="button" class="ortho-chip ortho-chip-temps${tempsSel.has(t.id) ? ' actif' : ''}" data-t="${t.id}" aria-pressed="${String(tempsSel.has(t.id))}">${t.label}</button>`,
						),
					)}
        </div>
      </div>
      <label class="ortho-verbe-comp">
        <span>Complément (facultatif)</span>
        <input class="ortho-complement" type="text" placeholder="une pomme" aria-label="Complément du verbe" />
      </label>
      <p class="ortho-hint ortho-verbe-aide">Choisis un complément qui marche avec tous les pronoms : « une pomme », « à la balle »… (évite « ma… », « notre… »). Tu peux le laisser vide.</p>
      <p class="ortho-verbe-apercu" aria-live="polite"></p>
      <button type="button" class="ortho-verbe-notverb">Ce n'est pas un verbe</button>`.balisage;
		(verbePanel.querySelector('.ortho-complement') as HTMLInputElement).value =
			data.verbe?.complement ?? '';

		const apercuEl = verbePanel.querySelector('.ortho-verbe-apercu') as HTMLElement;
		const complementInput = verbePanel.querySelector('.ortho-complement') as HTMLInputElement;
		const selPronoms = (): number[] =>
			[...verbePanel.querySelectorAll<HTMLElement>('.ortho-chip-pronom.actif')].map((b) =>
				Number(b.dataset.p),
			);
		const selTemps = (): VerbTense[] =>
			[...verbePanel.querySelectorAll<HTMLElement>('.ortho-chip-temps.actif')].map(
				(b) => b.dataset.t as VerbTense,
			);

		function refreshApercu(): void {
			const pr = selPronoms();
			apercuEl.textContent =
				formesPresent && pr.length ? apercuPhrases(formesPresent, pr, complementInput.value) : '';
		}
		function refreshResume(): void {
			resumeBtn.textContent = '✏️ ' + resumeVerbe(inMot.value.trim(), selPronoms(), selTemps());
		}

		function switchToVerbe(expand: boolean): void {
			mode = 'verbe';
			wrap.classList.add('is-verbe');
			suggest.hidden = true;
			panel.hidden = true; // ferme le panneau accords (exclusif)
			resumeBtn.hidden = false;
			verbePanel.hidden = !expand;
			resumeBtn.setAttribute('aria-expanded', verbePanel.hidden ? 'false' : 'true');
			refreshResume();
			if (formesPresent) refreshApercu();
			else void detect();
			ensureTrailingBlank();
			// Le bouton de suggestion qui avait le focus vient d'être masqué : on déplace
			// le focus dans le panneau (sinon il retombe sur <body>). Jamais à l'init
			// (édition d'une liste : expand=false), pour ne pas voler le focus au chargement.
			if (expand) verbePanel.querySelector<HTMLElement>('.ortho-chip')?.focus();
		}
		function switchToMot(): void {
			mode = 'mot';
			wrap.classList.remove('is-verbe');
			resumeBtn.hidden = true;
			verbePanel.hidden = true;
			if (formesPresent) showSuggest(); // toujours un verbe → on reproposse
			inMot.focus(); // « Ce n'est pas un verbe » masque le panneau : on rend le focus au champ
		}
		function showSuggest(): void {
			const v = inMot.value.trim();
			suggest.innerHTML =
				html`${icon('lightbulb')} « ${v} » est un verbe — Régler la conjugaison`.balisage;
			suggest.hidden = false;
		}

		let detectTimer: number | undefined;
		let detectSeq = 0;
		async function detect(): Promise<void> {
			const v = inMot.value.trim();
			const seq = ++detectSeq;
			if (!v) {
				formesPresent = null;
				suggest.hidden = true;
				return;
			}
			const forms = await lookupConjugatedForms(v, 'present');
			// Jeton de séquence : une détection plus récente (frappe rapide, input+blur)
			// a pris la main → on abandonne ce résultat périmé.
			if (seq !== detectSeq || inMot.value.trim() !== v) return;
			formesPresent = forms;
			if (mode === 'verbe') refreshApercu();
			else if (forms) showSuggest();
			else suggest.hidden = true;
		}
		const scheduleDetect = (): void => {
			window.clearTimeout(detectTimer);
			detectTimer = window.setTimeout(() => void detect(), 450);
		};

		inMot.addEventListener('input', () => {
			ensureTrailingBlank();
			if (mode === 'mot') suggest.hidden = true;
			else refreshResume();
			scheduleDetect();
		});
		inMot.addEventListener('blur', () => void detect());
		inMot.addEventListener('paste', onPasteMot);
		toggle.addEventListener('click', () => {
			panel.hidden = !panel.hidden;
			toggle.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
		});
		del.addEventListener('click', () => {
			wrap.remove();
			ensureTrailingBlank();
		});
		suggest.addEventListener('click', () => switchToVerbe(true));
		resumeBtn.addEventListener('click', () => {
			verbePanel.hidden = !verbePanel.hidden;
			resumeBtn.setAttribute('aria-expanded', verbePanel.hidden ? 'false' : 'true');
		});
		verbePanel.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (target.closest('.ortho-verbe-notverb')) {
				switchToMot();
				return;
			}
			const chip = target.closest('.ortho-chip') as HTMLElement | null;
			if (!chip) return;
			const grp = chip.classList.contains('ortho-chip-pronom')
				? '.ortho-chip-pronom'
				: '.ortho-chip-temps';
			const actifs = verbePanel.querySelectorAll(grp + '.actif');
			if (chip.classList.contains('actif') && actifs.length <= 1) return; // garde-fou : au moins 1
			chip.classList.toggle('actif');
			chip.setAttribute('aria-pressed', chip.classList.contains('actif') ? 'true' : 'false');
			refreshApercu();
			refreshResume();
		});
		complementInput.addEventListener('input', refreshApercu);

		wrap.append(row, suggest, resumeBtn, panel, verbePanel);
		if (mode === 'verbe') switchToVerbe(false); // édition d'un verbe : replié, résumé affiché
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
		// Deux passes sur les lignes : mots classiques d'un côté, verbes de l'autre (#261).
		const mots: MotInput[] = [];
		const verbes: VerbeConfig[] = [];
		for (const row of [...rowsEl.querySelectorAll('.ortho-row-wrap')]) {
			const motVal = val(row, '.ortho-mot');
			if (!motVal) continue;
			if (row.classList.contains('is-verbe')) {
				const pronoms = [...row.querySelectorAll<HTMLElement>('.ortho-chip-pronom.actif')].map(
					(b) => Number(b.dataset.p),
				);
				const temps = [...row.querySelectorAll<HTMLElement>('.ortho-chip-temps.actif')].map(
					(b) => b.dataset.t as VerbTense,
				);
				verbes.push({
					kind: 'verbe',
					infinitif: motVal,
					pronoms,
					temps,
					complement: val(row, '.ortho-complement') || undefined,
				});
				continue;
			}
			const formes: FormesAccord = {
				mascSing: val(row, '.ortho-f-ms') || undefined,
				femSing: val(row, '.ortho-f-fs') || undefined,
				mascPlur: val(row, '.ortho-f-mp') || undefined,
				femPlur: val(row, '.ortho-f-fp') || undefined,
			};
			const aFormes = formes.mascSing || formes.femSing || formes.mascPlur || formes.femPlur;
			mots.push({
				mot: motVal,
				commeDans: val(row, '.ortho-comme') || undefined,
				formes: aFormes ? formes : undefined,
			});
		}
		if (!mots.length && !verbes.length) {
			await uiAlert({ title: 'Écris au moins un mot ou un verbe.', emoji: '✏️' });
			return;
		}
		const st = loadOrtho();
		if (editing && listeId) {
			// Mots référencés AVANT la mise à jour : ceux qu'on vient de retirer du formulaire
			// n'appartiendront peut-être plus à aucune liste, et resteraient alors en révision
			// à l'insu de l'adulte (#496) — on lui propose de s'en débarrasser pour de bon.
			const avant = [...(getListe(st, listeId)?.motIds ?? [])];
			updateListe(st, listeId, label, mots, date, verbes);
			saveOrtho(st);
			await proposerSuppressionOrphelins(avant);
		} else {
			createListe(st, label, mots, date, verbes);
			saveOrtho(st);
		}
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
