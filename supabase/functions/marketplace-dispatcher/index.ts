import { createClient } from "@supabase/supabase-js";

function env(name:string){return Deno.env.get(name)?.trim()??""}
function serviceKey(){const raw=env("SUPABASE_SECRET_KEYS");if(raw){try{const parsed=JSON.parse(raw);if(typeof parsed.default==="string"&&parsed.default)return parsed.default}catch{}}return env("SUPABASE_SERVICE_ROLE_KEY")}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});

async function sendWhatsApp(to:string,bodyText:string,ui?:any){
  const token=env("WHATSAPP_ACCESS_TOKEN"),phoneId=env("WHATSAPP_PHONE_NUMBER_ID"),version=env("WHATSAPP_GRAPH_VERSION");
  if(!token||!phoneId||!version)throw new Error("WhatsApp outbound secrets are incomplete");
  let body:any={messaging_product:"whatsapp",to};
  if(ui?.type==="buttons"&&Array.isArray(ui.buttons)&&ui.buttons.length){
    body.type="interactive";
    body.interactive={type:"button",body:{text:bodyText},action:{buttons:ui.buttons.slice(0,3).map((b:any)=>({type:"reply",reply:{id:String(b.id).slice(0,256),title:String(b.title).slice(0,20)}}))}};
  }else if(ui?.type==="list"&&Array.isArray(ui.rows)&&ui.rows.length){
    body.type="interactive";
    body.interactive={type:"list",body:{text:bodyText},action:{button:String(ui.button||"Choose").slice(0,20),sections:[{title:"Options",rows:ui.rows.slice(0,10).map((r:any)=>({id:String(r.id).slice(0,200),title:String(r.title).slice(0,24),description:r.description?String(r.description).slice(0,72):undefined}))}]}};
  }else{
    body.type="text";body.text={body:bodyText};
  }
  const response=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)});
  const text=await response.text();
  if(!response.ok)throw new Error(`WhatsApp ${response.status}: ${text.slice(0,500)}`);
}

Deno.serve(async(req)=>{
  if(req.method!=="POST"&&req.method!=="GET")return json({error:"method_not_allowed"},405);
  const key=serviceKey(),url=env("SUPABASE_URL");
  if(!key||!url)return json({error:"server_configuration_error"},500);
  const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  try{
    const tick=await s.rpc("dispatch_marketplace_tick",{p_job_limit:25});
    if(tick.error)throw tick.error;
    const claimed=await s.rpc("claim_notification_batch",{p_limit:50});
    if(claimed.error)throw claimed.error;
    let sent=0,failed=0;
    for(const n of claimed.data??[]){
      try{
        await sendWhatsApp(n.recipient_phone,n.body,n.payload?.ui);
        const done=await s.rpc("finish_notification",{p_id:n.id,p_success:true,p_error:null});
        if(done.error)throw done.error;
        sent++;
      }catch(e){
        const message=e instanceof Error?e.message:String(e);
        console.error("notification send failed",n.id,message);
        await s.rpc("finish_notification",{p_id:n.id,p_success:false,p_error:message});
        failed++;
      }
    }
    return json({ok:true,tick:tick.data?.[0]??null,claimed:(claimed.data??[]).length,sent,failed});
  }catch(e){
    console.error(e);
    return json({error:"dispatcher_failed",detail:e instanceof Error?e.message:String(e)},500);
  }
});
