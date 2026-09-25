# DEVELOPMENT

MessagesEncrypter（Tauri 2 重构版）的开发索引。**本文件只作索引与速查，详细规范与实现记录全部在 [references/](./references/README.md)。**

- 根目录 `AGENTS.md` 是最高优先级约束，禁止修改；与本文件冲突时以 AGENTS.md 为准。
- **约定：每完成一项功能，在 §6 开发日志追加一行摘要，细节写入 [references/implementation.md](./references/implementation.md)。**

## 1. 项目定位

本仓库是 MessagesEncrypter 的 Tauri 2 重构版（原版为 WinUI 3 应用）。产品定位、红线与对外承诺见 [references/product-spec.md](./references/product-spec.md)。

## 2. 技术栈

| 层 | 选型 | 备注 |
| --- | --- | --- |
| 应用框架 | Tauri 2 | 仅支持 Windows |
| 后端 | Rust | 加密、密钥库、业务逻辑 |
| 前端 | React + TypeScript + Vite；组件库 shadcn/ui（Tailwind CSS v4） | |
| 数据库 | SQLite（rusqlite，bundled） | 密钥库 |
| 多语言 | 前端 i18next | zh-Hans（默认）+ en（回退）；`fluent-i18n` 暂未引入（后端无用户可见文案），需要时再补 |
| 测试 | cargo test；vitest + @testing-library | `cargo test` / `pnpm test` |
| 包管理 | 前端 pnpm | |

## 3. 常用命令

```bash
pnpm install          # 安装前端依赖
pnpm tauri dev        # 开发运行（或根目录 run.ps1）
pnpm build            # 构建发布 exe（tauri build --no-bundle）
pnpm test             # 前端测试
cargo test            # 后端测试（src-tauri）
node tools/check-locales.mjs   # 本地化一致性校验（npm run check:locales）
scripts/make-msix.ps1 # 打包 msixbundle（微软商店，唯一分发方式）
version.ps1 / tag.ps1 # 版本同步 / 打 tag 触发发布
```

改动交付前必须全部通过：`cargo test`、`pnpm test`、`check:locales`、`pnpm build`。

## 4. 硬性约束（速查）

1. 密文格式 v1 与原版逐字节兼容、校验顺序与错误码对齐 → [references/protocol-v1.md](./references/protocol-v1.md)
2. 原版用户数据可迁移（keys.db / .pub / .pem / 凭据），密钥存储格式不可变 → [references/storage.md](./references/storage.md)、[references/key-management.md](./references/key-management.md)
3. 用户可见文本零硬编码（zh-Hans + en，键集合与占位符一致）→ [references/i18n.md](./references/i18n.md)
4. 私钥必须密码加密存储、指纹算法不可变 → [references/key-management.md](./references/key-management.md)
5. 只做 msixbundle 微软商店分发，不做其他打包 → [references/release.md](./references/release.md)

## 5. 文档索引

| 文档 | 内容 |
| --- | --- |
| [references/README.md](./references/README.md) | 索引与重构总原则 |
| [references/protocol-v1.md](./references/protocol-v1.md) | 密文包格式 v1 规范（兼容基线） |
| [references/key-management.md](./references/key-management.md) | 密钥管理（生成/指纹/PEM/导入导出） |
| [references/storage.md](./references/storage.md) | 密钥库、完整性签名、凭据、迁移 |
| [references/ui-pages.md](./references/ui-pages.md) | 页面功能与交互参照 |
| [references/product-spec.md](./references/product-spec.md) | 产品定位红线、FAQ 口径、未来方向 |
| [references/i18n.md](./references/i18n.md) | 多语言规范 |
| [references/testing-checklist.md](./references/testing-checklist.md) | 测试基线与兼容验收清单 |
| [references/release.md](./references/release.md) | 发布与分发 |
| [references/implementation.md](./references/implementation.md) | **Tauri 2 实现记录与决策（重构版细节都在这里）** |

文档中禁止出现原项目的本机绝对路径；需要指代时用「原 WinUI 3 版本」或公开 URL。

## 6. 里程碑

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| M0 | 脚手架：Tauri 2 + React + shadcn/ui | ✅ |
| M1 | protocol_v1 + 原版互操作验证（四方向） | ✅ |
| M2 | 密钥管理 + 密钥库 + 完整性 | ✅ |
| M3/M4 | 加解密与密钥管理页面 | ✅ |
| M5 | 双语 + 语言切换（即时生效） | ✅ |
| M6 | 设置页、单实例、窗口记忆、msixbundle 打包 | ✅ |
| M7 | 旧数据迁移与兼容验收 | ✅（真机旧版数据待实测） |
| 后续 | 测试体系（cargo 40 + vitest 18）、深色模式、首页导航 | ✅ |

## 7. 开发日志（一行式，细节见 [references/implementation.md](./references/implementation.md)）

- 2026-09-26：文件拆分（commands/ 与 keystore/ 目录化、前端对话框组件化，全部源文件 ≤400 行）；8192 位生成改走 Windows CNG（rsa 纯实现数分钟不可用，CNG 端到端实测约 5s，与旧版同源）；生成密钥对进度卡提升为全局状态（切页不丢、防并发生成，前端 20 项）；进度卡内边距收紧（100px→80px）；私钥管理页「生成密钥」改称「生成密钥对」（按钮与对话框标题）；旧版数据迁移适配验证（签名 BOM 兼容 + 首启动重签时序，真机端到端通过）；仓库链接修正；测试体系补全（cargo 40 + vitest 18 + 流水线门禁）；深色模式补全；首页步骤可点击导航与序号修正；密钥下拉指纹浅色；去掉加解密页外层卡片；单实例唤醒补强；打开导出目录 scope 修复；导入弹窗布局修复；加解密按钮加载动画；私钥生成后台化；私钥菜单补齐公钥操作与右键菜单；UI 图标语义重排；msixbundle 打包流水线落地；修复 CI 测试门禁的 mock 缺导出（IntegrityDialog errorCodeOf）与 vitest __dirname 弃用告警。
- 2026-09-25：互操作验证四方向全绿；后端核心（协议/密钥/密钥库/完整性/迁移）；脚手架。
- 2026-09-24：DEVELOPMENT.md 与 references/ 文档建立。
