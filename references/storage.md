# 存储与持久化（兼容规范）

> 原版本地存储的完整记录。重构版如需读取旧版数据（强烈建议），本文件是依据。

## 1. 存储总览

| 数据 | 载体 | 位置（原版） |
| --- | --- | --- |
| 密钥库 | SQLite `keys.db` | 应用本地数据目录（打包应用 LocalState） |
| 完整性签名 | `keys.db.sig`（单行 Base64 文本） | 同目录 |
| 旧版密钥库 | `keys.json`（迁移后改名 `keys.json.migrated`） | 同目录 |
| 应用设置 | 系统 KV 存储（LocalSettings） | 系统托管 |
| 记住的私钥密码、HMAC 签名密钥 | Windows 凭据管理器 | 系统级 |
| settings.json | **不存在**（约定不设） | — |

## 2. keys.db

```sql
CREATE TABLE IF NOT EXISTS keys (
    category TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    alias TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    public_key_pem TEXT NULL,
    encrypted_private_key_pem TEXT NULL,
    PRIMARY KEY (category, fingerprint)
);
```

- `category` 取值：`"recipient"`（接收方公钥）/ `"private"`（我的私钥）。
- 主键 `(category, fingerprint)`，无自增 ID；指纹即密钥身份。
- 读取排序：`ORDER BY category, alias COLLATE NOCASE, fingerprint COLLATE NOCASE`。
- 保存流程：事务内 `DELETE FROM keys` 全表 → 按列表顺序重插（`sort_order` = 0..n，`INSERT OR IGNORE` 容忍历史重复指纹）→ 提交 → **重新生成 `keys.db.sig`**。
- 重复指纹策略：UI 层弹「重复密钥」对话框拒绝；存储层 `INSERT OR IGNORE` 兜底不报错。
- 连接串仅含数据源路径，无其他参数。

## 3. 版本迁移（历史行为，重构版需兼容读取）

1. **`keys.json` 迁移**：旧版 JSON 根对象为 `{ recipientKeys: [...], privateKeys: [...] }`（camelCase、缩进格式；条目字段 `alias` / `fingerprint` / `publicKeyPem` / `encryptedPrivateKeyPem`）。仅当库中无密钥时执行：解析 → 写库 → 把 `keys.json` 改名 `keys.json.migrated`；库非空则跳过且不动原文件。
2. **旧表结构迁移**：若 `pragma_table_info('keys')` 含 `id` 列（更旧的 AUTOINCREMENT 表），则建 `keys_new`（新结构）→ `INSERT OR IGNORE ... SELECT ... FROM keys ORDER BY category, sort_order` → `DROP TABLE keys` → `RENAME TO keys`。
3. 任何建表/迁移/信任加载完成后必须**重新签名**，否则下次启动误报篡改。

## 4. 完整性签名 `keys.db.sig`

- 算法：`HMAC-SHA256(签名密钥, keys.db 全部字节)`，结果以 Base64 单行 UTF-8 写入。
- 签名密钥：32 字节随机，存 **Windows 凭据管理器**：
  - TargetName 固定 `MessagesEncrypter.KeyStoreIntegrityKey`；类型 Generic；持久化 LocalMachine。
  - 凭据 Blob = 密钥的 Base64 文本（Unicode）；UserName = 当前环境用户名。
- 读取容错：仅「条目不存在」（Win32 错误 1168）视为未初始化；其他错误重试 3 次（间隔 50ms）后报错——防止瞬时错误导致轮换签名密钥、毁掉签名链。
- 校验结果（启动时执行）：
  - 库不存在 → 通过（首次启动）。
  - 库存在、签名缺失 → `ErrorKeyStoreIntegrityMissing`。
  - 签名非 Base64 或常数时间比较失败 → `ErrorKeyStoreIntegrityInvalid`。
- UI：弹「密钥存档可能不安全」对话框，按钮「忽略并重新签名」（危险样式；信任当前库并重签，必要时先删除旧签名密钥）与「退出应用」。
- 应用自身每次改库后必须重签。

## 5. Windows 凭据管理器（其余条目）

- 私钥密码：TargetName = `MessagesEncrypter.PrivateKeyPassword.<指纹>`，按指纹区分；提供保存/读取/删除。
- 解密时已记住则免输密码；未记住则每次弹「解锁私钥」密码对话框（含「记住密码」复选框）。
- 删除私钥**保存成功后**才删除对应密码条目；修改密码成功后按「记住密码」勾选更新或删除条目。

## 6. KV 设置（原版 LocalSettings）

| 键 | 值 | 默认 |
| --- | --- | --- |
| `ExportFolderPath` | 导出目录 | 用户下载目录 |
| `SelectedRecipientKeyFingerprint` | 加密页已选公钥指纹 | 空 |
| `SelectedPrivateKeyFingerprint` | 解密页已选私钥指纹 | 空 |
| `DisplayLanguage` | `auto` / `zh-Hans` / `en-US` | `auto` |

- 指纹对应的密钥已删除时安全回退（清空或选第一项）。

## 7. Tauri 2 迁移注意

- **数据目录**：若沿用同一 MSIX Identity（Name + Publisher，见 [release.md](./release.md) §1），包家族名不变，LocalState 路径不变，旧 `keys.db` 可原地读取；若改变身份，则需实现「首启动从旧目录导入」。→ 决策确定后记录到 `DEVELOPMENT.md` 开发日志。
- SQLite 用 `rusqlite`（bundled）；保持表结构与迁移逻辑等价（含旧 `id` 列表与 `keys.json` 迁移），以便无缝读取。
- 完整性方案需决策：继续 HMAC 签名（Rust 侧经 `windows` crate 等价访问凭据管理器）或改用其他保护（如 DPAPI）。若更换方案，必须能识别旧库并平滑过渡，不能把旧库一律判为「篡改」。
- 记住的密码：原版在凭据管理器、按指纹索引；重构版若改用其他机制，指纹算法一致是索引可用的前提。
- KV 设置四键：首启动读取旧值一次并写入新存储。
