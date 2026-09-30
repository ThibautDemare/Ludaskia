/* ============================================================
   Ce que le tableau de conversion EXIGE, et ce qu'il tolère (#711 lot 5, critères 30-39).

   Jusqu'ici l'enfant devait remplir TOUTES les cases du tableau, et « Vérifier » restait
   gris tant qu'il en manquait une. Pour « 60 mm = ? cm » cela voulait dire écrire
   `0 0 0 0 0 6 0` : cinq zéros dans des colonnes qui ne concernent pas sa question, avant
   d'arriver à celle qui la concerne.

   Le tableau sert à TRANSCRIRE la donnée, puis à LIRE la réponse (avis
   `pedagogue-primaire` du 30/09). On exige donc ce qui prouve la transcription, et on ne
   pénalise pas ce qui relève de l'écriture décimale :

   - les zéros à gauche du premier chiffre sont acceptés sans être exigés : personne
     n'écrit `006,5` ;
   - ceux à droite du dernier aussi : `3000,000` n'est pas faux, mais c'est une écriture
     qu'on évite à cet âge ;
   - entre les deux, ils portent le rang vide, et c'est le cœur de l'exercice.

   Le cas qui décide de tout, et qu'il faut avoir en tête en lisant ce module : le `0` des
   millimètres de « 60 mm = ? cm » est OBLIGATOIRE. Ce n'est pas un chiffre de la réponse,
   c'est un chiffre de la DONNÉE. L'accepter vide reviendrait à valider une conversion
   faite de tête sans passer par le tableau.

   Pur, sans DOM : le runner peint, ce module juge.
   ============================================================ */

/** Une colonne, réduite à ce qui sert ici : son unité et les chiffres ATTENDUS (un par
 *  case ; la colonne de tête peut en porter deux). */
export interface ColonneAttendue {
	unite: string;
	chiffres: string;
}

/** Verdict d'une case après correction.
 *
 *  `neutre` n'est pas un demi-verdict, c'est l'ABSENCE de réponse à juger : une case que
 *  l'enfant n'avait pas à remplir et qu'il a laissée vide n'a rien produit, donc ni ✓ ni ✗
 *  (critère 36). Poser un ✓ sur du vide dirait « tu as bon » sans dire de quoi. */
export type VerdictCase = 'juste' | 'faux' | 'neutre';

/** Les deux colonnes que la question met en jeu, PAR RÔLE. `null` si l'une des deux unités
 *  est introuvable dans la tranche.
 *
 *  Partagée exprès : quatre endroits cherchaient ces deux index à la main, et les rôles s'y
 *  perdent facilement — une paire triée gauche/droite se substitue sans bruit à une paire
 *  donnée/demandée, et tout marche encore sur les conversions vers la droite. */
export function indicesQuestion(
	colonnes: { unite: string }[],
	uniteConnue: string,
	uniteDemandee: string,
): { iDonnee: number; iDemandee: number } | null {
	const iDonnee = colonnes.findIndex((c) => c.unite === uniteConnue);
	const iDemandee = colonnes.findIndex((c) => c.unite === uniteDemandee);
	return iDonnee < 0 || iDemandee < 0 ? null : { iDonnee, iDemandee };
}

/** Index des colonnes de la question dans l'ordre du TABLEAU (`gauche` avant `droite`),
 *  quel que soit le sens de la conversion. `null` si une unité est introuvable — rendre un
 *  intervalle inventé ferait raisonner l'appelant sur une autre question. */
export function bornesColonnes(
	colonnes: { unite: string }[],
	uniteConnue: string,
	uniteDemandee: string,
): { gauche: number; droite: number } | null {
	const q = indicesQuestion(colonnes, uniteConnue, uniteDemandee);
	if (!q) return null;
	return q.iDonnee <= q.iDemandee
		? { gauche: q.iDonnee, droite: q.iDemandee }
		: { gauche: q.iDemandee, droite: q.iDonnee };
}

/** Une colonne porte-t-elle un chiffre autre que zéro ? */
const significative = (c: ColonneAttendue) => /[1-9]/.test(c.chiffres);

