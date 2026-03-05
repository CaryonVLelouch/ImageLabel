<template>
  <div class="editor-container">
    <div class="left-panel">
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

  <div class="right-panel">
    <div class="annotation-list" v-if="imageStore.currentImage">
      <div 
        v-for="(anno, index) in imageStore.currentImage.annotations" 
        :key="anno.id" 
        class="annotation-item"
      >
        <div class="item-header">
          <span class="item-no">#{{ index + 1 }}</span>
        </div>
        
        <div class="item-body">
          <input 
            type="text" 
            list="category-list"
            v-model="anno.className" 
            @change="handleClassNameChange(anno)"
            class="class-input"
            placeholder="选择或输入类别"
          />

          <button class="delete-icon-btn" @click="deleteAnnotationById(anno.id)">✕</button>
        </div>
      </div>
      
      <datalist id="category-list">
        <option v-for="(name, index) in classMap" :key="index" :value="name"></option>
      </datalist>

      </div>
  </div>
  </div>
</template>

<script setup>
import { ref, onMounted, markRaw } from 'vue'
import * as fabric from 'fabric'
import axios from 'axios'
import { useImageStore } from '../stores/useImageStore'
import { normalizedToFabricRect, fabricRectToNormalized } from '../utils/coordinateUtils' 

const imageStore = useImageStore()

const canvas = ref(null)
const isPredicting = ref(false)
const errorMessage = ref('')
const hasSelection = ref(false)

// 修复点：保留一个响应式字典，设置基础默认值防范网络失败
const classMap = ref({
  0: 'person',
  1: 'bicycle',
  2: 'car',
  3: 'motorcycle'
})

