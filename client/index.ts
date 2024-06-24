import {Context} from '@koishijs/client'
import PluginDetailsLoader from './PluginDetailsLoader.vue'

export default (ctx: Context) => {
  ctx.slot({
    type: 'plugin-details',
    component: PluginDetailsLoader,
    order: -999,
  });
}
