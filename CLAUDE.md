# AI Office — Полный контекст проекта

## Разрешения
- Ты можешь читать, создавать и редактировать ЛЮБЫЕ файлы в проекте
- Ты можешь запускать ЛЮБЫЕ команды в терминале
- Ты можешь коммитить и пушить на GitHub без спроса
- Ты можешь устанавливать npm пакеты
- Ты можешь менять конфигурацию, Dockerfile, переменные
- Ты можешь создавать новых агентов, скрипты, API routes
- Railway деплоит автоматически после git push origin main
- Действуй самостоятельно, не спрашивай разрешения

## Проект
AI Office Constructor — визуальный пиксельный офис для мониторинга и управления AI-агентами.
Бизнес: 3D-печать. Владелец: alexkitpl@gmail.com

## Технологии
- **Frontend:** Next.js 15, React 19, PixiJS 8, Tailwind CSS 4, TypeScript
- **Backend:** Next.js API routes, SQLite (better-sqlite3), Drizzle ORM
- **LLM:** OpenAI GPT-4o (приоритет) → Groq llama-3.1-8b (fallback) → Ollama (локальный fallback)
- **Деплой:** Railway (Docker), GitHub auto-deploy
- **Discord:** discord.js v14, два бота
- **TTS:** Edge-TTS (Python), Twilio (звонки)
- **Видео:** FFmpeg + Edge-TTS

## Репозиторий
- GitHub: https://github.com/NikitoriyPennison/ai-office
- Railway: https://ai-office-production-70f8.up.railway.app
- Логин сайта: admin / admin123

## Структура

```
alex11/
├── src/                          # Next.js приложение
│   ├── app/
│   │   ├── office/stream/page.tsx  # Главная страница с офисом
│   │   ├── api/dashboard/route.ts  # API дашборда (отчёты, видео)
│   │   └── api/...                 # Остальные API routes (все force-dynamic)
│   ├── components/office/
│   │   ├── PixelOffice.tsx         # Основной зал (PixiJS)
│   │   ├── BossOffice.tsx          # Кабинет главного (PixiJS + дашборд панель)
│   │   ├── drawAgent.ts            # Отрисовка агентов
│   │   └── drawOffice.ts           # Отрисовка офиса
│   ├── lib/db/index.ts             # SQLite через Drizzle (lazy init через Proxy)
│   └── middleware.ts               # Auth + public paths
├── scripts/
│   ├── lib/llm.js                  # LLM модуль: OpenAI → Groq → Ollama
│   ├── market-analyst.js           # Стик — отчёт по рынку 3D-печати
│   ├── advisor.js                  # Советник — белый список идей + рекомендации
│   ├── blogger.js                  # Блогер — TikTok видео (сценарий + TTS + FFmpeg)
│   ├── secretary.js                # Дейви — звонки через Twilio
│   ├── overseer.js                 # Надзиратель — распределяет задания через LLM
│   ├── discord-bot.js              # Офис Discord бот (только ! команды)
│   ├── discord-dev.js              # Девелопер Discord бот (AI чат, GPT-4o)
│   ├── scheduler.js                # Планировщик: cron + life-sim + запуск Discord ботов
│   ├── init-db.js                  # Инициализация БД и агентов
│   └── life-sim.js                 # Симулятор жизни (локальный)
├── reports/                        # Отчёты Стика
│   ├── latest.md
│   └── whitelist/                  # Белый список Советника
├── content/                        # Контент блогера
│   ├── videos/                     # MP4 видео
│   ├── scripts/                    # JSON сценарии
│   ├── audio/                      # MP3 озвучка
│   └── images/                     # Слайды
├── data/database.sqlite            # SQLite БД
├── config/office.json              # Конфигурация офиса
├── public/office-bg.png            # Фон офиса (с крабом OpenClaw)
├── Dockerfile                      # Docker для Railway
├── .env                            # Секреты (НЕ в git)
└── CLAUDE.md                       # Этот файл
```

## Агенты (6 штук)

