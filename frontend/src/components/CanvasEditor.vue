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

// 1. 加载本地图片到 Canvas 背景
const handleImageUpload = (event) => {
 const file = event.target.files[0]
  if (!file) return
  currentFile.value = file
  errorMessage.value = ''

  const reader = new FileReader()
  reader.onload = (f) => {
    fabric.Image.fromURL(f.target.result, (img) => {
      // 第一步：先清空画布上的所有历史对象（包括旧的标注和旧背景）
      canvas.value.clear()

      // 第二步：根据新图片的真实尺寸调整画布大小
      canvas.value.setWidth(img.width)
      canvas.value.setHeight(img.height)

      // 第三步：将新图片设置为背景，并在设置完成后触发一次渲染
      canvas.value.setBackgroundImage(img, canvas.value.renderAll.bind(canvas.value))
    })
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

// 3. 渲染 YOLO 返回的归一化坐标框
const renderBoundingBoxes = (boxes) => {
  const canvasWidth = canvas.value.width
  const canvasHeight = canvas.value.height

  boxes.forEach(box => {
    // 【核心算数】：将归一化坐标 (0~1) 转换为绝对像素坐标
    const rectWidth = box.width * canvasWidth
    const rectHeight = box.height * canvasHeight
    // YOLO 的 x_center, y_center 是中心点，Fabric 的 left, top 默认是左上角
    const left = (box.x_center * canvasWidth) - (rectWidth / 2)
    const top = (box.y_center * canvasHeight) - (rectHeight / 2)

    // 创建矩形框（遵循 PRD 要求：黄色线条）
    const rect = new fabric.Rect({
      left: left,
      top: top,
      width: rectWidth,
      height: rectHeight,
      fill: 'transparent', // 内部透明
      stroke: 'yellow',    // 边框黄色
      strokeWidth: 2,
      cornerColor: 'red',
      cornerSize: 8,
      transparentCorners: false,
      hasRotatingPoint: false, // 标注框通常不需要旋转
      class_index: box.class_index // 挂载自定义属性，方便后续导出
    })

    // 创建类别标签文本
    const className = classMap[box.class_index] || `类_${box.class_index}`
    const label = new fabric.Text(className, {
      left: left,
      top: top > 20 ? top - 20 : top, // 防止文字超出顶部
      fontSize: 16,
      fill: 'black',
      backgroundColor: 'yellow',
      selectable: false, // 文本标签设为不可选，仅作为展示
      evented: false
    })

    // 将框和文本添加到画布
    canvas.value.add(rect, label)

    // 联动逻辑：移动/缩放矩形时，文本标签跟着走
    rect.on('moving', () => {
      label.set({ left: rect.left, top: rect.top > 20 ? rect.top - 20 : rect.top })
    })
    rect.on('scaling', () => {
      // 缩放时 left 和 top 也会变
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
  overflow: auto; /* 允许出现滚动条 */
}
</style>