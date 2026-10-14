"""MHW:I chunkG*.bin 读取。

改写自用户自己的 mhwi-ai/tools/mhw_chunk.py（其解包逻辑移植自 MHWNoChunk（MIT）与 WorldChunkTool）：
  - chunk 由若干 0x40000 字节的子块组成，每块 Oodle 压缩 + 16 字节循环 XOR 加密
  - 子块解密后顺序拼接为 PKG 虚拟流，文件表在流开头
  - 多个 chunkGN.bin 按 N 升序合并，编号大的覆盖编号小的同名文件

依赖两个不入库的本地文件：oo2core_8_win64.dll（RAD 专有库）与 chunk.key（子块 → 密钥序号表，来自 MHWNoChunk）。
"""

import ctypes
import re
import struct
from collections import OrderedDict
from pathlib import Path

MAGIC_CHUNK = 0x00504D43
SUBCHUNK_SIZE = 0x40000

# 16 组 XOR 密钥，顺序与 MHWNoChunk / WorldChunkTool 一致
CHUNK_KEYS = [
    bytes.fromhex(h)
    for h in (
        "ac76cb97ec7500133a81038e7a82c80a",
        "6bb5c956e44d00bc305233cfbfaafa25",
        "8f021dccb0f2787206fbdee2390bbb5c",
        "da5c1e531d8359157875bd63bfaafa25",
        "1f6d31c883dd716d7e8f598ce23f1929",
        "4bb0de04e4e0856980ccb2942f9ce9f9",
        "8bce54dc4c11139a7875bd63bfaafa25",
        "ec13345966ce7312440089a2ceddcee9",
        "e4662c709c753a039a2c0f5ae23f1929",
        "a492fc9033949c15a033ac223735cca7",
        "25099c1f911a26e5ce9172f07a82c80a",
        "d1d29d7446d4fdf1a033ac223735cca7",
        "7eb268373b5d361ed6d313e2933c4dcb",
        "a1c7d2ea661895ac7875bd63bfaafa25",
        "82a43b2108797c6a440089a2ceddcee9",
        "41d055b3dd6015167e8f598ce23f1929",
    )
]


