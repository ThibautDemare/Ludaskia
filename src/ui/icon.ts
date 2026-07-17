/* ============================================================
   Icônes Phosphor (graisse « bold » unique) intégrées en SVG inline.

   Pourquoi inline plutôt qu'une fonte web : on n'embarque QUE les icônes
   réellement utilisées (bundle minimal) et la couleur suit `currentColor`,
   donc pilotée par nos tokens (--ink, --ok, --ko, --accent…). On garde UNE
   seule graisse (« bold ») pour la cohérence visuelle — décision UX : un
   enfant lit chaque icône comme un mot d'un alphabet en apprentissage,
   mélanger les graisses ajoute une charge cognitive gratuite.

   Frontière d'usage : ces icônes remplacent les emojis à RÔLE FONCTIONNEL
   (boutons, navigation, états, pictos de mode). Le décor expressif et coloré
   — mascotte, avatars, rangs, médailles — reste en emoji (voir core/unlocks.ts).

   Le markup renvoyé est une chaîne, à intégrer dans les templates innerHTML
   existants (ex. `` `<button>${icon('house')} Accueil</button>` ``). Taille et
   couleur viennent du CSS (classe .ph-icon dans base.scss). Les NOMS d'icônes
   (type IconName) vivent dans core/icon-names.ts (module pur).
   ============================================================ */
import type { IconName } from '../core/icon-names';
import { escapeHTML } from '../core/utils';

export type { IconName };

// Chaque SVG est importé en texte brut (?raw) : Vite n'inclut dans le bundle
// que ceux référencés ici. Les SVG Phosphor portent déjà `fill="currentColor"`
// et un `viewBox` (pas de width/height : la taille vient du CSS).
import check from '@phosphor-icons/core/assets/bold/check-bold.svg?raw';
import checkCircle from '@phosphor-icons/core/assets/bold/check-circle-bold.svg?raw';
import x from '@phosphor-icons/core/assets/bold/x-bold.svg?raw';
import square from '@phosphor-icons/core/assets/bold/square-bold.svg?raw';
import checkSquare from '@phosphor-icons/core/assets/bold/check-square-bold.svg?raw';
import list from '@phosphor-icons/core/assets/bold/list-bold.svg?raw';
import house from '@phosphor-icons/core/assets/bold/house-bold.svg?raw';
import printer from '@phosphor-icons/core/assets/bold/printer-bold.svg?raw';
import trash from '@phosphor-icons/core/assets/bold/trash-bold.svg?raw';
import pencil from '@phosphor-icons/core/assets/bold/pencil-simple-bold.svg?raw';
import gear from '@phosphor-icons/core/assets/bold/gear-bold.svg?raw';
import reset from '@phosphor-icons/core/assets/bold/arrows-clockwise-bold.svg?raw';
import palette from '@phosphor-icons/core/assets/bold/palette-bold.svg?raw';
import plus from '@phosphor-icons/core/assets/bold/plus-bold.svg?raw';
import caretDown from '@phosphor-icons/core/assets/bold/caret-down-bold.svg?raw';
import lock from '@phosphor-icons/core/assets/bold/lock-bold.svg?raw';
import exportIcon from '@phosphor-icons/core/assets/bold/export-bold.svg?raw';
import importIcon from '@phosphor-icons/core/assets/bold/download-simple-bold.svg?raw';
import keyboard from '@phosphor-icons/core/assets/bold/keyboard-bold.svg?raw';
import handPointing from '@phosphor-icons/core/assets/bold/hand-pointing-bold.svg?raw';
import puzzlePiece from '@phosphor-icons/core/assets/bold/puzzle-piece-bold.svg?raw';
import table from '@phosphor-icons/core/assets/bold/table-bold.svg?raw';
import text from '@phosphor-icons/core/assets/bold/text-aa-bold.svg?raw';
import eye from '@phosphor-icons/core/assets/bold/eye-bold.svg?raw';
import speaker from '@phosphor-icons/core/assets/bold/speaker-high-bold.svg?raw';
import play from '@phosphor-icons/core/assets/bold/play-bold.svg?raw';
import cards from '@phosphor-icons/core/assets/bold/cards-bold.svg?raw';
import star from '@phosphor-icons/core/assets/bold/star-bold.svg?raw';
import bookOpen from '@phosphor-icons/core/assets/bold/book-open-bold.svg?raw';
import run from '@phosphor-icons/core/assets/bold/person-simple-run-bold.svg?raw';
import repeat from '@phosphor-icons/core/assets/bold/repeat-bold.svg?raw';
import faders from '@phosphor-icons/core/assets/bold/faders-bold.svg?raw';
import timer from '@phosphor-icons/core/assets/bold/timer-bold.svg?raw';
import exam from '@phosphor-icons/core/assets/bold/exam-bold.svg?raw';
import bookmark from '@phosphor-icons/core/assets/bold/bookmark-simple-bold.svg?raw';
import calculator from '@phosphor-icons/core/assets/bold/calculator-bold.svg?raw';
import listNumbers from '@phosphor-icons/core/assets/bold/list-numbers-bold.svg?raw';
import plusMinus from '@phosphor-icons/core/assets/bold/plus-minus-bold.svg?raw';
import brain from '@phosphor-icons/core/assets/bold/brain-bold.svg?raw';
import ruler from '@phosphor-icons/core/assets/bold/ruler-bold.svg?raw';
import shapes from '@phosphor-icons/core/assets/bold/shapes-bold.svg?raw';
import clockClockwise from '@phosphor-icons/core/assets/bold/clock-clockwise-bold.svg?raw';
import translate from '@phosphor-icons/core/assets/bold/translate-bold.svg?raw';
import calendar from '@phosphor-icons/core/assets/bold/calendar-bold.svg?raw';
import feather from '@phosphor-icons/core/assets/bold/feather-bold.svg?raw';
import lightbulb from '@phosphor-icons/core/assets/bold/lightbulb-bold.svg?raw';
import question from '@phosphor-icons/core/assets/bold/question-bold.svg?raw';
// Quantité croissante : barres « signal » graduées pour les paliers chiffrés,
// pile (stack) pour « Tout » (hors-gradation, cf. #180).
import quantity1 from '@phosphor-icons/core/assets/bold/cell-signal-low-bold.svg?raw';
import quantity2 from '@phosphor-icons/core/assets/bold/cell-signal-medium-bold.svg?raw';
import quantity3 from '@phosphor-icons/core/assets/bold/cell-signal-high-bold.svg?raw';
import quantityAll from '@phosphor-icons/core/assets/bold/stack-bold.svg?raw';

