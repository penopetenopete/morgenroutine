/* Trainings-App: Hauptmenü, Routinen-Baukasten, Übersicht, Workout-Player, Statistik.
   Zeiten kommen immer aus Zeitstempeln (Date.now), der Workout-Zustand liegt in localStorage –
   so läuft ein Workout weiter, auch wenn die Seite im Hintergrund eingefroren wird. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const F=window.Figur;
if(!F){document.body.insertAdjacentHTML("afterbegin",'<div class="wrap"><p class="err">3D-Bibliothek konnte nicht geladen werden. Bitte neu laden.</p></div>');return}
const EXB=F.EXB, EXL=F.EX;
const now=()=>Date.now();
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));
const uidGen=()=>"i"+now().toString(36)+Math.random().toString(36).slice(2,6);

/* =================== SPEICHER =================== */
const KEY="training_v1", ACT="training_active_v1", CAT="uebungen_v1", OLD="morgenroutine_v1";
const MAX_SLOTS=5;
const DEF_SET={umbau:10,satz:60,wechsel:15,confirm:true};
const G_DEF={shade:2,sound:true,vib:true,rest:120,side:10,confirm:true};

/* Morgenroutine – Ablauf und Startwerte genau wie bisher (abgenommen 05.10.2026) */
const MORGEN={id:"morgen",name:"Morgenroutine",settings:{umbau:10,satz:30,wechsel:15,confirm:false},items:[
  {uid:"m1",ex:"heelsit",o:{secs:60}},
  {uid:"m2",ex:"grasshopper",o:{secs:30}},
  {uid:"m3",ex:"camel",o:{reps:6}},
  {uid:"m4",ex:"deepsquat",o:{secs:60}},
  {uid:"m5",ex:"nervefloss",o:{reps:10}},
  {uid:"m6",ex:"pigeon",o:{reps:10}},
  {uid:"m7",ex:"hipcars",o:{reps:3}},
  {uid:"m8",ex:"rot9090",o:{reps:10}},
  {uid:"m9",ex:"drop_out",o:{secs:30,sets:1}},
  {uid:"m10",ex:"pigeonhold",o:{secs:30}},
  {uid:"m11",ex:"drop_in",o:{secs:30,sets:1}},
  {uid:"m12",ex:"kickout",o:{secs:15},pair:{ex2:"hfstretch",o2:{secs:30},umbau:"Fuß auf den Stuhl",name:"Kick-out + Hüftbeuger-Dehnung"}},
  {uid:"m13",ex:"hamcurl",o:{secs:30},pair:{ex2:"wallstretch",o2:{secs:30},umbau:"Fußballen an die Wand",name:"Hamstring-Curl + Wanddehnung"}}
]};
/* Beispiel für den ersten Start: Knie-Block aus dem Trainingsplan (frei änderbar oder löschbar) */
const EXAMPLE={name:"Test · Knie-Block",items:[
  ["walkback",{secs:600,sets:1}],["balance",{secs:60,sets:1}],["tibialis",{reps:20,sets:2}],["stepdown",{reps:10,sets:2}],
  ["poliquin",{reps:15,sets:2}],["atgsplit",{mode:"hold",secs:60,sets:1}],["calf",{reps:20,sets:2}]]};

let S=load();
function load(){
  let s=null;try{s=JSON.parse(localStorage.getItem(KEY)||"null")}catch(_){}
  const fresh=!s;
  s=Object.assign({v:1,routines:[],morgen:{items:{},settings:{}},g:{},log:[],last:{},lastRes:{},seeded:false},s||{});
  if(fresh)migrateOld(s);
  if(!s.seeded){
    s.seeded=true;
    if(!s.routines.length)s.routines.push({id:"r"+now().toString(36),name:EXAMPLE.name,settings:{},days:[{items:EXAMPLE.items.map(([ex,o])=>{const v=Object.assign({},EXB[ex].def,o);return {uid:uidGen()+ex,ex,o:v,base:Object.assign({},v)}})}]});
  }
  return s;
}
/* Einstellungen der bisherigen Morgenroutine-App übernehmen */
function migrateOld(s){
  let o=null;try{o=JSON.parse(localStorage.getItem(OLD)||"null")}catch(_){}
  if(!o)return;
  for(const id in (o.items||{})){
    const it=o.items[id],ov={};
    if(it.secs!=null)ov.o={secs:it.secs};
    if(it.reps!=null)(ov.o=ov.o||{}).reps=it.reps;
    if(it.secs2!=null)ov.o2={secs:it.secs2};
    if(it.off)ov.off=true;
    if(Object.keys(ov).length)s.morgen.items["m"+id]=ov;
  }
  const g=o.g||{};
  if(g.umbau!=null)s.morgen.settings.umbau=g.umbau;
  if(g.wechsel!=null)s.morgen.settings.wechsel=g.wechsel;
  for(const k of ["shade","sound","vib"])if(g[k]!=null)s.g[k]=g[k];
  (o.log||[]).forEach(l=>s.log.push({d:l.d,t:l.t,rid:"morgen",rname:"Morgenroutine",day:0,items:[]}));
  const lg=(o.log||[]).slice(-1)[0];if(lg)s.last.morgen={day:0,d:lg.d};
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(_){}}
const gv=k=>S.g[k]!=null?S.g[k]:G_DEF[k];
function setG(k,v){S.g[k]=v;save()}

/* =================== ROUTINEN =================== */
const exDef=id=>EXB[id].def;
const baseMorgen=d=>Object.assign({},exDef(d.ex),d.o);
const base2Morgen=d=>Object.assign({},exDef(d.pair.ex2),d.pair.o2);
function getRoutine(id){
  if(id==="morgen"){
    const ov=S.morgen;
    const items=MORGEN.items.map(d=>{
      const x=ov.items[d.uid]||{},base=baseMorgen(d);
      const it={uid:d.uid,ex:d.ex,base,o:Object.assign({},base,x.o||{}),so:x.so?clone(x.so):{},off:!!x.off};
      if(d.pair){const b2=base2Morgen(d);it.pair={ex2:d.pair.ex2,umbau:d.pair.umbau,name:d.pair.name,base2:b2,o2:Object.assign({},b2,x.o2||{})}}
      else it.link=!!x.link;
      return it;
    });
    (ov.extra||[]).forEach(x=>{if(EXB[x.ex])items.push({uid:x.uid,ex:x.ex,extra:true,link:!!x.link,so:x.so?clone(x.so):{},base:Object.assign({},exDef(x.ex)),o:Object.assign({},exDef(x.ex),x.o)})});
    if(ov.order){const pos=u=>{const i=ov.order.indexOf(u);return i<0?1e3:i};items.sort((a,b)=>pos(a.uid)-pos(b.uid))}
    return {id,name:MORGEN.name,preset:true,days:[{items}],pauses:ov.pauses||{},settings:Object.assign({},DEF_SET,MORGEN.settings,ov.settings,{confirm:false})};
  }
  const r=S.routines.find(r=>r.id===id);if(!r)return null;
  return {id,name:r.name,preset:false,pauses:r.pauses||{},settings:Object.assign({},DEF_SET,r.settings,{confirm:gv("confirm")}),
    days:r.days.map(d=>({items:d.items.filter(it=>EXB[it.ex]).map(it=>({uid:it.uid,ex:it.ex,link:!!it.link,so:it.so?clone(it.so):{},base:Object.assign({},exDef(it.ex),it.base||{}),o:Object.assign({},exDef(it.ex),it.o)}))}))};
}
const rawRoutine=id=>S.routines.find(r=>r.id===id);
function diff(o,base){const d={};for(const k in o)if(o[k]!==base[k])d[k]=o[k];return d}
/* Werte einer Übung dauerhaft in der Routine speichern */
function persistItem(rid,it){
  if(!rid)return;
  if(rid==="morgen"){
    const xe=(S.morgen.extra||[]).find(x=>x.uid===it.uid);
    if(xe){xe.o=Object.assign({},it.o);if(it.so&&Object.keys(it.so).length)xe.so=clone(it.so);else delete xe.so;save();return}
    const d=MORGEN.items.find(x=>x.uid===it.uid);if(!d)return;
    const x=S.morgen.items[it.uid]||(S.morgen.items[it.uid]={});
    x.o=diff(it.o,baseMorgen(d));if(!Object.keys(x.o).length)delete x.o;
    if(d.pair){x.o2=diff(it.pair.o2,base2Morgen(d));if(!Object.keys(x.o2).length)delete x.o2}
    if(it.so&&Object.keys(it.so).length)x.so=clone(it.so);else delete x.so;
    if(!Object.keys(x).length)delete S.morgen.items[it.uid];
    save();return;
  }
  const r=rawRoutine(rid);if(!r)return;
  for(const d of r.days)for(const x of d.items)if(x.uid===it.uid){x.o=Object.assign({},it.o);if(it.so&&Object.keys(it.so).length)x.so=clone(it.so);else delete x.so}
  save();
}
/* ---- Routine dauerhaft ändern: hinzufügen, löschen, Reihenfolge, Verknüpfung ---- */
function rawItems(rid,day){
  if(rid==="morgen"){const ov=S.morgen;ov.extra=ov.extra||[];return null}
  const r=rawRoutine(rid);return r&&r.days[day]?r.days[day].items:null;
}
function addItems(rid,day,exs){
  return exs.map(ex=>{const uid=uidGen(),o=catOpt(ex);
    if(rid==="morgen"){S.morgen.extra=S.morgen.extra||[];S.morgen.extra.push({uid,ex,o:Object.assign({},o)});if(S.morgen.order)S.morgen.order.push(uid)}
    else{const a=rawItems(rid,day);if(a)a.push({uid,ex,o:Object.assign({},o)})}
    return {uid,ex,o,so:{},base:Object.assign({},o),link:false};
  });
}
function deleteItem(rid,day,uid){
  if(rid==="morgen"){
    const ov=S.morgen,ei=(ov.extra||[]).findIndex(x=>x.uid===uid);
    if(ei>=0){ov.extra.splice(ei,1);if(ov.order)ov.order=ov.order.filter(u=>u!==uid);save()}else setMorgenOff(uid,true);
    return;
  }
  const a=rawItems(rid,day);if(!a)return;const i=a.findIndex(x=>x.uid===uid);if(i>=0)a.splice(i,1);save();
}
/* uids = neue Reihenfolge der sichtbaren Übungen */
function orderItems(rid,day,uids){
  if(rid==="morgen"){const all=getRoutine("morgen").days[0].items.map(x=>x.uid);S.morgen.order=uids.concat(all.filter(u=>!uids.includes(u)));save();return}
  const a=rawItems(rid,day);if(!a)return;const pos=u=>{const i=uids.indexOf(u);return i<0?1e3:i};
  const sorted=a.slice().sort((x,y)=>pos(x.uid)-pos(y.uid));a.length=0;a.push(...sorted);save();
}
function linkItem(rid,day,uid,v){
  if(rid==="morgen"){const ex=(S.morgen.extra||[]).find(x=>x.uid===uid);if(ex)ex.link=v;else{const x=S.morgen.items[uid]||(S.morgen.items[uid]={});if(v)x.link=true;else delete x.link;if(!Object.keys(x).length)delete S.morgen.items[uid]}save();return}
  const a=rawItems(rid,day),x=a&&a.find(z=>z.uid===uid);if(x){x.link=v;save()}
}
/* eigene Pause für eine bestimmte Stelle (v=null: wieder Standard) – dauerhaft in der Routine */
function setPause(rid,pk,v){
  const tgt=rid==="morgen"?S.morgen:rawRoutine(rid);if(!tgt)return;
  tgt.pauses=tgt.pauses||{};if(v==null)delete tgt.pauses[pk];else tgt.pauses[pk]=v;save();
}
function setMorgenOff(uid,off){const x=S.morgen.items[uid]||(S.morgen.items[uid]={});if(off)x.off=true;else delete x.off;if(!Object.keys(x).length)delete S.morgen.items[uid];save()}
function setRoutineSetting(rid,k,v){if(rid==="morgen")S.morgen.settings[k]=v;else{const r=rawRoutine(rid);if(!r)return;r.settings=r.settings||{};r.settings[k]=v}save()}

