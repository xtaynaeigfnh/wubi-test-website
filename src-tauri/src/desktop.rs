use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

#[derive(Default)]
pub(crate) struct ExitState {
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

#[cfg(target_os = "macos")]
pub(crate) fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
    let menu = Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                "五笔练习",
                true,
                &[
                    &PredefinedMenuItem::about(
                        app,
                        Some("关于五笔练习"),
                        Some(AboutMetadata {
                            name: Some("五笔练习".into()),
                            version: Some(app.package_info().version.to_string()),
                            ..Default::default()
                        }),
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, Some("隐藏五笔练习"))?,
                    &PredefinedMenuItem::hide_others(app, Some("隐藏其他应用"))?,
                    &PredefinedMenuItem::show_all(app, Some("显示全部"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "quit", "退出五笔练习", true, Some("CmdOrCtrl+Q"))?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "编辑",
                true,
                &[
                    &PredefinedMenuItem::undo(app, Some("撤销"))?,
                    &PredefinedMenuItem::redo(app, Some("重做"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, Some("剪切"))?,
                    &PredefinedMenuItem::copy(app, Some("复制"))?,
                    &PredefinedMenuItem::paste(app, Some("粘贴"))?,
                    &PredefinedMenuItem::select_all(app, Some("全选"))?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "窗口",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, Some("最小化"))?,
                    &PredefinedMenuItem::maximize(app, Some("缩放"))?,
                    &PredefinedMenuItem::fullscreen(app, Some("切换全屏"))?,
                    &MenuItem::with_id(app, "quit-window", "关闭窗口", true, Some("CmdOrCtrl+W"))?,
                ],
            )?,
        ],
    )?;
    app.set_menu(menu)?;
    Ok(())
}
pub(crate) fn configure(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(ExitState::default())
        .invoke_handler(tauri::generate_handler![desktop_ready, finish_exit])
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
}

pub(crate) fn on_event(app: &tauri::AppHandle, event: RunEvent) {
    if let RunEvent::ExitRequested { api, .. } = event {
        let state = app.state::<ExitState>();
        if state.ready.load(Ordering::SeqCst) && !state.approved.load(Ordering::SeqCst) {
            api.prevent_exit();
            request_exit(app);
        }
    }
}