class KeyPattern:
    """chunk.key：int32 起始序号、int32 结束序号，随后每个子块一个字节的密钥序号。"""

    def __init__(self, data: bytes):
        start, end = struct.unpack_from("<ii", data, 0)
        self.base = start - 1
        self.pattern = data[8 : 8 + (end - start + 1)]
        # 每把密钥重复到整块长度，转成大整数，用一次异或代替逐字节循环
        self._tables = [int.from_bytes(k * (SUBCHUNK_SIZE // 16), "little") for k in CHUNK_KEYS]

    @classmethod
    def load(cls, path: Path) -> "KeyPattern":
        return cls(Path(path).read_bytes())

    def key_index(self, subchunk: int) -> int:
        pos = self.pattern[subchunk - self.base]
        return pos if pos <= 0xF else 0

    def decrypt(self, data: bytes, subchunk: int) -> bytes:
        table = self._tables[self.key_index(subchunk)]
        n = len(data)
        if n != SUBCHUNK_SIZE:
            table &= (1 << (8 * n)) - 1
        return (int.from_bytes(data, "little") ^ table).to_bytes(n, "little")


class Oodle:
    def __init__(self, dll: Path):
        if not Path(dll).is_file():
            raise FileNotFoundError(f"找不到 Oodle 库：{dll}（在 pipeline/local.toml 的 [oodle] dll 配置）")
        lib = ctypes.CDLL(str(dll))
        fn = lib.OodleLZ_Decompress
        fn.restype = ctypes.c_int
        fn.argtypes = (
            [ctypes.c_char_p, ctypes.c_longlong, ctypes.c_char_p, ctypes.c_longlong]
            + [ctypes.c_uint] * 3
            + [ctypes.c_ulonglong]
            + [ctypes.c_uint] * 6
        )
        self._fn = fn

    def decompress(self, src: bytes, out_size: int) -> bytes:
        out = ctypes.create_string_buffer(out_size)
        n = self._fn(src, len(src), out, out_size, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3)
        if n <= 0 or n > out_size:
            raise OSError("Oodle 解压失败")
        return out.raw[:n]


def parse_subchunk_table(meta: bytes, count: int) -> list[tuple[int, int]]:
    """子块表：每项 8 字节，前 3 字节编码压缩后大小（0 = 未压缩），后 5 字节是文件内偏移。"""
    entries = []
    for i in range(count):
        raw = bytearray(meta[i * 8 : i * 8 + 3])
        raw[0] >>= 4
        size = int.from_bytes(raw, "little")
        size = (size >> 4) + (size & 0xF)
        offset = int.from_bytes(meta[i * 8 + 3 : i * 8 + 8], "little")
        entries.append((offset, size))
    return entries


class ChunkFile:
    """单个 chunkGN.bin：子块表 + 按虚拟偏移读取（带 LRU 子块缓存）。"""

    def __init__(self, path: Path, oodle: Oodle, keys: KeyPattern, cache_size: int = 64):
        self.path = Path(path)
        self.oodle = oodle
        self.keys = keys
        self.fh = open(self.path, "rb")  # noqa: SIM115 - 生命周期跟随对象，close() 释放
        magic, count = struct.unpack("<II", self.fh.read(8))
        if magic != MAGIC_CHUNK:
            raise ValueError(f"{self.path.name} 不是 chunk 文件")
        self.entries = parse_subchunk_table(self.fh.read(8 * count), count)
        self._cache: OrderedDict[int, bytes] = OrderedDict()
        self._cache_size = cache_size

    def close(self) -> None:
        self.fh.close()

    def subchunk(self, index: int) -> bytes:
        hit = self._cache.get(index)
        if hit is not None:
            self._cache.move_to_end(index)
            return hit
        offset, size = self.entries[index]
        self.fh.seek(offset)
        if size == 0:
            data = self.fh.read(SUBCHUNK_SIZE)
        else:
            data = self.oodle.decompress(self.fh.read(size), SUBCHUNK_SIZE)
        data = self.keys.decrypt(data, index)
        self._cache[index] = data
        if len(self._cache) > self._cache_size:
            self._cache.popitem(last=False)
        return data

    def read(self, offset: int, size: int) -> bytes:
        out = bytearray()
        while size > 0:
            idx, ptr = divmod(offset, SUBCHUNK_SIZE)
            block = self.subchunk(idx)
            take = min(size, len(block) - ptr)
            if take <= 0:
                raise OSError(f"读取越界 @0x{offset:X}")
            out += block[ptr : ptr + take]
            offset += take
            size -= take
        return bytes(out)

    def toc(self) -> dict[str, tuple[int, int]]:
        """返回 {路径: (大小, 偏移)}，路径用 / 分隔、以 / 开头。"""
        parent_count, _child_total = struct.unpack("<ii", self.read(0x0C, 8))
        ptr = 0x100
        files: dict[str, tuple[int, int]] = {}
        for _ in range(parent_count):
            # 父条目：name[0x3C] size:i64 offset:i64 type:i32 children:i32
            parent = self.read(ptr, 0x54)
            ptr += 0x54
            children = struct.unpack_from("<i", parent, 0x50)[0]
            body = self.read(ptr, 0xB8 * children)
            ptr += 0xB8 * children
            # 子条目：name[0xA0] size:i64 offset:i64 type:i32 unk:i32；type 2 的名字只有 0x50
            for j in range(children):
                e = body[j * 0xB8 : (j + 1) * 0xB8]
                size, offset, etype = struct.unpack_from("<qqi", e, 0xA0)
                name_len = 0x50 if etype == 2 else 0xA0
                name = e[:name_len].split(b"\0", 1)[0].decode("ascii", "replace")
                if etype in (0, 2):
                    files[name.replace("\\", "/")] = (size, offset)
        return files


def chunk_paths(game_dir: Path) -> list[Path]:
    paths = list(Path(game_dir, "chunk").glob("chunkG*.bin"))
    return sorted(paths, key=lambda p: int(re.sub(r"\D", "", p.stem)))
