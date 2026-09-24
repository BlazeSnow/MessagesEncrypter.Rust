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

## 4. Tauri 2 打包（已落地：仅 msixbundle）

分发目标只有微软商店，产物为 `.msixbundle`，不做其他打包格式。实现（详见 `scripts/make-msix.ps1` 与 `.github/workflows/release.yml`）：

- Tauri 只负责出 exe：`cargo build --release --features custom-protocol`（前端资产经 `custom-protocol` feature 编译期内嵌；`tauri.conf.json` 的 `bundle.targets` 置空，不经 tauri bundler）。
- `scripts/make-msix.ps1`：用 Windows SDK 的 makeappx/makepri 把 exe + AppxManifest（模板生成，写上述 Identity 与四段版本号）+ 图标资源打包为 `.msix`，再合并为 `.msixbundle`；`/bv` 显式指定 bundle 版本。
- 图标资产在 `msix/assets/`，沿用原版应用的全套变体（scale / targetsize / altform-unplated），与原版商店条目视觉一致。
- 版本号：`package.json`（三段 `YYYY.M.D`）为唯一来源，`version.ps1` 同步到 Cargo.toml / tauri.conf.json / Cargo.lock；`tag.ps1` 补第四段后打 `v<版本>` 标签。
- 发布：推送 `v*` 标签触发 GitHub Actions（windows-latest，x64 + arm64 双架构），产出 msixbundle 并创建 GitHub Release；商店上传使用该 bundle。
- WebView2 依赖商店打包默认随系统分发；最低系统 Windows 10 17763 与原版一致。

## 5. 文档站

- VitePress；中文在根路径、英文在 `/en/`；部署于 Vercel：https://messages.blazesnow.com/。
- 页面：首页 / 快速开始 / 常见问题 / 消息格式 V1 / 更新日志。
- changelog 条目用 emoji 分类：`### ✨ 新增 | 🚀 改进 | 🐛 修复 | 🎉 首个版本`（见 `## v<版本>` 结构）。
- 重构版发布时：官网 changelog 新增条目；分发方式/系统要求如有变化，同步 FAQ 与首页。
