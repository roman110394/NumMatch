// NumMatch v6.0 — server (PostgreSQL)
require('dotenv').config()

const http = require('http')
const fs   = require('fs')
const path = require('path')
const zlib = require('zlib')
const { Pool } = require('pg')

// ════════════════════════════════════════
// КОНФИГ
// ════════════════════════════════════════
const BOT_TOKEN    = process.env.BOT_TOKEN    || ''
const GROUP_ID     = process.env.GROUP_ID     || ''
const GAME_URL     = process.env.GAME_URL     || 'https://num-match.mooo.com'
const ALERT_CHAT_ID = process.env.ALERT_CHAT_ID || ''  // твой Telegram user_id (@userinfobot)
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ''

// ════════════════════════════════════════
// ERROR ALERTS → Telegram личка
// ════════════════════════════════════════
let _lastAlerts = {}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
// Маска ника для ЛС с ботом (глобальный топ/уведомления) — в группах не используется
function maskName(name) {
  const mask = (s) => {
    const l = s.length
    const hide = l >= 13 ? 5 : l >= 9 ? 4 : 3
    const show = Math.max(2, l - hide)
    return s.slice(0, show) + '***'
  }
  const n = String(name)
  if (n.startsWith('@')) return '@' + mask(n.slice(1))
  return mask(n)
}

async function alertError(err, ctx) {
  console.error(ctx ? `[${ctx}]` : '', err)
  if (!BOT_TOKEN || !ALERT_CHAT_ID) return
  const key = `${ctx}:${err?.message}`
  const now  = Date.now()
  if (_lastAlerts[key] && now - _lastAlerts[key] < 10 * 60 * 1000) return
  _lastAlerts[key] = now
  const stack = (err?.stack || String(err)).slice(0, 600)
  const text  = `❌ <b>NumMatch error</b>${ctx ? ` [${ctx}]` : ''}\n<pre>${escHtml(stack)}</pre>`
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ALERT_CHAT_ID, text, parse_mode: 'HTML' })
  }).catch(() => {})
}

process.on('uncaughtException',  err => alertError(err, 'uncaughtException'))
process.on('unhandledRejection', err => alertError(err, 'unhandledRejection'))

// ════════════════════════════════════════
// POSTGRESQL
// ════════════════════════════════════════
const pool = new Pool({
  host:                    process.env.PG_HOST     || 'localhost',
  port:                    parseInt(process.env.PG_PORT || '5432'),
  database:                process.env.PG_DB       || 'nummatch',
  user:                    process.env.PG_USER     || 'nummatch',
  password:                process.env.PG_PASSWORD || '',
  max:                     10,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', err => console.error('PG pool error:', err.message))

// Определяет английский язык по language_code из Telegram
const en = lc => lc && /^en/i.test(lc)

// Гость (НЕ TG-юзер) — id не чисто числовой (например "g_abc123" из localStorage)
// Для гостей сервер НИЧЕГО не пишет в БД — вся их статистика только в localStorage клиента
const isGuest = uid => !uid || !/^\d+$/.test(String(uid))

// Резолвит язык пользователя: сначала смотрит в user_prefs, иначе fallback на language_code
async function langOf(userId, lcFallback) {
  if (userId) {
    try {
      const { rows } = await q('SELECT lang FROM user_prefs WHERE user_id = $1', [String(userId)])
      if (rows[0]?.lang) return rows[0].lang
    } catch {}
  }
  return en(lcFallback) ? 'en' : 'ru'
}

async function setUserLang(userId, lang) {
  if (!userId) return
  await q(
    `INSERT INTO user_prefs (user_id, lang) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET lang = EXCLUDED.lang`,
    [String(userId), lang]
  )
}

async function q(sql, params = []) {
  const client = await pool.connect()
  try { return await client.query(sql, params) }
  finally { client.release() }
}

// Проверка соединения + миграции при старте
pool.connect()
  .then(async client => {
    console.log('✅ PostgreSQL подключён')
    client.release()
    // Создаём все базовые таблицы если их нет (идемпотентно)
    try {
      await q(`
        CREATE TABLE IF NOT EXISTS players (
          user_id      TEXT PRIMARY KEY,
          name         TEXT NOT NULL,
          score        BIGINT NOT NULL DEFAULT 0,
          games_played INT NOT NULL DEFAULT 0,
          updated_at   TIMESTAMP DEFAULT NOW()
        )
      `)
      await q(`
        CREATE TABLE IF NOT EXISTS achievements (
          user_id     TEXT NOT NULL,
          achievement TEXT NOT NULL,
          PRIMARY KEY (user_id, achievement)
        )
      `)
      await q(`
        CREATE TABLE IF NOT EXISTS groups (
          group_id  BIGINT PRIMARY KEY,
          title     TEXT,
          added_by  BIGINT,
          lang      TEXT NOT NULL DEFAULT 'ru',
          added_at  TIMESTAMP DEFAULT NOW()
        )
      `)
      await q(`
        CREATE TABLE IF NOT EXISTS group_scores (
          user_id    TEXT NOT NULL,
          group_id   BIGINT NOT NULL,
          name       TEXT NOT NULL,
          score      BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (user_id, group_id)
        )
      `)
      // Добавляем новые столбцы если их нет (для существующих БД)
      await q(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS added_by BIGINT`)
      await q(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'ru'`)
      await q(`ALTER TABLE telemetry_daily ADD COLUMN IF NOT EXISTS best_accuracy INT NOT NULL DEFAULT 0`)
      await q(`ALTER TABLE telemetry_daily ADD COLUMN IF NOT EXISTS best_apm      INT NOT NULL DEFAULT 0`)
      // games_at_record: сколько игр сыграно к моменту установки текущего рекорда.
      // Нужно для честного рейтинга «быстрообучаемых» (score / games_at_record).
      await q(`ALTER TABLE players ADD COLUMN IF NOT EXISTS games_at_record INT NOT NULL DEFAULT 1`)
      // Бэкфилл для старых строк: ставим games_played (приближение, лучше чем 1 для legacy)
      await q(`UPDATE players SET games_at_record = GREATEST(games_played, 1) WHERE games_at_record = 1 AND games_played > 1`)
      await q(`
        CREATE TABLE IF NOT EXISTS referrals (
          referrer_id TEXT NOT NULL,
          referred_id TEXT NOT NULL,
          played       BOOLEAN DEFAULT FALSE,
          created_at   TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (referrer_id, referred_id)
        )
      `)
      // Мета-таблица для флагов миграций
      await q(`CREATE TABLE IF NOT EXISTS system_meta (key TEXT PRIMARY KEY, value TEXT)`)
      // Пользовательские предпочтения (язык бота)
      await q(`CREATE TABLE IF NOT EXISTS user_prefs (user_id TEXT PRIMARY KEY, lang TEXT NOT NULL DEFAULT 'ru')`)
      // Новая таблица: одна строка на пользователя в день, скользящее среднее
      await q(`
        CREATE TABLE IF NOT EXISTS telemetry_daily (
          user_id             TEXT NOT NULL,
          date                DATE NOT NULL DEFAULT CURRENT_DATE,
          sessions_count      INT  NOT NULL DEFAULT 0,
          best_score          INT  NOT NULL DEFAULT 0,
          avg_score           NUMERIC(10,2) NOT NULL DEFAULT 0,
          avg_accuracy        NUMERIC(5,2)  NOT NULL DEFAULT 0,
          avg_apm             NUMERIC(5,2)  NOT NULL DEFAULT 0,
          avg_stability_drop  NUMERIC(5,2)  NOT NULL DEFAULT 0,
          max_recov           INT  NOT NULL DEFAULT 0,
          max_level           INT  NOT NULL DEFAULT 1,
          best_accuracy       INT  NOT NULL DEFAULT 0,
          best_apm            INT  NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, date)
        )
      `)
      // Мигрируем исторические данные из старой telemetry → telemetry_daily (один раз)
      const { rows: migFlag } = await q(`SELECT 1 FROM system_meta WHERE key = 'telemetry_migrated'`)
      if (migFlag.length === 0) {
        try {
          await q(`
            INSERT INTO telemetry_daily
              (user_id, date, sessions_count, best_score, avg_score, avg_accuracy, avg_apm, avg_stability_drop, max_recov, max_level)
            SELECT
              user_id, date::date, COUNT(*)::int,
              MAX(score)::int, ROUND(AVG(score))::int,
              ROUND(AVG(accuracy))::int, ROUND(AVG(apm))::int,
              ROUND(AVG(stability_drop))::int,
              MAX(max_recov)::int, MAX(level)::int
            FROM telemetry
            GROUP BY user_id, date::date
            ON CONFLICT (user_id, date) DO NOTHING
          `)
        } catch(e) { /* telemetry table may not exist on fresh install */ }
        await q(`INSERT INTO system_meta (key,value) VALUES ('telemetry_migrated','1') ON CONFLICT DO NOTHING`)
      }
      console.log('✅ Схема БД актуальна (referrals + groups.added_by + telemetry_daily)')
    } catch(e) { console.error('⚠️ Миграция схемы:', e.message) }
  })
  .catch(err => { console.error('❌ PostgreSQL ошибка:', err.message); process.exit(1) })

// ════════════════════════════════════════
// TELEGRAM BOT
// ════════════════════════════════════════

// Запоминаем последнее сообщение бота в каждом чате чтобы удалять его при следующем
const lastBotMsg = new Map()  // chatId → message_id

async function tgDelete(chatId, messageId) {
  if (!BOT_TOKEN || !chatId || !messageId) return
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId })
  }).catch(() => {})
}

