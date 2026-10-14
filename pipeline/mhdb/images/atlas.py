"""UI 图集：按网格裁切图标、按颜色着色。"""

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
    """灰度图标乘以颜色，保留 alpha（游戏物品图标是灰度形状 + 运行时着色）。"""
    icon = icon.convert("RGBA")
    alpha = icon.getchannel("A")
    color = Image.new("RGBA", icon.size, (*rgb, 255))
    out = ImageChops.multiply(icon, color)
    out.putalpha(alpha)
    return out
