"""碰撞与攻击参数 .col（hm/wp/wpNN/collision/wpNN.col 等，猎人与武器的攻击判定）。

结构（字段顺序参照 MHW-Editor 的 010 模板 col.bt——无许可证，只当格式文档读；代码为自写）：

  头：u32 0x18091001、"COL\\0"、u32 版本、u32、u32、u32 名字数
  名字表：每条 名字 \\0（日文开发名，可为空）、i32 判定形状编号、i32 攻击参数编号（-1 无）、i32、u16、u8、u32
  CLND / CLGM 段：判定形状（攻击参数解析时按标签跳过；怪物的受击判定见 damage_nodes）
  ATK 段：u32 0x18091001、"ATK\\0"、u32 版本、u32 条数、u32 类型（1 近战、3 弹体）、随后定长记录
  OAP 段：结尾

名字表的每一条是一个判定，用「攻击参数编号」指向 ATK 段的记录（记录里的序号字段等于它在段内的位置）。
多个判定可以共用一条参数（如太刀「気刃踏み込み斬り」与它的「仲間当たり」），也有判定不带参数（编号 -1）、
参数没有判定引用的情况，所以不能按位置对应：大剑「ジャンプ斬り」是第 17 条判定、第 16 条参数，动作值 48。

近战记录（218 字节）用到的字段：序号、伤害类型（1 斩 2 打 3 弹，0 无）、动作值、固定伤害、部位耐久补正、
属性补正、异常补正、眩晕值、减气值、骑乘值、软化值、怯缩值、心眼标志、两组卡肉（速度倍率、秒数）、
不消耗锐利度、能量（鬼人 / 刃气等槽的增加量，含义未逐一确认）、条件动作值、条件属性补正。
弹体记录（199 字节）用到：序号、伤害类型、动作值、固定伤害、部位耐久补正、属性种类、固定属性伤害、
属性补正、异常补正、固定的毒 / 麻痹 / 睡眠 / 爆破值、眩晕值、减气值、捕获麻醉值、软化值。
"""

import struct
from dataclasses import dataclass

MAGIC = 0x18091001
_HEAD = struct.Struct("<I4sIIII")
_NAME_TAIL = struct.Struct("<iiiHBI")
_ATK_HEAD = struct.Struct("<I4sIII")

# 近战（类型 1）：名字仅供阅读，未使用的字段以 _ 开头
_MELEE = struct.Struct(
    "<II"  # 序号、伤害类型
    "ffff"  # 动作值、固定伤害、部位耐久补正、属性补正
    "ffff"  # 异常补正、眩晕、减气、骑乘
    "ffB"  # _、_、_
    "f"  # 软化值
    "ffffffff"  # _ × 8
    "II"  # 怯缩值、_
    "B"  # 心眼
    "ffBf"  # _、_、_、_
    "ff"  # 卡肉 A：速度倍率、秒数
    "fff"  # _ × 3
    "ff"  # 卡肉 B：速度倍率、秒数
    "ffIbBIfff"  # _ × 9
    "Bf"  # _（残留判定）、_（帧延迟）
    "I"  # 不消耗锐利度
    "H"  # _
    "fff"  # 能量、条件动作值、条件属性补正
    "IIIIIIIH"  # _ × 8
)
_SHELL = struct.Struct(
    "<III"  # 序号、伤害类型、_
    "fff"  # 动作值、固定伤害、部位耐久补正
    "Iff"  # 属性种类、固定属性伤害、属性补正
    "f"  # 异常补正
    "ffff"  # 固定毒、麻痹、睡眠、爆破
    "fff"  # 眩晕、减气、捕获麻醉
    "ff"  # _ × 2
    "f"  # 软化值
    "ffffff"  # _ × 6
    "IIIIII"  # _ × 6
    "bBBIIfI"  # _ × 7
    "Bf"  # _（贯通）、_（帧间隔）
    "B"  # _
    "IIIIIIIIIII"  # _ × 11
    "H"  # _
)
assert _MELEE.size == 218 and _SHELL.size == 199


