import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/* ============================================================
   Gate STATIQUE du journal d'erreurs (#580, règle #391).

   « Pas de correction sans sa capture » : tout chemin qui corrige une réponse
   d'enfant doit alimenter le journal de l'espace encadrant (`capterErreur`,
   src/ui/erreur-capture.ts). Un runner qui l'oublie ne casse RIEN de visible —
   les exercices marchent, les tests passent, la CI est verte. Le suivi parental
   devient silencieusement partiel : le parent croit tout voir, et le trou ne se
   remarque qu'à l'usage, des semaines plus tard.

   Ce test lit les fichiers de `src/ui` comme du TEXTE (pas de DOM, pas de rendu :
   quelques millisecondes). Il tient une classification exhaustive des runners, pas
   une simple recherche : chaque module correctif doit importer `capterErreur`, et
   chaque exception doit être écrite ICI avec sa raison.

   CE QU'IL NE PROUVE PAS, volontairement : que l'appel se fait au bon endroit, avec
   un énoncé lisible et un `lessonId` (une entrée sans l'un des deux est ignorée en
   silence par `capterErreur`), ni qu'il couvre TOUS les modes d'un type. C'est
   l'objet de la table de couverture (#581). Et comme la définition de « module
   correctif » repose ici sur une CONVENTION DE NOMMAGE (`lecon-*.ts`) plus une liste
   tenue à la main, le dernier test croise cette convention avec l'aiguillage réel de
   `navigation.ts` : un runner branché sous un autre nom fait échouer le gate au lieu
   de passer entre les mailles. La garantie sémantique complète demanderait un point
   de passage unique de la correction — refonte hors sujet ici.

   Piste écartée après mesure : exiger que le module ATTEIGNE `erreur-capture` dans le
   graphe d'imports (au lieu de l'importer directement) rendrait le gate VIDE — tout
   `src/ui` atteint tout via le hub `navigation.ts`, y compris les modules qui ne
   corrigent rien.
   ============================================================ */

const DIR = 'src/ui';
const lire = (fichier: string) => readFileSync(`${DIR}/${fichier}`, 'utf8');

/* Chemins correctifs qui ne suivent pas la convention `lecon-*` : la fiche/bilan
   (session), le sprint, la révision, l'atelier d'orthographe, et la révélation d'une
   question passée (qui journalise « n'a pas essayé »). À compléter si un nouveau
   chemin de correction naît hors runner de leçon. */
const AUTRES_CHEMINS_CORRECTIFS = [
	'session.ts',
	'sprint.ts',
	'revision.ts',
	'ortho-runner.ts',
	'revelation-neutre.ts',
];

/* Modules en `lecon-*` qui ne capturent PAS eux-mêmes, avec la raison. Une entrée ici
   est une dette assumée et relue, pas un oubli : le test vérifie plus bas que chacune
   reste justifiée (le fichier existe toujours, et il ne s'est pas mis à capturer sans
   qu'on retire son exception). */
const SANS_CAPTURE_PROPRE: Record<string, string> = {
	'lecon-du-jour.ts':
		"carte d'accueil : elle propose une leçon et la lance, elle ne corrige aucune réponse.",
	'lecon-runner-shared.ts':
		'squelette de fin de série (barre de progression, clôture, écran de résultat) : il enregistre un ESSAI, jamais une réponse fausse.',
	'lecon-passer.ts':
		"« Je ne sais pas, montre-moi » : il journalise bien (question passée, marquée « n'a pas essayé »), mais par DÉLÉGATION à revelation-neutre.ts — vérifié par un test dédié ci-dessous.",
};

const importeCapterErreur = (source: string): boolean =>
	/import\s*\{[^}]*\bcapterErreur\b[^}]*\}\s*from\s*'\.\/erreur-capture'/.test(source);

const RUNNERS_LECON = readdirSync(DIR).filter((f) => f.startsWith('lecon-') && f.endsWith('.ts'));