/* =================== TEXTE =================== */
const isUni=(e,o)=>!!(e.uni&&e.uni(o));
const fmt=s=>{s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=String(s%60).padStart(2,"0");return h?h+":"+String(m).padStart(2,"0")+":"+x:m+":"+x};
const fmtSecs=v=>v<60?v+" s":(v%60===0?(v/60)+" min":Math.floor(v/60)+":"+String(v%60).padStart(2,"0")+" min");
const kgNum=v=>String(v).replace(".",",");
function valText(e,o){
  const per=(isUni(e,o)||e.perSide)?" pro Seite":"";
  let s=e.drop?"3 Stufen à "+fmtSecs(o.secs)+per:o.mode==="hold"?fmtSecs(o.secs)+(e.timeWord||e.timedReps?"":" halten")+per:o.reps+(e.repsLabel?" pro Teil"+(per?" ·":""):" Wdh.")+per;
  if((o.sets||1)>1)s=o.sets+" × "+s;
  if(e.weight!=="none"&&(o.kg>0||e.weight==="bar"))s+=" · "+F.kgText(e.weight,o.kg);
  return s;
}
const itemName=it=>it.pair?it.pair.name:EXB[it.ex].name;
/* Einzelne Sätze können abweichen (it.so[satz] = Abweichungen von it.o) */
const setOpt=(it,s)=>Object.assign({},it.o,((it.so||{})[s])||{});
const isMixed=it=>!!(it.so&&Object.keys(it.so).some(k=>+k<=(it.o.sets||1)&&Object.keys(it.so[k]).length));
function delSet(it,s){const n=it.o.sets||1;if(n<=1)return false;const so={};for(const k in (it.so||{})){const i=+k;if(i<s)so[i]=it.so[k];else if(i>s)so[i-1]=it.so[k]}it.so=so;it.o.sets=n-1;return true}
const itemText=it=>!it.pair&&isMixed(it)?`${it.o.sets} Sätze · gemischt`:it.pair?fmtSecs(it.o.secs)+" + "+fmtSecs(it.pair.o2.secs)+" pro Seite":valText(EXB[it.ex],it.o);
function itemChanged(it){return false;if(!it.base)return false;if(Object.keys(diff(it.o,it.base)).some(k=>k in it.base))return true;return !!(it.pair&&Object.keys(diff(it.pair.o2,it.pair.base2)).length)}
const itemStdText=it=>it.pair?fmtSecs(it.base.secs)+" + "+fmtSecs(it.pair.base2.secs):valText(EXB[it.ex],it.base);
function lastText(rid,uid){
  const r=S.lastRes[rid+"|"+uid];if(!r||!r.sets||!r.sets.length)return "";
  const reps=r.sets.filter(x=>x.mode==="reps");
  let t;
  if(reps.length){const by={};reps.forEach(x=>(by[x.set]=by[x.set]||[]).push(x.actual));t=Object.keys(by).sort((a,b)=>a-b).map(k=>by[k].join("/")).join(" · ")+" Wdh."}
  else{const h=r.sets.filter(x=>x.stage==null||x.stage===2);t=h.length+" × "+fmtSecs(Math.round(Math.max(...h.map(x=>x.done||0))))}
  if(r.kg>0)t+=" · "+kgNum(r.kg)+" kg";
  return "Letztes Mal: "+t;
}
const dateText=d=>new Date(d).toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"short"});

/* =================== KLEINE HELFER =================== */
let toastT=null;
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),1800)}
const ICON={
  grip:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  go:'<svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>',
  skip:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.5v13l9-6.5zM15.5 5.5h2.6v13h-2.6z"/></svg>',
  plus:'<svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};
const thumbOf=it=>{try{return F.thumb(EXB[it.ex],it.o)}catch(_){return ""}};

/* =================== SHEET =================== */
let sheetClose=null,sheetLocked=false;
function stopPreview(){if(F.previewStop()&&!$("player").hidden&&W){shownKey="";stepUI();size()}}
function openSheet(eyebrow,title,html,{onClose,locked}={}){
  stopPreview();
  $("shEyebrow").textContent=eyebrow||"";$("shTitle").textContent=title||"";$("shBody").innerHTML=html;
  sheetClose=onClose||null;sheetLocked=!!locked;$("shClose").hidden=!!locked;
  $("scrim").hidden=false;$("shBody").scrollTop=0;
  return $("shBody");
}
function closeSheet(){if($("scrim").hidden)return;stopPreview();$("scrim").hidden=true;const f=sheetClose;sheetClose=null;if(f)f()}
$("shClose").onclick=closeSheet;
$("scrim").addEventListener("click",e=>{if(e.target===$("scrim")&&!sheetLocked)closeSheet()});

/* =================== DREHRAD =================== */
const ITEM=44;
function wheelValues(e,k){
  if(k==="secs"||k==="secs2"){const a=[];for(let v=5;v<=600;v+=5)a.push(v);for(let v=660;v<=3600;v+=60)a.push(v);return a}
  if(k==="reps"){const a=[];for(let v=1;v<=60;v++)a.push(v);return a}
  if(k==="rest"||k==="sw"){const a=[];for(let v=0;v<=300;v+=5)a.push(v);for(let v=360;v<=900;v+=60)a.push(v);return a}
  if(k==="actual"){const a=[];for(let v=0;v<=100;v++)a.push(v);return a}
  if(k==="step")return e.steps;
  if(k==="sets")return [1,2,3,4,5,6,7,8,9,10];
  return F.STEPS[e.weight];
}
const stepText=v=>v?v+" cm":"keine";
function wheelLabel(e,k,v){return (k==="secs"||k==="secs2"||k==="rest"||k==="sw")?fmtSecs(v):(k==="reps"||k==="sets"||k==="actual")?String(v):k==="step"?stepText(v):F.kgText(e.weight,v)}
function wheelHTML(e,k,v){const t=wheelLabel(e,k,v),m=t.match(/^(.*?)\s(s|min|kg|cm)$/);return m?`<b>${m[1]}</b><small>${m[2]}</small>`:`<b>${t}</b>`}
function platesVis(kg){const ps=F.plateSet(kg);return `<span class="plates" aria-label="Scheiben">${ps.map(p=>`<i style="height:${Math.round(F.PLATE[p][0]*52)}px"></i>`).join("")}<b>${ps.map(kgNum).join(" + ")} kg</b></span>`}
/* Eine Zeile mit Drehrad. get(): aktueller Wert, set(v): speichern, std: Standardwert (oder null) */
function wheelRow(id,label,e,k){return `<div class="wheelrow" data-w="${id}" data-k="${k}"><div class="wl"><span>${esc(label)}</span><div class="wside"></div></div>
  <div class="wheelbox"><button class="wbtn" data-d="-1" aria-label="weniger">−</button><div class="wheelwrap"><div class="wheel" tabindex="0" role="spinbutton" aria-label="${esc(label)}">${wheelValues(e,k).map((v,i)=>`<div data-i="${i}">${wheelHTML(e,k,v)}</div>`).join("")}</div></div><button class="wbtn" data-d="1" aria-label="mehr">+</button></div></div>`}
function initWheel(row,e,{get,set,std,side}){
  const k=row.dataset.k,w=row.querySelector(".wheel"),vals=wheelValues(e,k),items=[...w.children];
  const wsd=row.querySelector(".wside");
  const paintSide=()=>{const v=get();let h="";if(side)h+=side(v)||"";
    if(false)h+=v!==std?`<div class="defline">Standard: ${wheelLabel(e,k,std)} <button data-reset>Zurücksetzen</button></div>`:`<div class="defline">Standard</div>`;
    wsd.innerHTML=h;const rb=wsd.querySelector("[data-reset]");if(rb)rb.onclick=()=>{go(vals.indexOf(std))}};
  let idx=vals.indexOf(get());if(idx<0){idx=vals.findIndex(v=>v>=get());if(idx<0)idx=vals.length-1}
  const mark=i=>{items.forEach((d,j)=>d.className=j===i?"on":Math.abs(j-i)===1?"nb":"");w.setAttribute("aria-valuetext",wheelLabel(e,k,vals[i]))};
  requestAnimationFrame(()=>{w.scrollTop=idx*ITEM});w.scrollTop=idx*ITEM;mark(idx);paintSide();
  let tmr=null,shown=idx;
  const go=(i)=>{i=Math.max(0,Math.min(vals.length-1,i));w.scrollTo({top:i*ITEM,behavior:"smooth"})};
  w.addEventListener("scroll",()=>{
    const i=Math.max(0,Math.min(vals.length-1,Math.round(w.scrollTop/ITEM)));
    if(i!==shown){shown=i;mark(i)}
    clearTimeout(tmr);tmr=setTimeout(()=>{if(get()!==vals[i]){set(vals[i]);paintSide()}},160);
  },{passive:true});
  items.forEach(d=>d.onclick=()=>go(+d.dataset.i));
  w.addEventListener("keydown",ev=>{const m={ArrowUp:-1,ArrowDown:1,PageUp:-5,PageDown:5}[ev.key];if(m){ev.preventDefault();go(shown+m)}});
  row.querySelectorAll(".wbtn").forEach(b=>b.onclick=()=>go(shown+(+b.dataset.d)));
  return {value:()=>vals[shown]};
}

/* =================== LISTEN MIT ZIEHEN =================== */
function makeSortable(list,{min=0,onDrop}){
  list.querySelectorAll(".hdl:not(.lock)").forEach(h=>h.addEventListener("pointerdown",ev=>{
    ev.preventDefault();
    const row=h.closest(".row"),rows=[...list.children],from=rows.indexOf(row);
    const rects=rows.map(r=>r.getBoundingClientRect()),hgt=rects[from].height,startY=ev.clientY;
    let to=from;row.classList.add("dragging");try{h.setPointerCapture(ev.pointerId)}catch(_){}
    rows.forEach(r=>{if(r!==row)r.style.transition="transform .15s"});
    const move=e=>{
      const dy=e.clientY-startY;row.style.transform=`translateY(${dy}px)`;
      const cy=rects[from].top+hgt/2+dy;to=from;
      for(let i=0;i<rows.length;i++){if(i===from)continue;const c=rects[i].top+rects[i].height/2;if(i<from&&cy<c)to=Math.min(to,i);if(i>from&&cy>c)to=Math.max(to,i)}
      to=Math.max(to,min);
      rows.forEach((r,i)=>{if(r===row)return;let sh=0;if(from<to&&i>from&&i<=to)sh=-hgt;if(from>to&&i>=to&&i<from)sh=hgt;r.style.transform=sh?`translateY(${sh}px)`:""});
    };
    const up=()=>{h.removeEventListener("pointermove",move);rows.forEach(r=>{r.style.transform="";r.style.transition=""});row.classList.remove("dragging");if(to!==from)onDrop(from,to)};
    h.addEventListener("pointermove",move);h.addEventListener("pointerup",up,{once:true});h.addEventListener("pointercancel",up,{once:true});
  }));
}
const moveArr=(a,from,to)=>{const [x]=a.splice(from,1);a.splice(to,0,x);return a};
/* eine Zeile: Griff · Bild · Name/Werte · Aktion */
const ICON_LINK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
/* CSS-Klassen für verknüpfte Zeilen (Supersatz) */
function linkCls(items,i){const on=k=>items[k]&&items[k].link&&items[k].status!=="removed";return (on(i)||on(i-1))?" lk":""}
function bindLinks(list,fn){list.querySelectorAll("[data-link]").forEach(b=>b.onclick=e=>{e.stopPropagation();fn(+b.dataset.link)})}
function rowHTML(it,i,{lock,tags="",cls="",extra="",action="",link=null}){
  const ch=itemChanged(it);
  return `<div class="row ${cls}" data-i="${i}"><button class="hdl${lock?" lock":""}" aria-label="Verschieben"${lock?' tabindex="-1"':""}>${ICON.grip}</button>
  <img alt="" src="${thumbOf(it)}" width="44" height="44">
  <div class="mid" role="button" tabindex="0" data-tap="${i}"><span class="nm">${esc(itemName(it))}${tags}</span><span class="val${ch?" changed":""}">${esc(itemText(it))}</span>${ch?`<span class="def">Standard: ${esc(itemStdText(it))}</span>`:""}${extra}</div>${action}${link!=null?`<button class="lnk${link?" on":""}" data-link="${i}" aria-pressed="${!!link}" aria-label="${link?"Verknüpfung lösen":"Mit nächster Übung verknüpfen (Supersatz)"}">${ICON_LINK}</button>`:""}</div>`;
}
function bindTaps(list,fn){list.querySelectorAll("[data-tap]").forEach(m=>{m.onclick=()=>fn(+m.dataset.tap);m.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fn(+m.dataset.tap)}}})}

/* =================== NAVIGATION =================== */
const SCREENS=["home","routine","stats"];
let screen="home";
function show(s,push=true){
  screen=s;SCREENS.forEach(x=>$(x).hidden=x!==s);window.scrollTo(0,0);
  if(push)history.pushState({s},"");
  if(s==="home")renderHome();if(s==="routine")renderRoutine();if(s==="stats")renderStats();
}
document.querySelectorAll("[data-back]").forEach(b=>b.onclick=()=>history.back());
window.addEventListener("popstate",e=>{
  if(!$("scrim").hidden&&!sheetLocked){closeSheet();history.pushState({s:screen},"");return}
  if(!$("player").hidden||!$("done").hidden){history.pushState({s:screen},"");return}
  show((e.state&&e.state.s)||"home",false);
});

