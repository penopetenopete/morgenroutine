/* =================== ERNÄHRUNG (07.10.2026) ===================
   Speicher localStorage "essen_v1":
     {goals:{kcal,p,f,c}, kg, burnIn, foods:{id:food}, meals:{id:tpl}, days:{"JJJJ-MM-TT":{e:[entry],acts:[{name,kcal}]}}}
   food:  {id,name,brand?,base:"g"|"stk",kcal,p,c,f,fib,stkG?,def?,src:"own"|"bls"|"off",code?}  Werte pro 100 g bzw. pro Stück
   entry: {id,slot,food,amt,u?:"stk",g?:{id,name,tpl?}}   g = eingefügte Mahlzeit (Kopie, Vorlage bleibt unverändert)
   tpl:   {id,name,slot?,items:[{food,amt,u?}]}
   Andockstelle für Claude: Link #e=<base64url(deflate-raw(JSON))>, Format siehe importEssen().
   Lebensmittel-Quellen: eigene Liste · BLS 4.0 (bls.json, offline, Max Rubner-Institut, CC BY 4.0) · Open Food Facts (online). */
(function(){
"use strict";
const K=window.AppKit;if(!K)return;
const {$,esc,toast,openSheet,closeSheet,show,SCREENS,b64u,zip,APP_URL}=K;
const EK="essen_v1";
const SLOTS=[["fr","Frühstück"],["mi","Mittag"],["ab","Abendessen"],["sn","Snacks"]];
const SLOTN=Object.fromEntries(SLOTS);
const nid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const nf=(v,d=0)=>(+v||0).toLocaleString("de-DE",{maximumFractionDigits:d,minimumFractionDigits:0});
const ymd=d=>{d=new Date(d);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const addDays=(k,n)=>{const [y,m,d]=k.split("-").map(Number);return ymd(new Date(y,m-1,d+n))};
const today=()=>ymd(Date.now());

/* ---------- Startdaten (aus dem Chat 06.10.2026) ---------- */
function seed(){
  const F=(id,name,brand,v,extra)=>Object.assign({id,name,brand,base:"g",src:"own"},v,extra||{});
  const foods={};
  [F("quark","Speisequark Magerstufe","Ja!",{kcal:66,p:11.8,c:4,f:0.3,fib:0},{def:250}),
   F("hafer","Haferflocken","Gut & Günstig",{kcal:372,p:13.5,c:58.7,f:7,fib:10},{def:80}),
   F("whey","Evowhey 2.0 Schokolade","HSN",{kcal:362,p:74,c:6.5,f:3.8,fib:0},{def:29}),
   F("sonne","Sonnenblumenkerne","",{kcal:586,p:26.1,c:10.4,f:47.6,fib:5.8},{def:40}),
   F("floh","Flohsamen ganz","Alnatura",{kcal:290,p:16,c:3.7,f:7,fib:75},{def:30}),
   F("gluten","Vital Weizengluten","Golden Peanut",{kcal:406,p:79.4,c:6.4,f:6,fib:0.6},{def:50}),
   F("basmati","Basmati Reis ungekocht","",{kcal:351,p:8.5,c:77,f:0.9,fib:1.5},{def:125}),
   F("ei","Ei roh","",{kcal:135,p:13.2,c:0.3,f:9,fib:0},{stkG:60,def:2,du:"stk"}),
   {id:"roggen",name:"Roggenbrötchen",brand:"Rewe Beste Wahl",base:"stk",src:"own",kcal:172,p:5.3,c:32.9,f:1.4,fib:4,def:1}
  ].forEach(f=>foods[f.id]=f);
  const meals={
    fruehstueck:{id:"fruehstueck",name:"Mein Frühstück",slot:"fr",items:[{food:"quark",amt:250},{food:"hafer",amt:80},{food:"whey",amt:29},{food:"sonne",amt:40},{food:"floh",amt:30}]},
    eierbr:{id:"eierbr",name:"Eier + Brötchen",slot:"mi",items:[{food:"ei",amt:3,u:"stk"},{food:"roggen",amt:1}]}
  };
  return {v:1,goals:{kcal:2250,p:141,f:62,c:281},kg:87,burnIn:false,foods,meals,days:{}};
}
let E=null;
try{E=JSON.parse(localStorage.getItem(EK)||"null")}catch(_){}
if(!E||!E.foods)E=seed();
/* 09.10.2026: kein Weizengluten mehr im Frühstück */
if(!(E.mig>=1)){const m=E.meals&&E.meals.fruehstueck;if(m)m.items=m.items.filter(i=>i.food!=="gluten");E.mig=1;try{localStorage.setItem(EK,JSON.stringify(E))}catch(_){}}
function esave(){try{localStorage.setItem(EK,JSON.stringify(E))}catch(_){toast("Speichern ging nicht")}}
const day=k=>E.days[k]||(E.days[k]={e:[]});
const dayGet=k=>E.days[k]||{e:[]};
function tidyDay(k){const d=E.days[k];if(d&&!d.e.length&&!(d.acts&&d.acts.length))delete E.days[k]}

/* ---------- Nährwerte ---------- */
const Z=()=>({kcal:0,p:0,c:0,f:0,fib:0});
function factor(f,amt,u){
  if(!f)return 0;
  if(f.base==="stk")return u==="g"&&f.stkG?amt/f.stkG:amt;
  return (u==="stk"?amt*(f.stkG||0):amt)/100;
}
function nut(f,amt,u){const k=factor(f,amt,u),o=Z();if(!f)return o;["kcal","p","c","f","fib"].forEach(x=>o[x]=(+f[x]||0)*k);return o}
const addN=(a,b)=>{["kcal","p","c","f","fib"].forEach(x=>a[x]+=b[x]);return a};
const sumE=list=>list.reduce((a,en)=>addN(a,nut(E.foods[en.food],en.amt,en.u)),Z());
function amtText(f,amt,u){
  if(!f)return nf(amt,1);
  if(f.base==="stk")return nf(amt,1)+" Stück";
  if(u==="stk")return nf(amt,1)+" Stück"+(f.stkG?" · "+nf(amt*f.stkG)+" g":"");
  return nf(amt,1)+" g";
}
const foodName=f=>f?f.name:"Unbekannt";

/* ---------- Training: verbrannte Kalorien (grob) ---------- */
/* Krafttraining/Mobilität netto ≈ 3,5 MET über dem Ruheumsatz → kcal/min = 3,5 × kg / 60 */
function burned(k){
  let w=0,n=0;try{(K.S().log||[]).forEach(l=>{if(ymd(l.d)===k){w+=(l.t||0)/60*3.5*(E.kg||87)/60;n++}})}catch(_){}
  const acts=(dayGet(k).acts||[]);acts.forEach(a=>w+=+a.kcal||0);
  return {kcal:Math.round(w),n,acts};
}

/* ---------- Häufigkeit (für Vorschläge und Sortierung) ---------- */
function usage(slot){
  const fo={},me={},end=today();
  for(let i=0;i<60;i++){const k=addDays(end,-i),d=E.days[k];if(!d)continue;const seen={};
    d.e.forEach(en=>{if(slot&&en.slot!==slot)return;fo[en.food]=(fo[en.food]||0)+1;
      if(en.g&&en.g.tpl&&!seen[en.g.id]){seen[en.g.id]=1;me[en.g.tpl]=(me[en.g.tpl]||0)+1}})}
  return {fo,me};
}
function suggestions(slot,k){
  const u=usage(slot),out=[];
  Object.values(E.meals).filter(m=>u.me[m.id]||m.slot===slot).sort((a,b)=>(u.me[b.id]||0)-(u.me[a.id]||0)).slice(0,3).forEach(m=>out.push({t:"tpl",id:m.id,label:m.name}));
  const y=addDays(k,-1),ye=dayGet(y).e.filter(en=>en.slot===slot);
  if(ye.length)out.push({t:"yday",label:"wie gestern",n:ye.length});
  return out;
}

/* ---------- Bilder: Produktfoto (Open Food Facts) oder Symbol ---------- */
const ICONS=[[/\bei\b|eier|huehnerei/,"🥚"],[/kartoffel|pommes|kloss/,"🥔"],[/reis|basmati/,"🍚"],[/nudel|pasta|spaghetti|penne/,"🍝"],[/broetchen|semmel/,"🥯"],[/brot|toast/,"🍞"],
  [/hafer|flocken|muesli|porridge/,"🥣"],[/quark|joghurt|skyr|milch/,"🥛"],[/kaese/,"🧀"],[/whey|protein|shake/,"🥤"],[/sonnenblum|kuerbiskern|kern|samen|floh/,"🌻"],[/nuss|nuesse|mandel|erdnuss/,"🥜"],
  [/tofu|seitan|gluten|soja/,"🌱"],[/fisch|lachs|thunfisch|seelachs|hering|makrele|pollack|koehler/,"🐟"],[/haehnchen|huhn|pute|fleisch|rind|schwein|wurst/,"🍗"],[/oel|butter|margarine/,"🫒"],
  [/apfel/,"🍎"],[/banane/,"🍌"],[/beere/,"🫐"],[/tomate|passiert/,"🍅"],[/zwiebel|knoblauch/,"🧅"],[/moehre|karotte/,"🥕"],[/brokkoli|kohl/,"🥦"],[/salat|gurke|paprika|gemuese|spinat|erbse|bohne|linse/,"🥗"],
  [/schoko|kakao/,"🍫"],[/kuchen|keks/,"🍪"],[/pizza/,"🍕"],[/bier|wein/,"🍺"],[/kaffee/,"☕"],[/saft|limo|cola/,"🧃"],[/honig|zucker|marmelade/,"🍯"]];
function iconOf(f){
  if(f&&f.img)return `<img class="eic" src="${esc(f.img)}" alt="" loading="lazy">`;
  const n=norm(f?f.name:"");for(const [re,e] of ICONS)if(re.test(n))return `<span class="eic">${e}</span>`;
  return `<span class="eic">🍽️</span>`;
}

/* ---------- Bildschirm ---------- */
let curDay=today(),open={},editId=null,macro=null;
const MET={kcal:{n:"Kalorien",u:"kcal",c:"var(--accent)",goal:"kcal"},c:{n:"Kohlenhydrate",s:"KH",u:"g",c:"#FF5C93",goal:"c"},p:{n:"Eiweiß",s:"Eiweiß",u:"g",c:"#4DA3FF",goal:"p"},f:{n:"Fett",s:"Fett",u:"g",c:"#FF8A4C",goal:"f"}};
const RC=2*Math.PI*34;
function ringSvg(v,goal){const p=goal?Math.min(1,v/goal):0;return `<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" class="rbg"/><circle cx="40" cy="40" r="34" class="rfg" stroke-dasharray="${RC.toFixed(1)}" stroke-dashoffset="${(RC*(1-p)).toFixed(1)}"/></svg>`}
function ring(key,v,goal,sub){
  return `<button class="ering" data-m="${key}" style="--rc:${MET[key].c}"><span class="rwrap">${ringSvg(v,goal)}<span class="rin"><b>${goal?Math.round(v/goal*100):0}%</b><small>${MET[key].s}</small></span></span><span class="rsub">${sub}</span></button>`;
}
const dayLab=k=>{const t=today();return k===t?"Heute":k===addDays(t,-1)?"Gestern":k===addDays(t,1)?"Morgen":new Date(k+"T12:00").toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"})};
const gv=(n,m)=>m==="kcal"?nf(n.kcal):nf(n[m],1);
function renderEssen(){const y=window.scrollY;renderEssen0();if(Math.abs(window.scrollY-y)>1)window.scrollTo(0,y)}
function renderEssen0(){
  const el=$("essen");if(!el)return;
  const st=history.state;macro=st&&st.s==="essen"&&st.m?st.m:null;
  const t=today();
  $("eDate").textContent=curDay===t?"Heute":new Date(curDay+"T12:00").toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long"});
  let h="";for(let i=-14;i<=1;i++){const k=addDays(t,i),dt=new Date(k+"T12:00");
    const lab=i===0?"Heute":i===-1?"Gestern":i===1?"Morgen":dt.toLocaleDateString("de-DE",{weekday:"short"}).replace(".","");
    h+=`<button class="dtab eday${(E.days[k]&&E.days[k].e.length)?" has":""}" role="tab" data-d="${k}" aria-selected="${k===curDay}"><span class="nx">${lab}</span>${dt.getDate()}.</button>`}
  $("eDays").innerHTML=h;
  $("eDays").querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{curDay=b.dataset.d;editId=null;renderEssen()});
  const sd=$("eDays").querySelector('[aria-selected="true"]'),bar=$("eDays");if(sd)bar.scrollLeft=sd.offsetLeft-bar.offsetLeft-(bar.clientWidth-sd.offsetWidth)/2; // nur waagerecht, Seite bleibt stehen
  if(macro){renderMacro();renderSelBar();essenMeta();return}
  renderSum();
  const d=dayGet(curDay);let sh="";
  SLOTS.forEach(([sl,name])=>{
    const list=d.e.filter(en=>en.slot===sl),ss=sumE(list);
    sh+=`<section class="eslot" data-slothead="${sl}"><div class="eshead"><h3>${name}</h3><span class="esk">${list.length?nf(ss.kcal)+" kcal":""}</span><button class="ic eadd" data-add="${sl}" aria-label="${name}: hinzufügen">${PLUS}</button></div>`;
    if(!list.length){const sg=suggestions(sl,curDay);
      if(sg.length)sh+=`<div class="echips">${sg.map((x,i)=>`<button class="echip" data-sg="${sl}|${i}">＋ ${esc(x.label)}</button>`).join("")}</div>`;
    }else{
      sh+=`<div class="elist">`;const done={};
      list.forEach(en=>{
        if(en.g){if(done[en.g.id])return;done[en.g.id]=1;
          const gl=list.filter(x=>x.g&&x.g.id===en.g.id),gs=sumE(gl),op=!!open[en.g.id];
          const strip=gl.slice(0,6).map(x=>iconOf(E.foods[x.food]).replace('class="eic"','class="emini"')).join("")+(gl.length>6?`<span class="emore">+${gl.length-6}</span>`:"");
          sh+=`<div class="egrp${op?" open":""}"><div class="erow eghead${gl.every(x=>sel.has(x.id))?" sel":""}" data-gt="${en.g.id}"><span class="emeal"><span class="enm">${esc(en.g.name)}</span><span class="estrip">${strip}</span></span><span class="ev">${nf(gs.kcal)}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></div>`;
          if(op)sh+=`<div class="egin">`+gl.map(x=>rowH(x,true)).join("")+`<div class="egfoot"><button class="eaddin" data-gadd="${en.g.id}">＋ Zutat</button><button class="egm" data-gm="${en.g.id}" aria-label="Mahlzeit: mehr">${DOTS}</button></div></div>`;
          sh+=`</div>`;
        }else sh+=rowH(en);
      });
      sh+=`</div>`;
    }
    sh+=`</section>`;
  });
  $("eSlots").innerHTML=sh;
  bindSlots();
  essenMeta();
}
function renderSum(){
  const d=dayGet(curDay),s=sumE(d.e),G=E.goals,b=burned(curDay),goal=G.kcal+(E.burnIn?b.kcal:0),rest=goal-s.kcal;
  const left=(v,g)=>v<=g?nf(g-v)+" g übrig":nf(v)+"/"+nf(g)+" g";
  $("eSum").innerHTML=`<button class="ekcal" data-m="kcal"><span><b class="num">${nf(s.kcal)}</b> / ${nf(goal)} kcal</span><span class="erest${rest<0?" over":""}">${rest>=0?"noch "+nf(rest):nf(-rest)+" drüber"}</span><i class="ebar"><i style="width:${Math.min(100,s.kcal/goal*100).toFixed(1)}%"></i></i></button>
    <div class="erings">${ring("c",s.c,G.c,left(s.c,G.c))}${ring("p",s.p,G.p,left(s.p,G.p))}${ring("f",s.f,G.f,left(s.f,G.f))}</div>
    ${b.kcal?`<button class="eburn" id="eBurn">🔥 ${nf(b.kcal)} kcal Training <b>${E.burnIn?"✓":"+"}</b></button>`:""}`;
  $("eSum").hidden=false;
  $("eSum").querySelectorAll("[data-m]").forEach(x=>x.onclick=()=>openMacro(x.dataset.m));
  if($("eBurn"))$("eBurn").onclick=()=>{E.burnIn=!E.burnIn;esave();renderEssen();toast(E.burnIn?"Training aufs Ziel draufgerechnet":"Training nur als Info")};
}
/* Detailansicht pro Nährwert (wie in der alten App) – eigener Verlaufs-Eintrag, Zurück schließt sie */
function openMacro(m){history.pushState({s:"essen",m},"");renderEssen();window.scrollTo(0,0)}
function renderMacro(){
  const m=macro,M=MET[m],d=dayGet(curDay),s=sumE(d.e),G=E.goals,goal=G[M.goal]+(m==="kcal"&&E.burnIn?burned(curDay).kcal:0),v=s[m];
  $("eSum").hidden=false;
  $("eSum").innerHTML=`<div class="emac" style="--rc:${M.c}"><span class="rwrap big">${ringSvg(v,goal)}<span class="rin"><b>${goal?Math.round(v/goal*100):0}%</b><small>${M.s||"kcal"}</small></span></span>
    <div class="emacr"><div class="emsel">${Object.keys(MET).map(k=>`<button class="emb${k===m?" on":""}" data-mm="${k}" style="--rc:${MET[k].c}">${MET[k].s||"kcal"}</button>`).join("")}</div>
    <div class="emv"><span>Ziel</span><b>${nf(goal)} ${M.u}</b></div><div class="emv"><span>Gegessen</span><b>${gv(s,m)} ${M.u}</b></div><div class="emv"><span>${v<=goal?"Übrig":"Drüber"}</span><b style="color:var(--rc)">${nf(Math.abs(goal-v),m==="kcal"?0:1)} ${M.u}</b></div></div></div>`;
  $("eSum").querySelectorAll("[data-mm]").forEach(b=>b.onclick=()=>{history.replaceState({s:"essen",m:b.dataset.mm},"");renderEssen()});
  let h="";
  SLOTS.forEach(([sl,name])=>{
    const list=d.e.filter(en=>en.slot===sl);if(!list.length)return;
    const ss=sumE(list),pct=v?Math.round(ss[m]/v*100):0;
    h+=`<section class="eslot"><div class="eshead"><h3>${name}</h3><span class="esk" style="color:${M.c}">${gv(ss,m)} ${M.u} · ${pct}%</span></div><div class="elist">`;
    list.slice().sort((a,b)=>nut(E.foods[b.food],b.amt,b.u)[m]-nut(E.foods[a.food],a.amt,a.u)[m]).forEach(en=>{
      const f=E.foods[en.food],n=nut(f,en.amt,en.u),pcs=(f&&f.base==="stk")||en.u==="stk";
      h+=`<div class="erow emrow">${iconOf(f)}<span class="emeal"><span class="enm">${esc(foodName(f))}</span><span class="emsub"><b style="color:${M.c}">${gv(n,m)} ${M.u}</b> · ${nf(en.amt,1)} ${pcs?"Stk":"g"}</span></span></div>`;
    });
    h+=`</div></section>`;
  });
  $("eSlots").innerHTML=h||`<div class="note">Noch nichts eingetragen.</div>`;
}
function stepOf(f,u,amt){return (f&&f.base==="stk")||u==="stk"?0.5:amt<20?1:amt<200?5:10}
/* Waagerechtes Rad für Mengen: wischen, keine Tastatur */
const RW=56;
function rulerH(pcs){const vals=pcs?stkVals:gramVals;return `<div class="eruler"><div class="erscroll">${vals.map((v,i)=>`<span data-i="${i}">${nf(v,1)}</span>`).join("")}</div><i class="ermark"></i></div>`}
function bindRuler(box,obj,pcs,onChange){
  const sc=box.querySelector(".erscroll");if(!sc)return;const vals=pcs?stkVals:gramVals,items=[...sc.children];
  let i0=0;vals.forEach((v,i)=>{if(Math.abs(v-obj.amt)<Math.abs(vals[i0]-obj.amt))i0=i});
  let cur=i0,tmr=null;const mark=i=>items.forEach((s,j)=>s.className=j===i?"on":Math.abs(j-i)===1?"nb":"");
  mark(cur);requestAnimationFrame(()=>{sc.scrollLeft=cur*RW});sc.scrollLeft=cur*RW;
  sc.addEventListener("scroll",()=>{const i=Math.max(0,Math.min(vals.length-1,Math.round(sc.scrollLeft/RW)));
    if(i!==cur){cur=i;mark(i);obj.amt=vals[i];onChange(false)}
    clearTimeout(tmr);tmr=setTimeout(()=>{esave();onChange(true)},250)},{passive:true});
  items.forEach(s=>s.onclick=()=>sc.scrollTo({left:+s.dataset.i*RW,behavior:"smooth"}));
}
const DOTS='<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
const PLUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const CAM='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2"/><path d="M8 9v6M11 9v6M14 9v6M16.5 9v6"/></svg>';
const CALI='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>';
const BIN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
let sel=new Set();
function rowH(en,sub){
  const f=E.foods[en.food],n=nut(f,en.amt,en.u),pcs=(f&&f.base==="stk")||en.u==="stk",unit=pcs?"Stk":"g",ed=editId===en.id;
  return `<div class="eswipe"><div class="ebin">Löschen</div><div class="erow${sub?" sub":""}${ed?" editing":""}${sel.has(en.id)?" sel":""}" data-e="${en.id}">${iconOf(f)}<span class="enm">${esc(foodName(f))}</span><span class="epill${ed?" on":""}" data-pill="${en.id}">${nf(en.amt,1)} ${unit}</span><span class="ev">${nf(n.kcal)}</span></div></div>${ed?rulerH(pcs):""}`;
}
function bindSlots(){
  const S2=$("eSlots"),d=dayGet(curDay);
  S2.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>{if(!sel.size)openSearch({kind:"day",slot:b.dataset.add})});
  S2.querySelectorAll("[data-sg]").forEach(b=>{const [sl,i]=b.dataset.sg.split("|"),x=()=>suggestions(sl,curDay)[+i];
    gesture(b,{tap:()=>useSuggestion(x(),sl),long:()=>{const y=x();if(y&&y.t==="tpl"){buzz();tplSheet(y.id)}}})});
  S2.querySelectorAll("[data-gm]").forEach(b=>b.onclick=e=>{e.stopPropagation();if(!sel.size)grpView(b.dataset.gm,true)});
  S2.querySelectorAll("[data-gadd]").forEach(b=>b.onclick=()=>{const en=d.e.find(x=>x.g&&x.g.id===b.dataset.gadd);openSearch({kind:"grp",gid:b.dataset.gadd,slot:en?en.slot:"sn"})});
  S2.querySelectorAll("[data-e],[data-gt]").forEach(r=>{
    const ids=()=>r.dataset.e?[r.dataset.e]:d.e.filter(x=>x.g&&x.g.id===r.dataset.gt).map(x=>x.id);
    gesture(r,{
      tap:()=>{
        if(sel.size){const a=ids(),all=a.every(i=>sel.has(i));a.forEach(i=>all?sel.delete(i):sel.add(i));renderEssen();return}
        if(r.dataset.gt){open[r.dataset.gt]=!open[r.dataset.gt];renderEssen();return}
        editId=editId===r.dataset.e?null:r.dataset.e;renderEssen();
      },
      long:()=>{buzz();if(r.dataset.gt&&!sel.size){editId=null;grpView(r.dataset.gt);return}
        editId=null;ids().forEach(i=>sel.add(i));renderEssen()},
      swipe:r.dataset.e?()=>delWithUndo(d.e.filter(x=>x.id===r.dataset.e)):null
    });
  });
  const ru=S2.querySelector(".eruler");
  if(ru){const en=d.e.find(x=>x.id===editId),f=E.foods[en.food],pcs=(f&&f.base==="stk")||en.u==="stk",row=S2.querySelector(`[data-e="${editId}"]`);
    bindRuler(ru,en,pcs,()=>{row.querySelector(".epill").textContent=nf(en.amt,1)+(pcs?" Stk":" g");row.querySelector(".ev").textContent=nf(nut(f,en.amt,en.u).kcal);renderSum();
      const sec=row.closest("[data-slothead]"),sl=sec.dataset.slothead;sec.querySelector(".esk").textContent=nf(sumE(dayGet(curDay).e.filter(x=>x.slot===sl)).kcal)+" kcal"});
  }
  renderSelBar();
}
const buzz=()=>{try{navigator.vibrate&&navigator.vibrate(12)}catch(_){}};
/* Gesten: tippen · nach links wischen = löschen · lange drücken = auswählen */
function gesture(el,{tap,long,swipe}){
  el.addEventListener("pointerdown",ev=>{
    if(ev.button>0||ev.target.closest(".egm"))return;
    const x0=ev.clientX,y0=ev.clientY;let mode=null,dx=0;
    const lt=setTimeout(()=>{mode="long";long()},420);
    const mv=e=>{
      const ddx=e.clientX-x0,ddy=e.clientY-y0;
      if(!mode){
        if(swipe&&!sel.size&&Math.abs(ddx)>12&&Math.abs(ddx)>Math.abs(ddy)*1.5){clearTimeout(lt);mode="swipe"}
        else if(Math.hypot(ddx,ddy)>9){clearTimeout(lt);end(false);return}
        else return;
      }
      if(mode==="swipe"){dx=Math.min(0,ddx);el.style.transform=`translateX(${dx}px)`;el.parentElement.classList.toggle("armed",dx<-90)}
    };
    const end=(fire,e)=>{
      clearTimeout(lt);document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",cc);
      if(mode==="swipe"){el.parentElement.classList.remove("armed");
        if(fire&&dx<-90){el.style.transition="transform .18s";el.style.transform="translateX(-110%)";setTimeout(swipe,170)}
        else{el.style.transition="transform .18s";el.style.transform="";setTimeout(()=>el.style.transition="",200)}
        return}
      if(fire&&!mode)tap(e);
    };
    const up=e=>end(true,e),cc=()=>end(false);
    document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",cc);
  });
}
/* Auswahl-Leiste unten: Gestern · Kalender · Morgen · Löschen */
function renderSelBar(){
  let bar=$("eSelBar");const on=!!sel.size&&!$("essen").hidden&&!macro;document.body.classList.toggle("esel",on);
  if(!on){if(bar)bar.hidden=true;return}
  if(!bar){bar=document.createElement("div");bar.id="eSelBar";bar.className="edock";document.body.appendChild(bar)}
  bar.hidden=false;
  bar.innerHTML=`<div class="edhead"><span>${selCount()} ausgewählt</span><button data-sb="x">Fertig</button></div>
    <div class="edrow"><button class="edz" data-sb="prev"><b>‹</b><span>${dayLab(addDays(curDay,-1))}</span></button><button class="edz" data-sb="cal">${CALI}<span>Kalender</span></button><button class="edz" data-sb="next"><b>›</b><span>${dayLab(addDays(curDay,1))}</span></button><button class="edz del" data-sb="del">${BIN}<span>Löschen</span></button></div>`;
  bar.querySelectorAll("[data-sb]").forEach(b=>b.onclick=()=>{
    const a=b.dataset.sb,list=dayGet(curDay).e.filter(x=>sel.has(x.id));
    if(a==="x"){sel.clear();renderEssen();return}
    if(a==="del"){sel.clear();delWithUndo(list);return}
    if(a==="prev"||a==="next"){sel.clear();moveTo(list,addDays(curDay,a==="prev"?-1:1));return}
    if(a==="cal")calPop(k=>{sel.clear();copyEntries(list,k);esave();renderEssen();toast(`Dupliziert → ${dayLab(k)}`)});
  });
}
function selCount(){const g=new Set();let n=0;dayGet(curDay).e.forEach(x=>{if(!sel.has(x.id))return;if(x.g){if(!g.has(x.g.id)){g.add(x.g.id);n++}}else n++});return n}
function moveTo(list,k){
  const dd=day(curDay);copyEntries(list,k);dd.e=dd.e.filter(x=>!list.includes(x));tidyDay(curDay);esave();renderEssen();
  toast(`Verschoben → ${dayLab(k)}`);
}
/* schlanker Kalender ohne abgedunkelten Hintergrund */
function calPop(onPick){
  let c=$("eCal");if(!c){c=document.createElement("div");c.id="eCal";c.className="ecal";document.body.appendChild(c)}
  let [y,m]=curDay.split("-").map(Number);m--;
  const draw=()=>{
    const first=new Date(y,m,1),start=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),t=today();
    let g="";for(let i=0;i<start;i++)g+="<i></i>";
    for(let dnum=1;dnum<=days;dnum++){const k=ymd(new Date(y,m,dnum));g+=`<button class="${k===t?"tdy":""}${k===curDay?" cur":""}${E.days[k]&&E.days[k].e.length?" has":""}" data-ck="${k}">${dnum}</button>`}
    c.innerHTML=`<div class="ecalh"><button data-cm="-1" aria-label="Monat zurück">‹</button><b>${first.toLocaleDateString("de-DE",{month:"long",year:"numeric"})}</b><button data-cm="1" aria-label="Monat vor">›</button></div><div class="ecalw">${["Mo","Di","Mi","Do","Fr","Sa","So"].map(w=>`<span>${w}</span>`).join("")}</div><div class="ecalg">${g}</div>`;
    c.querySelectorAll("[data-cm]").forEach(b=>b.onclick=e=>{e.stopPropagation();m+=+b.dataset.cm;if(m<0){m=11;y--}if(m>11){m=0;y++}draw()});
    c.querySelectorAll("[data-ck]").forEach(b=>b.onclick=e=>{e.stopPropagation();close();onPick(b.dataset.ck)});
  };
  const out=e=>{if(!c.contains(e.target))close()};
  const close=()=>{c.hidden=true;document.removeEventListener("pointerdown",out,true)};
  draw();c.hidden=false;setTimeout(()=>document.addEventListener("pointerdown",out,true),0);
}

/* Löschen mit Rückgängig */
let undoT=null;
function delWithUndo(list){
  const dd=day(curDay),k=curDay,snap=dd.e.slice();
  dd.e=dd.e.filter(x=>!list.includes(x));tidyDay(k);esave();editId=null;renderEssen();
  let u=$("eUndo");if(!u){u=document.createElement("div");u.id="eUndo";u.className="eundo";document.body.appendChild(u)}
  u.innerHTML=`<span>${esc(list.length===1?foodName(E.foods[list[0].food]):list.length+" Einträge")} gelöscht</span><button>Rückgängig</button>`;u.hidden=false;
  u.querySelector("button").onclick=()=>{day(k).e=snap;esave();u.hidden=true;renderEssen()};
  clearTimeout(undoT);undoT=setTimeout(()=>u.hidden=true,4000);
}

/* ---------- Einfügen ---------- */
function insertTpl(tid,k,slot,quiet){
  const t=E.meals[tid];if(!t)return;
  const gid=nid();day(k).e.push(...t.items.filter(it=>E.foods[it.food]).map(it=>({id:nid(),slot,food:it.food,amt:it.amt,u:it.u,g:{id:gid,name:t.name,tpl:t.id}})));
  esave();if(!quiet){renderEssen();toast("„"+t.name+"“ eingefügt")}
  return gid;
}
function copyEntries(list,k,slot){
  const gm={};
  day(k).e.push(...list.map(en=>{const x={id:nid(),slot:slot||en.slot,food:en.food,amt:en.amt};if(en.u)x.u=en.u;
    if(en.g){gm[en.g.id]=gm[en.g.id]||nid();x.g={id:gm[en.g.id],name:en.g.name};if(en.g.tpl)x.g.tpl=en.g.tpl}return x}));
  esave();
}
function useSuggestion(x,sl){
  if(!x)return;
  if(x.t==="tpl")return insertTpl(x.id,curDay,sl);
  if(x.t==="yday"){copyEntries(dayGet(addDays(curDay,-1)).e.filter(en=>en.slot===sl),curDay,sl);renderEssen();toast(SLOTN[sl]+" wie gestern eingetragen")}
}

/* ---------- Drehrad (gleiches Aussehen wie im Training) ---------- */
const gramVals=(()=>{const a=[];for(let v=1;v<20;v++)a.push(v);for(let v=20;v<300;v+=5)a.push(v);for(let v=300;v<1000;v+=10)a.push(v);for(let v=1000;v<=2000;v+=50)a.push(v);return a})();
const stkVals=(()=>{const a=[];for(let v=0.5;v<=20;v+=0.5)a.push(v);return a})();
function wheelH(label,vals,unit){
  return `<div class="wheelrow ewheel"><div class="wl"><span>${esc(label)}</span><input class="eamt" id="eAmtIn" type="number" inputmode="decimal" step="any" min="0" aria-label="Menge eintippen"></div>
  <div class="wheelbox"><button class="wbtn" data-d="-1" aria-label="weniger">−</button><div class="wheelwrap"><div class="wheel" tabindex="0" role="spinbutton" aria-label="${esc(label)}">${vals.map((v,i)=>`<div data-i="${i}"><b>${nf(v,1)}</b><small>${unit}</small></div>`).join("")}</div></div><button class="wbtn" data-d="1" aria-label="mehr">+</button></div></div>`;
}
function wheelInit(row,vals,get,set){
  const w=row.querySelector(".wheel"),items=[...w.children],inp=row.querySelector(".eamt");
  const near=v=>{let b=0;vals.forEach((x,i)=>{if(Math.abs(x-v)<Math.abs(vals[b]-v))b=i});return b};
  let shown=near(get()),tmr=null,prog=false;
  const mark=i=>items.forEach((d,j)=>d.className=j===i?"on":Math.abs(j-i)===1?"nb":"");
  const jump=(i,smooth)=>{prog=!smooth;w.scrollTo({top:i*44,behavior:smooth?"smooth":"auto"})};
  requestAnimationFrame(()=>{w.scrollTop=shown*44});w.scrollTop=shown*44;mark(shown);inp.value=get();
  w.addEventListener("scroll",()=>{
    const i=Math.max(0,Math.min(vals.length-1,Math.round(w.scrollTop/44)));
    if(i!==shown){shown=i;mark(i)}
    clearTimeout(tmr);tmr=setTimeout(()=>{if(prog){prog=false;return}if(get()!==vals[i]){set(vals[i]);inp.value=vals[i]}},140);
  },{passive:true});
  items.forEach(d=>d.onclick=()=>jump(+d.dataset.i,true));
  row.querySelectorAll(".wbtn").forEach(b=>b.onclick=()=>jump(Math.max(0,Math.min(vals.length-1,shown+(+b.dataset.d))),true));
  inp.addEventListener("input",()=>{const v=parseFloat(String(inp.value).replace(",","."));if(!(v>0))return;set(v);const i=near(v);if(i!==shown){shown=i;mark(i);jump(i,false)}});
}

/* ---------- Menge: hinzufügen / ändern ---------- */
/* o: {mode:"add",food,ctx} | {mode:"edit",id} | {mode:"tplitem",tid,i} */
function openAmount(o){
  let en=null,f,amt,u,title,eyebrow;
  if(o.mode==="edit"){en=dayGet(curDay).e.find(x=>x.id===o.id);if(!en)return;f=E.foods[en.food];amt=en.amt;u=en.u;eyebrow=(en.g?en.g.name+" · ":"")+SLOTN[en.slot]}
  else if(o.mode==="tplitem"){const it=E.meals[o.tid].items[o.i];f=E.foods[it.food];amt=it.amt;u=it.u;eyebrow="Vorlage · "+E.meals[o.tid].name}
  else{f=o.food;u=f.du||(f.base==="stk"?undefined:undefined);amt=f.def||(f.base==="stk"||u==="stk"?1:100);eyebrow=o.ctx.kind==="tpl"?"Vorlage · "+E.meals[o.ctx.tid].name:o.ctx.kind==="grp"?"Zutat":SLOTN[o.ctx.slot]}
  if(!f){toast("Lebensmittel fehlt");return}
  title=f.name+(f.brand?" · "+f.brand:"");
  const canStk=f.base==="g"&&f.stkG;
  const draw=()=>{
    const pieces=f.base==="stk"||u==="stk";
    const per=f.base==="stk"?"pro Stück":"pro 100 g";
    const body=openSheet(eyebrow,title,
      `<div class="enut" id="eNut"></div>`+
      (canStk?`<div class="seg"><button class="sbtn" data-u="g" aria-pressed="${!pieces}">Gramm</button><button class="sbtn" data-u="stk" aria-pressed="${pieces}">Stück (${nf(f.stkG)} g)</button></div>`:"")+
      wheelH(pieces?"Stück":"Gramm",pieces?stkVals:gramVals,pieces?"Stk":"g")+
      `<div class="note">${per}: ${nf(f.kcal)} kcal · ${nf(f.p,1)} g E · ${nf(f.c,1)} g KH · ${nf(f.f,1)} g F${f.src==="bls"?" · Quelle BLS":f.src==="off"?" · Quelle Open Food Facts":""}</div>`+
      (o.mode==="add"?`<button class="btn primary big" id="eOk">Hinzufügen</button>`:
       o.mode==="edit"?`<button class="btn primary big" id="eOk">Fertig</button><div class="row2"><button class="btn" id="eCopy">Kopieren …</button><button class="btn danger" id="eDel">Löschen</button></div>`:
       `<button class="btn primary big" id="eOk">Fertig</button><button class="btn danger" id="eDel">Aus Vorlage entfernen</button>`)+
      `<button class="btn ghost" id="eFood">Lebensmittel bearbeiten</button>`);
    const upd=()=>{const n=nut(f,amt,u);$("eNut").innerHTML=`<span><b class="num">${nf(n.kcal)}</b> kcal</span><span><b class="num">${nf(n.p,1)}</b> g Eiweiß</span><span>${nf(n.f,1)} g F · ${nf(n.c,1)} g KH</span>`};
    upd();
    wheelInit(body.querySelector(".ewheel"),pieces?stkVals:gramVals,()=>amt,v=>{amt=v;upd();if(o.mode!=="add")commit(false)});
    body.querySelectorAll("[data-u]").forEach(b=>b.onclick=()=>{const nu=b.dataset.u==="stk"?"stk":undefined;if(nu===u)return;
      amt=nu==="stk"?Math.max(0.5,Math.round(amt/f.stkG*2)/2):Math.round(amt*f.stkG);u=nu;if(o.mode!=="add")commit(false);draw()});
    $("eOk").onclick=()=>{commit(true)};
    if($("eDel"))$("eDel").onclick=()=>{
      if(o.mode==="edit"){const d=day(curDay);d.e=d.e.filter(x=>x!==en);tidyDay(curDay);esave();closeSheet();renderEssen();toast("Gelöscht")}
      else{E.meals[o.tid].items.splice(o.i,1);esave();closeSheet();setTimeout(()=>tplSheet(o.tid),60)}};
    if($("eCopy"))$("eCopy").onclick=()=>copySheet([en],"Eintrag");
    $("eFood").onclick=()=>foodForm(f,()=>openAmount(o));
  };
  const commit=(close)=>{
    if(o.mode==="edit"){en.amt=amt;if(u)en.u=u;else delete en.u;esave();if(close){closeSheet();renderEssen()}}
    else if(o.mode==="tplitem"){const it=E.meals[o.tid].items[o.i];it.amt=amt;if(u)it.u=u;else delete it.u;esave();if(close){closeSheet();setTimeout(()=>tplSheet(o.tid),60)}}
    else if(close){
      if(!E.foods[f.id])E.foods[f.id]=f; // BLS / Open Food Facts → in die eigene Liste
      const x={food:f.id,amt};if(u)x.u=u;
      const c=o.ctx;
      if(c.kind==="tpl"){E.meals[c.tid].items.push(x);esave();closeSheet();setTimeout(()=>tplSheet(c.tid),60);return}
      const ne=Object.assign({id:nid(),slot:c.slot},x);
      if(c.kind==="grp"){const g=dayGet(curDay).e.find(y=>y.g&&y.g.id===c.gid);if(g){ne.g=Object.assign({},g.g);ne.slot=g.slot;open[c.gid]=true}}
      day(curDay).e.push(ne);esave();closeSheet();renderEssen();toast(f.name+" eingetragen");
    }
  };
  draw();
}

/* ---------- Kopieren / Verschieben ---------- */
function copySheet(list,what,onDone){
  if(!list.length)return;
  const t=today();let tk=curDay===t?addDays(t,1):t,ts=list[0].slot;
  const opts=[];for(let i=-7;i<=7;i++)opts.push(addDays(t,i));
  const lab=k=>k===t?"Heute":k===addDays(t,-1)?"Gestern":k===addDays(t,1)?"Morgen":new Date(k+"T12:00").toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"});
  const draw=()=>{
    openSheet("Kopieren / Verschieben",what,
      `<h3>Auf welchen Tag?</h3><div class="days ecdays">${opts.map(k=>`<button class="dtab" data-ck="${k}" aria-selected="${k===tk}">${lab(k)}</button>`).join("")}</div>
       <h3>In welche Mahlzeit?</h3><div class="seg eslotseg">${SLOTS.map(([s,n])=>`<button class="sbtn" data-cs="${s}" aria-pressed="${s===ts}">${n}</button>`).join("")}</div>
       <button class="btn primary big" id="cCopy">Kopieren</button><button class="btn" id="cMove">Verschieben</button>`);
    const sel=$("shBody").querySelector('[data-ck][aria-selected="true"]');if(sel)sel.scrollIntoView({inline:"center",block:"nearest"});
    $("shBody").querySelectorAll("[data-ck]").forEach(b=>b.onclick=()=>{tk=b.dataset.ck;draw()});
    $("shBody").querySelectorAll("[data-cs]").forEach(b=>b.onclick=()=>{ts=b.dataset.cs;draw()});
    $("cCopy").onclick=()=>{copyEntries(list,tk,ts);closeSheet();renderEssen();toast("Kopiert → "+lab(tk)+", "+SLOTN[ts]);if(onDone)onDone()};
    $("cMove").onclick=()=>{const src=day(curDay);src.e=src.e.filter(x=>!list.includes(x));copyEntries(list,tk,ts);tidyDay(curDay);esave();closeSheet();renderEssen();toast("Verschoben → "+lab(tk)+", "+SLOTN[ts]);if(onDone)onDone()};
  };
  draw();
}

/* ---------- Mahlzeit-Ansicht (lange drücken): Nährwerte oben, Zutaten mit Rad, ＋ Zutat ----------
   Gleiche Ansicht für eine Mahlzeit im Tag (grpView) und eine Vorlage (tplSheet). */
function nutHead(s){const G=E.goals;
  const cell=k=>`<div class="emc" style="--rc:${MET[k].c}"><b class="num">${k==="kcal"?nf(s.kcal):nf(s[k],1)}</b><small>${MET[k].s||"kcal"}</small><i><i style="width:${Math.min(100,s[k]/(G[k]||1)*100).toFixed(0)}%"></i></i></div>`;
  return cell("kcal")+cell("c")+cell("p")+cell("f")}
let mEd=-1;
function mealSheet(c){
  mEd=-1;
  const draw=keep=>{
    const items=c.items();if(mEd>=items.length)mEd=-1;
    const y=keep?$("shBody").scrollTop:0;
    const body=openSheet(c.eyebrow,c.title(),`<div class="emnut" id="mNut">${nutHead(sumE(items))}</div>${c.top?c.top():""}
      <div class="elist emlist">${items.map((it,i)=>{const f=E.foods[it.food],pcs=(f&&f.base==="stk")||it.u==="stk",ed=i===mEd;
        return `<div class="erow${ed?" editing":""}" data-mi="${i}">${iconOf(f)}<span class="enm">${esc(foodName(f))}</span><span class="epill${ed?" on":""}">${nf(it.amt,1)} ${pcs?"Stk":"g"}</span><span class="ev">${nf(nut(f,it.amt,it.u).kcal)}</span>${ed?`<button class="ermv" data-mx="${i}" aria-label="Zutat entfernen">×</button>`:""}</div>${ed?rulerH(pcs):""}`}).join("")}
        <button class="eaddin emadd" id="mAdd">＋ Zutat</button></div>${c.actions()}`,{onClose:c.onClose});
    body.scrollTop=y;
    body.querySelectorAll("[data-mi]").forEach(r=>r.onclick=e=>{if(e.target.closest("[data-mx]"))return;const i=+r.dataset.mi;mEd=mEd===i?-1:i;draw(true)});
    body.querySelectorAll("[data-mx]").forEach(b=>b.onclick=()=>{const it=items[+b.dataset.mx];mEd=-1;c.remove(it);esave();if(c.items().length||c.keepEmpty)draw(true);else{closeSheet()}});
    const ru=body.querySelector(".eruler");
    if(ru){const it=items[mEd],f=E.foods[it.food],pcs=(f&&f.base==="stk")||it.u==="stk",row=body.querySelector(`[data-mi="${mEd}"]`);
      bindRuler(ru,it,pcs,()=>{row.querySelector(".epill").textContent=nf(it.amt,1)+(pcs?" Stk":" g");row.querySelector(".ev").textContent=nf(nut(f,it.amt,it.u).kcal);$("mNut").innerHTML=nutHead(sumE(c.items()))})}
    $("mAdd").onclick=c.add;
    if(c.bind)c.bind(body,draw);
  };
  draw(false);
}
/* Mahlzeit im Tag (Kopie) */
function grpView(gid,full){
  const gl=()=>dayGet(curDay).e.filter(x=>x.g&&x.g.id===gid);
  const first=gl()[0];if(!first)return;
  const g=()=>(gl()[0]||first).g,tpl=()=>g().tpl&&E.meals[g().tpl];
  const toTpl=list=>list.map(x=>{const it={food:x.food,amt:x.amt};if(x.u)it.u=x.u;return it});
  mealSheet({eyebrow:SLOTN[first.slot],title:()=>g().name,items:gl,
    remove:it=>{const d=day(curDay);d.e=d.e.filter(x=>x!==it);tidyDay(curDay)},
    add:()=>openSearch({kind:"grp",gid,slot:first.slot,back:()=>grpView(gid,full)}),
    onClose:()=>renderEssen(),
    actions:()=>!full?`<div class="emact"><button class="btn" id="gCopy">Kopieren …</button><button class="btn danger" id="gDel">Löschen</button></div>`:`<div class="emact">${tpl()?`<button class="btn" id="gUpd">Vorlage speichern</button>`:""}<button class="btn" id="gNew">Neue Vorlage</button>
      <button class="btn" id="gRen">Umbenennen</button><button class="btn" id="gCopy">Kopieren …</button>
      <button class="btn ghost" id="gSplit">Auflösen</button><button class="btn danger" id="gDel">Löschen</button></div>`,
    bind:(body,draw)=>{
      $("gDel").onclick=()=>{const list=gl();closeSheet();delWithUndo(list)};
      $("gCopy").onclick=()=>copySheet(gl(),g().name);
      if(!full)return;
      if($("gUpd"))$("gUpd").onclick=()=>{tpl().items=toTpl(gl());esave();toast("„"+tpl().name+"“ aktualisiert")};
      $("gNew").onclick=()=>askName("Neue Vorlage",g().name+(tpl()?" (neu)":""),n=>{const id=nid();E.meals[id]={id,name:n,slot:first.slot,items:toTpl(gl())};gl().forEach(x=>x.g.tpl=id);esave();toast("Vorlage „"+n+"“ gespeichert");grpView(gid,true)});
      $("gRen").onclick=()=>askName("Umbenennen",g().name,n=>{gl().forEach(x=>x.g.name=n);esave();grpView(gid,true)});
      $("gSplit").onclick=()=>{gl().forEach(x=>delete x.g);esave();closeSheet()};
    }});
}
function slotSheet(sl){
  const d=day(curDay),list=d.e.filter(x=>x.slot===sl);if(!list.length)return;
  openSheet("Mahlzeit",SLOTN[sl],`<button class="btn" id="sCopy">Alles kopieren / verschieben</button><button class="btn" id="sTpl">Als Vorlage speichern</button><button class="btn danger" id="sDel">Alles löschen</button>`);
  $("sCopy").onclick=()=>copySheet(list,SLOTN[sl]);
  $("sTpl").onclick=()=>askName("Neue Vorlage",SLOTN[sl],n=>{const id=nid();E.meals[id]={id,name:n,slot:sl,items:list.map(x=>{const it={food:x.food,amt:x.amt};if(x.u)it.u=x.u;return it})};esave();toast("Vorlage „"+n+"“ gespeichert")});
  $("sDel").onclick=()=>{d.e=d.e.filter(x=>x.slot!==sl);tidyDay(curDay);esave();closeSheet();renderEssen()};
}
function askName(title,val,cb){
  openSheet("",title,`<label class="field"><span>Name</span><input id="nmIn" value="${esc(val)}" maxlength="40"></label><button class="btn primary big" id="nmOk">Speichern</button>`);
  const i=$("nmIn");setTimeout(()=>{i.focus();i.select()},50);
  const go=()=>{const n=i.value.trim();if(!n)return;closeSheet();cb(n)};
  $("nmOk").onclick=go;i.onkeydown=e=>{if(e.key==="Enter")go()};
}

/* ---------- Suche: eigene Liste · BLS · Open Food Facts – bleibt offen, mehrere Sachen nacheinander ---------- */
const norm=s=>String(s||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim();
const qMatch=(n,toks)=>toks.every(t=>n.includes(t));
function score(n,toks){let s=0;const w=" "+n;toks.forEach(t=>{if(w.includes(" "+t))s+=2});if(n.startsWith(toks[0]))s+=3;return s-n.length/40}
let BLS=null,blsP=null;
function loadBLS(){if(BLS)return Promise.resolve(BLS);if(!blsP)blsP=fetch("bls.json").then(r=>r.json()).then(a=>{BLS=a.map(x=>({code:x[0],name:x[1],kcal:x[2],p:x[3],c:x[4],f:x[5],fib:x[6],n:norm(x[1])}));return BLS}).catch(e=>{blsP=null;throw e});return blsP}
const blsFood=b=>({id:"bls:"+b.code,name:b.name,brand:"",base:"g",src:"bls",kcal:b.kcal,p:b.p,c:b.c,f:b.f,fib:b.fib});
let searchCtx=null,offRes=[],added={},addedN=0,edKey=null,sTab="f";
/* keep = gemerkter Stand (nach „Mahlzeit ansehen“ zurück in die Suche) */
function openSearch(ctx,keep){
  searchCtx=ctx;if(!keep){offRes=[];added={};addedN=0;edKey=null;sTab="f"}
  const where=ctx.kind==="tpl"?E.meals[ctx.tid].name:ctx.kind==="grp"?"Zur Mahlzeit":SLOTN[ctx.slot]+(curDay===today()?"":" · "+dayLab(curDay));
  openSheet("",where,`<div class="esbar"><input class="pksearch" id="eQ" type="search" placeholder="Suchen …" autocomplete="off" enterkeyhint="search"><button class="ic" id="eScan" aria-label="Barcode scannen">${CAM}</button><div class="seg etabs" id="eTabs"></div></div><div id="eRes"></div><div class="edone"><button class="btn primary big" id="eDone">Fertig</button></div>`,
    {onClose:()=>{const c=searchCtx;searchCtx=null;renderEssen();if(c&&c.back)setTimeout(c.back,60);else if(c&&c.kind==="tpl")setTimeout(()=>tplSheet(c.tid),60)}});
  const q=$("eQ");let t=null;if(keep&&keep.q)q.value=keep.q;
  q.addEventListener("input",()=>{clearTimeout(t);offRes=[];t=setTimeout(drawRes,120)});
  q.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();q.blur();if(q.value.trim().length>=2)searchOFF(q.value.trim())}});
  $("eScan").onclick=()=>scanSheet();
  $("eDone").onclick=closeSheet;
  drawRes();loadBLS().then(()=>{if(searchCtx===ctx&&$("eQ"))drawRes()}).catch(()=>{});
}
/* fügt hinzu und gibt das Objekt zurück, dessen amt/u man danach ändern kann */
function snapSearch(){return {ctx:searchCtx,added,addedN,offRes,tab:sTab,q:$("eQ")?$("eQ").value:""}}
function restoreSearch(st){added=st.added;addedN=st.addedN;offRes=st.offRes||[];sTab=st.tab;edKey=null;openSearch(st.ctx,st)}
function addFood(f,ctx){
  if(!E.foods[f.id])E.foods[f.id]=f;
  const x={food:f.id,amt:f.def||(f.base==="stk"||f.du==="stk"?1:100)};if(f.du==="stk"&&f.base==="g"&&f.stkG)x.u="stk";
  if(ctx.kind==="tpl"){E.meals[ctx.tid].items.push(x);esave();return x}
  const ne=Object.assign({id:nid(),slot:ctx.slot},x);
  if(ctx.kind==="grp"){const g=dayGet(curDay).e.find(y=>y.g&&y.g.id===ctx.gid);if(g){ne.g=Object.assign({},g.g);ne.slot=g.slot;open[ctx.gid]=true}}
  day(curDay).e.push(ne);esave();return ne;
}
function unTpl(gid){const d=day(curDay);d.e=d.e.filter(x=>!(x.g&&x.g.id===gid));tidyDay(curDay);esave()}
function removeAdded(obj,ctx){
  if(ctx.kind==="tpl"){const it=E.meals[ctx.tid].items;const i=it.indexOf(obj);if(i>=0)it.splice(i,1)}
  else{const d=day(curDay);d.e=d.e.filter(x=>x!==obj);tidyDay(curDay)}
  esave();
}
function drawRes(){
  const box=$("eRes");if(!box||!searchCtx)return;const ctx=searchCtx,raw=$("eQ").value,toks=norm(raw).split(" ").filter(Boolean);
  const u=usage(ctx.slot),uAll=usage(null),pick={};
  const foodRow=(f,key)=>{pick[key]=f;const a=added[key];
    if(a){const pcs=f.base==="stk"||a.u==="stk",ed=edKey===key;return `<div class="erow eadded${ed?" editing":""}" data-key="${esc(key)}">${iconOf(f)}<span class="enm">${esc(f.name)}</span><span class="epill on" data-ek="${esc(key)}">${nf(a.amt,1)} ${pcs?"Stk":"g"}</span><span class="echeck">✓</span></div>${ed?rulerH(pcs):""}`}
    return `<button class="erow" data-pick="${esc(key)}">${iconOf(f)}<span class="enm">${esc(f.name)}${f.brand?` <small>${esc(f.brand)}</small>`:""}</span><span class="ev">${nf(f.kcal)}</span><span class="eplus">${PLUS}</span></button>`};
  const tplRow2=m=>{const k="t:"+m.id,s=sumE(m.items),strip=m.items.slice(0,7).map(x=>iconOf(E.foods[x.food]).replace('class="eic"','class="emini"')).join("")+(m.items.length>7?`<span class="emore">+${m.items.length-7}</span>`:"");
    return `<div class="erow emrow2${added[k]?" eadded":""}" data-tpl="${m.id}"><span class="emeal"><span class="enm">${esc(m.name)}</span><span class="estrip">${strip}</span></span><span class="ev">${nf(s.kcal)}</span>${added[k]?`<span class="echeck">✓</span>`:`<span class="eplus">${PLUS}</span>`}</div>`};
  const isDay=ctx.kind==="day",tabs=$("eTabs");
  if(tabs){tabs.hidden=!isDay;if(isDay){const nm=Object.keys(E.meals).length;
    tabs.innerHTML=`<button class="sbtn" data-tab="f" aria-pressed="${sTab==="f"}">Lebensmittel</button><button class="sbtn" data-tab="m" aria-pressed="${sTab==="m"}">Mahlzeiten <small>${nm}</small></button>`;
    tabs.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{sTab=b.dataset.tab;edKey=null;drawRes();$("shBody").scrollTop=0})}}
  let h="";
  if(isDay&&sTab==="m"){
    const ms=Object.values(E.meals).filter(m=>!toks.length||qMatch(norm(m.name+" "+m.items.map(x=>foodName(E.foods[x.food])).join(" ")),toks))
      .sort((a,b)=>(u.me[b.id]||0)-(u.me[a.id]||0)||(b.slot===ctx.slot)-(a.slot===ctx.slot)||a.name.localeCompare(b.name));
    h+=ms.length?`<div class="list elist">${ms.map(tplRow2).join("")}</div>`:`<div class="note">Keine Mahlzeit gefunden.</div>`;
    h+=`<button class="btn ghost" id="eNewM">＋ Neue Mahlzeit</button>`;
  }else if(!toks.length){
    const fs=Object.values(E.foods).sort((a,b)=>((u.fo[b.id]||0)*3+(uAll.fo[b.id]||0))-((u.fo[a.id]||0)*3+(uAll.fo[a.id]||0))||a.name.localeCompare(b.name));
    h+=`<div class="list elist">${fs.slice(0,40).map(f=>foodRow(f,f.id)).join("")}</div>`;
  }else{
    const ms=Object.values(E.meals).filter(m=>qMatch(norm(m.name),toks));
    if(ctx.kind==="day"&&ms.length)h+=`<div class="list elist">${ms.map(tplRow2).join("")}</div>`;
    const own=Object.values(E.foods).filter(f=>qMatch(norm(f.name+" "+(f.brand||"")),toks)).sort((a,b)=>(uAll.fo[b.id]||0)-(uAll.fo[a.id]||0));
    const rows=own.slice(0,20).map(f=>foodRow(f,f.id));
    offRes.forEach((f,i)=>{if(!E.foods[f.id])rows.push(foodRow(f,f.id))});
    if(BLS){const ownB=new Set(own.map(f=>f.id));
      BLS.filter(b=>!ownB.has("bls:"+b.code)&&qMatch(b.n,toks)).map(b=>[score(b.n,toks),b]).sort((a,b)=>b[0]-a[0]).slice(0,30).forEach(([,b])=>rows.push(foodRow(blsFood(b),"bls:"+b.code)));
    }
    h+=rows.length?`<div class="list elist">${rows.join("")}</div>`:BLS?`<div class="note">Nichts gefunden.</div>`:"";
    h+=`<button class="btn ghost" id="eOff">🌐 Marken online suchen</button>`;
  }
  if(!(isDay&&sTab==="m"))h+=`<button class="btn ghost" id="eNew">＋ Neues Lebensmittel</button>`;
  box.innerHTML=h;
  $("eDone").textContent=addedN?`Fertig · ${addedN} hinzugefügt`:"Fertig";
  box.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{const k=b.dataset.pick,f=E.foods[pick[k].id]||pick[k];added[k]=addFood(f,ctx);addedN++;edKey=null;drawRes()});
  box.querySelectorAll("[data-ek]").forEach(b=>b.onclick=()=>{edKey=edKey===b.dataset.ek?null:b.dataset.ek;drawRes()});
  box.querySelectorAll(".eadded[data-key]").forEach(r=>r.onclick=e=>{if(e.target.closest("[data-ek]"))return;const k=r.dataset.key;removeAdded(added[k],ctx);delete added[k];addedN--;if(edKey===k)edKey=null;drawRes()});
  box.querySelectorAll(".eadded.editing[data-key]").forEach(r=>{const k=r.dataset.key,a=added[k],f=pick[k],pcs=f.base==="stk"||a.u==="stk";bindRuler(r.nextElementSibling,a,pcs,()=>{r.querySelector(".epill").textContent=nf(a.amt,1)+(pcs?" Stk":" g")})});
  box.querySelectorAll("[data-tpl]").forEach(b=>gesture(b,{
    tap:()=>{const k="t:"+b.dataset.tpl;if(added[k]){unTpl(added[k]);delete added[k];addedN--;drawRes();return}if(!E.meals[b.dataset.tpl].items.length){tplSheet(b.dataset.tpl,snapSearch());return}added[k]=insertTpl(b.dataset.tpl,curDay,ctx.slot,true);addedN++;drawRes()},
    long:()=>{buzz();tplSheet(b.dataset.tpl,snapSearch())}}));
  if($("eNewM"))$("eNewM").onclick=()=>{const st=snapSearch();askName("Neue Mahlzeit",$("eQ").value.trim(),n=>{const id=nid();E.meals[id]={id,name:n,slot:ctx.slot,items:[]};esave();tplSheet(id,st)})};
  if($("eOff"))$("eOff").onclick=()=>searchOFF(raw.trim());
  if($("eNew"))$("eNew").onclick=()=>{const c=searchCtx;searchCtx=null;foodForm({name:raw.trim()},f=>{openSearch(c);added[f.id]=addFood(f,c);addedN=1;drawRes()})};
}
const PLUS_S='<span class="eplus">'+PLUS+'</span>';

