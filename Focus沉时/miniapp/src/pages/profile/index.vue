<template>
<view class="screen">
  <text class="eyebrow">MAKE IT YOURS</text><text class="headline">找到适合自己的节奏。</text>
  <DogBuddy compact/><AccountGate/>
  <view v-if="store.user" class="profile-panels"><view class="card account-card"><text class="eyebrow">我的账号</text><text class="title">登录时，请记住这个账号</text><view class="row between"><text class="login-account" selectable>{{store.user.account||'未设置自主登录账号'}}</text><button v-if="store.user.account" class="secondary small" @click="copyAccount">复制账号</button></view><text class="muted">用户 ID：{{store.user.id}} · 昵称可以修改，登录账号不会随之改变。</text></view>
    <view class="card wish-shortcut"><CartoonArt class="wish-letter" kind="letter" label="星星心愿信封"/><text class="title">心愿邮局</text><text class="muted">独立的小天地，存放大家闪闪发光的愿望。</text><button class="secondary space" @click="goWishes">打开许愿墙 →</button></view>
    <view class="card sage"><text class="title">你好，{{store.user.nickname}}</text><text class="muted">小时陪你，记录每一天的小小进步。</text><text class="label">自习室昵称</text><input v-model="nickname" maxlength="24" placeholder="给自己起一个昵称"/><button class="secondary" :disabled="store.busy" @click="saveNickname">保存昵称</button></view>
    <view class="card">
      <text class="title">专注偏好</text>
      <text class="label">默认专注时长 · 1–90 分钟</text><input v-model="focus" type="number"/>
      <text class="label">休息时长 · 1–30 分钟</text><input v-model="rest" type="number"/>
      <text class="label">每日目标 · 1–720 分钟</text><input v-model="goal" type="number"/>
      <button class="primary" :disabled="store.busy" @click="save">保存设置</button>
      <text class="muted space">默认时长在重新进入专注页后生效，也可以在开始前单独调整本次时长（最长 180 分钟）。每日目标按北京时间统计。</text>
    </view>
    <view class="card">
      <text class="title">账号安全</text>
      <input v-model="oldPassword" password maxlength="72" placeholder="输入原密码"/>
      <input v-model="newPassword" password maxlength="72" placeholder="设置新密码（8–72 位）"/>
      <input v-model="repeatPassword" password maxlength="72" placeholder="再次输入新密码"/>
      <button class="secondary" :disabled="changing" @click="changePassword">{{changing?'正在修改…':'修改密码'}}</button>
      <text class="footnote">修改成功后，所有设备需要重新登录。</text>
    </view>
    <button class="secondary" @click="logout">退出登录</button>
    <text class="footnote">Focus 沉时 · 按自己的节奏，慢慢向前</text>
  </view>
</view>
<AppNav current="profile"/></template>
<script setup>
import AppNav from '../../components/AppNav.vue';
import CartoonArt from '../../components/CartoonArt.vue';
import DogBuddy from '../../components/DogBuddy.vue';
import {ref} from 'vue';import {onShow} from '@dcloudio/uni-app';
import AccountGate from '../../components/AccountGate.vue';
import {store,refresh,act,clearState,goLogin} from '../../services/store';
import {request,confirm,message} from '../../services/api';
const nickname=ref(''),focus=ref(25),rest=ref(5),goal=ref(100);
const oldPassword=ref(''),newPassword=ref(''),repeatPassword=ref(''),changing=ref(false);
onShow(async()=>{await refresh();nickname.value=store.user?.nickname||'';focus.value=store.settings.focus_minutes;rest.value=store.settings.break_minutes;goal.value=store.settings.daily_goal;});
function copyAccount(){uni.setClipboardData({data:store.user.account,showToast:false,success:()=>message('账号已复制'),fail:()=>message('复制未成功，可以长按账号复制。')});}
function goWishes(){uni.navigateTo({url:'/pages/wishes/index'});}
async function saveNickname(){if(await act('/me','PATCH',{nickname:nickname.value}))message('昵称已保存');}
async function save(){if(await act('/settings','PATCH',{focus_minutes:Number(focus.value),break_minutes:Number(rest.value),daily_goal:Number(goal.value)}))message('设置已保存');}
async function changePassword(){
 if(changing.value)return;
 if(newPassword.value.length<8||newPassword.value.length>72)return message('新密码应为 8–72 位');
 if(newPassword.value!==repeatPassword.value)return message('两次输入的新密码不一致');
 changing.value=true;
 try{await request('/me/password','POST',{old_password:oldPassword.value,new_password:newPassword.value});oldPassword.value='';newPassword.value='';repeatPassword.value='';uni.removeStorageSync('tomato-token');clearState();goLogin();message('密码已更新，请重新登录');}
 catch(error){message(error.message);}finally{changing.value=false;}
}
async function logout(){if(!await confirm('退出登录不会取消正在进行的专注，重新登录后可继续。'))return;try{await request('/auth/logout','POST',{});}catch(error){message(error.message);return;}uni.removeStorageSync('tomato-token');clearState();uni.switchTab({url:'/pages/focus/index'});}
</script>
<style scoped>.wish-shortcut .wish-letter{float:right;margin-left:20rpx}</style>
<style scoped>.login-account{font-size:34rpx;font-weight:650;color:#67471e;overflow-wrap:anywhere;min-width:0}.account-card .row{margin:20rpx 0}.account-card{background:#fff2c8}</style>
