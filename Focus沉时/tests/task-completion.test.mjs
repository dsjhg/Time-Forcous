import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/index.mjs';
test('任务累计达标自动完成，延长目标后恢复，拒绝直接撤销达标状态',async()=>{
 const db=openDatabase(':memory:'),server=createApp(db,{env:{NODE_ENV:'production'}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 let token='';
 const call=async(path,method='GET',body)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 try{
  const auth=(await call('/auth/register','POST',{account:'completion_test',password:'test-pass-123'})).data;token=auth.token;
  const task=(await call('/tasks','POST',{title:'阅读',planned_minutes:10})).data;
  db.prepare("INSERT INTO sessions(user_id,task_id,task_title,duration,status,started_at,finished_at) VALUES(?,?,'阅读',600,'completed',?,?)").run(auth.user.id,task.id,new Date(Date.now()-600000).toISOString(),new Date().toISOString());
  const state=async()=>(await call('/state')).data.tasks.find(t=>t.id===task.id);
  assert.equal((await state()).completed,1);
  assert.equal((await call('/tasks/'+task.id,'PATCH',{completed:false})).status,409);
  await call('/tasks/'+task.id,'PATCH',{planned_minutes:11});assert.equal((await state()).completed,0);
  await call('/tasks/'+task.id,'PATCH',{planned_minutes:9});assert.equal((await state()).completed,1);
  assert.equal((await call('/tasks/'+task.id,'PATCH',{planned_minutes:10,completed:false})).status,409);
  await call('/tasks/'+task.id,'PATCH',{planned_minutes:20,completed:false});assert.equal((await state()).completed,0);
  await call('/tasks/'+task.id,'PATCH',{completed:true});assert.equal((await state()).completed,1);
  await call('/tasks/'+task.id,'PATCH',{completed:false});assert.equal((await state()).completed,0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();}
});