/* Open Food Facts (online). Markenprodukte, Name oder Barcode */
const OFF="https://world.openfoodfacts.org";
const OFF_FIELDS="code,product_name,product_name_de,brands,nutriments,serving_quantity,image_front_small_url,image_front_thumb_url";
function offFood(p){
  const n=p.nutriments||{},k=n["energy-kcal_100g"]!=null?+n["energy-kcal_100g"]:n["energy_100g"]!=null?+n["energy_100g"]/4.184:null;
  const name=(p.product_name_de||p.product_name||"").trim();if(!name||k==null)return null;
  const r=v=>Math.round((+v||0)*10)/10;
  return {id:"off:"+p.code,name,brand:(p.brands||"").split(",")[0].trim(),base:"g",src:"off",code:p.code,kcal:Math.round(k),p:r(n.proteins_100g),c:r(n.carbohydrates_100g),f:r(n.fat_100g),fib:r(n.fiber_100g),def:p.serving_quantity?Math.round(+p.serving_quantity):undefined,img:p.image_front_thumb_url||p.image_front_small_url||undefined};
}
async function searchOFF(q){
  if(!q)return;const b=$("eOff");if(b){b.disabled=true;b.textContent="Suche online …"}
  try{
    const url=OFF+"/cgi/search.pl?search_terms="+encodeURIComponent(q)+"&search_simple=1&action=process&json=1&page_size=25&fields="+OFF_FIELDS+"&tagtype_0=countries&tag_contains_0=contains&tag_0=germany";
    const r=await fetch(url);if(!r.ok)throw new Error(r.status);const j=await r.json();
    offRes=(j.products||[]).map(offFood).filter(Boolean);
    if(!offRes.length)toast("Online nichts gefunden");
  }catch(e){toast("Open Food Facts nicht erreichbar")}
  drawRes();
}
async function offByCode(code){
  const own=Object.values(E.foods).find(f=>f.code===code);if(own)return own;
  const r=await fetch(OFF+"/api/v2/product/"+encodeURIComponent(code)+".json?fields="+OFF_FIELDS);
  if(!r.ok)return null;const j=await r.json();return j.status===1?offFood(Object.assign({code},j.product)):null;
}

