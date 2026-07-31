/* ============================================================
   Interactions « tuiles » mutualisées (#345) — le widget commun aux trois
   formats à tuiles, partagé par les runners de leçon (ui/lecon-tuiles.ts,
   lecon-ordre.ts, lecon-tri.ts) ET par le mode Révision (ui/revision.ts), qui
   en réimplémentaient chacun une copie. On unifie ici :
     - « tuile »  : amener LA bonne tuile (signe <, =, > ou nombre) dans une case ;
     - « ordre »  : ranger les tuiles-mots dans des cases numérotées ;
     - « tri »    : ranger les tuiles-mots dans deux colonnes-thèmes.
   Chaque widget gère le rendu, le TAP (fiable au doigt) et le GLISSER-DÉPOSER
   (souris/desktop), la (dé)sélection, l'activation du bouton « Vérifier », et
   surtout — à la validation — le FIGEAGE avec marques ✓/✗ (couleur + icône, pour
   le daltonisme). Les marques étaient absentes en révision (#345, divergence
   active) : elles sont désormais produites pour les deux contextes.

   L'appelant garde le « chrome » (libellé de leçon / consigne, bouton Vérifier,
   feedback, enchaînement) : le binder n'expose que `verify()` (qui fige + marque
   + renvoie la justesse) et notifie l'état de complétude via `onState`, pour que
   l'appelant active/désactive son propre bouton. Le runner affiche alors son
   résultat local ; la révision enregistre le grade dans sa session SR.
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { wrapGrandsNombres } from '../core/nombres';
import { ttsAttr } from '../core/tts-text';

/* Données d'un widget, par nature. Reprend les champs des items générés par le
   moteur (ExerciseType.generate). */
export type TuileSpec =
	| { kind: 'tuile'; question: string; answer: string; tuiles: string[]; parle?: string }
	| { kind: 'ordre'; question: string; ordre: string[]; tuiles: string[] }
	| {
			kind: 'tri';
			question: string;
			categories: [string, string];
			mots: { mot: string; cat: 0 | 1 }[];
	  };

export interface TuileOptions {
	/* Présentation : 'lecon' enveloppe les grands nombres (.bignum, #240) et place
	   l'énoncé en `.sprint-q` ; 'revision' n'enveloppe pas (l'énoncé y est lu tel
	   quel par les specs) et place l'énoncé en `.rev-q`. */
	variant: 'lecon' | 'revision';
	/* Notifié après chaque interaction avec la complétude de la réponse : l'appelant
	   (dé)active alors son bouton « Vérifier ». Non appelé une fois la réponse figée. */
	onState: (complete: boolean) => void;
}

/* Réponse POSÉE par l'enfant, par nature de widget — pour le journal d'erreurs (#391).
   Lue par les runners après `verify()` afin de journaliser ce que l'enfant a réellement
   proposé (tuile placée, ordre proposé, colonne choisie par mot). */
export type TuileReponse =
	| { kind: 'tuile'; posee: string | null } // libellé de la tuile placée (null si aucune)
	| { kind: 'ordre'; propose: string[] } // suite proposée, dans l'ordre des cases
	| { kind: 'tri'; placement: Record<string, 0 | 1> } // colonne choisie par mot
	// Appariement (#392) : le lien posé pour chaque mot de gauche (null = laissé sans lien).
	| { kind: 'appariement'; liens: { gauche: string; droite: string | null }[] };

export interface TuileController {
	/* Fige le widget, applique les marques ✓/✗, renvoie si la réponse est juste.
	   Idempotent : un second appel renvoie le même verdict sans re-marquer. */
	verify(): boolean;
	/* Réponse posée par l'enfant (état courant), pour le journal d'erreurs (#391).
	   Implémentée par tous les widgets journalisés (tuiles, ordre, tri, appariement) ;
	   reste OPTIONNELLE pour qu'un futur widget puisse être monté avant d'avoir sa
	   représentation d'erreur (les appelants gardent donc leur repli). */
	reponse?(): TuileReponse;
}

