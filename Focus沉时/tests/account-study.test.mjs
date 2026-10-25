import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/index.mjs';
import {studyDay,studySummary} from '../server/study.mjs';

async function fixture(env={NODE_ENV:'production'}){
 const db=openDatabase(':memory:');const server=createApp(db,{env});server.listen(0,'127.0.0.1');await once(server,'listening');
 const call=async(path,data,token,method='POST')=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:res.status,body:await res.json()};};
 const register=async account=>{const r=await call('/auth/register',{account,password:'test-pass-123',nickname:account});assert.equal(r.status,200);return r.body;};
 return {db,call,register,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}};
}
test('正式自主账号无需开发开关：注册、校验、重复注册、密码验证、修改后全端撤销',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('/auth/dev',{account:'alice',password:'test-pass-123'})).status,404);
  assert.equal((await f.call('/auth/register',{account:'中文',password:'test-pass-123'})).status,400);
  assert.equal((await f.call('/auth/register',{account:'alice',password:'123'})).status,400);
  const a=await f.register('alice');
  const hash=f.db.prepare('SELECT password_hash FROM users WHERE id=?').get(a.user.id).password_hash;
  assert.match(hash,/^[a-f0-9]{32}:[a-f0-9]{128}$/);assert.ok(!hash.includes('test-pass-123'));assert.ok(!JSON.stringify(a).includes('password_hash'));
  assert.equal((await f.call('/auth/register',{account:'alice',password:'other-pass-123'})).status,409);
  assert.equal((await f.call('/auth/password',{account:'alice',password:'wrong-pass-123'})).status,401);
  assert.equal((await f.call('/auth/password',{account:'missing',password:'wrong-pass-123'})).status,401);
  const b=await f.call('/auth/password',{account:'alice',password:'test-pass-123'});assert.equal(b.status,200);assert.equal(b.body.user.id,a.user.id);
  assert.equal((await f.call('/me/password',{old_password:'wrong-pass-123',new_password:'new-pass-456'},a.token)).status,400);
  assert.equal((await f.call('/me/password',{old_password:'test-pass-123',new_password:'new-pass-456'},a.token)).status,200);
  for(const token of [a.token,b.body.token])assert.equal((await f.call('/state',undefined,token,'GET')).status,401);
  assert.equal((await f.call('/auth/password',{account:'alice',password:'test-pass-123'})).status,401);
  assert.equal((await f.call('/auth/password',{account:'alice',password:'new-pass-456'})).status,200);
 }finally{await f.close();}
});
test('兼容原有开发账号，并发注册只能创建一个账号',async()=>{
 const f=await fixture({ENABLE_DEV_LOGIN:'true'});try{
  const a=await f.call('/auth/dev',{account:'legacy',password:'test-pass-123'});
  const b=await f.call('/auth/password',{account:'legacy',password:'test-pass-123'});assert.equal(b.status,200);assert.equal(b.body.user.id,a.body.user.id);
  const results=await Promise.all([1,2].map(()=>f.call('/auth/register',{account:'raceuser',password:'test-pass-123'})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 }finally{await f.close();}
});
test('目标、打卡与手记按用户隔离；打卡幂等且不能指定日期',async()=>{
 const f=await fixture();try{
  const a=await f.register('alice'),b=await f.register('bob');
  assert.equal((await f.call('/journal',{content:'未登录'})).status,401);
  assert.equal((await f.call('/settings',{daily_goal:120},a.token,'PUT')).status,200);
  for(const daily_goal of [0,721,1.5,'100'])assert.equal((await f.call('/settings',{daily_goal},a.token,'PUT')).status,400);
  for(let i=0;i<2;i++)assert.equal((await f.call('/checkins',{day:'2000-01-01',user_id:b.user.id},a.token)).status,200);
  const day=studyDay();assert.deepEqual({...f.db.prepare('SELECT user_id,day FROM checkins').get()},{user_id:a.user.id,day});
  assert.equal((await f.call('/journal',{content:'只属于 Alice 的复盘',user_id:b.user.id},a.token,'PUT')).status,200);
  assert.equal((await f.call('/journal',{content:'字'.repeat(1001)},a.token,'PUT')).status,400);
  assert.equal((await f.call('/journal',{content:123},a.token,'PUT')).status,400);
  const sa=(await f.call('/state',undefined,a.token,'GET')).body,sb=(await f.call('/state',undefined,b.token,'GET')).body;
  assert.equal(sa.settings.daily_goal,120);assert.equal(sa.settings.focus_minutes,25);assert.equal(sa.study.checkin_count,1);assert.equal(sa.study.streak,1);assert.equal(sa.study.journal,'只属于 Alice 的复盘');
  assert.equal(sb.settings.daily_goal,100);assert.equal(sb.study.checked_in,false);assert.equal(sb.study.journal,'');assert.equal(sb.study.journals.length,0);
  const yesterday=new Date(day+'T00:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);
  f.db.prepare('INSERT INTO checkins(user_id,day) VALUES(?,?)').run(a.user.id,yesterday.toISOString().slice(0,10));assert.equal(studySummary(f.db,a.user.id).streak,2);
  assert.equal((await f.call('/journal',{content:''},a.token,'PUT')).status,200);assert.equal(studySummary(f.db,a.user.id).journal,'');
 }finally{await f.close();}
});
test('完整累计不受 500 条历史上限影响，今日统计采用北京时间',()=>{
 const db=openDatabase(':memory:');try{
  const day=studyDay();const before=new Date(day+'T00:00:00Z').getTime()-8*3600000;
  const insert=db.prepare("INSERT INTO sessions(task_title,duration,status,started_at,finished_at,user_id) VALUES('专注',60,'completed',?,?,1)");
  for(let i=0;i<501;i++)insert.run(new Date(before).toISOString(),new Date(before).toISOString());
  insert.run(new Date(before-1).toISOString(),new Date(before-1).toISOString());
  const summary=studySummary(db,1);assert.equal(summary.total_count,502);assert.equal(summary.today_count,501);assert.equal(summary.total_minutes,502);assert.equal(summary.today_minutes,501);
 }finally{db.close();}
});
test('V2 自动备份升级且保留账号，V3 重启保留打卡手记与目标',()=>{
 const directory=mkdtempSync(join(tmpdir(),'tomato-v3-'));const path=join(directory,'test.sqlite');
 try{
  let db=openDatabase(path);db.exec('ALTER TABLE sessions DROP COLUMN timer_mode;ALTER TABLE user_settings DROP COLUMN early_deadline;DROP TABLE focus_segments;DROP TABLE early_checkins;ALTER TABLE tasks DROP COLUMN planned_minutes;DROP TABLE checkins;DROP TABLE journals;ALTER TABLE user_settings DROP COLUMN daily_goal;PRAGMA user_version=2;');
  db.prepare('INSERT INTO users(dev_account,nickname) VALUES(?,?)').run('olduser','原用户');db.close();
  db=openDatabase(path);assert.equal(db.prepare('PRAGMA user_version').get().user_version,6);assert.equal(db.prepare('SELECT nickname FROM users WHERE dev_account=?').get('olduser').nickname,'原用户');
  db.prepare('INSERT INTO checkins VALUES(1,?,?)').run(studyDay(),new Date().toISOString());db.prepare('INSERT INTO journals VALUES(1,?,?,?)').run(studyDay(),'重启后依然在',new Date().toISOString());db.exec('UPDATE user_settings SET daily_goal=150 WHERE user_id=1');db.close();
  db=openDatabase(path);assert.equal(studySummary(db,1).journal,'重启后依然在');assert.equal(studySummary(db,1).checkin_count,1);assert.equal(db.prepare('SELECT daily_goal FROM user_settings WHERE user_id=1').get().daily_goal,150);db.close();
  assert.ok(readdirSync(directory).some(n=>n.includes('.v2-backup-')));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
