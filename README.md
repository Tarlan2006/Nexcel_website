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

**Редактируемый источник — [content/navigation.json](content/navigation.json).** Он содержит услуги, разделы компании, контакты, соцсети, CTA и тексты футера, взятые из существующих шаблонов. Основной сайт сейчас только RU: ключи `kk` оставлены пустыми, переводы не придуманы.

```sh
npm run generate:nav
npm run check:nav
```

Генератор создаёт:

- `shared/nav.json` — публичный справочник с абсолютными HTTPS-ссылками;
- `partials/header.html` — меню для компьютеров и телефонов;
- `partials/footer.html` — общий футер.

Эти файлы генерируются и коммитятся вместе с источником. `npm test` запрещает устаревший результат; build и dev запускают генератор автоматически. Макеты, CSS-классы, SVG и поведение меню сохранены в `src/shared/`; стили сайта не менялись.

Для новой услуги добавьте **одну запись в `services`** источника и обновите там же `updatedAt` в ISO UTC. Поле `footerLabel` нужно только для отличающейся короткой подписи; без него используется `label`. По этому правилу уже добавлены «Фото на документы» → `https://photo.nexcel.kz/`, создание сайтов и остальные существующие услуги. Разделы компании задаются один раз в `pages`, порядок — в `headerPages` и `footerPages`.

Описание схемы — `schemas/nav.schema.json`. Проверяются обязательные поля и RU-подписи, ключ `kk`, ISO-дата, абсолютные HTTPS URL, отсутствие логина/пароля в URL и повторов внутри списков. Одинаковая ссылка в верхнем меню и футере допустима.

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