const SVGS: Record<IconName, string> = {
	check,
	'check-circle': checkCircle,
	x,
	square,
	'check-square': checkSquare,
	list,
	house,
	printer,
	trash,
	pencil,
	gear,
	reset,
	palette,
	plus,
	'caret-down': caretDown,
	lock,
	export: exportIcon,
	import: importIcon,
	keyboard,
	'hand-pointing': handPointing,
	'puzzle-piece': puzzlePiece,
	table,
	text,
	eye,
	speaker,
	play,
	cards,
	star,
	'book-open': bookOpen,
	run,
	repeat,
	faders,
	timer,
	exam,
	bookmark,
	calculator,
	'list-numbers': listNumbers,
	'plus-minus': plusMinus,
	brain,
	ruler,
	shapes,
	'clock-clockwise': clockClockwise,
	translate,
	calendar,
	feather,
	lightbulb,
	question,
	'quantity-1': quantity1,
	'quantity-2': quantity2,
	'quantity-3': quantity3,
	'quantity-all': quantityAll,
};

export interface IconOptions {
	/** Libellé accessible. Si absent, l'icône est décorative (`aria-hidden`) —
	 *  cas d'un bouton qui porte déjà son texte ou son `title`/`aria-label`. */
	label?: string;
	/** Classes CSS additionnelles (ex. une variante de taille ou de teinte). */
	cls?: string;
}

/** Renvoie le markup SVG inline d'une icône, intégrable dans un `innerHTML`. */
export function icon(name: IconName, opts: IconOptions = {}): string {
	const a11y = opts.label
		? `role="img" aria-label="${escapeHTML(opts.label)}"`
		: 'aria-hidden="true"';
	const cls = opts.cls ? `ph-icon ${opts.cls}` : 'ph-icon';
	// On n'injecte que la classe, l'accessibilité et focusable=false : le reste
	// (viewBox, fill="currentColor") est déjà dans le SVG source.
	return SVGS[name].replace('<svg ', `<svg class="${cls}" focusable="false" ${a11y} `);
}

/** Variante tolérante pour une valeur d'origine DONNÉE (ModeOption.icon) :
 *  rend l'icône si le nom est connu, sinon une icône de repli (`play`). */
export function iconOr(name: string | undefined, opts: IconOptions = {}): string {
	return name && name in SVGS ? icon(name as IconName, opts) : icon('play', opts);
}
