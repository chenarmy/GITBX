# GITBX 官网

纯静态 HTML 官网，无需构建即可运行。

```powershell
cd website
python -m http.server 4173
```

然后访问 `http://127.0.0.1:4173/`。

页面内置与客户端一致的 8 种语言：English、日本語、Deutsch、Español、简体中文、繁體中文、Français、العربية；阿拉伯语会自动切换为 RTL 布局。

下载按钮会根据访问者系统直接下载 CNB 安装包；下拉菜单提供 EXE、MSI、DMG、AppImage 和 DEB 直链。发布新版本时只需修改 `app.js` 中的 `FALLBACK_VERSION`，五类安装包地址会同步更新。

## 部署

- GitHub Pages：由 `.github/workflows/pages.yml` 自动发布。
- EdgeOne Pages：GitHub `main` 经 `.github/workflows/mirror-cnb-main.yml` 镜像到 CNB，再由仓库根目录的 `.cnb.yml` 使用 1 核构建节点，通过中国站账号将 `website/` 发布到 `gitbx` 项目（全球可用区），正式域名为 `gitbx.chenyouyou.top`。
