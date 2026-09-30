/* ============================================================
   Cadrage du tableau de conversion sur la question posée (#711 lot 5) — logique PURE.

   Le tableau affiche une tranche FIXE de colonnes (sept, des kilomètres aux millimètres) et
   le cadre qui la montre est plus étroit qu'elle : il défile. Aujourd'hui il s'ouvre toujours
   sur sa PREMIÈRE colonne, si bien que « 3,2 cm = ? mm » se lit devant les kilomètres. Ces
   deux fonctions décident où l'ouvrir. Elles ne touchent rien : elles rendent un intervalle
   de colonnes et une position de défilement, et c'est le runner qui mesure puis applique.

   Ce que ces tests gardent, dans l'ordre des critères de l'issue :

   - critère 21 : quand l'intervalle de la question tient dans le cadre, il est ENTIÈREMENT
     visible, sans un geste de défilement ;
   - critère 23 : sur les masses il ne tient pas (332 px au CE2, 346 au CM1, pour un cadre de
     313 px), donc la règle doit encore répondre quelque chose d'utile ;
   - critère 25 : dans ce cas, c'est la colonne DONNÉE qui est cadrée, jamais le début du
     tableau. La raison décide de la règle et mérite d'être relue ici : l'unité demandée est
     déjà écrite dans l'énoncé (« = ? mm ») et le remplissage y arrive de toute façon, tandis
     que le point de départ n'est écrit NULLE PART dans le tableau. C'est la seule information
     que l'enfant doit localiser seul, et se tromper de colonne de départ est l'erreur de
     conversion typique.

   Les attendus sont dérivés de ces critères, pas de la formule : chaque valeur de défilement
   citée plus bas est la seule position qui satisfasse l'énoncé du critère sur la géométrie
   donnée, et le calcul est refait en commentaire à côté. Les géométries, elles, sont posées
   ici plutôt que mesurées dans un navigateur — c'est tout l'intérêt d'avoir sorti la décision
   du DOM : un intervalle plus large que le cadre, un tableau qui ne déborde pas, une colonne
   collée à la butée sont des cas qu'aucun viewport raisonnable ne produit à la demande.

   Deux pièges nommés, parce qu'ils ne se voient pas à la lecture d'un appel :
   - le module voisin offre DEUX façons de désigner les colonnes de la question :
     `indicesQuestion` les rend par RÔLE (donnée, demandée) et `bornesColonnes` par POSITION
     (gauche, droite). Passer `gauche` à `scrollPourCadrer` comme s'il s'agissait de la
     colonne donnée cadre toujours à gauche — exactement le défaut que le critère 25 corrige,
     et rien ne le distingue en aval ;
   - un `scrollLeft` négatif est ramené à 0 par le navigateur SANS rien dire. Une position
     fautive de ce genre ressemble alors trait pour trait au bug d'origine, et ne se voit qu'à
     l'usage, sur l'appareil de l'enfant.

   Les colonnes de la question, elles, ne sont plus décidées ici : `indicesQuestion` et
   `bornesColonnes` vivent dans `src/core/tableau-verdict.ts` et sont éprouvées dans
   `tests/tableau-verdict.test.ts`. Ce fichier ne garde d'elles que la COMPOSITION avec le
   cadrage, c'est-à-dire ce que le runner enchaîne réellement.

   Hors de ce fichier : que la page ne saute pas verticalement et que rien ne s'anime
   (critères 26/27) — c'est du DOM, donc de la spec Playwright.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { scrollPourCadrer, type Segment } from '../src/core/tableau-cadrage';
import { bornesColonnes, indicesQuestion } from '../src/core/tableau-verdict';

/* ---------- Tranches de colonnes (ce que le cadrage doit traduire en pixels) ---------- */

const tranche = (...unites: string[]): { unite: string }[] => unites.map((unite) => ({ unite }));

/** Les deux tranches FIXES du CM1 : sept rangs, de la plus grande unité à la plus petite. */
const LONGUEURS = tranche('km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm');
const MASSES = tranche('kg', 'hg', 'dag', 'g', 'dg', 'cg', 'mg');

/* ---------- Géométries (ce que `scrollPourCadrer` regarde) ---------- */

/** Marge de respiration. Valeur par défaut du module, passée EXPLICITEMENT partout ci-dessous
    pour que les attendus ne dépendent pas d'un défaut qui changerait en silence ; un test
    dédié vérifie que l'appel sans marge fait bien la même chose. */
const MARGE = 8;

/** Largeur du cadre `.tc-wrap` mesurée sur la tablette (#711, critère 23). */
const CADRE = 313;

interface Tableau {
	nom: string;
	unites: string[];
	/** Segment de chaque colonne, dans l'ordre du tableau. */
	cols: Segment[];
	cadre: number;
	total: number;
}

/** Colonnes contiguës posées bout à bout depuis l'origine du tableau. */
function poser(nom: string, unites: string[], largeurs: number[], cadre: number): Tableau {
	let x = 0;
	const cols = largeurs.map((l) => {
		const seg = { debut: x, fin: x + l };
		x += l;
		return seg;
	});
	return { nom, unites, cols, cadre, total: x };
}

/** Segment de la colonne d'une unité. Échoue net si l'unité n'est pas dans la tranche : une
    géométrie de test mal construite doit s'arrêter ici, pas produire un attendu silencieux. */
function col(t: Tableau, unite: string): Segment {
	const i = t.unites.indexOf(unite);
	if (i < 0) throw new Error(`${t.nom} : pas de colonne « ${unite} »`);
	return t.cols[i];
}

