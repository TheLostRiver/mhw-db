import json

import numpy as np
import pytest

from mhdb.config import DATA, DATA_RAW
from mhdb.games.world.exe import MAP_PATCHES
from mhdb.images.world_maps import LETTERS, area_regions, cut_pieces


def test_cut_pieces_finds_opaque_blobs() -> None:
    atlas = np.zeros((300, 400, 4), np.uint8)
    atlas[20:140, 30:200] = (200, 190, 170, 255)  # 浅色路面
    atlas[180:290, 250:390] = (90, 80, 60, 255)  # 深色墙面
    pieces = cut_pieces(atlas)
    # 膨胀 3 像素后取连通域：矩形各向外扩 3 像素
    assert [p.rect for p in pieces] == [(27, 17, 176, 126), (247, 177, 146, 116)]


MAPS = DATA / "world" / "maps.json"


@pytest.mark.game
@pytest.mark.skipif(not MAPS.is_file(), reason="需要先运行 mhdb maps")
def test_maps_follow_patch_table() -> None:
    for stage in json.loads(MAPS.read_text(encoding="utf-8"))["stages"]:
        visible = {
            LETTERS[i]: (layer, list(floors), area)
            for i, (layer, floors, area) in enumerate(MAP_PATCHES[stage["id"]])
            if layer >= 0
        }
        got = {p["letter"]: (p["layer"], p["floors"], p["area"]) for p in stage["patches"]}
        assert got == visible, f"st{stage['id']} 的纸片与纸片表不一致"
        assert stage["layers"] == max(v[0] for v in visible.values()) + 1


@pytest.mark.game
@pytest.mark.skipif(not (DATA_RAW / "world/ui/hud/hud_radar.gui").is_file(), reason="需要先运行 mhdb extract")
def test_radar_area_regions_against_game() -> None:
    from mhdb.formats.gui import parse

    regions = area_regions(parse((DATA_RAW / "world/ui/hud/hud_radar.gui").read_bytes()), 101)
    assert sorted(regions) == list(range(1, 18))
    # 区域 1 的边线在地面层：null_area0 (-538.733, 420.567) + 566×278
    floor, (x0, y0, x1, y1) = regions[1][0]
    assert floor == 0
    assert (round(x0, 1), round(y0, 1), round(x1 - x0), round(y1 - y0)) == (-538.7, 420.6, 566, 278)
    # 古代树森林的上层区域（13–17）都不在地面层
    assert all(f > 0 for a in range(13, 18) for f, _ in regions[a])


@pytest.mark.skipif(not (DATA_RAW / "world/ui/map/map.gui").is_file(), reason="需要先运行 mhdb extract")
def test_backdrop_covers_radar_extent() -> None:
    """背景插画整张 = 雷达 ±820 单位：比例 0.5 的图在地图坐标里不超过 ±1640，永霜冻土（0.625）不超过 ±1312；
    外圈的黑色变透明，纸片大体落在插画里。"""
    from mhdb.formats.gui import parse
    from mhdb.images.world_maps import HALF, backdrop

    gui = parse((DATA_RAW / "world/ui/map/map.gui").read_bytes())
    for stage, scale in ((101, 0.5), (108, 0.625)):
        img, (x0, y0, x1, y1) = backdrop(DATA_RAW / "world", gui, stage, scale)
        lim = HALF / scale + 1
        assert -lim <= x0 < x1 <= lim and -lim <= y0 < y1 <= lim
        assert abs(img.width - (x1 - x0)) <= 1 and abs(img.height - (y1 - y0)) <= 1
        a = np.asarray(img.getchannel("A"))
        assert a[0, 0] == 0 and a[-1, -1] == 0 and a[a.shape[0] // 2, a.shape[1] // 2] == 255


@pytest.mark.skipif(
    not (DATA_RAW / "world/ui/common/tex/cmn_creature00_ID.tex").is_file(), reason="需要先运行 mhdb extract"
)
def test_creature_atlas_has_one_cell_per_note() -> None:
    """环境生物图集里有图的格子正好是前 86 格，与 em_animal_note 的 86 条一一对应。"""
    from mhdb.images.atlas import grid_cell
    from mhdb.images.world_icons import CREATURE_ATLAS, _atlas

    atlas = _atlas(DATA_RAW / "world", CREATURE_ATLAS)
    cells = (atlas.width // 64) * (atlas.height // 64)
    filled = [i for i in range(cells) if grid_cell(atlas, i).getchannel("A").getbbox()]
    assert filled == list(range(86))


@pytest.mark.skipif(
    not MAPS.is_file() or not (DATA_RAW / "world/ui/map/map.gui").is_file(), reason="需要先运行 mhdb maps"
)
def test_cover_is_whole_map() -> None:
    """封面 = 背景插画 + 1 层纸片：长边 COVER_SIZE，范围包住插画与全部 1 层纸片（中心不透明，四角透明）。"""
    from mhdb.formats.gui import parse
    from mhdb.images.world_maps import COVER_SIZE, backdrop, cover

    gui = parse((DATA_RAW / "world/ui/map/map.gui").read_bytes())
    st = next(s for s in json.loads(MAPS.read_text("utf-8"))["stages"] if s["id"] == 101)
    img = cover(DATA_RAW / "world", st, backdrop(DATA_RAW / "world", gui, 101, st["scale"])[0])
    assert max(img.size) == COVER_SIZE and min(img.size) > COVER_SIZE * 0.9
    a = np.asarray(img.getchannel("A"))
    assert a[a.shape[0] // 2, a.shape[1] // 2] == 255 and a[0, 0] == 0 and a[-1, -1] == 0
