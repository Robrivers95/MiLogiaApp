import React,{useEffect,useRef,useState} from 'react';
import type {User} from '../types';
import {TEMPLE_POINTS,TEMPLE_START,templeStep,nearbyTemplePoint} from '../services/templeExplorer';
import type {TemplePosition,TemplePoint} from '../services/templeExplorer';
import '../styles/temple-explorer.css';

export default function TempleExplorer({user}:{user:User}) {
  const [position,setPosition]=useState<TemplePosition>(TEMPLE_START),[lesson,setLesson]=useState<TemplePoint>(),[visited,setVisited]=useState<string[]>([]);
  const held=useRef<any>(),board=useRef<HTMLDivElement>(null),lessonRef=useRef(lesson);
  lessonRef.current=lesson;
  const storageKey=`temple-apprentice:${user.groupId}:${user.uid}`;
  const near=nearbyTemplePoint(position);
  useEffect(()=>{
    setPosition(TEMPLE_START);setLesson(undefined);setVisited([]);
    try { const values=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(values))setVisited([...new Set(values.filter((v:any)=>TEMPLE_POINTS.some(p=>p.id===v))) ] as string[]); } catch {}
  },[storageKey]);
  const stop=()=>{clearInterval(held.current);held.current=undefined;};
  const move=(dx:number,dy:number)=>{if(!lessonRef.current)setPosition(p=>templeStep(p,dx,dy));};
  useEffect(()=>{const blur=()=>stop();window.addEventListener('blur',blur);return()=>{stop();window.removeEventListener('blur',blur);};},[]);
  const openLesson=()=>{
    if(!near)return;
    stop();setLesson(near);
    setVisited(old=>{const next=[...new Set([...old,near.id])];try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{}return next;});
  };
  const control=(label:string,glyph:string,dx:number,dy:number)=><button type="button" className="te-direction" aria-label={label} disabled={!!lesson}
    onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);stop();move(dx,dy);held.current=setInterval(()=>move(dx,dy),160);}}
    onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
    onClick={e=>{if(e.detail===0)move(dx,dy);}}>{glyph}</button>;
  return <div className="te-shell">
    <div className="te-heading"><div><h2>Explorar el templo</h2><p>Recorrido de Aprendiz · {visited.length}/{TEMPLE_POINTS.length} puntos</p></div><span className="te-grade">Grado 1</span></div>
    <p className="te-guide">Mueve tu avatar con las flechas. Acércate a un símbolo y pulsa Aprender.</p>
    <div className="te-map" ref={board} tabIndex={0} role="region" aria-label="Templo interactivo de Aprendiz"
      onKeyDown={e=>{const directions:Record<string,number[]>={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};const v=directions[e.key];if(v){e.preventDefault();move(v[0],v[1]);}else if(e.key==='Enter'&&!lesson){e.preventDefault();openLesson();}}}>
      <svg viewBox="0 0 330 420" role="img" aria-label={`Avatar en columna ${position.x}, fila ${position.y}. Templo ilustrativo, no ritual.`}>
        <defs><linearGradient id="te-wall" x2="0" y2="1"><stop stopColor="#39465c"/><stop offset="1" stopColor="#202c40"/></linearGradient><pattern id="te-floor" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M0 0H60V60H0Z" fill="#a9abb1"/><path d="M0 0H30V30H0ZM30 30H60V60H30Z" fill="#3c4759"/></pattern></defs>
        <rect width="330" height="420" rx="16" fill="url(#te-wall)"/><rect x="26" y="26" width="278" height="368" rx="4" fill="#202d41" stroke="#b79856" strokeWidth="2"/>
        <rect x="76" y="106" width="178" height="208" fill="url(#te-floor)" stroke="#b79856" strokeWidth="3"/>
        <path d="M39 67H58V304H39ZM272 67H291V304H272Z" fill="#526178"/>
        {[3,4,6,7,8,9].map(y=><g key={y}><rect x="34" y={y*30+7} width="20" height="18" rx="3" fill="#796542"/><rect x="276" y={y*30+7} width="20" height="18" rx="3" fill="#796542"/></g>)}
        <text x="165" y="20" textAnchor="middle" fill="#f0d391" fontSize="11" letterSpacing="3">ESTUDIO · RESPETO</text>
        <path d="M145 396V409H185V396" stroke="#d6b575" strokeWidth="4" fill="none"/>
        {TEMPLE_POINTS.map(p=><g key={p.id} transform={`translate(${p.x*30+15},${p.y*30+15})`}>
          {p.id==='b'||p.id==='j'?<><rect x="-11" y="-24" width="22" height="42" rx="4" fill="#d1b77b"/><path d="M-15-24H15M-15 19H15" stroke="#f4dfa9" strokeWidth="5"/></>:<rect x="-14" y="-14" width="28" height="28" rx="6" fill="#1b2941" stroke={near?.id===p.id?'#86efac':'#d6b575'} strokeWidth="2"/>}
          <text textAnchor="middle" dominantBaseline="central" fill={p.id==='b'||p.id==='j'?'#1e293b':'#f8e3b5'} fontSize="20" fontWeight="700">{p.glyph}</text>
          {visited.includes(p.id)&&<circle cx="13" cy="-16" r="5" fill="#86efac"/>}
        </g>)}
        <g data-testid="temple-avatar" data-x={position.x} data-y={position.y} className="te-avatar" transform={`translate(${position.x*30+15},${position.y*30+15})`}>
          <ellipse cy="12" rx="11" ry="4" fill="#0006"/><path d="M-6 7L-7 15M6 7L7 15" stroke="#192133" strokeWidth="5" strokeLinecap="round"/>
          <rect x="-9" y="-3" width="18" height="16" rx="5" fill="#6585bf"/><path d="M-6 3H6V12H-6Z" fill="#fff4dd"/><path d="M-6 3L0 7L6 3" fill="#d2be91"/>
          <circle cy="-9" r="7" fill="#e5bb90"/><path d="M-7-10Q-5-20 5-15L7-9" fill="#372d2b"/>
        </g>
      </svg>
    </div>
    <div className="te-controls"><div className="te-dpad"><span/>{control('Mover arriba','↑',0,-1)}<span/>{control('Mover izquierda','←',-1,0)}<span className="te-pad-center">✦</span>{control('Mover derecha','→',1,0)}<span/>{control('Mover abajo','↓',0,1)}<span/></div><div className="te-action"><p aria-live="polite">{near?near.title:'Acércate a un punto dorado'}</p><button className="te-learn" disabled={!near||!!lesson} onClick={openLesson}>Aprender</button><button className="te-reset" onClick={()=>{stop();setPosition(TEMPLE_START);setLesson(undefined);board.current?.focus();}}>Volver a la entrada</button></div></div>
    <p className="te-note">Solo enseñanza introductoria de Aprendiz. Plano ilustrativo: la ubicación y enseñanza de los símbolos se confirma con tu instructor y el rito de tu taller.</p>
    {visited.length===TEMPLE_POINTS.length&&<p className="te-complete" role="status">Recorrido completado. Lleva tus reflexiones a tu próxima tenida.</p>}
    {lesson&&<div className="te-overlay"><section className="te-lesson" role="dialog" aria-modal="true" aria-labelledby="te-lesson-title" onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();e.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();}if(e.key==='Escape'){setLesson(undefined);board.current?.focus();}}}>
      <p className="te-grade">Aprendiz · punto {TEMPLE_POINTS.findIndex(p=>p.id===lesson.id)+1}</p><h3 id="te-lesson-title">{lesson.title}</h3><p>{lesson.text}</p><div className="te-reflection">{lesson.reflection}</div><button autoFocus className="te-learn" onClick={()=>{setLesson(undefined);board.current?.focus();}}>Seguir explorando</button>
    </section></div>}
  </div>;
}
