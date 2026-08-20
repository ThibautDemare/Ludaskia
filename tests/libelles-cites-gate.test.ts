import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';

/* ============================================================
   Gate des libellés cités par le guide parents et la vitrine (#599).

   `guide.html` cite des libellés d'interface entre guillemets français : « allez dans
   Français, puis Orthographe, puis "Les dictées de mots" ». Un bouton renommé ou déplacé
   rend ces phrases FAUSSES sans rien casser : CI verte, aucune erreur. Le CLAUDE.md le
   dit déjà — le guide est la plus fragile des trois surfaces utilisateur, parce que
   personne ne le relit en écrivant du code, et que l'écart ne se voit qu'au moment où un
   parent suit un parcours qui n'existe plus.

   ── Deux pistes de l'issue, écartées après mesure ─────────────────────────────
   1. « Restreindre aux citations dans <strong> » : sur les 56 `<strong>` du guide, UN
      seul contient une citation. Le `<strong>` sert à l'emphase, pas à marquer un
      libellé — le filtre aurait couvert 1 citation sur 22.
   2. « Vérifier que la chaîne existe dans src/ » : trop faible pour les mots courts.
      « vous », « dys », « arbre », « vent » se trouvent tous dans `src/`, sans rapport
      avec un libellé. Un gate qui les valide rassure sans rien garder.

   ── Ce qui est fait à la place ────────────────────────────────────────────────
   • Les commentaires HTML sont RETIRÉS avant extraction. Les en-têtes du guide et de la
     vitrine documentent leurs arbitrages en citant abondamment (« pas de section "pour
     les enseignants" », « la description porte aussi "espace parents" ») : 19 des 41
     citations du dépôt vivent là. Un commentaire n'est pas une promesse faite au lecteur.
   • Chaque citation restante doit être CLASSÉE, dans l'une des deux tables ci-dessous.
     C'est le cœur du gate : une citation ajoutée demain au guide ne peut pas passer
     inaperçue, il faudra dire ce qu'elle est. Le classement ne peut pas s'automatiser
     (« à revoir » est un libellé affiché, « il a du mal en conjugaison » est une phrase
     de parent) — mais l'OUBLI de classer, si.
   • Un libellé est prouvé présent par sa POSITION, pas par simple inclusion : il doit
     terminer le texte d'un élément ou la valeur d'un attribut (`>Mes listes<`,
     `aria-label="Écouter"`). Mesuré : la règle passe sur les 15 libellés actuels et
     réduit fortement le bruit — « Fiche » tombe de 10 fichiers à 1, et ce fichier est
     bien celui que le guide décrit (`encadrant-progression.ts`).

   ── Ce que ce gate attrape, et ce qu'il laisse passer ─────────────────────────
   Éprouvé par mutation : renommer « Mes listes » en « Mes listes de mots » échoue, et
   « Fiche » en « Fiche à imprimer » aussi — l'élargissement d'un libellé est donc bien
   attrapé, contrairement à ce qu'on pourrait craindre d'une simple recherche de
   sous-chaîne (c'est le bénéfice de la règle de POSITION : le libellé doit terminer le
   texte de son élément).

   Ce qui passe encore, en revanche :
   • le DÉPLACEMENT — le libellé existe toujours, mais plus là où le guide l'annonce.
     Le parcours décrit (« Français, puis Orthographe, puis… ») n'est pas vérifié ;
     seulement que chaque étape nommée existe encore quelque part. Il reste l'affaire de
     `e2e/guide.spec.ts` et de la relecture.
   • le renommage d'UN porteur quand il y en a plusieurs : « À revoir » apparaît en
     position de libellé dans trois fichiers, donc en renommer un laisse le gate vert.
   ============================================================ */

const PAGES = ['guide.html', 'index.html'];

