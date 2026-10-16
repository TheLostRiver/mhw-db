"""部分数据表整文件用 Blowfish/ECB 加密（cus_pa、cus_par、asp、itlot、mib、plp 等）。

MT Framework 按小端 32 位字处理 Blowfish 的分组，所以加解密前后都要逐 4 字节翻转。
密钥是游戏里的常量，按扩展名区分；取值见 Synthlight/MHW-Editor 的 EncryptionKeys.cs（只读作格式文档）。
"""

from cryptography.hazmat.decrepit.ciphers.algorithms import Blowfish
from cryptography.hazmat.primitives.ciphers import Cipher, modes

KEYS = {
    ".cus_pa": b"PCEBFfRCbwIdy6AZIoNA5lXV6FEki0yBEyW4FPXZUyWgeauqY8PYeZkM",
    ".cus_par": b"PCEBFfRCbwIdy6AZIoNA5lXV6FEki0yBEyW4FPXZUyWgeauqY8PYeZkM",
    ".cus_ou": b"PCEBFfRCbwIdy6AZIoNA5lXV6FEki0yBEyW4FPXZUyWgeauqY8PYeZkM",
    ".cus_otr": b"PCEBFfRCbwIdy6AZIoNA5lXV6FEki0yBEyW4FPXZUyWgeauqY8PYeZkM",
    ".asp": b"Nb06gpPJ9WtbO6FF1ZYqm5NbLREsCzuqAY0G25ug2Ei5XkkAtVXD5Uda",
    ".itlot": b"D7N88VEGEnRl0HEHTO0xMQkbeMb37arJF488lREp90WYojAONkLoxfMt",
    ".mib": b"TZNgJfzyD2WKiuV4SglmI6oN5jP2hhRJcBwzUooyfIUTM4ptDYGjuRTP",
    ".plp": b"j1P15gEkgVa7NdFxiqwCPitykHctY2nZPjSaElvqb0eSwcLO1cOlTqqv",
    ".plsp": b"j1P15gEkgVa7NdFxiqwCPitykHctY2nZPjSaElvqb0eSwcLO1cOlTqqv",
    ".dtt_epg": b"sJV4g7d55gKnQB5nS6XJ9pZ1qZmmQwNnSbidUW1OeAhHrpPd6MKbfsrt",
    ".dtt_eda": b"Fqkpg1xx1cMlvg3AtKOCLxFgVFBwHkCbjizBRV49hWmEe5lOAaNOTm7m",
}


def _swap(b: bytes) -> bytes:
    return b"".join(b[i : i + 4][::-1] for i in range(0, len(b), 4))


def decrypt(data: bytes, key: bytes) -> bytes:
    if len(data) % 8:
        raise ValueError(f"密文长度 {len(data)} 不是 8 的倍数")
    c = Cipher(Blowfish(key), modes.ECB()).decryptor()
    return _swap(c.update(_swap(data)) + c.finalize())


def encrypt(data: bytes, key: bytes) -> bytes:
    """只用于测试往返。"""
    c = Cipher(Blowfish(key), modes.ECB()).encryptor()
    return _swap(c.update(_swap(data)) + c.finalize())


def decrypt_file(name: str, data: bytes) -> bytes:
    ext = name[name.rfind(".") :]
    return decrypt(data, KEYS[ext])
