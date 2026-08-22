pub mod auth;
pub mod branch;
pub mod error;
pub mod remote;
pub mod repository;
pub mod status;

pub use auth::KeyringManager;
pub use branch::{BranchItem, StashItem, TagItem};
pub use error::{GitbxError, Result};
pub use remote::RemoteItem;
pub use repository::{CommitDetail, Repository, RepositoryInfo};
pub use status::{FileDeltaStatus, FileStatusItem, RepoStatusSummary};

pub fn open_repo<P: AsRef<std::path::Path>>(path: P) -> Result<Repository> {
    Repository::open(path)
}

pub fn init_repo<P: AsRef<std::path::Path>>(path: P, bare: bool) -> Result<Repository> {
    Repository::init(path, bare)
}
