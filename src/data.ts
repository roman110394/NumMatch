// ════════════════════════════════════════════════════════════════
// SHARED DATA — типы, константы, хелперы, используемые и в App.tsx,
// и в лениво-подгружаемом Modals.tsx
// ════════════════════════════════════════════════════════════════

// ── Цвета ──
export const G = '#4dffa1'
export const R = '#ff3a5e'
export const O = '#ff9a3c'

// ── Типы и данные ачивок ──
export type AchCat = 'signals'|'pressure'|'mastery'|'quick'|'rank'|'social'|'secret'|'special'
export const CAT_NAMES: Record<AchCat,string> = {
  signals:'Основные сигналы',
  pressure:'Под давлением',
  mastery:'Стабильность и мастерство',
  quick:'Быстрый старт',
  rank:'Следы в рейтинге',
  social:'Социальные сигналы',
  secret:'Побочные эффекты',
  special:'Особое',
}
export const CAT_NAMES_EN: Record<AchCat,string> = {
  signals:'Core signals',
  pressure:'Under pressure',
  mastery:'Stability & mastery',
  quick:'Fast start',
  rank:'Leaderboard marks',
  social:'Social signals',
  secret:'Side effects',
  special:'Special',
}
export const CAT_ORDER: AchCat[] = ['signals','pressure','mastery','quick','rank','social','secret','special']
export interface Ach{id:string;cat:AchCat;icon:string;title:string;desc:string;longDesc:string}

