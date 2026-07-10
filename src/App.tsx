import { useState, useEffect, useRef, useCallback, useId, useMemo, lazy, Suspense } from 'react'
import {
  G, R, O,
  ALL_ACH, ACH_PUBLIC,
  isGuestId, writeGuestTelemetry,
  type Ach,
} from './data'
import { S, detectLang, type Lang } from './locale'

// ── Лениво-загружаемые модалки (загрузятся при первом открытии) ──
const AchModal      = lazy(() => import('./Modals').then(m => ({ default: m.AchModal })))
const RoundAchModal = lazy(() => import('./Modals').then(m => ({ default: m.RoundAchModal })))
const StatsModal    = lazy(() => import('./Modals').then(m => ({ default: m.StatsModal })))
const TutorialModal = lazy(() => import('./Modals').then(m => ({ default: m.TutorialModal })))

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string
        version: string
        initDataUnsafe: {
          user?: { id:number; first_name:string; last_name?:string; username?:string }
          chat?: { id:number; type:string; title:string }
        }
        ready:()=>void; expand:()=>void
        requestFullscreen?:()=>void
        disableVerticalSwipes?:()=>void
        enableClosingConfirmation?:()=>void
        contentSafeAreaInset?:{ top:number; bottom:number; left:number; right:number }
        safeAreaInset?:{ top:number; bottom:number; left:number; right:number }
        onEvent?:(event:string, callback:()=>void)=>void
        offEvent?:(event:string, callback:()=>void)=>void
        HapticFeedback: {
          impactOccurred:(s:'light'|'medium'|'heavy')=>void
          notificationOccurred:(t:'error'|'success'|'warning')=>void
        }
        openTelegramLink:(url:string)=>void
      }
    }
    __bgFlash?:(color:'green'|'red'|'violet'|'cyan')=>void
    __bgSparks?:(x:number,y:number,color:[number,number,number],n:number)=>void
  }
}

// ════════ ПАЛИТРА ════════
const V = { main:'#c79bff', deep:'#7d3df0', glow:'rgba(199,155,255,.55)', fill:'rgba(14,6,32,.62)', dot:'#c79bff' }
const C = { main:'#5ce1ff', deep:'#1c8ed0', glow:'rgba(92,225,255,.55)',   fill:'rgba(6,18,30,.62)',  dot:'#5ce1ff' }
// G, R, O — импортированы из './data'

// ════════ ГОСТЕВЫЕ ИМЕНА ════════
const ADJ_RU = ['Хитрый','Быстрый','Дерзкий','Острый','Дикий','Ловкий','Тёмный','Яростный','Стремительный','Безумный','Голодный','Гордый','Смелый','Ледяной','Хмурый']
const NOUN_RU= ['Лис','Орёл','Тигр','Волк','Медведь','Сокол','Рысь','Ягуар','Кобра','Дракон','Феникс','Единорог','Кракен','Самурай','Левиафан']
const ADJ_EN = ['Sly','Swift','Bold','Sharp','Wild','Nimble','Dark','Fierce','Rapid','Crazy','Hungry','Proud','Brave','Frosty','Grim']
const NOUN_EN= ['Fox','Eagle','Tiger','Wolf','Bear','Falcon','Lynx','Jaguar','Cobra','Dragon','Phoenix','Unicorn','Kraken','Samurai','Leviathan']
const randomGuest = (lang:'ru'|'en'='ru') => {
  const A=lang==='en'?ADJ_EN:ADJ_RU,N=lang==='en'?NOUN_EN:NOUN_RU
  return `${A[Math.floor(Math.random()*A.length)]}${N[Math.floor(Math.random()*N.length)]}${Math.floor(Math.random()*90)+10}`
}

// ════════ ЗВУКИ (blip/noise синтез из архива) ════════
let _actx: AudioContext|null = null
function getCtx():AudioContext|null {
  try { if(!_actx)_actx=new AudioContext(); if(_actx.state==='suspended')_actx.resume(); return _actx } catch{return null}
}
function blip({freq=440,dur=0.08,type='square' as OscillatorType,gain=0.08,slide=0}={}){
  const c=getCtx();if(!c)return;const t=c.currentTime,o=c.createOscillator(),g=c.createGain()
  o.type=type;o.frequency.setValueAtTime(freq,t)
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide),t+dur)
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.005);g.gain.exponentialRampToValueAtTime(.0001,t+dur)
  o.connect(g).connect(c.destination);o.start(t);o.stop(t+dur+.02)
}
function noise({dur=0.12,gain=0.05}={}){
  const c=getCtx();if(!c)return;const t=c.currentTime
  const buf=c.createBuffer(1,c.sampleRate*dur,c.sampleRate)
  const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length)
  const s=c.createBufferSource();s.buffer=buf
  const g=c.createGain();g.gain.value=gain
  const f=c.createBiquadFilter();f.type='highpass';f.frequency.value=800
  s.connect(f).connect(g).connect(c.destination);s.start()
}
function initAudio(){getCtx()}
const Snd={
  enabled:true,
  click()  {if(!this.enabled)return;blip({freq:720,dur:.04,gain:.05})},
  tick()   {if(!this.enabled)return;blip({freq:1200,dur:.02,gain:.025,type:'triangle'})},
  correct(){if(!this.enabled)return;blip({freq:660,dur:.09,type:'sawtooth',gain:.06});setTimeout(()=>blip({freq:990,dur:.12,type:'sawtooth',gain:.06}),70);setTimeout(()=>blip({freq:1320,dur:.16,type:'sawtooth',gain:.06}),150)},
  wrong()  {if(!this.enabled)return;blip({freq:220,dur:.18,type:'square',gain:.07,slide:-120});setTimeout(()=>noise({dur:.08,gain:.04}),60)},
  achieve(){if(!this.enabled)return;[523,659,784,1047].forEach((f,i)=>setTimeout(()=>blip({freq:f,dur:.1,type:'triangle',gain:.05}),i*70))},
  levelup(){if(!this.enabled)return;[523,659,784,1047].forEach((f,i)=>setTimeout(()=>blip({freq:f,dur:.12,type:'sawtooth',gain:.06}),i*80))},
  timeup() {if(!this.enabled)return;[880,660,440,220].forEach((f,i)=>setTimeout(()=>blip({freq:f,dur:.18,type:'sawtooth',gain:.07}),i*110))},
  fanfare1(){if(!this.enabled)return;[523,659,784,1047,784,1047,1175,1047].forEach((f,i)=>setTimeout(()=>blip({freq:f,dur:.2,type:'sawtooth',gain:.07}),i*100));setTimeout(()=>[523,659,784].forEach(f=>blip({freq:f,dur:.5,type:'triangle',gain:.05})),900)},
  fanfare2(){if(!this.enabled)return;[523,659,784,1047,784,1047].forEach((f,i)=>setTimeout(()=>blip({freq:f,dur:.18,type:'sawtooth',gain:.07}),i*100))},
  fanfare3(){if(!this.enabled)return;[523,659,784,1047].forEach((f,i)=>setTimeout(()=>blip({freq:f,dur:.15,type:'sawtooth',gain:.06}),i*100))},
  tync(p=0){if(!this.enabled)return
    const c=getCtx();if(!c)return;const now=c.currentTime
    const base=[1046,880,698][p]??1046
    // ① Острый транзиент — «щелчок» удара
    blip({freq:base*4.2,dur:.006,gain:.2,type:'square'})
    // ② Фундаментал — долгий синус с setTargetAtTime (звук маримбы/колокола)
    ;(()=>{const o=c.createOscillator(),g=c.createGain()
      o.type='sine';o.frequency.value=base
      g.gain.setValueAtTime(.22,now+.001);g.gain.setTargetAtTime(0,now+.008,.09)
      o.connect(g).connect(c.destination);o.start(now);o.stop(now+.8)})()
    // ③ Октава — теплота
    ;(()=>{const o=c.createOscillator(),g=c.createGain()
      o.type='sine';o.frequency.value=base*2
      g.gain.setValueAtTime(.09,now+.001);g.gain.setTargetAtTime(0,now+.004,.05)
      o.connect(g).connect(c.destination);o.start(now);o.stop(now+.4)})()
    // ④ Негармонический обертон ~4.1x — характер ксилофона/маримбы
    ;(()=>{const o=c.createOscillator(),g=c.createGain()
      o.type='sine';o.frequency.value=base*4.1
      g.gain.setValueAtTime(.07,now+.001);g.gain.setTargetAtTime(0,now+.002,.022)
      o.connect(g).connect(c.destination);o.start(now);o.stop(now+.12)})()
    // ⑤ Только для p=0 (SCORE): восходящий блеск после удара
    if(p===0){
      setTimeout(()=>blip({freq:base*1.5,dur:.06,gain:.05,type:'triangle'}),28)
      setTimeout(()=>blip({freq:base*2,  dur:.05,gain:.04,type:'triangle'}),55)
    }
  },
}

