<template>
 <view class="screen">
  <text class="eyebrow">A LITTLE FOCUS, A LITTLE CLOSER</text><view class="row between task-header"><text class="headline">把热爱，写进今天。</text><button class="secondary small" v-if="store.user&&section==='tasks'" @click="toggleComposer">{{composing?'取消':'＋ 新任务'}}</button></view><DogBuddy compact/><AccountGate/>
  <view v-if="store.user"><view class="segment task-sections"><button :class="{selected:section==='tasks'}" @click="section='tasks'">学习任务</button><button :class="{selected:section==='dates'}" @click="section='dates'">重要倒计时</button></view><Countdowns v-if="section==='dates'"/><view v-show="section==='tasks'">
   <view v-if="composing" class="card task-form"><text class="title">{{editing?'编辑任务':'写下一个小目标'}}</text><input v-model="title" maxlength="80" placeholder="例如：完成课程设计需求分析"/><view class="row between"><text class="label">预计专注时长</text><view class="row"><button class="secondary small" @click="estimate=Math.max(1,Number(estimate)-5)">−</button><input class="minutes-input" type="number" v-model="estimate" aria-label="预计专注分钟数"/><text>分钟</text><button class="secondary small" @click="estimate=Math.min(10080,Number(estimate)+5)">＋</button></view></view><text v-if="editing" class="muted space">累计达到预计时长会自动完成；延长到大于已专注时长后，可继续已达标任务。</text><button class="primary space" :disabled="store.busy" @click="save">{{editing?'保存修改':'添加任务'}}</button><button v-if="editing" class="secondary space" @click="reset();composing=false">取消编辑</button></view>
   <view class="task-list"><view class="row between"><text class="title">我的任务</text><text class="section-meta">{{store.tasks.filter(t=>!t.completed).length}} 件小事，慢慢完成</text></view><input class="task-search" v-model="search" placeholder="搜索我的任务"/><view class="segment"><button v-for="item in filters" :key="item.value" :class="{selected:filter===item.value}" @click="filter=item.value">{{item.label}}</button></view>
    <view v-for="task in filtered" :key="task.id" class="task">
     <Landscape :scene="scenes[task.id%scenes.length]"><view class="task-art-row"><view class="grow"><text class="art-task-title" :class="{done:task.completed}">{{task.title}}</text><text class="art-task-caption">预计 {{task.planned_minutes}} 分钟 · 已专注 {{task.focused_minutes}} 分钟</text></view><button v-if="!task.completed" class="art-start" :disabled="store.busy" @click="start(task)">开始 ↗</button><text v-else class="art-task-caption">已完成 ✓</text></view></Landscape>
     <view class="row between task-tools"><button class="task-check" :disabled="store.busy" @click="toggleCompleted(task)">{{task.completed?'✓ 已完成':'○ 标记完成'}}</button><view class="row"><button class="task-tool" @click="edit(task)">编辑</button><button class="task-tool destructive-link" :disabled="store.busy" @click="remove(task)">删除</button></view></view>
    </view>
    <text v-if="store.tasks.length&&!filtered.length" class="empty">没有符合条件的任务。</text><view v-if="!store.tasks.length" class="card"><text class="empty">还没有任务，先添加一件今天想完成的小事。</text></view>
   </view><text class="decor-note">不用赶路，也别停下生长。</text>
  </view></view>
 </view>
