import struct
from pathlib import Path

from mhdb.chunk.extract import select, steam_build_id
from mhdb.chunk.reader import CHUNK_KEYS, SUBCHUNK_SIZE, KeyPattern, parse_subchunk_table


def make_key(pattern: bytes, start: int = 1) -> KeyPattern:
    return KeyPattern(struct.pack("<ii", start, start + len(pattern) - 1) + pattern)


def test_key_index_and_fallback() -> None:
    keys = make_key(bytes([3, 0xFF, 15]))
    assert keys.key_index(0) == 3
    assert keys.key_index(1) == 0  # 超出 0..15 的序号按 0 处理（与 MHWNoChunk 一致）
    assert keys.key_index(2) == 15


def test_decrypt_is_xor_with_repeated_key() -> None:
    keys = make_key(bytes([5]))
    data = bytes(range(40))
    out = keys.decrypt(data, 0)
    expected = bytes(b ^ CHUNK_KEYS[5][i % 16] for i, b in enumerate(data))
    assert out == expected
    assert keys.decrypt(out, 0) == data


def test_full_subchunk_roundtrip() -> None:
    keys = make_key(bytes([7]))
    data = bytes(i & 0xFF for i in range(SUBCHUNK_SIZE))
    assert keys.decrypt(keys.decrypt(data, 0), 0) == data


def test_subchunk_table_encoding() -> None:
    # 大小编码：3 字节小端值 v（首字节先右移 4 位），size = (v >> 4) + (v & 0xF)；偏移为后 5 字节
    def entry(size_field: bytes, offset: int) -> bytes:
        return size_field + offset.to_bytes(5, "little")

    meta = entry(bytes([0x00, 0x00, 0x00]), 0x1234) + entry(bytes([0x50, 0x10, 0x02]), 0xABCDEF)
    table = parse_subchunk_table(meta, 2)
    assert table[0] == (0x1234, 0)
    v = int.from_bytes(bytes([0x05, 0x10, 0x02]), "little")
    assert table[1] == (0xABCDEF, (v >> 4) + (v & 0xF))


def test_select_patterns() -> None:
    paths = [
        "/common/equip/armor.am_dat",
        "/common/text/steam/item_chS.gmd",
        "/common/text/steam/item_ger.gmd",
    ]
    assert select(paths, [r"^/common/text/.*_(chS|eng)\.gmd$"]) == ["/common/text/steam/item_chS.gmd"]
    assert select(paths, [r"\.AM_DAT$"]) == ["/common/equip/armor.am_dat"]


def test_steam_build_id(tmp_path: Path) -> None:
    game = tmp_path / "steamapps" / "common" / "Monster Hunter World"
    game.mkdir(parents=True)
    (tmp_path / "steamapps" / "appmanifest_582010.acf").write_text(
        '"AppState"\n{\n\t"buildid"\t\t"123"\n}', encoding="utf-8"
    )
    assert steam_build_id(game) == "123"
    assert steam_build_id(tmp_path) is None
