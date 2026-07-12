/* ============================================================
   Noms sémantiques des icônes (vecteur Phosphor). Type PUR, sans aucun
   accès DOM : les modules de données / logique (core/) peuvent ainsi typer
   leur champ `icon` sans dépendre du rendu. C'est ui/icon.ts qui associe
   chaque nom à son SVG et le rend. Le nom décrit le RÔLE, pas le dessin.
   ============================================================ */
export type IconName =
	// Actions / états génériques
	| 'check'
	| 'check-circle'
	| 'x'
	| 'list'
	| 'house'
	| 'printer'
	| 'trash'
	| 'pencil'
	| 'gear'
	| 'reset'
	| 'palette'
	| 'plus'
	| 'caret-down'
	| 'lock'
	| 'export'
	| 'import'
	// Pictos de mode d'exercice / navigation
	| 'keyboard'
	| 'hand-pointing'
	| 'puzzle-piece'
	| 'table'
	| 'text'
	| 'eye'
	| 'speaker'
	| 'play'
	| 'cards'
	| 'star'
	| 'book-open'
	| 'run'
	| 'repeat'
	| 'faders'
	| 'timer'
	| 'exam'
	| 'bookmark'
	// Quantité croissante (sélecteur « questions par leçon » du bilan)
	| 'quantity-1'
	| 'quantity-2'
	| 'quantity-3'
	| 'quantity-all'
	// Icônes de catégorie / matière (cartes de navigation)
	| 'calculator'
	| 'list-numbers'
	| 'plus-minus'
	| 'brain'
	| 'ruler'
	| 'shapes'
	| 'clock-clockwise'
	| 'translate'
	| 'calendar'
	| 'feather'
	| 'lightbulb'
	// Aide / guide de première visite (bouton « ? » de l'accueil)
	| 'question';
