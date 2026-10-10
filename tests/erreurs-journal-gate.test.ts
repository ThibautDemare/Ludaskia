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

/* Modules correctifs de la séance PARTAGÉE (#734) hors convention `lecon-*`, qui ne
   capturent pas eux-mêmes : ils NOTENT leurs erreurs dans la réponse qu'ils rendent à la
   séance (`ReponseRunner.erreurs`, entrées portant leur `lessonId` ; « je ne sais pas »
   par `erreurPassee`), et c'est `partage-seance.ts` qui journalise (`journaliserRunner` →
   `capterErreur`), à la FIN du passage : rien si l'enfant quitte avant. Sans cette table,
   un tel module passerait entre les mailles — ni `lecon-*`, ni importateur de
   `capterErreur`. */
const NOTES_POUR_LA_SEANCE: Record<string, string> = {
	'dictee-partage.ts':
		'séance de dictée envoyée par lien (#734, PR 5) : un mot à la fois, noté en ReponseRunner.',
};

const importeCapterErreur = (source: string): boolean =>
	/import\s*\{[^}]*\bcapterErreur\b[^}]*\}\s*from\s*'\.\/erreur-capture'/.test(source);

/** Le source sans ses commentaires : une règle qu'un commentaire suffirait à satisfaire
 *  ne garderait rien. (`://` épargné : une URL n'est pas un commentaire.) */
const sansCommentaires = (source: string): string =>
	source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Ce qu'un module noté pour la séance partagée doit montrer, motif par motif. Chaque
 *  clé est une condition NÉCESSAIRE : la retirer du module fait rougir le gate. */
function notePourLaSeance(source: string): Record<string, boolean> {
	const src = sansCommentaires(source);
	// Valeurs données à `erreurs:` (les 200 caractères qui suivent, sauts de ligne compris).
	const valeurs = [...src.matchAll(/\berreurs\s*:\s*/g)].map((m) =>
		src.slice(m.index + m[0].length, m.index + m[0].length + 200),
	);
	return {
		'importe erreurPassee depuis ./runner-partage':
			/import\s*\{[^}]*\berreurPassee\b[^}]*\}\s*from\s*'\.\/runner-partage'/.test(src),
		'appelle erreurPassee (« je ne sais pas » → « n’a pas essayé »)': /\berreurPassee\s*\(/.test(
			src,
		),
		// Une réponse FAUSSE porte au moins une entrée : une valeur d'`erreurs` qui n'est ni
		// vide (réponse juste), ni la seule entrée « je ne sais pas », ni un type.
		'note une entrée pour une réponse fausse (erreurs: …)': valeurs.some(
			(v) =>
				!/^\[\s*\]/.test(v) &&
				!/^\[\s*erreurPassee\s*\(/.test(v) &&
				!/^(readonly\s+)?[A-Z]\w*\s*(\[\]|<)/.test(v),
		),
		'donne leur lessonId aux entrées (sans lui, capterErreur les ignore)': /\blessonId\b/.test(src),
	};
}

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

	it.each(Object.keys(NOTES_POUR_LA_SEANCE))(
		'%s note ses erreurs pour la séance partagée (erreurs avec lessonId, erreurPassee)',
		(fichier) => {
			const source = lire(fichier); // lève si le module n'existe pas (encore)
			for (const [condition, tenue] of Object.entries(notePourLaSeance(source)))
				expect(
					tenue,
					`${fichier} : ne ${condition} plus.\n` +
						`Ce module ne capture pas lui-même : ses erreurs n'arrivent au journal de l'encadrant ` +
						`que par la réponse notée (ReponseRunner.erreurs), que partage-seance.ts journalise ` +
						`à la fin du passage. Motif de l'entrée : ${NOTES_POUR_LA_SEANCE[fichier]}`,
				).toBe(true);
			expect(
				new RegExp(`from\\s*'\\./${fichier.replace(/\.ts$/, '')}'`).test(
					sansCommentaires(lire('partage-seance.ts')),
				),
				`${fichier} n'est pas importé par partage-seance.ts : ce qu'il note n'est journalisé par personne.`,
			).toBe(true);
		},
	);

	it('la séance partagée journalise ce que ses runners notent (partage-seance.ts)', () => {
		const src = sansCommentaires(lire('partage-seance.ts'));
		const corps =
			/function journaliserRunner\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';
		const raison =
			'partage-seance.ts est le SEUL point de capture des modules de NOTES_POUR_LA_SEANCE : ' +
			'sans lui, leurs erreurs ne vont nulle part.';
		expect(importeCapterErreur(src), `n'importe plus capterErreur. ${raison}`).toBe(true);
		expect(
			/\bcapterErreur\s*\(/.test(corps),
			`journaliserRunner n'appelle plus capterErreur. ${raison}`,
		).toBe(true);
		expect(
			[...src.matchAll(/\bjournaliserRunner\s*\(/g)].length,
			`journaliserRunner n'est plus appelé. ${raison}`,
		).toBeGreaterThanOrEqual(2); // sa définition + au moins un appel
		expect(
			/\.erreurs\.push\(\s*\.\.\.\s*\w+\.erreurs\b|\.erreurs\s*=\s*[^;\n]*\.erreurs\b/.test(src),
			`les erreurs notées par les runners (réponse.erreurs) ne sont plus collectées. ${raison}`,
		).toBe(true);
	});

	it('la règle des modules notés rougit si on retire erreurPassee ou les erreurs des faux', () => {
		// Garde contre une règle qui passerait à vide : éprouvée sur un module FICTIF, écrit
		// d'après le contrat (pas d'après un runner existant), puis muté.
		const exemple = [
			"import { enchainerPartage, erreurPassee, type ReponseRunner } from './runner-partage';",
			'function valider(): void {',
			'	const reponse: ReponseRunner = jnsp',
			"		? { statut: 'jnsp', saisie: '', erreurs: [erreurPassee({ text, attendue: mot, lessonId })] }",
			"		: { statut: juste ? 'juste' : 'faux', saisie, erreurs: juste ? [] : [{ text, donnee: saisie, attendue: mot, lessonId }] };",
			'}',
		].join('\n');
		const tenues = (s: string) => Object.values(notePourLaSeance(s)).every(Boolean);
		expect(tenues(exemple), 'le module fictif conforme doit passer').toBe(true);
		expect(
			tenues(exemple.replace('erreurPassee, ', '').replace(/erreurPassee\(([^)]*)\)/, '$1')),
			'sans erreurPassee',
		).toBe(false);
		expect(
			tenues(exemple.replace(/juste \? \[\] : \[\{[^\]]*\]/, '[]')),
			'sans entrée pour une réponse fausse',
		).toBe(false);
		expect(
			tenues(`/* erreurPassee( lessonId erreurs: x */\n${exemple.replace(/^import.*$/m, '')}`),
			'un commentaire ne remplace pas l’import',
		).toBe(false);
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
