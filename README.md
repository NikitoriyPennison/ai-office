# 🏢 AI Office Constructor

Визуальный офис для ваших AI агентов. Pixel-art интерфейс, живые статусы, канбан задач.

Работает с [OpenClaw](https://docs.openclaw.ai) — показывает реальную активность ваших агентов в браузере.

![AI Office Preview](docs/preview-placeholder.png)

## Что это

Веб-приложение которое показывает ваших AI агентов как сотрудников в pixel-art офисе:
- 🟢 **Работает** — агент сейчас обрабатывает задачу
- 🟡 **Idle** — был активен недавно
- 🔴 **Offline** — давно не отвечал
- 💬 **Live Feed** — реальные действия агентов в реальном времени
- 📋 **Канбан** — задачи с назначением на агентов

## Требования

- [OpenClaw](https://docs.openclaw.ai) на локальной машине (macOS/Linux)
- VPS для хостинга (Ubuntu 22+, 1GB RAM)
- Node.js 22+
- SSH доступ к VPS

## Quick Start

### 1. Клонируй репо

```bash
# Через GitHub template — нажми "Use this template" на GitHub
# Или:
git clone https://github.com/maximgalson/ai-office-constructor.git my-office
cd my-office
```

### 2. Запусти setup

```bash
bash scripts/setup.sh
```

Setup спросит:
- Как назвать офис
- Сколько агентов и как их зовут
- SSH доступ к VPS

Создаст `config/office.json` и базу данных.

### 3. Задеплой на VPS

```bash
bash scripts/deploy.sh
```

Скрипт сам:
- Зальёт файлы на VPS
- Установит зависимости
- Соберёт Next.js
- Настроит pm2 и nginx

### 4. Включи синхронизацию

```bash
bash scripts/install-sync.sh
```

Каждые 2 минуты скрипт читает сессии OpenClaw и обновляет статусы агентов на VPS.

### 5. Открой в браузере

```
http://your-domain.com
```

Для HTTPS:
```bash
ssh your-vps "certbot --nginx -d your-domain.com"
```

## Структура

```
ai-office-constructor/
├── config/
│   ├── office.example.json   # Пример конфига
│   └── office.json           # Твой конфиг (создаётся setup)
├── scripts/
│   ├── setup.sh              # Интерактивная настройка
│   ├── deploy.sh             # Деплой на VPS
│   ├── sync-agents.js        # Синхронизация статусов
│   └── install-sync.sh       # Установка автосинхронизации
├── worker/
│   └── ws-server.js          # WebSocket для live-обновлений
├── nginx/
│   └── office.conf.template  # Шаблон nginx
├── docker-compose.yml        # Docker-деплой (альтернатива)
├── pm2.config.js             # PM2 ecosystem
└── README.md
```

## Конфигурация

### Агенты

Редактируй `config/office.json`:

```json
{
  "agents": [
    {
      "id": "writer",
      "name": "Копирайтер",
      "emoji": "✍️",
      "role": "Тексты",
      "position": { "x": 350, "y": 280 }
    }
  ],
  "openclaw": {
    "agentMapping": {
      "copywriter": "writer"
    }
  }
}
```

`agentMapping` связывает OpenClaw agent ID (из openclaw.json) с ID в офисе.

### Пороги статусов

```json
{
  "sync": {
    "idleThresholdMin": 5,      // < 5 мин → working
    "offlineThresholdMin": 30,   // < 30 мин → idle, > 30 мин → offline
    "intervalSec": 120           // синхронизация каждые 2 мин
  }
}
```

## Кастомизация

### Фон офиса
Замени `public/office-bg.png` на свой pixel-art фон (рекомендуемый размер: 960×600).

### Персонажи
Агенты отрисовываются программно (Pixi.js Graphics). Цвета и формы настраиваются в коде компонента `PixelOffice.tsx`.

### Позиции агентов
Координаты в `config/office.json` → `position.x`, `position.y`. Подбирай под свой фон.

## Docker-деплой (альтернатива)

```bash
docker-compose up -d
```

## Стриминг на YouTube

AI Office отлично смотрится как 24/7 стрим:
1. Открой офис в OBS как Browser Source
2. Размер: 960×600 (или под свой фон)
3. Агенты двигаются и меняют статусы в реальном времени

## FAQ

**Нужен ли OpenClaw?**
Да, офис показывает статусы агентов из OpenClaw. Без него агенты будут offline.

**Можно без VPS?**
Можно запустить локально (`npm run dev`), но стрим и внешний доступ требуют VPS.

**Сколько агентов максимум?**
Технически — неограниченно. Визуально комфортно 5-9 на стандартном фоне.

**Как добавить агента после setup?**
Отредактируй `config/office.json`, добавь запись в agents и agentMapping, перезапусти.

## Поддержка

- 📖 OpenClaw docs: [docs.openclaw.ai](https://docs.openclaw.ai)
- 💬 Поддержка: [@galsonproAIbot](https://t.me/galsonproAIbot)
- 🐙 Issues: GitHub Issues этого репо

## Лицензия

MIT — используй как хочешь.

---

## Автор

Сделано **Максом Галсоном** — основателем [Фабрики Контента](https://galson.pro).

- 📺 YouTube: [@galsonproai](https://youtube.com/@galsonproai) — AI контент на практике
- 📱 Telegram: [@galsonproai](https://t.me/galsonproai) — канал про AI
- 🧵 Threads: [@maximgalson](https://threads.com/@maximgalson)
- 🌐 Сайт: [galson.pro](https://galson.pro)
- 🤖 Бот: [@galsonproAIbot](https://t.me/galsonproAIbot) — AI-ассистент Макса

### Другие проекты

- 🏭 [Конструктор Фабрики Контента](https://github.com/maximgalson/content-factory) — система создания контента через AI агентов
- 📚 [База знаний](https://fabrika.galson.pro) — всё про AI-автоматизацию контента
- 🎓 [kupiclaude.ru](https://kupiclaude.ru) — доступ к Claude для русскоязычных
