import { randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(scryptCallback);
export const hashToken=token=>createHash('sha256').update(token).digest('hex');
export const httpError=(status,message)=>Object.assign(new Error(message),{status});
export function createAuth(db,options={}){
 const env=options.env||process.env;const rate=new Map();
 function limit(ip){const now=Date.now();for(const [key,v] of rate)if(v.until<now)rate.delete(key);const v=rate.get(ip)||{count:0,until:now+60000};if(++v.count>20)throw httpError(429,'登录操作过于频繁，请稍后再试');rate.set(ip,v);}
 function issue(user){
  db.prepare('INSERT OR IGNORE INTO user_settings(user_id) VALUES(?)').run(user.id);
  db.prepare('DELETE FROM auth_tokens WHERE expires_at<?').run(Date.now());
  const token=randomBytes(32).toString('hex');const expires=Date.now()+7*86400000;
  db.prepare('INSERT INTO auth_tokens VALUES(?,?,?)').run(hashToken(token),user.id,expires);
  return {token,expires_at:expires,user:{id:user.id,nickname:user.nickname,account:user.dev_account??null}};
 }
 const validPassword=value=>typeof value==='string'&&value.length>=8&&value.length<=72;
 async function passwordHash(value){const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(value,salt,64)).toString('hex');}
 async function matches(value,encoded){const [salt,hash]=encoded.split(':');return timingSafeEqual(Buffer.from(hash,'hex'),await scrypt(value,salt,64));}
 return {
  async login(kind,body,ip){
   limit(ip);
   if(kind==='register'||kind==='password'){
    const account=typeof body.account==='string'?body.account.trim():'';
    if(!/^[a-zA-Z0-9_-]{3,32}$/.test(account)||!validPassword(body.password))throw httpError(400,'账号需为 3–32 位字母、数字、下划线或短横线，密码为 8–72 位');
    let user=db.prepare('SELECT * FROM users WHERE dev_account=?').get(account);
    if(kind==='password'){
     const encoded=user?.password_hash||'00000000000000000000000000000000:'+ '0'.repeat(128);
     const valid=await matches(body.password,encoded);
     if(!user||!valid)throw httpError(401,'账号或密码错误');
     if(db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id)?.password_hash!==encoded)throw httpError(401,'密码已更新，请重新登录');
    }else{
     if(user)throw httpError(409,'这个账号已被注册，请直接登录或换一个账号');
     const nickname=typeof body.nickname==='string'?body.nickname.trim():account;
     if(!nickname||nickname.length>24)throw httpError(400,'昵称应为 1–24 个字符');
     const hash=await passwordHash(body.password);
     if(db.prepare('SELECT id FROM users WHERE dev_account=?').get(account))throw httpError(409,'这个账号已被注册');
     const result=db.prepare('INSERT INTO users(dev_account,password_hash,nickname) VALUES(?,?,?)').run(account,hash,nickname);
     user=db.prepare('SELECT * FROM users WHERE id=?').get(Number(result.lastInsertRowid));
    }
    return issue(user);
   }
   if(kind==='dev'){
    if(env.NODE_ENV==='production'||env.ENABLE_DEV_LOGIN!=='true')throw httpError(404,'开发登录未启用');
    if(typeof body.account!=='string'||! /^[a-zA-Z0-9_-]{3,32}$/.test(body.account)||typeof body.password!=='string'||body.password.length<8||body.password.length>72)throw httpError(400,'账号为 3–32 位字母数字，密码为 8–72 位');
    let user=db.prepare('SELECT * FROM users WHERE dev_account=?').get(body.account);
    if(user){const [salt,hash]=user.password_hash.split(':');const actual=await scrypt(body.password,salt,64);if(!timingSafeEqual(Buffer.from(hash,'hex'),actual))throw httpError(401,'账号或密码错误');}
    else {
     const salt=randomBytes(16).toString('hex');const hash=(await scrypt(body.password,salt,64)).toString('hex');
     if(db.prepare('SELECT id FROM users WHERE dev_account=?').get(body.account))throw httpError(409,'账号已创建，请重新登录');
     const result=db.prepare('INSERT INTO users(dev_account,password_hash,nickname) VALUES(?,?,?)').run(body.account,`${salt}:${hash}`,body.account);
     user=db.prepare('SELECT * FROM users WHERE id=?').get(Number(result.lastInsertRowid));
    }
    return issue(user);
   }
   if(kind!=='wechat')throw httpError(404,'登录方式不存在');
   if(typeof body.code!=='string'||!body.code||body.code.length>256)throw httpError(400,'缺少有效微信登录凭证');
   if(!env.WECHAT_APP_ID||!env.WECHAT_APP_SECRET)throw httpError(503,'服务器尚未配置微信登录');
   let data;
   try{
    if(options.exchangeWechatCode)data=await options.exchangeWechatCode(body.code);
    else {
     const query=new URLSearchParams({appid:env.WECHAT_APP_ID,secret:env.WECHAT_APP_SECRET,js_code:body.code,grant_type:'authorization_code'});
     const response=await fetch('https://api.weixin.qq.com/sns/jscode2session?'+query,{signal:AbortSignal.timeout(8000)});
     if(!response.ok)throw new Error('wechat unavailable');data=await response.json();
    }
   }catch{throw httpError(502,'微信登录服务暂时不可用，请重试');}
   if(data.errcode||typeof data.openid!=='string'||!data.openid)throw httpError(401,'微信登录凭证已失效，请重新登录');
   const identity=env.WECHAT_APP_ID+':'+data.openid;
   db.prepare('INSERT OR IGNORE INTO users(openid,nickname) VALUES(?,?)').run(identity,'沉时同学');
   return issue(db.prepare('SELECT * FROM users WHERE openid=?').get(identity));
  },
  authenticate(req){const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)throw httpError(401,'请先登录');const user=db.prepare('SELECT u.id,u.nickname,u.dev_account AS account FROM users u JOIN auth_tokens a ON u.id=a.user_id WHERE a.hash=? AND a.expires_at>?').get(hashToken(token),Date.now());if(!user)throw httpError(401,'登录已过期，请重新登录');return user;},
  async changePassword(user,body,ip){
   limit(ip);
   if(!validPassword(body.old_password)||!validPassword(body.new_password))throw httpError(400,'密码长度应为 8–72 位');
   const row=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
   if(!row.password_hash||!await matches(body.old_password,row.password_hash))throw httpError(400,'原密码不正确');
   const hash=await passwordHash(body.new_password);
   // 防止并发修改用旧密码覆盖已经更新的密码。
   const update=db.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?').run(hash,user.id,row.password_hash);
   if(!update.changes)throw httpError(409,'密码已更新，请重新登录');
   db.prepare('DELETE FROM auth_tokens WHERE user_id=?').run(user.id);
   return {ok:true};
  },
  logout(req){db.prepare('DELETE FROM auth_tokens WHERE hash=?').run(hashToken(req.headers.authorization.slice(7)));}
 };
}
