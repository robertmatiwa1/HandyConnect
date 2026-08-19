import { createClient } from "@supabase/supabase-js";

type Incoming={channel?:string;external_user_id?:string;external_message_id?:string;message?:string;media?:unknown};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});
function key(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS")??"";try{const p=JSON.parse(raw);if(typeof p.default==="string")return p.default}catch{}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
const resumeWords=new Set(["hi","hello","hey","continue","resume","carry on","carryon","where was i","where was i?","start","back"]);
async function call(url:string,k:string,target:string,input:Incoming,override?:string){const r=await fetch(`${url}/functions/v1/${target}`,{method:"POST",headers:{apikey:k,"content-type":"application/json"},body:JSON.stringify({...input,message:override??input.message})});return new Response(await r.text(),{status:r.status,headers:{"content-type":"application/json; charset=utf-8"}})}
Deno.serve(async req=>{
 if(req.method!=="POST")return json({handled:false},405);
 const k=key(),url=Deno.env.get("SUPABASE_URL")??"";
 if(!k||!url||req.headers.get("apikey")!==k)return json({handled:false},401);
 let input:Incoming;try{input=await req.json()}catch{return json({handled:false},400)}
 const phone=input.external_user_id?.trim()??"";
 const message=input.message?.trim().toLowerCase()??"";
 if(phone&&resumeWords.has(message)){
   const s=createClient(url,k,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const provider=await s.from("handymen").select("verification_status,status").eq("phone",phone).maybeSingle();
   if(provider.error)return json({handled:false,error:"resume_provider_lookup_failed"},500);
   if(provider.data?.status==="active"&&provider.data.verification_status==="unverified"){
     return await call(url,k,"handyman-router",input,"H_SUBMIT_ID");
   }
 }
 return await call(url,k,"resume-router-legacy",input);
});
