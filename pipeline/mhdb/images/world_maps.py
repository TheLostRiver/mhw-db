"""大地图：把每个区域的羊皮纸纸片摆回原位，导出纸片图片与 data/world/maps.json。

游戏的大地图由「纸片」拼成：ui/map/tex/maptex/stXXX/m_stXXX_patch_ID 是一张图集，每块纸片画一个区域
（多层区域另有上层纸片）。纸片摆在哪里不在任何数据文件里，是程序运行时算的，所以这里用配准求出来：

1. 雷达（HUD 小地图）的俯视轮廓 r_stXXX_fNN_MM 与区域边线都在 hud_radar.gui 里有明确坐标，作为基准坐标系
   （雷达单位：每层 2×2 块瓦片，每块 512 像素画成 820 单位，原点在中心）。
2. 纸片里浅色的路面、浅水 ≈ 雷达上的可走区域。对每块纸片做 FFT 归一化互相关，先扫出整张图统一的
   「纸片像素 → 雷达单位」比例，再在各区域边线附近找平移。
3. exe 里的纸片表（mhdb.games.world.exe.MAP_PATCHES）给出每块纸片的层、雷达层与区域号；
   用匈牙利算法把图集里的纸片与表里的行一一对上，再按落位与区域边线包围盒的重叠、营地名里的区域号复核区域号。
配准得分写进 maps.json，偏低的纸片在构建日志里提示，需要人工看一眼。
纸片底下另有一张整幅背景插画（backdrop），按雷达范围摆放，见 docs/DATA.md 4.1。
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.optimize import linear_sum_assignment
from scipy.signal import fftconvolve

from mhdb.build.common import Source, tr, write_json
from mhdb.formats import gui as guifmt
from mhdb.formats.tex import decode
from mhdb.games.world.exe import DUMP_BUILD_ID, MAP_PATCHES

# 关卡 → (地名在 common/text/other_names 里的序号, 分组)。地名序号与地图画面逐一核对过（见 docs/DATA.md）。
STAGES: dict[int, tuple[int, str]] = {
    101: (0, "field"),
    102: (1, "field"),
    103: (2, "field"),
    104: (3, "field"),
    105: (4, "field"),
    108: (58, "field"),
}
HALF = 820  # 雷达瓦片边长（雷达单位）
RADAR_PER_WORLD = 2 * HALF / 100000  # 雷达 2×2 块瓦片覆盖世界坐标 ±50000
RES = 0.5  # 搜索时每雷达单位的工作像素
LETTERS = "ABCDEFGHIJKLMNOPQ"
LOW_SCORE = 0.3


@dataclass
class Piece:
    rect: tuple[int, int, int, int]  # 图集中的 (x, y, w, h)
    signed: np.ndarray  # 可走 +，不可走 −，纸外 0（零均值）
    centroid: tuple[float, float]  # 可走区域重心（纸片像素）


def _rgba(raw: Path, rel: str) -> np.ndarray:
    head, px = decode((raw / rel).read_bytes())
    return np.frombuffer(px, np.uint8).reshape(head.height, head.width, 4)


def _walkable(rgba: np.ndarray) -> np.ndarray:
    """纸片上的路面与浅水：够亮、且不是偏黄的纸面（纸面 B/R ≈ 0.54，路面 ≈ 0.7）。"""
    a = rgba.astype(np.float32)
    lum = a[..., :3].mean(-1)
    return (lum > 110) & (a[..., 2] > 0.62 * a[..., 0])


def radar_floors(raw: Path, stage: int, res: float = RES) -> dict[int, np.ndarray]:
    """每层雷达的有符号可走图（可走 +1，其余 −1），坐标为 (雷达单位 + HALF) × res。"""
    n = int(HALF * res)
    out: dict[int, np.ndarray] = {}
    for floor in range(8):
        canvas = np.zeros((2 * n, 2 * n), np.float32)
        found = False
        # 瓦片 00..03 依次是左上、右上、左下、右下（hud_radar.gui 的 tex_map_fNN_MM 锚点 10/8/2/0）
        for t, (dx, dy) in enumerate([(0, 0), (n, 0), (0, n), (n, n)]):
            rel = f"ui/hud/tex/rtex/st{stage}/r_st{stage}_f{floor:02d}_{t:02d}_ID.tex"
            if not (raw / rel).is_file():
                continue
            found = True
            a = _rgba(raw, rel)
            walk = ((a[..., 3] > 128) & (a[..., :3].mean(-1) > 150)).astype(np.uint8) * 255
            canvas[dy : dy + n, dx : dx + n] = np.asarray(
                Image.fromarray(walk).resize((n, n), Image.BILINEAR)
            )
        if found:
            out[floor] = canvas / 127.5 - 1
    return out


def area_regions(
    radar: guifmt.Gui, stage: int
) -> dict[int, list[tuple[int, tuple[float, float, float, float]]]]:
    """hud_radar.gui 的 Area_lineNNN：区域号 → [(雷达层, 边线包围盒)]。null_areaK 对应区域 K+1。"""
    anim = radar.animations.get(f"Area_line{stage}")
    out: dict[int, list] = {}
    if not anim:
        return out
    floor, base = 0, None
    for o in anim.objects:
        if m := re.fullmatch(r"coladj_line_f(\d+)", o.name):
            floor = int(m.group(1))
        elif m := re.fullmatch(r"null_area(\d+)(?:_\d+)?", o.name):
            base = (int(m.group(1)) + 1, o.init.get("PosX", 0.0), o.init.get("PosY", 0.0))
        elif o.name.startswith("tex_line") and base and "mTextureRect" in o.init:
            left, top, right, bottom = o.init["mTextureRect"]
            x = base[1] + o.init.get("PosX", 0.0)
            y = base[2] + o.init.get("PosY", 0.0)
            out.setdefault(base[0], []).append((floor, (x, y, x + right - left, y + bottom - top)))
    return out


def cut_pieces(atlas: np.ndarray) -> list[Piece]:
    """按透明度连通域切出纸片（膨胀几像素，免得撕边处断开）。"""
    alpha = atlas[..., 3] > 8
    lab, _ = ndimage.label(ndimage.binary_dilation(alpha, iterations=3))
    pieces = []
    for ys, xs in ndimage.find_objects(lab):
        w, h = xs.stop - xs.start, ys.stop - ys.start
        if w * h < 4000:
            continue
        a = atlas[ys, xs]
        inside = ndimage.binary_erosion(a[..., 3] > 200, iterations=40)
        walk = _walkable(a) & inside
        signed = np.where(inside, np.where(walk, 1.0, -1.0), 0.0).astype(np.float32)
        signed[inside] -= signed[inside].mean()
        cy, cx = ndimage.center_of_mass(walk) if walk.any() else (h / 2, w / 2)
        pieces.append(Piece((xs.start, ys.start, w, h), signed, (float(cx), float(cy))))
    pieces.sort(key=lambda p: (p.rect[1], p.rect[0]))
    return pieces


def _kernel(piece: Piece, scale: float, res: float) -> tuple[np.ndarray, float]:
    w = max(8, round(piece.signed.shape[1] * scale * res))
    h = max(8, round(piece.signed.shape[0] * scale * res))
    k = np.asarray(Image.fromarray(piece.signed).resize((w, h), Image.BILINEAR))
    norm = float(np.sqrt((k**2).sum() * (np.abs(k) > 1e-3).sum())) + 1e-6
    return k, norm


def _ncc(radar: np.ndarray, piece: Piece, scale: float, res: float) -> np.ndarray:
    k, norm = _kernel(piece, scale, res)
    return fftconvolve(radar, k[::-1, ::-1], mode="valid") / norm


def fit_scale(raw: Path, stage: int, pieces: list[Piece]) -> float:
    """整张图统一的比例：各纸片在各层雷达上的最佳相关，取前 2/3 求和最大的比例。

    多层地图（如瘴气之谷）大部分纸片不在地面层，所以每块纸片取所有层里最好的一层。
    先在 1/4 分辨率上粗扫，再在 1/2 分辨率上细扫。
    """

    def total(s: float, res: float, floors: dict[int, np.ndarray]) -> float:
        best = sorted(
            (max(float(_ncc(f, p, s, res).max()) for f in floors.values()) for p in pieces), reverse=True
        )
        return sum(best[: max(3, len(best) * 2 // 3)])

    low = radar_floors(raw, stage, RES / 2)
    coarse = max(np.arange(0.30, 0.90, 0.02), key=lambda s: total(s, RES / 2, low))
    mid = radar_floors(raw, stage, RES)
    fine = float(max(np.arange(coarse - 0.02, coarse + 0.0201, 0.0025), key=lambda s: total(s, RES, mid)))
    # 已配准的地图比例都落在 1/80 的整数倍附近（0.5、0.625），差在细扫步长以内时取整
    snapped = round(fine * 80) / 80
    return snapped if abs(snapped - fine) <= 0.004 else fine


def _union(floors: dict[int, np.ndarray], wanted: tuple[int, ...]) -> np.ndarray:
    have = [floors[f] for f in wanted if f in floors] or [floors[0]]
    return np.max(have, axis=0)


def _best_in_region(
    ncc: np.ndarray, piece: Piece, scale: float, res: float, region
) -> tuple[float, int, int]:
    """只在「纸片可走区域重心落进该区域包围盒（放宽 25%）」的平移里取最大相关。"""
    if region is None:
        k = np.unravel_index(int(np.argmax(ncc)), ncc.shape)
        return float(ncc[k]), int(k[1]), int(k[0])
    x0, y0, x1, y1 = region
    mx, my = (x1 - x0) * 0.25, (y1 - y0) * 0.25
    cx, cy = piece.centroid[0] * scale, piece.centroid[1] * scale
    # 平移 t（工作像素）→ 重心雷达坐标 = t / res − HALF + c
    lo_x = int(np.floor((x0 - mx - cx + HALF) * res))
    hi_x = int(np.ceil((x1 + mx - cx + HALF) * res))
    lo_y = int(np.floor((y0 - my - cy + HALF) * res))
    hi_y = int(np.ceil((y1 + my - cy + HALF) * res))
    sub = ncc[max(0, lo_y) : max(0, hi_y), max(0, lo_x) : max(0, hi_x)]
    if sub.size == 0:
        return -1.0, 0, 0
    k = np.unravel_index(int(np.argmax(sub)), sub.shape)
    return float(sub[k]), int(k[1]) + max(0, lo_x), int(k[0]) + max(0, lo_y)


@dataclass
class Camps:
    """营地：位置（雷达坐标）与 floor，以及营地名里括号中的区域号（与营地对应的顺序未知，只知道集合）。"""

    points: list[tuple[float, float, int]]
    areas: list[int]


def camps_of(src: Source, stage: int) -> Camps:
    """营地物件 gm013_*（带 mCampId）在 stXXX_gm.sobj；营地名 ST{stage}_CampNN 在 other_names。"""
    from mhdb.formats import sobj

    rel = f"stage/st{stage}/common/set/st{stage}_gm.sobj"
    points = []
    if src.path(rel).is_file():
        for o in sobj.parse(src.path(rel).read_bytes()):
            if o.name.startswith("gm013_") and "mCampId" in o.props:
                points.append((o.pos[0] * RADAR_PER_WORLD, o.pos[2] * RADAR_PER_WORLD, o.floor))
    names = src.text("common/text/other_names")["zh-Hans"]
    areas = []
    for i, k in names.keys.items():
        if k.startswith(f"ST{stage}_Camp") and (m := re.search(r"[(（](\d+)[)）]\s*$", names.get(i) or "")):
            areas.append(int(m.group(1)))
    return Camps(points, areas)


# UI 区域文件（stXXX_ui.zon）里的区域长方体按纸片表的行序排列的地图（按采集点投票核对：瘴气之谷 14/14、
# 陆珊瑚台地 12/13 与重排后的区域号一致）。其余地图的形状是棱柱、条数与纸片表对不上，不用。
ZONE_BOX_STAGES = (102, 103, 104)


def zone_boxes(raw: Path, stage: int) -> dict[int, tuple[float, float, float, float]]:
    """纸片表行号 → 该区域 UI 长方体在雷达坐标里的 (x0, y0, x1, y1)（世界 x、z）。"""
    from mhdb.formats import zon

    rel = raw / f"stage/st{stage}/common/zone/st{stage}_ui.zon"
    if stage not in ZONE_BOX_STAGES or not rel.is_file():
        return {}
    out = {}
    for k, s in enumerate(zon.ui_shapes(rel.read_bytes())[: len(MAP_PATCHES[stage])]):
        if isinstance(s, zon.Box):
            xs = sorted((s.lo[0] * RADAR_PER_WORLD, s.hi[0] * RADAR_PER_WORLD))
            zs = sorted((s.lo[2] * RADAR_PER_WORLD, s.hi[2] * RADAR_PER_WORLD))
            out[k] = (xs[0], zs[0], xs[1], zs[1])
    return out


def _relabel(
    pieces, rows, match, unions, scale, region_of, camps: Camps, zones: dict, stage: int, log
) -> dict[int, int]:
    """区域号复核：按相关性配对时，长得像的相邻地面纸片会互换区域号（营地名里的区域号证实了这一点）。
    这里先按配对结果求出每块纸片的落位，再按「纸片不透明处落在各区域边线包围盒里的比例」在同一层内重新配对；
    营地是锚点：每个营地必须落在营地名所写区域的纸片上（营地与营地名的对应未知，按包含关系做一一配对）。
    """
    place: dict[int, tuple[float, float]] = {}
    for j, (_, _, fl, area) in enumerate(rows):
        p = pieces[match[j]]
        _, tx, ty = _best_in_region(_ncc(unions[fl], p, scale, RES), p, scale, RES, region_of(fl, area))
        place[match[j]] = (tx / RES - HALF, ty / RES - HALF)
    alpha = {
        i: (p.signed != 0) | ndimage.binary_dilation(p.signed != 0, iterations=40)
        for i, p in enumerate(pieces)
    }

    def covers(i: int, x: float, y: float) -> bool:
        u, v = int((x - place[i][0]) / scale), int((y - place[i][1]) / scale)
        a = alpha[i]
        return 0 <= v < a.shape[0] and 0 <= u < a.shape[1] and bool(a[v, u])

    layer_of = {match[j]: rows[j][1] for j in range(len(rows))}
    score = np.full((len(pieces), len(rows)), -10.0)
    for i in range(len(pieces)):
        ys, xs = np.nonzero(alpha[i][::4, ::4])
        rx, ry = place[i][0] + xs * 4 * scale, place[i][1] + ys * 4 * scale
        for j, (_, layer, fl, _area) in enumerate(rows):
            if layer != layer_of[i] or not len(xs):
                continue  # 层由配准（各层雷达的相关性）决定，只在同一层里重排区域号
            box = region_of(fl, _area)
            if box is None:
                score[i, j] = 0.0
                continue
            x0, y0, x1, y1 = box
            score[i, j] = float(((rx >= x0) & (rx <= x1) & (ry >= y0) & (ry <= y1)).mean())
            # 有 UI 区域长方体时只用它（游戏数据里区域与长方体一一对应，营地都落在营地名所写区域的长方体里；
            # 雷达边线只是包围盒，相邻区域常重叠）
            if (zb := zones.get(rows[j][0])) is not None:
                zx0, zy0, zx1, zy1 = zb
                inside = ((rx >= zx0) & (rx <= zx1) & (ry >= zy0) & (ry <= zy1)).mean()
                score[i, j] = float(inside)
    current = {i: j for j, i in match.items()}
    for i, j in current.items():
        score[i, j] += 0.25  # 重叠差不多时保留原配对

    def solve(s: np.ndarray) -> dict[int, int]:
        pi, rj = linear_sum_assignment(-s)
        return dict(zip(rj.tolist(), pi.tolist(), strict=True))

    new = solve(score)
    # 营地锚点：营地 ↔ 营地名区域号一一配对（营地落在某区域的纸片上得 1 分），配不上的营地按排除法对应剩下的名字
    if camps.points and len(camps.areas) == len(camps.points) and not zones:
        area_of = {i: rows[j][3] for j, i in new.items()}
        fit = np.array(
            [
                [float(any(covers(i, x, y) and area_of[i] == a for i in area_of)) for a in camps.areas]
                for x, y, _ in camps.points
            ]
        )
        ci, ai = linear_sum_assignment(-fit)
        for c, k in zip(ci, ai, strict=True):
            if fit[c, k]:
                continue
            x, y, floor = camps.points[c]
            want = camps.areas[k]
            # 只在营地的 floor 属于该区域纸片的雷达层时作锚点（floor 是雷达上没有的值时，营地落在哪一层说不准）
            target = [j for j, r in enumerate(rows) if r[3] == want and floor in r[2]]
            if not target:
                log(f"  注意：st{stage} 营地（{want} 区）的 floor {floor} 不在该区域纸片的雷达层里，不作锚点")
                continue
            hits = [
                i
                for i in range(len(pieces))
                if covers(i, x, y) and any(layer_of[i] == rows[j][1] for j in target)
            ]
            if not hits:
                log(f"  注意：st{stage} 营地（{want} 区）不在任何可以是 {want} 区的纸片上")
                continue
            for j in target:
                for i in hits:
                    if layer_of[i] == rows[j][1]:
                        score[i, j] += 5
            log(f"  st{stage}：按营地名把营地所在的纸片定为 {want} 区")
        new = solve(score)
    changed = sorted(rows[j][3] for j in new if new[j] != match[j])
    if changed:
        log(f"  st{stage}：按区域边线重叠重排了 {len(changed)} 块纸片的区域号：{changed}")
    return new


def register(raw: Path, radar_gui: guifmt.Gui, stage: int, camps: Camps, log=print) -> dict:
    """返回 {scale, patches: [...]}；纸片坐标为雷达单位（左上角）。"""
    atlas = _rgba(raw, f"ui/map/tex/maptex/st{stage}/m_st{stage}_patch_ID.tex")
    pieces = cut_pieces(atlas)
    rows = [
        (i, layer, floors, area) for i, (layer, floors, area) in enumerate(MAP_PATCHES[stage]) if layer >= 0
    ]
    if len(rows) != len(pieces):
        raise ValueError(f"st{stage}：图集切出 {len(pieces)} 块纸片，纸片表里有 {len(rows)} 块要显示")
    floors = radar_floors(raw, stage)
    regions = area_regions(radar_gui, stage)
    scale = fit_scale(raw, stage, pieces)

    def region_of(floors_wanted: tuple[int, ...], area: int):
        boxes = [b for f, b in regions.get(area, []) if f in floors_wanted] or [
            b for _, b in regions.get(area, [])
        ]
        if not boxes:
            return None
        return (
            min(b[0] for b in boxes),
            min(b[1] for b in boxes),
            max(b[2] for b in boxes),
            max(b[3] for b in boxes),
        )

    score = np.full((len(pieces), len(rows)), -1.0)
    unions: dict[tuple[int, ...], np.ndarray] = {}
    for j, (_, _, fl, area) in enumerate(rows):
        radar = unions.setdefault(fl, _union(floors, fl))
        for i, p in enumerate(pieces):
            score[i, j] = _best_in_region(_ncc(radar, p, scale, RES), p, scale, RES, region_of(fl, area))[0]
    pi, rj = linear_sum_assignment(-score)
    match = dict(zip(rj.tolist(), pi.tolist(), strict=True))

    # 同一区域有两块纸片（上下层）时，表里两行的雷达层相同，配准分不出谁是上层：
    # 按各自单层最佳匹配的层号排序，层号高的给层（layer）高的那一行。
    by_area: dict[int, list[int]] = {}
    for j, row in enumerate(rows):
        by_area.setdefault(row[3], []).append(j)
    for js in by_area.values():
        if len(js) < 2:
            continue

        def top_floor(i: int) -> int:
            return max(floors, key=lambda f: float(_ncc(floors[f], pieces[i], scale, RES).max()))

        ps = sorted((match[j] for j in js), key=top_floor)
        for j, i in zip(sorted(js, key=lambda j: rows[j][1]), ps, strict=True):
            match[j] = i

    before = dict(match)
    match = _relabel(pieces, rows, match, unions, scale, region_of, camps, zone_boxes(raw, stage), stage, log)
    row_of = {i: j for j, i in before.items()}

    # 精修：在工作分辨率 1 下复算一次平移
    floors_full = radar_floors(raw, stage, 1.0)
    full = {fl: _union(floors_full, fl) for fl in unions}
    patches = []
    for j, (letter_index, layer, fl, area) in enumerate(rows):
        p = pieces[match[j]]
        ncc = _ncc(full[fl], p, scale, 1.0)
        s, tx, ty = _best_in_region(ncc, p, scale, 1.0, region_of(fl, area))
        # 重排了区域号的纸片：落位取新旧两个区域里相关性更高的那个（区域号错时落位往往还是对的）
        old = rows[row_of[match[j]]]
        if old[3] != area:
            s0, tx0, ty0 = _best_in_region(
                _ncc(full[old[2]], p, scale, 1.0), p, scale, 1.0, region_of(old[2], old[3])
            )
            if s0 > s:
                s, tx, ty = s0, tx0, ty0
        x, y = tx - HALF, ty - HALF
        # 区域号标签：可走区域里离边缘最远的点（纸片像素）
        walk = _walkable(atlas[p.rect[1] : p.rect[1] + p.rect[3], p.rect[0] : p.rect[0] + p.rect[2]])
        walk &= ndimage.binary_erosion(
            atlas[p.rect[1] : p.rect[1] + p.rect[3], p.rect[0] : p.rect[0] + p.rect[2], 3] > 200,
            iterations=40,
        )
        dist = ndimage.distance_transform_edt(walk)
        ly, lx = np.unravel_index(int(np.argmax(dist)), dist.shape)
        if s < LOW_SCORE:
            log(f"  注意：st{stage} 纸片 {LETTERS[letter_index]}（区域 {area}）配准得分偏低 {s:.2f}")
        patches.append(
            dict(
                letter=LETTERS[letter_index],
                area=area,
                layer=layer,
                floors=list(fl),
                rect=list(p.rect),
                x=round(x, 1),
                y=round(y, 1),
                label=[int(lx), int(ly)],
                score=round(s, 3),
            )
        )
    return dict(scale=round(scale, 4), patches=patches)


def patch_masks(raw: Path, stage: int, patches: list[dict]) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """各纸片的 (每个像素离纸片边缘的距离（纸外为 0）, 可走区域)，用于判断地图上的点落在哪块纸片上、
    以及核对点位是否落在路面上。"""
    atlas = _rgba(raw, f"ui/map/tex/maptex/st{stage}/m_st{stage}_patch_ID.tex")
    out = {}
    for p in patches:
        x, y, w, h = p["rect"]
        a = atlas[y : y + h, x : x + w]
        out[p["letter"]] = (ndimage.distance_transform_edt(a[..., 3] > 128), _walkable(a))
    return out


BACK_FADE = (6, 48)  # 背景插画四周渐暗到黑色；外圈亮度在这两值之间的像素按亮度渐变成透明，更暗的全透明


def backdrop(
    raw: Path, map_gui: guifmt.Gui, stage: int, scale: float
) -> tuple[Image.Image, list[float]] | None:
    """纸片底下那张整幅插画：map.gui 的 a_map01 里 16 个 tex_map_NN 排成 4×4（每格 2048 布局单位、贴图 1024 像素），
    运行时换成 m_stXXX_back_NN，缺的格子是空的。整张 4096 像素对应雷达的整个范围（±HALF 雷达单位，
    即世界坐标 ±50000），原点居中——与游戏截图配准得出（见 docs/DATA.md 4.1）。
    返回（按地图像素缩放、裁掉空白、外圈黑色转透明的图, 在地图坐标里的 [x0, y0, x1, y1]）。"""
    folder = raw / f"ui/map/tex/maptex/st{stage}"
    anim = map_gui.animations["a_map01"]
    origin = next(o for o in anim.objects if o.name == "null_map").init
    tiles = [o for o in anim.objects if re.fullmatch(r"tex_map_\d\d", o.name)]
    span = max(o.init["PosX"] + o.init["Size"][0] for o in tiles)  # 布局单位
    if (origin["PosX"], origin["PosY"]) != (-span / 2, -span / 2):
        raise ValueError(
            f"map.gui a_map01：null_map {origin['PosX']}, {origin['PosY']} 不在瓦片中心，布局变了"
        )
    texel = 0.0
    found = []
    for o in tiles:
        f = folder / f"m_st{stage}_back_{o.name[-2:]}_BML_NOMIP.tex"
        if f.is_file():
            img = _rgba(raw, f.relative_to(raw).as_posix())
            texel = img.shape[1] / o.init["Size"][0]  # 贴图像素 / 布局单位
            found.append((o.init["PosX"], o.init["PosY"], img))
    if not found:
        return None
    size = round(span * texel)
    canvas = np.zeros((size, size, 4), np.uint8)
    for x, y, img in found:
        x, y = round(x * texel), round(y * texel)
        canvas[y : y + img.shape[0], x : x + img.shape[1]] = img
    # 外圈：从边缘连通的暗像素；按亮度给透明度，颜色反乘回去，渐暗的边缘就成了半透明的纸边
    light = canvas[..., :3].max(axis=2).astype(np.float32) * (canvas[..., 3] > 0)
    dark, _ = ndimage.label(light < BACK_FADE[1])
    rim = np.isin(dark, np.unique(np.concatenate([dark[0], dark[-1], dark[:, 0], dark[:, -1]])))
    rim &= dark > 0
    lo, hi = BACK_FADE
    alpha = np.where(rim, np.clip((light - lo) / (hi - lo), 0, 1), 1.0)
    rgb = canvas[..., :3].astype(np.float32) / np.maximum(alpha, 1 / 255)[..., None]
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    # 只留最大的一块（瓦片角上有几个零星的亮点）
    parts, n = ndimage.label(out[..., 3] > 8)
    if n > 1:
        keep = 1 + int(np.argmax(ndimage.sum_labels(np.ones_like(parts), parts, range(1, n + 1))))
        out[(parts > 0) & (parts != keep)] = 0
    ys, xs = np.nonzero(out[..., 3] > 8)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    # 背景像素 → 地图像素：整张 = 2·HALF 雷达单位，雷达单位 ÷ 比例 = 地图像素
    k = 2 * HALF / size / scale
    img = Image.fromarray(out[y0:y1, x0:x1])
    w, h = round((x1 - x0) * k), round((y1 - y0) * k)
    img = img.resize((w, h), Image.LANCZOS)
    c = size / 2
    bounds = [
        round((x0 - c) * k, 1),
        round((y0 - c) * k, 1),
        round((x0 - c) * k + w, 1),
        round((y0 - c) * k + h, 1),
    ]
    return img, bounds


def _save_webp(img: Image.Image, path: Path, quality: int = 86) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6)


def build(raw: Path, data_out: Path, img_out: Path, only: list[int] | None = None, log=print) -> dict:
    """only 指定时只重做这些关卡，其余沿用已有 maps.json 里的结果。"""
    src = Source(raw)
    names = src.text("common/text/other_names")
    radar_gui = guifmt.parse((raw / "ui/hud/hud_radar.gui").read_bytes())
    map_gui = guifmt.parse((raw / "ui/map/map.gui").read_bytes())
    stages = []
    previous = {}
    if only and (data_out / "maps.json").is_file():
        previous = {st["id"]: st for st in json.loads((data_out / "maps.json").read_text("utf-8"))["stages"]}
    for stage, (name_index, group) in STAGES.items():
        if only and stage not in only and stage in previous:
            stages.append(previous[stage])
            continue
        log(f"st{stage}：配准纸片……")
        reg = register(raw, radar_gui, stage, camps_of(src, stage), log)
        atlas = Image.fromarray(_rgba(raw, f"ui/map/tex/maptex/st{stage}/m_st{stage}_patch_ID.tex"))
        scale = reg["scale"]
        # 地图坐标 = 纸片像素，原点与雷达原点重合（雷达单位 ÷ 比例）
        xs, ys, xe, ye = [], [], [], []
        for p in reg["patches"]:
            x, y, w, h = p["rect"]
            img = atlas.crop((x, y, x + w, y + h))
            key = p["letter"].lower()
            _save_webp(img, img_out / f"st{stage}/{key}.webp")
            _save_webp(
                img.resize((max(1, w // 2), max(1, h // 2)), Image.LANCZOS),
                img_out / f"st{stage}/{key}-half.webp",
            )
            p["mapX"] = round(p["x"] / scale, 1)
            p["mapY"] = round(p["y"] / scale, 1)
            xs.append(p["mapX"])
            ys.append(p["mapY"])
            xe.append(p["mapX"] + w)
            ye.append(p["mapY"] + h)
        # 世界地图上的整块缩略图（map.gui 的 patch_stXXX：贴图与矩形都在布局里）
        thumb = None
        anim = map_gui.animations.get(f"patch_st{stage}")
        if anim:
            tex = next(o for o in anim.objects if o.name == "tex_patch").init
            box = tuple(int(v) for v in tex["mTextureRect"])
            path = map_gui.textures[tex["Texture"]].path.replace("\\", "/")
            img = Image.fromarray(_rgba(raw, f"{path}.tex")).crop(box)
            _save_webp(img, img_out / f"st{stage}/thumb.webp")
            thumb = f"st{stage}/thumb"
        stages.append(
            dict(
                id=stage,
                name=tr(names, name_index),
                group=group,
                scale=scale,
                layers=max(p["layer"] for p in reg["patches"]) + 1,
                bounds=[min(xs), min(ys), max(xe), max(ye)],
                thumb=thumb,
                patches=reg["patches"],
                _src=dict(
                    patches=f"ui/map/tex/maptex/st{stage}/m_st{stage}_patch_ID.tex",
                    radar=f"ui/hud/tex/rtex/st{stage}/ + ui/hud/hud_radar.gui Area_line{stage}",
                    table=f"MonsterHunterWorld.exe 纸片表（构建 {DUMP_BUILD_ID}）",
                    name=f"common/text/other_names #{name_index}",
                ),
            )
        )
    # 纸片底下的整幅插画（沿用的关卡也重做，不必重新配准）
    for st in stages:
        back = backdrop(raw, map_gui, st["id"], st["scale"])
        st["backdrop"] = None
        if back:
            img, st["backdrop"] = back
            _save_webp(img, img_out / f"st{st['id']}/back.webp", 80)
            _save_webp(
                img.resize((img.width // 2, img.height // 2), Image.LANCZOS),
                img_out / f"st{st['id']}/back-half.webp",
                80,
            )
            st["_src"]["backdrop"] = (
                f"ui/map/tex/maptex/st{st['id']}/m_st{st['id']}_back_NN_BML_NOMIP.tex + ui/map/map.gui a_map01"
            )
    # 地图底下的皮革纹理（map.gui 的 mapBack）
    back = Image.fromarray(_rgba(raw, "ui/map/tex/maptex/map_back_BML_NOMIP.tex")).convert("RGB")
    _save_webp(back, img_out / "parchment.webp", 82)
    out = dict(stages=stages)
    write_json(data_out / "maps.json", out)
    log(f"写出 {len(stages)} 张地图到 {data_out / 'maps.json'}，图片到 {img_out}")
    return out
