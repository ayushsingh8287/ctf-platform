import {useState,useEffect,useCallback} from 'react';
import {api,go,fmt} from './api.js';import {Shell,LogoutBtn} from './App.jsx';import OtpReset from './OtpReset.jsx';

function Overview(){
  const [d,setD]=useState(null),[q,setQ]=useState(''),[z,setZ]=useState(''),[sel,setSel]=useState([]);
  const load=useCallback(()=>api('/api/admin/overview').then(r=>r.ok?setD(r.d):go('admin-login')),[]);useEffect(()=>{load();},[load]);
  if(!d)return null;const s=d.stats;
  const reset=async email=>{const r=await api('/api/admin/reset-code',{method:'POST',json:{email}});alert(r.ok?`Reset code for ${email}:\n\n${r.d.code}\n\nValid for ${r.d.expires}. Share it privately.`:r.d.error);};
  const removeTeams=async()=>{if(!sel.length||!confirm(`Remove ${sel.length} team(s)? This deletes their emails, accounts, scores and submissions. It cannot be undone.`))return;
    const r=await api('/api/admin/teams/remove',{method:'POST',json:{team_keys:sel}});if(r.ok){setSel([]);load();}else alert(r.d.error);};
  const removeMember=async email=>{if(!confirm(`Remove ${email}? Their account will be deleted.`))return;const r=await api('/api/admin/participants/remove',{method:'POST',json:{email}});if(r.ok)load();else alert(r.d.error);};
  const rows=[...d.teams].sort((a,b)=>a.rank-b.rank).filter(t=>(t.team_name+t.leader_name+t.members.map(m=>m.email).join()).toLowerCase().includes(q.toLowerCase())&&(!z||String(t.size)===z));
  return <>
    <div className="stats">{[['Teams',s.teams],['Participants',s.participants],['Solo',s.solo],['2-member',s.two],['3-member',s.three]].map(([l,v])=><div className="card stat" key={l}><b>{v}</b>{l}</div>)}</div>
    <p>Recent: {d.recent.join(', ')||'none'}</p>
    <div className="filters"><input placeholder="Search team, leader or email" value={q} onChange={e=>setQ(e.target.value)}/>
      <select value={z} onChange={e=>setZ(e.target.value)}><option value="">All sizes</option><option>1</option><option>2</option><option>3</option></select>
      <a className="btn alt" href="/api/admin/export.csv">Export CSV</a>
      <button className="btn danger" disabled={!sel.length} onClick={removeTeams}>Remove selected ({sel.length})</button></div>
    <div className="tbl"><table><thead><tr><th><input type="checkbox" style={{width:'auto'}} aria-label="Select all shown" checked={rows.length>0&&rows.every(t=>sel.includes(t.team_key))} onChange={e=>setSel(e.target.checked?rows.map(t=>t.team_key):[])}/></th><th>Rank</th><th>Team</th><th>Leader</th><th>Members</th><th>Pts</th><th>Accounts (passwords are hashed, never viewable)</th></tr></thead><tbody>
    {rows.map(t=><tr key={t.team_key}><td><input type="checkbox" style={{width:'auto'}} aria-label={'Select '+t.team_name} checked={sel.includes(t.team_key)} onChange={e=>setSel(e.target.checked?[...sel,t.team_key]:sel.filter(k=>k!==t.team_key))}/></td><td>#{t.rank}</td><td>{t.team_name}</td><td>{t.leader_name}<br/>{t.leader_email}</td>
      <td>{t.members.map(m=><div key={m.email}>{m.name}<br/>{m.email} {m.email!==t.leader_email&&<button className="btn sm danger" title="Remove this email" onClick={()=>removeMember(m.email)}>&#10005;</button>}</div>)}</td><td>{t.points}</td>
      <td>{t.accounts.length?t.accounts.map(a=><div key={a.email}>{a.email}<br/>created {fmt(a.created)}<br/>pw changed {fmt(a.password_updated)} ({a.history.length} events)<br/><button className="btn sm ghost" onClick={()=>reset(a.email)}>Reset code</button><hr/></div>):'No account yet'}</td></tr>)}
    </tbody></table></div></>;}

function Challenges(){
  const [d,setD]=useState(null),[edit,setEdit]=useState(null),[msg,setMsg]=useState('');
  const load=useCallback(()=>api('/api/admin/challenges').then(r=>r.ok&&setD(r.d)),[]);useEffect(()=>{load();},[load]);
  if(!d)return null;
  const submit=async e=>{e.preventDefault();const fd=new FormData(e.target);
    const r=await api(edit?`/api/admin/challenges/${edit.id}`:'/api/admin/challenges',{method:edit?'PUT':'POST',form:fd});
    if(r.ok){setEdit(null);setMsg('');e.target.reset();load();}else setMsg(r.d.error);};
  const patch=async(id,k,v)=>{await api('/api/admin/challenges/'+id,{method:'PATCH',json:{[k]:v}});load();};
  const del=async id=>{if(confirm('Delete this challenge? Scores and submission history are kept.')){await api('/api/admin/challenges/'+id,{method:'DELETE'});load();}};
  const e=edit||{};
  return <>
    <form className="card" onSubmit={submit} key={e.id||'new'}><h3>{edit?`Edit challenge #${e.id}`:'Add challenge'}</h3>
      <div className="filters">
        <div><label>Title</label><input name="title" required maxLength={100} defaultValue={e.title}/></div>
        <div><label>Category</label><select name="category" defaultValue={e.category}>{d.CATS.map(x=><option key={x}>{x}</option>)}</select></div>
        <div><label>Difficulty</label><select name="difficulty" defaultValue={e.difficulty}>{d.DIFFS.map(x=><option key={x}>{x}</option>)}</select></div>
        <div><label>Points</label><input name="points" type="number" min="1" max="10000" required defaultValue={e.points}/></div></div>
      <label>Description</label><textarea name="description" rows="4" defaultValue={e.description}/>
      <label>Flag (leave blank when editing to keep the current one)</label><input name="flag" autoComplete="off"/>
      <label>Files (png, jpg, txt, log, zip, pcap, pdf, csv, json)</label><input type="file" name="files" multiple/>
      <label><input type="checkbox" name="replace_files" value="1" style={{width:'auto'}}/> Replace existing files</label>
      <p className="msg err">{msg}</p><button className="btn">Save challenge</button> {edit&&<button type="button" className="btn alt" onClick={()=>setEdit(null)}>Cancel edit</button>}</form>
    <div className="tbl"><table><thead><tr><th>Title</th><th>Category</th><th>Pts</th><th>Solves</th><th>Files</th><th>Status</th><th></th></tr></thead><tbody>
    {d.cs.map(x=><tr key={x.id}><td>{x.title}</td><td>{x.category} · {x.difficulty}</td><td>{x.points}</td><td>{x.solves}</td><td>{x.files.map(f=>f.name).join(', ')}</td>
      <td>{x.enabled?'enabled':'disabled'}{x.hidden?', hidden':''}</td>
      <td><button className="btn sm alt" onClick={()=>{setEdit(x);scrollTo(0,0);}}>Edit</button> <button className="btn sm alt" onClick={()=>patch(x.id,'enabled',!x.enabled)}>{x.enabled?'Disable':'Enable'}</button> <button className="btn sm alt" onClick={()=>patch(x.id,'hidden',!x.hidden)}>{x.hidden?'Show':'Hide'}</button> <button className="btn sm danger" onClick={()=>del(x.id)}>Delete</button></td></tr>)}
    </tbody></table></div></>;}

function Activity(){
  const [a,setA]=useState(null);useEffect(()=>{api('/api/admin/activity').then(r=>r.ok&&setA(r.d));},[]);if(!a)return null;
  return <><h3>Solves</h3><div className="tbl"><table><thead><tr><th>Time</th><th>Team</th><th>Challenge</th><th>Pts</th></tr></thead><tbody>{a.solves.map((x,i)=><tr key={i}><td>{fmt(x.ts)}</td><td>{x.team_name}</td><td>{x.title}</td><td>{x.points}</td></tr>)}</tbody></table></div>
  <h3>Flag submissions</h3><div className="tbl"><table><thead><tr><th>Time</th><th>Team</th><th>Challenge</th><th>Submitted</th><th>Result</th><th>IP</th></tr></thead><tbody>{a.submissions.map((x,i)=><tr key={i}><td>{fmt(x.ts)}</td><td>{x.team_name}</td><td>{x.title}</td><td>{x.flag}</td><td className={x.correct?'ok':'err'}>{x.correct?'correct':'wrong'}</td><td>{x.ip}</td></tr>)}</tbody></table></div></>;}

function Import(){
  const [csv,setCsv]=useState(''),[m,setM]=useState({t:'',ok:false});
  const submit=async e=>{e.preventDefault();const r=await api('/api/admin/import',{method:'POST',json:{csv}});setM({ok:r.ok,t:r.ok?`Imported ${r.d.teams} teams, ${r.d.emails} emails.`:r.d.error});};
  return <form className="card" onSubmit={submit}><h3>Import approved participants</h3>
    <p style={{color:'var(--m)'}}>Export your Google Form responses as CSV with columns: team name, leader name, leader email, member 1 name, member 1 email, member 2 name, member 2 email. Re-importing is safe: existing accounts, scores and submissions are untouched.</p>
    <input type="file" accept=".csv" onChange={e=>{const r=new FileReader();r.onload=()=>setCsv(r.result);r.readAsText(e.target.files[0]);}}/>
    <label>or paste CSV</label><textarea rows="8" value={csv} onChange={e=>setCsv(e.target.value)}/>
    <p className={'msg '+(m.ok?'ok':'err')}>{m.t}</p><button className="btn">Import</button></form>;}

function Security(){return <div className="card" style={{maxWidth:520}}><h3>Change admin password</h3>
  <p style={{color:'var(--m)',fontSize:13}}>Use this right away if anyone else may know the password. A 6-digit code is emailed to the admin email. After the change every admin session (including this one) is signed out.</p>
  <OtpReset reqUrl="/api/admin/security/otp" doUrl="/api/admin/security/change"/></div>;}
const TABS={overview:Overview,challenges:Challenges,activity:Activity,import:Import,security:Security};
export default function Admin(){
  const [tab,setTab]=useState('overview'),T=TABS[tab];
  return <Shell nav={<LogoutBtn/>}>
    <div className="tabs">{Object.keys(TABS).map(t=><button key={t} className={'btn sm'+(t===tab?'':' alt')} onClick={()=>setTab(t)}>{t}</button>)}</div>
    <T key={tab}/></Shell>;}
