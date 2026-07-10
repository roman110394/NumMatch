// ════════════════════════════════════════════════════════════════
// LOCALE — строки UI на русском и английском
// ════════════════════════════════════════════════════════════════

export type Lang = 'ru' | 'en'

/** Определяем язык: сначала из TG initData, потом браузер */
export function detectLang(tgLangCode?: string): Lang {
  const code = tgLangCode
    || (typeof navigator !== 'undefined' ? navigator.language : '')
    || 'ru'
  return code.toLowerCase().startsWith('en') ? 'en' : 'ru'
}

export const S = {
  ru: {
    // ── Лого ──
    logoTag: 'ТРЕНАЖЁР ВНИМАТЕЛЬНОСТИ',

    // ── Старт ──
    hi: 'Привет',
    play: '▶ ИГРАТЬ',
    showBoard: '🏆 Таблица лидеров',
    hideBoard: '▲ Скрыть рейтинг',
    loadingBoard: '⏳ Загрузка…',

    // ── Рейтинг (вкладки) ──
    tabFriends: '👥 Друзья',
    tabGlobal: '🌍 Глобальный',
    hdrFriends: '👥 ДРУЗЬЯ',
    hdrGlobal: '🏆 ТАБЛИЦА ЛИДЕРОВ',
    hdrGrowth: '⚡ БЫСТРООБУЧАЕМЫЕ',
    growthHint: 'рекорд ÷ игры',
    growthEmpty: 'Нужно минимум 3 игры · пока данных нет',
    boardEmpty: 'Никто ещё не играл!',
    byGroups: '›› По группам',
    collapse: '‹‹ Свернуть',
    youBadge: 'ВЫ',
    noFriendsTitle: 'Соревнуйся с друзьями!',
    noFriendsDesc: 'Добавь бота @nummatchbot в общую Telegram-группу с друзьями — и их результаты появятся здесь.',
    noFriendsStep1: '1. Открой нужную группу в Telegram',
    noFriendsStep2: '2. Добавь участника → @nummatchbot',
    noFriendsStep3: '3. Сыграйте — рейтинг появится автоматически',
    authPrompt: 'Войди через Telegram, чтобы сохранять результаты и видеть таблицы лидеров',
    authBtn: '🔗 Открыть в Telegram',

    // ── HUD ──
    score: 'СЧЁТ',
    time: 'ВРЕМЯ',
    level: 'УРОВЕНЬ',
    graceMore: 'ещё',
    graceFor: 'для старта',

    // ── Кнопки ответа ──
    equal: 'РАВНЫЕ',
    differ: 'РАЗНЫЕ',

    // ── Тренировочные подсказки ──
    practiceBannerLabel: '🎓 ТРЕНИРОВКА — очки не идут в зачёт',
    hintNumbersEqual: 'Числа\nРАВНЫЕ',
    hintNumbersDiffer: 'Числа\nРАЗНЫЕ',
    hintCorrect: '✓ Правильно! Таймер пополнился',
    hintWrong: '✗ Ошибка! Таймер сократился',

    // ── Подсказки на ошибке ──
    wrongHintEqual: '= Числа РАВНЫЕ',
    wrongHintDiffer: '≠ Числа РАЗНЫЕ',

    // ── Кнопка завершить раунд ──
    endRound: '⏹ Закончить раунд',
    endConfirmText: 'Очки сгорят!',
    endConfirmOk: 'ОК',
    endConfirmCancel: 'Отмена',

    // ── Правила ──
    rulesTitle: 'КАК ИГРАТЬ',
    rulesCompare: 'Сравни два числа:',
    rulesEq: '= равные',
    rulesDiff: '≠ разные',
    rulesTimer: '⏱ Таймер 2 минуты',
    rulesCorrect: '✓ Правильно → +секунды',
    rulesWrong: '✗ Ошибка → −секунды',
    rulesLvl: 'Уровень',
    rulesOk: 'ПОНЯЛ!',
    rulesTutBtn: '🎓 Пройти обучение',

    // ── Туториал ──
    tutPractice: '🎮 Начать тренировку',
    tutSkip: 'Пропустить — сразу играть',
    tutBack: '← Назад',
    tutNext: 'Далее →',

    // ── Конец тренировки ──
    practiceDoneTitle: 'ТРЕНИРОВКА ЗАВЕРШЕНА',
    practiceDoneDesc: 'Очки не пошли в зачёт — это была разминка',
    practiceDoneReady: 'Теперь попробуй настоящую игру — очки пойдут в рейтинг!',
    practiceDonePlay: '▶ ИГРАТЬ ПО-НАСТОЯЩЕМУ',
    practiceDoneAgain: '🔄 Попробовать ещё раз',
    practiceDoneMenu: '← Меню',
    practicePoints: 'ОЧКОВ',
    practiceAccuracy: 'ТОЧНОСТЬ',
    practiceLevel: 'УРОВЕНЬ',

    // ── Конец игры — баннеры ──
    rank1Banner: '🥇 ПЕРВОЕ МЕСТО! 🎉',
    rank2Banner: '🥈 ВТОРОЕ МЕСТО!',
    rank3Banner: '🥉 ТРЕТЬЕ МЕСТО!',
    grpRecordBanner: '👥 Рекорд группы!',

    // ── Конец игры — результаты ──
    newRecord: 'новый рекорд!',
    equalRecord: '= рекорд',
    prevRecord: 'Рекорд:',
    rankOf: 'из',
    rankTop: 'Топ',
    rankAbove: (p: number) => `выше ${p}% игроков`,
    rankThisRound: 'Этот раунд',

    // ── Карточки профиля ──
    cardAnsPerMin: 'отв/мин',
    cardErrors: (n: number) => `${n} ошиб.`,
    cardNoErrors: 'без ошибок',
    cardStability: 'стабильн.',
    speedLightning: 'Молниеносный',
    speedFast: 'Быстрый',
    speedBalanced: 'Сбалансированный',
    speedThoughtful: 'Вдумчивый',
    accExcellent: 'Превосходно',
    accGood: 'Хорошо',
    accOk: 'Неплохо',
    accPractice: 'Тренируйся',
    stabFlat: 'Ровно',
    stabSmallDrop: 'Небольшой спад',
    stabTired: 'Устаёшь',

    // ── Подсказки карточек ──
    cardInfoSpeed: '⚡ Скорость — ответов в минуту. Показывает, как быстро мозг обрабатывает информацию. Молниеносный ≥38, Быстрый ≥26, Сбалансированный ≥16. Нажми, чтобы закрыть.',
    cardInfoAcc: '🎯 Точность — доля верных ответов. Отражает внимательность и качество мышления. Превосходно ≥97%, Хорошо ≥90%, Неплохо ≥75%. Нажми, чтобы закрыть.',
    cardInfoStab: '🔁 Стабильность — разница точности между первыми и последними 30 секундами. Падение >8% говорит об усталости к концу. Ровно ≤2%, Небольшой спад ≤8%. Нажми, чтобы закрыть.',
    cardInfoStress: '🧊 Стресс-зона — точность в последние 30 секунд игры. Показывает, удерживаешь ли ты концентрацию под давлением. Норма — не хуже среднего по игре. Нажми, чтобы закрыть.',
    cardInfoRecovery: '💪 Восстановление — максимальная серия правильных ответов сразу после ошибки. Показывает способность быстро собраться. ≥15 — Железная воля 🔥, ≥8 — Отлично. Нажми, чтобы закрыть.',

    // ── Зоны ──
    stressZoneTitle: 'Стресс-зона · посл. 30 сек',
    stressKeepUp: 'Держишь темп',
    stressSmallDrop: 'Небольшой спад',
    stressPressure: 'Давление влияет',
    recovTitle: 'Восстановление',
    recovStreak: (n: number) => ` подряд после ошибки${n >= 15 ? ' · Железная воля 🔥' : n >= 8 ? ' · Отлично' : ''}`,

    // ── Быстрая статистика ──
    qsLevel: 'Уровень',
    qsCorrect: 'Верных',
    qsTotal: 'Всего',

    // ── Инфо сессии ──
    sessionCounted: (n: number) => `Сессия ${n} сегодня · в статистике`,
    sessionNotCounted: 'Режим тренировки · статистика не ведётся сегодня',

    // ── CTA ──
    playAgain: '🔄 ИГРАТЬ ЕЩЁ РАЗ',
    menu: 'МЕНЮ',
    share: '📤 ПОДЕЛИТЬСЯ',
    seeBoard: '🏆 Посмотреть рейтинг',
    hideBoard2: '▲ Скрыть рейтинг',

    // ── Share text ──
    shareText: (score: string) => `Я набрал ${score} в NumMatch! Попробуй побить 🎮`,

    // ── Достижения (пилюля, шапка) ──
    achModalTitle: 'ДОСТИЖЕНИЯ',
    achSortRarity: 'По редкости',
    achSortOrder: 'По порядку',
    achPct: (p: number) => `${p}%`,
    achLoadStats: 'загрузка статистики…',
    roundAchTitle: '🎖️ НОВЫЕ ДОСТИЖЕНИЯ',
    roundAchHint: 'Нажми на достижение чтобы узнать подробности',
    roundAchClose: 'ЗАКРЫТЬ',
    roundAchAll: 'ВСЕ ДОСТИЖЕНИЯ',

    // ── Категории ачивок ──
    catSignals: 'Основные сигналы',
    catPressure: 'Под давлением',
    catMastery: 'Стабильность и мастерство',
    catQuick: 'Быстрый старт',
    catRank: 'Следы в рейтинге',
    catSocial: 'Социальные сигналы',
    catSecret: 'Побочные эффекты',
    catSpecial: 'Особое',

    // ── Статистика ──
    statsTitle: 'ПРОГРЕСС',

    // ── Внутриигровые подсказки ──
    achToastTitle: 'ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО!',
    boardGap: (n: number) => `…ещё ${n.toLocaleString('ru-RU')} игроков`,
    gamesShort: 'игр',
    rulesLvlShort: 'Ур.',

    // ── Модалки достижений ──
    achModalOf: 'открыто',
    achSortByGroups: '📂 По группам',
    achSortByRarity: '💎 По редкости',
    achLoadingRarity: 'Загрузка статистики редкости…',
    achSecretLocked: '???',
    achSecretLabel: 'Секретное',
    achGroupSecretCnt: (n: number) => n > 0 ? `${n} обнаружено` : '???',
    achSecretGroupDesc: 'Секретные достижения',
    achEarned: '✓ Разблокировано',
    achNobodyYet: 'Ни у кого ещё нет',
    achOnlyYou: '👑 Только у тебя',
    achLoadingStats: 'Загрузка статистики…',
    achBack: '← НАЗАД',
    achModalClose: 'ЗАКРЫТЬ',

    // ── Туториал ──
    tutAchTitleStr: 'обучение завершено',

    // ── Статистика ──
    statsTitleFull: 'МОЙ ПРОГРЕСС',
    statsLoading: 'Загрузка...',
    statsEmptyTitle: 'Сыграй несколько раундов, чтобы увидеть прогресс',
    statsEmptyHint: 'Сыграй первый раунд — и всё появится здесь',
    statsPlayBtn: 'ИГРАТЬ!',
    statsRecord: 'Рекорд',
    statsSessions: 'Сессий',
    statsDays: 'Дней',
    statsScoreLabel: 'Очки',
    statsAccuracyLabel: 'Точность',
    statsTabDay: 'По дням',
    statsTabWeek: 'По неделям',
    statsApmShort: 'отв/мин',
    statsAccShort: 'точность',
    statsNoData: 'Нет данных',
    statsNotEnoughWeek: 'Мало данных для недельного вида',
    statsTodayHint: (today: number) => `Сегодня: ${today} ${today===1?'сессия':today<5?'сессии':'сессий'}`,
    statsWeekSummary: (weeks: number, sessions: number) => `${weeks} нед. · ${sessions} сессий`,
    statsClose: 'ЗАКРЫТЬ',
    statsSessionShort: 'сс',
    statsDayShort: 'д',
    statsPeriod7: '7 дней',
    statsPeriod30: 'Месяц',
    statsPeriod90: '3 мес',
    statsAvg: 'Среднее',
    statsBest: 'Лучшее',
    statsSessionsLabel: (n: number) => `${n} ${n===1?'сессия':n<5?'сессии':'сессий'}`,
    statsActivedays: (n: number, total: number) => `${n} из ${total} дн. с играми`,
  },

  en: {
    logoTag: 'ATTENTION TRAINER',

    hi: 'Hi',
    play: '▶ PLAY',
    showBoard: '🏆 Leaderboard',
    hideBoard: '▲ Hide leaderboard',
    loadingBoard: '⏳ Loading…',

    tabFriends: '👥 Friends',
    tabGlobal: '🌍 Global',
    hdrFriends: '👥 FRIENDS',
    hdrGlobal: '🏆 LEADERBOARD',
    hdrGrowth: '⚡ FAST LEARNERS',
    growthHint: 'record ÷ games',
    growthEmpty: 'Need at least 3 games · no data yet',
    boardEmpty: 'Nobody has played yet!',
    byGroups: '›› By group',
    collapse: '‹‹ Collapse',
    youBadge: 'YOU',
    noFriendsTitle: 'Compete with friends!',
    noFriendsDesc: 'Add @nummatchbot to a Telegram group with your friends — their scores will appear here.',
    noFriendsStep1: '1. Open a Telegram group',
    noFriendsStep2: '2. Add member → @nummatchbot',
    noFriendsStep3: '3. Play — the leaderboard appears automatically',
    authPrompt: 'Sign in via Telegram to save your results and see leaderboards',
    authBtn: '🔗 Open in Telegram',

    score: 'SCORE',
    time: 'TIME',
    level: 'LEVEL',
    graceMore: 'more',
    graceFor: 'to start',

    equal: 'EQUAL',
    differ: 'DIFFER',

    practiceBannerLabel: '🎓 PRACTICE — scores don\'t count',
    hintNumbersEqual: 'Numbers\nEQUAL',
    hintNumbersDiffer: 'Numbers\nDIFFER',
    hintCorrect: '✓ Correct! Timer refilled',
    hintWrong: '✗ Wrong! Timer reduced',

    wrongHintEqual: '= Numbers are EQUAL',
    wrongHintDiffer: '≠ Numbers are DIFFERENT',

    endRound: '⏹ End round',
    endConfirmText: 'Score will be lost!',
    endConfirmOk: 'OK',
    endConfirmCancel: 'Cancel',

    rulesTitle: 'HOW TO PLAY',
    rulesCompare: 'Compare two numbers:',
    rulesEq: '= equal',
    rulesDiff: '≠ different',
    rulesTimer: '⏱ 2 minute timer',
    rulesCorrect: '✓ Correct → +seconds',
    rulesWrong: '✗ Wrong → −seconds',
    rulesLvl: 'Level',
    rulesOk: 'GOT IT!',
    rulesTutBtn: '🎓 Take tutorial',

    tutPractice: '🎮 Start practice',
    tutSkip: 'Skip — play now',
    tutBack: '← Back',
    tutNext: 'Next →',

    practiceDoneTitle: 'PRACTICE COMPLETE',
    practiceDoneDesc: 'Score doesn\'t count — that was a warm-up',
    practiceDoneReady: 'Now try the real game — your score will be on the leaderboard!',
    practiceDonePlay: '▶ PLAY FOR REAL',
    practiceDoneAgain: '🔄 Try again',
    practiceDoneMenu: '← Menu',
    practicePoints: 'POINTS',
    practiceAccuracy: 'ACCURACY',
    practiceLevel: 'LEVEL',

    rank1Banner: '🥇 FIRST PLACE! 🎉',
    rank2Banner: '🥈 SECOND PLACE!',
    rank3Banner: '🥉 THIRD PLACE!',
    grpRecordBanner: '👥 Group record!',

    newRecord: 'new record!',
    equalRecord: '= record',
    prevRecord: 'Record:',
    rankOf: 'of',
    rankTop: 'Top',
    rankAbove: (p: number) => `above ${p}% of players`,
    rankThisRound: 'This round',

    cardAnsPerMin: 'ans/min',
    cardErrors: (n: number) => `${n} err.`,
    cardNoErrors: 'no errors',
    cardStability: 'stability',
    speedLightning: 'Lightning',
    speedFast: 'Fast',
    speedBalanced: 'Balanced',
    speedThoughtful: 'Thoughtful',
    accExcellent: 'Excellent',
    accGood: 'Good',
    accOk: 'Not bad',
    accPractice: 'Keep training',
    stabFlat: 'Steady',
    stabSmallDrop: 'Small drop',
    stabTired: 'Getting tired',

    cardInfoSpeed: '⚡ Speed — answers per minute. Shows how fast your brain processes information. Lightning ≥38, Fast ≥26, Balanced ≥16. Tap to close.',
    cardInfoAcc: '🎯 Accuracy — percentage of correct answers. Reflects attention and thinking quality. Excellent ≥97%, Good ≥90%, Not bad ≥75%. Tap to close.',
    cardInfoStab: '🔁 Stability — accuracy difference between the first and last 30 seconds. A drop >8% indicates fatigue. Steady ≤2%, Small drop ≤8%. Tap to close.',
    cardInfoStress: '🧊 Stress zone — accuracy in the last 30 seconds. Shows if you keep your focus under pressure. Good if not worse than your average. Tap to close.',
    cardInfoRecovery: '💪 Recovery — max correct answers in a row right after a mistake. Shows ability to bounce back quickly. ≥15 — Iron Will 🔥, ≥8 — Excellent. Tap to close.',

    stressZoneTitle: 'Stress zone · last 30 sec',
    stressKeepUp: 'Holding strong',
    stressSmallDrop: 'Small drop',
    stressPressure: 'Pressure shows',
    recovTitle: 'Recovery',
    recovStreak: (n: number) => ` in a row after a mistake${n >= 15 ? ' · Iron Will 🔥' : n >= 8 ? ' · Excellent' : ''}`,

    qsLevel: 'Level',
    qsCorrect: 'Correct',
    qsTotal: 'Total',

    sessionCounted: (n: number) => `Session ${n} today · counted`,
    sessionNotCounted: 'Practice mode · stats not tracked today',

    playAgain: '🔄 PLAY AGAIN',
    menu: 'MENU',
    share: '📤 SHARE',
    seeBoard: '🏆 View leaderboard',
    hideBoard2: '▲ Hide leaderboard',

    shareText: (score: string) => `I scored ${score} in NumMatch! Try to beat it 🎮`,

    achModalTitle: 'ACHIEVEMENTS',
    achSortRarity: 'By rarity',
    achSortOrder: 'By order',
    achPct: (p: number) => `${p}%`,
    achLoadStats: 'loading stats…',
    roundAchTitle: '🎖️ NEW ACHIEVEMENTS',
    roundAchHint: 'Tap an achievement to learn more',
    roundAchClose: 'CLOSE',
    roundAchAll: 'ALL ACHIEVEMENTS',

    catSignals: 'Core signals',
    catPressure: 'Under pressure',
    catMastery: 'Stability & mastery',
    catQuick: 'Fast start',
    catRank: 'Leaderboard marks',
    catSocial: 'Social signals',
    catSecret: 'Side effects',
    catSpecial: 'Special',

    statsTitle: 'PROGRESS',

    achToastTitle: 'ACHIEVEMENT UNLOCKED!',
    boardGap: (n: number) => `…${n.toLocaleString('en-US')} more players`,
    gamesShort: 'games',
    rulesLvlShort: 'Lv.',

    achModalOf: 'unlocked',
    achSortByGroups: '📂 By groups',
    achSortByRarity: '💎 By rarity',
    achLoadingRarity: 'Loading rarity stats…',
    achSecretLocked: '???',
    achSecretLabel: 'Secret',
    achGroupSecretCnt: (n: number) => n > 0 ? `${n} found` : '???',
    achSecretGroupDesc: 'Secret achievements',
    achEarned: '✓ Unlocked',
    achNobodyYet: 'Nobody has it yet',
    achOnlyYou: '👑 Only you',
    achLoadingStats: 'Loading stats…',
    achBack: '← BACK',
    achModalClose: 'CLOSE',

    tutAchTitleStr: 'tutorial complete',

    statsTitleFull: 'MY PROGRESS',
    statsLoading: 'Loading...',
    statsEmptyTitle: 'Play a few rounds to see your progress',
    statsEmptyHint: 'Play your first round — it will all appear here',
    statsPlayBtn: 'PLAY!',
    statsRecord: 'Record',
    statsSessions: 'Sessions',
    statsDays: 'Days',
    statsScoreLabel: 'Score',
    statsAccuracyLabel: 'Accuracy',
    statsTabDay: 'By day',
    statsTabWeek: 'By week',
    statsApmShort: 'ans/min',
    statsAccShort: 'accuracy',
    statsNoData: 'No data',
    statsNotEnoughWeek: 'Not enough data for weekly view',
    statsTodayHint: (today: number) => `Today: ${today} ${today===1?'session':'sessions'}`,
    statsWeekSummary: (weeks: number, sessions: number) => `${weeks} wks · ${sessions} sessions`,
    statsClose: 'CLOSE',
    statsSessionShort: 's',
    statsDayShort: 'd',
    statsPeriod7: '7 days',
    statsPeriod30: 'Month',
    statsPeriod90: '3 mon',
    statsAvg: 'Avg',
    statsBest: 'Best',
    statsSessionsLabel: (n: number) => `${n} ${n===1?'session':'sessions'}`,
    statsActivedays: (n: number, total: number) => `${n} of ${total} days active`,
  },
} as const

