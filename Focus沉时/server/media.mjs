import {readFileSync,createReadStream} from 'node:fs';import {stat} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {join} from 'node:path';import {pipeline} from 'node:stream/promises';
const directory=fileURLToPath(new URL('../assets/audio/',import.meta.url));
const allowed=new Set(JSON.parse(readFileSync(join(directory,'catalog.json'),'utf8')).map(s=>s.file));
export async function serveAudio(req,res,path){
 const name=path.slice('/media/audio/'.length);
 if(!allowed.has(name)){res.writeHead(404);res.end();return;}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
 let info;try{info=await stat(join(directory,name));}catch{res.writeHead(404);res.end();return;}
 const headers={'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600'};
 let start=0,end=info.size-1,status=200;
 if(req.headers.range){
  const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  let valid=!!match&&(!!match[1]||!!match[2]);
  if(valid){if(!match[1]){const suffix=Number(match[2]);start=Math.max(0,info.size-suffix);valid=Number.isSafeInteger(suffix)&&suffix>0;}else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;valid=Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start<info.size&&end>=start;}}
  if(!valid){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
  status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
 }
 headers['Content-Length']=end-start+1;res.writeHead(status,headers);
 if(req.method==='HEAD'){res.end();return;}
 try{await pipeline(createReadStream(join(directory,name),{start,end}),res);}catch(error){if(!['ERR_STREAM_PREMATURE_CLOSE','ECONNRESET'].includes(error.code))console.error('audio stream:',error.code||error.name);}
}
