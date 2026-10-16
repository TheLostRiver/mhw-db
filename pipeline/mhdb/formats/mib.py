"""任务数据 questData_NNNNN.mib（整文件加密，解密后固定 1104 字节，小端、无对齐、没有条数字段）。

字段顺序参照公开的 QuestDataDump 的 MIBTemplate-Iceborne.bt（只读作格式文档，未复制代码），
用 struct.calcsize 校验总长。字段含义与核对依据见 docs/DATA.md 3.9；名字带 unk 的未确认。
"""

import struct

from mhdb.formats import crypto

MAGIC = 0x18091001
SIZE = 1104


def _f(s: str) -> list[tuple[str, str]]:
    return [tuple(t.split(":")) for t in s.split()]  # type: ignore[misc]


def _objective(p: str) -> list[tuple[str, str]]:
    return _f(f"{p}type:B {p}mm:B {p}unk:H {p}id:H {p}count:H")


def _monster(i: int) -> list[tuple[str, str]]:
    return _f(
        f"em{i}_id:i em{i}_spawn:I em{i}_unk0:I em{i}_temp:B em{i}_hp:I em{i}_atk:I em{i}_pl_dmg:I "
        f"em{i}_variant:I em{i}_size:I em{i}_size_tbl:I em{i}_unk1:I em{i}_part_hp:I em{i}_status_base:I "
        f"em{i}_status_build:I em{i}_stun:I em{i}_exhaust:I em{i}_mount:I"
    )


FIELDS = (
    _f(
        "magic:I version:H pad:I id:I stars:B rank2:I unk1:I rank:I map:I pl_spawn:I fixed_spawn:I "
        "bin_map:I day_night:I weather:I unk3:I reward:I faint_penalty:I sub_reward:I time:I unk4:B "
        "icon0:H icon1:H icon2:H icon3:H icon4:H hr_restrict:B unk6:I"
    )
    + _objective("o1_")
    + _objective("o2_")
    + _f("obj_required:B")
    + _objective("s1_")
    + _objective("s2_")
    + _f(
        "o_unk0:I music:I end_music:I quest_type:B quest_icon:B at_flag:B o_unk3:B rem1:I rem2:I rem3:I supp:I "
        "o_unk4:I o_unk5:I o_unk6:I hr_points:I o_unk7:I o_unk8:I"
    )
    + [x for i in range(7) for x in _monster(i)]
    + _f("ems_spawn:I ems_hp:I ems_atk:I ems_status:I")
    + _f("sp_flag:b multi_diff:I sp_icon_count:I")
    + [(f"sp_rule{i}", "I") for i in range(5)]
    + [(f"sp_{i}", "I") for i in range(8)]
    + [(f"mi{i}_{c}", "I") for i in range(17) for c in "abc"]
    + [(f"ems_icon{i}", "I") for i in range(10)]
    + _f(
        "ar_set:I ar_restrict:I ar_rank_a:I ar_rank_b:I ar_rank_c:I ar_u0:I ar_u1:I ar_u2:I ar_fence:B ar_u3:B "
        "ar_u4:H ar_u5:I ar_fence_cd:I ar_fence_up:I ar_u6:I ar_u7:I ar_u8:I"
    )
    + [(f"ib{i}", "I") for i in range(10)]
    + [("ib_b0", "b")]
    + [(f"ib100_{i}", "I") for i in range(7)]
    + [(f"ib1{i}", "I") for i in range(5)]
    + _f("ib_b1:b ib_b2:b ib_b3:b")
)
FMT = "<" + "".join(f for _, f in FIELDS)
NAMES = [n for n, _ in FIELDS]
if struct.calcsize(FMT) != SIZE:
    raise AssertionError(f"mib 字段总长 {struct.calcsize(FMT)} ≠ {SIZE}")


class MibError(ValueError):
    pass


def parse(data: bytes, *, encrypted: bool = True) -> dict[str, int]:
    d = crypto.decrypt(data, crypto.KEYS[".mib"]) if encrypted else data
    if len(d) < SIZE or any(d[SIZE:]):
        raise MibError(f"mib 长度 {len(d)} 不符（应为 {SIZE}，其后只能是 0 填充）")
    row = dict(zip(NAMES, struct.unpack_from(FMT, d), strict=True))
    if row["magic"] != MAGIC:
        raise MibError(f"mib magic {row['magic']:#x} 不符")
    return row


# 目标种类（已用任务文本核对）
OBJECTIVE_TYPES = {0x31: "hunt", 0x21: "slay", 0x11: "capture", 0x02: "deliver", 0x01: "all"}


def objectives(row: dict, prefix: str) -> list[dict]:
    out = []
    for p in (f"{prefix}1_", f"{prefix}2_"):
        kind = OBJECTIVE_TYPES.get(row[f"{p}type"])
        if kind is None or not row[f"{p}count"]:
            continue
        out.append({"type": kind, "target": row[f"{p}id"], "count": row[f"{p}count"]})
    return out


def monsters(row: dict) -> list[dict]:
    """7 个大型怪物槽（槽 5、6 常是乱入），跳过 id = -1；各倍率字段是 em_difficulty.dtt_dif 单人表的行号。"""
    out = []
    for i in range(7):
        mid = row[f"em{i}_id"]
        if mid < 0:
            continue
        out.append(
            {
                "slot": i,
                "id": mid,
                "hp": row[f"em{i}_hp"],
                "atk": row[f"em{i}_atk"],
                "plDmg": row[f"em{i}_pl_dmg"],
                "partHp": row[f"em{i}_part_hp"],
                "status": row[f"em{i}_status_base"],
                "size": row[f"em{i}_size"],
            }
        )
    return out