/** Libellés d'INTERFACE cités par le guide ou la vitrine. Une entrée = une promesse
 *  faite au lecteur : « ce bouton, cette entrée de menu, ce bloc s'appelle comme ça ».
 *  La valeur dit où, pour que qui corrige sache quel écran regarder. */
const LIBELLES: Record<string, string> = {
	'Espace encadrants': "entrée du menu de profil, et bouton en bas de l'écran « Mon espace »",
	'Mon espace': 'écran de profil (barre d’outils, en haut à droite)',
	"Code d'accès": 'bloc des Réglages de l’espace encadrants',
	"J'ai oublié mon code": 'lien de récupération, sur la demande de code',
	'À revoir ensemble': 'bloc de suggestions de l’espace encadrants',
	'À revoir': 'carte sur l’accueil de l’enfant, pour une leçon épinglée',
	'Choisis pour moi': 'bouton de l’écran de séance, quand l’enfant hésite',
	'Les dictées de mots': 'entrée de navigation (Français → Orthographe)',
	'Mes listes': 'colonne de l’écran des dictées',
	'Ajouter une liste': 'bouton de cette colonne',
	Fiche: 'bouton d’impression, sur chaque leçon de l’espace encadrants',
	Corrigé: 'le second bouton d’impression, à côté de « Fiche »',
	Écouter: 'bouton de lecture vocale de la consigne',
	'à renforcer': 'état d’une notion, affiché dans le suivi',
	'à revoir': 'état d’une leçon épinglée, affiché à l’enfant',
};

/** Citations qui ne sont PAS des libellés : elles n'ont donc rien à vérifier dans le
 *  code. Chacune avec sa raison — sans quoi cette table deviendrait le moyen le plus
 *  simple de faire taire le gate. */
const CITATIONS_DE_LANGUE: Record<string, string> = {
	'il a du mal en conjugaison':
		"phrase de parent, citée pour la contraster avec ce que montre le journal d'erreurs.",
	'Dictée du 12 mars':
		'exemple de nom de liste que le parent est invité à inventer, pas un libellé.',
	dys: 'mot employé comme catégorie de difficulté (« troubles dys »), pas un élément d’interface.',
	'Il a mangé.': 'phrase de démonstration de la vitrine (exemple d’exercice), pas un libellé.',
};

/* ---------- Extraction ---------- */

/** Texte lisible d'une citation : entités d'espace insécable ramenées à une espace,
 *  balises internes retirées (la vitrine met un `<span>` au milieu d'une phrase de
 *  démonstration), espaces repliés. */
