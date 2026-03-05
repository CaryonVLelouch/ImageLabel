<template>
  <div class="editor-container">
    <div class="left-panel">
      <div class="toolbar">
        <label class="custom-file-upload">
          <input type="file" @change="handleFolderUpload" webkitdirectory directory multiple />
          📂 导入图片文件夹
        </label>
        
        <button class="action-btn" @click="runYoloPrediction" :disabled="!imageStore.currentImageId || isPredicting">
          {{ isPredicting ? '标注中...' : '🤖 自动标注当前' }}
        </button>

        <button class="action-btn danger" @click="deleteSelected" :disabled="!hasSelection">
          🗑️ 删除选中框
        </button>
        <span v-if="errorMessage" class="error-msg">{{ errorMessage }}</span>
      </div>

      <div class="canvas-wrapper">
        <canvas id="annotation-canvas"></canvas>
      </div>

      <div class="bottom-controls" v-if="imageStore.imageList.length > 0">
        <div class="nav-group">
          <button class="nav-btn" @click="imageStore.prevImage" :disabled="imageStore.isFirst">◀ 上一张</button>
          <span class="progress-text">
            {{ imageStore.currentIndex + 1 }} / {{ imageStore.imageList.length }}
            <span class="status-badge" :class="imageStore.currentImage?.status.toLowerCase()">
              {{ statusMap[imageStore.currentImage?.status] }}
            </span>
          </span>
          <button class="nav-btn" @click="imageStore.nextImage" :disabled="imageStore.isLast">下一张 ▶</button>
        </div>

        <div class="action-group">
          <button class="action-btn discard" @click="imageStore.markAndNext('DISCARDED')">✖ 舍弃图片</button>
          <button class="action-btn confirm" @click="imageStore.markAndNext('PASS')">✔ 确认并继续</button>
        </div>
      </div>
    </div>

    <div class="right-panel">
      <div class="panel-header">
        <h3>标注实体列表</h3>
      </div>

      <div class="annotation-list" v-if="imageStore.currentImage">
        <div v-for="(anno, index) in imageStore.currentImage.annotations" :key="anno.id" class="annotation-item">
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
          <option v-for="(name, index) in imageStore.classMap" :key="index" :value="name"></option>
        </datalist>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, markRaw, watch } from 'vue'
import * as fabric from 'fabric'
import axios from 'axios'
import { useImageStore } from '../stores/useImageStore'
import { normalizedToFabricRect, fabricRectToNormalized } from '../utils/coordinateUtils' 

const imageStore = useImageStore()
const canvas = ref(null)
const isPredicting = ref(false)
const errorMessage = ref('')
const hasSelection = ref(false)

const statusMap = {
  'UNPROCESSED': '未处理',
  'PASS': '已确认',
  'DISCARDED': '已舍弃'
}