export const ALL_ACH: Ach[] = [
  // ─── ОСНОВНЫЕ СИГНАЛЫ ───
  {id:'s30000',  cat:'signals', icon:'🔓', title:'Допуск получен',    desc:'30 000 очков',      longDesc:'Первая официальная отметка. Ты внутри системы.'},
  {id:'s50000',  cat:'signals', icon:'📡', title:'Дальний сигнал',    desc:'50 000 очков',      longDesc:'Набери 50 000 очков за одну партию'},
  {id:'s75000',  cat:'signals', icon:'🌌', title:'За горизонтом',     desc:'75 000 очков',      longDesc:'Набери 75 000 очков за одну партию'},
  {id:'s100000', cat:'signals', icon:'☢️', title:'Критическая масса', desc:'100 000 очков',     longDesc:'Набери 100 000 очков за одну партию'},
  {id:'s150000', cat:'signals', icon:'🛡️', title:'Верхний допуск',    desc:'150 000 очков',     longDesc:'Набери 150 000 очков. Ты либо бог, либо читер.'},
  {id:'apm30',   cat:'signals', icon:'⚡',  title:'Разогрев',           desc:'30+ отв/мин · ур.5+',longDesc:'Реальный темп ≥30 ответов в минуту за всю сессию при уровне 5+'},
  {id:'apm40',   cat:'signals', icon:'🧠', title:'Нейроускорение',    desc:'40+ отв/мин · ур.5+',longDesc:'Реальный темп ≥40 ответов в минуту за всю сессию при уровне 5+'},
  {id:'apm50',   cat:'signals', icon:'☢️', title:'Режим перегрузки',  desc:'50+ отв/мин · ур.5+',longDesc:'Реальный темп ≥50 ответов в минуту за всю сессию при уровне 5+'},
  {id:'str20',   cat:'signals', icon:'🔍', title:'Сканер',             desc:'20 подряд',         longDesc:'20 правильных ответов подряд'},
  {id:'str40',   cat:'signals', icon:'📏', title:'Под линейку',        desc:'40 подряд',         longDesc:'40 правильных ответов подряд'},
  {id:'str75',   cat:'signals', icon:'⛔', title:'Без права на промах',desc:'75 подряд',         longDesc:'75 правильных ответов подряд'},
  {id:'str150',  cat:'signals', icon:'🌊', title:'Состояние потока',   desc:'150 подряд',        longDesc:'Время исчезает. Остаются только цифры.'},
  {id:'clean',   cat:'signals', icon:'❄️', title:'Холодная голова',    desc:'0 ошибок · ур.>10', longDesc:'Полный контроль над восприятием. Сессия с 0 ошибок при уровне выше 10.'},
  {id:'stab2',   cat:'signals', icon:'🌀', title:'Внутренняя тишина',  desc:'Стабильность ±2%',  longDesc:'Стабильность ±2% между началом и концом сессии при ≥50 ответах'},
  {id:'twilight',cat:'signals', icon:'🌫️', title:'Сумеречная зона',    desc:'Лучше к концу',     longDesc:'К концу сессии работаешь лучше, чем в начале. Уровень выше 13.'},
  {id:'l8',      cat:'signals', icon:'📈', title:'Прогресс',           desc:'8-й уровень',       longDesc:'Достигни 8-го уровня за одну партию'},
  {id:'l15',     cat:'signals', icon:'🌊', title:'Глубокое погружение',desc:'15-й уровень',      longDesc:'Достигни 15-го уровня'},
  {id:'l20',     cat:'signals', icon:'♟️', title:'Гроссмейстер',       desc:'20-й уровень',      longDesc:'20-й уровень за одну партию'},
  {id:'l30',     cat:'signals', icon:'🩸', title:'Пограничный режим',  desc:'30-й уровень',      longDesc:'Мозг на пределе.'},
  {id:'l35',     cat:'signals', icon:'🔭', title:'Предел восприятия',  desc:'35-й уровень',      longDesc:'Достигни 35-го уровня'},
  // ─── ПОД ДАВЛЕНИЕМ ───
  {id:'red_line',    cat:'pressure', icon:'🔴', title:'Красная линия',         desc:'Чистый финал после ошибок',     longDesc:'Закончить сессию без ошибок в последние 30 сек после уже совершённых ошибок. Чистый выход из хаоса.'},
  {id:'last_rush',   cat:'pressure', icon:'🏃', title:'Последний рывок',       desc:'10+ верных при <15 сек',        longDesc:'10+ правильных ответов при таймере менее 15 секунд'},
  {id:'pressure',    cat:'pressure', icon:'💥', title:'Под давлением',         desc:'≥95% в последние 10 сек',       longDesc:'≥95% точности в последние 10 секунд сессии (не менее 3 ответов)'},
  {id:'last_breath', cat:'pressure', icon:'⏳', title:'На последнем дыхании',  desc:'Правильный при ≤1 сек',         longDesc:'Дать правильный ответ при ≤1 секунде на таймере'},
  {id:'recov10',     cat:'pressure', icon:'🛠️', title:'Собраться',             desc:'20 верных после ошибки',        longDesc:'20 правильных ответов подряд сразу после ошибки'},
  {id:'recov20',     cat:'pressure', icon:'🗿', title:'Железная воля',         desc:'25 верных · <30с · ур.9+',      longDesc:'25 правильных подряд после ошибки, в оранжевой зоне (<30 сек) на уровне 9+'},
  {id:'recov25',     cat:'pressure', icon:'🔁', title:'Эхо ошибки',            desc:'25 верных после ошибки <45с',   longDesc:'Идеальное восстановление. 25 правильных подряд после ошибки при таймере <45 сек.'},
  {id:'adrenaline',  cat:'pressure', icon:'⚡',  title:'Адреналиновая калибровка',desc:'+20 сек когда <15',           longDesc:'Серия даёт +20 секунд за раз, когда оставалось менее 15 секунд на уровне 10+'},
  {id:'marty',       cat:'pressure', icon:'⏱️', title:'Марти Макфлай',         desc:'Таймер >2:20',                  longDesc:'Таймер превысил 2 минуты 20 секунд в одной сессии'},
  {id:'emmet',       cat:'pressure', icon:'⏱️', title:'Эммет Браун',           desc:'Таймер >2:40',                  longDesc:'Таймер превысил 2 минуты 40 секунд в одной сессии'},
  {id:'delorean',    cat:'pressure', icon:'⏱️', title:'Delorean',              desc:'Таймер >3:00',                  longDesc:'Таймер превысил 3 минуты в одной сессии'},
  {id:'absolute',    cat:'pressure', icon:'⭐', title:'Абсолют',                desc:'0 err · ур.20 · 100k',          longDesc:'0 ошибок + 20-й уровень + 100 000 очков в одной сессии'},
  // ─── СТАБИЛЬНОСТЬ И МАСТЕРСТВО ───
  {id:'stable30',  cat:'mastery', icon:'📊', title:'Стабильный контур',  desc:'≥90% в конце · 4+ мин',         longDesc:'Точность в последние 30 секунд ≥ 90% при сессии 4+ минуты'},
  {id:'deep_scan', cat:'mastery', icon:'🔬', title:'Глубокое сканирование',desc:'20 ≠ только в конце · ур.14+', longDesc:'20 правильных «≠» с изменением только в последних цифрах на уровне 14+'},
  // ─── БЫСТРЫЙ СТАРТ ───
  {id:'first30', cat:'quick', icon:'🚀', title:'С места в карьер', desc:'30k в первой игре',  longDesc:'30 000 очков в первой сессии'},
  {id:'eff50',   cat:'quick', icon:'🧬', title:'Прирождённый',     desc:'50k за <10 игр',     longDesc:'50 000 очков менее чем за 10 игр'},
  {id:'eff100',  cat:'quick', icon:'✨', title:'Явление',           desc:'100k за <20 игр',    longDesc:'100 000 очков менее чем за 20 игр'},
  // ─── СЛЕДЫ В РЕЙТИНГЕ ───
  {id:'rank100', cat:'rank', icon:'🥉', title:'Бронзовый след',  desc:'Топ-100 · 50+ игр',   longDesc:'Попасть в глобальный топ-100 сыграв не менее 50 игр'},
  {id:'rank10',  cat:'rank', icon:'🥈', title:'Серебряный след', desc:'Топ-10 · 50+ игр',    longDesc:'Попасть в глобальный топ-10 сыграв не менее 50 игр'},
  {id:'rank1',   cat:'rank', icon:'🥇', title:'Номер 1',          desc:'#1 · 50+ игр',        longDesc:'Стать №1 в глобальном рейтинге сыграв не менее 50 игр'},
  // ─── СОЦИАЛЬНЫЕ СИГНАЛЫ ───
  {id:'share1',     cat:'social', icon:'📤', title:'Эхо в сети',         desc:'1 шер',          longDesc:'Поделиться результатом хотя бы 1 раз'},
  {id:'ref1',       cat:'social', icon:'🔗', title:'Передатчик',         desc:'1 по ссылке',    longDesc:'1 человек пришёл и сыграл по твоей реферальной ссылке'},
  {id:'ref5',       cat:'social', icon:'🌐', title:'Сигнальная сеть',    desc:'5 по ссылке',    longDesc:'5 человек пришли и сыграли по твоим ссылкам'},
  {id:'ref10',      cat:'social', icon:'📡', title:'Широковещание',      desc:'10+ по ссылке',  longDesc:'10+ человек пришли по твоим ссылкам'},
  {id:'group_add',  cat:'social', icon:'👥', title:'Групповой протокол', desc:'Бот в группе',   longDesc:'Добавить бота в группу'},
  {id:'group_play', cat:'social', icon:'🧩', title:'Коллективное внимание',desc:'3+ в группе', longDesc:'3+ разных человека сыграли в группе с твоим ботом'},
  // ─── ПОБОЧНЫЕ ЭФФЕКТЫ (СЕКРЕТНЫЕ) ───
  {id:'mandela',     cat:'secret', icon:'👁️',   title:'Эффект Манделы',     desc:'100 ложных ≠',     longDesc:'Ты начал видеть различия там, где их нет. 100 ложных «≠» на одинаковых числах за всё время.'},
  {id:'lost_signal', cat:'secret', icon:'📴',   title:'Потерянный сигнал',  desc:'Финал ошибкой <1с',longDesc:'Закончить сессию неверным ответом со временем 0.0–0.9 секунды'},
  {id:'ghost666',    cat:'secret', icon:'👻',   title:'Призрак в проводке', desc:'666+ ответов',     longDesc:'Дать не менее 666 ответов за всё время'},
  {id:'feedback333', cat:'secret', icon:'⏰',   title:'Обратная связь',     desc:'3 сессии в HH:33', longDesc:'Завершить 3 сессии ровно в 03:33, 13:33 или 23:33'},
  {id:'autism50',    cat:'secret', icon:'🧩',   title:'Цифровой аутизм',    desc:'50+ при 100% · ур.12+',longDesc:'50+ ответов в одной сессии с 100% точностью (уровень 12+)'},
  {id:'silence',     cat:'secret', icon:'🔇',   title:'Тишина после шума',  desc:'90 сек в красной + 0 err',longDesc:'90+ секунд в красной зоне таймера + успешное завершение сессии без ошибок'},
  {id:'last_witness',cat:'secret', icon:'👁️‍🗨️',title:'Последний свидетель',desc:'50-й уровень',     longDesc:'Достичь 50-го уровня'},
  {id:'zero_ans',    cat:'secret', icon:'0️⃣',  title:'Ноль',               desc:'Ответ на 0.0',     longDesc:'Дать правильный ответ ровно в момент, когда таймер дошёл до нуля'},
  {id:'rotate3',     cat:'secret', icon:'🔄',   title:'Поворот',            desc:'3 мин в landscape',longDesc:'Сыграть сессию минимум 3 минуты с повёрнутым экраном'},
  {id:'static7',     cat:'secret', icon:'📻',   title:'Статический шум',    desc:'7 дней подряд',    longDesc:'7 дней подряд хотя бы по одной сессии'},
  {id:'white_noise', cat:'secret', icon:'🌫️',   title:'Белый шум',          desc:'30 дней с играми', longDesc:'30 дней с сыгранными сессиями'},
  // ─── ОСОБОЕ ───
  {id:'tutorial',    cat:'special', icon:'🎓', title:'Выпускник',     desc:'Прошёл тренировку',     longDesc:'Пройди первую тренировочную партию и изучи интерфейс игры'},
  {id:'secondgrade', cat:'special', icon:'📚', title:'Второгодник',  desc:'Повторная тренировка',  longDesc:'Не разобрался с первого раза — не беда! Повторение мать учения.'},
]