/** Colonnes occupées par les chiffres de l'ÉCRITURE DE LA DONNÉE, bornes incluses.
 *
 *  À gauche, le premier chiffre non nul : c'est là que commence le nombre, les colonnes
 *  d'avant ne portant que des zéros de tête que personne n'écrit.
 *
 *  À droite, la colonne de l'unité donnée — et pas le dernier chiffre non nul, qui est le
 *  piège de ce calcul. Sur « 60 mm », le dernier chiffre non nul est le `6` des
 *  centimètres, alors que le `0` des millimètres fait partie du nombre : c'est lui qui dit
 *  que la donnée vaut 60 et non 6. Une donnée décimale déborde encore plus loin (« 12,5 cm »
 *  pose son `5` dans les millimètres), d'où le `max` avec le dernier chiffre non nul. */
function rangsDeLaDonnee(
	colonnes: ColonneAttendue[],
	iDonnee: number,
): { gauche: number; droite: number } {
	const premier = colonnes.findIndex(significative);
	let dernier = -1;
	colonnes.forEach((c, i) => {
		if (significative(c)) dernier = i;
	});
	// Tranche entièrement nulle : elle ne se produit pas (toute donnée vaut au moins 1),
	// mais rendre un intervalle inversé ferait silencieusement disparaître la zone.
	if (premier < 0) return { gauche: iDonnee, droite: iDonnee };
	return { gauche: premier, droite: Math.max(dernier, iDonnee) };
}

/** Bornes, en index de COLONNE, de la zone dont les cases doivent être remplies.
 *  `null` si l'une des deux unités est introuvable dans la tranche. */
export function zoneObligatoire(
	colonnes: ColonneAttendue[],
	uniteConnue: string,
	uniteDemandee: string,
): { gauche: number; droite: number } | null {
	const q = indicesQuestion(colonnes, uniteConnue, uniteDemandee);
	if (!q) return null;
	const { iDonnee, iDemandee } = q;
	const donnee = rangsDeLaDonnee(colonnes, iDonnee);
	/* La zone est l'écriture de la donnée ÉTENDUE jusqu'à la colonne où se lit la réponse :
	   sans elle, « 3 km = ? m » n'exigerait que le `3`, et les zéros des hectomètres,
	   décamètres et mètres, qui sont tout l'exercice, deviendraient facultatifs.

	   Le `min` est DÉFENSIF, et c'est écrit pour que personne ne le prenne pour un cas
	   courant : il ne mord que si la réponse se lit à gauche du premier chiffre, donc si
	   elle vaut moins de 1 dans l'unité demandée. Aucune question n'en produit aujourd'hui
	   (le sens petite→grande part d'un multiple exact du facteur, et les tirages décimaux
	   imposent une partie entière ≥ 1). On le garde quand même : il dit ce que la règle
	   veut dire, et le jour où une relation produirait « 5 m = ? km », l'omettre rendrait
	   le `0` des kilomètres facultatif, donc la réponse illisible. */
	return {
		gauche: Math.min(donnee.gauche, iDemandee),
		droite: Math.max(donnee.droite, iDemandee),
	};
}

/** Pour chaque case, dans l'ordre plat : cette case doit-elle être remplie ?
 *  Tout `false` quand une unité de l'énoncé est absente de la tranche. */
export function casesObligatoires(
	colonnes: ColonneAttendue[],
	uniteConnue: string,
	uniteDemandee: string,
): boolean[] {
	const zone = zoneObligatoire(colonnes, uniteConnue, uniteDemandee);
	return colonnes.flatMap((c, col) =>
		[...c.chiffres].map(() => zone !== null && col >= zone.gauche && col <= zone.droite),
	);
}

/** Verdict de chaque case, dans l'ordre plat du tableau.
 *
 *  `saisies` porte ce que l'enfant a écrit, une entrée par case, `''` pour une case vide.
 *  Le résultat a toujours la même longueur que le nombre total de cases : une case de plus
 *  ou de moins fausserait l'alignement avec le rendu, donc le verdict affiché. */
export function verdictsCases(
	colonnes: ColonneAttendue[],
	uniteConnue: string,
	uniteDemandee: string,
	saisies: string[],
): VerdictCase[] {
	const zone = zoneObligatoire(colonnes, uniteConnue, uniteDemandee);
	const exigees = casesObligatoires(colonnes, uniteConnue, uniteDemandee);
	const out: VerdictCase[] = [];
	let i = 0;
	for (const c of colonnes) {
		for (const attendu of c.chiffres) {
			const obligatoire = exigees[i];
			const saisi = saisies[i] ?? '';
			i++;
			/* Tranche mal formée (une unité de l'énoncé absente des colonnes) : tout neutre, et
			   surtout aucun `faux`. Le défaut vient alors du catalogue, pas de l'enfant ; un
			   tableau couvert de ✗ ressemblerait à un enfant qui s'est trompé, pas à une leçon
			   cassée, et c'est lui qui en porterait la faute à l'écran. */
			if (zone === null) out.push('neutre');
			else if (saisi === '') out.push(obligatoire ? 'faux' : 'neutre');
			else out.push(saisi === attendu ? 'juste' : 'faux');
		}
	}
	return out;
}

