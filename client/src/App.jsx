import {useState,useEffect} from 'react';
import {api,go,logout} from './api.js';import {EVENT,ORG} from './config.js';
import Matrix from './Matrix.jsx';import OtpReset from './OtpReset.jsx';import Dash from './Dash.jsx';import Admin from './Admin.jsx';

export function Shell({nav,children}){return <>
  <header className="top"><a href="#" className="logo">&#9698; {EVENT}</a><nav>{nav}</nav></header>
  <main>{children}</main><footer>{ORG}</footer></>;}
export const LogoutBtn=()=><button className="btn alt sm" onClick={logout}>Logout</button>;

function Landing(){return <Shell>
  <section className="hero"><p className="type">&gt; ./start_competition</p><h1>{EVENT}</h1>
  <p>Enter the world of cybersecurity, where every clue matters and every flag brings you closer to victory.Solve challenging puzzles, analyze digital evidence, uncover hidden secrets, explore web vulnerabilities, and test your problem-solving skills. </p>
  <div className="cta"><a className="btn" href="#login">Login</a><a className="btn alt" href="#signup">Sign up</a></div></section>
  <section className="split"><div className="card"><h3>Participants</h3><p>Register through the official Google Form first, then sign up here with the same email.</p></div>
  <div className="card admin"><h3>Organizers</h3><p>Manage teams, challenges and the scoreboard.</p><a className="btn ghost" href="#admin-login">Admin</a></div></section></Shell>;}

const FORMS={
 login:{t:'Login',url:'/api/login',f:[['email','Registered email','email'],['password','Password','password']],to:'dash',links:<><a href="#forgot">Forgot password?</a> · <a href="#signup">Create account</a></>},
 signup:{t:'Sign up',url:'/api/signup',f:[['email','Email used in the Google Form','email'],['password','New password','password'],['confirm','Confirm password','password']],to:'login',ok:'Account created. You can now login.',links:<a href="#login">Already have an account?</a>},
 forgot:{t:'Reset password',url:'/api/forgot',f:[['email','Registered email','email'],['code','Reset code from the organizer','text'],['password','New password','password']],to:'login',links:<>Ask the organizer for a reset code. <a href="#login">Back to login</a></>},
 'admin-login':{t:'Admin login',url:'/api/admin/login',f:[['email','Admin email','email'],['password','Admin password','password']],to:'admin',links:<><a href="#admin-forgot">Forgot admin password?</a> · <a href="#">Back</a></>}};

function Auth({kind}){const F=FORMS[kind],[msg,setMsg]=useState({t:'',ok:false});
  const submit=async e=>{e.preventDefault();const r=await api(F.url,{method:'POST',json:Object.fromEntries(new FormData(e.target))});
    if(!r.ok)return setMsg({t:r.d.error||'Request failed.',ok:false});
    setMsg({t:r.d.message||F.ok||'Success',ok:true});
    setTimeout(()=>go(F.to),kind==='login'||kind==='admin-login'?0:1400);};
  return <Shell><form className="card auth" onSubmit={submit} autoComplete="off" key={kind}><h2>{F.t}</h2>
    {F.f.map(([n,l,t])=><div key={n}><label htmlFor={n}>{l}</label><input id={n} name={n} type={t} required/></div>)}
    <p className={'msg '+(msg.ok?'ok':'err')} role="alert">{msg.t}</p>
    <button className="btn" style={{width:'100%'}}>{F.t}</button>
    <p style={{color:'var(--m)',fontSize:13}}>{F.links}</p></form></Shell>;}

function AdminForgot(){return <Shell><div className="card auth"><h2>Reset admin password</h2>
  <p style={{color:'var(--m)',fontSize:13}}>A verification code will be emailed to the admin email address.</p>
  <OtpReset withEmail reqUrl="/api/admin/forgot/request" doUrl="/api/admin/forgot/reset"/><p style={{fontSize:13}}><a href="#admin-login">Back to admin login</a></p></div></Shell>;}

export default function App(){
  const [h,setH]=useState(location.hash.slice(1)),[ready,setReady]=useState(false);
  useEffect(()=>{const f=()=>setH(location.hash.slice(1));addEventListener('hashchange',f);
    api('/api/me').then(()=>setReady(true)); // also sets the CSRF cookie
    return()=>removeEventListener('hashchange',f);},[]);
  if(!ready)return null;
  const page=h==='admin-forgot'?<AdminForgot/>:FORMS[h]?<Auth kind={h}/>:h==='dash'?<Dash/>:h==='admin'?<Admin/>:<Landing/>;
  return <><Matrix/>{page}</>;}
