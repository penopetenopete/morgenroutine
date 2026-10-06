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
    fruehstueck:{id:"fruehstueck",name:"Mein Frühstück",slot:"fr",items:[{food:"quark",amt:250},{food:"hafer",amt:80},{food:"whey",amt:29},{food:"sonne",amt:40},{food:"floh",amt:30},{food:"gluten",amt:50}]},
    eierbr:{id:"eierbr",name:"Eier + Brötchen",slot:"mi",items:[{food:"ei",amt:3,u:"stk"},{food:"roggen",amt:1}]}
  };
  return {v:1,goals:{kcal:2250,p:141,f:62,c:281},kg:87,burnIn:false,foods,meals,days:{}};
}
let E=null;
try{E=JSON.parse(localStorage.getItem(EK)||"null")}catch(_){}
if(!E||!E.foods)E=seed();
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

/* ---------- Bildschirm ---------- */
let curDay=today(),open={};
function renderEssen(){
  const el=$("essen");if(!el)return;
  const t=today();
  $("eDate").textContent=curDay===t?"Heute":new Date(curDay+"T12:00").toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long"});
  // Tage-Leiste: 14 Tage zurück bis morgen
  let h="";for(let i=-14;i<=1;i++){const k=addDays(t,i),dt=new Date(k+"T12:00");
    const lab=i===0?"Heute":i===-1?"Gestern":i===1?"Morgen":dt.toLocaleDateString("de-DE",{weekday:"short"}).replace(".","");
    const has=(E.days[k]&&E.days[k].e.length)?" has":"";
    h+=`<button class="dtab eday${has}" role="tab" data-d="${k}" aria-selected="${k===curDay}"><span class="nx">${lab}</span>${dt.getDate()}.${dt.getMonth()+1}.</button>`}
  $("eDays").innerHTML=h;
  $("eDays").querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{curDay=b.dataset.d;renderEssen()});
  const sel=$("eDays").querySelector('[aria-selected="true"]');if(sel)sel.scrollIntoView({inline:"center",block:"nearest"});
  // Summe
  const d=dayGet(curDay),s=sumE(d.e),G=E.goals,b=burned(curDay);
  const goal=G.kcal+(E.burnIn?b.kcal:0),rest=goal-s.kcal;
  const pc=v=>Math.max(0,Math.min(100,v*100)).toFixed(1)+"%";
  $("eSum").innerHTML=`
    <div class="esk1"><div><span class="ebig num">${nf(s.kcal)}</span><span class="eof"> / ${nf(goal)} kcal</span></div><span class="erest${rest<0?" over":""}">${rest>=0?"noch "+nf(rest):nf(-rest)+" drüber"}</span></div>
    <div class="ebar"><i style="width:${pc(s.kcal/goal)}"></i></div>
    <div class="esk1 ep"><div><span class="emid num">${nf(s.p)}</span><span class="eof"> / ${nf(G.p)} g Eiweiß</span></div><span class="erest${s.p>=G.p?" ok":""}">${s.p>=G.p?"✓ geschafft":"noch "+nf(G.p-s.p)+" g"}</span></div>
    <div class="ebar ep"><i style="width:${pc(s.p/G.p)}"></i></div>
    <div class="emacro">Fett ${nf(s.f)} g · KH ${nf(s.c)} g · Ballaststoffe ${nf(s.fib)} g</div>
    ${b.kcal?`<button class="eburn" id="eBurn"><span>Training ~${nf(b.kcal)} kcal${b.acts.length?" ("+b.acts.map(a=>esc(a.name)).join(", ")+")":""}</span><b>${E.burnIn?"eingerechnet":"nur Info"}</b></button>`:""}`;
  if($("eBurn"))$("eBurn").onclick=()=>{E.burnIn=!E.burnIn;esave();renderEssen();toast(E.burnIn?"Training wird aufs Ziel draufgerechnet":"Training nur als Info")};
  // Mahlzeiten
  let sh="";
  SLOTS.forEach(([sl,name])=>{
    const list=d.e.filter(en=>en.slot===sl),ss=sumE(list);
    sh+=`<section class="eslot"><div class="eshead"><h3>${name}</h3><span class="esk">${list.length?nf(ss.kcal)+" kcal · "+nf(ss.p)+" g E":""}</span>${list.length?`<button class="ic esm" data-sm="${sl}" aria-label="${name}: mehr">${DOTS}</button>`:""}<button class="ic eadd" data-add="${sl}" aria-label="${name}: hinzufügen">${PLUS}</button></div>`;
    if(!list.length){const sg=suggestions(sl,curDay);
      sh+=sg.length?`<div class="echips">${sg.map((x,i)=>`<button class="echip" data-sg="${sl}|${i}">＋ ${esc(x.label)}</button>`).join("")}</div>`:"";
    }else{
      sh+=`<div class="list elist">`;const done={};
      list.forEach(en=>{
        if(en.g){if(done[en.g.id])return;done[en.g.id]=1;
          const gl=list.filter(x=>x.g&&x.g.id===en.g.id),gs=sumE(gl),op=!!open[en.g.id];
          sh+=`<div class="egrp${op?" open":""}"><button class="erow eghead" data-gt="${en.g.id}" aria-expanded="${op}"><span class="emid"><span class="nm">${esc(en.g.name)}</span><span class="val">${gl.length} Zutaten</span></span><span class="ekc"><b>${nf(gs.kcal)}</b> kcal<small>${nf(gs.p)} g E</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg></button>
            <button class="ic egm" data-gm="${en.g.id}" aria-label="Mahlzeit: mehr">${DOTS}</button>`;
          if(op)sh+=gl.map(x=>rowH(x,true)).join("")+`<button class="erow eaddin" data-gadd="${en.g.id}">＋ Zutat</button>`;
          sh+=`</div>`;
        }else sh+=rowH(en);
      });
      sh+=`</div>`;
    }
    sh+=`</section>`;
  });
  $("eSlots").innerHTML=sh;
  const S2=$("eSlots");
  S2.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>openSearch({kind:"day",slot:b.dataset.add}));
  S2.querySelectorAll("[data-e]").forEach(b=>b.onclick=()=>openAmount({mode:"edit",id:b.dataset.e}));
  S2.querySelectorAll("[data-gt]").forEach(b=>b.onclick=()=>{open[b.dataset.gt]=!open[b.dataset.gt];renderEssen()});
  S2.querySelectorAll("[data-gm]").forEach(b=>b.onclick=()=>groupSheet(b.dataset.gm));
  S2.querySelectorAll("[data-gadd]").forEach(b=>b.onclick=()=>{const en=d.e.find(x=>x.g&&x.g.id===b.dataset.gadd);openSearch({kind:"grp",gid:b.dataset.gadd,slot:en?en.slot:"sn"})});
  S2.querySelectorAll("[data-sm]").forEach(b=>b.onclick=()=>slotSheet(b.dataset.sm));
  S2.querySelectorAll("[data-sg]").forEach(b=>b.onclick=()=>{const [sl,i]=b.dataset.sg.split("|"),x=suggestions(sl,curDay)[+i];useSuggestion(x,sl)});
  essenMeta();
}
function rowH(en,sub){
  const f=E.foods[en.food],n=nut(f,en.amt,en.u);
  return `<button class="erow${sub?" sub":""}" data-e="${en.id}"><span class="emid"><span class="nm">${esc(foodName(f))}${f&&f.brand?` <small>${esc(f.brand)}</small>`:""}</span><span class="val">${amtText(f,en.amt,en.u)}</span></span><span class="ekc"><b>${nf(n.kcal)}</b> kcal<small>${nf(n.p,1)} g E</small></span></button>`;
}
const DOTS='<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
const PLUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const CAM='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2"/><path d="M8 9v6M11 9v6M14 9v6M16.5 9v6"/></svg>';

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

