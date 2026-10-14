import struct

import pytest

from mhdb.build.world_custom import (
    PLP_AUGMENT_OFFSET,
    PLP_CRIT_OFFSET,
    PLP_SIZE,
    PlParamError,
    read_augment_effects,
)
from mhdb.formats import crypto
from mhdb.formats.table import HEADER, MAGIC, TableError, read_table, spec

KEY = b"0123456789abcdef"


def test_roundtrip_with_word_swap() -> None:
    plain = bytes(range(32))
    enc = crypto.encrypt(plain, KEY)
    assert enc != plain
    assert crypto.decrypt(enc, KEY) == plain


def test_rejects_unaligned_length() -> None:
    with pytest.raises(ValueError):
        crypto.decrypt(b"1234567", KEY)


def test_decrypt_file_picks_key_by_extension() -> None:
    plain = HEADER.pack(MAGIC, 1, 0) + b"\0" * 6
    enc = crypto.encrypt(plain, crypto.KEYS[".cus_pa"])
    assert crypto.decrypt_file("common/equip/customParts.cus_pa", enc) == plain


S = spec("t.bin", "a:H b:B")


def _table(rows: list[tuple[int, int]], pad: bytes = b"") -> bytes:
    return HEADER.pack(MAGIC, 1, len(rows)) + b"".join(struct.pack("<HB", *r) for r in rows) + pad


def test_padded_table_allows_zero_tail_only_when_asked() -> None:
    data = _table([(1, 2), (3, 4)], b"\0" * 5)
    assert read_table(data, S, padded=True).rows == [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
    with pytest.raises(TableError):
        read_table(data, S)
    with pytest.raises(TableError):
        read_table(_table([(1, 2)], b"\0\0\1"), S, padded=True)


def _plp(crit: float = 1.25) -> bytearray:
    d = bytearray(PLP_SIZE)
    d[:4] = b"PLP\0"
    struct.pack_into("<ff", d, PLP_CRIT_OFFSET, crit, 0.75)
    o = PLP_AUGMENT_OFFSET + 12 + 32
    d[o : o + 4] = bytes([5, 10, 15, 25])
    return d


def test_augment_effects_layout_is_checked() -> None:
    fx = read_augment_effects(bytes(_plp()))
    assert fx["attack"] == [5, 10, 15, 25]
    assert set(fx["elementMultiplier"]) >= {"great-sword", "light-bowgun"}
    with pytest.raises(PlParamError):
        read_augment_effects(bytes(_plp(crit=1.3)))
    with pytest.raises(PlParamError):
        read_augment_effects(bytes(_plp())[:-4])