export const ACH_PUBLIC = ALL_ACH.filter(a => a.cat !== 'secret')

// Редкость: иконка + цвет по % игроков
export function rarityInfo(pct: number|undefined, lang: 'ru'|'en' = 'ru'){
  const L = lang === 'en'
    ? {uniq:'Unique',legend:'Legendary',rare:'Rare',uncommon:'Uncommon',common:'Common'}
    : {uniq:'Уникальное',legend:'Легендарное',rare:'Редкое',uncommon:'Необычное',common:'Обычное'}
  if(pct===undefined)return{label:'',color:'#4a4260'}
  if(pct===0)return{label:L.uniq,color:'#ffd700'}
  if(pct<2) return{label:`${pct}% · ${L.legend}`,color:'#ffd700'}
  if(pct<10)return{label:`${pct}% · ${L.rare}`,color:'#c79bff'}
  if(pct<35)return{label:`${pct}% · ${L.uncommon}`,color:'#4dffaa'}
  return{label:`${pct}% · ${L.common}`,color:'#6a6280'}
}

// ── Туториал ──
export const TUTORIAL_SLIDES = [
  {icon:'🧠',title:'Сравни числа',body:'Тебе покажут два числа. Твоя задача — определить: они равные или разные?'},
  {icon:'✅',title:'Управление',body:'Нажми  =  если числа РАВНЫЕ.\nНажми  ≠  если числа РАЗНЫЕ.\nДействуй быстро — время ограничено!'},
  {icon:'⏱',title:'Таймер',body:'Правильный ответ → добавляет секунды к таймеру.\nОшибка → забирает секунды.\nИгра заканчивается, когда таймер дойдёт до нуля.'},
  {icon:'📈',title:'Уровни и очки',body:'Каждые 5 правильных ответов — новый уровень.\nЧисла становятся длиннее, очки выше.\nЧем выше уровень — тем больше очков за каждый ответ.'},
  {icon:'🎓',title:'Готов?',body:'Сейчас начнётся тренировка — 45 секунд без зачёта в рейтинг.\nОчки и достижения не учитываются. Просто привыкни к ритму!'},
]

