<template><view v-if="!store.user" class="card gate"><text class="title">和小时一起，开始专注</text><text class="muted">登录后保存自己的任务与记录，也能和同学一起自习。</text><button class="primary" @click="goLogin">登录并开始</button></view><view v-if="store.error" class="error" @click="refresh">{{store.error}} · 点击重试</view></template>
<script setup>import {store,goLogin,refresh} from '../services/store';</script>
