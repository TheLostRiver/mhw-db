"""从 UI 图集生成网站用的图标（WebP），输出到 site/public/assets/game/world/（不入库）。

图集与格子编号见 docs/DATA.md「界面图标」，都已与游戏画面核对：
  cmn_item00   64px 网格：技能徽章 96；饰品宝石 66/67/68/72（1–4 级）；防具 144–148；护石 149；
               衣装 112、烟筒 113；武器 160–173；物品按 itemData 的图标编号与颜色全部输出（item/）
  cmn_status00 64px 网格：攻击、会心、属性等状态图标（彩色，原样输出）
  cmn_action00 64px 网格：大地图上交互环境生物的图标（彩色，原样输出）
  common00     非网格：镶嵌槽框与宝石，按坐标裁切
  equip_egc    非网格：自定义强化的格数六边形
  status00 / menu00 / itemMenu00 / common00  菜单界面零件（UI_SPRITES），按坐标裁切
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

# 菜单界面的零件（窗口装饰、图标底框、等级格、分隔线），原样裁切，供配装器拼出游戏式的面板。
# 坐标为 (左, 上, 右, 下)，按透明度连通域取得的精确边界；来源图集见 info_skill.gui 等布局文件的引用。
UI_ATLAS = {
    "status": "ui/status/tex/status00_ID.tex",
    "menu": "ui/common_menu/tex/menu00_ID.tex",
    "item": "ui/item_menu/tex/itemMenu00_ID.tex",
    "common": "ui/common/tex/common00_ID.tex",
    "map": "ui/map/tex/map00_ID.tex",
    "other": "ui/common/tex/cmn_other00_ID.tex",
}
UI_SPRITES: dict[str, tuple[str, tuple[int, int, int, int]]] = {
    # 图标底框（黑 / 灰圆角方块）与选中框
    "tile": ("status", (2, 2, 38, 38)),
    "tile-grey": ("status", (42, 2, 78, 38)),
    "tile-frame": ("status", (2, 42, 38, 78)),
    # 技能等级格：空格 / 实心格（白，前端按颜色正片叠底着色）
    "box-off": ("status", (68, 85, 83, 99)),
    "box-on": ("status", (28, 133, 43, 147)),
    # 四角的折角刻线、金色菱形
    "corner-tl": ("status", (7, 617, 21, 633)),
    "corner-tr": ("status", (27, 617, 41, 633)),
    "corner-bl": ("status", (6, 646, 21, 663)),
    "corner-br": ("status", (27, 646, 42, 663)),
    "diamond": ("status", (50, 617, 70, 639)),
    # 窗口标题装饰线、窗口上角、下角括线、带箭头的分隔线
    "title-line": ("menu", (9, 48, 367, 77)),
    "win-tl": ("menu", (376, 48, 413, 94)),
    "win-tr": ("menu", (451, 48, 488, 94)),
    "bracket-bl": ("menu", (376, 104, 416, 126)),
    "bracket-br": ("menu", (449, 104, 488, 126)),
    "arrow-line": ("menu", (56, 605, 360, 620)),
    # 细线与线头（◇ / ⧗）、带放射线的角饰、部族花纹
    "line": ("item", (138, 361, 503, 366)),
    "line-end": ("item", (501, 310, 511, 320)),
    "line-end-hourglass": ("item", (502, 335, 512, 345)),
    "ray-bl": ("item", (73, 270, 103, 303)),
    "ray-br": ("item", (105, 270, 135, 303)),
    "pattern": ("item", (33, 426, 438, 509)),
    # 列表行底板（亮 / 暗）
    "row-light": ("common", (62, 346, 512, 391)),
    "row-dark": ("common", (62, 394, 512, 436)),
    # 大地图的楼层切换（map.gui 的 a_layer / layerBase，矩形取自布局文件）：
    # 菱形底、选中时外圈描边、上下翻层的双箭头、编号底的圆点
    "layer-diamond": ("map", (0, 128, 56, 168)),
    "layer-glow": ("map", (56, 128, 112, 168)),
    "layer-chevron": ("map", (152, 112, 184, 128)),
    "layer-disc": ("map", (64, 168, 96, 200)),
    # 大地图的营地图标（cmn_other00 的黄色帐篷；map.gui 的 camp 动画也引用这张图集）
    "camp": ("other", (128, 192, 192, 256)),
}

# 地区徽章：map.gui 的 searchinfo 动画里 tex_aIcon00–05 引用 cmn_stage00 的 6 个格子，
# 顺序与地区一致（森林的树、荒地的台地、珊瑚、瘴气之谷、龙结晶、冰原，按图形核对）。
STAGE_EMBLEM = {101: 0, 102: 1, 103: 2, 104: 3, 105: 4, 108: 5}


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

    # 物品：按图标 × 颜色（乘法着色，与游戏道具栏的颜色一致），地图标记与采集物列表用
    for icon_id, color in sorted(
        {(i["icon"]["id"], i["icon"]["color"]) for i in load("items.json")["items"]}
    ):
        save(tint(grid_cell(item, icon_id), icon_colors[color]), f"item/{icon_id}-{color}.webp")

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

    # 菜单界面零件：先确认裁切框里确实有图形，图集布局变了就报错而不是输出空图
    atlases = {k: _atlas(raw, rel) for k, rel in UI_ATLAS.items()}
    for name, (atlas, box) in UI_SPRITES.items():
        part = atlases[atlas].crop(box)
        bbox = part.getchannel("A").getbbox()
        if not bbox or bbox[2] - bbox[0] < (box[2] - box[0]) // 2:
            raise ValueError(f"UI 零件 {name} 的裁切框 {box} 里没有完整图形，图集可能变了")
        save(part, f"ui/{name}.webp")
    # 下角括线上下翻转即为上角括线（游戏里同一张零件翻转使用）
    for side in ("l", "r"):
        part = Image.open(out / f"ui/bracket-b{side}.webp").transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        save(part, f"ui/bracket-t{side}.webp")

    # 地区徽章（白色剪影，前端按需着色）：矩形直接取自 map.gui
    from mhdb.formats import gui as guifmt

    map_gui = guifmt.parse((raw / "ui/map/map.gui").read_bytes())
    icons = {o.name: o.init for o in map_gui.animations["searchinfo"].objects}
    for stage, k in STAGE_EMBLEM.items():
        init = icons[f"tex_aIcon{k:02d}"]
        tex = map_gui.textures[init["Texture"]].path.replace("\\", "/")
        box = tuple(int(v) for v in init["mTextureRect"])
        save(_atlas(raw, f"{tex}.tex").crop(box), f"ui/stage-{stage}.webp")

    # 大地图上的环境生物图标（cmn_action00，格子编号由 animal.gcd 给出，见 mhdb/formats/gcd.py）
    action = _atlas(raw, "ui/common/tex/cmn_action00_ID.tex")
    for i in range((action.width // 64) * (action.height // 64)):
        cell = grid_cell(action, i)
        if cell.getchannel("A").getbbox():
            save(cell, f"action/{i}.webp")

    # 状态图标原样输出
    for i in range((status.width // 64) * (status.height // 64)):
        cell = grid_cell(status, i)
        if cell.getchannel("A").getbbox():
            save(cell, f"status/{i}.webp")

    log(f"生成 {n} 个图标到 {out}")
    return n
