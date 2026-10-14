"""MT Framework .tex 贴图（MHW:I，版本 0x10）。

头部布局（对照 ui/common/tex 下 46 个文件核实）：
  0x00  magic "TEX\\0"
  0x04  u32 版本 = 0x10
  0x14  u32 mip 数
  0x18  u32 宽
  0x1C  u32 高
  0x20  u32 深度 / 数组数（UI 贴图均为 1）
  0x24  u32 像素格式
  0xB8  u64 × mip 数：各级 mip 的数据偏移

只解码已核实的格式；遇到新格式先核对再加，不猜。
"""

import struct
from dataclasses import dataclass

import texture2ddecoder

MAGIC = b"TEX\0"
HEADER_SIZE = 0xB8

# 格式编号 → (名称, 每像素字节数)。0x1F：解码 decoration00_ID.tex 等 UI 图集，画面正确。
FORMATS: dict[int, tuple[str, float]] = {
    0x1F: ("BC7", 1.0),
}


class TexError(ValueError):
    pass


@dataclass(frozen=True)
class TexHeader:
    version: int
    mips: int
    width: int
    height: int
    depth: int
    format: int
    offsets: tuple[int, ...]


def read_header(data: bytes) -> TexHeader:
    if data[:4] != MAGIC:
        raise TexError(f"不是 .tex 文件（magic={data[:4]!r}）")
    if len(data) < HEADER_SIZE:
        raise TexError("文件头不完整")
    (version,) = struct.unpack_from("<I", data, 0x04)
    mips, width, height, depth, fmt = struct.unpack_from("<5I", data, 0x14)
    if not 1 <= mips <= 16:
        raise TexError(f"mip 数异常：{mips}")
    offsets = struct.unpack_from(f"<{mips}Q", data, HEADER_SIZE)
    return TexHeader(version, mips, width, height, depth, fmt, offsets)


def decode(data: bytes) -> tuple[TexHeader, bytes]:
    """返回 (头部, 最高分辨率 mip 的 RGBA 像素)。"""
    head = read_header(data)
    if head.format not in FORMATS:
        raise TexError(f"未核实的像素格式 {head.format:#x}（{head.width}×{head.height}）")
    name, bpp = FORMATS[head.format]
    size = int(head.width * head.height * bpp)
    start = head.offsets[0]
    if start + size > len(data):
        raise TexError(f"数据越界：偏移 {start:#x} + {size} > {len(data)}")
    raw = data[start : start + size]
    if name == "BC7":
        bgra = texture2ddecoder.decode_bc7(raw, head.width, head.height)
    else:  # pragma: no cover - FORMATS 里只有已实现的格式
        raise TexError(name)
    return head, _bgra_to_rgba(bgra)


def _bgra_to_rgba(px: bytes) -> bytes:
    out = bytearray(px)
    out[0::4], out[2::4] = px[2::4], px[0::4]
    return bytes(out)
