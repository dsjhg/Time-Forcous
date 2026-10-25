import { reactive } from 'vue';
import { request,token,message } from './api';
const empty=()=>({user:null,countdowns:[],tasks:[],history:[],session:null,settings:{focus_minutes:25,break_minutes:5,daily_goal:100},room:null,study:{day:'',checked_in:false,streak:0,checkin_count:0,recent_days:[],today_minutes:0,today_count:0,total_minutes:0,total_count:0,journal:'',journals:[]}});
export const store=reactive({...empty(),loadedAt:Date.now(),loading:false,error:'',busy:false});
let refreshing=null,generation=0;
export function clearState(){generation++;refreshing=null;Object.assign(store,empty(),{error:'',loading:false,loadedAt:Date.now()});}
export async function refresh(){
 const authToken=token();if(!authToken){clearState();return false;}
 if(refreshing?.authToken===authToken)return refreshing.promise;
 const epoch=generation;const operation={authToken,promise:null};refreshing=operation;
 store.loading=true;
 operation.promise=request('/state').then(data=>{if(epoch!==generation||token()!==authToken)return false;Object.assign(store,data,{loadedAt:Date.now(),error:''});return true;}).catch(error=>{if(epoch!==generation||(token()&&token()!==authToken))return false;if(error.status===401)clearState();store.error=error.message;return false;}).finally(()=>{if(refreshing===operation){store.loading=false;refreshing=null;}});
 return operation.promise;
}
export async function act(path,method='POST',data={}){
 if(store.busy)return false;
 store.busy=true;
 try{await request(path,method,data);await refresh();return true;}
 catch(error){if(error.status===401)clearState();message(error.message);await refresh();return false;}
 finally{store.busy=false;}
}
export function goLogin(){uni.navigateTo({url:'/pages/login/index'});}
export function remaining(now=Date.now()){
 const s=store.session;if(!s)return store.settings.focus_minutes*60;
 return Math.max(0,s.duration-s.elapsed-(s.status==='running'?Math.max(0,Math.floor((now-store.loadedAt)/1000)):0));
}
export function dayKey(value){const d=new Date(value);return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;}
export const focusMinutes=list=>Math.round(list.reduce((sum,s)=>sum+s.duration,0)/60);
