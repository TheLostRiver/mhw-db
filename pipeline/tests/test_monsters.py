import struct

import pytest

from mhdb.build.world_monsters import _merge_labels, infer_label, stem
from mhdb.config import DATA_RAW
from mhdb.formats import col, crypto, eda, emi, epg

WORLD = DATA_RAW / "world"
RATHIAN = WORLD / "em/em001/00"
need_game = pytest.mark.skipif(
    not (RATHIAN / "data/em001.dtt_epg").is_file(), reason="需要先运行 mhdb extract"
)


def _epg(
    parts: list[tuple[int, list[list[int]]]], hitzones: list[list[int]], breaks: list[tuple[int, int]]
) -> bytes:
    out = struct.pack("<6I", epg.MAGIC, 0, 9, 0, 3000, len(parts))
    for flinch, slots in parts:
        out += struct.pack("<IiiiII", flinch, 0 if breaks else -1, -1, -1, 0, len(slots))
        for ids in slots:
            out += struct.pack("<10i", *ids)
        out += b"\0" * 14
    out += struct.pack("<I", len(hitzones)) + b"".join(struct.pack("<f10I", 0, *h) for h in hitzones)
    out += struct.pack("<I", len(breaks)) + b"".join(
        struct.pack("<IIIIiBBB", k, 0, 0, v, 1, 0, 0, 0) for k, v in breaks
    )
    out += struct.pack("<I", 0) + struct.pack("<II", 10, 0)
    return out + b"\0" * (-len(out) % 8)


def test_epg_synthetic() -> None:
    hz = [[70, 75, 65, 0, 15, 15, 20, 30, 100, 100], [60, 65, 45, 0, 15, 15, 20, 30, 100, 100]]
    e = epg.parse(_epg([(240, [[0, -1, -1, -1, -1, 1, -1, -1, -1, -1]])], hz, [(1, 300)]))
    assert (e.monster_id, e.hp, e.parts[0].flinch) == (9, 3000, 240)
    p = e.parts[0]
    assert p.hitzone(0, master=False) == 0 and p.hitzone(0, master=True) == 1
    assert e.hitzones[1].sever == 60 and e.hitzones[0].thunder == 20 and e.hitzones[0].ice == 15
    assert e.breaks[0].kind == 1 and e.breaks[0].value == 300


def test_epg_dangling_hitzone_becomes_missing() -> None:
    e = epg.parse(_epg([(100, [[0, -1, 5, -1, -1, -1, -1, -1, -1, -1]])], [[1] * 10], []))
    assert e.dangling == 1 and e.parts[0].slots[0][2] == -1


def test_label_helpers() -> None:
    assert stem("damage_head_0") == "head" and stem("damege_frontleg_left_OBJ無し") == "frontleg_left"
    assert stem("Damage_Arm_Left_Push") == "arm_left"
    assert _merge_labels(["头部（上）", "头部（下）", "颈部"]) == ["头部", "颈部"]
    assert _merge_labels(["左翼", "右翼"]) == ["翼"]
    from collections import Counter

    votes = {3: Counter({"头部": 9, "颈部": 1}), 140: Counter({"尾巴": 5})}
    assert infer_label((3,), votes) == "头部（推断）" and infer_label((999,), votes) is None


@need_game
def test_rathian_against_kiranico() -> None:
    """雌火龙：肉质、怯缩值、尾巴切断值、精华颜色、异常耐性与 Kiranico 一致。"""
    e = epg.parse(crypto.decrypt((RATHIAN / "data/em001.dtt_epg").read_bytes(), crypto.KEYS[".dtt_epg"]))
    assert e.hp == 3000 and [p.flinch for p in e.parts] == [240, 300, 180, 180, 210, 210, 200]
    head, neck = (e.hitzones[e.parts[0].hitzone(s, master=False)] for s in (0, 1))
    assert (head.sever, head.blunt, head.shot, head.dragon, head.thunder) == (70, 75, 65, 30, 20)
    assert (neck.sever, neck.blunt, neck.shot) == (40, 45, 35)
    mr_wing = e.hitzones[e.parts[2].hitzone(0, master=True)]
    assert (mr_wing.sever, mr_wing.blunt, mr_wing.shot) == (21, 21, 45)
    assert e.breaks[e.parts[6].specials[0]].value == 300
    assert [p.extract for p in e.parts] == [0, 2, 1, 1, 2, 2, 3]  # 红、橙、白、白、橙、橙、绿
    a = eda.parse(crypto.decrypt((RATHIAN / "data/em001.dtt_eda").read_bytes(), crypto.KEYS[".dtt_eda"]))
    assert (a.poison.base, a.poison.increase, a.poison.max, a.poison.duration) == (250, 150, 700, 15)
    assert (a.stun.base, a.stun.increase, a.stun.max, a.stun.duration) == (120, 100, 620, 7)
    assert (a.blast.base, a.blast.increase, a.blast.max, a.blast_damage) == (120, 60, 720, 100)
    assert (a.mount.base, a.mount.increase, a.mount.max) == (40, 70, 460)
    assert (a.shock_trap.duration, a.shock_trap.duration_step, a.shock_trap.duration_min) == (8, 2, 2)


@need_game
def test_rathian_hurtboxes_map_to_parts() -> None:
    nodes = {n.name: n for n in col.damage_nodes((RATHIAN / "collision/em001.col").read_bytes())}
    assert (nodes["damage_head_0"].part, nodes["damage_head_0"].slot) == (0, 0)
    assert (nodes["damage_neck_0"].part, nodes["damage_neck_0"].slot) == (0, 1)
    assert (nodes["damage_tail_1"].part, nodes["damage_wing_left_0"].part) == (6, 2)
    assert 3 in nodes["damage_head_0"].joints  # 骨骼编号 3 是头


@need_game
def test_note_stars() -> None:
    notes = [n for n in emi.parse((WORLD / "common/note/em_note.emi").read_bytes()) if n.monster_id == 9]
    assert len(notes) == 2
    assert notes[0].stars["dragon"] == 3 and notes[0].stars["fire"] == 0 and notes[0].stars["thunder"] == 2
