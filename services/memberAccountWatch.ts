import {collection,onSnapshot,query,where} from 'firebase/firestore';
import {auth,db} from './firebase';
// The same two sources written by bank reconciliation and receipt approval.
// Listen only while one member's account is open; never scan every member.
export function watchMemberAccount(groupId:string,memberId:string,actorId:string,onChange:()=>void,onError:()=>void){
 if(!groupId||!memberId||auth.currentUser?.uid!==actorId)return()=>{};
 let active=true,timer:ReturnType<typeof setTimeout>|undefined;
 const changed=()=>{if(!active)return;clearTimeout(timer);timer=setTimeout(()=>{if(active)onChange();},150);};
 const failed=()=>{if(active)onError();};
 const stopLedger=onSnapshot(collection(db,'users',memberId,'ledger'),changed,failed);
 const stopReceipts=onSnapshot(query(collection(db,'groups',groupId,'paymentReceipts'),where('userId','==',memberId)),changed,failed);
 return()=>{active=false;clearTimeout(timer);stopLedger();stopReceipts();};
}
