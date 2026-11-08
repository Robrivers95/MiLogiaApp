import assert from 'node:assert/strict';import {build} from 'esbuild';import vm from 'node:vm';
const result=await build({stdin:{contents:"export * from './services/incomeSelection';export * from './services/incomeMatching';",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
const module={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{exports:module.exports,module,console,Date,Set,Map});
const {incomeTargets,memberIncomeSummary,normalizeIncomeSelections,applyIncomeSelections,incomeMemberCandidates}=module.exports;
const payments=[
 {period:'2026-07',amount:400,paid:400,paidRegular:400,extraFees:[{id:'event',description:'Evento',amount:300,paid:50}]},
 {period:'2026-08',amount:400,paid:100,paidRegular:100},
 {period:'2026-09',amount:400,paid:0},
 {period:'2026-10',amount:0,paid:0,extraFees:[{id:'forgiven',description:'Cena cerrada',amount:200,paid:0,forgiven:true}]},
 {period:'2027-01',amount:400,paid:0},
];
const summary=memberIncomeSummary(payments,'2026-11');
assert.deepEqual(JSON.parse(JSON.stringify(summary)),{paidMonths:['2026-07'],partialMonths:['2026-08'],pendingMonths:['2026-08','2026-09'],regularBalance:700,extraBalance:250,futureBalance:400});
const targets=incomeTargets(payments);assert.equal(targets.find(t=>t.feeId==='forgiven').balance,0);assert.equal(targets.find(t=>t.period==='2026-07'&&t.kind==='regular').balance,0);
assert.throws(()=>normalizeIncomeSelections([{period:'2026-09',kind:'regular',amount:10},{period:'2026-09',kind:'regular',amount:20}]),/más de una vez/);
assert.throws(()=>applyIncomeSelections(payments,400,[{period:'2026-07',kind:'regular',amount:400}],false,'2026-11-07','x'),/cubierta/);
assert.throws(()=>applyIncomeSelections(payments,200,[{period:'2026-10',kind:'extra',feeId:'forgiven',amount:200}],false,'2026-11-07','x'),/perdonada/);
assert.throws(()=>applyIncomeSelections(payments,100,[{period:'2026-09',kind:'regular',amount:101}],false,'2026-11-07','x'),/supera el depósito/);
const plan=applyIncomeSelections(payments,500,[{period:'2026-07',kind:'extra',feeId:'event',amount:200,expectedBalance:250},{period:'2026-09',kind:'regular',amount:100,expectedBalance:400}],true,'2026-10-29','x');
assert.equal(plan.applied,300);assert.equal(plan.unapplied,200);assert.equal(plan.payments.find(p=>p.period==='2026-09').paymentDate,'2026-10-29');assert.equal(payments[0].extraFees[0].paid,50);
const members=[{uid:'a',name:'José Luis García López'},{uid:'b',name:'José Luis García Pérez'},{uid:'c',name:'Carlos Ríos'}];
assert.equal(incomeMemberCandidates('JOSE GARCIA',members).length,2,'ambiguous names are suggestions, never silently picked');
assert.equal(incomeMemberCandidates('TRANSFERENCIA RECIBIDA Carlos Rios',members)[0].uid,'c');assert.equal(incomeMemberCandidates('José',members).length,0,'one common first name is not a safe suggestion');
console.log('Income selection passed: full member matrix summary, future vs due balances, forgiven/paid guards, exact custom allocations, stale protection, non-mutating data and ambiguous member suggestions.');
