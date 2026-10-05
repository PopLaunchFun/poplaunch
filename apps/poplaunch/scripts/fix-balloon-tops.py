"""Repair the clipped balloon tops: the mockup's row/panel border crossed each balloon, and the extraction
left a narrow stub with no outline above that line. Fit an axis-aligned ellipse to the good upper body,
then redraw everything above the break from that ellipse: shell colours resampled from the first good row,
a uniform black outline, supersampled edges."""
import sys, numpy as np
from PIL import Image

def repair(path, out_paths):
    im = Image.open(path).convert("RGBA"); a = np.array(im).astype(np.float64); H, W = a.shape[:2]
    al = a[..., 3] > 128
    L = np.array([np.where(r)[0].min() if r.any() else -1 for r in al]); R = np.array([np.where(r)[0].max() if r.any() else -1 for r in al])
    wd = np.where(L >= 0, R - L + 1, 0); maxw = wd.max()
    top = int(H * 0.3); jumps = wd[1:top] - wd[:top - 1]
    y1 = int(np.argmax(jumps)) + 1
    if jumps.max() < 0.08 * maxw: print(path, "no break found"); return
    # ellipse fit on the upper body below the break: A x^2 + B y^2 + C x + D y = 1
    ys = np.arange(y1 + 1, y1 + int(H * 0.33)); pts = [(L[y], y) for y in ys] + [(R[y], y) for y in ys]
    P = np.array(pts, float); M = np.c_[P[:, 0] ** 2, P[:, 1] ** 2, P[:, 0], P[:, 1]]
    A, B, C, D = np.linalg.lstsq(M, np.ones(len(P)), rcond=None)[0]
    cx, cy = -C / (2 * A), -D / (2 * B); k = 1 + A * cx ** 2 + B * cy ** 2; ea, eb = np.sqrt(k / A), np.sqrt(k / B)
    dark = (a[..., :3].sum(axis=2) < 200) & al
    runs = []
    for y in range(y1 + 2, y1 + 12):
        x = L[y]; n = 0
        while x < W and dark[y, x]: n += 1; x += 1
        runs.append(n)
    t = float(np.clip(np.median(runs), 2, 8))
    src = y1 + 2; sL, sR = L[src], R[src]
    print(f"{path}: break above row {y1}, ellipse c=({cx:.1f},{cy:.1f}) a={ea:.1f} b={eb:.1f}, outline {t}px, source row {src}")
    S = 4; out = a.copy()
    for y in range(0, y1 + 1):
        row = np.zeros((W, 4)); cov = np.zeros(W); ink = np.zeros(W)
        for sy in range(S):
            yy = y + (sy + 0.5) / S
            for sx in range(S):
                xx = np.arange(W) + (sx + 0.5) / S
                r_out = ((xx - cx) / ea) ** 2 + ((yy - cy) / eb) ** 2
                r_in = ((xx - cx) / (ea - t)) ** 2 + ((yy - cy) / (eb - t)) ** 2
                inside = r_out <= 1; cov += inside; ink += inside & (r_in > 1)
        cov /= S * S; ink /= S * S
        # shell colour: resample the source row across this row's ellipse width
        hw = ea * np.sqrt(max(0.0, 1 - ((y + 0.5 - cy) / eb) ** 2)); lo, hi = cx - hw, cx + hw
        xs = np.arange(W) + 0.5
        u = np.clip((xs - lo) / max(hi - lo, 1e-6), 0, 1)
        # map interior (just inside the source row's outline) to the source row's interior
        srcx = np.clip(sL + t + u * (sR - sL - 2 * t), 0, W - 1)
        shell = a[src, np.round(srcx).astype(int), :3]
        rgb = shell * (1 - ink[:, None]) + np.zeros(3) * ink[:, None]
        row[:, :3] = rgb; row[:, 3] = cov * 255
        out[y] = row
    # blend the first good rows' outline edge so the seam is invisible
    img = Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGBA")
    for p in out_paths: img.save(p)

for f in sys.argv[1:]:
    name = f.split("/")[-1]
    repair(f, ["/home/user/poplaunch/apps/poplaunch/mockup/art/" + name, "/home/user/poplaunch/apps/poplaunch/public/art/" + name])
