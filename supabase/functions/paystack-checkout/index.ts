import { createClient } from "@supabase/supabase-js";

function env(name:string){return Deno.env.get(name)?.trim()??""}
function serviceKey(){const raw=env("SUPABASE_SECRET_KEYS");if(raw){try{const p=JSON.parse(raw);if(typeof p.default==="string"&&p.default)return p.default}catch{}}return env("SUPABASE_SERVICE_ROLE_KEY")}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const key=serviceKey(),url=env("SUPABASE_URL");
  if(!key||!url||req.headers.get("apikey")!==key)return json({error:"unauthorized"},401);
  const secret=env("PAYSTACK_SECRET_KEY");
  if(!secret)return json({error:"payments_not_configured"},503);
  let input:any;try{input=await req.json()}catch{return json({error:"invalid_json"},400)}
  const phone=String(input?.phone??"").trim();if(!phone)return json({error:"phone_required"},400);
  const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  try{
    const hq=await s.from("handymen").select("id,phone,email,status").eq("phone",phone).maybeSingle();if(hq.error)throw hq.error;const h=hq.data;
    if(!h||h.status!=="active")return json({error:"handyman_not_found"},404);
    if(!h.email)return json({error:"billing_email_required"},422);
    const planq=await s.from("plans").select("code,price_cents,currency,active,provider_plan_code").eq("code","pro_monthly").maybeSingle();if(planq.error)throw planq.error;const plan=planq.data;
    if(!plan?.active)return json({error:"pro_plan_unavailable"},409);
    const paystackPlan=String(plan.provider_plan_code??env("PAYSTACK_PRO_PLAN_CODE")??"").trim();
    if(!paystackPlan)return json({error:"payments_not_configured"},503);
    const eq=await s.from("entitlements").select("id,valid_until").eq("handyman_id",h.id).eq("entitlement_type","pro_access").eq("status","active").order("created_at",{ascending:false});if(eq.error)throw eq.error;
    const activePro=(eq.data??[]).find((x:any)=>!x.valid_until||new Date(x.valid_until)>new Date());
    if(activePro)return json({ok:true,already_active:true,valid_until:activePro.valid_until});

    const existing=await s.from("payments").select("id,checkout_url,checkout_expires_at,provider_payment_id,status").eq("handyman_id",h.id).eq("provider","paystack").eq("purpose","subscription").in("status",["initiated","pending"]).order("created_at",{ascending:false}).limit(1);if(existing.error)throw existing.error;
    const recent=existing.data?.[0];
    if(recent?.checkout_url&&recent.checkout_expires_at&&new Date(recent.checkout_expires_at)>new Date())return json({ok:true,payment_id:recent.id,reference:recent.provider_payment_id,payment_url:recent.checkout_url,reused:true});

    const reference=`HC-PRO-${crypto.randomUUID().replaceAll("-","")}`;
    const p=await s.from("payments").insert({handyman_id:h.id,provider:"paystack",provider_payment_id:reference,purpose:"subscription",amount_cents:plan.price_cents,currency:plan.currency,status:"initiated",idempotency_key:`paystack:${reference}`}).select("id").single();if(p.error)throw p.error;
    const payload={email:h.email,amount:String(plan.price_cents),currency:String(plan.currency),plan:paystackPlan,reference,metadata:JSON.stringify({handyman_id:h.id,handyman_phone:h.phone,plan_code:"pro_monthly",payment_id:p.data.id})};
    const response=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{authorization:`Bearer ${secret}`,"content-type":"application/json"},body:JSON.stringify(payload)});
    const body=await response.json().catch(()=>null);
    if(!response.ok||body?.status!==true||!body?.data?.authorization_url){await s.from("payments").update({status:"failed"}).eq("id",p.data.id);return json({error:"paystack_initialize_failed",detail:body?.message??`HTTP ${response.status}`},502)}
    const expires=new Date(Date.now()+30*60*1000).toISOString();
    await s.from("payments").update({status:"pending",checkout_url:body.data.authorization_url,checkout_expires_at:expires,provider_access_code:body.data.access_code??null}).eq("id",p.data.id);
    return json({ok:true,payment_id:p.data.id,reference,payment_url:body.data.authorization_url,expires_at:expires});
  }catch(e){console.error(e);return json({error:"checkout_failed"},500)}
});
