<template>
 <view class="noise-panel">
  <view class="row between"><view><text class="eyebrow">SOUNDS FOR FOCUS</text><text class="title">专注声音</text></view><text class="sound-symbol" :class="{playing}">♫</text></view>
  <text class="section-meta">选一种喜欢的声音，或叠加最多 3 种</text>
  <view class="sound-options"><button v-for="sound in sounds" :key="sound.id" :class="{selected:chosen.includes(sound.id)}" @click="select(sound.id)"><CartoonArt class="sound-art" :kind="sound.id" :label="sound.name"/><text>{{sound.name}}</text><text class="sound-check">{{chosen.includes(sound.id)?'已选 ✓':'＋'}}</text></button></view>
  <view class="row between space"><button class="secondary small" :disabled="!chosen.length" @click="toggle">{{playing?'暂停声音':loading?'停止加载':'播放环境音'}}</button><text class="section-meta">{{playing?'正在播放 '+playingCount+' 种声音':'已选 '+chosen.length+' / 3'}}</text></view>
  <view class="volume"><text>总音量</text><slider :value="volume" min="0" max="100" activeColor="#ab9067" backgroundColor="#f7f0e2" block-color="#ab9067" :block-size="16" @change="volumeChange"/><text>{{volume}}%</text></view>
  <button v-if="chosen.length" class="text-button mixer-toggle" @click="mixOpen=!mixOpen">{{mixOpen?'收起独立音量':'调整每种声音的音量'}} {{mixOpen?'−':'＋'}}</button>
  <view v-for="sound in selectedSounds" v-show="mixOpen" :key="sound.id" class="track-control">
   <view class="row between"><text>{{sound.name}}</text><text class="section-meta">{{states[sound.id]==='loading'?'加载中…':states[sound.id]==='playing'?'播放中':states[sound.id]==='error'?'播放失败，请重试':'已暂停'}}</text></view>
   <slider :value="levels[sound.id]" min="0" max="100" activeColor="#ccb58a" :block-size="12" @change="trackVolume(sound.id,$event)"/>
  </view>
  <text class="section-meta">暂停专注或离开页面时，声音会停止。</text>
  <button class="credits-toggle" @click="credits=!credits">{{credits?'收起':'查看'}}音源与署名</button>
  <view v-if="credits" class="credits"><text>录音选自 Blanket 音源库，保留原作者与授权。本项目仅做响度调整和 MP3 转码，非原创录音。</text><view v-for="sound in sounds" :key="sound.id" class="credit"><text>{{sound.name}} · {{sound.author}}</text><text>{{sound.license}} · 上游编辑：{{sound.editor}}</text><text class="credit-link" @click="copyCredit(sound)">复制来源及授权链接 ↗</text></view></view>
 </view>
</template>
<script setup>
import CartoonArt from './CartoonArt.vue';
import {ref,computed,watch,onBeforeUnmount} from 'vue';import {onHide} from '@dcloudio/uni-app';import {ambientUrl,message} from '../services/api';
import sounds from '../../../assets/audio/catalog.json';
const emit=defineEmits(['playing-change']);
const props=defineProps({sessionState:String,expired:Boolean});
const chosen=ref(['rain']),volume=ref(25),levels=ref(Object.fromEntries(sounds.map(s=>[s.id,70]))),states=ref({}),credits=ref(false),mixOpen=ref(false);
const players=new Map();let requested=false;
const selectedSounds=computed(()=>sounds.filter(s=>chosen.value.includes(s.id)));
const playingCount=computed(()=>Object.values(states.value).filter(s=>s==='playing').length);
const playing=computed(()=>playingCount.value>0),loading=computed(()=>Object.values(states.value).includes('loading'));
watch(playing,value=>emit('playing-change',value),{immediate:true});
function gain(id){return volume.value/100*levels.value[id]/100/Math.sqrt(Math.max(1,chosen.value.length));}
function stopOne(id){const entry=players.get(id);players.delete(id);if(entry){clearTimeout(entry.timeout);clearInterval(entry.fade);try{entry.audio.stop();}catch{}try{entry.audio.destroy();}catch{}}states.value[id]='paused';}
function destroy(){requested=false;for(const id of [...players.keys()])stopOne(id);}
function adjust(){for(const [id,e]of players){clearInterval(e.fade);e.audio.volume=gain(id);}}
function select(id){if(chosen.value.includes(id)){stopOne(id);chosen.value=chosen.value.filter(x=>x!==id);if(!chosen.value.length)requested=false;}
 else{if(chosen.value.length===3)return message('最多同时选择 3 种声音');chosen.value.push(id);if(requested)startOne(id);}adjust();}