const UNITES_L = ['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm'];
const UNITES_M = ['kg', 'hg', 'dag', 'g', 'dg', 'cg', 'mg'];

/* Masses : les deux totaux du critère 23 (332 px au CE2, 346 au CM1), répartis sur les sept
   colonnes. Le détail colonne par colonne est une hypothèse de travail — une tête un peu plus
   large que les rangs suivants ; ce qui est MESURÉ et ce dont dépendent les attendus, c'est la
   somme et le fait que les colonnes soient contiguës. */
const MASSES_CM1 = poser('masses CM1', UNITES_M, [52, 49, 49, 49, 49, 49, 49], CADRE); // 346
const MASSES_CE2 = poser('masses CE2', UNITES_M, [50, 47, 47, 47, 47, 47, 47], CADRE); // 332

/* Longueurs : sept colonnes de 50 px. Le tableau déborde (350 > 313), mais moins largement que
   les masses — donc les questions courtes y tiennent et les longues non. */
const LONGUEURS_CM1 = poser('longueurs CM1', UNITES_L, Array(7).fill(50), CADRE); // 350

/* Le même tableau en plus gros (texte agrandi) : 420 px. Il sert aux positions INTERMÉDIAIRES,
   celles où le défilement n'est bloqué par aucune des deux butées. Sans lui, tous les attendus
   vaudraient 0 ou le maximum, et une règle incapable de faire autre chose passerait. */
const LONGUEURS_ZOOM = poser('longueurs zoomées', UNITES_L, Array(7).fill(60), CADRE); // 420

/* Un tableau plus court que son cadre : rien à faire défiler du tout. */
const PETIT = poser('tableau court', ['L', 'dL', 'cL', 'mL', 'x'], Array(5).fill(50), CADRE); // 250

/* Cadre de 300 px pour une question qui en mesure exactement 300 : l'intervalle TIENT, à la
   marge près. Ce n'est pas une géométrie exotique — la largeur du cadre suit celle de l'écran,
   donc « l'intervalle remplit le cadre à quelques pixels près » finit par arriver sur un
   appareil ou un autre. Voir le test « la marge cède avant le critère 21 ». */
const AJUSTE = poser('longueurs, cadre ajusté', UNITES_L, Array(7).fill(60), 300); // 420

/** Les tableaux dont les mesures sont celles de l'issue : ceux sur lesquels le balayage final
    exige le respect des critères. */
const MESURES = [MASSES_CM1, MASSES_CE2, LONGUEURS_CM1, LONGUEURS_ZOOM, PETIT];

/* ---------- Détecteurs : les critères, écrits une fois ---------- */

const largeur = (s: Segment) => s.fin - s.debut;
const butee = (t: Tableau) => Math.max(0, t.total - t.cadre);

/** Intervalle de la question : de la colonne donnée à la colonne demandée, colonnes
    intermédiaires comprises, quel que soit le sens de la conversion. */
const intervalle = (donnee: Segment, demandee: Segment): Segment => ({
	debut: Math.min(donnee.debut, demandee.debut),
	fin: Math.max(donnee.fin, demandee.fin),
});

/** Ce que le cadrage doit tenir, rendu en DÉFAUTS lisibles plutôt qu'en booléen : quand le
    balayage final rougit, le message doit dire ce que l'enfant ne voit pas, pas « false ». */
function defautsDeCadrage(
	scroll: number,
	t: Tableau,
	donnee: Segment,
	demandee: Segment,
): string[] {
	if (!Number.isFinite(scroll)) return [`défilement non calculable (${scroll})`];
	const out: string[] = [];
	const max = butee(t);
	if (scroll < 0)
		out.push(
			`défilement négatif (${scroll}) : le navigateur le ramène à 0 sans rien dire, donc le tableau s'ouvre sur sa première colonne — le bug d'origine, en silence`,
		);
	if (scroll > max)
		out.push(
			`défilement de ${scroll} au-delà de la butée (${max}) : le cadre ne peut pas aller là, il s'arrêtera avant et le cadrage sera faux`,
		);
	const vue = { debut: scroll, fin: scroll + t.cadre };
	const dansLeCadre = (s: Segment) => s.debut >= vue.debut && s.fin <= vue.fin;
	/* Critère 25 : la colonne donnée est le point de départ, la seule information que l'énoncé
	   n'écrit pas. Elle doit être sous les yeux. Écarté si le cadre est trop étroit pour elle. */
	if (t.cadre >= largeur(donnee) + MARGE && !dansLeCadre(donnee))
		out.push(
			`critère 25 : la colonne DONNÉE [${donnee.debut}, ${donnee.fin}] sort du cadre [${vue.debut}, ${vue.fin}] — l'enfant doit chercher seul d'où il part, et c'est justement là qu'il se trompe`,
		);
	/* Critère 21 : si la question tient dans le cadre, elle est visible en entier. */
	const inter = intervalle(donnee, demandee);
	if (largeur(inter) <= t.cadre && !dansLeCadre(inter))
		out.push(
			`critère 21 : l'intervalle [${inter.debut}, ${inter.fin}] mesure ${largeur(inter)} px et TIENT dans le cadre (${t.cadre} px), mais il déborde de [${vue.debut}, ${vue.fin}] — l'enfant doit faire défiler pour voir sa propre question`,
		);
	return out;
}

/** Seconde moitié du critère 25 : la fenêtre s'ouvre SUR la colonne donnée et s'étend dans le
    sens du remplissage. Observable sans parler de formule : on ne montre pas plus que la marge
    du côté opposé au remplissage — sauf quand le tableau est déjà déroulé jusqu'à sa butée de
    ce côté-là, où il n'y a plus rien à gagner. */