/* Point d'entrée unique (#345). Remplace le placeholder `[data-tuile-mount]`
   présent dans `root` par le widget (insertion À PLAT, sans wrapper), câble les
   interactions, et renvoie le contrôleur. */
export function bindTuileInteraction(
	root: HTMLElement,
	spec: TuileSpec,
	opts: TuileOptions,
): TuileController {
	switch (spec.kind) {
		case 'tuile':
			return bindSlot(root, spec, opts);
		case 'ordre':
			return bindOrdre(root, spec, opts);
		case 'tri':
			return bindTri(root, spec, opts);
	}
}

/* Insère le markup du widget à la place du placeholder, à plat (outerHTML →
   pas de div d'emballage qui perturberait la mise en page existante). */
function mountWidget(root: HTMLElement, html: string): void {
	const mount = root.querySelector('[data-tuile-mount]');
	if (mount) mount.outerHTML = html;
}

/* Une tuile du bac (réutilisée par les trois widgets). `cls` = classes propres au
   widget ; `wrap` enveloppe les grands nombres en .bignum (leçon de comparaison) ;
   `ariaLabel` = libellé vocal explicite (« Ranger le mot X ») quand le texte seul ne
   suffit pas — sinon le lecteur d'écran annonce le contenu du bouton. */
function tuileBtn(
	val: string,
	cls: string,
	opts: { used: boolean; frozen: boolean; wrap: boolean; ariaLabel?: string },
): string {
	const inner = opts.wrap ? wrapGrandsNombres(escapeHTML(val)) : escapeHTML(val);
	const usedCls = opts.used ? ' tuile-used' : '';
	const attrs = opts.used || opts.frozen ? ' disabled' : ' draggable="true"';
	const aria = opts.ariaLabel ? ` aria-label="${escapeHTML(opts.ariaLabel)}"` : '';
	return `<button type="button" class="tuile ${cls}${usedCls}" data-val="${escapeHTML(val)}"${aria}${attrs}>${inner}</button>`;
}

/* ---------- « tuile » : amener LA bonne tuile dans la case ---------- */
function bindSlot(
	root: HTMLElement,
	spec: Extract<TuileSpec, { kind: 'tuile' }>,
	opts: TuileOptions,
): TuileController {
	const wrap = opts.variant === 'lecon';
	const qClass = opts.variant === 'lecon' ? 'sprint-q' : 'rev-q';
	const enonceInner = (
		wrap ? wrapGrandsNombres(escapeHTML(spec.question)) : escapeHTML(spec.question)
	).replace(
		'@',
		'<button type="button" class="ltui-slot" id="ltuiSlot" aria-label="Emplacement de la réponse"></button>',
	);
	mountWidget(
		root,
		`<p class="ltui-consigne">Amène la bonne tuile dans la case (tape-la ou glisse-la).</p>
    <div class="${qClass} ltui-enonce"${ttsAttr(spec.parle ?? spec.question)}>${enonceInner}</div>
    <div class="ltui-bac" id="ltuiBac"></div>`,
	);
	const slot = root.querySelector('#ltuiSlot') as HTMLElement;
	const bac = root.querySelector('#ltuiBac') as HTMLElement;

	let placed: string | null = null;
	let verdict: boolean | null = null; // null tant que non validé
	const frozen = () => verdict !== null;

	function redraw() {
		slot.textContent = placed ?? '';
		slot.classList.toggle('rempli', placed !== null);
		slot.classList.toggle('correct', verdict === true);
		slot.classList.toggle('wrong', verdict === false);
		bac.innerHTML = spec.tuiles
			.map((t) => tuileBtn(t, 'ltui-tuile', { used: t === placed, frozen: frozen(), wrap }))
			.join('');
		bac.querySelectorAll<HTMLButtonElement>('.ltui-tuile').forEach((btn) => {
			const val = btn.dataset.val!;
			btn.addEventListener('click', () => place(val));
			btn.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', val));
		});
		if (!frozen()) opts.onState(placed !== null);
	}
	function place(val: string | null) {
		if (frozen()) return;
		placed = val;
		redraw();
	}
	slot.addEventListener('dragover', (e) => {
		if (!frozen()) e.preventDefault();
	});
	slot.addEventListener('drop', (e) => {
		e.preventDefault();
		const val = e.dataTransfer?.getData('text/plain');
		if (val) place(val);
	});
	slot.addEventListener('click', () => {
		if (placed !== null) place(null); // retirer la tuile posée
	});
	redraw();

	return {
		verify() {
			if (frozen()) return verdict!;
			verdict = placed === spec.answer; // libellés exacts (signe ou nombre)
			redraw();
			return verdict;
		},
		reponse: () => ({ kind: 'tuile', posee: placed }),
	};
}

