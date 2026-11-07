import {incomeImage} from './incomeCaptureApi';
type Part={mimeType:string;data:string};
// Files remain local until analysis. Only extracted text and individual quotes persist.
export async function incomeAttachments(files:File[],text:string):Promise<{text:string;images:Part[];documents:Part[]}>{
 if(files.length>4)throw Error('Selecciona hasta cuatro archivos.');
 const images:Part[]=[],documents:Part[]=[];const sections=[text];
 for(const file of files){
  const extension=file.name.toLowerCase().split('.').pop();
  if(extension==='pdf'||file.type==='application/pdf'){
   if(file.size>2*1024*1024)throw Error('El PDF supera 2 MB. Divide el estado de cuenta en archivos más pequeños.');
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('El archivo no es un PDF válido.');
   let binary='';for(let offset=0;offset<bytes.length;offset+=16384)binary+=String.fromCharCode(...bytes.subarray(offset,offset+16384));
   documents.push({mimeType:'application/pdf',data:btoa(binary)});
  }else if(extension==='xlsx'){
   if(file.size>2*1024*1024)throw Error('El Excel supera 2 MB. Exporta solo los movimientos que quieres revisar.');
   const {default:ExcelJS}=await import('exceljs');const workbook=new ExcelJS.Workbook();
   try{await workbook.xlsx.load(await file.arrayBuffer(),{ignoreNodes:['mergeCells','drawing','conditionalFormatting','dataValidations']});}catch{throw Error('No se pudo abrir el Excel. Usa un .xlsx sin contraseña.');}
   const lines:string[]=[];let length=0;
   workbook.eachSheet(sheet=>{sheet.eachRow((row,index)=>{
    if(row.cellCount>100)throw Error('El Excel tiene demasiadas columnas. Exporta solo los movimientos bancarios.');
    const values:string[]=[];row.eachCell({includeEmpty:true},cell=>{const v=cell.value;values.push(v instanceof Date?v.toISOString().slice(0,10):cell.text);});
    const line=`${sheet.name} · fila ${index}: ${values.join(' | ')}`;length+=line.length+1;
    if(lines.length>=1000||length>18000)throw Error('El Excel contiene demasiados datos. Divide los movimientos para revisarlos por partes.');
    lines.push(line);
   });});
   if(!lines.length)throw Error('El Excel no contiene filas para analizar.');
   sections.push(`Excel ${file.name}:\n${lines.join('\n')}`);
  }else if(['jpg','jpeg','png','webp'].includes(extension||'')||file.type.startsWith('image/')){
   images.push(await incomeImage(file.type?file:new File([file],file.name,{type:extension==='png'?'image/png':extension==='webp'?'image/webp':'image/jpeg'})));
  }else throw Error('Selecciona fotos JPG, PNG o WebP, Excel .xlsx o PDF. Convierte los .xls antiguos a .xlsx.');
 }
 const combined=sections.filter(Boolean).join('\n\n');
 if(combined.length>20000)throw Error('Hay demasiado texto. Divide los movimientos en varios análisis.');
 if([...images,...documents].reduce((sum,p)=>sum+p.data.length,0)>6500000)throw Error('Los archivos juntos son demasiado pesados. Analiza menos archivos a la vez.');
 return {text:combined,images,documents};
}