function defautsDeSens(scroll: number, t: Tableau, donnee: Segment, demandee: Segment): string[] {
	if (!Number.isFinite(scroll)) return [];
	if (demandee.debut > donnee.debut) {
		const perdu = donnee.debut - scroll;
		if (perdu > MARGE && scroll !== butee(t))
			return [
				`critère 25 : ${perdu} px sont montrés À GAUCHE de la colonne donnée alors que le remplissage va vers la droite — autant de colonnes hors sujet prises sur celles que l'enfant doit écrire`,
			];
	} else if (demandee.debut < donnee.debut) {
		const perdu = scroll + t.cadre - donnee.fin;
		if (perdu > MARGE && scroll !== 0)
			return [
				`critère 25 : ${perdu} px sont montrés À DROITE de la colonne donnée alors que le remplissage va vers la gauche — autant de colonnes hors sujet prises sur celles que l'enfant doit écrire`,
			];
	}
	return [];
}

/* ============================================================
   `scrollPourCadrer` — critère 21 : la question est visible sans défiler
   ============================================================ */

describe('#711 lot 5 — critère 21 : la question tient dans le cadre et s’y voit en entier', () => {
	it('« 3 km = ? m » : le cadre reste au début, les quatre colonnes de la question sous les yeux', () => {
		const donnee = col(LONGUEURS_CM1, 'km'); // [0, 50]
		const demandee = col(LONGUEURS_CM1, 'm'); // [150, 200]
		// La colonne donnée est la première du tableau : aucune place pour la marge à sa gauche,
		// et rien à gagner à décaler. Seule position possible : 0.
		const s = scrollPourCadrer(donnee, demandee, LONGUEURS_CM1.cadre, LONGUEURS_CM1.total, MARGE);
		expect(s, 'la question commence au bord du tableau : le cadre n’a nulle part où reculer').toBe(
			0,
		);
		expect(defautsDeCadrage(s, LONGUEURS_CM1, donnee, demandee)).toEqual([]);
	});

	it('« 3,2 cm = ? mm » (l’exemple du module) : le cadre va jusqu’au bout du tableau', () => {
		const donnee = col(LONGUEURS_CM1, 'cm'); // [250, 300]
		const demandee = col(LONGUEURS_CM1, 'mm'); // [300, 350]
		/* La question est à l'extrémité droite : la fenêtre la plus à droite est [37, 350] (butée
		   350 - 313). Elle contient les deux colonnes ; c'est aussi la seule qui les montre avec
		   le maximum de contexte du côté du remplissage. Aujourd'hui le défilement vaut 0 et
		   l'enfant lit une question sur les centimètres devant la colonne des kilomètres. */
		const s = scrollPourCadrer(donnee, demandee, LONGUEURS_CM1.cadre, LONGUEURS_CM1.total, MARGE);
		expect(s, 'le tableau doit être déroulé jusqu’à sa butée pour montrer cm et mm').toBe(37);
		expect(defautsDeCadrage(s, LONGUEURS_CM1, donnee, demandee)).toEqual([]);
	});

	it('« 456 cm = ? m » (vers la gauche) : le cadre ne bouge pas, la question y est déjà entière', () => {
		const donnee = col(LONGUEURS_CM1, 'cm'); // [250, 300]
		const demandee = col(LONGUEURS_CM1, 'm'); // [150, 200]
		// L'intervalle [150, 300] mesure 150 px et la colonne donnée finit à 300, soit dans les
		// 313 px du cadre : le tableau ouvert à 0 montre déjà tout. Reculer serait du mouvement
		// pour rien.
		const s = scrollPourCadrer(donnee, demandee, LONGUEURS_CM1.cadre, LONGUEURS_CM1.total, MARGE);
		expect(s).toBe(0);
		expect(defautsDeCadrage(s, LONGUEURS_CM1, donnee, demandee)).toEqual([]);
	});

	it('« 4 500 mm = ? m » (vers la gauche, depuis la dernière colonne) : le cadre va à la butée', () => {
		const donnee = col(LONGUEURS_CM1, 'mm'); // [300, 350]
		const demandee = col(LONGUEURS_CM1, 'm'); // [150, 200]
		/* La colonne donnée finit au bout du tableau (350) : pour la montrer en entier il faut
		   défiler d'au moins 350 - 313 = 37, et 37 est aussi la butée. L'intervalle [150, 350]
		   mesure 200 px, il entre dans la fenêtre [37, 350]. */
		const s = scrollPourCadrer(donnee, demandee, LONGUEURS_CM1.cadre, LONGUEURS_CM1.total, MARGE);
		expect(s, 'la colonne des mm, celle d’où l’enfant part, resterait hors du cadre').toBe(37);
		expect(defautsDeCadrage(s, LONGUEURS_CM1, donnee, demandee)).toEqual([]);
	});

	it('position INTERMÉDIAIRE : la même paire de colonnes, rôles échangés, donne deux cadrages différents', () => {
		/* Tableau zoomé (420 px) : ici le défilement n'est collé à aucune butée, donc la règle doit
		   vraiment calculer. Colonnes hm [60, 120] et cm [300, 360], intervalle de 300 px pour un
		   cadre de 313 : il tient, dans les deux sens.

		   Ce que ce test GARDE, au-delà des deux valeurs : la promesse faite à l'enfant par le
		   critère 25 est tenue même quand la question tient — le tableau s'ouvre TOUJOURS sur la
		   colonne de départ, donc l'ouverture est prévisible d'une question à l'autre. Si un jour
		   on décidait de cadrer autrement quand l'intervalle tient (centrer, par exemple), c'est
		   CE test qu'il faudrait rouvrir : son échec serait une décision, pas une régression. */
		const hm = col(LONGUEURS_ZOOM, 'hm');
		const cm = col(LONGUEURS_ZOOM, 'cm');
		const g = LONGUEURS_ZOOM;

		// « 4 hm = ? cm » : on part de hm, on écrit vers la droite. Le cadre s'ouvre 8 px avant
		// hm (60 - 8) et s'étend jusqu'à 365 : toute la question y est.
		const versLaDroite = scrollPourCadrer(hm, cm, g.cadre, g.total, MARGE);
		expect(versLaDroite, 'le cadre ne s’ouvre pas sur la colonne de départ (hm)').toBe(52);

		// « 4 cm = ? hm » : on part de cm, on écrit vers la gauche. Le cadre se pose cette fois par
		// sa droite, 8 px après cm (360 + 8 - 313 = 55).
		const versLaGauche = scrollPourCadrer(cm, hm, g.cadre, g.total, MARGE);
		expect(versLaGauche, 'le cadre ne s’ouvre pas sur la colonne de départ (cm)').toBe(55);

		// Le point qui compte : le cadrage dépend de QUI est la donnée, pas de « la plus à gauche
		// des deux ». Une règle qui prendrait toujours la colonne de gauche rendrait deux fois 52.
		expect(
			versLaDroite,
			'les deux sens donnent le même cadrage : la règle ignore laquelle des deux colonnes est le point de départ',
		).not.toBe(versLaGauche);
		expect(defautsDeCadrage(versLaDroite, g, hm, cm)).toEqual([]);
		expect(defautsDeCadrage(versLaGauche, g, cm, hm)).toEqual([]);
	});
});