/* ---------- « ordre » : ranger les tuiles dans des cases numérotées ---------- */
function bindOrdre(
	root: HTMLElement,
	spec: Extract<TuileSpec, { kind: 'ordre' }>,
	opts: TuileOptions,
): TuileController {
	mountWidget(
		root,
		`<div class="lord-seq" id="lordSeq"></div>
    <p class="ltui-consigne">Tape les mots dans l'ordre (ou glisse-les dans les cases).</p>
    <div class="ltui-bac" id="lordBac"></div>`,
	);
	const seq = root.querySelector('#lordSeq') as HTMLElement;
	const bac = root.querySelector('#lordBac') as HTMLElement;

	const placed: string[] = [];
	let frozen = false;

	function redraw() {
		seq.innerHTML = spec.ordre
			.map((_, i) => {
				const mot = placed[i];
				const rempli = mot !== undefined;
				const ok = rempli && mot === spec.ordre[i];
				const etat = frozen && rempli ? (ok ? ' correct' : ' wrong') : '';
				const mark =
					frozen && rempli
						? `<span class="lord-mark" aria-hidden="true">${ok ? '✓' : '✗'}</span>`
						: '';
				// Une fois figée, l'aria-label porte le verdict juste/faux (les marques ✓/✗
				// sont en aria-hidden) → un lecteur d'écran peut relire case par case (#358).
				const label = !rempli
					? `Position ${i + 1}, vide`
					: frozen
						? `Position ${i + 1} : ${escapeHTML(mot)}, ${ok ? 'correct' : 'incorrect'}`
						: `Position ${i + 1} : ${escapeHTML(mot)}, taper pour retirer`;
				const dis = !rempli || frozen ? ' disabled' : '';
				return `<button type="button" class="lord-cell${rempli ? ' rempli' : ''}${etat}" data-pos="${i}" aria-label="${label}"${dis}>
        <span class="lord-num" aria-hidden="true">${i + 1}</span>
        <span class="lord-mot">${rempli ? escapeHTML(mot) : ''}</span>${mark}
      </button>`;
			})
			.join('');
		if (!frozen) {
			seq.querySelectorAll<HTMLButtonElement>('.lord-cell.rempli').forEach((cell) => {
				cell.addEventListener('click', () => retirer(Number(cell.dataset.pos)));
			});
		}
		bac.innerHTML = spec.tuiles
			.map((t) =>
				tuileBtn(t, 'lord-tuile', {
					used: placed.includes(t),
					frozen,
					wrap: false,
					ariaLabel: `Ranger le mot ${t}`,
				}),
			)
			.join('');
		if (!frozen) {
			bac.querySelectorAll<HTMLButtonElement>('.lord-tuile:not(.tuile-used)').forEach((btn) => {
				const val = btn.dataset.val!;
				btn.addEventListener('click', () => poser(val));
				btn.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', val));
			});
		}
		if (!frozen) opts.onState(placed.length === spec.ordre.length);
	}
	function poser(val: string) {
		if (frozen || placed.length >= spec.ordre.length || placed.includes(val)) return;
		placed.push(val);
		redraw();
	}
	function retirer(pos: number) {
		if (frozen || pos < 0 || pos >= placed.length) return;
		placed.splice(pos, 1);
		redraw();
	}
	seq.addEventListener('dragover', (e) => {
		if (!frozen && placed.length < spec.ordre.length) e.preventDefault();
	});
	seq.addEventListener('drop', (e) => {
		e.preventDefault();
		const val = e.dataTransfer?.getData('text/plain');
		if (val) poser(val);
	});
	redraw();

	return {
		verify() {
			if (frozen) return placed.every((mot, i) => mot === spec.ordre[i]);
			frozen = true;
			const correct = placed.every((mot, i) => mot === spec.ordre[i]);
			redraw(); // fige + marque chaque case (vert/alerte + ✓/✗)
			return correct;
		},
		reponse: () => ({ kind: 'ordre', propose: [...placed] }),
	};
}

