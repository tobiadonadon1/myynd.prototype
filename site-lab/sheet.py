import sys, os
from PIL import Image, ImageDraw
d, out, order = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
ims = [Image.open(os.path.join(d, n + '.png')) for n in order]
w, h = ims[0].size
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 6
rows = (len(ims) + cols - 1) // cols
pad = 10
sheet = Image.new('RGB', (cols * (w + pad) + pad, rows * (h + pad + 24) + pad), (40, 40, 40))
dr = ImageDraw.Draw(sheet)
for i, (im, n) in enumerate(zip(ims, order)):
    x = pad + (i % cols) * (w + pad); y = pad + (i // cols) * (h + pad + 24)
    sheet.paste(im, (x, y + 24)); dr.text((x + 4, y + 4), n, fill=(255, 255, 255))
sheet.save(out)
print(out, sheet.size)
