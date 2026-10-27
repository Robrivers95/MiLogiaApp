import * as T from 'three';
import {WORLD_START,WORLD_POINTS,WORLD_OBSTACLES,ZODIAC_COLUMNS,moveBody,floorHeight,nearWorldPoint,ROOM_AREAS,ROOM_WALLS,canInspect,pointVisible} from './templeWorld';
import type {Body,WorldPoint} from './templeWorld';
export type ScreenMarker={id:string;x:number;y:number;near:boolean;distance:number};
export class TempleScene {
 private renderer:T.WebGLRenderer;private scene=new T.Scene();private camera=new T.PerspectiveCamera(68,1,.08,70);private player=new T.Group();
 private body:Body={...WORLD_START};private forward=0;private strafe=0;private turn=0;private pitch=0;private paused=false;private frame=0;private dead=false;private last=0;private reportAt=0;private walk=0;private renderedFrames=0;private walls:T.Mesh[]=[];private cameraRay=new T.Raycaster();
 private geometries=new Set<T.BufferGeometry>();private materials=new Set<T.Material>();private textures=new Set<T.Texture>();private resize:ResizeObserver;
 private leftLeg:T.Group;private rightLeg:T.Group;private leftArm:T.Group;private rightArm:T.Group;
 constructor(private host:HTMLElement,private report:(body:Body,point?:WorldPoint,markers?:ScreenMarker[])=>void,private failed:(s:string)=>void){
  this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.renderer.outputColorSpace=T.SRGBColorSpace;
  this.renderer.domElement.style.width='100%';this.renderer.domElement.style.height='100%';this.renderer.setClearColor('#1d2b43');this.renderer.domElement.setAttribute('aria-label','Templo 3D con cámara detrás del avatar');host.appendChild(this.renderer.domElement);
  this.scene.background=new T.Color('#1d2b43');this.scene.fog=new T.Fog('#243047',32,62);
  this.scene.add(new T.HemisphereLight('#e7edff','#857561',2.2));const sun=new T.DirectionalLight('#ffe4b6',2.1);sun.position.set(2,6,5);this.scene.add(sun);
  this.buildTemple();const limbs=this.buildAvatar();[this.leftLeg,this.rightLeg,this.leftArm,this.rightArm]=limbs;
  this.scene.updateMatrixWorld(true);this.resize=new ResizeObserver(()=>this.size());this.resize.observe(host);this.size();this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
  this.camera.position.set(WORLD_START.x+.65,2.1,13.6);this.last=performance.now()-32;this.animate(performance.now());
 }
 private contextLost=(e:Event)=>{e.preventDefault();this.pause(true);this.failed('Se interrumpió la vista 3D. Pulsa Volver a cargar para recuperarla.');};
 private size(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
 private material(color:string){const m=new T.MeshLambertMaterial({color});this.materials.add(m);return m;}
 private mesh(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=this.scene){this.geometries.add(g);const o=new T.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;}
 private box(x:number,y:number,z:number,w:number,h:number,d:number,color:string,parent:T.Object3D=this.scene){return this.mesh(new T.BoxGeometry(w,h,d),this.material(color),x,y,z,parent);}
 private cylinder(x:number,y:number,z:number,r:number,h:number,color:string,parent:T.Object3D=this.scene){return this.mesh(new T.CylinderGeometry(r,r,h,12),this.material(color),x,y,z,parent);}
 private sphere(x:number,y:number,z:number,r:number,color:string,parent:T.Object3D=this.scene){return this.mesh(new T.SphereGeometry(r,12,8),this.material(color),x,y,z,parent);}
 private label(text:string,x:number,y:number,z:number,width=1.8,color='#f6dfaa'){
  const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d')!;ctx.fillStyle='#162036e8';ctx.fillRect(0,0,512,96);ctx.strokeStyle='#b89c60';ctx.strokeRect(2,2,508,92);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 30px sans-serif';ctx.fillText(text,256,48,490);
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;this.textures.add(texture);const m=new T.SpriteMaterial({map:texture,depthWrite:false});this.materials.add(m);const s=new T.Sprite(m);s.position.set(x,y,z);s.scale.set(width,width*96/512,1);this.scene.add(s);return s;
 }
 private chair(x:number,z:number,y=0,angle=0,parent:T.Object3D=this.scene){const group=new T.Group();group.position.set(x,y,z);group.rotation.y=angle;parent.add(group);this.box(0,.46,0,.7,.16,.65,'#7e4c46',group);this.box(0,1.03,.27,.72,1,.12,'#805345',group);for(const a of [-.26,.26])for(const b of [-.23,.23])this.box(a,.22,b,.07,.44,.07,'#b69967',group);}
 private desk(x:number,z:number,name:string,y=0){this.box(x,y+.75,z,1.6,.18,.9,'#906646');this.box(x,y+.34,z,1.25,.68,.65,'#634b43');this.label(name,x,y+1.4,z,1.8);}
 private buildTemple(){
  this.box(0,-.12,0,16,.22,28,'#b3a288');
  for(const w of ROOM_WALLS){const temple=Math.abs(w.z)<=14&&Math.abs(w.x)<=8;const h=temple?6.4:4.2;const color=w.x< -8?'#252a34':'#314766';this.walls.push(this.box(w.x,h/2,w.z,w.w,h,w.d,color));}
  this.box(0,5.2,14,3.6,2.4,.25,'#344e72');
  this.box(0,6.5,0,16,.1,28,'#172c4e');
  for(const x of [-6.1,6.1]){this.box(x,3,-13.8,1.5,5.8,.08,'#7b3849');for(const edge of [-.73,.73])this.box(x+edge,3,-13.73,.045,5.8,.03,'#c3a164');}
  let starSeed=7331;const starRandom=()=>{starSeed=(Math.imul(starSeed,1664525)+1013904223)>>>0;return starSeed/4294967296;};
  for(let i=0;i<85;i++){const x=(starRandom()-.5)*15.2,z=(starRandom()-.5)*27.2;this.sphere(x,6.36,z,.025+(i%3)*.01,'#fff1c0');}
  for(const x of [-7.75,7.75]){this.box(x,5.55,0,.1,.12,27.8,'#d0b36a');for(let z=-12;z<=12;z+=3)this.sphere(x,5.55,z,.12,'#d0b36a');}
  // Checkerboard: one small procedural texture, no per-tile meshes.
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;ctx.fillStyle='#e8dfc8';ctx.fillRect(0,0,128,128);ctx.fillStyle='#273248';ctx.fillRect(0,0,64,64);ctx.fillRect(64,64,64,64);const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(4,8);tex.colorSpace=T.SRGBColorSpace;this.textures.add(tex);const mat=new T.MeshLambertMaterial({map:tex});this.materials.add(mat);const pave=this.mesh(new T.PlaneGeometry(5.6,13),mat,0,.012,1);pave.rotation.x=-Math.PI/2;
  for(let i=0;i<3;i++)this.box(0,.12+i*.12,-11.2-i*.3,8.8-i*.6,.24+i*.24,5-i*.6,'#b6a385');
  for(const x of [-3.1,3.1]){this.box(x,1.2,-8.8,3.4,.13,.17,'#d2ae61');for(let k=-1;k<=1;k++)this.cylinder(x+k*1.15,.61,-8.8,.06,1.2,'#bc954b');}
  this.box(0,.98,-12.8,2,.45,1.4,'#a18b62');this.chair(0,-12.8,1.1);this.box(0,2.0,-13.3,1.4,2,.15,'#bf9d5e');this.desk(0,-11.8,'Venerable Maestro',.72);
  for(let i=0;i<4;i++)this.box(0,.78+i*.06,-12.5-i*.12,2.5-i*.18,.12+i*.12,1.8-i*.18,'#c2af90');this.canopy(0,-13.4,.72,0,2.5);
  for(const p of ZODIAC_COLUMNS){this.box(p.x,.14,p.z,1,.28,1,'#b9a78b');this.cylinder(p.x,2.38,p.z,.3,4.5,'#dbd3bb');this.box(p.x,4.72,p.z,.95,.25,.95,'#d0b073');this.label(`${p.glyph} ${p.title.replace('Columna de ','')}`,p.x,5.05,p.z,1.6);}
  for(const [x,letter,globe] of [[-2.2,'B','#689889'],[2.2,'J','#698cb8']] as const){this.box(x,.18,9,1,.36,1,'#b18a4e');this.cylinder(x,1.9,9,.32,3.3,'#bd9654');this.box(x,3.6,9,.9,.24,.9,'#d4b677');this.sphere(x,4.08,9,.48,globe);for(let k=0;k<5;k++)this.sphere(x+Math.cos(k*Math.PI*.4)*.33,3.83,9+Math.sin(k*Math.PI*.4)*.33,.10,'#b97450');this.label(letter,x,2.6,8.63,.8);this.label(letter,x,2.6,9.37,.8);}
  const rough=this.mesh(new T.DodecahedronGeometry(.52,0),this.material('#9b927e'),-2.2,.45,10.5);rough.scale.set(1,.8,1);this.box(2.2,.4,10.5,.8,.8,.8,'#c5bda5');
  this.box(0,.6,0,1.35,1.2,1.35,'#bfab88');this.box(0,1.25,0,1.5,.12,1.5,'#803b51');this.box(0,1.35,0,.8,.1,.6,'#e7dcc0');this.label('Altar',0,1.9,0,1.3);
  // Square and compasses resting on the book, in the degree-one arrangement.
  this.box(-.13,1.42,.04,.06,.035,.5,'#c7a859');this.box(.07,1.42,.26,.45,.035,.06,'#c7a859');const a=this.box(.0,1.4,-.12,.04,.03,.5,'#c7a859');a.rotation.y=-.5;const b=this.box(.18,1.4,-.12,.04,.03,.5,'#c7a859');b.rotation.y=.5;
  for(const [x,z] of [[-.9,1],[.9,1],[1.3,-.8]]){this.cylinder(x,.6,z,.06,1.2,'#d9b565');this.cylinder(x,1.25,z,.08,.22,'#ede2c3');this.sphere(x,1.43,z,.07,'#ffe59a');}
  for(const z of [-7,-3,1,5]){this.chair(-5.1,z,0,Math.PI/2);this.chair(-5.1,z+.8,0,Math.PI/2);this.chair(5.1,z,0,-Math.PI/2);this.chair(5.1,z+.8,0,-Math.PI/2);}
  this.officerStation(-4,-9.6,1,'Secretario','✎',0);this.officerStation(4,-9.6,2,'Orador','▤',0);this.officerStation(-4.1,12.3,5,'Primer Vigilante','⊥',0);this.officerStation(5.9,3,3,'Segundo Vigilante','⌖',Math.PI/2);this.officerStation(4.8,-6.8,1,'Tesorero','⚿',Math.PI/2);this.officerStation(-4.8,-6.8,0,'Hospitalario','♧',-Math.PI/2);
  this.label('Norte',-6,4,0,1.5);this.label('Sur',6,4,0,1.5);this.label('Occidente',0,4.6,13.7,2.1);
  this.sphere(2.6,4.9,-13.72,.38,'#f6d98c');this.label('☾',-2.6,4.9,-13.7,1.0);this.label('△  G',0,5.8,-13.7,1.5);
  const bowl=this.mesh(new T.SphereGeometry(.7,16,8,0,Math.PI*2,Math.PI/2,Math.PI/2),this.material('#c6a65c'),-4,.8,5);bowl.material.side=T.DoubleSide;for(let i=0;i<12;i++){const angle=i*Math.PI/6;this.box(-4+Math.cos(angle)*.5,.28,5+Math.sin(angle)*.5,.18,.48,.28,'#b79b5c');this.sphere(-4+Math.cos(angle)*.65,.48,5+Math.sin(angle)*.65,.12,'#b79b5c');}
  this.portraits();this.buildAnnex();this.buildSymbols();this.zodiacArt();
 }
 private canopy(x:number,z:number,base:number,angle:number,width=2){const g=new T.Group();g.position.set(x,base,z);g.rotation.y=angle;this.scene.add(g);this.box(0,2.65,0,width,.13,.8,'#a8884d',g);this.box(0,1.5,.3,width,2.2,.05,'#7b3849',g);for(const side of [-1,1])this.cylinder(side*width*.48,1.35,-.05,.045,2.7,'#c6ab6b',g);}
 private officerStation(x:number,z:number,n:number,name:string,glyph:string,angle:number){const g=new T.Group(),base=(name==='Primer Vigilante'||name==='Segundo Vigilante')?0:floorHeight(z,x);g.position.set(x,base,z);g.rotation.y=angle;this.scene.add(g);const stepHeight=name==='Segundo Vigilante'?.16:.12,top=n*stepHeight;
  for(let i=0;i<n;i++)this.box(0,(i+1)*stepHeight/2,-.3+i*.14,2.3-i*.12,(i+1)*stepHeight,2.8-i*.24,'#baa483',g);
  this.box(0,top+.75,0,1.6,.16,.9,'#906646',g);this.box(0,top+.34,0,1.25,.68,.65,'#634b43',g);this.chair(0,.65,top,0,g);
  this.label(name,x,base+top+2.1,z,2);this.label(glyph,x-Math.sin(angle)*.5,base+top+.5,z-Math.cos(angle)*.5,.7);
  this.box(.25,top+.88,-.15,.35,.04,.25,'#e0d6b6',g);
  const lights=name==='Orador'?7:name==='Primer Vigilante'?5:3,lit=(name==='Tesorero'||name==='Hospitalario')?1:3;
  this.box(0,top+.94,.18,1.08,.035,.04,'#bfa164',g);for(let i=0;i<lights;i++){const dx=(i-(lights-1)/2)*.15;this.cylinder(dx,top+1.04,.18,.026,.2,'#e9dfc2',g);if(i<lit)this.sphere(dx,top+1.18,.18,.038,'#ffe39a',g);}

  if(name==='Primer Vigilante'||name==='Segundo Vigilante'){
   this.cylinder(.35,top+.99,.1,.045,.35,'#c4ab66',g);this.box(-.3,top+.92,-.15,.3,.09,.12,'#ab8348',g);this.box(-.3,top+.91,-.31,.045,.045,.3,'#9c7648',g);this.canopy(x+Math.sin(angle)*.65,z+Math.cos(angle)*.65,base+top,angle,1.85);
   this.label(name==='Primer Vigilante'?'J':'B',x,base+top+1.35,z,.4);
  }
 }
 private eyeEmblem(x:number,y:number,z:number,size:number){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;ctx.strokeStyle='#e5c36e';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(128,18);ctx.lineTo(235,215);ctx.lineTo(21,215);ctx.closePath();ctx.stroke();ctx.fillStyle='#f2e2b7';ctx.beginPath();ctx.ellipse(128,143,49,24,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7b8793';ctx.beginPath();ctx.arc(128,143,17,0,Math.PI*2);ctx.fill();ctx.fillStyle='#172438';ctx.beginPath();ctx.arc(128,143,8,0,Math.PI*2);ctx.fill();const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;this.textures.add(tex);const m=new T.SpriteMaterial({map:tex,depthWrite:false});this.materials.add(m);const sprite=new T.Sprite(m);sprite.position.set(x,y,z);sprite.scale.set(size,size,1);this.scene.add(sprite);}
 private skull(x:number,y:number,z:number,scale=1){this.sphere(x,y,z,.14*scale,'#ddd3b8');for(const dx of [-.055,.055])this.sphere(x+dx*scale,y+.01*scale,z-.115*scale,.035*scale,'#242635');this.box(x,y-.11*scale,z-.02*scale,.16*scale,.09*scale,.12*scale,'#ddd3b8');}
 private buildSymbols(){
  this.cylinder(0,.4,2.2,.17,.8,'#b99b60');const bowl=this.mesh(new T.SphereGeometry(.22,12,6,0,Math.PI*2,Math.PI/2,Math.PI/2),this.material('#c5a056'),0,.86,2.2);bowl.material.side=T.DoubleSide;
  for(let i=0;i<3;i++)this.sphere((i-1)*.06,1.05+i*.12,2.2,.04,'#c5c7ca');
  this.label('△  ✦  G',0,4.9,9,2.3);this.eyeEmblem(0,5.05,-13.5,1.2);this.eyeEmblem(-4.1,2.9,13.45,.8);this.eyeEmblem(7.35,2.8,3,.7);
  for(const x of [-.62,.62])for(const z of [-.62,.62])this.sphere(x,1.19,z,.07,'#c9a958');
  this.box(-.37,1.34,0,.28,.08,.45,'#4a4a72');this.box(.38,1.34,0,.25,.08,.42,'#695348');
  const blade:T.Vector3[]=[];for(let i=0;i<13;i++)blade.push(new T.Vector3((i%2?.045:-.045),1.315,-.65+i*.1));this.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(blade),36,.018,4,false),this.material('#d0b26e'),0,0,0);this.box(0,1.32,.64,.28,.04,.04,'#d0b26e');this.box(0,1.32,.77,.05,.05,.22,'#98754b');
  for(const x of [-7.75,7.75]){this.cylinder(x,4.9,12.7,.045,1.3,'#d0b36a');this.mesh(new T.ConeGeometry(.14,.35,10),this.material('#d0b36a'),x,4.08,12.7);}

  const seats:[number,number,string][]=[[2.9,12.6,'Guarda Templo Interior'],[3.5,-6.2,'Maestro de Ceremonias'],[-3.5,-6.2,'Porta Estandarte'],[3.4,10.2,'Primer Experto'],[-3.4,10.2,'Segundo Experto'],[-1.9,-12,'Primer Diácono'],[1.8,-12,'Diputado'],[-2.5,12.6,'Segundo Diácono'],[6,-7.3,'Ecónomo']];
  for(const [x,z,title] of seats){const y=floorHeight(z,x);this.chair(x,z,y);this.label(title,x,y+1.8,z,1.8);}
  this.cylinder(-3.8,1,-6.2,.025,2,'#c9b374');this.box(-3.5,1.7,-6.15,.7,.9,.045,'#3f5e90');this.cylinder(3.5,1,-6.2,.025,2,'#c9b374');
  this.box(-1.35,.25,10.35,.3,.06,.12,'#b29155');const tool=this.box(-1.1,.27,10.35,.035,.04,.45,'#d5cdb7');tool.rotation.y=.3;
 }
 private buildAnnex(){
  for(const room of ROOM_AREAS.filter(r=>r.id!=='temple')){this.box(room.x,-.1,room.z,room.w+.25,.2,room.d+.25,room.id==='reflection'?'#383b43':'#a99d8b');this.box(room.x,4.25,room.z,room.w+.25,.1,room.d+.25,room.id==='reflection'?'#141823':'#45556b');}
  this.label('Atrio',0,3.2,16.6,2);this.chair(2.5,16.6,0,Math.PI/2);this.label('Guarda Templo Exterior',2.5,1.8,16.6,2.2);
  this.label('Sala de Pasos Perdidos',0,3.1,23,3.3);this.label('Cuarto de Reflexiones',-7.7,2.6,25,2.4);this.label('Sala de Banquetes',7.7,2.6,25,2.4);
  for(const x of [-6.6,6.6]){this.box(x,1.25,21.8,.7,2.5,2,'#655343');for(let row=0;row<4;row++){this.box(x,.2+row*.6,21.8,.8,.06,2.1,'#b49a73');for(let i=0;i<5;i++)this.box(x+(x<0?.37:-.37),.45+row*.6,21.1+i*.3,.12,.4,.16,['#733f43','#46658a','#a88e56'][i%3]);}}
  this.desk(3.8,27.5,'Escritorio de estudio');this.box(0,2.1,28.7,3,1.7,.1,'#27384d');for(const x of [-.9,0,.9])this.box(x,2.1,28.62,.65,1,.03,'#e7dec4');this.label('Avisos y planchas',0,3.2,28.55,2.6);
  // The chamber is intentionally sober: the liturgy prescribes a small set of objects.
  this.box(-13.3,.72,25.3,1.6,.12,.8,'#161b24');this.box(-13.3,.34,25.3,1.3,.68,.55,'#151922');this.chair(-12.1,25.3,0,-Math.PI/2);
  this.skull(-13.4,.98,25.15);for(const a of [-.6,.6]){const bone=this.box(-13.6,.83,25.4,.45,.035,.035,'#d8d0bb');bone.rotation.y=a;}
  this.cylinder(-12.8,.98,25.3,.045,.38,'#d5b354');this.sphere(-12.8,1.21,25.3,.055,'#ffe3a0');const candle=new T.PointLight('#ffcc79',1.2,4);candle.position.set(-12.8,1.35,25.3);this.scene.add(candle);
  this.cylinder(-13.05,.93,25.5,.06,.25,'#baa879');this.cylinder(-13.05,.82,25.5,.12,.035,'#c7b487');this.cylinder(-13.05,1.06,25.5,.12,.035,'#c7b487');this.box(-13.7,.82,25.05,.22,.02,.18,'#d9d2bc');this.cylinder(-13.65,.9,25.55,.05,.12,'#2a2832');
  this.box(-13,.2,22,.85,.4,2,'#493b35');this.box(-13,.43,22,.73,.06,1.85,'#171c25');this.skull(-13,.58,21.4,.85);for(let i=0;i<5;i++)this.box(-13,.52,21.7+i*.15,.25,.045,.04,'#d8d0bb');for(const x of [-13.15,-12.85])this.box(x,.52,22.6,.07,.04,.65,'#d8d0bb');
  this.label('Cuarto de Reflexiones · Cámara Negra',-11.2,3.1,24.5,3.6);this.label('Deberes con Dios, con los demás y contigo',-11.2,2.3,28.65,3.5);
  for(const x of [10,16])this.box(x,.8,24.3,1,.15,5,'#855943');this.box(13,.8,21.8,7,.15,1,'#855943');this.label('Mesa en herradura',13,2.4,22,2.7);
  for(let i=0;i<4;i++){for(const x of [10,16])this.cylinder(x,.91,22.7+i*.85,.17,.02,'#f0e7d5');this.chair(9,22.5+i,0,-Math.PI/2);this.chair(17,22.5+i,0,Math.PI/2);}this.chair(13,20.8,0,Math.PI);this.chair(16,27.3);this.chair(10,27.3);
 }
 private zodiacArt(){new T.TextureLoader().load('/temple/zodiac.webp',base=>{if(this.dead){base.dispose();return;}base.colorSpace=T.SRGBColorSpace;this.textures.add(base);ZODIAC_COLUMNS.forEach((p,i)=>{const tex=base.clone();tex.repeat.set(.246,1/3-.004);tex.offset.set((i%4)/4+.002,1-(Math.floor(i/4)+1)/3+.002);tex.needsUpdate=true;this.textures.add(tex);const m=new T.MeshBasicMaterial({map:tex});this.materials.add(m);const direction=p.x<0?1:-1,angle=direction*Math.PI/2;const frame=this.box(p.x+direction*.39,3.1,p.z,.075,1.18,1.18,'#c6aa6d');const image=this.mesh(new T.PlaneGeometry(1.08,1.08),m,p.x+direction*.44,3.1,p.z);image.rotation.y=angle;});},undefined,()=>this.failed('No cargaron las ilustraciones zodiacales. Las fichas siguen disponibles.'));}
 private markers():ScreenMarker[]{
  this.camera.updateMatrixWorld();const result:ScreenMarker[]=[];for(const p of WORLD_POINTS){const distance=Math.hypot(p.x-this.body.x,p.z-this.body.z);if(distance>12||!pointVisible(this.body,p))continue;const v=new T.Vector3(p.x,floorHeight(p.z,p.x)+(p.markerY||1.75),p.z).project(this.camera);if(v.z< -1||v.z>1||Math.abs(v.x)>.95||v.y> .85||v.y< -.65)continue;let y=(1-v.y)*50;const x=(v.x+1)*50;for(const old of result)if(Math.abs(old.x-x)<6&&Math.abs(old.y-y)<7)y=Math.max(12,y-7);result.push({id:p.id,x,y,near:canInspect(this.body,p),distance});}return result;
 }
 private portraits(){new T.TextureLoader().load('/temple/virtudes.webp',base=>{if(this.dead){base.dispose();return;}base.colorSpace=T.SRGBColorSpace;this.textures.add(base);
  const configs=[{x:0,z:-13.7,angle:0,index:0,title:'Minerva · Sabiduría'},{x:-4.1,z:13.7,angle:Math.PI,index:1,title:'Hércules · Fuerza'},{x:7.7,z:3,angle:-Math.PI/2,index:2,title:'Venus · Belleza'}];
  for(const p of configs){const tex=base.clone();tex.repeat.set(1/3,1);tex.offset.set(p.index/3,0);tex.needsUpdate=true;this.textures.add(tex);const m=new T.MeshBasicMaterial({map:tex});this.materials.add(m);const frame=this.box(p.x,3.6,p.z,2.35,2.45,.12,'#bd9954');frame.rotation.y=p.angle;const image=this.mesh(new T.PlaneGeometry(2.1,2.2),m,p.x+Math.sin(p.angle)*.08,3.6,p.z+Math.cos(p.angle)*.08);image.rotation.y=p.angle;this.label(p.title,p.x-Math.sin(p.angle)*.12,2.15,p.z+Math.cos(p.angle)*.12,2.8);}
 },undefined,()=>this.failed('No cargaron los cuadros. Puedes seguir explorando y consultar las fichas.'));}
 private buildAvatar(){this.scene.add(this.player);this.box(0,.95,0,.5,.65,.32,'#5376a5',this.player);this.box(0,.84,-.18,.38,.36,.025,'#f3ecda',this.player);this.box(0,.96,.18,.42,.05,.025,'#f3ecda',this.player);this.sphere(0,1.52,0,.22,'#dbb18b',this.player);this.sphere(0,1.65,.025,.19,'#362e29',this.player);
  const limb=(x:number,y:number,w:number,h:number,color:string)=>{const g=new T.Group();g.position.set(x,y,0);this.player.add(g);this.box(0,-h/2,0,w,h,w,color,g);return g;};return [limb(-.14,.67,.16,.6,'#243750'),limb(.14,.67,.16,.6,'#243750'),limb(-.34,1.23,.13,.55,'#5376a5'),limb(.34,1.23,.13,.55,'#5376a5')];}
 input(forward:number,strafe:number,turn=0){this.forward=forward;this.strafe=strafe;this.turn=turn;}
 look(dx:number,dy:number){this.body.yaw+=dx;this.pitch=T.MathUtils.clamp(this.pitch+dy,-.75,.75);}
 pause(value:boolean){this.paused=value;if(value)this.input(0,0,0);}
 reset(){this.body={...WORLD_START};this.pitch=0;this.input(0,0,0);}
 state(){return {...this.body};}
 private animate=(now:number)=>{if(this.dead)return;this.frame=requestAnimationFrame(this.animate);if(now-this.last<1000/40)return;const dt=Math.min((now-this.last)/1000,.06);this.last=now;if(document.hidden)return;
  if(!this.paused){const old=this.body;this.body=moveBody(this.body,this.forward,this.strafe,this.turn,dt);if(Math.hypot(old.x-this.body.x,old.z-this.body.z)>.001)this.walk+=dt*8;else this.walk=0;}
  const p=this.body,h=floorHeight(p.z,p.x);this.player.position.set(p.x,h,p.z);this.player.rotation.y=-p.yaw;this.leftLeg.rotation.x=Math.sin(this.walk)*.45;this.rightLeg.rotation.x=-Math.sin(this.walk)*.45;this.leftArm.rotation.x=-Math.sin(this.walk)*.3;this.rightArm.rotation.x=Math.sin(this.walk)*.3;
  const origin=new T.Vector3(p.x,h+1.25,p.z);let desired=new T.Vector3(p.x-Math.sin(p.yaw)*3.4+Math.cos(p.yaw)*.65,h+2.1,p.z+Math.cos(p.yaw)*3.4+Math.sin(p.yaw)*.65);
  const rayDirection=desired.clone().sub(origin),length=rayDirection.length();this.cameraRay.set(origin,rayDirection.normalize());this.cameraRay.far=length;const hit=this.cameraRay.intersectObjects(this.walls,false)[0];if(hit)desired=origin.clone().addScaledVector(rayDirection,Math.max(.35,hit.distance-.18));
  this.camera.position.lerp(desired,1-Math.exp(-dt*12));this.player.visible=this.camera.position.distanceTo(origin)>.65;this.camera.lookAt(p.x+Math.sin(p.yaw)*2,h+1.25+this.pitch,p.z-Math.cos(p.yaw)*2);this.renderer.render(this.scene,this.camera);this.renderer.domElement.dataset.drawCalls=String(this.renderer.info.render.calls);this.renderer.domElement.dataset.frame=String(++this.renderedFrames);
  if(now-this.reportAt>100){this.reportAt=now;this.report({...p},nearWorldPoint(p),this.markers());}
 };
 dispose(){this.dead=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.renderer.dispose();this.renderer.domElement.remove();}
}