/* Barcode: Kamera (BarcodeDetector) oder Nummer eintippen */
let scanStop=null;
function scanSheet(){
  const ctx=searchCtx,has="BarcodeDetector" in window&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia;
  openSheet("Barcode","Scannen",(has?`<video class="escan" id="eVid" playsinline muted></video><div class="note">Strichcode ins Bild halten.</div>`:`<div class="note">Kamera-Scan geht hier nicht – Nummer unter dem Strichcode eintippen.</div>`)+
    `<label class="field"><span>Nummer</span><input id="eCode" inputmode="numeric" placeholder="z. B. 4008400401621"></label><button class="btn primary big" id="eCodeGo">Suchen</button>`,{onClose:()=>{if(scanStop)scanStop();if(!handed){searchCtx=null;renderEssen()}}});let handed=false;
  const found=async code=>{if(scanStop)scanStop();toast("Suche "+code+" …");
    const back=f=>{handed=true;openSearch(ctx);added[f.id]=addFood(E.foods[f.id]||f,ctx);addedN=1;drawRes()};
    try{const f=await offByCode(code);if(!f){toast("Nicht gefunden – bitte anlegen");handed=true;foodForm({code},back);return}back(f)}catch(e){toast("Open Food Facts nicht erreichbar")}};
  $("eCodeGo").onclick=()=>{const v=$("eCode").value.replace(/\D/g,"");if(v.length>=8)found(v)};
  if(!has)return;
  let stream=null,alive=true;
  scanStop=()=>{alive=false;scanStop=null;if(stream)stream.getTracks().forEach(t=>t.stop())};
  (async()=>{try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
    const v=$("eVid");if(!v||!alive){scanStop&&scanStop();return}v.srcObject=stream;await v.play();
    const det=new BarcodeDetector({formats:["ean_13","ean_8","upc_a","upc_e"]});
    const tick=async()=>{if(!alive)return;try{const c=await det.detect(v);if(c&&c.length){found(c[0].rawValue);return}}catch(_){}setTimeout(tick,250)};tick();
  }catch(e){const v=$("eVid");if(v)v.replaceWith(Object.assign(document.createElement("div"),{className:"note warnbox",textContent:"Kamera nicht verfügbar – Nummer eintippen."}))}})();
}

