"""区域文件 .zon（MHW:I）：只取 UI 区域（stXXX_ui.zon，HUD 上显示「第 N 区」用的区域）的粗略形状。

文件头 `zon\\0` 之后是一段 XFS（类定义 + 对象：每个区域一项，带 mAreaID / mGroupID），随后是原生数据：
每个形状一条记录，以 u16 1、u16 2、u8 0、f32 1.0、u8 1 开头，接着是
  长方体：两个 vector4（最小点、最大点，w = 0）
  棱柱：f32 高度、f32 底面 y、若干 vector4 顶点（y 都等于底面 y，w = 0）
再往后是 `grco` 块（细的区域网格，未解析）。哪种形状由数据本身区分（见 _shape）。
推断（按采集点投票核对）：大蚁冢荒地、陆珊瑚台地、瘴气之谷的形状按 exe 纸片表的行序排列（见 docs/DATA.md 4.1）。
"""

import re
import struct
from dataclasses import dataclass

_RECORD = re.compile(re.escape(bytes.fromhex("01 00 02 00 00 00 00 80 3f 01")))


class ZonError(ValueError):
    pass


@dataclass(frozen=True)
class Box:
    lo: tuple[float, float, float]
    hi: tuple[float, float, float]


@dataclass(frozen=True)
class Prism:
    y0: float
    height: float
    points: tuple[tuple[float, float], ...]  # (x, z)


def _native(data: bytes) -> bytes:
    x = data.find(b"XFS\0")
    if not data.startswith(b"zon\0") or x < 0:
        raise ZonError("不是 zon 文件")
    (defsize,) = struct.unpack_from("<I", data, x + 20)
    root = x + 0x18 + defsize
    (size,) = struct.unpack_from("<I", data, root + 4)  # 对象头：u16 类、u16 序号、u32 长度（含自身）
    end = data.find(b"grco")
    return data[root + 4 + size : end if end > 0 else len(data)]


def _shape(blob: bytes, o: int) -> Box | Prism | None:
    f = struct.unpack_from("<8f", blob, o)
    if f[3] == f[1] and f[5] == 0:
        y0, pts, q = f[1], [], o + 8
        while q + 16 <= len(blob):
            x, y, z, w = struct.unpack_from("<4f", blob, q)
            if w != 0 or y != y0:
                break
            pts.append((x, z))
            q += 16
        return Prism(y0, f[0], tuple(pts)) if len(pts) >= 3 else None
    if f[3] == 0 and f[7] == 0:
        return Box((f[0], f[1], f[2]), (f[4], f[5], f[6]))
    return None


def ui_shapes(data: bytes) -> list[Box | Prism]:
    """按文件顺序列出形状；退化的占位形状（只有一个点的棱柱）跳过。"""
    blob = _native(data)
    return [s for m in _RECORD.finditer(blob) if (s := _shape(blob, m.end())) is not None]