/* =================== HAUPTMENÜ =================== */
function routineMeta(R){
  const n=R.days.reduce((a,d)=>a+d.items.filter(i=>!i.off).length,0),l=S.last[R.id];
  let m=R.days.length>1?`${R.days.length} Tage · ${n} Übungen`:`${n} Übungen · ca. ${Math.round(estimate(R.days[0].items.filter(i=>!i.off),R.settings)/60)} min`;
  if(R.days.length>1)m+=` · als Nächstes Tag ${nextDay(R)+1}`;
  if(l)m+=` · zuletzt ${dateText(l.d)}`;
  return m;
}
function nextDay(R){const l=S.last[R.id];return l?(l.day+1)%R.days.length:0}
function renderHome(){
  $("today").textContent=new Date().toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long"});
  const card=(R)=>`<button class="rcard" data-r="${R.id}"><span class="nm">${esc(R.name)}</span><span class="meta">${esc(routineMeta(R))}</span>${ICON.go}</button>`;
  $("presetList").innerHTML=card(getRoutine("morgen"));
  let h="";
  for(let i=0;i<MAX_SLOTS;i++){const r=S.routines[i];
    h+=r?card(getRoutine(r.id)):`<button class="rcard empty" data-new="1"><span class="slot">Slot ${i+1}</span><span class="nm">＋ Neue Routine</span></button>`}
  $("customList").innerHTML=h;
  document.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>openRoutine(b.dataset.r));
  document.querySelectorAll("[data-new]").forEach(b=>b.onclick=newRoutine);
  document.querySelectorAll("[data-shade]").forEach(b=>b.setAttribute("aria-pressed",+b.dataset.shade===gv("shade")));
  $("snd").checked=gv("sound");$("vib").checked=gv("vib");$("gConfirm").checked=gv("confirm");
  $("gPauses").innerHTML=wheelRow("gRest","Pause nach jedem Satz",EXB.balance,"rest")+wheelRow("gSide","Pause zwischen den Seiten",EXB.balance,"sw");
  $("gPauses").querySelectorAll(".wheelrow").forEach(row=>{const k=row.dataset.k==="rest"?"rest":"side";initWheel(row,EXB.balance,{get:()=>gv(k),set:v=>setG(k,v)})});
  const a=loadActive();
  $("resume").hidden=!a;
  if(a)$("resume").innerHTML=`<span class="dot"></span><span><b>Workout läuft · ${esc(a.rname)}</b><span class="small">seit ${fmt((now()-a.startedAt)/1000)} · antippen zum Weitermachen</span></span>`;
  const lg=S.log[S.log.length-1];
  $("lastAll").textContent=lg?`${S.log.length} ${S.log.length===1?"Workout":"Workouts"} · zuletzt ${lg.rname}, ${dateText(lg.d)} · ${fmt(lg.t)}`:"Noch keine Workouts";
}
document.querySelectorAll("[data-shade]").forEach(b=>b.onclick=()=>{setG("shade",+b.dataset.shade);F.setShade(gv("shade"));renderHome()});
$("snd").onchange=e=>{setG("sound",e.target.checked);muteIcon()};
$("vib").onchange=e=>setG("vib",e.target.checked);
$("gConfirm").onchange=e=>setG("confirm",e.target.checked);
$("resume").onclick=()=>{const a=loadActive();if(a)startPlayer(a)};
function newRoutine(){
  if(S.routines.length>=MAX_SLOTS)return;
  const r={id:"r"+now().toString(36),name:"Routine "+(S.routines.length+1),settings:{},days:[{items:[]}]};
  S.routines.push(r);save();openRoutine(r.id);openRoutineSheet(true);
}

/* =================== STATISTIK =================== */
let stTab="w";
$("openStats").onclick=()=>show("stats");
document.querySelectorAll("[data-st]").forEach(b=>b.onclick=()=>{stTab=b.dataset.st;renderStats()});
function exStats(){
  const ag={};
  S.log.forEach(en=>(en.items||[]).forEach(x=>{
    if(!x.sets||!x.sets.length)return;
    const a=ag[x.ex]||(ag[x.ex]={ex:x.ex,name:x.name,n:0,sets:0,reps:0,secs:0,kg:0,last:0,hist:[]});
    a.n++;a.sets+=new Set(x.sets.map(z=>z.set+"|"+(z.part||0))).size;
    x.sets.forEach(z=>{if(z.mode==="reps")a.reps+=z.actual||0;else a.secs+=z.done||0;if(z.kg>a.kg)a.kg=z.kg});
    a.last=Math.max(a.last,en.d);a.hist.push({d:en.d,rname:en.rname,x});
  }));
  return Object.values(ag).sort((a,b)=>b.last-a.last);
}
function renderStats(){
  const tot=S.log.reduce((a,en)=>a+(en.t||0),0);
  $("stSum").textContent=`${S.log.length} ${S.log.length===1?"Workout":"Workouts"} · ${fmt(tot)} gesamt`;
  document.querySelectorAll("[data-st]").forEach(b=>b.setAttribute("aria-selected",b.dataset.st===stTab));
  const L=$("stList");
  if(stTab==="w"){
    const rows=S.log.map((en,i)=>[en,i]).reverse();
    L.innerHTML=rows.map(([en,i])=>{const done=(en.items||[]).filter(x=>x.status==="erledigt").length;
      return `<button class="strow" data-wi="${i}"><span class="nm">${esc(en.rname)}${en.days>1?` · Tag ${en.day+1}`:""}</span><span class="sub">${new Date(en.d).toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"short",year:"numeric"})} · ${new Date(en.d).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}${en.items&&en.items.length?` · ${done} ${done===1?"Übung":"Übungen"}`:""}</span><span class="rt">${fmt(en.t)}</span></button>`}).join("")||'<div class="note" style="padding:16px">Noch keine Workouts gespeichert.</div>';
    L.querySelectorAll("[data-wi]").forEach(b=>b.onclick=()=>{
      const i=+b.dataset.wi,en=S.log[i];
      openSheet(dateText(en.d),en.rname,`<div class="small">${esc(entrySum(en))}</div><div class="res">${entryHTML(en)}</div><button class="btn danger" id="stDel">Workout aus der Statistik löschen</button>`);
      $("stDel").onclick=()=>{$("stDel").outerHTML='<button class="btn danger" id="stDel2">Wirklich löschen?</button>';$("stDel2").onclick=()=>{S.log.splice(i,1);save();closeSheet();renderStats();toast("Workout gelöscht")}};
    });
  }else{
    const ex=exStats();
    L.innerHTML=ex.map((a,i)=>{const parts=[`${a.n}× trainiert`,`${a.sets} ${a.sets===1?"Satz":"Sätze"}`];if(a.reps)parts.push(`${a.reps} Wdh.`);if(a.secs)parts.push(fmt(a.secs)+" gehalten");if(a.kg)parts.push(`bis ${kgNum(a.kg)} kg`);
      return `<button class="strow" data-ei="${i}"><span class="nm">${esc(a.name)}</span><span class="sub">${parts.join(" · ")}</span><span class="rt">${dateText(a.last)}</span></button>`}).join("")||'<div class="note" style="padding:16px">Noch keine Ergebnisse gespeichert.</div>';
    L.querySelectorAll("[data-ei]").forEach(b=>b.onclick=()=>{
      const a=ex[+b.dataset.ei];
      openSheet("Verlauf",a.name,`<div class="res">${a.hist.slice().reverse().map(h=>`<div class="ri"><div class="rh"><span>${dateText(h.d)} · ${esc(h.rname)}</span><span>${h.x.time?fmt(h.x.time):""}</span></div><div class="rd">${setsText(h.x)}</div></div>`).join("")}</div>`);
    });
  }
}

/* =================== ROUTINE: eine Ansicht =================== */
/* Alles hier wird dauerhaft in der Routine gespeichert (Werte, Pausen, Reihenfolge, Hinzufügen, Löschen).
   Nur „Überspringen“ gilt für heute – z. B. wenn ein Gerät besetzt ist. */
let R=null,rDay=0;
const skipT={};
const skipKey=()=>R.id+"|"+rDay;
const isSkipped=uid=>(skipT[skipKey()]||[]).includes(uid);
function setSkip(uid,on){const k=skipKey(),a=skipT[k]||(skipT[k]=[]),i=a.indexOf(uid);if(on&&i<0)a.push(uid);if(!on&&i>=0)a.splice(i,1)}
function openRoutine(id){R=getRoutine(id);if(!R)return;rDay=nextDay(R);show("routine")}
function dayItems(){return R.days[rDay].items.filter(it=>!it.off).map(it=>Object.assign(it,{status:isSkipped(it.uid)?"removed":"plan"}))}
function estimate(items,st,pauses){
  const W0={items:items.map(it=>Object.assign({},it,{status:it.status||"plan"})),settings:st,pauses:pauses||{}};
  return buildSteps(W0).reduce((a,s)=>a+(s.dur!=null?s.dur:s.type==="work"?repsEst(s):0),0);
}
function repsEst(s){const e=EXB[s.ex];const one=F.seqDur(e.build(s.o));const n=e.oneRun?1:s.o.reps;return one*n*(s.both?2:1)}
/* übersprungene Übungen unter der Timeline (dort gibt es keine Kästchen für sie) */
function skipLineHTML(items){const sk=items.filter(it=>it.status==="removed"&&!it.deleted);return sk.length?`<div class="skipline"><span>Heute übersprungen:</span>${sk.map(it=>`<button class="skc" data-unskip="${it.uid}">${esc(itemName(it))} ↺</button>`).join("")}</div>`:""}
function renderRoutine(){
  R=getRoutine(R.id);if(!R){show("home");return}
  if(rDay>=R.days.length)rDay=0;
  const items=dayItems(),act=items.filter(i=>i.status!=="removed");
  $("rEyebrow").textContent=R.preset?"Vorkonfiguriert":"Eigene Routine";
  $("rName").textContent=R.name;
  const nd=nextDay(R);
  $("rDays").hidden=R.days.length<2;
  $("rDays").innerHTML=R.days.map((d,i)=>`<button class="dtab" role="tab" aria-selected="${i===rDay}" data-d="${i}">${i===nd?'<span class="nx">nächster</span>':""}Tag ${i+1}</button>`).join("");
  $("rDays").querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{rDay=+b.dataset.d;renderRoutine()});
  $("rSum").textContent=`${R.days.length>1?"Tag "+(rDay+1)+" von "+R.days.length+" · ":""}${act.length} ${act.length===1?"Übung":"Übungen"} · ca. ${Math.round(estimate(act,R.settings,R.pauses)/60)} min`;
  $("rStart").disabled=!act.length;
  $("rView").querySelectorAll("[data-v]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===rView));
  $("rList").hidden=rView!=="list";$("rTl").hidden=rView!=="tl";
  if(rView==="tl"){
    renderTimeline($("rTl"),{items,settings:R.settings,pauses:R.pauses},{
      onPause:(pk,v)=>{setPause(R.id,pk,v);renderRoutine()},
      onEdit:(it,set)=>editR(it,set)});
    $("rTl").insertAdjacentHTML("beforeend",skipLineHTML(items));
  }
  const list=$("rList");
  list.innerHTML=items.length?items.map((it,i)=>{
    const rm=it.status==="removed",lt=lastText(R.id,it.uid);
    const nx=items[i+1],canLink=!rm&&!it.pair&&nx&&nx.status!=="removed"&&!nx.pair;
    return rowHTML(it,i,{lock:rm,cls:(rm?"off":"")+linkCls(items,i),tags:rm?'<span class="tag skip">heute übersprungen</span>':"",extra:lt?`<span class="lastv">${esc(lt)}</span>`:"",link:canLink?!!it.link:null,
      action:rm?`<button class="act restore" data-unskip="${it.uid}">Rückgängig</button>`:`<button class="act" data-skip="${it.uid}" aria-label="Heute überspringen">${ICON.skip}</button>`});
  }).join(""):'<div class="note" style="padding:14px">Noch keine Übungen.</div>';
  document.querySelectorAll("#routine [data-skip]").forEach(b=>b.onclick=e=>{e.stopPropagation();const it=items.find(x=>x.uid===b.dataset.skip);setSkip(it.uid,true);renderRoutine();toast(itemName(it)+" heute übersprungen")});
  document.querySelectorAll("#routine [data-unskip]").forEach(b=>b.onclick=e=>{e.stopPropagation();setSkip(b.dataset.unskip,false);renderRoutine()});
  bindTaps(list,i=>editR(items[i]));
  makeSortable(list,{onDrop:(a,b)=>{const u=items.map(x=>x.uid);moveArr(u,a,b);orderItems(R.id,rDay,u);renderRoutine()}});
  bindLinks(list,i=>{linkItem(R.id,rDay,items[i].uid,!items[i].link);renderRoutine()});
}
function editR(it,set){
  openEditor(it,{rid:R.id,st:R.settings,set,onChange:renderRoutine,skipped:isSkipped(it.uid),
    onSkip:on=>{setSkip(it.uid,on);renderRoutine();toast(on?itemName(it)+" heute übersprungen":itemName(it)+" ist wieder dabei")},
    onDelete:()=>{deleteItem(R.id,rDay,it.uid);setSkip(it.uid,false);renderRoutine();toast(itemName(it)+" gelöscht")}});
}
$("rStart").onclick=()=>{if(loadActive()){openSheet("Workout läuft","Es läuft schon ein Workout",`<div class="note">Erst das laufende Workout beenden oder fortsetzen.</div><button class="btn primary big" id="goRun">Zum laufenden Workout</button>`);$("goRun").onclick=()=>{closeSheet();startPlayer(loadActive())};return}startWorkout()};
$("rAdd").onclick=()=>openPicker(ids=>{addItems(R.id,rDay,ids);save();renderRoutine()});
$("rMore").onclick=()=>openRoutineSheet();
/* Name, Tage, Löschen (eigene Routinen) bzw. Kopieren/Zurücksetzen (Morgenroutine) */
function openRoutineSheet(focusName){
  if(R.preset){
    const offs=MORGEN.items.filter(d=>MORGEN_OFF(d.uid));
    const changed=Object.keys(S.morgen.items).length||(S.morgen.extra||[]).length||S.morgen.order||Object.keys(S.morgen.pauses||{}).length;
    openSheet("Vorkonfiguriert",R.name,(offs.length?`<h3>Gelöschte Übungen</h3><div class="list">${offs.map(d=>`<div class="row"><div class="mid"><span class="nm">${esc(d.pair?d.pair.name:EXB[d.ex].name)}</span></div><button class="act restore" data-back-in="${d.uid}">Wieder rein</button></div>`).join("")}</div>`:"")+
      `<button class="btn primary big" id="rsOk">Fertig</button><button class="btn" id="rsCopy">Als eigene Routine kopieren</button>${changed?`<button class="btn danger" id="rsReset">Auf Original zurücksetzen</button>`:""}`);
    $("shBody").querySelectorAll("[data-back-in]").forEach(b=>b.onclick=()=>{setMorgenOff(b.dataset.backIn,false);renderRoutine();openRoutineSheet()});
    $("rsCopy").onclick=()=>{
      if(S.routines.length>=MAX_SLOTS){toast("Alle 5 Slots belegt – erst eine Routine löschen");return}
      const r={id:"r"+now().toString(36),name:R.name+" (Kopie)",settings:{},pauses:clone(R.pauses||{}),days:[{items:R.days[0].items.filter(it=>!it.pair&&!it.off).map(it=>({uid:uidGen(),ex:it.ex,o:clone(it.o),so:clone(it.so||{}),link:!!it.link}))}]};
      S.routines.push(r);save();closeSheet();
      if(R.days[0].items.some(it=>it.pair))toast("Paare (z. B. Kick-out + Dehnung) gibt es nur in der Morgenroutine");
      R=getRoutine(r.id);rDay=0;show("routine",false);history.replaceState({s:"routine"},"");
    };
    if($("rsReset"))$("rsReset").onclick=()=>{const b=$("rsReset");if(!b.dataset.sure){b.dataset.sure=1;b.textContent="Wirklich? Alle Änderungen gehen verloren";return}
      S.morgen={items:{},settings:{},pauses:{}};save();closeSheet();renderRoutine();toast("Morgenroutine wie im Original")};
    $("rsOk").onclick=closeSheet;
    return;
  }
  const r=rawRoutine(R.id);if(!r)return;
  openSheet("Routine bearbeiten",r.name,`<label class="field"><span>Name</span><input id="rsName" maxlength="40" autocomplete="off" value="${esc(r.name)}"></label>
    <div class="sg"><span>Anzahl Tage</span><div class="stepper"><button id="rsMinus" aria-label="weniger">−</button><span class="num" id="rsDays">${r.days.length}</span><button id="rsPlus" aria-label="mehr">+</button></div></div>
    <div id="rsDayNote"></div>
    <button class="btn primary big" id="rsOk">Fertig</button><button class="btn danger" id="rsDel">Routine löschen</button>`,{onClose:()=>{if(screen==="routine")renderRoutine()}});
  const nm=$("rsName");
  nm.oninput=()=>{r.name=nm.value.trim()||"Ohne Namen";$("shTitle").textContent=r.name;save()};
  nm.onkeydown=e=>{if(e.key==="Enter")closeSheet()};
  if(focusName)setTimeout(()=>{nm.focus();nm.select()},60);
  const upd=()=>{$("rsDays").textContent=r.days.length;$("rsDayNote").innerHTML=""};
  $("rsPlus").onclick=()=>{if(r.days.length>=14)return;r.days.push({items:[]});save();upd()};
  $("rsMinus").onclick=()=>{if(r.days.length<=1)return;const last=r.days[r.days.length-1];
    if(last.items.length&&!$("rsDayDel")){$("rsDayNote").innerHTML=`<button class="btn danger" id="rsDayDel">Tag ${r.days.length} mit ${last.items.length} ${last.items.length===1?"Übung":"Übungen"} löschen</button>`;$("rsDayDel").onclick=()=>{r.days.pop();save();upd()};return}
    r.days.pop();save();upd()};
  $("rsOk").onclick=closeSheet;
  $("rsDel").onclick=()=>{const b=$("rsDel");if(!b.dataset.sure){b.dataset.sure=1;b.textContent="Wirklich löschen? Statistik bleibt";return}
    S.routines=S.routines.filter(x=>x.id!==r.id);delete S.last[r.id];save();sheetClose=null;closeSheet();history.back();setTimeout(()=>{if(screen!=="home")show("home")},80);toast("Routine gelöscht")};
}
/* Ablauf-Einstellungen einer Routine */
function renderSettings(box,rid,st,after){
  box.innerHTML=`<div class="note">Pausen: ${fmtSecs(gv("rest"))} nach jedem Satz, ${fmtSecs(gv("side"))} zwischen den Seiten – änderbar im Hauptmenü unter „Einstellungen“.</div>`+
    `<label class="toggle"><span>Wiederholungen bestätigen<small>Nach jedem Satz „Geschafft“ oder „Andere Zahl“. Aus = beide Seiten in einem Durchgang.</small></span><input type="checkbox" data-confirm${st.confirm?" checked":""}></label>`;
  box.querySelector("[data-confirm]").onchange=e=>{setRoutineSetting(rid,"confirm",e.target.checked);after()};
}
/* Startwerte beim Hinzufügen: zuletzt eingestellte Werte dieser Übung (egal in welcher Routine), sonst Katalog */
function catOpt(ex){let s={};try{s=(JSON.parse(localStorage.getItem(CAT)||"{}").ex||{})[ex]||{}}catch(_){}return Object.assign({},exDef(ex),s,(S.exLast||{})[ex]||{})}
function rememberValues(it){S.exLast=S.exLast||{};S.exLast[it.ex]=Object.assign({},it.o);if(it.pair)S.exLast[it.pair.ex2]=Object.assign({},it.pair.o2);save()}

