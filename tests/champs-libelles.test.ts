import { describe, it, expect } from 'vitest';
import { getAllLessons, getLessonById } from '../src/core/catalog';
import { buildLessonFiche, genItems } from '../src/core/build';
import { renderItem, createRenderContext, nomChampReponse } from '../src/core/items';
import type { Item } from '../src/core/items';
import { withSeed } from '../src/core/utils';

/* ============================================================
   Nom accessible des champs de réponse (#577).

   Un `<input>` sans nom accessible est annoncé « zone de saisie » par un lecteur
   d'écran. Sur une fiche de conjugaison, ça faisait six « zone de saisie » d'affilée
   sans jamais dire de quelle personne il s'agissait : la leçon était inutilisable
   sans la vue (axe : règle `label`, gravité `critical`).

   Ce que ces tests verrouillent, et qui va plus loin que la règle d'axe : axe se
   contente de l'EXISTENCE d'un nom. Huit champs nommés « signe de comparaison » la
   satisfont et ne servent toujours à rien. On exige donc aussi que les champs d'une
   même fiche se DISTINGUENT — c'est le seul point qui rend l'annonce utile.
   ============================================================ */

const GRAINE = 42;

/** aria-label de chaque champ de réponse d'un fragment HTML, dans l'ordre du rendu. */
function libelles(html: string): string[] {
	return [...html.matchAll(/<input[^>]*class="ans[^"]*"[^>]*>/g)].map(
		(m) => m[0].match(/aria-label="([^"]*)"/)?.[1] ?? '',
	);
}

const ficheDe = (id: string) => withSeed(GRAINE, () => buildLessonFiche(id));

describe('Nom accessible des champs de réponse (#577)', () => {
	it('conjugaison : chaque champ nomme SA personne, et les six diffèrent', () => {
		const libs = libelles(ficheDe('fr-conj-etre-present').balisage);
		expect(libs.length).toBeGreaterThanOrEqual(6);
		for (const l of libs) expect(l).toMatch(/^Conjugue le verbe être au présent, avec /);
		// Le cœur du défaut : six champs nommés pareil auraient satisfait axe sans rien
		// résoudre. Les pronoms se répètent au-delà de six items (la fiche en compte 8,
		// le verbe n'a que 6 formes) — on éprouve donc la distinction sur les six premiers.
		expect(new Set(libs.slice(0, 6)).size).toBe(6);
	});

	it('comparaison : le champ « signe » porte l’énoncé, pas seulement son format', () => {
		const libs = libelles(ficheDe('num-comparer').balisage);
		expect(libs.length).toBeGreaterThan(1);
		for (const l of libs) {
			// Le FORMAT attendu reste annoncé (le pavé de signes n'est pas visible à
			// l'oreille), mais après l'énoncé, qui est ce qui distingue le champ.
			expect(l).toMatch(/^Compare .+ et .+\. — signe de comparaison$/);
		}
		expect(new Set(libs).size).toBeGreaterThan(1);
	});

	it('fraction à trou : le numérateur porte l’énoncé, pas seulement « chiffre manquant »', () => {
		// Item construit à la main : dans la vraie fiche, la même leçon mêle les trous AU
		// NUMÉRATEUR (branche empilée, testée ici) et les trous de la partie entière, qui
		// passent par le champ générique — viser la branche par un item est plus sûr que
		// d'espérer le bon tirage.
		const item: Item = {
			text: '60,48 = 60 + 4/10 + @/100',
			parle: 'Dans 60,48, quel est le chiffre des centièmes ?',
			answer: 8,
			kind: 'num',
		};
		const lib = libelles(renderItem(item, createRenderContext()).balisage)[0];
		expect(lib).toBe(
			'Dans 60 virgule quatre huit, quel est le chiffre des centièmes ? — chiffre manquant',
		);
	});

	it('l’heure garde « heures »/« minutes » (exception assumée)', () => {
		const item: Item = { text: 'Quelle heure est-il ? @', answer: '3 h 25', kind: 'heure' };
		const html = renderItem(item, createRenderContext());
		// Ici le nom doit distinguer les DEUX champs entre eux ; l'énoncé, identique d'une
		// horloge à l'autre, ne distinguerait rien (ce qui change est dans le dessin).
		expect(html.balisage).toContain('aria-label="heures"');
		expect(html.balisage).toContain('aria-label="minutes"');
	});
});

