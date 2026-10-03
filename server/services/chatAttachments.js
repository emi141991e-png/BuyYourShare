import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {P2pError} from './p2pSubscription.js';
const directory=()=>path.join(process.env.DATA_DIR|| (process.env.DATABASE_PATH?path.dirname(process.env.DATABASE_PATH):fileURLToPath(new URL('../data/',import.meta.url))), 'private-chat-attachments');
export function validateAttachment(input){
 if(!input||typeof input.data!=='string'||input.data.length>2800000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.data))throw new P2pError('Allega una foto JPEG valida, massimo 2 MB.',400);
 const bytes=Buffer.from(input.data.split(',')[1],'base64');
 if(bytes.length>2*1024*1024||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new P2pError('La foto non è valida o supera 2 MB.',400);
 return bytes;
}
export async function saveAttachment(input){const bytes=validateAttachment(input);const id=randomUUID();await fs.mkdir(directory(),{recursive:true});await fs.writeFile(path.join(directory(),id+'.jpg'),bytes,{flag:'wx',mode:0o600});return {id,mime:'image/jpeg',size:bytes.length};}
export async function removeAttachment(id){await fs.unlink(path.join(directory(),id+'.jpg')).catch(()=>{});}
export async function readAttachment(id){if(!/^[a-f0-9-]{36}$/.test(id))throw new P2pError('Allegato non trovato.',404);try{return 'data:image/jpeg;base64,'+(await fs.readFile(path.join(directory(),id+'.jpg'))).toString('base64');}catch{throw new P2pError('Allegato non disponibile.',404);}}
