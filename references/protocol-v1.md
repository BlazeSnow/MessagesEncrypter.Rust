# 密文包格式 v1（兼容规范）

> 本文记录原版 `ver = 1` 密文格式的完整规范，包含官方文档站的公开定义与原版实现的实现级细节。重构版**必须逐字节兼容**。公开承诺：同一 `ver` 的字段语义保持兼容；`ver = 1` 仅定义 RSA 消息加密格式。

## 1. 外层编码

- 密文包面向复制粘贴传输，外层为 Base64（标准字母表，含 padding）。
- 处理流程：
  1. 对用户输入 `Trim()`；
  2. Base64 解码得到字节；
  3. 字节按 UTF-8 解析为 JSON；
  4. 按本文解析 JSON 字段。

## 2. JSON 结构

```json
{
  "ver": 1,
  "ek": "<base64>",
  "nonce": "<base64>",
  "tag": "<base64>",
  "ct": "<base64>"
}
```

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `ver` | number | 是 | 消息格式版本，当前固定 `1` |
| `ek` | string | 是 | 被接收方 RSA 公钥（OAEP-SHA256）封装的 AES-256-GCM 会话密钥（32 字节），Base64 编码 |
| `nonce` | string | 是 | AES-GCM nonce，原始长度 12 字节，Base64 编码 |
| `tag` | string | 是 | AES-GCM authentication tag，原始长度 16 字节，Base64 编码 |
| `ct` | string | 是 | AES-GCM 密文（UTF-8 明文的加密结果），Base64 编码 |

- 字段名全小写短名（减少传输体积）；**没有 `alg` 字段**；可选字段缺失时不写出 `null`；**未知字段必须忽略**（向前兼容关键条款）。

## 3. 算法与参数

| 项 | 值 |
| --- | --- |
| 会话密钥 | AES-256-GCM，随机 32 字节，每条消息独立生成 |
| Nonce | 随机 12 字节，每条消息独立生成 |
| Tag | 16 字节 |
| 明文编码 | UTF-8 |
| AAD | 无（v1 不启用） |
| 会话密钥封装 | 接收方 RSA 公钥，OAEP-SHA256，最小 2048 位 |
| 随机源 | CSPRNG |

原版实现常量：

```text
MessageVersion        = 1
AesKeySizeBytes       = 32
AesGcmNonceSizeBytes  = 12
AesGcmTagSizeBytes    = 16
MinimumRsaKeySizeBits = 2048
```

## 4. 解密校验要求（公开规范 7 条）

1. `ver` 必须等于 `1`。
2. 密文包必须提供 `ek`、`nonce`、`tag`、`ct`。
3. 四个字段必须是合法 Base64。
4. `nonce` 解码后必须为 12 字节。
5. `tag` 解码后必须为 16 字节。
6. 未知字段应忽略，不应导致解密失败。
7. AES-GCM 认证失败时，必须统一视为解密失败（不区分具体错误类型）。

## 5. 实现级校验顺序与错误码（原版实现）

错误码为原版资源键（`ErrorXxx`）。重构版沿用同一命名作为后端错误码，保证错误语义与用户体验一致。按序校验，命中即返回：

| # | 条件 | 错误码 |
| --- | --- | --- |
| 1 | 输入空白 | `ErrorCipherTextRequired` |
| 2 | 非法 Base64 / 非 JSON | `ErrorDecryptFailed` |
| 3 | `ver != 1` | `ErrorUnsupportedMessageFormat` |
| 4 | `ek` / `nonce` / `tag` / `ct` 任一缺失或空白 | `ErrorUnsupportedMessageFormat` |
| 5 | 字段 Base64 解码失败 | `ErrorDecryptFailed` |
| 6 | `nonce` ≠ 12 字节或 `tag` ≠ 16 字节 | `ErrorUnsupportedMessageFormat` |
| 7 | 私钥缺失/空白 | `ErrorPrivateKeyRequired` |
| 8 | 密码空白 | `ErrorPasswordRequired` |
| 9 | 私钥 PEM 解析失败或密码错误 | `ErrorPrivateKeyInvalidOrPasswordWrong` |
| 10 | 私钥 < 2048 位 | `ErrorPrivateKeyTooSmall` |
| 11 | RSA 解封装后的会话密钥 ≠ 32 字节 | `ErrorUnsupportedMessageFormat` |
| 12 | AES-GCM 认证失败（篡改 / 错私钥） | `ErrorDecryptFailed` |

加密侧：

| 条件 | 错误码 |
| --- | --- |
| 明文空白 | `ErrorPlainTextRequired` |
| 公钥缺失/空白 | `ErrorPublicKeyRequired` |
| 公钥格式错误 | `ErrorPublicKeyInvalid` |
| 公钥 < 2048 位 | `ErrorPublicKeyTooSmall` |

## 6. 加密流程（原版实现）

1. 明文空白则报错（`ErrorPlainTextRequired`）；明文按 UTF-8 编码。
2. CSPRNG 生成 32 字节会话密钥 + 12 字节 nonce。
3. RSA 公钥以 OAEP-SHA256 加密会话密钥 → `ek`。
4. AES-256-GCM 以 (会话密钥, nonce, 无 AAD) 加密明文 → `ct` + 16 字节 `tag`。
5. 序列化 JSON（仅 5 个字段，未知/可选字段不写）→ UTF-8 字节 → 标准 Base64。
6. 操作结束后清零内存中的会话密钥与明文缓冲。

## 7. 安全性质与已知限制（对外如实，不得否认或夸大）

- 每次加密使用新会话密钥与新 nonce，同一明文两次加密的输出完全不同。
- 无前向安全：使用静态 RSA 密钥，私钥泄漏可解密全部历史密文（v2 方向见 [product-spec.md](./product-spec.md) §5）。
- 无密钥过期/吊销机制；密钥身份即指纹。
- 字段被篡改时，通常在字段校验、RSA-OAEP 解封装或 AES-GCM 认证阶段失败。

## 8. 示例（占位，非真实数据）

```json
{
  "ver": 1,
  "ek": "BASE64_RSA_ENCRYPTED_AES_KEY",
  "nonce": "BASE64_12_BYTE_NONCE",
  "tag": "BASE64_16_BYTE_TAG",
  "ct": "BASE64_CIPHERTEXT"
}
```

## 9. 修订记录

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-05-31 | v1 final | 定稿 RSA Base64 JSON 结构。 |
