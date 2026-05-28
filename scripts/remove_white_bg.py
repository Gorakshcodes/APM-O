from PIL import Image

INPUT = 'public/reliabot-logo.orig.png'
OUTPUT = 'public/reliabot-logo.png'

fuzz = 30  # tolerance for how close to white a pixel must be

img = Image.open(INPUT).convert('RGBA')
px = img.getdata()
new_data = []
for item in px:
    r, g, b, a = item
    if r >= 255 - fuzz and g >= 255 - fuzz and b >= 255 - fuzz:
        new_data.append((255, 255, 255, 0))
    else:
        new_data.append((r, g, b, a))

img.putdata(new_data)
img.save(OUTPUT, 'PNG')
print('saved', OUTPUT)