/* =================== TIMELINE: jeder Satz ein Kästchen, Pausen als Linien =================== */
let rView="list";
document.querySelectorAll("#rView [data-v]").forEach(b=>b.onclick=()=>{rView=b.dataset.v;renderRoutine()});
const TL_COL=["#00E5FF","#FFB547","#5BE38C","#B18CFF","#FF7AB6","#F2E863","#6FA8FF","#FF8F6B"];
function pauseText(v){return v===0?"0 s":fmtSecs(v)}
function renderTimeline(box,Wk,h){
  const steps=buildSteps(Wk),colOf={};let ci=0;
  const curI=h.curKey?steps.findIndex(x=>x.key===h.curKey):-1;
  Wk.items.forEach(it=>{if(it.status!=="removed")colOf[it.uid]=TL_COL[ci++%TL_COL.length]});
  const seq=[];let lastBox=null;
  steps.forEach((s,i)=>{
    if(s.type==="work"){
      const k=[s.uid,s.set,s.side,s.part].join("|");
      if(lastBox&&lastBox.k===k&&seq[seq.length-1]===lastBox){lastBox.i2=i;return} // Drop-Set-Stufen = ein Kästchen
      if(seq.length&&seq[seq.length-1].box)seq.push({edge:true,none:true});
      lastBox={box:true,k,s,i};seq.push(lastBox);
    }else if(seq.length)seq.push({edge:true,s,i});
  });
  const boxes=seq.filter(x=>x.box),PER=3;
  if(!boxes.length){box.innerHTML='<div class="note" style="padding:14px">Noch keine Sätze.</div>';return}
  const boxHTML=b=>{const s=b.s,last=b.i2!=null?b.i2:b.i,st=curI<0?"":last<curI?" done":b.i<=curI?" now":"",it=Wk.items.find(x=>x.uid===s.uid),e=EXB[s.ex],uni=isUni(EXB[s.ex],s.o);
    const side=s.both?"L+R":uni||it.pair?(s.side?"R":"L"):"";
    return `<button class="tlb${st}" style="--c:${colOf[s.uid]}" data-b="${boxes.indexOf(b)}"${st===" done"?" disabled":""}><b>${esc(e.name)}</b><small>S${s.set}${side?" · "+side:""}</small></button>`};
  const edgeHTML=(x,turn)=>{
    if(x.none)return `<span class="tle${turn?" turn":""} none"><i></i></span>`;
    const s=x.s,open=s.dur==null,dn=curI>=0&&x.i<curI;
    const lab=open?"▶":pauseText(s.dur);
    return `<button class="tle${turn?" turn":""}${open?" open":""}${s.custom?" custom":""}${s.kind==="side"?" side":""}${dn?" done":""}" ${open||dn?"disabled":""} data-e="${seq.indexOf(x)}" aria-label="Pause ${lab}"><i></i><span>${lab}</span></button>`};
  let html="",row=[],ri=0;
  const flush=()=>{html+=`<div class="tlrow${ri%2?" rev":""}">${row.join("")}</div>`;row=[];ri++};
  let bi=0;
  for(let i=0;i<seq.length;i++){
    const x=seq[i];
    if(x.box){row.push(boxHTML(x));bi++;continue}
    if(bi%PER===0&&bi<boxes.length){flush();html+=`<div class="tlturnrow ${(ri-1)%2?"l":"r"}">${edgeHTML(x,true)}</div>`}
    else row.push(edgeHTML(x,false));
  }
  if(row.length)flush();
  box.innerHTML=`<div class="tl">${html}</div>`;
  box.querySelectorAll("[data-e]").forEach(b=>b.onclick=()=>{const s=seq[+b.dataset.e].s;openPauseSheet(s,h.onPause)});
  box.querySelectorAll("[data-b]").forEach(b=>b.onclick=()=>{
    const s=boxes[+b.dataset.b].s,it=Wk.items.find(x=>x.uid===s.uid);
    h.onEdit(it,it.pair?0:s.set);
  });
}
/* Pause einstellen (Timeline und laufendes Training) */
function openPauseSheet(s,onSet){
  const def=s.kind==="side"||s.kind==="umbau"?gv("side"):gv("rest");
  let v=s.dur;
  const what={side:"Zwischen den Seiten",umbau:"Umbau",set:"Nach dem Satz",link:"Vor der verknüpften Übung"}[s.kind]||"Pause";
  openSheet(what,"Pause einstellen",`<div class="wheelcenter">${wheelRow("pz","Diese Pause",EXB.balance,"rest")}</div>
    <button class="btn primary big" id="pzOk">Übernehmen</button>${s.custom?`<button class="btn ghost" id="pzStd">Zurück auf Standard (${pauseText(def)})</button>`:""}`);
  const wh=initWheel($("shBody").querySelector(".wheelrow"),EXB.balance,{get:()=>v,set:x=>{v=x}});
  $("pzOk").onclick=()=>{const x=wh.value();closeSheet();onSet(s.pk,x)};
  if($("pzStd"))$("pzStd").onclick=()=>{closeSheet();onSet(s.pk,null)};
}

/* =================== KATALOG-AUSWAHL =================== */
const MUSCLES=[["alle","Alle"],["ruecken","Unterer Rücken"],["knie","Knie · ATG"],["huefte","Hüfte"],["bauch","Bauch"],["morgen","Morgenroutine"]];
const muscleOf=e=>e.muscle||"ruecken";
let pickMuscle="alle";
/* Mehrfachauswahl: antippen = auswählen (Nummer = Reihenfolge), unten alle auf einmal hinzufügen. Suche oben. */
const norm=t=>String(t||"").toLowerCase().replace(/ä/g,"a").replace(/ö/g,"o").replace(/ü/g,"u").replace(/ß/g,"ss").replace(/[^a-z0-9 ]/g," ");
function openPicker(onAdd){
  const sel=[];let q="";
  const rowOf=e=>{const o=catOpt(e.id);return `<div class="row pick" data-pick="${e.id}" role="button" tabindex="0" aria-pressed="false"><span class="pnum"></span><img alt="" src="${thumbOf({ex:e.id,o})}" width="44" height="44"><div class="mid"><span class="nm">${esc(e.name)}${e.warn?`<span class="tag rm">${esc(e.warn)}</span>`:""}</span><span class="val">${esc(valText(e,o))}</span><span class="def">${esc(e.de)}</span></div></div>`};
  const body=openSheet("Übungskatalog","Übungen hinzufügen",`<input class="pksearch" id="pkQ" type="search" placeholder="Suchen …" autocomplete="off" aria-label="Übung suchen"><div class="mtabs" id="pkTabs">${MUSCLES.map(([id,l])=>`<button class="dtab" aria-selected="${id===pickMuscle}" data-m="${id}">${l}</button>`).join("")}</div><div id="pkRes"></div><div class="pickfoot"><button class="btn primary big" id="pkAdd" disabled></button></div>`);
  const paint=()=>{
    body.querySelectorAll("[data-pick]").forEach(r=>{const n=sel.indexOf(r.dataset.pick)+1;r.classList.toggle("sel",n>0);r.setAttribute("aria-pressed",n>0);r.querySelector(".pnum").textContent=n||""});
    const b=$("pkAdd");b.disabled=!sel.length;b.textContent=sel.length?(sel.length===1?"1 Übung hinzufügen":sel.length+" Übungen hinzufügen"):"Übungen antippen";
  };
  const renderRes=()=>{
    let secs;
    if(q){const words=norm(q).split(" ").filter(Boolean);const hit=EXL.filter(e=>{const t=norm([e.name,e.de,e.group,(MUSCLES.find(m=>m[0]===muscleOf(e))||[])[1]].join(" "));return words.every(w=>t.includes(w))});secs=[[hit.length?hit.length+" Treffer":"",hit]]}
    else if(pickMuscle==="alle")secs=MUSCLES.slice(1).map(([id,l])=>[l,EXL.filter(e=>muscleOf(e)===id)]);
    else{const mine=EXL.filter(e=>muscleOf(e)===pickMuscle);secs=[...new Set(mine.map(e=>e.group))].map(g=>[g,mine.filter(e=>e.group===g)])}
    $("pkTabs").hidden=!!q;
    body.querySelectorAll("[data-m]").forEach(b=>b.setAttribute("aria-selected",b.dataset.m===pickMuscle));
    $("pkRes").innerHTML=q&&!secs[0][1].length?'<div class="note" style="padding:14px">Nichts gefunden.</div>':secs.filter(x=>x[1].length).map(([g,list])=>`${g?`<h3>${esc(g)}</h3>`:""}<div class="list">${list.map(rowOf).join("")}</div>`).join("");
    $("pkRes").querySelectorAll("[data-pick]").forEach(r=>{const tog=()=>{const id=r.dataset.pick,i=sel.indexOf(id);if(i<0)sel.push(id);else sel.splice(i,1);paint()};r.onclick=tog;r.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();tog()}}});
    paint();
  };
  body.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{pickMuscle=b.dataset.m;renderRes()});
  $("pkQ").oninput=()=>{q=$("pkQ").value.trim();renderRes()};
  $("pkAdd").onclick=()=>{if(!sel.length)return;const ids=sel.slice();closeSheet();onAdd(ids);toast(ids.length===1?EXB[ids[0]].name+" hinzugefügt":ids.length+" Übungen hinzugefügt")};
  renderRes();
}