async function tgSend(chatId, text, extra = {}) {
  if (!BOT_TOKEN || !chatId) return
  try {
    // Удаляем предыдущее меню-сообщение
    const prev = lastBotMsg.get(String(chatId))
    if (prev) tgDelete(chatId, prev)

    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra })
    })
    const data = await r.json()
    if (!data.ok) console.error(`TG send error [${chatId}]:`, data.description)
    else if (data.result?.message_id) lastBotMsg.set(String(chatId), data.result.message_id)
    return data
  } catch(e) { console.error('TG send error:', e.message) }
}

async function notifyGroupRecord(groupId, name, score, groupTitle, prevScore) {
  const { rows } = await q('SELECT title, lang FROM groups WHERE group_id = $1', [BigInt(groupId)])
  if (rows.length === 0) return
  const glang = rows[0].lang || 'ru'
  const title = escHtml(rows[0].title || groupTitle || (glang === 'en' ? 'group' : 'группы'))
  const safeName = escHtml(name)
  const prev = prevScore
    ? glang === 'en' ? ` (was ${Number(prevScore).toLocaleString()})` : ` (было ${Number(prevScore).toLocaleString('ru-RU')})`
    : ''
  const text = glang === 'en'
    ? `🏆 <b>${safeName}</b> beat the group record in «${title}»!\n📊 <b>${score.toLocaleString()}</b> pts${prev}`
    : `🏆 <b>${safeName}</b> побил рекорд «${title}»!\n📊 <b>${score.toLocaleString('ru-RU')}</b> очков${prev}`
  await tgSend(groupId, text, {
    reply_markup: { inline_keyboard: [[{ text: glang === 'en' ? '▶ Beat the record' : '▶ Побить рекорд', url: 'https://t.me/nummatchbot/game' }]] }
  })
}


async function notifyDisplaced(userId, name, score, prevRank, newRank, newName, newScore) {
  if (!BOT_TOKEN || !/^\d+$/.test(String(userId))) return
  const medals = ['🥇', '🥈', '🥉']
  const outOfTop3 = newRank > 3
  // ЛС всегда → маскируем имя того, кто потеснил
  const safeName = escHtml(maskName(newName))
  const text = outOfTop3
    ? [
        `⚡ <b>Тебя вытеснили из топ-3!</b>`,
        ``,
        `<b>${safeName}</b> набрал <b>${newScore.toLocaleString('ru-RU')}</b> очков`,
        `Ты перешёл с ${medals[prevRank - 1]} на #${newRank} место`,
        ``,
        `Попробуй отыграться! 🎮`
      ].join('\n')
    : [
        `⚡ <b>В топ-3 тебя потеснили!</b>`,
        ``,
        `<b>${safeName}</b> набрал <b>${newScore.toLocaleString('ru-RU')}</b> очков`,
        `Ты был ${medals[prevRank - 1]}, теперь ${medals[newRank - 1]}`,
        ``,
        `Не уступай! 🎮`
      ].join('\n')
  await tgSend(userId, text, {
    reply_markup: { inline_keyboard: [[{ text: '▶ Играть сейчас', url: 'https://t.me/nummatchbot/game' }]] }
  })
}

async function notifyAchievement(name, achTitle, groupId) {
  if (!BOT_TOKEN) return
  if (groupId) {
    const { rows } = await q('SELECT group_id, lang FROM groups WHERE group_id = $1', [BigInt(groupId)])
    if (rows.length > 0) {
      const glang = rows[0].lang || 'ru'
      const text = glang === 'en'
        ? `🏆 <b>${escHtml(name)}</b> earned the achievement «${escHtml(achTitle)}»!`
        : `🏆 <b>${escHtml(name)}</b> получил достижение «${escHtml(achTitle)}»!`
      await tgSend(groupId, text)
      return
    }
  }
  if (GROUP_ID) await tgSend(GROUP_ID, `🏆 <b>${escHtml(name)}</b> получил достижение «${escHtml(achTitle)}»!`)
}

// ════════════════════════════════════════
// УТИЛИТЫ
// ════════════════════════════════════════
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff',
}

// Расширения, которые стоит сжимать gzip
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.xml'])

const MAX_BODY = 100 * 1024 // 100 KB

function readBody(req) {
  return new Promise((res, rej) => {
    let body = '', size = 0
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) { req.destroy(); rej(new Error('body too large')); return }
      body += c
    })
    req.on('end', () => res(body))
    req.on('error', rej)
  })
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}

