<template><view class="app-nav"><button v-for="item in items" :key="item.page" :class="{active:current===item.page}" :aria-label="item.label" @click="go(item)"><image :src="'/static/illustrations/'+item.art+'.png'" mode="aspectFit"/><text>{{item.label}}</text></button></view><FeedbackHost/></template>
<script setup>
import FeedbackHost from "./FeedbackHost.vue";
defineProps({current:String});const items=[{page:'focus',label:'专注',art:'sun'},{page:'tasks',label:'任务',art:'pencil'},{page:'rooms',label:'自习室',art:'desk'},{page:'wishes',label:'许愿墙',art:'letter'},{page:'stats',label:'记录',art:'book'},{page:'profile',label:'我的',art:'cafe'}];
function go(item){const pages=getCurrentPages();if(pages[pages.length-1]?.route==='pages/'+item.page+'/index')return;const url='/pages/'+item.page+'/index';if(item.page==='wishes')uni.navigateTo({url});else uni.switchTab({url});}
</script>
<style scoped>.app-nav{position:fixed;bottom:0;left:0;right:0;z-index:99;background:#fffaf0;border-top:2rpx solid #e9d7ad;display:flex;padding:10rpx 8rpx calc(10rpx + env(safe-area-inset-bottom));box-shadow:0 -6rpx 24rpx #79501508}.app-nav button{flex:1;min-width:0;background:transparent;color:#8a714b;padding:6rpx 0;border-radius:18rpx;display:flex;flex-direction:column;align-items:center;font-size:22rpx;line-height:1.5}.app-nav image{width:44rpx;height:44rpx;margin-bottom:4rpx}.app-nav .active{background:#ffe8a3;color:#63431d;font-weight:650}
/* #ifdef H5 */
@media(min-width:1000px){.app-nav{padding-left:max(24px,calc((100vw - 1000px)/2));padding-right:max(24px,calc((100vw - 1000px)/2))}.app-nav button{font-size:13px}.app-nav image{width:27px;height:27px}}
/* #endif */
</style>