/** L'écriture attendue de la donnée, en langue d'enfant, pour le retour de correction
 *  quand la seule erreur est une case vide de la zone obligatoire (critère 38) :
 *  « pour 60 mm, il fallait écrire 6 dans les cm et 0 dans les mm ». Rendue SANS majuscule
 *  ni point final : le runner la compose avec ce qui la précède. Chaîne vide si rien
 *  d'utile à dire.
 *
 *  Deux tournures ont été écartées, et la raison vaut d'être lue avant d'y revenir (avis
 *  `redacteur-contenu-francais` du 30/09) :
 *  - « 60 mm s'écrit 6 en cm » affirme quelque chose sur le NOMBRE, et c'est faux : ce qui
 *    s'écrit ainsi, c'est la ligne du tableau, pas la quantité. On dit donc le geste, « il
 *    fallait écrire », et au passé, comme « la virgule allait après les millimètres » ;
 *  - « 6 en cm » se lit « 6, converti en cm », puisque « en » porte déjà ce sens dans tout
 *    l'exercice. « dans les cm » désigne la colonne, et reprend l'article de la phrase
 *    voisine.
 *
 *  Les SYMBOLES sont gardés plutôt que les noms entiers. Rejet écrit : l'énoncé et la
 *  réponse révélée les emploient déjà, l'enfant les lit dans l'en-tête de chaque colonne,
 *  et la forme à quatre rangs dépasserait vingt-cinq mots en toutes lettres.
 *
 *  Elle ne parcourt QUE les rangs de la donnée, jamais la zone entière, et la nuance est
 *  tout le sens de la phrase : sur « 5 m = ? km » la zone couvre les kilomètres, si bien
 *  qu'un parcours de la zone dirait « 5 m s'écrit 0 en km, 0 en hm, 0 en dam et 5 en m ».
 *  C'est vrai du tableau et FAUX du nombre — 5 m ne s'écrit pas 0 km. Une donnée qui tient
 *  sur un seul rang ne produit donc aucune phrase : « 3 km s'écrit 3 en km » ne dirait rien
 *  que l'énoncé n'ait déjà dit.
 *
 *  Le rang vide oublié (le `0` des hectomètres sur « 3 km = ? m ») n'est PAS son affaire :
 *  `explicationRangVide` (ui/lecon-tableau.ts) le traite déjà, et deux phrases qui se
 *  recouvrent valent moins qu'une seule qui porte. */
export function ecritureAttendue(
	colonnes: ColonneAttendue[],
	uniteConnue: string,
	uniteDemandee: string,
): string {
	const q = indicesQuestion(colonnes, uniteConnue, uniteDemandee);
	if (!q) return '';
	const { iDonnee } = q;
	const { gauche, droite } = rangsDeLaDonnee(colonnes, iDonnee);
	if (gauche >= droite) return '';
	const rangs = colonnes.slice(gauche, droite + 1);
	// Les chiffres d'une colonne restent SOLIDAIRES : une tête à deux chiffres se lit
	// « 12 en km », jamais « 1 en km, 2 en km » — ce que produirait un parcours par cases.
	const morceaux = rangs.map((c) => `${c.chiffres} dans les ${c.unite}`);
	const valeur = rangs
		.map((c) => c.chiffres)
		.join('')
		.replace(/^0+(?=\d)/, '');
	const decimales = droite - iDonnee;
	const ecrit = decimales > 0 ? insererVirgule(valeur, decimales) : valeur;
	const liste =
		morceaux.length === 1
			? morceaux[0]
			: `${morceaux.slice(0, -1).join(', ')} et ${morceaux[morceaux.length - 1]}`;
	return `pour ${ecrit} ${colonnes[iDonnee].unite}, il fallait écrire ${liste}`;
}

/** Remet la virgule dans une suite de chiffres relus colonne par colonne : la donnée
 *  « 12,5 cm » est étalée `1 2 5` sur dm, cm et mm, et la phrase doit la rendre telle que
 *  l'énoncé l'écrit, sinon elle cite un nombre que l'enfant n'a jamais lu. */
