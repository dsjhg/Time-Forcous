import {mediaUrl,message} from './api';
let player=null;
export function prepareReminder(){if(!player){player=uni.createInnerAudioContext();player.src=mediaUrl('chime.wav');player.onError(()=>message('铃声未能播放，请检查设备声音设置。'));}player.volume=0;player.play();setTimeout(()=>{if(player){player.stop();player.volume=.7;}},80);}
export function remind(kind){
 if(kind==='ring'){if(!player)prepareReminder();player.volume=.7;player.seek(0);player.play();}
 if(kind==='vibrate'){
 // #ifdef H5
 if(typeof navigator==='undefined'||typeof navigator.vibrate!=='function'||!navigator.vibrate([200,100,200]))message('此设备不支持震动，请改用铃声。');
 // #endif
 // #ifndef H5
 uni.vibrateLong({fail:()=>message('设备未能震动，请改用铃声。')});
 // #endif
 }
}
export function disposeReminder(){player?.destroy();player=null;}
