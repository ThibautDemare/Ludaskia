import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

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
);
