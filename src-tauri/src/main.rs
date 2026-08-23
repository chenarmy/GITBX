// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{ai, auth, config, diff, graph, repo, terminal, update};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            auth::save_credential,
            auth::get_credential,
            auth::delete_credential,
            config::load_app_config,
            config::save_app_config,
            config::get_app_config_path,
            update::open_release_url,
            repo::get_repo_info,
            repo::init_repo,
            repo::clone_repo,
            repo::get_repo_status,
            repo::list_branches,
            repo::list_remotes,
            repo::set_remote_url,
            repo::stage_file,
            repo::unstage_file,
            repo::stage_all,
            repo::unstage_all,
            repo::discard_file,
            repo::create_commit,
            repo::checkout_branch,
            repo::create_branch,
            repo::delete_branch,
            repo::rename_branch,
            repo::list_tags,
            repo::create_tag,
            repo::list_stashes,
            repo::create_stash,
            repo::pop_stash,
            repo::reset,
            repo::merge,
            repo::merge_abort,
            repo::merge_continue,
            repo::cherry_pick,
            repo::cherry_pick_continue,
            repo::revert,
            repo::revert_continue,
            repo::get_commit_changes,
            repo::fetch_remote,
            repo::pull,
            repo::push,
            repo::rebase,
            repo::rebase_continue,
            repo::operation_abort,
            repo::worktree_add,
            terminal::open_system_terminal,
            diff::get_file_diff,
            diff::read_file,
            diff::write_file,
            diff::parse_conflicts,
            diff::get_conflict_file,
            diff::resolve_conflict,
            graph::get_commit_graph,
            ai::generate_commit_message,
            ai::scan_secrets,
            ai::analyze_conflict,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GITBX desktop application");
}
