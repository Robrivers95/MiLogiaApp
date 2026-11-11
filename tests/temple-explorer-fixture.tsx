import React from 'react';
import {createRoot} from 'react-dom/client';
import TempleExplorer from '../components/TempleExplorer';
createRoot(document.getElementById('root')!).render(<TempleExplorer user={{uid:'apprentice-test',groupId:'test',active:true,role:'member',grade:'Aprendiz',name:'Aprendiz'} as any}/>);
