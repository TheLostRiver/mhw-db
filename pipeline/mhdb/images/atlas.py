"""UI 图集：按网格裁切图标、按颜色着色。

游戏的物品图标是灰度底图（*_ID.tex）+ 遮罩图（*M_ID.tex，alpha 通道标出填色区域），运行时着色。
游戏的合成公式未知，这里按截图对比选了两种近似：
  tint  乘法着色：底图 × 颜色（技能徽章、衣装、2–4 级饰品宝石与截图一致）
  fill  遮罩填色：遮罩内填颜色（按底图亮度稍作明暗），遮罩外按比例压暗（防具、武器、护石与截图一致）
"""

from PIL import Image, ImageChops


def grid_cell(atlas: Image.Image, index: int, cell: int = 64) -> Image.Image:
    """按行优先编号裁切等大网格中的一格。"""
    cols = atlas.width // cell
    rows = atlas.height // cell
    if not 0 <= index < cols * rows:
        raise IndexError(f"图标编号 {index} 超出图集（{cols}×{rows}）")
    x, y = (index % cols) * cell, (index // cols) * cell
    return atlas.crop((x, y, x + cell, y + cell))


def tint(icon: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """灰度图标乘以颜色，保留 alpha。"""
    icon = icon.convert("RGBA")
    alpha = icon.getchannel("A")
    color = Image.new("RGBA", icon.size, (*rgb, 255))
    out = ImageChops.multiply(icon, color)
    out.putalpha(alpha)
    return out


def fill(
    icon: Image.Image,
    mask: Image.Image,
    rgb: tuple[int, int, int],
    *,
    floor: float = 0.85,
    outside: float = 0.25,
) -> Image.Image:
    """遮罩内：颜色 × (floor + (1 − floor) · 底图亮度)；遮罩外：底图 × outside。alpha 取底图。"""
    icon = icon.convert("RGBA")
    m = mask.getchannel("A") if mask.mode == "RGBA" else mask.convert("L")
    shade = icon.convert("L").point(lambda v: round(255 * (floor + (1 - floor) * v / 255)))
    inside = ImageChops.multiply(Image.new("RGB", icon.size, rgb), Image.merge("RGB", (shade, shade, shade)))
    rest = icon.convert("RGB").point(lambda v: round(v * outside))
    out = Image.composite(inside, rest, m).convert("RGBA")
    out.putalpha(icon.getchannel("A"))
    return out
