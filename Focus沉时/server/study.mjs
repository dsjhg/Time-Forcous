// 所有打卡、目标和手记按北京时间的自然日结算，客户端不能伪造日期补签。
export const studyDay=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export function studySummary(db,id){
 const day=studyDay();
 const dates=db.prepare('SELECT day FROM checkins WHERE user_id=? ORDER BY day DESC').all(id).map(row=>row.day);
 const set=new Set(dates);let cursor=new Date(day+'T00:00:00Z');let streak=0;
 if(!set.has(day))cursor.setUTCDate(cursor.getUTCDate()-1);
 while(set.has(cursor.toISOString().slice(0,10))){streak++;cursor.setUTCDate(cursor.getUTCDate()-1);}
 const total=db.prepare("SELECT COALESCE(SUM(duration),0) AS seconds,COUNT(*) AS count FROM sessions WHERE user_id=? AND status='completed'").get(id);
 const today=db.prepare("SELECT COALESCE(SUM(duration),0) AS seconds,COUNT(*) AS count FROM sessions WHERE user_id=? AND status='completed' AND date(finished_at,'+8 hours')=?").get(id,day);
 return {day,early_checked_in:!!db.prepare('SELECT 1 FROM early_checkins WHERE user_id=? AND day=?').get(id,day),checked_in:set.has(day),streak,checkin_count:dates.length,recent_days:dates.slice(0,60),today_minutes:Math.round(today.seconds/60),today_count:today.count,total_minutes:Math.round(total.seconds/60),total_count:total.count,journal:db.prepare('SELECT content FROM journals WHERE user_id=? AND day=?').get(id,day)?.content||'',journals:db.prepare('SELECT day,content FROM journals WHERE user_id=? ORDER BY day DESC LIMIT 7').all(id)};
}
