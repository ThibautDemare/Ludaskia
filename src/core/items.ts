/* ============================================================
   Items {text, answer}  (@ = emplacement du champ de réponse)
   et fabrique de champs / grilles / fiches.
   ============================================================ */
import { escapeHTML, normalizeText } from './utils';
import { ttsAttr, texteParle } from './tts-text';
import { stackFractions } from './fraction-text';
import { wrapGrandsNombres, parseNombreFr } from './nombres';
import { estSigneComparaison, paveSignesHTML } from './signes';
import { attendueItem, corrigeIntercalation } from './erreur-representation';
import type { ChoiceView } from './exercise';

/* Opération posée (#97) : décrite par ses opérandes et son opérateur ; le rendu
   (grille de colonnes, cellules de résultat, produits partiels) est calculé par
   posedGridHTML. `kind: 'posed'` est un item « conteneur » : renderItem le déploie
   en PLUSIEURS champs `.ans` (un par chiffre de résultat), corrigés indépendamment
   par verify(). Multiplicateur `b` à 2 chiffres → produits partiels. */
export interface PosedSpec {
	op: '+' | '-' | 'x';
	a: number;
	b: number;
}

export interface Item {
	text: string;
	answer: number | string;
	answers?: string[]; // formes équivalentes acceptées (exercices texte)
	kind?: 'num' | 'text' | 'posed' | 'heure'; // 'num' (calcul) ; 'text' (chaîne) ; 'posed' (grille) ; 'heure' (2 champs H h MM, #88)
	posed?: PosedSpec; // présent si kind === 'posed'
	figure?: string; // fragment SVG (moteur core/figures.ts), affiché au-dessus de la question (#88)
	parle?: string; // texte LU à voix haute si l'énoncé est télégraphique (#42 ; cf. tts-text)
	// Intercaler (#240 CM1, #446 CE2) : la réponse n'est pas unique mais TOUTE valeur
	// strictement comprise entre deux bornes exclues [min, max] (« un nombre entre 450 et
	// 465 »). Présent ⇒ checkItemAnswer valide par appartenance à l'intervalle OUVERT ;
	// `answer` reste un exemple valide (révélation, mode tuiles). Absent ⇒ réponse unique.
	intervalle?: [number, number];
	// Réponse = une LISTE de mots à retrouver, DANS L'ORDRE (#436) : cible plurielle d'un
	// « clique sur le mot » rejouée en recopie (fiche / bilan), où la compétence évaluée est
	// de TROUVER les bons mots, pas de reproduire le connecteur qui les présente. Présent ⇒
	// `checkItemAnswer` accepte espaces, virgules et « et » indifféremment entre les mots
	// (cf. `memeListeDeMots`) ; `answer` garde la forme LISIBLE (« chien et gamelle »), seule
	// affichée/journalisée/imprimée. Absent ⇒ correction par égalité de chaîne, inchangée.
	motsAttendus?: string[];
	// QCM (#289) : choix conservés pour le rendu PAPIER en cases à cocher. À l'écran, le
	// QCM est joué par son runner interactif (qui lit l'Exercise, pas l'Item) ; ces champs
	// ne servent qu'au chemin fiche/bilan IMPRIMÉ. `choicesView` (vue riche) est aligné
	// par index sur `choices` (la valeur). Voir genLessonItem et renderItem.
	choices?: string[];
	choicesView?: ChoiceView[];
	_lesson?: string;
	// Journal d'erreurs (#391) : posé sur les cellules-CHIFFRES du RÉSULTAT d'une
	// opération posée. Permet à session.verify d'agréger les cellules d'une même grille
	// en UNE entrée d'erreur (l'opération et son résultat attendu) plutôt qu'une par
	// chiffre. `groupe` identifie la grille (chaîne stable, sérialisable pour la reprise).
	posedResult?: { groupe: string; operation: string; attendue: string; pos: number };
}

/* Un item est-il un QCM ? (source unique #289 : rendu PAPIER en cases à cocher dans
   renderItem, et consigne d'action « Coche… » de la fiche/du bloc de bilan). */
export const estItemQcm = (it: Item): boolean => !!(it.choices && it.choices.length);

/* Enveloppe d'affichage d'une figure SVG (#88), placée AVANT la question.
   Centralisé ici pour que tous les rendus (fiche, QCM, sprint, révision)
   affichent la figure de la même façon — appelée par renderItem et par les
   runners « une question à la fois ». Le fragment SVG n'est PAS échappé. */
export function figureBlock(figure?: string): string {
	return figure ? `<div class="figure">${figure}</div>` : '';
}

/* Énoncé d'un item, échappé puis enrichi : GRAS léger via `**…**` (#199 : question
   finale d'un problème), fractions « num/den » rendues empilées (#200, barre
   horizontale attendue au CE2) et grands nombres groupés enveloppés en .bignum
   (#240, numération « millions » : tabular-nums + nowrap + clamp, rendu identique
   partout). On échappe d'abord (sécurité), donc les balises injectées ensuite sont
   sûres. Les transformations sont disjointes (fractions = « n/m » ; grands nombres =
   classes séparées par U+202F, caractère introduit seulement par formatNombre) :
   sans effet de bord ailleurs. */
