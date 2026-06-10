/* ============================================================
   Synthèse vocale (dictée) — best-effort via la Web Speech API.
   La dictée n'est proposée que si une voix française est disponible
   (voix locale préférée : vie privée + hors-ligne ; repli sur une voix
   distante si c'est la seule). Voir docs/design-orthographe.md (§ Dictée).
   ============================================================ */
let voices: SpeechSynthesisVoice[] = [];

function refresh(): void {
	if (typeof speechSynthesis === 'undefined') return;
	voices = speechSynthesis.getVoices();
}

/** À appeler au démarrage : les voix se chargent souvent de façon asynchrone. */
export function initTts(): void {
	if (typeof speechSynthesis === 'undefined') return;
	refresh();
	speechSynthesis.addEventListener('voiceschanged', refresh);
}

/** Voix française : on privilégie une voix LOCALE (privée, hors-ligne). */
function voixFr(): SpeechSynthesisVoice | null {
	const fr = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('fr'));
	return fr.find((v) => v.localService) ?? fr[0] ?? null;
}

/** La dictée est-elle disponible sur cet appareil (au moins une voix FR) ? */
export function dicteeDisponible(): boolean {
	if (typeof speechSynthesis === 'undefined') return false;
	if (!voices.length) refresh();
	return voixFr() !== null;
}

/** Dicte « mot. Comme dans : phrase » (la phrase lève l'ambiguïté des homophones). */
export function dicter(mot: string, commeDans?: string): void {
	if (typeof speechSynthesis === 'undefined') return;
	speechSynthesis.cancel(); // évite l'empilement des énoncés
	const v = voixFr();
	const texte = commeDans && commeDans.trim() ? `${mot}. Comme dans : ${commeDans}` : mot;
	const u = new SpeechSynthesisUtterance(texte);
	if (v) u.voice = v;
	u.lang = v?.lang ?? 'fr-FR';
	u.rate = 0.85; // diction un peu lente pour un enfant
	speechSynthesis.speak(u);
}