// ════════════════════════════════════════
// HTTP СЕРВЕР
// ════════════════════════════════════════
const server = http.createServer(async (req, res) => {
  const [urlPath, queryString] = req.url.split('?')

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

  // ── POST /api/webhook — Telegram updates ──────────────────────────
  if (urlPath === '/api/webhook' && req.method === 'POST') {
    if (WEBHOOK_SECRET) {
      const incoming = req.headers['x-telegram-bot-api-secret-token'] || ''
      if (incoming !== WEBHOOK_SECRET) { res.writeHead(403); res.end(); return }
    }
    try {
      const update = JSON.parse(await readBody(req))

      if (update.my_chat_member) {
        const { chat, new_chat_member } = update.my_chat_member
        if (chat.type === 'group' || chat.type === 'supergroup') {
          const status = new_chat_member.status
          if (status === 'member' || status === 'administrator') {
            const addedBy  = update.my_chat_member.from?.id
            const groupLang = en(update.my_chat_member.from?.language_code) ? 'en' : 'ru'
            const { rows } = await q('SELECT 1 FROM groups WHERE group_id = $1', [BigInt(chat.id)])
            const isNew = rows.length === 0
            if (isNew) {
              await q(
                'INSERT INTO groups (group_id, title, added_by, lang) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
                [BigInt(chat.id), chat.title, addedBy ? BigInt(addedBy) : null, groupLang]
              )
              console.log(`✅ Бот добавлен в группу: "${chat.title}" (${chat.id}) lang=${groupLang}`)
              // Сначала спрашиваем язык — приветствие появится после выбора (в обработчике setlang_*)
              const chooseText = '🌐 <b>Choose your language / Выбери язык</b>\n\nThe bot will speak this language in your group.\nБот будет говорить с группой на этом языке.'
              try {
                const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: chat.id,
                    text: chooseText,
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [[
                      { text: '🇷🇺 Русский', callback_data: 'setlang_ru' },
                      { text: '🇬🇧 English', callback_data: 'setlang_en' },
                    ]]}
                  })
                })
                const sent = await r.json()
                if (sent.ok && sent.result?.message_id) {
                  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chat.id, message_id: sent.result.message_id, disable_notification: true })
                  }).catch(() => {})
                }
              } catch(e) { console.error('welcome post error:', e.message) }
            }
          } else if (status === 'left' || status === 'kicked') {
            await q('DELETE FROM groups WHERE group_id = $1', [BigInt(chat.id)])
            console.log(`❌ Бот удалён из группы: "${chat.title}" (${chat.id})`)
          }
        }
      }

      if (update.callback_query) {
        const cb     = update.callback_query
        const chatId = cb.message?.chat?.id
        const chatType = cb.message?.chat?.type || 'private'
        const userId = String(cb.from?.id || '')
        const lc     = cb.from?.language_code || ''
        const isGroupChat = chatType === 'group' || chatType === 'supergroup'

        if (chatId) {
          // setlang_* в группе → меняет язык группы; в ЛС → язык пользователя
          let popupText = ''
          if (cb.data === 'setlang_en' || cb.data === 'setlang_ru') {
            const newLang = cb.data === 'setlang_en' ? 'en' : 'ru'
            if (isGroupChat) {
              await q('UPDATE groups SET lang = $1 WHERE group_id = $2', [newLang, BigInt(chatId)])
              popupText = newLang === 'en' ? '✅ Group language: English' : '✅ Язык группы: Русский'
            } else {
              await setUserLang(userId, newLang)
              popupText = newLang === 'en' ? '✅ Switched to English' : '✅ Переключено на русский'
            }
          }

          // Отвечаем на callback с попапом
          fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: cb.id, text: popupText || undefined, show_alert: false })
          }).catch(() => {})

          // Резолвим текущий язык (для группы из groups.lang, для ЛС из user_prefs)
          let lang
          if (isGroupChat) {
            const { rows } = await q('SELECT lang FROM groups WHERE group_id = $1', [BigInt(chatId)]).catch(() => ({ rows: [] }))
            lang = rows[0]?.lang || (en(lc) ? 'en' : 'ru')
          } else {
            lang = await langOf(userId, lc)
          }
          const isEn = lang === 'en'
          const backBtn = isEn ? { text: '◀ Main menu', callback_data: 'back' } : { text: '◀ Главное меню', callback_data: 'back' }
          const playBtn = isEn ? { text: '▶ Play', url: 'https://t.me/nummatchbot/game' } : { text: '▶ Играть', url: 'https://t.me/nummatchbot/game' }

          // После выбора языка через кнопку — убираем разметку с приветствия (кнопка больше не нужна)
          if ((cb.data === 'setlang_en' || cb.data === 'setlang_ru') && cb.message?.message_id) {
            const msgId = cb.message.message_id
            // В ЛС: перерисовываем приветствие на новом языке; в группе: только убираем кнопку языка
            if (isGroupChat) {
              const groupTitle = cb.message.chat?.title || ''
              const newText = isEn
                ? `🎮 <b>NumMatch</b> — attention trainer!\n\nCompare numbers fast. The group has its own leaderboard — records are posted here.`
                : `🎮 <b>NumMatch</b> — тренажёр внимательности!\n\nСравнивай числа на скорость. У группы свой рейтинг — рекорды постятся сюда.`
              fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId, message_id: msgId, text: newText, parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: [[{ text: isEn ? '▶ Play' : '▶ Играть', url: `https://t.me/nummatchbot/game?startapp=grp_${Math.abs(chatId)}` }]] }
                })
              }).catch(() => {})
            } else {
              // ЛС — перерисуем меню (без кнопки языка)
              const { rows: pr } = await q('SELECT name, score FROM players WHERE user_id = $1', [userId]).catch(() => ({ rows: [] }))
              const player = pr[0]
              const pName = player ? escHtml(player.name) : ''
              const welcome = isEn
                ? (player
                  ? `👋 <b>${pName}</b>\n\nYour record: <b>${Number(player.score).toLocaleString()}</b> pts\n\n🔔 I'll notify you if someone beats your record`
                  : `🎮 <b>NumMatch</b> — attention trainer!\n\nCompare numbers fast and climb the global leaderboard!`)
                : (player
                  ? `👋 <b>${pName}</b>\n\nТвой рекорд: <b>${Number(player.score).toLocaleString('ru-RU')}</b> очков\n\n🔔 Пришлю сообщение, если тебя обгонят в мировом топе`
                  : `🎮 <b>NumMatch</b> — тренажёр внимательности!\n\nСравнивай числа на скорость и попади в мировой топ!`)
              fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId, message_id: msgId, text: welcome, parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: [
                    [playBtn],
                    [isEn ? { text: '📊 My record', callback_data: 'myrecord' } : { text: '📊 Мой рекорд', callback_data: 'myrecord' },
                     isEn ? { text: '🏆 Top 5', callback_data: 'top' } : { text: '🏆 Топ-5', callback_data: 'top' }]
                  ]}
                })
              }).catch(() => {})
            }
            json(res, 200, { ok: true })
            return
          }

          if (cb.data === 'back') {
            const { rows: pr } = await q('SELECT name, score FROM players WHERE user_id = $1', [userId]).catch(() => ({ rows: [] }))
            const player = pr[0]
            const pName = player ? escHtml(player.name) : ''
            const welcome = isEn
              ? (player
                ? `👋 <b>${pName}</b>\n\nYour record: <b>${Number(player.score).toLocaleString()}</b> pts\n\n🔔 I'll notify you if someone beats your record`
                : `🎮 <b>NumMatch</b> — attention trainer!\n\nCompare numbers fast and climb the global leaderboard!`)
              : (player
                ? `👋 <b>${pName}</b>\n\nТвой рекорд: <b>${Number(player.score).toLocaleString('ru-RU')}</b> очков\n\n🔔 Пришлю сообщение, если тебя обгонят в мировом топе`
                : `🎮 <b>NumMatch</b> — тренажёр внимательности!\n\nСравнивай числа на скорость и попади в мировой топ!`)
            await tgSend(chatId, welcome, {
              reply_markup: { inline_keyboard: [
                [playBtn],
                [isEn ? { text: '📊 My record', callback_data: 'myrecord' } : { text: '📊 Мой рекорд', callback_data: 'myrecord' },
                 isEn ? { text: '🏆 Top 5', callback_data: 'top' } : { text: '🏆 Топ-5', callback_data: 'top' }]
              ]}
            })
          } else if (cb.data === 'top') {
            const { rows } = await q(`SELECT user_id, name, score FROM players WHERE user_id ~ '^[0-9]+$' ORDER BY score DESC LIMIT 5`).catch(() => ({ rows: [] }))
            const medals = ['🥇', '🥈', '🥉', '4.', '5.']
            // В ЛС маскируем чужие ники (свой — нет); в группе показываем как есть
            const lines  = rows.map((r, i) => {
              const isMe = String(r.user_id) === String(userId)
              const display = (!isGroupChat && !isMe) ? maskName(r.name) : r.name
              return `${medals[i]} <b>${escHtml(display)}</b> — ${Number(r.score).toLocaleString('ru-RU')}`
            })
            await tgSend(chatId, `🏆 <b>${isEn ? 'Top 5 NumMatch' : 'Топ-5 NumMatch'}</b>\n\n${lines.join('\n')}`, {
              reply_markup: { inline_keyboard: [[playBtn], [backBtn]] }
            })
          } else if (cb.data === 'myrecord' && userId) {
            const { rows } = await q(`
              SELECT name, score,
                (SELECT COUNT(*)+1 FROM players WHERE score > p.score AND user_id ~ '^[0-9]+$')::int AS rank,
                (SELECT COUNT(*)  FROM players WHERE user_id ~ '^[0-9]+$')::int AS total
              FROM players p WHERE user_id = $1
            `, [userId]).catch(() => ({ rows: [] }))
            if (rows[0]) {
              const r = rows[0]
              const txt = isEn
                ? `📊 <b>${escHtml(r.name)}</b>\nRecord: <b>${Number(r.score).toLocaleString()}</b> pts\n🏅 Rank: #${r.rank} of ${r.total}`
                : `📊 <b>${escHtml(r.name)}</b>\nРекорд: <b>${Number(r.score).toLocaleString('ru-RU')}</b> очков\n🏅 Место: #${r.rank} из ${r.total}`
              await tgSend(chatId, txt, {
                reply_markup: { inline_keyboard: [[isEn ? { text: '▶ Beat my record', url: 'https://t.me/nummatchbot/game' } : { text: '▶ Улучшить рекорд', url: 'https://t.me/nummatchbot/game' }], [backBtn]] }
              })
            } else {
              await tgSend(chatId, isEn ? `📊 You haven't played yet. Start now!` : '📊 Ты ещё не играл. Начни прямо сейчас!', {
                reply_markup: { inline_keyboard: [[playBtn], [backBtn]] }
              })
            }
          }
        }
      }

      if (update.message) {
        const msg    = update.message
        const text   = msg.text || ''
        const chatId = msg.chat.id
        const userId = String(msg.from?.id || '')
        const isPrivate = msg.chat.type === 'private'

        const lc = msg.from?.language_code || ''
        // В группе берём язык из groups.lang, в ЛС — из user_prefs (личный язык пользователя)
        let lang
        if (isPrivate) {
          lang = await langOf(userId, lc)
        } else {
          const { rows: gr } = await q('SELECT lang FROM groups WHERE group_id = $1', [BigInt(chatId)]).catch(() => ({ rows: [] }))
          lang = gr[0]?.lang || (en(lc) ? 'en' : 'ru')
        }
        const isEn = lang === 'en'
        const playBtn = isEn ? { text: '▶ Play', url: 'https://t.me/nummatchbot/game' } : { text: '▶ Играть', url: 'https://t.me/nummatchbot/game' }
        const langBtn = isEn ? { text: '🇷🇺 По-русски', callback_data: 'setlang_ru' } : { text: '🇬🇧 In English', callback_data: 'setlang_en' }

        // Показывать ли кнопку выбора языка в приветствии (только если пользователь ещё не выбрал)
        let showLangBtn = false
        if (isPrivate && userId) {
          const { rows: pf } = await q('SELECT 1 FROM user_prefs WHERE user_id = $1', [userId]).catch(() => ({ rows: [] }))
          showLangBtn = pf.length === 0
        }

        if (text.startsWith('/start') || text.startsWith('/play')) {
          if (isPrivate) {
            const { rows: pr } = await q('SELECT name, score FROM players WHERE user_id = $1', [userId]).catch(() => ({ rows: [] }))
            const player = pr[0]
            const pName2 = player ? escHtml(player.name) : ''
            const welcome = isEn
              ? (player
                ? `👋 Welcome back, <b>${pName2}</b>!\n\nYour record: <b>${Number(player.score).toLocaleString()}</b> pts\n\n🔔 I'll notify you if someone beats your record`
                : `🎮 Hi! I'm the <b>NumMatch</b> bot.\n\nCompare numbers fast and climb the global leaderboard!\n\n🔔 I'll notify you if someone beats your record`)
              : (player
                ? `👋 С возвращением, <b>${pName2}</b>!\n\nТвой рекорд: <b>${Number(player.score).toLocaleString('ru-RU')}</b> очков\n\n🔔 Пришлю сообщение, если тебя обгонят в мировом топе`
                : `🎮 Привет! Я бот <b>NumMatch</b>.\n\nСравнивай числа на скорость и попади в мировой топ!\n\n🔔 Пришлю сообщение, если кто-то побьёт твой рекорд`)
            const kb = [
              [playBtn],
              [isEn ? { text: '📊 My record', callback_data: 'myrecord' } : { text: '📊 Мой рекорд', callback_data: 'myrecord' },
               isEn ? { text: '🏆 Top 5', callback_data: 'top' } : { text: '🏆 Топ-5', callback_data: 'top' }],
            ]
            if (showLangBtn) kb.push([langBtn])
            await tgSend(chatId, welcome, { reply_markup: { inline_keyboard: kb } })
          } else {
            await tgSend(chatId, '🎮 <b>NumMatch</b> — тренажёр внимательности!', {
              reply_markup: { inline_keyboard: [[{ text: '▶ Играть', url: 'https://t.me/nummatchbot/game' }]] }
            })
          }

        } else if (text.startsWith('/myrecord') || text.startsWith('/record')) {
          if (userId) {
            const { rows } = await q(`
              SELECT name, score,
                (SELECT COUNT(*)+1 FROM players WHERE score > p.score AND user_id ~ '^[0-9]+$')::int AS rank,
                (SELECT COUNT(*)  FROM players WHERE user_id ~ '^[0-9]+$')::int AS total
              FROM players p WHERE user_id = $1
            `, [userId]).catch(() => ({ rows: [] }))
            if (rows[0]) {
              const r = rows[0]
              const txt = isEn
                ? `📊 <b>${escHtml(r.name)}</b>\nRecord: <b>${Number(r.score).toLocaleString()}</b> pts\n🏅 Rank: #${r.rank} of ${r.total}`
                : `📊 <b>${escHtml(r.name)}</b>\nРекорд: <b>${Number(r.score).toLocaleString('ru-RU')}</b> очков\n🏅 Место: #${r.rank} из ${r.total}`
              await tgSend(chatId, txt, {
                reply_markup: { inline_keyboard: [[isEn ? { text: '▶ Beat my record', url: 'https://t.me/nummatchbot/game' } : { text: '▶ Улучшить рекорд', url: 'https://t.me/nummatchbot/game' }]] }
              })
            } else {
              await tgSend(chatId, isEn ? `📊 You haven't played yet. Start now!` : '📊 Ты ещё не играл. Начни прямо сейчас!', {
                reply_markup: { inline_keyboard: [[playBtn]] }
              })
            }
          }

        } else if (text.startsWith('/top')) {
          const medals = ['🥇', '🥈', '🥉', '4.', '5.']
          if (isPrivate) {
            // ЛС — глобальный топ NumMatch (чужие ники маскируем)
            const { rows } = await q(`SELECT user_id, name, score FROM players WHERE user_id ~ '^[0-9]+$' ORDER BY score DESC LIMIT 5`).catch(() => ({ rows: [] }))
            const lines = rows.map((r, i) => {
              const isMe = String(r.user_id) === String(userId)
              const display = isMe ? r.name : maskName(r.name)
              return `${medals[i]} <b>${escHtml(display)}</b> — ${Number(r.score).toLocaleString('ru-RU')}`
            })
            await tgSend(chatId, `🏆 <b>${isEn ? 'Top 5 NumMatch' : 'Топ-5 NumMatch'}</b>\n\n${lines.join('\n') || (isEn ? 'No players yet' : 'Пока нет игроков')}`, {
              reply_markup: { inline_keyboard: [[playBtn]] }
            })
          } else {
            // Группа — топ участников именно этой группы
            const { rows } = await q(
              `SELECT name, score FROM group_scores WHERE group_id = $1 ORDER BY score DESC LIMIT 5`,
              [BigInt(chatId)]
            ).catch(() => ({ rows: [] }))
            const lines = rows.map((r, i) => `${medals[i]} <b>${escHtml(r.name)}</b> — ${Number(r.score).toLocaleString('ru-RU')}`)
            const title = isEn ? 'Top 5 of the group' : 'Топ-5 группы'
            const empty = isEn ? 'Nobody has played from this group yet. Be first!' : 'В этой группе ещё никто не играл. Будь первым!'
            const grpPlayBtn = isEn
              ? { text: '▶ Play', url: `https://t.me/nummatchbot/game?startapp=grp_${Math.abs(chatId)}` }
              : { text: '▶ Играть', url: `https://t.me/nummatchbot/game?startapp=grp_${Math.abs(chatId)}` }
            await tgSend(chatId, `🏆 <b>${title}</b>\n\n${lines.join('\n') || empty}`, {
              reply_markup: { inline_keyboard: [[grpPlayBtn]] }
            })
          }

        } else if (text.startsWith('/language') || text.startsWith('/lang')) {
          await tgSend(chatId, isEn ? '🌐 Choose language:' : '🌐 Выбери язык:', {
            reply_markup: { inline_keyboard: [[
              { text: '🇷🇺 Русский', callback_data: 'setlang_ru' },
              { text: '🇬🇧 English', callback_data: 'setlang_en' },
            ]]}
          })

        } else if (text.startsWith('/help')) {
          await tgSend(chatId, isEn ? [
            '🤖 <b>NumMatch Commands</b>',
            '',
            '/myrecord — your record and leaderboard rank',
            '/top — top 5 players',
            '/language — switch language',
            '/start — main menu',
            '',
            '🔔 The bot will automatically notify you if someone beats your record',
          ].join('\n') : [
            '🤖 <b>Команды NumMatch</b>',
            '',
            '/myrecord — твой рекорд и место в рейтинге',
            '/top — топ-5 лучших игроков',
            '/language — сменить язык',
            '/start — главное меню',
            '',
            '🔔 Бот автоматически пришлёт сообщение, если кто-то побьёт твой рекорд в мировом топе',
          ].join('\n'), {
            reply_markup: { inline_keyboard: [[playBtn]] }
          })
        }
      }

      // Inline mode: @nummatchbot в любом чате — разный для группы и ЛС
      if (update.inline_query) {
        const iq = update.inline_query
        const lc = iq.from?.language_code || ''
        const userId = String(iq.from?.id || '')
        const chatType = iq.chat_type || ''
        const isGroup = chatType === 'group' || chatType === 'supergroup'
        const lang = await langOf(userId, lc)
        const isEn = lang === 'en'
        const medals = ['🥇', '🥈', '🥉', '4.', '5.']
        const playBtnUrl = { text: isEn ? '▶ Play NumMatch' : '▶ Играть в NumMatch', url: 'https://t.me/nummatchbot/game' }
        try {
          const results = []
          if (isGroup) {
            // Telegram не передаёт chat_id в inline_query → берём самую свежую группу пользователя
            const { rows: grs } = await q(
              `SELECT gs.group_id, g.title FROM group_scores gs
               JOIN groups g ON g.group_id = gs.group_id
               WHERE gs.user_id = $1 ORDER BY gs.updated_at DESC LIMIT 1`,
              [userId]
            ).catch(() => ({ rows: [] }))
            if (grs[0]) {
              const gid = grs[0].group_id
              const gtitle = grs[0].title || ''
              const { rows: top } = await q(
                `SELECT name, score FROM group_scores WHERE group_id = $1 ORDER BY score DESC LIMIT 5`,
                [gid]
              ).catch(() => ({ rows: [] }))
              const lines = top.map((r, i) => `${medals[i]} <b>${escHtml(r.name)}</b> — ${Number(r.score).toLocaleString('ru-RU')}`)
              const heading = isEn ? `Top of «${escHtml(gtitle)}»` : `Топ группы «${escHtml(gtitle)}»`
              results.push({
                type: 'article',
                id: 'grouptop',
                title: '🏆 ' + (isEn ? 'Group top' : 'Топ группы'),
                description: isEn ? `Top 5 of «${gtitle}»` : `Топ-5 «${gtitle}»`,
                input_message_content: { message_text: `🏆 <b>${heading}</b>\n\n${lines.join('\n')}`, parse_mode: 'HTML' },
                reply_markup: { inline_keyboard: [[playBtnUrl]] }
              })
            } else {
              results.push({
                type: 'article',
                id: 'noplay',
                title: isEn ? '🏆 Group top' : '🏆 Топ группы',
                description: isEn ? 'Play first to see your group top' : 'Сыграй сначала, чтобы увидеть топ группы',
                input_message_content: { message_text: isEn ? 'Play NumMatch to populate this group\'s leaderboard.' : 'Сыграй в NumMatch, чтобы появился топ группы.', parse_mode: 'HTML' },
                reply_markup: { inline_keyboard: [[playBtnUrl]] }
              })
            }
          } else {
            // ЛС / sender — глобальный топ
            const { rows } = await q(
              `SELECT name, score FROM players WHERE user_id ~ '^[0-9]+$' ORDER BY score DESC LIMIT 5`
            ).catch(() => ({ rows: [] }))
            const lines  = rows.map((r, i) => `${medals[i]} <b>${escHtml(r.name)}</b> — ${Number(r.score).toLocaleString('ru-RU')}`)
            const title  = isEn ? 'Top 5 NumMatch' : 'Топ-5 NumMatch'
            results.push({
              type: 'article',
              id: 'top5',
              title: '🏆 ' + title,
              description: isEn ? 'Share the global leaderboard' : 'Поделиться мировым рейтингом',
              input_message_content: { message_text: `🏆 <b>${title}</b>\n\n${lines.join('\n')}`, parse_mode: 'HTML' },
              reply_markup: { inline_keyboard: [[playBtnUrl]] }
            })
          }
          fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerInlineQuery`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inline_query_id: iq.id, results, cache_time: 30, is_personal: true })
          }).catch(() => {})
        } catch(e) { alertError(e, 'inline_query') }
      }

      json(res, 200, { ok: true })
    } catch(e) { alertError(e, '/api/webhook'); json(res, 200, { ok: true }) }
    return
  }

  // ── GET /api/leaderboard ──────────────────────────────────────────
  if (urlPath === '/api/leaderboard' && req.method === 'GET') {
    const params  = new URLSearchParams(queryString || '')
    const groupId = params.get('group')
    try {
      if (groupId) {
        const { rows } = await q(`
          SELECT user_id AS "userId", name, score, updated_at AS date
          FROM group_scores
          WHERE group_id = $1
          ORDER BY score DESC
          LIMIT 20
        `, [BigInt(groupId)])
        json(res, 200, rows)
      } else {
        const { rows } = await q(`
          SELECT user_id AS "userId", name, score, updated_at AS date,
                 games_played AS "gamesPlayed", games_at_record AS "gamesAtRecord"
          FROM players
          ORDER BY score DESC
          LIMIT 100
        `)
        json(res, 200, rows)
      }
    } catch(e) { alertError(e, '/api/leaderboard'); json(res, 500, { error: e.message }) }
    return
  }

  // ── POST /api/save ────────────────────────────────────────────────
  if (urlPath === '/api/save' && req.method === 'POST') {
    try {
      const { userId, name, score, groupId, groupIds, sessionSec, apm } = JSON.parse(await readBody(req))
      const allGroupIds  = groupIds?.length > 0 ? groupIds : (groupId ? [groupId] : [])
      const trimName     = escHtml((name || '').trim() || 'Аноним')
      const parsedScore  = Number(score) || 0
      const uid          = String(userId)
      const parsedApm    = Number(apm) || 0

      // Гости (не TG-юзеры) — не пишем ничего в БД, статистика только локально
      if (isGuest(uid)) { json(res, 200, { status: 'guest_skip' }); return }

      // ── Антифрод ──────────────────────────────────────────────────
      // Физический максимум: уровень 13+, 700 очков, 3 ответа/сек → 2100 pts/sec
      const MAX_SCORE = 500_000
      const sec = Number(sessionSec) || 0
      if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > MAX_SCORE) {
        json(res, 400, { status: 'invalid_score' }); return
      }
      if (sec > 10 && parsedScore > sec * 2100) {
        alertError(new Error(`Suspicious score: ${parsedScore} in ${sec}s (uid=${uid})`), 'antifrod')
        json(res, 400, { status: 'invalid_score' }); return
      }
      // ── APM-фильтр: человек физически не может делать >200 ответов/мин ──
      // Бот на 30ms интервале даёт ~1500-2000 APM — очевидная аномалия
      // Shadow-ban: возвращаем 200 (бот не знает что заблокирован), но не сохраняем
      if (parsedApm > 0 && parsedApm > 350) {
        console.warn(`[anticheat] BOT uid=${uid} apm=${parsedApm} score=${parsedScore}`)
        json(res, 200, { status: 'ignored', wasNewRecord: false, wasNewGroupRecord: false }); return
      }

      // ── Глобальный рейтинг ──
      // Запоминаем топ-3 до обновления чтобы понять кого вытеснят
      const prevTopRes = await q('SELECT user_id, name, score FROM players ORDER BY score DESC LIMIT 3')
      const prevTop3 = prevTopRes.rows

      // Проверка уникальности имени (другой пользователь)
      const nameCheck = await q(
        'SELECT user_id FROM players WHERE LOWER(name) = LOWER($1) AND user_id != $2',
        [trimName, uid]
      )
      if (nameCheck.rows.length > 0) { json(res, 200, { status: 'name_taken' }); return }

      // Текущий рекорд игрока
      const existing = await q('SELECT score FROM players WHERE user_id = $1', [uid])
      const prevScore = existing.rows[0]?.score ?? null

      let wasNewRecord = false
      let status = 'ignored'

      if (existing.rows.length > 0) {
        // Всегда инкрементируем счётчик игр
        await q('UPDATE players SET games_played = games_played + 1 WHERE user_id = $1', [uid])
        if (parsedScore > existing.rows[0].score) {
          // Новый рекорд → фиксируем СКОЛЬКО игр потребовалось чтобы его установить
          // games_played уже инкрементирован выше, поэтому games_at_record = games_played
          await q(
            'UPDATE players SET name = $1, score = $2, updated_at = NOW(), games_at_record = games_played WHERE user_id = $3',
            [trimName, parsedScore, uid]
          )
          wasNewRecord = true
          status = 'updated'
        }
      } else {
        await q(
          'INSERT INTO players (user_id, name, score, games_played, games_at_record) VALUES ($1, $2, $3, 1, 1)',
          [uid, trimName, parsedScore]
        )
        wasNewRecord = true
        status = 'ok'
      }

      // ── Рейтинги групп ──
      let wasNewGroupRecord = false
      const groupNotifications = []

      for (const gid of allGroupIds) {
        const bigGid = BigInt(gid)

        // Убедимся что группа есть (могла не пройти через webhook)
        await q(
          'INSERT INTO groups (group_id, title) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [bigGid, 'Группа']
        )

        // Текущий рекорд группы до обновления
        const beforeTop = await q(
          'SELECT score FROM group_scores WHERE group_id = $1 ORDER BY score DESC LIMIT 1',
          [bigGid]
        )
        const prevGroupRecord = beforeTop.rows[0]?.score ?? null

        const gEntry = await q(
          'SELECT score FROM group_scores WHERE user_id = $1 AND group_id = $2',
          [uid, bigGid]
        )

        if (gEntry.rows.length > 0) {
          if (parsedScore > gEntry.rows[0].score) {
            await q(
              'UPDATE group_scores SET name = $1, score = $2, updated_at = NOW() WHERE user_id = $3 AND group_id = $4',
              [trimName, parsedScore, uid, bigGid]
            )
            wasNewGroupRecord = true
            // Проверяем стало ли #1
            const afterTop = await q(
              'SELECT user_id FROM group_scores WHERE group_id = $1 ORDER BY score DESC LIMIT 1',
              [bigGid]
            )
            if (afterTop.rows[0]?.user_id === uid && parsedScore > (prevGroupRecord || 0)) {
              groupNotifications.push({ gid, score: parsedScore, prevRecord: prevGroupRecord })
            }
          }
        } else {
          await q(
            'INSERT INTO group_scores (user_id, group_id, name, score) VALUES ($1, $2, $3, $4)',
            [uid, bigGid, trimName, parsedScore]
          )
          wasNewGroupRecord = true
          if (!prevGroupRecord || parsedScore > prevGroupRecord) {
            groupNotifications.push({ gid, score: parsedScore, prevRecord: prevGroupRecord })
          }
        }
      }

      // ── Уведомления (не блокируем ответ) ──
      if (wasNewRecord) {
        const { rows: newTop3 } = await q(
          'SELECT user_id FROM players ORDER BY score DESC LIMIT 3'
        )
        const newRankMap = new Map(newTop3.map((r, i) => [r.user_id, i + 1]))
        // Уведомляем личным сообщением тех из предыдущего топ-3 кого вытеснил новый игрок
        for (let i = 0; i < prevTop3.length; i++) {
          const prev = prevTop3[i]
          if (prev.user_id === uid) continue // сам игрок — пропускаем
          const prevRank = i + 1
          const newRank  = newRankMap.get(prev.user_id) ?? 4 // 4 = вылетел из топ-3
          if (newRank > prevRank) {
            notifyDisplaced(prev.user_id, prev.name, Number(prev.score), prevRank, newRank, trimName, parsedScore)
          }
        }
      }
      for (const { gid, score: s, prevRecord } of groupNotifications) {
        notifyGroupRecord(gid, trimName, s, null, prevRecord)
      }

      json(res, 200, { status, wasNewRecord, wasNewGroupRecord })
    } catch(e) { alertError(e, '/api/save'); json(res, 500, { error: e.message }) }
    return
  }

  // ── GET /api/achievements/:userId ──────────────────────────────────
  // ВАЖНО: исключаем /stats (он обрабатывается ниже как отдельный роут)
  if (urlPath.startsWith('/api/achievements/') && urlPath !== '/api/achievements/stats' && req.method === 'GET') {
    const uid = decodeURIComponent(urlPath.slice('/api/achievements/'.length))
    try {
      const { rows } = await q(
        'SELECT achievement FROM achievements WHERE user_id = $1',
        [uid]
      )
      json(res, 200, { achievements: rows.map(r => r.achievement) })
    } catch(e) { json(res, 500, { error: e.message }) }
    return
  }

  // ── POST /api/achievements ──────────────────────────────────────────
  if (urlPath === '/api/achievements' && req.method === 'POST') {
    try {
      const { userId, achievements, groupId } = JSON.parse(await readBody(req))
      const uid = String(userId)

      // Гости — не пишем ачивки в БД
      if (isGuest(uid)) { json(res, 200, { status: 'guest_skip', new: [] }); return }

      const playerCheck = await q('SELECT name FROM players WHERE user_id = $1', [uid])
      if (playerCheck.rows.length === 0) { json(res, 200, { status: 'no_user' }); return }

      const existing = await q('SELECT achievement FROM achievements WHERE user_id = $1', [uid])
      const prevSet  = new Set(existing.rows.map(r => r.achievement))
      const newOnes  = (achievements || []).filter(a => !prevSet.has(a))

      for (const ach of newOnes) {
        await q(
          'INSERT INTO achievements (user_id, achievement) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [uid, String(ach)]
        )
      }

      json(res, 200, { status: 'ok', new: newOnes })

      if (newOnes.length > 0) {
        const IMPORTANT = ['s100000','s150000','str150','rank1','rank10','absolute','l20','l30','delorean']
        const NAMES = {
          s100000:   'Критическая масса (100 000 очков)',
          s150000:   'Верхний допуск (150 000 очков)',
          str150:    'Состояние потока (150 подряд)',
          rank1:     'Номер 1 (#1 в рейтинге)',
          rank10:    'Серебряный след (Топ-10)',
          absolute:  'Абсолют (идеальная игра)',
          l20:       'Гроссмейстер (20-й уровень)',
          l30:       'Пограничный режим (30-й уровень)',
          delorean:  'Delorean (таймер > 3:00)',
        }
        const name = playerCheck.rows[0].name
        newOnes.filter(a => IMPORTANT.includes(a)).forEach(a => {
          notifyAchievement(name, NAMES[a] || a, groupId)
        })
      }
    } catch(e) { json(res, 500, { error: e.message }) }
    return
  }

  // ── POST /api/check-name ──────────────────────────────────────────
  if (urlPath === '/api/check-name' && req.method === 'POST') {
    try {
      const { name, userId } = JSON.parse(await readBody(req))
      const { rows } = await q(
        'SELECT 1 FROM players WHERE LOWER(name) = LOWER($1) AND user_id != $2',
        [(name || '').trim(), String(userId || '')]
      )
      json(res, 200, { taken: rows.length > 0 })
    } catch(e) { json(res, 500, { error: e.message }) }
    return
  }

  // ── GET /api/stats ────────────────────────────────────────────────
  if (urlPath === '/api/stats' && req.method === 'GET') {
    try {
      const { rows } = await q(`
        SELECT
          (SELECT COUNT(*) FROM players)                 AS total_players,
          (SELECT name  FROM players ORDER BY score DESC LIMIT 1) AS leader_name,
          (SELECT score FROM players ORDER BY score DESC LIMIT 1) AS leader_score
      `)
      const r = rows[0]
      json(res, 200, {
        total_players: Number(r.total_players),
        leader: r.leader_name ? { name: r.leader_name, score: Number(r.leader_score) } : null
      })
    } catch(e) { json(res, 500, { error: e.message }) }
    return
  }

  // ── GET /api/groups ───────────────────────────────────────────────
  if (urlPath === '/api/groups' && req.method === 'GET') {
    try {
      const { rows } = await q('SELECT group_id AS id, title FROM groups ORDER BY added_at')
      json(res, 200, { groups: rows.map(r => ({ ...r, id: Number(r.id) })) })
    } catch(e) { json(res, 500, { error: e.message }) }
    return
  }

  // ── GET /api/mygroups/:userId ─────────────────────────────────────
  if (urlPath.startsWith('/api/mygroups/') && req.method === 'GET') {
    const userId = urlPath.slice('/api/mygroups/'.length)
    if (!BOT_TOKEN || !/^\d+$/.test(userId)) { json(res, 200, { groups: [] }); return }
    try {
      const { rows: allGroups } = await q('SELECT group_id AS id, title FROM groups')
      if (allGroups.length === 0) { json(res, 200, { groups: [] }); return }
      const numId   = parseInt(userId)
      const results = await Promise.all(
        allGroups.map(async group => {
          try {
            const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: Number(group.id), user_id: numId })
            })
            const data = await r.json()
            if (data.ok && ['creator','administrator','member','restricted'].includes(data.result?.status)) {
              return { id: Number(group.id), title: group.title }
            }
          } catch(e) {}
          return null
        })
      )
      json(res, 200, { groups: results.filter(Boolean) })
    } catch(e) { json(res, 500, { error: e.message }) }
    return
  }

  // ── POST /api/telemetry — сохранение телеметрии сессии ───────────
  if (urlPath === '/api/telemetry' && req.method === 'POST') {
    try {
      const { userId, score, accuracy, apm, stabilityDrop, maxRecov, level, refBy } = JSON.parse(await readBody(req))
      const uid = String(userId || '')
      if (!uid) { console.warn('[telemetry] no userId'); json(res, 200, { status: 'no_user' }); return }
      // Гости — телеметрия ведётся только в localStorage клиента, не в БД
      if (isGuest(uid)) { json(res, 200, { status: 'guest_skip', sessionNum: 1, counted: true }); return }
      const sc  = Number(score)      || 0
      const acc = Number(accuracy)   || 0
      const ap  = Number(apm)        || 0

      // ── Второй рубеж антифрода ──────────────────────────────────
      // Если APM-чек в /api/score обошли (старый клиент без поля apm),
      // ловим здесь: APM>350 + точность >96% = бот, откатываем рекорд
      if (ap > 350 && acc >= 96) {
        console.warn(`[anticheat] BOT (telemetry) uid=${uid} apm=${ap} acc=${acc} score=${sc}`)
        // Откатываем если этот score только что стал рекордом
        await q(
          `UPDATE players SET score = COALESCE(
            (SELECT MAX(t2.best_score) FROM telemetry_daily t2
             WHERE t2.user_id=$1 AND t2.date < CURRENT_DATE),
            0
          ), updated_at = NOW()
          WHERE user_id = $1 AND score = $2`,
          [uid, sc]
        ).catch(() => {})
        json(res, 200, { status: 'ok', sessionNum: 1, counted: false }); return
      }
      console.log(`[telemetry] write uid=${uid} score=${sc} acc=${acc} apm=${ap}`)
      const sd  = Number(stabilityDrop) || 0
      const mr  = Number(maxRecov)   || 0
      const lv  = Number(level)      || 1

      // UPSERT: одна строка в день, скользящее среднее
      await q(`
        INSERT INTO telemetry_daily
          (user_id, date, sessions_count, best_score, avg_score, avg_accuracy, avg_apm, avg_stability_drop, max_recov, max_level, best_accuracy, best_apm)
        VALUES ($1, CURRENT_DATE, 1, $2::int, $2::numeric, $3::numeric, $4::numeric, $5::numeric, $6::int, $7::int, $8::int, $9::int)
        ON CONFLICT (user_id, date) DO UPDATE SET
          sessions_count     = telemetry_daily.sessions_count + 1,
          best_score         = GREATEST(telemetry_daily.best_score, EXCLUDED.best_score),
          avg_score          = (telemetry_daily.avg_score * telemetry_daily.sessions_count + EXCLUDED.avg_score)
                               / (telemetry_daily.sessions_count + 1),
          avg_accuracy       = (telemetry_daily.avg_accuracy * telemetry_daily.sessions_count + EXCLUDED.avg_accuracy)
                               / (telemetry_daily.sessions_count + 1),
          avg_apm            = (telemetry_daily.avg_apm * telemetry_daily.sessions_count + EXCLUDED.avg_apm)
                               / (telemetry_daily.sessions_count + 1),
          avg_stability_drop = (telemetry_daily.avg_stability_drop * telemetry_daily.sessions_count + EXCLUDED.avg_stability_drop)
                               / (telemetry_daily.sessions_count + 1),
          max_recov          = GREATEST(telemetry_daily.max_recov, EXCLUDED.max_recov),
          max_level          = GREATEST(telemetry_daily.max_level, EXCLUDED.max_level),
          best_accuracy      = CASE WHEN EXCLUDED.best_score >= telemetry_daily.best_score THEN EXCLUDED.best_accuracy ELSE telemetry_daily.best_accuracy END,
          best_apm           = CASE WHEN EXCLUDED.best_score >= telemetry_daily.best_score THEN EXCLUDED.best_apm      ELSE telemetry_daily.best_apm      END
      `, [uid, sc, acc, ap, sd, mr, lv, acc, ap])

      // Сессий сегодня после UPSERT
      const { rows: ct } = await q(
        'SELECT sessions_count FROM telemetry_daily WHERE user_id = $1 AND date = CURRENT_DATE',
        [uid]
      )
      const sessionsToday = Number(ct[0]?.sessions_count || 1)

      // Реферал: если пришёл по ссылке ref_<referrerId> — записываем
      if (refBy && typeof refBy === 'string' && refBy !== uid) {
        await q(`
          INSERT INTO referrals (referrer_id, referred_id, played)
          VALUES ($1, $2, TRUE)
          ON CONFLICT (referrer_id, referred_id) DO UPDATE SET played = TRUE
        `, [refBy, uid])
      }

      console.log(`[telemetry] saved uid=${uid} session#${sessionsToday}`)
      json(res, 200, { status: 'ok', sessionNum: sessionsToday, counted: true })
    } catch(e) { console.error('[telemetry] POST error:', e.message); json(res, 500, { error: e.message }) }
    return
  }

  // ── GET /api/telemetry/:userId — статистика игрока ───────────────
  if (urlPath.startsWith('/api/telemetry/') && req.method === 'GET') {
    const uid    = decodeURIComponent(urlPath.slice('/api/telemetry/'.length))
    const params = new URLSearchParams(queryString || '')
    const days   = Math.min(parseInt(params.get('days') || '90'), 90)
    // Гости — нет персистентной телеметрии, клиент сам читает из localStorage
    if (isGuest(uid)) { json(res, 200, []); return }
    try {
      const { rows } = await q(`
        SELECT
          date::text,
          sessions_count                   AS sessions,
          best_score,
          ROUND(avg_score)::int            AS avg_score,
          ROUND(avg_accuracy)::int         AS avg_accuracy,
          ROUND(avg_apm)::int              AS avg_apm,
          ROUND(avg_stability_drop)::int   AS avg_stability_drop,
          max_recov,
          max_level,
          best_accuracy,
          best_apm
        FROM telemetry_daily
        WHERE user_id = $1 AND date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
        ORDER BY date ASC
      `, [uid, days])
      console.log(`[telemetry] read uid=${uid} days=${days} rows=${rows.length}`)
      json(res, 200, rows)
    } catch(e) { console.error('[telemetry] GET error:', e.message); json(res, 500, { error: e.message }) }
    return
  }

  // ── GET /api/achievements/stats — редкость ачивок ────────────────
  // Считаем только среди TG-игроков (user_id чисто числовой), без гостей (g_*)
  if (urlPath === '/api/achievements/stats' && req.method === 'GET') {
    try {
      const [{ rows: counts }, { rows: totals }] = await Promise.all([
        q(`SELECT achievement AS id, COUNT(DISTINCT user_id)::int AS cnt
           FROM achievements
           WHERE user_id ~ '^[0-9]+$'
           GROUP BY achievement`),
        q(`SELECT COUNT(*)::int AS total FROM players WHERE user_id ~ '^[0-9]+$'`)
      ])
      const total = totals[0]?.total || 1
      const stats = {}
      counts.forEach(r => { stats[r.id] = Math.round(r.cnt / total * 100) })
      json(res, 200, { total, stats })
    } catch(e) { json(res, 500, { error: e.message }) }
    return
  }

  // ── GET /api/social/:userId — соц-ачивки ─────────────────────────
  // Возвращает: refCount, hasGroupAdd, groupPlayers
  if (urlPath.startsWith('/api/social/') && req.method === 'GET') {
    const uid = decodeURIComponent(urlPath.slice('/api/social/'.length))
    if (!uid) { json(res, 200, { refCount: 0, hasGroupAdd: false, groupPlayers: 0 }); return }
    try {
      // Сколько уникальных игроков привёл по реферальной ссылке
      const { rows: refRows } = await q(
        `SELECT COUNT(*) AS cnt FROM referrals WHERE referrer_id = $1 AND played = TRUE`,
        [uid]
      )
      const refCount = Number(refRows[0]?.cnt || 0)

      // Добавлял ли бота в группу
      const { rows: grpRows } = await q(
        `SELECT COUNT(*) AS cnt FROM groups WHERE added_by = $1`,
        [/^\d+$/.test(uid) ? BigInt(uid) : null]
      )
      const hasGroupAdd = Number(grpRows[0]?.cnt || 0) > 0

      // Макс. кол-во уникальных игроков в группах, добавленных этим пользователем
      const { rows: playRows } = await q(`
        SELECT COALESCE(MAX(player_cnt), 0) AS max_players
        FROM (
          SELECT gs.group_id, COUNT(DISTINCT gs.user_id) AS player_cnt
          FROM group_scores gs
          JOIN groups g ON g.group_id = gs.group_id
          WHERE g.added_by = $1
          GROUP BY gs.group_id
        ) sub
      `, [/^\d+$/.test(uid) ? BigInt(uid) : null])
      const groupPlayers = Number(playRows[0]?.max_players || 0)

      json(res, 200, { refCount, hasGroupAdd, groupPlayers })
    } catch(e) { json(res, 500, { error: e.message }) }
    return
  }

  // ── Статика ───────────────────────────────────────────────────────
  function sendFile(filePath, data, contentType, cacheControl) {
    const acceptsGzip = /gzip/.test(req.headers['accept-encoding'] || '')
    const shouldGzip = acceptsGzip && COMPRESSIBLE.has(path.extname(filePath))

    if (shouldGzip) {
      zlib.gzip(data, { level: 6 }, (e, compressed) => {
        if (e) { res.writeHead(500); res.end(); return }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
          'Content-Encoding': 'gzip',
          'Vary': 'Accept-Encoding',
        })
        res.end(compressed)
      })
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Vary': 'Accept-Encoding',
      })
      res.end(data)
    }
  }

  const filePath = path.join(__dirname, 'public', urlPath === '/' ? 'index.html' : urlPath)
  const indexPath = path.join(__dirname, 'public', 'index.html')
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(indexPath, (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return }
        // index.html — НЕ кэшируем (чтобы новые версии сразу прилетали)
        sendFile(indexPath, d2, 'text/html', 'no-cache, no-store, must-revalidate')
      })
    } else {
      const ct = MIME[path.extname(filePath)] || 'application/octet-stream'
      let cacheControl
      // Файлы с хэшем в имени (/assets/*) — кэшируем НАВСЕГДА
      // (Vite добавляет хэш в имя → при изменении кода имя файла меняется → пользователь получит новое)
      if (urlPath.startsWith('/assets/') || urlPath.startsWith('/fonts/')) {
        cacheControl = 'public, max-age=31536000, immutable'
      } else if (urlPath.endsWith('.html')) {
        cacheControl = 'no-cache, no-store, must-revalidate'
      } else {
        // Прочая статика (favicon, телеграм SDK, манифест) — кэш на час
        cacheControl = 'public, max-age=3600'
      }
      sendFile(filePath, data, ct, cacheControl)
    }
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, '0.0.0.0', () => {
  console.log(`NumMatch v6.0 (PostgreSQL) запущен на порту ${PORT}`)
  if (BOT_TOKEN) {
    console.log('✅ Telegram Bot подключён')
    // Регистрируем webhook (с секретом если задан)
    const webhookPayload = { url: `${GAME_URL}/api/webhook` }
    if (WEBHOOK_SECRET) webhookPayload.secret_token = WEBHOOK_SECRET
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    }).then(r=>r.json()).then(d=>{ if(d.ok){console.log('✅ Webhook зарегистрирован')}else{console.error('⚠️ setWebhook:', d.description)} }).catch(()=>{})
    // Регистрируем команды бота — появляются в "/" меню при чате с ботом
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start',    description: '🎮 Играть в NumMatch' },
          { command: 'myrecord', description: '📊 Мой рекорд и место в рейтинге' },
          { command: 'top',      description: '🏆 Топ-5 лучших игроков' },
          { command: 'language', description: '🌐 Сменить язык / Switch language' },
          { command: 'help',     description: '❓ Список команд' },
        ]
      })
    }).then(r=>r.json()).then(d=>{ if(d.ok){console.log('✅ Bot commands (ru) зарегистрированы')}else{console.error('⚠️ setMyCommands ru:', d.description)} }).catch(()=>{})
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start',    description: '🎮 Play NumMatch' },
          { command: 'myrecord', description: '📊 My record and leaderboard rank' },
          { command: 'top',      description: '🏆 Top 5 players' },
          { command: 'language', description: '🌐 Switch language / Сменить язык' },
          { command: 'help',     description: '❓ Command list' },
        ],
        language_code: 'en'
      })
    }).then(r=>r.json()).then(d=>{ if(d.ok){console.log('✅ Bot commands (en) зарегистрированы')}else{console.error('⚠️ setMyCommands en:', d.description)} }).catch(()=>{})
    // В группах показываем только language и top (scope all_group_chats)
    const groupCmdsRu = [
      { command: 'language', description: '🌐 Сменить язык группы' },
      { command: 'top',      description: '🏆 Топ-5 группы' },
    ]
    const groupCmdsEn = [
      { command: 'language', description: '🌐 Switch group language' },
      { command: 'top',      description: '🏆 Top 5 of the group' },
    ]
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: groupCmdsRu, scope: { type: 'all_group_chats' } })
    }).then(r=>r.json()).then(d=>{ if(d.ok){console.log('✅ Bot commands (groups ru) зарегистрированы')}else{console.error('⚠️ setMyCommands groups ru:', d.description)} }).catch(()=>{})
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: groupCmdsEn, scope: { type: 'all_group_chats' }, language_code: 'en' })
    }).then(r=>r.json()).then(d=>{ if(d.ok){console.log('✅ Bot commands (groups en) зарегистрированы')}else{console.error('⚠️ setMyCommands groups en:', d.description)} }).catch(()=>{})
  } else {
    console.log('⚠️  BOT_TOKEN не задан — уведомления отключены')
  }
})
