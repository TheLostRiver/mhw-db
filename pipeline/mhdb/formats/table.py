"""MT Framework 的定长记录表（.itm、.am_dat、.skl_dat、.wp_dat 等）。

文件头：u32 magic、u16 版本（各文件不同）、u32 记录数；随后是紧密排列的定长记录（小端、无对齐）。
记录长度 × 记录数必须恰好等于剩余字节数，否则说明结构定义有误，直接报错，不猜。
"""

import struct
from dataclasses import dataclass

HEADER = struct.Struct("<IHI")
MAGIC = 0x18091001


class TableError(ValueError):
    pass


@dataclass(frozen=True)
class Spec:
    """一种表的结构：字段名与 struct 格式字符（顺序即文件中的顺序）。"""

    name: str
    fields: tuple[tuple[str, str], ...]

    @property
    def fmt(self) -> str:
        return "<" + "".join(f for _, f in self.fields)

    @property
    def size(self) -> int:
        return struct.calcsize(self.fmt)


def spec(name: str, fields: str) -> Spec:
    """用「字段:格式」的空白分隔串定义结构，便于逐行对照文档。"""
    pairs = tuple(tuple(tok.split(":")) for tok in fields.split())
    for n, f in pairs:
        if struct.calcsize("<" + f) == 0 or not n:
            raise ValueError(f"{name}: 无效字段 {n}:{f}")
    return Spec(name, pairs)  # type: ignore[arg-type]


@dataclass(frozen=True)
class Table:
    magic: int
    version: int
    rows: list[dict[str, int]]


def read_table(data: bytes, s: Spec, *, check_magic: bool = True) -> Table:
    if len(data) < HEADER.size:
        raise TableError(f"{s.name}: 文件过短")
    magic, version, count = HEADER.unpack_from(data, 0)
    if check_magic and magic != MAGIC:
        raise TableError(f"{s.name}: magic {magic:#x} 不符")
    body = len(data) - HEADER.size
    if body != count * s.size:
        raise TableError(f"{s.name}: 记录长度 {s.size} × {count} ≠ {body} 字节，结构定义与文件不符")
    names = [n for n, _ in s.fields]
    unpack = struct.Struct(s.fmt).unpack_from
    rows = [dict(zip(names, unpack(data, HEADER.size + i * s.size), strict=True)) for i in range(count)]
    return Table(magic, version, rows)
