/* ============================================================
   Normalisation « texte affiché → texte parlé » (#42, src/core/tts-text.ts).
   Logique pure : on vérifie le marqueur `@`, les signes d'opération, les
   balises HTML et l'attribut data-tts. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { texteParle, ttsAttr } from '../src/core/tts-text';
import { formatNombre } from '../src/core/nombres';
import { escapeHTML } from '../src/core/utils';

describe('texteParle', () => {
	it('retire le marqueur @ du trou à remplir (silence, pas « arobase »)', () => {
		expect(texteParle('Combien font 3 et 4 ? @')).toBe('Combien font 3 et 4 ?');
		expect(texteParle('@ litres')).toBe('litres');
	});

	it('traduit les signes d’opération entourés d’espaces en mots', () => {
		expect(texteParle('7 + 8 = @')).toBe('7 plus 8 égale');
		expect(texteParle('12 - 5 = @')).toBe('12 moins 5 égale');
		expect(texteParle('3 × 4 = @')).toBe('3 fois 4 égale');
		expect(texteParle('12 ÷ 3 = @')).toBe('12 divisé par 3 égale');
	});

	it('ne touche pas un tiret interne d’un mot composé', () => {
		expect(texteParle('Range « porte-clé » et « chou-fleur ».')).toBe(
			'Range « porte-clé » et « chou-fleur ».',
		);
	});

	it('retire les balises HTML et décode les entités usuelles', () => {
		expect(texteParle('Quel est le <strong>contraire</strong> de grand ?')).toBe(
			'Quel est le contraire de grand ?',
		);
		expect(texteParle('Pierre &amp; Paul')).toBe('Pierre & Paul');
	});

	/* Décodage des entités — éprouvé SUR `texteParle` SEUL. Passer par `ttsAttr` combinerait
	   décodage et ré-échappement : une régression du décodage y serait invisible (l'entité
	   ressortirait telle quelle et personne ne le verrait), alors que le TTS, lui, épellerait
	   « et dièse trente-neuf point-virgule ». Les attendus sont dérivés du RÉSULTAT visé —
	   « ce que l'énoncé AFFICHE doit être ce qu'on entend » — et non de la chaîne de `replace`. */
	it('décode les CINQ entités, chacune prise isolément', () => {
		expect(texteParle('Pierre &amp; Paul')).toBe('Pierre & Paul');
		expect(texteParle('3 &lt; 7')).toBe('3 < 7');
		expect(texteParle('7 &gt; 3')).toBe('7 > 3');
		expect(texteParle('Dis &quot;bonjour&quot;')).toBe('Dis "bonjour"');
		expect(texteParle('l&#39;école')).toBe("l'école");
		// Aucune entité ne doit SURVIVRE dans le texte remis au moteur vocal.
		expect(texteParle('&amp; &lt; &gt; &quot; &#39;')).not.toMatch(/&(amp|lt|gt|quot|#39);/);
	});

	it('l’esperluette est décodée en DERNIER : « &amp;lt; » reste « &lt; » et non « < »', () => {
		// Cas discriminant de l'ORDRE. Une esperluette LITTÉRALE suivie de « lt; » (ce que
		// produit `escapeHTML` sur le texte « &lt; ») ne doit perdre qu'UNE couche : l'énoncé
		// affiche « &lt; », on doit entendre « &lt; ». Décoder `&amp;` en premier ferait
		// réapparaître un chevron jamais affiché.
		expect(texteParle('&amp;lt;')).toBe('&lt;');
		expect(texteParle('Tape &amp;lt; pour un chevron')).toBe('Tape &lt; pour un chevron');
		// Même garde pour les quatre autres : une seule couche retirée, jamais deux.
		expect(texteParle('&amp;gt;')).toBe('&gt;');
		expect(texteParle('&amp;quot;')).toBe('&quot;');
		expect(texteParle('&amp;#39;')).toBe('&#39;');
		expect(texteParle('&amp;amp;')).toBe('&amp;');
	});

	it('le décodage vient APRÈS le retrait des balises : une balise échappée est LUE, pas retirée', () => {
		// Contraste : `<strong>` réel = mise en forme, il disparaît ; « &lt;strong&gt; » est du
		// texte AFFICHÉ à l'écran, il doit s'entendre. L'inverse (décoder d'abord) rendrait
		// muet un énoncé qui montre une balise.
		expect(texteParle('Le <strong>mot</strong> compte')).toBe('Le mot compte');
		expect(texteParle('Écris &lt;strong&gt; en entier')).toBe('Écris <strong> en entier');
	});

	it('les caractères décodés ne retombent pas dans les règles suivantes', () => {
		// Chevrons : aucune règle d'opérateur ne les verbalise (seul « = » entouré d'espaces
		// devient un mot) — ils traversent tels quels. Cf. rapport : ce n'est PAS « plus petit
		// que » à l'oreille.
		expect(texteParle('12 &gt; 5 et 5 &lt; 12')).toBe('12 > 5 et 5 < 12');
		// Une apostrophe décodée ne casse pas la frontière de mot des unités.
		expect(texteParle('l&#39;objet mesure 24 cm')).toBe("l'objet mesure 24 centimètres");
		// Ni l'épellation des décimales (le guillemet décodé encadre sans interférer).
		expect(texteParle('&quot;3,04&quot;')).toBe('"3 virgule zéro quatre"');
		// Un « = » voisin d'entités reste converti, et le collapse final absorbe le trou du @.
		expect(texteParle('3 + 4 = @ &amp; c&#39;est tout')).toBe("3 plus 4 égale & c'est tout");
	});

	it('aller-retour : tout ce que `escapeHTML` produit revient au caractère d’origine', () => {
		// Contrat de bout en bout entre les deux modules : c'est LUI qui doit tenir quand
		// l'échappement évolue (il a déjà gagné trois caractères). Chaînes sans espace double
		// ni bord blanc, que `texteParle` normalise par ailleurs.
		for (const s of ['&', '<', '>', '"', "'", '5 < 7 & 7 > 5', 'l\'élève dit "oui"', '<b>']) {
			expect(texteParle(escapeHTML(s)), s).toBe(s);
		}
	});

	it('neutralise les séparateurs purement visuels (puce, tirets longs, flèche)', () => {
		expect(texteParle('pouvoir · présent — je @')).toBe('pouvoir présent je');
		expect(texteParle('« mes amis et moi » → @')).toBe('« mes amis et moi »');
	});

	it('lit les unités en toutes lettres', () => {
		expect(texteParle('Tu as 20 €.')).toBe('Tu as 20 euros.');
		expect(texteParle('Périmètre : 24 cm')).toBe('Périmètre : 24 centimètres');
		expect(texteParle('une demi-heure = @ min')).toBe('une demi-heure égale minutes');
	});

	it('réduit les espaces multiples et trim', () => {
		expect(texteParle('  a   b  ')).toBe('a b');
		expect(texteParle('')).toBe('');
	});

	it('épelle la partie décimale chiffre à chiffre, zéro médian compris (#246)', () => {
		// « avaler » le zéro (« trois virgule quatre ») effacerait la différence 3,04 ≠ 3,4.
		expect(texteParle('3,04')).toBe('3 virgule zéro quatre');
		expect(texteParle('0,45')).toBe('0 virgule quatre cinq');
		// Le zéro FINAL est lu aussi (distingue « 3,4 » de « 3,40 » à l'oreille).
		expect(texteParle('Compare 3,4 et 3,40.')).toBe(
			'Compare 3 virgule quatre et 3 virgule quatre zéro.',
		);
		// Partie entière à plusieurs chiffres : préservée, lue comme un entier.
		expect(texteParle('13,44')).toBe('13 virgule quatre quatre');
		// La virgule d'ÉNUMÉRATION (suivie d'une espace) n'est PAS touchée.
		expect(texteParle('Range 3, puis 5.')).toBe('Range 3, puis 5.');
		// Un MONTANT en euros n'est PAS épelé (registre monétaire, lecture native) :
		// « 1,50 € » reste « 1,50 euros », pas « 1 virgule cinq zéro » — sinon régression
		// de la lecture vocale de la monnaie CM1 (monnaie.ts), atteignable en révision.
		expect(texteParle('Un stylo coûte 1,50 €.')).toBe('Un stylo coûte 1,50 euros.');
		// N'interfère pas avec le séparateur de milliers (fine insécable U+202F) : un
		// grand entier reste collé en entier, sans « virgule » parasite.
		expect(texteParle(`${formatNombre(13440)}`)).toBe('13440');
	});

	it('colle les classes d’un grand nombre pour une lecture « entier » (#240)', () => {
		// formatNombre groupe avec l'espace fine insécable U+202F ; le TTS doit lire
		// l'entier (« un million deux mille cinquante »), pas épeler les groupes.
		expect(texteParle(`Compare ${formatNombre(1002050)} et 999.`)).toBe('Compare 1002050 et 999.');
		expect(texteParle(`La centaine de mille juste avant ${formatNombre(4538207)} : @`)).toBe(
			'La centaine de mille juste avant 4538207 :',
		);
		// L'espace insécable U+00A0 entre chiffres est aussi neutralisé.
		expect(texteParle('x ' + '1' + String.fromCharCode(0x00a0) + '234 y')).toBe('x 1234 y');
	});
});

