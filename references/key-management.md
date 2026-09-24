# 密钥管理（兼容规范）

> 原版密钥生成、指纹、导入导出与密码保护的完整记录。重构版必须与原版数据互通。

## 1. 常量

```text
MinRsaKeySizeBits          = 2048
DefaultRsaKeySizeBits      = 4096
SupportedRsaKeySizesBits   = [2048, 3072, 4096, 8192]
PrivateKeyPbkdf2Iterations = 600_000
FingerprintBytesToDisplay  = 16
```

## 2. 密钥生成

- RSA 密钥对，位数可选 2048/3072/4096/8192（UI 默认 4096，类型显示为 `RSA4096` 等）。
- 公钥：SPKI DER 的 PEM，头 `-----BEGIN PUBLIC KEY-----`。
- 私钥：**加密 PKCS#8** PEM，头 `-----BEGIN ENCRYPTED PRIVATE KEY-----`，PBE 参数：
  - PBES2（OID `1.2.840.113549.1.5.13`）
  - KDF：PBKDF2-HMAC-SHA256，迭代 **600 000**（OID `1.2.840.113549.1.5.12`）
  - 加密：AES-256-CBC
- 密码非空；生成时需二次确认一致。

## 3. 指纹

- 算法：`SHA256(公钥 SPKI DER)` 取**前 16 字节** → **32 个大写十六进制字符**，无分隔符。
- 性质：同一密钥恒定；由公钥唯一决定（导入私钥时从私钥确定性派生公钥再计算）；不同密钥不同。
- 用途：密钥唯一身份、列表展示与排序、重复导入检测、已选密钥记忆、记住密码的索引、线下人工核对（防公钥调包）。
- **算法不可变更**：否则旧数据中已保存的选中指纹与记住的密码条目全部失配。

## 4. 导入

### 4.1 私钥

1. 先按加密 PKCS#8 PEM 解析（需密码）。
2. 失败则按明文 PEM 解析（PKCS#8 / PKCS#1 均可），成功后**按 §2 的 PBE 参数重新加密**再入库。
3. 从私钥确定性派生公钥（SPKI）并计算指纹。
4. 错误码：密码空白 `ErrorPasswordRequired`；PEM 无效或密码错 `ErrorPrivateKeyInvalidOrPasswordWrong`；< 2048 位 `ErrorPrivateKeyTooSmall`；PEM 缺失 `ErrorPrivateKeyRequired`。

### 4.2 公钥

- SPKI PEM：< 2048 位 → `ErrorPublicKeyTooSmall`；格式错 → `ErrorPublicKeyInvalid`；空白 → `ErrorPublicKeyRequired`。
- **含私钥材料的 PEM 拒绝作为公钥导入**（`ErrorPublicKeyInvalid`）。
- 指纹重复 → UI 弹「重复密钥」对话框拒绝（存储层另有 `INSERT OR IGNORE` 兜底，见 [storage.md](./storage.md)）。

## 5. 修改私钥密码

- 流程：旧密码解密私钥 → 新密码按相同 PBE 参数重加密；**指纹不变**。
- 校验：旧密码必填且须正确；新密码非空；新密码与确认密码一致。
- 成功后：勾选「记住密码」则更新记住的密码条目，否则删除旧条目。

## 6. 导出 / 导入文件格式

| 类型 | 扩展名 | 内容 | 编码 |
| --- | --- | --- | --- |
| 公钥 | `.pub` | SPKI PEM | UTF-8 文本 |
| 私钥 | `.pem` | 加密 PKCS#8 PEM（仍需密码才能使用） | UTF-8 文本 |

- 文件名 = 净化后的别名：Trim 后非法文件名字符全部替换为 `_`；全空白回退 `key`；同名覆盖。
- 公钥日常交换也可用剪贴板文本。
- 导入对话框支持从文件读入：私钥 `.pem/.key/.txt`，公钥 `.pub/.pem/.txt`；别名默认取文件名去扩展名。
- 导出目录为用户设置项；目录不存在自动创建；导出成功后在资源管理器中定位该文件。

## 7. 别名

- 每把密钥有用户可编辑别名。默认别名为资源键：`DefaultPrivateKeyAlias`（`我的密钥 {0}`）、`DefaultRecipientKeyAlias`（`接收方 {0}`），`{0}` 为序号。
- 重命名空白 → `ErrorKeyAliasRequired`。
- 列表排序：别名（按区域设置、忽略大小写）→ 指纹（忽略大小写）。

## 8. Tauri 2 迁移注意

- Rust 生态可用 `rsa` + `aes-gcm` + `pkcs8`/`pbes2` 等 crate 实现上述参数；**必须做与原版的双向互操作测试**：解析原版生成的加密私钥 PEM、原版能解析重构版生成的 PEM、指纹逐字符一致（见 [testing-checklist.md](./testing-checklist.md) §2）。
- 600 000 次 PBKDF2 在 Rust 侧的耗时需实测；生成/导入/解锁路径都必须在后台执行，避免冻结界面。
