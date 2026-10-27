const fs=require('node:fs'),crypto=require('node:crypto'),admin=require('../functions/node_modules/firebase-admin');
(async()=>{
 const bytes=fs.readFileSync('assets/private/liturgia-primer-grado.pdf'),expected='eca9fa5e4cc9b2028e4d9297ba064006d568a8a74736199ecd0bf06224b0f117';
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected||bytes.length>950000)throw Error('El PDF no coincide con el adjunto original o excede el límite de la lectura.');
 if(!admin.apps.length)admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:'registrologia'});
 const reading=admin.firestore().doc('templeReadings/primer-grado');
 await reading.set({title:'Liturgia de Primer Grado Completa',mime:'application/pdf',pages:101,degree:'aprendiz',byteLength:bytes.length,sha256:expected,pdfBytes:bytes});
 const saved=(await reading.get()).data();if(!saved||crypto.createHash('sha256').update(saved.pdfBytes).digest('hex')!==expected)throw Error('La publicación no coincide con el PDF original.');
 console.log('Liturgia original publicada y releída: 101 páginas, '+bytes.length+' bytes; lectura autenticada en Firestore, SHA-256 verificado.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
