import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve,extname,sep } from 'node:path';
import { openDatabase } from './database.mjs';
import { createAuth,httpError } from './auth.mjs';
import { roomSnapshot,roomAction } from './rooms.mjs';
import { studyDay,studySummary } from './study.mjs';
import { countdownList,extraRoute } from './extras.mjs';
import {insights,checkinCalendar} from './insights.mjs';
import { serveAudio } from './media.mjs';

const root=resolve(fileURLToPath(new URL('../miniapp/dist/build/h5/',import.meta.url)));
export function createApp(db,options={}){
 const auth=createAuth(db,options);const env=options.env||process.env;
 const fail=(s,m)=>{throw httpError(s,m);};
 const integer=(v,max,label)=>{if(!Number.isInteger(v)||v<1||v>max)fail(400,`${label}应为 1–${max} 的整数`);return v;};
 const text=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(400,`${label}应为 1–${max} 个字符`);return v.trim();};
 const elapsed=s=>Math.min(s.duration,s.elapsed+(s.running_since?Math.max(0,Math.floor((Date.now()-s.running_since)/1000)):0));
 const active=id=>db.prepare("SELECT * FROM sessions WHERE user_id=? AND status IN ('running','paused')").get(id);
 const requestRates=new Map();
 return http.createServer(async(req,res)=>{
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
   if(path==='/health'&&req.method==='GET')return json(200,{ok:true,version:'0.6.0'});
   if(path.startsWith('/media/audio/'))return await serveAudio(req,res,path);
   if(!path.startsWith('/api/')){
    if(!['GET','HEAD'].includes(req.method))fail(405,'方法不支持');
    const file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));if(!file.startsWith(root+sep))fail(403,'禁止访问');
    res.setHeader('Cache-Control','no-store');
    const content=await readFile(file).catch(()=>fail(404,'请先构建 H5 预览，或使用微信开发者工具打开小程序构建目录'));
    res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.wav':'audio/wav'})[extname(file)]||'application/octet-stream'});return res.end(req.method==='HEAD'?undefined:content);
   }
   const origin=req.headers.origin;const allowed=(env.ALLOWED_ORIGINS||'').split(',').filter(Boolean);
   if(origin&&new URL(origin).host!==req.headers.host){if(!allowed.includes(origin))fail(403,'不允许跨站访问');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type'});return res.end();}
   // 微信请求支持 PUT；将其作为更新接口，保留旧 H5 的 PATCH 兼容性。
   if(req.method==='PUT')req.method='PATCH';
   const ip=req.socket.remoteAddress;const now=Date.now();
   for(const [k,v] of requestRates)if(v.until<now)requestRates.delete(k);
   const budget=requestRates.get(ip)||{n:0,until:now+60000};if(++budget.n>600)fail(429,'请求过于频繁，请稍后再试');requestRates.set(ip,budget);
   let body={};if(['POST','PATCH','DELETE'].includes(req.method)){
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384)fail(413,'请求内容过大');chunks.push(chunk);}
    try{body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};}catch{fail(400,'JSON 格式错误');}
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'请求格式错误');
   }
   const login=path.match(/^\/api\/auth\/(wechat|dev|register|password)$/)?.[1];if(login&&req.method==='POST')return json(200,await auth.login(login,body,ip));
   const user=auth.authenticate(req);const id=user.id;
   if(path==='/api/insights'&&req.method==='GET'){const q=new URL(req.url,'http://localhost').searchParams;return json(200,insights(db,id,q.get('period')||'day',q.get('date')||studyDay()));}
   if(path==='/api/checkins/calendar'&&req.method==='GET'){return json(200,checkinCalendar(db,id,new URL(req.url,'http://localhost').searchParams.get('month')||studyDay().slice(0,7)));}
   if(['/api/checkins','/api/checkins/early'].includes(path)&&req.method==='POST'){
    const instant=Date.now(),local=new Date(instant+8*3600000).toISOString(),day=local.slice(0,10);
    const deadline=db.prepare('SELECT early_deadline FROM user_settings WHERE user_id=?').get(id).early_deadline;
    db.exec('BEGIN IMMEDIATE');try{
     const created=db.prepare('INSERT OR IGNORE INTO checkins(user_id,day,created_at) VALUES(?,?,?)').run(id,day,new Date(instant).toISOString());
     if(created.changes&&local.slice(11,16)<=deadline)db.prepare('INSERT INTO early_checkins VALUES(?,?,?,?)').run(id,day,new Date(instant).toISOString(),deadline);
     db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return json(200,{study:studySummary(db,id)});
   }
   const extra=extraRoute(db,user,path,req.method,body);if(extra!==undefined)return json(200,extra);
   if(path==='/api/me/password'&&req.method==='POST')return json(200,await auth.changePassword(user,body,ip));
   if(path==='/api/journals'&&req.method==='GET'){
    const query=new URL(req.url,'http://localhost').searchParams;const before=query.get('before')||'9999-12-31';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(before))fail(400,'日期格式错误');
    const entries=db.prepare("SELECT day,content FROM journals WHERE user_id=? AND day<? AND content<>'' ORDER BY day DESC LIMIT 21").all(id,before);
    return json(200,{entries:entries.slice(0,20),has_more:entries.length>20});
   }
   if(path==='/api/journal'&&req.method==='PATCH'){
    if(body.day!==undefined&&body.day!==studyDay())fail(409,'日期已更新，请刷新后重新保存；手记草稿仍为你保留。');
    if(typeof body.content!=='string'||body.content.length>1000)fail(400,'手记不能超过 1000 字');
    db.prepare('INSERT INTO journals(user_id,day,content,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at').run(id,studyDay(),body.content.trim(),new Date().toISOString());return json(200,{ok:true});
   }
   if(path==='/api/auth/logout'&&req.method==='POST'){auth.logout(req);return json(200,{ok:true});}
   if(path==='/api/me'&&req.method==='PATCH'){db.prepare('UPDATE users SET nickname=? WHERE id=?').run(text(body.nickname,24,'昵称'),id);return json(200,{ok:true});}
   if(path==='/api/state'&&req.method==='GET'){
    db.prepare("UPDATE tasks SET completed=1 WHERE user_id=? AND completed=0 AND planned_minutes*60<=(SELECT COALESCE(SUM(duration),0) FROM sessions WHERE task_id=tasks.id AND user_id=tasks.user_id AND status='completed')").run(id);
    const s=active(id);return json(200,{user,countdowns:countdownList(db,id),study:studySummary(db,id),tasks:db.prepare("SELECT t.id,t.title,t.estimate,t.planned_minutes,t.completed,t.created_at,COALESCE((SELECT SUM(s.duration)/60 FROM sessions s WHERE s.task_id=t.id AND s.user_id=t.user_id AND s.status='completed'),0) AS focused_minutes FROM tasks t WHERE t.user_id=? ORDER BY t.completed,t.id DESC").all(id),session:s?{...s,elapsed:elapsed(s)}:null,settings:db.prepare('SELECT focus_minutes,break_minutes,daily_goal,early_deadline FROM user_settings WHERE user_id=?').get(id),history:db.prepare("SELECT id,task_id,task_title,duration,finished_at FROM sessions WHERE user_id=? AND status='completed' ORDER BY id DESC LIMIT 500").all(id),room:roomSnapshot(db,id)});
   }
   if(path==='/api/rooms/current'&&req.method==='GET')return json(200,{room:roomSnapshot(db,id)});
   const roomOperation=path.match(/^\/api\/rooms\/(create|join|leave|heartbeat)$/)?.[1];if(roomOperation&&req.method==='POST')return json(200,{room:roomAction(db,user,roomOperation,body)});
   if(path==='/api/tasks'&&req.method==='POST'){
    const result=db.prepare('INSERT INTO tasks(title,estimate,user_id,planned_minutes) VALUES(?,?,?,?)').run(text(body.title,80,'任务名称'),integer(body.estimate??1,20,'预计次数'),id,integer(body.planned_minutes??(body.estimate??1)*25,10080,'预计专注分钟'));return json(201,{id:Number(result.lastInsertRowid)});
   }
   const match=path.match(/^\/api\/tasks\/(\d+)$/);if(match&&['PATCH','DELETE'].includes(req.method)){
    const task=db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(Number(match[1]),id);if(!task)fail(404,'任务不存在');if(active(id)?.task_id===task.id)fail(409,'请先结束该任务的专注');
    if(req.method==='DELETE')db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(task.id,id);
    else{if(body.completed!==undefined&&typeof body.completed!=='boolean')fail(400,'完成状态格式错误');
     const planned=body.planned_minutes===undefined?task.planned_minutes:integer(body.planned_minutes,10080,'预计专注分钟');
     const focused=db.prepare("SELECT COALESCE(SUM(duration),0) AS seconds FROM sessions WHERE task_id=? AND user_id=? AND status='completed'").get(task.id,id).seconds;
     if(body.completed===false&&focused>=planned*60)fail(409,'已达到预计专注时长，请延长预计专注时长后继续完成该任务');
     let completed=body.completed===undefined?task.completed:Number(body.completed);
     if(focused>=planned*60)completed=1;
     else if(body.completed===undefined&&focused>=task.planned_minutes*60&&planned>task.planned_minutes)completed=0;
     db.prepare('UPDATE tasks SET title=?,estimate=?,completed=?,planned_minutes=? WHERE id=? AND user_id=?').run(body.title===undefined?task.title:text(body.title,80,'任务名称'),body.estimate===undefined?task.estimate:integer(body.estimate,20,'预计专注次数'),completed,planned,task.id,id);}
    return json(200,{ok:true});
   }
   if(path==='/api/settings'&&req.method==='PATCH'){const current=db.prepare('SELECT * FROM user_settings WHERE user_id=?').get(id);const deadline=body.early_deadline??current.early_deadline;if(typeof deadline!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(deadline))fail(400,'截止时间格式应为 HH:mm');db.prepare('UPDATE user_settings SET focus_minutes=?,break_minutes=?,daily_goal=?,early_deadline=? WHERE user_id=?').run(integer(body.focus_minutes??current.focus_minutes,90,'专注分钟'),integer(body.break_minutes??current.break_minutes,30,'休息分钟'),integer(body.daily_goal??current.daily_goal,720,'每日目标'),deadline,id);return json(200,{ok:true});}
   if(path==='/api/sessions'&&req.method==='POST'){
    if(active(id))fail(409,'已有进行中的专注');if(body.task_id!=null)integer(body.task_id,Number.MAX_SAFE_INTEGER,'任务编号');
    const task=body.task_id==null?null:db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=? AND completed=0').get(body.task_id,id);if(body.task_id!=null&&!task)fail(404,'任务不存在或已完成');
    const settings=db.prepare('SELECT * FROM user_settings WHERE user_id=?').get(id);
    const timerMode=body.timer_mode??'down';if(!['up','down'].includes(timerMode))fail(400,'计时方式无效');const minutes=timerMode==='up'?1440:body.focus_minutes===undefined?settings.focus_minutes:integer(body.focus_minutes,180,'本次专注分钟');
    const result=db.prepare("INSERT INTO sessions(task_id,task_title,duration,running_since,status,started_at,user_id,timer_mode) VALUES(?,?,?,?,'running',?,?,?)").run(task?.id??null,task?.title??'自由专注',minutes*60,Date.now(),new Date().toISOString(),id,timerMode);
    db.prepare('INSERT INTO focus_segments(session_id,started_at) VALUES(?,?)').run(Number(result.lastInsertRowid),Date.now());
    return json(201,{id:Number(result.lastInsertRowid)});
   }
   const action=path.match(/^\/api\/sessions\/(pause|resume|complete|cancel)$/)?.[1];if(action&&req.method==='POST'){
    const s=active(id);if(!s)fail(409,'没有进行中的专注');if(body.session_id!==s.id)fail(409,'专注状态已更新，请刷新后重试');
    if(action==='pause'){if(s.status!=='running')fail(409,'已暂停');db.prepare("UPDATE sessions SET elapsed=?,running_since=NULL,status='paused' WHERE id=? AND user_id=?").run(elapsed(s),s.id,id);db.prepare('UPDATE focus_segments SET ended_at=? WHERE session_id=? AND ended_at IS NULL').run(Date.now(),s.id);}
    else if(action==='resume'){if(s.status!=='paused')fail(409,'已经在运行');db.prepare("UPDATE sessions SET running_since=?,status='running' WHERE id=? AND user_id=?").run(Date.now(),s.id,id);db.prepare('INSERT INTO focus_segments(session_id,started_at) VALUES(?,?)').run(s.id,Date.now());}
    else{
     const actual=elapsed(s);if(action==='complete'&&s.timer_mode!=='up'&&actual<s.duration)fail(409,'专注时间尚未结束');if(action==='complete'&&actual<1)fail(409,'至少专注一秒后再保存');
     db.exec('BEGIN IMMEDIATE');try{
      db.prepare('UPDATE sessions SET elapsed=?,duration=?,running_since=NULL,status=?,finished_at=? WHERE id=? AND user_id=?').run(actual,s.timer_mode==='up'?actual:s.duration,action==='complete'?'completed':'cancelled',new Date().toISOString(),s.id,id);
      db.prepare('UPDATE focus_segments SET ended_at=? WHERE session_id=? AND ended_at IS NULL').run(s.running_since?Math.min(Date.now(),s.running_since+Math.max(0,actual-s.elapsed)*1000):Date.now(),s.id);
      if(action==='complete'&&s.task_id)db.prepare("UPDATE tasks SET completed=1 WHERE id=? AND user_id=? AND planned_minutes*60<=(SELECT COALESCE(SUM(duration),0) FROM sessions WHERE task_id=? AND user_id=? AND status='completed')").run(s.task_id,id,s.task_id,id);
      db.exec('COMMIT');
     }catch(error){db.exec('ROLLBACK');throw error;}
    }
    return json(200,{ok:true});
   }
   fail(404,'接口不存在');
  }catch(error){if(!error.status)console.error(error.code||error.name);json(error.status||500,{error:error.status?error.message:'服务暂时不可用，请稍后重试'});}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const db=openDatabase(process.env.DB_PATH||fileURLToPath(new URL('../data/tomato.sqlite',import.meta.url)));
 const server=createApp(db);const port=Number(process.env.PORT||3000);
 server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Focus 沉时多人后端：http://localhost:${port} · 自主账号注册/登录已启用`));
 const shutdown=()=>server.close(()=>{db.close();process.exit(0);});process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