/* ---------- Eigenes Lebensmittel anlegen / bearbeiten ---------- */
function foodForm(f0,after){
  const f=Object.assign({base:"g",kcal:"",p:"",c:"",f:"",fib:""},f0);
  const isNew=!f.id||!E.foods[f.id];
  const num=(id,label,v)=>`<label class="field"><span>${label}</span><input id="${id}" type="number" inputmode="decimal" step="any" min="0" value="${v===""||v==null?"":v}"></label>`;
  openSheet(isNew?"Neues Lebensmittel":"Lebensmittel",isNew?"Anlegen":f.name,
    `<label class="field"><span>Name</span><input id="ffN" value="${esc(f.name||"")}" maxlength="60"></label>
     <label class="field"><span>Marke (optional)</span><input id="ffB" value="${esc(f.brand||"")}" maxlength="40"></label>
     <div class="seg"><button class="sbtn" data-fb="g" aria-pressed="${f.base!=="stk"}">pro 100 g</button><button class="sbtn" data-fb="stk" aria-pressed="${f.base==="stk"}">pro Stück</button></div>
     <div class="egrid">${num("ffK","Kalorien (kcal)",f.kcal)}${num("ffP","Eiweiß (g)",f.p)}${num("ffC","Kohlenhydrate (g)",f.c)}${num("ffF","Fett (g)",f.f)}${num("ffFi","Ballaststoffe (g)",f.fib)}${num("ffS","Gramm pro Stück (optional)",f.stkG||"")}</div>
     <button class="btn primary big" id="ffOk">Speichern</button>${!isNew&&f.src!=="bls"?`<button class="btn danger" id="ffDel">Löschen</button>`:""}`);
  let base=f.base;
  $("shBody").querySelectorAll("[data-fb]").forEach(b=>b.onclick=()=>{base=b.dataset.fb;$("shBody").querySelectorAll("[data-fb]").forEach(x=>x.setAttribute("aria-pressed",x.dataset.fb===base))});
  const val=id=>{const v=parseFloat(String($(id).value).replace(",","."));return v>=0?v:0};
  $("ffOk").onclick=()=>{
    const name=$("ffN").value.trim();if(!name){toast("Name fehlt");return}
    const nf2=Object.assign({},f,{id:f.id&&E.foods[f.id]?f.id:(f.src==="bls"||f.src==="off")&&f.id?f.id:"own:"+nid(),name,brand:$("ffB").value.trim(),base,kcal:val("ffK"),p:val("ffP"),c:val("ffC"),f:val("ffF"),fib:val("ffFi"),src:f.src||"own"});
    const sg=val("ffS");if(sg>0)nf2.stkG=sg;else delete nf2.stkG;
    if(!nf2.kcal&&!nf2.p&&!nf2.c&&!nf2.f){toast("Nährwerte fehlen");return}
    E.foods[nf2.id]=nf2;esave();closeSheet();renderEssen();toast("Gespeichert");if(after)setTimeout(()=>after(nf2),60);
  };
  if($("ffDel"))$("ffDel").onclick=()=>{
    const used=Object.values(E.days).some(d=>d.e.some(x=>x.food===f.id))||Object.values(E.meals).some(m=>m.items.some(x=>x.food===f.id));
    if(used){toast("Wird noch benutzt (Tagebuch oder Vorlage)");return}
    delete E.foods[f.id];esave();closeSheet();toast("Gelöscht")};
}

