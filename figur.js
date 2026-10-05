/* Figur & Übungskatalog: 3D-Figur (three.js), Requisiten, alle Übungen.
   Posen aus dem Übungskatalog (app/code/uebungskatalog.html) und der Morgenroutine (abgenommen 05.10.2026) – unverändert übernommen.
   Stellt window.Figur bereit. */
(function(){
"use strict";
if(!window.THREE){window.Figur=null;return}
const T=THREE, V=(x,y,z)=>new T.Vector3(x,y,z), D=(x,y,z)=>V(x,y,z).normalize();
let renderer=null,stage=null;
const scene=new T.Scene();
const cam=new T.PerspectiveCamera(35,1,0.05,50);

/* ---------- Materialien: dunkle Füllung (3 Schattierungen) + farbige Kontur ---------- */
const fillMat=new T.ShaderMaterial({uniforms:{uMode:{value:2}},
  vertexShader:`varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform int uMode;varying vec3 vN;varying vec3 vV;void main(){
    vec3 n=normalize(vN),v=normalize(vV),l=normalize(vec3(.4,.8,.6));float d=max(dot(n,l),0.);vec3 c;
    if(uMode==0){c=vec3(.063,.094,.125);}
    else if(uMode==1){float b=d<.25?0.:d<.65?.5:1.;c=mix(vec3(.05,.07,.09),vec3(.17,.2,.24),b);}
    else{float f=pow(1.-max(dot(n,v),0.),3.);c=vec3(.05,.065,.085)+vec3(0.,.55,.65)*f*.55;}
    gl_FragColor=vec4(c,1.);}`});
const outline=(r,g,b)=>new T.ShaderMaterial({side:T.BackSide,
  vertexShader:`void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vec3 n=normalize(normalMatrix*normal);mv.xyz+=n*.009;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`void main(){gl_FragColor=vec4(${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)},1.);}`});
const OUT_FIG=outline(0,.9,1), OUT_GEAR=outline(.17,.36,.45), OUT_LOAD=outline(.91,.93,.95);

const grid=new T.PolarGridHelper(1.2,12,5,48,0x00E5FF,0x00E5FF);
grid.material.transparent=true;grid.material.opacity=.12;scene.add(grid);
const shadow=new T.Mesh(new T.CircleGeometry(.6,48),new T.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.35}));
shadow.rotation.x=-Math.PI/2;shadow.position.y=.002;scene.add(shadow);

function part(g,geo,pos,scale,om=OUT_FIG){
  const m=new T.Mesh(geo,fillMat);m.position.copy(pos);m.scale.copy(scale);g.add(m);
  const o=new T.Mesh(geo,om);o.position.copy(pos);o.scale.copy(scale);g.add(o);
}
function piece(parent,geo,om){const g=new T.Group();part(g,geo,V(0,0,0),V(1,1,1),om);parent.add(g);return g}

/* ---------- Körper ---------- */
const bones={};
function bone(name,parent,offset,len){const g=new T.Group();g.position.copy(offset);(parent?bones[parent].g:scene).add(g);bones[name]={g,parent,len};return g}
const SPH=new T.SphereGeometry(1,32,22);
const ell=(g,sx,sy,sz,y=0)=>part(g,SPH,V(0,y,0),V(sx,sy,sz));
function limb(g,len,r1,r2){part(g,new T.CylinderGeometry(r1,r2,len,32,1,true),V(0,-len/2,0),V(1,1,1));ell(g,r1,r1,r1,0);ell(g,r2,r2,r2,-len)}
const L=n=>bones[n].len;
const pel=bone("pelvis",null,V(0,0,0),0);ell(pel,.165,.105,.115,0);
const sp=bone("spine","pelvis",V(0,.02,0),.24);ell(sp,.135,.14,.1,-.12);
const ch=bone("chest","spine",V(0,-.24,0),.26);ell(ch,.17,.15,.105,-.12);ell(ch,.185,.06,.09,-.22);
const nk=bone("neck","chest",V(0,-.26,0),.09);limb(nk,.09,.045,.048);
const hd=bone("head","neck",V(0,-.09,0),.22);ell(hd,.085,.11,.095,-.1);
for(const s of [1,-1]){const k=s>0?"L":"R";
  limb(bone("uarm"+k,"chest",V(.19*s,-.23,0),.3),.3,.056,.042);
  limb(bone("farm"+k,"uarm"+k,V(0,-.3,0),.27),.27,.044,.032);
  ell(bone("hand"+k,"farm"+k,V(0,-.27,0),.1),.028,.055,.042,-.05);
  limb(bone("thigh"+k,"pelvis",V(.1*s,0,0),.44),.44,.085,.058);
  const sh=bone("shin"+k,"thigh"+k,V(0,-.44,0),.42);limb(sh,.42,.058,.038);ell(sh,.06,.12,.06,-.14);
  ell(bone("foot"+k,"shin"+k,V(0,-.42,0),.22),.042,.11,.03,-.1);
}
const ORDER=["pelvis","spine","chest","neck","head","uarmL","farmL","handL","uarmR","farmR","handR","thighL","shinL","footL","thighR","shinR","footR"];
const DOWN=V(0,-1,0), UP=V(0,1,0);

function orient(dir,side){
  const y=dir.clone().normalize().negate();
  let x=side.clone().sub(y.clone().multiplyScalar(side.dot(y)));
  if(x.lengthSq()<1e-6)x=Math.abs(y.x)<.9?V(1,0,0):V(0,0,1);
  x.normalize();const z=new T.Vector3().crossVectors(x,y).normalize();
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
}
function apply(p){
  const world={};
  bones.pelvis.g.position.copy(p.pelvisPos);
  for(const n of ORDER){
    const b=bones[n], parentQ=b.parent?world[b.parent]:new T.Quaternion();
    let q;
    if(n==="pelvis")q=orient(p.pelvisDir||DOWN,p.pelvisSide);
    else{const side=(p.side&&p.side[n])?p.side[n]:V(1,0,0).applyQuaternion(parentQ);q=orient(p.dir[n]||DOWN,side)}
    world[n]=q;b.g.quaternion.copy(parentQ.clone().invert().multiply(q));
  }
  scene.updateMatrixWorld(true);
}
const wp=n=>bones[n].g.getWorldPosition(V(0,0,0));
function along(n,t){const q=bones[n].g.getWorldQuaternion(new T.Quaternion());return wp(n).add(DOWN.clone().applyQuaternion(q).multiplyScalar(L(n)*t))}
const mid=(a,b)=>a.clone().add(b).multiplyScalar(.5);
function place(p){
  const pg=bones.pelvis.g.position;
  if(p.abs){scene.updateMatrixWorld(true);return}
  const apt=()=>p.anchor.t!=null?along(p.anchor.b,p.anchor.t):wp(p.anchor.b);
  if(p.anchor&&p.anchor.y!=null){pg.y+=p.anchor.y-apt().y}
  else{
    const skip=p.skip||[];
    const pts=[["shinL",wp("shinL"),.058],["shinR",wp("shinR"),.058],["footL",wp("footL"),.04],["footR",wp("footR"),.04],["toeL",along("footL",.95),.03],["toeR",along("footR",.95),.03],["pelvis",wp("pelvis"),.1]];
    for(const [b,t,r] of (p.gx||[]))pts.push([b,along(b,t),r]);
    const sl=p.slope||null;
    let m=1e9;for(const [n,q,r] of pts){if(skip.includes(n))continue;m=Math.min(m,sl?q.y-r-(sl.h-sl.k*q.z):q.y-r)}
    pg.y-=m;if(p.lift)pg.y+=p.lift;
  }
  scene.updateMatrixWorld(true);
  if(p.anchor){const a=apt();if(p.anchor.x!=null)pg.x+=p.anchor.x-a.x;if(p.anchor.z!=null)pg.z+=p.anchor.z-a.z}
  scene.updateMatrixWorld(true);
}
function chestAxes(){const q=bones.chest.g.getWorldQuaternion(new T.Quaternion());return {fwd:V(0,0,-1).applyQuaternion(q),down:V(0,1,0).applyQuaternion(q),side:V(1,0,0).applyQuaternion(q)}}
function clasp(dist=.2,low=.15){const a=chestAxes(),top=wp("neck").add(a.fwd.multiplyScalar(dist)).add(a.down.multiplyScalar(low));return {L:top.clone().add(a.side.clone().multiplyScalar(.035)),R:top.clone().add(a.side.clone().multiplyScalar(-.035))}}
function armIK(p,targets){
  const a=chestAxes();
  for(const [k,sg] of [["L",1],["R",-1]]){
    const sh=wp("uarm"+k), A=L("uarm"+k), B=L("farm"+k);
    const d=targets[k].clone().sub(sh), dist=Math.max(.05,Math.min(d.length(),A+B-.005)), dn=d.normalize();
    const cosA=(A*A+dist*dist-B*B)/(2*A*dist), sinA=Math.sqrt(Math.max(0,1-cosA*cosA));
    const pp=p.pole&&p.pole[k];
    let pole=pp?(typeof pp==="function"?pp():pp.clone()):a.down.clone().add(a.side.clone().multiplyScalar(.6*sg));
    pole.sub(dn.clone().multiplyScalar(pole.dot(dn)));if(pole.lengthSq()<1e-6)pole=a.down.clone();pole.normalize();
    const elbow=sh.clone().add(dn.clone().multiplyScalar(cosA*A)).add(pole.multiplyScalar(sinA*A));
    const end=sh.clone().add(dn.clone().multiplyScalar(dist));
    p.dir["uarm"+k]=elbow.clone().sub(sh).normalize();
    p.dir["farm"+k]=end.clone().sub(elbow).normalize();
    p.dir["hand"+k]=p.dir["farm"+k].clone();
  }
  const pos=bones.pelvis.g.position.clone();apply(p);bones.pelvis.g.position.copy(pos);scene.updateMatrixWorld(true);
}
function legIK(p,Tg){
  for(const k of ["L","R"]){
    if(!Tg[k])continue;
    const hip=wp("thigh"+k),A=L("thigh"+k),B=L("shin"+k);
    const d=Tg[k].a.clone().sub(hip),dist=Math.max(.05,Math.min(d.length(),A+B-.003)),dn=d.normalize();
    const cosA=(A*A+dist*dist-B*B)/(2*A*dist),sinA=Math.sqrt(Math.max(0,1-cosA*cosA));
    let pole=Tg[k].pole.clone();pole.sub(dn.clone().multiplyScalar(pole.dot(dn)));if(pole.lengthSq()<1e-6)pole=V(0,0,1);pole.normalize();
    const knee=hip.clone().add(dn.clone().multiplyScalar(cosA*A)).add(pole.multiplyScalar(sinA*A));
    const end=hip.clone().add(dn.clone().multiplyScalar(dist));
    p.dir["thigh"+k]=knee.clone().sub(hip).normalize();p.dir["shin"+k]=end.clone().sub(knee).normalize();p.dir["foot"+k]=Tg[k].f.clone().normalize();
  }
  const pos=bones.pelvis.g.position.clone();apply(p);bones.pelvis.g.position.copy(pos);scene.updateMatrixWorld(true);
}
function lerpLegs(a,b,k){const o={};for(const s of ["L","R"]){const x=a&&a[s],y=b&&b[s];if(!x&&!y)continue;const u=x||y,v=y||x;o[s]={a:u.a.clone().lerp(v.a,k),pole:u.pole.clone().lerp(v.pole,k),f:u.f.clone().lerp(v.f,k)}}return o}
function mix(a,b,t){
  const o={pelvisPos:a.pelvisPos.clone().lerp(b.pelvisPos,t),pelvisSide:a.pelvisSide.clone().lerp(b.pelvisSide,t).normalize(),pelvisDir:(a.pelvisDir||DOWN).clone().lerp(b.pelvisDir||DOWN,t).normalize(),side:{},dir:{}};
  for(const k of new Set([...Object.keys(a.dir),...Object.keys(b.dir)]))o.dir[k]=(a.dir[k]||b.dir[k]).clone().lerp(b.dir[k]||a.dir[k],t).normalize();
  for(const k of new Set([...Object.keys(a.side||{}),...Object.keys(b.side||{})])){const x=(a.side||{})[k]||V(1,0,0),y=(b.side||{})[k]||V(1,0,0);o.side[k]=x.clone().lerp(y,t).normalize()}
  for(const k of ["anchor","gx","abs","slope"])o[k]=a[k];
  o.skip=a.skip||b.skip; // wie in der Morgenroutine: Kontaktpunkte von Start- oder Zielpose
  o.lift=(a.lift||0)*(1-t)+(b.lift||0)*t;
  return o;
}
const P=(o)=>{o.pelvisPos=o.pelvisPos||V(0,0,0);o.pelvisSide=o.pelvisSide||V(1,0,0);o.dir.neck=o.dir.neck||o.dir.chest;o.dir.head=o.dir.head||o.dir.neck;return o};
const ext=(base,o)=>P({...base,...o,dir:{...base.dir,...(o.dir||{})}});

/* ---------- Requisiten ---------- */
const BOX=new T.BoxGeometry(1,1,1), CYL=new T.CylinderGeometry(1,1,1,40), TOR=new T.TorusGeometry(1,.2,12,40);
function boxBetween(g,a,b,w,h){const d=b.clone().sub(a),len=d.length();g.position.copy(mid(a,b));g.quaternion.setFromUnitVectors(UP,d.normalize());g.scale.set(w,len,h)}
function setBasis(g,x,y){const z=new T.Vector3().crossVectors(x,y).normalize();g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x.clone().normalize(),y.clone().normalize(),z))}
const props={};
function group(name){const g=new T.Group();g.visible=false;scene.add(g);props[name]=g;return g}
const bench=group("bench");
const bPad=piece(bench,BOX,OUT_GEAR),bRoll=piece(bench,CYL,OUT_GEAR),bPlate=piece(bench,BOX,OUT_GEAR),bBeam=piece(bench,BOX,OUT_GEAR),bPost1=piece(bench,BOX,OUT_GEAR),bPost2=piece(bench,BOX,OUT_GEAR),bBase=piece(bench,BOX,OUT_GEAR);
const flat=group("flat");
const fTop=piece(flat,BOX,OUT_GEAR),fLeg1=piece(flat,BOX,OUT_GEAR),fLeg2=piece(flat,BOX,OUT_GEAR);
const box=group("box");const bxTop=piece(box,BOX,OUT_GEAR);
const plates=group("plates");const plateMeshes=[0,1,2,3].map(()=>piece(plates,CYL,OUT_LOAD));
const kb=group("kb");const kbHandle=piece(kb,TOR,OUT_LOAD),kbBody=piece(kb,SPH,OUT_LOAD);
const kbs2=group("kbs2");const kb2Parts=[0,1].map(()=>{const g=new T.Group();kbs2.add(g);return {g,h:piece(g,TOR,OUT_LOAD),b:piece(g,SPH,OUT_LOAD)}});
const dbs=group("dbs");const dbParts=[0,1].map(()=>{const g=new T.Group();dbs.add(g);return {g,bar:piece(g,CYL,OUT_LOAD),h1:piece(g,CYL,OUT_LOAD),h2:piece(g,CYL,OUT_LOAD)}});
const bar=group("bar");const barRod=piece(bar,CYL,OUT_LOAD);const barPlates=[0,1,2,3,4,5,6,7].map(()=>piece(bar,CYL,OUT_LOAD));

const PLATE={20:[.45,.032],15:[.40,.03],10:[.33,.028],5:[.23,.026],2.5:[.21,.02],1.25:[.16,.016]};
function plateSet(kg){const out=[];let r=kg;for(const p of [20,15,10,5,2.5,1.25]){while(r>=p-1e-6&&out.length<4){out.push(p);r-=p}}return out}
function setupPlates(kg){
  const ps=plateSet(kg);let y=0;
  plateMeshes.forEach((m,i)=>{if(i<ps.length){const [d,t]=PLATE[ps[i]];m.visible=true;m.scale.set(d/2,t,d/2);m.position.set(0,y+t/2,0);y+=t}else m.visible=false});
  plates.userData={r:ps.length?PLATE[ps[0]][0]/2:0,th:y};
}
function setupKB(kg){const r=.08*Math.pow(Math.max(kg,4)/8,.37),hr=r*.62;kbHandle.scale.set(hr,hr,hr*1.1);kbHandle.position.set(0,-hr,0);kbBody.scale.set(r,r*.95,r);kbBody.position.set(0,-hr-r*.75,0);kb.userData={r,hr}}
function setupKB2(kg){const r=.08*Math.pow(Math.max(kg,4)/8,.37),hr=r*.62;for(const k of kb2Parts){k.h.scale.set(hr,hr,hr*1.1);k.h.position.set(0,-hr,0);k.b.scale.set(r,r*.95,r);k.b.position.set(0,-hr-r*.75,0)}}
function setupDB(kg){const hr=.042*Math.pow(Math.max(kg,2)/10,.3),hw=.045*Math.pow(Math.max(kg,2)/10,.45)+.012;
  for(const d of dbParts){d.bar.scale.set(.016,.16+2*hw,.016);d.bar.rotation.z=Math.PI/2;
    for(const [h,s] of [[d.h1,1],[d.h2,-1]]){h.scale.set(hr,hw,hr);h.rotation.z=Math.PI/2;h.position.set(s*(.07+hw/2),0,0)}}}
function setupBar(kg){barRod.scale.set(.014,1.6,.014);barRod.rotation.z=Math.PI/2;
  const side=plateSet(Math.max(0,(kg-20)/2));let x=.56;let i=0;
  for(const p of side){const [d,t]=PLATE[p];for(const s of [1,-1]){const m=barPlates[i++];m.visible=true;m.scale.set(d/2,t,d/2);m.rotation.z=Math.PI/2;m.position.set(s*(x+t/2),0,0)}x+=t}
  for(;i<barPlates.length;i++)barPlates[i].visible=false;}

const shoulderMid=()=>mid(wp("uarmL"),wp("uarmR"));
function plateFrame(){const a=chestAxes(),u=plates.userData;const c=wp("neck").add(a.fwd.clone().multiplyScalar(.14)).add(a.down.clone().multiplyScalar(.2));return {a,c,r:u.r||.16}}
const plateHands=()=>{const {a,c,r}=plateFrame();const off=a.fwd.clone().multiplyScalar((plates.userData.th||0)*.5);return {L:c.clone().add(off).add(a.side.clone().multiplyScalar(r*.85)),R:c.clone().add(off).add(a.side.clone().multiplyScalar(-r*.85))}};
const headHands=()=>{const a=chestAxes(),c=along("head",.4);return {L:c.clone().add(a.side.clone().multiplyScalar(.12)).add(a.fwd.clone().multiplyScalar(-.04)),R:c.clone().add(a.side.clone().multiplyScalar(-.12)).add(a.fwd.clone().multiplyScalar(-.04))}};
const headPole={L:()=>{const a=chestAxes();return a.side.clone().add(a.down.clone().multiplyScalar(-.4))},R:()=>{const a=chestAxes();return a.side.clone().negate().add(a.down.clone().multiplyScalar(-.4))}};
const chestHands=()=>clasp(.2,.15);
const hang=(dx=0,dz=0)=>()=>({L:wp("uarmL").add(V(.03+dx,-.56,dz)),R:wp("uarmR").add(V(-.03-dx,-.56,dz))});

/* =================== ÜBUNGEN =================== */
const hold=(A,B,lab="halten")=>[[lab,2.6,A,B],[lab,2.6,B,A]];
const FRONT=D(0,-1,1), LEG=D(0,-1,-1);

/* --- Back Extension 45° --- */
function beLegs(single){
  const o={thighL:D(.03,-1,-1),shinL:D(.03,-1,-1),footL:D(0,-1,1),thighR:D(-.03,-1,-1)};
  if(single){o.shinR=D(-.02,.42,-.9);o.footR=D(0,-.85,-.5)}else{o.shinR=D(-.03,-1,-1);o.footR=D(0,-1,1)}
  return o;
}
function backExt(o){
  const hands=o.kg>0?plateHands:chestHands, pole=null;
  const base={anchor:{b:"footL",y:.42,z:-.55},hands,pole,pelvisDir:D(0,-1,-1),dir:{...beLegs(o.legs==="single")}};
  const TOP=ext(base,{dir:{spine:D(0,1,1),chest:D(0,1,1),neck:D(0,1,1.05),head:D(0,1,1.1)}});
  const TOP2=ext(base,{dir:{spine:D(0,1,1.04),chest:D(0,1,1.06),neck:D(0,1,1.1),head:D(0,1,1.15)}});
  if(o.mode==="hold")return hold(TOP,TOP2);
  const BOT=o.range==="halb"?ext(base,{pelvisDir:D(0,-.1,-1),dir:{spine:D(0,-.15,1),chest:D(0,-.3,1),neck:D(0,-.35,1),head:D(0,-.4,1)}})
                           :ext(base,{pelvisDir:D(0,.5,-1),dir:{spine:D(0,-.5,1),chest:D(0,-1,.45),neck:D(0,-1,.15),head:D(0,-1,-.05)}});
  return [["runter",1.7,TOP,BOT],["unten",.35,BOT,BOT],["hoch",1.4,BOT,TOP],["oben",.6,TOP,TOP]];
}
function benchUpdate(o){
  const A=wp("footL");A.x=0;const H=mid(wp("thighL"),wp("thighR"));H.x=0;
  const X=V(1,0,0),padF=.1;
  const pc=H.clone().add(LEG.clone().multiplyScalar(padF+.14)).add(FRONT.clone().multiplyScalar(.14));
  bPad.position.copy(pc);setBasis(bPad,X,FRONT);bPad.scale.set(.44,.1,.32);
  const rc=A.clone().sub(FRONT.clone().multiplyScalar(.095)).sub(LEG.clone().multiplyScalar(.08));
  bRoll.position.copy(rc);bRoll.rotation.set(0,0,Math.PI/2);bRoll.scale.set(.045,.38,.045);
  const fc=A.clone().add(LEG.clone().multiplyScalar(.075)).add(FRONT.clone().multiplyScalar(.05));
  bPlate.position.copy(fc);setBasis(bPlate,X,FRONT);bPlate.scale.set(.42,.3,.03);
  const p1=fc.clone().add(FRONT.clone().multiplyScalar(.1)).add(LEG.clone().multiplyScalar(.04)),p2=pc.clone().add(FRONT.clone().multiplyScalar(.1));
  boxBetween(bBeam,p1,p2,.07,.07);
  const q=p1.clone().lerp(p2,.45);boxBetween(bPost1,q,V(q.x,0,q.z),.07,.07);
  boxBetween(bPost2,p1,V(p1.x,0,p1.z),.07,.07);
  bBase.position.set(0,.02,(p1.z+q.z)/2);bBase.scale.set(.5,.04,Math.abs(q.z-p1.z)+.2);
}
/* --- Seated Good Morning --- */
function seatedGM(o){
  const hands=o.kg>0?plateHands:chestHands;
  const base={hands,pole:null,pelvisDir:D(0,-.75,-.66),dir:{thighL:D(.2,-.03,1),thighR:D(-.2,-.03,1),shinL:D(0,-1,.05),shinR:D(0,-1,.05),footL:D(.08,-.12,1),footR:D(-.08,-.12,1)}};
  const A=ext(base,{dir:{spine:D(0,.62,.78),chest:D(0,.56,.83),neck:D(0,.58,.81),head:D(0,.62,.78)}});
  const B=ext(base,{dir:{spine:D(0,.6,.8),chest:D(0,.53,.85),neck:D(0,.55,.83),head:D(0,.6,.8)}});
  return hold(A,B);
}
function flatSeatUpdate(){const p=wp("pelvis"),top=p.y-.1;fTop.position.set(0,top-.025,p.z-.25);fTop.scale.set(.36,.05,.9);
  fLeg1.position.set(0,(top-.05)/2,p.z+.05);fLeg1.scale.set(.32,top-.05,.05);fLeg2.position.set(0,(top-.05)/2,p.z-.6);fLeg2.scale.set(.32,top-.05,.05)}
/* --- Beckenheben --- */
function bridge(o){
  const single=o.legs==="single";
  const hands=o.kg>0?()=>{const a=chestAxes(),c=wp("pelvis").add(a.fwd.clone().multiplyScalar(.12+(plates.userData.th||0)));const r=plates.userData.r||.16;return {L:c.clone().add(a.side.clone().multiplyScalar(r*.8)),R:c.clone().add(a.side.clone().multiplyScalar(-r*.8))}}
                     :()=>{const p=wp("pelvis");return {L:V(p.x+.28,.035,p.z-.12),R:V(p.x-.28,.035,p.z-.12)}};
  const base={anchor:{b:"footL",z:.42},gx:[["chest",.85,.09],["head",.5,.09]],hands,pole:{L:()=>V(1,.3,0),R:()=>V(-1,.3,0)}};
  const free=(th)=>single?{thighR:th,shinR:th.clone(),footR:D(0,.6,.8)}:{};
  const DOWNP=ext(base,{pelvisDir:D(0,0,1),dir:{spine:D(0,-.02,-1),chest:D(0,0,-1),neck:D(0,.04,-1),head:D(0,.06,-1),
    thighL:D(.1,.8,.6),shinL:D(0,-.9,.44),footL:D(.03,-.12,1),thighR:D(-.1,.8,.6),shinR:D(0,-.9,.44),footR:D(-.03,-.12,1),...free(D(-.1,.8,.6))}});
  const UPP=ext(base,{pelvisDir:D(0,.4,.92),dir:{spine:D(0,-.4,-.92),chest:D(0,-.22,-1),neck:D(0,.02,-1),head:D(0,.04,-1),
    thighL:D(.08,.4,.92),shinL:D(0,-1,.12),footL:D(.03,-.12,1),thighR:D(-.08,.4,.92),shinR:D(0,-1,.12),footR:D(-.03,-.12,1),...free(D(-.08,.4,.92))}});
  const UP2=ext(UPP,{dir:{spine:D(0,-.42,-.91)}});
  if(o.mode==="hold")return [["hoch",1.4,DOWNP,UPP],...hold(UPP,UP2),["halten",2.6,UPP,UPP]].slice(1);
  return [["Becken hoch",1.2,DOWNP,UPP],["oben anspannen",.8,UPP,UPP],["ablassen",1.3,UPP,DOWNP],["unten",.3,DOWNP,DOWNP]];
}
const STAND={thighL:D(.03,-1,0),thighR:D(-.03,-1,0),shinL:D(0,-1,-.02),shinR:D(0,-1,-.02),footL:D(.08,-.12,1),footR:D(-.08,-.12,1),spine:D(0,1,0),chest:D(0,1,.02),neck:D(0,1,.03),head:D(0,1,.05)};
function slRDL(o){
  const hands=()=>({L:wp("uarmL").add(V(.07,-.53,.03)),R:wp("uarmR").add(V(-.03,-.56,.02))});
  const base={anchor:{b:"footL",x:.1,z:0},hands,pole:{L:()=>V(.3,0,-1),R:()=>V(-.3,0,-1)}};
  const TOP=ext(base,{dir:{...STAND,thighR:D(-.03,-1,-.1),shinR:D(0,-1,-.3),footR:D(-.05,-.6,.8)}});
  const BOT=ext(base,{pelvisDir:D(0,-.22,-1),dir:{...STAND,thighL:D(.02,-1,.22),shinL:D(0,-1,-.12),
    spine:D(0,.22,1),chest:D(0,.18,1),neck:D(0,.2,1),head:D(0,.25,1),thighR:D(-.03,.2,-1),shinR:D(-.03,.2,-1),footR:D(0,-1,-.2)}});
  return [["Hüfte nach hinten",1.8,TOP,BOT],["unten",.4,BOT,BOT],["hoch, Gesäß fest",1.5,BOT,TOP],["oben",.5,TOP,TOP]];
}
function rdl(o){
  const base={anchor:{b:"footL",x:.1,z:0},pole:{L:()=>V(.2,0,-1),R:()=>V(-.2,0,-1)}};
  const TOP=ext(base,{hands:()=>({L:wp("uarmL").add(V(-.05,-.5,.15)),R:wp("uarmR").add(V(.05,-.5,.15))}),dir:{...STAND}});
  const BOT=ext(base,{hands:()=>({L:wp("uarmL").add(V(-.05,-.55,.02)),R:wp("uarmR").add(V(.05,-.55,.02))}),pelvisDir:D(0,-.4,-1),dir:{...STAND,thighL:D(.03,-1,.28),thighR:D(-.03,-1,.28),shinL:D(0,-1,-.12),shinR:D(0,-1,-.12),
    spine:D(0,.42,1),chest:D(0,.36,1),neck:D(0,.4,1),head:D(0,.45,1)}});
  return [["Hüfte nach hinten",1.8,TOP,BOT],["unten",.35,BOT,BOT],["hoch",1.4,BOT,TOP],["oben",.5,TOP,TOP]];
}
function barPoint(){const a=chestAxes();return wp("neck").add(a.down.clone().multiplyScalar(.07)).add(a.fwd.clone().multiplyScalar(-.1))}
function goodMorning(o){
  const hands=()=>{const a=chestAxes(),c=barPoint();return {L:c.clone().add(a.side.clone().multiplyScalar(.42)),R:c.clone().add(a.side.clone().multiplyScalar(-.42))}};
  const pole={L:()=>{const a=chestAxes();return a.down.clone().add(a.fwd.clone().multiplyScalar(-.4))},R:()=>{const a=chestAxes();return a.down.clone().add(a.fwd.clone().multiplyScalar(-.4))}};
  const base={anchor:{b:"footL",x:.13,z:0},hands,pole};
  const W={thighL:D(.08,-1,0),thighR:D(-.08,-1,0)};
  const TOP=ext(base,{dir:{...STAND,...W}});
  const BOT=ext(base,{pelvisDir:D(0,-.15,-1),dir:{...STAND,thighL:D(.08,-1,.24),thighR:D(-.08,-1,.24),shinL:D(0,-1,-.12),shinR:D(0,-1,-.12),spine:D(0,.18,1),chest:D(0,.12,1),neck:D(0,.25,1),head:D(0,.35,1)}});
  return [["Hüfte nach hinten",2,TOP,BOT],["unten",.3,BOT,BOT],["hoch",1.5,BOT,TOP],["oben",.5,TOP,TOP]];
}
function swing(o){
  const base={anchor:{b:"footL",x:.16,z:0},pole:{L:()=>V(0,-1,0),R:()=>V(0,-1,0)}};
  const W={thighL:D(.12,-1,0),thighR:D(-.12,-1,0),shinL:D(0,-1,-.02),shinR:D(0,-1,-.02),footL:D(.2,-.12,1),footR:D(-.2,-.12,1)};
  const HIKE=ext(base,{hands:()=>{const c=mid(along("thighL",.3),along("thighR",.3)).add(V(0,-.02,-.08));return {L:c.clone().add(V(.035,0,0)),R:c.clone().add(V(-.035,0,0))}},
    pelvisDir:D(0,-.6,-1),dir:{...STAND,...W,thighL:D(.12,-1,.3),thighR:D(-.12,-1,.3),shinL:D(0,-1,-.15),shinR:D(0,-1,-.15),spine:D(0,.6,1),chest:D(0,.5,1),neck:D(0,.62,1),head:D(0,.75,1)}});
  const TOP=ext(base,{hands:()=>{const c=shoulderMid().add(V(0,-.03,.56));return {L:c.clone().add(V(.035,0,0)),R:c.clone().add(V(-.035,0,0))}},
    dir:{...STAND,...W,spine:D(0,1,-.04),chest:D(0,1,-.02)}});
  return [["Hüfte explodiert",.55,HIKE,TOP],["oben",.25,TOP,TOP],["fallen lassen",.55,TOP,HIKE],["hinten",.2,HIKE,HIKE]];
}
function revHyper(o){
  const base={anchor:{b:"pelvis",y:.92,z:0},pelvisDir:D(0,0,-1),hands:()=>({L:V(.17,.84,.98),R:V(-.17,.84,.98)}),pole:{L:()=>V(.6,-1,0),R:()=>V(-.6,-1,0)},
    dir:{spine:D(0,.02,1),chest:D(0,0,1),neck:D(0,.05,1),head:D(0,.1,1)}};
  const BOT=ext(base,{dir:{thighL:D(.05,-1,-.12),thighR:D(-.05,-1,-.12),shinL:D(.03,-1,-.12),shinR:D(-.03,-1,-.12),footL:D(0,-.3,-1),footR:D(0,-.3,-1)}});
  const TOP=ext(base,{dir:{thighL:D(.07,.12,-1),thighR:D(-.07,.12,-1),shinL:D(.07,.12,-1),shinR:D(-.07,.12,-1),footL:D(0,-.75,-.66),footR:D(0,-.75,-.66)}});
  return [["Beine hoch",1.2,BOT,TOP],["oben, Gesäß fest",.6,TOP,TOP],["ablassen",1.6,TOP,BOT],["unten",.3,BOT,BOT]];
}
function rhBenchUpdate(){const top=.81;fTop.position.set(0,top-.04,.5);fTop.scale.set(.42,.08,1.1);
  fLeg1.position.set(0,(top-.08)/2,.06);fLeg1.scale.set(.36,top-.08,.06);fLeg2.position.set(0,(top-.08)/2,.96);fLeg2.scale.set(.36,top-.08,.06)}
function jefferson(o){
  const twoHands=(f)=>()=>{const c=f();return {L:c.clone().add(V(.035,0,0)),R:c.clone().add(V(-.035,0,0))}};
  const base={lift:.3,anchor:{b:"footL",x:.08,z:0},pole:{L:()=>V(.3,0,-1),R:()=>V(-.3,0,-1)}};
  const LEGS={thighL:D(.02,-1,0),thighR:D(-.02,-1,0),shinL:D(0,-1,0),shinR:D(0,-1,0),footL:D(.05,-.1,1),footR:D(-.05,-.1,1)};
  const TOP=ext(base,{hands:twoHands(()=>wp("pelvis").add(V(0,-.24,.2))),dir:{...STAND,...LEGS}});
  const MID=ext(base,{hands:twoHands(()=>shoulderMid().add(V(0,-.54,.1))),pelvisDir:D(0,-1,-.15),dir:{...STAND,...LEGS,thighL:D(.02,-1,.05),thighR:D(-.02,-1,.05),spine:D(0,1,.25),chest:D(0,.35,1),neck:D(0,-.4,1),head:D(0,-.7,1)}});
  const BOT=ext(base,{hands:twoHands(()=>shoulderMid().add(V(0,-.56,0))),pelvisDir:D(0,-.4,-1),dir:{...STAND,...LEGS,thighL:D(.02,-1,.1),thighR:D(-.02,-1,.1),spine:D(0,-.35,1),chest:D(0,-1,.35),neck:D(0,-1,0),head:D(0,-1,-.15)}});
  return [["Kinn zur Brust, abrollen",1.6,TOP,MID],["Wirbel für Wirbel",1.6,MID,BOT],["unten",.5,BOT,BOT],["aufrollen",1.6,BOT,MID],["Kopf zuletzt",1.4,MID,TOP],["oben",.5,TOP,TOP]];
}
function boxUpdate(){const f=mid(wp("footL"),wp("footR"));bxTop.position.set(0,.15,f.z+.06);bxTop.scale.set(.56,.3,.42)}
function superman(o){
  const base={pelvisDir:D(0,0,-1),gx:[["chest",.45,.1]],pole:{L:()=>V(.3,-1,0),R:()=>V(-.3,-1,0)}};
  const handsAt=(y)=>()=>{const n=wp("neck");return {L:V(n.x+.16,y==null?n.y-.02:y,n.z+.52),R:V(n.x-.16,y==null?n.y-.02:y,n.z+.52)}};
  const REST=ext(base,{hands:handsAt(.035),dir:{spine:D(0,.0,1),chest:D(0,-.03,1),neck:D(0,-.15,1),head:D(0,-.35,1),thighL:D(.05,0,-1),thighR:D(-.05,0,-1),shinL:D(.05,.01,-1),shinR:D(-.05,.01,-1),footL:D(0,-.35,-1),footR:D(0,-.35,-1)}});
  const UPP=ext(base,{hands:handsAt(),dir:{spine:D(0,.12,1),chest:D(0,.3,1),neck:D(0,.32,1),head:D(0,.32,1),thighL:D(.05,.13,-1),thighR:D(-.05,.13,-1),shinL:D(.05,.15,-1),shinR:D(-.05,.15,-1),footL:D(0,-.2,-1),footR:D(0,-.2,-1)}});
  const UP2=ext(UPP,{dir:{chest:D(0,.32,1)}});
  if(o.mode==="hold")return hold(UPP,UP2);
  return [["Arme + Beine heben",1.2,REST,UPP],["oben halten",1.2,UPP,UPP],["ablegen",1.2,UPP,REST],["kurz locker",.4,REST,REST]];
}
const QUAD={pelvisDir:D(0,0,-1),hands:()=>({L:wp("uarmL").setY(.03).add(V(0,0,.04)),R:wp("uarmR").setY(.03).add(V(0,0,.04))}),dir:{
  thighL:D(0,-1,0),shinL:D(0,0,-1),footL:D(0,-.25,-1),thighR:D(0,-1,0),shinR:D(0,0,-1),footR:D(0,-.25,-1),
  spine:D(0,.04,1),chest:D(0,0,1),neck:D(0,-.15,1),head:D(0,-.45,1)}};
function birdDog(o){
  const fixedHands=QUAD.hands;
  const base={...QUAD,anchor:{b:"pelvis",x:0,z:0}};
  const Q=ext(base,{hands:fixedHands});
  const A=ext(base,{hands:()=>({L:wp("uarmL").setY(.03).add(V(0,0,.04)),R:wp("uarmR").add(V(-.01,-.02,.56))}),dir:{thighL:D(.02,.05,-1),shinL:D(.02,.05,-1),footL:D(0,-1,-.15)}});
  const B=ext(base,{hands:()=>({R:wp("uarmR").setY(.03).add(V(0,0,.04)),L:wp("uarmL").add(V(.01,-.02,.56))}),dir:{thighR:D(-.02,.05,-1),shinR:D(-.02,.05,-1),footR:D(0,-1,-.15)}});
  if(o.mode==="hold")return [["rechter Arm + linkes Bein",1.1,Q,A],["halten",3,A,A],["zurück",1.1,A,Q],["linker Arm + rechtes Bein",1.1,Q,B],["halten",3,B,B],["zurück",1.1,B,Q]];
  return [["rechter Arm + linkes Bein",1.1,Q,A],["strecken",.7,A,A],["zurück",1,A,Q],["linker Arm + rechtes Bein",1.1,Q,B],["strecken",.7,B,B],["zurück",1,B,Q]];
}
function elephant(o){
  const base={anchor:{b:"footL",x:.1,z:0},hands:()=>({L:V(.15,.03,.34),R:V(-.15,.03,.34)}),pole:{L:()=>V(.3,0,-1),R:()=>V(-.3,0,-1)},pelvisDir:D(0,-.6,-1),
    dir:{spine:D(0,-.45,1),chest:D(0,-.95,.35),neck:D(0,-1,.1),head:D(0,-1,-.1),footL:D(.05,-.1,1),footR:D(-.05,-.1,1)}};
  const A=ext(base,{dir:{thighL:D(.04,-1,.42),shinL:D(0,-1,-.25),thighR:D(-.03,-1,.03),shinR:D(-.03,-1,0)}});
  const B=ext(base,{dir:{thighR:D(-.04,-1,.42),shinR:D(0,-1,-.25),thighL:D(.03,-1,.03),shinL:D(.03,-1,0)}});
  return [["linkes Knie beugen",1.1,B,A],["rechtes Bein lang",.5,A,A],["rechtes Knie beugen",1.1,A,B],["linkes Bein lang",.5,B,B]];
}
function catCow(o){
  const base={...QUAD,anchor:{b:"pelvis",x:0,z:0}};
  const CAT=ext(base,{pelvisDir:D(0,-.35,-1),dir:{spine:D(0,.38,1),chest:D(0,-.12,1),neck:D(0,-.6,1),head:D(0,-1,.5)}});
  const COW=ext(base,{pelvisDir:D(0,.3,-1),dir:{spine:D(0,-.22,1),chest:D(0,.12,1),neck:D(0,.35,1),head:D(0,.55,1)}});
  return [["Katze: rund machen",1.8,COW,CAT],["ausatmen",.6,CAT,CAT],["Kuh: Brust nach vorne",1.8,CAT,COW],["einatmen",.6,COW,COW]];
}

/* =================== KNIE · ATG =================== */
const stepper=group("stepper");const stDeck=piece(stepper,BOX,OUT_GEAR),stF1=piece(stepper,BOX,OUT_GEAR),stF2=piece(stepper,BOX,OUT_GEAR);
const wedge=group("wedge");const wdg=piece(wedge,BOX,OUT_GEAR);
const wallG=group("wall");const wallP=piece(wallG,BOX,OUT_GEAR);
const H=o=>(o.step||0)/100;
function stepAt(cx,cz,h){
  for(const c of stepper.children)c.visible=h>0;if(!h)return;
  const t=.06;stDeck.position.set(cx,h-t/2,cz);stDeck.scale.set(.9,t,.36);
  for(const [f,sg] of [[stF1,1],[stF2,-1]]){f.position.set(cx+sg*.36,(h-t)/2,cz);f.scale.set(.16,h-t,.38)}
}
const handsOnHips=()=>{const p=wp("pelvis");return {L:p.clone().add(V(.21,.04,.02)),R:p.clone().add(V(-.21,.04,.02))}};
const hipPole={L:()=>V(1,0,-.4),R:()=>V(-1,0,-.4)};
const dbPole={L:()=>V(.2,0,-1),R:()=>V(-.2,0,-1)};
function atgSplit(o){
  const h=H(o);
  const front={a:V(.1,h+.045,.32),pole:V(0,.25,1),f:D(.05,-.08,1)};
  const back={a:V(-.1,.13,-.5),pole:V(0,-.6,1),f:D(0,-.5,.85)};
  const base={abs:true,hands:o.kg>0?hang(.02,0):chestHands,pole:o.kg>0?dbPole:null,legs:{L:front,R:back},dir:{}};
  const TOP=ext(base,{pelvisPos:V(0,.8,-.05),dir:{spine:D(0,1,.04),chest:D(0,1,.04)}});
  const BOT=ext(base,{pelvisPos:V(0,.37+h,.12),dir:{spine:D(0,1,.18),chest:D(0,1,.12)}});
  const BOT2=ext(base,{pelvisPos:V(0,.355+h,.135),dir:{spine:D(0,1,.2),chest:D(0,1,.14)}});
  if(o.mode==="hold")return hold(BOT,BOT2,"unten halten");
  return [["runter, Knie weit über die Zehen",2,TOP,BOT],["unten",.4,BOT,BOT],["hoch",1.5,BOT,TOP],["oben",.5,TOP,TOP]];
}
function stepDown(o){
  const h=H(o),stand={a:V(.1,h+.045,0),pole:V(0,.1,1),f:D(.05,-.08,1)};
  const base={abs:true,hands:o.kg>0?hang(.03,0):chestHands,pole:o.kg>0?dbPole:null,dir:{}};
  const TOP=ext(base,{pelvisPos:V(0,h+.88,-.03),legs:{L:stand,R:{a:V(-.1,h+.14,.2),pole:V(0,0,1),f:D(0,-.25,1)}},dir:{spine:D(0,1,.05),chest:D(0,1,.05)}});
  const BOT=ext(base,{pelvisPos:V(0,h+.5,-.1),legs:{L:stand,R:{a:V(-.1,.075,.42),pole:V(0,0,1),f:D(0,.35,1)}},dir:{spine:D(0,1,.22),chest:D(0,1,.16)}});
  return [["langsam absenken",2.4,TOP,BOT],["Ferse antippen",.3,BOT,BOT],["hochdrücken",1.4,BOT,TOP],["oben",.5,TOP,TOP]];
}
function poliquin(o){
  const h=H(o),stand={a:V(.1,h+.09,0),pole:V(0,.1,1),f:D(.05,-.4,1)};
  const base={abs:true,hands:chestHands,dir:{}};
  const TOP=ext(base,{pelvisPos:V(0,h+.94,-.05),legs:{L:stand,R:{a:V(-.12,h+.15,-.22),pole:V(0,-.2,1),f:D(0,-.75,.66)}},dir:{spine:D(0,1,.04),chest:D(0,1,.04)}});
  const BOT=ext(base,{pelvisPos:V(0,h+.71,-.08),legs:{L:stand,R:{a:V(-.12,h-.06,-.2),pole:V(0,-.2,1),f:D(0,-.75,.66)}},dir:{spine:D(0,1,.12),chest:D(0,1,.1)}});
  return [["Knie nach vorne schieben",1.6,TOP,BOT],["unten",.3,BOT,BOT],["Knie ganz strecken",1.2,BOT,TOP],["oben fest",.6,TOP,TOP]];
}
function wedgeUpdate(o){const h=H(o),a=wp("footL");wdg.position.set(a.x,h+.03,a.z-.02);wdg.scale.set(.12,.06,.1)}
function tibialis(o){
  const base={anchor:{b:"footL",x:.12,z:0},skip:["toeL","toeR"],hands:hang(.03,.04),dir:{thighL:D(.08,-1,.32),thighR:D(-.08,-1,.32),shinL:D(.08,-1,.32),shinR:D(-.08,-1,.32),spine:D(0,1,-.14),chest:D(0,1,-.1),neck:D(0,1,-.04),head:D(0,1,0)}};
  const DN=ext(base,{dir:{footL:D(.05,-.12,1),footR:D(-.05,-.12,1)}});
  const UPP=ext(base,{dir:{footL:D(.05,.8,.6),footR:D(-.05,.8,.6)}});
  return [["Zehen hoch",.9,DN,UPP],["oben halten",.5,UPP,UPP],["langsam ab",1.3,UPP,DN],["unten",.2,DN,DN]];
}
function wallBehind(){const p=wp("pelvis");wallP.position.set(0,.65,p.z-.17);wallP.scale.set(1.3,1.3,.05)}
function calf(o){
  const h=.15,single=o.legs==="single";
  const right=single?{thighR:D(-.03,-1,-.05),shinR:D(0,.15,-1),footR:D(0,-.8,-.45)}:{};
  const base={anchor:{b:"footL",t:.7,y:h+.032,z:.1},hands:o.kg>0?hang(.02,0):handsOnHips,pole:o.kg>0?dbPole:hipPole,dir:{...STAND}};
  const DN=ext(base,{dir:{footL:D(.05,.42,1),footR:D(-.05,.42,1),...right}});
  const UPP=ext(base,{dir:{footL:D(.05,-.85,.55),footR:D(-.05,-.85,.55),...right}});
  return [["hoch auf die Zehen",1,DN,UPP],["oben",.6,UPP,UPP],["tief runter",1.6,UPP,DN],["unten dehnen",.6,DN,DN]];
}
function balance(o){
  const base={anchor:{b:"footL",x:.1,z:0},hands:handsOnHips,pole:hipPole,dir:{...STAND,thighL:D(.03,-1,.08),shinL:D(0,-1,-.08),thighR:D(-.03,-1,.05),shinR:D(0,-.15,-1),footR:D(0,-.9,-.4)}};
  const A=ext(base,{dir:{spine:D(.02,1,.03)}}),B=ext(base,{dir:{spine:D(-.02,1,.05),chest:D(-.01,1,.03)}});
  return hold(A,B);
}
const INC=Math.tan(10*Math.PI/180), BELT_H=.2;
const treadmill=group("treadmill");const tmBelt=piece(treadmill,BOX,OUT_GEAR),tmRailL=piece(treadmill,BOX,OUT_GEAR),tmRailR=piece(treadmill,BOX,OUT_GEAR),tmPost=piece(treadmill,BOX,OUT_GEAR),tmConsole=piece(treadmill,BOX,OUT_GEAR),tmFoot=piece(treadmill,BOX,OUT_GEAR);
function treadmillUpdate(){
  const a=Math.atan(INC),len=1.7,cz=-.15;
  tmBelt.position.set(0,BELT_H-INC*cz-.03,cz);tmBelt.rotation.set(a,0,0);tmBelt.scale.set(.6,.06,len);
  const zb=cz-len/2+.05,yb=BELT_H-INC*zb;
  tmPost.position.set(0,(yb+1.1)/2,zb-.05);tmPost.scale.set(.08,1.1-yb+.4,.06);
  tmConsole.position.set(0,1.2,zb);tmConsole.scale.set(.7,.08,.22);
  for(const [r,x] of [[tmRailL,.36],[tmRailR,-.36]]){r.position.set(x,1.02,zb+.6);r.scale.set(.04,.04,1.2)}
  const zf=cz+len/2;tmFoot.position.set(0,(BELT_H-INC*zf)/2-.02,zf-.05);tmFoot.scale.set(.6,Math.max(.04,BELT_H-INC*zf-.04),.08);
}
function walkBack(o){
  const Tt={spine:D(0,1,.2),chest:D(0,1,.16),neck:D(0,1,.18),head:D(0,1,.22)};
  const S=[
    {th:D(0,-1,-.34),sh:D(0,-1,-.36),ft:D(0,-.55,.84)},
    {th:D(0,-1,-.02),sh:D(0,-1,-.06),ft:D(0,-.18,1)},
    {th:D(0,-1,.3),sh:D(0,-1,.02),ft:D(0,-.05,1)},
    {th:D(0,-1,.08),sh:D(0,-.5,-.86),ft:D(0,-.8,-.55)}];
  const ARM=[.15,0,-.15,0];
  const key=k=>{const l=S[k],r=S[(k+2)%4];
    return ext({anchor:{b:"pelvis",x:0,z:0},slope:{h:BELT_H,k:INC},dir:{...Tt}},{
      hands:()=>({L:wp("uarmL").add(V(.05,-.53,ARM[k])),R:wp("uarmR").add(V(-.05,-.53,ARM[(k+2)%4]))}),
      pole:{L:()=>V(.2,0,-1),R:()=>V(-.2,0,-1)},
      dir:{thighL:V(.04,0,0).add(l.th).normalize(),shinL:l.sh,footL:V(.05,0,0).add(l.ft).normalize(),
           thighR:V(-.04,0,0).add(r.th).normalize(),shinR:r.sh,footR:V(-.05,0,0).add(r.ft).normalize()}})};
  const K=[0,1,2,3].map(key),d=.36;
  return [["rückwärts bergauf",d,K[0],K[1],"lin"],["rückwärts bergauf",d,K[1],K[2],"lin"],["rückwärts bergauf",d,K[2],K[3],"lin"],["rückwärts bergauf",d,K[3],K[0],"lin"]];
}

/* =================== HÜFTE / MORGENROUTINE =================== */
const towel=group("towel");const towelM=piece(towel,new T.CapsuleGeometry(.045,.42,6,18),OUT_FIG);
const chair=group("chair");
part(chair,BOX,V(0,.4,0),V(.46,.05,.44),OUT_FIG);part(chair,BOX,V(0,.66,-.2),V(.46,.48,.05),OUT_FIG);
for(const [x,z] of [[-.2,-.19],[.2,-.19],[-.2,.19],[.2,.19]])part(chair,BOX,V(x,.19,z),V(.035,.38,.035),OUT_FIG);
/* Wand der Morgenroutine (Hamstring-Curl, Wanddehnung) */
const wallM=group("wallM");part(wallM,BOX,V(0,.6,0),V(1.5,1.2,.04),OUT_FIG);
let towelPos=null;
function towelFeet(){const a=wp("footL"),b=wp("footR");towelM.rotation.set(0,0,Math.PI/2);towelM.position.set((a.x+b.x)/2,.045,(a.z+b.z)/2-.02)}
const towelKnee=bn=>()=>{if(!towelPos)return;towelM.rotation.set(Math.PI/2,0,0);towelM.position.copy(towelPos)};
const chairAt=f=>()=>{const c=f();chair.position.set(c.x,0,c.z);chair.rotation.y=c.ry||0};
const wallAt=f=>()=>{const w=f();wallM.position.set(w.x||0,0,w.z)};

/* ---- Posen 1:1 aus der Morgenroutine (von Jannes abgenommen, Stand 05.10.2026) ---- */
const HEEL=P({hands:()=>({L:wp("footL").add(V(.08,.03,.03)),R:wp("footR").add(V(-.08,.03,.03))}),dir:{
  thighL:D(.12,-.28,1),thighR:D(-.12,-.28,1),shinL:D(.14,.02,-1),shinR:D(-.14,.02,-1),footL:D(-.6,-.08,-.8),footR:D(.6,-.08,-.8),
  spine:D(0,1,-.05),chest:D(0,1,.02),head:D(0,1,.06)}});
const HEEL2=P({hands:HEEL.hands,dir:{...HEEL.dir,spine:D(0,1,-.02),chest:D(0,1,.06),neck:D(0,1,.07),head:D(0,1,.1)}});
const GRASS=P({hands:()=>{const p=wp("pelvis");return {L:V(p.x+.3,.03,p.z-.05),R:wp("footR").add(V(-.02,.08,.02))}},dir:{
  thighL:D(.12,-.28,1),shinL:D(.14,.02,-1),footL:D(-.6,-.08,-.8),
  thighR:D(-.5,-.28,.85),shinR:D(-.2,.22,-.95),footR:D(.08,-.75,-.65),
  spine:D(.1,1,-.05),chest:D(.14,1,0),head:D(.06,1,.1)}});
const GRASS2=P({hands:GRASS.hands,dir:{...GRASS.dir,spine:D(.14,1,-.05),chest:D(.2,1,.02),neck:D(.2,1,.02),head:D(.1,1,.12)}});
const CAMEL_HUG=P({pelvisPos:V(0,0,-.05),hands:()=>({L:along("shinR",.4).add(V(.08,0,.06)),R:along("shinR",.4).add(V(-.1,0,.03))}),dir:{
  thighL:D(.35,-.35,.85),shinL:D(.05,.02,-1),footL:D(-.15,-.08,-.98),
  thighR:D(-.1,.6,.8),shinR:D(0,-1,-.1),footR:D(0,-.15,1),
  spine:D(0,.75,.65),chest:D(-.05,.45,.9),neck:D(-.05,.4,.92),head:D(-.05,.3,.95)}});
const CAMEL_STAND=P({pelvisPos:V(0,0,.05),hands:()=>{const p=wp("pelvis");return {L:p.clone().add(V(.25,-.22,.1)),R:p.clone().add(V(-.25,-.22,.12))}},dir:{
  thighR:D(-.05,-1,.85),shinR:D(0,-1,-.45),footR:D(0,-.15,1),
  thighL:D(.05,-1,.05),shinL:D(0,-.75,-1),footL:D(-.05,-.05,-1),
  spine:D(0,1,.08),chest:D(0,1,.12),head:D(0,1,.1)}});
const SQUAT=P({hands:()=>clasp(.4,.24),dir:{
  thighL:D(.3,.25,.92),thighR:D(-.3,.25,.92),shinL:D(-.05,-.75,-.66),shinR:D(.05,-.75,-.66),footL:D(.08,-.3,1),footR:D(-.08,-.3,1),
  spine:D(0,.85,.5),chest:D(0,.95,.32),head:D(0,1,.3)}});
const SQUAT2=P({hands:SQUAT.hands,dir:{...SQUAT.dir,spine:D(0,.83,.54),chest:D(0,.95,.36),neck:D(0,.95,.36),head:D(0,1,.34)}});
const FLOSS_UP=P({hands:()=>({L:along("thighR",.72).add(V(.06,.05,.05)),R:along("thighR",.72).add(V(-.08,.05,.03))}),dir:{
  thighR:D(-.04,-1,.42),shinR:D(0,-1,.3),footR:D(0,.5,1),
  thighL:D(.04,-1,.15),shinL:D(0,-1,-.2),footL:D(.05,-.1,1),
  spine:D(0,.7,.72),chest:D(0,.62,.78),neck:D(0,.45,.89),head:D(0,.22,.97)}});
const FLOSS_DOWN=P({hands:FLOSS_UP.hands,dir:{...FLOSS_UP.dir,footR:D(0,-.25,1),neck:D(0,.75,.66),head:D(0,.9,.45)}});
const PIG_LEGS={thighR:D(-.25,-.15,1),shinR:D(1,0,-.35),footR:D(.75,0,-.55),thighL:D(.8,-.15,.35),shinL:D(-.45,.38,-.8),footL:D(.05,-.95,-.3)};
const PIG_UP=P({pelvisSide:V(1,0,-.05),side:{spine:V(.6,0,-.8),chest:V(.6,0,-.8)},hands:()=>clasp(.53,.12),dir:{...PIG_LEGS,spine:D(0,1,0),chest:D(0,1,0),head:D(0,1,0)}});
const PIG_DOWN=P({pelvisPos:V(-.01,0,0),pelvisSide:V(1,-.06,-.05),side:{spine:V(.42,.71,-.57),chest:V(.22,.93,-.3)},hands:()=>clasp(.53,.12),dir:{...PIG_LEGS,spine:D(-.42,.71,.57),chest:D(-.56,.37,.74),head:D(-.56,.37,.74)}});
const QUAD_BASE={pelvisDir:D(0,0,-1),hands:()=>({L:wp("uarmL").setY(.03).add(V(0,0,.04)),R:wp("uarmR").setY(.03).add(V(0,0,.04))}),dir:{
  thighL:D(0,-1,0),shinL:D(0,0,-1),footL:D(0,-.25,-1),
  spine:D(0,.04,1),chest:D(0,0,1),neck:D(0,-.15,1),head:D(0,-.45,1)}};
const quad=(th,sh,ft)=>P({...QUAD_BASE,dir:{...QUAD_BASE.dir,thighR:th,shinR:sh,footR:ft}});
const HQ=quad(D(0,-1,0),D(0,0,-1),D(0,-.25,-1));
const HS=quad(D(-1,.05,-.12),D(0,.05,-1),D(0,-.2,-1));
const HB=quad(D(-.1,.15,-1),D(0,1,-.12),D(0,.1,-1));
function hipSeq(x){
  const s=[];
  for(let i=1;i<=x;i++)s.push([`Uhrzeigersinn ${i}/${x}`,1.1,HQ,HS],[`Uhrzeigersinn ${i}/${x}`,1.2,HS,HB],[`Uhrzeigersinn ${i}/${x}`,1.1,HB,HQ]);
  s.push(["Pause",.6,HQ,HQ]);
  for(let i=1;i<=x;i++)s.push([`Gegen Uhrzeigersinn ${i}/${x}`,1.1,HQ,HB],[`Gegen Uhrzeigersinn ${i}/${x}`,1.2,HB,HS],[`Gegen Uhrzeigersinn ${i}/${x}`,1.1,HS,HQ]);
  s.push(["Pause",.6,HQ,HQ]);
  for(let i=1;i<=x;i++)s.push([`Zur Seite ${i}/${x}`,1.1,HQ,HS],[`Zur Seite ${i}/${x}`,.3,HS,HS],[`Zur Seite ${i}/${x}`,1.1,HS,HQ]);
  s.push(["Pause",.6,HQ,HQ]);
  s.push(["Bein zur Seite",1.1,HQ,HS]);
  for(let i=1;i<=x;i++)s.push([`Seite → hinten ${i}/${x}`,1.2,HS,HB],[`Seite → hinten ${i}/${x}`,1.2,HB,HS]);
  s.push(["absetzen",1.1,HS,HQ],["Pause",.8,HQ,HQ]);
  return s;
}
const ELBOW_TORSO={pole:{get R(){return _elbPole.clone()}},pelvisSide:V(1,.12,0),side:{spine:V(.45,.88,0),chest:V(.42,.9,0)},dir:{spine:D(-.8,.55,.08),chest:D(-.85,.45,.12),neck:D(-.7,.7,.15),head:D(-.55,.8,.2)}};
let _elbPole=V(0,-1,0);
const elbowHands=(left)=>()=>{const S=wp("uarmR"),dy=Math.min(.295,Math.max(0,S.y-.05)),r=Math.sqrt(.3*.3-dy*dy);
  const E=S.clone().add(V(-.3*r,0,.95*r)).setY(.05);_elbPole=E.clone().sub(S);
  return {R:E.clone().add(V(-.03,-.005,.268)),L:left?left():along("thighL",.25).add(V(0,.1,.06))}};
const FRONT90={thighR:D(-.25,-.15,1),shinR:D(1,0,-.1),footR:D(.95,-.05,-.3)};
const B90=P({...ELBOW_TORSO,skip:["shinL","footL","toeL"],hands:elbowHands(),dir:{...ELBOW_TORSO.dir,...FRONT90,thighL:D(1,-.15,.05),shinL:D(0,.15,-1),footL:D(0,-.1,-1)}});
const HEELS90=P({...ELBOW_TORSO,skip:["shinL","footL","toeL"],hands:elbowHands(),dir:{...ELBOW_TORSO.dir,...FRONT90,thighL:D(.25,.35,.15),shinL:D(-.1,-.4,.15),footL:D(.3,-.2,.9)}});
const OUT_BASE={...ELBOW_TORSO,skip:["shinL"],hands:elbowHands(),dir:{...ELBOW_TORSO.dir,...FRONT90,thighL:D(1,0,.05),shinL:D(0,.12,-1),footL:D(0,-.1,-1)}};
const OUT1=P({...OUT_BASE,dir:{...OUT_BASE.dir,shinL:D(0,.6,-.8),footL:D(0,.35,-1)}});
const OUT2=P({...OUT_BASE,dir:{...OUT_BASE.dir,thighL:D(1,.22,.05),shinL:D(0,.55,-.85),footL:D(0,.3,-1)}});
const OUT3=P({...OUT_BASE,dir:{...OUT_BASE.dir,thighL:D(.98,.15,-.08),shinL:D(.98,.15,-.08),footL:D(.25,-.95,.1)}});
const PHOLD=P({hands:()=>clasp(.2,.15),dir:{thighR:D(-.25,-.3,.92),shinR:D(.85,.02,-.55),footR:D(.6,0,-.8),
  thighL:D(.1,-.18,-1),shinL:D(.03,-.15,-1),footL:D(0,-.25,-1),spine:D(0,.85,.5),chest:D(0,.75,.65),neck:D(0,.75,.65),head:D(0,.75,.65)}});
const PHOLD2=P({hands:PHOLD.hands,dir:{...PHOLD.dir,spine:D(0,.83,.54),chest:D(0,.72,.69),neck:D(0,.72,.69),head:D(0,.72,.69)}});
const IN_BASE={...ELBOW_TORSO,skip:["shinR"],hands:elbowHands(),dir:{...ELBOW_TORSO.dir,thighR:D(-.25,0,1),shinR:D(1,0,-.1),footR:D(.95,-.05,-.3),thighL:D(1,-.15,.05),shinL:D(0,.1,-1),footL:D(0,-.1,-1)}};
const IN1=P({...IN_BASE,dir:{...IN_BASE.dir,shinR:D(.85,.45,-.1),footR:D(.8,.4,-.3)}});
const IN2=P({...IN_BASE,dir:{...IN_BASE.dir,thighR:D(-.25,.22,1),shinR:D(.95,.245,-.1),footR:D(.85,.25,-.3)}});
const IN3=P({pelvisDir:D(1,0,0),pelvisSide:V(0,1,.05),side:{spine:V(0,1,0),chest:V(0,1,0)},
  pole:{R:V(0,.5,1)},hands:()=>({R:wp("head").add(V(.02,-.1,.06)),L:wp("uarmL").setY(.03).add(V(0,0,.3))}),
  dir:{spine:D(-1,.12,0),chest:D(-1,.1,.05),neck:D(-.95,.25,.05),head:D(-.92,.35,.1),
  thighR:D(.95,.15,.1),shinR:D(.95,.15,.1),footR:D(.3,-.1,.95),
  thighL:D(.3,.55,.78),shinL:D(0,-1,.05),footL:D(.1,-.2,1)}});
const SEAT_BASE={hands:()=>{const p=wp("pelvis");return {L:p.clone().add(V(.24,-.02,.04)),R:p.clone().add(V(-.24,-.02,.04))}},dir:{
  thighL:D(.06,0,1),shinL:D(0,-1,.02),footL:D(.05,-.1,1),spine:D(0,1,-.2),chest:D(0,1,-.14),head:D(0,1,0)}};
const SEAT=P({...SEAT_BASE,dir:{...SEAT_BASE.dir,thighR:D(-.06,0,1),shinR:D(0,-1,.02),footR:D(-.05,-.1,1)}});
const KICK=P({...SEAT_BASE,dir:{...SEAT_BASE.dir,thighR:D(-.04,0,1),shinR:D(-.04,0,1),footR:D(-.02,.45,.9)}});
const KICK2=P({...SEAT_BASE,dir:{...SEAT_BASE.dir,thighR:D(-.04,.02,1),shinR:D(-.04,.02,1),footR:D(-.02,.5,.87)}});
const seatChair=()=>{const p=wp("pelvis");return {x:p.x,z:p.z-.04,ry:0}};
const STR_BASE={skip:["footL","toeL","shinL"],hands:()=>({L:along("thighL",.78).add(V(.06,.05,.02)),R:along("thighL",.78).add(V(-.08,.05,0))}),dir:{
  thighL:D(.05,.22,1),shinL:D(0,-1,-.15),footL:D(0,-.1,1),
  thighR:D(-.05,-.8,-.6),shinR:D(-.05,-.8,-.6),footR:D(0,-.5,-.85),
  spine:D(0,1,.05),chest:D(0,1,.03),head:D(0,1,.05)}};
const STR=P({...STR_BASE});
const STR2=P({...STR_BASE,dir:{...STR_BASE.dir,spine:D(0,1,0),chest:D(0,1,-.03),neck:D(0,1,-.02),head:D(0,1,0)}});
const stretchChair=()=>{const a=wp("footL");return {x:a.x,z:a.z+.06,ry:Math.PI}};
/* Hamstring-Curl im Stand */
const STAND_L={thighL:D(.03,-1,.02),shinL:D(0,-1,-.02),footL:D(.05,-.12,1),spine:D(0,1,0),chest:D(0,1,.02),head:D(0,1,.05)};
const wallZ=()=>wp("pelvis").z+.42;
const curlHands=()=>{const p=wp("neck");return {L:V(p.x+.2,p.y-.12,wallZ()-.04),R:wp("pelvis").add(V(-.2,.02,0))}};
const HC0=P({skip:["shinR","footR","toeR"],hands:curlHands,dir:{...STAND_L,thighR:D(-.03,-1,-.12),shinR:D(0,-.8,-.6),footR:D(0,-.6,-.8)}});
const HC1=P({skip:["shinR","footR","toeR"],hands:curlHands,dir:{...STAND_L,thighR:D(-.03,-1,-.1),shinR:D(0,.05,-1),footR:D(0,-.35,-1)}});
/* Waden-/Hamstring-Dehnung an der Wand */
const WS_BASE={hands:()=>({L:along("thighR",.62).add(V(.07,.04,.03)),R:along("thighR",.62).add(V(-.07,.04,.03))}),dir:{
  thighR:D(-.03,-1,.5),shinR:D(-.03,-1,.5),footR:D(0,.8,.6),
  thighL:D(.05,-1,-.15),shinL:D(.05,-1,-.15),footL:D(.05,-.15,1)}};
const WS0=P({...WS_BASE,dir:{...WS_BASE.dir,spine:D(0,1,.08),chest:D(0,1,.08),head:D(0,1,.1)}});
const WS1=P({...WS_BASE,dir:{...WS_BASE.dir,spine:D(0,.85,.52),chest:D(0,.8,.6),neck:D(0,.78,.62),head:D(0,.78,.62)}});
const wallAtToe=()=>({z:along("footR",1).z+.04});

/* Drop-Set-Ablauf: Stufe 1 → 2 → 3 → absetzen (Indizes 1/3/5 = Halten der Stufen) */
function dropSeq(st,tr,last,lab){return [[lab[0],1.2,st[0],st[0]],[lab[0],2.2,st[0],st[0]],[lab[1],tr[0],st[0],st[1]],[lab[1],2.2,st[1],st[1]],[lab[2],tr[1],st[1],st[2]],[lab[2],2.4,st[2],st[2]],["absetzen",last,st[2],st[0]]]}

/* ---- Reverse Squat am Kabelzug ---- */
const tower=group("tower");const twCol=piece(tower,BOX,OUT_GEAR),twPul=piece(tower,SPH,OUT_GEAR),twCable=piece(tower,BOX,OUT_LOAD),twStack=piece(tower,BOX,OUT_LOAD),twPost=piece(tower,BOX,OUT_GEAR);
const TOWER_Z=1.55;
function towerUpdate(o){
  twCol.position.set(0,1,TOWER_Z+.12);twCol.scale.set(.3,2,.22);
  const pul=V(0,.22,TOWER_Z);twPul.position.copy(pul);twPul.scale.set(.05,.05,.05);
  const n=Math.max(1,Math.round(o.kg/5));twStack.position.set(0,.06+n*.012,TOWER_Z+.12);twStack.scale.set(.24,.12+n*.024,.24);
  const f=mid(along("footL",.35),along("footR",.35));boxBetween(twCable,pul,f,.012,.012);
  const top=along("head",1);twPost.position.set(0,.45,top.z-.22);twPost.scale.set(.06,.9,.06);
}
function reverseSquat(o){
  const hands=()=>{const top=along("head",1);return {L:V(.13,.35,top.z-.2),R:V(-.13,.35,top.z-.2)}};
  const base={anchor:{b:"pelvis",x:0,z:0},gx:[["chest",.85,.09],["head",.5,.09]],hands,pole:{L:()=>V(1,.4,0),R:()=>V(-1,.4,0)}};
  const LONG=ext(base,{pelvisDir:D(0,0,1),dir:{spine:D(0,-.02,-1),chest:D(0,0,-1),neck:D(0,.06,-1),head:D(0,.1,-1),
    thighL:D(.07,.14,1),thighR:D(-.07,.14,1),shinL:D(.06,.14,1),shinR:D(-.06,.14,1),footL:D(.05,1,.25),footR:D(-.05,1,.25)}});
  const PULL=ext(base,{pelvisDir:D(0,.35,1),dir:{spine:D(0,-.1,-1),chest:D(0,-.02,-1),neck:D(0,.1,-1),head:D(0,.16,-1),
    thighL:D(.1,.72,-.68),thighR:D(-.1,.72,-.68),shinL:D(.05,.02,1),shinR:D(-.05,.02,1),footL:D(.05,.95,.3),footR:D(-.05,.95,.3)}});
  return [["Knie zur Brust ziehen",1.3,LONG,PULL],["oben",.4,PULL,PULL],["langsam strecken",1.8,PULL,LONG],["lang",.3,LONG,LONG]];
}
const bars=group("bars");const barsP=[0,1,2,3,4,5].map(()=>piece(bars,BOX,OUT_GEAR));
const lsitH=o=>o.support==="stuetzen"?.24:.035;
function barsUpdate(o){const y=lsitH(o)-.03,p=wp("pelvis");
  [[.25,0],[-.25,1]].forEach(([x,i])=>{const b=barsP[i*3];b.position.set(x,y,p.z+.06);b.scale.set(.05,.04,.42);
    barsP[i*3+1].position.set(x,y/2,p.z-.1);barsP[i*3+1].scale.set(.04,y,.04);barsP[i*3+2].position.set(x,y/2,p.z+.22);barsP[i*3+2].scale.set(.04,y,.04)})}
function lsit(o){
  const hy=lsitH(o),single=o.legs==="single";
  const legs=single?{thighL:D(.06,.04,1),shinL:D(.06,.04,1),footL:D(.03,-.2,1),thighR:D(-.06,.75,.66),shinR:D(0,-.85,.5),footR:D(-.03,-.3,1)}
                   :{thighL:D(.06,.04,1),thighR:D(-.06,.04,1),shinL:D(.06,.04,1),shinR:D(-.06,.04,1),footL:D(.03,-.2,1),footR:D(-.03,-.2,1)};
  const base={abs:true,hands:()=>({L:V(.25,hy+.02,.06),R:V(-.25,hy+.02,.06)}),pole:{L:()=>V(0,0,-1),R:()=>V(0,0,-1)},pelvisDir:D(0,-1,-.12),dir:{...legs}};
  const A=ext(base,{pelvisPos:V(0,hy+.09,0),dir:{spine:D(0,1,.08),chest:D(0,1,.12),neck:D(0,1,.15),head:D(0,1,.18)}});
  const B=ext(base,{pelvisPos:V(0,hy+.095,-.005),dir:{spine:D(0,1,.1),chest:D(0,1,.14),neck:D(0,1,.17),head:D(0,1,.2)}});
  return hold(A,B,"Beine gestreckt halten");
}
function slRaise(o){
  const hands=()=>({L:along("thighL",.62).add(V(.15,0,0)).setY(.03),R:along("thighR",.62).add(V(-.15,0,0)).setY(.03)});
  const base={hands,pole:{L:()=>V(.3,0,-1),R:()=>V(-.3,0,-1)},pelvisDir:D(0,-1,-.15),
    dir:{spine:D(0,1,.22),chest:D(0,1,.25),neck:D(0,1,.3),head:D(0,1,.32),thighL:D(.08,0,1),thighR:D(-.08,0,1),shinL:D(.08,0,1),shinR:D(-.08,0,1),footL:D(.05,.7,.7),footR:D(-.05,.7,.7)}};
  const REST=ext(base,{}),UL=ext(base,{dir:{thighL:D(.08,.4,1),shinL:D(.08,.4,1),footL:D(.05,.4,.9)}}),UR=ext(base,{dir:{thighR:D(-.08,.4,1),shinR:D(-.08,.4,1),footR:D(-.05,.4,.9)}});
  return [["linkes Bein hoch",.8,REST,UL],["kurz halten",.5,UL,UL],["ablegen",.8,UL,REST],["rechtes Bein hoch",.8,REST,UR],["kurz halten",.5,UR,UR],["ablegen",.8,UR,REST]];
}
const wall2=group("wall2");const wall2P=piece(wall2,BOX,OUT_GEAR);
function couch(o){
  const base={hands:()=>({L:along("thighL",.9).add(V(.05,.07,0)),R:along("thighL",.9).add(V(-.08,.07,0))}),skip:["footR","toeR"],
    dir:{thighL:D(.06,-.08,1),shinL:D(0,-1,-.06),footL:D(.05,-.1,1),thighR:D(-.03,-1,-.5),shinR:D(-.01,1,.02),footR:D(0,.75,-.66)}};
  const A=ext(base,{dir:{spine:D(0,1,.02),chest:D(0,1,0),head:D(0,1,.03)}}),B=ext(base,{dir:{spine:D(0,1,-.03),chest:D(0,1,-.05),neck:D(0,1,-.03),head:D(0,1,0)}});
  return hold(A,B,"Gesäß fest, Zehen in die Wand");
}
function couchWall(){const k=wp("shinR");wall2P.position.set(0,.6,k.z-.085);wall2P.scale.set(1.2,1.2,.05);towelM.rotation.set(Math.PI/2,0,0);towelM.position.set(k.x,.045,k.z+.02)}
function butterfly(o){
  const hands=()=>{const c=mid(along("footL",.5),along("footR",.5)).add(V(0,.07,0));return {L:c.clone().add(V(.04,0,0)),R:c.clone().add(V(-.04,0,0))}};
  const base={hands,dir:{thighL:D(.75,.1,.65),thighR:D(-.75,.1,.65),shinL:D(-.85,-.1,.5),shinR:D(.85,-.1,.5),footL:D(-.35,-.3,.9),footR:D(.35,-.3,.9)}};
  const A=ext(base,{dir:{spine:D(0,1,.25),chest:D(0,1,.3),neck:D(0,1,.35),head:D(0,1,.38)}}),B=ext(base,{dir:{spine:D(0,1,.32),chest:D(0,1,.4),neck:D(0,1,.45),head:D(0,1,.45)}});
  return hold(A,B,"Knie sinken lassen");
}

/* =================== BAUCH =================== */
const latSide=d=>V(0,-d.z,d.y).normalize();
function qlExt(o){
  const hands=o.kg>0?plateHands:headHands,pole=o.kg>0?null:headPole;
  const legs={thighL:D(0,-1,-1),thighR:D(0,-1,-1),shinL:D(0,-1,-1),shinR:D(0,-1,-1),footL:D(-1,-.35,-.35),footR:D(-1,-.35,-.35)};
  const lsides={thighL:FRONT,thighR:FRONT,shinL:FRONT,shinR:FRONT};
  const tor=(sp,chs,hdd)=>({pelvisDir:D(0,-1,-1),pelvisSide:FRONT.clone(),side:{...lsides,spine:latSide(sp),chest:latSide(chs),neck:latSide(hdd),head:latSide(hdd)},dir:{...legs,spine:sp,chest:chs,neck:hdd,head:hdd}});
  const base={anchor:{b:"footL",y:.42,z:-.55},hands,pole};
  const TOP=P({...base,...tor(D(0,1,1),D(0,1,1),D(0,1,1.05))});
  const TOP2=P({...base,...tor(D(0,1,1.04),D(0,1,1.06),D(0,1,1.1))});
  const BOT=P({...base,...tor(D(0,-.1,1),D(0,-.55,1),D(0,-.65,1))});
  if(o.mode==="hold")return hold(TOP,TOP2,"seitlich gerade halten");
  return [["seitlich runter",1.6,TOP,BOT],["unten",.35,BOT,BOT],["seitlich hoch",1.3,BOT,TOP],["oben",.5,TOP,TOP]];
}
function sideBend(o){
  const W={thighL:D(.08,-1,0),thighR:D(-.08,-1,0)};
  const base={anchor:{b:"footL",x:.13,z:0},hands:()=>({L:wp("pelvis").add(V(.21,.05,.02)),R:wp("uarmR").add(V(-.02,-.56,.02))}),pole:{L:()=>V(1,0,-.4),R:()=>V(-.3,0,-1)}};
  const N=ext(base,{dir:{...STAND,...W}});
  const RB=ext(base,{dir:{...STAND,...W,spine:D(-.28,1,0),chest:D(-.4,1,0),neck:D(-.42,1,0),head:D(-.4,1,0)}});
  const LB=ext(base,{dir:{...STAND,...W,spine:D(.2,1,0),chest:D(.3,1,0),neck:D(.3,1,0),head:D(.28,1,0)}});
  return [["zur Kettlebell runter",1.5,N,RB],["unten",.3,RB,RB],["hoch und zur anderen Seite",1.8,RB,LB],["oben",.4,LB,LB],["zurück zur Mitte",1,LB,N]];
}
function sidePlank(o){
  const knees=o.legs==="knie",a=knees?.33:.22;
  const up=D(0,a,1),dn=up.clone().negate(),sd=latSide(up);
  const sides={pelvisSide:sd.clone(),side:{spine:sd,chest:sd,neck:sd,head:sd,thighL:sd,thighR:sd,shinL:sd,shinR:sd}};
  const legs=knees?{thighL:dn,thighR:dn,shinL:D(.95,-.05,-.3),shinR:D(.95,-.05,-.3),footL:D(.3,0,-1),footR:D(.3,0,-1)}
                  :{thighL:dn,thighR:dn,shinL:dn,shinR:dn,footL:D(-1,-.15,-.2),footR:D(-1,-.15,-.2)};
  const hands=()=>{const s=wp("uarmL");return {L:V(s.x-.27,.04,s.z+.02),R:wp("pelvis").add(sd.clone().multiplyScalar(-.17)).add(V(-.06,0,0))}};
  const base={...sides,pelvisDir:dn,hands,pole:{L:()=>V(0,-1,0),R:()=>V(.3,.6,-.4)},anchor:{b:"pelvis",x:0,z:0},skip:knees?["footL","footR","toeL","toeR"]:[],gx:[]};
  const A=P({...base,dir:{...legs,spine:up,chest:up,neck:up,head:D(0,a+.05,1)}});
  const B=P({...base,dir:{...legs,spine:D(0,a+.02,1),chest:up,neck:up,head:D(0,a+.07,1)}});
  return hold(A,B,"Hüfte hoch, Körper eine Linie");
}
const pullbar=group("pullbar");const pbBar=piece(pullbar,CYL,OUT_GEAR),pbP1=piece(pullbar,BOX,OUT_GEAR),pbP2=piece(pullbar,BOX,OUT_GEAR),pbS1=piece(pullbar,BOX,OUT_LOAD),pbS2=piece(pullbar,BOX,OUT_LOAD);
const BAR_Y=2.25;
function pullbarUpdate(o){
  pbBar.position.set(0,BAR_Y,0);pbBar.rotation.set(0,0,Math.PI/2);pbBar.scale.set(.016,1.2,.016);
  for(const [p,x] of [[pbP1,.6],[pbP2,-.6]]){p.position.set(x,BAR_Y/2,0);p.scale.set(.05,BAR_Y,.05)}
  const st=o.grip==="schlaufen";pbS1.visible=pbS2.visible=st;
  if(st){boxBetween(pbS1,V(.19,BAR_Y,0),along("uarmL",1),.03,.02);boxBetween(pbS2,V(-.19,BAR_Y,0),along("uarmR",1),.03,.02)}
}
function hangingRaise(o){
  const st=o.grip==="schlaufen",py=st?BAR_Y-1.09:BAR_Y-1.1;
  const hands=st?()=>({L:wp("uarmL").add(V(0,.3,.27)),R:wp("uarmR").add(V(0,.3,.27))}):()=>({L:V(.24,BAR_Y,0),R:V(-.24,BAR_Y,0)});
  const pole=st?{L:()=>V(0,.67,-.74),R:()=>V(0,.67,-.74)}:{L:()=>V(.3,0,-1),R:()=>V(-.3,0,-1)};
  const base={abs:true,pelvisPos:V(0,py,-.02),hands,pole,dir:{spine:D(0,1,-.04),chest:D(0,1,-.02),neck:D(0,1,0),head:D(0,1,.03)}};
  const HANG=ext(base,{dir:{thighL:D(.04,-1,.05),thighR:D(-.04,-1,.05),shinL:D(0,-1,.02),shinR:D(0,-1,.02),footL:D(.05,-.6,.8),footR:D(-.05,-.6,.8)}});
  const TOP=o.legs==="bent"
    ?ext(base,{pelvisDir:D(0,-.6,1),dir:{spine:D(0,1,.1),thighL:D(.06,.35,1),thighR:D(-.06,.35,1),shinL:D(0,-1,.05),shinR:D(0,-1,.05),footL:D(.05,-.3,1),footR:D(-.05,-.3,1)}})
    :ext(base,{pelvisDir:D(0,-.3,1),dir:{spine:D(0,1,.12),thighL:D(.05,.25,1),thighR:D(-.05,.25,1),shinL:D(.05,.25,1),shinR:D(-.05,.25,1),footL:D(.03,.4,.9),footR:D(-.03,.4,.9)}});
  return [["Beine hoch",1.1,HANG,TOP],["oben",.4,TOP,TOP],["2 s ablassen",2,TOP,HANG],["hängen",.4,HANG,HANG]];
}
const wheel=group("wheel");const whD=piece(wheel,CYL,OUT_LOAD),whH=piece(wheel,CYL,OUT_LOAD);
function wheelUpdate(){const m=mid(along("handL",.5),along("handR",.5));whD.position.set(0,.09,m.z);whD.rotation.set(0,0,Math.PI/2);whD.scale.set(.09,.06,.09);whH.position.set(0,.09,m.z);whH.rotation.set(0,0,Math.PI/2);whH.scale.set(.016,.34,.016)}
function abWheel(o){
  const K={thighL:D(.04,-1,0),thighR:D(-.04,-1,0),shinL:D(0,0,-1),shinR:D(0,0,-1),footL:D(0,-.45,-.9),footR:D(0,-.45,-.9)};
  const wh=z=>()=>({L:V(.11,.11,z),R:V(-.11,.11,z)});
  const base={anchor:{b:"shinL",x:.1,z:0},pole:{L:()=>V(.3,0,-1),R:()=>V(-.3,0,-1)},skip:[]};
  const IN=ext(base,{hands:wh(.5),pelvisDir:D(0,-1,-.2),dir:{...K,spine:D(0,.6,1),chest:D(0,.45,1),neck:D(0,.25,1),head:D(0,.1,1)}});
  const OUT=ext(base,{hands:wh(1.18),pelvisDir:D(0,-.35,-1),dir:{...K,thighL:D(.04,-.42,-1),thighR:D(-.04,-.42,-1),spine:D(0,.14,1),chest:D(0,.1,1),neck:D(0,.12,1),head:D(0,.15,1)}});
  IN.dir.thighL=D(.04,-1,.05);IN.dir.thighR=D(-.04,-1,.05);
  return [["langsam rausrollen",2,IN,OUT],["vorne",.4,OUT,OUT],["zurückziehen",1.4,OUT,IN],["Start",.4,IN,IN]];
}

/* ---------- Gewichts-Stufen ---------- */
const STEPS={
  plate:[0,1.25,2.5,5,7.5,10,12.5,15,20,25,30],
  kb:[0,4,6,8,10,12,14,16,20,24,28,32],
  kb2:[0,4,6,8,10,12,14,16,20,24,28,32],
  cable:Array.from({length:40},(_,i)=>(i+1)*2.5),
  db:[0,2,4,6,8,10,12,14,16,18,20,22.5,25,27.5,30],
  bar:[20,25,30,35,40,45,50,55,60,65,70,75,80,90,100]
};
const kgText=(w,kg)=>{const n=String(kg).replace(".",",");if(w==="kb2")return kg?"2 × "+n+" kg":"ohne";if(w==="cable")return n+" kg";if(w==="plate")return kg?n+" kg":"ohne";if(w==="kb")return kg?n+" kg":"ohne";if(w==="db")return kg?"2 × "+n+" kg":"ohne";return n+" kg"};

/* ---------- Katalog ---------- */
const G1="Kern · Low Back Ability",G2="Mit Gewicht",G3="Am Boden",G4="Mobilität",K1="Kern · Knees Over Toes",K2="Basis",K3="Aufwärmen",H1="90/90 & Morgenroutine",H2="Hüftbeuger-Kraft",H3="Dehnen & Mobilität",B1="Seitlich (Flanke)",B2="Vorne",M1="Morgenroutine";
const MR_OUT=["Stufe 1 · Fuß hoch","Stufe 2 · Fuß + Knie hoch","Stufe 3 · Bein gestreckt hoch"];
const MR_IN=["Stufe 1 · vorderen Fuß heben","Stufe 2 · Fuß + Knie heben","Stufe 3 · hinlegen, Bein gestreckt heben"];
const EX=[
 {id:"backext",group:G1,name:"Back Extension 45°",de:"Rückenstrecker an der Hyperextension-Bank",gear:["45°-Bank"],src:"LBA Stufe 1–5",weight:"plate",uni:o=>o.legs==="single",
  def:{mode:"hold",legs:"both",range:"voll",secs:120,reps:10,kg:0},
  opts:o=>[["mode","Ausführung",[["hold","Halten"],["reps","Wiederholungen"]]],["legs","Beine",[["both","Beidbeinig"],["single","Einbeinig"]]],
    ...(o.mode==="reps"?[["range","Bewegung",[["halb","Halbe Wdh."],["voll","Volle Wdh."]]]]:[])],
  cam:{y:.75,d:3.9,yaw:.85,p:.15},build:backExt,props:o=>({bench:benchUpdate}),
  tips:o=>[o.mode==="hold"?"Körper in einer Linie halten – Kopf, Rücken, Beine":"Langsam runter, oben nicht ins Hohlkreuz schwingen",
    o.mode==="reps"&&o.range==="voll"?"Volle Wdh.: unten die Wirbelsäule rund werden lassen, hoch Wirbel für Wirbel strecken":"Unter Last nicht runden, solange der flache Rücken nicht stark ist",
    o.legs==="single"?"Einbeinig: freies Bein locker anwinkeln, Becken bleibt gerade – nicht verdrehen":"Ziel ist ein Pump im unteren Rücken, kein Ziehen",
    o.kg>0?"Scheibe eng an die Brust drücken":"Hände vor der Brust verschränkt",
    o.legs==="single"?"Ziel Stufe 2: 1 min pro Bein":"Ziel Stufe 1: 2 min halten, Ziel Stufe 4: 30 volle Wdh."]},
 {id:"seatedgm",group:G1,name:"Seated Good Morning",de:"Sitzend vorbeugen und halten",gear:["Bank oder Stuhl"],src:"LBA",weight:"plate",
  def:{mode:"hold",secs:30,kg:0},opts:o=>[],
  cam:{y:.6,d:3.4,yaw:1.25,p:.15},build:seatedGM,props:o=>({flat:flatSeatUpdate}),
  tips:o=>["Aus der Hüfte nach vorne kippen, Rücken flach","Brust lang, Blick schräg nach unten","Hände vor der Brust verschränkt","Eine Wand im Rücken hilft bei der Orientierung"]},
 {id:"bridge",group:G1,name:"Beckenheben",de:"Hip Extension in Rückenlage",gear:["Matte"],src:"ATG / LBA",weight:"plate",uni:o=>o.legs==="single",
  def:{mode:"reps",legs:"both",secs:30,reps:30,kg:0},
  opts:o=>[["mode","Ausführung",[["hold","Halten"],["reps","Wiederholungen"]]],["legs","Beine",[["both","Beidbeinig"],["single","Einbeinig"]]]],
  cam:{y:.3,d:3.4,yaw:1.35,p:.22},build:bridge,
  tips:o=>["Gesäß bewusst anspannen, nicht den unteren Rücken überstrecken","Oben: Schulter, Hüfte und Knie in einer Linie","Fersen in den Boden drücken",o.legs==="single"?"Einbeinig: Becken bleibt waagrecht":"Steigerung: beidbeinig → ein Bein angehoben → einbeinig"]},
 {id:"slrdl",group:G2,name:"Einbeiniges Kreuzheben",de:"mit Kettlebell",gear:["Kettlebell"],src:"",weight:"kb",uni:()=>true,
  def:{mode:"reps",reps:8,kg:8},opts:o=>[],
  cam:{y:.7,d:4.2,yaw:1.3,p:.12},build:slRDL,props:o=>({kb:kbOne}),
  tips:o=>["Kettlebell in der Hand gegenüber vom Standbein","Hüfte nach hinten schieben, Rücken bleibt flach","Hinteres Bein bleibt in Linie mit dem Oberkörper","Becken nicht aufdrehen – beide Hüftknochen zeigen nach unten","Standbein-Knie leicht gebeugt"]},
 {id:"rdl",group:G2,name:"Rumänisches Kreuzheben",de:"mit Kurzhanteln",gear:["Kurzhanteln"],src:"",weight:"db",
  def:{mode:"reps",reps:10,kg:10},opts:o=>[],
  cam:{y:.7,d:4.2,yaw:1.3,p:.12},build:rdl,props:o=>({dbs:dbUpdate}),
  tips:o=>["Hanteln nah an den Beinen führen","Hüfte nach hinten, Knie nur leicht gebeugt","Runter bis Mitte Schienbein oder bis der Rücken rund werden will","Oben Gesäß fest, nicht nach hinten lehnen"]},
 {id:"goodmorning",group:G2,name:"Good Morning",de:"mit Langhantel",gear:["Langhantel","Rack"],src:"",weight:"bar",
  def:{mode:"reps",reps:10,kg:20},opts:o=>[],
  cam:{y:.85,d:4.4,yaw:1.25,p:.12},build:goodMorning,props:o=>({bar:barUpdate}),
  tips:o=>["Stange auf dem oberen Rücken, nicht im Nacken","Hüfte nach hinten, bis der Oberkörper fast waagrecht ist","Rücken flach, Knie leicht gebeugt","Leicht starten – die leere Stange (20 kg) reicht lange"]},
 {id:"swing",group:G2,name:"Kettlebell Swing",de:"aus der Hüfte",gear:["Kettlebell"],src:"",weight:"kb",
  def:{mode:"reps",reps:15,kg:12},opts:o=>[],
  cam:{y:.7,d:4.4,yaw:1.3,p:.12},build:swing,props:o=>({kb:kbBoth}),
  tips:o=>["Bewegung kommt aus der Hüfte, nicht aus den Armen","Unten: Kettlebell weit zwischen die Beine, Rücken flach","Oben: Gesäß fest, Kettlebell auf Brusthöhe","Nicht nach hinten lehnen"]},
 {id:"revhyper",group:G2,name:"Reverse Hyperextension",de:"Bauch auf der Bank, Beine heben",gear:["Hohe Bank oder Gerät"],src:"",weight:"none",
  def:{mode:"reps",reps:12},opts:o=>[],
  cam:{y:.7,d:4,yaw:1.3,p:.12},build:revHyper,props:o=>({flat:rhBenchUpdate}),
  tips:o=>["Hüfte an der Bankkante, Beine hängen locker","Beine aus dem Gesäß heben bis waagrecht","Oben kein Hohlkreuz – Gesäß fest","Langsam ablassen, unten kurz locker"]},
 {id:"jefferson",group:G2,name:"Jefferson Curl",de:"Wirbel für Wirbel abrollen",gear:["Kiste","Kettlebell"],src:"LBA: erst nach über 1 Jahr",warn:"Ab Jahr 2",weight:"kb",
  def:{mode:"reps",reps:5,kg:0},opts:o=>[],
  cam:{y:.75,d:4.4,yaw:1.3,p:.12},build:jefferson,props:o=>(o.kg>0?{box:boxUpdate,kb:kbBoth}:{box:boxUpdate}),
  tips:o=>["Erst wenn Back Extension (2 min halten, 30 Wdh.) sicher sitzt","Kinn zur Brust, dann Wirbel für Wirbel abrollen","Beine gestreckt, sehr leicht und sehr langsam","Hochrollen: Kopf kommt zuletzt"]},
 {id:"superman",group:G3,name:"Superman",de:"Bauchlage, Arme und Beine heben",gear:["Matte"],src:"",weight:"none",
  def:{mode:"hold",secs:20,reps:10},opts:o=>[["mode","Ausführung",[["hold","Halten"],["reps","Wiederholungen"]]]],
  cam:{y:.25,d:3.6,yaw:1.25,p:.2},build:superman,
  tips:o=>["Arme lang nach vorne, Beine lang nach hinten","Nur so hoch heben, wie es ohne Ziehen geht","Blick zum Boden, Nacken lang","Gesäß anspannen"]},
 {id:"birddog",group:G3,name:"Bird Dog",de:"Vierfüßlerstand, Arm und Bein strecken",gear:["Matte"],src:"",weight:"none",perSide:true,
  def:{mode:"reps",secs:10,reps:8},opts:o=>[["mode","Ausführung",[["hold","Halten"],["reps","Wiederholungen"]]]],
  cam:{y:.4,d:3.6,yaw:1.15,p:.25},build:birdDog,
  tips:o=>["Gegengleich: rechter Arm + linkes Bein","Becken bleibt waagrecht – nicht aufdrehen","Lang machen statt hoch heben","Rücken bleibt ruhig wie ein Tisch"]},
 {id:"elephant",group:G4,name:"Elephant Walk",de:"Vorbeuge, Knie im Wechsel beugen",gear:["Optional Erhöhung"],src:"LBA",weight:"none",perSide:true,
  def:{mode:"reps",reps:10},opts:o=>[],
  cam:{y:.5,d:3.8,yaw:1.25,p:.18},build:elephant,
  tips:o=>["Hände auf den Boden oder auf eine Erhöhung","Ein Knie beugen, das andere Bein strecken – im Wechsel","Rücken darf rund sein, Kopf hängt locker","Erhöhung nach und nach niedriger machen"]},
 {id:"catcow",group:G4,name:"Katze-Kuh",de:"Wirbelsäule rund und lang",gear:["Matte"],src:"",weight:"none",
  def:{mode:"reps",reps:8},opts:o=>[],
  cam:{y:.4,d:3.6,yaw:1.2,p:.25},build:catCow,
  tips:o=>["Ausatmen: Rücken rund, Kinn zur Brust","Einatmen: Brust nach vorne, Blick leicht hoch","Bewegung Wirbel für Wirbel","Langsam, ohne Schwung"]},
 {id:"atgsplit",muscle:"knie",group:K1,name:"ATG Split Squat",de:"Knie weit über die Zehen, vorderer Fuß erhöht",gear:["Stepper"],src:"Knees Over Toes",weight:"db",uni:()=>true,steps:[0,15,20,25],
  def:{mode:"hold",secs:60,reps:8,step:25,kg:0},
  opts:o=>[["mode","Ausführung",[["hold","Halten"],["reps","Wiederholungen"]]]],
  cam:{y:.55,d:4,yaw:1.3,p:.14},build:atgSplit,props:o=>Object.assign({stepper:o=>stepAt(.1,.36,H(o))},o.kg>0?{dbs:dbUpdate}:{}),
  tips:o=>["Vorderes Knie weit über die Zehen, bis der Oberschenkel die Wade berührt","Vordere Ferse bleibt am Boden","Hinteres Bein möglichst gestreckt – dehnt den Hüftbeuger","Festhalten ist erlaubt",
    o.step?"Steigerung: Erhöhung Schritt für Schritt niedriger (25 → 20 → 15 cm → ohne)":"Ohne Erhöhung: volle ATG-Tiefe","Später mit Kurzhanteln"]},
 {id:"stepdown",muscle:"knie",group:K1,name:"Step-down nach vorne",de:"Knee-over-Toe vom Stepper",gear:["Stepper"],src:"Knees Over Toes",weight:"kb2",uni:()=>true,steps:[15,20,25],
  def:{mode:"reps",reps:12,step:25,kg:0},opts:o=>[],
  cam:{y:.8,d:4.5,yaw:1.3,p:.14},build:stepDown,props:o=>Object.assign({stepper:o=>stepAt(0,.02,H(o))},o.kg>0?{kbs2:kb2Update}:{}),
  tips:o=>["Standbein-Knie wandert weit über die Zehen","Ferse des Standbeins bleibt unten","2–3 s absenken, vorne nur mit der Ferse antippen, nicht abstellen","Leichter: niedrige Stufe oder festhalten · schwerer: höhere Stufe"]},
 {id:"poliquin",muscle:"knie",group:K1,name:"Poliquin Step-up",de:"Ferse erhöht, Knie ganz strecken",gear:["Stepper","Fersenkeil"],src:"Knees Over Toes",weight:"none",uni:()=>true,steps:[15,20,25],
  def:{mode:"reps",reps:15,step:15},opts:o=>[],
  cam:{y:.85,d:4.4,yaw:1.25,p:.14},build:poliquin,props:o=>({stepper:o=>stepAt(.1,.02,H(o)),wedge:wedgeUpdate}),
  tips:o=>["Ferse auf dem Keil, Fuß auf der Stufe","Knie weit über die Zehen schieben","Oben das Knie voll strecken – Fokus direkt über dem Knie (VMO)","Kleiner Bewegungsweg, volle Kontrolle"]},
 {id:"tibialis",muscle:"knie",group:K2,name:"Tibialis Raise",de:"An der Wand, Zehen hochziehen",gear:["Wand"],src:"Knees Over Toes",weight:"none",
  def:{mode:"reps",reps:20},opts:o=>[],
  cam:{y:.6,d:3.8,yaw:1.25,p:.12},build:tibialis,props:o=>({wall:wallBehind}),
  tips:o=>["Rücken an die Wand, Füße eine Fußlänge davor, Beine gestreckt","Zehen so hoch wie möglich, kurz halten, langsam ab","Füße weiter weg von der Wand = schwerer"]},
 {id:"calf",muscle:"knie",group:K2,name:"Wadenheben",de:"Auf der Stufe, volle Bewegung",gear:["Stepper"],src:"Knees Over Toes",weight:"db",uni:o=>o.legs==="single",
  def:{mode:"reps",legs:"both",reps:20,kg:0},opts:o=>[["legs","Beine",[["both","Beidbeinig"],["single","Einbeinig"]]]],
  cam:{y:.85,d:4.3,yaw:1.3,p:.12},build:calf,props:o=>Object.assign({stepper:()=>stepAt(0,.24,.15)},o.kg>0?{dbs:dbUpdate}:{}),
  tips:o=>["Fußballen auf der Kante, Fersen hängen frei","Unten tief dehnen, oben ganz hoch","Steigerung: einbeinig, dann mit Gewicht"]},
 {id:"balance",muscle:"knie",group:K2,name:"Einbeinstand",de:"Auf einem Bein halten",gear:[],src:"",weight:"none",uni:()=>true,
  def:{mode:"hold",secs:60},opts:o=>[],
  cam:{y:.8,d:4,yaw:.9,p:.12},build:balance,
  tips:o=>["Knie leicht gebeugt, Hüfte waagerecht","Steigerung: Augen zu oder weicher Untergrund"]},
 {id:"walkback",muscle:"knie",group:K3,name:"Rückwärtslaufen",de:"Bergauf auf dem Laufband",gear:["Laufband oder Schlitten"],src:"Knees Over Toes",weight:"none",timeWord:"Dauer",
  def:{mode:"hold",secs:300},opts:o=>[],
  cam:{y:.85,d:4.4,yaw:1.25,p:.14},build:walkBack,props:o=>({treadmill:treadmillUpdate}),
  tips:o=>["Laufband mit Steigung: Blick nach unten zum Bandende, rückwärts bergauf gehen","Kleine Schritte, mit dem Fußballen zuerst aufsetzen","Knie arbeiten über den Zehen – wärmt die Knie schonend auf","Erst mit Festhalten, dann frei · im Studio alternativ den Schlitten rückwärts ziehen"]},
 {id:"drop_out",muscle:"huefte",group:H1,name:"Outer Hip Drop Set",de:"90/90, hinteres Bein · 3 Stufen",gear:["Handtuch"],src:"Morgenroutine",weight:"none",uni:()=>true,drop:true,
  def:{mode:"hold",secs:30,sets:3},opts:o=>[],
  cam:{y:.3,d:3.2,yaw:.15,p:.35},build:o=>dropSeq([OUT1,OUT2,OUT3],[1.2,1.4],1.4,MR_OUT),towelBone:"shinL",props:o=>({towel:towelKnee("shinL")}),
  tips:o=>["Handtuch unter das hintere Knie","Hinteres Knie nicht zu nah am Körper – gerade Linie Knie, Hüfte, Schulter","Stufe 3: Bein gestreckt in Verlängerung des Körpers heben – der Oberkörper bleibt ruhig","Sätze wechseln die Seite: Satz 1 links, Satz 1 rechts, Satz 2 links …"]},
 {id:"drop_in",muscle:"huefte",group:H1,name:"Inner Hip Drop Set",de:"90/90, vorderes Bein · 3 Stufen",gear:["Handtuch"],src:"Morgenroutine",weight:"none",uni:()=>true,drop:true,
  def:{mode:"hold",secs:30,sets:3},opts:o=>[],
  cam:{y:.3,d:3.3,yaw:.35,p:.35},build:o=>dropSeq([IN1,IN2,IN3],[1.2,2],2,MR_IN),towelBone:"shinR",props:o=>({towel:towelKnee("shinR")}),
  tips:o=>["Stufe 1–2: vorderes Knie auf der Erhöhung","Stufe 1: Fuß muss nicht hoch – Hauptsache vom Boden","Stufe 3: hinteres Bein drüber, ganz hinlegen, unteres Bein gestreckt heben – ohne Erhöhung","Sätze wechseln die Seite: Satz 1 links, Satz 1 rechts, Satz 2 links …"]},
 {id:"rot9090",muscle:"huefte",group:H1,name:"90/90-Rotation",de:"auf dem Ellbogen",gear:[],src:"Morgenroutine",weight:"none",uni:()=>true,
  def:{mode:"reps",reps:10,sets:1},opts:o=>[],
  cam:{y:.3,d:3.2,yaw:.15,p:.35},build:o=>[["Fersen zusammen",4.4,B90,HEELS90],["kurz halten",.8,HEELS90,HEELS90],["zurück in den 90/90",4.4,HEELS90,B90],["Knie am Boden",1,B90,B90]],
  tips:o=>["Langsam und kontrolliert rotieren","Unten: Knie berührt den Boden, der Fuß nicht","Gerade Linie hinteres Knie – Hüfte – Schulter","Klicken oder Blockade: Radius kleiner machen"]},
 {id:"pigeon",muscle:"huefte",group:H1,name:"Pigeon",de:"Taube nach Kadoriani",gear:[],src:"Morgenroutine",weight:"none",uni:()=>true,
  def:{mode:"reps",reps:10,sets:1},opts:o=>[],
  cam:{y:.33,d:3.1,yaw:.93,p:.32},build:o=>[["oben",.7,PIG_UP,PIG_UP],["runter",1.9,PIG_UP,PIG_DOWN],["unten",.5,PIG_DOWN,PIG_DOWN],["hoch",1.75,PIG_DOWN,PIG_UP]],
  tips:o=>["Vorderes Knie am Boden, Fuß am hinteren Knie","Hinterer Fuß auf der großen Zehe","Seitlich runter wie ein Brett – vordere Schulter ans Knie","Hoch durch Druck des vorderen Knies in den Boden"]},
 {id:"pigeonhold",muscle:"huefte",group:H1,name:"Pigeon-Halten",de:"Kraft-Halten",gear:[],src:"Morgenroutine",weight:"none",uni:()=>true,
  def:{mode:"hold",secs:30,sets:1},opts:o=>[],
  cam:{y:.35,d:3.2,yaw:-1.25,p:.25},build:o=>hold(PHOLD,PHOLD2),
  tips:o=>["Vorderes Schienbein liegt am Boden, Knie stark gebeugt","Hinteres Knie vom Boden – nur Zehen hinten","Hände an die Brust","Aus der Hüfte nach vorne, Rücken flach","Gewicht auf dem vorderen Gesäß, vorderes Knie in den Boden drücken"]},
 {id:"hipcars",muscle:"huefte",group:H1,name:"Hip CARs",de:"Hüftkreisen im Vierfüßlerstand",gear:[],src:"Morgenroutine",weight:"none",uni:()=>true,repsLabel:"Wdh. pro Teil",oneRun:true,
  def:{mode:"reps",reps:3,sets:1},opts:o=>[],
  cam:{y:.42,d:3.5,yaw:-.8,p:.38},build:o=>hipSeq(o.reps),
  tips:o=>["Knie bleibt die ganze Zeit 90° gebeugt","Kreise: nach jeder Runde zurück in den Vierfüßlerstand","Seite → hinten: Bein bleibt oben und pendelt zwischen Seite und hinten","Oberkörper und Becken bleiben still – nur die Hüfte bewegt sich","Sehr langsam, Radius so groß wie möglich"]},
 {id:"revsquat",muscle:"huefte",group:H2,name:"Reverse Squat",de:"Kabelzug, Schlaufen an den Füßen",gear:["Kabelturm","Fußschlaufe"],src:"Knees Over Toes",weight:"cable",
  def:{mode:"reps",reps:20,kg:20,sets:2},opts:o=>[],
  cam:{y:.45,z:.3,d:5.2,yaw:1.3,p:.25},build:reverseSquat,props:o=>({tower:towerUpdate}),
  tips:o=>["Rückenlage, Füße in der Schlaufe, mit den Händen hinter dem Kopf festhalten","Knie ganz zur Brust ziehen – Oberschenkel bedeckt die Wade","Langsam gegen den Zug strecken, Beine bleiben knapp über dem Boden","KOT-Ziel: 50 % vom Körpergewicht × 20 Wdh."]},
 {id:"lsit",muscle:"huefte",group:H2,name:"L-Sit",de:"Beine gestreckt in der Luft halten",gear:["Stützen (Parallettes) oder Boden"],src:"Knees Over Toes",weight:"none",uni:o=>o.legs==="single",
  def:{mode:"hold",secs:20,sets:2,support:"stuetzen",legs:"both"},opts:o=>[["support","Hände",[["stuetzen","Auf Stützen"],["boden","Auf dem Boden"]]],["legs","Beine",[["both","Beide gestreckt"],["single","Ein Bein gestreckt"]]]],
  cam:{y:.35,d:3.4,yaw:1.2,p:.15},build:lsit,props:o=>(o.support==="stuetzen"?{bars:barsUpdate}:{}),
  tips:o=>["Arme gestreckt, Schultern runter – vom Boden wegdrücken","Knie ganz gestreckt, Zehen lang","Leichter: ein Bein gestreckt, das andere angewinkelt",o.support==="boden"?"Auf dem Boden ist schwerer – die Hüfte muss höher heben":"Stützen geben mehr Platz für die Beine","KOT: 2 × 20 s, einmal pro Woche"]},
 {id:"slraise",muscle:"huefte",group:H2,name:"Einbeinige L-Sit-Raises",de:"Sitzend, gestrecktes Bein heben",gear:["Matte"],src:"Knees Over Toes (L-Sit-Vorstufe)",weight:"none",uni:()=>false,perSide:true,
  def:{mode:"reps",reps:10,sets:2},opts:o=>[],
  cam:{y:.35,d:3.4,yaw:1.1,p:.2},build:slRaise,
  tips:o=>["Aufrecht sitzen, Beine gestreckt, Hände neben den Knien","Ein Bein gestreckt anheben, kurz halten, ablegen – im Wechsel","Knie bleibt ganz gestreckt, Oberschenkel fest","Leichter: Hände weiter hinten · schwerer: Hände weiter vorne"]},
 {id:"kickout",muscle:"huefte",group:H2,name:"Kick-out",de:"Hüftbeuger anspannen im Sitzen",gear:["Stuhl"],src:"Morgenroutine",weight:"none",uni:()=>true,
  def:{mode:"hold",secs:15,sets:1},opts:o=>[],
  cam:{y:.55,d:3.6,yaw:-1.2,p:.2},build:o=>[["Bein strecken",1.2,SEAT,KICK],["halten",2.2,KICK,KICK2],["halten",2.2,KICK2,KICK],["absetzen",1.2,KICK,SEAT],["Pause",.6,SEAT,SEAT]],
  clip:s=>({pre:[s[0]],loop:[s[1],s[2]]}),props:o=>({chair:chairAt(seatChair)}),
  tips:o=>["Aufrecht sitzen – zurücklehnen ist ok","Knie absolut gestreckt, Oberschenkel fest anspannen – darf krampfen","Wie hoch das Bein ist, ist egal","Ischias-Gefühl: Zehen nach unten strecken"]},
 {id:"hfstretch",muscle:"huefte",group:H3,name:"Hüftbeuger-Dehnung",de:"am Stuhl",gear:["Stuhl"],src:"Morgenroutine",weight:"none",uni:()=>true,
  def:{mode:"hold",secs:30,sets:1},opts:o=>[],
  cam:{y:.65,d:3.9,yaw:-1.35,p:.15},build:o=>[["dehnen",2.6,STR,STR2],["tief in den Bauch atmen",2.6,STR2,STR]],props:o=>({chair:chairAt(stretchChair)}),
  tips:o=>["Vorderer Fuß auf dem Stuhl, hinteres Bein gestreckt, auf den Zehen","Oberkörper aufrecht","Mehr Dehnung: hinteren Oberschenkel anspannen","Tief in den Bauch atmen – die Dehnung nimmt zu","Knie unangenehm: vorderes Knie nur ca. 90° beugen"]},
 {id:"couch",muscle:"huefte",group:H3,name:"Couch Stretch",de:"aktiv, Schienbein an der Wand",gear:["Wand","Handtuch"],src:"Knees Over Toes",weight:"none",uni:()=>true,
  def:{mode:"hold",secs:60,sets:1},opts:o=>[],
  cam:{y:.5,d:3.8,yaw:1.3,p:.15},build:couch,props:o=>({wall2:couchWall,towel:()=>{}}),
  tips:o=>["Hinteres Knie an der Wand, Schienbein senkrecht an der Wand","Aktiv: Fußrücken mit dem Oberschenkel in die Wand drücken","Gesäß anspannen, Oberkörper aufrichten","Nur so weit, wie du dich stark fühlst · KOT: 1–2 × 60 s pro Seite"]},
 {id:"butterfly",muscle:"huefte",group:H3,name:"Schmetterling",de:"Fußsohlen zusammen, Knie nach außen",gear:["Matte"],src:"LBA",weight:"none",
  def:{mode:"hold",secs:60,sets:1},opts:o=>[],
  cam:{y:.35,d:3.2,yaw:.25,p:.45},build:butterfly,
  tips:o=>["Fußsohlen zusammen, Fersen nah zum Körper","Knie locker nach außen sinken lassen","Mit langem Rücken aus der Hüfte nach vorne"]},
 {id:"deepsquat",muscle:"huefte",group:H3,name:"Tiefe Hocke",de:"Deep Squat",gear:["Handtuch"],src:"Morgenroutine",weight:"none",
  def:{mode:"hold",secs:60,sets:1},opts:o=>[],
  cam:{y:.5,d:3.2,yaw:.6,p:.25},build:o=>hold(SQUAT,SQUAT2),props:o=>({towel:towelFeet}),
  tips:o=>["Fersen erhöht (gerolltes Handtuch)","Ellbogen über die Knie, passiv halten","Aufrecht – kein Abrunden im unteren Rücken"]},
 {id:"camel",muscle:"huefte",group:H3,name:"Camel",de:"Knie umarmen + Aufstehen",gear:[],src:"Morgenroutine",weight:"none",uni:()=>true,
  def:{mode:"reps",reps:6,sets:1},opts:o=>[],
  cam:{y:.85,d:4.4,yaw:1.05,p:.22},build:o=>[["Knie umarmen",1.4,CAMEL_HUG,CAMEL_HUG],["hochdrücken",2.4,CAMEL_HUG,CAMEL_STAND],["oben",.8,CAMEL_STAND,CAMEL_STAND],["zurück runter",2.4,CAMEL_STAND,CAMEL_HUG]],
  tips:o=>["Knie eng umarmen, Bauch Richtung Oberschenkel","Mit beiden Beinen hochdrücken","Der hintere Fuß bleibt mit dem Fußrücken am Boden","Stuhl als Hilfe ist ok"]},
 {id:"qlext",muscle:"bauch",group:B1,name:"QL Extension",de:"Seitlich auf der 45°-Bank",gear:["45°-Bank"],src:"LBA / Knees Over Toes",weight:"plate",uni:()=>true,
  def:{mode:"reps",secs:30,reps:10,kg:0,sets:2},opts:o=>[["mode","Ausführung",[["hold","Halten"],["reps","Wiederholungen"]]]],
  cam:{y:.75,d:4,yaw:-1.35,p:.15},build:qlExt,props:o=>({bench:benchUpdate}),
  tips:o=>["Seitlich auf das Polster, Hüfte auf dem Polster, Füße versetzt auf der Platte","Seitlich runter beugen und aus der Flanke wieder hoch – nicht vor oder zurück kippen",o.kg>0?"Scheibe vor der Brust halten":"Hände hinter dem Kopf","KOT-Ziel: 25 % vom Körpergewicht × 10 Wdh."]},
 {id:"sidebend",muscle:"bauch",group:B1,name:"Stehende Seitbeuge",de:"Kettlebell in einer Hand",gear:["Kettlebell"],src:"LBA",weight:"kb",uni:()=>true,
  def:{mode:"reps",reps:12,kg:8,sets:2},opts:o=>[],
  cam:{y:.9,d:4,yaw:.15,p:.1},build:sideBend,props:o=>(o.kg>0?{kb:kbOne}:{}),
  tips:o=>["Rein seitlich beugen – nicht nach vorne kippen","Zur Kettlebell runter, dann über die Mitte hinaus zur anderen Seite","Becken bleibt ruhig, Knie locker","Langsam, volle Bewegung"]},
 {id:"sideplank",muscle:"bauch",group:B1,name:"Seitstütz",de:"Seitliche Bauchmuskeln halten",gear:["Matte"],src:"",weight:"none",uni:()=>true,
  def:{mode:"hold",secs:30,sets:2,legs:"fuesse"},opts:o=>[["legs","Abstützen auf",[["knie","Knien"],["fuesse","Füßen"]]]],
  cam:{y:.3,d:3.6,yaw:-1.25,p:.25},build:sidePlank,
  tips:o=>["Ellbogen unter der Schulter","Kopf, Hüfte und "+(o.legs==="knie"?"Knie":"Füße")+" in einer Linie","Hüfte nicht absacken lassen","Leichter: auf den Knien · schwerer: auf den Füßen"]},
 {id:"hanglegraise",muscle:"bauch",group:B2,name:"Hanging Leg Raises",de:"Hängend Beine heben",gear:["Klimmzugstange","Ab-Schlaufen"],src:"Knees Over Toes",weight:"none",
  def:{mode:"reps",reps:10,sets:3,legs:"bent",grip:"stange"},opts:o=>[["grip","Hängen an",[["stange","Stange"],["schlaufen","Ab-Schlaufen"]]],["legs","Beine",[["bent","Angewinkelt"],["straight","Gestreckt"]]]],
  cam:{y:1.4,d:5,yaw:1.15,p:.05},build:hangingRaise,props:o=>({pullbar:pullbarUpdate}),
  tips:o=>["Nicht schwingen – Becken nach hinten kippen und hochrollen",o.legs==="bent"?"Knie bis mindestens Hüfthöhe":"Beine gestreckt bis waagrecht, später Zehen zur Stange","2 s kontrolliert ablassen","LBA: erst wenn Back-Extension-Halten und -Wdh. sicher sitzen · ATG-Ziel: 10 × Zehen zur Stange"]},
 {id:"abwheel",muscle:"bauch",group:B2,name:"Rollrad",de:"Von den Knien",gear:["Rollrad","Matte"],src:"LBA: nach Back-Extension-Aufbau",weight:"none",
  def:{mode:"reps",reps:8,sets:3},opts:o=>[],
  cam:{y:.4,z:.45,d:4.3,yaw:1.3,p:.22},build:abWheel,props:o=>({wheel:wheelUpdate}),
  tips:o=>["Nur so weit rausrollen, wie der untere Rücken nicht durchhängt","Gesäß und Bauch fest","Mit dem Bauch zurückziehen, nicht mit der Hüfte","LBA: erst wenn Back-Extension-Halten und -Wdh. sicher sitzen"]},
 /* ---- nur in der Morgenroutine (neu im Katalog, Posen unverändert) ---- */
 {id:"heelsit",muscle:"morgen",group:M1,name:"Heel Sit",de:"Fersensitz",gear:[],src:"Morgenroutine",weight:"none",
  def:{mode:"hold",secs:60,sets:1},opts:o=>[],
  cam:{y:.6,d:3,yaw:.55,p:.3},build:o=>[["halten",2.5,HEEL,HEEL2],["halten",2.5,HEEL2,HEEL]],
  tips:o=>["Auf die Fußrücken setzen","Fersen nach außen, große Zehen nach innen","Nicht nur auf den Fersenknochen sitzen – im Sprunggelenk drehen"]},
 {id:"grasshopper",muscle:"morgen",group:M1,name:"Grasshopper",de:"Großzehen-Stretch",gear:[],src:"Morgenroutine",weight:"none",uni:()=>true,
  def:{mode:"hold",secs:30,sets:1},opts:o=>[],
  cam:{y:.45,d:3,yaw:.25,p:.3},build:o=>[["halten",2.5,GRASS,GRASS2],["halten",2.5,GRASS2,GRASS]],
  tips:o=>["Ein Fuß bleibt flach unter dir","Anderes Bein seitlich raus, auf die große Zehe","Zu intensiv: Gewicht wegnehmen, mit der Hand abstützen"]},
 {id:"nervefloss",muscle:"morgen",group:M1,name:"Nerve Floss",de:"Nerve Flossing",gear:[],src:"Morgenroutine",weight:"none",uni:()=>true,
  def:{mode:"reps",reps:10,sets:1},opts:o=>[],
  cam:{y:.75,d:4,yaw:1.35,p:.15},build:o=>[["Zehen hoch · Kopf runter",1.3,FLOSS_DOWN,FLOSS_UP],["halten",.35,FLOSS_UP,FLOSS_UP],["Zehen runter · Kopf hoch",1.3,FLOSS_UP,FLOSS_DOWN],["halten",.35,FLOSS_DOWN,FLOSS_DOWN]],
  tips:o=>["Vorderer Fuß nur mit der Ferse am Boden","Flacher Rücken, leicht aus der Hüfte nach vorne","Gegengleich: Zehen hoch = Kopf runter, Zehen runter = Kopf hoch","Gleiten statt dehnen – nicht in den Zug gehen"]},
 {id:"hamcurl",muscle:"morgen",group:M1,name:"Hamstring-Curl",de:"im Stand",gear:["Wand"],src:"Morgenroutine",weight:"none",uni:()=>true,timedReps:true,
  def:{mode:"hold",secs:30,sets:1},opts:o=>[],
  cam:{y:.8,d:4.2,yaw:-1.45,p:.12},build:o=>[["Ferse hoch",1,HC0,HC1],["3 s halten",1.6,HC1,HC1],["ablassen",1,HC1,HC0],["Zehe hinten am Boden",.4,HC0,HC0]],props:o=>({wallM:wallAt(()=>({z:wallZ()}))}),
  tips:o=>["An der Wand festhalten","Knie bleiben zusammen, Hüfte nach vorne, Rippen runter, Gesäß fest","Ferse mit dem hinteren Oberschenkel hochziehen, 3 s halten, ablassen","Krampft – das ist gewollt. Zu krampfig: Hüftstreckung etwas lockern"]},
 {id:"wallstretch",muscle:"morgen",group:M1,name:"Wanddehnung",de:"Wade + Hamstring",gear:["Wand"],src:"Morgenroutine",weight:"none",uni:()=>true,
  def:{mode:"hold",secs:30,sets:1},opts:o=>[],
  cam:{y:.65,d:4,yaw:-1.4,p:.15},build:o=>[["Wade dehnen",1.6,WS0,WS0],["leicht vorbeugen, Rücken flach",2,WS0,WS1],["halten",2.4,WS1,WS1],["aufrichten",1.6,WS1,WS0]],
  clip:s=>({pre:[s[0],s[1]],loop:[s[2]]}),props:o=>({wallM:wallAt(wallAtToe)}),
  tips:o=>["Fußballen an die Wand, Ferse am Boden","Erst nur Wade, dann mit flachem Rücken leicht vorbeugen","Nur 70–80 % Dehnung","Kribbeln Richtung Rücken: aufrichten, nur Wade dehnen"]}
];
const SETS_DEF={backext:2,seatedgm:2,bridge:3,slrdl:3,rdl:3,goodmorning:3,swing:3,revhyper:3,jefferson:2,superman:2,birddog:2,elephant:1,catcow:1,atgsplit:3,stepdown:2,poliquin:2,tibialis:2,calf:2,balance:1,walkback:1};
EX.forEach(e=>{if(e.def.sets==null)e.def.sets=SETS_DEF[e.id]||1});
const EXB={};EX.forEach(e=>EXB[e.id]=e);

function orientTo(g,dirDown,side){g.quaternion.copy(orient(dirDown,side))}
function kbOne(){const gp=along("handR",.55),u=gp.clone().sub(wp("uarmR")).normalize();kb.position.copy(gp);orientTo(kb,u,V(1,0,0))}
function kbBoth(){const gp=mid(along("handL",.55),along("handR",.55)),u=gp.clone().sub(shoulderMid()).normalize();kb.position.copy(gp);orientTo(kb,u,V(1,0,0))}
function kb2Update(){[["L",0],["R",1]].forEach(([k,i])=>{const gp=along("hand"+k,.55),u=gp.clone().sub(wp("uarm"+k)).normalize();kb2Parts[i].g.position.copy(gp);kb2Parts[i].g.quaternion.copy(orient(u,V(1,0,0)))})}
function dbUpdate(){dbParts[0].g.position.copy(along("handL",.5));dbParts[1].g.position.copy(along("handR",.5))}
function barUpdate(){const a=chestAxes();bar.position.copy(barPoint());setBasis(bar,a.side,a.down)}
function platesUpdate(ex){
  if(ex.id==="bridge"){const a=chestAxes();plates.position.copy(wp("pelvis").add(a.fwd.clone().multiplyScalar(.1)));setBasis(plates,a.side,a.fwd);return}
  const {a,c}=plateFrame();plates.position.copy(c.clone().add(a.fwd.clone().multiplyScalar(-.02)));setBasis(plates,a.side,a.fwd);
}

/* =================== ANZEIGE =================== */
let cur=null,curOpt=null,curProps={};
function showProps(e,o){
  for(const n in props)props[n].visible=false;
  const pr=e.props?e.props(o):{};
  for(const n in pr)props[n].visible=true;
  if(e.weight==="plate"&&o.kg>0){setupPlates(o.kg);props.plates.visible=true}else setupPlates(0);
  if(pr.kb)setupKB(o.kg);if(pr.kbs2)setupKB2(o.kg);towelPos=null;
  if(e.towelBone){const p0=e.build(o)[0][2];apply(p0);place(p0);const k=wp(e.towelBone);towelPos=V(k.x,.045,k.z)}if(pr.dbs)setupDB(o.kg);if(pr.bar)setupBar(o.kg);
  return pr;
}
/* Übung einrichten (Requisiten, Kamera). Gibt die Bewegungsfolge zurück. */
function show(e,o,keepCam){cur=e;curOpt=o;curProps=showProps(e,o);if(!keepCam)resetCam(e);return e.build(o)}
const easeIO=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const seqDur=s=>s.reduce((a,x)=>a+x[1],0);
function segAt(list,tt){let c=tt,ph=list[0];for(const s of list){if(c<=s[1]){ph=s;break}c-=s[1]}const u=Math.min(1,Math.max(0,c/ph[1]));return [ph,ph[4]==="lin"?u:easeIO(u)]}
function draw(ph,k){
  const e=cur,A=ph[2],B=ph[3],pose=mix(A,B,k);
  apply(pose);place(pose);
  if(A.legs||B.legs)legIK(pose,lerpLegs(A.legs,B.legs,k));
  const ta=(A.hands||chestHands)(),tb=(B.hands||chestHands)();
  pose.pole=(k<.5?A:B).pole;
  armIK(pose,{L:ta.L.clone().lerp(tb.L,k),R:ta.R.clone().lerp(tb.R,k)});
  for(const n in curProps)curProps[n](curOpt);
  if(props.plates.visible)platesUpdate(e);
}

/* Kamera */
let yaw=0,pitch=.3,dist=3,target=V(0,.5,.1),mirrored=false;
function resetCam(e){yaw=e.cam.yaw;pitch=e.cam.p;dist=e.cam.d;target=V(0,e.cam.y,e.cam.z!=null?e.cam.z:.1)}
function placeCam(c=cam){c.position.set(target.x+dist*Math.cos(pitch)*Math.sin(yaw),target.y+dist*Math.sin(pitch),target.z+dist*Math.cos(pitch)*Math.cos(yaw));c.lookAt(target)}
function setMirror(m){if(m===mirrored||!renderer)return;mirrored=m;renderer.domElement.style.transform=m?"scaleX(-1)":"none"}
function render(){if(!renderer)return;placeCam();renderer.render(scene,cam)}
function sizeTo(w){if(!renderer)return;w=Math.max(80,Math.floor(w));renderer.setSize(w,w,false);cam.aspect=1;cam.updateProjectionMatrix()}
function mount(el){
  stage=el;
  renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  el.prepend(renderer.domElement);
  let drag=null;
  el.addEventListener("pointerdown",e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};try{el.setPointerCapture(e.pointerId)}catch(_){}});
  el.addEventListener("pointermove",e=>{if(!drag)return;const dx=(e.clientX-drag.x)*(mirrored?-1:1);yaw=drag.yaw-dx*.01;pitch=Math.max(-.1,Math.min(1.35,drag.pitch+(e.clientY-drag.y)*.008))});
  el.addEventListener("pointerup",()=>drag=null);el.addEventListener("pointercancel",()=>drag=null);
}
/* Vorschaubild (für Listen) */
const thumbs={};
function thumb(e,o){
  if(!renderer)return "";
  const key=e.id+JSON.stringify(o);if(thumbs[key])return thumbs[key];
  const save=[cur,curOpt,curProps,yaw,pitch,dist,target.clone()];
  const s=show(e,o);const pick=s.length>2?s[1]:s[0];draw(pick,o.mode==="hold"?0:1);
  const tc=new T.PerspectiveCamera(35,1,.05,50);dist*=.92;placeCam(tc);
  const pr=renderer.getPixelRatio(),sz=renderer.getSize(new T.Vector2());
  renderer.setPixelRatio(1);renderer.setSize(128,128,false);renderer.render(scene,tc);
  const src=renderer.domElement.toDataURL("image/png");
  renderer.setPixelRatio(pr);renderer.setSize(sz.x,sz.y,false);
  [cur,curOpt,curProps,yaw,pitch,dist]=save;target=save[6];
  if(cur)curProps=showProps(cur,curOpt);
  thumbs[key]=src;return src;
}

/* Kleine animierte Vorschau (Editor): rendert mit demselben Renderer und kopiert jedes Bild in ein 2D-Canvas */
let pv=null;
function previewStart(e,o,cv){
  previewStop();if(!renderer||!cv)return;
  const ctx=cv.getContext("2d"),sz=cv.width,seq=show(e,o);let t=0,last=performance.now();
  pv={raf:0};
  const loop=n=>{
    if(!pv)return;t+=Math.min(.05,(n-last)/1000);last=n;
    const [ph,k]=segAt(seq,t%seqDur(seq));draw(ph,k);
    const pr=renderer.getPixelRatio();renderer.setPixelRatio(1);renderer.setSize(sz,sz,false);placeCam();renderer.render(scene,cam);
    ctx.clearRect(0,0,sz,sz);ctx.drawImage(renderer.domElement,0,0,sz,sz);renderer.setPixelRatio(pr);
    pv.raf=requestAnimationFrame(loop);
  };
  pv.raf=requestAnimationFrame(loop);
}
function previewStop(){if(!pv)return false;cancelAnimationFrame(pv.raf);pv=null;return true}
window.Figur={EX,EXB,STEPS,PLATE,plateSet,kgText,mount,show,draw,segAt,seqDur,render,sizeTo,setMirror,resetCam,thumb,previewStart,previewStop,get previewing(){return !!pv},
  setShade:m=>{fillMat.uniforms.uMode.value=m},
  get current(){return cur}};
})();
