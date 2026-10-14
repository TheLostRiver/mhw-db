import struct

import pytest

from mhdb.formats.table import MAGIC, TableError, read_table, spec

DEMO = spec("demo", "id:I level:B bonus:h")


def make(rows: list[tuple[int, int, int]], magic: int = MAGIC) -> bytes:
    return struct.pack("<IHI", magic, 0x42, len(rows)) + b"".join(struct.pack("<IBh", *r) for r in rows)


def test_reads_rows() -> None:
    t = read_table(make([(1, 2, -3), (7, 1, 5)]), DEMO)
    assert t.version == 0x42
    assert t.rows == [{"id": 1, "level": 2, "bonus": -3}, {"id": 7, "level": 1, "bonus": 5}]


def test_size_mismatch_fails() -> None:
    with pytest.raises(TableError, match="结构定义与文件不符"):
        read_table(make([(1, 2, 3)]) + b"\0", DEMO)


def test_bad_magic_fails() -> None:
    with pytest.raises(TableError, match="magic"):
        read_table(make([(1, 2, 3)], magic=0x1234), DEMO)


def test_spec_layout() -> None:
    assert DEMO.fmt == "<IBh"
    assert DEMO.size == 7
    with pytest.raises(ValueError):
        spec("bad", "x:")
