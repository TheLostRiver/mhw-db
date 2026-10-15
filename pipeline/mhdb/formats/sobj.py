"""关卡布置文件 .sobj（MHW:I）：解析 cAssetBasicSetObject（采集点、投射器弹、营地、机关等物件）、
cSetAnimalArea（环境生物的出现范围，采集用的虫也在这里）与 cVillageNpcSetter（野外 NPC）。

文件是一串记录，每条以 u32 类哈希 + 类名 \\0 开头；各类的记录长度不同，这里按类名定位记录，
其余类跳过。布局由 stage/ 下全部 .sobj 对照推出（见 docs/DATA.md）：

  u32 类哈希、类名 \\0、u32（=4）、f32×3 位置、f32×3 旋转（度）、f32×3 缩放、物件名 \\0（如 gm000_010_00）
  u8、s32 a、u8×3、s32 b、f32 c、s32 floor、s32 e、u32、u32、u8          ← 定长部分（33 字节）
  u32（=4）、4 个字符串 \\0（多为空，事件物件写事件名）、u32 属性数            ← 属性表头
  每个属性：u32 值类型、值、属性名 \\0、u32 类型号、类型名 \\0、13 字节（数组信息，未用）

值类型与长度：3 bool（1）、4 整数（4）、6 f32（4）、8 vector3（16，含 1 个填充 float）、
9 matrix44（64）、0xD 类引用（u8 + u32 编号 + u8，取编号）。
floor：与物件高度、雷达层大体对应（高处的古树顶层为 3、4），按雷达层使用；a、b、c、e 含义未确认。

cSetAnimalArea（没有物件名与属性表）：
  u32 类哈希、类名 \\0、u32（=4）、f32×3 位置、f32×3 旋转、f32×3 缩放
  u8、u8、s32 floor、s32（=−1）、9 字节、u32（=4）、4 个字符串 \\0（任务专用的写任务名）
  4 字节、64 字节（填充 0xCD）、1 字节
  u32 环境生物编号（animal.gcd 的 EC_NNN）、u32 变种（EC_NNN_0V，0 为无后缀）、u32、u32、f32（=1）
  之后是出现半径与若干个出现点（未用）。
"""

import re
import struct
from dataclasses import dataclass, field

CLASS = b"cAssetBasicSetObject\0"
ANIMAL_CLASS = b"cSetAnimalArea\0"
_FIXED = struct.Struct("<BiBBBifiiIIB")
_VALUE_SIZE = {3: 1, 4: 4, 6: 4, 8: 16, 9: 64, 0xD: 6}


class SobjError(ValueError):
    pass


@dataclass(frozen=True)
class SetObject:
    name: str  # 物件名，如 gm000_010_00
    pos: tuple[float, float, float]  # 世界坐标（y 向上）
    rot: tuple[float, float, float]
    floor: int
    props: dict[str, object] = field(default_factory=dict)

    @property
    def gimmick(self) -> str:
        """物件种类：gm000_010_00 → gm000_010"""
        return self.name[:9]


def _cstr(data: bytes, o: int) -> tuple[str, int]:
    e = data.index(b"\0", o)
    return data[o:e].decode("utf-8", "replace"), e + 1


def _value(kind: int, data: bytes, o: int) -> object:
    if kind == 3:
        return data[o]
    if kind == 4:
        return struct.unpack_from("<i", data, o)[0]
    if kind == 6:
        return struct.unpack_from("<f", data, o)[0]
    if kind == 8:
        return struct.unpack_from("<3f", data, o)
    if kind == 9:
        return struct.unpack_from("<16f", data, o)
    return struct.unpack_from("<I", data, o + 1)[0]  # 0xD 类引用


