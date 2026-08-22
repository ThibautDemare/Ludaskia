import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/* ============================================================
   Contraintes d'architecture EXÉCUTABLES (#579).

   Trois conventions du CLAUDE.md étaient tenues par la seule discipline de
   relecture : `core`/`data` ne dépendent pas du rendu, le noyau logique ne touche
   pas au DOM, et la persistance passe exclusivement par `lsGet`/`lsSet`. Mesure du
   19/08/2026 : zéro violation dans le code. Ces règles ne corrigent donc rien —
   elles empêchent la régression, et retirent trois points de la checklist mentale
   du relecteur à chaque PR.

   `no-restricted-globals` ne se CUMULE pas d'un bloc de config à l'autre : le
   dernier bloc qui matche un fichier remplace la valeur de la règle. D'où trois
   blocs disjoints (core/data, storage.ts, le reste de src/) plutôt qu'un bloc
   général plus des exceptions — chaque bloc énumère TOUT ce qu'il interdit.
   ============================================================ */

const SANS_DOM = [
	{
		name: 'document',
		message:
			'`src/core` et `src/data` doivent rester testables sans navigateur : passer par `src/ui` pour le rendu.',
	},
	{
		name: 'window',
		message:
			'`src/core` et `src/data` doivent rester testables sans navigateur : passer par `src/ui` pour le rendu.',
	},
];

const MESSAGE_STOCKAGE =
	'Passer par `lsGet`/`lsSet` (src/core/storage.ts) : le préfixe de profil actif y est appliqué, un accès direct écrirait hors du profil.';

const STOCKAGE_CONFINE = { name: 'localStorage', message: MESSAGE_STOCKAGE };

/* `no-restricted-globals` ne voit que l'identifiant NU. `window.localStorage` est une
   écriture aussi banale que `localStorage` tout court, et passerait à travers — d'autant
   que `window` reste autorisé dans `src/ui`. On ferme donc l'accès par membre, quel que
   soit le porteur (`window`, `globalThis`). */
const STOCKAGE_PAR_MEMBRE = {
	selector: "MemberExpression[property.name='localStorage']",
	message: MESSAGE_STOCKAGE,
};

/* Échappement HTML par construction (#614).

   `.innerHTML` accepte n'importe quelle chaîne, et le typechecker ne distingue pas
   un fragment de balisage d'un texte saisi par un enfant. La règle exige donc que la
   valeur affectée soit lue sur un `SafeHtml` — c'est-à-dire de la forme `X.balisage`,
   la seule façon d'extraire le balisage d'un fragment construit par `html` ou déclaré
   par `brut`. Une chaîne, un littéral gabarit, une concaténation : refusés.

   La règle est plus stricte que « pas de littéral gabarit sur .innerHTML » : elle
   ferme aussi le cas d'une variable `string` fabriquée trois lignes plus haut, qui
   aurait passé un contrôle limité à la forme littérale. Sa liste d'exemptions est
   VIDE — décision de cadrage : la conversion est faite en un seul lot.

   Ce qu'elle ne couvre pas : `insertAdjacentHTML`, `outerHTML`, `document.write`.
   Aucun n'est utilisé dans `src/` aujourd'hui ; les ajouter reviendrait à interdire
   des formes que personne n'écrit. */
const MESSAGE_ECHAPPEMENT =
	'Affecter un SafeHtml à `.innerHTML` : `el.innerHTML = html`<p>${valeur}</p>`.balisage`. ' +
	'Le gabarit `html` (src/core/html.ts) échappe chaque interpolation SELON SA POSITION ' +
	"(texte, valeur d'attribut, URL). Une chaîne construite à la main n'offre aucune de ces " +
	'garanties : le `${}` qu’on oublie ne fait rougir ni le typechecker ni les tests, et ' +
	"n'apparaît qu'à l'exécution. Fragment de confiance : `brut()`, avec sa raison en commentaire.";

const ECHAPPEMENT_INNERHTML = {
	selector:
		"AssignmentExpression[left.type='MemberExpression'][left.property.name='innerHTML']" +
		":not([right.type='MemberExpression'][right.property.name='balisage'])" +
		// `el.innerHTML = ''` VIDE l'élément : rien n'y est injecté, donc rien à garder.
		// L'interdire n'apporterait aucune sûreté et forcerait un `VIDE.balisage` illisible.
		":not([right.type='Literal'][right.value=''])",
	message: MESSAGE_ECHAPPEMENT,
};

export default tseslint.config(
	// `.claude/` (worktrees, configs d'agents) hors périmètre de lint. NB : en flat
	// config, `.eslintignore` n'est PAS lu — l'ignore doit vivre ici.
	{ ignores: ['dist', 'node_modules', '.claude'] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
			'no-empty': ['error', { allowEmptyCatch: true }],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', caughtErrors: 'none' },
			],
		},
	},

	// Noyau logique et données : ni rendu, ni DOM, ni stockage direct.
	{
		files: ['src/core/**/*.ts', 'src/data/**/*.ts'],
		ignores: ['src/core/storage.ts'],
		rules: {
			'no-restricted-globals': ['error', ...SANS_DOM, STOCKAGE_CONFINE],
			'no-restricted-syntax': ['error', STOCKAGE_PAR_MEMBRE],
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['**/ui/*', '**/ui/**'],
							message:
								'Dépendance interdite : `src/core` et `src/data` ne connaissent pas le rendu. Inverser la dépendance (c’est `src/ui` qui importe le noyau).',
						},
					],
				},
			],
		},
	},

	// La seule porte du stockage : elle a le droit de toucher `localStorage`, et
	// c'est précisément sa raison d'être. Le reste des interdits du noyau tient.
	{
		files: ['src/core/storage.ts'],
		rules: { 'no-restricted-globals': ['error', ...SANS_DOM] },
	},

	// Reste de `src/` (rendu, points d'entrée) : le DOM est légitime, le stockage
	// direct non. EXCEPTION déclarée ici plutôt qu'en `eslint-disable` isolé :
	// `src/vitrine.ts` lit BRUTEMENT la clé des profils pour décider d'afficher le
	// lien « Continuer ». La vitrine est une page à part, qui ne charge pas la
	// couche stockage de l'app — l'y forcer alourdirait la page d'accueil pour une
	// seule lecture booléenne.
	{
		files: ['src/**/*.ts'],
		ignores: ['src/core/**', 'src/data/**', 'src/vitrine.ts'],
		rules: {
			'no-restricted-globals': ['error', STOCKAGE_CONFINE],
			'no-restricted-syntax': ['error', STOCKAGE_PAR_MEMBRE, ECHAPPEMENT_INNERHTML],
		},
	},

	// L'échappement vaut pour TOUT `src/`, y compris les points d'entrée que la
	// section précédente écarte pour le stockage (`src/vitrine.ts`) et le noyau,
	// qui n'a pas le droit au DOM mais dont la règle doit quand même mordre si
	// quelqu'un l'y ramenait.
	{
		files: ['src/core/**/*.ts', 'src/data/**/*.ts', 'src/vitrine.ts'],
		rules: {
			'no-restricted-syntax': ['error', STOCKAGE_PAR_MEMBRE, ECHAPPEMENT_INNERHTML],
		},
	},
);
