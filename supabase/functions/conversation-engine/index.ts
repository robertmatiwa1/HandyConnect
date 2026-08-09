import { createClient } from "@supabase/supabase-js";

type Incoming = { channel?: "whatsapp"|"test"|"admin"; external_user_id?: string; external_message_id?: string; message?: string };
type Session = { id:string; channel:string; external_user_id:string; flow:string; state:string; context:Record<string,unknown>; status:string };
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});
function secretKey(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const p=JSON.parse(raw);if(typeof p.default==="string"&&p.default)return p.default}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
const normalize=(text:string)=>text.trim().toLowerCase();
const handyman=(t:string)=>["1","work","handyman","provider","looking for work","i am a handyman"].includes(normalize(t));
const customer=(t:string)=>["2","customer","need help","looking for a handyman","i need a handyman"].includes(normalize(t));
function parseLocation(text:string){const p=text.split(",").map(x=>x.trim()).filter(Boolean);return p.length<2?null:{suburb:p[0],city:p[1],province:p[2]??null}}
async function loadSkills(s:any){const {data,error}=await s.from("skills").select("code,name").eq("active",true).order("name");if(error)throw error;return data??[]}
async function resolveSkills(s:any,text:string){const skills=await loadSkills(s),requested=text.split(",").map(normalize).filter(Boolean),resolved:string[]=[],unknown:string[]=[];for(const item of requested){const m=skills.find((x:any)=>normalize(x.code)===item||normalize(x.name)===item);m?resolved.push(m.code):unknown.push(item)}return{resolved:[...new Set(resolved)],unknown,skills}}
async function save(s:any,x:Session){const {error}=await s.from("conversation_sessions").update({flow:x.flow,state:x.state,context:x.context,status:x.status}).eq("id",x.id);if(error)throw error}
async function log(s:any,id:string,direction:"inbound"|"outbound",body:string,external?:string,payload:Record<string,unknown>={}){const {error}=await s.from("conversation_messages").insert({session_id:id,direction,external_message_id:external??null,body,payload});return error}
async function reply(s:any,x:Session,message:string,extra:Record<string,unknown>={}){await log(s,x.id,"outbound",message,undefined,extra);return json({ok:true,session_id:x.id,flow:x.flow,state:x.state,reply:message,...extra})}