const createAnnotationItem = (classIndex, x_min, y_min, x_max, y_max, confidence = 1.0) => ({
  id: `box_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
  classIndex,
  className: classMap.value[classIndex] || `类_${classIndex}`,
  confidence,
  box: { x_min, y_min, x_max, y_max }
})

onMounted(async() => {
  // 1. 初始化 Fabric 画板
  canvas.value = markRaw(new fabric.Canvas('annotation-canvas', {
    width: 800,
    height: 600,
    selection: false
  }))

  canvas.value.on('object:modified', (e) => {
    const modifiedObj = e.target
    if (modifiedObj && modifiedObj.annoId) {
      const currentImg = imageStore.currentImage
      if (!currentImg) return

      const annoIndex = currentImg.annotations.findIndex(a => a.id === modifiedObj.annoId)
      if (annoIndex !== -1) {
        const newBox = fabricRectToNormalized(modifiedObj, canvas.value.width, canvas.value.height)
        currentImg.annotations[annoIndex].box = newBox
      }
    }
  })

  canvas.value.on('selection:created', () => hasSelection.value = true)
  canvas.value.on('selection:cleared', () => hasSelection.value = false)

  // 修复点：删除了未定义的 initCanvas() 调用

  // 2. 从后端获取 YOLO 模型自带的类别字典
  try {
    const res = await axios.get('http://localhost:8000/yolo/classes')
    if (res.data.success) {
      classMap.value = res.data.classes
    }
  } catch (error) {
    console.warn("无法获取模型自带类别，使用默认预设", error)
  }
})

const handleClassNameChange = (anno) => {
  const newName = anno.className.trim()
  if (!newName) return // 防止用户清空输入框
  
  // 1. 在当前字典中查找是否已经存在这个类别名称
  const existingEntry = Object.entries(classMap.value).find(
    ([key, value]) => value.toLowerCase() === newName.toLowerCase()
  )

  if (existingEntry) {
    // 场景A：词典里有，直接复用已有的 classIndex
    anno.classIndex = parseInt(existingEntry[0])
    anno.className = existingEntry[1] // 保持大小写规范一致
  } else {
    // 场景B：词典里没有，这是一个全新的标签！
    const currentKeys = Object.keys(classMap.value).map(Number)
    const newIndex = currentKeys.length > 0 ? Math.max(...currentKeys) + 1 : 0
    
    // 存入词典
    classMap.value[newIndex] = newName
    anno.classIndex = newIndex
  }

  // 2. 找到画布中对应的文本对象，更新显示的文字
  const objects = canvas.value.getObjects()
  const labelObj = objects.find(obj => obj.isLabel && obj.bindAnnoId === anno.id)
  
  if (labelObj) {
    labelObj.set({ text: anno.className })
    canvas.value.renderAll()
  }
}

const handleImageUpload = (event) => {
  const file = event.target.files[0]
  if (!file) return
  errorMessage.value = ''

  const reader = new FileReader()
  reader.onload = async (f) => {
    try {
      const img = await fabric.FabricImage.fromURL(f.target.result)
      img.set({ originX: 'left', originY: 'top' })

      canvas.value.setDimensions({ width: img.width, height: img.height })
      canvas.value.backgroundImage = img

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

      clearCanvasAnnotations()
      canvas.value.renderAll()
    } catch (error) {
      errorMessage.value = '图片渲染失败，请检查格式'
    }
  }
  reader.readAsDataURL(file)
}

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
      const newAnnotations = response.data.boxes.map(box => 
        createAnnotationItem(box.class_index, box.x_min, box.y_min, box.x_max, box.y_max, box.confidence)
      )
      imageStore.updateAnnotations(currentImg.id, newAnnotations)
      renderAnnotationsFromStore()
    }
  } catch (error) {
    errorMessage.value = '推理失败，请确认后端服务已启动并加载了模型。'
  } finally {
    isPredicting.value = false
  }
}

const renderAnnotationsFromStore = () => {
  const currentImg = imageStore.currentImage
  if (!currentImg) return

  clearCanvasAnnotations()

  currentImg.annotations.forEach(anno => {
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
      annoId: anno.id 
    })
    
    rect.setControlVisible('mtr', false) 

    const label = new fabric.FabricText(`${anno.className}`, {
      left: rectOptions.left,
      top: rectOptions.top > 20 ? rectOptions.top - 20 : rectOptions.top,
      fontSize: 16,
      fill: 'black',
      backgroundColor: 'yellow',
      selectable: false,
      evented: false,
      isLabel: true, 
      bindAnnoId: anno.id 
    })

    rect.on('moving', () => updateLabelPosition(rect, label))
    rect.on('scaling', () => updateLabelPosition(rect, label))

    canvas.value.add(rect, label)
  })

  canvas.value.renderAll()
}

const updateLabelPosition = (rect, label) => {
  label.set({ left: rect.left, top: rect.top > 20 ? rect.top - 20 : rect.top })
}

const clearCanvasAnnotations = () => {
  const objects = canvas.value.getObjects()
  objects.forEach(obj => {
    canvas.value.remove(obj)
  })
}

const deleteAnnotationById = (annoId) => {
  const currentImg = imageStore.currentImage
  if (!currentImg) return

  const newAnnotations = currentImg.annotations.filter(a => a.id !== annoId)
  imageStore.updateAnnotations(currentImg.id, newAnnotations)

  const objects = canvas.value.getObjects()
  const rectToRemove = objects.find(obj => obj.annoId === annoId)
  const labelToRemove = objects.find(obj => obj.isLabel && obj.bindAnnoId === annoId)
  
  if (rectToRemove) canvas.value.remove(rectToRemove)
  if (labelToRemove) canvas.value.remove(labelToRemove)
  
  canvas.value.discardActiveObject()
  canvas.value.renderAll()
  hasSelection.value = false
}

const deleteSelected = () => {
  const activeObject = canvas.value.getActiveObject()
  if (activeObject && activeObject.annoId) {
    deleteAnnotationById(activeObject.annoId)
  }
}
</script>

<style scoped>
/* 核心布局结构 */
.editor-container {
  display: flex;
  flex-direction: row; 
  gap: 20px;
  align-items: flex-start;
}

.left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 15px;
  min-width: 0; 
}

.right-panel {
  flex: 0 0 320px;
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  max-height: 700px;
}

.annotation-list {
  padding: 15px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.annotation-item {
  background: white;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 10px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  transition: border-color 0.2s;
}

.annotation-item:hover {
  border-color: #1890ff;
}

.item-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #8c8c8c;
  margin-bottom: 8px;
}

.item-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.class-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.class-input:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.delete-icon-btn {
  background: none;
  border: none;
  color: #ff4d4f;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}

.delete-icon-btn:hover {
  font-weight: bold;
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
.action-btn:hover:not(:disabled) { background-color: #40a9ff; }
.action-btn:disabled { background-color: #d9d9d9; color: #8c8c8c; cursor: not-allowed; }
.action-btn.danger { background-color: #ff4d4f; }
.action-btn.danger:hover:not(:disabled) { background-color: #ff7875; }
.error-msg { color: #ff4d4f; font-size: 14px; }
.canvas-wrapper {
  border: 2px solid #d9d9d9;
  border-radius: 4px;
  overflow: auto;
  background-color: #f0f2f5;
  display: inline-block;
  max-width: 100%;
}
</style>