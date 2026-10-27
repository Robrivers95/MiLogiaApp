import * as T from 'three';
import {WORLD_START,WORLD_POINTS,WORLD_OBSTACLES,ZODIAC_COLUMNS,moveBody,floorHeight,nearWorldPoint} from './templeWorld';
import type {Body,WorldPoint} from './templeWorld';
export class TempleScene {
 private renderer:T.WebGLRenderer;private scene=new T.Scene();private camera=new T.PerspectiveCamera(68,1,.08,70);private player=new T.Group();
 private body:Body={...WORLD_START};private forward=0;private strafe=0;private turn=0;private pitch=0;private paused=false;private frame=0;private dead=false;private last=0;private reportAt=0;private walk=0;private renderedFrames=0;
 private geometries=new Set<T.BufferGeometry>();private materials=new Set<T.Material>();private textures=new Set<T.Texture>();private resize:ResizeObserver;
 private leftLeg:T.Group;private rightLeg:T.Group;private leftArm:T.Group;private rightArm:T.Group;
 constructor(private host:HTMLElement,private report:(body:Body,point?:WorldPoint)=>void,private failed:(s:string)=>void){
  this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.renderer.outputColorSpace=T.SRGBColorSpace;
  this.renderer.domElement.style.width='100%';this.renderer.domElement.style.height='100%';this.renderer.setClearColor('#1d2b43');this.renderer.domElement.setAttribute('aria-label','Templo 3D con cámara detrás del avatar');host.appendChild(this.renderer.domElement);
  this.scene.background=new T.Color('#1d2b43');this.scene.fog=new T.Fog('#243047',32,62);
  this.scene.add(new T.HemisphereLight('#e7edff','#857561',2.2));const sun=new T.DirectionalLight('#ffe4b6',2.1);sun.position.set(2,6,5);this.scene.add(sun);
  this.buildTemple();const limbs=this.buildAvatar();[this.leftLeg,this.rightLeg,this.leftArm,this.rightArm]=limbs;
  this.resize=new ResizeObserver(()=>this.size());this.resize.observe(host);this.size();this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
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
 private chair(x:number,z:number,y=0,angle=0){const group=new T.Group();group.position.set(x,y,z);group.rotation.y=angle;this.scene.add(group);this.box(0,.46,0,.7,.16,.65,'#7e4c46',group);this.box(0,1.03,.27,.72,1,.12,'#805345',group);for(const a of [-.26,.26])for(const b of [-.23,.23])this.box(a,.22,b,.07,.44,.07,'#b69967',group);}
 private desk(x:number,z:number,name:string,y=0){this.box(x,y+.75,z,1.6,.18,.9,'#906646');this.box(x,y+.34,z,1.25,.68,.65,'#634b43');this.label(name,x,y+1.4,z,1.8);}
 private buildTemple(){
  this.box(0,-.12,0,16,.22,28,'#b3a288');
  this.box(-8,3.2,0,.25,6.4,28,'#314766');this.box(8,3.2,0,.25,6.4,28,'#314766');this.box(0,3.2,-14,16,6.4,.25,'#344e72');
  this.box(-4.9,3.2,14,6.2,6.4,.25,'#344e72');this.box(4.9,3.2,14,6.2,6.4,.25,'#344e72');this.box(0,5.2,14,3.6,2.4,.25,'#344e72');
  this.box(0,6.5,0,16,.1,28,'#172c4e');
  for(const x of [-6.1,6.1]){this.box(x,3,-13.8,1.5,5.8,.08,'#7b3849');for(const edge of [-.73,.73])this.box(x+edge,3,-13.73,.045,5.8,.03,'#c3a164');}
  let starSeed=7331;const starRandom=()=>{starSeed=(Math.imul(starSeed,1664525)+1013904223)>>>0;return starSeed/4294967296;};
  for(let i=0;i<85;i++){const x=(starRandom()-.5)*15.2,z=(starRandom()-.5)*27.2;this.sphere(x,6.36,z,.025+(i%3)*.01,'#fff1c0');}
  for(const x of [-7.75,7.75]){this.box(x,5.55,0,.1,.12,27.8,'#d0b36a');for(let z=-12;z<=12;z+=3)this.sphere(x,5.55,z,.12,'#d0b36a');}
  // Checkerboard: one small procedural texture, no per-tile meshes.
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;ctx.fillStyle='#e8dfc8';ctx.fillRect(0,0,128,128);ctx.fillStyle='#273248';ctx.fillRect(0,0,64,64);ctx.fillRect(64,64,64,64);const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(4,8);tex.colorSpace=T.SRGBColorSpace;this.textures.add(tex);const mat=new T.MeshLambertMaterial({map:tex});this.materials.add(mat);const pave=this.mesh(new T.PlaneGeometry(5.6,13),mat,0,.012,1);pave.rotation.x=-Math.PI/2;
  for(let i=0;i<3;i++)this.box(0,.12+i*.12,-11.2-i*.3,8.8-i*.6,.24+i*.24,5-i*.6,'#b6a385');
  for(const x of [-3.1,3.1]){this.box(x,1.2,-8.8,3.4,.13,.17,'#d2ae61');for(let k=-1;k<=1;k++)this.cylinder(x+k*1.15,.61,-8.8,.06,1.2,'#bc954b');}
  this.box(0,.98,-12.8,2,.45,1.4,'#a18b62');this.chair(0,-12.8,1.1);this.box(0,2.0,-13.3,1.4,2,.15,'#bf9d5e');this.desk(0,-11.8,'Oriente',.72);
  for(const p of ZODIAC_COLUMNS){this.box(p.x,.14,p.z,1,.28,1,'#b9a78b');this.cylinder(p.x,2.38,p.z,.3,4.5,'#dbd3bb');this.box(p.x,4.72,p.z,.95,.25,.95,'#d0b073');this.label(`${p.glyph} ${p.title.replace('Columna de ','')}`,p.x,5.05,p.z,1.6);}
  for(const [x,letter,globe] of [[-2.2,'B','#689889'],[2.2,'J','#698cb8']] as const){this.box(x,.18,9,1,.36,1,'#b18a4e');this.cylinder(x,1.9,9,.32,3.3,'#bd9654');this.box(x,3.6,9,.9,.24,.9,'#d4b677');this.sphere(x,4.08,9,.48,globe);for(let k=0;k<5;k++)this.sphere(x+Math.cos(k*Math.PI*.4)*.33,3.83,9+Math.sin(k*Math.PI*.4)*.33,.10,'#b97450');this.label(letter,x,2.6,8.63,.8);this.label(letter,x,2.6,9.37,.8);}
  const rough=this.mesh(new T.DodecahedronGeometry(.52,0),this.material('#9b927e'),-2.2,.45,10.5);rough.scale.set(1,.8,1);this.box(2.2,.4,10.5,.8,.8,.8,'#c5bda5');
  this.box(0,.6,0,1.35,1.2,1.35,'#bfab88');this.box(0,1.25,0,1.5,.12,1.5,'#803b51');this.box(0,1.35,0,.8,.1,.6,'#e7dcc0');this.label('Altar',0,1.9,0,1.3);
  // Square and compasses resting on the book, in the degree-one arrangement.
  this.box(-.13,1.42,.04,.06,.035,.5,'#c7a859');this.box(.07,1.42,.26,.45,.035,.06,'#c7a859');const a=this.box(.0,1.4,-.12,.04,.03,.5,'#c7a859');a.rotation.y=-.5;const b=this.box(.18,1.4,-.12,.04,.03,.5,'#c7a859');b.rotation.y=.5;
  for(const [x,z] of [[-.9,1],[.9,1],[1.3,-.8]]){this.cylinder(x,.6,z,.06,1.2,'#d9b565');this.cylinder(x,1.25,z,.08,.22,'#ede2c3');this.sphere(x,1.43,z,.07,'#ffe59a');}
  for(const z of [-7,-3,1,5]){this.chair(-5.1,z,0,Math.PI/2);this.chair(-5.1,z+.8,0,Math.PI/2);this.chair(5.1,z,0,-Math.PI/2);this.chair(5.1,z+.8,0,-Math.PI/2);}
  this.desk(-4,-9.6,'Secretaría');this.desk(4,-9.6,'Elocuencia');this.desk(-4.1,12.3,'Primer Vigilante');this.desk(5.9,3,'Segundo Vigilante');
  this.label('Norte',-6,4,0,1.5);this.label('Sur',6,4,0,1.5);this.label('Occidente',0,4.6,13.7,2.1);
  this.sphere(2.6,4.9,-13.72,.38,'#f6d98c');this.label('☾',-2.6,4.9,-13.7,1.0);this.label('△  G',0,5.8,-13.7,1.5);
  const bowl=this.mesh(new T.SphereGeometry(.7,16,8,0,Math.PI*2,Math.PI/2,Math.PI/2),this.material('#c6a65c'),-4,.8,5);bowl.material.side=T.DoubleSide;for(let i=0;i<12;i++){const angle=i*Math.PI/6;this.box(-4+Math.cos(angle)*.5,.28,5+Math.sin(angle)*.5,.18,.48,.28,'#b79b5c');this.sphere(-4+Math.cos(angle)*.65,.48,5+Math.sin(angle)*.65,.12,'#b79b5c');}
  this.portraits();
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
  const p=this.body,h=floorHeight(p.z);this.player.position.set(p.x,h,p.z);this.player.rotation.y=-p.yaw;this.leftLeg.rotation.x=Math.sin(this.walk)*.45;this.rightLeg.rotation.x=-Math.sin(this.walk)*.45;this.leftArm.rotation.x=-Math.sin(this.walk)*.3;this.rightArm.rotation.x=Math.sin(this.walk)*.3;
  const desired=new T.Vector3(T.MathUtils.clamp(p.x-Math.sin(p.yaw)*3.4+Math.cos(p.yaw)*.65,-7.6,7.6),h+2.1,T.MathUtils.clamp(p.z+Math.cos(p.yaw)*3.4+Math.sin(p.yaw)*.65,-13.6,13.6));this.camera.position.lerp(desired,1-Math.exp(-dt*12));this.camera.lookAt(p.x+Math.sin(p.yaw)*2,h+1.25+this.pitch,p.z-Math.cos(p.yaw)*2);this.renderer.render(this.scene,this.camera);this.renderer.domElement.dataset.drawCalls=String(this.renderer.info.render.calls);this.renderer.domElement.dataset.frame=String(++this.renderedFrames);
  if(now-this.reportAt>100){this.reportAt=now;this.report({...p},nearWorldPoint(p));}
 };
 dispose(){this.dead=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.renderer.dispose();this.renderer.domElement.remove();}
}
