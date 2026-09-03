pub mod auth;
pub mod branch;
pub mod error;
pub mod path;
mod process;
pub mod proxy;
pub mod remote;
pub mod repository;
pub mod service;
pub mod ssh;
pub mod status;

pub use auth::KeyringManager;
pub use branch::{BranchItem, StashItem, TagItem};
pub use error::{GitbxError, Result};
pub use path::path_for_display;
pub use proxy::{proxy_options, set_proxy_config, ProxyConfig, ProxyMode};
pub use remote::RemoteItem;
pub use repository::{BlameLine, CommitDetail, Repository, RepositoryInfo};
pub use service::GitService;
pub use service::{LocalHistoryEntry, RebaseCommit, RebasePlanItem, SyncStatus, WorktreeInfo};
pub use ssh::{save_ssh_key_passphrase, set_global_ssh_key};
pub use status::{FileDeltaStatus, FileStatusItem, RepoStatusSummary};

pub fn open_repo<P: AsRef<std::path::Path>>(path: P) -> Result<Repository> {
    Repository::open(path)
}

pub fn init_repo<P: AsRef<std::path::Path>>(path: P, bare: bool) -> Result<Repository> {
    Repository::init(path, bare)
}
