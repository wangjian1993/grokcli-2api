# grokcli-2api Admin

基于 Vue3 + antdv-next 的 grokcli-2api 管理台 SPA。

## 技术栈

- Vue 3 + Vite + TypeScript
- antdv-next + Tailwind CSS v4
- Pinia + Vue Router（Hash 模式生产构建）
- 业务 API：`/admin/api` + `X-Admin-Token`

## 开发

```bash
cd web/admin
pnpm install
pnpm dev
```

默认开发端口 `5173`，将 `/admin/api` 代理到 `http://127.0.0.1:3000`。

## 构建

```bash
pnpm build
```

- `base=/static/admin-spa/`
- 产物写入 `dist/`，并自动复制到仓库 `static/admin-spa/`
- **不会**覆盖多页 `static/admin/*.html`

Docker 镜像由 `admin-builder` 阶段执行 `pnpm build`。

## 路由

Hash 模式：`https://host/admin#/auth/login`、`https://host/admin#/overview` 等。

业务页面在 `src/views/g2a/`，静态菜单见 `src/router/routes/modules/g2a.ts`。

## 环境变量

因仓库 `.gitignore` / `.dockerignore` 会忽略 `.env*`，提交了无模板文件：

| 文件 | 用途 |
|------|------|
| `env` | 基础配置（标题、namespace） |
| `env.development` | 开发 |
| `env.production` | 生产：`base=/static/admin-spa/`、Hash 路由、`/admin/api` |
| `.env.example` | 示例 |

本地开发可：

```bash
cp env .env && cp env.development .env.development
pnpm dev
```

Docker 构建阶段会自动从 `env*` 复制为 `.env*` 再 `pnpm build`。
