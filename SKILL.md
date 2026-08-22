---
name: gitbx-release
description: 发布 GITBX 桌面版本时，执行 main 合并、跨平台安装包构建、签名、latest.json 校验和分支回合流程。
---

# GITBX 发布规范

## 分支流程

每次发布必须以当前开发分支为源头：

1. 记录当前分支，确认工作区状态，并将当前分支合并到 `main`。
2. 只在合并后的 `main` 上同步版本号、打包、生成签名和发布新版本。
3. 将 `main` 推送、打 tag 并创建 GitHub Release 后，切换回原开发分支。
4. 将发布期间 `main` 的修改合并回原开发分支，并推送原开发分支。

不得直接从未合并到 `main` 的开发分支发布，也不得发布完成后停留在 `main`。

## 发布资产

每次正式发布必须生成并验证 12 个 Release 资产：

- Windows x64：NSIS 安装包、NSIS `.sig`、MSI 安装包、MSI `.sig`。
- Linux x64：AppImage、AppImage `.sig`、DEB、DEB `.sig`。
- macOS ARM64：DMG、更新包、更新包对应的 `.sig`。
- `latest.json`：Tauri 更新器元数据。

以上 12 个资产必须全部上传到同一个 GitHub Release。GitHub 自动生成的源码压缩包不计入这 12 个资产。

## 发布前检查

- 版本号必须在前端、Rust workspace、Tauri 配置和锁文件中保持一致。
- 发布 tag 使用 `v<版本号>` 格式，例如 `v0.1.2`。
- `.sig` 必须使用项目配置的 Tauri 签名私钥生成，不得上传空文件或伪造签名。
- `latest.json` 中的平台、架构、版本号、下载地址和签名必须与 Release 资产逐一对应。
- 上传前验证所有资产存在、文件大小非零，并检查签名和 `latest.json` 内容；任何一项缺失都不得创建正式 Release。
- Release 标题、正文和变更日志使用正确 Markdown 格式，避免把标题、列表和段落拼接成一行。

## 发布后验证

创建 Release 后，使用 GitHub CLI 检查 tag、Release 状态和资产清单，确认 12 个目标资产均为 `uploaded`。随后按“分支流程”切回原开发分支并合并 `main`。
