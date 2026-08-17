/* ============================================================
   Synthèse vocale (dictée) — best-effort via la Web Speech API.
   La dictée n'est proposée que si une voix française est disponible
   (voix locale préférée : vie privée + hors-ligne ; repli sur une voix
   distante si c'est la seule). Voir docs/design-orthographe.md (§ Dictée).

   HORS LIGNE, ce repli ne tient plus (#306 §5). Une voix « distante »
   (`localService === false`) fait synthétiser le son par un serveur : sans
   réseau, elle ne produit RIEN. L'appareil qui n'a que celle-là déclarait donc
   la dictée disponible, la lançait, et restait muet. On exige par conséquent une
   voix LOCALE dès qu'on se sait hors ligne. L'information était déjà là, elle
   n'était simplement pas utilisée comme condition.

   Pourquoi `navigator.onLine` alors qu'il est réputé peu fiable : il l'est dans
   un seul sens. `true` ne prouve rien (derrière un portail captif, il ment),
   mais `false` signifie bien qu'il n'y a pas de réseau. On ne s'en sert que dans
   ce sens-là.
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

/** Sait-on de façon SÛRE qu'il n'y a pas de réseau ? (cf. en-tête) */
function horsLigne(): boolean {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Voix française : on privilégie une voix LOCALE (privée, hors-ligne), et hors
 *  ligne on l'EXIGE — une voix distante y serait silencieuse. */
function voixFr(): SpeechSynthesisVoice | null {
	const fr = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('fr'));
	const locale = fr.find((v) => v.localService);
	if (locale) return locale;
	return horsLigne() ? null : (fr[0] ?? null);
}

/** La dictée est-elle disponible sur cet appareil (au moins une voix FR utilisable) ? */
export function dicteeDisponible(): boolean {
	if (typeof speechSynthesis === 'undefined') return false;
	if (!voices.length) refresh();
	return voixFr() !== null;
}

/* Pourquoi la voix manque, pour le dire à l'écran sans inventer un message :
   `aucune` = cet appareil n'a pas de voix française du tout (cas déjà connu de
   l'espace encadrant) ; `horsLigne` = il en a une, mais elle a besoin d'Internet.
   Deux causes bien distinctes, deux actions différentes pour l'adulte. */
export type RaisonSansVoix = 'aucune' | 'horsLigne';

/* Le message correspondant, EN UN SEUL ENDROIT. Il est affiché à deux endroits très
   différents (les réglages de l'espace encadrant et l'écran d'une dictée devenue
   muette) : deux formulations concurrentes pour la même cause finiraient par diverger,
   et l'une des deux oublierait de dire que ce n'est pas définitif. */
export function messageSansVoix(): string {
	switch (raisonSansVoix()) {
		case 'horsLigne':
			return "Lecture vocale indisponible sans connexion : la voix française de cet appareil a besoin d'Internet. Elle revient dès que la connexion est rétablie.";
		case 'aucune':
			return 'Lecture vocale indisponible sur cet appareil (aucune voix française).';
		default:
			return 'Lecture vocale disponible sur cet appareil.';
	}
}

export function raisonSansVoix(): RaisonSansVoix | null {
	if (dicteeDisponible()) return null;
	if (typeof speechSynthesis === 'undefined') return 'aucune';
	const fr = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('fr'));
	return fr.length > 0 && horsLigne() ? 'horsLigne' : 'aucune';
}

/* Un échec de lecture réel, ou une coupure qu'on a nous-mêmes provoquée ?
   `speechSynthesis.cancel()` (nouvelle écoute, changement d'écran) fait échouer
   l'énoncé en cours avec `canceled`/`interrupted` : le prendre pour une panne
   ferait passer une dictée parfaitement audible pour muette au deuxième clic. */
function pannreelle(e: Event): boolean {
	const code = (e as SpeechSynthesisErrorEvent).error;
	return code !== 'canceled' && code !== 'interrupted';
}

/* Dicte « mot. Comme dans : phrase » (la phrase lève l'ambiguïté des homophones).
   `onErreur` est un FILET DE SÉCURITÉ : il prévient l'appelant que rien n'a été
   prononcé — pas de voix utilisable, ou énoncé en échec. Pour une dictée, le TTS
   n'est pas un confort, c'est l'exercice : l'appelant doit pouvoir refuser de
   corriger une saisie faite dans le silence (cf. journal d'erreurs #391). */
export function dicter(mot: string, commeDans?: string, onErreur?: () => void): void {
	if (typeof speechSynthesis === 'undefined') {
		onErreur?.();
		return;
	}
	if (!voices.length) refresh();
	const v = voixFr();
	if (!v) {
		onErreur?.();
		return;
	}
	speechSynthesis.cancel(); // évite l'empilement des énoncés
	const texte = commeDans && commeDans.trim() ? `${mot}. Comme dans : ${commeDans}` : mot;
	const u = new SpeechSynthesisUtterance(texte);
	u.voice = v;
	u.lang = v.lang || 'fr-FR';
	u.rate = 0.85; // diction un peu lente pour un enfant
	u.addEventListener('error', (e) => {
		if (pannreelle(e)) onErreur?.();
	});
	speechSynthesis.speak(u);
}

/** Coupe toute lecture en cours (changement d'écran, nouvelle question). */
export function stopTts(): void {
	if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/** Lit une CONSIGNE déjà normalisée (cf. core/tts-text). Débit un peu plus vif
 *  que la dictée mot-à-mot (phrase entière, pas d'épellation). `onDone` permet de
 *  retirer l'état visuel « ça parle » à la fin (ou en cas d'erreur/voix absente). */
export function dicterConsigne(texte: string, onDone?: () => void): void {
	if (typeof speechSynthesis === 'undefined' || !texte.trim()) {
		onDone?.();
		return;
	}
	speechSynthesis.cancel(); // un seul énoncé vivant à la fois
	const v = voixFr();
	const u = new SpeechSynthesisUtterance(texte);
	if (v) u.voice = v;
	u.lang = v?.lang ?? 'fr-FR';
	u.rate = 0.92;
	u.addEventListener('end', () => onDone?.());
	u.addEventListener('error', () => onDone?.());
	speechSynthesis.speak(u);
}
