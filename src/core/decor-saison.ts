/* ============================================================
   Décor de saison (#785) : QUELLE saison décorer, et avec QUOI.
   Module pur, sans autre dépendance que `date-locale.ts` (pur lui aussi) : la vitrine
   (index.html) l'importe, et elle ne charge ni profils ni stockage. Le rendu est dans
   `ui/decor-saison.ts`.

   Motifs autorisés pour Noël, liste FERMÉE (critère 11) : flocons, sapin, cadeaux,
   guirlandes, bonnet. Aucun motif religieux. Tout autre motif passe par le mainteneur.
   ============================================================ */
import { DECEMBRE } from './date-locale';

/** Saisons décorées. Noël seulement pour l'instant (#785) ; Halloween et l'été sont
 *  cadrés à part (#786, #787). */
export type Saison = 'noel';

/** Saison à décorer pour une date, lue à l'heure LOCALE de l'appareil (critère 10) :
 *  `'noel'` du 1er au 31 décembre, `null` le reste de l'année. Changer l'horloge de la
 *  tablette change donc le décor : accepté au cadrage, sans enjeu. */
export function saisonDu(date: Date): Saison | null {
	return date.getMonth() === DECEMBRE ? 'noel' : null;
}

/** SVG de la forêt du pied de page, pour une date (critère 35) : les sapins enneigés du
 *  1er au 31 décembre, la forêt de l'année sinon. Les deux sont pré-générés par
 *  `tools/forest/generate-forest.mjs` (`npm run forest:gen`). L'accueil et la vitrine s'en
 *  servent ; le guide, jamais : il garde la forêt de l'année (critère 37). */
export function fichierForet(date: Date): 'foret-pied-noel.svg' | 'foret-pied.svg' {
	return saisonDu(date) === 'noel' ? 'foret-pied-noel.svg' : 'foret-pied.svg';
}

/** Plan de profondeur d'un flocon, du plus lointain au plus proche. Plus un flocon est
 *  proche, plus il est grand, rapide et marqué (couleur `--flocon-proche` devant). Seul le
 *  premier plan est flou (rendu par `decor-saison.scss`) ; les lointains ont un dessin
 *  simple, leur détail ne se verrait pas. */
export type PlanFlocon = 'loin' | 'milieu' | 'devant' | 'premier-plan';

/** Un flocon du décor de Noël. Positions, durées et dessins FIXES : le décor est le même à
 *  chaque visite, et les tests peuvent en vérifier les bornes (critère 12). */
export interface FloconSpec {
	/** Position horizontale, en % de la largeur de l'écran (0-100). */
	x: number;
	/** Taille, en px. */
	taille: number;
	/** Durée d'une traversée complète de l'écran, en secondes. */
	duree: number;
	/** Avance dans le cycle au chargement (0-1) : délai négatif, pour que les flocons ne
	 *  partent pas tous du haut en même temps. */
	phase: number;
	plan: PlanFlocon;
	/** Graine du dessin (`brancheCristal`) : une graine par flocon, donc un dessin par flocon. */
	graine: number;
	/** Opacité au plus visible (0-1). */
	opacite: number;
	/** Amplitude de la dérive horizontale, en px. */
	derive: number;
	/** Rotation fixe du dessin, en degrés. */
	rotation: number;
}

/** Constructeur compact : une ligne par flocon, dans l'ordre des champs de `FloconSpec`. */
const f = (
	x: number,
	taille: number,
	duree: number,
	phase: number,
	plan: PlanFlocon,
	graine: number,
	opacite: number,
	derive: number,
	rotation: number,
): FloconSpec => ({ x, taille, duree, phase, plan, graine, opacite, derive, rotation });