/* ---------- Mahlzeit (Gruppe) im Tag ---------- */
function groupSheet(gid){
  const d=day(curDay),gl=d.e.filter(x=>x.g&&x.g.id===gid);if(!gl.length)return;
  const g=gl[0].g,s=sumE(gl),tpl=g.tpl&&E.meals[g.tpl];
  openSheet(SLOTN[gl[0].slot],g.name,
    `<div class="note">${gl.length} Zutaten · ${nf(s.kcal)} kcal · ${nf(s.p)} g Eiweiß. Änderungen hier gelten nur für diesen Tag${tpl?" – die Vorlage bleibt gleich":""}.</div>
     <button class="btn" id="gAdd">＋ Zutat hinzufügen</button>
     <button class="btn" id="gCopy">Kopieren / Verschieben</button>
     ${tpl?`<button class="btn" id="gUpd">Vorlage „${esc(tpl.name)}“ mit diesem Stand überschreiben</button>`:""}
     <button class="btn" id="gNew">Als neue Vorlage speichern</button>
     <button class="btn" id="gRen">Umbenennen</button>
     <button class="btn ghost" id="gSplit">In einzelne Einträge auflösen</button>
     <button class="btn danger" id="gDel">Ganze Mahlzeit löschen</button>`);
  $("gAdd").onclick=()=>openSearch({kind:"grp",gid,slot:gl[0].slot});
  $("gCopy").onclick=()=>copySheet(gl,g.name);
  if($("gUpd"))$("gUpd").onclick=()=>{tpl.items=gl.map(x=>{const it={food:x.food,amt:x.amt};if(x.u)it.u=x.u;return it});esave();closeSheet();toast("Vorlage aktualisiert")};
  $("gNew").onclick=()=>askName("Neue Vorlage",g.name+(tpl?" (neu)":""),n=>{const id=nid();E.meals[id]={id,name:n,slot:gl[0].slot,items:gl.map(x=>{const it={food:x.food,amt:x.amt};if(x.u)it.u=x.u;return it})};gl.forEach(x=>x.g.tpl=id);esave();renderEssen();toast("Vorlage „"+n+"“ gespeichert")});
  $("gRen").onclick=()=>askName("Umbenennen",g.name,n=>{gl.forEach(x=>x.g.name=n);esave();renderEssen()});
  $("gSplit").onclick=()=>{gl.forEach(x=>delete x.g);esave();closeSheet();renderEssen()};
  $("gDel").onclick=()=>{d.e=d.e.filter(x=>!gl.includes(x));tidyDay(curDay);esave();closeSheet();renderEssen();toast("„"+g.name+"“ gelöscht")};
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

/* ---------- Suche: eigene Liste · BLS · Open Food Facts ---------- */
const norm=s=>String(s||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim();
const qMatch=(n,toks)=>toks.every(t=>n.includes(t));
function score(n,toks){let s=0;const w=" "+n;toks.forEach(t=>{if(w.includes(" "+t))s+=2});if(n.startsWith(toks[0]))s+=3;return s-n.length/40}
let BLS=null,blsP=null;
function loadBLS(){if(BLS)return Promise.resolve(BLS);if(!blsP)blsP=fetch("bls.json").then(r=>r.json()).then(a=>{BLS=a.map(x=>({code:x[0],name:x[1],kcal:x[2],p:x[3],c:x[4],f:x[5],fib:x[6],n:norm(x[1])}));return BLS}).catch(e=>{blsP=null;throw e});return blsP}
const blsFood=b=>({id:"bls:"+b.code,name:b.name,brand:"",base:"g",src:"bls",kcal:b.kcal,p:b.p,c:b.c,f:b.f,fib:b.fib});
let searchCtx=null,offRes=[];
function openSearch(ctx){
  searchCtx=ctx;offRes=[];
  const where=ctx.kind==="tpl"?"Vorlage · "+E.meals[ctx.tid].name:ctx.kind==="grp"?"Zutat zur Mahlzeit":SLOTN[ctx.slot]+" · "+(curDay===today()?"heute":new Date(curDay+"T12:00").toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"}));
  openSheet(where,"Hinzufügen",`<div class="esbar"><input class="pksearch" id="eQ" type="search" placeholder="Suchen: Quark, Reis, Tofu …" autocomplete="off" enterkeyhint="search"><button class="ic" id="eScan" aria-label="Barcode scannen">${CAM}</button></div><div id="eRes"></div>`);
  const q=$("eQ");let t=null;
  q.addEventListener("input",()=>{clearTimeout(t);offRes=[];t=setTimeout(drawRes,120)});
  q.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();q.blur();if(q.value.trim().length>=2)searchOFF(q.value.trim())}});
  $("eScan").onclick=()=>scanSheet();
  drawRes();loadBLS().then(()=>{if(searchCtx===ctx&&$("eQ"))drawRes()}).catch(()=>{});
}
function drawRes(){
  const box=$("eRes");if(!box)return;const ctx=searchCtx,raw=$("eQ").value,toks=norm(raw).split(" ").filter(Boolean);
  const u=usage(ctx.slot),uAll=usage(null);
  let h="";
  const foodRow=(f,key)=>{const per=f.base==="stk"?"Stück":"100 g";return `<button class="erow" data-pick="${esc(key)}"><span class="emid"><span class="nm">${esc(f.name)}${f.brand?` <small>${esc(f.brand)}</small>`:""}</span><span class="val">${nf(f.kcal)} kcal · ${nf(f.p,1)} g E / ${per}</span></span>${PLUS_S}</button>`};
  const pick={};
  if(!toks.length){
    if(ctx.kind==="day"){const sg=suggestions(ctx.slot,curDay);if(sg.length)h+=`<h3>Vorschläge</h3><div class="echips">${sg.map((x,i)=>`<button class="echip" data-sgi="${i}">＋ ${esc(x.label)}</button>`).join("")}</div>`}
    const ms=Object.values(E.meals).sort((a,b)=>(u.me[b.id]||0)-(u.me[a.id]||0)||(b.slot===ctx.slot)-(a.slot===ctx.slot));
    if(ctx.kind==="day"&&ms.length)h+=`<h3>Meine Mahlzeiten</h3><div class="list elist">${ms.map(m=>tplRow(m)).join("")}</div>`;
    const fs=Object.values(E.foods).sort((a,b)=>((u.fo[b.id]||0)*3+(uAll.fo[b.id]||0))-((u.fo[a.id]||0)*3+(uAll.fo[a.id]||0))||a.name.localeCompare(b.name));
    h+=`<h3>Meine Lebensmittel</h3><div class="list elist">${fs.slice(0,40).map(f=>{pick["o:"+f.id]=f;return foodRow(f,"o:"+f.id)}).join("")}</div>`;
  }else{
    const ms=Object.values(E.meals).filter(m=>qMatch(norm(m.name),toks));
    if(ctx.kind==="day"&&ms.length)h+=`<h3>Meine Mahlzeiten</h3><div class="list elist">${ms.map(m=>tplRow(m)).join("")}</div>`;
    const own=Object.values(E.foods).filter(f=>qMatch(norm(f.name+" "+(f.brand||"")),toks)).sort((a,b)=>(uAll.fo[b.id]||0)-(uAll.fo[a.id]||0));
    if(own.length)h+=`<h3>Meine Lebensmittel</h3><div class="list elist">${own.slice(0,20).map(f=>{pick["o:"+f.id]=f;return foodRow(f,"o:"+f.id)}).join("")}</div>`;
    if(offRes.length)h+=`<h3>Open Food Facts</h3><div class="list elist">${offRes.map((f,i)=>{pick["f:"+i]=f;return foodRow(f,"f:"+i)}).join("")}</div>`;
    if(BLS){const ownB=new Set(own.map(f=>f.id));
      const r=BLS.filter(b=>!ownB.has("bls:"+b.code)&&qMatch(b.n,toks)).map(b=>[score(b.n,toks),b]).sort((a,b)=>b[0]-a[0]).slice(0,30);
      if(r.length)h+=`<h3>Allgemein (BLS)</h3><div class="list elist">${r.map(([,b])=>{const f=blsFood(b);pick["b:"+b.code]=f;return foodRow(f,"b:"+b.code)}).join("")}</div>`;
      else if(!own.length&&!offRes.length)h+=`<div class="note">Nichts gefunden.</div>`;
    }else h+=`<div class="note">Lade Lebensmittel-Datenbank …</div>`;
    h+=`<button class="btn" id="eOff">Marken online suchen (Open Food Facts)</button>`;
  }
  h+=`<button class="btn ghost" id="eNew">＋ Eigenes Lebensmittel anlegen</button><div class="note esrc">Daten: BLS 4.0 – Max Rubner-Institut (CC BY 4.0) · Open Food Facts (ODbL)</div>`;
  box.innerHTML=h;
  box.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{const f=pick[b.dataset.pick];if(f)openAmount({mode:"add",food:E.foods[f.id]||f,ctx})});
  box.querySelectorAll("[data-tpl]").forEach(b=>b.onclick=()=>{closeSheet();insertTpl(b.dataset.tpl,curDay,ctx.slot)});
  box.querySelectorAll("[data-sgi]").forEach(b=>b.onclick=()=>{const x=suggestions(ctx.slot,curDay)[+b.dataset.sgi];closeSheet();useSuggestion(x,ctx.slot)});
  if($("eOff"))$("eOff").onclick=()=>searchOFF(raw.trim());
  $("eNew").onclick=()=>foodForm({name:raw.trim()},f=>openAmount({mode:"add",food:f,ctx}));
}
const PLUS_S='<span class="eplus">'+PLUS+'</span>';
function tplRow(m){const s=sumE(m.items);return `<button class="erow" data-tpl="${m.id}"><span class="emid"><span class="nm">${esc(m.name)}</span><span class="val">${m.items.length} Zutaten · ${nf(s.kcal)} kcal · ${nf(s.p)} g E</span></span>${PLUS_S}</button>`}

