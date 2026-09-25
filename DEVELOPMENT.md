# DEVELOPMENT

MessagesEncrypter（Tauri 2 重构版）的开发指南与开发日志。

- 根目录 `AGENTS.md` 是最高优先级约束，禁止修改；本文件与其冲突时以 AGENTS.md 为准。
- **约定：每完成一项功能，必须更新本文件「§10 开发日志」（新条目置于最上方）。**

## 1. 项目定位

- 本仓库是 MessagesEncrypter 的 **Tauri 2 重构版**（原版为 WinUI 3 应用）。原版的功能、协议、数据格式、交互与发布记录在 [references/](./references/README.md)，是本项目的功能与兼容性基线。
- 产品定位不变：面向 Windows 桌面端的本地公钥消息加密工具——用接收方公钥加密消息、用自己的私钥解密密文包。不是即时通讯、不兼容 PGP、无服务器。
- 硬性要求：
  1. 密文格式 v1 与原版**逐字节兼容**（[references/protocol-v1.md](./references/protocol-v1.md)）。
  2. 原版用户数据可迁移：旧密钥库、导出的 `.pub` / `.pem`、记住的密码（[references/storage.md](./references/storage.md)）。

## 2. 技术栈

| 层 | 选型 | 备注 |
| --- | --- | --- |
| 应用框架 | Tauri 2 | 仅支持 Windows |
| 后端 | Rust | 加密、密钥库、业务逻辑 |
| 前端 | React + TypeScript + Vite；组件库 shadcn/ui（Tailwind CSS） | 当前选型；调整时回填本表 |
| 数据库 | SQLite（rusqlite，bundled） | 密钥库 |
| 多语言 | 后端 fluent-i18n；前端 i18next | 简体中文（默认）+ 英语（回退） |
| 包管理 | 前端 pnpm | |

## 3. 架构规划

- `src/`（前端）：页面与原版 6 视图对齐（[references/ui-pages.md](./references/ui-pages.md)）；所有用户可见文本走 i18next。
- `src-tauri/`（后端）模块划分建议：
  - `protocol_v1` — 密文格式 v1。**铁律：不依赖 Tauri、SQLite、窗口系统**（序列化库除外），保持可独立测试，为未来 v2 预留空间。
  - `keys` — 密钥生成 / 导入 / 导出 / 指纹 / 改密（加密原语封装）。
  - `keystore` — SQLite 密钥库、完整性校验、旧数据迁移。
  - `commands` — Tauri IPC 命令层：参数校验 + 错误码转换，不写业务逻辑。
- 错误模型：后端统一返回**稳定错误码**（沿用原版 `ErrorXxx` 命名，见 references 各文档）；前端按错误码渲染本地化文案；后端不返回堆栈等内部信息。
- 单实例：tauri-plugin-single-instance；深浅色主题跟随系统；长耗时操作全部异步执行。

## 4. 开发环境与常用命令

前置要求：

- Windows 10 17763+；Rust stable（msvc toolchain）；Node.js LTS + pnpm；WebView2 Runtime。
- MSIX/Store 打包另需 Windows SDK（落地时确认）。

命令约定（脚手架搭建后如与实际不符，回填本节）：

```bash
pnpm install          # 安装前端依赖
pnpm tauri dev        # 开发运行
pnpm tauri build      # 构建发布产物
cargo test            # Rust 单元测试（src-tauri）
cargo fmt             # 格式化
cargo clippy          # 静态检查
```

- 改动完成后必须自行构建、测试通过再交付。
- 协议 / 密钥 / 存储相关改动必须跑兼容性测试（[references/testing-checklist.md](./references/testing-checklist.md) §2）。

## 5. 终端编码：GBK 与 UTF-8

AGENTS.md 要求开发过程中处理终端 GBK 与 UTF-8 的关系。约定：

1. 仓库内源码、资源、文档、配置一律 UTF-8。
2. Windows 终端默认代码页 936（GBK）：CMD/PowerShell 遇乱码先 `chcp 65001`（PowerShell 另注意 `$OutputEncoding` / `[Console]::OutputEncoding`）；Git Bash 默认 UTF-8。
3. git 输出中文路径乱码：`git config core.quotepath false`。
4. 避免把中文作为命令行参数直接传给外部进程（跨进程编码不确定）；需要时用 UTF-8 临时文件或环境变量，并显式按 UTF-8 读回。
5. 终端里显示乱码 ≠ 数据损坏：先排查显示层编码，再判断数据层。
6. 涉及剪贴板、文件名、外部进程（如资源管理器定位文件）的功能，测试时必须覆盖中文内容。

## 6. 多语言约定

1. **用户可见文本零硬编码**。范围：页面标题、导航、按钮、菜单、标签、占位符、工具提示、对话框标题/正文/按钮、错误/状态/进度/空状态文案、设置项名称与说明、枚举显示名、文件筛选器描述、剪贴板提示、通知文本。前端走 i18next；后端只返回错误码/枚举。
2. 键命名沿用原版规律（`Status*`、`Error*`、`XxxDialogTitle`、`<元素>.<属性>` 等），详见 [references/i18n.md](./references/i18n.md)。
3. 新增文案必须同步补全 zh-Hans 与 en 两份资源；格式占位符跨语言一致；纳入 CI 校验。
4. 错误码即契约：命名稳定后不得改名。
5. 语言设置三选：`自动 / 简体中文 / English`；`auto` 跟随系统（`zh-Hans*` / `zh-CN*` / `zh-SG*` 判为中文，其余英语）。

