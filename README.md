# Tether QVAC Local AI Development Suite

Комплексный проект и техническое руководство для разработки локального ИИ без зависимостей от облачных сервисов на базе **Tether QVAC SDK & CLI**.

---

## 🚀 Возможности системы

1. **QVAC SDK & CLI (JS/TS & Python)** — Управление локальным окружением, запуск моделей с аппаратным ускорением (Apple Silicon Metal / CUDA / CPU TurboQuant).
2. **Локальный LLM Engine** — Генерация текста, чат-сообщения и потоковый вывод (Streaming API).
3. **Распознавание и синтез речи (STT / TTS)** — Преобразование аудио в текст (Whisper) и генерация речи.
4. **Перевод текста и OCR** — Локальный нейросетевой перевод и распознавание текста с изображений (Florence-2 / Tesseract).
5. **Локальный RAG (Retrieval-Augmented Generation)** — Векторизация документов, локальное векторное хранилище и поиск контекста.
6. **OpenAI-совместимый сервер** — Локальный HTTP сервер (`http://127.0.0.1:8080/v1`), позволяющий использовать стандартные библиотеки `openai` в качестве drop-in replacement.

---

## 🛠️ Установка и запуск

### 1. Установка зависимостей

```bash
npm install
```

### 2. Сборка проекта

```bash
npm run build
```

### 3. Запуск тестов

```bash
npm test
```

---

## 💻 Работа с QVAC CLI

Интерфейс командной строки позволяет оперативно тестировать все модули:

```bash
# Информация о локальном железе и настройках QVAC
npm run cli -- info

# Запуск локальной LLM
npm run cli -- llm --prompt "Расскажи про преимущества QVAC SDK"

# Распознавание речи (STT)
npm run cli -- stt --file audio.wav

# Синтез речи (TTS)
npm run cli -- tts --text "Привет от локального ИИ Tether QVAC" --output hello.wav

# Перевод текста
npm run cli -- translate --text "Hello world" --target ru

# Распознавание текста с картинки (OCR)
npm run cli -- ocr --image document.png

# Поиск по документам (RAG)
npm run cli -- rag --doc README.md --query "Как запустить локальный сервер?"
```

---

## 🌐 Локальный OpenAI-совместимый HTTP сервер

Запустите сервер:

```bash
npm run dev:server
# или через CLI:
npm run cli -- server --port 8080
```

Сервер предоставляет следующие эндпоинты:

* `GET /v1/models` — Список локальных моделей.
* `POST /v1/chat/completions` — Генерация ответов чата (поддерживает `stream: true`).
* `POST /v1/embeddings` — Генерация векторных эмбеддингов.
* `POST /v1/audio/transcriptions` — Транскрипция аудио.
* `POST /v1/audio/speech` — Синтез речи.

---

## 🐍 Использование из Python

Вы можете взаимодействовать с локальным сервером QVAC из Python-приложений через стандартный HTTP или библиотеку `openai`:

```python
import urllib.request
import json

req = urllib.request.urlopen("http://127.0.0.1:8080/v1/models")
print(json.loads(req.read().decode()))
```

Пример готового скрипта для интеграции с Python доступен в [examples/python_example.py](file:///Users/derlyight/Documents/untitled%20folder/examples/python_example.py).

---

## ⚙️ Конфигурация (qvac.config.json)

Настройки квантования, путей к кэшу и моделей находятся в файле `qvac.config.json`.
