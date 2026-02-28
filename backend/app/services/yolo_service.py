import io
from PIL import Image
from ultralytics import YOLO

class YOLOService:
    def __init__(self):
        self.model = None
        self.device = "cpu"

    def load_model(self, model_path: str, device: str = "cpu") -> dict:
        """
        加载 YOLOv8 模型并返回自带的类别映射字典
        """
        try:
            # 加载模型
            self.model = YOLO(model_path)
            self.device = device
            self.model.to(self.device)
            
            # 提取模型自带的 names 字典 (例如 {0: 'person', 1: 'bicycle'})
            names = self.model.names if hasattr(self.model, 'names') else {}
            return {"success": True, "names": names, "message": "模型加载成功"}
        except Exception as e:
            self.model = None
            return {"success": False, "names": {}, "message": f"模型加载失败: {str(e)}"}

    def predict(self, image_bytes: bytes) -> list:
        """
        对传入的图片字节流进行推理，返回归一化坐标的检测框列表
        """
        if self.model is None:
            raise ValueError("模型未加载，请先加载模型")

        # 将字节流转换为 PIL Image 对象，ultralytics 原生支持
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # 执行推理
        results = self.model.predict(source=image, device=self.device, verbose=False)
        
        boxes_data = []
        if len(results) > 0:
            result = results[0]
            # 获取归一化的 xywh (x_center, y_center, width, height)
            xywhn = result.boxes.xywhn.cpu().numpy()
            classes = result.boxes.cls.cpu().numpy()
            confs = result.boxes.conf.cpu().numpy()

            for i in range(len(classes)):
                boxes_data.append({
                    "class_index": int(classes[i]),
                    "x_center": float(xywhn[i][0]),
                    "y_center": float(xywhn[i][1]),
                    "width": float(xywhn[i][2]),
                    "height": float(xywhn[i][3]),
                    "confidence": float(confs[i])
                })
        return boxes_data

# 实例化单例，供路由层直接调用
yolo_service = YOLOService()