// ── Телеметрия ──
export interface DayRec{
  date:string; sessions:number; best_score:number; avg_score:number
  avg_accuracy:number; avg_apm:number; avg_stability_drop:number
  max_recov:number; max_level:number
  best_accuracy:number; best_apm:number
}

// Гость — id не чисто числовой (например "g_abc"). У TG-юзера id — Telegram user_id (число)
export const isGuestId=(uid:string):boolean=>!uid||!/^\d+$/.test(uid)

// ── localStorage-телеметрия для гостей ──
// Структура: { "2026-05-22": { sessions, best_score, sum_score, sum_acc, sum_apm, sum_sd, max_recov, max_level, best_accuracy, best_apm } }
type GuestDayRaw={
  sessions:number; best_score:number; sum_score:number
  sum_acc:number; sum_apm:number; sum_sd:number
  max_recov:number; max_level:number
  best_accuracy:number; best_apm:number
}
const GUEST_TEL_KEY='nm_guest_telemetry'
const todayStr=()=>new Date().toISOString().slice(0,10)

function loadGuestTelemetry():Record<string,GuestDayRaw>{
  try{return JSON.parse(localStorage.getItem(GUEST_TEL_KEY)||'{}')}catch{return{}}
}
function saveGuestTelemetry(d:Record<string,GuestDayRaw>){
  try{localStorage.setItem(GUEST_TEL_KEY,JSON.stringify(d))}catch{}
}

