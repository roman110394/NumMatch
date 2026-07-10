// ════════════════════════════════════════════════════════════════
// MODALS — лениво загружаемые модальные окна (React.lazy в App.tsx)
// Содержит: AchModal, RoundAchModal, StatsModal, TutorialModal
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from 'react'
import {
  ALL_ACH, ACH_PUBLIC, CAT_NAMES, CAT_NAMES_EN, CAT_ORDER,
  TUTORIAL_SLIDES,
  rarityInfo, fetchTelemetry,
  type Ach, type DayRec,
} from './data'
import { S, ACH_EN, TUTORIAL_SLIDES_EN, type Lang } from './locale'

// ── Хелпер: достаёт title/desc/longDesc для ачивки с учётом языка ──
function achLoc(a:Ach, lang:Lang){
  if(lang==='en'){
    const en=ACH_EN[a.id]
    if(en)return{title:en.title,desc:en.desc,longDesc:en.longDesc}
  }
  return{title:a.title,desc:a.desc,longDesc:a.longDesc}
}

// ════════ TUTORIAL ════════
export function TutorialModal({onPractice,onSkip,lang='ru'}:{onPractice:()=>void;onSkip:()=>void;lang?:Lang}){
  const t=S[lang]
  const slides=lang==='en'?TUTORIAL_SLIDES_EN:TUTORIAL_SLIDES
  const [step,setStep]=useState(0)
  const slide=slides[step]
  const isLast=step===slides.length-1
  return(
    <div className="modal-overlay" onClick={()=>{}}>
      <div className="modal-card tut-card" onClick={e=>e.stopPropagation()}>
        <div className="tut-step-dots">
          {slides.map((_,i)=><span key={i} className={`tut-dot${i===step?' active':''}`}/>)}
        </div>
        <div className="tut-icon">{slide.icon}</div>
        <div className="tut-title">{slide.title}</div>
        <div className="tut-body" style={{textAlign:'left'}}>{slide.body}</div>
        <div className="tut-btns">
          {!isLast?(
            <>
              {step>0&&<button className="tut-back" onClick={()=>setStep(s=>s-1)}>{t.tutBack}</button>}
              <button className="cta tut-next" onClick={()=>setStep(s=>s+1)}>{t.tutNext}</button>
            </>
          ):(
            <>
              <button className="tut-skip" onClick={onSkip}>{t.tutSkip}</button>
              <button className="cta tut-start" onClick={onPractice}>{t.tutPractice}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════ МОДАЛ «ДОСТИЖЕНИЯ ЭТОГО РАУНДА» ════════
export function RoundAchModal({achs,onViewAll,onClose,onSelect,lang='ru'}:{
  achs:Ach[];onViewAll:()=>void;onClose:()=>void;onSelect:(a:Ach)=>void;lang?:Lang
}){
  const t=S[lang]
  return(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e=>e.stopPropagation()}>
        <div className="modal-title" style={{color:'#ffd060',letterSpacing:2}}>{t.roundAchTitle}</div>
        <p style={{fontSize:11,color:'#8a83ad',textAlign:'center',margin:'4px 0 10px',fontFamily:'var(--font-ru)'}}>{t.roundAchHint}</p>
        <div className="ach-list" style={{maxHeight:'50vh'}}>
          {achs.map(a=>{
            const al=achLoc(a,lang)
            return(
              <div key={a.id} className="ach-row ok round-ach-row" onClick={()=>onSelect(a)} style={{cursor:'pointer'}}>
                <span className="ach-icon">{a.icon}</span>
                <div className="ach-info">
                  <div className="ach-name">{al.title}</div>
                  <div className="ach-req">{al.desc}</div>
                </div>
                <span style={{fontSize:13,color:'#8a83ad'}}>›</span>
              </div>
            )
          })}
        </div>
        <div style={{display:'flex',gap:8,marginTop:14}}>
          <button className="cta cta-ghost" style={{flex:1,fontSize:12}} onClick={onClose}>{t.roundAchClose}</button>
          <button className="cta cta-primary" style={{flex:1,fontSize:12}} onClick={onViewAll}>{t.roundAchAll}</button>
        </div>
      </div>
    </div>
  )
}

// ════════ МОДАЛ ВСЕХ ДОСТИЖЕНИЙ ════════
export function AchModal({unlocked,onClose,initialSel=null,lang='ru'}:{unlocked:Set<string>;onClose:()=>void;initialSel?:Ach|null;lang?:Lang}){
  const t=S[lang]
  const catNames=lang==='en'?CAT_NAMES_EN:CAT_NAMES
  const [sel,setSel]=useState<Ach|null>(initialSel)
  const [sortByRarity,setSortByRarity]=useState(false)
  const [stats,setStats]=useState<Record<string,number>>({})
  const listRef=useRef<HTMLDivElement>(null)
  const savedScroll=useRef(0)
  const ok=(a:Ach)=>unlocked.has(a.id)

  useEffect(()=>{
    fetch('/api/achievements/stats')
      .then(r=>r.json())
      .then(d=>{ if(d.stats)setStats(d.stats) })
      .catch(()=>{})
  },[])

  const done=ACH_PUBLIC.filter(a=>ok(a)).length
  const total=ACH_PUBLIC.length

  // Группы по категориям (для режима по умолчанию)
  const byCat=CAT_ORDER.map(c=>{
    const isSecret=c==='secret'
    const all=ALL_ACH.filter(a=>a.cat===c)
    const visible=isSecret?all.filter(a=>ok(a)):all
    return{cat:c,items:visible,lockedSecret:isSecret?all.filter(a=>!ok(a)).length:0,isSecret}
  }).filter(g=>g.items.length>0)

  const byRarity=useMemo(()=>{
    const visible=ALL_ACH.filter(a=>a.cat!=='secret'||ok(a))
    return [...visible].sort((a,b)=>{
      const pa=stats[a.id]??101, pb=stats[b.id]??101
      return pa-pb
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[stats,unlocked])

  function openDetail(a:Ach){
    savedScroll.current=listRef.current?.scrollTop||0
    setSel(a)
  }
  function goBack(){
    setSel(null)
    requestAnimationFrame(()=>{
      if(listRef.current)listRef.current.scrollTop=savedScroll.current
    })
  }

  return(
    <div className="modal-overlay" onClick={sel?goBack:onClose}>
      <div className="modal-card" onClick={e=>e.stopPropagation()}>
        <div className="modal-title">{t.achModalTitle}</div>
        <div className="ach-modal-meta">
          <span style={{color:'#8a83ad',fontSize:'.8rem'}}>{done} / {total} {t.achModalOf}</span>
          <button
            className={`ach-sort-btn ${sortByRarity?'active':''}`}
            onClick={()=>{setSortByRarity(s=>!s);savedScroll.current=0;requestAnimationFrame(()=>{if(listRef.current)listRef.current.scrollTop=0})}}
          >{sortByRarity?t.achSortByGroups:t.achSortByRarity}</button>
        </div>

        {sel?(
          <div className="ach-detail">
            <div className={`ach-detail-icon ${ok(sel)?'ok':''}`}>{ok(sel)?sel.icon:'🔒'}</div>
            <div className={`ach-detail-title ${ok(sel)?'ok':''}`}>{achLoc(sel,lang).title}</div>
            <div className="ach-detail-req">{achLoc(sel,lang).desc}</div>
            <div className="ach-detail-long">{achLoc(sel,lang).longDesc}</div>
            {Object.keys(stats).length>0?(
              <div className="ach-detail-rarity" style={{color:rarityInfo(stats[sel.id],lang).color}}>
                {stats[sel.id]!==undefined
                  ?rarityInfo(stats[sel.id],lang).label
                  :ok(sel)
                    ?t.achOnlyYou
                    :t.achNobodyYet}
              </div>
            ):(
              <div className="ach-detail-rarity" style={{color:'#5a5270'}}>{t.achLoadingStats}</div>
            )}
            {ok(sel)&&<div className="ach-detail-earned">{t.achEarned}</div>}
            <button className="cta" style={{width:'100%',marginTop:16,fontSize:12}} onClick={goBack}>{t.achBack}</button>
          </div>
        ):(
          <>
            <div className="ach-list" ref={listRef}>
              {sortByRarity&&Object.keys(stats).length===0&&(
                <div style={{textAlign:'center',color:'#5a5270',fontSize:12,padding:'8px 0',fontFamily:'var(--font-ru)'}}>{t.achLoadingRarity}</div>
              )}
              {sortByRarity?(
                byRarity.map(a=>{
                  const ri=rarityInfo(stats[a.id],lang)
                  const isSecret=a.cat==='secret'
                  const al=achLoc(a,lang)
                  return(
                    <div key={a.id} className={`ach-row ${ok(a)?'ok':''}`} onClick={()=>openDetail(a)}>
                      <span className="ach-icon">{ok(a)?a.icon:'🔒'}</span>
                      <div className="ach-info">
                        <div className="ach-name">{ok(a)?al.title:(isSecret?t.achSecretLocked:al.title)}</div>
                        <div className="ach-req">{ok(a)?al.desc:(isSecret?t.achSecretLabel:al.desc)}</div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,flexShrink:0}}>
                        {stats[a.id]!==undefined&&<span className="ach-rarity-badge" style={{color:ri.color,borderColor:ri.color+'44'}}>{stats[a.id]===0?'👑':stats[a.id]+'%'}</span>}
                        {ok(a)&&<span className="ach-arrow">✓</span>}
                      </div>
                    </div>
                  )
                })
              ):(
                byCat.map(g=>{
                  const earned=g.items.filter(a=>ok(a)).length
                  return(
                    <div key={g.cat} className="ach-group">
                      <div className="ach-group-header">
                        <span className="ach-group-name">{catNames[g.cat]}</span>
                        {g.isSecret
                          ?<span className="ach-group-cnt secret">{t.achGroupSecretCnt(earned)}</span>
                          :<span className="ach-group-cnt">{earned}/{g.items.length}</span>
                        }
                      </div>
                      {g.items.length===0&&g.isSecret&&(
                        <div className="ach-row ach-row-mystery">
                          <span className="ach-icon">🔒</span>
                          <div className="ach-info">
                            <div className="ach-name" style={{color:'#5a5270'}}>{t.achSecretLocked}</div>
                            <div className="ach-req" style={{color:'#3a3250'}}>{t.achSecretGroupDesc}</div>
                          </div>
                        </div>
                      )}
                      {g.items.map(a=>{
                        const ri=rarityInfo(stats[a.id],lang)
                        const isSecret=a.cat==='secret'
                        const al=achLoc(a,lang)
                        return(
                          <div key={a.id} className={`ach-row ${ok(a)?'ok':''}`} onClick={()=>openDetail(a)}>
                            <span className="ach-icon">{ok(a)?a.icon:'🔒'}</span>
                            <div className="ach-info">
                              <div className="ach-name">{ok(a)?al.title:(isSecret?t.achSecretLocked:al.title)}</div>
                              <div className="ach-req">{ok(a)?al.desc:(isSecret?t.achSecretLabel:al.desc)}</div>
                            </div>
                            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,flexShrink:0}}>
                              {stats[a.id]!==undefined&&<span className="ach-rarity-badge" style={{color:ri.color,borderColor:ri.color+'44'}}>{stats[a.id]===0?'👑':stats[a.id]+'%'}</span>}
                              <span className="ach-arrow">{ok(a)?'✓':'›'}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
            <button className="cta" style={{width:'100%',marginTop:'12px'}} onClick={onClose}>{t.achModalClose}</button>
          </>
        )}
      </div>
    </div>
  )
}

// ════════ МОДАЛ ПРОГРЕССА (Samsung Health style) ════════
export function StatsModal({userId,onClose,lang='ru'}:{userId:string;onClose:()=>void;lang?:Lang}){
  const t=S[lang]
  const [period,setPeriod]=useState<7|30|90>(7)
  const [mode,setMode]=useState<'avg'|'best'>('avg')
  const [recs,setRecs]=useState<DayRec[]|null>(null)
  const [selDate,setSelDate]=useState<string|null>(null)
  const [refreshKey,setRefreshKey]=useState(0)

  useEffect(()=>{
    if(!userId){setRecs([]);return}
    setRecs(null)
    fetchTelemetry(userId,90).then(setRecs)
  },[userId,refreshKey])

  const fmtK=(n:number)=>n>=10000?`${(n/1000).toFixed(0)}k`:n>=1000?`${(n/1000).toFixed(1)}k`:String(n)

  // ── Все хуки до любых early return ──
  const chartScrollRef=useRef<HTMLDivElement>(null)

  const byDate=useMemo(()=>{
    if(!recs)return{}
    const m:Record<string,DayRec>={}
    recs.forEach(r=>{m[r.date]=r})
    return m
  },[recs])

  const allDates=useMemo(()=>{
    const dates:string[]=[]
    for(let i=period-1;i>=0;i--){
      const d=new Date();d.setDate(d.getDate()-i)
      dates.push(d.toISOString().slice(0,10))
    }
    return dates
  },[period])

  useEffect(()=>{
    if(chartScrollRef.current){
      chartScrollRef.current.scrollLeft=chartScrollRef.current.scrollWidth
    }
  },[period,recs])

  if(recs===null){
    return(
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card" onClick={e=>e.stopPropagation()}>
          <div className="modal-title">{t.statsTitleFull}</div>
          <div className="sc-empty">
            <div style={{fontSize:32}}>⏳</div>
            <div style={{fontFamily:'var(--font-ru)',fontSize:13,color:'var(--ink2)'}}>{t.statsLoading}</div>
          </div>
        </div>
      </div>
    )
  }

  if(recs.length===0){
    return(
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card" onClick={e=>e.stopPropagation()}>
          <div className="modal-title">{t.statsTitleFull}</div>
          <div className="sc-empty">
            <div style={{fontSize:40}}>📊</div>
            <div style={{fontFamily:'var(--font-ru)',fontSize:14,color:'var(--ink1)',textAlign:'center'}}>{t.statsEmptyTitle}</div>
            <div style={{fontFamily:'var(--font-ru)',fontSize:11,color:'var(--ink2)',textAlign:'center'}}>{t.statsEmptyHint}</div>
          </div>
          <button className="cta" style={{width:'100%',marginTop:14,background:'rgba(199,155,255,.15)',border:'1px solid rgba(199,155,255,.3)',color:'var(--v)'}} onClick={()=>setRefreshKey(k=>k+1)}>↻ {lang==='ru'?'Обновить':'Refresh'}</button>
          <button className="cta" style={{width:'100%',marginTop:8}} onClick={onClose}>{t.statsPlayBtn}</button>
        </div>
      </div>
    )
  }

  const todayStr=new Date().toISOString().slice(0,10)
  const bestEver=Math.max(0,...recs.map(r=>r.best_score))
  const periodRecs=allDates.map(d=>byDate[d]).filter(Boolean) as DayRec[]
  const activeDays=periodRecs.length

  // Ширина столбца и шаг подписей в зависимости от периода
  const barW=period<=7?38:period<=30?22:13
  const labelStep=period<=7?1:period<=30?3:7
  const showBarVal=barW>=30 // показываем значение на столбце только для 7 дней

  const chartItems=allDates.map(date=>{
    const r=byDate[date]
    return{date,val:r?(mode==='avg'?r.avg_score:r.best_score):0,best:r?.best_score||0,avg:r?.avg_score||0,sessions:r?.sessions||0,isEmpty:!r}
  })
  // Всегда масштабируем по best_score — иначе avg-бары всегда 100% высоты
  const maxVal=Math.max(...chartItems.map(c=>c.best),1)
  const showLabel=(i:number)=>i%labelStep===0||i===allDates.length-1

  const fmtBarLabel=(date:string)=>{
    const d=new Date(date)
    const mon=lang==='ru'
      ?['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
      :['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return`${d.getDate()} ${mon[d.getMonth()]}`
  }

  const selRec=selDate?byDate[selDate]:null

  const PERIODS:[7|30|90,string][]=[
    [7,t.statsPeriod7],[30,t.statsPeriod30],[90,t.statsPeriod90]
  ]

  return(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card sc-modal-card" onClick={e=>e.stopPropagation()}>
        <div className="modal-title">{t.statsTitleFull}</div>

        {/* KPI — рекорд за всё время */}
        <div className="st-kpi">
          <div className="st-kpi-val">{fmtK(bestEver)}</div>
          <div className="st-kpi-sub">🏆 {t.statsRecord} · {lang==='ru'?'за всё время':'all time'}</div>
        </div>

        {/* Avg/Best — над периодами */}
        <div className="st-mode-row">
          <div className="st-mode-toggle">
            <button className={`st-mode-btn${mode==='avg'?' active':''}`} onClick={()=>setMode('avg')}>{t.statsAvg}</button>
            <button className={`st-mode-btn${mode==='best'?' active':''}`} onClick={()=>setMode('best')}>{t.statsBest}</button>
          </div>
        </div>

        {/* Периоды */}
        <div className="st-period-tabs">
          {PERIODS.map(([p,label])=>(
            <button key={p}
              className={`st-period-tab${period===p?' active':''}`}
              onClick={()=>{setPeriod(p);setSelDate(null)}}
            >{label}</button>
          ))}
        </div>

        {/* Бар-чарт с горизонтальной прокруткой */}
        <div style={{position:'relative'}}>
          {/* Пунктирные линии: чуть выше максимума и на середине */}
          <div style={{position:'absolute',left:0,right:0,top:'8px',borderTop:'1px dashed rgba(199,155,255,0.45)',pointerEvents:'none',zIndex:1}}/>
          <div style={{position:'absolute',left:0,right:0,top:'46px',borderTop:'1px dashed rgba(199,155,255,0.25)',pointerEvents:'none',zIndex:1}}/>
          <div className="st-chart-scroll" ref={chartScrollRef}>
            <div className="st-chart" style={{width:`${chartItems.length*(barW+2)}px`}}>
              {chartItems.map((item,i)=>{
                const h=item.isEmpty?0:Math.max(4,Math.round(item.val/maxVal*72))
                const isSel=item.date===selDate
                const isToday=item.date===todayStr
                return(
                  <div key={item.date} className="st-bar-wrap" style={{width:`${barW}px`}}
                    onClick={()=>!item.isEmpty&&setSelDate(isSel?null:item.date)}>
                    <div className="st-bar-outer">
                      {item.isEmpty
                        ?<div className="st-bar empty"/>
                        :<div style={{display:'flex',flexDirection:'column',alignItems:'stretch',justifyContent:'flex-end',height:'100%',width:'100%'}}>
                           {showBarVal&&item.val>0&&<div style={{textAlign:'center',fontSize:'7px',fontFamily:'var(--font-ui)',color:isSel?'var(--v)':'var(--ink2)',lineHeight:1.2,marginBottom:2,flexShrink:0,fontWeight:600}}>{fmtK(item.val)}</div>}
                           <div className={`st-bar${isSel?' selected':''}${isToday?' today':''}`} style={{height:`${h}px`}}/>
                         </div>
                      }
                    </div>
                    <div className={`st-bar-lbl${isToday?' today':''}`}>
                      {showLabel(i)?fmtBarLabel(item.date):''}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Детали выбранного дня */}
        {selRec?(
          <div className="st-detail">
            <div className="st-detail-title">
              {fmtBarLabel(selDate!)} · {t.statsSessionsLabel(selRec.sessions)}
            </div>
            <div className="st-detail-metrics">
              {mode==='avg'?(
                <>
                  <div className="st-detail-m">
                    <div className="st-detail-val">{fmtK(selRec.avg_score)}</div>
                    <div className="st-detail-lbl">📈 {lang==='ru'?'среднее':'avg'}</div>
                  </div>
                  <div className="st-detail-m">
                    <div className="st-detail-val">{selRec.avg_accuracy}%</div>
                    <div className="st-detail-lbl">🎯 {t.statsAccShort}</div>
                  </div>
                  <div className="st-detail-m">
                    <div className="st-detail-val">{selRec.avg_apm}</div>
                    <div className="st-detail-lbl">⚡ {t.statsApmShort}</div>
                  </div>
                </>
              ):(
                <>
                  <div className="st-detail-m">
                    <div className="st-detail-val">{fmtK(selRec.best_score)}</div>
                    <div className="st-detail-lbl">🏆 {t.statsRecord}</div>
                  </div>
                  <div className="st-detail-m">
                    <div className="st-detail-val">{selRec.best_accuracy}%</div>
                    <div className="st-detail-lbl">🎯 {t.statsAccShort}</div>
                  </div>
                  <div className="st-detail-m">
                    <div className="st-detail-val">{selRec.best_apm}</div>
                    <div className="st-detail-lbl">⚡ {t.statsApmShort}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        ):(
          <div className="sc-hint">
            {t.statsActivedays(activeDays,period)} · {t.statsTodayHint(byDate[todayStr]?.sessions??0)}
          </div>
        )}

        <button className="cta" style={{width:'100%',marginTop:12}} onClick={onClose}>{t.statsClose}</button>
      </div>
    </div>
  )
}