/* =================== EDITOR (Werte einer Übung) =================== */
/* ctx.rid: Routine, in der dauerhaft gespeichert wird (null = nur für heute) */
/* ctx.set: nur diesen Satz bearbeiten (Abweichungen landen in it.so[satz]) */
function openEditor(it,ctx){
  const e=EXB[it.ex],S1=ctx.set&&!it.pair?ctx.set:0;
  const persist=()=>{rememberValues(it);if(ctx.rid)persistItem(ctx.rid,it);if(ctx.onChange)ctx.onChange()};
  const O=()=>S1?setOpt(it,S1):it.o;
  const put=(k,v)=>{
    if(!S1){it.o[k]=v;return}
    it.so=it.so||{};const so=it.so[S1]||(it.so[S1]={});
    if(it.o[k]===v)delete so[k];else so[k]=v;
    if(!Object.keys(so).length)delete it.so[S1];
  };
  const render=()=>{
    const o=O();let h="";
    if(!it.pair){
      for(const [k,l,choices] of e.opts(o))h+=`<div class="opt"><span>${l}</span><div class="seg" role="group" aria-label="${l}">${choices.map(([v,t])=>`<button class="sbtn" data-k="${k}" data-v="${v}" aria-pressed="${o[k]===v}">${t}</button>`).join("")}</div></div>`;
      const uni=isUni(e,o)||e.perSide;
      if(!S1)h+=wheelRow("sets","Sätze",e,"sets");
      if(o.mode==="hold")h+=wheelRow("secs",e.drop?"Sekunden pro Stufe":e.timeWord||(uni?"Zeit pro Seite":"Zeit"),e,"secs");
      else h+=wheelRow("reps",e.repsLabel||(uni?"Wiederholungen pro Seite":"Wiederholungen"),e,"reps");
      if(e.weight!=="none"){
        const lab={plate:"Gewicht (Scheibe)",kb:"Kettlebell",kb2:"Kettlebell pro Hand",cable:"Gewicht am Kabelzug",db:"Kurzhantel pro Hand",bar:"Langhantel gesamt"}[e.weight];
        h+=wheelRow("kg",e.id==="bridge"?"Gewicht (Scheibe auf dem Becken)":lab,e,"kg");
      }
    }else{
      h+=wheelRow("secs",EXB[it.ex].name+" pro Seite",e,"secs")+wheelRow("secs2",EXB[it.pair.ex2].name+" pro Seite",EXB[it.pair.ex2],"secs2");
    }
    const own=S1&&it.so&&it.so[S1]&&Object.keys(it.so[S1]).length;
    h+=`<button class="btn primary big" id="edOk">Fertig</button>${own?`<button class="btn" id="edAll">Für alle Sätze übernehmen</button>`:""}`;
    if(ctx.onSkip)h+=`<button class="btn" id="edSkip">${ctx.skipped?"Doch machen":ctx.skipLabel||"Heute überspringen"}</button>`;
    if(S1&&(it.o.sets||1)>1)h+=`<button class="btn danger" id="edDel">Satz ${S1} löschen</button>`;
    else if(ctx.onDelete&&!S1)h+=`<button class="btn danger" id="edDelEx">Übung löschen</button>`;
    const n=it.o.sets||1;
    const body=openSheet(S1?`Satz ${S1} von ${n}`:(e.group&&!it.pair?e.group:"Übung"),itemName(it),`<div class="edprev"><canvas id="edCv" width="240" height="240" aria-label="Vorschau ${esc(e.name)}"></canvas><div class="small">${esc(e.de||"")}</div></div>`+h,{onClose:ctx.onClose});
    F.previewStart(e,O(),$("edCv"));
    body.querySelectorAll(".sbtn").forEach(b=>b.onclick=()=>{put(b.dataset.k,b.dataset.v);persist();render()});
    body.querySelectorAll(".wheelrow").forEach(row=>{
      const k=row.dataset.k;
      if(k==="secs2"){initWheel(row,EXB[it.pair.ex2],{get:()=>it.pair.o2.secs,set:v=>{it.pair.o2.secs=v;persist()},std:it.pair.base2?it.pair.base2.secs:null});return}
      initWheel(row,e,{get:()=>O()[k],set:v=>{put(k,v);persist()},
        side:k==="kg"&&e.weight==="plate"?(v=>v>0?platesVis(v):""):null});
    });
    if($("edSkip"))$("edSkip").onclick=()=>{const f=ctx.onSkip;closeSheet();f(!ctx.skipped)};
    if($("edDelEx"))$("edDelEx").onclick=()=>{const b=$("edDelEx");if(!b.dataset.sure){b.dataset.sure=1;b.textContent="Wirklich aus der Routine löschen?";return}const f=ctx.onDelete;closeSheet();f()};
    $("edOk").onclick=closeSheet;
    if($("edAll"))$("edAll").onclick=()=>{it.o=Object.assign({},it.o,it.so[S1]);it.so={};persist();toast("Gilt jetzt für alle Sätze");render()};
    if($("edDel"))$("edDel").onclick=()=>{delSet(it,S1);persist();closeSheet();toast(`Satz ${S1} gelöscht`)};
  };
  render();
}
const MORGEN_OFF=uid=>!!(S.morgen.items[uid]&&S.morgen.items[uid].off);

/* =================== WORKOUT: ABLAUF =================== */
/* Schritte aus den aktiven Übungen. Schlüssel bleiben stabil, damit Änderungen mitten im Workout die Position halten. */
/* Sätze einer Übung heute (nach „Übung beenden“ weniger) */
const effSets=it=>it.pair?(it.cut===0?0:1):Math.min(it.o.sets||1,it.cut!=null?it.cut:99);
/* Pausen pro Übung (o.rest = Satzpause, o.sw = Seitenwechsel), sonst Routine-Einstellung */
/* Pausen zentral (Hauptmenü → Einstellungen): nach jedem Satz und zwischen den Seiten – für alle Übungen gleich */
const restOf=()=>gv("rest");
const swOf=()=>gv("side");
/* Blöcke: verknüpfte Übungen (it.link = mit der nächsten verknüpft) laufen als Supersatz */
function blocksOf(items){
  const act=items.filter(it=>it.status!=="removed"&&effSets(it)>0),out=[];
  act.forEach(it=>{const b=out[out.length-1],l=b&&b[b.length-1];if(l&&l.link&&!l.pair&&!it.pair)b.push(it);else out.push([it])});
  return out;
}
function blockRange(items,i){let a=i,b=i;while(a>0&&items[a-1].link&&items[a-1].status!=="removed")a--;while(b<items.length-1&&items[b].link)b++;return [a,b]}
/* Schritte aus den aktiven Übungen. Schlüssel bleiben stabil, damit Änderungen mitten im Workout die Position halten. */
function buildSteps(Wk){
  const st=Wk.settings,out=[],PZ=Wk.pauses||{};
  /* jede Pause hat einen festen Schlüssel (pk); eigene Werte aus der Timeline/dem Training gehen vor */
  const T=(uid,label,dur,kind,x)=>{x=x||{};if(x.pk&&PZ[x.pk]!=null){dur=PZ[x.pk];x.custom=true}out.push(Object.assign({type:"trans",uid,label,dur,kind},x))};
  blocksOf(Wk.items).forEach((bl,bi)=>{
    const first=bl[0];
    T(first.uid,bi===0?"Mach dich bereit":"Nächste Übung",null,"next",{big:true,hub:bi>0}); // ohne Zeit: weiter per Knopf
    if(first.pair){
      const it=first,o=it.o,Wo=x=>out.push(Object.assign({type:"work",uid:it.uid,ex:it.ex,o,part:0,stage:null},x));
      [0,1].forEach(sd=>{
        if(sd)T(it.uid,"Seitenwechsel",swOf(it,st),"side",{pk:it.uid+"|side|p"});
        Wo({side:sd,set:1,mode:"hold",dur:o.secs});
        T(it.uid,"Umbau · "+it.pair.umbau,swOf(it,st),"umbau",{pk:it.uid+"|umbau|"+sd});
        Wo({ex:it.pair.ex2,o:it.pair.o2,part:1,side:sd,set:1,mode:"hold",dur:it.pair.o2.secs});
      });
      return;
    }
    const max=Math.max(...bl.map(effSets));
    for(let r=1;r<=max;r++){
      const mem=bl.filter(it=>effSets(it)>=r);
      if(r>1){const prev=bl.filter(it=>effSets(it)>=r-1);T(mem[0].uid,"Satzpause",restOf(prev[prev.length-1],st),"set",{pk:mem[0].uid+"|set|"+r})}
      mem.forEach((it,j)=>{
        const e=EXB[it.ex],o=setOpt(it,r),uni=isUni(e,o);
        const Wo=x=>out.push(Object.assign({type:"work",uid:it.uid,ex:it.ex,o,part:0,stage:null},x));
        if(j>0)T(it.uid,"Pause · gleich "+e.name,restOf(mem[j-1],st),"link",{pk:it.uid+"|link|"+r});
        if(o.mode==="reps"&&uni&&!st.confirm){Wo({side:0,set:r,mode:"reps",both:true});return}
        (uni?[0,1]:[0]).forEach(sd=>{
          if(sd)T(it.uid,"Seitenwechsel",swOf(it,st),"side",{pk:it.uid+"|side|"+r});
          if(o.mode==="reps")Wo({side:sd,set:r,mode:"reps"});
          else if(e.drop)[0,1,2].forEach(k=>Wo({side:sd,set:r,stage:k,mode:"hold",dur:o.secs}));
          else Wo({side:sd,set:r,mode:"hold",dur:o.secs});
        });
      });
    }
  });
  out.forEach((s,i)=>{
    s.key=[s.uid,s.type,s.part||0,s.set||0,s.side||0,s.stage==null?"":s.stage,s.kind||"",s.mode||""].join("|")+(s.type==="trans"?"#"+(out[i+1]?out[i+1].set+"."+out[i+1].side:""):"");
    if(s.type==="trans"){const n=out[i+1];s.next=n;if(!s.set)s.set=n?n.set:1}
  });
  return out;
}

let W=null,steps=[],idx=0;
function loadActive(){try{const a=JSON.parse(localStorage.getItem(ACT)||"null");return a&&!a.ended?a:null}catch(_){return null}}
function saveW(){if(!W)return;try{localStorage.setItem(ACT,JSON.stringify(W))}catch(_){}}
function startWorkout(){
  const items=dayItems().map(it=>({uid:it.uid,ex:it.ex,o:clone(it.o),base:it.base?clone(it.base):null,pair:it.pair?clone(it.pair):null,link:!!it.link,so:clone(it.so||{}),status:it.status,planned:true}));
  W={v:1,id:"w"+now().toString(36),rid:R.id,rname:R.name,day:rDay,days:R.days.length,settings:clone(R.settings),pauses:clone(R.pauses||{}),
     startedAt:now(),items,cur:null,stepStart:now(),pauseAt:null,pausedMs:0,extra:0,res:{},pending:null,ended:false,visited:[]};
  delete skipT[skipKey()];
  startPlayer(W,true);
}

/* ---- Zeit aus Zeitstempeln ---- */
const elapsed=()=>W?Math.max(0,((W.pauseAt||now())-W.stepStart-W.pausedMs)/1000):0;
const curDur=s=>(s.dur||0)+(W.extra||0);
const timed=s=>!(s.type==="work"&&s.mode==="reps")&&!(s.type==="trans"&&s.dur==null);
const stepEnd=s=>W.stepStart+W.pausedMs+curDur(s)*1000;

