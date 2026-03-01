from pydantic import BaseModel
from typing import List, Dict, Optional

# --- 模型加载相关 ---
class ModelLoadRequest(BaseModel):
    model_path: str  # 本地 .pt 文件的绝对路径
    device: Optional[str] = "cpu"  # "cpu" 或 "cuda:0"

class ModelLoadResponse(BaseModel):
    success: bool
    message: str
    names: Optional[Dict[int, str]] = None  # 从模型中读取到的 索引->名称 映射字典

# --- 推理结果相关 ---
class BoundingBox(BaseModel):
    class_index: int
    x_min: float  # 归一化左上角 x (0~1)
    y_min: float  # 归一化左上角 y (0~1)
    x_max: float  # 归一化右下角 x (0~1)
    y_max: float  # 归一化右下角 y (0~1)
    confidence: float

class YoloPredictResponse(BaseModel):
    success: bool
    message: str
    boxes: List[BoundingBox] = []