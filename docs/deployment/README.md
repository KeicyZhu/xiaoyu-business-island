# GitHub Pages 发布与更新

源码仓库：[KeicyZhu/xiaoyu-business-island](https://github.com/KeicyZhu/xiaoyu-business-island)。

网页入口：[空降之商业女王小玉](https://keicyzhu.github.io/xiaoyu-business-island/)。

## 分支职责

- `main`：游戏源码、原创知识库、PRD、玩法、开发说明与版本记录。
- `gh-pages`：只包含 `npm run build` 生成的静态网页，附 `.nojekyll`。

Pages 发布源配置为 `gh-pages` 的根目录。采用仓库分支发布，部署不依赖模型 API 或服务器程序。源码和网页分别有可回滚的 Git 提交。

## 发布前

```sh
npm test
npm run build
```

浏览器验证入口、地图全部名称、学习弹窗、存档、手机和无 WebGL 降级。构建资源使用相对路径，支持仓库子路径。不要上传私人知识原文、浏览器答案备份、凭据或开发环境排障记录。

## 更新网页分支

在独立工作目录签出已有 `gh-pages` 分支，将新的 `dist/` 内容同步到该目录，保留其 `.git` 元数据，添加 `.nojekyll` 后提交并推送。不要从源码工作目录直接执行删除全部文件的命令。

```sh
git worktree add ../xiaoyu-site gh-pages
# 将 dist/ 的文件同步至 ../xiaoyu-site/，保留该工作目录的 .git 文件
# 在 ../xiaoyu-site 中检查差异、提交并推送 gh-pages
```

首次创建分支与之后更新不同；已有线上分支应正常追加提交，不做强制覆盖历史。发布后检查 GitHub Pages 构建状态和实际 URL，确认 HTML、CSS、模块和 SVG 都能访问。

## 回滚

在网页分支恢复到一个已验证版本的文件内容，并新增回滚提交。无需修改学习规则或用户浏览器存档。若规则／存档格式变化，应先设计迁移和兼容验证。

## 可选 Actions 模板

本目录的 `pages-workflow.yml` 和 `verify-workflow.yml` 是可选模板，没有在本次公开仓库中自动启用。需要使用 Actions 部署时，将其复制到 `.github/workflows/`，改 Pages 发布源为 GitHub Actions，并确认当前凭据可以维护工作流。

参考：[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)。
