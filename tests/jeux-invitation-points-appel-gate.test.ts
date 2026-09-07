import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';

/* ============================================================
   Gate des POINTS D'APPEL de l'invitation vers l'étagère (#661, critère 2).

   Le trou que ce gate bouche. `doitInviter` (src/core/jeux/invitation.ts) est une
   fonction pure, entièrement testée (tests/jeux-invitation.test.ts, 32 combinaisons
   épuisées). Elle peut être PARFAITEMENT JUSTE pendant que le critère 2 est violé : il
   suffit qu'un écran de fin ne l'appelle pas. Rien ne rougirait — pas d'erreur, pas
   d'exception, juste une invitation qui n'apparaît plus sur un écran, ce qui ne se
   remarque qu'à l'usage et des semaines plus tard.

   ── Pourquoi une liste EN DUR, et pas un scan par convention de nom ───────────
   `couverture-e2e-gate` scanne `src/ui/lecon-*.ts` parce que cet ensemble GRANDIT à
   chaque leçon. Ici, l'ensemble est FERMÉ : ce sont les écrans de fin de l'app, et il
   n'y en a pas de nouveau tous les mois. Le risque réaliste n'est donc pas « on en
   ajoute un sans y penser » mais « un refactor en déplace ou en perd un ». Contre ce
   risque-là, une liste explicite est le bon outil : elle dit ce qu'on attend, écran par
   écran, et elle oblige qui ajoute un écran de fin à venir écrire sa ligne ici — donc à
   se poser la question de l'invitation.

   ── Les trois défauts qu'il attrape ───────────────────────────────────────────
   1. un fichier PERD son appel (refactor, découpage de fonction, suppression) ;
   2. un écran de fin ordinaire passe `'programme'` — bug SILENCIEUX : la règle ne dit
      « oui » à cet emplacement que si un programme du jour est actif, donc l'invitation
      disparaîtrait purement et simplement les jours sans programme (cf. le commentaire
      daté du 2026-09-06 sur #661, § 4) ;
   3. `ortho-runner.ts` retombe à UN appel : il porte DEUX écrans de fin distincts (le
      bilan « Liste prête ! » et la fin de révision d'une liste déjà acquise), et perdre
      le second ne changerait rien au premier — c'est le genre de perte qu'aucune
      relecture ne voit.

   ── Ce qu'il NE prouve PAS, et qu'il ne faut pas lui faire dire ───────────────
   Que le bloc arrive à l'écran. Un appel peut être présent et son résultat jeté,
   écrasé, ou rendu dans un conteneur invisible. Ce gate lit du TEXTE ; il garde
   l'EXISTENCE du câblage, pas son effet. L'effet est du ressort des specs Playwright,
   qui assertent `.jeu-invitation` écran par écran.
   ============================================================ */

/** Un appel attendu, écran par écran. Toute modification de cette table est une
 *  DÉCISION : on ajoute un écran de fin, ou on en retire un. */
const POINTS_APPEL: {
	fichier: string;
	appels: number;
	ou: 'programme' | 'ecran';
	ecran: string;
}[] = [
	{
		fichier: 'src/ui/session.ts',
		appels: 1,
		ou: 'ecran',
		ecran: 'bandeau de résultat (bilan express / complet)',
	},
	{
		fichier: 'src/ui/lecon-runner-shared.ts',
		appels: 1,
		ou: 'ecran',
		ecran: 'renderLeconResult — runners « une question à la fois »',
	},
	{
		fichier: 'src/ui/sprint.ts',
		appels: 1,
		ou: 'ecran',
		ecran: 'renderSprintResults',
	},
	{
		fichier: 'src/ui/revision.ts',
		appels: 1,
		ou: 'ecran',
		ecran: 'fin de révision espacée',
	},
	{
		fichier: 'src/ui/ortho-runner.ts',
		appels: 2,
		ou: 'ecran',
		ecran: 'bilan « Liste prête ! » ET fin de révision d’une liste déjà acquise',
	},
	{
		fichier: 'src/ui/seance.ts',
		appels: 1,
		ou: 'programme',
		ecran: 'bloc .programme-fini — le SEUL emplacement « programme »',
	},
];

/** Le module qui rend le bloc (et le seul autorisé à décider s'il s'affiche). */
const MODULE_RENDU = 'src/ui/jeux-invitation.ts';

/* ---------- Détection (isolée, pour être elle-même éprouvée plus bas) ---------- */

