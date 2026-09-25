# Tauri 2 实现记录与决策

> 本仓库（Tauri 2 重构版）的实现细节、决策记录与环境备忘。原版现状参考见本目录其他文档；索引见根目录 [DEVELOPMENT.md](../DEVELOPMENT.md)。

## 1. 架构与模块

### 1.1 后端（src-tauri/src/）

- `protocol_v1` — 密文格式 v1。**铁律：不依赖 Tauri、SQLite、窗口系统**，保持可独立测试；错误码沿用原版 `ErrorXxx` 命名，校验顺序与 [protocol-v1.md](./protocol-v1.md) 一致。互操作测试（`#[ignore]`）经 `INTEROP_DIR` 环境变量与 .NET harness 做四方向交叉验证。
- `keys` — 生成/导入/改密/指纹；私钥加密 PKCS#8 PEM（PBES2 = PBKDF2-SHA256×600000 + AES-256-CBC）。
- `keystore` — SQLite 密钥库（结构同原版 keys.db）+ `settings` 表（本版新增，见 §2）+ 旧形态迁移。
- `integrity` — HMAC-SHA256 签名 `keys.db.sig`；签名密钥存 Windows 凭据管理器。
- `credman` — CredRead/Write/Delete 封装；**所有凭据操作经全局 Mutex 串行化**（Windows 凭据管理器高并发下瞬时失败会毁掉签名链），签名密钥写入后回读确认，校验路径不创建密钥。
- `migration` — 包家族名（PFN）发布者哈希算法 + 首次运行从旧版 LocalState 复制密钥库（`migrate_legacy_store_from` 可注入目录供测试）。
- `commands` — 17+ 个 IPC 命令：参数校验 + 稳定错误码转换，重活全部 `spawn_blocking`，不写业务逻辑。
- `window` — 窗口几何钳制（工作区约束、首启居中）。
- `state` / `error` — 全局状态（完整性门控）与统一错误（`AppError { code }`，序列化为 `{ code }` 供前端映射文案）。

### 1.2 前端（src/）

- `pages/` — 六大页面与原版 6 视图对齐：主页（步骤 1~5 全局编号，除 2 分享公钥外点击跳转）、消息加密、消息解密（含解锁私钥对话框）、接收方公钥、我的私钥（生成后台化 + 进度卡）、设置。
- `components/KeyCard` — 密钥卡片：别名 + 指纹（muted 色）+ 类型徽章；「更多」下拉与右键菜单（shadcn context-menu）共用同一动作集。
- `components/IntegrityDialog` — 完整性失败弹窗（忽略并重新签名 / 退出应用）。
- `state/keys.tsx` — 密钥列表上下文（跨页共享、刷新、完整性错误上报）。
- `lib/api.ts` — invoke 封装 + `errorCodeOf`；`lib/keyFiles.ts` — 文件选择/导出/打开目录；`lib/status.ts` — toast 辅助。
- `i18n.ts` — 扁平点号键（对齐原版 resw 风格）、`{0}` 占位符、auto 跟随系统（zh-Hans/CN/SG→中文，其余英语）。
- 布局：加解密两页无外层卡片平铺；主题深浅色跟随系统（prefers-color-scheme + `color-scheme`）；toast 用 sonner（theme=system）。

## 2. 数据、窗口与深色模式

- **数据目录**：Tauri `app_data_dir`（Roaming\com.blazesnow.messagesencrypter），与旧版打包应用 LocalState 不同目录；首启动 `migration::migrate_legacy_store` 按 PFN 从旧目录复制 keys.db/签名/keys.json。凭据管理器条目同名通用，无需迁移。
- **设置**：迁入 SQLite `settings` 表（键名沿用原版：ExportFolderPath、SelectedRecipientKeyFingerprint、SelectedPrivateKeyFingerprint、DisplayLanguage），放弃系统 KV 存储；`get_language_preference` 不受完整性门控，保证语言最先初始化。
- **窗口**：tauri-plugin-window-state 记忆几何（隐藏启动 → 恢复 → `fit_main_window` 工作区钳制 → 显示，防闪窗与越界）；单实例唤醒 = unminimize + show + set_focus（tao 的 set_focus 对最小化窗口跳过）。
- **深色模式**：CSS 令牌 + `color-scheme: light/dark`（滚动条/原生控件）跟随系统；启动时按 `window.theme()` 预设 WebView 底色（深 #0a0a0a）消除白闪；sonner toast theme=system 自适应。
- **图标**：src-tauri/icons 由原版 ico 提取 256px 帧经 `pnpm tauri icon` 重生成；msix/assets 沿用原版商店资产全变体。

