import assert from 'node:assert/strict';
import { canUseWhatsApp,currentReminderPeriod,debtReminder,normalizeWhatsAppPhone,whatsappChatUrl,whatsappMessage } from '../services/whatsappReminders';
import type { User, Payment } from '../types';
const user={uid:'u',name:'José Ríos',role:'admin',active:true,groupId:'one'} as User;
assert.equal(canUseWhatsApp(user),true);
for(const role of ['viewer','member','master'] as const) assert.equal(canUseWhatsApp({...user,role}),false);
assert.equal(canUseWhatsApp(user,true),false);assert.equal(canUseWhatsApp({...user,active:false}),false);
assert.equal(normalizeWhatsAppPhone('81 1234 5678'),'528112345678');
assert.equal(normalizeWhatsAppPhone('+52 1 81 1234 5678'),'528112345678');
assert.equal(normalizeWhatsAppPhone('+1 (202) 555-0123'),'12025550123');
assert.throws(()=>normalizeWhatsAppPhone('8112 ext 3'));assert.throws(()=>normalizeWhatsAppPhone('123'));assert.throws(()=>normalizeWhatsAppPhone('+52 123'));
const payments=[{period:'2026-09',groupId:'one',amount:100,paid:120,extraAmount:50,extraDescription:'Cena'},
 {period:'2026-08',amount:0,paid:1000,extraFees:[{id:'closed',description:'Perdonada',amount:2000,paid:1000,forgiven:true}]},
 {period:'2026-12',amount:999,paid:0}, {period:'2026-09',groupId:'other',amount:999,paid:0}] as Payment[];
const reminder=debtReminder(payments,'one','2026-10');assert.equal(reminder.total,30);assert.deepEqual(reminder.periods,['2026-09']);
const message=whatsappMessage(user,'Logia Uno',reminder,'Referencia: José & Logia');assert.ok(message.includes('José Ríos'));assert.ok(message.includes('Cena'));assert.ok(!message.includes('Perdonada'));assert.ok(message.includes(reminder.body));
const url=whatsappChatUrl('8112345678',message);assert.ok(url.startsWith('https://wa.me/528112345678?text='));assert.equal(new URL(url).searchParams.get('text'),message);
assert.equal(currentReminderPeriod(new Date('2026-11-01T02:00:00Z')),'2026-10','billing month follows Monterrey, not UTC');
assert.throws(()=>whatsappMessage(user,'Logia',{rows:[],periods:[],body:'',total:0}));
console.log('WhatsApp tests passed: admin-only roles, phones, personalized direct chat, consent prerequisites, debt/legacy/forgiven/group/month isolation.');