/** Les arguments des appels à `invitationHTML(...)` trouvés dans un source.
 *  La définition (`function invitationHTML(ou: 'programme' | 'ecran')`) n'est pas un
 *  appel : le motif exige un littéral seul entre les parenthèses. */
function appelsDans(source: string): ('programme' | 'ecran')[] {
	const out: ('programme' | 'ecran')[] = [];
	for (const m of source.matchAll(/invitationHTML\(\s*'(programme|ecran)'\s*\)/g)) {
		out.push(m[1] as 'programme' | 'ecran');
	}
	return out;
}

function fichiersTs(dossier: string): string[] {
	const out: string[] = [];
	for (const entree of readdirSync(dossier)) {
		const chemin = `${dossier}/${entree}`;
		if (statSync(chemin).isDirectory()) out.push(...fichiersTs(chemin));
		else if (chemin.endsWith('.ts')) out.push(chemin);
	}
	return out;
}

const SOURCES = new Map(fichiersTs('src').map((f) => [f, readFileSync(f, 'utf8')]));
const lire = (f: string): string => SOURCES.get(f) ?? '';

/* ---------- Les contrôles, isolés pour être eux-mêmes éprouvés (§ 3) ---------- */

/** Contrôle d'un écran déclaré. Lève (assertion) si l'appel manque, s'il est en
 *  nombre différent, s'il porte le mauvais emplacement, ou s'il ne vient pas du
 *  module de rendu. */
function controlerPoint(point: (typeof POINTS_APPEL)[number], source: string): void {
	expect(source, `${point.fichier} est introuvable`).not.toBe('');
	const appels = appelsDans(source);
	expect(
		appels.length,
		`${point.fichier} devrait appeler invitationHTML ${point.appels} fois (${point.ecran})`,
	).toBe(point.appels);
	for (const arg of appels) expect(arg).toBe(point.ou);
	// L'appel doit venir du module de rendu, pas d'un homonyme local.
	expect(source).toMatch(/import\s*\{[^}]*invitationHTML[^}]*\}\s*from\s*'\.\/jeux-invitation'/);
}

/** Contrôle que personne n'appelle l'invitation hors de la table. */
function controlerListeExhaustive(sources: Map<string, string>): void {
	const trouves = [...sources.entries()]
		.filter(([, src]) => appelsDans(src).length > 0)
		.map(([f]) => f)
		.sort();
	expect(trouves).toEqual(POINTS_APPEL.map((p) => p.fichier).sort());
}

/** Contrôle que l'emplacement « programme » reste l'exclusivité de seance.ts. */
function controlerProgrammeUnique(sources: Map<string, string>): void {
	const avecProgramme = [...sources.entries()]
		.filter(([, src]) => appelsDans(src).includes('programme'))
		.map(([f]) => f);
	expect(avecProgramme).toEqual(['src/ui/seance.ts']);
}

/** Copie des sources avec UNE mutation, pour éprouver les contrôles sans toucher au
 *  dépôt (aucun fichier n'est écrit). */
function sourcesMutees(fichier: string, muter: (src: string) => string): Map<string, string> {
	const copie = new Map(SOURCES);
	copie.set(fichier, muter(lire(fichier)));
	return copie;
}
const retirerUnAppel = (src: string): string => src.replace(/invitationHTML\(\s*'ecran'\s*\)/, '');

/* ---------- 1. Chaque écran déclaré appelle bien l'invitation ---------- */

describe('points d’appel déclarés (critère 2)', () => {
	for (const point of POINTS_APPEL) {
		it(`${point.fichier} — ${point.ecran}`, () => {
			controlerPoint(point, lire(point.fichier));
		});
	}
});

/* ---------- 2. Personne d'autre, et « programme » nulle part ailleurs ---------- */

