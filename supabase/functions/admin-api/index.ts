import { createClient } from "@supabase/supabase-js";

const PASSWORD_HASH="1ecebee07403f6e3b9ee6e73f7202767f8a86856a115a072e7e9e74729e24ab3";
const enc=new TextEncoder();
const ORIGIN="https://robertmatiwa1.github.io";
function serviceKey(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const p=JSON.parse(raw);if(typeof p.default==="string"&&p.default)return p.default}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
async function hexSha256(s:string){return [...new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s)))].map(b=>b.toString(16).padStart(2,"0")).join("")}
function headers(){return{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":ORIGIN,"access-control-allow-headers":"content-type,x-admin-password","access-control-allow-methods":"POST,OPTIONS","vary":"Origin"}}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:headers()});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers()});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const origin=req.headers.get("origin")??"";if(origin&&origin!==ORIGIN)return json({error:"origin_not_allowed"},403);
 const pw=req.headers.get("x-admin-password")??"";if(!pw||await hexSha256(pw)!==PASSWORD_HASH)return json({error:"unauthorized"},401);
 const key=serviceKey(),url=Deno.env.get("SUPABASE_URL")??"";if(!key||!url)return json({error:"service_unavailable"},503);
 let input:any={};try{input=await req.json()}catch{return json({error:"invalid_json"},400)}
 if(input.action==="ping")return json({ok:true});
 const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 try{
  const action=String(input?.action??"summary");
  if(action==="summary"){
   const now=new Date().toISOString();
   const Q=await Promise.all([
    s.from("jobs").select("id",{count:"exact",head:true}),
    s.from("jobs").select("id",{count:"exact",head:true}).in("status",["open","matching"]),
    s.from("jobs").select("id",{count:"exact",head:true}).in("status",["assigned","in_progress"]),
    s.from("handymen").select("id",{count:"exact",head:true}),
    s.from("handymen").select("id",{count:"exact",head:true}).eq("availability_status","available").gt("available_until",now),
    s.from("user_reports").select("id",{count:"exact",head:true}).in("status",["open","reviewing"]),
    s.from("jobs").select("id,description,suburb,city,status,created_at,customers(full_name,phone),skills(name)").order("created_at",{ascending:false}).limit(50),
    s.from("handymen").select("id,full_name,phone,status,availability_status,verification_status,average_rating,completed_jobs,created_at").order("created_at",{ascending:false}).limit(100),
    s.from("user_reports").select("id,job_id,reporter_phone,reason,details,status,created_at,jobs(description)").in("status",["open","reviewing"]).order("created_at",{ascending:false}).limit(50),
    s.from("payments").select("id,purpose,amount_cents,currency,provider,status,created_at,handymen(full_name,phone)").order("created_at",{ascending:false}).limit(50),
    s.from("notification_outbox").select("id,recipient_phone,kind,status,attempts,last_error,created_at").order("created_at",{ascending:false}).limit(75)
   ]);
   for(const q of Q)if(q.error)throw q.error;
   const [jc,se,ac,hc,av,or,jobs,handymen,reports,payments,notifications]=Q;
   return json({ok:true,stats:{jobs:jc.count??0,searching:se.count??0,active_jobs:ac.count??0,handymen:hc.count??0,available:av.count??0,open_reports:or.count??0},jobs:(jobs.data??[]).map((j:any)=>({...j,customer_name:j.customers?.full_name,customer_phone:j.customers?.phone,skill:j.skills?.name})),handymen:handymen.data??[],reports:(reports.data??[]).map((r:any)=>({...r,job_description:r.jobs?.description})),payments:(payments.data??[]).map((p:any)=>({...p,handyman_name:p.handymen?.full_name,handyman_phone:p.handymen?.phone})),notifications:notifications.data??[]});
  }
  const id=String(input?.id??"");if(!id)return json({error:"id_required"},400);
  if(action==="verify"){const q=await s.from("handymen").update({verification_status:"verified",verified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);if(q.error)throw q.error;return json({ok:true})}
  if(action==="suspend"){const q=await s.from("handymen").update({status:"suspended",availability_status:"offline",available_until:null,updated_at:new Date().toISOString()}).eq("id",id);if(q.error)throw q.error;return json({ok:true})}
  if(action==="activate"){const q=await s.from("handymen").update({status:"active",updated_at:new Date().toISOString()}).eq("id",id);if(q.error)throw q.error;return json({ok:true})}
  if(action==="resolve_report"||action==="dismiss_report"){const q=await s.rpc("resolve_user_report",{p_report_id:id,p_status:action==="resolve_report"?"resolved":"dismissed",p_resolution_notes:"Updated from operations dashboard",p_resolved_by:"dashboard"});if(q.error)throw q.error;return json({ok:true})}
  return json({error:"unknown_action"},400);
 }catch(e){console.error(e);return json({error:"admin_api_failed"},500)}
});
