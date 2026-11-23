# Nexcel Solutions — nexcel.kz

Статический сайт компании. Сборка публикует только файлы из `dist/`; конфигурация хостинга — `wrangler.jsonc` и корневой `_headers`.

```sh
npm ci
npm test
npm run build
npm run dev
```

Для проверки заголовков в локальной среде Cloudflare: `npm run dev:cloudflare`, затем в другом терминале `npm run check:cloudflare`. Проверки меню: `npm run check:navigation`; SEO: `npm run check:seo`. Проверено с Node.js 24.

## Общие меню и футер

**Источник меню и публичного справочника — [content/navigation.json](content/navigation.json). Единственный источник HTML-футера — [partials/footer.html](partials/footer.html).** Генератор сохраняет ручные правки футера. JSON содержит справочную копию контактных данных для поддоменов. Основной сайт сейчас только RU: ключи `kk` оставлены пустыми, переводы не придуманы.

```sh
npm run generate:nav
npm run check:nav
```

Генератор создаёт:

- `shared/nav.json` — публичный справочник с абсолютными HTTPS-ссылками;
- `partials/header.html` — меню для компьютеров и телефонов.

JSON и шапка генерируются и коммитятся вместе с источником. Футер редактируется непосредственно в `partials/footer.html` и встраивается во все страницы сборки. `npm test` запрещает устаревший результат; build и dev запускают генератор автоматически. Макеты, CSS-классы, SVG и поведение меню сохранены в `src/shared/`; стили сайта не менялись.

Для новой услуги добавьте запись в `serviceGroups[].links` источника, обновите `updatedAt` в ISO UTC и соответствующую ссылку в `partials/footer.html`. Группы «Разработка» и «Лицензии ПО и SaaS» имеют отдельные меню и колонки футера. «Фото на документы» относится к социальным проектам и доступно через `/free`. Разделы компании задаются один раз в `pages`, порядок — в `headerPages` и `footerPages`.

Описание схемы — `schemas/nav.schema.json`. Проверяются обязательные поля и RU-подписи, ключ `kk`, ISO-дата, абсолютные HTTPS URL, отсутствие логина/пароля в URL и повторов внутри списков. Одинаковая ссылка в верхнем меню и футере допустима.

`npm run check:footers` проверяет все собранные HTML, включая 404 и новости: одинаковые шапку и футер из `partials/header.html` и `partials/footer.html`, отсутствие старых адресов и терминов в навигации. Исходные страницы должны использовать общие placeholders и присутствовать в dist; версии страницы и общего JS также обязательны. Проверка обязательна в `npm run build` и `check:http`. Для таблицы хешей используйте `npm run check:footers -- --table`, для JSON — `npm run check:footers -- --json`.

## Публичный адрес

[https://nexcel.kz/shared/nav.json](https://nexcel.kz/shared/nav.json)

```sh
curl -i -H "Origin: https://photo.nexcel.kz" https://nexcel.kz/shared/nav.json
```

Ожидаются HTTP 200, `Content-Type: application/json; charset=utf-8`, `Cache-Control: public, max-age=300`, `Access-Control-Allow-Origin: https://photo.nexcel.kz`. Локальный адрес: `http://127.0.0.1:5500/shared/nav.json`. В этой структуре нет `public/`: файл берётся из корневой `shared/` и копируется в `dist/shared/`, а заголовки — из корневого `_headers`.

## Что настроить вручную

1. Откройте проверенный [Cloudflare Pages-проект photo-nexcel](https://dash.cloudflare.com/a947507fcdc5eee5d2165a42f17037ff/pages/view/photo-nexcel), обслуживающий **photo.nexcel.kz** и репозиторий **Tarlan2006/photo-nexcel**. В Settings → Builds & deployments → Deploy hooks создайте hook для ветки **master**. [Официальная инструкция](https://developers.cloudflare.com/pages/configuration/deploy-hooks/). Используйте этот проект, а не отдельный одноимённый Worker.
2. В GitHub-репозитории **Tarlan2006/Nexcel_website** откройте Settings → Secrets and variables → Actions → New repository secret. Имя — **PHOTO_DEPLOY_HOOK**, значение — URL созданного hook. Не помещайте этот URL в код или документацию. [Инструкция GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
3. Для проверки откройте Actions → **Validate shared navigation and notify subsites** → Run workflow для main. Успешное уведомление запускает сборку photo; её завершение проверяется в Cloudflare.

Workflow `.github/workflows/notify-subsites.yml` запускается при изменении справочника или его исходников в main/master, а проверка — также в pull request. Сначала проходят `npm test` и build. При наличии секрета workflow ждёт, пока публичный JSON совпадёт с новым файлом, затем выполняет один POST. При отсутствии секрета шаг пропускается без ошибки; секрет не выводится в лог. Сам URL hook не является гарантией завершённого деплоя поддомена.

В photo-nexcel получение справочника подключено перед build и dev: в браузер входят готовые локальные данные, внешний запрос выполняется только при сборке. Для известных KZ-подписей сохраняются существующие переводы; новые подписи без `kk` показываются на RU. Настройка hook соединяет эту сборку с изменениями общего источника.

Повторы внутри списков запрещены; повтор между меню и футером намеренный. CORS разрешён только для photo.nexcel.kz. Значение `https://*.nexcel.kz` браузеры не поддерживают как origin; для других поддоменов понадобится согласованный список origins в серверной обработке. [Правила заголовков Cloudflare](https://developers.cloudflare.com/workers/static-assets/headers/).

Результаты проверки и устройство сборки — в [docs/shared-navigation.md](docs/shared-navigation.md).

HTML и partials отдаются с Cache-Control: no-store; у assets остаётся перепроверка актуальности, а у shared/nav.json — согласованный кеш на 300 секунд. Сборка добавляет версию к include-partials.js и метку версии HTML. При восстановлении вкладки обновляются оба общих блока; при смене версии HTML страница перезагружается целиком. Обработчики меню прежней шапки удаляются перед повторной инициализацией.
