export type WorldPoint={id:string;x:number;z:number;title:string;glyph:string;grade:1;text:string;pages:number[]};
const point=(id:string,x:number,z:number,title:string,glyph:string,text:string,pages:number[]):WorldPoint=>({id,x,z,title,glyph,grade:1,text,pages});
export const ZODIAC=['Aries','Tauro','Géminis','Cáncer','Leo','Virgo','Libra','Escorpio','Sagitario','Capricornio','Acuario','Piscis'];
export const ZODIAC_GLYPHS=['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
export const ZODIAC_COLUMNS=ZODIAC.map((name,i)=>point(`zodiac-${i}`,i<6?-6.8:6.8,-10+(i%6)*4,`Columna de ${name}`,ZODIAC_GLYPHS[i],`La liturgia dispone doce columnas, distribuidas simétricamente a ambos lados del templo, con los signos del Zodíaco en sus capiteles. Esta columna muestra ${name}. La secuencia elegida aquí organiza el recorrido; el texto no fija un orden por pared ni da una lección masónica individual para cada signo.`,[9]));
export const WORLD_POINTS:WorldPoint[]=[
 point('b',-2.2,9,'Columna B','B','La columna B se representa en bronce y sostiene una esfera terrestre. Al pie se sitúa la piedra bruta. La explicación de las dos columnas relaciona la ciencia y la virtud con el trabajo masónico, y las granadas con la armonía de una misma familia.',[10,92,93]),
 point('j',2.2,9,'Columna J','J','La columna J lleva una esfera celeste y, a su pie, una piedra cúbica. La disposición del documento la sitúa al lado Sur. Aquí se estudia su presencia en la decoración de primer grado, sin desarrollar enseñanzas de otros grados.',[10]),
 point('stone',-2.2,10.5,'Piedra bruta','◆','El trabajo del Aprendiz consiste en desbastar la piedra bruta: una imagen del esfuerzo por dominar las pasiones y perfeccionar el espíritu. En el simbolismo del documento, el cincel y el mazo representan la Razón y la Tolerancia.',[98]),
 point('cube',2.2,10.5,'Piedra cúbica','◇','El apartado de disposición del templo coloca la piedra cúbica al pie de la columna J. El juego muestra esa ubicación como parte de la arquitectura de esta liturgia y mantiene la explicación dentro del primer grado.',[10]),
 point('square',0,0,'Altar de los Juramentos','∟','La liturgia dispone sobre el altar el Libro de la Ley, la escuadra y el compás, junto con los textos normativos indicados por el taller. Su explicación presenta la escuadra como equidad en los actos y el compás como moderación de los deseos.',[9,91]),
 point('lights',1.65,1.1,'Tres luces del altar','✦','Las tres antorchas del altar simbolizan Ciencia, Virtud y Fraternidad en la explicación de esta liturgia: principios que orientan el camino del progreso.',[91]),
 point('floor',0,4.3,'Pavimento de mosaico','▦','Las piezas blancas y negras unidas por un mismo cemento representan, en este texto, la unión de los masones a pesar de sus diferencias. También evocan el bien y el mal presentes en el camino de la vida.',[92]),
 point('minerva',0,-11.5,'Minerva · Sabiduría','M','El documento relaciona la Sabiduría con Minerva y con la función que concibe las ideas y obras del taller. El cuadro es una ilustración artística para ayudar a reconocer esta asociación, no una imagen histórica incluida en el PDF.',[92]),
 point('hercules',-4.1,11.9,'Hércules · Fuerza','H','Hércules representa la Fuerza entre los tres apoyos simbólicos de la logia. La liturgia relaciona este principio con la función que ejecuta las ideas y obras del taller.',[92]),
 point('venus',5.6,3,'Venus · Belleza','V','Venus representa la Belleza. Dentro de los tres apoyos simbólicos descritos en esta liturgia, se vincula con la función que adorna las ideas y obras masónicas.',[92]),
 point('eloquence',4,-8.8,'Tribuna de la elocuencia','▤','El plano de referencia sitúa este espacio al lado Sur, próximo a Oriente. En la app, los trazados, comentarios y acuerdos pueden documentarse desde Secretaría y actas, y las tareas resultantes se revisan antes de confirmarlas.',[9]),
 point('sky',-3.5,-10.5,'Bóveda celeste','☾','El techo representa la bóveda celeste con estrellas y nubes, con el Sol y la Luna en Oriente. La explicación del primer grado la presenta como un cielo que cobija a los seres humanos sin distinción.',[9,10,92,98]),
 point('steps',0,-8.1,'Gradas de Oriente','△','El documento sitúa Oriente sobre una plataforma de tres escalones y un trono elevado detrás. En este modelo puedes subir por el paso central. Las proporciones son una adaptación para facilitar el recorrido, no una medida ritual.',[9]),
 point('sea',-4,5,'Mar de Bronce','≈','La decoración descrita incluye, hacia el Norte, un tazón dorado sostenido por doce bueyes figurados: el Mar de Bronce. Se muestra aquí como un elemento del templo descrito en primer grado.',[10]),
 ...ZODIAC_COLUMNS
];
export type Body={x:number;z:number;yaw:number};
export const WORLD_START:Body={x:0,z:11.2,yaw:0};
export type Obstacle={x:number;z:number;w:number;d:number};
export const WORLD_OBSTACLES:Obstacle[]=[
 ...ZODIAC_COLUMNS.map(p=>({x:p.x,z:p.z,w:.95,d:.95})),
 {x:-2.2,z:9,w:1,d:1},{x:2.2,z:9,w:1,d:1},
 {x:-2.2,z:10.5,w:.8,d:.8},{x:2.2,z:10.5,w:.8,d:.8},
 {x:0,z:0,w:1.4,d:1.4},{x:-4,z:5,w:1.4,d:1.4},
 {x:-4.1,z:12.3,w:2,d:1.3},{x:5.9,z:3,w:1.7,d:1.5},
 {x:4,z:-9.6,w:1.6,d:1.5},{x:-4,z:-9.6,w:1.6,d:1.5},
 ...[-7,-3,1,5].flatMap(z=>[-5.1,5.1].map(x=>({x,z,w:.9,d:2.2}))),
 {x:0,z:-12.8,w:2,d:1},{x:0,z:-11.8,w:1.6,d:.9},
 {x:-3.1,z:-8.8,w:3.4,d:.25},{x:3.1,z:-8.8,w:3.4,d:.25}
];
export const clearAt=(x:number,z:number)=>Math.abs(x)<=7.35&&z>=-13.1&&z<=13.1&&!WORLD_OBSTACLES.some(o=>Math.abs(x-o.x)<o.w/2+.28&&Math.abs(z-o.z)<o.d/2+.28);
export function moveBody(p:Body,forward:number,strafe:number,turn:number,seconds:number):Body {
 let out={...p};const dt=Math.min(Math.max(seconds,0),.06),len=Math.max(1,Math.hypot(forward,strafe));out.yaw+=turn*dt*1.7;
 const dx=(Math.sin(out.yaw)*forward+Math.cos(out.yaw)*strafe)/len*2.8*dt;
 const dz=(-Math.cos(out.yaw)*forward+Math.sin(out.yaw)*strafe)/len*2.8*dt;
 if(clearAt(out.x+dx,out.z))out.x+=dx;if(clearAt(out.x,out.z+dz))out.z+=dz;return out;
}
export const floorHeight=(z:number)=>z< -9.9?.72:z< -9.3?.48:z< -8.7?.24:0;
export const nearWorldPoint=(p:Body)=>WORLD_POINTS.filter(s=>Math.hypot(s.x-p.x,s.z-p.z)<1.65).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
