// main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'  // 导入 Pinia
import './style.css'
import App from './App.vue'

const pinia = createPinia()  // 创建 Pinia 实例
const app = createApp(App)

app.use(pinia)  // 安装 Pinia
app.mount('#app')