import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Layout from '../components/Layout';
import RequiredPasswordChange from '../components/RequiredPasswordChange';
import MemberAccessRecovery from '../components/MemberAccessRecovery';
import '../styles/temple.css';
function Fixture(){
 const params=new URLSearchParams(location.search);const [recover,setRecover]=useState(false);const [logo,setLogo]=useState('');
 (window as any).__logoChanged=setLogo;
 const user={uid:'admin-test',name:'Administrador de prueba',role:params.get('role')||'admin',groupId:'test'} as any;
 if(params.has('required'))return <RequiredPasswordChange onLogout={()=>{}}/>;
 return <Layout user={user} currentView="home" groupName="Respetable Logia Luz y Armonía No. 42" groupLogo={logo} onNavigate={()=>{}} onLogout={()=>{}}><div className="space-y-5"><h2 className="text-2xl font-bold">Bienvenido a tu logia</h2><section className="bg-logia-800 rounded-xl p-5 border border-logia-700"><h3 className="font-bold text-lg">Tu actividad</h3><p className="text-gray-400 mt-2">Consulta tus cuotas, avisos y actividades del mes.</p><button className="mt-4 p-3 bg-indigo-600 rounded-lg" onClick={()=>setRecover(true)}>Recuperar acceso</button></section></div>{recover&&<MemberAccessRecovery member={{uid:'member-test',name:'Miembro de prueba'} as any} groupId="test" onClose={()=>setRecover(false)}/>}</Layout>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
