"""从 UI 图集生成网站用的图标（WebP），输出到 site/public/assets/game/world/（不入库）。

图集与格子编号见 docs/DATA.md「界面图标」，都已与游戏画面核对：
  cmn_item00   64px 网格：技能徽章 96；饰品宝石 66/67/68/72（1–4 级）；防具 144–148；护石 149；
               衣装 112、烟筒 113；武器 160–173
  cmn_status00 64px 网格：攻击、会心、属性等状态图标（彩色，原样输出）
  common00     非网格：镶嵌槽框与宝石，按坐标裁切
  equip_egc    非网格：自定义强化的格数六边形
着色方式见 mhdb/images/atlas.py（按游戏截图对比选定的近似）。
"""

import json
from pathlib import Path

from PIL import Image

from mhdb.formats.tex import decode
from mhdb.images.atlas import fill, grid_cell, tint

SKILL_BADGE = 96
DECO_GEM = {1: 66, 2: 67, 3: 68, 4: 72}
EQUIP = {"head": 144, "chest": 145, "arms": 146, "waist": 147, "legs": 148, "charm": 149}
# 图集里武器图标的顺序（按图形核对）：片手剑、大剑、太刀、双剑、长枪、铳枪、大锤、狩猎笛、斩击斧、盾斧、操虫棍、轻弩、重弩、弓
WEAPON = {
    "sword-and-shield": 160,
    "great-sword": 161,
    "long-sword": 162,
    "dual-blades": 163,
    "lance": 164,
    "gunlance": 165,
    "hammer": 166,
    "hunting-horn": 167,
    "switch-axe": 168,
    "charge-blade": 169,
    "insect-glaive": 170,
    "light-bowgun": 171,
    "heavy-bowgun": 172,
    "bow": 173,
}
# 空栏位占位图标的颜色（灰，与游戏「未装备」栏的灰色图标接近）
PLACEHOLDER = (128, 132, 138)
# equip_egc：大师自定义强化的格数六边形（已用 / 空），坐标为 (左, 上, 右, 下)
AUGMENT_HEX = {"used": (5, 2, 59, 62), "empty": (199, 3, 249, 60)}
# cmn_status00 里自定义强化各项的图标（攻击↑、会心↑、防御↑、镶嵌槽＋、回复、属性↑），按图形核对
AUGMENT_ICON = {"attack": 16, "affinity": 51, "defense": 17, "slot": 55, "health": 54, "element": 67}
# common00 里的镶嵌槽（列表用小图标）与宝石，坐标为 (左, 上, 右, 下)
SOCKET = {1: (347, 51, 380, 78), 2: (387, 51, 420, 78), 3: (427, 51, 460, 78), 4: (171, 144, 204, 174)}
SOCKET_LARGE = {1: (244, 2, 300, 46), 2: (308, 2, 364, 46), 3: (372, 2, 428, 46), 4: (372, 97, 428, 142)}


def _hex(rgb: str) -> tuple[int, int, int]:
    return int(rgb[1:3], 16), int(rgb[3:5], 16), int(rgb[5:7], 16)


def _atlas(raw: Path, rel: str) -> Image.Image:
    head, px = decode((raw / rel).read_bytes())
    return Image.frombytes("RGBA", (head.width, head.height), px)


def _save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", lossless=True, method=6)


def _square(img: Image.Image) -> Image.Image:
    """非正方形裁切居中放进正方形透明画布，方便前端统一尺寸。"""
    side = max(img.size)
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.alpha_composite(img, ((side - img.width) // 2, (side - img.height) // 2))
    return out


def build(raw: Path, data: Path, out: Path, log=print) -> int:
    colors = json.loads((data / "colors.json").read_text(encoding="utf-8"))
    icon_colors = [_hex(c) for c in colors["icon"]]
    rarity_colors = [_hex(c) for c in colors["rarity"]]
    item = _atlas(raw, "ui/common/tex/cmn_item00_ID.tex")
    item_mask = _atlas(raw, "ui/common/tex/cmn_item00M_ID.tex")
    status = _atlas(raw, "ui/common/tex/cmn_status00_ID.tex")
    common = _atlas(raw, "ui/common/tex/common00_ID.tex")
    n = 0

    def save(img: Image.Image, rel: str) -> None:
        nonlocal n
        _save(img, out / rel)
        n += 1

    load = lambda name: json.loads((data / name).read_text(encoding="utf-8"))  # noqa: E731

    # 技能徽章：按技能的图标颜色
    for c in sorted({s["iconColor"] for s in load("skills.json")["skills"]}):
        save(tint(grid_cell(item, SKILL_BADGE), icon_colors[c]), f"skill/{c}.webp")

    # 饰品宝石：按镶嵌等级 × 颜色
    for size, color in sorted(
        {(d["size"], d["icon"]["color"]) for d in load("decorations.json")["decorations"]}
    ):
        cell = DECO_GEM[size]
        if size == 1:  # 1 级宝石底图内部是黑的，乘法着色会变成黑色，改用遮罩填色并保留线条
            img = fill(
                grid_cell(item, cell), grid_cell(item_mask, cell), icon_colors[color], floor=0.7, outside=1.0
            )
        else:
            img = tint(grid_cell(item, cell), icon_colors[color])
        save(img, f"deco/{size}-{color}.webp")

    # 防具、护石、武器：按稀有度着色；稀有度 0 为空栏位的灰色占位图标
    for slot, cell in EQUIP.items():
        for r, rgb in enumerate([PLACEHOLDER, *rarity_colors]):
            save(fill(grid_cell(item, cell), grid_cell(item_mask, cell), rgb), f"equip/{slot}-{r}.webp")
    for key, cell in WEAPON.items():
        for r, rgb in enumerate([PLACEHOLDER, *rarity_colors]):
            save(fill(grid_cell(item, cell), grid_cell(item_mask, cell), rgb), f"weapon/{key}-{r}.webp")
    save(tint(grid_cell(item, 112), PLACEHOLDER), "mantle/empty.webp")

    # 自定义强化：格数六边形与各项图标
    egc = _atlas(raw, "ui/equip/tex/equip_egc_ID.tex")
    for name, box in AUGMENT_HEX.items():
        save(_square(egc.crop(box)), f"augment/hex-{name}.webp")
    for name, cell in AUGMENT_ICON.items():
        save(grid_cell(status, cell), f"augment/{name}.webp")

    # 衣装 / 烟筒
    for m in load("mantles.json")["mantles"]:
        icon = m["icon"]
        save(
            tint(grid_cell(item, icon["id"]), icon_colors[icon["color"]]),
            f"mantle/{icon['id']}-{icon['color']}.webp",
        )

    # 镶嵌槽（空槽）
    for lv, box in SOCKET.items():
        save(_square(common.crop(box)), f"socket/{lv}.webp")
    for lv, box in SOCKET_LARGE.items():
        save(_square(common.crop(box)), f"socket/large-{lv}.webp")

    # 状态图标原样输出
    for i in range((status.width // 64) * (status.height // 64)):
        cell = grid_cell(status, i)
        if cell.getchannel("A").getbbox():
            save(cell, f"status/{i}.webp")

    log(f"生成 {n} 个图标到 {out}")
    return n
