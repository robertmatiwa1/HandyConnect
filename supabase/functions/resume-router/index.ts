import { createClient } from "@supabase/supabase-js";

type Incoming={channel?:string;external_user_id?:string;external_message_id?:string;message?:string;media?:unknown};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});
function key(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS")??"";try{const p=JSON.parse(raw);if(typeof p.default==="string")return p.default}catch{}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
const norm=(v:string)=>v.trim().toLowerCase();
const resumeWords=new Set(["hi","hello","hey","continue","resume","carry on","carryon","where was i","where was i?","start","back"]);
async function call(url:string,k:string,target:string,input:Incoming,override?:string){const r=await fetch(`${url}/functions/v1/${target}`,{method:"POST",headers:{apikey:k,"content-type":"application/json"},body:JSON.stringify({...input,message:override??input.message})});return{status:r.status,body:await r.json().catch(()=>({handled:false}))}}
function buttons(body:string,items:{id:string;title:string}[]){return{type:"buttons",body,buttons:items.slice(0,3)}}
function list(body:string,button:string,rows:{id:string;title:string}[]){return{type:"list",body,button,rows}}
function jobResume(state:string){
 if(state==="ji_urgency")return{reply:"Welcome back. Your request is saved. When do you need help?",ui:buttons("When do you need help?",[{id:"JI_URGENT",title:"As soon as possible"},{id:"JI_TODAY",title:"Today"},{id:"JI_FLEXIBLE",title:"I'm flexible"}])};
 if(state==="ji_time")return{reply:"Welcome back. Your request is saved. What time today works best?",ui:list("What time today works best?","Choose time",[{id:"JI_TIME_MORNING",title:"Morning"},{id:"JI_TIME_AFTERNOON",title:"Afternoon"},{id:"JI_TIME_EVENING",title:"Evening"},{id:"JI_TIME_ANY",title:"Any time"}])};
 if(state==="ji_photo_choice")return{reply:"Welcome back. Your request is saved. You can add a photo, or continue without one.",ui:buttons("Would you like to add a photo?",[{id:"JI_ADD_DRAFT_PHOTO",title:"Add photo"},{id:"JI_SKIP_PHOTO",title:"Not now"}])};
 if(state==="ji_description")return{reply:"Welcome back. Your request is saved. Tell me what needs fixing in one sentence."};
 if(state==="ji_location")return{reply:"Welcome back. Your request is saved. Send the suburb and city for the job, for example: Langa, Cape Town."};
 if(state==="ji_customer_name")return{reply:"Welcome back. Your request is saved. Send your full name to continue."};
 return{reply:"Welcome back. Your request is still saved. Continue from the step shown below.",ui:buttons("Continue your request",[{id:"HOME",title:"Home"}])};
}
Deno.serve(async req=>{if(req.method!=="POST")return json({handled:false},405);const k=key(),url=Deno.env.get("SUPABASE_URL")??"";if(!k||!url||req.headers.get("apikey")!==k)return json({handled:false},401);let input:Incoming;try{input=await req.json()}catch{return json({handled:false},400)}const phone=input.external_user_id?.trim()??"",message=input.message?.trim()??"";if(!phone||!resumeWords.has(norm(message)))return json({handled:false});const s=createClient(url,k,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});try{const [session,provider,customer]=await Promise.all([
 s.from("conversation_sessions").select("id,flow,state,context,updated_at").eq("channel",input.channel??"whatsapp").eq("external_user_id",phone).maybeSingle(),
 s.from("handymen").select("id,full_name,registration_status,terms_accepted_at,verification_status,active_job_id,status").eq("phone",phone).maybeSingle(),
 s.from("customers").select("id,full_name,registration_status,terms_accepted_at").eq("phone",phone).maybeSingle()
]);for(const r of [session,provider,customer])if(r.error)throw r.error;const st=String(session.data?.state??"");const flow=String(session.data?.flow??"");
 if(provider.data?.status==="suspended")return json({handled:true,reply:"This account is restricted. Contact HandyConnect support for review."});
 if(st==="capture_job_location"||st==="capture_location"&&flow==="customer_job")return json({handled:true,reply:"Welcome back. Your request details are still saved. Send the suburb and city for the job, for example: Langa Cape Town or Langa, Cape Town.",resumed_state:st});
 if(st==="capture_job_description")return json({handled:true,reply:"Welcome back. Your request is still in progress. Tell me what needs fixing in one sentence.",resumed_state:st});
 if(st==="capture_job_urgency"||st==="capture_job_timing")return json({handled:true,reply:"Welcome back. Your request is still saved. Tell me when you need the handyman: as soon as possible, today, or flexible.",resumed_state:st});
 if(st&&st!=="ready"){
   if(st.startsWith("handyman_router_")||["quote_capture","handyman_cancel_other_reason","profile_edit_bio","profile_edit_exp","profile_edit_business"].includes(st)){const r=await call(url,k,"handyman-router",input, st==="handyman_router_verification_document"?"H_SUBMIT_ID":"HANDYMAN_HOME");return json({...r.body,handled:true,resumed_state:st},r.status)}
   if(flow==="handyman_onboarding"||["capture_name","capture_business","capture_business_name","capture_skills","capture_skill","capture_location","confirm_terms","handyman_terms"].includes(st)){
     if(["confirm_terms","handyman_terms"].includes(st)){const r=await call(url,k,"conversation-engine",input,"ROLE_HANDYMAN");return json({...r.body,handled:true,resumed_state:st},r.status)}
     if(["capture_skills","capture_skill"].includes(st)){const r=await call(url,k,"conversation-engine",input,"HCATPAGE:0");return json({...r.body,handled:true,resumed_state:st},r.status)}
     if(st==="capture_name")return json({handled:true,reply:"Welcome back. Your provider setup is saved. Send your full name to continue.",resumed_state:st});
     if(["capture_business","capture_business_name"].includes(st))return json({handled:true,reply:"Welcome back. Your provider setup is saved. Send your business name, or reply SKIP if you do not use one.",resumed_state:st});
     if(st==="capture_location")return json({handled:true,reply:"Welcome back. Your provider setup is saved. Send the suburb and city where you mainly work, for example: Bellville, Cape Town.",resumed_state:st});
     return json({handled:true,reply:"Welcome back. Your provider setup is saved. Please reply with the information requested on your current step.",resumed_state:st});
   }
   if(st.startsWith("ji_")){const resumed=jobResume(st);return json({handled:true,...resumed,resumed_state:st})}
   if(st==="customer_name")return json({handled:true,reply:"Welcome back. Your registration is saved. Send your full name to continue.",resumed_state:st});
   if(st==="router_edit_location")return json({handled:true,reply:"Welcome back. Send the updated suburb and city for this request.",ui:buttons("Edit request",[{id:"CUSTOMER_JOBS",title:"My jobs"},{id:"HOME",title:"Home"}]),resumed_state:st});
   if(st.startsWith("report_router_")){const r=await call(url,k,"report-router",input,"report");return json({...r.body,handled:true,resumed_state:st},r.status)}
 }
 if(provider.data){if(provider.data.verification_status!=="verified"){const r=await call(url,k,"handyman-router",input,"H_VERIFY");return json({...r.body,handled:true,resumed_state:"verification"},r.status)}if(provider.data.active_job_id){const r=await call(url,k,"marketplace-router",input,"H_CURRENT");return json({...r.body,handled:true,resumed_state:"current_job"},r.status)}const r=await call(url,k,"handyman-router",input,"HANDYMAN_HOME");return json({...r.body,handled:true,resumed_state:"provider_home"},r.status)}
 if(customer.data){const jobs=await s.from("jobs").select("id,status").eq("customer_id",customer.data.id).in("status",["open","matching","assigned","in_progress"]).order("created_at",{ascending:false}).limit(1);if(jobs.error)throw jobs.error;if(jobs.data?.length){const r=await call(url,k,"marketplace-router",input,"CUSTOMER_JOBS");return json({...r.body,handled:true,resumed_state:"customer_jobs"},r.status)}const r=await call(url,k,"customer-home-router",input,"HOME");return json({...r.body,handled:true,resumed_state:"customer_home"},r.status)}
 return json({handled:false});
}catch(e){console.error(e);return json({handled:false,error:"resume_failed"},500)}});
