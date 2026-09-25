const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';
const MODEL_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/a3ee2fca54baebec351b8fa7786154ffa7555aa6/lama_fp32.onnx';
const EXPECTED_SHA256 = '1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6';
const EXPECTED_SIZE = 208044816;
const STORAGE_CHUNK = 8 * 1024 * 1024;
function store(name){return getStore({name,siteID:BLOBS_SITE_ID,token:process.env.NETLIFY_BLOBS_TOKEN});}
exports.handler=async(event)=>{
  let status;
  try{
    connectLambda(event); const models=store('ai-models'), metaStore=store('ai-model-meta'); status=store('ai-model-setup-status');
    const existing=await metaStore.get('lama-v2',{type:'json'}).catch(()=>null);
    if(existing&&existing.size===EXPECTED_SIZE&&existing.sha256===EXPECTED_SHA256&&existing.totalChunks>0){await status.setJSON('lama',{status:'done',detail:'already-present-chunked',...existing,completedAt:Date.now()});return;}
    await status.setJSON('lama',{status:'downloading',startedAt:Date.now()});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8*60*1000);
    let resp; try{resp=await fetch(MODEL_URL,{signal:controller.signal});}catch(e){clearTimeout(timer);throw new Error('Model download failed or timed out: '+e.message);}
    if(!resp.ok||!resp.body){clearTimeout(timer);throw new Error(`Model fetch failed (${resp.status})`);}
    const hash=crypto.createHash('sha256'); let total=0,part=0,pending=Buffer.alloc(0);
    const writePart=async(buf)=>{await models.set(`lama-v2/chunk-${String(part).padStart(4,'0')}`,buf);part++;await status.setJSON('lama',{status:'downloading',downloadedBytes:total,totalBytes:EXPECTED_SIZE,storedChunks:part,startedAt:Date.now()});};
    try{
      for await(const raw of resp.body){const chunk=Buffer.from(raw);hash.update(chunk);total+=chunk.length;pending=pending.length?Buffer.concat([pending,chunk],pending.length+chunk.length):chunk;
        while(pending.length>=STORAGE_CHUNK){const out=pending.subarray(0,STORAGE_CHUNK);await writePart(out);pending=pending.subarray(STORAGE_CHUNK);}
      }
    }finally{clearTimeout(timer);}
    if(pending.length)await writePart(pending);
    await status.setJSON('lama',{status:'verifying',downloadedBytes:total,totalBytes:EXPECTED_SIZE,storedChunks:part,startedAt:Date.now()});
    if(total!==EXPECTED_SIZE)throw new Error(`Downloaded model size mismatch: expected ${EXPECTED_SIZE}, got ${total}`);
    const digest=hash.digest('hex'); if(digest!==EXPECTED_SHA256)throw new Error(`Downloaded model hash mismatch: ${digest}`);
    const meta={version:2,size:total,sha256:digest,totalChunks:part,chunkSize:STORAGE_CHUNK}; await metaStore.setJSON('lama-v2',meta); await status.setJSON('lama',{status:'done',detail:'downloaded-verified-chunked',...meta,completedAt:Date.now()});
  }catch(err){console.error('setup-inpaint-model-background:',err);if(status)await status.setJSON('lama',{status:'error',error:err.message||String(err),failedAt:Date.now()}).catch(()=>{});}
};
