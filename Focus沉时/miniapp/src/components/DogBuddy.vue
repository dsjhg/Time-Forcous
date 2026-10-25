<template>
 <view class="buddy" :class="{compact}">
  <view class="buddy-art"><view class="buddy-sun"></view><image class="buddy-dog" src="/static/mascot/xiaoshi.png" mode="aspectFit" alt="抱着小书的学习伙伴小时"/><text class="buddy-spark">✦</text></view>
  <view class="buddy-copy"><text class="buddy-kicker">小时陪你学 · 一起慢慢进步</text><text v-if="title" class="buddy-title">{{title}}</text><text v-if="caption&&!compact" class="buddy-caption">{{caption}}</text><view class="buddy-bubble"><text class="buddy-quote">{{quote}}</text><button class="buddy-next" aria-label="换一句小时的鼓励" @click="next">换一句 ↻</button></view></view>
 </view>
</template>
<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';import {onShow,onHide} from '@dcloudio/uni-app';import {store} from '../services/store';
defineProps({title:{type:String,default:''},caption:{type:String,default:''},compact:Boolean});
const phrases=['汪！先做一小步，剩下的慢慢来。','不用和别人比，我陪你按自己的节奏走。','今天学会一点点，也值得摇摇尾巴！','难题可以分几次做，我在这里陪着你。','喝口水、伸个懒腰，再一起出发吧。','你认真努力的样子，小时都看见啦。','不必每次都满分，愿意开始就很棒。','把眼前这一页看完，就是小小的胜利。','累了就休息，重新开始也算进步。','今天的努力，会变成明天的小底气。'];
const index=ref(Math.floor(Math.random()*phrases.length)),quote=ref(phrases[index.value]);let timer;
function next(){index.value=(index.value+1+Math.floor(Math.random()*(phrases.length-1)))%phrases.length;quote.value=phrases[index.value];}
function start(){clearInterval(timer);if(store.session?.status!=='running')next();timer=setInterval(()=>{if(store.session?.status!=='running')next();},45000);}
onMounted(start);onShow(start);onHide(()=>clearInterval(timer));onBeforeUnmount(()=>clearInterval(timer));
</script>
<style scoped>
.buddy{display:flex;align-items:center;gap:26rpx;padding:30rpx;background:#fff5d9;border:2rpx solid #efe1bb;border-radius:32rpx;margin-bottom:28rpx;overflow:hidden}.buddy-art{position:relative;width:190rpx;height:210rpx;flex-shrink:0;display:flex;align-items:center;justify-content:center}.buddy-sun{position:absolute;width:170rpx;height:170rpx;background:#f7df9b;border-radius:50%}.buddy-dog{position:relative;width:190rpx;height:200rpx}.buddy-spark{position:absolute;right:-4rpx;top:4rpx;color:#ae7937;font-size:32rpx}.buddy-copy{flex:1;min-width:0}.buddy-kicker{display:block;font-size:21rpx;letter-spacing:1rpx;color:#8c714c}.buddy-title{display:block;font-size:34rpx;font-weight:700;color:#59432e;line-height:1.5;margin:10rpx 0}.buddy-caption{display:block;font-size:24rpx;color:#7c6b51;line-height:1.7}.buddy-bubble{margin-top:16rpx;padding:18rpx 22rpx;background:#fffdf7;border:2rpx solid #eddfc1;border-radius:22rpx 22rpx 22rpx 4rpx}.buddy-quote{display:block;font-size:25rpx;color:#6a533b;line-height:1.7}.buddy-next{background:transparent;font-size:22rpx;color:#89662f;padding:14rpx 0 0;text-align:left;min-height:58rpx}.compact{padding:20rpx;gap:18rpx}.compact .buddy-art{width:120rpx;height:140rpx}.compact .buddy-dog{width:125rpx;height:140rpx}.compact .buddy-sun{width:110rpx;height:110rpx}.compact .buddy-title{font-size:29rpx}.compact .buddy-caption{display:none}.compact .buddy-bubble{padding:12rpx 16rpx}.compact .buddy-quote{font-size:24rpx}
/* #ifdef H5 */
@media(min-width:1000px){.buddy{padding:24px 32px}.buddy-art{width:150px;height:155px}.buddy-dog{width:150px;height:155px}.buddy-sun{width:135px;height:135px}.buddy-title{font-size:25px}.buddy-quote{font-size:15px}.buddy-kicker{font-size:12px}.buddy-bubble{max-width:650px}.compact .buddy-art{width:90px;height:100px}.compact .buddy-dog{width:90px;height:100px}.compact .buddy-quote{font-size:14px}}
@media(max-width:380px){.buddy:not(.compact){gap:14rpx;padding:22rpx}.buddy:not(.compact) .buddy-art{width:140rpx}.buddy:not(.compact) .buddy-dog{width:145rpx}.buddy-title{font-size:30rpx}}
/* #endif */
</style>
