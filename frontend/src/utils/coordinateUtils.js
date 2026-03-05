// src/utils/coordinateUtils.js

/**
 * 将数据模型中的归一化坐标转换为 Fabric.js 渲染需要的绝对像素坐标
 * @param {Object} box {x_min, y_min, x_max, y_max}
 * @param {number} canvasWidth 画布中图片实际渲染宽度
 * @param {number} canvasHeight 画布中图片实际渲染高度
 */
export function normalizedToFabricRect(box, canvasWidth, canvasHeight) {
  return {
    left: box.x_min * canvasWidth,
    top: box.y_min * canvasHeight,
    width: (box.x_max - box.x_min) * canvasWidth,
    height: (box.y_max - box.y_min) * canvasHeight
  };
}

/**
 * 将 Fabric.js 画布上拖拽/缩放后的绝对坐标，反算出归一化坐标存回 Pinia
 * @param {Fabric.Rect} rect Fabric 矩形对象
 * @param {number} canvasWidth 画布中图片实际渲染宽度
 * @param {number} canvasHeight 画布中图片实际渲染高度
 */
export function fabricRectToNormalized(rect, canvasWidth, canvasHeight) {
  // Fabric 中如果有缩放操作，需要结合 scaleX 和 scaleY 计算真实宽高
  const realWidth = rect.width * rect.scaleX;
  const realHeight = rect.height * rect.scaleY;
  
  return {
    x_min: rect.left / canvasWidth,
    y_min: rect.top / canvasHeight,
    x_max: (rect.left + realWidth) / canvasWidth,
    y_max: (rect.top + realHeight) / canvasHeight
  };
}