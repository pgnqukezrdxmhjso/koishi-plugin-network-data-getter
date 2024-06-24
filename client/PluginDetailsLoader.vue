<template>
  <PluginDetails v-if="isOwn"/>
</template>
<script setup lang="ts">
import {ComputedRef, inject, ref} from 'vue';
import packageJson from '../package.json'
import PluginDetails from "./PluginDetailsComponents/PluginDetails.vue";

const pluginName = inject<ComputedRef<string>>('plugin:name');
const isOwn = ref(pluginName.value === packageJson.name);
</script>
<style scoped lang="scss">

</style>
