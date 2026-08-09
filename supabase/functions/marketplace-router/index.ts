import { createClient } from "@supabase/supabase-js";

type Incoming={channel?:"whatsapp"|"test"|"admin";external_user_id?:string;external_message_id?:string;message?:string};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});
function key(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const p=JSON.parse(raw);if(typeof p.default==="string"&&p.default)return p.default}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
const norm=(s:string)=>s.trim().toLowerCase();
function decorate(body:any){
  if(!body?.ui)return body;
  if(body.ui.type==="list"&&Array.isArray(body.ui.rows)&&body.ui.rows.length<10&&!body.ui.rows.some((r:any)=>r.id==="REPORT")){
    body.ui={...body.ui,rows:[...body.ui.rows,{id:"REPORT",title:"Report a problem",description:"Safety, no-show, payment or work issue"}]};
  }
  return body;
}
async function forward(url:string,k:string,target:string,input:Incoming,withReport=true){
  const r=await fetch(`${url}/functions/v1/${target}`,{method:"POST",headers:{apikey:k,"content-type":"application/json"},body:JSON.stringify(input)});
  const body=await r.json().catch(()=>({error:"invalid_router_response"}));
  return json(withReport?decorate(body):body,r.status);
}
Deno.serve(async(req)=>{if(req.method!=="POST")return json({error:"method_not_allowed"},405);const k=key(),url=Deno.env.get("SUPABASE_URL")??"";if(!k||!url||req.headers.get("apikey")!==k)return json({error:"unauthorized"},401);let input:Incoming;try{input=await req.json()}catch{return json({error:"invalid_json"},400)}const phone=input.external_user_id?.trim(),message=input.message?.trim();if(!phone||!message)return json({error:"missing_input"},400);const s=createClient(url,k,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});try{
 const session=await s.from("conversation_sessions").select("state").eq("channel",input.channel??"whatsapp").eq("external_user_id",phone).maybeSingle();
 const reportFlow=session.data?.state==="report_router_details"||norm(message)==="report"||norm(message)==="report problem"||message==="REPORT"||message.startsWith("REPORT_REASON:");
 if(reportFlow)return forward(url,k,"report-router",input,false);
 const h=await s.from("handymen").select("id").eq("phone",phone).maybeSingle();if(h.error)throw h.error;const c=await s.from("customers").select("id").eq("phone",phone).maybeSingle();if(c.error)throw c.error;const explicitHandyman=message==="HANDYMAN_HOME"||message.startsWith("H_")||message==="MY_JOBS"||message.startsWith("ACCEPT:")||message.startsWith("DECLINE:")||message.startsWith("START:")||message.startsWith("COMPLETE:");if(h.data&&(explicitHandyman||!c.data))return forward(url,k,"handyman-router",input,true);return forward(url,k,"customer-job-router",input,true)}catch(e){console.error(e);return json({error:"router_failed"},500)}});
