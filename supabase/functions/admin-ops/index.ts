import { createClient } from "@supabase/supabase-js";

function key(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const p=JSON.parse(raw);if(typeof p.default==="string"&&p.default)return p.default}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});
Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const k=key(),url=Deno.env.get("SUPABASE_URL")??"";if(!k||!url||req.headers.get("apikey")!==k)return json({error:"unauthorized"},401);
 let input:any={};try{input=await req.json()}catch{}
 const s=createClient(url,k,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 try{
  const action=String(input?.action??"summary");
  if(action==="summary"){
   const [health,waiting,reports,available]=await Promise.all([
    s.from("admin_marketplace_health").select("*"),
    s.from("admin_waiting_jobs").select("*").limit(25),
    s.from("admin_open_reports").select("*").limit(25),
    s.from("handymen").select("id,full_name,phone,verification_status,average_rating,completed_jobs,available_until").eq("availability_status","available").gt("available_until",new Date().toISOString()).order("available_until",{ascending:true}).limit(50)
   ]);
   for(const r of [health,waiting,reports,available])if(r.error)throw r.error;
   return json({ok:true,health:health.data??[],waiting_jobs:waiting.data??[],open_reports:reports.data??[],available_handymen:available.data??[]});
  }
  if(action==="resolve_report"){
   const reportId=String(input?.report_id??""),status=String(input?.status??""),notes=String(input?.notes??""),resolvedBy=String(input?.resolved_by??"admin");
   if(!reportId||!["resolved","dismissed"].includes(status))return json({error:"invalid_resolution"},400);
   const r=await s.rpc("resolve_user_report",{p_report_id:reportId,p_status:status,p_resolution_notes:notes,p_resolved_by:resolvedBy});if(r.error)throw r.error;
   return json({ok:true,resolved:r.data===true});
  }
  if(action==="set_verification"){
   const handymanId=String(input?.handyman_id??""),status=String(input?.status??""),notes=String(input?.notes??"");
   if(!handymanId||!["unverified","pending","verified","rejected"].includes(status))return json({error:"invalid_verification"},400);
   const update:any={verification_status:status,verification_notes:notes||null,updated_at:new Date().toISOString()};if(status==="verified")update.verified_at=new Date().toISOString();else if(status!=="verified")update.verified_at=null;
   const r=await s.from("handymen").update(update).eq("id",handymanId).select("id,full_name,verification_status,verified_at").maybeSingle();if(r.error)throw r.error;
   return json({ok:true,handyman:r.data});
  }
  return json({error:"unknown_action"},400);
 }catch(e){console.error(e);return json({error:"admin_ops_failed"},500)}
});
