/* ============================================================
   Séance partagée (#734) — forme des LIENS et identifiants aléatoires.

   Les deux routes vivent dans le fragment : `#envoi/<code>` (l'enfant joue) et
   `#resultat/<code>` (l'encadrant lit). Le fragment n'est jamais transmis au
   serveur qui sert la page (critère 28).
   ============================================================ */
import type { TypeLien } from './codec';

const PREFIXES: Record<TypeLien, string> = { envoi: '#envoi/', resultat: '#resultat/' };

/** Fragment d'URL d'un code, `#` compris. */
export function fragmentLien(type: TypeLien, code: string): string {
	return PREFIXES[type] + code;
}

/** Reconnaît un fragment de lien partagé (`#envoi/…` ou `#resultat/…`). Rend `null`
 *  pour toute autre route — c'est au décodage de juger le code lui-même. */
export function lireFragment(hash: string): { type: TypeLien; code: string } | null {
	for (const type of ['envoi', 'resultat'] as const) {
		if (!hash.startsWith(PREFIXES[type])) continue;
		const code = hash.slice(PREFIXES[type].length);
		return code ? { type, code } : null;
	}
	return null;
}

/** Identifiant aléatoire (base64url, 12 caractères, 72 bits), tiré par
 *  `crypto.getRandomValues`. Ne dérive de rien : ni profil, ni appareil, ni date. */
export function nouvelIdentifiant(): string {
	const octets = crypto.getRandomValues(new Uint8Array(9));
	return btoa(String.fromCharCode(...octets))
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
}
