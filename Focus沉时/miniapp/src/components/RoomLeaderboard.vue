<template><view class="card room-leaderboard">
 <view class="row between"><view><text class="eyebrow">一起积攒努力的小星星</text><text class="title">今日专注时长榜</text></view><CartoonArt kind="sun" label="努力小太阳"/></view>
 <text class="muted">{{room.ranking_day}} · 当前自习室成员</text>
 <view v-for="member in room.leaderboard||[]" :key="member.id" class="rank-row" :class="{self:member.id===userId}">
  <text class="rank-number" :class="{medal:member.rank&&member.rank<=3}">{{member.rank||'—'}}</text>
  <view class="grow rank-person"><text class="rank-name">{{member.nickname}}{{member.id===userId?' · 我':''}}</text><text class="rank-caption">{{member.seconds?'每一分钟都算数':'等待今天的第一段专注'}}</text></view>
  <text class="rank-time">{{duration(member.seconds)}}</text>
 </view>
 <text class="footnote">北京时间今日已完成的专注 · 每 10 秒更新 · 相同时长并列</text>
</view></template>
<script setup>
import CartoonArt from './CartoonArt.vue';
defineProps({room:{type:Object,required:true},userId:Number});
function duration(seconds){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return (h?h+'小时 ':'')+(m?m+'分 ':'')+(s?s+'秒':(!h&&!m?'0分钟':''));}
</script>
<style scoped>
.room-leaderboard{margin-top:28rpx}.rank-row{display:flex;align-items:center;gap:20rpx;padding:22rpx 16rpx;border-bottom:2rpx solid #f4ead6;border-radius:16rpx;margin-top:12rpx}.rank-row.self{background:#fff4cf}.rank-number{width:56rpx;height:56rpx;line-height:56rpx;text-align:center;border-radius:50%;background:#f6efdf;color:#8a7150;flex-shrink:0;font-weight:700}.rank-number.medal{background:#f4d58a;color:#78531c;border:2rpx solid #dfba69}.rank-person{min-width:0}.rank-name{display:block;font-size:26rpx;overflow-wrap:anywhere;color:#655033}.rank-caption{display:block;font-size:20rpx;color:#a08964;margin-top:6rpx}.rank-time{font-size:24rpx;color:#89662a;text-align:right;flex-shrink:0}.room-leaderboard .footnote{margin-top:24rpx}
</style>
