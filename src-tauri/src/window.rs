//! 主窗口几何：窗口状态插件的恢复后钳制与首次启动居中。

use tauri::Manager;

/// 启动时把窗口钳制在当前显示器工作区（去除任务栏）内。
///
/// 窗口几何在此调用前已由 window-state 插件恢复（或为 tauri.conf.json 默认值）：
/// 尺寸超限收缩、位置越界回位（显示器被拔掉、分辨率变化、负坐标等），
/// 用户已保存的几何尽量保留；无状态文件的首次启动才按工作区居中。
/// 内置 center() 以整块显示器为基准，任务栏在下方时仍会压入，
/// 故按 work_area 自行计算（与参考实现的成熟做法一致）。
pub(crate) fn fit_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_maximized().unwrap_or(false) {
        return;
    }
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let work_area = monitor.work_area();
    let avail_w = work_area.size.width as f64 / scale;
    let avail_h = work_area.size.height as f64 / scale;

    // 尺寸：恢复值/默认值超出工作区才收缩
    let Ok(size) = window.outer_size() else {
        return;
    };
    let cur_w = size.width as f64 / scale;
    let cur_h = size.height as f64 / scale;
    let width = cur_w.min(avail_w);
    let height = cur_h.min(avail_h);
    if width != cur_w || height != cur_h {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
    }

    // 位置：越界回位（负坐标、压任务栏、被副屏甩出等）
    let win_w = (width * scale).round() as i32;
    let win_h = (height * scale).round() as i32;
    let max_x = (work_area.size.width as i32 - win_w).max(0) + work_area.position.x;
    let max_y = (work_area.size.height as i32 - win_h).max(0) + work_area.position.y;
    let Ok(pos) = window.outer_position() else {
        return;
    };
    let x = pos.x.clamp(work_area.position.x, max_x);
    let y = pos.y.clamp(work_area.position.y, max_y);
    if x != pos.x || y != pos.y {
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        return;
    }

    // 位置在工作区内且无已保存状态（首次启动）：在工作区居中
    let first_run = app
        .path()
        .app_config_dir()
        .ok()
        .is_some_and(|dir| !dir.join(tauri_plugin_window_state::DEFAULT_FILENAME).exists());
    if first_run {
        let _ = window.set_position(tauri::PhysicalPosition::new(
            work_area.position.x
                + ((work_area.size.width as f64 - width * scale) / 2.0).round() as i32,
            work_area.position.y
                + ((work_area.size.height as f64 - height * scale) / 2.0).round() as i32,
        ));
    }
}