class ColError(ValueError):
    pass


@dataclass(frozen=True)
class Attack:
    index: int
    damage_type: int  # 1 斩、2 打、3 弹、0 无（异常值也按 0）
    mv: float
    fixed: float
    part: float
    element: float
    status: float
    stun: float
    exhaust: float
    mount: float = 0.0
    soften: float = 0.0
    flinch: int = 0
    minds_eye: bool = False
    hitstop: float = 0.0  # 卡肉 A 的秒数
    hitstop_b: float = 0.0
    hitstop_speed: float = 1.0
    no_sharpness: bool = False
    energy: float = 0.0
    cond_mv: float = 0.0
    cond_element: float = 0.0
    element_type: int = 0  # 弹体：属性种类
    fixed_element: float = 0.0  # 弹体：固定属性伤害
    fixed_status: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)  # 弹体：毒、麻痹、睡眠、爆破
    tranq: float = 0.0  # 弹体：捕获麻醉


@dataclass(frozen=True)
class Entry:
    name: str
    node: int  # 判定形状编号，-1 无
    attack: int  # 攻击参数编号，-1 无


@dataclass(frozen=True)
class Col:
    entries: list[Entry]
    kind: int  # 1 近战、3 弹体、0 没有攻击参数
    attacks: list[Attack]

    @property
    def names(self) -> list[str]:
        return [e.name for e in self.entries]

    def names_of(self, attack: int) -> list[str]:
        """引用第 attack 条攻击参数的判定名（按名字表顺序，去掉空名与重复）。"""
        return list(dict.fromkeys(e.name for e in self.entries if e.attack == attack and e.name))

    def attack_of(self, name: str) -> Attack:
        """按判定名找攻击参数（取第一条同名判定）。"""
        e = next(e for e in self.entries if e.name == name)
        if not 0 <= e.attack < len(self.attacks):
            raise KeyError(f"判定「{name}」没有攻击参数")
        return self.attacks[e.attack]


def _type(v: int) -> int:
    return v if v in (0, 1, 2, 3) else 0


def _melee(v: tuple) -> Attack:
    (index, typ, mv, fixed, part, ele, status, stun, exhaust, mount) = v[:10]
    return Attack(
        index=index,
        damage_type=_type(typ),
        mv=mv,
        fixed=fixed,
        part=part,
        element=ele,
        status=status,
        stun=stun,
        exhaust=exhaust,
        mount=mount,
        soften=v[13],
        flinch=v[22],
        minds_eye=bool(v[24]),
        hitstop_speed=v[29],
        hitstop=v[30],
        hitstop_b=v[35],
        no_sharpness=bool(v[47]),
        energy=v[49],
        cond_mv=v[50],
        cond_element=v[51],
    )


def _shell(v: tuple) -> Attack:
    (
        index,
        typ,
        _,
        mv,
        fixed,
        part,
        etype,
        efixed,
        ele,
        status,
        poison,
        para,
        sleep,
        blast,
        stun,
        exhaust,
        tranq,
    ) = v[:17]
    return Attack(
        index=index,
        damage_type=_type(typ),
        mv=mv,
        fixed=fixed,
        part=part,
        element=ele,
        status=status,
        stun=stun,
        exhaust=exhaust,
        soften=v[19],
        element_type=etype,
        fixed_element=efixed,
        fixed_status=(poison, para, sleep, blast),
        tranq=tranq,
    )


@dataclass(frozen=True)
class DamageNode:
    """怪物的受击判定：判定名（开发名，如 damage_head_0）指向 dtt_epg 的第 part 个部位、第 slot 个肉质槽。"""

    name: str
    part: int
    slot: int
    # 判定形状挂在的骨骼编号（各怪物通用的编号：3、4 头，100–105 颈，140–149 尾……）
    joints: tuple[int, ...] = ()


_CLGM_SHAPE_SIZE = 72


