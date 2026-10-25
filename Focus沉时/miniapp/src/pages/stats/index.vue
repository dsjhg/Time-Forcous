<template>
<view class="screen">
  <text class="eyebrow">LITTLE MOMENTS, BIG GROWTH</text><text class="headline">每一份投入，都算数。</text>
  <DogBuddy compact/><AccountGate/>
  <view v-if="store.user">
    <view class="segment record-tabs"><button v-for="item in recordSections" :key="item.value" :class="{selected:section===item.value}" @click="section=item.value">{{item.label}}</button></view>
    <StudyInsights v-if="section==='insights'"/><view v-if="section==='calendar'"><DailyGarden/><CheckinCalendar/></view>
    <view v-show="section==='journal'" class="card"><view class="row between"><text class="title">留一段今天的手记</text><CartoonArt kind="pencil" label="手记铅笔"/></view><text class="muted">{{store.study.day}} · 只有自己可见</text><textarea v-model="journal" maxlength="1000" placeholder="今天学会了什么？有什么想送给明天的自己？"/><view class="row between space"><text class="section-meta">{{journal.length}} / 1000</text><button class="secondary small" :disabled="store.busy" @click="saveJournal">保存手记</button></view>
      <text v-if="journalSaved" class="saved-note">✓ 今天的心情，已经好好收好了</text>
      <button class="journal-toggle" @click="toggleArchive">{{archiveOpen?'收起过往手记':'翻翻我的手记本'}} <text>↗</text></button>
      <view v-if="archiveOpen" class="journal-archive"><text class="title">写给自己的日子</text><view v-for="entry in entries" :key="entry.day" class="journal-entry"><text class="section-meta">{{entry.day}}</text><text class="journal-content">{{entry.content}}</text></view><text v-if="!entries.length&&!archiveLoading" class="muted">还没有保存的手记。写下今天的第一句吧。</text><button v-if="hasMore" class="secondary small space" :disabled="archiveLoading" @click="loadArchive(false)">{{archiveLoading?'正在翻页…':'再翻一页'}}</button></view>
    </view>
    <view v-show="section==='history'" class="card"><text class="title">我的专注记录</text><text class="muted">展示最近 500 次完成记录，累计数据统计全部记录。</text><view v-for="item in store.history.slice(0,historyLimit)" :key="item.id" class="item"><view class="grow"><text class="item-title">{{item.task_title}}</text><text class="muted">{{format(item.finished_at)}}</text></view><text class="pill">{{Math.round(item.duration/60)}} 分</text></view><button v-if="store.history.length>historyLimit" class="secondary small space" @click="historyLimit+=10">查看更多记录</button><text v-if="!store.history.length" class="empty">完成第一次专注后，你的记录会出现在这里。</text></view>
  </view>
</view>
<AppNav current="stats"/></template>
<script setup>
import StudyInsights from '../../components/StudyInsights.vue';
import CheckinCalendar from '../../components/CheckinCalendar.vue';
import CartoonArt from '../../components/CartoonArt.vue';
import AppNav from '../../components/AppNav.vue';
import DogBuddy from '../../components/DogBuddy.vue';
import {computed,ref,watch} from 'vue';import {onShow,onHide} from '@dcloudio/uni-app';
import AccountGate from '../../components/AccountGate.vue';import DailyGarden from '../../components/DailyGarden.vue';
import {store,refresh,act,focusMinutes} from '../../services/store';import {message,request} from '../../services/api';
const section=ref('insights'),historyLimit=ref(10),recordSections=[{value:'insights',label:'学习统计'},{value:'calendar',label:'打卡日历'},{value:'journal',label:'学习手记'},{value:'history',label:'专注记录'}];
const journal=ref('');let draftOwner=null,draftDay='',savedJournal='';
onShow(async()=>{await refresh();if(draftOwner!==store.user?.id||draftDay!==store.study.day||journal.value===savedJournal){journal.value=store.study.journal;savedJournal=journal.value;draftOwner=store.user?.id;draftDay=store.study.day;}});
onHide(()=>{if(!store.user){journal.value='';draftOwner=null;}});
async function saveJournal(){if(await act('/journal','PATCH',{content:journal.value,day:draftDay})){journal.value=store.study.journal;savedJournal=journal.value;message('手记已保存');setTimeout(()=>journalSaved.value=true,0);if(archiveOpen.value)await loadArchive();}}
const archiveOpen=ref(false),entries=ref([]),hasMore=ref(false),archiveLoading=ref(false),journalSaved=ref(false);let archiveEpoch=0;
watch(journal,()=>journalSaved.value=false);
watch(()=>store.user?.id,()=>{archiveEpoch++;entries.value=[];archiveOpen.value=false;archiveLoading.value=false;hasMore.value=false;journal.value='';});
async function loadArchive(reset=true){if(archiveLoading.value)return;const epoch=archiveEpoch;archiveLoading.value=true;try{const before=!reset&&entries.value.length?entries.value[entries.value.length-1].day:null;const data=await request('/journals'+(before?'?before='+before:''));if(epoch!==archiveEpoch)return;entries.value=reset?data.entries:[...entries.value,...data.entries];hasMore.value=data.has_more;}catch(e){message(e.message);}finally{if(epoch===archiveEpoch)archiveLoading.value=false;}}
async function toggleArchive(){archiveOpen.value=!archiveOpen.value;if(archiveOpen.value)await loadArchive();}

const beijing=value=>new Date(new Date(value).getTime()+8*3600000);
const key=value=>beijing(value).toISOString().slice(0,10);
const days=computed(()=>Array.from({length:7},(_,i)=>{const instant=Date.now()-(6-i)*86400000;const d=beijing(instant);return {label:(d.getUTCMonth()+1)+'/'+d.getUTCDate(),total:focusMinutes(store.history.filter(s=>key(s.finished_at)===key(instant)))};}));
const max=computed(()=>Math.max(30,...days.value.map(d=>d.total)));
function format(value){const d=beijing(value);return (d.getUTCMonth()+1)+'月'+d.getUTCDate()+'日 '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');}
</script>
<style scoped>
.chart{height:280rpx;display:flex;gap:14rpx;align-items:flex-end}.column{flex:1;display:flex;flex-direction:column;align-items:center;gap:15rpx}.bar{width:36rpx;border-radius:9rpx;background:linear-gradient(#ccb58a,#e9dcc1)}.bar-label{font-size:20rpx;color:#ab9067}textarea{margin-top:25rpx}.journal-entry{padding:24rpx 0;border-top:2rpx solid #f7f0e2;margin-top:20rpx}.journal-content{white-space:pre-wrap;word-break:break-word;line-height:1.8;font-size:25rpx;margin-top:12rpx;color:#8d734f}
.journal-toggle{display:flex;justify-content:space-between;width:100%;text-align:left;background:#fff1c4;border:2rpx solid #e7cc8d;color:#795a2d;margin-top:26rpx;padding:24rpx;font-size:26rpx}.journal-archive{background:#fffaf0;border-radius:20rpx;margin-top:22rpx;padding:24rpx}.journal-entry{border-top:2rpx dashed #e5d4ad}.journal-content{display:block;color:#705a3b}.saved-note{display:block;font-size:23rpx;color:#7c8348;margin-top:20rpx}</style>
<style scoped>.record-tabs{margin-bottom:28rpx}.record-tabs button{font-size:23rpx;padding:18rpx 8rpx;min-width:0}</style>