/* ---- Schnittstellen nach außen (Spotify-Chat, Android-Hülle) ---- */
/* Spotify-Steuerung hängt sich hier ein: window.TrainingHooks.onPhase = (phase, info) => {...} */
const Hooks=window.TrainingHooks=window.TrainingHooks||{onPhase:function(phase,info){}};
function onPhase(phase,info){
  try{if(typeof Hooks.onPhase==="function")Hooks.onPhase(phase,info)}catch(err){console.warn("onPhase",err)}
  try{document.dispatchEvent(new CustomEvent("training:phase",{detail:Object.assign({phase},info)}))}catch(_){}
}
function phaseInfo(s,extra){
  const it=W.items.find(x=>x.uid===s.uid)||{},ws=s.type==="work"?s:s.next||s;
  return Object.assign({uebung:ws&&ws.ex?EXB[ws.ex].name:itemName(it),uebungId:ws&&ws.ex||it.ex,satz:s.set||1,saetze:(it.o&&it.o.sets)||1,seite:(s.side||0)+1,
    pauseSek:s.type==="trans"?(s.dur==null?null:curDur(s)):0,offen:s.type==="trans"&&s.dur==null,art:s.type==="trans"?s.kind:(s.mode||"hold"),endetUm:timed(s)?stepEnd(s):null,workout:W.rname},extra||{});
}
/* Geplante Ereignisse ab jetzt (bis zum nächsten Schritt ohne festes Ende). Für Töne/Spotify nativ im Hintergrund. */
function plannedEvents(){
  if(!W||W.pauseAt)return [];
  const out=[];let t=stepEnd(steps[idx]);
  for(let i=idx;i<steps.length;i++){
    const s=steps[i];
    if(i>idx){out.push(Object.assign({at:t,typ:"phase",phase:s.type==="work"?"work":"rest"},phaseInfo(s,{endetUm:null,pauseSek:s.type==="trans"?s.dur:0})));t+=(s.dur||0)*1000}
    if(!timed(s))break;
    for(const k of [5,4,3,2,1])out.push({at:(i===idx?stepEnd(s):t)-k*1000,typ:"ton",ton:"countdown"});
    if(s.type==="trans"&&(i===idx?curDur(s):s.dur)>10)out.push({at:(i===idx?stepEnd(s):t)-10000,typ:"sprache",text:"zehn"});
    if(i===steps.length-1)out.push({at:i===idx?stepEnd(s):t,typ:"phase",phase:"done"});
  }
  return out.filter(e=>e.at>now()-500);
}
function nativePlugin(){const c=window.Capacitor;return c&&c.Plugins&&c.Plugins.Training}
function syncNative(){
  const pl=nativePlugin();if(!pl)return;
  try{if(W&&!W.ended&&typeof pl.scheduleEvents==="function")Promise.resolve(pl.scheduleEvents({events:plannedEvents(),workout:{name:W.rname,startedAt:W.startedAt}})).catch(()=>{});
      else if((!W||W.ended)&&typeof pl.clearEvents==="function")Promise.resolve(pl.clearEvents()).catch(()=>{})}catch(_){}
}
window.TrainingApp={plannedEvents,getState:()=>W?clone(W):null,steps:()=>steps.map(s=>({key:s.key,type:s.type,label:s.label,dur:s.dur,ex:s.ex}))};

/* ---- Ergebnisse ---- */
function resOf(uid){return W.res[uid]||(W.res[uid]={time:0,sets:[]})}
function putSet(uid,entry){const r=resOf(uid),k=[entry.set,entry.side,entry.stage,entry.part].join("|");r.sets=r.sets.filter(x=>[x.set,x.side,x.stage,x.part].join("|")!==k);r.sets.push(entry);r.sets.sort((a,b)=>a.set-b.set||(a.part||0)-(b.part||0)||a.side-b.side||(a.stage||0)-(b.stage||0))}
function recordHold(s,el,natural){
  const r=resOf(s.uid);r.time+=Math.min(el,s.dur||el);
  if(natural||el>=.5*(s.dur||0))putSet(s.uid,{set:s.set,side:s.side,stage:s.stage,part:s.part||0,mode:"hold",target:s.dur,done:Math.round(Math.min(el,s.dur))});
}

/* ---- Schritte wechseln ---- */
function enter(i,at,opts={}){
  idx=Math.max(0,Math.min(i,steps.length-1));
  const s=steps[idx];
  W.cur=s.key;W.stepStart=at||now();W.pausedMs=0;W.extra=0;if(W.pauseAt)W.pauseAt=W.stepStart;
  if(s.type==="work"){W.visited=W.visited||[];if(!W.visited.includes(s.uid))W.visited.push(s.uid)}
  if(!opts.quiet){
    stepUI();
    if(s.type==="work"){beep(1046,.2,.6);buzz(60)}
    onPhase(s.type==="work"?"work":"rest",phaseInfo(s,opts.info));
    syncNative();
  }
  saveW();
}
function advance(at,natural,quiet){
  const s=steps[idx],el=natural?curDur(s):elapsed();
  if(s.type==="work"&&s.mode!=="reps")recordHold(s,el,natural);
  if(idx+1>=steps.length){finish(at);return}
  if(!quiet&&s.type==="work"){beep(660,.15,.55);setTimeout(()=>beep(990,.22,.55),170);buzz([80,60,80])}
  enter(idx+1,at,{quiet});
}
/* Abgelaufene Zeit-Schritte nachholen (z. B. nach gesperrtem Bildschirm) */
function catchUp(){
  if(!W||W.ended)return;
  let n=0;
  while(W&&!W.ended&&!W.pauseAt&&n<1000){
    const s=steps[idx];if(!timed(s))break;
    const end=stepEnd(s);if(now()<end)break;
    const late=now()-end>1500;
    advance(end,true,late);n++;
    if(!late)break;
  }
  if(n&&W&&!W.ended&&now()-W.stepStart>0){const s=steps[idx];if(n>1||now()-W.stepStart>1500){stepUI();onPhase(s.type==="work"?"work":"rest",phaseInfo(s,{nachgeholt:true}));syncNative()}}
}
function setPaused(p){
  if(!W)return;
  if(p&&!W.pauseAt)W.pauseAt=now();
  else if(!p&&W.pauseAt){W.pausedMs+=now()-W.pauseAt;W.pauseAt=null}
  $("pauseIco").innerHTML=p?'<path d="M7 5v14l12-7z"/>':'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
  $("pause").setAttribute("aria-label",p?"Weiter":"Pause");
  updateMain();saveW();syncNative();
}
function back(){
  const s=steps[idx];
  if(s.type==="work"&&elapsed()>3){enter(idx);return}
  let j=idx-1;while(j>0&&steps[j].type==="trans")j--;
  enter(Math.max(0,j));
}
const atHub=()=>{const s=steps[idx];return !!(s&&s.type==="trans"&&s.kind==="next")};
function rebuildKeep(){
  if(!W||W.ended)return;
  const old=steps,oldIdx=idx,key=W.cur,wasHub=atHub();
  steps=buildSteps(W);
  if(!steps.length){finish();return}
  if(wasHub){ // Zwischenseite: nächste noch nicht begonnene Übung wird „als Nächstes“, Pausenuhr läuft weiter
    const vis=W.visited||[],j=steps.findIndex(s=>s.kind==="next"&&!vis.includes(s.uid));
    if(j<0){finish();return}
    const changed=steps[j].key!==key;idx=j;W.cur=steps[j].key;stepUI();saveW();syncNative();
    if(changed)onPhase("rest",phaseInfo(steps[j]));
    return;
  }
  let j=steps.findIndex(s=>s.key===key);
  if(j>=0){idx=j;stepUI();saveW();syncNative();return}
  const uid=key.split("|")[0],it=W.items.find(x=>x.uid===uid);
  if(it&&it.status!=="removed"){j=steps.findIndex(s=>s.uid===uid);enter(j);return}
  for(let k=oldIdx+1;k<old.length;k++){const n=steps.findIndex(s=>s.key===old[k].key);if(n>=0){enter(n);return}}
  finish();
}

/* ---- Player ---- */
function startPlayer(w,isNew){
  W=w;steps=buildSteps(W);
  if(!steps.length){W=null;toast("Keine Übungen aktiv");return}
  idx=Math.max(0,steps.findIndex(s=>s.key===W.cur));
  ensureAudio();lockScreen();
  $("home").hidden=$("routine").hidden=$("stats").hidden=true;$("done").hidden=true;$("player").hidden=false;
  $("tips").classList.remove("open");
  size();
  if(isNew){W.stepStart=now();enter(0)}
  else{setPaused(!!W.pauseAt);catchUp();if(!W||W.ended)return;stepUI();onPhase(steps[idx].type==="work"?"work":"rest",phaseInfo(steps[idx],{fortgesetzt:true}));syncNative()}
  setPaused(!!W.pauseAt);
  if(W.pending)showConfirm();
}
let shownKey="",clip=null,animT=0,lastSec=-1,cueEx="";
function itemOf(s){return W.items.find(x=>x.uid===s.uid)}
function clipFor(ws){
  const e=EXB[ws.ex],seq=e.build(ws.o);
  if(ws.mode==="reps"){
    const n=e.oneRun?1:ws.o.reps;
    if(ws.both){let loop=[];for(let i=0;i<n;i++)loop=loop.concat(seq);return {pre:[],loop,alt:true,repDur:F.seqDur(seq),reps:n}}
    return {pre:[],loop:seq,repDur:F.seqDur(seq),reps:n};
  }
  if(ws.stage!=null&&e.drop){
    const i=ws.stage,Pz=[seq[1][2],seq[3][2],seq[5][2]],lab=seq[[1,3,5][i]][0];
    const pre=i===0?[]:[[lab,seq[[2,4][i-1]][1],Pz[i-1],Pz[i]]];
    return {pre,loop:[[lab,2.2,Pz[i],Pz[i]]]};
  }
  return e.clip?e.clip(seq):{pre:[],loop:seq};
}
const firstPose=c=>(c.pre[0]||c.loop[0])[2];
function stepUI(){
  const s=steps[idx];if(!s)return;
  const ws=s.type==="work"?s:s.next,it=itemOf(s),e=EXB[ws.ex];
  const key=ws.ex+JSON.stringify(ws.o);
  if(key!==shownKey){const same=F.current===e;F.show(e,ws.o,same);shownKey=key}
  clip=clipFor(ws);animT=0;lastSec=-1;
  F.setMirror(ws.side===1);
  $("stage").classList.toggle("trans",s.type==="trans");
  const act=W.items.filter(x=>x.status!=="removed"),n=act.indexOf(it)+1,sets=it.pair?1:(it.o.sets||1);
  $("pEyebrow").textContent=(sets>1?`Übung ${n}/${act.length} · Satz ${s.set}/${sets}`:`Übung ${n} von ${act.length}`);
  $("pName").textContent=s.type==="trans"&&s.big?"Gleich: "+itemName(it):e.name;
  $("bar").style.width=(100*idx/steps.length)+"%";
  const tx=esc(!it.pair&&isMixed(it)?valText(EXB[ws.ex],Object.assign({},ws.o,{sets:1}))+` · Satz ${ws.set}`:itemText(it));
  $("target").innerHTML=(ws.mode==="reps"&&s.type==="work"?"Ziel: ":"")+`<b>${tx}</b> ✎`;
  if(cueEx!==ws.ex+"|"+JSON.stringify(ws.o)){cueEx=ws.ex+"|"+JSON.stringify(ws.o);$("cue").innerHTML=e.tips(ws.o).filter(x=>!x.startsWith("In der App")).map(x=>`<li>${esc(x)}</li>`).join("")}
  $("restCtrl").hidden=s.type==="trans"&&s.kind==="next";
  $("plus10").hidden=!(s.type==="trans"&&s.dur!=null);
  $("pzEdit").hidden=!(s.type==="trans"&&s.dur!=null&&s.pk);
  const hub=!!(s.type==="trans"&&s.hub);
  $("hub").hidden=!hub;$("stagebox").hidden=hub;$("readout").hidden=hub;$("tips").hidden=hub;
  if(hub)renderHub(s);
  updateMain();
}
function updateMain(){
  const s=steps[idx],m=$("main");if(!s)return;m.className="btn big";
  if(W.pauseAt){m.textContent="Weiter";m.classList.add("primary");return}
  if(s.type==="trans"){m.textContent=s.kind==="set"?"Nächster Satz":s.hub?"Nächste Übung ▶":s.kind==="next"?"Jetzt starten":"Weiter";m.classList.add(s.hub?"primary":"trans-btn")}
  else if(s.mode==="reps"){m.textContent=s.both?"Fertig – beide Seiten ✓":"Fertig ✓";m.classList.add("done-btn")}
  else m.textContent="Pause";
}
$("main").onclick=()=>{
  if(!W)return;ensureAudio();
  if(W.pauseAt){setPaused(false);return}
  const s=steps[idx];
  if(s.type==="trans"){advance();return}
  if(s.mode==="reps"){repsDone(s);return}
  setPaused(true);
};
function repsDone(s){
  const el=elapsed(),it=itemOf(s);resOf(s.uid).time+=el;
  const entry={set:s.set,side:s.side,stage:null,part:0,mode:"reps",target:s.o.reps,actual:s.o.reps,kg:s.o.kg||0,both:!!s.both,secs:Math.round(el)};
  if(W.settings.confirm&&!s.both){W.pending=entry;W.pending.uid=s.uid;W.pending.name=EXB[s.ex].name;W.pending.uni=isUni(EXB[s.ex],s.o)}
  else putSet(s.uid,entry);
  if(W.pending&&idx===steps.length-1){W.pending.last=true;saveW();showConfirm();return}
  advance();
  if(W&&W.pending)showConfirm();
}
$("pause").onclick=()=>setPaused(!W.pauseAt);
$("next").onclick=()=>{if(W)advance()};
$("prev").onclick=()=>{if(W)back()};
$("pzEdit").onclick=()=>{
  if(!W)return;const s=steps[idx];if(!(s.type==="trans"&&s.dur!=null&&s.pk))return;
  openPauseSheet(s,(pk,v)=>{W.pauses=W.pauses||{};if(v==null)delete W.pauses[pk];else W.pauses[pk]=v;setPause(W.rid,pk,v);rebuildKeep();saveW();toast(v==null?"Standard-Pause":"Pause: "+pauseText(v)+" – gespeichert")});
};
$("plus10").onclick=()=>{if(!W)return;W.extra=(W.extra||0)+10;saveW();syncNative();toast("+10 s")};
$("tips").onclick=()=>{const o=!$("tips").classList.contains("open");$("tips").classList.toggle("open",o);$("tips").setAttribute("aria-expanded",o)};
$("target").onclick=()=>{
  const s=steps[idx],it=itemOf(s);if(!it)return;
  const wasPaused=!!W.pauseAt;setPaused(true);
  editW(it,0,()=>{if(W&&!wasPaused)setPaused(false)});
};
$("plan").onclick=()=>openPlan();
$("mute").onclick=()=>{setG("sound",!gv("sound"));muteIcon()};
function muteIcon(){const on=gv("sound");$("muteIco").innerHTML=on?'<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>':'<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/>';$("mute").classList.toggle("off",!on);$("mute").setAttribute("aria-label",on?"Töne aus":"Töne an")}
$("close").onclick=()=>{
  const body=openSheet("Workout",`${W.rname} beenden?`,`<div class="note">Läuft seit ${fmt((now()-W.startedAt)/1000)}. Das Workout bleibt erhalten, bis du es hier beendest.</div>
    <button class="btn primary big" id="cFinish">Beenden &amp; Statistik</button><button class="btn" id="cGo">Weiter trainieren</button><button class="btn danger" id="cDrop">Verwerfen (nicht speichern)</button>`);
  $("cFinish").onclick=()=>{closeSheet();finish()};
  $("cGo").onclick=closeSheet;
  $("cDrop").onclick=()=>{closeSheet();onPhase("done",{uebung:"",verworfen:true,workout:W.rname});W.ended=true;W=null;try{localStorage.removeItem(ACT)}catch(_){}syncNative();releaseWake();$("player").hidden=true;show(screen==="home"?"home":screen,false)};
};