/* ---------- Vorlagen verwalten ---------- */
function tplList(){
  const ms=Object.values(E.meals);
  openSheet("Ernährung","Mahlzeiten-Vorlagen",`<div class="note">Vorlagen bleiben gleich, egal was du im Tagebuch änderst. Bearbeiten nur hier oder über „Vorlage überschreiben“.</div>
    <div class="list elist">${ms.map(m=>{const s=sumE(m.items);return `<button class="erow" data-tl="${m.id}"><span class="emid"><span class="nm">${esc(m.name)}</span><span class="val">${m.slot?SLOTN[m.slot]+" · ":""}${m.items.length} Zutaten · ${nf(s.kcal)} kcal · ${nf(s.p)} g E</span></span></button>`}).join("")||""}</div>
    <button class="btn" id="tlNew">＋ Neue Vorlage</button>`);
  $("shBody").querySelectorAll("[data-tl]").forEach(b=>b.onclick=()=>tplSheet(b.dataset.tl));
  $("tlNew").onclick=()=>askName("Neue Vorlage","",n=>{const id=nid();E.meals[id]={id,name:n,items:[]};esave();tplSheet(id)});
}
/* Vorlage ansehen/bearbeiten. from = gemerkter Stand der Suche (dann „Hinzufügen“ + zurück zur Suche) */
function tplSheet(tid,from){
  const m=E.meals[tid];if(!m)return;
  const back=()=>from?restoreSearch(from):tplList();
  mealSheet({eyebrow:"Mahlzeit",title:()=>m.name,items:()=>m.items,keepEmpty:true,
    remove:it=>{const i=m.items.indexOf(it);if(i>=0)m.items.splice(i,1)},
    add:()=>openSearch({kind:"tpl",tid,slot:m.slot||"sn",back:()=>tplSheet(tid,from)}),
    onClose:()=>renderEssen(),
    top:()=>`<div class="seg eslotseg emslot">${SLOTS.map(([sl,n])=>`<button class="sbtn" data-ts="${sl}" aria-pressed="${m.slot===sl}">${n}</button>`).join("")}</div>`,
    actions:()=>(from?`<button class="btn primary big" id="tUse">${from.added["t:"+tid]?"Nochmal hinzufügen":"Hinzufügen"}</button>`:"")+
      `<div class="emact"><button class="btn" id="tRen">Umbenennen</button><button class="btn danger" id="tDel">Löschen</button></div><button class="btn ghost" id="tBack">‹ ${from?"Zurück":"Alle Mahlzeiten"}</button>`,
    bind:(body,draw)=>{
      body.querySelectorAll("[data-ts]").forEach(b=>b.onclick=()=>{m.slot=m.slot===b.dataset.ts?undefined:b.dataset.ts;esave();draw(true)});
      if($("tUse"))$("tUse").onclick=()=>{if(!m.items.length){toast("Mahlzeit ist leer");return}const was=from.added["t:"+tid];from.added["t:"+tid]=insertTpl(tid,curDay,from.ctx.slot,true);if(!was)from.addedN++;restoreSearch(from)};
      $("tRen").onclick=()=>askName("Umbenennen",m.name,n=>{m.name=n;esave();tplSheet(tid,from)});
      let arm=false;$("tDel").onclick=e=>{if(!arm){arm=true;e.target.textContent="Wirklich löschen?";return}delete E.meals[tid];esave();toast("„"+m.name+"“ gelöscht");back()};
      $("tBack").onclick=back;
    }});
}
function foodList(){
  const fs=Object.values(E.foods).sort((a,b)=>a.name.localeCompare(b.name));
  openSheet("Ernährung","Meine Lebensmittel",`<div class="list elist">${fs.map(f=>`<button class="erow" data-fl="${esc(f.id)}"><span class="emid"><span class="nm">${esc(f.name)}${f.brand?` <small>${esc(f.brand)}</small>`:""}</span><span class="val">${nf(f.kcal)} kcal · ${nf(f.p,1)} g E / ${f.base==="stk"?"Stück":"100 g"}</span></span></button>`).join("")}</div><button class="btn" id="flNew">＋ Eigenes Lebensmittel</button>`);
  $("shBody").querySelectorAll("[data-fl]").forEach(b=>b.onclick=()=>foodForm(E.foods[b.dataset.fl],()=>foodList()));
  $("flNew").onclick=()=>foodForm({},()=>foodList());
}

