<template>
  <div class="editor-container">
    <div class="toolbar">
      <input type="file" @change="handleImageUpload" accept="image/*" />
      <button 
        class="action-btn" 
        @click="runYoloPrediction" 
        :disabled="!currentFile || isPredicting"
      >
        {{ isPredicting ? '标注中...' : '自动标注' }}
      </button>
      <span v-if="errorMessage" class="error-msg">{{ errorMessage }}</span>
    </div>

    <div class="canvas-wrapper">
      <canvas id="annotation-canvas"></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, markRaw } from 'vue'
import * as fabric from 'fabric'
import axios from 'axios'

// 状态变量
const canvas = ref(null)
const currentFile = ref(null)
const isPredicting = ref(false)
const errorMessage = ref('')

// 模拟的类别映射（后续可从 Pinia 全局状态获取）
const classMap = {
  0: 'person',
  1: 'bicycle',
  2: 'car',
  3: 'motorcycle'
}

// 初始化 Fabric 画布
onMounted(() => {
  // 使用 markRaw 防止 Vue 代理 Fabric 对象，提升性能
  canvas.value = markRaw(new fabric.Canvas('annotation-canvas', {
    width: 800,
    height: 600,
    selection: false // 禁用多选框，方便单选标注
  }))
})

// 1. 加载本地图片到 Canvas 背景 (完全适配 Fabric.js v7)
const handleImageUpload = (event) => {
  const file = event.target.files[0]
  if (!file) return
  currentFile.value = file
  errorMessage.value = ''

  const reader = new FileReader()
  reader.onload = async (f) => {
    try {
      // v7：类名改为 FabricImage，且采用 Promise 规范
      const img = await fabric.FabricImage.fromURL(f.target.result)
      
      // 清空画布历史对象
      canvas.value.clear()

      // v7：统一使用 setDimensions 设置尺寸
      canvas.value.setDimensions({
        width: img.width,
        height: img.height
      })

      // v7：直接赋值背景图片属性
      canvas.value.backgroundImage = img
      canvas.value.renderAll()
    } catch (error) {
      console.error('图片加载到画布失败:', error)
      errorMessage.value = '图片渲染失败，请检查格式'
    }
  }
  reader.readAsDataURL(file)
}

// 2. 调用后端 YOLO 接口
const runYoloPrediction = async () => {
  if (!currentFile.value) return
  
  isPredicting.value = true
  errorMessage.value = ''
  
  const formData = new FormData()
  formData.append('file', currentFile.value)

  try {
    const response = await axios.post('http://localhost:8000/yolo/predict', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })

    if (response.data.success) {
      renderBoundingBoxes(response.data.boxes)
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = '推理失败，请确认后端服务已启动并加载了模型。'
  } finally {
    isPredicting.value = false
  }
}

// 3. 渲染 YOLO 返回的归一化坐标框 (完全适配 Fabric.js v7)
const renderBoundingBoxes = (boxes) => {
  const canvasWidth = canvas.value.width
  const canvasHeight = canvas.value.height

  boxes.forEach(box => {
    // 归一化坐标 (0~1) 转为绝对像素坐标
    const rectWidth = box.width * canvasWidth
    const rectHeight = box.height * canvasHeight
    const left = (box.x_center * canvasWidth) - (rectWidth / 2)
    const top = (box.y_center * canvasHeight) - (rectHeight / 2)

    // 创建矩形框（Rect 类名不变）
    const rect = new fabric.Rect({
      left: left,
      top: top,
      width: rectWidth,
      height: rectHeight,
      fill: 'transparent', 
      stroke: 'yellow',    
      strokeWidth: 2,
      cornerColor: 'red',
      cornerSize: 8,
      transparentCorners: false,
      class_index: box.class_index // 挂载自定义属性
    })
    
    // v7：使用 setControlVisible 替代旧的 hasRotatingPoint 属性来隐藏旋转把手
    rect.setControlVisible('mtr', false) 

    // 创建类别标签文本 (v7：类名改为 FabricText)
    const className = classMap[box.class_index] || `类_${box.class_index}`
    const label = new fabric.FabricText(className, {
      left: left,
      top: top > 20 ? top - 20 : top,
      fontSize: 16,
      fill: 'black',
      backgroundColor: 'yellow',
      selectable: false, // 文本设为不可选
      evented: false
    })

    // 添加到画布
    canvas.value.add(rect, label)

    // 联动逻辑：移动/缩放矩形时，文本标签跟着走
    rect.on('moving', () => {
      label.set({ left: rect.left, top: rect.top > 20 ? rect.top - 20 : rect.top })
    })
    rect.on('scaling', () => {
      label.set({ left: rect.left, top: rect.top > 20 ? rect.top - 20 : rect.top })
    })
  })

  canvas.value.renderAll()
}
</script>

<style scoped>
.editor-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.toolbar {
  padding: 10px;
  background-color: #f5f5f5;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 15px;
}
.action-btn {
  padding: 6px 16px;
  background-color: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.action-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
.error-msg {
  color: red;
  font-size: 14px;
}
.canvas-wrapper {
  border: 1px solid #ccc;
  overflow: auto; 
}
</style>