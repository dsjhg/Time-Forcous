import { randomBytes } from 'node:crypto';
import { httpError } from './auth.mjs';
import { insights } from './insights.mjs';
import { studyDay } from './study.mjs';
export function roomSnapshot(db,userId){
 const room=db.prepare('SELECT r.* FROM rooms r JOIN room_members m ON r.id=m.room_id WHERE m.user_id=?').get(userId);
 if(!room)return null;
 const now=Date.now();
 const members=db.prepare(`SELECT u.id,u.nickname,m.last_seen,m.joined_at,s.status AS focus_status FROM room_members m JOIN users u ON u.id=m.user_id LEFT JOIN sessions s ON s.user_id=u.id AND s.status IN ('running','paused') WHERE m.room_id=? ORDER BY m.joined_at,u.id`).all(room.id);
 const ranking_day=studyDay();
 const leaderboard=members.map(m=>({id:m.id,nickname:m.nickname,seconds:Math.floor(insights(db,m.id,'day',ranking_day).total_seconds)})).sort((a,b)=>b.seconds-a.seconds||a.id-b.id);
 let rank=0;leaderboard.forEach((m,i)=>{if(!i||m.seconds!==leaderboard[i-1].seconds)rank=i+1;m.rank=m.seconds?rank:null;});
 return {...room,ranking_day,leaderboard,members:members.map(m=>({id:m.id,nickname:m.nickname,online:now-m.last_seen<90000,focus_status:m.focus_status||'idle'})),server_time:now};
}
export function roomAction(db,user,action,body){
 const current=()=>db.prepare('SELECT * FROM room_members WHERE user_id=?').get(user.id);
 db.exec('BEGIN IMMEDIATE');
 try{
  if(action==='create'){
   if(current())throw httpError(409,'请先退出当前自习室');
   if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>30)throw httpError(400,'自习室名称为 1–30 个字符');
   const code=randomBytes(5).toString('hex').toUpperCase();
   const result=db.prepare('INSERT INTO rooms(owner_id,name,invite_code) VALUES(?,?,?)').run(user.id,body.name.trim(),code);
   db.prepare('INSERT INTO room_members VALUES(?,?,?,?)').run(user.id,Number(result.lastInsertRowid),Date.now(),Date.now());
  }else if(action==='join'){
   if(typeof body.code!=='string'||! /^[A-F0-9]{10}$/i.test(body.code.trim()))throw httpError(400,'请输入 10 位邀请码');
   const room=db.prepare('SELECT * FROM rooms WHERE invite_code=?').get(body.code.trim().toUpperCase());if(!room)throw httpError(404,'自习室不存在');
   const member=current();if(member&&member.room_id!==room.id)throw httpError(409,'请先退出当前自习室');
   if(!member){if(db.prepare('SELECT count(*) AS n FROM room_members WHERE room_id=?').get(room.id).n>=room.capacity)throw httpError(409,'自习室已满');db.prepare('INSERT INTO room_members VALUES(?,?,?,?)').run(user.id,room.id,Date.now(),Date.now());}
  }else if(action==='heartbeat'){
   if(!current())throw httpError(404,'你还没有加入自习室');db.prepare('UPDATE room_members SET last_seen=? WHERE user_id=?').run(Date.now(),user.id);
  }else if(action==='leave'){
   const member=current();if(!member)throw httpError(404,'你还没有加入自习室');
   db.prepare('DELETE FROM room_members WHERE user_id=?').run(user.id);
   const next=db.prepare('SELECT user_id FROM room_members WHERE room_id=? ORDER BY joined_at,user_id LIMIT 1').get(member.room_id);
   if(!next)db.prepare('DELETE FROM rooms WHERE id=?').run(member.room_id);
   else db.prepare('UPDATE rooms SET owner_id=? WHERE id=? AND owner_id=?').run(next.user_id,member.room_id,user.id);
  }else throw httpError(404,'自习室操作不存在');
  db.exec('COMMIT');return roomSnapshot(db,user.id);
 }catch(error){db.exec('ROLLBACK');throw error;}
}
