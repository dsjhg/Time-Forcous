import {test} from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {openDatabase} from '../server/database.mjs';import {createApp} from '../server/index.mjs';import {insights,periodBounds} from '../server/insights.mjs';import {studyDay} from '../server/study.mjs';
test('正计时暂停恢复、按真实秒数保存、达到计划自动完成、早起截止可定制且保留旧值',async()=>{
 const db=openDatabase(':memory:'),server=createApp(db,{env:{NODE_ENV:'production'}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const call=async(path,token,method='GET',body)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 try{
 const a=(await call('/auth/register','', 'POST',{account:'new_timer',password:'test-pass-123'})).data,b=(await call('/auth/register','', 'POST',{account:'other_timer',password:'test-pass-123'})).data;
 const task=(await call('/tasks',a.token,'POST',{title:'一分钟任务',planned_minutes:1})).data;
 assert.equal((await call('/sessions',a.token,'POST',{timer_mode:'invalid'})).status,400);
 const session=(await call('/sessions',a.token,'POST',{timer_mode:'up',task_id:task.id})).data;
 db.prepare('UPDATE sessions SET running_since=? WHERE id=?').run(Date.now()-61000,session.id);
 assert.equal((await call('/sessions/pause',a.token,'POST',{session_id:session.id})).status,200);
 assert.equal((await call('/sessions/resume',a.token,'POST',{session_id:session.id})).status,200);
 assert.equal((await call('/sessions/complete',a.token,'POST',{session_id:session.id})).status,200);
 const state=(await call('/state',a.token)).data;assert.equal(state.tasks[0].completed,1);assert.ok(state.history[0].duration>=61&&state.history[0].duration<65);assert.equal(state.study.total_count,1);
 assert.equal((await call('/sessions/complete',a.token,'POST',{session_id:session.id})).status,409);
 for(const early_deadline of ['24:00','09:60','invalid'])assert.equal((await call('/settings',a.token,'PUT',{early_deadline})).status,400);
 assert.equal((await call('/settings',a.token,'PUT',{early_deadline:'23:59'})).status,200);
 assert.equal((await call('/checkins/early',a.token,'POST',{})).status,200);
 assert.equal((await call('/checkins/early',a.token,'POST',{})).status,200);
 assert.equal((await call('/settings',a.token,'PUT',{early_deadline:'08:30'})).status,200);
 const calendar=(await call('/checkins/calendar',a.token)).data;assert.equal(calendar.early.length,1);assert.equal(calendar.early[0].deadline,'23:59');assert.equal(calendar.regular.length,0);assert.equal(calendar.records[0].kind,'early');assert.equal(calendar.records[0].checked_at,calendar.early[0].checked_at);
 assert.equal((await call('/checkins/calendar',b.token)).data.early.length,0);
 assert.equal((await call('/insights?period=day',b.token)).data.count,0);
 assert.equal((await call('/insights?period=year',a.token)).status,400);
 assert.equal((await call('/settings',b.token)).status,404);
 // Clock-dependent rejection uses an injected test clock, never the system clock.
 const realNow=Date.now,fakeNow=Date.parse(studyDay()+'T10:00:00+08:00');try{Date.now=()=>fakeNow;assert.equal((await call('/checkins/early',b.token,'POST',{} )).status,200);assert.equal((await call('/checkins/calendar',b.token)).data.early.length,0);assert.equal((await call('/checkins/calendar',b.token)).data.regular.length,1);await call('/settings',b.token,'PUT',{early_deadline:'23:59'});await call('/checkins',b.token,'POST',{});assert.equal((await call('/checkins/calendar',b.token)).data.early.length,0);}finally{Date.now=realNow;}
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();}
});
test('统计日周月、跨月周、闰月、暂停时段、同名不同任务与超过500条',()=>{
 const db=openDatabase(':memory:');try{
 assert.deepEqual(periodBounds('week','2026-11-01'),{start:'2026-10-26',end:'2026-11-02',length:7});assert.equal(periodBounds('month','2028-02-02').length,29);assert.deepEqual(periodBounds('week','2026-10-19'),{start:'2026-10-13',end:'2026-10-20',length:7});
 assert.throws(()=>periodBounds('day','2026-02-30'));
 const add=(title,duration,start,finish,task=null)=>Number(db.prepare("INSERT INTO sessions(user_id,task_id,task_title,duration,status,started_at,finished_at) VALUES(1,?,?,?,'completed',?,?)").run(task,title,duration,start,finish).lastInsertRowid);
 const id=add('阅读',1200,'2026-10-19T07:50:00+08:00','2026-10-19T09:10:00+08:00');
 for(const [start,end]of [['2026-10-19T07:50:00+08:00','2026-10-19T08:00:00+08:00'],['2026-10-19T09:00:00+08:00','2026-10-19T09:10:00+08:00']])db.prepare('INSERT INTO focus_segments(session_id,started_at,ended_at) VALUES(?,?,?)').run(id,Date.parse(start),Date.parse(end));
 let r=insights(db,1,'day','2026-10-19');assert.equal(r.total_seconds,1200);assert.equal(r.count,1);assert.equal(r.hourly[7].seconds,600);assert.equal(r.hourly[8].seconds,0);assert.equal(r.hourly[9].seconds,600);assert.equal(r.approximate,false);assert.equal(r.longest.task,'阅读');
 for(let i=0;i<501;i++)add('练习',60,'2026-10-19T12:00:00+08:00','2026-10-19T12:01:00+08:00');
 r=insights(db,1,'week','2026-10-19');assert.equal(r.count,502);assert.equal(r.total_seconds,31260);assert.equal(r.daily.reduce((n,d)=>n+d.seconds,0),31260);assert.equal(r.tasks.reduce((n,d)=>n+d.seconds,0),31260);
 assert.equal(insights(db,1,'month','2026-09-01').total_seconds,0);
 }finally{db.close();}
});
