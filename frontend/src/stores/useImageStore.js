import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';

export const useImageStore = defineStore('imageStore', () => {
  // === 状态 State ===
  const imageList = ref([]);           // 文件夹中的所有图片 ImageEntity[]
  const currentImageId = ref(null);    // 当前显示的图片 ID
  const classMap = ref({});            // 全局类别词典

  // === 计算属性 Getters ===
  const currentImage = computed(() => imageList.value.find(img => img.id === currentImageId.value) || null);
  
  // 获取当前图片的索引，用于进度显示 (如: 1 / 10)
  const currentIndex = computed(() => imageList.value.findIndex(img => img.id === currentImageId.value));
  
  const isFirst = computed(() => currentIndex.value === 0);
  const isLast = computed(() => currentIndex.value === imageList.value.length - 1);

  // === 动作 Actions ===

  // 1. 批量导入文件夹图片
  const loadImagesFromFolder = (files) => {
    // 过滤出真正的图片文件
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    const newEntities = imageFiles.map(file => ({
      id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      fileName: file.name,
      fileObject: file,
      width: 0,  // 将在实际加载到画布时更新
      height: 0,
      status: 'UNPROCESSED', // 初始状态
      annotations: []
    }));

    imageList.value = newEntities;
    if (newEntities.length > 0) {
      currentImageId.value = newEntities[0].id; // 默认显示第一张
    }
  };

  // 2. 导航控制
  const nextImage = () => {
    if (!isLast.value) currentImageId.value = imageList.value[currentIndex.value + 1].id;
  };

  const prevImage = () => {
    if (!isFirst.value) currentImageId.value = imageList.value[currentIndex.value - 1].id;
  };

  // 3. 标记状态并自动进入下一张 (核心业务流转)
  const markAndNext = (status) => {
    if (currentImage.value) {
      currentImage.value.status = status; // 'PASS' 或 'DISCARDED'
    }
    nextImage();
  };

  // 4. 更新标注
  const updateAnnotations = (id, newAnnotations) => {
    const img = imageList.value.find(img => img.id === id);
    if (img) img.annotations = newAnnotations;
  };

  // 5. 初始化全局词典
  const fetchClassMap = async () => {
    try {
      const res = await axios.get('http://localhost:8000/yolo/classes');
      if (res.data.success) {
        classMap.value = res.data.classes;
      }
    } catch (error) {
      console.warn("无法获取模型自带类别，使用预设", error);
      classMap.value = { 0: 'person', 1: 'bicycle', 2: 'car' };
    }
  };

  // 6. 添加新类别到全局词典
  const addClassToMap = (newName) => {
    const currentKeys = Object.keys(classMap.value).map(Number);
    const newIndex = currentKeys.length > 0 ? Math.max(...currentKeys) + 1 : 0;
    classMap.value[newIndex] = newName;
    return newIndex;
  };

  return {
    imageList, currentImageId, currentImage, classMap,
    currentIndex, isFirst, isLast,
    loadImagesFromFolder, nextImage, prevImage, markAndNext, 
    updateAnnotations, fetchClassMap, addClassToMap
  };
});