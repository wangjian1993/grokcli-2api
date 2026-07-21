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

产物写入仓库 `static/admin/`（`base=/static/admin/`，路由 history base=`/admin/`）。

Docker 镜像构建时由 `admin-builder` 阶段自动 `pnpm build` 并覆盖 `/app/static/admin`。

## 路由

使用 Hash 模式：`https://host/admin#/login`、`https://host/admin#/keys` 等。入口页只需 `/admin`。
