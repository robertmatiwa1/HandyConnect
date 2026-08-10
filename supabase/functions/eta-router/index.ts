import { createClient } from "@supabase/supabase-js";

type Incoming={channel?:"whatsapp"|"test"|"admin";external_user_id?:string;message?:string};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});
function key(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const p=JSON.parse(raw);if(typeof p.default==="string"&&p.default)return p.default}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const k=key();if(!k||req.headers.get("apikey")!==k)return json({error:"unauthorized"},401);
 let input:Incoming;try{input=await req.json()}catch{return json({error:"invalid_json"},400)}
 const phone=input.external_user_id?.trim(),message=input.message?.trim();if(!phone||!message)return json({handled:false});
 if(!message.startsWith("ETA:"))return json({handled:false});
 const [,jobId,minsRaw]=message.split(":");const mins=Number(minsRaw);
 if(!jobId||![30,60,120,240,480,1440].includes(mins))return json({handled:true,ok:false,reply:"That arrival option is no longer valid. Open My jobs and try again."});
 const s=createClient(Deno.env.get("SUPABASE_URL")??"",k,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const r=await s.rpc("set_assignment_eta",{p_job_id:jobId,p_handyman_phone:phone,p_minutes:mins});
 if(r.error){console.error(r.error);return json({handled:true,ok:false,reply:"I couldn't update the arrival time right now. Please try again."});}
 if(!r.data?.ok)return json({handled:true,ok:false,reply:"That job is no longer available for arrival scheduling."});
 return json({handled:true,ok:true,reply:r.data.message,ui:{type:"buttons",body:"What next?",buttons:[{id:"H_JOBS",title:"My jobs"},{id:"HANDYMAN_HOME",title:"Dashboard"}]}});
});