describe('aucun point d’appel hors de la table', () => {
	it('les fichiers qui appellent invitationHTML sont exactement ceux déclarés', () => {
		/* Un septième écran de fin qui apparaîtrait sans venir s'inscrire ici échapperait
		   à toute relecture — et à l'assertion `.jeu-invitation` de sa spec. */
		controlerListeExhaustive(SOURCES);
	});

	it('« programme » n’est passé QUE par seance.ts', () => {
		/* Le défaut le plus vicieux : un écran de fin ordinaire qui passerait 'programme'
		   ne planterait pas — il deviendrait invisible les jours SANS programme du jour. */
		controlerProgrammeUnique(SOURCES);
	});

	it('la décision reste une seule règle, celle qui est testée', () => {
		/* `doitInviter` est la règle éprouvée par tests/jeux-invitation.test.ts. Si un
		   écran se remettait à décider tout seul (« si le programme est fini alors… »), il
		   sortirait du périmètre de ces tests sans que rien ne le signale. */
		const consommateurs = [...SOURCES.entries()]
			.filter(([f, src]) => f.startsWith('src/ui/') && /\bdoitInviter\b/.test(src))
			.map(([f]) => f);
		expect(consommateurs).toEqual([MODULE_RENDU]);
	});

	it('le module de rendu délègue bien à la règle du core', () => {
		expect(lire(MODULE_RENDU)).toMatch(
			/import\s*\{[^}]*doitInviter[^}]*\}\s*from\s*'\.\.\/core\/jeux\/invitation'/,
		);
	});
});

/* ---------- 3. Le gate sait-il rougir ? ---------- */

describe('auto-contrôle : le gate sait rougir', () => {
	/* Un gate vert le jour où on l'écrit ne prouve rien tant qu'on ne l'a pas vu dire
	   NON. On rejoue donc les CONTRÔLES EUX-MÊMES (pas seulement le détecteur) sur des
	   sources mutées en mémoire — aucun fichier n'est écrit — en reproduisant les trois
	   défauts visés. Chaque cas doit LEVER. */

	const point = (f: string): (typeof POINTS_APPEL)[number] => {
		const p = POINTS_APPEL.find((x) => x.fichier === f);
		if (!p) throw new Error(`point d'appel non déclaré : ${f}`);
		return p;
	};

	it('rougit si un écran de fin perd son appel', () => {
		const ampute = retirerUnAppel(lire('src/ui/sprint.ts'));
		expect(() => controlerPoint(point('src/ui/sprint.ts'), ampute)).toThrow();
	});

	it('rougit si ortho-runner retombe à UN appel (le second écran perdu en silence)', () => {
		const source = lire('src/ui/ortho-runner.ts');
		expect(appelsDans(source).length).toBe(2);
		const ampute = retirerUnAppel(source); // une seule occurrence retirée
		expect(appelsDans(ampute).length).toBe(1);
		expect(() => controlerPoint(point('src/ui/ortho-runner.ts'), ampute)).toThrow();
	});

	it('rougit si un écran de fin ordinaire bascule sur « programme »', () => {
		const devoyees = sourcesMutees('src/ui/session.ts', (src) =>
			src.replace(/invitationHTML\(\s*'ecran'\s*\)/, "invitationHTML('programme')"),
		);
		expect(() => controlerProgrammeUnique(devoyees)).toThrow();
		expect(() =>
			controlerPoint(point('src/ui/session.ts'), devoyees.get('src/ui/session.ts') ?? ''),
		).toThrow();
	});

	it('rougit si un écran de fin non déclaré se met à inviter', () => {
		const clandestin = new Map(SOURCES);
		clandestin.set('src/ui/ecran-inconnu.ts', "invitationHTML('ecran')");
		expect(() => controlerListeExhaustive(clandestin)).toThrow();
	});

	it('rougit si un fichier déclaré disparaît', () => {
		expect(() => controlerPoint(point('src/ui/seance.ts'), '')).toThrow();
	});

	it('rougit si l’appel ne vient plus du module de rendu', () => {
		// Un homonyme local (fonction maison, import d'ailleurs) rendrait le texte
		// identique alors que la règle testée ne serait plus celle qui décide.
		const sansImport = lire('src/ui/revision.ts').replace(
			/import\s*\{[^}]*invitationHTML[^}]*\}\s*from\s*'\.\/jeux-invitation';/,
			'',
		);
		expect(() => controlerPoint(point('src/ui/revision.ts'), sansImport)).toThrow();
	});

	it('ne prend pas la DÉFINITION de la fonction pour un appel', () => {
		// Sinon `src/ui/jeux-invitation.ts` compterait un appel fantôme et la table du
		// test « aucun point d'appel hors de la table » serait fausse dès le départ.
		expect(appelsDans(lire(MODULE_RENDU))).toEqual([]);
		expect(appelsDans("export function invitationHTML(ou: 'programme' | 'ecran') {}")).toEqual([]);
	});

	it('ne compte pas une mention en commentaire ou en import', () => {
		expect(appelsDans("// on appelle invitationHTML ici plus tard, avec 'ecran'")).toEqual([]);
		expect(appelsDans("import { invitationHTML } from './jeux-invitation';")).toEqual([]);
	});
});
