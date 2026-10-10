/* ============================================================
   Déroulé d'une session : vérification, saisie clavier, impression
   ============================================================ */
import { fmt } from '../core/utils';
import { icon } from './icon';
import { focaliserChamp } from './anti-suggestion';
import { scoreItems } from '../core/scoring';
import type { ItemStatus, ScoredInput } from '../core/scoring';
import type { Trophy } from '../core/rewards';
import { buildPrintableDOM } from '../core/lessons';
import type { PrintScope } from '../core/lessons';
import { streakSuffix } from '../core/progress';
import { recordLessonRun } from '../core/lesson-run';
import type { LessonRunOutcome } from '../core/lesson-run';
import type { Recompense } from '../core/unlocks';
import { itemEstNumerique } from '../core/items';
import type { Item } from '../core/items';
import { formatReponseRevelee, saisieEstNombre } from '../core/nombres';
import { stopChrono } from './chrono';
import { finishResume } from './resume';
import { announceRewards } from './effects';
import { recapHTML, notionsDepuisPerLesson } from './recap-seance';
import { mascotteBulleHTML, encouragementMascotte } from './unlocks-view';
import {
	getCurrentMode,
	getCurrentLessonId,
	getCurrentFavoriId,
	getSessionRecorded,
	setSessionRecorded,
	getSessionErreursLoggees,
	setSessionErreursLoggees,
	setLastErrors,
	getLastErrors,
	startRevision,
	runLecon,
	goHome,
	goCategorie,
	getRenderCtx,
} from './navigation';
import { getLessonById } from '../core/catalog';
import { retourFinActivite, type RetourCible } from './retour-activite';
import { capterErreur } from './erreur-capture';
import { poserLiensEtayagePosee } from './etayage-panneau';
import {
	analyserResultatPosee,
	attendueLisibleItem,
	saisieLisibleItem,
	type CellulePosee,
} from '../core/erreur-representation';
import { html, brut, VIDE, type SafeHtml } from '../core/html';
import { enNombre, libelleRegleRomaine, regleEnfreinte } from '../core/chiffres-romains';
import { MODE_PARTAGE } from '../core/partage/passage';

/* Règle enfreinte par une écriture romaine fausse (#717, critère 5). Révéler la bonne
   écriture ne suffit pas : l'enfant qui a écrit `XXXXIIII` lit « → XLIV » sans savoir
   POURQUOI sa forme ne va pas, et la réécrira. On nomme donc la règle.

   Piloté par la DONNÉE de l'item (`saisieRomaine`), pas par l'identifiant de leçon : la
   fiche corrige toutes les matières, elle n'a pas à connaître le catalogue. Rien ne
   s'affiche pour les autres items ni pour un champ laissé vide (`regleEnfreinte` rend
   `undefined`) — on ne fait pas la leçon à qui n'a pas répondu. */
function regleRomaineHTML(item: Item | undefined, saisie: string): SafeHtml {
	if (!item?.saisieRomaine) return VIDE;
	const cible = enNombre(String(item.answer));
	if (cible === undefined) return VIDE;
	const regle = regleEnfreinte(saisie, cible);
	return regle ? html`<span class="regle-romaine">${libelleRegleRomaine(regle)}</span>` : VIDE;
}

/* Annonce du VERDICT au lecteur d'écran (relecture a11y #717).

   Jusqu'ici, valider une fiche ne produisait aucune annonce : ni juste/faux, ni score, ni
   réponse révélée. Les ✓/✗ et le bandeau de résultat sont posés dans le DOM sans
   `aria-live`, donc un enfant au lecteur d'écran validait et n'entendait rien. Le bon
   patron existait pourtant vingt lignes plus bas (`signalerSaisiesIllisibles`), raisonné en
   détail ; il n'avait simplement jamais été appliqué au verdict lui-même.

   UNE synthèse, pas un verdict par champ : une fiche porte jusqu'à vingt réponses, et
   vingt annonces à la suite seraient pires que le silence — l'enfant décrocherait avant la
   troisième. Le détail reste atteignable en revenant sur chaque champ, que `aria-invalid`
   décrit désormais.

   `role="status"` et non `alert` : le verdict est attendu, l'enfant vient de le demander.
   Une alerte interromprait la lecture en cours pour annoncer ce qu'on attendait déjà.
   La région est créée VIDE puis remplie au tour suivant : une région vivante insérée
   déjà pleine n'est pas annoncée de façon fiable, c'est le changement qui l'est. */
const ID_VERDICT_SR = 'verdictAnnonce';

/* Délai de référence du dépôt pour le patron « région vivante créée puis remplie »
   (`selecteur-lecon.ts`, `encadrant-banque.ts`). On garde le même chiffre plutôt que d'en
   inventer un troisième : aucun des trois n'est issu d'une mesure sur un moteur vocal
   réel, donc la cohérence est le seul argument disponible. */
const DELAI_ANNONCE = 350;