/* Open Food Facts (online). Markenprodukte, Name oder Barcode */
const OFF="https://world.openfoodfacts.org";
const OFF_FIELDS="code,product_name,product_name_de,brands,nutriments,serving_quantity";
function offFood(p){
  const n=p.nutriments||{},k=n["energy-kcal_100g"]!=null?+n["energy-kcal_100g"]:n["energy_100g"]!=null?+n["energy_100g"]/4.184:null;
  const name=(p.product_name_de||p.product_name||"").trim();if(!name||k==null)return null;
  const r=v=>Math.round((+v||0)*10)/10;
  return {id:"off:"+p.code,name,brand:(p.brands||"").split(",")[0].trim(),base:"g",src:"off",code:p.code,kcal:Math.round(k),p:r(n.proteins_100g),c:r(n.carbohydrates_100g),f:r(n.fat_100g),fib:r(n.fiber_100g),def:p.serving_quantity?Math.round(+p.serving_quantity):undefined};
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
    `<label class="field"><span>Nummer</span><input id="eCode" inputmode="numeric" placeholder="z. B. 4008400401621"></label><button class="btn primary big" id="eCodeGo">Suchen</button>`,{onClose:()=>{if(scanStop)scanStop()}});
  const found=async code=>{if(scanStop)scanStop();toast("Suche "+code+" …");
    try{const f=await offByCode(code);if(!f){toast("Produkt nicht gefunden – selbst anlegen");foodForm({code},nf2=>openAmount({mode:"add",food:nf2,ctx}));return}
      openAmount({mode:"add",food:E.foods[f.id]||f,ctx})}catch(e){toast("Open Food Facts nicht erreichbar")}};
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
function tplSheet(tid){
  const m=E.meals[tid];if(!m)return;const s=sumE(m.items);
  openSheet("Vorlage",m.name,`<div class="note">${nf(s.kcal)} kcal · ${nf(s.p)} g Eiweiß · ${nf(s.f)} g F · ${nf(s.c)} g KH</div>
    <div class="seg eslotseg">${SLOTS.map(([sl,n])=>`<button class="sbtn" data-ts="${sl}" aria-pressed="${m.slot===sl}">${n}</button>`).join("")}</div>
    <div class="list elist">${m.items.map((it,i)=>{const f=E.foods[it.food],n=nut(f,it.amt,it.u);return `<button class="erow" data-ti="${i}"><span class="emid"><span class="nm">${esc(foodName(f))}</span><span class="val">${amtText(f,it.amt,it.u)}</span></span><span class="ekc"><b>${nf(n.kcal)}</b> kcal<small>${nf(n.p,1)} g E</small></span></button>`}).join("")}</div>
    <button class="btn" id="tAdd">＋ Zutat</button>
    <div class="row2"><button class="btn" id="tRen">Umbenennen</button><button class="btn danger" id="tDel">Löschen</button></div>
    <button class="btn ghost" id="tBack">Alle Vorlagen</button>`);
  $("shBody").querySelectorAll("[data-ts]").forEach(b=>b.onclick=()=>{m.slot=m.slot===b.dataset.ts?undefined:b.dataset.ts;esave();tplSheet(tid)});
  $("shBody").querySelectorAll("[data-ti]").forEach(b=>b.onclick=()=>openAmount({mode:"tplitem",tid,i:+b.dataset.ti}));
  $("tAdd").onclick=()=>openSearch({kind:"tpl",tid,slot:m.slot||"sn"});
  $("tRen").onclick=()=>askName("Umbenennen",m.name,n=>{m.name=n;esave();tplSheet(tid)});
  $("tDel").onclick=()=>{delete E.meals[tid];esave();tplList();toast("Vorlage gelöscht")};
  $("tBack").onclick=tplList;
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
     <div class="note">„An Claude schicken“ gibt Claude deine Lebensmittel, Vorlagen und den gewählten Tag – dann kann er beim Diktieren genau deine Produkte nehmen.</div>
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