export function enonceTexte(text: string): string {
	return wrapGrandsNombres(
		stackFractions(escapeHTML(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')),
	);
}

/* Un bouton-choix de QCM (#200), partagé par le runner leçon et le sprint.
   `value` est la VALEUR comparée (rendue échappée par défaut) ; si une `view` riche
   est fournie, on rend son HTML/SVG de confiance avec un `aria-label` verbal (le
   lecteur d'écran lit le libellé, jamais le balisage ni « num slash den »). */
export function choiceButtonHTML(value: string, index: number, view?: ChoiceView): string {
	const inner = view ? view.html : escapeHTML(value);
	const aria = view ? ` aria-label="${escapeHTML(view.label)}"` : '';
	return `<button class="sprint-choice" data-i="${index}"${aria}>${inner}</button>`;
}

/* L'intervalle OUVERT ]min ; max[ admet-il PLUSIEURS réponses au sens du LANGAGE, c.-à-d.
   au moins TROIS entiers (écart ≥ 4) ? (#446)
   Seuil volontairement plus haut que « la réponse n'est pas unique » : « plusieurs réponses
   possibles » (suffixe de consigne) et « d'autres nombres » (correction en mode tuiles) sont
   des PLURIELS — impropres pour deux valeurs, carrément faux pour une. Source unique partagée
   par la DONNÉE (Fact.plusieurs, data/maths/numeration.ts) et les ÉCRANS de correction, pour
   qu'ils ne se contredisent jamais. À ne pas confondre avec la simple PRÉSENCE de `intervalle`
   (= la correction se fait par appartenance), qui suffit aux tournures indéfinies du type
   « une réponse possible était X ». */
export function intervalleAPlusieursReponses([min, max]: [number, number]): boolean {
	return max - min >= 4;
}

/* La réponse de cet item se corrige-t-elle NUMÉRIQUEMENT ? Lecture unique du `kind`,
   partagée par `checkItemAnswer` (quelle branche de comparaison) et par les runners
   (faut-il refuser une saisie qui n'est pas un nombre — cf. `saisieEstNombre`). Les deux
   DOIVENT rester d'accord : refuser une saisie sur un item corrigé en TEXTE interdirait
   des réponses parfaitement valides (« dix », « 10 h 15 », « < »). D'où la fonction
   commune plutôt que deux tests jumeaux qui divergeraient au premier `kind` ajouté.
   L'intervalle (#446) l'emporte sur le `kind` : la règle est portée par la DONNÉE.

   ⚠ Ne dit PAS d'où vient le `kind`. Celui-ci est décidé en amont, à la construction de
   l'item (`genLessonItem` → `answerEstNumerique`), selon un critère qui DIVERGE de
   `saisieEstNombre` : il ne neutralise pas les séparateurs de milliers, donc une réponse
   stockée groupée (« 1 002 050 ») produit un item `text`, corrigé par égalité de chaîne.
   Inerte sur le contenu actuel, mais à ne pas oublier avant d'ajouter une leçon dont la
   réponse est mise en forme (constat de l'auteur des tests, cf. tests/saisie-numerique). */
export function itemEstNumerique(it: Item): boolean {
	return !!it.intervalle || (it.kind !== 'text' && it.kind !== 'heure');
}

/* La saisie énonce-t-elle EXACTEMENT la liste de mots attendue, dans l'ORDRE (#436) ?
   Le connecteur de présentation est ignoré : espaces, virgules, points-virgules et « et »
   sont interchangeables (« chien et gamelle » = « chien gamelle » = « chien, gamelle »).
   L'ordre, lui, reste exigé (celui de la phrase).

   « et » n'est retiré que si son retrait est NÉCESSAIRE pour aligner les longueurs : une
   liste de mots attendue qui contiendrait « et » se compare d'abord telle quelle, donc
   reste corrigible.

   EXCEPTION DE CASSE, volontaire et bornée à ce chemin (ne pas la « corriger ») : la
   comparaison replie la casse, alors que le reste du moteur (`normalizeText`) l'exige.
   Raison : les mots recopiés sont PRÉLEVÉS DANS UNE PHRASE, et le premier y porte la
   majuscule de début de phrase (« Le et sa » pour les déterminants de « Le chien mange sa
   gamelle. ») — une majuscule qui relève de la phrase source, pas de la compétence
   évaluée, laquelle est de TROUVER les bons mots. Accents et apostrophes restent exigés
   comme partout : c'est bien la casse seule qu'on relâche, et seulement ici. L'affichage
   (réponse révélée, corrigé imprimé, journal encadrant) garde la forme de la phrase. */
export function memeListeDeMots(raw: string, mots: string[]): boolean {
	const pliee = (s: string) => normalizeText(s).toLocaleLowerCase('fr');
	const attendus = mots.map(pliee);
	const decoupe = pliee(raw)
		.split(/[\s,;]+/)
		.filter(Boolean);
	const identique = (liste: string[]) =>
		liste.length === attendus.length && liste.every((m, i) => m === attendus[i]);
	return identique(decoupe) || identique(decoupe.filter((m) => m !== 'et'));
}

/* Vérifie la réponse saisie pour un item, selon son type.
   - texte : normalizeText (trim + espaces internes réduits + NFC), accents/apostrophes
     exigés (formes alternatives via answers)
   - liste de mots (#436) : mêmes mots dans l'ordre, connecteur libre (`memeListeDeMots`)
   - calcul : comparaison numérique (virgule tolérée comme séparateur décimal) */
export function checkItemAnswer(it: Item, raw: string): boolean {
	// Intercaler par intervalle OUVERT (#240 CM1, #446 CE2) : toute valeur strictement
	// entre les bornes exclues. Même tolérance de saisie que la comparaison numérique
	// (parseNombreFr : virgule décimale, séparateurs de milliers).
	// Testé AVANT le `kind` : la règle est portée par la DONNÉE (présence des bornes), pas par
	// la matière ni par le type de champ. Sans ça, un item à intervalle rendu en `kind: 'text'`
	// — ce que produit `genLessonItem` pour toute leçon NON mathématique — serait corrigé par
	// égalité de chaîne, donc n'accepterait que la valeur-exemple, pendant que la correction
	// affichée, elle, annoncerait la bande. Inerte pour le contenu actuel (les intercalations
	// existantes sont `kind: 'num'`, qui n'entrait déjà pas dans la branche texte).
	if (it.intervalle) {
		const v = parseNombreFr(raw);
		if (Number.isNaN(v)) return false;
		const [min, max] = it.intervalle;
		return v > min && v < max;
	}
	// Liste de mots (#436) : même parti pris que `intervalle` juste au-dessus — la règle de
	// correction est portée par la DONNÉE de l'item, pas par le `kind` ni par la matière.
	if (it.motsAttendus) return memeListeDeMots(raw, it.motsAttendus);
	// 'heure' (#88) : saisie en 2 champs, déjà fusionnée en « H h MM » par l'appelant
	// (session.verify) ; on la compare comme du texte (forme canonique + variantes).
	if (!itemEstNumerique(it)) {
		const v = normalizeText(raw);
		if (v === normalizeText(String(it.answer))) return true;
		return (it.answers ?? []).some((a) => normalizeText(a) === v);
	}
	// Comparaison numérique tolérante (via parseNombreFr) appliquée SYMÉTRIQUEMENT à la
	// saisie ET à la réponse stockée : neutralise les séparateurs de milliers d'un grand
	// nombre recopié (« 1 002 050 », #240) et accepte la virgule décimale des deux côtés —
	// une réponse stockée en virgule (« 4,56 », conversions décimales #248) se valide, et
	// « 4,50 » == « 4,5 » découle de l'égalité numérique.
	return parseNombreFr(raw) === parseNombreFr(String(it.answer));
}

export function add(a: number, b: number): Item {
	return { text: `${a} + ${b} = @`, answer: a + b };
}
export function sub(a: number, b: number): Item {
	return { text: `${a} - ${b} = @`, answer: a - b };
}
export function mul(a: number, b: number): Item {
	return { text: `${a} × ${b} = @`, answer: a * b };
}
export function div(a: number, b: number): Item {
	// Division EXACTE (quotient entier) du calcul mental : l'appelant garantit que
	// `a` est un multiple de `b` (jamais de reste ni de virgule au CM1, cf. ÷10/÷100).
	return { text: `${a} ÷ ${b} = @`, answer: a / b };
}
export function dbl(n: number): Item {
	return { text: `double de ${n} = @`, answer: 2 * n };
}
export function half(n: number): Item {
	// « La moitié de » (article) : aligné sur la leçon « Division par le sens » (#104).
	return { text: `La moitié de ${n} = @`, answer: n / 2 };
}
export function comp(a: number, total: number): Item {
	return { text: `${a} + @ = ${total}`, answer: total - a };
}
export function facteur(a: number, total: number): Item {
	return { text: `${a} × @ = ${total}`, answer: total / a };
}

/* Contexte de rendu (#352) : regroupe l'état AUTREFOIS porté par des variables de
   module (compteur d'id, table id→Item, leçon courante, modes impression/corrigé).
   Il est passé EXPLICITEMENT aux fonctions de rendu (renderItem, gridHTML,
   posedGridHTML) — plus d'état global implicite, donc plus de fuite entre tests ni
   de chemins d'écriture parallèles. Chaque rendu possède le sien : buildPrintableDOM
   crée un contexte d'impression frais, le lancement d'une session interactive crée
   le sien (conservé côté UI pour la correction/reprise). */
export interface RenderContext {
	// Prochain id de champ (« a0 », « a1 »…), incrémenté par nextInputId au fil du rendu.
	counter: number;
	// Items {text, answer} rendus, par id de champ : sert à corriger la saisie (scoring)
	// et à reconstruire « mes erreurs » en révision. Rempli pendant le rendu.
	items: Record<string, Item>;
	// Leçon en cours de rendu (attribut data-lesson des champs, agrégat de stats par
	// leçon), ou null si les champs ne sont rattachés à aucune leçon.
	lessonId: string | null;
	// Mode IMPRESSION (#289) : QCM rendus en cases à cocher, zone-réponse garantie pour
	// tout item. À l'écran (false), sprint et bilan interactif sont inchangés.
	printMode: boolean;
	// Mode CORRIGÉ (#41) : sous-mode d'impression qui RÉVÈLE les réponses (ligne remplie,
	// case cochée ☑, cellules posées complétées). N'a d'effet que si printMode est actif.
	corrigeMode: boolean;
}

/* Crée un contexte de rendu neuf. Sans argument : session interactive à l'écran
   (compteur à 0, table vide, hors impression). `init` surcharge à la création
   (ex. { printMode: true } pour l'impression, { items, counter } pour une reprise). */
export function createRenderContext(init: Partial<RenderContext> = {}): RenderContext {
	return { counter: 0, items: {}, lessonId: null, printMode: false, corrigeMode: false, ...init };
}

// Id de champ unique dans le contexte (« a0 », « a1 »…).
export const nextInputId = (ctx: RenderContext) => 'a' + ctx.counter++;
// Attribut data-lesson, ou rien si le champ n'est rattaché à aucune leçon.
export const lessonAttr = (ctx: RenderContext) =>
	ctx.lessonId != null ? ` data-lesson="${ctx.lessonId}"` : '';

/* Nom accessible d'un champ de réponse (#577). Sans lui, un lecteur d'écran annonce
   « zone de saisie » — six fois de suite sur une fiche de conjugaison, sans jamais dire
   de quelle personne il s'agit : la leçon devient inutilisable sans la vue. L'énoncé qui
   entoure le champ EST son libellé visuel ; il ne manquait que le lien programmatique.

   On dérive ce nom de `texteParle` (« comment cet énoncé se lit à voix haute ») plutôt
   que d'écrire un libellé à la main par leçon : elle sait déjà taire le `@`, verbaliser
   opérateurs et unités, et honore `parle` pour les énoncés télégraphiques
   (« être · présent — je @ » → « être présent je »). Un libellé par leçon serait à
   réécrire à chaque leçon ajoutée et divergerait, à terme, de ce que dit le bouton
   « Écouter » — deux versions du même énoncé qui se contredisent.

   Repli « réponse » si l'énoncé ne donne rien à lire (item à figure seule) : un nom
   générique reste préférable à l'absence de nom, qu'axe classe `critical`. */
export function nomChampReponse(it: Item): string {
	return texteParle(it.parle ?? it.text) || 'réponse';
}

/* Attribut `aria-label` prêt à coller sur un champ de réponse. `role` précise le FORMAT
   attendu quand le champ n'accepte pas n'importe quelle réponse (un signe, un chiffre
   unique) — utile à qui ne voit ni le pavé de signes ni la fraction empilée. Il vient
   APRÈS l'énoncé : c'est l'énoncé qui distingue ce champ de ses voisins, et un lecteur
   d'écran annonce le début du nom en premier. */
export const ariaChamp = (it: Item, role?: string) =>
	` aria-label="${escapeHTML(role ? `${nomChampReponse(it)} — ${role}` : nomChampReponse(it))}"`;

/* Rend un fragment en rattachant ses champs à `lessonId` (attribut data-lesson), puis
   détache — sans toucher au compteur d'id ni à la table `items`, qui persistent pour
   garder des ids uniques dans un document multi-bloc. Centralise le motif tag→rendu→
   détache partagé par les bilans et les fiches (#352) ; le try/finally garantit le
   détachement même si le rendu lève. */
export function withLessonId<T>(ctx: RenderContext, lessonId: string, render: () => T): T {
	ctx.lessonId = lessonId;
	try {
		return render();
	} finally {
		ctx.lessonId = null;
	}
}

/* Attributs des champs de réponse TEXTE (conjugaison, etc.) — issues #67/#123/#139.
   Sur tablette, la barre de suggestions prédictive des claviers (Gboard, Samsung,
   iOS…) ignore autocomplete/autocorrect/spellcheck et « souffle » la bonne forme.
   Parade : on rend le champ en `type="password"` (aucun clavier ne propose de
   suggestion sur un password), MAIS on le démasque en `type="text"` dès l'insertion
   via `data-unmask` (cf. `ui/anti-suggestion.ts`). Né password puis basculé en texte
   AVANT tout focus, Android le traite en « mot de passe visible » (textVisiblePassword) :
   le texte saisi reste lisible ET le clavier ne propose toujours pas de suggestions.
   (`-webkit-text-security: none` ne démasque PAS un vrai password — vérifié Chrome/FF.)
   N'affecte QUE le texte ; la saisie numérique du calcul garde `type` texte +
   `inputmode="numeric"`. La valeur saisie (`input.value`) demeure le texte tapé →
   correction (`checkItemAnswer`) inchangée. */
export const TEXT_ANSWER_INPUT_ATTRS =
	'type="password" data-unmask autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"';

/* Rendu PAPIER d'un QCM (#289) : la question, puis chaque choix précédé d'une case à
   cocher ☐. Le libellé est le texte échappé, ou la vue riche `choicesView` de confiance
   (fraction empilée, terminaison surlignée, image de symétrie), alignée par index. La
   consigne d'action « Coche… » est portée par la fiche / le bloc de bilan, pas répétée
   ici. Réservé à l'impression : à l'écran, le QCM est joué par son runner interactif. */
function qcmCheckboxHTML(it: Item, ctx: RenderContext): string {
	const answer = String(it.answer);
	const lis = (it.choices ?? [])
		.map((c, i) => {
			const view = it.choicesView?.[i];
			const label = view ? view.html : escapeHTML(c);
			const aria = view ? ` aria-label="${escapeHTML(view.label)}"` : '';
			// Corrigé (#41) : la case du bon choix est cochée ☑ et le libellé mis en gras
			// (le ✓ ET la graisse — deux indices, pas la couleur seule). `answer` est
			// toujours l'une des valeurs de `choices` (par construction du générateur).
			const correct = ctx.corrigeMode && c === answer;
			const liCls = correct ? 'qcm-print-choice qcm-print-choice--correct' : 'qcm-print-choice';
			const boxCls = correct ? 'qcm-print-box qcm-print-box--checked' : 'qcm-print-box';
			return `<li class="${liCls}"><span class="${boxCls}" aria-hidden="true"></span><span class="qcm-print-label"${aria}>${label}</span></li>`;
		})
		.join('');
	// Le `@` (emplacement de la réponse dans les QCM à trou : homophones, m/b/p…) ne doit
	// pas s'imprimer tel quel — incompris d'un enfant. On le rend par un rectangle vide
	// qui matérialise « le mot/la lettre va ici » (#41 suivi de #289).
	const question = enonceTexte(it.text).replace(
		'@',
		'<span class="cloze-box" aria-hidden="true"></span>',
	);
	return `${figureBlock(it.figure)}<p class="qcm-print-q">${question}</p><ul class="qcm-print-choices">${lis}</ul>`;
}

export function renderItem(it: Item, ctx: RenderContext, extra = '') {
	// Opération posée : déployée en grille de colonnes (plusieurs champs .ans).
	if (it.kind === 'posed' && it.posed) return posedGridHTML(it.posed, ctx);
	// QCM imprimable (#289) : un item porteur de `choices` (sa question n'a pas de `@`)
	// est rendu en cases à cocher, UNIQUEMENT en impression. À l'écran, ce chemin
	// (fiche/bilan interactif) laisse le QCM sans champ de saisie — limite préexistante,
	// hors périmètre #289 (le QCM interactif vit dans son propre runner, pas ici).
	if (ctx.printMode && estItemQcm(it)) return qcmCheckboxHTML(it, ctx);
	const id = nextInputId(ctx);
	ctx.items[id] = it;
	// Réponse exposée pour la révélation après correction (échappée pour les attributs).
	const ansAttr = escapeHTML(String(it.answer));
	// Intercalation (#446) : `data-answer` ne porte qu'UN exemple valide. On expose EN PLUS
	// la BANDE acceptée, déjà rédigée, pour que la révélation d'une erreur (marqueur ✗ de
	// `ui/session.ts`) annonce « un nombre entre 450 et 465 » au lieu d'un nombre isolé —
	// même formulation que le journal encadrant (source unique : `attendueItem`). `data-answer`
	// reste INTACT : c'est toujours la clé de correction de repli (scoring quand l'item n'est
	// plus en session) et le point d'appui des specs e2e. Attribut posé sur le seul champ
	// numérique : un item à intervalle est numérique par construction (réponse = un nombre),
	// et `checkItemAnswer` ne consulte l'intervalle que hors branche texte.
	const attendueAttr = it.intervalle ? ` data-attendue="${escapeHTML(attendueItem(it))}"` : '';
	// Saisie de l'heure (#88) : DEUX champs « [heures] h [minutes] », le « h » en dur.
	// Seul le champ des heures est `.ans` (noté) et porte la réponse canonique ; il
	// référence le champ des minutes (`data-min-field`) que session.verify fusionne en
	// « H h MM » avant correction → checkItemAnswer inchangé (comparaison texte).
	// Leurs aria-label restent « heures »/« minutes », DÉLIBÉRÉMENT (#577) : ici le nom
	// doit distinguer les deux champs l'un de l'autre, ce qu'il fait. Y préfixer l'énoncé
	// ne distinguerait rien d'une horloge à l'autre — l'énoncé est le même partout
	// (« Quelle heure est-il ? ») et ce qui change est DANS LE DESSIN. Rendre une horloge
	// SVG lisible à l'oreille est un autre sujet, qui ne se règle pas par un aria-label
	// de champ.
	if (it.kind === 'heure') {
		// Corrigé (#41) : l'heure complète révélée à la place des deux champs « h ».
		if (ctx.corrigeMode) {
			const rev = `<span class="ans-corrige">${escapeHTML(String(it.answer))}</span>`;
			return figureBlock(it.figure) + enonceTexte(it.text).replace('@', rev);
		}
		const mid = nextInputId(ctx);
		const group =
			`<span class="heure-input">` +
			`<input class="ans heure-h ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr(ctx)} data-min-field="${mid}" inputmode="numeric" autocomplete="off" maxlength="2" aria-label="heures">` +
			`<span class="heure-sep" aria-hidden="true">h</span>` +
			`<input class="heure-min" id="${mid}" inputmode="numeric" autocomplete="off" maxlength="2" aria-label="minutes">` +
			`</span><span class="mark" data-for="${id}"></span>`;
		return figureBlock(it.figure) + enonceTexte(it.text).replace('@', group);
	}
	const texte = enonceTexte(it.text);
	// Fraction à trou (#247) : un « @ » AU NUMÉRATEUR d'une fraction (« @/10 » / « @/100 »)
	// se rend EMPILÉ — homogène avec les fractions montrées de l'énoncé (déjà empilées par
	// `stackFractions`). À l'écran : un champ noté (`.ans` + `.frac-num-input`) DANS le
	// numérateur (réponse = UN chiffre, dixième/centième) + la marque ✓/✗ après la fraction.
	// À l'impression : une case vide `.cloze-box` (comme les QCM imprimés) — ou le chiffre
	// révélé en corrigé —, pour rester cohérent avec le terme voisin empilé. Seule la
	// décomposition décimale (#247) produit ce motif ; le trou de la partie entière
	// (« @ + … », sans « / ») passe par le champ générique ci-dessous.
	const fracTrou = texte.match(/@\/(\d+)/);
	if (fracTrou) {
		let numHTML: string;
		let markHTML = '';
		if (ctx.corrigeMode) {
			numHTML = `<span class="ans-corrige">${escapeHTML(String(it.answer))}</span>`;
		} else if (ctx.printMode) {
			numHTML = `<span class="cloze-box" aria-hidden="true"></span>`;
		} else {
			numHTML =
				`<input class="ans frac-num-input ${extra}" id="${id}" data-answer="${ansAttr}"` +
				`${lessonAttr(ctx)} inputmode="numeric" maxlength="1" autocomplete="off"${ariaChamp(it, 'chiffre manquant')}>`;
			markHTML = `<span class="mark" data-for="${id}"></span>`;
		}
		const fracHTML =
			`<span class="frac"><span class="frac-num">${numHTML}</span>` +
			`<span class="frac-den">${fracTrou[1]}</span></span>${markHTML}`;
		return figureBlock(it.figure) + texte.replace(/@\/\d+/, fracHTML);
	}
	// Corrigé (#41) : la réponse écrite sur la ligne, à la place du champ vide. Pas de
	// classe `.ans` (que l'impression rend transparente pour cacher la saisie) — on
	// utilise `.ans-corrige`, visible. Pas de `mark` (le corrigé n'est pas corrigé).
	// Champ « grand nombre » : une réponse numérique à ≥ 5 chiffres (encadrement au
	// million, « combien en tout », décomposition #240) déborde du champ standard (58px)
	// → variante `.ans-grand` plus large, à chiffres tabulaires.
	// `parseNombreFr` (et non `Number` brut) pour rester cohérent avec une réponse stockée en
	// virgule : « 12345,67 » → 12345.67 (et non NaN), donc correctement classé « grand ». Sans
	// effet sur les leçons actuelles (aucun décimal ≥ 10 000), mais évite un piège futur.
	const valeurNum = parseNombreFr(String(it.answer));
	const grand =
		it.kind !== 'text' && Number.isFinite(valeurNum) && Math.abs(valeurNum) >= 10000
			? ' ans-grand'
			: '';
	// Réponse = signe de comparaison (#380) : champ dédié `.ans-signe`, SANS clavier
	// virtuel (`inputmode="none"` — le pavé de boutons le remplace au doigt ; la frappe
	// au clavier PHYSIQUE reste possible, inputmode n'affecte pas le desktop). Pas
	// d'attributs anti-suggestion (#139) : rien à « souffler » pour un signe. Le pavé
	// est ajouté APRÈS l'énoncé (sa propre rangée), jamais à l'impression.
	const signe = it.kind === 'text' && estSigneComparaison(it.answer);
	// Réponse DÉCIMALE (virgule dans la valeur stockée, ex. « 4,56 » : conversions #248) →
	// clavier `decimal` (qui propose la virgule/point) plutôt que `numeric` (chiffres seuls,
	// pas de virgule sur mobile). N'affecte que les champs numériques dont la réponse a une
	// virgule ; les entiers gardent `numeric`.
	const inputMode = String(it.answer).includes(',') ? 'decimal' : 'numeric';
	// Corrigé imprimé d'une intercalation (#446) : « 457 ou tout nombre entre 450 et 465 ».
	// L'exemple seul faisait BARRER des réponses justes par l'adulte qui corrige sur papier,
	// alors que la fiche annonce « (plusieurs réponses possibles) ». Les autres corrigés (et
	// les autres branches corrigeMode : heure, fraction à trou) restent inchangés — seul un
	// item porteur d'un `intervalle` est concerné.
	const revelee = it.intervalle
		? corrigeIntercalation(it.answer, it.intervalle)
		: String(it.answer);
	const field = ctx.corrigeMode
		? `<span class="ans-corrige ${extra}">${escapeHTML(revelee)}</span>`
		: signe
			? `<input class="ans ans-signe ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr(ctx)} type="text" inputmode="none" autocomplete="off" spellcheck="false" maxlength="1"${ariaChamp(it, 'signe de comparaison')}><span class="mark" data-for="${id}"></span>`
			: it.kind === 'text'
				? `<input class="ans ans-text ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr(ctx)}${ariaChamp(it)} ${TEXT_ANSWER_INPUT_ATTRS}><span class="mark" data-for="${id}"></span>`
				: `<input class="ans${grand} ${extra}" id="${id}" data-answer="${ansAttr}"${attendueAttr}${lessonAttr(ctx)}${ariaChamp(it)} inputmode="${inputMode}" autocomplete="off"><span class="mark" data-for="${id}"></span>`;
	// Zone-réponse garantie à l'impression (#289) : un item sans `@` (ni posé, ni QCM)
	// ne doit jamais s'imprimer « en l'air » → on ajoute une ligne d'écriture finale.
	const place = texte.includes('@') ? texte : ctx.printMode ? `${texte} @` : texte;
	const pave = signe && !ctx.printMode && !ctx.corrigeMode ? paveSignesHTML(id) : '';
	return figureBlock(it.figure) + place.replace('@', field) + pave;
}
export function gridHTML(items: Item[], cols: number, ctx: RenderContext) {
	const cls = cols === 3 ? 'c3' : 'c4';
	return `<div class="grid ${cls}">${items.map((it) => `<div class="op">${renderItem(it, ctx)}</div>`).join('')}</div>`;
}

/* ---------- Disposition d'une opération posée (#97, extraite en #490) ----------
   La grille posée se rend maintenant à DEUX endroits : jouable ici (champs `.ans`
   corrigés cellule par cellule) et en DÉMONSTRATION dans le panneau d'étayage
   (cellules figées, remplies une colonne à la fois pendant qu'on explique la méthode).
   L'alignement des chiffres devant être RIGOUREUSEMENT le même des deux côtés — un
   enfant en difficulté ne doit pas avoir à réapprendre un format visuel en plus de la
   méthode —, la disposition est calculée une seule fois ici, et rendue deux fois. */

/** Une cellule de la grille posée, décrite par son rôle (pas par son HTML). */
export type CellulePosee =
	| { role: 'vide' }
	| { role: 'signe'; texte: string }
	/** Chiffre DONNÉ d'un opérande. */
	| { role: 'chiffre'; chiffre: string }
	/** Case de retenue : aide visible, jamais notée. */
	| { role: 'retenue' }
	/** Le 0 FOURNI du 2ᵉ produit partiel (porte le décalage, #154). */
	| { role: 'zeroDecalage' }
	/** Chiffre à TROUVER. `resultat` marque les cellules du résultat final (#391) et
	    donne le rang du chiffre ; absent = cellule d'un produit partiel. */
	| { role: 'saisie'; chiffre: string; resultat?: { pos: number } };

/** Une rangée de la grille : la colonne du signe puis `colonnes` cellules alignées à
    droite. `barre` = trait horizontal de l'opération (pas de cellules). */
export interface RangeePosee {
	barre?: boolean;
	cellules: CellulePosee[];
}

export interface DispositionPosee {
	/** Nombre de colonnes de CHIFFRES (la colonne du signe est en plus, à gauche). */
	colonnes: number;
	rangees: RangeePosee[];
	/** L'opération, lisible (« 347 + 285 ») — la grille n'a pas d'énoncé. */
	operation: string;
	resultat: number;
}

/** Disposition d'une opération posée : rangées et cellules, sans une ligne de HTML.
    Multiplicateur à 2 chiffres → deux produits partiels puis leur addition. */
export function dispositionPosee(spec: PosedSpec): DispositionPosee {
	const { op, a, b } = spec;
	const resultat = op === '+' ? a + b : op === '-' ? a - b : a * b;
	const signe = op === '+' ? '+' : op === '-' ? '−' : '×';
	const digits = (n: number) => String(n).split('');
	const chiffres = (n: number): CellulePosee[] =>
		digits(n).map((chiffre) => ({ role: 'chiffre', chiffre }));
	const colonnes =
		op === 'x' && b >= 10
			? digits(resultat).length
			: Math.max(digits(a).length, digits(b).length, digits(resultat).length);

	// Une rangée = signe (ou vide) + C cellules alignées à DROITE.
	const rangee = (cellules: CellulePosee[], signeCell?: CellulePosee): RangeePosee => {
		const slots: CellulePosee[] = Array.from({ length: colonnes }, () => ({ role: 'vide' }));
		const start = colonnes - cellules.length;
		for (let i = 0; i < cellules.length; i++) slots[start + i] = cellules[i];
		return { cellules: [signeCell ?? { role: 'vide' }, ...slots] };
	};
	const retenues = (): RangeePosee =>
		rangee(Array.from({ length: colonnes }, () => ({ role: 'retenue' })));
	const barre = (): RangeePosee => ({ barre: true, cellules: [] });
	const resultatCells = (): CellulePosee[] =>
		digits(resultat).map((chiffre, pos) => ({ role: 'saisie', chiffre, resultat: { pos } }));

	const rangees: RangeePosee[] = [];
	if (op === 'x' && b >= 10) {
		// Multiplication à 2 chiffres : deux produits partiels + addition finale.
		// Retenues des produits partiels « dans la tête » (multiplicateurs doux, cf.
		// posee.ts) ; SEULE l'addition finale, qui est une vraie addition à retenues,
		// reçoit une rangée d'aide (#154, avis pédagogique). Cette rangée est posée
		// AU-DESSUS des produits partiels — les opérandes de cette addition —, conforme
		// à la convention « retenues au-dessus des nombres qu'on additionne » ; un
		// marqueur « + » devant le 2ᵉ produit partiel signale l'addition (#300/#307).
		const pp1 = a * (b % 10);
		const pp2 = a * Math.floor(b / 10);
		rangees.push(rangee(chiffres(a)));
		rangees.push(rangee(chiffres(b), { role: 'signe', texte: signe }));
		rangees.push(barre());
		rangees.push(retenues());
		// Produits partiels : cellules à trouver mais NON taguées (#391) — seul le résultat
		// final est agrégé en erreur (« dont le résultat est faux »).
		rangees.push(rangee(digits(pp1).map((chiffre) => ({ role: 'saisie', chiffre }))));
		// 2ᵉ produit partiel suivi de son 0 fourni (× dizaines) : le décalage est porté par
		// ce 0, donc la ligne s'aligne sur la somme sans décalage spatial. Le « + » marque
		// l'addition des deux produits partiels.
		rangees.push(
			rangee(
				[
					...digits(pp2).map((chiffre): CellulePosee => ({ role: 'saisie', chiffre })),
					{ role: 'zeroDecalage' },
				],
				{ role: 'signe', texte: '+' },
			),
		);
		rangees.push(barre());
		rangees.push(rangee(resultatCells()));
	} else {
		// Addition, soustraction, multiplication ×1 chiffre.
		rangees.push(retenues()); // retenues (aide)
		rangees.push(rangee(chiffres(a)));
		rangees.push(rangee(chiffres(b), { role: 'signe', texte: signe }));
		rangees.push(barre());
		rangees.push(rangee(resultatCells()));
	}
	return { colonnes, rangees, operation: `${a} ${signe} ${b}`, resultat };
}

/** Enveloppe de la grille posée : la grille CSS de C+1 colonnes (1 pour le signe + C
    colonnes de chiffres). Partagée par la grille jouable et par la démonstration du
    panneau d'étayage, pour que les deux aient la MÊME largeur de colonne.
    `spec` : les opérandes exposés en `data-*` sur la grille JOUABLE (#490). L'étayage
    d'une erreur doit dérouler L'OPÉRATION QUE L'ENFANT VIENT DE RATER, et la fiche ne
    garde en mémoire que les cellules, pas leur grille — les retrouver par le DOM évite
    d'alourdir chaque cellule d'une copie de l'opération. */
export function poseeGrilleHTML(
	disposition: DispositionPosee,
	cellules: string,
	classe = '',
	spec?: PosedSpec,
): string {
	// `data-pose-*` et non `data-posee-*` : ce dernier contiendrait la sous-chaîne
	// « posee-op », qui sert de repère de comptage des opérateurs dans les tests.
	const data = spec
		? ` data-pose-op="${spec.op}" data-pose-a="${spec.a}" data-pose-b="${spec.b}"`
		: '';
	return `<div class="posee${classe ? ' ' + classe : ''}"${data} style="grid-template-columns: repeat(${disposition.colonnes + 1}, var(--posee-col, 2.1rem))">${cellules}</div>`;
}

/* Grille d'une opération posée (#97) : les chiffres du résultat (et des produits
   partiels en ×2 chiffres) sont des champs `.ans` NOTÉS un par un ; la rangée de
   retenues `.ans-free` (non notée) sert d'aide visible. verify() corrige chaque cellule
   via son data-answer ; un sans-faute = toutes les cellules justes. */
function posedGridHTML(spec: PosedSpec, ctx: RenderContext): string {
	const disposition = dispositionPosee(spec);
	// Journal d'erreurs (#391) : descripteur partagé par les cellules-chiffres du RÉSULTAT
	// (agrégées en UNE entrée par opération dans session.verify, cf. erreur-representation).
	// `groupe` = id unique de la grille dans le contexte (compteur figé AVANT tout champ,
	// donc stable pour la reprise) ; `pos` = rang du chiffre dans le résultat.
	const groupe = 'posee-' + ctx.counter;
	const operation = disposition.operation;
	const attendue = String(disposition.resultat);

	const celluleHTML = (c: CellulePosee): string => {
		switch (c.role) {
			case 'vide':
				return `<span class="posee-cell"></span>`;
			case 'signe':
				return `<span class="posee-cell posee-op">${c.texte}</span>`;
			case 'chiffre':
				return `<span class="posee-cell posee-digit">${c.chiffre}</span>`;
			// Zéro FOURNI (grisé, non saisi) du 2ᵉ produit partiel : on multiplie par les
			// dizaines, donc le produit se termine par 0 — ce 0 explique le décalage et
			// réaligne la ligne sous la somme (#154, avis pedagogue-primaire).
			case 'zeroDecalage':
				return `<span class="posee-cell posee-digit posee-zero" aria-label="zéro du décalage">0</span>`;
			case 'retenue':
				return `<input class="ans-free posee-cell posee-carry" maxlength="1" inputmode="numeric" autocomplete="off" aria-label="retenue">`;
			case 'saisie': {
				// Corrigé (#41) : le chiffre du résultat révélé dans la cellule (au lieu du champ).
				if (ctx.corrigeMode)
					return `<span class="posee-cell posee-input posee-corrige">${c.chiffre}</span>`;
				const id = nextInputId(ctx);
				const item: Item = { text: '', answer: Number(c.chiffre), kind: 'num' };
				// Seules les cellules du RÉSULTAT sont taguées pour le journal (#391).
				if (c.resultat) item.posedResult = { groupe, operation, attendue, pos: c.resultat.pos };
				ctx.items[id] = item;
				return `<input class="ans posee-cell posee-input" id="${id}" data-answer="${c.chiffre}"${lessonAttr(ctx)} maxlength="1" inputmode="numeric" autocomplete="off" aria-label="chiffre du résultat">`;
			}
		}
	};
	const cellules = disposition.rangees
		.map((r) =>
			r.barre
				? `<span class="posee-rule" style="grid-column: 1 / ${disposition.colonnes + 2}"></span>`
				: r.cellules.map(celluleHTML).join(''),
		)
		.join('');
	return poseeGrilleHTML(disposition, cellules, '', spec);
}
/* L'en-tête de fiche : le champ "Temps : ___ min" est print-only */
export function ficheHTML(
	num: number,
	titre: string,
	sous: string,
	consigne: string,
	inner: string,
) {
	return `<div class="fiche">
    <div class="fiche-head">
      <p class="fiche-title">MENTAL ${num} — ${titre}</p>
      <span class="temps print-only">Temps : ______ min</span>
    </div>
    <p class="fiche-sub">${sous}</p>
    <p class="consigne-line"${ttsAttr(consigne)}>${consigne}</p>
    ${inner}
  </div>`;
}
/* En-tête de fiche générique (sans préfixe « MENTAL ») pour les matières
   autres que le calcul mental. */
export function ficheHTMLGeneric(titre: string, sous: string, consigne: string, inner: string) {
	return `<div class="fiche">
    <div class="fiche-head">
      <p class="fiche-title">${titre}</p>
      <span class="temps print-only">Temps : ______ min</span>
    </div>
    ${sous ? `<p class="fiche-sub">${sous}</p>` : ''}
    <p class="consigne-line"${ttsAttr(consigne)}>${consigne}</p>
    ${inner}
  </div>`;
}
