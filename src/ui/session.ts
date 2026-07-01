/* ============================================================
   Déroulé d'une session : vérification, saisie clavier, impression
   ============================================================ */
import { fmt } from '../core/utils';
import { icon } from './icon';
import { scoreItems } from '../core/scoring';
import type { ScoredInput } from '../core/scoring';
import type { Trophy } from '../core/rewards';
import { buildPrintableDOM } from '../core/lessons';
import type { PrintScope } from '../core/lessons';
import { streakSuffix } from '../core/progress';
import { recordLessonRun } from '../core/lesson-run';
import type { Recompense } from '../core/unlocks';
import { stopChrono } from './chrono';
import { finishResume } from './resume';
import { showCelebration, showLevelUp } from './effects';
import { mascotteBulleHTML, encouragementMascotte } from './unlocks-view';
import {
	getCurrentMode,
	getCurrentLessonId,
	getSessionRecorded,
	setSessionRecorded,
	setLastErrors,
	getLastErrors,
	startRevision,
	runLecon,
	goHome,
	goCategorie,
	getRenderCtx,
} from './navigation';
import { getLessonById } from '../core/catalog';

/* ---------- Vérification (arrête le chrono) ---------- */
export function verify() {
	const ms = stopChrono();
	const inputs = document.querySelectorAll('#sheets input.ans');
	const sessionItems = getRenderCtx().items;
	const currentMode = getCurrentMode();
	const currentLessonId = getCurrentLessonId();
	// Lecture DOM → descripteurs purs (#349). Saisie de l'heure (#88) : on FUSIONNE
	// les 2 champs en « H h MM » (minutes sur 2 chiffres) AVANT correction → champ
	// heures vide = non répondu ; minutes vide = « 00 » (heure pile). checkItemAnswer
	// reste inchangé (la fusion produit sa forme canonique texte).
	const scored: ScoredInput[] = [];
	inputs.forEach((inp: any) => {
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
			item: sessionItems[inp.id] ?? null,
			saisie,
			answer: inp.dataset.answer,
			lesson: inp.dataset.lesson ?? null,
		});
	});
	// Calcul du score (logique pure, testée sans DOM — cf. core/scoring.ts).
	const { ok, total, vides, errors, perLesson, statuses } = scoreItems(scored);
	// Marquage DOM selon les verdicts : on efface l'ancien marquage puis on pose
	// ✓ / ✗ (avec révélation de la bonne réponse à côté de l'erreur) ; un champ
	// laissé vide reste neutre.
	inputs.forEach((inp: any) => {
		const mark: any = document.querySelector(`.mark[data-for="${inp.id}"]`);
		inp.classList.remove('correct', 'wrong');
		if (mark) {
			mark.className = 'mark';
			mark.textContent = '';
		}
		const status = statuses[inp.id];
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
				mark.innerHTML = `✗ <span class="sol">→ ${inp.dataset.answer}</span>`;
			}
		}
	});
	setLastErrors(errors);
	// L'exercice est vérifié (corrections révélées) : la reprise n'a plus lieu d'être (#63).
	finishResume();
	const lastErrors = getLastErrors();
	// Un exercice ne « compte » que si au moins 60 % des calculs ont une réponse.
	const recordable = currentMode && currentMode !== 'revision';
	const enough = inputs.length > 0 && total >= inputs.length * 0.6;
	const notEnough = recordable && !enough && !getSessionRecorded();
	// Enregistrement de l'essai (une seule fois par session)
	// → bilan complet/express : enregistré (régularité, trophées) mais non classé
	// → leçon seule : étoile si sans-faute
	let starInfo: any = null,
		streakDays = 0,
		goalRes: any = null,
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
		});
		starInfo = out.starInfo;
		streakDays = out.streakDays;
		goalRes = out.goalRes;
		niveauGagne = out.niveauGagne;
		recompensesNiv = out.recompensesNiv;
		newTrophies = out.newTrophies;
		celeb.push(...out.celeb);
	}

	// Bandeau résultat en tête de la zone
	const old = document.getElementById('resultBanner');
	if (old) old.remove();
	const banner = document.createElement('div');
	banner.className = 'result-banner screen-only';
	banner.id = 'resultBanner';
	const note = total > 0 ? Math.round((ok / total) * 100) : 0;
	// La mascotte félicite l'effort (hors chrono, jamais de réaction négative).
	let html =
		mascotteBulleHTML(encouragementMascotte()) +
		`<span class="rb-big">${ok}/${total}</span>
    <span class="rb-sub">bonnes réponses (${note}%)${vides > 0 ? ` · ${vides} non remplie${vides > 1 ? 's' : ''}` : ''}<br>
    Temps : <strong>${fmt(ms)}</strong></span>`;
	if (notEnough) {
		html += `<div class="rb-warn">⚠️ Réponds à au moins 60 % des calculs pour valider ton temps et gagner des récompenses.</div>`;
	}
	if (starInfo) {
		if (starInfo.perfect) {
			html += `<div class="rb-medal"><span class="rb-medal-ico">⭐</span><span class="rb-medal-txt">${starInfo.newStar ? 'Étoile gagnée !' : 'Encore sans faute !'}</span></div>`;
		}
		let msg = starInfo.perfect
			? `Leçon réussie sans faute${starInfo.count > 1 ? ` (${starInfo.count}×)` : ''}. Bravo !`
			: `Il faut un sans-faute pour décrocher l'étoile de cette leçon. Réessaie ⭐`;
		msg += streakSuffix(streakDays);
		html += `<div class="rb-rank">${msg}</div>`;
	}
	if (newTrophies.length) {
		html += `<div class="rb-trophies">🏆 Nouveau trophée : ${newTrophies.map((t) => `${t.icon} ${t.title}`).join(' · ')} !</div>`;
	}
	if (goalRes) {
		if (goalRes.justDone)
			html += `<div class="rb-goal">🎯 Objectif du jour réussi : ${goalRes.goal.label}</div>`;
		else if (!goalRes.goal.done)
			html += `<div class="rb-goal">🎯 Objectif du jour : ${goalRes.goal.label} (${goalRes.goal.progress}/${goalRes.goal.target})</div>`;
	}
	if (lastErrors.length) {
		html += `<button class="rb-redo" id="btnRedo">↻ Réviser mes erreurs (${lastErrors.length})</button>`;
	}
	// Fin de leçon : recommencer un tour (s'entraîner encore) ou quitter (#69).
	if (currentMode === 'lecon' && currentLessonId) {
		html += `<button class="rb-redo" id="btnRecommencer">↻ Recommencer</button>`;
		const cat = getLessonById(currentLessonId)?.category;
		if (cat)
			html += `<button class="backlink-top" id="btnBackCategorie">← Retour à la catégorie</button>`;
		html += `<button class="rb-quit" id="btnQuitter">${icon('house')} Quitter</button>`;
	}
	banner.innerHTML = html;
	const redo = banner.querySelector('#btnRedo');
	if (redo) redo.addEventListener('click', startRevision);
	const recommencer = banner.querySelector('#btnRecommencer');
	if (recommencer)
		recommencer.addEventListener('click', () => {
			banner.remove(); // le bandeau est frère de #sheets : runLecon ne l'efface pas
			runLecon(currentLessonId!);
		});
	const backCat = banner.querySelector('#btnBackCategorie');
	if (backCat)
		backCat.addEventListener('click', () => {
			const cat = getLessonById(currentLessonId!)?.category;
			if (cat) goCategorie(cat);
		});
	const quitter = banner.querySelector('#btnQuitter');
	if (quitter) quitter.addEventListener('click', goHome);
	const sheets = document.getElementById('sheets')!;
	sheets.parentNode!.insertBefore(banner, sheets);
	// Récompenses : modale explicite (+ confettis) pour qu'on sache ce qu'on a gagné.
	// Le passage de niveau a sa modale dédiée ; s'il y a aussi d'autres récompenses,
	// on les enchaîne à la fermeture de la modale de niveau.
	if (niveauGagne)
		showLevelUp(
			niveauGagne,
			recompensesNiv,
			celeb.length ? () => showCelebration(celeb) : undefined,
		);
	else if (celeb.length) showCelebration(celeb);
	// petit rappel dans la barre
	const sc = document.getElementById('score')!;
	sc.classList.remove('hidden');
	sc.textContent = total > 0 ? `${ok}/${total} · ${fmt(ms)}` : `Aucune réponse · ${fmt(ms)}`;
	const firstWrong = document.querySelector('#sheets input.ans.wrong');
	if (firstWrong) firstWrong.scrollIntoView({ behavior: 'smooth', block: 'center' });
	else window.scrollTo({ top: 0, behavior: 'smooth' });
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
	// Saisie : modifier un champ efface son marquage. Pour l'heure (#88), éditer le
	// champ des minutes (.heure-min) efface la marque du champ des heures qui lui est lié.
	document.addEventListener('input', (e: any) => {
		let marked: HTMLElement | null = null;
		if (e.target.classList && e.target.classList.contains('ans')) marked = e.target;
		else if (e.target.classList && e.target.classList.contains('heure-min'))
			marked = e.target.closest('.heure-input')?.querySelector('.heure-h') ?? null;
		if (marked) {
			marked.classList.remove('correct', 'wrong');
			const mark: any = document.querySelector(`.mark[data-for="${marked.id}"]`);
			if (mark) {
				mark.className = 'mark';
				mark.textContent = '';
			}
		}
	});
	// Confort de saisie : Entrée passe au champ suivant ; sur le dernier, on vérifie.
	// Le champ des minutes (.heure-min) entre dans la navigation (heures → minutes → …).
	document.addEventListener('keydown', (e: any) => {
		const t = e.target;
		if (e.key !== 'Enter' || t.tagName !== 'INPUT') return;
		if (
			!t.classList.contains('ans') &&
			!t.classList.contains('ans-free') &&
			!t.classList.contains('heure-min')
		)
			return;
		e.preventDefault();
		const all: any[] = [
			...document.querySelectorAll(
				'#sheets input.ans, #sheets input.ans-free, #sheets input.heure-min',
			),
		];
		const i = all.indexOf(t);
		if (i > -1 && i < all.length - 1) all[i + 1].focus();
		else verify(); // dernier champ
	});
	// Grille posée (#97) : navigation entre cellules aux flèches ← →.
	document.addEventListener('keydown', (e: any) => {
		const t = e.target;
		if (t.tagName !== 'INPUT' || !t.classList.contains('posee-cell')) return;
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		const grid = t.closest('.posee');
		if (!grid) return;
		const cells = [...grid.querySelectorAll('input.posee-cell')];
		const j = cells.indexOf(t) + (e.key === 'ArrowLeft' ? -1 : 1);
		if (j >= 0 && j < cells.length) {
			e.preventDefault();
			(cells[j] as HTMLInputElement).focus();
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
		sheets.innerHTML = buildPrintableDOM(pendingPrintScope);
	});
	window.addEventListener('afterprint', () => {
		pendingPrintScope = null;
		if (!printSnapshot) return;
		const sheets = document.getElementById('sheets')!;
		sheets.innerHTML = printSnapshot.sheets;
		if (printSnapshot.banner) {
			const tmp = document.createElement('div');
			tmp.innerHTML = printSnapshot.banner;
			const restored: any = tmp.firstChild;
			sheets.parentNode!.insertBefore(restored, sheets);
			const redo = restored.querySelector && restored.querySelector('#btnRedo');
			if (redo) redo.addEventListener('click', startRevision); // le listener est perdu via outerHTML
		}
		printSnapshot = null;
	});
}
