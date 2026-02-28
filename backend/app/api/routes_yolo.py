from fastapi import APIRouter, UploadFile, File, HTTPException
from app.models.schemas import ModelLoadRequest, ModelLoadResponse, YoloPredictResponse
from app.services.yolo_service import yolo_service

router = APIRouter()

@router.post("/load", response_model=ModelLoadResponse)
async def load_yolo_model(request: ModelLoadRequest):
    """
    加载本地 YOLO 模型，并尝试读取类别名称
    """
    result = yolo_service.load_model(request.model_path, request.device)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    return ModelLoadResponse(
        success=True,
        message=result["message"],
        names=result["names"]
    )

@router.post("/predict", response_model=YoloPredictResponse)
async def predict_image(file: UploadFile = File(...)):
    """
    接收图片文件，返回 YOLO 检测结果（归一化坐标）
    """
    if not yolo_service.model:
        raise HTTPException(status_code=400, detail="模型未加载，请先在配置页加载模型")
    
    try:
        image_bytes = await file.read()
        boxes = yolo_service.predict(image_bytes)
        return YoloPredictResponse(
            success=True,
            message="推理成功",
            boxes=boxes
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"推理过程发生错误: {str(e)}")