# 页面与交互（功能参照）

> 原版 WinUI 3 UI 的功能与交互记录。重构版按 shadcn/ui 风格重建，功能与文案语义对齐。

## 1. 框架层

- 侧边导航 6 项：主页 / 消息加密 / 消息解密 / 接收方公钥 / 我的私钥 / 设置。
- 单实例：第二实例启动时唤醒已有窗口。
- 状态提示：底部 InfoBar，成功/警告/错误三级别，8 秒自动消失，可手动关闭；文案全部来自资源键。
- 长耗时操作（生成密钥、加解密等）在后台执行，页面中央显示进度指示，不冻结界面。
- 对话框跟随系统深浅色主题；危险操作按钮用红色危险样式（如「忽略并重新签名」）。
- 密钥列表跨页共享：加密/解密页下拉与对应管理页同步；已选密钥按指纹记忆（KV 设置），切页与重启后恢复；密钥被删后安全回退。
- 列表排序：别名 → 指纹（均忽略大小写）。

## 2. 主页

- 静态说明页，两列卡片：「接收方」流程（生成私钥 → 分享公钥 → 解密）与「发送方」流程（导入公钥 → 加密），配图标示意，链接到具体页面。

## 3. 消息加密

- 元素：接收方公钥下拉（显示 `别名 (指纹)`）、明文多行输入、按钮「加密 / 复制密文 / 清空」、密文输出（等宽字体）。
- 流程：未选公钥 → `ErrorRecipientKeyNotSelected`（警告）；明文空白 → `ErrorPlainTextRequired`；后台加密；成功提示 `StatusMessageEncrypted`；失败清空输出框并显示对应错误码文案。
- 「复制密文」复制输出到剪贴板；「清空」同时清空明文与密文。

## 4. 消息解密

- 元素：私钥下拉、密文输入（等宽）、按钮「解密 / 粘贴 / 清空」、明文输出。
- 「粘贴」：读剪贴板文本填入；剪贴板无文本 → `ErrorClipboardTextMissing`；剪贴板不可用 → `ErrorClipboardUnavailable`；成功 → `StatusEncryptedMessagePasted`。
- 流程：未选私钥 → `ErrorPrivateKeyNotSelected`；已记住密码则直接使用，否则弹「解锁私钥」密码对话框（含「记住密码」复选框）；后台解密；成功 `StatusMessageDecrypted`（勾选记住则保存密码）；失败清空输出、只显错误，**不输出部分明文**。

## 5. 接收方公钥

- 顶部按钮：导入公钥 / 打开导出目录。
- 列表项：别名 + 指纹 + 密钥类型（如 `RSA4096`）；每项「更多」菜单：复制公钥 / 导出公钥 / 重命名 / 删除。
- 导入对话框：别名输入 + 从文件导入（`.pub/.pem/.txt`，别名默认取文件名）+ 公钥文本粘贴框。指纹重复 → 「重复密钥」对话框；成功后自动选中并同步到加密页。
- 重命名：空白别名 → `ErrorKeyAliasRequired`；保存失败回滚 UI 并恢复旧选中。
- 删除：确认对话框（正文含 `"{0}"` 别名占位）；删除后选中第一项；失败回滚。

## 6. 我的私钥

- 顶部按钮：生成密钥 / 导入私钥 / 打开导出目录。
- 列表项菜单比公钥页多：复制私钥 / 导出私钥 / 修改密码。
- 生成对话框：别名、RSA 位数下拉（2048/3072/4096/8192，默认 4096）、密码 + 确认密码（不一致 → `ErrorPasswordConfirmMismatch`）、「记住密码」。成功 `StatusKeyGenerated` 并自动选中。
- 导入对话框：别名、密码（加密 PEM 用于解密，明文 PEM 用于重加密入库）、「记住密码」、从文件导入（`.pem/.key/.txt`）、私钥文本框。
- 修改密码对话框：旧密码、新密码、确认新密码、「记住密码」；成功 `StatusPrivateKeyPasswordChanged`。
- 删除：确认后执行；**保存成功才删除记住的密码条目**；失败回滚。

## 7. 设置

| 卡片 | 功能 | 备注 |
| --- | --- | --- |
| 显示语言 | `自动 / 简体中文 / English` | 保存后提示「重启生效」，确认则重启应用；重启失败有错误提示 |
| 导出目录 | 显示路径 + 「选择」+「打开」 | 默认下载目录；保存成功 `StatusExportFolderSaved` |
| 项目仓库 | 打开 GitHub 仓库 | https://github.com/BlazeSnow/MessagesEncrypter |
| 项目网站 | 打开官网 | https://messages.blazesnow.com/ |
| 软件版本 | 显示版本号 | 从打包清单读取，禁止硬编码 |

## 8. 文案资源键（部分，供对齐）

- 状态类 `Status*`：`StatusMessageEncrypted`、`StatusMessageDecrypted`、`StatusKeyGenerated`、`StatusEncryptedMessagePasted`、`StatusPrivateKeyPasswordChanged`、`StatusExportFolderSaved` 等（原版共 14 个）。
- 错误类 `Error*`：协议与密钥错误见 [protocol-v1.md](./protocol-v1.md) §5 与 [key-management.md](./key-management.md)；UI 类：`ErrorRecipientKeyNotSelected`、`ErrorPrivateKeyNotSelected`、`ErrorClipboardTextMissing`、`ErrorClipboardUnavailable`、`ErrorKeyAliasRequired`、`ErrorPasswordConfirmMismatch`、`ErrorKeyStoreIntegrityMissing`、`ErrorKeyStoreIntegrityInvalid`（原版共约 27 个）。
- 对话框类：`Unlock*`、`Import*`、`Generate*`、`Change*`、`Rename*`、`Delete*`、`DuplicateKey*`、`KeyStoreIntegrity*`、`DisplayLanguageRestart*`，通用 `DialogOkButtonText` / `DialogCancelButtonText`。
- 原版 zh-Hans / en-US 资源各 193 键；实现具体页面时建议对照原版资源文件逐键对齐文案语义。

## 9. Tauri 2 迁移注意

- InfoBar → shadcn/ui Toast（如 sonner）或等价；对话框 → Dialog/AlertDialog；下拉 → Select；设置卡片 → Card 组合。
- 剪贴板、文件对话框、资源管理器定位用 Tauri 插件（clipboard-manager、dialog、opener 等）。
- 「记住密码」存储机制见 [storage.md](./storage.md) §7；单实例用 tauri-plugin-single-instance；主题跟随系统。
- 长耗时操作全部走异步命令，前端显示进行中状态。
