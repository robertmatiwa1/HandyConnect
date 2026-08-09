import { createClient } from "@supabase/supabase-js";

type Incoming={channel?:"whatsapp"|"test"|"admin";external_user_id?:string;external_message_id?:string;message?:string};
type Ui={type:"buttons";body:string;buttons:{id:string;title:string}[]}|{type:"list";body:string;button:string;rows:{id:string;title:string;description?:string}[]};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});
function key(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const p=JSON.parse(raw);if(typeof p.default==="string"&&p.default)return p.default}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
function reasons(jobId:string):Ui{return{type:"list",body:"What went wrong?",button:"Choose reason",rows:[
{id:`REPORT_REASON:${jobId}:no_show`,title:"No-show",description:"The other person did not arrive"},
{id:`REPORT_REASON:${jobId}:unsafe_behaviour`,title:"Unsafe behaviour",description:"Safety, threats or harassment"},
{id:`REPORT_REASON:${jobId}:poor_workmanship`,title:"Poor workmanship",description:"Work quality problem"},
{id:`REPORT_REASON:${jobId}:payment_dispute`,title:"Payment dispute",description:"Price or payment disagreement"},
{id:`REPORT_REASON:${jobId}:wrong_information`,title:"Wrong information",description:"Misleading profile or job details"},
{id:`REPORT_REASON:${jobId}:other`,title:"Other",description:"Something else happened"}
]}}
async function latestRelevantJob(s:any,phone:string){
 const c=await s.from("customers").select("id").eq("phone",phone).maybeSingle();
 if(c.data){const j=await s.from("jobs").select("id,description,status,created_at").eq("customer_id",c.data.id).order("created_at",{ascending:false}).limit(1).maybeSingle();if(j.data)return j.data}
 const h=await s.from("handymen").select("id").eq("phone",phone).maybeSingle();
 if(h.data){const a=await s.from("job_assignments").select("job_id,assigned_at").eq("handyman_id",h.data.id).order("assigned_at",{ascending:false}).limit(1).maybeSingle();if(a.data){const j=await s.from("jobs").select("id,description,status,created_at").eq("id",a.data.job_id).maybeSingle();if(j.data)return j.data}}
 return null;
}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const k=key(),url=Deno.env.get("SUPABASE_URL")??"";if(!k||!url||req.headers.get("apikey")!==k)return json({error:"unauthorized"},401);
 let input:Incoming;try{input=await req.json()}catch{return json({error:"invalid_json"},400)}
 const phone=input.external_user_id?.trim(),message=input.message?.trim();if(!phone||!message)return json({error:"missing_input"},400);
 const s=createClient(url,k,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 try{
  const session=await s.from("conversation_sessions").select("id,state,context").eq("channel",input.channel??"whatsapp").eq("external_user_id",phone).maybeSingle();
  if(session.data?.state==="report_router_details"){
    const jobId=session.data.context?.report_job_id,reason=session.data.context?.report_reason;
    if(!jobId||!reason)return json({ok:true,reply:"That report expired. Type report to start again."});
    const r=await s.rpc("create_job_report",{p_reporter_phone:phone,p_job_id:jobId,p_reason:reason,p_details:message});if(r.error)throw r.error;
    await s.from("conversation_sessions").update({state:"ready",context:{}}).eq("id",session.data.id);
    return json({ok:true,reply:"Report received. HandyConnect will review it. You do not need to submit it again."});
  }
  if(message.startsWith("REPORT_REASON:")){
    const parts=message.split(":");const jobId=parts[1],reason=parts.slice(2).join(":");
    if(session.data?.id)await s.from("conversation_sessions").update({state:"report_router_details",context:{report_job_id:jobId,report_reason:reason}}).eq("id",session.data.id);
    return json({ok:true,reply:"Please briefly describe what happened. Do not send bank PINs, passwords or other sensitive credentials."});
  }
  const job=await latestRelevantJob(s,phone);if(!job)return json({ok:true,reply:"I couldn't find a job linked to your number to report."});
  return json({ok:true,reply:`Report a problem with your latest job:\n${job.description}\nStatus: ${job.status}`,ui:reasons(job.id)});
 }catch(e){console.error(e);return json({error:"report_failed"},500)}
});
