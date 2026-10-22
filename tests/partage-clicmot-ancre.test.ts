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
		await expect(encoderEnvoi(envoi(exercice({ ancre: '' })))).rejects.toThrow();
		await expect(encoderEnvoi(envoi(exercice({ ancre: 'a'.repeat(61) })))).rejects.toThrow();
		expect((await allerRetour(exercice({ ancre: 'a'.repeat(60) }))).ancre).toBe('a'.repeat(60));
		expect(await decoderForge({ ...exercice(), ancre: '' })).toBe(false);
		expect(await decoderForge({ ...exercice(), ancre: 'a'.repeat(61) })).toBe(false);
		expect(await decoderForge({ ...exercice(), ancre: 42 })).toBe(false);
		expect(await decoderForge({ ...exercice(), ancre: 'oiseaux' })).toBe(true);
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