describe('nomChampReponse — dérivation du nom (#577)', () => {
	it('préfère `parle` à l’énoncé affiché quand il existe', () => {
		const it_: Item = {
			text: 'être · présent — je @',
			parle: 'Conjugue le verbe être au présent, avec je.',
			answer: 'suis',
			kind: 'text',
		};
		expect(nomChampReponse(it_)).toBe('Conjugue le verbe être au présent, avec je.');
	});

	it('sans `parle`, dérive de l’énoncé et fait taire le trou', () => {
		const it_: Item = { text: '45 + @ = 57', answer: 12, kind: 'num' };
		const nom = nomChampReponse(it_);
		expect(nom).not.toContain('@');
		expect(nom).toContain('45');
		expect(nom).toContain('57');
	});

	it('repli « réponse » quand l’énoncé ne donne rien à lire', () => {
		// Item à figure seule : mieux vaut un nom générique que pas de nom du tout
		// (l'absence de nom est classée `critical` par axe, le générique ne l'est pas).
		expect(nomChampReponse({ text: '@', answer: 4, kind: 'num' })).toBe('réponse');
	});

	it('un énoncé à guillemets ne casse pas l’attribut', () => {
		const item: Item = { text: 'Écris « a"b » : @', answer: 'x', kind: 'text' };
		const html = renderItem(item, createRenderContext());
		const lib = libelles(html.balisage)[0];
		expect(lib).toBeTruthy();
		expect(lib).not.toContain('"'); // échappé en &quot; dans l'attribut
		expect(html.balisage).toContain('&quot;');
	});
});

describe('Gate : aucun champ de fiche sans nom accessible (#577)', () => {
	/* Le défaut venait d'une branche de `renderItem` qui avait été oubliée. Le balayage
	   du catalogue entier empêche la prochaine branche ajoutée de repartir sans nom :
	   c'est moins coûteux qu'un scan axe, et ça échoue en nommant la leçon. */
	const LECONS = getAllLessons();

	it('le catalogue est bien balayé (garde contre un test à vide)', () => {
		expect(LECONS.length).toBeGreaterThan(50);
	});

	it.each(LECONS.map((l) => l.id))('%s : tous ses champs de réponse sont nommés', (id) => {
		const lesson = getLessonById(id)!;
		for (const niveau of lesson.levels) {
			const html = withSeed(GRAINE, () => buildLessonFiche(id, niveau));
			const libs = libelles(html.balisage);
			for (const [i, lib] of libs.entries()) {
				expect(
					lib.trim(),
					`${id} (${niveau}), champ n°${i + 1} : champ de réponse SANS nom accessible.\n` +
						`Un lecteur d'écran l'annonce « zone de saisie », sans dire de quoi il s'agit.\n` +
						`Toute branche de renderItem qui rend un <input class="ans"> doit poser un aria-label.`,
				).not.toBe('');
			}
		}
	});
});

describe('Non-régression : le corrigé et l’impression ne portent pas de champ (#577)', () => {
	it('en corrigé, la réponse remplace le champ — donc aucun aria-label à poser', () => {
		const lesson = getLessonById('fr-conj-etre-present')!;
		const item = withSeed(GRAINE, () => genItems(lesson, 1))[0];
		const html = renderItem(item, createRenderContext({ corrigeMode: true }));
		expect(html.balisage).not.toContain('<input');
		expect(html.balisage).toContain('ans-corrige');
	});
});
