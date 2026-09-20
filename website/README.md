# GITBX 官网

纯静态 HTML 官网，无需构建即可运行。

```powershell
cd website
python -m http.server 4173
```

然后访问 `http://127.0.0.1:4173/`。

页面内置与客户端一致的 8 种语言：English、日本語、Deutsch、Español、简体中文、繁體中文、Français、العربية；阿拉伯语会自动切换为 RTL 布局。

下载按钮会根据访问者系统直接下载 CNB 安装包；下拉菜单提供 EXE、MSI、DMG、AppImage 和 DEB 直链。发布新版本时只需修改 `app.js` 中的 `FALLBACK_VERSION`，五类安装包地址会同步更新。
