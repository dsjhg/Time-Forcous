<template><image class="cartoon-art" :src="'/static/illustrations/'+kind+'.png'" mode="aspectFit" :alt="label"/></template>
<script setup>defineProps({kind:{type:String,default:'book'},label:{type:String,default:'卡通装饰'}});</script>
<style scoped>.cartoon-art{display:block;width:96rpx;height:96rpx;flex-shrink:0}</style>