/* ---- Wiederholungen bestätigen ---- */
function showConfirm(){
  const p=W.pending;if(!p)return;
  const sideTxt=p.uni?` · Seite ${p.side+1}`:"";
  const body=openSheet(`Satz ${p.set}${sideTxt}`,p.name,`<div class="confirm-big"><small>Ziel</small>${p.target} Wdh.${p.kg>0?`<small>${kgNum(p.kg)} kg</small>`:""}</div>
    <div class="confirm-row"><button class="btn done-btn" id="cfOk">Geschafft ✓</button><button class="btn" id="cfOther">Andere Zahl</button></div><div id="cfWheel"></div>`,{locked:true});
  $("cfOk").onclick=()=>{commitPending(p.target)};
  $("cfOther").onclick=()=>{
    $("cfWheel").innerHTML=`<div class="wheelcenter">${wheelRow("act","Wie viele hast du geschafft?",EXB.balance,"actual")}</div><button class="btn primary big" id="cfSet">Bestätigen</button>`;
    const row=$("cfWheel").querySelector(".wheelrow");let v=p.target;
    const wh=initWheel(row,EXB.balance,{get:()=>v,set:x=>{v=x}});
    $("cfSet").onclick=()=>commitPending(wh.value());
    $("cfOk").parentElement.hidden=true;
  };
}
function commitPending(actual){
  const p=W.pending;if(!p)return;
  putSet(p.uid,{set:p.set,side:p.side,stage:null,part:0,mode:"reps",target:p.target,actual,kg:p.kg,secs:p.secs});
  W.pending=null;saveW();sheetLocked=false;closeSheet();
  if(p.last){advance();return}
  if(actual!==p.target)toast(actual<p.target?`${actual} von ${p.target} gespeichert`:`${actual} Wdh. – stark!`);
}

/* ---- Übersicht im Workout ---- */
/* Überspringen = nur heute. Hat die Übung schon angefangen, ist das dasselbe wie „Übung beenden“. */
const activeCount=()=>W.items.filter(x=>x.status!=="removed"&&effSets(x)>0).length;
function skipW(it,on){
  if(on){
    if(activeCount()<=1&&effSets(it)>0){toast("Das ist die letzte Übung – oben mit ✕ beenden");return false}
    if((W.visited||[]).includes(it.uid)){if(W.pending&&W.pending.uid===it.uid)commitPending(W.pending.target);it.cut=doneSets(it)}
    else it.status="removed";
  }else{it.status=it.planned?"plan":"added";delete it.cut}
  rebuildKeep();saveW();return true;
}
/* Löschen = dauerhaft aus der Routine (und aus dem heutigen Workout) */
function delW(it){
  if(activeCount()<=1&&it.status!=="removed"&&effSets(it)>0){toast("Das ist die letzte Übung – oben mit ✕ beenden");return}
  deleteItem(W.rid,W.day,it.uid);
  const r=W.res[it.uid];
  if(r&&r.sets.length){it.status="removed";it.deleted=true}else W.items.splice(W.items.indexOf(it),1);
  rebuildKeep();saveW();toast(itemName(it)+" gelöscht");
}
const startedW=it=>(W.visited||[]).includes(it.uid);
function editW(it,set,after){
  const sk=it.status==="removed"||(it.cut!=null&&startedW(it));
  openEditor(it,{rid:W.rid,st:W.settings,set,skipped:sk&&!startedW(it),skipLabel:startedW(it)?"Übung beenden":null,
    onSkip:sk&&startedW(it)?null:(on=>{skipW(it,on);after&&after()}),
    onDelete:()=>{delW(it);after&&after()},
    onClose:()=>{rebuildKeep();saveW();after&&after()}});
}
let planView="list";
function openPlan(){
  if(!W)return;
  const render=()=>{
    const hub=atHub(),curUid=hub?null:steps[idx].uid,vis=W.visited||[];
    const firstFree=W.items.reduce((m,x,i)=>vis.includes(x.uid)?i+1:m,0),curPos=W.items.findIndex(x=>x.uid===curUid);
    const h=`<div class="seg" id="plView"><button class="sbtn" data-v="list" aria-pressed="${planView==="list"}">Liste</button><button class="sbtn" data-v="tl" aria-pressed="${planView==="tl"}">Timeline</button></div><div id="plTl"${planView==="tl"?"":" hidden"}></div><div class="list"${planView==="tl"?" hidden":""} id="plList">`+
      W.items.map((it,i)=>{
        const r=W.res[it.uid],isCur=i===curPos,past=i<firstFree&&!isCur,rm=it.status==="removed",ended=it.cut!=null&&vis.includes(it.uid);
        let tags="";
        if(isCur)tags+='<span class="tag now">jetzt</span>';
        else if(past&&!rm)tags+=r&&r.sets.length?'<span class="tag done">erledigt</span>':'<span class="tag skip">übersprungen</span>';
        if(it.deleted)tags+='<span class="tag rm">gelöscht</span>';
        else if(rm)tags+='<span class="tag skip">heute übersprungen</span>';
        if(it.status==="added")tags+='<span class="tag add">neu</span>';
        const action=past||it.deleted||(isCur&&ended)?"":rm?`<button class="act restore" data-unskip="${i}">Rückgängig</button>`:`<button class="act" data-skip="${i}" aria-label="${isCur?"Übung beenden":"Heute überspringen"}">${ICON.skip}</button>`;
        const free=j=>j>=firstFree&&W.items[j]&&W.items[j].status!=="removed"&&!W.items[j].pair;
        return rowHTML(it,i,{lock:i<firstFree||rm,cls:(rm?"off ":"")+(past?"done-row":"")+linkCls(W.items,i),tags,action,link:free(i)&&free(i+1)?it.link:null});
      }).join("")+`</div><button class="btn ghost" id="plAdd">＋ Übung hinzufügen</button><button class="btn primary big" id="plOk">Zurück zum Workout</button>`;
    const body=openSheet(W.rname,"Übersicht",h,{onClose:()=>rebuildKeep()});
    body.querySelectorAll("#plView [data-v]").forEach(b=>b.onclick=()=>{planView=b.dataset.v;render()});
    if(planView==="tl"){
      renderTimeline($("plTl"),W,{curKey:W.cur,
        onPause:(pk,v)=>{W.pauses=W.pauses||{};if(v==null)delete W.pauses[pk];else W.pauses[pk]=v;setPause(W.rid,pk,v);rebuildKeep();saveW();openPlan()},
        onEdit:(it,set)=>editW(it,set,openPlan)});
      $("plTl").insertAdjacentHTML("beforeend",skipLineHTML(W.items));
      $("plTl").querySelectorAll("[data-unskip]").forEach(b=>b.onclick=()=>{skipW(W.items.find(x=>x.uid===b.dataset.unskip),false);render()});
    }
    const list=$("plList");
    list.querySelectorAll("[data-skip]").forEach(b=>b.onclick=e=>{e.stopPropagation();const it=W.items[+b.dataset.skip];if(skipW(it,true)){if(W)render();toast(startedW(it)?itemName(it)+" beendet":itemName(it)+" heute übersprungen")}});
    list.querySelectorAll("[data-unskip]").forEach(b=>b.onclick=e=>{e.stopPropagation();skipW(W.items[+b.dataset.unskip],false);render()});
    bindTaps(list,i=>editW(W.items[i],0,openPlan));
    makeSortable(list,{min:firstFree,onDrop:(a,b)=>{moveArr(W.items,a,b);orderItems(W.rid,W.day,W.items.filter(x=>!x.deleted).map(x=>x.uid));rebuildKeep();saveW();render()}});
    bindLinks(list,i=>{const it=W.items[i];it.link=!it.link;linkItem(W.rid,W.day,it.uid,it.link);rebuildKeep();saveW();render()});
    $("plAdd").onclick=()=>openPicker(ids=>{
      addItems(W.rid,W.day,ids).forEach(x=>W.items.push(Object.assign(x,{pair:null,status:"added",planned:false})));
      save();rebuildKeep();saveW();openPlan();
    });
    $("plOk").onclick=closeSheet;
  };
  render();
}

/* ---- Zwischenseite nach jeder Übung: was erledigt ist + Weiter-Knopf ---- */
function renderHub(s){
  const nextPos=W.items.findIndex(x=>x.uid===s.uid),vis=W.visited||[],prev=vis.length?W.items.find(x=>x.uid===vis[vis.length-1]):null;
  const pr=prev&&W.res[prev.uid]&&W.res[prev.uid].sets.length;
  $("hubDone").textContent=prev?itemName(prev)+(pr?" erledigt":" übersprungen"):"Pause";
  $("hubNext").textContent=itemName(W.items[nextPos]);
  $("hubList").innerHTML=W.items.map((it,i)=>{
    const r=W.res[it.uid]||{sets:[]},rm=it.status==="removed",isNext=i===nextPos,past=i<nextPos||((W.visited||[]).includes(it.uid)&&!isNext);
    let ic,cls="",det;
    if(rm){ic="–";cls="rm";det=it.deleted?"gelöscht":"heute übersprungen"}
    else if(past&&r.sets.length){ic="✓";cls="ok";det=setsText({sets:r.sets})||"erledigt"}
    else if(past){ic="›";cls="skip";det="übersprungen"}
    else if(isNext){ic="▶";cls="nx";det=esc(itemText(it))}
    else{ic=String(W.items.slice(0,i+1).filter(x=>x.status!=="removed").length);det=esc(itemText(it))}
    const pick=!past&&!isNext&&!rm&&!(W.visited||[]).includes(it.uid)&&!(i>0&&W.items[i-1].link&&W.items[i-1].status!=="removed");
    const lk=(it.link&&!rm)||(i>0&&W.items[i-1].link&&W.items[i-1].status!=="removed");
    return `<div class="hrow ${cls}${lk?" lk":""}"><span class="hic">${ic}</span><span class="hmid"><span class="hnm">${esc(itemName(it))}${it.status==="added"?'<span class="tag add">neu</span>':""}${isNext?'<span class="tag now">als Nächstes</span>':""}${lk?'<span class="tag">Supersatz</span>':""}</span><span class="hdt">${det}</span></span>${pick?`<button class="hpick" data-nx="${i}">Als Nächstes</button>`:""}</div>`;
  }).join("");
  $("hubList").querySelectorAll("[data-nx]").forEach(b=>b.onclick=()=>{
    const [a,z]=blockRange(W.items,+b.dataset.nx),seg=W.items.splice(a,z-a+1);
    const tgt=W.items.findIndex(x=>x.uid===steps[idx].uid);W.items.splice(tgt,0,...seg);
    rebuildKeep();saveW();toast(itemName(seg[0])+" ist jetzt als Nächstes dran");
  });
  const nx=$("hubList").querySelector(".hrow.nx");if(nx)nx.scrollIntoView({block:"nearest"});
}
$("hubEdit").onclick=()=>openPlan();
/* „Übung beenden“: restliche Sätze fallen heute weg (Statistik zeigt z. B. 2 von 3 Sätzen) */
const doneSets=it=>{const r=W.res[it.uid];return r&&r.sets.length?Math.max(...r.sets.map(x=>x.set)):0};
$("endEx").onclick=()=>{
  if(!W)return;const s=steps[idx],it=itemOf(s);if(!it)return;
  const i=W.items.indexOf(it),[a,z]=blockRange(W.items,i),block=W.items.slice(a,z+1).filter(x=>x.status!=="removed");
  const n=doneSets(it),tot=it.pair?1:(it.o.sets||1);
  openSheet("Übung beenden",itemName(it)+" beenden?",`<div class="note">Geschafft: <b>${n} von ${tot} ${tot===1?"Satz":"Sätzen"}</b>. Die restlichen Sätze fallen heute weg und stehen so in der Statistik. Der Plan bleibt gleich.</div>
    <button class="btn primary big" id="eeOne">${esc(EXB[it.ex].name)} beenden</button>${block.length>1?`<button class="btn" id="eeAll">Ganzen Supersatz beenden</button>`:""}<button class="btn ghost" id="eeNo">Weitermachen</button>`);
  const go=list=>{closeSheet();if(W.pending)commitPending(W.pending.target);list.forEach(x=>x.cut=doneSets(x));rebuildKeep();saveW();toast("Übung beendet")};
  $("eeOne").onclick=()=>go([it]);if($("eeAll"))$("eeAll").onclick=()=>go(block);$("eeNo").onclick=closeSheet;
};

