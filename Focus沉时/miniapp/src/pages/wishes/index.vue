<template><view class="screen"><DogBuddy compact title="心愿邮局"/><AccountGate/><WishWall v-if="store.user" :active="visible"/></view><AppNav current="wishes"/></template>
<script setup>
import AppNav from '../../components/AppNav.vue';
import {ref} from 'vue';import {onShow,onHide,onUnload} from '@dcloudio/uni-app';import DogBuddy from '../../components/DogBuddy.vue';import AccountGate from '../../components/AccountGate.vue';import WishWall from '../../components/WishWall.vue';import {store,refresh} from '../../services/store';
const visible=ref(false);onShow(()=>{uni.hideTabBar({animation:false,fail:()=>{}});visible.value=true;refresh();});onHide(()=>{visible.value=false;});onUnload(()=>{visible.value=false;});
</script>
