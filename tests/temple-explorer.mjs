import assert from 'node:assert/strict';
import vm from 'node:vm';import {build} from 'esbuild';
const bundle=await build({entryPoints:['services/templeWorld.ts'],bundle:true,write:false,format:'cjs',platform:'node'});const context={module:{exports:{}}};vm.runInNewContext(bundle.outputFiles[0].text,context);
const {WORLD_POINTS:points,WORLD_START:start,ZODIAC_COLUMNS:columns,clearAt,moveBody,floorHeight,nearWorldPoint:near,nearbyWorldPoints:nearby,canInspect,ROOM_AREAS}=context.module.exports;
assert.equal(columns.length,12);assert.equal(columns.filter(p=>p.x<0).length,6);assert.equal(columns.filter(p=>p.x>0).length,6);
assert.equal(points.filter(p=>['minerva','hercules','venus'].includes(p.id)).length,3);
assert.equal(new Set(points.map(p=>p.id)).size,points.length);
for(const p of points){assert.equal(p.grade,1);assert.ok(p.text&&p.pages.length);assert.ok(p.pages.every(n=>n>=1&&n<=101));}
let p=start;for(let i=0;i<30;i++)p=moveBody(p,1,0,0,1/60);assert.ok(start.z-p.z>1.3&&start.z-p.z<1.5,'continuous motion follows elapsed time');
const rotated=moveBody(start,0,0,1,.06);assert.ok(rotated.yaw>0);const huge=moveBody(start,1,0,0,300);assert.ok(start.z-huge.z<.18,'long frame cannot teleport');
assert.equal(clearAt(0,0),false,'altar collision');assert.equal(clearAt(-6.8,-10),false,'zodiac column collision');assert.equal(clearAt(-2.2,9),false,'B collision');
assert.equal(floorHeight(-11),.72);assert.equal(floorHeight(1),0);
// Flood-fill the real collision field; every lesson must have a reachable nearest trigger.
const step=.35,queue=[{x:0,z:11.2}],seen=new Set(['0,32']),reached=new Set();
for(let i=0;i<queue.length;i++){const p=queue[i];for(const lesson of nearby({...p,yaw:0}))reached.add(lesson.id);for(const [dx,dz]of[[step,0],[-step,0],[0,step],[0,-step]]){const n={x:Math.round((p.x+dx)*100)/100,z:Math.round((p.z+dz)*100)/100},key=`${n.x},${n.z}`;if(!seen.has(key)&&clearAt(n.x,n.z)){seen.add(key);queue.push(n);}}}
assert.equal(points.filter(p=>!reached.has(p.id)).length,0,'unreachable: '+points.filter(p=>!reached.has(p.id)).map(p=>p.id).join(','));
assert.equal(ROOM_AREAS.length,5);assert.ok(points.filter(p=>p.zodiacIndex!==undefined).every(p=>p.myth?.text&&p.myth?.url));assert.ok(nearby({x:-1.3,z:9,yaw:0}).length>1,'multiple close objects remain independently readable');
assert.equal(canInspect({x:0,z:11.2},points.find(p=>p.id==='atrium')),false);
assert.equal(canInspect({x:7.2,z:21.5},{...points[0],x:8.2,z:21.5}),false,'walls block nearby information');
console.log(`3D temple policy passed: ${points.length} reachable first-degree stations, twelve zodiac columns, three figures, continuous elapsed-time motion, turn, walls/furniture and elevation.`);