/* ---------- Menü: Ziele, Vorlagen, Lebensmittel, Claude ---------- */
function moreSheet(){
  const G=E.goals;
  const num=(id,label,v)=>`<label class="field"><span>${label}</span><input id="${id}" type="number" inputmode="decimal" step="any" min="0" value="${v}"></label>`;
  openSheet("Ernährung","Einstellungen",
    `<h3>Tagesziele</h3><div class="egrid">${num("gK","Kalorien",G.kcal)}${num("gP","Eiweiß (g)",G.p)}${num("gF","Fett (g)",G.f)}${num("gC","Kohlenhydrate (g)",G.c)}${num("gKg","Körpergewicht (kg)",E.kg||87)}</div>
     <label class="toggle"><span>Training einrechnen<small>Verbrannte Kalorien (grob geschätzt) aufs Ziel draufrechnen</small></span><input type="checkbox" id="gBurn"${E.burnIn?" checked":""}></label>
     <button class="btn" id="mTpl">Mahlzeiten-Vorlagen</button>
     <button class="btn" id="mFood">Meine Lebensmittel</button>
     <h3>Claude</h3>
     <button class="btn" id="mPaste">Von Claude einfügen</button>
     <button class="btn" id="mShare">An Claude schicken</button>
     <div class="note esrc">Nährwerte: BLS 4.0 – Max Rubner-Institut (2025), CC BY 4.0, DOI 10.25826/Data20251217-134202-0 · Open Food Facts, ODbL</div>`,
    {onClose:()=>renderEssen()});
  const sv=()=>{const v=id=>{const x=parseFloat(String($(id).value).replace(",","."));return x>0?x:null};
    G.kcal=v("gK")||G.kcal;G.p=v("gP")||G.p;G.f=v("gF")||G.f;G.c=v("gC")||G.c;E.kg=v("gKg")||E.kg;esave()};
  ["gK","gP","gF","gC","gKg"].forEach(id=>$(id).addEventListener("change",sv));
  $("gBurn").onchange=e=>{E.burnIn=e.target.checked;esave()};
  $("mTpl").onclick=tplList;$("mFood").onclick=foodList;
  $("mPaste").onclick=pasteEssen;$("mShare").onclick=shareEssen;
}

