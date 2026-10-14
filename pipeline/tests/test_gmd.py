import struct

import pytest

from mhdb.formats.gmd import GmdError, clean, is_placeholder, parse, to_markup


def make_gmd(strings: list[str], keys: list[tuple[int, str]], name: str = "test") -> bytes:
    """按核实过的布局构造 GMD：keys 为 (字符串序号, 键名)。"""
    key_block = b"".join(k.encode() + b"\0" for _, k in keys)
    string_block = b"".join(s.encode() + b"\0" for s in strings)
    head = b"GMD\0" + struct.pack("<II", 0x10302, 8) + struct.pack("<Q", 0)
    head += struct.pack("<5I", len(keys), len(strings), len(key_block), len(string_block), len(name))
    head += name.encode() + b"\0"
    infos, off = b"", 0
    for idx, k in keys:
        infos += struct.pack("<IiiIQQ", idx, 0, 0, 0xCDCDCDCD, off, 0)
        off += len(k) + 1
    buckets = bytes(256 * 8) if keys else b""
    return head + infos + buckets + key_block + string_block


def test_parse_strings_and_keys() -> None:
    g = parse(make_gmd(["药草", "回复少量体力。"], [(0, "HERB_NAME"), (1, "HERB_EXP")], name="item"))
    assert g.name == "item"
    assert g.language == 8
    assert g.strings == ["药草", "回复少量体力。"]
    assert g.keys == {0: "HERB_NAME", 1: "HERB_EXP"}
    assert g.get(1) == "回复少量体力。"
    assert g.get(5) is None


def test_more_strings_than_keys() -> None:
    g = parse(make_gmd(["a", "b", "c"], [(2, "ONLY_C")]))
    assert g.strings == ["a", "b", "c"]
    assert g.keys == {2: "ONLY_C"}


def test_no_keys() -> None:
    g = parse(make_gmd(["x"], []))
    assert g.strings == ["x"] and g.keys == {}


def test_rejects_bad_magic_and_version() -> None:
    with pytest.raises(GmdError, match="不是 GMD"):
        parse(b"XXXX" + bytes(64))
    data = bytearray(make_gmd(["x"], []))
    struct.pack_into("<I", data, 4, 0x10301)
    with pytest.raises(GmdError, match="版本"):
        parse(bytes(data))


def test_rejects_trailing_garbage() -> None:
    with pytest.raises(GmdError, match="长度"):
        parse(make_gmd(["x"], []) + b"\0\0")


def test_clean_and_markup() -> None:
    raw = "会心率＋5％\r\n<STYL MOJI_YELLOW_DEFAULT>（不与其他效果重复）</STYL>"
    assert clean(raw) == "会心率＋5％\n（不与其他效果重复）"
    assert to_markup(raw) == "会心率＋5％\n[yellow]（不与其他效果重复）[/]"
    assert clean("Dragonhide<ICON ALPHA>+") == "Dragonhideα+"


def test_placeholders() -> None:
    assert is_placeholder("Unavailable")
    assert is_placeholder("--------")
    assert is_placeholder("")
    assert is_placeholder(None)
    assert not is_placeholder("攻击")