// Записать сессию гостя в localStorage. Возвращает sessionsToday (как сервер для TG)
export function writeGuestTelemetry(r:{score:number;accuracy:number;apm:number;stabilityDrop:number;maxRecov:number;level:number}):number{
  const d=loadGuestTelemetry()
  const today=todayStr()
  const cur=d[today]||{sessions:0,best_score:0,sum_score:0,sum_acc:0,sum_apm:0,sum_sd:0,max_recov:0,max_level:1,best_accuracy:0,best_apm:0}
  const isNewBest=r.score>=cur.best_score
  d[today]={
    sessions:cur.sessions+1,
    best_score:Math.max(cur.best_score,r.score),
    sum_score:cur.sum_score+r.score,
    sum_acc:cur.sum_acc+r.accuracy,
    sum_apm:cur.sum_apm+r.apm,
    sum_sd:cur.sum_sd+r.stabilityDrop,
    max_recov:Math.max(cur.max_recov,r.maxRecov),
    max_level:Math.max(cur.max_level,r.level),
    best_accuracy:isNewBest?Math.round(r.accuracy):cur.best_accuracy,
    best_apm:isNewBest?Math.round(r.apm):cur.best_apm,
  }
  // Чистим записи старше 90 дней
  const cutoff=new Date(Date.now()-90*86400000).toISOString().slice(0,10)
  for(const k of Object.keys(d))if(k<cutoff)delete d[k]
  saveGuestTelemetry(d)
  return d[today].sessions
}

// Прочитать телеметрию гостя из localStorage в формате DayRec[]
function readGuestTelemetry(days:number):DayRec[]{
  const d=loadGuestTelemetry()
  const cutoff=new Date(Date.now()-days*86400000).toISOString().slice(0,10)
  return Object.entries(d)
    .filter(([date])=>date>=cutoff)
    .map(([date,r])=>({
      date,
      sessions:r.sessions,
      best_score:r.best_score,
      avg_score:r.sessions?Math.round(r.sum_score/r.sessions):0,
      avg_accuracy:r.sessions?Math.round(r.sum_acc/r.sessions):0,
      avg_apm:r.sessions?Math.round(r.sum_apm/r.sessions):0,
      avg_stability_drop:r.sessions?Math.round(r.sum_sd/r.sessions):0,
      max_recov:r.max_recov,
      max_level:r.max_level,
      best_accuracy:r.best_accuracy,
      best_apm:r.best_apm,
    }))
    .sort((a,b)=>a.date.localeCompare(b.date))
}

export async function fetchTelemetry(userId:string,days=90):Promise<DayRec[]>{
  // Гости — читаем из localStorage, сервер не дёргаем
  if(isGuestId(userId))return readGuestTelemetry(days)
  try{
    const res=await fetch(`/api/telemetry/${encodeURIComponent(userId)}?days=${days}`)
    if(!res.ok)return[]
    const rows=await res.json()
    if(!Array.isArray(rows))return[]
    return rows.map((r:Record<string,unknown>)=>({
      date:String(r.date),
      sessions:Number(r.sessions),
      best_score:Number(r.best_score),
      avg_score:Number(r.avg_score||r.best_score),
      avg_accuracy:Number(r.avg_accuracy),
      avg_apm:Number(r.avg_apm),
      avg_stability_drop:Number(r.avg_stability_drop),
      max_recov:Number(r.max_recov),
      max_level:Number(r.max_level),
      best_accuracy:Number(r.best_accuracy||r.avg_accuracy),
      best_apm:Number(r.best_apm||r.avg_apm),
    }))
  }catch{return[]}
}
