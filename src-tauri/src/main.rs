#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_opener::OpenerExt;

#[derive(Default)]
struct ExitState {
    ready: AtomicBool,
    approved: AtomicBool,
}

#[tauri::command]
fn desktop_ready(state: tauri::State<ExitState>) {
    state.ready.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn finish_exit(app: tauri::AppHandle, state: tauri::State<ExitState>) {
    state.approved.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn request_exit(app: &tauri::AppHandle) {
    if !app.state::<ExitState>().ready.load(Ordering::SeqCst) {
        app.exit(0);
    } else if let Err(error) = app.emit_to("main", "desktop-exit-requested", ()) {
        eprintln!("无法请求退出：{error}");
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(ExitState::default())
        .invoke_handler(tauri::generate_handler![desktop_ready, finish_exit])
        .setup(|app| {
            use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
            let menu = Menu::with_items(app, &[
                &Submenu::with_items(app, "五笔练习", true, &[
                    &PredefinedMenuItem::about(app, Some("关于五笔练习"), Some(AboutMetadata {
                        name: Some("五笔练习".into()),
                        version: Some(app.package_info().version.to_string()),
                        ..Default::default()
                    }))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, Some("隐藏五笔练习"))?,
                    &PredefinedMenuItem::hide_others(app, Some("隐藏其他应用"))?,
                    &PredefinedMenuItem::show_all(app, Some("显示全部"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "quit", "退出五笔练习", true, Some("CmdOrCtrl+Q"))?,
                ])?,
                &Submenu::with_items(app, "编辑", true, &[
                    &PredefinedMenuItem::undo(app, Some("撤销"))?,
                    &PredefinedMenuItem::redo(app, Some("重做"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, Some("剪切"))?,
                    &PredefinedMenuItem::copy(app, Some("复制"))?,
                    &PredefinedMenuItem::paste(app, Some("粘贴"))?,
                    &PredefinedMenuItem::select_all(app, Some("全选"))?,
                ])?,
                &Submenu::with_items(app, "窗口", true, &[
                    &PredefinedMenuItem::minimize(app, Some("最小化"))?,
                    &PredefinedMenuItem::maximize(app, Some("缩放"))?,
                    &PredefinedMenuItem::fullscreen(app, Some("切换全屏"))?,
                    &MenuItem::with_id(app, "quit-window", "关闭窗口", true, Some("CmdOrCtrl+W"))?,
                ])?,
            ])?;
            app.set_menu(menu)?;
            let navigation_app = app.handle().clone();
            let popup_app = app.handle().clone();
            let window_builder = tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?;
            // Native smoke tests run in a separate identifier/profile. Release binaries
            // contain neither the script loader nor the report navigation endpoint.
            #[cfg(debug_assertions)]
            let window_builder = if let Ok(path) = std::env::var("WUBI_NATIVE_TEST_SCRIPT") {
                window_builder.initialization_script(std::fs::read_to_string(path)?)
            } else { window_builder };
            window_builder
                .on_navigation(move |url| {
                    #[cfg(debug_assertions)]
                    if url.path() == "/__native_test_result" {
                        if let Ok(path) = std::env::var("WUBI_NATIVE_TEST_REPORT") {
                            let report = url.query_pairs().find(|(key, _)| key == "report").map(|(_, value)| value.into_owned()).unwrap_or_default();
                            let _ = std::fs::write(path, report);
                        }
                        return false;
                    }
                    if url.scheme() == "tauri" && url.host_str() == Some("localhost") {
                        return true;
                    }
                    if matches!(url.scheme(), "http" | "https" | "mailto") {
                        let _ = navigation_app.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .on_new_window(move |url, _| {
                    if matches!(url.scheme(), "http" | "https" | "mailto") {
                        let _ = popup_app.opener().open_url(url.as_str(), None::<&str>);
                    }
                    tauri::webview::NewWindowResponse::Deny
                })
                .build()?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if matches!(event.id().as_ref(), "quit" | "quit-window") {
                request_exit(app);
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                request_exit(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("无法启动五笔练习");
    app.run(|app, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            let state = app.state::<ExitState>();
            if state.ready.load(Ordering::SeqCst) && !state.approved.load(Ordering::SeqCst) {
                api.prevent_exit();
                request_exit(app);
            }
        }
    });
}