/* ============================================================
   Critères 23 et 25 : quand la question ne tient pas dans le cadre
   ============================================================ */

describe('#711 lot 5 — critères 23/25 : l’intervalle des masses ne tient pas, la colonne donnée est cadrée', () => {
	it('les géométries de test portent bien les mesures de l’issue (332, 346, 313)', () => {
		// Garde-fou sur mes propres fixtures : si l'une des largeurs est retouchée par mégarde,
		// tous les attendus de défilement ci-dessous deviennent faux sans raison visible.
		expect(MASSES_CE2.total, 'intervalle kg→mg au CE2').toBe(332);
		expect(MASSES_CM1.total, 'intervalle kg→mg au CM1').toBe(346);
		expect(CADRE).toBe(313);
		expect(MASSES_CM1.total, 'le critère 23 dit que ça ne tient pas').toBeGreaterThan(CADRE);
		expect(MASSES_CE2.total).toBeGreaterThan(CADRE);
	});

	it('« 3 kg = ? mg » au CM1 : la colonne kg est cadrée, même si mg reste hors du cadre', () => {
		const donnee = col(MASSES_CM1, 'kg'); // [0, 52]
		const demandee = col(MASSES_CM1, 'mg'); // [297, 346]
		// 346 px de question pour 313 px de cadre : quelque chose sera coupé, et le critère 25
		// dit lequel. La colonne donnée est la première : le cadre reste au début.
		const s = scrollPourCadrer(donnee, demandee, MASSES_CM1.cadre, MASSES_CM1.total, MARGE);
		expect(s).toBe(0);
		expect(defautsDeCadrage(s, MASSES_CM1, donnee, demandee)).toEqual([]);
		expect(defautsDeSens(s, MASSES_CM1, donnee, demandee)).toEqual([]);
	});

	it('« 5 000 mg = ? kg » au CM1 : le tableau est déroulé jusqu’à montrer mg — c’est LÀ que le cadrage change tout', () => {
		const donnee = col(MASSES_CM1, 'mg'); // [297, 346]
		const demandee = col(MASSES_CM1, 'kg'); // [0, 52]
		/* Le cas décisif du critère 25. La colonne mg finit à 346 : pour la voir en entier il faut
		   défiler d'au moins 346 - 313 = 33, et 33 est justement la butée. Aujourd'hui le tableau
		   s'ouvre à 0 et la colonne d'où l'enfant doit partir n'est PAS à l'écran : il voit le
		   kilogramme, qui est déjà écrit dans son énoncé, et pas le milligramme, qu'il doit
		   localiser seul. Une règle « on cadre sur la plus à gauche des deux » rendrait 0 ici. */
		const s = scrollPourCadrer(donnee, demandee, MASSES_CM1.cadre, MASSES_CM1.total, MARGE);
		expect(
			s,
			'la colonne mg, seul point de départ que l’énoncé n’écrit pas, resterait hors du cadre',
		).toBe(33);
		expect(defautsDeCadrage(s, MASSES_CM1, donnee, demandee)).toEqual([]);
		expect(defautsDeSens(s, MASSES_CM1, donnee, demandee)).toEqual([]);
	});

	it('au CE2 le tableau est plus étroit (332 px) mais le raisonnement est le même', () => {
		const mg = col(MASSES_CE2, 'mg'); // [285, 332]
		const kg = col(MASSES_CE2, 'kg'); // [0, 50]
		// Butée : 332 - 313 = 19, et il en faut au moins autant pour montrer mg en entier.
		expect(scrollPourCadrer(mg, kg, MASSES_CE2.cadre, MASSES_CE2.total, MARGE)).toBe(19);
		expect(scrollPourCadrer(kg, mg, MASSES_CE2.cadre, MASSES_CE2.total, MARGE)).toBe(0);
	});

	it('conversion courte dans un tableau qui déborde : la question tient, elle est montrée en entier', () => {
		// Contre-exemple utile : que le TABLEAU déborde ne veut pas dire que la QUESTION déborde.
		const kg = col(MASSES_CM1, 'kg'); // [0, 52]
		const g = col(MASSES_CM1, 'g'); // [150, 199]
		expect(scrollPourCadrer(kg, g, MASSES_CM1.cadre, MASSES_CM1.total, MARGE)).toBe(0);
		expect(scrollPourCadrer(g, kg, MASSES_CM1.cadre, MASSES_CM1.total, MARGE)).toBe(0);
	});
});

