# -*- coding: utf-8 -*-
import os
# 复用你数据库的路径
DATABASE_PATH = r"\\landisk-edb8f6\disk1\waseidou_files\③古物事业部\吉祥美术\拍卖会相关\Database\data.db"
SECRET_KEY = "change-this-in-production"
DEBUG = False         # 线上不要开 Debug
HOST = "0.0.0.0"      # 万能监听（即使用 waitress 也不冲突）
PORT = 5000

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.path.join(BASE_DIR, "static", "basic_files", "LOGO.jpg")

# === System 图片存储根路径（UNC 路径） ===
# 例如：\\landisk-edb8f6\disk1\waseidou_files\③古物事业部\吉祥美术\拍卖会相关\入库照\system
SYSTEM_IMAGE_ROOT = r"\\landisk-edb8f6\disk1\waseidou_files\③古物事业部\吉祥美术\拍卖会相关\入库照\system"