Deno.serve(async(req)=>{
 if(req.method==="GET")return json({service:"conversation-engine",status:"ok"});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const key=secretKey(); if(!key||req.headers.get("apikey")!==key)return json({error:"unauthorized"},401);
 const s=createClient(Deno.env.get("SUPABASE_URL")??"",key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 let input:Incoming;try{input=await req.json()}catch{return json({error:"invalid_json"},400)}
 const channel=input.channel??"test", user=input.external_user_id?.trim(), text=input.message?.trim(); if(!user||!text)return json({error:"external_user_id_and_message_are_required"},400);
 try{
  let {data:session,error}=await s.from("conversation_sessions").select("id,channel,external_user_id,flow,state,context,status").eq("channel",channel).eq("external_user_id",user).maybeSingle();if(error)throw error;
  if(!session){const c=await s.from("conversation_sessions").insert({channel,external_user_id:user}).select("id,channel,external_user_id,flow,state,context,status").single();if(c.error)throw c.error;session=c.data}
  const x=session as Session; const inbound=await log(s,x.id,"inbound",text,input.external_message_id);if(inbound){if(inbound.code==="23505"&&input.external_message_id)return json({ok:true,duplicate:true,session_id:x.id,flow:x.flow,state:x.state});throw inbound}
  if(normalize(text)==="reset"){x.flow="entry";x.state="choose_role";x.context={};x.status="active";await save(s,x);return reply(s,x,"Welcome to HandyConnect. Reply 1 if you're looking for work, or 2 if you're looking for a handyman.")}
  if(x.state==="choose_role"){
   if(handyman(text)){x.flow="handyman_onboarding";x.state="capture_name";await save(s,x);return reply(s,x,"Great. What's your full name?")}
   if(customer(text)){x.flow="customer_job";x.state="capture_job_description";await save(s,x);return reply(s,x,"Tell me what you need done. A short description is enough.")}
   return reply(s,x,"Reply 1 if you're looking for work, or 2 if you're looking for a handyman.")
  }
  if(x.flow==="handyman_onboarding"){
   if(x.state==="capture_name"){if(text.length<2)return reply(s,x,"Please send your full name.");x.context={...x.context,full_name:text};x.state="capture_business";await save(s,x);return reply(s,x,"What's your business name? Reply SKIP if you don't use one.")}
   if(x.state==="capture_business"){x.context={...x.context,business_name:normalize(text)==="skip"?null:text};x.state="capture_skills";await save(s,x);const skills=await loadSkills(s);return reply(s,x,`Which skills do you offer? Send one or more separated by commas:\n${skills.map((k:any)=>k.name).join(", ")}`)}
   if(x.state==="capture_skills"){const r=await resolveSkills(s,text);if(r.unknown.length||!r.resolved.length)return reply(s,x,`I didn't recognise: ${r.unknown.join(", ")||text}. Choose from: ${r.skills.map((k:any)=>k.name).join(", ")}`);x.context={...x.context,skill_codes:r.resolved};x.state="capture_location";await save(s,x);return reply(s,x,"Where do you mainly work? Send: Suburb, City, Province. Example: Bellville, Cape Town, Western Cape")}
   if(x.state==="capture_location"){const loc=parseLocation(text);if(!loc)return reply(s,x,"Please send at least Suburb, City. Example: Bellville, Cape Town");const c=x.context as any;const r=await s.rpc("onboard_handyman",{p_phone:user,p_full_name:c.full_name,p_business_name:c.business_name??null,p_email:null,p_skill_codes:c.skill_codes??[],p_city:loc.city,p_suburb:loc.suburb,p_province:loc.province});if(r.error)throw r.error;x.context={...x.context,...loc,handyman_id:r.data};x.flow="ready";x.state="ready";x.status="completed";await save(s,x);return reply(s,x,"You're ready for work. Your Free membership includes 3 job opportunities per month. Reply RESET any time to start again.",{handyman_id:r.data})}
  }
  if(x.flow==="customer_job"){
   if(x.state==="capture_job_description"){if(text.length<4)return reply(s,x,"Please describe the job in a few words.");x.context={...x.context,job_description:text};x.state="capture_job_skill";await save(s,x);const skills=await loadSkills(s);return reply(s,x,`What kind of work is this? Choose one: ${skills.map((k:any)=>k.name).join(", ")}`)}
   if(x.state==="capture_job_skill"){const r=await resolveSkills(s,text);if(r.unknown.length||r.resolved.length!==1)return reply(s,x,`Choose one skill: ${r.skills.map((k:any)=>k.name).join(", ")}`);x.context={...x.context,skill_code:r.resolved[0]};x.state="capture_job_location";await save(s,x);return reply(s,x,"Where is the job? Send: Suburb, City, Province. Example: Bellville, Cape Town, Western Cape")}
   if(x.state==="capture_job_location"){const loc=parseLocation(text);if(!loc)return reply(s,x,"Please send at least Suburb, City. Example: Bellville, Cape Town");const c=x.context as any,sk=await s.from("skills").select("id").eq("code",c.skill_code).single();if(sk.error)throw sk.error;const cust=await s.from("customers").upsert({phone:user},{onConflict:"phone"}).select("id").single();if(cust.error)throw cust.error;const job=await s.from("jobs").insert({customer_id:cust.data.id,skill_id:sk.data.id,description:c.job_description,suburb:loc.suburb,city:loc.city,province:loc.province,status:"matching"}).select("id").single();if(job.error)throw job.error;const cand=await s.rpc("find_job_candidates",{p_job_id:job.data.id,p_limit:5});if(cand.error)throw cand.error;const rows=cand.data??[];if(rows.length){const m=await s.from("job_matches").insert(rows.map((z:any)=>({job_id:job.data.id,handyman_id:z.handyman_id,match_score:z.score,status:"offered"})));if(m.error)throw m.error}x.context={...x.context,...loc,job_id:job.data.id,candidate_count:rows.length};x.flow="ready";x.state="ready";x.status="completed";await save(s,x);return reply(s,x,rows.length?`Done. I found ${rows.length} suitable handyman${rows.length===1?"":"s"}. The job is ready to be offered.`:"Your job is recorded. I don't have a suitable available handyman yet, so no one has been assigned.",{job_id:job.data.id,candidate_count:rows.length})}
  }
  return reply(s,x,"This conversation is complete. Reply RESET to start a new request.")
 }catch(e){console.error(e);return json({error:"internal_error"},500)}
});
