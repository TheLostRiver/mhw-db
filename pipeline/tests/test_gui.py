import struct

import pytest

from mhdb.config import DATA_RAW
from mhdb.formats.gui import HEADER_OFFSETS, T_ENUM, T_FLOAT, T_TEXTURE, T_VEC4, GuiError, parse


def make_gui() -> bytes:
    """构造一个最小的 .gui：1 个动画、1 个序列、2 个对象、4 个初始参数、1 张贴图。"""
    strings = bytearray()

    def s(t: str) -> int:
        at = len(strings)
        strings.extend(t.encode() + b"\0")
        return at

    kv32 = struct.pack("<fI", -538.5, 230)  # PosX、贴图 id
    kv128 = struct.pack("<4f", 0, 472, 656, 1024)
    anim = struct.pack("<IHHIIQQ", 7, 2, 1, 0, 0, s("patch_st101"), 0)
    seq = struct.pack("<IIQ", 1, 0, s("DEFAULT"))
    obj0 = struct.pack("<IIiiQIIQQii", 1, 0, -1, 1, s("patch_st101"), 0x1C403258, 0, 0, 0, -1, 0)
    obj1 = struct.pack("<IIiiQIIQQii", 2, 4, -1, -1, s("tex_patch"), 0x1B6313A3, 0, 0, 0, -1, 0)
    params = b"".join(
        struct.pack("<B15xQQ", kind, s(name), raw)
        for kind, name, raw in (
            (T_FLOAT, "PosX", 0),
            (T_TEXTURE, "Texture", 4),
            (T_VEC4, "mTextureRect", 0),
            (T_ENUM, "ControlPoint", 5),
        )
    )
    tex = struct.pack("<I8xHH", 233, 2048, 1024).ljust(48, b"\0") + struct.pack(
        "<QQ", s("ui\\map\\tex\\maptex\\map_all_patch_ID"), s("mapAllPathc")
    )

    head = bytearray(0x1B0)
    head[:4] = b"GUI\0"
    struct.pack_into("<5I", head, 0x28, 1, 1, 2, 0, 4)
    struct.pack_into("<I", head, 0x70, 1)
    body = bytearray()
    offsets = [0] * 34

    def put(index: int, blob: bytes) -> None:
        offsets[index] = len(head) + len(body)
        body.extend(blob)

    put(1, anim)
    put(2, seq)
    put(3, obj0 + obj1)
    put(5, params)
    put(18, tex)
    put(27, b"\0")
    put(28, kv32)
    put(29, kv128)
    put(25, bytes(strings))
    struct.pack_into("<34Q", head, HEADER_OFFSETS, *offsets)
    return bytes(head + body)


def test_parse_synthetic() -> None:
    gui = parse(make_gui())
    anim = gui.animations["patch_st101"]
    assert anim.id == 7 and anim.sequences == ("DEFAULT",)
    assert [o.name for o in anim.objects] == ["patch_st101", "tex_patch"]
    tex = anim.objects[1]
    assert tex.type_hash == 0x1B6313A3 and tex.child == -1
    assert tex.init == {
        "PosX": -538.5,
        "Texture": 230,
        "mTextureRect": (0.0, 472.0, 656.0, 1024.0),
        "ControlPoint": 5,
    }
    t = gui.textures[233]
    assert (t.name, t.width, t.height) == ("mapAllPathc", 2048, 1024)
    assert t.path.endswith("map_all_patch_ID")


def test_bad_magic() -> None:
    with pytest.raises(GuiError, match="不是 .gui"):
        parse(b"TEX\0" + bytes(0x200))


GAME_GUI = DATA_RAW / "world" / "ui"


@pytest.mark.game
@pytest.mark.skipif(not (GAME_GUI / "hud/hud_radar.gui").is_file(), reason="需要先运行 mhdb extract")
def test_radar_area_lines_against_game() -> None:
    gui = parse((GAME_GUI / "hud/hud_radar.gui").read_bytes())
    objs = {o.name: o.init for o in gui.animations["Area_line101"].objects}
    # 古代树森林区域 1 的边线：节点位置与贴图矩形（对照 r_st101_area_ID 的图形核实）
    assert objs["null_area0"]["PosX"] == pytest.approx(-538.733, abs=1e-3)
    assert objs["null_area0"]["PosY"] == pytest.approx(420.567, abs=1e-3)
    assert objs["tex_line0"]["mTextureRect"] == (569.0, 465.0, 1135.0, 743.0)
    # 雷达瓦片：每块 512 像素贴图画成 820 单位见方
    tiles = {o.name: o.init for o in gui.animations["map"].objects}
    assert tiles["tex_map_f00_00"]["Size"][:2] == (820.0, 820.0)
    assert tiles["tex_map_f00_00"]["ControlPoint"] == 10


@pytest.mark.game
@pytest.mark.skipif(not (GAME_GUI / "map/map.gui").is_file(), reason="需要先运行 mhdb extract")
def test_map_stage_patch_against_game() -> None:
    gui = parse((GAME_GUI / "map/map.gui").read_bytes())
    tex = next(o for o in gui.animations["patch_st101"].objects if o.name == "tex_patch")
    assert tex.init["mTextureRect"] == (0.0, 472.0, 656.0, 1024.0)
    assert gui.textures[tex.init["Texture"]].path.endswith("map_all_patch_ID")