/* ============================================================
   Bornes, butées et valeurs dégénérées
   ============================================================ */

describe('#711 lot 5 — le défilement rendu est toujours une position atteignable', () => {
	it('tableau plus court que son cadre : la seule réponse possible est 0, jamais un nombre négatif', () => {
		/* 250 px de tableau dans 313 px de cadre : il n'y a rien à faire défiler, tout est déjà
		   visible. Le piège est dans le bornage : `Math.min(x, total - cadre)` rend ici -63, et un
		   `scrollLeft` négatif est ramené à 0 par le navigateur SANS erreur. Le cadrage aurait donc
		   l'air de marcher — sur ce tableau-là — et la même faute de signe cadrerait de travers
		   ailleurs. C'est exactement le genre de défaut qui ne se voit qu'à l'usage. */
		const fautes: string[] = [];
		for (let i = 0; i < PETIT.cols.length; i++)
			for (let j = 0; j < PETIT.cols.length; j++) {
				if (i === j) continue;
				const s = scrollPourCadrer(PETIT.cols[i], PETIT.cols[j], PETIT.cadre, PETIT.total, MARGE);
				if (s !== 0) fautes.push(`${PETIT.unites[i]} → ${PETIT.unites[j]} : ${s}`);
			}
		expect(
			fautes,
			`Le tableau (250 px) est plus court que son cadre (313 px) : aucune autre position que 0 n'existe.\n${fautes.join('\n')}`,
		).toEqual([]);
	});

	it('colonne donnée à la PREMIÈRE puis à la DERNIÈRE place : le défilement reste entre 0 et la butée', () => {
		for (const t of MESURES) {
			const premiere = t.cols[0];
			const derniere = t.cols[t.cols.length - 1];
			const versLaDroite = scrollPourCadrer(premiere, derniere, t.cadre, t.total, MARGE);
			const versLaGauche = scrollPourCadrer(derniere, premiere, t.cadre, t.total, MARGE);
			expect(versLaDroite, `${t.nom} : cadrage sur la première colonne`).toBe(0);
			expect(versLaGauche, `${t.nom} : cadrage sur la dernière colonne`).toBe(butee(t));
			// Et dans les deux cas la colonne de départ est visible : c'est ce que les valeurs
			// ci-dessus veulent dire.
			expect(defautsDeCadrage(versLaDroite, t, premiere, derniere)).toEqual([]);
			expect(defautsDeCadrage(versLaGauche, t, derniere, premiere)).toEqual([]);
		}
	});

	it('cadre de largeur 0 (tableau pas encore mis en page) : un nombre, ni négatif ni NaN', () => {
		/* Le runner mesure `clientWidth` : avant la mise en page, ou sur un écran masqué, il vaut
		   0. La fonction ne doit pas rendre NaN (qui casserait l'affectation de `scrollLeft` en
		   silence) ni un négatif (ramené à 0 par le navigateur, donc indétectable). */
		const cas: [Segment, Segment, number, number][] = [
			[{ debut: 100, fin: 150 }, { debut: 200, fin: 250 }, 0, 400],
			[{ debut: 200, fin: 250 }, { debut: 100, fin: 150 }, 0, 400],
			[{ debut: 0, fin: 0 }, { debut: 0, fin: 0 }, 0, 0],
		];
		for (const [donnee, demandee, cadre, total] of cas) {
			const s = scrollPourCadrer(donnee, demandee, cadre, total, MARGE);
			expect(Number.isFinite(s), `cadre ${cadre}, total ${total} : défilement « ${s} »`).toBe(true);
			expect(s, `cadre ${cadre}, total ${total} : défilement négatif`).toBeGreaterThanOrEqual(0);
			expect(s, `cadre ${cadre}, total ${total} : au-delà de la butée`).toBeLessThanOrEqual(
				Math.max(0, total - cadre),
			);
		}
	});

	it('segments de largeur nulle, et même segment des deux côtés : réponse définie et atteignable', () => {
		// Colonnes de largeur nulle (colonne masquée, mesure prise trop tôt) : la fonction ne doit
		// pas diviser par la largeur ni sortir des butées.
		const s1 = scrollPourCadrer(
			{ debut: 100, fin: 100 },
			{ debut: 200, fin: 200 },
			313,
			400,
			MARGE,
		);
		expect(Number.isFinite(s1), 'colonnes de largeur nulle : défilement non calculable').toBe(true);
		expect(s1).toBeGreaterThanOrEqual(0);
		expect(s1).toBeLessThanOrEqual(400 - 313);

		// « 3 m = ? m » : les deux colonnes sont la même. Le sens de la conversion n'existe pas,
		// mais la colonne doit rester visible — c'est la seule exigence qui garde un sens.
		const m = col(LONGUEURS_CM1, 'm');
		const s2 = scrollPourCadrer(m, m, LONGUEURS_CM1.cadre, LONGUEURS_CM1.total, MARGE);
		expect(Number.isFinite(s2), '« 3 m = ? m » : défilement non calculable').toBe(true);
		expect(defautsDeCadrage(s2, LONGUEURS_CM1, m, m)).toEqual([]);
	});
});

