import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.mjs';
import {roomAction,roomSnapshot} from '../server/rooms.mjs';
test('自习室今日排名：跨日切分、并列、零时长、退出与房间隔离',()=>{
 const db=openDatabase(':memory:'),realNow=Date.now;
 try{
  Date.now=()=>Date.parse('2026-10-20T12:00:00+08:00');
  for(let id=2;id<=6;id++)db.prepare('INSERT INTO users(id,nickname) VALUES(?,?)').run(id,'同学'+id);
  const room=roomAction(db,{id:2},'create',{name:'阳光教室'});
  for(const id of [3,4,5])roomAction(db,{id},'join',{code:room.invite_code});
  roomAction(db,{id:6},'create',{name:'其他房间'});
  const add=(id,duration,start,finish,status='completed')=>db.prepare("INSERT INTO sessions(user_id,task_title,duration,status,started_at,finished_at) VALUES(?,'私密任务',?,?,?,?)").run(id,duration,status,start,finish);
  add(2,540,'2026-10-19T23:53:00+08:00','2026-10-20T00:02:00+08:00');
  add(3,120,'2026-10-20T10:00:00+08:00','2026-10-20T10:02:00+08:00');
  add(4,60,'2026-10-20T10:00:00+08:00','2026-10-20T10:01:00+08:00');
  add(5,3600,'2026-10-19T10:00:00+08:00','2026-10-19T11:00:00+08:00');
  add(6,3600,'2026-10-20T10:00:00+08:00','2026-10-20T11:00:00+08:00');
  let snapshot=roomSnapshot(db,2);
  assert.equal(snapshot.ranking_day,'2026-10-20');
  assert.deepEqual(snapshot.leaderboard.map(m=>[m.id,m.seconds,m.rank]),[[2,120,1],[3,120,1],[4,60,3],[5,0,null]]);
  assert.ok(!JSON.stringify(snapshot).includes('私密任务'));
  roomAction(db,{id:3},'leave',{});
  assert.deepEqual(roomSnapshot(db,2).leaderboard.map(m=>m.id),[2,4,5]);
  assert.equal(roomSnapshot(db,3),null);
 }finally{Date.now=realNow;db.close();}
});
