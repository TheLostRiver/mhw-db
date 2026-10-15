"""MT Framework .gui 界面布局（MHW:I，版本 0x23316）。

只读出「动画 → 对象 → 初始参数」和贴图表，够拿到精灵的位置、尺寸与贴图矩形；关键帧暂不解析。
布局由 ui/map/map.gui、ui/hud/hud_radar.gui、ui/quest/map_quest.gui 三个文件对照推出，
各段记录长度都能被头部计数整除，数值与画面核对一致（见 docs/DATA.md「界面布局」）。

头部（u32 计数在 0x28 起，u64 段偏移在 0xA0 起）：
  计数  0x28 动画  0x2C 序列  0x30 对象  0x34 对象序列  0x38 初始参数  0x70 贴图
  偏移  [1] 动画 32B  [2] 序列 16B  [3] 对象 56B  [5] 初始参数 32B  [18] 贴图 64B
        [25] 字符串表  [27] 8 位值池  [28] 32 位值池  [29] 128 位值池
动画：u32 id，u16 对象数，u16 序列数，u32 首对象序号（0x0C），u64 名称（0x10），u64 首序列序号（0x18）
序列：u64 名称（0x08）
对象：u32 id，u8 初始参数数（0x04），i32 子对象（0x08），i32 下一个（0x0C），u64 名称（0x10），
      u32 类型哈希（0x18），u64 首初始参数序号（0x20）
初始参数：u8 类型，u64 名称（0x10），u64 值或值池偏移（0x18）
贴图：u32 id，u16 宽 / 高（0x0C / 0x0E），u64 路径（0x30），u64 名称（0x38）
"""

import struct
from dataclasses import dataclass

MAGIC = b"GUI\0"
HEADER_OFFSETS = 0xA0

# 参数类型 → 取值方式（值池里的字节数）；未列出的类型原样保留整数
_KV8, _KV32, _KV128 = 27, 28, 29
T_INT, T_FLOAT, T_BYTE, T_VEC4, T_TEXTURE = 0x01, 0x02, 0x03, 0x04, 0x07
T_BOOL, T_ENUM = 0x11, 0x12


class GuiError(ValueError):
    pass


@dataclass(frozen=True)
class GuiObject:
    id: int
    name: str
    type_hash: int
    child: int
    next: int
    init: dict[str, object]


@dataclass(frozen=True)
class GuiAnimation:
    id: int
    name: str
    sequences: tuple[str, ...]
    objects: tuple[GuiObject, ...]


@dataclass(frozen=True)
class GuiTexture:
    id: int
    name: str
    path: str
    width: int
    height: int


@dataclass(frozen=True)
class Gui:
    animations: dict[str, GuiAnimation]
    textures: dict[int, GuiTexture]


def parse(data: bytes) -> Gui:
    if data[:4] != MAGIC:
        raise GuiError(f"不是 .gui 文件（magic={data[:4]!r}）")
    u16 = lambda o: struct.unpack_from("<H", data, o)[0]  # noqa: E731
    u32 = lambda o: struct.unpack_from("<I", data, o)[0]  # noqa: E731
    i32 = lambda o: struct.unpack_from("<i", data, o)[0]  # noqa: E731
    u64 = lambda o: struct.unpack_from("<Q", data, o)[0]  # noqa: E731
    off = [u64(HEADER_OFFSETS + 8 * i) for i in range(34)]
    strings = off[25]

    def text(o: int) -> str:
        start = strings + o
        end = data.index(b"\0", start)
        return data[start:end].decode("utf-8")

    def value(kind: int, raw: int) -> object:
        if kind in (T_BOOL, T_ENUM):
            return raw
        if kind == T_BYTE:
            return data[off[_KV8] + raw]
        if kind in (T_INT, T_TEXTURE):
            return u32(off[_KV32] + raw)
        if kind == T_FLOAT:
            return struct.unpack_from("<f", data, off[_KV32] + raw)[0]
        if kind == T_VEC4:
            return struct.unpack_from("<4f", data, off[_KV128] + raw)
        return raw

    def init_params(start: int, count: int) -> dict[str, object]:
        out: dict[str, object] = {}
        for p in range(start, start + count):
            o = off[5] + p * 32
            name = text(u64(o + 16))
            # 同名参数只出现一次；保险起见保留第一个
            out.setdefault(name, value(data[o], u64(o + 24)))
        return out

    animations: dict[str, GuiAnimation] = {}
    for i in range(u32(0x28)):
        o = off[1] + i * 32
        n_obj, n_seq = u16(o + 4), u16(o + 6)
        obj0, seq0 = u32(o + 12), u64(o + 24)
        seqs = tuple(text(u64(off[2] + j * 16 + 8)) for j in range(seq0, seq0 + n_seq))
        objs = []
        for k in range(obj0, obj0 + n_obj):
            q = off[3] + k * 56
            objs.append(
                GuiObject(
                    id=u32(q),
                    name=text(u64(q + 16)),
                    type_hash=u32(q + 24),
                    child=i32(q + 8),
                    next=i32(q + 12),
                    init=init_params(u64(q + 32), data[q + 4]),
                )
            )
        name = text(u64(o + 16))
        animations[name] = GuiAnimation(u32(o), name, seqs, tuple(objs))

    textures: dict[int, GuiTexture] = {}
    for i in range(u32(0x70)):
        o = off[18] + i * 64
        tid = u32(o)
        textures[tid] = GuiTexture(tid, text(u64(o + 56)), text(u64(o + 48)), u16(o + 12), u16(o + 14))
    return Gui(animations, textures)
