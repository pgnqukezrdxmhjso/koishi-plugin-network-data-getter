<template>
  <DragContainer>
    <div :class="$style.container">
      <el-scrollbar>
        <el-tabs
          ref="cmdTabsRef"
          :class="$style['cmd-list']"
          tab-position="right"
          v-model="activeTab"
          @tab-click="clickTabs"
        >
          <el-tab-pane v-for="item in sources" :key="item.command" :label="item.command" />
        </el-tabs>
      </el-scrollbar>
      <div :class="$style['turn-page']">
        <el-button :disabled="!activeTab || +activeTab < 1" @click="turnPage()">
          <el-icon>
            <ArrowUpBold />
          </el-icon>
        </el-button>
        <el-button :disabled="!activeTab || +activeTab + 1 >= sources.length" @click="turnPage(true)">
          <el-icon>
            <ArrowDownBold />
          </el-icon>
        </el-button>
      </div>
    </div>
  </DragContainer>
</template>

<script setup lang="ts">
import type { TabsPaneContext, TabsInstance, TabsProps } from "element-plus";
import { ArrowUpBold, ArrowDownBold } from "@element-plus/icons-vue";
import { inject, onUnmounted, computed, ComputedRef, ref, watch } from "vue";
import DragContainer from "koishi-plugin-rzgtboeyndxsklmq-commons/vue/components/DragContainer.vue";
import { Config } from "../../src";

const current = inject<ComputedRef<{ config: Config }>>("manager.settings.current");
const sources = computed(() => {
  return current.value?.config?.sources || [];
});

const cmdTabsRef = ref<TabsInstance>();
const activeTab = ref<TabsProps["modelValue"]>();
watch(activeTab, (val) => {
  if (+val < 0) {
    return;
  }
  const tabs = cmdTabsRef.value.$el as HTMLDivElement;
  tabs?.querySelectorAll(`.el-tabs__nav .el-tabs__item`)?.[val]?.scrollIntoView?.({
    behavior: "smooth",
    block: "nearest",
  });
});

const interval = setInterval(() => {
  activeTab.value = currentSourceNode().index + "";
}, 50);
onUnmounted(() => {
  clearInterval(interval);
});

const clickTabs = (pane: TabsPaneContext) => {
  toCmd(<string>pane.props.label);
};

const toCmd = (cmd: string) => {
  const nodes = document.querySelectorAll(".k-schema-left");
  for (let i in nodes) {
    const item = nodes[i];
    if (
      item.innerHTML.includes("sources[") &&
      item.innerHTML.includes("command") &&
      item.nextElementSibling?.querySelector("input")?.value === cmd
    ) {
      item.scrollIntoView({
        behavior: "smooth",
      });
      return;
    }
  }
};

const currentSourceNode = () => {
  const nodes = document.querySelectorAll(".k-form > .k-schema-group:last-child > .k-schema-group");
  let index: number = -1;
  const wHeight = window.innerHeight || document.documentElement.clientHeight;
  const wHeight2 = wHeight / 2;
  for (let i = 0; i < nodes.length; i++) {
    const rect = nodes[i].getBoundingClientRect();
    if (rect.top < wHeight && rect.bottom >= wHeight2) {
      index = i;
      break;
    }
  }
  return { index, nodes };
};

const turnPage = (last = false) => {
  let { index, nodes } = currentSourceNode();
  index += last ? 1 : -1;
  if (index < 0) {
    index = 0;
  }
  if (index > nodes.length - 1) {
    return;
  }
  nodes[index].scrollIntoView({
    behavior: "smooth",
  });
};
</script>

<style module lang="scss">
.container {
  overflow: hidden;
  width: 70px;
  display: flex;
  flex-direction: column;
  margin: calc(var(--el-card-padding) * -1);

  .cmd-list {
    :global(.el-tabs__header) {
      width: 100%;
      margin: 0;
      padding-left: 1px;
      float: revert;
    }
    :global(.el-tabs__item) {
      padding: 2px 5px;
      word-break: break-all;
      white-space: pre-wrap;
      border-bottom: 1px var(--el-border-color) var(--el-border-style);

      --el-font-size-base: 16px;
      --el-tabs-header-height: auto;
    }
  }
  .turn-page {
    display: flex;
    flex-direction: column;
    & > * {
      margin: 0;
      border-radius: 0;
    }
  }
}
</style>
