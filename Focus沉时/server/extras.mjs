import {httpError} from './auth.mjs';
import {studyDay} from './study.mjs';
const clean=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw httpError(400,`请输入 1–${max} 个字符`);return value.trim();};
export function validDate(value){return typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function countdownList(db,id){return db.prepare('SELECT id,title,target_date FROM countdowns WHERE user_id=? ORDER BY target_date,id').all(id);}
export function extraRoute(db,user,path,method,body){
 const id=user.id;
 if(path==='/api/countdowns'&&method==='POST'){
  const title=clean(body.title,30);if(!validDate(body.target_date))throw httpError(400,'请输入有效日期（2000–2099 年）');
  if(db.prepare('SELECT count(*) n FROM countdowns WHERE user_id=?').get(id).n>=10)throw httpError(409,'最多保存 10 个重要日期，请先删除不需要的日期');
  const r=db.prepare('INSERT INTO countdowns(user_id,title,target_date) VALUES(?,?,?)').run(id,title,body.target_date);return {id:Number(r.lastInsertRowid)};
 }
 const countdown=path.match(/^\/api\/countdowns\/(\d+)$/);
 if(countdown&&['PATCH','DELETE'].includes(method)){
  if(!db.prepare('SELECT id FROM countdowns WHERE id=? AND user_id=?').get(+countdown[1],id))throw httpError(404,'倒计时不存在');
  if(method==='DELETE')db.prepare('DELETE FROM countdowns WHERE id=? AND user_id=?').run(+countdown[1],id);
  else{const title=clean(body.title,30);if(!validDate(body.target_date))throw httpError(400,'日期无效');db.prepare('UPDATE countdowns SET title=?,target_date=? WHERE id=? AND user_id=?').run(title,body.target_date,+countdown[1],id);}
  return {ok:true};
 }
 if(path==='/api/wishes'&&method==='GET'){
  const project=row=>({id:row.id,content:row.content,author:row.anonymous?'匿名同学':row.nickname,mine:row.user_id===id,fulfilled:!!row.fulfilled,created_at:row.created_at});
  const feed=db.prepare('SELECT w.*,u.nickname FROM wishes w JOIN users u ON u.id=w.user_id WHERE NOT EXISTS(SELECT 1 FROM wish_reports r WHERE r.wish_id=w.id AND r.user_id=?) ORDER BY w.id DESC LIMIT 60').all(id).map(project);
  const mine=db.prepare('SELECT w.*,u.nickname FROM wishes w JOIN users u ON u.id=w.user_id WHERE w.user_id=? ORDER BY w.id DESC LIMIT 30').all(id).map(project);
  return {wishes:feed,mine};
 }
 if(path==='/api/wishes'&&method==='POST'){
  if(body.public_ack!==true)throw httpError(400,'发布前请确认愿望将对所有登录用户公开');
  const content=clean(body.content,100);if(typeof body.anonymous!=='boolean')throw httpError(400,'匿名选项格式错误');
  const last=db.prepare('SELECT posted_at FROM wish_posts WHERE user_id=? ORDER BY posted_at DESC LIMIT 1').get(id);
  if(last&&Date.now()-Date.parse(last.posted_at)<30000)throw httpError(429,'愿望正在飞向星空，请 30 秒后再发布');
  if(db.prepare("SELECT count(*) n FROM wish_posts WHERE user_id=? AND date(posted_at,'+8 hours')=?").get(id,studyDay()).n>=5)throw httpError(429,'每天最多发布 5 条愿望，明天再来吧');
  const stamp=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
  try{const r=db.prepare('INSERT INTO wishes(user_id,content,anonymous,created_at) VALUES(?,?,?,?)').run(id,content,Number(body.anonymous),stamp);db.prepare('INSERT INTO wish_posts(user_id,posted_at) VALUES(?,?)').run(id,stamp);db.prepare('DELETE FROM wish_posts WHERE posted_at<?').run(new Date(Date.now()-3*86400000).toISOString());db.exec('COMMIT');return {id:Number(r.lastInsertRowid)};}catch(error){db.exec('ROLLBACK');throw error;}
 }
 const wish=path.match(/^\/api\/wishes\/(\d+)(\/report)?$/);
 if(wish){
  const row=db.prepare('SELECT * FROM wishes WHERE id=?').get(+wish[1]);if(!row)throw httpError(404,'愿望不存在');
  if(wish[2]&&method==='POST'){if(row.user_id===id)throw httpError(400,'自己的愿望可以直接删除');db.prepare('INSERT OR IGNORE INTO wish_reports(wish_id,user_id) VALUES(?,?)').run(row.id,id);return {ok:true};}
  if(!wish[2]&&['PATCH','DELETE'].includes(method)){
   if(row.user_id!==id)throw httpError(404,'愿望不存在');
   if(method==='DELETE')db.prepare('DELETE FROM wishes WHERE id=? AND user_id=?').run(row.id,id);
   else{if(typeof body.fulfilled!=='boolean')throw httpError(400,'还愿状态格式错误');db.prepare('UPDATE wishes SET fulfilled=? WHERE id=? AND user_id=?').run(Number(body.fulfilled),row.id,id);}
   return {ok:true};
  }
 }
 return undefined;
}