## 7. 不变量与红线

### 7.1 加密与协议

1. RSA-OAEP-SHA256 仅用于封装随机会话密钥；**禁止 RSA 直接加密长消息**。
2. 每次加密生成新会话密钥与新 nonce（CSPRNG）；禁止复用。
3. AES-256-GCM：32 字节密钥 / 12 字节 nonce / 16 字节 tag / UTF-8 明文 / 无 AAD。
4. 解密失败不得输出部分明文；认证失败统一报「解密失败」。
5. 私钥必须密码加密存储（加密 PKCS#8 PEM，PBES2 = PBKDF2-HMAC-SHA256 ×600000 + AES-256-CBC），禁止明文落盘。
6. 指纹 = SHA256(公钥 SPKI DER) 前 16 字节、32 位大写十六进制；算法不可变。
7. `ver ≠ 1` 拒绝；未知字段必须忽略。
8. 异常只暴露稳定错误码，不泄漏堆栈与内部细节。

### 7.2 产品

1. 不暗示即时通讯/实时聊天；消息不经任何第三方。
2. 不兼容、不命名 PGP/GPG。
3. 无 PKI/CA；公钥线下交换、指纹核对。
4. 文件加密与协议 v2 未定稿：不实现、不承诺、不预告。

### 7.3 架构

1. `protocol_v1` 模块不依赖宿主设施（Tauri / SQLite / 窗口系统）。
2. 小型设置用 KV 存储，不引入 settings.json（沿用原版约定；迁移注意见 [references/storage.md](./references/storage.md) §7）。

## 8. 里程碑

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| M0 | 脚手架：Tauri 2 + React + shadcn/ui | ✅ 完成 |
| M1 | `protocol_v1` 模块 + 与原版双向互操作验证 | ✅ 完成 |
| M2 | 密钥生成/导入/导出/指纹 + 密钥库 + 完整性 | ✅ 完成 |
| M3 | 加密/解密页面（剪贴板、复制粘贴） | ✅ 完成 |
| M4 | 密钥管理体验：重命名/删除/改密/记住密码/重复检测 | ✅ 完成 |
| M5 | 双语 + 语言切换（即时生效） | ✅ 完成 |
| M6 | 设置页、单实例、MSIX/Store 打包 | ✅ 完成（msixbundle 打包已落地） |
| M7 | 旧数据迁移（密钥库/设置/凭据）与兼容验收 | ✅ 完成（真机旧版数据待实测） |

## 9. 文档维护

- [references/](./references/README.md) 记录**原版现状**：兼容性事实不删改；重构版偏离时在对应文档追加「Tauri 2 迁移注意」小节，并在开发日志记录决策。
- 协议、密钥、存储文档的修改视为兼容性变更，需说明理由与影响。
- 文档中禁止出现原项目的本机绝对路径；需要指代时用「原 WinUI 3 版本」或公开 URL。

## 10. 开发日志

### 2026-09-26（二）

- 私钥卡片菜单补齐 复制公钥 / 导出公钥（原版快速开始第二步「在我的私钥页复制或导出公钥」依赖此能力，此前遗漏）；菜单顺序：复制公钥、导出公钥、复制私钥、导出私钥、修改密码、重命名、删除。后端 export_key 增加 `part` 参数支持导出私钥条目的公钥部分（.pub）。
- 密钥卡片接管右键：shadcn context-menu 包裹整卡，右键弹出与「更多」下拉相同的动作集（两页共用，收进 KeyCard 组件）。

### 2026-09-26

- 私钥生成改为后台任务：点确定后对话框立即关闭，密钥列表顶部显示旋转进度卡（含位数与耗时提示），完成后自动刷新列表并提示；生成期间「生成密钥」按钮禁用，其余功能（重命名/删除/导出/加解密）可正常使用，不再前台等待（8192 位可达数分钟）。新增文案键 KeyGeneratingTitle / KeyGeneratingHint。
- 修复 `pnpm build` 递归：build 脚本改为 `tauri build --no-bundle` 后，tauri.conf 的 beforeBuildCommand 相应改为 `pnpm build:web`。

### 2026-09-25（夜）

- 图标修正：src-tauri/icons 此前仍是脚手架默认 Tauri 图标。已从原版应用 `messagesencrypter.ico` 提取 256px 帧（ICO 内嵌 PNG 手工解析，GDI+ 不支持 PNG 压缩帧）作为源，`pnpm tauri icon` 重新生成全套图标（含 icon.ico 多尺寸与 Square/Store 变体；android/ios 产物已删除）。
- 注意：修改 icons/ 不会触发 build.rs 重跑（资源嵌入被缓存），需 `touch src-tauri/build.rs` 后重新构建；已用 `ExtractAssociatedIcon` 从新 exe 抽图验证嵌入正确。

