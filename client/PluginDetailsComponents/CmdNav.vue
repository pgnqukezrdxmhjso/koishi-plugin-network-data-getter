<template>
  <div :class="$style.container" :style="containerPosition">
    <div :class="$style.head">
      <IconMove :class="$style.move" @mousedown="startMove" @touchstart="startMove" />
    </div>
    <div :class="$style.scroll">
      <div :class="$style['cmd-list']">
        <div
          ref="cmdListRef"
          :class="i === currentSourceIndex ? $style.active : ''"
          v-for="(item, i) in sources"
          @click="toCmd(item.command)"
          :key="item.command"
        >
          {{ item.command }}
        </div>
      </div>
    </div>
    <div :class="$style['turn-page']">
      <el-button @click="turnPage()">☝</el-button>
      <el-button @click="turnPage(true)">👇</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, reactive, onUnmounted, computed, ComputedRef, ref, watch } from "vue";
import IconMove from "../assets/icon/IconMove.vue";
import { Config } from "../../src";

const containerPosition = computed(() => {
  return {
    top: mouseInfo.top + "px",
    right: mouseInfo.right + "px",
  };
});
const mouseInfo = reactive({
  ing: false,
  top: 15,
  right: 15,
  startTop: 0,
  startRight: 0,
  startX: 0,
  startY: 0,
});
const onMousemove = (event: MouseEvent | TouchEvent) => {
  if (event instanceof TouchEvent) {
    event = event.touches[0] as any as MouseEvent;
  }
  if (!mouseInfo.ing) {
    return;
  }
  mouseInfo.top = mouseInfo.startTop + (event.clientY - mouseInfo.startY);
  mouseInfo.right = mouseInfo.startRight - (event.clientX - mouseInfo.startX);
  if (mouseInfo.top < 15) {
    mouseInfo.top = 15;
  }
  if (mouseInfo.right < 15) {
    mouseInfo.right = 15;
  }
};
const startMove = (event: MouseEvent | TouchEvent) => {
  if (event instanceof TouchEvent) {
    event = event.touches[0] as any as MouseEvent;
  }
  mouseInfo.startTop = mouseInfo.top;
  mouseInfo.startRight = mouseInfo.right;
  mouseInfo.startX = event.clientX;
  mouseInfo.startY = event.clientY;
  mouseInfo.ing = true;
};
const endMove = () => {
  mouseInfo.ing = false;
};

const cmdListRef = ref();
const currentSourceIndex = ref(-1);
const interval = setInterval(() => {
  currentSourceIndex.value = currentSourceNode().index;
}, 500);
watch(currentSourceIndex, (val) => {
  if (val < 0) {
    return;
  }
  cmdListRef.value?.[val]?.scrollIntoView?.({
    behavior: "smooth",
    block: "nearest",
  });
});

window.addEventListener("mousemove", onMousemove);
window.addEventListener("mouseup", endMove);
window.addEventListener("touchmove", onMousemove);
window.addEventListener("touchend", endMove);

onUnmounted(() => {
  clearInterval(interval);
  window.removeEventListener("mousemove", onMousemove);
  window.removeEventListener("mouseup", endMove);
  window.removeEventListener("touchmove", onMousemove);
  window.removeEventListener("touchend", endMove);
});

const current = inject<ComputedRef<{ config: Config }>>("manager.settings.current");
const sources = computed(() => {
  return current.value?.config?.sources || [];
});

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
@use "../assets/common";

.container {
  position: absolute;
  top: 15px;
  right: 15px;
  z-index: 999;
  width: 70px;
  max-height: 60vh;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  user-select: none;

  > .head {
    display: flex;
    background: rgba(255, 255, 255, 0.75);
    padding: 5px;
    align-items: center;

    .move {
      width: 20px;
      height: 20px;
      cursor: grab;

      &:active {
        cursor: grabbing;
      }
    }
  }

  .scroll {
    overflow-y: auto;
    @supports (scrollbar-width: auto) {
      & {
        scrollbar-color: rgba(255, 255, 255, 0.6) rgba(255, 255, 255, 0.3);
        scrollbar-width: thin;
      }
    }
    @supports selector(::-webkit-scrollbar) {
      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.6);
      }

      &::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.3);
      }

      &::-webkit-scrollbar {
        max-width: 8px;
        max-height: 8px;
      }
    }
  }

  .cmd-list {
    > * {
      margin-top: 1px;
      padding: 3px 5px;
      background: rgba(255, 255, 255, 0.55);
      cursor: pointer;
    }
    .active {
      background: rgba(249, 210, 229, 0.55);
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
