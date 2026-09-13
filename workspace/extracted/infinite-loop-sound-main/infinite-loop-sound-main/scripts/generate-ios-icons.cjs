const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const svgPath = "public/app-icons/default.svg";
if (!fs.existsSync(svgPath)) throw new Error(`Missing ${svgPath}`);
const iconSetDir = "ios/App/App/Assets.xcassets/AppIcon.appiconset";
fs.mkdirSync(iconSetDir, { recursive: true });
const svgBuffer = fs.readFileSync(svgPath);
const icons = [20, 29, 40, 60, 76, 80, 87, 120, 152, 167, 180, 1024];
const contents = { images: [], info: { version: 1, author: "xcode" } };
(async () => {
  for (const size of icons) {
    const filename = `icon-${size}.png`;
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(iconSetDir, filename));
    contents.images.push({
      idiom: "universal",
      size: `${size}x${size}`,
      filename,
      platform: "ios",
    });
  }
  fs.writeFileSync(path.join(iconSetDir, "Contents.json"), JSON.stringify(contents, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
