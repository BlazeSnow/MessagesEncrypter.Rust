# references — 参考文档（原版现状 + 重构版实现记录）

本目录包含两部分：MessagesEncrypter 原 WinUI 3 版本的现状（功能、协议、数据格式、交互、发布），作为 Tauri 2 重构版的功能与兼容性参照；以及重构版的实现记录与决策（[implementation.md](./implementation.md)）。

- 资料来源：原 WinUI 3 版本源码与官方文档站 <https://messages.blazesnow.com/>。
- 文中出现的文件路径均为原项目内的相对路径，不指向本机任何绝对位置。
- 这些文档描述的是**原版行为**；重构版与之偏离时，应在对应文档追加「Tauri 2 迁移注意」小节并在 `DEVELOPMENT.md` 开发日志记录决策，而不是直接删改兼容性事实。

## 索引

| 文档 | 内容 | 重构关注度 |
| --- | --- | --- |
| [protocol-v1.md](./protocol-v1.md) | 密文包格式 v1 规范、实现级校验顺序、错误码、安全约定 | 必须逐字节兼容 |
| [key-management.md](./key-management.md) | RSA 密钥生成、指纹、PEM/PBE 参数、导入导出、改密 | 数据必须互通 |
| [storage.md](./storage.md) | keys.db 结构、版本迁移、完整性签名、凭据与设置 | 旧数据迁移必读 |
| [ui-pages.md](./ui-pages.md) | 6 个页面的功能、交互与边界处理 | UI 功能对齐参照 |
| [product-spec.md](./product-spec.md) | 产品定位红线、快速开始流程、FAQ、V2/文件加密方向 | 承诺不变项 |
| [i18n.md](./i18n.md) | 双语组织、键命名规律、一致性校验规则 | 规范沿用 |
| [testing-checklist.md](./testing-checklist.md) | 原版测试覆盖清单 + 重构兼容验收清单 | 测试设计参照 |
| [release.md](./release.md) | MSIX/Store 发布、版本号规则、产品身份 | 发布流程参照 |
| [implementation.md](./implementation.md) | **Tauri 2 实现记录与决策**（架构、数据、决策日志、环境备忘） | 重构版细节 |

## 重构总原则（速览）

1. **密文格式 v1 不可变更**：字段名、算法、参数、校验顺序、错误语义以 [protocol-v1.md](./protocol-v1.md) 为准；「同一 `ver` 的字段语义保持兼容」是公开承诺。
2. **用户数据必须可迁移**：旧版 `keys.db` / `keys.json`、导出的 `.pub` / `.pem`、记住的密码条目都要能被重构版读取；指纹算法不可变，否则已保存的选中指纹、按指纹索引的密码条目全部失配。
3. **产品承诺不变**：本地工具、无服务器；不是即时通讯；不兼容 PGP；文件加密与协议 v2 未定稿前不承诺。
4. **用户可见文本零硬编码**：前端 i18next、后端 fluent-i18n（详见 [i18n.md](./i18n.md) 与根目录 `DEVELOPMENT.md`）。
