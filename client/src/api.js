const ck=n=>(document.cookie.split('; ').find(r=>r.startsWith(n+'='))||'').split('=')[1]||'';
export async function api(url,o={}){
  const init={method:o.method||'GET',headers:{'x-csrf-token':ck('csrf')},credentials:'same-origin'};
  if(o.json){init.headers['Content-Type']='application/json';init.body=JSON.stringify(o.json);}
  if(o.form)init.body=o.form;
  const r=await fetch(url,init);let d={};try{d=await r.json()}catch{}
  return{ok:r.ok,status:r.status,d};}
export const fmt=d=>d?new Date(d).toLocaleString():'-';
export const kb=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
export const go=h=>{location.hash=h;};
export const logout=async()=>{await api('/api/logout',{method:'POST'});go('');};
