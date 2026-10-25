import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/index.mjs';
import {hashToken} from '../server/auth.mjs';
async function fixture(options={}){
 const db=openDatabase(':memory:');const server=createApp(db,{env:{ENABLE_DEV_LOGIN:'true'},...options});server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,method='GET',data,token)=>{const response=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,body:await response.json()};};
 const user=async(account)=>{const r=await call('/auth/dev','POST',{account,password:'test-password-123'});assert.equal(r.status,200);return r.body;};
 return {db,server,url,call,user,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}};
}
test('多用户隔离、并行计时、过期令牌、历史和设置',async()=>{
 const f=await fixture();try{
  const {call,db}=f;assert.equal((await call('/state')).status,401);
  const a=await f.user('alice'),b=await f.user('bob');assert.notEqual(a.user.id,b.user.id);
  const task=(await call('/tasks','POST',{title:'Alice 的私人任务',estimate:2,user_id:b.user.id},a.token)).body;
  assert.equal((await call('/state','GET',undefined,b.token)).body.tasks.length,0);
  for(const method of ['PATCH','DELETE'])assert.equal((await call('/tasks/'+task.id,method,{title:'偷改'},b.token)).status,404);
  assert.equal((await call('/sessions','POST',{task_id:task.id},b.token)).status,404);
  assert.equal((await call('/settings','PUT',{focus_minutes:1,break_minutes:2},a.token)).status,200);
  assert.equal((await call('/me','PUT',{nickname:'Alice同学'},a.token)).status,200);
  assert.equal((await call('/tasks/'+task.id,'PUT',{estimate:3},a.token)).status,200);
  assert.equal((await call('/tasks/'+task.id,'PUT',{title:'越权修改'},b.token)).status,404);
  assert.equal((await call('/state','GET',undefined,b.token)).body.settings.focus_minutes,25);
  const [sa,sb]=await Promise.all([call('/sessions','POST',{task_id:task.id},a.token),call('/sessions','POST',{},b.token)]);assert.equal(sa.status,201);assert.equal(sb.status,201);
  const actions=(action,id=sa.body.id)=>call('/sessions/'+action,'POST',{session_id:id},a.token);
  assert.equal((await actions('pause',sb.body.id)).status,409);
  assert.equal((await actions('complete')).status,409);
  assert.equal((await call('/sessions','POST',{},a.token)).status,409);
  assert.equal((await call('/tasks/'+task.id,'DELETE',{},a.token)).status,409);
  assert.equal((await actions('pause')).status,200);assert.equal((await actions('pause')).status,409);
  assert.equal((await call('/state','GET',undefined,a.token)).body.session.status,'paused');
  assert.equal((await actions('resume')).status,200);
  db.prepare('UPDATE sessions SET running_since=? WHERE id=?').run(Date.now()-61000,sa.body.id);
  const complete=await Promise.all([actions('complete'),actions('complete')]);assert.deepEqual(complete.map(r=>r.status).sort(),[200,409]);
  assert.equal((await call('/tasks/'+task.id,'DELETE',{},a.token)).status,200);
  const state=(await call('/state','GET',undefined,a.token)).body;assert.equal(state.history.length,1);assert.equal(state.history[0].task_title,'Alice 的私人任务');assert.equal(state.history[0].task_id,null);
  assert.equal((await call('/state','GET',undefined,b.token)).body.history.length,0);
  assert.equal((await call('/sessions/cancel','POST',{session_id:sb.body.id},b.token)).status,200);
  const bad=await call('/auth/dev','POST',{account:'alice',password:'wrong-password'});assert.equal(bad.status,401);
  await call('/auth/logout','POST',{},a.token);assert.equal((await call('/state','GET',undefined,a.token)).status,401);
  db.prepare('UPDATE auth_tokens SET expires_at=0 WHERE hash=?').run(hashToken(b.token));assert.equal((await call('/state','GET',undefined,b.token)).status,401);
 }finally{await f.close();}
});
test('自习室成员隔离、重复加入、状态同步、离线判定和房主交接',async()=>{
 const f=await fixture();try{
  const a=await f.user('alice'),b=await f.user('bob'),c=await f.user('carol');const call=(p,d,t)=>f.call(p,'POST',d,t);
  const created=(await call('/rooms/create',{name:'一起学习'},a.token)).body.room;assert.equal(created.members.length,1);
  assert.equal((await call('/rooms/create',{name:'重复房间'},a.token)).status,409);
  assert.equal((await f.call('/rooms/current','GET',undefined,c.token)).body.room,null);
  assert.equal((await call('/rooms/heartbeat',{},c.token)).status,404);
  assert.equal((await call('/rooms/join',{code:'FFFFFFFFFF'},b.token)).status,404);
  const join=await Promise.all([call('/rooms/join',{code:created.invite_code},b.token),call('/rooms/join',{code:created.invite_code},b.token)]);assert.ok(join.every(r=>r.status===200));
  await call('/tasks',{title:'不能公开的任务'},a.token);const task=(await f.call('/state','GET',undefined,a.token)).body.tasks[0];
  await call('/sessions',{task_id:task.id},a.token);
  const snapshot=(await f.call('/rooms/current','GET',undefined,b.token)).body.room;assert.equal(snapshot.members.length,2);assert.equal(snapshot.members.find(m=>m.id===a.user.id).focus_status,'running');assert.ok(!JSON.stringify(snapshot).includes('不能公开的任务'));assert.ok(!JSON.stringify(snapshot).includes('openid'));
  f.db.prepare('UPDATE room_members SET last_seen=? WHERE user_id=?').run(Date.now()-100000,a.user.id);
  assert.equal((await f.call('/rooms/current','GET',undefined,b.token)).body.room.members.find(m=>m.id===a.user.id).online,false);
  await call('/rooms/heartbeat',{},a.token);assert.equal((await f.call('/rooms/current','GET',undefined,b.token)).body.room.members.find(m=>m.id===a.user.id).online,true);
  f.db.prepare('UPDATE rooms SET capacity=2 WHERE id=?').run(created.id);assert.equal((await call('/rooms/join',{code:created.invite_code},c.token)).status,409);
  await call('/rooms/leave',{},a.token);assert.equal((await f.call('/rooms/current','GET',undefined,b.token)).body.room.owner_id,b.user.id);
  await call('/rooms/leave',{},b.token);assert.equal(f.db.prepare('SELECT count(*) AS n FROM rooms').get().n,0);
 }finally{await f.close();}
});
test('微信身份只来自服务端兑换、生产关闭开发登录、参数和 Origin 校验',async()=>{
 const f=await fixture({env:{NODE_ENV:'production',ENABLE_DEV_LOGIN:'true',WECHAT_APP_ID:'test-app',WECHAT_APP_SECRET:'test-secret'},exchangeWechatCode:async code=>code==='valid'?{openid:'real-openid',session_key:'never-return'}:{errcode:40029}});
 try{
  assert.equal((await f.call('/auth/dev','POST',{account:'alice',password:'password'})).status,404);
  assert.equal((await f.call('/auth/wechat','POST',{code:'invalid',openid:'forged'})).status,401);
  const result=await f.call('/auth/wechat','POST',{code:'valid',openid:'forged'});assert.equal(result.status,200);assert.ok(!JSON.stringify(result).includes('never-return'));
  const twice=await f.call('/auth/wechat','POST',{code:'valid'});assert.equal(twice.body.user.id,result.body.user.id);
  assert.equal((await f.call('/tasks','POST',{title:' '},result.body.token)).status,400);
  assert.equal((await f.call('/settings','PATCH',{focus_minutes:0,break_minutes:5},result.body.token)).status,400);
  const cors=await fetch(f.url+'/api/state',{headers:{Origin:'http://evil.example',Authorization:'Bearer '+result.body.token}});assert.equal(cors.status,403);
 }finally{await f.close();}
});
test('SQLite 重启持久化和迁移幂等，旧数据不归属新登录用户',()=>{
 const directory=mkdtempSync(join(tmpdir(),'tomato-migration-'));const path=join(directory,'test.sqlite');
 try{let db=openDatabase(path);db.prepare('INSERT INTO tasks(title,user_id) VALUES(?,1)').run('保留旧数据');db.close();db=openDatabase(path);assert.equal(db.prepare('PRAGMA user_version').get().user_version,6);assert.equal(db.prepare('SELECT title FROM tasks').get().title,'保留旧数据');assert.equal(db.prepare('SELECT openid FROM users WHERE id=1').get().openid,null);db.close();}finally{rmSync(directory,{recursive:true,force:true});}
});
test('真实 V1 数据库迁移保留记录并生成备份',()=>{
 const directory=mkdtempSync(join(tmpdir(),'tomato-v1-'));const path=join(directory,'test.sqlite');
 try{
  let db=new DatabaseSync(path);
  db.exec(`CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT NOT NULL,estimate INTEGER NOT NULL DEFAULT 1,completed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE sessions(id INTEGER PRIMARY KEY,task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,task_title TEXT NOT NULL,duration INTEGER NOT NULL,elapsed INTEGER NOT NULL DEFAULT 0,running_since INTEGER,status TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT);
  CREATE UNIQUE INDEX one_active_session ON sessions((1)) WHERE status IN ('running','paused');
  CREATE TABLE settings(id INTEGER PRIMARY KEY,focus_minutes INTEGER,break_minutes INTEGER);
  INSERT INTO settings VALUES(1,40,10);INSERT INTO tasks(title) VALUES('旧版任务');PRAGMA user_version=1;`);db.close();
  db=openDatabase(path);assert.equal(db.prepare('SELECT user_id FROM tasks').get().user_id,1);assert.equal(db.prepare('SELECT focus_minutes FROM user_settings WHERE user_id=1').get().focus_minutes,40);db.close();
  assert.ok(readdirSync(directory).some(name=>name.includes('.v1-backup-')));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