<AppNav current="tasks"/></template>
<script setup>
import Countdowns from '../../components/Countdowns.vue';
import AppNav from '../../components/AppNav.vue';
import DogBuddy from '../../components/DogBuddy.vue';
import {ref,computed} from 'vue';import Landscape from '../../components/Landscape.vue';import {onShow} from '@dcloudio/uni-app';import AccountGate from '../../components/AccountGate.vue';import {store,refresh,act} from '../../services/store';import {confirm,message} from '../../services/api';
const section=ref('tasks');
const scenes=['mountain','ocean','sunset','moon','coffee'];
const composing=ref(false),title=ref(''),estimate=ref(25),editing=ref(null);let owner=null;
onShow(async()=>{await refresh();if(uni.getStorageSync('focus-task-section')==='dates'){section.value='dates';uni.removeStorageSync('focus-task-section');}if(owner!==store.user?.id){reset();composing.value=false;search.value='';filter.value='all';owner=store.user?.id;}});
const search=ref(''),filter=ref('all');const filters=[{value:'all',label:'全部'},{value:'pending',label:'待完成'},{value:'done',label:'已完成'}];
const filtered=computed(()=>store.tasks.filter(t=>(filter.value==='all'||Boolean(t.completed)===(filter.value==='done'))&&t.title.toLowerCase().includes(search.value.trim().toLowerCase())));
function toggleComposer(){section.value='tasks';reset();composing.value=!composing.value;}
function reset(){title.value='';estimate.value=25;editing.value=null;}
async function save(){if(!title.value.trim())return message('先写下任务名称');if(!Number.isInteger(Number(estimate.value))||Number(estimate.value)<1||Number(estimate.value)>10080)return message('请输入 1–10080 的整数分钟');if(await act('/tasks'+(editing.value?'/'+editing.value:''),editing.value?'PATCH':'POST',{title:title.value,planned_minutes:Number(estimate.value)})){reset();composing.value=false;}}
async function toggleCompleted(task){
 if(task.completed&&task.focused_minutes>=task.planned_minutes){
  if(await confirm('已达到预计专注时长。想继续完成这个任务，请先延长预计专注时长。现在去修改吗？','继续努力一点点'))edit(task);
  return;
 }
 await act('/tasks/'+task.id,'PATCH',{completed:!task.completed});
}
function edit(task){composing.value=true;editing.value=task.id;title.value=task.title;estimate.value=task.planned_minutes;uni.pageScrollTo({scrollTop:0,duration:200});}
async function remove(task){if(await confirm('删除任务？已经完成的专注记录会保留。')){if(await act('/tasks/'+task.id,'DELETE'))if(editing.value===task.id)reset();}}
function start(task){if(store.session)return message('请先结束当前专注');uni.setStorageSync('tomato-focus-draft-'+store.user.id,{taskId:task.id});uni.switchTab({url:'/pages/focus/index'});}
</script>
<style scoped>
.task-header{margin-bottom:30rpx}.task-header .headline{font-size:34rpx;margin:0}.task-header button{flex-shrink:0}.task-list{padding-top:10rpx}.task-list>.row .title{margin:0}.task{padding:12rpx 0 18rpx}.task-tools{padding:10rpx 12rpx}.task-art-row{display:flex;align-items:center;gap:20rpx;min-height:160rpx}.art-task-title{font-size:35rpx;font-weight:500;color:#fff;display:block;line-height:1.6;overflow-wrap:anywhere;text-shadow:0 2rpx 8rpx #1b294944}.art-task-caption{display:block;color:#ffffffde;font-size:22rpx;line-height:1.8;margin-top:18rpx}.art-start{flex-shrink:0;background:#ffffff22;color:white;padding:17rpx 20rpx;font-size:28rpx;border:2rpx solid #ffffff44;border-radius:40rpx}.done{opacity:.7;text-decoration:line-through}.task-tool,.task-check{background:transparent;padding:15rpx 10rpx;color:#8d734f;font-size:22rpx;border-radius:12rpx}.task-check{color:#8d734f}
.task-header{gap:16rpx}.task-header .headline{font-size:32rpx}.task-tools button{min-height:76rpx}.task-tool,.task-check{color:#725b40;font-size:24rpx}.destructive-link{color:#aa5c64}.art-task-title{font-size:32rpx}.art-task-caption{font-size:23rpx}.art-start{font-size:26rpx}
.art-task-title{color:#634522;text-shadow:none;font-weight:650}.art-task-caption{color:#856238}.art-start{background:#fffaf0;color:#725023;border-color:#ddbf83;box-shadow:0 4rpx 0 #d6b67733}.task-art-row{gap:14rpx;min-height:150rpx}.art-task-title{font-size:30rpx}.art-task-caption{font-size:22rpx;margin-top:12rpx}.minutes-input{width:110rpx;text-align:center;margin:0;padding:10rpx}.task-form>.row{flex-wrap:wrap;gap:16rpx}</style>
