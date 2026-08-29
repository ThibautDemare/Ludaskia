import { describe, it, expect } from 'vitest';
import { getAllLessons, estEligibleSprintHorsNiveau, getLessonById } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { texteItemParle } from '../src/core/items';
import { genSprintQuestion } from '../src/core/sprint-item';

/* ============================================================
   Gate « pas de bouton Écouter muet dans le sprint » (#630, critère C14).

   POURQUOI CE GATE EXISTE.
   Le sprint gagne un bouton « Écouter » (#630). Il n'a de sens que si TOUTE question
   tirable par le sprint donne quelque chose à lire. Or deux leçons du catalogue sont
   délibérément MUETTES (`parle: ''`, cf. src/data/francais/participe-passe-etre.ts et
   accord-groupe-nominal.ts) : leurs formes sont homophones, entendre l'énoncé
   donnerait la réponse. Aujourd'hui ces deux leçons sont hors du pool du sprint —
   mais RIEN ne lie mécaniquement « énoncé muet » à « exclue du sprint » : c'est une
   coïncidence de calendrier, les deux traits ont été posés séparément et pour des
   raisons différentes (`estEligibleSprintHorsNiveau` ne regarde pas `parle`).

   Ce que le gate empêche, donc : qu'une future leçon d'homophones (ou toute leçon à
   énoncé sans texte lisible) entre dans le pool du sprint sans que personne n'ait
   décidé du sort de son oral. Deux dégâts, tous deux silencieux :
   - un énoncé muet qui devient AUDIBLE ⇒ la réponse fuite à l'oral, sans un seul
     test rouge et sans que la leçon ait changé d'une ligne ;
   - un bouton « Écouter » présent et sans effet sur CERTAINES questions seulement
     ⇒ l'enfant qui s'appuie sur l'oral se croit en panne d'appli.

   COMMENT. On interroge le prédicat RÉEL du tirage (`estEligibleSprintHorsNiveau`) et le
   générateur RÉEL du sprint (`genSprintQuestion`), pas une liste recopiée : un pool
   reconstitué à la main aurait divergé au premier format ajouté et le gate aurait
   couvert un catalogue imaginaire. On échantillonne chaque leçon sur chacun de ses
   niveaux, parce que la mutité peut ne toucher qu'une PARTIE des tirages (une banque
   dont seuls quelques items portent `parle: ''`) : c'est justement le cas le plus
   pernicieux, et un tirage unique le manquerait une fois sur deux.

   CE QU'IL NE PROUVE PAS : que le bouton est réellement greffé à l'écran, ni qu'il
   parle. C'est l'objet de la spec e2e du sprint.
   ============================================================ */

const TIRAGES = 40; // par (leçon, niveau) : assez pour attraper une mutité minoritaire

const POOL: LessonDef[] = getAllLessons().filter(estEligibleSprintHorsNiveau);

/* Un cas par couple (leçon, niveau) : une leçon multi-niveaux peut n'être muette
   qu'au CM1 (variante d'énoncé propre au niveau). */
const CAS: [string, SchoolLevel, LessonDef][] = POOL.flatMap((l) =>
	l.levels.map((n): [string, SchoolLevel, LessonDef] => [l.id, n, l]),
);

/* Leçons DÉLIBÉRÉMENT muettes : l'oral trahirait la réponse (homophones). Leur place
   est hors du sprint ; si l'une y entrait, le gate principal ci-dessous devrait la
   nommer. Elles servent ici de témoin : elles prouvent que `texteItemParle` sait
   rendre une chaîne vide, donc que le gate n'est pas vert par construction. */
const MUETTES_ASSUMEES = ['fr-accords-participe-etre', 'fr-accords-groupe-nominal'];

describe('Gate TTS du sprint (#630, C14)', () => {
	it('le pool du sprint n’est pas vide (garde contre un it.each qui passerait à vide)', () => {
		expect(POOL.length).toBeGreaterThan(30);
		expect(CAS.length).toBeGreaterThanOrEqual(POOL.length);
	});

	it.each(CAS)('%s @%s : toutes ses questions donnent quelque chose à lire', (id, niveau, def) => {
		const muettes: string[] = [];
		for (let i = 0; i < TIRAGES; i++) {
			const { q } = genSprintQuestion(def, niveau);
			if (texteItemParle(q).trim() === '') muettes.push(q.text);
		}
		expect(
			muettes.length,
			`« ${id} » (@${niveau}) est tirable par le sprint, mais ${muettes.length} de ses ` +
				`${TIRAGES} questions échantillonnées ne donnent RIEN à lire à voix haute ` +
				`(texteItemParle vide).\n` +
				`Exemple d'énoncé concerné : « ${muettes[0] ?? ''} ».\n` +
				`Le bouton « Écouter » du sprint serait donc présent et muet sur une partie ` +
				`seulement des questions. Trancher, et l'écrire dans la donnée :\n` +
				`  • l'oral trahirait la réponse (homophones…) ⇒ poser excludeFromSprint: true ` +
				`sur la leçon (src/data/…), comme fr-accords-participe-etre ;\n` +
				`  • l'énoncé est juste télégraphique ou visuel ⇒ lui donner un « parle » non ` +
				`vide, qui dise à l'oreille ce que l'œil voit.`,
		).toBe(0);
	});

	/* ---- Témoins : le gate a des dents ------------------------------------ */

	it('témoin : un énoncé à « parle » vide rend bien un texte parlé VIDE', () => {
		// Sans ça, le gate principal serait vert quoi qu'il arrive : c'est la seule
		// assertion qui prouve que `texteItemParle` peut échouer à son critère.
		expect(texteItemParle({ text: 'petit ou petits ? les chats @', answer: 'petits' })).not.toBe(
			'',
		);
		expect(
			texteItemParle({ text: 'petit ou petits ? les chats @', answer: 'petits', parle: '' }),
		).toBe('');
	});

	it.each(MUETTES_ASSUMEES)('témoin : « %s », muette par choix, reste hors du sprint', (id) => {
		const def = getLessonById(id);
		expect(
			def,
			`la leçon « ${id} » a disparu ou changé d'id : mettre à jour ce témoin`,
		).toBeTruthy();

		// Bout en bout : la mutité survit à la fabrique de question du sprint. C'est ce
		// qui prouve que le gate principal ATTRAPERAIT cette leçon si elle entrait dans le
		// pool — un `parle` perdu en route par `genSprintQuestion` le rendrait aveugle.
		const parles = Array.from({ length: 5 }, () =>
			texteItemParle(genSprintQuestion(def!, def!.levels[0]).q),
		);
		expect(
			parles.filter((p) => p.trim() !== ''),
			`« ${id} » redevient lisible à voix haute en passant par genSprintQuestion : son ` +
				`« parle » vide se perd en route. Le gate ci-dessus ne verrait plus rien.`,
		).toEqual([]);

		expect(
			estEligibleSprintHorsNiveau(def!),
			`« ${id} » est muette par choix pédagogique (parle: '' — ses formes sont homophones, ` +
				`l'entendre donnerait la réponse) et vient d'entrer dans le pool du sprint.\n` +
				`Soit c'est un accident : la ressortir (excludeFromSprint: true).\n` +
				`Soit c'est voulu et assumé : il faut alors décider ce que dit le bouton ` +
				`« Écouter » sur ces questions, et retirer la leçon de MUETTES_ASSUMEES ici.`,
		).toBe(false);
	});
});