## 3. 决策记录（按日期）

### 2026-09-26
0. **8192 位生成改走 Windows CNG**：rsa crate 纯软件实现 8192 位生成实测数分钟不可用（用户终止基准），CNG 实测 2~13s——旧版 WinUI（.NET→CNG）正是此速度。新增 cng 模块：BCrypt 生成 + 导出 BCRYPT_RSAFULLPRIVATE_BLOB（布局 e|n|p|q|dp|dq|qinv|d，块身份鉴定确认）→ RsaPrivateKey::from_components + validate + OAEP 自检；Windows 优先 CNG、失败回退 rsa。端到端实测 8192 约 5s。调试中曾误判布局（d 偏移算术错误），靠「素数对穷举 + validate」块鉴定纠正——教训：怀疑数据布局时先做块身份鉴定，勿凭偏移算术下结论。
0. **旧版数据迁移适配**（v2026.9.24.0 已发布至商店 beta 测试组，本修复随 v2026.9.25.0 发布；后续商店版本必须高于 2026.9.24.0）：用旧版真实生成的 keys.db/签名端到端验证，修复两处必然触发篡改警告的问题——(a) 旧版（C#）签名文件带 UTF-8 BOM，verify 需显式剥离；(b) 首启动顺序改为「先校验原始库 → 再加 settings 表等结构调整（仅校验通过时重签）→ 完成」，结构调整改变库字节后必须重签，否则迁移用户必收篡改警告。本机验证测试 `legacy_machine_store_migrates_without_tamper_warning`（#[ignore]，依赖真实 LocalState + 凭据）全流程通过：原始签名校验 Ok → 调整 + 重签 Ok → 幂等 Ok → 5 把密钥保留；新旧版凭据密钥同名共用，旧版随后打开亦不受影响。
1. **仓库链接**：设置页指向本仓库 `github.com/BlazeSnow/MessagesEncrypter.Rust`；references/ 中旧仓库 URL 属历史事实不改。
2. **测试体系**：后端 40 项（协议/密钥/密钥库/完整性/PFN/迁移落盘/凭据回环/命令层）；前端 18 项（vitest + jsdom + @testing-library）。环境垫片：jsdom 缺 PointerEvent 与 scrollIntoView（Radix Select 依赖）；vitest globals 关闭时 RTL 自动 cleanup 不生效需手动注册；Radix Select 在 jsdom 用键盘驱动（鼠标点击无法展开属已知限制）。发布流水线加前端/后端测试门禁。
3. **深色模式**：CSS 令牌早已跟随系统，补 `color-scheme`（滚动条）+ 启动 WebView 底色预设（白闪）+ sonner 复核（默认 system 无需改）。
4. **首页**：五步骤按官网 quickstart 时序编号 1 生成私钥 → 2 分享公钥 → 3 导入公钥 → 4 加密 → 5 解密（接收方 1/2/5，发送方 3/4）；除 2 外点击跳转对应页。
5. **密钥选择记忆**：功能本就存在，修复恢复请求与手选的竞态（用户手选后恢复不得覆盖）；自动选中第一把也写入记忆。
6. **图标语义重排**：接收方公钥 KeyRound、我的私钥 ShieldKeyhole、解密按钮 LockOpen（全局闭锁=加密/开锁=解密）、生成 CirclePlus、导入 Import。
7. **私钥菜单**：补齐 复制公钥/导出公钥（原版快速开始第二步依赖）；`export_key` 增加 `part` 参数；KeyCard 接管右键菜单。
8. **私钥生成后台化**：对话框即关、列表进度卡、完成自动刷新；仅禁用生成按钮防并发。
9. **导入弹窗变形**：shadcn textarea 自带 `field-sizing-content` 无限长高 → 加 `max-h` + 内部滚动；弹窗宽度 `sm:max-w-xl` 覆盖基类 `sm:max-w-sm`。
10. **打开导出目录报错**：`opener:allow-open-path` 权限只启用命令，**scope 为空 = 拒绝一切路径**；capability 内联授予 `allow: [{ path: "**" }]`。
11. **msixbundle 打包**（仅微软商店）：`scripts/make-msix.ps1`（Windows SDK makeappx/makepri）+ `version.ps1`/`tag.ps1`/`run.ps1` + Release workflow（x64+arm64）。PowerShell 陷阱：管道单元素退化为标量，`$list[0]` 取到字符 "x"，须 `@()` 包裹。
12. **pnpm build 递归**：build 脚本改 `tauri build --no-bundle` 后 beforeBuildCommand 相应改 `pnpm build:web`。

