/* ============================================================
   Items {text, answer}  (@ = emplacement du champ de réponse)
   et fabrique de champs / grilles / fiches.
   ============================================================ */
function add(a,b){return {text:`${a} + ${b} = @`,answer:a+b};}
function sub(a,b){return {text:`${a} - ${b} = @`,answer:a-b};}
function mul(a,b){return {text:`${a} × ${b} = @`,answer:a*b};}
function dbl(n){return {text:`double de ${n} = @`,answer:2*n};}
function half(n){return {text:`moitié de ${n} = @`,answer:n/2};}
function comp(a,total){return {text:`${a} + @ = ${total}`,answer:total-a};}
function facteur(a,total){return {text:`${a} × @ = ${total}`,answer:total/a};}

let inputCounter=0;
// Mémorise les items {text, answer} de la session courante, par id de champ,
// pour pouvoir reconstruire « mes erreurs » lors d'une révision.
let sessionItems={};
// Numéro de la leçon en cours de génération (pour taguer les champs et
// agréger les stats par leçon, y compris dans les bilans). null = non rattaché.
let renderLesson=null;
// Attribut data-lesson, ou rien si on ne rattache pas le champ à une leçon.
const lessonAttr=()=>renderLesson!=null?` data-lesson="${renderLesson}"`:'';

function renderItem(it,extra=''){
  const id='a'+(inputCounter++);
  sessionItems[id]=it;
  const field=`<input class="ans ${extra}" id="${id}" data-answer="${it.answer}"${lessonAttr()} inputmode="numeric" autocomplete="off"><span class="mark" data-for="${id}"></span>`;
  return escapeHTML(it.text).replace('@',field);
}
function gridHTML(items,cols){
  const cls=cols===3?'c3':'c4';
  return `<div class="grid ${cls}">${items.map(it=>`<div class="op">${renderItem(it)}</div>`).join('')}</div>`;
}
/* L'en-tête de fiche : le champ "Temps : ___ min" est print-only */
function ficheHTML(num,titre,sous,consigne,inner){
  return `<div class="fiche">
    <div class="fiche-head">
      <p class="fiche-title">MENTAL ${num} — ${titre}</p>
      <span class="temps print-only">Temps : ______ min</span>
    </div>
    <p class="fiche-sub">${sous}</p>
    <p class="consigne-line">${consigne}</p>
    ${inner}
  </div>`;
}
