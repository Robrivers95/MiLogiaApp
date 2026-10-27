// Deliberately contains only introductory lessons. No higher-degree catalogue,
// ritual text, AI prompt, library search or hidden/unlockable lessons exist here.
export type TemplePoint = { id:string; x:number; y:number; title:string; glyph:string; grade:1; text:string; reflection:string };
export const TEMPLE_POINTS: readonly TemplePoint[] = [
  {id:'b',x:2,y:11,title:'Columna B',glyph:'B',grade:1,text:'Fuerza para sostener el trabajo y perseverar. En este recorrido usamos la asociación con la fuerza indicada por tu logia, como una invitación al esfuerzo constante y al dominio de uno mismo.',reflection:'¿Qué hábito deseas fortalecer esta semana?'},
  {id:'j',x:8,y:11,title:'Columna J',glyph:'J',grade:1,text:'Las columnas enmarcan el acceso a este templo ilustrado. Aquí nos detenemos a preparar la atención y entrar con respeto. Su colocación y explicación concreta deben seguir la enseñanza de tu taller.',reflection:'¿Con qué disposición llegas a aprender?'},
  {id:'stone',x:2,y:5,title:'Piedra bruta',glyph:'◆',grade:1,text:'La piedra sin labrar nos invita a reconocer que podemos mejorar. El trabajo empieza al observar nuestros hábitos y actuar sobre aquello que necesita ser pulido, con paciencia y constancia.',reflection:'Elige una acción pequeña para mejorar tu trato con los demás.'},
  {id:'square',x:8,y:5,title:'Escuadra',glyph:'∟',grade:1,text:'La escuadra sirve para comprobar ángulos rectos en la construcción. Su lectura moral introductoria nos invita a revisar nuestra conducta con honestidad y coherencia entre lo que decimos y hacemos.',reflection:'¿Qué decisión reciente puedes revisar con honestidad?'},
  {id:'floor',x:5,y:8,title:'Pavimento ajedrezado',glyph:'▦',grade:1,text:'Los cuadros claros y oscuros evocan los contrastes y cambios de fortuna de la vida. Este recorrido invita a responder a ellos con equilibrio, sin perder el respeto por los demás.',reflection:'¿Cómo puedes mantener la serenidad ante una dificultad?'},
  {id:'study',x:5,y:2,title:'Mesa de estudio',glyph:'▤',grade:1,text:'Este punto del juego representa el estudio y la fraternidad. Escuchar, preguntar, contrastar ideas y ayudar a los demás son formas de construir una comunidad y de mejorar como persona.',reflection:'¿Qué pregunta llevarás a tu próxima reunión?'},
];
export type TemplePosition = {x:number;y:number};
export const TEMPLE_START: TemplePosition = {x:5,y:12};
export function templeStep(p:TemplePosition,dx:number,dy:number):TemplePosition {
  if(Math.abs(dx)+Math.abs(dy)!==1) return p;
  const n={x:p.x+dx,y:p.y+dy};
  return n.x<1||n.x>9||n.y<1||n.y>12||TEMPLE_POINTS.some(s=>s.x===n.x&&s.y===n.y)?p:n;
}
export const nearbyTemplePoint=(p:TemplePosition)=>TEMPLE_POINTS.find(s=>Math.abs(s.x-p.x)+Math.abs(s.y-p.y)===1);
