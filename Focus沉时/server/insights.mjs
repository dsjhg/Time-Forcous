import {httpError} from './auth.mjs';
import {studyDay} from './study.mjs';
const DAY=86400000,OFFSET=8*3600000;
const key=ms=>new Date(ms).toISOString().slice(0,10);
export function periodBounds(period,anchor=studyDay()){
 if(!['day','week','month'].includes(period)||!/^\d{4}-\d{2}-\d{2}$/.test(anchor)||!Number.isFinite(Date.parse(anchor))||key(Date.parse(anchor))!==anchor)throw httpError(400,'请选择有效日期');
 let start=Date.parse(anchor),end=start+DAY;
 if(period==='week'){start-=6*DAY;end=start+7*DAY;}
 if(period==='month'){start=Date.parse(anchor.slice(0,7)+'-01');const d=new Date(start);d.setUTCMonth(d.getUTCMonth()+1);end=d.getTime();}
 return {start:key(start),end:key(end),length:Math.round((end-start)/DAY)};
}
export function insights(db,id,period,anchor){
 const bounds=periodBounds(period,anchor);
 const startMs=Date.parse(bounds.start)-OFFSET,endMs=Date.parse(bounds.end)-OFFSET;
 const rows=db.prepare("SELECT * FROM sessions WHERE user_id=? AND status='completed' AND julianday(started_at)<julianday(?) AND julianday(finished_at)>=julianday(?) ORDER BY finished_at,id").all(id,new Date(endMs).toISOString(),new Date(startMs).toISOString());
 const daily=Array.from({length:bounds.length},(_,i)=>({label:key(Date.parse(bounds.start)+i*DAY),seconds:0})),hourly=Array.from({length:24},(_,i)=>({label:String(i).padStart(2,'0')+':00',seconds:0})),tasks=new Map();
 let total=0,count=0,longest=null,approximate=false;
 for(const row of rows){
  let segments=db.prepare('SELECT started_at,ended_at FROM focus_segments WHERE session_id=? AND ended_at IS NOT NULL ORDER BY started_at').all(row.id);
  const covered=segments.reduce((sum,s)=>sum+Math.max(0,s.ended_at-s.started_at),0);
  if(covered<row.duration*1000-1000){approximate=true;segments=[{started_at:Date.parse(row.started_at),ended_at:Date.parse(row.started_at)+row.duration*1000}];}
  let budget=row.duration*1000,contribution=0;
  for(const segment of segments){
   const rawEnd=Math.min(segment.ended_at,segment.started_at+budget);
   budget-=Math.max(0,rawEnd-segment.started_at);
   let cursor=Math.max(segment.started_at,startMs);const end=Math.min(rawEnd,endMs);
   while(cursor<end){
    const hour=Math.floor((cursor+OFFSET)/3600000),next=Math.min(end,(hour+1)*3600000-OFFSET),seconds=(next-cursor)/1000;
    hourly[((hour%24)+24)%24].seconds+=seconds;
    daily[Math.floor((cursor-startMs)/DAY)].seconds+=seconds;
    contribution+=seconds;cursor=next;
   }
   if(budget<=0)break;
  }
  if(contribution>0){
   total+=contribution;count++;
   if(!longest||contribution>longest.seconds)longest={seconds:contribution,task:row.task_title};
   const taskKey=row.task_id===null?'title:'+row.task_title:'id:'+row.task_id;
   const task=tasks.get(taskKey)||{key:taskKey,title:row.task_title,seconds:0};task.seconds+=contribution;tasks.set(taskKey,task);
  }
 }
 const elapsedDays=Math.max(0,Math.min(bounds.length,Math.floor((Date.parse(studyDay())-Date.parse(bounds.start))/DAY)+1));
 return {period,...bounds,total_seconds:total,count,longest,average_seconds:elapsedDays?total/elapsedDays:0,average_days:elapsedDays,tasks:[...tasks.values()].sort((a,b)=>b.seconds-a.seconds),daily,hourly,approximate};
}
export function checkinCalendar(db,id,month){
 if(!/^\d{4}-\d{2}$/.test(month)||Number(month.slice(5))<1||Number(month.slice(5))>12)throw httpError(400,'月份无效');
 return {month,records:db.prepare("SELECT c.day,CASE WHEN e.day IS NULL THEN 'regular' ELSE 'early' END AS kind,COALESCE(e.checked_at,CASE WHEN c.created_at LIKE '%T%' THEN c.created_at ELSE replace(c.created_at,' ','T')||'Z' END) AS checked_at,e.deadline FROM checkins c LEFT JOIN early_checkins e ON c.user_id=e.user_id AND c.day=e.day WHERE c.user_id=? AND substr(c.day,1,7)=? ORDER BY c.day").all(id,month),regular:db.prepare('SELECT day FROM checkins c WHERE user_id=? AND substr(day,1,7)=? AND NOT EXISTS(SELECT 1 FROM early_checkins e WHERE e.user_id=c.user_id AND e.day=c.day) ORDER BY day').all(id,month).map(r=>r.day),early:db.prepare('SELECT day,checked_at,deadline FROM early_checkins WHERE user_id=? AND substr(day,1,7)=? ORDER BY day').all(id,month)};
}