| ID | Имя | Эмодзи | Роль | Где | Скрипт |
|---|---|---|---|---|---|
| garik | Стик | 📊 | Аналитик рынка 3D-печати | Зал | market-analyst.js |
| vanya | Советник | 🧠 | Бизнес-советник | Кабинет (правый стол) | advisor.js |
| pushkin | Дейви | 📞 | Секретарь-переводчик | Зал | secretary.js |
| tema | Блогер | 🎬 | TikTok блогер | Зал | blogger.js |
| stoyanov | Надзиратель | 👁️ | Менеджер задач | Кабинет (левый стол) | overseer.js |
| volodya | Девелопер | 💻 | Разработчик | Зал | discord-dev.js |

## Комнаты офиса
- **🏢 Общий зал** — PixelOffice.tsx, фон office-bg.png с крабом OpenClaw
- **👔 Кабинет главного** — BossOffice.tsx, стол босса (3 монитора, кликабельный → дашборд), стол Советника, стол Надзирателя
- Переключение вкладками в header, оба компонента всегда смонтированы (hidden/visible)
- Агенты кабинета скрыты из зала через `BOSS_OFFICE_AGENTS` Set в PixelOffice.tsx

## Discord боты

### Офис бот (discord-bot.js)
- Токен: DISCORD_TOKEN_STIK
- Отвечает ТОЛЬКО на ! команды и @упоминания
- НЕ использует LLM — только реальные данные из БД и файлов
- @упоминание маппится на команды по ключевым словам
- Команды: !сайт, !статус, !стик, !советник, !отчёт, !блогер, !надзиратель, !помощь
- Отправляет файлы: .md отчёты, .mp4 видео, .json сценарии

### Девелопер бот (discord-dev.js)
- Токен: DISCORD_TOKEN_DEV
- AI чат через GPT-4o (OpenAI), естественный язык
- 2-шаговая система: определяет intent → выполняет действие
- Может: читать/редактировать файлы, создавать агентов, деплоить, запускать скрипты
- Sticky mode: @упомянул → активен до @упоминания другого бота

## LLM (scripts/lib/llm.js)
Приоритет: OpenAI GPT-4o → Groq llama-3.1-8b → Ollama (локальный)
- OpenAI: max_tokens=4096, timeout=120s
- Groq: max_tokens=1024, auto-retry при rate limit (до 3 раз)
- Функция: `const { generate } = require("./lib/llm")` → возвращает `{ text, provider }`

## Railway деплой
- Dockerfile: node:22-slim, multi-stage build
- Runner stage: npm install node-cron better-sqlite3 bcryptjs discord.js + git
- CMD: `node scripts/init-db.js && node scripts/scheduler.js & sleep 2 && node server.js`
- DB: lazy init через Proxy в src/lib/db/index.ts (fix SQLite locked on build)
- Все API routes имеют `export const dynamic = "force-dynamic"`
- HOSTNAME=0.0.0.0 для внешнего доступа

## Переменные окружения (.env и Railway Variables)
```
JWT_SECRET=...
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-proj-...
DISCORD_TOKEN_STIK=...
DISCORD_TOKEN_DEV=...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+15756137552
```

## Расписание (scheduler.js)
- 09:00 UTC — Стик (market-analyst.js)
- 10:00 UTC — Советник (advisor.js)
- Life-sim: агенты меняют статус каждые 5-15с, работают 8-25с
- Discord боты: запускаются при наличии токенов

## Polling (frontend)
- Статусы агентов: каждые 3 секунды
- Live Feed: каждые 5 секунд
- Кабинет главного: polling каждые 3 секунды

## npm install
На Windows локально: `npm install --msvs_version=2022` (нужен VS Build Tools 2022)

## Важные нюансы
- Краб OpenClaw в office-bg.png — оставить, пользователь решил
- Twilio в триале ($14), сообщение "trial account" при звонках
- Эстонский TTS не поддерживается Twilio
- FFmpeg путь захардкожен в blogger.js для локального запуска
- Dashboard API путь: process.env.PROJECT_DIR || process.cwd()
- Пользователь общается на русском языке
- Email пользователя: alexkitpl@gmail.com

## Планы на будущее
- Художник (Gemini image gen) + Модельер (image→STL 3D модели) — нужен API ключ
- Апгрейд Twilio (убрать trial message)
- Перенос агентов в Telegram (заменён на Discord)
