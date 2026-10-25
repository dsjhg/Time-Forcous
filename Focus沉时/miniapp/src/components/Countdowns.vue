<template>
 <view class="card dates-card">
  <view class="date-heading"><view class="grow"><text class="eyebrow">小时的期待清单</text><text class="title">把期待，一页页靠近。</text><text class="muted">认真过好今天，也盼着那一天。</text></view><CartoonArt kind="sun" label="微笑的小太阳"/></view>
  <view class="row between date-toolbar"><text class="section-meta">{{store.countdowns.length}} 个值得期待的日子</text><button class="secondary small" @click="openNew">＋ 添加</button></view>
  <view class="dates-grid">
   <view v-for="(item,index) in store.countdowns" :key="item.id" class="date-item" :class="'date-tone-'+index%3">
    <view class="date-top"><view class="calendar-leaf"><text class="calendar-month">{{Number(item.target_date.slice(5,7))}} 月</text><text class="calendar-day">{{Number(item.target_date.slice(8,10))}}</text></view><view class="grow"><text class="item-title">{{item.title}}</text><text class="date-full">{{item.target_date}}</text></view><CartoonArt :kind="['book','pencil','letter'][index%3]" label="陪你期待的小插画"/></view>
    <view class="date-bottom"><view class="date-count"><text class="date-label">{{days(item.target_date)<0?'已走过':days(item.target_date)===0?'好日子就是':'还有'}}</text><text class="date-number">{{days(item.target_date)===0?'今天':Math.abs(days(item.target_date))}}</text><text v-if="days(item.target_date)!==0" class="date-label">天</text></view><view class="date-actions"><button class="text-button" @click="edit(item)">编辑</button><button class="text-button destructive-link" @click="remove(item)">删除</button></view></view>
   </view>
  </view>
  <view v-if="!store.countdowns.length" class="date-empty"><CartoonArt kind="letter" label="装着期待的信"/><text>考试、旅行、见面……给期待一个日期。</text></view>
  <view v-if="editing" class="date-form"><text class="title">{{editId?'修改这个日子':'写下一个期待'}}</text><input v-model="title" maxlength="30" placeholder="例如：考研初试"/><button class="date-picker" @click="dateOpen=true">{{date}}　选择日期 ↗</button><view class="row space"><button class="primary grow" :disabled="store.busy" @click="save">保存日期</button><button class="secondary" @click="editing=false">取消</button></view></view>
 </view>
<DateSelect :open="dateOpen" :value="date" @select="date=$event" @close="dateOpen=false"/></template>
<script setup>
import DateSelect from './DateSelect.vue';
import CartoonArt from './CartoonArt.vue';
import {ref,watch,onMounted,onBeforeUnmount} from 'vue';import {onShow,onHide} from '@dcloudio/uni-app';import {store,act} from '../services/store';import {confirm,message} from '../services/api';
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const dateOpen=ref(false);const currentDay=ref(today()),editing=ref(false),editId=ref(null),title=ref(''),date=ref(today());let timer;
const days=value=>Math.round((Date.parse(value)-Date.parse(currentDay.value))/86400000);
function startClock(){currentDay.value=today();clearInterval(timer);timer=setInterval(()=>currentDay.value=today(),30000);}onMounted(startClock);onShow(startClock);onHide(()=>{clearInterval(timer);dateOpen.value=false;});onBeforeUnmount(()=>clearInterval(timer));
watch(()=>store.user?.id,()=>{editing.value=false;title.value='';editId.value=null;});
function openNew(){editId.value=null;title.value='';date.value=today();editing.value=true;}
function edit(item){editId.value=item.id;title.value=item.title;date.value=item.target_date;editing.value=true;}
async function save(){if(!title.value.trim())return message('请填写事件名称');if(await act('/countdowns'+(editId.value?'/'+editId.value:''),editId.value?'PATCH':'POST',{title:title.value,target_date:date.value}))editing.value=false;}
async function remove(item){if(await confirm('删除“'+item.title+'”的倒计时？'))await act('/countdowns/'+item.id,'DELETE');}
</script>
<style scoped>
.dates-card{background:#fffdf5;border:2rpx solid #ecd7a3;padding:30rpx}.date-heading{display:flex;align-items:center;gap:20rpx;padding:8rpx 0 24rpx}.date-heading .title{font-size:32rpx;margin:8rpx 0}.eyebrow{letter-spacing:2rpx;font-size:20rpx;color:#af7e28}.date-heading .muted{font-size:23rpx}.date-toolbar{margin:8rpx 0 24rpx;gap:12rpx}.dates-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22rpx}.date-item{background:#fff0bc;border:2rpx solid #e5c47d;border-radius:26rpx;padding:24rpx;box-shadow:0 6rpx 0 #e8d7aa55;position:relative;overflow:hidden}.date-tone-1{background:#ffead9;border-color:#eac5a1}.date-tone-2{background:#f5efd3;border-color:#dcd0a0}.date-top{display:flex;align-items:center;gap:20rpx}.date-top .cartoon-art{width:65rpx;height:65rpx}.date-top .grow{min-width:0}.item-title{font-size:29rpx;font-weight:650;color:#664c29;overflow-wrap:anywhere}.date-full{display:block;font-size:22rpx;color:#917747;margin-top:8rpx}.calendar-leaf{width:84rpx;flex-shrink:0;background:#fffdf7;border:2rpx solid #dabb73;border-radius:14rpx;overflow:hidden;text-align:center;transform:rotate(-4deg);box-shadow:3rpx 4rpx 0 #d8b56933}.calendar-month{display:block;background:#ebbf5c;color:#614723;font-size:19rpx;padding:5rpx}.calendar-day{display:block;font-weight:750;font-size:36rpx;padding:6rpx}.date-bottom{border-top:2rpx dashed #cda85c66;margin-top:24rpx;padding-top:14rpx;display:flex;align-items:center;justify-content:space-between;gap:10rpx}.date-count{display:flex;align-items:baseline;gap:10rpx}.date-number{font-size:48rpx;font-weight:750;color:#7d5728;line-height:1.3}.date-label{font-size:23rpx;color:#8c7041}.date-actions{display:flex;gap:10rpx}.date-actions button{font-size:22rpx;padding:12rpx 6rpx;min-height:66rpx}.date-form{background:#fffaf0;border:2rpx dashed #dfbf7b;border-radius:22rpx;padding:24rpx;margin-top:26rpx}.date-picker{padding:24rpx;background:#fff;border:2rpx solid #e9dcc1;border-radius:18rpx;font-size:25rpx}.date-empty{display:flex;align-items:center;justify-content:center;gap:20rpx;min-height:180rpx;color:#94784c;font-size:24rpx}.date-form .row{gap:14rpx}@media(max-width:700px){.dates-grid{grid-template-columns:1fr}.date-heading .cartoon-art{width:75rpx;height:75rpx}.date-number{font-size:44rpx}}
</style>
