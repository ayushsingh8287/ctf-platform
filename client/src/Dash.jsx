import {useState,useEffect,useCallback} from 'react';
import {api,go,kb} from './api.js';import {Shell,LogoutBtn} from './App.jsx';
const ini=n=>String(n).split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();

function Modal({c,onClose,onSolved}){
  const [msg,setMsg]=useState({t:'',ok:false});
  useEffect(()=>{const k=e=>e.key==='Escape'&&onClose();addEventListener('keydown',k);return()=>removeEventListener('keydown',k);},[onClose]);
  const submit=async e=>{e.preventDefault();const r=await api(`/api/challenges/${c.id}/submit`,{method:'POST',json:{flag:new FormData(e.target).get('flag')}});
    setMsg({t:r.d.message||r.d.error,ok:r.d.status==='correct'});if(r.d.status==='correct')onSolved();};
  return <div className="modal" onClick={e=>e.target===e.currentTarget&&onClose()}><div className="card">
    <span className="pill">{c.category}</span><span className={'pill '+c.difficulty}>{c.difficulty}</span><span className={'badge '+(c.solved?'ok':'')}>{c.solved?'✓ Solved':'Unsolved'}</span>
    <h2>{c.title}</h2><p className="pts">{c.points} <small>points</small></p><pre>{c.description}</pre>
    {c.files.length>0&&<><h4>Files ({c.files.length})</h4>{c.files.map(f=><div className="fileline" key={f.id}><a href={`/api/files/${f.id}`} download>⬇ {f.name}</a><span style={{color:'var(--m)'}}>{f.name.split('.').pop()} · {kb(f.size)}</span></div>)}</>}
    <form onSubmit={submit}><label htmlFor="flag">Enter flag</label><input id="flag" name="flag" maxLength={200} required autoComplete="off" autoFocus placeholder="CTF{...}"/>
    <p className={'msg '+(msg.ok?'ok':'err')} role="alert">{msg.t}</p>
    <button className="btn">Submit Flag</button> <button type="button" className="btn alt" onClick={onClose}>Close</button></form></div></div>;}

const Ring=({pct})=><svg viewBox="0 0 90 90" className="d-ring" role="img" aria-label={pct+'% complete'}><circle cx="45" cy="45" r="36" className="d-ring-bg"/><circle cx="45" cy="45" r="36" className="d-ring-fg" strokeDasharray={`${pct*2.262} 226.2`} transform="rotate(-90 45 45)"/><text x="45" y="50" textAnchor="middle" className="d-ring-t">{pct}%</text></svg>;
const jump=id=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});