def parse(data: bytes) -> list[SetObject]:
    out = []
    start = data.find(CLASS)
    while start != -1:
        o = start + len(CLASS) + 4
        pos = struct.unpack_from("<3f", data, o)
        rot = struct.unpack_from("<3f", data, o + 12)
        name, o = _cstr(data, o + 36)
        fixed = _FIXED.unpack_from(data, o)
        o += _FIXED.size + 4
        for _ in range(4):
            _, o = _cstr(data, o)
        (count,) = struct.unpack_from("<I", data, o)
        o += 4
        props: dict[str, object] = {}
        for _ in range(count):
            (kind,) = struct.unpack_from("<I", data, o)
            if kind not in _VALUE_SIZE:
                raise SobjError(f"{name}：偏移 {o:#x} 的属性值类型 {kind} 未知")
            value = _value(kind, data, o + 4)
            prop, o = _cstr(data, o + 4 + _VALUE_SIZE[kind])
            _, o = _cstr(data, o + 4)
            o += 13
            props[prop] = value
        out.append(SetObject(name=name, pos=pos, rot=rot, floor=fixed[7], props=props))
        start = data.find(CLASS, o)
    return out


@dataclass(frozen=True)
class AnimalArea:
    pos: tuple[float, float, float]
    floor: int
    ec: int  # EC_NNN
    variant: int  # EC_NNN_0V；0 为无后缀

    @property
    def name(self) -> str:
        return f"EC_{self.ec:03d}" + (f"_{self.variant:02d}" if self.variant else "")


_ANIMAL_TAIL = struct.Struct("<IIIIf")


@dataclass(frozen=True)
class Placed:
    """没有属性表的布置记录的公共部分：位置、floor、4 个字符串，以及字符串之后的偏移。"""

    pos: tuple[float, float, float]
    floor: int
    strings: tuple[str, ...]
    end: int


def _placed(data: bytes, cls: bytes) -> list[Placed]:
    """按类名找记录：u32 类哈希、类名 \\0、u32（=4）、f32×9 变换、u8、u8、s32 floor、s32（=−1）、9 字节、
    u32（=4）、4 个字符串 \\0。cSetAnimalArea、cVillageNpcSetter 都是这样开头。"""
    out = []
    start = data.find(cls)
    while start != -1:
        o = start + len(cls) + 4
        pos = struct.unpack_from("<3f", data, o)
        body = o + 36
        (floor,) = struct.unpack_from("<i", data, body + 2)
        if struct.unpack_from("<I", data, body + 19)[0] != 4:
            raise SobjError(f"{cls[:-1].decode()} @{start:#x}：字符串表头不符")
        s, strings = body + 23, []
        for _ in range(4):
            text, s = _cstr(data, s)
            strings.append(text)
        out.append(Placed(pos=pos, floor=floor, strings=tuple(strings), end=s))
        start = data.find(cls, body)
    return out


def animal_areas(data: bytes) -> list[AnimalArea]:
    out = []
    for p in _placed(data, ANIMAL_CLASS):
        ec, variant, _, _, one = _ANIMAL_TAIL.unpack_from(data, p.end + 69)
        if one != 1.0:
            raise SobjError(f"cSetAnimalArea @{p.end:#x}：编号处不是（编号、变种、…、1.0），布局不符")
        out.append(AnimalArea(pos=p.pos, floor=p.floor, ec=ec, variant=variant))
    return out


NPC_CLASS = b"cVillageNpcSetter\0"


@dataclass(frozen=True)
class Npc:
    pos: tuple[float, float, float]
    floor: int
    npc: int  # 第一个字符串 n002 / npc036_00 里的编号 → chr_names 的 N002_NPC_NAME
    tag: str  # 第一个字符串原样（npc036_00、npc036_01 是同一人的几处位置）


def npcs(data: bytes, default: int | None = None) -> list[Npc]:
    """stXXX_nNNN.sobj：野外 NPC 的位置。字符串为空的记录（如 st108_n954）用文件名里的编号 default。"""
    out = []
    for p in _placed(data, NPC_CLASS):
        m = re.match(r"n(?:pc)?(\d+)", p.strings[0])
        npc = int(m.group(1)) if m else default
        if npc is None:
            raise SobjError(f"cVillageNpcSetter：认不出 NPC 编号 {p.strings[0]!r}")
        out.append(Npc(pos=p.pos, floor=p.floor, npc=npc, tag=p.strings[0]))
    return out
