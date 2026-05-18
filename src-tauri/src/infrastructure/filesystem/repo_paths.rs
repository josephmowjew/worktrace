use std::path::Path;

pub fn looks_like_git_repository(path: &str) -> bool {
    Path::new(path).join(".git").exists()
}