/* ---------- « tri » : ranger les tuiles dans deux colonnes-thèmes ---------- */
function bindTri(
	root: HTMLElement,
	spec: Extract<TuileSpec, { kind: 'tri' }>,
	opts: TuileOptions,
): TuileController {
	mountWidget(
		root,
		`<p class="ltui-consigne">Tape un mot, puis tape son thème (ou glisse-le dans la colonne).</p>
    <div class="ltri-cols" id="ltriCols"></div>
    <div class="ltui-bac" id="ltriBac"></div>
    <p class="sr-only" id="ltriStatus" role="status" aria-live="polite" aria-atomic="true"></p>`,
	);
	const cols = root.querySelector('#ltriCols') as HTMLElement;
	const bac = root.querySelector('#ltriBac') as HTMLElement;
	const status = root.querySelector('#ltriStatus') as HTMLElement | null;
	// Annonce vocale du dépôt/retrait (#360, SC 4.1.3) : le déplacement DOM et le focus
	// ne suffisent pas à dire au lecteur d'écran ce qui vient de se passer. Le nœud vit
	// hors de cols/bac → il survit aux redraws ; textContent est sûr (pas d'injection).
	const announce = (msg: string) => {
		if (status) status.textContent = msg;
	};

	const placed: Record<string, 0 | 1> = {};
	let selected: string | null = null;
	let frozen = false;

	const motsDeColonne = (col: 0 | 1) =>
		spec.mots.map((m) => m.mot).filter((mot) => placed[mot] === col);

	// Restauration du focus après un redraw (#360) : innerHTML recrée les éléments et
	// détruit le focus courant. Indispensable au clavier (sélection → dépôt restent
	// enchaînables) ; invisible au tap/souris (:focus-visible ne s'affiche pas, et
	// preventScroll évite tout saut de défilement sur mobile).
	let pendingFocus: (() => void) | null = null;
	const focusBacTile = (mot: string) =>
		[...bac.querySelectorAll<HTMLElement>('.ltri-tuile')]
			.find((b) => b.dataset.mot === mot)
			?.focus({ preventScroll: true });
	const focusColTitre = (col: 0 | 1) =>
		cols
			.querySelector<HTMLElement>(`.ltri-col[data-col="${col}"] .ltri-col-titre`)
			?.focus({ preventScroll: true });

	function redraw() {
		cols.innerHTML = ([0, 1] as const)
			.map((col) => {
				const tuiles = motsDeColonne(col)
					.map((mot) => {
						const m = spec.mots.find((x) => x.mot === mot)!;
						const ok = m.cat === col;
						const etat = frozen ? (ok ? ' correct' : ' wrong') : '';
						const mark = frozen
							? `<span class="ltri-mark" aria-hidden="true">${ok ? '✓' : '✗'}</span>`
							: '';
						// Une fois figée, l'aria-label porte le verdict juste/faux (marque ✓/✗ en
						// aria-hidden) → relecture au lecteur d'écran, tuile par tuile (#358).
						const label = frozen
							? `${escapeHTML(mot)}, ${ok ? 'correct' : 'incorrect'}`
							: `Retirer ${escapeHTML(mot)} du thème ${escapeHTML(spec.categories[col])}`;
						return `<button type="button" class="tuile ltri-posee${etat}" data-mot="${escapeHTML(mot)}"
            aria-label="${label}"${frozen ? ' disabled' : ''}>${escapeHTML(mot)}${mark}</button>`;
					})
					.join('');
				// Le titre de colonne est la cible de dépôt opérable au clavier (#360) : on en
				// fait un bouton (role + tabindex) plutôt que la <div> colonne elle-même, qui
				// contient les tuiles posées (boutons) — un role=button sur la colonne
				// imbriquerait des boutons (ARIA invalide). Désactivé une fois figé.
				const titreAttrs = frozen
					? ''
					: ` role="button" tabindex="0" aria-label="Déposer dans ${escapeHTML(spec.categories[col])}"`;
				return `<div class="ltri-col" data-col="${col}">
        <div class="ltri-col-titre"${titreAttrs}>${escapeHTML(spec.categories[col])}</div>
        <div class="ltri-zone" data-col="${col}">${tuiles}</div>
      </div>`;
			})
			.join('');
		if (!frozen) {
			cols.querySelectorAll<HTMLElement>('.ltri-col').forEach((colEl) => {
				const col = Number(colEl.dataset.col) as 0 | 1;
				colEl.addEventListener('click', (e) => {
					const posee = (e.target as HTMLElement).closest('.ltri-posee') as HTMLElement | null;
					if (posee) {
						retirer(posee.dataset.mot!); // taper une tuile posée la renvoie au bac
						return;
					}
					if (selected) poser(selected, col);
				});
				colEl.addEventListener('dragover', (e) => {
					if (!frozen) e.preventDefault();
				});
				colEl.addEventListener('drop', (e) => {
					e.preventDefault();
					const val = e.dataTransfer?.getData('text/plain');
					if (val) poser(val, col);
				});
				// Clavier (#360) : Entrée/Espace sur le titre-bouton dépose la tuile sélectionnée.
				colEl.querySelector<HTMLElement>('.ltri-col-titre')?.addEventListener('keydown', (e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						if (selected) poser(selected, col);
					}
				});
			});
		}
		bac.innerHTML = spec.mots
			.map((m) => {
				if (placed[m.mot] !== undefined) return ''; // déjà rangée → hors du bac
				const sel = selected === m.mot ? ' ltri-sel' : '';
				return `<button type="button" class="tuile lord-tuile ltri-tuile${sel}"
        data-mot="${escapeHTML(m.mot)}" draggable="true"
        aria-label="Choisir le mot ${escapeHTML(m.mot)}"${selected === m.mot ? ' aria-pressed="true"' : ''}>${escapeHTML(m.mot)}</button>`;
			})
			.join('');
		if (!frozen) {
			bac.querySelectorAll<HTMLButtonElement>('.ltri-tuile').forEach((btn) => {
				const val = btn.dataset.mot!;
				btn.addEventListener('click', () => selectTuile(val));
				btn.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', val));
			});
		}
		if (!frozen) opts.onState(Object.keys(placed).length === spec.mots.length);
		// Le focus suit l'action qui vient d'avoir lieu (clavier surtout, #360).
		if (pendingFocus) {
			const f = pendingFocus;
			pendingFocus = null;
			f();
		}
	}
	function selectTuile(val: string) {
		if (frozen || placed[val] !== undefined) return;
		selected = selected === val ? null : val; // re-taper désélectionne
		pendingFocus = () => focusBacTile(val); // la tuile reste au bac (mise en avant)
		redraw();
	}
	function poser(val: string, col: 0 | 1) {
		if (frozen || placed[val] !== undefined) return;
		placed[val] = col;
		if (selected === val) selected = null;
		pendingFocus = () => focusColTitre(col); // on garde le focus sur la colonne-cible
		announce(`${val} placé dans ${spec.categories[col]}`);
		redraw();
	}
	function retirer(val: string) {
		if (frozen || placed[val] === undefined) return;
		delete placed[val];
		pendingFocus = () => focusBacTile(val); // la tuile retourne au bac
		announce(`${val} retiré`);
		redraw();
	}
	redraw();

	return {
		verify() {
			const correct = spec.mots.every((m) => placed[m.mot] === m.cat);
			if (frozen) return correct;
			frozen = true;
			selected = null;
			redraw(); // fige + marque chaque tuile (vert/alerte + ✓/✗)
			return correct;
		},
		reponse: () => ({ kind: 'tri', placement: { ...placed } }),
	};
}
