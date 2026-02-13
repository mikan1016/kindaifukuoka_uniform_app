from PIL import Image
import os

def remove_white_background(image_path):
    try:
        img = Image.open(image_path).convert("RGBA")
        datas = img.getdata()

        new_data = []
        for item in datas:
            # Check if pixel is white (adjust threshold as needed)
            if item[0] > 200 and item[1] > 200 and item[2] > 200:
                new_data.append((255, 255, 255, 0))  # Fully transparent
            else:
                new_data.append(item)

        img.putdata(new_data)
        img.save(image_path, "PNG")
        print(f"Processed: {image_path}")
    except Exception as e:
        print(f"Error processing {image_path}: {e}")

assets_dir = "assets"
if os.path.exists(assets_dir):
    for filename in os.listdir(assets_dir):
        if filename.endswith(".png"):
            remove_white_background(os.path.join(assets_dir, filename))
else:
    print("Assets directory not found.")
