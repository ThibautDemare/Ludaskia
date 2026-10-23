/* ============================================================
   Détecteur partagé (non collecté) : le NOM d'un groupe de choix de QCM à trou (#777,
   relecture accessibilité, B2). Utilisé par `qcm-trou-legende.test.ts` (fiches) et
   `bilan-parcours-ecran.test.ts` (parcours) ; ses témoins sont dans le premier.

   Exigence : le nom reprend l'énoncé, trou marqué « (trou) » à la place du `@`. On n'en
   fige pas la tournure : le nom porte autant de « (trou) » que l'énoncé de `@`, aucun
   « @ », et chaque MOT de l'énoncé s'y retrouve, dans l'ordre, du même côté du trou. Les
   signes (flèche, gras `**`, ponctuation) peuvent être dits, tus ou changés.
   ============================================================ */

/** Le marqueur du trou, tel que la décision l'écrit. */
export const TROU = '(trou)';

const mots = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** `attendus` apparaît-il, dans l'ordre, parmi `vus` ? */
function sousSuite(attendus: readonly string[], vus: readonly string[]): boolean {
	let j = 0;
	for (const m of vus) if (j < attendus.length && m === attendus[j]) j++;
	return j === attendus.length;
}

/** Défauts du nom `nom` d'un groupe de choix dont l'énoncé (avec ses `@`) est `enonce`. */
export function defautsNom(nom: string, enonce: string): string[] {
	const d: string[] = [];
	const lu = nom.replace(/\s+/g, ' ').trim();
	if (lu === '' || lu === 'réponse') d.push(`nom générique « ${lu} »`);
	if (nom.includes('@')) d.push('« @ » dans le nom');
	if (nom.includes('**')) d.push('« ** » dans le nom');
	const morceauxEnonce = enonce.split('@');
	const morceauxNom = nom.split(TROU);
	if (morceauxNom.length !== morceauxEnonce.length) {
		d.push(
			`${morceauxNom.length - 1} « ${TROU} » pour ${morceauxEnonce.length - 1} trou(s) : « ${lu} »`,
		);
		return d;
	}
	morceauxEnonce.forEach((m, i) => {
		const attendus = mots(m);
		if (!sousSuite(attendus, mots(morceauxNom[i])))
			d.push(`mots « ${attendus.join(' ')} » absents de part ${i + 1} du trou : « ${lu} »`);
	});
	return d;
}