def damage_nodes(data: bytes) -> list[DamageNode]:
    """怪物 .col 里不带攻击参数的判定节点（受击判定）与它们的部位、肉质槽。

    CLND 段：u32 魔数、"CLND"、u32 版本、u32 节点数、u32 类型、u8；之后每个节点一个 CLGM 段：
    u32 魔数、"CLGM"、u32 版本、u32 形状数、形状 × 72 字节（第 18 字节起两个 i16 是两端挂的骨骼编号），
    再 26 字节参数 + 类型 2 时 8 个 i32 + u8。
    类型 2（怪物）的 8 个 i32 里，前两个是部位编号与部位内的肉质槽（-1 为不属于任何部位）：
    雌火龙 damage_head_0 → 部位 0 槽 0（头 70 / 75 / 65）、damage_neck_0 → 部位 0 槽 1（颈 40 / 45 / 35），与 Kiranico 一致。
    """
    entries, o = _entries(data)
    magic, tag, _, count, kind = struct.unpack_from("<I4sIII", data, o)
    if magic != MAGIC or tag != b"CLND":
        raise ColError("名字表之后不是 CLND 段")
    if kind != 2:
        return []
    o += 21
    params: list[tuple[int, int, tuple[int, ...]]] = []
    for _ in range(count):
        magic, tag, _, shapes = struct.unpack_from("<I4sII", data, o)
        if magic != MAGIC or tag != b"CLGM":
            raise ColError(f"CLGM 段位置不符（{o:#x}）")
        joints = sorted(
            {
                j
                for k in range(shapes)
                for j in struct.unpack_from("<hh", data, o + 16 + _CLGM_SHAPE_SIZE * k + 18)
                if j >= 0
            }
        )
        o += 16 + _CLGM_SHAPE_SIZE * shapes + 26
        part, slot = struct.unpack_from("<ii", data, o)
        params.append((part, slot, tuple(joints)))
        o += 32 + 1
    if data[o + 3 + 4 : o + 3 + 8] != b"ATK\0":  # 节点之后还有 3 个 u8
        raise ColError("CLND 段长度不符")
    out = []
    for e in entries:
        if e.attack >= 0 or not 0 <= e.node < count:
            continue
        part, slot, joints = params[e.node]
        if part >= 0 and slot >= 0:
            out.append(DamageNode(e.name, part, slot, joints))
    return out


def _entries(data: bytes) -> tuple[list[Entry], int]:
    """名字表与它之后的偏移。"""
    magic, tag, _, _, _, count = _HEAD.unpack_from(data, 0)
    if magic != MAGIC or tag != b"COL\0":
        raise ColError("不是 COL 文件")
    o = _HEAD.size
    entries = []
    for _ in range(count):
        e = data.index(b"\0", o)
        node, attack, *_ = _NAME_TAIL.unpack_from(data, e + 1)
        entries.append(Entry(data[o:e].decode("utf-8"), node, attack))
        o = e + 1 + _NAME_TAIL.size
    return entries, o


def parse(data: bytes) -> Col:
    entries, o = _entries(data)
    a = data.find(b"ATK\0", o) - 4
    if a < 0:
        raise ColError("没有 ATK 段")
    magic, _, _, n, kind = _ATK_HEAD.unpack_from(data, a)
    if magic != MAGIC:
        raise ColError("ATK 段的魔数不符")
    body = a + _ATK_HEAD.size
    if n == 0:
        return Col(entries, 0, [])
    rec, build = {1: (_MELEE, _melee), 3: (_SHELL, _shell)}.get(kind, (None, None))
    if rec is None:
        raise ColError(f"未知的攻击参数类型 {kind}")
    end = data.find(b"OAP\0", body)
    if end < 0 or end - 8 - body != n * rec.size:
        raise ColError(f"ATK 段长度 {end - 8 - body} 与 {n} × {rec.size} 不符")
    attacks = [build(rec.unpack_from(data, body + i * rec.size)) for i in range(n)]
    if any(atk.index != i for i, atk in enumerate(attacks)):
        raise ColError("攻击参数的序号不连续")
    if any(e.attack >= n for e in entries):
        raise ColError("判定引用的攻击参数编号超出范围")
    return Col(entries, kind, attacks)
