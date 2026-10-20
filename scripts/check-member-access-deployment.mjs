import {readFileSync} from 'node:fs';
if(!/MEMBER_ACCESS_ENABLED\s*=\s*true\b/.test(readFileSync('services/features.ts','utf8'))){console.log('Protected member access is disabled; visual changes can deploy independently.');process.exit(0);}
for(const name of ['adminMemberAccess','finishMemberPasswordChange']){
 const response=await fetch(`https://us-central1-registrologia.cloudfunctions.net/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{}}),signal:AbortSignal.timeout(20000)});
 const result=await response.json();if(response.status!==401 || result.error?.status!=='UNAUTHENTICATED')throw Error(`${name} is not deployed with the required authentication guard.`);
}
console.log('Both protected member access endpoints are deployed and reject unauthenticated requests.');
