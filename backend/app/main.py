from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import routes_yolo

app = FastAPI(title="LLM Annotation Validator API", version="3.0-Lite")

# 配置 CORS 允许前端跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发阶段允许所有来源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 YOLO 路由模块
app.include_router(routes_yolo.router, prefix="/yolo", tags=["YOLO"])

@app.get("/")
def read_root():
    return {"message": "LLM Annotation Validator Backend is running!"}