// ════════ CANVAS ФОН ════════
function BgCanvas({density=200,parallax=0.8,speed=1}:{density?:number;parallax?:number;speed?:number}){
  const cvRef=useRef<HTMLCanvasElement>(null)
  const st=useRef({mx:0,my:0,cx:0,cy:0,flashAt:0,flashColor:[0.36,1,.63] as [number,number,number]})
  useEffect(()=>{
    window.__bgFlash=(color)=>{
      const m:{[k:string]:[number,number,number]}={green:[.36,1,.63],red:[1,.23,.37],violet:[.78,.61,1],cyan:[.36,.88,1]}
      st.current.flashColor=m[color]||m.green;st.current.flashAt=performance.now()
    }
    return()=>{delete window.__bgFlash}
  },[])
  useEffect(()=>{
    const cv=cvRef.current;if(!cv)return
    const ctx=cv.getContext('2d',{alpha:true})!
    let raf=0,w=0,h=0,dpr=1,stars:any[]=[],parts:any[]=[]
    const resize=()=>{dpr=Math.min(window.devicePixelRatio||1,2);w=cv.clientWidth;h=cv.clientHeight;cv.width=Math.floor(w*dpr);cv.height=Math.floor(h*dpr)}
    const seed=()=>{
      stars=[];parts=[]
      const NS=Math.floor(density*.55),NP=density-NS
      for(let i=0;i<NS;i++)stars.push({x:Math.random()*w,y:Math.random()*h,z:Math.random()*.95+.05,tw:Math.random()*Math.PI*2,tws:.5+Math.random()*2,hue:Math.random()<.5?'v':'c'})
      for(let i=0;i<NP;i++)parts.push({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.12,vy:-.03-Math.random()*.12,z:Math.random()*.85+.15,r:.25+Math.random()*.7,hue:Math.random()<.5?'v':'c',life:Math.random()*3000})
    }
    resize();seed()
    const ro=new ResizeObserver(()=>{resize();seed()});ro.observe(cv)
    const onMouse=(e:any)=>{const x=(e.touches?e.touches[0].clientX:e.clientX)/window.innerWidth,y=(e.touches?e.touches[0].clientY:e.clientY)/window.innerHeight;st.current.mx=(x-.5)*2;st.current.my=(y-.5)*2}
    const onTilt=(e:any)=>{if(e.beta==null)return;st.current.mx=Math.max(-1,Math.min(1,(e.gamma||0)/30));st.current.my=Math.max(-1,Math.min(1,((e.beta||0)-30)/30))}
    window.addEventListener('mousemove',onMouse);window.addEventListener('touchmove',onMouse,{passive:true});window.addEventListener('deviceorientation',onTilt)
    let last=performance.now()
    const frame=(now:number)=>{
      const dt=Math.min(48,now-last)*speed;last=now
      const s=st.current;s.cx+=(s.mx-s.cx)*.08;s.cy+=(s.my-s.cy)*.08
      const px=s.cx*parallax,py=s.cy*parallax,W=cv.width,H=cv.height
      ctx.clearRect(0,0,W,H)
      const grd=ctx.createRadialGradient(W*.5-px*40*dpr,H*.4-py*40*dpr,0,W*.5,H*.5,Math.max(W,H)*.7)
      grd.addColorStop(0,'rgba(40,18,80,.5)');grd.addColorStop(.5,'rgba(15,8,40,.22)');grd.addColorStop(1,'rgba(5,4,16,0)')
      ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);ctx.globalCompositeOperation='lighter'
      for(const s2 of stars){s2.tw+=dt*.002*s2.tws;const tw=.5+.5*Math.sin(s2.tw),x=(s2.x-px*30*s2.z)*dpr,y=(s2.y-py*30*s2.z)*dpr,r=(.18+s2.z*.7)*dpr*(.6+tw*.6),a=(.18+s2.z*.55)*(.5+tw*.5),col=s2.hue==='v'?[199,155,255]:[92,225,255];ctx.fillStyle=`rgba(${col[0]},${col[1]},${col[2]},${a})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
      for(const p of parts){p.x+=p.vx*dt*.06;p.y+=p.vy*dt*.06;p.life+=dt;if(p.y<-10){p.y=h+10;p.x=Math.random()*w};if(p.x<-10)p.x=w+10;else if(p.x>w+10)p.x=-10;const x=(p.x-px*60*p.z)*dpr,y=(p.y-py*60*p.z)*dpr,r=p.r*dpr*(.6+p.z*.5),col=p.hue==='v'?[199,155,255]:[92,225,255],a=.25+.3*Math.sin(p.life*.002),g2=ctx.createRadialGradient(x,y,0,x,y,r*4);g2.addColorStop(0,`rgba(${col[0]},${col[1]},${col[2]},${a*.6})`);g2.addColorStop(1,`rgba(${col[0]},${col[1]},${col[2]},0)`);ctx.fillStyle=g2;ctx.beginPath();ctx.arc(x,y,r*4,0,Math.PI*2);ctx.fill();ctx.fillStyle=`rgba(255,255,255,${Math.min(.9,a+.1)})`;ctx.beginPath();ctx.arc(x,y,r*.55,0,Math.PI*2);ctx.fill()}
      ctx.globalCompositeOperation='source-over'
      const fa=now-s.flashAt
      if(fa<600){const t2=fa/600,al=(1-t2)*.55,c=s.flashColor,gf=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*.8);gf.addColorStop(0,`rgba(${c[0]*255|0},${c[1]*255|0},${c[2]*255|0},${al})`);gf.addColorStop(1,`rgba(${c[0]*255|0},${c[1]*255|0},${c[2]*255|0},0)`);ctx.fillStyle=gf;ctx.fillRect(0,0,W,H)}
      raf=requestAnimationFrame(frame)
    }
    raf=requestAnimationFrame(frame)
    return()=>{cancelAnimationFrame(raf);ro.disconnect();window.removeEventListener('mousemove',onMouse);window.removeEventListener('touchmove',onMouse);window.removeEventListener('deviceorientation',onTilt)}
  },[density,parallax,speed])
  return <canvas ref={cvRef} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block',zIndex:0,pointerEvents:'none'}}/>
}

// ════════ СПАРКИ (поверх контента, z:100) ════════
function SparksCanvas(){
  const cvRef=useRef<HTMLCanvasElement>(null)
  const sparks=useRef<any[]>([])
  useEffect(()=>{
    const cv=cvRef.current;if(!cv)return
    let dpr=1
    const resize=()=>{dpr=Math.min(window.devicePixelRatio||1,2);cv.width=Math.floor(cv.clientWidth*dpr);cv.height=Math.floor(cv.clientHeight*dpr)}
    resize();const ro=new ResizeObserver(resize);ro.observe(cv)
    window.__bgSparks=(cx,cy,color,n)=>{
      const r=cv.getBoundingClientRect()
      const bx=(cx-r.left)*dpr,by=(cy-r.top)*dpr
      const pw=cv.width,ph=cv.height
      for(let i=0;i<n;i++){
        const x=bx+(Math.random()-.5)*pw*.04
        const y=by+(Math.random()-.5)*ph*.04
        const ang=-Math.random()*Math.PI   // верхняя полусфера → летят вверх от кнопки
        const spd=3+Math.random()*8
        sparks.current.push({x,y,vx:Math.cos(ang)*spd*dpr,vy:Math.sin(ang)*spd*dpr,life:0,maxLife:700+Math.random()*600,color,size:(1.5+Math.random()*2.5)*dpr})
      }
    }
    const ctx=cv.getContext('2d',{alpha:true})!
    let raf=0,last=performance.now()
    const frame=(now:number)=>{
      const dt=Math.min(48,now-last);last=now
      const W=cv.width,H=cv.height
      ctx.clearRect(0,0,W,H)
      const sp=sparks.current
      if(sp.length){
        ctx.globalCompositeOperation='lighter'
        for(let i=sp.length-1;i>=0;i--){
          const sk=sp[i]
          sk.life+=dt;sk.x+=sk.vx;sk.y+=sk.vy;sk.vx*=.96;sk.vy*=.96;sk.vy+=.04*dpr
          const t=sk.life/sk.maxLife;if(t>=1){sp.splice(i,1);continue}
          const al=1-t,rr=sk.size*(1-t*.5),c=sk.color
          const g=ctx.createRadialGradient(sk.x,sk.y,0,sk.x,sk.y,rr*5)
          g.addColorStop(0,`rgba(${c[0]*255|0},${c[1]*255|0},${c[2]*255|0},${al})`)
          g.addColorStop(1,`rgba(${c[0]*255|0},${c[1]*255|0},${c[2]*255|0},0)`)
          ctx.fillStyle=g;ctx.beginPath();ctx.arc(sk.x,sk.y,rr*5,0,Math.PI*2);ctx.fill()
          ctx.globalCompositeOperation='source-over'
          ctx.fillStyle=`rgba(255,255,255,${al})`
          ctx.beginPath();ctx.arc(sk.x,sk.y,rr*.7,0,Math.PI*2);ctx.fill()
          ctx.globalCompositeOperation='lighter'
        }
        ctx.globalCompositeOperation='source-over'
      }
      raf=requestAnimationFrame(frame)
    }
    raf=requestAnimationFrame(frame)
    return()=>{cancelAnimationFrame(raf);ro.disconnect();delete window.__bgSparks}
  },[])
  return <canvas ref={cvRef} style={{position:'fixed',inset:0,width:'100%',height:'100%',display:'block',zIndex:100,pointerEvents:'none'}}/>
}

// ════════ РАМКА ПАНЕЛИ ════════
function buildFramePath(){
  const W=600,H=200,M=4,R=22,NW=80,ND=22,SI_W=14,SI_H=36,cx=W/2
  return [
    `M ${M+R} ${M}`,
    `L ${cx-NW/2} ${M}`,`L ${cx} ${M+ND}`,`L ${cx+NW/2} ${M}`,
    `L ${W-M-R} ${M}`,`A ${R} ${R} 0 0 1 ${W-M} ${M+R}`,
    `L ${W-M} ${H/2-SI_H/2}`,`A ${SI_W} ${SI_H/2} 0 0 0 ${W-M} ${H/2+SI_H/2}`,
    `L ${W-M} ${H-M-R}`,`A ${R} ${R} 0 0 1 ${W-M-R} ${H-M}`,
    `L ${cx+NW/2} ${H-M}`,`L ${cx} ${H-M-ND}`,`L ${cx-NW/2} ${H-M}`,
    `L ${M+R} ${H-M}`,`A ${R} ${R} 0 0 1 ${M} ${H-M-R}`,
    `L ${M} ${H/2+SI_H/2}`,`A ${SI_W} ${SI_H/2} 0 0 0 ${M} ${H/2-SI_H/2}`,
    `L ${M} ${M+R}`,`A ${R} ${R} 0 0 1 ${M+R} ${M}`,`Z`
  ].join(' ')
}
const FRAME_PATH=buildFramePath()

function DotGrid({color}:{color:string}){
  const dots=[];for(let r=0;r<3;r++)for(let c=0;c<8;c++){const dist=Math.hypot(c,r),rad=c<2&&r<1?1.6:c<4?1.4:1.1,a=Math.max(.25,(.95-dist*.07));dots.push(<circle key={`${r}-${c}`} cx={470+c*11} cy={152+r*9} r={rad} fill={color} opacity={a*.6}/>)}
  return <g>{dots}</g>
}
function CornerCaps({color}:{color:string}){
  return <g>{([[26,6],[574,6],[574,194],[26,194]] as [number,number][]).map(([x,y],i)=><circle key={i} cx={x} cy={y} r={1.6} fill={color} opacity={.9}/>)}</g>
}

function NeonPanel({value,color,diffIdx,flashCls}:{value:string;color:'violet'|'cyan';diffIdx:number[];flashCls:string}){
  const uid=useId()
  const p=color==='violet'?V:C
  return(
    <div className={`np-wrap ${flashCls}`} style={{'--np-stroke':p.main,'--np-glow':p.glow,'--np-fill':p.fill} as React.CSSProperties}>
      <svg className="np-frame" viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`nps-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={p.main} stopOpacity="1"/>
            <stop offset="50%" stopColor={p.main} stopOpacity=".85"/>
            <stop offset="100%" stopColor={p.deep} stopOpacity="1"/>
          </linearGradient>
          <radialGradient id={`npf-${uid}`} cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor={p.fill} stopOpacity=".9"/>
            <stop offset="100%" stopColor="rgba(2,1,8,.85)" stopOpacity="1"/>
          </radialGradient>
          <filter id={`npg-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3"/>
          </filter>
        </defs>
        <path d={FRAME_PATH} fill="none" stroke={p.main} strokeWidth="3" opacity=".55" filter={`url(#npg-${uid})`}/>
        <path d={FRAME_PATH} fill={`url(#npf-${uid})`}/>
        <path d={FRAME_PATH} fill="none" stroke={`url(#nps-${uid})`} strokeWidth="1.6" strokeLinejoin="round"/>
        <DotGrid color={p.dot}/>
        <CornerCaps color={p.main}/>
      </svg>
      <div className="np-content">
        <div className="np-ghost" style={value.length>=9?{fontSize:'clamp(30px,9.5vw,59px)'}:undefined}>{'8'.repeat(value.length)}</div>
        <div className="np-num" style={value.length>=9?{fontSize:'clamp(30px,9.5vw,59px)'}:undefined}>{value.split('').map((c,i)=><span key={i} className={diffIdx.includes(i)?'np-diff':''}>{c}</span>)}</div>
      </div>
    </div>
  )
}

function VSDivider(){
  return(
    <div className="vs-row">
      <span className="vs-line vs-l"/>
      <span className="vs-circle"><span className="vs-text">VS</span><span className="vs-ring"/></span>
      <span className="vs-line vs-r"/>
    </div>
  )
}

function StatHUD({score,setScore,time,level,deltaKey,lastDelta,bonus,penalty,grace,graceCount,lang}:{score:number;setScore:(v:number|((s:number)=>number))=>void;time:number;level:number;deltaKey:number;lastDelta:number;bonus:number;penalty:number;grace?:boolean;graceCount?:number;lang:Lang}){
  const t=S[lang]
  const tc=time>30?G:time>10?O:R,pct=Math.max(0,Math.min(1,time/120))*100
  const m=Math.floor(time/60),s=time%60
  const left=3-(graceCount||0)
  return(
    <div className="hud-wrap">
      <div className="hud-cell hud-side">
        <div className="hud-lbl">{t.score}</div>
        <div className="hud-val hud-violet">{score.toLocaleString('ru-RU')}</div>
      </div>
      <div className="hud-cell hud-mid">
        <div className="hud-lbl">{t.time}</div>
        <div className="hud-time" style={{color:grace?O:tc,textShadow:`0 0 16px ${grace?O:tc},0 0 32px ${grace?O:tc}88`}}>{grace?'⏸':''}{m}:{String(s).padStart(2,'0')}</div>
        <div className="hud-bar"><div className="hud-fill" style={{width:`${pct}%`,background:grace?O:tc,boxShadow:`0 0 10px ${grace?O:tc}`}}/><div className="hud-tick" style={{left:'33%'}}/><div className="hud-tick" style={{left:'66%'}}/></div>
        {grace
          ?<div className="hud-grace">{t.graceMore} {left} {left===1?'✓':'✓✓✓'.slice(0,left)} {t.graceFor}</div>
          :<div className="hud-deltas"><span style={{color:G}}>+{bonus}{lang==='ru'?'с':'s'}</span><span style={{color:R}}>−{penalty}{lang==='ru'?'с':'s'}</span></div>
        }
        {lastDelta!==0&&<div key={deltaKey} className={`hud-pop ${lastDelta>0?'pos':'neg'}`}>{lastDelta>0?'+':''}{lastDelta}{lang==='ru'?'с':'s'}</div>}
      </div>
      <div className="hud-cell hud-side hud-side-right">
        <div className="hud-lbl">{t.level}</div>
        <div className="hud-val hud-cyan">{level}</div>
      </div>
      <span className="hc tl"/><span className="hc tr"/><span className="hc bl"/><span className="hc br"/>
    </div>
  )
}

function AnswerBtn({kind,onClick,disabled,lang,tok=''}:{kind:'diff'|'same';onClick:()=>void;disabled:boolean;lang:Lang;tok?:string}){
  const isDiff=kind==='diff'
  const t=S[lang]
  const p=isDiff?{main:R,deep:'#a01030',glow:'rgba(255,58,94,.55)',sparkColor:[1,.23,.37] as [number,number,number]}:{main:G,deep:'#1c8a55',glow:'rgba(77,255,161,.55)',sparkColor:[.3,1,.63] as [number,number,number]}
  const handlePointerDown=(e:React.PointerEvent)=>{
    if(disabled)return
    window.__bgSparks?.(e.clientX,e.clientY,p.sparkColor,36)
  }
  const handleClick=()=>{if(!disabled)onClick()}
  return(
    <button className={`ab ab-${kind}${tok?` ab-t-${tok}`:''}`} onPointerDown={handlePointerDown} onClick={handleClick} disabled={disabled} style={{'--ab-main':p.main,'--ab-deep':p.deep,'--ab-glow':p.glow} as React.CSSProperties}>
      <svg className="ab-frame" viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={`abg-${kind}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={p.main} stopOpacity=".95"/><stop offset="100%" stopColor={p.deep} stopOpacity=".85"/></linearGradient></defs>
        <path d="M 12 4 L 188 4 L 196 12 L 196 64 L 188 72 L 12 72 L 4 64 L 4 12 Z" fill="rgba(7,5,18,.75)" stroke={`url(#abg-${kind})`} strokeWidth="1.8"/>
        <path d="M 12 4 L 26 4 M 4 12 L 4 26" stroke={p.main} strokeWidth="2.5"/>
        <path d="M 188 4 L 174 4 M 196 12 L 196 26" stroke={p.main} strokeWidth="2.5"/>
        <path d="M 12 72 L 26 72 M 4 64 L 4 50" stroke={p.main} strokeWidth="2.5"/>
        <path d="M 188 72 L 174 72 M 196 64 L 196 50" stroke={p.main} strokeWidth="2.5"/>
      </svg>
      <span className="ab-inner">
        <span className="ab-sign">{isDiff?'≠':'='}</span>
        <span className="ab-lbl">{isDiff?t.differ:t.equal}</span>
      </span>
    </button>
  )
}

// Ach, ALL_ACH, CAT_NAMES, CAT_ORDER, ACH_PUBLIC — импортированы из './data'

// ─── LIFETIME TRACKERS (localStorage) ───
// Хранят накопительную статистику для секретных и социальных ачивок.
// Никаких новых сетевых запросов — всё локально, чтобы не сломать игру.
const LT_KEY={
  shares:'nm_lt_shares',           // число шеров
  totalAns:'nm_lt_totalAns',       // всего ответов за всё время
  mandela:'nm_lt_mandela',         // ложных «≠» на одинаковых
  hh33:'nm_lt_hh33',               // завершений в HH:33
  days:'nm_lt_days',               // JSON: ['YYYY-MM-DD',...] (последние 60)
}
const ltGet=(k:string,d=0):number=>{const v=localStorage.getItem(k);return v?parseInt(v)||d:d}
const ltInc=(k:string,by=1):number=>{const v=ltGet(k)+by;localStorage.setItem(k,String(v));return v}
const ltDays=():string[]=>{try{return JSON.parse(localStorage.getItem(LT_KEY.days)||'[]')}catch{return[]}}
const ltAddDay=()=>{const d=new Date().toISOString().slice(0,10);const cur=ltDays();if(cur[cur.length-1]!==d){cur.push(d);while(cur.length>60)cur.shift();localStorage.setItem(LT_KEY.days,JSON.stringify(cur))}}
function ltDayStreak():number{
  const ds=ltDays();if(!ds.length)return 0
  let cnt=1;for(let i=ds.length-1;i>0;i--){
    const a=new Date(ds[i]),b=new Date(ds[i-1])
    const diff=Math.round((+a-+b)/86400000)
    if(diff===1)cnt++; else break
  }
  return cnt
}
// in-game check: score, level, streak (called during play)
function checkNew(s:number,l:number,streak:number,ul:Set<string>):Ach[]{
  const m:Record<string,boolean>={
    s30000:s>=30000,s50000:s>=50000,s75000:s>=75000,s100000:s>=100000,s150000:s>=150000,
    l8:l>=8,l15:l>=15,l20:l>=20,l30:l>=30,l35:l>=35,last_witness:l>=50,
    str20:streak>=20,str40:streak>=40,str75:streak>=75,str150:streak>=150,
  }
  return ALL_ACH.filter(a=>m[a.id]!==undefined&&m[a.id]&&!ul.has(a.id))
}
// end-of-game check: per-session stats + rank
function checkEndGame(p:{
  score:number;level:number;errCt:number;apm:number;stabilityDrop:number|null
  last30Acc:number|null;last30Correct:number;last30ErrCt:number
  last15Correct:number;last10Acc:number|null;last10Count:number
  maxRecov:number;rank:number;rankPool:number;gamesPlayed:number
  lastBreath:boolean;zeroAns:boolean;lostSignal:boolean;maxTimeReached:number
  maxLevel:number;sessionSec:number;sessionAns:number;redZoneSec:number
  recov25Hit:boolean;recov20Hard:boolean;adrenalineHit:boolean
  deepScanCount:number
  autism50Hit:boolean;orientLandscapeSec:number
  shareCount:number;dayStreak:number;daysPlayed:number
  totalAnswers:number;mandelaCount:number;hh33Count:number
},ul:Set<string>):Ach[]{
  const {score:s,level:l,errCt:e,apm,stabilityDrop:sd,last30Acc:l30a,last30Correct:l30c,last30ErrCt:l30e,
    last15Correct:l15c,last10Acc:l10a,last10Count:l10n,
    maxRecov:mr,rank,rankPool:rp,gamesPlayed:gp,lastBreath:lb,zeroAns:za,lostSignal:ls,maxTimeReached:mt,
    maxLevel:ml,sessionSec:ss,sessionAns:sa,redZoneSec:rzs,recov25Hit:r25,recov20Hard:r20h,adrenalineHit:ah,
    deepScanCount:dsc,autism50Hit:a50,orientLandscapeSec:ols,
    shareCount:sc,dayStreak:ds,daysPlayed:dp,totalAnswers:ta,mandelaCount:mc,hh33Count:h33}=p
  const m:Record<string,boolean>={
    apm30:apm>=30&&ml>=5,apm40:apm>=40&&ml>=5,apm50:apm>=50&&ml>=5,
    clean:e===0&&ml>10,
    stab2:sd!==null&&Math.abs(sd)<=2&&sa>=50,
    twilight:sd!==null&&sd<0&&ml>=13,
    red_line:e>0&&l30e===0&&l30c>=1,
    last_rush:l15c>=10,
    pressure:l10a!==null&&l10a>=95&&l10n>=3,
    last_breath:lb,
    recov10:mr>=20,          // «Собраться» — 20 правильных после ошибки
    recov20:r20h,            // «Железная воля» — 25 правильных в жёстких условиях
    recov25:r25,             // «Эхо ошибки» — 25 при timer<45
    adrenaline:ah,
    rank100:rank>=1&&rank<=100&&gp>=50,
    rank10:rank>=1&&rank<=10&&gp>=50,
    rank1:rank===1&&gp>=50,
    eff50:s>=50000&&gp>=1&&gp<10,
    eff100:s>=100000&&gp>=1&&gp<20,
    first30:s>=30000&&gp===1,
    marty:mt>140,
    emmet:mt>160,
    delorean:mt>180,
    absolute:e===0&&ml>=20&&s>=100000,
    stable30:l30a!==null&&l30a>=90&&ss>=240,
    deep_scan:dsc>=20,
    autism50:a50,
    silence:rzs>=90&&e===0,
    lost_signal:ls,
    zero_ans:za,
    rotate3:ols>=180,
    share1:false, // выдаётся только в момент шера через shareResult()
    static7:ds>=7,
    white_noise:dp>=30,
    ghost666:ta>=666,
    mandela:mc>=100,
    feedback333:h33>=3,
    // ref1/ref5/ref10, group_add, group_play — backend-driven (placeholder false here)
  }
  return ALL_ACH.filter(a=>m[a.id]!==undefined&&m[a.id]&&!ul.has(a.id))
}

type Phase='start'|'playing'|'paused'|'gameOver'
interface Entry{userId:string;name:string;score:number;date:string;gamesPlayed?:number;gamesAtRecord?:number}
interface Pair {n1:string;n2:string;same:boolean}
interface FB   {correct:boolean;diffIdx:number[]}

const TIMER=120,TIMER_PRACTICE=45,PER_LVL=5
function diff(lv:number){if(lv<=3)return{bonus:3,penalty:15};if(lv<=6)return{bonus:2,penalty:18};if(lv<=9)return{bonus:2,penalty:22};if(lv<=12)return{bonus:1,penalty:25};return{bonus:1,penalty:30}}
const digits=(l:number)=>l<=3?6:l<=6?7:l<=9?8:9
const pts=(l:number)=>l<=3?100:l<=6?200:l<=9?350:l<=12?500:700

function makePair(lv:number):Pair{
  const len=digits(lv),arr=Array.from({length:len},(_,i)=>i===0?String(Math.ceil(Math.random()*9)):String(Math.floor(Math.random()*10)))
  const n1=arr.join('');if(Math.random()<.5)return{n1,n2:n1,same:true}
  const n2=[...arr];Array.from({length:len},(_,i)=>i).sort(()=>Math.random()-.5).slice(0,Math.random()<.65?1:2).forEach(pos=>{let d:string;do{d=pos===0?String(Math.ceil(Math.random()*9)):String(Math.floor(Math.random()*10))}while(d===n2[pos]);n2[pos]=d})
  return{n1,n2:n2.join(''),same:false}
}
const calcDiff=(a:string,b:string)=>Array.from({length:Math.max(a.length,b.length)},(_,i)=>i).filter(i=>a[i]!==b[i])

const fetchBoard=async():Promise<Entry[]>=>{try{const r=await fetch('/api/leaderboard');if(!r.ok)return[];const d=await r.json();return Array.isArray(d)?d:[]}catch{return[]}}
const fetchGroupBoard=async(gid:string):Promise<Entry[]>=>{try{const r=await fetch(`/api/leaderboard?group=${encodeURIComponent(gid)}`);if(!r.ok)return[];const d=await r.json();return Array.isArray(d)?d:[]}catch{return[]}}
const saveScore=async(u:string,n:string,s:number,gids?:string[],sessionSec?:number,apm?:number)=>{
  try{
    const body:Record<string,unknown>={userId:u,name:n,score:s}
    if(gids&&gids.length>0){body.groupId=gids[0];body.groupIds=gids}
    if(sessionSec!=null)body.sessionSec=sessionSec
    if(apm!=null)body.apm=Math.round(apm)
    return await(await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json()
  }catch{return{status:'error',wasNewRecord:false,wasNewGroupRecord:false}}
}
const loadAch=async(u:string):Promise<string[]>=>{try{return(await(await fetch(`/api/achievements/${encodeURIComponent(u)}`)).json()).achievements||[]}catch{return[]}}
const saveAch=async(u:string,a:string[],gid?:string)=>{try{await fetch('/api/achievements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:u,achievements:a,groupId:gid})})}catch{}}
const haptic=(type:'success'|'error'|'light')=>{
  try{
    const tg=window.Telegram?.WebApp
    if(tg&&parseFloat(tg.version||'0')>=6.1){
      type==='light'?tg.HapticFeedback.impactOccurred('light'):tg.HapticFeedback.notificationOccurred(type)
    }
    // Fallback для старых версий TG и браузеров
    if(type==='light')navigator.vibrate?.(12)
    else if(type==='success')navigator.vibrate?.([25,15,25])
    else navigator.vibrate?.(70)
  }catch{}
}
function openTg(n:string){if(!n.startsWith('@'))return;try{window.Telegram?.WebApp.openTelegramLink(`https://t.me/${n.slice(1)}`)}catch{window.open(`https://t.me/${n.slice(1)}`,'_blank')}}
function maskName(name:string):string{
  const mask=(s:string)=>{
    const l=s.length
    const hide=l>=13?5:l>=9?4:3
    const show=Math.max(2,l-hide)
    return s.slice(0,show)+'***'
  }
  if(name.startsWith('@'))return'@'+mask(name.slice(1))
  return mask(name)
}

// TutorialModal перенесён в ./Modals.tsx (лениво загружается)

// ════════ PRACTICE OVERLAY (подсказки во время тренировки) ════════
// hint: 0=стрелки (до первого нажатия), 1=правильно, 2=ошибка, 3=нейтрально, 10+=скрыт
function PracticeOverlay({hint,lang='ru'}:{hint:number;lang?:Lang}){
  const t=S[lang]
  if(hint>=10)return null
  const [diffLine1,diffLine2]=t.hintNumbersDiffer.split('\n')
  const [eqLine1,eqLine2]=t.hintNumbersEqual.split('\n')
  return(
    <div className="prac-overlay" style={{pointerEvents:'none'}}>
      {hint===0&&(
        <div className="prac-hint-row">
          <div className="prac-hint">
            <div>{diffLine1}<br/><b>{diffLine2}</b></div>
            <div className="prac-hint-arrow">↙</div>
          </div>
          <div className="prac-hint">
            <div>{eqLine1}<br/><b>{eqLine2}</b></div>
            <div className="prac-hint-arrow">↘</div>
          </div>
        </div>
      )}
      {hint===1&&<div className="prac-hint-center" style={{color:'var(--g)'}}>{t.hintCorrect}</div>}
      {hint===2&&<div className="prac-hint-center" style={{color:'var(--r)'}}>{t.hintWrong}</div>}
    </div>
  )
}

function AchToast({ach,onDone,lang='ru'}:{ach:Ach;onDone:()=>void;lang?:Lang}){
  const t=S[lang]
  useEffect(()=>{const t=setTimeout(onDone,5000);return()=>clearTimeout(t)},[])
  return(
    <div className="ach-flow-wrap">
      <div className="ach-flow-toast">
        <div className="ach-flow-glow"/>
        <span className="ach-flow-fire">{ach.icon}</span>
        <div className="ach-flow-body">
          <div className="ach-flow-label">{t.achToastTitle}</div>
          <div className="ach-flow-title">{ach.title}</div>
          <div className="ach-flow-desc">{ach.desc}</div>
        </div>
      </div>
    </div>
  )
}

// ACH_PUBLIC, rarityInfo, RoundAchModal, AchModal, StatsModal, MiniChart,
// fetchTelemetry, DayRec, TutorialModal — вынесены в ./data и ./Modals.tsx

// ════════ ТЕЛЕМЕТРИЯ + СОЦ-API ════════
async function sendTelemetry(userId:string, r:{
  score:number;accuracy:number;apm:number;stabilityDrop:number
  last30Acc:number|null;maxRecov:number;level:number;refBy?:string
}):Promise<{sessionNum:number;counted:boolean}>{
  // Гости — записываем в localStorage, на сервер не дёргаемся
  if(isGuestId(userId)){
    const sessionNum=writeGuestTelemetry({
      score:r.score,accuracy:r.accuracy,apm:r.apm,
      stabilityDrop:r.stabilityDrop,maxRecov:r.maxRecov,level:r.level
    })
    return{sessionNum,counted:true}
  }
  try{
    const res=await fetch('/api/telemetry',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({userId,...r})
    })
    const d=await res.json()
    return{sessionNum:d.sessionNum??1,counted:d.counted??true}
  }catch{
    return{sessionNum:1,counted:true}
  }
}

async function fetchSocial(userId:string):Promise<{refCount:number;hasGroupAdd:boolean;groupPlayers:number}>{
  try{
    const res=await fetch(`/api/social/${encodeURIComponent(userId)}`)
    return await res.json()
  }catch{
    return{refCount:0,hasGroupAdd:false,groupPlayers:0}
  }
}

function BdRow({e,rank,myId,rowRef,allowTgLink=false,maskNames=false,lang='ru'}:{e:Entry;rank:number;myId:string;rowRef?:React.RefObject<HTMLDivElement>;allowTgLink?:boolean;maskNames?:boolean;lang?:Lang}){
  const t=S[lang]
  const isTg=e.name.startsWith('@')
  const displayName=(maskNames&&e.userId!==myId)?maskName(e.name):e.name
  return(
    <div ref={rowRef} className={`bd-row ${e.userId===myId?'me':''}`}>
      <span className="bd-rank">{rank===0?'🥇':rank===1?'🥈':rank===2?'🥉':`#${rank+1}`}</span>
      <span className="bd-name">
        {isTg&&allowTgLink
          ?<button className="tg-link" onClick={()=>openTg(e.name)}>{displayName}</button>
          :displayName}
        {e.userId===myId&&<span className="bd-mebadge">{t.youBadge}</span>}
      </span>
      <span className="bd-score">{(e.score||0).toLocaleString('ru-RU')}</span>
    </div>
  )
}

function BoardRows({list,myId,limit=50,sticky=false,allowTgLink=false,maskNames=false,lang='ru'}:{list:Entry[];myId:string;limit?:number;sticky?:boolean;allowTgLink?:boolean;maskNames?:boolean;lang?:Lang}){
  const t=S[lang]
  const scrollRef=useRef<HTMLDivElement>(null)
  const myRowRef=useRef<HTMLDivElement>(null)
  // true = строка игрока сейчас видна в скролле (оптимистично — скрываем стики по умолчанию)
  const [myRowVisible,setMyRowVisible]=useState(true)
  // true = строка прокручена ВВЕРХ за пределы вьюпорта (стики не нужен — игрок легко доскроллит обратно)
  const [myRowAbove,setMyRowAbove]=useState(false)

  const visible=list.slice(0,limit)
  const myFullIdx=myId?list.findIndex(e=>e.userId===myId):-1
  const myInVisibleSlice=myFullIdx>=0&&myFullIdx<visible.length
  const myEntry=myFullIdx>=0?list[myFullIdx]:null

  // При смене списка/вкладки — сбрасываем (оптимистично, IO уточнит)
  useEffect(()=>{ setMyRowVisible(true);setMyRowAbove(false) },[myId,list.length,myFullIdx])

  // IntersectionObserver: следим только если строка есть в срезе
  useEffect(()=>{
    if(!sticky||!myInVisibleSlice)return
    const row=myRowRef.current,scroll=scrollRef.current
    if(!row||!scroll)return
    const obs=new IntersectionObserver(
      ([entry])=>{
        setMyRowVisible(entry.isIntersecting)
        if(!entry.isIntersecting&&entry.rootBounds){
          // Строка ушла ВВЕРХ, если её верх выше верха скролл-контейнера
          // (при threshold:0.1 IO срабатывает когда видно <10% — низ ещё может быть внутри,
          //  поэтому сравниваем именно top строки с top контейнера)
          setMyRowAbove(entry.boundingClientRect.top<entry.rootBounds.top)
        }else if(entry.isIntersecting){
          setMyRowAbove(false)
        }
      },
      {root:scroll,threshold:0.1}
    )
    obs.observe(row)
    return()=>obs.disconnect()
  },[sticky,myInVisibleSlice,myFullIdx,myId,list.length])

  if(list.length===0)return <div className="bd-empty">{t.boardEmpty}</div>

  // Показываем стики только если:
  //  • игрок ВНЕ показанного среза (rank > limit) — всегда
  //  • ИЛИ его строка прокручена ВНИЗ за пределы (но не вверх — туда легко доскроллить)
  const showSticky=sticky&&!!myId&&myFullIdx>=0&&(!myInVisibleSlice||(!myRowVisible&&!myRowAbove))
  const gapCount=myFullIdx>=visible.length
    ?myFullIdx-visible.length
    :(!myRowVisible&&!myRowAbove)?Math.max(0,myFullIdx-(visible.length-1)):0

  return(
    <>
      <div className="bd-scroll" ref={scrollRef}>
        {visible.map((e,i)=>(
          <BdRow key={e.userId} e={e} rank={i} myId={myId} rowRef={e.userId===myId?myRowRef:undefined} allowTgLink={allowTgLink} maskNames={maskNames} lang={lang}/>
        ))}
      </div>
      {showSticky&&myEntry&&(
        <div className="bd-sticky-footer">
          {gapCount>0&&<div className="bd-beyond-info">{t.boardGap(gapCount)}</div>}
          <BdRow e={myEntry} rank={myFullIdx} myId={myId} allowTgLink={allowTgLink} maskNames={maskNames} lang={lang}/>
        </div>
      )}
    </>
  )
}

type GrowthEntry=Entry&{coef:number;gamesForCoef:number}

function GrowthRows({list,myId,lang='ru'}:{list:GrowthEntry[];myId:string;lang?:Lang}){
  const t=S[lang]
  const scrollRef=useRef<HTMLDivElement>(null)
  const myRowRef=useRef<HTMLDivElement>(null)
  const [myRowVisible,setMyRowVisible]=useState(true)
  const [myRowAbove,setMyRowAbove]=useState(false)

  const myIdx=myId?list.findIndex(e=>e.userId===myId):-1
  const myEntry=myIdx>=0?list[myIdx]:null

  useEffect(()=>{ setMyRowVisible(true);setMyRowAbove(false) },[myId,list.length,myIdx])

  useEffect(()=>{
    if(myIdx<0)return
    const row=myRowRef.current,scroll=scrollRef.current
    if(!row||!scroll)return
    const obs=new IntersectionObserver(
      ([entry])=>{
        setMyRowVisible(entry.isIntersecting)
        if(!entry.isIntersecting&&entry.rootBounds){
          setMyRowAbove(entry.boundingClientRect.top<entry.rootBounds.top)
        }else if(entry.isIntersecting){
          setMyRowAbove(false)
        }
      },
      {root:scroll,threshold:0.1}
    )
    obs.observe(row)
    return()=>obs.disconnect()
  },[myIdx,myId,list.length])

  if(list.length===0)return <div className="bd-scroll"><div className="bd-empty">{t.growthEmpty}</div></div>

  const showSticky=myEntry!=null&&!myRowVisible&&!myRowAbove
  const renderRow=(e:GrowthEntry,i:number,ref?:React.RefObject<HTMLDivElement>)=>(
    <div ref={ref} key={e.userId} className={`bd-row${e.userId===myId?' me':''}`}>
      <div className="bd-rank">{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</div>
      <div className="bd-name">{e.userId===myId?e.name:maskName(e.name)}{e.userId===myId&&<span className="bd-mebadge">{t.youBadge}</span>}</div>
      <div style={{textAlign:'right',minWidth:80}}>
        <div className="bd-score" style={{color:'var(--o)'}}>{e.coef.toLocaleString('ru-RU')}</div>
        <div style={{fontSize:9,color:'var(--ink2)',fontFamily:'var(--font-ru)'}}>
          {e.score.toLocaleString('ru-RU')} / {e.gamesForCoef}{t.gamesShort}
        </div>
      </div>
    </div>
  )

  return(
    <>
      <div className="bd-scroll" ref={scrollRef}>
        {list.map((e,i)=>renderRow(e,i,e.userId===myId?myRowRef:undefined))}
      </div>
      {showSticky&&myEntry&&(
        <div className="bd-sticky-footer">
          {renderRow(myEntry,myIdx,undefined)}
        </div>
      )}
    </>
  )
}

function Board({entries,userGroups,grpBoards,myId,isTgUser,lang='ru'}:{entries:Entry[];userGroups:{id:string;title:string}[];grpBoards:Record<string,Entry[]>;myId:string;isTgUser:boolean;lang?:Lang}){
  const t=S[lang]
  const hasGroups=userGroups.length>0
  const [tab,setTab]=useState<'friends'|'global'|'growth'>('friends')
  const [expanded,setExpanded]=useState(false)

  // Рейтинг быстрообучаемости: коэф = рекорд / кол-во игр ДО рекорда (мин. 3 игры)
  // games_at_record фиксируется в момент установки рекорда — последующие игры не "размывают" коэф
  // Только TG-игроки (user_id чисто числовой) — гости (g_*) и группы исключаются
  const growthBoard=useMemo(()=>{
    return entries
      .filter(e=>!!e.gamesPlayed&&/^\d+$/.test(e.userId))
      .map(e=>{
        const denom=e.gamesAtRecord??e.gamesPlayed!   // fallback на gamesPlayed если backend ещё без поля
        return{...e,coef:Math.round(e.score/denom),gamesForCoef:denom}
      })
      .sort((a,b)=>b.coef-a.coef)
  },[entries])

  // Объединённый список «Знакомые» — лучший результат каждого игрока по всем группам
  const friendsBoard=useMemo(()=>{
    const map:Record<string,Entry>={}
    userGroups.forEach(g=>{
      ;(grpBoards[g.id]||[]).forEach(e=>{
        if(!map[e.userId]||e.score>map[e.userId].score)map[e.userId]=e
      })
    })
    // Если игрока нет ни в одной групповой таблице (например, ещё не играл с группой),
    // но он есть в глобальном рейтинге — подмешиваем его глобальный рекорд,
    // чтобы стики-строка корректно показывала позицию относительно знакомых.
    if(myId&&!map[myId]){
      const myGlobal=entries.find(e=>e.userId===myId)
      if(myGlobal)map[myId]=myGlobal
    }
    return Object.values(map).sort((a,b)=>b.score-a.score)
  },[userGroups,grpBoards,entries,myId])

  // Если гость (не TG) — показываем кнопку авторизации
  if(!isTgUser){
    return(
      <div className="bd-wrap">
        <div className="bd-auth-prompt">
          <div className="bd-auth-text">{t.authPrompt}</div>
          <a href="https://t.me/nummatchbot/game" className="bd-auth-btn"
             onClick={e=>{e.preventDefault();try{window.Telegram?.WebApp.openTelegramLink('https://t.me/nummatchbot/game')}catch{window.open('https://t.me/nummatchbot/game','_blank')}}}>
            {t.authBtn}
          </a>
        </div>
      </div>
    )
  }

  const showExpand=tab==='friends'&&userGroups.length>1

  return(
    <div className="bd-wrap">
      <div className="bd-tabs">
        <button className={`bd-tab${tab==='friends'?' bd-tab-active':''}`} onClick={()=>{setTab('friends');setExpanded(false)}}>
          {t.tabFriends}
        </button>
        <button className={`bd-tab bd-tab-global${tab==='global'?' bd-tab-active':''}`} onClick={()=>{setTab('global');setExpanded(false)}}>
          {t.tabGlobal}
        </button>
        <button
          title={t.hdrGrowth}
          className={`bd-tab-growth-icon${tab==='growth'?' active':''}`}
          onClick={()=>setTab(tt=>tt==='growth'?'global':'growth')}
        >⚡</button>
      </div>

      <div className="bd-hdr">
        <span>
          {tab==='friends'?t.hdrFriends:tab==='global'?t.hdrGlobal:t.hdrGrowth}
        </span>
        {tab==='growth'&&<span className="bd-hdr-hint">{t.growthHint}</span>}
        {showExpand&&(
          <button className="bd-expand-btn" onClick={()=>setExpanded(x=>!x)}>
            {expanded?t.collapse:t.byGroups}
          </button>
        )}
      </div>

      {tab==='friends'&&!hasGroups
        ? <div className="bd-scroll"><div className="bd-friends-empty">
            <div style={{fontSize:32,marginBottom:8}}>👥</div>
            <div className="bd-friends-title">{t.noFriendsTitle}</div>
            <div className="bd-friends-desc">
              {t.noFriendsDesc.replace('@nummatchbot','').trim().split('@nummatchbot').length>1
                ?<>{t.noFriendsDesc.split('@nummatchbot')[0]}<b>@nummatchbot</b>{t.noFriendsDesc.split('@nummatchbot')[1]}</>
                :t.noFriendsDesc}
            </div>
            <div className="bd-friends-steps">
              <div>{t.noFriendsStep1}</div>
              <div>{t.noFriendsStep2.split('@nummatchbot')[0]}<b>@nummatchbot</b></div>
              <div>{t.noFriendsStep3}</div>
            </div>
          </div></div>
        : tab==='growth'
          ? <GrowthRows list={growthBoard} myId={myId} lang={lang}/>
          : !expanded
            ? <BoardRows
                list={tab==='friends'
                  ?friendsBoard
                  :entries.filter(e=>/^\d+$/.test(e.userId))}
                myId={myId}
                limit={tab==='friends'?10000:100}
                sticky={true}
                allowTgLink={tab==='friends'}
                maskNames={tab==='global'}
                lang={lang}
              />
            : <div className="bd-groups-expanded">
                {userGroups.map(g=>(
                  <div key={g.id} className="bd-group-block">
                    <div className="bd-group-block-title">👥 {g.title}</div>
                    <BoardRows list={grpBoards[g.id]||[]} myId={myId} limit={10} sticky={false} allowTgLink={true} lang={lang}/>
                  </div>
                ))}
              </div>
      }
    </div>
  )
}

// ════════════════════════════════════════
// APP
// ════════════════════════════════════════
export default function App(){
  const [userId,   setUID]    = useState('')
  const [nick,     setNick]   = useState('')
  const [groupId,  setGrpId]  = useState('')
  const [groupTitle,setGrpT]  = useState('')
  const [userGroups,setUserGroups] = useState<{id:string;title:string}[]>([])
  const [phase,    setPhase]  = useState<Phase>('start')
  // Токен обновляется каждую игру — ломает ботов с хардкодными CSS-селекторами
  const [btnTok,   setBtnTok] = useState(()=>Math.random().toString(36).slice(2,6))
  const [score,    setScore]  = useState(0)
  const [level,    setLevel]  = useState(1)
  const [ct,       setCT]     = useState(0)
  const [cr,       setCR]     = useState(0)
  const [time,     setTime]   = useState(TIMER)
  const [pair,     setPair]   = useState<Pair|null>(null)
  const [fb,       setFB]     = useState<FB|null>(null)
  const [shake,    setShake]  = useState(false)
  const [board,    setBoard]  = useState<Entry[]>([])
  const [grpBoard, setGrpBrd] = useState<Entry[]|undefined>(undefined)
  const [grpBoards,setGrpBoards] = useState<Record<string,Entry[]>>({})
  const [rules,    setRules]  = useState(false)
  const [muted,    setMuted]  = useState(false)
  const [unlocked, setUL]     = useState<Set<string>>(new Set())
  const ulRef                  = useRef<Set<string>>(new Set())   // синхронное зеркало для endGame
  const [achQ,     setAchQ]   = useState<Ach[]>([])
  const [curAch,   setCur]    = useState<Ach|null>(null)
  const [showAch,  setShowAch]= useState(false)
  const [showTutorial,setShowTutorial]=useState(false)
  const [lastDelta,setLD]     = useState(0)
  const [deltaKey, setDKey]   = useState(0)
  const [wasNew,   setWasNew] = useState(false)
  const [wasNewGrp,setWasNewGrp]=useState(false)
  const [prevBest, setPrevBest] = useState(0)
  const [endConfirm, setEndConfirm] = useState(false)
  const [isTgUser, setIsTgUser] = useState(false)
  const refByRef = useRef('')       // кто пригласил (start_param = "ref_<userId>")
  const [showBoard, setShowBoard] = useState(false)
  const [boardLoading, setBoardLoading] = useState(false)
  const [errCt, setErrCt] = useState(0)
  const [showStats, setShowStats] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<{sessionNum:number;counted:boolean}|null>(null)
  const [cardInfo, setCardInfo] = useState<string|null>(null)
  const [resultReady, setResultReady] = useState(false)
  const [showRankBanner, setShowRankBanner] = useState(false)
  const [revealStep, setRevealStep]       = useState(0)
  const [newAchEarned, setNewAchEarned]   = useState(false)
  const [newAchsThisRound, setNewAchsRound] = useState<Ach[]>([])
  const [showNewAchs, setShowNewAchs]     = useState(false)
  const [achInitialSel, setAchInitialSel] = useState<Ach|null>(null)
  const [gameSessionSec, setGameSessionSec] = useState(120)
  const [lang, setLang] = useState<Lang>('ru')
  const [showSettings, setShowSettings] = useState(false)

  const phaseRef=useRef<Phase>('start'),levelRef=useRef(1),scoreRef=useRef(0),ctRef=useRef(0)
  const procRef=useRef(false),mutRef=useRef(false),uidRef=useRef(''),nickRef=useRef('')
  const grpIdRef=useRef('')
  // Метрики игровой сессии
  const timeRef=useRef(TIMER)             // зеркало state time для использования внутри колбэков
  const errCtRef=useRef(0)
  const answerLogRef=useRef<{correct:boolean;timeLeft:number}[]>([])  // лог каждого ответа
  const maxRecovChainRef=useRef(0)        // макс. серия правильных ПОСЛЕ ошибки
  const inRecovRef=useRef(false)          // сейчас в режиме восстановления?
  const recovChainRef=useRef(0)           // текущая серия восстановления
  const curStreakRef=useRef(0)            // текущая серия правильных подряд
  const maxStreakRef=useRef(0)            // макс. серия за партию
  const lastBreathRef=useRef(false)       // правильный ответ при ≤1 сек
  const maxTimeRef=useRef(TIMER)          // максимальное значение таймера за партию
  const maxLevelRef=useRef(1)             // максимальный достигнутый уровень
  const sessionStartRef=useRef(0)         // ms timestamp начала сессии
  const redZoneSecRef=useRef(0)           // секунд в красной зоне (time<30)
  const orientLandscapeSecRef=useRef(0)   // секунд в landscape-ориентации
  const recov25HitRef=useRef(false)       // достигли 25 после ошибки при time<45
  const recov20HardRef=useRef(false)      // 20 после ошибки в красной зоне на ур.9+
  const adrenalineHitRef=useRef(false)    // получили +20 сек за серию когда было <15 сек на ур.10+
  const adrenalineSeriesRef=useRef(0)     // сек, накопленные в серии (сбрасывается на ошибке)
  const deepScanCountRef=useRef(0)        // правильных «≠» где отличается только последняя цифра, ур.14+
  // inversion removed
  const autism50HitRef=useRef(false)      // 50+ ответов 100% точности на ур.12+ (флагнём в endGame)
  const lostSignalRef=useRef(false)       // финал ошибкой при time<=0
  const zeroAnsRef=useRef(false)          // правильный при time=0 (теоретически — закроем гонкой при time→0)
  const isPracticeRef=useRef(false)       // текущий раунд — тренировка
  const [practiceHint,setPHint]=useState(0)  // шаг подсказки 0-3
  const [finishing,  setFinishing]=useState(false)  // 1с задержка после time=0
  const [grace,      setGrace]   =useState(true)    // ждём первых 3 правильных
  const [wrongHint,  setWrongHint]=useState<string|null>(null)  // подсказка при ошибке
  const finishingRef=useRef(false)
  const graceRef    =useRef(true)
  const graceCountRef=useRef(0)

  useEffect(()=>{phaseRef.current=phase},[phase])
  useEffect(()=>{
    if(phase==='gameOver'){
      setResultReady(false);setShowRankBanner(true);setRevealStep(0);setCardInfo(null);setShowBoard(false)
      const tt:ReturnType<typeof setTimeout>[]=[]
      const at=(ms:number,fn:()=>void)=>{tt.push(setTimeout(fn,ms))}
      at(260, ()=>{setRevealStep(1);Snd.tync(0)})      // FOCUS SCORE — самый драматичный
      at(680, ()=>setRevealStep(2))                     // diff + rank — тихо скользит вниз
      at(1100,()=>{setRevealStep(3);Snd.tync(1)})      // карточка 1: скорость
      at(1450,()=>{setRevealStep(4);Snd.tync(1)})      // карточка 2: точность
      at(1800,()=>{setRevealStep(5);Snd.tync(1)})      // карточка 3: стабильность
      at(2150,()=>{setRevealStep(6);Snd.tync(2)})         // зоны: стресс + восстановление
      at(2450,()=>setRevealStep(7))                     // quick-stats (после зон или карточек)
      at(2750,()=>{setRevealStep(8);setResultReady(true)}) // кнопки
      at(3300,()=>setShowRankBanner(false))
      return()=>tt.forEach(clearTimeout)
    }
  },[phase])
  useEffect(()=>{levelRef.current=level},[level])
  useEffect(()=>{scoreRef.current=score},[score])
  useEffect(()=>{ctRef.current=ct},[ct])
  useEffect(()=>{mutRef.current=muted},[muted])
  useEffect(()=>{uidRef.current=userId},[userId])
  useEffect(()=>{nickRef.current=nick},[nick])
  useEffect(()=>{grpIdRef.current=groupId},[groupId])
  useEffect(()=>{timeRef.current=time},[time])
  useEffect(()=>{ulRef.current=unlocked},[unlocked])
  useEffect(()=>{if(curAch||!achQ.length)return;setCur(achQ[0]);setAchQ(q=>q.slice(1))},[achQ,curAch])

  // Глобальная лёгкая вибрация на любую кнопку во всём приложении
  useEffect(()=>{
    const onDown=(e:PointerEvent)=>{
      if((e.target as Element)?.closest('button:not([disabled])')){haptic('light')}
    }
    document.addEventListener('pointerdown',onDown,{passive:true})
    return()=>document.removeEventListener('pointerdown',onDown)
  },[])

  useEffect(()=>{
    const m=localStorage.getItem('nm_muted')==='1';setMuted(m);mutRef.current=m;Snd.enabled=!m
    // Таблица лидеров всегда закрыта при старте
    const tg=window.Telegram?.WebApp;let uid='',name='',isTg=false
    // Резервный источник initData: URL hash #tgWebAppData=... (используется TG Desktop / web.telegram.org)
    let rawInitData=tg?.initData||''
    if(!rawInitData&&typeof window!=='undefined'&&window.location.hash){
      try{
        const hashParams=new URLSearchParams(window.location.hash.slice(1))
        const wad=hashParams.get('tgWebAppData')
        // URLSearchParams.get уже декодирует один уровень, повторно НЕ декодируем
        if(wad)rawInitData=wad
      }catch{}
    }
    // Парсер user из raw initData строки
    const parseUserFromRaw=(raw:string)=>{
      try{
        const params=new URLSearchParams(raw)
        const uStr=params.get('user')
        if(!uStr)return null
        // URLSearchParams.get уже декодирует, JSON.parse сразу
        const uObj=JSON.parse(uStr)
        return uObj&&uObj.id?uObj:null
      }catch{return null}
    }
    if(tg){
      tg.ready();tg.expand()
      // Запрашиваем настоящий fullscreen (Bot API 8.0+) — иначе остаётся «fullsize»
      try{tg.requestFullscreen?.()}catch{}
      try{tg.disableVerticalSwipes?.()}catch{}
      // Безопасные зоны TG (кнопки закрыть/меню) → CSS custom properties
      const applyTgSafeArea=()=>{
        const ci=tg.contentSafeAreaInset||{top:0,bottom:0,left:0,right:0}
        const si=tg.safeAreaInset||{top:0,bottom:0,left:0,right:0}
        const root=document.documentElement
        root.style.setProperty('--tg-ct',`${Math.max(ci.top||0, si.top||0)}px`)
        root.style.setProperty('--tg-cb',`${Math.max(ci.bottom||0, si.bottom||0)}px`)
        root.style.setProperty('--tg-cl',`${Math.max(ci.left||0, si.left||0)}px`)
        root.style.setProperty('--tg-cr',`${Math.max(ci.right||0, si.right||0)}px`)
      }
      applyTgSafeArea()
      try{tg.onEvent?.('contentSafeAreaInsetChanged', applyTgSafeArea)}catch{}
      try{tg.onEvent?.('safeAreaInsetChanged', applyTgSafeArea)}catch{}
      const u=tg.initDataUnsafe?.user
      if(u&&u.id){
        uid=String(u.id)
        name=u.username?`@${u.username}`:u.first_name+(u.last_name?` ${u.last_name}`:'')
        isTg=true
      } else if(rawInitData){
        const uObj=parseUserFromRaw(rawInitData)
        if(uObj){
          uid=String(uObj.id)
          name=uObj.username?`@${uObj.username}`:uObj.first_name||'Игрок'
          isTg=true
        } else {
          // Мы в TG (initData есть), но user не распарсился — всё равно не гость
          isTg=true
        }
      }
    } else if(rawInitData){
      // Telegram SDK не загрузился, но в URL есть tgWebAppData — значит мы открыты из TG
      const uObj=parseUserFromRaw(rawInitData)
      if(uObj){
        uid=String(uObj.id)
        name=uObj.username?`@${uObj.username}`:uObj.first_name||'Игрок'
        isTg=true
      } else {
        isTg=true
      }
    }
    // Определяем язык заранее, чтобы использовать в randomGuest
    const savedLang=localStorage.getItem('nm_lang') as Lang|null
    const tgLangCode=(window.Telegram?.WebApp?.initDataUnsafe as any)?.user?.language_code
    const resolvedLang:Lang=(savedLang==='en'||savedLang==='ru')?savedLang:detectLang(tgLangCode)
    if(!uid){uid=localStorage.getItem('nm_userId')||`g_${Math.random().toString(36).slice(2)}`;name=localStorage.getItem('nm_nickname')||randomGuest(resolvedLang)}
    if(isTg)setIsTgUser(true)
    // Реферальный start_param: t.me/nummatchbot/game?startapp=ref_<userId>
    const sp=(window.Telegram?.WebApp?.initDataUnsafe as any)?.start_param as string||''
    if(sp.startsWith('ref_')){
      const referrer=sp.slice(4)
      if(referrer&&referrer!==uid)refByRef.current=referrer
    }
    localStorage.setItem('nm_userId',uid);localStorage.setItem('nm_nickname',name)
    setUID(uid);setNick(name);uidRef.current=uid;nickRef.current=name
    setLang(resolvedLang)
    // Глобальный рейтинг НЕ загружаем сразу — только по запросу пользователя (кнопка)
    // Если TG-пользователь — проверяем в каких группах состоит
    if(uid&&/^\d+$/.test(uid)){
      fetch(`/api/mygroups/${uid}`).then(r=>r.json()).then(({groups})=>{
        if(groups&&groups.length>0){
          const mapped=groups.map((g:any)=>({id:String(g.id),title:g.title}))
          setUserGroups(mapped)
          // Если одна группа — выбираем автоматически, иначе пользователь выберет сам
          const saved=localStorage.getItem('nm_groupId')
          const active=mapped.find((g:{id:string;title:string})=>g.id===saved)||mapped[0]
          setGrpId(active.id);setGrpT(active.title);grpIdRef.current=active.id
          // Загружаем рейтинги всех групп параллельно
          Promise.all(mapped.map((g:{id:string;title:string})=>
            fetchGroupBoard(g.id).then(entries=>({id:g.id,entries}))
          )).then(results=>{
            const boards:Record<string,Entry[]>={}
            results.forEach(r=>{boards[r.id]=r.entries})
            setGrpBoards(boards)
          })
        }
      }).catch(()=>{})
    }
    // Ачивки грузим отложенно — не блокируем первый рендер
    // (даже если пользователь успеет начать игру в первые 200мс, новые ачивки не разблокируются раньше)
    const loadAchDeferred=()=>loadAch(uid).then(ids=>{const s=new Set(ids);setUL(s);ulRef.current=s})
    if('requestIdleCallback' in window){
      (window as any).requestIdleCallback(loadAchDeferred,{timeout:1500})
    } else {
      setTimeout(loadAchDeferred,300)
    }
  },[])


  useEffect(()=>{
    if(phase!=='playing')return
    const iv=setInterval(()=>{
      if(graceRef.current)return  // заморозка таймера в grace-период
      // Трекеры: секунд в красной зоне + landscape
      if(timeRef.current<30&&timeRef.current>0)redZoneSecRef.current++
      try{
        const w=window.innerWidth,h=window.innerHeight
        if(w>h)orientLandscapeSecRef.current++
      }catch{}
      setTime(t=>{
        if(t<=10&&t>0){Snd.tick();haptic('light');setTimeout(()=>haptic('light'),160)}
        return Math.max(0,t-1)
      })
    },1000)
    return()=>clearInterval(iv)
  },[phase])
  useEffect(()=>{
    if(time===0&&phaseRef.current==='playing'&&!finishingRef.current){
      finishingRef.current=true;setFinishing(true)
      setTimeout(()=>endGame(),1000)
    }
  },[time])

  function triggerAch(s:number,l:number,streak:number,ul:Set<string>){
    const nw=checkNew(s,l,streak,ul);if(!nw.length)return ul
    const ns=new Set([...ul,...nw.map(a=>a.id)])
    setUL(ns);setAchQ(q=>[...q,...nw]);Snd.achieve()
    // In-game ачивки тоже зажигают пилюлю и попадают в «новые этого раунда»
    setNewAchEarned(true);setNewAchsRound(r=>[...r,...nw])
    if(uidRef.current)saveAch(uidRef.current,[...ns],grpIdRef.current||undefined)
    return ns
  }

  const boardLoadingRef=useRef(false)

  // Загрузка рейтинга по запросу (кнопка на старт-экране) или после игры
  async function loadBoard(autoShow=false){
    if(boardLoadingRef.current)return
    boardLoadingRef.current=true;setBoardLoading(true)
    try{
      const grpIds=userGroups.map(g=>g.id)
      const [globalData,...grpData]=await Promise.all([
        fetchBoard(),
        ...grpIds.map(id=>fetchGroupBoard(id))
      ])
      setBoard(globalData)
      if(grpIds.length>0){
        const boards:Record<string,Entry[]>={}
        grpIds.forEach((id,i)=>{boards[id]=grpData[i]})
        setGrpBoards(boards)
      }
      if(autoShow)setShowBoard(true)
    }catch{}
    boardLoadingRef.current=false;setBoardLoading(false)
  }

  function toggleBoard(){
    if(!showBoard){
      setCardInfo(null)
      localStorage.setItem('nm_showBoard','1')
      if(board.length===0)loadBoard(true)
      else setShowBoard(true)
    } else {
      localStorage.setItem('nm_showBoard','0')
      setShowBoard(false)
    }
  }

  function startGame(practice=false){
    initAudio();Snd.click()
    isPracticeRef.current=practice
    const t=practice?TIMER_PRACTICE:TIMER
    setBtnTok(Math.random().toString(36).slice(2,6))
    setScore(0);setLevel(1);setCT(0);setCR(0);setTime(t);setFB(null);setShake(false);setLD(0);setWasNew(false);setWasNewGrp(false);setEndConfirm(false)
    setErrCt(0);setPHint(0);setFinishing(false);setGrace(practice);setWrongHint(null);setResultReady(false);setRevealStep(0);setNewAchEarned(false);setNewAchsRound([]);setShowNewAchs(false)
    procRef.current=false;levelRef.current=1;scoreRef.current=0;ctRef.current=0
    errCtRef.current=0;timeRef.current=t
    answerLogRef.current=[];maxRecovChainRef.current=0;inRecovRef.current=false;recovChainRef.current=0
    curStreakRef.current=0;maxStreakRef.current=0;lastBreathRef.current=false;maxTimeRef.current=t
    maxLevelRef.current=1;sessionStartRef.current=Date.now();redZoneSecRef.current=0;orientLandscapeSecRef.current=0
    recov25HitRef.current=false;recov20HardRef.current=false;adrenalineHitRef.current=false;adrenalineSeriesRef.current=0
    deepScanCountRef.current=0
    autism50HitRef.current=false;lostSignalRef.current=false;zeroAnsRef.current=false
    finishingRef.current=false;graceRef.current=practice;graceCountRef.current=0
    setSessionInfo(null)
    setPair(makePair(1));setPhase('playing');haptic('light')
  }
  const t = S[lang]

  function toggleLang(){
    const nl:Lang=lang==='ru'?'en':'ru'
    setLang(nl);localStorage.setItem('nm_lang',nl)
  }

  function toggleMute(){
    const newMuted=!mutRef.current
    mutRef.current=newMuted
    setMuted(newMuted)
    localStorage.setItem('nm_muted',newMuted?'1':'0')
    if(newMuted){
      // Звук был включён — выключаем. Звука теперь нет → вибрируем.
      Snd.enabled=false
      try{window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy')}catch{}
      try{navigator.vibrate?.([80,40,80,40,80])}catch{}
    } else {
      // Звук был выключен — включаем. Играем приятный дзынь.
      Snd.enabled=true
      blip({freq:660,dur:.22,type:'sine',gain:.1,slide:440})
      setTimeout(()=>blip({freq:1320,dur:.18,type:'sine',gain:.08,slide:-220}),120)
    }
  }

  async function endGame(abandoned=false){
    setPhase('gameOver');setEndConfirm(false)
    const isPractice=isPracticeRef.current
    if(abandoned||isPractice){
      // Стоп вручную или тренировка — очки не сохраняем
      setWasNew(false);setWasNewGrp(false)
      setTimeout(()=>Snd.timeup(),300)
      if(isPractice){
        // Разблокируем ачивку за тренировку
        localStorage.setItem('nm_tutorial_done','1')
        setTimeout(()=>{
          if(ulRef.current.has('tutorial'))return
          const a=ALL_ACH.find(x=>x.id==='tutorial')
          if(!a)return
          const ns=new Set([...ulRef.current,'tutorial'])
          setUL(ns);ulRef.current=ns;setAchQ(q=>[...q,a]);Snd.achieve()
          if(uidRef.current)saveAch(uidRef.current,[...ns],grpIdRef.current||undefined)
        },800)
      }
      return
    }
    const fs=scoreRef.current,uid=uidRef.current,name=nickRef.current,gid=grpIdRef.current
    // Телеметрия: вычисляем из рефов (синхронно, до async-операций)
    const _ta=ctRef.current+errCtRef.current
    const _acc=_ta>0?Math.round(ctRef.current/_ta*100):100
    // APM считаем по РЕАЛЬНОМУ времени сессии, а не по жёстким 2 минутам
    // (игра может длиться дольше 120 сек из-за бонусных секунд за правильные ответы)
    const _realSec=Math.max(1,Math.round((Date.now()-sessionStartRef.current)/1000))
    const _apm=Math.round(_ta/(_realSec/60))
    const _log=answerLogRef.current
    const _l30=_log.filter(a=>a.timeLeft<=30),_f30=_log.filter(a=>a.timeLeft>=90)
    const _l15=_log.filter(a=>a.timeLeft<=15)
    const _l10=_log.filter(a=>a.timeLeft<=10)
    const _l30a=_l30.length>=3?Math.round(_l30.filter(a=>a.correct).length/_l30.length*100):null
    const _f30a=_f30.length>=3?Math.round(_f30.filter(a=>a.correct).length/_f30.length*100):null
    const _stabDrop=(_f30a!==null&&_l30a!==null)?_f30a-_l30a:null
    const _l30corr=_l30.filter(a=>a.correct).length
    const _l30err=_l30.filter(a=>!a.correct).length
    const _l15corr=_l15.filter(a=>a.correct).length
    const _l10a=_l10.length>=3?Math.round(_l10.filter(a=>a.correct).length/_l10.length*100):null
    const _l10n=_l10.length
    // Lifetime: считаем сессию + день
    ltInc(LT_KEY.totalAns,_ta)
    ltAddDay()
    const _hr=new Date().getHours(),_min=new Date().getMinutes()
    if((_hr===3||_hr===13||_hr===23)&&_min===33)ltInc(LT_KEY.hh33,1)
    const _dayStreak=ltDayStreak(),_daysPlayed=ltDays().length
    const _shareCount=ltGet(LT_KEY.shares),_mandela=ltGet(LT_KEY.mandela),_hh33=ltGet(LT_KEY.hh33)
    // Lost signal: последний ответ — ошибка, время <=1 сек
    const _lastA=_log[_log.length-1]
    const _lostSignal=!!_lastA&&!_lastA.correct&&_lastA.timeLeft<=1
    // Autism50: 50+ ответов, 100% точность, ур.>=12 хоть раз
    const _autism50=_ta>=50&&errCtRef.current===0&&maxLevelRef.current>=12
    const _sessionSec=_realSec
    setGameSessionSec(_sessionSec>0?_sessionSec:120)
    const _common={
      score:fs,level:levelRef.current,errCt:errCtRef.current,apm:_apm,
      stabilityDrop:_stabDrop,last30Acc:_l30a,last30Correct:_l30corr,last30ErrCt:_l30err,
      last15Correct:_l15corr,last10Acc:_l10a,last10Count:_l10n,
      maxRecov:maxRecovChainRef.current,
      lastBreath:lastBreathRef.current,zeroAns:zeroAnsRef.current,lostSignal:_lostSignal,
      maxTimeReached:maxTimeRef.current,maxLevel:maxLevelRef.current,
      sessionSec:_sessionSec,sessionAns:_ta,redZoneSec:redZoneSecRef.current,
      recov25Hit:recov25HitRef.current,recov20Hard:recov20HardRef.current,adrenalineHit:adrenalineHitRef.current,
      deepScanCount:deepScanCountRef.current,
      autism50Hit:_autism50,orientLandscapeSec:orientLandscapeSecRef.current,
      shareCount:_shareCount,dayStreak:_dayStreak,daysPlayed:_daysPlayed,
      totalAnswers:ltGet(LT_KEY.totalAns),mandelaCount:_mandela,hh33Count:_hh33,
    }
    // Ждём запись телеметрии до завершения экрана — иначе статистика может открыться до записи
    const _telPromise=sendTelemetry(uid,{score:fs,accuracy:_acc,apm:_apm,stabilityDrop:_stabDrop??0,last30Acc:_l30a,maxRecov:maxRecovChainRef.current,level:levelRef.current,refBy:refByRef.current||undefined})
    _telPromise.then(setSessionInfo)
    // Сохраняем предыдущий рекорд ДО обновления таблицы
    setPrevBest(board.find(e=>e.userId===uid)?.score||0)
    if(uid&&name){
      const gids=userGroups.map(g=>g.id)
      const res=await saveScore(uid,name,fs,gids.length>0?gids:undefined,_sessionSec,_apm)
      // Обновляем глобальный рейтинг и все групповые параллельно
      const allGrpIds=userGroups.map(g=>g.id)
      const [upd,...grpUpdates]=await Promise.all([
        fetchBoard(),
        ...allGrpIds.map(id=>fetchGroupBoard(id))
      ])
      setBoard(upd)
      if(allGrpIds.length>0){
        const boards:Record<string,Entry[]>={}
        allGrpIds.forEach((id,i)=>{boards[id]=grpUpdates[i]})
        setGrpBoards(boards)
      }
      // Для ачивок rank/rankPool — только TG-игроки (гости g_* в зачёт не идут)
      const tgUpd=upd.filter(e=>/^\d+$/.test(e.userId))
      const rank=tgUpd.findIndex(e=>e.userId===uid)+1
      const gamesPlayed=upd.find(e=>e.userId===uid)?.gamesPlayed??0
      const wasNewRecord=res?.wasNewRecord===true
      const wasNewGroupRecord=res?.wasNewGroupRecord===true
      setWasNew(wasNewRecord)
      // Дополнительная клиентская проверка: игрок реально #1 хотя бы в одной группе
      const isRealGrpRecord=wasNewGroupRecord&&allGrpIds.some((_,i)=>grpUpdates[i]?.[0]?.userId===uid)
      setWasNewGrp(isRealGrpRecord)
      // Достижения конца игры — используем ulRef.current (актуальное значение после игры)
      flushEndAchs({..._common,rank,rankPool:tgUpd.length,gamesPlayed})
      // Соц-ачивки: только за реферальные (группы не трогаем каждый раунд)
      fetchSocial(uid).then(s=>flushSocialAchs(s,{skipGroup:true}))
      setTimeout(()=>{
        if(wasNewRecord&&rank===1)Snd.fanfare1()
        else if(wasNewRecord&&rank===2)Snd.fanfare2()
        else if(wasNewRecord&&rank===3)Snd.fanfare3()
        else Snd.timeup()
      },300)
    } else {
      setWasNew(false);setWasNewGrp(false)
      setTimeout(()=>Snd.timeup(),300)
      const d=await fetchBoard()
      setBoard(d)
      // Достижения конца игры для анонимного игрока (rankPool — только TG)
      flushEndAchs({..._common,rank:0,rankPool:d.filter(e=>/^\d+$/.test(e.userId)).length,gamesPlayed:0})
      fetchSocial(uid).then(s=>flushSocialAchs(s,{skipGroup:true}))
    }
    // Дожидаемся записи телеметрии — чтобы статистика была доступна сразу после game-over
    await _telPromise
  }

  // Вызывается в конце игры: проверяет end-game ачивки и сохраняет ВСЕ в БД
  function flushEndAchs(p:Parameters<typeof checkEndGame>[0]){
    const cur=ulRef.current
    const endAchs=checkEndGame(p,cur)
    const ns=endAchs.length>0?new Set([...cur,...endAchs.map(a=>a.id)]):cur
    // Всегда пишем в БД — сохраняем и in-game ачивки (до этого saveAch падал no_user)
    if(uidRef.current&&ns.size>0)saveAch(uidRef.current,[...ns],grpIdRef.current||undefined)
    if(endAchs.length>0){setUL(ns);ulRef.current=ns;setAchQ(q=>[...q,...endAchs]);Snd.achieve();setNewAchEarned(true);setNewAchsRound(r=>[...r,...endAchs])}
  }

  // Соц-ачивки — реферальные + групповые. Каждая ачивка сработает только ОДИН раз
  // (после первой выдачи saveAch пишет в БД, при следующей загрузке loadAch вернёт её в ulRef → !cur.has() = false)
  function flushSocialAchs(s:{refCount:number;hasGroupAdd:boolean;groupPlayers:number},_opts?:{skipGroup?:boolean}){
    const cur=ulRef.current
    const toUnlock:string[]=[]
    if(s.refCount>=1&&!cur.has('ref1'))toUnlock.push('ref1')
    if(s.refCount>=5&&!cur.has('ref5'))toUnlock.push('ref5')
    if(s.refCount>=10&&!cur.has('ref10'))toUnlock.push('ref10')
    if(s.hasGroupAdd&&!cur.has('group_add'))toUnlock.push('group_add')
    if(s.groupPlayers>=3&&!cur.has('group_play'))toUnlock.push('group_play')
    if(toUnlock.length===0)return
    const newAchs=ALL_ACH.filter(a=>toUnlock.includes(a.id))
    const ns=new Set([...cur,...toUnlock])
    setUL(ns);ulRef.current=ns;setAchQ(q=>[...q,...newAchs]);Snd.achieve();setNewAchEarned(true);setNewAchsRound(r=>[...r,...newAchs])
    if(uidRef.current)saveAch(uidRef.current,[...ns],grpIdRef.current||undefined)
  }

  const answer=useCallback((same:boolean)=>{
    if(!pair||procRef.current||phaseRef.current!=='playing'||finishingRef.current)return
    procRef.current=true
    const correct=same===pair.same,lv=levelRef.current,d=diff(lv)
    if(correct){
      // Grace: снимаем заморозку после 3 правильных (только тренировка)
      if(graceRef.current){
        graceCountRef.current++
        if(graceCountRef.current>=3){graceRef.current=false;setGrace(false);if(isPracticeRef.current)setPHint(10)}
      }
      haptic('success');Snd.correct();window.__bgFlash?.('green')
      setScore(s=>{const ns=s+pts(lv);scoreRef.current=ns;return ns})
      setTime(t=>{const nt=Math.min(t+d.bonus,999);if(nt>maxTimeRef.current)maxTimeRef.current=nt;return nt})
      setDKey(k=>k+1);setLD(d.bonus);setTimeout(()=>setLD(0),1300)
      setFB({correct:true,diffIdx:[]})
      answerLogRef.current.push({correct:true,timeLeft:timeRef.current})
      if(timeRef.current<=1)lastBreathRef.current=true
      if(timeRef.current<=0)zeroAnsRef.current=true
      // Recovery chains
      if(inRecovRef.current){
        recovChainRef.current++
        if(recovChainRef.current>maxRecovChainRef.current)maxRecovChainRef.current=recovChainRef.current
        if(recovChainRef.current>=25&&timeRef.current<45)recov25HitRef.current=true
        if(recovChainRef.current>=25&&timeRef.current<30&&lv>=9)recov20HardRef.current=true
      }
      // Adrenaline: серия даёт >=20 сек начиная с <15 сек на ур.10+
      if(timeRef.current<15&&lv>=10){adrenalineSeriesRef.current+=d.bonus;if(adrenalineSeriesRef.current>=20)adrenalineHitRef.current=true}
      else if(timeRef.current>=30) adrenalineSeriesRef.current=0
      // Deep scan: правильный «≠» где отличается только последняя позиция, ур.14+
      // (мы в ветке correct, значит same===pair.same; для «≠» это same=false)
      if(!pair.same&&lv>=14){
        const idx=calcDiff(pair.n1,pair.n2)
        const maxIdx=Math.max(pair.n1.length,pair.n2.length)-1
        if(idx.length===1&&idx[0]===maxIdx)deepScanCountRef.current++
      }
      curStreakRef.current++
      if(curStreakRef.current>maxStreakRef.current)maxStreakRef.current=curStreakRef.current
      setCT(c=>{const nc=c+1;ctRef.current=nc;if(!isPracticeRef.current)setUL(ul=>triggerAch(scoreRef.current,levelRef.current,maxStreakRef.current,ul));return nc})
      setCR(r=>{const n=r+1;if(n%PER_LVL===0){Snd.levelup();setLevel(l=>{const nl=l+1;levelRef.current=nl;if(nl>maxLevelRef.current)maxLevelRef.current=nl;if(!isPracticeRef.current)setUL(ul=>triggerAch(scoreRef.current,nl,maxStreakRef.current,ul));return nl})};return n})
      // В тренировке — реактивная подсказка "Правильно!" на 1.5с, затем нейтрально
      if(isPracticeRef.current&&graceRef.current){
        setPHint(1);setTimeout(()=>setPHint(h=>h===1?3:h),1500)
      }
      setTimeout(()=>{setFB(null);setWrongHint(null);setPair(makePair(levelRef.current));procRef.current=false},380)
    } else {
      haptic('error');Snd.wrong();window.__bgFlash?.('red')
      setTime(t=>Math.max(0,t-d.penalty))
      setDKey(k=>k+1);setLD(-d.penalty);setTimeout(()=>setLD(0),1300)
      setFB({correct:false,diffIdx:calcDiff(pair.n1,pair.n2)});setShake(true)
      setErrCt(e=>{errCtRef.current=e+1;return e+1})
      answerLogRef.current.push({correct:false,timeLeft:timeRef.current})
      // Mandela: игрок назвал «≠» когда числа равны
      if(pair.same&&!same)ltInc(LT_KEY.mandela,1)
      // Сбрасываем «инверсию» и «адреналин» при ошибке
      adrenalineSeriesRef.current=0
      inRecovRef.current=true;recovChainRef.current=0;curStreakRef.current=0
      // В тренировке — реактивная подсказка "Ошибка!" на 1.5с, без wrongHint
      if(isPracticeRef.current){
        setPHint(2);setTimeout(()=>setPHint(h=>h===2?3:h),1500)
      } else {
        // В обычной игре — подсказка правильного ответа
        setWrongHint(pair.same?'same':'diff')
      }
      setTimeout(()=>{setShake(false);setFB(null);setWrongHint(null);setPair(makePair(levelRef.current));procRef.current=false},1200)
    }
  },[pair])

  const flashCls=fb?(fb.correct?'flash-green':'flash-red'):''
  const diffIdx=fb&&!fb.correct?fb.diffIdx:[]
  const locked=fb!==null||finishing,d=diff(level)

  // ── СТАРТ ──
  if(phase==='start') return(
    <div className="app-root">
      <BgCanvas density={200} parallax={0.8} speed={1}/>
      {showAch&&<Suspense fallback={null}><AchModal unlocked={unlocked} onClose={()=>{setShowAch(false);setAchInitialSel(null)}} initialSel={achInitialSel} lang={lang}/></Suspense>}
      {showNewAchs&&<Suspense fallback={null}><RoundAchModal achs={newAchsThisRound} onClose={()=>setShowNewAchs(false)} onViewAll={()=>{setShowNewAchs(false);setAchInitialSel(null);setShowAch(true)}} onSelect={a=>{setShowNewAchs(false);setAchInitialSel(a);setShowAch(true)}} lang={lang}/></Suspense>}
      {showStats&&<Suspense fallback={null}><StatsModal userId={userId} onClose={()=>setShowStats(false)} lang={lang}/></Suspense>}
      {showTutorial&&<Suspense fallback={null}><TutorialModal
        onPractice={()=>{setShowTutorial(false);startGame(true)}}
        onSkip={()=>{setShowTutorial(false);localStorage.setItem('nm_tutorial_done','1');startGame(false)}}
        lang={lang}
      /></Suspense>}
      {showSettings&&(
        <div className="modal-overlay" onClick={()=>setShowSettings(false)}>
          <div className="modal-card" onClick={e=>e.stopPropagation()} style={{maxWidth:320}}>
            <div className="modal-title">{lang==='ru'?'Настройки':'Settings'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:16}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'rgba(255,255,255,.05)',borderRadius:12}}>
                <span style={{color:'#e8e8f0'}}>{lang==='ru'?'Язык':'Language'}</span>
                <button className="icon-btn lang-btn" onClick={toggleLang} style={{minWidth:48}}>{lang==='ru'?'EN':'RU'}</button>
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'rgba(255,255,255,.05)',borderRadius:12}}>
                <span style={{color:'#e8e8f0'}}>{lang==='ru'?'Звук':'Sound'}</span>
                <button className="icon-btn" onClick={toggleMute}>{muted?'🔇':'🔊'}</button>
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'rgba(255,255,255,.05)',borderRadius:12}}>
                <span style={{color:'#e8e8f0'}}>{lang==='ru'?'Обучение':'Tutorial'}</span>
                <button className="icon-btn" onClick={()=>{setShowSettings(false);setShowTutorial(true)}}>▶</button>
              </div>
            </div>
            <button className="cta" style={{width:'100%',marginTop:16}} onClick={()=>setShowSettings(false)}>{lang==='ru'?'Готово':'Done'}</button>
          </div>
        </div>
      )}
      {rules&&(
        <div className="modal-overlay" onClick={()=>setRules(false)}>
          <div className="modal-card" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">{t.rulesTitle}</div>
            <div style={{fontSize:'13px',color:'#b8aedb',lineHeight:1.7,marginTop:12}}>
              <p>{t.rulesCompare} <b style={{color:G}}>{t.rulesEq}</b> {lang==='ru'?'или':'or'} <b style={{color:R}}>{t.rulesDiff}</b>.</p>
              <p style={{marginTop:10}}>{t.rulesTimer}<br/><span style={{color:G}}>{t.rulesCorrect}</span><br/><span style={{color:R}}>{t.rulesWrong}</span></p>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,marginTop:12}}>
                <thead><tr style={{color:'#8a83ad'}}><td>{t.rulesLvl}</td><td style={{textAlign:'center',color:G}}>+{lang==='ru'?'с':'s'}</td><td style={{textAlign:'center',color:R}}>−{lang==='ru'?'с':'s'}</td></tr></thead>
                <tbody>{[[1,3,3,15],[4,6,2,18],[7,9,2,22],[10,12,1,25],[13,'∞',1,30]].map(([a,b,bo,pe],i)=>(
                  <tr key={i}><td style={{padding:'4px 0',color:'#8a83ad'}}>{t.rulesLvlShort} {a}–{b}</td><td style={{textAlign:'center',color:G}}>+{bo}</td><td style={{textAlign:'center',color:R}}>−{pe}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <button className="cta" style={{width:'100%',marginTop:16,fontSize:12,opacity:.85}} onClick={()=>{setRules(false);setShowTutorial(true)}}>{t.rulesTutBtn}</button>
            <button className="cta" style={{width:'100%',marginTop:8}} onClick={()=>setRules(false)}>{t.rulesOk}</button>
          </div>
        </div>
      )}
      <div className="content-stack">
        <div className="start-top">
          <button className={`ach-pill${newAchEarned?' fire':''}`} onClick={()=>{if(newAchEarned&&newAchsThisRound.length>0){setShowNewAchs(true)}else{setShowAch(true)};setNewAchEarned(false)}}>🎖️ {ACH_PUBLIC.filter(a=>unlocked.has(a.id)).length}/{ACH_PUBLIC.length}</button>
          <div style={{display:'flex',gap:6}}>
            <button className="icon-btn" title="Прогресс" onClick={()=>setShowStats(true)}>📊</button>
            <button className="icon-btn" onClick={()=>setRules(true)} title="Правила">?</button>
            <button className="icon-btn" onClick={()=>setShowSettings(true)} title="Настройки">⚙️</button>
          </div>
        </div>
        {/* Спейсер сверху — пока таблица закрыта, распирает пространство и прижимает контент к центру */}
        <div style={{flexGrow:showBoard?0:1,flexShrink:0,flexBasis:0,transition:'flex-grow .42s cubic-bezier(.4,0,.2,1)'}}/>
        <div className="logo-block">
          <div className="logo-v">NUM</div>
          <div className="logo-c">MATCH</div>
          <div className="logo-tag">{t.logoTag}</div>
        </div>
        {nick&&<div className="welcome">{t.hi}, <b style={{color:'#f3edff'}}>{nick}</b> 👋</div>}
        <div className="start-btns">
          <button className="cta cta-primary" onClick={()=>{
            if(!localStorage.getItem('nm_tutorial_done')){setShowTutorial(true)}
            else{startGame(false)}
          }}>{t.play}</button>
        </div>
        <button className="board-toggle-btn" onClick={toggleBoard} disabled={boardLoading}>
          {boardLoading?t.loadingBoard:showBoard?t.hideBoard:t.showBoard}
        </button>
        {/* Спейсер снизу — симметричный, обеспечивает вертикальное центрирование */}
        <div style={{flexGrow:showBoard?0:1,flexShrink:0,flexBasis:0,transition:'flex-grow .42s cubic-bezier(.4,0,.2,1)'}}/>
        <div className={`board-section${showBoard?' board-section-open':' board-section-closed'}`}>
          <Board entries={board} userGroups={userGroups} grpBoards={grpBoards} myId={userId} isTgUser={isTgUser} lang={lang}/>
        </div>
      </div>
    </div>
  )

  // ── КОНЕЦ ТРЕНИРОВКИ ──
  if(phase==='gameOver'&&isPracticeRef.current){
    const totalAnswers=ct+errCt
    const accuracy=totalAnswers>0?Math.round(ct/totalAnswers*100):100
    return(
      <div className="app-root">
        <BgCanvas density={120} parallax={0.5} speed={0.6}/>
        {showAch&&<Suspense fallback={null}><AchModal unlocked={unlocked} onClose={()=>setShowAch(false)} lang={lang}/></Suspense>}
        {showSettings&&(
          <div className="modal-overlay" onClick={()=>setShowSettings(false)}>
            <div className="modal-card" onClick={e=>e.stopPropagation()} style={{maxWidth:320}}>
              <div className="modal-title">{lang==='ru'?'Настройки':'Settings'}</div>
              <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:16}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'rgba(255,255,255,.05)',borderRadius:12}}>
                  <span style={{color:'#e8e8f0'}}>{lang==='ru'?'Язык':'Language'}</span>
                  <button className="icon-btn lang-btn" onClick={toggleLang} style={{minWidth:48}}>{lang==='ru'?'EN':'RU'}</button>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'rgba(255,255,255,.05)',borderRadius:12}}>
                  <span style={{color:'#e8e8f0'}}>{lang==='ru'?'Звук':'Sound'}</span>
                  <button className="icon-btn" onClick={toggleMute}>{muted?'🔇':'🔊'}</button>
                </div>
              </div>
            </div>
          </div>
        )}
        <button className="icon-btn" style={{position:'absolute',top:'calc(14px + var(--tg-ct, 0px))',right:'calc(14px + var(--tg-cr, 0px))',zIndex:10}} onClick={()=>setShowSettings(s=>!s)}>⚙️</button>
        <div className="content-stack" style={{justifyContent:'center',gap:16,padding:'24px 16px'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:52,marginBottom:8}}>🎓</div>
            <div className="modal-title" style={{marginBottom:8}}>{t.practiceDoneTitle}</div>
            <div style={{color:'#8a83ad',fontSize:13,fontFamily:'var(--font-ru)',lineHeight:1.6}}>{t.practiceDoneDesc}</div>
          </div>
          <div style={{background:'rgba(199,155,255,.07)',border:'1px solid rgba(199,155,255,.2)',borderRadius:14,padding:'16px 20px',display:'flex',gap:24,justifyContent:'center'}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:22,fontWeight:700,color:'var(--v)',fontFamily:'var(--font-ui)'}}>{score.toLocaleString('ru-RU')}</div>
              <div style={{fontSize:10,color:'#8a83ad',marginTop:2}}>{t.practicePoints}</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:22,fontWeight:700,color:G,fontFamily:'var(--font-ui)'}}>{accuracy}%</div>
              <div style={{fontSize:10,color:'#8a83ad',marginTop:2}}>{t.practiceAccuracy}</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:22,fontWeight:700,color:'var(--c)',fontFamily:'var(--font-ui)'}}>{level}</div>
              <div style={{fontSize:10,color:'#8a83ad',marginTop:2}}>{t.practiceLevel}</div>
            </div>
          </div>
          {curAch&&<AchToast ach={curAch} onDone={()=>setCur(null)} lang={lang}/>}
          <div style={{color:'#b8aedb',fontSize:13,fontFamily:'var(--font-ru)',textAlign:'center',lineHeight:1.6}}>
            {t.practiceDoneReady}
          </div>
          <button className="cta cta-primary" style={{width:'100%'}} onClick={()=>{isPracticeRef.current=false;startGame(false)}}>{t.practiceDonePlay}</button>
          <button className="cta" style={{width:'100%',background:'rgba(255,154,60,.1)',border:'1px solid rgba(255,154,60,.3)',color:'var(--o)',fontSize:13}} onClick={()=>{
            // Ачивка "Второгодник" — повторная тренировка
            if(ulRef.current.has('tutorial')&&!ulRef.current.has('secondgrade')&&uidRef.current){
              const a=ALL_ACH.find(x=>x.id==='secondgrade')
              if(a){const ns=new Set([...ulRef.current,'secondgrade']);setUL(ns);ulRef.current=ns;setAchQ(q=>[...q,a]);Snd.achieve();saveAch(uidRef.current,[...ns])}
            }
            startGame(true)
          }}>{t.practiceDoneAgain}</button>
          <button className="cta" style={{width:'100%',fontSize:12}} onClick={()=>{isPracticeRef.current=false;setPhase('start')}}>{t.practiceDoneMenu}</button>
        </div>
      </div>
    )
  }

  // ── КОНЕЦ ──
  if(phase==='gameOver'){
    // ── Вычисляем когнитивные метрики ──
    const totalAnswers=ct+errCt
    const accuracy=totalAnswers>0?Math.round(ct/totalAnswers*100):100
    // Только TG-игроки идут в зачёт ранга (гости g_* — не учитываются)
    const tgBoard=board.filter(e=>/^\d+$/.test(e.userId))
    const totalPlayers=tgBoard.length
    // Ранг для ТЕКУЩЕЙ сессии: где бы оказался этот score в общем рейтинге.
    // Если бьём рекорд — это просто наша позиция в обновлённом борде.
    // Если нет — считаем, сколько других TG-игроков имеют рекорд >= нашего текущего счёта.
    const myEntry=tgBoard.find(e=>e.userId===userId)
    const recordRank=myEntry?tgBoard.findIndex(e=>e.userId===userId)+1:0
    const rank=(myEntry&&score>=myEntry.score)
      ? recordRank
      : tgBoard.filter(e=>e.userId!==userId&&e.score>=score).length+1
    const percentile=(rank>0&&totalPlayers>1)?Math.round(((totalPlayers-rank)/(totalPlayers-1))*100):-1
    const isRecord=!!myEntry&&score>=myEntry.score
    const scoreDiff=prevBest>0?score-prevBest:0
    // Ответов в минуту — делим на реальное время сессии, а не на 120
    const _realMin=gameSessionSec>0?gameSessionSec/60:2
    const answersPerMin=Math.round(totalAnswers/_realMin)
    const speedRating=answersPerMin>=38?t.speedLightning:answersPerMin>=26?t.speedFast:answersPerMin>=16?t.speedBalanced:t.speedThoughtful
    const accuracyRating=accuracy>=97?t.accExcellent:accuracy>=90?t.accGood:accuracy>=75?t.accOk:t.accPractice
    // Стабильность: точность в начале (timeLeft>=90) vs конец (timeLeft<=30)
    const log=answerLogRef.current
    const first30=log.filter(a=>a.timeLeft>=90)
    const last30=log.filter(a=>a.timeLeft<=30)
    const first30Acc=first30.length>=3?Math.round(first30.filter(a=>a.correct).length/first30.length*100):null
    const last30Acc=last30.length>=3?Math.round(last30.filter(a=>a.correct).length/last30.length*100):null
    const stabilityDrop=(first30Acc!==null&&last30Acc!==null)?first30Acc-last30Acc:0
    const stabilityColor=stabilityDrop<=2?G:stabilityDrop<=8?O:R
    const stressOk=last30Acc!==null&&last30Acc>=accuracy-5
    const maxRecov=maxRecovChainRef.current
    // quick-stats появляется после зон если они есть, иначе после карточек
    const hasZones=last30Acc!==null||(errCt>0&&maxRecov>0)
    const quickStatsStep=hasZones?7:6

    function shareResult(){
      const text=t.shareText(score.toLocaleString('ru-RU'))
      // Реферальная ссылка: если знаем userId — добавляем startapp=ref_<id>
      const refParam=uidRef.current?`?startapp=ref_${uidRef.current}`:''
      const url=`https://t.me/nummatchbot/game${refParam}`
      const su=`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
      // В Telegram WebApp — всегда используем openTelegramLink (корректно работает на Desktop/Android/iOS)
      // navigator.share на Windows Telegram Desktop открывает системный диалог Windows — нежелательно
      if(window.Telegram?.WebApp?.openTelegramLink){try{window.Telegram.WebApp.openTelegramLink(su)}catch{window.open(su,'_blank')}}
      else if(navigator.share){navigator.share({text,url}).catch(()=>{})}
      else{window.open(su,'_blank')}
      // Lifetime share counter + ачивка
      ltInc(LT_KEY.shares,1)
      if(!ulRef.current.has('share1')){
        const a=ALL_ACH.find(x=>x.id==='share1')
        if(a){const ns=new Set([...ulRef.current,'share1']);setUL(ns);ulRef.current=ns;setAchQ(q=>[...q,a]);Snd.achieve();if(uidRef.current)saveAch(uidRef.current,[...ns],grpIdRef.current||undefined)}
      }
    }

    return(
      <div className="app-root">
        <BgCanvas density={120} parallax={0.5} speed={0.6}/>
        {showAch&&<Suspense fallback={null}><AchModal unlocked={unlocked} onClose={()=>{setShowAch(false);setAchInitialSel(null)}} initialSel={achInitialSel} lang={lang}/></Suspense>}
        {showNewAchs&&<Suspense fallback={null}><RoundAchModal achs={newAchsThisRound} onClose={()=>setShowNewAchs(false)} onViewAll={()=>{setShowNewAchs(false);setAchInitialSel(null);setShowAch(true)}} onSelect={a=>{setShowNewAchs(false);setAchInitialSel(a);setShowAch(true)}} lang={lang}/></Suspense>}
        {showStats&&<Suspense fallback={null}><StatsModal userId={userId} onClose={()=>setShowStats(false)} lang={lang}/></Suspense>}
        {showTutorial&&<Suspense fallback={null}><TutorialModal
          onPractice={()=>{setShowTutorial(false);startGame(true)}}
          onSkip={()=>{setShowTutorial(false);localStorage.setItem('nm_tutorial_done','1')}}
          lang={lang}
        /></Suspense>}
        {showSettings&&(
          <div className="modal-overlay" onClick={()=>setShowSettings(false)}>
            <div className="modal-card" onClick={e=>e.stopPropagation()} style={{maxWidth:320}}>
              <div className="modal-title">{lang==='ru'?'Настройки':'Settings'}</div>
              <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:16}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'rgba(255,255,255,.05)',borderRadius:12}}>
                  <span style={{color:'#e8e8f0'}}>{lang==='ru'?'Язык':'Language'}</span>
                  <button className="icon-btn lang-btn" onClick={toggleLang} style={{minWidth:48}}>{lang==='ru'?'EN':'RU'}</button>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'rgba(255,255,255,.05)',borderRadius:12}}>
                  <span style={{color:'#e8e8f0'}}>{lang==='ru'?'Звук':'Sound'}</span>
                  <button className="icon-btn" onClick={toggleMute}>{muted?'🔇':'🔊'}</button>
                </div>
              </div>
              <button className="cta" style={{width:'100%',marginTop:16}} onClick={()=>setShowSettings(false)}>{lang==='ru'?'Готово':'Done'}</button>
            </div>
          </div>
        )}
        <div className="content-stack">
          <div className="start-top">
            <button className={`ach-pill${newAchEarned?' fire':''}`} onClick={()=>{if(newAchEarned&&newAchsThisRound.length>0){setShowNewAchs(true)}else{setShowAch(true)};setNewAchEarned(false)}}>🎖️ {ACH_PUBLIC.filter(a=>unlocked.has(a.id)).length}/{ACH_PUBLIC.length}</button>
            <div style={{display:'flex',gap:6}}>
              <button className="icon-btn" title="Прогресс" onClick={()=>setShowStats(true)}>📊</button>
              <button className="icon-btn" onClick={()=>setShowSettings(true)} title="Настройки">⚙️</button>
            </div>
          </div>
          {/* Спейсер — центрирует когда доска скрыта */}
          <div style={{flexGrow:showBoard?0:1,flexShrink:0,flexBasis:0,transition:'flex-grow .42s cubic-bezier(.4,0,.2,1)'}}/>

          {/* ── HERO: банер рекорда + FOCUS SCORE ── */}
          {showRankBanner&&wasNew&&rank===1&&<div className="rank-banner r1">{t.rank1Banner}</div>}
          {showRankBanner&&wasNew&&rank===2&&<div className="rank-banner r2">{t.rank2Banner}</div>}
          {showRankBanner&&wasNew&&rank===3&&<div className="rank-banner r3">{t.rank3Banner}</div>}
          {showRankBanner&&wasNewGrp&&!wasNew&&<div className="rank-banner rg">{t.grpRecordBanner}</div>}

          <div className="result-hero">
            <div className="result-hero-label">FOCUS SCORE</div>
            <div className={`result-hero-score ${revealStep>=1?'tync-pop':'tync-pending'}`}>{score.toLocaleString('ru-RU')}</div>
            {prevBest>0&&(
              <div className={`result-hero-diff ${revealStep>=2?'tync-slide':'tync-pending'}`}>
                {scoreDiff>0
                  ?<span className="result-diff-pos">+{scoreDiff.toLocaleString('ru-RU')} · {t.newRecord}</span>
                  :scoreDiff<0
                    ?<span style={{color:'var(--ink2)'}}>{t.prevRecord} {prevBest.toLocaleString('ru-RU')}</span>
                    :<span style={{color:'var(--ink2)'}}>{t.equalRecord}</span>}
              </div>
            )}
            {wasNew&&rank>0&&totalPlayers>1&&(
              <div className={`result-hero-rank ${revealStep>=2?'tync-slide':'tync-pending'}`}>
                #{rank} {t.rankOf} {totalPlayers.toLocaleString('ru-RU')}
                {percentile>0&&<span style={{color:'var(--v)'}}> · {t.rankAbove(percentile)}</span>}
              </div>
            )}
          </div>

          {/* ── КОГНИТИВНЫЙ ПРОФИЛЬ + ЗОНЫ — скрывается при открытом рейтинге ── */}
          <div className={`result-stats-section${showBoard?' result-stats-hidden':''}`}>
            {/* 3 карточки */}
            <div className="result-profile-grid">
              <div className={`result-card ${revealStep>=3?'tync-pop':'tync-pending'}`} onClick={()=>setCardInfo(cardInfo==='speed'?null:'speed')}>
                <div className="result-card-icon">⚡</div>
                <div className="result-card-val">{answersPerMin}</div>
                <div className="result-card-sub">{t.cardAnsPerMin}</div>
                <div className="result-card-rating">{speedRating}</div>
              </div>
              <div className={`result-card ${revealStep>=4?'tync-pop':'tync-pending'}`} onClick={()=>setCardInfo(cardInfo==='acc'?null:'acc')}>
                <div className="result-card-icon">🎯</div>
                <div className="result-card-val">{accuracy}%</div>
                <div className="result-card-sub">{errCt>0?t.cardErrors(errCt):t.cardNoErrors}</div>
                <div className="result-card-rating">{accuracyRating}</div>
              </div>
              <div className={`result-card ${revealStep>=5?'tync-pop':'tync-pending'}`} onClick={()=>setCardInfo(cardInfo==='stab'?null:'stab')}>
                <div className="result-card-icon">🔁</div>
                <div className="result-card-val" style={{color:stabilityColor}}>
                  {stabilityDrop<=2?'✓':`−${stabilityDrop}%`}
                </div>
                <div className="result-card-sub">{t.cardStability}</div>
                <div className="result-card-rating">
                  {stabilityDrop<=2?t.stabFlat:stabilityDrop<=8?t.stabSmallDrop:t.stabTired}
                </div>
              </div>
            </div>

            {/* Подсказка по выбранной карточке */}
            {cardInfo&&(
              <div className="result-card-info" onClick={()=>setCardInfo(null)}>
                {cardInfo==='speed'&&<>{t.cardInfoSpeed}</>}
                {cardInfo==='acc'&&<>{t.cardInfoAcc}</>}
                {cardInfo==='stab'&&<>{t.cardInfoStab}</>}
              </div>
            )}

            {/* ── СТРЕСС-ЗОНА (последние 30 сек) ── */}
            {last30Acc!==null&&(
              <div className={`result-zone ${revealStep>=6?'tync-slide':'tync-pending'}`} onClick={()=>setCardInfo(cardInfo==='stress'?null:'stress')} style={{cursor:'pointer'}}>
                <span className="result-zone-icon">{stressOk?'🧊':'🧨'}</span>
                <div className="result-zone-body">
                  <div className="result-zone-title">{t.stressZoneTitle}</div>
                  <div>
                    <span className="result-zone-val" style={{color:stressOk?G:last30Acc>=75?O:R}}>{last30Acc}%</span>
                    <span className="result-zone-desc">{stressOk?t.stressKeepUp:last30Acc>=75?t.stressSmallDrop:t.stressPressure}</span>
                  </div>
                </div>
              </div>
            )}
            {cardInfo==='stress'&&(
              <div className="result-card-info" onClick={()=>setCardInfo(null)}>
                {t.cardInfoStress}
              </div>
            )}

            {/* ── ВОССТАНОВЛЕНИЕ (если были ошибки и был recovery) ── */}
            {errCt>0&&maxRecov>0&&(
              <div className={`result-zone ${revealStep>=6?'tync-slide':'tync-pending'}`} onClick={()=>setCardInfo(cardInfo==='recovery'?null:'recovery')} style={{cursor:'pointer'}}>
                <span className="result-zone-icon">💪</span>
                <div className="result-zone-body">
                  <div className="result-zone-title">{t.recovTitle}</div>
                  <div>
                    <span className="result-zone-val" style={{color:'var(--v)'}}>{maxRecov}</span>
                    <span className="result-zone-desc">{t.recovStreak(maxRecov)}</span>
                  </div>
                </div>
              </div>
            )}
            {errCt>0&&maxRecov>0&&cardInfo==='recovery'&&(
              <div className="result-card-info" onClick={()=>setCardInfo(null)}>
                {t.cardInfoRecovery}
              </div>
            )}

            {/* ── БЫСТРАЯ СТАТИСТИКА ── */}
            <div className={`result-quick-stats ${revealStep>=quickStatsStep?'tync-slide':'tync-pending'}`}>
              <span>{t.qsLevel} <b style={{color:'#5ce1ff'}}>{level}</b></span>
              <span>{t.qsCorrect} <b style={{color:G}}>{ct}</b></span>
              <span>{t.qsTotal} <b style={{color:'var(--ink1)'}}>{totalAnswers}</b></span>
            </div>

          </div>

          {/* ── CTA — активны только через 2 сек (защита от случайного тапа) ── */}
          <div className={`result-cta-primary ${revealStep>=8?'tync-slide':'tync-pending'}`}>
            <button className="cta cta-primary" style={{width:'100%',transition:'opacity .4s'}} disabled={!resultReady} onClick={()=>startGame()}>{t.playAgain}</button>
          </div>
          <div className={`result-cta-secondary ${revealStep>=8?'tync-slide':'tync-pending'}`}>
            <button className="cta cta-ghost" disabled={!resultReady} onClick={()=>setPhase('start')}>{t.menu}</button>
            <button className="cta cta-ghost" disabled={!resultReady} onClick={shareResult}>{t.share}</button>
          </div>

          <button className="board-toggle-btn" onClick={toggleBoard}>
            {showBoard?t.hideBoard2:t.seeBoard}
          </button>
          {/* Спейсер снизу — симметричный */}
          <div style={{flexGrow:showBoard?0:1,flexShrink:0,flexBasis:0,transition:'flex-grow .42s cubic-bezier(.4,0,.2,1)'}}/>
          <div className={`board-section${showBoard?' board-section-open':' board-section-closed'}`}>
            <Board entries={board} userGroups={userGroups} grpBoards={grpBoards} myId={userId} isTgUser={isTgUser} lang={lang}/>
          </div>
        </div>
      </div>
    )
  }

  // ── ИГРА ──
  if(!pair) return null
  return(
    <div className="app-root">
      <BgCanvas density={200} parallax={0.8} speed={1}/>
      <SparksCanvas/>
      {showAch&&<Suspense fallback={null}><AchModal unlocked={unlocked} onClose={()=>setShowAch(false)} lang={lang}/></Suspense>}
      <div className="content-stack">
        <StatHUD score={score} setScore={setScore} time={time} level={level} deltaKey={deltaKey} lastDelta={lastDelta} bonus={d.bonus} penalty={d.penalty} grace={grace} graceCount={graceCountRef.current} lang={lang}/>
        {isPracticeRef.current&&<div className="practice-banner">{t.practiceBannerLabel}</div>}
        <div className="end-round-row">
          <button className="end-round-btn" onClick={()=>setEndConfirm(true)}>{t.endRound}</button>
        </div>
        <div className="ach-flow-zone">
          {endConfirm
            ?<div className="end-confirm-bar">
               <span className="end-confirm-text">{t.endConfirmText}</span>
               <button className="end-confirm-ok" onClick={()=>endGame(true)}>{t.endConfirmOk}</button>
               <button className="end-confirm-cancel" onClick={()=>setEndConfirm(false)}>{t.endConfirmCancel}</button>
             </div>
            :curAch&&<AchToast ach={curAch} onDone={()=>setCur(null)} lang={lang}/>
          }
        </div>
        <div className={`panels-area ${shake?'shake':''}`}>
          <div className="panel-pad"><NeonPanel value={pair.n1} color="violet" diffIdx={[]} flashCls={flashCls}/></div>
          <VSDivider/>
          <div className="panel-pad"><NeonPanel value={pair.n2} color="cyan" diffIdx={diffIdx} flashCls={flashCls}/></div>
        </div>
        {/* Зона подсказок — между панелями и кнопками, фиксированная высота */}
        <div className="hint-zone">
          {wrongHint
            ?<div className={`wrong-hint ${wrongHint==='same'?'same':'diff'}`}>{wrongHint==='same'?t.wrongHintEqual:t.wrongHintDiffer}</div>
            :isPracticeRef.current&&<PracticeOverlay hint={practiceHint} lang={lang}/>
          }
        </div>
        <div className="answers">
          <AnswerBtn kind="diff" onClick={()=>answer(false)} disabled={locked} lang={lang} tok={btnTok}/>
          <AnswerBtn kind="same" onClick={()=>answer(true)}  disabled={locked} lang={lang} tok={btnTok}/>
        </div>
      </div>
    </div>
  )
}
