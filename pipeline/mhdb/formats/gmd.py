"""GMD 文本表（MT Framework，版本 0x10302）。

布局（对照本机 3133 个 gmd 文件核实）：
  0x00  magic "GMD\\0"
  0x04  u32 版本 0x10302
  0x08  u32 语言编号
  0x0C  u64 保留（0）
  0x14  u32 键数、u32 字符串数、u32 键区字节数、u32 字符串区字节数
  0x24  u32 文件名长度，随后是文件名与一个 \\0
        键信息 × 键数（每条 32 字节：u32 字符串序号、i32 哈希、i32 哈希、u32 填充、u64 键偏移、u64 桶序号）
        有键时随后 256 × u64 哈希桶
        键区（\\0 分隔）、字符串区（\\0 分隔）

177 个文件的字符串数多于键数（有不带键的字符串），因此以「字符串序号」为主索引，键只作附注。
"""

import re
import struct
from dataclasses import dataclass

MAGIC = b"GMD\0"
INFO = struct.Struct("<IiiIQQ")


class GmdError(ValueError):
    pass


@dataclass(frozen=True)
class Gmd:
    name: str
    language: int
    strings: list[str]
    keys: dict[int, str]  # 字符串序号 → 键名

    def get(self, index: int) -> str | None:
        return self.strings[index] if 0 <= index < len(self.strings) else None


def parse(data: bytes) -> Gmd:
    if data[:4] != MAGIC:
        raise GmdError(f"不是 GMD 文件（magic={data[:4]!r}）")
    (version, language) = struct.unpack_from("<II", data, 4)
    if version != 0x10302:
        raise GmdError(f"未核实的 GMD 版本 {version:#x}")
    key_count, string_count, key_size, string_size, name_len = struct.unpack_from("<5I", data, 0x14)
    pos = 0x28
    name = data[pos : pos + name_len].decode("utf-8")
    pos += name_len + 1
    infos = [INFO.unpack_from(data, pos + i * INFO.size) for i in range(key_count)]
    pos += key_count * INFO.size
    if key_count:
        pos += 256 * 8
    key_block = data[pos : pos + key_size]
    pos += key_size
    string_block = data[pos : pos + string_size]
    if pos + string_size != len(data):
        raise GmdError(f"{name}: 区块大小与文件长度不符（{pos + string_size} ≠ {len(data)}）")

    strings = [s.decode("utf-8") for s in string_block.split(b"\0")[:string_count]]
    if len(strings) != string_count:
        raise GmdError(f"{name}: 字符串数 {len(strings)} ≠ {string_count}")
    keys: dict[int, str] = {}
    for string_index, _h2, _h3, _pad, key_offset, _bucket in infos:
        end = key_block.index(b"\0", key_offset)
        keys[string_index] = key_block[key_offset:end].decode("utf-8")
    return Gmd(name, language, strings, keys)


# ---------- 富文本 ----------

_STYLE = re.compile(r"<STYL (MOJI_[A-Z_]+)>(.*?)</STYL>", re.S)
_ICON = re.compile(r"<ICON ([A-Z_0-9]+)>")
_GREEK = {"ALPHA": "α", "BETA": "β", "GAMMA": "γ"}
PLACEHOLDERS = {"Unavailable", "Invalid Message", "--------"}


def clean(text: str) -> str:
    """转成站内纯文本：去掉样式标签，希腊字母图标转成字符，统一换行。"""
    text = text.replace("\r\n", "\n")
    text = _STYLE.sub(lambda m: m.group(2), text)
    text = _ICON.sub(lambda m: _GREEK.get(m.group(1), ""), text)
    return text.strip()


def to_markup(text: str) -> str:
    """保留强调色的轻量标记：<STYL MOJI_RED_DEFAULT>x</STYL> → [red]x[/red]。"""
    text = text.replace("\r\n", "\n")
    text = _STYLE.sub(lambda m: f"[{m.group(1)[5:].split('_')[0].lower()}]{m.group(2)}[/]", text)
    text = _ICON.sub(lambda m: _GREEK.get(m.group(1), ""), text)
    return text.strip()


def is_placeholder(text: str | None) -> bool:
    return text is None or text.strip() in PLACEHOLDERS or text.strip() == ""