describe('ttsAttr', () => {
	it('produit un attribut data-tts échappé pour les guillemets droits', () => {
		expect(ttsAttr('dire "oui"').balisage).toBe(' data-tts="dire &quot;oui&quot;"');
	});

	it('renvoie une chaîne vide quand il n’y a rien à lire', () => {
		expect(ttsAttr('@').balisage).toBe('');
		expect(ttsAttr('   ').balisage).toBe('');
	});

	/* Le module n'a plus sa copie privée d'échappement : la valeur d'attribut est protégée
	   par `escapeHTML` (core/utils). On l'éprouve donc par PARSING — ce que le navigateur
	   reconstruit — et non par comparaison de chaînes, qui ne dirait rien de l'attribut réel
	   et se contenterait de recopier la table d'échappement du jour. */
	it('guillemet et apostrophe : l’attribut se relit intact une fois parsé', () => {
		const hote = document.createElement('div');
		hote.innerHTML = `<span class="consigne"${ttsAttr('Le mot "chat" s\'écrit : @').balisage}>x</span>`;
		const span = hote.querySelector('span');
		expect(span).toBeTruthy();
		// Attendu dérivé à la main : `@` (le trou à remplir) devient un silence, le reste est
		// lu tel quel — guillemets droits et apostrophe compris.
		expect(span!.getAttribute('data-tts')).toBe('Le mot "chat" s\'écrit :');
		expect([...span!.getAttributeNames()].sort()).toEqual(['class', 'data-tts']);
	});

	it('une consigne hostile ne peut plus refermer l’attribut ni en fabriquer un autre', () => {
		const hote = document.createElement('div');
		hote.innerHTML = `<span${ttsAttr('Dis " onmouseover=alert(1) et \' oups').balisage}></span>`;
		const span = hote.querySelector('span')!;
		expect(span.getAttributeNames()).toEqual(['data-tts']);
		expect(span.getAttribute('data-tts')).toBe('Dis " onmouseover=alert(1) et \' oups');
	});
});