/* ---------- Andockstelle für Claude ----------
   Link: <App-URL>#e=<base64url(deflate-raw(JSON))>
   JSON {v:1,
     foods:[{name,brand?,base?:"g"|"stk",kcal,p,c,f,fib?,stkG?,def?,upd?}],      neue Lebensmittel (Name+Marke = Schlüssel; upd:true überschreibt Werte)
     meals:[{name,slot?,items:[{food,amt,u?}]}],                                  Vorlagen anlegen/ersetzen (gleicher Name = ersetzen)
     add:[{date?,slot,meal?|items?,name?}],                                       ins Tagebuch: meal = Vorlagen-Name, items = einzelne (name = als Mahlzeit-Gruppe)
     acts:[{date?,name,kcal}]}                                                    Aktivitäten ohne App (z. B. Tennis)
   food-Verweis: Name (ggf. „Name | Marke“), eine id aus „An Claude schicken“ oder „bls:<Code>“. */
const findFood=(ref,extra)=>{
  if(!ref)return null;if(E.foods[ref])return E.foods[ref];if(extra&&extra[ref])return extra[ref];
  const r=norm(ref),all=Object.values(Object.assign({},E.foods,extra||{}));
  return all.find(f=>norm(f.name+" | "+(f.brand||""))===r||norm(f.name+" "+(f.brand||""))===r)||all.find(f=>norm(f.name)===r)||null;
};
async function prepImport(p){
  const warn=[],newF={},upd=[];
  if(!p||p.v!==1)throw new Error("Kein Ernährungs-Link");
  (p.foods||[]).forEach(x=>{
    if(!x||!x.name)return;const ex=findFood(x.name+" | "+(x.brand||""))||(!x.brand&&findFood(x.name));
    const f={name:String(x.name).slice(0,60),brand:String(x.brand||"").slice(0,40),base:x.base==="stk"?"stk":"g",kcal:+x.kcal||0,p:+x.p||0,c:+x.c||0,f:+x.f||0,fib:+x.fib||0,src:"own"};
    if(x.stkG>0)f.stkG=+x.stkG;if(x.def>0)f.def=+x.def;
    if(ex){if(x.upd)upd.push([ex,f]);newF[norm(x.name)]=ex;return}
    f.id="own:"+nid();newF[f.id]=f;
  });
  const extra={};Object.values(newF).forEach(f=>extra[f.id]=f);
  let blsNeeded=false;const scan=it=>{if(String(it.food||"").startsWith("bls:"))blsNeeded=true};
  (p.meals||[]).forEach(m=>(m.items||[]).forEach(scan));(p.add||[]).forEach(a=>(a.items||[]).forEach(scan));
  if(blsNeeded){try{await loadBLS()}catch(_){}}
  const res=ref=>{let f=findFood(ref,extra);
    if(!f&&String(ref).startsWith("bls:")&&BLS){const b=BLS.find(x=>x.code===String(ref).slice(4));if(b){f=blsFood(b);extra[f.id]=f}}
    if(!f)warn.push("Unbekannt: "+ref);return f};
  const items=list=>(list||[]).map(it=>{const f=res(it.food);if(!f||!(+it.amt>0))return null;const x={food:f.id,amt:+it.amt};if(it.u==="stk"||(it.u==="g"&&f.base==="stk"))x.u=it.u;return x}).filter(Boolean);
  const meals=(p.meals||[]).filter(m=>m&&m.name).map(m=>({name:String(m.name).slice(0,40),slot:SLOTN[m.slot]?m.slot:undefined,items:items(m.items)}));
  const t=today(),add=(p.add||[]).map(a=>{
    const k=/^\d{4}-\d\d-\d\d$/.test(a.date||"")?a.date:t,slot=SLOTN[a.slot]?a.slot:"sn";
    if(a.meal){const nm=norm(a.meal),m=meals.find(x=>norm(x.name)===nm)||Object.values(E.meals).find(x=>norm(x.name)===nm);if(!m){warn.push("Vorlage fehlt: "+a.meal);return null}return {k,slot,meal:m}}
    const its=items(a.items);return its.length?{k,slot,items:its,name:a.name}:null}).filter(Boolean);
  const acts=(p.acts||[]).filter(a=>a&&a.name&&+a.kcal>0).map(a=>({k:/^\d{4}-\d\d-\d\d$/.test(a.date||"")?a.date:t,name:String(a.name).slice(0,40),kcal:Math.round(+a.kcal)}));
  return {extra,upd,meals,add,acts,warn};
}
function applyImport(c){
  Object.values(c.extra).forEach(f=>{if(!E.foods[f.id])E.foods[f.id]=f});
  c.upd.forEach(([ex,f])=>Object.assign(ex,f,{id:ex.id}));
  c.meals.forEach(m=>{const old=Object.values(E.meals).find(x=>norm(x.name)===norm(m.name));const id=old?old.id:nid();E.meals[id]={id,name:m.name,slot:m.slot,items:m.items}});
  let last=null;
  c.add.forEach(a=>{
    if(a.meal){const tpl=Object.values(E.meals).find(x=>norm(x.name)===norm(a.meal.name));if(tpl)insertTpl(tpl.id,a.k,a.slot,true)}
    else{const gid=a.name?nid():null;day(a.k).e.push(...a.items.map(it=>{const x=Object.assign({id:nid(),slot:a.slot},it);if(gid)x.g={id:gid,name:a.name};return x}))}
    last=a.k});
  c.acts.forEach(a=>{const d=day(a.k);(d.acts=d.acts||[]).push({name:a.name,kcal:a.kcal});last=a.k});
  esave();if(last)curDay=last;
}
let eImporting=false;
async function offerEssen(p){
  let c;try{c=await prepImport(p)}catch(e){toast(e.message);return}
  const nF=Object.keys(c.extra).filter(id=>id.startsWith("own:")).length,lines=[];
  if(nF)lines.push(nF+" neue"+(nF===1?"s Lebensmittel":" Lebensmittel")+": "+Object.values(c.extra).filter(f=>f.id.startsWith("own:")).map(f=>f.name).join(", "));
  if(c.upd.length)lines.push(c.upd.length+" Lebensmittel aktualisiert");
  c.meals.forEach(m=>{const old=Object.values(E.meals).some(x=>norm(x.name)===norm(m.name));lines.push((old?"Vorlage ersetzen: ":"Neue Vorlage: ")+m.name+" ("+m.items.length+" Zutaten)")});
  const dl=k=>k===today()?"heute":new Date(k+"T12:00").toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"});
  c.add.forEach(a=>lines.push(SLOTN[a.slot]+" "+dl(a.k)+": "+(a.meal?a.meal.name:a.name||a.items.map(it=>(c.extra[it.food]||E.foods[it.food]||{}).name).join(", "))));
  c.acts.forEach(a=>lines.push("Aktivität "+dl(a.k)+": "+a.name+" ~"+a.kcal+" kcal"));
  if(!lines.length){toast("Link enthält nichts zum Übernehmen");return}
  eImporting=true;
  openSheet("Von Claude","Ernährung übernehmen?",`<div class="note">${lines.map(esc).join("<br>")}</div>${c.warn.length?`<div class="note warnbox">${c.warn.map(esc).join("<br>")}</div>`:""}<button class="btn primary big" id="eiOk">Übernehmen</button><button class="btn ghost" id="eiNo">Abbrechen</button>`,{onClose:()=>{eImporting=false}});
  $("eiOk").onclick=()=>{applyImport(c);eImporting=false;closeSheet();if(K.screen()!=="essen")show("essen");else renderEssen();toast("Übernommen")};
  $("eiNo").onclick=()=>{eImporting=false;closeSheet()};
}
async function readE(t){
  const m=String(t||"").match(/[#&?]e=([A-Za-z0-9_-]+)/)||String(t||"").trim().match(/^([A-Za-z0-9_-]{20,})$/);
  if(!m)throw new Error("Kein Ernährungs-Link");
  return JSON.parse(await zip(b64u.dec(m[1]),true));
}
async function checkEssen(){
  if(eImporting||!/[#&]e=/.test(location.hash))return;
  const h=location.hash;history.replaceState(history.state,"",location.pathname+location.search);
  try{offerEssen(await readE(h))}catch(e){toast("Link kaputt: "+e.message)}
}
async function pasteEssen(){
  let t="";try{t=await navigator.clipboard.readText()}catch(_){}
  if(/[#&?]e=/.test(t)){try{offerEssen(await readE(t));return}catch(_){}}
  openSheet("Von Claude","Link einfügen",`<textarea class="pksearch" id="eiTxt" rows="4" placeholder="Link von Claude hier einfügen"></textarea><button class="btn primary big" id="eiGo">Weiter</button>`);
  $("eiGo").onclick=async()=>{try{const p=await readE($("eiTxt").value);closeSheet();setTimeout(()=>offerEssen(p),80)}catch(e){toast("Kein gültiger Ernährungs-Link")}};
}
async function shareEssen(){
  try{
    const used=new Set();Object.values(E.meals).forEach(m=>m.items.forEach(i=>used.add(i.food)));
    const d=dayGet(curDay);d.e.forEach(x=>used.add(x.food));
    const foods=Object.values(E.foods).filter(f=>f.src==="own"||used.has(f.id)).map(f=>{const x={id:f.id,name:f.name,base:f.base,kcal:f.kcal,p:f.p,c:f.c,f:f.f};if(f.brand)x.brand=f.brand;if(f.fib)x.fib=f.fib;if(f.stkG)x.stkG=f.stkG;if(f.def)x.def=f.def;return x});
    const p={v:1,export:true,date:curDay,goals:E.goals,kg:E.kg,foods,meals:Object.values(E.meals).map(m=>({name:m.name,slot:m.slot,items:m.items})),
      day:d.e.map(x=>{const o={slot:x.slot,food:x.food,amt:x.amt};if(x.u)o.u=x.u;if(x.g)o.meal=x.g.name;return o})};
    const link=APP_URL+"#e="+b64u.enc(await zip(JSON.stringify(p))),txt="Meine Ernährung (Lebensmittel, Vorlagen, "+(curDay===today()?"heute":curDay)+"):\n"+link;
    if(navigator.share){try{await navigator.share({title:"Ernährung",text:txt});return}catch(e){if(e&&e.name==="AbortError")return}}
    await navigator.clipboard.writeText(txt);toast("Link kopiert – bei Claude einfügen");
  }catch(e){toast("Teilen ging nicht: "+e.message)}
}
window.addEventListener("hashchange",checkEssen);
window.addEventListener("popstate",()=>setTimeout(()=>{if($("essen").hidden){editId=null;sel.clear();renderSelBar()}},0));

/* ---------- Hauptmenü-Karte, Navigation, Datenübertragung ---------- */
function essenMeta(){
  const el=$("essenMeta");if(!el)return;const s=sumE(dayGet(today()).e);
  el.textContent=s.kcal?`Heute ${nf(s.kcal)} / ${nf(E.goals.kcal)} kcal · ${nf(s.p)} g Eiweiß`:"Heute noch nichts eingetragen";
}
window.renderEssen=renderEssen;window.essenMeta=essenMeta;
window.TrainingEssen={get:()=>E,set:x=>{if(x&&x.foods){E=x;esave()}},reload:()=>{try{const x=JSON.parse(localStorage.getItem(EK)||"null");if(x&&x.foods)E=x}catch(_){}}};
if(!SCREENS.includes("essen"))SCREENS.push("essen");
$("openEssen").onclick=()=>{curDay=today();show("essen")};
$("eMore").onclick=moreSheet;
essenMeta();checkEssen();
loadBLS().catch(()=>{}); // vorladen (offline-Cache)
window.__essen={E:()=>E,prepImport,applyImport,readE,setDay:k=>{curDay=k;renderEssen()}};
})();