/* ---- Abschluss & Statistik ---- */
function finish(at){
  if(!W)return;
  const w=W;w.ended=true;w.endedAt=at||now();
  const tot=(w.endedAt-w.startedAt)/1000;
  const items=w.items.map(it=>{
    const r=w.res[it.uid]||{time:0,sets:[]};
    const status=it.deleted&&!r.sets.length?"entfernt":r.sets.length?"erledigt":"übersprungen";
    return {uid:it.uid,ex:it.ex,name:itemName(it),status,added:it.status==="added",o:it.o,o2:it.pair?it.pair.o2:null,time:Math.round(r.time),sets:r.sets,planned:it.pair?1:(it.o.sets||1),cut:it.cut!=null?it.cut:null,link:!!it.link};
  });
  const entry={d:w.startedAt,end:w.endedAt,t:tot,rid:w.rid,rname:w.rname,day:w.day,days:w.days,items};
  S.log.push(entry);S.log=S.log.slice(-300);
  S.last[w.rid]={day:w.day,d:w.startedAt};
  items.forEach(x=>{if(x.sets.length)S.lastRes[w.rid+"|"+x.uid]={d:w.startedAt,sets:x.sets,kg:x.o.kg||0}});
  save();
  try{localStorage.removeItem(ACT)}catch(_){}
  onPhase("done",{uebung:"",workout:w.rname,dauerSek:Math.round(tot)});
  W=null;syncNative();releaseWake();
  sheetClose=null;sheetLocked=false;$("scrim").hidden=true;
  $("player").hidden=true;$("done").hidden=false;
  renderDone(entry);
  beep(784,.15,.5);setTimeout(()=>beep(988,.15,.5),160);setTimeout(()=>beep(1318,.3,.5),320);
}
function setsText(x){
  if(!x.sets.length)return "";
  const bySet={};x.sets.forEach(s=>{(bySet[s.set]=bySet[s.set]||[]).push(s)});
  const parts=Object.keys(bySet).sort((a,b)=>a-b).map(k=>{
    const ss=bySet[k];
    const t=ss.filter(s=>s.stage==null||s.stage===2).map(s=>{
      if(s.mode==="reps"){const c=s.actual<s.target?"miss":s.actual>s.target?"more":"";return `<span class="${c}">${s.actual}${s.actual!==s.target?"/"+s.target:""}</span>`}
      if(s.stage===2)return ss.filter(z=>z.side===s.side&&z.stage!=null).length+"/3 Stufen";
      return fmtSecs(s.done);
    }).join(" · ");
    return (Object.keys(bySet).length>1?`S${k}: `:"")+t;
  });
  const kg=x.sets.find(s=>s.kg>0);
  return parts.join(" &nbsp;|&nbsp; ")+(kg?` · ${kgNum(kg.kg)} kg`:"");
}
function entryHTML(en){
  return en.items.map(x=>{
    const tag={erledigt:"done",übersprungen:"skip",entfernt:"rm"}[x.status];
    const short=x.cut!=null&&x.planned&&x.cut<x.planned&&x.status==="erledigt";
    return `<div class="ri"><div class="rh"><span>${esc(x.name)} <span class="tag ${tag}">${x.status}</span>${short?`<span class="tag rm">${x.cut} von ${x.planned} Sätzen</span>`:""}${x.added?'<span class="tag add">hinzugefügt</span>':""}</span><span>${x.time?fmt(x.time):""}</span></div>${x.sets.length?`<div class="rd">${setsText(x)}</div>`:""}</div>`;
  }).join("")||'<div class="note">Keine Details gespeichert.</div>';
}
function entrySum(en){
  const c=k=>en.items.filter(x=>x.status===k).length,add=en.items.filter(x=>x.added).length;
  return `Gesamtzeit ${fmt(en.t)}`+(en.items.length?` · ${c("erledigt")} erledigt`+(c("übersprungen")?` · ${c("übersprungen")} übersprungen`:"")+(c("entfernt")?` · ${c("entfernt")} entfernt`:"")+(add?` · ${add} hinzugefügt`:""):"");
}
function renderDone(en){
  $("doneTitle").textContent=en.rname+" erledigt";
  $("doneSum").textContent=entrySum(en);
  $("doneList").innerHTML=entryHTML(en);
}
$("doneOk").onclick=()=>{$("done").hidden=true;show("home",false);history.replaceState({s:"home"},"")};

/* Ansage „zehn“ vor Ende einer Pause: Sprachausgabe des Geräts, sonst auffälliger Doppelton */
let deVoice=null;
function pickVoice(){try{const v=speechSynthesis.getVoices();deVoice=v.find(x=>/^de/i.test(x.lang))||null}catch(_){}}
if(window.speechSynthesis){pickVoice();try{speechSynthesis.addEventListener("voiceschanged",pickVoice)}catch(_){}}
function say10(){
  if(!gv("sound")||document.hidden)return;
  if(window.speechSynthesis&&deVoice){try{const u=new SpeechSynthesisUtterance("zehn");u.voice=deVoice;u.lang=deVoice.lang;u.volume=1;u.rate=1.05;speechSynthesis.speak(u);return}catch(_){}}
  beep(660,.16,.5);setTimeout(()=>beep(990,.22,.5),200);
}
/* ---- Ton, Vibration, Wachhalten (wie bisher: Audio nur kurz aktiv, damit Spotify weiterläuft) ---- */
let actx=null,wake=null,sleepT=null;
function ensureAudio(){
  if(!actx){try{actx=new (window.AudioContext||window.webkitAudioContext)()}catch(_){}}
  if(actx&&actx.state!=="running"){actx.resume().then(()=>{clearTimeout(sleepT);sleepT=setTimeout(()=>{try{actx.suspend()}catch(_){}},300)},()=>{})}
}
function tone(f,d,v){const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=f;o.type="square";g.gain.setValueAtTime(v,actx.currentTime);g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+d);o.connect(g);g.connect(actx.destination);o.start();o.stop(actx.currentTime+d)}
function beep(f=880,d=.12,v=.25){if(!gv("sound")||!actx||document.hidden)return;try{
  clearTimeout(sleepT);
  const go=()=>{try{tone(f,d,v)}catch(_){}sleepT=setTimeout(()=>{try{actx.suspend()}catch(_){}},Math.max(600,d*1000+400))};
  if(actx.state!=="running")actx.resume().then(go,()=>{});else go();
}catch(_){}}
function buzz(p){if(gv("vib")&&navigator.vibrate&&!document.hidden)try{navigator.vibrate(p)}catch(_){}}
async function lockScreen(){try{if(navigator.wakeLock&&!wake){wake=await navigator.wakeLock.request("screen");wake.addEventListener("release",()=>{wake=null})}}catch(_){}}
function releaseWake(){try{wake&&wake.release()}catch(_){}wake=null}

/* ---- Hintergrund: Zustand sichern, beim Zurückkommen nachholen ---- */
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden"){saveW();syncNative()}
  else if(W&&!W.ended){catchUp();if(W){stepUI();lockScreen()}}
  if(document.visibilityState==="visible"&&!W&&$("player").hidden&&screen==="home")renderHome();
});
window.addEventListener("pagehide",saveW);
window.addEventListener("storage",e=>{if(e.key===ACT&&W&&!e.newValue){/* in anderem Tab beendet */}});

/* ---- Hauptschleife ---- */
const SIDE=["Seite 1","Seite 2"];
let lastNow=performance.now();
function size(){const b=$("stagebox");const w=Math.max(80,Math.floor(Math.min(b.clientWidth,b.clientHeight)))||300;$("stage").style.width=$("stage").style.height=w+"px";F.sizeTo(w)}
if(window.ResizeObserver)new ResizeObserver(()=>{if(!$("player").hidden)size()}).observe($("stagebox"));
window.addEventListener("resize",()=>{if(!$("player").hidden)size()});
function frame(t){
  const dt=Math.min(.05,(t-lastNow)/1000);lastNow=t;
  if(W&&!W.ended&&!$("player").hidden){
    catchUp();
    if(W&&!W.ended)drawPlayer(dt);
  }
  requestAnimationFrame(frame);
}
function drawPlayer(dt){
  if(F.previewing)return;
  const s=steps[idx];if(!s||!clip)return;
  const paused=!!W.pauseAt,el=elapsed();
  if(!paused)animT+=dt;
  const ws=s.type==="work"?s:s.next,e=EXB[ws.ex],it=itemOf(s),uniS=isUni(e,ws.o)||!!it.pair;
  let side=ws.side||0;
  $("totalT").textContent=fmt((now()-W.startedAt)/1000);
  if(s.type==="trans"&&s.hub){$("hubClock").textContent=fmt(el);$("hubClock").classList.toggle("paused",paused);return}
  if(s.type==="trans"){
    const P0=firstPose(clip);F.draw(["",1,P0,P0],1);
    const open=s.dur==null,left=open?0:curDur(s)-el;
    $("clock").textContent=open?fmt(el):fmt(Math.ceil(left));
    $("phase").textContent=s.label;$("phase").className="phase trans";
    $("sideChip").textContent=!uniS?(e.perSide?"beide Seiten im Wechsel":"beidseitig"):(ws.both?"beginnt mit ":"")+SIDE[side];$("sideChip").className="chip warn";
    $("repChip").hidden=true;
    const sec=Math.ceil(left);if(!open&&!paused&&sec!==lastSec){if(sec===10&&curDur(s)>10)say10();else if(sec<=5&&sec>0)beep(740,.1,.5)}lastSec=sec;
  }else{
    const c=clip,pre=F.seqDur(c.pre);
    if(animT<pre){const [ph,k]=F.segAt(c.pre,animT);F.draw(ph,k)}
    else{
      const lt=animT-pre,cyc=F.seqDur(c.loop);
      if(c.alt){
        const half=Math.floor(lt/cyc);side=half%2;F.setMirror(side===1);
        const ct=lt-half*cyc,[ph,k]=F.segAt(c.loop,ct);F.draw(ph,k);
        const rep=Math.min(c.reps,Math.floor(ct/c.repDur)+1);
        $("repChip").hidden=false;$("repChip").className="chip on";$("repChip").textContent=e.oneRun?"Animation":"Wdh "+rep+"/"+c.reps;
      }else{
        const [ph,k]=F.segAt(c.loop,lt%cyc);F.draw(ph,k);
        if(ws.mode==="reps"){$("repChip").hidden=false;$("repChip").className="chip on";$("repChip").textContent=e.oneRun?"Animation":"Wdh "+(Math.floor(lt/c.repDur)%c.reps+1)+"/"+c.reps}
        else if(e.weight!=="none"&&ws.o.kg>0){$("repChip").hidden=false;$("repChip").className="chip";$("repChip").textContent=F.kgText(e.weight,ws.o.kg)}
        else $("repChip").hidden=true;
      }
    }
    $("sideChip").textContent=!uniS?(e.perSide?"beide Seiten im Wechsel":"beidseitig"):(ws.both?"zeigt "+SIDE[side]:SIDE[side]);
    $("sideChip").className="chip on";
    if(s.mode==="reps"){
      $("clock").textContent=fmt(el);
      $("phase").textContent=s.both?"Wiederholungen · beide Seiten":"Wiederholungen"+(uniS?" · "+SIDE[side]:"");
    }else{
      const left=curDur(s)-el;$("clock").textContent=fmt(Math.ceil(left));
      $("phase").textContent=s.stage!=null?`Stufe ${s.stage+1} von 3`:e.timedReps?"Wiederholungen · "+SIDE[side]:(e.timeWord?"Läuft":"Halten")+(uniS?" · "+SIDE[side]:"");
      const sec=Math.ceil(left);if(!paused&&sec!==lastSec&&sec<=5&&sec>0)beep(880,.1,.5);lastSec=sec;
    }
    $("phase").className="phase";
  }
  if(paused){$("phase").classList.add("paused")}
  $("clock").classList.toggle("paused",paused);
  $("hint").textContent=paused?"Pausiert":"";
  F.render();
}

/* =================== START =================== */
F.mount($("stage"));F.setShade(gv("shade"));muteIcon();
history.replaceState({s:"home"},"");
renderHome();
const a=loadActive();if(a)startPlayer(a);
requestAnimationFrame(frame);
/* Test-Hilfe (Playwright) */
window.__app={get W(){return W},get idx(){return idx},steps:()=>steps,S:()=>S,shiftTime:ms=>{if(!W)return;W.startedAt-=ms;W.stepStart-=ms;if(W.pauseAt)W.pauseAt-=ms;saveW()}};
})();