/* ============================================================
   La marge
   ============================================================ */

describe('#711 lot 5 — la marge : du confort, jamais au prix de la question', () => {
	it('la marge sépare la colonne donnée du bord du cadre, dans les deux sens', () => {
		/* Deux conversions COURTES (deux colonnes voisines, 120 px) au milieu d'un tableau de
		   420 px : la marge y est demandée là où elle ne coûte rien. Le cas où elle coûterait
		   quelque chose — une question qui remplit le cadre — est traité par le dernier test de ce
		   bloc, et il tranche dans l'autre sens. Demander ici la marge ENTIÈRE sur une question
		   large mettrait les deux exigences en contradiction, et la suite ne pourrait plus être
		   verte quoi qu'on implémente. */
		const g = LONGUEURS_ZOOM;
		const hm = col(g, 'hm'); // [60, 120]
		const dam = col(g, 'dam'); // [120, 180]
		const dm = col(g, 'dm'); // [240, 300]
		const cm = col(g, 'cm'); // [300, 360]
		for (const marge of [0, 8, 24]) {
			// « 4 hm = ? dam » : le bord GAUCHE du cadre se pose avant la colonne donnée.
			const droite = scrollPourCadrer(hm, dam, g.cadre, g.total, marge);
			expect(
				hm.debut - droite,
				`marge ${marge} : espace laissé à gauche de la colonne de départ`,
			).toBe(marge);
			// « 4 cm = ? dm » : c'est le bord DROIT du cadre qui s'écarte de la colonne donnée.
			const gauche = scrollPourCadrer(cm, dm, g.cadre, g.total, marge);
			expect(
				gauche + g.cadre - cm.fin,
				`marge ${marge} : espace laissé à droite de la colonne de départ`,
			).toBe(marge);
		}
	});

	it('la marge par défaut est celle que la signature annonce (8 px)', () => {
		const g = LONGUEURS_ZOOM;
		const hm = col(g, 'hm');
		const cm = col(g, 'cm');
		expect(scrollPourCadrer(hm, cm, g.cadre, g.total)).toBe(
			scrollPourCadrer(hm, cm, g.cadre, g.total, MARGE),
		);
		expect(scrollPourCadrer(cm, hm, g.cadre, g.total)).toBe(
			scrollPourCadrer(cm, hm, g.cadre, g.total, MARGE),
		);
	});

	it('quand la marge ne tient pas, elle disparaît — la colonne, elle, reste visible', () => {
		// Colonne donnée collée au bord du tableau : il n'y a pas 8 px avant elle. On perd la
		// respiration, pas la colonne, et surtout on ne rend pas -8.
		const km = col(LONGUEURS_CM1, 'km'); // [0, 50]
		const mm = col(LONGUEURS_CM1, 'mm'); // [300, 350]
		const debut = scrollPourCadrer(km, mm, LONGUEURS_CM1.cadre, LONGUEURS_CM1.total, MARGE);
		expect(debut, 'défilement négatif : ramené à 0 par le navigateur, donc invisible').toBe(0);
		expect(defautsDeCadrage(debut, LONGUEURS_CM1, km, mm)).toEqual([]);

		// Même chose à l'autre bout : la dernière colonne touche la fin du tableau.
		const fin = scrollPourCadrer(mm, km, LONGUEURS_CM1.cadre, LONGUEURS_CM1.total, MARGE);
		expect(fin, 'au-delà de la butée : le cadre s’arrêtera avant, le cadrage sera faux').toBe(
			butee(LONGUEURS_CM1),
		);
		expect(defautsDeCadrage(fin, LONGUEURS_CM1, mm, km)).toEqual([]);
	});

	it('la marge cède avant le critère 21 : elle ne se prélève JAMAIS sur la question elle-même', () => {
		/* Cadre de 300 px, question de 300 px exactement (hm [60, 120] → cm [300, 360], cinq
		   colonnes de 60). L'intervalle TIENT, donc le critère 21 s'applique sans réserve : il
		   n'existe qu'une seule fenêtre de 300 px qui le contienne, [60, 360], soit un défilement
		   de 60.

		   Poser d'abord la marge puis borner, comme la règle le décrit, donne 52 vers la droite
		   (60 - 8) et 68 vers la gauche (360 + 8 - 300) : dans les deux cas 8 px de la colonne
		   DEMANDÉE passent hors du cadre. L'enfant doit faire défiler pour voir la fin de sa
		   propre question, alors qu'elle tenait.

		   Ce n'est pas une géométrie exotique : la largeur du cadre suit celle de l'écran, donc
		   « l'intervalle remplit le cadre à quelques pixels près » finit par arriver sur un
		   appareil ou un autre — et le défaut vaut alors jusqu'à une marge entière.

		   Ce que ce test exige : entre la respiration et la question, c'est la respiration qui
		   saute. Il ne dit pas comment. */
		const g = AJUSTE;
		const hm = col(g, 'hm'); // [60, 120]
		const cm = col(g, 'cm'); // [300, 360]
		expect(largeur(intervalle(hm, cm)), 'la question mesure exactement la largeur du cadre').toBe(
			g.cadre,
		);

		const versLaDroite = scrollPourCadrer(hm, cm, g.cadre, g.total, MARGE);
		expect(defautsDeCadrage(versLaDroite, g, hm, cm)).toEqual([]);
		expect(
			versLaDroite,
			'la seule fenêtre de 300 px qui contient toute la question commence à 60',
		).toBe(60);

		const versLaGauche = scrollPourCadrer(cm, hm, g.cadre, g.total, MARGE);
		expect(defautsDeCadrage(versLaGauche, g, cm, hm)).toEqual([]);
		expect(versLaGauche, 'même question, sens inverse : la même unique fenêtre').toBe(60);
	});
});

