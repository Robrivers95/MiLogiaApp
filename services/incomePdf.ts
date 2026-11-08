import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/legacy/build/pdf.mjs';
GlobalWorkerOptions.workerSrc=new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',import.meta.url).href;
export async function incomePdf(bytes:Uint8Array):Promise<string>{
 const task=getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:true});
 try{
  const pdf=await task.promise;if(pdf.numPages>40)throw Error('El PDF tiene más de 40 páginas. Divídelo antes de analizar.');
  const pages:string[]=[];let length=0;
  for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i),content=await page.getTextContent();
   const text=content.items.map(item=>'str' in item?item.str+(item.hasEOL?'\n':' '):'').join('');
   length+=text.length;if(length>19000)throw Error('El PDF tiene demasiado texto. Divide los movimientos en varios archivos.');
   pages.push(text);page.cleanup();
  }
  return pages.join('\n');
 }catch(error:any){
  if(error?.name==='PasswordException')throw Error('El PDF requiere contraseña. Usa el CSV del banco o un PDF que se pueda abrir sin contraseña.');
  throw error;
 }finally{await task.destroy();}
}
