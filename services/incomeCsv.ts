import {BANK_TEXT_LIMIT} from '../functions/src/meetingBankStatement';
export const isIncomeCsv=(file:File)=>/\.csv$/i.test(file.name)||file.type==='text/csv';
export async function incomeCsvText(file:File){
 if(file.size>BANK_TEXT_LIMIT*2)throw Error('El CSV es muy grande. Divídelo en partes y conserva el encabezado en cada una.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes);
 if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{return new TextDecoder('windows-1252').decode(bytes);}
}