### 2026-09-25（晚）

- **打包发布落地（仅 msixbundle，微软商店）**，方案与既有 Tauri 项目实践一致：
  - `msix/`：AppxManifest 模板（Identity = BlazeSnow.MessagesEncrypter + 原 Publisher，资源 zh-hans/en-us，runFullTrust）+ 商店图标全套变体（取自原版应用资产，含 scale/targetsize/altform-unplated，裸名默认文件由 scale-100 复制）。
  - `scripts/make-msix.ps1`：定位 Windows SDK 的 makeappx/makepri（不假设盘符）→ 逐架构 stage（exe + manifest + pri + assets）→ pack 成 .msix → bundle 合并 .msixbundle（显式 /bv 保证商店版本号一致）。
  - `version.ps1`：package.json 为版本唯一来源，同步 Cargo.toml / tauri.conf.json / Cargo.lock；`tag.ps1` 三段补 `.0` 后打 `v<版本>` 标签；`run.ps1` 支持 dev/release/-Msix。
  - `.github/workflows/release.yml`：tag `v*` 触发，x64 + arm64 双架构构建（`cargo build --release --features custom-protocol`）→ 合并 msixbundle → GitHub Release。
  - tauri.conf `bundle.targets = []`（不走 tauri bundler）；Cargo `[features] custom-protocol = ["tauri/custom-protocol"]` 供直接 cargo 构建内嵌前端。
  - 本地验证：release 构建 + make-msix 产出 `MessagesEncrypter_2026.9.24.0_x64.msixbundle`（manifest schema 校验通过）。
- **PowerShell 陷阱**：管道输出单元素会退化为标量，`$list = "x64" -split ',' | ...` 后 `$list[0]` 取到的是字符 `"x"`——单架构打包时必须用 `@()` 包裹（参考项目的脚本在双架构下不会暴露此问题，已修复并回写）。

### 2026-09-25

- 迁移完成（M0–M6）。
  - 后端：`protocol_v1`（错误码/校验顺序对齐原版）、`keys`（指纹、600k PBES2）、`keystore`（keys.db + 三种历史形态迁移 + settings 表）、`integrity`（HMAC 签名 + 凭据管理器）、`credman`、`migration`（旧版 LocalState 迁移）、`commands`（17 个 IPC 命令）。cargo 测试 33 项通过。
  - 前端：六大页面 + 完整性弹窗 + i18next 双语（150 键）+ 命令封装。`npm run check:locales` 校验键与占位符一致。
- **互操作验证**（用原版 .NET 协议项目做交叉验证，四方向全绿）：
  1. .NET 解密 Rust 加密的密文包；2. .NET 解析 Rust 生成的加密私钥 PEM（600k 迭代 PBES2）；
  3. Rust 解密 .NET 加密的密文包；4. .NET 解密 Rust 用 .NET 公钥加密的密文包。
  互操作测试为 `#[ignore]` 测试 + .NET harness，工件目录经 `INTEROP_DIR` 环境变量传入，仓库内不出现本机路径。
- **决策记录**：
  1. 版本号改 semver 三段 `YYYY.M.D`（Tauri 要求 semver）；MSIX 四段制在打包清单层映射。MSI 打包器限制主版本 ≤255 与日期制冲突，桌面分发改用 NSIS 目标；MSIX/Store 打包另行落地（MSIX 主版本允许 65535）。
  2. 数据目录用 Tauri `app_data_dir`（`com.blazesnow.messagesencrypter`），与旧版打包应用 LocalState 不同目录；首启动由 `migration::migrate_legacy_store` 按 PFN（发布者哈希算法已用微软已知值验证）从旧目录复制 keys.db/签名/keys.json。凭据管理器条目同名通用，无需迁移。
  3. 设置迁入 SQLite `settings` 表（键名沿用原版），放弃系统 KV 存储；`get_language_preference` 不受完整性门控，保证语言最先初始化。
  4. 语言切换改为**即时生效**（i18next 动态切换），替代原版「重启生效」；资源键、占位符风格与原版对齐。
  5. 加密栈锁定与 `rsa 0.9` 兼容的代际（aes-gcm 0.10 / sha2 0.10 / hmac 0.12 / rand 0.8 / pkcs8 0.10），其余依赖取最新。
  6. 凭据操作全局串行化 + 签名密钥写入回读确认 + 校验路径不创建密钥——防止凭据存储瞬时失败导致签名密钥被静默轮换（原版注释中预警的风险）。
  7. shadcn/ui 4.x（radix 底座 + Nova 预设，Tailwind v4）；深浅色跟随系统（prefers-color-scheme）。
- 环境备忘：Windows 终端 GBK 陷阱复现——openssl 命令行传中文密码会按本地代码页解码导致解密失败，需用 UTF-8 文件（`-passin file:`）传递。

### 2026-09-24

- 文档：建立 `DEVELOPMENT.md` 与 `references/`（9 篇：索引、协议 v1、密钥管理、存储、页面与交互、产品规格、多语言、测试清单、发布）。内容取自原 WinUI 3 版本源码与官方文档站，不含原项目本地路径。