function startOne(id){stopOne(id);states.value[id]='loading';
 try{const sound=sounds.find(s=>s.id===id),audio=uni.createInnerAudioContext();const entry={audio,timeout:null,fade:null};players.set(id,entry);audio.autoplay=false;audio.loop=true;audio.volume=0;audio.src=ambientUrl(sound.file);
 audio.onPlay(()=>{if(players.get(id)!==entry)return;clearTimeout(entry.timeout);states.value[id]='playing';let step=0;entry.fade=setInterval(()=>{if(players.get(id)!==entry)return;audio.volume=gain(id)*Math.min(1,++step/10);if(step>=10)clearInterval(entry.fade);},60);});
 const fail=()=>{if(players.get(id)!==entry)return;stopOne(id);states.value[id]='error';if(!players.size)requested=false;};
 audio.onError(fail);entry.timeout=setTimeout(fail,15000);audio.play();
 }catch{stopOne(id);states.value[id]='error';if(!players.size)requested=false;}
}
function toggle(){if(playing.value||loading.value){destroy();return;}requested=true;for(const id of chosen.value)startOne(id);}
function volumeChange(event){volume.value=Number(event.detail.value);adjust();}
function trackVolume(id,event){levels.value[id]=Number(event.detail.value);adjust();}
function copyCredit(sound){uni.setClipboardData({showToast:false,success:()=>message('音源信息已复制'),fail:()=>message('复制未成功，请重试'),data:sound.name+' — '+sound.author+'; '+sound.license+'\n'+sound.source+'\n'+sound.licenseUrl+'\n上游编辑：'+sound.editor+'；本项目调整响度并转码 MP3。'});}
watch(()=>[props.sessionState,props.expired],([state,expired])=>{if(state==='paused'||expired||!state)destroy();});
onHide(destroy);onBeforeUnmount(destroy);defineExpose({stop:destroy});
</script>
<style scoped>
.noise-panel{text-align:left;margin-top:36rpx;padding-top:30rpx;border-top:2rpx solid #f7f0e2}.title{font-size:28rpx}.sound-symbol{font-size:46rpx;color:#ab9067}.playing{animation:breathe 2s infinite alternate}.sound-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14rpx;margin-top:24rpx}.sound-options button{padding:20rpx 6rpx;border:2rpx solid #f7f0e2;background:#fffcf6;color:#8d734f;font-size:22rpx;width:100%;min-width:0}.sound-options .selected{background:#f7f0e2;border-color:#ccb58a;color:#725b40}.sound-icon{display:block;font-size:36rpx;margin-bottom:6rpx}.sound-check{display:block;font-size:17rpx;margin-top:12rpx;opacity:.75}.volume{display:flex;align-items:center;gap:10rpx;font-size:22rpx;color:#ab9067;margin:22rpx 0}.volume slider{flex:1}.section-meta{display:block;line-height:1.7;font-size:20rpx}.track-control{font-size:23rpx;color:#8d734f;background:#fffcf6;border-radius:18rpx;padding:18rpx;margin-bottom:16rpx}.track-control slider{margin:20rpx 6rpx 8rpx}.credits-toggle{background:transparent;color:#8d734f;font-size:22rpx;margin-top:18rpx;padding:14rpx}.credits{font-size:20rpx;line-height:1.8;color:#8d734f}.credits text{display:block;overflow-wrap:anywhere}.credit{padding:18rpx 0;border-bottom:1px solid #f7f0e2}.credit-link{color:#725b40;text-decoration:underline}@keyframes breathe{to{opacity:.4;transform:translateY(-5rpx)}}
.noise-panel{margin-top:0;padding-top:0;border-top:0}.sound-symbol{font-size:42rpx}.sound-options button{min-height:128rpx;padding:18rpx 6rpx;border-radius:20rpx;color:#725b40;font-size:24rpx}.sound-check{font-size:20rpx;margin-top:8rpx}.sound-icon{font-size:30rpx}.title{font-size:32rpx}.section-meta{font-size:23rpx;color:#725b40}.mixer-toggle{text-align:left;width:100%;padding-left:0;margin-bottom:12rpx}.credits-toggle{color:#725b40}.volume{font-size:24rpx;color:#725b40}.track-control{margin-top:12rpx}.credits{color:#725b40;font-size:23rpx}
.sound-art{width:82rpx;height:82rpx;margin:0 auto 12rpx}.sound-options button{background:#fffaf0;border-color:#f0dfb8}.sound-options .selected{background:#ffedb3;border-color:#dba848;color:#6d4c24}.sound-check{color:#8b692e}</style>