const A_VERIFIER = [...RUNNERS_LECON, ...AUTRES_CHEMINS_CORRECTIFS].filter(
	(f) => !(f in SANS_CAPTURE_PROPRE),
);

describe('Gate du journal d’erreurs (#580)', () => {
	it('trouve bien des runners à vérifier (garde contre un it.each vide qui passerait à vide)', () => {
		expect(RUNNERS_LECON.length).toBeGreaterThan(5);
		expect(A_VERIFIER.length).toBeGreaterThan(10);
	});

	it.each(A_VERIFIER)('%s importe capterErreur', (fichier) => {
		expect(
			importeCapterErreur(lire(fichier)),
			`${fichier} corrige des réponses mais n'importe pas capterErreur (src/ui/erreur-capture.ts).\n` +
				`Sans ça, ses erreurs n'apparaissent nulle part dans l'espace encadrant : le parent croit tout voir.\n` +
				`Si ce module ne corrige VRAIMENT rien, l'ajouter à SANS_CAPTURE_PROPRE avec sa raison.`,
		).toBe(true);
	});

	it.each(Object.keys(SANS_CAPTURE_PROPRE))(
		'%s : son exception reste justifiée (le fichier existe et ne capture toujours pas)',
		(fichier) => {
			const source = lire(fichier); // lève si le fichier a été renommé ou supprimé
			expect(
				importeCapterErreur(source),
				`${fichier} importe maintenant capterErreur, alors qu'il est exempté au motif : ` +
					`« ${SANS_CAPTURE_PROPRE[fichier]} ».\n` +
					`Retirer son entrée de SANS_CAPTURE_PROPRE — sinon l'exception protège un module qui n'en a ` +
					`plus besoin, et masquerait sa prochaine régression.`,
			).toBe(false);
		},
	);

	it('lecon-passer.ts délègue bien sa capture à revelation-neutre.ts', () => {
		expect(
			/from\s*'\.\/revelation-neutre'/.test(lire('lecon-passer.ts')),
			"lecon-passer.ts ne délègue plus à revelation-neutre.ts : une question passée n'est donc plus " +
				'journalisée « n’a pas essayé ». Rétablir la délégation, ou lui faire importer capterErreur ' +
				'directement et le sortir de SANS_CAPTURE_PROPRE.',
		).toBe(true);
	});

	/* Croisement avec l'aiguillage réel : la convention de nommage ne protège que les
	   fichiers qui la suivent. `runLecon` (navigation.ts) appelle un runner par type
	   d'exercice ; on remonte de chaque appel `runLeconXxx(` à son module d'origine et on
	   exige qu'il soit dans le périmètre vérifié. Un runner branché sous un nom hors
	   convention (`dictee-runner.ts`…) échoue ici au lieu de passer inaperçu. */
	it('tout runner branché dans navigation.ts est couvert par ce gate', () => {
		const navigation = readFileSync(`${DIR}/navigation.ts`, 'utf8');

		const moduleDe = new Map<string, string>();
		for (const m of navigation.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/([\w-]+)'/g)) {
			for (const nom of m[1].split(',')) moduleDe.set(nom.trim(), `${m[2]}.ts`);
		}

		const appeles = new Set(
			[...navigation.matchAll(/\b(runLecon[A-Z]\w*)\s*\(/g)].map((m) => m[1]),
		);
		expect(
			appeles.size,
			"aucun appel runLeconXxx trouvé : l'aiguillage a changé de forme",
		).toBeGreaterThan(5);

		for (const appel of appeles) {
			const fichier = moduleDe.get(appel);
			expect(
				fichier,
				`${appel} est appelé dans navigation.ts sans import local repérable`,
			).toBeTruthy();
			expect(
				A_VERIFIER.includes(fichier!),
				`${appel} vient de ${fichier}, qui n'est pas dans le périmètre du gate du journal.\n` +
					`Un runner doit s'appeler « lecon-*.ts » (ou être listé dans AUTRES_CHEMINS_CORRECTIFS) ` +
					`pour que ses erreurs soient contrôlées.`,
			).toBe(true);
		}
	});
});
