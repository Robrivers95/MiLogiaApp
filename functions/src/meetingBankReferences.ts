import type {firestore} from 'firebase-admin';

type Source = 'draft'|'receipt'|'treasury';
type Record = {type:Source;id:string;data:firestore.DocumentData};
export async function existingBankRecords(db:firestore.Firestore,tx:firestore.Transaction,groupId:string,references:string[]){
 const sources:[Source,string,string[]][]=[
  ['draft','incomeDrafts',['reference','approvedReview.reference']],
  ['receipt','paymentReceipts',['bankReference','bankOriginalReference']],
  ['treasury','treasury',['bankReference','bankOriginalReference']],
 ];
 const batches:{type:Source;field:string;query:firestore.Query}[]=[];
 for(let i=0;i<references.length;i+=30){
  const keys=references.slice(i,i+30);
  for(const [type,path,fields] of sources)for(const field of fields)batches.push({type,field,query:db.collection(`groups/${groupId}/${path}`).where(field,'in',keys)});
 }
 const result=new Map<string,Record[]>();
 const snapshots=await Promise.all(batches.map(b=>tx.get(b.query)));
 snapshots.forEach((snapshot,i)=>{
  const {type,field}=batches[i];
  for(const doc of snapshot.docs){
   const data=doc.data();
   if(type==='treasury'?data.type!=='income':!['pending','approved'].includes(data.status))continue;
   const reference=field==='approvedReview.reference'?data.approvedReview?.reference:data[field];
   const entries=result.get(reference)||[];
   if(!entries.some(entry=>entry.type===type&&entry.id===doc.id))entries.push({type,id:doc.id,data});
   result.set(reference,entries);
  }
 });
 return result;
}
// Missing legacy fields cannot prove an exact match: retain the record and
// report a conflict instead of making another draft with the same folio.
export function matchesBankRecord(row:{amount:number;date:string},record:Record){
 const {type,data}=record;
 const date=type==='draft'?data.date:data.bankDepositDate||(type==='receipt'?data.transferDate:data.date);
 const amount=data.amount;
 return amount!==undefined&&amount!==null&&Number(amount)===row.amount&&typeof date==='string'&&date.slice(0,10)===row.date;
}
