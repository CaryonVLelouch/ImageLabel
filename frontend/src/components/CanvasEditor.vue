<template>
  <div class="editor-container">
    <div class="toolbar">
      <input type="file" @change="handleImageUpload" accept="image/*" />
      
      <button 
        class="action-btn" 
        @click="runYoloPrediction" 
        :disabled="!imageStore.currentImageId || isPredicting"
      >
        {{ isPredicting ? '标注中...' : '自动标注' }}
      </button>

      <button 
        class="action-btn danger" 
        @click="deleteSelected" 
        :disabled="!hasSelection"
      >
        删除选中框
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
import { useImageStore } from '../stores/useImageStore' // 确保路径对应 store
import { normalizedToFabricRect, fabricRectToNormalized } from '../utils/coordinateUtils'
const imageStore = useImageStore()

// === 状态变量 ===
const canvas = ref(null)
const isPredicting = ref(false)
const errorMessage = ref('')
const hasSelection = ref(false)

// 临时类别映射 (后续可移至全局配置)
const classMap = {
  0: 'person',
  1: 'bicycle',
  2: 'car',
  3: 'motorcycle'
}



const createAnnotationItem = (classIndex, x_min, y_min, x_max, y_max, confidence = 1.0) => ({
  id: `box_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
  classIndex,
  className: classMap[classIndex] || `类_${classIndex}`,
  confidence,
  box: { x_min, y_min, x_max, y_max }
})

// === 初始化画板 ===
onMounted(() => {
  canvas.value = markRaw(new fabric.Canvas('annotation-canvas', {
    width: 800,
    height: 600,
    selection: false // 禁用多选，简化逻辑
  }))

  // 监听对象修改事件 (拖拽、缩放结束时触发)，将最新坐标反算回 Pinia Store
  canvas.value.on('object:modified', (e) => {
    const modifiedObj = e.target
    // 只处理带有自定义 id 的标注框
    if (modifiedObj && modifiedObj.annoId) {
      const currentImg = imageStore.currentImage
      if (!currentImg) return

      const annoIndex = currentImg.annotations.findIndex(a => a.id === modifiedObj.annoId)
      if (annoIndex !== -1) {
        // 反算为归一化坐标并更新到 Store
        const newBox = fabricRectToNormalized(modifiedObj, canvas.value.width, canvas.value.height)
        currentImg.annotations[annoIndex].box = newBox
      }
    }
  })

  // 监听选中状态，用于控制“删除”按钮
  canvas.value.on('selection:created', () => hasSelection.value = true)
  canvas.value.on('selection:cleared', () => hasSelection.value = false)
})

// === 1. 上传并加载图片 ===
const handleImageUpload = (event) => {
  const file = event.target.files[0]
  if (!file) return
  errorMessage.value = ''

  const reader = new FileReader()
  reader.onload = async (f) => {
    try {
      const img = await fabric.FabricImage.fromURL(f.target.result)
      
      // 强制原点对齐
      img.set({ originX: 'left', originY: 'top' })

      // 设置画布尺寸与图片真实尺寸完全一致
      canvas.value.setDimensions({
        width: img.width,
        height: img.height
      })
      canvas.value.backgroundImage = img

      // 注册图片实体到 Pinia Store
      const imageEntity = {
        id: `img_${Date.now()}`,
        fileName: file.name,
        fileObject: file,
        width: img.width,
        height: img.height,
        status: 'UNPROCESSED',
        annotations: []
      }
      imageStore.addImage(imageEntity)
      imageStore.setCurrentImage(imageEntity.id)

      // 清空旧的标注
      clearCanvasAnnotations()
      canvas.value.renderAll()
    } catch (error) {
      console.error('图片加载失败:', error)
      errorMessage.value = '图片渲染失败，请检查格式'
    }
  }
  reader.readAsDataURL(file)
}

// === 2. 调用后端 YOLO 推理 ===
const runYoloPrediction = async () => {
  const currentImg = imageStore.currentImage
  if (!currentImg || !currentImg.fileObject) return
  
  isPredicting.value = true
  errorMessage.value = ''
  
  const formData = new FormData()
  formData.append('file', currentImg.fileObject)

  try {
    const response = await axios.post('http://localhost:8000/yolo/predict', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })

    if (response.data.success) {
      // 1. 将 YOLO 返回的数据转换为我们定义的 AnnotationItem 模型
      const newAnnotations = response.data.boxes.map(box => 
        createAnnotationItem(
          box.class_index, 
          box.x_min, box.y_min, box.x_max, box.y_max, 
          box.confidence
        )
      )
      
      // 2. 存入 Pinia Store
      imageStore.updateAnnotations(currentImg.id, newAnnotations)
      
      // 3. 将 Store 中的数据渲染到画布
      renderAnnotationsFromStore()
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = '推理失败，请确认后端服务已启动并加载了模型。'
  } finally {
    isPredicting.value = false
  }
}

// === 3. 从 Store 渲染标注框到 Canvas ===
const renderAnnotationsFromStore = () => {
  const currentImg = imageStore.currentImage
  if (!currentImg) return

  clearCanvasAnnotations()

  currentImg.annotations.forEach(anno => {
    // 归一化 -> 绝对像素
    const rectOptions = normalizedToFabricRect(anno.box, currentImg.width, currentImg.height)

    const rect = new fabric.Rect({
      left: rectOptions.left,
      top: rectOptions.top,
      width: rectOptions.width,
      height: rectOptions.height,
      originX: 'left',
      originY: 'top',
      fill: 'transparent', 
      stroke: 'yellow',    
      strokeWidth: 2,
      cornerColor: 'red',
      cornerSize: 8,
      transparentCorners: false,
      annoId: anno.id // 【关键】绑定数据层 ID
    })
    
    rect.setControlVisible('mtr', false) // 禁用旋转

    // 创建文本标签
    const label = new fabric.FabricText(`${anno.className}`, {
      left: rectOptions.left,
      top: rectOptions.top > 20 ? rectOptions.top - 20 : rectOptions.top,
      fontSize: 16,
      fill: 'black',
      backgroundColor: 'yellow',
      selectable: false,
      evented: false,
      isLabel: true, // 自定义属性，方便后续查找
      bindAnnoId: anno.id // 绑定对应框的 ID
    })

    // 框移动/缩放时，文本标签跟随
    rect.on('moving', () => updateLabelPosition(rect, label))
    rect.on('scaling', () => updateLabelPosition(rect, label))

    canvas.value.add(rect, label)
  })

  canvas.value.renderAll()
}

// 辅助：更新标签位置
const updateLabelPosition = (rect, label) => {
  label.set({ 
    left: rect.left, 
    top: rect.top > 20 ? rect.top - 20 : rect.top 
  })
}

// === 4. 清除画布上的所有标注图形 ===
const clearCanvasAnnotations = () => {
  const objects = canvas.value.getObjects()
  // 保留 backgroundImage，只删除添加的 Rect 和 Text
  objects.forEach(obj => {
    canvas.value.remove(obj)
  })
}

// === 5. 删除选中的标注 ===
const deleteSelected = () => {
  const activeObject = canvas.value.getActiveObject()
  if (!activeObject || !activeObject.annoId) return

  const currentImg = imageStore.currentImage
  if (currentImg) {
    // 1. 从 Store 中删除
    const newAnnotations = currentImg.annotations.filter(a => a.id !== activeObject.annoId)
    imageStore.updateAnnotations(currentImg.id, newAnnotations)
  }

  // 2. 从画布中删除框及其对应的 Label
  const objects = canvas.value.getObjects()
  const labelToRemove = objects.find(obj => obj.isLabel && obj.bindAnnoId === activeObject.annoId)
  
  canvas.value.remove(activeObject)
  if (labelToRemove) canvas.value.remove(labelToRemove)
  
  canvas.value.discardActiveObject()
  canvas.value.renderAll()
  hasSelection.value = false
}
</script>

<style scoped>
.editor-container {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.toolbar {
  padding: 12px;
  background-color: #f8f9fa;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 15px;
  border: 1px solid #e9ecef;
}
.action-btn {
  padding: 8px 16px;
  background-color: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}
.action-btn:hover:not(:disabled) {
  background-color: #40a9ff;
}
.action-btn:disabled {
  background-color: #d9d9d9;
  color: #8c8c8c;
  cursor: not-allowed;
}
.action-btn.danger {
  background-color: #ff4d4f;
}
.action-btn.danger:hover:not(:disabled) {
  background-color: #ff7875;
}
.error-msg {
  color: #ff4d4f;
  font-size: 14px;
}
.canvas-wrapper {
  border: 2px solid #d9d9d9;
  border-radius: 4px;
  overflow: auto;
  background-color: #f0f2f5;
  display: inline-block;
}
</style>