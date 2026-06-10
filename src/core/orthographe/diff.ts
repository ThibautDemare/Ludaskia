/* ============================================================
   Mode Orthographe — diff caractère par caractère (alignement LCS).
   Sert à montrer, à la correction, OÙ l'enfant a divergé de la bonne
   orthographe (lettres manquées ou erronées). Logique pure, testable.
   ============================================================ */

/** Pour chaque lettre du mot CORRECT, renvoie true si l'enfant ne l'a pas
    produite correctement (lettre manquée ou erronée), via alignement LCS.
    Comparaison sur la forme NFC (accents pris en compte). */
export function diffCorrect(saisie: string, correct: string): boolean[] {
	const a = Array.from(saisie.normalize('NFC'));
	const b = Array.from(correct.normalize('NFC'));
	const n = a.length;
	const m = b.length;

	// dp[i][j] = longueur de la plus longue sous-séquence commune de a[i..] et b[j..].
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}

	// Backtrack : les lettres de b appariées sont « correctes » (false).
	const marked = new Array<boolean>(m).fill(true);
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			marked[j] = false;
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			i++;
		} else {
			j++;
		}
	}
	return marked;
}
