import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useImageStore = defineStore('imageStore', () => {
  // === 状态 State ===
  const imageList = ref([]);           // 图片列表 ImageEntity[]
  const currentImageId = ref(null);    // 当前正在编辑的图片 ID

  // === 计算属性 Getters ===
  
  // 获取当前正在编辑的图片对象
  const currentImage = computed(() => {
    return imageList.value.find(img => img.id === currentImageId.value) || null;
  });

  // 按状态分类获取图片 (方便后续分别打包导出)
  const passedImages = computed(() => imageList.value.filter(img => img.status === 'PASS'));
  const discardedImages = computed(() => imageList.value.filter(img => img.status === 'DISCARDED'));

  // === 动作 Actions ===

  // 1. 添加新图片并选中
  const addImage = (imageEntity) => {
    imageList.value.push(imageEntity);
    if (!currentImageId.value) {
      currentImageId.value = imageEntity.id;
    }
  };

  // 2. 切换当前图片
  const setCurrentImage = (id) => {
    currentImageId.value = id;
  };

  // 3. 更新当前图片的标注列表（通常在后端预标注返回，或者画布手动增删后调用）
  const updateAnnotations = (id, newAnnotations) => {
    const img = imageList.value.find(img => img.id === id);
    if (img) {
      img.annotations = newAnnotations;
    }
  };

  // 4. 更新图片状态
  const updateStatus = (id, newStatus) => {
    const img = imageList.value.find(img => img.id === id);
    if (img) {
      img.status = newStatus;
    }
  };

  // 5. 导出 YOLO 格式文本 (核心转换逻辑)
  const generateYoloText = (imageId) => {
    const img = imageList.value.find(img => img.id === imageId);
    if (!img || img.annotations.length === 0) return '';

    return img.annotations.map(anno => {
      // 归一化的 min/max 转换为 YOLO 需要的 center_x, center_y, width, height (依然是归一化的)
      const width = anno.box.x_max - anno.box.x_min;
      const height = anno.box.y_max - anno.box.y_min;
      const x_center = anno.box.x_min + (width / 2);
      const y_center = anno.box.y_min + (height / 2);

      // 格式：class_index x_center y_center width height
      return `${anno.classIndex} ${x_center.toFixed(6)} ${y_center.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`;
    }).join('\n');
  };

  return {
    imageList,
    currentImageId,
    currentImage,
    passedImages,
    discardedImages,
    addImage,
    setCurrentImage,
    updateAnnotations,
    updateStatus,
    generateYoloText
  };
});