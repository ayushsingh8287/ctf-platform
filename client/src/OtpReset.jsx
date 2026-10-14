import {useState} from 'react';import {api,go} from './api.js';
// Two steps: 1) email a 6-digit code to the admin email  2) enter the code + new password.
export default function OtpReset({withEmail,reqUrl,doUrl}){
  const [step,setStep]=useState(1),[email,setEmail]=useState(''),[msg,setMsg]=useState({t:'',ok:false});
  const say=(t,ok=false)=>setMsg({t,ok});
  const request=async e=>{e.preventDefault();const r=await api(reqUrl,{method:'POST',json:{email}});
    if(!r.ok)return say(r.d.error||'Request failed.');setStep(2);say(r.d.message||'Code sent.',true);};
  const reset=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
    if(f.password!==f.confirm)return say('Passwords do not match.');
    const r=await api(doUrl,{method:'POST',json:{email,otp:f.otp,password:f.password}});
    if(!r.ok)return say(r.d.error||'Request failed.');say(r.d.message,true);setTimeout(()=>go('admin-login'),1800);};
  return <>
    {step===1?<form onSubmit={request}>
      {withEmail&&<><label htmlFor="ae">Admin email</label><input id="ae" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></>}
      <p className={'msg '+(msg.ok?'ok':'err')} role="alert">{msg.t}</p><button className="btn">Send verification code</button></form>
    :<form onSubmit={reset} autoComplete="off">
      <label htmlFor="otp">6-digit code from your email</label><input id="otp" name="otp" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoFocus/>
      <label htmlFor="pw">New password (12+ characters, upper, lower, number, symbol)</label><input id="pw" name="password" type="password" minLength={12} required/>
      <label htmlFor="cf">Confirm new password</label><input id="cf" name="confirm" type="password" required/>
      <p className={'msg '+(msg.ok?'ok':'err')} role="alert">{msg.t}</p>
      <button className="btn">Change password</button> <button type="button" className="btn alt" onClick={()=>{setStep(1);say('');}}>Resend code</button></form>}
  </>;}
