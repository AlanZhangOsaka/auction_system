# test_print.py
# 按照和 app.py 完全一样的方式生成 PDF，不发送到打印机，直接保存到本地

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from io import BytesIO

codes = [
    "260407_BH_1","260407_BH_2","260407_BH_3","260407_BH_4","260407_BH_5",
    "260407_BH_6","260407_BH_7","260407_BH_8","260407_BH_9","260407_BH_10",
    "260407_BH_11","260407_BH_12","260407_BH_13",
    "260402_AO_1","260402_AO_2","260402_AO_3","260402_AO_4","260402_AO_5",
    "260402_AO_6","260402_AO_7","260402_AO_8","260402_AO_9","260402_AO_10",
    "260402_AO_11","260402_AO_12","260402_AO_13","260402_AO_14","260402_AO_15",
    "260402_AO_16","260402_AO_17","260402_AO_18","260402_AO_19","260402_AO_20",
    "260402_AO_21","260402_AO_22","260402_AO_23","260402_AO_24","260402_AO_25",
    "260402_AO_26","260402_AO_27","260402_AO_28","260402_AO_29","260402_AO_30",
    "260402_AO_31","260402_AO_32","260402_AO_33","260402_AO_34","260402_AO_35",
    "260402_AO_36","260402_AO_37","260402_AO_38","260402_AO_39","260402_AO_40",
    "260402_AO_41","260402_AO_42","260402_AO_43","260402_AO_44","260402_AO_45",
    "260402_AA_1","260402_AA_2","260402_AA_3","260402_AA_4","260402_AA_5",
    "260402_AA_6","260402_AA_7","260402_AA_8","260402_AA_9","260402_AA_10",
    "260402_AA_11","260402_AA_12","260402_AA_13","260402_AA_14","260402_AA_15",
    "260402_AA_16","260402_AA_17","260402_AA_18","260402_AA_19","260402_AA_20",
    "260402_AA_21","260402_AA_22","260402_AA_23","260402_AA_24",
    "260402_S_1","260402_S_2","260402_S_3","260402_S_4","260402_S_5",
    "260402_S_6","260402_S_7","260402_S_8","260402_S_9","260402_S_10",
    "260402_S_11","260402_S_12","260402_S_13","260402_S_14","260402_S_15",
    "260402_S_16","260402_S_17","260402_S_18","260402_S_19","260402_S_20",
    "260402_S_21","260402_S_22",
    "260402_BC_1",
    "260403_CN_1","260403_CN_2","260403_CN_4","260403_CN_5",
    "260407_DF_1","260407_DF_2","260407_DF_3",
]

# ── 布局参数（与 app.py 完全一致）──
COLS      = 9
ROWS      = 28
PER_PAGE  = COLS * ROWS
start_index = 0
skip_set    = set()

page_w, page_h = A4

marginL = 7 * mm
marginT = 7 * mm
labelW  = 20 * mm
labelH  = 10 * mm
gapX    = 2 * mm
gapY    = 0 * mm

# ── 放置逻辑（与 app.py 完全一致）──
placed = []
code_i = 0
idx    = start_index
while code_i < len(codes):
    if idx in skip_set:
        idx += 1
        continue
    placed.append((idx, codes[code_i]))
    code_i += 1
    idx    += 1

max_idx = placed[-1][0] if placed else 0
pages   = (max_idx // PER_PAGE) + 1

# ── 生成 PDF（与 app.py 完全一致）──
buf       = BytesIO()
c         = canvas.Canvas(buf, pagesize=A4)
c.setTitle("labels")
base_font = "Helvetica"

for p in range(pages):
    page_start = p * PER_PAGE
    page_end   = (p + 1) * PER_PAGE

    for (cell_index, code) in placed:
        if not (page_start <= cell_index < page_end):
            continue

        in_page = cell_index - page_start
        r       = in_page // COLS
        col     = in_page % COLS

        x     = marginL + col * (labelW + gapX)
        y_top = page_h - marginT - r * (labelH + gapY)
        y     = y_top - labelH

        num_part = str(code).split("_")[-1]
        size = 8
        if num_part.isdigit() and len(num_part) >= 4:
            size = 6
        elif num_part.isdigit() and len(num_part) >= 3:
            size = 7

        c.setFont(base_font, size)
        tx = x + labelW / 2
        ty = y + labelH / 2 - (size * 0.35)
        c.drawCentredString(tx, ty, str(code))

    c.showPage()

c.save()

# ── 保存到本地 ──
output_path = "test_labels.pdf"
with open(output_path, "wb") as f:
    f.write(buf.getvalue())

print(f"PDF 已生成：{output_path}（共 {pages} 页，{len(placed)} 个标签）")