export type Strings = typeof S['ru']

/** Вспомогательный тип для ключей без функций */
export type StringKey = keyof Strings

/** Достижения на английском (title · desc · longDesc) */
export const ACH_EN: Record<string, { title: string; desc: string; longDesc: string }> = {
  s30000:      { title:'Access Granted',          desc:'30 000 pts',             longDesc:'First official checkpoint. You\'re inside the system.' },
  s50000:      { title:'Distant Signal',           desc:'50 000 pts',             longDesc:'Reach 50 000 points in one session.' },
  s75000:      { title:'Beyond the Horizon',       desc:'75 000 pts',             longDesc:'Reach 75 000 points in one session.' },
  s100000:     { title:'Critical Mass',            desc:'100 000 pts',            longDesc:'Reach 100 000 points in one session.' },
  s150000:     { title:'Upper Clearance',          desc:'150 000 pts',            longDesc:'Reach 150 000 points. You\'re a legend.' },
  apm30:       { title:'Warm-Up',                  desc:'30+ ans/min · lv.5+',    longDesc:'Sustained pace of ≥30 answers per minute over the full session at level 5+.' },
  apm40:       { title:'Neuro Boost',              desc:'40+ ans/min · lv.5+',    longDesc:'Sustained pace of ≥40 answers per minute over the full session at level 5+.' },
  apm50:       { title:'Overload Mode',            desc:'50+ ans/min · lv.5+',    longDesc:'Sustained pace of ≥50 answers per minute over the full session at level 5+.' },
  str20:       { title:'Scanner',                  desc:'20 in a row',            longDesc:'20 correct answers in a row.' },
  str40:       { title:'Ruler Straight',           desc:'40 in a row',            longDesc:'40 correct answers in a row.' },
  str75:       { title:'No Misses Allowed',        desc:'75 in a row',            longDesc:'75 correct answers in a row.' },
  str150:      { title:'Flow State',               desc:'150 in a row',           longDesc:'Time disappears. Only numbers remain.' },
  clean:       { title:'Cold Head',                desc:'0 errors · lv.>10',      longDesc:'Full control. A session with 0 errors above level 10.' },
  stab2:       { title:'Inner Silence',            desc:'Stability ±2%',          longDesc:'±2% stability between start and end of session with ≥50 answers.' },
  twilight:    { title:'Twilight Zone',            desc:'Better towards end',     longDesc:'Performing better at the end than at the start. Level above 13.' },
  l8:          { title:'Progress',                 desc:'Level 8',                longDesc:'Reach level 8 in one session.' },
  l15:         { title:'Deep Dive',                desc:'Level 15',               longDesc:'Reach level 15.' },
  l20:         { title:'Grandmaster',              desc:'Level 20',               longDesc:'Level 20 in one session.' },
  l30:         { title:'Edge Mode',                desc:'Level 30',               longDesc:'Brain at the limit.' },
  l35:         { title:'Perception Limit',         desc:'Level 35',               longDesc:'Reach level 35.' },
  red_line:    { title:'Red Line',                 desc:'Clean finish after errors',longDesc:'Finish the session without errors in the last 30 sec after having made mistakes.' },
  last_rush:   { title:'Last Sprint',              desc:'10+ correct at <15s',    longDesc:'10+ correct answers when timer is under 15 seconds.' },
  pressure:    { title:'Under Pressure',           desc:'≥95% in last 10s',       longDesc:'≥95% accuracy in the last 10 seconds (at least 3 answers).' },
  last_breath: { title:'Last Breath',              desc:'Correct at ≤1s',         longDesc:'Give a correct answer with ≤1 second on the timer.' },
  recov10:     { title:'Rally',                    desc:'20 correct after error', longDesc:'20 correct answers in a row right after a mistake.' },
  recov20:     { title:'Iron Will',                desc:'25 correct · <30s · lv.9+',longDesc:'25 correct in a row after an error, orange zone (<30s) at level 9+.' },
  recov25:     { title:'Echo of Error',            desc:'25 correct after error <45s',longDesc:'Perfect recovery. 25 correct in a row after a mistake with timer <45s.' },
  adrenaline:  { title:'Adrenaline Calibration',  desc:'+20s when <15s left',    longDesc:'A streak adds +20 seconds when there were less than 15 seconds left, at level 10+.' },
  marty:       { title:'Marty McFly',              desc:'Timer >2:20',            longDesc:'Timer exceeded 2 minutes 20 seconds in one session.' },
  emmet:       { title:'Emmett Brown',             desc:'Timer >2:40',            longDesc:'Timer exceeded 2 minutes 40 seconds in one session.' },
  delorean:    { title:'Delorean',                 desc:'Timer >3:00',            longDesc:'Timer exceeded 3 minutes in one session.' },
  absolute:    { title:'Absolute',                 desc:'0 err · lv.20 · 100k',   longDesc:'0 errors + level 20 + 100 000 points in one session.' },
  stable30:    { title:'Stable Circuit',           desc:'≥90% at end · 4+ min',   longDesc:'Accuracy in last 30 seconds ≥90% with session 4+ minutes.' },
  deep_scan:   { title:'Deep Scan',                desc:'20 ≠ last digit · lv.14+',longDesc:'20 correct "≠" where only the last digit differs at level 14+.' },
  first30:     { title:'Hit the Ground Running',  desc:'30k in first game',      longDesc:'30 000 points in your first session.' },
  eff50:       { title:'Natural',                  desc:'50k in <10 games',       longDesc:'50 000 points in fewer than 10 games.' },
  eff100:      { title:'Prodigy',                  desc:'100k in <20 games',      longDesc:'100 000 points in fewer than 20 games.' },
  rank100:     { title:'Bronze Mark',              desc:'Top-100 · 50+ games',    longDesc:'Reach global top-100 having played at least 50 games.' },
  rank10:      { title:'Silver Mark',              desc:'Top-10 · 50+ games',     longDesc:'Reach global top-10 having played at least 50 games.' },
  rank1:       { title:'Number 1',                 desc:'#1 · 50+ games',         longDesc:'Become #1 on the global leaderboard having played at least 50 games.' },
  share1:      { title:'Echo in the Network',      desc:'1 share',                longDesc:'Share your result at least once.' },
  ref1:        { title:'Transmitter',              desc:'1 via link',             longDesc:'1 person came and played via your referral link.' },
  ref5:        { title:'Signal Network',           desc:'5 via link',             longDesc:'5 people came and played via your links.' },
  ref10:       { title:'Broadcast',                desc:'10+ via link',           longDesc:'10+ people came via your links.' },
  group_add:   { title:'Group Protocol',           desc:'Bot in group',           longDesc:'Add the bot to a group.' },
  group_play:  { title:'Collective Attention',     desc:'3+ in group',            longDesc:'3+ different people played in a group with your bot.' },
  mandela:     { title:'Mandela Effect',           desc:'100 false ≠',            longDesc:'You started seeing differences where there are none. 100 false "≠" on identical numbers.' },
  lost_signal: { title:'Lost Signal',              desc:'Final error at <1s',     longDesc:'End a session with a wrong answer with 0.0–0.9 seconds remaining.' },
  ghost666:    { title:'Ghost in the Wires',       desc:'666+ answers',           longDesc:'Give at least 666 answers total over your lifetime.' },
  feedback333: { title:'Feedback',                 desc:'3 sessions at HH:33',    longDesc:'Complete 3 sessions at exactly 03:33, 13:33 or 23:33.' },
  autism50:    { title:'Digital Autism',           desc:'50+ at 100% · lv.12+',   longDesc:'50+ answers in one session with 100% accuracy (level 12+).' },
  silence:     { title:'Silence After Noise',      desc:'90s in red + 0 err',     longDesc:'90+ seconds in the red timer zone and finish the session without errors.' },
  last_witness:{ title:'Last Witness',             desc:'Level 50',               longDesc:'Reach level 50.' },
  zero_ans:    { title:'Zero',                     desc:'Answer at 0.0s',         longDesc:'Give a correct answer exactly as the timer hits zero.' },
  rotate3:     { title:'Rotation',                 desc:'3 min in landscape',     longDesc:'Play a session for at least 3 minutes in landscape orientation.' },
  static7:     { title:'Static Noise',             desc:'7 days in a row',        longDesc:'Play at least one session on 7 consecutive days.' },
  white_noise: { title:'White Noise',              desc:'30 days with games',     longDesc:'30 days with played sessions.' },
  tutorial:    { title:'Graduate',                 desc:'Completed tutorial',     longDesc:'Complete the first practice session and learn the interface.' },
  secondgrade: { title:'Repeater',                 desc:'Second tutorial',        longDesc:'Didn\'t get it the first time — that\'s fine! Repetition is the mother of skill.' },
}

/** Тюториал на английском */
export const TUTORIAL_SLIDES_EN = [
  { icon: '🧠', title: 'Compare numbers', body: 'You\'ll be shown two numbers. Your task — determine if they are equal or different.' },
  { icon: '✅', title: 'Controls', body: 'Tap  =  if the numbers are EQUAL.\nTap  ≠  if the numbers are DIFFERENT.\nAct fast — time is limited!' },
  { icon: '⏱', title: 'Timer', body: 'Correct answer → adds seconds to the timer.\nMistake → removes seconds.\nThe game ends when the timer reaches zero.' },
  { icon: '📈', title: 'Levels & score', body: 'Every 5 correct answers — a new level.\nNumbers get longer, scores get higher.\nThe higher the level — the more points per answer.' },
  { icon: '🎓', title: 'Ready?', body: 'A 45-second practice round is about to start — it doesn\'t count towards the leaderboard.\nScores and achievements don\'t apply. Just feel the rhythm!' },
]
