const fs=require('node:fs'),crypto=require('node:crypto'),admin=require('../functions/node_modules/firebase-admin');
(async()=>{
 const bytes=fs.readFileSync('assets/private/liturgia-primer-grado.pdf');
 const expected='eca9fa5e4cc9b2028e4d9297ba064006d568a8a74736199ecd0bf06224b0f117';
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('El PDF no coincide con el adjunto original.');
 if(!admin.apps.length)admin.initializeApp({credential:admin.credential.applicationDefault(),storageBucket:'registrologia.firebasestorage.app'});
 const file=admin.storage().bucket().file('templeStudy/liturgia-primer-grado.pdf');
 await file.save(bytes,{resumable:false,metadata:{contentType:'application/pdf',cacheControl:'private,max-age=3600',metadata:{sourceSha256:expected}}});
 const [metadata]=await file.getMetadata();if(Number(metadata.size)!==bytes.length)throw Error('La carga del PDF no coincide en tamaño.');
 console.log('Liturgia original publicada: 101 páginas, '+bytes.length+' bytes, sin enlace público con token.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
