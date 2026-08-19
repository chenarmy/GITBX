// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{ai, diff, graph, repo};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            repo::get_repo_info,
            repo::get_repo_status,
            repo::list_branches,
            repo::stage_file,
            repo::unstage_file,
            repo::stage_all,
            repo::create_commit,
            repo::checkout_branch,
            repo::create_branch,
            repo::list_tags,
            repo::list_stashes,
            diff::get_file_diff,
            diff::parse_conflicts,
            graph::get_commit_graph,
            ai::generate_commit_message,
            ai::scan_secrets,
            ai::analyze_conflict,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GITBX desktop application");
}
