/* ============================================================
   Séance partagée : l'ANCRE d'un exercice « clique sur le mot » voyage dans le lien
   (#777, critère 27 ; schéma `src/core/partage/exercices.ts`).
   ------------------------------------------------------------
   Quand la phrase porte deux groupes nominaux, l'ancre désigne le groupe attendu ; le repli
   écrit la cite (« … qui contient le mot « oiseaux » »). Dans un lien partagé, elle doit :
   - aller et revenir telle quelle (encodée, décodée) ;
   - rester FACULTATIVE : un exercice sans ancre se relit sans ancre (les anciens liens
     commités sont tenus par `partage-references.test.ts`, dont une référence à ancre) ;
   - obéir aux mêmes règles que les autres mots du lien, à l'écriture comme à la lecture
     (non vide, bornée) ;
   - être un mot de la CIBLE, casse ignorée, comme dans la banque (`gn`,
     data/francais/grammaire-groupe-nominal.ts) : hors de la cible, le repli désignerait un
     autre groupe que celui attendu ;
   - arriver jusqu'au repli de la séance, comme dans la fiche ordinaire.
   Témoin : un champ que le schéma ne connaît pas est refusé — l'aller-retour ci-dessous ne
   passe donc pas « par défaut ».
   ============================================================ */
import { describe, expect, it } from 'vitest';
import type { Exercise } from '../src/core/exercise';
import { encoder } from '../src/core/partage/codec';
import { decoderEnvoi, encoderEnvoi, type Envoi } from '../src/core/partage/envoi';
import { preparerPassage } from '../src/core/partage/passage';
import { getLessonById, itemDepuisExercice } from '../src/core/catalog';

type ClicMot = Extract<Exercise, { type: 'clicMot' }>;

const GN = 'fr-gram-groupe-nominal';

function exercice(champs: Partial<ClicMot> = {}): ClicMot {
	return {
		type: 'clicMot',
		tokens: ['Le', 'chien', 'regarde', 'les', 'oiseaux', '.'],
		cibleIndices: [3, 4],
		consigne:
			'Montre le groupe nominal qui contient le mot « oiseaux » : touche son premier mot, puis son dernier mot.',
		explication: 'Le groupe nominal est « les oiseaux ».',
		parle: 'Le chien regarde les oiseaux.',
		cibleLabel: 'le groupe nominal',
		explicationNommeCible: true,
		segment: true,
		...champs,
	};
}

function envoi(ex: ClicMot): Envoi {
	return {
		id: 'AncreTest001',
		libelle: 'Le groupe nominal',
		nature: 'bilan',
		variante: 'express',
		niveau: 'cm1',
		blocs: [{ lecon: GN, exercices: [ex] }],
	};
}

async function allerRetour(ex: ClicMot): Promise<ClicMot> {
	const lu = await decoderEnvoi(await encoderEnvoi(envoi(ex)));
	if (!lu.ok) throw new Error(`lien refusé : ${lu.raison}`);
	if (lu.valeur.nature === 'dictee') throw new Error('nature inattendue');
	const [relu] = lu.valeur.blocs[0].exercices;
	if (relu.type !== 'clicMot') throw new Error(`format ${relu.type}`);
	return relu;
}

/** Un lien FORGÉ (JSON écrit à la main, sans passer par l'écriture stricte) : ce que le
    décodeur en fait. */
async function decoderForge(ex: Record<string, unknown>): Promise<boolean> {
	const forge = {
		id: 'AncreTest001',
		libelle: 'Le groupe nominal',
		nature: 'bilan',
		variante: 'express',
		niveau: 'cm1',
		blocs: [{ lecon: GN, exercices: [ex] }],
	};
	return (await decoderEnvoi(await encoder('envoi', forge))).ok;
}