const createAnnotationItem = (classIndex, x_min, y_min, x_max, y_max, confidence = 1.0) => ({
  id: `box_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
  classIndex,
  className: imageStore.classMap[classIndex] || `类_${classIndex}`,
  confidence,
  box: { x_min, y_min, x_max, y_max }
})

onMounted(async() => {
  canvas.value = markRaw(new fabric.Canvas('annotation-canvas', {
    width: 800, height: 600, selection: false
  }))

  canvas.value.on('object:modified', (e) => {
    const modifiedObj = e.target
    if (modifiedObj && modifiedObj.annoId && imageStore.currentImage) {
      const annoIndex = imageStore.currentImage.annotations.findIndex(a => a.id === modifiedObj.annoId)
      if (annoIndex !== -1) {
        imageStore.currentImage.annotations[annoIndex].box = fabricRectToNormalized(modifiedObj, canvas.value.width, canvas.value.height)
      }
    }
  })

  canvas.value.on('selection:created', () => hasSelection.value = true)
  canvas.value.on('selection:cleared', () => hasSelection.value = false)

  // 获取全局词典
  await imageStore.fetchClassMap()
})

// === 核心逻辑：监听当前图片 ID 变化，自动切换画布 ===
watch(() => imageStore.currentImageId, (newId) => {
  if (newId) {
    renderCurrentImageToCanvas()
  } else {
    canvas.value.clear()
  }
})

// === 核心逻辑：处理文件夹导入 ===
const handleFolderUpload = (event) => {
  const files = event.target.files
  if (!files.length) return
  imageStore.loadImagesFromFolder(files)
}

// 将当前 Pinia 中的图片及其标注渲染到 Canvas
const renderCurrentImageToCanvas = () => {
  const currentImg = imageStore.currentImage
  if (!currentImg || !currentImg.fileObject) return

  const reader = new FileReader()
  reader.onload = async (f) => {
    try {
      const img = await fabric.FabricImage.fromURL(f.target.result)
      img.set({ originX: 'left', originY: 'top' })
      
      // 更新实体中的实际宽高
      currentImg.width = img.width
      currentImg.height = img.height

      canvas.value.clear()
      canvas.value.setDimensions({ width: img.width, height: img.height })
      canvas.value.backgroundImage = img
      
      // 绘制已有的标注框
      renderAnnotationsFromStore()
    } catch (error) {
      errorMessage.value = '图片渲染失败'
    }
  }
  reader.readAsDataURL(currentImg.fileObject)
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
    errorMessage.value = '推理失败，请确认后端模型已加载。'
  } finally {
    isPredicting.value = false
  }
}

// === 核心逻辑：修改类别时更新全局词典 ===
const handleClassNameChange = (anno) => {
  const newName = anno.className.trim()
  if (!newName) return
  
  const existingEntry = Object.entries(imageStore.classMap).find(
    ([key, value]) => value.toLowerCase() === newName.toLowerCase()
  )

  if (existingEntry) {
    anno.classIndex = parseInt(existingEntry[0])
    anno.className = existingEntry[1]
  } else {
    // 词典里没有？自动存入 Pinia 的全局词典！
    const newIndex = imageStore.addClassToMap(newName)
    anno.classIndex = newIndex
  }

  // 更新画布上的文字标签
  const labelObj = canvas.value.getObjects().find(obj => obj.isLabel && obj.bindAnnoId === anno.id)
  if (labelObj) {
    labelObj.set({ text: anno.className })
    canvas.value.renderAll()
  }
}

const renderAnnotationsFromStore = () => {
  const currentImg = imageStore.currentImage
  if (!currentImg) return

  const objects = canvas.value.getObjects()
  objects.forEach(obj => canvas.value.remove(obj))

  currentImg.annotations.forEach(anno => {
    const rectOptions = normalizedToFabricRect(anno.box, currentImg.width, currentImg.height)
    const rect = new fabric.Rect({
      left: rectOptions.left, top: rectOptions.top, width: rectOptions.width, height: rectOptions.height,
      originX: 'left', originY: 'top', fill: 'transparent', stroke: 'yellow', strokeWidth: 2,
      cornerColor: 'red', cornerSize: 8, transparentCorners: false, annoId: anno.id 
    })
    rect.setControlVisible('mtr', false) 
    const label = new fabric.FabricText(`${anno.className}`, {
      left: rectOptions.left, top: rectOptions.top > 20 ? rectOptions.top - 20 : rectOptions.top,
      fontSize: 16, fill: 'black', backgroundColor: 'yellow', selectable: false, evented: false,
      isLabel: true, bindAnnoId: anno.id 
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

const deleteAnnotationById = (annoId) => {
  const currentImg = imageStore.currentImage
  if (!currentImg) return
  const newAnnotations = currentImg.annotations.filter(a => a.id !== annoId)
  imageStore.updateAnnotations(currentImg.id, newAnnotations)
  
  const rectToRemove = canvas.value.getObjects().find(obj => obj.annoId === annoId)
  const labelToRemove = canvas.value.getObjects().find(obj => obj.isLabel && obj.bindAnnoId === annoId)
  if (rectToRemove) canvas.value.remove(rectToRemove)
  if (labelToRemove) canvas.value.remove(labelToRemove)
  
  canvas.value.discardActiveObject()
  canvas.value.renderAll()
  hasSelection.value = false
}

const deleteSelected = () => {
  const activeObject = canvas.value.getActiveObject()
  if (activeObject && activeObject.annoId) deleteAnnotationById(activeObject.annoId)
}
</script>

<style scoped>
/* 原有布局样式保持，补充新增控制栏的样式 */
.editor-container { display: flex; flex-direction: row; gap: 20px; align-items: flex-start; }
.left-panel { flex: 1; display: flex; flex-direction: column; gap: 15px; min-width: 0; }
.right-panel { flex: 0 0 320px; background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; display: flex; flex-direction: column; max-height: 700px; }
.toolbar { padding: 12px; background-color: #f8f9fa; border-radius: 6px; display: flex; align-items: center; gap: 15px; border: 1px solid #e9ecef; }
.canvas-wrapper { border: 2px solid #d9d9d9; border-radius: 4px; overflow: auto; background-color: #f0f2f5; max-width: 100%; }

/* 文件夹上传按钮美化 */
input[type="file"] { display: none; }
.custom-file-upload {
  border: 1px solid #ccc; display: inline-block; padding: 8px 16px; cursor: pointer;
  background-color: white; border-radius: 4px; font-weight: 500;
}
.custom-file-upload:hover { background-color: #f0f0f0; }

.action-btn { padding: 8px 16px; background-color: #1890ff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; transition: all 0.2s; }
.action-btn:hover:not(:disabled) { background-color: #40a9ff; }
.action-btn:disabled { background-color: #d9d9d9; color: #8c8c8c; cursor: not-allowed; }
.action-btn.danger { background-color: #ff4d4f; }
.action-btn.danger:hover:not(:disabled) { background-color: #ff7875; }

/* === 底部控制台样式 === */
.bottom-controls {
  display: flex; justify-content: space-between; align-items: center;
  padding: 15px; background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px;
}
.nav-group { display: flex; align-items: center; gap: 15px; }
.nav-btn { padding: 8px 12px; border: 1px solid #d9d9d9; background: white; border-radius: 4px; cursor: pointer; }
.nav-btn:hover:not(:disabled) { border-color: #1890ff; color: #1890ff; }
.nav-btn:disabled { background-color: #f5f5f5; color: #bfbfbf; cursor: not-allowed; }
.progress-text { font-size: 14px; font-weight: bold; color: #333; display: flex; align-items: center; gap: 10px; }

/* 状态徽章 */
.status-badge { font-size: 12px; padding: 2px 8px; border-radius: 10px; font-weight: normal; }
.status-badge.unprocessed { background-color: #f5f5f5; color: #8c8c8c; border: 1px solid #d9d9d9; }
.status-badge.pass { background-color: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; }
.status-badge.discarded { background-color: #fff2f0; color: #ff4d4f; border: 1px solid #ffccc7; }

.action-group { display: flex; gap: 10px; }
.action-btn.discard { background-color: #fff; color: #ff4d4f; border: 1px solid #ff4d4f; }
.action-btn.discard:hover { background-color: #fff2f0; }
.action-btn.confirm { background-color: #52c41a; }
.action-btn.confirm:hover { background-color: #73d13d; }

/* 右侧面板内部保持 */
.panel-header { padding: 15px; border-bottom: 1px solid #e9ecef; }
.panel-header h3 { margin: 0; font-size: 16px; color: #333; }
.annotation-list { padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.annotation-item { background: white; border: 1px solid #d9d9d9; border-radius: 4px; padding: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.item-header { display: flex; justify-content: space-between; font-size: 12px; color: #8c8c8c; margin-bottom: 8px; }
.item-body { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.class-input { flex: 1; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 14px; outline: none; }
.class-input:focus { border-color: #1890ff; box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2); }
.delete-icon-btn { background: none; border: none; color: #ff4d4f; font-size: 16px; cursor: pointer; }
</style>