import struct
from pathlib import Path

import pytest
from PIL import Image

from mhdb.config import REPO
from mhdb.formats.tex import HEADER_SIZE, TexError, decode, read_header
from mhdb.images.atlas import grid_cell, tint


def make_tex(width: int, height: int, fmt: int, payload: bytes) -> bytes:
    head = bytearray(HEADER_SIZE)
    head[:4] = b"TEX\0"
    struct.pack_into("<I", head, 0x04, 0x10)
    struct.pack_into("<5I", head, 0x14, 1, width, height, 1, fmt)
    return bytes(head) + struct.pack("<Q", HEADER_SIZE + 8) + payload


def test_header_fields() -> None:
    h = read_header(make_tex(8, 4, 0x1F, bytes(32)))
    assert (h.version, h.mips, h.width, h.height, h.depth, h.format) == (0x10, 1, 8, 4, 1, 0x1F)
    assert h.offsets == (HEADER_SIZE + 8,)


def test_bad_magic() -> None:
    with pytest.raises(TexError, match="不是 .tex"):
        read_header(b"DDS " + bytes(HEADER_SIZE))


def test_unverified_format_is_rejected() -> None:
    with pytest.raises(TexError, match="未核实"):
        decode(make_tex(4, 4, 0x13, bytes(8)))


def test_truncated_data() -> None:
    with pytest.raises(TexError, match="越界"):
        decode(make_tex(8, 8, 0x1F, bytes(16)))


def test_bc7_decodes_to_rgba_size() -> None:
    # 全零 BC7 块是保留模式，解码为全透明黑
    head, px = decode(make_tex(8, 4, 0x1F, bytes(32)))
    assert len(px) == head.width * head.height * 4
    assert set(px) == {0}


def test_grid_cell_and_tint() -> None:
    atlas = Image.new("RGBA", (128, 64), (0, 0, 0, 0))
    atlas.paste((255, 255, 255, 255), (64, 0, 128, 64))
    cell = grid_cell(atlas, 1)
    assert cell.getpixel((10, 10)) == (255, 255, 255, 255)
    assert tint(cell, (200, 100, 50)).getpixel((10, 10)) == (200, 100, 50, 255)
    with pytest.raises(IndexError):
        grid_cell(atlas, 2)


SAMPLE = REPO / "data-raw/peek/ui/common/tex/decoration00_ID.tex"


@pytest.mark.game
@pytest.mark.skipif(not SAMPLE.is_file(), reason="需要本地解包的 UI 贴图")
def test_real_ui_atlas() -> None:
    head, px = decode(Path(SAMPLE).read_bytes())
    assert (head.width, head.height, head.format) == (512, 512, 0x1F)
    img = Image.frombytes("RGBA", (head.width, head.height), px)
    assert img.getchannel("A").getbbox() is not None
