// Self-check for the SSRF guard in image-copy. Run: npm run test:image-copy
import assert from "node:assert/strict";
import http from "node:http";
import { fetchImage, isPrivateAddress } from "../src/modules/superadmin/data-extraction/lib/image-copy.js";

for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"]) {
  assert.equal(isPrivateAddress(a), true, a);
}
for (const a of ["8.8.8.8", "103.69.124.10", "2606:4700:4700::1111"]) {
  assert.equal(isPrivateAddress(a), false, a);
}
// The connection itself refuses internal hosts — by name (resolved inside the lookup) and by IP literal.
const server = http.createServer((_, res) => { res.writeHead(200, { "content-type": "image/png" }); res.end(Buffer.alloc(10)); });
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address() as { port: number };
assert.equal(await fetchImage(new URL(`http://localhost:${port}/x.png`), 1024), null, "localhost by name");
assert.equal(await fetchImage(new URL(`http://127.0.0.1:${port}/x.png`), 1024), null, "127.0.0.1 literal");
server.close();
console.log("image-copy: ok");