### 2026-09-25
1. **版本号**：semver 三段 `YYYY.M.D`（Tauri 要求）；MSI 主版本 ≤255 与日期制冲突 → 桌面曾用 NSIS，最终仅 msixbundle（MSIX 主版本允许 65535，四段在清单层映射）。
2. **互操作验证**：用原版 .NET 协议项目编译 harness 四方向交叉验证全绿（.NET 解 Rust 密文与私钥 PEM；Rust 解 .NET 密文；双向公钥）。
3. **加密栈**：锁定与 rsa 0.9 兼容代际（aes-gcm 0.10 / sha2 0.10 / hmac 0.12 / rand 0.8 / pkcs8 0.10），其余依赖取最新。
4. **语言切换即时生效**（i18next 动态切换），替代原版「重启生效」。
5. **签名链防护**：凭据操作全局串行化 + 签名密钥写入回读 + 校验路径不创建——防瞬时失败轮换签名密钥。

### 2026-09-24
1. 文档体系建立（references/ 九篇 + 本文件）。

## 4. 代码组织

- 命令层 `src-tauri/src/commands/`：mod（共享工具与 DTO）+ integrity / keys / crypto / store 按域拆分；lib.rs 用完整子模块路径引用（tauri 宏在定义模块内解析）。
- 密钥库 `src-tauri/src/keystore/`：mod（schema/CRUD/settings）+ legacy（id 列重建、keys.json 迁移）。
- 密钥测试独立文件 `src-tauri/src/keys_tests.rs`（`#[path]` 子模块）。
- 前端对话框组件 `src/components/keys/`：Generate / ImportPrivateKey / ImportPublicKey / ChangePassword / Rename / Delete（后两个两页共用）+ EmptyList；对话框自含表单状态，条件渲染即重置。

## 5. 环境备忘（坑）

1. **GBK/UTF-8**（AGENTS.md 要求）：仓库内一律 UTF-8；CMD/PowerShell 乱码先 `chcp 65001`；`git config core.quotepath false`。实例：openssl 命令行传中文密码按本地代码页解码导致解密失败，须用 UTF-8 文件（`-passin file:`）；Git Bash 显示 UTF-8 为乱码多为终端显示层问题，数据未必损坏。
2. **icons/ 变更不触发 build.rs 重跑**（资源嵌入被缓存），需 `touch src-tauri/build.rs` 再构建；用 `ExtractAssociatedIcon` 从 exe 抽图验证。
3. **cargo 直接构建**（绕过 tauri CLI）需 `--features custom-protocol` 内嵌前端资产；前端 dist 变化不触发重编，`run.ps1` 以 touch lib.rs 解决。
4. **原版 ICO 的 256px 帧是 PNG 压缩格式**，GDI+ 解不了；用脚本手工解析 ICO 目录提取内嵌 PNG。
