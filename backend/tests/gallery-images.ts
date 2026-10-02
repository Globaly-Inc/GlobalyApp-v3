// Self-check for pickGalleryImages. Run: npm run test:gallery-images
import assert from "node:assert/strict";
import { pickGalleryImages } from "../src/modules/superadmin/data-extraction/lib/gallery-images.js";

const md = `
![KU logo](/images/ku-logo.png)
[![Campus](https://ku.edu.np/uploads/campus.jpg)](https://ku.edu.np/about)
![](icons/search.svg)
![Library](uploads/library.webp "Central library")
![Campus again](https://ku.edu.np/uploads/campus.jpg)
![Students](https://cdn.ku.edu.np/students.png?w=1200)
![Graduation](https://ku.edu.np/grad.jpg)
`;
assert.deepEqual(pickGalleryImages(md, "https://ku.edu.np/", "https://ku.edu.np/images/ku-logo.png"), [
  "https://ku.edu.np/uploads/campus.jpg",
  "https://ku.edu.np/uploads/library.webp",
  "https://cdn.ku.edu.np/students.png?w=1200",
]);
assert.deepEqual(pickGalleryImages("no images here", "https://x.com/", null), []);
assert.deepEqual(pickGalleryImages("![a](data:image/png;base64,AAAA)", "https://x.com/", null), []);
console.log("gallery-images: ok");
