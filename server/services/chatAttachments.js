import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {P2pError} from './p2pSubscription.js';
const directory=()=>path.join(process.env.DATA_DIR|| (process.env.DATABASE_PATH?path.dirname(process.env.DATABASE_PATH):fileURLToPath(new URL('../data/',import.meta.url))), 'private-chat-attachments');
export function validateAttachment(input){
 const match=typeof input?.data==='string' && input.data.length<=7000000 && input.data.match(/^data:(image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match)throw new P2pError('Allega una foto oppure un PDF valido (massimo 5 MB).',400);
 const bytes=Buffer.from(match[2],'base64'),pdf=match[1]==='application/pdf';
 const valid=pdf ? bytes.subarray(0,5).toString()==='%PDF-' && bytes.subarray(-1024).includes(Buffer.from('%%EOF')) : bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
 if(!valid||bytes.length>(pdf?5:2)*1024*1024)throw new P2pError('Allegato non valido: foto massimo 2 MB, PDF massimo 5 MB.',400);
 return bytes;
}
const extension=mime=>mime==='application/pdf'?'.pdf':'.jpg';
export async function saveAttachment(input){const bytes=validateAttachment(input),mime=input.data.startsWith('data:application/pdf;')?'application/pdf':'image/jpeg',id=randomUUID();await fs.mkdir(directory(),{recursive:true});await fs.writeFile(path.join(directory(),id+extension(mime)),bytes,{flag:'wx',mode:0o600});return {id,mime,size:bytes.length};}
export async function removeAttachment(id,mime){await fs.unlink(path.join(directory(),id+extension(mime))).catch(()=>{});}
export async function readAttachment(id,mime='image/jpeg'){if(!/^[a-f0-9-]{36}$/.test(id)||!['image/jpeg','application/pdf'].includes(mime))throw new P2pError('Allegato non trovato.',404);try{return 'data:'+mime+';base64,'+(await fs.readFile(path.join(directory(),id+extension(mime)))).toString('base64');}catch{throw new P2pError('Allegato non disponibile. Chiedi al mittente di inviarlo nuovamente.',404);}}
