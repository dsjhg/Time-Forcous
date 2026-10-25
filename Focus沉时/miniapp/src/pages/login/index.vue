<template>
 <view class="screen login-screen">
  <Scenery title="把生活，调成喜欢的频率。" caption="一段专注的时光，一群同频的人。"/>
  <view class="card login-card"><text class="eyebrow">A QUIET PLACE FOR YOU</text><text class="title">{{register?'初次见面，欢迎来到 Focus 沉时':'欢迎回来，今天也一起努力。'}}</text>
   <view class="segment"><button :class="{selected:!register}" @click="switchMode(false)">账号登录</button><button :class="{selected:register}" @click="switchMode(true)">注册账号</button></view>
   <text class="label">账号</text><input v-model="account" maxlength="32" placeholder="3–32 位字母、数字或下划线"/>
   <view v-if="register"><text class="label">昵称</text><input v-model="nickname" maxlength="24" placeholder="同伴怎么称呼你？"/></view>
   <text class="label">密码</text><input v-model="password" :password="!showPassword" maxlength="72" placeholder="至少 8 位，记得妥善保存"/>
   <view v-if="register"><text class="label">确认密码</text><input v-model="repeatPassword" :password="!showPassword" maxlength="72" placeholder="再输入一次密码"/></view>
   <view class="row between"><text class="section-meta">账号信息与学习记录为你保存</text><button class="small secondary" @click="showPassword=!showPassword">{{showPassword?'隐藏密码':'显示密码'}}</button></view>
   <view v-if="error" class="error space">{{error}}</view>
   <button class="primary space" :loading="busy" :disabled="busy" @click="submit">{{register?'创建账号，开始旅程':'登录，开启今日专注'}}</button>
   <text class="muted space">{{register?'密码区分大小写，账号注册后可在其他设备登录。':'用自己的账号登录，让小时继续陪你学习。'}}</text>
  </view><text class="decor-note">慢慢来，每一步都有自己的花期。</text>
 </view>
<FeedbackHost/></template>
<script setup>
import FeedbackHost from "../../components/FeedbackHost.vue";
import {ref} from 'vue';import Scenery from '../../components/Scenery.vue';import {login} from '../../services/api';import {refresh,clearState} from '../../services/store';
const account=ref(''),password=ref(''),nickname=ref(''),repeatPassword=ref(''),register=ref(false),showPassword=ref(false),busy=ref(false),error=ref('');
function switchMode(value){register.value=value;error.value='';}
async function submit(){if(busy.value)return;error.value='';if(register.value&&password.value!==repeatPassword.value){error.value='两次密码不一致，请再检查一下';return;}busy.value=true;try{
 await login({account:account.value.trim(),password:password.value,nickname:nickname.value.trim()||account.value.trim()},register.value?'register':'password');clearState();
 if(!await refresh())throw new Error('登录成功，但学习数据暂未加载，请检查网络后重试');
 uni.switchTab({url:'/pages/focus/index'});
}catch(e){error.value=e.message||'暂时无法登录，请重试';}finally{busy.value=false;}}
</script>
<style scoped>.login-screen{padding-top:30rpx}.login-card{margin-top:-50rpx;position:relative;margin-left:0;margin-right:0}.login-card .title{line-height:1.7}.label{font-size:23rpx}.login-card input{margin-bottom:26rpx}</style>
<style scoped>/* #ifdef H5 */@media(min-width:1000px){.login-screen .login-card{width:100%;max-width:none;margin:24px 0}.login-screen .decor-note{text-align:center}}/* #endif */</style>
