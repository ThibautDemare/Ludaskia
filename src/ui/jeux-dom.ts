/* ============================================================
   Étagère de jeux — les deux gestes de rendu que tout plateau refait.

   Minuscule, et il doit le rester : ce n'est pas une boîte à outils, c'est
   l'endroit où atterrit ce que DEUX runners de jeux écrivaient déjà à
   l'identique. Le déclencheur avait été consigné à la fin de #664 — « la
   troisième occurrence sera le moment de factoriser plutôt que de figer le
   copier-coller en motif » — et #665 l'a atteint : `bascule` et `capitale`
   étaient copiées mot pour mot dans les mots à caser et les mots croisés.

   Deuxième versement, mesuré de la même façon et bien au-delà du seuil : `dans`
   était recopié au caractère près dans CINQ runners (2048, calcudoku, mots à
   caser, mots croisés, sudoku), et `annoncer` dans QUATRE (les mêmes sans le
   2048, qui passe par un `ecrire(sel, texte)` à deux arguments partagé avec son
   score et son record — une autre fonction, laissée chez lui).

   Ces deux-là entrent sous forme de FABRIQUES, pas de fonctions libres, et ce
   n'est pas un goût d'API : chaque runner garde sa racine dans un `let`
   réaffecté au montage et remis à `null` au démontage. Capturer l'élément à la
   construction rendrait le `dans` définitivement aveugle, puisque la racine vaut
   `null` à ce moment-là. Ce qu'on ferme donc ici, c'est un accès PARESSEUX,
   relu à chaque appel.

   Ce qui N'A PAS sa place ici : tout ce qui touche à un jeu en particulier (une
   grille, un vivier, une règle), et tout ce qui est PUR — la logique de jeu vit
   dans `core/jeux/`, où elle est testable sans DOM. La clé d'une case, par
   exemple, est repartie dans `core/jeux/grille-mots.ts` (`cleCase`) : elle décrit
   une géométrie, pas un rendu.

   Rien ici ne connaît un jeu, et rien n'a d'effet à l'import.
   ============================================================ */

/** Pose ou retire un attribut d'état sur un élément.

    Un ATTRIBUT plutôt qu'une classe, et c'est la convention des plateaux (sudoku,
    mots à caser, mots croisés) : un sélecteur d'attribut se lit aussi bien dans
    la feuille de style que dans une spec Playwright, et il ne se mélange pas aux
    classes de mise en forme quand on relit le DOM à la main.

    La valeur posée est `'1'` et n'est jamais lue : ce qui porte l'information,
    c'est la PRÉSENCE de l'attribut. */
export function bascule(el: HTMLElement, nom: string, actif: boolean): void {
	if (actif) el.setAttribute(nom, '1');
	else el.removeAttribute(nom);
}

/** Une lettre en capitale, casse française.

    Les grilles affichent des capitales : dans une case isolée, sans appui
    sémantique, b/d/p/q se confondent bien plus que B/D/P/Q. Le passage par la
    casse `'fr'` plutôt que par `toUpperCase()` nu garde les accents à leur
    place — la majuscule accentuée est la forme correcte en français, et c'est
    justement ce que la grille est censée montrer. */
export const capitale = (lettre: string): string => lettre.toLocaleUpperCase('fr');

/** La fabrique du `querySelector` borné à la racine d'un jeu.

    `lireRacine` est rappelée à CHAQUE requête, et pas lue une fois : la racine
    d'un runner est un `let` qui ne reçoit son élément qu'au montage. Appel type,
    au même endroit qu'avant dans le runner :
    `const dans = creerDans(() => racine);`.

    Rend `null` quand le jeu n'est pas monté ou que le sélecteur ne trouve rien,
    plutôt que de lever : les appelants testent déjà le résultat, et une exception
    ici couperait un rendu entier pour une case absente. */
export function creerDans(
	lireRacine: () => HTMLElement | null,
): <T extends HTMLElement>(sel: string) => T | null {
	return <T extends HTMLElement>(sel: string): T | null => {
		const racine = lireRacine();
		return racine ? racine.querySelector<T>(sel) : null;
	};
}

/** La fabrique de l'annonce d'un jeu : écrit une phrase dans sa région vivante
    (`role="status"` + `aria-live="polite"`), seule voie par laquelle un lecteur
    d'écran apprend ce que la grille vient de faire.

    La région est cherchée à chaque annonce, jamais retenue : elle fait partie du
    balisage que le runner reconstruit, donc elle change d'identité d'un montage à
    l'autre. Appel type : `const annoncer = creerAnnonceur(() => dans('#mcAnnonce'));`.

    `textContent`, jamais `innerHTML` : ce qui passe ici est une phrase pour
    l'oreille, pas du balisage. Région absente = annonce perdue en silence, comme
    avant : une aide d'accessibilité ne casse pas la partie en tombant. */
export function creerAnnonceur(region: () => HTMLElement | null): (texte: string) => void {
	return (texte: string): void => {
		const el = region();
		if (el) el.textContent = texte;
	};
}
