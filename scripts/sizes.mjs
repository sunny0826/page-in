import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
const walk = async dir => (await Promise.all((await readdir(dir,{withFileTypes:true})).map(async e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]))).flat();
const frontend = [];
for(const file of await walk('dist')) {
  const bytes = await readFile(file);
  frontend.push({file,bytes:bytes.length,gzipBytes:gzipSync(bytes,{level:9}).length});
}
let appBytes = null;
try { appBytes = (await Promise.all((await walk('src-tauri/target/release/bundle/macos/PageIn.app')).map(async p=>(await stat(p)).size))).reduce((a,b)=>a+b,0); } catch {}
console.log(JSON.stringify({frontend,totalFrontendBytes:frontend.reduce((sum,x)=>sum+x.bytes,0),totalFrontendGzipBytes:frontend.reduce((sum,x)=>sum+x.gzipBytes,0),appBytes},null,2));
