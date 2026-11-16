import {createServer} from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import {join,normalize,resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../app',import.meta.url)));const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg'};
const server=createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1');let pathname=decodeURIComponent(url.pathname);if(pathname.endsWith('/'))pathname+='/index.html';const file=resolve(join(root,normalize(pathname)));if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return}try{const s=statSync(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});createReadStream(file).pipe(res)}catch{res.writeHead(404).end()}});const port=await new Promise(done=>server.listen(0,'127.0.0.1',()=>done(server.address().port)));console.log(`TEST_SERVER http://127.0.0.1:${port}`);process.stdout.write('');
