/* ============================================================
   Fixture partagée (#706) : une liste d'orthographe déjà ENTIÈREMENT MAÎTRISÉE
   (atelier fait + les trois modes validés), pour les scénarios de TOUR DE
   RÉVISION du plafond de séance. Partagée entre `dictee-comptage.spec.ts` et
   `dictee-revision-plafond.spec.ts` — même fabrique, même liste par défaut de
   10 mots (lettres internes distinctes : tuiles non ambiguës si le tirage y
   tombe, cf. `ortho-revision.spec.ts`).

   N'est PAS un fichier de spec (pas de suffixe `.spec.ts`) : Playwright ne
   l'exécute pas comme test, seuls les fichiers qui l'importent le font tourner
   (même patron que `journal-couverture.ts`).
   ============================================================ */
export const MOTS_MAITRISES = [
	'chat',
	'lune',
	'radis',
	'jupe',
	'bocal',
	'guide',
	'minou',
	'sirop',
	'cheval',
	'pinceau',
];

export function seedListeMaitrisee(id: string, mots: string[] = MOTS_MAITRISES) {
	return {
		banque: Object.fromEntries(
			mots.map((mot, i) => [
				`${id}-m${i + 1}`,
				{
					id: `${id}-m${i + 1}`,
					mot,
					entourage: [],
					atelierFait: true,
					validation: { motCache: true, tuiles: true, dictee: true },
					revision: { palier: 4, prochaineRevision: null, reussites: 3, dernierTest: null },
					origine: 'liste',
				},
			]),
		),
		listes: [
			{
				id,
				label: 'Liste maîtrisée',
				motIds: mots.map((_, i) => `${id}-m${i + 1}`),
				createdAt: 1,
				updatedAt: 1,
			},
		],
		motIdParForme: Object.fromEntries(mots.map((mot, i) => [mot, `${id}-m${i + 1}`])),
	};
}