/* Annonce du VERDICT au lecteur d'écran (relecture a11y #717).

   Jusqu'ici, valider une fiche ne produisait aucune annonce : ni juste/faux, ni score, ni
   réponse révélée. Les ✓/✗ et le bandeau de résultat sont posés dans le DOM sans
   `aria-live`, donc un enfant au lecteur d'écran validait et n'entendait rien. Le bon
   patron existait pourtant vingt lignes plus bas (`signalerSaisiesIllisibles`), raisonné en
   détail ; il n'avait simplement jamais été appliqué au verdict lui-même.

   UNE synthèse, pas un verdict par champ : une fiche porte jusqu'à vingt réponses, et
   vingt annonces à la suite seraient pires que le silence. Le détail reste atteignable en
   revenant sur chaque champ (`aria-invalid`, et `aria-describedby` vers la réponse révélée).

   Ce qu'elle dit, et pourquoi chaque morceau y est :
   - le score, mais `total` ne compte QUE les réponses données (`core/scoring.ts`). « 5 bonnes
     réponses sur 5 » quand cinq champs sont restés vides s'entendrait comme un sans-faute :
     les vides sont donc dits à part, comme le bandeau visuel le fait déjà ;
   - l'avertissement des 60 %, sans quoi un enfant sous le seuil entend son score sans
     apprendre qu'il ne compte pas — le voyant, lui, voit le pictogramme.
   REJET ÉCRIT : le pourcentage, le temps et la série restent HORS de la synthèse. C'est de
   l'habillage, pas une information qui change ce que l'enfant doit faire ensuite, et une
   phrase parlée se paie à l'écoute. Ne pas les y ajouter « pour être complet ».

   `role="status"` et non `alert` : le verdict est attendu, l'enfant vient de le demander.
   Une alerte interromprait la lecture en cours pour annoncer ce qu'on attendait déjà. */
function annoncerVerdict(
	ok: number,
	total: number,
	vides: number,
	avecErreurs: boolean,
	notEnough: boolean,
): void {
	let region = document.getElementById(ID_VERDICT_SR);
	if (!region) {
		region = document.createElement('p');
		region.id = ID_VERDICT_SR;
		region.className = 'sr-only';
		region.setAttribute('role', 'status');
		region.setAttribute('aria-live', 'polite');
		region.setAttribute('aria-atomic', 'true');
		// Enfant DIRECT de <body>, et marquée pour échapper à l'inertage des modales
		// (`ui/modal-a11y.ts`). Dans `#sheets`, elle était rendue muette dès qu'une modale de
		// récompense s'ouvrait — c'est-à-dire précisément quand l'enfant venait de tout
		// réussir. Retarder la modale a été essayé et rejeté : pendant le sursis, un lien de
		// la fiche restait cliquable et la modale surgissait par-dessus.
		region.setAttribute('data-annonce-persistante', '');
		document.body.appendChild(region);
	}
	const cible = region;
	const s = (n: number) => (n > 1 ? 's' : '');
	const phrase =
		(total > 0
			? `${ok} bonne${s(ok)} réponse${s(ok)} sur ${total}.`
			: "Aucune réponse n'a été donnée.") +
		(vides > 0 ? ` Il reste ${vides} réponse${s(vides)} vide${s(vides)}.` : '') +
		(avecErreurs ? ' Les réponses attendues sont affichées à côté des réponses fausses.' : '') +
		(notEnough ? ' Cet essai ne compte pas : il faut répondre à au moins 60 % des calculs.' : '');
	// Vidée d'abord : deux fiches de suite au même score produiraient sinon un texte
	// identique, et un contenu inchangé n'est pas re-annoncé.
	cible.textContent = '';
	setTimeout(() => {
		cible.textContent = phrase;
	}, DELAI_ANNONCE);
}

/* Saisie illisible : une réponse qui n'est pas un nombre là où un nombre est attendu
   (« 3- ») n'est pas une MAUVAISE réponse, c'est une erreur de FORMAT. Un champ VIDE
   n'en est pas une — ne pas répondre reste permis. Partagé avec la séance partagée
   (#734), qui doit refuser la même saisie au même endroit (critère 11). */
export function champsIllisibles(
	inputs: Iterable<HTMLInputElement>,
	items: Record<string, Item>,
): HTMLInputElement[] {
	return [...inputs].filter((inp) => {
		const item = items[inp.id];
		// Le champ caché d'un QCM porte la valeur d'un CHOIX, jamais une saisie : rien à
		// signaler à l'enfant, qui n'a rien tapé.
		if (inp.type === 'hidden') return false;
		return (
			!!item && itemEstNumerique(item) && inp.value.trim() !== '' && !saisieEstNombre(inp.value)
		);
	});
}

/* Lecture DOM → descripteurs purs (#349). Saisie de l'heure (#88) : on FUSIONNE les 2
   champs en « H h MM » (minutes sur 2 chiffres) AVANT correction → champ heures vide =
   non répondu ; minutes vide = « 00 » (heure pile). checkItemAnswer reste inchangé (la
   fusion produit sa forme canonique texte). */