function normaliser(brut: string): string {
	return (
		brut
			// Entités ET caractères littéraux : l'insécable s'écrit des deux façons dans le
			// dépôt. Échappés en \u… plutôt qu'écrits tels quels, parce qu'ESLint refuse les
			// espaces irrégulières dans le source (no-irregular-whitespace) — à juste titre,
			// elles y sont invisibles à la relecture.
			.replace(/&nbsp;|&#8239;|&#160;|\u00a0|\u202f/g, ' ')
			.replace(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

type Citation = { page: string; texte: string };

const CITATIONS: Citation[] = PAGES.flatMap((page) => {
	const html = readFileSync(page, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
	return [...html.matchAll(/«([^»]*)»/g)].map((m) => ({ page, texte: normaliser(m[1]) }));
});

/** Une citation par texte distinct (« Espace encadrants » est cité deux fois). */
const DISTINCTES = [...new Map(CITATIONS.map((c) => [c.texte, c])).values()];

/* ---------- Sources ---------- */

function fichiersTs(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir)) {
		const p = `${dir}/${e}`;
		if (statSync(p).isDirectory()) out.push(...fichiersTs(p));
		else if (p.endsWith('.ts')) out.push(p);
	}
	return out;
}

const SOURCES = fichiersTs('src').map((f) => ({ nom: f, src: readFileSync(f, 'utf8') }));

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Fichiers où le libellé apparaît EN POSITION DE LIBELLÉ : il termine le texte d'un
 *  élément ou la valeur d'un attribut, et ne commence pas au milieu d'un mot. */
function porteurs(libelle: string): string[] {
	const motif = new RegExp(`(?<![\\p{L}])${echapper(libelle)}\\s*(?=<|["'])`, 'u');
	return SOURCES.filter((f) => motif.test(f.src)).map((f) => f.nom);
}

describe('Libellés cités par le guide et la vitrine (#599)', () => {
	it('les citations sont bien extraites (garde contre un gate à vide)', () => {
		// Un changement de typographie (guillemets droits, entités) ou une page renommée
		// rendrait tous les tests suivants verts en n'examinant plus rien.
		expect(
			CITATIONS.length,
			'moins de 15 citations « … » trouvées dans guide.html + index.html : la typographie ' +
				'ou le découpage des pages a changé, ce gate ne garde plus rien.',
		).toBeGreaterThanOrEqual(15);
		expect(Object.keys(LIBELLES).length).toBeGreaterThanOrEqual(12);
	});

	it.each(DISTINCTES)('$page : la citation « $texte » est classée', ({ page, texte }) => {
		expect(
			texte in LIBELLES || texte in CITATIONS_DE_LANGUE,
			`${page} cite « ${texte} » sans que ce test sache ce que c'est.\n` +
				`Si c'est un LIBELLÉ d'interface, l'ajouter à LIBELLES avec l'endroit où il vit : ` +
				`le gate vérifiera alors qu'il existe encore dans src/.\n` +
				`Si c'est une citation de LANGUE (phrase de parent, exemple, mot au sens figuré), ` +
				`l'ajouter à CITATIONS_DE_LANGUE avec sa raison.\n` +
				`Ne pas laisser une citation non classée : c'est le seul moyen qu'a ce gate de ne pas ` +
				`rater le libellé ajouté demain.`,
		).toBe(true);
	});

	it.each(Object.entries(LIBELLES))(
		'le libellé « %s » existe encore dans l’interface',
		(libelle, ou) => {
			const trouves = porteurs(libelle);
			expect(
				trouves.length,
				`Le guide (ou la vitrine) promet un libellé « ${libelle} » — ${ou} — qui n'apparaît plus ` +
					`en position de libellé dans src/.\n` +
					`Le parent qui suit ces instructions ne trouvera pas ce sur quoi cliquer, et rien ` +
					`d'autre ne le signalera.\n` +
					`Soit remettre à jour guide.html / index.html, soit — si le libellé a simplement ` +
					`changé de nom — mettre à jour la citation ET cette table.`,
			).toBeGreaterThan(0);
		},
	);

	it('aucune entrée des deux tables ne décrit une citation disparue', () => {
		// Une entrée orpheline (citation retirée du guide) resterait à décrire une promesse
		// qui n'est plus faite, et masquerait le jour où la même chaîne revient ailleurs.
		const citees = new Set(DISTINCTES.map((c) => c.texte));
		for (const l of Object.keys(LIBELLES))
			expect(
				citees.has(l),
				`« ${l} » n'est plus cité par guide.html ni index.html : retirer son entrée de LIBELLES.`,
			).toBe(true);
		for (const l of Object.keys(CITATIONS_DE_LANGUE))
			expect(
				citees.has(l),
				`« ${l} » n'est plus cité par guide.html ni index.html : retirer son entrée de ` +
					`CITATIONS_DE_LANGUE.`,
			).toBe(true);
	});

	it('une citation n’est pas classée dans les deux tables à la fois', () => {
		// Sinon la table « de langue » l'emporterait en silence sur la vérification, et un
		// libellé cesserait d'être gardé sans que personne ne l'ait décidé.
		for (const l of Object.keys(LIBELLES))
			expect(
				l in CITATIONS_DE_LANGUE,
				`« ${l} » est à la fois un libellé et une citation de langue : trancher.`,
			).toBe(false);
	});
});
