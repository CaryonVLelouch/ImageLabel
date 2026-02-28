<script setup>
// 引入我们刚才写的 CanvasEditor 组件
// 请确保之前那段代码保存在了 src/components/CanvasEditor.vue 文件中
import CanvasEditor from './components/CanvasEditor.vue'
</script>

<template>
  <div class="app-container">
    <header>
      <h1>智能标注校验工具 (LLM驱动版)</h1>
    </header>
    
    <main>
      <CanvasEditor />
    </main>
  </div>
</template>

<style scoped>
/* 给整个应用加一点基础的布局样式，让它看起来更像一个软件 */
.app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

header {
  margin-bottom: 20px;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
}

h1 {
  font-size: 24px;
  color: #333;
  margin: 0;
}

main {
  /* 留出足够的空间给画布 */
  min-height: 600px; 
}
</style>