export function lireSaisies(
	inputs: Iterable<HTMLInputElement>,
	items: Record<string, Item>,
): ScoredInput[] {
	const scored: ScoredInput[] = [];
	for (const inp of inputs) {
		let saisie = inp.value.trim();
		const minFieldId = inp.dataset.minField;
		if (minFieldId) {
			const minInp = document.getElementById(minFieldId) as HTMLInputElement | null;
			const hv = inp.value.trim();
			const mv = (minInp?.value ?? '').trim();
			saisie = hv === '' ? '' : `${hv} h ${(mv || '0').padStart(2, '0')}`;
		}
		scored.push({
			id: inp.id,
			item: items[inp.id] ?? null,
			saisie,
			answer: inp.dataset.answer,
			lesson: inp.dataset.lesson ?? null,
		});
	}
	return scored;
}

/* ---------- Vérification (arrête le chrono) ---------- */
export function verify() {
	// Séance partagée (#734) : terminer FIGE le premier passage, ce qu'aucune touche ne
	// doit faire par mégarde. Entrée sur le dernier champ mène donc au bouton « J'ai
	// fini », que l'enfant appuie lui-même.
	if (getCurrentMode() === MODE_PARTAGE) {
		document.getElementById('partageFini')?.focus();
		return;
	}
	const inputs = document.querySelectorAll<HTMLInputElement>('#sheets input.ans');
	const sessionItems = getRenderCtx().items;
	// On bloque la vérification AVANT d'arrêter le chrono et de corriger quoi que ce soit,
	// et on renvoie l'enfant au champ concerné : rien n'est compté, rien n'est journalisé,
	// aucune étoile ni aucun record ne se joue (cf. `champsIllisibles`).
	const aCorriger = champsIllisibles(inputs, sessionItems);
	if (aCorriger.length) {
		signalerSaisiesIllisibles(aCorriger);
		return;
	}
	const ms = stopChrono();
	const currentMode = getCurrentMode();
	const currentLessonId = getCurrentLessonId();
	const scored = lireSaisies(inputs, sessionItems);
	// Calcul du score (logique pure, testée sans DOM — cf. core/scoring.ts).
	const { ok, total, vides, errors, perLesson, statuses } = scoreItems(scored);
	marquerChamps(inputs, statuses, sessionItems);
	setLastErrors(errors);
	// Étayage de la notion (#490) : à côté de chaque grille posée ratée, l'offre d'expliquer
	// LE calcul qui vient d'être raté. Proposé, jamais imposé ni automatique — un affichage
	// systématique s'apprendrait à ignorer par réflexe. Sans contenu pour la leçon, rien ne
	// s'affiche (dégradation propre).
	poserLiensEtayagePosee(document.getElementById('sheets')!, currentLessonId);
	// L'exercice est vérifié (corrections révélées) : la reprise n'a plus lieu d'être (#63).
	finishResume();
	const lastErrors = getLastErrors();
	// Un exercice ne « compte » que si au moins 60 % des calculs ont une réponse.
	const recordable = currentMode && currentMode !== 'revision';
	const enough = inputs.length > 0 && total >= inputs.length * 0.6;
	const notEnough = recordable && !enough && !getSessionRecorded();
	// Après `notEnough` : la synthèse parlée doit pouvoir le dire (cf. `annoncerVerdict`).
	annoncerVerdict(ok, total, vides, errors.length > 0, !!notEnough);
	// Enregistrement de l'essai (une seule fois par session)
	// → bilan complet/express : enregistré (régularité, trophées) mais non classé
	// → leçon seule : étoile si sans-faute
	let starInfo: LessonRunOutcome['starInfo'] = null,
		streakDays = 0,
		goalRes: LessonRunOutcome['goalRes'] = null,
		niveauGagne = 0, // > 0 si on vient d'atteindre un nouveau niveau
		recompensesNiv: Recompense[] = [], // déblocages du(des) palier(s) franchi(s)
		newTrophies: Trophy[] = [];
	const celeb: { icon: string; text: string }[] = []; // récompenses à annoncer dans la modale
	if (recordable && enough && !getSessionRecorded()) {
		setSessionRecorded(true);
		// Enregistrement centralisé (parité avec les autres modes de rendu, cf. #69).
		const out = recordLessonRun({
			mode: currentMode,
			lessonId: currentLessonId,
			ok,
			questionCount: inputs.length,
			ms,
			perLesson,
			favoriId: getCurrentFavoriId() ?? undefined,
		});
		starInfo = out.starInfo;
		streakDays = out.streakDays;
		goalRes = out.goalRes;
		niveauGagne = out.niveauGagne;
		recompensesNiv = out.recompensesNiv;
		newTrophies = out.newTrophies;
		celeb.push(...out.celeb);
	}

	// Journal des erreurs (#391) : les réponses FAUSSES de cet essai, pour l'espace
	// encadrant. DÉTACHÉ du seuil de 60 % (`enough`) : une fiche à peine remplie est
	// justement là où l'enfant décroche → la donnée la plus utile au parent. Garde
	// dédiée « une fois par essai » (sessionErreursLoggees), indépendante de
	// l'enregistrement. Exclut le mode 'revision' (recordable). capterErreur ignore les
	// champs vides (non répondus) et sans énoncé lisible.
	// La garde n'est consommée QUE s'il y a au moins une réponse fausse à journaliser :
	// une 1re validation vide/sans faute (ex. avertissement « 60 % ») ne doit pas « griller »
	// la journalisation d'une validation ultérieure du même essai (child qui complète ensuite).
	const aDesErreurs = Object.values(statuses).some((st) => st === 'wrong');
	if (recordable && aDesErreurs && !getSessionErreursLoggees()) {
		setSessionErreursLoggees(true);
		// Champs simples : une entrée par réponse fausse. Les cellules d'opération posée
		// (posedResult) sont exclues ici et agrégées ci-dessous (une entrée par opération).
		scored.forEach((s) => {
			if (statuses[s.id] !== 'wrong' || s.item?.posedResult) return;
			capterErreur({
				text: s.item?.text ?? '',
				figure: s.item?.figure,
				// Le LIBELLÉ d'un choix de QCM, pas sa valeur interne (« trois quarts », pas « 3/4 »).
				donnee: s.item ? saisieLisibleItem(s.item, s.saisie) : s.saisie,
				// Intercalation (#446) : la BANDE acceptée (« un nombre entre 450 et 465 »), pas
				// l'exemple révélé — sinon le parent lit une réponse unique là où douze valeurs
				// passaient, et croit son enfant plus loin du but qu'il ne l'est (cf. attendueItem).
				attendue: s.item ? attendueLisibleItem(s.item) : (s.answer ?? ''),
				lessonId: s.lesson ?? currentLessonId,
				mode: currentMode!,
			});
		});
		// Opérations posées (#391) : on agrège les cellules-chiffres d'une même grille
		// (`groupe`) en UNE entrée « a op b » dont le résultat est faux — jamais une par
		// chiffre (illisible pour le parent). L'agrégation de forme est pure (testée).
		const posees = new Map<
			string,
			{ operation: string; attendue: string; lessonId: string | null; cells: CellulePosee[] }
		>();
		scored.forEach((s) => {
			const pr = s.item?.posedResult;
			if (!pr) return;
			let g = posees.get(pr.groupe);
			if (!g) {
				g = {
					operation: pr.operation,
					attendue: pr.attendue,
					lessonId: s.lesson ?? currentLessonId,
					cells: [],
				};
				posees.set(pr.groupe, g);
			}
			g.cells.push({ pos: pr.pos, saisie: s.saisie, correct: statuses[s.id] === 'correct' });
		});
		posees.forEach((g) => {
			const res = analyserResultatPosee(g.cells);
			if (!res.journaliser) return;
			capterErreur({
				text: g.operation,
				donnee: res.donnee,
				attendue: g.attendue,
				lessonId: g.lessonId,
				mode: currentMode!,
			});
		});
	}

	// Bandeau résultat en tête de la zone
	const old = document.getElementById('resultBanner');
	if (old) old.remove();
	// Le verdict est posé : l'astuce « tu peux laisser la réponse vide » (#467) n'a plus
	// d'objet, et elle contredirait l'avertissement des 60 % qui renvoie justement remplir.
	document.getElementById(ASTUCE_VIDE)?.remove();
	const banner = document.createElement('div');
	banner.className = 'result-banner screen-only';
	banner.id = 'resultBanner';
	const note = total > 0 ? Math.round((ok / total) * 100) : 0;
	// La mascotte félicite l'effort (hors chrono, jamais de réaction négative).
	let banniere = html`${mascotteBulleHTML(encouragementMascotte())}<span class="rb-big">${ok}/${total}</span>
    <span class="rb-sub">bonnes réponses (${note}%)${vides > 0 ? ` · ${vides} non remplie${vides > 1 ? 's' : ''}` : ''}<br>
    Temps : <strong>${fmt(ms)}</strong></span>`;
	if (notEnough) {
		banniere = html`${banniere}<div class="rb-warn">⚠️ Réponds à au moins 60 % des calculs pour valider ton temps et gagner des récompenses.</div>`;
	}
	if (starInfo) {
		if (starInfo.perfect) {
			banniere = html`${banniere}<div class="rb-medal"><span class="rb-medal-ico">⭐</span><span class="rb-medal-txt">${starInfo.newStar ? 'Étoile gagnée !' : 'Encore sans faute !'}</span></div>`;
		}
		let msg = starInfo.perfect
			? `Leçon réussie sans faute${starInfo.count > 1 ? ` (${starInfo.count}×)` : ''}. Bravo !`
			: `Il faut un sans-faute pour décrocher l'étoile de cette leçon. Réessaie ⭐`;
		msg += streakSuffix(streakDays);
		banniere = html`${banniere}<div class="rb-rank">${msg}</div>`;
	}
	if (newTrophies.length) {
		const libelle = newTrophies.length > 1 ? 'Nouveaux trophées' : 'Nouveau trophée';
		banniere = html`${banniere}<div class="rb-trophies">🏆 ${libelle} : ${newTrophies.map((t) => `${t.icon} ${t.title}`).join(' · ')} !</div>`;
	}
	if (goalRes) {
		if (goalRes.justDone)
			banniere = html`${banniere}<div class="rb-goal">🎯 Objectif du jour réussi : ${goalRes.goal.label}</div>`;
		else if (!goalRes.goal.done)
			banniere = html`${banniere}<div class="rb-goal">🎯 Objectif du jour : ${goalRes.goal.label} (${goalRes.goal.progress}/${goalRes.goal.target})</div>`;
	}
	// Récap éphémère de fin de séance (#537) : un bilan a traversé PLUSIEURS leçons, et
	// l'enfant n'en repart qu'avec un pourcentage. On nomme donc ce qu'il vient de
	// travailler, sous les récompenses (critère 7) et au-dessus des actions. Réservé aux
	// bilans : une leçon seule nomme déjà la notion que l'enfant a sous les yeux, et
	// l'étoile est son retour (critère 10). Construit depuis `perLesson`, en mémoire —
	// aucune lecture de stockage.
	if (currentMode === 'express' || currentMode === 'complet') {
		banniere = html`${banniere}${recapHTML(notionsDepuisPerLesson(perLesson), 'rb-recap')}`;
	}
	if (lastErrors.length) {
		banniere = html`${banniere}<button class="rb-redo" id="btnRedo">↻ Réviser mes erreurs (${lastErrors.length})</button>`;
	}
	// Fin de leçon : recommencer un tour (s'entraîner encore) ou quitter (#69).
	// Le retour ramène d'où l'on vient (#461) : le programme du jour si la leçon en a
	// été lancée, sinon sa catégorie.
	let retour: RetourCible | null = null;
	if (currentMode === 'lecon' && currentLessonId) {
		banniere = html`${banniere}<button class="rb-redo" id="btnRecommencer">↻ Recommencer</button>`;
		const cat = getLessonById(currentLessonId)?.category;
		if (cat) {
			retour = retourFinActivite({
				label: 'Retour à la catégorie',
				aller: () => goCategorie(cat),
			});
			banniere = html`${banniere}<button class="backlink-top" id="btnBackCategorie">← ${retour.label}</button>`;
		}
		banniere = html`${banniere}<button class="rb-quit" id="btnQuitter">${icon('house')} Quitter</button>`;
	}
	banner.innerHTML = banniere.balisage;
	const redo = banner.querySelector('#btnRedo');
	if (redo) redo.addEventListener('click', startRevision);
	const recommencer = banner.querySelector('#btnRecommencer');
	if (recommencer)
		recommencer.addEventListener('click', () => {
			banner.remove(); // le bandeau est frère de #sheets : runLecon ne l'efface pas
			runLecon(currentLessonId!);
		});
	const backCat = banner.querySelector('#btnBackCategorie');
	if (backCat && retour) backCat.addEventListener('click', retour.aller);
	const quitter = banner.querySelector('#btnQuitter');
	if (quitter) quitter.addEventListener('click', goHome);
	const sheets = document.getElementById('sheets')!;
	sheets.parentNode!.insertBefore(banner, sheets);
	// Récompenses : modale explicite (+ confettis) pour qu'on sache ce qu'on a gagné.
	// Le passage de niveau a sa modale dédiée ; s'il y a aussi d'autres récompenses,
	// on les enchaîne à la fermeture de la modale de niveau.
	announceRewards(niveauGagne, recompensesNiv, celeb);
	// petit rappel dans la barre
	const sc = document.getElementById('score')!;
	sc.classList.remove('hidden');
	sc.textContent = total > 0 ? `${ok}/${total} · ${fmt(ms)}` : `Aucune réponse · ${fmt(ms)}`;
	const firstWrong = document.querySelector<HTMLInputElement>('#sheets input.ans.wrong');
	// Le champ d'un QCM de fiche est CACHÉ, sans boîte : y défiler ne ferait rien. On vise
	// son groupe de choix, ce que l'enfant voit.
	const cible =
		firstWrong?.type === 'hidden' ? (groupeDeChoix(firstWrong) ?? firstWrong) : firstWrong;
	if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'center' });
	else window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Marquage DOM selon les verdicts : on efface l'ancien marquage puis on pose ✓ / ✗ (avec
   révélation de la bonne réponse à côté de l'erreur) ; un champ laissé vide reste neutre.
   Partagé avec la séance partagée (#734) : la correction s'y lit exactement comme ici. */
export function marquerChamps(
	inputs: Iterable<HTMLInputElement>,
	statuses: Record<string, ItemStatus>,
	sessionItems: Record<string, Item>,
): void {
	for (const inp of inputs) {
		const mark = document.querySelector<HTMLElement>(`.mark[data-for="${inp.id}"]`);
		inp.classList.remove('correct', 'wrong');
		if (mark) {
			mark.className = 'mark';
			mark.textContent = '';
		}
		if (inp.type === 'hidden') groupeDeChoix(inp)?.removeAttribute('aria-describedby');
		const status = statuses[inp.id];
		// Validité exposée aux technologies d'assistance : le ✓/✗ est une marque VISUELLE,
		// elle ne dit rien à un lecteur d'écran. C'est ce qui rend le détail atteignable
		// champ par champ, une fois la synthèse annoncée (relecture a11y #717).
		if (status === 'correct' || status === 'wrong') {
			inp.setAttribute('aria-invalid', String(status === 'wrong'));
		} else {
			inp.removeAttribute('aria-invalid');
		}
		if (status === 'correct') {
			inp.classList.add('correct');
			if (mark) {
				mark.className = 'mark correct';
				mark.textContent = '✓';
			}
		} else if (status === 'wrong') {
			inp.classList.add('wrong');
			if (mark) {
				mark.className = 'mark wrong';
				// Révélation : la BANDE acceptée quand l'item est corrigé par intervalle
				// (`data-attendue`, posé par renderItem — intercaler #446), sinon la réponse
				// unique. Sur une intercalation, révéler « → 457 » laissait croire à une réponse
				// unique dans le mode le plus joué, alors que la consigne annonçait le contraire.
				// Mise en forme partagée (#501) : le nombre révélé s'écrit comme dans les énoncés
				// (groupé, virgule française) ; une bande déjà rédigée en ressort intacte.
				const revelee = formatReponseRevelee(inp.dataset.attendue ?? inp.dataset.answer ?? '');
				// La réponse révélée RATTACHÉE au champ (relecture a11y #717) : la marque suit bien
				// l'input dans l'ordre du document, mais le parcours que l'application encourage est
				// Tab de champ en champ — et en mode formulaire, un lecteur d'écran saute le texte
				// statique interposé. Sans ce lien, l'enfant apprend que son champ est faux sans
				// jamais entendre ce qui était attendu. Aucune collision avec
				// `signalerSaisiesIllisibles`, qui pose aussi `aria-describedby` : elle sort de
				// `verify()` AVANT cette boucle (`return` sur `aCorriger.length`), les deux ne se
				// posent donc jamais sur le même champ au même moment.
				mark.id = `${inp.id}-mark`;
				inp.setAttribute('aria-describedby', mark.id);
				mark.innerHTML =
					html`✗ <span class="sol">→ ${revelee}</span>${regleRomaineHTML(sessionItems[inp.id], inp.value)}`.balisage;
			}
		}
		if (mark?.textContent && inp.type === 'hidden') rattacherMarqueAuChoix(inp, mark);
	}
}

/* Groupe de choix d'un QCM de fiche (`qcmChoixHTML`) dont `inp` est le champ caché. */
function groupeDeChoix(inp: HTMLInputElement): HTMLElement | null {
	return document.querySelector<HTMLElement>(`fieldset.fiche-choix[data-for="${inp.id}"]`);
}

/** Le champ d'un QCM de fiche est CACHÉ : sa marque (✓, ✗ et la réponse révélée) est
 *  rattachée au GROUPE de choix (`aria-describedby`), sans quoi un lecteur d'écran ne
 *  l'entendrait jamais. */
export function rattacherMarqueAuChoix(inp: HTMLInputElement, mark: HTMLElement): void {
	mark.id ||= `${inp.id}-mark`;
	groupeDeChoix(inp)?.setAttribute('aria-describedby', mark.id);
}

/* ---------- Impression (issue #40) ----------
   Deux chemins :
   - A (printAll) : imprimer l'écran courant tel quel. Les champs de réponse
     sont vidés par le CSS print (.ans/.ans-free en transparent) → version
     vierge sans rien réécrire. Sert au bouton 🖨 de la barre pendant un exercice.
   - B (printScope) : imprimer un PDF contextuel SANS lancer l'interactif. On
     pose un périmètre, beforeprint injecte buildPrintableDOM(scope) dans #sheets
     (le CSS masque l'écran de menu), afterprint restaure. */
let pendingPrintScope: PrintScope | null = null;
export function printScope(scope: PrintScope) {
	pendingPrintScope = scope;
	window.print();
}
/* Id du message de blocage (unique : un seul message, quel que soit le nombre de champs). */
const HINT_ILLISIBLE = 'verifyHint';

/* Signale les champs dont la saisie n'est pas un nombre, sans rien corriger.
   Ni rouge ni croix : ce n'est pas une faute, c'est une réponse qu'on ne sait pas lire.
   La saisie est conservée telle quelle, l'enfant corrige.

   Annonce au lecteur d'écran, par DEUX canaux complémentaires (WCAG 3.3.1) :
   - `aria-describedby` sur chaque champ concerné, plus le focus sur le premier : le
     message est lu en arrivant sur le champ, et reste consultable en y revenant ;
   - `role="alert"` sur le message : indispensable, car `verify()` est aussi déclenché
     par Entrée sur le DERNIER champ. Si c'est justement lui qui est refusé, il a déjà
     le focus, `focus()` ne fait rien, aucun évènement de focus n'est émis et la
     description ne serait jamais relue — le refus resterait totalement silencieux
     dans le cas le plus fréquent. */
export function signalerSaisiesIllisibles(champs: HTMLInputElement[]): void {
	document.getElementById(HINT_ILLISIBLE)?.remove();
	const hint = document.createElement('p');
	hint.id = HINT_ILLISIBLE;
	hint.className = 'verify-hint screen-only';
	hint.setAttribute('role', 'alert');
	hint.textContent =
		champs.length > 1
			? 'Il y a des réponses qui ne sont pas des nombres. Corrige-les, puis vérifie.'
			: "Il y a une réponse qui n'est pas un nombre. Corrige-la, puis vérifie.";
	// Le bandeau est collant (cf. `.verify-hint`) et doit se caler SOUS la barre d'outils,
	// elle-même collante : sa hauteur change au point de rupture mobile, on la mesure
	// plutôt que de la coder en dur.
	const barre = document.querySelector<HTMLElement>('.toolbar');
	if (barre) hint.style.top = `${barre.offsetHeight}px`;
	const sheets = document.getElementById('sheets')!;
	sheets.insertBefore(hint, sheets.firstChild);
	champs.forEach((inp) => {
		inp.classList.add('a-corriger');
		inp.setAttribute('aria-describedby', HINT_ILLISIBLE);
	});
	focaliserChamp(champs[0]);
}

/* Lève le signalement d'un champ retouché, et retire le message quand il ne reste plus
   rien à corriger. Appelé par l'écouteur de saisie global (initSession). */
function leverSignalementIllisible(champ: HTMLElement): void {
	champ.classList.remove('a-corriger');
	champ.removeAttribute('aria-describedby');
	if (!document.querySelector('#sheets input.a-corriger'))
		document.getElementById(HINT_ILLISIBLE)?.remove();
}

/* Id du message « on peut laisser une réponse vide » (unique par écran d'exercice). */
const ASTUCE_VIDE = 'astuceReponseVide';

/* Découvrabilité du droit de passer (#467).

   Laisser une réponse vide est DÉJÀ toléré sur une fiche (un champ vide reste neutre à
   la correction, cf. scoreItems, et l'essai compte dès 60 % de champs remplis) : ce qui
   manquait, c'est que l'enfant le SACHE. Sans ça, il peut se croire obligé de remplir et
   rester bloqué sur une case, sans autre issue que d'abandonner la séance.

   Choix de rendu :
   - posé à l'OUVERTURE de la fiche (appelé par `afterStart`), donc lu avec la consigne,
     AVANT le blocage : une aide qui n'apparaîtrait qu'après coup arriverait trop tard —
     l'enfant bloqué ne valide pas, il attend ;
   - information, pas alerte : ni `role="alert"` ni `aria-live` (rien ne survient), ni
     teinte `--warn` (réservée à l'attention, cf. `.ans.a-corriger`) ;
   - NON collant, contrairement à `.verify-hint` : un bandeau permanent mangerait de la
     hauteur utile pendant toute la fiche, sur tablette en particulier ;
   - AUCUN `data-tts` : `bindConsigneTts` lit automatiquement le PREMIER `[data-tts]` de
     l'écran quand le profil active la lecture auto — l'astuce, posée en tête, volerait la
     lecture de la vraie consigne ;
   - `screen-only` : le markup de fiche est partagé avec l'impression (`ficheHTMLGeneric`,
     `buildPrintableDOM`) et une feuille papier n'a pas de règle du jeu à l'écran.

   Placé DANS `#sheets` (et non en frère, comme `#resultBanner`) : c'est ce qui le fait
   suivre l'instantané de reprise (`captureResume` sérialise `sheets.innerHTML`), donc
   réapparaître à la reprise d'une fiche interrompue — `restoreResume` ne repasse pas par
   `afterStart`. Retiré à la vérification (cf. `verify`). */
export function afficherAstuceReponseVide(): void {
	const sheets = document.getElementById('sheets');
	if (!sheets) return;
	document.getElementById(ASTUCE_VIDE)?.remove(); // idempotent (re-rendu de fiche)
	// Rien à dire sur un écran sans champ à remplir.
	if (!sheets.querySelector('input.ans')) return;
	const astuce = document.createElement('p');
	astuce.id = ASTUCE_VIDE;
	astuce.className = 'astuce-vide screen-only';
	astuce.innerHTML =
		html`${icon('feather')}<span><strong>Tu ne sais pas quoi répondre ?</strong> Tu peux laisser la réponse vide et continuer.</span>`.balisage;
	sheets.insertBefore(astuce, sheets.firstChild);
}

export function printAll() {
	window.print();
}
// Instantané de #sheets pendant l'impression (chemin B) : la table id→Item de la session
// n'a plus besoin d'être sauvée (buildPrintableDOM #352 a son propre contexte).
let printSnapshot: { sheets: string; banner: string | null } | null = null;

/* ---------- Câblage global (appelé une fois par main.ts, cf. initProfiles) ----------
   Tous les écouteurs délégués de la session (saisie, navigation clavier,
   impression) sont posés ICI et non à l'import du module (#349) : importer
   session.ts (test unitaire, autre module) ne doit produire aucun effet de bord. */
export function initSession() {
	// QCM de fiche (`qcmChoixHTML`) : le choix coché devient la valeur du champ caché que la
	// correction lit. L'événement `input` relancé sur ce champ efface son ancien marquage
	// (écouteur ci-dessous) et déclenche la sauvegarde de reprise, comme une frappe.
	document.addEventListener('change', (e: Event) => {
		const radio = e.target;
		if (!(radio instanceof HTMLInputElement) || radio.type !== 'radio' || !radio.checked) return;
		const id = radio.closest<HTMLElement>('fieldset.fiche-choix')?.dataset.for;
		const champ = id ? document.getElementById(id) : null;
		if (!(champ instanceof HTMLInputElement)) return;
		champ.value = radio.value;
		groupeDeChoix(champ)?.removeAttribute('aria-describedby');
		champ.dispatchEvent(new Event('input', { bubbles: true }));
	});
	// Saisie : modifier un champ efface son marquage. Pour l'heure (#88), éditer le
	// champ des minutes (.heure-min) efface la marque du champ des heures qui lui est lié.
	document.addEventListener('input', (e: Event) => {
		const t = e.target as HTMLElement | null;
		// Champ signalé comme illisible (saisie non numérique) : le retoucher lève le
		// signalement, comme une saisie efface son marquage ✓/✗ juste en dessous.
		if (t?.classList.contains('a-corriger')) leverSignalementIllisible(t);
		let marked: HTMLElement | null = null;
		if (t?.classList.contains('ans')) marked = t;
		else if (t?.classList.contains('heure-min'))
			marked = t.closest('.heure-input')?.querySelector<HTMLElement>('.heure-h') ?? null;
		if (marked) {
			marked.classList.remove('correct', 'wrong');
			// Le verdict s'efface AUSSI pour les technologies d'assistance : sans ça, le champ
			// resterait annoncé « invalide » et décrit par une marque devenue vide.
			marked.removeAttribute('aria-invalid');
			marked.removeAttribute('aria-describedby');
			const mark = document.querySelector<HTMLElement>(`.mark[data-for="${marked.id}"]`);
			if (mark) {
				mark.className = 'mark';
				mark.textContent = '';
			}
		}
	});
	// Confort de saisie : Entrée passe au champ suivant ; sur le dernier, on vérifie.
	// Le champ des minutes (.heure-min) entre dans la navigation (heures → minutes → …).
	document.addEventListener('keydown', (e: KeyboardEvent) => {
		const t = e.target as HTMLInputElement | null;
		if (e.key !== 'Enter' || !t || t.tagName !== 'INPUT') return;
		if (
			!t.classList.contains('ans') &&
			!t.classList.contains('ans-free') &&
			!t.classList.contains('heure-min')
		)
			return;
		e.preventDefault();
		// Le `.ans` CACHÉ d'un QCM joué en séance partagée (#734) n'est pas une étape : le
		// viser rendrait Entrée muette juste avant la question.
		const all = [
			...document.querySelectorAll<HTMLInputElement>(
				'#sheets input.ans:not([type="hidden"]), #sheets input.ans-free, #sheets input.heure-min',
			),
		];
		const i = all.indexOf(t);
		if (i > -1 && i < all.length - 1) focaliserChamp(all[i + 1]);
		else verify(); // dernier champ
	});
	// Grille posée (#97) : navigation entre cellules aux flèches ← →.
	document.addEventListener('keydown', (e: KeyboardEvent) => {
		const t = e.target as HTMLElement | null;
		if (!t || t.tagName !== 'INPUT' || !t.classList.contains('posee-cell')) return;
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		const grid = t.closest('.posee');
		if (!grid) return;
		const cells = [...grid.querySelectorAll<HTMLInputElement>('input.posee-cell')];
		const j = cells.indexOf(t as HTMLInputElement) + (e.key === 'ArrowLeft' ? -1 : 1);
		if (j >= 0 && j < cells.length) {
			e.preventDefault();
			cells[j].focus();
		}
	});
	// Impression (#40) : beforeprint bascule #sheets sur la version imprimable, afterprint restaure.
	window.addEventListener('beforeprint', () => {
		if (!pendingPrintScope) return; // chemin A : on n'altère pas #sheets
		const sheets = document.getElementById('sheets')!;
		const banner = document.getElementById('resultBanner');
		// buildPrintableDOM (#352) rend dans son PROPRE contexte : la table id→Item de la
		// session interactive (getRenderCtx) n'est plus touchée → rien à sauver/restaurer ici.
		printSnapshot = {
			sheets: sheets.innerHTML,
			banner: banner ? banner.outerHTML : null,
		};
		if (banner) banner.remove();
		sheets.innerHTML = buildPrintableDOM(pendingPrintScope).balisage;
	});
	window.addEventListener('afterprint', () => {
		pendingPrintScope = null;
		if (!printSnapshot) return;
		const sheets = document.getElementById('sheets')!;
		// Instantané pris juste avant l'impression : balisage produit par l'application.
		sheets.innerHTML = brut(printSnapshot.sheets).balisage;
		if (printSnapshot.banner) {
			const tmp = document.createElement('div');
			tmp.innerHTML = brut(printSnapshot.banner).balisage;
			const restored = tmp.firstChild as HTMLElement | null;
			if (restored) {
				sheets.parentNode!.insertBefore(restored, sheets);
				const redo = restored.querySelector('#btnRedo');
				if (redo) redo.addEventListener('click', startRevision); // le listener est perdu via outerHTML
			}
		}
		printSnapshot = null;
	});
}
