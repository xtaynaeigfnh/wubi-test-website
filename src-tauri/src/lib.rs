#[cfg(desktop)]
mod desktop;

use tauri_plugin_opener::OpenerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init());
    #[cfg(desktop)]
    let builder = desktop::configure(builder);
    let app = builder
        .setup(|app| {
            #[cfg(desktop)]
            desktop::setup(app)?;
            let navigation_app = app.handle().clone();
            #[cfg(desktop)]
            let popup_app = app.handle().clone();
            let window_builder =
                tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?;
            // Native smoke tests run in a separate identifier/profile. Release binaries
            // contain neither the script loader nor the report navigation endpoint.
            #[cfg(all(desktop, debug_assertions))]
            let window_builder = if let Ok(path) = std::env::var("WUBI_NATIVE_TEST_SCRIPT") {
                window_builder.initialization_script(std::fs::read_to_string(path)?)
            } else {
                window_builder
            };
            let window_builder = window_builder.on_navigation(move |url| {
                #[cfg(all(desktop, debug_assertions))]
                if url.path() == "/__native_test_result" {
                    if let Ok(path) = std::env::var("WUBI_NATIVE_TEST_REPORT") {
                        let report = url
                            .query_pairs()
                            .find(|(key, _)| key == "report")
                            .map(|(_, value)| value.into_owned())
                            .unwrap_or_default();
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
            });
            #[cfg(desktop)]
            let window_builder = window_builder.on_new_window(move |url, _| {
                if matches!(url.scheme(), "http" | "https" | "mailto") {
                    let _ = popup_app.opener().open_url(url.as_str(), None::<&str>);
                }
                tauri::webview::NewWindowResponse::Deny
            });
            window_builder.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("无法启动五笔练习");
    #[cfg(desktop)]
    app.run(desktop::on_event);
    #[cfg(mobile)]
    app.run(|_, _| {});
}
