# 商品管理本地数据库

商品管理页面使用本地 MySQL 持久化数据。先复制环境变量模板并填写 Navicat 连接对应的真实密码：

```powershell
Copy-Item .env.example .env
```

`.env` 默认配置为 `localhost:3301`、数据库 `威斯`、用户 `root`。启动 API 时会自动创建数据库、`products` 表和示例数据。

```powershell
pnpm run dev:full
```

也可以分两个终端分别运行 `pnpm run server` 和 `pnpm run dev`。前端地址为 `http://localhost:5173/back`，API 地址为 `http://localhost:3001`。
