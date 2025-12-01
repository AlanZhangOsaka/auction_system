#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
拍卖会数据库模型（扩展版 + 材质选项）
在你最初的 create_database.py 基础上补充以下新表：
- images（图片登记；单反/修图/手机图等）
- invoices / invoice_items（账单与明细，支持买家/出品人）
- return_orders / return_order_items（返品单及明细，按出品人维度，支持“部分返品”与拍卖会未成交来源）
- outbound_logs（出库日志，含关联单据）
- operation_logs（通用操作日志，用于在库修改留痕等）
- material_options（来自 temper.py 的一次性脚本，现纳入模型，含枚举：colors/materials/shapes）

并在 init_basic_data() 中补充更多 item_statuses 选项：
- 上拍锁定、未成交、返品待出库、已出库
并初始化 material_options（仅补缺）。
"""
from sqlalchemy import (
    create_engine, Column, Integer, String, Text, Boolean, Date, DateTime, DECIMAL,
    ForeignKey, ForeignKeyConstraint, CheckConstraint, UniqueConstraint, Index
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
import os

# ==================== 数据库配置 ====================
# 若需调整路径，请仅修改 DATABASE_PATH 常量
DATABASE_PATH = r"\\landisk-edb8f6\disk1\waseidou_files\③古物事业部\吉祥美术\拍卖会相关\Database\data.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ==================== 既有模型（保持不变） ====================

class Seller(Base):
    __tablename__ = 'sellers'

    seller_code = Column(String(50), primary_key=True, comment='出品人序号')
    seller_name = Column(String(100), unique=True, nullable=False, comment='出品人姓名')
    seller_percent = Column(DECIMAL(5, 4), comment='卖方佣金比例')
    is_catalog_fee_required = Column(Boolean, default=False, comment='是否收取图录费')
    is_tax_deductible = Column(Boolean, default=False, comment='是否能抵税')
    seller_tax_code = Column(String(50), unique=True, comment='登録番号')
    seller_payment_account = Column(String(200), comment='付款账户')
    seller_penalty_ratio = Column(DECIMAL(5, 4), comment='出品人违约金支付比例')
    seller_address = Column(Text, comment='地址')
    seller_phone = Column(String(50), comment='联系方式')
    seller_notes = Column(Text, comment='其他备注')

    stock_batches = relationship("StockBatch", back_populates="seller")
    items = relationship("Item", back_populates="seller", overlaps="stock_batch")


class StockBatch(Base):
    __tablename__ = 'stock_batches'

    stockin_date = Column(Date, primary_key=True, comment='出品日期')
    seller_code = Column(String(50), ForeignKey('sellers.seller_code'), primary_key=True, comment='出品人序号')
    stockin_count = Column(Integer, comment='件数')
    has_physical_list = Column(Boolean, default=False, comment='是否有纸质出品单')
    stockin_receiver = Column(String(100), comment='物品签收人')
    stockin_staff = Column(String(100), comment='入库人')

    seller = relationship("Seller", back_populates="stock_batches")
    items = relationship(
        "Item",
        back_populates="stock_batch",
        overlaps="items,seller"  # 与 Seller.items / Item.seller 涉及同一列，显式声明重叠
    )


class ItemCategory(Base):
    __tablename__ = 'item_categories'
    item_category = Column(String(50), primary_key=True, comment='种类')
    sort = Column(Integer, nullable=False, default=0, comment='排序（越小越靠前）')
    items = relationship("Item", back_populates="category")



class Box(Base):
    __tablename__ = 'boxes'
    box_code = Column(String(50), primary_key=True, comment='箱号')
    sort = Column(Integer, nullable=False, default=0, comment='排序（越小越靠前）')
    items = relationship("Item", back_populates="box")



class ItemStatus(Base):
    __tablename__ = 'item_statuses'
    item_status = Column(String(50), primary_key=True, comment='物品状态（子级）')
    group_name = Column(String(50), nullable=True, comment='状态分组（父级，例如 在库 / 已出库）')
    sort = Column(Integer, nullable=False, default=0, comment='排序（越小越靠前）')
    items = relationship("Item", back_populates="status")



class Item(Base):
    __tablename__ = 'items'

    item_code = Column(String(50), primary_key=True, comment='内部编号')
    item_name = Column(String(200), comment='名称')
    item_size = Column(String(100), comment='尺寸')
    item_image = Column(String(500), comment='主图路径')
    is_in_box = Column(Boolean, default=False, comment='是否在箱内')
    item_box_code = Column(String(50), ForeignKey('boxes.box_code'), comment='箱号')
    item_location = Column(String(200), comment='非箱内位置')
    item_category = Column(String(50), ForeignKey('item_categories.item_category'), comment='种类')
    reserve_price = Column(DECIMAL(12, 2), comment='底价')
    seller_name = Column(String(100), comment='出品人姓名')  # 冗余字段，便于查询
    seller_code = Column(String(50), ForeignKey('sellers.seller_code'), comment='出品人序号')
    starting_price = Column(DECIMAL(12, 2), comment='起拍价')
    stockin_date = Column(Date, comment='出品日期')
    item_order = Column(Integer, comment='顺序')
    item_barcode = Column(Integer, comment='自社条码/出品原序号')
    photo_date_shot = Column(Date, comment='单反拍摄日期')
    photo_date_detail = Column(Date, comment='手机图拍摄日期')
    photo_date_ps = Column(Date, comment='修图日期')
    item_material = Column(String(200), comment='材质')
    item_seal = Column(String(200), comment='鈐印')
    item_inscription = Column(String(500), comment='款識')
    item_description = Column(Text, comment='介紹')
    item_author = Column(String(100), comment='作者')
    item_status = Column(String(50), ForeignKey('item_statuses.item_status'), comment='物品状态')
    item_notes = Column(Text, comment='备注')

    __table_args__ = (
        ForeignKeyConstraint(
            ['stockin_date', 'seller_code'],
            ['stock_batches.stockin_date', 'stock_batches.seller_code']
        ),
        Index('idx_items_seller_code', 'seller_code'),
        Index('idx_items_category', 'item_category'),
        Index('idx_items_status', 'item_status'),
    )

    seller = relationship("Seller", back_populates="items", overlaps="stock_batch")
    box = relationship("Box", back_populates="items")
    category = relationship("ItemCategory", back_populates="items")
    status = relationship("ItemStatus", back_populates="items")
    stock_batch = relationship("StockBatch", back_populates="items", overlaps="seller")
    auction_items = relationship("AuctionItem", back_populates="item")
    accessories = relationship("ItemAccessory", back_populates="item")

    # 新增的关系
    images = relationship("Image", back_populates="item", cascade="all, delete-orphan")
    return_order_items = relationship("ReturnOrderItem", back_populates="item")
    outbound_logs = relationship("OutboundLog", back_populates="item")


class Auction(Base):
    __tablename__ = 'auctions'

    auction_id = Column(String(50), primary_key=True, comment='拍卖会id')
    auction_name = Column(String(200), comment='拍卖会名称')
    auction_order = Column(Integer, comment='拍卖回数')
    auction_preview_start_date = Column(Date, comment='预展开始日期')
    auction_preview_end_date = Column(Date, comment='预展结束日期')
    auction_start_date = Column(Date, comment='拍卖开始日期')
    auction_end_date = Column(Date, comment='拍卖结束日期')
    auction_section_count = Column(Integer, comment='专场个数')
    buyer_penalty_ratio = Column(DECIMAL(5, 4), comment='买方违约金比例')
    auction_tax = Column(DECIMAL(5, 4), comment='消费税')
    buyer_commission = Column(DECIMAL(5, 4), comment='买方佣金')

    sections = relationship("Section", back_populates="auction")
    auction_items = relationship("AuctionItem", back_populates="auction")
    buyer_auctions = relationship("BuyerAuction", back_populates="auction")
    config = relationship("AuctionConfig", back_populates="auction", uselist=False)

class AuctionConfig(Base):
    __tablename__ = 'auction_configs'

    auction_id = Column(String(50), ForeignKey('auctions.auction_id'), primary_key=True, comment='拍卖会id')
    seller_commission = Column(DECIMAL(5, 4), comment='出品人基础佣金')
    seller_penalty_ratio = Column(DECIMAL(5, 4), comment='出品人违约金支付比例')
    catalog_method = Column(String(10), comment='图录费计算方法（A=单件 / B=做书）')
    catalog_base_fee = Column(DECIMAL(12, 2), comment='基础图录费')

    auction = relationship("Auction", back_populates="config")

class Section(Base):
    __tablename__ = 'sections'

    auction_id = Column(String(50), ForeignKey('auctions.auction_id'), primary_key=True, comment='拍卖会id')
    section_order = Column(Integer, primary_key=True, comment='专场顺序id')
    section_name = Column(String(200), comment='专场名称')
    section_date = Column(Date, comment='专场拍卖日期')
    section_lot_start = Column(Integer, comment='专场开始LOT')
    section_lot_end = Column(Integer, comment='专场结束LOT')

    auction = relationship("Auction", back_populates="sections")


class Buyer(Base):
    __tablename__ = 'buyers'

    buyer_name = Column(String(100), primary_key=True, comment='购买人')
    buyer_contact = Column(String(200), comment='联系方式')
    buyer_address = Column(Text, comment='地址')
    is_main_buyer = Column(Boolean, default=False, comment='是否是主购买人')
    buyer_notes = Column(Text, comment='备注')

    auction_items = relationship("AuctionItem", back_populates="buyer")
    buyer_auctions = relationship("BuyerAuction", back_populates="buyer")


class AuctionItem(Base):
    __tablename__ = 'auction_items'

    auction_id = Column(String(50), ForeignKey('auctions.auction_id'), primary_key=True, comment='拍卖会id')
    lot_number = Column(Integer, primary_key=True, comment='Lot号')
    item_code = Column(String(50), ForeignKey('items.item_code'), comment='内部编号')
    is_big_cover = Column(Boolean, default=False, comment='大封面')
    is_section_cover = Column(Boolean, default=False, comment='专场封面')
    is_promo_100 = Column(Boolean, default=False, comment='宣传_老货（100件)')
    is_promo_50 = Column(Boolean, default=False, comment='宣传_三折页（50件)')
    is_promo_30 = Column(Boolean, default=False, comment='宣传_视频（30件)')
    is_promo_10 = Column(Boolean, default=False, comment='宣传_精品（10件)')
    bid_price = Column(DECIMAL(12, 2), comment='落槌价')
    buyer_name = Column(String(100), ForeignKey('buyers.buyer_name'), comment='购买人')
    is_sold = Column(Boolean, default=False, comment='是否成交')
    is_payment_received = Column(Boolean, default=False, comment='是否已收货款')
    is_penalty = Column(Boolean, default=False, comment='是否违约')
    is_penalty_received = Column(Boolean, default=False, comment='是否收到违约金')
    is_penalty_paid_to_seller = Column(Boolean, default=False, comment='是否给出品人付违约金')
    is_penalty_paid_out = Column(Boolean, default=False, comment='是否已付违约金')
    auction_items_notes = Column(Text, comment='备注')

    auction = relationship("Auction", back_populates="auction_items")
    item = relationship("Item", back_populates="auction_items")
    buyer = relationship("Buyer", back_populates="auction_items")


class BuyerAuction(Base):
    __tablename__ = 'buyer_auctions'

    buyer_name = Column(String(100), ForeignKey('buyers.buyer_name'), primary_key=True, comment='购买人')
    auction_id = Column(String(50), ForeignKey('auctions.auction_id'), primary_key=True, comment='拍卖会id')
    buyer_percent = Column(DECIMAL(5, 4), comment='佣金')

    buyer = relationship("Buyer", back_populates="buyer_auctions")
    auction = relationship("Auction", back_populates="buyer_auctions")


class AccessoryType(Base):
    __tablename__ = 'accessory_types'
    accessory_name = Column(String(100), primary_key=True, comment='附属品名称')
    sort = Column(Integer, nullable=False, default=0, comment='排序（越小越靠前）')
    item_accessories = relationship("ItemAccessory", back_populates="accessory_type")



class ItemAccessory(Base):
    __tablename__ = 'item_accessories'

    item_code = Column(String(50), ForeignKey('items.item_code'), primary_key=True, comment='内部编号')
    accessory_name = Column(String(100), ForeignKey('accessory_types.accessory_name'), primary_key=True, comment='附属品名称')

    item = relationship("Item", back_populates="accessories")
    accessory_type = relationship("AccessoryType", back_populates="item_accessories")


# ==================== 新增模型（本次补充） ====================

class Image(Base):
    """物品图片登记（多张图）；image_type: dslr_shot / retouched / mobile"""
    __tablename__ = 'images'
    id = Column(Integer, primary_key=True, autoincrement=True)
    item_code = Column(String(50), ForeignKey('items.item_code'), nullable=False, index=True)
    image_type = Column(String(20), nullable=False)
    file_path = Column(String(500), nullable=False)
    shot_date = Column(Date, comment='拍摄/修图日期')
    notes = Column(Text)

    __table_args__ = (
        CheckConstraint("image_type in ('dslr_shot','retouched','mobile')", name='ck_images_type'),
        Index('idx_images_itemcode_type', 'item_code', 'image_type'),
    )

    item = relationship("Item", back_populates="images")


class Invoice(Base):
    """账单（买家/出品人）。status: draft/issued/paid"""
    __tablename__ = 'invoices'
    invoice_id = Column(String(50), primary_key=True)
    invoice_type = Column(String(20), nullable=False)  # buyer / seller
    related_name = Column(String(100), nullable=False, comment='买家名或出品人名（冗余留痕）')
    auction_id = Column(String(50), ForeignKey('auctions.auction_id'))
    total_amount = Column(DECIMAL(12, 2), default=0)
    tax_rate = Column(DECIMAL(5, 4))
    commission_rate = Column(DECIMAL(5, 4))
    status = Column(String(20), default='draft')
    pdf_path = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(100))
    notes = Column(Text)

    __table_args__ = (
        CheckConstraint("invoice_type in ('buyer','seller')", name='ck_invoices_type'),
        CheckConstraint("status in ('draft','issued','paid')", name='ck_invoices_status'),
        Index('idx_invoices_type_related', 'invoice_type', 'related_name'),
    )

    auction = relationship("Auction")
    invoice_items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceItem(Base):
    __tablename__ = 'invoice_items'
    invoice_id = Column(String(50), ForeignKey('invoices.invoice_id'), primary_key=True)
    line_no = Column(Integer, primary_key=True)
    auction_id = Column(String(50), ForeignKey('auctions.auction_id'))
    lot_number = Column(Integer)
    item_code = Column(String(50), ForeignKey('items.item_code'))
    description = Column(Text)
    qty = Column(Integer, default=1)
    unit_price = Column(DECIMAL(12, 2), default=0)
    line_amount = Column(DECIMAL(12, 2), default=0)

    __table_args__ = (
        Index('idx_invoice_items_invoice', 'invoice_id'),
        Index('idx_invoice_items_auction_lot', 'auction_id', 'lot_number'),
    )

    invoice = relationship("Invoice", back_populates="invoice_items")
    auction = relationship("Auction")
    item = relationship("Item")


class ReturnOrder(Base):
    """返品单：一个出品人一张单，可多次部分返品；status: draft/confirmed/outbound_done"""
    __tablename__ = 'return_orders'
    return_order_id = Column(String(50), primary_key=True)
    seller_code = Column(String(50), ForeignKey('sellers.seller_code'), nullable=False)
    reason_type = Column(String(50), nullable=False)  # not_allowed_to_auction / unsold / other
    auction_id = Column(String(50), ForeignKey('auctions.auction_id'))  # 若因未成交产生
    status = Column(String(20), default='draft')
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(100))
    notes = Column(Text)

    __table_args__ = (
        CheckConstraint("reason_type in ('not_allowed_to_auction','unsold','other')", name='ck_return_orders_reason'),
        CheckConstraint("status in ('draft','confirmed','outbound_done')", name='ck_return_orders_status'),
        Index('idx_return_orders_seller', 'seller_code'),
    )

    seller = relationship("Seller")
    auction = relationship("Auction")
    items = relationship("ReturnOrderItem", back_populates="return_order", cascade="all, delete-orphan")


class ReturnOrderItem(Base):
    """返品明细；source_type: from_auction / direct"""
    __tablename__ = 'return_order_items'
    return_order_id = Column(String(50), ForeignKey('return_orders.return_order_id'), primary_key=True)
    item_code = Column(String(50), ForeignKey('items.item_code'), primary_key=True)
    source_type = Column(String(20), nullable=False, default='direct')
    source_auction_id = Column(String(50), ForeignKey('auctions.auction_id'))
    source_lot_number = Column(Integer)
    remark = Column(Text)

    __table_args__ = (
        CheckConstraint("source_type in ('from_auction','direct')", name='ck_return_items_source_type'),
        Index('idx_return_items_order', 'return_order_id'),
    )

    return_order = relationship("ReturnOrder", back_populates="items")
    item = relationship("Item")
    source_auction = relationship("Auction")


class OutboundLog(Base):
    """出库日志；outbound_type: return / other"""
    __tablename__ = 'outbound_logs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    item_code = Column(String(50), ForeignKey('items.item_code'), nullable=False, index=True)
    outbound_type = Column(String(20), nullable=False, default='return')
    ref_id = Column(String(50), comment='关联单据：如 return_order_id')
    outbound_date = Column(Date, default=datetime.utcnow)
    handled_by = Column(String(100))
    notes = Column(Text)

    __table_args__ = (
        CheckConstraint("outbound_type in ('return','other')", name='ck_outbound_type'),
        Index('idx_outbound_ref', 'ref_id'),
    )

    item = relationship("Item", back_populates="outbound_logs")


class OperationLog(Base):
    """通用操作日志：用于在库表格编辑留痕等"""
    __tablename__ = 'operation_logs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String(50), nullable=False)  # item/seller/buyer/auction/...
    entity_id = Column(String(100), nullable=False)
    action = Column(String(50), nullable=False)  # create/update/delete/status_change/export_pdf/...
    before_value = Column(Text)
    after_value = Column(Text)
    operator = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_oplog_entity', 'entity_type', 'entity_id'),
        Index('idx_oplog_time', 'created_at'),
    )


# === 新增：material_options（整合自 temper.py 的一次性脚本） ===
class MaterialOption(Base):
    """
    材质可选项枚举表：
    - group_name: 'colors' / 'materials' / 'shapes'
    - name: 选项名
    - enabled: 1=启用, 0=禁用
    - sort: 排序（越小越靠前）
    """
    __tablename__ = 'material_options'
    id = Column(Integer, primary_key=True, autoincrement=True)
    group_name = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    enabled = Column(Integer, nullable=False, default=1)
    sort = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint('group_name', 'name', name='ux_material_options'),
        Index('idx_material_options_group', 'group_name'),
    )


# ==================== 数据库操作函数 ====================

def create_database(force_recreate=False):
    """
    创建数据库和所有表（安全：不破坏既有表结构）
    若 force_recreate=True：会提示并删除所有表，请谨慎使用。
    """
    try:
        db_dir = os.path.dirname(DATABASE_PATH)
        if not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)
            print(f"创建目录: {db_dir}")

        if force_recreate:
            print("警告：将删除所有现有表和数据！")
            response = input("确定要继续吗？(输入 'YES' 确认): ")
            if response == 'YES':
                Base.metadata.drop_all(bind=engine)
                print("已删除所有现有表")
            else:
                print("操作已取消")
                return

        Base.metadata.create_all(bind=engine)
        print(f"数据库已就绪: {DATABASE_PATH}")

    except Exception as e:
        print(f"数据库操作失败: {e}")


def check_database_exists():
    return os.path.exists(DATABASE_PATH)


def backup_database(backup_path=None):
    if not check_database_exists():
        print("数据库文件不存在，无法备份")
        return False
    if backup_path is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = DATABASE_PATH.replace('.db', f'_backup_{timestamp}.db')
    try:
        import shutil
        shutil.copy2(DATABASE_PATH, backup_path)
        print(f"数据库备份成功: {backup_path}")
        return True
    except Exception as e:
        print(f"备份失败: {e}")
        return False


def drop_database():
    try:
        Base.metadata.drop_all(bind=engine)
        print("所有表已删除")
    except Exception as e:
        print(f"删除表失败: {e}")


def get_session():
    return SessionLocal()

def _column_exists(table_name: str, column_name: str) -> bool:
    """检查指定表是否存在某列（SQLite）"""
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
        cols = {r[1] for r in rows}  # r[1] = column name
        return column_name in cols

def _migrate_add_sort_and_group():
    """
    结构补丁（幂等）：为 boxes / accessory_types / item_statuses 增加排序列，
    并为 item_statuses 增加 group_name 列。
    - 仅在列不存在时才执行 ALTER TABLE
    """
    from sqlalchemy import text
    with engine.begin() as conn:
        # 1) boxes.sort
        if not _column_exists("boxes", "sort"):
            conn.execute(text("ALTER TABLE boxes ADD COLUMN sort INTEGER DEFAULT 0"))
        # 2) accessory_types.sort
        if not _column_exists("accessory_types", "sort"):
            conn.execute(text("ALTER TABLE accessory_types ADD COLUMN sort INTEGER DEFAULT 0"))
        # 3) item_statuses.group_name
        if not _column_exists("item_statuses", "group_name"):
            conn.execute(text("ALTER TABLE item_statuses ADD COLUMN group_name VARCHAR(50)"))
        # 4) item_statuses.sort
        if not _column_exists("item_statuses", "sort"):
            conn.execute(text("ALTER TABLE item_statuses ADD COLUMN sort INTEGER DEFAULT 0"))
        # 5) item_categories.sort
        if not _column_exists("item_categories", "sort"):
            conn.execute(text("ALTER TABLE item_categories ADD COLUMN sort INTEGER DEFAULT 0"))
            # 按名称字典序初始化排序为 1..n，避免空值导致排序混乱
            rows = conn.execute(text("SELECT item_category FROM item_categories ORDER BY item_category ASC")).fetchall()
            for i, (name,) in enumerate(rows, start=1):
                conn.execute(text("UPDATE item_categories SET sort=:s WHERE item_category=:n"), {"s": i, "n": name})
        # 6) sections.section_date
        if not _column_exists("sections", "section_date"):
            conn.execute(text("ALTER TABLE sections ADD COLUMN section_date DATE"))




def init_basic_data(force_reinit=False):
    """
    初始化基础数据：物品状态等
    - 若已有数据且未指定 force_reinit，则仅补充缺失的状态/枚举，不清空原数据
    """
    session = get_session()
    try:
        # 1) 物品状态
        target_statuses = []
        existing = {s.item_status for s in session.query(ItemStatus).all()}
        if existing and not force_reinit:
            to_add = [st for st in target_statuses if st not in existing]
            for st in to_add:
                session.add(ItemStatus(item_status=st))
            if to_add:
                session.commit()
                print(f"基础数据已存在，已补充缺失状态：{to_add}")
        else:
            session.query(ItemStatus).delete()
            for st in target_statuses:
                session.add(ItemStatus(item_status=st))
            session.commit()
            print(f"基础数据初始化完成，共 {len(target_statuses)} 个状态")

        # 2) 材质可选项（整合自 temper.py，一次性脚本逻辑改为安全补缺）
        seed = {
            "colors": [
                ("水墨", 1, 10),
                ("设色", 1, 20),
                ("油彩", 1, 30),
            ],
            "materials": [
                ("纸本",   1, 10),
                ("绢本",   1, 20),
                ("洒金纸本", 1, 30),
            ],
            "shapes": [
                ("镜心", 1, 10),
                ("立轴", 1, 20),
                ("镜框", 1, 30),
                ("手卷", 1, 40),
                ("卡纸", 1, 50),
                ("册页", 1, 60),
                ("扇面", 1, 70),
                ("成扇", 1, 80),
            ],
        }

        # 若 force_reinit=True 则先清掉再全量写入；否则仅补缺
        if force_reinit:
            session.query(MaterialOption).delete()
            session.flush()

        # 批量补缺
        for group_name, items in seed.items():
            for name, enabled, sort in items:
                exists = session.query(MaterialOption).filter_by(
                    group_name=group_name, name=name
                ).first()
                if not exists:
                    session.add(MaterialOption(
                        group_name=group_name, name=name,
                        enabled=enabled, sort=sort
                    ))
        session.commit()

        # 打印启用项统计
        summary = {}
        for g in ("colors", "materials", "shapes"):
            summary[g] = session.query(MaterialOption).filter_by(group_name=g, enabled=1).count()
        print("material_options 初始化完成（补缺写入） -> 启用项统计：", summary)

    except Exception as e:
        session.rollback()
        print(f"基础数据初始化失败: {e}")
    finally:
        session.close()


def show_tables():
    """打印所有表与字段摘要"""
    print("\n数据库表结构:")
    for table_name, table in Base.metadata.tables.items():
        print(f"\n表名: {table_name}")
        for column in table.columns:
            pk = " (主键)" if column.primary_key else ""
            print(f"  - {column.name}: {column.type}{pk}")


# ==================== 主程序 ====================

if __name__ == '__main__':
    print("=== 拍卖会数据库初始化（扩展版 + 材质选项） ===")
    if check_database_exists():
        print(f"数据库文件已存在: {DATABASE_PATH}")
        print("提示：本脚本使用 create_all 仅创建缺失的表与索引，不会破坏既有数据/表。")
    else:
        print("将创建新的数据库文件")

    create_database()
    _migrate_add_sort_and_group()
    init_basic_data()
    show_tables()

    print(f"\n数据库文件位置: {DATABASE_PATH}")
    print("\n安全说明:")
    print("- 重复运行是安全的：只会创建缺失对象，不会删除数据")
    print("- 如需重建：create_database(force_recreate=True)（危险）")
    print("- 如需重置基础数据：init_basic_data(force_reinit=True)")

    print("\n示例导入（后续可扩展）:")
    print("from create_database import get_session, Item, Image, ReturnOrder, Invoice, MaterialOption")
    print("session = get_session()  # ... 完成后 session.close()")
