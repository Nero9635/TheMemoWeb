"""アプリのアイコン(PNG)を作る。外部ライブラリなしで動く。
使い方: python tools/make_icons.py  → icons/ に 180, 192, 512 px を書き出す
絵: 青の地に白い吹き出し、その中に青いきらめき(✦)
"""
import os
import struct
import zlib

BG = (0x00, 0x60, 0xDF)
FG = (0xFF, 0xFF, 0xFF)


def inside_bubble(x, y):
    # 角の丸い四角
    x0, y0, x1, y1, r = 0.18, 0.20, 0.82, 0.70, 0.17
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    if x0 <= x <= x1 and y0 <= y <= y1 and (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
        return True
    # しっぽ(三角)
    ax, ay, bx, by, qx, qy = 0.30, 0.66, 0.46, 0.68, 0.26, 0.84
    d = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
    a = ((by - qy) * (x - qx) + (qx - bx) * (y - qy)) / d
    b = ((qy - ay) * (x - qx) + (ax - qx) * (y - qy)) / d
    return a >= 0 and b >= 0 and a + b <= 1


def inside_sparkle(x, y):
    # 4つの角を持つ星(アステロイド)
    dx, dy, r = abs(x - 0.5), abs(y - 0.45), 0.17
    return dx ** (2 / 3) + dy ** (2 / 3) <= r ** (2 / 3)


def pixel(x, y):
    if inside_sparkle(x, y):
        return BG
    if inside_bubble(x, y):
        return FG
    return BG


def render(size, ss=4):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = pixel((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size)
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            n = ss * ss
            row += bytes((acc[0] // n, acc[1] // n, acc[2] // n))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for name, size in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
        with open(os.path.join(out, name), "wb") as f:
            f.write(render(size))
        print(name, size)
