import {toast,openDialog} from './feedback';
let base=import.meta.env.VITE_API_BASE_URL||'http://127.0.0.1:3000/api';
// #ifdef H5
if(!import.meta.env.VITE_API_BASE_URL)base='/api';
// #endif
export function token(){return uni.getStorageSync('tomato-token')||'';}
// 微信使用后端 HTTPS 音频地址；H5 同源，无需第三方音源服务。
export function mediaUrl(filename){return base.replace(/\/api\/?$/,'')+'/static/audio/'+filename;}
export function ambientUrl(filename){return base.replace(/\/api\/?$/,'')+'/media/audio/'+filename;}
export function request(path,method='GET',data){const requestToken=token();return new Promise((resolve,reject)=>{
 uni.request({url:base+path,method:method==='PATCH'?'PUT':method,data,timeout:10000,header:{'Content-Type':'application/json',Authorization:requestToken?'Bearer '+requestToken:''},success(response){
  if(response.statusCode>=200&&response.statusCode<300)resolve(response.data);
  else {if(response.statusCode===401&&token()===requestToken)uni.removeStorageSync('tomato-token');reject(Object.assign(new Error(response.data?.error||'请求失败'),{status:response.statusCode}));}
 },fail(){reject(new Error('暂时无法连接服务器，请检查网络后重试'));}});
});}
export async function login(data,kind='password'){const result=await request('/auth/'+kind,'POST',data);uni.setStorageSync('tomato-token',result.token);return result;}
export function message(text){toast(text);}
export function confirm(content){return openDialog(content);}
export function inform(content,title='小时的小提醒'){return openDialog(content,title,true);}