describe('#777 — l’ancre d’un « clique sur le mot » dans un lien partagé', () => {
	it('aller-retour : l’ancre revient telle quelle, et l’exercice entier aussi', async () => {
		const ex = exercice({ ancre: 'oiseaux' });
		const relu = await allerRetour(ex);
		expect(relu.ancre).toBe('oiseaux');
		expect(relu).toEqual(ex);
	});

	it('facultative : un exercice sans ancre se relit, sans ancre', async () => {
		const relu = await allerRetour(exercice());
		expect(relu.ancre).toBeUndefined();
		expect(relu).toEqual(exercice());
	});

	it('bornes : ancre vide ou de 61 caractères refusée à l’écriture comme à la lecture ; 60, acceptée', async () => {
		// L'ancre doit être un mot de la cible : chaque borne est donc posée sur un mot de la
		// cible, pour que seule la LONGUEUR puisse la faire refuser.
		const mot60 = 'a'.repeat(60);
		const avec60 = (ancre: string) =>
			exercice({ tokens: ['Le', 'chien', 'regarde', 'les', mot60, '.'], ancre });
		expect((await allerRetour(avec60(mot60))).ancre).toBe(mot60);
		expect(await decoderForge({ ...avec60(mot60) })).toBe(true);
		// 61 : un mot de la phrase ne dépasse pas 60, mais la comparaison ignore la casse et
		// « İ » (U+0130) devient « i̇ » (deux caractères) en minuscules. Un mot de 60 caractères
		// a donc un équivalent sans casse de 61 : une ancre DANS la cible, que seule sa
		// longueur peut faire refuser.
		const motI = 'İ' + 'a'.repeat(59);
		const ancre61 = 'i̇' + 'a'.repeat(59);
		expect([motI.length, ancre61.length]).toEqual([60, 61]);
		expect(ancre61.toLowerCase()).toBe(motI.toLowerCase());
		const avecI = (ancre: string) =>
			exercice({ tokens: ['Le', 'chien', 'regarde', 'les', motI, '.'], ancre });
		expect((await allerRetour(avecI(motI))).ancre).toBe(motI); // témoin : la phrase est valide
		await expect(encoderEnvoi(envoi(avecI(ancre61)))).rejects.toThrow();
		expect(await decoderForge({ ...avecI(ancre61) })).toBe(false);
		// Vide : aucun mot ne l'est, elle est donc AUSSI hors de la cible ; on n'isole pas
		// ici la règle « non vide », on tient seulement le refus.
		await expect(encoderEnvoi(envoi(exercice({ ancre: '' })))).rejects.toThrow();
		expect(await decoderForge({ ...exercice(), ancre: '' })).toBe(false);
		expect(await decoderForge({ ...exercice(), ancre: 42 })).toBe(false);
		expect(await decoderForge({ ...exercice(), ancre: 'oiseaux' })).toBe(true);
	});

	it('appartenance : une ancre hors de la cible est refusée, à l’écriture comme à la lecture, casse ignorée', async () => {
		// Cible « les oiseaux » (indices 3 et 4). Le repli cite l'ancre comme LE mot que
		// contient le groupe attendu : un autre mot désignerait un autre groupe.
		const refusees = [
			'chien', // dans la phrase, hors de la cible : désigne « Le chien »
			'Chien', // la casse ne fait pas entrer un mot hors de la cible
			'oiseau', // morceau d'un mot de la cible, pas un mot de la cible
			'.',
		];
		for (const ancre of refusees) {
			await expect(encoderEnvoi(envoi(exercice({ ancre }))), ancre).rejects.toThrow();
			expect(await decoderForge({ ...exercice(), ancre }), ancre).toBe(false);
		}
		for (const ancre of ['oiseaux', 'OISEAUX', 'Oiseaux', 'les', 'Les']) {
			expect((await allerRetour(exercice({ ancre }))).ancre, ancre).toBe(ancre);
			expect(await decoderForge({ ...exercice(), ancre }), ancre).toBe(true);
		}
		// Mot de la cible écrit avec une majuscule dans la phrase, ancre en minuscules.
		const enTete = exercice({
			tokens: ['Les', 'oiseaux', 'chantent', '.'],
			cibleIndices: [0, 1],
			ancre: 'les',
		});
		expect((await allerRetour(enTete)).ancre).toBe('les');
		expect(await decoderForge({ ...enTete, ancre: 'chantent' })).toBe(false);
	});

	it('témoin : un champ inconnu du schéma est refusé (l’aller-retour ne passe pas par défaut)', async () => {
		expect(await decoderForge({ ...exercice(), ancreX: 'oiseaux' })).toBe(false);
		expect(await decoderForge(exercice())).toBe(true);
	});

	it('séance partagée : le repli écrit cite l’ancre, comme la fiche ordinaire', async () => {
		const lu = await decoderEnvoi(await encoderEnvoi(envoi(exercice({ ancre: 'oiseaux' }))));
		if (!lu.ok) throw new Error(`lien refusé : ${lu.raison}`);
		const p = preparerPassage(lu.valeur);
		if (!p.ok) throw new Error(`passage refusé : ${p.raison}`);
		const [{ item }] = p.blocs[0].items;
		const lecon = getLessonById(GN)!;
		expect(item).toEqual(itemDepuisExercice(lecon, exercice({ ancre: 'oiseaux' })));
		const cites = [...item.text.matchAll(/«\s*([^«»]+?)\s*»/gu)].map((m) => m[1]);
		expect(cites, `« ${item.text} »`).toContain('oiseaux');
	});
});
