# grokcli-2api Admin (antdv-next)

Vue 3 + Vite + [antdv-next](https://github.com/antdv-next/admin) 风格管理台。

## 开发

```bash
cd web/admin
pnpm install
pnpm dev
```

默认把 `/admin/api` 代理到 `http://127.0.0.1:3000`。

## 构建

```bash
pnpm build
```

产物写入仓库 `static/admin-spa/`（`base=/static/admin-spa/`），**不会**覆盖多页 `static/admin/*.html`。

Docker 镜像构建时由 `admin-builder` 阶段自动 `pnpm build` 并安装到 `/app/static/admin-spa`。

Go 服务端默认 `GROK2API_ADMIN_UI=auto`：存在 `static/admin-spa/index.html` 时 `/admin` 走 SPA，否则走多页。

## 路由

使用 Hash 模式：`https://host/admin#/login`、`https://host/admin#/keys` 等。入口页只需 `/admin`。