/* ============================================================
   Les deux fonctions ensemble
   ============================================================ */

describe('#711 lot 5 — composer les deux fonctions', () => {
	/** Ce que fait le runner (`cadrerSurLaQuestion`, src/ui/lecon-tableau.ts) : trouver les
	    colonnes de la question PAR RÔLE, puis cadrer dessus. Les rôles sont passés jusqu'au
	    bout — c'est ce que le test du piège, plus bas, montre qu'on ne peut pas relâcher. */
	const cadrerLaQuestion = (
		t: Tableau,
		cols: { unite: string }[],
		connue: string,
		demandee: string,
	) => {
		const q = indicesQuestion(cols, connue, demandee);
		if (q === null) return null;
		return scrollPourCadrer(t.cols[q.iDonnee], t.cols[q.iDemandee], t.cadre, t.total, MARGE);
	};

	it('de l’unité à la position : la question est cadrée, dans les deux sens', () => {
		expect(cadrerLaQuestion(MASSES_CM1, MASSES, 'kg', 'mg')).toBe(0);
		expect(cadrerLaQuestion(MASSES_CM1, MASSES, 'mg', 'kg')).toBe(33);
		expect(cadrerLaQuestion(LONGUEURS_CM1, LONGUEURS, 'cm', 'mm')).toBe(37);
	});

	it('une unité introuvable ne se traduit pas en cadrage : rien ne bouge', () => {
		// Le `null` d'`indicesQuestion` doit arrêter la chaîne. Un repli sur une paire par défaut
		// ferait défiler le tableau vers des colonnes sans rapport avec la question — un
		// mouvement que rien n'explique, sur un écran d'enfant.
		expect(cadrerLaQuestion(MASSES_CM1, MASSES, 'm', 'g')).toBeNull();
	});

	it('PIÈGE, pas fonctionnalité : prendre `gauche` pour la colonne donnée cadre toujours à gauche', () => {
		/* `bornesColonnes` rend des POSITIONS, pas des rôles : sur « 5 000 mg = ? kg » comme sur
		   « 3 kg = ? mg », `gauche` vaut 0 (le kilogramme). Un appelant qui passerait `gauche` à
		   `scrollPourCadrer` comme s'il s'agissait du point de départ retomberait donc sur le
		   comportement d'aujourd'hui pour toutes les conversions vers la gauche — et rien, en
		   aval, ne distinguerait les deux cas.

		   Les deux fonctions vivent désormais dans le MÊME module, à une lettre près dans le
		   nom de leurs champs : la substitution est plus facile qu'avant, pas moins. Ce test
		   n'épingle donc pas un comportement souhaité, il fixe le danger pour qu'il ne se
		   redécouvre pas sur la tablette. */
		const mg = col(MASSES_CM1, 'mg');
		const kg = col(MASSES_CM1, 'kg');
		const b = bornesColonnes(MASSES, 'mg', 'kg')!;
		expect(b, 'la réponse est la même dans les deux sens : elle ne porte AUCUN rôle').toEqual(
			bornesColonnes(MASSES, 'kg', 'mg'),
		);
		// La fonction à appeler ici, elle, distingue les deux sens : c'est la seule différence
		// entre le cadrage juste et celui d'aujourd'hui.
		expect(
			indicesQuestion(MASSES, 'mg', 'kg'),
			'les rôles ne survivent pas au trajet : la question de départ ne se retrouve plus',
		).not.toEqual(indicesQuestion(MASSES, 'kg', 'mg'));

		const naif = scrollPourCadrer(
			MASSES_CM1.cols[b.gauche], // « gauche » pris pour la colonne donnée
			MASSES_CM1.cols[b.droite],
			MASSES_CM1.cadre,
			MASSES_CM1.total,
			MARGE,
		);
		const juste = scrollPourCadrer(mg, kg, MASSES_CM1.cadre, MASSES_CM1.total, MARGE);
		expect(
			naif,
			'la composition naïve et la bonne donnent le même résultat : le piège a disparu ?',
		).not.toBe(juste);
		expect(
			defautsDeCadrage(naif, MASSES_CM1, mg, kg).length,
			'la composition naïve devrait laisser la colonne de départ hors du cadre',
		).toBeGreaterThan(0);
		expect(defautsDeCadrage(juste, MASSES_CM1, mg, kg)).toEqual([]);
	});
});

/* ============================================================
   Balayage : toutes les paires de colonnes des tableaux mesurés
   ============================================================ */