/** Les flocons du décor de Noël, en quatre plans (mainteneur, 11/11/2026) :
 *  - 5 lointains (9-13 px, 40-46 s, dessin simple), 5 au milieu (24-34 px, 26-32 s),
 *    4 devant (40-52 px, 19-23 s), 2 au premier plan (66-70 px, 15,5-16,5 s, seuls flous).
 *    Jamais moins de 15 s par traversée (critère 12). Le designer conseillait 8 à 18 px,
 *    sous la taille des icônes (20-24 px) ; agrandis à la demande du mainteneur, pour
 *    profiter du dessin des cristaux ;
 *  - la profondeur tient à l'écart de VITESSE (un lointain met près de trois fois plus de
 *    temps qu'un flocon du premier plan à traverser l'écran), à la taille, à la dérive et au
 *    CONTRASTE : lointains en `--flocon` à 0,75-0,8 d'opacité, plans de devant en
 *    `--flocon-proche`, plus foncé. Le tout dans la fourchette 1,5:1 à 3:1 du critère 15
 *    (gate : `tests/contraste-decor-saison.test.ts`) ;
 *  - l'opacité n'est nulle qu'aux deux bouts du cycle : presque tous sont visibles à la fois ;
 *  - rangés du plus lointain au plus proche : l'ordre du DOM est l'ordre de peinture, un
 *    flocon proche passe donc devant un lointain. */
export const FLOCONS: readonly FloconSpec[] = [
	// x %, taille px, durée s, phase, plan, graine, opacité de pic, dérive px, rotation °
	f(8, 11, 44, 0.08, 'loin', 11, 0.75, 6, 10),
	f(30, 9, 41, 0.52, 'loin', 23, 0.8, 5, 25),
	f(52, 13, 46, 0.31, 'loin', 31, 0.75, 7, 40),
	f(71, 10, 40, 0.77, 'loin', 37, 0.8, 6, 5),
	f(93, 12, 43, 0.19, 'loin', 41, 0.75, 8, 50),
	f(3, 28, 30, 0.64, 'milieu', 43, 0.9, 16, 15),
	f(18, 24, 32, 0.42, 'milieu', 47, 0.95, 14, 30),
	f(39, 32, 28, 0.9, 'milieu', 59, 0.9, 18, 20),
	f(60, 26, 31, 0.27, 'milieu', 61, 1, 15, 45),
	f(81, 34, 26, 0.58, 'milieu', 71, 0.95, 20, 0),
	f(12, 44, 22, 0.13, 'devant', 73, 1, 26, 35),
	f(47, 50, 20, 0.71, 'devant', 89, 1, 28, 55),
	f(68, 40, 23, 0.45, 'devant', 53, 1, 24, 15),
	f(89, 52, 19, 0.05, 'devant', 67, 1, 30, 30),
	f(25, 70, 16.5, 0.55, 'premier-plan', 97, 1, 38, 0),
	f(77, 66, 15.5, 0.85, 'premier-plan', 101, 1, 42, 35),
];

/** Tirage pseudo-aléatoire DÉTERMINISTE (mulberry32) : même graine, même suite, donc même
 *  dessin à chaque visite. Valeurs dans [0, 1[. */
