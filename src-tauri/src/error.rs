use std::fmt;

use serde::Serialize;

/// 应用统一错误：`code` 为稳定错误码（沿用原版 `ErrorXxx` 命名），
/// 由前端映射为本地化文案；后端不返回堆栈等内部信息。
/// `detail` 为可选补充信息（如冲突文件名），序列化时缺省不出现。
#[derive(Debug)]
pub struct AppError {
    pub code: String,
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
            detail: None,
        }
    }

    pub fn with_detail(code: &str, detail: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            detail: Some(detail.into()),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.code)
    }
}

impl std::error::Error for AppError {}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        #[derive(Serialize)]
        struct Wire<'a> {
            code: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            detail: Option<&'a str>,
        }
        Wire {
            code: &self.code,
            detail: self.detail.as_deref(),
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// 内部实现错误（不应出现在正常流程中）。
pub fn internal_error() -> AppError {
    AppError::new("ErrorInternal")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_shows_stable_code() {
        assert_eq!(
            AppError::new("ErrorPasswordRequired").to_string(),
            "ErrorPasswordRequired"
        );
    }

    #[test]
    fn serializes_to_code_wire_format() {
        // 前端从 invoke rejection 中读取 { code } 字段，序列化形状是对外契约。
        assert_eq!(
            serde_json::to_string(&AppError::new("ErrorPasswordRequired")).unwrap(),
            r#"{"code":"ErrorPasswordRequired"}"#
        );
    }

    #[test]
    fn detail_serializes_only_when_present() {
        assert_eq!(
            serde_json::to_string(&AppError::with_detail(
                "ErrorExportFileExists",
                "alias.pub"
            ))
            .unwrap(),
            r#"{"code":"ErrorExportFileExists","detail":"alias.pub"}"#
        );
    }

    #[test]
    fn internal_error_uses_internal_code() {
        assert_eq!(internal_error().code, "ErrorInternal");
    }
}
