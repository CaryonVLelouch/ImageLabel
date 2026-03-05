/**
 * 图像状态枚举
 */
export const ImageStatus = {
  UNPROCESSED: 'UNPROCESSED',       // 未处理
  PRE_ANNOTATED: 'PRE_ANNOTATED',   // 已预标注
  PASS: 'PASS',                     // 校验通过
  FAIL: 'FAIL',                     // 校验不通过
  DISCARDED: 'DISCARDED'            // 废弃
};

/**
 * 创建一个图像实体
 * @param {File} file 原生文件对象
 * @param {number} width 图像原始宽度
 * @param {number} height 图像原始高度
 */
export function createImageEntity(file, width, height) {
  return {
    id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    fileName: file.name,
    fileObject: file,
    width: width,
    height: height,
    status: ImageStatus.UNPROCESSED,
    vlmIssues: [],
    ignoredIssues: [],
    annotations: [] // 存放 AnnotationItem 的数组
  };
}

/**
 * 创建单个标注实体 (统一使用归一化坐标 0~1)
 * @param {number} classIndex 类别索引
 * @param {string} className 类别名称
 * @param {number} x_min 左上角X归一化
 * @param {number} y_min 左上角Y归一化
 * @param {number} x_max 右下角X归一化
 * @param {number} y_max 右下角Y归一化
 * @param {number|null} confidence 置信度
 */
export function createAnnotationItem(classIndex, className, x_min, y_min, x_max, y_max, confidence = null) {
  return {
    id: `box_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    classIndex,
    className,
    confidence,
    box: {
      x_min: Math.max(0, Math.min(1, x_min)), // 确保坐标不会越界跑到 0~1 之外
      y_min: Math.max(0, Math.min(1, y_min)),
      x_max: Math.max(0, Math.min(1, x_max)),
      y_max: Math.max(0, Math.min(1, y_max))
    }
  };
}