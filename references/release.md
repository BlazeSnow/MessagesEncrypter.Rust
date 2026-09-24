# 发布与分发（参照）

> 原版发布流程与产品身份记录。重构版发布到 Microsoft Store，沿用同一产品身份。

## 1. 产品身份（不可变更项）

| 项 | 值 |
| --- | --- |
| 包 Identity Name | `BlazeSnow.MessagesEncrypter` |
| Publisher | `CN=C171AF55-419C-4E73-B34E-CB98C8F1EB78` |
| 发布者显示名 | BlazeSnow |
| Microsoft Store ID | `9pkn38fmmgbb` |
| 许可证 | AGPL-3.0-only |
| 仓库 | https://github.com/BlazeSnow/MessagesEncrypter |

- 沿用同一 Identity 的意义：包家族名不变 → 应用数据目录不变 → 旧版 `keys.db` 可原地读取（见 [storage.md](./storage.md) §7），商店条目与更新链路延续。

## 2. 版本号

- 格式 `YYYY.M.D.0`（日期制），如 `2026.9.24.0`。
- UI 显示版本必须从打包清单读取，禁止硬编码。
- git 标签：`v<版本>`，由脚本从清单读取版本号打 annotated tag 并推送。

## 3. 原版发布流程（供对照）

1. 更新清单版本号与官网 changelog。
2. 发版脚本：读清单 `Identity/@Version` → `git tag -a v<version>` → 交互确认后推送。
3. GitHub Actions 监听 `v*` tag，自动创建 GitHub Release。
4. 产出 Store 上传包（`.msixupload`，StoreOnly 模式，x86/x64/ARM64 bundle），提交到 Microsoft Store（商店侧签名）。

原版打包要点：自包含 + 裁剪；最低系统 Windows 10 17763；`runFullTrust` 能力。

## 4. Tauri 2 打包注意（待落地验证）

- Tauri 默认产物为 MSI/NSIS 安装包；**上架 Microsoft Store 需要 MSIX**。可选路径：Tauri 的 appx 打包目标（需 Windows SDK），或用 MakeAppx 将 Tauri 产物封装为 MSIX 并写入上述 Identity 与版本号。实际流程落地后在 `DEVELOPMENT.md` 回填。
- WebView2 依赖的分发方式（离线安装器 / 系统内置）在打包验证时确定。
- 版本号 `YYYY.M.D.0` 需同时写入 tauri.conf 与 MSIX 清单，保持一致。
- 官网下载区与 FAQ 第 12 条须与最终分发方式保持同步。

## 5. 文档站

- VitePress；中文在根路径、英文在 `/en/`；部署于 Vercel：https://messages.blazesnow.com/。
- 页面：首页 / 快速开始 / 常见问题 / 消息格式 V1 / 更新日志。
- changelog 条目用 emoji 分类：`### ✨ 新增 | 🚀 改进 | 🐛 修复 | 🎉 首个版本`（见 `## v<版本>` 结构）。
- 重构版发布时：官网 changelog 新增条目；分发方式/系统要求如有变化，同步 FAQ 与首页。
