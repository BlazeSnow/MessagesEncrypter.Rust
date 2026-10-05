# Tauri 2 实现记录与决策

> 本仓库（Tauri 2 重构版）的实现细节、关键决策与环境备忘。原版现状参考见本目录其他文档；索引见根目录 [DEVELOPMENT.md](../DEVELOPMENT.md)。编辑历史以 git 提交信息为准。

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

## 3. 关键决策（按主题）

### 3.1 兼容与数据迁移

- **协议 v1 与加密栈代际锁定**：「同一 `ver` 的字段语义保持兼容」是公开承诺；加密栈锁定与 rsa 0.9 兼容的代际（aes-gcm 0.10 / sha2 0.10 / hmac 0.12 / rand 0.8 / pkcs8 0.10），其余依赖取最新。
- **版本号**：semver 三段 `YYYY.M.D`（Tauri 要求）；MSI 主版本 ≤255 与日期制冲突，MSIX 允许 65535（四段在清单层映射）→ 桌面分发最终仅 msixbundle。商店已发布 2026.9.24.0（beta）与 2026.9.25.0，后续商店版本必须更高。
- **旧版迁移时序**：旧版（C#）签名文件带 UTF-8 BOM，verify 需剥离；首启动先在未修改的原始库上校验（篡改不被本版结构调整掩盖），通过后再加 settings 表等变更并重签，校验失败时跳过重签以免掩盖篡改；任何字节变更（含建 settings 表）后都需重签。已用旧版真实数据端到端验证（`legacy_machine_store_migrates_without_tamper_warning`，`#[ignore]`，依赖真实 LocalState + 凭据）。
- **语言切换即时生效**：i18next 动态切换，替代原版「重启生效」（已记录的实现偏差）。

### 3.2 密钥生成

- **8192 位走 Windows CNG**：rsa crate 纯软件实现 8192 位生成实测数分钟不可用；CNG 实测 2~13s，与旧版 WinUI（.NET→CNG）同速。新增 cng 模块：BCrypt 生成 + 导出 BCRYPT_RSAFULLPRIVATE_BLOB（布局 e|n|p|q|dp|dq|qinv|d）→ `RsaPrivateKey::from_components` + validate + OAEP 自检；Windows 优先 CNG、失败回退 rsa。教训：怀疑数据布局时先做「块身份鉴定」（素数对穷举 + validate），勿凭偏移算术下结论——CNG 调试中两次 d 偏移算术均错，靠块鉴定纠正。

### 3.3 打包与构建

- **仅 msixbundle**（微软商店唯一分发）：`scripts/make-msix.ps1`（Windows SDK makeappx/makepri，不假设盘符）+ version.ps1 / tag.ps1 / run.ps1 + Release workflow（x64+arm64，custom-protocol 内嵌前端）；tauri.conf bundle.targets 置空。
- **pnpm build 递归**：build 脚本改 `tauri build --no-bundle` 后，beforeBuildCommand 相应改 `pnpm build:web`。

### 3.4 UI 交互

- **密钥选择记忆**：按指纹写入 settings；恢复请求与手选存在竞态，用户手选后恢复不得覆盖；自动选中第一把也写入记忆。
- **私钥生成后台化**：对话框即关、列表进度卡；生成状态提升为全局 GenerationProvider（切页不丢、防并发生成），仅禁用生成按钮。
- **私钥菜单补齐公钥操作**：`export_key` 增加 `part` 参数，私钥条目可导出对应公钥；KeyCard 右键与「更多」下拉共用动作集。
- **图标语义**：接收方 KeyRound、私钥 ShieldKeyhole、解密 LockOpen、生成 CirclePlus、导入 Import（全局闭锁=加密/开锁=解密）。
- **设置页仓库链接**：指向本仓库 MessagesEncrypter.Rust；references/ 中旧仓库 URL 属历史事实不改。

### 3.5 测试体系（cargo 54 / vitest 50）

- 后端覆盖：协议往返/线格式/篡改/前向兼容、密钥材料、密钥库（含类别隔离、幂等迁移）、完整性签名、PFN、迁移落盘、凭据回环、命令层校验、错误与 DTO 序列化契约；`keyType` 位数估算走真实 2048 位生成全链路。
- 前端覆盖：错误码提取、i18n 解析、首页、密钥卡片、加解密两页（含解锁对话框）、设置页、keyFiles、status、KeysProvider、GenerationProvider。
- 环境垫片：jsdom 缺 PointerEvent 与 scrollIntoView（Radix Select 依赖）；vitest globals 关闭时 RTL 自动 cleanup 不生效需手动注册；Radix Select 在 jsdom 用键盘驱动（鼠标点击无法展开属已知限制）。
- 桩要点：vitest mock 工厂内引用外部变量只建闭包（调用时才求值，避免 TDZ）；失败路径必须走 reject 而非 resolve 错误对象，否则调用方按成功处理；语言切换测试会改全局 i18next 语言，须置于文件末尾。
- 发布流水线含前端/后端测试门禁；交付前四项门禁：`cargo test`、`pnpm test`、`check:locales`、`pnpm build`。

### 3.6 依赖管理

- 后端 `cargo update` 至 tauri 2.12.1 / wry 0.57 / tao 0.37 / windows-rs 0.62；前端 React 19.3 / vite 8.3.2 / vitest 5.0.3。**升级 tauri 插件时 JS 与 Rust crate 版本必须对齐**（dialog / fs / opener / clipboard-manager 等已对齐）。
- vite 8.3 的 INEFFECTIVE_DYNAMIC_IMPORT 为提示级告警（同模块静态+动态导入并存，如 `keyFiles.ts`），不影响产物，暂保留现状。

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
5. **opener 权限 scope 为空 = 拒绝一切路径**：仅启用 `opener:allow-open-path` 命令而不给 allow 列表时，`open_path` 必然 ForbiddenPath；capability 需内联授予 `allow: [{ path: "**" }]`。
6. **shadcn textarea 自带 field-sizing-content**（随内容自动长高且无上限），大段公钥会撑变形弹窗；长内容场景需加 `max-h` + 内部滚动。
7. **PowerShell 管道单元素退化为标量**：`$list[0]` 取到单个字符，须 `@()` 包裹强制数组（make-msix.ps1 踩过）。
