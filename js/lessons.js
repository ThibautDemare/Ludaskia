/* ============================================================
   Les 15 leçons — chaque entrée est constructible isolément,
   ce qui permet de jouer une leçon seule OU le bilan complet.
   build() régénère des items frais à chaque appel.
   ============================================================ */
const LESSONS=[
  {num:1,title:"Les tables d'addition",sub:"Additionner deux nombres de 1 à 9.",consigne:"Calcule chaque addition.",
   build(){const items=uniqueComm(()=>{let a=rnd(2,9),b=rnd(2,9);[a,b]=[Math.min(a,b),Math.max(a,b)];return add(a,b);},12);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,4));}},

  {num:2,title:"Les compléments",sub:"Trouver le nombre qui complète à 10 ou à 100.",consigne:"Complète chaque égalité.",
   build(){const pool10=[];for(let a=1;a<=9;a++)pool10.push(comp(a,10));
     const pool100=[10,20,30,40,50,60,70,80,90].map(a=>comp(a,100));
     const items=sample([...sample(pool10,6),...sample(pool100,6)],12);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:3,title:"Les doubles",sub:"Le double, c'est deux fois le nombre.",consigne:"Écris le double.",
   build(){const items=sample([...Array(39).keys()].map(i=>i+1),12).map(dbl);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:4,title:"Les moitiés",sub:"La moitié, c'est le nombre partagé en deux.",consigne:"Écris la moitié.",
   build(){const items=sample([2,4,6,8,10,12,14,16,18,20,30,40,50,60,80,100],12).map(half);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:5,title:"Ajouter 9, 19, 29 / 8, 18, 28",sub:"Astuce : +9 = +10 puis -1 · +8 = +10 puis -2.",consigne:"Calcule en utilisant l'astuce.",
   build(){const items=uniqueExact(()=>add(rnd(20,70),choice([8,9,18,19,28,29])),12);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,4));}},

  {num:6,title:"Soustraire 9, 19, 29, 39 et un petit nombre",sub:"Astuce : -9 = -10 puis +1.",consigne:"Calcule chaque soustraction.",
   build(){const items=uniqueExact(()=>sub(rnd(40,90),choice([9,19,29,39])),8).concat(uniqueExact(()=>sub(rnd(11,20),rnd(2,8)),4));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,4));}},

  {num:7,title:"Les tables de multiplication",sub:"Tables de 2 à 9.",consigne:"Calcule chaque produit.",
   build(){const items=uniqueComm(()=>{let a=rnd(2,9),b=rnd(2,9);[a,b]=[Math.min(a,b),Math.max(a,b)];return mul(a,b);},12);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,4));}},

  {num:8,title:"La moitié d'un nombre pair",sub:"Je sépare les dizaines et les unités si besoin.",consigne:"Écris la moitié.",
   build(){const items=sample([24,36,48,52,64,28,46,82,38,56,74,98,66,84],12).map(half);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:9,title:"Les multiples de 25",sub:"25, 50, 75, 100... de 25 en 25.",consigne:"Calcule.",
   build(){const items=sample([2,3,4,5,6,7,8,9,10,11,12],11).map(a=>mul(a,25));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:10,title:"Décompositions multiplicatives de 60",sub:"Quel nombre multiplié donne 60 ?",consigne:"Complète.",
   build(){const fac=[[2,30],[3,20],[4,15],[5,12],[6,10],[12,5],[15,4],[20,3],[10,6],[30,2],[60,1],[1,60]];
     const items=sample(fac,12).map(([a])=>facteur(a,60));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:11,title:"Ajouter, soustraire des dizaines et des centaines",sub:"J'ajoute ou je retire des paquets entiers.",consigne:"Calcule.",
   build(){const items=uniqueExact(()=>{const a=rnd(120,500),op=choice(['+','-']),b=choice([10,20,30,40,50]);return op==='+'?add(a,b):sub(a,b);},6)
       .concat(uniqueExact(()=>{const a=rnd(150,600),op=choice(['+','-']),b=choice([100,200,300]);return op==='+'?add(a,b):sub(a,b);},6));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:12,title:"Multiplier par 10, par 100",sub:"×10 j'ajoute un zéro · ×100 j'ajoute deux zéros.",consigne:"Calcule.",
   build(){const items=sample([...Array(98).keys()].map(i=>i+2),6).map(a=>mul(a,10)).concat(sample([...Array(39).keys()].map(i=>i+2),6).map(a=>mul(a,100)));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:13,title:"Multiplier par 4, par 8",sub:"×4 = double du double · ×8 = double du double du double.",consigne:"Calcule.",
   build(){const items=sample([...Array(23).keys()].map(i=>i+3).filter(x=>x!==8),6).map(a=>mul(a,4)).concat(sample([...Array(13).keys()].map(i=>i+3).filter(x=>x!==4),6).map(a=>mul(a,8)));
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:14,title:"Multiplier par 20, 30, 40",sub:"Astuce : je multiplie par le chiffre, puis par 10.",consigne:"Calcule.",
   build(){const items=uniqueComm(()=>mul(rnd(2,12),choice([20,30,40])),12);
     return ficheHTML(this.num,this.title,this.sub,this.consigne,gridHTML(items,3));}},

  {num:15,title:"Décomposer pour calculer une multiplication",sub:"Ex : 6 × 14 = (6×10) + (6×4) = 60 + 24 = 84.",consigne:"Décompose puis calcule. Écris les étapes.",
   build(){const seen=new Set();const d=[];
     while(d.length<6){const a=rnd(3,8),b=choice([12,13,14,15,16,21,23,24]);const k=a+'x'+b;if(!seen.has(k)){seen.add(k);d.push([a,b]);}}
     const lines=d.map(([a,b])=>{
       const free=()=>`<input class="ans-free" inputmode="numeric" autocomplete="off">`;
       const finalId='a'+(inputCounter++);
       sessionItems[finalId]={text:`${a} × ${b} = @`,answer:a*b};
       const finalField=`<input class="ans" id="${finalId}" data-answer="${a*b}"${lessonAttr()} inputmode="numeric" autocomplete="off"><span class="mark" data-for="${finalId}"></span>`;
       return `<div class="op">${a} × ${b} = (${free()} × ${free()}) + (${free()} × ${free()}) = ${free()} + ${free()} = ${finalField}</div>`;
     }).join('');
     return ficheHTML(this.num,this.title,this.sub,this.consigne,`<div class="deco">${lines}</div>`);}},
];
function buildFiches(){return LESSONS.map(l=>{renderLesson=l.num;const html=l.build();renderLesson=null;return html;});}

/* ============================================================
   Bilans express (3 calculs par leçon)
   ============================================================ */
const THEMES={1:"Table d'addition",2:"Complément à 10/100",3:"Doubles",4:"Moitiés",5:"Ajouter 9, 19...",6:"Soustraire 9, 19...",7:"Table de ×",8:"Moitié (pair)",9:"Multiples de 25",10:"Décompo. de 60",11:"Dizaines/centaines",12:"× 10, × 100",13:"× 4, × 8",14:"× 20, 30, 40",15:"Décomposer"};
function bilanQ(k){
  switch(k){
    case 1:{let a=rnd(2,9),b=rnd(2,9);[a,b]=[Math.min(a,b),Math.max(a,b)];return add(a,b);}
    case 2: return Math.random()<0.5?comp(rnd(1,9),10):comp(choice([10,20,30,40,60,70,80,90]),100);
    case 3: return dbl(rnd(5,35));
    case 4: return half(choice([8,12,16,20,30,40,50,60,80,100]));
    case 5: return add(rnd(20,60),choice([8,9,18,19,28,29]));
    case 6: return sub(rnd(40,85),choice([9,19,29,39]));
    case 7:{let a=rnd(2,9),b=rnd(2,9);[a,b]=[Math.min(a,b),Math.max(a,b)];return mul(a,b);}
    case 8: return half(choice([24,36,48,52,64,28,46,82,56,74,66,84]));
    case 9: return mul(rnd(2,12),25);
    case 10:return facteur(choice([2,3,4,5,6,10,12,15,20,30]),60);
    case 11:{const a=rnd(120,500),op=choice(['+','-']),b=choice([10,20,30,40,100,200,300]);return op==='+'?add(a,b):sub(a,b);}
    case 12:return mul(rnd(2,40),choice([10,100]));
    case 13:return mul(rnd(3,15),choice([4,8]));
    case 14:return mul(rnd(2,12),choice([20,30,40]));
    case 15:return mul(rnd(3,8),choice([12,13,14,15,16,21,23,24]));
  }
}
function bilanBlocks(nbQ){
  const blocks=[];
  for(let num=1;num<=15;num++){
    const k=[],ops=[];let t=0;
    while(ops.length<nbQ&&t<300){const o=bilanQ(num),key=commKey(o.text);if(!k.includes(key)){k.push(key);ops.push(o);}t++;}
    blocks.push({num,theme:THEMES[num],ops});
  }
  return blocks;
}
/* numero = libellé ; le bloc temps total est print-only */
function bilanHTML(numero){
  const blocks=bilanBlocks(3);
  const cells=blocks.map(b=>{renderLesson=b.num;const ops=b.ops.map(o=>`<div class="bop">${renderItem(o)}</div>`).join('');renderLesson=null;return `<div class="bloc"><span class="blab">M${b.num}.</span> <span class="btheme">${b.theme}</span>${ops}</div>`;}).join('');
  return `<div class="page">
    <p class="bilan-title">Bilan express ${numero} — toutes les leçons</p>
    <p class="bilan-sub">3 calculs par leçon · objectif : environ 15 minutes.
       <span class="print-only">Prénom : __________   Date : ________</span></p>
    <p class="bilan-temps print-only">Temps total : ______ min</p>
    <div class="bilan-grid">${cells}</div>
    <p class="foot">Calcul mental CE2</p>
  </div>`;
}

/* ============================================================
   Page de garde + pagination (impression)
   ============================================================ */
function coverHTML(){
  return `<div class="page cover print-only">
    <div class="big">Calcul mental — CE2</div>
    <div class="tagline">Fiches d'entraînement en autonomie · 15 ateliers</div>
    <div class="idbox"><div>Prénom : ______________________</div><div>Date : ______________________</div></div>
    <p class="consigne">Comment faire ? Je calcule de tête le plus vite possible, puis j'écris le résultat.
      Si je bloque, je passe au suivant et j'y reviens à la fin. Bon entraînement !</p>
  </div>`;
}
function fichesPagesHTML(fiches){
  const perPage=3;const pages=[];
  for(let i=0;i<fiches.length;i+=perPage){
    pages.push(`<div class="page">${fiches.slice(i,i+perPage).join('')}<p class="foot">Calcul mental CE2</p></div>`);
  }
  return pages.join('');
}
/* Contenu COMPLET pour l'impression : garde, 15 fiches, 2 bilans. */
function buildPrintableDOM(){
  inputCounter=0;
  const fiches=buildFiches();
  return coverHTML()+fichesPagesHTML(fiches)+bilanHTML(1)+bilanHTML(2);
}
