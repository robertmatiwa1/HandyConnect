import { createClient } from "@supabase/supabase-js";

function env(name:string){return Deno.env.get(name)?.trim()??""}
function serviceKey(){const raw=env("SUPABASE_SECRET_KEYS");if(raw){try{const p=JSON.parse(raw);if(typeof p.default==="string"&&p.default)return p.default}catch{}}return env("SUPABASE_SERVICE_ROLE_KEY")}
function hex(bytes:ArrayBuffer){return[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function equalConstantTime(a:string,b:string){if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
async function hmac512(secret:string,text:string){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-512"},false,["sign"]);return hex(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(text)))}
async function sha256(text:string){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const secret=env("PAYSTACK_SECRET_KEY"),key=serviceKey(),url=env("SUPABASE_URL");
  if(!secret||!key||!url)return json({error:"server_configuration_error"},500);
  const raw=await req.text();
  const signature=req.headers.get("x-paystack-signature")?.trim()??"";
  const expected=await hmac512(secret,raw);
  if(!signature||!equalConstantTime(signature,expected))return json({error:"invalid_signature"},401);
  let event:any;try{event=JSON.parse(raw)}catch{return json({error:"invalid_json"},400)}
  const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const eventId=`sha256:${await sha256(raw)}`;
  try{
    const existing=await s.from("payment_events").select("id,processed_at").eq("provider","paystack").eq("provider_event_id",eventId).maybeSingle();if(existing.error)throw existing.error;
    let eventRow=existing.data;
    if(eventRow?.processed_at)return json({ok:true,duplicate:true});
    if(!eventRow){const ins=await s.from("payment_events").insert({provider:"paystack",provider_event_id:eventId,event_type:String(event?.event??"unknown"),payload:event}).select("id,processed_at").single();if(ins.error)throw ins.error;eventRow=ins.data}

    const type=String(event?.event??"");const data=event?.data??{};
    if(type==="charge.success"){
      const reference=String(data?.reference??"");const amount=Number(data?.amount??0);const currency=String(data?.currency??"");const email=String(data?.customer?.email??data?.metadata?.email??"");
      const configuredPlan=env("PAYSTACK_PRO_PLAN_CODE");const eventPlan=String(data?.plan?.plan_code??data?.plan??"");
      const ourCharge=reference.startsWith("HC-PRO-")||(configuredPlan&&eventPlan===configuredPlan);
      if(ourCharge&&reference&&amount>0&&email){
        const applied=await s.rpc("apply_successful_pro_payment",{p_reference:reference,p_amount_cents:amount,p_currency:currency,p_customer_email:email,p_provider_subscription_id:null});if(applied.error)throw applied.error;
        const paymentId=applied.data?.[0]?.payment_id??null;const validUntil=applied.data?.[0]?.valid_until??null;
        if(paymentId){await s.from("payment_events").update({payment_id:paymentId}).eq("id",eventRow.id);const pq=await s.from("payments").select("handyman_id").eq("id",paymentId).single();if(!pq.error){const hq=await s.from("handymen").select("phone").eq("id",pq.data.handyman_id).single();if(!hq.error){await s.from("notification_outbox").insert({recipient_phone:hq.data.phone,kind:"payment_success",body:`Payment received. Your HandyConnect Pro access is active${validUntil?` until ${new Date(validUntil).toLocaleDateString("en-ZA")}`:""}.`,payload:{},dedupe_key:`payment-success:${paymentId}`})}}}
      }
    }else if(["subscription.create","subscription.not_renew","subscription.disable"].includes(type)){
      const email=String(data?.customer?.email??"");const subscriptionCode=String(data?.subscription_code??data?.subscription?.subscription_code??"");
      if(email){const r=await s.rpc("apply_paystack_subscription_event",{p_customer_email:email,p_provider_subscription_id:subscriptionCode||null,p_event_type:type});if(r.error)throw r.error}
    }else if(type==="invoice.payment_failed"){
      const email=String(data?.customer?.email??"");if(email){const hq=await s.from("handymen").select("id,phone").ilike("email",email).maybeSingle();if(!hq.error&&hq.data){await s.from("subscriptions").update({status:"past_due",updated_at:new Date().toISOString()}).eq("handyman_id",hq.data.id).eq("provider","paystack").eq("plan_code","pro_monthly").eq("status","active");await s.from("notification_outbox").insert({recipient_phone:hq.data.phone,kind:"payment_failed",body:"Your HandyConnect Pro renewal payment failed. Your current access remains available until the paid period ends; please update your payment method before then.",payload:{},dedupe_key:`payment-failed:${eventId}`})}}
    }
    await s.from("payment_events").update({processed_at:new Date().toISOString(),processing_error:null}).eq("id",eventRow.id);
    return json({ok:true});
  }catch(e){const msg=e instanceof Error?e.message:String(e);console.error(e);await s.from("payment_events").update({processing_error:msg}).eq("provider","paystack").eq("provider_event_id",eventId);return json({error:"processing_failed"},500)}
});
