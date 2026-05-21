use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};

const SKIPPED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    "vendor",
];

#[derive(Debug, Clone)]
pub struct DiscoveredRepository {
    pub repo_path: String,
    pub relative_path: String,
    pub suggested_name: String,
}

pub fn discover_repositories(root_path: &str) -> Result<Vec<DiscoveredRepository>, String> {
    let root = Path::new(root_path);
    if !root.exists() || !root.is_dir() {
        return Err("Workspace root folder does not exist.".to_string());
    }

    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Failed to read workspace root: {error}"))?;

    let mut repositories = Vec::new();
    let mut queue = VecDeque::from([(canonical_root.clone(), 0usize)]);

    while let Some((path, depth)) = queue.pop_front() {
        if path.join(".git").exists() {
            repositories.push(repo_from_path(&canonical_root, &path));
        }

        if depth >= 2 {
            continue;
        }

        let entries = match fs::read_dir(&path) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let child = entry.path();
            if !child.is_dir() || should_skip(&child) {
                continue;
            }
            queue.push_back((child, depth + 1));
        }
    }

    repositories.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(repositories)
}

fn repo_from_path(root: &Path, path: &Path) -> DiscoveredRepository {
    let relative_path = path
        .strip_prefix(root)
        .ok()
        .filter(|relative| !relative.as_os_str().is_empty())
        .map(format_path)
        .unwrap_or_else(|| ".".to_string());

    let suggested_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "Workspace Root".to_string());

    DiscoveredRepository {
        repo_path: format_path(path),
        relative_path,
        suggested_name,
    }
}

fn should_skip(path: &PathBuf) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            SKIPPED_DIRS
                .iter()
                .any(|skipped| skipped.eq_ignore_ascii_case(name))
        })
        .unwrap_or(false)
}

fn format_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn finds_root_child_and_grandchild_repos() {
        let root = temp_path();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::create_dir_all(root.join("api").join(".git")).unwrap();
        fs::create_dir_all(root.join("client").join("web").join(".git")).unwrap();

        let repos = discover_repositories(root.to_str().unwrap()).unwrap();
        let relatives: Vec<_> = repos.into_iter().map(|repo| repo.relative_path).collect();

        assert!(relatives.contains(&".".to_string()));
        assert!(relatives.contains(&"api".to_string()));
        assert!(relatives.contains(&format!("client{}web", std::path::MAIN_SEPARATOR)));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn skips_noisy_folders() {
        let root = temp_path();
        fs::create_dir_all(root.join("node_modules").join("package").join(".git")).unwrap();
        fs::create_dir_all(root.join("target").join("generated").join(".git")).unwrap();
        fs::create_dir_all(root.join("real").join(".git")).unwrap();

        let repos = discover_repositories(root.to_str().unwrap()).unwrap();

        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].relative_path, "real");

        fs::remove_dir_all(root).ok();
    }

    fn temp_path() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("worktrace-workspace-test-{suffix}"))
    }
}