function tirage(graine: number): () => number {
	let a = graine >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const arrondi2 = (v: number): string => String(Math.round(v * 100) / 100);
const SIN60 = Math.sin(Math.PI / 3);

/** Demi-côté de la vue du cristal : le dessin d'une branche (fourche, ramures et brindilles
 *  comprises) reste à moins de 11,1 de son centre, trait compris jusqu'à 1,8 d'épaisseur. */
export const RAYON_CRISTAL = 12.5;

/** Familles de cristaux. Chacune garde un dessin AÉRÉ : pas d'empilement de motifs (plaque
 *  double, pointes en losange, ramures ramifiées ou serrées) qui, à la taille réelle des
 *  flocons, se lisait comme un engrenage ou un pâté.
 *  - `etoile` : 2 ou 3 paires de longues ramures, parfois une fourche à la pointe ;
 *  - `plaque` : un hexagone au cœur, quelques ramures vers la pointe ;
 *  - `fougere` : 3 paires de ramures de plus en plus courtes vers la pointe.
 *  Les lointains, trop petits pour qu'un détail se voie, ont un dessin simple : une paire. */
const FAMILLES = ['etoile', 'plaque', 'fougere'] as const;

/** Une paire de ramures symétriques, partant de la branche à la hauteur `y`. Pas de
 *  ramification des ramures : essayée, elle s'agglutinait aux jonctions et bouchait le
 *  dessin à la taille réelle des flocons. */
function paire(y: number, ramure: number, angle: number): string {
	const dx = arrondi2(ramure * Math.sin(angle));
	const dy = arrondi2(-ramure * Math.cos(angle));
	return `M0 ${arrondi2(y)}l-${dx} ${dy}M0 ${arrondi2(y)}l${dx} ${dy}`;
}

/** Tracé SVG (`d`) d'UNE branche de cristal, dressée vers le haut depuis le centre. Le rendu
 *  la tourne six fois : la symétrie d'ordre 6 d'un vrai flocon tient par construction, et
 *  chaque ramure a sa jumelle de l'autre côté de la branche. La graine choisit la famille
 *  (cf. `FAMILLES`) puis ses proportions ; `simple` donne le dessin des lointains. */
export function brancheCristal(graine: number, simple = false): string {
	const r = tirage(graine);
	const entre = (min: number, max: number) => min + (max - min) * r();
	const longueur = entre(9, 9.8);
	const t: Trace = {
		entre,
		r,
		y: (place) => -longueur * place,
		fourche: () => `M0 ${arrondi2(-longueur)}l-1.1 -1.1M0 ${arrondi2(-longueur)}l1.1 -1.1`,
	};
	const tige = `M0 0V${arrondi2(-longueur)}`;
	if (simple) return tige + paire(t.y(entre(0.5, 0.65)), entre(2.6, 3.4), deg(60));

	const famille = FAMILLES[Math.floor(r() * FAMILLES.length)]!;
	switch (famille) {
		case 'etoile':
			return tige + etoile(t);
		case 'plaque':
			return tige + plaque(t);
		case 'fougere':
			return tige + fougere(t);
		default:
			return famille satisfies never;
	}
}

/** Ce dont chaque famille a besoin pour tracer sa branche, ORDRE DES TIRAGES compris : la
 *  suite de `r` est partagée, et la changer changerait tous les dessins. */
interface Trace {
	r: () => number;
	entre: (min: number, max: number) => number;
	/** Ordonnée d'un point placé à la fraction `place` de la branche. */
	y: (place: number) => number;
	/** Petite fourche à la pointe de la branche. */
	fourche: () => string;
}

const deg = (d: number): number => (d * Math.PI) / 180;

function etoile({ r, entre, y, fourche }: Trace): string {
	const paires = 2 + Math.floor(r() * 2);
	const angle = deg(entre(55, 60));
	let traits = '';
	for (let k = 0; k < paires; k++) {
		const place = 0.4 + (0.45 * (k + 0.5)) / paires + entre(-0.03, 0.03);
		traits += paire(y(place), entre(2.6, 3.4) * (1 - 0.4 * place), angle);
	}
	return r() < 0.5 ? traits + fourche() : traits;
}

function plaque({ r, entre, y, fourche }: Trace): string {
	const h = entre(3, 4); // un côté d'hexagone par branche : six côtés une fois tournée
	let traits = `M0 ${arrondi2(-h)}L${arrondi2(h * SIN60)} ${arrondi2(-h / 2)}`;
	const paires = 1 + Math.floor(r() * 2);
	for (let k = 0; k < paires; k++) {
		const place = 0.6 + (0.25 * k) / Math.max(1, paires - 1) + entre(-0.03, 0.03);
		traits += paire(y(place), entre(1.8, 2.6), deg(60));
	}
	return r() < 0.3 ? traits + fourche() : traits;
}

/** Ramures loin du centre, où les branches s'écartent : près du cœur, elles se
 *  toucheraient d'une branche à l'autre et le cristal tournerait au pâté. */
function fougere({ entre, y }: Trace): string {
	const angle = deg(entre(50, 58));
	let traits = '';
	for (let k = 0; k < 3; k++) {
		const avance = k / 2; // 0 au pied des ramures, 1 vers la pointe
		traits += paire(y(0.42 + 0.44 * avance), 2.6 - 1.5 * avance, angle);
	}
	return traits;
}
