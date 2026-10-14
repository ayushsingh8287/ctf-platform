import {useEffect,useRef} from 'react';
// Falling-code background. Skipped automatically for users who prefer reduced motion.
export default function Matrix(){
  const ref=useRef();
  useEffect(()=>{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const c=ref.current,x=c.getContext('2d'),size=16,chars='ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789{}<>/#$';
    let w,h,drops;
    const init=()=>{w=c.width=innerWidth;h=c.height=innerHeight;drops=Array.from({length:Math.ceil(w/size)},()=>Math.random()*h/size);};
    const draw=()=>{
      x.fillStyle='rgba(2,10,6,.07)';x.fillRect(0,0,w,h);x.font=size+'px monospace';
      drops.forEach((d,i)=>{
        x.fillStyle=Math.random()>.97?'#b6ffc8':'#00ff41'; // occasional bright head
        x.fillText(chars[Math.floor(Math.random()*chars.length)],i*size,d*size);
        drops[i]=d*size>h&&Math.random()>.975?0:d+1;});};
    init();addEventListener('resize',init);const id=setInterval(draw,60);
    return()=>{clearInterval(id);removeEventListener('resize',init);};
  },[]);
  return <canvas ref={ref} className="rain" aria-hidden="true"/>;}
