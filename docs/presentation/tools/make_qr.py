#!/usr/bin/env python3
"""QR-коды для слайдов: матрицу строит Core Image (tools/qr_gen.swift), здесь — только SVG.

python3 tools/make_qr.py            # вставляет свежие QR в presentation.html между метками
Тёмные модули #09111b на светлой плашке #e6edf5, тихая зона 4 модуля, уровень коррекции M.
"""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
QRS = {
    'pitch': 'https://commit-deploy.vercel.app/?pitch',
    'game': 'https://commit-deploy.vercel.app/',
}
QUIET = 4


def matrix(text):
    out = subprocess.run(['swift', str(ROOT / 'tools' / 'qr_gen.swift'), text, 'M'],
                         check=True, capture_output=True, text=True).stdout.split()
    assert out and all(len(r) == len(out) for r in out), 'матрица не квадратная'
    n = len(out)
    # три поисковых узора 7×7 по углам — проверка, что матрица не перевёрнута
    for r0, c0 in ((0, 0), (0, n - 7), (n - 7, 0)):
        assert out[r0][c0:c0 + 7] == '1111111' and out[r0 + 3][c0:c0 + 7] == '1011101', 'нет поискового узора'
    return out


def svg(text, key):
    rows = matrix(text)
    n = len(rows) + 2 * QUIET
    d = []
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] == '1':
                x0 = x
                while x < len(row) and row[x] == '1':
                    x += 1
                d.append(f'M{x0 + QUIET} {y + QUIET}h{x - x0}v1h{x0 - x}z')
            else:
                x += 1
    return (f'<svg class="qr-svg" viewBox="0 0 {n} {n}" role="img" aria-label="QR: {text}">'
            f'<rect width="{n}" height="{n}" rx="0.8" fill="#e6edf5"/>'
            f'<path fill="#09111b" d="{"".join(d)}"/></svg>'), len(rows)


def main():
    html_path = ROOT / 'presentation.html'
    html = html_path.read_text(encoding='utf-8')
    for key, url in QRS.items():
        markup, size = svg(url, key)
        pat = re.compile(rf'(<!--QR:{key}-->).*?(<!--/QR:{key}-->)', re.S)
        if not pat.search(html):
            sys.exit(f'нет метки <!--QR:{key}--> в presentation.html')
        html = pat.sub(lambda m: m.group(1) + markup + m.group(2), html)
        print(f'{key}: {url} — версия {(size - 17) // 4}, {size}×{size} модулей + тихая зона {QUIET}')
    html_path.write_text(html, encoding='utf-8')


if __name__ == '__main__':
    main()