function insererVirgule(chiffres: string, decimales: number): string {
	const coupe = chiffres.length - decimales;
	if (coupe <= 0) return chiffres;
	return `${chiffres.slice(0, coupe)},${chiffres.slice(coupe)}`;
}

/** Les saisies telles que le JOURNAL ENCADRANT doit les relire (critère 34).
 *
 *  Une case vide n'est pas un zéro, et la nuance décide de ce que le parent lit. Hors de la
 *  question, le vide VAUT zéro : l'enfant avait le droit de ne rien y écrire, et c'est bien
 *  zéro que le tableau montre. Dans la question, non — relire « 3 km = ? m » comme
 *  « 3000 m » alors que l'enfant n'a écrit que le `3` afficherait au parent la BONNE réponse
 *  sous un tableau rouge, exactement le piège que le lot 4 avait nommé à propos de la
 *  virgule. Le trou est donc rendu visible par un caractère qui n'est pas un chiffre. */
export function saisiesPourJournal(
	colonnes: ColonneAttendue[],
	uniteConnue: string,
	uniteDemandee: string,
	saisies: string[],
): string[] {
	const exigees = casesObligatoires(colonnes, uniteConnue, uniteDemandee);
	return exigees.map((exigee, i) => saisies[i] || (exigee ? TROU : '0'));
}

/** Le caractère qui marque un rang que l'enfant n'a pas rempli, dans le journal encadrant.
 *  Ni un chiffre ni un espace : il doit survivre au retrait des zéros de tête et de queue,
 *  et se voir dans « 3___ m ». */
export const TROU = '_';

/** Le retour de correction quand la SEULE erreur est une ou plusieurs cases exigées laissées
 *  vides (critère 38). Chaîne vide dans tous les autres cas.
 *
 *  Ici plutôt que dans le runner, et ce n'est pas du rangement : la condition « sa seule
 *  erreur est un oubli » est une règle de correction, pas une décision d'affichage, et elle
 *  a quatre bords qu'un test doit pouvoir éprouver un par un (un oubli, plusieurs, un oubli
 *  plus un chiffre faux, un oubli plus une virgule fausse).
 *
 *  On NOMME l'oubli avant de montrer l'écriture, dans les termes déjà validés pour la
 *  virgule. Sans ce préfixe, « la bonne réponse était 6 cm » suivi de « 0 dans les mm » se
 *  contredit à l'oreille, et l'enfant qui a bien écrit son 6 ne comprend pas ce qui est rouge
 *  (constat redacteur-contenu-francais). */
export function noteOubli(
	colonnes: ColonneAttendue[],
	uniteConnue: string,
	uniteDemandee: string,
	saisies: string[],
	virguleOk: boolean,
): string {
	if (!virguleOk) return '';
	const verdicts = verdictsCases(colonnes, uniteConnue, uniteDemandee, saisies);
	const vide = (i: number) => (saisies[i] ?? '') === '';
	// Un faux sur une case REMPLIE est un vrai problème de conversion : cette phrase-là le
	// noierait, et l'enfant a besoin d'entendre l'autre.
	if (verdicts.some((v, i) => v === 'faux' && !vide(i))) return '';
	const oublis = verdicts.filter((v, i) => v === 'faux' && vide(i)).length;
	if (oublis === 0) return '';
	const ecriture = ecritureAttendue(colonnes, uniteConnue, uniteDemandee);
	/* « Tes chiffres sont bons » suppose des chiffres. Un enfant peut valider un tableau
	   auquel il n'a pas touché, puisque « Vérifier » est actif dès l'apparition de la
	   question : le féliciter de ce qu'il n'a pas écrit sonnerait faux, et lui apprendrait
	   surtout que la phrase ne veut rien dire. On lui montre alors l'écriture attendue, sans
	   compliment ni reproche. */
	const exigees = casesObligatoires(colonnes, uniteConnue, uniteDemandee);
	const aEcritDansLaZone = exigees.some((exigee, i) => exigee && !vide(i));
	if (!aEcritDansLaZone) return ecriture ? `${ecriture[0].toUpperCase()}${ecriture.slice(1)}.` : '';
	const combien = oublis === 1 ? 'un' : String(oublis);
	return `Tes chiffres sont bons, mais il en manquait ${combien}${ecriture ? ` : ${ecriture}` : ''}.`;
}
