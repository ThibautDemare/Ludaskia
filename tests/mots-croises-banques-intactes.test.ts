/* ============================================================
   Mots croisés (#665) — critère 45 : les banques de vocabulaire NE BOUGENT PAS.

   Le seul fichier de ce lot qui est VERT dès maintenant, et c'est normal : il ne
   décrit rien à écrire, il photographie ce qui existe déjà. Sa raison d'être est
   dans l'histoire de l'issue — le corps d'origine annonçait une banque de
   définitions « dérivée de `synonymes-contraires.ts` », piste abandonnée après
   l'avis du pédagogue (retirer la phrase de contexte rend *clair*, *juste*,
   *fort* polysémiques, et dans une grille l'enfant n'a pas trois candidats pour
   se rattraper). La tentation de « rendre les entrées réutilisables » en les
   retouchant au passage reste, elle, entière.

   Cas d'échec littéral : « une leçon de vocabulaire existante voit ses items
   bouger ».

   ── UN TEST DE PHOTOGRAPHIE, ET CE QUE ÇA IMPLIQUE ──────────────────────────

   L'attendu est ici DÉRIVÉ de l'état actuel des données, et il ne peut pas en
   être autrement : « ne change pas » n'a pas d'autre référence que ce qui est.
   C'est le seul endroit de ce lot où l'attendu ne se recalcule pas depuis
   l'issue, et ça se dit plutôt que ça se cache.

   Conséquence pratique : une évolution DÉLIBÉRÉE d'une de ces banques (une
   coquille corrigée, un item ajouté) fait échouer ce fichier. Ce n'est pas un
   faux positif, c'est la question posée au bon moment — « est-ce bien voulu, et
   est-ce bien le lot en cours qui doit le faire ? ». On met alors à jour les
   nombres ci-dessous, avec la raison.

   Empreintes prises le 2026-09-09, avant la première ligne de code du lot.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
	CONTRAIRES,
	CONTRAIRES_CM1,
	SENS_PROCHE,
	SENS_PROCHE_CM1,
	type ItemSens,
} from '../src/data/francais/synonymes-contraires';

/** FNV-1a 32 bits, en hexadécimal. Choisi pour tenir en cinq lignes et n'avoir
    aucune dépendance : ce n'est pas de la cryptographie, c'est un numéro de
    série lisible dans un message d'échec. */
function empreinte(texte: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < texte.length; i++) {
		h ^= texte.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

/** Tout ce qu'un item porte, dans l'ordre : la phrase de CONTEXTE (c'est elle
    que la piste écartée retirait), la bonne réponse, les deux distracteurs. */
const serialise = (items: readonly ItemSens[]): string =>
	items
		.map((i) => `${i.phrase}|${i.reponse}|${i.distracteurs.join('+')}`)
		.join('\n')
		.normalize('NFC');

const photo = (items: readonly ItemSens[]): { items: number; empreinte: string } => ({
	items: items.length,
	empreinte: empreinte(serialise(items)),
});

describe('#665 critère 45 — les banques de vocabulaire existantes ne changent pas', () => {
	it.each([
		['CONTRAIRES', CONTRAIRES, 70, '28145b31'],
		['SENS_PROCHE', SENS_PROCHE, 59, 'b364d0ce'],
		['CONTRAIRES_CM1', CONTRAIRES_CM1, 18, 'defdd4c6'],
		['SENS_PROCHE_CM1', SENS_PROCHE_CM1, 18, '6331895d'],
	] as [string, readonly ItemSens[], number, string][])(
		'%s garde ses items à l’identique',
		(_nom, banque, items, attendue) => {
			expect(photo(banque)).toEqual({ items, empreinte: attendue });
		},
	);

	it('garde intacts les items témoins que la piste écartée aurait touchés', () => {
		/* Trois entrées nommées, plutôt qu'une empreinte seule : quand le hash tombe,
		   il dit qu'il y a un écart, pas lequel. Ces trois-là sont les mots que
		   l'avis du pédagogue cite comme redevenant polysémiques une fois sortis de
		   leur phrase — donc les premiers candidats à une « harmonisation ». */
		const trouve = (mot: string): ItemSens | undefined =>
			[...CONTRAIRES, ...SENS_PROCHE].find((i) => i.phrase.includes(`**${mot}**`));
		for (const mot of ['grand', 'clair', 'fort']) {
			const item = trouve(mot);
			expect(item, `« ${mot} » a disparu des banques`).toBeDefined();
			expect(item?.phrase, `« ${mot} » a perdu sa phrase de contexte`).toMatch(/\*\*.+\*\*/);
			expect(item?.distracteurs, `« ${mot} » n’a plus deux distracteurs`).toHaveLength(2);
		}
	});

	it('la leçon de vocabulaire ne s’est pas mise à dépendre de la banque de définitions', () => {
		/* « La nouvelle banque est À CÔTÉ, pas dedans. » Le jour où
		   `synonymes-contraires.ts` importe `definitions.ts`, ses items ne sont plus
		   fixes : ils suivent une banque qui, elle, a vocation à grandir — et l'écart
		   n'apparaîtrait qu'au prochain ajout de définition, longtemps après. */
		const chemin = 'src/data/francais/synonymes-contraires.ts';
		expect(existsSync(chemin), chemin).toBe(true);
		const src = readFileSync(chemin, 'utf8');
		expect(/from\s*'[^']*definitions'/.test(src), 'import de la banque de définitions').toBe(false);
	});
});
