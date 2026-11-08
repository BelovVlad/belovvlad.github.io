# Hyle.space: переход к единому origin (GitHub Pages)

## Причина
После переноса проектов `Helper_PF_NSU`, `Department`, `NSU_FP_Y4_S1` и `diploma` в организацию `Hyle-space` они открываются с `hyle-space.github.io`.
Home продолжает публиковаться из пользовательского репозитория `BelovVlad/belovvlad.github.io` с доменом `hyle.space`. Для установленного Android PWA это **другой origin**, поэтому Chrome открывает Custom Tab и показывает адресную панель. JavaScript и CSS не могут скрыть эту панель.

## Цель
Корневой сайт: `https://hyle.space/`.
Проектные сайты: `https://hyle.space/Helper_PF_NSU/`, `https://hyle.space/Department/`, `https://hyle.space/NSU_FP_Y4_S1/`, `https://hyle.space/diploma/`.

## Шаги в интерфейсе GitHub (доступ GitHub connector не разрешает transfer/rename)
1. Проверить, что у организации `Hyle-space` ещё нет репозитория `Hyle-space.github.io` и что у неё права на домен `hyle.space`.
2. В репозитории `BelovVlad/belovvlad.github.io` открыть **Settings → General → Danger Zone → Transfer ownership**. Перенести в организацию `Hyle-space`. Не удалять и не создавать дублирующую копию Home.
3. В настройках перенесённого репозитория изменить его имя на **`Hyle-space.github.io`** (GitHub Pages org site). Основную ветку `main` и workflow `.github/workflows/pages.yml` сохранить.
4. В **Settings → Pages** проверить `Build and deployment: GitHub Actions`; закрепить **Custom domain: `hyle.space`**, если он не сохранился; дождаться проверок DNS/HTTPS. Если GitHub требует подтвердить право организации на домен — выполнить подтверждение в настройках организации. Не удалять DNS-записи до определения причины проверки.
5. Проверить, что четыре проекта организации публикуются и наследуют `hyle.space`. На странице каждого проекта не задавать конфликтующий индивидуальный custom domain.
6. После успешного открытия всех адресов и прохождения тестов слить PR с подготовленными исправлениями ссылок. **До переключения домена PR не сливать**: ссылки новой конфигурации могут вести на 404.

## Проверка после переноса
- `https://hyle.space/` — Home (работают ресурсы, настройки, сохранённые пользовательские ссылки).
- `https://hyle.space/search/` — поиск, загрузка каталогов и приоритетное открытие книги.
- `https://hyle.space/Helper_PF_NSU/` — каталог и PDF, сохранение заметок.
- `https://hyle.space/Department/` — каталог и PDF, заметки.
- `https://hyle.space/NSU_FP_Y4_S1/docs/` — материалы 4 курса.
- `https://hyle.space/diploma/` — вход и защищённые материалы.
- Телефон: переход из установленного Hyle в любой из этих разделов больше не должен открывать внешнюю Chrome Custom Tab.
- Проверить статический `/search/`, worker, `/manifest.webmanifest`, `/api.hyle.space` и `books.hyle.space` отдельно. Последние два субдомена относятся к серверу и не требуют изменения GitHub Pages.

## Откат
Не удалять репозитории и DNS. При проблеме с проектными путями вернуться на `hyle-space.github.io` для сайтов организации и временно не сливать PR. При проблеме с Home восстановить исходное имя/владельца и настройку домена после выяснения DNS/Pages. Сохранённые ресурсы пользователя находятся в localStorage и в данном PR не очищаются.

## Что меняет PR
- `config.js` и `search/sites.json`: ссылки на собственные сайты теперь на `hyle.space`.
- `model.js`: однократная миграция сохранённых адресов с `hyle-space.github.io`, сохраняя глубокие ссылки и пользовательские данные.
- `app.js`: ссылки на свой origin не создают новых вкладок даже при включённой опции «Открывать ссылки в новой вкладке».
- `tests/`: проверки домена и миграции.
