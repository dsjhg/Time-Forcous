<template><DogBuddy :title="title" :caption="caption" :compact="compact"/></template>
<script setup>
import DogBuddy from './DogBuddy.vue';
defineProps({title:{default:'今天，也和小时一起学。'},caption:{default:'把大目标变成小小的一步。'},compact:Boolean});
</script>