describe('#711 lot 5 — balayage de toutes les questions possibles', () => {
	it('sur chaque paire de colonnes, les critères 21, 23 et 25 tiennent', () => {
		/* 42 questions par tableau (7 colonnes, les deux sens), 20 sur le tableau court : les cas
		   qu'un tirage aléatoire mettrait des semaines à produire tous. Le détecteur de SENS n'est
		   appliqué que lorsque l'intervalle NE TIENT PAS : c'est le seul cas dont le critère 25
		   parle, et lier le reste ici figerait un choix de cadrage au lieu d'une exigence (le cas
		   où la question tient est gardé, lui, par un test nommé plus haut). */
		const fautes: string[] = [];
		for (const t of MESURES) {
			for (let i = 0; i < t.cols.length; i++) {
				for (let j = 0; j < t.cols.length; j++) {
					if (i === j) continue;
					const donnee = t.cols[i];
					const demandee = t.cols[j];
					const s = scrollPourCadrer(donnee, demandee, t.cadre, t.total, MARGE);
					const liste = defautsDeCadrage(s, t, donnee, demandee);
					if (largeur(intervalle(donnee, demandee)) > t.cadre)
						liste.push(...defautsDeSens(s, t, donnee, demandee));
					for (const d of liste)
						fautes.push(
							`${t.nom} — « ${t.unites[i]} = ? ${t.unites[j]} » (défilement ${s}) : ${d}`,
						);
				}
			}
		}
		expect(fautes, `Questions mal cadrées :\n${fautes.join('\n')}`).toEqual([]);
	});
});

/* ============================================================
   Témoins : ce que les détecteurs ci-dessus doivent refuser
   ------------------------------------------------------------
   Les deux fonctions ne sont pas appelées ici. `defautsDeCadrage` et `defautsDeSens` portent la
   moitié des exigences du balayage : trop permissifs, ils laisseraient tout vert sur un cadrage
   fautif. On leur soumet donc des positions FABRIQUÉES — dont celle d'aujourd'hui, 0 — et on
   exige qu'ils réagissent, puis les positions justes, sur lesquelles ils doivent se taire.
   ============================================================ */

describe('#711 lot 5 — témoins des détecteurs', () => {
	const mg = col(MASSES_CM1, 'mg');
	const kg = col(MASSES_CM1, 'kg');
	const hm = col(LONGUEURS_ZOOM, 'hm');
	const dam = col(LONGUEURS_ZOOM, 'dam');
	const cm = col(LONGUEURS_ZOOM, 'cm');

	it('le défilement à 0 — le comportement d’AUJOURD’HUI — est signalé sur « 5 000 mg = ? kg »', () => {
		expect(defautsDeCadrage(0, MASSES_CM1, mg, kg).join(' | ')).toMatch(/critère 25/);
	});

	it('centrer l’intervalle laisse la colonne donnée dehors', () => {
		// (346 - 313) / 2 ≈ 16 : les deux extrémités sont rognées, donc la colonne de départ aussi.
		expect(defautsDeCadrage(16, MASSES_CM1, mg, kg).join(' | ')).toMatch(/critère 25/);
	});

	it('pousser le cadre à la butée cache la colonne donnée quand elle est à gauche', () => {
		expect(defautsDeCadrage(33, MASSES_CM1, kg, mg).join(' | ')).toMatch(/critère 25/);
	});

	it('une position hors des butées est signalée, dans les deux sens', () => {
		expect(defautsDeCadrage(-5, MASSES_CM1, kg, mg).join(' | ')).toMatch(/négatif/);
		expect(defautsDeCadrage(999, MASSES_CM1, mg, kg).join(' | ')).toMatch(/butée/);
		expect(defautsDeCadrage(Number.NaN, MASSES_CM1, mg, kg)).toEqual([
			'défilement non calculable (NaN)',
		]);
	});

	it('une question qui TIENT mais qu’on coupe est signalée au titre du critère 21', () => {
		// hm [60, 120] → cm [300, 360] dans un cadre de 313 : la question tient. Ouvert à 0, le
		// cadre s'arrête à 313 et mange la fin de la colonne cible — c'est le critère 21, pas le 25
		// (la colonne donnée, elle, est bien visible).
		const d = defautsDeCadrage(0, LONGUEURS_ZOOM, hm, cm).join(' | ');
		expect(d).toMatch(/critère 21/);
		expect(d).not.toMatch(/critère 25/);
	});

	it('le détecteur de SENS refuse un cadrage qui gaspille la place du mauvais côté', () => {
		// hm [60, 120] → dam [120, 180] : ouvert à 0, toute la question est visible (critère 21
		// satisfait) mais le cadre montre 60 px à gauche du point de départ au lieu de s'étendre
		// vers la droite. Seul le détecteur de sens le voit.
		expect(defautsDeCadrage(0, LONGUEURS_ZOOM, hm, dam)).toEqual([]);
		expect(defautsDeSens(0, LONGUEURS_ZOOM, hm, dam).join(' | ')).toMatch(/critère 25/);
		// Symétrique : partir de dam vers hm et laisser le cadre loin à droite.
		expect(defautsDeSens(107, LONGUEURS_ZOOM, dam, hm).join(' | ')).toMatch(/critère 25/);
	});

	it('contrôle positif : les positions JUSTES ne déclenchent rien', () => {
		/* Sans lui, les témoins ci-dessus prouveraient seulement que les détecteurs crient — pas
		   qu'ils savent se taire. Les quatre positions sont celles calculées à la main dans les
		   tests nommés plus haut. */
		expect(defautsDeCadrage(33, MASSES_CM1, mg, kg)).toEqual([]);
		expect(defautsDeSens(33, MASSES_CM1, mg, kg)).toEqual([]);
		expect(defautsDeCadrage(0, MASSES_CM1, kg, mg)).toEqual([]);
		expect(defautsDeSens(0, MASSES_CM1, kg, mg)).toEqual([]);
		expect(defautsDeCadrage(52, LONGUEURS_ZOOM, hm, cm)).toEqual([]);
		expect(defautsDeSens(52, LONGUEURS_ZOOM, hm, dam)).toEqual([]);
		expect(defautsDeCadrage(55, LONGUEURS_ZOOM, cm, hm)).toEqual([]);
	});
});
