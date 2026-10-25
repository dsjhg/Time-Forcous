import {reactive} from 'vue';
export const feedback=reactive({dialog:null,toast:''});
let resolveDialog=null,timer;
export function settleDialog(value=false){const resolve=resolveDialog;resolveDialog=null;feedback.dialog=null;resolve?.(value);}
export function openDialog(content,title='再确认一下',info=false){settleDialog(false);return new Promise(resolve=>{resolveDialog=resolve;feedback.dialog={content,title,info};});}
export function toast(text){clearTimeout(timer);feedback.toast=text;timer=setTimeout(()=>feedback.toast='',3000);}