export default function Dash(){
  const [d,setD]=useState(null),[f,setF]=useState({cat:'',d:'',s:'',p:'a',q:''}),[open,setOpen]=useState(null);
  const load=useCallback(async()=>{
    const [m,b,c]=await Promise.all([api('/api/me'),api('/api/leaderboard'),api('/api/challenges')]);
    if(!m.ok)return go('login');setD({m:m.d,b:b.d,c:c.d});},[]);
  useEffect(()=>{load();const t=setInterval(()=>{if(!open)load();},20000);return()=>clearInterval(t);},[load,open]);
  if(!d)return <Shell nav={<LogoutBtn/>}/>;
  const {m,b,c}=d,set=k=>e=>setF({...f,[k]:e.target.value}),pct=m.total?Math.round(m.solved/m.total*100):0,top=b[0]?.points||1;
  const cats=[...new Set(c.map(x=>x.category))];
  const list=c.filter(x=>(!f.cat||x.category===f.cat)&&(!f.d||x.difficulty===f.d)&&(!f.s||String(+x.solved)===f.s)&&x.title.toLowerCase().includes(f.q.toLowerCase())).sort((a,z)=>f.p==='d'?z.points-a.points:a.points-z.points);
  const sel=c.find(x=>x.id===open),pod=b.length>=3?[b[1],b[0],b[2]]:[],rest=b.length>=3?b.slice(3):b;
  const lbRow=(x,i,arr)=><div key={x.rank}>{i>0&&x.rank-arr[i-1].rank>1&&<div className="gap">⋮</div>}
    <div className={'lb'+(x.mine?' me':'')}><span className={'rk '+(x.rank<4?'r'+x.rank:'')}>{x.rank}</span><span className="nm">{x.team}{x.mine&&' (you)'}</span><b>{x.points}</b></div>
    <div className="bar" style={{height:3,margin:'0 8px 4px'}}><i style={{width:Math.round(x.points/top*100)+'%'}}/></div></div>;
  return <Shell nav={<><span className="who">{m.team_name}</span><LogoutBtn/></>}>
    <div className="d-wrap">
      <aside className="d-side">
        <div className="d-card d-team"><div className="d-av-lg">{ini(m.team_name)}</div><h2>{m.team_name}</h2>
          <div className="d-sub">Team of {m.members.length}</div><span className="d-rankpill">Rank #{m.rank}</span>
          <Ring pct={pct}/><div className="d-sub">{m.solved} of {m.total} challenges solved</div></div>
        <nav className="d-card d-nav" aria-label="Sections"><button onClick={()=>jump('d-overview')}>Overview</button><button onClick={()=>jump('d-challenges')}>Challenges</button><button onClick={()=>jump('d-board')}>Leaderboard</button></nav>
        <div className="d-card d-members"><h4>Team members</h4>{m.members.map(x=><div className="mem" key={x.email}><span className="av">{ini(x.name)}</span><div>{x.name}{x.email===m.leader_email&&<span className="lead">leader</span>}<small>{x.email}</small></div></div>)}</div>
      </aside>
      <div className="d-main">
        <div className="d-head" id="d-overview"><div><h1>Dashboard</h1><p>Welcome back, {m.team_name}</p></div><span className="live"><span className="dot"/>live · updates every 20s</span></div>
        <div className="d-kpis">{[['Total points',m.points,'team score'],['Rank','#'+m.rank,'current position'],['Solved',`${m.solved}/${m.total}`,pct+'% complete'],['Remaining',Math.max(0,m.total-m.solved),'challenges left']].map(([l,v,s])=><div className="d-card d-kpi" key={l}><span>{l}</span><b>{v}</b><small>{s}</small></div>)}</div>
        <div className="d-grid2">
          <div className="d-card"><h3 className="d-title">Progress by category</h3>
            {cats.length?cats.map(k=>{const t=c.filter(x=>x.category===k),s=t.filter(x=>x.solved).length;return <div className="d-catrow" key={k}><div><span>{k}</span><span style={{color:'var(--m)'}}>{s}/{t.length}</span></div><div className="bar"><i style={{width:Math.round(s/t.length*100)+'%'}}/></div></div>;}):<p className="live">No challenges yet.</p>}</div>
          <div className="d-card" id="d-board"><h3 className="d-title">Leaderboard <span className="live"><span className="dot"/>live</span></h3>
            {pod.length>0&&<div className="d-pods">{pod.map(x=><div key={x.rank} className={'d-pod p'+x.rank+(x.mine?' me':'')}><i>#{x.rank}</i><div className="nm">{x.team}{x.mine&&' (you)'}</div><b>{x.points}</b></div>)}</div>}
            {rest.map(lbRow)}</div></div>
        <section id="d-challenges"><div className="sec" style={{marginTop:0}}><h2>Challenges</h2><span className="live">{list.length} shown</span></div>
          <div className="chips"><button className={'chip'+(!f.cat?' on':'')} onClick={()=>setF({...f,cat:''})}>All ({c.length})</button>
            {cats.map(k=><button key={k} className={'chip'+(f.cat===k?' on':'')} onClick={()=>setF({...f,cat:k})}>{k} ({c.filter(x=>x.category===k).length})</button>)}</div>
          <div className="d-tools"><input placeholder="Search challenges" value={f.q} onChange={set('q')}/>
            <select value={f.d} onChange={set('d')}><option value="">All difficulties</option><option>Easy</option><option>Medium</option><option>Hard</option></select>
            <select value={f.s} onChange={set('s')}><option value="">Solved + unsolved</option><option value="1">Solved</option><option value="0">Unsolved</option></select>
            <select value={f.p} onChange={set('p')}><option value="a">Points: low to high</option><option value="d">Points: high to low</option></select></div>
          <div className="d-cards">{list.map(x=><div key={x.id} data-d={x.difficulty} className={'d-ch'+(x.solved?' solved':'')} tabIndex={0} onClick={()=>setOpen(x.id)} onKeyDown={e=>e.key==='Enter'&&setOpen(x.id)}>
            <div className="d-ch-top"><span className="d-cat">{x.category}</span><span className={'d-diff '+x.difficulty}>{x.difficulty}</span></div>
            <h3>{x.title}</h3><p className="clamp">{x.description}</p>
            <div className="d-ch-foot"><span className="pts">{x.points}<small> pts</small></span><span>{x.files.length>0&&<span className="live">📎 {x.files.length} </span>}<span className={'badge'+(x.solved?' ok':'')}>{x.solved?'✓ Solved':'Unsolved'}</span></span></div></div>)}
            {!list.length&&<div className="empty">No challenges match these filters.<br/><button className="btn alt sm" style={{marginTop:10}} onClick={()=>setF({cat:'',d:'',s:'',p:'a',q:''})}>Clear filters</button></div>}</div></section>
      </div></div>
    {sel&&<Modal c={sel} onClose={()=>setOpen(null)} onSolved={load}/>}</Shell>;}
